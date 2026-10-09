/**
 * Phase 2E-1 — Pengujian Local Storage Adapter. BUKAN fitur produksi.
 *
 * Cara pakai:
 *   npm run test:storage
 *
 * Cakupan (spesifikasi 2E-1):
 *   A. Konfigurasi INVALID: STORAGE_DIR kosong/relatif/==root proyek/
 *      berada di dalam dist, STORAGE_TYPE kosong/tak dikenal/'s3'.
 *   B. Pesan error konfigurasi AMAN (tidak memuat DATABASE_URL,
 *      SESSION_SECRET, ataupun 'postgresql://').
 *   C. Simpan file: nama hasil UUID, ukuran/MIME sesuai, direktori dibuat
 *      REKURSIF, tidak ada file sementara (.tmp) yang tertinggal.
 *   D. Nama file ACAK: dua simpan dengan nama asli sama → storedName
 *      berbeda; nama asli berbahaya ('../../evil.pdf') TIDAK pernah
 *      menjadi path di disk.
 *   E. Input file invalid (buffer kosong / MIME kosong / nama asli kosong).
 *   F. PATH TRAVERSAL: read & delete dengan nama berbahaya (../, absolute
 *      path, separator, null byte, spasi, dotfile) → ditolak
 *      StorageError('invalid_name') dan file di luar baseDir tetap utuh.
 *   G. Nama valid tapi tidak ada → not_found; delete idempoten.
 *   H. Penghapusan: file hilang dari disk, hapus ulang tidak error.
 *   I. Adapter memakai ARGUMEN KONFIGURASI, bukan process.env
 *      (bukti: process.env diisi nilai 'bait' yang tidak boleh tersentuh).
 *   J. Factory tanpa argumen → konfigurasi terpusat (config), gagal aman
 *      bila STORAGE_DIR belum diisi.
 *   K. ensureStorageDir: rekursif, tolak path kosong/relatif, tolak file.
 *   L. Cleanup: seluruh direktori uji sementara dihapus.
 *
 * Semua file uji berada di folder sementara khusus uji (os.tmpdir) dan
 * dihapus pada blok finally. TANPA database, TANPA server, TANPA data
 * produksi yang disentuh.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  StorageError,
  createStorageAdapter,
  ensureStorageDir,
  validateStorageConfig,
} from '../storage';
import type { StorageAdapter, StorageErrorCode } from '../storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Jalankan `run` dan assert: melempar StorageError dengan kode tertentu
 * (dan pesan yang mengandung teks tertentu). Pesan yang dicetak hanya
 * berasal dari StorageError buatan sendiri (aman, tanpa kredensial).
 */
async function expectStorageError(
  name: string,
  run: () => unknown,
  expect: { code?: StorageErrorCode; messageIncludes?: string } = {},
): Promise<void> {
  try {
    await run();
    check(name, false, 'tidak ada error yang dilempar');
  } catch (err) {
    if (!(err instanceof StorageError)) {
      check(name, false, `tipe error bukan StorageError (${err instanceof Error ? err.name : typeof err})`);
      return;
    }
    const codeOk = expect.code === undefined || err.code === expect.code;
    const msgOk = expect.messageIncludes === undefined || err.message.includes(expect.messageIncludes);
    check(
      name,
      codeOk && msgOk,
      codeOk && msgOk ? '' : `code=${err.code}, pesan="${err.message.slice(0, 120)}"`,
    );
  }
}

function isAdapter(value: unknown): boolean {
  const a = value as StorageAdapter | null | undefined;
  return !!a && typeof a.save === 'function' && typeof a.read === 'function' && typeof a.delete === 'function';
}

async function runAllTests(tempRoot: string): Promise<void> {
  // ==== A. Konfigurasi invalid ====
  await expectStorageError(
    'A1. STORAGE_DIR kosong = ditolak',
    () => validateStorageConfig('local', ''),
    { code: 'config', messageIncludes: 'STORAGE_DIR' },
  );
  await expectStorageError(
    'A2. STORAGE_DIR hanya spasi = ditolak',
    () => validateStorageConfig('local', '   '),
    { code: 'config', messageIncludes: 'STORAGE_DIR' },
  );
  await expectStorageError(
    'A3. STORAGE_DIR relatif = ditolak',
    () => validateStorageConfig('local', path.join('storage', 'documents')),
    { code: 'config', messageIncludes: 'absolut' },
  );
  await expectStorageError(
    'A4. STORAGE_DIR = dist (webroot) = ditolak',
    () => validateStorageConfig('local', path.resolve(process.cwd(), 'dist')),
    { code: 'config', messageIncludes: 'dist' },
  );
  await expectStorageError(
    'A5. STORAGE_DIR di dalam dist = ditolak',
    () => validateStorageConfig('local', path.resolve(process.cwd(), 'dist', 'documents')),
    { code: 'config', messageIncludes: 'dist' },
  );
  await expectStorageError(
    'A6. STORAGE_DIR = root proyek = ditolak',
    () => validateStorageConfig('local', process.cwd()),
    { code: 'config', messageIncludes: 'root proyek' },
  );
  await expectStorageError(
    "A7. STORAGE_TYPE kosong = ditolak",
    () => validateStorageConfig('', tempRoot),
    { code: 'config', messageIncludes: 'STORAGE_TYPE' },
  );
  await expectStorageError(
    'A8. STORAGE_TYPE tak dikenal = ditolak',
    () => validateStorageConfig('dropbox', tempRoot),
    { code: 'config', messageIncludes: 'STORAGE_TYPE' },
  );
  await expectStorageError(
    "A9. STORAGE_TYPE 's3' (belum diimplementasikan) = ditolak",
    () => validateStorageConfig('s3', tempRoot),
    { code: 'config', messageIncludes: 'belum diimplementasikan' },
  );

  // ==== B. Pesan error aman (tanpa kredensial) ====
  let safeMsg = '';
  try {
    validateStorageConfig('local', '');
  } catch (err) {
    if (err instanceof StorageError) safeMsg = err.message;
  }
  const secrets = [process.env.DATABASE_URL, process.env.SESSION_SECRET].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  const leaked = secrets.some((s) => safeMsg.includes(s));
  check(
    'B1. pesan error konfigurasi aman (tanpa DATABASE_URL/SESSION_SECRET/postgresql://)',
    safeMsg.length > 0 && !leaked && !safeMsg.includes('postgresql://'),
    leaked ? 'pesan mengandung nilai sensitif' : '',
  );

  // ==== C+D+E. Simpan / nama acak / input invalid ====
  const baseDir = path.join(tempRoot, 'storage', 'nested', 'documents'); // belum ada
  const adapter = createStorageAdapter('local', baseDir);
  check('C1. adapter valid dibuat dari konfigurasi yang benar', isAdapter(adapter));

  const content = Buffer.from('Halo SI-ARSIP — Phase 2E-1', 'utf8');
  const saved1 = await adapter.save({ buffer: content, originalName: 'Scan Surat.pdf', mimeType: 'application/pdf' });
  check('C2. save: storedName berformat UUID', UUID_RE.test(saved1.storedName), saved1.storedName);
  check('C3. save: sizeBytes & mimeType sesuai input', saved1.sizeBytes === content.length && saved1.mimeType === 'application/pdf');
  check(
    'C4. file benar-benar ada di disk dalam baseDir',
    await fs
      .stat(path.join(baseDir, saved1.storedName))
      .then((st) => st.isFile())
      .catch(() => false),
  );
  const dirEntries = await fs.readdir(baseDir);
  check('C5. tidak ada file sementara (.tmp) tertinggal', dirEntries.every((f) => !f.endsWith('.tmp')));
  check('C6. direktori dibuat REKURSIF (3 level di bawah tempRoot)', await fs.stat(baseDir).then((s) => s.isDirectory()).catch(() => false));

  const roundTrip = await adapter.read(saved1.storedName);
  check('C7. read: isi file identik dengan yang disimpan', Buffer.compare(roundTrip, content) === 0);

  const saved2 = await adapter.save({ buffer: content, originalName: 'Scan Surat.pdf', mimeType: 'application/pdf' });
  check(
    'D1. nama file ACAK: dua simpan nama asli sama → storedName berbeda',
    saved2.storedName !== saved1.storedName && UUID_RE.test(saved2.storedName),
  );

  const evilName = '../../evil.pdf';
  const saved3 = await adapter.save({ buffer: content, originalName: evilName, mimeType: 'application/pdf' });
  check(
    'D2. nama asli berbahaya TIDAK menjadi path (storedName tetap UUID)',
    UUID_RE.test(saved3.storedName) && !saved3.storedName.includes('..'),
  );
  const evilOutside1 = await fs.stat(path.join(tempRoot, 'evil.pdf')).then(() => true).catch(() => false);
  const evilOutside2 = await fs
    .stat(path.join(path.dirname(baseDir), 'evil.pdf'))
    .then(() => true)
    .catch(() => false);
  check(
    'D3. tidak ada file "evil" yang bocor ke luar baseDir',
    !evilOutside1 && !evilOutside2,
  );

  await expectStorageError(
    'E1. buffer kosong = invalid_file',
    () => adapter.save({ buffer: Buffer.alloc(0), originalName: 'x.pdf', mimeType: 'application/pdf' }),
    { code: 'invalid_file' },
  );
  await expectStorageError(
    'E2. MIME kosong = invalid_file',
    () => adapter.save({ buffer: content, originalName: 'x.pdf', mimeType: '' }),
    { code: 'invalid_file' },
  );
  await expectStorageError(
    'E3. nama asli kosong = invalid_file',
    () => adapter.save({ buffer: content, originalName: '  ', mimeType: 'application/pdf' }),
    { code: 'invalid_file' },
  );

  // ==== F. Path traversal ====
  const outsideFile = path.join(tempRoot, 'outside.txt');
  await fs.writeFile(outsideFile, 'file-di-luar-base-dir', 'utf8');

  const traversalNames: Array<{ label: string; value: string }> = [
    { label: 'bersarang ..', value: '../x.txt' },
    { label: 'menembus ke tempRoot', value: '../../outside.txt' },
    { label: 'backslash traversal', value: '..\\outside.txt' },
    { label: 'subdirektori', value: 'sub/file.txt' },
    { label: 'absolute path windows', value: 'C:\\Windows\\evil.txt' },
    { label: 'absolute path posix', value: '/etc/passwd' },
    { label: 'berisi spasi', value: 'nama file.txt' },
    { label: 'dotfile', value: '.htaccess' },
    { label: 'null byte', value: 'a\u0000b.txt' },
    { label: 'string kosong', value: '' },
    { label: 'titik', value: '.' },
    { label: 'titik ganda', value: '..' },
  ];
  for (const t of traversalNames) {
    await expectStorageError(`F. tolak read [${t.label}]`, () => adapter.read(t.value), {
      code: 'invalid_name',
    });
    await expectStorageError(`F. tolak delete [${t.label}]`, () => adapter.delete(t.value), {
      code: 'invalid_name',
    });
  }
  const outsideStill = await fs.readFile(outsideFile, 'utf8').catch(() => '');
  check('F. file di luar baseDir tetap utuh setelah upaya traversal', outsideStill === 'file-di-luar-base-dir');

  // ==== G. not_found & idempoten ====
  const missingName = '00000000-0000-4000-8000-000000000000';
  await expectStorageError('G1. read nama valid yang tidak ada = not_found', () => adapter.read(missingName), {
    code: 'not_found',
  });
  let deleteMissingOk = true;
  try {
    await adapter.delete(missingName);
  } catch {
    deleteMissingOk = false;
  }
  check('G2. delete nama valid yang tidak ada = idempoten (tanpa error)', deleteMissingOk);

  // ==== H. Penghapusan nyata ====
  await adapter.delete(saved3.storedName);
  check(
    'H1. file hilang dari disk setelah delete',
    !(await fs.stat(path.join(baseDir, saved3.storedName)).then(() => true).catch(() => false)),
  );
  await expectStorageError('H2. read setelah delete = not_found', () => adapter.read(saved3.storedName), {
    code: 'not_found',
  });
  let deleteAgainOk = true;
  try {
    await adapter.delete(saved3.storedName);
  } catch {
    deleteAgainOk = false;
  }
  check('H3. delete dua kali = idempoten (tanpa error)', deleteAgainOk);

  // ==== I. Adapter memakai argumen konfigurasi, BUKAN process.env ====
  const explicitBase = path.join(tempRoot, 'explicit-base');
  const baitDir = path.join(tempRoot, 'bait-from-env');
  const prevDir = process.env.STORAGE_DIR;
  const prevType = process.env.STORAGE_TYPE;
  process.env.STORAGE_DIR = baitDir;
  process.env.STORAGE_TYPE = 's3';
  try {
    const envAdapter = createStorageAdapter('local', explicitBase);
    const envSaved = await envAdapter.save({
      buffer: Buffer.from('uji-env', 'utf8'),
      originalName: 'env.txt',
      mimeType: 'application/pdf',
    });
    const landedInExplicit = await fs
      .stat(path.join(explicitBase, envSaved.storedName))
      .then((s) => s.isFile())
      .catch(() => false);
    const baitCreated = await fs
      .stat(baitDir)
      .then(() => true)
      .catch(() => false);
    check('I1. adapter memakai argumen konfigurasi (bukan process.env)', landedInExplicit && !baitCreated);
  } finally {
    if (prevDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prevDir;
    if (prevType === undefined) delete process.env.STORAGE_TYPE;
    else process.env.STORAGE_TYPE = prevType;
  }

  // ==== J. Factory tanpa argumen → konfigurasi terpusat ====
  let factoryOk = false;
  try {
    factoryOk = isAdapter(createStorageAdapter());
  } catch (err) {
    // .env yang belum mengisi STORAGE_DIR → harus gagal AMAN (StorageError config)
    factoryOk = err instanceof StorageError && err.code === 'config';
  }
  check('J1. createStorageAdapter() tanpa argumen memakai config terpusat (valid atau gagal aman)', factoryOk);

  // ==== K. ensureStorageDir ====
  const madeDir = path.join(tempRoot, 'made', 'deep', 'dir');
  const madeResult = ensureStorageDir(madeDir);
  const madeExists = await fs.stat(madeDir).then((s) => s.isDirectory()).catch(() => false);
  check('K1. ensureStorageDir membuat direktori REKURSIF', madeExists && madeResult === path.resolve(madeDir));
  await expectStorageError('K2. ensureStorageDir path kosong = ditolak', () => ensureStorageDir(''), {
    code: 'config',
    messageIncludes: 'STORAGE_DIR',
  });
  await expectStorageError('K3. ensureStorageDir path relatif = ditolak', () => ensureStorageDir('relative/dir'), {
    code: 'config',
    messageIncludes: 'absolut',
  });
  const filePath = path.join(tempRoot, 'bukan-direktori');
  await fs.writeFile(filePath, 'x', 'utf8');
  await expectStorageError('K4. ensureStorageDir menunjuk file = ditolak', () => ensureStorageDir(filePath), {
    messageIncludes: 'direktori',
  });
}

async function main(): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'siarsip-2e1-'));
  console.log('(uji storage memakai direktori sementara khusus uji di os.tmpdir)\n');

  let cleanupOk = false;
  try {
    await runAllTests(tempRoot);
  } finally {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
      cleanupOk = !(await fs.stat(tempRoot).then(() => true).catch(() => false));
    } catch {
      cleanupOk = false;
    }
  }
  check('L1. cleanup: seluruh direktori uji sementara dihapus', cleanupOk);

  console.log(`\nRingkasan: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  const name = err instanceof Error ? err.name : 'UnknownError';
  const message = err instanceof Error ? err.message.slice(0, 300) : '(tanpa pesan)';
  console.error(`[2e1-test] Gagal (tipe: ${name}): ${message}`);
  process.exitCode = 1;
});
