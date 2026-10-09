import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  Calendar, 
  Inbox, 
  Send, 
  Check, 
  Paperclip, 
  Image as ImageIcon,
  AlertCircle,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { JenisSurat, KategoriSurat, SuratItem, TipeTandaTangan, LampiranDokumen } from '../types';
import { formatUkuranFile, validasiFileLampiran } from '../lib/documents';

interface ModalTambahSuratProps {
  isOpen: boolean;
  onClose: () => void;
  defaultJenis: JenisSurat;
  items: SuratItem[];
  /**
   * Simpan surat. Surat masuk dikirim ke API oleh App (boleh berupa
   * Promise; error DILEMPAR agar pesannya tampil di modal, bukan crash).
   */
  onSave: (newItem: SuratItem) => void | Promise<void>;
}

export const ModalTambahSurat: React.FC<ModalTambahSuratProps> = ({
  isOpen,
  onClose,
  defaultJenis,
  items,
  onSave
}) => {
  // Semua hook dideklarasikan SEBELUM conditional return (aturan React Hooks).
  const [jenis, setJenis] = useState<JenisSurat>(defaultJenis);
  
  // Calculate recommended agenda number
  const nextAgendaIndex = items.filter(i => i.jenis === jenis).length + 1;
  const initialAgenda = jenis === 'masuk' 
    ? `AGD-M-2026-${String(nextAgendaIndex + 84).padStart(3, '0')}`
    : `AGD-K-2026-${String(nextAgendaIndex + 41).padStart(3, '0')}`;

  const todayStr = new Date().toISOString().slice(0, 10);

  const [nomorAgenda, setNomorAgenda] = useState(initialAgenda);
  const [nomorSurat, setNomorSurat] = useState('');
  const [tanggalSurat, setTanggalSurat] = useState(todayStr);
  const [tanggalCatat, setTanggalCatat] = useState(todayStr);
  const [asalPengirim, setAsalPengirim] = useState(
    jenis === 'masuk' ? '' : 'Subbag Tata Usaha / Bapenda'
  );
  const [tujuanSurat, setTujuanSurat] = useState(
    jenis === 'masuk' ? 'Kepala Kantor (Bpk. Rudito)' : ''
  );
  const [perihal, setPerihal] = useState('');
  const [ringkasanIsi, setRingkasanIsi] = useState('');
  const [kategori, setKategori] = useState<KategoriSurat>('Undangan');
  const [tipeTandaTangan, setTipeTandaTangan] = useState<TipeTandaTangan>('Manual / Basah');
  const [penandatangan, setPenandatangan] = useState('Bpk. Rudito (Kepala Kantor)');
  const [lokasiFisikBuku, setLokasiFisikBuku] = useState(
    jenis === 'masuk' ? 'Ordner SM-09 / Rak Dokumen A1' : 'Buku Arsip Surat Keluar Non-TTE 2026'
  );
  const [instruksiDisposisi, setInstruksiDisposisi] = useState('');
  // Sifat surat — wajib diisi untuk surat masuk (kolom NOT NULL di API).
  const [sifatSurat, setSifatSurat] = useState<'Biasa' | 'Penting' | 'Segera'>('Biasa');

  // Uploaded files
  const [lampiranList, setLampiranList] = useState<LampiranDokumen[]>([]);
  const [simulatedFileName, setSimulatedFileName] = useState('');
  // Pesan validasi awal pemilihan file (tipe/ukuran) — server tetap final.
  const [fileError, setFileError] = useState('');

  // Status penyimpanan (mencegah double-submit & menampilkan error API).
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Guard SINKRON: state React baru ter-commit setelah handler selesai,
  // sehingga klik ganda dalam satu task JS yang sama diblokir oleh ref ini.
  const savingRef = useRef(false);

  if (!isOpen) return null;

  const handleSimulateAddAttachment = (type: 'pdf' | 'gambar') => {
    const filename = simulatedFileName.trim() 
      ? simulatedFileName.trim() 
      : type === 'pdf' 
        ? `scan_${jenis}_${nomorAgenda.toLowerCase()}.pdf`
        : `foto_fisik_tanda_tangan_${jenis}_${nomorAgenda.toLowerCase()}.jpg`;

    const newAtt: LampiranDokumen = {
      id: `att-${Date.now()}`,
      namaFile: filename,
      ukuran: type === 'pdf' ? '1.2 MB' : '2.4 MB',
      tipe: type,
      url: type === 'pdf'
        ? 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80',
      tanggalUpload: todayStr
    };

    setLampiranList([...lampiranList, newAtt]);
    setSimulatedFileName('');
  };

  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // izinkan memilih file yang sama lagi
    if (!file) return;

    if (jenis === 'masuk') {
      // Surat Masuk: staging berkas ASLI untuk diunggah App setelah surat
      // tersimpan dan memiliki ID. Tanpa URL placeholder.
      const galat = validasiFileLampiran(file);
      if (galat) {
        setFileError(galat);
        return;
      }
      setFileError('');
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      const newAtt: LampiranDokumen = {
        id: `att-${Date.now()}`,
        namaFile: file.name,
        ukuran: formatUkuranFile(file.size),
        tipe: isPdf ? 'pdf' : 'gambar',
        url: '', // pratinjau menembus endpoint /content — bukan URL langsung
        tanggalUpload: todayStr,
        file
      };
      setLampiranList([...lampiranList, newAtt]);
      return;
    }

    // Surat Keluar: perilaku prototipe LAMA dipertahankan apa adanya
    // (backend untuk surat keluar belum ada — di luar scope phase ini).
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const newAtt: LampiranDokumen = {
      id: `att-${Date.now()}`,
      namaFile: file.name,
      ukuran: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      tipe: isPdf ? 'pdf' : 'gambar',
      url: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=80',
      tanggalUpload: todayStr
    };
    setLampiranList([...lampiranList, newAtt]);
  };

  /**
   * Tutup modal sambil membuang staging lampiran — mencegah berkas lama
   * tidak sengaja terunggah ke surat berikutnya yang dibuka.
   */
  const handleClose = () => {
    setLampiranList([]);
    setFileError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || savingRef.current) return;

    if (!nomorSurat.trim() || !perihal.trim()) {
      alert('Mohon isi Nomor Surat dan Perihal terlebih dahulu.');
      return;
    }

    const newItem: SuratItem = {
      id: `${jenis === 'masuk' ? 'SM' : 'SK'}-${Date.now()}`,
      jenis,
      nomorSurat: nomorSurat.trim(),
      nomorAgenda: nomorAgenda.trim(),
      tanggalSurat,
      tanggalDiterimaAtauKirim: tanggalCatat,
      asalPengirim: asalPengirim.trim() || (jenis === 'masuk' ? 'Eksternal' : 'Internal Kantor'),
      tujuanSurat: tujuanSurat.trim() || (jenis === 'masuk' ? 'Kepala Kantor' : 'Eksternal'),
      perihal: perihal.trim(),
      ringkasanIsi: ringkasanIsi.trim() || perihal.trim(),
      kategori,
      sifatSurat: jenis === 'masuk' ? sifatSurat : undefined,
      tipeTandaTangan: jenis === 'keluar' ? tipeTandaTangan : undefined,
      penandatangan: jenis === 'keluar' ? penandatangan : undefined,
      statusDisposisi: jenis === 'masuk' ? (instruksiDisposisi ? 'Diteruskan ke Seksi/Staf' : 'Belum Didisposisi') : undefined,
      sumberAsal: jenis === 'keluar' && tipeTandaTangan === 'Manual / Basah' ? 'Manual Bagian' : 'SRIKANDI (Disalin)',
      lokasiFisikBuku,
      apiSource: jenis === 'masuk',
      disposisi: jenis === 'masuk' && instruksiDisposisi ? [
        {
          id: `disp-${Date.now()}`,
          dari: 'Bpk. Rudito (Kepala)',
          kepada: tujuanSurat,
          instruksi: instruksiDisposisi,
          tanggal: `${todayStr} 08:30`,
          sudahDibaca: false
        }
      ] : [],
      lampiran: jenis === 'masuk'
        // Surat Masuk: daftar berkas asli menunggu diunggah App SETELAH surat
        // tersimpan (bukan data palsu; server adalah sumber kebenaran).
        ? lampiranList
        // Surat Keluar: prototipe lokal dipertahankan seperti sebelumnya.
        : lampiranList.length > 0 ? lampiranList : [
          {
            id: `att-default-${Date.now()}`,
            namaFile: `dokumen_${jenis === 'masuk' ? 'masuk' : 'keluar_manual'}_arsip.pdf`,
            ukuran: '850 KB',
            tipe: 'pdf',
            url: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=800&q=80',
            tanggalUpload: todayStr
          }
        ]
    };

    // Surat masuk: App mengirim ke API (POST /api/surat-masuk) — bila gagal,
    // error dilempar ke sini agar ditampilkan sebagai pesan ramah di modal.
    try {
      savingRef.current = true;
      setIsSaving(true);
      setSaveError('');
      await onSave(newItem);
      handleClose();
    } catch (err) {
      setSaveError(err instanceof Error && err.message ? err.message : 'Gagal menyimpan. Silakan coba lagi.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${
              jenis === 'masuk' ? 'bg-blue-600' : 'bg-indigo-600'
            }`}>
              {jenis === 'masuk' ? <Inbox className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Pencatatan {jenis === 'masuk' ? 'Surat Masuk' : 'Surat Keluar (Non-TTE / TTE)'}
              </h2>
              <p className="text-xs text-slate-500">
                Data disimpan langsung di pangkalan arsip lokal ruangan
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
          
          {/* Switch Jenis Surat */}
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setJenis('masuk');
                setAsalPengirim('');
                setTujuanSurat('Kepala Kantor (Bpk. Rudito)');
                // Staging lampiran tidak boleh bercampur antar jenis surat.
                setLampiranList([]);
                setFileError('');
              }}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                jenis === 'masuk' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              Surat Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setJenis('keluar');
                setAsalPengirim('Subbag Tata Usaha / Bapenda');
                setTujuanSurat('');
                setLampiranList([]);
                setFileError('');
              }}
              className={`flex-1 py-1.5 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                jenis === 'keluar' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              Surat Keluar (Non-TTE / Manual)
            </button>
          </div>

          {/* Row 1: Nomor Agenda & Nomor Surat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Nomor Urut Agenda (Otomatis)
              </label>
              <input
                type="text"
                value={nomorAgenda}
                onChange={(e) => setNomorAgenda(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900"
                placeholder="Cth: AGD-M-2026-087"
                required
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Mencegah nomor urut loncat atau terduplikasi
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Nomor Surat Resmi <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={nomorSurat}
                onChange={(e) => setNomorSurat(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 text-slate-900"
                placeholder="Cth: 005/7412/ESDM/IX/2026"
                required
              />
            </div>
          </div>

          {/* Khusus Surat Keluar: Tanda Tangan Basah vs TTE */}
          {jenis === 'keluar' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-amber-900 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Pengaturan Format Tanda Tangan & Penomoran Keluar</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-amber-900 mb-1">
                    Jenis Tanda Tangan
                  </label>
                  <select
                    value={tipeTandaTangan}
                    onChange={(e) => setTipeTandaTangan(e.target.value as TipeTandaTangan)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Manual / Basah">Manual / Basah (Tanda Tangan Fisik)</option>
                    <option value="TTE (Elektronik)">TTE (Tanda Tangan Elektronik SRIKANDI)</option>
                  </select>
                  <span className="text-[10px] text-amber-700 mt-0.5 block">
                    {tipeTandaTangan === 'Manual / Basah'
                      ? '✓ Wajib simpan foto/scan berkas fisik karena tidak ada di SRIKANDI.'
                      : 'Tercatat juga di sistem SRIKANDI.'}
                  </span>
                </div>

                <div>
                  <label className="block font-medium text-amber-900 mb-1">
                    Penandatangan Surat
                  </label>
                  <input
                    type="text"
                    value={penandatangan}
                    onChange={(e) => setPenandatangan(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-slate-800"
                    placeholder="Bpk. Rudito (Kepala Kantor)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Row 2: Tanggal Surat & Tanggal Catat/Kirim */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Tanggal yang Tertera pada Surat
              </label>
              <input
                type="date"
                value={tanggalSurat}
                onChange={(e) => setTanggalSurat(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {jenis === 'masuk' ? 'Tanggal Diterima Kantor' : 'Tanggal Surat Dikirim'}
              </label>
              <input
                type="date"
                value={tanggalCatat}
                onChange={(e) => setTanggalCatat(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Row 3: Pengirim & Tujuan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {jenis === 'masuk' ? 'Asal Instansi Pengirim' : 'Bagian / Seksi Pengirim'}
              </label>
              <input
                type="text"
                value={asalPengirim}
                onChange={(e) => setAsalPengirim(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                placeholder={jenis === 'masuk' ? 'Cth: Dinas ESDM / Yayasan Bhakti' : 'Cth: Seksi Pelayanan Pajak'}
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {jenis === 'masuk' ? 'Tujuan / Disposisi Ke' : 'Pihak / Instansi Tujuan'}
              </label>
              <input
                type="text"
                value={tujuanSurat}
                onChange={(e) => setTujuanSurat(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                placeholder={jenis === 'masuk' ? 'Cth: Bpk. Rudito / Seksi Terkait' : 'Cth: Camat Ungaran Barat / UDINUS'}
                required
              />
            </div>
          </div>

          {/* Perihal Surat */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Perihal Surat <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={perihal}
              onChange={(e) => setPerihal(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500"
              placeholder="Cth: Koordinasi Pendataan Pajak Air Permukaan Wilayah I"
              required
            />
          </div>

          {/* Ringkasan & Kategori */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-800 mb-1">
                Ringkasan Isi / Catatan Singkat
              </label>
              <textarea
                rows={2}
                value={ringkasanIsi}
                onChange={(e) => setRingkasanIsi(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                placeholder="Rangkuman hal pokok agar staf cepat memahami tanpa membuka lembar fisik..."
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                Kategori Surat
              </label>
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value as KategoriSurat)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Undangan">Undangan</option>
                <option value="Permohonan">Permohonan</option>
                <option value="Pemberitahuan">Pemberitahuan</option>
                <option value="Laporan">Laporan</option>
                <option value="Keputusan">Keputusan</option>
                <option value="Surat Tugas">Surat Tugas</option>
                <option value="Lainnya">Lainnya</option>
              </select>

              <label className="block font-semibold text-slate-800 mt-2 mb-1">
                Lokasi Ordner / Buku Fisik
              </label>
              <input
                type="text"
                value={lokasiFisikBuku}
                onChange={(e) => setLokasiFisikBuku(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs"
                placeholder="Ordner SM-09"
              />

              {jenis === 'masuk' && (
                <>
                  <label className="block font-semibold text-slate-800 mt-2 mb-1">
                    Sifat Surat <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={sifatSurat}
                    onChange={(e) => setSifatSurat(e.target.value as 'Biasa' | 'Penting' | 'Segera')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Biasa">Biasa</option>
                    <option value="Penting">Penting</option>
                    <option value="Segera">Segera</option>
                  </select>
                </>
              )}
            </div>
          </div>

          {/* Disposisi Awal (Jika Surat Masuk) */}
          {jenis === 'masuk' && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5">
              <label className="block font-semibold text-blue-900">
                Catatan Disposisi Awal (Opsional)
              </label>
              <input
                type="text"
                value={instruksiDisposisi}
                onChange={(e) => setInstruksiDisposisi(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-slate-800 placeholder:text-slate-400"
                placeholder="Cth: Tindak lanjuti bersama tim teknis dan siapkan rekap..."
              />
              <span className="text-[10px] text-blue-700 block">
                Catatan disposisi ini langsung dapat dilihat oleh staf lain tanpa harus menunggu pimpinan login ke akun pribadi.
              </span>
            </div>
          )}

          {/* Upload Scan / Foto Berkas Section */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                Unggah Berkas Scan / Foto Fisik Surat
              </label>
              <span className="text-[11px] text-slate-400">
                {jenis === 'masuk'
                  ? 'Maks. 5 MB per file • PDF, JPG/JPEG, PNG'
                  : 'Mendukung PDF & Gambar (Foto Kamera HP / Scanner)'}
              </span>
            </div>

            {jenis === 'masuk' && fileError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{fileError}</span>
              </div>
            )}

            {/* List existing attached files */}
            {lampiranList.length > 0 && (
              <div className="space-y-1.5">
                {lampiranList.map((att, idx) => (
                  <div key={att.id} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center gap-2">
                      {att.tipe === 'pdf' ? (
                        <FileText className="w-4 h-4 text-rose-500" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-blue-500" />
                      )}
                      <span className="font-medium text-slate-800">{att.namaFile}</span>
                      <span className="text-slate-400 text-[10px]">({att.ukuran})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLampiranList(lampiranList.filter((_, i) => i !== idx))}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tombol simulasi HANYA untuk Surat Keluar (prototipe lokal);
                Surat Masuk memakai unggah file sungguhan di atas. */}
            {jenis === 'keluar' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="file"
                  id="file-upload-input"
                  onChange={handleFileDrop}
                  className="hidden"
                  accept=".pdf,image/*"
                />
                <label
                  htmlFor="file-upload-input"
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Pilih Berkas dari PC
                </label>

                <button
                  type="button"
                  onClick={() => handleSimulateAddAttachment('pdf')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-[11px]"
                >
                  <FileText className="w-3 h-3 text-rose-600" />
                  + Simulasi Scan PDF
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulateAddAttachment('gambar')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-[11px]"
                >
                  <ImageIcon className="w-3 h-3 text-blue-600" />
                  + Simulasi Foto Berkas Fisik
                </button>
              </div>
            )}

            {jenis === 'masuk' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="file"
                  id="file-upload-input-masuk"
                  onChange={handleFileDrop}
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                />
                <label
                  htmlFor="file-upload-input-masuk"
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Pilih Berkas dari PC
                </label>
                <span className="text-[11px] text-slate-400">
                  File diunggah ke server setelah surat berhasil disimpan.
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            {saveError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{saveError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed ${
                  jenis === 'masuk' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {isSaving ? 'Menyimpan...' : 'Simpan ke Arsip Lokal'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
