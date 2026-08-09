// src/components/CompanySwitcher.jsx
// Topbar company switcher — replaces the old decorative "MSI / JCI / Storbit"
// button (App.jsx, dead: no onClick, hardcoded label). Session-only (no
// localStorage) — resets automatically because AuthContext.jsx already calls
// setActiveCompanyId(null) on logout/user-change.
//
// Two modes:
//   - myCompanyIds.length <= 1 → static label, no interaction (nothing to switch).
//   - myCompanyIds.length > 1  → pill switcher, filtered to myCompanyIds ONLY
//     (NOT the same as EntitySwitcher in admin-settings/kit.jsx, which always
//     shows all 3 companies unfiltered — that's for super_admin browsing any
//     entity's settings, a different concept from "which company am I acting
//     as", left untouched).
//
// Local PASTEL subset (not imported — App.jsx's PASTEL isn't exported; same
// "own local palette" pattern already used by PositionsPage.jsx/AssetDashboardPage.jsx).

import { Building2 } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import { useCompanies } from '../hooks/useCompanies';

const PASTEL = {
  ink: '#212A37',
  inkSoft: '#4A5360',
  inkMute: '#7E8899',
  line: '#E8ECF2',
  lineSoft: '#EDF0F4',
};

export default function CompanySwitcher() {
  const { activeCompanyId, setActiveCompanyId, myCompanyIds } = useAuth();
  const { data: companies, loading } = useCompanies();

  if (loading) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-[10px] border px-3 text-xs font-semibold shrink-0"
        style={{ background: PASTEL.lineSoft, borderColor: PASTEL.line, color: 'transparent', height: '36px', width: '96px' }}
      />
    );
  }

  const filtered = (myCompanyIds && myCompanyIds.length)
    ? companies.filter((c) => myCompanyIds.includes(c.id))
    : companies.filter((c) => c.id === activeCompanyId);

  // Single (or zero-match, defensive) company — static label, nothing to switch.
  if (filtered.length <= 1) {
    const company = filtered[0] || companies.find((c) => c.id === activeCompanyId);
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-[10px] border px-3 text-xs font-semibold shrink-0"
        style={{ background: PASTEL.lineSoft, borderColor: PASTEL.line, color: PASTEL.inkSoft, height: '36px' }}
      >
        <Building2 size={13} style={{ color: PASTEL.inkMute }} />
        <span className="hidden xl:inline">{company?.name || '—'}</span>
        <span className="xl:hidden">{company?.code || '—'}</span>
      </span>
    );
  }

  // Multiple companies — pill switcher, one segment per company the user
  // actually holds a role in.
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[10px] border p-0.5 shrink-0"
      style={{ background: PASTEL.lineSoft, borderColor: PASTEL.line, height: '36px' }}
    >
      <Building2 size={13} style={{ color: PASTEL.inkMute, marginLeft: 6, marginRight: 2 }} />
      {filtered.map((c) => {
        const active = c.id === activeCompanyId;
        return (
          <button
            key={c.id}
            type="button"
            title={c.name}
            onClick={() => setActiveCompanyId(c.id)}
            className="rounded-[8px] px-2.5 text-xs font-semibold transition-colors"
            style={{
              background: active ? '#fff' : 'transparent',
              color: active ? PASTEL.ink : PASTEL.inkMute,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
              height: '30px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span className="hidden xl:inline">{c.name}</span>
            <span className="xl:hidden">{c.code}</span>
          </button>
        );
      })}
    </div>
  );
}
