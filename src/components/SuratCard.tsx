import React from 'react';
import { 
  Inbox, 
  Send, 
  Calendar, 
  FileText, 
  Paperclip, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileCheck,
  Building,
  User,
  FolderOpen
} from 'lucide-react';
import { SuratItem } from '../types';

interface SuratCardProps {
  item: SuratItem;
  onSelect: (item: SuratItem) => void;
  onPreviewLampiran: (item: SuratItem) => void;
}

export const SuratCard: React.FC<SuratCardProps> = ({
  item,
  onSelect,
  onPreviewLampiran
}) => {
  const isMasuk = item.jenis === 'masuk';

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-blue-400/60 p-4 transition-all hover:shadow-md group flex flex-col justify-between">
      <div>
        {/* Header Row: Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span 
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold ${
                isMasuk 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              {isMasuk ? <Inbox className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {isMasuk ? 'SURAT MASUK' : 'SURAT KELUAR'}
            </span>

            <span className="font-mono text-xs text-slate-500 font-semibold px-2 py-0.5 bg-slate-100 rounded">
              {item.nomorAgenda}
            </span>

            <span className="text-[11px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              {item.kategori}
            </span>
          </div>

          {/* Tanda Tangan Badge (Crucial requirement from audio) */}
          {!isMasuk && item.tipeTandaTangan && (
            <span 
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                item.tipeTandaTangan === 'Manual / Basah'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
              title={
                item.tipeTandaTangan === 'Manual / Basah'
                  ? 'Surat fisik ditandatangani manual (Tidak ada di SRIKANDI, diarsipkan mandiri di sini)'
                  : 'Surat telah ditandatangani secara elektronik (TTE)'
              }
            >
              <FileCheck className="w-3 h-3" />
              {item.tipeTandaTangan}
            </span>
          )}

          {isMasuk && item.statusDisposisi && (
            <span 
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                item.statusDisposisi === 'Selesai Ditindaklanjuti'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {item.statusDisposisi === 'Selesai Ditindaklanjuti' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : (
                <Clock className="w-3 h-3 text-blue-600" />
              )}
              {item.statusDisposisi}
            </span>
          )}
        </div>

        {/* Perihal / Judul Surat */}
        <h3 
          onClick={() => onSelect(item)}
          className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors cursor-pointer line-clamp-2 mb-1.5"
        >
          {item.perihal}
        </h3>

        {/* Nomor Surat Resmi & Tanggal */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mb-3">
          <div className="flex items-center gap-1 font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">{item.nomorSurat}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Tgl Surat: {item.tanggalSurat}</span>
          </div>
          <span className="text-slate-300">•</span>
          <span className="text-slate-500">
            {isMasuk ? 'Diterima: ' : 'Dikirim: '}{item.tanggalDiterimaAtauKirim}
          </span>
        </div>

        {/* Pengirim & Penerima Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 mb-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              {isMasuk ? 'Asal Pengirim' : 'Bagian Pembuat'}
            </span>
            <div className="flex items-center gap-1 font-medium text-slate-800 mt-0.5 truncate">
              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{item.asalPengirim}</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              {isMasuk ? 'Tujuan Disposisi' : 'Pihak Tujuan'}
            </span>
            <div className="flex items-center gap-1 font-medium text-slate-800 mt-0.5 truncate">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{item.tujuanSurat}</span>
            </div>
          </div>
        </div>

        {/* Ringkasan Isi */}
        <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
          {item.ringkasanIsi}
        </p>
      </div>

      {/* Footer info: Lampiran & Action Buttons */}
      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {item.lampiran.length > 0 ? (
            <button
              onClick={() => onPreviewLampiran(item)}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded transition-colors text-xs"
              title="Klik untuk pratinjau scan surat / foto berkas"
            >
              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
              <span>{item.lampiran.length} Berkas Scan/PDF</span>
            </button>
          ) : (
            <span className="text-slate-400 text-[11px] italic">Tanpa lampiran digital</span>
          )}

          {item.lokasiFisikBuku && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400" title="Lokasi fisik ordner">
              <FolderOpen className="w-3 h-3" />
              <span className="truncate max-w-[140px]">{item.lokasiFisikBuku}</span>
            </span>
          )}
        </div>

        <button
          onClick={() => onSelect(item)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
        >
          <span>Detail & Riwayat</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
