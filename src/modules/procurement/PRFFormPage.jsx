// src/modules/procurement/PRFFormPage.jsx
// PRF (Price Request Form) — Fase 1+2: Section 01 Informasi Dasar + 02 Inquiry Details
// + 03 Detail Layanan (child fields dinamis per service_type: Sea/Air/Inland/Custom/Project).
// UI mirrors InquiryFormPage (slate/white, navy/orange, Montserrat/Inter/IBM Plex Mono).
// No list/inbox (Fase 3a).
// Style tokens (C, S) + helpers (Field/Pill/Chevron) copied from InquiryFormPage per pattern.
import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronDown, Send, Save, Check, User, Calendar, Hash, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';

const C = {
  navy: '#1B4D8A', navyDark: '#0F3768', navySoft: '#EEF3FB',
  orange: '#E85A1E', orangeDark: '#C94D18', orangeSoft: '#FDF0E9',
  pageBg: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderStrong: '#CBD5E1',
  text: '#0F172A', sub: '#475569', muted: '#94A3B8',
  success: '#16A34A', warning: '#F59E0B', error: '#DC2626',
};

// ── Business option lists (drive conditional logic — kept local, not dropdown_options) ──
const DIRECTIONS = [
  { value: 'import', label: 'Import' },
  { value: 'export', label: 'Export' },
  { value: 'domestic', label: 'Domestic' },
];
const COMMODITIES = [
  { value: 'general', label: 'General Cargo' },
  { value: 'special_permit', label: 'Special Permit' },
  { value: 'dg', label: 'Dangerous Good' },
];
const SERVICE_TYPES = [
  { value: 'sea', label: 'Sea' },
  { value: 'air', label: 'Air' },
  { value: 'inland', label: 'Inland' },
  { value: 'project', label: 'Project' },
  { value: 'custom', label: 'Custom Only' },   // disabled when direction = domestic
];
const INCOTERMS_FULL = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'];
const INCOTERMS_AIR  = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const INCOTERMS_COMMERCIAL = ['CIF', 'CIP', 'DDP'];                       // show Commercial Value
const INCOTERMS_PICKUP     = ['EXW', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];  // Pickup Address mandatory
const INCOTERMS_DELIVERY   = ['EXW', 'FAS', 'FOB', 'CFR', 'CIF', 'DAP', 'DPU', 'DDP']; // Delivery mandatory
const STREAM_FALLBACK = [
  { value: 'FCL', label: 'FCL' }, { value: 'LCL', label: 'LCL' },
  { value: 'Project', label: 'Project' }, { value: 'Domestic', label: 'Domestic' },
  { value: 'Warehouse', label: 'Warehouse' },
];
// Add-on services (11). Customs-family (disabled when direction = domestic) marked customs:true.
const ADD_ONS = [
  { value: 'custom_clearance', label: 'Custom Clearance', customs: true },
  { value: 'inland', label: 'Inland', customs: false },
  { value: 'import_license_undername', label: 'Import License (Undername)', customs: true },
  { value: 'import_license_pi', label: 'Import License (PI)', customs: true },
  { value: 'export_license', label: 'Export License', customs: true },
  { value: 'ls', label: 'LS', customs: true },
  { value: 'warehouse_umum', label: 'Warehouse Umum', customs: false },
  { value: 'warehouse_reefer', label: 'Warehouse Reefer', customs: false },
  { value: 'tkbm', label: 'TKBM', customs: false },
  { value: 'insurance', label: 'Insurance', customs: false },
  { value: 'others', label: 'Others', customs: false },
];
// ── Child field option lists (Fase 2) ──
const SEA_CONTAINERS = [
  { code: '20', label: "20'" }, { code: '40', label: "40'" }, { code: '40HC', label: "40'HC" },
  { code: '20RF', label: "20' Reefer" }, { code: '40RF', label: "40' Reefer" },
];
const SEA_FREIGHT_TYPES = [{ value: 'fcl', label: 'FCL' }, { value: 'lcl', label: 'LCL' }];
const INLAND_FLEETS = [
  'Blind Van', 'Pick Up (Bak)', 'Pick Up (Box)', 'Pick Up (Reefer)',
  'CDE (Bak)', 'CDE (Box)', 'CDE (Reefer)',
  'CDD (Bak)', 'CDD (Box)', 'CDD (Reefer)', 'CDD Long',
  'Fuso (Bak)', 'Fuso (Box)', 'Fuso (Reefer)',
  'Tronton (Bak)', 'Tronton (Box)', 'Tronton (Reefer)', 'Trinton', 'Tronton Wingbox',
  'Trailer Container 20 Feet (Dry)', 'Trailer Container 20 Feet (Reefer)',
  'Trailer Container 40 Feet (Dry)', 'Trailer Container 40 Feet (Reefer)',
  'Truk Gandeng', 'Lowbed Trailer',
];
const PROJECT_FREIGHTS = ["20' OT", "40' OT", "20' FR", "40' FR", 'RORO', 'Breakbulk'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const toRoman = (m) => ROMAN[m] || String(m);

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '4px 0 8px', fontFamily: "'Inter',system-ui,sans-serif", color: C.text },
  headerCard: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: '22px 26px', marginBottom: 22 },
  hTitle: { fontFamily: "'Montserrat',sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: -0.6, color: C.text, margin: 0, lineHeight: 1.1 },
  hSub: { fontSize: 14, color: C.sub, marginTop: 7 },
  inqBadge: { display: 'inline-flex', alignItems: 'center', gap: 8, background: C.navy, color: '#fff', padding: '9px 15px', borderRadius: 999, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, fontSize: 13, letterSpacing: 0.3, flex: '0 0 auto' },
  card: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 22, overflow: 'hidden' },
  secBar: { display: 'flex', alignItems: 'center', gap: 12, background: '#F1F5F9', borderBottom: '1px solid ' + C.border, padding: '14px 24px', flexWrap: 'wrap' },
  secNum: { width: 26, height: 26, borderRadius: 999, background: C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, flex: '0 0 26px' },
  secTitle: { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, color: C.text, letterSpacing: -0.1, lineHeight: 1.2 },
  secSub: { fontSize: 12.5, color: '#64748B' },
  secBody: { padding: 28 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.35 },
  req: { color: C.orange, fontWeight: 800 },
  hint: { fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.4, fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
  input: { height: 44, borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box' },
  textarea: { borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.55 },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 26px', borderRadius: 10, border: '1px solid ' + C.orange, background: C.orange, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(232,90,30,.35)' },
  btnGhost: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 10, border: '1px solid ' + C.navy, background: '#fff', color: C.navy, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  infoChip: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px', minWidth: 0 },
  infoChipK: { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, lineHeight: 1.3 },
  infoChipV: { display: 'block', fontSize: 13.5, fontWeight: 600, color: C.text, lineHeight: 1.3 },
  infoDiv: { width: 1, alignSelf: 'stretch', background: C.border, margin: '2px 18px' },
};
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '18px 20px' };
const selInput = { ...S.input, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' };

function Field({ label, required, span, hint, children }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : 'auto' }}>
      <div style={S.label}>{label}{required && <span style={S.req}>*</span>}{hint}</div>
      {children}
    </div>
  );
}
function Chevron() { return <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><ChevronDown size={16} color={C.muted} /></span>; }

function Pill({ active, disabled, onClick, children }) {
  return (
    <button type="button" disabled={disabled} onClick={disabled ? undefined : onClick}
      style={{ height: 44, borderRadius: 10, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid ' + (active ? C.navy : C.border), background: disabled ? '#F1F5F9' : (active ? C.navy : '#fff'), color: disabled ? C.muted : (active ? '#fff' : C.sub), opacity: disabled ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px' }}>
      {active && <Check size={15} />}{children}
    </button>
  );
}
function ActionsBar({ saving, onBack, onSave }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" style={S.btnGhost} onClick={onBack}><ChevronLeft size={16} />Batal</button>
      <button type="button" style={{ ...S.btnGhost, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={() => onSave('DRAFT')} disabled={saving}><Save size={16} />Simpan Draft</button>
      <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={() => onSave('SUBMITTED')} disabled={saving}><Send size={16} />{saving ? 'Menyimpan…' : 'Submit PRF'}</button>
    </div>
  );
}

export default function PRFFormPage({ onBack, showToast }) {
  const { profile, user } = useAuth();
  const { options: streamOpts } = useDropdownOptions('stream', STREAM_FALLBACK);

  const [form, setForm] = useState({
    customer_source: 'customer', account_id: '', account_name_manual: '', inquiry_id: '',
    stream: '', deadline_quotation: '',
    direction: '', commodity: '', hs_code: '', msds_available: false,
    service_type: '', incoterms: '', commercial_value: '', commercial_currency: '',
    origin: '', destination: '', pickup_address: '', delivery_address: '',
    add_on_services: [], add_on_others: '', cargo_ready_date: '',
    // Section 03 — child fields (per service_type)
    sea_freight_type: '', sea_container_types: [], sea_container_qty: {},
    sea_lcl_gw: '', sea_lcl_dimension: '', sea_lcl_volume: '', sea_lcl_koli: '',
    air_gw: '', air_dimension: '', air_volume: '', air_koli: '',
    inland_fleet_types: [], inland_pickup_address: '', inland_delivery_address: '', inland_gw: '', inland_dimension: '',
    project_freight_types: [], project_qty: '',
    notes: '',
  });
  const [customers, setCustomers] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companyCode, setCompanyCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Load accounts + inquiries + currencies + company code (company-scoped).
  useEffect(() => {
    if (!profile?.company_id) return;
    const cid = profile.company_id;
    supabase.from('accounts').select('id, name').eq('company_id', cid).eq('account_status', 'customer').is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setCustomers(data || []));
    supabase.from('accounts').select('id, name').eq('company_id', cid).eq('account_status', 'prospect').is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setProspects(data || []));
    supabase.from('inquiries').select('id, inquiry_no, customer_id, prospect_id').eq('company_id', cid).is('deleted_at', null).order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => setInquiries(data || []));
    supabase.from('currencies').select('code, name').order('code')
      .then(({ data }) => setCurrencies(data || []));
    supabase.from('companies').select('code').eq('id', cid).maybeSingle()
      .then(({ data }) => setCompanyCode(data?.code || 'MSI'));
  }, [profile?.company_id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') }));
  const setInt = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }));
  const toggleArr = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

  // Child reset defaults — applied on service_type change (spec: reset state child).
  const CHILD_RESET = {
    sea_freight_type: '', sea_container_types: [], sea_container_qty: {},
    sea_lcl_gw: '', sea_lcl_dimension: '', sea_lcl_volume: '', sea_lcl_koli: '',
    air_gw: '', air_dimension: '', air_volume: '', air_koli: '',
    inland_fleet_types: [], inland_pickup_address: '', inland_delivery_address: '', inland_gw: '', inland_dimension: '',
    project_freight_types: [], project_qty: '',
  };
  const onServiceTypeChange = (e) => setForm(f => ({ ...f, ...CHILD_RESET, service_type: e.target.value }));
  // Sea FCL container: toggle type + manage per-type qty key.
  const toggleContainer = (code) => setForm(f => {
    const has = f.sea_container_types.includes(code);
    const types = has ? f.sea_container_types.filter(x => x !== code) : [...f.sea_container_types, code];
    const qty = { ...f.sea_container_qty };
    if (has) delete qty[code]; else if (qty[code] == null) qty[code] = '';
    return { ...f, sea_container_types: types, sea_container_qty: qty };
  });
  const setContainerQty = (code) => (e) => {
    const v = e.target.value.replace(/\D/g, '');
    setForm(f => ({ ...f, sea_container_qty: { ...f.sea_container_qty, [code]: v } }));
  };

  // Direction change: domestic disables Custom Only + customs add-ons → clear if selected.
  const onDirectionChange = (e) => {
    const direction = e.target.value;
    setForm(f => ({
      ...f,
      direction,
      service_type: (direction === 'domestic' && f.service_type === 'custom') ? '' : f.service_type,
      add_on_services: direction === 'domestic'
        ? f.add_on_services.filter(v => !ADD_ONS.find(a => a.value === v)?.customs)
        : f.add_on_services,
    }));
  };
  // Source change: reset picked account identity.
  const onSourceChange = (src) => setForm(f => ({ ...f, customer_source: src, account_id: '', account_name_manual: '', inquiry_id: '' }));
  // Inquiry pick: store inquiry_id + auto-fill account_id from its customer/prospect.
  const onInquiryPick = (e) => {
    const inq = inquiries.find(i => i.id === e.target.value);
    setForm(f => ({ ...f, inquiry_id: e.target.value, account_id: inq ? (inq.customer_id || inq.prospect_id || '') : '' }));
  };

  const isDG = form.commodity === 'dg';
  const isImpExp = form.direction === 'import' || form.direction === 'export';
  const incotermOpts = form.service_type === 'air' ? INCOTERMS_AIR : INCOTERMS_FULL;
  const showCommercial = INCOTERMS_COMMERCIAL.includes(form.incoterms);
  const pickupReq = INCOTERMS_PICKUP.includes(form.incoterms);
  const deliveryReq = INCOTERMS_DELIVERY.includes(form.incoterms);
  const showOthers = form.add_on_services.includes('others');
  // Section 03 — child visibility (decision tree)
  const showSea = form.service_type === 'sea';
  const showAir = form.service_type === 'air';
  const showProject = form.service_type === 'project';
  const showInland = form.service_type === 'inland' || form.add_on_services.includes('inland');
  const showCustom = form.service_type === 'custom' && form.add_on_services.includes('custom_clearance');
  const isFCL = form.sea_freight_type === 'fcl';
  const isLCL = form.sea_freight_type === 'lcl';
  const customDocType = form.direction === 'import' ? 'PIB' : form.direction === 'export' ? 'PEB' : null;

  const validate = () => {
    const e = {};
    if (form.customer_source === 'inquiry') {
      if (!form.inquiry_id) e.account = 'Pilih inquiry';
    } else if (!form.account_id && !form.account_name_manual.trim()) {
      e.account = 'Pilih akun atau isi nama manual';
    }
    if (!form.deadline_quotation) e.deadline_quotation = 'Wajib diisi';
    if (!form.direction) e.direction = 'Wajib diisi';
    if (!form.commodity) e.commodity = 'Wajib diisi';
    if (isImpExp && form.hs_code.length !== 8) e.hs_code = 'HS Code wajib 8 digit untuk import/export';
    if (isDG && !form.msds_available) e.msds_available = 'MSDS wajib untuk Dangerous Good';
    if (!form.service_type) e.service_type = 'Wajib diisi';
    if (pickupReq && !form.pickup_address.trim()) e.pickup_address = 'Wajib untuk incoterm ini';
    if (deliveryReq && !form.delivery_address.trim()) e.delivery_address = 'Wajib untuk incoterm ini';
    if (!form.cargo_ready_date) e.cargo_ready_date = 'Wajib diisi';
    // Section 03 — child mandatory (gated by visibility)
    if (showSea) {
      if (!form.sea_freight_type) e.sea_freight_type = 'Wajib diisi';
      if (isFCL) {
        if (!form.sea_container_types.length) e.sea_container_types = 'Pilih minimal 1 tipe kontainer';
        else if (form.sea_container_types.some(c => !form.sea_container_qty[c] || Number(form.sea_container_qty[c]) < 1)) e.sea_container_qty = 'Isi qty tiap tipe kontainer (min 1)';
      }
      if (isLCL) {
        if (form.sea_lcl_gw === '') e.sea_lcl_gw = 'Wajib diisi';
        if (!form.sea_lcl_dimension.trim()) e.sea_lcl_dimension = 'Wajib diisi';
        if (form.sea_lcl_volume === '') e.sea_lcl_volume = 'Wajib diisi';
        if (form.sea_lcl_koli === '') e.sea_lcl_koli = 'Wajib diisi';
      }
    }
    if (showAir) {
      if (form.air_gw === '') e.air_gw = 'Wajib diisi';
      if (!form.air_dimension.trim()) e.air_dimension = 'Wajib diisi';
      if (form.air_volume === '') e.air_volume = 'Wajib diisi';
      if (form.air_koli === '') e.air_koli = 'Wajib diisi';
    }
    if (showInland) {
      if (!form.inland_fleet_types.length) e.inland_fleet_types = 'Pilih minimal 1 armada';
      if (!form.inland_pickup_address.trim()) e.inland_pickup_address = 'Wajib diisi';
      if (!form.inland_delivery_address.trim()) e.inland_delivery_address = 'Wajib diisi';
    }
    if (showProject) {
      if (!form.project_freight_types.length) e.project_freight_types = 'Pilih minimal 1 tipe';
      if (form.project_qty === '') e.project_qty = 'Wajib diisi';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  async function generatePrfNo(companyId, code) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { data, error } = await supabase.rpc('increment_document_sequence', {
      p_company_id: companyId, p_document_type: 'PRF', p_department_code: 'PROC', p_year: year, p_month: month,
    });
    if (error) throw new Error('Gagal generate nomor PRF, coba lagi.');
    return `PRF/${code || 'MSI'}/${year}/${toRoman(month)}/${String(data).padStart(3, '0')}`;
  }

  const handleSave = async (status) => {
    if (status === 'SUBMITTED' && !validate()) return;
    setSaving(true);
    try {
      const prf_no = await generatePrfNo(profile.company_id, companyCode);
      // Sea FCL qty jsonb — only checked types, numeric.
      const qtyClean = {};
      if (showSea && isFCL) form.sea_container_types.forEach(c => {
        const v = form.sea_container_qty[c];
        if (v !== '' && v != null && !Number.isNaN(Number(v))) qtyClean[c] = Number(v);
      });
      const payload = {
        prf_no,
        company_id: profile.company_id,
        created_by: profile.id,
        status,
        submitted_at: status === 'SUBMITTED' ? new Date().toISOString() : null,
        // Informasi Dasar
        customer_source: form.customer_source,
        account_id: form.account_id || null,
        account_name_manual: form.account_name_manual.trim() || null,
        inquiry_id: form.customer_source === 'inquiry' ? (form.inquiry_id || null) : null,
        stream: form.stream || null,
        deadline_quotation: form.deadline_quotation || null,
        // Inquiry Details
        direction: form.direction || null,
        commodity: form.commodity || null,
        hs_code: form.hs_code || null,
        msds_available: isDG ? !!form.msds_available : false,
        service_type: form.service_type || null,
        incoterms: form.incoterms || null,
        commercial_value: showCommercial && form.commercial_value !== '' ? Number(form.commercial_value) : null,
        commercial_currency: showCommercial ? (form.commercial_currency || null) : null,
        origin: form.origin || null,
        destination: form.destination || null,
        pickup_address: form.pickup_address.trim() || null,
        delivery_address: form.delivery_address.trim() || null,
        add_on_services: form.add_on_services.length ? form.add_on_services : null,
        add_on_others: showOthers ? (form.add_on_others.trim() || null) : null,
        cargo_ready_date: form.cargo_ready_date || null,
        // Section 03 — child fields (null bila section tak visible)
        sea_freight_type: showSea ? (form.sea_freight_type || null) : null,
        sea_container_types: (showSea && isFCL && form.sea_container_types.length) ? form.sea_container_types : null,
        sea_container_qty: (showSea && isFCL && Object.keys(qtyClean).length) ? qtyClean : null,
        sea_lcl_gw: (showSea && isLCL && form.sea_lcl_gw !== '') ? Number(form.sea_lcl_gw) : null,
        sea_lcl_dimension: (showSea && isLCL) ? (form.sea_lcl_dimension.trim() || null) : null,
        sea_lcl_volume: (showSea && isLCL && form.sea_lcl_volume !== '') ? Number(form.sea_lcl_volume) : null,
        sea_lcl_koli: (showSea && isLCL && form.sea_lcl_koli !== '') ? Number(form.sea_lcl_koli) : null,
        air_gw: (showAir && form.air_gw !== '') ? Number(form.air_gw) : null,
        air_dimension: showAir ? (form.air_dimension.trim() || null) : null,
        air_volume: (showAir && form.air_volume !== '') ? Number(form.air_volume) : null,
        air_koli: (showAir && form.air_koli !== '') ? Number(form.air_koli) : null,
        inland_fleet_types: (showInland && form.inland_fleet_types.length) ? form.inland_fleet_types : null,
        inland_pickup_address: showInland ? (form.inland_pickup_address.trim() || null) : null,
        inland_delivery_address: showInland ? (form.inland_delivery_address.trim() || null) : null,
        inland_gw: (showInland && form.inland_gw !== '') ? Number(form.inland_gw) : null,
        inland_dimension: showInland ? (form.inland_dimension.trim() || null) : null,
        custom_doc_type: showCustom ? customDocType : null,
        project_freight_types: (showProject && form.project_freight_types.length) ? form.project_freight_types : null,
        project_qty: (showProject && form.project_qty !== '') ? Number(form.project_qty) : null,
        notes: form.notes.trim() || null,
      };
      const { error } = await supabase.from('prf').insert(payload);
      if (error) throw error;
      showToast?.(status === 'SUBMITTED' ? `PRF ${prf_no} berhasil dikirim` : `Draft PRF ${prf_no} tersimpan`);
      onBack();
    } catch (err) {
      showToast?.('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const year = new Date().getFullYear();
  const monthRoman = toRoman(new Date().getMonth() + 1);
  const badgePreview = `PRF/${companyCode || '—'}/${year}/${monthRoman}/—`;

  const errText = (k) => errors[k] && <span style={{ fontSize: 12, color: C.error, marginTop: 5, display: 'block' }}>{errors[k]}</span>;

  return (
    <div style={{ background: C.pageBg, padding: '8px 8px 40px', borderRadius: 16 }}>
      <div style={S.page}>
        {/* header card */}
        <div style={S.headerCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={S.hTitle}>Buat PRF Baru</h1>
              <div style={S.hSub}>Price Request Form</div>
            </div>
            <span style={S.inqBadge}>{badgePreview}</span>
          </div>
          <div style={{ marginTop: 20 }}><ActionsBar saving={saving} onBack={onBack} onSave={handleSave} /></div>
        </div>

        {/* SECTION 01 — Informasi Dasar */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>01</div><div style={S.secTitle}>Informasi Dasar</div>
            <div style={S.secSub}>Sumber, akun &amp; tenggat penawaran</div>
          </div>
          <div style={S.secBody}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 0', background: '#F8FAFC', border: '1px solid ' + C.border, borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
              <div style={S.infoChip}><User size={16} color={C.navy} /><span><span style={S.infoChipK}>Sales</span><span style={S.infoChipV}>{profile?.full_name || user?.email || '—'}</span></span></div>
              <div style={S.infoDiv} />
              <div style={S.infoChip}><Calendar size={16} color={C.navy} /><span><span style={S.infoChipK}>Tanggal PRF</span><span style={S.infoChipV}>{todayISO().split('-').reverse().join('/')}</span></span></div>
              <div style={S.infoDiv} />
              <div style={S.infoChip}><Hash size={16} color={C.navy} /><span><span style={S.infoChipK}>No. PRF</span><span style={{ ...S.infoChipV, fontFamily: "'IBM Plex Mono',monospace" }}>{badgePreview}</span></span></div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <Field label="Sumber" span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[['customer', 'Customer (Existing)'], ['prospect', 'Prospect'], ['inquiry', 'Inquiry']].map(([t, lbl]) => (
                    <button key={t} type="button" onClick={() => onSourceChange(t)}
                      style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", border: '1px solid ' + (form.customer_source === t ? C.navy : C.border), background: form.customer_source === t ? C.navy : '#fff', color: form.customer_source === t ? '#fff' : C.sub }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </Field>

              <div style={grid2}>
                <Field label={form.customer_source === 'inquiry' ? 'Inquiry' : (form.customer_source === 'prospect' ? 'Prospect' : 'Customer')} required>
                  <div style={{ position: 'relative' }}>
                    {form.customer_source === 'inquiry' ? (
                      <select value={form.inquiry_id} onChange={onInquiryPick} style={selInput}>
                        <option value="">— Pilih inquiry —</option>
                        {inquiries.map(i => <option key={i.id} value={i.id}>{i.inquiry_no}</option>)}
                      </select>
                    ) : (
                      <select value={form.account_id} onChange={set('account_id')} style={selInput}>
                        <option value="">— Pilih {form.customer_source === 'prospect' ? 'prospect' : 'customer'} —</option>
                        {(form.customer_source === 'prospect' ? prospects : customers).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}<Chevron />
                  </div>
                  {errText('account')}
                </Field>
                <Field label="Nama Manual" hint={<span style={S.hint}> (jika tak ada di daftar)</span>}>
                  <input value={form.account_name_manual} onChange={set('account_name_manual')} style={S.input} placeholder="Ketik nama customer/prospect…" />
                </Field>
              </div>

              <div style={grid2}>
                <Field label="Stream">
                  <div style={{ position: 'relative' }}>
                    <select value={form.stream} onChange={set('stream')} style={selInput}>
                      <option value="">— Pilih stream —</option>
                      {streamOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select><Chevron />
                  </div>
                  <span style={S.hint}>Kategori bisnis untuk pelaporan. Boleh berbeda dari Service Type di bawah.</span>
                </Field>
                <Field label="Deadline Quotation" required>
                  <input type="date" value={form.deadline_quotation} onChange={set('deadline_quotation')} style={S.input} />
                  {errText('deadline_quotation')}
                </Field>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 02 — Inquiry Details */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>02</div><div style={S.secTitle}>Inquiry Details</div>
            <div style={S.secSub}>Arah, komoditas, service type &amp; incoterm</div>
          </div>
          <div style={S.secBody}>
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={grid2}>
                <Field label="Direction" required>
                  <div style={{ position: 'relative' }}>
                    <select value={form.direction} onChange={onDirectionChange} style={selInput}>
                      <option value="">— Pilih direction —</option>
                      {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select><Chevron />
                  </div>
                  {errText('direction')}
                </Field>
                <Field label="Commodity" required>
                  <div style={{ position: 'relative' }}>
                    <select value={form.commodity} onChange={set('commodity')} style={selInput}>
                      <option value="">— Pilih commodity —</option>
                      {COMMODITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select><Chevron />
                  </div>
                  {errText('commodity')}
                </Field>
              </div>

              <div style={grid2}>
                <Field label="HS Code" required={isImpExp} hint={<span style={S.hint}> (8 digit{isImpExp ? '' : ', opsional'})</span>}>
                  <input value={form.hs_code} onChange={(e) => setForm(f => ({ ...f, hs_code: e.target.value.replace(/\D/g, '').slice(0, 8) }))} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="00000000" inputMode="numeric" />
                  {errText('hs_code')}
                </Field>
                {isDG && (
                  <Field label="MSDS" required>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid ' + (errors.msds_available ? C.error : C.border), background: '#fff', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.msds_available} onChange={(e) => setForm(f => ({ ...f, msds_available: e.target.checked }))} style={{ width: 16, height: 16, accentColor: C.navy }} />
                      <span style={{ fontSize: 14, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} color={C.orange} /> MSDS tersedia (wajib untuk Dangerous Good)</span>
                    </label>
                    {errText('msds_available')}
                  </Field>
                )}
              </div>

              <div style={grid2}>
                <Field label="Service Type" required>
                  <div style={{ position: 'relative' }}>
                    <select value={form.service_type} onChange={onServiceTypeChange} style={selInput}>
                      <option value="">— Pilih service type —</option>
                      {SERVICE_TYPES.map(s => {
                        const disabled = s.value === 'custom' && form.direction === 'domestic';
                        return <option key={s.value} value={s.value} disabled={disabled}>{s.label}{disabled ? ' (tak tersedia utk Domestic)' : ''}</option>;
                      })}
                    </select><Chevron />
                  </div>
                  {errText('service_type')}
                </Field>
                <Field label="Incoterms" hint={form.service_type === 'air' ? <span style={S.hint}> (7 term — Air)</span> : null}>
                  <div style={{ position: 'relative' }}>
                    <select value={form.incoterms} onChange={set('incoterms')} style={selInput}>
                      <option value="">— Pilih incoterm —</option>
                      {incotermOpts.map(t => <option key={t} value={t}>{t}</option>)}
                    </select><Chevron />
                  </div>
                </Field>
              </div>

              {showCommercial && (
                <div style={grid2}>
                  <Field label="Commercial Value" hint={<span style={S.hint}> (wajib utk {form.incoterms})</span>}>
                    <input value={form.commercial_value} onChange={setNum('commercial_value')} style={S.input} placeholder="0" inputMode="decimal" />
                  </Field>
                  <Field label="Currency">
                    <div style={{ position: 'relative' }}>
                      <select value={form.commercial_currency} onChange={set('commercial_currency')} style={selInput}>
                        <option value="">— Pilih currency —</option>
                        {currencies.map(c => <option key={c.code} value={c.code}>{c.code}{c.name ? ` — ${c.name}` : ''}</option>)}
                      </select><Chevron />
                    </div>
                  </Field>
                </div>
              )}

              <div style={grid2}>
                <Field label="Origin"><input value={form.origin} onChange={set('origin')} style={S.input} placeholder="Kota, Negara" /></Field>
                <Field label="Destination"><input value={form.destination} onChange={set('destination')} style={S.input} placeholder="Kota, Negara" /></Field>
              </div>

              <div style={grid2}>
                <Field label="Pickup Address" required={pickupReq}>
                  <textarea value={form.pickup_address} onChange={set('pickup_address')} rows={2} style={S.textarea} placeholder="Alamat penjemputan…" />
                  {errText('pickup_address')}
                </Field>
                <Field label="Delivery Address" required={deliveryReq}>
                  <textarea value={form.delivery_address} onChange={set('delivery_address')} rows={2} style={S.textarea} placeholder="Alamat pengiriman…" />
                  {errText('delivery_address')}
                </Field>
              </div>

              <div>
                <div style={S.label}>Add On Services</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {ADD_ONS.map(a => {
                    const disabled = a.customs && form.direction === 'domestic';
                    return <Pill key={a.value} active={form.add_on_services.includes(a.value)} disabled={disabled} onClick={() => toggleArr('add_on_services', a.value)}>{a.label}</Pill>;
                  })}
                </div>
                {form.direction === 'domestic' && <span style={S.hint}>Layanan customs dinonaktifkan untuk Domestic.</span>}
              </div>

              {showOthers && (
                <Field label="Add On — Others" span>
                  <input value={form.add_on_others} onChange={set('add_on_others')} style={S.input} placeholder="Sebutkan layanan lain…" />
                </Field>
              )}

              <div style={grid2}>
                <Field label="Cargo Ready Date" required>
                  <input type="date" value={form.cargo_ready_date} onChange={set('cargo_ready_date')} style={S.input} />
                  {errText('cargo_ready_date')}
                </Field>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 03 — Detail Layanan (child fields per service_type) */}
        {form.service_type && (
          <section style={S.card}>
            <div style={S.secBar}>
              <div style={S.secNum}>03</div><div style={S.secTitle}>Detail Layanan</div>
              <div style={S.secSub}>Detail spesifik sesuai service type</div>
            </div>
            <div style={S.secBody}>
              <div style={{ display: 'grid', gap: 18 }}>
                {/* SEA */}
                {showSea && (
                  <>
                    <div style={grid2}>
                      <Field label="Freight Type" required>
                        <div style={{ position: 'relative' }}>
                          <select value={form.sea_freight_type} onChange={set('sea_freight_type')} style={selInput}>
                            <option value="">— Pilih —</option>
                            {SEA_FREIGHT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select><Chevron />
                        </div>
                        {errText('sea_freight_type')}
                      </Field>
                    </div>
                    {isFCL && (
                      <div>
                        <div style={S.label}>Container Type<span style={S.req}>*</span></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                          {SEA_CONTAINERS.map(ct => (
                            <div key={ct.code}>
                              <Pill active={form.sea_container_types.includes(ct.code)} onClick={() => toggleContainer(ct.code)}>{ct.label}</Pill>
                              {form.sea_container_types.includes(ct.code) && (
                                <input value={form.sea_container_qty[ct.code] ?? ''} onChange={setContainerQty(ct.code)} style={{ ...S.input, marginTop: 8 }} placeholder={`Qty ${ct.label}`} inputMode="numeric" />
                              )}
                            </div>
                          ))}
                        </div>
                        {errText('sea_container_types')}
                        {errText('sea_container_qty')}
                      </div>
                    )}
                    {isLCL && (
                      <div style={grid2}>
                        <Field label="GW (kgs)" required><input value={form.sea_lcl_gw} onChange={setNum('sea_lcl_gw')} style={S.input} placeholder="0" inputMode="decimal" />{errText('sea_lcl_gw')}</Field>
                        <Field label="Dimension (PxLxT)" required><input value={form.sea_lcl_dimension} onChange={set('sea_lcl_dimension')} style={S.input} placeholder="cth: 120x80x100 cm" />{errText('sea_lcl_dimension')}</Field>
                        <Field label="Volume (m³)" required><input value={form.sea_lcl_volume} onChange={setNum('sea_lcl_volume')} style={S.input} placeholder="0" inputMode="decimal" />{errText('sea_lcl_volume')}</Field>
                        <Field label="Koli" required><input value={form.sea_lcl_koli} onChange={setInt('sea_lcl_koli')} style={S.input} placeholder="0" inputMode="numeric" />{errText('sea_lcl_koli')}</Field>
                      </div>
                    )}
                  </>
                )}
                {/* AIR */}
                {showAir && (
                  <div style={grid2}>
                    <Field label="GW (kgs)" required><input value={form.air_gw} onChange={setNum('air_gw')} style={S.input} placeholder="0" inputMode="decimal" />{errText('air_gw')}</Field>
                    <Field label="Dimension (PxLxT)" required><input value={form.air_dimension} onChange={set('air_dimension')} style={S.input} placeholder="cth: 120x80x100 cm" />{errText('air_dimension')}</Field>
                    <Field label="Volume (m³)" required><input value={form.air_volume} onChange={setNum('air_volume')} style={S.input} placeholder="0" inputMode="decimal" />{errText('air_volume')}</Field>
                    <Field label="Koli" required><input value={form.air_koli} onChange={setInt('air_koli')} style={S.input} placeholder="0" inputMode="numeric" />{errText('air_koli')}</Field>
                  </div>
                )}
                {/* INLAND */}
                {showInland && (
                  <>
                    <div>
                      <div style={S.label}>Fleet Type<span style={S.req}>*</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                        {INLAND_FLEETS.map(fl => <Pill key={fl} active={form.inland_fleet_types.includes(fl)} onClick={() => toggleArr('inland_fleet_types', fl)}>{fl}</Pill>)}
                      </div>
                      {errText('inland_fleet_types')}
                    </div>
                    <div style={grid2}>
                      <Field label="Pickup Address" required><textarea value={form.inland_pickup_address} onChange={set('inland_pickup_address')} rows={2} style={S.textarea} placeholder="Alamat penjemputan…" />{errText('inland_pickup_address')}</Field>
                      <Field label="Delivery Address" required><textarea value={form.inland_delivery_address} onChange={set('inland_delivery_address')} rows={2} style={S.textarea} placeholder="Alamat pengiriman…" />{errText('inland_delivery_address')}</Field>
                    </div>
                    <div style={grid2}>
                      <Field label="GW (kgs)" hint={<span style={S.hint}> (opsional)</span>}><input value={form.inland_gw} onChange={setNum('inland_gw')} style={S.input} placeholder="0" inputMode="decimal" /></Field>
                      <Field label="Dimension" hint={<span style={S.hint}> (opsional)</span>}><input value={form.inland_dimension} onChange={set('inland_dimension')} style={S.input} placeholder="PxLxT" /></Field>
                    </div>
                  </>
                )}
                {/* CUSTOM */}
                {showCustom && (
                  <Field label="Tipe Dokumen" span>
                    <div style={{ ...S.input, display: 'flex', alignItems: 'center', background: C.navySoft, borderColor: C.navy, color: C.navy, fontWeight: 700 }}>
                      {customDocType ? `${customDocType} + Handling` : '—'}
                    </div>
                    <span style={S.hint}>Otomatis dari Direction ({customDocType || 'pilih Import/Export'}).</span>
                  </Field>
                )}
                {form.service_type === 'custom' && !showCustom && (
                  <div style={{ ...S.hint, marginTop: 0 }}>Centang add-on Custom Clearance untuk detail dokumen.</div>
                )}
                {/* PROJECT */}
                {showProject && (
                  <>
                    <div>
                      <div style={S.label}>Freight Type<span style={S.req}>*</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                        {PROJECT_FREIGHTS.map(pf => <Pill key={pf} active={form.project_freight_types.includes(pf)} onClick={() => toggleArr('project_freight_types', pf)}>{pf}</Pill>)}
                      </div>
                      {errText('project_freight_types')}
                    </div>
                    <div style={grid2}>
                      <Field label="Qty" required><input value={form.project_qty} onChange={setInt('project_qty')} style={S.input} placeholder="0" inputMode="numeric" />{errText('project_qty')}</Field>
                    </div>
                    <span style={S.hint}>Penentuan Project Shipment masih sementara — perlu kesepakatan procurement &amp; sales.</span>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 04 — Catatan */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>04</div><div style={S.secTitle}>Catatan Tambahan</div>
            <div style={S.secSub}>Instruksi khusus untuk tim procurement (opsional)</div>
          </div>
          <div style={S.secBody}>
            <textarea value={form.notes} onChange={set('notes')} rows={5} style={S.textarea} placeholder="Tambahkan catatan khusus atau informasi tambahan…" />
          </div>
        </section>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
          <ActionsBar saving={saving} onBack={onBack} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}
