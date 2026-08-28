// src/modules/crm/PipelineKanbanPage.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Papan Pipeline — CRM v3 Batch Pipeline (B3), TASK 3. DITULIS ULANG TOTAL.
//
// PERUBAHAN INTI vs versi sebelumnya:
//   sumber data  accounts / pipeline_stage  ->  inquiries / status
//   satuan kartu 1 akun                     ->  1 INQUIRY
//   interaksi    drag & drop menulis DB     ->  READ-ONLY, klik untuk membuka
//
// KENAPA 1 KARTU = 1 INQUIRY (prinsip P4):
//   Akun dengan 3 inquiry aktif tampil sebagai 3 kartu terpisah. Sumbu deal
//   melekat pada DOKUMEN-nya, bukan pada akun — akun bisa punya beberapa deal
//   berjalan sekaligus di tahap berbeda, dan memaksanya jadi satu kartu berarti
//   memilih salah satu status untuk mewakili semuanya (selalu salah untuk
//   sisanya). Nol komponen di file ini membaca accounts.lifecycle_stage.
//
// KENAPA READ-ONLY (keputusan Den, batch B3):
//   inquiries.status digerakkan TIGA trigger DB yang sudah live —
//   trg_inquiry_review (PRF submit -> IN_REVIEW), trg_inquiry_quoted
//   (quotation SENT -> QUOTED), trg_inquiry_won (SO SENT -> WON). Drag manual
//   antar lajur akan menulis status yang tak punya dokumen pendukungnya, lalu
//   ditimpa lagi oleh trigger saat dokumennya benar-benar terbit. Papan ini
//   MENAMPILKAN kebenaran yang sudah ditegakkan di DB; ia tidak ikut
//   mengarangnya. Perpindahan manual yang sah hanya lewat tombol di Detail
//   Deal (Tandai Kalah / Batalkan / Mulai Negosiasi).
//   Efek samping yang disengaja: applyStageMove lama — beserta bug
//   silent-0-row-nya (TD-172, UPDATE tanpa .select()) — tidak ikut terbawa.
//
// LAJUR TERTUTUP:
//   WON / LOST / CANCELLED memakai varian `closed` primitif ListView (v3),
//   difilter periode `closed_at`. Default bulan berjalan. Tanpa filter itu,
//   ketiga lajur menampung SELURUH riwayat dan langsung mendominasi papan.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ListView from './v3/ListView';
import { Badge, OutlineBtn } from './v3/kit';
import {
  INK, INK_SOFT, FAINT, LINE, SURFACE, FONT_HEAD, FONT_BODY, FONT_MONO,
  SP, RADIUS,
} from './v3/tokens';

/* ─── Lajur ────────────────────────────────────────────────────────────────
   id = nilai inquiries.status apa adanya. Tone lajur — badge di kartu dan rel
   tertutup — TETAP diserahkan ke STAGE_TONE (v3/tokens.js) lewat `tone: id`.

   `step` = palet SATU segmen bar chevron papan, dan sengaja tinggal DI SINI,
   bukan di tokens.js. Pastel gradasi ini kekhususan papan Pipeline (pengecualian
   brand yang disetujui khusus untuk stepper), bukan sumbu warna v3 yang empat
   tone itu; menaruhnya di tokens.js sama dengan menawarkannya ke seluruh modul
   v3 sebagai kosakata resmi — justru yang tidak diinginkan. ListView hanya
   membacanya saat `groupedBoard` menyala, dan tanpa `step` ia jatuh balik ke
   STAGE_TONE, jadi primitifnya tetap tak mengenal kosakata papan ini. */
const OPEN_LANES = [
  { id: 'OPEN',        label: 'Open',
    step: { bg: 'linear-gradient(135deg, #DCD2F7, #B9A3EA)', fg: '#4C3D73', sub: 'rgba(76,61,115,0.65)' } },
  { id: 'IN_REVIEW',   label: 'In Review',
    step: { bg: 'linear-gradient(135deg, #C6A6E4, #E4AECB)', fg: '#5C3653', sub: 'rgba(92,54,83,0.65)' } },
  { id: 'QUOTED',      label: 'Quoted',
    step: { bg: 'linear-gradient(135deg, #F0B7CB, #F5C79A)', fg: '#7A4A38', sub: 'rgba(122,74,56,0.65)' } },
  // NEGOTIATION sampai batch ini nol penulis di seluruh repo; jalur tulisnya
  // lahir bersamaan di TASK 4 (tombol "Mulai Negosiasi", gate QUOTED).
  { id: 'NEGOTIATION', label: 'Negotiation',
    step: { bg: 'linear-gradient(135deg, #F6CE9C, #F6E08C)', fg: '#7A5A22', sub: 'rgba(122,90,34,0.65)' } },
];
const CLOSED_LANES = [
  { id: 'WON',       label: 'Won' },
  { id: 'LOST',      label: 'Lost' },
  { id: 'CANCELLED', label: 'Cancelled' },
];
const CLOSED_IDS = CLOSED_LANES.map((l) => l.id);

const SERVICE_LABEL = {
  freight_forwarding: 'Freight Forwarding',
  customs: 'Customs',
  trading: 'Trading',
};

const rp = (n) => (n === null || n === undefined || n === '')
  ? null
  : 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};
const monthRange = (key) => {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);          // eksklusif
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};

/* Kolom yang dibaca papan. Di module scope, BUKAN di dalam komponen: kalau
   didefinisikan per-render ia jadi dependency baru tiap render dan merusak
   memoisasi fetchBoard (react-hooks/preserve-manual-memoization). */
const BOARD_SELECT = `
  id, inquiry_no, status, service_type, route, estimated_value,
  created_at, closed_at,
  prospect:accounts!inquiries_prospect_id_fkey(name),
  customer:accounts!inquiries_customer_id_fkey(name)
`;

/* ─── Kartu ────────────────────────────────────────────────────────────── */
function DealCard({ inq, onOpen }) {
  const akun = inq.customer?.name || inq.prospect?.name || '—';
  const nilai = rp(inq.estimated_value);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(inq)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: SP.s3, borderRadius: RADIUS.md,
        border: `1px solid ${LINE}`, background: SURFACE,
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F7F8FA'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = SURFACE; }}
    >
      <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: FAINT }}>
        {inq.inquiry_no || '—'}
      </span>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.3 }}>
        {akun}
      </span>
      <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: INK_SOFT }}>
        {SERVICE_LABEL[inq.service_type] || inq.service_type || '—'}
        {inq.route ? ` · ${inq.route}` : ''}
      </span>
      {nilai && (
        <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: INK, marginTop: 2 }}>
          {nilai}
        </span>
      )}
      {/* Badge dibaca LANGSUNG dari inquiries.status milik kartu ini sendiri —
          bukan diwariskan dari akun (prinsip P4). */}
      <span style={{ marginTop: SP.s1 }}>
        <Badge tone={inq.status}>{inq.status}</Badge>
      </span>
    </button>
  );
}

export default function PipelineKanbanPage({ showToast, onSelectInquiry }) {
  const { profile, erpRole } = useAuth();

  // Scope role — cermin pola InquiryListPage (bukan pola accounts yang lama).
  // RLS inquiries_* tetap penegak sebenarnya; ini hanya mempersempit query.
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);

  const [openRows,   setOpenRows]   = useState([]);
  const [closedRows, setClosedRows] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [month,      setMonth]      = useState(() => monthKey(new Date()));

  const fetchBoard = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { startIso, endIso } = monthRange(month);

    // Scope di-inline (bukan useCallback terpisah): builder PostgREST itu
    // mutable, jadi useCallback bersarang yang mengembalikan query termutasi
    // tak bisa dipertahankan memoisasinya oleh React Compiler.
    const applyScope = (q) => {
      let query = q;
      if (!isAllEntities && profile?.company_id) query = query.eq('company_id', profile.company_id);
      if (isSalesOnly && profile?.id)            query = query.eq('created_by', profile.id);
      return query;
    };

    // Dua query terpisah, bukan satu: lajur terbuka tak punya batas periode,
    // lajur tertutup dibatasi closed_at bulan terpilih. Menggabungkannya
    // memaksa salah satunya memakai filter yang bukan miliknya.
    const [openRes, closedRes] = await Promise.all([
      applyScope(
        supabase.from('inquiries').select(BOARD_SELECT)
          .is('deleted_at', null)
          .in('status', OPEN_LANES.map((l) => l.id)),
      ).order('created_at', { ascending: false }).limit(1000),
      applyScope(
        supabase.from('inquiries').select(BOARD_SELECT)
          .is('deleted_at', null)
          .in('status', CLOSED_IDS)
          .gte('closed_at', startIso)
          .lt('closed_at', endIso),
      ).order('closed_at', { ascending: false }).limit(1000),
    ]);

    if (openRes.error) {
      showToast?.('Gagal memuat pipeline: ' + openRes.error.message, 'error');
      setOpenRows([]);
    } else {
      setOpenRows(openRes.data || []);
    }
    if (closedRes.error) {
      showToast?.('Gagal memuat deal tertutup: ' + closedRes.error.message, 'error');
      setClosedRows([]);
    } else {
      setClosedRows(closedRes.data || []);
    }
    setLoading(false);
  }, [profile, month, isAllEntities, isSalesOnly, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const filtered = useCallback((rows) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.inquiry_no || '').toLowerCase().includes(q) ||
      (r.customer?.name || '').toLowerCase().includes(q) ||
      (r.prospect?.name || '').toLowerCase().includes(q) ||
      (r.route || '').toLowerCase().includes(q));
  }, [search]);

  const lanes = useMemo(() => {
    const open = filtered(openRows);
    const closed = filtered(closedRows);
    return [
      ...OPEN_LANES.map((l) => ({
        ...l, tone: l.id, closed: false,
        items: open.filter((r) => r.status === l.id),
      })),
      ...CLOSED_LANES.map((l) => ({
        ...l, tone: l.id, closed: true,
        items: closed.filter((r) => r.status === l.id),
      })),
    ];
  }, [openRows, closedRows, filtered]);

  const totalOpen = openRows.length;
  const totalClosed = closedRows.length;

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <header style={{ marginBottom: SP.s5 }}>
        <h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, color: INK }}>
          Pipeline
        </h1>
        <p style={{ margin: `${SP.s2}px 0 0`, fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT }}>
          Satu kartu = satu inquiry. Status mengikuti dokumennya dan hanya bergerak lewat
          PRF, Quotation, Sales Order, atau tombol di Detail Deal — papan ini tidak bisa
          menggeser status.
        </p>
      </header>

      <ListView
        mode="lanes"
        groupedBoard
        lanes={lanes}
        renderCard={(inq) => <DealCard inq={inq} onOpen={onSelectInquiry} />}
        search={search}
        onSearch={setSearch}
        savedViews={[
          { id: 'aktif',    label: 'Deal Berjalan', count: totalOpen },
          { id: 'tertutup', label: `Ditutup ${monthLabel(month)}`, count: totalClosed },
        ]}
        activeView="aktif"
        onSelectView={() => { /* presentasional — kedua kelompok selalu tampil berdampingan */ }}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s2 }}>
            {/* Pemilih periode lajur tertutup */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              border: `1px solid ${LINE}`, borderRadius: RADIUS.md, background: SURFACE,
            }}>
              <button
                type="button" aria-label="Bulan sebelumnya"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                style={{ padding: '7px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: INK_SOFT, display: 'inline-flex' }}
              >
                <ChevronLeft size={15} />
              </button>
              <span style={{
                minWidth: 128, textAlign: 'center', fontFamily: FONT_HEAD,
                fontSize: 12.5, fontWeight: 600, color: INK,
              }}>
                {monthLabel(month)}
              </span>
              <button
                type="button" aria-label="Bulan berikutnya"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                style={{ padding: '7px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: INK_SOFT, display: 'inline-flex' }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <OutlineBtn onClick={fetchBoard} icon={<RefreshCw size={14} />}>
              {loading ? 'Memuat…' : 'Muat Ulang'}
            </OutlineBtn>
          </div>
        }
      />

      {loading && (
        <div style={{ padding: SP.s4, fontFamily: FONT_BODY, fontSize: 13, color: FAINT }}>
          Memuat pipeline…
        </div>
      )}
    </div>
  );
}
