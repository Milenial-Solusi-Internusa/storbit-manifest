// src/modules/logistics/SalesOrderDetailPage.jsx
// Design source: nexus-by-msi/project/sp-detail.html + storbit.css
//
// Data:
//   - items       : enrichedRows filtered by spNo (from App.jsx calcRow)
//   - group       : groupedSP entry (totals, financePct, status, isOverdue)
//   - onSaveItem  : calls dbSaveRow (update sp_items row)
//   - onDeleteItem: calls dbRemoveRow
//   - onDeleteSP  : calls dbRemoveRowsBySp → returns to list
//
// NOTE — soft-delete on sp_items is not yet implemented (no deleted_at column).
// The delete action currently hard-deletes. Add TODO migration before Phase 2.0C.
//
// Shipment / Dokumen / History tabs → empty states (no SP-level tables yet).

import { useState, useCallback, useMemo, useEffect } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  ChevronLeft, Pencil, Trash2, Package,
  Receipt, FileText, Send, Truck, Wallet,
  Check, X, History, Download,
  AlertTriangle, Plus, ClipboardList, ExternalLink, Link2, Eye, EyeOff,
} from 'lucide-react';
import { issueSpBtb, deleteSpBtbNew, listSpBtbNew, setSpExternalUrl, getStockForProducts, getSpOrderStatus, setSpStatus, setSpExpiredDate, getSpFulfillmentDocs, getSpItemDeliveryBreakdown, getSpInvoice, createInvoiceRpc, submitInvoiceRpc, getInvoicePdfData, getCompanyHeader, recordPayment, markTtfReceived, getPaymentHistory, getTtfStatus } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { calcItem, deriveItemShipStatus } from '../../lib/spCalc';
import { getTodayWIB } from '../../lib/dateUtils';
import { PPN_RATE } from '../../lib/taxConstants';
import ProductPicker from '../../components/ProductPicker';
import { useProducts } from '../../hooks/useProducts';
import InvoicePDF from './InvoicePDF';
// @font-face Cormorant/Lora — di-scope ke chunk halaman ini. Lihat header file CSS-nya.
// Import polos (bukan `import styles from`) karena isinya cuma @font-face, nol class.
import './salesOrderDetail.module.css';

// SP = entitas Storbit (SOA) → pin katalog produk ke SOA (pola InputSPPage/DeliveryNote).
const SOA_COMPANY_ID = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

// ─── Design tokens ────────────────────────────────────────────────────────
// Cool/navy palette — senyawa dengan SalesOrderPage (list SP) + DealDetailPage (detail
// Inquiry). Semantik lama (green/steel-blue/mustard/brown) di-remap ke navy #1B4D8A
// dan amber. Tanpa dark green, mustard, teal, coklat.
//
// KOREKSI: baris ini dulu berbunyi "tanpa ungu". Sudah tidak berlaku — aksi utama,
// tab/link, dan seluruh badge status halaman ini kini memakai ungu Storbit, mengikuti
// Claude Design "Detail Surat Pesanan B.dc.html" dan menyamakan diri dengan
// InvoicePDF.jsx yang memang sudah ungu/krem/serif sejak awal (keputusan Den).
// Navy/amber/merah TETAP hidup di elemen non-badge (stat card, MiniBar, modal hapus).
const C = {
  surface:   '#FFFFFF',
  surface2:  '#F4F6F9',
  ink:       '#2A3340',
  inkSoft:   '#6B7686',
  inkFaint:  '#9AA3B2',
  // Divider dipertegas. Nilainya = #201f1d (ink mockup) di-composite ke background
  // halaman #F2F5F9 pada opasitas tetap, jadi hasilnya hex opaque yang aman dipakai
  // di border MAUPUN background. line = 23%, lineSoft = 16% (tingkat divider mockup)
  // — hierarki dua tingkat tetap terjaga, tidak menyatu jadi satu tebal.
  line:      '#C2C4C6',   // was #E7EAF0 (≈5%)
  lineSoft:  '#D0D3D6',   // was #EEF1F5 (≈3%)
  // Ungu Storbit — anchor diambil dari InvoicePDF.jsx (PURPLE #5b3fa0 /
  // PURPLE_DEEP #4a3585) supaya layar & PDF sewarna. Tint pale + border
  // diturunkan di sini dgn mencampur #5b3fa0 ke putih: 10% → accentSoft,
  // 25% → accentBd. Ramp mockup (#7c4fd1 dst) SENGAJA tidak dipakai — cuma
  // perannya yang diambil, basis warnanya ikut token yang sudah ada.
  accent:    '#5b3fa0',
  accentDeep:'#4a3585',
  accentSoft:'#EFECF6',
  accentBd:  '#D6CFE7',
  // Grand Total sengaja TETAP keluarga oranye (accent-2-700 mockup), bukan ungu.
  grandTotal:'#82480F',
  // Oranye "perlu perhatian" — varian ke-4 di luar tiga varian ungu/outline/netral.
  // Hex teksnya sengaja SAMA dengan grandTotal (#82480F) tapi perannya beda, jadi
  // ditulis terpisah supaya tak tertukar saat salah satunya diubah. Tint diturunkan
  // dgn pola yang sama seperti ungu: 10% pada putih → bg, 25% → border.
  attn:      '#82480F',
  attnBg:    '#F3EDE7',
  attnBd:    '#E0D1C3',
  ok:        '#1B4D8A', okBg:  '#EAF0F8', okBd:  '#CFDDF0',   // positive/done → navy (was dark green)
  warn:      '#B5772A', warnBg:'#FBEEDD', warnBd:'#E6CE94',   // amber (list SP)
  danger:    '#C0392B', dangerBg:'#FBEAE8', dangerBd:'#E6BBB2',
  info:      '#1B4D8A', infoBg:'#EAF0F8', infoBd:'#CFDDF0',   // navy (was steel-blue)
  neutral:   '#6B7686', neutralBg:'#EEF1F5', neutralBd:'#DDE2EA',
  // orange/orangeBg/orangeBd dihapus — nol pemakaian setelah aksi & badge pindah
  // ke keluarga ungu. Satu-satunya sisa oranye di halaman ini adalah `grandTotal`
  // (disengaja) + palet hash `custColor` (identitas customer, bukan status).
  yellow:    '#B5772A', yellowBg:'#FBEEDD', yellowBd:'#E6CE94',   // amber (was mustard)
  purple:    '#B5772A', purpleBg:'#FBEEDD', purpleBd:'#E6CE94',   // amber (was ungu; sisa: stage Faktur Pajak)
  slate:     '#525E70', slateBg:'#EDF0F4', slateBd:'#D7DDE6',   // PICKING/PACKED — slate-blue soft (samain badge Picking List)
};

// ─── Tipografi & skala spasi (dari design system mockup) ──────────────────
// FONT_DISPLAY = --font-heading (Cormorant Garamond 600) → nomor dokumen, judul
// card, label kicker, teks tab, tombol. FONT_TEXT = --font-body (Lora 400/600).
// Identifier inline (nomor SP di breadcrumb, kolom angka tabel) SENGAJA tetap
// IBM Plex Mono — konvensi lintas halaman, mockup sendiri nol monospace.
const FONT_DISPLAY = "'Storbit Display', 'Cormorant Garamond', Georgia, serif";
const FONT_TEXT    = "'Storbit Text', Lora, Georgia, serif";
const FONT_MONO    = "'IBM Plex Mono', ui-monospace, monospace";

// Skala spasi & radius mockup — dipakai apa adanya (bukan dibulatkan) supaya
// ritme vertikalnya sama persis dengan file desain.
const SP = { s1: 4.6, s2: 9.2, s3: 13.8, s4: 18.4, s6: 27.6 };
const RADIUS = { sm: 2, md: 4, lg: 7 };

// .card-kicker mockup. Catatan: design system dasarnya mewarnai kicker dgn accent,
// TAPI file desain ini meng-override-nya jadi muted 60% — kita ikut override itu.
const kickerStyle = {
  fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkSoft,
};
// .card-title mockup (17px) — dipakai judul card Overview.
const cardTitleStyle = {
  fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: 1.2, color: C.ink,
};
// .table th mockup.
const thStyle = {
  fontSize: 11, fontWeight: 400, letterSpacing: '.08em', textTransform: 'uppercase',
  color: C.inkSoft, padding: SP.s2, textAlign: 'left',
};

// ─── Vokabular badge (3 varian) ───────────────────────────────────────────
// Mengikuti statusTagCls() dari Claude Design "Detail Surat Pesanan B.dc.html":
// hanya tiga varian, semuanya satu hue + abu — tanpa hijau/amber/merah semantik.
// Aturan pemetaan yang dipakai konsisten di seluruh halaman ini:
//   PALE    → selesai / terpenuhi / positif
//   OUTLINE → sedang berjalan ATAU butuh perhatian (aktif, belum selesai)
//   NEUTRAL → belum mulai / inert / informasi netral
const TAG_PALE    = { bg: C.accentSoft, color: C.accentDeep, bd: C.accentBd };
const TAG_OUTLINE = { bg: 'transparent', color: C.accent,    bd: C.accent   };
const TAG_NEUTRAL = { bg: C.neutralBg,   color: C.neutral,   bd: C.neutralBd };
// Varian ke-4, PENGECUALIAN sempit: hanya untuk kondisi yang menuntut perhatian
// (stok kurang, invoice belum diterbitkan, menunggu konfirmasi DC). Sumber
// desain memang punya 4 warna semantik, oranye terpisah dari status siklus
// hidup biasa. Badge status lain TETAP tiga varian di atas — ini bukan
// pembatalan keputusan itu.
const TAG_ATTN    = { bg: C.attnBg,      color: C.attn,      bd: C.attnBd   };

// ─── Helpers ───────────────────────────────────────────────────────────────
// Cegah scroll roda mouse mengubah nilai input type=number saat ter-focus.
const blurOnWheel = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.blur(); };
// Pilih seluruh isi saat focus → ketikan menimpa nilai default (0), tak ter-append.
const selectOnFocus = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.select(); };
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
// Tabel Baris Pesanan pakai 2 desimal, mengikuti rp()/qtyFmt di mockup.
const DEC2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const num2 = (n) => (Number(n) || 0).toLocaleString('id-ID', DEC2);
const rp2  = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID', DEC2);

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function finColor(pct) {
  if (pct < 30) return C.danger;
  if (pct <= 70) return C.warn;
  return C.ok;
}

function custColor(name) {
  // Tint chip customer — cool/navy only (navy/orange/amber/red/slate), no teal/coklat/ungu.
  const PALETTE = [
    { bg: '#EAF0F8', ink: '#1B4D8A' },
    { bg: '#FBEAE8', ink: '#C0392B' },
    { bg: '#FEF2EC', ink: '#E85A1E' },
    { bg: '#FBEEDD', ink: '#B5772A' },
    { bg: '#EDF0F4', ink: '#525E70' },
    { bg: '#EEF1F5', ink: '#6B7686' },
    { bg: '#FCEAE6', ink: '#C15A44' },
    { bg: '#EAF0F8', ink: '#143C6E' },
  ];
  if (!name) return { bg: C.neutralBg, ink: C.neutral };
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}

// Nilai `status` di sini datang dari deriveItemShipStatus (spCalc.js), BUKAN
// lagi dari calcItem — bedanya cuma satu nilai tambahan, 'AwaitingDC'.
function itemStatusMeta(status) {
  if (status === 'Closed')  return { ...TAG_PALE,    label: 'Shipped' };   // terkirim penuh → selesai
  // Qty berangkat penuh tapi SJ-nya masih 'in_transit' — menunggu konfirmasi tim
  // DC customer. ATTN, bukan PALE: keadaan ini menuntut perhatian dan BELUM
  // selesai; memberinya PALE akan mengulang kebohongan yang justru dihapus
  // state MENUNGGU_KONFIRMASI_DC. Selaras badge header di HEADLINE_META.
  if (status === 'AwaitingDC') return { ...TAG_ATTN, label: 'Menunggu Konfirmasi' };
  if (status === 'Partial') return { ...TAG_OUTLINE, label: 'Parsial' };   // sebagian dikirim → berjalan
  return                           { ...TAG_NEUTRAL, label: 'Open'    };   // belum mulai
}

// ─── Shared atoms ──────────────────────────────────────────────────────────

function Badge({ bg, color, bd, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color, border: `1px solid ${bd}`,
      // Rounded-rect tipis, BUKAN pill — semua badge di halaman ini lewat komponen
      // ini, jadi satu perubahan di sini berlaku konsisten ke seluruh badge.
      fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 3, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// FASE 2E — status headline SP (sp_orders 13 tahap) → badge Detail SP. Warna kalem,
// semua badge tint + teks senada (tanpa blok solid, tanpa dark green). Selaras STATUS_META di SalesOrderPage.
const HEADLINE_META = {
  DRAFT:          { label: 'Draft',          ...TAG_NEUTRAL },   // belum mulai
  CONFIRMED:      { label: 'Dikonfirmasi',   ...TAG_OUTLINE },   // 'Confirmed' → outline (eksplisit di mockup)
  MENUNGGU_STOK:  { label: 'Menunggu Stok',  ...TAG_OUTLINE },   // stockFlag 'menunggu' → outline (eksplisit di mockup)
  PICKING:        { label: 'Picking',        ...TAG_OUTLINE },   // berjalan
  PACKED:         { label: 'Dikemas',        ...TAG_OUTLINE },   // berjalan
  DIKIRIM:        { label: 'Dikirim',        ...TAG_OUTLINE },   // analog 'Proses'/'Sebagian Dikirim'
  SAMPAI:         { label: 'Sampai',         ...TAG_PALE    },   // analog 'Terkirim'
  // Qty berangkat penuh tapi SJ masih 'in_transit' — ATTN, bukan PALE: belum
  // selesai dan menunggu aksi tim DC customer (migrasi 20260826000002).
  MENUNGGU_KONFIRMASI_DC: { label: 'Menunggu Konfirmasi DC', ...TAG_ATTN },
  BTB_TERBIT:     { label: 'BTB Terbit',     ...TAG_PALE    },   // milestone tercapai
  TERKIRIM_PENUH: { label: 'Terkirim Penuh', ...TAG_PALE    },   // analog 'Terkirim'
  INVOICED:       { label: 'Invoiced',       ...TAG_PALE    },   // milestone tercapai
  SUBMITTED:      { label: 'Submitted',      ...TAG_PALE    },   // milestone tercapai
  LUNAS:          { label: 'Lunas',          ...TAG_PALE    },   // analog 'Selesai'
  CANCELLED:      { label: 'Dibatalkan',     ...TAG_NEUTRAL },   // cabang `else` mockup — lihat catatan ambigu di laporan
};

// Status Surat Jalan (delivery_notes) -> badge timeline tab Shipment.
// LABEL disamakan verbatim dengan DeliveryNotePage.jsx:23-26 supaya user membaca
// istilah yang sama di daftar SJ, detail SJ, dan di sini.
// WARNA mengikuti 3 varian TAG halaman ini, BUKAN palet amber/green/rose halaman
// daftar — halaman ini sudah punya vokabular warnanya sendiri (lihat catatan di
// TAG_ATTN). draft & cancelled sama-sama netral, persis perlakuan
// DRAFT/CANCELLED di HEADLINE_META; labelnya yang membedakan.
const DN_STATUS_META = {
  draft:      { label: 'Draft',            ...TAG_NEUTRAL },
  in_transit: { label: 'Dalam Pengiriman', ...TAG_OUTLINE },
  delivered:  { label: 'Terkirim',         ...TAG_PALE    },
  cancelled:  { label: 'Dibatalkan',       ...TAG_NEUTRAL },
};

// Qty SJ draft/cancelled TIDAK dihitung sebagai terkirim (keputusan Den, 26 Agu
// 2026). Bukan kosmetik: `draft` belum menaikkan sp_items.shipped_qty sama
// sekali (baru terjadi di dispatch_delivery), dan `cancelled` sudah dibalik lagi
// oleh cancel_delivery. Angkanya tetap DITAMPILKAN supaya isi SJ terlihat, tapi
// diberi penanda agar tak dibaca sebagai barang yang sudah sampai customer.
const DN_QTY_NOTE = { draft: 'belum dihitung', cancelled: 'dibatalkan' };

// Status Picking List -> badge di card "Dokumen Terkait" (tab Dokumen).
// Label verbatim dari PickingListPage.jsx:28-31, warna dari palet halaman ini.
const PICK_STATUS_META = {
  pending:     { label: 'Menunggu',       ...TAG_NEUTRAL },
  in_progress: { label: 'Sedang Diambil', ...TAG_OUTLINE },
  done:        { label: 'Selesai',        ...TAG_PALE    },
  cancelled:   { label: 'Dibatalkan',     ...TAG_NEUTRAL },
};

// ─── Finance status stages config ─────────────────────────────────────────
const FIN_STAGES = [
  { key: 'inv',    label: 'Invoice',      icon: Receipt,  cls: C.infoBg,    clsColor: C.info    },
  { key: 'fp',     label: 'Faktur Pajak', icon: FileText, cls: C.purpleBg,  clsColor: C.purple  },
  { key: 'submit', label: 'Submit',        icon: Send,     cls: C.accentSoft,clsColor: C.accent  },
  { key: 'kirim',  label: 'Kirim',         icon: Truck,    cls: C.okBg,      clsColor: C.ok      },
];

// ─── Edit Item Modal helpers (defined outside to avoid re-render issues) ────
const EMAIL_OPTIONS = ['Belum dikirim', 'Terkirim ke customer', 'Dibalas customer'];

function ModalField({ label, req, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
        {label}{req && <span style={{ color: C.danger }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ModalInp({ readOnly, mono, ...rest }) {
  return (
    <input
      readOnly={readOnly}
      {...rest}
      onWheel={blurOnWheel}
      style={{
        height: 38, padding: '0 11px', border: `1px solid ${C.line}`, borderRadius: 8,
        background: readOnly ? C.surface2 : C.surface, fontSize: 13, color: C.ink,
        outline: 'none', fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit',
        cursor: readOnly ? 'not-allowed' : 'text', width: '100%', boxSizing: 'border-box',
        ...rest.style,
      }}
    />
  );
}

function ModalSect({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: C.inkFaint, padding: '16px 0 8px', borderTop: `1px solid ${C.lineSoft}` }}>
      {children}
    </div>
  );
}

function ModalGrid({ cols, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px 16px' }}>
      {children}
    </div>
  );
}

function EditItemModal({ item, spExpiredDate, spDc, spDate, spNo, customer, onClose, onSave }) {
  // Katalog produk (dropdown-only) di-pin ke Storbit/SOA.
  const { products } = useProducts({ companyId: SOA_COMPANY_ID });
  const [draft, setDraft] = useState({
    productId:    item.productId   ?? null,
    productName: item.productName || '',
    sku:          item.sku         || '',
    // `dc` SENGAJA TIDAK ADA di draft. DC tujuan adalah atribut HEADER
    // (sp_orders.dc_id → dc_master), ditampilkan read-only dari prop `spDc`.
    // Dulu di sini ada teks bebas yang menulis sp_items.dc — kolom LEGACY yang
    // tak pernah dibaca Surat Jalan, sehingga mengubahnya terasa seperti
    // memperbaiki alamat kirim padahal tidak. Lihat catatan di handleSave.
    qty:          item.qty         ?? 0,
    shippedQty:   item.shippedQty  ?? 0,
    expDate:      item.expDate     || '',
    // KOSMETIK — bukan lagi garis pertahanan. Sejak migrasi 20260825000001,
    // update_sp_item_dual TIDAK LAGI memuat expired_date di daftar UPDATE-nya,
    // jadi apa pun yang dikirim payload untuk kolom itu DIABAIKAN DB: proteksi
    // sebenarnya kini ada di level RPC, bukan di baris ini. Dipertahankan agar
    // bentuk draft tetap utuh (spToDb tak berubah) dan nilainya mengikuti
    // header supaya draft tak pernah kosong. ⚠️ Kalau suatu saat expired_date
    // DIKEMBALIKAN ke daftar UPDATE RPC itu, baris ini jadi load-bearing lagi.
    expired_date: spExpiredDate || item.expired_date || '',
    shippingDate:           item.shippingDate          || '',
    slaDays:                item.slaDays               ?? '',
    estimatedDeliveryDate:  item.estimatedDeliveryDate || '',
    arrival_date:           item.arrival_date           || '',
    unitPrice:              item.unitPrice             ?? 0,
    shippingPrice:item.shippingPrice?? 0,
    inv:          !!item.inv,
    fp:           !!item.fp,
    submit:       !!item.submit,
    kirim:        !!item.kirim,
    submitDate:   item.submitDate  || '',
    emailStatus:  item.emailStatus || EMAIL_OPTIONS[0],
    notes:        item.notes       || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  // Dropdown-only: item yang SUDAH tertaut wajib tetap tertaut (cegah unlink tak sengaja).
  // Item legacy (product_id null) boleh disimpan tanpa memilih (lenient) — keputusan user.
  const wasLinked = !!item.productId;

  // Auto-calc estimatedDeliveryDate from shippingDate + slaDays
  useEffect(() => {
    if (draft.shippingDate && draft.slaDays !== '' && draft.slaDays != null) {
      const shipping = new Date(draft.shippingDate);
      shipping.setDate(shipping.getDate() + parseInt(draft.slaDays));
      setDraft(prev => ({ ...prev, estimatedDeliveryDate: shipping.toISOString().split('T')[0] }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.shippingDate, draft.slaDays]);

  // Auto-calculated fields
  const outstanding = Math.max(0, Number(draft.qty) - Number(draft.shippedQty));
  const subtotal    = Number(draft.qty) * Number(draft.unitPrice);
  const ppn         = Math.round(subtotal * PPN_RATE);
  const grandTotal  = subtotal + ppn + Number(draft.shippingPrice);

  function autoStatus() {
    const q = Number(draft.qty), s = Number(draft.shippedQty), out = Math.max(0, q - s);
    if (s > 0 && out === 0) return { ...TAG_PALE,    label: 'Shipped'   };
    if (s > 0 && out > 0)   return { ...TAG_OUTLINE, label: 'Parsial'   };
    if (q > 0)              return { ...TAG_OUTLINE, label: 'Confirmed' };
    return                         { ...TAG_NEUTRAL, label: 'Open'      };
  }

  // `dc` masih ikut terkirim ke update_sp_item_dual lewat spread `...item` —
  // ECHO-BACK yang DISENGAJA, bukan kelalaian. Alasannya berlapis:
  //   1. spToDb() (db.js) SELALU memancarkan key `dc` dan dipakai bersama jalur
  //      create (bulkInsertSpItems) yang memang wajib menulis kolom itu.
  //   2. sp_items.dc = NOT NULL DEFAULT ''. Menghapus key-nya dari payload
  //      membuat jsonb_populate_record mengisi NULL → not_null_violation →
  //      SELURUH Save di modal ini gagal. Mengirim '' juga bukan jalan keluar:
  //      itu MENGHAPUS DC legacy yang masih memasok kolom/filter DC SP Manifest,
  //      grouping byDC, Dashboard, dan peta region Indomarco Dashboard.
  // Karena `dc` sudah dicabut dari draft, nilai yang dikirim SELALU sama persis
  // dengan yang ada di DB → RPC menulis balik nilai identik (no-op). Efek nyata:
  // modal ini TIDAK BISA LAGI mengubah sp_items.dc.
  // ⚠️ JANGAN "membersihkan" ini dengan menghapus `dc` dari payload — itu
  // memecahkan Save. Pencabutan sejati harus di RPC (preseden expired_date,
  // migrasi 20260825000001) dan itu perubahan DB, task terpisah.
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...item,
        ...draft,
        qty:          Number(draft.qty),
        shippedQty:   Number(draft.shippedQty),
        unitPrice:    Number(draft.unitPrice),
        shippingPrice:Number(draft.shippingPrice),
      });
    } finally {
      setSaving(false);
    }
  };

  const st = autoStatus();

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,14,.42)', backdropFilter: 'blur(2px)', zIndex: 80 }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 81, width: '100%', maxWidth: 760, maxHeight: '90vh',
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: RADIUS.lg,
        boxShadow: '0 12px 34px rgba(20,30,45,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 13, padding: '18px 22px 14px',
          borderBottom: `1px solid ${C.lineSoft}`, background: C.surface, flexShrink: 0,
        }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.accentSoft, color: C.accent }}>
            <Pencil size={19}/>
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-.3px' }}>Edit Item</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: C.inkFaint }}>{draft.productName || '—'}</p>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.inkFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15}/>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '0 22px 8px', flex: 1 }}>
          {/* SP Info */}
          <ModalSect>SP Information</ModalSect>
          <ModalGrid cols={3}>
            <ModalField label="SP Date"><ModalInp value={fmtDate(spDate)} readOnly/></ModalField>
            <ModalField label="SP No"><ModalInp value={spNo} readOnly mono/></ModalField>
            <ModalField label="Customer"><ModalInp value={customer || '—'} readOnly/></ModalField>
          </ModalGrid>

          {/* Produk */}
          <ModalSect>Produk</ModalSect>
          <ModalGrid cols={3}>
            <ModalField label="Product Name" req>
              {/* Dropdown-only: produk hanya dari master (SOA). onPick sinkronkan
                  product_id + SKU + nama (tutup desync). onChangeText batalkan pilihan.
                  unit_price TIDAK di-prefill di sini (tetap snapshot yang ada). */}
              <ProductPicker
                value={draft.productName}
                products={products}
                placeholder="Cari produk…"
                inputStyle={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, fontSize: 13, color: C.ink, outline: 'none' }}
                onChangeText={(v) => setDraft(prev => ({ ...prev, productName: v, productId: null, sku: '' }))}
                onPick={(p) => setDraft(prev => ({ ...prev, productId: p.id, productName: p.name, sku: p.code || '' }))}
              />
            </ModalField>
            <ModalField label="SKU"><ModalInp value={draft.sku} readOnly mono/></ModalField>
            {/* DC Tujuan — READ-ONLY, sumbernya sp_orders.dc_id → dc_master
                (prop `spDc`), BUKAN sp_items.dc yang legacy. Tanda `req`
                dicabut: ini bukan input lagi. Pola terkunci = Unit Price di
                bawah (ModalInp readOnly + helper text). DC hanya bisa berubah
                lewat header SP; hari ini belum ada jalur UI untuk itu, jadi
                sengaja TANPA tombol edit — jangan pasang affordance palsu. */}
            <ModalField label="DC Tujuan">
              <ModalInp value={spDc?.nama || '—'} readOnly/>
              <div style={{ fontSize: 11, color: C.inkFaint }}>
                {spDc?.alamat || 'Terkunci — ditentukan di header SP'}
              </div>
            </ModalField>
          </ModalGrid>

          {/* Quantity */}
          <ModalSect>Quantity</ModalSect>
          <ModalGrid cols={3}>
            <ModalField label="QTY" req>
              <ModalInp type="number" value={draft.qty} onFocus={selectOnFocus} onChange={e => set('qty', e.target.value.replace(/^0+(?=\d)/, ''))}/>
            </ModalField>
            <ModalField label="Shipped QTY"><ModalInp value={draft.shippedQty} readOnly/></ModalField>
            <ModalField label="Outstanding">
              <ModalInp value={outstanding} readOnly style={{ color: outstanding > 0 ? C.warn : C.ink }}/>
            </ModalField>
          </ModalGrid>

          {/* Tanggal */}
          <ModalSect>Tanggal</ModalSect>
          {/* "Expired Date" per-item DIHAPUS (batch 2, 25 Agu 2026): tenggat SP
              adalah atribut level HEADER — diedit di kartu "SP Date & Expired"
              lewat RPC set_sp_expired_date, bukan per baris item.
              "Exp Date" (exp_date) SENGAJA DIPERTAHANKAN — kolom mati dengan
              isu terpisah, dijadwalkan drop di M13. Jangan ikut dibuang di sini. */}
          <ModalGrid cols={2}>
            <ModalField label="Exp Date">
              <ModalInp type="date" value={draft.expDate} onChange={e => set('expDate', e.target.value)}/>
            </ModalField>
            <ModalField label="Shipping Date">
              <ModalInp type="date" value={draft.shippingDate} onChange={e => set('shippingDate', e.target.value)}/>
            </ModalField>
          </ModalGrid>
          <ModalGrid cols={3}>
            <ModalField label="SLA (hari)">
              <ModalInp type="number" value={draft.slaDays} placeholder="cth: 3" onChange={e => set('slaDays', e.target.value)}/>
            </ModalField>
            <ModalField label="Estimated Delivery">
              <ModalInp type="date" value={draft.estimatedDeliveryDate} onChange={e => set('estimatedDeliveryDate', e.target.value)}/>
            </ModalField>
            <ModalField label="Arrival Date">
              <ModalInp type="date" value={draft.arrival_date} onChange={e => set('arrival_date', e.target.value)}/>
            </ModalField>
          </ModalGrid>

          {/* Pricing */}
          <ModalSect>Pricing</ModalSect>
          <div className="nx-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 12 }}>
            <ModalField label="Unit Price (Rp)" req>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.inkFaint, pointerEvents: 'none' }}>Rp</span>
                {/* Terkunci — menampilkan snapshot tersimpan (draft.unitPrice); harga hanya berubah lewat Master Product. */}
                <input type="number" value={draft.unitPrice} readOnly onWheel={blurOnWheel}
                  style={{ height: 38, paddingLeft: 32, paddingRight: 11, border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface2, fontSize: 13, color: C.inkSoft, outline: 'none', fontFamily: "'IBM Plex Mono',monospace", width: '100%', boxSizing: 'border-box', cursor: 'not-allowed' }}/>
              </div>
              <div style={{ fontSize: 11, color: C.inkFaint }}>Terkunci — ubah lewat Master Product</div>
            </ModalField>
            <ModalField label="Shipping Price (Rp)">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.inkFaint, pointerEvents: 'none' }}>Rp</span>
                <input type="number" value={draft.shippingPrice} onFocus={selectOnFocus} onChange={e => set('shippingPrice', e.target.value.replace(/^0+(?=\d)/, ''))} onWheel={blurOnWheel}
                  style={{ height: 38, paddingLeft: 32, paddingRight: 11, border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, fontSize: 13, color: C.ink, outline: 'none', fontFamily: "'IBM Plex Mono',monospace", width: '100%', boxSizing: 'border-box' }}/>
              </div>
            </ModalField>
          </div>
          {/* Calc row */}
          <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', background: C.surface2, marginBottom: 4 }}>
            {[
              { label: 'Subtotal',    value: rp(subtotal),   color: null      },
              { label: 'PPN (11%)',   value: rp(ppn),        color: null      },
              { label: 'Grand Total', value: rp(grandTotal), color: C.grandTotal },
              { label: 'Auto Status', value: null,            status: st      },
            ].map((cc, i, arr) => (
              <div key={cc.label} style={{ padding: '11px 14px', borderRight: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint }}>{cc.label}</div>
                {cc.status ? (
                  <div style={{ marginTop: 4 }}>
                    <Badge bg={cc.status.bg} color={cc.status.color} bd={cc.status.bd}>
                      {cc.status.label}
                    </Badge>
                  </div>
                ) : (
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, fontWeight: 600, marginTop: 4, color: cc.color || C.ink }}>{cc.value}</div>
                )}
              </div>
            ))}
          </div>

          {/* Finance */}
          <ModalSect>Finance &amp; Dokumen</ModalSect>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { key: 'inv',    label: 'INV'    },
              { key: 'fp',     label: 'FP'     },
              { key: 'submit', label: 'SUBMIT' },
              { key: 'kirim',  label: 'KIRIM'  },
            ].map(({ key, label }) => (
              <label key={key} onClick={() => set(key, !draft[key])} style={{
                flex: 1, minWidth: 110, display: 'flex', alignItems: 'center', gap: 9,
                padding: '11px 13px', border: `1px solid ${draft[key] ? C.okBd : C.line}`,
                borderRadius: 10, background: draft[key] ? C.okBg : C.surface,
                cursor: 'pointer', userSelect: 'none', transition: '.12s',
              }}>
                <div style={{ width: 34, height: 20, borderRadius: 11, background: draft[key] ? C.accent : C.line, position: 'relative', flexShrink: 0, transition: '.15s' }}>
                  <div style={{ position: 'absolute', top: 2, left: draft[key] ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }}/>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.3px' }}>{label}</span>
              </label>
            ))}
          </div>
          <div className="nx-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <ModalField label="Submit Date">
              <ModalInp type="date" value={draft.submitDate} onChange={e => set('submitDate', e.target.value)}/>
            </ModalField>
            <ModalField label="Email Status">
              <select value={draft.emailStatus} onChange={e => set('emailStatus', e.target.value)}
                style={{ height: 38, padding: '0 11px', border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', width: '100%' }}>
                {EMAIL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </ModalField>
          </div>

          {/* Notes */}
          <ModalSect>Notes</ModalSect>
          <div style={{ paddingBottom: 12 }}>
            <ModalField label="Catatan Tambahan">
              <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} placeholder="Opsional — catatan untuk item ini…"
                style={{ width: '100%', minHeight: 72, padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, fontSize: 13, color: C.ink, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}/>
            </ModalField>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px 18px', borderTop: `1px solid ${C.lineSoft}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || (wasLinked && !draft.productId)}
            title={wasLinked && !draft.productId ? 'Pilih produk dari dropdown' : undefined}
            style={{ height: 38, padding: '0 18px', borderRadius: 9, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontSize: 13, fontWeight: 700, cursor: (saving || (wasLinked && !draft.productId)) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: (saving || (wasLinked && !draft.productId)) ? .7 : 1 }}>
            <Check size={15}/>{saving ? 'Menyimpan…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Delete SP Modal ────────────────────────────────────────────────────────
function DeleteModal({ spNo, group, onClose, onConfirm }) {
  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const confirmed = input.trim().toUpperCase() === spNo.toUpperCase();

  const handleConfirm = async () => {
    if (!confirmed) return;
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,14,.42)', backdropFilter: 'blur(2px)', zIndex: 80 }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 81, width: '100%', maxWidth: 440,
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: RADIUS.lg,
        boxShadow: '0 12px 34px rgba(20,30,45,.18)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '20px 22px 14px' }}>
          <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.dangerBg, color: C.danger }}>
            <AlertTriangle size={21}/>
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.25 }}>
              Hapus {spNo} dari {group?.customer}?
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>
              Tindakan ini permanen dan tidak dapat dibatalkan. Seluruh data SP, item, shipment, dan dokumen akan dihapus.
            </p>
          </div>
        </div>
        <div style={{ padding: '0 22px 4px' }}>
          <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, background: C.surface2, overflow: 'hidden', marginBottom: 14 }}>
            {[
              { k: 'Customer',    v: (() => { const { bg, ink } = custColor(group?.customer); return <span style={{ display: 'inline-flex', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 6, background: bg, color: ink }}>{group?.customer}</span>; })() },
              { k: 'Items',       v: `${group?.itemCount || 0} produk · ${(group?.totalQty || 0).toLocaleString('id-ID')} qty` },
              { k: 'Grand Total', v: rp(group?.grandTotal) },
            ].map(({ k, v }, i, arr) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', fontSize: 12.5, borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : 'none' }}>
                <span style={{ color: C.inkFaint, fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 700, textAlign: 'right', fontFamily: typeof v === 'string' && v.startsWith('Rp') ? "'IBM Plex Mono',monospace" : 'inherit' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, display: 'block', marginBottom: 6 }}>
              Ketik <code style={{ fontFamily: "'IBM Plex Mono',monospace", background: C.surface2, border: `1px solid ${C.line}`, padding: '1px 6px', borderRadius: 5, color: C.danger, fontWeight: 600 }}>{spNo}</code> untuk konfirmasi
            </label>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={spNo}
              autoComplete="off"
              style={{ width: '100%', height: 40, borderRadius: 9, border: `1px solid ${confirmed ? C.danger : C.line}`, background: C.surface, padding: '0 12px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '18px 22px 20px' }}>
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || loading}
            style={{ height: 38, padding: '0 18px', borderRadius: 9, border: 'none', background: C.danger, color: '#fff', fontSize: 13, fontWeight: 700, cursor: confirmed && !loading ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: confirmed && !loading ? 1 : .45 }}>
            <Trash2 size={15}/>{loading ? 'Menghapus…' : 'Ya, Hapus Permanen'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Cancel SP modal (status → CANCELLED; minta alasan) ──────────────────────
function CancelModal({ spNo, group, onClose, onConfirm }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const ok = reason.trim().length > 0;

  const handleConfirm = async () => {
    if (!ok) return;
    setLoading(true);
    await onConfirm(reason.trim());
    setLoading(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,14,.42)', backdropFilter: 'blur(2px)', zIndex: 80 }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 81, width: '100%', maxWidth: 440,
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: RADIUS.lg,
        boxShadow: '0 12px 34px rgba(20,30,45,.18)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '20px 22px 14px' }}>
          <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.dangerBg, color: C.danger }}>
            <X size={21}/>
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.25 }}>
              Batalkan {spNo} dari {group?.customer}?
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>
              Status SP akan menjadi <b>Dibatalkan</b>. Data SP tetap tersimpan (bukan dihapus). Tindakan ini dicatat di history.
            </p>
          </div>
        </div>
        <div style={{ padding: '0 22px 4px' }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: C.inkSoft, display: 'block', marginBottom: 6 }}>
            Alasan pembatalan <span style={{ color: C.danger }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Tuliskan alasan SP dibatalkan…"
            style={{ width: '100%', borderRadius: 9, border: `1px solid ${ok ? C.line : C.dangerBd}`, background: C.surface, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13.5, color: C.ink, outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '18px 22px 20px' }}>
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!ok || loading}
            style={{ height: 38, padding: '0 18px', borderRadius: 9, border: 'none', background: C.danger, color: '#fff', fontSize: 13, fontWeight: 700, cursor: ok && !loading ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: ok && !loading ? 1 : .45 }}>
            <X size={15}/>{loading ? 'Membatalkan…' : 'Ya, Batalkan SP'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────────
// Gaya tab mockup: teks polos + garis bawah accent saat aktif. Ikon & pill counter
// dilepas — aktif memakai FONT_DISPLAY 600, non-aktif FONT_TEXT dgn opacity .55.
// Counter dipertahankan sebagai angka muted di belakang label (mockup tak punya
// counter sama sekali; ini penambahan minimal agar informasinya tak hilang).
function TabBtn({ active, onClick, label, count }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      padding: '0 0 10px', fontSize: 14,
      fontFamily: active ? FONT_DISPLAY : FONT_TEXT,
      fontWeight: active ? 600 : 400,
      color: C.ink, opacity: active ? 1 : .55,
      borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline', gap: SP.s1,
      marginBottom: -1,
    }}>
      {label}
      {count != null && (
        <span style={{ fontSize: 11, opacity: .55 }}>{count}</span>
      )}
    </button>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ width: 72, height: 72, borderRadius: 18, background: C.surface2, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkFaint, marginBottom: 16 }}>
        <Icon size={34} strokeWidth={1.4}/>
      </div>
      <b style={{ fontSize: 15, color: C.ink }}>{title}</b>
      <span style={{ fontSize: 13, color: C.inkSoft, margin: '5px 0 0', maxWidth: 340, lineHeight: 1.5 }}>{sub}</span>
    </div>
  );
}

// Satu baris dokumen di card "Dokumen Terkait" (tab Dokumen).
// `onOpen` OPSIONAL dan sengaja begitu: BTB & Invoice belum punya halaman detail
// sendiri (keduanya dirender inline di halaman ini), jadi barisnya memang tidak
// bisa diklik — bukan kelalaian. Baris tanpa onOpen tampil non-interaktif penuh:
// nol cursor pointer, nol role/tabIndex, nol handler keyboard.
function DocRow({ icon: Icon, no, badge, meta, onOpen }) {
  const clickable = typeof onOpen === 'function';
  return (
    <div
      onClick={clickable ? onOpen : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
      title={clickable ? 'Buka detail dokumen' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap',
        border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md,
        padding: `${SP.s2}px ${SP.s3}px`, background: C.surface,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <Icon size={14} style={{ color: clickable ? C.accent : C.inkFaint, flexShrink: 0 }}/>
      <b style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: C.ink }}>{no}</b>
      {badge && <Badge bg={badge.bg} color={badge.color} bd={badge.bd}>{badge.label}</Badge>}
      {meta && <span style={{ fontSize: 12, color: C.inkSoft }}>{meta}</span>}
    </div>
  );
}

function DocGroup({ title, children }) {
  return (
    <div style={{ marginBottom: SP.s3 }}>
      <div style={{ ...kickerStyle, marginBottom: SP.s1 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s1 }}>{children}</div>
    </div>
  );
}

// ─── Preview dokumen SP (on-screen, bukan PDF) ───────────────────────────────
// Presentasi murni — semua angka dioper dari pemanggil (grandTotal memakai
// perhitungan calcItem yang sama dengan Financial Summary, bukan hitung sendiri,
// supaya tak ada dua sumber angka yang bisa melenceng).
// Box preview mengikuti sumber mockup persis (hasil decode bundle standalone):
// neutral-100 #F8F4F4 + border divider + shadow-md + radius-md + padding
// space-6/space-4. Ini SATU-SATUNYA elemen halaman yang memang ber-shadow —
// `.card` di design system justru transparan tanpa shadow.
function SpDocPreview({ company, spNo, spDate, customer, lines, grandTotal }) {
  const companyName = company?.legal_name || company?.name || 'PT Stuja Orbit Abadi';
  const companyAddr = [company?.address, company?.address_2, company?.city, company?.province, company?.postal_code]
    .filter(Boolean).join(', ');

  return (
    <div style={{ background: '#F8F4F4', border: `1px solid ${C.line}`, boxShadow: '0 3px 10px rgba(45,43,43,.16)', borderRadius: RADIUS.md, padding: `${SP.s6}px ${SP.s4}px` }}>
      {/* Kop surat */}
      <div style={{ paddingBottom: 11, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ ...cardTitleStyle, fontSize: 15 }}>{companyName}</div>
        <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{companyAddr || '—'}</div>
      </div>

      {/* Judul dokumen */}
      <div style={{ textAlign: 'center', padding: '14px 0 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.ink }}>Surat Pesanan Penjualan</div>
        <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 3, fontFamily: "'IBM Plex Mono',monospace" }}>
          No. {spNo || '—'} · {fmtDate(spDate)}
        </div>
      </div>

      {/* Tujuan */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11.5, color: C.inkSoft }}>Kepada Yth,</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginTop: 1 }}>{customer || '—'}</div>
      </div>

      {/* Tabel produk */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {[['Produk', 'left'], ['Qty', 'right'], ['Jumlah', 'right']].map(([h, align]) => (
              <th key={h} style={{ ...thStyle, textAlign: align, padding: `0 0 ${SP.s1}px`, borderBottom: `1px solid ${C.line}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr><td colSpan={3} style={{ padding: '12px 0', fontSize: 12, color: C.inkFaint, textAlign: 'center' }}>Belum ada item.</td></tr>
          ) : lines.map(l => (
            <tr key={l.id}>
              <td style={{ padding: '7px 8px 7px 0', fontSize: 12, color: C.ink, borderBottom: `1px solid ${C.lineSoft}` }}>{l.productName || '—'}</td>
              <td style={{ padding: '7px 8px', fontSize: 12, textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", color: C.inkSoft, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{Number(l.qty || 0).toLocaleString('id-ID')}</td>
              <td style={{ padding: '7px 0 7px 8px', fontSize: 12, textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", color: C.ink, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{rp(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Grand total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Grand Total</span>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: C.grandTotal }}>{rp(grandTotal)}</span>
      </div>

      {/* Tanda tangan */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
        {['Dipesan oleh', 'Disetujui oleh'].map(label => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 6, fontSize: 11, color: C.inkFaint }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function SalesOrderDetailPage({
  spNo,
  items    = [],
  group    = null,
  onBack,
  onSaveItem,
  onDeleteItem,
  onDeleteSP,
  onGeneratePicking,
  onRefresh,
  onOpenPicking,      // (pickingListId)  -> buka PickingListDetailPage
  onOpenDelivery,     // (deliveryNoteId) -> buka DeliveryNoteDetailPage
  showToast,
  role,
}) {
  const [tab,          setTab]          = useState('overview');
  const [editingItem,  setEditingItem]  = useState(null);
  const [showDeleteSP, setShowDeleteSP] = useState(false);
  const [showCancelSP, setShowCancelSP] = useState(false);
  const [genBusy,      setGenBusy]      = useState(false);
  // Fase 0.3 — link dokumen SP (Drive dll). Per-SP (semua baris se-sp_no sama).
  const [docUrl,       setDocUrl]       = useState(items[0]?.externalUrl || '');
  const [docEditing,   setDocEditing]   = useState(false);
  const [docSaving,    setDocSaving]    = useState(false);
  // Tenggat SP (expired_date) — edit in-place di kartu "SP Date & Expired".
  // expired_date adalah atribut level HEADER (sp_orders), bukan per item.
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineDraft,   setDeadlineDraft]   = useState('');
  const [deadlineSaving,  setDeadlineSaving]  = useState(false);
  // Fase 1 — stok tersedia (company-level) untuk cek sebelum Generate Picking.
  const [stockMap,     setStockMap]     = useState({});
  const productIdsKey = useMemo(
    () => [...new Set(items.map(i => i.productId).filter(Boolean))].sort().join(','),
    [items],
  );

  // ── BTB Numbers (SP-level) ───────────────────────────────────────────────
  const [btbs,         setBtbs]         = useState([]);
  const [btbInput,     setBtbInput]     = useState('');
  const [btbRemarks,   setBtbRemarks]   = useState('');
  const [btbSaving,    setBtbSaving]    = useState(false);
  const [spOrder,      setSpOrder]      = useState(null);  // Fase 1: headline sp_orders (status + flag)
  // Dokumen fulfillment SP (picking list + surat jalan) — tab Shipment & Dokumen.
  const [fulfillDocs,    setFulfillDocs]    = useState({ pickings: [], deliveries: [] });
  const [fulfillLoading, setFulfillLoading] = useState(true);
  // Rincian qty per baris sp_items menurut status SJ-nya — tab Items.
  // Peta { [sp_item_id]: { qtyDelivered, qtyInTransit } }; {} = belum termuat
  // ATAU memang tak ada SJ. Keduanya sengaja tak dibedakan: deriveItemShipStatus
  // menganggap tanpa-SJ sebagai 'Closed', yang persis perilaku sebelum fitur ini
  // ada — jadi tab Items tidak pernah kosong/flicker sambil menunggu fetch.
  const [itemShipMap,    setItemShipMap]    = useState({});

  // FASE 3 — baca BTB dari sp_btb (tabel benar) via sp_order_id (dari spOrder.id).
  useEffect(() => {
    const oid = spOrder?.id;
    if (!oid) return undefined;
    let cancelled = false;
    listSpBtbNew(oid).then(({ data }) => { if (!cancelled) setBtbs(data || []); });
    return () => { cancelled = true; };
  }, [spOrder?.id]);

  // Katalog produk (pin SOA, sama seperti EditItemModal) — dipakai kolom "Unit"
  // di tabel Baris Pesanan; `unit`/`uom` memang cuma ada di master produk,
  // tidak di sp_items.
  const { products } = useProducts({ companyId: SOA_COMPANY_ID });

  // ── Sidebar preview dokumen (kolom kanan, level HALAMAN) ─────────────────
  // showDocPanel mengontrol seluruh sidebar, bukan card di dalam tab Overview:
  // false → grid halaman turun dari 2 kolom ke 1, konten kiri melebar penuh, dan
  // tombol "Tampilkan Preview" muncul di baris tombol header sebagai jalan balik.
  const [showDocPanel, setShowDocPanel] = useState(true);
  const [companyHeader, setCompanyHeader] = useState(null);

  // Kop surat entitas untuk preview. SP di-pin ke SOA (sama seperti katalog
  // produk di halaman ini), jadi tak perlu menunggu spOrder termuat.
  useEffect(() => {
    let cancelled = false;
    getCompanyHeader(SOA_COMPANY_ID).then(({ data }) => { if (!cancelled) setCompanyHeader(data); });
    return () => { cancelled = true; };
  }, []);

  // ── Invoice (SP-level, Fase 4) ───────────────────────────────────────────
  const [invoice,            setInvoice]            = useState(null);
  const [invoiceLoading,     setInvoiceLoading]     = useState(true);
  const [invoiceSaving,      setInvoiceSaving]      = useState(false);
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);

  // ── FASE 5: pembayaran & TTF ─────────────────────────────────────────────
  // Gate peran SENGAJA dari erpRoles (array seluruh role aktif), BUKAN prop
  // `role`. Prop itu hasil pickPrimaryErpRole = satu role berprioritas
  // tertinggi saja, dan finance_controller berada DI BAWAH manager di daftar
  // prioritas — jadi user manager+finance_controller akan ter-resolve jadi
  // 'manager' dan kehilangan akses form, padahal RPC-nya (has_role) meloloskan.
  // Daftar di bawah menyalin persis body is_manager_or_above() di SQL.
  const { erpRoles } = useAuth();
  const roleCodes    = (erpRoles || []).map(r => r.roles?.code).filter(Boolean);
  const isSuperAdmin   = roleCodes.includes('super_admin');
  const isFinanceCtl   = roleCodes.includes('finance_controller');
  const isManagerAbove = roleCodes.some(c =>
    ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor'].includes(c));
  const canRecordPayment = isFinanceCtl || isSuperAdmin;
  const canMarkTtf       = isManagerAbove || isFinanceCtl || isSuperAdmin;
  // CERMIN guard server pada RPC gudang/SP (migrasi 20260821000003/4/6):
  //   is_super_admin() OR (company ∈ get_user_company_ids()
  //                        AND (is_manager_or_above() OR has_role('operations')))
  // Sisi company sudah ditegakkan server; FE hanya mencerminkan sisi PERAN,
  // supaya tombol tidak menawarkan aksi yang pasti ditolak RPC.
  const canWarehouseOps = isSuperAdmin || isManagerAbove || roleCodes.includes('operations');

  const [payments,    setPayments]    = useState([]);
  const [ttf,         setTtf]         = useState(null);
  const [paySaving,   setPaySaving]   = useState(false);
  const [ttfSaving,   setTtfSaving]   = useState(false);
  const [payForm,     setPayForm]     = useState({ amount: '', paymentDate: getTodayWIB(), reference: '', pph: '', buktiUrl: '', buktiNo: '' });
  const [pphTouched,  setPphTouched]  = useState(false);
  const [ttfForm,     setTtfForm]     = useState({ receivedBy: '', ttfNo: '', notes: '' });
  const [ttfEditing,  setTtfEditing]  = useState(false);

  // FASE 4 — baca invoice aktif dari sp_invoices via sp_order_id (dari spOrder.id).
  useEffect(() => {
    const oid = spOrder?.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!oid) { setInvoiceLoading(false); return undefined; }
    let cancelled = false;
    setInvoiceLoading(true);
    getSpInvoice(oid).then(({ data }) => {
      if (!cancelled) { setInvoice(data || null); setInvoiceLoading(false); }
    });
    return () => { cancelled = true; };
  }, [spOrder?.id]);

  // FASE 5 — riwayat pembayaran + status TTF, mengikuti invoice yang aktif.
  useEffect(() => {
    const invId = invoice?.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invId) { setPayments([]); setTtf(null); return undefined; }
    let cancelled = false;
    Promise.all([getPaymentHistory(invId), getTtfStatus(invId)]).then(([pay, t]) => {
      if (cancelled) return;
      setPayments(pay.data || []);
      setTtf(t.data || null);
    });
    return () => { cancelled = true; };
  }, [invoice?.id]);

  // Fase 1 — headline status sp_orders (12-tahap) + flag pernah picking dibatalkan (badge additive).
  useEffect(() => {
    const cust = group?.customerId;
    if (!spNo || !cust) return undefined;
    let cancelled = false;
    getSpOrderStatus(cust, spNo).then(({ data }) => { if (!cancelled) setSpOrder(data || null); });
    return () => { cancelled = true; };
  }, [spNo, group?.customerId]);

  // Dokumen fulfillment (picking list + surat jalan) — kunci KOMPOSIT
  // (customer_id, sp_no), bukan spOrder.id: keduanya sudah tersedia dari props
  // sejak render pertama, sementara spOrder.id baru ada setelah fetch di atas
  // selesai. Lihat catatan di getSpFulfillmentDocs (db.js).
  useEffect(() => {
    const cust = group?.customerId;
    if (!spNo || !cust) return undefined;
    let cancelled = false;
    getSpFulfillmentDocs(cust, spNo).then(({ data }) => {
      if (cancelled) return;
      setFulfillDocs(data || { pickings: [], deliveries: [] });
      setFulfillLoading(false);
    });
    return () => { cancelled = true; };
  }, [spNo, group?.customerId]);

  // Rincian qty terkirim per baris item — kunci komposit yang SAMA dengan effect
  // di atas, dan karena itu deps-nya juga sama. Sengaja fetch terpisah, bukan
  // digabung ke getSpFulfillmentDocs: yang ini beragregasi per sp_item_id dan
  // hanya dipakai tab Items, sementara dokumen fulfillment dipakai dua tab lain.
  useEffect(() => {
    const cust = group?.customerId;
    if (!spNo || !cust) return undefined;
    let cancelled = false;
    getSpItemDeliveryBreakdown(cust, spNo).then(({ data }) => {
      if (!cancelled) setItemShipMap(data || {});
    });
    return () => { cancelled = true; };
  }, [spNo, group?.customerId]);

  // Fase 1 — fetch stok tersedia (agregat company) saat SP sudah confirmed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (group?.spStatus !== 'confirmed' || !productIdsKey) { setStockMap({}); return undefined; }
    let cancelled = false;
    getStockForProducts(productIdsKey.split(',')).then(({ data }) => { if (!cancelled) setStockMap(data || {}); });
    return () => { cancelled = true; };
  }, [group?.spStatus, productIdsKey]);

  // Ringkasan kecukupan stok (per item outstanding vs available company-level).
  // Perhitungan TIDAK berubah — cuma ikut mengumpulkan item mana saja yang kurang,
  // supaya UI bisa menyebut nama produknya alih-alih cuma jumlah totalnya.
  const stockShort = useMemo(() => {
    if (group?.spStatus !== 'confirmed') return { checked: 0, short: 0, shortItems: [] };
    let checked = 0, short = 0;
    const shortItems = [];
    items.forEach(i => {
      if (!i.productId) return;
      checked += 1;
      const avail = stockMap[i.productId]?.available ?? 0;
      const out = Number(i.qty) - Number(i.shippedQty);
      if (avail < out) { short += 1; shortItems.push({ id: i.id, productName: i.productName }); }
    });
    return { checked, short, shortItems };
  }, [items, stockMap, group?.spStatus]);

  // Refetch BTB list (sp_btb) + headline status (BTB terbit/hapus menggerakkan
  // sp_orders.status via recompute → BTB_TERBIT rank tertinggi / mundur).
  const refreshBtbAndStatus = async () => {
    const cust = group?.customerId;
    if (spOrder?.id) { const { data } = await listSpBtbNew(spOrder.id); setBtbs(data || []); }
    if (cust) { const { data } = await getSpOrderStatus(cust, spNo); setSpOrder(data || null); }
  };

  // ── Ubah tenggat SP (expired_date) — level HEADER ─────────────────────────
  // Satu RPC menulis sp_orders.expired_date DAN semua baris sp_items.expired_date
  // se-SP dalam satu transaksi (lihat setSpExpiredDate di db.js — sengaja bukan
  // dua .update() terpisah). Otorisasi + freeze status CANCELLED ditegakkan di
  // dalam RPC; gate UI di kartu hanya cermin dari itu.
  // DUA refetch sesudahnya karena dua konsumen berbeda: `spOrder` memasok kartu
  // di halaman ini, `onRefresh` memasok `rows` App.jsx yang jadi sumber badge
  // Overdue + kolom Expired di SP Manifest.
  const handleSaveDeadline = async () => {
    const cust = group?.customerId;
    if (!cust || !deadlineDraft || deadlineSaving) return;
    setDeadlineSaving(true);
    const { error } = await setSpExpiredDate(cust, spNo, deadlineDraft);
    setDeadlineSaving(false);
    if (error) { showToast?.('Gagal ubah tenggat: ' + (error.message || 'unknown error'), 'error'); return; }
    setEditingDeadline(false);
    const { data } = await getSpOrderStatus(cust, spNo);
    setSpOrder(data || null);
    await onRefresh?.();
    showToast?.('Tenggat SP diperbarui.');
  };

  const handleAddBtb = async () => {
    if (!btbInput.trim() || !canWarehouseOps) return;
    const cust = group?.customerId;
    if (!cust) { showToast?.('Customer SP tidak diketahui', 'error'); return; }
    setBtbSaving(true);
    const { error } = await issueSpBtb({ customerId: cust, spNo, btbNo: btbInput, remarks: btbRemarks });
    setBtbSaving(false);
    if (error) { showToast?.('Gagal tambah BTB: ' + error.message, 'error'); return; }
    setBtbInput('');
    setBtbRemarks('');
    await refreshBtbAndStatus();
  };

  const handleDeleteBtb = async (id) => {
    if (!canWarehouseOps) return;
    const { error } = await deleteSpBtbNew(id);
    if (error) { showToast?.('Gagal hapus BTB: ' + error.message, 'error'); return; }
    await refreshBtbAndStatus();
  };

  // Refetch invoice + headline status setelah create/submit invoice (RPC
  // memicu sp_recompute_status di belakang layar — kartu status di atas
  // harus ikut naik ke INVOICED/SUBMITTED tanpa reload manual).
  const refreshInvoiceAndStatus = async () => {
    const cust = group?.customerId;
    if (spOrder?.id) { const { data } = await getSpInvoice(spOrder.id); setInvoice(data || null); }
    if (cust) { const { data } = await getSpOrderStatus(cust, spNo); setSpOrder(data || null); }
  };

  // ── FASE 5: catat pembayaran ────────────────────────────────────────────
  // Pesan RAISE dari record_payment sudah manusiawi & berbahasa Indonesia
  // (mis. "Akun [1-1200] belum ada di chart_of_accounts…"), jadi diteruskan
  // apa adanya — jangan dibungkus pesan generik.
  const handleRecordPayment = async () => {
    if (!invoice?.id || paySaving) return;
    const amt = Number(payForm.amount) || 0;
    if (amt <= 0) { showToast?.('Nominal pembayaran harus lebih besar dari nol', 'error'); return; }
    setPaySaving(true);
    const { error } = await recordPayment({
      invoiceId:      invoice.id,
      amount:         amt,
      paymentDate:    payForm.paymentDate || null,
      reference:      payForm.reference.trim() || null,
      pph:            Number(payForm.pph) || 0,
      buktiPotongUrl: payForm.buktiUrl.trim() || null,
      buktiPotongNo:  payForm.buktiNo.trim() || null,
    });
    if (error) {
      setPaySaving(false);
      showToast?.(error.message || 'Gagal mencatat pembayaran', 'error');
      return;
    }
    await refreshInvoiceAndStatus();
    if (invoice?.id) {
      const { data } = await getPaymentHistory(invoice.id);
      setPayments(data || []);
    }
    setPayForm({ amount: '', paymentDate: getTodayWIB(), reference: '', pph: '', buktiUrl: '', buktiNo: '' });
    setPphTouched(false);
    setPaySaving(false);
    showToast?.('Pembayaran dicatat', 'success');
  };

  // ── FASE 5: tandai TTF diterima ─────────────────────────────────────────
  const handleMarkTtf = async () => {
    if (!invoice?.id || ttfSaving) return;
    if (!ttfForm.receivedBy.trim()) { showToast?.('Nama penerima wajib diisi', 'error'); return; }
    setTtfSaving(true);
    const { error } = await markTtfReceived({
      invoiceId:  invoice.id,
      receivedBy: ttfForm.receivedBy.trim(),
      ttfNo:      ttfForm.ttfNo.trim() || null,
      notes:      ttfForm.notes.trim() || null,
    });
    if (error) {
      setTtfSaving(false);
      showToast?.(error.message || 'Gagal menandai TTF', 'error');
      return;
    }
    const { data } = await getTtfStatus(invoice.id);
    setTtf(data || null);
    setTtfForm({ receivedBy: '', ttfNo: '', notes: '' });
    setTtfEditing(false);
    setTtfSaving(false);
    showToast?.(ttfEditing ? 'TTF diperbarui' : 'TTF ditandai diterima', 'success');
  };

  const handleCreateInvoice = async () => {
    if (!spOrder?.id) return;
    setInvoiceSaving(true);
    const { error } = await createInvoiceRpc(spOrder.id);
    setInvoiceSaving(false);
    if (error) { showToast?.('Gagal menerbitkan invoice: ' + (error.message || 'unknown error'), 'error'); return; }
    showToast?.('Invoice berhasil diterbitkan', 'success');
    await refreshInvoiceAndStatus();
  };

  const handleSubmitInvoice = async () => {
    if (!invoice?.id) return;
    setInvoiceSaving(true);
    const { error } = await submitInvoiceRpc(invoice.id);
    setInvoiceSaving(false);
    if (error) { showToast?.('Gagal submit invoice: ' + (error.message || 'unknown error'), 'error'); return; }
    showToast?.('Invoice berhasil di-submit', 'success');
    await refreshInvoiceAndStatus();
  };

  // Generate + download PDF invoice — pola sama persis handlePrint di
  // PickingListDetailPage.jsx (pdf(...).toBlob() → object URL → klik <a> lalu
  // revoke), bukan teknik baru. Data PDF diambil fresh via getInvoicePdfData
  // (join sp_invoice_lines/sp_order_items/companies/entity_bank_accounts/
  // entity_finance_settings) — bukan dari state `invoice` yang cuma punya
  // ringkasan header.
  const handleDownloadInvoice = async () => {
    if (!invoice?.id) return;
    setInvoiceDownloading(true);
    try {
      const { data: pdfData, error } = await getInvoicePdfData(invoice.id);
      if (error || !pdfData) {
        showToast?.('Gagal menyiapkan data invoice: ' + (error?.message || 'unknown error'), 'error');
        return;
      }
      const blob = await pdf(<InvoicePDF invoice={pdfData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${(pdfData.invoice_no || 'INV').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast?.('Gagal membuat PDF: ' + (e?.message || e), 'error');
    } finally {
      setInvoiceDownloading(false);
    }
  };

  // ── Finance stage stats (computed from items) ──────────────────────────
  const finStages = useMemo(() => {
    const total = items.length;
    return FIN_STAGES.map(s => {
      const done = items.filter(i => !!i[s.key]).length;
      const pct  = total > 0 ? Math.round((done / total) * 100) : 0;
      return { ...s, done, total, pct };
    });
  }, [items]);

  const finOverallDone  = finStages.reduce((s, st) => s + st.done, 0);
  const finOverallTotal = finStages.reduce((s, st) => s + st.total, 0);
  const finOverallPct   = finOverallTotal > 0 ? Math.round((finOverallDone / finOverallTotal) * 100) : 0;

  // ── Financial summary numbers (via calcItem — single source of truth) ───
  const allCalc     = items.map(i => calcItem(i));
  const subtotal    = allCalc.reduce((s, c) => s + c.subtotal, 0);
  const ppnTotal    = allCalc.reduce((s, c) => s + c.ppn, 0);
  const ongkosKirim = items.reduce((s, i) => s + (Number(i.shippingPrice) || 0), 0);
  const grandTotal  = subtotal + ppnTotal + ongkosKirim;
  const totalQty    = items.reduce((s, i) => s + Number(i.qty),       0);
  const shippedQty  = items.reduce((s, i) => s + Number(i.shippedQty), 0);
  const outstandQty = totalQty - shippedQty;
  const shipPct     = totalQty > 0 ? Math.round((shippedQty / totalQty) * 100) : 0;

  // Baris untuk preview dokumen — jumlah per baris pakai subtotal dari calcItem
  // (sumber angka yang sama dengan Financial Summary, bukan hitungan sendiri).
  const previewLines = items.map((i, idx) => ({
    id: i.id ?? idx,
    productName: i.productName,
    qty: i.qty,
    amount: allCalc[idx]?.subtotal ?? 0,
  }));

  // FASE 4 — invoice cuma boleh diterbitkan saat seluruh qty sudah terkirim
  // (cermin guard Σshipped=Σqty di RPC create_invoice; dihitung dari items
  // yang sudah ada di state, bukan query baru).
  const canCreateInvoice = !!spOrder?.id && totalQty > 0 && shippedQty === totalQty;

  // ── FASE 5: turunan pembayaran ──────────────────────────────────────────
  // Sisa tagihan = total_amount − Σ(amount + pph). Dihitung dari `payments`
  // yang sudah di-fetch → nol query tambahan. TIDAK di-clamp ke nol: kalau
  // tercatat lebih bayar, angkanya sengaja tampil negatif (sistem belum punya
  // konsep overpay — lihat catatan di laporan).
  const paidSettled = payments.reduce((sum, p) => sum + (Number(p.amount) || 0) + (Number(p.pph) || 0), 0);
  const sisaTagihan = (Number(invoice?.total_amount) || 0) - paidSettled;
  // Saran PPh 23 = total ongkir × 2%. Suku ongkir = total_amount − dpp − ppn,
  // persis definisi v_total_amount di create_invoice.
  const totalOngkirInv = (Number(invoice?.total_amount) || 0)
    - (Number(invoice?.total_dpp) || 0) - (Number(invoice?.total_ppn) || 0);
  const pphSuggestion = Math.round(Math.max(0, totalOngkirInv) * 0.02);
  const invStatus = invoice?.status || null;
  const showPaymentForm = canRecordPayment && ['issued', 'submitted', 'partial'].includes(invStatus);
  const showPaymentHistory = !!invStatus && !['draft', 'void'].includes(invStatus);
  const showTtfBlock = canMarkTtf && ['issued', 'submitted', 'partial', 'paid'].includes(invStatus);

  // ── Deadline display ───────────────────────────────────────────────────
  // Tenggat = atribut HEADER (sp_orders.expired_date, migrasi 20260825000002).
  // Header dibaca LEBIH DULU; fallback items.find() HANYA untuk SP lama yang
  // belum punya baris sp_orders — itu jaring pengaman, bukan sumber kebenaran
  // (hasilnya bergantung urutan fetch, jadi non-deterministik kalau nilai antar
  // item pernah berbeda). Nama `firstDeadline` DIPERTAHANKAN: dipakai di
  // beberapa titik lain di file ini.
  const spExpiredDate = spOrder?.expired_date || items.find(i => i.expired_date)?.expired_date || null;

  // ── DC tujuan (level HEADER) ───────────────────────────────────────────
  // Sumber kebenaran: sp_orders.dc_id → dc_master, ikut terbawa embed di
  // getSpOrderStatus. SENGAJA TANPA fallback ke sp_items.dc: kolom legacy itu
  // teks bebas yang bisa menyimpang dari header (kasus nyata pernah terjadi),
  // jadi menjadikannya cadangan justru mengembalikan angka yang salah dengan
  // tampilan meyakinkan. Kalau embed null (SP lama tanpa dc_id, atau RLS
  // dc_master menolak — lihat catatan di db.js), konsumen tampilkan '—'.
  // Satu nilai ini dipakai bersama kartu "DC Tujuan" + EditItemModal: satu
  // fetch, dua konsumen.
  const spDc = spOrder?.dc_master || null;
  const firstDeadline = spExpiredDate;
  const days = daysUntil(firstDeadline);
  const deadlineSub = days == null ? '—' : days < 0 ? `${Math.abs(days)} hari lalu · overdue` : days === 0 ? 'Hari ini · urgent' : `${days} hari lagi · on track`;

  // ── First spDate ───────────────────────────────────────────────────────
  const spDate = items.find(i => i.spDate)?.spDate || null;
  const customer = group?.customer || items.find(i => i.customer)?.customer || '—';
  const totalItems = items.length;

  // ── Save item handler ──────────────────────────────────────────────────
  const handleSaveItem = useCallback(async (data) => {
    try {
      await onSaveItem(data);
      setEditingItem(null);
      showToast('Item berhasil diperbarui', 'success');
    } catch (err) {
      showToast('Gagal menyimpan: ' + (err?.message || 'unknown error'), 'error');
    }
  }, [onSaveItem, showToast]);

  // ── Delete item handler ────────────────────────────────────────────────
  const handleDeleteItem = useCallback(async (id) => {
    if (!confirm('Yakin hapus item ini?')) return;
    try {
      await onDeleteItem(id);
      showToast('Item dihapus', 'success');
    } catch (err) {
      showToast('Gagal hapus item: ' + (err?.message || 'unknown error'), 'error');
    }
  }, [onDeleteItem, showToast]);

  // ── Delete SP handler ──────────────────────────────────────────────────
  const handleDeleteSP = useCallback(async () => {
    setShowDeleteSP(false);
    try {
      await onDeleteSP(spNo, group?.customerId);
      // NOTE: onDeleteSP should call setSelectedSpId(null) → navigates back automatically
    } catch (err) {
      showToast('Gagal hapus SP: ' + (err?.message || 'unknown error'), 'error');
    }
  }, [onDeleteSP, spNo, group, showToast]);

  // ── Cancel SP handler (status → CANCELLED via set_sp_status; dual-table + komposit) ──
  const handleCancelSP = useCallback(async (reason) => {
    setShowCancelSP(false);
    const cust = group?.customerId;
    const { error } = await setSpStatus(spNo, 'cancelled', reason, cust);
    if (error) { showToast('Gagal membatalkan SP: ' + (error.message || 'unknown error'), 'error'); return; }
    if (cust) { const { data } = await getSpOrderStatus(cust, spNo); setSpOrder(data || null); }
    showToast(`SP ${spNo} dibatalkan`);
  }, [spNo, group, showToast]);

  // ── Header status (spStatus lifecycle + qty-derived, precedence high→low) ──
  // FASE 2E — headline dari sp_orders.status (12 tahap), fallback DRAFT bila belum termuat.
  const headerStatus = (() => {
    if (!group) return null;
    return HEADLINE_META[spOrder?.status] || HEADLINE_META.DRAFT;
  })();
  // Aksi gudang (Generate Picking + indikator stok). Keempat status di bawah
  // punya SATU kesamaan: masih MUNGKIN ada item outstanding (qty > shipped_qty)
  // dan tak ada picking yang sedang berjalan.
  //   CONFIRMED / MENUNGGU_STOK -> belum pernah dibuatkan picking sama sekali.
  //   DIKIRIM / SAMPAI          -> pengiriman PARSIAL: sebagian qty sudah
  //     berangkat (DIKIRIM) atau sudah dikonfirmasi sampai oleh DC (SAMPAI),
  //     sisanya masih outstanding dan justru BUTUH picking lanjutan.
  //
  // Daftar ini dulu cuma CONFIRMED + MENUNGGU_STOK, dengan komentar "hanya di
  // tahap awal, belum picking" — asumsi dari masa sebelum alur partial shipment
  // ada, dan tak pernah ditinjau ulang sesudahnya. Akibatnya SP parsial yang SJ
  // pertamanya sudah berangkat/sampai TIDAK BISA dilanjutkan dari UI sama
  // sekali: tombol ini SATU-SATUNYA pintu ke generate_picking_from_sp.
  //
  // PICKING / PACKED / MENUNGGU_KONFIRMASI_DC / TERKIRIM_PENUH SENGAJA di luar
  // daftar — tapi FE TIDAK menduplikasi larangannya, karena RPC-nya sendiri yang
  // menolak, dan pesan errornya jauh lebih berguna daripada tombol yang diam-diam
  // hilang:
  //   PICKING -> masih ada picking 'pending'/'in_progress'
  //   PACKED  -> ada picking 'done' yang surat jalannya belum dispatched
  //   MENUNGGU_KONFIRMASI_DC / TERKIRIM_PENUH -> outstanding qty sudah 0
  // Whitelist ini soal "jangan tampilkan tombol yang PASTI gagal", BUKAN gerbang
  // otorisasi. Gerbang sebenarnya ada di generate_picking_from_sp — 5 guard (item
  // confirmed, role, picking aktif, SJ belum dispatch, outstanding > 0) — dan RPC
  // itu memang TIDAK PERNAH membaca sp_orders.status.
  //
  // ⚠️ MENAMBAH STATUS SP BARU? TINJAU ULANG DAFTAR INI. Status baru tidak masuk
  // otomatis, dan gejalanya senyap: tombolnya cuma tidak muncul, tanpa error.
  const canGeneratePicking = canWarehouseOps
    && ['CONFIRMED', 'MENUNGGU_STOK', 'DIKIRIM', 'SAMPAI'].includes(spOrder?.status);

  if (!spNo) return null;

  return (
    /* Grid level HALAMAN — kolom kiri (1.7fr) memuat seluruh konten & semua tab,
       kolom kanan (1fr) sidebar preview yang sticky dan PERSISTEN lintas tab.
       Struktur ini mengikuti markup asli mockup (hasil decode bundle standalone).
       nx-grid-2 + nx-stack = helper index.css yang sudah ada: <1024px turun jadi
       1 kolom dan sticky dimatikan. Nol perubahan file global. */
    <div className="nx-grid-2 nx-stack" style={{ display: 'grid', gridTemplateColumns: showDocPanel ? 'minmax(0,1.7fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: SP.s6, alignItems: 'start', maxWidth: 1240, fontFamily: FONT_TEXT, fontSize: 15, lineHeight: 1.55, color: C.ink }}>

    {/* ══════════ BARIS ATAS — membentang 2 kolom ══════════
        Breadcrumb + kicker + header sengaja DILUAR kolom kiri: header Nexus jauh
        lebih tinggi daripada mockup (ada breadcrumb, kicker, h1, dan baris badge),
        jadi kalau ikut kolom kiri, sidebar akan mulai sejajar breadcrumb — bukan
        sejajar tab. Dengan header jadi barisnya sendiri, baris "Preview Dokumen"
        otomatis sebaris dengan tab bar tanpa perlu margin-top hardcode yang akan
        meleset begitu badge/tombol wrap ke baris kedua. */}
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: SP.s4, minWidth: 0 }}>

      {/* ── Breadcrumb + kicker judul ─────────────────────────────────── */}
      {/* Separator teks "/" menggantikan ikon ChevronRight — pola breadcrumb mockup. */}
      <div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: SP.s2, fontSize: 12, color: C.inkFaint, marginBottom: SP.s2 }}>
          <span>Logistics</span>
          <span aria-hidden="true">/</span>
          <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.inkFaint, fontSize: 12, fontFamily: 'inherit' }}>Sales Order / SP</button>
          <span aria-hidden="true">/</span>
          <span style={{ fontFamily: FONT_MONO, color: C.ink, fontWeight: 600 }}>{spNo}</span>
        </nav>
        {/* Kicker dokumen — di mockup ini baris di atas <h1>; judul besarnya sendiri
            adalah nomor SP, yang dirender di header card di bawah. */}
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 12.5, letterSpacing: '.08em', textTransform: 'uppercase', color: C.inkSoft, marginBottom: SP.s1 }}>
          Detail Sales Order
        </div>
      </div>

      {/* ── Header — TANPA kotak. Di mockup nomor SP + badge + baris tombol
             duduk langsung di background halaman; pemisah dari konten bawah
             murni spacing (gap flex root), bukan border/shadow. ── */}
      <div>
        {/* Row 1 — grid yang MENCERMINKAN grid halaman (template & gap identik).
            Sel kiri karena itu selebar persis kolom konten, yaitu tempat <hr>
            divider hidup — jadi tepi kanan blok status jatuh tepat di ujung
            divider tanpa angka ajaib. Tombol aksi pindah ke sel kanan (di atas
            sidebar preview) supaya tidak lagi memotong ruang blok status. */}
        <div className="nx-grid-2 nx-stack" style={{ display: 'grid', gridTemplateColumns: showDocPanel ? 'minmax(0,1.7fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: SP.s6, alignItems: 'start' }}>

          {/* ── Sel kiri: nomor SP + blok status ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, minWidth: 0 }}>
          {/* Nomor SP = <h1> mockup: Cormorant 600 / 42px / lh 1.12 / ls -0.015em */}
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.12, color: C.ink }}>
            {spNo}
          </div>
          {/* Blok status — lebar mengikuti KONTEN sendiri (`flex: 0 1 auto`), lalu
              DIDORONG ke kanan pakai `marginLeft: auto`. Sebelumnya blok ini
              di-flex-grow: wadahnya memang melebar sampai ujung divider, tapi
              isinya rata kiri sehingga kelebaran itu jadi ruang kosong tak terlihat
              dan teksnya tetap menempel di sebelah h1. Sekarang yang bergeser blok
              utuhnya, jadi tepi kanan konten asli (teks terlebar / badge) yang
              jatuh di ujung sel = ujung divider, dan muncul jarak nyata dari h1.
              `minWidth: 0` + `flex-shrink: 1` menjaga tetap bisa menyusut di layar
              sempit; alignment DI DALAM blok tidak diubah — tetap rata kiri. */}
          <div style={{ flex: '0 1 auto', minWidth: 0, marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: SP.s2 }}>

            {/* 1. Flag independen — tetap badge, terpisah dari ringkasan status/stok */}
            {spOrder?.had_cancelled_picking && (
              <div>
                <Badge {...TAG_NEUTRAL}>
                  <AlertTriangle size={12}/>Pernah picking dibatalkan
                </Badge>
              </div>
            )}

            {/* 2. Judul status — nol background/border/radius */}
            {headerStatus && (
              <div style={{ ...cardTitleStyle }}>{headerStatus.label}</div>
            )}

            {/* 3. Info deskriptif */}
            <div style={{ fontSize: 13, opacity: .8 }}>
              {totalItems} produk &middot; {totalQty.toLocaleString('id-ID')} qty &middot; {customer}
            </div>

            {/* 4. Daftar stok kurang — SATU BARIS PER PRODUK, ditumpuk ke bawah.
                   Gate `canGeneratePicking` dipertahankan supaya kondisi tampilnya
                   persis sama dengan badge gabungan yang digantikan. Tak ada item
                   kurang → blok ini tidak dirender sama sekali. */}
            {canGeneratePicking && stockShort.shortItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s1 }}>
                {stockShort.shortItems.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'baseline', gap: SP.s2, fontSize: 12.5 }}>
                    <Badge {...TAG_ATTN}>Stok Kurang</Badge>
                    <span style={{ color: C.inkSoft }}>{it.productName || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          {/* ── /Sel kiri ── */}

          {/* ── Sel kanan: baris tombol aksi ── */}
          <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
            {canGeneratePicking && (
              <button
                onClick={async () => {
                  if (genBusy) return;
                  setGenBusy(true);
                  await onGeneratePicking?.(spNo, group?.customerId);
                  setGenBusy(false);
                }}
                disabled={genBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: genBusy ? 'not-allowed' : 'pointer', fontFamily: FONT_DISPLAY, opacity: genBusy ? 0.7 : 1 }}
              >
                <ClipboardList size={14}/> {genBusy ? 'Membuat…' : 'Generate Picking List'}
              </button>
            )}
            {/* Tombol "Edit" header DIHAPUS (batch 2, 25 Agu 2026) — menutup U-9.
                Labelnya generik "Edit" di header bar SP tapi fungsinya cuma
                membuka items[0]: benar kebetulan pada SP satu-item, menyesatkan
                pada SP multi-item. Entry point per-item yang BENAR sudah ada di
                tab Items (pensil per baris, kolom Aksi), dan aksi level-SP kini
                punya pintunya sendiri (edit tenggat di kartu "SP Date & Expired"). */}
            {['super_admin', 'operations', 'manager', 'gm'].includes(role) && spOrder?.status === 'DRAFT' && (
              <button
                onClick={() => setShowCancelSP(true)}
                title="Batalkan SP (status → Dibatalkan)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${C.dangerBd}`, background: 'transparent', color: C.danger, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: 'pointer', fontFamily: FONT_DISPLAY }}
              >
                <X size={14}/> Batalkan SP
              </button>
            )}
            <button
              onClick={onBack}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: 'pointer', fontFamily: FONT_DISPLAY }}
            >
              <ChevronLeft size={14}/> Back to List
            </button>
            {/* Toggle sidebar level halaman — muncul hanya saat preview disembunyikan,
                supaya selalu ada titik masuk yang tetap (tak berpindah-pindah). */}
            {!showDocPanel && (
              <button
                onClick={() => setShowDocPanel(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: 'pointer', fontFamily: FONT_DISPLAY }}
              >
                <Eye size={14}/> Tampilkan Preview
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
    {/* ══════════ /BARIS ATAS ══════════ */}

    {/* ══════════ KOLOM KIRI — tab bar + isi semua tab ══════════ */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4, minWidth: 0 }}>

      {/* ── Tab + panel — TANPA kotak pembungkus. Pembatas satu-satunya adalah
             border-bottom baris tab, persis mockup. ── */}
      <div>
        {/* Divider di ATAS baris tab — `<hr class="hr">` yang memang ada di markup
            mockup tepat sebelum container tab. Sempat hilang saat blok info strip
            dipindah ke grid Overview. Beda elemen dari border-bottom tab di bawah. */}
        <hr style={{ height: 1, border: 0, margin: `0 0 ${SP.s4}px`, background: C.line }}/>

        {/* Tab bar — `flexWrap` menggantikan `overflowX: 'auto'`. Sumber scrollbar
            hantu tadi: menyetel overflow-x saja membuat overflow-y ikut jadi `auto`,
            lalu `marginBottom: -1` pada TabBtn menembus kotak padding 1px → browser
            memunculkan scrollbar padahal isinya muat. Mockup sendiri pakai wrap. */}
        <div style={{ display: 'flex', gap: SP.s6, borderBottom: `1px solid ${C.line}`, padding: 0, flexWrap: 'wrap', flexShrink: 0 }}>
          <TabBtn active={tab==='overview'} onClick={() => setTab('overview')} label="Overview"/>
          <TabBtn active={tab==='items'}    onClick={() => setTab('items')}    label="Items"/>
          <TabBtn active={tab==='shipment'} onClick={() => setTab('shipment')} label="Shipment"/>
          <TabBtn active={tab==='dokumen'}  onClick={() => setTab('dokumen')}  label="Dokumen"/>
          <TabBtn active={tab==='history'}  onClick={() => setTab('history')}  label="History"/>
        </div>

        {/* ── OVERVIEW panel — grid 2 kolom TETAP. Preview dokumen sudah naik
               jadi sidebar level halaman, tak lagi menempati kolom ke-3. ── */}
        {tab === 'overview' && (
          <div className="nx-grid-3" style={{ padding: `${SP.s4}px 0 0`, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: SP.s4, alignItems: 'start' }}>

            {/* SP Date & Expired — di mockup ini CARD dgn grid label/nilai 2 kolom
                (bukan tiga angka besar). Screenshot mengonfirmasi itu. */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3 }}>
              <div style={{ ...kickerStyle }}>SP Date &amp; Expired</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${SP.s1}px ${SP.s3}px`, fontSize: 13, marginTop: SP.s1, alignContent: 'start' }}>
                <div style={{ color: C.inkSoft }}>SP Date</div>
                <div>{fmtDate(spDate)}</div>
                <div style={{ color: C.inkSoft }}>Expired Date</div>
                <div>
                  {editingDeadline ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {/* TANPA atribut `min` — DISENGAJA. Tenggat harus bisa
                          dikoreksi MUNDUR ke masa lalu untuk audit pinalti
                          historis; sejalan dgn freeze RPC yang cuma mengunci
                          CANCELLED (SP LUNAS tetap boleh dikoreksi). */}
                      <input
                        type="date"
                        value={deadlineDraft}
                        disabled={deadlineSaving}
                        onChange={e => setDeadlineDraft(e.target.value)}
                        style={{ height: 30, padding: '0 8px', borderRadius: RADIUS.sm, border: `1px solid ${C.line}`, background: C.surface, fontSize: 12.5, color: C.ink, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                      />
                      <button
                        onClick={handleSaveDeadline}
                        disabled={deadlineSaving || !deadlineDraft}
                        style={{ height: 30, padding: '0 10px', borderRadius: RADIUS.sm, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontSize: 12, fontWeight: 700, cursor: (deadlineSaving || !deadlineDraft) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (deadlineSaving || !deadlineDraft) ? 0.6 : 1 }}
                      >
                        {deadlineSaving ? 'Menyimpan…' : 'Simpan'}
                      </button>
                      <button
                        onClick={() => setEditingDeadline(false)}
                        disabled={deadlineSaving}
                        style={{ height: 30, padding: '0 10px', borderRadius: RADIUS.sm, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 12, fontWeight: 600, cursor: deadlineSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: days != null && days < 2 ? C.warn : C.ink }}>{fmtDate(firstDeadline)}</span>
                        {/* Gate = cermin guard RPC set_sp_expired_date: HANYA
                            CANCELLED yang mengunci. SP LUNAS SENGAJA masih bisa
                            dikoreksi (audit pinalti historis) — jangan tambahkan
                            LUNAS ke sini tanpa mengubah RPC-nya juga. */}
                        {canWarehouseOps && spOrder?.status !== 'CANCELLED' && (
                          <button
                            onClick={() => { setDeadlineDraft(firstDeadline || ''); setEditingDeadline(true); }}
                            aria-label="Ubah tenggat SP"
                            title="Ubah tenggat SP"
                            style={{ width: 22, height: 22, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid transparent', borderRadius: RADIUS.sm, color: C.accent, cursor: 'pointer' }}
                          >
                            <Pencil size={12}/>
                          </button>
                        )}
                      </div>
                      <div style={{ color: C.inkSoft, fontSize: 11 }}>{deadlineSub}</div>
                    </>
                  )}
                </div>
                <div style={{ color: C.inkSoft }}>Finance Progress</div>
                <div>{finOverallPct}%</div>
              </div>
            </div>

            {/* DC Tujuan — kartu baru, struktur menyalin "SP Date & Expired" di
                atas (grid label/nilai 2 kolom). Sumbernya sp_orders.dc_id →
                dc_master, satu-satunya sumber yang juga dipakai Surat Jalan &
                Picking List. Sebelum ini, DC hanya terlihat lewat sp_items.dc
                (legacy, teks bebas) di subtitle baris Items — dua nilai yang
                bisa menyimpang tanpa penanda apa pun. READ-ONLY tanpa tombol
                edit: dc_id hari ini write-once (cuma create_sp_order_dual yang
                menulisnya), jadi jangan pasang affordance yang tak ada jalurnya. */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3 }}>
              <div style={{ ...kickerStyle }}>DC Tujuan</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${SP.s1}px ${SP.s3}px`, fontSize: 13, marginTop: SP.s1, alignContent: 'start' }}>
                <div style={{ color: C.inkSoft }}>Nama</div>
                <div>{spDc?.nama || '—'}</div>
                <div style={{ color: C.inkSoft }}>Alamat</div>
                <div style={{ lineHeight: 1.45 }}>{spDc?.alamat || '—'}</div>
              </div>
            </div>

            {/* Progress Pengiriman — kicker + card-title + bar + body, pola mockup. */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3 }}>
              <div style={{ ...kickerStyle }}>Progress Pengiriman</div>
              <div style={{ ...cardTitleStyle, marginTop: 2 }}>{shipPct}% terkirim</div>
              <div style={{ height: 8, background: '#EAE7E7', borderRadius: RADIUS.sm, overflow: 'hidden', margin: `${SP.s2}px 0` }}>
                <div style={{ height: '100%', width: `${shipPct}%`, background: C.accent }}/>
              </div>
              <p style={{ margin: 0, fontSize: 13, opacity: .8 }}>
                Dihitung dari kuantitas barang yang sudah dikirim penuh atau sebagian dari total pesanan.
              </p>
            </div>

            {/* Financial Summary — grid 4 kolom label/nilai, full width (pola mockup). */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3, gridColumn: '1 / -1' }}>
              <div style={{ ...kickerStyle }}>Financial Summary</div>
              <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: `${SP.s3}px ${SP.s4}px`, fontSize: 13, marginTop: SP.s2 }}>
                {[
                  { k: 'Total Items',  v: String(totalItems) },
                  { k: 'Total QTY',    v: totalQty.toLocaleString('id-ID') },
                  { k: 'Shipped',      v: shippedQty.toLocaleString('id-ID') },
                  { k: 'Outstanding',  v: outstandQty.toLocaleString('id-ID') },
                  { k: 'Subtotal',     v: rp(subtotal) },
                  { k: 'Ongkos Kirim', v: rp(ongkosKirim) },
                  { k: 'PPN 11%',      v: rp(ppnTotal) },
                  { k: 'Grand Total',  v: rp(grandTotal), color: C.grandTotal },
                ].map(c => (
                  <div key={c.k}>
                    <div style={{ fontSize: 11, color: C.inkSoft }}>{c.k}</div>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', color: c.color || C.ink }}>{c.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Finance Status — 4 kolom tahap + bar tipis, full width (pola mockup).
                Warna bar tetap gradasi semantik finColor(), keputusan yang sudah final. */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3, gridColumn: '1 / -1' }}>
              <div style={{ ...kickerStyle }}>Finance Status</div>
              <div style={{ ...cardTitleStyle, fontSize: 16, marginTop: 2 }}>{finOverallPct}% selesai</div>
              <p style={{ margin: '2px 0 0', fontSize: 13, opacity: .8 }}>
                {finOverallDone}/{finOverallTotal} langkah selesai ({finOverallPct}%)
              </p>
              <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SP.s4, marginTop: SP.s2 }}>
                {finStages.map(s => (
                  <div key={s.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: SP.s1, gap: SP.s2 }}>
                      <span>{s.label}</span>
                      <span style={{ color: C.inkSoft, whiteSpace: 'nowrap' }}>{s.done}/{s.total} &middot; {s.pct}%</span>
                    </div>
                    <div style={{ height: 6, background: '#EAE7E7', borderRadius: RADIUS.sm, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.pct}%`, background: finColor(s.pct) }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invoice — card MANDIRI (hasil un-merge). Di mockup asli ini card
                terpisah ber-kicker "Invoice" (grid-column 1/-1), duduk antara
                Finance Status dan Nomor BTB. Preview dokumen sudah naik jadi
                sidebar level halaman. SELURUH field fungsional dipertahankan —
                mockup cuma badge+tombol, itu contoh bentuk, bukan spek fungsi. */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3, gridColumn: '1 / -1' }}>
              <div style={{ ...kickerStyle }}>Invoice</div>
              <div style={{ marginTop: SP.s2 }}>
                {invoiceLoading ? (
                  <p style={{ fontSize: 13, color: C.inkFaint, padding: '10px 0' }}>Memuat…</p>
                ) : invoice ? (
                  <>
                    {[
                      { k: 'No. Invoice', v: invoice.invoice_no || '—' },
                      { k: 'Tanggal',     v: fmtDate(invoice.invoice_date) },
                      // due_date diisi RPC submit_invoice; sebelum submit masih NULL
                      // → fmtDate() mengembalikan '—'. Baris ini otomatis hanya
                      // tampil saat invoice ada, karena seluruh blok ini di dalam
                      // cabang `invoice ? …`.
                      { k: 'Batas Waktu Pembayaran', v: fmtDate(invoice.due_date) },
                      { k: 'DPP',         v: rp(invoice.total_dpp) },
                      { k: 'PPN',         v: rp(invoice.total_ppn) },
                    ].map(row => (
                      <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 13, borderBottom: `1px solid ${C.lineSoft}` }}>
                        <span style={{ color: C.inkSoft, fontWeight: 600 }}>{row.k}</span>
                        <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>{row.v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0 0', marginTop: 5, borderTop: `1.5px solid ${C.line}` }}>
                      <span style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>Total</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700, color: C.grandTotal }}>{rp(invoice.total_amount)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
                      {invoice.status === 'submitted' ? (
                        <Badge {...TAG_PALE}>Submitted</Badge>
                      ) : (
                        <Badge {...TAG_OUTLINE}>Issued</Badge>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={handleDownloadInvoice}
                          disabled={invoiceDownloading}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: invoiceDownloading ? C.inkFaint : C.inkSoft, fontSize: 13, fontWeight: 600, cursor: invoiceDownloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                        >
                          <Download size={13}/> {invoiceDownloading ? 'Menyiapkan…' : 'Download'}
                        </button>
                        {invoice.status === 'issued' && (
                          <button
                            onClick={handleSubmitInvoice}
                            disabled={invoiceSaving}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 34, borderRadius: 8, border: `1px solid ${invoiceSaving ? C.line : C.accent}`, background: 'transparent', color: invoiceSaving ? C.inkFaint : C.accent, fontSize: 13, fontWeight: 600, cursor: invoiceSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                          >
                            <Send size={13}/> {invoiceSaving ? 'Menyimpan…' : 'Submit'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── TASK 5: badge Lunas ─────────────────────────────── */}
                    {invStatus === 'paid' && (
                      <div style={{ marginTop: SP.s3 }}>
                        <Badge {...TAG_PALE}>Lunas</Badge>
                      </div>
                    )}

                    {/* ── TASK 2: Terima Pembayaran (inline) ──────────────── */}
                    {showPaymentForm && (
                      <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: SP.s3, paddingTop: SP.s3 }}>
                        <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Terima Pembayaran</div>
                        {/* Label dinamis: negatif = kelebihan bayar, ditampilkan
                            sebagai angka positif dgn warna perlu-perhatian.
                            Murni tampilan — perhitungan sisaTagihan tak berubah. */}
                        <div style={{ fontSize: 13, marginBottom: SP.s2 }}>
                          {sisaTagihan >= 0 ? (
                            <>
                              <span style={{ color: C.inkSoft }}>Sisa Tagihan: </span>
                              <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>
                                {rp(sisaTagihan)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={{ color: C.attn }}>Lebih Bayar: </span>
                              <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.attn }}>
                                {rp(Math.abs(sisaTagihan))}
                              </span>
                            </>
                          )}
                        </div>

                        <ModalGrid cols={3}>
                          <ModalField label="Nominal Pembayaran (Rp)" req>
                            <ModalInp type="number" value={payForm.amount} onFocus={selectOnFocus}
                              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value.replace(/^0+(?=\d)/, '') }))}/>
                          </ModalField>
                          <ModalField label="Tanggal Bayar">
                            <ModalInp type="date" value={payForm.paymentDate}
                              onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}/>
                          </ModalField>
                          <ModalField label="Referensi / No. Transfer">
                            <ModalInp value={payForm.reference}
                              onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}/>
                          </ModalField>
                        </ModalGrid>

                        <div style={{ marginTop: SP.s2 }}>
                          <ModalGrid cols={3}>
                            <ModalField label="PPh 23 (Rp)">
                              {/* Prefill saran sekali; begitu user mengetik, nilainya tak ditimpa lagi. */}
                              <ModalInp type="number"
                                value={pphTouched ? payForm.pph : (payForm.pph || String(pphSuggestion))}
                                onFocus={selectOnFocus}
                                onChange={e => { setPphTouched(true); setPayForm(f => ({ ...f, pph: e.target.value })); }}/>
                              <span style={{ fontSize: 11, color: C.inkFaint }}>
                                Saran otomatis, sesuaikan dengan bukti potong asli.
                              </span>
                            </ModalField>
                            <ModalField label="Link Bukti Potong">
                              <ModalInp type="url" placeholder="https://drive.google.com/…" value={payForm.buktiUrl}
                                onChange={e => setPayForm(f => ({ ...f, buktiUrl: e.target.value }))}/>
                            </ModalField>
                            <ModalField label="No. Bukti Potong">
                              <ModalInp value={payForm.buktiNo}
                                onChange={e => setPayForm(f => ({ ...f, buktiNo: e.target.value }))}/>
                            </ModalField>
                          </ModalGrid>
                        </div>

                        <button
                          onClick={handleRecordPayment}
                          disabled={paySaving || !(Number(payForm.amount) > 0)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: SP.s3, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${(!paySaving && Number(payForm.amount) > 0) ? C.accent : C.line}`, background: 'transparent', color: (!paySaving && Number(payForm.amount) > 0) ? C.accent : C.inkFaint, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: (!paySaving && Number(payForm.amount) > 0) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY }}
                        >
                          <Wallet size={14}/> {paySaving ? 'Menyimpan…' : 'Catat Pembayaran'}
                        </button>
                      </div>
                    )}

                    {/* ── TASK 3: Riwayat Pembayaran (inline) ─────────────── */}
                    {showPaymentHistory && (
                      <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: SP.s3, paddingTop: SP.s3 }}>
                        <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Riwayat Pembayaran</div>
                        {payments.length === 0 ? (
                          <p style={{ fontSize: 13, color: C.inkFaint, margin: 0 }}>Belum ada pembayaran tercatat.</p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr>
                                  {[['Tanggal', 'left'], ['Nominal', 'right'], ['PPh', 'right'], ['Referensi', 'left']].map(([h, align]) => (
                                    <th key={h} style={{ ...thStyle, textAlign: align, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {payments.map(pm => (
                                  <tr key={pm.id}>
                                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{fmtDate(pm.payment_date)}</td>
                                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>{rp(pm.amount)}</td>
                                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, color: C.inkSoft, whiteSpace: 'nowrap' }}>{rp(pm.pph)}</td>
                                    <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}` }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        {pm.reference || '—'}
                                        {pm.bukti_potong_url && (
                                          <a href={pm.bukti_potong_url} target="_blank" rel="noopener noreferrer"
                                             title={pm.bukti_potong_no ? `Bukti potong ${pm.bukti_potong_no}` : 'Bukti potong'}
                                             style={{ color: C.accent, display: 'inline-flex', alignItems: 'center' }}>
                                            <Link2 size={13}/>
                                          </a>
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── TASK 4: TTF (inline) ────────────────────────────── */}
                    {showTtfBlock && (
                      <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: SP.s3, paddingTop: SP.s3 }}>
                        <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Tanda Terima Faktur</div>
                        {(ttf?.tanggal_menerima && !ttfEditing) ? (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s2, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 13, margin: 0 }}>
                              TTF diterima <b>{fmtDate(ttf.tanggal_menerima)}</b>
                              {ttf.diterima_oleh ? <> oleh <b>{ttf.diterima_oleh}</b></> : null}
                              {ttf.no_ttf ? <span style={{ color: C.inkSoft }}> &middot; No. {ttf.no_ttf}</span> : null}
                            </p>
                            {/* Masuk mode form dgn data existing sbg prefill. RPC
                                mark_ttf_received sudah upsert (IF v_ttf_id IS NULL
                                → INSERT, ELSE → UPDATE), jadi submit yang sama
                                akan memperbarui baris, bukan bikin TTF kedua. */}
                            <button
                              onClick={() => {
                                setTtfForm({
                                  receivedBy: ttf.diterima_oleh || '',
                                  ttfNo:      ttf.no_ttf || '',
                                  notes:      ttf.notes || '',
                                });
                                setTtfEditing(true);
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                            >
                              <Pencil size={12}/> Edit
                            </button>
                          </div>
                        ) : (
                          <>
                            <ModalGrid cols={3}>
                              <ModalField label="Nama Penerima" req>
                                <ModalInp value={ttfForm.receivedBy}
                                  onChange={e => setTtfForm(f => ({ ...f, receivedBy: e.target.value }))}/>
                              </ModalField>
                              <ModalField label="No. TTF">
                                <ModalInp value={ttfForm.ttfNo}
                                  onChange={e => setTtfForm(f => ({ ...f, ttfNo: e.target.value }))}/>
                              </ModalField>
                              <ModalField label="Catatan">
                                <ModalInp value={ttfForm.notes}
                                  onChange={e => setTtfForm(f => ({ ...f, notes: e.target.value }))}/>
                              </ModalField>
                            </ModalGrid>
                            <div style={{ display: 'flex', gap: SP.s2, marginTop: SP.s3, flexWrap: 'wrap' }}>
                              <button
                                onClick={handleMarkTtf}
                                disabled={ttfSaving || !ttfForm.receivedBy.trim()}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${(!ttfSaving && ttfForm.receivedBy.trim()) ? C.accent : C.line}`, background: 'transparent', color: (!ttfSaving && ttfForm.receivedBy.trim()) ? C.accent : C.inkFaint, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: (!ttfSaving && ttfForm.receivedBy.trim()) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY }}
                              >
                                <Check size={14}/> {ttfSaving ? 'Menyimpan…' : (ttfEditing ? 'Simpan Perubahan' : 'Tandai TTF Diterima')}
                              </button>
                              {ttfEditing && (
                                <button
                                  onClick={() => { setTtfEditing(false); setTtfForm({ receivedBy: '', ttfNo: '', notes: '' }); }}
                                  disabled={ttfSaving}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: ttfSaving ? 'not-allowed' : 'pointer', fontFamily: FONT_DISPLAY }}
                                >
                                  Batal
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <Badge {...TAG_ATTN}>Belum Diterbitkan</Badge>
                      <p style={{ fontSize: 13, opacity: .8, margin: `${SP.s2}px 0 0` }}>
                        Invoice diterbitkan setelah barang selesai dikirim atau atas permintaan pelanggan.
                      </p>
                      {!canCreateInvoice && (
                        <p style={{ fontSize: 12, color: C.inkFaint, marginTop: SP.s1 }}>
                          {!spOrder?.id
                            ? 'SP ini belum punya data skema baru (sp_orders) — invoice belum bisa diterbitkan.'
                            : totalQty === 0
                            ? 'SP belum punya item.'
                            : `Belum bisa diterbitkan — outstanding ${(totalQty - shippedQty).toLocaleString('id-ID')} dari ${totalQty.toLocaleString('id-ID')} qty (${shippedQty.toLocaleString('id-ID')} sudah terkirim). Invoice hanya bisa diterbitkan setelah seluruh qty terkirim penuh.`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleCreateInvoice}
                      disabled={!canCreateInvoice || invoiceSaving}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${(canCreateInvoice && !invoiceSaving) ? C.accent : C.line}`, background: 'transparent', color: (canCreateInvoice && !invoiceSaving) ? C.accent : C.inkFaint, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: (canCreateInvoice && !invoiceSaving) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY, flexShrink: 0 }}
                    >
                      <Receipt size={14}/> {invoiceSaving ? 'Menerbitkan…' : 'Terbitkan Invoice'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* BTB Numbers — SP-level */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, overflow: 'hidden', gridColumn: '1 / -1' }}>
              <div style={{ padding: `${SP.s3}px ${SP.s3}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ ...kickerStyle }}>BTB Numbers</span>
                <span style={{ fontSize: 12, color: C.inkFaint }}>{btbs.length} nomor BTB</span>
              </div>
              <div style={{ padding: `${SP.s2}px ${SP.s3}px ${SP.s3}px` }}>
                {/* Existing BTBs */}
                {btbs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {btbs.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.line}` }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: C.ink, minWidth: 120 }}>{b.btb_no}</span>
                        {b.remarks && (
                          <span style={{ fontSize: 12, color: C.inkFaint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.remarks}</span>
                        )}
                        {canWarehouseOps && (
                        <button
                          onClick={() => handleDeleteBtb(b.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1, flexShrink: 0 }}
                          title="Hapus BTB"
                        >
                          <X size={13}/>
                        </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {btbs.length === 0 && (
                  <p style={{ fontSize: 13, color: C.inkFaint, marginBottom: 14 }}>Belum ada nomor BTB untuk SP ini.</p>
                )}
                {/* Add BTB input — hanya untuk manager-ke-atas / operations,
                    cermin guard RPC sp_issue_btb (migrasi 20260821000003). */}
                {!canWarehouseOps && (
                  <p style={{ fontSize: 12, color: C.inkFaint }}>
                    Penerbitan BTB dibatasi untuk Operations / Manager ke atas.
                  </p>
                )}
                {canWarehouseOps && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={btbInput}
                      onChange={e => setBtbInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddBtb(); }}
                      placeholder="Nomor BTB…"
                      style={{ width: 180, height: 36, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, padding: '0 11px', fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", outline: 'none', boxSizing: 'border-box', flexShrink: 0 }}
                    />
                    <input
                      value={btbRemarks}
                      onChange={e => setBtbRemarks(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddBtb(); }}
                      placeholder="Remarks (opsional)…"
                      style={{ flex: 1, height: 36, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, padding: '0 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={handleAddBtb}
                      disabled={!btbInput.trim() || btbSaving}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 36, borderRadius: 8, border: `1px solid ${btbInput.trim() ? C.accent : C.line}`, background: 'transparent', color: btbInput.trim() ? C.accent : C.inkFaint, fontSize: 13, fontWeight: 600, cursor: btbInput.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0 }}
                    >
                      <Plus size={13}/> {btbSaving ? 'Menyimpan…' : 'Tambah BTB'}
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── ITEMS panel ── */}
        {tab === 'items' && (
          <div style={{ padding: `${SP.s4}px 0 0` }}>
            {items.length === 0 ? (
              <EmptyState icon={Package} title="Tidak ada item" sub="Belum ada item yang tercatat untuk SP ini."/>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                {/* Grid 10 kolom — lebar kolom & urutan persis markup mockup. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.7fr 0.5fr 1fr 0.6fr 0.6fr 1fr 1.1fr 0.5fr', fontSize: 13, minWidth: 880 }}>
                  {[['Produk','left'],['Akun','left'],['Kuantitas','right'],['Unit','left'],['Harga Satuan','right'],['Pajak','left'],['Diskon','left'],['Subtotal','right'],['Status Pengiriman','left'],['Aksi','left']].map(([h, align]) => (
                    <div key={h} style={{ ...thStyle, textAlign: align, borderBottom: `1px solid ${C.line}` }}>{h}</div>
                  ))}
                  {items.map(item => {
                    const sm   = itemStatusMeta(deriveItemShipStatus(item, itemShipMap[item.id]));
                    const { subtotal: itemSubtotal } = calcItem(item);
                    const prod = products.find(p => p.id === item.productId);
                    const cell = { padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}` };
                    return (
                      <div key={item.id} style={{ display: 'contents' }}>
                        <div style={cell}>
                          <div>{item.productName || '—'}</div>
                          {/* deskripsi mockup = SKU · DC */}
                          <div style={{ color: C.inkSoft, fontSize: 11.5 }}>
                            {[item.sku, item.dc].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        {/* Akun — belum ada sumber datanya (lihat laporan) */}
                        <div style={{ ...cell, color: C.inkSoft }}>—</div>
                        <div style={{ ...cell, textAlign: 'right' }}>{num2(item.qty)}</div>
                        <div style={cell}>{prod?.unit || prod?.uom || '—'}</div>
                        <div style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{rp2(item.unitPrice)}</div>
                        <div style={cell}>{Math.round(PPN_RATE * 100)}%</div>
                        {/* Diskon — tak ada kolomnya di skema */}
                        <div style={cell}>—</div>
                        <div style={{ ...cell, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{rp2(itemSubtotal)}</div>
                        <div style={cell}><Badge bg={sm.bg} color={sm.color} bd={sm.bd}>{sm.label}</Badge></div>
                        {/* Mockup cuma punya ikon Edit di kolom Aksi. Tombol Hapus
                            DIPERTAHANKAN — aksi nyata yang sudah ada; membuangnya
                            demi kemiripan = menghilangkan fungsi, bukan restyle. */}
                        <div style={{ ...cell, display: 'flex', gap: 4 }}>
                          {canWarehouseOps && (
                          <button
                            onClick={() => setEditingItem(item)}
                            aria-label="Edit baris"
                            title="Edit item"
                            style={{ width: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid transparent', borderRadius: RADIUS.md, color: C.accent, cursor: 'pointer' }}
                          >
                            <Pencil size={14}/>
                          </button>
                          )}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            aria-label="Hapus baris"
                            title="Hapus item"
                            style={{ width: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid transparent', borderRadius: RADIUS.md, color: C.danger, cursor: 'pointer' }}
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SHIPMENT panel ── */}
        {tab === 'shipment' && (
          <div style={{ padding: `${SP.s4}px 0 0` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <b style={{ ...cardTitleStyle, fontWeight: 600 }}>Riwayat Pengiriman</b>
                <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 3 }}>
                  {shippedQty > 0 ? `${shippedQty.toLocaleString('id-ID')} dari ${totalQty.toLocaleString('id-ID')} qty terkirim` : 'Belum ada pengiriman tercatat'}
                </div>
              </div>
              {/* Tombol "+ Tambah Shipment" DIHAPUS (26 Agu 2026). Surat Jalan
                  TIDAK dibuat ad-hoc dari sini: ia lahir dari Picking List lewat
                  RPC generate_delivery_from_picking, yang juga melepas reservasi
                  stok dan memakai qty_picked. Membuat SJ langsung dari Detail SP
                  akan melewati kedua hal itu. */}
            </div>
            {fulfillLoading ? (
              <div style={{ fontSize: 12.5, color: C.inkFaint, padding: '8px 0' }}>Memuat riwayat pengiriman…</div>
            ) : fulfillDocs.deliveries.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Belum ada Surat Jalan untuk SP ini"
                sub="Surat Jalan lahir dari Picking List — buat Picking List dulu, selesaikan pengambilannya, lalu terbitkan Surat Jalan dari halaman Picking. Tidak dibuat langsung dari tab ini."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
                {fulfillDocs.deliveries.map(d => {
                  const meta = DN_STATUS_META[d.status] || DN_STATUS_META.draft;
                  const qtyNote = DN_QTY_NOTE[d.status] || null;
                  return (
                    <div
                      key={d.id}
                      onClick={() => onOpenDelivery?.(d.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDelivery?.(d.id); } }}
                      title="Buka detail Surat Jalan"
                      style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3, cursor: 'pointer', background: C.surface }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap', marginBottom: SP.s2 }}>
                        <Truck size={14} style={{ color: C.accent, flexShrink: 0 }}/>
                        <b style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.ink }}>{d.do_no}</b>
                        <Badge {...meta}>{meta.label}</Badge>
                      </div>
                      <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: `${SP.s2}px ${SP.s3}px`, fontSize: 12.5 }}>
                        {[
                          { k: 'Berangkat', v: fmtDate(d.dispatched_at || d.ship_date) },
                          { k: 'Sampai',    v: fmtDate(d.delivered_at) },
                          { k: 'Driver',    v: d.driver_name || '—' },
                          { k: 'Kendaraan', v: d.vehicle_no || '—' },
                          { k: 'Koli',      v: d.total_koli != null ? d.total_koli.toLocaleString('id-ID') : '—' },
                          {
                            k: 'Qty',
                            // Angka tetap tampil; penanda memberitahu bahwa qty ini
                            // BELUM/TIDAK terhitung sebagai barang terkirim.
                            v: qtyNote
                              ? `${d.total_qty.toLocaleString('id-ID')} (${qtyNote})`
                              : d.total_qty.toLocaleString('id-ID'),
                            muted: !!qtyNote,
                          },
                        ].map(c => (
                          <div key={c.k}>
                            <div style={{ fontSize: 11, color: C.inkSoft }}>{c.k}</div>
                            <div style={{ fontWeight: 600, color: c.muted ? C.inkSoft : C.ink }}>{c.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── DOKUMEN panel ── */}
        {tab === 'dokumen' && (
          <div style={{ padding: `${SP.s4}px 0 0` }}>
            {/* ── Dokumen Terkait — card BARU (26 Agu 2026). Ditaruh DI ATAS card
                   "Link Dokumen SP" yang sudah ada; card itu TIDAK disentuh. ── */}
            <div style={{ border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: C.surface2, padding: 20, marginBottom: SP.s4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <FileText size={16} style={{ color: C.accent }}/>
                <b style={{ ...cardTitleStyle, fontWeight: 600 }}>Dokumen Terkait</b>
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: '0 0 14px' }}>
                Dokumen yang lahir dari SP {spNo}. Picking List dan Surat Jalan bisa diklik untuk membuka detailnya; BTB dan Invoice ditampilkan di halaman ini juga (tab Overview).
              </p>
              {fulfillLoading ? (
                <div style={{ fontSize: 12.5, color: C.inkFaint }}>Memuat dokumen…</div>
              ) : (fulfillDocs.pickings.length === 0 && fulfillDocs.deliveries.length === 0 && btbs.length === 0 && !invoice) ? (
                <EmptyState
                  icon={FileText}
                  title="Belum ada dokumen terkait"
                  sub="Picking List, Surat Jalan, BTB, dan Invoice akan muncul di sini begitu diterbitkan untuk SP ini."
                />
              ) : (
                <>
                  {fulfillDocs.pickings.length > 0 && (
                    <DocGroup title="Picking List">
                      {fulfillDocs.pickings.map(pk => (
                        <DocRow
                          key={pk.id}
                          icon={ClipboardList}
                          no={pk.picking_no}
                          badge={PICK_STATUS_META[pk.status] || PICK_STATUS_META.pending}
                          meta={pk.warehouses?.name || null}
                          onOpen={onOpenPicking ? () => onOpenPicking(pk.id) : undefined}
                        />
                      ))}
                    </DocGroup>
                  )}
                  {fulfillDocs.deliveries.length > 0 && (
                    <DocGroup title="Surat Jalan">
                      {fulfillDocs.deliveries.map(d => (
                        <DocRow
                          key={d.id}
                          icon={Truck}
                          no={d.do_no}
                          badge={DN_STATUS_META[d.status] || DN_STATUS_META.draft}
                          meta={fmtDate(d.dispatched_at || d.ship_date)}
                          onOpen={onOpenDelivery ? () => onOpenDelivery(d.id) : undefined}
                        />
                      ))}
                    </DocGroup>
                  )}
                  {btbs.length > 0 && (
                    <DocGroup title="BTB">
                      {btbs.map(b => (
                        <DocRow key={b.id} icon={Package} no={b.btb_no} meta={fmtDate(b.btb_date)}/>
                      ))}
                    </DocGroup>
                  )}
                  {invoice && (
                    <DocGroup title="Invoice">
                      <DocRow
                        icon={Receipt}
                        no={invoice.invoice_no || '(belum bernomor)'}
                        meta={fmtDate(invoice.invoice_date)}
                      />
                    </DocGroup>
                  )}
                </>
              )}
            </div>

            <div style={{ border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: C.surface2, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Link2 size={16} style={{ color: C.accent }}/>
                <b style={{ ...cardTitleStyle, fontWeight: 600 }}>Link Dokumen SP</b>
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: '0 0 14px' }}>
                Tautan ke folder/berkas Drive terkait SP ini (Surat Jalan, PO Customer, Rincian Harga, bukti BTB). Berlaku untuk seluruh SP {spNo}.
              </p>

              {!docEditing && docUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <a href={docUrl} target="_blank" rel="noopener noreferrer"
                     style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: '9px 14px', color: C.accent, fontSize: 13, fontWeight: 600, textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <ExternalLink size={14}/> {docUrl}
                  </a>
                  <button onClick={() => setDocEditing(true)}
                    style={{ height: 36, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Ubah
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    value={docUrl}
                    onChange={e => setDocUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    style={{ flex: 1, minWidth: 240, height: 38, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    disabled={docSaving}
                    onClick={async () => {
                      setDocSaving(true);
                      const { error } = await setSpExternalUrl(spNo, docUrl.trim());
                      setDocSaving(false);
                      if (error) { showToast(error.message || 'Gagal menyimpan link', 'error'); return; }
                      setDocUrl(docUrl.trim());
                      setDocEditing(false);
                      showToast(docUrl.trim() ? 'Link dokumen disimpan' : 'Link dokumen dihapus', 'success');
                    }}
                    style={{ height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.accent}`, background: 'transparent', color: C.accent, fontSize: 13, fontWeight: 700, cursor: docSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: docSaving ? 0.7 : 1 }}>
                    {docSaving ? 'Menyimpan…' : 'Simpan'}
                  </button>
                  {docUrl && !docSaving && (
                    <button onClick={() => { setDocUrl(items[0]?.externalUrl || ''); setDocEditing(false); }}
                      style={{ height: 38, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Batal
                    </button>
                  )}
                </div>
              )}
              <p style={{ fontSize: 11.5, color: C.inkFaint, margin: '12px 0 0' }}>
                Interim MVP: tautan manual (upload berkas ke Storage menyusul).
              </p>
            </div>
          </div>
        )}

        {/* ── HISTORY panel ── */}
        {tab === 'history' && (
          <div style={{ padding: `${SP.s4}px 0 0` }}>
            <EmptyState icon={History} title="History kosong" sub="Log aktivitas SP akan muncul di sini setelah tabel audit log diimplementasikan."/>
          </div>
        )}
      </div>

      {/* ── Danger zone ── super_admin only + hanya saat DRAFT ──────────── */}
      {role === 'super_admin' && spOrder?.status === 'DRAFT' && (
        <div style={{
          border: `1px solid ${C.dangerBd}`, borderRadius: RADIUS.md, background: C.dangerBg,
          padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 4,
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b style={{ fontSize: 14, color: C.danger, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <AlertTriangle size={16}/> Danger Zone
            </b>
            <span style={{ fontSize: 12.5, color: C.inkSoft }}>
              Menghapus {spNo} akan menghilangkan seluruh item, shipment, dan dokumen terkait. Tindakan ini tidak dapat dibatalkan.
            </span>
          </div>
          <button
            onClick={() => setShowDeleteSP(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.danger, color: '#fff', border: `1px solid ${C.danger}`, height: 38, padding: '0 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Trash2 size={16}/> Delete entire {spNo}
          </button>
        </div>
      )}

    </div>
    {/* ══════════ /KOLOM KIRI ══════════ */}

    {/* ══════════ KOLOM KANAN — sidebar preview, sticky & persisten ══════════
        Sengaja anak langsung grid halaman, DI LUAR semua kondisional tab, jadi
        tetap tampil di Overview/Items/Shipment/Dokumen/History. Baris kontrol
        mockup (search, "1 / 1", zoom −/100%/+) TIDAK dirender — semuanya statis
        non-fungsional di sumbernya; slot posisinya dipakai kicker + toggle. */}
    {showDocPanel && (
      <aside style={{ position: 'sticky', top: 24, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: SP.s3 }}>
          <span style={{ ...kickerStyle }}>Preview Dokumen</span>
          <button
            onClick={() => setShowDocPanel(false)}
            title="Sembunyikan panel — konten melebar penuh"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
          >
            <EyeOff size={13}/> Sembunyikan
          </button>
        </div>
        <SpDocPreview
          company={companyHeader}
          spNo={spNo}
          spDate={spDate}
          customer={customer}
          lines={previewLines}
          grandTotal={grandTotal}
        />
      </aside>
    )}

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          spExpiredDate={spExpiredDate}
          spDc={spDc}
          spDate={spDate}
          spNo={spNo}
          customer={customer}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveItem}
        />
      )}
      {showDeleteSP && (
        <DeleteModal
          spNo={spNo}
          group={group}
          onClose={() => setShowDeleteSP(false)}
          onConfirm={handleDeleteSP}
        />
      )}
      {showCancelSP && (
        <CancelModal
          spNo={spNo}
          group={group}
          onClose={() => setShowCancelSP(false)}
          onConfirm={handleCancelSP}
        />
      )}
    </div>
  );
}
