// src/lib/roles.js
// SATU sumber kebenaran untuk pengecekan role di FE (11 Sep 2026).
//
// Sebelum file ini ada, daftar "manager ke atas" hidup di ≥9 tempat dengan ≥4
// keanggotaan berbeda (gm_bd hilang di 3 tempat), `['super_admin']` disalin ke
// 14 tempat (satu di antaranya diam-diam `['super_admin','admin']`), dan gate
// Admin Settings ditulis dua kali. Audit RBAC 11 Sep 2026, temuan R2-R4.
//
// ⚠️ Daftar di sini harus SAMA dengan fungsi guard di DB. Kalau salah satu
// diubah, ubah keduanya dalam satu unit kerja:
//   MANAGER_LEVEL_MAX    ↔ roles.level <= 6 di is_manager_or_above() /
//                          is_manager_or_above_in() / mark_delivery_delivered
//                          (LIVE 20260911000004); prf_release / prf_select_offer
//                          menyusul lewat 20260911000005
//   SP_ITEM_WRITER_ROLES ↔ is_sp_item_writer()
//   ALL_ENTITIES_ROLES   ↔ is_super_admin()         (bypass lintas entitas)
// Katalog role sendiri (nama, warna) TIDAK di sini — itu tabel `roles`.
//
// Yang SENGAJA tidak ada di sini: PERMISSIONS/can() (TD-182, task terpisah),
// role hantu 'sales_spv' di QuotationFormPage (keputusan bisnis terpisah),
// dan array `role: [...]` pada item menu (rezim menu, task terpisah).

// "Manager ke atas" = roles.level <= 6 (migrasi 20260911000004), BUKAN daftar
// nama. Skala level (COMMENT ON COLUMN roles.level): 0 super_admin/admin ·
// 1 ceo · 2 gm/gm_bd · 4 manager · 6 supervisor (belum ada, TD-106) · 7 staf
// (sales/finance/finance_controller/operations/procurement/hrga/it) · 99
// viewer. finance_controller SENGAJA 7: guard DB tak pernah memasukkannya
// (regression check 11 Sep 2026). Role baru di tier manajerial (Pekerjaan 4)
// cukup diberi level <= 6 di DB — nol perubahan di sini maupun di 5 fungsi
// SQL. Daftar nama MANAGER_OR_ABOVE yang lama dihapus 11 Sep 2026 sesudah
// dibuktikan identik (nol pemakai).
export const MANAGER_LEVEL_MAX = 6;

// "Semua entitas" = hanya super_admin, cermin bypass is_super_admin() di RLS.
// `admin` di RLS SELALU di-scope ke home company-nya — jadi admin TIDAK
// termasuk di sini, termasuk di dashboard inventory yang dulu sendirian
// memasukkannya (perubahan perilaku disengaja, 11 Sep 2026).
export const ALL_ENTITIES_ROLES = ['super_admin'];

// Gate layar konfigurasi sistem (Admin Settings, BNF org roles).
export const ADMIN_SETTINGS_ROLES = ['super_admin', 'admin'];

// Cermin is_sp_item_writer() — pembuat/pengubah baris item SP. SENGAJA tanpa
// ceo/gm/gm_bd (VIEW-ONLY untuk item SP, keputusan Den 2 Sep 2026).
export const SP_ITEM_WRITER_ROLES = ['super_admin', 'admin', 'manager', 'operations'];

// Cermin is_procurement_functional() (migrasi 20260912000004) — "orang
// procurement" SCM: proc_manager (level 4) + proc_staff (level 7). Role lama
// 'procurement' SENGAJA tidak ada: dormant sejak pilot 2 pecah role (12 Sep
// 2026), RLS/RPC sudah tidak mengenalnya. Daftar eksplisit, bukan prefix.
export const PROCUREMENT_ROLES = ['proc_manager', 'proc_staff'];

// Role yang "hanya melihat miliknya sendiri" di CRM. ⚠️ Flag RESTRIKTIF —
// dievaluasi terhadap ROLE UTAMA (erpRole), BUKAN lewat hasAnyRole: user
// manager@MSI + sales@SOA tidak boleh dianggap sales-only hanya karena punya
// satu role sales. Lihat isSalesOnly di bawah.
export const SALES_ONLY_ROLES = ['sales', 'operations'];

// Label untuk user yang TIDAK punya role di entitas aktif. Ini state eksplisit
// (erpRole = null), menggantikan fallback lama `authRole || 'management'` yang
// berpura-pura jadi role bernama 'management'. Versi pendek untuk badge/footer
// yang sempit, versi lengkap untuk title/tooltip.
export const NO_ROLE_LABEL = 'Tanpa role di entitas ini';
export const NO_ROLE_LABEL_SHORT = 'Tanpa role';

// Kode role dari array user_roles (bentuk AuthContext: row.roles.code).
export const roleCodesOf = (erpRoles) => (erpRoles || []).map((r) => r?.roles?.code).filter(Boolean);

// hasAnyRole — benar kalau SALAH SATU role aktif user ada di `list`.
//
// SEMANTIK: memeriksa SEMUA role aktif user, di SEMUA entitas (erpRoles dari
// AuthContext difetch tanpa filter company). Itu SAMA dengan has_role() dan
// is_manager_or_above() di DB yang buta entitas — jadi gate FE berhenti
// berpura-pura lebih ketat daripada RLS/RPC yang dicerminkannya. Berbeda dari
// `erpRole` (role UTAMA di entitas aktif) yang dipakai flag restriktif.
// `companyId` opsional membatasi ke satu entitas — disediakan untuk kelak
// (DB sudah punya is_manager_or_above_in(company) di branch CRM v3), TIDAK
// dipakai di manapun per 11 Sep 2026.
export function hasAnyRole(erpRoles, list, { companyId } = {}) {
  if (!erpRoles?.length || !list?.length) return false;
  return erpRoles.some((r) =>
    r?.roles?.code && list.includes(r.roles.code)
    && (companyId == null || r.company_id === companyId));
}

export const isAllEntities    = (erpRoles, opt) => hasAnyRole(erpRoles, ALL_ENTITIES_ROLES, opt);
export const isAdminSettings  = (erpRoles, opt) => hasAnyRole(erpRoles, ADMIN_SETTINGS_ROLES, opt);
export const isSuperAdmin     = (erpRoles, opt) => hasAnyRole(erpRoles, ['super_admin'], opt);
export const canWriteSpItem   = (erpRoles, opt) => hasAnyRole(erpRoles, SP_ITEM_WRITER_ROLES, opt);
export const isProcurement    = (erpRoles, opt) => hasAnyRole(erpRoles, PROCUREMENT_ROLES, opt);

// isManagerOrAbove — benar kalau SALAH SATU role aktif user ber-level <=
// MANAGER_LEVEL_MAX (semantik entitas sama dengan hasAnyRole: semua entitas,
// `companyId` opsional). Baris tanpa level integer (kolom belum ada / bentuk
// data lain) dianggap BUKAN manager — fail-closed — dan dilaporkan sekali ke
// console supaya tidak senyap (pola canRenderPage).
let warnedMissingLevel = false;
export function isManagerOrAbove(erpRoles, { companyId } = {}) {
  if (!erpRoles?.length) return false;
  if (!warnedMissingLevel && erpRoles.some((r) => r?.roles && !Number.isInteger(r.roles.level))) {
    warnedMissingLevel = true;
    console.warn('[roles] isManagerOrAbove: ada baris user_roles tanpa roles.level integer — dianggap bukan manager. Cek embed roles(level) di AuthContext / kolom roles.level di DB.');
  }
  return erpRoles.some((r) =>
    Number.isInteger(r?.roles?.level) && r.roles.level <= MANAGER_LEVEL_MAX
    && (companyId == null || r.company_id === companyId));
}

// isSalesOnly — flag RESTRIKTIF, dievaluasi terhadap role UTAMA (string kode),
// bukan erpRoles. Lihat catatan SALES_ONLY_ROLES.
export const isSalesOnly = (erpRole) => SALES_ONLY_ROLES.includes(erpRole);
