/**
 * Definisi role untuk authorization (Phase 2C-3: RBAC).
 *
 * - Nama role diambil dari tabel `roles` (seed Phase 2B-2).
 * - ID role TIDAK PERNAH dipakai dalam kode: perbandingan selalu
 *   berdasarkan NAME.
 * - Type `RoleName` membuat pemanggilan `requireRole('admimn')`
 *   gagal saat compile (type-safe).
 */

export const ROLE_NAMES = ['admin', 'petugas', 'pimpinan'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/**
 * Type guard: apakah nilai ini nama role yang dikenal sistem?
 * Role tak dikenal (mis. data korup/role baru di DB) dianggap
 * TIDAK valid → tidak pernah mendapat akses.
 */
export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && (ROLE_NAMES as readonly string[]).includes(value);
}
