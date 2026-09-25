// src/routes/route-table.jsx
// Batch FS Fase 2.5 — SATU daftar rute anak aplikasi: rute modul yang sudah
// dipindah (G2+), rute yang lahir dari kerangka Bagian 1, lalu sisa rute legacy
// (LegacyMenuOutlet).
//
// Dipisah dari `index.jsx` supaya BUKAN hanya router yang bisa membacanya:
// `IndexRedirect` juga perlu tabel LENGKAP untuk memvalidasi `nexus_last_path`
// sebelum mengarahkan ke sana. Di G1 validasi itu memakai `legacyMenuRoutes`
// saja — begitu G2 memindahkan modul pertama keluar dari legacy, seluruh path
// modul itu (termasuk rute detail ber-`:id`) mendadak dianggap tidak dikenal
// dan "kembali ke menu terakhir" jatuh ke /home. Menambah modul cukup satu
// baris di sini, dan kedua pembacanya ikut benar.
//
// ── DUA LAPIS, DAN URUTANNYA PUNYA ALASAN ─────────────────────────────────
// `redirectRoutes` sengaja BERSAUDARA dengan ContextHeader, bukan di dalamnya.
// Sebagian path lama kebetulan sama persis dengan path Level 2 barunya
// (`/crm/sales-order`, `/hcga/service-request`, `/crm/lead`, …). Kalau
// redirect ikut masuk ke dalam ContextHeader, ia yang menangani lebih dulu dan
// melempar ke Level 3 PERTAMA yang layak — padahal path lama itu punya
// tujuan TERTENTU (`/crm/sales-order` = daftar SO CRM, yang kini Level 3
// 1.5.3, bukan 1.5.2). Sebagai saudara, rute redirect yang cocok lebih dulu dan
// tujuan lamanya terjaga. skeleton.routes.jsx melengkapi sisi satunya: ia
// tidak mendaftarkan index Level 2 untuk path yang sudah jadi sumber redirect,
// jadi tidak pernah ada dua rute untuk satu path.
import ContextHeader from './ContextHeader.jsx';
import { crmRoutes } from './crm.routes.jsx';
import { logisticsWarehouseRoutes } from './logistics-warehouse.routes.jsx';
import { financeRoutes } from './finance.routes.jsx';
import { skeletonRoutes } from './skeleton.routes.jsx';
import { redirectRoutes } from './redirects.routes.jsx';
import { legacyMenuRoutes } from './legacy.routes.jsx';

export const childRoutes = [
  ...redirectRoutes,
  {
    // Layout tunggal: satu instance <ContextHeader/> untuk SEMUA rute di bawahnya,
    // jadi pindah tab maupun pindah modul tidak pernah me-remount-nya (pola yang
    // sama dengan LEGACY_OUTLET sejak G1). Rute yang tidak berada di bawah
    // sebuah Level 2 Bagian 1 dirender apa adanya oleh shell itu.
    element: <ContextHeader />,
    children: [
      ...crmRoutes,
      ...logisticsWarehouseRoutes,
      ...financeRoutes,
      ...skeletonRoutes,
      ...legacyMenuRoutes,
    ],
  },
];
