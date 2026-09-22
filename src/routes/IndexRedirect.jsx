// src/routes/IndexRedirect.jsx
// Batch FS Fase 2.5 G1 — index route `/`: "kembali ke menu terakhir". Sebelum G1,
// activeMenu diinisialisasi dari localStorage `nexus_last_menu` (App.jsx :1829-1831);
// kini `/` diarahkan ke `nexus_last_path` (ditulis App.jsx tiap rute menu berubah),
// atau — bila belum ada (sesi lama / browser lama) — id `nexus_last_menu`
// DITERJEMAHKAN ke path lewat pathFor(). Tanpa keduanya → /home.
//
// Path tersimpan divalidasi ke tabel rute dulu (matchRoutes): nilai asing/basi
// tidak boleh mengirim ke rute `*` yang balik lagi ke `/` (loop). Tidak menunggu
// izin di sini — persis seperti restore lama yang langsung merender menu terakhir;
// validasi aksesnya tetap milik FIX B guard di App.jsx (menunggu
// permissionsLoading/bnfAuthLoading sebelum memental).
import { useState } from 'react';
import { Navigate, matchRoutes } from 'react-router';
import { pathFor } from './menu-paths.js';
import { legacyMenuRoutes } from './legacy.routes.jsx';

function readLastPath() {
  let path;
  try {
    path = localStorage.getItem('nexus_last_path') || pathFor(localStorage.getItem('nexus_last_menu'));
  } catch {
    return '/home';   // localStorage tidak tersedia (mode privat ketat) → seperti tanpa riwayat
  }
  if (!path || !path.startsWith('/') || !matchRoutes(legacyMenuRoutes, path)) return '/home';
  return path;
}

export default function IndexRedirect() {
  // Dibaca sekali saat mount (lazy initializer) — bukan tiap render.
  const [to] = useState(readLastPath);
  return <Navigate to={to} replace />;
}
