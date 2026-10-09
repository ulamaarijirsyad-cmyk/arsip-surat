/**
 * Phase 2E-2 — Validasi upload lampiran dokumen.
 *
 * Prinsip keamanan:
 * - Tipe file DITENTUKAN oleh magic bytes (signature) isi file, BUKAN oleh
 *   ekstensi nama file maupun header Content-Type dari klien (keduanya
 *   bisa dipalsukan dan TIDAK PERNAH dipakai untuk menentukan mime).
 * - Yang diizinkan (spesifikasi proyek + CHECK constraint di tabel
 *   documents): application/pdf, image/jpeg, image/png.
 * - Ekstensi nama file hanya dipakai sebagai lapis kedua: bila ada,
 *   wajib termasuk daftar izin DAN harus konsisten dengan isi file.
 * - Nama file asli dibersihkan (tanpa path/kontrol/kutip) dan HANYA
 *   disimpan ke database sebagai metadata — tidak pernah menentukan
 *   path di disk (path ditentukan adapter: nama UUID dari server).
 * - Validasi gagal TIDAK menyisakan file apa pun: file masih berupa
 *   buffer memori dari multer dan belum menyentuh storage.
 */
import path from 'node:path';
import { invalid, valid, type ParseResult } from '../validation/common';

/** Tipe yang diizinkan spesifikasi proyek — sama dengan CHECK di documents. */
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Magic bytes per tipe (dicek di offset 0). */
const SIGNATURES: ReadonlyArray<{ mime: AllowedMimeType; bytes: readonly number[] }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] }, // FF D8 FF
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // \x89PNG\r\n\x1a\n
];

/** Ekstensi yang diizinkan beserta tipe hasil deteksi isi file yang sah. */
const ALLOWED_EXTENSIONS: Record<string, AllowedMimeType> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** Batas panjang nama file asli yang disimpan (kolom varchar(255)). */
const MAX_FILENAME_LENGTH = 200;

/**
 * Deteksi tipe file dari magic bytes.
 * Mengembalikan tipe yang diizinkan, atau null bila tidak dikenal
 * (termasuk file kosong, teks biasa, atau signature rusak).
 */
export function detectFileType(buffer: Buffer): AllowedMimeType | null {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const sig of SIGNATURES) {
    if (buffer.length >= sig.bytes.length && buffer.subarray(0, sig.bytes.length).equals(Buffer.from(sig.bytes))) {
      return sig.mime;
    }
  }
  return null;
}

/**
 * Bersihkan nama file asli menjadi nama yang AMAN untuk metadata/headers:
 * tanpa direktori (path), tanpa karakter kontrol, tanpa kutip,
 * dipotong maksimal MAX_FILENAME_LENGTH. Mengembalikan '' bila kosong.
 */
export function sanitizeOriginalFilename(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const base = raw.split(/[\\/]/).pop() ?? '';
  return base
    .replace(/[\u0000-\u001f\u007f"\\]/g, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
}

export interface ValidatedUpload {
  buffer: Buffer;
  /** Hasil deteksi magic bytes — SATU-SATUNYA sumber kebenaran mime. */
  mimeType: AllowedMimeType;
  /** Nama asli (sudah dibersihkan) — hanya metadata database/UI. */
  originalFilename: string;
  sizeBytes: number;
}

export interface UploadInput {
  buffer: Buffer;
  originalFilename: unknown;
  /** Content-Type dari klien — HANYA dicatat, tidak pernah dipercaya. */
  declaredMime?: unknown;
  maxBytes: number;
}

/**
 * Validasi satu file hasil multer (memory storage).
 * Urutan: tidak kosong → dalam batas ukuran → magic bytes dikenal →
 * ekstensi (bila ada) diizinkan → ekstensi konsisten dengan isi.
 */
export function validateUploadFile(input: UploadInput): ParseResult<ValidatedUpload> {
  const { buffer, maxBytes } = input;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return invalid('File kosong atau tidak terbaca.');
  }
  if (buffer.length > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return invalid(`File melebihi batas ukuran maksimal (${limitMb} MB).`);
  }

  const detected = detectFileType(buffer);
  if (detected === null) {
    return invalid('Format file tidak dikenal. Yang diizinkan: PDF, JPG/JPEG, PNG.');
  }

  const originalFilename = sanitizeOriginalFilename(input.originalFilename);
  if (originalFilename === '') {
    return invalid('Nama file tidak valid.');
  }

  const ext = path.extname(originalFilename).toLowerCase();
  if (ext !== '') {
    const allowedMime = ALLOWED_EXTENSIONS[ext];
    if (allowedMime === undefined) {
      return invalid(`Ekstensi "${ext}" tidak diizinkan. Yang diizinkan: .pdf, .jpg, .jpeg, .png.`);
    }
    if (allowedMime !== detected) {
      return invalid(`Ekstensi "${ext}" tidak sesuai dengan isi file (terdeteksi ${detected}).`);
    }
  }

  // declaredMime sengaja TIDAK dibaca untuk menentukan hasil: magic bytes
  // sudah final. Klien boleh mengirim apa pun; hasil deteksi menang.
  return valid({
    buffer,
    mimeType: detected,
    originalFilename,
    sizeBytes: buffer.length,
  });
}

/**
 * Susun header Content-Disposition yang aman:
 * - inline (preview) atau attachment (download),
 * - nama file bebas CR/LF/kutip (anti header-injection),
 * - nama non-ASCII tetap utuh lewat RFC 5987 (filename*).
 */
export function buildContentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const safe = sanitizeOriginalFilename(filename).slice(0, 150) || 'dokumen';
  const ascii = safe.replace(/[^\u0020-\u007e]/g, '_');
  if (ascii === safe) {
    return `${kind}; filename="${safe}"`;
  }
  const encoded = encodeURIComponent(safe).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
