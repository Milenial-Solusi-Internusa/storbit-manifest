// src/routes/route-table.jsx
// Batch FS Fase 2.5 — SATU daftar rute anak aplikasi: rute modul yang sudah
// dipindah (G2+) diikuti sisa rute legacy (LegacyMenuOutlet).
//
// Dipisah dari `index.jsx` supaya BUKAN hanya router yang bisa membacanya:
// `IndexRedirect` juga perlu tabel LENGKAP untuk memvalidasi `nexus_last_path`
// sebelum mengarahkan ke sana. Di G1 validasi itu memakai `legacyMenuRoutes`
// saja — begitu G2 memindahkan modul pertama keluar dari legacy, seluruh path
// modul itu (termasuk rute detail ber-`:id`) mendadak dianggap tidak dikenal
// dan "kembali ke menu terakhir" jatuh ke /home. Menambah modul di G3–G6 cukup
// satu baris di sini, dan kedua pembacanya ikut benar.
import { crmRoutes } from './crm.routes.jsx';
import { logisticsWarehouseRoutes } from './logistics-warehouse.routes.jsx';
import { legacyMenuRoutes } from './legacy.routes.jsx';

export const childRoutes = [
  ...crmRoutes,
  ...logisticsWarehouseRoutes,
  ...legacyMenuRoutes,
];
