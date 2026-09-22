// src/routes/index.jsx
// Batch FS Fase 2.5 G1 — SATU peta rute aplikasi (Fase 0 §6 "routing tunggal
// src/routes/"), dipasang main.jsx lewat <RouterProvider>. Bentuk hari ini:
//
//   /                 root  — <AuthGate><App/></AuthGate>: App = shell/layout
//                              (sidebar, topbar, state halaman) + <Outlet/>
//     index           IndexRedirect  → path terakhir tersimpan, atau /home
//     <modul>         rute modul yang sudah dipindah — G2: logistics-warehouse
//                     (12 rute, termasuk 3 halaman detail ber-:id)
//     <path>/*        legacyMenuRoutes (legacy.routes.jsx) — sisa rute kanonik,
//                     semuanya merender LegacyMenuOutlet (region render lama)
//     *               alamat tak dikenal → `/` (= menu terakhir / home; perilaku
//                     yang sama dengan sebelum G1, ketika pathname diabaikan)
//
// Alamat lama `?menu=<id>` TIDAK butuh rute: App.jsx merender LegacyMenuRedirect
// menggantikan <Outlet/> selama param itu ada (lihat file itu).
// File rute per modul (crm.routes.jsx, …) menyusul di G2–G6.
import { createBrowserRouter, Navigate } from 'react-router';
import App from '@/App.jsx';
import AuthGate from '@/components/AuthGate.jsx';
import IndexRedirect from './IndexRedirect.jsx';
import { childRoutes } from './route-table.jsx';

export const routes = [
  {
    path: '/',
    element: (
      <AuthGate>
        <App />
      </AuthGate>
    ),
    children: [
      { index: true, element: <IndexRedirect /> },
      // Rute modul yang sudah dipindah + sisa rute legacy — satu daftar di
      // route-table.jsx, dibaca router INI dan IndexRedirect (validasi
      // `nexus_last_path`). Urutan di dalamnya bukan soal presedensi:
      // react-router memberi peringkat per spesifisitas, bukan per urutan.
      ...childRoutes,
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
