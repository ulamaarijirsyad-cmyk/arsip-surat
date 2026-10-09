/**
 * Phase 2E-1 — Abstraksi penyimpanan dokumen + validasi konfigurasi.
 *
 * Business logic TIDAK boleh tahu apakah file disimpan ke disk lokal (LAN)
 * atau object storage (cloud): cukup panggil `createStorageAdapter()` lalu
 * gunakan interface `StorageAdapter`.
 *
 * Prinsip konfigurasi:
 * - Adapter dan validasi HANYA membaca `config` (config/env.ts) — TIDAK PERNAH
 *   membaca process.env secara terpisah, sehingga ada satu sumber kebenaran.
 * - STORAGE_TYPE wajib 'local' pada phase ini ('s3' belum diimplementasikan).
 * - STORAGE_DIR wajib terisi dan berupa path ABSOLUT ketika STORAGE_TYPE=local.
 * - Konfigurasi tidak valid → error saat STARTUP dengan pesan aman
 *   (server/src/server.ts menangkapnya lalu process.exit(1)).
 *
 * Peta file subsystem ini:
 *   errors.ts — StorageError (pesan aman, tanpa kredensial)
 *   local.ts  — LocalStorageAdapter (nama UUID + anti path traversal)
 *   index.ts  — interface, validasi konfigurasi, factory (file ini)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';
import { StorageError, isStorageError } from './errors';
import { LocalStorageAdapter, isPathInside } from './local';

export { StorageError, isStorageError } from './errors';
export type { StorageErrorCode } from './errors';
export { LocalStorageAdapter, isPathInside } from './local';

export interface StoredFile {
  /** Nama file yang dihasilkan server (UUID), bukan nama asli user. */
  storedName: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageAdapter {
  save(file: { buffer: Buffer; originalName: string; mimeType: string }): Promise<StoredFile>;
  read(storedName: string): Promise<Buffer>;
  delete(storedName: string): Promise<void>;
}

/** Nilai STORAGE_TYPE yang dikenal sistem. Hanya 'local' yang bisa dipakai sekarang. */
export const SUPPORTED_STORAGE_TYPES = ['local', 's3'] as const;

/**
 * Potong string agar aman dicetak ke pesan/log: buang karakter kontrol
 * dan batasi panjang (nilai config bukan secret, tapi tetap dijinakkan).
 */
function sanitizeForMessage(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
}

/**
 * Validasi STORAGE_TYPE. Mengembalikan 'local' bila valid;
 * melempar StorageError('config') bila kosong/tak dikenal/belum siap.
 */
export function validateStorageType(rawType: string): 'local' {
  if (typeof rawType !== 'string' || rawType.trim() === '') {
    throw new StorageError(
      'config',
      "STORAGE_TYPE belum diatur. Isi nilai 'local' di file .env (lihat .env.example).",
    );
  }
  const type = rawType.trim();
  if (!(SUPPORTED_STORAGE_TYPES as readonly string[]).includes(type)) {
    throw new StorageError(
      'config',
      `STORAGE_TYPE tidak dikenal: "${sanitizeForMessage(type)}". Nilai yang diizinkan: 'local'.`,
    );
  }
  if (type !== 'local') {
    throw new StorageError(
      'config',
      `STORAGE_TYPE "${sanitizeForMessage(type)}" belum diimplementasikan. Gunakan 'local'.`,
    );
  }
  return 'local';
}

/**
 * Validasi STORAGE_DIR ketika STORAGE_TYPE=local.
 * Mengembalikan path ABSOLUT hasil resolve; melempar StorageError('config')
 * bila tidak valid. Syarat:
 *   1. terisi (tidak kosong),
 *   2. tanpa karakter kontrol/null byte,
 *   3. path absolut,
 *   4. BUKAN root proyek (process.cwd()),
 *   5. BUKAN berada di dalam direktori publik `dist` (webroot).
 */
export function validateStorageDir(rawDir: string): string {
  if (typeof rawDir !== 'string' || rawDir.trim() === '') {
    throw new StorageError(
      'config',
      'STORAGE_DIR belum diatur. Isi path absolut folder penyimpanan dokumen di file .env ' +
        "(contoh Windows: C:/siarsip-data/documents, contoh Linux: /var/lib/siarsip/documents).",
    );
  }
  const dir = rawDir.trim();
  if (/[\u0000-\u001f\u007f]/.test(dir)) {
    throw new StorageError('config', 'STORAGE_DIR mengandung karakter tidak valid.');
  }
  if (!path.isAbsolute(dir)) {
    throw new StorageError(
      'config',
      `STORAGE_DIR harus berupa path absolut, ditemukan: "${sanitizeForMessage(dir)}".`,
    );
  }

  const resolved = path.resolve(dir);
  const projectRoot = path.resolve(process.cwd());
  const distDir = path.resolve(process.cwd(), 'dist');

  if (resolved === projectRoot) {
    throw new StorageError(
      'config',
      'STORAGE_DIR tidak boleh sama dengan root proyek. Pilih folder khusus dokumen.',
    );
  }
  if (resolved === distDir || isPathInside(distDir, resolved)) {
    throw new StorageError(
      'config',
      'STORAGE_DIR tidak boleh berada di dalam direktori publik (dist). ' +
        `Path: "${sanitizeForMessage(resolved)}".`,
    );
  }
  return resolved;
}

/**
 * Validasi lengkap konfigurasi penyimpanan (type + dir).
 * Mengembalikan path absolut STORAGE_DIR yang sudah divalidasi.
 * Melempar StorageError('config') berpesan aman bila konfigurasi rusak.
 */
export function validateStorageConfig(rawType: string, rawDir: string): string {
  validateStorageType(rawType);
  return validateStorageDir(rawDir);
}

/**
 * Pastikan direktori penyimpanan ADA dan berupa direktori (buat rekursif
 * bila belum ada). Dipanggil saat startup agar kegagalan hak akses/path
 * terdeteksi sebelum server menerima trafik.
 * Mengembalikan path absolut yang sama dengan yang divalidasi.
 */
export function ensureStorageDir(rawDir: string): string {
  const dir = validateStorageDir(rawDir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.statSync(dir).isDirectory()) {
      throw new StorageError('config', `STORAGE_DIR bukan direktori: "${sanitizeForMessage(dir)}".`);
    }
  } catch (err) {
    if (isStorageError(err)) throw err;
    throw new StorageError(
      'io',
      'Gagal menyiapkan direktori penyimpanan. Periksa path STORAGE_DIR dan hak aksesnya.',
      { cause: err },
    );
  }
  return dir;
}

/**
 * Factory adapter berdasarkan konfigurasi terpusat (`config`).
 * Tanpa argumen → memakai STORAGE_TYPE/STORAGE_DIR dari .env (divalidasi dulu).
 * Dengan argumen → dipakai pengujian (test:storage) memakai direktori sementara.
 *
 * STORAGE_TYPE yang tidak valid / STORAGE_DIR yang belum diisi → melempar
 * StorageError('config') — inilah yang membuat startup server gagal lebih awal.
 */
export function createStorageAdapter(
  type: string = config.storageType,
  storageDir: string = config.storageDir,
): StorageAdapter {
  const validType = validateStorageType(type);
  const dir = validateStorageDir(storageDir);
  switch (validType) {
    case 'local':
      return new LocalStorageAdapter(dir);
    default:
      // Pertahanan ganda: validateStorageType sudah menolak selain 'local'.
      throw new StorageError('config', 'Tipe penyimpanan tidak didukung.');
  }
}
