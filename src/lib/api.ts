/**
 * Helper API frontend — SEMUA request ke backend memakai file ini.
 *
 * URL SELALU relatif ('/api/...') sehingga aplikasi bekerja lewat
 * Vite proxy saat development maupun Express langsung saat production.
 * JANGAN pernah hardcode http://localhost:3001 / 127.0.0.1.
 *
 * Sesi login: cookie dikelola oleh browser (server-side session) —
 * frontend TIDAK PERNAH menyimpan password, session ID, maupun token.
 */
export const API_BASE = '/api';

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

// ---------------------------------------------------------------------------
// Error ramah-pengguna: semua pesan di bawah aman untuk ditampilkan ke UI
// (tanpa SQL, stack trace, password, session ID, atau detail database).
// ---------------------------------------------------------------------------

export type ApiErrorKind =
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'rateLimited'
  | 'payloadTooLarge'
  | 'server'
  | 'network';

const FRIENDLY_MESSAGES: Record<ApiErrorKind, string> = {
  badRequest: 'Terdapat data yang belum benar.',
  unauthorized: 'Sesi login telah berakhir. Silakan login kembali.',
  forbidden: 'Anda tidak memiliki hak akses untuk melakukan tindakan ini.',
  notFound: 'Surat tidak ditemukan.',
  rateLimited: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  payloadTooLarge: 'File terlalu besar untuk diunggah.',
  server: 'Terjadi kesalahan pada server.',
  network: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;

  constructor(kind: ApiErrorKind, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /**
   * true → tampilkan pesan `error` dari server apa adanya untuk respons 4xx.
   * Dipakai untuk login (pesan "Username atau password salah." / rate limit)
   * yang sudah pasti aman dari sisi backend.
   * Default false → pesan ramah standar per status.
   */
  showServerMessage?: boolean;
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return 'badRequest';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 413) return 'payloadTooLarge';
  if (status === 429) return 'rateLimited';
  return 'server';
}

/**
 * Susun ApiError aman dari respons gagal — SATU tempat pemetaan untuk
 * semua jalur request (JSON, multipart, maupun blob).
 * Pesan server hanya ditampilkan bila diizinkan (400/413/429 atau
 * showServerMessage) dan selalu ≤ 300 karakter; 5xx TIDAK PERNAH
 * menampilkan isi body.
 */
function apiErrorFromResponse(res: Response, payload: unknown, showServerMessage = false): ApiError {
  const kind = kindForStatus(res.status);
  const serverError = (payload as { error?: unknown } | null)?.error;
  const canShowServerMessage =
    typeof serverError === 'string' &&
    serverError.trim().length > 0 &&
    serverError.length <= 300 &&
    (showServerMessage ||
      kind === 'badRequest' ||
      kind === 'rateLimited' ||
      kind === 'payloadTooLarge');
  const message = canShowServerMessage ? serverError : FRIENDLY_MESSAGES[kind];
  return new ApiError(kind, message, res.status);
}

/** Baca body sebagai JSON (bila bukan JSON → null). */
async function readJsonPayload(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Request JSON tunggal untuk seluruh frontend.
 * - Melempar ApiError berpesan aman untuk semua kegagalan (400/401/403/404/429/5xx/jaringan).
 * - Respons 5xx TIDAK PERNAH menampilkan isi body (bisa memuat detail internal).
 * - Cookie sesi dikirim otomatis oleh browser (credentials same-origin).
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('network', FRIENDLY_MESSAGES.network, 0);
  }

  const payload = await readJsonPayload(res);
  if (!res.ok) {
    throw apiErrorFromResponse(res, payload, options.showServerMessage ?? false);
  }

  return payload as T;
}

/**
 * Request multipart/form-data yang mengembalikan respons JSON (mis. upload
 * lampiran). Body berupa FormData — header `Content-Type` TIDAK PERNAH
 * diset manual agar boundary dibuat oleh browser/fetch.
 * Cookie sesi dikirim otomatis (same-origin); error dipetakan sama dengan
 * apiFetch (400/401/403/404/413 → pesan aman).
 */
export async function apiFormDataFetch<T>(
  path: string,
  formData: FormData,
  method: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      body: formData,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('network', FRIENDLY_MESSAGES.network, 0);
  }

  const payload = await readJsonPayload(res);
  if (!res.ok) {
    throw apiErrorFromResponse(res, payload);
  }
  return payload as T;
}

/**
 * Request yang mengembalikan ISI FILE sebagai Blob (pratinjau/unduh
 * lampiran lewat endpoint /content dan /download).
 * Bila respons gagal, body dibaca sebagai JSON lalu dipetakan ke ApiError
 * yang sama seperti request JSON (pesan 4xx aman, 5xx generik).
 */
export async function apiBlobFetch(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET'): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method, credentials: 'same-origin' });
  } catch {
    throw new ApiError('network', FRIENDLY_MESSAGES.network, 0);
  }

  if (!res.ok) {
    const payload = await readJsonPayload(res);
    throw apiErrorFromResponse(res, payload);
  }
  return res.blob();
}
