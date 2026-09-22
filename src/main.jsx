import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './kit/kit.css' // kit tunggal (Batch DS 2): keyframes/skeleton/focus-ring, menggantikan <KitStyles/> per halaman
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { router } from './routes/index.jsx'

// Sentry — error tracker runtime (Batch FS Fase 2.5 G0). Inisialisasi MINIMAL:
// error/unhandled-rejection global saja (nol tracing, nol replay). Aktif HANYA
// kalau VITE_SENTRY_DSN terisi saat build (Vercel env Production/Preview);
// tanpa DSN (dev lokal, CI) = tidak ada init sama sekali, nol request keluar.
// Lingkungan dibaca dari VITE_APP_ENV (sudah ada di .env.example: development |
// staging | production), fallback ke mode Vite. Query string URL Supabase dibuang
// dari breadcrumb fetch/xhr supaya filter data (id, email) tidak ikut terkirim.
// ⚠️ Error yang DITANGKAP ErrorBoundary aplikasi (components/ErrorBoundary.jsx)
// tidak sampai ke sini — itu perluasan sadar untuk giliran berikutnya.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    beforeBreadcrumb(crumb) {
      if ((crumb.category === 'fetch' || crumb.category === 'xhr') && crumb.data?.url) {
        crumb.data.url = String(crumb.data.url).split('?')[0]
      }
      return crumb
    },
  })
}

// Routing berbasis path (Batch FS Fase 2.5 G1): peta rute tunggal di
// src/routes/index.jsx — root route-nya <AuthGate><App/></AuthGate>, jadi urutan
// pembungkus tetap AuthProvider → AuthGate → App seperti sebelum G1.
// useTransitions={false} (prop resmi react-router v7): update state router TIDAK
// dibungkus React.startTransition, sehingga navigate() yang dipanggil bersama
// setState lain dalam satu handler (pola lama `setSelectedSpId(null);
// setActiveMenu('picking'); setSelectedPickingId(pid)`) tetap satu commit —
// dengan transition, React merender update sinkron lebih dulu dan halaman
// daftar sempat mount sesaat sebelum rutenya menyusul.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} useTransitions={false} />
    </AuthProvider>
  </StrictMode>,
)
