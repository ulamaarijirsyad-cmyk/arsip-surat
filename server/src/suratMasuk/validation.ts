/**
 * Validasi khusus API Surat Masuk (Phase 2D-1).
 *
 * Semua nilai body/query dari client divalidasi di sini SEBELUM
 * menyentuh SQL. Kolom & panjang maksimal mengikuti schema existing
 * (migration 001 — tidak diubah):
 *   nomor_surat   varchar(100) NOT NULL
 *   asal_instansi varchar(200) NOT NULL
 *   jenis_surat   varchar(50)  NOT NULL
 *   sifat_surat   varchar(50)  NOT NULL
 *   penandatangan varchar(150) NULL
 *   perihal / keterangan text (batas aplikasi: MAX_TEKS)
 *
 * Catatan: selain 5 field wajib pada spesifikasi, `jenis_surat` dan
 * `sifat_surat` juga wajib karena kolomnya NOT NULL di schema —
 * jika tidak divalidasi, INSERT akan gagal di database (500).
 *
 * Field id, created_by, created_at, updated_at, deleted_at TIDAK
 * PERNAH dibaca dari body — created_by diambil dari session, sisanya
 * diatur oleh database.
 */
import {
  invalid,
  optionalString,
  parseDateOnly,
  parsePagination,
  readFilterDate,
  readFilterString,
  requireString,
  valid,
  type Pagination,
  type ParseResult,
} from '../validation/common';

/** Batas panjang mengikuti kolom schema + batas aplikasi untuk teks bebas. */
const MAX_NOMOR_SURAT = 100;
const MAX_ASAL_INSTANSI = 200;
const MAX_JENIS_SURAT = 50;
const MAX_SIFAT_SURAT = 50;
const MAX_PENANDATANGAN = 150;
const MAX_TEKS = 5000;

export interface SuratMasukInput {
  nomor_surat: string;
  tanggal_surat: string;
  tanggal_diterima: string;
  asal_instansi: string;
  perihal: string;
  jenis_surat: string;
  sifat_surat: string;
  penandatangan: string | null;
  keterangan: string | null;
}

/**
 * Validasi body POST/PUT /api/surat-masuk.
 * PUT memakai validasi yang SAMA KETATNYA (full-replace): field wajib
 * wajib ada; field opsional yang tidak dikirim menjadi null.
 */
export function validateSuratMasukBody(body: unknown): ParseResult<SuratMasukInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return invalid('Format permintaan tidak valid.');
  }
  const b = body as Record<string, unknown>;

  const nomor = requireString(b.nomor_surat, 'nomor_surat', MAX_NOMOR_SURAT);
  if (nomor.ok === false) return nomor;

  const tanggalSurat = parseDateOnly(b.tanggal_surat, 'tanggal_surat');
  if (tanggalSurat.ok === false) return tanggalSurat;

  const tanggalDiterima = parseDateOnly(b.tanggal_diterima, 'tanggal_diterima');
  if (tanggalDiterima.ok === false) return tanggalDiterima;

  // Bandingan leksikografis YYYY-MM-DD = kronologis.
  if (tanggalDiterima.value < tanggalSurat.value) {
    return invalid('tanggal_diterima tidak boleh lebih awal dari tanggal_surat.');
  }

  const asal = requireString(b.asal_instansi, 'asal_instansi', MAX_ASAL_INSTANSI);
  if (asal.ok === false) return asal;

  const perihal = requireString(b.perihal, 'perihal', MAX_TEKS);
  if (perihal.ok === false) return perihal;

  const jenis = requireString(b.jenis_surat, 'jenis_surat', MAX_JENIS_SURAT);
  if (jenis.ok === false) return jenis;

  const sifat = requireString(b.sifat_surat, 'sifat_surat', MAX_SIFAT_SURAT);
  if (sifat.ok === false) return sifat;

  const penandatangan = optionalString(b.penandatangan, 'penandatangan', MAX_PENANDATANGAN);
  if (penandatangan.ok === false) return penandatangan;

  const keterangan = optionalString(b.keterangan, 'keterangan', MAX_TEKS);
  if (keterangan.ok === false) return keterangan;

  return valid({
    nomor_surat: nomor.value,
    tanggal_surat: tanggalSurat.value,
    tanggal_diterima: tanggalDiterima.value,
    asal_instansi: asal.value,
    perihal: perihal.value,
    jenis_surat: jenis.value,
    sifat_surat: sifat.value,
    penandatangan: penandatangan.value,
    keterangan: keterangan.value,
  });
}

export interface SuratMasukListQuery extends Pagination {
  q: string | null;
  jenis_surat: string | null;
  sifat_surat: string | null;
  diterima_dari: string | null;
  diterima_sampai: string | null;
}

/**
 * Validasi query string GET /api/surat-masuk:
 *   page, limit, q, jenis_surat, sifat_surat, diterima_dari, diterima_sampai
 */
export function parseSuratMasukListQuery(params: URLSearchParams): ParseResult<SuratMasukListQuery> {
  const pagination = parsePagination(params);
  if (pagination.ok === false) return pagination;

  const q = readFilterString(params, 'q', 200);
  if (q.ok === false) return q;

  const jenis = readFilterString(params, 'jenis_surat', MAX_JENIS_SURAT);
  if (jenis.ok === false) return jenis;

  const sifat = readFilterString(params, 'sifat_surat', MAX_SIFAT_SURAT);
  if (sifat.ok === false) return sifat;

  const dari = readFilterDate(params, 'diterima_dari');
  if (dari.ok === false) return dari;

  const sampai = readFilterDate(params, 'diterima_sampai');
  if (sampai.ok === false) return sampai;

  if (dari.value && sampai.value && dari.value > sampai.value) {
    return invalid('Rentang tanggal tidak valid: diterima_dari melebihi diterima_sampai.');
  }

  return valid({
    ...pagination.value,
    q: q.value,
    jenis_surat: jenis.value,
    sifat_surat: sifat.value,
    diterima_dari: dari.value,
    diterima_sampai: sampai.value,
  });
}
