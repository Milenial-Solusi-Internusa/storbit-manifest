// src/components/Login.jsx
// Redesigned login — split layout with MSI branding (left) + form (right).
// Design source: nexus-by-msi/project/login.html
//
// AUTH LOGIC IS UNCHANGED — only JSX/styling replaced.
// Kept: signIn, authError, loading, handleSubmit, error translation, all state.

import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';

// ─── Design tokens (from styles.css + storbit.css in design bundle) ───────
const T = {
  bg:       '#F6EFE3',
  bgAlt:    '#EFE6D4',
  surface:  '#FFFDF8',
  ink:      '#23291E',
  inkSoft:  '#5E6553',
  inkFaint: '#8A8E7C',
  line:     '#E7DCC8',
  lineSoft: '#F0E7D6',
  accent:   '#E85A1E',
  accentSoft:'#FEF2EC',
  sidebar:  '#16271A',
  dangerBg: '#F6E0DB',
  danger:   '#B23227',
};

const PHOTO_URL =
  'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/pexels-samuel-wolfl-628277-1427541.jpg';
const LOGO_URL =
  'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png';

export default function Login() {
  // ── Auth logic — UNCHANGED ─────────────────────────────────────────────
  const { signIn, authError, loading: authLoading } = useAuth();
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [localError,   setLocalError]   = useState(null);

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
      if (msg.toLowerCase().includes('invalid login credentials')) {
        setLocalError('Email atau password salah.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setLocalError('Email belum diverifikasi. Hubungi admin.');
      } else {
        setLocalError(msg);
      }
    }
    // success → AuthContext state change → App.jsx auto-redirect
  };

  const errorMsg = localError || authError;
  // ── End auth logic ─────────────────────────────────────────────────────

  return (
    <>
      {/* Responsive-breakpoint style tag — avoids Tailwind JIT for layout-critical rules */}
      <style>{`
        .auth-grid {
          display: grid;
          grid-template-columns: 45% 55%;
          min-height: 100vh;
        }
        @media (max-width: 860px) {
          .auth-grid { grid-template-columns: 1fr; }
          .auth-brand-panel { display: none !important; }
          .auth-mobile-brand { display: flex !important; }
          .auth-form-panel { padding: 0 22px; }
        }
        .af-input-field:focus {
          outline: none;
          border-color: ${T.accent} !important;
          box-shadow: 0 0 0 3px rgba(47,107,63,.13);
        }
        .af-submit-btn:hover:not(:disabled) {
          background: #286037 !important;
          border-color: #286037 !important;
          transform: translateY(-1px);
          box-shadow: 0 9px 22px rgba(47,107,63,.28) !important;
        }
        .af-toggle-btn:hover { background: ${T.bgAlt}; color: ${T.inkSoft}; }
      `}</style>

      <div className="auth-grid">

        {/* ── LEFT — BRANDING ──────────────────────────────────────────── */}
        <section
          className="auth-brand-panel"
          style={{
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            padding: '48px 52px',
            background: T.sidebar, color: '#fff',
          }}
        >
          {/* Photo background */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url('${PHOTO_URL}')`,
            backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat',
            filter: 'saturate(.85)',
          }}/>
          {/* Dark gradient overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(20,39,26,.62) 0%, rgba(20,39,26,.78) 55%, rgba(16,30,20,.9) 100%)',
          }}/>
          {/* Radial grain */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(120% 80% at 30% 0%, transparent 40%, rgba(10,20,12,.45) 100%)',
            mixBlendMode: 'multiply',
          }}/>

          {/* All content above overlays */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                padding: '8px 12px', borderRadius: 8,
              }}>
                <img
                  src={LOGO_URL}
                  alt="MSI"
                  style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.5))' }}
                />
              </span>
            </div>

            {/* Center text */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 440 }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11.5, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase',
                color: '#9DCB9A', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ width: 26, height: 1, background: '#6FA06D', flexShrink: 0 }}/>
                Unified Business Core Platform
              </div>
              <h1 style={{
                fontSize: 46, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1.04,
                margin: 0, color: '#F4F8F0',
              }}>
                Nexus<br/>By MSI
              </h1>
              <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,.22), rgba(255,255,255,0))', margin: '30px 0 24px', width: '80%' }}/>
              <p style={{ fontSize: 17, lineHeight: 1.6, fontStyle: 'italic', color: '#D6E4D2', maxWidth: 400, fontWeight: 400, margin: 0 }}>
                Our Excellent Solution Empowering Your Connectivity
              </p>
            </div>

            {/* Footer */}
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11, letterSpacing: 1.5, color: 'rgba(214,228,210,.6)', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 9,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6FA06D', flexShrink: 0 }}/>
              MSI Group · 2026
            </div>
          </div>
        </section>

        {/* ── RIGHT — FORM ─────────────────────────────────────────────── */}
        <section
          className="auth-form-panel"
          style={{
            background: T.bg,
            display: 'flex', flexDirection: 'column',
            padding: '40px 48px',
            position: 'relative',
            overflowY: 'auto',
            justifyContent: 'space-between',
          }}
        >
          {/* Mobile brand — hidden on desktop, shown on mobile via media query */}
          <div
            className="auth-mobile-brand"
            style={{
              display: 'none', alignItems: 'center', gap: 11, justifyContent: 'center',
              padding: '34px 0 6px',
            }}
          >
            <img src={LOGO_URL} alt="MSI" style={{ height: 36, width: 'auto', objectFit: 'contain' }}/>
            <div>
              <b style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, display: 'block' }}>Nexus by MSI</b>
              <span style={{ fontSize: 9.5, letterSpacing: 1.3, color: T.inkFaint, textTransform: 'uppercase', display: 'block' }}>Unified Business Core</span>
            </div>
          </div>

          {/* Form inner */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            width: '100%', maxWidth: 392, margin: '0 auto',
          }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.8px', margin: '0 0 7px', color: T.ink }}>
              Selamat datang kembali
            </h2>
            <p style={{ fontSize: 14.5, color: T.inkSoft, margin: '0 0 32px' }}>
              Masuk untuk mengakses Nexus ERP.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Email field */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label htmlFor="email" style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: T.inkSoft }}>
                  Email
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkFaint, pointerEvents: 'none' }}>
                    <Mail size={18} strokeWidth={1.8}/>
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@msigroup.co.id"
                    disabled={submitting}
                    className="af-input-field"
                    style={{
                      width: '100%', height: 50, borderRadius: 11,
                      border: `1px solid ${T.line}`, background: T.surface,
                      padding: '0 14px 0 44px', fontSize: 14.5, fontFamily: 'inherit', color: T.ink,
                      transition: 'border-color .14s, box-shadow .14s', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label htmlFor="password" style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: T.inkSoft }}>
                  Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkFaint, pointerEvents: 'none' }}>
                    <Lock size={18} strokeWidth={1.8}/>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    disabled={submitting}
                    className="af-input-field"
                    style={{
                      width: '100%', height: 50, borderRadius: 11,
                      border: `1px solid ${T.line}`, background: T.surface,
                      padding: '0 48px 0 44px', fontSize: 14.5, fontFamily: 'inherit', color: T.ink,
                      transition: 'border-color .14s, box-shadow .14s', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="af-toggle-btn"
                    title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    tabIndex={-1}
                    style={{
                      position: 'absolute', right: 8,
                      width: 36, height: 36, border: 0, background: 'none', borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: T.inkFaint, cursor: 'pointer', transition: '.12s',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} strokeWidth={1.8}/> : <Eye size={18} strokeWidth={1.8}/>}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {errorMsg && (
                <div style={{
                  borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
                  background: T.dangerBg, color: T.danger,
                  border: `1px solid #E6BBB2`, lineHeight: 1.45,
                }}>
                  {errorMsg}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || authLoading}
                className="af-submit-btn"
                style={{
                  height: 50, borderRadius: 11, border: `1px solid ${T.accent}`,
                  background: T.accent, color: '#fff',
                  fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                  cursor: submitting || authLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  marginTop: 6, opacity: submitting || authLoading ? .65 : 1,
                  boxShadow: '0 6px 16px rgba(47,107,63,.22)',
                  transition: '.14s',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} strokeWidth={2.1} style={{ animation: 'spin 1s linear infinite' }}/>
                    Memproses...
                  </>
                ) : (
                  <>
                    Masuk
                    <ArrowRight size={18} strokeWidth={2.1}/>
                  </>
                )}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 13, color: T.inkFaint, marginTop: 26, lineHeight: 1.6 }}>
              Belum punya akses?<br/>
              Hubungi admin untuk dibuatkan akun.
            </p>
          </div>

          {/* Version tag */}
          <div style={{
            textAlign: 'right', fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            color: T.inkFaint, letterSpacing: '.5px',
          }}>
            v2.0
          </div>
        </section>
      </div>

      {/* Loader spin keyframe — Loader2 needs this since we removed animate-spin Tailwind class */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
