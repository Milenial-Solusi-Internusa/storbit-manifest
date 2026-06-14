// src/modules/launcher/AppLauncher.jsx
// Redesigned bento-grid launcher — solid colour cards, MSI brand system.
//
// NAVIGATION LOGIC UNCHANGED:
//   Props:  moduleGroups, onSelect, profile, hasPermission, hasMenuPermission
//   Click:  allowed ? onSelect(group) : setRestrictedModule(group.label)
//   Greeting + first-name logic: identical

import { useState } from 'react';
import {
  Command, Users, Truck, ShoppingCart, Package, Receipt,
  Headphones, FileCheck2, Globe, BarChart3, Database, Lock, Loader2,
} from 'lucide-react';

// ─── Per-group config (icon + required solid colour) ──────────────────────
const MODULE_CFG = {
  'Core':                   { Icon: Command,     color: '#6B7280', desc: 'Pengguna, peran & konfigurasi'     },
  'Commercial & CRM':       { Icon: Users,       color: '#3B82F6', desc: 'Pipeline, quotation & klien'       },
  'Logistics':              { Icon: Truck,       color: '#144682', desc: 'SP, Shipment, Freight & Customs'   },
  'Procurement & Vendor':   { Icon: ShoppingCart,color: '#F97316', desc: 'PO, RFQ & manajemen vendor'        },
  'Inventory':      { Icon: Package,     color: '#D97706', desc: 'Stok, aset & depresiasi'           },
  'Finance & Accounting':   { Icon: Receipt,     color: '#059669', desc: 'AR/AP, jurnal & laporan keuangan'  },
  'Service Management':     { Icon: Headphones,  color: '#7C3AED', desc: 'Tiket, SLA & dukungan internal'    },
  'Workflow & Document':    { Icon: FileCheck2,  color: '#0D9488', desc: 'Approval, e-doc & arsip'           },
  'Portal & Integration':   { Icon: Globe,       color: '#0891B2', desc: 'API, SSO & portal mitra'           },
  'Reporting & Governance': { Icon: BarChart3,   color: '#4F46E5', desc: 'Dashboard, audit & kepatuhan'      },
  'Foundation':             { Icon: Database,    color: '#6B7280', desc: 'Master data & referensi grup'      },
};

// Slight darkening for gradient end — multiply each channel by 0.82
function darken(hex) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.82);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.82);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.82);
  return `rgb(${r},${g},${b})`;
}

// ─── Lock badge ───────────────────────────────────────────────────────────
function LockBadge() {
  return (
    <span style={{
      position: 'absolute', top: 14, right: 14,
      width: 28, height: 28, borderRadius: 8,
      background: 'rgba(0,0,0,.32)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3,
    }}>
      <Lock size={14} style={{ color: '#fff' }} />
    </span>
  );
}

// ─── Shared card: solid colour bg, white text, hover lift ─────────────────
function ModuleCard({ group, cfg, onClick, pos, restricted, tall }) {
  const color = cfg.color || '#6B7280';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...pos,
        position: 'relative',
        background: `linear-gradient(135deg, ${color} 0%, ${darken(color)} 100%)`,
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 18,
        padding: tall ? 28 : 22,
        cursor: restricted ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform .16s ease, box-shadow .16s ease',
        textAlign: 'left',
        overflow: 'hidden',
        boxShadow: `0 4px 18px ${color}55`,
      }}
      onMouseEnter={(e) => {
        if (restricted) return;
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = `0 20px 48px ${color}77`;
      }}
      onMouseLeave={(e) => {
        if (restricted) return;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = `0 4px 18px ${color}55`;
      }}
    >
      {/* Restricted overlay */}
      {restricted && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 18,
          background: 'rgba(0,0,0,0.28)',
          zIndex: 2,
          pointerEvents: 'none',
        }} />
      )}
      {restricted && <LockBadge />}

      {/* Icon */}
      <span style={{
        width: 50, height: 50, borderRadius: 14, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,.16)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)',
      }}>
        {cfg.Icon && <cfg.Icon size={27} strokeWidth={1.8} style={{ color: '#ffffff' }} />}
      </span>

      {/* Logistics: ACTIVE badge */}
      {tall && (
        <span style={{
          position: 'absolute', top: 28, right: 28,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          fontFamily: "'IBM Plex Mono', monospace",
          background: 'rgba(255,255,255,.14)', color: 'rgba(255,255,255,.85)',
          border: '1px solid rgba(255,255,255,.25)',
          padding: '4px 10px', borderRadius: 30,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#E85A1E',
            boxShadow: '0 0 0 3px rgba(232,90,30,.30)',
            flexShrink: 0,
          }} />
          Active
        </span>
      )}

      {/* Text */}
      <div style={{ marginTop: 'auto' }}>
        <h3 style={{
          fontSize: tall ? 22 : 16,
          fontWeight: 700,
          letterSpacing: '-.2px',
          margin: `${tall ? 20 : 14}px 0 5px`,
          color: '#ffffff',
          fontFamily: tall ? "'Montserrat', sans-serif" : 'inherit',
        }}>
          {group.label}
        </h3>
        <p style={{
          fontSize: 13,
          color: 'rgba(255,255,255,.72)',
          margin: 0,
          lineHeight: 1.5,
        }}>
          {cfg.desc}
        </p>

        {/* Logistics stats row */}
        {tall && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18,
            marginTop: 18, paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,.18)',
          }}>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 600, color: '#fff', letterSpacing: '-.5px' }}>—</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.58)', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>SP Aktif</div>
            </div>
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,.2)', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 600, color: '#fff', letterSpacing: '-.5px' }}>—</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.58)', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>Pending</div>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Group label → permission module mapping ─────────────────────────────
// Used to gate cards via hasPermission(module, 'view').
// Groups not listed here are always visible.
const LAUNCHER_MODULE_MAP = {
  'Logistics':              'logistics',
  'Commercial & CRM':       'crm',
  'Procurement & Vendor':   'procurement',
  'Inventory':      'inventory',
  'Finance & Accounting':   'finance',
  'Service Management':     'hrga',
  'Workflow & Document':    'workflow',
  'Reporting & Governance': 'reporting',
  'Foundation':             'foundation',
  'Portal & Integration':   'admin',
};

// ─── Explicit grid position per module label ──────────────────────────────
// Core is hidden (conflicts with Portal & Integration at col 1, row 4)
const GRID_POS = {
  'Logistics':              { gridColumn: '1',     gridRow: '1 / 3' },
  'Commercial & CRM':       { gridColumn: '2',     gridRow: '1'     },
  'Procurement & Vendor':   { gridColumn: '3',     gridRow: '1'     },
  'Inventory':      { gridColumn: '2',     gridRow: '2'     },
  'Finance & Accounting':   { gridColumn: '3',     gridRow: '2 / 4' },
  'Service Management':     { gridColumn: '1',     gridRow: '3'     },
  'Workflow & Document':    { gridColumn: '2',     gridRow: '3'     },
  'Portal & Integration':   { gridColumn: '1',     gridRow: '4'     },
  'Reporting & Governance': { gridColumn: '2',     gridRow: '4'     },
  'Foundation':             { gridColumn: '3',     gridRow: '4'     },
  'Core':                   null,
};

// ─── Restricted access modal ──────────────────────────────────────────────
function RestrictedModal({ moduleName, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: 32,
          maxWidth: 400, width: '100%', textAlign: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: '#FEF2EC', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <Lock size={32} style={{ color: '#E85A1E' }} />
        </div>
        <h2 style={{
          fontFamily: "'Montserrat', sans-serif",
          fontSize: 20, fontWeight: 800, color: '#1A1A1E',
          margin: '0 0 10px',
        }}>
          Akses Terbatas
        </h2>
        <p style={{
          fontSize: 14, color: '#4B5563', lineHeight: 1.6,
          margin: '0 0 28px',
        }}>
          Anda tidak memiliki akses ke modul <strong>{moduleName}</strong>.
          Hubungi administrator untuk mendapatkan akses.
        </p>
        <button
          onClick={onClose}
          style={{
            padding: '10px 28px', borderRadius: 9,
            border: '1.5px solid #144682', background: '#fff',
            color: '#144682', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background .14s, color .14s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#144682'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#144682'; }}
        >
          Tutup
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function AppLauncher({ moduleGroups, onSelect, profile, hasPermission, hasMenuPermission, permissionsLoading }) {
  // Greeting + first-name logic — unchanged
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [restrictedModule, setRestrictedModule] = useState(null);

  // Check access — prefer per-user hasMenuPermission, fallback to role-based hasPermission.
  // Returns true while permissions are still loading (no flash of restricted state).
  const canAccess = (group) => {
    const mod = LAUNCHER_MODULE_MAP[group.label];
    if (!mod) return true;
    if (typeof hasMenuPermission === 'function') return hasMenuPermission(mod, 'view');
    if (typeof hasPermission === 'function') return hasPermission(mod, 'view');
    return true;
  };

  return (
    <>
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(4, minmax(160px, auto));
          gap: 16px;
        }
        @media (max-width: 980px) {
          .bento-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-template-rows: none;
            grid-auto-rows: minmax(160px, auto);
          }
          .bento-grid > * { grid-column: auto !important; grid-row: auto !important; }
        }
        @media (max-width: 620px) {
          .bento-grid { grid-template-columns: 1fr; }
          .bento-grid > * { min-height: 150px; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
        padding: '54px 30px 40px',
      }}>
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase',
            color: '#144682', background: '#EEF3FB',
            border: '1px solid #C5D4ED',
            padding: '5px 14px', borderRadius: 30, marginBottom: 22, whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#E85A1E',
              boxShadow: '0 0 0 3px rgba(232,90,30,.22)',
              flexShrink: 0,
            }} />
            Nexus by MSI
          </span>
          <h1 style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 38, fontWeight: 800, letterSpacing: '-1.2px',
            margin: 0, color: '#144682', lineHeight: 1.08,
          }}>
            {greeting}, {firstName}.
          </h1>
          {permissionsLoading ? (
            <p style={{
              fontSize: 15.5, color: '#4B5563', margin: '11px 0 0',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <Loader2 size={15} style={{ color: '#144682', animation: 'spin 1s linear infinite' }} />
              Memuat izin akses…
            </p>
          ) : (
            <p style={{ fontSize: 15.5, color: '#4B5563', margin: '11px 0 0' }}>
              Select a module to get started.
            </p>
          )}
        </div>

        {/* Restricted modal */}
        {restrictedModule && (
          <RestrictedModal
            moduleName={restrictedModule}
            onClose={() => setRestrictedModule(null)}
          />
        )}

        {/* Bento grid — blocked + dimmed while permissions load so module
            clicks don't silently no-op before access is known */}
        <div
          className="bento-grid"
          aria-busy={permissionsLoading || undefined}
          style={permissionsLoading
            ? { opacity: 0.55, pointerEvents: 'none', transition: 'opacity .2s' }
            : { transition: 'opacity .2s' }}
        >
          {moduleGroups.map((group) => {
            const pos = GRID_POS[group.label];

            // Null pos = hidden (Core)
            if (pos === null) return null;

            const cfg = MODULE_CFG[group.label] ?? { Icon: Database, color: '#6B7280', desc: '' };
            const gridPos   = pos ?? {};
            const allowed   = canAccess(group);
            const handleClick = allowed
              ? () => onSelect(group)
              : () => setRestrictedModule(group.label);

            return (
              <ModuleCard
                key={group.label}
                group={group}
                cfg={cfg}
                pos={gridPos}
                onClick={handleClick}
                restricted={!allowed}
                tall={group.label === 'Logistics'}
              />
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center', marginTop: 40,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
          color: '#9CA3AF',
        }}>
          MSI Group · Unified Business Core Platform
        </div>
      </div>
    </>
  );
}
