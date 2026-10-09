/**
 * Utilitas validasi input generik (Phase 2D-1: API Surat Masuk).
 *
 * Tanpa library tambahan — cukup untuk kebutuhan API ini. Prinsipnya:
 * - Semua nilai dari user divalidasi di SERVER sebelum dipakai.
 * - Hasil berupa union type ParseResult<T> (bukan throw), sehingga
 *   handler mudah mengembalikan 400 dengan pesan aman.
 * - Pesan error hanya menyebut nama field/format — tidak pernah
 *   memuat detail SQL/database, password, atau session.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function valid<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function invalid(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/**
 * Parse ID dari URL param.
 * Hanya menerima digit (1–15 angka) → bilangan bulat positif yang aman.
 * Nilai mentah dari URL TIDAK PERNAH masuk SQL tanpa lolos parser ini,
 * dan selalu dikirim lewat parameterized query ($1).
 */
export function parseIdParam(raw: unknown): ParseResult<number> {
  if (typeof raw !== 'string' || !/^[0-9]{1,15}$/.test(raw)) {
    return invalid('ID tidak valid.');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    return invalid('ID tidak valid.');
  }
  return valid(value);
}

const DATE_ONLY_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/**
 * Validasi tanggal murni format YYYY-MM-DD (kolom `date` PostgreSQL).
 * Mengecek juga kalender nyata (mis. 2026-02-30 ditolak).
 */
export function parseDateOnly(raw: unknown, fieldName: string): ParseResult<string> {
  const baseMessage = `Field ${fieldName} harus berupa tanggal format YYYY-MM-DD.`;
  if (typeof raw !== 'string') return invalid(baseMessage);

  const match = DATE_ONLY_RE.exec(raw);
  if (!match) return invalid(baseMessage);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Uji kalender: konstruksi Date akan "melimpah" untuk tanggal tidak ada
  // (mis. bulan 13 atau tanggal 30 Feb) sehingga round-trip tidak cocok.
  const probe = new Date(Date.UTC(2000, month - 1, day));
  probe.setUTCFullYear(year);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return invalid(`Field ${fieldName} bukan tanggal yang valid.`);
  }
  return valid(raw);
}

/** Teks wajib: harus string, tidak kosong setelah trim, dalam batas panjang. */
export function requireString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): ParseResult<string> {
  if (typeof value !== 'string') {
    return invalid(`Field ${fieldName} wajib berupa teks.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return invalid(`Field ${fieldName} wajib diisi.`);
  }
  if (trimmed.length > maxLength) {
    return invalid(`Field ${fieldName} maksimal ${maxLength} karakter.`);
  }
  return valid(trimmed);
}

/**
 * Teks opsional: null/undefined → null; string kosong (setelah trim)
 * → null; selain itu wajib string dan dalam batas panjang.
 */
export function optionalString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): ParseResult<string | null> {
  if (value === undefined || value === null) return valid(null);
  if (typeof value !== 'string') {
    return invalid(`Field ${fieldName} harus berupa teks atau null.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return valid(null);
  if (trimmed.length > maxLength) {
    return invalid(`Field ${fieldName} maksimal ${maxLength} karakter.`);
  }
  return valid(trimmed);
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
/** Batas atas limit — nilai lebih besar di-clamp ke sini oleh server. */
export const MAX_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse page/limit dari query string.
 * - page  : default 1; harus digit ≥ 1 (selain itu → 400).
 * - limit : default 20; harus digit ≥ 1 (selain itu → 400);
 *           nilai > MAX_LIMIT di-clamp ke MAX_LIMIT oleh server.
 */
export function parsePagination(params: URLSearchParams): ParseResult<Pagination> {
  const pageRaw = params.get('page');
  let page = DEFAULT_PAGE;
  if (pageRaw !== null) {
    if (!/^[0-9]{1,9}$/.test(pageRaw)) return invalid('Parameter page tidak valid.');
    page = Number(pageRaw);
    if (!Number.isSafeInteger(page) || page < 1) return invalid('Parameter page tidak valid.');
  }

  const limitRaw = params.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    if (!/^[0-9]{1,9}$/.test(limitRaw)) return invalid('Parameter limit tidak valid.');
    const parsed = Number(limitRaw);
    if (!Number.isSafeInteger(parsed) || parsed < 1) return invalid('Parameter limit tidak valid.');
    limit = Math.min(parsed, MAX_LIMIT);
  }

  return valid({ page, limit, offset: (page - 1) * limit });
}

/** Filter teks dari query string: null/kosong → tanpa filter. */
export function readFilterString(
  params: URLSearchParams,
  name: string,
  maxLength: number,
): ParseResult<string | null> {
  const raw = params.get(name);
  if (raw === null) return valid(null);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return valid(null);
  if (trimmed.length > maxLength) {
    return invalid(`Parameter ${name} maksimal ${maxLength} karakter.`);
  }
  return valid(trimmed);
}

/** Filter tanggal dari query string: null/kosong → tanpa filter. */
export function readFilterDate(
  params: URLSearchParams,
  name: string,
): ParseResult<string | null> {
  const raw = params.get(name);
  if (raw === null) return valid(null);
  if (raw.trim().length === 0) return valid(null);
  const parsed = parseDateOnly(raw, name);
  if (parsed.ok === false) return invalid(parsed.message.replace(/^Field /, 'Parameter '));
  return valid(parsed.value);
}
