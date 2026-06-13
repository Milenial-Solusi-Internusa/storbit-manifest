// src/modules/admin/pages/userAccessShared.jsx
// Shared display components, form primitives, and the PermissionMatrix used by
// both UserAccessPage (list + Add modal) and UserEditPage (full-page edit).
// Design tokens / role maps / helpers live in ./userAccessTokens (plain .js)
// so this file exports ONLY components (Fast Refresh requirement).

import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw as Spinner } from 'lucide-react';
import { PASTEL, NAVY, ORANGE, LEGACY_ROLES, LEGACY_ROLE_COLOR } from './userAccessTokens';

// ─────────────────────────────────────────────────────────────
// Small display components
// ─────────────────────────────────────────────────────────────

export function Avatar({ name, size = 32 }) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 font-bold select-none"
      style={{ width: size, height: size, fontSize: size * 0.36, background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
    >
      {initials}
    </span>
  );
}

export function RoleBadge({ erpRole, legacyRole }) {
  if (erpRole?.roles) {
    return (
      <div>
        <div className="text-xs font-medium truncate" style={{ color: PASTEL.ink }}>
          {erpRole.roles.name}
        </div>
        <div className="text-[10px]" style={{ color: PASTEL.inkMute }}>
          {erpRole.roles.code}
        </div>
      </div>
    );
  }
  const color = LEGACY_ROLE_COLOR[legacyRole] || PASTEL.inkMute;
  const baseLabel = LEGACY_ROLES.find((r) => r.value === legacyRole)?.label || legacyRole;
  const label = legacyRole ? `${baseLabel} (legacy)` : '—';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ active }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={
        active
          ? { background: PASTEL.mint, color: '#1A5C35' }
          : { background: PASTEL.lineSoft, color: PASTEL.inkMute }
      }
    >
      <span className="w-1 h-1 rounded-full" style={{ background: active ? PASTEL.mintDeep : PASTEL.inkMute }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Form primitives
// ─────────────────────────────────────────────────────────────

export function FieldLabel({ children, required }) {
  return (
    <div className="text-[11px] font-semibold mb-1.5 uppercase tracking-[0.14em]" style={{ color: PASTEL.inkMute }}>
      {children}
      {required && <span style={{ color: PASTEL.roseDeep }}> *</span>}
    </div>
  );
}

export function FieldInput({ type = 'text', value, onChange, disabled, placeholder, maxLength }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 placeholder:text-[#B8AEA6]"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    />
  );
}

export function FieldSelect({ value, onChange, disabled, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 cursor-pointer"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    >
      {children}
    </select>
  );
}

export function FieldToggle({ label, helpText, checked, onChange, disabled }) {
  return (
    <div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className="flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span
          className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
          style={{ background: checked ? PASTEL.mintDeep : PASTEL.line }}
        >
          <span
            className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </span>
        <span className="text-sm font-medium" style={{ color: checked ? '#1A5C35' : PASTEL.inkSoft }}>
          {label ?? (checked ? 'Enabled' : 'Disabled')}
        </span>
      </button>
      {helpText && (
        <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>{helpText}</p>
      )}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-4" style={{ color: PASTEL.lavenderDeep }}>
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="my-6" style={{ borderTop: `1px solid ${PASTEL.line}` }} />;
}

export function SaveError({ message }) {
  if (!message) return null;
  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{ background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}` }}
    >
      <div className="text-xs font-semibold mb-0.5" style={{ color: PASTEL.ink }}>Save failed</div>
      <div className="text-xs" style={{ color: PASTEL.inkSoft }}>{message}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Permission Matrix — module/menu × action checkbox grid
// ─────────────────────────────────────────────────────────────

export function PermissionMatrix({ matrixModules, matrixActions, permDraft, onToggle, loading, saving, onSave, onCancel, permError }) {
  const [collapsed, setCollapsed] = useState({});

  const totalGranted = Object.values(permDraft).filter(Boolean).length;

  const toggleCollapse = (modId) =>
    setCollapsed(prev => ({ ...prev, [modId]: !prev[modId] }));

  const modAllKeys = (mod) => {
    const keys = [];
    (mod.module_actions || []).forEach(a => keys.push(`ma_${a.id}`));
    (mod.menus || []).forEach(m => (m.menu_actions || []).forEach(a => keys.push(`mea_${a.id}`)));
    return keys;
  };

  const isFullySelected = (mod) => {
    const keys = modAllKeys(mod);
    return keys.length > 0 && keys.every(k => permDraft[k]);
  };

  const handleSelectAll = (mod, select) => {
    const updates = {};
    modAllKeys(mod).forEach(k => { updates[k] = select; });
    onToggle(updates);
  };

  const colW = 52; // px per action column

  const headerStyle = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: PASTEL.inkMute,
    width: colW, textAlign: 'center',
  };

  if (loading) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: PASTEL.inkMute, fontSize: 13 }}>
        Memuat permission matrix…
      </div>
    );
  }

  if (matrixModules.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: PASTEL.inkMute, fontSize: 13 }}>
        Belum ada modules. Tambahkan data ke tabel <code>modules</code> terlebih dahulu.
      </div>
    );
  }

  return (
    <div>
      {/* Column header row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '6px 16px 6px 48px',
        background: PASTEL.lineSoft,
        borderRadius: '10px 10px 0 0',
        border: `1px solid ${PASTEL.line}`,
        borderBottom: 'none',
      }}>
        <span style={{ flex: 1, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: PASTEL.inkMute }}>
          Module / Menu
        </span>
        <div style={{ display: 'flex', gap: 0 }}>
          {matrixActions.map(act => (
            <span key={act} style={headerStyle}>{act}</span>
          ))}
        </div>
        <span style={{ width: 84 }} />
      </div>

      {/* Module + menu rows */}
      <div style={{ border: `1px solid ${PASTEL.line}`, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        {matrixModules.map((mod, idx) => {
          const isCollapsed = collapsed[mod.id];
          const allSelected = isFullySelected(mod);
          const hasMenus = (mod.menus || []).length > 0;

          return (
            <div key={mod.id} style={{ borderBottom: idx < matrixModules.length - 1 ? `1px solid ${PASTEL.line}` : 'none' }}>
              {/* Module row */}
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '9px 16px',
                background: '#F0F4FA',
                borderLeft: `3px solid ${NAVY}`,
              }}>
                {/* Chevron */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(mod.id)}
                  style={{ background: 'none', border: 'none', cursor: hasMenus ? 'pointer' : 'default', padding: '0 6px 0 0', color: PASTEL.inkSoft, display: 'flex', flexShrink: 0, opacity: hasMenus ? 1 : 0 }}
                  tabIndex={hasMenus ? 0 : -1}
                >
                  {isCollapsed ? <ChevronDown size={13}/> : <ChevronUp size={13}/>}
                </button>

                {/* Module label */}
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: NAVY }}>
                  {mod.label || mod.key}
                </span>

                {/* Module-level action checkboxes */}
                <div style={{ display: 'flex', gap: 0 }}>
                  {matrixActions.map(act => {
                    const ma = (mod.module_actions || []).find(a => a.action === act);
                    return (
                      <div key={act} style={{ width: colW, display: 'flex', justifyContent: 'center' }}>
                        {ma ? (
                          <input
                            type="checkbox"
                            checked={!!permDraft[`ma_${ma.id}`]}
                            onChange={e => onToggle({ [`ma_${ma.id}`]: e.target.checked })}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: ORANGE }}
                          />
                        ) : (
                          <span style={{ fontSize: 10, color: PASTEL.line }}>—</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Select / Deselect all */}
                <button
                  type="button"
                  onClick={() => handleSelectAll(mod, !allSelected)}
                  style={{
                    width: 84, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: allSelected ? `${NAVY}18` : `${ORANGE}14`,
                    color: allSelected ? NAVY : ORANGE,
                    border: 'none', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Menu rows */}
              {!isCollapsed && (mod.menus || []).map(menu => (
                <div
                  key={menu.id}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '7px 16px 7px 43px',
                    background: 'white',
                    borderTop: `1px solid ${PASTEL.lineSoft}`,
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F7F7F8'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                >
                  <span style={{ flex: 1, fontSize: 12.5, color: PASTEL.inkSoft }}>
                    {menu.label || menu.key}
                  </span>
                  <div style={{ display: 'flex', gap: 0 }}>
                    {matrixActions.map(act => {
                      const mea = (menu.menu_actions || []).find(a => a.action === act);
                      return (
                        <div key={act} style={{ width: colW, display: 'flex', justifyContent: 'center' }}>
                          {mea ? (
                            <input
                              type="checkbox"
                              checked={!!permDraft[`mea_${mea.id}`]}
                              onChange={e => onToggle({ [`mea_${mea.id}`]: e.target.checked })}
                              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: ORANGE }}
                            />
                          ) : (
                            <span style={{ fontSize: 10, color: PASTEL.line }}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span style={{ width: 84 }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {permError && (
        <div style={{ marginTop: 12, padding: '10px 16px', borderRadius: 10, background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}`, fontSize: 12, color: PASTEL.inkSoft }}>
          {permError}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 20, gap: 10 }}>
        <span style={{ flex: 1, fontSize: 12, color: PASTEL.inkMute }}>
          {totalGranted} permission{totalGranted !== 1 ? 's' : ''} granted
        </span>
        <button
          type="button" onClick={onCancel} disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: 12,
            border: `1px solid ${PASTEL.line}`, background: 'white',
            color: PASTEL.inkSoft, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button" onClick={onSave} disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: 12, border: 'none',
            background: NAVY, color: 'white', fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {saving ? <><Spinner size={13} className="animate-spin"/> Saving…</> : 'Save Permissions'}
        </button>
      </div>
    </div>
  );
}
