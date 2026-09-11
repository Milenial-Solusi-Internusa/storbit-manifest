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
//   MANAGER_OR_ABOVE     ↔ is_manager_or_above()   (schema_snapshot.sql)
//   SP_ITEM_WRITER_ROLES ↔ is_sp_item_writer()
//   ALL_ENTITIES_ROLES   ↔ is_super_admin()         (bypass lintas entitas)
// Katalog role sendiri (nama, warna) TIDAK di sini — itu tabel `roles`.
//
// Yang SENGAJA tidak ada di sini: PERMISSIONS/can() (TD-182, task terpisah),
// role hantu 'sales_spv' di QuotationFormPage (keputusan bisnis terpisah),
// dan array `role: [...]` pada item menu (rezim menu, task terpisah).

// Cermin is_manager_or_above() — 7 role, TERMASUK gm_bd (keputusan Den 11 Sep
// 2026: GM BD harus melihat seluruh timnya, sama seperti GM biasa; 3 tempat
// yang dulu tidak menyertakannya adalah BUG) dan supervisor (ada di guard DB,
// walau role-nya belum ada di tabel `roles` — TD-106; inert sampai dibuat).
export const MANAGER_OR_ABOVE = ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor'];

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

export const isManagerOrAbove = (erpRoles, opt) => hasAnyRole(erpRoles, MANAGER_OR_ABOVE, opt);
export const isAllEntities    = (erpRoles, opt) => hasAnyRole(erpRoles, ALL_ENTITIES_ROLES, opt);
export const isAdminSettings  = (erpRoles, opt) => hasAnyRole(erpRoles, ADMIN_SETTINGS_ROLES, opt);
export const isSuperAdmin     = (erpRoles, opt) => hasAnyRole(erpRoles, ['super_admin'], opt);
export const canWriteSpItem   = (erpRoles, opt) => hasAnyRole(erpRoles, SP_ITEM_WRITER_ROLES, opt);

// isSalesOnly — flag RESTRIKTIF, dievaluasi terhadap role UTAMA (string kode),
// bukan erpRoles. Lihat catatan SALES_ONLY_ROLES.
export const isSalesOnly = (erpRole) => SALES_ONLY_ROLES.includes(erpRole);
