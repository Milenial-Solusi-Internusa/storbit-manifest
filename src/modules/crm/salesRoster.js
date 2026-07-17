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
// Resolusi via RBAC (`roles.code`), tak pernah hardcode role_id. SELALU company-scoped:
// row role `gm_bd` hanya ada di MSI → gm_bd cuma muncul untuk user MSI (memang begitu;
// jangan dilonggarkan).
//
// File ini menggantikan 4 salinan identik `fetchSalesProfiles` yang sebelumnya di-copy-paste
// di CRMDashboardPage / ActivitiesPage / SalesCallsPage / ActivityLogPage.
import { supabase } from '../../lib/supabase';

// Role yang boleh dipilih sebagai pelaksana operasional. Tambah di SINI, satu tempat.
export const OPERATIONAL_ROSTER_ROLES = ['sales', 'gm_bd'];

/* Resolve active operational-roster users for a company via RBAC
   (roles.code IN OPERATIONAL_ROSTER_ROLES), never a hardcoded role_id. Conditions:
   same company, user_roles active + not revoked. Returns [{ id, full_name }]
   (active profiles only). */
export async function fetchOperationalRoster(companyId) {
  const { data: roleRows } = await supabase
    .from('roles').select('id').eq('company_id', companyId).in('code', OPERATIONAL_ROSTER_ROLES);
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
