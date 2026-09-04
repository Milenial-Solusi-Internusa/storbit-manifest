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
import { pdf } from '@react-pdf/renderer';
import {
  ClipboardList, Truck, PackageCheck, FileCheck2, Receipt, XCircle,
  AlertOctagon, Clock, AlertTriangle, PackageX, Boxes, ChevronRight,
  Search, RotateCcw, ShieldAlert, Send, Wallet,
  FileSpreadsheet, FileText, X,
} from 'lucide-react';
import {
  getStorbitDashboardStats, getStorbitSpDrilldown, getStorbitStockDrilldown,
  getStorbitProductReport, getStorbitProductSpList,
  getStorbitOutstandingSummary, getStorbitTopOutstandingProducts,
} from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import StorbitReportPDF from './StorbitReportPDF';
import { STATUS_GROUP_LABELS, DONUT_STATUS_SLICES } from '../../lib/spStatusConstants';
import './salesOrderDetail.module.css';   // @font-face 'Storbit Display' / 'Storbit Text'

// Entitas SOA — HARDCODE DISENGAJA, bukan kelupaan.
//
// Versi pertama halaman ini memakai `activeCompanyId` dari AuthContext
// (= profiles.company_id user). Hasilnya SELURUH kartu menampilkan 0 walau RPC
// terbukti benar lewat SQL Editor: filter `o.company_id = scope.cid` di RPC tak
// match satu baris pun karena home company pemanggil bukan SOA. Gagalnya SENYAP
// — CTE agregat tetap mengembalikan satu baris berisi nol, jadi `error` null dan
// tak ada toast/banner yang muncul.
//
// Storbit hanya hidup di entitas SOA, dan SELURUH surface Storbit lain sudah
// pin UUID ini secara eksplisit: InputSPPage.jsx:28, SalesOrderDetailPage.jsx:36,
// PickingListDetailPage.jsx:26, DeliveryNoteDetailPage.jsx:80, db.js:634, plus
// RPC dispatch_delivery / generate_delivery_from_picking / create_invoice yang
// hardcode di body-nya. Jadi ini MENGIKUTI pola yang sudah ada, bukan
// penyimpangan baru.
//
// ⚠️ Tetap tech debt yang diketahui — TD-178 (hardcode UUID SOA). Saat TD-178
// dibereskan menyeluruh, halaman ini ikut pindah ke `activeCompanyId` +
// CompanySwitcher, DAN perlu empty-state yang menjelaskan kalau entitas aktif
// bukan SOA ("tidak ada data Storbit untuk entitas ini") — tanpa itu, bug senyap
// yang sama akan kembali.
const SOA_COMPANY_ID = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

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

// Strip nilai outstanding (TASK 3). Sublabel WAJIB ada — tiga angka ini beda
// basis pajak dan tanpa penjelasan mudah dibaca keliru sebagai satu deret yang
// bisa dijumlahkan. `ppn: false` mencetak penanda "belum termasuk PPN".
const OUTSTANDING_CARDS = [
  { key: 'kirim',   icon: Truck,  label: 'Outstanding Kirim',
    desc: 'Nilai barang yang belum dikirim', ppn: false, unit: 'SP' },
  { key: 'tagih',   icon: Send,   label: 'Outstanding Tagih',
    desc: 'Sudah ada BTB, invoice belum terbit', ppn: false, unit: 'SP' },
  { key: 'piutang', icon: Wallet, label: 'Outstanding Piutang',
    desc: 'Invoice terbit, belum lunas dibayar', ppn: true,  unit: 'invoice' },
];

// Batas baris khusus export. Layar memakai 200; export menembak jauh lebih
// tinggi supaya file tak terpotong diam-diam. Kalau hasilnya MENYENTUH angka
// ini, user diperingatkan eksplisit SEBELUM file dibuat (lihat runExport).
const EXPORT_ROW_LIMIT = 5000;

// Satu panggilan get_storbit_top_outstanding_products melayani DUA kebutuhan:
// isi combobox (seluruh produk yang pernah muncul di SP — 38 per 5 Sep 2026)
// dan tabel Top 10 (10 baris pertama; RPC-nya sudah urut nilai DESC). Satu
// sumber = daftar dropdown dan tabel mustahil melenceng satu sama lain.
const PRODUCT_FETCH_LIMIT = 1000;
const TOP_PRODUCT_ROWS = 10;

const SP_TYPE_OPTIONS = [
  { value: '',         label: 'Semua tipe' },
  { value: 'semester', label: 'Semester' },
  { value: 'tahunan',  label: 'Tahunan' },
  { value: 'project',  label: 'Project' },
];

/* ---------- helpers ---------- */
const nf = (n) => Number(n || 0).toLocaleString('id-ID');

// Rupiah penuh (tabel & tooltip) dan ringkas (kartu, supaya tak membungkus).
const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
function rpShort(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1e12) return `Rp ${(v / 1e12).toFixed(2)} T`;
  if (abs >= 1e9)  return `Rp ${(v / 1e9).toFixed(2)} M`;
  if (abs >= 1e6)  return `Rp ${(v / 1e6).toFixed(1)} jt`;
  return rp(v);
}

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

// Sel identifier (No SP / SKU) — afordansi klik yang bisa dijangkau keyboard.
// Underline baru muncul saat hover supaya tabel tetap tenang saat diam; klik di
// sel ini stopPropagation agar tidak menembak handler baris dua kali.
function IdCell({ children, onActivate }) {
  const [hover, setHover] = useState(false);
  if (!onActivate) return <>{children}</>;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onActivate(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onActivate(); }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{ cursor: 'pointer', textDecoration: hover ? 'underline' : 'none', outline: 'none' }}
    >
      {children}
    </span>
  );
}

// kind 'product' SENGAJA 4 kolom (tanpa DC): products bukan entitas per-DC dan
// satu produk bisa punya stok di beberapa gudang — kolom itu cuma akan berisi
// tebakan. Menyimpang sadar dari 5 kolom mockup (keputusan 18 Agu 2026).
function DrillTable({ title, rows, kind, loading, onRowClick }) {
  const cols = kind === 'product'
    ? ['SKU', 'Produk', 'Tersedia', 'ROP']
    : ['No SP', 'Customer', 'DC', 'Tanggal', 'Status'];
  const td = { padding: '10px 16px', borderBottom: `1px solid ${C.divider}` };
  // Pola baris clickable ditiru verbatim dari SalesOrderPage.jsx:644-648 —
  // cursor pointer + swap background on hover, tanpa warna baru (C.bg sudah ada
  // di palet mockup). Sel identifier (No SP / SKU) dibungkus span ber-handler
  // sendiri: stopPropagation + keyboard Enter/Space, sama spt :657-658 di sana.
  const rowProps = (row) => (onRowClick ? {
    onClick: () => onRowClick(row),
    style: { background: C.card, transition: 'background .1s', cursor: 'pointer' },
    onMouseEnter: (e) => { e.currentTarget.style.background = C.bg; },
    onMouseLeave: (e) => { e.currentTarget.style.background = C.card; },
  } : {});
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
                    <tr key={r.product_id || `${r.sku}-${i}`} {...rowProps(r)}>
                      <td style={{ ...mono, fontSize: 12, ...td, color: C.purpleDeep }}>
                        <IdCell onActivate={onRowClick ? () => onRowClick(r) : null}>{r.sku || '—'}</IdCell>
                      </td>
                      <td style={{ ...body, fontSize: 13, ...td }}>{r.product_name || '—'}</td>
                      <td style={{ ...mono, fontSize: 12.5, ...td, textAlign: 'right' }}>{nf(r.available)}</td>
                      <td style={{ ...body, fontSize: 12.5, ...td, color: r.reorder_point == null ? C.orange : C.ink }}>
                        {r.reorder_point == null ? 'Belum diisi' : nf(r.reorder_point)}
                      </td>
                    </tr>
                  ))
                : rows.map((r, i) => (
                    <tr key={`${r.customer_id || ''}|${r.sp_no}-${i}`} {...rowProps(r)}>
                      <td style={{ ...mono, fontSize: 12.5, ...td, color: C.purpleDeep }}>
                        <IdCell onActivate={onRowClick ? () => onRowClick(r) : null}>{r.sp_no}</IdCell>
                      </td>
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

// ── Kartu strip outstanding (TASK 3) ────────────────────────────────────────
// Bentuknya sengaja BEDA dari KpiCard: tidak bisa diklik (tak ada drill-down
// di baliknya) dan angkanya rupiah, bukan cacah. Memakai KpiCard apa adanya
// akan menjanjikan afordansi klik yang tak ada.
function OutstandingCard({ item, value, count, loading }) {
  const Icon = item.icon;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4,
      padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...body, fontSize: 11.5, color: C.muted, marginBottom: 3 }}>{item.label}</div>
          <div
            style={{ ...heading, fontWeight: 600, fontSize: 26, lineHeight: 1.1, color: C.ink }}
            title={loading ? '' : rp(value)}
          >
            {loading ? '…' : rpShort(value)}
          </div>
        </div>
        <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 4, background: C.purpleSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={C.purple} strokeWidth={1.75} />
        </div>
      </div>
      <div style={{ ...body, fontSize: 11, color: C.faint }}>{item.desc}</div>
      <div style={{ ...mono, fontSize: 9.5, color: C.faint, borderTop: `1px solid ${C.divider}`, paddingTop: 6 }}>
        {loading ? '—' : `${nf(count)} ${item.unit}`} · {item.ppn ? 'sudah termasuk PPN' : 'belum termasuk PPN'}
      </div>
    </div>
  );
}

// ── Tile ringkasan produk ───────────────────────────────────────────────────
// `warn` memakai C.orange/C.orangeSoft/C.orangeBorder — token PERSIS yang
// dipakai kartu "Lewat Tenggat Kirim" (KpiCard warn). Tidak ada warna baru.
function SummaryTile({ label, value, sub, warn }) {
  return (
    <div style={{
      background: warn ? C.orangeSoft : C.card,
      border: `1px solid ${warn ? C.orangeBorder : C.divider}`,
      borderRadius: 4, padding: '14px 14px 12px', minWidth: 0,
    }}>
      <div style={{ ...body, fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ ...heading, fontWeight: 600, fontSize: 24, lineHeight: 1.1, color: warn ? C.orange : C.ink }}>
        {value}
      </div>
      {sub ? <div style={{ ...mono, fontSize: 9.5, color: warn ? C.orange : C.faint, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

// ── Combobox produk ─────────────────────────────────────────────────────────
// Daftarnya dimuat SEKALI di mount dan disaring di klien — 38 baris, jadi
// tak ada gunanya menembak server tiap ketikan. Karena itu juga TIDAK ada
// debounce: aturan debounce 300ms di AGENTS.md menyasar input yang memicu
// query, bukan filter array in-memory.
function ProductCombobox({ products, value, onChange, loading, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = products.find((p) => p.product_id === value) || null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) =>
      (p.product_name || '').toLowerCase().includes(needle)
      || (p.code || '').toLowerCase().includes(needle));
  }, [products, q]);

  return (
    <div style={{ position: 'relative', minWidth: 320, flex: 1, maxWidth: 460 }}>
      <label style={{ ...body, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.faint, display: 'block', marginBottom: 4 }}>
        Produk
      </label>
      <div style={{ position: 'relative' }}>
        <Search size={13} strokeWidth={1.75} color={C.faint} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={open ? q : (selected ? `${selected.code || '—'} · ${selected.product_name || ''}` : '')}
          placeholder={loading ? 'Memuat produk…' : 'Cari nama atau kode produk…'}
          disabled={disabled || loading}
          onFocus={() => { setOpen(true); setQ(''); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          style={{
            ...body, fontSize: 13, width: '100%', padding: '8px 30px 8px 30px',
            borderRadius: 4, border: `1px solid ${open ? C.purple : C.divider}`,
            background: C.card, color: C.ink,
          }}
        />
        {selected && !open ? (
          <button
            type="button"
            aria-label="Kosongkan pilihan produk"
            onClick={() => { onChange(''); setQ(''); }}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}
          >
            <X size={13} color={C.faint} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4,
          maxHeight: 260, overflowY: 'auto', background: C.card,
          border: `1px solid ${C.divider}`, borderRadius: 4, boxShadow: '0 6px 18px rgba(32,31,29,0.12)',
        }}>
          {filtered.length === 0 ? (
            <div style={{ ...body, fontSize: 12.5, color: C.faint, padding: '12px 14px' }}>
              Tidak ada produk yang cocok.
            </div>
          ) : filtered.map((p) => (
            <button
              key={p.product_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(p.product_id); setOpen(false); setQ(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                background: p.product_id === value ? C.purpleSoft : C.card,
                border: 'none', borderBottom: `1px solid ${C.divider}`, padding: '9px 14px',
              }}
            >
              <div style={{ ...mono, fontSize: 11, color: C.purpleDeep }}>{p.code || '—'}</div>
              <div style={{ ...body, fontSize: 12.5, color: C.ink }}>{p.product_name || '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tabel laporan ───────────────────────────────────────────────────────────
// Sengaja komponen TERPISAH dari DrillTable, bukan menambah `kind` ke sana:
// DrillTable dipakai dua blok existing dan menyentuhnya berarti mempertaruhkan
// keduanya untuk fitur yang tak mereka pakai. Gaya visualnya ditiru, kodenya
// tidak dibagi.
function ReportTable({ title, cols, rows, loading, error, empty, onRowClick, footer }) {
  const td = { padding: '9px 14px', borderBottom: `1px solid ${C.divider}` };
  const rowProps = (row) => (onRowClick ? {
    onClick: () => onRowClick(row),
    style: { background: C.card, transition: 'background .1s', cursor: 'pointer' },
    onMouseEnter: (e) => { e.currentTarget.style.background = C.bg; },
    onMouseLeave: (e) => { e.currentTarget.style.background = C.card; },
  } : {});
  return (
    <div style={{ background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ ...heading, fontWeight: 600, fontSize: 16 }}>{title}</div>
        <div style={{ ...mono, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
          {loading ? 'Memuat…' : footer}
        </div>
      </div>
      {error ? (
        <div style={{ ...body, padding: '22px 16px', textAlign: 'center', color: C.orange, fontSize: 12.5 }}>
          {error}
        </div>
      ) : loading ? (
        <div style={{ ...body, padding: '28px 16px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
          Memuat data…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...body, padding: '28px 16px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
          {empty}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{cols.map((c) => (
              <th key={c.h} style={{ ...body, textAlign: c.a || 'left', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.faint, padding: '8px 14px', borderBottom: `1px solid ${C.divider}`, whiteSpace: 'nowrap' }}>
                {c.h}
              </th>
            ))}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.sp_no ? `${r.customer_id || ''}|${r.sp_no}` : (r.customer_id || r.product_id || i)} {...rowProps(r)}>
                  {cols.map((c) => (
                    <td key={c.h} style={{ ...(c.mono ? mono : body), fontSize: c.mono ? 12 : 12.5, ...td, textAlign: c.a || 'left', color: c.dim ? C.muted : C.ink, whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>
                      {c.render(r, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Kolom tabel per-customer & daftar SP. Kolom daftar SP mengikuti PERSIS
// bentuk baris get_storbit_product_sp_list (1b) — urutan & isi yang sama
// dipakai ulang oleh StorbitReportPDF dan storbitReportExcel, jadi layar, PDF,
// dan Excel menampilkan hal yang sama.
const CUSTOMER_COLS = [
  { h: 'Customer',   wrap: true, render: (r) => r.customer_name || '—' },
  { h: 'Jml SP',     a: 'right', mono: true, render: (r) => nf(r.jml_sp) },
  { h: 'Sisa Qty',   a: 'right', mono: true, render: (r) => nf(r.qty_outstanding) },
  { h: 'Nilai Sisa', a: 'right', mono: true, render: (r) => rp(r.nilai_outstanding) },
];

const SP_COLS = [
  { h: 'No SP',      mono: true, render: (r) => r.sp_no || '—' },
  { h: 'Customer',   wrap: true, render: (r) => r.customer_name || '—' },
  { h: 'DC',         dim: true,  render: (r) => r.dc_nama || '—' },
  { h: 'Tgl SP',     mono: true, render: (r) => fmtDate(r.sp_date) },
  { h: 'Tenggat',    mono: true, render: (r) => fmtDate(r.expired_date) },
  { h: 'Status',                 render: (r) => r.status || '—' },
  { h: 'Qty',        a: 'right', mono: true, render: (r) => nf(r.qty) },
  { h: 'Kirim',      a: 'right', mono: true, render: (r) => nf(r.shipped_qty) },
  { h: 'Sisa',       a: 'right', mono: true, render: (r) => nf(r.sisa) },
  { h: 'Nilai Sisa', a: 'right', mono: true, render: (r) => rp(r.nilai_sisa) },
  { h: 'Umur',       a: 'right', mono: true, render: (r) => (r.umur_hari == null ? '—' : `${nf(r.umur_hari)}h`) },
];

const TOP_COLS = [
  { h: 'Kode',       mono: true, render: (r) => r.code || '—' },
  { h: 'Produk',     wrap: true, render: (r) => r.product_name || '—' },
  { h: 'Jml SP',     a: 'right', mono: true, render: (r) => nf(r.jml_sp) },
  { h: 'Sisa Qty',   a: 'right', mono: true, render: (r) => nf(r.qty_outstanding) },
  { h: 'Stok',       a: 'right', mono: true, render: (r) => nf(r.stok_tersedia) },
  { h: 'Nilai Sisa', a: 'right', mono: true, render: (r) => rp(r.nilai_outstanding) },
];

/* ---------- halaman ---------- */
export default function StorbitDashboardPage({ customers = [], showToast, onSelectSP, onSelectProduct }) {
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

  // ── Laporan Per Barang + strip outstanding (tambahan 5 Sep 2026) ──────────
  const { hasMenuPermission } = useAuth();

  const [outstanding, setOutstanding]   = useState(null);
  const [outLoading, setOutLoading]     = useState(true);

  const [products, setProducts]         = useState([]);
  const [productsLoading, setProdLoad]  = useState(true);
  const [productsError, setProdError]   = useState(null);

  const [productId, setProductId]       = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');

  const [report, setReport]             = useState(null);
  const [reportLoading, setReportLoad]  = useState(false);
  const [reportError, setReportError]   = useState(null);

  const [spListRows, setSpListRows]     = useState([]);
  const [spListLoading, setSpListLoad]  = useState(false);
  const [spListError, setSpListError]   = useState(null);

  const [exporting, setExporting]       = useState(null);   // null | 'pdf' | 'xlsx'

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
      const { data, error: err } = await getStorbitDashboardStats(customerId || null, spType || null, SOA_COMPANY_ID);
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
  }, [customerId, spType, notifyError]);

  // ── Drill-down SP — ikut kategori aktif + filter yang sama ────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setSpRowsLoad(true);
      const { data, error: err } = await getStorbitSpDrilldown(spCat, {
        customerId: customerId || null,
        priceCategory: spType || null,
        companyId: SOA_COMPANY_ID,
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
  }, [spCat, customerId, spType, notifyError]);

  // ── Drill-down produk — filter customer/tipe SP tak berlaku di sini ───────
  useEffect(() => {
    let alive = true;
    (async () => {
      setWhRowsLoad(true);
      const { data, error: err } = await getStorbitStockDrilldown(whCat, { companyId: SOA_COMPANY_ID });
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
  }, [whCat, notifyError]);

  // ── Strip outstanding — ikut filter customer/tipe yang sama dgn kartu lain ─
  useEffect(() => {
    let alive = true;
    (async () => {
      setOutLoading(true);
      const { data, error: err } = await getStorbitOutstandingSummary({
        companyId: SOA_COMPANY_ID,
        customerId: customerId || null,
        priceCategory: spType || null,
      });
      if (!alive) return;
      if (err) {
        setOutstanding(null);
        showToast?.('Gagal memuat nilai outstanding: ' + (err.message || 'unknown'), 'error');
      } else {
        setOutstanding(data || null);
      }
      setOutLoading(false);
    })();
    return () => { alive = false; };
  }, [customerId, spType, showToast]);

  // ── Daftar produk — SEKALI di mount, dipakai combobox + tabel Top 10 ──────
  useEffect(() => {
    let alive = true;
    (async () => {
      setProdLoad(true);
      setProdError(null);
      const { data, error: err } = await getStorbitTopOutstandingProducts({
        companyId: SOA_COMPANY_ID,
        limit: PRODUCT_FETCH_LIMIT,
      });
      if (!alive) return;
      if (err) {
        setProducts([]);
        setProdError('Gagal memuat daftar produk: ' + (err.message || 'unknown'));
      } else {
        setProducts(data);
      }
      setProdLoad(false);
    })();
    return () => { alive = false; };
  }, []);

  // ── Laporan produk terpilih (ringkasan + per customer) ────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      // Guard sengaja DI DALAM IIFE, bukan di badan effect: setState sinkron
      // di badan effect memicu cascading render (react-hooks/set-state-in-effect).
      // Pola ini sama dengan tiga effect existing di halaman ini.
      if (!productId) { setReport(null); setReportError(null); return; }
      setReportLoad(true);
      setReportError(null);
      const { data, error: err } = await getStorbitProductReport(productId, {
        companyId: SOA_COMPANY_ID,
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
      });
      if (!alive) return;
      if (err) {
        setReport(null);
        setReportError('Gagal memuat laporan produk: ' + (err.message || 'unknown'));
      } else {
        setReport(data || null);
      }
      setReportLoad(false);
    })();
    return () => { alive = false; };
  }, [productId, dateFrom, dateTo]);

  // ── Daftar SP produk terpilih ─────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!productId) { setSpListRows([]); setSpListError(null); return; }
      setSpListLoad(true);
      setSpListError(null);
      const { data, error: err } = await getStorbitProductSpList(productId, {
        companyId: SOA_COMPANY_ID,
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
      });
      if (!alive) return;
      if (err) {
        setSpListRows([]);
        setSpListError('Gagal memuat daftar SP: ' + (err.message || 'unknown'));
      } else {
        setSpListRows(data);
      }
      setSpListLoad(false);
    })();
    return () => { alive = false; };
  }, [productId, dateFrom, dateTo]);

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

  // Prop `customers` datang dari useCustomers() di App.jsx, yang memanggil
  // listCustomers() — fungsi itu mengambil SELURUH accounts ber-account_status
  // 'customer' TANPA filter company (nol parameter, cuma andalkan RLS), dan
  // dioper ke 6 halaman lain. Jadi ia SENGAJA tidak diubah; penyaringannya
  // dilakukan di sini saja supaya nol efek samping ke konsumen lain.
  //
  // Tanpa filter ini, super_admin melihat customer MSI/JCI di dropdown padahal
  // seluruh angka halaman ini dipin ke SOA — memilih salah satunya menghasilkan
  // nol baris tanpa penjelasan apa pun.
  //
  // ⚠️ KETERBATASAN YANG DISADARI (solusi sementara, bukan yang paling presisi):
  // filter ini memakai `accounts.company_id`, yaitu entitas PEMILIK RECORD
  // account — BUKAN "customer yang benar-benar punya SP di SOA". Kalau ada
  // customer yang dilayani Storbit tapi record account-nya terdaftar di bawah
  // MSI/JCI, ia TIDAK akan muncul di dropdown ini. Kalau suatu saat ada laporan
  // "customer X hilang dari filter Dashboard Storbit", inilah sebabnya —
  // periksa `accounts.company_id` milik customer itu lebih dulu, jangan
  // investigasi ulang dari nol.
  // Cara yang benar-benar presisi = menurunkan daftar dari SP yang ada (RPC
  // `storbit_sp_customers()` sudah melakukan persis itu), tapi RPC tersebut
  // punya dua masalah sendiri: ter-GRANT ke `anon` dan hardcode UUID SOA di
  // dalam body-nya. Pindah ke sana adalah pekerjaan tersendiri.
  //
  // `company_id` tersedia di objek ini karena customerFromDb() (db.js)
  // meneruskan seluruh kolom non-standar apa adanya.
  const customerOptions = useMemo(() => ([
    { value: '', label: 'Semua customer' },
    ...customers
      .filter((c) => c?.id && c.company_id === SOA_COMPANY_ID)
      .map((c) => ({ value: c.id, label: c.name || '(Tanpa nama)' })),
  ]), [customers]);

  const resetFilters = useCallback(() => { setCustomerId(''); setSpType(''); }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.product_id === productId) || null,
    [products, productId],
  );
  const topProducts = useMemo(() => products.slice(0, TOP_PRODUCT_ROWS), [products]);

  const resetReportFilters = useCallback(() => { setDateFrom(''); setDateTo(''); }, []);

  // Gate export — menu key 'logistics_sp' (Dashboard Storbit memakai ulang key
  // Sales Order/SP, lihat MENU_KEY_MAP di App.jsx). Kedua action ada & aktif di
  // menu_actions: 'export' untuk Excel, 'print' untuk PDF. hasMenuPermission
  // default-deny, jadi tombolnya memang tak terlihat sampai grant-nya diberikan.
  const canExportExcel = hasMenuPermission('logistics_sp', 'export');
  const canExportPdf   = hasMenuPermission('logistics_sp', 'print');

  // Export TIDAK BOLEH terpotong diam-diam: daftar SP ditembak ulang dengan
  // limit jauh lebih tinggi dari yang dipakai layar. Kalau hasilnya MENYENTUH
  // limit itu, user diperingatkan dan harus menyetujui SEBELUM file dibuat —
  // dan peringatan yang sama ikut tercetak di dalam file, supaya penerima yang
  // tak melihat dialog ini tetap tahu isinya tak lengkap.
  const runExport = useCallback(async (kind) => {
    if (!productId || !report) return;
    setExporting(kind);
    try {
      const { data: rows, error: err } = await getStorbitProductSpList(productId, {
        companyId: SOA_COMPANY_ID,
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
        limit:    EXPORT_ROW_LIMIT,
      });
      if (err) throw new Error(err.message || 'unknown');

      const truncated = rows.length >= EXPORT_ROW_LIMIT;
      if (truncated) {
        const lanjut = window.confirm(
          `Daftar SP menyentuh batas ${nf(EXPORT_ROW_LIMIT)} baris.\n\n`
          + 'File yang dibuat TIDAK akan memuat seluruh data. Persempit filter '
          + 'periode untuk hasil lengkap.\n\nTetap buat file yang terpotong?',
        );
        if (!lanjut) { setExporting(null); return; }
      }

      const payload = {
        report,
        spRows: rows,
        outstanding: outstanding || {},
        product: selectedProduct || {},
        filters: { dateFrom, dateTo },
        truncated,
      };

      let blob;
      let ext;
      if (kind === 'pdf') {
        blob = await pdf(<StorbitReportPDF {...payload} />).toBlob();
        ext = 'pdf';
      } else {
        // exceljs (~950 KB) sengaja lazy — nol beban sampai tombol ditekan.
        const { buildStorbitReportWorkbook } = await import('./storbitReportExcel');
        blob = await buildStorbitReportWorkbook(payload);
        ext = 'xlsx';
      }

      const safe = (selectedProduct?.code || 'produk').replace(/[/\\]/g, '-');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LaporanBarang-${safe}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast?.(`Laporan ${ext.toUpperCase()} dibuat${truncated ? ' (terpotong)' : ''}.`);
    } catch (e) {
      showToast?.('Gagal membuat file: ' + (e?.message || e), 'error');
    } finally {
      setExporting(null);
    }
  }, [productId, report, outstanding, selectedProduct, dateFrom, dateTo, showToast]);

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

      {/* 6b — Strip nilai outstanding (kirim / tagih / piutang) ───────────── */}
      <div style={{ ...body, fontSize: 11, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.purple, fontWeight: 600, marginBottom: 10 }}>
        Nilai Outstanding
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 22 }}>
        {OUTSTANDING_CARDS.map((c) => (
          <OutstandingCard
            key={c.key}
            item={c}
            loading={outLoading}
            value={outstanding?.[c.key]?.nilai}
            count={c.key === 'piutang' ? outstanding?.piutang?.jml_invoice : outstanding?.[c.key]?.jml_sp}
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
          onRowClick={onSelectSP}
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
        onRowClick={onSelectProduct}
      />

      {/* 14 — Laporan Per Barang ─────────────────────────────────────────── */}
      <div style={{ marginTop: 34 }}>
        <Kicker>Laporan Per Barang</Kicker>
        <div style={{ ...body, fontSize: 12.5, color: C.muted }}>
          Sisa kirim, nilai, dan kecukupan stok untuk satu produk
        </div>
      </div>

      {/* 14a — Filter + export */}
      <div style={{
        background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4,
        padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'flex-end',
        flexWrap: 'wrap', marginTop: 14, marginBottom: 18,
      }}>
        <ProductCombobox
          products={products}
          value={productId}
          onChange={setProductId}
          loading={productsLoading}
          disabled={!!productsError}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ ...body, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.faint }}>
            Tgl SP dari
          </label>
          <input
            type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            style={{ ...body, fontSize: 13, padding: '8px 10px', borderRadius: 4, border: `1px solid ${C.divider}`, background: C.card, color: C.ink }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ ...body, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.faint }}>
            sampai
          </label>
          <input
            type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            style={{ ...body, fontSize: 13, padding: '8px 10px', borderRadius: 4, border: `1px solid ${C.divider}`, background: C.card, color: C.ink }}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={resetReportFilters} style={{
            ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 4, border: `1px solid ${C.divider}`,
            background: C.card, color: C.muted, cursor: 'pointer',
          }}>
            <RotateCcw size={13} strokeWidth={1.75} /> Periode
          </button>
        )}

        <div style={{ flex: 1, minWidth: 120, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {canExportExcel && (
            <button
              onClick={() => runExport('xlsx')}
              disabled={!productId || reportLoading || !!exporting}
              style={{
                ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 13px', borderRadius: 4, border: `1px solid ${C.divider}`,
                background: C.card, color: productId && !exporting ? C.ink : C.faint,
                cursor: productId && !exporting ? 'pointer' : 'not-allowed',
              }}
            >
              <FileSpreadsheet size={13} strokeWidth={1.75} />
              {exporting === 'xlsx' ? 'Menyiapkan…' : 'Excel'}
            </button>
          )}
          {canExportPdf && (
            <button
              onClick={() => runExport('pdf')}
              disabled={!productId || reportLoading || !!exporting}
              style={{
                ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 13px', borderRadius: 4, border: `1px solid ${C.divider}`,
                background: C.card, color: productId && !exporting ? C.ink : C.faint,
                cursor: productId && !exporting ? 'pointer' : 'not-allowed',
              }}
            >
              <FileText size={13} strokeWidth={1.75} />
              {exporting === 'pdf' ? 'Menyiapkan…' : 'PDF'}
            </button>
          )}
        </div>
      </div>

      {productsError && (
        <div style={{ ...body, fontSize: 12.5, color: C.orange, background: C.orangeSoft, border: `1px solid ${C.orangeBorder}`, borderRadius: 4, padding: '10px 14px', marginBottom: 18 }}>
          {productsError}
        </div>
      )}

      {/* 14b — Belum ada produk dipilih: Top 10 sebagai pintu masuk */}
      {!productId ? (
        <ReportTable
          title="Top 10 Produk — Nilai Belum Dikirim"
          cols={TOP_COLS}
          rows={topProducts}
          loading={productsLoading}
          error={productsError}
          empty="Belum ada produk dengan sisa kirim."
          footer={`${nf(topProducts.length)} dari ${nf(products.length)} produk`}
          onRowClick={(r) => setProductId(r.product_id)}
        />
      ) : (
        <>
          {/* 14c — Kartu ringkasan */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            <SummaryTile label="Total Dipesan"  value={reportLoading ? '…' : nf(report?.summary?.qty_ordered)} />
            <SummaryTile label="Terkirim"       value={reportLoading ? '…' : nf(report?.summary?.qty_shipped)} />
            <SummaryTile label="Belum Dikirim"  value={reportLoading ? '…' : nf(report?.summary?.qty_outstanding)} />
            <SummaryTile
              label="Nilai Belum Dikirim"
              value={reportLoading ? '…' : rpShort(report?.summary?.nilai_outstanding)}
              sub="belum termasuk PPN"
            />
            {/* Defisit memakai token peringatan yang SAMA dengan kartu
                "Lewat Tenggat Kirim" (C.orange / C.orangeSoft / C.orangeBorder)
                — tidak ada warna baru diperkenalkan. */}
            <SummaryTile
              label="Stok Tersedia"
              value={reportLoading ? '…' : nf(report?.summary?.stok_tersedia)}
              warn={!reportLoading && Number(report?.summary?.defisit) > 0}
              sub={reportLoading ? null
                : Number(report?.summary?.defisit) > 0
                  ? `Defisit ${nf(report?.summary?.defisit)}`
                  : 'Stok mencukupi'}
            />
          </div>

          {reportError && (
            <div style={{ ...body, fontSize: 12.5, color: C.orange, background: C.orangeSoft, border: `1px solid ${C.orangeBorder}`, borderRadius: 4, padding: '10px 14px', marginBottom: 18 }}>
              {reportError}
            </div>
          )}

          {/* 14d — Breakdown per customer */}
          <div style={{ marginBottom: 18 }}>
            <ReportTable
              title="Rincian Per Customer"
              cols={CUSTOMER_COLS}
              rows={report?.per_customer || []}
              loading={reportLoading}
              error={reportError}
              empty="Produk ini belum pernah dipesan customer mana pun pada periode terpilih."
              footer={`${nf(report?.per_customer?.length)} customer`}
            />
          </div>

          {/* 14e — Daftar SP; baris bisa diklik ke Detail SP */}
          <ReportTable
            title="Daftar SP"
            cols={SP_COLS}
            rows={spListRows}
            loading={spListLoading}
            error={spListError}
            empty="Tidak ada SP untuk produk ini pada periode terpilih."
            footer={`${nf(spListRows.length)} SP ditampilkan`}
            onRowClick={onSelectSP}
          />
          {spListRows.length >= 200 && (
            <div style={{ ...mono, fontSize: 10.5, color: C.faint, marginTop: 8 }}>
              Layar dibatasi 200 baris. Export mengambil sampai {nf(EXPORT_ROW_LIMIT)} baris.
            </div>
          )}
        </>
      )}
    </div>
  );
}
