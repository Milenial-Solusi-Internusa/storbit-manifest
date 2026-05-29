// src/modules/dashboard/Dashboard.jsx
// Extracted from src/App.jsx — Phase 0.4B Step 3A.
// Dashboard is statically imported in Step 3A.
// React.lazy() is applied in Step 3B after this extraction is verified safe.
//
// Notes on local copies:
// - PASTEL and format utilities are copied here from App.jsx.
//   The canonical definitions remain in App.jsx until Phase 0.5 (shared utils extraction).
// - KPICard and StatusBadge are copied here from App.jsx.
//   App.jsx keeps its own copies because those components are also used by
//   FinancePage, ARTrackerPage, Manifest, SPSidePanel, and ShipmentPage.
//   Deduplication is planned for Phase 0.5.
// - FinancialCard, AlertCard, ChartCard, EmptyChart, CustomTooltip are
//   Dashboard-exclusive and have been removed from App.jsx.

import {
  FileText, Package, Clock, CheckCircle2,
  Truck, AlertTriangle, Wallet,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area,
} from 'recharts';

// ─── PASTEL ───────────────────────────────────────────────────────────────────
// Local copy. Source of truth: App.jsx (until Phase 0.5 extracts to src/styles/).
const PASTEL = {
  peach: '#FFD4B8',
  peachDeep: '#F5A78F',
  lavender: '#D8C5F0',
  lavenderDeep: '#A98FD8',
  mint: '#C8EFD9',
  mintDeep: '#7FC9A0',
  butter: '#FFE9B8',
  butterDeep: '#E8C168',
  rose: '#F5C8D5',
  roseDeep: '#D89AB0',
  sky: '#C8E4F5',
  skyDeep: '#8FBCD8',
  cream: '#FAF6F0',
  ink: '#2D2A28',
  inkSoft: '#5C5550',
  inkMute: '#9C948D',
  line: '#EDE6DC',
  lineSoft: '#F5EFE5',
};

// ─── Format utilities ─────────────────────────────────────────────────────────
// Local copies. Source of truth: App.jsx (until Phase 0.5 extracts to src/utils/).
const formatRupiah = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
};

const formatRupiahShort = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (n >= 1_000_000_000) return `Rp ${(n/1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n/1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n/1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
};

const formatNumber = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return new Intl.NumberFormat('id-ID').format(n);
};

const formatDateID = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m)-1, 1);
  return date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
};

// ─── KPICard ──────────────────────────────────────────────────────────────────
// Local copy. App.jsx retains its own copy (used by FinancePage, ARTrackerPage).
function KPICard({ label, value, icon: Icon, color, accent }) {
  return (
    <div
      className="rounded-2xl p-5 border transition-all hover:-translate-y-0.5"
      style={{
        background: 'white',
        borderColor: 'rgba(15,42,35,0.08)',
        boxShadow: '0 2px 12px rgba(15,42,35,0.04)',
      }}
    >
      <div className="mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: color }}
        >
          <Icon size={17} style={{ color: accent }} strokeWidth={1.8}/>
        </div>
      </div>
      <div className="font-numeric text-[2.25rem] font-bold tracking-tight leading-none mb-2">
        {value}
      </div>
      <div
        className="text-[10.5px] uppercase tracking-[0.14em] font-semibold"
        style={{ color: PASTEL.inkMute }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Local copy. App.jsx retains its own copy (used by Manifest, SPSidePanel, ShipmentPage).
function StatusBadge({ status, overdue, large }) {
  const styles = {
    Open:    { bg: PASTEL.sky,    color: '#1F4D6B' },
    Partial: { bg: PASTEL.butter, color: '#7A5B12' },
    Closed:  { bg: PASTEL.mint,   color: '#1B5739' },
  };
  const s = styles[status] || styles.Open;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-full font-semibold tracking-wide ${large ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'}`}
        style={{ background: s.bg, color: s.color }}
      >
        {status}
      </span>
      {overdue && (
        <span
          className={`rounded-full font-semibold tracking-wide ${large ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'}`}
          style={{ background: PASTEL.rose, color: '#7A2240' }}
        >
          Overdue
        </span>
      )}
    </div>
  );
}

// ─── Dashboard-exclusive sub-components ──────────────────────────────────────

function FinancialCard({ label, value, bg, highlight }) {
  return (
    <div
      className="rounded-2xl p-5 border transition-all"
      style={{
        background: highlight
          ? 'linear-gradient(135deg, #EDFAF4 0%, #F5FDF9 100%)'
          : 'white',
        borderColor: highlight ? 'rgba(127,201,160,0.35)' : 'rgba(15,42,35,0.08)',
        boxShadow: highlight
          ? '0 4px 18px rgba(127,201,160,0.18)'
          : '0 2px 8px rgba(15,42,35,0.03)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: bg }}/>
        <div
          className="text-[10px] uppercase tracking-[0.16em] font-semibold"
          style={{ color: PASTEL.inkMute }}
        >
          {label}
        </div>
      </div>
      <div
        className="font-numeric text-[1.75rem] font-bold tracking-tight leading-none"
        style={{ color: highlight ? '#1B5739' : PASTEL.ink }}
      >
        {formatRupiah(value)}
      </div>
    </div>
  );
}

function AlertCard({ label, value, sub, icon: Icon, bg, accent }) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: bg,
        borderColor: 'transparent',
        boxShadow: '0 2px 12px rgba(15,42,35,0.05)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 opacity-70"
            style={{ color: PASTEL.ink }}
          >
            {label}
          </div>
          <div
            className="font-numeric text-[2.25rem] font-bold tracking-tight leading-none mb-1.5"
            style={{ color: PASTEL.ink }}
          >
            {value}
          </div>
          <div className="text-xs font-medium opacity-70" style={{ color: PASTEL.ink }}>{sub}</div>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.52)' }}
        >
          <Icon size={18} style={{ color: accent }} strokeWidth={1.8}/>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: 'white',
        borderColor: 'rgba(15,42,35,0.08)',
        boxShadow: '0 2px 12px rgba(15,42,35,0.04)',
      }}
    >
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: 'rgba(15,42,35,0.07)' }}
      >
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-[11px] mt-0.5" style={{ color: PASTEL.inkMute }}>{subtitle}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div
      className="h-[220px] flex flex-col items-center justify-center gap-2"
      style={{ color: PASTEL.inkMute }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: PASTEL.lineSoft }}
      >
        <FileText size={17} style={{ color: PASTEL.inkMute }}/>
      </div>
      <span className="text-xs">{text || 'No data available'}</span>
    </div>
  );
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="px-3 py-2.5 rounded-xl shadow-lg border text-xs"
      style={{ background: 'white', borderColor: PASTEL.line }}
    >
      {label && (
        <div className="font-semibold mb-1.5" style={{ color: PASTEL.ink }}>{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5 last:mb-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.fill }}/>
          <span style={{ color: PASTEL.inkSoft }}>{p.name}:</span>
          <span className="font-mono font-semibold">
            {currency ? formatRupiah(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ stats, groupedSP, filterMonth }) {
  const recent = [...groupedSP]
    .sort((a, b) => (b.spDate || '').localeCompare(a.spDate || ''))
    .slice(0, 5);

  // Pie data — status
  const pieData = [
    { name: 'Open',    value: stats.open,    color: PASTEL.skyDeep },
    { name: 'Partial', value: stats.partial, color: PASTEL.butterDeep },
    { name: 'Closed',  value: stats.closed,  color: PASTEL.mintDeep },
  ].filter(d => d.value > 0);

  // Pie data — finance pending
  const financePieData = [
    { name: 'Invoice', value: stats.invPending,    color: PASTEL.peachDeep },
    { name: 'FP',      value: stats.fpPending,     color: PASTEL.lavenderDeep },
    { name: 'Submit',  value: stats.submitPending, color: PASTEL.butterDeep },
    { name: 'Kirim',   value: stats.kirimPending,  color: PASTEL.roseDeep },
  ].filter(d => d.value > 0);

  // DC bar data
  const dcData = Object.entries(stats.byDC)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const customerColors = [
    PASTEL.peachDeep, PASTEL.lavenderDeep, PASTEL.mintDeep,
    PASTEL.butterDeep, PASTEL.roseDeep,   PASTEL.skyDeep,
  ];
  const customerCountData = Object.entries(stats.byCustomer || {})
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, v], i) => ({ name, value: v.count, color: customerColors[i % customerColors.length] }));
  const customerValueData = Object.entries(stats.byCustomer || {})
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, v], i) => ({ name, value: v.value, color: customerColors[i % customerColors.length] }));

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ background: '#DCF0E6', color: '#0F5132' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: '#2A9C65' }}
              />
              Command Center
            </span>
            {filterMonth !== 'all' && (
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
              >
                {monthLabel(filterMonth)}
              </span>
            )}
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Operations Overview
          </h2>
          <p className="text-sm mt-1" style={{ color: PASTEL.inkSoft }}>
            {filterMonth === 'all' ? 'All-time · ' : ''}Monitoring SP, shipment &amp; finance progress
          </p>
        </div>

        {/* Alert chips — only shown when there are items requiring attention */}
        {(stats.overdue > 0 || stats.finPending > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {stats.overdue > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: PASTEL.rose, color: '#7A2240' }}
              >
                <AlertTriangle size={11} strokeWidth={2}/>
                {stats.overdue} Overdue
              </div>
            )}
            {stats.finPending > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: PASTEL.lavender, color: '#3D2B5C' }}
              >
                <Wallet size={11} strokeWidth={2}/>
                {stats.finPending} Finance Pending
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total SP" value={stats.totalSP}  icon={FileText}     color={PASTEL.peach}  accent={PASTEL.peachDeep}/>
        <KPICard label="Open"     value={stats.open}     icon={Package}      color={PASTEL.sky}    accent={PASTEL.skyDeep}/>
        <KPICard label="Partial"  value={stats.partial}  icon={Clock}        color={PASTEL.butter} accent={PASTEL.butterDeep}/>
        <KPICard label="Closed"   value={stats.closed}   icon={CheckCircle2} color={PASTEL.mint}   accent={PASTEL.mintDeep}/>
      </div>

      {/* ── Finance summary row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FinancialCard label="Total Transaksi" value={stats.totalTrx}  bg={PASTEL.lavender}/>
        <FinancialCard label="Total PPN (11%)" value={stats.totalPPN}  bg={PASTEL.sky}/>
        <FinancialCard label="Grand Total"     value={stats.grandTotal} bg={PASTEL.mint} highlight/>
      </div>

      {/* ── Charts: Status · Finance · DC ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <ChartCard title="Status Distribution" subtitle="SP breakdown by order status">
          {pieData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={52} outerRadius={82}
                    paddingAngle={3} dataKey="value"
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Pie>
                  <Tooltip content={<CustomTooltip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }}/>
                    <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                    <span className="font-mono font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard title="Finance Pending" subtitle="Outstanding document checklist">
          {financePieData.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: PASTEL.mint }}
              >
                <CheckCircle2 size={22} style={{ color: PASTEL.mintDeep }}/>
              </div>
              <div className="text-sm font-medium" style={{ color: PASTEL.inkSoft }}>
                All documents complete
              </div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={financePieData} cx="50%" cy="50%"
                    innerRadius={52} outerRadius={82}
                    paddingAngle={3} dataKey="value"
                  >
                    {financePieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Pie>
                  <Tooltip content={<CustomTooltip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-2">
                {financePieData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }}/>
                    <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                    <span className="font-mono font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard title="Orders by DC" subtitle="Distribution center breakdown">
          {dcData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={dcData} layout="vertical"
                margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} horizontal={false}/>
                <XAxis type="number" stroke={PASTEL.inkMute} fontSize={10} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" stroke={PASTEL.inkSoft} fontSize={11} width={72} tickLine={false} axisLine={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="value" fill={PASTEL.peachDeep} radius={[0, 6, 6, 0]} barSize={16}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

      {/* ── Customer charts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="Orders by Customer" subtitle="SP count per customer">
          {customerCountData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={customerCountData}
                margin={{ left: 0, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} vertical={false}/>
                <XAxis dataKey="name" stroke={PASTEL.inkSoft} fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke={PASTEL.inkMute} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="value" fill={PASTEL.lavenderDeep} radius={[6, 6, 0, 0]} barSize={40}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue by Customer" subtitle="Grand total breakdown per customer">
          {customerValueData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={customerValueData} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    paddingAngle={3} dataKey="value"
                  >
                    {customerValueData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Pie>
                  <Tooltip content={<CustomTooltip currency/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {customerValueData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }}/>
                    <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                    <span className="font-numeric font-bold">{formatRupiahShort(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

      </div>

      {/* ── Monthly trend — full width ───────────────────────────────────────── */}
      <ChartCard
        title="Monthly Transaction Trend"
        subtitle="Total transaksi &amp; grand total trend per month"
      >
        {stats.monthly.length === 0 ? (
          <EmptyChart text="No monthly data available"/>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={stats.monthly}
              margin={{ left: 0, right: 12, top: 8, bottom: 8 }}
            >
              <defs>
                <linearGradient id="grad-trx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={PASTEL.lavenderDeep} stopOpacity={0.4}/>
                  <stop offset="100%" stopColor={PASTEL.lavenderDeep} stopOpacity={0.04}/>
                </linearGradient>
                <linearGradient id="grad-grand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={PASTEL.mintDeep} stopOpacity={0.4}/>
                  <stop offset="100%" stopColor={PASTEL.mintDeep} stopOpacity={0.04}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} vertical={false}/>
              <XAxis dataKey="label" stroke={PASTEL.inkMute} fontSize={11} tickLine={false} axisLine={false}/>
              <YAxis
                stroke={PASTEL.inkMute} fontSize={10}
                tickFormatter={formatRupiahShort}
                tickLine={false} axisLine={false} width={76}
              />
              <Tooltip content={<CustomTooltip currency/>}/>
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 12, color: PASTEL.inkSoft }}
              />
              <Area
                type="monotone" dataKey="transaksi" name="Total Transaksi"
                stroke={PASTEL.lavenderDeep} fill="url(#grad-trx)" strokeWidth={2}
              />
              <Area
                type="monotone" dataKey="grandTotal" name="Grand Total"
                stroke={PASTEL.mintDeep} fill="url(#grad-grand)" strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Alert cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AlertCard
          label="Outstanding QTY"
          value={formatNumber(stats.outstandingQty)}
          sub="Units pending shipment"
          icon={Truck}
          bg={PASTEL.peach}
          accent={PASTEL.peachDeep}
        />
        <AlertCard
          label="Overdue SP"
          value={stats.overdue}
          sub="Passed deadline"
          icon={AlertTriangle}
          bg={stats.overdue > 0 ? PASTEL.rose : PASTEL.lineSoft}
          accent={stats.overdue > 0 ? PASTEL.roseDeep : PASTEL.inkMute}
        />
        <AlertCard
          label="Finance Pending"
          value={stats.finPending}
          sub="Items to process"
          icon={Wallet}
          bg={PASTEL.lavender}
          accent={PASTEL.lavenderDeep}
        />
      </div>

      {/* ── Recent SP ────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'white',
          borderColor: 'rgba(15,42,35,0.08)',
          boxShadow: '0 2px 12px rgba(15,42,35,0.04)',
        }}
      >
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: 'rgba(15,42,35,0.07)' }}
        >
          <h3 className="text-[13px] font-semibold">Recent Activity</h3>
          <p className="text-[11px] mt-0.5" style={{ color: PASTEL.inkMute }}>5 most recent SP entries</p>
        </div>
        <div className="divide-y" style={{ borderColor: 'rgba(15,42,35,0.07)' }}>
          {recent.length === 0 && (
            <div className="px-5 py-10 text-center text-sm" style={{ color: PASTEL.inkMute }}>
              No SP data available yet
            </div>
          )}
          {recent.map(g => (
            <div
              key={g.spNo}
              className="px-5 py-3.5 flex items-center gap-4 transition-colors"
              style={{ background: 'white' }}
              onMouseEnter={e => { e.currentTarget.style.background = PASTEL.lineSoft; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
            >
              <StatusBadge status={g.status} overdue={g.isOverdue}/>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-semibold">{g.spNo}</div>
                <div className="text-[11px] mt-0.5 truncate" style={{ color: PASTEL.inkMute }}>
                  {g.itemCount} {g.itemCount > 1 ? 'items' : 'item'}
                  {g.customer ? ` · ${g.customer}` : ''}
                  {g.dc ? ` · ${g.dc}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold font-numeric">{formatRupiah(g.grandTotal)}</div>
                <div className="text-[11px] font-mono mt-0.5" style={{ color: PASTEL.inkMute }}>
                  {formatDateID(g.spDate)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
