import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { closePool, getPool } from '../db/pool';
import { requireRole } from '../middleware/requireRole';
import type { AuthUser } from '../auth/user';

/**
 * Integration test RBAC (Phase 2C-3) — BUKAN bagian fitur produksi.
 *
 * Cara pakai:
 *   1. Start server dengan RBAC_TEST_ROUTES=true
 *   2. npm run test:rbac        (opsional: env RBAC_ADMIN_PASSWORD —
 *                               bila kosong, bagian A memakai fixture
 *                               admin sementara dengan password acak)
 *
 * Yang divalidasi:
 *   A. admin       → endpoint admin-only 200
 *   B. petugas     → admin-only 403, operasional 200, baca 200
 *   C. pimpinan    → admin-only 403, operasional 403, baca 200
 *   D. tanpa login → 401
 *   E. role palsu dari query/header diabaikan → tetap 403
 *      role tak dikenal di level middleware → 403
 *   - perubahan role di DATABASE memengaruhi request berikutnya
 *   - user is_active=false → 401 (session dihancurkan)
 *   - setelah test: users kembali hanya "admin"
 *
 * CATATAN fixture: transaksi (BEGIN/ROLLBACK) TIDAK mungkin dipakai di
 * sini karena login di server memakai koneksi pool BERBEDA sehingga tidak
 * bisa melihat baris yang belum COMMIT. Sebagai gantinya: user petugas/
 * pimpinan dibuat SEMENTARA lalu DIHAPUS di blok `finally` — dijamin
 * tidak meninggalkan user test permanen.
 *
 * Password fixture dihasilkan acak saat run (di memori saja, tidak pernah
 * dicetak maupun ditulis ke file).
 */

const BASE = process.env.RBAC_TEST_BASE_URL ?? 'http://127.0.0.1:3001';

const FIXTURES = [
  { username: 'rbac-tmp-petugas', role: 'petugas' },
  { username: 'rbac-tmp-pimpinan', role: 'pimpinan' },
] as const;

// Fixture admin sementara — hanya dibuat bila RBAC_ADMIN_PASSWORD kosong.
const TMP_ADMIN = { username: 'rbac-tmp-admin', role: 'admin' } as const;

const SAFE_403 = 'Anda tidak memiliki hak akses untuk melakukan tindakan ini.';
const SAFE_401 = 'Belum login.';

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
  options: { cookie?: string; method?: string; headers?: Record<string, string> } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookie) headers.cookie = options.cookie;

  const res = await fetch(`${BASE}${path}`, { method: options.method ?? 'GET', headers });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    // biarkan sebagai teks bila bukan JSON
  }
  return { status: res.status, body, raw };
}

async function login(
  username: string,
  password: string,
): Promise<{ cookie: string; body: unknown }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const raw = await res.text();
  if (res.status !== 200) {
    throw new Error(`Login "${username}" gagal (HTTP ${res.status}).`);
  }
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = /siarsip\.sid=([^;]+)/.exec(setCookie);
  if (!match) {
    throw new Error(`Login "${username}": cookie session tidak diberikan.`);
  }
  // Nilai session ID tidak pernah dicetak/di-log.
  return { cookie: `siarsip.sid=${match[1]}`, body: JSON.parse(raw) };
}

/** Probe middleware requireRole langsung (tanpa HTTP/DB) untuk kasus role tak dikenal & tanpa auth. */
function probeRequireRole(role: string | undefined): number {
  const middleware = requireRole('admin', 'petugas');
  const req = {
    authUser:
      role === undefined
        ? undefined
        : ({ id: 999, username: 'probe', full_name: 'Probe', role } as AuthUser),
  } as unknown as Request;

  let outcome = -1;
  const res = {
    status(code: number) {
      outcome = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;

  middleware(
    req,
    res,
    (() => {
      outcome = 200;
    }) as NextFunction,
  );
  return outcome;
}

async function main(): Promise<void> {
  // Opsional: RBAC_ADMIN_PASSWORD → login akun admin ASLI.
  // Tanpa env ini → bagian A memakai fixture admin sementara (lihat bawah).
  const adminPassword = process.env.RBAC_ADMIN_PASSWORD || undefined;

  // ---- D. Unauthenticated + health (sebelum fixture) ----
  const health = await callApi('/api/health');
  check('GET /api/health = 200', health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    console.error('[rbac-test] Server tidak aktif. Start dulu dengan RBAC_TEST_ROUTES=true.');
    process.exitCode = 1;
    return;
  }

  const healthDb = await callApi('/api/health/db');
  check('GET /api/health/db = 200', healthDb.status === 200, `status=${healthDb.status}`);

  const meAnon = await callApi('/api/auth/me');
  check('GET /api/auth/me tanpa session = 401', meAnon.status === 401, `status=${meAnon.status}`);

  const anonAdmin = await callApi('/api/_test/rbac/admin');
  check('D. endpoint admin-only tanpa session = 401', anonAdmin.status === 401, `status=${anonAdmin.status}`);
  check('D. pesan 401 aman', anonAdmin.raw.includes(SAFE_401));

  if (anonAdmin.status === 404) {
    console.error('[rbac-test] Endpoint test tidak ada (404). Start server dengan RBAC_TEST_ROUTES=true.');
    process.exitCode = 1;
    return;
  }

  const pool = getPool();
  const cookies = new Map<string, string>();
  const passwords = new Map<string, string>();

  try {
    // ---- Bersihkan sisa fixture dari run sebelumnya (jaga-jaga) ----
    for (const fixture of [...FIXTURES, TMP_ADMIN]) {
      await pool.query('DELETE FROM users WHERE username = $1', [fixture.username]);
    }

    // ---- Buat fixture petugas & pimpinan (sementara) ----
    for (const fixture of FIXTURES) {
      const password = randomBytes(18).toString('base64url'); // 24 char, di memori saja
      passwords.set(fixture.username, password);
      const passwordHash = await hashPassword(password);
      const result = await pool.query(
        `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
         SELECT id, $1, $2, $3, TRUE FROM roles WHERE name = $4`,
        [fixture.username, passwordHash, `RBAC Test ${fixture.role}`, fixture.role],
      );
      if (result.rowCount !== 1) {
        throw new Error(
          `Gagal membuat fixture role "${fixture.role}" (rowCount=${String(result.rowCount)}).`,
        );
      }
    }

    // ---- A. Admin ----
    // Jalur 1: RBAC_ADMIN_PASSWORD tersedia → akun admin ASLI.
    // Jalur 2 (tanpa env): fixture admin sementara — role admin dari
    // database, password acak di memori, dihapus pada blok cleanup.
    let adminCookie: string;
    let adminSecret: string;
    let adminSource: string;
    if (adminPassword) {
      const admin = await login('admin', adminPassword);
      adminCookie = admin.cookie;
      adminSecret = adminPassword;
      adminSource = 'akun asli';
      cookies.set('admin', admin.cookie);
    } else {
      const password = randomBytes(18).toString('base64url');
      const passwordHash = await hashPassword(password);
      const result = await pool.query(
        `INSERT INTO users (role_id, username, password_hash, full_name, is_active)
         SELECT id, $1, $2, $3, TRUE FROM roles WHERE name = $4`,
        [TMP_ADMIN.username, passwordHash, 'RBAC Test admin', TMP_ADMIN.role],
      );
      if (result.rowCount !== 1) {
        throw new Error('Gagal membuat fixture admin (rowCount!=1).');
      }
      const admin = await login(TMP_ADMIN.username, password);
      adminCookie = admin.cookie;
      adminSecret = password;
      adminSource = 'fixture sementara';
      cookies.set(TMP_ADMIN.username, admin.cookie);
    }

    const adminMe = await callApi('/api/auth/me', { cookie: adminCookie });
    const adminMeJson = JSON.stringify(adminMe.body);
    const adminSessionId = adminCookie.split('=')[1] ?? ' no-session';
    check(
      `A. /me admin (${adminSource}) = 200 & role=admin`,
      adminMe.status === 200 && adminMeJson.includes('"role":"admin"'),
    );
    check('A. /me tanpa password_hash', !adminMeJson.includes('password_hash'));
    check('A. /me tanpa password plaintext', !adminMeJson.includes(adminSecret));
    check('A. /me tanpa session ID di body', !adminMeJson.includes(adminSessionId));

    const aAdmin = await callApi('/api/_test/rbac/admin', { cookie: adminCookie });
    check(
      `A. admin (${adminSource}) → endpoint admin-only = 200`,
      aAdmin.status === 200,
      `status=${aAdmin.status}`,
    );
    const aOps = await callApi('/api/_test/rbac/operasional', { cookie: adminCookie });
    check('A. admin → endpoint operasional = 200', aOps.status === 200, `status=${aOps.status}`);
    const aRead = await callApi('/api/_test/rbac/baca', { cookie: adminCookie });
    check('A. admin → endpoint baca = 200', aRead.status === 200, `status=${aRead.status}`);

    // ---- B. Petugas ----
    const petugas = await login('rbac-tmp-petugas', passwords.get('rbac-tmp-petugas') ?? '');
    cookies.set('rbac-tmp-petugas', petugas.cookie);

    const bAdmin = await callApi('/api/_test/rbac/admin', { cookie: petugas.cookie });
    check('B. petugas → endpoint admin-only = 403', bAdmin.status === 403, `status=${bAdmin.status}`);
    check(
      'B. pesan 403 persis & aman',
      bAdmin.status === 403 && bAdmin.raw.includes(SAFE_403) && !/SELECT|role_id|pg_/i.test(bAdmin.raw),
    );
    check('B. 403 tidak membocorkan daftar role internal', !/pimpinan|allowedRoles/i.test(bAdmin.raw));
    const bOps = await callApi('/api/_test/rbac/operasional', { cookie: petugas.cookie });
    check('B. petugas → endpoint operasional = 200', bOps.status === 200, `status=${bOps.status}`);
    const bRead = await callApi('/api/_test/rbac/baca', { cookie: petugas.cookie });
    check('B. petugas → endpoint baca = 200', bRead.status === 200, `status=${bRead.status}`);

    // ---- C. Pimpinan ----
    const pimpinan = await login('rbac-tmp-pimpinan', passwords.get('rbac-tmp-pimpinan') ?? '');
    cookies.set('rbac-tmp-pimpinan', pimpinan.cookie);

    const cAdmin = await callApi('/api/_test/rbac/admin', { cookie: pimpinan.cookie });
    check('C. pimpinan → endpoint admin-only = 403', cAdmin.status === 403, `status=${cAdmin.status}`);
    const cOps = await callApi('/api/_test/rbac/operasional', { cookie: pimpinan.cookie });
    check('C. pimpinan → endpoint operasional = 403', cOps.status === 403, `status=${cOps.status}`);
    const cRead = await callApi('/api/_test/rbac/baca', { cookie: pimpinan.cookie });
    check('C. pimpinan → endpoint baca = 200', cRead.status === 200, `status=${cRead.status}`);

    // ---- E. Role palsu dari client (query & header) harus diabaikan ----
    const fakeQuery = await callApi('/api/_test/rbac/admin?role=admin&isAdmin=true', {
      cookie: pimpinan.cookie,
      headers: { 'x-role': 'admin', 'x-user-role': 'admin' },
    });
    check('E. role palsu dari query/header tetap 403', fakeQuery.status === 403, `status=${fakeQuery.status}`);
    check('E. role tak dikenal (level middleware) → 403', probeRequireRole('superuser') === 403);
    check('E. role tak dikenal (beda kapital/spasi) → 403', probeRequireRole('Admin ') === 403);
    check('E. tanpa authUser (requireRole tanpa requireAuth) → 401', probeRequireRole(undefined) === 401);

    // ---- 8. Role dari DATABASE memengaruhi request berikutnya ----
    await pool.query(
      `UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'pimpinan')
        WHERE username = $1`,
      ['rbac-tmp-petugas'],
    );
    const afterRoleChange = await callApi('/api/_test/rbac/operasional', {
      cookie: petugas.cookie,
    });
    check(
      '8. role DB berubah (petugas→pimpinan), session sama → operasional jadi 403',
      afterRoleChange.status === 403,
      `status=${afterRoleChange.status}`,
    );

    // ---- 9. User inactive → 401 (session dihancurkan) ----
    await pool.query('UPDATE users SET is_active = FALSE WHERE username = $1', [
      'rbac-tmp-pimpinan',
    ]);
    const inactiveMe = await callApi('/api/auth/me', { cookie: pimpinan.cookie });
    check('9. user inactive → /me = 401', inactiveMe.status === 401, `status=${inactiveMe.status}`);
    const inactiveRbac = await callApi('/api/_test/rbac/baca', { cookie: pimpinan.cookie });
    check(
      '9. user inactive → endpoint RBAC = 401 (bukan 403)',
      inactiveRbac.status === 401,
      `status=${inactiveRbac.status}`,
    );
    check('9. response inactive tidak berisi data user', !inactiveMe.raw.includes('username'));
  } finally {
    // ---- Cleanup: logout semua session test + hapus fixture ----
    for (const [key, cookie] of cookies) {
      try {
        await callApi('/api/auth/logout', { cookie, method: 'POST' });
      } catch {
        // logout best-effort: kegagalan tidak menggagalkan cleanup user
        console.log(`catatan: logout best-effort "${key}" tidak berhasil`);
      }
    }
    for (const fixture of [...FIXTURES, TMP_ADMIN]) {
      await pool.query('DELETE FROM users WHERE username = $1', [fixture.username]);
    }
    console.log('(cleanup: fixture dihapus, session test di-logout)');
  }

  // ---- J. Jumlah akhir ----
  const usersCount = await pool.query<{ c: string }>('SELECT count(*) AS c FROM users');
  const rolesCount = await pool.query<{ c: string }>('SELECT count(*) AS c FROM roles');
  const roleNames = await pool.query<{ name: string }>('SELECT name FROM roles ORDER BY name');
  const leftover = await pool.query<{ username: string }>(
    "SELECT username FROM users WHERE username LIKE 'rbac-tmp-%'",
  );

  check('setelah test: users = 1 (hanya admin)', Number(usersCount.rows[0].c) === 1);
  check('setelah test: roles = 3', Number(rolesCount.rows[0].c) === 3);
  check(
    'setelah test: roles tetap admin/petugas/pimpinan',
    roleNames.rows.map((r) => r.name).join(',') === 'admin,petugas,pimpinan',
    roleNames.rows.map((r) => r.name).join(','),
  );
  check('setelah test: tidak ada sisa user fixture', leftover.rows.length === 0);

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
    // Pesan error ditampilkan untuk diagnosa lokal (bukan response API);
    // sumber daya yang gagal ditutup di bawah.
    const message = err instanceof Error ? err.message.slice(0, 300) : '(tanpa pesan)';
    console.error(
      `[rbac-test] Gagal (kode: ${typeof code === 'string' ? code : 'unknown'}, tipe: ${name}): ${message}`,
    );
    try {
      await closePool();
    } catch {
      // abaikan
    }
    process.exitCode = 1;
  });
