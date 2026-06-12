// src/modules/crm/CustomerDetailPage.jsx
// Master Customer — DETAIL page (full page, replaces the old detail modal).
// Visual pattern follows AssetDetailPage: breadcrumb + back, header card, tabs.
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Building2, CreditCard, Calendar, FileText, Target,
  Edit2, Trash2, Save, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import BantScoreBar from './BantScoreBar';
import { calcBantScore } from './bant';
import ConfirmModal from '../../components/ConfirmModal';
import { CustomerFormModal } from './CustomerListPage';

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  surface:    '#FFFDF8',
  surface2:   '#FBF6EC',
  ink:        '#23291E',
  inkSoft:    '#5E6553',
  inkFaint:   '#8A8E7C',
  line:       '#E7DCC8',
  lineSoft:   '#F0E7D6',
  navy:       '#144682',
  navySoft:   '#EEF3FB',
  accent:     '#E85A1E',
  accentSoft: '#FEF2EC',
  ok:      '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:    '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:  '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:    '#2A5B8C', infoBg:'#E1ECF5', infoBd:'#BAD2E6',
  neutral: '#6B6F5E', neutralBg:'#EEE9DC', neutralBd:'#DDD3BE',
  shadow: '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm: '0 1px 2px rgba(40,34,18,.06)',
};

const TIER_META = {
  A: { bg: '#FEF3C7', color: '#92400E', bd: '#FDE68A', label: 'A' },
  B: { bg: '#F1F5F9', color: '#475569', bd: '#CBD5E1', label: 'B' },
  C: { bg: '#FDF4F0', color: '#92400E', bd: '#F3C8BA', label: 'C' },
};
const STATUS_META = {
  active:     { bg: D.okBg,      color: D.ok,      bd: D.okBd,      label: 'Active'      },
  inactive:   { bg: D.warnBg,    color: D.warn,    bd: D.warnBd,    label: 'Inactive'    },
  free_agent: { bg: D.neutralBg, color: D.neutral, bd: D.neutralBd, label: 'Free Agent'  },
};
const CO_META = {
  MSI: { bg: D.accentSoft, color: D.accent },
  JCI: { bg: D.infoBg,     color: D.info   },
  SOA: { bg: D.okBg,       color: D.ok     },
};
const VISIT_STATUS_META = {
  scheduled: { bg: '#EFF6FF', color: '#3B82F6', label: 'Terjadwal'  },
  completed: { bg: '#F0FDF4', color: '#22C55E', label: 'Selesai'    },
  cancelled: { bg: '#FFF1F2', color: '#EF4444', label: 'Dibatalkan' },
};
const VISIT_TYPE_LABELS = {
  discovery: 'Discovery', solution_presentation: 'Solution Presentation',
  qbr: 'QBR', problem_solving: 'Problem Solving', routine_touch: 'Routine Touch',
};
const BANT_FIELDS = [
  { key: 'bant_commodity',       label: 'Komoditi / Barang' },
  { key: 'bant_origin',          label: 'Kota/Port Asal (POL)' },
  { key: 'bant_destination',     label: 'Kota/Port Tujuan (POD)' },
  { key: 'bant_frequency',       label: 'Frekuensi Pengiriman' },
  { key: 'bant_current_vendor',  label: 'Vendor / Forwarder Saat Ini' },
  { key: 'bant_payment',         label: 'Preferensi Payment' },
  { key: 'bant_decision_maker',  label: 'Decision Maker' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtRupiah = (n) => (!n && n !== 0) ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID');
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

// ─── Shared badges ────────────────────────────────────────────────────────────
function TierBadge({ tier }) {
  if (!tier) return <span style={{ color: D.inkFaint, fontSize: 12 }}>—</span>;
  const m = TIER_META[tier] || TIER_META.C;
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 6, border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>Tier {m.label}</span>;
}
function StatusBadge({ statusKey }) {
  const m = STATUS_META[statusKey] || STATUS_META.active;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: `1px solid ${m.bd}`, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />{m.label}
    </span>
  );
}
function CoBadge({ code }) {
  if (!code) return null;
  const m = CO_META[code] || { bg: D.neutralBg, color: D.neutral };
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: m.bg, color: m.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.3px' }}>{code}</span>;
}

// ─── Field / Section presentational helpers (module scope) ───────────────────
const F = ({ label, value, mono, full }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: full ? '1 / -1' : undefined }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: D.inkFaint, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
    <div style={{ fontSize: 13.5, color: value ? D.ink : D.inkFaint, fontStyle: value ? 'normal' : 'italic', fontFamily: mono ? "'IBM Plex Mono', monospace" : 'inherit' }}>{value || '—'}</div>
  </div>
);
const Section = ({ title, children, cols = 2 }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${D.lineSoft}` }}>{title}</div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px 20px' }}>{children}</div>
  </div>
);

const TABS = [
  { id: 'info',      label: 'Info Dasar',     icon: Building2 },
  { id: 'komersial', label: 'Komersial',      icon: CreditCard },
  { id: 'visits',    label: 'History Visit',  icon: Calendar },
  { id: 'bant',      label: 'BANT & Pipeline', icon: Target },
  { id: 'notes',     label: 'Notes',          icon: FileText },
];

// ─── Visit row (expandable) ───────────────────────────────────────────────────
function VisitRow({ v }) {
  const [open, setOpen] = useState(false);
  const sm = VISIT_STATUS_META[v.status] || VISIT_STATUS_META.scheduled;
  const pom = v.point_of_meeting || '';
  const pomPreview = pom.length > 100 ? pom.slice(0, 100) + '…' : pom;
  return (
    <div style={{ borderRadius: 9, background: '#F9FAFB', border: '1px solid #F0F1F4', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}>
        <div style={{ textAlign: 'center', minWidth: 40 }}>
          <div style={{ fontSize: 10, color: D.inkFaint, fontWeight: 600, textTransform: 'uppercase' }}>
            {v.visit_date ? new Date(v.visit_date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' }) : '—'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: D.navy, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.1 }}>
            {v.visit_date ? new Date(v.visit_date + 'T00:00:00').getDate() : '—'}
          </div>
        </div>
        <div style={{ width: 1, height: 34, background: D.line }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: D.ink }}>{v.salesperson?.full_name || '—'}</span>
            {v.visit_type && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: D.navySoft, color: D.navy }}>{VISIT_TYPE_LABELS[v.visit_type] || v.visit_type}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: D.inkFaint }}>
            {v.visit_time ? v.visit_time.slice(0, 5) + ' · ' : ''}{v.location || '—'}{pomPreview ? ' · ' + pomPreview : ''}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sm.bg, color: sm.color, whiteSpace: 'nowrap' }}>{sm.label}</span>
      </div>
      {open && (
        <div style={{ padding: '4px 14px 14px 66px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${D.lineSoft}` }}>
          {pom && <F label="Point of Meeting" value={pom} full />}
          {v.mom && <F label="Minutes of Meeting" value={v.mom} full />}
          {v.follow_up && <F label="Tindak Lanjut" value={v.follow_up} full />}
          {v.notes && <F label="Catatan" value={v.notes} full />}
        </div>
      )}
    </div>
  );
}

// ─── Main detail page ─────────────────────────────────────────────────────────
export default function CustomerDetailPage({ id, onBack, showToast }) {
  const { profile, erpRole } = useAuth();
  const canDelete = ['super_admin', 'admin', 'manager'].includes(erpRole);

  const [customer, setCustomer] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('info');

  const [visits, setVisits]               = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [prospect, setProspect]           = useState(null);
  const [prospectLoading, setProspectLoading] = useState(false);

  const [editing,    setEditing]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const [editNotes, setEditNotes]   = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Fetch customer ──────────────────────────────────────────────────────────
  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          assigned_profile:profiles!customers_assigned_to_fkey(full_name),
          source_company:companies!customers_source_company_id_fkey(name, code),
          payment_term:payment_terms!customers_payment_terms_id_fkey(name)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      setCustomer(data);
    } catch {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single();
      setCustomer(data || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  // ── Tab: History Visit ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'visits' || !customer?.prospect_id) { setVisits([]); return; }
    setVisitsLoading(true);
    supabase.from('sales_visits')
      .select('*, salesperson:profiles!sales_visits_salesperson_id_fkey(full_name)')
      .eq('prospect_id', customer.prospect_id)
      .order('visit_date', { ascending: false })
      .limit(50)
      .then(({ data }) => { setVisits(data || []); setVisitsLoading(false); });
  }, [tab, customer?.prospect_id]);

  // ── Tab: BANT (linked prospect) ─────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'bant' || !customer?.prospect_id) { setProspect(null); return; }
    setProspectLoading(true);
    supabase.from('prospects')
      .select('id, pipeline_stage, bant_commodity, bant_origin, bant_destination, bant_frequency, bant_current_vendor, bant_payment, bant_decision_maker, bant_score')
      .eq('id', customer.prospect_id)
      .single()
      .then(({ data }) => { setProspect(data || null); setProspectLoading(false); });
  }, [tab, customer?.prospect_id]);

  // ── Delete (soft) ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ deleted_at: new Date().toISOString(), updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      showToast?.('Customer dihapus.', 'success');
      setConfirmDel(false);
      onBack?.();
    } catch (err) {
      showToast?.('Gagal menghapus: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Notes inline edit ────────────────────────────────────────────────────────
  const startEditNotes = () => { setNotesDraft(customer?.notes || ''); setEditNotes(true); };
  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ notes: notesDraft || null, updated_by: profile.id })
        .eq('id', id);
      if (error) throw error;
      setCustomer(c => ({ ...c, notes: notesDraft || null }));
      setEditNotes(false);
      showToast?.('Notes diperbarui ✨');
    } catch (err) {
      showToast?.('Gagal menyimpan notes: ' + err.message, 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return <div style={{ fontFamily: "'Inter', sans-serif", padding: '4rem', textAlign: 'center', color: D.inkFaint }}>Memuat data customer…</div>;
  }
  if (!customer) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", padding: '3rem', textAlign: 'center', color: D.danger }}>
        Customer tidak ditemukan.
        <div style={{ marginTop: 14 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${D.line}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: D.inkSoft, cursor: 'pointer' }}>
            <ChevronLeft size={15} /> Kembali
          </button>
        </div>
      </div>
    );
  }

  const statusKey = customer.status || (customer.active === false ? 'inactive' : 'active');
  const coCode = customer.source_company?.code;

  const btn = (bg, color, bd) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${bd}`, background: bg, color,
  });

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>

      {/* Breadcrumb + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: D.inkFaint, marginBottom: 8 }}>
            <span>CRM</span><span>›</span>
            <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, color: D.inkSoft, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Master Customer</button>
            <span>›</span><span style={{ color: D.ink, fontWeight: 600 }}>{customer.name}</span>
          </nav>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${D.line}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: D.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>
            <ChevronLeft size={15} /> Kembali
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setEditing(true)} style={btn(D.surface, D.ink, D.line)}>
            <Edit2 size={14} /> Edit
          </button>
          {canDelete && (
            <button onClick={() => setConfirmDel(true)} style={btn('#FEE2E2', '#DC2626', '#FCA5A5')}>
              <Trash2 size={14} /> Hapus
            </button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 14, padding: 22, boxShadow: D.shadow, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: D.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, fontFamily: "'Montserrat', sans-serif", flexShrink: 0 }}>
          {initials(customer.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: D.ink, fontFamily: "'Montserrat', sans-serif", letterSpacing: -.4 }}>{customer.name}</h1>
          {customer.legal_name && <div style={{ fontSize: 13, color: D.inkSoft, marginTop: 2 }}>{customer.legal_name}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {customer.code && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 700, color: D.accent, background: D.accentSoft, padding: '2px 8px', borderRadius: 5 }}>{customer.code}</span>}
            {coCode && <CoBadge code={coCode} />}
            {customer.tier && <TierBadge tier={customer.tier} />}
            <StatusBadge statusKey={statusKey} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: active ? `1px solid ${D.navy}` : `1px solid ${D.line}`, background: active ? D.navySoft : D.surface, color: active ? D.navy : D.inkSoft, fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              <t.icon size={13} strokeWidth={active ? 2.2 : 1.7} />{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 14, padding: 24, boxShadow: D.shadowSm }}>

        {tab === 'info' && (
          <>
            <Section title="Identitas">
              <F label="Nama Perusahaan" value={customer.name} />
              <F label="Legal Name"      value={customer.legal_name} />
              <F label="Customer Type"   value={customer.customer_type} />
              <F label="Tax ID / NPWP"   value={customer.tax_id} mono />
              <F label="Customer Code"   value={customer.code} mono />
            </Section>
            <Section title="Kontak">
              <F label="Phone"   value={customer.phone} />
              <F label="Email"   value={customer.email} />
              <F label="Kota"    value={customer.city} />
              <F label="Country" value={customer.country || 'Indonesia'} />
              <F label="Address" value={customer.address} full />
            </Section>
            <Section title="PIC">
              <F label="PIC Name"  value={customer.pic_name} />
              <F label="PIC Phone" value={customer.pic_phone} />
              <F label="PIC Email" value={customer.pic_email} />
            </Section>
          </>
        )}

        {tab === 'komersial' && (
          <>
            <Section title="Pipeline & Komersial">
              <F label="Tier"          value={customer.tier ? `Tier ${customer.tier}` : null} />
              <F label="Status"        value={STATUS_META[statusKey]?.label} />
              <F label="Entitas Owner" value={customer.source_company?.name} />
              <F label="Assigned Salesperson" value={customer.assigned_profile?.full_name} />
              <F label="Payment Terms" value={customer.payment_term?.name || customer.payment_terms} />
              <F label="Credit Limit"  value={customer.credit_limit != null ? fmtRupiah(customer.credit_limit) : null} />
              <F label="Currency"      value={customer.currency_code} />
              <F label="Nomor Kontrak" value={customer.contract_no} mono />
              <F label="Last Activity At" value={customer.last_activity_at ? fmtDateTime(customer.last_activity_at) : null} />
            </Section>
          </>
        )}

        {tab === 'visits' && (
          <div>
            {!customer.prospect_id ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Customer belum terhubung ke prospect.</div>
            ) : visitsLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>
            ) : visits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Belum ada riwayat kunjungan.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visits.map(v => <VisitRow key={v.id} v={v} />)}
              </div>
            )}
          </div>
        )}

        {tab === 'bant' && (
          <div>
            {!customer.prospect_id ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Belum ada data pipeline.</div>
            ) : prospectLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>
            ) : !prospect ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Belum ada data pipeline.</div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <BantScoreBar score={prospect.bant_score != null ? prospect.bant_score : calcBantScore(prospect)} />
                </div>
                <Section title="BANT Qualification">
                  {BANT_FIELDS.map(f => <F key={f.key} label={f.label} value={prospect[f.key]} full={f.key === 'bant_decision_maker'} />)}
                </Section>
                <Section title="Pipeline" cols={1}>
                  <F label="Pipeline Stage Terakhir" value={prospect.pipeline_stage} />
                </Section>
              </>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div>
            {!editNotes ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button onClick={startEditNotes} style={btn(D.surface, D.navy, D.navy + '40')}>
                    <Edit2 size={13} /> Edit Notes
                  </button>
                </div>
                {customer.notes ? (
                  <div style={{ fontSize: 13.5, color: D.ink, lineHeight: 1.8, whiteSpace: 'pre-wrap', background: D.surface2, border: `1px solid ${D.line}`, borderRadius: 9, padding: '14px 16px' }}>
                    {customer.notes}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Tidak ada catatan.</div>
                )}
              </>
            ) : (
              <>
                <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={6} placeholder="Catatan tambahan…"
                  style={{ width: '100%', borderRadius: 9, border: `1px solid ${D.line}`, background: D.surface, padding: '12px 14px', fontSize: 13.5, color: D.ink, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                  <button onClick={() => setEditNotes(false)} disabled={savingNotes} style={btn(D.surface, D.inkSoft, D.line)}>
                    <X size={13} /> Batal
                  </button>
                  <button onClick={saveNotes} disabled={savingNotes} style={{ ...btn(D.navy, '#fff', D.navy), opacity: savingNotes ? .6 : 1 }}>
                    <Save size={13} /> {savingNotes ? 'Menyimpan…' : 'Simpan Notes'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <CustomerFormModal
          initial={customer}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); fetchCustomer(); }}
          showToast={showToast}
        />
      )}

      {/* Delete confirm */}
      <ConfirmModal
        open={confirmDel}
        title="Hapus Customer?"
        message={`Customer "${customer.name}" akan dihapus (soft delete). Lanjutkan?`}
        confirmLabel={deleting ? 'Menghapus…' : 'Ya, Hapus'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}
