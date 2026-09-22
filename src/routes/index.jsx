// src/routes/index.jsx
// Batch FS Fase 2.5 G1 — SATU peta rute aplikasi (Fase 0 §6 "routing tunggal
// src/routes/"), dipasang main.jsx lewat <RouterProvider>. Bentuk hari ini:
//
//   /                 root  — <AuthGate><App/></AuthGate>: App = shell/layout
//                              (sidebar, topbar, state halaman) + <Outlet/>
//     index           IndexRedirect  → path terakhir tersimpan, atau /home
//     <path>/*        legacyMenuRoutes (legacy.routes.jsx) — 167 rute kanonik,
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
import { legacyMenuRoutes } from './legacy.routes.jsx';

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
      ...legacyMenuRoutes,
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
