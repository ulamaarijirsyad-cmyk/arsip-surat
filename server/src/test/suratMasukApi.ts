import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { closePool, getPool } from '../db/pool';

/**
 * Integration/API test Phase 2D-1: API Surat Masuk — BUKAN fitur produksi.
 *
 * Cara pakai:
 *   1. Start server (route surat-masuk selalu aktif, tanpa flag khusus)
 *   2. npm run test:surat-masuk   (opsional: RBAC_ADMIN_PASSWORD)
 *
 * Cakupan (sesuai spesifikasi test 2D-1):
 *   1-2  GET/POST tanpa login → 401
 *   3    GET list sebagai admin → 200 (struktur data+pagination)
 *   4    POST admin → 201
 *   5    GET detail → 200
 *   6    PUT → 200 (id/created_by/created_at/deleted_at diabaikan)
 *   7    DELETE → soft delete (baris tetap ada, deleted_at terisi)
 *   8    GET setelah delete → 404
 *   9    field wajib kosong → 400
 *   10   tanggal_diterima < tanggal_surat → 400
 *   11   petugas: GET 200, POST 201, PUT 200, DELETE 200
 *   12   pimpinan: GET 200, POST/PUT/DELETE 403
 *   13   created_by selalu dari session (bukan body)
 *   14   baris terhapus tidak muncul di list
 *   15   SQL parameterized (dibuktikan lewat uji injeksi di 17)
 *   16   pagination bekerja (page, limit, total, totalPages, clamp)
 *   17   search/filter aman dari SQL injection
 *
 * Fixture: user petugas/pimpinan (+ admin bila tanpa password env)
 * dibuat SEMENTARA dengan password acak di memori, dihapus pada blok
 * finally. Data uji memakai prefix nomor 'TEST-2D1-' dan dihapus juga.
 * Baris test dihapus SEBELUM user fixture (FK created_by RESTRICT).
 * Password tidak pernah dicetak/ditulis ke file.
 */

const BASE = process.env.RBAC_TEST_BASE_URL ?? 'http://127.0.0.1:3001';
const PREFIX = 'TEST-2D1-';

const FIXTURES = [
  { username: 'rbac-tmp-petugas', role: 'petugas' },
  { username: 'rbac-tmp-pimpinan', role: 'pimpinan' },
] as const;
const TMP_ADMIN = { username: 'rbac-tmp-admin', role: 'admin' } as const;

const SAFE_401 = 'Belum login.';
const SAFE_403 = 'Anda tidak memiliki hak akses untuk melakukan tindakan ini.';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` — ${detail}` : ''}`);
}

interface ApiResponse {
  status: number;
  body: unknown;
  raw: string;
}

async function callApi(
  path: string,
  options: { cookie?: string; method?: string; headers?: Record<string, string>; payload?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookie) headers.cookie = options.cookie;
  const method = options.method ?? 'GET';
  let body: string | undefined;
  if (options.payload !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.payload);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // biarkan sebagai teks bila bukan JSON
  }
  return { status: res.status, body: parsed, raw };
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

function pag(body: unknown): Record<string, unknown> {
  return obj(obj(body).pagination);
}

function userIdFromMe(body: unknown): number {
  return Number(obj(obj(body).user).id);
}

function sampleSurat(nomor: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nomor_surat: nomor,
    tanggal_surat: '2026-03-01',
    tanggal_diterima: '2026-03-05',
    asal_instansi: 'Instansi Uji Phase 2D-1',
    perihal: 'Uji integrasi API surat masuk',
    jenis_surat: 'Undangan',
    sifat_surat: 'Biasa',
    penandatangan: 'Kepala Instansi Uji',
    keterangan: 'data test otomatis',
    ...overrides,
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

async function main(): Promise<void> {
  const health = await callApi('/api/health');
  check('server aktif: GET /api/health = 200', health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    console.error(`[2d1-test] Server tidak aktif di ${BASE}.`);
    process.exitCode = 1;
    return;
  }

  // ---- 1-2. Unauthenticated (sebelum fixture) ----
  const anonList = await callApi('/api/surat-masuk');
  check('1. GET list tanpa login = 401', anonList.status === 401, `status=${anonList.status}`);
  check('1. pesan 401 aman', anonList.raw.includes(SAFE_401));

  const anonPost = await callApi('/api/surat-masuk', {
    method: 'POST',
    payload: sampleSurat(`${PREFIX}ANON`),
  });
  check('2. POST tanpa login = 401', anonPost.status === 401, `status=${anonPost.status}`);

  const anonDetail = await callApi('/api/surat-masuk/1');
  check('GET detail tanpa login = 401', anonDetail.status === 401, `status=${anonDetail.status}`);

  const anonDelete = await callApi('/api/surat-masuk/1', { method: 'DELETE' });
  check('DELETE tanpa login = 401', anonDelete.status === 401, `status=${anonDelete.status}`);

  const pool = getPool();
  const cookies = new Map<string, string>();
  const passwords = new Map<string, string>();

  try {
    // ---- Pre-clean (idempoten bila run sebelumnya gagal) ----
    await pool.query('DELETE FROM surat_masuk WHERE nomor_surat LIKE $1', [`${PREFIX}%`]);
    for (const u of [...FIXTURES, TMP_ADMIN]) {
      await pool.query('DELETE FROM users WHERE username = $1', [u.username]);
    }

    // ---- Fixture users (sementara) ----
    passwords.set('rbac-tmp-petugas', await createFixtureUser(pool, 'rbac-tmp-petugas', 'petugas', 'RBAC Test petugas'));
    passwords.set('rbac-tmp-pimpinan', await createFixtureUser(pool, 'rbac-tmp-pimpinan', 'pimpinan', 'RBAC Test pimpinan'));

    const adminPassword = process.env.RBAC_ADMIN_PASSWORD || undefined;
    let adminUsername: string;
    if (adminPassword) {
      adminUsername = 'admin';
    } else {
      adminUsername = TMP_ADMIN.username;
      passwords.set(TMP_ADMIN.username, await createFixtureUser(pool, TMP_ADMIN.username, 'admin', 'RBAC Test admin'));
    }

    // ---- Login (3 percobaan — aman dari rate limit 10/15 menit) ----
    const cAdmin = await login(adminUsername, adminPassword ?? passwords.get(TMP_ADMIN.username) ?? '');
    const cPetugas = await login('rbac-tmp-petugas', passwords.get('rbac-tmp-petugas') ?? '');
    const cPimpinan = await login('rbac-tmp-pimpinan', passwords.get('rbac-tmp-pimpinan') ?? '');
    cookies.set('admin', cAdmin);
    cookies.set('rbac-tmp-petugas', cPetugas);
    cookies.set('rbac-tmp-pimpinan', cPimpinan);

    const meAdmin = await callApi('/api/auth/me', { cookie: cAdmin });
    const mePetugas = await callApi('/api/auth/me', { cookie: cPetugas });
    const mePimpinan = await callApi('/api/auth/me', { cookie: cPimpinan });
    const adminId = userIdFromMe(meAdmin.body);
    const petugasId = userIdFromMe(mePetugas.body);
    const pimpinanId = userIdFromMe(mePimpinan.body);
    check('login admin & /me = 200 (role admin)', meAdmin.status === 200 && obj(obj(meAdmin.body).user).role === 'admin');
    check('login petugas & /me = 200 (role petugas)', mePetugas.status === 200 && obj(obj(mePetugas.body).user).role === 'petugas');
    check('login pimpinan & /me = 200 (role pimpinan)', mePimpinan.status === 200 && obj(obj(mePimpinan.body).user).role === 'pimpinan');

    // ==== A. Admin CRUD (#3, #4, #5, #6, #7, #8, #13, #14) ====
    const list1 = await callApi('/api/surat-masuk', { cookie: cAdmin });
    check(
      '3. GET list sebagai admin = 200 + struktur data/pagination',
      list1.status === 200 && Array.isArray(obj(list1.body).data) && obj(list1.body).pagination !== undefined,
      `status=${list1.status}`,
    );
    const p1 = pag(list1.body);
    check('3. pagination default page=1 limit=20', Number(p1.page) === 1 && Number(p1.limit) === 20);
    check('3. list tidak mengandung password_hash/sid', !list1.raw.includes('password_hash') && !list1.raw.includes('siarsip.sid'));

    const postBody = sampleSurat(`${PREFIX}A001`, {
      created_by: 999999,
      id: 999999,
      created_at: '2000-01-01T00:00:00.000Z',
      deleted_at: '2000-01-01T00:00:00.000Z',
    });
    const post1 = await callApi('/api/surat-masuk', { method: 'POST', cookie: cAdmin, payload: postBody });
    check('4. POST sebagai admin = 201', post1.status === 201, `status=${post1.status}`);
    const created = dataRow(post1.body);
    const idA = Number(created.id);
    check('4. respons 201 berbentuk data + id', Number.isSafeInteger(idA) && idA > 0);
    check(
      '13. created_by = id session (bukan 999999 dari body)',
      Number(created.created_by) === adminId && Number(created.created_by) !== 999999,
      `created_by=${String(created.created_by)}, session=${adminId}`,
    );
    check(
      '4. field utama tersimpan sesuai',
      created.nomor_surat === `${PREFIX}A001` &&
        created.tanggal_surat === '2026-03-01' &&
        created.tanggal_diterima === '2026-03-05' &&
        created.asal_instansi === 'Instansi Uji Phase 2D-1',
    );
    check('4. respons 201 tanpa password/session', !post1.raw.includes('password_hash') && !post1.raw.includes('siarsip.sid'));

    const get1 = await callApi(`/api/surat-masuk/${idA}`, { cookie: cAdmin });
    check('5. GET detail = 200 & data cocok', get1.status === 200 && dataRow(get1.body).nomor_surat === `${PREFIX}A001`, `status=${get1.status}`);

    const createdAtA = String(created.created_at);
    const put1 = await callApi(`/api/surat-masuk/${idA}`, {
      method: 'PUT',
      cookie: cAdmin,
      payload: sampleSurat(`${PREFIX}A001`, {
        perihal: 'Perihal diubah lewat PUT',
        id: 123456,
        created_by: 123456,
        created_at: '2000-01-01T00:00:00.000Z',
        deleted_at: '2000-01-01T00:00:00.000Z',
      }),
    });
    const updated = dataRow(put1.body);
    check('6. PUT sebagai admin = 200', put1.status === 200, `status=${put1.status}`);
    check('6. perihal berubah & updated_at >= created_at', updated.perihal === 'Perihal diubah lewat PUT' && String(updated.updated_at) >= createdAtA);
    check(
      '13. PUT mengabaikan id/created_by/created_at/deleted_at dari body',
      Number(updated.id) === idA &&
        Number(updated.created_by) === adminId &&
        String(updated.created_at) === createdAtA &&
        updated.deleted_at === undefined,
    );

    const del1 = await callApi(`/api/surat-masuk/${idA}`, { method: 'DELETE', cookie: cAdmin });
    check('7. DELETE = 200 dengan respons aman', del1.status === 200 && del1.raw.includes('berhasil dihapus'), `status=${del1.status}`);

    const softRow = await pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM surat_masuk WHERE id = $1',
      [idA],
    );
    check(
      '7. SOFT delete: baris masih ada & deleted_at terisi',
      softRow.rows.length === 1 && softRow.rows[0] !== undefined && softRow.rows[0].deleted_at !== null,
    );

    const getDeleted = await callApi(`/api/surat-masuk/${idA}`, { cookie: cAdmin });
    check('8. GET detail setelah delete = 404', getDeleted.status === 404, `status=${getDeleted.status}`);

    const listAfterDel = await callApi(`/api/surat-masuk?q=${encodeURIComponent(`${PREFIX}A001`)}`, { cookie: cAdmin });
    check('14. surat terhapus tidak muncul di list', listAfterDel.status === 200 && dataList(listAfterDel.body).length === 0);

    // ==== B. Validasi (#9, #10) ====
    const postEmpty = await callApi('/api/surat-masuk', {
      method: 'POST',
      cookie: cAdmin,
      payload: {
        nomor_surat: '',
        tanggal_surat: '',
        tanggal_diterima: '',
        asal_instansi: '',
        perihal: '',
        jenis_surat: '',
        sifat_surat: '',
      },
    });
    check('9. POST field wajib kosong = 400', postEmpty.status === 400, `status=${postEmpty.status}`);
    check('9. pesan 400 aman (tanpa SQL/stack)', !/SELECT|pg_|stack|at \w+\.js/i.test(postEmpty.raw));

    const postBadDate = await callApi('/api/surat-masuk', {
      method: 'POST',
      cookie: cAdmin,
      payload: sampleSurat(`${PREFIX}BADDATE`, { tanggal_surat: '2026-03-10', tanggal_diterima: '2026-03-09' }),
    });
    check('10. tanggal_diterima < tanggal_surat = 400', postBadDate.status === 400, `status=${postBadDate.status}`);

    const postBadFormat = await callApi('/api/surat-masuk', {
      method: 'POST',
      cookie: cAdmin,
      payload: sampleSurat(`${PREFIX}BADFMT`, { tanggal_surat: '10-03-2026' }),
    });
    check('format tanggal salah = 400', postBadFormat.status === 400, `status=${postBadFormat.status}`);

    const noJenis = sampleSurat(`${PREFIX}NOJENIS`);
    delete noJenis.jenis_surat;
    const postNoJenis = await callApi('/api/surat-masuk', { method: 'POST', cookie: cAdmin, payload: noJenis });
    check('jenis_surat hilang (NOT NULL di schema) = 400', postNoJenis.status === 400, `status=${postNoJenis.status}`);

    const postWrongType = await callApi('/api/surat-masuk', {
      method: 'POST',
      cookie: cAdmin,
      payload: sampleSurat(`${PREFIX}WRONGTYPE`, { nomor_surat: 123 }),
    });
    check('tipe data salah (nomor_surat angka) = 400', postWrongType.status === 400, `status=${postWrongType.status}`);

    const getBadId = await callApi('/api/surat-masuk/abc', { cookie: cAdmin });
    check('GET detail id tidak valid (abc) = 400', getBadId.status === 400, `status=${getBadId.status}`);

    const getMissingId = await callApi('/api/surat-masuk/999999999', { cookie: cAdmin });
    check('GET detail id tidak ada = 404', getMissingId.status === 404, `status=${getMissingId.status}`);

    // ==== C. Pagination (#16) ====
    const pgDefs = [
      { nomor: `${PREFIX}PG1`, jenis: 'Undangan', sifat: 'Biasa' },
      { nomor: `${PREFIX}PG2`, jenis: 'Nota Dinas', sifat: 'Biasa' },
      { nomor: `${PREFIX}PG3`, jenis: 'Undangan', sifat: 'Penting' },
    ];
    const pgIds: number[] = [];
    for (const d of pgDefs) {
      const r = await callApi('/api/surat-masuk', {
        method: 'POST',
        cookie: cAdmin,
        payload: sampleSurat(d.nomor, { jenis_surat: d.jenis, sifat_surat: d.sifat }),
      });
      check(`16. buat ${d.nomor} = 201`, r.status === 201, `status=${r.status}`);
      pgIds.push(Number(dataRow(r.body).id));
    }

    const pg1 = await callApi(`/api/surat-masuk?q=${PREFIX}PG&limit=2&page=1`, { cookie: cAdmin });
    const pg1p = pag(pg1.body);
    check(
      '16. pagination page=1 limit=2 → data 2, total 3, totalPages 2',
      pg1.status === 200 && dataList(pg1.body).length === 2 && Number(pg1p.total) === 3 && Number(pg1p.totalPages) === 2,
      `data=${dataList(pg1.body).length}, total=${String(pg1p.total)}`,
    );
    const pg2 = await callApi(`/api/surat-masuk?q=${PREFIX}PG&limit=2&page=2`, { cookie: cAdmin });
    check('16. page=2 → sisa 1 baris', pg2.status === 200 && dataList(pg2.body).length === 1, `data=${dataList(pg2.body).length}`);

    const pgClamp = await callApi(`/api/surat-masuk?q=${PREFIX}PG&limit=1000`, { cookie: cAdmin });
    check('16. limit=1000 di-clamp server ke 100', pgClamp.status === 200 && Number(pag(pgClamp.body).limit) === 100);

    for (const bad of ['page=0', 'page=abc', 'limit=0', 'limit=-5']) {
      const r = await callApi(`/api/surat-masuk?${bad}`, { cookie: cAdmin });
      check(`pagination invalid (${bad}) = 400`, r.status === 400, `status=${r.status}`);
    }

    // Sorting deterministik: created_at DESC, id DESC → PG1 dulu (paling awal dibuat)
    const sorted = dataList(pg1.body).map((row) => Number(obj(row).id));
    check('16. sorting deterministik (id DESC antar batch sama)', sorted.length === 2 && sorted[0] > sorted[1], sorted.join(','));

    // ==== D. Search/filter aman dari injeksi (#17) ====
    const inj1 = await callApi(`/api/surat-masuk?q=${encodeURIComponent("%' OR '1'='1")}`, { cookie: cAdmin });
    check('17. q injeksi OR tetap 200 & tidak membocorkan data', inj1.status === 200 && dataList(inj1.body).length === 0, `status=${inj1.status}, data=${dataList(inj1.body).length}`);

    const inj2 = await callApi(`/api/surat-masuk?q=${encodeURIComponent(`${PREFIX}%`)}`, { cookie: cAdmin });
    check('17. karakter % di q di-escape (match literal, bukan wildcard)', inj2.status === 200 && dataList(inj2.body).length === 0, `data=${dataList(inj2.body).length}`);

    const inj3 = await callApi(`/api/surat-masuk?q=${encodeURIComponent("'; DROP TABLE surat_masuk; --")}`, { cookie: cAdmin });
    check('17. upaya DROP TABLE ditolak sebagai teks biasa', inj3.status === 200);
    const inj3TableOk = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM surat_masuk');
    check('17. tabel surat_masuk tetap utuh', Number(inj3TableOk.rows[0]?.n ?? -1) >= 0, `rows=${inj3TableOk.rows[0]?.n}`);

    const fJenis = await callApi(`/api/surat-masuk?q=${PREFIX}PG&jenis_surat=${encodeURIComponent('Nota Dinas')}`, { cookie: cAdmin });
    const fJenisFirst = obj(dataList(fJenis.body)[0]);
    check(
      'filter jenis_surat bekerja',
      fJenis.status === 200 && dataList(fJenis.body).length === 1 && fJenisFirst.nomor_surat === `${PREFIX}PG2`,
      `data=${dataList(fJenis.body).length}, nomor=${String(fJenisFirst.nomor_surat)}`,
    );

    const fSifat = await callApi(`/api/surat-masuk?q=${PREFIX}PG&sifat_surat=Penting`, { cookie: cAdmin });
    check('filter sifat_surat bekerja', fSifat.status === 200 && dataList(fSifat.body).length === 1, `data=${dataList(fSifat.body).length}`);

    const fRange = await callApi(`/api/surat-masuk?q=${PREFIX}PG&diterima_dari=2026-03-01&diterima_sampai=2026-03-31`, { cookie: cAdmin });
    check('filter rentang tanggal_diterima (cocok) → 3', fRange.status === 200 && dataList(fRange.body).length === 3, `data=${dataList(fRange.body).length}`);

    const fRangeExcl = await callApi(`/api/surat-masuk?q=${PREFIX}PG&diterima_sampai=2026-03-04`, { cookie: cAdmin });
    check('filter rentang tanggal_diterima (tidak cocok) → 0', fRangeExcl.status === 200 && dataList(fRangeExcl.body).length === 0, `data=${dataList(fRangeExcl.body).length}`);

    const fBadDate = await callApi('/api/surat-masuk?diterima_dari=2026-99-99', { cookie: cAdmin });
    check('filter tanggal tidak valid = 400', fBadDate.status === 400, `status=${fBadDate.status}`);

    const fBadRange = await callApi('/api/surat-masuk?diterima_dari=2026-03-10&diterima_sampai=2026-03-01', { cookie: cAdmin });
    check('rentang tanggal terbalik = 400', fBadRange.status === 400, `status=${fBadRange.status}`);

    const fLongQ = await callApi(`/api/surat-masuk?q=${'x'.repeat(300)}`, { cookie: cAdmin });
    check('q terlalu panjang = 400', fLongQ.status === 400, `status=${fLongQ.status}`);

    // ==== E. Role petugas (#11, #13) ====
    const pGet = await callApi('/api/surat-masuk', { cookie: cPetugas });
    check('11. petugas GET list = 200', pGet.status === 200, `status=${pGet.status}`);

    const pPost = await callApi('/api/surat-masuk', {
      method: 'POST',
      cookie: cPetugas,
      payload: sampleSurat(`${PREFIX}P001`, { created_by: 888888 }),
    });
    check('11. petugas POST = 201', pPost.status === 201, `status=${pPost.status}`);
    const createdP = dataRow(pPost.body);
    check('13. created_by petugas = session (bukan 888888)', Number(createdP.created_by) === petugasId, `created_by=${String(createdP.created_by)}`);
    const idP = Number(createdP.id);

    const pPut = await callApi(`/api/surat-masuk/${idP}`, {
      method: 'PUT',
      cookie: cPetugas,
      payload: sampleSurat(`${PREFIX}P001`, { perihal: 'Perihal diubah petugas' }),
    });
    check('11. petugas PUT = 200', pPut.status === 200 && dataRow(pPut.body).perihal === 'Perihal diubah petugas', `status=${pPut.status}`);

    const pDelete = await callApi(`/api/surat-masuk/${idP}`, { method: 'DELETE', cookie: cPetugas });
    check('11. petugas DELETE = 200', pDelete.status === 200, `status=${pDelete.status}`);

    const pGetDeleted = await callApi(`/api/surat-masuk/${idP}`, { cookie: cPetugas });
    check('11. petugas GET setelah delete = 404', pGetDeleted.status === 404, `status=${pGetDeleted.status}`);

    // ==== F. Role pimpinan (#12) ====
    const mGet = await callApi('/api/surat-masuk', { cookie: cPimpinan });
    check('12. pimpinan GET list = 200', mGet.status === 200 && Array.isArray(obj(mGet.body).data), `status=${mGet.status}`);

    const idPG1 = pgIds[0] ?? 0;
    const mPost = await callApi('/api/surat-masuk', {
      method: 'POST',
      cookie: cPimpinan,
      payload: sampleSurat(`${PREFIX}M001`),
    });
    check('12. pimpinan POST = 403', mPost.status === 403, `status=${mPost.status}`);
    check('12. pesan 403 persis & aman', mPost.raw.includes(SAFE_403) && !/SELECT|role_id|pg_/i.test(mPost.raw));

    const mPut = await callApi(`/api/surat-masuk/${idPG1}`, {
      method: 'PUT',
      cookie: cPimpinan,
      payload: sampleSurat(`${PREFIX}PG1`, { perihal: 'TIDAK BOLEH UBAH' }),
    });
    check('12. pimpinan PUT = 403', mPut.status === 403, `status=${mPut.status}`);

    const mDelete = await callApi(`/api/surat-masuk/${idPG1}`, { method: 'DELETE', cookie: cPimpinan });
    check('12. pimpinan DELETE = 403', mDelete.status === 403, `status=${mDelete.status}`);

    const pg1After = await callApi(`/api/surat-masuk/${idPG1}`, { cookie: cAdmin });
    check(
      '12. PG1 tetap utuh setelah ditolak 403 (tidak diubah/dihapus)',
      pg1After.status === 200 && dataRow(pg1After.body).perihal === 'Uji integrasi API surat masuk',
      `status=${pg1After.status}`,
    );

    const pgStill3 = await callApi(`/api/surat-masuk?q=${PREFIX}PG`, { cookie: cAdmin });
    check('total baris PG tetap 3 (tanpa perubahan dari 403)', Number(pag(pgStill3.body).total) === 3, `total=${String(pag(pgStill3.body).total)}`);

    // ---- Diagnostics singkat: 401 vs 403 role lain ----
    check('pimpinan tidak pernah menerima 401 pada endpoint ini', mPost.status !== 401 && mPut.status !== 401 && mDelete.status !== 401);
    check('pimpinanId terpakai (session valid)', Number.isSafeInteger(pimpinanId) && pimpinanId > 0, `id=${pimpinanId}`);
  } finally {
    // ---- Cleanup WAJIB: baris test dulu (FK created_by RESTRICT), baru user fixture ----
    let cleanupSuratOk = true;
    try {
      await pool.query('DELETE FROM surat_masuk WHERE nomor_surat LIKE $1', [`${PREFIX}%`]);
    } catch {
      cleanupSuratOk = false;
    }
    check('cleanup: baris test (prefix TEST-2D1-) dihapus', cleanupSuratOk);

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
    console.log('(cleanup selesai: baris test + user fixture + session test)');
  }

  // ---- Kondisi database akhir ----
  const usersN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM users');
  const rolesN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM roles');
  const testRows = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM surat_masuk WHERE nomor_surat LIKE $1', [`${PREFIX}%`]);
  const migrations = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM schema_migrations');
  const sessionsN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM session');
  const suratN = await pool.query<{ n: string }>('SELECT count(*)::int AS n FROM surat_masuk');

  check('DB akhir: users = 1 (hanya admin)', Number(usersN.rows[0]?.n) === 1, `users=${usersN.rows[0]?.n}`);
  check('DB akhir: roles = 3', Number(rolesN.rows[0]?.n) === 3, `roles=${rolesN.rows[0]?.n}`);
  check('DB akhir: tidak ada baris test tersisa', Number(testRows.rows[0]?.n) === 0, `sisa=${testRows.rows[0]?.n}`);
  check('DB akhir: migration tetap 3 (001/002/003)', Number(migrations.rows[0]?.n) === 3, `migrations=${migrations.rows[0]?.n}`);
  console.log(`(info) total surat_masuk sekarang: ${suratN.rows[0]?.n}, session aktif: ${sessionsN.rows[0]?.n}`);

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
    console.error(
      `[2d1-test] Gagal (kode: ${typeof code === 'string' ? code : 'unknown'}, tipe: ${name}): ${message}`,
    );
    try {
      await closePool();
    } catch {
      // abaikan
    }
    process.exitCode = 1;
  });
