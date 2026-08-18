// src/modules/logistics/StorbitDashboardPage.jsx
// Dashboard Storbit — Shipping Manifest + Warehouse dalam satu halaman.
//
// SUMBER ANGKA: RPC get_storbit_dashboard_stats (satu panggilan untuk SELURUH
// kartu) + get_storbit_sp_drilldown / get_storbit_stock_drilldown untuk daftar
// baris di balik kartu yang diklik. NOL agregasi di sisi client — angka kartu
// dan isi tabel lahir dari CTE + WHERE yang sama di SQL, jadi mustahil drift.
//
// FONT: mockup menulis 'Cormorant Garamond' / 'Lora', tapi kedua nama itu tak
// dimuat di mana pun di project (index.html cuma Montserrat/Inter/IBM Plex
// Mono). Yang dipakai di sini adalah family ter-namespace 'Storbit Display' /
// 'Storbit Text' dari salesOrderDetail.module.css — .ttf YANG SAMA (aset lokal,
// nol request jaringan), sudah dipakai halaman Detail SP. Ini satu-satunya
// penyimpangan dari kode mockup, justru supaya hasil visualnya persis.
//
// Kartu KPI SENGAJA beririsan (shipped ∩ delivered_belum_btb di status SAMPAI)
// — persentase "% dari total SP" karenanya tidak berjumlah 100%. Yang mutually
// exclusive adalah donut (DONUT_STATUS_SLICES, 6 slice = persis total_sp).

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, Truck, PackageCheck, FileCheck2, Receipt, XCircle,
  AlertOctagon, Clock, AlertTriangle, PackageX, Boxes, ChevronRight,
  Search, RotateCcw, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import {
  getStorbitDashboardStats, getStorbitSpDrilldown, getStorbitStockDrilldown,
} from '../../lib/db';
import { STATUS_GROUP_LABELS, DONUT_STATUS_SLICES } from '../../lib/spStatusConstants';
import './salesOrderDetail.module.css';   // @font-face 'Storbit Display' / 'Storbit Text'

/* ---------- tokens (verbatim dari mockup) ---------- */
const C = {
  purple: '#5b3fa0',
  purpleDeep: '#4a3585',
  purpleSoft: '#EFECF6',
  purpleBorder: '#D6CFE7',
  orange: '#82480F',
  orangeSoft: '#FBF1E9',
  orangeBorder: '#EAD3BD',
  bg: '#EEF1F6',
  card: '#FFFFFF',
  ink: '#201f1d',
  muted: 'rgba(32,31,29,0.60)',
  faint: 'rgba(32,31,29,0.42)',
  divider: 'rgba(32,31,29,0.16)',
};

const heading = { fontFamily: "'Storbit Display', 'Cormorant Garamond', Georgia, serif" };
const body    = { fontFamily: "'Storbit Text', Lora, Georgia, serif" };
const mono    = { fontFamily: "'IBM Plex Mono', monospace" };

/* ---------- konfigurasi kartu ---------- */
const MANIFEST_CARDS = [
  { key: 'pending_open',        icon: ClipboardList, desc: 'Belum dikirim — draft s/d dikemas' },
  { key: 'shipped',             icon: Truck,         desc: 'Dalam perjalanan / sudah sampai' },
  { key: 'delivered_belum_btb', icon: PackageCheck,  desc: 'Barang sampai, BTB belum terbit' },
  { key: 'btb_terbit',          icon: FileCheck2,    desc: 'BTB terbit, invoice belum dibuat', emphasize: true },
  { key: 'finance',             icon: Receipt,       desc: 'Sudah masuk tahap invoice' },
  { key: 'cancelled',           icon: XCircle,       desc: 'SP dibatalkan' },
];

const EXPIRY_CARDS = [
  { key: 'expired',           icon: AlertOctagon, desc: 'Belum dikirim, tenggat sudah lewat' },
  { key: 'mendekati_expired', icon: Clock,        desc: 'Belum dikirim, tenggat bulan ini' },
];

const WAREHOUSE_CARDS = [
  { key: 'danger_stock',    icon: AlertTriangle, label: 'Danger Stock',    desc: 'Stok di bawah reorder point' },
  { key: 'zero_stock',      icon: PackageX,      label: 'Stok Kosong',     desc: 'Tersedia nol atau minus' },
  { key: 'rop_belum_diisi', icon: Boxes,         label: 'ROP Belum Diisi', desc: 'Produk tanpa reorder point' },
];

const SP_TYPE_OPTIONS = [
  { value: '',         label: 'Semua tipe' },
  { value: 'semester', label: 'Semester' },
  { value: 'tahunan',  label: 'Tahunan' },
  { value: 'project',  label: 'Project' },
];

/* ---------- helpers ---------- */
const nf = (n) => Number(n || 0).toLocaleString('id-ID');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const labelOf = (key) => STATUS_GROUP_LABELS[key] || key;

/* ---------- komponen (struktur & style verbatim dari mockup) ---------- */
function Kicker({ children }) {
  return (
    <div style={{ ...body, fontSize: 10.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.purple, fontWeight: 600, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function KpiCard({ item, active, onClick, warn, totalForPct }) {
  const pct = totalForPct ? Math.min(100, Math.round((item.value / totalForPct) * 100)) : 0;
  const accent = warn ? C.orange : C.purple;
  const accentSoft = warn ? C.orangeSoft : C.purpleSoft;
  const Icon = item.icon;
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', cursor: 'pointer', background: C.card,
      border: `1px solid ${active ? accent : C.divider}`, borderRadius: 4,
      padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: active ? `0 0 0 1px ${accent}` : 'none',
      transition: 'border-color 120ms ease', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...body, fontSize: 11.5, color: C.muted, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.label}
          </div>
          <div style={{ ...heading, fontWeight: 600, fontSize: item.emphasize ? 40 : 30, lineHeight: 1, color: warn && item.value > 0 ? C.orange : C.ink }}>
            {item.value.toLocaleString('id-ID')}
          </div>
        </div>
        <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 4, background: accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={accent} strokeWidth={1.75} />
        </div>
      </div>
      <div style={{ ...body, fontSize: 11, color: C.faint }}>{item.desc}</div>
      {!warn && (
        <div style={{ height: 3, background: C.purpleSoft, borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: C.purple, borderRadius: 2 }} />
        </div>
      )}
      {!warn && <div style={{ ...mono, fontSize: 9.5, color: C.faint }}>{pct}% dari total SP</div>}
    </button>
  );
}

// kind 'product' SENGAJA 4 kolom (tanpa DC): products bukan entitas per-DC dan
// satu produk bisa punya stok di beberapa gudang — kolom itu cuma akan berisi
// tebakan. Menyimpang sadar dari 5 kolom mockup (keputusan 18 Agu 2026).
function DrillTable({ title, rows, kind, loading }) {
  const cols = kind === 'product'
    ? ['SKU', 'Produk', 'Tersedia', 'ROP']
    : ['No SP', 'Customer', 'DC', 'Tanggal', 'Status'];
  const td = { padding: '10px 16px', borderBottom: `1px solid ${C.divider}` };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ ...heading, fontWeight: 600, fontSize: 17 }}>{title}</div>
        <div style={{ ...mono, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
          {loading ? 'Memuat…' : kind === 'product' ? `${rows.length} produk` : `${rows.length} SP ditampilkan`}
        </div>
      </div>
      {!loading && rows.length === 0 ? (
        <div style={{ ...body, padding: '28px 16px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
          Tidak ada data dalam kategori ini.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{cols.map((h) => (
              <th key={h} style={{ ...body, textAlign: 'left', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.faint, padding: '8px 16px', borderBottom: `1px solid ${C.divider}` }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {kind === 'product'
                ? rows.map((r, i) => (
                    <tr key={`${r.sku}-${i}`}>
                      <td style={{ ...mono, fontSize: 12, ...td }}>{r.sku || '—'}</td>
                      <td style={{ ...body, fontSize: 13, ...td }}>{r.product_name || '—'}</td>
                      <td style={{ ...mono, fontSize: 12.5, ...td, textAlign: 'right' }}>{nf(r.available)}</td>
                      <td style={{ ...body, fontSize: 12.5, ...td, color: r.reorder_point == null ? C.orange : C.ink }}>
                        {r.reorder_point == null ? 'Belum diisi' : nf(r.reorder_point)}
                      </td>
                    </tr>
                  ))
                : rows.map((r, i) => (
                    <tr key={`${r.sp_no}-${i}`}>
                      <td style={{ ...mono, fontSize: 12.5, ...td, color: C.purpleDeep }}>{r.sp_no}</td>
                      <td style={{ ...body, fontSize: 13, ...td }}>{r.customer_name || '—'}</td>
                      <td style={{ ...body, fontSize: 12.5, ...td, color: C.muted }}>{r.dc_nama || '—'}</td>
                      <td style={{ ...mono, fontSize: 12, ...td }}>{fmtDate(r.sp_date)}</td>
                      <td style={{ ...body, fontSize: 12.5, ...td }}>{r.status}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Donut({ data, size = 148, thickness = 20, centerValue, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // Offset tiap slice dihitung dari jumlah slice SEBELUMNYA — sengaja tanpa
  // akumulator yang di-reassign di dalam map (melanggar react-hooks/immutability:
  // mutasi variabel luar saat render). n = 6, jadi O(n²) tak berarti apa-apa.
  const segments = data.map((d, i) => {
    const before = data.slice(0, i).reduce((s, x) => s + x.value, 0);
    return {
      ...d,
      dash:   (total ? d.value / total : 0) * circumference,
      offset: (total ? before  / total : 0) * circumference,
    };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={C.purpleSoft} strokeWidth={thickness} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((d) => (
          <circle key={d.key} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={d.color}
            strokeWidth={thickness} strokeDasharray={`${d.dash} ${circumference - d.dash}`} strokeDashoffset={-d.offset} />
        ))}
      </g>
      <text x="50%" y="46%" textAnchor="middle" style={{ ...heading, fontWeight: 600, fontSize: 25, fill: C.ink }}>{centerValue}</text>
      <text x="50%" y="60%" textAnchor="middle" style={{ ...body, fontSize: 10, fill: C.faint }}>{centerLabel}</text>
    </svg>
  );
}

function DonutCard({ title, data, centerValue, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4, padding: 20, display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
      <Donut data={data} centerValue={centerValue} centerLabel={centerLabel} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ ...heading, fontWeight: 600, fontSize: 17, marginBottom: 12 }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {data.map((d) => {
            const pct = total ? Math.round((d.value / total) * 100) : 0;
            return (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                <span style={{ ...body, fontSize: 12.5, color: C.ink, flex: 1 }}>{d.label}</span>
                <span style={{ ...mono, fontSize: 12, color: C.muted }}>{d.value.toLocaleString('id-ID')}</span>
                <span style={{ ...mono, fontSize: 11, color: C.faint, width: 32, textAlign: 'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Numerator DAN penyebut selalu tampil bersama — cakupan data pengiriman baru
// 16,2%, jadi angka pinalti telanjang akan dibaca "aman" padahal datanya yang
// belum ada. Lihat PENALTY_METRIC_PAIR di spStatusConstants.js.
function PenaltyRiskCard({ data }) {
  const pctCovered = data.eligible ? Math.round((data.covered / data.eligible) * 100) : 0;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.orangeBorder}`, borderRadius: 4, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ ...body, fontSize: 11.5, color: C.muted, marginBottom: 3 }}>Pernah Kena Risiko Pinalti</div>
          <div style={{ ...heading, fontWeight: 600, fontSize: 30, lineHeight: 1, color: data.value > 0 ? C.orange : C.ink }}>
            {data.value}<span style={{ ...body, fontSize: 13, color: C.faint, fontWeight: 400 }}> dari {data.covered} SP</span>
          </div>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: 4, background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShieldAlert size={15} color={C.orange} strokeWidth={1.75} />
        </div>
      </div>
      <div style={{ ...body, fontSize: 11, color: C.faint }}>
        Dikirim setelah tenggat SP lewat · dari {data.covered} SP yang punya data pengiriman
      </div>
      <div style={{ ...mono, fontSize: 10, color: C.faint, borderTop: `1px solid ${C.divider}`, paddingTop: 6, marginTop: 2 }}>
        Data pengiriman baru mencakup {pctCovered}% ({data.covered} dari {data.eligible}) SP yang sudah lewat tahap kirim.
        SP lama tanpa catatan surat jalan tidak ikut terhitung di kartu ini.
      </div>
    </div>
  );
}

function Select({ label, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
      <label style={{ ...body, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.faint }}>{label}</label>
      <select value={value} onChange={onChange} style={{ ...body, fontSize: 13, padding: '8px 10px', borderRadius: 4, border: `1px solid ${C.divider}`, background: C.card, color: C.ink }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/* ---------- halaman ---------- */
export default function StorbitDashboardPage({ customers = [], showToast }) {
  const { activeCompanyId } = useAuth();

  const [customerId, setCustomerId] = useState('');
  const [spType, setSpType]         = useState('');

  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [spCat, setSpCat]               = useState('btb_terbit');
  const [spRows, setSpRows]             = useState([]);
  const [spRowsLoading, setSpRowsLoad]  = useState(false);

  const [whCat, setWhCat]               = useState('danger_stock');
  const [whRows, setWhRows]             = useState([]);
  const [whRowsLoading, setWhRowsLoad]  = useState(false);

  const notifyError = useCallback((msg) => {
    setError(msg);
    showToast?.(msg, 'error');
  }, [showToast]);

  // ── Angka kartu — satu panggilan untuk seluruh dashboard ──────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await getStorbitDashboardStats(customerId || null, spType || null, activeCompanyId || null);
      if (!alive) return;
      if (err) {
        setStats(null);
        notifyError('Gagal memuat dashboard: ' + (err.message || 'unknown'));
      } else {
        setStats(data || null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [customerId, spType, activeCompanyId, notifyError]);

  // ── Drill-down SP — ikut kategori aktif + filter yang sama ────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setSpRowsLoad(true);
      const { data, error: err } = await getStorbitSpDrilldown(spCat, {
        customerId: customerId || null,
        priceCategory: spType || null,
        companyId: activeCompanyId || null,
      });
      if (!alive) return;
      if (err) {
        setSpRows([]);
        notifyError('Gagal memuat daftar SP: ' + (err.message || 'unknown'));
      } else {
        setSpRows(data);
      }
      setSpRowsLoad(false);
    })();
    return () => { alive = false; };
  }, [spCat, customerId, spType, activeCompanyId, notifyError]);

  // ── Drill-down produk — hanya ikut entitas aktif (filter SP tak berlaku) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      setWhRowsLoad(true);
      const { data, error: err } = await getStorbitStockDrilldown(whCat, { companyId: activeCompanyId || null });
      if (!alive) return;
      if (err) {
        setWhRows([]);
        notifyError('Gagal memuat daftar produk: ' + (err.message || 'unknown'));
      } else {
        setWhRows(data);
      }
      setWhRowsLoad(false);
    })();
    return () => { alive = false; };
  }, [whCat, activeCompanyId, notifyError]);

  // useMemo (bukan ekspresi polos): keduanya jadi dependency useMemo di bawah,
  // dan `|| {}` menghasilkan objek baru tiap render -> memo tak pernah kena.
  const m = useMemo(() => stats?.manifest  || {}, [stats]);
  const w = useMemo(() => stats?.warehouse || {}, [stats]);
  const totalSp = Number(m.total_sp) || 0;

  const donutData = useMemo(
    () => DONUT_STATUS_SLICES.map((s) => ({ ...s, value: Number(m[s.key]) || 0 })),
    [m],
  );

  const stockDonut = useMemo(() => {
    const totalProduk = Number(w.total_produk) || 0;
    const kosong = Number(w.zero_stock) || 0;
    return [
      { key: 'tersedia', label: 'Ada Stok',    value: Math.max(totalProduk - kosong, 0), color: '#9ED9CB' },
      { key: 'kosong',   label: 'Stok Kosong', value: kosong,                            color: '#EFAEAE' },
    ];
  }, [w]);

  const customerOptions = useMemo(() => ([
    { value: '', label: 'Semua customer' },
    ...customers
      .filter((c) => c?.id)
      .map((c) => ({ value: c.id, label: c.name || '(Tanpa nama)' })),
  ]), [customers]);

  const resetFilters = useCallback(() => { setCustomerId(''); setSpType(''); }, []);

  const spCardValue = (key) => Number(m[key]) || 0;

  return (
    <div style={{ ...body, color: C.ink, maxWidth: 1240 }}>

      {/* 1 — Breadcrumb */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 5, ...body, fontSize: 12, color: C.muted, marginBottom: 8 }}>
        <span>Logistics</span>
        <ChevronRight size={12} />
        <span style={{ color: C.purple, fontWeight: 600 }}>Dashboard Storbit</span>
      </nav>

      {/* 2 — Header + timestamp */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ ...heading, fontWeight: 600, fontSize: 34, lineHeight: 1.1, margin: 0, color: C.ink }}>
            Dashboard Storbit
          </h1>
          <p style={{ ...body, fontSize: 13, color: C.muted, margin: '6px 0 0' }}>
            Ringkasan pesanan dan kondisi stok gudang Storbit
          </p>
        </div>
        <div style={{ ...mono, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
          {loading ? 'Memuat…' : `Diperbarui ${fmtStamp(stats?.generated_at)}`}
        </div>
      </div>

      {/* 3 — Filter bar */}
      <div style={{ background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4, padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 22 }}>
        <Select label="Customer" value={customerId} options={customerOptions} onChange={(e) => setCustomerId(e.target.value)} />
        <Select label="Tipe SP"  value={spType}     options={SP_TYPE_OPTIONS}  onChange={(e) => setSpType(e.target.value)} />
        <button onClick={resetFilters} style={{
          ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 4, border: `1px solid ${C.divider}`,
          background: C.card, color: C.muted, cursor: 'pointer',
        }}>
          <RotateCcw size={13} strokeWidth={1.75} /> Reset
        </button>
        <div style={{ flex: 1, minWidth: 180, display: 'flex', justifyContent: 'flex-end' }}>
          {/* Kosmetik di v1 — pencarian nomor SP belum difungsikan. */}
          <div style={{ position: 'relative', minWidth: 200 }}>
            <Search size={13} strokeWidth={1.75} color={C.faint} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              disabled
              placeholder="Cari nomor SP… (segera)"
              style={{ ...body, fontSize: 13, width: '100%', padding: '8px 10px 8px 30px', borderRadius: 4, border: `1px solid ${C.divider}`, background: C.bg, color: C.faint }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...body, fontSize: 12.5, color: C.orange, background: C.orangeSoft, border: `1px solid ${C.orangeBorder}`, borderRadius: 4, padding: '10px 14px', marginBottom: 18 }}>
          {error}
        </div>
      )}

      {/* 4 — Kicker Shipping Manifest */}
      <div style={{ marginBottom: 14 }}>
        <Kicker>Shipping Manifest</Kicker>
        <div style={{ ...body, fontSize: 12.5, color: C.muted }}>
          {loading ? 'Memuat…' : `${nf(totalSp)} SP total di entitas ini`}
        </div>
      </div>

      {/* 5 — Donut distribusi status */}
      <DonutCard
        title="Distribusi Status SP"
        data={donutData}
        centerValue={nf(totalSp)}
        centerLabel="Total SP"
      />

      {/* 6 — Grid 6 kartu KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
        {MANIFEST_CARDS.map((c) => (
          <KpiCard
            key={c.key}
            item={{ ...c, label: labelOf(c.key), value: spCardValue(c.key) }}
            active={spCat === c.key}
            totalForPct={totalSp}
            onClick={() => setSpCat(c.key)}
          />
        ))}
      </div>

      {/* 7 — Perlu Perhatian · Tenggat */}
      <div style={{ ...body, fontSize: 11, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.orange, fontWeight: 600, marginBottom: 10 }}>
        Perlu Perhatian · Tenggat
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
        {EXPIRY_CARDS.map((c) => (
          <KpiCard
            key={c.key}
            warn
            item={{ ...c, label: labelOf(c.key), value: spCardValue(c.key) }}
            active={spCat === c.key}
            totalForPct={totalSp}
            onClick={() => setSpCat(c.key)}
          />
        ))}
      </div>

      {/* 8 — Kartu risiko pinalti (numerator + penyebut) */}
      <div style={{ marginBottom: 22 }}>
        <PenaltyRiskCard data={{
          value:    Number(m.pernah_risiko_pinalti)  || 0,
          covered:  Number(m.dispatch_data_tersedia) || 0,
          eligible: Number(m.dispatch_eligible)      || 0,
        }} />
      </div>

      {/* 9 — Tabel drill-down SP */}
      <div style={{ marginBottom: 34 }}>
        <DrillTable
          title={labelOf(spCat)}
          rows={spRows}
          kind="sp"
          loading={spRowsLoading}
        />
      </div>

      {/* 10 — Kicker Warehouse */}
      <div style={{ marginBottom: 14 }}>
        <Kicker>Warehouse</Kicker>
        <div style={{ ...body, fontSize: 12.5, color: C.muted }}>
          {loading ? 'Memuat…' : `${nf(w.total_produk)} produk aktif`}
        </div>
      </div>

      {/* 11 — Donut kesehatan stok */}
      <DonutCard
        title="Kesehatan Stok"
        data={stockDonut}
        centerValue={nf(w.total_produk)}
        centerLabel="Produk aktif"
      />

      {/* 12 — Grid 3 kartu warehouse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
        {WAREHOUSE_CARDS.map((c) => (
          <KpiCard
            key={c.key}
            warn
            item={{ ...c, value: Number(w[c.key]) || 0 }}
            active={whCat === c.key}
            totalForPct={Number(w.total_produk) || 0}
            onClick={() => setWhCat(c.key)}
          />
        ))}
      </div>

      {/* 13 — Tabel drill-down produk */}
      <DrillTable
        title={WAREHOUSE_CARDS.find((c) => c.key === whCat)?.label || 'Produk'}
        rows={whRows}
        kind="product"
        loading={whRowsLoading}
      />
    </div>
  );
}
