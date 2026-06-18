// src/modules/crm/CustomerListPage.jsx
// Master Customer — LIST page. Visual ported from Claude Design (Lovable) handoff
// (CustomerListPage.jsx — assets-it style: header → 4 stat cards → filter bar → table).
// Data layer UNCHANGED: real Supabase fetch, entityFilter, client-side filter,
// stat cards from `filtered`, row→onSelectCustomer, CustomerFormModal, ENTITY_HEADER.
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY = '#144682';
const ORANGE = '#E85A1E';
const SURFACE = '#FFFDF8';

// Warm-cream token set used by CustomerFormModal (preserved as-is).
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

// ─── Constants (form) ───────────────────────────────────────────────────────────
const CUSTOMER_TYPES = ['PT', 'CV', 'Mr.', 'Mrs.', 'Ms.', 'Other'];
const TIERS = ['A', 'B', 'C'];
const CUST_STATUSES = [
  { value: 'active',     label: 'Active'      },
  { value: 'inactive',   label: 'Inactive'    },
  { value: 'free_agent', label: 'Free Agent'  },
];
// Filter-bar options — must match accounts.account_status values
const STATUS_FILTERS = [
  { value: 'customer',   label: 'Customer'   },
  { value: 'free_agent', label: 'Free Agent' },
];
const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD'];

// ─── Lovable inline icons (lucide paths) ────────────────────────────────────────
const ICONS = {
  chevright: '<path d="m9 18 6-6-6-6"/>',
  chevdown:  '<path d="m6 9 6 6 6-6"/>',
  search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus:      '<path d="M5 12h14"/><path d="M12 5v14"/>',
  download:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  users:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  usercheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  award:     '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  usercog:   '<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><circle cx="19" cy="16" r="3"/><path d="m19.5 9.5.5.87M22 16h-1M16 16h-1M21.5 19.5l-.87-.5M17.37 18.13l-.87-.5M16.5 12.5l.87.5M21.63 13.87l.87.5"/>',
  eye:       '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  pencil:    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  info:      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};
function Ico({ name, size = 18, color, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color || 'currentColor'}
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }} />
  );
}

// ─── Tier / status / avatar config (from design) ────────────────────────────────
const TIER_CFG = {
  A: { label: 'Tier A', bg: '#F7EAC4', fg: '#8A6A12', dot: '#C9A227' },
  B: { label: 'Tier B', bg: '#ECEDF1', fg: '#6B7280', dot: '#9AA0AC' },
  C: { label: 'Tier C', bg: '#F1E1D2', fg: '#9A5B2C', dot: '#B0703C' },
};
const STATUS_CFG = {
  // accounts.account_status segments
  customer:   { label: 'Customer',   bg: '#DEF0E4', fg: '#1F8B4D', dot: '#1F8B4D' },
  prospect:   { label: 'Prospect',   bg: '#EAF0F8', fg: '#144682', dot: '#144682' },
  lost:       { label: 'Lost',       bg: '#FBE3E0', fg: '#B23227', dot: '#C0392B' },
  free_agent: { label: 'Free Agent', bg: '#FBE6DA', fg: '#C8521B', dot: '#E85A1E' },
  // legacy customers.status (fallback)
  active:     { label: 'Active',     bg: '#DEF0E4', fg: '#1F8B4D', dot: '#1F8B4D' },
  inactive:   { label: 'Inactive',   bg: '#EEF0F3', fg: '#9AA0AC', dot: '#B6BCC6' },
};
const PIC_COLORS = ['#2A5B8C', '#2F6B3F', '#9A5B2C', '#6B6F5E', '#7A4E8C', '#1F6B6B', '#A63A6B', '#234F86'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const initials = (s) =>
  ((s || '?').replace(/^PT\s+|^CV\s+/i, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()) || '?';
const colorFor = (s) => PIC_COLORS[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PIC_COLORS.length];
// accounts model: status comes from account_status (legacy customers.status fallback)
const statusOf = (c) => c.account_status || c.status || 'customer';

// ─── Style tokens (ported from design) ──────────────────────────────────────────
const P = {
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 18, flexWrap: 'wrap' },
  crumbs: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#A29684', marginBottom: 8 },
  crumbCur: { color: '#6E6353', fontWeight: 600 },
  title: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  sub: { fontSize: 13, color: '#857A68', marginTop: 4 },
  actions: { display: 'flex', alignItems: 'center', gap: 10 },
  outlineBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 11, border: '1px solid #DED3BF', background: SURFACE, color: '#4A5360', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 17px', borderRadius: 11, border: '1px solid ' + ORANGE, background: ORANGE, color: '#fff', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(232,90,30,.25), 0 6px 16px rgba(232,90,30,.18)' },

  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 18 },
  statCard: { background: SURFACE, border: '1px solid #ECE3D2', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 2px rgba(60,45,20,.04), 0 4px 14px rgba(60,45,20,.03)' },
  statTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 11, marginBottom: 12 },
  statLbl: { fontSize: 11.5, fontWeight: 600, color: '#857A68', letterSpacing: 0.1 },
  statIco: { width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 38px' },
  statVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 30, fontWeight: 800, color: '#16243A', letterSpacing: -0.8, lineHeight: 1 },
  statHint: { fontSize: 11.5, fontWeight: 500, color: '#A29684', marginTop: 6 },

  card: { background: SURFACE, border: '1px solid #ECE3D2', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(60,45,20,.04), 0 4px 14px rgba(60,45,20,.03)' },
  filterBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #F2E9D8', flexWrap: 'wrap' },
  searchWrap: { position: 'relative', flex: '1 1 280px', maxWidth: 380 },
  searchIco: { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#A29684', pointerEvents: 'none' },
  searchInput: { width: '100%', height: 40, borderRadius: 10, border: '1px solid #E3D8C4', background: '#fff', padding: '0 14px 0 40px', fontFamily: 'inherit', fontSize: 13.5, color: '#1A2330', boxSizing: 'border-box' },
  selectWrap: { position: 'relative', flex: '0 0 auto' },
  select: { height: 40, borderRadius: 10, border: '1px solid #E3D8C4', background: '#fff', padding: '0 36px 0 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#16243A', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' },
  selectChev: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#A29684', pointerEvents: 'none' },
  countLine: { marginLeft: 'auto', fontSize: 12.5, color: '#857A68', fontWeight: 500, whiteSpace: 'nowrap' },

  tableScroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 980 },
  th: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#A29684', background: '#FBF6EC', borderBottom: '1px solid #F0E7D6', padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '13px 16px', borderBottom: '1px solid #F4EDDF', fontSize: 12.5, color: '#1A2330', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  code: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 600, color: '#6B7280', letterSpacing: 0.2 },
  coCell: { display: 'flex', alignItems: 'center', gap: 11 },
  coAv: { width: 34, height: 34, borderRadius: 10, background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.2, flex: '0 0 34px' },
  coName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 700, fontSize: 13, color: '#16243A', letterSpacing: -0.1 },
  legal: { color: '#6B7280' },
  picCell: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  picAv: { width: 24, height: 24, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, flex: '0 0 24px' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, padding: '4px 10px 4px 8px', borderRadius: 20, whiteSpace: 'nowrap' },
  bdot: { width: 6, height: 6, borderRadius: '50%', flex: '0 0 6px' },
  terms: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11.5, fontWeight: 600, color: '#4A5360' },
  lastAct: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, color: '#857A68' },
  rowAct: { display: 'flex', alignItems: 'center', gap: 2 },
  actBtn: { width: 30, height: 30, borderRadius: 8, border: 0, background: 'transparent', color: '#9AA0AC', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
};

// ─── Badges (design style — dot + pill) ─────────────────────────────────────────
function TierBadge({ tier }) {
  if (!tier) return <span style={{ color: '#A29684', fontSize: 12 }}>—</span>;
  const t = TIER_CFG[tier] || TIER_CFG.B;
  return <span style={{ ...P.badge, background: t.bg, color: t.fg }}><span style={{ ...P.bdot, background: t.dot }} />{t.label}</span>;
}
function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.inactive;
  return <span style={{ ...P.badge, background: s.bg, color: s.fg }}><span style={{ ...P.bdot, background: s.dot }} />{s.label}</span>;
}
function StatCard({ label, value, hint, icon, iconBg, iconFg }) {
  return (
    <div style={P.statCard}>
      <div style={P.statTop}>
        <span style={P.statLbl}>{label}</span>
        <span style={{ ...P.statIco, background: iconBg, color: iconFg }}><Ico name={icon} size={19} /></span>
      </div>
      <div style={P.statVal}>{value}</div>
      {hint ? <div style={P.statHint}>{hint}</div> : null}
    </div>
  );
}

// ─── Table row (real data; row → detail, actions → view/edit) ───────────────────
function CustomerRow({ c, idx, onSelect, onEdit }) {
  const [h, setH] = useState(false);
  const zebra = idx % 2 === 1;
  const bg = h ? '#FBF4E6' : zebra ? '#FCF8F0' : 'transparent';
  const statusKey = statusOf(c);
  const lastAct = c.last_activity_at || c.updated_at || c.created_at;
  return (
    <tr onClick={() => onSelect(c.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: bg, transition: 'background .12s ease', cursor: 'pointer' }}>
      <td style={P.td}>{c.code ? <span style={P.code}>{c.code}</span> : <span style={{ color: '#A29684' }}>—</span>}</td>
      <td style={{ ...P.td, whiteSpace: 'normal', minWidth: 240 }}>
        <div style={P.coCell}>
          <span style={P.coAv}>{initials(c.name)}</span>
          <span style={P.coName}>{c.name}</span>
        </div>
      </td>
      <td style={{ ...P.td, ...P.legal, whiteSpace: 'normal', minWidth: 200 }}>{c.legal_name || '—'}</td>
      <td style={P.td}>
        {c.pic_name ? (
          <span style={P.picCell}>
            <span style={{ ...P.picAv, background: colorFor(c.pic_name) }}>{initials(c.pic_name)}</span>
            {c.pic_name}
          </span>
        ) : <span style={{ color: '#A29684' }}>—</span>}
      </td>
      <td style={P.td}><TierBadge tier={c.tier} /></td>
      <td style={P.td}><StatusBadge status={statusKey} /></td>
      <td style={P.td}><span style={P.terms}>{c.payment_term?.name || c.payment_terms || '—'}</span></td>
      <td style={P.td}><span style={P.lastAct}>{fmtDate(lastAct)}</span></td>
      <td style={{ ...P.td, width: 90 }}>
        <div style={P.rowAct}>
          <button type="button" className="cl-act" title="Lihat detail" style={P.actBtn} onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}><Ico name="eye" size={16} /></button>
          <button type="button" className="cl-act" title="Edit" style={P.actBtn} onClick={(e) => { e.stopPropagation(); onEdit(c); }}><Ico name="pencil" size={16} /></button>
        </div>
      </td>
    </tr>
  );
}

// ─── Input styles + form helpers (form modal) ───────────────────────────────────
const INP_STYLE = {
  width: '100%', height: 36, borderRadius: 8, border: `1px solid ${D.line}`,
  background: D.surface, padding: '0 11px', fontSize: 13, color: D.ink,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const SEL_STYLE = { ...INP_STYLE, cursor: 'pointer' };
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
function Btn({ children, primary, onClick, disabled, icon: Icon }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', border: `1px solid ${primary ? D.navy : D.line}`, background: primary ? D.navy : D.surface, color: primary ? '#fff' : D.ink, opacity: disabled ? .45 : 1 }}>
      {Icon && <Icon size={15} strokeWidth={1.9} />}
      {children}
    </button>
  );
}

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
      .from('accounts')
      .select('id, name')
      .ilike('name', nameVal.trim())
      .eq('account_status', 'customer')
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
        // accounts: status segment lives in account_status (form 'free_agent' → free_agent, else customer)
        account_status:   form.status === 'free_agent' ? 'free_agent' : 'customer',
        ...(form.tier        && { tier:        form.tier        }),
        ...(form.assigned_to && { assigned_to: form.assigned_to }),
      };

      let error;
      if (initial?.id) {
        ({ error } = await supabase.from('accounts').update(payload).eq('id', initial.id));
      } else {
        payload.company_id         = profile.company_id;
        payload.owner_company_id   = profile.company_id;
        payload.created_by         = profile.id;
        payload.account_status     = 'customer';
        payload.became_customer_at = new Date().toISOString();
        ({ error } = await supabase.from('accounts').insert(payload));
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

// Lightweight client-side CSV export of the currently-filtered rows.
function exportCsv(rows, filename) {
  const headers = ['Code', 'Nama', 'Legal Name', 'PIC', 'Tier', 'Status', 'Payment Terms', 'Last Activity'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(',')];
  rows.forEach(c => {
    lines.push([
      c.code, c.name, c.legal_name, c.pic_name, c.tier, statusOf(c),
      c.payment_term?.name || c.payment_terms, fmtDate(c.last_activity_at || c.updated_at || c.created_at),
    ].map(esc).join(','));
  });
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

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
    // Master Customer = accounts WHERE account_status='customer'; Free Agent view = 'free_agent'
    const statusFilter = entityFilter === 'FREE_AGENT' ? 'free_agent' : 'customer';
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          *,
          assigned_profile:profiles!prospects_assigned_to_fkey(full_name),
          source_company:companies!prospects_owner_company_id_fkey(name, code),
          payment_term:payment_terms!prospects_payment_terms_id_fkey(name)
        `)
        .eq('account_status', statusFilter)
        .is('deleted_at', null)
        .order('name')
        .limit(1000);
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      // The joined query can fail if an FK embed is missing/renamed; fall back to a
      // plain row fetch so the list still renders. Log the original error (not silent).
      console.error('[CustomerList] joined fetch failed, falling back to plain select:', err);
      const { data, error: fbErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('account_status', statusFilter)
        .is('deleted_at', null)
        .order('name')
        .limit(1000);
      if (fbErr) console.error('[CustomerList] fallback fetch also failed:', fbErr);
      setCustomers(data || []);
    } finally {
      setLoading(false);
    }
  }, [entityFilter]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    if (q && !c.name?.toLowerCase().includes(q) && !c.legal_name?.toLowerCase().includes(q) && !c.code?.toLowerCase().includes(q) && !c.pic_name?.toLowerCase().includes(q)) return false;
    // Entity lock (from sub-menu): MSI/JCI/SOA by entitas, FREE_AGENT by status
    if (entityFilter === 'FREE_AGENT') {
      if (statusOf(c) !== 'free_agent') return false;
    } else if (entityFilter) {
      if (c.source_company?.code !== entityFilter) return false;
    }
    if (filterStatus !== 'all' && statusOf(c) !== filterStatus) return false;
    if (!entityLocked && filterCo !== 'all' && c.source_company?.code !== filterCo) return false;
    if (filterTier !== 'all' && c.tier !== filterTier) return false;
    return true;
  });

  // Y for "Menampilkan X dari Y": customers passing the ENTITY filter only
  // (mirrors lines above), BEFORE search/tier/status — so it's per-entity, not global.
  const entityCount = customers.filter(c => {
    if (entityFilter === 'FREE_AGENT') return statusOf(c) === 'free_agent';
    if (entityFilter) return c.source_company?.code === entityFilter;
    return true;
  }).length;

  // Stat cards — computed from the filtered set
  const total      = filtered.length;
  const activeCnt  = filtered.filter(c => statusOf(c) === 'customer').length;
  const tierACnt   = filtered.filter(c => c.tier === 'A').length;
  const freeCnt    = filtered.filter(c => statusOf(c) === 'free_agent').length;

  const openAdd  = () => { setFormCustomer({}); setFormOpen(true); };
  const openEdit = (c) => { setFormCustomer(c); setFormOpen(true); };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#1A2330' }}>
      <style>{`
        .cl-primary:hover{filter:brightness(1.05);transform:translateY(-1px);}
        .cl-outline:hover{border-color:#C9BCA2;background:#FCF7EC;}
        .cl-act:hover{background:#F0E7D6;color:${NAVY};}
        select.cl-sel:focus,input.cl-inp:focus{outline:none;border-color:${NAVY};box-shadow:0 0 0 3px rgba(20,70,130,.10);}
        @media (max-width:860px){.cl-stats{grid-template-columns:repeat(2,1fr) !important;}}
      `}</style>

      {/* Header */}
      <div style={P.topRow}>
        <div>
          <nav style={P.crumbs}>
            <span>CRM</span><Ico name="chevright" size={13} />
            <span>Master Customer</span>
            {headerMeta && (<><Ico name="chevright" size={13} /><span style={P.crumbCur}>{headerMeta.title}</span></>)}
          </nav>
          <h1 style={P.title}>{headerMeta?.title || 'Master Customer'}</h1>
          <div style={P.sub}>
            {headerMeta?.sub ? `${headerMeta.sub} · ${total} customer terdaftar` : `${customers.length} customer terdaftar`}
          </div>
        </div>
        <div style={P.actions}>
          <button type="button" className="cl-outline" style={P.outlineBtn}
            onClick={() => { exportCsv(filtered, `customers_${entityFilter || 'all'}.csv`); showToast?.('Daftar customer di-export ✨'); }}>
            <Ico name="download" size={16} />Export
          </button>
          <button type="button" className="cl-primary" style={P.primaryBtn} onClick={openAdd}>
            <Ico name="plus" size={17} />Tambah Customer
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={P.statsRow} className="cl-stats">
        <StatCard label="Total Customer" value={total}     hint="customer terdaftar"     icon="users"     iconBg="#EAF0F8" iconFg={NAVY} />
        <StatCard label="Active"         value={activeCnt} hint={`dari ${total} customer`} icon="usercheck" iconBg="#DEF0E4" iconFg="#1F8B4D" />
        <StatCard label="Tier A"         value={tierACnt}  hint="customer prioritas"      icon="award"     iconBg="#F7EAC4" iconFg="#8A6A12" />
        <StatCard label="Free Agent"     value={freeCnt}   hint="tanpa entitas"           icon="usercog"   iconBg="#FBE6DA" iconFg="#C8521B" />
      </div>

      {/* Table card */}
      <div style={P.card}>
        {/* Filter bar */}
        <div style={P.filterBar}>
          <div style={P.searchWrap}>
            <span style={P.searchIco}><Ico name="search" size={16} /></span>
            <input className="cl-inp" style={P.searchInput} placeholder="Cari nama, legal name, code, PIC…"
              value={rawSearch} onChange={(e) => handleSearch(e.target.value)} />
          </div>
          <div style={P.selectWrap}>
            <select className="cl-sel" style={P.select} value={filterTier} onChange={(e) => setFilterTier(e.target.value)}>
              <option value="all">Semua Tier</option>
              {TIERS.map(t => <option key={t} value={t}>Tier {t}</option>)}
            </select>
            <span style={P.selectChev}><Ico name="chevdown" size={15} /></span>
          </div>
          {entityFilter !== 'FREE_AGENT' && (
            <div style={P.selectWrap}>
              <select className="cl-sel" style={P.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">Semua Status</option>
                {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span style={P.selectChev}><Ico name="chevdown" size={15} /></span>
            </div>
          )}
          {!entityLocked && (
            <div style={P.selectWrap}>
              <select className="cl-sel" style={P.select} value={filterCo} onChange={(e) => setFilterCo(e.target.value)}>
                <option value="all">Semua Entitas</option>
                {['MSI', 'JCI', 'SOA'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={P.selectChev}><Ico name="chevdown" size={15} /></span>
            </div>
          )}
          <span style={P.countLine}>Menampilkan {total} dari {entityCount}</span>
        </div>

        {/* Table */}
        <div style={P.tableScroll}>
          <table style={P.table}>
            <thead>
              <tr>
                <th style={P.th}>Customer Code</th>
                <th style={P.th}>Nama Perusahaan</th>
                <th style={P.th}>Legal Name</th>
                <th style={P.th}>PIC Name</th>
                <th style={P.th}>Tier</th>
                <th style={P.th}>Status</th>
                <th style={P.th}>Payment Terms</th>
                <th style={P.th}>Last Activity</th>
                <th style={{ ...P.th, width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...P.td, textAlign: 'center', padding: '48px 16px', color: '#A29684' }}>Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ ...P.td, textAlign: 'center', padding: '48px 16px', color: '#A29684' }}>
                  {search || filterStatus !== 'all' || filterCo !== 'all' || filterTier !== 'all' ? 'Tidak ada customer yang cocok dengan filter.' : 'Belum ada data customer.'}
                </td></tr>
              ) : (
                filtered.map((c, i) => (
                  <CustomerRow key={c.id} c={c} idx={i} onSelect={(id) => onSelectCustomer?.(id)} onEdit={openEdit} />
                ))
              )}
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
