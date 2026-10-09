import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import { DatabaseNotConfiguredError, query } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { parseIdParam } from '../validation/common';
import {
  parseSuratMasukListQuery,
  validateSuratMasukBody,
  type SuratMasukInput,
  type SuratMasukListQuery,
} from '../suratMasuk/validation';

/**
 * API Surat Masuk (Phase 2D-1).
 *
 *   GET    /api/surat-masuk       — list + pagination + filter (semua role)
 *   GET    /api/surat-masuk/:id   — detail (semua role)
 *   POST   /api/surat-masuk       — buat (admin, petugas)
 *   PUT    /api/surat-masuk/:id   — ubah (admin, petugas)
 *   DELETE /api/surat-masuk/:id   — soft delete (admin, petugas)
 *
 * Prinsip keamanan:
 * - Authorization memakai requireAuth + requireRole (Phase 2C-3),
 *   role dibaca dari database lewat session — bukan dari client.
 * - created_by diambil dari req.authUser (session); body client
 *   yang berisi created_by/id/created_at/deleted_at DIABAIKAN.
 * - Semua nilai user masuk lewat parameterized query ($1, $2, ...).
 *   Teks SQL yang dibangun dinamis HANYA berisi placeholder buatan
 *   kode dan kondisi WHERE konstan — tidak pernah nilai user.
 * - Soft delete: baris tidak pernah dihapus fisik (deleted_at).
 * - Pesan error aman; detail database hanya lewat errorHandler.
 */

export const suratMasukRouter = Router();

/** Kolom SELECT dipakai ulang agar bentuk respons konsisten. */
const SELECT_COLUMNS = `
    id, nomor_surat, tanggal_surat::text AS tanggal_surat,
    tanggal_diterima::text AS tanggal_diterima, asal_instansi, perihal,
    jenis_surat, sifat_surat, penandatangan, keterangan,
    created_by, created_at, updated_at`;

const NOT_FOUND_MESSAGE = 'Surat masuk tidak ditemukan.';

interface SuratMasukRow extends QueryResultRow {
  id: string;
  nomor_surat: string;
  tanggal_surat: string;
  tanggal_diterima: string;
  asal_instansi: string;
  perihal: string;
  jenis_surat: string;
  sifat_surat: string;
  penandatangan: string | null;
  keterangan: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/** Bentuk respons JSON per surat (tanpa kolom deleted_at — selalu NULL di sini). */
function toJson(row: SuratMasukRow) {
  return {
    id: Number(row.id),
    nomor_surat: row.nomor_surat,
    tanggal_surat: row.tanggal_surat,
    tanggal_diterima: row.tanggal_diterima,
    asal_instansi: row.asal_instansi,
    perihal: row.perihal,
    jenis_surat: row.jenis_surat,
    sifat_surat: row.sifat_surat,
    penandatangan: row.penandatangan,
    keterangan: row.keterangan,
    created_by: Number(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Error tak terduga: 503 bila database belum dikonfigurasi, selain itu lempar ke errorHandler (500 generik). */
function respondError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof DatabaseNotConfiguredError) {
    res.status(503).json({ error: 'Database belum dikonfigurasi di server.' });
    return;
  }
  next(err);
}

/** Escape karakter khusus LIKE (% _ \) agar input user jadi teks literal. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Bangun WHERE untuk list. Hanya placeholder $n (buatan kode) dan
 * kondisi konstan yang masuk teks SQL — semua nilai user dikirim
 * terpisah lewat `params` (parameterized).
 */
function buildWhere(filters: SuratMasukListQuery): { clause: string; params: unknown[] } {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.q) {
    params.push(`%${escapeLike(filters.q)}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(nomor_surat ILIKE ${p} ESCAPE '\\'` +
        ` OR asal_instansi ILIKE ${p} ESCAPE '\\'` +
        ` OR perihal ILIKE ${p} ESCAPE '\\'` +
        ` OR penandatangan ILIKE ${p} ESCAPE '\\')`,
    );
  }
  if (filters.jenis_surat) {
    params.push(filters.jenis_surat);
    conditions.push(`jenis_surat = $${params.length}`);
  }
  if (filters.sifat_surat) {
    params.push(filters.sifat_surat);
    conditions.push(`sifat_surat = $${params.length}`);
  }
  if (filters.diterima_dari) {
    params.push(filters.diterima_dari);
    conditions.push(`tanggal_diterima >= $${params.length}`);
  }
  if (filters.diterima_sampai) {
    params.push(filters.diterima_sampai);
    conditions.push(`tanggal_diterima <= $${params.length}`);
  }

  return { clause: conditions.join(' AND '), params };
}

/**
 * GET /api/surat-masuk
 * Wajib login; semua role valid boleh membaca.
 * Pagination server-side (page=1, limit=20, maks 100) dan sorting
 * deterministik (created_at DESC, id DESC). Hanya baris aktif.
 */
suratMasukRouter.get(
  '/surat-masuk',
  requireAuth,
  requireRole('admin', 'petugas', 'pimpinan'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseSuratMasukListQuery(
        new URL(req.originalUrl, 'http://localhost').searchParams,
      );
      if (parsed.ok === false) {
        res.status(400).json({ error: parsed.message });
        return;
      }
      const filters = parsed.value;
      const { clause, params } = buildWhere(filters);

      const listSql = `
        SELECT ${SELECT_COLUMNS}
        FROM surat_masuk
        WHERE ${clause}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      const countSql = `SELECT count(*)::int AS total FROM surat_masuk WHERE ${clause}`;

      const [list, count] = await Promise.all([
        query<SuratMasukRow>(listSql, [...params, filters.limit, filters.offset]),
        query<{ total: number }>(countSql, params),
      ]);

      const total = count.rows[0]?.total ?? 0;
      res.status(200).json({
        data: list.rows.map(toJson),
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          totalPages: Math.ceil(total / filters.limit),
        },
      });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

/**
 * GET /api/surat-masuk/:id
 * Wajib login; semua role valid. 404 bila tidak ada / sudah soft-deleted.
 */
suratMasukRouter.get(
  '/surat-masuk/:id',
  requireAuth,
  requireRole('admin', 'petugas', 'pimpinan'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id.ok === false) {
        res.status(400).json({ error: id.message });
        return;
      }

      const result = await query<SuratMasukRow>(
        `SELECT ${SELECT_COLUMNS} FROM surat_masuk WHERE id = $1 AND deleted_at IS NULL`,
        [id.value],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: NOT_FOUND_MESSAGE });
        return;
      }
      res.status(200).json({ data: toJson(row) });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

/**
 * POST /api/surat-masuk
 * Wajib login; hanya admin & petugas.
 * created_by WAJIB dari session (req.authUser.id) — bukan dari body.
 */
suratMasukRouter.post(
  '/surat-masuk',
  requireAuth,
  requireRole('admin', 'petugas'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = validateSuratMasukBody(req.body);
      if (input.ok === false) {
        res.status(400).json({ error: input.message });
        return;
      }
      const actor = req.authUser;
      if (!actor) {
        // Pertahanan ganda; requireAuth sudah menjamin ini terisi.
        res.status(401).json({ error: 'Belum login.' });
        return;
      }

      const result = await query<SuratMasukRow>(
        `INSERT INTO surat_masuk
           (nomor_surat, tanggal_surat, tanggal_diterima, asal_instansi, perihal,
            jenis_surat, sifat_surat, penandatangan, keterangan, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${SELECT_COLUMNS}`,
        [...buildContentParams(input.value), actor.id],
      );
      res.status(201).json({ data: toJson(result.rows[0] as SuratMasukRow) });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

/**
 * PUT /api/surat-masuk/:id
 * Wajib login; hanya admin & petugas; hanya surat aktif.
 * Full-replace dengan validasi sama ketatnya dengan POST.
 * id / created_by / created_at / deleted_at TIDAK PERNAH diubah
 * (tidak dibaca dari body); updated_at diperbarui oleh trigger DB.
 */
suratMasukRouter.put(
  '/surat-masuk/:id',
  requireAuth,
  requireRole('admin', 'petugas'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id.ok === false) {
        res.status(400).json({ error: id.message });
        return;
      }
      const input = validateSuratMasukBody(req.body);
      if (input.ok === false) {
        res.status(400).json({ error: input.message });
        return;
      }

      const result = await query<SuratMasukRow>(
        `UPDATE surat_masuk
            SET nomor_surat = $1, tanggal_surat = $2, tanggal_diterima = $3,
                asal_instansi = $4, perihal = $5, jenis_surat = $6,
                sifat_surat = $7, penandatangan = $8, keterangan = $9
          WHERE id = $10 AND deleted_at IS NULL
          RETURNING ${SELECT_COLUMNS}`,
        [...buildContentParams(input.value), id.value],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: NOT_FOUND_MESSAGE });
        return;
      }
      res.status(200).json({ data: toJson(row) });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

/**
 * DELETE /api/surat-masuk/:id
 * Wajib login; hanya admin & petugas. SOFT DELETE (deleted_at = now()),
 * baris tidak pernah dihapus fisik. 404 bila sudah terhapus/tidak ada.
 */
suratMasukRouter.delete(
  '/surat-masuk/:id',
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
        'UPDATE surat_masuk SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
        [id.value],
      );
      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ error: NOT_FOUND_MESSAGE });
        return;
      }
      res.status(200).json({ status: 'ok', message: 'Surat masuk berhasil dihapus.' });
    } catch (err) {
      respondError(err, res, next);
    }
  },
);

/** Urutan isi konten surat ($1..$9) — dipakai INSERT (+$10 created_by) dan UPDATE (+$10 id). */
function buildContentParams(input: SuratMasukInput): unknown[] {
  return [
    input.nomor_surat,
    input.tanggal_surat,
    input.tanggal_diterima,
    input.asal_instansi,
    input.perihal,
    input.jenis_surat,
    input.sifat_surat,
    input.penandatangan,
    input.keterangan,
  ];
}
