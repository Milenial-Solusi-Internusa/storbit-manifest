// src/modules/crm/CustomerDetailPage.jsx
// Master Customer — DETAIL page. Visual structure CLONED from AssetDetailPage
// (breadcrumb + actions, Card header with avatar + badges + in-card tab bar,
//  dl/Def section layout, .ad-tab underline tabs) with customer content.
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ChevronRight, Pencil, Trash2,
  Info, CreditCard, CalendarDays, Target, FileText, Save, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import BantScoreBar from './BantScoreBar';
import { calcBantScore } from './bant';
import ConfirmModal from '../../components/ConfirmModal';
import { CustomerFormModal } from './CustomerListPage';

// ─────────────────────────────────────────────────────────────
// Design tokens — matches AssetDetailPage (warm cream)
// ─────────────────────────────────────────────────────────────
const D = {
  bg:          '#F6EFE3',
  bgAlt:       '#EFE6D4',
  surface:     '#FFFDF8',
  surface2:    '#FBF6EC',
  ink:         '#23291E',
  inkSoft:     '#5E6553',
  inkFaint:    '#8A8E7C',
  line:        '#E7DCC8',
  lineSoft:    '#F0E7D6',
  navy:        '#144682',
  navySoft:    '#EEF3FB',
  accent:      '#E85A1E',
  accentSoft:  '#FEF2EC',
  ok:          '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:        '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:      '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:        '#2A5B8C', infoBg:'#E1ECF5', infoBd:'#BAD2E6',
  neutral:     '#6B6F5E', neutralBg:'#EEE9DC', neutralBd:'#DDD3BE',
  shadow:      '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm:    '0 1px 2px rgba(40,34,18,.06)',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmtRupiah = (n) => (n == null || n === '') ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID');
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const initials = (name) => (name || '??').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// ─────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────
const STATUS_META = {
  active:     { bg: D.okBg,      color: D.ok,      bd: D.okBd,      label: 'Active'      },
  inactive:   { bg: D.warnBg,    color: D.warn,    bd: D.warnBd,    label: 'Inactive'    },
  free_agent: { bg: D.neutralBg, color: D.neutral, bd: D.neutralBd, label: 'Free Agent'  },
};
const TIER_META = {
  A: { bg: '#FEF3C7', color: '#92400E', bd: '#FDE68A' },
  B: { bg: '#F1F5F9', color: '#475569', bd: '#CBD5E1' },
  C: { bg: '#FDF4F0', color: '#92400E', bd: '#F3C8BA' },
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
  { key: 'bant_commodity',      label: 'Komoditi / Barang' },
  { key: 'bant_origin',         label: 'Kota/Port Asal (POL)' },
  { key: 'bant_destination',    label: 'Kota/Port Tujuan (POD)' },
  { key: 'bant_frequency',      label: 'Frekuensi Pengiriman' },
  { key: 'bant_current_vendor', label: 'Vendor / Forwarder Saat Ini' },
  { key: 'bant_payment',        label: 'Preferensi Payment' },
  { key: 'bant_decision_maker', label: 'Decision Maker' },
];

function StatusBadge({ statusKey }) {
  const m = STATUS_META[statusKey] || STATUS_META.active;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
      padding: '3px 9px', borderRadius: 20, border: `1px solid ${m.bd}`, background: m.bg, color: m.color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />{m.label}
    </span>
  );
}
function TierBadge({ tier }) {
  if (!tier) return null;
  const m = TIER_META[tier] || TIER_META.C;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>
      Tier {tier}
    </span>
  );
}
function CoBadge({ code, name }) {
  if (!code) return null;
  const m = CO_META[code] || { bg: D.neutralBg, color: D.neutral };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
      padding: '3px 9px', borderRadius: 6, background: m.bg, color: m.color, fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {code}{name ? <span style={{ fontFamily: 'inherit', fontWeight: 500 }}>· {name}</span> : null}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Card / Btn / Def / SectionLabel (ported from AssetDetailPage)
// ─────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 10, boxShadow: D.shadowSm, ...style }}>
      {children}
    </div>
  );
}
function Btn({ icon: Icon, children, danger, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${danger ? D.dangerBd : D.line}`,
    background: danger ? (hover ? D.dangerBg : D.surface) : (hover ? D.bgAlt : D.surface),
    color: danger ? D.danger : D.inkSoft, opacity: disabled ? .5 : 1, transition: 'background .12s', fontFamily: 'inherit',
  };
  return (
    <button style={base} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {Icon && <Icon size={14} strokeWidth={1.8} />}
      {children}
    </button>
  );
}
function Def({ label, value, mono, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', padding: '8px 0', borderBottom: `1px solid ${D.lineSoft}`, alignItems: 'start', gap: 12 }}>
      <dt style={{ fontSize: 12.5, color: D.inkFaint, fontWeight: 600, paddingTop: 1 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13.5, color: D.ink, fontWeight: 500, fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined }}>
        {children ?? (value ?? '—')}
      </dd>
    </div>
  );
}
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: D.inkFaint, padding: '14px 0 6px' }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Visit row (expandable) — History Visit tab
// ─────────────────────────────────────────────────────────────
function VisitRow({ v }) {
  const [open, setOpen] = useState(false);
  const sm = VISIT_STATUS_META[v.status] || VISIT_STATUS_META.scheduled;
  const pom = v.point_of_meeting || '';
  const pomPreview = pom.length > 100 ? pom.slice(0, 100) + '…' : pom;
  const d = v.visit_date ? new Date(v.visit_date + 'T00:00:00') : null;
  return (
    <div style={{ borderRadius: 9, background: D.surface2, border: `1px solid ${D.lineSoft}`, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}>
        <div style={{ textAlign: 'center', minWidth: 40 }}>
          <div style={{ fontSize: 10, color: D.inkFaint, fontWeight: 600, textTransform: 'uppercase' }}>
            {d ? d.toLocaleDateString('id-ID', { weekday: 'short' }) : '—'}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: D.navy, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.1 }}>
            {d ? d.getDate() : '—'}
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
        <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${D.lineSoft}` }}>
          <dl style={{ margin: 0 }}>
            {pom && <Def label="Point of Meeting" value={pom} />}
            {v.mom && <Def label="Minutes of Meeting" value={v.mom} />}
            {v.follow_up && <Def label="Tindak Lanjut" value={v.follow_up} />}
            {v.notes && <Def label="Catatan" value={v.notes} />}
          </dl>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'info',      label: 'Info Dasar',      icon: Info        },
  { id: 'komersial', label: 'Komersial',       icon: CreditCard  },
  { id: 'visits',    label: 'History Visit',   icon: CalendarDays },
  { id: 'bant',      label: 'BANT & Pipeline', icon: Target      },
  { id: 'notes',     label: 'Notes',           icon: FileText    },
];

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function CustomerDetailPage({ id, onBack, showToast }) {
  const { profile, erpRole } = useAuth();
  const canDelete = ['super_admin', 'admin', 'manager'].includes(erpRole);

  const [customer, setCustomer] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState('info');

  const [visits, setVisits]               = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);

  const [editing,    setEditing]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const [editNotes, setEditNotes]     = useState(false);
  const [notesDraft, setNotesDraft]   = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Fetch customer (+ joins, incl. linked prospect for BANT) ──
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
          payment_term:payment_terms!customers_payment_terms_id_fkey(name),
          prospect:prospects!customers_prospect_id_fkey(
            id, name, pipeline_stage, bant_score,
            bant_commodity, bant_origin, bant_destination,
            bant_frequency, bant_current_vendor, bant_payment, bant_decision_maker
          )
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

  // ── History Visit — fetch sales_visits by prospect_id ──
  useEffect(() => {
    if (activeTab !== 'visits' || !customer?.prospect_id) { setVisits([]); return; }
    setVisitsLoading(true);
    supabase.from('sales_visits')
      .select('*, salesperson:profiles!sales_visits_salesperson_id_fkey(full_name)')
      .eq('prospect_id', customer.prospect_id)
      .order('visit_date', { ascending: false })
      .limit(50)
      .then(({ data }) => { setVisits(data || []); setVisitsLoading(false); });
  }, [activeTab, customer?.prospect_id]);

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

  // ── Loading / not-found ──
  if (loading) {
    return <div style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: '4rem', textAlign: 'center', color: D.inkFaint, fontSize: 14 }}>Memuat data customer…</div>;
  }
  if (!customer) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: '3rem', textAlign: 'center', color: D.danger, fontSize: 14 }}>
        Customer tidak ditemukan.
        <div style={{ marginTop: 14 }}><Btn icon={ArrowLeft} onClick={onBack}>Kembali</Btn></div>
      </div>
    );
  }

  const statusKey = customer.status || (customer.active === false ? 'inactive' : 'active');
  const coCode = customer.source_company?.code;
  const prospect = customer.prospect || null;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>
      <style>{`
        .ad-tab{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:none;
          background:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;
          color:#5E6553;border-bottom:2px solid transparent;transition:color .12s;white-space:nowrap}
        .ad-tab:hover{color:#23291E}
        .ad-tab.active{color:#E85A1E;border-bottom-color:#E85A1E}
      `}</style>

      {/* ── Breadcrumb + actions ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: D.inkFaint, marginBottom: 8 }}>
            {onBack && (
              <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: D.inkFaint, fontFamily: 'inherit', fontSize: 12.5, padding: 0 }}>
                <ArrowLeft size={13} /> Kembali
              </button>
            )}
            <ChevronRight size={12} />
            <span style={{ color: D.inkFaint }}>CRM</span>
            <ChevronRight size={12} />
            <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, color: D.inkFaint, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>Master Customer</button>
            <ChevronRight size={12} />
            <span style={{ color: D.inkSoft, fontWeight: 600 }}>{customer.name}</span>
          </nav>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', margin: 0, lineHeight: 1.1 }}>Detail Customer</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn icon={Pencil} onClick={() => setEditing(true)}>Edit</Btn>
          {canDelete && <Btn icon={Trash2} danger onClick={() => setConfirmDel(true)}>Hapus</Btn>}
        </div>
      </div>

      {/* ── Header card (with in-card tab bar) ── */}
      <Card style={{ marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            {/* Avatar — navy circle initials */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
              background: D.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, fontFamily: "'Montserrat', sans-serif",
            }}>
              {initials(customer.name)}
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              {/* Name + code */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: D.ink, fontFamily: "'Montserrat', sans-serif", letterSpacing: '-.3px' }}>
                  {customer.name}
                </h2>
                {customer.code && (
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 700, color: D.accent, background: D.accentSoft, padding: '2px 8px', borderRadius: 5 }}>{customer.code}</span>
                )}
              </div>

              {/* Legal name */}
              {customer.legal_name && (
                <div style={{ fontSize: 13, color: D.inkSoft, marginBottom: 10 }}>{customer.legal_name}</div>
              )}

              {/* Badges row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {coCode && <CoBadge code={coCode} name={customer.source_company?.name} />}
                <TierBadge tier={customer.tier} />
                <StatusBadge statusKey={statusKey} />
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ borderTop: `1px solid ${D.lineSoft}`, overflowX: 'auto' }}>
          <div style={{ display: 'flex', padding: '0 20px', gap: 2 }}>
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={`ad-tab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
                  <Icon size={14} strokeWidth={1.8} />{t.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ── Tab panels ── */}

      {/* INFO DASAR */}
      {activeTab === 'info' && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <dl style={{ margin: 0 }}>
            <SectionLabel>Identitas</SectionLabel>
            <Def label="Nama Perusahaan" value={customer.name} />
            <Def label="Legal Name"      value={customer.legal_name} />
            <Def label="Customer Type"   value={customer.customer_type} />
            <Def label="Tax ID / NPWP"   value={customer.tax_id} mono />
            <Def label="Customer Code"   value={customer.code} mono />

            <SectionLabel>Kontak</SectionLabel>
            <Def label="Phone"   value={customer.phone} />
            <Def label="Email"   value={customer.email} />
            <Def label="Address" value={customer.address} />
            <Def label="City"    value={customer.city} />
            <Def label="Country" value={customer.country || 'Indonesia'} />

            <SectionLabel>PIC</SectionLabel>
            <Def label="PIC Name"  value={customer.pic_name} />
            <Def label="PIC Phone" value={customer.pic_phone} mono />
            <Def label="PIC Email" value={customer.pic_email} />
          </dl>
        </Card>
      )}

      {/* KOMERSIAL */}
      {activeTab === 'komersial' && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <dl style={{ margin: 0 }}>
            <SectionLabel>Komersial</SectionLabel>
            <Def label="Tier">{customer.tier ? <TierBadge tier={customer.tier} /> : '—'}</Def>
            <Def label="Status"><StatusBadge statusKey={statusKey} /></Def>
            <Def label="Entitas Owner"        value={customer.source_company?.name} />
            <Def label="Assigned Salesperson" value={customer.assigned_profile?.full_name} />
            <Def label="Payment Terms"        value={customer.payment_term?.name || customer.payment_terms} />
            <Def label="Credit Limit"         value={fmtRupiah(customer.credit_limit)} mono />
            <Def label="Currency"             value={customer.currency_code} />
            <Def label="Nomor Kontrak"        value={customer.contract_no} mono />
            <Def label="Last Activity At"     value={customer.last_activity_at ? fmtDateTime(customer.last_activity_at) : '—'} />
          </dl>
        </Card>
      )}

      {/* HISTORY VISIT */}
      {activeTab === 'visits' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}` }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Riwayat Kunjungan</span>
            <span style={{ fontSize: 12.5, color: D.inkFaint }}>{prospect?.name ? `Prospect: ${prospect.name}` : 'Dari prospect terkait'}</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {!customer.prospect_id ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: D.inkFaint, fontSize: 13 }}>Customer belum terhubung ke prospect.</div>
            ) : visitsLoading ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>
            ) : visits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: D.inkFaint, fontSize: 13 }}>Belum ada riwayat kunjungan.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visits.map(v => <VisitRow key={v.id} v={v} />)}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* BANT & PIPELINE */}
      {activeTab === 'bant' && (
        <Card style={{ padding: '4px 20px 16px' }}>
          {!customer.prospect_id || !prospect ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: D.inkFaint, fontSize: 13 }}>Belum ada data pipeline.</div>
          ) : (
            <>
              <div style={{ padding: '14px 0 4px' }}>
                <BantScoreBar score={prospect.bant_score != null ? prospect.bant_score : calcBantScore(prospect)} />
              </div>
              <dl style={{ margin: 0 }}>
                <SectionLabel>BANT Qualification</SectionLabel>
                {BANT_FIELDS.map(f => <Def key={f.key} label={f.label} value={prospect[f.key]} />)}
                <SectionLabel>Pipeline</SectionLabel>
                <Def label="Pipeline Stage Terakhir" value={prospect.pipeline_stage} />
              </dl>
            </>
          )}
        </Card>
      )}

      {/* NOTES */}
      {activeTab === 'notes' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}` }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notes</span>
            {!editNotes && <Btn icon={Pencil} onClick={startEditNotes}>Edit Notes</Btn>}
          </div>
          <div style={{ padding: '16px' }}>
            {!editNotes ? (
              customer.notes ? (
                <div style={{ fontSize: 13.5, color: D.ink, lineHeight: 1.8, whiteSpace: 'pre-wrap', background: D.surface2, border: `1px solid ${D.line}`, borderRadius: 9, padding: '14px 16px' }}>
                  {customer.notes}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: D.inkFaint, fontSize: 13 }}>Tidak ada catatan.</div>
              )
            ) : (
              <>
                <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={6} placeholder="Catatan tambahan…"
                  style={{ width: '100%', borderRadius: 9, border: `1px solid ${D.line}`, background: D.surface, padding: '12px 14px', fontSize: 13.5, color: D.ink, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                  <Btn icon={X} onClick={() => setEditNotes(false)} disabled={savingNotes}>Batal</Btn>
                  <button onClick={saveNotes} disabled={savingNotes} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 16px', borderRadius: 8,
                    background: D.navy, color: '#fff', border: 'none', cursor: savingNotes ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: savingNotes ? .6 : 1,
                  }}>
                    <Save size={14} /> {savingNotes ? 'Menyimpan…' : 'Simpan Notes'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

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
