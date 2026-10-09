/**
 * Phase 2E-1 — Error khusus subsystem penyimpanan dokumen.
 *
 * Prinsip keamanan:
 * - `message` SELALU aman untuk ditampilkan/di-log: tidak pernah memuat
 *   DATABASE_URL, SESSION_SECRET, password, ataupun kredensial lain.
 * - Pesan untuk error io bersifat generik; detail filesystem asli
 *   (yang bisa memuat path internal) hanya disimpan di `cause` dan
 *   hanya muncul di log server — TIDAK PERNAH dikirim ke client.
 * - `statusCode` disediakan sebagai pemetaan untuk endpoint Phase 2E-2
 *   (errorHandler global tetap merespons dengan pesan generik).
 */

export type StorageErrorCode =
  /** Konfigurasi STORAGE_TYPE/STORAGE_DIR tidak valid (gagal saat startup). */
  | 'config'
  /** Nama file tidak valid / berpotensi path traversal → 400. */
  | 'invalid_name'
  /** Input file tidak valid (buffer kosong, MIME kosong, dll.) → 400. */
  | 'invalid_file'
  /** File tidak ada di storage → 404. */
  | 'not_found'
  /** Kegagalan filesystem (mkdir/write/read/unlink/rename) → 500. */
  | 'io';

const STATUS_BY_CODE: Record<StorageErrorCode, number> = {
  config: 500,
  invalid_name: 400,
  invalid_file: 400,
  not_found: 404,
  io: 500,
};

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  /** Pemetaan status HTTP untuk Phase 2E-2 (lihat komentar modul). */
  readonly statusCode: number;

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}

/** true bila error adalah StorageError (aman dipakai di catch). */
export function isStorageError(err: unknown): err is StorageError {
  return err instanceof StorageError;
}
