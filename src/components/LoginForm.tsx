import React, { useState } from 'react';
import { FileText, Lock, User, LogIn, AlertCircle } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import type { AuthUser } from '../types';

/**
 * Layar login mini (Phase 2D-2).
 *
 * Muncul saat GET /api/auth/me mengembalikan 401 (belum login /
 * sesi berakhir). Desain mengikuti bahasa visual aplikasi yang sudah
 * ada (kartu putih, sudut membulat, aksen biru).
 *
 * Keamanan:
 * - Username/password hanya dikirim ke POST /api/auth/login, tidak
 *   pernah disimpan di localStorage maupun state permanen.
 * - Sesi memakai cookie server-side (browser yang mengelola).
 * - Pesan error ramah pengguna (tanpa detail teknis).
 */
interface LoginFormProps {
  /** Dipanggil saat form disubmit; melempar ApiError bila login gagal. */
  onLogin: (username: string, password: string) => Promise<void>;
  /** Pesan perhatian (mis. "sesi telah berakhir") dari konteks sebelumnya. */
  notice?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin, notice }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!username.trim() || !password) {
      setErrorMessage('Masukkan username dan password Anda.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await onLogin(username.trim(), password);
      // Berhasil — komponen akan diganti oleh aplikasi utama.
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Tidak dapat masuk. Coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6 space-y-5">
        {/* Identitas aplikasi */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight">SI-ARSIP OPERASIONAL</h1>
            <p className="text-xs text-slate-500">Sistem Pengarsipan Surat Internal Kantor</p>
          </div>
        </div>

        {notice && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="login-username" className="block font-semibold text-slate-800 text-xs mb-1">
              Username
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                placeholder="Username Anda"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block font-semibold text-slate-800 text-xs mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                placeholder="Password Anda"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            {isSubmitting ? 'Memeriksa...' : 'Masuk'}
          </button>
        </form>

        <p className="text-[11px] text-slate-400 text-center leading-relaxed">
          Gunakan akun yang diberikan oleh administrator. Data arsip tersimpan aman di server kantor.
        </p>
      </div>
    </div>
  );
};
