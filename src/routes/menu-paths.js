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

import { SKELETON_MENU_PATHS } from './menu-skeleton.js';

const FA = '/finance-accounting';
const AS = '/admin-settings';

/** id menu → path.
 *
 *  Sejak kerangka Bagian 1 dipasang, SEBAGIAN BESAR isi tabel ini datang dari
 *  `menu-skeleton.js`: tiap halaman hidup kini duduk di sebuah tab Level 3, dan
 *  path-nya adalah path tab itu. Yang tertinggal sebagai literal di bawah hanya
 *  yang memang TIDAK duduk di kerangka — shell, BNF (keluar dari sidebar tapi
 *  rutenya hidup), Admin Settings, master customer Storbit, dan id sintetis
 *  halaman detail.
 *
 *  Path LAMA tidak hilang: pasangannya ada di `LEGACY_PATH_REDIRECTS`
 *  (menu-skeleton.js) dan dipasang sebagai rute redirect oleh
 *  `redirects.routes.jsx`, jadi bookmark & `nexus_last_path` lama tetap mendarat
 *  di tempat yang benar. */
export const MENU_PATHS = Object.freeze({
  // ── Sistem / shell ───────────────────────────────────────────────────────
  'home':                    '/home',
  'dashboard':               '/dashboard',                 // Command Center (public)

  // ── Master customer Storbit ──────────────────────────────────────────────
  // SENGAJA tidak dipasang di tab mana pun (keputusan Den): rute dan izinnya
  // (`logistics_customer_storbit`) tetap apa adanya, ia hanya memang tidak
  // pernah punya leaf sidebar — sama seperti sebelum kerangka ini ada.
  'customers':               `${FA}/customer`,

  // ── Keluarga BNF ─────────────────────────────────────────────────────────
  // Keluar dari sidebar (keputusan Den #7). Rute `/bnf/*` TETAP HIDUP dan
  // gate `is_bnf_authorized()` tidak disentuh — yang hilang hanya entri menunya.
  'bnf':                     '/bnf',
  'briefing-harian':         '/bnf/daily-briefing',
  'meeting-mingguan':        '/bnf/weekly-meeting',

  // ── Admin Settings (layer sistem, bukan modul bisnis) ────────────────────
  'admin-hub':               AS,                            // landing AdminHub
  'products':                `${AS}/products`,
  'bulk-edit-price':         `${AS}/bulk-price`,            // kartu AdminHub, tanpa leaf sidebar
  'bnf-org-roles':           `${AS}/bnf-org-roles`,         // kartu AdminHub, tanpa leaf sidebar
  'schema-manager':          `${AS}/schema-manager`,        // kartu AdminHub, tanpa leaf sidebar

  // ── Kerangka Bagian 1 ────────────────────────────────────────────────────
  // 54 id halaman lama yang kini duduk di tab Level 3 (id & menu key-nya TIDAK
  // berubah — itu yang menjaga izin tetap sama), 157 id tab placeholder
  // (`ph-*`), dan 11 id stub AssetShell.
  ...SKELETON_MENU_PATHS,

  // ── Id sintetis halaman DETAIL (dinavigasi programatik, tanpa id record di
  //    URL hari ini). Dari `?menu=<id>` lama tanpa record → mendarat di DAFTAR
  //    induknya; template detail ber-`:id` ada di DETAIL_ROUTE_TEMPLATES. ─────
  'customer-detail':         '/crm/customer/legal-contact',
  'product-detail':          `${AS}/products`,
  'assets-detail':           '/it/asset-inventory/asset-master/overview',
  'user-edit':               `${AS}/user-access`,
});

/** Template rute detail/aksi milik tiap halaman.
 *  DITURUNKAN dari MENU_PATHS, bukan ditulis ulang: sejak halaman-halaman itu
 *  duduk di tab Level 3, alamat induknya bergeser, dan template yang ditulis
 *  tangan akan diam-diam menunjuk path lama. Dipakai nyata oleh
 *  logistics-warehouse.routes.jsx (tiga rute detail) dan sebagai kontrak
 *  tertulis untuk sisanya. */
const P = MENU_PATHS;
export const DETAIL_ROUTE_TEMPLATES = Object.freeze({
  'crm-inquiry':        [`${P['crm-inquiry']}/new`, `${P['crm-inquiry']}/:id`, `${P['crm-inquiry']}/:id/edit`],
  'quotation-draft':    [`${P['quotation-draft']}/new`, `${P['quotation-draft']}/:id`, `${P['quotation-draft']}/:id/edit`],
  'crm-prospects':      [`${P['crm-prospects']}/new`, `${P['crm-prospects']}/:id/edit`],
  // Dua bentuk BERSARANG lahir di G3 sebagai konsekuensi keputusan Den
  // "kembali ke customer yang membukanya": tujuan itu hanya deterministik
  // kalau ASAL-USULNYA ada di URL. Kalau dititipkan ke location.state,
  // janji "tetap benar setelah refresh / deep-link" gugur persis di kasus
  // yang jadi alasan memilihnya.
  'customer-detail':    [`${P['crm-customers']}/:id`,
                         `${P['crm-customers']}/:id/inquiry/:inquiryId/edit`,
                         `${P['crm-customers']}/:id/quotation/:quotationId`],
  'crm-sales-order':    [`${P['crm-sales-order']}/new`, `${P['crm-sales-order']}/:id`],
  'proc-inquiry-fwd-msi': [`${P['proc-inquiry-fwd-msi']}/:id`, `${P['proc-inquiry-fwd-msi']}/:id/edit`],
  'proc-sales-order':   [`${P['proc-sales-order']}/:id`],
  'manifest':           [`${P.manifest}/:customerId/:spNo`],
  'picking':            [`${P.picking}/:id`],
  'surat-jalan':        [`${P['surat-jalan']}/:id`],
  'hrga':               [`${P.hrga}/:id`],
  'assets-detail':      [`${P.assets}/:category/:id`, `${P.assets}/:category/new`],
  'reporting-mom':      [`${P['reporting-mom']}/new`, `${P['reporting-mom']}/:id`, `${P['reporting-mom']}/:id/edit`],
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
  'inventory-pengeluaran',   // 'inventory-opname' & 'inventory-transfer' kini tab 3.12.1 / 3.11.1
  'freight', 'freight-air', 'freight-fcl', 'freight-lcl',
  'job-aktif', 'job-buat', 'job-history', 'job-semua',   // 'job' kini tab 3.1.1
  'trading-rekap', 'trading-transaksi',                  // 'trading' kini tab 2.5.1
  'ppjk', 'ppjk-bc11', 'ppjk-bc23', 'ppjk-bc30', 'ppjk-ekspor', 'ppjk-ekspor-tracking',
  'ppjk-impor', 'ppjk-impor-tracking', 'ppjk-manifest', 'ppjk-peb', 'ppjk-pib',
  'ppjk-trucking', 'ppjk-trucking-jadwal', 'ppjk-trucking-order', 'ppjk-trucking-riwayat',
  // Pointer "Master Customer — Di CRM" (ERP tree saja; hari ini ComingSoon → kandidat redirect /crm/customer di G5)
  'ref-crm-customers-pointer',
  // Procurement placeholder
  'vendors', 'vendors-daftar', 'vendors-evaluasi', 'vendors-kontrak', 'vendors-blacklist',
  // Finance placeholder — 'billing' KELUAR dari daftar ini pada AR Tahap 2
  // (25 Sep 2026): ia kini dipasang di tab 6.2.1 dan path-nya datang dari
  // SKELETON_MENU_PATHS. 'ap' → tab 6.3.1, 'accounting' → 6.4.1,
  // 'cashBank' → 6.1.1.
  // IT / Service placeholder
  'it-tickets', 'it-buat', 'it-semua', 'it-pending', 'it-arsip', 'it-sla', 'it-kategori',   // 'it' kini tab 8.1.1
  // Workflow / approvals placeholder
  'approvals', 'approvals-pending', 'approvals-processed', 'approvals-delegasi',
  'approvals-template', 'approvals-template-buat',
  // Reporting / audit / performance placeholder
  'reports', 'reports-executive', 'reports-operasional', 'reports-keuangan', 'reports-custom',
  'reporting-form-report',
  'audit-activity', 'audit-compliance', 'audit-log',     // 'audit' kini tab 9.2.1
  'performance', 'performance-system', 'performance-cache',
  // ── 32 id camelCase (ditambahkan G1, 22 Sep 2026) ────────────────────────
  // Terlewat di G0: regex gate check-menu-paths.mjs hanya menyapu id kebab-case,
  // padahal pohon ERP_MENU_GROUPS memuat id camelCase ini. Dua di antaranya
  // (jobCosting, cashBank) = leaf sidebar Finance yang bisa diklik — tanpa entri
  // ini setActiveMenu('jobCosting') tidak punya path dan klik-nya diam.
  // Id dipakai VERBATIM di path (/planned/jobCosting) sesuai #3 — bukan kebab —
  // supaya PLANNED_MODULES[activeMenu] (ComingSoon spesifik) tetap cocok tanpa
  // mengubah pohon menu; rename ke kebab-case = kandidat Fase 3/8 Batch FS.
  'jobCosting',
  'procRequest', 'procRequest-buat', 'procRequest-semua', 'procRequest-pending', 'procRequest-arsip',
  'purchaseOrder-buat', 'purchaseOrder-semua', 'purchaseOrder-pending', 'purchaseOrder-history',   // 'purchaseOrder' kini tab 2.4.1
  'docMgmt-upload', 'docMgmt-semua', 'docMgmt-kategori', 'docMgmt-arsip',   // 'docMgmt' kini tab 9.1.1
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
  // normalisasi Master Customer per-entitas (Tahap 2a). Tujuannya DITURUNKAN
  // dari MENU_PATHS, bukan literal: sejak halaman-halaman ini duduk di tab
  // Level 3, alamatnya bergeser, dan literal lama akan menunjuk ke rute yang
  // kini hanya redirect (dua lompatan untuk hasil yang sama).
  'crm-customers-msi':              MENU_PATHS['crm-customers'],
  'crm-customers-jci':              MENU_PATHS['crm-customers'],
  'crm-customers-soa':              MENU_PATHS['crm-customers'],
  'crm-customers-free':             MENU_PATHS['crm-customers'],
  // induk `inventory` → default Stok Barang (effect redirect App.jsx)
  'inventory':                      MENU_PATHS['inventory-stok'],
  // kontainer CRM (klik = tab pertama; `?menu=` langsung hari ini = blank)
  'crm-group':                      MENU_PATHS['crm-dashboard'],
  'crm-account':                    MENU_PATHS['crm-prospects'],
  'crm-aktivitas':                  MENU_PATHS['crm-calls'],
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
