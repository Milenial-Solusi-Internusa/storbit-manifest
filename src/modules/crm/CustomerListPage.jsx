// src/modules/crm/CustomerListPage.jsx
// Master Customer — LIST page (replaces CustomerMasterPage modal-based view).
// List → detail uses App.jsx state swap (onSelectCustomer → CustomerDetailPage), like AssetITPage.
// Add/edit still uses CustomerFormModal (exported for reuse by CustomerDetailPage).
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Eye, X, Building2, CreditCard, Check, AlertTriangle, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

// ─── Design tokens (warm cream) ───────────────────────────────────────────────
const D = {
  bg:         '#F6EFE3',
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

// ─── Constants ────────────────────────────────────────────────────────────────
const CUSTOMER_TYPES = ['PT', 'CV', 'Mr.', 'Mrs.', 'Ms.', 'Other'];
const TIERS = ['A', 'B', 'C'];
const CUST_STATUSES = [
  { value: 'active',     label: 'Active'      },
  { value: 'inactive',   label: 'Inactive'    },
  { value: 'free_agent', label: 'Free Agent'  },
];
const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD'];

const TIER_META = {
  A: { bg: '#FEF3C7', color: '#92400E', bd: '#FDE68A', label: 'A' },
  B: { bg: '#F1F5F9', color: '#475569', bd: '#CBD5E1', label: 'B' },
  C: { bg: '#FDF4F0', color: '#92400E', bd: '#F3C8BA', label: 'C' },
};
const STATUS_META = {
  active:     { bg: D.okBg,      color: D.ok,      bd: D.okBd,      label: 'Active'      },
  inactive:   { bg: D.warnBg,    color: D.warn,     bd: D.warnBd,    label: 'Inactive'    },
  free_agent: { bg: D.neutralBg, color: D.neutral,  bd: D.neutralBd, label: 'Free Agent'  },
};
const CO_META = {
  MSI: { bg: D.accentSoft, color: D.accent },
  JCI: { bg: D.infoBg,     color: D.info   },
  SOA: { bg: D.okBg,       color: D.ok     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Shared badges ────────────────────────────────────────────────────────────
function TierBadge({ tier }) {
  if (!tier) return <span style={{ color: D.inkFaint, fontSize: 12 }}>—</span>;
  const m = TIER_META[tier] || TIER_META.C;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 6, border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}
function StatusBadge({ status, active }) {
  const key = status || (active === false ? 'inactive' : 'active');
  const m = STATUS_META[key] || STATUS_META.active;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: `1px solid ${m.bd}`, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
      {m.label}
    </span>
  );
}
function CoBadge({ code }) {
  if (!code) return null;
  const m = CO_META[code] || { bg: D.neutralBg, color: D.neutral };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: m.bg, color: m.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.3px' }}>
      {code}
    </span>
  );
}

const TH = ({ children, style: s }) => (
  <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: D.inkFaint, padding: '10px 14px', borderBottom: `1px solid ${D.line}`, background: D.surface2, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, ...s }}>
    {children}
  </th>
);
const TD = ({ children, style: s }) => (
  <td style={{ padding: '9px 14px', borderBottom: `1px solid ${D.lineSoft}`, verticalAlign: 'middle', fontSize: 13, ...s }}>
    {children}
  </td>
);

function Btn({ children, primary, small, onClick, disabled, icon: Icon }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: small ? 5 : 7, height: small ? 32 : 38, padding: small ? '0 10px' : '0 15px', borderRadius: small ? 7 : 9, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', border: `1px solid ${primary ? D.navy : D.line}`, background: primary ? D.navy : D.surface, color: primary ? '#fff' : D.ink, opacity: disabled ? .45 : 1 }}>
      {Icon && <Icon size={small ? 13 : 15} strokeWidth={1.9} />}
      {children}
    </button>
  );
}

// ─── Input styles ─────────────────────────────────────────────────────────────
const INP_STYLE = {
  width: '100%', height: 36, borderRadius: 8, border: `1px solid ${D.line}`,
  background: D.surface, padding: '0 11px', fontSize: 13, color: D.ink,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const SEL_STYLE = { ...INP_STYLE, cursor: 'pointer' };

// Form field label + group (module scope — pure, props only)
const FieldLabel = ({ text, req }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>
    {text}{req && <span style={{ color: D.danger }}> *</span>}
  </div>
);
const FG = ({ children, label, req, full }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gridColumn: full ? '1 / -1' : undefined }}>
    <FieldLabel text={label} req={req} />
    {children}
  </div>
);

// ─── CustomerFormModal (add/edit) — exported for reuse by CustomerDetailPage ──
export function CustomerFormModal({ initial, onClose, onSaved, showToast }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    name:             initial?.name            || '',
    legal_name:       initial?.legal_name      || '',
    customer_type:    initial?.customer_type   || 'PT',
    tax_id:           initial?.tax_id          || '',
    code:             initial?.code            || '',
    phone:            initial?.phone           || '',
    email:            initial?.email           || '',
    address:          initial?.address         || '',
    city:             initial?.city            || '',
    country:          initial?.country         || 'Indonesia',
    pic_name:         initial?.pic_name        || '',
    pic_phone:        initial?.pic_phone       || '',
    pic_email:        initial?.pic_email       || '',
    tier:             initial?.tier            || '',
    status:           initial?.status          || 'active',
    assigned_to:      initial?.assigned_to     || '',
    payment_terms_id: initial?.payment_terms_id || '',
    credit_limit:     initial?.credit_limit    ?? '',
    currency_code:    initial?.currency_code   || 'IDR',
    notes:            initial?.notes           || '',
  });
  const [errors, setErrors]         = useState({});
  const [saving, setSaving]         = useState(false);
  const [dupWarning, setDupWarning] = useState('');
  const [profiles, setProfiles]     = useState([]);
  const [payTerms, setPayTerms]     = useState([]);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('profiles').select('id, full_name').eq('active', true).limit(200)
      .then(({ data }) => setProfiles(data || []));
    supabase.from('payment_terms').select('id, name').eq('company_id', profile.company_id).is('deleted_at', null)
      .then(({ data }) => setPayTerms(data || []));
  }, [profile?.company_id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const checkDuplicate = async (nameVal) => {
    if (!nameVal.trim() || (initial?.name?.toLowerCase() === nameVal.toLowerCase())) {
      setDupWarning(''); return;
    }
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .ilike('name', nameVal.trim())
      .is('deleted_at', null)
      .limit(1);
    if (data?.length > 0 && data[0].id !== initial?.id) {
      setDupWarning('Customer dengan nama ini sudah terdaftar. Pastikan tidak duplikat.');
    } else {
      setDupWarning('');
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Wajib diisi';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name:             form.name.trim(),
        legal_name:       form.legal_name      || null,
        customer_type:    form.customer_type   || null,
        tax_id:           form.tax_id          || null,
        code:             form.code            || null,
        phone:            form.phone           || null,
        email:            form.email           || null,
        address:          form.address         || null,
        city:             form.city            || null,
        country:          form.country         || null,
        pic_name:         form.pic_name        || null,
        pic_phone:        form.pic_phone       || null,
        pic_email:        form.pic_email       || null,
        payment_terms_id: form.payment_terms_id || null,
        credit_limit:     form.credit_limit !== '' ? Number(form.credit_limit) : null,
        currency_code:    form.currency_code   || 'IDR',
        notes:            form.notes           || null,
        updated_by:       profile.id,
        // columns that may not exist yet — silently ignored if absent
        ...(form.tier        && { tier:        form.tier        }),
        ...(form.status      && { status:      form.status      }),
        ...(form.assigned_to && { assigned_to: form.assigned_to }),
      };

      let error;
      if (initial?.id) {
        ({ error } = await supabase.from('customers').update(payload).eq('id', initial.id));
      } else {
        payload.company_id        = profile.company_id;
        payload.source_company_id = profile.company_id; // may not exist yet — ignored by DB
        payload.created_by        = profile.id;
        payload.active            = true;
        ({ error } = await supabase.from('customers').insert(payload));
      }
      if (error) throw error;
      showToast?.(initial?.id ? 'Customer diperbarui ✨' : 'Customer ditambahkan ✨');
      onSaved();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: D.surface, borderRadius: 18, maxWidth: 660, width: '100%', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', boxShadow: D.shadow, border: `1px solid ${D.line}` }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: `1px solid ${D.line}` }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: D.inkFaint, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>MASTER CUSTOMER</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: D.ink, fontFamily: "'Montserrat', sans-serif" }}>
              {initial?.id ? 'Edit Customer' : 'Tambah Customer Baru'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: D.surface2, border: `1px solid ${D.line}`, borderRadius: 7, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color={D.inkSoft} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px 24px' }}>
          {/* Identitas */}
          <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 5, borderBottom: `1px solid ${D.lineSoft}` }}>Identitas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
            <FG label="Nama Perusahaan" req full>
              <input value={form.name} onChange={set('name')} onBlur={e => checkDuplicate(e.target.value)}
                placeholder="PT. ..." style={{ ...INP_STYLE, borderColor: errors.name ? D.danger : D.line }} />
              {errors.name && <span style={{ fontSize: 11.5, color: D.danger, marginTop: 3 }}>{errors.name}</span>}
              {dupWarning && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4, background: D.warnBg, border: `1px solid ${D.warnBd}`, borderRadius: 6, padding: '6px 9px', fontSize: 12, color: D.warn }}>
                  <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  {dupWarning}
                </div>
              )}
            </FG>
            <FG label="Legal Name">
              <input value={form.legal_name} onChange={set('legal_name')} placeholder="Nama legal sesuai akta" style={INP_STYLE} />
            </FG>
            <FG label="Customer Type">
              <select value={form.customer_type} onChange={set('customer_type')} style={SEL_STYLE}>
                {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FG>
            <FG label="Tax ID / NPWP">
              <input value={form.tax_id} onChange={set('tax_id')} placeholder="00.000.000.0-000.000" style={{ ...INP_STYLE, fontFamily: "'IBM Plex Mono', monospace" }} />
            </FG>
            <FG label="Customer Code">
              <input value={form.code} onChange={set('code')} placeholder="KOD-001" style={{ ...INP_STYLE, fontFamily: "'IBM Plex Mono', monospace" }} />
            </FG>
          </div>

          {/* Kontak */}
          <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 5, borderBottom: `1px solid ${D.lineSoft}` }}>Kontak</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
            <FG label="Phone"><input value={form.phone} onChange={set('phone')} placeholder="021-..." style={INP_STYLE} /></FG>
            <FG label="Email"><input type="email" value={form.email} onChange={set('email')} placeholder="info@..." style={INP_STYLE} /></FG>
            <FG label="Kota"><input value={form.city} onChange={set('city')} placeholder="Jakarta" style={INP_STYLE} /></FG>
            <FG label="Country"><input value={form.country} onChange={set('country')} placeholder="Indonesia" style={INP_STYLE} /></FG>
            <FG label="Alamat" full>
              <input value={form.address} onChange={set('address')} placeholder="Jl. ..." style={INP_STYLE} />
            </FG>
          </div>

          {/* PIC */}
          <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 5, borderBottom: `1px solid ${D.lineSoft}` }}>PIC</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
            <FG label="PIC Name"><input value={form.pic_name} onChange={set('pic_name')} placeholder="Nama kontak person" style={INP_STYLE} /></FG>
            <FG label="PIC Phone"><input value={form.pic_phone} onChange={set('pic_phone')} placeholder="08xx..." style={INP_STYLE} /></FG>
            <FG label="PIC Email" full><input type="email" value={form.pic_email} onChange={set('pic_email')} placeholder="pic@..." style={INP_STYLE} /></FG>
          </div>

          {/* Komersial */}
          <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 5, borderBottom: `1px solid ${D.lineSoft}` }}>Komersial</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
            <FG label="Tier">
              <select value={form.tier} onChange={set('tier')} style={SEL_STYLE}>
                <option value="">— Pilih tier —</option>
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FG>
            <FG label="Status">
              <select value={form.status} onChange={set('status')} style={SEL_STYLE}>
                {CUST_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FG>
            <FG label="Payment Terms">
              <select value={form.payment_terms_id} onChange={set('payment_terms_id')} style={SEL_STYLE}>
                <option value="">— Pilih —</option>
                {payTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FG>
            <FG label="Credit Limit">
              <input type="number" value={form.credit_limit} onChange={set('credit_limit')} placeholder="0" style={{ ...INP_STYLE, textAlign: 'right' }} />
            </FG>
            <FG label="Currency">
              <select value={form.currency_code} onChange={set('currency_code')} style={SEL_STYLE}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FG>
            <FG label="Assigned Salesperson">
              <select value={form.assigned_to} onChange={set('assigned_to')} style={SEL_STYLE}>
                <option value="">— Pilih —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </FG>
          </div>

          {/* Notes */}
          <div style={{ fontSize: 11, fontWeight: 700, color: D.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 5, borderBottom: `1px solid ${D.lineSoft}` }}>Notes</div>
          <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Catatan tambahan..." style={{ ...INP_STYLE, height: 'auto', padding: '9px 11px', resize: 'vertical' }} />

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, paddingTop: 16, borderTop: `1px solid ${D.lineSoft}` }}>
            <Btn onClick={onClose} disabled={saving}>Batal</Btn>
            <Btn primary onClick={handleSave} disabled={saving} icon={Save}>
              {saving ? 'Menyimpan…' : (initial?.id ? 'Simpan Perubahan' : 'Tambah Customer')}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main list page ───────────────────────────────────────────────────────────
// Per-entity header copy (entityFilter locks the list to one entity / free agent)
const ENTITY_HEADER = {
  MSI:        { title: 'Customer MSI', sub: 'Customer freight forwarding MSI' },
  JCI:        { title: 'Customer JCI', sub: 'Customer customs & PPJK JCI' },
  SOA:        { title: 'Customer SOA', sub: 'Customer trading Storbit' },
  FREE_AGENT: { title: 'Free Agent',   sub: 'Customer tidak terikat entitas' },
};

export default function CustomerListPage({ showToast, onSelectCustomer, entityFilter }) {
  const entityLocked = !!entityFilter;
  const headerMeta = ENTITY_HEADER[entityFilter] || null;
  const [customers,   setCustomers]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [rawSearch,   setRawSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCo,    setFilterCo]    = useState('all');
  const [filterTier,  setFilterTier]  = useState('all');
  const [formCustomer, setFormCustomer] = useState(null);
  const [formOpen,    setFormOpen]    = useState(false);

  const searchTimer = useRef(null);
  const [search, setSearch] = useState('');
  const handleSearch = (v) => {
    setRawSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const fetchCustomers = useCallback(async () => {
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
        .is('deleted_at', null)
        .order('name')
        .limit(1000);
      if (error) throw error;
      setCustomers(data || []);
    } catch {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .order('name')
        .limit(1000);
      setCustomers(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    if (q && !c.name?.toLowerCase().includes(q) && !c.legal_name?.toLowerCase().includes(q) && !c.code?.toLowerCase().includes(q)) return false;
    // Entity lock (from sub-menu): MSI/JCI/SOA by entitas, FREE_AGENT by status
    if (entityFilter === 'FREE_AGENT') {
      if ((c.status || (c.active === false ? 'inactive' : 'active')) !== 'free_agent') return false;
    } else if (entityFilter) {
      if (c.source_company?.code !== entityFilter) return false;
    }
    if (filterStatus !== 'all') {
      const key = c.status || (c.active === false ? 'inactive' : 'active');
      if (key !== filterStatus) return false;
    }
    if (!entityLocked && filterCo !== 'all' && c.source_company?.code !== filterCo) return false;
    if (filterTier !== 'all' && c.tier !== filterTier) return false;
    return true;
  });

  const activeCount   = customers.filter(c => (c.status || (c.active !== false ? 'active' : 'inactive')) === 'active').length;
  const inactiveCount = customers.filter(c => (c.status || (c.active !== false ? 'active' : 'inactive')) === 'inactive').length;

  const selStyle = {
    height: 34, borderRadius: 8, border: `1px solid ${D.line}`,
    background: D.surface, padding: '0 10px', fontSize: 12.5, color: D.ink,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: D.inkFaint, marginBottom: 8 }}>
            <span>CRM</span><span>›</span><span style={{ color: D.inkSoft, fontWeight: 600 }}>{headerMeta?.title || 'Master Customer'}</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: D.ink, fontFamily: "'Montserrat', sans-serif", letterSpacing: -.4 }}>{headerMeta?.title || 'Master Customer'}</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: D.inkSoft }}>
            {headerMeta?.sub
              ? <>{headerMeta.sub} · <b style={{ color: D.navy, fontWeight: 700 }}>{filtered.length}</b></>
              : <><b style={{ color: D.navy, fontWeight: 700 }}>{customers.length}</b> customer · {activeCount} aktif · {inactiveCount} tidak aktif</>}
          </p>
        </div>
        <Btn primary icon={Plus} onClick={() => { setFormCustomer({}); setFormOpen(true); }}>
          Tambah Customer
        </Btn>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total Customer', value: filtered.length, icon: Building2, color: D.navy },
          { label: 'Active',         value: filtered.filter(c => (c.status || (c.active !== false ? 'active' : 'inactive')) === 'active').length,   icon: Check,     color: D.ok },
          { label: 'Inactive',       value: filtered.filter(c => (c.status || (c.active !== false ? 'active' : 'inactive')) === 'inactive').length, icon: X,         color: D.warn },
          { label: 'Tier A',         value: filtered.filter(c => c.tier === 'A').length, icon: CreditCard, color: '#92400E' },
        ].map(s => (
          <div key={s.label} style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 10, padding: '12px 14px', boxShadow: D.shadowSm }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600 }}>{s.label}</span>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={14} strokeWidth={1.9} color={s.color} />
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -1, color: D.ink }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: D.inkFaint }} />
          <input value={rawSearch} onChange={e => handleSearch(e.target.value)} placeholder="Cari nama / legal / code…"
            style={{ ...INP_STYLE, height: 34, paddingLeft: 30 }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">Semua Status</option>
          {CUST_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {!entityLocked && (
          <select value={filterCo} onChange={e => setFilterCo(e.target.value)} style={selStyle}>
            <option value="all">Semua Entitas</option>
            {['MSI', 'JCI', 'SOA'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={selStyle}>
          <option value="all">Semua Tier</option>
          {TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: D.inkFaint, marginLeft: 'auto' }}>{filtered.length} hasil</span>
      </div>

      {/* Table */}
      <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: D.shadowSm }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <TH>Code</TH>
                <TH>Nama Perusahaan</TH>
                <TH>Legal Name</TH>
                <TH>Entitas</TH>
                <TH>PIC</TH>
                <TH>Tier</TH>
                <TH>Status</TH>
                <TH>Assigned To</TH>
                <TH>Dibuat</TH>
                <TH style={{ width: 44 }}></TH>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: D.inkFaint }}>Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: D.inkFaint }}>
                  {search || filterStatus !== 'all' || filterCo !== 'all' || filterTier !== 'all' ? 'Tidak ada customer yang sesuai filter.' : 'Belum ada data customer.'}
                </td></tr>
              ) : filtered.map((c, i) => {
                const statusKey = c.status || (c.active === false ? 'inactive' : 'active');
                return (
                  <tr key={c.id} onClick={() => onSelectCustomer?.(c.id)} style={{ background: i % 2 === 0 ? D.surface : D.surface2, cursor: 'pointer' }}>
                    <TD>
                      {c.code
                        ? <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 700, color: D.accent, background: D.accentSoft, padding: '2px 7px', borderRadius: 5 }}>{c.code}</span>
                        : <span style={{ color: D.inkFaint, fontSize: 12 }}>—</span>}
                    </TD>
                    <TD><span style={{ fontWeight: 600, color: D.ink }}>{c.name}</span></TD>
                    <TD style={{ color: D.inkSoft, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.legal_name || '—'}</TD>
                    <TD><CoBadge code={c.source_company?.code} /></TD>
                    <TD style={{ color: D.inkSoft }}>{c.pic_name || '—'}</TD>
                    <TD><TierBadge tier={c.tier} /></TD>
                    <TD><StatusBadge status={statusKey} active={c.active} /></TD>
                    <TD style={{ color: D.inkSoft }}>{c.assigned_profile?.full_name || '—'}</TD>
                    <TD style={{ color: D.inkFaint, fontSize: 12 }}>{fmtDate(c.created_at)}</TD>
                    <TD>
                      <button onClick={(e) => { e.stopPropagation(); onSelectCustomer?.(c.id); }} style={{ background: D.navySoft, border: `1px solid ${D.navy}20`, color: D.navy, borderRadius: 7, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Lihat detail">
                        <Eye size={13} strokeWidth={2} />
                      </button>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <CustomerFormModal
          initial={formCustomer}
          onClose={() => { setFormOpen(false); setFormCustomer(null); }}
          onSaved={() => { setFormOpen(false); setFormCustomer(null); fetchCustomers(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
