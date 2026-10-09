export type JenisSurat = 'masuk' | 'keluar';

export type KategoriSurat = 
  | 'Undangan'
  | 'Permohonan'
  | 'Pemberitahuan'
  | 'Laporan'
  | 'Keputusan'
  | 'Surat Tugas'
  | 'Lainnya';

export type StatusDisposisi = 
  | 'Belum Didisposisi'
  | 'Didisposisi ke Pimpinan'
  | 'Diteruskan ke Seksi/Staf'
  | 'Selesai Ditindaklanjuti';

export type TipeTandaTangan = 'Manual / Basah' | 'TTE (Elektronik)';

export interface LampiranDokumen {
  id: string;
  namaFile: string;
  ukuran: string;
  tipe: 'pdf' | 'gambar';
  url: string;
  tanggalUpload: string;
  /**
   * HANYA untuk unggahan berikutnya (Phase 2E-3): berkas asli yang menunggu
   * ID surat masuk dari server. Tidak pernah disimpan ke localStorage /
   * base64 dan tidak pernah dikirim sebagai metadata — hanya dibaca App
   * saat upload setelah surat berhasil dibuat.
   */
  file?: File;
}

export interface DisposisiLog {
  id: string;
  dari: string;
  kepada: string;
  instruksi: string;
  tanggal: string;
  catatan?: string;
  sudahDibaca: boolean;
}

export interface SuratItem {
  id: string;
  jenis: JenisSurat;
  nomorSurat: string;
  nomorAgenda: string; // Nomor urut buku agenda internal
  tanggalSurat: string; // YYYY-MM-DD
  tanggalDiterimaAtauKirim: string; // YYYY-MM-DD
  asalPengirim: string; // Jika masuk: dari siapa; Jika keluar: instansi/bagian pembuat
  tujuanSurat: string; // Jika masuk: tujuan (cth: Kepala Kantor / Seksi A); Jika keluar: penerima luar
  perihal: string;
  ringkasanIsi: string;
  kategori: KategoriSurat;
  tipeTandaTangan?: TipeTandaTangan; // Khusus surat keluar (manual vs TTE)
  penandatangan?: string; // cth: Pak Rudito
  statusDisposisi?: StatusDisposisi;
  disposisi?: DisposisiLog[];
  lampiran: LampiranDokumen[];
  sumberAsal?: 'SRIKANDI (Disalin)' | 'Fisik Langsung' | 'Email/WA Internal' | 'Manual Bagian';
  lokasiFisikBuku?: string; // cth: "Ordner 2026 / Rak B-02"
  sifatSurat?: string; // Khusus surat masuk dari API (Biasa/Penting/Segera)
  apiSource?: boolean; // true bila baris berasal dari API (bukan localStorage)
}

// ---------------------------------------------------------------------------
// Model API backend (Phase 2D-1: /api/surat-masuk) — SANGGAAN DATA SURAT MASUK.
// Hanya field bisnis; TIDAK PERNAH memuat password / session / token.
// ---------------------------------------------------------------------------

export interface SuratMasuk {
  id: number;
  nomor_surat: string;
  tanggal_surat: string; // YYYY-MM-DD
  tanggal_diterima: string; // YYYY-MM-DD
  asal_instansi: string;
  perihal: string;
  jenis_surat: string;
  sifat_surat: string;
  penandatangan: string | null;
  keterangan: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SuratMasukPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuratMasukListResponse {
  data: SuratMasuk[];
  pagination: SuratMasukPagination;
}

/** User yang sedang login (dari GET /api/auth/me) — role dibaca dari server. */
export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: string; // 'admin' | 'petugas' | 'pimpinan'
}
