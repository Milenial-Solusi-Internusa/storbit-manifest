// src/modules/inventory/pages/PenerimaanBarangPage.jsx
// Penerimaan Barang — Goods Receipt form for Nexus by MSI (SOA)
// Fetches products, warehouses, vendors from Supabase.
// Saves to stock_ledger on Konfirmasi.
//
// Design reference: /tmp/pb_out/nexus-by-msi/project/PenerimaanBarangPage.jsx
// Adapted: mock data → Supabase fetch + save, inline styles, Nexus patterns.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

/* ── brand tokens ──────────────────────────────────────────────────────────── */
const NAVY   = '#144682';
const ORANGE = '#E85A1E';

/* ── inline icon paths ─────────────────────────────────────────────────────── */
const ICONS = {
  chevright:  '<path d="m9 18 6-6-6-6"/>',
  chevdown:   '<path d="m6 9 6 6 6-6"/>',
  search:     '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus:       '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash:      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  clipboard:  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  x:          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check:      '<path d="M20 6 9 17l-5-5"/>',
  checkcircle:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  warehouse:  '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/>',
  calendar:   '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  truck:      '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  building:   '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  hash:       '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  package:    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  alert:      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info:       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  loader:     '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
};

function Icon({ name, size = 18, color, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color || 'currentColor'} strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }}
    />
  );
}

/* ── constants ─────────────────────────────────────────────────────────────── */
const RECEIPT_TYPES = ['Purchase Order', 'Restock Produksi', 'Transfer Masuk', 'Adjustment'];

const nf = (n) => Number(n || 0).toLocaleString('id-ID');
let _rid = 100;
const newRow = () => ({ key: ++_rid, product_id: '', qty: '', catatan: '' });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/* ── style tokens ──────────────────────────────────────────────────────────── */
const PB = {
  root:      { fontFamily: "'Inter', system-ui, sans-serif", background: '#F7F7F8', minHeight: '100%', padding: '26px 28px 60px', boxSizing: 'border-box', color: '#3A3A3F' },
  wrap:      { maxWidth: 1280, margin: '0 auto' },

  /* header */
  topRow:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 22, flexWrap: 'wrap' },
  crumbs:    { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#9AA0AC', marginBottom: 8 },
  crumbCur:  { color: '#545B66', fontWeight: 600 },
  title:     { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  sub:       { fontSize: 13, color: '#7A828E', marginTop: 5 },
  cancelBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 16px', borderRadius: 11, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .14s ease' },

  /* layout */
  cols:      { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, alignItems: 'start' },

  /* card */
  card:      { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,40,70,.04)', marginBottom: 18 },
  cardHead:  { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #F0F1F4' },
  cardHeadIco:{ width: 30, height: 30, borderRadius: 9, background: '#EAF0F8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 30px' },
  cardTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 800, color: '#16243A', letterSpacing: -0.2 },
  cardSubLbl:{ fontSize: 11.5, color: '#9AA0AC', fontWeight: 500, marginLeft: 'auto' },
  cardBody:  { padding: 20 },

  /* fields */
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field:     { display: 'flex', flexDirection: 'column', gap: 7 },
  label:     { fontSize: 12, fontWeight: 600, color: '#545B66', display: 'flex', alignItems: 'center', gap: 3 },
  req:       { color: ORANGE, fontWeight: 700 },
  input:     { width: '100%', height: 42, borderRadius: 10, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 14px', fontFamily: 'inherit', fontSize: 13.5, color: '#3A3A3F', boxSizing: 'border-box', outline: 'none' },
  inputMono: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 500, letterSpacing: 0.2 },
  selectWrap:{ position: 'relative' },
  select:    { width: '100%', height: 42, borderRadius: 10, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 38px 0 14px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: '#3A3A3F', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', outline: 'none' },
  selectPlaceholder: { color: '#9AA0AC' },
  selectIco: { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' },

  /* detail table */
  dtTable:   { width: '100%', borderCollapse: 'collapse' },
  dtTh:      { fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', background: '#FAFBFC', borderBottom: '1px solid #F0F1F4', padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' },
  dtTd:      { padding: '10px 12px', borderBottom: '1px solid #F4F5F7', verticalAlign: 'middle' },
  idxCell:   { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 600, color: '#9AA0AC', textAlign: 'center', width: 34 },
  qtyInput:  { width: 90, height: 38, borderRadius: 9, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 10px', fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, fontSize: 13, color: '#16243A', textAlign: 'right', boxSizing: 'border-box', outline: 'none' },
  uomBox:    { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 56, height: 38, padding: '0 12px', borderRadius: 9, background: '#F0F2F5', color: '#6B7280', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3 },
  uomEmpty:  { background: '#FAFBFC', color: '#C2C7D0', border: '1px dashed #E3E5EA' },
  noteInput: { width: '100%', minWidth: 140, height: 38, borderRadius: 9, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 11px', fontFamily: 'inherit', fontSize: 12.5, color: '#3A3A3F', boxSizing: 'border-box', outline: 'none' },
  trashBtn:  { width: 34, height: 34, borderRadius: 9, border: '1px solid #F1D6CF', background: '#fff', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .14s ease' },
  trashBtnDisabled: { opacity: .4, cursor: 'not-allowed', borderColor: '#EEF0F3', color: '#C2C7D0' },
  addBtn:    { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 10, border: '1.5px dashed ' + NAVY, background: '#F7FAFD', color: NAVY, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 16, transition: 'all .14s ease' },

  /* combobox */
  cbWrap:    { position: 'relative', minWidth: 240 },
  cbBtn:     { width: '100%', minHeight: 38, borderRadius: 9, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '6px 32px 6px 12px', fontFamily: 'inherit', fontSize: 13, color: '#16243A', cursor: 'pointer', textAlign: 'left', position: 'relative', boxSizing: 'border-box' },
  cbCode:    { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11.5, fontWeight: 600, color: NAVY, display: 'block', letterSpacing: 0.2 },
  cbName:    { fontSize: 12, color: '#545B66', display: 'block', marginTop: 1, fontWeight: 500 },
  cbPlaceholder: { color: '#9AA0AC', fontSize: 13, fontWeight: 500 },
  cbCaret:   { position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' },
  cbPanel:   { position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, minWidth: 280, background: '#fff', border: '1px solid #E3E5EA', borderRadius: 11, boxShadow: '0 12px 30px rgba(20,40,70,.16)', zIndex: 40, overflow: 'hidden' },
  cbSearchWrap: { position: 'relative', padding: 8, borderBottom: '1px solid #F0F1F4' },
  cbSearchIco:  { position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' },
  cbSearch:  { width: '100%', height: 36, borderRadius: 8, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 12px 0 34px', fontFamily: 'inherit', fontSize: 12.5, color: '#3A3A3F', boxSizing: 'border-box', outline: 'none' },
  cbList:    { maxHeight: 220, overflowY: 'auto', padding: 5 },
  cbItem:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' },
  cbEmpty:   { padding: '16px 12px', textAlign: 'center', fontSize: 12.5, color: '#9AA0AC' },

  textarea:  { width: '100%', minHeight: 96, borderRadius: 10, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '12px 14px', fontFamily: 'inherit', fontSize: 13.5, color: '#3A3A3F', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5, outline: 'none' },

  /* summary sidebar */
  sideSticky: { position: 'sticky', top: 26 },
  sumCard:   { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,40,70,.04)', overflow: 'hidden' },
  sumHead:   { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', background: '#16243A', color: '#fff' },
  sumHeadIco:{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 30px' },
  sumTitle:  { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: -0.2 },
  sumBody:   { padding: 18 },
  metaRow:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '8px 0' },
  metaLbl:   { fontSize: 12, color: '#9AA0AC', fontWeight: 500, flex: '0 0 auto' },
  metaVal:   { fontSize: 12.5, color: '#16243A', fontWeight: 600, textAlign: 'right' },
  metaValMuted: { color: '#C2C7D0', fontWeight: 500, fontStyle: 'italic' },
  divider:   { height: 1, background: '#F0F1F4', margin: '12px 0' },
  sumTblHead:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', padding: '0 0 8px' },
  sumItem:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0' },
  sumItemCode: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 600, color: NAVY },
  sumItemName: { fontSize: 11.5, color: '#7A828E', marginTop: 1 },
  sumItemQty:  { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12.5, fontWeight: 700, color: '#16243A', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  sumEmpty:  { fontSize: 12, color: '#C2C7D0', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' },
  totalRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' },
  totalLbl:  { fontSize: 12.5, color: '#545B66', fontWeight: 600 },
  totalVal:  { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 18, fontWeight: 800, color: '#16243A', letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' },
  totalValNavy: { color: NAVY },
  confirmBtn:{ width: '100%', height: 46, borderRadius: 11, border: '1px solid ' + NAVY, background: NAVY, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .15s ease' },
  confirmBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' },

  toast:     { position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, boxShadow: '0 14px 34px rgba(10,20,40,.26)', zIndex: 200, transition: 'opacity .22s ease, transform .22s ease', pointerEvents: 'none', color: '#fff' },

  /* loading */
  loadingOverlay: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#9AA0AC', padding: '6px 0' },
};

/* ── ProductCombobox — searchable dropdown using fetched products ─────────── */
function ProductCombobox({ value, onChange, products, invalid }) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState('');
  const ref               = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const sel  = products.find(p => p.id === value) || null;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter(p =>
      (p.code || '').toLowerCase().includes(s) || (p.name || '').toLowerCase().includes(s)
    );
  }, [q, products]);

  return (
    <div style={PB.cbWrap} ref={ref}>
      <button type="button" className="pb-cb-btn"
        style={{ ...PB.cbBtn, borderColor: invalid ? '#E5A48F' : '#E3E5EA', background: invalid ? '#FFF8F5' : '#FCFCFD' }}
        onClick={() => { setOpen(o => !o); setQ(''); }}>
        {sel ? (
          <span>
            <span style={PB.cbCode}>{sel.code}</span>
            <span style={PB.cbName}>{sel.name}</span>
          </span>
        ) : (
          <span style={PB.cbPlaceholder}>Pilih produk…</span>
        )}
        <span style={PB.cbCaret}><Icon name="chevdown" size={15}/></span>
      </button>

      {open && (
        <div style={PB.cbPanel}>
          <div style={PB.cbSearchWrap}>
            <span style={PB.cbSearchIco}><Icon name="search" size={15}/></span>
            <input autoFocus style={PB.cbSearch} placeholder="Cari kode atau nama produk…"
              value={q} onChange={e => setQ(e.target.value)}/>
          </div>
          <div style={PB.cbList}>
            {list.length === 0 ? (
              <div style={PB.cbEmpty}>Produk tidak ditemukan</div>
            ) : list.map(p => {
              const on = p.id === value;
              const uomLabel = p.uom || p.unit || '–';
              return (
                <div key={p.id} className="pb-cb-item"
                  style={{ ...PB.cbItem, background: on ? '#EAF0F8' : 'transparent' }}
                  onClick={() => { onChange(p.id); setOpen(false); }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={PB.cbCode}>{p.code}</span>
                    <span style={PB.cbName}>{p.name}</span>
                  </span>
                  <span style={PB.uomBox}>{uomLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card shell ─────────────────────────────────────────────────────────────── */
function Card({ icon, title, sub, children }) {
  return (
    <div style={PB.card}>
      <div style={PB.cardHead}>
        <span style={PB.cardHeadIco}><Icon name={icon} size={17}/></span>
        <span style={PB.cardTitle}>{title}</span>
        {sub ? <span style={PB.cardSubLbl}>{sub}</span> : null}
      </div>
      <div style={PB.cardBody}>{children}</div>
    </div>
  );
}

/* ── Labeled field ──────────────────────────────────────────────────────────── */
function Field({ label, required, children }) {
  return (
    <div style={PB.field}>
      <label style={PB.label}>
        {label}{required ? <span style={PB.req}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

/* ── Select with options array of { value, label } or strings ─────────────── */
function Select({ value, onChange, options, placeholder, invalid, disabled }) {
  // options: string[] or { value, label }[]
  const normalised = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <div style={PB.selectWrap}>
      <select
        disabled={disabled}
        style={{
          ...PB.select,
          ...(value ? null : PB.selectPlaceholder),
          borderColor: invalid ? '#E5A48F' : '#E3E5EA',
          background: invalid ? '#FFF8F5' : '#FCFCFD',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {normalised.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={PB.selectIco}><Icon name="chevdown" size={15}/></span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════════════ */
export default function PenerimaanBarangPage({ setActiveMenu }) {
  /* ── master data from Supabase ── */
  const [soaId,      setSoaId]      = useState(null);
  const [products,   setProducts]   = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [vendors,    setVendors]    = useState([]);
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterError,   setMasterError]   = useState(null);

  /* ── form state ── */
  const [form, setForm] = useState({
    ref:      '',
    date:     todayIso(),
    warehouse_id: '',
    tipe:     '',
    vendor_id:'',
    po:       '',
    notes:    '',
  });
  const [rows, setRows]             = useState([newRow()]);
  const [toast, setToast]           = useState({ show: false, msg: '', ok: true });
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving]         = useState(false);
  const toastTimer                  = useRef(null);

  /* ── fetch master data on mount ── */
  const fetchMaster = useCallback(async () => {
    setMasterLoading(true);
    setMasterError(null);
    try {
      // Resolve SOA company_id
      const { data: cos, error: coErr } = await supabase
        .from('companies').select('id, code').eq('is_active', true);
      if (coErr) throw coErr;
      const soa = (cos || []).find(c => c.code === 'SOA');
      if (!soa) throw new Error('Company SOA tidak ditemukan.');
      setSoaId(soa.id);

      // Parallel fetch: products, warehouses, vendors
      const [pRes, wRes, vRes] = await Promise.all([
        supabase.from('products')
          .select('id, code, name, unit, uom, inventory_class')
          .eq('company_id', soa.id)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('code')
          .limit(500),
        supabase.from('warehouses')
          .select('id, code, name')
          .eq('company_id', soa.id)
          .eq('is_active', true),
        supabase.from('vendors')
          .select('id, code, name, vendor_type')
          .eq('company_id', soa.id)
          .eq('is_active', true),
      ]);

      if (pRes.error) throw pRes.error;
      if (wRes.error) throw wRes.error;
      if (vRes.error) throw vRes.error;

      setProducts(pRes.data || []);
      setWarehouses(wRes.data || []);
      setVendors(vRes.data || []);
    } catch (err) {
      console.error('[PenerimaanBarangPage] master fetch error:', err);
      setMasterError(err.message || 'Gagal memuat data master.');
    } finally {
      setMasterLoading(false);
    }
  }, []);

  useEffect(() => { fetchMaster(); }, [fetchMaster]);

  /* ── helpers ── */
  const setF   = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setRow = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, newRow()]);
  const delRow = (key) => setRows(rs => rs.length <= 1 ? rs : rs.filter(r => r.key !== key));

  function fireToast(msg, ok = true) {
    clearTimeout(toastTimer.current);
    setToast({ show: true, msg, ok });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  }

  /* ── derived ── */
  const productById = (id) => products.find(p => p.id === id) || null;
  const warehouseById = (id) => warehouses.find(w => w.id === id) || null;
  const vendorById = (id) => vendors.find(v => v.id === id) || null;

  const filledRows  = rows.filter(r => r.product_id && Number(r.qty) > 0);
  const totalItems  = filledRows.length;
  const totalQty    = filledRows.reduce((s, r) => s + Number(r.qty || 0), 0);

  /* ── validation ── */
  const reqMissing  = !form.ref || !form.date || !form.warehouse_id || !form.tipe || !form.vendor_id;
  const rowsMissing = filledRows.length === 0;
  const isValid     = !reqMissing && !rowsMissing;
  const invalidFld  = v => showErrors && !v;

  /* warehouse & vendor options */
  const warehouseOpts = warehouses.map(w => ({ value: w.id, label: w.name || w.code }));
  const vendorOpts    = vendors.map(v => ({ value: v.id, label: v.name }));

  /* ── save: insert to stock_ledger ── */
  async function handleKonfirmasi() {
    if (!isValid) {
      setShowErrors(true);
      fireToast('Lengkapi field wajib & minimal 1 produk', false);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const vendorObj    = vendorById(form.vendor_id);
      const refType      = form.tipe === 'Purchase Order' ? 'PO' : 'ADJ';
      const ledgerRows   = filledRows.map(item => ({
        company_id:     soaId,
        warehouse_id:   form.warehouse_id,
        product_id:     item.product_id,
        movement_type:  'inbound',
        qty:            Number(item.qty),
        reference_type: refType,
        reference_no:   form.ref || null,
        notes:          item.catatan || form.notes || null,
      }));

      const { error: insErr } = await supabase
        .from('stock_ledger')
        .insert(ledgerRows);

      if (insErr) throw insErr;

      fireToast('Penerimaan berhasil disimpan', true);
      setTimeout(() => { setActiveMenu?.('inventory-stok'); }, 1400);
    } catch (err) {
      console.error('[PenerimaanBarangPage] save error:', err);
      fireToast(err.message || 'Gagal menyimpan penerimaan.', false);
    } finally {
      setSaving(false);
    }
  }

  /* ── render helpers ── */
  const selWarehouse = warehouseById(form.warehouse_id);
  const selVendor    = vendorById(form.vendor_id);

  return (
    <div style={PB.root}>
      <style>{`
        .pb-cancel:hover { border-color:#C7CBD4; color:#3A3A3F; background:#FAFBFC; }
        .pb-add:hover    { background:#EAF2FB; border-style:solid; }
        .pb-trash:hover:not(:disabled) { background:#FEF2F2; border-color:#DC2626; }
        .pb-cb-btn:hover { border-color:#C7CBD4; }
        .pb-cb-item:hover { background:#F4F6F9 !important; }
        .pb-confirm:hover:not(:disabled) { background:${ORANGE}; border-color:${ORANGE}; box-shadow:0 6px 18px rgba(232,90,30,.28); }
        select:focus,input:focus,textarea:focus { outline:none; border-color:${NAVY}; box-shadow:0 0 0 3px rgba(20,70,130,.10); background:#fff; }
        @keyframes pb-spin { to { transform: rotate(360deg); } }
        @media (max-width:1000px) { .pb-cols { grid-template-columns:1fr !important; } .pb-side { position:static !important; } }
        @media (max-width:560px)  { .pb-fieldgrid { grid-template-columns:1fr !important; } }
      `}</style>

      <div style={PB.wrap}>
        {/* ── header ── */}
        <div style={PB.topRow}>
          <div>
            <nav style={PB.crumbs}>
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveMenu?.('inventory-stok')}>
                Inventory / Warehouse
              </span>
              <Icon name="chevright" size={13}/>
              <span style={PB.crumbCur}>Penerimaan Barang</span>
            </nav>
            <h1 style={PB.title}>Penerimaan Barang</h1>
            <div style={PB.sub}>Input barang masuk ke gudang</div>
          </div>
          <button type="button" className="pb-cancel" style={PB.cancelBtn}
            onClick={() => setActiveMenu?.('inventory-stok')}>
            <Icon name="x" size={16}/>Batal
          </button>
        </div>

        {/* ── master data error ── */}
        {masterError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, marginBottom: 18 }}>
            <Icon name="alert" size={16}/>
            {masterError}
          </div>
        )}

        <div style={PB.cols} className="pb-cols">
          {/* ═══ LEFT: form ═══ */}
          <div>
            {/* Section 1 — Informasi Penerimaan */}
            <Card icon="clipboard" title="Informasi Penerimaan">
              {masterLoading ? (
                <div style={PB.loadingOverlay}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth={2} strokeLinecap="round" style={{ animation: 'pb-spin .8s linear infinite', flex: '0 0 auto' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Memuat data master…
                </div>
              ) : (
                <div style={PB.fieldGrid} className="pb-fieldgrid">
                  <Field label="Nomor Referensi" required>
                    <input
                      style={{ ...PB.input, ...PB.inputMono, borderColor: invalidFld(form.ref) ? '#E5A48F' : '#E3E5EA' }}
                      placeholder="PO-2026-XXXX"
                      value={form.ref}
                      onChange={e => setF('ref', e.target.value)}
                    />
                  </Field>
                  <Field label="Tanggal Penerimaan" required>
                    <input type="date"
                      style={{ ...PB.input, borderColor: invalidFld(form.date) ? '#E5A48F' : '#E3E5EA' }}
                      value={form.date}
                      onChange={e => setF('date', e.target.value)}
                    />
                  </Field>
                  <Field label="Gudang Tujuan" required>
                    <Select
                      value={form.warehouse_id}
                      onChange={v => setF('warehouse_id', v)}
                      options={warehouseOpts}
                      placeholder="Pilih gudang…"
                      invalid={invalidFld(form.warehouse_id)}
                    />
                  </Field>
                  <Field label="Tipe Penerimaan" required>
                    <Select
                      value={form.tipe}
                      onChange={v => setF('tipe', v)}
                      options={RECEIPT_TYPES}
                      placeholder="Pilih tipe…"
                      invalid={invalidFld(form.tipe)}
                    />
                  </Field>
                  <Field label="Supplier / Vendor" required>
                    <Select
                      value={form.vendor_id}
                      onChange={v => setF('vendor_id', v)}
                      options={vendorOpts}
                      placeholder="Pilih supplier…"
                      invalid={invalidFld(form.vendor_id)}
                    />
                  </Field>
                  <Field label="PO Number">
                    <input
                      style={{ ...PB.input, ...PB.inputMono }}
                      placeholder="Nomor PO dari supplier"
                      value={form.po}
                      onChange={e => setF('po', e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </Card>

            {/* Section 2 — Detail Barang */}
            <Card icon="package" title="Detail Barang" sub={`${rows.length} baris`}>
              <table style={PB.dtTable}>
                <thead>
                  <tr>
                    <th style={{ ...PB.dtTh, textAlign: 'center' }}>#</th>
                    <th style={PB.dtTh}>Produk <span style={PB.req}>*</span></th>
                    <th style={{ ...PB.dtTh, textAlign: 'right' }}>Qty <span style={PB.req}>*</span></th>
                    <th style={PB.dtTh}>Satuan</th>
                    <th style={PB.dtTh}>Catatan</th>
                    <th style={{ ...PB.dtTh, textAlign: 'center', width: 50 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p = productById(r.product_id);
                    const uomLabel = p ? (p.uom || p.unit || '–') : null;
                    return (
                      <tr key={r.key}>
                        <td style={{ ...PB.dtTd, ...PB.idxCell }}>{i + 1}</td>
                        <td style={PB.dtTd}>
                          <ProductCombobox
                            value={r.product_id}
                            onChange={id => setRow(r.key, { product_id: id })}
                            products={products}
                            invalid={showErrors && !r.product_id}
                          />
                        </td>
                        <td style={{ ...PB.dtTd, textAlign: 'right' }}>
                          <input type="number" min="1"
                            style={{ ...PB.qtyInput, borderColor: showErrors && r.product_id && !(Number(r.qty) > 0) ? '#E5A48F' : '#E3E5EA' }}
                            placeholder="0"
                            value={r.qty}
                            onChange={e => setRow(r.key, { qty: e.target.value })}
                          />
                        </td>
                        <td style={PB.dtTd}>
                          <span style={{ ...PB.uomBox, ...(p ? null : PB.uomEmpty) }}>
                            {p ? uomLabel : '—'}
                          </span>
                        </td>
                        <td style={PB.dtTd}>
                          <input style={PB.noteInput} placeholder="Catatan baris…"
                            value={r.catatan}
                            onChange={e => setRow(r.key, { catatan: e.target.value })}
                          />
                        </td>
                        <td style={{ ...PB.dtTd, textAlign: 'center' }}>
                          <button type="button" className="pb-trash"
                            disabled={rows.length <= 1}
                            style={{ ...PB.trashBtn, ...(rows.length <= 1 ? PB.trashBtnDisabled : null) }}
                            onClick={() => delRow(r.key)}
                            title="Hapus baris">
                            <Icon name="trash" size={15}/>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="button" className="pb-add" style={PB.addBtn} onClick={addRow}>
                <Icon name="plus" size={16}/>Tambah Produk
              </button>
            </Card>

            {/* Section 3 — Catatan Umum */}
            <Card icon="clipboard" title="Catatan Umum">
              <textarea style={PB.textarea}
                placeholder="Tambahkan catatan untuk seluruh penerimaan ini (opsional)…"
                value={form.notes}
                onChange={e => setF('notes', e.target.value)}
              />
            </Card>
          </div>

          {/* ═══ RIGHT: summary ═══ */}
          <div style={PB.sideSticky} className="pb-side">
            <div style={PB.sumCard}>
              <div style={PB.sumHead}>
                <span style={PB.sumHeadIco}><Icon name="clipboard" size={16}/></span>
                <span style={PB.sumTitle}>Ringkasan</span>
              </div>
              <div style={PB.sumBody}>
                <div style={PB.metaRow}>
                  <span style={PB.metaLbl}>Gudang tujuan</span>
                  <span style={{ ...PB.metaVal, ...(selWarehouse ? null : PB.metaValMuted) }}>
                    {selWarehouse ? selWarehouse.name : 'Belum dipilih'}
                  </span>
                </div>
                <div style={PB.metaRow}>
                  <span style={PB.metaLbl}>Tipe penerimaan</span>
                  <span style={{ ...PB.metaVal, ...(form.tipe ? null : PB.metaValMuted) }}>
                    {form.tipe || 'Belum dipilih'}
                  </span>
                </div>
                <div style={PB.metaRow}>
                  <span style={PB.metaLbl}>Supplier</span>
                  <span style={{ ...PB.metaVal, ...(selVendor ? null : PB.metaValMuted) }}>
                    {selVendor ? selVendor.name : 'Belum dipilih'}
                  </span>
                </div>

                <div style={PB.divider}/>

                <div style={PB.sumTblHead}>
                  <span>Produk</span><span>Qty</span>
                </div>
                {filledRows.length === 0 ? (
                  <div style={PB.sumEmpty}>Belum ada produk terisi</div>
                ) : filledRows.map(r => {
                  const p = productById(r.product_id);
                  if (!p) return null;
                  const uomLabel = p.uom || p.unit || '';
                  return (
                    <div key={r.key} style={PB.sumItem}>
                      <span style={{ minWidth: 0 }}>
                        <span style={PB.sumItemCode}>{p.code}</span>
                        <span style={{ ...PB.sumItemName, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      </span>
                      <span style={PB.sumItemQty}>{nf(r.qty)} {uomLabel}</span>
                    </div>
                  );
                })}

                <div style={PB.divider}/>

                <div style={PB.totalRow}>
                  <span style={PB.totalLbl}>Total item</span>
                  <span style={PB.totalVal}>{totalItems}</span>
                </div>
                <div style={PB.totalRow}>
                  <span style={PB.totalLbl}>Total qty</span>
                  <span style={{ ...PB.totalVal, ...PB.totalValNavy }}>{nf(totalQty)}</span>
                </div>

                <button type="button" className="pb-confirm"
                  disabled={saving || masterLoading}
                  style={{ ...PB.confirmBtn, ...(saving || masterLoading ? PB.confirmBtnDisabled : null) }}
                  onClick={handleKonfirmasi}>
                  {saving ? (
                    <>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" style={{ animation: 'pb-spin .8s linear infinite', flex: '0 0 auto' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Menyimpan…
                    </>
                  ) : (
                    <><Icon name="check" size={17}/>Konfirmasi Penerimaan</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── toast ── */}
      <div style={{ ...PB.toast, background: toast.ok ? '#16243A' : '#B91C1C', opacity: toast.show ? 1 : 0, transform: toast.show ? 'translateY(0)' : 'translateY(8px)' }}>
        <Icon name={toast.ok ? 'checkcircle' : 'alert'} size={18} color={toast.ok ? '#8FCB8C' : '#FCA5A5'}/>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
