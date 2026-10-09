/**
 * API Layer Lampiran Dokumen (Phase 2E-3) — klien resmi endpoint backend:
 *
 *   GET    /api/surat-masuk/:id/documents   → { data: LampiranDokumenApi[] }
 *   POST   /api/surat-masuk/:id/documents   → { data: LampiranDokumenApi }   (multipart, field `file`)
 *   GET    /api/documents/:id/content       → byte file (pratinjau)
 *   GET    /api/documents/:id/download      → byte file (unduhan)
 *   DELETE /api/documents/:id               → { status, message }            (soft delete)
 *
 * Kontrak di atas diverifikasi langsung dari `server/src/routes/documents.ts`
 * (bukan dari asumsi). Respons metadata TIDAK PERNAH memuat stored_filename
 * / storage_path — path fisik server tidak pernah diketahui frontend.
 *
 * Semua request memakai helper `src/lib/api.ts` (same-origin, cookie sesi
 * dikirim browser, error dipetakan ke ApiError berpesan aman).
 * File TIDAK PERNAH disimpan sebagai base64 / localStorage / URL placeholder.
 */
import { ApiError, apiBlobFetch, apiFormDataFetch, apiFetch } from './api';
import type { LampiranDokumen } from '../types';

/**
 * Batas unggah — samakan dengan default backend (MAX_UPLOAD_MB = 5).
 * Validasi ini hanya lapisan AWAL agar pesan cepat muncul di UI;
 * keputusan tetap di server (magic bytes + batas sebenarnya).
 */
export const MAX_UKURAN_LAMPIRAN_BYTES = 5 * 1024 * 1024;

const EKSTENSI_DIIZINKAN = ['.pdf', '.jpg', '.jpeg', '.png'];
const MIME_DIIZINKAN = ['application/pdf', 'image/jpeg', 'image/png'];

/** Metadata lampiran sesuai respons backend — tanpa field internal server. */
export interface LampiranDokumenApi {
  id: number;
  surat_masuk_id: number | null;
  surat_keluar_id: number | null;
  original_filename: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number;
  created_at: string;
}

/**
 * Validasi awal di frontend (keputusan akhir tetap di backend).
 * Mengembalikan pesan ramah bila ditolak, atau null bila lolos.
 */
export function validasiFileLampiran(file: File): string | null {
  const nama = file.name.toLowerCase();
  const ekstensiOk = EKSTENSI_DIIZINKAN.some(ext => nama.endsWith(ext));
  const mimeOk = MIME_DIIZINKAN.includes(file.type);
  if (!ekstensiOk && !mimeOk) {
    return 'Tipe file tidak didukung. Yang diizinkan: PDF, JPG/JPEG, atau PNG.';
  }
  if (file.size === 0) {
    return 'File kosong. Pilih berkas lain.';
  }
  if (file.size > MAX_UKURAN_LAMPIRAN_BYTES) {
    return `File melebihi batas ukuran maksimal (${MAX_UKURAN_LAMPIRAN_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

/** Format ukuran byte → teks singkat (mis. 913 KB, 1.2 MB). */
export function formatUkuranFile(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ekstensi tampilan dari nama asli (hanya bila ada); fallback ke tipe umum. */
export function labelTipeFile(namaFile: string, tipeUmum: string): string {
  const dot = namaFile.lastIndexOf('.');
  if (dot > 0 && dot < namaFile.length - 1) return namaFile.slice(dot + 1).toUpperCase();
  return tipeUmum.toUpperCase();
}

/** Respons API → model tampilan. `url` dikosongkan: pratinjau SELALU lewat /content. */
export function mapLampiranApiToItem(doc: LampiranDokumenApi): LampiranDokumen {
  return {
    id: String(doc.id),
    namaFile: doc.original_filename,
    ukuran: formatUkuranFile(doc.file_size),
    tipe: doc.mime_type === 'application/pdf' ? 'pdf' : 'gambar',
    url: '',
    tanggalUpload: typeof doc.created_at === 'string' ? doc.created_at.slice(0, 10) : ''
  };
}

/**
 * Pesan 404 pada endpoint dokumen dibuat lebih spesifik (pesan ramah
 * global menyebut "surat", tidak tepat untuk lampiran).
 */
function errDokumen(err: unknown): unknown {
  if (err instanceof ApiError && err.kind === 'notFound') {
    return new ApiError('notFound', 'Lampiran tidak ditemukan atau sudah dihapus.', err.status);
  }
  return err;
}

/** GET daftar lampiran surat masuk. 404 = surat tidak ada/terhapus. */
export async function fetchDaftarLampiran(suratMasukId: string | number): Promise<LampiranDokumenApi[]> {
  const res = await apiFetch<{ data?: LampiranDokumenApi[] }>(`/surat-masuk/${suratMasukId}/documents`);
  return Array.isArray(res.data) ? res.data : [];
}

/** POST satu file (FormData field `file`) ke surat masuk yang SUDAH ada ID-nya. */
export async function uploadLampiran(suratMasukId: string | number, file: File): Promise<LampiranDokumenApi> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const res = await apiFormDataFetch<{ data?: LampiranDokumenApi }>(
    `/surat-masuk/${suratMasukId}/documents`,
    formData,
  );
  if (!res.data) {
    throw new ApiError('server', 'Respons server tidak dikenali.', 500);
  }
  return res.data;
}

/** Ambil isi file (Blob) dari endpoint konten — dipakai pratinjau & unduhan. */
export async function fetchBlobLampiran(dokumenId: number, mode: 'content' | 'download'): Promise<Blob> {
  try {
    return await apiBlobFetch(`/documents/${dokumenId}/${mode}`);
  } catch (err) {
    throw errDokumen(err);
  }
}

/** Soft delete lampiran (backend mempertahankan file fisik). */
export async function hapusLampiran(dokumenId: number): Promise<void> {
  try {
    await apiFetch(`/documents/${dokumenId}`, { method: 'DELETE' });
  } catch (err) {
    throw errDokumen(err);
  }
}
