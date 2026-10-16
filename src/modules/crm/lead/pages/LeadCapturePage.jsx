// src/modules/crm/lead/pages/LeadCapturePage.jsx
// "Multi-channel Lead Capture" (1.1.1) -- pengganti ProspectListPage.jsx sebagai
// halaman yang dimount di menu crm-prospects (/crm/lead/capture). Konsumen
// PERTAMA src/kit/ untuk halaman non-admin (giliran Lead Management, Batch DS 3).
//
// Acuan implementasi: design-handoff/mockup/Lead Management.dc.html, tab
// Capture (Capture/Filters + Capture/BulkBar + Capture/Table +
// Capture/EmptyState) -- bukan lagi PNG lama (rujukan folder
// design-handoff/crm-2026-10-11/ yang pernah ada di sini sudah basi, folder
// itu sudah dihapus total, lihat 08_TECH_DEBT.md TD-318 "Akar masalah").
// Bulk bar (Assign to Sales/Archive/Mark as Lost) + menu baris "⋮" datang di
// irisan 5, disisir ulang terhadap mockup di TD-318 Irisan 1 (16 Okt 2026):
// menu baris "⋮" kini PERSIS mockup menuIsRow, TIGA item (Quick Edit/Add
// Note/Mark as Lost) -- Reassign dan Archive DICABUT dari menu baris
// (mockup tak punya keduanya di situ), tetap di bulk bar. "Quick Edit"
// (irisan 7, KEPUTUSAN Den): ikut perilaku rmEdit mockup -- membuka
// LeadDetailPage lead itu dengan Company langsung dalam mode edit
// (onQuickEdit, dirutekan lewat location.state `quickEdit`, lihat
// LeadDetailRoute/crm.routes.jsx). "Add Note" (TD-318 Irisan 1, N3): ikut
// perilaku rmNote mockup -- membuka LeadDetailPage lead itu dengan tab
// Activity aktif DAN kotak catatan sudah terbuka (onAddNote, location.state
// `openNote`) -- GANTI dari AddNoteModal lokal (mockup tak punya modal
// terpisah untuk aksi ini, satu-satunya jalur edit/catat tetap Lead Detail).
// Pager bernomor (komponen baru, src/modules/crm/lead/components/Pager.jsx)
// menggantikan ‹ Prev / Next › polos.
//
// Dua deviasi dari batas awal irisan ini, DIPUTUSKAN Den sesudah verifikasi
// visual (ikut mockup, bukan lagi dicatat sebagai "tidak ada"): filter
// Estimated Value kini pakai Slider BARU di src/kit/Form.jsx (kit memang
// belum punya komponen ini sebelum sesi ini), dan avatar Owner berwarna
// beda per orang lewat avatarToneFor() (src/kit/tokens.js) -- lihat laporan
// akhir untuk rincian + perbedaan visual yang MASIH tersisa.
import { useState, useEffect, useCallback } from 'react';
import { Plus, Upload as UploadIcon, ChevronRight, MoreVertical, UserPlus } from 'lucide-react';
import { PageHeader, Card, EmptyState, Select, SearchInput, Segmented, Slider, Badge, PrimaryBtn, OutlineBtn, IconButton } from '../../../../kit';
import { INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, ROW_HOVER, CARD, FONT_BODY, FONT_HEAD, FONT_MONO, RADIUS, SP, fmtRp, avatarToneFor } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole, isSalesOnly as isSalesOnlyRole, isManagerOrAbove } from '../../../../lib/roles';
import { ENTITIES } from '../../../../lib/entities';
import { bantScoreMeta, BANT_MAX_SCORE } from '../../lib/bant';
import { SOURCES, SOURCE_LABELS, PRIORITIES } from '../lib/leadOptions';
import { LEAD_STATUSES, LEAD_STATUS_META, deriveLeadStatus, applyLeadStatusFilter } from '../lib/leadStatus';
import CaptureLeadModal from '../components/CaptureLeadModal';
import ImportLeadsModal from '../components/ImportLeadsModal';
import ReassignModal from '../components/ReassignModal';
import MarkAsLostModal from '../components/MarkAsLostModal';
import ArchiveModal from '../components/ArchiveModal';
import Pager from '../components/Pager';

const PAGE_SIZE = 20;
// Sentinel filter Owner (irisan 7 Bagian 2, poin 3 Paket 2) -- bukan id
// profil sungguhan (profiles.id selalu uuid), jadi tak pernah bentrok.
// Predikat: assigned_to IS NULL DAN is_in_lead_pool = false -- akun yang
// sudah masuk Lead Pool punya halamannya sendiri (LeadPoolPage), sengaja
// TIDAK ikut muncul di sini.
const OWNER_UNASSIGNED = '__unowned__';
// Sentinel filter Status "Stale" (irisan 9 Paket 2, Task 4.4.5) -- is_stale
// adalah tanda ORTOGONAL terhadap lifecycle status (raw/qualified/dst bisa
// stale atau tidak), jadi ditumpangkan sebagai nilai EKSTRA di filter Status
// yang sudah ada (pola sentinel sama dengan OWNER_UNASSIGNED di atas),
// bukan kontrol filter baru.
const STATUS_STALE = '__stale__';
const ESTIMATED_MAX_JUTA = 600; // slider "Estimated Value, up to" -- mockup: ujung kanan = Rp 600 juta
// TD-318 Irisan 1, N5: Created Date dan Last Touched BUKAN satu daftar --
// mockup (Lead Management.dc.html:59 vs :67) memberi dua field ini opsi yang
// BERBEDA. Created Date mockup TIDAK punya opsi "All" (Today/Last 7 days/
// Last 30 days/This month/Custom, 5 nilai) -- "All" ditambah DI SINI sebagai
// penyimpangan sengaja supaya "Clear all" (#6, checklist Preview Den butir 3)
// punya state nyata untuk direset, bukan dipaksa jatuh ke salah satu dari
// kelima opsi lain yang semuanya menyaring.
const CREATED_DATE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];
// Last Touched mockup (:67): Any time/More than 7/14/30 days -- PERSIS, nol
// penyimpangan (opsi pertama mockup SUDAH "Any time" = sentinel 'all' kita).
const TOUCHED_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: '7', label: 'More than 7 days' },
  { value: '14', label: 'More than 14 days' },
  { value: '30', label: 'More than 30 days' },
];
const primaryContactOf = (acc) => (Array.isArray(acc.contacts) ? acc.contacts : []).find((k) => k.is_primary && !k.deleted_at) || null;
// TD-318 Irisan Sorting -- 9 kolom sortable Capture/Table (mockup :81,
// sortBy.X/arrow.X). Kunci PERSIS kunci mockup (code/src/co/contact/st/
// bant/ow/val/t), dipetakan ke kolom .order() di sini -- 5 kolom asli
// langsung, 4 computed column PostgREST (bant_score/lead_status_rank/
// owner_name/primary_contact_name, migrasi 20261016000003, BELUM
// DIJALANKAN). Sengaja TIDAK di-select -- hanya dipakai di .order(), jadi
// 5 kolom pertama tetap bekerja normal sebelum migrasi computed column
// itu jalan; mengklik salah satu dari 4 kolom computed sebelum migrasi
// jalan akan gagal lewat showToast error (PostgREST: kolom tak dikenal),
// bukan mematikan seluruh halaman.
const SORT_ORDER_COLUMN = {
  code: 'code', src: 'source', co: 'name', contact: 'primary_contact_name',
  st: 'lead_status_rank', bant: 'bant_score', ow: 'owner_name',
  val: 'estimated_value', t: 'last_activity_at',
};
const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString();
const startOfTodayIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const startOfMonthIso = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Warna avatar BEDA per orang, KONSISTEN untuk orang yang sama (keputusan
// Den, deviasi dari batas awal irisan 4) -- avatarToneFor(id) hash stabil
// dari id (bukan nama, supaya dua orang bernama sama tak pernah bentrok).
function OwnerCell({ id, name }) {
  if (!name) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: INK_FAINT, fontSize: 13 }}>
        <span style={{ width: 24, height: 24, borderRadius: 999, background: LINE_SOFT, border: `1px dashed ${LINE}`, flex: '0 0 24px' }} />
        Unassigned
      </span>
    );
  }
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const tone = avatarToneFor(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 22px' }}>{initials}</span>
      <span style={{ fontSize: 13, color: INK }}>{name}</span>
    </div>
  );
}

function BantCell({ score }) {
  const meta = bantScoreMeta(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: INK, fontWeight: 600 }}>{score}/{BANT_MAX_SCORE}</span>
      <span style={{ width: 40, height: 5, borderRadius: 999, background: HEAD_BG, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${(score / BANT_MAX_SCORE) * 100}%`, background: meta.color, borderRadius: 999 }} />
      </span>
    </div>
  );
}

/**
 * @param {(acc: {id:string}) => void} onSelectProspect
 * @param {(acc: {id:string}) => void} [onQuickEdit] - "Quick Edit" (menu baris "⋮", mockup rmEdit): buka Detail Lead dengan Company langsung dalam mode edit
 * @param {(acc: {id:string}) => void} [onAddNote] - "Add Note" (menu baris "⋮", mockup rmNote): buka Detail Lead tab Activity dengan kotak catatan TERBUKA (TD-318 Irisan 1, N3 -- dulu modal AddNoteModal di tempat, mockup tak punya modal terpisah untuk ini)
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {boolean} [openCaptureOnMount]
 * @param {string} [captureInitialName]
 * @param {() => void} [onCaptureClosed]
 */
export default function LeadCapturePage({ onSelectProspect, onQuickEdit, onAddNote, showToast, openCaptureOnMount, captureInitialName, onCaptureClosed }) {
  const { profile, erpRole, erpRoles } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);
  const isSalesOnly = isSalesOnlyRole(erpRole);
  const canManage = isManagerOrAbove(erpRoles);
  // Baris 'mine' selalu milik sendiri bagi isSalesOnly (query sudah
  // .eq('assigned_to', profile.id) di fetchLeads) -- jadi Mark as Lost di
  // bulk bar/menu baris aman tanpa cek kepemilikan per baris di sini.
  const canMarkLost = isSalesOnly || canManage;

  const [scope, setScope] = useState('all'); // 'mine' | 'all' -- paksa 'mine' kalau isSalesOnly
  // TD-318 Irisan Sorting -- default persis mockup (sort:'t', dir:-1 --
  // Last Touched terbaru dulu), sama dengan .order() hardcode lama.
  const [sortKey, setSortKey] = useState('t');
  const [sortDir, setSortDir] = useState(-1); // 1 = ascending, -1 = descending
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [owner, setOwner] = useState('all');
  const [entity, setEntity] = useState('all');
  const [createdBucket, setCreatedBucket] = useState('30');
  // Rentang Custom (N5) -- hanya dipakai saat createdBucket === 'custom'.
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [industry, setIndustry] = useState('all');
  const [priority, setPriority] = useState('all');
  const [touchedBucket, setTouchedBucket] = useState('all');
  // Ujung kanan slider (Rp 600 juta) = "tanpa batas" (persis posisi default
  // mockup), BUKAN "maksimal persis 600jt" -- filter hanya diterapkan saat
  // digeser di BAWAH ujung kanan. ESTIMATED_MAX_JUTA juga dipakai "Clear all".
  const [estimatedMaxJuta, setEstimatedMaxJuta] = useState(ESTIMATED_MAX_JUTA);
  const [industryOptions, setIndustryOptions] = useState([]);
  const [owners, setOwners] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  // Dibuka langsung dari prop saat mount (lazy initializer) -- BUKAN effect
  // ber-deps-kosong, supaya react-hooks/set-state-in-effect tidak menyala;
  // ini memang hanya perlu berjalan sekali di mount pertama.
  const [captureOpen, setCaptureOpen] = useState(() => !!openCaptureOnMount);
  const [captureName, setCaptureName] = useState(() => (openCaptureOnMount ? (captureInitialName || '') : ''));
  const [importOpen, setImportOpen] = useState(false);
  // Satu state untuk ketiga modal aksi (Reassign/Assign to Sales, Mark as
  // Lost, Archive) -- dipicu DUA jalur: bulk bar (accounts = baris
  // terpilih) dan menu baris "⋮" (accounts = satu baris itu saja). Modal
  // itu sendiri (src/modules/crm/lead/components/) sudah menerima array,
  // jadi satu negara cukup untuk keduanya.
  const [modalAction, setModalAction] = useState(null); // { type:'reassign'|'lost'|'archive', accounts:[...] } | null
  const [rowMenuFor, setRowMenuFor] = useState(null);

  const effectiveScope = isSalesOnly ? 'mine' : scope;

  useEffect(() => {
    const companyId = entity !== 'all' ? entity : profile?.company_id;
    if (!companyId) return; // owners lama dibiarkan -- companyId kosong hanya saat profil belum siap
    supabase.from('profiles').select('id, full_name').eq('company_id', companyId).eq('active', true).limit(1000)
      .then(({ data }) => setOwners(data || []));
  }, [entity, profile?.company_id]);

  // TD-318 Irisan 1, #7: di-scope company_id persis CaptureLeadModal.jsx
  // (.or company_id.is.null,company_id.eq.X) -- dulu daftar INI nol scope
  // sementara daftar form sudah benar, dua pintu bisa beda isi (temuan #7).
  // Re-fetch saat entity/company_id berubah (dulu mount-sekali) supaya
  // "All"/entitas lain di filter Entity tetap menunjukkan daftar yang benar.
  useEffect(() => {
    const companyId = entity !== 'all' ? entity : profile?.company_id;
    supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lead_industry').eq('is_active', true).is('deleted_at', null)
      .or(`company_id.is.null,company_id.eq.${companyId || '00000000-0000-0000-0000-000000000000'}`)
      .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setIndustryOptions(data || []));
  }, [entity, profile?.company_id]);

  const fetchLeads = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    // Sengaja TANPA setLoading(true) sinkron di sini (react-hooks/set-state-in-effect
    // -- lihat pola useDaftarTtf, ttfGrouping.js): `loading` mulai `true` lewat
    // useState awal, jadi pemuatan PERTAMA tetap menampilkan "Loading data…";
    // refetch berikutnya (filter berubah) memperbarui baris tanpa kedipan loading,
    // konsekuensi yang diterima (bukan dipertahankan dari ProspectListPage.jsx lama).
    try {
      let query = supabase
        .from('accounts')
        .select(`
          id, code, name, source, industry, priority, lifecycle_stage, qualified_at,
          assigned_to, estimated_value, last_activity_at, created_at, company_id,
          is_in_lead_pool, is_stale, stale_flagged_at,
          bant_budget, bant_authority, bant_need, bant_timeline,
          assigned_profile:profiles!prospects_assigned_to_fkey(full_name),
          contacts(id, name, is_primary, deleted_at)
        `, { count: 'exact' })
        .neq('lifecycle_stage', 'free_agent')
        .is('deleted_at', null);

      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      else if (entity !== 'all') query = query.eq('company_id', entity);

      if (effectiveScope === 'mine') query = query.eq('assigned_to', profile.id);

      if (status === STATUS_STALE) query = query.eq('is_stale', true);
      else if (status !== 'all') query = applyLeadStatusFilter(query, status);
      if (source !== 'all') query = query.eq('source', source);
      if (owner === OWNER_UNASSIGNED) query = query.is('assigned_to', null).eq('is_in_lead_pool', false);
      else if (owner !== 'all') query = query.eq('assigned_to', owner);
      if (industry !== 'all') query = query.eq('industry', industry);
      if (priority !== 'all') query = query.eq('priority', priority);
      // TD-318 Irisan 1, N5: enam nilai Created Date (bukan lagi bucket hari
      // generik) -- 'today'/'month' punya predikat sendiri, 'custom' memakai
      // rentang customFrom/customTo (salah satu sisi boleh kosong).
      if (createdBucket === 'today') query = query.gte('created_at', startOfTodayIso());
      else if (createdBucket === 'month') query = query.gte('created_at', startOfMonthIso());
      else if (createdBucket === 'custom') {
        if (customFrom) query = query.gte('created_at', new Date(`${customFrom}T00:00:00`).toISOString());
        if (customTo) query = query.lte('created_at', new Date(`${customTo}T23:59:59`).toISOString());
      } else if (createdBucket !== 'all') query = query.gte('created_at', daysAgoIso(Number(createdBucket)));
      // TD-318 Irisan 1, #4: predikat DIBALIK ke `.lte` -- label "More than N
      // days" berarti TERBENGKALAI lebih dari N hari (last_activity_at <= N
      // hari lalu), bukan "disentuh dalam N hari terakhir" (`.gte`, bug lama).
      if (touchedBucket !== 'all') query = query.lte('last_activity_at', daysAgoIso(Number(touchedBucket)));
      if (estimatedMaxJuta < ESTIMATED_MAX_JUTA) query = query.lte('estimated_value', estimatedMaxJuta * 1_000_000);
      // TD-318 Irisan 1, #5: pencarian kini juga menemukan nama kontak --
      // placeholder (mockup :60) menjanjikan ini, kode lama hanya name/code.
      // PostgREST tak bisa meng-OR-kan kondisi ke dalam tabel embed tanpa
      // `!inner` (yang akan ikut MEMBUANG lead tanpa kontak dari hasil) --
      // jadi account_id yang kontaknya cocok dicari lebih dulu lewat query
      // terpisah, lalu digabung ke `.or()` utama lewat `id.in.(...)`.
      const term = search.trim();
      if (term) {
        const { data: contactHits } = await supabase.from('contacts').select('account_id')
          .ilike('name', `%${term}%`).is('deleted_at', null).limit(200);
        const orParts = [`name.ilike.%${term}%`, `code.ilike.%${term}%`];
        const contactAccountIds = [...new Set((contactHits || []).map((c) => c.account_id))];
        if (contactAccountIds.length) orParts.push(`id.in.(${contactAccountIds.join(',')})`);
        query = query.or(orParts.join(','));
      }

      // TD-318 Irisan Sorting -- kolom & arah dinamis (mockup :538-539: klik
      // kolom baru = ascending, klik ulang = dibalik). nullsFirst:false di
      // KEDUA arah (bukan hanya default Postgres utk DESC) supaya Unassigned/
      // tanpa kontak/status tak dikenal selalu di akhir, bukan di depan saat
      // sort dibalik.
      query = query.order(SORT_ORDER_COLUMN[sortKey] || 'last_activity_at', { ascending: sortDir === 1, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      setLeads(data || []);
      setTotal(count || 0);
      setSelected(new Set()); // baris yang ditampilkan berganti -- pilihan lama tak lagi relevan
    } catch (err) {
      showToast?.('Failed to load leads: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
    // Dep array memakai `profile` UTUH, bukan profile?.id/profile?.company_id --
    // React Compiler menyimpulkan dependensinya sebagai objek `profile` (bukan
    // sub-path-nya), dan menyebut keduanya "kurang spesifik dari sumber" kalau
    // dibiarkan optional-chained (react-hooks/preserve-manual-memoization).
  }, [profile, isAllEntities, effectiveScope, entity, status, source, owner, industry, priority, createdBucket, customFrom, customTo, touchedBucket, estimatedMaxJuta, search, page, sortKey, sortDir, showToast]);

  // Promise.resolve().then(...) -- pola yang sudah dipakai di tempat lain
  // (AssetDetailITPage.jsx, useHrgaRequests.js) untuk menghindari
  // react-hooks/set-state-in-effect saat effect memanggil fungsi yang
  // isinya men-setState.
  useEffect(() => { Promise.resolve().then(fetchLeads); }, [fetchLeads]);

  // Halaman kembali ke 0 tiap filter berubah -- pola "adjust state during
  // render" (bukan effect terpisah), sama dengan ImportLeadsModal.previewKey.
  const filterKey = `${effectiveScope}|${status}|${source}|${owner}|${entity}|${industry}|${priority}|${createdBucket}|${customFrom}|${customTo}|${touchedBucket}|${estimatedMaxJuta}|${search}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    if (page !== 0) setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allChecked = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(leads.map((l) => l.id)));
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // TD-318 Irisan Sorting -- mekanika PERSIS mockup (:538-539): kolom baru
  // selalu mulai ascending (dir=1); klik kolom yang sedang aktif membalik
  // arah, bukan mengulang ascending.
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  const scopeLabel = effectiveScope === 'mine' ? 'showing your leads only' : 'showing all team leads';

  // TD-318 Irisan 1, N7: grid-template-columns PERSIS mockup Capture/Table
  // (disalin literal -- JANGAN dihitung ulang/dibulatkan, pola sama dengan
  // QUAL_GRID_COLS Irisan 0c). min-width:1180px mockup SALAH HITUNG lagi
  // (lantai asli = 752px 8 kolom tetap + 440px minimum 3 kolom minmax =
  // 1192px) -- diterima sesuai keputusan Irisan 1 (geser 7px di 1475px
  // DITERIMA, kolom tidak diubah).
  const CAPTURE_GRID_COLS = '40px 96px 124px minmax(170px,1.4fr) minmax(120px,1fr) 108px 100px minmax(150px,1fr) 136px 104px 44px';
  const CAPTURE_GRID_MIN_W = 1180;
  // headCell TANPA whiteSpace:'nowrap' (TD-318 Irisan 1, 3b) -- "ACCOUNT CODE"
  // (96px) menempel ke "COMPANY NAME" kalau dipaksa satu baris; kolom 96px
  // ini cacat bawaan mockup sendiri (dilaporkan ke Den utk Claude Design).
  // Lebar kolom TIDAK diubah, hanya judul boleh turun ke baris kedua.
  const headCell = { padding: '12px', fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT };
  const cell = { padding: '12px', fontFamily: FONT_BODY, fontSize: 13.5, color: INK, minWidth: 0 };

  return (
    <div>
      {/* TANPA `crumbs`: breadcrumb "Modul > Level 2 > Level 3" sudah dirender
          SEKALI oleh ContextHeader (route-table.jsx, layout bersama seluruh
          halaman Kerangka Bagian 1) -- mengirim crumbs di sini menghasilkan
          breadcrumb GANDA (ditemukan saat verifikasi visual terhadap staging,
          bukan dari pembacaan mockup/kode saja). */}
      <PageHeader
        title="Multi-channel Lead Capture"
        right={(
          <div style={{ display: 'flex', gap: SP.s2 }}>
            <OutlineBtn icon={<UploadIcon size={15} />} onClick={() => setImportOpen(true)}>Import Leads</OutlineBtn>
            <PrimaryBtn icon={<Plus size={15} />} onClick={() => { setCaptureName(''); setCaptureOpen(true); }}>Capture Lead</PrimaryBtn>
          </div>
        )}
      />

      <Card style={{ marginBottom: SP.s4 }} pad={SP.s4}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s3, alignItems: 'flex-end', marginBottom: SP.s3 }}>
          <Field label="Status"><Select value={status} onChange={setStatus} width={140} options={[{ value: 'all', label: 'All' }, ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_META[s].label })), { value: STATUS_STALE, label: 'Stale' }]} /></Field>
          <Field label="Source"><Select value={source} onChange={setSource} width={150} options={[{ value: 'all', label: 'All sources' }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))]} /></Field>
          {!isSalesOnly && (
            <Field label="Owner"><Select value={owner} onChange={setOwner} width={160} options={[{ value: 'all', label: 'All' }, { value: OWNER_UNASSIGNED, label: 'Tanpa pemilik' }, ...owners.map((o) => ({ value: o.id, label: o.full_name }))]} /></Field>
          )}
          {isAllEntities && (
            <Field label="Entity"><Select value={entity} onChange={setEntity} width={110} options={[{ value: 'all', label: 'All' }, ...ENTITIES.map((e) => ({ value: e.id, label: e.code }))]} /></Field>
          )}
          <Field label="Created Date"><Select value={createdBucket} onChange={setCreatedBucket} width={150} options={CREATED_DATE_OPTIONS} /></Field>
          {createdBucket === 'custom' && (
            <>
              <Field label="From"><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                style={{ height: 44, width: 150, borderRadius: RADIUS.md, border: `1px solid ${LINE}`, padding: '0 10px', fontFamily: FONT_BODY, fontSize: 13.5, color: INK }} /></Field>
              <Field label="To"><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                style={{ height: 44, width: 150, borderRadius: RADIUS.md, border: `1px solid ${LINE}`, padding: '0 10px', fontFamily: FONT_BODY, fontSize: 13.5, color: INK }} /></Field>
            </>
          )}
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Field label="Search"><SearchInput value={search} onChange={setSearch} placeholder="Company name, contact name, or account code" /></Field>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3 }}>
          <button type="button" onClick={() => setAdvancedOpen((o) => !o)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: RADIUS.md,
            border: `1px solid ${LINE}`, background: advancedOpen ? ROW_HOVER : '#fff', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer',
          }}>Advanced</button>
          {/* TD-318 Irisan 1, #6: createdBucket/customFrom/customTo kini ikut
              dihitung sebagai "filter aktif" dan ikut direset -- dulu nol
              keduanya, jadi Clear all tak pernah bisa melepas Created Date
              (defaultnya '30', bukan 'all', sehingga diam-diam selalu aktif). */}
          {(status !== 'all' || source !== 'all' || owner !== 'all' || entity !== 'all' || industry !== 'all' || priority !== 'all' || createdBucket !== 'all' || touchedBucket !== 'all' || estimatedMaxJuta !== ESTIMATED_MAX_JUTA || search) && (
            <button type="button" onClick={() => { setStatus('all'); setSource('all'); setOwner('all'); setEntity('all'); setIndustry('all'); setPriority('all'); setCreatedBucket('all'); setCustomFrom(''); setCustomTo(''); setTouchedBucket('all'); setEstimatedMaxJuta(ESTIMATED_MAX_JUTA); setSearch(''); }}
              style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>Clear all</button>
          )}
        </div>

        {advancedOpen && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.s3, marginTop: SP.s3, paddingTop: SP.s3, borderTop: `1px solid ${LINE_SOFT}` }}>
            <Field label="Industry"><Select value={industry} onChange={setIndustry} width={160} options={[{ value: 'all', label: 'All' }, ...industryOptions.map((o) => ({ value: o.value, label: o.label }))]} /></Field>
            <Field label="Priority"><Select value={priority} onChange={setPriority} width={120} options={[{ value: 'all', label: 'All' }, ...PRIORITIES.map((p) => ({ value: p, label: p }))]} /></Field>
            <div style={{ width: 200 }}>
              <Slider
                label="Estimated Value, up to" value={estimatedMaxJuta} onChange={setEstimatedMaxJuta}
                min={0} max={ESTIMATED_MAX_JUTA} step={10}
                formatValue={(v) => `Rp ${v} million`}
              />
            </div>
            <Field label="Last Touched"><Select value={touchedBucket} onChange={setTouchedBucket} width={150} options={TOUCHED_OPTIONS} /></Field>
          </div>
        )}
      </Card>

      {!isSalesOnly && (
        <div style={{ marginBottom: SP.s3 }}>
          <Segmented ariaLabel="Lead scope" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My Leads' }, { value: 'all', label: 'All Leads' }]} />
        </div>
      )}

      {selected.size > 0 && (
        <div style={{
          // TD-318 Irisan 1, N4: HEAD_BG (bukan ROW_HOVER) -- mockup
          // Capture/BulkBar (:70) background #EFF3ED = HEAD_BG, token lama salah.
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap',
          background: HEAD_BG, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 16px', marginBottom: SP.s3,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: FONT_BODY }}>{selected.size} selected</span>
            {canManage && (
              <OutlineBtn size="sm" icon={<UserPlus size={14} />} onClick={() => setModalAction({ type: 'reassign', accounts: leads.filter((l) => selected.has(l.id)) })}>
                Assign to Sales
              </OutlineBtn>
            )}
            {canManage && (
              <OutlineBtn size="sm" onClick={() => setModalAction({ type: 'archive', accounts: leads.filter((l) => selected.has(l.id)) })}>Archive</OutlineBtn>
            )}
            {canMarkLost && (
              <OutlineBtn size="sm" style={{ color: '#B4432A', borderColor: '#B4432A' }} onClick={() => {
                // Baris 'customer'/'lost' dikeluarkan dari target -- bulk select bisa
                // mencampur status, dan menandai akun yang sudah jadi customer sebagai
                // Lost tidak masuk akal (sama seperti penjagaan rowCanMarkLost di
                // menu baris '⋮'). Baris yang dikeluarkan tetap TERPILIH di tabel
                // (selected tak diubah) -- jumlah & alasannya ditampilkan di modal
                // lewat skippedCount/skippedReason (koreksi Den), bukan dibiarkan
                // hilang diam-diam.
                const selectedRows = leads.filter((l) => selected.has(l.id));
                const eligible = selectedRows.filter((l) => deriveLeadStatus(l) !== 'customer' && deriveLeadStatus(l) !== 'lost');
                const skippedCount = selectedRows.length - eligible.length;
                setModalAction({ type: 'lost', accounts: eligible, skippedCount, skippedReason: 'already Customer or already Lost' });
              }}>
                Mark as Lost
              </OutlineBtn>
            )}
          </div>
          <button type="button" onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', padding: 0, color: INK_SOFT, fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_BODY }}>Clear selection</button>
        </div>
      )}

      <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: SP.s2, fontFamily: FONT_BODY }}>{total} lead{total === 1 ? '' : 's'}, {scopeLabel}</div>

      {/* TD-318 Irisan 1, N7: border diganti inset box-shadow (pola persis
          Irisan 0d LeadQualificationPage) -- border 1px x2 sisi kartu
          `padded={false}` memakan 2px yang tak terhitung di kalkulasi lebar
          jendela Den (1475-248-40=1187), inset box-shadow membebaskannya
          tanpa mengubah tampilan atau menyentuh Card bersama. */}
      <Card padded={false} style={{ border: 'none', boxShadow: `inset 0 0 0 1px ${LINE}` }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
        ) : leads.length === 0 ? (
          <EmptyState
            icon="inbox" title="No leads match these filters" sub="Change or clear the filters, or capture a new lead."
            action={(
              <div style={{ display: 'flex', gap: SP.s2 }}>
                <OutlineBtn onClick={() => setImportOpen(true)}>Import Leads</OutlineBtn>
                <PrimaryBtn onClick={() => { setCaptureName(''); setCaptureOpen(true); }}>Capture Lead</PrimaryBtn>
              </div>
            )}
          />
        ) : (
          <div className="nk-scroll" role="table" aria-label="Leads" style={{ overflowX: 'auto' }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: CAPTURE_GRID_COLS, minWidth: CAPTURE_GRID_MIN_W, alignItems: 'center', background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
              <div role="columnheader" style={headCell}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" /></div>
              <SortHeadCell col="code" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Account Code</SortHeadCell>
              <SortHeadCell col="src" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Source</SortHeadCell>
              <SortHeadCell col="co" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Company Name</SortHeadCell>
              <SortHeadCell col="contact" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Primary Contact</SortHeadCell>
              <SortHeadCell col="st" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Status</SortHeadCell>
              <SortHeadCell col="bant" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>BANT Score</SortHeadCell>
              <SortHeadCell col="ow" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Owner</SortHeadCell>
              <SortHeadCell col="val" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={{ ...headCell, textAlign: 'right' }} align="right">Estimated Value</SortHeadCell>
              <SortHeadCell col="t" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} style={headCell}>Last Touched</SortHeadCell>
              <div role="columnheader" style={headCell} />
            </div>
            {leads.map((l, i) => {
              const lstatus = deriveLeadStatus(l);
              const meta = lstatus ? LEAD_STATUS_META[lstatus] : null;
              // 'customer' dikecualikan juga -- akun yang sudah jadi customer tak
              // boleh ditandai Lost dari sini (LeadDetailPage sendiri tak bisa
              // dibuka untuk akun ini sama sekali, redirect ke /crm/customer/:id,
              // tapi menu baris '⋮' di daftar ini jalur TERPISAH yang butuh
              // penjagaan sendiri).
              const rowCanMarkLost = canMarkLost && lstatus !== 'lost' && lstatus !== 'customer';
              const rowMenuOpen = rowMenuFor === l.id;
              return (
                <div key={l.id} role="row"
                  onClick={() => onSelectProspect?.(l)}
                  style={{ display: 'grid', gridTemplateColumns: CAPTURE_GRID_COLS, minWidth: CAPTURE_GRID_MIN_W, alignItems: 'center', borderBottom: i < leads.length - 1 ? `1px solid ${LINE_SOFT}` : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = ROW_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div role="cell" style={cell} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} aria-label={`Select ${l.name}`} />
                  </div>
                  {/* TD-318 Irisan 1, 3a: garis bawah HANYA saat kode ADA (gaya
                      tautan, mockup `<a>` persis) -- kode kosong = "—" polos,
                      tanpa garis bawah supaya tak terlihat seperti tautan/"=". */}
                  <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, fontWeight: 600 }}>
                    {l.code ? <span style={{ textDecoration: 'underline' }}>{l.code}</span> : '—'}
                  </div>
                  <div role="cell" style={cell}><Badge tone="neutral">{SOURCE_LABELS[l.source] || l.source || '—'}</Badge></div>
                  <div role="cell" style={{ ...cell, fontWeight: 500 }}>{l.name}</div>
                  <div role="cell" style={{ ...cell, color: INK_SOFT }}>{primaryContactOf(l)?.name || '—'}</div>
                  <div role="cell" style={cell}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : '—'}
                      {l.is_stale && <Badge tone="warn" title={`Not touched since ${fmtDate(l.stale_flagged_at)}`}>Stale</Badge>}
                    </span>
                  </div>
                  <div role="cell" style={cell}><BantCell score={calcBantScoreSafe(l)} /></div>
                  <div role="cell" style={cell}><OwnerCell id={l.assigned_to} name={l.assigned_profile?.full_name} /></div>
                  <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, whiteSpace: 'nowrap', textAlign: 'right' }}>{l.estimated_value != null ? fmtRp(l.estimated_value) : '—'}</div>
                  <div role="cell" style={{ ...cell, color: INK_SOFT, whiteSpace: 'nowrap' }}>{fmtDate(l.last_activity_at)}</div>
                  <div role="cell" style={{ ...cell, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                      <IconButton size="xs" variant="ghost" icon={<MoreVertical size={14} />} label="Row actions" onClick={() => setRowMenuFor(rowMenuOpen ? null : l.id)} />
                      {rowMenuOpen && (
                        <>
                          <div onClick={() => setRowMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                          {/* TD-318 Irisan 1, N3: PERSIS mockup menuIsRow -- TIGA item
                              saja (Quick Edit/Add Note/Mark as Lost). Reassign dan
                              Archive DICABUT dari sini (mockup tak punya keduanya
                              di menu baris) -- tetap tersedia lewat bulk bar di
                              atas untuk baris yang dicentang. */}
                          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 150, zIndex: 10, overflow: 'hidden' }}>
                            {onQuickEdit && (
                              <button type="button" onClick={() => { setRowMenuFor(null); onQuickEdit(l); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK }}>
                                Quick Edit
                              </button>
                            )}
                            {onAddNote && (
                              <button type="button" onClick={() => { setRowMenuFor(null); onAddNote(l); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK }}>
                                Add Note
                              </button>
                            )}
                            {rowCanMarkLost && (
                              <button type="button" onClick={() => { setRowMenuFor(null); setModalAction({ type: 'lost', accounts: [l] }); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: '#B4432A' }}>
                                Mark as Lost
                              </button>
                            )}
                          </div>
                        </>
                      )}
                      <ChevronRight size={15} color={INK_FAINT} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div style={{ marginTop: SP.s3 }}>
          <Pager left={`Page ${page + 1} of ${totalPages}, ${PAGE_SIZE} rows per page`} page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      <CaptureLeadModal
        open={captureOpen} onClose={() => { setCaptureOpen(false); onCaptureClosed?.(); }}
        initialName={captureName} showToast={showToast}
        onSaved={(account) => { setCaptureOpen(false); showToast?.('Lead captured'); fetchLeads(); onSelectProspect?.(account); }}
      />
      <ImportLeadsModal open={importOpen} onClose={() => setImportOpen(false)} showToast={showToast} onImported={fetchLeads} />

      <ReassignModal open={modalAction?.type === 'reassign'} onClose={() => setModalAction(null)} accounts={modalAction?.type === 'reassign' ? modalAction.accounts : []} showToast={showToast}
        onReassigned={() => { setModalAction(null); setSelected(new Set()); showToast?.('Lead reassigned'); fetchLeads(); }} />
      <MarkAsLostModal open={modalAction?.type === 'lost'} onClose={() => setModalAction(null)} accounts={modalAction?.type === 'lost' ? modalAction.accounts : []}
        skippedCount={modalAction?.type === 'lost' ? modalAction.skippedCount : 0} skippedReason={modalAction?.skippedReason}
        showToast={showToast}
        onMarked={() => { setModalAction(null); setSelected(new Set()); showToast?.('Lead marked as Lost'); fetchLeads(); }} />
      <ArchiveModal open={modalAction?.type === 'archive'} onClose={() => setModalAction(null)} accounts={modalAction?.type === 'archive' ? modalAction.accounts : []} showToast={showToast}
        onArchived={() => { setModalAction(null); setSelected(new Set()); showToast?.('Lead archived'); fetchLeads(); }} />
    </div>
  );
}

// TD-318 Irisan Sorting -- header kolom sortable, gaya interaksi ikut pola
// `Th` SalesOrderPage.jsx (warna aktif + panah ↑/↓/⇅, cursor pointer) --
// diadaptasi dari `<th>` ke `<div role="columnheader">` karena Capture/Table
// CSS grid (bukan <table>), bukan konvensi baru. Arrow TANPA label arah di
// aria (cukup ganti warna+bold saat aktif utk screen reader via :active).
function SortHeadCell({ col, sortKey, sortDir, onClick, style, align, children }) {
  const active = sortKey === col;
  return (
    <div role="columnheader" style={{ ...style, display: 'flex', alignItems: 'center', gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <button type="button" onClick={() => onClick(col)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, padding: 0, margin: 0, cursor: 'pointer', userSelect: 'none', font: 'inherit', color: active ? INK : 'inherit' }}>
        {children}
        <span style={{ opacity: active ? 1 : 0.4, fontSize: 10 }}>{active ? (sortDir > 0 ? '↑' : '↓') : '⇅'}</span>
      </button>
    </div>
  );
}

// BANT score dari EMPAT kolom dimensi (sama dgn ProspectFormPage) -- bukan
// bant_score tersimpan (kolom lama, bisa basi), dihitung di klien dari nilai
// baris yang sudah di-select. Kolom dimensi BELUM ikut di-select query utama
// (hanya dipakai di sini sbg skor ringkasan tabel) -- lihat catatan irisan di
// laporan akhir: kolom bant_* ditambahkan ke select query, dihitung aman
// kalau salah satu kosong (Number(x)||0).
function calcBantScoreSafe(row) {
  const dims = ['bant_budget', 'bant_authority', 'bant_need', 'bant_timeline'];
  return dims.reduce((sum, k) => sum + (Number(row[k]) || 0), 0);
}

// TD-318 Irisan 1, N1: label persis FieldLabel kit (src/kit/Form.jsx) --
// 12px/600/Inter/INK_SOFT/marginBottom 8, NOL uppercase/letter-spacing.
// Sebelumnya dipakai gaya "th" (11px/700/UPPERCASE/letter-spacing .04em) --
// cocok untuk header tabel, salah untuk label field. Wrapper lokal
// dipertahankan (bukan ganti ke FloatingSelect) supaya width per-field tetap
// bisa diatur eksplisit -- mockup sendiri CSS grid auto-fill, bukan lebar
// tetap per field, jadi menyamakan wrapper-nya juga akan menambah
// penyimpangan baru yang belum diputuskan, di luar scope N1.
function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 8, fontFamily: FONT_BODY }}>{label}</div>
      {children}
    </div>
  );
}
