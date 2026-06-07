// src/modules/admin/pages/RolesPage.jsx
// Two-column layout: left role list + right permission matrix panel.
// super_admin: real Supabase data, editable checkboxes (INSERT/DELETE role_permissions).
// Other roles: read-only static matrix.

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck, Lock, Loader2 } from 'lucide-react';
import { useRoles, ROLES_PAGE_SIZE } from '../../../hooks/useRoles';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../contexts/useAuth';
import { supabase } from '../../../lib/supabase';
import AdminPageHeader from '../components/AdminPageHeader';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

// ─── Role accent colors ────────────────────────────────────────────────────────
const ROLE_COLOR = {
  super_admin:        '#144682',
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

// ─── MSI Brand tokens ──────────────────────────────────────────────────────────
const C = {
  navy:       '#144682',
  navyDark:   '#0f3366',
  orange:     '#E85A1E',
  accentSoft: '#FEF2EC',
  pageBg:     '#F7F7F8',
  surface:    '#FFFFFF',
  surface2:   '#F7F7F8',
  ink:        '#1A1A1E',
  inkSoft:    '#4B5563',
  inkFaint:   '#9CA3AF',
  line:       '#E5E7EB',
  lineSoft:   '#F3F4F6',
  ok:         '#16A34A', okBg: '#DCFCE7',
  danger:     '#DC2626', dangerBg: '#FEE2E2',
  purple:     '#7C3AED', purpleBg: '#EDE9FE',
};

// ─── Small helpers ─────────────────────────────────────────────────────────────
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
  if (!company) return <span style={{ color: C.inkFaint, fontSize: 11 }}>—</span>;
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

function SystemBadge({ isSystem }) {
  return isSystem ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
      background: C.accentSoft, color: C.orange,
    }}>
      <Lock size={9}/> System
    </span>
  ) : (
    <span style={{ fontSize: 10, color: C.inkFaint }}>Custom</span>
  );
}

function ActiveDot({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600,
      color: active ? C.ok : C.inkFaint,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? C.ok : C.inkFaint }}/>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Hook: fetch all permissions + this role's granted set ────────────────────
function useRolePermissions(roleId) {
  const [allPerms, setAllPerms]     = useState([]);   // { id, module, action }[]
  const [granted, setGranted]       = useState(new Set()); // Set<permission_id>
  const [rpRows, setRpRows]         = useState([]);   // { id, permission_id }[] for delete
  const [loading, setLoading]       = useState(false);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    const [{ data: perms }, { data: rp }] = await Promise.all([
      supabase.from('permissions').select('id, module, action').order('module').order('action'),
      supabase.from('role_permissions').select('id, permission_id').eq('role_id', id),
    ]);
    setAllPerms(perms || []);
    setRpRows(rp || []);
    setGranted(new Set((rp || []).map(r => r.permission_id)));
    setLoading(false);
  }, []);

  useEffect(() => { load(roleId); }, [roleId, load]);

  return { allPerms, granted, setGranted, rpRows, setRpRows, loading, reload: () => load(roleId) };
}

// ─── Right panel: permission matrix ───────────────────────────────────────────
function PermissionPanel({ role, viewerRole }) {
  const isEditable = viewerRole === 'super_admin';
  const { allPerms, granted, setGranted, rpRows, setRpRows, loading } = useRolePermissions(
    isEditable ? role?.id : null
  );
  const [savingId, setSavingId] = useState(null); // permission_id currently saving

  if (!role) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: 14, padding: '40px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, minHeight: 320,
        boxShadow: '0 1px 4px rgba(0,0,0,.05)',
      }}>
        <ShieldCheck size={36} strokeWidth={1.4} style={{ color: C.line }}/>
        <p style={{ fontSize: 13, color: C.inkFaint, margin: 0, textAlign: 'center' }}>
          Pilih role di kiri untuk melihat<br/>permission matrix
        </p>
      </div>
    );
  }

  // Group permissions by module
  const byModule = allPerms.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});
  const modules = Object.keys(byModule).sort();

  // Collect all unique actions across all modules for column headers
  const allActions = [...new Set(allPerms.map(p => p.action))].sort();

  const handleToggle = async (perm) => {
    if (!isEditable) return;
    setSavingId(perm.id);
    if (granted.has(perm.id)) {
      // DELETE
      const rpRow = rpRows.find(r => r.permission_id === perm.id);
      if (rpRow) {
        await supabase.from('role_permissions').delete().eq('id', rpRow.id);
        setGranted(prev => { const s = new Set(prev); s.delete(perm.id); return s; });
        setRpRows(prev => prev.filter(r => r.id !== rpRow.id));
      }
    } else {
      // INSERT
      const { data: inserted } = await supabase
        .from('role_permissions')
        .insert({ role_id: role.id, permission_id: perm.id })
        .select('id, permission_id')
        .single();
      if (inserted) {
        setGranted(prev => new Set([...prev, perm.id]));
        setRpRows(prev => [...prev, inserted]);
      }
    }
    setSavingId(null);
  };

  const accentColor = roleColor(role.code);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,.05)',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${C.line}`,
        background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={18} style={{ color: 'rgba(255,255,255,.8)', flexShrink: 0 }}/>
            <span style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-.2px',
            }}>
              {role.name}
            </span>
          </div>
          {loading && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,.75)' }}>
              <Loader2 size={12} className="animate-spin"/> Loading…
            </span>
          )}
          {savingId && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,.85)', fontWeight: 600 }}>
              <Loader2 size={12} className="animate-spin"/> Saving…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RoleBadge code={role.code}/>
          {isEditable && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
              background: 'rgba(255,255,255,.22)', color: 'rgba(255,255,255,.9)',
            }}>
              Editable
            </span>
          )}
          {!isEditable && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
              background: 'rgba(255,255,255,.18)', color: 'rgba(255,255,255,.85)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <Lock size={9}/> Read only
            </span>
          )}
        </div>
      </div>

      {/* Permission table — only shown when editable (real data) */}
      {isEditable ? (
        loading && allPerms.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.inkFaint, fontSize: 13 }}>
            Loading permissions…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `160px repeat(${allActions.length}, 1fr)`,
              padding: '8px 16px',
              background: C.surface2,
              borderBottom: `1px solid ${C.line}`,
              minWidth: 400,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkFaint }}>
                Module / Action
              </span>
              {allActions.map(act => (
                <span key={act} style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
                  color: C.inkFaint, textAlign: 'center',
                }}>
                  {act}
                </span>
              ))}
            </div>

            {/* One row per module */}
            {modules.map(mod => {
              const modPerms = byModule[mod];
              const hasAny = modPerms.some(p => granted.has(p.id));
              return (
                <div key={mod} style={{
                  display: 'grid',
                  gridTemplateColumns: `160px repeat(${allActions.length}, 1fr)`,
                  alignItems: 'center',
                  padding: '9px 16px',
                  borderBottom: `1px solid ${C.lineSoft}`,
                  minWidth: 400,
                }}>
                  <span style={{ fontSize: 12, fontWeight: hasAny ? 600 : 400, color: hasAny ? C.ink : C.inkFaint }}>
                    {mod}
                  </span>
                  {allActions.map(act => {
                    const perm = modPerms.find(p => p.action === act);
                    if (!perm) {
                      return <div key={act} style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: C.inkFaint }}>—</span>
                      </div>;
                    }
                    const isChecked = granted.has(perm.id);
                    const isSaving  = savingId === perm.id;
                    return (
                      <div key={act} style={{ display: 'flex', justifyContent: 'center' }}>
                        {isSaving ? (
                          <Loader2 size={13} style={{ color: accentColor, animation: 'spin 1s linear infinite' }}/>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(perm)}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{ padding: '10px 16px', background: C.surface2, borderTop: `1px solid ${C.line}`, fontSize: 11, color: C.inkFaint }}>
              {granted.size} permission{granted.size !== 1 ? 's' : ''} granted · Click checkbox to toggle
            </div>
          </div>
        )
      ) : (
        <div style={{ padding: '24px 20px', color: C.inkFaint, fontSize: 13, textAlign: 'center' }}>
          <Lock size={20} style={{ display: 'block', margin: '0 auto 10px', color: C.line }}/>
          Permission matrix is view-only for non-super-admin users.
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RolesPage() {
  // ── Existing state — unchanged ─────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  // ── Existing hook — unchanged ──────────────────────────────────────────────
  const { data, total, loading, error, refresh } = useRoles({ page, search });

  // ── Pagination — unchanged ─────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / ROLES_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * ROLES_PAGE_SIZE + 1;
  const to   = Math.min(page * ROLES_PAGE_SIZE, total);

  const handleSearch = (val) => { setSearchInput(val); setPage(1); };

  // ── Viewer identity ───────────────────────────────────────────────────────
  const { profile, erpRole } = useAuth();

  // ── UI-only: selected role for permission panel ────────────────────────────
  const [selectedRole, setSelectedRole] = useState(null);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <AdminPageHeader
        title="Roles"
        subtitle="Named permission sets, company-scoped. System roles are read-only."
        count={loading ? undefined : total}
      />

      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }}>

        {/* ── LEFT: role list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Search + refresh */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              background: C.surface, border: `1.5px solid ${C.line}`,
              borderRadius: 9, padding: '0 12px', height: 38,
            }}>
              <Search size={13} style={{ color: C.inkFaint, flexShrink: 0 }}/>
              <input
                type="text"
                placeholder="Cari nama atau kode…"
                value={searchInput}
                onChange={e => handleSearch(e.target.value)}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: 13, color: C.ink, fontFamily: 'inherit',
                }}
              />
            </div>
            <button
              onClick={refresh}
              title="Refresh"
              style={{
                width: 38, height: 38, borderRadius: 9,
                border: `1.5px solid ${C.line}`, background: C.surface,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: C.inkSoft,
              }}
            >
              <RefreshCw size={14}/>
            </button>
          </div>

          {/* Role cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error ? (
              <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <ErrorState message={error.message} onRetry={refresh}/>
              </div>
            ) : loading ? (
              <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <LoadingState rows={6}/>
              </div>
            ) : data.length === 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <EmptyState message={search ? 'Tidak ada role yang cocok.' : 'Belum ada role.'}/>
              </div>
            ) : (
              data.map((row) => {
                const isSelected = selectedRole?.id === row.id;
                return (
                  <button
                    key={row.id}
                    onClick={() => setSelectedRole(isSelected ? null : row)}
                    style={{
                      width: '100%', display: 'flex', flexDirection: 'column', gap: 0,
                      padding: 0, textAlign: 'left',
                      border: `1px solid ${isSelected ? roleColor(row.code) : C.line}`,
                      borderLeft: `3px solid ${isSelected ? roleColor(row.code) : 'transparent'}`,
                      borderRadius: 12, overflow: 'hidden',
                      background: C.surface,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      cursor: 'pointer', transition: 'border-color .15s',
                      fontFamily: 'inherit',
                    }}
                  >
                    {/* Header strip */}
                    <div style={{
                      width: '100%', height: 56,
                      background: roleColor(row.code),
                      display: 'flex', alignItems: 'center',
                      padding: '12px 16px',
                    }}>
                      <span style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: 15, fontWeight: 700, color: '#fff',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {row.name}
                      </span>
                    </div>
                    {/* Card body */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                      padding: '12px 16px',
                      background: isSelected ? roleColor(row.code) + '0D' : C.surface,
                      transition: 'background .1s',
                    }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surface2; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = C.surface; }}
                    >
                      {/* Row 1: code + company */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <RoleBadge code={row.code}/>
                        <CompanyBadge company={row.companies}/>
                      </div>
                      {/* Row 2: system + active */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SystemBadge isSystem={row.is_system_role}/>
                        <ActiveDot active={row.is_active}/>
                      </div>
                    </div>{/* end card body */}
                  </button>
                );
              })
            )}

            {/* Pagination */}
            {!error && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', border: `1px solid ${C.line}`, borderRadius: 12,
                background: C.surface2, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}>
                <span style={{ fontSize: 11, color: C.inkFaint }}>
                  {total === 0 ? 'Tidak ada data' : `${from}–${to} dari ${total}`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.line}`,
                      background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .4 : 1,
                    }}
                  >
                    <ChevronLeft size={13} style={{ color: C.inkSoft }}/>
                  </button>
                  <span style={{ fontSize: 11, color: C.inkSoft, padding: '0 6px' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.line}`,
                      background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .4 : 1,
                    }}
                  >
                    <ChevronRight size={13} style={{ color: C.inkSoft }}/>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: permission matrix panel ── */}
        <div style={{ position: 'sticky', top: 18 }}>
          <PermissionPanel role={selectedRole} viewerRole={erpRole ?? profile?.role}/>
        </div>
      </div>
    </div>
  );
}
