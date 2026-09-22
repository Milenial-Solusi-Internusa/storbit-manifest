// src/routes/menu-paths.js
// ============================================================================
// Batch FS Fase 2.5 — KONTRAK URL. Lahir di G0 sebagai kode mati; sejak G1
// (22 Sep 2026) DIPAKAI: src/routes/legacy.routes.jsx membangun rute dari
// MENU_PATHS ∪ PLANNED, App.jsx memanggil pathFor() di setActiveMenu/FIX B,
// LegacyMenuRedirect/IndexRedirect menerjemahkan `?menu=<id>` & nexus_last_menu.
//
// Satu sumber untuk tiga hal:
//   1. MENU_PATHS      — id menu yang bisa dicapai hari ini (pohon ERP_MENU_GROUPS
//                        di App.jsx + id sintetis) → path final. Nama modul memakai
//                        TARGET Peta Struktur (Fase 0 §6 + keputusan Den 21 Sep 2026
//                        #1–#2), BUKAN nama folder saat ini; folder menyusul di
//                        Fase 3/4/7 tanpa mengubah URL.
//   2. PLANNED_MENU_IDS — id placeholder ComingSoon (belum ada halamannya) →
//                        `/planned/<id>` sementara (keputusan #3), dipetakan ulang
//                        saat modulnya dibangun.
//   3. LEGACY_MENU_PATHS — id lama yang hari ini sudah di-redirect/dinormalkan App.jsx
//                        (`users`, `admin-settings-*`, `crm-customers-*`, `inventory`,
//                        kontainer CRM) → path tujuan. Dipakai LegacyMenuRedirect
//                        (`?menu=<id>` bookmark lama) dan migrasi `nexus_last_menu`.
//
// Aturan bentuk path (Fase 0 §6): `/<modul>/<sub-fitur>/<aksi>`, kebab-case,
// tanpa prefix `system` untuk modul non-bisnis. Perubahan tabel ini = perubahan
// kontrak yang dilihat user — wajib disebut eksplisit di PROGRESS.md.
//
// Dijaga skrip `scripts/qa/check-menu-paths.mjs` (dipanggil CI): setiap id di
// pohon menu App.jsx harus punya path, nol path ganda di MENU_PATHS ∪ PLANNED.
// ============================================================================

const LW = '/logistics-warehouse/warehouse';   // prefix panjang dipertahankan (keputusan #1)
const FA = '/finance-accounting';
const HC = '/hcga/service-request';
const AS = '/admin-settings';

/** id menu → path. Halaman NYATA hari ini (ada blok render / shell-nya). */
export const MENU_PATHS = Object.freeze({
  // ── Sistem / shell ───────────────────────────────────────────────────────
  'home':                    '/home',
  'dashboard':               '/dashboard',                 // Command Center (public)

  // ── CRM (modules/crm hari ini → /crm) ────────────────────────────────────
  'crm-dashboard':           '/crm/dashboard',
  'indomarco-dashboard':     '/crm/dashboard/indomarco',
  'crm-pipeline':            '/crm/pipeline',
  'crm-prospects':           '/crm/lead',                   // "Prospects" = akun tahap lead (Peta: crm/lead)
  'crm-lead-pool':           '/crm/lead/pool',
  'crm-lead-pool-approval':  '/crm/lead/pool/approval',
  'crm-inquiry':             '/crm/inquiry',
  'quotation-draft':         '/crm/quotation',
  'crm-customers':           '/crm/customer',
  'crm-calls':               '/crm/activity',               // tab "Jadwal & Tugas"
  'crm-activity-log':        '/crm/activity/log',
  'riwayat-visit':           '/crm/activity/visit',
  'crm-rate-list':           '/crm/rate-list',              // Shared Reference; rumah target belum diputuskan → tetap di /crm
  'reporting-sales':         '/crm/report',                 // CRMReportPage (folder crm/)
  'crm-sales-order':         '/crm/sales-order',            // dokumen SO CRM (tabel sales_orders)

  // ── Procurement ──────────────────────────────────────────────────────────
  'proc-inquiry-fwd-msi':    '/procurement/prf',            // daftar "Forwarding (MSI)" = daftar PRF
  'prf':                     '/procurement/prf/new',        // menu `prf` hari ini = form buat PRF
  'proc-vendor-list':        '/procurement/vendor',
  'proc-sales-order':        '/procurement/sales-order',    // varian read-only SO (komponen sama dgn CRM)

  // ── Logistics & Warehouse (Storbit + Inventory) ──────────────────────────
  'manifest':                `${LW}/sales-order`,           // SP Storbit (tabel sp_orders) — BUKAN sales_orders CRM
  'input':                   `${LW}/sales-order/new`,       // Input SP (menyatukan menu `input` & tombol Tambah SP, keputusan #9)
  'picking':                 `${LW}/picking-packing`,
  'surat-jalan':             `${LW}/delivery-note`,
  'storbit-dashboard':       `${LW}/dashboard`,
  'shipment':                `${LW}/shipment`,              // halaman inline App.jsx (Pengiriman SP)
  'inventory-dashboard':     `${LW}/stock-dashboard`,
  'inventory-stok':          `${LW}/stock`,
  'inventory-penerimaan':    `${LW}/goods-receiving`,

  // ── Finance & Accounting (4 halaman inline App.jsx; Fase 0 §10) ──────────
  'finance':                 `${FA}/documents`,             // FinancePage — status dokumen per SP
  'outstanding':             `${FA}/outstanding`,
  'ar':                      `${FA}/accounts-receivable`,   // ARTrackerPage (TTF)
  'customers':               `${FA}/customer`,              // CustomersPage — master customer Storbit (≠ /crm/customer)

  // ── HCGA (modules/hrga hari ini → /hcga/service-request) ─────────────────
  'hrga':                    HC,                            // My Requests (public)
  'hrga-semua-request':      `${HC}/all`,
  'hrga-buat-request':       `${HC}/new`,                   // (public)
  'hrga-pending-approval':   `${HC}/pending-approval`,
  'hrga-arsip':              `${HC}/archive`,               // (public)

  // ── Assets (AssetShell; 4 kategori nyata + 11 ComingSoon di dalam shell) ─
  'assets':                  '/assets',
  'assets-it':               '/assets/it',
  'assets-kendaraan':        '/assets/vehicle',
  'assets-furniture':        '/assets/furniture',
  'assets-properti':         '/assets/property',
  'assets-analytics':        '/assets/analytics',
  'assets-maint':            '/assets/maintenance-schedule',
  'assets-hist':             '/assets/maintenance-history',
  'assets-workorders':       '/assets/work-orders',
  'assets-docs':             '/assets/documents',
  'assets-expiring':         '/assets/expiring',
  'assets-expired':          '/assets/expired',
  'assets-kategori':         '/assets/categories',
  'assets-lokasi':           '/assets/locations',
  'assets-vendor':           '/assets/vendors',
  'assets-settings':         '/assets/settings',

  // ── Keluarga BNF ─────────────────────────────────────────────────────────
  'bnf':                     '/bnf',
  'briefing-harian':         '/bnf/daily-briefing',
  'meeting-mingguan':        '/bnf/weekly-meeting',

  // ── Reporting (MOM) — modul target belum ada di Peta, tetap /reporting ───
  'reporting-mom':           '/reporting/mom',

  // ── Admin / Foundation ───────────────────────────────────────────────────
  'admin-hub':               AS,                            // landing AdminHub
  'products':                `${AS}/products`,
  'bulk-edit-price':         `${AS}/bulk-price`,            // id sintetis (di luar pohon)
  'bnf-org-roles':           `${AS}/bnf-org-roles`,         // id sintetis (di luar pohon)
  'schema-manager':          `${AS}/schema-manager`,        // id sintetis (di luar pohon)

  // ── Id sintetis halaman DETAIL (dinavigasi programatik, tanpa id record di
  //    URL hari ini). Dari `?menu=<id>` lama tanpa record → mendarat di DAFTAR
  //    induknya; template detail ber-`:id` ada di DETAIL_ROUTE_TEMPLATES (G1+). ─
  'customer-detail':         '/crm/customer',
  'product-detail':          `${AS}/products`,
  'assets-detail':           '/assets',
  'user-edit':               `${AS}/user-access`,
});

/** Template rute detail/aksi yang akan lahir saat modulnya dipindah (G2–G6).
 *  Dokumentasi kontrak; belum dipakai kode mana pun (G1: detail sintetis masih
 *  dibawa lewat location.state di path daftar induknya). */
export const DETAIL_ROUTE_TEMPLATES = Object.freeze({
  'crm-inquiry':        ['/crm/inquiry/new', '/crm/inquiry/:id', '/crm/inquiry/:id/edit'],
  'quotation-draft':    ['/crm/quotation/new', '/crm/quotation/:id', '/crm/quotation/:id/edit'],
  'crm-prospects':      ['/crm/lead/new', '/crm/lead/:id/edit'],
  'customer-detail':    ['/crm/customer/:id'],
  'crm-sales-order':    ['/crm/sales-order/new', '/crm/sales-order/:id'],
  'proc-inquiry-fwd-msi': ['/procurement/prf/:id', '/procurement/prf/:id/edit'],
  'proc-sales-order':   ['/procurement/sales-order/:id'],
  'manifest':           [`${LW}/sales-order/:customerId/:spNo`],
  'picking':            [`${LW}/picking-packing/:id`],
  'surat-jalan':        [`${LW}/delivery-note/:id`],
  'hrga':               [`${HC}/:id`],
  'assets-detail':      ['/assets/:category/:id', '/assets/:category/new'],
  'reporting-mom':      ['/reporting/mom/new', '/reporting/mom/:id', '/reporting/mom/:id/edit'],
  'admin-hub':          [`${AS}/:section`],
  'user-edit':          [`${AS}/user-access/:userId`],
  'product-detail':     [`${AS}/products/:id`],
});

/** 26 destinasi AdminHub (id kartu HUB_GROUPS di pages/foundation/AdminHub.jsx; dokumen lama menyebut 25 — `sales-targets` ditambah 30 Agu 2026)
 *  → `/admin-settings/<id>` saat AdminHub jadi nested route (G6). */
export const ADMIN_SECTION_IDS = Object.freeze([
  'companies', 'branches', 'departments', 'positions', 'org-structure', 'entity-settings',
  'user-access', 'role-defaults',
  'document-types', 'document-settings', 'status-catalog', 'dc-master',
  'sales-targets',
  'finance-defaults', 'taxes', 'payment-terms',
  'products', 'bulk-price',
  'approval-workflows', 'notifications', 'security-policy', 'audit-log', 'general-preferences', 'integrations',
  'schema-manager', 'bnf-org-roles',
]);

/** Id pohon menu yang hari ini merender ComingSoon (PLANNED_MODULES / catch-all
 *  di App.jsx) — 71 id kebab-case + 32 id camelCase (di bawah). Path sementara
 *  `/planned/<id>` (keputusan #3). */
export const PLANNED_MENU_IDS = Object.freeze([
  // Core › Command Center children
  'dashboard-tasks', 'dashboard-notifications', 'dashboard-activity',
  // Logistics placeholder
  'shipment-jadwal', 'shipment-riwayat',
  'inventory-opname', 'inventory-pengeluaran', 'inventory-transfer',
  'freight', 'freight-air', 'freight-fcl', 'freight-lcl',
  'job', 'job-aktif', 'job-buat', 'job-history', 'job-semua',
  'trading', 'trading-rekap', 'trading-transaksi',
  'ppjk', 'ppjk-bc11', 'ppjk-bc23', 'ppjk-bc30', 'ppjk-ekspor', 'ppjk-ekspor-tracking',
  'ppjk-impor', 'ppjk-impor-tracking', 'ppjk-manifest', 'ppjk-peb', 'ppjk-pib',
  'ppjk-trucking', 'ppjk-trucking-jadwal', 'ppjk-trucking-order', 'ppjk-trucking-riwayat',
  // Pointer "Master Customer — Di CRM" (ERP tree saja; hari ini ComingSoon → kandidat redirect /crm/customer di G5)
  'ref-crm-customers-pointer',
  // Procurement placeholder
  'vendors', 'vendors-daftar', 'vendors-evaluasi', 'vendors-kontrak', 'vendors-blacklist',
  // Finance placeholder
  'billing', 'ap', 'accounting',
  // IT / Service placeholder
  'it', 'it-tickets', 'it-buat', 'it-semua', 'it-pending', 'it-arsip', 'it-sla', 'it-kategori',
  // Workflow / approvals placeholder
  'approvals', 'approvals-pending', 'approvals-processed', 'approvals-delegasi',
  'approvals-template', 'approvals-template-buat',
  // Reporting / audit / performance placeholder
  'reports', 'reports-executive', 'reports-operasional', 'reports-keuangan', 'reports-custom',
  'reporting-form-report',
  'audit', 'audit-activity', 'audit-compliance', 'audit-log',
  'performance', 'performance-system', 'performance-cache',
  // ── 32 id camelCase (ditambahkan G1, 22 Sep 2026) ────────────────────────
  // Terlewat di G0: regex gate check-menu-paths.mjs hanya menyapu id kebab-case,
  // padahal pohon ERP_MENU_GROUPS memuat id camelCase ini. Dua di antaranya
  // (jobCosting, cashBank) = leaf sidebar Finance yang bisa diklik — tanpa entri
  // ini setActiveMenu('jobCosting') tidak punya path dan klik-nya diam.
  // Id dipakai VERBATIM di path (/planned/jobCosting) sesuai #3 — bukan kebab —
  // supaya PLANNED_MODULES[activeMenu] (ComingSoon spesifik) tetap cocok tanpa
  // mengubah pohon menu; rename ke kebab-case = kandidat Fase 3/8 Batch FS.
  'jobCosting', 'cashBank',
  'procRequest', 'procRequest-buat', 'procRequest-semua', 'procRequest-pending', 'procRequest-arsip',
  'purchaseOrder', 'purchaseOrder-buat', 'purchaseOrder-semua', 'purchaseOrder-pending', 'purchaseOrder-history',
  'docMgmt', 'docMgmt-upload', 'docMgmt-semua', 'docMgmt-kategori', 'docMgmt-arsip',
  'apiCenter', 'apiCenter-keys', 'apiCenter-webhook', 'apiCenter-log',
  'publicTracking', 'publicTracking-page', 'publicTracking-settings',
  'customerPortal', 'customerPortal-dashboard', 'customerPortal-tracking', 'customerPortal-history',
  'vendorPortal', 'vendorPortal-dashboard', 'vendorPortal-po', 'vendorPortal-invoice',
]);

export const PLANNED_PREFIX = '/planned';

/** Id lama yang hari ini sudah di-redirect/dinormalkan App.jsx, plus kontainer
 *  menu yang tidak pernah dirender sebagai halaman → path tujuan. */
export const LEGACY_MENU_PATHS = Object.freeze({
  // redirect 12 id eks-AdminShell/AdminSettingsHub (App.jsx blok legacy-id)
  'users':                          `${AS}/user-access`,
  'admin':                          AS,
  'admin-settings':                 AS,
  'admin-settings-entity':          `${AS}/entity-settings`,
  'admin-settings-documents':       `${AS}/document-settings`,
  'admin-settings-finance':         `${AS}/finance-defaults`,
  'admin-settings-approvals':       `${AS}/approval-workflows`,
  'admin-settings-notifications':   `${AS}/notifications`,
  'admin-settings-security':        `${AS}/security-policy`,
  'admin-settings-audit':           `${AS}/audit-log`,
  'admin-settings-general':         `${AS}/general-preferences`,
  'admin-settings-integrations':    `${AS}/integrations`,
  // normalisasi Master Customer per-entitas (Tahap 2a)
  'crm-customers-msi':              '/crm/customer',
  'crm-customers-jci':              '/crm/customer',
  'crm-customers-soa':              '/crm/customer',
  'crm-customers-free':             '/crm/customer',
  // induk `inventory` → default Stok Barang (effect redirect App.jsx)
  'inventory':                      `${LW}/stock`,
  // kontainer CRM (klik = tab pertama; `?menu=` langsung hari ini = blank)
  'crm-group':                      '/crm/dashboard',
  'crm-account':                    '/crm/lead',
  'crm-aktivitas':                  '/crm/activity',
});

/** Rute shell tanpa id menu. */
export const PROFILE_PATH = '/profile';
export const NOT_FOUND_PATH = '/404';

/** Path untuk sebuah id menu, atau null kalau id tidak dikenal. */
export function pathFor(menuId) {
  if (!menuId) return null;
  if (MENU_PATHS[menuId]) return MENU_PATHS[menuId];
  if (PLANNED_MENU_IDS.includes(menuId)) return `${PLANNED_PREFIX}/${menuId}`;
  if (LEGACY_MENU_PATHS[menuId]) return LEGACY_MENU_PATHS[menuId];
  return null;
}

/** Id sintetis halaman detail — punya baris di MENU_PATHS hanya sebagai tujuan
 *  pendaratan `?menu=<id>` lama (tanpa record), TIDAK memiliki path-nya sendiri. */
export const SYNTHETIC_DETAIL_IDS = Object.freeze(['customer-detail', 'product-detail', 'assets-detail', 'user-edit']);

/** Peta balik path → id menu (hanya rute kanonik: MENU_PATHS non-sintetis +
 *  planned; legacy tidak ikut karena tujuannya sudah id lain). */
export const PATH_TO_MENU = Object.freeze((() => {
  const out = {};
  for (const [id, p] of Object.entries(MENU_PATHS)) {
    if (SYNTHETIC_DETAIL_IDS.includes(id)) continue;
    if (!(p in out)) out[p] = id;
  }
  for (const id of PLANNED_MENU_IDS) out[`${PLANNED_PREFIX}/${id}`] = id;
  return out;
})());

export function menuIdForPath(pathname) {
  if (!pathname) return null;
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PATH_TO_MENU[clean] ?? null;
}

/** Semua id yang dikenal tabel ini (untuk QA sweep & skrip cek). */
export const KNOWN_MENU_IDS = Object.freeze([
  ...Object.keys(MENU_PATHS),
  ...PLANNED_MENU_IDS,
  ...Object.keys(LEGACY_MENU_PATHS),
]);
