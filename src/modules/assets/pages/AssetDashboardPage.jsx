// src/modules/assets/pages/AssetDashboardPage.jsx
// Asset Management — Dashboard screen
// Data layer: Supabase (assets + asset_categories), aggregated client-side.
// Design system: warm cream (#F6EFE3) + orange accent (#E85A1E)
// Typography: Inter + IBM Plex Mono

import { useState, useEffect, useCallback } from 'react';
import { Car, Monitor, Sofa, Building2, CheckCircle2, Wrench, FileX, Package,
         Calendar, Download, Plus, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// ─────────────────────────────────────────────────────────────
// Design tokens (from the design file)
// ─────────────────────────────────────────────────────────────
const D = {
  bg:          '#F6EFE3',
  bgAlt:       '#EFE6D4',
  surface:     '#FFFDF8',
  surface2:    '#FBF6EC',
  ink:         '#23291E',
  inkSoft:     '#5E6553',
  inkFaint:    '#8A8E7C',
  line:        '#E7DCC8',
  lineSoft:    '#F0E7D6',
  accent:      '#E85A1E',
  accentInk:   '#235031',
  accentSoft:  '#FEF2EC',
  ok:          '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:        '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:      '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:        '#2A5B8C', infoBg:'#E1ECF5',
  neutral:     '#6B6F5E', neutralBg:'#EEE9DC',
  msi:         '#E85A1E', msiBg:'#FEF2EC',
  jci:         '#2A5B8C', jciBg:'#E1ECF5',
  sbi:         '#9A5B2C', sbiBg:'#F4E7D8',
  shadow:      '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm:    '0 1px 2px rgba(40,34,18,.06)',
};

// ─────────────────────────────────────────────────────────────
// Entity + category metadata
// ─────────────────────────────────────────────────────────────
const COMPANIES = [
  { id: '0e1840d8-e6fb-4190-bd09-88338e68b492', key: 'msi', label: 'MSI', sub: 'MSI — Freight Forwarding', color: '#E85A1E' },
  { id: '42569e7c-531b-4d2b-832a-d5a7268c455b', key: 'jci', label: 'JCI', sub: 'JCI — Customs',            color: '#2A5B8C' },
  { id: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', key: 'soa', label: 'SOA', sub: 'SOA — Trading',            color: '#9A5B2C' },
];

// category code → display label + chart colour + icon
const CATS = [
  { code: 'VEH',    label: 'Kendaraan',    color: '#E85A1E', icon: Car      },
  { code: 'IT-EQP', label: 'IT Equipment', color: '#2A5B8C', icon: Monitor  },
  { code: 'FURN',   label: 'Furniture',    color: '#9A5B2C', icon: Sofa     },
  { code: 'BLDG',   label: 'Properti',     color: '#6B6F5E', icon: Building2 },
];

// ─────────────────────────────────────────────────────────────
// Rupiah formatting helpers (abbreviated, matches design)
// ─────────────────────────────────────────────────────────────
const fmtShortRp = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return 'Rp ' + (v / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (v >= 1e6) return 'Rp ' + (v / 1e6).toFixed(1).replace('.', ',') + ' Jt';
  return 'Rp ' + v.toLocaleString('id-ID');
};
const fmtBigRp = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return { value: (v / 1e9).toFixed(2).replace('.', ','), unit: 'Miliar' };
  if (v >= 1e6) return { value: (v / 1e6).toFixed(2).replace('.', ','), unit: 'Juta' };
  return { value: v.toLocaleString('id-ID'), unit: '' };
};

// ─────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.line}`,
      borderRadius: 10, boxShadow: D.shadowSm, ...style,
    }}>
      {children}
    </div>
  );
}

function CardHead({ title, sub, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '15px 18px', borderBottom: `1px solid ${D.lineSoft}`,
    }}>
      <div>
        <div style={{ margin: 0, fontSize: 14.5, fontWeight: 700, letterSpacing: '-.2px', color: D.ink }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12, color: D.inkFaint, fontWeight: 500, marginTop: 1 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, delta, deltaType, tone }) {
  const toneMap = {
    ok:      { ic: { background: D.okBg,      color: D.ok      } },
    warn:    { ic: { background: D.warnBg,    color: D.warn    } },
    danger:  { ic: { background: D.dangerBg,  color: D.danger  } },
    neutral: { ic: { background: D.neutralBg, color: D.neutral } },
    default: { ic: { background: D.accentSoft,color: D.accent  } },
  };
  const icStyle = (toneMap[tone] || toneMap.default).ic;
  const deltaColor = deltaType === 'up' ? D.ok : deltaType === 'down' ? D.danger : D.inkFaint;

  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.line}`, borderRadius: 10,
      padding: '15px 16px', boxShadow: D.shadowSm,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600 }}>{label}</span>
        <span style={{
          width: 34, height: 34, borderRadius: 9, display: 'flex',
          alignItems: 'center', justifyContent: 'center', ...icStyle,
        }}>
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{value}</div>
      {delta && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11.5, fontWeight: 600, marginTop: 9,
          color: deltaColor, fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {delta}
        </div>
      )}
    </div>
  );
}

function CoBadge({ company }) {
  const cfg = {
    msi: [D.msiBg, D.msi], jci: [D.jciBg, D.jci],
    sbi: [D.sbiBg, D.sbi], soa: [D.sbiBg, D.sbi],
  };
  const [bg, color] = cfg[company] || [D.neutralBg, D.neutral];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 6, background: bg, color,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.3px',
    }}>
      {company.toUpperCase()}
    </span>
  );
}

function Btn({ children, primary, onClick, href, icon: Icon }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 38,
    padding: '0 15px', borderRadius: 9, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
    border: `1px solid ${primary ? D.accent : D.line}`,
    background: primary ? D.accent : D.surface,
    color: primary ? '#fff' : D.ink,
    fontFamily: 'inherit',
  };
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} onClick={onClick} style={base}>
      {Icon && <Icon size={16} strokeWidth={1.9} />}
      {children}
    </Tag>
  );
}

// Empty state for not-yet-available features
function EmptyState({ icon: Icon = Calendar, title = 'Fitur segera hadir', sub }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 8, padding: '36px 18px', textAlign: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 11, background: D.surface2,
        color: D.inkFaint, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} strokeWidth={1.7} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: D.inkSoft }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: D.inkFaint, maxWidth: 280 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chart: Donut (pure CSS conic-gradient) — data-driven
// segments: [{ label, color, value }]
// ─────────────────────────────────────────────────────────────
function DonutChart({ segments, total }) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = [];
  if (sum > 0) {
    segments.forEach((seg) => {
      const start = (acc / sum) * 360;
      acc += seg.value;
      const end = (acc / sum) * 360;
      if (seg.value > 0) stops.push(`${seg.color} ${start}deg ${end}deg`);
    });
  }
  const bg = stops.length ? `conic-gradient(${stops.join(', ')})` : D.bgAlt;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
      {/* Donut */}
      <div style={{
        width: 158, height: 158, borderRadius: '50%', flexShrink: 0,
        background: bg, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 30, background: D.surface,
          borderRadius: '50%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <b style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>{total}</b>
          <span style={{ fontSize: 11, color: D.inkFaint, fontWeight: 600, marginTop: 2 }}>aset</span>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 160 }}>
        {segments.map(({ color, label, value }) => {
          const pct = sum > 0 ? Math.round((value / sum) * 100) : 0;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, flex: 1, color: D.ink }}>{label}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.inkSoft }}>{value} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chart: Company value bars — data-driven
// bars: [{ key, val, pct, color }]
// ─────────────────────────────────────────────────────────────
function CompanyValueChart({ bars, totalLabel }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 188 }}>
        {bars.map(({ key, val, pct, color }) => (
          <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ height: `${Math.max(2, pct)}%`, width: '100%', maxWidth: 42, background: color, borderRadius: '6px 6px 0 0' }} />
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: D.inkFaint }}>{val}</span>
            <CoBadge company={key} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: D.inkFaint, fontFamily: "'IBM Plex Mono', monospace", borderTop: `1px dashed ${D.line}`, paddingTop: 6, marginTop: 4 }}>
        <span>0</span><span>{totalLabel}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────
function Skel({ h = 14, w = '100%', r = 8, style }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: D.bgAlt, ...style }} />;
}
function DashboardSkeleton() {
  const grid = (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, marginBottom: 14 });
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Skel h={28} w={220} style={{ marginBottom: 20 }} />
      <div style={grid(4)}>{[0, 1, 2, 3].map(i => <Card key={i} style={{ padding: 16 }}><Skel h={12} w={90} /><Skel h={26} w={60} style={{ marginTop: 14 }} /></Card>)}</div>
      <div style={grid(4)}>{[0, 1, 2, 3].map(i => <Card key={i} style={{ padding: 16 }}><Skel h={12} w={90} /><Skel h={26} w={60} style={{ marginTop: 14 }} /></Card>)}</div>
      <div style={grid(2)}>{[0, 1].map(i => <Card key={i} style={{ padding: 18 }}><Skel h={16} w={160} /><Skel h={90} style={{ marginTop: 16 }} /></Card>)}</div>
      <div style={grid(3)}>{[0, 1, 2].map(i => <Card key={i} style={{ padding: 18 }}><Skel h={150} /></Card>)}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Data fetch — all dashboard stats in parallel, aggregated client-side
// ─────────────────────────────────────────────────────────────
async function fetchDashboardStats() {
  const [catRes, assetRes] = await Promise.all([
    supabase.from('asset_categories').select('id, code').is('deleted_at', null).limit(1000),
    supabase.from('assets').select('category_id, company_id, status, purchase_price').is('deleted_at', null).limit(5000),
  ]);
  if (catRes.error) throw catRes.error;
  if (assetRes.error) throw assetRes.error;

  const codeById = {};
  (catRes.data || []).forEach(c => { codeById[c.id] = c.code; });

  const catCounts = { 'VEH': 0, 'IT-EQP': 0, 'FURN': 0, 'BLDG': 0 };
  const catValues = { 'VEH': 0, 'IT-EQP': 0, 'FURN': 0, 'BLDG': 0 };
  const statusCounts = { active: 0, in_repair: 0, retired: 0, disposed: 0 };
  const coAgg = {};
  let totalValue = 0;

  (assetRes.data || []).forEach((r) => {
    const code = codeById[r.category_id];
    const price = Number(r.purchase_price) || 0;
    totalValue += price;
    if (code && code in catCounts) { catCounts[code] += 1; catValues[code] += price; }
    if (r.status in statusCounts) statusCounts[r.status] += 1;
    if (r.company_id) {
      if (!coAgg[r.company_id]) coAgg[r.company_id] = { value: 0, count: 0 };
      coAgg[r.company_id].value += price;
      coAgg[r.company_id].count += 1;
    }
  });

  const byCompany = COMPANIES.map(c => ({
    ...c,
    value: coAgg[c.id]?.value || 0,
    count: coAgg[c.id]?.count || 0,
  }));

  return {
    catCounts, catValues, statusCounts,
    totalAssets: (assetRes.data || []).length,
    totalValue, byCompany,
  };
}

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────
export default function AssetDashboardPage() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDashboardStats()
      .then((s) => { if (!cancelled) { setStats(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [load]);

  const gridStyle = (cols, gap = 14) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap,
    marginBottom: gap,
  });

  const thStyle = {
    textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
    textTransform: 'uppercase', color: D.inkFaint, padding: '10px 14px',
    borderBottom: `1px solid ${D.line}`, background: D.surface2,
    whiteSpace: 'nowrap',
  };

  // ── Page header (shared across states) ──
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
      <div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: D.inkFaint, marginBottom: 9 }}>
          <span>Home</span>
          <span style={{ color: D.inkFaint }}>›</span>
          <span style={{ color: D.inkSoft, fontWeight: 600 }}>Dashboard</span>
        </nav>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.5px', margin: 0, lineHeight: 1.1, color: D.ink }}>
          Dashboard
        </h1>
        <div style={{ color: D.inkSoft, fontSize: 13.5, marginTop: 4 }}>
          Ringkasan aset grup · semua entitas
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Btn icon={Calendar}>Periode</Btn>
        <Btn icon={Download}>Export</Btn>
        <Btn icon={Plus} primary>Tambah Aset</Btn>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>
        {header}
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>
        {header}
        <Card style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: D.dangerBg, color: D.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <AlertTriangle size={26} strokeWidth={1.7} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: D.ink }}>Gagal memuat data dashboard</div>
          <div style={{ fontSize: 13, color: D.inkSoft, margin: '8px auto 20px', maxWidth: 420 }}>
            {error.message || 'Terjadi kesalahan saat mengambil data aset.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Btn icon={RefreshCw} onClick={load}>Coba Lagi</Btn>
          </div>
        </Card>
      </div>
    );
  }

  // ── Derived values from real data ──
  const s = stats;
  const activePct = s.totalAssets > 0 ? Math.round((s.statusCounts.active / s.totalAssets) * 100) : 0;
  const big = fmtBigRp(s.totalValue);
  const valBreakdown = CATS.map(c => {
    const value = s.catValues[c.code] || 0;
    return { label: c.label, color: c.color, value, pct: s.totalValue > 0 ? Math.round((value / s.totalValue) * 100) : 0 };
  });
  const maxCoValue = Math.max(1, ...s.byCompany.map(c => c.value));
  const donutSegments = CATS.map(c => ({ label: c.label, color: c.color, value: s.catCounts[c.code] || 0 }));
  const companyBars = s.byCompany.map(c => ({
    key: c.key,
    val: (c.value / 1e9).toFixed(1).replace('.', ','),
    pct: Math.round((c.value / maxCoValue) * 100),
    color: c.color,
  }));

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>

      {header}

      {/* Row 1: Asset class counts */}
      <div style={gridStyle(4)}>
        <StatCard label="Total Kendaraan"     value={s.catCounts['VEH']}    icon={Car}       />
        <StatCard label="Total IT Equipment"  value={s.catCounts['IT-EQP']} icon={Monitor}   />
        <StatCard label="Total Furniture"     value={s.catCounts['FURN']}   icon={Sofa}      />
        <StatCard label="Total Properti"      value={s.catCounts['BLDG']}   icon={Building2} />
      </div>

      {/* Row 2: Lifecycle status */}
      <div style={gridStyle(4)}>
        <StatCard label="Total Aktif"        value={s.statusCounts.active}    icon={CheckCircle2} delta={`${activePct}% dari total aset`} deltaType="flat" tone="ok" />
        <StatCard label="Dalam Maintenance"  value={s.statusCounts.in_repair} icon={Wrench}       delta="0 work order aktif"           deltaType="flat" tone="warn" />
        <StatCard label="Dokumen Expired"    value={0}                        icon={FileX}        delta="Modul dokumen belum aktif"    deltaType="flat" tone="danger" />
        <StatCard label="Disposed"           value={s.statusCounts.disposed}  icon={Package}      delta="Total YTD"                    deltaType="flat" tone="neutral" />
      </div>

      {/* Row 3: Value cards */}
      <div style={gridStyle(2)}>
        {/* Total nilai */}
        <Card>
          <CardHead title="Total Nilai Aset Keseluruhan" sub="Nilai perolehan · grup" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 600, letterSpacing: '-1.2px', color: D.ink }}>
                Rp {big.value} {big.unit && <small style={{ fontSize: 18, color: D.inkSoft }}>{big.unit}</small>}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, marginTop: 6, color: D.inkFaint, fontFamily: "'IBM Plex Mono', monospace" }}>
                {s.totalAssets} aset · nilai perolehan
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${D.lineSoft}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {valBreakdown.map(({ label, pct, color, value }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '76px 1fr auto', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: D.ink }}>{label}</span>
                  <div style={{ height: 9, borderRadius: 6, background: D.bgAlt, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.inkSoft, fontWeight: 500 }}>{fmtShortRp(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Per company */}
        <Card>
          <CardHead title="Nilai Aset per Company" sub="MSI · JCI · SOA" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {s.byCompany.map((c) => (
                <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', gap: 12 }}>
                  <CoBadge company={c.key} />
                  <div style={{ height: 11, borderRadius: 6, background: D.bgAlt, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((c.value / maxCoValue) * 100)}%`, background: c.color, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.inkSoft, fontWeight: 500 }}>{fmtShortRp(c.value)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, borderTop: `1px solid ${D.lineSoft}`, paddingTop: 14, fontSize: 12, color: D.inkSoft }}>
              {s.byCompany.map((c) => (
                <div key={c.key}>
                  <b style={{ display: 'block', fontSize: 11, color: D.inkFaint, textTransform: 'uppercase', letterSpacing: '.4px' }}>{c.sub}</b>
                  {c.count} aset
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row */}
      <div style={{ ...gridStyle(3), marginTop: 0 }}>
        <Card>
          <CardHead title="Aset per Kategori" sub={`${s.totalAssets} total`} />
          <div style={{ padding: 18 }}><DonutChart segments={donutSegments} total={s.totalAssets} /></div>
        </Card>
        <Card>
          <CardHead title="Timeline Expiry Dokumen" sub="6 bulan ke depan" />
          <EmptyState title="Fitur segera hadir" sub="Modul dokumen & expiry aset belum tersedia." />
        </Card>
        <Card>
          <CardHead title="Nilai Aset per Company" sub="dalam Miliar Rp" />
          <div style={{ padding: 18 }}><CompanyValueChart bars={companyBars} totalLabel={`Total ${fmtShortRp(s.totalValue)}`} /></div>
        </Card>
      </div>

      {/* Expiry table → empty state (asset_documents table belum ada) */}
      <Card style={{ marginTop: 14 }}>
        <CardHead title="Dokumen Akan Expired" sub="Modul dokumen belum aktif" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Aset', 'Company', 'Tipe Dokumen', 'Nomor', 'Expiry Date', 'Sisa', 'Urgency'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                  <EmptyState icon={FileX} title="Fitur segera hadir" sub="Pelacakan dokumen & masa berlaku aset akan tersedia setelah modul Dokumen diimplementasi." />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}
