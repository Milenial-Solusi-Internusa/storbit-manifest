// src/components/Login.jsx
// Login screen dengan design system Storbit — cream + pastel + Fraunces.

import { useState } from 'react';
import { Package, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';

// Same palette as App.jsx
const PASTEL = {
  peach: '#FFD4B8',
  peachDeep: '#F5A78F',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  mint: '#C8EFD9',
  mintDeep: '#7FC9A0',
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  cream: '#FAF6F0',
  ink: '#2D2A26',
  inkSoft: '#6B6660',
  inkMute: '#9A948C',
  line: '#E8E0D5',
  lineSoft: '#F2EBE0',
};

export default function Login() {
  const { signIn, authError, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Email dan password wajib diisi.');
      return;
    }

    setSubmitting(true);
    const { ok, error } = await signIn(email.trim(), password);
    setSubmitting(false);

    if (!ok) {
      const msg = error?.message || 'Login gagal. Cek email & password.';
      // Translate common Supabase errors to Indonesian
      if (msg.toLowerCase().includes('invalid login credentials')) {
        setLocalError('Email atau password salah.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setLocalError('Email belum diverifikasi. Hubungi admin.');
      } else {
        setLocalError(msg);
      }
    }
    // If success, AuthContext akan ngubah state → App.jsx auto-redirect
  };

  const errorMsg = localError || authError;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: PASTEL.cream }}
    >
      <div className="w-full max-w-md">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${PASTEL.peach}, ${PASTEL.rose})`,
            }}
          >
            <Package size={28} style={{ color: PASTEL.ink }} strokeWidth={2} />
          </div>
          <h1
            className="font-display text-3xl font-semibold tracking-tight"
            style={{ color: PASTEL.ink }}
          >
            storbit
          </h1>
          <p
            className="text-[11px] uppercase tracking-[0.25em] mt-1 font-medium"
            style={{ color: PASTEL.inkMute }}
          >
            Manifest · Ops
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-3xl p-8 border shadow-sm"
          style={{ background: 'white', borderColor: PASTEL.line }}
        >
          <h2
            className="font-display text-2xl font-semibold mb-2"
            style={{ color: PASTEL.ink }}
          >
            Selamat datang
          </h2>
          <p className="text-sm mb-6" style={{ color: PASTEL.inkSoft }}>
            Login untuk mengakses Storbit Manifest.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: PASTEL.inkSoft }}
              >
                Email
              </label>
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors focus-within:border-opacity-100"
                style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft }}
              >
                <Mail size={16} style={{ color: PASTEL.inkMute }} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kamu@perusahaan.com"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  style={{ color: PASTEL.ink }}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: PASTEL.inkSoft }}
              >
                Password
              </label>
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
                style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft }}
              >
                <Lock size={16} style={{ color: PASTEL.inkMute }} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  style={{ color: PASTEL.ink }}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-xs hover:opacity-70 transition-opacity"
                  style={{ color: PASTEL.inkMute }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {errorMsg && (
              <div
                className="rounded-xl px-3 py-2.5 text-xs"
                style={{
                  background: PASTEL.rose,
                  color: PASTEL.ink,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || authLoading}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              style={{
                background: PASTEL.ink,
                color: PASTEL.cream,
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p
          className="text-center text-[11px] mt-6"
          style={{ color: PASTEL.inkMute }}
        >
          Belum punya akses? Hubungi admin untuk dibuatkan akun.
        </p>
      </div>
    </div>
  );
}
