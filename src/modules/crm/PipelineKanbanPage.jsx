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
import { ChevronLeft, ChevronRight, Funnel, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ListView from './v3/ListView';
import { Badge, OutlineBtn } from './v3/kit';
import {
  NAVY, INK, INK_SOFT, FAINT, LINE, SURFACE, FONT_HEAD, FONT_BODY, FONT_MONO,
  SP, RADIUS, STATUS_LABEL,
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
  { id: 'OPEN',        label: STATUS_LABEL.OPEN,
    step: { bg: 'linear-gradient(135deg, #DCD2F7, #B9A3EA)', fg: '#4C3D73', sub: 'rgba(76,61,115,0.65)' } },
  { id: 'IN_REVIEW',   label: STATUS_LABEL.IN_REVIEW,
    step: { bg: 'linear-gradient(135deg, #C6A6E4, #E4AECB)', fg: '#5C3653', sub: 'rgba(92,54,83,0.65)' } },
  { id: 'QUOTED',      label: STATUS_LABEL.QUOTED,
    step: { bg: 'linear-gradient(135deg, #F0B7CB, #F5C79A)', fg: '#7A4A38', sub: 'rgba(122,74,56,0.65)' } },
  // NEGOTIATION sampai batch ini nol penulis di seluruh repo; jalur tulisnya
  // lahir bersamaan di TASK 4 (tombol "Mulai Negosiasi", gate QUOTED).
  { id: 'NEGOTIATION', label: STATUS_LABEL.NEGOTIATION,
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
  created_at, closed_at, owner_id,
  prospect:accounts!inquiries_prospect_id_fkey(name),
  customer:accounts!inquiries_customer_id_fkey(name)
`;
/* ⚠️ Nama pemilik SENGAJA tidak di-embed dari `profiles` di sini.
   Embed bentuk apa pun — hint nama constraint (`!inquiries_owner_id_fkey`)
   maupun hint nama kolom (`!owner_id`) — sama-sama menuntut PostgREST mengenali
   foreign key inquiries.owner_id -> profiles.id di schema cache-nya, dan persis
   di situ ia gagal: FK-nya terkonfirmasi ADA di database, `NOTIFY pgrst,
   'reload schema'` sudah dijalankan, errornya tetap bertahan. Jadi jalur embed
   ditinggalkan sama sekali, bukan diperbaiki bentuknya untuk ketiga kalinya.
   `owner_id` tetap diambil sebagai kolom biasa — nol ketergantungan pada FK —
   dan namanya diambil SEKALI per pemuatan papan lewat query terpisah ke
   `profiles`; lihat query ketiga di fetchBoard. */

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

/* ─── Filter papan ─────────────────────────────────────────────────────────
   EMPAT dimensi, seluruhnya ber-AND, dan menumpang di `filtered()` yang sama
   dengan kotak pencarian — jadi jumlah di kolom, segmen chevron, dan rel
   tertutup ikut menyesuaikan sendiri tanpa satu baris pun berubah di ListView.

   ⚠️ "Channel Asal" SENGAJA BELUM ADA di sini. Master `channel_types` sudah
   lahir (migrasi 20260827000001) tapi `inquiries` belum punya kolom penghubung
   ke sana — tak ada `channel_type_id` di tabel mana pun, dan tabel masternya
   nol pembaca di seluruh repo. Menambalnya lewat `accounts.source` sempat
   dipertimbangkan lalu DITOLAK (keputusan Den): granularitasnya per-AKUN, bukan
   per-inquiry, jadi ia akan menjawab pertanyaan yang berbeda dari yang ditanya.
   Filter kelima menunggu `inquiries.channel_type_id` di batch DB terpisah. */
const EMPTY_FILTERS = { ownerId: '', services: [], valMin: '', valMax: '', ageDays: 0 };

/* Preset umur di tahap sekarang — hari; 0 = mati. */
const AGE_PRESETS = [
  { days: 7,  label: '> 7 days'  },
  { days: 14, label: '> 14 days' },
  { days: 30, label: '> 30 days' },
];

/* Preset rentang nilai; string kosong = sisi itu tanpa batas. */
const VALUE_PRESETS = [
  { label: '< 50 jt',      min: '',           max: '50000000'   },
  { label: '50–250 jt',    min: '50000000',   max: '250000000'  },
  { label: '250 jt–1 M',   min: '250000000',  max: '1000000000' },
  { label: '> 1 M',        min: '1000000000', max: ''           },
];

/* Berapa DIMENSI yang aktif — bukan berapa nilai yang dipilih. Dua layanan
   tercentang tetap satu dimensi, supaya angka di badge terbaca sebagai
   "berapa saringan yang menempel", bukan angka yang melonjak sendiri. */
const countActive = (f) =>
  (f.ownerId ? 1 : 0) +
  (f.services.length ? 1 : 0) +
  (f.valMin !== '' || f.valMax !== '' ? 1 : 0) +
  (f.ageDays > 0 ? 1 : 0);

/* ─── Panel filter ─────────────────────────────────────────────────────────
   SATU panel gabungan, bukan empat dropdown lepas di toolbar: kontrol yang
   berdiri sendiri-sendiri membuat toolbar ramai dan menyembunyikan fakta bahwa
   keempatnya ber-AND. Gaya pil mengikuti saved-view di FilterBar (ListView). */
function FilterPanel({ flt, onChange, ownerOpts, serviceOpts, ageLoading, onReset, onClose }) {
  const set = (patch) => onChange({ ...flt, ...patch });
  const toggleService = (v) => set({
    services: flt.services.includes(v)
      ? flt.services.filter((s) => s !== v)
      : [...flt.services, v],
  });

  const secTitle = {
    fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
    textTransform: 'uppercase', color: INK_SOFT, marginBottom: SP.s2,
  };
  const field = {
    width: '100%', padding: '7px 10px', borderRadius: RADIUS.sm,
    border: `1px solid ${LINE}`, background: SURFACE,
    fontFamily: FONT_BODY, fontSize: 13, color: INK, outline: 'none',
  };
  const chip = (on) => ({
    padding: '5px 11px', borderRadius: RADIUS.pill, cursor: 'pointer',
    border: `1px solid ${on ? NAVY : LINE}`,
    background: on ? NAVY : 'transparent',
    color: on ? '#FFFFFF' : INK_SOFT,
    fontFamily: FONT_HEAD, fontSize: 12, fontWeight: on ? 700 : 600,
  });
  const row = { display: 'flex', gap: SP.s1, flexWrap: 'wrap' };

  const valueOn = (p) => flt.valMin === p.min && flt.valMax === p.max;

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
      width: 330, padding: SP.s4, borderRadius: RADIUS.lg,
      border: `1px solid ${LINE}`, background: SURFACE,
      boxShadow: '0 10px 30px rgba(22,36,58,0.12)',
      display: 'flex', flexDirection: 'column', gap: SP.s4,
    }}>
      {/* 1 — Pemilik Deal */}
      <div>
        <div style={secTitle}>Deal Owner</div>
        <select
          value={flt.ownerId} onChange={(e) => set({ ownerId: e.target.value })}
          style={field}
        >
          <option value="">All owners</option>
          {ownerOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {/* 2 — Jenis Layanan */}
      <div>
        <div style={secTitle}>Service Type</div>
        <div style={row}>
          {serviceOpts.length === 0
            ? <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: FAINT }}>No data</span>
            : serviceOpts.map((s) => (
              <button
                key={s.value} type="button"
                onClick={() => toggleService(s.value)}
                style={chip(flt.services.includes(s.value))}
              >
                {s.label}
              </button>
            ))}
        </div>
      </div>

      {/* 3 — Rentang Nilai Deal */}
      <div>
        <div style={secTitle}>Deal Value Range</div>
        <div style={{ ...row, marginBottom: SP.s2 }}>
          {VALUE_PRESETS.map((p) => (
            <button
              key={p.label} type="button"
              onClick={() => set(valueOn(p)
                ? { valMin: '', valMax: '' }
                : { valMin: p.min, valMax: p.max })}
              style={chip(valueOn(p))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s2 }}>
          <input
            type="number" min="0" inputMode="numeric" placeholder="Minimum"
            value={flt.valMin} onChange={(e) => set({ valMin: e.target.value })}
            style={field}
          />
          <span style={{ color: FAINT }}>–</span>
          <input
            type="number" min="0" inputMode="numeric" placeholder="Maksimum"
            value={flt.valMax} onChange={(e) => set({ valMax: e.target.value })}
            style={field}
          />
        </div>
      </div>

      {/* 4 — Umur di Tahap Sekarang */}
      <div>
        <div style={secTitle}>Age in Current Stage</div>
        <div style={row}>
          {AGE_PRESETS.map((p) => (
            <button
              key={p.days} type="button"
              onClick={() => set({ ageDays: flt.ageDays === p.days ? 0 : p.days })}
              style={chip(flt.ageDays === p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Selama riwayat belum tiba, saringan umur BELUM diterapkan — papan
            tampil apa adanya, bukan dikosongkan. Papan kosong sesaat akan
            terbaca sebagai "tidak ada hasil", padahal cuma datanya belum ada. */}
        {ageLoading && (
          <div style={{ marginTop: SP.s2, fontFamily: FONT_BODY, fontSize: 11.5, color: FAINT }}>
            Loading stage age… this filter is not applied yet.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: SP.s2, borderTop: `1px solid ${LINE}`, paddingTop: SP.s3 }}>
        <button
          type="button" onClick={onReset}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: RADIUS.md, cursor: 'pointer',
            border: `1px solid ${LINE}`, background: 'transparent', color: INK_SOFT,
            fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600,
          }}
        >
          Reset all
        </button>
        <button
          type="button" onClick={onClose}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: RADIUS.md, cursor: 'pointer',
            border: `1px solid ${NAVY}`, background: NAVY, color: '#FFFFFF',
            fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700,
          }}
        >
          Tutup
        </button>
      </div>
    </div>
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
  const [flt,        setFlt]        = useState(EMPTY_FILTERS);
  const [panelOpen,  setPanelOpen]  = useState(false);

  // Peta owner_id -> full_name. Diisi query ketiga di fetchBoard; nama pemilik
  // tidak lagi menempel di baris inquiry-nya.
  const [ownerNames, setOwnerNames] = useState({});

  // Peta inquiry_id -> saat masuk status sekarang. `null` = belum pernah
  // diambil (filter umur belum pernah dinyalakan).
  const [stageSince,   setStageSince]   = useState(null);
  const [stageLoading, setStageLoading] = useState(false);

  const fetchBoard = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { startIso, endIso } = monthRange(month);

    // Scope di-inline (bukan useCallback terpisah): builder PostgREST itu
    // mutable, jadi useCallback bersarang yang mengembalikan query termutasi
    // tak bisa dipertahankan memoisasinya oleh React Compiler.
    /* "Deal saya" untuk sales = `owner_id`, BUKAN `created_by`. Kepemilikan deal
       bisa dipindahtangankan selama deal masih terbuka, jadi papan kerja harus
       mengikuti pemilik saat ini — begitu sebuah deal dioper, ia muncul di papan
       pemilik barunya dan lenyap dari papan pemilik lama. Memakai `created_by`
       membuat papan menempel selamanya pada pembuat pertama.
       `created_by` sendiri TIDAK dihapus dari sistem: ia tetap field historis
       yang ditampilkan sebagai "Dibuat Oleh" di Detail Deal, hanya berhenti jadi
       dasar keputusan akses. Cermin RLS `inquiries_read` sesudah migrasi
       20260830000003. */
    const applyScope = (q) => {
      let query = q;
      if (!isAllEntities && profile?.company_id) query = query.eq('company_id', profile.company_id);
      if (isSalesOnly && profile?.id)            query = query.eq('owner_id', profile.id);
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
      showToast?.('Failed to load pipeline: ' + openRes.error.message, 'error');
      setOpenRows([]);
    } else {
      setOpenRows(openRes.data || []);
    }
    if (closedRes.error) {
      showToast?.('Failed to load closed deals: ' + closedRes.error.message, 'error');
      setClosedRows([]);
    } else {
      setClosedRows(closedRes.data || []);
    }

    /* Query KETIGA — nama pemilik, pengganti embed yang dilepas.
       SATU query per pemuatan papan, bukan satu per kartu: seluruh owner_id
       dikumpulkan lebih dulu, di-dedup lewat Set, lalu diambil sekali jalan
       dengan .in(). Jumlah query tidak tumbuh mengikuti jumlah kartu — nol
       N+1. Id diambil dari HASIL query (openRes/closedRes), bukan dari state,
       karena setOpenRows/setClosedRows belum tentu sudah terbaca di sini. */
    const ownerIds = [...new Set(
      [...(openRes.data || []), ...(closedRes.data || [])]
        .map((r) => r.owner_id)
        .filter(Boolean),
    )];

    if (!ownerIds.length) {
      setOwnerNames({});
    } else {
      // ⚠️ TANPA filter `active`: yang dicari nama pemilik kartu yang ADA di
      // papan. Menyaring user nonaktif hanya akan membuat namanya hilang dan
      // dropdown menampilkan "(tanpa nama)", padahal deal-nya nyata.
      // `profiles` juga tidak punya deleted_at — kolomnya `active`.
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ownerIds)
        .limit(1000);

      if (profErr) {
        showToast?.('Failed to load deal owner names: ' + profErr.message, 'error');
        setOwnerNames({});
      } else {
        const map = {};
        for (const p of profs || []) map[p.id] = p.full_name;
        setOwnerNames(map);
      }
    }

    setLoading(false);
  }, [profile, month, isAllEntities, isSalesOnly, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const ageOn = flt.ageDays > 0;

  const boardIds = useMemo(
    () => [...openRows, ...closedRows].map((r) => r.id),
    [openRows, closedRows],
  );

  /* Riwayat umur diambil MALAS — hanya ketika filter Umur benar-benar menyala.
     Papan default tetap dua query seperti sebelumnya, nol biaya tambahan.
     Identitas fungsi ini ikut `boardIds`, jadi pindah bulan otomatis memicu
     pengambilan ulang selama filternya masih menyala. */
  const fetchStageSince = useCallback(async () => {
    if (!boardIds.length) { setStageSince({}); return; }
    setStageLoading(true);
    const { data, error } = await supabase
      .from('inquiry_status_history')
      .select('inquiry_id, changed_at')
      .in('inquiry_id', boardIds)
      .order('changed_at', { ascending: false })
      .limit(1000);

    if (error) {
      showToast?.('Failed to load stage age: ' + error.message, 'error');
      setStageSince({});
    } else {
      const rows = data || [];
      // Sudah diurut menurun, jadi baris PERTAMA tiap inquiry = transisi
      // terakhirnya = saat ia masuk ke status yang sekarang.
      // ⚠️ `duration_seconds` SENGAJA tidak dipakai: isinya lama di status
      // SEBELUMNYA, bukan umur di tahap sekarang.
      const map = {};
      for (const r of rows) if (!(r.inquiry_id in map)) map[r.inquiry_id] = r.changed_at;
      setStageSince(map);
      // Jangan diam-diam memotong: kalau cap 1000 kena, inquiry yang transisi
      // terakhirnya paling tua justru yang hilang — persis yang dicari filter
      // ini — dan hasilnya akan terlihat sah padahal kurang.
      if (rows.length === 1000) {
        showToast?.('Age history was truncated at 1000 rows, so age filtering may be incomplete.', 'error');
      }
    }
    setStageLoading(false);
  }, [boardIds, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ageOn) fetchStageSince(); }, [ageOn, fetchStageSince]);

  const stageReady = ageOn && stageSince !== null && !stageLoading;

  const filtered = useCallback((rows) => {
    const q = search.trim().toLowerCase();
    const { ownerId, services, valMin, valMax, ageDays } = flt;
    const min = valMin === '' ? null : Number(valMin);
    const max = valMax === '' ? null : Number(valMax);
    // Saringan umur baru menggigit setelah riwayatnya tiba (lihat catatan di
    // FilterPanel) — sampai itu terjadi, papan tampil apa adanya.
    const ageCut = ageDays > 0 && stageReady ? Date.now() - ageDays * 86400000 : null;

    return rows.filter((r) => {
      if (q && !(
        (r.inquiry_no || '').toLowerCase().includes(q) ||
        (r.customer?.name || '').toLowerCase().includes(q) ||
        (r.prospect?.name || '').toLowerCase().includes(q) ||
        (r.route || '').toLowerCase().includes(q))) return false;

      if (ownerId && r.owner_id !== ownerId) return false;
      if (services.length && !services.includes(r.service_type)) return false;

      if (min !== null || max !== null) {
        const val = (r.estimated_value === null || r.estimated_value === undefined)
          ? null : Number(r.estimated_value);
        // Nilai kosong bukan nol: inquiry tanpa taksiran nilai TIDAK bisa
        // dinilai masuk rentang mana pun, jadi ia keluar dari hasil.
        if (val === null) return false;
        if (min !== null && val < min) return false;
        if (max !== null && val > max) return false;
      }

      if (ageCut !== null) {
        const since = stageSince?.[r.id];
        // Tanpa baris riwayat, umurnya tak diketahui — bukan "0 hari".
        if (!since || new Date(since).getTime() > ageCut) return false;
      }
      return true;
    });
  }, [search, flt, stageReady, stageSince]);

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

  /* Opsi dropdown diturunkan dari DATA PAPAN, bukan dari daftar tetap: yang
     ditawarkan filter selalu yang benar-benar ada di papan, jadi tak mungkin
     memilih pemilik/layanan yang pasti menghasilkan nol kartu. */
  const ownerOpts = useMemo(() => {
    const ids = new Set();
    for (const r of [...openRows, ...closedRows]) if (r.owner_id) ids.add(r.owner_id);
    return [...ids]
      // Nama datang dari peta hasil query ketiga, bukan dari baris inquiry.
      // Fallback tetap teks, bukan UUID: id mentah di dropdown tak berarti
      // apa-apa bagi pembacanya.
      .map((id) => ({ id, name: ownerNames[id] || '(unnamed)' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [openRows, closedRows, ownerNames]);

  const serviceOpts = useMemo(() => {
    const seen = new Set();
    for (const r of [...openRows, ...closedRows]) if (r.service_type) seen.add(r.service_type);
    return [...seen].sort().map((v) => ({ value: v, label: SERVICE_LABEL[v] || v }));
  }, [openRows, closedRows]);

  const activeCount = countActive(flt);

  const totalOpen = openRows.length;
  const totalClosed = closedRows.length;

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <header style={{ marginBottom: SP.s5 }}>
        <h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, color: INK }}>
          Pipeline
        </h1>
      </header>

      <ListView
        mode="lanes"
        groupedBoard
        lanes={lanes}
        renderCard={(inq) => <DealCard inq={inq} onOpen={onSelectInquiry} />}
        search={search}
        onSearch={setSearch}
        filters={
          <div style={{ position: 'relative' }}>
            <OutlineBtn onClick={() => setPanelOpen((v) => !v)} icon={<Funnel size={14} />}>
              Filter
              {activeCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 17, height: 17, padding: '0 5px', borderRadius: RADIUS.pill,
                  background: NAVY, color: '#FFFFFF',
                  fontFamily: FONT_HEAD, fontSize: 10.5, fontWeight: 700,
                }}>
                  {activeCount}
                </span>
              )}
            </OutlineBtn>
            {panelOpen && (
              <>
                {/* Backdrop transparan — klik di luar menutup panel, tanpa
                    listener dokumen beserta pembersihannya. */}
                <div
                  onClick={() => setPanelOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 20 }}
                />
                <FilterPanel
                  flt={flt} onChange={setFlt}
                  ownerOpts={ownerOpts} serviceOpts={serviceOpts}
                  ageLoading={ageOn && !stageReady}
                  onReset={() => setFlt(EMPTY_FILTERS)}
                  onClose={() => setPanelOpen(false)}
                />
              </>
            )}
          </div>
        }
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
                type="button" aria-label="Previous month"
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
                type="button" aria-label="Next month"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                style={{ padding: '7px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: INK_SOFT, display: 'inline-flex' }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <OutlineBtn onClick={fetchBoard} icon={<RefreshCw size={14} />}>
              {loading ? 'Loading…' : 'Muat Ulang'}
            </OutlineBtn>
          </div>
        }
      />

      {loading && (
        <div style={{ padding: SP.s4, fontFamily: FONT_BODY, fontSize: 13, color: FAINT }}>
          Loading pipeline…
        </div>
      )}
    </div>
  );
}
