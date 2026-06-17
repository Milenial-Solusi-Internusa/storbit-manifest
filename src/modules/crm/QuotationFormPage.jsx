// src/modules/crm/QuotationFormPage.jsx
// Layout: header kiri 60% + sticky summary kanan 40%
// Sectioned line items dengan currency IDR/USD per row + kurs USD manual
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, Plus, Trash2, Save, Receipt, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

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
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  orange:    '#A45A22', orangeBg: '#F6E8D6', orangeBd: '#E7CDA9',
};

const VAT_RATE    = 0.011; // 1.1%
const DEFAULT_USD = 16000;
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const today = () => new Date().toISOString().slice(0, 10);

// ─── Pricing authority matrix (BD-06, SOP Pak Adam slide 12) ────────────────
// Returns { tone: 'green'|'orange'|'red', text } based on discount % and user role.
function pricingAuthority(discountPct, erpRole) {
  const d = Number(discountPct) || 0;
  if (d <= 0) return { tone: 'green', text: '✓ Tidak perlu approval' };
  if (d <= 5) return ['sales_spv', 'manager', 'ceo', 'gm', 'admin', 'super_admin'].includes(erpRole)
    ? { tone: 'green', text: '✓ Dalam wewenang Anda' }
    : { tone: 'orange', text: '⚠ Perlu approval Sales SPV' };
  if (d <= 10) return ['manager', 'ceo', 'gm', 'admin', 'super_admin'].includes(erpRole)
    ? { tone: 'green', text: '✓ Dalam wewenang Anda' }
    : { tone: 'orange', text: '⚠ Perlu approval Sales Manager' };
  if (d <= 15) return ['ceo', 'gm', 'admin', 'super_admin'].includes(erpRole)
    ? { tone: 'green', text: '✓ Dalam wewenang Anda' }
    : { tone: 'orange', text: '⚠ Perlu approval BD GM / Commercial Director' };
  if (d <= 20) return ['ceo', 'super_admin'].includes(erpRole)
    ? { tone: 'green', text: '✓ Dalam wewenang Anda' }
    : { tone: 'red', text: '✗ Perlu approval CEO' };
  return { tone: 'red', text: '✗ Perlu approval CEO + Finance Controller + BoD' };
}
const AUTHORITY_TONE = {
  green:  { bg: '#E4F0E5', bd: '#BFDDC4', color: '#2E7D4F' },
  orange: { bg: '#F6E8D6', bd: '#E7CDA9', color: '#A45A22' },
  red:    { bg: '#F6E0DB', bd: '#E6BBB2', color: '#B23227' },
};

const SERVICE_TYPES = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs',            label: 'Customs Clearance'  },
  { value: 'trading',            label: 'General Trading'    },
];

const UNIT_LABELS = [
  'Per CBM', 'Per KG', 'Per Ton', 'Per 20Ft', 'Per 40Ft',
  'Per Container', 'Per BL', 'Per Shipment', 'Per Trip',
  'Per Day', 'Per Document', 'Per Receipt', 'Lumpsum',
];

const CURRENCIES = ['IDR', 'USD'];

// ─── Helpers ──────────────────────────────────────────────────────────────
const freshRow = () => ({
  id:          crypto.randomUUID(),
  description: '',
  cost_price:  0,
  currency:    'IDR',
  unit_price:  0,
  qty:         1,
  unit_label:  'Per 20Ft',
  total:       0,
  notes:       '',
});

const freshSection = (name = 'ORIGIN CHARGES') => ({
  id:   crypto.randomUUID(),
  name,
  rows: [freshRow()],
});

function calcRowTotal(row, usdRate) {
  const price = Number(row.unit_price) || 0;
  const qty   = Number(row.qty) || 0;
  const rate  = row.currency === 'USD' ? (Number(usdRate) || DEFAULT_USD) : 1;
  return Math.round(price * qty * rate);
}

// ─── Atoms ────────────────────────────────────────────────────────────────
const inpStyle = (extra = {}) => ({
  width: '100%', height: 40, borderRadius: 9,
  border: `1px solid ${C.line}`, background: C.surface,
  padding: '0 12px', fontSize: 13.5, color: C.ink,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color .14s',
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

// ─── Document number generator ────────────────────────────────────────────
async function generateQuotationNo(companyId, companyCode) {
  const year = new Date().getFullYear();
  try {
    const { data, error } = await supabase.rpc('increment_document_sequence', {
      p_company_id:     companyId,
      p_document_type:  'QUO',
      p_department_code:'CRM',
      p_year:           year,
      p_month:          0,
    });
    if (error) throw error;
    return `QUO/${companyCode || 'MSI'}/${year}/${String(data).padStart(3, '0')}`;
  } catch {
    return `QUO/${companyCode || 'MSI'}/${year}/${Date.now().toString().slice(-4)}`;
  }
}

// ─── Section component ────────────────────────────────────────────────────
function SectionCard({ section, onUpdateName, onAddRow, onRemoveRow, onUpdateRow, onRemoveSection, canRemove, usdRate }) {
  const cellInp = (extra = {}) => ({
    width: '100%', height: 34, borderRadius: 7, border: `1px solid ${C.line}`,
    background: C.surface, padding: '0 8px', fontSize: 12.5, color: C.ink,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', ...extra,
  });

  return (
    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(35,41,30,.05)' }}>
      {/* Section header bar */}
      <div style={{ background: C.surface2, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.line}` }}>
        <input
          value={section.name}
          onChange={e => onUpdateName(section.id, e.target.value)}
          style={{
            flex: 1, height: 32, borderRadius: 7, border: `1px solid ${C.line}`,
            background: C.surface, padding: '0 10px', fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => onAddRow(section.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <Plus size={12} /> Add Row
        </button>
        {canRemove && (
          <button
            onClick={() => onRemoveSection(section.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Rows table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
              <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, whiteSpace: 'nowrap', background: C.surface }}>Description</th>
              <th className="no-print" style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.danger, whiteSpace: 'nowrap', background: C.surface }}>Cost Price</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, whiteSpace: 'nowrap', background: C.surface }}>Currency</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, whiteSpace: 'nowrap', background: C.surface }}>Sell Price</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, whiteSpace: 'nowrap', background: C.surface }}>Unit Label</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, whiteSpace: 'nowrap', background: C.surface }}>QTY</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, whiteSpace: 'nowrap', background: C.surface }}>Total IDR</th>
              <th style={{ padding: '7px 8px', background: C.surface }}></th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                <td style={{ padding: '6px 6px', minWidth: 160 }}>
                  <input value={row.description} onChange={e => onUpdateRow(section.id, row.id, 'description', e.target.value)}
                    style={cellInp()} placeholder="Deskripsi…" />
                </td>
                <td className="no-print" style={{ padding: '6px 6px', width: 100 }}>
                  <input type="number" min="0" value={row.cost_price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onUpdateRow(section.id, row.id, 'cost_price', e.target.value.replace(/^0+(?=\d)/, ''))}
                    style={cellInp({ textAlign: 'right', borderColor: '#E6BBB2', background: '#FFF6F5' })} />
                </td>
                <td style={{ padding: '6px 6px', width: 72 }}>
                  <select value={row.currency} onChange={e => onUpdateRow(section.id, row.id, 'currency', e.target.value)}
                    style={cellInp({ padding: '0 4px', cursor: 'pointer' })}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 6px', width: 110 }}>
                  <input type="number" min="0" value={row.unit_price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onUpdateRow(section.id, row.id, 'unit_price', e.target.value.replace(/^0+(?=\d)/, ''))}
                    style={cellInp({ textAlign: 'right' })} />
                </td>
                <td style={{ padding: '6px 6px', width: 130 }}>
                  <select value={row.unit_label} onChange={e => onUpdateRow(section.id, row.id, 'unit_label', e.target.value)}
                    style={cellInp({ padding: '0 4px', cursor: 'pointer' })}>
                    {UNIT_LABELS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 6px', width: 60 }}>
                  <input type="number" min="1" value={row.qty}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onUpdateRow(section.id, row.id, 'qty', e.target.value.replace(/^0+(?=\d)/, ''))}
                    style={cellInp({ textAlign: 'right' })} />
                </td>
                <td style={{ padding: '6px 10px', width: 120, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: row.currency === 'USD' ? C.orange : C.ink }}>
                  {rp(row.total)}
                  {row.currency === 'USD' && (
                    <div style={{ fontSize: 10, color: C.inkFaint, fontWeight: 400 }}>
                      USD {(Number(row.unit_price) || 0).toLocaleString('id-ID')} × {row.qty}
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px 6px', width: 32 }}>
                  {section.rows.length > 1 && (
                    <button onClick={() => onRemoveRow(section.id, row.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 2, display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section subtotal */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', justifyContent: 'flex-end', background: C.surface2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft }}>
          Section total: {rp(section.rows.reduce((s, r) => s + (r.total || 0), 0))}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function QuotationFormPage({ onBack, showToast, quotation = null }) {
  const { profile, erpRole } = useAuth();
  const isEdit = !!quotation;

  const [header, setHeader] = useState({
    inquiry_id:       '',
    service_type:     'freight_forwarding',
    route:            '',
    valid_until:      '',
    pricing_done_at:  '',
    discount_pct:     0,
    payment_terms_id: '',
    notes:            '',
    terms:            '',
    usd_rate:         DEFAULT_USD,
    tanggal:          today(),
  });

  const [clientName,      setClientName]      = useState('');
  const [selectedInquiry, setSelectedInquiry] = useState(null);

  const [sections, setSections] = useState([freshSection('ORIGIN CHARGES')]);

  const [inquiries,    setInquiries]    = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [errors,       setErrors]       = useState({});

  // Load dropdowns
  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from('inquiries')
      .select('id, inquiry_no, service_type, route, prospect:accounts!inquiries_prospect_id_fkey(id, name), customer:accounts!inquiries_customer_id_fkey(id, name)')
      .eq('company_id', profile.company_id)
      .eq('status', 'OPEN')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setInquiries(data || []));

    supabase.from('payment_terms').select('id, name')
      .eq('company_id', profile.company_id).is('deleted_at', null)
      .then(({ data }) => setPaymentTerms(data || []));
  }, [profile?.company_id]);

  // ── Edit mode — populate header + sections from existing quotation ──────
  useEffect(() => {
    if (!isEdit || !quotation) return;
    // Populate header
    setHeader({
      inquiry_id:       quotation.inquiry_id       || '',
      service_type:     quotation.service_type     || 'freight_forwarding',
      route:            quotation.route             || '',
      valid_until:      quotation.valid_until       || '',
      pricing_done_at:  quotation.pricing_done_at?.slice(0, 16) || '',
      discount_pct:     quotation.discount_pct      ?? 0,
      payment_terms_id: quotation.payment_terms_id  || '',
      notes:            quotation.notes             || '',
      terms:            quotation.terms             || '',
      usd_rate:         quotation.usd_rate          || DEFAULT_USD,
      tanggal:          quotation.created_at?.slice(0, 10) || today(),
    });
    setClientName(quotation.prospect?.name || quotation.customer?.name || '');

    // Load existing items and reconstruct sections
    supabase
      .from('quotation_items')
      .select('id, sort_order, group_name, description, currency, cost_price, unit_price, unit_label, qty, exchange_rate, total, notes')
      .eq('quotation_id', quotation.id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const order = [];
        const map   = {};
        data.forEach(row => {
          const key = row.group_name || 'CHARGES';
          if (!map[key]) { map[key] = []; order.push(key); }
          map[key].push({
            id:          crypto.randomUUID(),
            description: row.description || '',
            cost_price:  row.cost_price  || 0,
            currency:    row.currency    || 'IDR',
            unit_price:  row.unit_price  || 0,
            unit_label:  row.unit_label  || 'Per 20Ft',
            qty:         row.qty         || 1,
            total:       row.total       || 0,
            notes:       row.notes       || '',
          });
        });
        setSections(order.map(name => ({
          id:   crypto.randomUUID(),
          name,
          rows: map[name],
        })));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, quotation?.id]);

  // Recalc all row totals when usd_rate changes
  useEffect(() => {
    const rate = Number(header.usd_rate) || DEFAULT_USD;
    setSections(prev => prev.map(sec => ({
      ...sec,
      rows: sec.rows.map(row => ({
        ...row,
        total: calcRowTotal(row, rate),
      })),
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header.usd_rate]);

  const setH = (k) => (e) => setHeader(h => ({ ...h, [k]: e.target.value }));

  const handleInquiryChange = (e) => {
    const id = e.target.value;
    setHeader(h => ({ ...h, inquiry_id: id }));
    if (!id) { setClientName(''); setSelectedInquiry(null); return; }
    const inq = inquiries.find(i => i.id === id);
    if (!inq) return;
    setSelectedInquiry(inq);
    setClientName(inq.prospect?.name || inq.customer?.name || '');
    setHeader(h => ({
      ...h,
      inquiry_id:   id,
      service_type: inq.service_type || h.service_type,
      route:        inq.route        || h.route,
    }));
  };

  // ── Section / row mutations ─────────────────────────────────────────────
  const addSection = () => setSections(s => [...s, freshSection('DESTINATION CHARGES')]);

  const removeSection = (secId) => {
    setSections(s => s.length > 1 ? s.filter(sec => sec.id !== secId) : s);
  };

  const updateSectionName = (secId, name) => {
    setSections(s => s.map(sec => sec.id === secId ? { ...sec, name } : sec));
  };

  const addRow = (secId) => {
    setSections(s => s.map(sec => sec.id === secId ? { ...sec, rows: [...sec.rows, freshRow()] } : sec));
  };

  const removeRow = (secId, rowId) => {
    setSections(s => s.map(sec => {
      if (sec.id !== secId) return sec;
      return sec.rows.length > 1 ? { ...sec, rows: sec.rows.filter(r => r.id !== rowId) } : sec;
    }));
  };

  const updateRow = (secId, rowId, key, value) => {
    const rate = Number(header.usd_rate) || DEFAULT_USD;
    setSections(s => s.map(sec => {
      if (sec.id !== secId) return sec;
      return {
        ...sec,
        rows: sec.rows.map(row => {
          if (row.id !== rowId) return row;
          const updated = { ...row, [key]: value };
          // Recalc sell total only — cost_price does not affect it
          if (['unit_price', 'qty', 'currency'].includes(key)) {
            updated.total = calcRowTotal(updated, rate);
          }
          return updated;
        }),
      };
    }));
  };

  // ── Derived totals ──────────────────────────────────────────────────────
  const sectionTotals = useMemo(() => sections.map(sec => ({
    id:    sec.id,
    name:  sec.name,
    total: sec.rows.reduce((s, r) => s + (Number(r.total) || 0), 0),
  })), [sections]);

  const subtotal       = useMemo(() => sectionTotals.reduce((s, sec) => s + sec.total, 0), [sectionTotals]);
  const discountPct    = Number(header.discount_pct) || 0;
  const discountAmount = useMemo(() => Math.round(subtotal * discountPct / 100), [subtotal, discountPct]);
  const tax            = useMemo(() => Math.round((subtotal - discountAmount) * VAT_RATE), [subtotal, discountAmount]);
  const grandTotal     = useMemo(() => (subtotal - discountAmount) + tax, [subtotal, discountAmount, tax]);

  // Cost totals — internal only, never printed
  const totalCost = useMemo(() => {
    const rate = Number(header.usd_rate) || DEFAULT_USD;
    return sections.reduce((acc, sec) =>
      acc + sec.rows.reduce((s, row) => {
        const cost  = Number(row.cost_price) || 0;
        const qty   = Number(row.qty) || 0;
        const kurs  = row.currency === 'USD' ? rate : 1;
        return s + Math.round(cost * qty * kurs);
      }, 0)
    , 0);
  }, [sections, header.usd_rate]);

  const grossProfit   = subtotal - totalCost;
  const marginPct     = subtotal > 0 ? (grossProfit / subtotal * 100).toFixed(1) : '0.0';

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!header.inquiry_id) e.inquiry_id = 'Pilih inquiry';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save (create or update) ───────────────────────────────────────────
  const handleSave = useCallback(async (submitNow) => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Shared item rows builder
      const buildItemRows = (quotId) => {
        let sortOrder = 0;
        return sections.flatMap(sec =>
          sec.rows.map(row => ({
            quotation_id:  quotId,
            sort_order:    ++sortOrder,
            group_name:    sec.name,
            description:   row.description,
            qty:           Number(row.qty)       || 1,
            unit:          row.unit_label,
            unit_price:    Number(row.unit_price) || 0,
            unit_label:    row.unit_label,
            currency:      row.currency,
            exchange_rate: row.currency === 'USD' ? (Number(header.usd_rate) || DEFAULT_USD) : 1,
            total:         Number(row.total)      || 0,
            cost_price:    Number(row.cost_price) || 0,
            notes:         row.notes              || null,
          }))
        );
      };

      if (isEdit) {
        // ── Guard: quotation.id must exist ────────────────────────────
        if (!quotation?.id) throw new Error('Quotation ID tidak ditemukan — tidak bisa update.');

        // ── Step 1: UPDATE quotation header ───────────────────────────
        const updatePayload = {
          service_type:     header.service_type,
          route:            header.route             || null,
          valid_until:      header.valid_until        || null,
          pricing_done_at:  header.pricing_done_at    || null,
          discount_pct:     Number(header.discount_pct) || 0,
          payment_terms_id: header.payment_terms_id   || null,
          notes:            header.notes              || null,
          terms:            header.terms              || null,
          usd_rate:         Number(header.usd_rate)   || DEFAULT_USD,
          subtotal,
          tax_amount:       tax,
          total_amount:     grandTotal,
          status:           submitNow ? 'SUBMITTED' : (quotation.status || 'DRAFT'),
          updated_by:       profile.id,
        };

        const { error: updateError } = await supabase
          .from('quotations')
          .update(updatePayload)
          .eq('id', quotation.id);
        if (updateError) throw updateError;

        // ── Step 2: DELETE semua items lama ───────────────────────────
        const { error: deleteError } = await supabase
          .from('quotation_items')
          .delete()
          .eq('quotation_id', quotation.id);
        if (deleteError) throw deleteError;

        // ── Step 3: INSERT items baru (hanya setelah DELETE sukses) ───
        const { error: insertError } = await supabase
          .from('quotation_items')
          .insert(buildItemRows(quotation.id));
        if (insertError) throw insertError;

        showToast?.(submitNow ? 'Quotation di-submit ✨' : 'Quotation berhasil diupdate ✨');
      } else {
        // ── INSERT new quotation ───────────────────────────────────────
        const { data: companyRow } = await supabase
          .from('companies').select('code').eq('id', profile.company_id).single();
        const companyCode  = companyRow?.code || 'MSI';
        const quotation_no = await generateQuotationNo(profile.company_id, companyCode);

        const insertPayload = {
          quotation_no,
          company_id:       profile.company_id,
          inquiry_id:       header.inquiry_id            || null,
          prospect_id:      selectedInquiry?.prospect?.id || null,
          customer_id:      selectedInquiry?.customer?.id || null,
          service_type:     header.service_type,
          route:            header.route                 || null,
          valid_until:      header.valid_until            || null,
          pricing_done_at:  header.pricing_done_at        || null,
          discount_pct:     Number(header.discount_pct)   || 0,
          payment_terms_id: header.payment_terms_id       || null,
          notes:            header.notes                  || null,
          terms:            header.terms                  || null,
          usd_rate:         Number(header.usd_rate)        || DEFAULT_USD,
          subtotal,
          tax_amount:       tax,
          total_amount:     grandTotal,
          status:           submitNow ? 'SUBMITTED' : 'DRAFT',
          created_by:       profile.id,
        };

        const { data: quot, error: qErr } = await supabase
          .from('quotations').insert(insertPayload).select('id').single();
        if (qErr) throw qErr;

        const { error: iErr } = await supabase
          .from('quotation_items').insert(buildItemRows(quot.id));
        if (iErr) throw iErr;

        showToast?.(submitNow ? 'Quotation berhasil di-submit ✨' : 'Draft quotation tersimpan ✨');
      }

      onBack();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, quotation, header, sections, selectedInquiry, subtotal, tax, grandTotal, profile, onBack, showToast]);

  const selStyle = inpStyle({ padding: '0 10px', cursor: 'pointer' });

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}>
          <ChevronLeft size={15} /> Kembali
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={17} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {isEdit ? 'Edit Quotation' : 'Buat Quotation'}
            </h1>
            <p style={{ margin: 0, fontSize: 12.5, color: C.inkSoft }}>
              {isEdit ? quotation.quotation_no : `QUO/${profile?.company_id ? 'MSI' : '…'}/${new Date().getFullYear()}/… • auto-generate`}
            </p>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="nx-stack" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* ── LEFT — form (60%) ──────────────────────────────────────────── */}
        <div style={{ flex: '0 0 60%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header card */}
          <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: 24, boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
            <p style={{ margin: '0 0 18px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft }}>Header Quotation</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>

              <Field label="Inquiry" req full>
                <select value={header.inquiry_id} onChange={handleInquiryChange} style={selStyle}>
                  <option value="">— Pilih inquiry open —</option>
                  {inquiries.map(inq => (
                    <option key={inq.id} value={inq.id}>
                      {inq.inquiry_no} — {inq.prospect?.name || inq.customer?.name || '?'}
                    </option>
                  ))}
                </select>
                {errors.inquiry_id && <span style={{ fontSize: 11.5, color: C.danger }}>{errors.inquiry_id}</span>}
              </Field>

              <Field label="Prospect / Customer" full>
                <input value={clientName} readOnly
                  style={inpStyle({ background: C.surface2, color: C.inkSoft, cursor: 'default' })}
                  placeholder="Auto-fill dari inquiry" />
              </Field>

              <Field label="Service Type">
                <select value={header.service_type} onChange={setH('service_type')} style={selStyle}>
                  {SERVICE_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>

              <Field label="Routing">
                <input value={header.route} onChange={setH('route')} style={inpStyle()}
                  placeholder="cth: Jakarta – Singapore" />
              </Field>

              <Field label="Tanggal">
                <input type="date" value={header.tanggal} onChange={setH('tanggal')} style={inpStyle()} />
              </Field>

              <Field label="Valid Until">
                <input type="date" value={header.valid_until} onChange={setH('valid_until')} style={inpStyle()} min={today()} />
              </Field>

              <Field label="Pricing Selesai">
                <input
                  type="datetime-local"
                  value={header.pricing_done_at}
                  onChange={setH('pricing_done_at')}
                  style={inpStyle()}
                  title="Kapan tim pricing selesai input harga?"
                />
              </Field>

              <Field label="Diskon (%)" full>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={header.discount_pct}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setHeader(h => ({ ...h, discount_pct: e.target.value }))}
                  style={inpStyle({ textAlign: 'right' })}
                  placeholder="0"
                />
                {(() => {
                  const a = pricingAuthority(header.discount_pct, erpRole);
                  const t = AUTHORITY_TONE[a.tone];
                  return (
                    <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: t.bg, border: `1px solid ${t.bd}`, color: t.color, fontSize: 12.5, fontWeight: 700 }}>
                      {a.text}
                    </div>
                  );
                })()}
              </Field>

              <Field label="Payment Terms">
                <select value={header.payment_terms_id} onChange={setH('payment_terms_id')} style={selStyle}>
                  <option value="">— Pilih payment terms —</option>
                  {paymentTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>

              <Field label="Kurs USD (IDR)">
                <input
                  type="number" min="1" value={header.usd_rate}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setHeader(h => ({ ...h, usd_rate: e.target.value.replace(/^0+(?=\d)/, '') }))}
                  style={inpStyle({ textAlign: 'right' })}
                />
              </Field>

              <Field label="Notes" full>
                <textarea value={header.notes} onChange={setH('notes')} rows={2}
                  style={{ ...inpStyle({ height: 'auto', padding: '8px 12px', resize: 'vertical' }) }}
                  placeholder="Catatan untuk customer…" />
              </Field>

              <Field label="Terms & Conditions / Above Rates" full>
                <textarea
                  value={header.terms || ''}
                  onChange={setH('terms')}
                  rows={6}
                  style={{ ...inpStyle({ height: 'auto', padding: '8px 12px', resize: 'vertical', fontSize: 12.5 }) }}
                  placeholder={`Contoh:\n• Carrier's local charges as per invoice\n• Warehouse storage charges as per invoice\n• Import Duty and Tax under Customer account`}
                />
              </Field>
            </div>
          </div>

          {/* Sections */}
          {sections.map(sec => (
            <SectionCard
              key={sec.id}
              section={sec}
              onUpdateName={updateSectionName}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onUpdateRow={updateRow}
              onRemoveSection={removeSection}
              canRemove={sections.length > 1}
              usdRate={header.usd_rate}
            />
          ))}

          {/* Add section button */}
          <button
            onClick={addSection}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px', borderRadius: 10, border: `2px dashed ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'border-color .14s, color .14s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.inkSoft; }}
          >
            <Plus size={15} /> Tambah Section
          </button>
        </div>

        {/* ── RIGHT — sticky summary (40%) ───────────────────────────────── */}
        <div style={{ flex: '0 0 40%', minWidth: 0, position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: 24, boxShadow: '0 2px 12px rgba(35,41,30,.08)' }}>
            <p style={{ margin: '0 0 16px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft }}>Ringkasan</p>

            {/* Per-section subtotals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {sectionTotals.map(sec => (
                <div key={sec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: C.inkSoft, fontWeight: 600 }}>{sec.name || 'Section'}</span>
                  <span style={{ fontWeight: 700 }}>{rp(sec.total)}</span>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: C.line, marginBottom: 14 }} />

            {/* Cost / profit section — no-print */}
            <div className="no-print" style={{ marginBottom: 14, padding: '12px', borderRadius: 8, background: C.dangerBg, border: `1px solid ${C.dangerBd}` }}>
              <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.danger }}>Internal — tidak dicetak</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: C.inkSoft }}>Total Cost</span>
                  <span style={{ fontWeight: 700, color: C.inkSoft }}>{rp(totalCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: C.inkSoft }}>Total Revenue</span>
                  <span style={{ fontWeight: 700 }}>{rp(subtotal)}</span>
                </div>
                <div style={{ height: 1, background: C.dangerBd }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: grossProfit >= 0 ? C.ok : C.danger }}>Gross Profit</span>
                  <span style={{ fontWeight: 800, color: grossProfit >= 0 ? C.ok : C.danger }}>
                    {rp(grossProfit)} ({marginPct}%)
                  </span>
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: C.line, marginBottom: 14 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: C.inkSoft }}>Subtotal</span>
                <span style={{ fontWeight: 700 }}>{rp(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                  <span style={{ color: C.orange }}>Diskon ({discountPct}%)</span>
                  <span style={{ fontWeight: 700, color: C.orange }}>−{rp(discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: C.inkSoft }}>VAT 1.1%</span>
                <span style={{ fontWeight: 700 }}>{rp(tax)}</span>
              </div>
              <div style={{ height: 1, background: C.line }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                <span style={{ fontWeight: 800 }}>GRAND TOTAL</span>
                <span style={{ fontWeight: 800, color: C.accent }}>{rp(grandTotal)}</span>
              </div>
            </div>

            {header.usd_rate && Number(header.usd_rate) !== DEFAULT_USD && (
              <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 14, padding: '8px 10px', background: C.orangeBg, borderRadius: 7, border: `1px solid ${C.orangeBd}` }}>
                Kurs USD: Rp {Number(header.usd_rate).toLocaleString('id-ID')} / USD
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => handleSave(false)} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                <Save size={15} /> Simpan Draft
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || !header.inquiry_id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px', borderRadius: 9, border: 'none', background: !header.inquiry_id ? C.line : C.accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: (saving || !header.inquiry_id) ? 'not-allowed' : 'pointer', boxShadow: header.inquiry_id ? '0 2px 8px rgba(47,107,63,.25)' : 'none', opacity: saving ? .7 : 1, transition: 'background .14s' }}>
                <Check size={15} /> Submit Quotation
              </button>
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 11, color: C.inkFaint, textAlign: 'center', lineHeight: 1.5 }}>
              Submit disabled sampai inquiry dipilih.<br />Submit akan mengubah status inquiry ke QUOTED.
            </p>
          </div>

          {/* Quick stats */}
          <div style={{ background: C.surface2, borderRadius: 10, border: `1px solid ${C.lineSoft}`, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.inkSoft, marginBottom: 6 }}>
              <span>{sections.length} section</span>
              <span>{sections.reduce((s, sec) => s + sec.rows.length, 0)} baris</span>
            </div>
            <div style={{ fontSize: 12, color: C.inkFaint }}>
              USD rows pakai kurs Rp {Number(header.usd_rate || DEFAULT_USD).toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
