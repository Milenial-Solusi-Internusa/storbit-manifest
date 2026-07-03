// src/modules/crm/QuotationDetailPage.jsx
// Read-only detail view — sectioned table, internal cost/profit (no-print), PDF via @react-pdf/renderer (QuotationPDF)
import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Edit2, Download, Receipt, Send, Copy } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ConfirmModal from '../../components/ConfirmModal';
import QuotationPDF from './QuotationPDF';

// ─── Design tokens ────────────────────────────────────────────────────────
const C = {
  bg:        '#F6EFE3',
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
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
  orange:    '#A45A22', orangeBg: '#F6E8D6', orangeBd: '#E7CDA9',
};

const VAT_RATE = 0.011;
const rp  = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const rpN = (n) => (Number(n) || 0).toLocaleString('id-ID'); // no "Rp" prefix — used inside PDF table

// ─── Quote SLA (BD-05) ──────────────────────────────────────────────────────
const SLA_HOURS = { freight_forwarding: 6, customs: 8, trading: 8 };

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDur(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} jam ${m} menit`;
}

// SLA indicator card shown below the quotation header.
function SlaCard({ quot }) {
  const targetH  = SLA_HOURS[quot.service_type] || 6;
  const targetMs = targetH * 3600000;
  const pricing  = quot.pricing_done_at;
  const sent     = quot.quote_sent_at;

  const card = (bg, bd, color, text, sub) => (
    <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 12, background: bg, border: `1px solid ${bd}` }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color }}>{text}</div>
      {sub && <div style={{ fontSize: 12.5, color, opacity: 0.85, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  if (!pricing) {
    return card('#EEE9DC', '#DDD3BE', '#6B6F5E', 'Belum ada timestamp pricing selesai');
  }
  const pricingMs = new Date(pricing).getTime();

  if (!sent) {
    const elapsed = Date.now() - pricingMs;
    if (elapsed > targetMs) {
      return card('#F6E0DB', '#E6BBB2', '#B23227',
        `⚠️ SLA Terlewat! Target ${targetH} jam, sudah ${fmtDur(elapsed)} sejak pricing selesai`);
    }
    return card('#F8ECCF', '#E6CE94', '#9A6B0E',
      `⏱ Pricing selesai ${fmtDateTime(pricing)}. Belum dikirim ke customer.`,
      `Sudah ${fmtDur(elapsed)} sejak pricing selesai (target ${targetH} jam)`);
  }

  const dur = new Date(sent).getTime() - pricingMs;
  if (dur <= targetMs) {
    return card('#E4F0E5', '#BFDDC4', '#2E7D4F',
      `✓ Quote dikirim dalam ${fmtDur(dur)} (target ${targetH} jam)`);
  }
  return card('#F6E0DB', '#E6BBB2', '#B23227',
    `Quote dikirim dalam ${fmtDur(dur)} — melebihi target ${targetH} jam (SLA terlewat)`);
}

const STATUS_META = {
  DRAFT:     { label: 'Draft',     bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  SENT:      { label: 'Sent',      bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  ACCEPTED:  { label: 'Accepted',  bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  REJECTED:  { label: 'Rejected',  bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
  SUBMITTED: { label: 'Submitted', bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
};

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight Forwarding',
  customs:            'Customs Clearance',
  trading:            'General Trading',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
      letterSpacing: '.3px', border: `1px solid ${m.bd}`,
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint }}>{label}</span>
      <span style={{ fontSize: 13.5, color: C.ink }}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function QuotationDetailPage({ quotationId, onBack, onEdit, onDuplicate, showToast }) {
  const { profile, user } = useAuth();
  const [quot,           setQuot]           = useState(null);
  const [items,          setItems]          = useState([]);
  const [paymentTermName,setPaymentTermName]= useState('');
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [generatingPDF,  setGeneratingPDF]  = useState(false);
  const [confirmSend,    setConfirmSend]    = useState(false);
  const [sending,        setSending]        = useState(false);

  // ── Effect 1: fetch quotation + items (only re-runs when quotationId changes) ──
  useEffect(() => {
    if (!quotationId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase
        .from('quotations')
        .select(`
          id, quotation_no, revision, status, service_type, route,
          valid_until, created_at, notes, terms, usd_rate,
          subtotal, tax_amount, total_amount, payment_terms_id,
          pricing_done_at, quote_sent_at, discount_pct,
          inquiry_id, prospect_id, customer_id, internal_notes, quote_date,
          currency_code, margin_floor, vat_rate,
          attention_to, pickup_address, delivery_address, cargo_mode,
          gw, dimension, cw, cbm, container_type, container_qty,
          prospect:accounts!quotations_prospect_id_fkey(name, address, city, pic_name, pic_email, pic_phone),
          customer:accounts!quotations_customer_id_fkey(name, address, city, email, phone),
          inquiry:inquiries!quotations_inquiry_id_fkey(inquiry_no)
        `)
        .eq('id', quotationId)
        .maybeSingle(),

      supabase
        .from('quotation_items')
        .select('id, sort_order, group_name, description, currency, cost_price, unit_price, unit_label, qty, exchange_rate, total, notes, if_any')
        .eq('quotation_id', quotationId)
        .order('sort_order', { ascending: true }),
    ]).then(([{ data: qData, error: qErr }, { data: iData, error: iErr }]) => {
      if (cancelled) return;
      if (qErr) { showToast?.('Gagal memuat quotation: ' + qErr.message, 'error'); setLoading(false); return; }
      if (iErr) { showToast?.('Gagal memuat items: ' + iErr.message, 'error'); }
      setQuot(qData);
      setItems(iData || []);
      if (qData?.payment_terms_id) {
        supabase.from('payment_terms').select('name').eq('id', qData.payment_terms_id).maybeSingle()
          .then(({ data }) => { if (!cancelled) setPaymentTermName(data?.name || ''); });
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [quotationId, showToast]);

  // ── Effect 2: fetch creator profile (only re-runs when user identity changes) ──
  useEffect(() => {
    const userId = user?.id || profile?.id;
    if (!userId) return;
    supabase
      .from('profiles')
      .select('full_name, phone, position_id, positions(name)')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setCreatorProfile(data));
  }, [user?.id, profile?.id]);

  // ── Derived data ──────────────────────────────────────────────────────
  const sections = useMemo(() => {
    if (!items.length) return [];
    const order = [];
    const map   = {};
    items.forEach(row => {
      const key = row.group_name || 'CHARGES';
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(row);
    });
    return order.map(name => ({
      name,
      rows:  map[name],
      // Baris "If Any" di-exclude dari section total.
      total: map[name].reduce((s, r) => s + (r.if_any ? 0 : (Number(r.total) || 0)), 0),
    }));
  }, [items]);

  // Baris "If Any" di-exclude dari subtotal → tax → grand total.
  const subtotal       = useMemo(() => items.reduce((s, r) => s + (r.if_any ? 0 : (Number(r.total) || 0)), 0), [items]);
  const discountPct    = Number(quot?.discount_pct) || 0;
  const discountAmount = useMemo(() => Math.round(subtotal * discountPct / 100), [subtotal, discountPct]);
  const effVat         = Number(quot?.vat_rate ?? VAT_RATE); // null (old quotes) → 1.1%
  const tax            = useMemo(() => Math.round((subtotal - discountAmount) * effVat), [subtotal, discountAmount, effVat]);
  const grandTotal     = useMemo(() => (subtotal - discountAmount) + tax, [subtotal, discountAmount, tax]);

  const totalCost = useMemo(() => items.reduce((s, r) => {
    if (r.if_any) return s;   // If Any di-exclude dari cost/margin juga
    const cost = Number(r.cost_price) || 0;
    const qty  = Number(r.qty) || 0;
    const rate = Number(r.exchange_rate) || 1;
    return s + Math.round(cost * qty * rate);
  }, 0), [items]);

  const grossProfit = subtotal - totalCost;
  const marginPct   = subtotal > 0 ? (grossProfit / subtotal * 100).toFixed(1) : '0.0';

  const clientName = quot?.prospect?.name || quot?.customer?.name || '—';

  // ── Kirim ke Customer (BD-05) — set status SENT + quote_sent_at ──────────
  const handleSendToCustomer = async () => {
    setSending(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('quotations')
        .update({ status: 'SENT', quote_sent_at: nowIso, updated_by: profile.id })
        .eq('id', quotationId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Gagal mengirim: tidak ada baris ter-update (cek izin akses).');
      setQuot(q => q ? { ...q, status: 'SENT', quote_sent_at: nowIso } : q);
      setConfirmSend(false);
      showToast?.('Quotation dikirim ke customer ✨');
    } catch (err) {
      showToast?.('Gagal mengirim: ' + err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  // ── PDF generator — @react-pdf/renderer (vector/text, auto pagination) ──────
  const handleDownloadPDF = async () => {
    setGeneratingPDF(true);
    try {
      const blob = await pdf(
        <QuotationPDF quot={quot} items={items} sections={sections} creatorProfile={creatorProfile} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quot?.quotation_no || 'quotation'}_rev${quot?.revision ?? 1}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast?.('PDF berhasil diunduh ⬇');
    } catch (err) {
      showToast?.('Gagal generate PDF: ' + err.message, 'error');
    } finally {
      setGeneratingPDF(false);
    }
  };

  // ── Loading / not found ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif', padding: '3rem', textAlign: 'center', color: C.inkFaint }}>
        Memuat detail quotation…
      </div>
    );
  }
  if (!quot) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif', padding: '3rem', textAlign: 'center', color: C.danger }}>
        Quotation tidak ditemukan.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>

      {/* ── Action bar (screen only) ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: C.inkSoft, cursor: 'pointer' }}
          >
            <ChevronLeft size={15} /> Kembali
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={17} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: C.accent }}>{quot.quotation_no}</div>
              <div style={{ fontSize: 12, color: C.inkSoft }}>{clientName}</div>
            </div>
          </div>
          <StatusBadge status={quot.status} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {quot.status === 'SUBMITTED' && (
            <button
              onClick={() => setConfirmSend(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#1B4D8A', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(20,70,130,.22)' }}
            >
              <Send size={14} /> Kirim ke Customer
            </button>
          )}
          <button
            onClick={() => onEdit(quot)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Edit2 size={14} /> Edit
          </button>
          {onDuplicate && (
            <button
              onClick={() => onDuplicate(quot)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Copy size={14} /> Duplicate
            </button>
          )}
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 8, border: 'none', background: generatingPDF ? C.line : C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: generatingPDF ? 'not-allowed' : 'pointer', boxShadow: generatingPDF ? 'none' : '0 2px 8px rgba(47,107,63,.2)', transition: 'background .14s' }}
          >
            <Download size={14} /> {generatingPDF ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* ── SLA indicator (BD-05) ────────────────────────────────────────── */}
      <SlaCard quot={quot} />

      {/* ── Two-column screen layout ─────────────────────────────────────── */}
      <div className="nx-stack" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* LEFT — header info + sectioned items */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header info card */}
          <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: 24, boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
            <div className="nx-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 24px' }}>
              <InfoRow label="Prospect / Customer" value={clientName} />
              <InfoRow label="Service Type" value={SERVICE_TYPE_LABELS[quot.service_type] || quot.service_type} />
              <InfoRow label="Routing" value={quot.route} />
              <InfoRow label="Quotation No" value={<span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.accent }}>{quot.quotation_no}</span>} />
              <InfoRow label="Inquiry No" value={quot.inquiry?.inquiry_no ? <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1B4D8A' }}>{quot.inquiry.inquiry_no}</span> : '—'} />
              <InfoRow label="Tanggal" value={fmtDate(quot.created_at)} />
              <InfoRow label="Valid Until" value={fmtDate(quot.valid_until)} />
              <InfoRow label="Payment Terms" value={paymentTermName} />
              <InfoRow label="Diskon" value={`${discountPct}%`} />
              <InfoRow label="Status" value={<StatusBadge status={quot.status} />} />
              {quot.notes && <div style={{ gridColumn: '1 / -1' }}><InfoRow label="Notes" value={quot.notes} /></div>}
            </div>
            {/* Sales-only internal notes — never in the customer PDF (no-print + excluded from #quotation-print-area) */}
            {quot.internal_notes && (
              <div className="no-print" style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: C.dangerBg, border: `1px dashed ${C.dangerBd}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.danger, marginBottom: 4 }}>Catatan Internal (Sales)</div>
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{quot.internal_notes}</div>
              </div>
            )}
          </div>

          {/* Sectioned items */}
          {sections.length === 0 ? (
            <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: '2rem', textAlign: 'center', color: C.inkFaint }}>Tidak ada item</div>
          ) : sections.map((sec, si) => {
            const secCost = sec.rows.reduce((s, r) =>
              r.if_any ? s : s + Math.round((Number(r.cost_price) || 0) * (Number(r.qty) || 0) * (Number(r.exchange_rate) || 1)), 0);
            return (
              <div key={si} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(35,41,30,.05)' }}>
                <div style={{ background: C.surface2, padding: '10px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft }}>{sec.name}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{rp(sec.total)}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Description</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }} className="no-print">Cost Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Currency</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Sell Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Unit Label</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>QTY</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#1B4D8A', background: '#F08C7D' }}>Total IDR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row, ri) => (
                        <tr key={row.id || ri} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                          <td style={{ padding: '9px 12px', color: C.ink }}>
                            {row.description || '—'}
                          </td>
                          <td className="no-print" style={{ padding: '9px 8px', textAlign: 'right', color: C.inkSoft, fontSize: 12 }}>
                            {(Number(row.cost_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: row.currency === 'USD' ? C.orange : C.inkSoft, fontWeight: 600, fontSize: 12 }}>
                            {row.currency || 'IDR'}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.ink, fontSize: 12 }}>
                            {(Number(row.unit_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontSize: 12 }}>{row.unit_label || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.ink, fontWeight: 600 }}>{row.qty || 1}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: row.currency !== 'IDR' ? C.orange : C.ink, whiteSpace: 'nowrap' }}>
                            {rp(row.total)}
                            {row.currency !== 'IDR' && (
                              <div style={{ fontSize: 10, color: C.inkFaint, fontWeight: 400 }}>
                                × kurs {(Number(row.exchange_rate) || 1).toLocaleString('id-ID')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.lineSoft}`, background: C.surface2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="no-print" style={{ fontSize: 11.5, color: C.inkFaint }}>
                    Cost: {rp(secCost)} • Margin: {sec.total > 0 ? ((sec.total - secCost) / sec.total * 100).toFixed(1) : '0'}%
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Section total: {rp(sec.total)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT — sticky summary */}
        <div style={{ flex: '0 0 280px', position: 'sticky', top: 24 }}>
          <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: 22, boxShadow: '0 2px 12px rgba(35,41,30,.08)' }}>
            <p style={{ margin: '0 0 14px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft }}>Ringkasan</p>

            {/* Per-section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
              {sections.map((sec, si) => (
                <div key={si} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: C.inkSoft, fontWeight: 600 }}>{sec.name || 'Section'}</span>
                  <span style={{ fontWeight: 700 }}>{rp(sec.total)}</span>
                </div>
              ))}
            </div>

            {/* Internal cost/profit — no-print */}
            <div className="no-print" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: C.dangerBg, border: `1px solid ${C.dangerBd}` }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: C.danger }}>Internal</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: C.inkSoft }}>Total Cost</span>
                  <span style={{ fontWeight: 700, color: C.inkSoft }}>{rp(totalCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: C.inkSoft }}>Total Revenue</span>
                  <span style={{ fontWeight: 700 }}>{rp(subtotal)}</span>
                </div>
                <div style={{ height: 1, background: C.dangerBd }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: grossProfit >= 0 ? C.ok : C.danger }}>Gross Profit</span>
                  <span style={{ fontWeight: 800, color: grossProfit >= 0 ? C.ok : C.danger }}>
                    {rp(grossProfit)} ({marginPct}%)
                  </span>
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: C.line, marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.inkSoft }}>Subtotal</span>
                <span style={{ fontWeight: 700 }}>{rp(subtotal)}</span>
              </div>
              {discountPct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: C.orange }}>Diskon ({discountPct}%)</span>
                  <span style={{ fontWeight: 700, color: C.orange }}>−{rp(discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.inkSoft }}>{'PPN ' + (effVat * 100).toFixed(effVat === 0.011 ? 1 : 0).replace('.', ',') + '%'}</span>
                <span style={{ fontWeight: 700 }}>{rp(tax)}</span>
              </div>
              <div style={{ height: 1, background: C.line }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                <span style={{ fontWeight: 800 }}>GRAND TOTAL</span>
                <span style={{ fontWeight: 800, color: C.accent }}>{rp(grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={handleDownloadPDF}
              disabled={generatingPDF}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 18, padding: '10px', borderRadius: 9, border: 'none', background: generatingPDF ? C.line : C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: generatingPDF ? 'not-allowed' : 'pointer', transition: 'background .14s' }}
            >
              <Download size={14} /> {generatingPDF ? 'Generating PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Off-screen print area (captured by html2canvas) ──────────────── */}
      {/* Position: absolute off-screen so it's in DOM but not visible.       */}
      {/* IMPORTANT: no cost_price, no margin, no internal data in this area. */}
      {quot && (
        <div
          id="quotation-print-area"
          style={{
            position: 'absolute', left: '-9999px', top: 0,
            background: '#ffffff', padding: '32px', paddingBottom: '64px',
            width: '794px', fontFamily: 'Arial, sans-serif', color: '#1a1a1a',
          }}
        >
          {/* Header — logo + quotation title */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #1B4D8A' }}>
            <div>
              <img
                src="https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png"
                alt="MSI Logo"
                style={{ height: '48px', marginBottom: '8px', display: 'block' }}
                crossOrigin="anonymous"
              />
              <div style={{ fontSize: '11px', color: '#555', marginTop: 4 }}>PT. Milenial Solusi Internusa</div>
              <div style={{ fontSize: '10px', color: '#777', marginTop: 2 }}>SEA FREIGHT · NVOCC · DOMESTIC · LEGALITY · AIRFREIGHT · CUSTOM</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '3px', color: '#1B4D8A' }}>QUOTATION</div>
              <div style={{ fontSize: '12px', marginTop: '6px', color: '#333' }}>{quot.quotation_no}{quot.revision ? ` rev.${quot.revision}` : ''}</div>
              <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>Tanggal: {fmtDateShort(quot.created_at)}</div>
              <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Valid Until: {fmtDateShort(quot.valid_until)}</div>
            </div>
          </div>

          {/* Customer details — dark-green label cell table */}
          {(() => {
            const picEmail   = quot.prospect?.pic_email   || quot.customer?.email   || '-';
            const picPhone   = quot.prospect?.pic_phone   || quot.customer?.phone   || '-';
            const custAddr   = [quot.prospect?.address || quot.customer?.address, quot.prospect?.city || quot.customer?.city].filter(Boolean).join(', ') || '-';
            const marketingName = creatorProfile?.full_name || profile?.full_name || user?.email || '-';
            const inquiryNo = quot.inquiry?.inquiry_no || '-';
            const rows = [
              ['TO',         clientName,         'SALES REP', marketingName           ],
              ['ADDRESS',    custAddr,           'EMAIL',     picEmail                ],
              ['QUO. NO.',   quot.quotation_no,  'MOBILE',    picPhone                ],
              ['INQUIRY NO.', inquiryNo,         'OFFICE',    '+62 21-3970-7558/9'    ],
              ['DATE',     fmtDateShort(quot.created_at), 'VALIDITY', fmtDateShort(quot.valid_until)],
            ];
            const labelCell = { background: '#1B4D8A', color: 'white', padding: '5px 10px', fontWeight: 'bold', width: '80px', border: '1px solid #1a5299', fontSize: '11px', verticalAlign: 'middle' };
            const valueCell = { background: '#f9f9f7', padding: '5px 10px', border: '1px solid #ddd', fontSize: '11px', verticalAlign: 'middle' };
            return (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr>
                    <td colSpan={4} style={{ background: '#1B4D8A', color: 'white', padding: '7px 12px', fontWeight: 'bold', letterSpacing: '1px', fontSize: '11px' }}>
                      CUSTOMER DETAILS :
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([l1, v1, l2, v2]) => (
                    <tr key={l1}>
                      <td style={labelCell}>{l1}</td>
                      <td style={valueCell}>{v1}</td>
                      <td style={labelCell}>{l2}</td>
                      <td style={valueCell}>{v2}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ background: '#1B4D8A', color: 'white', padding: '5px 10px', fontWeight: 'bold', verticalAlign: 'middle', border: '1px solid #1a5299', fontSize: '11px' }}>APPROVED BY</td>
                    <td style={{ background: '#f9f9f7', padding: '5px 10px', border: '1px solid #ddd', verticalAlign: 'middle', fontSize: '11px' }}></td>
                    <td style={{ background: '#1B4D8A', color: 'white', padding: '5px 10px', fontWeight: 'bold', verticalAlign: 'middle', border: '1px solid #1a5299', fontSize: '11px' }}>APPROVAL DATE</td>
                    <td style={{ background: '#f9f9f7', padding: '5px 10px', border: '1px solid #ddd', verticalAlign: 'middle', fontSize: '11px' }}></td>
                  </tr>
                </tbody>
              </table>
            );
          })()}

          {/* Sections — NO cost_price column */}
          {sections.map((sec, si) => (
            <table key={si} style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '16px' }}>
                <thead>
                  {/* Section header — now a protected row INSIDE the table thead so it
                      can never be sliced in half, and the tr-cascade in the page-break
                      engine keeps it attached to the column header + first data row. */}
                  <tr className="pdf-no-break">
                    <th colSpan={6} style={{ background: '#1B4D8A', color: 'white', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '.5px', textAlign: 'left', border: '1px solid #1B4D8A' }}>
                      {sec.name}
                    </th>
                  </tr>
                  <tr style={{ background: '#f0f0eb' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left',   border: '1px solid #ddd', fontWeight: 700 }}>DESCRIPTION</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd', fontWeight: 700, width: 50 }}>CUR</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right',  border: '1px solid #ddd', fontWeight: 700, width: 90 }}>PRICE</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd', fontWeight: 700, width: 100 }}>UNIT</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd', fontWeight: 700, width: 40 }}>QTY</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right',  border: '1px solid #ddd', fontWeight: 700, width: 110 }}>TOTAL (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((row, ri) => (
                    <tr key={row.id || ri} style={{ background: ri % 2 === 0 ? '#fff' : '#fafaf8' }}>
                      <td style={{ padding: '6px 8px', border: '1px solid #ddd' }}>
                        {row.description || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd', color: row.currency === 'USD' ? '#a45a22' : '#333' }}>{row.currency || 'IDR'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right',  border: '1px solid #ddd' }}>
                        {rpN(row.unit_price)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd' }}>{row.unit_label || '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #ddd' }}>{row.qty || 1}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right',  border: '1px solid #ddd', fontWeight: 700 }}>
                        Rp {rpN(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '11px', border: '1px solid #ddd', background: '#f5f5f0' }}>
                      Section Total:
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd', background: '#f5f5f0' }}>
                      Rp {rpN(sec.total)}
                    </td>
                  </tr>
                </tfoot>
            </table>
          ))}

          {/* Grand summary */}
          <div className="pdf-no-break" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <table style={{ fontSize: '12px', minWidth: '280px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '5px 10px', color: '#555' }}>Subtotal</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right' }}>Rp {rpN(quot.subtotal ?? subtotal)}</td>
                </tr>
                {discountPct > 0 && (
                  <tr>
                    <td style={{ padding: '5px 10px', color: '#555' }}>Diskon ({discountPct}%)</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>−Rp {rpN(discountAmount)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '5px 10px', color: '#555' }}>VAT 1.1%</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right' }}>Rp {rpN(quot.tax_amount ?? tax)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #1B4D8A' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '14px' }}>GRAND TOTAL</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#1B4D8A' }}>
                    Rp {rpN(quot.total_amount ?? grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes (if any) — boxed, navy left accent */}
          {quot.notes && (
            <div className="pdf-no-break" style={{
              marginTop: '20px', fontSize: '11px',
              border: '1px solid #E5E7EB', borderLeft: '4px solid #1B4D8A',
              background: '#F8FAFC', borderRadius: '4px', padding: '10px 12px',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#1B4D8A' }}>Notes</div>
              <div style={{ color: '#555', lineHeight: '1.6', whiteSpace: 'pre-line' }}>{quot.notes}</div>
            </div>
          )}

          {/* Above rates / Terms (field terms dari quotations) — boxed, orange left accent */}
          {quot.terms && (
            <div className="pdf-no-break" style={{
              marginTop: '20px', fontSize: '10.5px', color: '#333',
              border: '1px solid #E5E7EB', borderLeft: '4px solid #E85A1E',
              background: '#FBF8F2', borderRadius: '4px', padding: '10px 12px',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#E85A1E' }}>Above rates :</div>
              <div style={{ whiteSpace: 'pre-line', paddingLeft: '12px', lineHeight: '1.6' }}>{quot.terms}</div>
            </div>
          )}

          {/* Best Regards + Approval Customer — side by side */}
          <div className="pdf-no-break" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', fontSize: '11px' }}>
            {/* Kiri — Best Regards */}
            <div>
              <div style={{ fontWeight: 'bold' }}>Best Regards,</div>
              <div style={{ marginTop: '48px', borderTop: '1px solid #333', width: '200px', paddingTop: '4px' }}>
                {creatorProfile?.full_name || profile?.full_name || user?.email || '—'}{' - '}{creatorProfile?.positions?.name || 'Sales Executive'}
              </div>
              <div>PT. Milenial Solusi Internusa</div>
            </div>
            {/* Kanan — Approval Customer */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold' }}>Approved by,</div>
              <div style={{ marginTop: '48px', borderTop: '1px solid #333', width: '200px', paddingTop: '4px' }}>
                Customer Representative
              </div>
              <div style={{ color: '#666' }}>{quot?.prospect?.name || quot?.customer?.name || '-'}</div>
            </div>
          </div>

          {/* Divider orange-navy */}
          <div className="pdf-no-break" style={{ marginTop: '32px', height: '3px', background: 'linear-gradient(to right, #E85A1E 8%, #1B4D8A 8%)' }} />

          {/* Footer navy */}
          <div className="pdf-no-break" style={{
            marginTop: '0px',
            background: '#1B4D8A',
            color: 'white',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '24px',
          }}>
            <img
              src="https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png"
              crossOrigin="anonymous"
              alt="MSI"
              style={{ height: '48px', filter: 'brightness(0) invert(1)', flexShrink: 0 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px', fontSize: '10px', flex: 1 }}>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>PT Milenial Solusi Internusa</div>
                <div>Latinos Business District</div>
                <div>Blok C9 No. 12-15 Jl. Raya Rawa Buntu</div>
                <div>Kota Tangerang Selatan, Banten 15310</div>
                <div style={{ marginTop: '4px', color: '#FFB899' }}>Senin - Jumat, 08:00 AM - 05:00 PM</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>&nbsp;</div>
                <div>Sentra 22, Jl. Cakung Cilincing Raya, No. 22D</div>
                <div>Cilincing, Kota Jakarta Utara, Jakarta 14130</div>
                <div style={{ marginTop: '4px', color: '#FFB899' }}>Senin - Jumat, 08:00 AM - 05:00 PM</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmSend}
        title="Kirim ke Customer?"
        message={`Quotation ${quot.quotation_no} akan ditandai SENT dan waktu kirim dicatat untuk perhitungan SLA. Lanjutkan?`}
        confirmLabel={sending ? 'Mengirim…' : 'Ya, Kirim'}
        cancelLabel="Batal"
        variant="info"
        onConfirm={handleSendToCustomer}
        onCancel={() => setConfirmSend(false)}
      />
    </div>
  );
}
