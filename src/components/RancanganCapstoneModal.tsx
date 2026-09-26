import React, { useState } from 'react';
import { 
  X, 
  BookOpen, 
  Database, 
  GitBranch, 
  Cpu, 
  CheckCheck, 
  Copy, 
  Layers, 
  Server, 
  ShieldAlert,
  ArrowRight,
  FileSpreadsheet
} from 'lucide-react';

interface RancanganCapstoneModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RancanganCapstoneModal: React.FC<RancanganCapstoneModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const [activeSubTab, setActiveSubTab] = useState<'ringkasan' | 'erd' | 'alur' | 'spesifikasi'>('ringkasan');
  const [copied, setCopied] = useState(false);

  const fullMarkdownDocumentation = `# RANCANGAN PROYEK AKHIR / CAPSTONE PROJECT

## JUDUL USULAN:
Pengembangan Sistem Informasi Arsip Surat Masuk dan Surat Keluar (SI-ARSIP) Berbasis Web untuk Mengakomodasi Dokumen Non-TTE dan Akses Staf Terdesentralisasi

---

## 1. LATAR BELAKANG & IDENTIFIKASI MASALAH
Meskipun instansi telah menerapkan aplikasi pusat (SRIKANDI), terdapat kesenjangan operasional (*operational gap*) nyata pada level ruangan/seksi:
1. **Akses Berjenjang Terpusat**: Akses SRIKANDI terikat pada akun pimpinan (Kepala Kantor), sehingga staf ruangan tidak dapat mencari arsip lama saat pimpinan cuti atau dinas luar.
2. **Surat Keluar Non-TTE Tercecer**: Banyak surat yang ditandatangani manual (basah) tidak terekam di SRIKANDI dan hanya tersimpan di ponsel staf/WhatsApp grup.
3. **Pencarian Dokumen Lambat**: Sulit mencari surat yang pernah diproses berbulan-bulan lalu (misal: arsip pajak air permukaan, proposal yayasan, dll.).
4. **Kendala Biaya & Server**: Instansi membutuhkan solusi "Zero-Cost" yang tidak memerlukan anggaran server cloud mahal serta dapat berjalan di komputer ruangan yang spesifikasinya terbatas.

---

## 2. RANCANGAN SKEMA DATABASE (ERD & DDL)

### Tabel: surat_masuk
- id (VARCHAR(36) PRIMARY KEY)
- nomor_agenda (VARCHAR(50) UNIQUE) -- Nomor urut internal
- nomor_surat (VARCHAR(100) NOT NULL) -- Nomor surat resmi dari instansi luar
- tanggal_surat (DATE NOT NULL)
- tanggal_terima (DATE NOT NULL)
- asal_pengirim (VARCHAR(150) NOT NULL)
- tujuan_disposisi (VARCHAR(150))
- perihal (TEXT NOT NULL)
- ringkasan_isi (TEXT)
- kategori (VARCHAR(50)) -- Undangan, Laporan, Permohonan, dll.
- lokasi_ordner (VARCHAR(100)) -- Lokasi fisik buku/lemari
- created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

### Tabel: surat_keluar
- id (VARCHAR(36) PRIMARY KEY)
- nomor_agenda (VARCHAR(50) UNIQUE) -- Nomor urut buku agenda keluar (mencegah nomor dobel)
- nomor_surat (VARCHAR(100) NOT NULL)
- tanggal_surat (DATE NOT NULL)
- tanggal_kirim (DATE NOT NULL)
- bagian_pembuat (VARCHAR(150) NOT NULL)
- instansi_tujuan (VARCHAR(150) NOT NULL)
- perihal (TEXT NOT NULL)
- ringkasan_isi (TEXT)
- kategori (VARCHAR(50))
- tipe_tanda_tangan (VARCHAR(30)) -- 'Manual / Basah' vs 'TTE'
- penandatangan (VARCHAR(100)) -- Nama pejabat yang menandatangani
- created_at (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

### Tabel: disposisi
- id (VARCHAR(36) PRIMARY KEY)
- surat_masuk_id (VARCHAR(36) REFERENCES surat_masuk(id))
- dari_pejabat (VARCHAR(100))
- kepada_staf (VARCHAR(100))
- instruksi (TEXT NOT NULL)
- catatan (TEXT)
- tanggal_disposisi (DATETIME NOT NULL)
- status_selesai (BOOLEAN DEFAULT FALSE)

### Tabel: lampiran_berkas
- id (VARCHAR(36) PRIMARY KEY)
- referensi_id (VARCHAR(36)) -- ID surat masuk atau surat keluar
- nama_berkas (VARCHAR(255))
- path_file (TEXT) -- Lokasi penyimpanan lokal/server folder
- ukuran_file (VARCHAR(20))
- tipe_mime (VARCHAR(50)) -- PDF, JPG, PNG
- tanggal_unggah (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)

---

## 3. ARSITEKTUR ZERO-COST & LOW-MAINTENANCE
- **Hosting / Deployment**: Local Web Server (Node.js Express / Python / PHP) yang di-hosting pada salah satu PC kantor dengan IP Statis lokal (LAN).
- **Client**: Seluruh komputer staf di ruangan dapat mengakses via browser melalui alamat IP lokal (contoh: http://192.168.1.50:3000).
- **Penyimpanan Berkas**: Folder dedicated di PC host yang dibagikan (Network Share) atau di-backup berkala ke Google Drive gratis.
- **Ekspor Data**: Fitur ekspor ke Excel/CSV untuk arsip berkala dan sinkronisasi ke buku register manual.
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullMarkdownDocumentation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  DOKUMEN RANCANGAN CAPSTONE / TUGAS AKHIR
                </h2>
                <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono text-[10px] border border-indigo-400/30">
                  Siap Bimbingan Dosen
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Latar belakang, analisis kebutuhan, ERD, dan arsitektur Zero-Cost berbasis rekaman briefing
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors border border-slate-700"
              title="Salin naskah rancangan lengkap ke clipboard"
            >
              {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin!' : 'Salin Teks Markdown'}</span>
            </button>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="px-6 border-b border-slate-200 bg-slate-50 flex gap-2 pt-2 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActiveSubTab('ringkasan')}
            className={`px-3 py-2 border-b-2 transition-all ${
              activeSubTab === 'ringkasan'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            1. Problem & Urgensi
          </button>
          <button
            onClick={() => setActiveSubTab('erd')}
            className={`px-3 py-2 border-b-2 transition-all ${
              activeSubTab === 'erd'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            2. Skema Database (ERD)
          </button>
          <button
            onClick={() => setActiveSubTab('alur')}
            className={`px-3 py-2 border-b-2 transition-all ${
              activeSubTab === 'alur'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            3. Alur Kerja (Srikandi vs SI-Arsip)
          </button>
          <button
            onClick={() => setActiveSubTab('spesifikasi')}
            className={`px-3 py-2 border-b-2 transition-all ${
              activeSubTab === 'spesifikasi'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            4. Arsitektur Zero-Cost (LAN)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          
          {activeSubTab === 'ringkasan' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Problem Statement Nyata dari Rekaman Suara</span>
                </div>
                <p className="text-amber-950 leading-relaxed">
                  "Instansi punya SRIKANDI, tapi staf di ruangan tidak bisa login langsung karena akunnya terpusat di Kepala Kantor (Pak Rudito) lalu turun berjenjang. Kalau pimpinan cuti atau dinas luar, staf bingung mencari surat lama (misal: surat air permukaan 2-3 bulan lalu). Selain itu, <strong>surat keluar bertanda tangan manual (non-TTE) tidak ada di SRIKANDI</strong> dan hanya difoto ke WhatsApp sehingga berisiko hilang."
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Kelemahan Kondisi Eksisting
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px] leading-relaxed">
                    <li>Akun SRIKANDI terikat individu pimpinan; staf tidak memiliki akses pencarian mandiri.</li>
                    <li>Surat keluar manual (tanda tangan basah) tidak tercatat di SRIKANDI.</li>
                    <li>Pencarian manual di tumpukan folder komputer lambat saat file mencapai ribuan.</li>
                    <li>Pencatatan nomor surat di buku tulis / Excel rawan nomor loncat atau ganda.</li>
                    <li>Risiko pembaruan sistem pusat yang menghapus data arsip lama.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                  <h4 className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Solusi SI-ARSIP yang Dibangun
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-blue-900 text-[11px] leading-relaxed">
                    <li>Pencarian cepat kata kunci (misal: "air permukaan", nomor surat, pengirim) dalam 1 detik.</li>
                    <li>Ruang pengarsipan khusus surat non-TTE dengan lampiran foto bukti fisik tanda tangan.</li>
                    <li>Sistem penomoran agenda urut otomatis untuk mencegah nomor ganda.</li>
                    <li>Bisa diakses bersama seluruh PC staf ruangan tanpa perlu biaya hosting / server.</li>
                    <li>Fitur ekspor berkala ke Excel untuk laporan resmi pimpinan.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'erd' && (
            <div className="space-y-4">
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[11px] space-y-3">
                <div className="text-emerald-400 font-bold text-xs flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  <span>Relasi Antar Entitas (Entity-Relationship)</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 leading-relaxed overflow-x-auto text-slate-300">
                  {`[surat_masuk] 1 ──────── 0..* [disposisi]
       │
       └─────── 1..* [lampiran_berkas]

[surat_keluar] 1 ────── 1..* [lampiran_berkas]
(Fokus: Non-TTE & TTE)`}
                </div>
              </div>

              {/* Table definitions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 text-xs block">Tabel: surat_masuk</span>
                  <div className="space-y-1 text-[11px] font-mono text-slate-700">
                    <div>• <strong>id</strong> (PK, UUID/Varchar)</div>
                    <div>• <strong>nomor_agenda</strong> (Varchar, Urut Unik)</div>
                    <div>• <strong>nomor_surat</strong> (Varchar)</div>
                    <div>• <strong>tanggal_surat</strong> (Date)</div>
                    <div>• <strong>tanggal_terima</strong> (Date)</div>
                    <div>• <strong>asal_pengirim</strong> (Varchar)</div>
                    <div>• <strong>perihal</strong> (Text)</div>
                    <div>• <strong>ringkasan_isi</strong> (Text)</div>
                    <div>• <strong>kategori</strong> (Enum/Varchar)</div>
                    <div>• <strong>lokasi_ordner</strong> (Varchar)</div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                  <span className="font-bold text-slate-900 text-xs block">Tabel: surat_keluar</span>
                  <div className="space-y-1 text-[11px] font-mono text-slate-700">
                    <div>• <strong>id</strong> (PK, UUID/Varchar)</div>
                    <div>• <strong>nomor_agenda</strong> (Varchar, Urut Unik)</div>
                    <div>• <strong>nomor_surat</strong> (Varchar)</div>
                    <div>• <strong>tanggal_surat</strong> (Date)</div>
                    <div>• <strong>tanggal_kirim</strong> (Date)</div>
                    <div>• <strong>instansi_tujuan</strong> (Varchar)</div>
                    <div>• <strong>perihal</strong> (Text)</div>
                    <div>• <strong>tipe_tanda_tangan</strong> ('Manual/Basah' | 'TTE')</div>
                    <div>• <strong>penandatangan</strong> (Varchar, cth: Pak Rudito)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'alur' && (
            <div className="space-y-4">
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                <h4 className="font-bold text-slate-900 text-xs">Alur Penanganan Surat Masuk (Srikandi vs SI-Arsip)</h4>
                <div className="flex flex-col sm:flex-row items-center gap-2 text-xs">
                  <div className="p-2.5 bg-white border border-slate-300 rounded-lg text-center flex-1 w-full">
                    <span className="font-bold block text-blue-700">1. Surat Masuk</span>
                    <span className="text-[10px] text-slate-500">Via Srikandi / Fisik</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
                  <div className="p-2.5 bg-white border border-slate-300 rounded-lg text-center flex-1 w-full">
                    <span className="font-bold block text-slate-800">2. Disposisi Pimpinan</span>
                    <span className="text-[10px] text-slate-500">Pak Rudito → Bu Dwi</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
                  <div className="p-2.5 bg-blue-600 text-white rounded-lg text-center flex-1 w-full shadow-xs">
                    <span className="font-bold block">3. Input ke SI-ARSIP</span>
                    <span className="text-[10px] text-blue-100">Upload PDF & Nomor</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
                  <div className="p-2.5 bg-emerald-600 text-white rounded-lg text-center flex-1 w-full shadow-xs">
                    <span className="font-bold block">4. Akses Semua Staf</span>
                    <span className="text-[10px] text-emerald-100">Bisa dicari kapan saja</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-amber-200 rounded-xl bg-amber-50/60 space-y-3">
                <h4 className="font-bold text-amber-950 text-xs">Alur Surat Keluar Non-TTE (Tanda Tangan Manual)</h4>
                <p className="text-[11px] text-amber-900">
                  Surat yang dibuat oleh staf (Anita, Sanjaya, dll.) dan ditandatangani basah oleh pimpinan <strong>tidak dapat diunggah ke SRIKANDI</strong>. Dengan SI-ARSIP:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-bold text-amber-900 block">A. Ambil Nomor Urut</span>
                    <span className="text-[10px] text-slate-500">Sistem otomatis memberikan nomor urut agenda berikutnya.</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-bold text-amber-900 block">B. Tanda Tangan Basah</span>
                    <span className="text-[10px] text-slate-500">Surat dicetak & ditandatangani manual oleh Kepala Kantor.</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-bold text-amber-900 block">C. Foto/Scan & Unggah</span>
                    <span className="text-[10px] text-slate-500">Bukti fisik diunggah ke SI-ARSIP, tersimpan selamanya.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'spesifikasi' && (
            <div className="space-y-4">
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <Server className="w-4 h-4 text-emerald-600" />
                  <span>Penerapan Zero-Cost (Tanpa Biaya Server Tambahan)</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Berdasarkan penegasan pembimbing di rekaman suara ("komputer kita kan komputernya pemerintah, yang penting tanpa biaya"), sistem ini dirancang dengan:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">1. Local Host PC Ruangan</span>
                    <span className="text-[11px] text-slate-500">
                      Salah satu PC staf yang selalu menyala difungsikan sebagai host lokal. Komputer lain di ruangan mengakses via IP LAN.
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">2. Database Ringan (SQLite / PostgreSQL)</span>
                    <span className="text-[11px] text-slate-500">
                      Sangat efisien, memakan RAM di bawah 50MB, tidak membuat komputer kantor yang speknya terbatas menjadi lemot.
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">3. Backup Excel Otomatis</span>
                    <span className="text-[11px] text-slate-500">
                      Data rekap dapat diunduh ke Excel (.csv) sewaktu-waktu sebagai salinan cadangan instansi.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <span className="text-[11px] text-slate-500">
            Dapat langsung disalin dan dilampirkan pada Bab 3 Proposal Capstone Project
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
