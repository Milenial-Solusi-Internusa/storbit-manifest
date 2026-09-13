// src/modules/crm/salesRoster.js
// Roster OPERASIONAL — "siapa yang boleh di-assign / dipilih sebagai PELAKSANA" di
// permukaan CRM harian: dropdown salesperson visit (AddVisitModal), assignee
// ActivitiesPage, salesperson SalesCallsPage, filter ActivityLogPage.
//
// ⚠️ JANGAN disatukan dengan roster LAPORAN (`CRMReportPage.jsx` — tetap
//    ['sales','supervisor','manager'], TANPA gm_bd). Dua konsep berbeda:
//      • OPERASIONAL = siapa yang boleh di-assign        → gm_bd MASUK (BD ikut visit customer)
//      • LAPORAN     = performa sales siapa yang dihitung → BD TIDAK dihitung (keputusan bisnis)
//    Menyatukan keduanya = diam-diam memasukkan BD ke angka Sales Report. Sengaja dipisah.
//
// Resolusi via RBAC (`roles.code`), tak pernah hardcode role_id. SELALU company-scoped,
// TAPI scoping-nya ada di `user_roles.company_id` (langkah 2), BUKAN di `roles` (langkah 1):
// sejak migrasi 20260821000003_globalize_roles.sql, row `roles` untuk kode global berpindah ke
// `company_id = NULL`, jadi memfilter `roles.company_id` justru mengembalikan NOL baris.
// Efek lamanya tetap berlaku: `gm_bd` cuma muncul untuk user MSI — karena hanya user MSI yang
// punya row `user_roles` gm_bd, bukan lagi karena row `roles`-nya milik MSI. Jangan dilonggarkan:
// filter company_id di langkah 2 WAJIB tetap ada.
//
// File ini menggantikan 4 salinan identik `fetchSalesProfiles` yang sebelumnya di-copy-paste
// di CRMDashboardPage / ActivitiesPage / SalesCallsPage / ActivityLogPage.
import { supabase } from '../../lib/supabase';
import { BD_SALES_ROLES } from '../../lib/roles';

// Role yang boleh dipilih sebagai pelaksana operasional. Tambah di SINI, satu tempat.
// Pilot 3 BD (12 Sep 2026): 'sales' lama (dormant) diganti 4 role penjual bd_*
// (BD_SALES_ROLES — exec, AE, dan kedua SPV ikut di-assign visit/activity);
// gm_bd tetap. bd_digital_marketing_spv sengaja tidak (nol jejak CRM).
export const OPERATIONAL_ROSTER_ROLES = [...BD_SALES_ROLES, 'gm_bd'];

/* Resolve active operational-roster users for a company via RBAC
   (roles.code IN OPERATIONAL_ROSTER_ROLES), never a hardcoded role_id. Conditions:
   same company, user_roles active + not revoked. Returns [{ id, full_name }]
   (active profiles only). */
export async function fetchOperationalRoster(companyId) {
  const { data: roleRows } = await supabase
    .from('roles').select('id').in('code', OPERATIONAL_ROSTER_ROLES).is('deleted_at', null);
  const roleIds = (roleRows || []).map(r => r.id);
  if (!roleIds.length) return [];
  const { data: urs } = await supabase
    .from('user_roles').select('user_id')
    .eq('company_id', companyId).in('role_id', roleIds)
    .eq('is_active', true).is('revoked_at', null);
  const userIds = [...new Set((urs || []).map(u => u.user_id).filter(Boolean))];
  if (!userIds.length) return [];
  const { data: profs } = await supabase
    .from('profiles').select('id, full_name').in('id', userIds)
    .eq('active', true).order('full_name').limit(1000);
  return profs || [];
}
