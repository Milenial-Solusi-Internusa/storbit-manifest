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

import React from 'react';
import {
  FileText, Package, Clock, CheckCircle2,
  Truck, AlertTriangle, Wallet,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts';

// ─── PASTEL ──────────────────────────────────────────────────────────────────
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
    <div className="rounded-3xl p-5 border transition-all hover:shadow-lg" style={{ background: 'white', borderColor: PASTEL.line }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>{label}</div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color }}>
          <Icon size={16} style={{ color: accent }}/>
        </div>
      </div>
      <div className="font-numeric text-4xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Local copy. App.jsx retains its own copy (used by Manifest, SPSidePanel, ShipmentPage).
function StatusBadge({ status, overdue, large }) {
  const styles = {
    Open: { bg: PASTEL.sky, color: '#1F4D6B' },
    Partial: { bg: PASTEL.butter, color: '#7A5B12' },
    Closed: { bg: PASTEL.mint, color: '#1B5739' },
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

// ─── Dashboard-exclusive sub-components (moved from App.jsx) ─────────────────

function FinancialCard({ label, value, bg, highlight }) {
  return (
    <div className="rounded-3xl p-6 border transition-all" style={{
      background: highlight ? `linear-gradient(135deg, ${bg}, white)` : 'white',
      borderColor: PASTEL.line,
      ...(highlight && { boxShadow: `0 0 0 1px ${PASTEL.mintDeep}40` })
    }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ background: bg }}/>
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: PASTEL.inkMute }}>{label}</div>
      </div>
      <div className="font-numeric text-3xl font-bold tracking-tight">{formatRupiah(value)}</div>
    </div>
  );
}

function AlertCard({ label, value, sub, icon: Icon, bg, accent }) {
  return (
    <div className="rounded-3xl p-5 border" style={{ background: bg, borderColor: 'transparent' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold opacity-80" style={{ color: PASTEL.ink }}>{label}</div>
          <div className="font-numeric text-3xl font-bold mt-1.5" style={{ color: PASTEL.ink }}>{value}</div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <Icon size={18} style={{ color: accent }}/>
        </div>
      </div>
      <div className="text-xs font-medium opacity-75" style={{ color: PASTEL.ink }}>{sub}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl p-5 border" style={{ background: 'white', borderColor: PASTEL.line }}>
      <div className="mb-3">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: PASTEL.inkMute }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: PASTEL.inkMute }}>
      {text}
    </div>
  );
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl shadow-lg border text-xs" style={{ background: 'white', borderColor: PASTEL.line }}>
      {label && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }}/>
          <span style={{ color: PASTEL.inkSoft }}>{p.name}:</span>
          <span className="font-mono font-semibold">{currency ? formatRupiah(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ stats, groupedSP, filterMonth }) {
  const recent = [...groupedSP].sort((a,b) => (b.spDate||'').localeCompare(a.spDate||'')).slice(0,5);

  // Pie data for status
  const pieData = [
    { name: 'Open', value: stats.open, color: PASTEL.skyDeep },
    { name: 'Partial', value: stats.partial, color: PASTEL.butterDeep },
    { name: 'Closed', value: stats.closed, color: PASTEL.mintDeep },
  ].filter(d => d.value > 0);

  // Pie data for finance
  const financePieData = [
    { name: 'Invoice Pending', value: stats.invPending, color: PASTEL.peachDeep },
    { name: 'FP Pending', value: stats.fpPending, color: PASTEL.lavenderDeep },
    { name: 'Submit Pending', value: stats.submitPending, color: PASTEL.butterDeep },
    { name: 'Kirim Pending', value: stats.kirimPending, color: PASTEL.roseDeep },
  ].filter(d => d.value > 0);

  // DC bar data
  const dcData = Object.entries(stats.byDC).sort((a,b) => b[1]-a[1]).map(([name, value]) => ({ name, value }));

  const customerColors = [PASTEL.peachDeep, PASTEL.lavenderDeep, PASTEL.mintDeep, PASTEL.butterDeep, PASTEL.roseDeep, PASTEL.skyDeep];
  const customerCountData = Object.entries(stats.byCustomer || {})
    .sort((a,b) => b[1].count - a[1].count)
    .map(([name, v], i) => ({ name, value: v.count, color: customerColors[i % customerColors.length] }));
  const customerValueData = Object.entries(stats.byCustomer || {})
    .sort((a,b) => b[1].value - a[1].value)
    .map(([name, v], i) => ({ name, value: v.value, color: customerColors[i % customerColors.length] }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Operations Overview</h2>
          <p className="text-sm mt-1.5" style={{ color: PASTEL.inkSoft }}>
            {filterMonth === 'all' ? 'Showing all-time data' : `Showing ${monthLabel(filterMonth)}`} · monitoring SP, shipment, finance
          </p>
        </div>
      </div>

      {/* TOP KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total SP" value={stats.totalSP} icon={FileText} color={PASTEL.peach} accent={PASTEL.peachDeep}/>
        <KPICard label="Open" value={stats.open} icon={Package} color={PASTEL.sky} accent={PASTEL.skyDeep}/>
        <KPICard label="Partial" value={stats.partial} icon={Clock} color={PASTEL.butter} accent={PASTEL.butterDeep}/>
        <KPICard label="Closed" value={stats.closed} icon={CheckCircle2} color={PASTEL.mint} accent={PASTEL.mintDeep}/>
      </div>

      {/* Financial cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FinancialCard label="Total Transaksi" value={stats.totalTrx} bg={PASTEL.lavender}/>
        <FinancialCard label="Total PPN (11%)" value={stats.totalPPN} bg={PASTEL.sky}/>
        <FinancialCard label="Grand Total" value={stats.grandTotal} bg={PASTEL.mint} highlight/>
      </div>

      {/* Charts row 1: Pie status + Pie finance + DC bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Status Distribution" subtitle="Breakdown SP berdasarkan status">
          {pieData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }}/>
                <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                <span className="font-mono font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Finance Pending" subtitle="Dokumen yang masih outstanding">
          {financePieData.length === 0 ? (
            <div className="h-[240px] flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-2" style={{ background: PASTEL.mint }}>
                <CheckCircle2 size={24} style={{ color: PASTEL.mintDeep }}/>
              </div>
              <div className="text-sm" style={{ color: PASTEL.inkSoft }}>All documents complete ✨</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={financePieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {financePieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {financePieData.map(d => (
              <div key={d.name} className="flex items-center gap-1 text-[11px]">
                <div className="w-2 h-2 rounded-full" style={{ background: d.color }}/>
                <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                <span className="font-mono font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Order by DC" subtitle="Distribusi order per distribution center">
          {dcData.length === 0 ? (
            <EmptyChart text="No data"/>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dcData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} horizontal={false}/>
                <XAxis type="number" stroke={PASTEL.inkMute} fontSize={10} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" stroke={PASTEL.inkSoft} fontSize={10} width={80} tickLine={false} axisLine={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="value" fill={PASTEL.peachDeep} radius={[0, 8, 8, 0]} barSize={18}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Customer charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Order by Customer" subtitle="Jumlah SP per customer">
          {customerCountData.length === 0 ? <EmptyChart text="No data"/> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={customerCountData} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} vertical={false}/>
                <XAxis dataKey="name" stroke={PASTEL.inkSoft} fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke={PASTEL.inkMute} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="value" fill={PASTEL.lavenderDeep} radius={[8, 8, 0, 0]} barSize={48}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue by Customer" subtitle="Total grand total per customer">
          {customerValueData.length === 0 ? <EmptyChart text="No data"/> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={customerValueData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                  {customerValueData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                </Pie>
                <Tooltip content={<CustomTooltip currency/>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {customerValueData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }}/>
                <span style={{ color: PASTEL.inkSoft }}>{d.name}</span>
                <span className="font-numeric font-bold">{formatRupiahShort(d.value)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Monthly trend chart - full width */}
      <ChartCard title="Monthly Transaction Trend" subtitle="Trend nilai transaksi & PPN per bulan">
        {stats.monthly.length === 0 ? <EmptyChart text="No data"/> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats.monthly} margin={{ left: 0, right: 10, top: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="grad-trx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PASTEL.lavenderDeep} stopOpacity={0.45}/>
                  <stop offset="100%" stopColor={PASTEL.lavenderDeep} stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="grad-grand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PASTEL.mintDeep} stopOpacity={0.45}/>
                  <stop offset="100%" stopColor={PASTEL.mintDeep} stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={PASTEL.line} vertical={false}/>
              <XAxis dataKey="label" stroke={PASTEL.inkMute} fontSize={11} tickLine={false} axisLine={false}/>
              <YAxis stroke={PASTEL.inkMute} fontSize={10} tickFormatter={formatRupiahShort} tickLine={false} axisLine={false}/>
              <Tooltip content={<CustomTooltip currency/>}/>
              <Area type="monotone" dataKey="transaksi" name="Total Transaksi" stroke={PASTEL.lavenderDeep} fillOpacity={1} fill="url(#grad-trx)" strokeWidth={2.5}/>
              <Area type="monotone" dataKey="grandTotal" name="Grand Total" stroke={PASTEL.mintDeep} fillOpacity={1} fill="url(#grad-grand)" strokeWidth={2.5}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Alerts & recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AlertCard
          label="Outstanding QTY" value={formatNumber(stats.outstandingQty)} sub="units belum terkirim"
          icon={Truck} bg={PASTEL.peach} accent={PASTEL.peachDeep}
        />
        <AlertCard
          label="Overdue SP" value={stats.overdue} sub="melewati deadline"
          icon={AlertTriangle}
          bg={stats.overdue > 0 ? PASTEL.rose : PASTEL.line}
          accent={stats.overdue > 0 ? PASTEL.roseDeep : PASTEL.inkMute}
        />
        <AlertCard
          label="Finance Pending" value={stats.finPending} sub="items perlu di-process"
          icon={Wallet} bg={PASTEL.lavender} accent={PASTEL.lavenderDeep}
        />
      </div>

      {/* Recent SP */}
      <div className="rounded-3xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: PASTEL.line }}>
          <div>
            <h3 className="font-display text-xl font-semibold">Recent SP</h3>
            <p className="text-xs mt-0.5" style={{ color: PASTEL.inkMute }}>5 SP terakhir</p>
          </div>
        </div>
        <div className="divide-y" style={{ borderColor: PASTEL.line }}>
          {recent.length === 0 && <div className="p-8 text-center text-sm" style={{ color: PASTEL.inkMute }}>Belum ada data</div>}
          {recent.map(g => (
            <div key={g.spNo} className="px-6 py-4 flex items-center gap-4 transition-colors hover:bg-opacity-50" style={{ background: 'white' }}>
              <StatusBadge status={g.status} overdue={g.isOverdue}/>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-medium">SP-{g.spNo}</div>
                <div className="text-xs truncate" style={{ color: PASTEL.inkMute }}>
                  {g.itemCount} {g.itemCount > 1 ? 'items' : 'item'} · {g.dc || 'No DC'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{formatRupiah(g.grandTotal)}</div>
                <div className="text-xs font-mono" style={{ color: PASTEL.inkMute }}>{formatDateID(g.spDate)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
