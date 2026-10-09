import { query } from '../db';

/**
 * Identitas aman yang boleh dikirim ke client.
 * TIDAK PERNAH memuat password_hash maupun session id.
 */
export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

interface AuthUserRow {
  id: string;
  username: string;
  full_name: string;
  role_name: string;
}

/**
 * Mengambil user yang masih AKTIF beserta role-nya dari database.
 *
 * - Menggunakan parameterized query ($1), tidak pernah string interpolation.
 * - Sumber kebenaran role adalah tabel roles (bukan kiriman browser).
 * - Kolom password_hash sengaja TIDAK dipilih di sini.
 *
 * @returns null bila user tidak ditemukan atau sudah non-aktif.
 */
export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const result = await query<AuthUserRow>(
    `SELECT u.id, u.username, u.full_name, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
        AND u.is_active = TRUE`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) return null;

  // Kolom bigint dikembalikan pg sebagai string → konversi ke number.
  return {
    id: Number(row.id),
    username: row.username,
    full_name: row.full_name,
    role: row.role_name,
  };
}
