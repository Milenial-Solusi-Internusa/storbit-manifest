// src/contexts/appShellCtx.js
// AppShellContext — Batch FS Fase 2.5 G1. Jembatan antara App.jsx (shell/layout:
// sidebar, topbar, seluruh state halaman) dan anak rute yang dirender lewat
// <Outlet/>: LegacyMenuOutlet (region render lama, App.jsx), LegacyMenuRedirect
// dan IndexRedirect (src/routes/). Nilainya = objek state + setter + handler yang
// SUDAH ADA di App.jsx sebelum G1 — tidak ada state baru; pola file terpisah
// mengikuti authCtx.js/useAuth.js (react-refresh: file komponen hanya
// mengekspor komponen).
import { createContext } from 'react';
export const AppShellContext = createContext(null);
