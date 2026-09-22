// src/routes/LegacyMenuRedirect.jsx
// Batch FS Fase 2.5 G1 — alamat LAMA `?menu=<id>` (bookmark / link yang sudah
// beredar) → path barunya dari kontrak URL, param dibuang. Dirender App.jsx
// MENGGANTIKAN <Outlet/> selama param `menu` ada di URL, jadi tidak ada halaman
// yang sempat mount sebelum tujuannya diputuskan.
//
// Gate-nya = REPLIKA persis effect adopsi `?menu=` yang dicabut di G1
// (App.jsx sebelum G1 :2325-2340): tunggu permissionsLoading/bnfAuthLoading
// (izin tier-3 & is_bnf_authorized() belum settle → jangan menolak dulu), lalu
// canRenderPage(id) — id di luar pohon menu / tanpa izin TIDAK diadopsi: pengguna
// mendarat di `/` (= menu terakhir tersimpan atau /home), sama seperti sebelum G1
// ("ditolak tanpa pernah membuka isinya", dikonfirmasi Den 21 Sep 2026). Hanya
// id yang lolos yang diarahkan ke path barunya.
import { Navigate } from 'react-router';
import { useAppShell } from '@/contexts/useAppShell';
import { pathFor } from './menu-paths.js';

export default function LegacyMenuRedirect({ menuId }) {
  const { canRenderPage, permissionsLoading, bnfAuthLoading } = useAppShell();
  if (permissionsLoading || bnfAuthLoading) return null;
  const to = (menuId && canRenderPage(menuId) && pathFor(menuId)) || '/';
  return <Navigate to={to} replace />;
}
