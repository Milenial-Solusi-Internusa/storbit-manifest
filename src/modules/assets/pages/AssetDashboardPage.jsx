// src/modules/assets/pages/AssetDashboardPage.jsx
// Asset Management — Dashboard screen
// Faithful React implementation of the index.html design.
// Design system: warm cream (#F6EFE3) + dark green accent (#2F6B3F)
// Typography: Plus Jakarta Sans + IBM Plex Mono

import { Car, Monitor, Sofa, Building2, CheckCircle2, Wrench, FileX, Package,
         Calendar, Download, Plus, ExternalLink } from 'lucide-react';

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
  accent:      '#2F6B3F',
  accentInk:   '#235031',
  accentSoft:  '#E7EFE2',
  ok:          '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:        '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:      '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:        '#2A5B8C', infoBg:'#E1ECF5',
  neutral:     '#6B6F5E', neutralBg:'#EEE9DC',
  msi:         '#2F6B3F', msiBg:'#E7EFE2',
  jci:         '#2A5B8C', jciBg:'#E1ECF5',
  sbi:         '#9A5B2C', sbiBg:'#F4E7D8',
  shadow:      '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm:    '0 1px 2px rgba(40,34,18,.06)',
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
  const cfg = { msi: [D.msiBg, D.msi], jci: [D.jciBg, D.jci], sbi: [D.sbiBg, D.sbi] };
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

function Badge({ children, type = 'neutral' }) {
  const cfg = {
    ok:      { bg: D.okBg,      color: D.ok,      bd: D.okBd      },
    warn:    { bg: D.warnBg,    color: D.warn,     bd: D.warnBd    },
    danger:  { bg: D.dangerBg,  color: D.danger,   bd: D.dangerBd  },
    neutral: { bg: D.neutralBg, color: D.neutral,  bd: '#DDD3BE'   },
  };
  const { bg, color, bd } = cfg[type] || cfg.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 600, padding: '3px 9px',
      borderRadius: 20, border: `1px solid ${bd}`,
      background: bg, color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {children}
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

// ─────────────────────────────────────────────────────────────
// Chart: Donut (pure CSS conic-gradient)
// ─────────────────────────────────────────────────────────────
function DonutChart() {
  const legend = [
    { color: '#9A5B2C', label: 'Furniture',     value: '212 · 50%' },
    { color: '#2A5B8C', label: 'IT Equipment',  value: '128 · 30%' },
    { color: '#2F6B3F', label: 'Kendaraan',     value: '64 · 15%'  },
    { color: '#6B6F5E', label: 'Properti',      value: '18 · 4%'   },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
      {/* Donut */}
      <div style={{
        width: 158, height: 158, borderRadius: '50%', flexShrink: 0,
        background: 'conic-gradient(#2F6B3F 0 54.6deg, #2A5B8C 54.6deg 163.8deg, #9A5B2C 163.8deg 344.5deg, #6B6F5E 344.5deg 360deg)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 30, background: D.surface,
          borderRadius: '50%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <b style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>422</b>
          <span style={{ fontSize: 11, color: D.inkFaint, fontWeight: 600, marginTop: 2 }}>aset aktif</span>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 160 }}>
        {legend.map(({ color, label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flex: 1, color: D.ink }}>{label}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.inkSoft }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chart: Vertical stacked bars (expiry timeline)
// ─────────────────────────────────────────────────────────────
function ExpiryBarsChart() {
  const months = [
    { label: 'Jun', o: 4, s: 2, a: 0 },
    { label: 'Jul', o: 0, s: 5, a: 1 },
    { label: 'Agu', o: 0, s: 0, a: 3 },
    { label: 'Sep', o: 0, s: 0, a: 5 },
    { label: 'Okt', o: 0, s: 0, a: 2 },
    { label: 'Nov', o: 0, s: 0, a: 7 },
  ];
  const maxVal = 7;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 188, paddingTop: 8 }}>
        {months.map(({ label, o, s, a }) => {
          const tot = o + s + a;
          const h = Math.max(8, (tot / maxVal) * 100);
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: D.inkFaint }}>{tot}</span>
              <div style={{ width: '100%', maxWidth: 42, height: `${h}%`, display: 'flex', flexDirection: 'column-reverse', borderRadius: '6px 6px 0 0', overflow: 'hidden' }}>
                {a > 0 && <div style={{ height: `${(a / tot) * 100}%`, background: '#2F6B3F' }} />}
                {s > 0 && <div style={{ height: `${(s / tot) * 100}%`, background: '#9A6B0E' }} />}
                {o > 0 && <div style={{ height: `${(o / tot) * 100}%`, background: '#B23227' }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: D.inkFaint, fontFamily: "'IBM Plex Mono', monospace", borderTop: `1px dashed ${D.line}`, paddingTop: 6, marginTop: 4 }}>
        {months.map(m => <span key={m.label}>{m.label}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5 }}>
        {[['#B23227', 'Overdue / bln ini'], ['#9A6B0E', '< 30 hari'], ['#2F6B3F', 'Aman']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, color: D.inkSoft, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Chart: Company value bars
// ─────────────────────────────────────────────────────────────
function CompanyValueChart() {
  const bars = [
    { co: 'msi', val: '22,6', pct: 100, color: '#2F6B3F' },
    { co: 'jci', val: '12,4', pct: 55,  color: '#2A5B8C' },
    { co: 'sbi', val: '7,8',  pct: 35,  color: '#9A5B2C' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 188 }}>
        {bars.map(({ co, val, pct, color }) => (
          <div key={co} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ height: `${pct}%`, width: '100%', maxWidth: 42, background: color, borderRadius: '6px 6px 0 0' }} />
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: D.inkFaint }}>{val}</span>
            <CoBadge company={co} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: D.inkFaint, fontFamily: "'IBM Plex Mono', monospace", borderTop: `1px dashed ${D.line}`, paddingTop: 6, marginTop: 4 }}>
        <span>0</span><span>Total Rp 42,8 M</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Expiry table rows
// ─────────────────────────────────────────────────────────────
const EXPIRY_ROWS = [
  { asset: 'B 9123 KXD',   sub: 'Mitsubishi Fuso Canter', co: 'msi', doc: 'STNK',             no: 'STNK·09123KXD', date: '15 Jun 2026', left: '13 hari',      urgency: 'warn'   },
  { asset: 'B 9456 ZTA',   sub: 'Hino Dutro 130 HD',      co: 'msi', doc: 'KIR / Uji Berkala', no: 'KIR·44871',     date: '28 Mei 2026', left: 'Lewat 5 hari', urgency: 'danger' },
  { asset: 'IT-LAP-0241',  sub: 'Lenovo ThinkPad E14',    co: 'jci', doc: 'Garansi',           no: 'WTY·LN-2241',   date: '02 Jun 2026', left: 'Hari ini',     urgency: 'danger' },
  { asset: 'B 1782 SBI',   sub: 'Toyota Hiace Commuter',  co: 'sbi', doc: 'Asuransi',          no: 'POL·7781204',   date: '21 Jun 2026', left: '19 hari',      urgency: 'warn'   },
  { asset: 'PRP-RUKO-03',  sub: 'Ruko Sunter Blok C-3',  co: 'msi', doc: 'Kontrak Sewa',      no: 'KTR·SNT-03',    date: '30 Jun 2026', left: '28 hari',      urgency: 'warn'   },
  { asset: 'B 3391 JCI',   sub: 'Daihatsu Gran Max BV',   co: 'jci', doc: 'STNK',             no: 'STNK·3391JCI',  date: '09 Jul 2026', left: '37 hari',      urgency: 'ok'     },
  { asset: 'IT-SRV-0007',  sub: 'Dell PowerEdge R650',    co: 'msi', doc: 'Garansi & Support', no: 'WTY·DL-0007',   date: '18 Jul 2026', left: '46 hari',      urgency: 'ok'     },
];

const URGENCY_LABEL = { ok: 'Aman', warn: '< 30 hari', danger: 'Expired' };

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────
export default function AssetDashboardPage() {
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
  const tdStyle = {
    padding: '9px 14px', borderBottom: `1px solid ${D.lineSoft}`,
    verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: 13,
  };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: D.ink }}>

      {/* Page header */}
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
            Ringkasan aset grup · Per 2 Juni 2026, 09:14 WIB
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Btn icon={Calendar}>Jun 2026</Btn>
          <Btn icon={Download}>Export</Btn>
          <Btn icon={Plus} primary>Tambah Aset</Btn>
        </div>
      </div>

      {/* Row 1: Asset class counts */}
      <div style={gridStyle(4)}>
        <StatCard label="Total Kendaraan"     value="64"  icon={Car}          delta="+3 bln ini"  deltaType="up" />
        <StatCard label="Total IT Equipment"  value="128" icon={Monitor}      delta="+11 bln ini" deltaType="up" />
        <StatCard label="Total Furniture"     value="212" icon={Sofa}         delta="tidak berubah" deltaType="flat" />
        <StatCard label="Total Properti"      value="18"  icon={Building2}    delta="+1 bln ini"  deltaType="up" />
      </div>

      {/* Row 2: Lifecycle status */}
      <div style={gridStyle(4)}>
        <StatCard label="Total Aktif"        value="384" icon={CheckCircle2} delta="91% dari total aset" deltaType="flat" tone="ok" />
        <StatCard label="Dalam Maintenance"  value="21"  icon={Wrench}       delta="6 work order aktif"  deltaType="flat" tone="warn" />
        <StatCard label="Dokumen Expired"    value="4"   icon={FileX}        delta="+9 akan expired <30 hari" deltaType="down" tone="danger" />
        <StatCard label="Disposed"           value="13"  icon={Package}      delta="YTD 2026"             deltaType="flat" tone="neutral" />
      </div>

      {/* Row 3: Value cards */}
      <div style={gridStyle(2)}>
        {/* Total nilai */}
        <Card>
          <CardHead title="Total Nilai Aset Keseluruhan" sub="Nilai perolehan · grup" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 600, letterSpacing: '-1.2px', color: D.ink }}>
                Rp 42,82 <small style={{ fontSize: 18, color: D.inkSoft }}>Miliar</small>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, marginTop: 6, color: D.ok, fontFamily: "'IBM Plex Mono', monospace" }}>
                +Rp 1,9 M dari kuartal lalu
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${D.lineSoft}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { label: 'Kendaraan', pct: 34, color: '#2F6B3F', amt: 'Rp 14,6 M' },
                { label: 'Properti',  pct: 42, color: '#6B6F5E', amt: 'Rp 17,9 M' },
                { label: 'IT Equip.', pct: 18, color: '#2A5B8C', amt: 'Rp 7,7 M'  },
                { label: 'Furniture', pct: 6,  color: '#9A5B2C', amt: 'Rp 2,6 M'  },
              ].map(({ label, pct, color, amt }) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '54px 1fr auto', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: D.ink }}>{label}</span>
                  <div style={{ height: 9, borderRadius: 6, background: D.bgAlt, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.inkSoft, fontWeight: 500 }}>{amt}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Per company */}
        <Card>
          <CardHead title="Nilai Aset per Company" sub="MSI · JCI · SBI" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { co: 'msi', pct: 100, color: '#2F6B3F', amt: 'Rp 22,6 M' },
                { co: 'jci', pct: 55,  color: '#2A5B8C', amt: 'Rp 12,4 M' },
                { co: 'sbi', pct: 35,  color: '#9A5B2C', amt: 'Rp 7,8 M'  },
              ].map(({ co, pct, color, amt }) => (
                <div key={co} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', gap: 12 }}>
                  <CoBadge company={co} />
                  <div style={{ height: 11, borderRadius: 6, background: D.bgAlt, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.inkSoft, fontWeight: 500 }}>{amt}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, borderTop: `1px solid ${D.lineSoft}`, paddingTop: 14, fontSize: 12, color: D.inkSoft }}>
              {[
                { co: 'MSI — Freight Forwarding', count: '241 aset' },
                { co: 'JCI — Customs',            count: '118 aset' },
                { co: 'SBI — Trading',            count: '63 aset'  },
              ].map(({ co, count }) => (
                <div key={co}>
                  <b style={{ display: 'block', fontSize: 11, color: D.inkFaint, textTransform: 'uppercase', letterSpacing: '.4px' }}>{co}</b>
                  {count}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row */}
      <div style={{ ...gridStyle(3), marginTop: 0 }}>
        <Card>
          <CardHead title="Aset per Kategori" sub="422 total" />
          <div style={{ padding: 18 }}><DonutChart /></div>
        </Card>
        <Card>
          <CardHead title="Timeline Expiry Dokumen" sub="6 bulan ke depan" />
          <div style={{ padding: 18 }}><ExpiryBarsChart /></div>
        </Card>
        <Card>
          <CardHead title="Nilai Aset per Company" sub="dalam Miliar Rp" />
          <div style={{ padding: 18 }}><CompanyValueChart /></div>
        </Card>
      </div>

      {/* Expiry table */}
      <Card style={{ marginTop: 14 }}>
        <CardHead
          title="Dokumen Akan Expired"
          sub="Perlu tindak lanjut · 13 dokumen"
          action={
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 32, padding: '0 11px', borderRadius: 8, fontSize: 12.5,
              fontWeight: 600, border: `1px solid ${D.line}`, background: D.surface,
              color: D.ink, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <ExternalLink size={14} strokeWidth={1.9} />
              Lihat Semua
            </button>
          }
        />
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
              {EXPIRY_ROWS.map((row) => (
                <tr
                  key={row.no}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = D.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 7, background: D.bgAlt,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, color: D.inkSoft,
                      }}>
                        {row.co === 'jci' && row.asset.startsWith('IT') ? <Monitor size={16} /> : <Car size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: D.ink, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{row.asset}</div>
                        <div style={{ fontSize: 11.5, color: D.inkFaint }}>{row.sub}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}><CoBadge company={row.co} /></td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: D.ink }}>{row.doc}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: D.accentInk }}>{row.no}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace" }}>{row.date}</td>
                  <td style={{ ...tdStyle, fontSize: 11.5, color: D.inkFaint }}>{row.left}</td>
                  <td style={tdStyle}><Badge type={row.urgency}>{URGENCY_LABEL[row.urgency]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}
