// src/components/AuthGate.jsx
// Wrapper yang nge-handle 3 auth states: loading → login → app
// Inactive user juga di-handle (kasih message + tombol logout).

import { useEffect } from 'react';
import { Loader2, Package, ShieldOff, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import Login from './Login';

// TD-301: how long the "Akun Dinonaktifkan" message stays on screen before
// signOut() fires automatically. Long enough to read, short enough that
// "keluar otomatis" is true rather than nominal.
const INACTIVE_AUTO_SIGNOUT_MS = 3000;

const PASTEL = {
  peach: '#FFD4B8',
  rose: '#F5C8D5',
  cream: '#FAF6F0',
  ink: '#2D2A26',
  inkSoft: '#6B6660',
  inkMute: '#9A948C',
  line: '#E8E0D5',
};

export default function AuthGate({ children }) {
  const { loading, isAuthenticated, profile, signOut } = useAuth();

  // TD-301: auto-signout once the "Akun Dinonaktifkan" screen is shown below
  // — previously a manual "Keluar" button only. Must be an unconditional hook
  // call (before the early returns that follow), per Rules of Hooks; the
  // condition lives inside the effect, not in whether the effect runs. This
  // only affects the SPA's own rendering/session — it does not touch
  // authorization. The real guard against an inactive-but-still-authenticated
  // user is the server-side RLS fix (TD-301 Lapis B migration), which applies
  // whether or not this tab is even open.
  const isDeactivated = !isAuthenticated && !!profile && profile.active === false;
  useEffect(() => {
    if (!isDeactivated) return undefined;
    const t = setTimeout(() => { signOut(); }, INACTIVE_AUTO_SIGNOUT_MS);
    return () => clearTimeout(t);
  }, [isDeactivated, signOut]);

  // 1. Loading: cek session lagi proses
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: PASTEL.cream }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${PASTEL.peach}, ${PASTEL.rose})`,
            }}
          >
            <Package size={24} style={{ color: PASTEL.ink }} strokeWidth={2} />
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: PASTEL.inkSoft }}>
            <Loader2 size={14} className="animate-spin" />
            Memuat sesi...
          </div>
        </div>
      </div>
    );
  }

  // 2. Belum login: tampilin login screen
  if (!isAuthenticated) {
    // Edge case: ada session tapi profile inactive (di-deactivate admin)
    if (profile && profile.active === false) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: PASTEL.cream }}
        >
          <div
            className="max-w-md w-full rounded-3xl p-8 border text-center"
            style={{ background: 'white', borderColor: PASTEL.line }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: PASTEL.rose }}
            >
              <ShieldOff size={24} style={{ color: PASTEL.ink }} />
            </div>
            <h2
              className="font-display text-xl font-semibold mb-2"
              style={{ color: PASTEL.ink }}
            >
              Akun Dinonaktifkan
            </h2>
            <p className="text-sm mb-6" style={{ color: PASTEL.inkSoft }}>
              Akun Anda saat ini tidak aktif. Silakan hubungi admin untuk
              mengaktifkan kembali.
            </p>
            <button
              onClick={signOut}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2"
              style={{ background: PASTEL.ink, color: PASTEL.cream }}
            >
              <LogOut size={14} />
              Keluar
            </button>
          </div>
        </div>
      );
    }

    return <Login />;
  }

  // 3. Authenticated & active: render app
  return children;
}
