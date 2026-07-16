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
import {
  ChevronRight, ChevronLeft, Pencil, Trash2, Package,
  Calendar, Clock, Wallet, Receipt, FileText, Send, Truck,
  Check, X, FolderOpen, History, List,
  AlertTriangle, Plus, ClipboardList, ExternalLink, Link2,
} from 'lucide-react';
import { issueSpBtb, deleteSpBtbNew, listSpBtbNew, setSpExternalUrl, getStockForProducts, getSpOrderStatus, setSpStatus } from '../../lib/db';
import { calcItem } from '../../lib/spCalc';
import ProductPicker from '../../components/ProductPicker';
import { useProducts } from '../../hooks/useProducts';

// SP = entitas Storbit (SOA) → pin katalog produk ke SOA (pola InputSPPage/DeliveryNote).
const SOA_COMPANY_ID = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

// ─── Design tokens ────────────────────────────────────────────────────────
// Cool/navy palette — senyawa dengan SalesOrderPage (list SP) + DealDetailPage (detail
// Inquiry). Semantik lama (green/steel-blue/mustard/purple/brown) di-remap ke brand
// navy #1B4D8A / orange #E85A1E / amber. Tanpa dark green, ungu, mustard, teal, coklat.
const C = {
  surface:   '#FFFFFF',
  surface2:  '#F4F6F9',
  ink:       '#2A3340',
  inkSoft:   '#6B7686',
  inkFaint:  '#9AA3B2',
  line:      '#E7EAF0',
  lineSoft:  '#EEF1F5',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  ok:        '#1B4D8A', okBg:  '#EAF0F8', okBd:  '#CFDDF0',   // positive/done → navy (was dark green)
  warn:      '#B5772A', warnBg:'#FBEEDD', warnBd:'#E6CE94',   // amber (list SP)
  danger:    '#C0392B', dangerBg:'#FBEAE8', dangerBd:'#E6BBB2',
  info:      '#1B4D8A', infoBg:'#EAF0F8', infoBd:'#CFDDF0',   // navy (was steel-blue)
  neutral:   '#6B7686', neutralBg:'#EEF1F5', neutralBd:'#DDE2EA',
  orange:    '#E85A1E', orangeBg:'#FEF2EC', orangeBd:'#F6C9AE',   // brand orange (was coklat)
  yellow:    '#B5772A', yellowBg:'#FBEEDD', yellowBd:'#E6CE94',   // amber (was mustard)
  purple:    '#B5772A', purpleBg:'#FBEEDD', purpleBd:'#E6CE94',   // amber (was ungu; sisa: stage Faktur Pajak)
  slate:     '#525E70', slateBg:'#EDF0F4', slateBd:'#D7DDE6',   // PICKING/PACKED — slate-blue soft (samain badge Picking List)
};

// ─── Helpers ───────────────────────────────────────────────────────────────
// Cegah scroll roda mouse mengubah nilai input type=number saat ter-focus.
const blurOnWheel = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.blur(); };
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

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

function itemStatusMeta(status) {
  if (status === 'Closed')  return { bg: C.okBg,      color: C.ok,     bd: C.okBd,     label: 'Shipped'  };
  if (status === 'Partial') return { bg: C.warnBg,    color: C.warn,   bd: C.warnBd,   label: 'Parsial'  };
  return                           { bg: C.neutralBg, color: C.neutral,bd: C.neutralBd,label: 'Open'     };
}

// ─── Shared atoms ──────────────────────────────────────────────────────────

function StatusDot({ color }) {
  return <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }}/>;
}

function Badge({ bg, color, bd, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color, border: `1px solid ${bd}`,
      fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// FASE 2E — status headline SP (sp_orders 12 tahap) → badge Detail SP. Warna kalem,
// semua badge tint + teks senada (tanpa blok solid, tanpa dark green). Selaras STATUS_META di SalesOrderPage.
const HEADLINE_META = {
  DRAFT:          { label: 'Draft',          bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  CONFIRMED:      { label: 'Dikonfirmasi',   bg: C.infoBg,    color: C.info,    bd: C.infoBd },
  MENUNGGU_STOK:  { label: 'Menunggu Stok',  bg: C.warnBg,    color: C.warn,    bd: C.warnBd },
  PICKING:        { label: 'Picking',        bg: C.slateBg,   color: C.slate,   bd: C.slateBd },
  PACKED:         { label: 'Dikemas',        bg: C.slateBg,   color: C.slate,   bd: C.slateBd },
  DIKIRIM:        { label: 'Dikirim',        bg: C.orangeBg,  color: C.orange,  bd: C.orangeBd },
  SAMPAI:         { label: 'Sampai',         bg: C.orangeBg,  color: C.orange,  bd: C.orangeBd },
  BTB_TERBIT:     { label: 'BTB Terbit',     bg: C.warnBg,    color: C.warn,    bd: C.warnBd },
  TERKIRIM_PENUH: { label: 'Terkirim Penuh', bg: C.infoBg,    color: C.info,    bd: C.infoBd },
  INVOICED:       { label: 'Invoiced',       bg: C.orangeBg,  color: C.orange,  bd: C.orangeBd },
  SUBMITTED:      { label: 'Submitted',      bg: C.orangeBg,  color: C.orange,  bd: C.orangeBd },
  LUNAS:          { label: 'Lunas',          bg: C.infoBg,    color: C.info,    bd: C.infoBd },
  CANCELLED:      { label: 'Dibatalkan',     bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd },
};

function FinPill({ label, active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      border: `1px solid ${active ? C.okBd : C.line}`,
      background: active ? C.okBg : C.surface2,
      color: active ? C.ok : C.inkFaint,
      letterSpacing: '.3px',
    }}>
      {active
        ? <Check size={12} strokeWidth={2.5}/>
        : <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid currentColor`, flexShrink: 0 }}/>}
      {label}
    </span>
  );
}

function MiniBar({ pct }) {
  const color = finColor(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 120 }}>
      <div style={{ flex: 1, height: 7, borderRadius: 4, background: C.lineSoft, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }}/>
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, width: 34, textAlign: 'right', color, flexShrink: 0 }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Finance status stages config ─────────────────────────────────────────
const FIN_STAGES = [
  { key: 'inv',    label: 'Invoice',      icon: Receipt,  cls: C.infoBg,    clsColor: C.info    },
  { key: 'fp',     label: 'Faktur Pajak', icon: FileText, cls: C.purpleBg,  clsColor: C.purple  },
  { key: 'submit', label: 'Submit',        icon: Send,     cls: C.orangeBg,  clsColor: C.orange  },
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

function EditItemModal({ item, spDate, spNo, customer, onClose, onSave }) {
  // Katalog produk (dropdown-only) di-pin ke Storbit/SOA.
  const { products } = useProducts({ companyId: SOA_COMPANY_ID });
  const [draft, setDraft] = useState({
    productId:    item.productId   ?? null,
    productName: item.productName || '',
    sku:          item.sku         || '',
    dc:           item.dc          || '',
    qty:          item.qty         ?? 0,
    shippedQty:   item.shippedQty  ?? 0,
    expDate:      item.expDate     || '',
    expired_date: item.expired_date || '',
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
  const ppn         = Math.round(subtotal * 0.11);
  const grandTotal  = subtotal + ppn + Number(draft.shippingPrice);

  function autoStatus() {
    const q = Number(draft.qty), s = Number(draft.shippedQty), out = Math.max(0, q - s);
    if (s > 0 && out === 0) return { bg: C.okBg,      color: C.ok,     bd: C.okBd,     label: 'Shipped'  };
    if (s > 0 && out > 0)   return { bg: C.warnBg,    color: C.warn,   bd: C.warnBd,   label: 'Parsial'  };
    if (q > 0)               return { bg: C.infoBg,    color: C.info,   bd: C.infoBd,   label: 'Confirmed'};
    return                          { bg: C.neutralBg, color: C.neutral,bd: C.neutralBd,label: 'Open'     };
  }

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
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
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
            <ModalField label="DC" req>
              <input value={draft.dc} onChange={e => set('dc', e.target.value)} style={{ height: 38, padding: '0 11px', border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}/>
            </ModalField>
          </ModalGrid>

          {/* Quantity */}
          <ModalSect>Quantity</ModalSect>
          <ModalGrid cols={3}>
            <ModalField label="QTY" req>
              <ModalInp type="number" value={draft.qty} onChange={e => set('qty', e.target.value)}/>
            </ModalField>
            <ModalField label="Shipped QTY"><ModalInp value={draft.shippedQty} readOnly/></ModalField>
            <ModalField label="Outstanding">
              <ModalInp value={outstanding} readOnly style={{ color: outstanding > 0 ? C.warn : C.ink }}/>
            </ModalField>
          </ModalGrid>

          {/* Tanggal */}
          <ModalSect>Tanggal</ModalSect>
          <ModalGrid cols={3}>
            <ModalField label="Exp Date">
              <ModalInp type="date" value={draft.expDate} onChange={e => set('expDate', e.target.value)}/>
            </ModalField>
            <ModalField label="Expired Date" req>
              <ModalInp type="date" value={draft.expired_date} onChange={e => set('expired_date', e.target.value)}/>
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
                <input type="number" value={draft.shippingPrice} onChange={e => set('shippingPrice', e.target.value)} onWheel={blurOnWheel}
                  style={{ height: 38, paddingLeft: 32, paddingRight: 11, border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface, fontSize: 13, color: C.ink, outline: 'none', fontFamily: "'IBM Plex Mono',monospace", width: '100%', boxSizing: 'border-box' }}/>
              </div>
            </ModalField>
          </div>
          {/* Calc row */}
          <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', background: C.surface2, marginBottom: 4 }}>
            {[
              { label: 'Subtotal',    value: rp(subtotal),   color: null      },
              { label: 'PPN (11%)',   value: rp(ppn),        color: null      },
              { label: 'Grand Total', value: rp(grandTotal), color: C.accent  },
              { label: 'Auto Status', value: null,            status: st      },
            ].map((cc, i, arr) => (
              <div key={cc.label} style={{ padding: '11px 14px', borderRight: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint }}>{cc.label}</div>
                {cc.status ? (
                  <div style={{ marginTop: 4 }}>
                    <Badge bg={cc.status.bg} color={cc.status.color} bd={cc.status.bd}>
                      <StatusDot color={cc.status.color}/>{cc.status.label}
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
            style={{ height: 38, padding: '0 18px', borderRadius: 9, border: `1px solid ${C.orangeBd}`, background: C.accentSoft, color: C.accent, fontSize: 13, fontWeight: 700, cursor: (saving || (wasLinked && !draft.productId)) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: (saving || (wasLinked && !draft.productId)) ? .7 : 1 }}>
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
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
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
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
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
function TabBtn({ active, onClick, icon: Icon, label, count }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      padding: '14px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? C.info : C.inkSoft,
      borderBottom: active ? `2.5px solid ${C.info}` : '2.5px solid transparent',
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7,
      marginBottom: -1,
    }}>
      <Icon size={15} strokeWidth={active ? 2.2 : 1.8}/>
      {label}
      {count != null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, borderRadius: 20, padding: '0 5px', fontSize: 11, fontWeight: 700, background: active ? C.infoBg : C.lineSoft, color: active ? C.info : C.inkFaint }}>
          {count}
        </span>
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

  // FASE 3 — baca BTB dari sp_btb (tabel benar) via sp_order_id (dari spOrder.id).
  useEffect(() => {
    const oid = spOrder?.id;
    if (!oid) return undefined;
    let cancelled = false;
    listSpBtbNew(oid).then(({ data }) => { if (!cancelled) setBtbs(data || []); });
    return () => { cancelled = true; };
  }, [spOrder?.id]);

  // Fase 1 — headline status sp_orders (12-tahap) + flag pernah picking dibatalkan (badge additive).
  useEffect(() => {
    const cust = group?.customerId;
    if (!spNo || !cust) return undefined;
    let cancelled = false;
    getSpOrderStatus(cust, spNo).then(({ data }) => { if (!cancelled) setSpOrder(data || null); });
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
  const stockShort = useMemo(() => {
    if (group?.spStatus !== 'confirmed') return { checked: 0, short: 0 };
    let checked = 0, short = 0;
    items.forEach(i => {
      if (!i.productId) return;
      checked += 1;
      const avail = stockMap[i.productId]?.available ?? 0;
      const out = Number(i.qty) - Number(i.shippedQty);
      if (avail < out) short += 1;
    });
    return { checked, short };
  }, [items, stockMap, group?.spStatus]);

  // Refetch BTB list (sp_btb) + headline status (BTB terbit/hapus menggerakkan
  // sp_orders.status via recompute → BTB_TERBIT rank tertinggi / mundur).
  const refreshBtbAndStatus = async () => {
    const cust = group?.customerId;
    if (spOrder?.id) { const { data } = await listSpBtbNew(spOrder.id); setBtbs(data || []); }
    if (cust) { const { data } = await getSpOrderStatus(cust, spNo); setSpOrder(data || null); }
  };

  const handleAddBtb = async () => {
    if (!btbInput.trim()) return;
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
    const { error } = await deleteSpBtbNew(id);
    if (error) { showToast?.('Gagal hapus BTB: ' + error.message, 'error'); return; }
    await refreshBtbAndStatus();
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
  const finOverallColor = finColor(finOverallPct);

  // ── Financial summary numbers (via calcItem — single source of truth) ───
  const allCalc     = items.map(i => calcItem(i));
  const subtotal    = allCalc.reduce((s, c) => s + c.subtotal, 0);
  const ppnTotal    = allCalc.reduce((s, c) => s + c.ppn, 0);
  const ongkosKirim = items.reduce((s, i) => s + (Number(i.shippingPrice) || 0), 0);
  const grandTotal  = subtotal + ppnTotal + ongkosKirim;
  const totalQty    = items.reduce((s, i) => s + Number(i.qty),       0);
  const shippedQty  = items.reduce((s, i) => s + Number(i.shippedQty), 0);
  const outstandQty = totalQty - shippedQty;

  // ── Deadline display ───────────────────────────────────────────────────
  const firstDeadline = items.find(i => i.expired_date)?.expired_date || null;
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

  const cust = custColor(customer);

  // ── Header status (spStatus lifecycle + qty-derived, precedence high→low) ──
  // FASE 2E — headline dari sp_orders.status (12 tahap), fallback DRAFT bila belum termuat.
  const headerStatus = (() => {
    if (!group) return null;
    return HEADLINE_META[spOrder?.status] || HEADLINE_META.DRAFT;
  })();
  // Aksi gudang (Generate Picking + indikator stok) hanya di tahap awal, belum picking.
  const canGeneratePicking = spOrder?.status === 'CONFIRMED' || spOrder?.status === 'MENUNGGU_STOK';

  if (!spNo) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1240, fontFamily: "'Inter', sans-serif", color: C.ink }}>

      {/* ── Breadcrumb + title ────────────────────────────────────────── */}
      <div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.inkFaint, marginBottom: 6 }}>
          <span>Logistics</span>
          <ChevronRight size={12}/>
          <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.inkFaint, fontSize: 12 }}>Sales Order / SP</button>
          <ChevronRight size={12}/>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: C.ink, fontWeight: 600 }}>{spNo}</span>
        </nav>
        {/* Heading pakai Space Grotesk — keputusan final (bukan trial), aksen tipografi khas Detail SP. */}
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', lineHeight: 1.15 }}>
          Detail Sales Order
        </h1>
      </div>

      {/* ── Header card ───────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(20,30,45,.05)' }}>
        {/* Row 1: nomor SP (kiri) + tombol aksi (kanan) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 30, fontWeight: 600, letterSpacing: '.5px', lineHeight: 1, color: C.ink }}>
            {spNo}
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignSelf: 'flex-start', alignItems: 'center' }}>
            {canGeneratePicking && (
              <button
                onClick={async () => {
                  if (genBusy) return;
                  setGenBusy(true);
                  await onGeneratePicking?.(spNo, group?.customerId);
                  setGenBusy(false);
                }}
                disabled={genBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.orangeBd}`, background: C.accentSoft, color: C.accent, fontSize: 13, fontWeight: 700, cursor: genBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: genBusy ? 0.7 : 1 }}
              >
                <ClipboardList size={14}/> {genBusy ? 'Membuat…' : 'Generate Picking List'}
              </button>
            )}
            <button
              onClick={() => items[0] && setEditingItem(items[0])}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Pencil size={14}/> Edit
            </button>
            {['super_admin', 'operations', 'manager', 'gm'].includes(role) && spOrder?.status === 'DRAFT' && (
              <button
                onClick={() => setShowCancelSP(true)}
                title="Batalkan SP (status → Dibatalkan)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.dangerBd}`, background: C.surface, color: C.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <X size={14}/> Batalkan SP
              </button>
            )}
            <button
              onClick={onBack}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <ChevronLeft size={14}/> Back to List
            </button>
          </div>
        </div>

        {/* Row 2: badge — STATUS (Dikonfirmasi, flag, Stok cukup) lalu META (customer, produk, qty) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 13, alignItems: 'center' }}>
          {headerStatus && (
            <Badge bg={headerStatus.bg} color={headerStatus.color} bd={headerStatus.bd}>
              <StatusDot color={headerStatus.color}/>{headerStatus.label}
            </Badge>
          )}
          {spOrder?.had_cancelled_picking && (
            <Badge bg={C.warnBg} color={C.warn} bd={C.warnBd}>
              <AlertTriangle size={12}/>Pernah picking dibatalkan
            </Badge>
          )}
          {canGeneratePicking && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
              background: stockShort.short > 0 ? C.warnBg : C.okBg, color: stockShort.short > 0 ? C.warn : C.ok, border: `1px solid ${stockShort.short > 0 ? C.warnBd : C.okBd}` }}>
              {stockShort.short > 0 ? <><AlertTriangle size={13}/> {stockShort.short} item stok kurang</> : <><Check size={13}/> Stok cukup</>}
            </span>
          )}
          <span style={{ display: 'inline-flex', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 6, background: cust.bg, color: cust.ink, border: '1px solid transparent', whiteSpace: 'nowrap' }}>
            {customer}
          </span>
          <Badge bg={C.neutralBg} color={C.neutral} bd={C.neutralBd}>
            <span/>{totalItems} produk
          </Badge>
          <Badge bg={C.orangeBg} color={C.orange} bd={C.orangeBd}>
            <Package size={12}/>{totalQty.toLocaleString('id-ID')} qty
          </Badge>
        </div>
      </div>

      {/* ── Stat cards (3) — satu keluarga navy; pembeda hanya ikon + label.
             Aksen semantik ke angka (Expired mepet → amber; bar Finance navy/amber/red). ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {/* SP Date */}
        <div style={{ background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.info, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .85 }}>SP Date</span>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#FFFFFF', color: C.info, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={17} strokeWidth={1.8}/>
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.info, letterSpacing: '-.3px', lineHeight: 1.1 }}>{fmtDate(spDate)}</div>
          <div style={{ fontSize: 12, color: C.info, opacity: .8, marginTop: 4 }}>Diterima dari customer</div>
        </div>

        {/* Expired Date */}
        <div style={{ background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.info, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .85 }}>Expired Date</span>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#FFFFFF', color: C.info, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={17} strokeWidth={1.8}/>
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: days != null && days < 2 ? C.warn : C.info, letterSpacing: '-.3px', lineHeight: 1.1 }}>
            {fmtDate(firstDeadline)}
          </div>
          <div style={{ fontSize: 12, color: C.info, opacity: .8, marginTop: 4 }}>{deadlineSub}</div>
        </div>

        {/* Finance Progress */}
        <div style={{ background: C.infoBg, border: `1px solid ${C.infoBd}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.info, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .85 }}>Finance Progress</span>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#FFFFFF', color: C.info, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={17} strokeWidth={1.8}/>
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.info, letterSpacing: '-.3px', lineHeight: 1.1 }}>{finOverallPct}%</div>
          <div style={{ height: 7, marginTop: 9, borderRadius: 4, background: '#FFFFFF', overflow: 'hidden' }}>
            <div style={{ width: `${finOverallPct}%`, height: '100%', background: finOverallColor, borderRadius: 4 }}/>
          </div>
        </div>
      </div>

      {/* ── Tabbed card ───────────────────────────────────────────────── */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(20,30,45,.06)' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.lineSoft}`, padding: '0 6px', overflowX: 'auto', flexShrink: 0 }}>
          <TabBtn active={tab==='overview'} onClick={() => setTab('overview')} icon={List}       label="Overview"/>
          <TabBtn active={tab==='items'}    onClick={() => setTab('items')}    icon={Package}    label="Items"    count={totalItems}/>
          <TabBtn active={tab==='shipment'} onClick={() => setTab('shipment')} icon={Truck}      label="Shipment" count={0}/>
          <TabBtn active={tab==='dokumen'}  onClick={() => setTab('dokumen')}  icon={FolderOpen} label="Dokumen"  count={0}/>
          <TabBtn active={tab==='history'}  onClick={() => setTab('history')}  icon={History}    label="History"/>
        </div>

        {/* ── OVERVIEW panel ── */}
        {tab === 'overview' && (
          <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>

            {/* Financial Summary */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}`, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14 }}>Financial Summary</div>
              <div style={{ padding: '6px 18px 18px' }}>
                {[
                  { k: 'Total Items',    v: `${totalItems} produk`, color: null },
                  { k: 'Total QTY',      v: totalQty.toLocaleString('id-ID'), color: null },
                  { k: 'Shipped',        v: shippedQty.toLocaleString('id-ID'), color: C.ok },
                  { k: 'Outstanding',    v: outstandQty.toLocaleString('id-ID'), color: outstandQty > 0 ? C.danger : C.inkSoft },
                  null, // divider
                  { k: 'Subtotal',       v: rp(subtotal),    color: null },
                  { k: 'Ongkos Kirim',   v: rp(ongkosKirim), color: null },
                  { k: 'PPN (11%)',      v: rp(ppnTotal),    color: null },
                ].map((row, i) => row === null ? (
                  <div key={`div-${i}`} style={{ height: 1, background: C.lineSoft, margin: '6px 0' }}/>
                ) : (
                  <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 13, borderBottom: `1px solid ${C.lineSoft}` }}>
                    <span style={{ color: C.inkSoft, fontWeight: 600 }}>{row.k}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: row.color || C.ink }}>{row.v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0 0', marginTop: 5, borderTop: `1.5px solid ${C.line}` }}>
                  <span style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>Grand Total</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 17, fontWeight: 700, color: C.accent }}>{rp(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Finance Status */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}`, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14 }}>Finance Status</div>
              <div style={{ padding: '6px 18px 18px' }}>
                {/* Overall bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface2, marginBottom: 14 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>
                    {finOverallDone} / {finOverallTotal} <span style={{ color: C.inkFaint, fontWeight: 500 }}>langkah selesai</span>
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.lineSoft, overflow: 'hidden' }}>
                    <div style={{ width: `${finOverallPct}%`, height: '100%', background: finOverallColor, borderRadius: 4 }}/>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: C.accent, width: 40, textAlign: 'right', flexShrink: 0 }}>
                    {finOverallPct}%
                  </span>
                </div>

                {/* Finance table */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Tahap','Selesai','Progress',''].map((h, i) => (
                        <th key={h+i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkFaint, textAlign: i === 3 ? 'right' : 'left', padding: '0 10px 9px', borderBottom: `1px solid ${C.lineSoft}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {finStages.map(s => {
                      const color = finColor(s.pct);
                      const Icon  = s.icon;
                      return (
                        <tr key={s.key}>
                          <td style={{ padding: '11px 10px', borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600 }}>
                              <span style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.cls, color: s.clsColor, flexShrink: 0 }}>
                                <Icon size={14}/>
                              </span>
                              {s.label}
                            </div>
                          </td>
                          <td style={{ padding: '11px 10px', borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{s.done}</span>
                            {' '}<span style={{ color: C.inkFaint }}>/ {s.total}</span>
                            {' '}<span style={{ fontSize: 11.5, color: C.inkFaint }}>item</span>
                          </td>
                          <td style={{ padding: '11px 10px', borderBottom: `1px solid ${C.lineSoft}` }}>
                            <MiniBar pct={s.pct}/>
                          </td>
                          <td style={{ padding: '11px 10px', borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right' }}>
                            <StatusDot color={color}/>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* BTB Numbers — SP-level */}
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 11, overflow: 'hidden', gridColumn: '1 / -1' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}`, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>BTB Numbers</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.inkFaint }}>{btbs.length} nomor BTB</span>
              </div>
              <div style={{ padding: '14px 18px' }}>
                {/* Existing BTBs */}
                {btbs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {btbs.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.line}` }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: C.ink, minWidth: 120 }}>{b.btb_no}</span>
                        {b.remarks && (
                          <span style={{ fontSize: 12, color: C.inkFaint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.remarks}</span>
                        )}
                        <button
                          onClick={() => handleDeleteBtb(b.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1, flexShrink: 0 }}
                          title="Hapus BTB"
                        >
                          <X size={13}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {btbs.length === 0 && (
                  <p style={{ fontSize: 13, color: C.inkFaint, marginBottom: 14 }}>Belum ada nomor BTB untuk SP ini.</p>
                )}
                {/* Add BTB input */}
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
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 36, borderRadius: 8, border: 'none', background: btbInput.trim() ? C.accent : C.lineSoft, color: btbInput.trim() ? '#fff' : C.inkFaint, fontSize: 13, fontWeight: 600, cursor: btbInput.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0 }}
                    >
                      <Plus size={13}/> {btbSaving ? 'Menyimpan…' : 'Tambah BTB'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── ITEMS panel ── */}
        {tab === 'items' && (
          <div style={{ padding: 24 }}>
            {items.length === 0 ? (
              <EmptyState icon={Package} title="Tidak ada item" sub="Belum ada item yang tercatat untuk SP ini."/>
            ) : items.map((item, idx) => {
              const sm = itemStatusMeta(item.status);
              const outQty = Number(item.qty) - Number(item.shippedQty);
              const { subtotal: itemSubtotal, ppn: itemPPN, grandTotal: itemGrand } = calcItem(item);
              return (
                <div key={item.id} style={{ border: `1px solid ${C.line}`, borderRadius: 11, background: C.surface, marginBottom: 12, overflow: 'hidden' }}>
                  {/* it-head */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '15px 16px 13px' }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: C.surface2, color: C.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, fontSize: 13 }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 14.5, fontWeight: 700, display: 'block' }}>{item.productName}</b>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: C.inkFaint, marginTop: 2 }}>
                        SKU · {item.sku || '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {canGeneratePicking && (() => {
                        if (!item.productId) return <Badge bg={C.neutralBg} color={C.neutral} bd={C.neutralBd}><span/>Tersedia: —</Badge>;
                        const av = stockMap[item.productId]?.available ?? 0;
                        const ok = av >= outQty;
                        return <Badge bg={ok ? C.okBg : C.dangerBg} color={ok ? C.ok : C.danger} bd={ok ? C.okBd : C.dangerBd}>
                          <span/>Tersedia: {av.toLocaleString('id-ID')}
                        </Badge>;
                      })()}
                      <Badge bg={sm.bg} color={sm.color} bd={sm.bd}>
                        <StatusDot color={sm.color}/>{sm.label}
                      </Badge>
                    </div>
                  </div>

                  {/* it-grid — 6 cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderTop: `1px solid ${C.lineSoft}`, background: C.surface2 }}>
                    {[
                      { label: 'QTY',        value: Number(item.qty).toLocaleString('id-ID') },
                      { label: 'Shipped',    value: Number(item.shippedQty).toLocaleString('id-ID') },
                      { label: 'Outstanding',value: outQty > 0 ? outQty.toLocaleString('id-ID') : '0', danger: outQty > 0 },
                      { label: 'Unit Price', value: rp(item.unitPrice) },
                      { label: 'Shipping',   value: rp(item.shippingPrice) },
                      { label: 'Grand Total',value: rp(itemGrand) },
                    ].map((cell, ci, arr) => (
                      <div key={cell.label} style={{ padding: '11px 14px', borderRight: ci < arr.length - 1 ? `1px solid ${C.lineSoft}` : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint }}>{cell.label}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, fontWeight: 600, marginTop: 3, color: cell.danger ? C.danger : C.ink }}>{cell.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* it-foot */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', flexWrap: 'wrap', borderTop: `1px solid ${C.lineSoft}` }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                      <FinPill label="INV" active={!!item.inv}/>
                      <FinPill label="FP"  active={!!item.fp}/>
                      <FinPill label="SUB" active={!!item.submit}/>
                      <FinPill label="KRM" active={!!item.kirim}/>
                      {/* btbNo display removed — BTB numbers now at SP level */}
                      {item.deliveredDate ? (
                        <Badge bg={C.okBg} color={C.ok} bd={C.okBd}>
                          <StatusDot color={C.ok}/>Delivered: {fmtDate(item.deliveredDate)}
                        </Badge>
                      ) : item.estimatedDeliveryDate ? (() => {
                        const isOverdue = new Date(item.estimatedDeliveryDate) < new Date(new Date().toDateString());
                        return isOverdue ? (
                          <Badge bg={C.dangerBg} color={C.danger} bd={C.dangerBd}>
                            <StatusDot color={C.danger}/>Overdue
                          </Badge>
                        ) : (
                          <Badge bg={C.infoBg} color={C.info} bd={C.infoBd}>
                            Est. Delivery: {fmtDate(item.estimatedDeliveryDate)}
                          </Badge>
                        );
                      })() : null}
                    </div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <button
                        onClick={() => showToast('Fitur shipment item akan tersedia setelah migrasi tabel shipment', 'success')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.orangeBd}`, background: C.surface, color: C.orange, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <Truck size={13}/> Shipment
                      </button>
                      <button
                        onClick={() => showToast('Finance update akan tersedia setelah migrasi tabel status', 'success')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.okBd}`, background: C.surface, color: C.accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <Wallet size={13}/> Finance
                      </button>
                      {(role === 'super_admin' || role === 'operations' || role === 'manager' || role === 'gm') && (
                        <button
                          onClick={() => setEditingItem(item)}
                          title="Edit item"
                          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.inkFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Pencil size={15}/>
                        </button>
                      )}
                      {(role === 'super_admin') && (
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          title="Hapus item"
                          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid transparent`, background: 'transparent', color: C.inkFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = C.dangerBd; e.currentTarget.style.background = C.dangerBg; }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.inkFaint; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Trash2 size={15}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SHIPMENT panel ── */}
        {tab === 'shipment' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <b style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14.5 }}>Riwayat Pengiriman</b>
                <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 3 }}>
                  {shippedQty > 0 ? `${shippedQty.toLocaleString('id-ID')} dari ${totalQty.toLocaleString('id-ID')} qty terkirim` : 'Belum ada pengiriman tercatat'}
                </div>
              </div>
              <button
                onClick={() => showToast('Form tambah shipment akan tersedia setelah migrasi tabel shipment', 'success')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', border: `1px solid ${C.orangeBd}`, borderRadius: 9, background: C.orangeBg, color: C.orange, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                + Tambah Shipment
              </button>
            </div>
            <EmptyState icon={Truck} title="Belum ada shipment" sub="Data pengiriman akan muncul di sini setelah tabel shipment dimigrasi ke database."/>
          </div>
        )}

        {/* ── DOKUMEN panel ── */}
        {tab === 'dokumen' && (
          <div style={{ padding: 24 }}>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: C.surface2, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Link2 size={16} style={{ color: C.accent }}/>
                <b style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, color: C.ink }}>Link Dokumen SP</b>
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
                    style={{ height: 38, padding: '0 16px', borderRadius: 9, border: `1px solid ${C.orangeBd}`, background: C.accentSoft, color: C.accent, fontSize: 13, fontWeight: 700, cursor: docSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: docSaving ? 0.7 : 1 }}>
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
          <div style={{ padding: 24 }}>
            <EmptyState icon={History} title="History kosong" sub="Log aktivitas SP akan muncul di sini setelah tabel audit log diimplementasikan."/>
          </div>
        )}
      </div>

      {/* ── Danger zone ── super_admin only + hanya saat DRAFT ──────────── */}
      {role === 'super_admin' && spOrder?.status === 'DRAFT' && (
        <div style={{
          border: `1px solid ${C.dangerBd}`, borderRadius: 12, background: C.dangerBg,
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

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
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
