// src/modules/crm/lead/pages/LeadDetailPage.jsx
// "Lead Qualification to Inquiry" / Detail Lead -- design-handoff/crm-2026-10-11/
// shots/lead/16-23 (sales) + 30-32 (supervisor). Batch DS 3 Lead Management,
// Paket 1 irisan 5. Rute /crm/lead/capture/:id (crm.routes.jsx).
//
// Akun yang SUDAH lifecycle_stage='customer' TIDAK PERNAH merender halaman
// ini -- LeadDetailRoute (crm.routes.jsx) mengalihkan ke /crm/customer/:id
// SEBELUM mount. Tab "Customer" di mockup (33-detail-customertab-preview…)
// karena itu SENGAJA TIDAK DIBANGUN di sini.
//
// Related Documents SATU panel DI BAWAH Notebook (bukan di dalam tab apa
// pun) -- dirender sekali di body FormSheet, persis instruksi "panel di
// bawah tab", dan tampil identik di seluruh enam tab karena anatominya
// memang begitu di mockup.
import { useCallback, useEffect, useState } from 'react';
import { MoreVertical, Phone, Mail, MessageCircle, MapPin, Calendar, FileText, Users, RefreshCw, Inbox } from 'lucide-react';
import {
  Notebook, Badge, Card, DocNo, EmptyState, SaveButton, Button, OutlineBtn, PrimaryBtn,
  FloatingInput, FloatingSelect, MasterSelect, Textarea, IconButton,
} from '../../../../kit';
import {
  INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, CARD, DISABLED_BG, SEMANTIC, ACCENT, ACCENT_HOVER, FONT_BODY, FONT_HEAD, FONT_MONO,
  RADIUS, SP, fmtRp, avatarToneFor,
} from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isManagerOrAbove } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { readMoneyInput, formatIdNumber } from '../../../../lib/numberFormat';
import { BANT_DIMENSIONS, BANT_MAX_SCORE, calcBantScore, QUALIFICATION_FIELDS } from '../../lib/bant';
import { LEAD_STATUS_META, deriveLeadStatus } from '../lib/leadStatus';
import { SOURCE_LABELS, PRIORITIES, ROLE_TYPE_LABELS } from '../lib/leadOptions';
import { ACTIVITY_TYPE_LABEL, listLeadActivities, addLeadNote, scheduleLeadFollowUp } from '../lib/leadActivity';
import RequestNewOptionModal from '../../components/RequestNewOptionModal';
import ContactModal from '../components/ContactModal';
import ReassignModal from '../components/ReassignModal';
import MarkAsLostModal from '../components/MarkAsLostModal';
import ArchiveModal from '../components/ArchiveModal';
import ReleaseToPoolModal from '../components/ReleaseToPoolModal';
import LeadStageBar from '../components/LeadStageBar';
import { useDetailCrumb } from '../../../../routes/useDetailCrumb';
// TD-318 Lead Detail, #29: label "di atas kotak" persis komposer Date/Time
// mockup (:263) -- impor langsung dari Form.jsx (pola sama MasterSelect.jsx),
// kit/index.js belum mengekspornya lewat barrel.
import { FieldLabel } from '../../../../kit/Form';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// `span` (TD-318 Lead Detail, Kategori D): rentang kolom EKSPLISIT (mis.
// `span={2}` -- Address di section Company, grid3 mockup :215), berbeda
// dari `full` yang selalu merentang SELURUH kolom (1/-1).
function ViewField({ label, value, mono, full, span }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : span ? `span ${span}` : undefined, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 14px', background: CARD, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 4, fontFamily: FONT_BODY }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? INK : INK_FAINT, fontFamily: mono ? FONT_MONO : FONT_BODY, fontWeight: 500, fontStyle: value ? 'normal' : 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value || 'Not set'}
      </div>
    </div>
  );
}

// Varian ViewField yang nilainya bisa diklik (tel:/wa.me/mailto:) -- TD-318
// Lead Detail, #27, kartu kontak. Bentuk kotak IDENTIK ViewField, persis
// mockup (Detail/Contacts :254-255: <a> di dalam kotak yang sama).
function ViewFieldLink({ label, value, href, mono }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 14px', background: CARD, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 4, fontFamily: FONT_BODY }}>{label}</div>
      {value ? (
        <a href={href} style={{ display: 'block', fontSize: 14, color: INK, fontFamily: mono ? FONT_MONO : FONT_BODY, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </a>
      ) : (
        <div style={{ fontSize: 14, color: INK_FAINT, fontFamily: mono ? FONT_MONO : FONT_BODY, fontWeight: 500, fontStyle: 'italic' }}>Not set</div>
      )}
    </div>
  );
}

// Persis mockup `waLink` (Lead Management.dc.html :698): buang karakter
// bukan digit, buang '0' di depan, tambah kode negara '62'.
function waLink(wa) {
  return '62' + String(wa || '').replace(/[^0-9]/g, '').replace(/^0/, '');
}

// Owner di kartu Commercial (OverviewTab) -- bentuk kotak sama dengan
// ViewField, tapi isinya OwnerLine supaya link "Reassign" ikut tampil
// (mockup: Reassign muncul di SINI juga, bukan cuma di info-row header).
// `tint` (TD-318 Lead Detail, token): latar DISABLED_BG persis mockup
// `ownerBoxBg` (:223) -- Owner TIDAK ikut diedit tapi tetap duduk di
// dalam grid mode-edit Commercial, tint membedakannya dari field yang
// sungguh editable di sebelahnya.
function OwnerField({ id, name, canReassign, onReassign, tint }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 14px', background: tint ? DISABLED_BG : CARD, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 4, fontFamily: FONT_BODY }}>Owner</div>
      <OwnerLine id={id} name={name} canReassign={canReassign} onReassign={onReassign} />
    </div>
  );
}

// Bagian polos dalam SATU Card (OverviewTab: Company/Commercial/Notes) --
// BUKAN tiga <Card title=...> bersarang. Mockup (16-detail-overview-sales.png)
// menunjukkan ketiganya sebagai judul tebal + tombol Edit TANPA pita warna
// header, dipisah garis horizontal tipis -- ketiganya hidup di dalam SATU
// bingkai kartu luar (dibungkus LeadDetailPage, lihat komentar di sana).
function SectionBlock({ title, action, children, first }) {
  return (
    <div style={{ paddingTop: first ? 0 : SP.s5, marginTop: first ? 0 : SP.s5, borderTop: first ? 'none' : `1px solid ${LINE_SOFT}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.s4 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: INK }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.s4 };
const grid3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SP.s4 };

// TD-318 Lead Detail, token: avatar SELALU dirender (24px, persis D.avBg/
// D.avBd mockup -- :195) -- kosong jadi lingkaran dashed LINE/LINE_SOFT
// TANPA inisial, bukan diganti teks polos. "Reassign" FONT_HEAD weight
// 600 persis mockup (`font:600 12.5px Montserrat,sans-serif`, :195), bukan
// FONT_BODY.
function OwnerLine({ id, name, canReassign, onReassign }) {
  const tone = name ? avatarToneFor(id) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {name ? (
        <span style={{ width: 24, height: 24, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 24px', border: '1px dashed transparent' }}>
          {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </span>
      ) : (
        <span style={{ width: 24, height: 24, borderRadius: 999, background: LINE_SOFT, border: `1px dashed ${LINE}`, flex: '0 0 24px' }} />
      )}
      <span style={{ fontSize: 14, color: name ? INK : INK_FAINT, fontFamily: FONT_BODY, fontStyle: name ? 'normal' : 'italic' }}>{name || 'Unassigned'}</span>
      {canReassign && (
        <button type="button" onClick={onReassign} style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_HEAD }}>Reassign</button>
      )}
    </div>
  );
}

/**
 * @param {string} id
 * @param {() => void} onBack
 * @param {(account: Object) => void} [onCreateInquiry]
 * @param {(inquiryId:string) => void} [onOpenInquiry]
 * @param {(quotationId:string) => void} [onOpenQuotation]
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {boolean} [quickEditOnMount] - "Quick Edit" dari Lead Capture (mockup rmEdit): buka dengan Company langsung mode edit
 * @param {boolean} [openNoteOnMount] - "Add Note" dari Lead Capture (mockup rmNote, TD-318 Irisan 1 N3): buka dengan tab Activity aktif + kotak catatan terbuka
 */
export default function LeadDetailPage({ id, onBack, onCreateInquiry, onOpenInquiry, onOpenQuotation, showToast, quickEditOnMount, openNoteOnMount }) {
  const { profile, erpRoles, hasMenuPermission } = useAuth();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [actorMap, setActorMap] = useState({});
  const [inquiries, setInquiries] = useState([]);
  const [latestInquiry, setLatestInquiry] = useState(null);
  const [latestQuotation, setLatestQuotation] = useState(null);
  const [industryOptions, setIndustryOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [lostReasonOptions, setLostReasonOptions] = useState([]);
  const [requestOptionFor, setRequestOptionFor] = useState(null);

  // TD-318 Irisan 1, N3: "Add Note" dari menu baris "⋮" Lead Capture (mockup
  // rmNote) mendarat di sini dengan tab Activity SUDAH aktif -- lihat juga
  // ActivityTab di bawah untuk kotak catatan yang ikut terbuka.
  const [tab, setTab] = useState(() => (openNoteOnMount ? 'activity' : 'overview'));
  // TD-318 Lead Detail (tes Den #25+#26): SATU slot edit Company/Commercial/
  // Notes, persis mockup `s.editSec` -- DI-HOIST ke sini (bukan di
  // OverviewTab) karena LeadDetailPage TIDAK remount saat pindah tab,
  // sementara OverviewTab remount tiap pindah tab (render kondisional).
  // Lazy initializer sama dgn `tab` di atas: Quick Edit (mockup rmEdit) set
  // 'Company' SEKALI di sini, bukan di-derive ulang tiap OverviewTab mount.
  const [editSec, setEditSec] = useState(() => (quickEditOnMount ? 'Company' : null));
  const [menuOpen, setMenuOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [poolHistory, setPoolHistory] = useState([]);

  const fetchAccount = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('accounts')
      .select('*, assigned_profile:profiles!prospects_assigned_to_fkey(id, full_name)')
      .eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) showToast?.('Failed to load lead: ' + error.message, 'error');
    setAccount(data || null);
    setLoading(false);
  }, [id, showToast]);
  useEffect(() => { Promise.resolve().then(fetchAccount); }, [fetchAccount]);

  const fetchContacts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('contacts').select('*').eq('account_id', id).is('deleted_at', null)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true });
    setContacts(data || []);
  }, [id]);
  useEffect(() => { Promise.resolve().then(fetchContacts); }, [fetchContacts]);

  const fetchActivities = useCallback(async () => {
    if (!id) return;
    const { data, error } = await listLeadActivities(id);
    if (error) { showToast?.('Failed to load activity: ' + error.message, 'error'); return; }
    setActivities(data || []);
    const ids = [...new Set((data || []).map((a) => a.created_by).filter(Boolean))];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map = {};
      (profs || []).forEach((p) => { map[p.id] = p.full_name; });
      setActorMap((prev) => ({ ...prev, ...map }));
    }
  }, [id, showToast]);
  useEffect(() => { Promise.resolve().then(fetchActivities); }, [fetchActivities]);

  // Riwayat Lead Pool (irisan 9 Paket 2, Task 4.4.5) -- digabung ke timeline
  // Activity tab, BUKAN tab tersendiri (mockup menunjukkan "Pooled"/
  // "Unpooled" sebagai entri di dalam timeline Activity, lihat ACTIVITY_ICON
  // `inbox` di bawah). actorMap DIGABUNG (bukan ditimpa) dengan yang dibangun
  // fetchActivities di atas -- dua fetch independen, union id profil.
  const fetchPoolHistory = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('account_pool_history')
      .select('id, event_type, actor_id, previous_owner, new_owner, reason, occurred_at')
      .eq('account_id', id).order('occurred_at', { ascending: false }).limit(200);
    if (error) { console.error('[lead] pool history fetch failed:', error.message); return; }
    setPoolHistory(data || []);
    const ids = [...new Set((data || []).flatMap((h) => [h.actor_id, h.previous_owner, h.new_owner]).filter(Boolean))];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const map = {};
      (profs || []).forEach((p) => { map[p.id] = p.full_name; });
      setActorMap((prev) => ({ ...prev, ...map }));
    }
  }, [id]);
  useEffect(() => { Promise.resolve().then(fetchPoolHistory); }, [fetchPoolHistory]);

  // Tab History (koreksi Den atas mockup 20): SELURUH inquiry akun ini,
  // bukan cuma yang terbaru -- `inquiries` dipakai HistoryTab, `latestInquiry`
  // (= inquiries[0]) tetap dipakai Related Documents (satu baris terbaru,
  // anatomi panel itu tak berubah).
  const fetchHistory = useCallback(async () => {
    if (!id) return;
    const { data: inqs } = await supabase.from('inquiries').select('id, inquiry_no, status, created_at')
      .eq('prospect_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    setInquiries(inqs || []);
    const inq = inqs?.[0] || null;
    setLatestInquiry(inq);
    if (inq) {
      const { data: quos } = await supabase.from('quotations').select('id, quotation_no, status, revision')
        .eq('inquiry_id', inq.id).is('deleted_at', null).order('revision', { ascending: false }).limit(1);
      setLatestQuotation(quos?.[0] || null);
    } else {
      setLatestQuotation(null);
    }
  }, [id]);
  useEffect(() => { Promise.resolve().then(fetchHistory); }, [fetchHistory]);

  useEffect(() => {
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lead_industry').eq('is_active', true).is('deleted_at', null)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setIndustryOptions(data || []));
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lead_category').eq('is_active', true).is('deleted_at', null)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setCategoryOptions(data || []));
    // "Lost Reason" (Notes tab, status lost) -- account.lost_reason adalah
    // VALUE dropdown (MarkAsLostModal), bukan teks bebas; dibaca di sini
    // supaya view-mode bisa menampilkan LABEL-nya, bukan slug mentah.
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lost_reason').eq('is_active', true).is('deleted_at', null)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setLostReasonOptions(data || []));
  }, []);

  // TD-318 Lead Detail, #19: crumb ke-4 breadcrumb (ADITIF, lihat
  // ContextHeader.jsx/useDetailCrumb.js) -- persis mockup `crumbs` (lead.code),
  // dengan fallback nama akun kalau code kosong (keputusan Den).
  useDetailCrumb(account?.code || account?.name || null);

  const companyId = account?.company_id;
  const canManage = account ? isManagerOrAbove(erpRoles, { companyId }) : false;
  const isOwner = account ? account.assigned_to === profile?.id : false;
  const status = account ? deriveLeadStatus(account) : null;
  const statusMeta = status ? LEAD_STATUS_META[status] : null;
  const bantScore = account ? calcBantScore(account) : 0;
  const entityCode = ENTITIES.find((e) => e.id === companyId)?.code || '—';

  const canMarkQualified = account && status === 'raw' && (isOwner || canManage);
  // TD-318 Lead Detail (tes Den, LINGKUP #5): persis mockup `canLost = st
  // ==='Raw' || st==='Qualified'` (:584) -- SEBELUMNYA `status !== 'lost'`
  // meloloskan 'converted' juga, padahal lead yang sudah punya inquiry
  // aktif ditutup lewat inquiry-nya, bukan lewat Lead Management.
  const canMarkLost = account && (status === 'raw' || status === 'qualified') && (isOwner || canManage);
  const canArchive = !!canManage;
  // Release to Pool (irisan 9 Paket 2, Task A.5) -- menu item tampil kalau
  // pemilik ATAU pemegang crm_lead_pool_approval, DAN lead/mql, DAN belum
  // di pool. Cek inquiry/quotation terbuka SENGAJA TIDAK direplikasi di sini
  // (RPC lead_pool_release tetap penjaga utama -- pesan gagalnya tampil apa
  // adanya lewat showToast kalau ada dokumen terbuka).
  const canReleasePool = account && ['lead', 'mql'].includes(account.lifecycle_stage) && !account.is_in_lead_pool
    && (isOwner || hasMenuPermission('crm_lead_pool_approval', 'view'));
  // "Lost at <tahap>" (mockup, LeadStageBar) diturunkan dari qualified_at --
  // TANPA kolom baru. Lead yang belum pernah qualified_at -> "Raw", sudah ->
  // "Qualified". Kasus lost SESUDAH Converted (sudah py inquiry) tak punya
  // acuan visual di mockup -- lihat laporan akhir.
  const lostAtLabel = account?.qualified_at ? 'Qualified' : 'Raw';
  const canReactivate = account && status === 'lost' && (isOwner || canManage);

  async function handleMarkQualified() {
    const { error } = await supabase.from('accounts')
      .update({ qualified_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', id);
    if (error) return { error };
    await supabase.from('activities').insert({
      account_id: id, company_id: companyId, type: 'status_change', status: 'done',
      notes: 'Raw to Qualified', created_by: profile.id, completed_at: new Date().toISOString(),
    });
    setAccount((a) => ({ ...a, qualified_at: new Date().toISOString() }));
    fetchActivities();
    return undefined;
  }

  // "Reactivate" (tombol, mockup Lost) -- KEPUTUSAN Den (koreksi irisan 7):
  // Lost -> Raw murni (lifecycle_stage 'lead' DAN qualified_at dikosongkan,
  // bukan kebalikan simetris Mark as Lost yang semula dipertahankan
  // qualified_at). Alasan lost lama + kompetitor dicatat di log aktivitas
  // SEBELUM dibersihkan (resolve label dropdown dari lostReasonOptions,
  // sama seperti view-mode Notes) -- begitu dibersihkan, nilainya hilang
  // permanen dari `accounts`, jadi log adalah satu-satunya jejaknya.
  async function handleReactivate() {
    const reasonLabel = account?.lost_reason
      ? (lostReasonOptions.find((o) => o.value === account.lost_reason)?.label || account.lost_reason)
      : null;
    const competitor = account?.competitor_name;
    const { error } = await supabase.from('accounts').update({
      lifecycle_stage: 'lead', qualified_at: null, lost_reason: null, competitor_name: null,
      last_activity_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return { error };
    const lines = ['Lost to Raw, reactivated.'];
    if (reasonLabel) lines.push(`Previous lost reason: ${reasonLabel}.`);
    if (competitor) lines.push(`Previous competitor: ${competitor}.`);
    await supabase.from('activities').insert({
      account_id: id, company_id: companyId, type: 'status_change', status: 'done',
      notes: lines.join(' '), created_by: profile.id, completed_at: new Date().toISOString(),
    });
    setAccount((a) => ({ ...a, lifecycle_stage: 'lead', qualified_at: null, lost_reason: null, competitor_name: null }));
    fetchActivities();
    showToast?.('Lead reactivated');
    return undefined;
  }

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>;
  }
  if (!account) {
    return <EmptyState icon="inbox" title="Lead not found" sub="It may have been archived or removed." action={<OutlineBtn onClick={onBack}>Back to list</OutlineBtn>} />;
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'activity', label: 'Activity' },
    { id: 'bant', label: 'BANT & Pipeline' },
    { id: 'history', label: 'History' },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
          <button type="button" onClick={onBack} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: INK_SOFT, fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY }}>
            ← Back to list
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.s4, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: INK_SOFT }}>
              Lead
            </div>
            <div style={{ display: 'flex', gap: SP.s2, alignItems: 'center', position: 'relative' }}>
              {/* Satu tombol primer EKSKLUSIF per status (TD-318 Irisan 0c,
                  keputusan Den 13 Okt 2026) -- persis variabel `prim` di
                  mockup (Lead Management.dc.html: st==='Raw' ? MarkQualified
                  : st==='Qualified' ? CreateInquiry : st==='Lost' ?
                  Reactivate : null). SEBELUMNYA `canMarkQualified` dan
                  cabang Create Inquiry dua kondisi TERPISAH yang bisa
                  sama-sama true untuk lead Raw (pemilik/manager) --
                  menampilkan KEDUA tombol sekaligus, padahal mockup hanya
                  satu. Status 'converted'/'customer' sengaja TANPA tombol
                  primer (sama seperti mockup -- 'customer' sendiri sudah
                  tak pernah sampai di sini, lihat redirect LeadDetailRoute). */}
              {status === 'raw' && canMarkQualified && (
                <SaveButton onSave={handleMarkQualified} variant="secondary" label="Mark Qualified" savedLabel="Qualified!"
                  onError={(err) => showToast?.('Failed to update: ' + err.message, 'error')} />
              )}
              {status === 'qualified' && !account.is_in_lead_pool && onCreateInquiry && (
                <PrimaryBtn onClick={() => onCreateInquiry(account)}>Create Inquiry</PrimaryBtn>
              )}
              {status === 'lost' && canReactivate && (
                <SaveButton onSave={handleReactivate} label="Reactivate" savedLabel="Reactivated!"
                  onError={(err) => showToast?.('Failed to update: ' + err.message, 'error')} />
              )}
              {/* TD-318 Lead Detail, #21: persis mockup `isConverted` (:190)
                  -- slot SAMA dengan tombol primer, karena status 'converted'
                  TIDAK punya tombol primer sendiri (lihat komentar di atas). */}
              {status === 'converted' && latestInquiry && (
                <span style={{ fontSize: 13.5, color: INK_SOFT, fontFamily: FONT_BODY }}>
                  Converted to <DocNo style={{ fontWeight: 600 }}>{latestInquiry.inquiry_no}</DocNo>
                </span>
              )}
              {(canMarkLost || canArchive || canReleasePool) && (
                <>
                  <IconButton icon={<MoreVertical size={16} />} label="More actions" onClick={() => setMenuOpen((o) => !o)} />
                  {menuOpen && (
                    <>
                      <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 160, zIndex: 10, overflow: 'hidden' }}>
                        {canMarkLost && (
                          <button type="button" onClick={() => { setMenuOpen(false); setLostOpen(true); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: '#B4432A' }}>
                            Mark as Lost
                          </button>
                        )}
                        {canArchive && (
                          <button type="button" onClick={() => { setMenuOpen(false); setArchiveOpen(true); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>
                            Archive
                          </button>
                        )}
                        {canReleasePool && (
                          <button type="button" onClick={() => { setMenuOpen(false); setReleaseOpen(true); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>
                            Release to Pool
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: INK, lineHeight: 1.15 }}>
            {account.name}
          </h1>

          <div style={{ display: 'flex', gap: SP.s3, alignItems: 'center', flexWrap: 'wrap' }}>
            {account.code && <DocNo style={{ fontWeight: 600 }}>{account.code}</DocNo>}
            {statusMeta && <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
            {account.is_stale && <Badge tone="warn" title={`Not touched since ${fmtDate(account.stale_flagged_at)}`}>Stale</Badge>}
            <Badge tone="neutral">{entityCode}</Badge>
            <Badge tone="neutral">{SOURCE_LABELS[account.source] || account.source || '—'}</Badge>
            {/* TD-318 Lead Detail, #20: persis mockup D.inPool (:186). */}
            {account.is_in_lead_pool && <Badge tone="neutral">In Lead Pool</Badge>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s5, paddingTop: SP.s3, borderTop: `1px solid ${LINE_SOFT}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Owner</div>
              <OwnerLine id={account.assigned_to} name={account.assigned_profile?.full_name} canReassign={canManage} onReassign={() => setReassignOpen(true)} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Last Touched</div>
              <div style={{ fontSize: 14, color: INK, fontFamily: FONT_MONO }}>{fmtDate(account.last_activity_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Estimated Value</div>
              <div style={{ fontSize: 14, color: INK, fontFamily: FONT_MONO }}>{account.estimated_value != null ? fmtRp(account.estimated_value) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>BANT Score</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: INK, fontWeight: 600 }}>{bantScore}/{BANT_MAX_SCORE}</span>
                {/* TD-318 Lead Detail, token: 40x4 persis mockup D.scorePct (:198), bukan 60x5. */}
                <span style={{ width: 40, height: 4, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', display: 'inline-block' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(bantScore / BANT_MAX_SCORE) * 100}%`, background: INK_SOFT, borderRadius: 999 }} />
                </span>
              </div>
            </div>
          </div>

          <LeadStageBar status={status} lostAtLabel={lostAtLabel} />
        </div>
      </Card>

      <div style={{ marginTop: SP.s6 }}>
        {/* Notebook dibungkus Card -- mockup (17/19-detail-*.png) merender
            tab bar + isi tab di dalam SATU kartu putih berbingkai, terpisah
            dari Related Documents (kartu sendiri di bawahnya, RelatedDocuments
            sudah membungkus dirinya sendiri). Sebelumnya Notebook dirender
            telanjang tanpa bingkai sama sekali. */}
        <Card>
          <Notebook tabs={tabs} value={tab} onChange={setTab}>
            {tab === 'overview' && (
              <OverviewTab
                account={account} setAccount={setAccount} id={id} companyId={companyId} status={status}
                industryOptions={industryOptions} categoryOptions={categoryOptions} lostReasonOptions={lostReasonOptions}
                canManage={canManage} onReassign={() => setReassignOpen(true)}
                onRequestNewOption={(key) => setRequestOptionFor(key)}
                onAddOption={(key, opt) => { if (key === 'industry') setIndustryOptions((o) => [...o, opt]); else setCategoryOptions((o) => [...o, opt]); }}
                showToast={showToast}
                editSec={editSec} setEditSec={setEditSec}
              />
            )}
            {tab === 'contacts' && (
              <ContactsTab contacts={contacts} accountId={id} companyId={companyId} showToast={showToast} onChanged={fetchContacts} />
            )}
            {tab === 'activity' && (
              <ActivityTab activities={activities} poolHistory={poolHistory} actorMap={actorMap} accountId={id} companyId={companyId}
                profile={profile} showToast={showToast} onChanged={fetchActivities} autoOpenNote={openNoteOnMount} />
            )}
            {tab === 'bant' && <BantTab account={account} id={id} setAccount={setAccount} showToast={showToast} />}
            {tab === 'history' && <HistoryTab inquiries={inquiries} onOpenInquiry={onOpenInquiry} />}
            {tab === 'notes' && (
              <NotesTab activities={activities} actorMap={actorMap} accountId={id} companyId={companyId}
                profile={profile} showToast={showToast} onChanged={fetchActivities} />
            )}
          </Notebook>
        </Card>

        <RelatedDocuments account={account} statusMeta={statusMeta}
          inquiry={latestInquiry} quotation={latestQuotation}
          onOpenInquiry={onOpenInquiry} onOpenQuotation={onOpenQuotation} />
      </div>

      <ReassignModal open={reassignOpen} onClose={() => setReassignOpen(false)} accounts={account ? [account] : []} showToast={showToast}
        onReassigned={() => { setReassignOpen(false); showToast?.('Lead reassigned'); fetchAccount(); fetchActivities(); }} />
      {/* TD-318 Irisan 3: toast dinamis persis mockup tgtLabel -- selalu
          satu akun di sini, jadi persis "CODE, Nama" (:606). */}
      <MarkAsLostModal open={lostOpen} onClose={() => setLostOpen(false)} accounts={account ? [account] : []} showToast={showToast}
        onMarked={() => { const label = `${account?.code ? `${account.code}, ` : ''}${account?.name || ''}`; setLostOpen(false); showToast?.(`${label} marked as Lost`); fetchAccount(); fetchActivities(); }} />
      <ArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} accounts={account ? [account] : []} showToast={showToast}
        onArchived={() => { const label = `${account?.code ? `${account.code}, ` : ''}${account?.name || ''}`; setArchiveOpen(false); showToast?.(`${label} archived`); onBack?.(); }} />
      <ReleaseToPoolModal open={releaseOpen} onClose={() => setReleaseOpen(false)} account={account} showToast={showToast}
        onReleased={() => { setReleaseOpen(false); showToast?.('Lead released to the pool'); fetchAccount(); fetchPoolHistory(); }} />
      {/* TD-318 Irisan 3: hanya ditempuh non-manager (onAdd di OverviewTab
          menangani manager LANGSUNG) -- onSubmitted selalu mode:'request',
          nol tindak lanjut sama seperti sebelumnya untuk cabang itu. */}
      <RequestNewOptionModal
        open={!!requestOptionFor} onClose={() => setRequestOptionFor(null)}
        listKey={requestOptionFor === 'industry' ? 'lead_industry' : 'lead_category'}
        listLabel={requestOptionFor === 'industry' ? 'Industry' : 'Lead Category'}
        companyId={null}
      />
    </div>
  );
}

/* =========================================================================
   OVERVIEW -- Company / Commercial / Notes, masing-masing kartu ber-Edit
   sendiri. Entity SENGAJA selalu read-only (ganti entitas = lintas scope
   RLS/penomoran, di luar cakupan irisan ini). Owner di kartu Commercial JUGA
   read-only + link "Reassign" -- perubahan owner HANYA lewat ReassignModal
   supaya tercatat di activity log + notifikasi (bukan Edit polos).
   ========================================================================= */
function buildCompanyDraft(account) {
  return {
    name: account.name || '', legal_name: account.legal_name || '', industry: account.industry || '',
    lead_category: account.lead_category || '', priority: account.priority || '', website: account.website || '',
    address: account.address || '', city: account.city || '', country: account.country || 'Indonesia',
  };
}

// TD-318 Lead Detail (tes Den #25+#26, refactor): SATU slot edit dibagi
// Company/Commercial/Notes -- persis mockup `s.editSec` (`secEdit.Company`/
// `.Commercial`/`.Notes`, `cancelSec`/`saveSec` tunggal; destructuring
// `vCompany/eCompany/vCommercial/eCommercial/vNotes/eNotes` SEMUA diturunkan
// dari satu nilai). State `editSec` di-HOIST ke `LeadDetailPage` (BUKAN di
// sini) supaya ia tidak remount saat pindah tab Overview<->tab lain --
// `OverviewTab` sendiri unmount tiap pindah tab (render kondisional
// `{tab==='overview' && <OverviewTab/>}`), sehingga state lokal akan
// kembali ke initializer tiap kali balik ke Overview. Inilah SATU
// perbaikan yang menutup #25 (Quick Edit reopen) DAN #26 (dua section
// edit bersamaan) sekaligus -- bukan dua tambalan terpisah.
function OverviewTab({
  account, setAccount, id, companyId, status, industryOptions, categoryOptions, lostReasonOptions,
  canManage, onReassign, onRequestNewOption, onAddOption, showToast, editSec, setEditSec,
}) {
  const entityCode = ENTITIES.find((e) => e.id === companyId)?.code || '—';
  const isLost = status === 'lost';
  // TD-318 Lead Detail, #24: persis mockup `showQR = st==='Qualified'||
  // st==='Converted'` (:686) -- status 'raw' TIDAK pernah menampilkan
  // Qualified Reason sama sekali (dulu selalu tampil "Not set").
  const showQR = status === 'qualified' || status === 'converted';
  const reasonLabel = isLost ? 'Lost Reason' : 'Qualified Reason';
  const reasonValue = isLost
    ? (lostReasonOptions.find((o) => o.value === account.lost_reason)?.label || account.lost_reason)
    : account.qualified_reason;

  const companyEdit = editSec === 'Company';
  const commercialEdit = editSec === 'Commercial';
  const notesEdit = editSec === 'Notes';
  const cancelSec = () => setEditSec(null);

  // "Quick Edit" (menu baris Capture, mockup rmEdit) -- lead dibuka dengan
  // Company SUDAH dalam mode edit, lewat lazy initializer (bukan effect:
  // `account` sudah pasti terisi saat OverviewTab mount, LeadDetailPage baru
  // merender tab ini sesudah `if (!account) return ...`). `editSec` sendiri
  // (bukan `companyDraft`) yang menentukan apakah ini aktif saat mount --
  // LeadDetailPage sudah menginisialisasinya 'Company' lewat prop ini.
  const [companyDraft, setCompanyDraft] = useState(() => (editSec === 'Company' ? buildCompanyDraft(account) : null));
  function startCompanyEdit() {
    setCompanyDraft(buildCompanyDraft(account));
    setEditSec('Company');
  }
  async function saveCompany() {
    if (!companyDraft.name.trim()) return { error: new Error('Company Name wajib diisi') };
    const payload = { ...companyDraft, name: companyDraft.name.trim(), legal_name: companyDraft.legal_name.trim() || null };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setEditSec(null);
    return undefined;
  }

  // TD-318 Irisan 3: jalur manager (MasterSelect onAdd), persis
  // CaptureLeadModal.jsx handleAddOption -- RPC add_dropdown_option_direct
  // lalu `onAddOption` (prop, lihat LeadDetailPage induk) menaikkan opsi
  // baru ke state industryOptions/categoryOptions (dimiliki induk, dipakai
  // ulang HistoryTab/ViewField juga), dan draft Company LANGSUNG memilihnya.
  async function handleAddOption(key, listKey, name) {
    const trimmed = name.trim();
    const { data, error } = await supabase.rpc('add_dropdown_option_direct', {
      p_list_key: listKey, p_label: trimmed, p_company_id: null,
    });
    if (error) { showToast?.(`Failed to add option: ${error.message}`, 'error'); return; }
    const slug = trimmed.toLowerCase().replace(/\s+/g, '_');
    onAddOption?.(key, { id: data, value: slug, label: trimmed });
    setCompanyDraft((d) => ({ ...d, [key]: slug }));
    showToast?.(`${trimmed} added to ${key === 'industry' ? 'Industry' : 'Lead Category'}`);
  }

  // TD-318 Lead Detail, #23: `commercialDraft` TIDAK lagi punya `source` --
  // field itu terkunci persis mockup (kotak abu-abu, nol input), jadi nol
  // draft untuknya mencegah payload simpan diam-diam ikut membawa nilai
  // yang tak pernah bisa diubah user dari form ini.
  const [commercialDraft, setCommercialDraft] = useState(null);
  function startCommercialEdit() {
    setCommercialDraft({
      estimated_value: formatIdNumber(account.estimated_value) || '',
      estimated_closing_date: account.estimated_closing_date || '',
    });
    setEditSec('Commercial');
  }
  async function saveCommercial() {
    const { value: estVal, unrecognized } = readMoneyInput(commercialDraft.estimated_value);
    if (unrecognized) return { error: new Error('Estimated Value tidak dikenali') };
    const payload = {
      estimated_value: estVal,
      estimated_closing_date: commercialDraft.estimated_closing_date || null,
    };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setEditSec(null);
    return undefined;
  }

  const [notesDraft, setNotesDraft] = useState(null);
  function startNotesEdit() {
    setNotesDraft({ description: account.description || '', notes: account.notes || '', qualified_reason: account.qualified_reason || '' });
    setEditSec('Notes');
  }
  async function saveNotes() {
    const payload = {
      description: notesDraft.description.trim() || null, notes: notesDraft.notes.trim() || null,
      qualified_reason: notesDraft.qualified_reason.trim() || null,
    };
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setEditSec(null);
    return undefined;
  }

  return (
    <div>
      <SectionBlock first title="Company" action={!companyEdit && <OutlineBtn size="sm" onClick={startCompanyEdit}>Edit</OutlineBtn>}>
        {companyEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              <FloatingInput label="Company Name" value={companyDraft.name} onChange={(v) => setCompanyDraft((d) => ({ ...d, name: v }))} />
              <FloatingInput label="Legal Name" value={companyDraft.legal_name} onChange={(v) => setCompanyDraft((d) => ({ ...d, legal_name: v }))} />
              <ViewField label="Entity" value={entityCode} />
            </div>
            <div style={grid3}>
              {/* TD-318 Irisan 3, REVISI 1 §6: variant="box" persis mockup
                  Detail/Overview (:211-212) -- 56px, label kecil di dalam
                  kotak. Catatan: field tetangga (Company Name/Legal Name/
                  dst.) di atas memakai FloatingInput kit (44px, label di
                  atas kotak sejak Irisan 0) -- hasilnya DUA tinggi kotak
                  berdampingan dalam satu grid; dilaporkan apa adanya dengan
                  screenshot sebelum/sesudah, BUKAN diseragamkan sendiri
                  (di luar lingkup irisan ini -- mockup sendiri memang
                  memperlakukan Industry/Lead Category beda dari field teks
                  di sekitarnya, lihat :205-214). */}
              <MasterSelect label="Industry" variant="box" value={companyDraft.industry} onChange={(v) => setCompanyDraft((d) => ({ ...d, industry: v }))}
                options={industryOptions.map((o) => ({ value: o.value, label: o.label }))}
                onAdd={canManage ? (name) => handleAddOption('industry', 'lead_industry', name) : undefined}
                onRequestNew={canManage ? undefined : () => onRequestNewOption('industry')} />
              <MasterSelect label="Lead Category" variant="box" value={companyDraft.lead_category} onChange={(v) => setCompanyDraft((d) => ({ ...d, lead_category: v }))}
                options={categoryOptions.map((o) => ({ value: o.value, label: o.label }))}
                onAdd={canManage ? (name) => handleAddOption('lead_category', 'lead_category', name) : undefined}
                onRequestNew={canManage ? undefined : () => onRequestNewOption('lead_category')} />
              <FloatingSelect label="Priority" value={companyDraft.priority} onChange={(v) => setCompanyDraft((d) => ({ ...d, priority: v }))}
                options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
            </div>
            {/* TD-318 Lead Detail, Kategori D: grid3 dgn Address span 2 kolom
                persis mockup (:214-215) -- Website 1/3 lebar, Address 2/3,
                bukan 50/50 lewat grid2 terpisah. */}
            <div style={grid3}>
              <FloatingInput label="Website" value={companyDraft.website} onChange={(v) => setCompanyDraft((d) => ({ ...d, website: v }))} />
              <FloatingInput label="Address" value={companyDraft.address} onChange={(v) => setCompanyDraft((d) => ({ ...d, address: v }))} style={{ gridColumn: 'span 2' }} />
            </div>
            <div style={grid2}>
              <FloatingInput label="City" value={companyDraft.city} onChange={(v) => setCompanyDraft((d) => ({ ...d, city: v }))} />
              <FloatingInput label="Country" value={companyDraft.country} onChange={(v) => setCompanyDraft((d) => ({ ...d, country: v }))} />
            </div>
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={cancelSec}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveCompany} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              <ViewField label="Company Name" value={account.name} />
              <ViewField label="Legal Name" value={account.legal_name} />
              <ViewField label="Entity" value={entityCode} />
            </div>
            <div style={grid3}>
              <ViewField label="Industry" value={industryOptions.find((o) => o.value === account.industry)?.label || account.industry} />
              <ViewField label="Lead Category" value={categoryOptions.find((o) => o.value === account.lead_category)?.label || account.lead_category} />
              <ViewField label="Priority" value={account.priority} />
            </div>
            <div style={grid3}>
              <ViewField label="Website" value={account.website} />
              <ViewField label="Address" value={account.address} span={2} />
            </div>
            <div style={grid2}>
              <ViewField label="City" value={account.city} />
              <ViewField label="Country" value={account.country} />
            </div>
          </div>
        )}
      </SectionBlock>

      <SectionBlock title="Commercial" action={!commercialEdit && <OutlineBtn size="sm" onClick={startCommercialEdit}>Edit</OutlineBtn>}>
        {commercialEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              {/* TD-318 Lead Detail, #23: Source TERKUNCI saat edit Commercial,
                  persis mockup (kotak abu-abu, :222) -- sebelumnya
                  FloatingSelect yang bisa diubah bebas. Pola locked-field
                  yang SAMA dipakai "Entity" di section Company di atas. */}
              <ViewField label="Source" value={SOURCE_LABELS[account.source] || account.source} />
              <OwnerField tint id={account.assigned_to} name={account.assigned_profile?.full_name} canReassign={canManage} onReassign={onReassign} />
              <FloatingInput label="Estimated Value" value={commercialDraft.estimated_value} onChange={(v) => setCommercialDraft((d) => ({ ...d, estimated_value: v }))} mono />
            </div>
            <FloatingInput label="Expected Closing Date" type="date" half value={commercialDraft.estimated_closing_date} onChange={(v) => setCommercialDraft((d) => ({ ...d, estimated_closing_date: v }))} />
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={cancelSec}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveCommercial} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={grid3}>
            <ViewField label="Source" value={SOURCE_LABELS[account.source] || account.source} />
            <OwnerField id={account.assigned_to} name={account.assigned_profile?.full_name} canReassign={canManage} onReassign={onReassign} />
            <ViewField label="Estimated Value" value={account.estimated_value != null ? fmtRp(account.estimated_value) : null} mono />
            <ViewField label="Expected Closing Date" value={fmtDate(account.estimated_closing_date)} />
          </div>
        )}
      </SectionBlock>

      <SectionBlock title="Notes" action={!notesEdit && <OutlineBtn size="sm" onClick={startNotesEdit}>Edit</OutlineBtn>}>
        {notesEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <Textarea label="Lead Description" value={notesDraft.description} onChange={(v) => setNotesDraft((d) => ({ ...d, description: v }))} rows={3} />
            <Textarea label="Internal Notes" value={notesDraft.notes} onChange={(v) => setNotesDraft((d) => ({ ...d, notes: v }))} rows={3} />
            {isLost
              // account.lost_reason adalah VALUE dropdown (MarkAsLostModal, list_key
              // 'lost_reason'), bukan teks bebas -- SENGAJA tidak dijadikan Textarea
              // di sini (akan menimpa value dropdown dengan teks mentah). Ubah lewat
              // "Mark as Lost" (menu titik tiga), bukan lewat form Notes ini.
              ? <ViewField label={reasonLabel} value={reasonValue} full />
              // TD-318 Lead Detail, #24: Qualified Reason HANYA saat showQR
              // (status qualified/converted) -- status raw tidak menampilkan
              // apa pun di slot ini (dulu selalu Textarea kosong).
              : showQR && <Textarea label="Qualified Reason" value={notesDraft.qualified_reason} onChange={(v) => setNotesDraft((d) => ({ ...d, qualified_reason: v }))} rows={3} />}
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={cancelSec}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveNotes} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <ViewField label="Lead Description" value={account.description} full />
            <ViewField label="Internal Notes" value={account.notes} full />
            {/* TD-318 Lead Detail, #24: persis mockup showQR||isLost (:232-233). */}
            {(isLost || showQR) && <ViewField label={reasonLabel} value={reasonValue} full />}
            {isLost && account.competitor_name && <ViewField label="Competitor" value={account.competitor_name} full />}
          </div>
        )}
      </SectionBlock>
    </div>
  );
}

/* =========================================================================
   CONTACTS -- koreksi Den atas mockup 17: Add Contact + edit kontak (semula
   read-only di irisan 5 asli). "Set as Primary" aksi langsung (tanpa form)
   seperti link "Reassign" di Owner -- dua UPDATE berurutan (lepas primary
   lama, pasang primary baru), bukan RPC baru (tabel kecil, konsekuensi
   gagal-di-tengah = pengulangan klik, bukan data rusak permanen).
   ========================================================================= */
function ContactsTab({ contacts, accountId, companyId, showToast, onChanged }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null); // null = Add baru
  const [settingPrimaryId, setSettingPrimaryId] = useState(null);

  async function setPrimary(contactId) {
    setSettingPrimaryId(contactId);
    const { error: e1 } = await supabase.from('contacts').update({ is_primary: false }).eq('account_id', accountId).eq('is_primary', true);
    const { error: e2 } = e1 ? { error: e1 } : await supabase.from('contacts').update({ is_primary: true }).eq('id', contactId);
    setSettingPrimaryId(null);
    if (e1 || e2) { showToast?.('Failed to set primary contact: ' + (e1 || e2).message, 'error'); return; }
    onChanged?.();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.s4 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: INK }}>Contacts</div>
        <PrimaryBtn onClick={() => { setEditingContact(null); setModalOpen(true); }}>+ Add Contact</PrimaryBtn>
      </div>

      {!contacts.length ? (
        <EmptyState icon="users" title="No contacts yet" sub="Contacts captured for this lead will appear here." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: SP.s4 }}>
          {contacts.map((c) => {
            const tone = avatarToneFor(c.id);
            const initials = c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
            return (
              <div key={c.id} style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, background: CARD }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.s3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD }}>{initials}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{c.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {c.is_primary
                      ? <Badge tone="info">Primary</Badge>
                      : (
                        <button type="button" disabled={settingPrimaryId === c.id} onClick={() => setPrimary(c.id)}
                          style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 12.5, textDecoration: 'underline', cursor: settingPrimaryId === c.id ? 'default' : 'pointer', fontFamily: FONT_BODY }}>
                          {settingPrimaryId === c.id ? 'Saving…' : 'Set as Primary'}
                        </button>
                      )}
                    <OutlineBtn size="xs" onClick={() => { setEditingContact(c); setModalOpen(true); }}>Edit</OutlineBtn>
                  </div>
                </div>
                <div style={grid2}>
                  <ViewField label="Position" value={c.position} />
                  {/* TD-318 Lead Detail, #28: label manusiawi (ROLE_TYPE_LABELS,
                      kini di leadOptions.js), bukan slug mentah role_type. */}
                  <ViewField label="Role" value={ROLE_TYPE_LABELS[c.role_type] || c.role_type} />
                  {/* TD-318 Lead Detail, #27: tel:/wa.me/mailto: persis mockup
                      (:254-255), bukan teks biasa yang tak bisa diklik. */}
                  <ViewFieldLink label="Phone" value={c.phone} href={c.phone ? `tel:${c.phone}` : undefined} mono />
                  <ViewFieldLink label="WhatsApp" value={c.whatsapp} href={c.whatsapp ? `https://wa.me/${waLink(c.whatsapp)}` : undefined} mono />
                </div>
                <div style={{ marginTop: SP.s4, display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
                  <ViewFieldLink label="Email" value={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
                  <ViewField label="Preferred Channel" value={c.preferred_channel ? (c.preferred_channel === 'whatsapp' ? 'WhatsApp' : c.preferred_channel === 'call' ? 'Call' : 'Email') : null} full />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ContactModal
        open={modalOpen} onClose={() => setModalOpen(false)}
        accountId={accountId} companyId={companyId} contact={editingContact}
        makePrimaryDefault={contacts.length === 0}
        showToast={showToast}
        onSaved={() => { setModalOpen(false); showToast?.(editingContact ? 'Contact updated' : 'Contact added'); onChanged?.(); }}
      />
    </div>
  );
}

/* =========================================================================
   ACTIVITY -- Add Note + Schedule Follow Up (komposer inline, satu aktif
   sekaligus) + timeline SEMUA type, terbaru dulu (urut created_at, bukan
   scheduled_for -- lihat catatan di laporan akhir).
   ========================================================================= */
const ACTIVITY_ICON = {
  note: FileText, call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users,
  email: Mail, followup: Calendar, owner_change: Users, status_change: RefreshCw, lead_lost: Inbox,
  // Riwayat Lead Pool (account_pool_history, irisan 9 Paket 2) digabung ke
  // timeline ini sebagai pseudo-activity `pool_<event_type>` (lihat
  // ActivityTab) -- prefix mencegah bentrok dgn tipe `activities` asli.
  // Pemetaan ikon: enter_pool/release/auto_release = masuk-pool (inbox,
  // mockup "Pooled"); approve_pull/assign = keluar-pool berpemilik (users,
  // mockup "Unpooled"); request_pull/reject_pull = siklus tarikan (tak ada
  // acuan mockup -- dipilih reuse status_change); owner_cleared = pemilik
  // dikosongkan tanpa masuk pool (users, sejenis owner_change).
  pool_enter_pool: Inbox, pool_release: Inbox, pool_auto_release: Inbox,
  pool_approve_pull: Users, pool_assign: Users, pool_owner_cleared: Users,
  pool_request_pull: RefreshCw, pool_reject_pull: RefreshCw,
  // TD-318 Lead Detail, #30: `legacy_pool_exit` (migrasi
  // 20261012000009/20261012000006 -- backfill satu-kali, ±1.079 baris:
  // "akun punya pemilik aktif, dikeluarkan dari pool lama, assigned_to
  // tetap") -- akun TETAP berpemilik, jadi ikut pemetaan Users yang sama
  // dgn approve_pull/assign, bukan Inbox (yang berarti MASUK pool).
  pool_legacy_pool_exit: Users,
};
const POOL_EVENT_LABEL = {
  enter_pool: 'Pooled', release: 'Pooled', auto_release: 'Removed from Pool',
  approve_pull: 'Unpooled', assign: 'Unpooled',
  request_pull: 'Pull Requested', reject_pull: 'Pull Rejected', owner_cleared: 'Owner Cleared',
  // TD-318 Lead Detail, #30 -- sebelumnya jatuh ke fallback generik "Pool
  // Activity". Teks detailnya (h.reason) sudah lengkap dari backfill, nol
  // case baru diperlukan di poolHistoryNotes().
  legacy_pool_exit: 'Legacy Pool Cleanup',
};
// Label timeline -- mockup (18-detail-activity.png) memakai judul dua-kata
// ("Scheduled Follow Up", "Status Change", "Owner Change") yang beda dari
// ACTIVITY_TYPE_LABEL (dipakai komposer/dropdown, satu kata). Followup yang
// SUDAH selesai (status 'done') tetap "Follow-up" -- "Scheduled" cuma benar
// selama masih 'todo'.
function activityLabel(a) {
  if (a.type?.startsWith('pool_')) return POOL_EVENT_LABEL[a.type.slice(5)] || 'Pool Activity';
  if (a.type === 'followup') return a.status === 'todo' ? 'Scheduled Follow Up' : 'Follow-up';
  if (a.type === 'status_change') return 'Status Change';
  if (a.type === 'owner_change') return 'Owner Change';
  if (a.type === 'lead_lost') return 'Lead Lost';
  return ACTIVITY_TYPE_LABEL[a.type] || (a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1).replace(/_/g, ' ') : 'Activity');
}

// Baris timeline -- mockup 18-detail-activity.png: spine vertikal (garis
// LINE menghubungkan lingkaran ikon), entri "Scheduled Follow Up" yang
// belum selesai mendapat bingkai + badge "Upcoming" (SEMANTIC.warn, satu-
// satunya status siap pakai yang cocok -- mockup tak membedakan
// upcoming/overdue). Link "Details" (mockup) membuka panel inline berisi
// outcome/next_action -- field yang SUDAH ADA di kolom `activities` tapi
// sebelumnya tersembunyi oleh rantai fallback `notes || outcome ||
// next_action` (kalau `notes` terisi, dua field lain tak pernah terlihat).
// Chip "From visit report" DI mockup SENGAJA tidak dibangun -- `activities`
// tak punya kolom penaut balik ke sumber (mis. tabel riwayat visit).
// KEPUTUSAN Den (irisan 7): DITUNDA ke giliran Sales Activity (menu 1.11),
// bukan dibatalkan -- modul itulah yang akan menentukan bentuk penautannya
// (kolom baru di `activities`, atau join ke tabel riwayat visit yang sudah
// ada). Jangan dibangun di sini lebih dulu dengan mengarang kolom.
function TimelineRow({ a, actorMap, isLast }) {
  const [open, setOpen] = useState(false);
  const Icon = ACTIVITY_ICON[a.type] || FileText;
  const upcoming = a.type === 'followup' && a.status === 'todo';
  const hasDetails = !!((a.notes && (a.outcome || a.next_action)) || (!a.notes && a.outcome && a.next_action));
  const metaWhen = a.type === 'followup' && a.scheduled_for
    ? `${fmtDate(a.scheduled_for)}${a.activity_time ? `, ${a.activity_time}` : ''}`
    : fmtDateTime(a.created_at);
  const actorName = a.created_by && actorMap[a.created_by] ? actorMap[a.created_by] : null;
  return (
    <div style={{ display: 'flex', gap: SP.s3 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 28px' }}>
        <span style={{
          width: 28, height: 28, borderRadius: 999, flex: '0 0 28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: upcoming ? SEMANTIC.warn.bg : HEAD_BG, border: `1px solid ${upcoming ? SEMANTIC.warn.bd : LINE}`,
        }}>
          <Icon size={13} color={upcoming ? SEMANTIC.warn.fg : INK_SOFT} />
        </span>
        {!isLast && <span style={{ width: 1, flex: 1, background: LINE, marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: SP.s4 }}>
        <div style={{
          ...(upcoming ? { border: `1px solid ${SEMANTIC.warn.bd}`, borderRadius: RADIUS.md, padding: '10px 14px', background: CARD } : {}),
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{activityLabel(a)}</span>
            {upcoming && <Badge tone="warn">Upcoming</Badge>}
            <span style={{ fontSize: 12, color: INK_FAINT, fontFamily: FONT_BODY }}>
              {metaWhen}{actorName ? `, ${a.type === 'followup' && a.status === 'todo' ? `scheduled by ${actorName}` : actorName}` : ''}
            </span>
            {hasDetails && (
              <button type="button" onClick={() => setOpen((o) => !o)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>
                {open ? 'Hide' : 'Details'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, marginTop: 2 }}>{a.notes || a.outcome || a.next_action || '—'}</div>
          {open && hasDetails && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${LINE_SOFT}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {a.outcome && <div style={{ fontSize: 12.5, color: INK_SOFT, fontFamily: FONT_BODY }}><strong style={{ color: INK }}>Outcome:</strong> {a.outcome}</div>}
              {a.next_action && <div style={{ fontSize: 12.5, color: INK_SOFT, fontFamily: FONT_BODY }}><strong style={{ color: INK }}>Next action:</strong> {a.next_action}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Notes pseudo-activity riwayat pool, lihat ACTIVITY_ICON/POOL_EVENT_LABEL.
function poolHistoryNotes(h, actorMap) {
  const who = (uid) => (uid ? actorMap[uid] : null);
  switch (h.event_type) {
    case 'enter_pool':
    case 'release':
      return h.reason || 'Released to the Lead Pool.';
    case 'auto_release':
      return h.reason ? `Removed from the Lead Pool. ${h.reason}.` : 'Removed from the Lead Pool.';
    case 'request_pull':
      return h.reason ? `Pull requested. ${h.reason}` : 'Pull requested.';
    case 'reject_pull':
      return h.reason ? `Pull request rejected. ${h.reason}` : 'Pull request rejected.';
    case 'approve_pull':
    case 'assign':
      return who(h.new_owner) ? `Assigned to ${who(h.new_owner)}.` : 'Assigned from the Lead Pool.';
    case 'owner_cleared':
      return h.reason || 'Owner cleared.';
    default:
      return h.reason || '';
  }
}

function ActivityTab({ activities, poolHistory = [], actorMap, accountId, companyId, profile, showToast, onChanged, autoOpenNote }) {
  // TD-318 Irisan 1, N3 (rmNote): kotak catatan sudah TERBUKA saat tab ini
  // mendarat dari "Add Note" Lead Capture -- lazy initializer lokal, pola
  // yang SAMA dengan `companyDraft` OverviewTab SEBELUM diperbaiki (lihat
  // #25 di atas). ⚠️ BELUM diaudit apakah bug kelas yang SAMA (kotak
  // catatan terbuka lagi tiap balik ke tab Activity) juga terjadi di sini
  // -- `autoOpenNote` adalah PROP murni (`openNoteOnMount` LeadDetailPage),
  // bukan state yang di-hoist, dan `ActivityTab` ikut unmount/remount tiap
  // pindah tab PERSIS seperti OverviewTab dulu. Ditemukan saat menutup
  // #25/#26, SENGAJA TIDAK diperbaiki di irisan ini (di luar lingkup yang
  // disetujui Den) -- dicatat sebagai temuan baru di laporan akhir.
  const [composer, setComposer] = useState(() => (autoOpenNote ? 'note' : null)); // null | 'note' | 'followup'
  const [text, setText] = useState('');
  const [followDate, setFollowDate] = useState('');
  // TD-318 Lead Detail, #29: default '10:00' persis mockup `fuTime`.
  const [followTime, setFollowTime] = useState('10:00');
  const [saving, setSaving] = useState(false);

  // Timeline gabungan activities + account_pool_history, terbaru dulu --
  // mockup menampilkan "Pooled"/"Unpooled" sebagai entri DI DALAM timeline
  // ini, bukan tab tersendiri (lihat ACTIVITY_ICON).
  const timeline = [
    ...activities,
    ...poolHistory.map((h) => ({
      id: `pool-${h.id}`, type: `pool_${h.event_type}`,
      notes: poolHistoryNotes(h, actorMap), created_at: h.occurred_at, created_by: h.actor_id,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  async function submitNote() {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await addLeadNote({ accountId, companyId, userId: profile.id, text: text.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to add note: ' + error.message, 'error'); return; }
    setText(''); setComposer(null); onChanged?.();
  }
  async function submitFollowUp() {
    if (!followDate) return;
    setSaving(true);
    const { error } = await scheduleLeadFollowUp({
      accountId, companyId, userId: profile.id, assignedTo: profile.id,
      date: followDate, time: followTime, notes: text.trim() || null,
    });
    setSaving(false);
    if (error) { showToast?.('Failed to schedule follow up: ' + error.message, 'error'); return; }
    setText(''); setFollowDate(''); setFollowTime('10:00'); setComposer(null); onChanged?.();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: SP.s2, marginBottom: SP.s4 }}>
        <OutlineBtn size="sm" onClick={() => setComposer(composer === 'note' ? null : 'note')}>Add Note</OutlineBtn>
        <OutlineBtn size="sm" onClick={() => setComposer(composer === 'followup' ? null : 'followup')}>Schedule Follow Up</OutlineBtn>
      </div>

      {composer === 'note' && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, marginBottom: SP.s4, background: CARD }}>
          <Textarea label="New internal note" value={text} onChange={setText} rows={3} placeholder="Visible to your team only" />
          <div style={{ display: 'flex', gap: SP.s2, marginTop: SP.s3 }}>
            <Button variant="primary" size="sm" disabled={!text.trim() || saving} loading={saving} onClick={submitNote}>Add Note</Button>
            <OutlineBtn size="sm" onClick={() => { setComposer(null); setText(''); }}>Cancel</OutlineBtn>
          </div>
        </div>
      )}
      {composer === 'followup' && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, marginBottom: SP.s4, background: CARD, display: 'flex', flexDirection: 'column', gap: SP.s3 }}>
          {/* TD-318 Lead Detail, #29: Date 180px + Time 140px (BARU), latar
              CARD (putih) persis mockup input (`background:#F6F8F3;...;
              background:#FFFFFF`, dua deklarasi, yang KEDUA menang -- :263)
              -- FloatingInput kit tidak punya hook override background input
              (hanya wrapper), jadi dibangun manual di sini, label lewat
              FieldLabel kit yang sama. */}
          <div style={{ display: 'flex', gap: SP.s3, flexWrap: 'wrap' }}>
            <div style={{ width: 180 }}>
              <FieldLabel label="Date" />
              <input type="date" value={followDate} onChange={(e) => setFollowDate(e.target.value)} className="nk-input"
                style={{ height: 44, width: '100%', border: `1px solid ${LINE}`, borderRadius: RADIUS.md, background: CARD, padding: '0 12px', fontFamily: FONT_BODY, fontSize: 13.5, color: INK, boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 140 }}>
              <FieldLabel label="Time" />
              <input type="time" value={followTime} onChange={(e) => setFollowTime(e.target.value)} className="nk-input"
                style={{ height: 44, width: '100%', border: `1px solid ${LINE}`, borderRadius: RADIUS.md, background: CARD, padding: '0 12px', fontFamily: FONT_BODY, fontSize: 13.5, color: INK, boxSizing: 'border-box' }} />
            </div>
          </div>
          {/* Kategori D (TD-318, keputusan Den): field "Notes" TIDAK ADA di
              mockup komposer ini (hanya Date + Time, :263) -- DIPERTAHANKAN
              (bukan ditutup sebagai gap mockup) karena follow-up tanpa
              catatan tidak memberi konteks apa yang perlu di-follow-up.
              Keputusan bisa dibalik Den kapan pun menyusul. */}
          <Textarea label="Notes" optional value={text} onChange={setText} rows={2} />
          <div style={{ display: 'flex', gap: SP.s2 }}>
            <Button variant="primary" size="sm" disabled={!followDate || saving} loading={saving} onClick={submitFollowUp}>Schedule</Button>
            <OutlineBtn size="sm" onClick={() => { setComposer(null); setText(''); setFollowDate(''); setFollowTime('10:00'); }}>Cancel</OutlineBtn>
          </div>
        </div>
      )}

      {!timeline.length ? (
        <EmptyState icon="inbox" title="No activity yet" sub="Calls, visits, notes, and status changes will appear here." />
      ) : (
        <div>
          {timeline.map((a, i) => (
            <TimelineRow key={a.id} a={a} actorMap={actorMap} isLast={i === timeline.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   NOTES -- komposer SELALU tampil + daftar entri type='note' saja (sumber
   SAMA dengan Activity tab, hanya filter baca beda -- instruksi "pola yang
   sudah ada, JANGAN tabel baru").
   ========================================================================= */
function NotesTab({ activities, actorMap, accountId, companyId, profile, showToast, onChanged }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const notes = activities.filter((a) => a.type === 'note');

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await addLeadNote({ accountId, companyId, userId: profile.id, text: text.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to add note: ' + error.message, 'error'); return; }
    setText(''); onChanged?.();
  }

  return (
    <div>
      <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, marginBottom: SP.s4, background: CARD }}>
        <Textarea label="New internal note" value={text} onChange={setText} rows={3} placeholder="Visible to your team only" />
        <div style={{ marginTop: SP.s3 }}>
          <Button variant="primary" size="sm" disabled={!text.trim() || saving} loading={saving} onClick={submit}>Add Note</Button>
        </div>
      </div>

      {!notes.length ? (
        <EmptyState icon="inbox" title="No notes yet" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {notes.map((n, i) => {
            const actorName = n.created_by ? (actorMap[n.created_by] || '—') : '—';
            const tone = avatarToneFor(n.created_by);
            return (
              <div key={n.id} style={{ display: 'flex', gap: SP.s2, padding: '14px 0', borderBottom: i < notes.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' }}>
                <span style={{ width: 24, height: 24, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 24px' }}>
                  {actorName !== '—' ? actorName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?'}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{actorName}</span>
                    <span style={{ fontSize: 12, color: INK_FAINT, fontFamily: FONT_BODY }}>{fmtDateTime(n.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, marginTop: 4 }}>{n.notes}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   BANT & PIPELINE -- empat skor 0-3 klik-langsung (bant_budget/authority/
   need/timeline, nol konfirmasi -- sama ringannya dgn klik di
   LeadCapturePage/BantCell). "Qualification Data" (7 kolom legacy
   bant_commodity dkk) bisa diedit (koreksi Den atas mockup 19) --
   QUALIFICATION_FIELDS kini di lib/bant.js, satu sumber dengan
   LeadQualificationPage (irisan 6).
   ========================================================================= */

function BantTab({ account, id, setAccount, showToast }) {
  const score = calcBantScore(account);
  async function setDim(key, value) {
    const prev = account[key];
    setAccount((a) => ({ ...a, [key]: value }));
    const { error } = await supabase.from('accounts').update({ [key]: value, last_activity_at: new Date().toISOString() }).eq('id', id);
    if (error) { setAccount((a) => ({ ...a, [key]: prev })); showToast?.('Failed to update BANT: ' + error.message, 'error'); }
  }

  // Qualification Data (7 kolom legacy bant_commodity dkk) -- SEKARANG bisa
  // diedit sesuai koreksi Den atas mockup 19 (sebelumnya read-only di
  // irisan 5 asli, dengan alasan "kolom tech-debt" -- Den menilai itu salah
  // baca mockup: Edit di sana memang untuk ketujuh field ini, bukan kolom
  // bant_budget/dkk yang skornya 0-3). Teks bebas (FloatingInput) mengikuti
  // persis nilai tampilan mockup ("2 × 40ft per month", "Credit 30 days") --
  // keduanya TIDAK cocok dengan opsi dropdown lama BANT_FREQUENCY_OPTIONS/
  // BANT_PAYMENT_OPTIONS (bant.js, ditandai "kompatibilitas impor lama"),
  // jadi field ini sengaja teks bebas, bukan dropdown lama yang dibangkitkan.
  const [qualEdit, setQualEdit] = useState(false);
  const [qualDraft, setQualDraft] = useState(null);
  function startQualEdit() {
    const draft = {};
    QUALIFICATION_FIELDS.forEach((f) => { draft[f.key] = account[f.key] || ''; });
    setQualDraft(draft);
    setQualEdit(true);
  }
  async function saveQual() {
    const payload = {};
    QUALIFICATION_FIELDS.forEach((f) => { payload[f.key] = qualDraft[f.key].trim() || null; });
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) return { error };
    setAccount((a) => ({ ...a, ...payload }));
    setQualEdit(false);
    return undefined;
  }

  return (
    <div>
      <SectionBlock first title="BANT Score" action={<span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: INK }}>{score}/{BANT_MAX_SCORE}</span>}>
        <span style={{ display: 'block', height: 6, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', marginBottom: SP.s4 }}>
          <span style={{ display: 'block', height: '100%', width: `${(score / BANT_MAX_SCORE) * 100}%`, background: INK_SOFT, borderRadius: 999 }} />
        </span>
        <div style={grid2}>
          {BANT_DIMENSIONS.map((dim) => (
            <div key={dim.key} style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, background: CARD }}>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: INK }}>{dim.label}</div>
              <div style={{ fontSize: 12.5, color: INK_SOFT, fontFamily: FONT_BODY, marginTop: 2, marginBottom: SP.s3 }}>{dim.description}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {dim.options.map((o) => {
                  const active = Number(account[dim.key]) === o.value;
                  return (
                    <button key={o.value} type="button" onClick={() => setDim(dim.key, o.value)}
                      style={{
                        width: 34, height: 34, borderRadius: RADIUS.md, border: `1px solid ${active ? ACCENT_HOVER : LINE}`,
                        background: active ? ACCENT : CARD, color: INK, fontFamily: FONT_MONO, fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
                      }}>
                      {o.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock title="Qualification Data" action={!qualEdit && <OutlineBtn size="sm" onClick={startQualEdit}>Edit</OutlineBtn>}>
        {qualEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
            <div style={grid3}>
              {QUALIFICATION_FIELDS.map((f) => (
                <FloatingInput key={f.key} label={f.label} value={qualDraft[f.key]}
                  onChange={(v) => setQualDraft((d) => ({ ...d, [f.key]: v }))} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: SP.s2, justifyContent: 'flex-end' }}>
              <OutlineBtn size="sm" onClick={() => setQualEdit(false)}>Cancel</OutlineBtn>
              <SaveButton size="sm" onSave={saveQual} onError={(err) => showToast?.('Failed to save: ' + err.message, 'error')} />
            </div>
          </div>
        ) : (
          <div style={grid3}>
            {QUALIFICATION_FIELDS.map((f) => <ViewField key={f.key} label={f.label} value={account[f.key]} />)}
          </div>
        )}
      </SectionBlock>
    </div>
  );
}

/* =========================================================================
   HISTORY -- koreksi Den atas mockup 20: SELURUH inquiry akun ini (Inquiry
   No, tanggal, status), bukan cuma yang terbaru. Tanpa daftar quotation
   bersarang per inquiry (instruksi eksplisit).
   ========================================================================= */
function HistoryTab({ inquiries, onOpenInquiry }) {
  // Mockup (20-detail-history.png): keadaan kosong di tab ini HANYA teks
  // tengah polos, bukan EmptyState berikon -- beda dari tab lain (Contacts/
  // Activity) yang memang memakai EmptyState berikon.
  if (!inquiries.length) {
    return <div style={{ padding: `${SP.s6}px 0`, textAlign: 'center', fontSize: 13.5, color: INK_SOFT, fontFamily: FONT_BODY }}>No inquiry history for this account yet.</div>;
  }
  const th = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY };
  const td = { padding: '10px 12px', fontSize: 13.5, color: INK, fontFamily: FONT_BODY };
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
            <th style={th}>Inquiry No</th>
            <th style={th}>Date</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {inquiries.map((inq, i) => (
            <tr key={inq.id}
              onClick={() => onOpenInquiry?.(inq.id)}
              style={{ borderBottom: i < inquiries.length - 1 ? `1px solid ${LINE_SOFT}` : 'none', cursor: onOpenInquiry ? 'pointer' : 'default' }}>
              <td style={{ ...td, fontFamily: FONT_MONO, fontWeight: 600 }}>{inq.inquiry_no}</td>
              <td style={{ ...td, color: INK_SOFT }}>{fmtDate(inq.created_at)}</td>
              <td style={td}><Badge tone="neutral">{inq.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================================
   RELATED DOCUMENTS -- DI LUAR Notebook, SATU panel dirender untuk keenam
   tab (dipanggil sekali di body FormSheet, bukan di dalam tiap tab).
   ========================================================================= */
function RelatedDocuments({ account, statusMeta, inquiry, quotation, onOpenInquiry, onOpenQuotation }) {
  return (
    <div style={{ marginTop: SP.s5, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: SP.s4, background: CARD }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: INK, marginBottom: SP.s3 }}>Related Documents</div>
      <div style={grid2}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>Upstream</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div>
              <span style={{ fontSize: 12, color: INK_SOFT, fontFamily: FONT_BODY, marginRight: 8 }}>Lead Source</span>
              <span style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, fontWeight: 600 }}>{SOURCE_LABELS[account.source] || account.source || '—'}</span>
            </div>
            {statusMeta && <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>Downstream</div>
          {!inquiry && !quotation && <div style={{ fontSize: 13, color: INK_FAINT, fontFamily: FONT_BODY, fontStyle: 'italic' }}>None yet</div>}
          {inquiry && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: onOpenInquiry ? 'pointer' : 'default' }} onClick={() => onOpenInquiry?.(inquiry.id)}>
              <div><span style={{ fontSize: 12, color: INK_SOFT, fontFamily: FONT_BODY, marginRight: 8 }}>Inquiry</span><span style={{ fontSize: 13.5, color: INK, fontFamily: FONT_MONO, fontWeight: 600 }}>{inquiry.inquiry_no}</span></div>
              <Badge tone="neutral">{inquiry.status}</Badge>
            </div>
          )}
          {quotation && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: onOpenQuotation ? 'pointer' : 'default' }} onClick={() => onOpenQuotation?.(quotation.id)}>
              <div><span style={{ fontSize: 12, color: INK_SOFT, fontFamily: FONT_BODY, marginRight: 8 }}>Quotation</span><span style={{ fontSize: 13.5, color: INK, fontFamily: FONT_MONO, fontWeight: 600 }}>{quotation.quotation_no} v{quotation.revision}</span></div>
              <Badge tone="neutral">{quotation.status}</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
