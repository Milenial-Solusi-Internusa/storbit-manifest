// src/modules/logistics/InputSPPage.jsx
// Design source: nexus-by-msi/project/input-sp.html + storbit.css
//
// Data:
//   customers      — from useCustomers() via App.jsx prop
//   dcList         — derived from sp_items.dc via App.jsx prop
//   showToast      — from App.jsx
//   bulkInsertSpItems — imported from db.js (no duplication)
//
// NOTE: sp_items has no status column — Draft and Submit perform the same insert.
//       SP number is generated client-side as SP-{6-digit-timestamp}.
//       Upgrade to increment_document_sequence RPC in Phase 2.0D.

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight, ChevronLeft, Plus, Trash2,
  Receipt, Check, Save, Package,
} from 'lucide-react';
import { bulkInsertSpItems, bulkInsertSpBtbs } from '../../lib/db';
import { useProducts } from '../../hooks/useProducts';
import ProductPicker from '../../components/ProductPicker';

// SP (Storbit manifest) selalu entitas Storbit (SOA) → pin katalog produk ke SOA,
// bukan company home user (pola sama DeliveryNoteDetailPage).
const SOA_COMPANY_ID = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

// ─── MSI Brand tokens ─────────────────────────────────────────────────────────
const C = {
  // Brand
  navy:       '#1B4D8A',
  navyDark:   '#0f3366',
  navyLight:  '#1a5299',
  orange:     '#E85A1E',
  orangeDark: '#c44d18',
  accentSoft: '#FEF2EC',

  // Backgrounds
  pageBg:    '#F7F7F8',
  surface:   '#FFFFFF',
  surface2:  '#F7F7F8',

  // Text
  ink:       '#1A1A1E',
  inkSoft:   '#4B5563',
  inkFaint:  '#9CA3AF',

  // Borders
  line:      '#E5E7EB',
  lineSoft:  '#F3F4F6',

  // Status
  ok:        '#16A34A', okBg: '#DCFCE7', okBd: '#BBF7D0',
  danger:    '#DC2626', dangerBg: '#FEE2E2', dangerBd: '#FECACA',
  warn:      '#D97706', warnBg: '#FEF3C7', warnBd: '#FDE68A',
  info:      '#2563EB', infoBg: '#DBEAFE', infoBd: '#BFDBFE',
};

const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const today = () => new Date().toISOString().slice(0, 10);

// DC options — merged with dcList from existing rows
const DEFAULT_DCS = [
  'DC Cibitung','DC Cikarang','DC Bekasi',
  'DC Tangerang','DC Depok','DC Bogor','DC Bandung',
];

// ─── Item row counter ─────────────────────────────────────────────────────────
let _seq = 0;
const freshItem = () => ({
  id: ++_seq,
  productId: null,
  productName: '',
  sku: '',
  qty: 1,
  unitPrice: 0,
  shippingPrice: 0,
  expDate: '',
  expired_date: '',
});

// ─── Shared input style ───────────────────────────────────────────────────────
const inpStyle = (extra = {}) => ({
  width: '100%', height: 40, borderRadius: 8,
  border: `1.5px solid ${C.line}`, background: C.surface,
  padding: '0 12px', fontSize: 13.5, color: C.ink,
  outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box',
  transition: 'border-color .14s, box-shadow .14s',
  ...extra,
});

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: C.surface,
      borderRadius: 16,
      border: `1px solid ${C.line}`,
      boxShadow: '0 1px 4px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Card header ──────────────────────────────────────────────────────────────
function CardHeader({ title, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 22px', borderBottom: `1px solid ${C.lineSoft}`,
    }}>
      <h3 style={{
        margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.2px',
        fontFamily: "'Montserrat', sans-serif", color: C.ink,
      }}>
        {title}
      </h3>
      {sub && <span style={{ fontSize: 12, color: C.inkFaint }}>{sub}</span>}
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────
function Field({ label, req, children, full }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkFaint }}>
        {label}{req && <span style={{ color: C.danger }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function InputSPPage({ onBack, customers = [], dcList = [], showToast }) {
  // Product catalog pinned to Storbit/SOA (dropdown-only source for item rows).
  const { products } = useProducts({ companyId: SOA_COMPANY_ID });

  // SP header
  const [spDate,     setSpDate]     = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [dc,         setDc]         = useState('');
  const [expiredDate, setExpiredDate] = useState('');
  const [notes,      setNotes]      = useState('');

  // Items
  const [items,   setItems]   = useState([freshItem()]);
  const [saving,  setSaving]  = useState(false);

  // BTB Numbers (SP-level)
  const [btbRows, setBtbRows] = useState([{ btb_no: '', remarks: '' }]);

  const allDcs = useMemo(
    () => [...new Set([...DEFAULT_DCS, ...dcList])].sort(),
    [dcList],
  );

  // Item mutations
  const addItem    = ()           => setItems(p => [...p, freshItem()]);
  const removeItem = (id)         => setItems(p => p.filter(i => i.id !== id));
  const setField   = (id, k, v)  => setItems(p => p.map(i => i.id === id ? { ...i, [k]: v } : i));

  // Summary (live)
  const sum = useMemo(() => {
    const qty      = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
    const shipping = items.reduce((s, i) => s + (Number(i.shippingPrice) || 0), 0);
    const ppn      = Math.round(subtotal * 0.11);
    return { qty, subtotal, shipping, ppn, grand: subtotal + shipping + ppn };
  }, [items]);

  // Validation
  const headerOk = spDate && customerId && expiredDate;
  // Dropdown-only: item valid hanya bila produk dipilih dari master (productId terisi).
  const itemsOk  = items.length > 0 && items.every(i => i.productId && Number(i.qty) >= 1 && Number(i.unitPrice) >= 0);
  const isValid  = headerOk && itemsOk;

  // Submit helper
  const doInsert = useCallback(async () => {
    setSaving(true);
    const spNo = `SP-${Date.now().toString().slice(-6)}`;
    const rows = items.map(item => ({
      spDate,
      spNo,
      customerId,
      productId:     item.productId || null,
      productName:   item.productName.trim(),
      sku:           item.sku || '',
      qty:           Number(item.qty) || 1,
      unitPrice:     Number(item.unitPrice) || 0,
      shippingPrice: Number(item.shippingPrice) || 0,
      expired_date:  item.expired_date || expiredDate,
      expDate:       item.expDate || '',
      dc:            dc || '',
      notes:         notes || '',
    }));
    const { error } = await bulkInsertSpItems(rows);
    if (error) {
      setSaving(false);
      showToast('Gagal membuat SP: ' + (error.message || 'unknown'), 'error');
      return false;
    }
    // Insert BTB numbers (SP-level) — ignore errors to not block SP creation
    await bulkInsertSpBtbs(spNo, btbRows);
    setSaving(false);
    showToast(`${spNo} berhasil dibuat ✓`, 'success');
    return true;
  }, [items, spDate, customerId, dc, expiredDate, notes, btbRows, showToast]);

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    const ok = await doInsert();
    if (ok) onBack();
  }, [isValid, doInsert, onBack]);

  const handleDraft = useCallback(async () => {
    if (!headerOk || items.length === 0) {
      showToast('Isi SP Date, Customer, dan minimal 1 item untuk draft', 'error');
      return;
    }
    // Dropdown-only juga berlaku untuk draft: tiap item wajib produk dari master.
    if (items.some(i => !i.productId)) {
      showToast('Pilih produk dari dropdown untuk setiap item', 'error');
      return;
    }
    // sp_items has no status column — same insert as submit
    const ok = await doInsert();
    if (ok) onBack();
  }, [headerOk, items, doInsert, onBack, showToast]);

  const inp = (props) => (
    <input
      {...props}
      onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = `0 0 0 3px rgba(20,70,130,.1)`; }}
      onBlur={e  => { e.target.style.borderColor = C.line; e.target.style.boxShadow = 'none'; }}
      style={inpStyle(props.style)}
    />
  );

  const sel = (props) => (
    <select
      {...props}
      onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = `0 0 0 3px rgba(20,70,130,.1)`; }}
      onBlur={e  => { e.target.style.borderColor = C.line; e.target.style.boxShadow = 'none'; }}
      style={inpStyle(props.style)}
    />
  );

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: C.ink, maxWidth: 1240 }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>
            <span>Logistics</span>
            <ChevronRight size={12}/>
            <span>Sales Order / SP</span>
            <ChevronRight size={12}/>
            <span style={{ color: C.navy, fontWeight: 600 }}>Input SP Baru</span>
          </nav>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', lineHeight: 1.15,
            fontFamily: "'Montserrat', sans-serif", color: C.ink,
          }}>
            Input SP Baru
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: C.inkSoft }}>
            Buat surat pesanan baru dari customer Storbit
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 38, padding: '0 16px', borderRadius: 9,
            border: `1.5px solid ${C.line}`, background: C.surface,
            fontSize: 13, fontWeight: 600, color: C.inkSoft, cursor: 'pointer', fontFamily: 'inherit',
            transition: '.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.inkSoft; }}
        >
          <ChevronLeft size={14}/> Batal
        </button>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 20,
        alignItems: 'start',
      }}>

        {/* ── LEFT: form ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── SP Information card ── */}
          <Card>
            <CardHeader title="SP Information" sub="Data dasar surat pesanan"/>
            <div style={{ padding: '20px 22px' }}>

              {/* Row 1: SP Date | Customer | Distribution Center */}
              <div className="nx-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 16px', marginBottom: 14 }}>
                <Field label="SP Date" req>
                  {inp({ type: 'date', value: spDate, onChange: e => setSpDate(e.target.value) })}
                </Field>
                <Field label="Customer" req>
                  {sel({
                    value: customerId,
                    onChange: e => setCustomerId(e.target.value),
                    children: (
                      <>
                        <option value="">Pilih customer…</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </>
                    ),
                  })}
                </Field>
                <Field label="Distribution Center">
                  {sel({
                    value: dc,
                    onChange: e => setDc(e.target.value),
                    children: (
                      <>
                        <option value="">Pilih DC…</option>
                        {allDcs.map(d => <option key={d} value={d}>{d}</option>)}
                      </>
                    ),
                  })}
                </Field>
              </div>

              {/* Row 2: Deadline (alone) */}
              <div className="nx-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 16px', marginBottom: 14 }}>
                <Field label="Expired Date" req>
                  {inp({ type: 'date', value: expiredDate, min: today(), onChange: e => setExpiredDate(e.target.value) })}
                </Field>
              </div>

              {/* Row 3: Notes full-width */}
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Opsional — catatan untuk SP ini…"
                  onFocus={e => { e.target.style.borderColor = C.navy; e.target.style.boxShadow = `0 0 0 3px rgba(20,70,130,.1)`; }}
                  onBlur={e  => { e.target.style.borderColor = C.line; e.target.style.boxShadow = 'none'; }}
                  style={{ ...inpStyle({ height: 'auto', padding: '10px 12px', resize: 'vertical', minHeight: 72 }) }}
                />
              </Field>
            </div>
          </Card>

          {/* ── BTB Numbers card ── */}
          <Card>
            <CardHeader
              title="BTB Numbers"
              sub={`Opsional — ${btbRows.filter(r => r.btb_no?.trim()).length} nomor BTB`}
            />
            <div style={{ padding: '18px 22px' }}>
              {btbRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {inp({
                      value: row.btb_no,
                      placeholder: `Nomor BTB ${idx + 1}…`,
                      style: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 },
                      onChange: e => setBtbRows(prev => prev.map((r, i) => i === idx ? { ...r, btb_no: e.target.value } : r)),
                    })}
                    {btbRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBtbRows(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          height: 40, width: 40, borderRadius: 8, flexShrink: 0,
                          border: `1.5px solid ${C.dangerBd}`, background: C.dangerBg,
                          color: C.danger, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: '.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#FECACA'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.dangerBg; }}
                      >
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                  {inp({
                    value: row.remarks,
                    placeholder: 'Remarks (opsional)…',
                    onChange: e => setBtbRows(prev => prev.map((r, i) => i === idx ? { ...r, remarks: e.target.value } : r)),
                  })}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setBtbRows(prev => [...prev, { btb_no: '', remarks: '' }])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                  padding: '7px 14px', borderRadius: 8,
                  border: `1.5px dashed ${C.line}`, background: 'transparent',
                  color: C.inkSoft, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  transition: '.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.inkSoft; }}
              >
                <Plus size={13}/> Tambah BTB
              </button>
            </div>
          </Card>

          {/* ── Items card ── */}
          <Card>
            <CardHeader title="Items" sub={`${items.length} produk ditambahkan`}/>
            <div style={{ padding: '18px 22px' }}>

              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', color: C.inkFaint }}>
                  <Package size={36} strokeWidth={1.3} style={{ margin: '0 auto 12px', display: 'block', color: C.line }}/>
                  <b style={{ display: 'block', fontSize: 15, color: C.ink, marginBottom: 4 }}>Belum ada item</b>
                  <span style={{ fontSize: 13 }}>Klik "Tambah Item" untuk menambahkan produk ke surat pesanan.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                  {items.map((item, idx) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      idx={idx}
                      products={products}
                      onChange={setField}
                      onRemove={removeItem}
                      canRemove={items.length > 1}
                    />
                  ))}
                </div>
              )}

              {/* Add item button */}
              <button
                onClick={addItem}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', height: 44, borderRadius: 10,
                  border: `1.5px dashed ${C.line}`, background: C.surface2,
                  color: C.navy, fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit', transition: '.14s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.background = '#EBF1FA'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.surface2; }}
              >
                <Plus size={16}/> Tambah Item
              </button>
            </div>
          </Card>
        </div>

        {/* ── RIGHT: sticky summary ────────────────────────────────── */}
        <aside style={{ position: 'sticky', top: 18 }}>
          <Card>
            {/* Summary header — navy gradient */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 20px',
              background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyDark} 100%)`,
              color: '#fff',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: 'rgba(255,255,255,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Receipt size={16}/>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Montserrat', sans-serif", letterSpacing: '-.2px' }}>
                Ringkasan SP
              </span>
            </div>

            {/* Summary rows */}
            <div style={{ padding: '4px 20px 0' }}>
              {[
                { k: 'Total Items',        v: `${items.length} produk` },
                { k: 'Total QTY',          v: sum.qty.toLocaleString('id-ID') },
                { k: 'Subtotal',           v: rp(sum.subtotal) },
                { k: 'Total Ongkos Kirim', v: rp(sum.shipping) },
                { k: 'PPN (11%)',          v: rp(sum.ppn) },
              ].map(({ k, v }) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', fontSize: 13, borderBottom: `1px solid ${C.lineSoft}`,
                }}>
                  <span style={{ color: C.inkSoft, fontWeight: 500 }}>{k}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Grand Total */}
            <div style={{ margin: '14px 20px', padding: '14px 16px', background: C.accentSoft, border: `1.5px solid #FDDCC8`, borderRadius: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.orange, marginBottom: 4 }}>
                Grand Total
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 800, color: C.orange, letterSpacing: '-.5px', lineHeight: 1.2 }}>
                {rp(sum.grand)}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleDraft}
                disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  height: 42, borderRadius: 9, border: `1.5px solid ${C.line}`,
                  background: C.surface, color: C.inkSoft,
                  fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                  fontFamily: 'inherit', opacity: saving ? .6 : 1, transition: '.12s',
                }}
                onMouseEnter={e => { if (!saving) { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.inkSoft; }}
              >
                <Save size={15}/> Simpan sebagai Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid || saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  height: 44, borderRadius: 9, border: 'none',
                  background: isValid && !saving
                    ? `linear-gradient(135deg, ${C.orange} 0%, ${C.orangeDark} 100%)`
                    : C.line,
                  color: isValid && !saving ? '#fff' : C.inkFaint,
                  fontSize: 13.5, fontWeight: 700,
                  cursor: isValid && !saving ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', transition: '.14s',
                  boxShadow: isValid && !saving ? '0 2px 8px rgba(232,90,30,.3)' : 'none',
                }}
              >
                {saving ? 'Menyimpan…' : <><Check size={15}/> Submit SP</>}
              </button>
            </div>
          </Card>
        </aside>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .isp-grid { grid-template-columns: 1fr !important; }
          .isp-aside { position: static !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Item sub-card component ───────────────────────────────────────────────────
function ItemRow({ item, idx, products, onChange, onRemove, canRemove }) {
  const grand = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0) + (Number(item.shippingPrice) || 0);
  const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

  const inp = (props) => (
    <input
      {...props}
      onFocus={e => { e.target.style.borderColor = '#1B4D8A'; e.target.style.boxShadow = '0 0 0 3px rgba(20,70,130,.1)'; }}
      onBlur={e  => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
      style={{
        width: '100%', height: 38, borderRadius: 8,
        border: '1.5px solid #E5E7EB', background: '#FFFFFF',
        padding: '0 11px', fontSize: 13, color: '#1A1A1E',
        outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box',
        transition: 'border-color .14s, box-shadow .14s',
        ...props.style,
      }}
    />
  );

  const fieldLabel = (label, req) => (
    <label style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '.5px', color: '#9CA3AF',
    }}>
      {label}{req && <span style={{ color: '#DC2626' }}> *</span>}
    </label>
  );

  return (
    <div style={{
      border: '1.5px solid #E5E7EB',
      borderRadius: 12,
      background: '#FFFFFF',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,.05)',
    }}>
      {/* Sub-card header: number badge + product name + subtotal + remove */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid #F3F4F6',
        background: '#FAFAFA',
      }}>
        {/* Number badge */}
        <span style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: '#EBF1FA', color: '#1B4D8A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12.5,
        }}>
          {idx + 1}
        </span>

        {/* Product name */}
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#1A1A1E', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.productName || <span style={{ color: '#9CA3AF', fontWeight: 500 }}>Item baru</span>}
        </span>

        {/* Subtotal (orange) */}
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, fontWeight: 700,
          color: '#E85A1E', flexShrink: 0,
        }}>
          {rp(grand)}
        </span>

        {/* Remove button */}
        {canRemove && (
          <button
            onClick={() => onRemove(item.id)}
            title="Hapus item"
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: '1.5px solid #FECACA', background: '#FEE2E2',
              color: '#DC2626', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: '.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FECACA'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FEE2E2'; }}
          >
            <Trash2 size={14}/>
          </button>
        )}
      </div>

      {/* Fields — 2-row grid layout */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Row 1: Product Name | SKU | QTY */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr 0.8fr', gap: '0 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('Product Name', true)}
            {/* Dropdown-only: hanya bisa pilih produk master (SOA). onPick prefill SKU +
                unit_price (nilai awal, tetap editable). onChangeText batalkan pilihan. */}
            <ProductPicker
              value={item.productName}
              products={products}
              placeholder="Cari produk…"
              inputStyle={inpStyle()}
              onChangeText={(v) => {
                onChange(item.id, 'productName', v);
                onChange(item.id, 'productId', null);
                onChange(item.id, 'sku', '');
              }}
              onPick={(p) => {
                onChange(item.id, 'productId', p.id);
                onChange(item.id, 'productName', p.name);
                onChange(item.id, 'sku', p.code || '');
                onChange(item.id, 'unitPrice', Number(p.default_price) || 0);
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('SKU')}
            {inp({
              value: item.sku,
              placeholder: '—',
              readOnly: true,
              onChange: e => onChange(item.id, 'sku', e.target.value),
              style: { fontFamily: "'IBM Plex Mono', monospace", background: '#F7F7F8', color: '#9CA3AF', cursor: 'not-allowed' },
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('QTY', true)}
            {inp({
              type: 'number', min: 1, value: item.qty,
              onChange: e => onChange(item.id, 'qty', e.target.value),
              style: { textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace" },
            })}
          </div>
        </div>

        {/* Row 2: Unit Price | Ongkos Kirim | Exp Date | Deadline */}
        <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('Unit Price', true)}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 10, fontSize: 11.5, color: '#9CA3AF', pointerEvents: 'none', fontFamily: "'Inter',sans-serif" }}>Rp</span>
              {inp({
                type: 'number', min: 0, value: item.unitPrice,
                onChange: e => onChange(item.id, 'unitPrice', e.target.value),
                style: { paddingLeft: 30, fontFamily: "'IBM Plex Mono', monospace" },
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('Ongkos Kirim')}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 10, fontSize: 11.5, color: '#9CA3AF', pointerEvents: 'none', fontFamily: "'Inter',sans-serif" }}>Rp</span>
              {inp({
                type: 'number', min: 0, value: item.shippingPrice,
                onChange: e => onChange(item.id, 'shippingPrice', e.target.value),
                style: { paddingLeft: 30, fontFamily: "'IBM Plex Mono', monospace" },
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('Exp Date')}
            {inp({
              type: 'date', value: item.expDate,
              onChange: e => onChange(item.id, 'expDate', e.target.value),
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {fieldLabel('Expired Date')}
            {inp({
              type: 'date', value: item.expired_date,
              onChange: e => onChange(item.id, 'expired_date', e.target.value),
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
