/**
 * Phase 2E-1 — Adapter penyimpanan lokal (disk).
 *
 * Jaminan keamanan:
 * 1. Nama file dihasilkan server (crypto.randomUUID) — nama asli dari
 *    user TIDAK PERNAH dipakai untuk menentukan path di disk.
 * 2. Setiap nama file yang masuk (read/delete) divalidasi dua lapis:
 *    allowlist karakter + pengecekan kontainmen hasil resolve terhadap
 *    baseDir → path traversal (../, absolute path, null byte, separator)
 *    selalu ditolak dengan StorageError('invalid_name').
 * 3. Direktori baseDir dibuat rekursif (recursive: true) bila belum ada.
 * 4. Penulisan memakai pola tulis-sementara lalu rename (atomik per file),
 *    sehingga pembaca tidak pernah melihat file setengah jadi; file
 *    sementara dibersihkan bila gagal.
 * 5. Kegagalan filesystem dibungkus StorageError('io') dengan pesan generik
 *    (detail asli hanya di `cause` untuk log server).
 *
 * Catatan: validasi whitelist tipe file (PDF/JPG/PNG) dan batas ukuran
 * dilakukan pada endpoint upload Phase 2E-2 — adapter ini sengaja generik
 * agar bisa dipakai ulang untuk object storage pada phase berikutnya.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StorageError } from './errors';
import type { StorageAdapter, StoredFile } from './index';

/** Format nama hasil crypto.randomUUID() — sanity check sebelum menulis. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Allowlist nama file yang boleh disentuh di disk: huruf/angka/dot/dash/
 * underscore, diawali alfanumerik. Menolak separator, whitespace, null byte,
 * karakter kontrol, dan nama yang diawali '.' (termasuk '.' dan '..').
 */
const SAFE_STORED_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * true bila `child` berada DI DALAM `parent` (strict — parent sendiri = false).
 * path.relative pada Windows sudah case-insensitive; tetap dinormalkan agar
 * perbandingan prefix '..' konsisten di semua platform.
 */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === '' || path.isAbsolute(rel)) return false;
  const normalized = process.platform === 'win32' ? rel.toLowerCase() : rel;
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

/** true bila error fs adalah ENOENT (file/dir tidak ada). */
function isEnoent(err: unknown): boolean {
  return (err as { code?: unknown } | null | undefined)?.code === 'ENOENT';
}

/** Hapus file sementara secara best-effort (error diabaikan). */
async function removeQuietly(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // abaikan — hanya pembersihan file sementara
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  /** Path absolut folder penyimpanan (sudah divalidasi konstruktornya). */
  private readonly baseDir: string;

  constructor(baseDir: string) {
    if (typeof baseDir !== 'string' || baseDir.trim() === '') {
      throw new StorageError('config', 'Direktori storage tidak boleh kosong.');
    }
    if (!path.isAbsolute(baseDir.trim())) {
      throw new StorageError('config', 'Direktori storage harus berupa path absolut.');
    }
    this.baseDir = path.resolve(baseDir.trim());
  }

  /**
   * Resolve nama file menjadi path absolut DI DALAM baseDir.
   * Melempar StorageError('invalid_name') bila nama berbahaya/tidak dikenal —
   * dipakai sebagai satu-satunya gerbang menuju filesystem.
   */
  private resolveStoredPath(storedName: string): string {
    if (typeof storedName !== 'string' || storedName.trim() === '' || !SAFE_STORED_NAME_RE.test(storedName)) {
      throw new StorageError('invalid_name', 'Nama file tidak valid.');
    }
    if (path.basename(storedName) !== storedName) {
      throw new StorageError('invalid_name', 'Nama file tidak valid.');
    }
    const full = path.resolve(this.baseDir, storedName);
    if (full === this.baseDir || !isPathInside(this.baseDir, full)) {
      throw new StorageError('invalid_name', 'Nama file tidak valid.');
    }
    return full;
  }

  async save(file: { buffer: Buffer; originalName: string; mimeType: string }): Promise<StoredFile> {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new StorageError('invalid_file', 'File tidak valid atau kosong.');
    }
    if (typeof file.mimeType !== 'string' || file.mimeType.trim() === '') {
      throw new StorageError('invalid_file', 'Tipe MIME file tidak valid.');
    }
    if (typeof file.originalName !== 'string' || file.originalName.trim() === '') {
      throw new StorageError('invalid_file', 'Nama asli file tidak valid.');
    }

    // Nama file SELALU dari server. `originalName` sengaja TIDAK dipakai
    // untuk path — hanya diperiksa keberadaannya (kontrak interface).
    const storedName = randomUUID();
    if (!UUID_RE.test(storedName)) {
      throw new StorageError('io', 'Gagal menghasilkan nama file acak.');
    }
    // Pertahanan ganda: resolveStoredPath memastikan nama hasil generate
    // tetap berada di dalam baseDir.
    const finalPath = this.resolveStoredPath(storedName);
    const tmpPath = this.resolveStoredPath(`${storedName}.tmp`);

    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch (err) {
      throw new StorageError('io', 'Gagal menyiapkan direktori penyimpanan.', { cause: err });
    }

    try {
      await writeFile(tmpPath, file.buffer, { flag: 'wx' });
    } catch (err) {
      await removeQuietly(tmpPath);
      throw new StorageError('io', 'Gagal menulis file ke penyimpanan.', { cause: err });
    }

    try {
      await rename(tmpPath, finalPath);
    } catch (err) {
      await removeQuietly(tmpPath);
      throw new StorageError('io', 'Gagal menyimpan file ke penyimpanan.', { cause: err });
    }

    return { storedName, sizeBytes: file.buffer.length, mimeType: file.mimeType };
  }

  async read(storedName: string): Promise<Buffer> {
    const full = this.resolveStoredPath(storedName);
    try {
      return await readFile(full);
    } catch (err) {
      if (isEnoent(err)) {
        throw new StorageError('not_found', 'File tidak ditemukan di penyimpanan.', { cause: err });
      }
      throw new StorageError('io', 'Gagal membaca file dari penyimpanan.', { cause: err });
    }
  }

  async delete(storedName: string): Promise<void> {
    const full = this.resolveStoredPath(storedName);
    try {
      await unlink(full);
    } catch (err) {
      if (isEnoent(err)) {
        return; // idempoten: file sudah tidak ada = tujuan tercapai
      }
      throw new StorageError('io', 'Gagal menghapus file dari penyimpanan.', { cause: err });
    }
  }
}
