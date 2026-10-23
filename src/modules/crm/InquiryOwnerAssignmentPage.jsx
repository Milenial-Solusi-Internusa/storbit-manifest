// src/modules/crm/InquiryOwnerAssignmentPage.jsx
// Putaran 3 Tahap 3B -- halaman BARU "Inquiry Owner Assignment" (menu 1.2.3,
// src/routes/menu-skeleton.js). Mockup acuan design-handoff/mockup/Inquiry
// Management.dc.html -- dibaca UTUH (baris 156-249 filter+bagian pOwner,
// 710 AV, 716 overdue, 827-830 wlRows/meList, 974-979 ownOpts/ownCount/
// wlRows/meRows, 1030 openReassign) sebelum ditulis. Tab "Possible
// duplicates" (baris 207/913-922) DITAMBAHKAN di commit berikutnya --
// di sini hanya Unassigned + Team Workload + Assigned to Me (Sales).
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
// ditunda berarti SELURUH halaman ini (termasuk tab Possible Duplicates
// yang menyusul) di-scope ke profile.company_id SAJA untuk SEMUA peran
// termasuk super_admin/isAllEntities -- roster (fetchOperationalRoster)
// dan RPC reassign_inquiry_owner/list_possible_duplicate_inquiry_pairs
// semuanya mengambil SATU company_id, jadi pandangan lintas-entitas sejati
// butuh perubahan terpisah di ketiganya (giliran berikutnya kalau
// diperlukan), bukan dibangun diam-diam di sini.
//
// Sales (non-manager) HANYA melihat "Assigned to Me" -- RLS inquiries_read
// sudah menyaring ke owner_id=auth.uid(), NOL filter owner tambahan di FE.
// Kolom mockup "Assigned By"/"Assigned On"/"Reason" (baris 232/236) TIDAK
// dibangun -- bukan keterbatasan scope, tapi ketidakcocokan ARSITEKTUR:
// satu-satunya sumber datanya (audit_logs, action REASSIGN_INQUIRY_OWNER)
// RLS-nya `read = is_admin_or_above()` (auditLogger.js header) -- Sales,
// satu-satunya penonton tab ini, TIDAK AKAN PERNAH bisa membacanya sendiri.
// Kolom yang dibangun: Inquiry No/Customer/Service Type/Direction/
// Status/Created On.
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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import { fetchOperationalRoster } from './salesRoster';
import { STATUS_LABEL } from './v3/tokens';
import { fmtRp } from './DealPanels';

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
        prospect:accounts!inquiries_prospect_id_fkey(name),
        customer:accounts!inquiries_customer_id_fkey(name),
        created_by_profile:profiles!inquiries_created_by_fkey(full_name)
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
 *   row click (mockup baris 829), navigasi ke Inquiry List terfilter owner
 *   itu + status Open. Deviasi sementara: tujuan AKHIR mockup adalah
 *   halaman 1.2.4 tersendiri yang belum dibangun -- lihat komentar
 *   InquiryListPage.jsx/crm.routes.jsx.
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
  const [activeTab, setActiveTab] = useState('unassigned'); // 'unassigned' | 'workload'
  const [assignDraft, setAssignDraft] = useState({});
  const [savingRowId, setSavingRowId] = useState(null);

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

  const tabs = isManager ? [
    { key: 'unassigned', label: 'Unassigned', count: unassignedRows.length },
    { key: 'workload', label: 'Team Workload' },
  ] : [];

  const ownCountText = activeTab === 'unassigned'
    ? `${unassignedRows.length} ${unassignedRows.length === 1 ? 'inquiry' : 'inquiries'} without an owner`
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
                      <div style={{ ...cellBase, color: C.ink }}>{svcLabel}</div>
                      <div style={{ ...cellBase, color: C.inkSoft }}>{r.direction || 'Not set'}</div>
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
                <div style={headCell}>Service Type</div>
                <div style={headCell}>Direction</div>
                <div style={headCell}>Created On</div>
                <div style={headCell}>Status</div>
              </div>
              {!loading && rows.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkSoft, fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
                  No inquiries assigned to you yet.
                </div>
              )}
              {!loading && rows.map((r) => {
                const custName = r.prospect?.name || r.customer?.name || '—';
                const svcLabel = serviceTypeOpts.find((o) => o.value === r.service_type)?.label || r.service_type || '—';
                const meta = STATUS_META[r.status] || STATUS_META.OPEN;
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: ME_GRID, alignItems: 'center', minWidth: 900, borderBottom: `1px solid ${C.lineSoft}` }}>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{r.inquiry_no}</div>
                    <div style={{ ...cellBase, fontWeight: 500, color: C.ink }}>{custName}</div>
                    <div style={{ ...cellBase, color: C.ink }}>{svcLabel}</div>
                    <div style={{ ...cellBase, color: C.inkSoft }}>{r.direction || 'Not set'}</div>
                    <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkSoft, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</div>
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
    </div>
  );
}

const UNASSIGNED_GRID = '160px minmax(170px,1.3fr) 150px 110px 130px 140px minmax(130px,1fr) 120px 260px';
const WORKLOAD_GRID = 'minmax(180px,1.4fr) 80px 96px 80px 104px minmax(220px,1.6fr) 150px';
const ME_GRID = '160px minmax(180px,1.4fr) 160px 120px 130px 130px';
