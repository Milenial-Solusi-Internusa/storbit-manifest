// src/modules/crm/InquiryOwnerAssignmentPage.jsx
// Putaran 3 Tahap 3B -- halaman BARU "Inquiry Owner Assignment" (menu 1.2.3,
// src/routes/menu-skeleton.js). Mockup acuan design-handoff/mockup/Inquiry
// Management.dc.html -- dibaca UTUH (baris 156-249 filter+bagian pOwner,
// 710 AV, 716 overdue, 827-830 wlRows/meList, 913-922 dupPairRows/dupIntro,
// 974-979 ownOpts/ownCount/wlRows/meRows, 1030 openReassign) sebelum ditulis.
//
// ⛔ KOREKSI atas instruksi tugas, DIKONFIRMASI Den: tab kedua mockup
// "Team Workload" (baris 220-228) adalah tabel AGREGAT per-salesperson
// BACA-SAJA yang klik barisnya menavigasi ke Inquiry List terfilter owner
// itu (baris 829: `go: () => set({ page:'status', owner:n, scope:'all',
// stSel: OPEN })`) -- BUKAN daftar inquiry dengan tombol Reassign per baris
// seperti sempat dijelaskan di instruksi. Mockup menang; "Reassign"
// satu-satunya ada di Detail Inquiry (baris 1030, Lingkup F). Dicatat
// sebagai deviasi INSTRUKSI, bukan deviasi mockup.
//
// Brand: navy/orange/cream (C di bawah) -- BUKAN sage, sama alasan
// InquiryClassificationPage.jsx (CRM/Inquiry belum giliran migrasi kit).
//
// Scope SENGAJA DIPERSEMPIT (instruksi eksplisit Tahap 3B): TANPA bulk
// assign, TANPA filter Created Date/Entity -- "filter Entity" yang
// ditunda berarti SELURUH halaman ini (Unassigned/Team Workload/Possible
// Duplicates) di-scope ke profile.company_id SAJA untuk SEMUA peran
// termasuk super_admin/isAllEntities -- roster (fetchOperationalRoster)
// dan RPC list_possible_duplicate_inquiry_pairs/reassign_inquiry_owner
// semuanya mengambil SATU company_id, jadi pandangan lintas-entitas sejati
// butuh perubahan terpisah di ketiganya (giliran berikutnya kalau
// diperlukan), bukan dibangun diam-diam di sini.
//
// [Putaran 8] "TANPA bulk assign" TETAP BERLAKU -- mockup menaruh bulk
// assign di jendela ("Jendela assign dan bulk assign", Grand Design Sync
// Report.md:42) yang SAMA dengan single-assign (`{{ mAssign }}`, mockup
// baris 461-475) -- jendela itu sendiri eksplisit Putaran 11. Membangun
// checkbox+bulk sekarang berarti membangun separuh jendela lebih awal.
// Dua gap kosmetik lain pada tab Unassigned DITUTUP Putaran 8 (BUKAN
// ditunda, lihat DirectionCell + undernameBadgeStyle di bawah): ikon
// Direction (Export/Import/Domestic, pola identik InquiryListPage.jsx
// directionCell) dan badge "Undername" pada kolom Service Type -- sumber
// field PERSIS InquiryListPage.jsx:986 --
// `(inq.additional_services || []).includes('undername')`.
//
// Sales (non-manager) HANYA melihat "Assigned to Me" -- RLS inquiries_read
// sudah menyaring ke owner_id=auth.uid(), NOL filter owner tambahan di FE.
//
// [Putaran 8, L-13] KOREKSI atas paragraf di atas (versi Tahap 3B):
// ketidakcocokan arsitektur yang dicatat dulu (audit_logs RLS
// `read = is_admin_or_above()`, Sales tak akan pernah bisa membacanya)
// DITUTUP, bukan diterima selamanya -- jalan keluarnya BUKAN membuka akses
// audit_logs, melainkan menaruh datanya di inquiries sendiri: 3 kolom baru
// `assigned_by`/`assigned_at`/`assign_reason` (migrasi
// 20261027000001_crm_inquiry_owner_assignment_columns.sql), diisi oleh
// reassign_inquiry_owner v2 (20261027000003), di bawah RLS
// `inquiries_read` yang SUDAH membolehkan Sales membaca baris miliknya.
// Riwayat lengkap (banyak baris, from/to/reason) masuk tabel BARU terpisah
// `inquiry_owner_history` (20261027000002) -- tampilannya di tab Status
// History Detail Inquiry DITUNDA ke Putaran 11 (keputusan Mas), tabel ini
// baru dibaca balik mulai putaran itu.
// Kolom mockup "Assigned By"/"Assigned On"/"Reason" (baris 232/236) KINI
// DIBANGUN -- menggantikan Service Type/Direction yang dulu jadi pengganti
// sementara (lihat ME_GRID). Fallback kalau NULL (baris lama, SENGAJA
// TIDAK dibackfill -- keputusan Mas): "Not set", sama seperti fallback
// `assignReason || 'Not set'` mockup sendiri -- BUKAN nama dummy mockup
// `'Dewi Lestari'`, itu placeholder desain bukan default produk. Badge
// "New" (Inquiry No cell) kalau `assigned_at` <=3 hari dari getTodayWIB(),
// persis `isNewAssign` mockup baris 979.
// Kolom yang dibangun sekarang: Inquiry No/Customer/Assigned By/Assigned
// On/Reason/Status (persis mockup, Service Type & Direction DICABUT dari
// tab ini -- tidak ada di mockup).
//
// Avatar owner: SATU warna solid untuk SEMUA nama (bukan AV{} per-nama
// mockup) -- yang berubah HANYA garis putus saat owner kosong (instruksi
// eksplisit).
//
// Pengambilan data: SATU select ke `inquiries` dgn embed ke `accounts`/
// `profiles!inquiries_created_by_fkey` (BUKAN inquiries->inquiries, BUKAN
// owner_id->profiles -- dua embed yang terbukti ditolak PostgREST, lihat
// InquiryListPage.jsx/PipelineKanbanPage.jsx:111-121) + loop .range()
// berhalaman (bukan .limit(1000) tunggal -- instruksi eksplisit, pola
// identik InquiryClassificationPage.jsx). Nama OWNER untuk Team Workload
// datang dari roster (fetchOperationalRoster), BUKAN pola dua-langkah
// profiles -- roster ITU SENDIRI adalah himpunan nama yang dibutuhkan
// (satu baris per kandidat owner), jadi tak perlu query nama terpisah.
// [Putaran 8] select diperluas: `additional_services` (badge Undername,
// T-3) + `assigned_by`/`assigned_at`/`assign_reason` (kolom baru, L-13) +
// embed `profiles!inquiries_assigned_by_fkey` (nama "Assigned By", pola
// embed FK yang sama dgn `created_by_profile`).
//
// Tab "Possible duplicates" (mockup baris 207/913-922): RPC
// list_possible_duplicate_inquiry_pairs (migrasi 20261024000005) + aksi
// "Close as Duplicate" -> RPC EXISTING close_inquiry_as_duplicate
// (Irisan 4, TIDAK ditulis ulang logikanya di sini -- instruksi eksplisit).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, ArrowUpRight, ArrowDownLeft, Truck, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import { fetchOperationalRoster } from './salesRoster';
import { STATUS_LABEL } from './v3/tokens';
import { fmtRp } from './DealPanels';
import ConfirmModal from '../../components/ConfirmModal';

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
  warn:      '#9A6B0E', warnBg: '#F8ECCF', warnBd: '#E6CE94',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
};

// Cermin STATUS_META InquiryListPage.jsx/InquiryClassificationPage.jsx --
// disalin, bukan diimpor (pola per-file sudah mapan, lihat Classification).
const STATUS_META = {
  OPEN:        { label: STATUS_LABEL.OPEN,        bg: '#E4EEF7', color: '#1D5A96', bd: '#BCD0E4' },
  IN_REVIEW:   { label: STATUS_LABEL.IN_REVIEW,   bg: '#FBF0DD', color: '#916312', bd: '#E6D4B4' },
  QUOTED:      { label: STATUS_LABEL.QUOTED,      bg: '#EEEAF6', color: '#5B4A96', bd: '#D1CAE3' },
  NEGOTIATION: { label: STATUS_LABEL.NEGOTIATION, bg: '#FDE7DB', color: '#B53F0D', bd: '#EFC5B2' },
  WON:         { label: STATUS_LABEL.WON,         bg: '#E1E9F2', color: '#144682', bd: '#B8C8DC' },
  LOST:        { label: STATUS_LABEL.LOST,        bg: '#FBE7E5', color: '#B33A2E', bd: '#EDC4C0' },
  CANCELLED:   { label: STATUS_LABEL.CANCELLED,   bg: '#EDEBE7', color: '#6B6459', bd: '#D3D0CB' },
};

// service_type DINAMIS -- pola identik InquiryClassificationPage.jsx
// (trucking ditambah sesudah koreksi review Vir Tahap 3A, produksi punya 8).
const SERVICE_TYPES_FALLBACK = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs',            label: 'Customs Clearance' },
  { value: 'trading',            label: 'General Trading' },
  { value: 'trucking',           label: 'Trucking' },
];

const EDITABLE_STATUSES = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];
const PAGE_SIZE = 1000;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Direction icon -- pola identik InquiryListPage.jsx:858-868 (directionCell):
// Export naik-kanan, Import turun-kiri, Domestic truk. Putaran 8, tab
// Unassigned SAJA (T-2) -- tab Assigned to Me tidak lagi punya kolom
// Direction (dicabut, lihat ME_GRID/L-13).
const DIRECTION_ICON = { Export: ArrowUpRight, Import: ArrowDownLeft, Domestic: Truck };
function DirectionCell({ direction }) {
  if (!direction) return 'Not set';
  const Icon = DIRECTION_ICON[direction];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {Icon && <Icon size={13} />}
      {direction}
    </span>
  );
}

// Badge "New" (Assigned to Me) -- mockup baris 979 `isNewAssign:
// days(...) <= 3`. WIB, metode SAMA dgn getTodayWIB() (bukan Date.now()
// mentah) supaya batas hari konsisten dgn overdue Team Workload di file
// ini. Fungsi level-modul, BUKAN dipanggil Date.now()/new Date() langsung
// di badan komponen -- React Compiler menolak impure function di situ;
// fungsi terpisah tak ditelusuri (pola identik ageDays/daysSince
// InquiryListPage.jsx:122-138).
function daysSinceAssignedWIB(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dateWIB = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  return Math.round((new Date(getTodayWIB()) - new Date(dateWIB)) / 86400000);
}

// Paginasi berhalaman sampai habis -- JANGAN .limit(1000) tunggal
// (instruksi eksplisit, pola identik InquiryClassificationPage.jsx pasca
// koreksi review Vir). Order WAJIB deterministik lintas halaman.
async function fetchAllInquiries(companyId) {
  let list = [];
  let from = 0;
  let more = true;
  while (more) {
    const { data, error } = await supabase
      .from('inquiries')
      .select(`
        id, inquiry_no, service_type, direction, status, estimated_value, deadline_quote, created_at, owner_id,
        additional_services, assigned_by, assigned_at, assign_reason,
        prospect:accounts!inquiries_prospect_id_fkey(name),
        customer:accounts!inquiries_customer_id_fkey(name),
        created_by_profile:profiles!inquiries_created_by_fkey(full_name),
        assigned_by_profile:profiles!inquiries_assigned_by_fkey(full_name)
      `)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    list = list.concat(page);
    more = page.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return list;
}

const cellBase = { padding: '10px 12px', minWidth: 0 };
const headCell = {
  ...cellBase, fontFamily: "'Montserrat', sans-serif", fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.04em', color: C.inkSoft, whiteSpace: 'nowrap',
};
const tabBtnStyle = (active) => ({
  height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${active ? C.ink : 'transparent'}`, background: active ? C.surface : 'transparent',
  fontFamily: "'Montserrat', sans-serif", fontSize: 13.5, fontWeight: 600, color: C.ink,
  display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
});
const countBadgeStyle = {
  display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
  border: `1px solid ${C.warnBd}`, background: C.warnBg, color: C.warn,
  fontFamily: "'Montserrat', sans-serif", fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
};
// T-3 (Unassigned, Putaran 8) -- pola badge identik SubBadge
// InquiryListPage.jsx:267-280 tapi dgn style lokal file ini (bukan impor,
// pola per-file sudah mapan di file ini).
const undernameBadgeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 6,
  border: `1px solid ${C.line}`, background: C.lineSoft, color: C.inkSoft,
  fontFamily: "'Montserrat', sans-serif", fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
};
// Badge "New" (Assigned to Me, L-13) -- warna ok/hijau, SENGAJA beda dari
// countBadgeStyle (warn/amber, dipakai utk count & overdue) supaya "baru
// ditugaskan" tidak campur maknanya dgn "butuh perhatian".
const newAssignBadgeStyle = {
  display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
  border: `1px solid ${C.okBd}`, background: C.okBg, color: C.ok,
  fontFamily: "'Montserrat', sans-serif", fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
};

// Avatar owner -- SATU warna solid utk semua nama; garis putus HANYA saat
// kosong (instruksi eksplisit, BUKAN AV{} per-nama ala mockup).
function OwnerAvatar({ name }) {
  const initials = name ? name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '';
  return (
    <span style={{
      width: 24, height: 24, borderRadius: 12, flex: 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: C.accentSoft, color: C.ink,
      border: name ? '1px solid transparent' : `1px dashed ${C.inkFaint}`,
      fontFamily: "'Montserrat', sans-serif", fontSize: 10, fontWeight: 700,
    }}>
      {initials}
    </span>
  );
}

/**
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {(ownerId:string)=>void} [onViewSalesInquiries] -- Team Workload
 *   row click (mockup baris 829), navigasi ke halaman 1.2.4 "Inquiry Status
 *   & History" (ada sejak Putaran 7) terfilter OWNER SAJA -- status jatuh
 *   ke default 4-status OPEN_STATUSES milik halaman tujuan, bukan lagi
 *   dikunci 'OPEN' tunggal (L-12, Putaran 8 -- lihat crm.routes.jsx).
 */
export default function InquiryOwnerAssignmentPage({ showToast, onViewSalesInquiries }) {
  const { profile, erpRoles } = useAuth();
  const isManager = isManagerOrAbove(erpRoles);

  const { options: serviceTypeOptsRaw } = useDropdownOptions('service_type', SERVICE_TYPES_FALLBACK);
  const serviceTypeOpts = useMemo(
    () => serviceTypeOptsRaw.map((o) => ({ value: o.value, label: o.label })),
    [serviceTypeOptsRaw]
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState([]);
  const [activeTab, setActiveTab] = useState('unassigned'); // 'unassigned' | 'workload' | 'duplicates'
  const [dupPairs, setDupPairs] = useState([]);
  const [dupLoading, setDupLoading] = useState(true);
  const [assignDraft, setAssignDraft] = useState({});
  const [savingRowId, setSavingRowId] = useState(null);
  const [closeDupTarget, setCloseDupTarget] = useState(null);
  const [closingDup, setClosingDup] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const list = await fetchAllInquiries(profile.company_id);
      setRows(list);
    } catch (err) {
      showToast?.('Failed to load inquiries: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!isManager || !profile?.company_id) return;
    let cancelled = false;
    fetchOperationalRoster(profile.company_id).then((r) => { if (!cancelled) setRoster(r); });
    return () => { cancelled = true; };
  }, [isManager, profile?.company_id]);

  const fetchDupPairs = useCallback(async () => {
    if (!isManager || !profile?.company_id) { setDupLoading(false); return; }
    setDupLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_possible_duplicate_inquiry_pairs', { p_company_id: profile.company_id });
      if (error) throw error;
      setDupPairs(data || []);
    } catch (err) {
      showToast?.('Failed to load possible duplicates: ' + err.message, 'error');
    } finally {
      setDupLoading(false);
    }
  }, [isManager, profile, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchDupPairs(); }, [fetchDupPairs]);

  // ── Tab Unassigned: owner_id IS NULL + status editable (mockup "Every
  // inquiry has an owner." empty state -- line 218 -- berarti tabel ini
  // SENGAJA hanya menghitung baris yang BISA diisi, bukan seluruh NULL). ──
  const unassignedRows = useMemo(
    () => rows.filter((r) => !r.owner_id && EDITABLE_STATUSES.includes(r.status)),
    [rows]
  );

  // ── Tab Team Workload: agregat per anggota roster, SELURUH roster
  // ditampilkan (termasuk yang nol inquiry) -- mockup wlRows = SALES.map(...). ──
  const workloadRows = useMemo(() => {
    const today = getTodayWIB();
    const computed = roster.map((person) => {
      const mine = rows.filter((r) => r.owner_id === person.id);
      const openValue = mine
        .filter((r) => EDITABLE_STATUSES.includes(r.status))
        .reduce((a, r) => a + (Number(r.estimated_value) || 0), 0);
      // overdue mockup baris 716: isOpen(r) && !!r.dl && r.dl < TODAY.
      const overdueCount = mine.filter((r) =>
        EDITABLE_STATUSES.includes(r.status) && r.deadline_quote && r.deadline_quote < today
      ).length;
      return {
        id: person.id,
        name: person.full_name,
        open: mine.filter((r) => r.status === 'OPEN').length,
        review: mine.filter((r) => r.status === 'IN_REVIEW').length,
        quoted: mine.filter((r) => r.status === 'QUOTED').length,
        negotiation: mine.filter((r) => r.status === 'NEGOTIATION').length,
        openValue,
        overdueCount,
      };
    });
    const maxValue = Math.max(1, ...computed.map((w) => w.openValue));
    return computed.map((w) => ({ ...w, pct: Math.round((w.openValue / maxValue) * 100) }));
  }, [roster, rows]);

  function handleDraftChange(rowId, ownerId) {
    setAssignDraft((prev) => ({ ...prev, [rowId]: ownerId }));
  }

  async function handleAssign(row) {
    const newOwnerId = assignDraft[row.id];
    if (!newOwnerId) return;
    setSavingRowId(row.id);
    const { error } = await supabase.rpc('reassign_inquiry_owner', {
      p_inquiry_id: row.id,
      p_new_owner_id: newOwnerId,
    });
    setSavingRowId(null);
    if (error) { showToast?.('Failed to assign: ' + error.message, 'error'); return; }
    showToast?.(`${row.inquiry_no} assigned.`, 'success');
    setAssignDraft((prev) => { const next = { ...prev }; delete next[row.id]; return next; });
    fetchRows();
  }

  async function handleCloseDup() {
    if (!closeDupTarget) return;
    setClosingDup(true);
    const { error } = await supabase.rpc('close_inquiry_as_duplicate', {
      p_inquiry_id: closeDupTarget.dup_id,
      p_keep_inquiry_id: closeDupTarget.keep_id,
    });
    setClosingDup(false);
    if (error) {
      showToast?.(error.message, 'error');
      setCloseDupTarget(null);
      fetchDupPairs();
      return;
    }
    showToast?.(`${closeDupTarget.dup_no} closed as duplicate of ${closeDupTarget.keep_no}.`, 'success');
    setCloseDupTarget(null);
    fetchDupPairs();
    fetchRows();
  }

  const tabs = isManager ? [
    { key: 'unassigned', label: 'Unassigned', count: unassignedRows.length },
    { key: 'workload', label: 'Team Workload' },
    { key: 'duplicates', label: 'Possible duplicates', count: dupPairs.length },
  ] : [];

  const ownCountText = activeTab === 'unassigned'
    ? `${unassignedRows.length} ${unassignedRows.length === 1 ? 'inquiry' : 'inquiries'} without an owner`
    : activeTab === 'duplicates'
      ? `${dupPairs.length} possible duplicate ${dupPairs.length === 1 ? 'pair' : 'pairs'}`
      : `${roster.length} ${roster.length === 1 ? 'salesperson' : 'salespeople'}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={22} style={{ color: C.accent }} />
        <h1 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 24, fontWeight: 700, color: C.ink }}>
          Inquiry Owner Assignment
        </h1>
      </div>

      {isManager ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10 }}>
              {tabs.map((t) => (
                <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={tabBtnStyle(activeTab === t.key)}>
                  {t.label}
                  {t.count != null && <span style={countBadgeStyle}>{t.count}</span>}
                </button>
              ))}
            </div>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.inkSoft }}>{ownCountText}</span>
          </div>

          {activeTab === 'duplicates' && (
            <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: C.inkSoft }}>
                Same customer and same lane (POL, POD, mode, container or LCL), both open, created within 30 days
                of each other (proposal), whoever owns them. The status of both stays as it is until the Sales
                Manager closes one as a duplicate.
              </span>
              {dupLoading ? (
                <div style={{ padding: 16, color: C.inkFaint, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Loading…</div>
              ) : dupPairs.length === 0 ? (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: C.inkSoft }}>
                  No possible duplicates among open inquiries.
                </span>
              ) : dupPairs.map((p) => (
                <div key={`${p.keep_id}-${p.dup_id}`} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink }}>
                    {p.customer_name || '—'}, {p.pol || '—'} → {p.pod || '—'}
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: C.inkSoft }}>
                    {p.keep_no} (earlier). Owner: {p.keep_owner_name || 'Unassigned'}, created {fmtDate(p.keep_created_at)}.
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: C.inkSoft }}>
                    {p.dup_no}. Owner: {p.dup_owner_name || 'Unassigned'}, created {fmtDate(p.dup_created_at)}.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCloseDupTarget(p)}
                    style={{ height: 36, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, fontFamily: "'Montserrat', sans-serif", fontSize: 13, fontWeight: 600, color: C.ink, cursor: 'pointer' }}
                  >
                    Close {(p.dup_no || '').slice(-4)} as Duplicate of {(p.keep_no || '').slice(-4)}
                  </button>
                </div>
              ))}
            </section>
          )}

          {activeTab === 'unassigned' && (
            <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: UNASSIGNED_GRID, alignItems: 'center', minWidth: 1180, background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                  <div style={headCell}>Inquiry No</div>
                  <div style={headCell}>Customer</div>
                  <div style={headCell}>Service Type</div>
                  <div style={headCell}>Direction</div>
                  <div style={headCell}>Deadline Quote</div>
                  <div style={headCell}>Estimated Value</div>
                  <div style={headCell}>Created By</div>
                  <div style={headCell}>Created On</div>
                  <div style={headCell}>Assign to Sales</div>
                </div>
                {!loading && unassignedRows.length === 0 && (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkSoft, fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
                    Every inquiry has an owner.
                  </div>
                )}
                {!loading && unassignedRows.map((r) => {
                  const custName = r.prospect?.name || r.customer?.name || '—';
                  const svcLabel = serviceTypeOpts.find((o) => o.value === r.service_type)?.label || r.service_type || '—';
                  return (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: UNASSIGNED_GRID, alignItems: 'center', minWidth: 1180, borderBottom: `1px solid ${C.lineSoft}` }}>
                      <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{r.inquiry_no}</div>
                      <div style={{ ...cellBase, fontWeight: 500, color: C.ink }}>{custName}</div>
                      <div style={{ ...cellBase, color: C.ink }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          {svcLabel}
                          {(r.additional_services || []).includes('undername') && (
                            <span style={undernameBadgeStyle}><FileText size={11} />Undername</span>
                          )}
                        </span>
                      </div>
                      <div style={{ ...cellBase, color: C.inkSoft }}><DirectionCell direction={r.direction} /></div>
                      <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkSoft, whiteSpace: 'nowrap' }}>{fmtDate(r.deadline_quote)}</div>
                      <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.ink, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtRp(r.estimated_value)}</div>
                      <div style={{ ...cellBase, color: C.inkSoft }}>{r.created_by_profile?.full_name || '—'}</div>
                      <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkSoft, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</div>
                      <div style={{ ...cellBase, display: 'flex', gap: 6 }}>
                        <select
                          value={assignDraft[r.id] || ''}
                          disabled={savingRowId === r.id}
                          onChange={(e) => handleDraftChange(r.id, e.target.value)}
                          style={{ height: 32, flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 8px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.ink }}
                        >
                          <option value="">— Select owner —</option>
                          {roster.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={!assignDraft[r.id] || savingRowId === r.id}
                          onClick={() => handleAssign(r)}
                          style={{
                            height: 32, padding: '0 12px', borderRadius: 10, border: 'none', whiteSpace: 'nowrap',
                            background: assignDraft[r.id] ? C.accent : C.lineSoft,
                            color: assignDraft[r.id] ? '#fff' : C.inkFaint,
                            fontFamily: "'Montserrat', sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'workload' && (
            <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: WORKLOAD_GRID, alignItems: 'center', minWidth: 960, background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                  <div style={headCell}>Sales</div>
                  <div style={{ ...headCell, textAlign: 'right' }}>Open</div>
                  <div style={{ ...headCell, textAlign: 'right' }}>In Review</div>
                  <div style={{ ...headCell, textAlign: 'right' }}>Quoted</div>
                  <div style={{ ...headCell, textAlign: 'right' }}>Negotiation</div>
                  <div style={headCell}>Total Open Value</div>
                  <div style={headCell}>Overdue Deadlines</div>
                </div>
                {!loading && workloadRows.length === 0 && (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkSoft, fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
                    No salespeople in the operational roster for this entity.
                  </div>
                )}
                {!loading && workloadRows.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onViewSalesInquiries?.(w.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: WORKLOAD_GRID, alignItems: 'center', minWidth: 960, width: '100%',
                      border: 0, borderBottom: `1px solid ${C.lineSoft}`, background: 'transparent', cursor: 'pointer',
                      textAlign: 'left', color: C.ink, font: "400 13.5px 'Inter', sans-serif",
                    }}
                  >
                    <div style={cellBase}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <OwnerAvatar name={w.name} />
                        {w.name}
                      </span>
                    </div>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>{w.open}</div>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>{w.review}</div>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>{w.quoted}</div>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>{w.negotiation}</div>
                    <div style={{ ...cellBase, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", width: 110, flex: 'none', textAlign: 'right' }}>{fmtRp(w.openValue)}</span>
                      <span style={{ flex: 1, height: 8, borderRadius: 4, background: C.lineSoft, overflow: 'hidden', minWidth: 60 }}>
                        <span style={{ display: 'block', height: 8, width: `${w.pct}%`, background: C.inkFaint }} />
                      </span>
                    </div>
                    <div style={cellBase}>
                      {w.overdueCount > 0 ? (
                        <span style={countBadgeStyle}>{w.overdueCount} overdue</span>
                      ) : (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkFaint }}>0</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 15, fontWeight: 700, color: C.ink }}>Assigned to Me</h3>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.inkSoft }}>
              {rows.length} {rows.length === 1 ? 'inquiry' : 'inquiries'}
            </span>
          </div>
          <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: ME_GRID, alignItems: 'center', minWidth: 900, background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                <div style={headCell}>Inquiry No</div>
                <div style={headCell}>Customer</div>
                <div style={headCell}>Assigned By</div>
                <div style={headCell}>Assigned On</div>
                <div style={headCell}>Reason</div>
                <div style={headCell}>Status</div>
              </div>
              {!loading && rows.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkSoft, fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
                  No inquiries assigned to you yet.
                </div>
              )}
              {!loading && rows.map((r) => {
                const custName = r.prospect?.name || r.customer?.name || '—';
                const meta = STATUS_META[r.status] || STATUS_META.OPEN;
                const newDays = daysSinceAssignedWIB(r.assigned_at);
                const isNewAssign = newDays != null && newDays <= 3;
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: ME_GRID, alignItems: 'center', minWidth: 900, borderBottom: `1px solid ${C.lineSoft}` }}>
                    <div style={{ ...cellBase, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{r.inquiry_no}</span>
                      {isNewAssign && <span style={newAssignBadgeStyle}>New</span>}
                    </div>
                    <div style={{ ...cellBase, fontWeight: 500, color: C.ink }}>{custName}</div>
                    <div style={{ ...cellBase, color: C.inkSoft }}>{r.assigned_by_profile?.full_name || 'Not set'}</div>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkSoft, whiteSpace: 'nowrap' }}>{r.assigned_at ? fmtDate(r.assigned_at) : 'Not set'}</div>
                    <div style={{ ...cellBase, color: C.inkSoft }}>{r.assign_reason || 'Not set'}</div>
                    <div style={cellBase}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
                        border: `1px solid ${meta.bd}`, background: meta.bg, color: meta.color,
                        fontFamily: "'Montserrat', sans-serif", fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                      }}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {closeDupTarget && (
        <ConfirmModal
          open
          variant="warning"
          title="Close as Duplicate"
          message={`Close ${closeDupTarget.dup_no} as a duplicate of ${closeDupTarget.keep_no}? ${closeDupTarget.dup_no} will be marked Cancelled and linked to ${closeDupTarget.keep_no}.`}
          confirmLabel={closingDup ? 'Closing…' : 'Yes, Close as Duplicate'}
          cancelLabel="Cancel"
          onConfirm={handleCloseDup}
          onCancel={() => setCloseDupTarget(null)}
        />
      )}
    </div>
  );
}

const UNASSIGNED_GRID = '160px minmax(170px,1.3fr) 150px 110px 130px 140px minmax(130px,1fr) 120px 260px';
const WORKLOAD_GRID = 'minmax(180px,1.4fr) 80px 96px 80px 104px minmax(220px,1.6fr) 150px';
// L-13 (Putaran 8) -- 6 kolom persis mockup: Inquiry No/Customer/Assigned
// By/Assigned On/Reason/Status (Service Type/Direction DICABUT, tidak ada
// di mockup).
const ME_GRID = '160px minmax(170px,1.2fr) 150px 130px minmax(160px,1fr) 120px';
