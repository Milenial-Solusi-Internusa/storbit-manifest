// src/lib/bnfOrgScope.js
// Shared BNF org-scope resolution — extracted from BNFListPage.jsx (Tugas 2,
// 2026-08-11) so MeetingMingguanPage.jsx can reuse the exact same logic
// (2026-08-12) rather than duplicating it. Plain async function, not a hook —
// callers already own their own profile/company state and just need this on
// demand inside another fetch (mirrors src/modules/procurement/prfShared.js's
// shape: shared logic as a plain importable function, not a component/hook).
import { supabase } from './supabase';

// Resolves which bnf_departments ids should scope the current user's view
// (BNF "Tarik dari Insiden" picker, Meeting Mingguan department picker, ...).
// Returns null = no restriction (company-wide — covers super_admin/ceo/
// bnf_authorized_users-only grants, none of whom have a natural department),
// or an array of department ids: the head's own department(s) + departments
// under any division they direct + cross-company scope via
// bnf_department_scopes/bnf_division_scopes (the exact same mechanism
// bnf_report_action_items' own RLS already uses). Confirmed with Den
// (2026-08-11). Note: that scope expansion is currently a no-op for
// daily_report_items specifically (its own RLS is same-company-only and
// doesn't recognize the scope tables the way bnf_reports/
// bnf_report_action_items do) — kept anyway per the confirmed design; starts
// working automatically if that RLS is ever extended to match, with no
// further change needed here. Distinguishing "is this user a head/director
// at all" purely by whether either query below returns any row means
// super_admin/ceo/bnf_authorized_users-only all fall through to the
// company-wide `null` return without needing their own role check.
export async function resolveMyDeptScope({ isAllEntities, profileId, companyId }) {
  if (isAllEntities) return null; // super_admin: company-wide, all companies
  const [headRes, dirRes] = await Promise.all([
    supabase.from('bnf_departments').select('id').eq('head_profile_id', profileId).is('deleted_at', null).limit(1000),
    supabase.from('bnf_divisions').select('id').eq('director_profile_id', profileId).is('deleted_at', null).limit(1000),
  ]);
  const headDeptIds = (headRes.data || []).map((d) => d.id);
  const myDivisionIds = (dirRes.data || []).map((d) => d.id);
  if (headDeptIds.length === 0 && myDivisionIds.length === 0) return null; // ceo / bnf_authorized_users-only: company-wide

  const deptIds = new Set(headDeptIds);
  if (myDivisionIds.length) {
    const { data: divDepts } = await supabase.from('bnf_departments').select('id').in('division_id', myDivisionIds).is('deleted_at', null).limit(1000);
    (divDepts || []).forEach((d) => deptIds.add(d.id));
  }
  const [depScopeRes, divScopeRes] = await Promise.all([
    supabase.from('bnf_department_scopes').select('department_id').eq('company_id', companyId).limit(1000),
    supabase.from('bnf_division_scopes').select('division_id').eq('company_id', companyId).limit(1000),
  ]);
  (depScopeRes.data || []).forEach((r) => deptIds.add(r.department_id));
  const scopedDivisionIds = (divScopeRes.data || []).map((r) => r.division_id);
  if (scopedDivisionIds.length) {
    const { data: scopedDivDepts } = await supabase.from('bnf_departments').select('id').in('division_id', scopedDivisionIds).is('deleted_at', null).limit(1000);
    (scopedDivDepts || []).forEach((d) => deptIds.add(d.id));
  }
  return [...deptIds];
}
