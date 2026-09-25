/* eslint-disable react-refresh/only-export-components -- file peta rute: mengekspor daftar rute (nilai) berdampingan dengan komponen wrapper-nya; pola sama dengan crm.routes.jsx (G3) dan logistics-warehouse.routes.jsx (G2). Komponen HALAMAN-nya sendiri hidup di filenya masing-masing, jadi HMR halaman tidak terpengaruh. */
// src/routes/redirects.routes.jsx
// Path LAMA → path BARU. Sampai kerangka Bagian 1 dipasang, setiap halaman
// hidup punya alamat yang sudah dipakai orang: bookmark, tautan yang ditempel
// di chat, dan `nexus_last_path` di localStorage tiap user. Menggeser alamatnya
// tanpa jembatan ini berarti semuanya mendarat di catch-all `*` → `/`.
//
// Tabelnya sendiri hidup di menu-skeleton.js (LEGACY_PATH_REDIRECTS) karena
// pasangan lama→baru itu turunan dari pemetaan tab, bukan keputusan terpisah.
//
// Rute-rute ini WAJIB ikut di route-table.jsx, bukan hanya di router: IndexRedirect
// memvalidasi `nexus_last_path` terhadap tabel rute yang sama. Tanpa itu, path
// lama yang tersimpan dianggap asing dan "kembali ke menu terakhir" jatuh ke
// /home — persis kelas bug yang ditemukan di G2.
//
// Bentuk ber-`:param` tidak bisa memakai <Navigate> polos (ia tidak
// menginterpolasi parameter), jadi dipakai ParamRedirect di bawah.
import { Navigate, useParams, useLocation } from 'react-router';
import { LEGACY_PATH_REDIRECTS } from './menu-skeleton.js';

function ParamRedirect({ to }) {
  const params = useParams();
  const { search, hash } = useLocation();
  const target = to.replace(/:([A-Za-z0-9_]+)/g, (whole, name) =>
    (params[name] !== undefined ? encodeURIComponent(params[name]) : whole));
  return <Navigate to={`${target}${search}${hash}`} replace />;
}

function PlainRedirect({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export const redirectRoutes = LEGACY_PATH_REDIRECTS.map(([from, to]) => ({
  path: from,
  element: to.includes(':') ? <ParamRedirect to={to} /> : <PlainRedirect to={to} />,
}));
