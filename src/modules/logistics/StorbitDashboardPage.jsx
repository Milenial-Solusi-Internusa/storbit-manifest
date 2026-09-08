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

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  ClipboardList, Truck, PackageCheck, FileCheck2, Receipt, XCircle,
  AlertOctagon, Clock, AlertTriangle, PackageX, Boxes, ChevronRight,
  Search, RotateCcw, ShieldAlert, Send, Wallet, Coins,
  FileSpreadsheet, FileText, X,
} from 'lucide-react';
import {
  getStorbitDashboardStats, getStorbitSpDrilldown, getStorbitStockDrilldown,
  getStorbitProductReport, getStorbitProductSpList,
  getStorbitOutstandingSummary, getStorbitTopOutstandingProducts,
  getStorbitRekapPerCustomer,
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

// Penanda basis pajak untuk kartu status. Dipakai di DUA section (manifest &
// tenggat) — satu kali per section, tak pernah per kartu.
const PPN_NOTE = 'Nilai rupiah pada kartu di bawah: belum termasuk PPN';

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
  // Nilai Total SP SENGAJA paling kiri: ia penyebut dari tiga angka lain
  // (nilai kontrak seluruh SP), jadi dibaca lebih dulu baru turunannya.
  // ⚠️ Dua kartu BRUTO (total_sp, piutang) dan dua DPP (kirim, tagih) —
  // `ppn` mengendalikan penanda di kaki kartu, jangan disamakan.
  { key: 'total_sp', icon: Coins, label: 'Nilai Total SP',
    desc: 'Nilai kontrak seluruh SP', ppn: true,  unit: 'SP' },
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
// Batas tampilan rekap di layar — sama dengan drilldown lain. Export memakai
// EXPORT_ROW_LIMIT seperti daftar lainnya.
const REKAP_ROW_LIMIT = 500;

// Label entitas untuk blok meta file. Halaman ini dipin ke SOA (lihat catatan
// panjang di atas SOA_COMPANY_ID), jadi labelnya ikut konstan — bukan diambil
// dari `companies`, supaya export tak menambah query yang tak dipakai layar.
const SOA_COMPANY_LABEL = 'Storbit (SOA)';

// Bagian yang bisa dipilih untuk diekspor. URUTAN DI SINI = urutan sheet Excel
// dan urutan section PDF; jangan diacak tanpa alasan.
//
// `sheet` dipakai apa adanya sebagai nama worksheet — WAJIB unik dan <=31
// karakter. "Daftar SP Kategori" sengaja TIDAK bernama "Daftar SP": nama itu
// sudah dipakai sheet ketiga Laporan Per Barang, dan Excel menolak duplikat.
const EXPORT_SECTIONS = [
  { key: 'outstanding', sheet: 'Outstanding',       label: 'Nilai SP & Outstanding',              hint: '4 kartu strip',                          def: true  },
  { key: 'manifest',    sheet: 'Manifest',          label: 'Shipping Manifest — ringkasan',       hint: 'distribusi status + 6 kartu status',     def: true  },
  { key: 'attention',   sheet: 'Perlu Perhatian',   label: 'Shipping Manifest — perlu perhatian', hint: '2 kartu tenggat + kartu risiko pinalti', def: false },
  { key: 'spList',      sheet: 'Daftar SP Kategori',label: 'Daftar SP',                           hint: 'satu status per file',                   def: false, scope: 'spCat'    },
  { key: 'rekap',       sheet: 'Rekap per Customer',label: 'Rekap per Customer',                  hint: 'SP + produk, dikelompokkan per customer', def: false, scope: 'rekapCat' },
  { key: 'stockHealth', sheet: 'Kesehatan Stok',    label: 'Gudang — kesehatan stok',             hint: 'donut + 3 kartu',                        def: false },
  { key: 'stockList',   sheet: 'Daftar Produk',     label: 'Gudang — daftar produk',              hint: 'satu kategori stok per file',            def: false, scope: 'whCat'    },
  { key: 'report',      sheet: null,                label: 'Laporan Per Barang',                  hint: 'Ringkasan · Per Customer · Daftar SP',   def: true,  scope: 'productId', needsProduct: true },
];

// Kategori yang BENAR-BENAR diterima get_storbit_sp_drilldown, urut sesuai CASE
// di dalam RPC-nya. ⚠️ RPC itu diakhiri `ELSE false`: kategori di luar daftar
// ini mengembalikan NOL BARIS TANPA ERROR — gagalnya senyap, jadi daftar ini
// harus ikut berubah kalau CASE di RPC berubah.
//
// TIDAK ada opsi "semua status" (keputusan Den, 7 Sep 2026): kategorinya SALING
// TUMPANG TINDIH (mis. `shipped` ∩ `delivered_belum_btb` di status SAMPAI),
// jadi menggabungkan sepuluhnya membuat SP yang sama muncul di dua tempat dan
// jumlah barisnya tak bisa diadu dengan kartu mana pun. Satu status per file
// justru menjaga sifat "cocok 1:1 dengan layar".
const SP_DRILLDOWN_CATEGORIES = [
  'pending_open', 'shipped', 'delivered_belum_btb', 'btb_terbit', 'terkirim_penuh',
  'expired', 'mendekati_expired', 'pernah_risiko_pinalti', 'finance', 'cancelled',
];

const defaultPicks = (canReport) => Object.fromEntries(
  EXPORT_SECTIONS.map((sc) => [sc.key, sc.def && (!sc.needsProduct || canReport)]),
);

// Satu panggilan get_storbit_top_outstanding_products melayani DUA kebutuhan:
// isi combobox (seluruh produk yang pernah muncul di SP — 38 per 5 Sep 2026)
// dan tabel Top 10 (10 baris pertama; RPC-nya sudah urut nilai DESC). Satu
// sumber = daftar dropdown dan tabel mustahil melenceng satu sama lain.
const PRODUCT_FETCH_LIMIT = 1000;
const TOP_PRODUCT_ROWS = 10;

// Tiga topik halaman ini. Sebelumnya menumpuk vertikal sehingga "Laporan Per
// Barang" hanya bisa dicapai setelah menggulir seluruh manifest + warehouse.
// Urutan di sini = urutan tab bar; `manifest` default.
const TABS = [
  { key: 'manifest', label: 'Shipping Manifest' },
  { key: 'gudang',   label: 'Gudang' },
  { key: 'laporan',  label: 'Laporan Per Barang' },
];

const SP_TYPE_OPTIONS = [
  { value: '',         label: 'Semua tipe' },
  { value: 'semester', label: 'Semester' },
  { value: 'tahunan',  label: 'Tahunan' },
  { value: 'project',  label: 'Project' },
];

/* ---------- helpers ---------- */
const nf = (n) => Number(n || 0).toLocaleString('id-ID');

// Angka qty + satuan produk. Satuan datang APA ADANYA dari master
// (products.unit -> uom); master belum seragam kapitalisasinya ('PCS' vs
// 'Pcs'), dan itu SENGAJA tidak dinormalisasi di sini — merapikannya pekerjaan
// master-data, bukan laporan.
const qtyU = (n, uom) => (uom ? `${nf(n)} ${uom}` : nf(n));

// Rupiah penuh (tabel & tooltip) dan ringkas (kartu, supaya tak membungkus).
const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
// ── Rekap per customer: penjumlahan yang MENGHORMATI NULL ──────────────────
// ⚠️ INI BUKAN kehati-hatian berlebihan. `nilai_outstanding` SENGAJA null untuk
// tiga kategori (terkirim_penuh, pernah_risiko_pinalti, cancelled — basisnya
// belum ditetapkan, lihat migrasi 20260907000003). reduce() memperlakukan null
// sebagai 0 tanpa bersuara, jadi tanpa penjagaan ini baris TOTAL akan mencetak
// "Rp 0" — mengubah "belum didefinisikan" jadi "tidak ada nilainya".
//
// Mengembalikan null HANYA kalau SELURUH nilainya null; kalau sebagian terisi,
// yang terisi tetap dijumlahkan.
function sumNullable(values) {
  let ada = false;
  let acc = 0;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    ada = true;
    acc += Number(v) || 0;
  }
  return ada ? acc : null;
}

// Baris datar dari RPC (SUDAH urut customer_name, lalu nilai DESC) dikelompokkan
// per customer tanpa mengubah urutannya.
function groupRekap(rows) {
  const out = [];
  const byKey = new Map();
  for (const r of rows) {
    const key = r.customer_id || r.customer_name || '—';
    let g = byKey.get(key);
    if (!g) {
      g = { key, customer_id: r.customer_id, customer_name: r.customer_name || '—', sps: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.sps.push(r);
  }
  for (const g of out) {
    g.jml_sp = g.sps.length;
    g.nilai = sumNullable(g.sps.map((x) => x.nilai_outstanding));
  }
  return out;
}

// Rupiah yang menghormati null — "—", bukan "Rp 0".
const rpNullable = (v) => (v === null || v === undefined ? '—' : rp(v));

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
          {item.subValue != null && (
            <div style={{ ...mono, fontSize: 11.5, color: C.muted, marginTop: 5 }} title={rp(item.subValue)}>
              {rpShort(item.subValue)}
            </div>
          )}
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
// CUSTOMER_COLS & SP_COLS jadi FUNGSI karena satuannya ikut produk yang
// dipilih — dan seluruh baris kedua tabel itu produk yang SAMA, jadi satuan
// cukup sekali di header. Menaruhnya di tiap sel akan mengulang kata yang sama
// ratusan kali tanpa menambah informasi.
const makeCustomerCols = (uom) => [
  { h: 'Customer',   wrap: true, render: (r) => r.customer_name || '—' },
  { h: 'Jml SP',     a: 'right', mono: true, render: (r) => nf(r.jml_sp) },
  { h: uom ? `Sisa Qty (${uom})` : 'Sisa Qty',
                     a: 'right', mono: true, render: (r) => nf(r.qty_outstanding) },
  { h: 'Nilai Sisa', a: 'right', mono: true, render: (r) => rp(r.nilai_outstanding) },
];

const makeSpCols = (uom) => [
  { h: 'No SP',      mono: true, render: (r) => r.sp_no || '—' },
  { h: 'Customer',   wrap: true, render: (r) => r.customer_name || '—' },
  { h: 'DC',         dim: true,  render: (r) => r.dc_nama || '—' },
  { h: 'Tgl SP',     mono: true, render: (r) => fmtDate(r.sp_date) },
  { h: 'Tenggat',    mono: true, render: (r) => fmtDate(r.expired_date) },
  { h: 'Status',                 render: (r) => r.status || '—' },
  { h: uom ? `Qty (${uom})` : 'Qty',
                     a: 'right', mono: true, render: (r) => nf(r.qty) },
  { h: uom ? `Kirim (${uom})` : 'Kirim',
                     a: 'right', mono: true, render: (r) => nf(r.shipped_qty) },
  { h: uom ? `Sisa (${uom})` : 'Sisa',
                     a: 'right', mono: true, render: (r) => nf(r.sisa) },
  { h: 'Nilai Sisa', a: 'right', mono: true, render: (r) => rp(r.nilai_sisa) },
  { h: 'Umur',       a: 'right', mono: true, render: (r) => (r.umur_hari == null ? '—' : `${nf(r.umur_hari)}h`) },
];

const TOP_COLS = [
  { h: 'Kode',       mono: true, render: (r) => r.code || '—' },
  { h: 'Produk',     wrap: true, render: (r) => r.product_name || '—' },
  // Beda dari dua tabel lain: tiap baris di sini produk BERBEDA, jadi satuan
  // tak bisa dititipkan ke header. Satu kolom sendiri lebih tenang daripada
  // mengulangnya di dalam kolom Sisa Qty DAN Stok.
  { h: 'Satuan',     dim: true,  render: (r) => r.uom || '—' },
  { h: 'Jml SP',     a: 'right', mono: true, render: (r) => nf(r.jml_sp) },
  { h: 'Sisa Qty',   a: 'right', mono: true, render: (r) => nf(r.qty_outstanding) },
  { h: 'Stok',       a: 'right', mono: true, render: (r) => nf(r.stok_tersedia) },
  { h: 'Nilai Sisa', a: 'right', mono: true, render: (r) => rp(r.nilai_outstanding) },
];

// ── Tab bar ─────────────────────────────────────────────────────────────────
// <button> asli (bukan div onClick) supaya bisa dijangkau Tab/Enter/Space tanpa
// handler keyboard tambahan. Nol library baru; warna seluruhnya dari palet
// lokal C yang sudah ada.
function TabBar({ active, onSelect }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.divider}`, marginBottom: 22 }}>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.key)}
            style={{
              ...body, fontSize: 13, cursor: 'pointer',
              padding: '9px 16px',
              background: on ? C.purpleSoft : 'transparent',
              color: on ? C.purpleDeep : C.muted,
              fontWeight: on ? 600 : 400,
              border: 'none',
              borderBottom: `2px solid ${on ? C.purple : 'transparent'}`,
              borderTopLeftRadius: 4, borderTopRightRadius: 4,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tabel rekap per customer ────────────────────────────────────────────────
// Komponen KETIGA, sengaja terpisah dari DrillTable DAN ReportTable — mengikuti
// aturan yang sudah tertulis di kepala ReportTable: keduanya dipakai blok
// existing, dan menyentuhnya berarti mempertaruhkan mereka untuk bentuk yang
// tak mereka pakai (di sini: baris berlapis + lipat/buka). Gaya visualnya
// ditiru, kodenya tidak dibagi.
function RekapTable({ title, groups, total, loading, error, empty, footer }) {
  // Default TERBUKA: yang disimpan adalah himpunan yang DILIPAT, bukan yang
  // dibuka — jadi grup yang baru datang otomatis terbuka.
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const td = { padding: '8px 14px', borderBottom: `1px solid ${C.divider}` };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ ...heading, fontWeight: 600, fontSize: 16 }}>{title}</div>
        <div style={{ ...mono, fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>
          {loading ? 'Memuat…' : footer}
        </div>
      </div>
      {error ? (
        <div style={{ ...body, padding: '22px 16px', textAlign: 'center', color: C.orange, fontSize: 12.5 }}>{error}</div>
      ) : loading ? (
        <div style={{ ...body, padding: '28px 16px', textAlign: 'center', color: C.faint, fontSize: 13 }}>Memuat data…</div>
      ) : groups.length === 0 ? (
        <div style={{ ...body, padding: '28px 16px', textAlign: 'center', color: C.faint, fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['No SP', 'DC', 'Tgl SP', 'Tenggat', 'Status', 'Nilai'].map((h, i) => (
                <th key={h} style={{ ...body, textAlign: i === 5 ? 'right' : 'left', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.faint, padding: '8px 14px', borderBottom: `1px solid ${C.divider}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {groups.map((g) => {
                const open = !collapsed.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr
                      onClick={() => toggle(g.key)}
                      style={{ background: C.purpleSoft, cursor: 'pointer' }}
                    >
                      <td colSpan={5} style={{ ...body, fontSize: 13, fontWeight: 600, color: C.ink, ...td, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }} />
                          {g.customer_name}
                          <span style={{ ...mono, fontSize: 11, color: C.muted, fontWeight: 400 }}>· {nf(g.jml_sp)} SP</span>
                        </span>
                      </td>
                      <td style={{ ...mono, fontSize: 12.5, fontWeight: 600, ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {rpNullable(g.nilai)}
                      </td>
                    </tr>
                    {open && g.sps.map((r) => (
                      <Fragment key={`${g.key}|${r.sp_no}`}>
                        <tr>
                          <td style={{ ...mono, fontSize: 12.5, ...td, color: C.purpleDeep, whiteSpace: 'nowrap' }}>{r.sp_no || '—'}</td>
                          <td style={{ ...body, fontSize: 12.5, ...td, color: C.muted, whiteSpace: 'nowrap' }}>{r.dc_nama || '—'}</td>
                          <td style={{ ...mono, fontSize: 12, ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.sp_date)}</td>
                          <td style={{ ...mono, fontSize: 12, ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.expired_date)}</td>
                          <td style={{ ...body, fontSize: 12.5, ...td, whiteSpace: 'nowrap' }}>{r.status || '—'}</td>
                          <td style={{ ...mono, fontSize: 12.5, ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{rpNullable(r.nilai_outstanding)}</td>
                        </tr>
                        <tr>
                          <td colSpan={6} style={{ ...body, fontSize: 11, color: C.faint, padding: '0 14px 8px 34px', borderBottom: `1px solid ${C.divider}` }}>
                            {r.produk || '—'}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
              <tr style={{ background: C.bg }}>
                <td colSpan={5} style={{ ...body, fontSize: 12.5, fontWeight: 600, color: C.ink, padding: '10px 14px' }}>TOTAL</td>
                <td style={{ ...mono, fontSize: 13, fontWeight: 600, color: C.ink, padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {rpNullable(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Panel pilih isi export ──────────────────────────────────────────────────
// Bentuk modal, mengikuti pola overlay satu-satunya di modul ini
// (SalesOrderDetailPage.jsx): backdrop fixed + panel ter-center, header sticky
// ber-ikon & tombol X, body scroll, footer aksi. Palet SENGAJA tidak ikut dari
// sana — file itu memakai token app shell (C.surface/C.line/C.accent),
// sedangkan halaman ini punya `C` sendiri.
//
// Satu panel untuk DUA format: pilihan isinya identik, formatnya ditentukan
// tombol di footer. Gate hasMenuPermission dievaluasi per tombol, jadi user
// yang cuma punya 'print' hanya melihat PDF.
// Select ringkas untuk kontrol cakupan di dalam panel. Bentuknya sama dengan
// <Select> bar filter halaman, cuma tanpa minWidth 180 supaya dua-duanya muat
// berdampingan dan yang inline bisa menempel di bawah label bagiannya.
function ScopeSelect({ label, options, value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <label style={{ ...body, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.faint }}>{label}</label>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{
          ...body, fontSize: 13, padding: '8px 10px', borderRadius: 4,
          border: `1px solid ${C.divider}`, background: C.card,
          color: disabled ? C.faint : C.ink, width: '100%',
        }}
      >
        {options.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
    </div>
  );
}

function ExportPanel({
  picks, setPicks, scope, setScope, customerOptions, products, productsLoading,
  canExcel, canPdf, phase, onClose, onRun,
}) {
  const chosen = EXPORT_SECTIONS.filter((sc) => picks[sc.key]).length;
  const busy = !!phase;
  // Laporan Per Barang tak lagi digerbang "belum pilih produk" — produknya
  // dipilih DI SINI. Yang menggerbang tinggal ketersediaan daftarnya.
  const productOptions = products.map((pr) => ({
    value: pr.product_id, label: `${pr.code || '—'} · ${pr.product_name || ''}`,
  }));
  const scopeOptionsFor = (key) => {
    if (key === 'spCat' || key === 'rekapCat') return SP_DRILLDOWN_CATEGORIES.map((k) => ({ value: k, label: labelOf(k) }));
    if (key === 'whCat') return WAREHOUSE_CARDS.map((c) => ({ value: c.key, label: c.label }));
    return productOptions;
  };
  const scopeLabelFor = (key) => (
    key === 'spCat' || key === 'rekapCat' ? 'Status' : key === 'whCat' ? 'Kategori stok' : 'Produk'
  );
  return (
    <>
      <div
        onClick={busy ? undefined : onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(32,31,29,0.42)', backdropFilter: 'blur(2px)', zIndex: 80 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 81, width: 'calc(100% - 32px)', maxWidth: 600, maxHeight: '88vh',
        background: C.card, border: `1px solid ${C.divider}`, borderRadius: 4,
        boxShadow: '0 12px 34px rgba(32,31,29,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px 14px', borderBottom: `1px solid ${C.divider}`, flexShrink: 0 }}>
          <span style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.purpleSoft, color: C.purple }}>
            <FileSpreadsheet size={16} strokeWidth={1.75} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...heading, fontWeight: 600, fontSize: 17, lineHeight: 1.2 }}>Pilih isi export</div>
            <div style={{ ...body, fontSize: 11.5, color: C.muted, marginTop: 2 }}>
              Bagian yang tidak dicentang tidak akan ada di file.
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup"
            style={{ width: 30, height: 30, borderRadius: 4, border: `1px solid ${C.divider}`, background: C.card, color: C.faint, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '8px 18px 12px', flex: 1 }}>
          {/* Cakupan global — berlaku untuk SELURUH bagian. Nilai awalnya
              menyalin filter halaman, tapi mengubahnya di sini TIDAK menyentuh
              halaman: seluruhnya hidup di `scope` milik panel. */}
          <div style={{ display: 'flex', gap: 10, padding: '10px 0 12px', borderBottom: `1px solid ${C.divider}` }}>
            <ScopeSelect
              label="Customer" options={customerOptions} value={scope.customerId} disabled={busy}
              onChange={(e) => setScope((prev) => ({ ...prev, customerId: e.target.value }))}
            />
            <ScopeSelect
              label="Tipe SP" options={SP_TYPE_OPTIONS} value={scope.spType} disabled={busy}
              onChange={(e) => setScope((prev) => ({ ...prev, spType: e.target.value }))}
            />
          </div>

          {EXPORT_SECTIONS.map((sc) => {
            // Hanya Laporan Per Barang yang bisa terkunci, dan kini alasannya
            // cuma satu: daftar produknya belum termuat.
            const blocked = sc.needsProduct && !products.length;
            // Dropdown cakupan DIRENDER hanya saat bagiannya dicentang — bukan
            // tampil-tapi-disabled. Itu yang menjaga panel tetap muat tanpa
            // scroll di keadaan default; ia tumbuh sejauh yang diminta saja.
            const showScope = sc.scope && picks[sc.key] && !blocked;
            return (
              <div key={sc.key} style={{ padding: '10px 0', borderBottom: `1px solid ${C.divider}`, opacity: blocked ? 0.55 : 1 }}>
                {/* <label> membungkus HANYA checkbox + teks. Kalau ia ikut
                    membungkus <select>, mengklik dropdown akan menoggle
                    centangnya. */}
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  cursor: blocked || busy ? 'not-allowed' : 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={!!picks[sc.key]}
                    disabled={blocked || busy}
                    onChange={(e) => setPicks((prev) => ({ ...prev, [sc.key]: e.target.checked }))}
                    style={{ marginTop: 2, accentColor: C.purple, width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...body, fontSize: 13, color: C.ink, display: 'block' }}>{sc.label}</span>
                    <span style={{ ...body, fontSize: 11, color: C.faint, display: 'block', marginTop: 1 }}>
                      {blocked ? (productsLoading ? 'memuat daftar produk…' : 'daftar produk tak tersedia') : sc.hint}
                    </span>
                  </span>
                </label>
                {showScope && (
                  <div style={{ display: 'flex', marginLeft: 25, marginTop: 8 }}>
                    <ScopeSelect
                      label={scopeLabelFor(sc.scope)}
                      options={scopeOptionsFor(sc.scope)}
                      value={scope[sc.scope]}
                      disabled={busy}
                      onChange={(e) => setScope((prev) => ({ ...prev, [sc.scope]: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px 14px', borderTop: `1px solid ${C.divider}`, flexShrink: 0 }}>
          {phase ? (
            <div style={{ ...mono, fontSize: 11, color: C.muted, marginBottom: 10 }}>
              {phase.label} — {phase.done}/{phase.total}
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 10.5, color: C.faint, marginBottom: 10 }}>
              {chosen === 0 ? 'Centang minimal satu bagian.' : `${chosen} bagian dipilih · nilai rupiah belum termasuk PPN`}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {canExcel && (
              <button
                onClick={() => onRun('xlsx')}
                disabled={chosen === 0 || busy}
                style={{
                  ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 13px', borderRadius: 4, border: `1px solid ${C.divider}`,
                  background: C.card, color: chosen && !busy ? C.ink : C.faint,
                  cursor: chosen && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                <FileSpreadsheet size={13} strokeWidth={1.75} />
                {phase?.kind === 'xlsx' ? 'Menyiapkan…' : 'Excel'}
              </button>
            )}
            {canPdf && (
              <button
                onClick={() => onRun('pdf')}
                disabled={chosen === 0 || busy}
                style={{
                  ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 13px', borderRadius: 4, border: `1px solid ${C.divider}`,
                  background: C.card, color: chosen && !busy ? C.ink : C.faint,
                  cursor: chosen && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                <FileText size={13} strokeWidth={1.75} />
                {phase?.kind === 'pdf' ? 'Menyiapkan…' : 'PDF'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

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

  // Rekap per customer — mengikuti KATEGORI YANG SEDANG DIPILIH di tab ini,
  // jadi ia berubah bersama tabel drilldown di atasnya.
  const [rekapRows, setRekapRows]       = useState([]);
  const [rekapLoading, setRekapLoad]    = useState(false);

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
  // Panel pilih isi export. `picks` SENGAJA di-reset tiap kali panel dibuka
  // (bukan disimpan) — permintaan eksplisit: pilihan tidak bertahan antar sesi.
  const [panelOpen, setPanelOpen]       = useState(false);
  const [picks, setPicks]               = useState(() => defaultPicks(false));
  // Cakupan file — MILIK PANEL, bukan halaman. Di-seed dari filter halaman tiap
  // kali panel dibuka, lalu hidup sendiri: tak satu pun setter halaman
  // (setCustomerId/setSpType/setSpCat/setWhCat/setProductId) dipanggil dari
  // panel, jadi menutup panel meninggalkan layar persis seperti semula.
  const [scope, setScope] = useState({ customerId: '', spType: '', spCat: 'btb_terbit', rekapCat: 'btb_terbit', whCat: 'danger_stock', productId: '' });
  const [exportPhase, setExportPhase]   = useState(null); // { kind, label, done, total }

  // Tab aktif — state lokal, tanpa URL param (sesuai permintaan). `tabLaporanDibuka`
  // sekali berubah true TIDAK pernah kembali false; itulah yang membuat pindah
  // tab bolak-balik tak memicu fetch ulang (lihat effect daftar produk).
  const [activeTab, setActiveTab] = useState('manifest');
  const [tabLaporanDibuka, setTabLaporanDibuka] = useState(false);

  const selectTab = useCallback((key) => {
    setActiveTab(key);
    if (key === 'laporan') setTabLaporanDibuka(true);
  }, []);

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

  // ── Rekap per customer — kategori + filter yang sama dgn drilldown SP ─────
  useEffect(() => {
    let alive = true;
    (async () => {
      setRekapLoad(true);
      const { data, error: err } = await getStorbitRekapPerCustomer(spCat, {
        customerId: customerId || null,
        priceCategory: spType || null,
        companyId: SOA_COMPANY_ID,
        limit: REKAP_ROW_LIMIT,
      });
      if (!alive) return;
      if (err) {
        setRekapRows([]);
        notifyError('Gagal memuat rekap per customer: ' + (err.message || 'unknown'));
      } else {
        setRekapRows(data);
      }
      setRekapLoad(false);
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

  // ── Daftar produk — LAZY: baru ditembak saat tab Laporan pertama dibuka ───
  // Dependency-nya HANYA `tabLaporanDibuka`, yang berpindah false->true tepat
  // sekali dan tak pernah balik. Konsekuensinya effect ini jalan paling banyak
  // dua kali: sekali saat mount (langsung keluar lewat guard) dan sekali saat
  // tab dibuka. Bolak-balik antar tab TIDAK memicu fetch ulang — hasilnya
  // tersimpan di `products` dan dipakai apa adanya.
  //
  // `productsLoading` SENGAJA tetap berawal `true`: nilainya tak pernah tampil
  // sebelum tab Laporan dirender, dan saat tab itu dibuka pertama kali ia sudah
  // bernilai true sehingga tabel langsung menampilkan loading — bukan berkedip
  // ke empty state "Belum ada produk" selama satu frame.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tabLaporanDibuka) return;
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
  }, [tabLaporanDibuka]);

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
  // listCustomers() — fungsi itu mengambil SELURUH accounts ber-lifecycle_stage
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
  // MEMETAKANNYA EKSPLISIT. Jangan andalkan loop pass-through di sana: loop itu
  // hanya meneruskan kolom NON-standar, sedangkan company_id justru terdaftar
  // di CUSTOMER_STANDARD_DB_COLS. Asumsi keliru itulah yang membuat filter di
  // bawah mengembalikan nol baris (setiap c.company_id === undefined) sejak
  // 4 Sep 2026 — dropdown ini cuma berisi "Semua customer".
  const customerOptions = useMemo(() => ([
    { value: '', label: 'Semua customer' },
    ...customers
      .filter((c) => c?.id && c.company_id === SOA_COMPANY_ID)
      .map((c) => ({ value: c.id, label: c.name || '(Tanpa nama)' })),
  ]), [customers]);

  const resetFilters = useCallback(() => { setCustomerId(''); setSpType(''); }, []);

  const topProducts = useMemo(() => products.slice(0, TOP_PRODUCT_ROWS), [products]);

  // Satuan produk terpilih. Sumbernya `summary.uom` (RPC), bukan baris combobox
  // — keduanya lahir dari ekspresi COALESCE yang sama di SQL, tapi mengambil
  // dari summary menjaga kartu, tabel, dan file export memakai satu nilai.
  const uom = report?.summary?.uom || '';
  const customerCols = useMemo(() => makeCustomerCols(uom), [uom]);
  const spCols       = useMemo(() => makeSpCols(uom), [uom]);

  const resetReportFilters = useCallback(() => { setDateFrom(''); setDateTo(''); }, []);

  // Gate export — menu key 'logistics_sp' (Dashboard Storbit memakai ulang key
  // Sales Order/SP, lihat MENU_KEY_MAP di App.jsx). Kedua action ada & aktif di
  // menu_actions: 'export' untuk Excel, 'print' untuk PDF. hasMenuPermission
  // default-deny, jadi tombolnya memang tak terlihat sampai grant-nya diberikan.
  const canExportExcel = hasMenuPermission('logistics_sp', 'export');
  const canExportPdf   = hasMenuPermission('logistics_sp', 'print');

  // Export TIDAK BOLEH terpotong diam-diam: setiap daftar ditembak ulang dengan
  // limit jauh lebih tinggi dari yang dipakai layar (200). Kalau hasilnya
  // MENYENTUH limit itu, user diperingatkan dan harus menyetujui SEBELUM file
  // dibuat — dan peringatan yang sama ikut tercetak di dalam file, supaya
  // penerima yang tak melihat dialog ini tetap tahu isinya tak lengkap.
  // Berlaku untuk KETIGA daftar: SP kategori aktif, produk stok, dan SP produk.
  // Memuat daftar produk untuk dropdown panel TANPA menyentuh
  // `tabLaporanDibuka`. `products` adalah cache murni — mengisinya tak mengubah
  // filter, tab, maupun pilihan apa pun di layar, jadi tidak melanggar aturan
  // "panel tak boleh mengubah keadaan halaman".
  const ensureProducts = useCallback(async () => {
    if (products.length || productsLoading) return;
    setProdLoad(true);
    setProdError(null);
    const { data, error: err } = await getStorbitTopOutstandingProducts({
      companyId: SOA_COMPANY_ID, limit: PRODUCT_FETCH_LIMIT,
    });
    if (err) {
      setProducts([]);
      setProdError('Gagal memuat daftar produk: ' + (err.message || 'unknown'));
    } else {
      setProducts(data);
    }
    if (!err && data?.length) {
      // Panel dibuka sebelum daftar termuat: isi pilihan produk begitu tiba,
      // tapi jangan pernah menimpa pilihan yang sudah dibuat pengguna.
      setScope((prev) => (prev.productId ? prev : { ...prev, productId: data[0].product_id }));
    }
    setProdLoad(false);
  }, [products.length, productsLoading]);

  const openExportPanel = useCallback(() => {
    // Reset, bukan mengingat: tiap kali dibuka, cakupan mengulang dari filter
    // halaman yang sedang aktif — konsisten dgn "tidak disimpan antar sesi".
    setPicks(defaultPicks(true));
    // Kalau halaman belum memilih produk tapi daftarnya sudah termuat, ambil
    // yang pertama — dropdown tak boleh terbuka dalam keadaan tak sinkron.
    setScope({ customerId, spType, spCat, rekapCat: spCat, whCat, productId: productId || products[0]?.product_id || '' });
    setExportPhase(null);
    setPanelOpen(true);
    ensureProducts();
  }, [customerId, spType, spCat, whCat, productId, products, ensureProducts]);

  // Merakit payload yang dikonsumsi KEDUA builder (Excel & PDF). Halaman yang
  // merakit — bukan builder — supaya konfigurasi kartu (MANIFEST_CARDS dkk)
  // tetap satu sumber di sini dan tak perlu diduplikasi ke dua file lain.
  //
  // Bentuk tiap bagian: { key, sheet, title, note?, blocks: [{subtitle?,
  // columns, fmt, rows}] }. `fmt` mengendalikan numFmt di Excel dan perataan
  // di PDF: 'text' | 'num' | 'rp'.
  const buildExportPayload = useCallback((got, picksIn, sc) => {
    const picks = picksIn;
    const truncatedNotes = [];
    const sections = [];
    const scopeProduct = products.find((pr) => pr.product_id === sc.productId) || null;
    const mm = got.stats?.manifest || {};
    const ww = got.stats?.warehouse || {};
    const valOf = (key) => {
      const raw = mm[`${key}_value`];
      return raw === undefined || raw === null ? null : Number(raw) || 0;
    };

    if (picks.outstanding) {
      const oo = got.outstanding || {};
      sections.push({
        key: 'outstanding', sheet: 'Outstanding', title: 'Nilai SP & Outstanding',
        // `raw` dipakai PDF: strip empat kartunya butuh objek bersarang apa
        // adanya, bukan baris yang sudah diratakan untuk Excel.
        raw: oo,
        note: 'DUA BRUTO (Nilai Total SP, Piutang) dan DUA DPP (Kirim, Tagih). Beda basis pajak — jangan dijumlahkan lintas basis.',
        blocks: [{
          columns: ['Metrik', 'Jumlah', 'Nilai', 'Basis pajak'],
          fmt: ['text', 'num', 'rp', 'text'],
          rows: OUTSTANDING_CARDS.map((c) => [
            c.label,
            Number(oo?.[c.key]?.jml_sp ?? oo?.[c.key]?.jml_invoice) || 0,
            Number(oo?.[c.key]?.nilai) || 0,
            c.ppn ? 'BRUTO — sudah termasuk PPN' : 'DPP — belum termasuk PPN',
          ]),
        }],
      });
    }

    if (picks.manifest) {
      sections.push({
        key: 'manifest', sheet: 'Manifest', title: 'Shipping Manifest — Ringkasan',
        note: 'Nilai rupiah: belum termasuk PPN. Kategori Dibatalkan sengaja tanpa nilai.',
        blocks: [
          {
            subtitle: 'Distribusi Status SP',
            columns: ['Status', 'Jumlah SP'], fmt: ['text', 'num'],
            rows: DONUT_STATUS_SLICES.map((d) => [d.label, Number(mm[d.key]) || 0]),
          },
          {
            subtitle: 'Kartu Status',
            columns: ['Kategori', 'Jumlah SP', 'Nilai (DPP)', 'Keterangan'],
            fmt: ['text', 'num', 'rp', 'text'],
            rows: MANIFEST_CARDS.map((c) => [
              labelOf(c.key), Number(mm[c.key]) || 0, valOf(c.key), c.desc,
            ]),
          },
        ],
      });
    }

    if (picks.attention) {
      sections.push({
        key: 'attention', sheet: 'Perlu Perhatian', title: 'Shipping Manifest — Perlu Perhatian',
        note: 'Nilai rupiah: belum termasuk PPN.',
        blocks: [
          {
            subtitle: 'Tenggat',
            columns: ['Kategori', 'Jumlah SP', 'Nilai (DPP)', 'Keterangan'],
            fmt: ['text', 'num', 'rp', 'text'],
            rows: EXPIRY_CARDS.map((c) => [
              labelOf(c.key), Number(mm[c.key]) || 0, valOf(c.key), c.desc,
            ]),
          },
          {
            subtitle: 'Risiko Pinalti',
            columns: ['Metrik', 'Jumlah SP'], fmt: ['text', 'num'],
            rows: [
              ['Pernah kena risiko pinalti', Number(mm.pernah_risiko_pinalti) || 0],
              ['SP dengan data pengiriman',  Number(mm.dispatch_data_tersedia) || 0],
              ['SP layak dinilai',           Number(mm.dispatch_eligible) || 0],
            ],
          },
        ],
      });
    }

    if (picks.spList) {
      const rows = got.spList || [];
      if (rows.length >= EXPORT_ROW_LIMIT) truncatedNotes.push('Daftar SP kategori aktif');
      sections.push({
        key: 'spList', sheet: 'Daftar SP Kategori',
        title: `Daftar SP — ${labelOf(sc.spCat)}`,
        truncated: rows.length >= EXPORT_ROW_LIMIT,
        blocks: [{
          columns: ['No SP', 'Customer', 'DC', 'Tanggal', 'Status'],
          fmt: ['text', 'text', 'text', 'text', 'text'],
          rows: rows.map((r) => [
            r.sp_no || '—', r.customer_name || '—', r.dc_nama || '—',
            r.sp_date || '—', r.status || '—',
          ]),
        }],
      });
    }

    if (picks.rekap) {
      const rows = got.rekap || [];
      if (rows.length >= EXPORT_ROW_LIMIT) truncatedNotes.push('Rekap per Customer');
      const grup = groupRekap(rows);
      sections.push({
        key: 'rekap', sheet: 'Rekap per Customer',
        title: `Rekap per Customer — ${labelOf(sc.rekapCat)}`,
        truncated: rows.length >= EXPORT_ROW_LIMIT,
        // ⚠️ sumNullable, BUKAN reduce(+). Tiga kategori sengaja bernilai null;
        // total "Rp 0" akan berbohong. Lihat migrasi 20260907000003.
        total: sumNullable(rows.map((r) => r.nilai_outstanding)),
        // Bentuk BERLAPIS — sengaja bukan `blocks`: renderer generik meratakan
        // semuanya jadi satu tabel dan hierarki customer > SP > produk hilang.
        groups: grup.map((g) => ({
          customer_name: g.customer_name,
          jml_sp: g.jml_sp,
          nilai: g.nilai,
          sps: g.sps.map((r) => ({
            sp_no: r.sp_no || '—',
            dc_nama: r.dc_nama || '—',
            sp_date: r.sp_date || '—',
            expired_date: r.expired_date || '—',
            status: r.status || '—',
            nilai: r.nilai_outstanding,
            produk: r.produk || '—',
          })),
        })),
        note: 'Nilai: DPP, belum termasuk PPN. "—" berarti basis nilainya belum ditetapkan untuk kategori ini, bukan nol.',
      });
    }

    if (picks.stockHealth) {
      const totalProduk = Number(ww.total_produk) || 0;
      const kosong = Number(ww.zero_stock) || 0;
      sections.push({
        key: 'stockHealth', sheet: 'Kesehatan Stok', title: 'Gudang — Kesehatan Stok',
        note: 'Stok adalah angka saat laporan dibuat — tidak mengikuti filter periode.',
        blocks: [
          {
            subtitle: 'Kesehatan Stok',
            columns: ['Kategori', 'Jumlah Produk'], fmt: ['text', 'num'],
            rows: [
              ['Ada Stok', Math.max(totalProduk - kosong, 0)],
              ['Stok Kosong', kosong],
            ],
          },
          {
            subtitle: 'Kartu Gudang',
            columns: ['Kategori', 'Jumlah Produk', 'Keterangan'], fmt: ['text', 'num', 'text'],
            rows: WAREHOUSE_CARDS.map((c) => [c.label, Number(ww[c.key]) || 0, c.desc]),
          },
        ],
      });
    }

    if (picks.stockList) {
      const rows = got.stockList || [];
      if (rows.length >= EXPORT_ROW_LIMIT) truncatedNotes.push('Gudang — daftar produk');
      const catLabel = WAREHOUSE_CARDS.find((c) => c.key === sc.whCat)?.label || 'Produk';
      sections.push({
        key: 'stockList', sheet: 'Daftar Produk',
        title: `Gudang — ${catLabel}`,
        truncated: rows.length >= EXPORT_ROW_LIMIT,
        blocks: [{
          columns: ['SKU', 'Produk', 'Tersedia', 'ROP'],
          fmt: ['text', 'text', 'num', 'text'],
          rows: rows.map((r) => [
            r.sku || '—', r.product_name || '—', Number(r.available) || 0,
            r.reorder_point == null ? 'Belum diisi' : nf(r.reorder_point),
          ]),
        }],
      });
    }

    if (picks.report && got.report) {
      const rows = got.report.spRows || [];
      if (rows.length >= EXPORT_ROW_LIMIT) truncatedNotes.push('Laporan Per Barang — Daftar SP');
      sections.push({
        key: 'report',
        report: got.report.report,
        spRows: rows,
        product: scopeProduct || {},
        filters: { dateFrom, dateTo },
        truncated: rows.length >= EXPORT_ROW_LIMIT,
        // Blok Outstanding di dalam Laporan Per Barang hanya dicetak kalau
        // bagian "Nilai SP & Outstanding" TIDAK dipilih. Keduanya default ON,
        // jadi tanpa ini empat angka yang sama muncul dua kali dalam satu file.
        // Kalau Laporan Per Barang diekspor sendirian, bentuknya tetap identik
        // dengan export lama.
        outstanding: picks.outstanding ? null : (got.outstanding || {}),
      });
    }

    const chosenLabels = EXPORT_SECTIONS.filter((x) => picks[x.key]).map((x) => x.label);
    // ⚠️ SELURUH baris cakupan di bawah dibaca dari `scope`, BUKAN dari filter
    // halaman. Penerima file tak tahu apa yang sedang aktif di layar
    // pengekspor, jadi yang tercetak harus benar-benar cakupan yang dipakai
    // merakit angka di file ini. Sengaja TANPA penanda "berbeda dari layar" —
    // itu informasi yang tak berguna bagi penerima.
    return {
      meta: {
        printedAt: new Date().toISOString(),
        entity: SOA_COMPANY_LABEL,
        filterCustomer: customerOptions.find((c) => c.value === sc.customerId)?.label || 'Semua customer',
        filterSpType: SP_TYPE_OPTIONS.find((t) => t.value === sc.spType)?.label || 'Semua tipe',
        spStatus: picks.spList ? labelOf(sc.spCat) : null,
        rekapStatus: picks.rekap ? labelOf(sc.rekapCat) : null,
        stockCategory: picks.stockList
          ? (WAREHOUSE_CARDS.find((c) => c.key === sc.whCat)?.label || sc.whCat)
          : null,
        product: picks.report ? (scopeProduct || null) : null,
        periode: picks.report
          ? (dateFrom || dateTo ? `${dateFrom || 'awal'} s/d ${dateTo || 'sekarang'}` : 'Seluruh periode')
          : null,
        sections: chosenLabels,
        truncatedNotes,
      },
      sections,
    };
  }, [dateFrom, dateTo, products, customerOptions]);

  // Seluruh bagian yang dicentang di-fetch ULANG saat export, termasuk yang
  // sudah ada di state layar. Bukan formalitas: kalau sebagian diambil dari
  // state dan sebagian di-fetch baru, satu file bisa mencampur angka dari dua
  // waktu berbeda. Biayanya maksimal 5 panggilan RPC.
  const runExportSelected = useCallback(async (kind) => {
    // Laporan Per Barang butuh produk; kalau daftarnya gagal termuat, bagian itu
    // dianggap tak dipilih daripada menghasilkan bagian kosong diam-diam.
    const eff = { ...picks, report: picks.report && !!scope.productId };
    const chosen = EXPORT_SECTIONS.filter((sc) => eff[sc.key]);
    if (!chosen.length) return;

    // Satu panggilan get_storbit_dashboard_stats melayani TIGA bagian sekaligus.
    const needStats = eff.manifest || eff.attention || eff.stockHealth;
    const jobs = [];
    // Outstanding juga dibutuhkan saat HANYA Laporan Per Barang yang dipilih:
    // sheet Ringkasan-nya memuat blok Outstanding kalau bagian tersendirinya
    // tidak ikut, dan blok itu bagian dari "isi export yang sekarang".
    if (eff.outstanding || eff.report) jobs.push({ id: 'outstanding', label: 'Nilai SP & Outstanding' });
    if (needStats)         jobs.push({ id: 'stats',       label: 'Angka kartu dashboard' });
    if (eff.spList)        jobs.push({ id: 'spList',      label: 'Daftar SP' });
    if (eff.rekap)         jobs.push({ id: 'rekap',       label: 'Rekap per Customer' });
    if (eff.stockList)     jobs.push({ id: 'stockList',   label: 'Daftar produk stok' });
    if (eff.report)        jobs.push({ id: 'report',      label: 'Laporan Per Barang' });

    setExporting(kind);
    let done = 0;
    const bump = (label) => { done += 1; setExportPhase({ kind, label, done, total: jobs.length }); };
    setExportPhase({ kind, label: 'Mengambil data…', done: 0, total: jobs.length });

    const call = async (id) => {
      // Seluruh cakupan diambil dari `scope`. Keadaan halaman TIDAK dibaca
      // sama sekali di sini — itulah yang membuat panel bisa merakit file yang
      // berbeda dari apa yang sedang tampil di layar.
      if (id === 'outstanding') {
        return getStorbitOutstandingSummary({
          companyId: SOA_COMPANY_ID, customerId: scope.customerId || null, priceCategory: scope.spType || null,
        });
      }
      if (id === 'stats') {
        return getStorbitDashboardStats(scope.customerId || null, scope.spType || null, SOA_COMPANY_ID);
      }
      if (id === 'spList') {
        return getStorbitSpDrilldown(scope.spCat, {
          customerId: scope.customerId || null, priceCategory: scope.spType || null,
          companyId: SOA_COMPANY_ID, limit: EXPORT_ROW_LIMIT,
        });
      }
      if (id === 'rekap') {
        return getStorbitRekapPerCustomer(scope.rekapCat, {
          customerId: scope.customerId || null, priceCategory: scope.spType || null,
          companyId: SOA_COMPANY_ID, limit: EXPORT_ROW_LIMIT,
        });
      }
      if (id === 'stockList') {
        return getStorbitStockDrilldown(scope.whCat, { companyId: SOA_COMPANY_ID, limit: EXPORT_ROW_LIMIT });
      }
      // report = dua panggilan; ringkasannya dan daftar SP-nya harus sepasang.
      const [rep, list] = await Promise.all([
        getStorbitProductReport(scope.productId, { companyId: SOA_COMPANY_ID, dateFrom: dateFrom || null, dateTo: dateTo || null }),
        getStorbitProductSpList(scope.productId, { companyId: SOA_COMPANY_ID, dateFrom: dateFrom || null, dateTo: dateTo || null, limit: EXPORT_ROW_LIMIT }),
      ]);
      if (rep.error)  return { data: null, error: rep.error };
      if (list.error) return { data: null, error: list.error };
      return { data: { report: rep.data, spRows: list.data || [] }, error: null };
    };

    try {
      const settled = await Promise.all(jobs.map(async (j) => {
        const res = await call(j.id);
        bump(j.label);
        return { job: j, res };
      }));

      // Satu bagian gagal = SELURUH unduhan dibatalkan. File separuh lebih
      // berbahaya daripada tak ada file: penerima tak punya cara tahu apa yang
      // hilang, dan itu persis kesalahpahaman yang memicu pekerjaan ini.
      const failed = settled.filter((x) => x.res.error);
      if (failed.length) {
        throw new Error('Gagal mengambil ' + failed.map((x) => x.job.label).join(', '));
      }

      const got = Object.fromEntries(settled.map((x) => [x.job.id, x.res.data]));
      const payload = buildExportPayload(got, eff, scope);

      if (payload.meta.truncatedNotes.length) {
        const lanjut = window.confirm(
          `Bagian berikut menyentuh batas ${nf(EXPORT_ROW_LIMIT)} baris:\n\n`
          + payload.meta.truncatedNotes.map((t) => '· ' + t).join('\n')
          + '\n\nFile yang dibuat TIDAK akan memuat seluruh data. Persempit '
          + 'filter untuk hasil lengkap.\n\nTetap buat file yang terpotong?',
        );
        if (!lanjut) { setExporting(null); setExportPhase(null); return; }
      }

      setExportPhase({ kind, label: 'Membuat file…', done: jobs.length, total: jobs.length });
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

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DashboardStorbit-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setPanelOpen(false);
      showToast?.(`File ${ext.toUpperCase()} dibuat${payload.meta.truncatedNotes.length ? ' (terpotong)' : ''}.`);
    } catch (e) {
      showToast?.('Gagal membuat file: ' + (e?.message || e), 'error');
    } finally {
      setExporting(null);
      setExportPhase(null);
    }
  }, [picks, scope, dateFrom, dateTo, showToast, buildExportPayload]);

  // Rekap dikelompokkan sekali di sini; RekapTable hanya merender.
  const rekapGroups = useMemo(() => groupRekap(rekapRows), [rekapRows]);
  // ⚠️ sumNullable, BUKAN reduce(+): tiga kategori sengaja bernilai null dan
  // total "Rp 0" akan berbohong. Lihat migrasi 20260907000003.
  const rekapTotal = useMemo(
    () => sumNullable(rekapRows.map((r) => r.nilai_outstanding)),
    [rekapRows],
  );

  const spCardValue = (key) => Number(m[key]) || 0;
  // Nilai rupiah per kartu (DPP). Mengembalikan null — BUKAN 0 — kalau kunci
  // `<key>_value` belum ada di payload, karena dua keadaan itu berbeda arti:
  // 0 = kategorinya memang nol rupiah, tak ada = RPC belum menyediakannya.
  // Dua hal bergantung pada perbedaan ini:
  //   · migrasi 20260907000002 belum tentu sudah jalan saat build ini tayang —
  //     tanpa penjagaan ini setiap kartu akan berbohong "Rp 0";
  //   · `cancelled` SENGAJA tak punya `_value` (keputusan 7 Sep 2026, alasannya
  //     di kepala migrasi) — kartunya harus tetap tanpa baris nilai.
  const spCardSubValue = (key) => {
    const raw = m?.[`${key}_value`];
    return raw === undefined || raw === null ? null : Number(raw) || 0;
  };

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
        {/* Export — di bar GLOBAL, bukan di dalam tab Laporan. Orang yang sedang
            melihat Shipping Manifest (tab default) harus bisa mengekspor tanpa
            pindah tab dan memilih produk yang tak ada hubungannya. Tidak lagi
            disabled karena belum pilih produk: hanya SATU bagian yang butuh
            produk, dan itu digerbang di dalam panel. Bar ini sudah flexWrap,
            jadi di layar sempit tombolnya turun — bukan mengecil. */}
        {(canExportExcel || canExportPdf) && (
          <div style={{ flex: 1, minWidth: 140, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={openExportPanel}
              disabled={!!exporting}
              style={{
                ...body, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 13px', borderRadius: 4, border: `1px solid ${C.divider}`,
                background: C.card, color: exporting ? C.faint : C.ink,
                cursor: exporting ? 'not-allowed' : 'pointer',
              }}
            >
              <FileSpreadsheet size={13} strokeWidth={1.75} />
              {exporting ? 'Menyiapkan…' : 'Export'}
            </button>
          </div>
        )}
      </div>

      {panelOpen && (
        <ExportPanel
          picks={picks}
          setPicks={setPicks}
          scope={scope}
          setScope={setScope}
          customerOptions={customerOptions}
          products={products}
          productsLoading={productsLoading}
          canExcel={canExportExcel}
          canPdf={canExportPdf}
          phase={exportPhase}
          onClose={() => setPanelOpen(false)}
          onRun={runExportSelected}
        />
      )}

      {error && (
        <div style={{ ...body, fontSize: 12.5, color: C.orange, background: C.orangeSoft, border: `1px solid ${C.orangeBorder}`, borderRadius: 4, padding: '10px 14px', marginBottom: 18 }}>
          {error}
        </div>
      )}

      {/* 6b — Strip nilai (total SP / kirim / tagih / piutang) ─────────────── */}
      <div style={{ ...body, fontSize: 11, letterSpacing: '0.11em', textTransform: 'uppercase', color: C.purple, fontWeight: 600, marginBottom: 10 }}>
        Nilai SP &amp; Outstanding
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

      {/* Tab bar — memisah tiga topik yang sebelumnya menumpuk vertikal.
          Blok di bawahnya dipindah APA ADANYA; nol perubahan isi. */}
      <TabBar active={activeTab} onSelect={selectTab} />

      {activeTab === 'manifest' && (
        <>
        {/* Cari nomor SP — dipindah dari filter bar ATAS ke dalam tab ini
            (5 Sep 2026): hanya relevan untuk manifest, tak ada urusannya dengan
            tab Gudang maupun Laporan. Filter Customer & Tipe SP tetap di ATAS
            karena dipakai tab 1 DAN 2. Masih kosmetik — belum difungsikan. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <div style={{ position: 'relative', minWidth: 200 }}>
            <Search size={13} strokeWidth={1.75} color={C.faint} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              disabled
              placeholder="Cari nomor SP… (segera)"
              style={{ ...body, fontSize: 13, width: '100%', padding: '8px 10px 8px 30px', borderRadius: 4, border: `1px solid ${C.divider}`, background: C.bg, color: C.faint }}
            />
          </div>
        </div>

        {/* 4 — Subjudul Shipping Manifest (kicker dihapus 5 Sep 2026: redundan
            dengan label tab di atasnya) */}
        <div style={{ marginBottom: 14 }}>
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
        {/* Basis pajak ditulis SEKALI di level section. Mengulangnya di tiap
            kartu membuat enam baris identik yang justru berhenti dibaca. */}
        <div style={{ ...mono, fontSize: 9.5, color: C.faint, marginBottom: 8 }}>{PPN_NOTE}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 22 }}>
          {MANIFEST_CARDS.map((c) => (
            <KpiCard
              key={c.key}
              item={{ ...c, label: labelOf(c.key), value: spCardValue(c.key), subValue: spCardSubValue(c.key) }}
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
        <div style={{ ...mono, fontSize: 9.5, color: C.faint, marginBottom: 8 }}>{PPN_NOTE}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
          {EXPIRY_CARDS.map((c) => (
            <KpiCard
              key={c.key}
              warn
              item={{ ...c, label: labelOf(c.key), value: spCardValue(c.key), subValue: spCardSubValue(c.key) }}
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
        <div style={{ marginBottom: 22 }}>
          <DrillTable
            title={labelOf(spCat)}
            rows={spRows}
            kind="sp"
            loading={spRowsLoading}
            onRowClick={onSelectSP}
          />
        </div>

        {/* 9b — Rekap per customer, kategori yang sama dengan tabel di atas */}
        <div style={{ marginBottom: 34 }}>
          <RekapTable
            title={`Rekap per Customer — ${labelOf(spCat)}`}
            groups={rekapGroups}
            total={rekapTotal}
            loading={rekapLoading}
            empty="Tidak ada SP dalam kategori ini."
            footer={`${nf(rekapGroups.length)} customer · ${nf(rekapRows.length)} SP${rekapRows.length >= REKAP_ROW_LIMIT ? ' (menyentuh batas)' : ''}`}
          />
        </div>
        </>
      )}

      {activeTab === 'gudang' && (
        <>
        {/* 10 — Subjudul Warehouse (kicker dihapus 5 Sep 2026: redundan dengan
            label tab, sekaligus menutup selisih nama "Warehouse" vs "Gudang") */}
        <div style={{ marginBottom: 14 }}>
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
        </>
      )}

      {activeTab === 'laporan' && (
        <>
        {/* 14 — Laporan Per Barang ─────────────────────────────────────────── */}
        {/* marginTop:34 diganti marginBottom:14 (5 Sep 2026) — angka 34 itu sisa
            dari saat blok ini menempel di bawah tabel warehouse dalam satu kolom
            panjang. Sebagai elemen pertama TAB-3 ia jadi jarak puncak yang tak
            dimiliki dua tab lain. Kini seragam dengan blok 4 & 10.
            Jarak ke blok 14a TIDAK berubah: 14a punya marginTop:14, dan margin
            sibling yang bersebelahan mengerucut ke max(14,14) = 14. */}
        <div style={{ marginBottom: 14 }}>
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
              <SummaryTile
                label="Total Dipesan"
                value={reportLoading ? '…' : qtyU(report?.summary?.qty_ordered, uom)}
                sub={reportLoading ? null
                  : `dari ${nf(report?.summary?.jml_sp)} SP · ${nf(report?.summary?.jml_customer)} customer`}
              />
              <SummaryTile
                label="Terkirim"
                value={reportLoading ? '…' : qtyU(report?.summary?.qty_shipped, uom)}
                sub={reportLoading ? null : 'sudah dikirim ke customer'}
              />
              <SummaryTile
                label="Belum Dikirim"
                value={reportLoading ? '…' : qtyU(report?.summary?.qty_outstanding, uom)}
                sub={reportLoading ? null : 'sisa yang masih harus dikirim'}
              />
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
                value={reportLoading ? '…' : qtyU(report?.summary?.stok_tersedia, uom)}
                warn={!reportLoading && Number(report?.summary?.defisit) > 0}
                sub={reportLoading ? null
                  : Number(report?.summary?.defisit) > 0
                    ? `defisit ${qtyU(report?.summary?.defisit, uom)}`
                    : 'cukup untuk menutup sisa kirim'}
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
                cols={customerCols}
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
              cols={spCols}
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
        </>
      )}
    </div>
  );
}
