// src/routes/legacy.routes.jsx
// Batch FS Fase 2.5 G1 — rute "legacy": SETIAP path kanonik di kontrak URL
// (MENU_PATHS non-sintetis + PLANNED → /planned/<id>) memasang SATU komponen yang
// sama, LegacyMenuOutlet (App.jsx) = seluruh region render lama, dengan
// `handle.menuId` = id menu lama. activeMenu di App.jsx diturunkan dari handle
// ini, jadi 140-an halaman tetap dapat diakses TANPA satu pun dipindah (giliran
// ini hanya menukar mekanisme alamat). Sufiks `/*` = anak rute splat: sub-path
// (mis. /admin-settings/user-access, /crm/customer/…) mendarat di blok induknya;
// rute statis yang lebih spesifik (/admin-settings/products) tetap menang.
//
// Id sintetis detail (customer-detail / assets-detail / product-detail / user-edit)
// SENGAJA tidak punya rute — path-nya sama dengan daftar induknya; tiga yang
// dipakai dinavigasi programatik lewat location.state (lihat setActiveMenu di
// App.jsx), yang keempat tak punya pemanggil.
//
// Nama file mengikuti keputusan #11 (`.routes.jsx`); file per modul lahir saat
// halamannya dipindah di G2–G6 dan MENGGANTIKAN entri di sini — id yang sudah
// punya rute sendiri dikecualikan lewat MOVED_MENU_IDS di bawah supaya tidak
// pernah ada dua rute untuk path yang sama.
import { LegacyMenuOutlet } from '@/App.jsx';
import { MENU_PATHS, PLANNED_MENU_IDS, PLANNED_PREFIX, SYNTHETIC_DETAIL_IDS } from './menu-paths.js';
import { LOGISTICS_WAREHOUSE_MENU_IDS } from './logistics-warehouse.routes.jsx';

/** Id yang sudah keluar dari LegacyMenuOutlet (G2: modul Logistics & Warehouse). */
const MOVED_MENU_IDS = new Set([...LOGISTICS_WAREHOUSE_MENU_IDS]);

// Satu instance elemen dibagi semua rute: pindah rute → Outlet menerima elemen
// yang identik → React tidak me-remount LegacyMenuOutlet (state detail di App.jsx
// tetap utuh, sama seperti sebelum G1 ketika region ini inline).
const LEGACY_OUTLET = <LegacyMenuOutlet />;

export const legacyMenuRoutes = [
  ...Object.entries(MENU_PATHS)
    .filter(([id]) => !SYNTHETIC_DETAIL_IDS.includes(id) && !MOVED_MENU_IDS.has(id))
    .map(([id, path]) => ({ path: `${path}/*`, handle: { menuId: id }, element: LEGACY_OUTLET })),
  ...PLANNED_MENU_IDS
    .map((id) => ({ path: `${PLANNED_PREFIX}/${id}/*`, handle: { menuId: id }, element: LEGACY_OUTLET })),
];
