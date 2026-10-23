// src/modules/crm/InquiryClassificationPage.jsx
// Putaran 3 Tahap 3A, Lingkup B -- halaman BARU "Inquiry Classification"
// (menu 1.2.2, src/routes/menu-skeleton.js). Mockup acuan
// design-handoff/mockup/Inquiry Management.dc.html baris 183-204 (Classification
// Matrix), 815-819 (penghitungan matrix/filter dasar), 969 (ncTitle/ncCount/
// handler bulk) -- dibaca utuh sebelum ditulis.
//
// Brand: navy/orange/cream (C di bawah, SAMA PERSIS palet InquiryListPage.jsx
// di folder ini) -- BUKAN sage, walau warna literal mockup ini kebetulan sage.
// CRM/Inquiry belum pada giliran migrasi kit ("kit ada != boleh diimpor di
// luar giliran Batch DS", kebijakan CLAUDE.md) -- semantik mockup (bg warn
// kuning utk "Not set", badge status tinted, dst) dipetakan ke token C
// terdekat, bukan hex mockup disalin literal. Pola yang sama sudah dipakai
// Part A InquiryListPage.jsx (badge "Not recorded" baris Route).
//
// Scope sengaja DIPERSEMPIT dari mockup penuh (instruksi eksplisit Putaran 3
// Tahap 3A -- "JANGAN query locations tambahan", tiga filter dropdown mockup
// baris 175-182 di LUAR rentang baris yang dirujuk tugas): TANPA filter
// Created Date/Entity/Owner -- base data = seluruh inquiry ber-company_id
// milik user, nol tanggal/entitas/owner dipersempit lagi di FE. TANPA Owner
// Assignment / Possible Duplicates (bagian LAIN mockup ini, giliran Tahap 3B).
//
// Dua sumbu izin yang TIDAK saling menggantikan:
//   - MENU: hasMenuPermission('crm_inquiry_classification', 'view') --
//     migrasi 20261024000003 menyalin SELURUH (role, action) milik
//     crm_inquiry, jadi siapa pun yang boleh membuka Inquiry List juga boleh
//     membuka halaman ini (termasuk Sales).
//   - EDIT per baris: status OPEN/IN_REVIEW/QUOTED/NEGOTIATION + RLS
//     inquiries_update (owner_id = auth.uid() ATAU manager-ke-atas di
//     company_id baris itu). Status terminal (WON/LOST/CANCELLED) baca-saja
//     di SELURUH kontrol (checkbox, dropdown inline, bulk) -- gate FE,
//     BUKAN gate DB baru; RLS inquiries_update sendiri TIDAK membedakan
//     status (siapa pun owner/manager yang lolos company+owner secara teori
//     masih bisa UPDATE baris WON lewat PostgREST langsung) -- gate status
//     terminal murni dikerjakan di sini, konsisten dgn cara "Edit Inquiry"
//     lama di DealDetailPage.jsx menyembunyikan tombol pada status terminal.
//
// Sales TIDAK difilter ke ownernya sendiri lewat kode FE apa pun di sini --
// RLS inquiries_read sudah menyaring (non-manager -> owner_id = auth.uid()),
// jadi `rows` yang diterima effect fetch SUDAH tepat populasi sales itu.
//
// Pola query: SATU select ke `inquiries` dgn embed ke `accounts` (BUKAN
// inquiries->inquiries, yang terbukti memutus seluruh baris -- lihat
// InquiryListPage.jsx) + pola dua-langkah utk nama owner (embed
// inquiries.owner_id->profiles juga terbukti ditolak PostgREST,
// PipelineKanbanPage.jsx:111-121).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole } from '../../lib/roles';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
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

// Cermin persis STATUS_META InquiryListPage.jsx (7 status, label dari
// STATUS_LABEL supaya kedua peta tidak melenceng) -- disalin, bukan
// diimpor, karena file itu bukan modul "shared tokens" (pola yang sama
// dipakai QuotationListPage.jsx/QuotationDetailPage.jsx: tiap halaman
// daftar punya STATUS_META lokalnya sendiri).
const STATUS_META = {
  OPEN:        { label: STATUS_LABEL.OPEN,        bg: '#E4EEF7', color: '#1D5A96', bd: '#BCD0E4' },
  IN_REVIEW:   { label: STATUS_LABEL.IN_REVIEW,   bg: '#FBF0DD', color: '#916312', bd: '#E6D4B4' },
  QUOTED:      { label: STATUS_LABEL.QUOTED,      bg: '#EEEAF6', color: '#5B4A96', bd: '#D1CAE3' },
  NEGOTIATION: { label: STATUS_LABEL.NEGOTIATION, bg: '#FDE7DB', color: '#B53F0D', bd: '#EFC5B2' },
  WON:         { label: STATUS_LABEL.WON,         bg: '#E1E9F2', color: '#144682', bd: '#B8C8DC' },
  LOST:        { label: STATUS_LABEL.LOST,        bg: '#FBE7E5', color: '#B33A2E', bd: '#EDC4C0' },
  CANCELLED:   { label: STATUS_LABEL.CANCELLED,   bg: '#EDEBE7', color: '#6B6459', bd: '#D3D0CB' },
};

// `service_type` DINAMIS dari dropdown_options (Admin Settings -> General
// Preferences -> Dropdown Management), BUKAN tiga/empat kolom tetap --
// instruksi eksplisit tugas. Fallback = 4 nilai yang hidup di produksi
// hari ini (koreksi review Vir, Putaran 3 Tahap 3A: production punya 8
// inquiry ber-service_type='trucking' -- klaim "belum pernah dipakai"
// yang sebelumnya tertulis di sini SALAH, sudah dibuang). Fallback hanya
// menyala saat dropdown_options kosong/gagal -- 'warehousing' SENGAJA
// TIDAK ditambahkan (bukan nilai yang diminta/dikonfirmasi dipakai).
const SERVICE_TYPES_FALLBACK = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs',            label: 'Customs Clearance' },
  { value: 'trading',            label: 'General Trading' },
  { value: 'trucking',           label: 'Trucking' },
];

const DIRECTION_ROWS = ['Import', 'Export', 'Domestic', 'Not set'];
// Opsi yang BISA dipilih lewat dropdown edit (inline atau bulk) -- 'Not set'
// bukan string tersimpan, ia direpresentasikan NULL (lihat migrasi
// 20261024000001), makanya given SEBAGAI pilihan dropdown tapi diterjemahkan
// ke `null` sebelum dikirim ke Supabase.
const DIRECTION_EDIT_OPTIONS = ['Not set', 'Import', 'Export', 'Domestic'];
const EDITABLE_STATUSES = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];
const TOTAL_COL = '__total__';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const cellBase = { padding: '10px 12px', minWidth: 0 };
const headCell = {
  ...cellBase, fontFamily: "'Montserrat', sans-serif", fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.04em', color: C.inkSoft, whiteSpace: 'nowrap',
};

/**
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function InquiryClassificationPage({ showToast }) {
  const { profile, erpRoles, erpRole, user } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);

  const { options: serviceTypeOptsRaw } = useDropdownOptions('service_type', SERVICE_TYPES_FALLBACK);
  const serviceTypeOpts = useMemo(
    () => serviceTypeOptsRaw.map((o) => ({ value: o.value, label: o.label })),
    [serviceTypeOptsRaw]
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ownerNames, setOwnerNames] = useState({});
  const [selectedCell, setSelectedCell] = useState({ dir: 'Not set', svc: TOTAL_COL });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // bulkField: null | 'direction' | 'service' -- modal bulk sedang terbuka.
  const [bulkField, setBulkField] = useState(null);
  const [bulkValue, setBulkValue] = useState('');
  const [savingBulk, setSavingBulk] = useState(false);
  const [savingRowId, setSavingRowId] = useState(null);

  const fetchRows = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      // Perbaikan review Vir, Putaran 3 Tahap 3A: production sudah 947
      // inquiry -- .limit(1000) TUNGGAL memotong Matrix diam-diam begitu
      // lewat ambang itu (nol error, cuma sebagian data). Diganti loop
      // .range() berhalaman sampai halaman terakhir < PAGE_SIZE baris.
      // Order WAJIB deterministik lintas halaman (created_at desc + id
      // sbg tiebreak) -- tanpa tiebreak, paginasi offset bisa melewatkan
      // atau menduplikasi baris saat banyak created_at persis sama.
      const PAGE_SIZE = 1000;
      let list = [];
      let from = 0;
      let more = true;
      while (more) {
        let query = supabase
          .from('inquiries')
          .select(`
            id, inquiry_no, service_type, direction, status, estimated_value, created_at, owner_id,
            prospect:accounts!inquiries_prospect_id_fkey(name),
            customer:accounts!inquiries_customer_id_fkey(name)
          `)
          .is('deleted_at', null);
        if (!isAllEntities) query = query.eq('company_id', profile.company_id);
        query = query
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) throw error;
        const page = data || [];
        list = list.concat(page);
        more = page.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      setRows(list);

      // Pola dua-langkah nama owner (lihat header file) -- diambil per
      // potongan 200 id (bukan satu .in() raksasa), karena daftar owner_id
      // kini bisa jauh melewati 1000 baris sejak paginasi di atas.
      const ownerIds = [...new Set(list.map((r) => r.owner_id).filter(Boolean))];
      const map = {};
      for (let i = 0; i < ownerIds.length; i += 200) {
        const chunk = ownerIds.slice(i, i + 200);
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', chunk);
        (profs || []).forEach((p) => { map[p.id] = p.full_name; });
      }
      setOwnerNames(map);
    } catch (err) {
      showToast?.('Failed to load inquiries: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, isAllEntities, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Kolom Matrix = seluruh service type dinamis + satu kolom Total sintetis.
  const matrixCols = useMemo(
    () => [...serviceTypeOpts, { value: TOTAL_COL, label: 'Total' }],
    [serviceTypeOpts]
  );

  const inCell = useCallback((row, dir, svc) =>
    (dir === 'Not set' ? !row.direction : row.direction === dir) &&
    (svc === TOTAL_COL || row.service_type === svc),
  []);

  const matrix = useMemo(() => DIRECTION_ROWS.map((dir) => ({
    dir,
    cells: matrixCols.map((col) => {
      const matched = rows.filter((r) => inCell(r, dir, col.value));
      return {
        dir, svc: col.value,
        count: matched.length,
        sum: matched.reduce((a, r) => a + (Number(r.estimated_value) || 0), 0),
      };
    }),
  })), [rows, matrixCols, inCell]);

  const tableRows = useMemo(
    () => rows.filter((r) => inCell(r, selectedCell.dir, selectedCell.svc)),
    [rows, selectedCell, inCell]
  );

  const tableTitle = selectedCell.dir === 'Not set' && selectedCell.svc === TOTAL_COL
    ? 'Needs Classification'
    : `${selectedCell.dir}, ${selectedCell.svc === TOTAL_COL
        ? 'all service types'
        : (serviceTypeOpts.find((o) => o.value === selectedCell.svc)?.label || selectedCell.svc)}`;

  function selectCell(dir, svc) {
    setSelectedCell({ dir, svc });
    setSelectedIds(new Set());
  }

  // HANYA baris berstatus editable yang pernah masuk `selectedIds` --
  // checkbox baris terminal tidak dirender sebagai kontrol interaktif sama
  // sekali (lihat render Table di bawah), jadi set ini otomatis bersih.
  const editableTableRows = useMemo(
    () => tableRows.filter((r) => EDITABLE_STATUSES.includes(r.status)),
    [tableRows]
  );
  const allEditableSelected = editableTableRows.length > 0 &&
    editableTableRows.every((r) => selectedIds.has(r.id));

  function toggleRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds(allEditableSelected ? new Set() : new Set(editableTableRows.map((r) => r.id)));
  }

  const actor = { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id };

  // Dropdown Direction INLINE per baris -- pola RLS-silent-fail PERSIS
  // saveInquirySection (DealDetailPage.jsx, "pola yang sudah dipakai di
  // Detail" per instruksi tugas): UPDATE biasa + .select('id') + cek
  // data.length===0 (RLS bisa menyaring baris jadi 0 TANPA Postgres
  // mengembalikan error, TD-161) SEBELUM logAudit.
  async function updateOneDirection(row, nextLabel) {
    const nextValue = nextLabel === 'Not set' ? null : nextLabel;
    if (nextValue === row.direction) return;
    setSavingRowId(row.id);
    const { data, error } = await supabase
      .from('inquiries').update({ direction: nextValue }).eq('id', row.id).select('id');
    setSavingRowId(null);
    if (error) { showToast?.('Failed to save: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) {
      showToast?.('Failed to save: you do not have permission to modify this inquiry.', 'error');
      return;
    }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY_CLASSIFICATION,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: row.id,
      entityLabel: row.inquiry_no,
      notes: `Direction: ${row.direction || 'Not set'} → ${nextValue || 'Not set'}`,
    }, actor);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, direction: nextValue } : r)));
    showToast?.(`${row.inquiry_no} set to ${nextValue || 'Not set'}`, 'success');
  }

  // Satu jalur Apply dipakai KEDUA bulk action (Direction & Service Type) --
  // "Bulk Set Service Type minta konfirmasi dengan jumlah baris" (instruksi
  // eksplisit tugas) dipenuhi lewat pesan count di bawah tombol Apply, yang
  // harus diklik lagi sebagai langkah terpisah (confirmStep) SEBELUM UPDATE
  // benar-benar jalan -- Direction tidak diwajibkan tugas, tapi diberi
  // langkah yang sama supaya dua tombol bulk tidak berperilaku dua rupa.
  // Direset eksplisit di openBulk/closeBulk (BUKAN effect terpisah yang
  // mengikuti bulkField/bulkValue) -- begitu confirmStep true, `<select>`
  // pemicu perubahan bulkValue sudah tak dirender (BulkFieldModal mengganti
  // seluruh isinya jadi ConfirmModal), jadi nol jalur lain yang bisa
  // mengubah bulkValue sementara confirmStep masih true.
  const [confirmStep, setConfirmStep] = useState(false);

  function openBulk(field) {
    setBulkField(field);
    setBulkValue('');
    setConfirmStep(false);
  }
  function closeBulk() {
    setBulkField(null);
    setBulkValue('');
    setConfirmStep(false);
  }

  // BUG review Vir, Putaran 3 Tahap 3A: versi lama membaca state `bulkValue`
  // dari DALAM applyBulk() setelah onConfirm memanggil setBulkValue(chosen)
  // lalu applyBulk() pada render yang sama -- applyBulk membaca `bulkValue`
  // yang LAMA (closure sebelum render berikutnya), bukan `chosen`. Untuk
  // Service Type, nilai lama itu adalah LABEL ("Freight Forwarding"), bukan
  // kode (`freight_forwarding`) -- service_type tak punya CHECK, jadi DB
  // menerimanya diam-diam dan baris itu keluar dari Matrix/dropdown Detail.
  // Perbaikan: `applyBulk` MENERIMA nilai sebagai ARGUMEN (tidak membaca
  // state `bulkValue`), DAN dropdown bulk Service Type (BulkFieldModal di
  // bawah) kini mengirim VALUE langsung lewat pasangan {value,label}, BUKAN
  // label -- translasi label->value yang rawan itu dihapus total, bukan
  // ditambal. Validasi sisa (defensif, bukan jalur utama): `valueToApply`
  // tetap dicocokkan ulang ke `serviceTypeOpts` SAAT INI sebelum ditulis --
  // opsi dropdown_options bisa berubah (Admin Settings) di antara modal
  // dibuka dan Apply diklik; kalau tak ketemu, BATALKAN + toast, nol tulis.
  async function applyBulk(valueToApply) {
    if (!valueToApply) return;
    const ids = editableTableRows.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    if (!ids.length) { closeBulk(); return; }

    let patch;
    let auditLabel; // catatan audit tetap pakai LABEL yang mudah dibaca.
    if (bulkField === 'direction') {
      patch = { direction: valueToApply === 'Not set' ? null : valueToApply };
      auditLabel = valueToApply;
    } else {
      const match = serviceTypeOpts.find((o) => o.value === valueToApply);
      if (!match) {
        showToast?.('Failed to save: unknown service type, nothing was changed.', 'error');
        closeBulk();
        return;
      }
      patch = { service_type: match.value };
      auditLabel = match.label;
    }

    setSavingBulk(true);
    const { data, error } = await supabase.from('inquiries').update(patch).in('id', ids).select('id');
    setSavingBulk(false);
    if (error) { showToast?.('Failed to save: ' + error.message, 'error'); return; }
    const updatedIds = (data || []).map((d) => d.id);
    if (updatedIds.length === 0) {
      showToast?.('Failed to save: you do not have permission to modify these inquiries.', 'error');
      return;
    }
    const fieldLabel = bulkField === 'direction' ? 'Direction' : 'Service Type';
    // Fire-and-forget per baris (logAudit tak pernah throw) -- SATU entri
    // audit PER inquiry yang BENAR-BENAR tersentuh (updatedIds, bukan ids
    // yang diminta), konsisten dengan seluruh entri INQUIRY lain di
    // audit_logs yang selalu entity_id = satu inquiry, bukan gabungan id.
    updatedIds.forEach((id) => {
      const row = rows.find((r) => r.id === id);
      logAudit(supabase, {
        action: ACTION_TYPES.UPDATE_INQUIRY_CLASSIFICATION,
        entityType: ENTITY_TYPES.INQUIRY,
        entityId: id,
        entityLabel: row?.inquiry_no || id,
        notes: `Bulk ${fieldLabel} → ${auditLabel}`,
      }, actor);
    });
    if (updatedIds.length < ids.length) {
      showToast?.(`Updated ${updatedIds.length} of ${ids.length} inquiries — some rows could not be modified.`, 'error');
    } else {
      showToast?.(`Updated ${fieldLabel} for ${updatedIds.length} inquiries.`, 'success');
    }
    closeBulk();
    setSelectedIds(new Set());
    fetchRows();
  }

  const selCount = selectedIds.size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClipboardCheck size={22} style={{ color: C.accent }} />
        <h1 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 24, fontWeight: 700, color: C.ink }}>
          Inquiry Classification
        </h1>
      </div>
      <p style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: C.inkSoft, maxWidth: 820 }}>
        Click a cell in the matrix below to see which inquiries fall into it, then set Direction and
        Service Type inline or in bulk. Only inquiries in Open, In Review, Quoted, or Negotiation can
        be changed — closed inquiries (Won, Lost, Cancelled) are shown read-only.
      </p>

      {/* ── Classification Matrix ── */}
      <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 15, fontWeight: 700, color: C.ink }}>
          Classification Matrix
        </h3>
        {loading ? (
          <div style={{ padding: 16, color: C.inkFaint, fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 140 + matrixCols.length * 150, display: 'grid', gridTemplateColumns: `140px repeat(${matrixCols.length}, minmax(140px,1fr))`, gap: 8 }}>
              <div />
              {matrixCols.map((col) => (
                <div key={col.value} style={headCell}>{col.label}</div>
              ))}
              {matrix.map((row) => (
                <MatrixRow key={row.dir} row={row} selectedCell={selectedCell} onSelectCell={selectCell} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Bulk action bar ── */}
      {selCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px', background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 14, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13.5, fontWeight: 700, color: C.ink, marginRight: 8 }}>
            {selCount} selected
          </span>
          <button type="button" onClick={() => openBulk('direction')} style={bulkBtnStyle}>Set Direction</button>
          <button type="button" onClick={() => openBulk('service')} style={bulkBtnStyle}>Set Service Type</button>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setSelectedIds(new Set())} style={{ ...bulkBtnStyle, border: '1px solid transparent', color: C.inkSoft }}>
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table (drill-down hasil klik Matrix) ── */}
      <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.lineSoft}` }}>
          <h3 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 15, fontWeight: 700, color: C.ink, flex: 1 }}>
            {tableTitle}
          </h3>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.inkSoft }}>{tableRows.length} inquiries</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: TABLE_GRID, alignItems: 'center', minWidth: 1080, background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
            <div style={cellBase}>
              <input
                type="checkbox"
                checked={allEditableSelected}
                disabled={editableTableRows.length === 0}
                onChange={toggleAll}
                style={{ width: 16, height: 16 }}
              />
            </div>
            <div style={headCell}>Inquiry No</div>
            <div style={headCell}>Customer</div>
            <div style={headCell}>Service Type</div>
            <div style={headCell}>Direction</div>
            <div style={headCell}>Owner</div>
            <div style={headCell}>Created On</div>
            <div style={headCell}>Status</div>
          </div>
          {!loading && tableRows.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkSoft, fontFamily: "'Inter', sans-serif", fontSize: 13.5 }}>
              No inquiries in this cell.
            </div>
          )}
          {!loading && tableRows.map((r) => {
            const editable = EDITABLE_STATUSES.includes(r.status);
            const meta = STATUS_META[r.status] || STATUS_META.OPEN;
            const custName = r.prospect?.name || r.customer?.name || '—';
            const svcLabel = serviceTypeOpts.find((o) => o.value === r.service_type)?.label || r.service_type || '—';
            return (
              <div
                key={r.id}
                style={{
                  display: 'grid', gridTemplateColumns: TABLE_GRID, alignItems: 'center', minWidth: 1080,
                  borderBottom: `1px solid ${C.lineSoft}`,
                  background: selectedIds.has(r.id) ? '#EFE6D2' : 'transparent',
                }}
              >
                <div style={cellBase}>
                  {editable ? (
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleRow(r.id)} style={{ width: 16, height: 16 }} />
                  ) : null}
                </div>
                <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>
                  {r.inquiry_no}
                </div>
                <div style={{ ...cellBase, fontWeight: 500, color: C.ink }}>{custName}</div>
                <div style={{ ...cellBase, color: C.ink }}>{svcLabel}</div>
                <div style={{ ...cellBase, padding: '8px 12px' }}>
                  {editable ? (
                    <select
                      value={r.direction || 'Not set'}
                      disabled={savingRowId === r.id}
                      onChange={(e) => updateOneDirection(r, e.target.value)}
                      style={{
                        height: 32, width: '100%', border: `1px solid ${C.line}`, borderRadius: 10,
                        background: r.direction ? C.surface : C.warnBg, padding: '0 8px',
                        fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.ink, outline: 'none',
                      }}
                    >
                      {DIRECTION_EDIT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.inkSoft }}>{r.direction || 'Not set'}</span>
                  )}
                </div>
                <div style={{ ...cellBase, color: C.inkSoft }}>
                  {r.owner_id ? (ownerNames[r.owner_id] || '(unnamed)') : <span style={{ color: C.inkFaint }}>Unassigned</span>}
                </div>
                <div style={{ ...cellBase, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkSoft }}>
                  {fmtDate(r.created_at)}
                </div>
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

      {/* ── Modal bulk Set Direction / Set Service Type ── */}
      {bulkField && (
        <BulkFieldModal
          field={bulkField}
          value={bulkValue}
          onChangeValue={setBulkValue}
          count={editableTableRows.filter((r) => selectedIds.has(r.id)).length}
          options={bulkField === 'direction'
            ? DIRECTION_EDIT_OPTIONS.map((d) => ({ value: d, label: d }))
            : serviceTypeOpts}
          saving={savingBulk}
          confirmStep={confirmStep}
          onRequestConfirm={() => setConfirmStep(true)}
          onConfirm={() => applyBulk(bulkValue)}
          onCancel={closeBulk}
        />
      )}
    </div>
  );
}

const TABLE_GRID = '40px 160px minmax(180px,1.4fr) 170px 150px minmax(150px,1fr) 112px 120px';
const bulkBtnStyle = {
  height: 32, padding: '0 12px', borderRadius: 10, background: 'transparent',
  border: `1px solid ${C.inkFaint}`, color: C.ink, fontFamily: "'Montserrat', sans-serif",
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

function MatrixRow({ row, selectedCell, onSelectCell }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, background: row.dir === 'Not set' ? C.warnBg : C.surface2, fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 13, color: C.ink }}>
        {row.dir}
      </div>
      {row.cells.map((c) => (
        <MatrixCell
          key={c.svc}
          cellData={c}
          active={selectedCell.dir === c.dir && selectedCell.svc === c.svc}
          onSelectCell={onSelectCell}
        />
      ))}
    </>
  );
}

function MatrixCell({ cellData, active, onSelectCell }) {
  return (
    <button
      type="button"
      onClick={() => onSelectCell(cellData.dir, cellData.svc)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
        padding: '12px 16px', borderRadius: 10,
        border: `${active ? 2 : 1}px solid ${active ? C.ink : C.lineSoft}`,
        background: cellData.dir === 'Not set' ? C.warnBg : C.surface,
        cursor: 'pointer', textAlign: 'left', color: C.ink,
      }}
    >
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 600 }}>{cellData.count}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.inkSoft, whiteSpace: 'nowrap' }}>{fmtRp(cellData.sum)}</span>
    </button>
  );
}

// `options` SELALU array {value,label} (uniform utk Direction & Service
// Type sejak perbaikan review Vir) -- `value` adalah state `bulkValue`
// yang mengalir langsung ke applyBulk(bulkValue), nol translasi balik
// berdasarkan label yang jadi akar bug lama. Label dipakai HANYA untuk
// ditampilkan (teks <option>, pesan konfirmasi) via lookup `value`.
function BulkFieldModal({ field, value, onChangeValue, count, options, saving, confirmStep, onRequestConfirm, onConfirm, onCancel }) {
  const title = field === 'direction' ? 'Set Direction' : 'Set Service Type';
  const selectedLabel = options.find((o) => o.value === value)?.label || value;
  if (confirmStep) {
    return (
      <ConfirmModal
        open
        variant="warning"
        title={title}
        message={`This will update ${field === 'direction' ? 'Direction' : 'Service Type'} to "${selectedLabel}" for ${count} ${count === 1 ? 'inquiry' : 'inquiries'}. Continue?`}
        confirmLabel={saving ? 'Saving…' : 'Yes, Apply'}
        cancelLabel="Back"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 16, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</h3>
        <p style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontSize: 13, color: C.inkSoft }}>
          Applies to {count} selected {count === 1 ? 'inquiry' : 'inquiries'}.
        </p>
        <select
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          style={{ height: 40, border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 10px', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: C.ink }}
        >
          <option value="">— Select —</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...bulkBtnStyle, border: '1px solid transparent' }}>Cancel</button>
          <button
            type="button"
            disabled={!value}
            onClick={onRequestConfirm}
            style={{ ...bulkBtnStyle, background: value ? C.accent : C.lineSoft, color: value ? '#fff' : C.inkFaint, border: 'none' }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
