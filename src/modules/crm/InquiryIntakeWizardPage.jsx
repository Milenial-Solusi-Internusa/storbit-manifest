// src/modules/crm/InquiryIntakeWizardPage.jsx
// Inquiry Management Putaran 4 — Tahap 4B. Wizard "Intake Form" untuk membuat
// inquiry BARU, Single Shipment saja (Rate Sheet Request = Tahap 4C, belum
// dibangun). CREATE-ONLY — InquiryFormPage.jsx TETAP satu-satunya halaman
// untuk EDIT (mode='edit'), tidak disentuh di sini.
//
// Kontrak: design-handoff/mockup/Inquiry Management.dc.html (kutipan baris
// di komentar tiap bagian) + nexus-notes.js + crm-metrics.js. Urutan langkah
// (SK) dan nama field mengikuti mockup; token visual (navy/orange/cream,
// Montserrat/Inter/IBM Plex Mono) mengikuti InquiryFormPage.jsx — CRM belum
// migrasi kit sage, token diduplikasi lokal (pola sama DealDetailPage.jsx/
// dealOverviewFieldInputs.jsx), bukan diimpor dari file lain (rule "jangan
// refactor file lain").
//
// Penulisan HANYA lewat RPC create_inquiry_with_lanes (migrasi
// 20261025000001-5, Tahap 4A, LIVE staging) — nol INSERT langsung ke
// inquiries/inquiry_lanes dari sini.
//
// Props: prefillAccountId, prefillContactId, onBack (Cancel → daftar),
// onCreated(id) (sukses → Detail Inquiry), showToast.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronLeft, ChevronRight, X, Check, Anchor, MapPin,
  AlertTriangle, Ship, Shield, Home, Truck, Plus, Trash2, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import { isSuperAdmin, isManagerOrAbove } from '../../lib/roles';
import { readMoneyInput, formatIdNumber } from '../../lib/numberFormat';
import AccountPicker from '../../components/AccountPicker';
import LocationPicker from '../../kit/LocationPicker';
import { fetchOperationalRoster } from './salesRoster';
import { CARGO_TYPES, SERVICES, INCOTERMS, CONTAINER_TYPES, IMO_CLASSES, MSDS_OPTS } from './inquiryOptions';

// ── Token (duplikasi sadar dari InquiryFormPage.jsx — CRM belum migrasi kit) ──
const C = {
  navy: '#1B4D8A', navyDark: '#0F3768', navySoft: '#EEF3FB',
  orange: '#E85A1E', orangeDark: '#C94D18', orangeSoft: '#FDF0E9',
  pageBg: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderStrong: '#CBD5E1',
  text: '#0F172A', sub: '#475569', muted: '#94A3B8',
  success: '#16A34A', warning: '#F59E0B', error: '#DC2626',
};
const LOCATION_PICKER_TOKENS = {
  bg: '#F8FAFC', card: C.card, border: C.border, text: C.text, textMute: C.sub,
  placeholder: C.muted, hover: C.navySoft, divider: C.border,
  warnBg: '#FEF9E7', warnBorder: '#F2D675', warnText: '#92700A',
};

// Fallback FE (dropdown_options list_key='service_type' punya 6 baris sejak
// Tahap 4A — fallback ini hanya menyala kalau fetch gagal/kosong). 'trading'
// (General Trading) SENGAJA tetap ada di sini (nilainya valid, InquiryFormPage.jsx
// lama tetap memakainya) tapi DISARING saat render kartu di bawah — GT tidak
// dibangun di wizard ini (lingkup 4C/di luar Putaran 4 sama sekali untuk Items/
// Delivery). "HAL YANG TIDAK BOLEH DISENTUH" #2 — ini KONSTANTA LOKAL baru,
// bukan SERVICE_TYPES_FALLBACK milik InquiryFormPage/InquiryClassificationPage
// yang tidak disentuh sama sekali.
const SERVICE_TYPES_FALLBACK = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs', label: 'Customs Clearance' },
  { value: 'door_to_door', label: 'Door to Door' },
  { value: 'trucking', label: 'Trucking' },
  { value: 'trading', label: 'General Trading' },
];
const SERVICE_ICON = {
  freight_forwarding: Ship, customs: Shield, door_to_door: Home, trucking: Truck,
};
const LANE_MODE_FALLBACK = [{ value: 'Sea LCL', label: 'Sea LCL' }, { value: 'Sea FCL', label: 'Sea FCL' }, { value: 'Air', label: 'Air' }];
const LANE_UNIT_FALLBACK = [{ value: 'CBM', label: 'CBM' }, { value: 'Container', label: 'Container' }, { value: 'KG', label: 'KG' }, { value: 'Ton', label: 'Ton' }];
const IMPORTER_OF_RECORD_FALLBACK = [
  { value: 'PT Mitra Niaga Sejahtera', label: 'PT Mitra Niaga Sejahtera' },
  { value: 'PT Sentra Impor Nusantara', label: 'PT Sentra Impor Nusantara' },
];
// Duties & Taxes / Pricing Basis / Customer Role / Direction — opsi TETAP di
// DB (CHECK constraint, migrasi 20261025000002), bukan dropdown_options.
// Hardcode lokal di sini sama seperti INCOTERMS/CONTAINER_TYPES/MSDS_OPTS
// (inquiryOptions.js) — bukan field yang dipakai InquiryFormPage/DealDetailPage
// hari ini, jadi tidak ditambahkan ke file bersama itu (scope creep).
const DUTIES_AND_TAXES_OPTS = ['Included in price', 'Billed separately as per receipt'];
const PRICING_BASIS_OPTS = ['Itemized charges', 'All in per CBM', 'All in per KG'];
const CUSTOMER_ROLE_OPTS = ['Shipper', 'Consignee', 'Third Party'];
const DIRECTION_OPTS = ['Import', 'Export', 'Domestic'];

const PRA_CUSTOMER_STATUS = ['lead', 'mql', 'sql', 'prospect', 'lead_pool'];
const CUSTOMER_SIDE_STATUS = ['customer', 'free_agent'];
const LIFECYCLE_LABEL = { lead: 'Lead', mql: 'MQL', sql: 'SQL', prospect: 'Prospect', lead_pool: 'Lead Pool', customer: 'Customer', free_agent: 'Free Agent' };
const lifecycleLabel = (s) => LIFECYCLE_LABEL[s] || s || '';

// ── Urutan langkah (mockup baris 763-764, SK) ──────────────────────────────
const STEPS_DOOR_TO_DOOR = ['cust', 'svc', 'route', 'cargo', 'customs', 'commercial', 'review'];
const STEPS_DEFAULT = ['cust', 'svc', 'route', 'cargo', 'addl', 'commercial', 'review'];
const STEP_LABEL = {
  cust: 'Customer & Contact', svc: 'Service & Direction', route: 'Route & Terms', cargo: 'Cargo',
  addl: 'Additional Services', customs: 'Customs & Undername', commercial: 'Commercial', review: 'Review',
};

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '4px 0 8px', fontFamily: "'Inter',system-ui,sans-serif", color: C.text },
  headerCard: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: '22px 26px', marginBottom: 18 },
  hTitle: { fontFamily: "'Montserrat',sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: -0.6, color: C.text, margin: 0, lineHeight: 1.1 },
  hSub: { fontSize: 14, color: C.sub, marginTop: 7 },
  pillBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  card: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 18, overflow: 'hidden' },
  secBody: { padding: 28 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.35 },
  req: { color: C.orange, fontWeight: 800 },
  input: { height: 44, borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box' },
  textarea: { borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.55 },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 26px', borderRadius: 10, border: '1px solid ' + C.orange, background: C.orange, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(232,90,30,.35)' },
  btnGhost: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 10, border: '1px solid ' + C.navy, background: '#fff', color: C.navy, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer' },
};
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '18px 20px' };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px 16px' };
const selInput = { ...S.input, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' };

function Field({ label, required, span, children, hint }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : 'auto' }}>
      <div style={S.label}>{label}{required && <span style={S.req}>*</span>}</div>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: C.muted, marginTop: 5, display: 'block' }}>{hint}</span>}
    </div>
  );
}
function FieldError({ children }) {
  if (!children) return null;
  return <span style={{ fontSize: 12, color: C.error, marginTop: 5, display: 'block' }}>{children}</span>;
}
function Pill({ active, onClick, children, invalid }) {
  return (
    <button type="button" onClick={onClick}
      style={{ height: 44, borderRadius: 10, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid ' + (active ? C.navy : invalid ? C.warning : C.border), background: active ? C.navy : '#fff', color: active ? '#fff' : C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {active && <Check size={15} />}{children}
    </button>
  );
}
function ServiceCard({ icon: Icon, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ borderRadius: 12, padding: '18px 14px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (active ? C.orange : C.border), background: active ? C.orangeSoft : '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? '#fff' : '#F1F5F9', color: active ? C.orange : C.sub }}>{Icon && <Icon size={20} />}</span>
      <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5, color: active ? C.orangeDark : C.text, textAlign: 'center', lineHeight: 1.25 }}>{label}</span>
    </button>
  );
}
function CargoCard({ item, active, onClick }) {
  const I = item.Icon;
  return (
    <button type="button" onClick={onClick}
      style={{ textAlign: 'left', borderRadius: 12, padding: '16px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (active ? C.navy : C.border), background: active ? C.navySoft : '#fff', display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, flex: '0 0 38px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? C.navy : '#F1F5F9', color: active ? '#fff' : C.sub }}><I size={19} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: active ? C.navy : C.text, lineHeight: 1.25 }}>{item.label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>{item.desc}</span>
      </span>
    </button>
  );
}
function TagCard({ item, active, onClick }) {
  const I = item.Icon;
  return (
    <button type="button" onClick={onClick}
      style={{ borderRadius: 12, padding: '18px 14px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (active ? C.orange : C.border), background: active ? C.orangeSoft : '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? '#fff' : '#F1F5F9', color: active ? C.orange : C.sub }}><I size={20} /></span>
      <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5, color: active ? C.orangeDark : C.text, textAlign: 'center', lineHeight: 1.25 }}>{item.label}</span>
    </button>
  );
}
function RadioPill({ value, current, onClick, children }) {
  const active = value === current;
  return (
    <button type="button" onClick={onClick}
      style={{ height: 40, padding: '0 18px', borderRadius: 999, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5, cursor: 'pointer', border: '1px solid ' + (active ? C.navy : C.border), background: active ? C.navy : '#fff', color: active ? '#fff' : C.sub, display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid ' + (active ? '#fff' : C.borderStrong), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 14px' }}>
        {active && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
      </span>{children}
    </button>
  );
}
function Chevron() { return <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span>; }

// ── mode-default load unit, meniru modeOf()/startLanes mockup (baris 949):
// Sea FCL -> Container, selain itu CBM. ───────────────────────────────────
const unitForMode = (mode) => (mode === 'Sea FCL' ? 'Container' : 'CBM');
const blankLane = (seed = {}) => ({
  pol_location_id: seed.pol_location_id ?? null, pod_location_id: seed.pod_location_id ?? null,
  via_location_id: null, pol: seed.pol ?? '', pod: seed.pod ?? '', via: '',
  mode: 'Sea LCL', load_unit: unitForMode('Sea LCL'),
});

export default function InquiryIntakeWizardPage({ prefillAccountId = null, prefillContactId = null, onBack, onCreated, showToast }) {
  const { profile, erpRole, erpRoles, user } = useAuth();
  const navigate = useNavigate();
  const { options: serviceTypeOptsRaw } = useDropdownOptions('service_type', SERVICE_TYPES_FALLBACK);
  // Kartu 'trading' (General Trading) DISEMBUNYIKAN di wizard ini — GT tetap
  // dibuat lewat InquiryFormPage.jsx lama (deviasi #2 PLAN, di luar lingkup
  // Putaran 4 sama sekali: Items table/Delivery step/price-list auto-calc).
  // 'warehousing' DISEMBUNYIKAN juga (review fix 6) -- bukan kartu Service
  // Type di mockup sama sekali (hanya tag di Additional Services, SERVICES
  // id='warehouse' -- konsep berbeda). dropdown_options tidak disentuh.
  const serviceTypeOpts = useMemo(() => serviceTypeOptsRaw.filter((o) => o.value !== 'trading' && o.value !== 'warehousing'), [serviceTypeOptsRaw]);
  const { options: laneModeOpts } = useDropdownOptions('lane_mode', LANE_MODE_FALLBACK);
  const { options: laneUnitOpts } = useDropdownOptions('lane_unit', LANE_UNIT_FALLBACK);
  const { options: iorOpts } = useDropdownOptions('importer_of_record', IMPORTER_OF_RECORD_FALLBACK);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [sourceType, setSourceType] = useState('prospect');
  const [prospects, setProspects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [prospectText, setProspectText] = useState('');
  const [customerText, setCustomerText] = useState('');
  const [contactsFor, setContactsFor] = useState({ accountId: null, list: [] });
  const [accountSource, setAccountSource] = useState(''); // accounts.source — read-only display

  const [f, setF] = useState({
    prospect_id: '', customer_id: '', contact_id: '',
    service_type: '', direction: '', customer_role: '',
    undername_import: false, importer_of_record: '', duties_and_taxes: '', supporting_docs_received: false,
    pricing_basis: '',
    pol_location_id: null, pod_location_id: null, pol: '', pod: '',
    laneMode: false, lanes: [],
    incoterms: [], container_types: [], n_containers: '', cargo_ready_date: '',
    pickup_address: '', delivery_address: '',
    goods_name: '', hs_code: '', weight_kg: '', volume_cbm: '', dimension: '',
    cargo_types: [], un_number: '', imo_class: '', has_msds: '',
    additional_services: [],
    deadline_quote: '', estimated_value: '', owner_id: null, notes: '',
    duplicate_warning_reason: '',
  });
  const [directionTouched, setDirectionTouched] = useState(false);
  // Review fix 2 (TD-285) -- Estimated Value/Total Weight/Volume: SATU field
  // dipakai utk tampilan DAN kirim (pola CaptureLeadModal.jsx, bukan buffer
  // teks terpisah ala InputSPPage.jsx -- field ini WAJIB memblokir Create
  // kalau tak terbaca, beda dari pola SP yang membiarkan 0 tersimpan).
  // Format ulang HANYA saat blur, bukan live -- mengetik "1.500.000" apa
  // adanya sampai user pindah field.
  const [weightUnrecognized, setWeightUnrecognized] = useState(false);
  const [volumeUnrecognized, setVolumeUnrecognized] = useState(false);
  const [estValUnrecognized, setEstValUnrecognized] = useState(false);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleArr = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const handleWeightChange = (v) => { setF((x) => ({ ...x, weight_kg: v })); setWeightUnrecognized(readMoneyInput(v).unrecognized); };
  const handleWeightBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.weight_kg);
    if (unrecognized) return;
    setF((x) => ({ ...x, weight_kg: x.weight_kg.trim() === '' ? '' : formatIdNumber(value) }));
  };
  const handleVolumeChange = (v) => { setF((x) => ({ ...x, volume_cbm: v })); setVolumeUnrecognized(readMoneyInput(v).unrecognized); };
  const handleVolumeBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.volume_cbm);
    if (unrecognized) return;
    setF((x) => ({ ...x, volume_cbm: x.volume_cbm.trim() === '' ? '' : formatIdNumber(value) }));
  };
  const handleEstValChange = (v) => { setF((x) => ({ ...x, estimated_value: v })); setEstValUnrecognized(readMoneyInput(v).unrecognized); };
  const handleEstValBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.estimated_value);
    if (unrecognized) return;
    setF((x) => ({ ...x, estimated_value: x.estimated_value.trim() === '' ? '' : formatIdNumber(value) }));
  };
  // n_containers -- integer (p_n_containers RPC), digit saja, nol titik/koma.
  const handleNContainersChange = (e) => setF((x) => ({ ...x, n_containers: e.target.value.replace(/\D/g, '') }));

  const isDoorToDoor = f.service_type === 'door_to_door';
  const SK = isDoorToDoor ? STEPS_DOOR_TO_DOOR : STEPS_DEFAULT;
  // service_type bisa berubah SETELAH user sudah lebih jauh dari langkah
  // svc (mis. balik dari Cargo) — step tidak pernah dibiarkan lewat batas.
  const stepIdx = Math.min(step, SK.length);
  const stepKey = SK[stepIdx - 1];

  const dgSelected = f.cargo_types.includes('dg');
  // mockup req.nCont (baris 759): wajib bila ADA tipe kontainer "/^FCL/",
  // BUKAN bila ada lane bermode "Sea FCL" (dua field berbeda — lane.mode vs
  // container_types — ikut mockup, bukan bacaan literal instruksi; dicatat
  // sebagai klarifikasi di laporan, bukan dibangun dua kali).
  const needsNContainers = f.container_types.some((c) => /^FCL/.test(c));

  // ── Akun: prospect/customer — pola diwarisi InquiryFormPage.jsx apa adanya
  // (dua daftar ber-lifecycle-stage berbeda, is_in_lead_pool=false) — mockup
  // hanya punya SATU picker akun generik; dipertahankan karena ini konvensi
  // app yang sudah ada (RLS/lead-pool), bukan preferensi visual, deviasi
  // dicatat di laporan. `source` ditambahkan ke select (task 7, read-only). ──
  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('accounts').select('id, name, lifecycle_stage, source').eq('company_id', profile.company_id).in('lifecycle_stage', PRA_CUSTOMER_STATUS).eq('is_in_lead_pool', false).is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setProspects(data || []));
    supabase.from('accounts').select('id, name, lifecycle_stage, source').eq('company_id', profile.company_id).in('lifecycle_stage', CUSTOMER_SIDE_STATUS).eq('is_in_lead_pool', false).is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setCustomers(data || []));
  }, [profile?.company_id]);

  const [locations, setLocations] = useState([]);
  useEffect(() => {
    supabase.from('locations').select('id, code, name, country, type, active').order('name').limit(1000)
      .then(({ data }) => setLocations(data || []));
  }, []);
  const canManageLocations = isSuperAdmin(erpRoles);
  const openLocationMaster = () => navigate('/admin-settings/locations');
  const requestNewLocation = (name, note) => {
    supabase.rpc('request_new_location', { p_name: name, p_note: note }).then(({ error }) => {
      showToast?.(error ? 'Failed to send request: ' + error.message : 'Request sent to managers.', error ? 'error' : 'success');
    });
  };

  const resolvedAccountId = sourceType === 'prospect' ? f.prospect_id : f.customer_id;
  const contactsLoaded = contactsFor.accountId === resolvedAccountId;
  const contacts = contactsLoaded ? contactsFor.list : [];

  // ── Prefill dari "+ New Inquiry" (Detail Account/Lead) — pola IDENTIK
  // InquiryFormPage.jsx (sama guard is_in_lead_pool, sama injeksi ke daftar). ──
  useEffect(() => {
    if (!prefillAccountId) return undefined;
    let cancelled = false;
    supabase.from('accounts').select('id, name, lifecycle_stage, is_in_lead_pool, source')
      .eq('id', prefillAccountId).is('deleted_at', null).maybeSingle()
      .then(({ data: acc }) => {
        if (cancelled || !acc) return;
        if (acc.is_in_lead_pool) {
          showToast?.('This account is in the Lead Pool and must be assigned before an inquiry can be created.', 'error');
          return;
        }
        const isCustomerSide = CUSTOMER_SIDE_STATUS.includes(acc.lifecycle_stage);
        const opt = { id: acc.id, name: acc.name, lifecycle_stage: acc.lifecycle_stage, source: acc.source };
        setSourceType(isCustomerSide ? 'customer' : 'prospect');
        if (isCustomerSide) {
          setCustomers((prev) => (prev.some((c) => c.id === acc.id) ? prev : [opt, ...prev]));
          setCustomerText(acc.name);
        } else {
          setProspects((prev) => (prev.some((p) => p.id === acc.id) ? prev : [opt, ...prev]));
          setProspectText(acc.name);
        }
        setAccountSource(acc.source || '');
        setF((x) => ({
          ...x,
          prospect_id: isCustomerSide ? '' : acc.id,
          customer_id: isCustomerSide ? acc.id : '',
          contact_id: prefillContactId || x.contact_id,
        }));
      });
    return () => { cancelled = true; };
  }, [prefillAccountId, prefillContactId, showToast]);

  // ── Kontak akun terpilih — pola IDENTIK InquiryFormPage.jsx. ──────────────
  useEffect(() => {
    if (!resolvedAccountId) return undefined;
    let cancelled = false;
    supabase.from('contacts').select('id, name, position, is_primary, is_active')
      .eq('account_id', resolvedAccountId).is('deleted_at', null)
      .order('is_primary', { ascending: false }).order('name').limit(1000)
      .then(({ data }) => {
        if (cancelled) return;
        const list = data || [];
        setContactsFor({ accountId: resolvedAccountId, list });
        setF((x) => {
          if (x.contact_id) return x;
          const auto = list.find((c) => c.is_primary) || (list.length === 1 ? list[0] : null);
          return auto ? { ...x, contact_id: auto.id } : x;
        });
      });
    return () => { cancelled = true; };
  }, [resolvedAccountId]);

  // Source read-only (task 7) — ikut akun yang dipilih manual lewat picker
  // (bukan hanya jalur prefill di atas).
  useEffect(() => {
    let cancelled = false;
    const list = sourceType === 'prospect' ? prospects : customers;
    const acc = list.find((a) => a.id === resolvedAccountId);
    // setState dijadwalkan lewat setTimeout (pola sama InquiryFormPage.jsx
    // possible-duplicate effect) — menghindari setState sinkron di badan
    // effect (react-hooks/set-state-in-effect).
    const t = setTimeout(() => { if (!cancelled) setAccountSource(acc?.source || ''); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [resolvedAccountId, sourceType, prospects, customers]);

  // ── Direction auto-suggest (lane pertama yang terkirim — mockup PLAN
  // addendum §B.5): trim+lowercase dibanding 'indonesia'. Berhenti menimpa
  // begitu user menyentuh Direction manual (directionTouched). ─────────────
  const primaryPolLoc = f.laneMode ? f.lanes[0]?.pol_location_id : f.pol_location_id;
  const primaryPodLoc = f.laneMode ? f.lanes[0]?.pod_location_id : f.pod_location_id;
  useEffect(() => {
    if (directionTouched) return undefined;
    const pol = locations.find((l) => l.id === primaryPolLoc);
    const pod = locations.find((l) => l.id === primaryPodLoc);
    if (!pol || !pod) return undefined; // lokasi belum lengkap/negara tak diketahui — tidak menyarankan
    const polID = (pol.country || '').trim().toLowerCase() === 'indonesia';
    const podID = (pod.country || '').trim().toLowerCase() === 'indonesia';
    let suggestion = null;
    if (polID && podID) suggestion = 'Domestic';
    else if (polID && !podID) suggestion = 'Export';
    else if (!polID && podID) suggestion = 'Import';
    if (!suggestion) return undefined;
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) setF((x) => ({ ...x, direction: suggestion })); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [primaryPolLoc, primaryPodLoc, locations, directionTouched]);
  const pickDirection = (v) => { setDirectionTouched(true); setF((x) => ({ ...x, direction: v })); };

  // ── Possible Duplicate — lane pertama yang dipakai + container_types.
  // Mockup crm-metrics.js baris 82-85 (C.contOf/C.lane): hasil KOSONG bila
  // container_types kosong — ditiru persis (RPC Postgres sendiri sebenarnya
  // akan membandingkan NULL/[] sebagai setara, tapi FE sengaja TIDAK memanggil
  // RPC sama sekali di sini supaya perilakunya identik mockup, bukan lebih
  // permisif — deviasi dicatat di laporan). ─────────────────────────────────
  const [possibleDuplicates, setPossibleDuplicates] = useState([]);
  const [dupCheckLoading, setDupCheckLoading] = useState(false);
  const containerTypesKey = f.container_types.join(',');
  // Review fix 4 -- duplicate_warning_reason dikosongkan SETIAP kali input
  // yang menentukan "situasi duplikat ini" berubah (akun/lane/container di
  // deps effect ini), bukan hanya saat daftarnya jadi kosong. Pindah rute
  // lalu balik ke daftar duplikat yang BERBEDA tetap butuh alasan baru --
  // alasan lama untuk situasi lama tidak boleh ikut terkirim diam-diam.
  const clearStaleDupReason = () => setF((x) => (x.duplicate_warning_reason ? { ...x, duplicate_warning_reason: '' } : x));
  useEffect(() => {
    let cancelled = false;
    if (!profile?.company_id || !resolvedAccountId || !primaryPolLoc || !primaryPodLoc || !f.container_types.length) {
      const t = setTimeout(() => { if (!cancelled) { setPossibleDuplicates([]); clearStaleDupReason(); } }, 0);
      return () => { cancelled = true; clearTimeout(t); };
    }
    const loadingTimer = setTimeout(() => { if (!cancelled) setDupCheckLoading(true); }, 0);
    const timer = setTimeout(() => {
      supabase.rpc('find_possible_duplicate_inquiries', {
        p_company_id: profile.company_id,
        p_customer_id: resolvedAccountId,
        p_pol_location_id: primaryPolLoc,
        p_pod_location_id: primaryPodLoc,
        p_container_types: f.container_types,
        p_exclude_id: null,
      }).then(({ data, error }) => {
        if (cancelled) return;
        setDupCheckLoading(false);
        setPossibleDuplicates(error ? [] : (data || []));
        clearStaleDupReason();
      });
    }, 500);
    return () => { cancelled = true; clearTimeout(loadingTimer); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, resolvedAccountId, primaryPolLoc, primaryPodLoc, containerTypesKey]);

  // ── Owner — manager-ke-atas lihat roster + "Leave unassigned"; sales tidak
  // lihat kontrolnya sama sekali (default diri sendiri, ditegakkan RPC). ────
  const canPickOwner = isManagerOrAbove(erpRoles);
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    if (!canPickOwner || !profile?.company_id) return;
    let cancelled = false;
    fetchOperationalRoster(profile.company_id).then((r) => { if (!cancelled) setRoster(r); });
    return () => { cancelled = true; };
  }, [canPickOwner, profile?.company_id]);

  // ── Lane table (laneMode) — mockup startLanes baris 949: dua baris awal
  // mewarisi POL (dan Via/Mode) dari pasangan POL/POD yang sudah terisi. ────
  const startLanes = () => {
    setF((x) => ({
      ...x,
      laneMode: true,
      lanes: x.lanes.length ? x.lanes : [
        blankLane({ pol_location_id: x.pol_location_id, pol: x.pol, pod_location_id: x.pod_location_id, pod: x.pod }),
        blankLane({ pol_location_id: x.pol_location_id, pol: x.pol }),
      ],
    }));
  };
  const addLane = () => setF((x) => {
    const last = x.lanes[x.lanes.length - 1];
    return { ...x, lanes: [...x.lanes, blankLane({ pol_location_id: last?.pol_location_id, pol: last?.pol, pod_location_id: last?.pod_location_id, pod: last?.pod })] };
  });
  const updateLane = (i, patch) => setF((x) => ({ ...x, lanes: x.lanes.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const removeLane = (i) => setF((x) => ({ ...x, lanes: x.lanes.filter((_, j) => j !== i) }));

  // ── Validasi — Direction WAJIB tapi TIDAK memblokir Next (deviasi kecil
  // dari mockup: mockup sendiri juga tidak pernah memblokir Next untuk ini,
  // tapi saat gagal di Create ia hanya pindah ke Review lalu membiarkan user
  // mencari sendiri; di sini kami lompat ke LANGKAH PERTAMA yang error —
  // perbaikan UX kecil, dicatat sebagai deviasi). ───────────────────────────
  const stepErrors = () => {
    const e = {};
    if (sourceType === 'prospect' ? !f.prospect_id : !f.customer_id) e.cust_account = 'Select a customer or prospect';
    if (!f.service_type) e.svc_service_type = 'Service Type is required';
    if (!f.direction) e.svc_direction = 'Direction is required';
    if (!f.customer_role) e.svc_customer_role = 'Customer Role is required';
    const undernameActive = f.direction === 'Import' && ['customs', 'door_to_door'].includes(f.service_type) && f.undername_import;
    if (undernameActive) {
      if (!f.importer_of_record) e.under_ior = 'Importer of Record is required';
      // Review fix 1 -- divalidasi juga di sini (bukan hanya bergantung pada
      // default yang di-set saat checkbox dicentang) supaya kombinasi mana
      // pun yang membuat duties_and_taxes kosong tetap tertangkap sebelum
      // RPC/CHECK inquiries_undername_docs_check menolaknya.
      if (!f.duties_and_taxes) e.under_duties = 'Duties & Taxes is required';
      if (!f.supporting_docs_received) e.under_docs = 'Supporting documents must be confirmed received';
    }
    const laneRows = f.laneMode ? f.lanes : [{ pol_location_id: f.pol_location_id, pod_location_id: f.pod_location_id }];
    if (!laneRows.length || laneRows.some((l) => !l.pol_location_id || !l.pod_location_id)) {
      e.route_lanes = 'Every lane needs a Port of Loading and Port of Discharge';
    }
    if (needsNContainers && !(Number(f.n_containers) > 0)) e.route_ncont = 'Number of containers is required for FCL';
    if (possibleDuplicates.length > 0 && !f.duplicate_warning_reason.trim()) {
      e.route_dup = 'Required when a possible duplicate is shown';
    }
    // Review fix 2 (TD-285) -- angka tak terbaca MEMBLOKIR Create (pola
    // CaptureLeadModal.jsx), bukan diam-diam terkirim null.
    if (weightUnrecognized) e.cargo_weight = 'Angka tidak dikenali';
    if (volumeUnrecognized) e.cargo_volume = 'Angka tidak dikenali';
    if (estValUnrecognized) e.commercial_estval = 'Angka tidak dikenali';
    return e;
  };
  // Pemetaan error -> langkah (urutan SK), untuk "lompat ke step pertama yang error".
  const errorStepKey = (key) => {
    if (key === 'cust_account') return 'cust';
    if (key.startsWith('svc_')) return 'svc';
    if (key.startsWith('under_')) return isDoorToDoor ? 'customs' : 'svc';
    if (key.startsWith('route_')) return 'route';
    if (key.startsWith('cargo_')) return 'cargo';
    if (key.startsWith('commercial_')) return 'commercial';
    return 'review';
  };

  const handleCreate = async () => {
    const e = stepErrors();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      const firstKey = Object.keys(e)[0];
      const target = errorStepKey(firstKey);
      const idx = SK.indexOf(target);
      setStep(idx >= 0 ? idx + 1 : 1);
      showToast?.('Please complete the required fields first.', 'error');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // Review fix 3 -- mode/load_unit lane TUNGGAL (laneMode mati) diturunkan
      // dari container_types, PERSIS modeOf() mockup (baris 743:
      // "(f.cont||[]).some(c => c.indexOf('FCL')===0) ? 'Sea FCL' : 'Sea LCL'")
      // dan unit-nya startLanes baris 949 ("Sea FCL" -> 'Container' else 'CBM')
      // -- sebelumnya di-hardcode 'Sea LCL'/'CBM' walau user memilih FCL.
      const singleLaneMode = f.container_types.some((c) => c.indexOf('FCL') === 0) ? 'Sea FCL' : 'Sea LCL';
      const laneRows = (f.laneMode ? f.lanes : [{
        pol_location_id: f.pol_location_id, pod_location_id: f.pod_location_id,
        via_location_id: null, pol: f.pol, pod: f.pod, via: null,
        mode: singleLaneMode, load_unit: unitForMode(singleLaneMode),
      }]).map((l) => ({
        pol_location_id: l.pol_location_id, pod_location_id: l.pod_location_id,
        via_location_id: l.via_location_id || null,
        pol: l.pol || null, pod: l.pod || null, via: l.via || null,
        mode: l.mode || null, load_unit: l.load_unit || null,
      }));
      const undernameActive = f.direction === 'Import' && ['customs', 'door_to_door'].includes(f.service_type) && f.undername_import;
      // Review fix 2 -- nilai ke RPC = readMoneyInput(...).value (angka
      // tak terbaca sudah diblokir di stepErrors di atas, jadi di sini
      // string yang tersisa sudah pasti kosong ATAU benar-benar terbaca).
      const estVal = f.estimated_value.trim() === '' ? null : readMoneyInput(f.estimated_value).value;
      const weightVal = f.weight_kg.trim() === '' ? null : readMoneyInput(f.weight_kg).value;
      const volumeVal = f.volume_cbm.trim() === '' ? null : readMoneyInput(f.volume_cbm).value;

      const params = {
        p_company_id: profile.company_id,
        p_prospect_id: sourceType === 'prospect' ? f.prospect_id : f.customer_id,
        p_service_type: f.service_type,
        p_direction: f.direction || null,
        p_customer_role: f.customer_role || null,
        p_contact_id: f.contact_id || null,
        p_deadline_quote: f.deadline_quote || null,
        p_estimated_value: estVal,
        p_notes: f.notes || null,
        p_incoterms: f.incoterms.length ? f.incoterms : null,
        p_container_types: f.container_types.length ? f.container_types : null,
        p_goods_name: f.goods_name || null,
        p_hs_code: f.hs_code || null,
        p_weight_kg: weightVal,
        p_volume_cbm: volumeVal,
        p_dimension: f.dimension || null,
        p_cargo_types: f.cargo_types.length ? f.cargo_types : null,
        p_un_number: f.un_number || null,
        p_imo_class: f.imo_class || null,
        p_has_msds: f.has_msds || null,
        p_additional_services: f.additional_services.length ? f.additional_services : null,
        p_pickup_address: f.pickup_address || null,
        p_delivery_address: f.delivery_address || null,
        // Review fix 4 -- hanya dikirim saat kartu duplikat BENAR-BENAR
        // tampil saat ini (possibleDuplicates.length > 0), bukan apa pun
        // yang kebetulan masih ada di field teksnya (bisa basi dari rute
        // sebelumnya -- lihat juga efek yang mengosongkannya di atas).
        p_duplicate_warning_reason: possibleDuplicates.length > 0 ? (f.duplicate_warning_reason || null) : null,
        p_n_containers: f.n_containers !== '' ? Number(f.n_containers) : null,
        p_cargo_ready_date: f.cargo_ready_date || null,
        p_undername_import: undernameActive,
        p_importer_of_record: undernameActive ? (f.importer_of_record || null) : null,
        p_duties_and_taxes: undernameActive ? (f.duties_and_taxes || null) : null,
        p_supporting_docs_received: undernameActive ? !!f.supporting_docs_received : false,
        p_pricing_basis: isDoorToDoor ? (f.pricing_basis || null) : null,
        p_owner_id: canPickOwner ? (f.owner_id || null) : null,
        p_lanes: laneRows,
      };

      const { data, error } = await supabase.rpc('create_inquiry_with_lanes', params).single();
      if (error) throw error;

      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_INQUIRY, entityType: ENTITY_TYPES.INQUIRY, entityId: data?.id || null, entityLabel: data?.inquiry_no,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.('Inquiry created' + (data?.inquiry_no ? ` — ${data.inquiry_no}` : ''));
      onCreated?.(data?.id);
    } catch (err) {
      // Pesan RPC (bahasa Indonesia) ditampilkan APA ADANYA (task 10) — nol
      // pembungkusan ulang, termasuk saat RPC menolak akun Lead Pool.
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(SK.length, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div style={{ background: C.pageBg, padding: '8px 8px 40px', borderRadius: 16 }}>
      <div style={S.page}>
        <div style={S.headerCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={S.hTitle}>New Inquiry</h1>
              <div style={S.hSub}>Intake Form — Single Shipment</div>
            </div>
          </div>
        </div>

        {/* step pills — klik bebas, TANPA validasi (mockup steps[i].go baris
            766 juga tidak memvalidasi navigasi pill). */}
        <div style={S.pillBar}>
          {SK.map((k, i) => (
            <button key={k} type="button" onClick={() => setStep(i + 1)}
              style={{
                height: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5,
                border: '1px solid ' + (i + 1 === stepIdx ? C.navy : C.border), background: i + 1 === stepIdx ? C.navy : '#fff', color: i + 1 === stepIdx ? '#fff' : C.sub,
              }}>
              {i + 1}. {STEP_LABEL[k]}
            </button>
          ))}
        </div>

        <section style={S.card}>
          <div style={S.secBody}>

            {stepKey === 'cust' && (
              <div style={{ display: 'grid', gap: 18 }}>
                <Field label="Sumber" span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['prospect', 'customer'].map((t) => (
                      <button key={t} type="button" onClick={() => { setSourceType(t); setF((x) => ({ ...x, prospect_id: '', customer_id: '', contact_id: '' })); setProspectText(''); setCustomerText(''); }}
                        style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", border: '1px solid ' + (sourceType === t ? C.navy : C.border), background: sourceType === t ? C.navy : '#fff', color: sourceType === t ? '#fff' : C.sub }}>
                        {t === 'prospect' ? 'Prospect' : 'Customer (Existing)'}
                      </button>
                    ))}
                  </div>
                </Field>
                <div style={grid2}>
                  <Field label={sourceType === 'prospect' ? 'Prospect' : 'Customer'} required>
                    {sourceType === 'prospect' ? (
                      <AccountPicker value={prospectText} accounts={prospects} statusLabel={lifecycleLabel} inputStyle={S.input} placeholder="Search prospects…"
                        onChangeText={(v) => { setProspectText(v); setF((x) => ({ ...x, prospect_id: '', contact_id: '' })); }}
                        onPick={(a) => { setProspectText(a.name); setF((x) => ({ ...x, prospect_id: a.id, contact_id: '' })); }} />
                    ) : (
                      <AccountPicker value={customerText} accounts={customers} statusLabel={lifecycleLabel} inputStyle={S.input} placeholder="Search customers…"
                        onChangeText={(v) => { setCustomerText(v); setF((x) => ({ ...x, customer_id: '', contact_id: '' })); }}
                        onPick={(a) => { setCustomerText(a.name); setF((x) => ({ ...x, customer_id: a.id, contact_id: '' })); }} />
                    )}
                    <FieldError>{errors.cust_account}</FieldError>
                  </Field>
                  <Field label="Source" hint="Read-only, from the account record.">
                    <div style={{ ...S.input, display: 'flex', alignItems: 'center', background: '#F8FAFC', color: accountSource ? C.text : C.muted, fontStyle: accountSource ? 'normal' : 'italic' }}>
                      {accountSource || 'Not set'}
                    </div>
                  </Field>
                </div>
                {resolvedAccountId && (
                  <div style={grid2}>
                    <Field label="Contact">
                      {!contactsLoaded ? (
                        <span style={{ fontSize: 12, color: C.muted, display: 'block', paddingTop: 6 }}>Loading contacts…</span>
                      ) : contacts.length === 0 ? (
                        <span style={{ fontSize: 12, color: C.sub, display: 'block', paddingTop: 6 }}>This account has no contacts yet. Add one from Account Detail → Contacts tab.</span>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <select value={f.contact_id} onChange={set('contact_id')} style={selInput}>
                            <option value="">— Select contact —</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}{c.position ? ` — ${c.position}` : ''}{c.is_primary ? ' (Primary)' : ''}{c.is_active === false ? ' (Inactive)' : ''}</option>
                            ))}
                          </select><Chevron />
                        </div>
                      )}
                    </Field>
                  </div>
                )}
              </div>
            )}

            {stepKey === 'svc' && (
              <div style={{ display: 'grid', gap: 20 }}>
                <Field label="Service Type" required span>
                  <div style={grid3}>
                    {serviceTypeOpts.map((o) => (
                      <ServiceCard key={o.value} icon={SERVICE_ICON[o.value]} label={o.label} active={f.service_type === o.value}
                        onClick={() => setF((x) => ({ ...x, service_type: o.value }))} />
                    ))}
                  </div>
                  <FieldError>{errors.svc_service_type}</FieldError>
                </Field>

                <Field label="Direction" required span>
                  <div style={grid3}>
                    {DIRECTION_OPTS.map((d) => <Pill key={d} active={f.direction === d} onClick={() => pickDirection(d)}>{d}</Pill>)}
                  </div>
                  <FieldError>{errors.svc_direction}</FieldError>
                </Field>

                <Field label="Customer Role" required span
                  hint="Who is our customer in this shipment? Full shipper and consignee details are filled in the Shipment Instruction or Job Order.">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {CUSTOMER_ROLE_OPTS.map((r) => <Pill key={r} active={f.customer_role === r} onClick={() => setF((x) => ({ ...x, customer_role: r }))}>{r}</Pill>)}
                  </div>
                  <FieldError>{errors.svc_customer_role}</FieldError>
                </Field>

                {/* Undername — Customs Clearance, inline (mockup baris 63-67).
                    Door-to-Door punya versi sendiri di langkah "customs" di bawah. */}
                {f.service_type === 'customs' && f.direction === 'Import' && (
                  <UndernamePanel f={f} setF={setF} errors={errors} iorOpts={iorOpts} />
                )}
              </div>
            )}

            {stepKey === 'route' && (
              <div style={{ display: 'grid', gap: 20 }}>
                {!f.laneMode ? (
                  <>
                    <div style={grid2}>
                      <div style={{ minWidth: 0 }}>
                        <div style={S.label}><Anchor size={13} color={C.navy} /> Port of Loading <span style={S.req}>*</span></div>
                        <LocationPicker value={f.pol_location_id} textValue={f.pol} options={locations} tokens={LOCATION_PICKER_TOKENS}
                          placeholder="Select port of loading…"
                          onChange={(id, loc) => setF((x) => ({ ...x, pol_location_id: id, pol: loc.name }))}
                          onManage={canManageLocations ? openLocationMaster : undefined}
                          onRequest={canManageLocations ? undefined : requestNewLocation} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={S.label}><MapPin size={13} color={C.orange} /> Port of Discharge <span style={S.req}>*</span></div>
                        <LocationPicker value={f.pod_location_id} textValue={f.pod} options={locations} tokens={LOCATION_PICKER_TOKENS}
                          placeholder="Select port of discharge or city…"
                          onChange={(id, loc) => setF((x) => ({ ...x, pod_location_id: id, pod: loc.name }))}
                          onManage={canManageLocations ? openLocationMaster : undefined}
                          onRequest={canManageLocations ? undefined : requestNewLocation} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <button type="button" onClick={startLanes} style={S.btnGhost}><Plus size={15} />Add route option</button>
                      <span style={{ fontSize: 12, color: C.sub }}>Add a second route when the customer wants to compare routes for the same shipment.</span>
                    </div>
                  </>
                ) : (
                  <LaneTable
                    lanes={f.lanes} locations={locations} laneModeOpts={laneModeOpts} laneUnitOpts={laneUnitOpts}
                    canManageLocations={canManageLocations} openLocationMaster={openLocationMaster} requestNewLocation={requestNewLocation}
                    onUpdate={updateLane} onRemove={removeLane} onAdd={addLane}
                  />
                )}
                <FieldError>{errors.route_lanes}</FieldError>

                <div style={grid2}>
                  <div style={{ minWidth: 0 }}>
                    <div style={S.label}>Pickup Address</div>
                    <textarea value={f.pickup_address} onChange={set('pickup_address')} rows={2} style={S.textarea} placeholder="Cargo pickup address…" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={S.label}>Delivery Address</div>
                    <textarea value={f.delivery_address} onChange={set('delivery_address')} rows={2} style={S.textarea} placeholder="Cargo delivery address…" />
                  </div>
                </div>

                <div>
                  <div style={S.label}>Incoterm</div>
                  <div style={grid3}>{INCOTERMS.map((t) => <Pill key={t} active={f.incoterms.includes(t)} onClick={() => toggleArr('incoterms', t)}>{t}</Pill>)}</div>
                </div>
                <div>
                  <div style={S.label}>Container Type</div>
                  <div style={grid2}>{CONTAINER_TYPES.map((t) => <Pill key={t} active={f.container_types.includes(t)} onClick={() => toggleArr('container_types', t)}>{t}</Pill>)}</div>
                </div>
                <div style={grid2}>
                  <Field label="Number of containers" required={needsNContainers} hint={needsNContainers ? 'Required when an FCL container type is selected.' : undefined}>
                    <input value={f.n_containers} onChange={handleNContainersChange} inputMode="numeric" style={S.input} placeholder="0" />
                    <FieldError>{errors.route_ncont}</FieldError>
                  </Field>
                  <Field label="Cargo ready date">
                    <input type="date" value={f.cargo_ready_date} onChange={set('cargo_ready_date')} style={S.input} />
                  </Field>
                </div>

                {!dupCheckLoading && possibleDuplicates.length > 0 && (
                  <div style={{ background: '#FEF9E7', border: '1px solid #F2D675', borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <AlertTriangle size={18} color="#92700A" style={{ flex: '0 0 18px', marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: '#5C4700' }}>
                          Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''} found
                        </div>
                        <div style={{ fontSize: 12.5, color: '#5C4700', marginTop: 4 }}>Same account, same route, created in the last 30 days:</div>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                          {possibleDuplicates.map((d) => (
                            <li key={d.id} style={{ fontSize: 12.5, color: '#5C4700', fontFamily: "'IBM Plex Mono',monospace" }}>
                              {d.inquiry_no} — {new Date(d.created_at).toLocaleDateString('en-GB')}{d.owner_name ? ` (${d.owner_name})` : ''}
                            </li>
                          ))}
                        </ul>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ ...S.label, color: '#5C4700' }}>Reason to continue as a separate shipment</div>
                          <textarea value={f.duplicate_warning_reason} onChange={set('duplicate_warning_reason')} rows={2}
                            style={{ ...S.textarea, borderColor: errors.route_dup ? C.error : '#F2D675' }}
                            placeholder="Explain why this is a separate shipment…" />
                          <FieldError>{errors.route_dup}</FieldError>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {dupCheckLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 12.5 }}><Loader2 size={14} className="animate-spin" />Checking for possible duplicates…</div>
                )}
              </div>
            )}

            {stepKey === 'cargo' && (
              <div style={{ display: 'grid', gap: 20 }}>
                <div style={grid2}>
                  <Field label="Item Name (EN)"><input value={f.goods_name} onChange={set('goods_name')} style={S.input} placeholder="e.g. Industrial Machinery" /></Field>
                  <Field label="HS Code"><input value={f.hs_code} onChange={set('hs_code')} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="0000.00.00" /></Field>
                </div>
                <div style={grid2}>
                  <Field label="Total Weight">
                    <div style={{ position: 'relative' }}>
                      <input value={f.weight_kg} onChange={(e) => handleWeightChange(e.target.value)} onBlur={handleWeightBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingRight: 56 }} placeholder="0" />
                      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>KG</span>
                    </div>
                    {weightUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                  </Field>
                  <Field label="Volume">
                    <div style={{ position: 'relative' }}>
                      <input value={f.volume_cbm} onChange={(e) => handleVolumeChange(e.target.value)} onBlur={handleVolumeBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingRight: 56 }} placeholder="0" />
                      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>CBM</span>
                    </div>
                    {volumeUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                  </Field>
                </div>
                <div style={grid2}>
                  <Field label="Dimensi (P x L x T)"><input value={f.dimension} onChange={set('dimension')} style={S.input} placeholder="cth: 120 x 80 x 100 cm" /></Field>
                </div>
                <div>
                  <div style={{ ...S.label, color: C.orange }}>Cargo Category</div>
                  <div style={grid2}>{CARGO_TYPES.map((c) => <CargoCard key={c.id} item={c} active={f.cargo_types.includes(c.id)} onClick={() => toggleArr('cargo_types', c.id)} />)}</div>
                </div>
                {dgSelected && (
                  <div style={{ border: '1px solid ' + C.border, borderLeft: '3px solid ' + C.orange, borderRadius: 12, background: '#FFFCFA', padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <AlertTriangle size={16} color={C.orange} /><span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: C.text }}>Detail Dangerous Goods</span>
                    </div>
                    <div style={{ ...grid2, marginBottom: 18 }}>
                      <Field label="UN Number"><input value={f.un_number} onChange={(e) => setF((x) => ({ ...x, un_number: e.target.value.replace(/\D/g, '') }))} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="0000" /></Field>
                      <Field label="IMO Class">
                        <div style={{ position: 'relative' }}>
                          <select value={f.imo_class} onChange={set('imo_class')} style={selInput}>
                            <option value="">— Select IMO Class —</option>
                            {IMO_CLASSES.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select><Chevron />
                        </div>
                      </Field>
                    </div>
                    <div style={S.label}>MSDS Available?</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {MSDS_OPTS.map((o) => <RadioPill key={o} value={o} current={f.has_msds} onClick={() => setF((x) => ({ ...x, has_msds: o }))}>{o}</RadioPill>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {stepKey === 'addl' && (
              <div>
                <div style={S.label}>Additional Services</div>
                <div style={grid3}>{SERVICES.map((s) => <TagCard key={s.id} item={s} active={f.additional_services.includes(s.id)} onClick={() => toggleArr('additional_services', s.id)} />)}</div>
              </div>
            )}

            {stepKey === 'customs' && (
              <div style={{ display: 'grid', gap: 20 }}>
                <Field label="Pricing Basis">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PRICING_BASIS_OPTS.map((p) => <Pill key={p} active={f.pricing_basis === p} onClick={() => setF((x) => ({ ...x, pricing_basis: p }))}>{p}</Pill>)}
                  </div>
                </Field>
                {f.direction === 'Import' && (
                  <UndernamePanel f={f} setF={setF} errors={errors} iorOpts={iorOpts} />
                )}
              </div>
            )}

            {stepKey === 'commercial' && (
              <div style={grid2}>
                <Field label="Deadline Quote"><input type="date" value={f.deadline_quote} onChange={set('deadline_quote')} style={S.input} /></Field>
                <Field label="Estimated (intake)" hint="Leave empty if unknown.">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>Rp</span>
                    <input value={f.estimated_value} onChange={(e) => handleEstValChange(e.target.value)} onBlur={handleEstValBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingLeft: 38 }} placeholder="0" />
                  </div>
                  {estValUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                </Field>
                {canPickOwner ? (
                  <Field label="Owner">
                    <div style={{ position: 'relative' }}>
                      <select value={f.owner_id || ''} onChange={(e) => setF((x) => ({ ...x, owner_id: e.target.value || null }))} style={selInput}>
                        <option value="">Leave unassigned</option>
                        {roster.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                      </select><Chevron />
                    </div>
                  </Field>
                ) : (
                  <Field label="Owner">
                    <div style={{ ...S.input, display: 'flex', alignItems: 'center', background: '#F8FAFC', color: C.sub }}>{profile?.full_name || user?.email || '—'}</div>
                  </Field>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={S.label}>Notes</div>
                  <textarea value={f.notes} onChange={set('notes')} rows={3} style={S.textarea} placeholder="Anything the pricing team should know" />
                </div>
              </div>
            )}

            {stepKey === 'review' && (
              <ReviewStep f={f} sourceType={sourceType} prospectText={prospectText} customerText={customerText} isDoorToDoor={isDoorToDoor}
                serviceTypeOpts={serviceTypeOpts} roster={roster} accountSource={accountSource} needsNContainers={needsNContainers} />
            )}

          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
          <button type="button" style={S.btnGhost} onClick={onBack}><X size={16} />Cancel</button>
          <span style={{ flex: 1 }} />
          {stepIdx > 1 && <button type="button" style={S.btnGhost} onClick={goPrev}><ChevronLeft size={16} />Back</button>}
          {stepIdx < SK.length && <button type="button" style={S.btnPrimary} onClick={goNext}>Next<ChevronRight size={16} /></button>}
          {stepIdx === SK.length && (
            <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Inquiry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Undername cluster — mockup baris 63-67 (Customs Clearance inline) /
// 68-75 (Door-to-Door, di dalam langkah "Customs & Undername"). Mockup
// merender Duties & Taxes DUA KALI untuk Door-to-Door (binding identik,
// bug prototipe) — SENGAJA TIDAK ditiru di sini: field ini dirender SEKALI,
// di dalam panel bersyarat Undername saja (deviasi, dicatat di laporan). ──
function UndernamePanel({ f, setF, errors, iorOpts }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, background: '#FFF8EE', border: '1px solid #F0DCAE', borderRadius: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: C.text }}>
        <input type="checkbox" checked={f.undername_import} onChange={(e) => setF((x) => ({
          ...x,
          undername_import: e.target.checked,
          // Review fix 1 -- mockup blankF.duties (baris 557) = 'Included in
          // price', dan select-nya TANPA opsi kosong (baris 66/73) -- begitu
          // Undername dicentang, state HARUS ikut diset ke default yang sama
          // dengan apa yang langsung TAMPIL (opsi pertama <select>), supaya
          // "yang terlihat = yang terkirim". Tidak menimpa pilihan user yang
          // sudah ada (toggle off lalu on lagi).
          duties_and_taxes: e.target.checked && !x.duties_and_taxes ? DUTIES_AND_TAXES_OPTS[0] : x.duties_and_taxes,
        }))} />
        Undername import
      </label>
      {f.undername_import && (
        <div style={grid2}>
          <Field label="Importer of Record" required>
            <div style={{ position: 'relative' }}>
              <select value={f.importer_of_record} onChange={(e) => setF((x) => ({ ...x, importer_of_record: e.target.value }))} style={selInput}>
                <option value="">Select an approved partner</option>
                {iorOpts.map((o) => <option key={o.value} value={o.value}>{o.label} (approved partner)</option>)}
              </select><Chevron />
            </div>
            <FieldError>{errors.under_ior}</FieldError>
          </Field>
          <Field label="Duties & Taxes">
            <div style={{ position: 'relative' }}>
              <select value={f.duties_and_taxes} onChange={(e) => setF((x) => ({ ...x, duties_and_taxes: e.target.value }))} style={selInput}>
                {DUTIES_AND_TAXES_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select><Chevron />
            </div>
            <FieldError>{errors.under_duties}</FieldError>
          </Field>
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={f.supporting_docs_received} onChange={(e) => setF((x) => ({ ...x, supporting_docs_received: e.target.checked }))} />
            Supporting documents from the customer have been received. <span style={S.req}>*</span>
          </label>
          <FieldError>{errors.under_docs}</FieldError>
        </div>
      )}
    </div>
  );
}

// ── Lane table — mockup baris 102-126 (dikurangi kolom "Use"/checkbox dan
// tombol "Load from Sell Rate Card", KHUSUS Rate Sheet Request — Tahap 4C,
// tidak dibangun di sini). ──────────────────────────────────────────────
function LaneTable({ lanes, locations, laneModeOpts, laneUnitOpts, canManageLocations, openLocationMaster, requestNewLocation, onUpdate, onRemove, onAdd }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h4 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text, flex: 1 }}>Route options ({lanes.length})</h4>
        <button type="button" onClick={onAdd} style={{ ...S.btnGhost, height: 36, padding: '0 14px' }}><Plus size={14} />Add lane</button>
      </div>
      <div style={{ border: '1px solid ' + C.border, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(160px,1fr) minmax(160px,1fr) minmax(140px,1fr) 120px 110px 36px', background: '#F1F5F9', borderBottom: '1px solid ' + C.border }}>
          {['#', 'POL', 'POD', 'Via port', 'Mode', 'Load unit', ''].map((h) => (
            <div key={h} style={{ padding: '9px 8px', fontFamily: "'Montserrat',sans-serif", fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.sub }}>{h}</div>
          ))}
        </div>
        {lanes.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(160px,1fr) minmax(160px,1fr) minmax(140px,1fr) 120px 110px 36px', alignItems: 'center', borderBottom: '1px solid ' + C.border }}>
            <div style={{ padding: '6px 8px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.sub }}>{i + 1}</div>
            <div style={{ padding: '6px 4px' }}>
              <LocationPicker variant="cell" value={l.pol_location_id} textValue={l.pol} options={locations} tokens={LOCATION_PICKER_TOKENS}
                placeholder="Port of Loading" invalid={!l.pol_location_id}
                onChange={(id, loc) => onUpdate(i, { pol_location_id: id, pol: loc.name })}
                onManage={canManageLocations ? openLocationMaster : undefined}
                onRequest={canManageLocations ? undefined : requestNewLocation} />
            </div>
            <div style={{ padding: '6px 4px' }}>
              <LocationPicker variant="cell" value={l.pod_location_id} textValue={l.pod} options={locations} tokens={LOCATION_PICKER_TOKENS}
                placeholder="Port of Discharge" invalid={!l.pod_location_id}
                onChange={(id, loc) => onUpdate(i, { pod_location_id: id, pod: loc.name })}
                onManage={canManageLocations ? openLocationMaster : undefined}
                onRequest={canManageLocations ? undefined : requestNewLocation} />
            </div>
            <div style={{ padding: '6px 4px' }}>
              <LocationPicker variant="cell" value={l.via_location_id} textValue={l.via} options={locations} tokens={LOCATION_PICKER_TOKENS}
                placeholder="Optional"
                onChange={(id, loc) => onUpdate(i, { via_location_id: id, via: loc.name })}
                onManage={canManageLocations ? openLocationMaster : undefined}
                onRequest={canManageLocations ? undefined : requestNewLocation} />
            </div>
            <div style={{ padding: '6px 4px' }}>
              <select value={l.mode} onChange={(e) => onUpdate(i, { mode: e.target.value, load_unit: unitForMode(e.target.value) })}
                style={{ height: 36, width: '100%', borderRadius: 8, border: '1px solid ' + C.border, background: '#fff', padding: '0 8px', fontSize: 12.5 }}>
                {laneModeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ padding: '6px 4px' }}>
              <select value={l.load_unit} onChange={(e) => onUpdate(i, { load_unit: e.target.value })}
                style={{ height: 36, width: '100%', borderRadius: 8, border: '1px solid ' + C.border, background: '#fff', padding: '0 8px', fontSize: 12.5 }}>
                {laneUnitOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ padding: '6px 4px', display: 'flex', justifyContent: 'center' }}>
              {/* Minimum 1 lane ditegakkan (koreksi atas gap validasi mockup —
                  lihat PLAN v1 §3.1): tombol hapus disabled di baris terakhir. */}
              <button type="button" onClick={() => onRemove(i)} disabled={lanes.length <= 1}
                style={{ background: 'none', border: 0, cursor: lanes.length <= 1 ? 'not-allowed' : 'pointer', color: lanes.length <= 1 ? C.muted : C.sub, opacity: lanes.length <= 1 ? 0.4 : 1 }}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Review — ringkasan sederhana per langkah, cukup setia dengan mockup
// (field + value/"Not set", required-but-missing ditandai) tanpa menyalin
// mekanisme grup dinamis mockup-nya byte-per-byte. ──────────────────────
function ReviewRow({ label, value, required }) {
  const missing = required && !value;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, marginBottom: 3 }}>{label}</div>
      {missing ? (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.error }}>Required</span>
      ) : (
        <span style={{ fontSize: 13.5, color: value ? C.text : C.muted, fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</span>
      )}
    </div>
  );
}
function ReviewStep({ f, sourceType, prospectText, customerText, isDoorToDoor, serviceTypeOpts, roster, accountSource, needsNContainers }) {
  const serviceLabel = serviceTypeOpts.find((o) => o.value === f.service_type)?.label || f.service_type;
  const ownerLabel = f.owner_id ? (roster.find((r) => r.id === f.owner_id)?.full_name || f.owner_id) : 'Unassigned (or yourself)';
  const lanesText = f.laneMode
    ? f.lanes.map((l) => `${l.pol || '…'} → ${l.pod || '…'}`).join('; ')
    : `${f.pol || '…'} → ${f.pod || '…'}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Customer &amp; Contact</div>
        <div style={grid3}>
          <ReviewRow label="Account" value={sourceType === 'prospect' ? prospectText : customerText} required />
          <ReviewRow label="Source" value={accountSource} />
        </div>
      </div>
      <div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Service &amp; Direction</div>
        <div style={grid3}>
          <ReviewRow label="Service Type" value={serviceLabel} required />
          <ReviewRow label="Direction" value={f.direction} required />
          <ReviewRow label="Customer Role" value={f.customer_role} required />
        </div>
      </div>
      <div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Route &amp; Terms</div>
        <div style={grid3}>
          <ReviewRow label={`Route options (${f.laneMode ? f.lanes.length : 1})`} value={lanesText} required />
          <ReviewRow label="Incoterms" value={f.incoterms.join(', ')} />
          <ReviewRow label="Container Type" value={f.container_types.join(', ')} />
          <ReviewRow label="Number of containers" value={f.n_containers} required={needsNContainers} />
        </div>
      </div>
      {isDoorToDoor && (
        <div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Customs &amp; Undername</div>
          <div style={grid3}>
            <ReviewRow label="Pricing Basis" value={f.pricing_basis} />
            <ReviewRow label="Undername import" value={f.undername_import ? 'Yes' : 'No'} />
          </div>
        </div>
      )}
      <div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Commercial</div>
        <div style={grid3}>
          <ReviewRow label="Deadline Quote" value={f.deadline_quote} />
          <ReviewRow label="Estimated (intake)" value={f.estimated_value} />
          <ReviewRow label="Owner" value={ownerLabel} />
        </div>
      </div>
    </div>
  );
}
