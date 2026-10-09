import React from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';

interface ImagePreviewModalProps {
  url: string | null;
  title: string;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  url,
  title,
  onClose
}) => {
  if (!url) return null;

  const isPdf = title.toLowerCase().endsWith('.pdf');
  // Blob = isi file asli dari endpoint /content (Surat Masuk) → render PDF
  // sungguhan. URL eksternal (prototipe Surat Keluar) tetap perilaku lama.
  const isBlob = url.startsWith('blob:');
  const renderPdfAsli = isPdf && isBlob;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2 truncate pr-4">
            <FileText className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs font-semibold truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Buka Asli</span>
            </a>
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="p-4 bg-slate-100 flex-1 overflow-auto flex items-center justify-center min-h-[360px] max-h-[75vh]">
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-4 p-8 text-center bg-white rounded-xl shadow-xs border border-slate-200">
              <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  {renderPdfAsli
                    ? 'Pratinjau dokumen asli dari server (PDF).'
                    : 'Dokumen pindaian resmi (Scan Dokumen PDF). Dalam implementasi nyata, berkas ini tersimpan di direktori server lokal kantor.'}
                </p>
              </div>
              {renderPdfAsli ? (
                <iframe
                  src={url}
                  title={title}
                  className="w-full h-[60vh] rounded-lg border border-slate-200 shadow-xs bg-white"
                />
              ) : (
                <img
                  src={url}
                  alt={title}
                  className="max-h-72 object-cover rounded-lg border border-slate-200 shadow-xs"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <img 
                src={url} 
                alt={title} 
                className="max-h-[70vh] object-contain rounded-lg shadow-md border border-slate-300"
              />
              <span className="text-[11px] text-slate-500 mt-2">
                Foto bukti surat fisik dengan tanda tangan manual basah
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
