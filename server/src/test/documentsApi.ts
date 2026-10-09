import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../auth/password';
import { closePool, getPool } from '../db/pool';

/**
 * Integration/API test Phase 2E-2: Endpoint Lampiran Dokumen — BUKAN fitur produksi.
 *
 * Cara pakai:
 *   1. Start server dengan STORAGE_DIR folder sementara (default .env boleh),
 *      opsi: DOCS_TEST_BASE_URL (default http://127.0.0.1:3001),
 *      dan export STORAGE_DIR yang SAMA dengan server untuk cek file di disk.
 *   2. npm run test:documents   (opsional: RBAC_ADMIN_PASSWORD)
 *
 * Cakupan (sesuai tugas 2E-2):
 *   - upload valid (PDF/JPG/PNG), preview inline, download attachment
 *   - penghapusan soft-delete + file fisik dipertahankan
 *   - file/dokumen/surat tidak ditemukan → 404
 *   - MIME palsu (teks bawaan application/pdf) → 400
 *   - signature tidak valid → 400; ekstensi beda dengan isi → 400
 *   - file kosong → 400; file > 5 MB → 413
 *   - field salah / tanpa file → 400; kegagalan tidak meninggalkan file yatim
 *   - autentikasi 401 (tanpa login), otorisasi 403 (pimpinan tak boleh
 *     upload/hapus), dan akses lintas surat (list terpisah, surat terhapus
 *     → semua akses lampirannya 404)
 *   - respons tidak membocorkan path penyimpanan/stored_filename
 *
 * Fixture: user petugas/pimpinan (+ admin bila tanpa password env) dibuat
 * SEMENTARA dengan password acak di memori, dihapus pada blok finally.
 * Data uji memakai prefix 'TEST-2E2-' (nomor surat DAN nama file) dan
 * dibersihkan juga. File disk test dihapus sebelum baris DB (FK RESTRICT).
 * Password tidak pernah dicetak/ditulis ke file.
 */

const BASE = process.env.DOCS_TEST_BASE_URL ?? 'http://127.0.0.1:3001';
const PREFIX = 'TEST-2E2-';
/** Sama dengan env server — bila kosong, cek file disk dilewati. */
const STORAGE_DIR = process.env.STORAGE_DIR ?? '';

const FIXTURES = [
  { username: 'docs-tmp-petugas', role: 'petugas' },
  { username: 'docs-tmp-pimpinan', role: 'pimpinan' },
] as const;
const TMP_ADMIN = { username: 'docs-tmp-admin', role: 'admin' } as const;

const SAFE_401 = 'Belum login.';
const SAFE_403 = 'Anda tidak memiliki hak akses untuk melakukan tindakan ini.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Helper HTTP
// ---------------------------------------------------------------------------

interface ApiResult {
  status: number;
  headers: Headers;
  raw: string;
  bytes: Uint8Array;
  body: unknown;
}

interface CallOptions {
  cookie?: string;
  method?: string;
  payload?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
}

async function callApi(pathname: string, options: CallOptions = {}): Promise<ApiResult> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookie) headers.cookie = options.cookie;
  const method = options.method ?? 'GET';
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData; // content-type multipart dibuat fetch (boundary acak)
  } else if (options.payload !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.payload);
  }

  const res = await fetch(`${BASE}${pathname}`, { method, headers, body });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // biarkan sebagai teks bila bukan JSON (mis. byte file)
  }
  return { status: res.status, headers: res.headers, raw, bytes, body: parsed };
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const raw = await res.text();
  if (res.status !== 200) {
    throw new Error(`Login "${username}" gagal (HTTP ${res.status}).`);
  }
  const match = /siarsip\.sid=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!match) {
    throw new Error(`Login "${username}": cookie session tidak diberikan.`);
  }
  return `siarsip.sid=${match[1]}`; // nilai session tidak pernah dicetak
}

/**
 * Upload multipart ke /api/surat-masuk/:id/documents.
 * field = 'file' (kontrak API) kecuali diuji salah sengaja.
 */
async function uploadFile(
  cookie: string | undefined,
  suratId: number | string,
  filename: string,
  bytes: Buffer,
  opts: { mime?: string; field?: string } = {},
): Promise<ApiResult> {
  const fd = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], { type: opts.mime ?? 'application/octet-stream' });
  fd.append(opts.field ?? 'file', blob, filename);
  return callApi(`/api/surat-masuk/${suratId}/documents`, { method: 'POST', cookie, formData: fd });
}

function obj(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

function dataRow(body: unknown): Record<string, unknown> {
  return obj(obj(body).data);
}

function dataList(body: unknown): unknown[] {
  const d = obj(body).data;
  return Array.isArray(d) ? d : [];
}

// ---------------------------------------------------------------------------
// Konten file uji (magic bytes asli / sengaja rusak)
// ---------------------------------------------------------------------------

function pdfBytes(marker = 'uji'): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n${marker}\n`, 'latin1');
}

function pngBytes(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, randomBytes(64)]);
}

function jpegBytes(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
}

function textBytes(): Buffer {
  return Buffer.from('Ini file teks biasa, bukan PDF/Gambar. Digunakan untuk uji MIME palsu.\n', 'utf8');
}

function bigPdfBytes(size: number): Buffer {
  const buf = Buffer.alloc(size, 0x20); // spasi — magic %PDF- tetap di awal
  Buffer.from('%PDF-1.4\n', 'latin1').copy(buf, 0);
  return buf;
}

// ---------------------------------------------------------------------------
// Bantuan disk / DB
// ---------------------------------------------------------------------------

function storageChecked(): boolean {
  return STORAGE_DIR !== '' && existsSync(STORAGE_DIR);
}

function listStorageFiles(): string[] {
  if (!storageChecked()) return [];
  return readdirSync(STORAGE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

async function storedNameOf(docId: number): Promise<string | null> {
  const pool = getPool();
  const r = await pool.query<{ stored_filename: string }>('SELECT stored_filename FROM documents WHERE id = $1', [docId]);
  return r.rows[0]?.stored_filename ?? null;
}

/** Hapus semua file + baris dokumen test (dipakai pre-clean & finally). */
async function purgeTestDocuments(): Promise<void> {
  const pool = getPool();
  const r = await pool.query<{ stored_filename: string }>(
    'SELECT stored_filename FROM documents WHERE original_filename LIKE $1',
    [`${PREFIX}%`],
  );
  if (storageChecked()) {
    for (const row of r.rows) {
      try {
        unlinkSync(path.join(STORAGE_DIR, row.stored_filename));
      } catch {
        // file mungkin sudah tidak ada
      }
    }
  }
  await pool.query('DELETE FROM documents WHERE original_filename LIKE $1', [`${PREFIX}%`]);
}

function sampleSurat(nomor: string): Record<string, unknown> {
  return {
    nomor_surat: nomor,
    tanggal_surat: '2026-03-01',
    tanggal_diterima: '2026-03-05',
    asal_instansi: 'Instansi Uji Phase 2E-2',
    perihal: 'Uji integrasi endpoint lampiran dokumen',
    jenis_surat: 'Undangan',
    sifat_surat: 'Biasa',
    penandatangan: 'Kepala Instansi Uji',
    keterangan: 'data test otomatis',
  };
}

async function createFixtureUser(
  pool: ReturnType<typeof getPool>,
  username: string,
  role: string,
  fullName: string,
): Promise<string> {
  const password = randomBytes(18).toString('base64url');
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
     SELECT id, $1, $2, $3, TRUE FROM roles WHERE name = $4`,
    [username, passwordHash, fullName, role],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Gagal membuat fixture user "${username}" (role ${role}).`);
  }
  return password;
}

async function createSurat(cookie: string, nomor: string): Promise<number> {
  const res = await callApi('/api/surat-masuk', { method: 'POST', cookie, payload: sampleSurat(nomor) });
  if (res.status !== 201) {
    throw new Error(`Gagal membuat surat "${nomor}" (HTTP ${res.status}).`);
  }
  return Number(dataRow(res.body).id);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const health = await callApi('/api/health');
  check('server aktif: GET /api/health = 200', health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    console.error(`[2e2-test] Server tidak aktif di ${BASE}.`);
    process.exitCode = 1;
    return;
  }

  if (STORAGE_DIR === '') {
    console.log('catatan: STORAGE_DIR kosong di env test — cek file di disk DILEWATI.');
  } else if (!existsSync(STORAGE_DIR)) {
    console.log('catatan: STORAGE_DIR belum ada di env test — cek file di disk DILEWATI.');
  }

  // ---- A. Unauthenticated (sebelum fixture) ----
  const anonUpload = await uploadFile(undefined, 1, `${PREFIX}anon.pdf`, pdfBytes('anon'));
  check('A1. upload tanpa login = 401', anonUpload.status === 401, `status=${anonUpload.status}`);
  check('A1. pesan 401 aman', anonUpload.raw.includes(SAFE_401));

  const anonList = await callApi('/api/surat-masuk/1/documents');
  check('A2. GET daftar tanpa login = 401', anonList.status === 401, `status=${anonList.status}`);

  const anonContent = await callApi('/api/documents/1/content');
  check('A3. GET content tanpa login = 401', anonContent.status === 401, `status=${anonContent.status}`);

  const anonDownload = await callApi('/api/documents/1/download');
  check('A4. GET download tanpa login = 401', anonDownload.status === 401, `status=${anonDownload.status}`);

  const anonDelete = await callApi('/api/documents/1', { method: 'DELETE' });
  check('A5. DELETE tanpa login = 401', anonDelete.status === 401, `status=${anonDelete.status}`);

  const pool = getPool();
  const cookies = new Map<string, string>();
  const passwords = new Map<string, string>();
  const usersAtStart = Number(
    (await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM users')).rows[0]?.n ?? '0',
  );

  try {
    // ---- Pre-clean (idempoten bila run sebelumnya gagal) ----
    await purgeTestDocuments();
    await pool.query('DELETE FROM surat_masuk WHERE nomor_surat LIKE $1', [`${PREFIX}%`]);
    for (const u of [...FIXTURES, TMP_ADMIN]) {
      await pool.query('DELETE FROM users WHERE username = $1', [u.username]);
    }

    // ---- Fixture users (sementara) ----
    passwords.set('docs-tmp-petugas', await createFixtureUser(pool, 'docs-tmp-petugas', 'petugas', 'Dokumen Test petugas'));
    passwords.set('docs-tmp-pimpinan', await createFixtureUser(pool, 'docs-tmp-pimpinan', 'pimpinan', 'Dokumen Test pimpinan'));

    const adminPassword = process.env.RBAC_ADMIN_PASSWORD || undefined;
    let adminUsername: string;
    if (adminPassword) {
      adminUsername = 'admin';
    } else {
      adminUsername = TMP_ADMIN.username;
      passwords.set(TMP_ADMIN.username, await createFixtureUser(pool, TMP_ADMIN.username, 'admin', 'Dokumen Test admin'));
    }

    // ---- Login (3 percobaan — aman dari rate limit 10/15 menit) ----
    const cAdmin = await login(adminUsername, adminPassword ?? passwords.get(TMP_ADMIN.username) ?? '');
    const cPetugas = await login('docs-tmp-petugas', passwords.get('docs-tmp-petugas') ?? '');
    const cPimpinan = await login('docs-tmp-pimpinan', passwords.get('docs-tmp-pimpinan') ?? '');
    cookies.set('admin', cAdmin);
    cookies.set('docs-tmp-petugas', cPetugas);
    cookies.set('docs-tmp-pimpinan', cPimpinan);

    const meAdmin = await callApi('/api/auth/me', { cookie: cAdmin });
    const mePetugas = await callApi('/api/auth/me', { cookie: cPetugas });
    const mePimpinan = await callApi('/api/auth/me', { cookie: cPimpinan });
    const adminId = Number(obj(obj(meAdmin.body).user).id);
    const petugasId = Number(obj(obj(mePetugas.body).user).id);
    check('login admin/petugas/pimpinan = 200', meAdmin.status === 200 && mePetugas.status === 200 && mePimpinan.status === 200);

    const idA = await createSurat(cAdmin, `${PREFIX}A`);
    const idB = await createSurat(cAdmin, `${PREFIX}B`);
    check('fixture: surat A & B dibuat', Number.isSafeInteger(idA) && Number.isSafeInteger(idB), `A=${idA}, B=${idB}`);

    // ---- B. Upload valid ----
    const pdfBytesIn = pdfBytes('valid');
    const upPdf = await uploadFile(cAdmin, idA, `${PREFIX}berkas.pdf`, pdfBytesIn, { mime: 'application/octet-stream' });
    check('B1. upload PDF valid = 201', upPdf.status === 201, `status=${upPdf.status}`);
    const docPdf = dataRow(upPdf.body);
    const idDocPdf = Number(docPdf.id);
    check(
      'B1. metadata sesuai (mime/size/nama/surat/uploaded_by)',
      docPdf.mime_type === 'application/pdf' &&
        Number(docPdf.file_size) === pdfBytesIn.length &&
        docPdf.original_filename === `${PREFIX}berkas.pdf` &&
        Number(docPdf.surat_masuk_id) === idA &&
        docPdf.surat_keluar_id === null &&
        Number(docPdf.uploaded_by) === adminId,
      `mime=${String(docPdf.mime_type)}, size=${String(docPdf.file_size)}`,
    );
    check(
      'B1. respons TIDAK membocorkan stored_filename/storage_path/path storage',
      !upPdf.raw.includes('stored_filename') &&
        !upPdf.raw.includes('storage_path') &&
        (STORAGE_DIR === '' || !upPdf.raw.includes(STORAGE_DIR)),
    );

    const upPng = await uploadFile(cAdmin, idA, `${PREFIX}logo.png`, pngBytes(), { mime: 'image/png' });
    check('B2. upload PNG valid = 201 (mime dari magic bytes)', upPng.status === 201 && dataRow(upPng.body).mime_type === 'image/png', `status=${upPng.status}`);

    const upJpg = await uploadFile(cAdmin, idA, `${PREFIX}foto.jpg`, jpegBytes(), { mime: 'image/jpeg' });
    check('B3. upload JPG valid = 201 (mime dari magic bytes)', upJpg.status === 201 && dataRow(upJpg.body).mime_type === 'image/jpeg', `status=${upJpg.status}`);

    // Nama file di disk: UUID milik server, bukan nama asli pengguna.
    const storedName = Number.isSafeInteger(idDocPdf) && idDocPdf > 0 ? await storedNameOf(idDocPdf) : null;
    check(
      'B4. nama file di DB = UUID server (bukan nama asli)',
      storedName !== null && UUID_RE.test(storedName) && storedName !== `${PREFIX}berkas.pdf`,
      `stored=${storedName ?? 'null'}`,
    );
    if (storageChecked() && storedName !== null) {
      check('B4. file fisik ADA di STORAGE_DIR', existsSync(path.join(STORAGE_DIR, storedName)));
    }
    check('B4. metadata tidak memuat nama file di disk', !('stored_filename' in docPdf) && !('storage_path' in docPdf));

    // ---- C. Preview & Download ----
    const previewPdf = await callApi(`/api/documents/${idDocPdf}/content`, { cookie: cAdmin });
    check('C1. preview PDF = 200', previewPdf.status === 200, `status=${previewPdf.status}`);
    check(
      'C1. header preview: mime DB + nosniff + inline + no-store',
      (previewPdf.headers.get('content-type') ?? '').startsWith('application/pdf') &&
        previewPdf.headers.get('x-content-type-options') === 'nosniff' &&
        (previewPdf.headers.get('content-disposition') ?? '').startsWith('inline') &&
        (previewPdf.headers.get('cache-control') ?? '').includes('no-store'),
      `ct=${previewPdf.headers.get('content-type')}, disp=${previewPdf.headers.get('content-disposition')}`,
    );
    check(
      'C1. isi preview identik dengan file yang diunggah',
      Buffer.from(previewPdf.bytes).equals(pdfBytesIn),
    );
    check(
      'C1. nama file aman di header (ada filename, tanpa path)',
      (previewPdf.headers.get('content-disposition') ?? '').includes(`filename="${PREFIX}berkas.pdf"`),
    );

    const downPdf = await callApi(`/api/documents/${idDocPdf}/download`, { cookie: cPetugas });
    check('C2. download PDF (petugas) = 200', downPdf.status === 200, `status=${downPdf.status}`);
    check(
      'C2. download = attachment + isi identik',
      (downPdf.headers.get('content-disposition') ?? '').startsWith('attachment') && Buffer.from(downPdf.bytes).equals(pdfBytesIn),
      `disp=${downPdf.headers.get('content-disposition')}`,
    );

    const idDocPng = Number(dataRow(upPng.body).id);
    const previewPng = await callApi(`/api/documents/${idDocPng}/content`, { cookie: cPimpinan });
    check('C3. preview PNG (pimpinan) = 200 dengan mime image/png', previewPng.status === 200 && (previewPng.headers.get('content-type') ?? '').startsWith('image/png'), `status=${previewPng.status}`);

    // ---- D. Daftar metadata + isolasi lintas surat ----
    const listA = await callApi(`/api/surat-masuk/${idA}/documents`, { cookie: cAdmin });
    check('D1. daftar dokumen surat A = 200 berisi 3', listA.status === 200 && dataList(listA.body).length === 3, `n=${dataList(listA.body).length}, status=${listA.status}`);
    check('D1. daftar tanpa field path di disk', !listA.raw.includes('stored_filename') && !listA.raw.includes('storage_path'));

    const listB = await callApi(`/api/surat-masuk/${idB}/documents`, { cookie: cAdmin });
    check('D2. daftar surat B kosong (dokumen A tidak bocor)', listB.status === 200 && dataList(listB.body).length === 0, `n=${dataList(listB.body).length}`);

    // ---- E. Validasi upload gagal (tanpa file yatim) ----
    const filesBeforeFailures = listStorageFiles().length;

    const fakeMime = await uploadFile(cAdmin, idA, `${PREFIX}palsu.pdf`, textBytes(), { mime: 'application/pdf' });
    check('E1. MIME palsu (teks + declared application/pdf) = 400', fakeMime.status === 400 && fakeMime.raw.includes('tidak dikenal'), `status=${fakeMime.status}`);

    const badSig = await uploadFile(cAdmin, idA, `${PREFIX}rusak.pdf`, Buffer.from('XXPDF-1.4 bukan signature asli', 'latin1'));
    check('E2. signature tidak valid = 400', badSig.status === 400 && badSig.raw.includes('tidak dikenal'), `status=${badSig.status}`);

    const extMismatch = await uploadFile(cAdmin, idA, `${PREFIX}salah.pdf`, pngBytes());
    check('E3. ekstensi .pdf berisi PNG = 400 (konsistensi isi)', extMismatch.status === 400 && extMismatch.raw.includes('tidak sesuai'), `status=${extMismatch.status}`);

    const emptyFile = await uploadFile(cAdmin, idA, `${PREFIX}kosong.pdf`, Buffer.alloc(0));
    check('E4. file kosong = 400', emptyFile.status === 400 && emptyFile.raw.toLowerCase().includes('kosong'), `status=${emptyFile.status}`);

    const tooBig = await uploadFile(cAdmin, idA, `${PREFIX}besar.pdf`, bigPdfBytes(5 * 1024 * 1024 + 8192));
    check('E5. file > 5 MB = 413 dengan pesan batas', tooBig.status === 413 && tooBig.raw.includes('melebihi batas'), `status=${tooBig.status}, raw=${tooBig.raw.slice(0, 120)}`);

    const noFileFd = new FormData();
    noFileFd.append('keterangan', 'tanpa file');
    const noFile = await callApi(`/api/surat-masuk/${idA}/documents`, { method: 'POST', cookie: cAdmin, formData: noFileFd });
    check('E6. multipart tanpa file = 400', noFile.status === 400 && noFile.raw.includes('File wajib'), `status=${noFile.status}`);

    const wrongField = await uploadFile(cAdmin, idA, `${PREFIX}salah-field.pdf`, pdfBytes('x'), { field: 'berkas' });
    check('E7. nama field salah = 400', wrongField.status === 400 && wrongField.raw.includes('field'), `status=${wrongField.status}, raw=${wrongField.raw.slice(0, 120)}`);

    const filesAfterFailures = listStorageFiles().length;
    check(
      'E8. kegagalan validasi tidak meninggalkan file sementara/yatim',
      filesAfterFailures === filesBeforeFailures,
      `sebelum=${filesBeforeFailures}, sesudah=${filesAfterFailures}`,
    );
    const listAfterFail = await callApi(`/api/surat-masuk/${idA}/documents`, { cookie: cAdmin });
    check('E8. jumlah metadata dokumen tetap 3 (tidak ada baris yatim)', dataList(listAfterFail.body).length === 3, `n=${dataList(listAfterFail.body).length}`);

    // ---- F. Otorisasi (role) ----
    const pUpload = await uploadFile(cPimpinan, idA, `${PREFIX}pimpinan.pdf`, pdfBytes('pimpinan'));
    check('F1. pimpinan upload = 403 dengan pesan aman', pUpload.status === 403 && pUpload.raw.includes(SAFE_403), `status=${pUpload.status}`);

    const pDelete = await callApi(`/api/documents/${idDocPdf}`, { method: 'DELETE', cookie: cPimpinan });
    check('F2. pimpinan DELETE = 403', pDelete.status === 403, `status=${pDelete.status}`);
    const stillThere = await callApi(`/api/documents/${idDocPdf}/content`, { cookie: cAdmin });
    check('F2. dokumen tetap bisa diakses setelah 403', stillThere.status === 200, `status=${stillThere.status}`);

    const pList = await callApi(`/api/surat-masuk/${idA}/documents`, { cookie: cPimpinan });
    check('F3. pimpinan daftar/preview/download = 200', pList.status === 200 && dataList(pList.body).length === 3);

    const upPetugas = await uploadFile(cPetugas, idA, `${PREFIX}petugas.pdf`, pdfBytes('petugas'));
    check('F4. petugas upload = 201', upPetugas.status === 201, `status=${upPetugas.status}`);
    check('F4. uploaded_by = petugas (dari session)', Number(dataRow(upPetugas.body).uploaded_by) === petugasId);
    const idDocPetugas = Number(dataRow(upPetugas.body).id);

    // ---- G. Penghapusan (soft delete, file dipertahankan) ----
    const del1 = await callApi(`/api/documents/${idDocPetugas}`, { method: 'DELETE', cookie: cPetugas });
    check('G1. petugas DELETE = 200', del1.status === 200 && del1.raw.includes('berhasil dihapus'), `status=${del1.status}`);

    const afterDelContent = await callApi(`/api/documents/${idDocPetugas}/content`, { cookie: cAdmin });
    const afterDelDownload = await callApi(`/api/documents/${idDocPetugas}/download`, { cookie: cAdmin });
    check('G2. content/download setelah delete = 404', afterDelContent.status === 404 && afterDelDownload.status === 404, `content=${afterDelContent.status}, download=${afterDelDownload.status}`);

    const softRow = Number.isSafeInteger(idDocPetugas) && idDocPetugas > 0
      ? await pool.query<{ deleted_at: Date | null; stored_filename: string }>(
          'SELECT deleted_at, stored_filename FROM documents WHERE id = $1',
          [idDocPetugas],
        )
      : { rows: [] as Array<{ deleted_at: Date | null; stored_filename: string }> };
    check(
      'G3. SOFT delete: baris tetap ada & deleted_at terisi',
      softRow.rows.length === 1 && softRow.rows[0]?.deleted_at !== null,
    );
    if (storageChecked() && softRow.rows[0]) {
      check('G3. file fisik DIPERTAHANKAN setelah soft delete', existsSync(path.join(STORAGE_DIR, softRow.rows[0].stored_filename)));
    }

    const del2 = await callApi(`/api/documents/${idDocPetugas}`, { method: 'DELETE', cookie: cPetugas });
    check('G4. DELETE dua kali = 404 (idempoten dari sudut client)', del2.status === 404, `status=${del2.status}`);

    const delMissing = await callApi('/api/documents/99999999', { method: 'DELETE', cookie: cAdmin });
    check('G5. DELETE dokumen tidak ada = 404', delMissing.status === 404, `status=${delMissing.status}`);

    const contentMissing = await callApi('/api/documents/99999999/content', { cookie: cAdmin });
    const downloadMissing = await callApi('/api/documents/99999999/download', { cookie: cAdmin });
    check('G6. content/download dokumen tidak ada = 404', contentMissing.status === 404 && downloadMissing.status === 404, `content=${contentMissing.status}, download=${downloadMissing.status}`);

    const badId = await callApi('/api/documents/abc/content', { cookie: cAdmin });
    check('G7. id bukan angka = 400', badId.status === 400, `status=${badId.status}`);

    // ---- H. Surat tidak ada / terhapus ----
    const upNoSurat = await uploadFile(cAdmin, 99999999, `${PREFIX}yatim.pdf`, pdfBytes('yatim'));
    check('H1. upload ke surat tidak ada = 404', upNoSurat.status === 404, `status=${upNoSurat.status}`);

    const idC = await createSurat(cAdmin, `${PREFIX}C`);
    const delSuratC = await callApi(`/api/surat-masuk/${idC}`, { method: 'DELETE', cookie: cAdmin });
    const upDeletedSurat = await uploadFile(cAdmin, idC, `${PREFIX}ke-surat-hapus.pdf`, pdfBytes('hapus'));
    const listDeletedSurat = await callApi(`/api/surat-masuk/${idC}/documents`, { cookie: cAdmin });
    check(
      'H2. surat C soft-deleted: upload & daftar = 404',
      delSuratC.status === 200 && upDeletedSurat.status === 404 && listDeletedSurat.status === 404,
      `del=${delSuratC.status}, upload=${upDeletedSurat.status}, list=${listDeletedSurat.status}`,
    );
    const filesAfterH = listStorageFiles().length;
    // Sejak pengukuran terakhir hanya bertambah 1 file (upload petugas F4).
    // Bila H1/H2 meninggalkan file, jumlahnya akan > 4.
    check('H2. upload ke surat tidak ada/terhapus tidak meninggalkan file', filesAfterH === filesAfterFailures + 1, `sebelum-h=${filesAfterFailures}, sesudah-h=${filesAfterH}`);

    const delSuratA = await callApi(`/api/surat-masuk/${idA}`, { method: 'DELETE', cookie: cAdmin });
    const listSuratA = await callApi(`/api/surat-masuk/${idA}/documents`, { cookie: cAdmin });
    const contentSuratA = await callApi(`/api/documents/${idDocPdf}/content`, { cookie: cAdmin });
    const deleteSuratADoc = await callApi(`/api/documents/${idDocPdf}`, { method: 'DELETE', cookie: cAdmin });
    check(
      'H3. setelah surat A dihapus: daftar/content/DELETE dokumen = 404',
      delSuratA.status === 200 && listSuratA.status === 404 && contentSuratA.status === 404 && deleteSuratADoc.status === 404,
      `list=${listSuratA.status}, content=${contentSuratA.status}, delete=${deleteSuratADoc.status}`,
    );
    const stillInDb = await pool.query<{ n: string }>(
      'SELECT count(*)::int AS n FROM documents WHERE original_filename LIKE $1 AND deleted_at IS NULL',
      [`${PREFIX}%`],
    );
    check('H3. baris dokumen masih utuh di DB (hanya terhalang soft delete surat)', Number(stillInDb.rows[0]?.n) === 3, `n=${stillInDb.rows[0]?.n}`);
  } finally {
    // ---- Cleanup WAJIB: file disk + baris test dulu (FK RESTRICT), baru user fixture ----
    let cleanupDocsOk = true;
    try {
      await purgeTestDocuments();
    } catch {
      cleanupDocsOk = false;
    }
    check('cleanup: file & baris dokumen test dihapus', cleanupDocsOk);

    let cleanupSuratOk = true;
    try {
      await pool.query('DELETE FROM surat_masuk WHERE nomor_surat LIKE $1', [`${PREFIX}%`]);
    } catch {
      cleanupSuratOk = false;
    }
    check('cleanup: baris surat test (prefix TEST-2E2-) dihapus', cleanupSuratOk);

    for (const [key, cookie] of cookies) {
      try {
        await callApi('/api/auth/logout', { cookie, method: 'POST' });
      } catch {
        console.log(`catatan: logout best-effort "${key}" tidak berhasil`);
      }
    }

    let cleanupUserOk = true;
    try {
      for (const u of [...FIXTURES, TMP_ADMIN]) {
        await pool.query('DELETE FROM users WHERE username = $1', [u.username]);
      }
    } catch {
      cleanupUserOk = false;
    }
    check('cleanup: user fixture dihapus', cleanupUserOk);
    console.log('(cleanup selesai: file disk + baris dokumen/surat test + user fixture + session test)');
  }

  // ---- Kondisi database akhir ----
  const usersN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM users');
  const rolesN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM roles');
  const testSurat = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM surat_masuk WHERE nomor_surat LIKE $1', [`${PREFIX}%`]);
  const testDocs = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM documents WHERE original_filename LIKE $1', [`${PREFIX}%`]);
  const docsN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM documents');
  const migrations = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM schema_migrations');

  check('DB akhir: jumlah users kembali seperti awal', Number(usersN.rows[0]?.n) === usersAtStart, `awal=${usersAtStart}, akhir=${usersN.rows[0]?.n}`);
  check('DB akhir: roles = 3', Number(rolesN.rows[0]?.n) === 3, `roles=${rolesN.rows[0]?.n}`);
  check('DB akhir: tidak ada baris surat/dokumen test tersisa', Number(testSurat.rows[0]?.n) === 0 && Number(testDocs.rows[0]?.n) === 0, `surat=${testSurat.rows[0]?.n}, dokumen=${testDocs.rows[0]?.n}`);
  check('DB akhir: migration tetap 3 (001/002/003) — tidak ada migrasi baru', Number(migrations.rows[0]?.n) === 3, `migrations=${migrations.rows[0]?.n}`);
  console.log(`(info) total dokumen di DB sekarang: ${docsN.rows[0]?.n}`);

  console.log(`\nRingkasan: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (err: unknown) => {
    const code = (err as { code?: unknown } | undefined)?.code;
    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message.slice(0, 300) : '(tanpa pesan)';
    console.error(`[2e2-test] Gagal (kode: ${typeof code === 'string' ? code : 'unknown'}, tipe: ${name}): ${message}`);
    try {
      await closePool();
    } catch {
      // abaikan
    }
    process.exitCode = 1;
  });
