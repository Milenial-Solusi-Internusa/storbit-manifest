// src/modules/launcher/AppLauncher.jsx
// Redesigned bento-grid launcher — matches nexus-by-msi/project/launcher.html
//
// NAVIGATION LOGIC UNCHANGED:
//   Props:  moduleGroups, onSelect, profile  (identical signature)
//   Click:  onSelect(group)  (identical)
//   Greeting + first-name logic: identical

import {
  Command, Users, Truck, ShoppingCart, Package, Receipt,
  Headphones, FileCheck2, Globe, BarChart3, Database, ArrowUpRight,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────
const T = {
  bg:        '#F6EFE3',
  bgAlt:     '#EFE6D4',
  surface:   '#FFFDF8',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#2F6B3F',
  accentInk: '#235031',
  accentSoft:'#E7EFE2',
  okBd:      '#BFDDC4',
};

// ─── Per-group config ─────────────────────────────────────────────────────
const MODULE_CFG = {
  'Core':                   { Icon: Command,    color: '#64748B', desc: 'Pengguna, peran & konfigurasi'    },
  'Commercial & CRM':       { Icon: Users,      color: '#3B82F6', desc: 'Pipeline, quotation & klien'      },
  'Logistics':              { Icon: Truck,      color: null,      desc: 'SP, Shipment, Freight & Customs'  },
  'Procurement & Vendor':   { Icon: ShoppingCart,color:'#F97316', desc: 'PO, RFQ & manajemen vendor'       },
  'Inventory & Asset':      { Icon: Package,    color: '#D97706', desc: 'Stok, aset & depresiasi'          },
  'Finance & Accounting':   { Icon: Receipt,    color: '#059669', desc: 'AR/AP, jurnal & laporan keuangan' },
  'Service Management':     { Icon: Headphones, color: '#7C3AED', desc: 'Tiket, SLA & dukungan internal'   },
  'Workflow & Document':    { Icon: FileCheck2, color: '#0D9488', desc: 'Approval, e-doc & arsip'          },
  'Portal & Integration':   { Icon: Globe,      color: '#0891B2', desc: 'API, SSO & portal mitra'          },
  'Reporting & Governance': { Icon: BarChart3,  color: '#4F46E5', desc: 'Dashboard, audit & kepatuhan'     },
  'Foundation':             { Icon: Database,   color: '#6B7280', desc: 'Master data & referensi grup'     },
};

// Soft icon-circle background derived from hex color
function tint(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},.11)`;
}

// ─── Card variants ────────────────────────────────────────────────────────

// Logistics — 2×2, dark green gradient, ACTIVE badge
function LogisticsCard({ group, cfg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        gridColumn: 'span 2', gridRow: 'span 2',
        position: 'relative',
        background: 'linear-gradient(150deg,#1C2B1E 0%,#244A2C 60%,#2F6B3F 120%)',
        border: '1px solid #22361F', borderRadius: 16,
        padding: 28, cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
        textAlign: 'left', overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(40,34,18,.06)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = '#3A6B40';
        e.currentTarget.style.boxShadow = '0 18px 44px rgba(20,39,26,.34)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = '#22361F';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(40,34,18,.06)';
      }}
    >
      {/* ACTIVE badge */}
      <span style={{
        position: 'absolute', top: 28, right: 28,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
        fontFamily: "'IBM Plex Mono', monospace",
        background: 'rgba(143,203,140,.18)', color: '#A9D6A8',
        border: '1px solid rgba(143,203,140,.32)',
        padding: '4px 10px', borderRadius: 30,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8FCB8C', boxShadow: '0 0 0 3px rgba(143,203,140,.25)', flexShrink: 0 }}/>
        Active
      </span>

      {/* Icon */}
      <span style={{
        width: 58, height: 58, borderRadius: 16, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)',
      }}>
        {cfg.Icon && <cfg.Icon size={30} strokeWidth={1.8} style={{ color: '#E9F4E6' }}/>}
      </span>

      {/* Body */}
      <div style={{ marginTop: 'auto' }}>
        <h3 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.2px', margin: '18px 0 6px', color: '#F4F8F0' }}>
          {group.label}
        </h3>
        <p style={{ fontSize: 14, color: 'rgba(228,240,224,.78)', margin: 0, lineHeight: 1.45 }}>
          {cfg.desc}
        </p>
        {/* Stats row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 18,
          marginTop: 16, paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,.13)',
        }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 600, color: '#F2F7EE', letterSpacing: '-.5px' }}>—</div>
            <div style={{ fontSize: 11, color: 'rgba(228,240,224,.66)', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>SP Aktif</div>
          </div>
          <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,.14)', flexShrink: 0 }}/>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 600, color: '#F2F7EE', letterSpacing: '-.5px' }}>—</div>
            <div style={{ fontSize: 11, color: 'rgba(228,240,224,.66)', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>Pending</div>
          </div>
        </div>
      </div>
    </button>
  );
}

// Finance — 1×2 tall, left green accent border
function FinanceCard({ group, cfg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        gridRow: 'span 2',
        position: 'relative',
        background: T.surface, borderRadius: 16,
        border: `1px solid ${T.line}`, borderLeft: `4px solid ${cfg.color}`,
        padding: 20, cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
        textAlign: 'left', overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(40,34,18,.06)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(40,34,18,.13)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(40,34,18,.06)';
      }}
    >
      {/* Arrow icon — shows on hover */}
      <HoverArrow/>

      {/* Icon circle */}
      <span style={{
        width: 48, height: 48, borderRadius: 13, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: tint(cfg.color),
      }}>
        {cfg.Icon && <cfg.Icon size={26} strokeWidth={1.8} style={{ color: cfg.color }}/>}
      </span>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.2px', margin: '14px 0 4px', color: T.ink }}>
          {group.label}
        </h3>
        <p style={{ fontSize: 12.5, color: T.inkFaint, margin: 0, lineHeight: 1.45 }}>
          {cfg.desc}
        </p>
      </div>

      <div style={{ flex: 1 }}/>

      {/* Finance rows */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.lineSoft}`, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {[['Invoice', '—'], ['Outstanding', '—']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: T.inkSoft, fontWeight: 500 }}>{k}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: T.ink }}>{v}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

// Foundation — 2×1 wide, horizontal layout
function WideCard({ group, cfg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        gridColumn: 'span 2',
        position: 'relative',
        background: T.surface, borderRadius: 16,
        border: `1px solid ${T.line}`,
        padding: '24px 28px', cursor: 'pointer',
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20,
        transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
        textAlign: 'left', overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(40,34,18,.06)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = '#C5D6BF';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(40,34,18,.13)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(40,34,18,.06)';
      }}
    >
      <HoverArrow/>

      {/* Icon circle */}
      <span style={{
        width: 48, height: 48, borderRadius: 13, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: tint(cfg.color),
      }}>
        {cfg.Icon && <cfg.Icon size={26} strokeWidth={1.8} style={{ color: cfg.color }}/>}
      </span>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.2px', margin: '0 0 4px', color: T.ink }}>
          {group.label}
        </h3>
        <p style={{ fontSize: 12.5, color: T.inkFaint, margin: 0, lineHeight: 1.45 }}>
          {cfg.desc}
        </p>
      </div>
    </button>
  );
}

// Standard 1×1 card
function StandardCard({ group, cfg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        background: T.surface, borderRadius: 16,
        border: `1px solid ${T.line}`,
        padding: 20, cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease',
        textAlign: 'left', overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(40,34,18,.06)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.borderColor = '#C5D6BF';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(40,34,18,.13)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(40,34,18,.06)';
      }}
    >
      <HoverArrow/>

      {/* Icon circle */}
      <span style={{
        width: 48, height: 48, borderRadius: 13, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: cfg.color ? tint(cfg.color) : T.bgAlt,
      }}>
        {cfg.Icon && <cfg.Icon size={26} strokeWidth={1.8} style={{ color: cfg.color || T.inkSoft }}/>}
      </span>

      <div style={{ marginTop: 'auto' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.2px', margin: '14px 0 4px', color: T.ink }}>
          {group.label}
        </h3>
        <p style={{ fontSize: 12.5, color: T.inkFaint, margin: 0, lineHeight: 1.45 }}>
          {cfg.desc}
        </p>
      </div>
    </button>
  );
}

// Hover arrow — absolute top-right, shows on parent hover via CSS
function HoverArrow() {
  return (
    <span style={{
      position: 'absolute', top: 20, right: 20,
      width: 26, height: 26, borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.inkFaint, pointerEvents: 'none',
      opacity: 0, // shown via parent onMouseEnter below — we handle via parent state instead
    }}>
      <ArrowUpRight size={17} strokeWidth={2}/>
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function AppLauncher({ moduleGroups, onSelect, profile }) {
  // ── UNCHANGED greeting + name logic ──────────────────────────────────
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-auto-rows: 163px;
          gap: 16px;
        }
        @media (max-width: 980px) {
          .bento-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 620px) {
          .bento-grid { grid-template-columns: 1fr; grid-auto-rows: auto; }
          .bento-grid > * { min-height: 150px; }
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
        padding: '54px 30px 40px',
      }}>

        {/* ── Heading ─────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 42 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase',
            color: T.accentInk, background: T.accentSoft,
            border: `1px solid ${T.okBd}`,
            padding: '5px 13px', borderRadius: 30, marginBottom: 22, whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, boxShadow: '0 0 0 3px rgba(47,107,63,.18)', flexShrink: 0 }}/>
            Nexus by MSI
          </span>
          <h1 style={{
            fontSize: 38, fontWeight: 800, letterSpacing: '-1.2px',
            margin: 0, color: T.ink, lineHeight: 1.08,
          }}>
            {greeting}, {firstName}.
          </h1>
          <p style={{ fontSize: 15.5, color: T.inkSoft, margin: '11px 0 0' }}>
            Select a module to get started.
          </p>
        </div>

        {/* ── Bento grid ──────────────────────────────────────────────── */}
        <div className="bento-grid">
          {moduleGroups.map((group) => {
            const cfg = MODULE_CFG[group.label] ?? {
              Icon: Database, color: '#6B7280', desc: '',
            };

            // LOGISTICS → 2×2 dark card
            if (group.label === 'Logistics') {
              return (
                <LogisticsCard
                  key={group.label}
                  group={group}
                  cfg={cfg}
                  onClick={() => onSelect(group)}
                />
              );
            }

            // FINANCE → 1×2 tall card with left accent
            if (group.label === 'Finance & Accounting') {
              return (
                <FinanceCard
                  key={group.label}
                  group={group}
                  cfg={cfg}
                  onClick={() => onSelect(group)}
                />
              );
            }

            // FOUNDATION → 2×1 wide horizontal card
            if (group.label === 'Foundation') {
              return (
                <WideCard
                  key={group.label}
                  group={group}
                  cfg={cfg}
                  onClick={() => onSelect(group)}
                />
              );
            }

            // All others → standard 1×1
            return (
              <StandardCard
                key={group.label}
                group={group}
                cfg={cfg}
                onClick={() => onSelect(group)}
              />
            );
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center', marginTop: 40,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
          color: T.inkFaint,
        }}>
          MSI Group · Unified Business Core Platform
        </div>
      </div>
    </>
  );
}
