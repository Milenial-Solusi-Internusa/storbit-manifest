// src/modules/crm/InquiryFormPage.jsx
// UI follows the Lovable "Buat Inquiry Baru" (RFQ) design (slate/white, navy/orange,
// Montserrat/Inter/IBM Plex Mono). Existing fields/logic preserved; new RFQ columns
// (deadline_quote, pol, pod, incoterms[], container_types[], goods_name, hs_code,
// weight_kg, volume_cbm, cargo_types[], un_number, imo_class, has_msds,
// additional_services[]) added to the form + INSERT payload.
import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronDown, Send, X, Check, User, Calendar, Hash, Anchor, MapPin,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { getTodayWIB } from '../../lib/dateUtils';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import AccountPicker from '../../components/AccountPicker';
// Sumber TUNGGAL kosakata kargo & layanan tambahan — dipakai bersama
// DealDetailPage. Tidak boleh dideklarasikan ulang di sini.
import { CARGO_TYPES, SERVICES } from './inquiryOptions';

const C = {
  navy: '#1B4D8A', navyDark: '#0F3768', navySoft: '#EEF3FB',
  orange: '#E85A1E', orangeDark: '#C94D18', orangeSoft: '#FDF0E9',
  pageBg: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderStrong: '#CBD5E1',
  text: '#0F172A', sub: '#475569', muted: '#94A3B8',
  success: '#16A34A', warning: '#F59E0B', error: '#DC2626',
};

const SERVICE_TYPES_FALLBACK = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs', label: 'Customs Clearance' },
  { value: 'trading', label: 'General Trading' },
];
const INCOTERMS = ['EXW', 'FOB', 'CFR/CNF', 'CIF', 'DDU/DAP', 'DDP'];
const CONTAINERS = ["FCL 20'", "FCL 40'", "FCL 40'HC", 'LCL'];
const IMO_CLASSES = ['Class 1 — Explosives', 'Class 2 — Gases', 'Class 3 — Flammable Liquids', 'Class 4 — Flammable Solids', 'Class 5 — Oxidizers', 'Class 6 — Toxic', 'Class 7 — Radioactive', 'Class 8 — Corrosives', 'Class 9 — Miscellaneous'];
const MSDS_OPTS = ['Ya', 'Tidak', 'Not Sure Yet'];

// Kelompok lifecycle lifecycle_stage. Dropdown inquiry harus bisa memilih akun
// pra-customer (lead/mql/sql/prospect) supaya trigger gerbang Fase 2 hidup.
// TODO: hapus 'lead_pool' setelah backfill lifecycle - lihat AUDIT_CRM_FLOW.md
const PRA_CUSTOMER_STATUS = ['lead', 'mql', 'sql', 'prospect', 'lead_pool'];
const CUSTOMER_SIDE_STATUS = ['customer', 'free_agent'];
const LIFECYCLE_LABEL = { lead: 'Lead', mql: 'MQL', sql: 'SQL', prospect: 'Prospect', lead_pool: 'Lead Pool', customer: 'Customer', free_agent: 'Free Agent' };
const lifecycleLabel = (s) => LIFECYCLE_LABEL[s] || s || '';

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
  miniLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 5 },
  req: { color: C.orange, fontWeight: 800 },
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

function Field({ label, required, span, hint, children }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : 'auto' }}>
      <div style={S.label}>{label}{required && <span style={S.req}>*</span>}{hint}</div>
      {children}
    </div>
  );
}
function Chevron() { return <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><ChevronDown size={16} color={C.muted} /></span>; }
const selInput = { ...S.input, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' };

function Pill({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ height: 44, borderRadius: 10, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid ' + (active ? C.navy : C.border), background: active ? C.navy : '#fff', color: active ? '#fff' : C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {active && <Check size={15} />}{children}
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
function ServiceCard({ item, active, onClick }) {
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

async function generateInquiryNo(companyId, companyCode) {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('increment_document_sequence', {
    p_company_id: companyId, p_document_type: 'INQ', p_department_code: 'CRM', p_year: year, p_month: 0,
  });
  if (error) throw new Error('Failed to generate the document number, please try again.');
  return `INQ/${companyCode || 'MSI'}/${year}/${String(data).padStart(3, '0')}`;
}

export default function InquiryFormPage({ onBack, showToast, inquiryId, mode = 'create', prefillAccountId = null, prefillContactId = null }) {
  const { profile, erpRole, user } = useAuth();
  const { options: serviceTypeOpts } = useDropdownOptions('service_type', SERVICE_TYPES_FALLBACK);
  const isEdit = mode === 'edit' && !!inquiryId;

  const [form, setForm] = useState({
    prospect_id: '', customer_id: '', contact_id: '', service_type: 'freight_forwarding',
    route: '', estimated_volume: '', estimated_value: '', notes: '',
    // new RFQ fields
    deadline_quote: '', pol: '', pod: '', incoterms: [], container_types: [],
    goods_name: '', hs_code: '', weight_kg: '', volume_cbm: '', dimension: '',
    cargo_types: [], un_number: '', imo_class: '', has_msds: '',
    additional_services: [],
    pickup_address: '', delivery_address: '',
  });
  const [prospects, setProspects] = useState([]);
  const [customers, setCustomers] = useState([]);
  // Kontak milik akun yang SEDANG terpilih saja — bukan seluruh contacts perusahaan.
  // Disimpan BESERTA id akun pemiliknya supaya daftar milik akun sebelumnya tak sempat
  // terbaca sebagai milik akun baru selama fetch berikutnya masih jalan (lihat turunan
  // `contacts`/`contactsLoaded` di bawah). Reset-nya turunan, bukan setState di effect.
  const [contactsFor, setContactsFor] = useState({ accountId: null, list: [] });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [sourceType, setSourceType] = useState('prospect');
  const [editNo, setEditNo] = useState('');   // existing inquiry_no (edit mode header)
  // Display text for the searchable account pickers. form.prospect_id/customer_id
  // stay the stored source of truth; these hold only what's shown in the input.
  const [prospectText, setProspectText] = useState('');
  const [customerText, setCustomerText] = useState('');

  useEffect(() => {
    if (!profile?.company_id) return;
    // Akun yang sedang parkir di Lead Pool tak boleh dipilih untuk dokumen baru —
    // harus ditarik dulu lewat approval. is_in_lead_pool=false di semua picker.
    supabase.from('accounts').select('id, name, lifecycle_stage').eq('company_id', profile.company_id).in('lifecycle_stage', PRA_CUSTOMER_STATUS).eq('is_in_lead_pool', false).is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setProspects(data || []));
    supabase.from('accounts').select('id, name, lifecycle_stage').eq('company_id', profile.company_id).in('lifecycle_stage', CUSTOMER_SIDE_STATUS).eq('is_in_lead_pool', false).is('deleted_at', null).order('name').limit(1000)
      .then(({ data }) => setCustomers(data || []));
  }, [profile?.company_id]);

  // Akun yang sedang jadi sumber inquiry ini. Satu turunan dipakai bersama oleh
  // fetch kontak + render field Kontak, supaya tak ada dua definisi yang melenceng.
  const resolvedAccountId = sourceType === 'prospect' ? form.prospect_id : form.customer_id;
  // Daftar kontak dianggap milik akun sekarang HANYA bila id-nya cocok. Selama fetch
  // akun baru belum selesai, `contactsLoaded` false → UI menahan diri (bukan menampilkan
  // "belum punya kontak" yang keliru, dan bukan daftar akun sebelumnya).
  const contactsLoaded = contactsFor.accountId === resolvedAccountId;
  const contacts = contactsLoaded ? contactsFor.list : [];

  // ── Prefill dari Detail Account ("+ New Inquiry") ────────────────────────────
  // HANYA mode create: mode edit punya jalur populate sendiri di bawah dan tak boleh
  // ditimpa. Toggle Prospect|Customer diturunkan dari lifecycle_stage akunnya (bukan
  // ditebak), memakai dua daftar status yang SUDAH dipakai dropdown di atas — jadi
  // akun yang jatuh di bucket customer otomatis membuka toggle "Customer (Existing)".
  // Akun di-inject ke daftar dropdown-nya supaya namanya tampil walau daftar utama
  // belum/tak memuatnya (pola sama dengan inject edit-mode di bawah).
  useEffect(() => {
    if (isEdit || !prefillAccountId) return undefined;
    let cancelled = false;
    supabase.from('accounts').select('id, name, lifecycle_stage')
      .eq('id', prefillAccountId).is('deleted_at', null).maybeSingle()
      .then(({ data: acc }) => {
        if (cancelled || !acc) return;
        const isCustomerSide = CUSTOMER_SIDE_STATUS.includes(acc.lifecycle_stage);
        const opt = { id: acc.id, name: acc.name, lifecycle_stage: acc.lifecycle_stage };
        setSourceType(isCustomerSide ? 'customer' : 'prospect');
        if (isCustomerSide) {
          setCustomers(prev => prev.some(c => c.id === acc.id) ? prev : [opt, ...prev]);
          setCustomerText(acc.name);
        } else {
          setProspects(prev => prev.some(p => p.id === acc.id) ? prev : [opt, ...prev]);
          setProspectText(acc.name);
        }
        setForm(f => ({
          ...f,
          prospect_id: isCustomerSide ? '' : acc.id,
          customer_id: isCustomerSide ? acc.id : '',
          // Kontak dari pemanggil (kontak utama akun) dipakai bila ada; kalau null,
          // fetch kontak di bawah yang menentukan default-nya.
          contact_id: prefillContactId || f.contact_id,
        }));
      });
    return () => { cancelled = true; };
  }, [isEdit, prefillAccountId, prefillContactId]);

  // ── Kontak akun terpilih ────────────────────────────────────────────────────
  // SATU mekanisme untuk ketiga kasus (0 / 1 / banyak kontak): selalu ambil daftar
  // kontak akun ini, lalu pilih default-nya di sini — bukan tiga cabang UI berbeda.
  // Default = kontak UTAMA (is_primary) bila ada; kalau tidak ada primary TAPI cuma
  // ada satu kontak, pakai yang satu itu. Selebihnya dibiarkan kosong supaya user
  // memilih sadar. Pilihan yang SUDAH ada (prefill dari pemanggil / mode edit / hasil
  // klik user) TIDAK PERNAH ditimpa.
  // Filter `deleted_at` saja — sengaja TIDAK menyaring is_active, supaya jumlah kontak
  // di sini sama persis dengan tab Kontak di Detail Account (yang juga menampilkan yang
  // non-aktif, dengan badge). Yang non-aktif ditandai di label, bukan disembunyikan.
  useEffect(() => {
    if (!resolvedAccountId) return undefined;
    let cancelled = false;
    supabase.from('contacts')
      .select('id, name, position, is_primary, is_active')
      .eq('account_id', resolvedAccountId).is('deleted_at', null)
      .order('is_primary', { ascending: false }).order('name').limit(1000)
      .then(({ data }) => {
        if (cancelled) return;
        const list = data || [];
        setContactsFor({ accountId: resolvedAccountId, list });
        setForm(f => {
          if (f.contact_id) return f;
          const auto = list.find(c => c.is_primary) || (list.length === 1 ? list[0] : null);
          return auto ? { ...f, contact_id: auto.id } : f;
        });
      });
    return () => { cancelled = true; };
  }, [resolvedAccountId]);

  // Edit mode — fetch the inquiry and populate the form once.
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    supabase.from('inquiries').select('*').eq('id', inquiryId).maybeSingle()
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        setEditNo(data.inquiry_no || '');
        const linkedId = data.customer_id || data.prospect_id || '';
        setSourceType(data.customer_id ? 'customer' : 'prospect');
        setForm({
          prospect_id: data.prospect_id || '',
          customer_id: data.customer_id || '',
          // WAJIB ikut dipopulate: `fields` di handleSave dipakai bersama oleh create
          // DAN update, jadi tanpa baris ini setiap Simpan di mode edit akan menimpa
          // contact_id yang sudah tersimpan dengan NULL.
          contact_id: data.contact_id || '',
          service_type: data.service_type || 'freight_forwarding',
          route: data.route || '',
          estimated_volume: data.estimated_volume || '',
          estimated_value: data.estimated_value != null ? String(data.estimated_value) : '',
          notes: data.notes || '',
          deadline_quote: data.deadline_quote || '',
          pol: data.pol || '',
          pod: data.pod || '',
          incoterms: data.incoterms || [],
          container_types: data.container_types || [],
          goods_name: data.goods_name || '',
          hs_code: data.hs_code || '',
          weight_kg: data.weight_kg != null ? String(data.weight_kg) : '',
          volume_cbm: data.volume_cbm != null ? String(data.volume_cbm) : '',
          dimension: data.dimension || '',
          cargo_types: data.cargo_types || [],
          un_number: data.un_number || '',
          imo_class: data.imo_class || '',
          has_msds: data.has_msds || '',
          additional_services: data.additional_services || [],
          pickup_address: data.pickup_address || '',
          delivery_address: data.delivery_address || '',
        });
        // Make sure the linked account appears in its dropdown (it may be inactive
        // or in the other status bucket) so the name renders instead of blank.
        if (linkedId) {
          const { data: acc } = await supabase.from('accounts').select('id, name, lifecycle_stage').eq('id', linkedId).maybeSingle();
          if (cancelled || !acc) return;
          const opt = { id: acc.id, name: acc.name, lifecycle_stage: acc.lifecycle_stage };
          if (data.customer_id) { setCustomers(prev => prev.some(c => c.id === acc.id) ? prev : [opt, ...prev]); setCustomerText(acc.name); }
          else { setProspects(prev => prev.some(p => p.id === acc.id) ? prev : [opt, ...prev]); setProspectText(acc.name); }
        }
      });
    return () => { cancelled = true; };
  }, [isEdit, inquiryId]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') }));
  const toggleArr = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

  const validate = () => {
    const e = {};
    if (sourceType === 'prospect' && !form.prospect_id) e.source = 'Select prospect';
    if (sourceType === 'customer' && !form.customer_id) e.source = 'Select customer';
    if (!form.service_type) e.service_type = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Fields shared by create + edit (inquiry_no / company_id / created_by /
      // status are NOT mutated on edit).
      const fields = {
        prospect_id: sourceType === 'prospect' ? (form.prospect_id || null) : (form.customer_id || null),
        customer_id: null,
        // Jalur tulis PERTAMA untuk kolom `inquiries.contact_id` (FK ke contacts,
        // nullable — akun tanpa kontak tetap boleh punya inquiry). Sebelum ini kolomnya
        // ada tapi nol penulis di seluruh FE.
        contact_id: form.contact_id || null,
        service_type: form.service_type,
        route: form.route || null,
        estimated_volume: form.estimated_volume || null,
        // Kosong → NULL, BUKAN 0. `inquiries.estimated_value` sengaja nullable
        // tanpa default (migrasi 20260722000007) supaya "belum diisi" bisa
        // dibedakan dari "nol"; menulis 0 akan mencemari total nilai pipeline di
        // Dashboard dan menghapus perbedaan itu selamanya. Ini juga sebabnya
        // pola di sini mengikuti weight_kg/volume_cbm, BUKAN modal Edit Deal
        // yang menulis ke accounts.estimated_value (kolom itu DEFAULT 0).
        estimated_value: form.estimated_value !== '' ? Number(form.estimated_value) : null,
        notes: form.notes || null,
        deadline_quote: form.deadline_quote || null,
        pol: form.pol || null,
        pod: form.pod || null,
        incoterms: form.incoterms.length ? form.incoterms : null,
        container_types: form.container_types.length ? form.container_types : null,
        goods_name: form.goods_name || null,
        hs_code: form.hs_code || null,
        weight_kg: form.weight_kg !== '' ? Number(form.weight_kg) : null,
        volume_cbm: form.volume_cbm !== '' ? Number(form.volume_cbm) : null,
        dimension: form.dimension || null,
        cargo_types: form.cargo_types.length ? form.cargo_types : null,
        un_number: form.un_number || null,
        imo_class: form.imo_class || null,
        has_msds: form.has_msds || null,
        additional_services: form.additional_services.length ? form.additional_services : null,
        pickup_address: form.pickup_address || null,
        delivery_address: form.delivery_address || null,
      };

      if (isEdit) {
        const { error } = await supabase.from('inquiries').update(fields).eq('id', inquiryId);
        if (error) throw error;
        logAudit(supabase, {
          action: ACTION_TYPES.UPDATE_INQUIRY, entityType: ENTITY_TYPES.INQUIRY, entityId: inquiryId, entityLabel: editNo,
        }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
        showToast?.('Inquiry updated');
        onBack();
        return;
      }

      const companyRow = await supabase.from('companies').select('code').eq('id', profile.company_id).maybeSingle();
      const companyCode = companyRow.data?.code || 'MSI';
      const inquiry_no = await generateInquiryNo(profile.company_id, companyCode);

      // `owner_id` = pembuat inquiry (keputusan Den 30 Agu 2026). Kolomnya lahir
      // di Batch Persiapan dengan backfill dari created_by, tapi sampai batch ini
      // NOL jalur tulis mengisinya — akibatnya setiap inquiry baru sejak 27 Agu
      // ber-owner_id NULL, dan Sales Performance + filter Pemilik Deal di Pipeline
      // tak punya apa pun untuk dikelompokkan. Nilainya sengaja sama dengan
      // created_by di sini, TAPI dua kolom ini bukan sinonim: created_by permanen,
      // owner_id bisa dipindahtangankan selama deal masih terbuka (Detail Deal).
      const payload = { inquiry_no, company_id: profile.company_id, status: 'OPEN', created_by: profile.id, owner_id: profile.id, ...fields };
      const { error } = await supabase.from('inquiries').insert(payload);
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_INQUIRY, entityType: ENTITY_TYPES.INQUIRY, entityId: null, entityLabel: inquiry_no,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.('Inquiry created');
      onBack();
    } catch (err) {
      showToast?.('Failed to save: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const dgSelected = form.cargo_types.includes('dg');

  return (
    <div style={{ background: C.pageBg, padding: '8px 8px 40px', borderRadius: 16 }}>
      <div style={S.page}>
        {/* header card */}
        <div style={S.headerCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={S.hTitle}>{isEdit ? 'Edit Inquiry' : 'New Inquiry'}</h1>
              <div style={S.hSub}>Request for Quotation (RFQ) Form</div>
            </div>
            <span style={S.inqBadge}>{isEdit ? (editNo || '—') : `INQ/MSI/${new Date().getFullYear()}/—`}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" style={S.btnGhost} onClick={onBack}><X size={16} />Cancel</button>
            <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={handleSave} disabled={saving}>
              <Send size={16} />{saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Submit Inquiry')}
            </button>
          </div>
        </div>

        {/* SECTION 01 — Informasi Dasar */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>01</div><div style={S.secTitle}>Informasi Dasar</div>
            <div style={S.secSub}>Sales, customer &amp; quotation deadline</div>
          </div>
          <div style={S.secBody}>
            {/* auto-filled info row */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 0', background: '#F8FAFC', border: '1px solid ' + C.border, borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
              <div style={S.infoChip}><User size={16} color={C.navy} /><span><span style={S.infoChipK}>Sales</span><span style={S.infoChipV}>{profile?.full_name || user?.email || '—'}</span></span></div>
              <div style={S.infoDiv} />
              <div style={S.infoChip}><Calendar size={16} color={C.navy} /><span><span style={S.infoChipK}>Inquiry Date</span><span style={S.infoChipV}>{getTodayWIB().split('-').reverse().join('/')}</span></span></div>
              <div style={S.infoDiv} />
              <div style={S.infoChip}><Hash size={16} color={C.navy} /><span><span style={S.infoChipK}>No. Inquiry</span><span style={{ ...S.infoChipV, fontFamily: "'IBM Plex Mono',monospace" }}>INQ/MSI/{new Date().getFullYear()}/—</span></span></div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              {/* source toggle */}
              <Field label="Sumber" span>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['prospect', 'customer'].map(t => (
                    <button key={t} type="button" onClick={() => { setSourceType(t); setForm(f => ({ ...f, prospect_id: '', customer_id: '', contact_id: '' })); setProspectText(''); setCustomerText(''); }}
                      style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", border: '1px solid ' + (sourceType === t ? C.navy : C.border), background: sourceType === t ? C.navy : '#fff', color: sourceType === t ? '#fff' : C.sub }}>
                      {t === 'prospect' ? 'Prospect' : 'Customer (Existing)'}
                    </button>
                  ))}
                </div>
              </Field>

              <div style={grid2}>
                <Field label={sourceType === 'prospect' ? 'Prospect' : 'Customer'} required>
                  {sourceType === 'prospect' ? (
                    <AccountPicker
                      value={prospectText}
                      accounts={prospects}
                      statusLabel={lifecycleLabel}
                      inputStyle={S.input}
                      placeholder="Search prospects…"
                      onChangeText={(v) => { setProspectText(v); setForm(f => ({ ...f, prospect_id: '', contact_id: '' })); }}
                      onPick={(a) => { setProspectText(a.name); setForm(f => ({ ...f, prospect_id: a.id, contact_id: '' })); }}
                    />
                  ) : (
                    <AccountPicker
                      value={customerText}
                      accounts={customers}
                      statusLabel={lifecycleLabel}
                      inputStyle={S.input}
                      placeholder="Search customers…"
                      onChangeText={(v) => { setCustomerText(v); setForm(f => ({ ...f, customer_id: '', contact_id: '' })); }}
                      onPick={(a) => { setCustomerText(a.name); setForm(f => ({ ...f, customer_id: a.id, contact_id: '' })); }}
                    />
                  )}
                  {sourceType === 'prospect' && prospects.length === 0 && (
                    <span style={{ fontSize: 12, color: C.sub, marginTop: 5, display: 'block' }}>All accounts are currently in the Lead Pool. Claim one from the Lead Pool first to use it.</span>
                  )}
                  {errors.source && <span style={{ fontSize: 12, color: C.error, marginTop: 5, display: 'block' }}>{errors.source}</span>}
                </Field>
                <Field label="Deadline Quote">
                  <input type="date" value={form.deadline_quote} onChange={set('deadline_quote')} style={S.input} />
                </Field>
              </div>

              {/* Contact — hanya muncul setelah akun terpilih (lewat prefill "+ New
                  Inquiry" dari Detail Account MAUPUN pilih manual di picker atas), karena
                  daftarnya DIBATASI ke kontak akun itu saja. Tidak wajib: akun tanpa
                  kontak tetap boleh menyimpan inquiry (lihat catatan gate di laporan). */}
              {resolvedAccountId && (
                <div style={grid2}>
                  <Field label="Contact">
                    {!contactsLoaded ? (
                      <span style={{ fontSize: 12, color: C.muted, display: 'block', paddingTop: 6 }}>Loading contacts…</span>
                    ) : contacts.length === 0 ? (
                      <span style={{ fontSize: 12, color: C.sub, display: 'block', paddingTop: 6 }}>
                        This account has no contacts yet. Add one from Account Detail → Contacts tab.
                      </span>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <select value={form.contact_id} onChange={set('contact_id')} style={selInput}>
                          <option value="">— Select contact —</option>
                          {contacts.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.position ? ` — ${c.position}` : ''}
                              {c.is_primary ? ' (Primary)' : ''}
                              {c.is_active === false ? ' (Inactive)' : ''}
                            </option>
                          ))}
                        </select><Chevron />
                      </div>
                    )}
                  </Field>
                </div>
              )}

              <div style={grid2}>
                <Field label="Service Type" required>
                  <div style={{ position: 'relative' }}>
                    <select value={form.service_type} onChange={set('service_type')} style={selInput}>
                      {serviceTypeOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select><Chevron />
                  </div>
                  {errors.service_type && <span style={{ fontSize: 12, color: C.error, marginTop: 5, display: 'block' }}>{errors.service_type}</span>}
                </Field>
                {/* Nilai estimasi deal — OPSIONAL, sesuai blueprint yang tidak
                    mewajibkannya untuk status OPEN. Prefix "Rp" mengikuti pola
                    modal Edit Deal; input mono + setNum mengikuti Berat/Volume
                    di bawah. Dikosongkan = NULL, bukan 0. */}
                <Field label="Deal Estimated Value">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>Rp</span>
                    <input
                      value={form.estimated_value}
                      onChange={setNum('estimated_value')}
                      style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingLeft: 38 }}
                      placeholder="0"
                    />
                  </div>
                  <span style={{ fontSize: 11.5, color: C.muted, marginTop: 5, display: 'block' }}>
                    {form.estimated_value !== ''
                      ? `Rp ${Number(form.estimated_value).toLocaleString('id-ID')}`
                      : 'Optional. Can be left empty and filled in later on the Deal Detail page.'}
                  </span>
                </Field>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 02 — Detail Shipment & Kargo */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>02</div><div style={S.secTitle}>Detail Shipment &amp; Kargo</div>
            <div style={S.secSub}>Route, incoterm, container &amp; cargo specification</div>
          </div>
          <div style={S.secBody}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={grid2}>
                <div style={{ minWidth: 0 }}>
                  <div style={S.miniLabel}>Origin</div>
                  <div style={S.label}><Anchor size={13} color={C.navy} /> POL: Port of Loading</div>
                  <input value={form.pol} onChange={set('pol')} style={S.input} placeholder="cth: Tanjung Priok - IDJKT" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...S.miniLabel, color: C.orange }}>Destination</div>
                  <div style={S.label}><MapPin size={13} color={C.orange} /> POD: Port of Discharge</div>
                  <input value={form.pod} onChange={set('pod')} style={S.input} placeholder="cth: Singapore - SGSIN" />
                </div>
              </div>

              <div style={grid2}>
                <div style={{ minWidth: 0 }}>
                  <div style={S.label}><Anchor size={13} color={C.navy} /> Pickup Address</div>
                  <textarea value={form.pickup_address} onChange={set('pickup_address')} rows={2} style={S.textarea} placeholder="Cargo pickup address…" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={S.label}><MapPin size={13} color={C.orange} /> Delivery Address</div>
                  <textarea value={form.delivery_address} onChange={set('delivery_address')} rows={2} style={S.textarea} placeholder="Cargo delivery address…" />
                </div>
              </div>

              <div>
                <div style={S.label}>Incoterm</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {INCOTERMS.map(t => <Pill key={t} active={form.incoterms.includes(t)} onClick={() => toggleArr('incoterms', t)}>{t}</Pill>)}
                </div>
              </div>

              <div>
                <div style={S.label}>Container Type</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                  {CONTAINERS.map(t => <Pill key={t} active={form.container_types.includes(t)} onClick={() => toggleArr('container_types', t)}>{t}</Pill>)}
                </div>
              </div>

              <div style={grid2}>
                <Field label="Item Name (EN)"><input value={form.goods_name} onChange={set('goods_name')} style={S.input} placeholder="e.g. Industrial Machinery" /></Field>
                <Field label="HS Code"><input value={form.hs_code} onChange={set('hs_code')} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="0000.00.00" /></Field>
              </div>

              <div style={grid2}>
                <Field label="Total Weight">
                  <div style={{ position: 'relative' }}>
                    <input value={form.weight_kg} onChange={setNum('weight_kg')} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingRight: 56 }} placeholder="0" />
                    <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>KG</span>
                  </div>
                </Field>
                <Field label="Volume">
                  <div style={{ position: 'relative' }}>
                    <input value={form.volume_cbm} onChange={setNum('volume_cbm')} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingRight: 56 }} placeholder="0" />
                    <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>CBM</span>
                  </div>
                </Field>
              </div>

              <div style={grid2}>
                <Field label="Dimensi (P x L x T)"><input value={form.dimension} onChange={set('dimension')} style={S.input} placeholder="cth: 120 x 80 x 100 cm" /></Field>
              </div>

              {/* preserved existing fields */}
              <div style={grid2}>
                <Field label="Route"><input value={form.route} onChange={set('route')} style={S.input} placeholder="cth: Jakarta – Surabaya" /></Field>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 03 — Cargo checklist */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>03</div><div style={S.secTitle}>Checklist Kargo Khusus</div>
            <div style={S.secSub}>Flag cargo characteristics for correct handling</div>
          </div>
          <div style={S.secBody}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.orange, marginBottom: 14 }}>Kategori Kargo</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {CARGO_TYPES.map(c => <CargoCard key={c.id} item={c} active={form.cargo_types.includes(c.id)} onClick={() => toggleArr('cargo_types', c.id)} />)}
            </div>

            {dgSelected && (
              <div style={{ marginTop: 18, border: '1px solid ' + C.border, borderLeft: '3px solid ' + C.orange, borderRadius: 12, background: '#FFFCFA', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <AlertTriangle size={16} color={C.orange} />
                  <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: C.text }}>Detail Dangerous Goods</span>
                </div>
                <div style={{ ...grid2, marginBottom: 18 }}>
                  <Field label="UN Number"><input value={form.un_number} onChange={(e) => setForm(f => ({ ...f, un_number: e.target.value.replace(/\D/g, '') }))} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="0000" /></Field>
                  <Field label="IMO Class">
                    <div style={{ position: 'relative' }}>
                      <select value={form.imo_class} onChange={set('imo_class')} style={selInput}>
                        <option value="">— Select IMO Class —</option>
                        {IMO_CLASSES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select><Chevron />
                    </div>
                  </Field>
                </div>
                <div style={S.label}>MSDS Available?</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {MSDS_OPTS.map(o => <RadioPill key={o} value={o} current={form.has_msds} onClick={() => set('has_msds')({ target: { value: o } })}>{o}</RadioPill>)}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 04 — Layanan Tambahan */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>04</div><div style={S.secTitle}>Additional Services</div>
            <div style={S.secSub}>Select the services needed (optional)</div>
          </div>
          <div style={S.secBody}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {SERVICES.map(s => <ServiceCard key={s.id} item={s} active={form.additional_services.includes(s.id)} onClick={() => toggleArr('additional_services', s.id)} />)}
            </div>
          </div>
        </section>

        {/* SECTION 05 — Notes */}
        <section style={S.card}>
          <div style={S.secBar}>
            <div style={S.secNum}>05</div><div style={S.secTitle}>Additional Notes</div>
            <div style={S.secSub}>Special instructions for the operations team</div>
          </div>
          <div style={S.secBody}>
            <textarea value={form.notes} onChange={set('notes')} rows={5} style={S.textarea}
              placeholder="Add any special notes, instructions, or extra information the operations team should know…" />
          </div>
        </section>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
          <button type="button" style={S.btnGhost} onClick={onBack}><ChevronLeft size={16} />Cancel</button>
          <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={handleSave} disabled={saving}>
            <Send size={16} />{saving ? 'Saving…' : 'Submit Inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}
