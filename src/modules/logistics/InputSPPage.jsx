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
import { bulkInsertSpItems } from '../../lib/db';

// ─── Design tokens ────────────────────────────────────────────────────────
const C = {
  bg:        '#F6EFE3',
  bgAlt:     '#EFE6D4',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#2F6B3F',
  accentSoft:'#E7EFE2',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  orange:    '#A45A22', orangeBg: '#F6E8D6', orangeBd: '#E7CDA9',
};

const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const today = () => new Date().toISOString().slice(0, 10);

// DC options — merged with dcList from existing rows
const DEFAULT_DCS = [
  'DC Cibitung','DC Cikarang','DC Bekasi',
  'DC Tangerang','DC Depok','DC Bogor','DC Bandung',
];

// ─── Item row counter ─────────────────────────────────────────────────────
let _seq = 0;
const freshItem = () => ({
  id: ++_seq,
  productName: '',
  sku: '',
  qty: 1,
  unitPrice: 0,
  shippingPrice: 0,
  expDate: '',
  deadline: '',
});

// ─── Shared input style ───────────────────────────────────────────────────
const inpStyle = (extra = {}) => ({
  width: '100%', height: 40, borderRadius: 9,
  border: `1px solid ${C.line}`, background: C.surface,
  padding: '0 12px', fontSize: 13.5, color: C.ink,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color .14s, box-shadow .14s',
  ...extra,
});

function Field({ label, req, children, full }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
        {label}{req && <span style={{ color: C.danger }}> *</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function InputSPPage({ onBack, customers = [], dcList = [], showToast }) {
  // SP header
  const [spDate,     setSpDate]     = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [dc,         setDc]         = useState('');
  const [deadline,   setDeadline]   = useState('');
  const [notes,      setNotes]      = useState('');

  // Items
  const [items,   setItems]   = useState([freshItem()]);
  const [saving,  setSaving]  = useState(false);

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
  const headerOk = spDate && customerId && deadline;
  const itemsOk  = items.length > 0 && items.every(i => i.productName.trim() && Number(i.qty) >= 1 && Number(i.unitPrice) >= 0);
  const isValid  = headerOk && itemsOk;

  // Submit helper
  const doInsert = useCallback(async () => {
    setSaving(true);
    const spNo = `SP-${Date.now().toString().slice(-6)}`;
    const rows = items.map(item => ({
      spDate,
      spNo,
      customerId,
      productName:   item.productName.trim(),
      sku:           item.sku || '',
      qty:           Number(item.qty) || 1,
      unitPrice:     Number(item.unitPrice) || 0,
      shippingPrice: Number(item.shippingPrice) || 0,
      deadline:      item.deadline || deadline,
      expDate:       item.expDate || '',
      dc:            dc || '',
      notes:         notes || '',
    }));
    const { error } = await bulkInsertSpItems(rows);
    setSaving(false);
    if (error) {
      showToast('Gagal membuat SP: ' + (error.message || 'unknown'), 'error');
      return false;
    }
    showToast(`${spNo} berhasil dibuat ✓`, 'success');
    return true;
  }, [items, spDate, customerId, dc, deadline, notes, showToast]);

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
    // sp_items has no status column — same insert as submit
    const ok = await doInsert();
    if (ok) onBack();
  }, [headerOk, items, doInsert, onBack, showToast]);

  const inp = (props) => (
    <input
      {...props}
      onFocus={e => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = '0 0 0 3px rgba(47,107,63,.12)'; }}
      onBlur={e  => { e.target.style.borderColor = C.line;   e.target.style.boxShadow = 'none'; }}
      style={inpStyle(props.style)}
    />
  );

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: C.ink, maxWidth: 1240 }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.inkFaint, marginBottom: 6 }}>
            <span>Logistics</span><ChevronRight size={12}/><span>Sales Order / SP</span><ChevronRight size={12}/>
            <span style={{ color: C.ink, fontWeight: 600 }}>Input SP Baru</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', lineHeight: 1.15 }}>Input SP Baru</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: C.inkSoft }}>Buat surat pesanan baru dari customer Storbit</p>
        </div>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 38, padding: '0 16px', borderRadius: 9,
            border: `1px solid ${C.line}`, background: C.surface2,
            fontSize: 13, fontWeight: 600, color: C.inkSoft, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <ChevronLeft size={14}/> Batal
        </button>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        gap: 18,
        alignItems: 'start',
      }}>

        {/* ── LEFT: form ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* SP Information card */}
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(40,34,18,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>SP Information</h3>
              <span style={{ fontSize: 12, color: C.inkFaint }}>Data dasar surat pesanan</span>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 16px' }}>

                <Field label="SP Date" req>
                  {inp({ type: 'date', value: spDate, onChange: e => setSpDate(e.target.value) })}
                </Field>

                <Field label="Customer" req>
                  <select
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                    onFocus={e => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = '0 0 0 3px rgba(47,107,63,.12)'; }}
                    onBlur={e  => { e.target.style.borderColor = C.line;   e.target.style.boxShadow = 'none'; }}
                    style={inpStyle()}
                  >
                    <option value="">Pilih customer…</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Distribution Center">
                  <select
                    value={dc}
                    onChange={e => setDc(e.target.value)}
                    onFocus={e => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = '0 0 0 3px rgba(47,107,63,.12)'; }}
                    onBlur={e  => { e.target.style.borderColor = C.line;   e.target.style.boxShadow = 'none'; }}
                    style={inpStyle()}
                  >
                    <option value="">Pilih DC…</option>
                    {allDcs.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>

                <Field label="Deadline" req>
                  {inp({ type: 'date', value: deadline, min: today(), onChange: e => setDeadline(e.target.value) })}
                </Field>

                <Field label="Notes" full>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Opsional — catatan untuk SP ini…"
                    onFocus={e => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = '0 0 0 3px rgba(47,107,63,.12)'; }}
                    onBlur={e  => { e.target.style.borderColor = C.line;   e.target.style.boxShadow = 'none'; }}
                    style={{ ...inpStyle({ height: 'auto', padding: '10px 12px', resize: 'vertical', minHeight: 72 }) }}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Items card */}
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(40,34,18,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Items</h3>
              <span style={{ fontSize: 12, color: C.inkFaint }}>{items.length} produk ditambahkan</span>
            </div>
            <div style={{ padding: 20 }}>

              {/* Item rows */}
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '34px 20px', color: C.inkFaint }}>
                  <Package size={34} strokeWidth={1.4} style={{ margin: '0 auto 12px', display: 'block', color: C.line }}/>
                  <b style={{ display: 'block', fontSize: 15, color: C.ink }}>Belum ada item</b>
                  <span style={{ fontSize: 13 }}>Klik "Tambah Item" untuk menambahkan produk ke surat pesanan.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {items.map((item, idx) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      idx={idx}
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
                  width: '100%', height: 42, borderRadius: 10,
                  border: `1.5px dashed #C5B89A`, background: C.surface2,
                  color: C.accent, fontWeight: 600, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit', transition: '.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.accentSoft; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#C5B89A'; e.currentTarget.style.background = C.surface2; }}
              >
                <Plus size={16}/> Tambah Item
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT: sticky summary ────────────────────────────────── */}
        <aside style={{
          position: 'sticky', top: 18,
          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
          overflow: 'hidden', boxShadow: '0 2px 12px rgba(40,34,18,.08)',
        }}>
          {/* Summary header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 18px', borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13.5, fontWeight: 800, letterSpacing: '-.2px' }}>
            <Receipt size={17} style={{ color: C.accent }}/>
            Ringkasan SP
          </div>

          {/* Summary rows */}
          <div style={{ padding: '8px 18px 4px' }}>
            {[
              { k: 'Total Items',        v: `${items.length} produk` },
              { k: 'Total QTY',          v: sum.qty.toLocaleString('id-ID') },
              { k: 'Subtotal',           v: rp(sum.subtotal) },
              { k: 'Total Ongkos Kirim', v: rp(sum.shipping) },
              { k: 'PPN (11%)',          v: rp(sum.ppn) },
            ].map(({ k, v }) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 13, borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ color: C.inkSoft, fontWeight: 600 }}>{k}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Grand Total */}
          <div style={{ margin: '6px 18px 12px', padding: 14, background: C.accentSoft, border: `1px solid ${C.okBd}`, borderRadius: 11 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.accent }}>Grand Total</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 25, fontWeight: 700, color: C.accent, letterSpacing: '-.5px', marginTop: 3 }}>
              {rp(sum.grand)}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button
              onClick={handleDraft}
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                height: 42, borderRadius: 9, border: `1px solid ${C.line}`,
                background: C.surface2, color: C.inkSoft,
                fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit', opacity: saving ? .6 : 1, transition: '.12s',
              }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.background = C.bgAlt; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface2; }}
            >
              <Save size={15}/> Simpan sebagai Draft
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || saving}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                height: 42, borderRadius: 9, border: 'none',
                background: isValid && !saving ? C.accent : C.line,
                color: isValid && !saving ? '#fff' : C.inkFaint,
                fontSize: 13, fontWeight: 700, cursor: isValid && !saving ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: '.14s',
              }}
            >
              {saving ? 'Menyimpan…' : <><Check size={15}/> Submit SP</>}
            </button>
          </div>
        </aside>
      </div>

      {/* Responsive: stack on narrow */}
      <style>{`
        @media (max-width: 860px) {
          .isp-grid { grid-template-columns: 1fr !important; }
          .isp-aside { position: static !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Item row component ────────────────────────────────────────────────────
function ItemRow({ item, idx, onChange, onRemove, canRemove }) {
  const grand = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0) + (Number(item.shippingPrice) || 0);
  const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

  const inp = (props) => (
    <input
      {...props}
      onFocus={e => { e.target.style.borderColor = '#2F6B3F'; e.target.style.boxShadow = '0 0 0 3px rgba(47,107,63,.12)'; }}
      onBlur={e  => { e.target.style.borderColor = '#E7DCC8'; e.target.style.boxShadow = 'none'; }}
      style={{
        width: '100%', height: 38, borderRadius: 8,
        border: '1px solid #E7DCC8', background: '#FFFDF8',
        padding: '0 11px', fontSize: 13, color: '#23291E',
        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
        transition: 'border-color .14s, box-shadow .14s',
        ...props.style,
      }}
    />
  );

  const fieldLabel = (label, req) => (
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#8A8E7C' }}>
      {label}{req && <span style={{ color: '#B23227' }}> *</span>}
    </label>
  );

  return (
    <div style={{
      border: '1px solid #E7DCC8', borderRadius: 11,
      background: '#FFFDF8', overflow: 'hidden',
    }}>
      {/* Row header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px', borderBottom: '1px solid #F0E7D6', background: '#FFFDF8',
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: '#E7EFE2', color: '#2F6B3F',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 12,
        }}>
          {idx + 1}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#23291E' }}>
          {item.productName || 'Item baru'}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: '#2F6B3F' }}>
          {rp(grand)}
        </span>
        {canRemove && (
          <button
            onClick={() => onRemove(item.id)}
            title="Hapus item"
            style={{
              width: 30, height: 30, borderRadius: 7, flexShrink: 0,
              border: '1px solid #E7DCC8', background: '#FFFDF8',
              color: '#8A8E7C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#B23227'; e.currentTarget.style.borderColor = '#E6BBB2'; e.currentTarget.style.background = '#F6E0DB'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#8A8E7C'; e.currentTarget.style.borderColor = '#E7DCC8'; e.currentTarget.style.background = '#FFFDF8'; }}
          >
            <Trash2 size={15}/>
          </button>
        )}
      </div>

      {/* Row fields */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.4fr 0.8fr 1.2fr 1.2fr',
        gap: '10px 12px',
        padding: 14,
      }}>
        {/* Product Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('Product Name', true)}
          {inp({
            value: item.productName,
            placeholder: 'Nama produk…',
            onChange: e => onChange(item.id, 'productName', e.target.value),
          })}
        </div>

        {/* SKU — readonly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('SKU')}
          {inp({
            value: item.sku,
            placeholder: '—',
            readOnly: true,
            onChange: e => onChange(item.id, 'sku', e.target.value),
            style: { fontFamily: "'IBM Plex Mono', monospace", background: '#F6EFE3', cursor: 'not-allowed' },
          })}
        </div>

        {/* QTY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('QTY', true)}
          {inp({
            type: 'number', min: 1, value: item.qty,
            onChange: e => onChange(item.id, 'qty', e.target.value),
          })}
        </div>

        {/* Unit Price */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('Unit Price', true)}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 10, fontSize: 12, color: '#8A8E7C', pointerEvents: 'none' }}>Rp</span>
            {inp({
              type: 'number', min: 0, value: item.unitPrice,
              onChange: e => onChange(item.id, 'unitPrice', e.target.value),
              style: { paddingLeft: 32, fontFamily: "'IBM Plex Mono', monospace" },
            })}
          </div>
        </div>

        {/* Shipping Price */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('Ongkos Kirim')}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 10, fontSize: 12, color: '#8A8E7C', pointerEvents: 'none' }}>Rp</span>
            {inp({
              type: 'number', min: 0, value: item.shippingPrice,
              onChange: e => onChange(item.id, 'shippingPrice', e.target.value),
              style: { paddingLeft: 32, fontFamily: "'IBM Plex Mono', monospace" },
            })}
          </div>
        </div>

        {/* Exp Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('Exp Date')}
          {inp({
            type: 'date', value: item.expDate,
            onChange: e => onChange(item.id, 'expDate', e.target.value),
          })}
        </div>

        {/* Item Deadline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {fieldLabel('Deadline Item')}
          {inp({
            type: 'date', value: item.deadline,
            onChange: e => onChange(item.id, 'deadline', e.target.value),
          })}
        </div>
      </div>
    </div>
  );
}
