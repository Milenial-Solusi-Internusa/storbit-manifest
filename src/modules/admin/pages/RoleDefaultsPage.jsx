// src/modules/admin/pages/RoleDefaultsPage.jsx
// "Role Defaults" — role-level default menu/module permissions
// (role_menu_permissions). Mirror of UserEditPage.jsx's Permissions tab, but
// targets a role_id instead of a user_id: assigning a role to a user then
// auto-grants these defaults via AuthContext's hasMenuPermission 3-tier
// resolution (step 3 — role-level union, only reached when no per-user
// user_menu_permissions row overrides it).
//
// super_admin-only: gated both at AdminShell sidebar level AND at the render
// branch (not via PAGE_MAP, which has no re-check) — RLS on
// role_menu_permissions only allows writes from is_super_admin(), so a looser
// FE gate would be a trap-UX (button visible, save fails silently) — the
// exact pattern the earlier RBAC audit flagged and asked not to repeat.
//
// PermissionMatrix (userAccessShared.jsx) is reused as-is — it was already
// fully generic (no user/role-specific logic inside it). The fetch/save logic
// below is a fresh, purpose-built mirror of UserEditPage's fetchMatrixData/
// handleSavePermissions — not extracted into a shared hook, since the two
// target tables differ enough (company_id present/absent, user_id vs
// role_id) that a generic parameterized hook would add abstraction for
// exactly 2 call sites. UserEditPage.jsx itself is untouched by this file.

import { useState, useCallback, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ShieldCheck, Copy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useRoles, ROLES_PAGE_SIZE } from '../../../hooks/useRoles';
import { useDebounce } from '../../../hooks/useDebounce';
import ConfirmModal from '../../../components/ConfirmModal';
import AdminPageHeader from '../components/AdminPageHeader';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { PASTEL, NAVY, ACTION_ORDER } from './userAccessTokens';
import { PermissionMatrix } from './userAccessShared';

// ─── Role accent colors — small, local duplicate of RolesPage.jsx's map.
// Not imported from there: RolesPage doesn't export it, and RolesPage.jsx is
// intentionally left untouched (retired page, kept only as legacy reference).
const ROLE_COLOR = {
  super_admin:        '#1B4D8A',
  ceo:                '#7C3AED',
  gm:                 '#0891B2',
  admin:              '#DC2626',
  manager:            '#D97706',
  finance_controller: '#059669',
  finance:            '#10B981',
  operations:         '#EA580C',
  sales:              '#E85A1E',
  procurement:        '#7C3AED',
  hrga:               '#DB2777',
  it:                 '#2563EB',
  viewer:             '#6B7280',
};
function roleColor(code) { return ROLE_COLOR[code] || '#6B7280'; }

function RoleBadge({ code }) {
  const color = roleColor(code);
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
      background: color + '18', color, letterSpacing: '.3px',
    }}>
      {code}
    </span>
  );
}

function CompanyBadge({ company }) {
  if (!company) return <span style={{ color: PASTEL.inkMute, fontSize: 11 }}>—</span>;
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
      background: '#DBEAFE', color: '#1D4ED8',
    }}>
      {company.code}
    </span>
  );
}

export default function RoleDefaultsPage({ showToast }) {
  // ── Left panel: role list (paginated + searchable) — reuses useRoles as-is.
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const { data, total, loading, error, refresh } = useRoles({ page, search });
  const totalPages = Math.max(1, Math.ceil(total / ROLES_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * ROLES_PAGE_SIZE + 1;
  const to   = Math.min(page * ROLES_PAGE_SIZE, total);
  const handleSearch = (val) => { setSearchInput(val); setPage(1); };

  const [selectedRole, setSelectedRole] = useState(null);

  // Full, unpaginated role list — only for the "copy from another role"
  // source dropdown, which needs every role regardless of the current page.
  const [allRoles, setAllRoles] = useState([]);
  useEffect(() => {
    supabase
      .from('roles')
      .select('id, code, name, company_id, companies(code)')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name')
      .then(({ data: rows }) => setAllRoles(rows || []));
  }, []);

  // ── Right panel: permission matrix for the selected role ──────────────────
  const [matrixModules, setMatrixModules] = useState([]);
  const [matrixActions, setMatrixActions] = useState([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [permDraft, setPermDraft] = useState({});
  const [originalPerms, setOriginalPerms] = useState([]);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState(null);

  const fetchMatrixData = useCallback(async (roleId) => {
    setMatrixLoading(true);
    const [modsRes, menusRes, existingRes] = await Promise.all([
      supabase.from('modules')
        .select('id, key, label, sort_order, module_actions(id, action)')
        .eq('is_active', true).order('sort_order').limit(100),
      supabase.from('module_menus')
        .select('id, key, label, sort_order, module_id, menu_actions(id, action)')
        .eq('is_active', true).order('sort_order').limit(1000),
      supabase.from('role_menu_permissions')
        .select('id, module_action_id, menu_action_id')
        .eq('role_id', roleId).limit(1000),
    ]);

    const mods     = modsRes.data  || [];
    const menus    = menusRes.data || [];
    const existing = existingRes.data || [];

    const actionSet = new Set();
    mods.forEach(m  => (m.module_actions || []).forEach(a => actionSet.add(a.action)));
    menus.forEach(m => (m.menu_actions   || []).forEach(a => actionSet.add(a.action)));
    const sorted = ACTION_ORDER.filter(a => actionSet.has(a))
      .concat([...actionSet].filter(a => !ACTION_ORDER.includes(a)).sort());
    setMatrixActions(sorted);

    const menusByMod = {};
    menus.forEach(m => {
      if (!menusByMod[m.module_id]) menusByMod[m.module_id] = [];
      menusByMod[m.module_id].push(m);
    });
    setMatrixModules(mods.map(mod => ({ ...mod, menus: menusByMod[mod.id] || [] })));

    setOriginalPerms(existing);

    const pdraft = {};
    existing.forEach(p => {
      if (p.module_action_id) pdraft[`ma_${p.module_action_id}`]  = true;
      if (p.menu_action_id)   pdraft[`mea_${p.menu_action_id}`]   = true;
    });
    setPermDraft(pdraft);
    setMatrixLoading(false);
  }, []);

  useEffect(() => {
    if (selectedRole?.id) fetchMatrixData(selectedRole.id);
  }, [selectedRole?.id, fetchMatrixData]);

  const handlePermToggle = useCallback((updates) => {
    setPermDraft(prev => ({ ...prev, ...updates }));
  }, []);

  // Cancel = discard unsaved draft changes, revert to last-saved state for the
  // CURRENTLY selected role. (Unlike UserEditPage's onCancel, there's no
  // sub-page to navigate back to here — switching roles happens via the left
  // list, on the same page — so "Cancel" reverts the draft instead.)
  const handleCancelEdit = useCallback(() => {
    const pdraft = {};
    originalPerms.forEach(p => {
      if (p.module_action_id) pdraft[`ma_${p.module_action_id}`] = true;
      if (p.menu_action_id)   pdraft[`mea_${p.menu_action_id}`]  = true;
    });
    setPermDraft(pdraft);
    setPermError(null);
  }, [originalPerms]);

  const handleSavePermissions = useCallback(async () => {
    if (!selectedRole) return;
    setPermSaving(true);
    setPermError(null);

    const originalKeys = new Set();
    const keyToRowId = {};
    originalPerms.forEach(p => {
      if (p.module_action_id) {
        const k = `ma_${p.module_action_id}`;
        originalKeys.add(k);
        keyToRowId[k] = p.id;
      }
      if (p.menu_action_id) {
        const k = `mea_${p.menu_action_id}`;
        originalKeys.add(k);
        keyToRowId[k] = p.id;
      }
    });

    const newKeys = new Set(Object.entries(permDraft).filter(([, v]) => v).map(([k]) => k));
    const addedKeys   = [...newKeys].filter(k => !originalKeys.has(k));
    const removedKeys = [...originalKeys].filter(k => !newKeys.has(k));

    if (removedKeys.length) {
      const ids = removedKeys.map(k => keyToRowId[k]).filter(Boolean);
      if (ids.length) {
        const { data: delData, error: delErr } = await supabase
          .from('role_menu_permissions').delete().in('id', ids).select('id');
        if (delErr) { setPermError(`Delete failed: ${delErr.message}`); setPermSaving(false); return; }
        if (!delData || delData.length !== ids.length) {
          setPermError(`Perubahan tidak tersimpan penuh — ${delData?.length ?? 0} dari ${ids.length} baris berhasil dihapus. Kemungkinan izin database menahan sebagian operasi ini, bukan bug tampilan. Hubungi admin DB.`);
          setPermSaving(false);
          return;
        }
      }
    }

    if (addedKeys.length) {
      const rows = addedKeys.map(k => {
        const r = { role_id: selectedRole.id };
        if (k.startsWith('ma_'))  r.module_action_id = k.slice(3);
        else                      r.menu_action_id   = k.slice(4);
        return r;
      });
      const { data: insData, error: insErr } = await supabase
        .from('role_menu_permissions').insert(rows).select('id');
      if (insErr) { setPermError(`Insert failed: ${insErr.message}`); setPermSaving(false); return; }
      if (!insData || insData.length !== rows.length) {
        setPermError(`Perubahan tidak tersimpan penuh — ${insData?.length ?? 0} dari ${rows.length} baris berhasil ditambah. Kemungkinan izin database menahan sebagian operasi ini, bukan bug tampilan. Hubungi admin DB.`);
        setPermSaving(false);
        return;
      }
    }

    await fetchMatrixData(selectedRole.id);
    setPermSaving(false);
    showToast?.('Role defaults updated.');
  }, [selectedRole, originalPerms, permDraft, showToast, fetchMatrixData]);

  // ── Copy from another role — destructive replace ───────────────────────────
  const [copySourceId, setCopySourceId] = useState('');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const sourceRole = allRoles.find(r => r.id === copySourceId) || null;

  const handleCopyConfirm = useCallback(async () => {
    if (!selectedRole || !copySourceId) return;
    setCopying(true);
    setPermError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const grantedBy = session?.user?.id || null;

      const { data: sourceRows, error: srcErr } = await supabase
        .from('role_menu_permissions')
        .select('menu_action_id, module_action_id')
        .eq('role_id', copySourceId);
      if (srcErr) { setPermError(`Gagal membaca role sumber: ${srcErr.message}`); setCopying(false); return; }

      const expectedDeleteCount = originalPerms.length;
      const { data: delData, error: delErr } = await supabase
        .from('role_menu_permissions')
        .delete()
        .eq('role_id', selectedRole.id)
        .select('id');
      if (delErr) { setPermError(`Gagal menghapus izin lama: ${delErr.message}`); setCopying(false); return; }
      if ((delData?.length ?? 0) !== expectedDeleteCount) {
        setPermError(`Salin dibatalkan — ${delData?.length ?? 0} dari ${expectedDeleteCount} baris lama berhasil dihapus. Kemungkinan izin database menahan sebagian operasi ini, bukan bug tampilan. Hubungi admin DB.`);
        setCopying(false);
        return;
      }

      if (sourceRows?.length) {
        const rows = sourceRows.map(r => ({
          role_id: selectedRole.id,
          menu_action_id: r.menu_action_id,
          module_action_id: r.module_action_id,
          granted_by: grantedBy,
        }));
        const { data: insData, error: insErr } = await supabase
          .from('role_menu_permissions').insert(rows).select('id');
        if (insErr) { setPermError(`Gagal menyalin: ${insErr.message}`); setCopying(false); return; }
        if (!insData || insData.length !== rows.length) {
          setPermError(`Salin sebagian gagal — ${insData?.length ?? 0} dari ${rows.length} baris berhasil disalin. Kemungkinan izin database menahan sebagian operasi ini, bukan bug tampilan. Hubungi admin DB.`);
          setCopying(false);
          return;
        }
      }

      setCopyModalOpen(false);
      setCopySourceId('');
      await fetchMatrixData(selectedRole.id);
      setCopying(false);
      showToast?.('Role defaults disalin.');
    } catch (e) {
      setPermError(e?.message || 'Gagal menyalin role defaults.');
      setCopying(false);
    }
  }, [selectedRole, copySourceId, originalPerms.length, showToast, fetchMatrixData]);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <AdminPageHeader
        title="Role Defaults"
        subtitle="Izin menu default per role. User baru otomatis dapat izin ini saat role di-assign, tanpa perlu dicentang manual satu-satu."
        count={loading ? undefined : total}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>

        {/* ── LEFT: role list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              background: 'white', border: `1.5px solid ${PASTEL.line}`,
              borderRadius: 9, padding: '0 12px', height: 38,
            }}>
              <Search size={13} style={{ color: PASTEL.inkMute, flexShrink: 0 }}/>
              <input
                type="text"
                placeholder="Cari nama atau kode…"
                value={searchInput}
                onChange={e => handleSearch(e.target.value)}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: 13, color: PASTEL.ink, fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error ? (
              <div style={{ background: 'white', border: `1px solid ${PASTEL.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <ErrorState message={error.message} onRetry={refresh}/>
              </div>
            ) : loading ? (
              <div style={{ background: 'white', border: `1px solid ${PASTEL.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <LoadingState rows={6}/>
              </div>
            ) : data.length === 0 ? (
              <div style={{ background: 'white', border: `1px solid ${PASTEL.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <EmptyState message={search ? 'Tidak ada role yang cocok.' : 'Belum ada role.'}/>
              </div>
            ) : (
              data.map((row) => {
                const isSelected = selectedRole?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedRole(isSelected ? null : row)}
                    style={{
                      width: '100%', display: 'flex', flexDirection: 'column', gap: 0,
                      padding: 0, textAlign: 'left',
                      border: `1px solid ${isSelected ? roleColor(row.code) : PASTEL.line}`,
                      borderLeft: `3px solid ${isSelected ? roleColor(row.code) : 'transparent'}`,
                      borderRadius: 12, overflow: 'hidden',
                      background: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      cursor: 'pointer', transition: 'border-color .15s',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{
                      width: '100%', height: 48,
                      background: roleColor(row.code),
                      display: 'flex', alignItems: 'center',
                      padding: '10px 16px',
                    }}>
                      <span style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: 14, fontWeight: 700, color: '#fff',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {row.name}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                      padding: '10px 16px',
                      background: isSelected ? roleColor(row.code) + '0D' : 'white',
                    }}>
                      <RoleBadge code={row.code}/>
                      <CompanyBadge company={row.companies}/>
                    </div>
                  </button>
                );
              })
            )}

            {!error && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', border: `1px solid ${PASTEL.line}`, borderRadius: 12,
                background: PASTEL.lineSoft, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}>
                <span style={{ fontSize: 11, color: PASTEL.inkMute }}>
                  {total === 0 ? 'Tidak ada data' : `${from}–${to} dari ${total}`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: `1px solid ${PASTEL.line}`,
                      background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .4 : 1,
                    }}
                  >
                    <ChevronLeft size={13} style={{ color: PASTEL.inkSoft }}/>
                  </button>
                  <span style={{ fontSize: 11, color: PASTEL.inkSoft, padding: '0 6px' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: `1px solid ${PASTEL.line}`,
                      background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .4 : 1,
                    }}
                  >
                    <ChevronRight size={13} style={{ color: PASTEL.inkSoft }}/>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: permission matrix panel ── */}
        <div style={{ position: 'sticky', top: 18 }}>
          {!selectedRole ? (
            <div style={{
              background: 'white', border: `1px solid ${PASTEL.line}`,
              borderRadius: 14, padding: '40px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 12, minHeight: 320,
            }}>
              <ShieldCheck size={36} strokeWidth={1.4} style={{ color: PASTEL.line }}/>
              <p style={{ fontSize: 13, color: PASTEL.inkMute, margin: 0, textAlign: 'center' }}>
                Pilih role di kiri untuk atur<br/>izin menu default
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border p-6" style={{ background: 'white', borderColor: PASTEL.line }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: PASTEL.ink, fontFamily: "'Montserrat', sans-serif" }}>
                    {selectedRole.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <RoleBadge code={selectedRole.code} />
                    <CompanyBadge company={selectedRole.companies} />
                  </div>
                </div>
              </div>

              {/* Copy from another role */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
                padding: '10px 14px', background: PASTEL.lineSoft, borderRadius: 10,
                flexWrap: 'wrap',
              }}>
                <Copy size={14} style={{ color: PASTEL.inkMute, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: PASTEL.inkSoft, flexShrink: 0 }}>Salin dari role lain:</span>
                <select
                  value={copySourceId}
                  onChange={e => setCopySourceId(e.target.value)}
                  style={{
                    flex: 1, minWidth: 180, fontSize: 12, padding: '6px 10px',
                    borderRadius: 8, border: `1px solid ${PASTEL.line}`, background: 'white',
                    color: PASTEL.ink, cursor: 'pointer',
                  }}
                >
                  <option value="">— Pilih role sumber —</option>
                  {allRoles.filter(r => r.id !== selectedRole.id).map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.companies?.code})</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!copySourceId}
                  onClick={() => setCopyModalOpen(true)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
                    border: 'none', background: copySourceId ? NAVY : PASTEL.line,
                    color: copySourceId ? 'white' : PASTEL.inkMute,
                    cursor: copySourceId ? 'pointer' : 'not-allowed', flexShrink: 0,
                  }}
                >
                  Salin
                </button>
              </div>

              <PermissionMatrix
                matrixModules={matrixModules}
                matrixActions={matrixActions}
                permDraft={permDraft}
                onToggle={handlePermToggle}
                loading={matrixLoading}
                saving={permSaving}
                onSave={handleSavePermissions}
                onCancel={handleCancelEdit}
                permError={permError}
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={copyModalOpen}
        title="Salin Role Defaults"
        message={
          selectedRole && sourceRole
            ? `Ini akan MENGHAPUS seluruh izin menu yang sekarang dimiliki "${selectedRole.name}" (${selectedRole.companies?.code || '—'}), lalu menggantikannya dengan salinan persis dari "${sourceRole.name}" (${sourceRole.companies?.code || '—'}). Ini BUKAN gabungan — izin lama yang tak ada di role sumber akan hilang. Tindakan ini tidak bisa dibatalkan.`
            : ''
        }
        confirmLabel={copying ? 'Menyalin…' : 'Ya, Timpa & Salin'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleCopyConfirm}
        onCancel={() => { if (!copying) setCopyModalOpen(false); }}
      />
    </div>
  );
}
