import React from 'react';
import { Search, Filter, Calendar, X, Tag } from 'lucide-react';
import { KategoriSurat } from '../types';

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  selectedKategori: string;
  setSelectedKategori: (val: string) => void;
  filterTipeTtd: string;
  setFilterTipeTtd: (val: string) => void;
  filterBulan: string;
  setFilterBulan: (val: string) => void;
  onResetFilter: () => void;
}

const KATEGORI_OPTIONS: KategoriSurat[] = [
  'Undangan',
  'Permohonan',
  'Pemberitahuan',
  'Laporan',
  'Keputusan',
  'Surat Tugas',
  'Lainnya'
];

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  setSearchQuery,
  selectedKategori,
  setSelectedKategori,
  filterTipeTtd,
  setFilterTipeTtd,
  filterBulan,
  setFilterBulan,
  onResetFilter
}) => {
  const isFiltered = searchQuery || selectedKategori || filterTipeTtd || filterBulan;

  const quickSearches = ['Air Permukaan', 'Undangan', 'Kecamatan', 'Bhakti', 'Manual / Basah', 'Rudito'];

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Search input */}
        <div className="md:col-span-5 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="input-cari-surat"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari perihal, nomor surat, instansi, penandatangan... (Cth: Air Permukaan)"
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Kategori */}
        <div className="md:col-span-3">
          <select
            id="select-kategori"
            value={selectedKategori}
            onChange={(e) => setSelectedKategori(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
          >
            <option value="">Semua Kategori</option>
            {KATEGORI_OPTIONS.map((kat) => (
              <option key={kat} value={kat}>{kat}</option>
            ))}
          </select>
        </div>

        {/* Filter Tipe TTD (Khusus keluar / umum) */}
        <div className="md:col-span-2">
          <select
            id="select-tipe-ttd"
            value={filterTipeTtd}
            onChange={(e) => setFilterTipeTtd(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
          >
            <option value="">Semua Format TTD</option>
            <option value="Manual / Basah">Tanda Tangan Basah (Non-TTE)</option>
            <option value="TTE (Elektronik)">TTE (Elektronik)</option>
          </select>
        </div>

        {/* Filter Bulan / Periode */}
        <div className="md:col-span-2">
          <select
            id="select-bulan"
            value={filterBulan}
            onChange={(e) => setFilterBulan(e.target.value)}
            className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
          >
            <option value="">Semua Bulan</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-08">Agustus 2026</option>
            <option value="2026-07">Juli 2026</option>
          </select>
        </div>
      </div>

      {/* Quick Search Tag Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Tag className="w-3 h-3" /> Cepat cari topik:
          </span>
          {quickSearches.map((tag) => (
            <button
              key={tag}
              onClick={() => setSearchQuery(tag)}
              className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition-colors border border-slate-200 text-[11px]"
            >
              {tag}
            </button>
          ))}
        </div>

        {isFiltered && (
          <button
            onClick={onResetFilter}
            className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-medium text-xs hover:underline"
          >
            <X className="w-3 h-3" />
            Reset Filter
          </button>
        )}
      </div>
    </div>
  );
};
