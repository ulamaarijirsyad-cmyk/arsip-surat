import React from 'react';
import { 
  FileText, 
  Send, 
  Inbox, 
  BookOpen, 
  Download, 
  Server, 
  ShieldCheck,
  Building2,
  Plus
} from 'lucide-react';
import { SuratItem } from '../types';
import { exportToCSV } from '../mockData';

interface HeaderProps {
  activeTab: 'semua' | 'masuk' | 'keluar';
  setActiveTab: (tab: 'semua' | 'masuk' | 'keluar') => void;
  items: SuratItem[];
  onOpenTambahModal: (jenis: 'masuk' | 'keluar') => void;
  onOpenRancanganModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  items,
  onOpenTambahModal,
  onOpenRancanganModal,
}) => {
  const countMasuk = items.filter(i => i.jenis === 'masuk').length;
  const countKeluar = items.filter(i => i.jenis === 'keluar').length;
  const countNonTTE = items.filter(i => i.jenis === 'keluar' && i.tipeTandaTangan === 'Manual / Basah').length;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner / Agency Info */}
      <div className="bg-slate-900 text-slate-300 text-xs px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-medium text-white tracking-wide">
            Sistem Informasi Pengarsipan Surat Operasional Kantor
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Arsip Mandiri Internal Ruangan & Seksi</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Akses Lokal / LAN Aktif (Zero Cost)
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400 text-[11px]">Kompatibel Lampiran SRIKANDI & Non-TTE</span>
        </div>
      </div>

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-sm ring-1 ring-blue-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                SI-ARSIP OPERASIONAL
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Capstone Prototype
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Pencatatan nomor urut, disposisi, dan berkas fisik/PDF surat masuk & surat keluar internal
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-lihat-rancangan"
            onClick={onOpenRancanganModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300"
            title="Lihat ERD, Skema Database, dan Dokumentasi Capstone untuk Dosen"
          >
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Dokumen Rancangan & ERD</span>
          </button>

          <button
            id="btn-export-excel"
            onClick={() => exportToCSV(items, `rekap_arsip_surat_${new Date().toISOString().slice(0,10)}`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-colors border border-slate-300"
            title="Ekspor rekap data surat ke file Excel (.csv)"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Ekspor Excel</span>
          </button>

          <div className="flex items-center gap-1.5 pl-1">
            <button
              id="btn-tambah-surat-masuk"
              onClick={() => onOpenTambahModal('masuk')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Surat Masuk</span>
            </button>
            <button
              id="btn-tambah-surat-keluar"
              onClick={() => onOpenTambahModal('keluar')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Surat Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation & Stat Badges */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2 pb-2 text-xs">
        <nav className="flex items-center gap-2">
          <button
            id="tab-semua-surat"
            onClick={() => setActiveTab('semua')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'semua'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Semua Surat ({items.length})
          </button>

          <button
            id="tab-surat-masuk"
            onClick={() => setActiveTab('masuk')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'masuk'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Surat Masuk ({countMasuk})</span>
          </button>

          <button
            id="tab-surat-keluar"
            onClick={() => setActiveTab('keluar')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'keluar'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Surat Keluar ({countKeluar})</span>
            {countNonTTE > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-400 text-amber-950 font-bold ml-0.5" title={`${countNonTTE} Surat Keluar tanda tangan manual/basah`}>
                {countNonTTE} Non-TTE
              </span>
            )}
          </button>
        </nav>

        {/* Context badge showing resolution to dialogue */}
        <div className="hidden lg:flex items-center gap-3 text-slate-500 text-[11px]">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
            Pencarian cepat nama/perihal/tanggal tanpa login berjenjang
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Server className="w-3.5 h-3.5 text-emerald-500" />
            Simpan aman di PC lokal / folder ruangan
          </span>
        </div>
      </div>
    </header>
  );
};
