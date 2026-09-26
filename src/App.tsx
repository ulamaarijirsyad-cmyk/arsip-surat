/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, 
  Send, 
  FileCheck, 
  Clock, 
  Search, 
  Plus, 
  FolderSearch, 
  FileSpreadsheet, 
  BookOpen, 
  Sparkles,
  Info,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { SuratItem, JenisSurat, DisposisiLog } from './types';
import { INITIAL_SURAT_ITEMS, exportToCSV } from './mockData';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { SuratCard } from './components/SuratCard';
import { ModalTambahSurat } from './components/ModalTambahSurat';
import { ModalDetailSurat } from './components/ModalDetailSurat';
import { RancanganCapstoneModal } from './components/RancanganCapstoneModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';

const STORAGE_KEY = 'si_arsip_capstone_items_v1';

export default function App() {
  const [items, setItems] = useState<SuratItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return INITIAL_SURAT_ITEMS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }, [items]);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState<'semua' | 'masuk' | 'keluar'>('semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKategori, setSelectedKategori] = useState('');
  const [filterTipeTtd, setFilterTipeTtd] = useState('');
  const [filterBulan, setFilterBulan] = useState('');

  // Modals
  const [isTambahModalOpen, setIsTambahModalOpen] = useState(false);
  const [defaultJenisTambah, setDefaultJenisTambah] = useState<JenisSurat>('masuk');
  const [selectedDetailItem, setSelectedDetailItem] = useState<SuratItem | null>(null);
  const [isRancanganModalOpen, setIsRancanganModalOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; title: string } | null>(null);

  // Handlers
  const handleOpenTambahModal = (jenis: JenisSurat) => {
    setDefaultJenisTambah(jenis);
    setIsTambahModalOpen(true);
  };

  const handleSaveSurat = (newItem: SuratItem) => {
    setItems([newItem, ...items]);
  };

  const handleAddDisposisi = (suratId: string, disposisi: DisposisiLog) => {
    const updated = items.map(item => {
      if (item.id === suratId) {
        const currentDisp = item.disposisi || [];
        return {
          ...item,
          statusDisposisi: 'Diteruskan ke Seksi/Staf' as const,
          disposisi: [...currentDisp, disposisi]
        };
      }
      return item;
    });
    setItems(updated);
    if (selectedDetailItem && selectedDetailItem.id === suratId) {
      const currentDisp = selectedDetailItem.disposisi || [];
      setSelectedDetailItem({
        ...selectedDetailItem,
        statusDisposisi: 'Diteruskan ke Seksi/Staf',
        disposisi: [...currentDisp, disposisi]
      });
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedKategori('');
    setFilterTipeTtd('');
    setFilterBulan('');
  };

  // Filter computation
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Tab filter
      if (activeTab === 'masuk' && item.jenis !== 'masuk') return false;
      if (activeTab === 'keluar' && item.jenis !== 'keluar') return false;

      // Category filter
      if (selectedKategori && item.kategori !== selectedKategori) return false;

      // Tipe TTD filter
      if (filterTipeTtd && item.tipeTandaTangan !== filterTipeTtd) return false;

      // Bulan filter (matches YYYY-MM)
      if (filterBulan) {
        const matchSurat = item.tanggalSurat.startsWith(filterBulan);
        const matchCatat = item.tanggalDiterimaAtauKirim.startsWith(filterBulan);
        if (!matchSurat && !matchCatat) return false;
      }

      // Search query (fuzzy search across fields)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inPerihal = item.perihal.toLowerCase().includes(q);
        const inNomor = item.nomorSurat.toLowerCase().includes(q);
        const inAgenda = item.nomorAgenda.toLowerCase().includes(q);
        const inAsal = item.asalPengirim.toLowerCase().includes(q);
        const inTujuan = item.tujuanSurat.toLowerCase().includes(q);
        const inIsi = item.ringkasanIsi.toLowerCase().includes(q);
        const inTtd = item.penandatangan?.toLowerCase().includes(q) || false;
        const inTipeTtd = item.tipeTandaTangan?.toLowerCase().includes(q) || false;

        if (!inPerihal && !inNomor && !inAgenda && !inAsal && !inTujuan && !inIsi && !inTtd && !inTipeTtd) {
          return false;
        }
      }

      return true;
    });
  }, [items, activeTab, selectedKategori, filterTipeTtd, filterBulan, searchQuery]);

  // Statistics
  const totalMasuk = items.filter(i => i.jenis === 'masuk').length;
  const totalKeluar = items.filter(i => i.jenis === 'keluar').length;
  const totalNonTTE = items.filter(i => i.jenis === 'keluar' && i.tipeTandaTangan === 'Manual / Basah').length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        items={items}
        onOpenTambahModal={handleOpenTambahModal}
        onOpenRancanganModal={() => setIsRancanganModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        
        {/* Context Banner: Problem & Solution Callout */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm relative overflow-hidden">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/30 text-blue-200 text-[11px] font-mono border border-blue-400/30">
                  Implementasi Arahan Bimbingan
                </span>
                <span className="text-xs text-blue-200">
                  Solusi Kendala Arsip Surat Masuk & Non-TTE Kantor
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Pencarian Surat Instan & Dokumentasi Surat Tanda Tangan Basah
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Menjawab kendala akun SRIKANDI yang berjenjang di pimpinan (Pak Rudito) serta surat keluar manual yang tidak tercatat di sistem pusat. Staf ruangan kini dapat mencari surat lama dan mengunggah bukti fisik secara terpusat tanpa biaya server tambahan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setIsRancanganModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>Lihat Dokumen ERD & Bab 3</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">Surat Masuk</span>
              <span className="text-lg font-bold text-slate-900">{totalMasuk} Dokumen</span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">Surat Keluar Total</span>
              <span className="text-lg font-bold text-slate-900">{totalKeluar} Dokumen</span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-900 block">Surat Keluar Non-TTE</span>
              <span className="text-lg font-bold text-amber-950">{totalNonTTE} Dokumen Manual</span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">Mode Jaringan</span>
              <span className="text-xs font-bold text-emerald-700 block">LAN / Zero-Cost Aktif</span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <FilterBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedKategori={selectedKategori}
          setSelectedKategori={setSelectedKategori}
          filterTipeTtd={filterTipeTtd}
          setFilterTipeTtd={setFilterTipeTtd}
          filterBulan={filterBulan}
          setFilterBulan={setFilterBulan}
          onResetFilter={handleResetFilters}
        />

        {/* Items Grid / List View */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Menampilkan <strong>{filteredItems.length}</strong> dari <strong>{items.length}</strong> surat terarsip
            </span>
            {searchQuery && (
              <span>
                Hasil pencarian untuk: <strong className="text-slate-800">"{searchQuery}"</strong>
              </span>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <FolderSearch className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Tidak ada surat yang sesuai dengan kriteria pencarian
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Coba gunakan kata kunci umum seperti "Air Permukaan", "Undangan", "Kecamatan", atau periksa filter yang aktif.
              </p>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 bg-blue-50 text-blue-600 font-semibold text-xs rounded-lg hover:bg-blue-100 transition-colors"
              >
                Reset Semua Filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <SuratCard
                  key={item.id}
                  item={item}
                  onSelect={(selected) => setSelectedDetailItem(selected)}
                  onPreviewLampiran={(selected) => {
                    if (selected.lampiran && selected.lampiran.length > 0) {
                      setPreviewAttachment({
                        url: selected.lampiran[0].url,
                        title: selected.lampiran[0].namaFile
                      });
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-12 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SI-ARSIP (Sistem Pengarsipan Surat Internal Mandiri) — Prototipe Capstone Project 2026</span>
          <span className="text-slate-400">Desain Zero-Cost & Low-Maintenance Kompatibel SRIKANDI</span>
        </div>
      </footer>

      {/* Modals */}
      <ModalTambahSurat
        isOpen={isTambahModalOpen}
        onClose={() => setIsTambahModalOpen(false)}
        defaultJenis={defaultJenisTambah}
        items={items}
        onSave={handleSaveSurat}
      />

      <ModalDetailSurat
        item={selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        onAddDisposisi={handleAddDisposisi}
        onPreviewLampiranUrl={(url, title) => setPreviewAttachment({ url, title })}
      />

      <RancanganCapstoneModal
        isOpen={isRancanganModalOpen}
        onClose={() => setIsRancanganModalOpen(false)}
      />

      <ImagePreviewModal
        url={previewAttachment ? previewAttachment.url : null}
        title={previewAttachment ? previewAttachment.title : ''}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}
