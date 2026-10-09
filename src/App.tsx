/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertTriangle,
  Loader2
} from 'lucide-react';
import {
  SuratItem,
  JenisSurat,
  DisposisiLog,
  KategoriSurat,
  SuratMasuk,
  SuratMasukListResponse,
  AuthUser
} from './types';
import { INITIAL_SURAT_ITEMS } from './mockData';
import { apiFetch, ApiError } from './lib/api';
import { uploadLampiran } from './lib/documents';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { SuratCard } from './components/SuratCard';
import { ModalTambahSurat } from './components/ModalTambahSurat';
import { ModalDetailSurat } from './components/ModalDetailSurat';
import { RancanganCapstoneModal } from './components/RancanganCapstoneModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { LoginForm } from './components/LoginForm';

/**
 * Phase 2D-2 — Integrasi Surat Masuk dengan API.
 *
 * Sumber data:
 * - Surat Masuk  → API /api/surat-masuk (PostgreSQL) = SUMBER KEBENARAN.
 * - Surat Keluar → localStorage prototype (belum ada API, di luar scope).
 * - Auth         → GET /api/auth/me (cookie server-side, bukan localStorage).
 *
 * localStorage LAMA tidak dihapus; data Surat Masuk lama dipertahankan
 * apa adanya untuk kompatibilitas mundur tetapi tidak pernah dibaca
 * sebagai daftar surat masuk.
 */
const STORAGE_KEY = 'si_arsip_capstone_items_v1';
const PAGE_SIZE = 20; // default limit backend (maksimum 100)

const KATEGORI_LIST: KategoriSurat[] = [
  'Undangan',
  'Permohonan',
  'Pemberitahuan',
  'Laporan',
  'Keputusan',
  'Surat Tugas',
  'Lainnya'
];

/** Mapper respons API /api/surat-masuk → model tampilan SuratItem. */
function mapSuratMasukToItem(s: SuratMasuk): SuratItem {
  const kategori: KategoriSurat = KATEGORI_LIST.includes(s.jenis_surat as KategoriSurat)
    ? (s.jenis_surat as KategoriSurat)
    : 'Lainnya';
  return {
    id: String(s.id),
    jenis: 'masuk',
    nomorSurat: s.nomor_surat,
    nomorAgenda: '', // kolom nomor agenda belum ada di API (catatan gap)
    tanggalSurat: s.tanggal_surat,
    tanggalDiterimaAtauKirim: s.tanggal_diterima,
    asalPengirim: s.asal_instansi,
    tujuanSurat: '',
    perihal: s.perihal,
    ringkasanIsi: s.keterangan ?? '',
    kategori,
    penandatangan: s.penandatangan ?? undefined,
    sifatSurat: s.sifat_surat,
    lampiran: [],
    apiSource: true
  };
}

/**
 * Muat data SURAT KELUAR dari localStorage (prototype).
 * Surat MASUK tidak pernah dibaca dari localStorage — datanya dari API.
 */
function loadLocalKeluarItems(): SuratItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const keluar = parsed.filter(
          (i): i is SuratItem => !!i && (i as SuratItem).jenis === 'keluar'
        );
        if (keluar.length > 0) return keluar;
      }
    }
  } catch {
    // fallback ke data awal
  }
  return INITIAL_SURAT_ITEMS.filter(i => i.jenis === 'keluar');
}

/** 'YYYY-MM' → rentang tanggal diterima untuk filter backend. */
function monthToRange(yyyymm: string): { dari: string; sampai: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dari: `${yyyymm}-01`,
    sampai: `${yyyymm}-${String(lastDay).padStart(2, '0')}`
  };
}

export default function App() {
  // -----------------------------------------------------------------------
  // Data lokal: HANYA surat keluar (prototype localStorage).
  // -----------------------------------------------------------------------
  const [items, setItems] = useState<SuratItem[]>(loadLocalKeluarItems);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored: unknown = raw ? JSON.parse(raw) : [];
      // Entri Surat Masuk LAMA dipertahankan apa adanya (kompatibilitas mundur),
      // tetapi TIDAK PERNAH dibaca lagi sebagai daftar surat masuk.
      const storedMasuk = Array.isArray(stored)
        ? stored.filter((i): boolean => !!i && (i as SuratItem).jenis === 'masuk')
        : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...storedMasuk, ...items]));
    } catch {
      // localStorage tidak tersedia/penuh — sumber data utama tetap server.
    }
  }, [items]);

  // -----------------------------------------------------------------------
  // Tab & Filters (dideklarasikan sebelum effect yang menggunakannya)
  // -----------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<'semua' | 'masuk' | 'keluar'>('semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKategori, setSelectedKategori] = useState('');
  const [filterTipeTtd, setFilterTipeTtd] = useState('');
  const [filterBulan, setFilterBulan] = useState('');

  // -----------------------------------------------------------------------
  // Auth: sesi via GET /api/auth/me (cookie server-side, bukan localStorage).
  // -----------------------------------------------------------------------
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await apiFetch<{ user: AuthUser }>('/auth/me');
        if (!ignore) setUser(res.user);
      } catch {
        // 401 (belum login / sesi berakhir) atau gangguan jaringan → layar login.
        if (!ignore) setUser(null);
      } finally {
        if (!ignore) setAuthChecked(true);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const res = await apiFetch<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { username, password },
      showServerMessage: true
    });
    setUser(res.user);
    setAuthNotice('');
    setRefreshTick(t => t + 1);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Cookie dibuang oleh server; lanjutkan logout di sisi UI.
    }
    setUser(null);
    setAuthNotice('');
    setMasukItems([]);
    setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
    setMasukStatus('loading');
    setSelectedDetailItem(null);
    setDetailError('');
  };

  /** Dipanggil saat API menjawab 401 di tengah sesi. */
  const handleSessionExpired = () => {
    setUser(null);
    setAuthNotice('Anda belum login atau sesi telah berakhir.');
  };

  // -----------------------------------------------------------------------
  // Daftar Surat Masuk dari API (pagination + filter dari SERVER).
  // -----------------------------------------------------------------------
  const [masukItems, setMasukItems] = useState<SuratItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0
  });
  const [masukStatus, setMasukStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [masukError, setMasukError] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const requestSeqRef = useRef(0);

  // Debounce pencarian (hindari request tiap karakter).
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchQuery.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Ganti filter → kembali ke halaman pertama.
  useEffect(() => {
    setPage(1);
  }, [selectedKategori, filterBulan]);

  useEffect(() => {
    if (!user) return;

    const seq = ++requestSeqRef.current;
    setMasukStatus('loading');

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (debouncedQ) params.set('q', debouncedQ);
    if (selectedKategori) params.set('jenis_surat', selectedKategori);
    if (filterBulan) {
      const range = monthToRange(filterBulan);
      if (range) {
        params.set('diterima_dari', range.dari);
        params.set('diterima_sampai', range.sampai);
      }
    }

    (async () => {
      try {
        const res = await apiFetch<SuratMasukListResponse>(`/surat-masuk?${params.toString()}`);
        if (seq !== requestSeqRef.current) return; // respons basi → abaikan
        setMasukItems(res.data.map(mapSuratMasukToItem));
        setPagination(res.pagination);
        setMasukStatus('ready');
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        if (err instanceof ApiError && err.kind === 'unauthorized') {
          handleSessionExpired();
          return;
        }
        setMasukError(err instanceof ApiError ? err.message : 'Gagal memuat surat masuk.');
        setMasukStatus('error');
      }
    })();
  }, [user, page, debouncedQ, selectedKategori, filterBulan, refreshTick]);

  // -----------------------------------------------------------------------
  // Detail surat (GET /api/surat-masuk/:id untuk baris dari API).
  // -----------------------------------------------------------------------
  const [selectedDetailItem, setSelectedDetailItem] = useState<SuratItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailSeqRef = useRef(0);

  const handleSelectDetail = (item: SuratItem) => {
    setSelectedDetailItem(item);
    setDetailError('');

    if (item.jenis !== 'masuk' || !item.apiSource) {
      // Surat keluar (prototype lokal) → data lokal sudah lengkap.
      detailSeqRef.current++;
      setDetailLoading(false);
      return;
    }

    const seq = ++detailSeqRef.current;
    setDetailLoading(true);
    (async () => {
      try {
        const res = await apiFetch<{ data: SuratMasuk }>(`/surat-masuk/${item.id}`);
        if (seq !== detailSeqRef.current) return; // modal sudah ditutup/ganti
        setSelectedDetailItem(mapSuratMasukToItem(res.data));
        setDetailLoading(false);
      } catch (err) {
        if (seq !== detailSeqRef.current) return;
        setDetailLoading(false);
        if (err instanceof ApiError && err.kind === 'unauthorized') {
          handleSessionExpired();
          return;
        }
        setDetailError(err instanceof ApiError ? err.message : 'Gagal memuat detail surat.');
      }
    })();
  };

  const handleCloseDetail = () => {
    detailSeqRef.current++; // buat request yang masih melayang jadi basi
    setSelectedDetailItem(null);
    setDetailError('');
    setDetailLoading(false);
  };

  const handleRetryDetail = () => {
    if (selectedDetailItem) handleSelectDetail(selectedDetailItem);
  };

  // -----------------------------------------------------------------------
  // Modals & notifikasi
  // -----------------------------------------------------------------------
  const [isTambahModalOpen, setIsTambahModalOpen] = useState(false);
  const [defaultJenisTambah, setDefaultJenisTambah] = useState<JenisSurat>('masuk');
  const [isRancanganModalOpen, setIsRancanganModalOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; title: string } | null>(null);
  const [flash, setFlash] = useState('');
  // true → toast memakai warna peringatan (mis. surat tersimpan tetapi
  // lampiran gagal diunggah); false → sukses (hijau) seperti biasa.
  const [flashIsError, setFlashIsError] = useState(false);

  const showFlash = (message: string, isError = false) => {
    setFlashIsError(isError);
    setFlash(message);
  };

  /**
   * Buka pratinjau lampiran. Object URL blob (dari endpoint /content)
   * DICABUT saat ditutup/diganti agar tidak bocor memori; URL eksternal
   * prototipe tidak terpengaruh (revokeObjectURL hanya berlaku untuk blob).
   */
  const openPreviewAttachment = (url: string, title: string) => {
    setPreviewAttachment(prev => {
      if (prev && prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
      return { url, title };
    });
  };

  const closePreviewAttachment = () => {
    setPreviewAttachment(prev => {
      if (prev && prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleOpenTambahModal = (jenis: JenisSurat) => {
    setDefaultJenisTambah(jenis);
    setIsTambahModalOpen(true);
  };

  const handleSaveSurat = async (newItem: SuratItem) => {
    if (newItem.jenis === 'masuk') {
      // Kirim HANYA field bisnis — created_by/id/dates server yang menentukan.
      let suratId: number | null = null;
      try {
        const res = await apiFetch<{ data?: SuratMasuk }>('/surat-masuk', {
          method: 'POST',
          body: {
            nomor_surat: newItem.nomorSurat,
            tanggal_surat: newItem.tanggalSurat,
            tanggal_diterima: newItem.tanggalDiterimaAtauKirim,
            asal_instansi: newItem.asalPengirim,
            perihal: newItem.perihal,
            jenis_surat: newItem.kategori,
            sifat_surat: newItem.sifatSurat || 'Biasa',
            penandatangan: newItem.penandatangan || null,
            keterangan: newItem.ringkasanIsi || null
          }
        });
        const id = Number(res.data?.id);
        suratId = Number.isSafeInteger(id) && id > 0 ? id : null;
      } catch (err) {
        // Surat BELUM tersimpan → aman melempar error agar modal menampilkan
        // pesan dan user boleh mencoba lagi TANPA risiko surat duplikat.
        if (err instanceof ApiError && err.kind === 'unauthorized') handleSessionExpired();
        throw err;
      }

      // Upload lampiran HANYA setelah surat ada dan memiliki ID valid.
      // Tanpa ID → upload tidak pernah dikirim (tidak ada surat yatim).
      const berkas = newItem.lampiran.filter(att => att.file instanceof File);
      let terkirim = 0;
      const galat: string[] = [];
      if (suratId === null) {
        if (berkas.length > 0) galat.push('ID surat tidak diterima server.');
      } else {
        for (const att of berkas) {
          try {
            await uploadLampiran(suratId, att.file as File);
            terkirim += 1;
          } catch (err) {
            if (err instanceof ApiError && err.kind === 'unauthorized') {
              handleSessionExpired();
              galat.push('Sesi login berakhir saat mengunggah lampiran.');
              break;
            }
            galat.push(err instanceof ApiError ? err.message : 'Gagal mengunggah file.');
          }
        }
      }

      // Kembali ke halaman 1 lalu muat ulang agar surat baru langsung terlihat.
      setPage(1);
      setRefreshTick(t => t + 1);

      if (galat.length > 0) {
        // SENGAJA tidak melempar error: surat SUDAH terbuat, dan error yang
        // membuat modal tetap terbuka bisa memicu POST kedua (surat duplikat).
        showFlash(
          `Surat tersimpan${terkirim > 0 ? ` (${terkirim} lampiran terunggah)` : ''}, ` +
            `tetapi ${galat.length} lampiran gagal: ${galat[0]}`,
          true
        );
      } else if (berkas.length > 0) {
        showFlash(`Surat masuk berhasil ditambahkan (${berkas.length} lampiran terunggah).`);
      } else {
        showFlash('Surat masuk berhasil ditambahkan.');
      }
      return;
    }

    // Surat keluar: tetap prototype lokal (API-nya di luar scope phase ini).
    setItems([newItem, ...items]);
    showFlash('Surat keluar berhasil disimpan.');
  };

  const handleAddDisposisi = (suratId: string, disposisi: DisposisiLog) => {
    const target = items.find(i => i.id === suratId);
    if (!target || target.apiSource) {
      // Surat dari API: fitur disposisi menyusul pada phase tersendiri.
      alert('Fitur disposisi untuk surat dari server akan tersedia pada phase berikutnya.');
      return;
    }

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

  // -----------------------------------------------------------------------
  // Filter & turunan tampilan
  // -----------------------------------------------------------------------

  // Surat keluar: difilter lokal seperti prototype (tanpa request).
  const filteredKeluarItems = useMemo(() => {
    return items.filter(item => {
      if (selectedKategori && item.kategori !== selectedKategori) return false;
      if (filterTipeTtd && item.tipeTandaTangan !== filterTipeTtd) return false;
      if (filterBulan) {
        const matchSurat = item.tanggalSurat.startsWith(filterBulan);
        const matchCatat = item.tanggalDiterimaAtauKirim.startsWith(filterBulan);
        if (!matchSurat && !matchCatat) return false;
      }
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
  }, [items, selectedKategori, filterTipeTtd, filterBulan, searchQuery]);

  const visibleItems = useMemo(() => {
    if (activeTab === 'masuk') return masukItems;
    if (activeTab === 'keluar') return filteredKeluarItems;
    return [...masukItems, ...filteredKeluarItems];
  }, [activeTab, masukItems, filteredKeluarItems]);

  // Panel daftar: loading/error hanya relevan bila tab menyertakan surat masuk.
  const isListLoading = activeTab !== 'keluar' && masukStatus === 'loading';
  const listPanel: 'loading' | 'error' | 'ready' =
    activeTab === 'keluar' ? 'ready' : masukStatus;

  const listTotal =
    activeTab === 'masuk'
      ? pagination.total
      : activeTab === 'keluar'
        ? items.length
        : pagination.total + items.length;

  // Statistik
  const totalMasuk = pagination.total;
  const totalKeluar = items.filter(i => i.jenis === 'keluar').length;
  const totalNonTTE = items.filter(i => i.jenis === 'keluar' && i.tipeTandaTangan === 'Manual / Basah').length;

  // Role-based UI (pimpinan read-only). UI hiding BUKAN keamanan —
  // backend tetap menjalankan requireRole pada setiap request tulis.
  const canWrite = user !== null && (user.role === 'admin' || user.role === 'petugas');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col">
      {!authChecked ? (
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-blue-600" />
          Memeriksa sesi login...
        </div>
      ) : !user ? (
        <LoginForm onLogin={handleLogin} notice={authNotice} />
      ) : (
        <>
          {/* App Header */}
          <Header
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            items={[...masukItems, ...items]}
            masukCount={pagination.total}
            canWrite={canWrite}
            user={user}
            onLogout={handleLogout}
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
                  Menampilkan <strong>{visibleItems.length}</strong> dari <strong>{listTotal}</strong> surat terarsip
                </span>
                {searchQuery && (
                  <span>
                    Hasil pencarian untuk: <strong className="text-slate-800">"{searchQuery}"</strong>
                  </span>
                )}
              </div>

              {listPanel === 'loading' ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">Memuat surat masuk...</p>
                  <p className="text-xs text-slate-400">Mohon tunggu sebentar.</p>
                </div>
              ) : listPanel === 'error' ? (
                <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-800">{masukError}</h3>
                  <p className="text-xs text-slate-500">Periksa koneksi ke server kantor lalu coba lagi.</p>
                  <button
                    onClick={() => setRefreshTick(t => t + 1)}
                    className="px-4 py-2 bg-blue-50 text-blue-600 font-semibold text-xs rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : visibleItems.length === 0 ? (
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
                  {visibleItems.map((item) => (
                    <SuratCard
                      key={`${item.jenis}-${item.id}`}
                      item={item}
                      onSelect={handleSelectDetail}
                      onPreviewLampiran={(selected) => {
                        if (selected.lampiran && selected.lampiran.length > 0) {
                          openPreviewAttachment(
                            selected.lampiran[0].url,
                            selected.lampiran[0].namaFile
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Pagination server-side (sumber: backend /api/surat-masuk) */}
              {listPanel === 'ready' && pagination.total > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs">
                  <span className="text-slate-500">
                    Halaman <strong className="text-slate-800">{page}</strong> dari{' '}
                    <strong>{pagination.totalPages}</strong> — total{' '}
                    <strong>{pagination.total}</strong> surat masuk
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={isListLoading || page <= 1}
                      className="px-3 py-1.5 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Sebelumnya
                    </button>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={isListLoading || page >= pagination.totalPages}
                      className="px-3 py-1.5 font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Selanjutnya
                    </button>
                  </div>
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
            items={[...masukItems, ...items]}
            onSave={handleSaveSurat}
          />

          <ModalDetailSurat
            item={selectedDetailItem}
            isLoading={detailLoading}
            error={detailError}
            onRetry={handleRetryDetail}
            onClose={handleCloseDetail}
            onAddDisposisi={handleAddDisposisi}
            onPreviewLampiranUrl={(url, title) => openPreviewAttachment(url, title)}
            canManageLampiran={canWrite}
          />

          <RancanganCapstoneModal
            isOpen={isRancanganModalOpen}
            onClose={() => setIsRancanganModalOpen(false)}
          />

          <ImagePreviewModal
            url={previewAttachment ? previewAttachment.url : null}
            title={previewAttachment ? previewAttachment.title : ''}
            onClose={closePreviewAttachment}
          />
        </>
      )}

      {/* Notifikasi sukses/peringatan (feedback aksi) */}
      {flash && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg ${
            flashIsError ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {flashIsError ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          <span>{flash}</span>
          <button
            onClick={() => setFlash('')}
            className={`ml-2 hover:text-white font-bold ${flashIsError ? 'text-rose-100' : 'text-emerald-100'}`}
            aria-label="Tutup notifikasi"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
