import { Router } from 'express';
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import multer from 'multer';
import { DatabaseNotConfiguredError, query } from '../db';
import { config } from '../config/env';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { parseIdParam } from '../validation/common';
import { StorageError, createStorageAdapter, type StorageAdapter } from '../storage';
import { buildContentDisposition, validateUploadFile } from '../documents/validation';

/**
 * API Lampiran Dokumen (Phase 2E-2).
 *
 *   POST   /api/surat-masuk/:id/documents   — upload file    (admin, petugas)
 *   GET    /api/surat-masuk/:id/documents   — daftar metadata (admin, petugas, pimpinan)
 *   GET    /api/documents/:id/content       — preview inline  (admin, petugas, pimpinan)
 *   GET    /api/documents/:id/download      — download        (admin, petugas, pimpinan)
 *   DELETE /api/documents/:id               — soft delete     (admin, petugas)
 *
 * Kontrak metadata (JSON) TIDAK PERNAH memuat stored_filename/storage_path —
 * path penyimpanan fisik tidak pernah dikirim ke client.
 *
 * Prinsip keamanan (mengikuti pola Phase 2D-1):
 * - Authorization memakai requireAuth + requireRole; role dari database.
 * - Upload: multipart/form-data, field `file`, SATU file per request,
 *   dibatasi multer (MAX_UPLOAD_BYTES) SEBELUM masuk memori penuh.
 * - Tipe file ditentukan magic bytes (documents/validation.ts), bukan
 *   ekstensi/Content-Type klien. Nama file di disk = UUID dari adapter.
 * - Preview/download menyajikan konten dengan Content-Type dari DATABASE,
 *   selalu `X-Content-Type-Options: nosniff`, `Cache-Control: private,
 *   no-store`, dan Content-Disposition aman (inline/attachment).
 * - Storage TIDAK pernah di-mount sebagai direktori statis; file hanya
 *   bisa diambil lewat endpoint ber-authenticasi ini.
 * - Konsistensi DB ↔ file: file disimpan dulu, INSERT setelahnya; bila
 *   INSERT gagal, file langsung dihapus kembali (kompensasi).
 * - Soft delete: baris ditandai deleted_at, file fisik dipertahankan
 *   (keputusan phase ini — sejalan konvensi soft-delete di migration 001).
 * - Lampiran surat yang sudah soft-deleted tidak bisa diakses (404).
 * - Pesan error aman; detail database/fs hanya lewat log server.
 */

export const documentsRouter = Router();

const DOCUMENT_NOT_FOUND = 'Dokumen tidak ditemukan.';
const SURAT_NOT_FOUND = 'Surat masuk tidak ditemukan.';

/**
 * Adapter storage dibuat LAZY: modul ini di-import saat app.ts dimuat,
 * sedangkan pesan gagal-start yang ramah untuk konfigurasi storage invalid
 * dikontrol server.ts. Dibuat pada request pertama (konfigurasi sudah pasti
 * tervalidasi karena server tidak bisa start sebelumnya).
 */
let storageAdapter: StorageAdapter | null = null;
function getStorage(): StorageAdapter {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

/** Kolom metadata yang AMAN ditampilkan (tanpa stored_filename/storage_path). */
const META_COLUMNS = `
    d.id, d.surat_masuk_id, d.surat_keluar_id, d.original_filename,
    d.mime_type, d.file_size, d.uploaded_by, d.created_at`;

interface DocumentRow extends QueryResultRow {
  id: string;
  surat_masuk_id: string | null;
  surat_keluar_id: string | null;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  file_size: string;
  uploaded_by: string;
  created_at: Date;
}

/** Bentuk respons JSON metadata — TIDAK memuat nama/path file di disk. */
function toJson(row: DocumentRow) {
  return {
    id: Number(row.id),
    surat_masuk_id: row.surat_masuk_id === null ? null : Number(row.surat_masuk_id),
    surat_keluar_id: row.surat_keluar_id === null ? null : Number(row.surat_keluar_id),
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    file_size: Number(row.file_size),
    uploaded_by: Number(row.uploaded_by),
    created_at: row.created_at,
  };
}

/** Error tak terduga: 503 bila DB belum dikonfigurasi, selain itu lempar ke errorHandler (500 generik). */
function respondError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof DatabaseNotConfiguredError) {
    res.status(503).json({ error: 'Database belum dikonfigurasi di server.' });
    return;
  }
  next(err);
}

/**
 * Balas error StorageError dengan AMAN:
 * - 400/404: pesan sudah dirancang aman (tanpa path) → boleh dikirim.
 * - 5xx: HANYA pesan generik; detail (yang bisa memuat path) di-log server.
 */
function respondStorageError(err: StorageError, res: Response): void {
  if (err.statusCode === 400 || err.statusCode === 404) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error(`[documents] Storage error (code: ${err.code})`);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
}

// ---------------------------------------------------------------------------
// Upload (multipart) — multer memory storage + pembatas ketat
// ---------------------------------------------------------------------------

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes, // batas dari MAX_UPLOAD_BYTES (config)
    files: 1, // satu file per request
    fields: 10,
    fieldSize: 8 * 1024,
    parts: 12,
  },
}).single('file');

/**
 * Buang sisa badan request yang masih mengalir sebelum mengirim respons
 * (khusus error multipart). Tanpa ini, client (fetch) bisa menerima
 * reset koneksi alih-alih membaca status 413/400. Dibatasi MAX_DRAIN_BYTES
 * agar server tidak membuang badan tak terhingga dari penyerang.
 */
const MAX_DRAIN_BYTES = 32 * 1024 * 1024;

function respondAfterDrain(req: Request, res: Response, status: number, message: string): void {
  let responded = false;
  const respond = (): void => {
    if (responded) return;
    responded = true;
    try {
      if (!res.headersSent) res.status(status).json({ error: message });
    } catch {
      // socket sudah tertutup — biarkan
    }
  };

  if (req.readableEnded) {
    respond();
    return;
  }

  let discarded = 0;
  const cleanup = (): void => {
    req.off('data', onData);
    req.off('end', onEnd);
    req.off('close', onEnd);
    req.off('error', onEnd);
  };
  function onData(chunk: Buffer): void {
    discarded += chunk.length;
    if (discarded > MAX_DRAIN_BYTES) {
      cleanup();
      respond();
      req.destroy(); // badan terlalu besar untuk dibuang — putus koneksi
    }
  }
  function onEnd(): void {
    cleanup();
    respond();
  }

  req.on('data', onData);
  req.on('end', onEnd);
  req.on('close', onEnd);
  req.on('error', onEnd);
  req.resume();
}

/** Petakan error multer/parser menjadi status + pesan aman. */
function mapUploadError(err: unknown): { status: number; message: string } {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return { status: 413, message: `File melebihi batas ukuran maksimal (${config.maxUploadMb} MB).` };
      case 'LIMIT_UNEXPECTED_FILE':
        return { status: 400, message: "Hanya SATU file dengan nama field 'file' yang diizinkan." };
      case 'LIMIT_FILE_COUNT':
        return { status: 400, message: 'Hanya satu file per unggahan.' };
      case 'LIMIT_FIELD_COUNT':
      case 'LIMIT_FIELD_VALUE':
      case 'LIMIT_PART_COUNT':
        return { status: 400, message: 'Format multipart tidak valid.' };
      default:
        return { status: 400, message: 'Format permintaan tidak valid.' };
    }
  }
  // Busboy/parser error (mis. bentrok konten) — pesan generik yang sama
  // dengan errorHandler global.
  return { status: 400, message: 'Format permintaan tidak valid.' };
}

/** Error handler level route untuk kegagalan multer (setelah auth/role). */
const uploadErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err === undefined || err === null) {
    next();
    return;
  }
  const mapped = mapUploadError(err);
  respondAfterDrain(req, res, mapped.status, mapped.message);
};

// ---------------------------------------------------------------------------
// Query pembantu
// ---------------------------------------------------------------------------

/** Cari surat masuk yang masih AKTIF (bukan soft-deleted). */
async function findActiveSuratMasuk(id: number): Promise<boolean> {
  const result = await query('SELECT 1 FROM surat_masuk WHERE id = $1 AND deleted_at IS NULL', [id]);
  return result.rows.length > 1 || result.rows.length === 1;
}

/**
 * Ambil dokumen AKTIF beserta jaminan induk suratnya masih aktif:
 * dokumen yatim/dari surat terhapus TIDAK PERNAH dikembalikan (404).
 */
async function findActiveDocument(id: number): Promise<DocumentRow | null> {
  const result = await query<DocumentRow>(
    `SELECT ${META_COLUMNS}, d.stored_filename
       FROM documents d
       LEFT JOIN surat_masuk sm ON sm.id = d.surat_masuk_id AND sm.deleted_at IS NULL
       LEFT JOIN surat_keluar sk ON sk.id = d.surat_keluar_id AND sk.deleted_at IS NULL
      WHERE d.id = $1
        AND d.deleted_at IS NULL
        AND (d.surat_masuk_id IS NULL OR sm.id IS NOT NULL)
        AND (d.surat_keluar_id IS NULL OR sk.id IS NOT NULL)`,
    [id],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/surat-masuk/:id/documents — upload
// ---------------------------------------------------------------------------

documentsRouter.post(
  '/surat-masuk/:id/documents',
  requireAuth,
  requireRole('admin', 'petugas'),
  uploadSingle,
  uploadErrorHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id.ok === false) {
        res.status(400).json({ error: id.message });
        return;
      }

      const suratExists = await findActiveSuratMasuk(id.value);
      if (!suratExists) {
        res.status(404).json({ error: SURAT_NOT_FOUND });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "File wajib diunggah melalui field 'file' (multipart/form-data)." });
        return;
      }

      // Validasi ketat: kosong/ukuran/magic bytes/ekstensi — GAGAL berarti
      // file belum pernah menyentuh storage (masih buffer memori).
      const validated = validateUploadFile({
        buffer: file.buffer,
        originalFilename: file.originalname,
        declaredMime: file.mimetype,
        maxBytes: config.maxUploadBytes,
      });
      if (validated.ok === false) {
        res.status(400).json({ error: validated.message });
        return;
      }

      const upload = validated.value;
      const actor = req.authUser;
      if (!actor) {
        res.status(401).json({ error: 'Belum login.' });
        return;
      }

      // 1. Simpan file fisik (nama UUID dari adapter).
      const stored = await getStorage().save({
        buffer: upload.buffer,
        originalName: upload.originalFilename,
        mimeType: upload.mimeType,
      });

      // 2. Catat metadata. Bila INSERT gagal → file dihapus kembali
      //    agar tidak ada file yatim di storage.
      //    Catatan: `AS d` WAJIB agar alias `d.` di RETURNING/META_COLUMNS
      //    valid (tanpa alias, PostgreSQL melempar 42P01).
      try {
        const inserted = await query<DocumentRow>(
          `INSERT INTO documents AS d
             (surat_masuk_id, surat_keluar_id, original_filename, stored_filename,
              storage_path, mime_type, file_size, uploaded_by)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
           RETURNING ${META_COLUMNS}, d.stored_filename`,
          [
            id.value,
            upload.originalFilename,
            stored.storedName,
            stored.storedName, // storage_path = path relatif dalam STORAGE_DIR
            upload.mimeType,
            upload.sizeBytes,
            actor.id,
          ],
        );
        res.status(201).json({ data: toJson(inserted.rows[0] as DocumentRow) });
      } catch (err) {
        try {
          await getStorage().delete(stored.storedName);
        } catch {
          console.error('[documents] Gagal membersihkan file setelah INSERT gagal (file mungkin tertinggal).');
        }
        throw err;
      }
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/surat-masuk/:id/documents — daftar metadata
// ---------------------------------------------------------------------------

documentsRouter.get(
  '/surat-masuk/:id/documents',
  requireAuth,
  requireRole('admin', 'petugas', 'pimpinan'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id.ok === false) {
        res.status(400).json({ error: id.message });
        return;
      }
      const suratExists = await findActiveSuratMasuk(id.value);
      if (!suratExists) {
        res.status(404).json({ error: SURAT_NOT_FOUND });
        return;
      }
      const list = await query<DocumentRow>(
        `SELECT ${META_COLUMNS}
           FROM documents d
          WHERE d.surat_masuk_id = $1 AND d.deleted_at IS NULL
          ORDER BY d.id ASC`,
        [id.value],
      );
      res.status(200).json({ data: list.rows.map(toJson) });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/documents/:id/content  &  /download
// ---------------------------------------------------------------------------

async function sendDocument(req: Request, res: Response, next: NextFunction, kind: 'inline' | 'attachment'): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (id.ok === false) {
      res.status(400).json({ error: id.message });
      return;
    }
    const doc = await findActiveDocument(id.value);
    if (!doc) {
      res.status(404).json({ error: DOCUMENT_NOT_FOUND });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await getStorage().read(doc.stored_filename);
    } catch (err) {
      if (err instanceof StorageError) {
        respondStorageError(err, res);
        return;
      }
      throw err;
    }

    // Header preview/download: mime dari DB (bukan tebakan), anti-sniff,
    // tidak di-cache proxy, nama file aman.
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', buildContentDisposition(kind, doc.original_filename));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buffer);
  } catch (err) {
    respondError(err, res, next);
  }
}

documentsRouter.get(
  '/documents/:id/content',
  requireAuth,
  requireRole('admin', 'petugas', 'pimpinan'),
  (req: Request, res: Response, next: NextFunction) => {
    void sendDocument(req, res, next, 'inline');
  },
);

documentsRouter.get(
  '/documents/:id/download',
  requireAuth,
  requireRole('admin', 'petugas', 'pimpinan'),
  (req: Request, res: Response, next: NextFunction) => {
    void sendDocument(req, res, next, 'attachment');
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/documents/:id — soft delete (file fisik dipertahankan)
// ---------------------------------------------------------------------------

documentsRouter.delete(
  '/documents/:id',
  requireAuth,
  requireRole('admin', 'petugas'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id.ok === false) {
        res.status(400).json({ error: id.message });
        return;
      }
      const result = await query(
        `UPDATE documents d
            SET deleted_at = now()
          WHERE d.id = $1
            AND d.deleted_at IS NULL
            AND (d.surat_masuk_id IS NULL OR EXISTS (
                  SELECT 1 FROM surat_masuk sm
                   WHERE sm.id = d.surat_masuk_id AND sm.deleted_at IS NULL))
            AND (d.surat_keluar_id IS NULL OR EXISTS (
                  SELECT 1 FROM surat_keluar sk
                   WHERE sk.id = d.surat_keluar_id AND sk.deleted_at IS NULL))`,
        [id.value],
      );
      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ error: DOCUMENT_NOT_FOUND });
        return;
      }
      // File fisik TIDAK dihapus: baris soft-deleted tetap merujuk file
      // yang sama sehingga bisa dipulihkan (keputusan Phase 2E-2).
      res.status(200).json({ status: 'ok', message: 'Lampiran berhasil dihapus.' });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);
