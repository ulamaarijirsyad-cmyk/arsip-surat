import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  FileText, 
  Calendar, 
  Building, 
  User, 
  Inbox, 
  Send, 
  Paperclip, 
  ExternalLink, 
  FolderOpen, 
  CheckCircle2, 
  Clock, 
  FileCheck,
  SendHorizontal,
  Download,
  Eye,
  Loader2,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { SuratItem, DisposisiLog, LampiranDokumen } from '../types';
import { ApiError } from '../lib/api';
import {
  fetchBlobLampiran,
  fetchDaftarLampiran,
  hapusLampiran,
  labelTipeFile,
  mapLampiranApiToItem
} from '../lib/documents';

interface ModalDetailSuratProps {
  item: SuratItem | null;
  onClose: () => void;
  onAddDisposisi: (suratId: string, disposisi: DisposisiLog) => void;
  onPreviewLampiranUrl: (url: string, title: string) => void;
  /** true saat mengambil detail terbaru dari API (GET /:id). */
  isLoading?: boolean;
  /** Pesan gagal memuat detail (ramah pengguna, dari ApiError). */
  error?: string;
  onRetry?: () => void;
  /**
   * true bila role user saat ini boleh menghapus lampiran (admin/petugas).
   * Penyembunyian tombol BUKAN keamanan — backend tetap memeriksa role.
   */
  canManageLampiran?: boolean;
}

export const ModalDetailSurat: React.FC<ModalDetailSuratProps> = ({
  item,
  onClose,
  onAddDisposisi,
  onPreviewLampiranUrl,
  isLoading = false,
  error = '',
  onRetry,
  canManageLampiran = false
}) => {
  // Semua hook dideklarasikan SEBELUM conditional return agar jumlah
  // hook stabil antar render (mengikuti aturan React Hooks).
  const [kepada, setKepada] = useState('');
  const [instruksi, setInstruksi] = useState('');
  const [catatan, setCatatan] = useState('');

  // ---- Lampiran dokumen (Phase 2E-3): daftar dari API, hanya Surat Masuk ----
  const [daftarLampiran, setDaftarLampiran] = useState<LampiranDokumen[] | null>(null);
  const [lampiranLoading, setLampiranLoading] = useState(false);
  const [lampiranError, setLampiranError] = useState('');
  const [aksiBusyId, setAksiBusyId] = useState<string | null>(null);
  const [aksiError, setAksiError] = useState('');
  const lampiranSeqRef = useRef(0);

  /**
   * Muat daftar lampiran dari backend — HANYA untuk Surat Masuk dari API.
   * Surat Keluar (prototipe lokal) tetap memakai item.lampiran tanpa request.
   * Guard `seq` membuat respons basi (modal ditutup/ganti) diabaikan.
   */
  const loadLampiran = (target: SuratItem | null) => {
    const seq = ++lampiranSeqRef.current;
    setDaftarLampiran(null);
    setLampiranError('');
    setAksiError('');
    setAksiBusyId(null); // aksi lama milik surat sebelumnya tidak berlaku lagi
    if (!target || target.jenis !== 'masuk' || !target.apiSource) {
      setLampiranLoading(false);
      return;
    }
    setLampiranLoading(true);
    fetchDaftarLampiran(target.id)
      .then(list => {
        if (seq !== lampiranSeqRef.current) return;
        setDaftarLampiran(list.map(mapLampiranApiToItem));
        setLampiranLoading(false);
      })
      .catch((err: unknown) => {
        if (seq !== lampiranSeqRef.current) return;
        setDaftarLampiran(null);
        setLampiranLoading(false);
        setLampiranError(err instanceof ApiError ? err.message : 'Gagal memuat daftar lampiran.');
      });
  };

  useEffect(() => {
    loadLampiran(item);
    return () => {
      lampiranSeqRef.current++; // request melayang jadi basi saat ganti/unmount
    };
    // Muat ulang hanya bila surat yang dituju berganti (bukan sekadar object baru).
  }, [item?.id, item?.jenis, item?.apiSource]);

  /** Pratinjau: ambil byte dari /content → object URL (dicabut App saat tutup). */
  const handlePreviewLampiranApi = async (att: LampiranDokumen) => {
    setAksiBusyId(att.id);
    setAksiError('');
    try {
      const blob = await fetchBlobLampiran(Number(att.id), 'content');
      onPreviewLampiranUrl(URL.createObjectURL(blob), att.namaFile);
    } catch (err) {
      setAksiError(err instanceof ApiError ? err.message : 'Gagal memuat pratinjau lampiran.');
    } finally {
      setAksiBusyId(null);
    }
  };

  /** Unduh: ambil byte dari /download → object URL + <a download>. */
  const handleUnduhLampiranApi = async (att: LampiranDokumen) => {
    setAksiBusyId(att.id);
    setAksiError('');
    try {
      const blob = await fetchBlobLampiran(Number(att.id), 'download');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = att.namaFile; // nama asli dari metadata server
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Cabut object URL setelah browser sempat memulai unduhan (batas 30 dtk)
      // agar tidak menumpuk di memori.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setAksiError(err instanceof ApiError ? err.message : 'Gagal mengunduh lampiran.');
    } finally {
      setAksiBusyId(null);
    }
  };

  /** Hapus lampiran (soft delete di server) → daftar dimuat ulang. */
  const handleHapusLampiranApi = async (att: LampiranDokumen) => {
    if (!window.confirm(`Hapus lampiran "${att.namaFile}"?`)) return;
    setAksiBusyId(att.id);
    setAksiError('');
    try {
      await hapusLampiran(Number(att.id));
      loadLampiran(item); // segarkan daftar setelah hapus berhasil
    } catch (err) {
      setAksiError(err instanceof ApiError ? err.message : 'Gagal menghapus lampiran.');
    } finally {
      setAksiBusyId(null);
    }
  };

  if (!item) return null;

  const isMasuk = item.jenis === 'masuk';
  /** Daftar yang ditampilkan: API untuk Surat Masuk, lokal untuk Surat Keluar. */
  const daftarTampil: LampiranDokumen[] = isMasuk ? (daftarLampiran ?? []) : item.lampiran;

  const handleKirimDisposisi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kepada.trim() || !instruksi.trim()) {
      alert('Tujuan disposisi dan instruksi tidak boleh kosong');
      return;
    }

    const newLog: DisposisiLog = {
      id: `disp-${Date.now()}`,
      dari: 'Staf Penerima Disposisi',
      kepada: kepada.trim(),
      instruksi: instruksi.trim(),
      catatan: catatan.trim() || undefined,
      tanggal: new Date().toISOString().replace('T', ' ').slice(0, 16),
      sudahDibaca: false
    };

    onAddDisposisi(item.id, newLog);
    setKepada('');
    setInstruksi('');
    setCatatan('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${
              isMasuk ? 'bg-blue-600' : 'bg-indigo-600'
            }`}>
              {isMasuk ? <Inbox className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                {item.nomorAgenda && (
                  <span className="font-mono text-xs font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded">
                    {item.nomorAgenda}
                  </span>
                )}
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isMasuk ? 'Arsip Surat Masuk' : 'Arsip Surat Keluar'}
                </span>
              </div>
              <h2 className="text-sm font-bold text-slate-900 mt-0.5 truncate max-w-md sm:max-w-lg">
                {item.nomorSurat}
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="p-6 overflow-y-auto">
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Memuat detail surat...</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 overflow-y-auto">
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
              <p className="text-xs font-semibold text-slate-700">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-4 py-2 bg-blue-50 text-blue-600 font-semibold text-xs rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Coba lagi
                </button>
              )}
            </div>
          </div>
        ) : (
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          
          {/* Main Title & Perihal */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
              Perihal Surat
            </span>
            <h1 className="text-base font-bold text-slate-900 leading-snug">
              {item.perihal}
            </h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {item.ringkasanIsi || '—'}
            </p>
          </div>

          {/* Key Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white border border-slate-200 p-3.5 rounded-xl">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Kategori</span>
              <span className="font-semibold text-slate-800 text-xs mt-0.5 block">{item.kategori}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Tanggal Surat</span>
              <span className="font-semibold text-slate-800 text-xs mt-0.5 block">{item.tanggalSurat}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">
                {isMasuk ? 'Tanggal Diterima' : 'Tanggal Dikirim'}
              </span>
              <span className="font-semibold text-slate-800 text-xs mt-0.5 block">{item.tanggalDiterimaAtauKirim}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Format Validasi</span>
              {isMasuk ? (
                <span className="font-medium text-blue-700 text-xs mt-0.5 block">{item.sumberAsal || 'Fisik Langsung'}</span>
              ) : (
                <span className={`font-semibold text-xs mt-0.5 inline-flex items-center gap-1 ${
                  item.tipeTandaTangan === 'Manual / Basah' ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  <FileCheck className="w-3 h-3" />
                  {item.tipeTandaTangan || 'Manual'}
                </span>
              )}
            </div>
            {item.penandatangan && (
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Penandatangan</span>
                <span className="font-semibold text-slate-800 text-xs mt-0.5 block">{item.penandatangan}</span>
              </div>
            )}
          </div>

          {/* Asal & Tujuan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                {isMasuk ? 'Asal Pengirim' : 'Bagian Pembuat'}
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Building className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{item.asalPengirim}</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                {isMasuk ? 'Tujuan / Disposisi' : 'Instansi Tujuan'}
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{item.tujuanSurat || '—'}</span>
              </div>
            </div>
          </div>

          {/* Lokasi Fisik Ordner */}
          {item.lokasiFisikBuku && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-slate-600 text-xs">
              <FolderOpen className="w-4 h-4 text-slate-500" />
              <span>Lokasi Ordner / Lemari Fisik:</span>
              <span className="font-semibold text-slate-800">{item.lokasiFisikBuku}</span>
            </div>
          )}

          {/* Lampiran Dokumen Scan / Foto Surat */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-blue-600" />
                Berkas Lampiran Digital (Scan / Foto Surat)
              </h4>
              <span className="text-[11px] text-slate-400">
                {isMasuk && lampiranLoading ? 'Memuat...' : `${daftarTampil.length} file tersimpan`}
              </span>
            </div>

            {/* Galat aksi lampiran (pratinjau/unduh/hapus) — pesan ramah */}
            {aksiError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{aksiError}</span>
              </div>
            )}

            {isMasuk && lampiranLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs">Memuat lampiran...</span>
              </div>
            ) : isMasuk && lampiranError ? (
              <div className="flex flex-col items-center gap-2 py-5 text-center">
                <p className="text-xs text-rose-600">{lampiranError}</p>
                <button
                  onClick={() => loadLampiran(item)}
                  className="px-4 py-2 bg-blue-50 text-blue-600 font-semibold text-xs rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Coba lagi
                </button>
              </div>
            ) : daftarTampil.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Tidak ada berkas yang diunggah.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {daftarTampil.map((att) => {
                  const busy = aksiBusyId === att.id;
                  return (
                    <div
                      key={att.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-3 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0">
                          {att.tipe === 'pdf' ? (
                            <FileText className="w-4 h-4 text-rose-500" />
                          ) : (
                            <ExternalLink className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <span className="font-semibold text-slate-800 text-xs block truncate" title={att.namaFile}>
                            {att.namaFile}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {labelTipeFile(att.namaFile, att.tipe)} • {att.ukuran}
                            {isMasuk && att.tanggalUpload ? ` • ${att.tanggalUpload}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                        <button
                          onClick={() =>
                            isMasuk
                              ? handlePreviewLampiranApi(att)
                              : onPreviewLampiranUrl(att.url, att.namaFile)
                          }
                          disabled={busy}
                          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>Pratinjau</span>
                        </button>

                        {isMasuk ? (
                          <>
                            {/* Unduh isi file dari endpoint /download */}
                            <button
                              onClick={() => handleUnduhLampiranApi(att)}
                              disabled={busy}
                              className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 rounded transition-colors disabled:opacity-60"
                              title="Unduh file"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            {/* Hapus hanya untuk role tulis; backend tetap memutuskan. */}
                            {canManageLampiran && (
                              <button
                                onClick={() => handleHapusLampiranApi(att)}
                                disabled={busy}
                                className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 rounded transition-colors disabled:opacity-60"
                                title="Hapus lampiran"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 rounded transition-colors"
                            title="Buka tab baru"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Riwayat Disposisi (Khusus Surat Masuk) */}
          {isMasuk && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <SendHorizontal className="w-4 h-4 text-indigo-600" />
                  Alur Disposisi & Tindak Lanjut
                </h4>
                <span className="text-[11px] text-slate-500">
                  Dapat dipantau oleh semua staf tanpa harus menunggu login pimpinan
                </span>
              </div>

              {/* Timeline Disposisi */}
              {item.disposisi && item.disposisi.length > 0 ? (
                <div className="space-y-2.5">
                  {item.disposisi.map((disp, idx) => (
                    <div 
                      key={disp.id} 
                      className="relative pl-6 border-l-2 border-blue-500 bg-blue-50/50 p-3 rounded-r-xl text-xs space-y-1"
                    >
                      <div className="absolute -left-1.5 top-3.5 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white" />
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">
                          {disp.dari} → <span className="text-blue-700">{disp.kepada}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{disp.tanggal}</span>
                      </div>

                      <p className="text-slate-700 italic">
                        "{disp.instruksi}"
                      </p>

                      {disp.catatan && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Catatan: {disp.catatan}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-xs">Belum ada catatan disposisi.</p>
              )}

              {/* Form Tambah Disposisi Tindak Lanjut */}
              <form onSubmit={handleKirimDisposisi} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 mt-3">
                <span className="font-bold text-slate-800 text-xs block">
                  + Teruskan Disposisi / Catatan Tindak Lanjut
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={kepada}
                    onChange={(e) => setKepada(e.target.value)}
                    placeholder="Diteruskan kepada (Cth: Sanjaya / Tim Teknis)"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800"
                    required
                  />
                  <input
                    type="text"
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Catatan tambahan (Opsional)"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={instruksi}
                    onChange={(e) => setInstruksi(e.target.value)}
                    placeholder="Instruksi tindak lanjut (Cth: Rekap data kecamatan dan siapkan draft balasan)"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800"
                    required
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-xs transition-colors shrink-0"
                  >
                    Kirim Disposisi
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <div className="text-[11px] text-slate-400">
            ID Sistem: <span className="font-mono">{item.id}</span>
          </div>
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
