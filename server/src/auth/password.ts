import bcrypt from 'bcrypt';
import { config } from '../config/env';

/**
 * Utilitas password berbasis bcrypt (Phase 2C-1: Authentication Foundation).
 *
 * ATURAN:
 * - Password plaintext TIDAK PERNAH disimpan, di-log, maupun dikirim balik.
 * - Yang disimpan di users.password_hash hanya hash bcrypt.
 * - bcrypt memotong input pada 72 byte; password lebih panjang dari itu
 *   harus ditolak agar tidak ada "kecocokan karena pemotongan".
 */

/** Batas maksimum password menurut bcrypt (dalam byte UTF-8). */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Panjang minimum password (kebijakan project, ditetapkan pada
 * Phase 2C-2). Diberlakukan saat MEMBUAT user; login tidak
 * memeriksa panjang ini (cukup tidak kosong), sehingga user lama
 * tidak terkunci oleh kebijakan yang berubah.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Hash bcrypt "dummy" (dihasilkan dari string acak yang tidak berguna).
 *
 * Dipakai saat username TIDAK ditemukan agar server tetap menjalankan
 * operasi bcrypt dengan durasi yang sama seperti login gagal karena
 * password salah — waktu respons tidak membocorkan keberadaan username.
 *
 * Hash ini BUKAN kredensial valid: tidak ada password yang cocok dengannya
 * dan tidak ada user yang memakainya.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$rmaTDBPE2jFh3ELaWBXvn.9gqfHRF.xdw7c2Uf7534NFVx69jiNGe';

/** Menghasilkan hash bcrypt dari password baru. Hanya dipakai saat membuat user. */
export async function hashPassword(plaintext: string): Promise<string> {
  if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(`Password melebihi batas ${MAX_PASSWORD_BYTES} byte.`);
  }
  return bcrypt.hash(plaintext, config.bcryptRounds);
}

/**
 * Memverifikasi password terhadap hash dari database.
 * Mengembalikan false (bukan melempar) bila hash tidak valid.
 */
export async function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  if (typeof passwordHash !== 'string' || passwordHash.length === 0) return false;
  if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) return false;
  try {
    return await bcrypt.compare(plaintext, passwordHash);
  } catch {
    // Format hash rusak/bukan bcrypt → anggap gagal, jangan bocorkan detail.
    return false;
  }
}

/**
 * Menjalankan bcrypt.compare terhadap hash dummy (tanpa hasil).
 * Selalu dipanggil ketika username tidak ditemukan, agar durasi
 * pemrosesan login gagal "user tidak ada" ≈ "password salah".
 */
export async function dummyPasswordVerify(plaintext: string): Promise<void> {
  if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) return;
  try {
    await bcrypt.compare(plaintext, DUMMY_PASSWORD_HASH);
  } catch {
    // Sengaja diabaikan: tujuannya hanya menyamakan waktu proses.
  }
}
