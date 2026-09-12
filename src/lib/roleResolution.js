// src/lib/roleResolution.js
// SATU-SATUNYA definisi "role utama" (primary ERP role) di seluruh app.
//
// Sampai 11 Sep 2026 ada DUA: pickPrimaryErpRole di AuthContext.jsx (prioritas
// + filter entitas — dipakai seluruh gate aplikasi) dan getPrimaryErpRole di
// userAccessTokens.js (`find(is_active)` — baris aktif pertama, company mana
// pun — dipakai UserAccessPage/UserEditPage untuk DITAMPILKAN). Keduanya
// memberi jawaban berbeda untuk user multi-entitas, jadi halaman User Access
// bisa menampilkan role yang bukan role yang dipakai gate, dan sesudah ganti
// role di satu company form masih menampilkan role lama dari company lain
// (terbukti lewat tes ZZZTEST Sales, 11 Sep 2026; audit RBAC temuan R1).
// Kedua pemakai kini mengimpor dari sini. Jangan definisikan ulang di tempat
// lain.

// ERP role priority — highest privilege wins when user has multiple active roles
// proc_manager (level 4) disisipkan tepat sesudah 'manager' (setara), proc_staff
// (level 7) di tier staf di samping 'procurement' lama yang kini dormant
// (pilot 2 pecah role, 12 Sep 2026). Kode yang tak ada di daftar ini mendapat
// prioritas 99 (paling rendah) — bukan error, tapi kalah dari role apa pun.
// Pilot 3 BD (12 Sep 2026): kedua SPV sales (level 6) sejajar 'supervisor';
// bd_account_executive / bd_sales_executive / bd_digital_marketing_spv (level 7)
// di tier staf, di samping 'sales' lama yang kini dormant.
export const ERP_ROLE_PRIORITY = [
  'super_admin','admin','ceo','gm','gm_bd','manager','proc_manager',
  'supervisor','bd_sales_spv_console','bd_sales_spv_forwarding',
  'finance_controller','finance','operations',
  'sales','bd_account_executive','bd_sales_executive','bd_digital_marketing_spv',
  'procurement','proc_staff','hrga','it','viewer',
];

const priorityIndex = (row) => {
  const i = ERP_ROLE_PRIORITY.indexOf(row.roles?.code ?? '');
  return i === -1 ? 99 : i;
};

// Baris user_roles yang boleh ikut dipertimbangkan. `is_active` disaring DI
// SINI, bukan diserahkan ke pemanggil: AuthContext memang mem-fetch
// user_roles dengan is_active = true (jadi filter ini no-op di sana), tapi
// UserAccessPage/UserEditPage mem-fetch SEMUA baris termasuk yang sudah
// dicabut — tanpa filter ini keduanya bisa menampilkan role yang sudah
// dicabut sebagai "role utama". Baris tanpa kolom is_active (undefined)
// dianggap aktif, supaya bentuk data AuthContext tetap lolos.
const isLive = (r) => r && r.is_active !== false;

// pickPrimaryErpRole — role utama user DI SATU COMPANY.
//
// companyId-aware: only roles held IN that company are eligible. This filter
// is LOAD-BEARING — do not simplify it away. Genuinely multi-company users
// exist (e.g. Finance staff holding roles in both MSI and SOA), and
// CompanySwitcher.jsx flips activeCompanyId at runtime, so the same user
// resolves to a different primary role per active company. An older comment
// claimed this was a no-op because every user's roles shared one company_id;
// that stopped being true once multi-company assignments landed.
//
// Jangkar company-nya tanggung jawab pemanggil: AuthContext memakai
// activeCompanyId (entitas aktif si user sendiri); halaman User Access
// memakai HOME company user yang ditampilkan (profiles.company_id) — daftar
// itu lintas entitas, jadi entitas aktif si admin bukan jangkar yang tepat.
//
// Mengembalikan BARIS user_roles (bukan cuma kode) — pemakai membaca
// .role_id, .roles.code, .roles.name. null kalau user tak punya role aktif
// di company itu.
export function pickPrimaryErpRole(userRoles, companyId) {
  const scoped = (userRoles || []).filter(r => isLive(r) && r.company_id === companyId);
  if (!scoped.length) return null;
  // Sort by priority index (lower = higher privilege)
  const sorted = [...scoped].sort((a, b) => priorityIndex(a) - priorityIndex(b));
  return sorted[0];
}

// activeRolesByCompany — SEMUA role aktif user, dikelompokkan per company,
// tiap kelompok terurut prioritas (yang pertama = role utama company itu).
// Dipakai daftar User Access untuk menampilkan multi-role apa adanya, supaya
// kasus seperti Elvira (4 penugasan di 2 entitas) tidak lagi tersembunyi di
// balik satu badge "primary".
//   { [company_id]: [row, row, …] }
export function activeRolesByCompany(userRoles) {
  const groups = {};
  for (const r of (userRoles || [])) {
    if (!isLive(r) || !r.company_id) continue;
    (groups[r.company_id] ||= []).push(r);
  }
  for (const id of Object.keys(groups)) {
    groups[id].sort((a, b) => priorityIndex(a) - priorityIndex(b));
  }
  return groups;
}
