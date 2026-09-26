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
}
