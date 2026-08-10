// src/modules/bnf/BNFOrgRolesPage.jsx
// Admin-only: assign bnf_departments.head_profile_id and
// bnf_divisions.director_profile_id (org roles used for BNF notification
// routing/escalation, see BNFListPage.jsx's notifyDepartmentHead()). Sibling
// to BNFListPage.jsx, same module, but reached via its own Foundation menu
// item — not a tab on BNFListPage (rejected in favor of this after checking
// for precedent: no admin-only tab is bolted onto a page that also has
// non-admin tabs anywhere else in this codebase; every admin-only surface is
// its own menu item — see App.jsx wiring). Gated in App.jsx via
// canRenderPage('bnf-org-roles') (role: ['super_admin','admin']) — that
// content-guard, plus bnf_departments_update/bnf_divisions_update RLS
// (already admin_or_above-only, unchanged), are the real enforcement; no
// redundant role check needed inside this component (matches
// BulkEditPricePage.jsx's precedent — same admin-config risk tier).
import { useState, useEffect, useCallback } from 'react';
import { UsersRound, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ProfilePicker from '../../components/ProfilePicker';

const NAVY = '#0F3A66';
const NAVY_DARK = '#0A2745';
const ORANGE = '#E85A1E';
const LINE = '#E2E8F0';

function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

const pickInputCls =
  'w-full rounded-md border px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors';

// Inline-assign cell: shows the current assignee as a chip (with a clear
// button) or, once cleared/empty, a ProfilePicker to assign someone. Saves
// immediately on pick (mirrors BNFListPage.jsx's handleStatusChange —
// immediate-save, not a staged form with its own Submit button).
function AssigneeCell({ currentId, currentName, people, saving, onAssign, onClear }) {
  // No reset-on-currentId-change effect needed: onPick below already clears
  // `text` synchronously before the save (and thus before currentId can
  // change), and onClear only ever fires from the chip view, where `text` is
  // already '' (that's what makes the chip view render in the first place).
  const [text, setText] = useState('');

  if (currentId && !text) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: NAVY }}>
          {initials(currentName)}
        </div>
        <span className="text-[13px] text-slate-700">{currentName || '—'}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={saving}
          className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          title="Hapus penugasan"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <ProfilePicker
      value={text}
      people={people}
      inputClassName={pickInputCls}
      inputStyle={{ borderColor: LINE, fontFamily: 'inherit' }}
      placeholder="Cari orang…"
      onChangeText={setText}
      onPick={(p) => { setText(''); onAssign(p); }}
    />
  );
}

// Scope companies (beyond home) for one division/department row. Company
// universe is fixed at 3 (see CLAUDE.md Entity UUIDs) so candidates are
// always <=2 — shown as an always-visible toggle-pill row rather than an
// expand/search picker (RelatedDepartmentsField's pattern in BNFListPage.jsx
// exists for a much larger, growing candidate list; not the case here).
// Filled pill reuses the existing home-company badge style exactly. Outline
// pill (super_admin only, not-yet-in-scope companies) reuses the muted
// slate palette already used by AssigneeCell's clear button. Non-admin
// viewers never see the outline/add pills at all, and filled pills degrade
// to plain non-interactive spans for them.
function ScopeChips({ homeCompanyId, scopeCompanyIds, companies, isSuperAdmin, saving, onToggle }) {
  const candidates = companies.filter((c) => c.id !== homeCompanyId);
  if (candidates.length === 0) return null;
  const scoped = candidates.filter((c) => scopeCompanyIds.includes(c.id));
  const unscoped = candidates.filter((c) => !scopeCompanyIds.includes(c.id));
  if (!isSuperAdmin && scoped.length === 0) return null;

  const chipCls = 'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide';

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {scoped.map((c) => (
        isSuperAdmin ? (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            disabled={saving}
            title={`Klik untuk hapus ${c.name || c.code} dari scope`}
            className={`${chipCls} cursor-pointer hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50`}
            style={{ backgroundColor: '#EAF0F8', color: NAVY }}
          >
            {c.code}
          </button>
        ) : (
          <span key={c.id} className={chipCls} style={{ backgroundColor: '#EAF0F8', color: NAVY }}>
            {c.code}
          </span>
        )
      ))}
      {isSuperAdmin && unscoped.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onToggle(c.id)}
          disabled={saving}
          title={`Klik untuk tambah ${c.name || c.code} ke scope`}
          className={`${chipCls} border text-slate-400 hover:border-slate-400 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50`}
          style={{ borderColor: LINE }}
        >
          {c.code}
        </button>
      ))}
    </div>
  );
}

export default function BNFOrgRolesPage({ showToast }) {
  const { profile, erpRole } = useAuth();
  const isAllEntities = erpRole === 'super_admin';
  // Separate from isAllEntities on purpose despite the identical predicate
  // today: isAllEntities is the project-wide convention for fetch/data-scope
  // branching (CLAUDE.md "Aturan Wajib"), isSuperAdmin (same pattern as
  // MOMListPage.jsx/UserEditPage.jsx) gates write controls. Different
  // questions that happen to share an answer right now.
  const isSuperAdmin = erpRole === 'super_admin';

  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [divisionScopes, setDivisionScopes] = useState({});
  const [departmentScopes, setDepartmentScopes] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      // `company:...(code)` only matters when isAllEntities (super_admin) —
      // rows then span all 3 companies and same-named divisions/departments
      // (e.g. 3x "Business Development") need a way to tell them apart.
      // Cheap to always select regardless (single row, tiny payload).
      let divQuery = supabase
        .from('bnf_divisions')
        .select('id, code, name, company_id, director_profile_id, director:profiles!bnf_divisions_director_profile_id_fkey(full_name), company:companies!bnf_divisions_company_id_fkey(code)')
        .eq('is_active', true).is('deleted_at', null).order('name').limit(1000);
      let depQuery = supabase
        .from('bnf_departments')
        .select('id, code, name, company_id, division_id, head_profile_id, head:profiles!bnf_departments_head_profile_id_fkey(full_name), company:companies!bnf_departments_company_id_fkey(code)')
        .eq('is_active', true).is('deleted_at', null).order('name').limit(1000);
      let profQuery = supabase.from('profiles').select('id, full_name, email').eq('active', true).order('full_name').limit(1000);
      let divScopeQuery = supabase.from('bnf_division_scopes').select('division_id, company_id').limit(1000);
      let depScopeQuery = supabase.from('bnf_department_scopes').select('department_id, company_id').limit(1000);
      // No deleted_at on companies (see useCompanies.js's own comment) and no
      // company branch below — this query itself IS the company filter, not
      // a child table scoped by one.
      let compQuery = supabase.from('companies').select('id, code, name').eq('is_active', true).limit(1000);
      if (!isAllEntities) {
        divQuery = divQuery.eq('company_id', profile.company_id);
        depQuery = depQuery.eq('company_id', profile.company_id);
        profQuery = profQuery.eq('company_id', profile.company_id);
        divScopeQuery = divScopeQuery.eq('company_id', profile.company_id);
        depScopeQuery = depScopeQuery.eq('company_id', profile.company_id);
      }
      const [divRes, depRes, profRes, divScopeRes, depScopeRes, compRes] =
        await Promise.all([divQuery, depQuery, profQuery, divScopeQuery, depScopeQuery, compQuery]);
      if (divRes.error) throw divRes.error;
      if (depRes.error) throw depRes.error;
      if (profRes.error) throw profRes.error;
      if (divScopeRes.error) throw divScopeRes.error;
      if (depScopeRes.error) throw depScopeRes.error;
      if (compRes.error) throw compRes.error;
      setDivisions(divRes.data || []);
      setDepartments(depRes.data || []);
      setPeople(profRes.data || []);
      setCompanies(compRes.data || []);

      const divScopeMap = {};
      (divScopeRes.data || []).forEach((r) => {
        if (!divScopeMap[r.division_id]) divScopeMap[r.division_id] = [];
        divScopeMap[r.division_id].push(r.company_id);
      });
      setDivisionScopes(divScopeMap);

      const depScopeMap = {};
      (depScopeRes.data || []).forEach((r) => {
        if (!depScopeMap[r.department_id]) depScopeMap[r.department_id] = [];
        depScopeMap[r.department_id].push(r.company_id);
      });
      setDepartmentScopes(depScopeMap);
    } catch (err) {
      showToast?.('Gagal memuat data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, isAllEntities, showToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const assignDirector = async (division, person) => {
    setSavingId(division.id);
    try {
      const { error } = await supabase.from('bnf_divisions').update({ director_profile_id: person?.id || null }).eq('id', division.id);
      if (error) throw error;
      showToast?.(person ? `Direktur ${division.name} diatur ke ${person.full_name}` : `Direktur ${division.name} dihapus`);
      fetchAll();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const assignHead = async (department, person) => {
    setSavingId(department.id);
    try {
      const { error } = await supabase.from('bnf_departments').update({ head_profile_id: person?.id || null }).eq('id', department.id);
      if (error) throw error;
      showToast?.(person ? `Kepala ${department.name} diatur ke ${person.full_name}` : `Kepala ${department.name} dihapus`);
      fetchAll();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const toggleDivisionScope = async (division, companyId) => {
    setSavingId(division.id);
    try {
      const inScope = (divisionScopes[division.id] || []).includes(companyId);
      const companyCode = companies.find((c) => c.id === companyId)?.code || companyId;
      if (inScope) {
        const { error } = await supabase.from('bnf_division_scopes').delete().eq('division_id', division.id).eq('company_id', companyId);
        if (error) throw error;
        showToast?.(`Scope ${division.name} dihapus dari ${companyCode}`);
      } else {
        const { error } = await supabase.from('bnf_division_scopes').insert({ division_id: division.id, company_id: companyId, created_by: profile.id });
        if (error) throw error;
        showToast?.(`Scope ${division.name} ditambahkan ke ${companyCode}`);
      }
      fetchAll();
    } catch (err) {
      showToast?.('Gagal menyimpan scope: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const toggleDepartmentScope = async (department, companyId) => {
    setSavingId(department.id);
    try {
      const inScope = (departmentScopes[department.id] || []).includes(companyId);
      const companyCode = companies.find((c) => c.id === companyId)?.code || companyId;
      if (inScope) {
        const { error } = await supabase.from('bnf_department_scopes').delete().eq('department_id', department.id).eq('company_id', companyId);
        if (error) throw error;
        showToast?.(`Scope ${department.name} dihapus dari ${companyCode}`);
      } else {
        const { error } = await supabase.from('bnf_department_scopes').insert({ department_id: department.id, company_id: companyId, created_by: profile.id });
        if (error) throw error;
        showToast?.(`Scope ${department.name} ditambahkan ke ${companyCode}`);
      }
      fetchAll();
    } catch (err) {
      showToast?.('Gagal menyimpan scope: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ backgroundColor: NAVY_DARK }} className="-mx-5 -mt-6 px-8 py-5 sm:-mx-7 lg:-mt-7 xl:-mx-9">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <UsersRound size={18} style={{ color: ORANGE }} strokeWidth={2.3} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">BNF — Kepala &amp; Direktur</div>
            <div className="text-[12px] text-slate-300">Atur penerima notifikasi laporan BNF</div>
          </div>
        </div>
      </div>

      <div className="space-y-6 py-6">
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
          <div className="border-b px-5 py-3" style={{ borderColor: LINE }}>
            <span className="text-[13px] font-semibold text-slate-700">Direktur Divisi</span>
            <span className="ml-2 text-[11px] text-slate-400">dipakai saat eskalasi</span>
          </div>
          <table className="w-full text-left text-[13px]">
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : divisions.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400">Belum ada divisi</td></tr>
              ) : divisions.map((d) => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td className="px-4 py-3 font-medium text-slate-700" style={{ width: '35%' }}>
                    <span style={{ color: NAVY, fontWeight: 700 }}>[{d.code}]</span> {d.name}
                    {isAllEntities && d.company?.code && (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: '#EAF0F8', color: NAVY }}>
                        {d.company.code}
                      </span>
                    )}
                    <ScopeChips
                      homeCompanyId={d.company_id}
                      scopeCompanyIds={divisionScopes[d.id] || []}
                      companies={companies}
                      isSuperAdmin={isSuperAdmin}
                      saving={savingId === d.id}
                      onToggle={(companyId) => toggleDivisionScope(d, companyId)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AssigneeCell
                      currentId={d.director_profile_id}
                      currentName={d.director?.full_name}
                      people={people}
                      saving={savingId === d.id}
                      onAssign={(p) => assignDirector(d, p)}
                      onClear={() => assignDirector(d, null)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: LINE }}>
          <div className="border-b px-5 py-3" style={{ borderColor: LINE }}>
            <span className="text-[13px] font-semibold text-slate-700">Kepala Departemen</span>
            <span className="ml-2 text-[11px] text-slate-400">notifikasi dasar tiap laporan baru</span>
          </div>
          <table className="w-full text-left text-[13px]">
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
              ) : departments.length === 0 ? (
                <tr><td className="px-4 py-8 text-center text-slate-400">Belum ada departemen</td></tr>
              ) : departments.map((dep) => {
                const divName = divisions.find((d) => d.id === dep.division_id)?.name;
                return (
                  <tr key={dep.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                    <td className="px-4 py-3 font-medium text-slate-700" style={{ width: '35%' }}>
                      <span style={{ color: NAVY, fontWeight: 700 }}>[{dep.code}]</span> {dep.name}
                      {isAllEntities && dep.company?.code && (
                        <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: '#EAF0F8', color: NAVY }}>
                          {dep.company.code}
                        </span>
                      )}
                      <div className="text-[11px] font-normal text-slate-400">{divName || '—'}</div>
                      <ScopeChips
                        homeCompanyId={dep.company_id}
                        scopeCompanyIds={departmentScopes[dep.id] || []}
                        companies={companies}
                        isSuperAdmin={isSuperAdmin}
                        saving={savingId === dep.id}
                        onToggle={(companyId) => toggleDepartmentScope(dep, companyId)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <AssigneeCell
                        currentId={dep.head_profile_id}
                        currentName={dep.head?.full_name}
                        people={people}
                        saving={savingId === dep.id}
                        onAssign={(p) => assignHead(dep, p)}
                        onClear={() => assignHead(dep, null)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
