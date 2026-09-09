// src/modules/crm/DealDetailPage.jsx
// CRM — Detail Deal (per inquiry). Ported from the Lovable handoff, adapted to
// Nexus conventions: Lucide icons, shared supabase client, useAuth, brand
// tokens (navy #1B4D8A / orange #E85A1E), Montserrat/Inter fonts.
//
// Props:
//   inquiryId          : string — inquiry to render
//   onBack             : () => void
//   onCreateQuotation  : (inquiryId) => void        — open Quotation form dengan
//                                                     inquiry ini sudah terpilih
//                                                     (item tetap kosong: sumber
//                                                     item hanya ada lewat PRF)
//   onViewQuotation    : (quotation) => void        — open Quotation detail
//   showToast          : (msg, type?) => void
//
// Data: inquiries + accounts (prospect) + quotations (WHERE inquiry_id) +
// activities (WHERE account_id = inquiry.prospect_id) + profiles + payment_terms.
// No DB schema change. Halaman ini READ-ONLY terhadap `accounts` sejak 8 Sep 2026 —
// satu-satunya jalur tulisnya (Move Stage + Edit Deal) sudah dicabut.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Pencil, CalendarClock, ArrowRight,
  Loader2, AlertCircle, Phone, MessageCircle, MapPin, Users, Mail, ListChecks, XCircle,
  Ban, UserCog,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import {
  C, HEAD, BODY, fmtDate, fmtRp, Card, PriceSummaryCard,
} from './DealPanels';
import StatusBar from './v3/StatusBar';
import FormSheet from './v3/FormSheet';
import Notebook from './v3/Notebook';
import ListView from './v3/ListView';
import { RADIUS, SP, LINE, NAVY_SOFT, INK, FONT_MONO, MUTED, SURFACE_2 } from './v3/tokens';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { formatQuotationNo, pickActiveQuotation } from './quotationVersion';
import ConfirmModal from '../../components/ConfirmModal';
import { LostReasonModal, CancelReasonModal } from './DealCloseModals';
import { fetchOperationalRoster } from './salesRoster';
import InquiryChatter from './InquiryChatter';
// Label kargo & layanan tambahan diimpor dari SUMBER BERSAMA, BUKAN dicermin.
// Cermin sudah terjadi tiga kali di file ini dan tiap cermin adalah sumber
// kebenaran kedua yang pasti ketinggalan.
import { CARGO_TYPES, SERVICES } from './inquiryOptions';

// Status inquiry yang masih boleh ditandai KALAH. WON / LOST / CANCELLED terminal →
// aksinya tidak dirender sama sekali (bukan disabled).
const LOSABLE_INQUIRY_STATUS = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];

// B3 — "Batalkan" memakai gate yang SAMA PERSIS dengan "Tandai Kalah": keduanya
// jalur penutupan manual, jadi tak ada alasan salah satunya lebih longgar.
const CANCELLABLE_INQUIRY_STATUS = LOSABLE_INQUIRY_STATUS;

// Batch 3C — gate tombol "Pakai/Ganti Penawaran Ini" (RPC prf_select_offer
// menegakkan izin sebenarnya). Mirrors DB is_manager_or_above() — sama persis
// daftar di PRFDetailPage.jsx (tidak diekspor dari sana, jadi disalin di sini;
// pola mirror-per-file ini sudah berulang di codebase).
const MANAGER_OR_ABOVE = ['super_admin', 'admin', 'ceo', 'gm', 'gm_bd', 'manager', 'supervisor'];

const SERVICE_LABEL = {
  freight_forwarding: 'Freight Forwarding',
  customs: 'Customs Clearance',
  trading: 'General Trading',
};
const ACT_ICON = {
  call: Phone, whatsapp: MessageCircle, visit: MapPin, meeting: Users,
  email: Mail, followup: ListChecks,
};


// Papan Pipeline nanti butuh daftar tahap yang SAMA PERSIS dengan ini; konsolidasinya
// (ke tokens.js atau modul bersama) menunggu Batch B3 — jangan disatukan sekarang.
// Empat tahap AKTIF sumbu deal (`inquiries.status`). WON/LOST/CANCELLED sengaja TIDAK
// di sini: ketiganya penanda penutupan di ujung kanan StatusBar, bukan segmen.
// DEAL_STATUS_ORDER di v3/tokens.js TIDAK dipakai — isinya lima, termasuk WON.
const DEAL_STAGE_SEGMENTS = [
  { id: 'OPEN',        label: 'OPEN' },
  { id: 'IN_REVIEW',   label: 'IN REVIEW' },
  { id: 'QUOTED',      label: 'QUOTED' },
  { id: 'NEGOTIATION', label: 'NEGOTIATION' },
];
const DEAL_CLOSED_STATUS = ['WON', 'LOST', 'CANCELLED'];

/* Penunjuk langkah berikutnya — pengganti INFORMASI dari tombol arah-maju yang
   dicabut 8 Sep 2026 (blueprint §6: perpindahan status digerakkan DOKUMEN).
   Tombolnya hilang, tapi pengetahuan "apa yang harus kulakukan supaya deal ini
   maju" tidak boleh ikut hilang — itulah gunanya baris ini.
   Nada NAVY_SOFT + INK, bukan warna peringatan: ini informasi, bukan error.
   Status tertutup (WON/LOST/CANCELLED) sengaja NOL render — tak ada langkah
   berikutnya untuk deal yang sudah selesai. */
const NEXT_STEP_HINT = {
  OPEN:        'Issue a PRF and submit it to pricing to advance to IN REVIEW.',
  IN_REVIEW:   'Send the quotation to the customer to advance to QUOTED.',
  /* "Send", bukan "Issue". Trigger trg_z_inquiry_negotiation_on_revision
     menyala saat revisi ke-2+ BERPINDAH ke SENT — membuat revisi lalu
     membiarkannya DRAFT tidak memindahkan apa pun. "Issue" bisa dibaca
     "buat", dan itu janji yang tidak ditepati sistem. */
  QUOTED:      'Send the next quotation version to enter NEGOTIATION, or send a Sales Order to close as WON.',
  NEGOTIATION: 'Send a Sales Order to close the deal as WON.',
};

function NextStepHint({ status }) {
  const text = NEXT_STEP_HINT[status];
  if (!text) return null;
  return (
    <div
      style={{
        marginTop: SP.s2,
        padding: `${SP.s2}px ${SP.s3}px`,
        borderRadius: RADIUS.md,
        background: NAVY_SOFT,
        color: INK,
        fontFamily: BODY,
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontWeight: 700 }}>Next step</span>
      <span style={{ opacity: 0.55, margin: '0 8px' }}>·</span>
      {text}
    </div>
  );
}

// Gaya dasar tombol baris aksi. Diangkat jadi konstanta karena dipakai tujuh kali
// dengan hanya warna/border yang berbeda — sebelumnya style yang sama disalin
// utuh di tiap tombol. Tinggi 36 (bukan 32 seperti saat masih di header kartu)
// supaya sebaris dengan DealHeaderControls yang tingginya 40.
/* ---------- Kesiapan PRF (Batch B3) ----------
   Menjawab satu pertanyaan yang sebelumnya tak terjawab di layar ini: dari
   beberapa PRF milik satu inquiry, yang MANA yang sudah layak jadi sumber
   quotation. Diturunkan dari data yang SUDAH di-fetch (`status`,
   `selected_offer_id`) — nol query baru.

   ⚠️ URUTAN PENGECEKAN MENGIKAT. Keadaan tertutup dicek PALING DULU: PRF
   CANCELLED/EXPIRED tak akan pernah dijawab procurement, jadi menampilkannya
   sebagai "Awaiting procurement" adalah janji yang tak akan datang. */
// Peta id → label, diturunkan dari konstanta yang DIIMPOR (bukan disalin), supaya
// menambah satu kategori kargo/layanan di form otomatis ikut terbaca di sini.
const CARGO_LABEL = Object.fromEntries(CARGO_TYPES.map((c) => [c.id, c.label]));
const SERVICE_ADDON_LABEL = Object.fromEntries(SERVICES.map((x) => [x.id, x.label]));
// Nilai yang tak dikenal peta DIKEMBALIKAN APA ADANYA, bukan disembunyikan atau
// diganti '—': id asing berarti data menyimpan sesuatu yang form tak lagi kenal,
// dan itu harus terlihat, bukan ditelan.
const mapLabels = (arr, dict) => (Array.isArray(arr) ? arr.map((v) => dict[v] || v) : arr);

// PRF service_type = MODA transport, taksonomi BEDA dari inquiry SERVICE_LABEL
// (TD-108). Dicermin di sini karena PRF_SERVICE_LABEL tidak diekspor DealPanels
// dan file itu di luar scope batch ini — pola mirror-per-file yang sudah berulang
// di codebase ini (lih. MANAGER_OR_ABOVE di atas).
const PRF_SERVICE_LABEL = { sea: 'Sea', air: 'Air', inland: 'Inland', project: 'Project', custom: 'Custom' };

const PRF_READINESS = {
  not_active:  { label: 'Not active',           bg: '#F2F1EE', color: '#8A8478', bd: '#DEDBD4' },
  ready:       { label: 'Ready as source',      bg: '#E1E9F2', color: '#144682', bd: '#B8C8DC' },
  needs:       { label: 'Needs selection',      bg: '#FDE7DB', color: '#B53F0D', bd: '#EFC5B2' },
  awaiting:    { label: 'Awaiting procurement', bg: '#EDEBE7', color: '#6B6459', bd: '#D3D0CB' },
};
function prfReadinessKey(p) {
  const st = String(p?.status || '').toUpperCase();
  if (st === 'CANCELLED' || st === 'EXPIRED') return 'not_active';
  if (st === 'QUOTED' && p?.selected_offer_id) return 'ready';
  if (st === 'QUOTED') return 'needs';
  return 'awaiting';
}

/* Badge tinted rounded-square — pola dan bentuknya menyalin StatusBadge di
   InquiryListPage (RADIUS.sm, bukan pill), supaya dua layar tak melahirkan dua
   bahasa visual untuk hal yang sama. */
function TintBadge({ meta }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
      padding: '2px 10px', borderRadius: RADIUS.sm, fontFamily: HEAD,
      fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px',
      border: `1px solid ${meta.bd}`, background: meta.bg, color: meta.color,
    }}>
      {meta.label}
    </span>
  );
}

/* ---------- Kolom tabel di dalam tab (Batch B3) ----------
   Bentuk `columns` mengikuti kontrak ListView: { key, label, align?, render? }.
   Keduanya konstanta modul karena `render` hanya membaca baris + konstanta —
   tak ada satu pun yang butuh state halaman. */
const QUOTATION_COLUMNS = [
  { key: 'no', label: 'No', render: (r, i) => i + 1 },
  { key: 'quotation_no', label: 'Quotation No', render: (r) => (
    <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.navy }}>{formatQuotationNo(r.quotation_no, r.revision)}</span>
  ) },
  { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at) },
  { key: 'total_amount', label: 'Value', align: 'right', render: (r) => (
    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRp(r.total_amount)}</span>
  ) },
  { key: 'status', label: 'Status', render: (r) => {
    const m = QUO_STATUS[String(r.status || '').toUpperCase()] || QUO_STATUS.DRAFT;
    return <TintBadge meta={m} />;
  } },
  /* Ikon Download disabled diganti tombol teks "View". Penanda "pekerjaan belum
     jadi" yang dulu jadi alasan ikon itu bertahan sudah tidak sepadan harganya:
     satu-satunya kontrol di kolom Actions berupa tombol mati membuat kolomnya
     terbaca rusak, bukan terbaca "segera hadir".

     Tak ada onClick sendiri — <tr> ListView sudah memegang onRowClick, dan klik
     di sini menggelembung ke sana. Menduplikasi handler-nya justru membuka
     peluang dua jalur navigasi yang bisa melenceng. */
  { key: 'actions', label: 'Actions', render: () => (
    <button type="button"
      style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, cursor: 'pointer', color: C.navy, fontFamily: BODY, fontSize: 12, fontWeight: 600, padding: '4px 10px' }}>
      View
    </button>
  ) },
];

const PRF_COLUMNS = [
  { key: 'no', label: 'No', render: (r, i) => i + 1 },
  { key: 'prf_no', label: 'PRF No', render: (r) => (
    <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.navy }}>{r.prf_no}</span>
  ) },
  { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at) },
  { key: 'service_type', label: 'Service Type', render: (r) => PRF_SERVICE_LABEL[r.service_type] || r.service_type || '—' },
  { key: 'status', label: 'Status', render: (r) => String(r.status || '').toUpperCase() },
  { key: 'readiness', label: 'Readiness', render: (r) => <TintBadge meta={PRF_READINESS[prfReadinessKey(r)]} /> },
];

/* Status quotation yang dipakai sistem ini. Tak ada CHECK constraint di DB,
   jadi keenamnya konvensi kode — nilai tak dikenal jatuh ke DRAFT, bukan
   dikarang.

   SUPERSEDED lahir bersama RPC create_quotation_revision (migrasi
   20260909000003). Tanpa entri di sini, fallback `|| QUO_STATUS.DRAFT` membuat
   baris SUPERSEDED BERBOHONG tertulis "Draft" — dan itu bohong yang mahal,
   karena "Draft" berarti belum pernah dikirim sementara SUPERSEDED berarti
   sudah dikirim LALU digantikan.

   Peta ini salah satu dari TIGA (dua lainnya di QuotationListPage dan
   QuotationDetailPage). Sengaja belum disatukan — tapi ketiganya wajib
   bergerak bersama.

   SENT berlabel "Awaiting Customer Approval": nilai DB tetap 'SENT'. */
const QUO_STATUS = {
  DRAFT:      { label: 'Draft',                      bg: '#EDEBE7', color: '#6B6459', bd: '#D3D0CB' },
  SUBMITTED:  { label: 'Submitted',                  bg: '#FBF0DD', color: '#916312', bd: '#E6D4B4' },
  SENT:       { label: 'Awaiting Customer Approval', bg: '#E4EEF7', color: '#1D5A96', bd: '#BCD0E4' },
  ACCEPTED:   { label: 'Accepted',                   bg: '#E1E9F2', color: '#144682', bd: '#B8C8DC' },
  REJECTED:   { label: 'Rejected',                   bg: '#FBE7E5', color: '#B33A2E', bd: '#EDC4C0' },
  SUPERSEDED: { label: 'Superseded',                 bg: '#EDEBE7', color: '#6B6459', bd: '#D3D0CB' },
};

/* Subjudul kelompok + label mikro baris rute. Diangkat jadi konstanta karena
   dipakai berulang di kartu badan. */
const GRP_TITLE = {
  fontFamily: HEAD, fontWeight: 600, fontSize: 12, textTransform: 'uppercase',
  letterSpacing: '.04em', color: C.navy, marginBottom: 10,
};
const GRP_MICRO = {
  fontFamily: BODY, fontSize: 10.5, textTransform: 'uppercase',
  letterSpacing: '.04em', color: C.textFaint, marginBottom: 4,
};

/* Pengelompokan field kartu badan. Urutan kelompok = urutan tampil (mengalir dua
   kolom). `fields` sengaja fungsi, bukan array statis: nilainya turunan inquiry.
   Catatan: `Route` masuk SERVICE & STATUS (bukan TIMELINE) karena ia atribut
   layanan, bukan linimasa — keputusan Den 4 Sep 2026. Field TIDAK ada yang
   dihapus: kedelapan belas tetap tampil. */
const FIELD_GROUPS = [
  {
    title: 'Service & Status',
    fields: (i) => [
      { label: 'Service Type', value: SERVICE_LABEL[i.service_type] || i.service_type },
      { label: 'Status', value: i.status || 'OPEN' },
      { label: 'Route', value: i.route },
    ],
  },
  {
    title: 'Terms & Container',
    fields: (i) => [
      { label: 'Incoterm', value: i.incoterms, pills: true },
      { label: 'Container Type', value: i.container_types, pills: true },
    ],
  },
  {
    title: 'Cargo',
    fields: (i) => [
      { label: 'Goods Name', value: i.goods_name },
      { label: 'HS Code', value: i.hs_code, mono: true },
      { label: 'Total Weight (KG)', value: i.weight_kg != null ? String(i.weight_kg) : '', mono: true },
      { label: 'Volume (CBM)', value: i.volume_cbm != null ? String(i.volume_cbm) : '', mono: true },
      { label: 'Cargo Type', value: mapLabels(i.cargo_types, CARGO_LABEL), pills: true },
    ],
  },
  {
    title: 'Additional Services',
    fields: (i) => [
      { label: 'Additional Services', value: mapLabels(i.additional_services, SERVICE_ADDON_LABEL), pills: true },
    ],
  },
  {
    title: 'Timeline & Ownership',
    fields: (i, x) => [
      { label: 'Deadline Quote', value: i.deadline_quote ? fmtDate(i.deadline_quote) : '' },
      { label: 'Created By', value: x.createdByName },
      // "Deal Owner" di sini = `inquiries.owner_id`, BEDA dari "Assigned To" di
      // meta header yang membaca `accounts.assigned_to`. Jangan disamakan:
      // yang satu pemilik DEAL, yang satu pemegang AKUN.
      { label: 'Deal Owner', value: x.ownerName },
      { label: 'Created Date', value: fmtDate(i.created_at) },
    ],
  },
  {
    title: 'Value',
    fields: (i) => [
      // Kosong tampil "—", bukan Rp 0 — deal tanpa taksiran beda dari yang bernilai nol.
      { label: 'Estimated Value', value: i.estimated_value == null ? '' : fmtRp(Number(i.estimated_value)), mono: true },
    ],
  },
];

const ACT_BTN = {
  height: 36, padding: '0 13px', borderRadius: 9,
  border: `1px solid ${C.border}`, background: '#fff', color: C.navy,
  fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

function Avatar({ name, size = 28 }) {
  const init = (name && name !== '—')
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '—';
  return (
    <span style={{ width: size, height: size, borderRadius: 999, background: C.navySoft, color: C.navy, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: HEAD, fontSize: size * 0.4, fontWeight: 700 }}>
      {init}
    </span>
  );
}

/* ---------- Slot header FormSheet (Batch B1) ----------
   `Header` yang lama (breadcrumb + h1 + chip nomor + assignee + est. closing +
   DealHeaderControls, semuanya dalam satu blok) DIPECAH jadi potongan-potongan
   yang masuk slot FormSheet: breadcrumb / title / docNo / meta. Susunannya kini
   milik FormSheet (breadcrumb → judul+docNo+meta → status), sehingga StatusBar
   yang sebelumnya terlanjur dirender DI ATAS breadcrumb otomatis turun ke
   tempat yang benar tanpa kode urutan di sini.
   StageBadge (badge sumbu stage lama di `accounts`) DIHAPUS 4 Sep 2026 — sumbu itu
   digantikan StatusBar yang membaca `inquiries.status`. Jalur tulisnya menyusul
   dicabut 8 Sep 2026; halaman ini kini nol menyentuh sumbu lama itu. */
function Breadcrumb({ onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMute }}><ChevronLeft size={18} /></button>
      <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>Deal List</button>
      <ChevronRight size={14} color={C.textFaint} />
      <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, fontWeight: 600 }}>Deal Detail</span>
    </div>
  );
}

/* Judul dokumen. FormSheet merender `title` DI DALAM <h1>-nya sendiri, dan
   `{title}` menerima node apa pun — jadi nama akun tetap bisa diklik tanpa
   menambah prop baru ke kit. Cabang non-klik dipertahankan persis: akun kosong
   atau handler tak dikirim → teks polos, tanpa cursor pointer. */
function DealTitle({ name, accountId, onViewCustomer }) {
  if (!(accountId && onViewCustomer)) return name || '—';
  return (
    <span
      className="dd-account-name"
      onClick={() => onViewCustomer(accountId)}
      title="View account details"
      style={{ cursor: 'pointer' }}
    >
      {name || '—'}
    </span>
  );
}

/* Baris meta di bawah judul: siapa yang memegang akun, kapan deal dibuat, dan
   perkiraan closing-nya.
   ⚠️ Label "Assigned To" SENGAJA bukan "Deal Owner": nilai di sini
   `accounts.assigned_to` (pemegang AKUN), sedangkan "Deal Owner" di kartu badan
   adalah `inquiries.owner_id` (pemilik DEAL) — dua kolom berbeda yang kebetulan
   sering berisi orang yang sama. Memakai label yang sama untuk keduanya akan
   menyembunyikan perpindahan kepemilikan deal. */
/* Pemisah hairline antar potongan meta. Di scope MODUL, bukan di dalam HeaderMeta:
   komponen yang lahir saat render kehilangan state tiap render (react-hooks/static-components). */
const MetaSep = () => <span aria-hidden="true" style={{ width: 1, height: 14, background: LINE, flexShrink: 0 }} />;

function HeaderMeta({ assignedName, assignedProfileId, onViewProfile, createdAt, closeDate }) {
  const canViewProfile = !!(assignedProfileId && onViewProfile);
  /* Tiga potongan info yang dulu berdempetan: jarak ANTAR-potong (16) hampir sama
     dengan jarak label→nilai DI DALAM potongan (6), jadi ketiganya terbaca sebagai
     satu rentetan. Tiga perubahan, NOL informasi ditambah/dikurangi:
       (1) pemisah hairline vertikal antar potongan — pola yang sudah dipakai
           StatusBar, jadi bukan bentuk baru;
       (2) jarak antar-potong naik ke SP.s5 sementara label→nilai turun ke SP.s1,
           sehingga jarak antar jadi 5x jarak dalam (dulu 2,7x);
       (3) label jadi kecil-uppercase-renggang — bahasa visual yang persis dipakai
           "DEAL VALUE" di DealHeaderControls yang baru dicabut, dipakai ulang di
           tempat yang lebih pas. */
  const item = { display: 'inline-flex', alignItems: 'center', gap: SP.s1, fontFamily: BODY, fontSize: 13, color: C.textMute };
  const lbl = { fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const val = { fontWeight: 600, color: C.text };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.s5, flexWrap: 'wrap' }}>
      {canViewProfile ? (
        <button
          type="button"
          onClick={() => onViewProfile(assignedProfileId)}
          title="View profile"
          style={{ ...item, gap: SP.s2, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <Avatar name={assignedName} size={26} />
          <span style={lbl}>Assigned To</span>
          <span style={{ ...val, textDecoration: 'underline', textDecorationColor: C.border, textUnderlineOffset: 3 }}>{assignedName}</span>
        </button>
      ) : (
        <span style={{ ...item, gap: SP.s2 }}>
          <Avatar name={assignedName} size={26} />
          <span style={lbl}>Assigned To</span>
          <span style={val}>{assignedName || 'Unassigned'}</span>
        </span>
      )}
      <MetaSep />
      <span style={item}>
        <span style={lbl}>Created</span>
        <span style={val}>{fmtDate(createdAt)}</span>
      </span>
      <MetaSep />
      <span style={{ ...item, gap: SP.s2 }}>
        <CalendarClock size={15} color={C.textFaint} />
        <span style={lbl}>Est. Closing</span>
        <span style={val}>{fmtDate(closeDate)}</span>
      </span>
    </div>
  );
}


// ---------- QuotationItemsCard (lokal — bukan shared DealPanels) ----------
// Rincian harga itemized untuk SATU quotation (yang terbaru dibuat/diedit dari
// daftar di tab ini). Grouping/kalkulasi & struktur render disalin PERSIS dari
// QuotationDetailPage.jsx (sections by group_name, exclude baris if_any dari
// total) — tidak ada logic baru di sini, cuma dipindah ke konteks tab ini.
function QuotationItemsCard({ quotation, items, loading }) {
  const sections = useMemo(() => {
    if (!items.length) return [];
    const order = [];
    const map = {};
    items.forEach((row) => {
      const key = row.group_name || 'CHARGES';
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(row);
    });
    return order.map((name) => ({
      name,
      rows: map[name],
      total: map[name].reduce((s, r) => s + (r.if_any ? 0 : (Number(r.total) || 0)), 0),
    }));
  }, [items]);

  return (
    <Card title="Price Breakdown" icon={<FileText size={17} />}>
      <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, marginBottom: 14 }}>
        — <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.navy }}>{formatQuotationNo(quotation.quotation_no, quotation.revision)}</span>
        {' '}· last edited {fmtDate(quotation.updated_at || quotation.created_at)}
      </div>
      {loading ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>Loading price breakdown…</div>
      ) : sections.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>No items</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((sec, si) => {
            const secCost = sec.rows.reduce((s, r) =>
              r.if_any ? s : s + Math.round((Number(r.cost_price) || 0) * (Number(r.qty) || 0) * (Number(r.exchange_rate) || 1)), 0);
            return (
              <div key={si} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                <div style={{ background: C.surfaceAlt, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: HEAD, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: C.textMute }}>{sec.name}</span>
                  <span style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 700, color: C.text }}>{fmtRp(sec.total)}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>Description</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>Cost Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>Currency</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>Sell Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>Unit Label</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>QTY</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: MUTED, background: SURFACE_2 }}>Total IDR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row, ri) => (
                        <tr key={row.id || ri} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '9px 12px', color: C.text }}>{row.description || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.textMute, fontSize: 12 }}>
                            {(Number(row.cost_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: row.currency === 'USD' ? C.orange : C.textMute, fontWeight: 600, fontSize: 12 }}>
                            {row.currency || 'IDR'}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.text, fontSize: 12 }}>
                            {(Number(row.unit_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.textMute, fontSize: 12 }}>{row.unit_label || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.text, fontWeight: 600 }}>{row.qty || 1}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: row.currency !== 'IDR' ? C.orange : C.text, whiteSpace: 'nowrap' }}>
                            {fmtRp(row.total)}
                            {row.currency !== 'IDR' && (
                              <div style={{ fontSize: 10, color: C.textFaint, fontWeight: 400 }}>
                                × rate {(Number(row.exchange_rate) || 1).toLocaleString('id-ID')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, background: C.surfaceAlt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: BODY, fontSize: 11.5, color: C.textFaint }}>
                    Cost: {fmtRp(secCost)} • Margin: {sec.total > 0 ? ((sec.total - secCost) / sec.total * 100).toFixed(1) : '0'}%
                  </span>
                  <span style={{ fontFamily: HEAD, fontSize: 13, fontWeight: 700, color: C.text }}>Section total: {fmtRp(sec.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ========================================================================= */
export default function DealDetailPage({ inquiryId, onBack, onCreateQuotation, onViewQuotation, onEditInquiry, onCreatePRF, onViewPRF, onViewProfile, onViewCustomer, showToast }) {
  const { profile, erpRole, erpRoles, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inquiry, setInquiry] = useState(null);
  const [account, setAccount] = useState(null);
  const [quotations, setQuotations] = useState([]);
  // Rincian Harga (tab Quotation) — items HANYA untuk quotation terbaru (lihat
  // `activeQuotation` di bawah), bukan untuk semua quotation di daftar.
  const [activeQuotationItems, setActiveQuotationItems] = useState([]);
  const [activeItemsLoading, setActiveItemsLoading] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [revising,   setRevising]   = useState(false);
  const [prfs, setPrfs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [profMap, setProfMap] = useState({});
  const [termMap, setTermMap] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('aktivitas');
  // Tandai inquiry KALAH (Task 4, di-upgrade B3) — alasan kini dari MASTER
  // loss_reasons, bukan teks bebas WinLossModal.
  const [lossOpen, setLossOpen] = useState(false);
  const [lossSaving, setLossSaving] = useState(false);
  const [lossReasons, setLossReasons] = useState([]);
  // B3 — Batalkan deal (alasan teks bebas) + Mulai Negosiasi (tanpa form).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  // Ganti pemilik deal (owner_id). Panel inline, bukan modal: aksi ini tak punya
  // form alasan seperti Tandai Kalah/Batalkan — cuma satu dropdown.
  const [ownerOpen,   setOwnerOpen]   = useState(false);
  const [ownerDraft,  setOwnerDraft]  = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [salesOpts,   setSalesOpts]   = useState([]);
  // Batch 3C — pilih/ganti penawaran vendor (prf_select_offer). Konfirmasi
  // HANYA dibutuhkan saat MENGGANTI pilihan yang sudah ada; pilihan pertama
  // langsung jalan tanpa dialog.
  const [offerSwitchConfirm, setOfferSwitchConfirm] = useState({ open: false, prf: null, offer: null });
  const [offerActionBusy, setOfferActionBusy] = useState(false);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!inquiryId) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data: inq, error: e1 } = await supabase
        .from('inquiries')
        .select('id, inquiry_no, service_type, route, estimated_volume, estimated_value, status, notes, prospect_id, created_by, owner_id, created_at, deadline_quote, pol, pod, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, un_number, imo_class, has_msds, additional_services')
        .eq('id', inquiryId).is('deleted_at', null).maybeSingle();
      if (cancelled) return;
      if (e1 || !inq) { setNotFound(true); setLoading(false); return; }

      let acc = null;
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('accounts')
          .select('id, name, assigned_to, pic_name, estimated_closing_date')
          .eq('id', inq.prospect_id).maybeSingle();
        acc = data || null;
      }

      const { data: quos } = await supabase
        .from('quotations')
        .select('id, quotation_no, revision, total_amount, status, valid_until, created_at, updated_at, payment_terms_id, deleted_at')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000);

      // PRF born from this inquiry (RLS-scoped as-is — sales sees only own PRF).
      const { data: prfRows } = await supabase
        .from('prf')
        .select('id, prf_no, service_type, status, created_at, created_by, selected_offer_id, min_offers_waiver_reason')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200);

      // Batch 3C — untuk PRF berstatus QUOTED, tarik penawaran vendornya (read-only;
      // RLS prf_vendor_offers_select/prf_cost_items_select sudah mengizinkan sales
      // pembuat PRF membaca lewat EXISTS ke prf.created_by, tak perlu policy baru)
      // + total biaya per penawaran (dari prf_cost_items, dikelompokkan per offer_id).
      const quotedPrfIds = (prfRows || []).filter((p) => p.status === 'QUOTED').map((p) => p.id);
      const offersByPrf = {};
      if (quotedPrfIds.length) {
        const { data: offerRows } = await supabase
          .from('prf_vendor_offers')
          .select('id, prf_id, vendor_id, currency, pros, cons, vendor:vendors!prf_vendor_offers_vendor_id_fkey(name)')
          .in('prf_id', quotedPrfIds).is('deleted_at', null)
          .order('created_at', { ascending: true }).limit(500);
        const offerIds = (offerRows || []).map((o) => o.id);
        const totalsByOffer = {};
        if (offerIds.length) {
          const { data: costRows } = await supabase
            .from('prf_cost_items')
            .select('offer_id, amount, currency')
            .in('offer_id', offerIds).limit(2000);
          (costRows || []).forEach((r) => {
            if (!r.offer_id) return;
            const m = totalsByOffer[r.offer_id] || (totalsByOffer[r.offer_id] = {});
            const cur = r.currency || 'IDR';
            m[cur] = (m[cur] || 0) + (Number(r.amount) || 0);
          });
        }
        (offerRows || []).forEach((o) => {
          if (!offersByPrf[o.prf_id]) offersByPrf[o.prf_id] = [];
          offersByPrf[o.prf_id].push({
            id: o.id,
            vendorName: o.vendor?.name || '—',
            currency: o.currency,
            totals: totalsByOffer[o.id] || {},
            pros: o.pros,
            cons: o.cons,
          });
        });
      }
      const prfsAugmented = (prfRows || []).map((p) => (
        p.status === 'QUOTED' ? { ...p, vendorOffers: offersByPrf[p.id] || [] } : p
      ));

      let acts = [];
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('activities')
          .select('id, type, status, notes, outcome, contact_name, prospect_name, scheduled_for, created_at')
          .eq('account_id', inq.prospect_id).is('deleted_at', null)
          .order('created_at', { ascending: false }).limit(5);
        acts = data || [];
      }

      // resolve profile names (assigned_to, created_by, owner_id)
      const pIds = [...new Set([acc?.assigned_to, inq.created_by, inq.owner_id].filter(Boolean))];
      const pMap = {};
      if (pIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', pIds).limit(1000);
        (profs || []).forEach((p) => { pMap[p.id] = p.full_name; });
      }

      // resolve payment terms names
      const tIds = [...new Set((quos || []).map((q) => q.payment_terms_id).filter(Boolean))];
      const tMap = {};
      if (tIds.length) {
        const { data: terms } = await supabase.from('payment_terms').select('id, name').in('id', tIds).limit(1000);
        (terms || []).forEach((t) => { tMap[t.id] = t.name; });
      }

      if (cancelled) return;
      setInquiry(inq);
      setAccount(acc);
      setQuotations(quos || []);
      setPrfs(prfsAugmented);
      setActivities(acts);
      setProfMap(pMap);
      setTermMap(tMap);
      setLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setNotFound(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [inquiryId, reloadKey]);

  /* Quotation AKTIF milik inquiry ini — ujung rantai versi, lewat helper bersama.
     Menggantikan sumbu `updated_at` yang dipakai sebelumnya. Sumbu itu kini
     SALAH: create_quotation_revision menyentuh `updated_at` baris LAMA (saat
     menandainya SUPERSEDED), sehingga versi yang sudah digantikan bisa terlihat
     "paling baru" dan justru versi aktifnya yang tersembunyi.

     Definisinya sengaja SATU dengan yang dipakai QuotationDetailPage dan
     QuotationFormPage — tiga tempat menghitung "aktif" sendiri-sendiri adalah
     cara paling pasti untuk melenceng. */
  const activeQuotation = useMemo(() => pickActiveQuotation(quotations), [quotations]);

  // Rincian Harga — SATU query tambahan setelah identitas quotation-terbaru diketahui
  // (bukan N+1: tidak fetch item untuk quotation lain di daftar). Di-key ke id saja,
  // supaya tidak fetch ulang kalau quotation-terbaru tak berganti (mis. refetch() akibat
  // Pindah Stage / aksi lain di halaman ini).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!activeQuotation?.id) { setActiveQuotationItems([]); return undefined; }
    let cancelled = false;
    setActiveItemsLoading(true);
    supabase
      .from('quotation_items')
      .select('id, sort_order, group_name, description, currency, cost_price, unit_price, unit_label, qty, exchange_rate, total, notes, if_any')
      .eq('quotation_id', activeQuotation.id)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) showToast?.('Failed to load price breakdown: ' + error.message, 'error');
        setActiveQuotationItems(data || []);
        setActiveItemsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeQuotation?.id, showToast]);

  // Sumbu deal untuk StatusBar. Dinormalkan sekali di sini supaya render, banner
  // langkah berikutnya, dan gate penutupan membaca nilai yang sama.
  const dealStatus = String(inquiry?.status || 'OPEN').toUpperCase();
  // Badge angka di label tab PRF = PRF yang MENUNGGU TINDAKAN SALES saja.
  // "Not active" (CANCELLED/EXPIRED) dan "Awaiting procurement" sengaja tak
  // dihitung — badge yang menghitung semuanya cuma mengulang jumlah baris.
  const prfNeedsSelectionCount = prfs.filter((p) => prfReadinessKey(p) === 'needs').length;
  // Cetak PRF — cek SELURUH role aktif (erpRoles), bukan erpRole (role primer).
  // User multi-role (mis. manager+sales) sebelumnya kehilangan tombol ini karena
  // role prioritas lebih tinggi menutupi 'sales' di erpRole. Cermin RLS prf_insert.
  const canCreatePRF = erpRoles?.some((r) => ['sales', 'gm_bd', 'super_admin'].includes(r.roles?.code));
  // Kolom penugasan KEDUA di `accounts` (kembaran `assigned_to`) DIPENSIUNKAN
  // 8 Sep 2026. Diukur di produksi: dari 1.211 akun hidup, NOL yang hanya punya
  // kolom kembar itu dan NOL yang isinya berbeda dari `assigned_to` — jadi
  // mencabut fallback-nya nol mengubah tampilan. Sumbu penugasan akun kini
  // `assigned_to` saja. DROP COLUMN menyusul batch terpisah.
  const assignedName = profMap[account?.assigned_to] || null;
  // Id di balik assignedName — dipakai utk buka mini profil (klik nama sales di Header).
  const assignedProfileId = account?.assigned_to || null;
  const createdByName = profMap[inquiry?.created_by] || null;
  // Orang yang diprioritaskan di dropdown @mention Chatter — SAMA PERSIS logic
  // `pIds` di effect fetch utama (:393), tapi diturunkan ulang di scope render dari
  // state `account`/`inquiry` (effect itu pakai `acc`/`inq` lokal, tak bisa diakses
  // dari sini).
  const priorityUserIds = [...new Set([account?.assigned_to, inquiry?.created_by].filter(Boolean))];
  // Aksi "Tandai Kalah" hanya untuk status yang belum terminal (default 'OPEN' bila
  // kolomnya kosong). WON / LOST / CANCELLED → tombolnya tidak dirender sama sekali.
  const canMarkLost = LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase());
  // B3 — gate dua aksi baru. Penegak izin sebenarnya tetap RLS inquiries_update;
  // ini murni lapis UI (fail-closed: status tak dikenal -> tombol tak dirender).
  const canCancel = CANCELLABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase());

  /* Ganti pemilik deal — DUA syarat.
     (1) Status masih di Pipeline. Sengaja memakai ulang LOSABLE_INQUIRY_STATUS:
         "masih terbuka" harus punya SATU definisi di file ini, bukan daftar
         keempat yang bisa melenceng sendiri. Begitu WON/LOST/CANCELLED,
         kepemilikan terkunci demi integritas Sales Performance & Win Rate
         historis (keputusan Den 30 Agu 2026).
     (2) Manager-ke-atas SAJA (keputusan Den 30 Agu 2026: mengoper deal adalah
         aksi manager-ke-atas). Sengaja BUKAN pemilik-atau-manager, walau USING
         policy `inquiries_update` meloloskan pemilik: WITH CHECK policy yang
         sama juga berbasis owner_id, jadi begitu seorang sales pemilik mencoba
         mengoper deal keluar, baris hasilnya tak lagi lolos WITH CHECK miliknya
         sendiri dan tulisannya ditolak. Menampilkan tombolnya untuk sales cuma
         akan menghasilkan tombol yang gagal saat diklik.
         Ini lapis UI; penegak sebenarnya tetap RLS, plus trigger DB
         `trg_z_lock_inquiry_owner` yang mengunci owner_id sesudah status closed. */
  const canReassignOwner =
    LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase())
    && MANAGER_OR_ABOVE.includes(erpRole);
  const ownerName = profMap[inquiry?.owner_id] || null;

  // ── Task 4 — tandai INQUIRY kalah. Menulis inquiries.status + lost_reason SAJA;
  // accounts TIDAK disentuh sama sekali (lifecycle akun hanya naik, tak pernah turun).
  // ⚠️ Tandingan "Tandai Menang" SUDAH DICABUT 8 Sep 2026 (blueprint §6: arah maju
  // digerakkan dokumen). WON kini hanya lahir dari trigger set_inquiry_won_on_so
  // saat Sales Order berstatus SENT. RPC mark_inquiry_won sengaja DIBIARKAN HIDUP
  // di DB — nol pemanggil dari FE, pencabutannya milik batch berikutnya.
  async function markInquiryLost(values) {
    if (!inquiry?.id) return;
    const prevStatus = inquiry.status || 'OPEN';
    setLossSaving(true);
    // B3: menulis loss_reason_id (master), BUKAN lost_reason (teks bebas).
    // Kolom lama sengaja dibiarkan kosong ke depannya — sudah disupersedi
    // (lihat COMMENT kolomnya di migrasi 20260828000002); drop-nya menyusul
    // di batch pembersihan terpisah.
    // closed_at/closed_by TIDAK dikirim dari sini: trigger
    // trg_z_stamp_inquiry_closure yang menstempelnya, dan COALESCE di sana
    // membuat nilai kiriman FE menang bila suatu saat memang perlu dikirim.
    const { error } = await supabase
      .from('inquiries')
      .update({
        status: 'LOST',
        loss_reason_id:   values.loss_reason_id,
        competitor_name:  values.competitor_name,
        competitor_price: values.competitor_price,
      })
      .eq('id', inquiry.id);
    setLossSaving(false);
    if (error) { showToast?.('Failed to mark as Lost: ' + error.message, 'error'); return; }
    // Berjejak: ini SATU-SATUNYA jalur menandai deal kalah, dan alasannya ikut
    // menghitung win rate. Pola sama saveDealUpdate — fire-and-forget, tak memblokir.
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `${prevStatus} → LOST · reason: ${lossReasons.find(r => r.id === values.loss_reason_id)?.name || values.loss_reason_id}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setLossOpen(false);
    showToast?.('Deal marked as Lost.', 'success');
    refetch();
  }

  // ── B3: master alasan kalah. loss_reasons GLOBAL (company_id selalu NULL) —
  // ⚠️ JANGAN tambahkan .eq('company_id', ...) di sini: gotcha #18, filter itu
  // akan mengembalikan NOL BARIS tanpa error dan dropdown-nya kosong senyap.
  useEffect(() => {
    let cancelled = false;
    supabase.from('loss_reasons')
      .select('id, code, name, sort_order')
      .in('applies_to', ['deal', 'both'])
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[deal] fetch loss_reasons failed:', error.message); setLossReasons([]); return; }
        setLossReasons(data || []);
      });
    return () => { cancelled = true; };
  }, []);

  // Roster sales untuk dropdown "Ganti Pemilik" — helper bersama `./salesRoster`
  // (sales + gm_bd, resolusi lewat RBAC roles.code, scoped user_roles.company_id).
  // Sengaja TIDAK bikin query profiles sendiri: sumber daftar sales sudah satu
  // pintu di helper itu, dan menyalinnya di sini akan jadi daftar kedua yang
  // pasti melenceng.
  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    fetchOperationalRoster(profile.company_id).then((s) => { if (!cancelled) setSalesOpts(s); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  // ── B3: Batalkan deal. Alasan teks bebas (bukan master) — ini catatan
  // operasional sekali pakai, bukan taksonomi yang di-GROUP BY seperti alasan
  // kalah. closed_at/closed_by distempel trigger, sama seperti jalur LOST.
  async function markInquiryCancel(values) {
    if (!inquiry?.id) return;
    const prevStatus = inquiry.status || 'OPEN';
    setCancelSaving(true);
    const { error } = await supabase
      .from('inquiries')
      .update({ status: 'CANCELLED', cancel_reason: values.cancel_reason })
      .eq('id', inquiry.id);
    setCancelSaving(false);
    if (error) { showToast?.('Failed to cancel deal: ' + error.message, 'error'); return; }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `${prevStatus} → CANCELLED · reason: ${values.cancel_reason}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setCancelOpen(false);
    showToast?.('Deal cancelled.', 'success');
    refetch();
  }

  /* ── Revisi quotation dari tab ini ────────────────────────────────────────
     Sesudah sukses: DIAM di tab, refetch, toast. TIDAK melempar user ke form
     edit — itu menuntut prop baru dari App.jsx, dan halaman ini sengaja
     dipertahankan lepas dari perubahan routing.

     Guard status ada di RPC (hanya SENT/REJECTED yang boleh direvisi), jadi
     penolakannya sampai sebagai toast berisi pesan RPC apa adanya — bukan
     ditebak ulang di sini dengan aturan yang bisa melenceng dari DB. */
  async function createRevision() {
    if (!activeQuotation?.id) return;
    setRevising(true);
    const { error } = await supabase.rpc('create_quotation_revision', { p_quotation_id: activeQuotation.id });
    setRevising(false);
    setReviseOpen(false);
    if (error) { showToast?.('Failed to create revision: ' + error.message, 'error'); return; }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.QUOTATION,
      entityId: activeQuotation.id,
      entityLabel: formatQuotationNo(activeQuotation.quotation_no, activeQuotation.revision),
      notes: 'Revisi quotation dibuat dari Detail Deal',
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    showToast?.('Revision created as a new draft.', 'success');
    refetch();
  }

  // ── Ganti pemilik deal (owner_id). Hanya selama status masih di Pipeline;
  // sesudah closed, trigger DB `trg_z_lock_inquiry_owner` menolak perubahan
  // dengan exception — gate di sini murni lapis UI, bukan penggantinya.
  async function reassignOwner() {
    if (!inquiry?.id || !ownerDraft) return;
    if (ownerDraft === inquiry.owner_id) { setOwnerOpen(false); return; }
    const prevName = ownerName || '(empty)';
    const nextName = salesOpts.find((s) => s.id === ownerDraft)?.full_name || ownerDraft;
    setOwnerSaving(true);
    const { data, error } = await supabase
      .from('inquiries')
      .update({ owner_id: ownerDraft })
      .eq('id', inquiry.id)
      .select('id');
    setOwnerSaving(false);
    if (error) { showToast?.('Failed to change owner: ' + error.message, 'error'); return; }
    // RLS bisa menyaring baris tanpa error → 0 baris = gagal senyap (TD-161).
    if (!data || data.length === 0) {
      showToast?.('Failed to change owner: you do not have permission to modify this deal.', 'error');
      return;
    }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `Deal owner: ${prevName} → ${nextName}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setOwnerOpen(false);
    showToast?.('Deal owner updated.', 'success');
    refetch();
  }

  // ── Batch 3C — pilih/ganti penawaran vendor terpilih (prf.selected_offer_id).
  // RPC prf_select_offer boleh dipanggil berulang untuk MENGGANTI pilihan (tidak
  // ada guard yang melarangnya) — konfirmasi di sini murni UX, bukan penegak izin. ──
  async function doSelectOffer(prf, offer) {
    const prevOffer = prf.selected_offer_id
      ? (prf.vendorOffers || []).find((o) => o.id === prf.selected_offer_id)
      : null;
    const isSwitch = !!prf.selected_offer_id && prf.selected_offer_id !== offer.id;
    setOfferActionBusy(true);
    try {
      const { error } = await supabase.rpc('prf_select_offer', { p_prf_id: prf.id, p_offer_id: offer.id });
      if (error) throw error;
      logAudit(supabase, {
        action: ACTION_TYPES.SELECT_VENDOR_OFFER,
        entityType: ENTITY_TYPES.PRF,
        entityId: prf.id,
        entityLabel: prf.prf_no,
        notes: isSwitch
          ? `Selection changed: ${prevOffer?.vendorName || 'previous vendor'} (offer ${prf.selected_offer_id}) → ${offer.vendorName} (offer ${offer.id})`
          : `Vendor offer selected: ${offer.vendorName} (offer ${offer.id})`,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.('Vendor offer selected.', 'success');
      refetch();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setOfferActionBusy(false);
    }
  }

  function handleSelectOffer(prf, offer) {
    if (prf.selected_offer_id && prf.selected_offer_id !== offer.id) {
      setOfferSwitchConfirm({ open: true, prf, offer });
    } else {
      doSelectOffer(prf, offer);
    }
  }

  // ── loading / not-found ──
  if (loading) {
    return (
      <div style={{ margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textFaint, fontFamily: BODY }}>
        <Loader2 size={30} className="dd-spin" />
        <div style={{ fontSize: 13.5 }}>Loading deal details…</div>
        <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>
      </div>
    );
  }
  if (notFound || !inquiry) {
    return (
      <div style={{ margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textMute, fontFamily: BODY }}>
        <AlertCircle size={30} color={C.red} />
        <div style={{ fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: C.text }}>Deal not found</div>
        <button onClick={onBack} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ChevronLeft size={15} />Back</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 24px 48px', fontFamily: BODY, color: C.text }}>
      {/* .cd-tab:hover di sini SUPAYA hover tab konsisten dengan CustomerDetailPage —
          Tab (dari DealPanels.jsx) sama-sama merender className="cd-tab" di kedua
          halaman, tapi rule hover-nya sendiri hanya hidup di mana pun <style> ini
          dirender (CustomerDetailPage punya rule identik di file-nya sendiri). */}
      <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}.cd-tab:hover{color:${C.navy};}.dd-account-name:hover{text-decoration:underline;}`}</style>

      {/* Batch B1 — seluruh halaman dibungkus FormSheet. Grid dua kolomnya
          (1.7fr/1fr, header membentang penuh) + collapse di bawah 1024px lewat
          `.nx-grid-2`/`.nx-stack` datang dari kit, jadi wrapper `.nx-stack`
          lokal yang dulu ada di sini dicabut — nol CSS baru, nol duplikasi.
          Chatter masuk slot `aside` (DI LUAR `children`), sehingga ia menetap
          saat tab di body berganti. */}
      <FormSheet
        breadcrumb={<Breadcrumb onBack={onBack} />}
        title={<DealTitle name={account?.name} accountId={account?.id} onViewCustomer={onViewCustomer} />}
        docNo={inquiry.inquiry_no}
        /* Slot `actions` SENGAJA KOSONG sejak 8 Sep 2026. Isinya dulu
           DealHeaderControls (angka DEAL VALUE + Edit Deal + Move Stage) — ketiganya
           menulis ke `accounts`, dan ketiganya dicabut: perpindahan status kini
           digerakkan DOKUMEN (blueprint §6), sehingga Move Stage & Edit Deal
           kehilangan alasan keberadaannya. Komponennya TETAP HIDUP di DealPanels —
           CustomerDetailPage masih memakainya; yang berhenti cuma pemanggilan dari
           halaman ini.
           Baris aksi INQUIRY — kini LIMA tombol — tetap di slot `toolbar` (selebar
           dokumen) dan BUKAN di `children`: diukur di browser, baris ini butuh
           ~986px saat masih tujuh tombol sementara kolom kiri cuma ~766px. Blok
           destruktif (Mark as Lost + Cancel Deal) didorong ke kanan lewat
           `marginLeft:auto`. */
        toolbar={(onEditInquiry || canMarkLost || canCancel || canReassignOwner) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {onEditInquiry && (
            <button onClick={onEditInquiry} style={ACT_BTN}>
              <Pencil size={14} />Edit Inquiry
            </button>
          )}
          {canReassignOwner && (
            <button
              onClick={() => { setOwnerDraft(inquiry.owner_id || ''); setOwnerOpen((v) => !v); }}
              style={{ ...ACT_BTN, background: ownerOpen ? C.navySoft : '#fff' }}>
              <UserCog size={14} />Change Owner
            </button>
          )}
          {(canMarkLost || canCancel) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {canMarkLost && (
                <button onClick={() => setLossOpen(true)} style={{ ...ACT_BTN, border: `1px solid ${C.redBd}`, color: C.red }}>
                  <XCircle size={14} />Mark as Lost
                </button>
              )}
              {canCancel && (
                <button onClick={() => setCancelOpen(true)} style={{ ...ACT_BTN, color: C.textMute }}>
                  <Ban size={14} />Cancel Deal
                </button>
              )}
            </div>
          )}
          </div>
        )}
        meta={(
          <HeaderMeta
            assignedName={assignedName}
            assignedProfileId={assignedProfileId}
            onViewProfile={onViewProfile}
            createdAt={inquiry.created_at}
            closeDate={account?.estimated_closing_date}
          />
        )}
        /* Sumbu deal yang SAH = `inquiries.status`, bukan sumbu stage lama di
           `accounts` (yang dulu dirender DealStepper di sini). Tahap terakhir yang pernah dicapai
           oleh deal LOST/CANCELLED sengaja TIDAK ditebak: riwayatnya cuma ada di
           `inquiry_status_history`, dan menyimpulkannya
           dari keberadaan quotation adalah jawaban separuh — keempat segmennya
           dibiarkan "belum", penanda penutupan di kanan yang membawa maknanya.
           WON menutup dengan `done` sehingga keempatnya tercentang.
           ⚠️ Komentar ini SEMPAT menyebut `inquiry_status_history` "staging-only
           (TD-225)". Sudah TIDAK BERLAKU: tabel + trigger `trg_z_log_inquiry_status_change`
           LIVE di produksi sejak 7 Sep 2026 (migrasi `20260828000001`). Dikoreksi
           8 Sep 2026. Yang masih berlaku: isinya baru terisi sejak tanggal itu,
           jadi deal lama tetap tak punya jejak transisi. */
        status={(
          <>
            <StatusBar
              stages={DEAL_STAGE_SEGMENTS}
              current={dealStatus}
              closed={DEAL_CLOSED_STATUS.includes(dealStatus) ? { stage: dealStatus, label: dealStatus } : null}
            />
            <NextStepHint status={dealStatus} />
          </>
        )}
        aside={(
          <InquiryChatter
            inquiryId={inquiry.id}
            companyId={profile?.company_id}
            inquiryNo={inquiry.inquiry_no}
            priorityUserIds={priorityUserIds}
            showToast={showToast}
          />
        )}
      >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Primary view — SELALU tampil, bukan bagian dari tab (koreksi struktur: sesuai
          referensi Odoo, field utama tak boleh hilang saat pindah tab). Tab bar 3 tab
          (Aktivitas/Quotation/PRF) ada DI BAWAH kartu ini, bukan di atasnya. */}
      <Card
        title="Deal Detail"
        icon={<FileText size={17} />}
      >
        {/* Panel ganti pemilik — inline, muncul tepat di bawah tombolnya. Aksi
            ini cuma satu dropdown, jadi modal penuh (pola Tandai Kalah/Batalkan)
            terlalu berat untuknya. */}
        {canReassignOwner && ownerOpen && (
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 11, border: `1px solid ${C.border}`, background: C.navySoft }}>
            <div style={{ fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
              Change Deal Owner
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={ownerDraft}
                onChange={(e) => setOwnerDraft(e.target.value)}
                style={{ flex: '1 1 220px', height: 34, padding: '0 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', fontFamily: BODY, fontSize: 13, color: C.text }}
              >
                <option value="">— Select Salesperson —</option>
                {salesOpts.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
              <button
                onClick={reassignOwner}
                disabled={ownerSaving || !ownerDraft}
                style={{ height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.navy}`, background: C.navy, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 700, cursor: (ownerSaving || !ownerDraft) ? 'not-allowed' : 'pointer', opacity: (ownerSaving || !ownerDraft) ? 0.6 : 1 }}>
                {ownerSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setOwnerOpen(false)}
                style={{ height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#fff', color: C.textMute, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 11.5, color: C.textMute, lineHeight: 1.5 }}>
              Ownership is permanently locked once the deal reaches WON, LOST, or CANCELLED —
              so historical Sales Performance and Win Rate figures stay intact.
            </div>
          </div>
        )}

        {/* Rute — SATU baris penuh di paling atas kartu, dipisah garis. Bukan dua
            field biasa: POL→POD adalah identitas shipment, bukan atribut setara
            HS Code. Panah menggantikan ikon Anchor/MapPin yang dulu dipakai. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={GRP_MICRO}>POL — Port of Loading</div>
            <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 18, color: C.navy }}>{inquiry.pol || '—'}</div>
          </div>
          <ArrowRight size={26} color={C.orange} style={{ flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
            <div style={GRP_MICRO}>POD — Port of Discharge</div>
            <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 18, color: C.navy }}>{inquiry.pod || '—'}</div>
          </div>
        </div>

        {/* Field dikelompokkan bersubjudul, mengalir dua kolom. Grid ini disusun
            LOKAL, bukan ditambahkan ke kit: bentuknya (kelompok yang mengalir,
            bukan field yang mengalir) baru punya satu pemakai — konsolidasi ke
            v3/kit menunggu Quotation/PRF Detail ikut dimigrasi. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
          {FIELD_GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: 22 }}>
              <div style={GRP_TITLE}>{g.title}</div>
              {g.fields(inquiry, { createdByName, ownerName }).map((f) => (
                <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: `1px solid ${C.surfaceAlt}` }}>
                  <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, flex: 'none', width: 150 }}>{f.label}</span>
                  {f.pills ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
                      {(f.value || []).length === 0
                        ? <span style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint }}>—</span>
                        : f.value.map((v) => (
                          <span key={v} style={{ fontFamily: BODY, fontSize: 11.5, background: C.navySoft, color: C.navy, borderRadius: 999, padding: '2px 10px', fontWeight: 500 }}>{v}</span>
                        ))}
                    </div>
                  ) : (
                    <span style={{ fontFamily: f.mono ? FONT_MONO : BODY, fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right', flex: 1 }}>
                      {f.value == null || f.value === '' ? '—' : f.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 4, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ ...GRP_TITLE, marginBottom: 8 }}>Notes</div>
          <p style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.6, color: C.text, margin: 0 }}>{inquiry.notes || '—'}</p>
        </div>
      </Card>

      {/* Tiga tab pindah ke Notebook (kit v3). Badge angka di label PRF dioper
          sebagai NODE lewat prop `label` — Notebook merender `{t.label}` apa
          adanya, jadi kontraknya tak perlu disentuh sama sekali. Angkanya =
          jumlah PRF ber-kesiapan "Needs selection", yaitu yang benar-benar
          menunggu tindakan sales; PRF "Not active" sengaja tak ikut dihitung. */}
      <Notebook
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'aktivitas',
            label: 'Activity',
            render: () => (
              <Card title="Related Activity" icon={<ListChecks size={17} />}>
                {activities.length === 0 ? (
                  <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>No activity recorded for this deal yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {activities.map((a) => {
                      const AIcon = ACT_ICON[a.type] || ListChecks;
                      return (
                        <div key={a.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                          <span style={{ width: 32, height: 32, borderRadius: 9, background: C.navySoft, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><AIcon size={15} /></span>
                          <div style={{ minWidth: 0, flex: 1, display: 'flex', gap: 12 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontFamily: BODY, fontSize: 13.5, fontWeight: 600, color: C.text }}>
                                {(a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1) : 'Activity')}{a.contact_name ? ` · ${a.contact_name}` : ''}
                              </div>
                              {(a.notes || a.outcome) && <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute, lineHeight: 1.4 }}>{a.notes || a.outcome}</div>}
                            </div>
                            <span style={{ fontFamily: BODY, fontSize: 11.5, color: C.textFaint, flex: 'none' }}>{fmtDate(a.created_at)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            ),
          },
          {
            id: 'quotation',
            label: 'Quotation',
            render: () => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* `onSearch` sengaja TIDAK dioper: daftar quotation satu deal
                    isinya sedikit, dan sejak guard baru di ListView, kotak
                    pencarian memang tak dirender kalau tak disediakan.

                    Tombol di slot `right` BERUBAH BENTUK, bukan bertambah.
                    Sejak nomor quotation diturunkan dari nomor inquiry, inquiry
                    yang sudah punya quotation TIDAK BISA lagi melahirkan
                    quotation kedua (UNIQUE quotation_no+revision) — yang kedua
                    memang seharusnya REVISI. Menyodorkan "Create Quotation" di
                    sana berarti menawarkan jalan buntu. */}
                <ListView
                  mode="table"
                  rows={quotations}
                  onRowClick={onViewQuotation}
                  emptyTitle="No quotations yet"
                  emptySub="Quotations created from this deal will appear here."
                  right={activeQuotation ? (
                    <button onClick={() => setReviseOpen(true)} disabled={revising}
                      style={{ ...ACT_BTN, background: C.orange, border: `1px solid ${C.orange}`, color: '#fff', cursor: revising ? 'not-allowed' : 'pointer', opacity: revising ? 0.6 : 1 }}>
                      <FileText size={14} />{revising ? 'Working…' : 'Create Revision'}
                    </button>
                  ) : (
                    <button onClick={() => onCreateQuotation(inquiryId)} style={{ ...ACT_BTN, background: C.orange, border: `1px solid ${C.orange}`, color: '#fff' }}>
                      <FileText size={14} />Create Quotation
                    </button>
                  )}
                  columns={QUOTATION_COLUMNS}
                />
                {activeQuotation && (
                  <QuotationItemsCard quotation={activeQuotation} items={activeQuotationItems} loading={activeItemsLoading} />
                )}
                <PriceSummaryCard quotations={quotations} termMap={termMap} />
              </div>
            ),
          },
          {
            id: 'prf',
            label: (
              <>
                PRF
                {prfNeedsSelectionCount > 0 && (
                  <span style={{ marginLeft: 6, background: C.orange, color: '#fff', fontFamily: HEAD, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>
                    {prfNeedsSelectionCount}
                  </span>
                )}
              </>
            ),
            render: () => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <ListView
                  mode="table"
                  rows={prfs}
                  onRowClick={onViewPRF}
                  emptyTitle="No PRFs yet"
                  emptySub="PRFs raised for this deal will appear here."
                  right={canCreatePRF ? (
                    <button onClick={onCreatePRF} style={{ ...ACT_BTN, background: C.orange, border: `1px solid ${C.orange}`, color: '#fff' }}>
                      <FileText size={14} />Create PRF
                    </button>
                  ) : null}
                  columns={PRF_COLUMNS}
                />
                {/* Kartu penawaran vendor — SALINAN LOKAL dari blok di PrfListCard
                    (DealPanels.jsx). Disalin, bukan diedit di tempat, karena
                    PrfListCard masih dipakai CustomerDetailPage:1597 dan file itu
                    di luar scope batch ini. Kalau kelak PrfListCard tak lagi punya
                    pemakai kedua, dua salinan ini WAJIB disatukan. */}
                {prfs.filter((p) => String(p.status).toUpperCase() === 'QUOTED' && Array.isArray(p.vendorOffers)).map((p) => (
                  <Card key={`offers-${p.id}`} title={`Vendor Offers — ${p.prf_no}`} icon={<FileText size={17} />}>
                    {p.min_offers_waiver_reason && (
                      <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.orange, marginBottom: 10 }}>
                        Only {p.vendorOffers.length} offers. Procurement reason: {p.min_offers_waiver_reason}
                      </div>
                    )}
                    {p.vendorOffers.length === 0 ? (
                      <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textFaint }}>No vendor offers yet.</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {p.vendorOffers.map((o) => {
                          const isSelected = p.selected_offer_id === o.id;
                          const canSelect = p.created_by === profile?.id || MANAGER_OR_ABOVE.includes(erpRole);
                          return (
                            <div key={o.id} style={{ width: 240, boxSizing: 'border-box', background: '#fff', border: `${isSelected ? 2 : 1}px solid ${isSelected ? C.orange : C.border}`, borderRadius: 10, padding: '14px 16px' }}>
                              {isSelected && (
                                <div style={{ fontFamily: HEAD, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: C.orange, marginBottom: 6 }}>SELECTED BY SALES</div>
                              )}
                              <div style={{ fontFamily: HEAD, fontSize: 13, fontWeight: 700, color: C.text }}>{o.vendorName}</div>
                              <div style={{ fontFamily: BODY, fontSize: 11.5, color: C.textMute, marginTop: 2 }}>Currency: {o.currency || '—'}</div>
                              <div style={{ marginTop: 8, marginBottom: 10 }}>
                                {Object.entries(o.totals || {}).length === 0 ? (
                                  <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>No cost breakdown yet.</span>
                                ) : Object.entries(o.totals).map(([cur, v]) => (
                                  <div key={cur} style={{ fontFamily: HEAD, fontSize: 14, fontWeight: 800, color: C.navy, fontVariantNumeric: 'tabular-nums' }}>
                                    {cur} {Number(v).toLocaleString('id-ID')}
                                  </div>
                                ))}
                              </div>
                              {!isSelected && canSelect && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectOffer(p, o)}
                                  disabled={offerActionBusy}
                                  style={{ width: '100%', background: 'transparent', color: C.navy, border: `1px solid ${C.navy}`, borderRadius: 6, padding: '7px 0', fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: offerActionBusy ? 'not-allowed' : 'pointer', opacity: offerActionBusy ? 0.6 : 1 }}>
                                  {p.selected_offer_id ? 'Switch to This Offer' : 'Use This Offer'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            ),
          },
        ]}
      />
      </div>
      </FormSheet>
      {/* Ganti penawaran vendor terpilih — konfirmasi HANYA saat mengganti pilihan lama */}
      <ConfirmModal
        open={offerSwitchConfirm.open}
        variant="warning"
        title="Change Selected Offer"
        message={`Switch the selected offer to vendor ${offerSwitchConfirm.offer?.vendorName || ''}? This replaces the offer currently used for the quotation.`}
        confirmLabel="Yes, Change"
        cancelLabel="Cancel"
        onConfirm={() => {
          const { prf, offer } = offerSwitchConfirm;
          setOfferSwitchConfirm({ open: false, prf: null, offer: null });
          doSelectOffer(prf, offer);
        }}
        onCancel={() => setOfferSwitchConfirm({ open: false, prf: null, offer: null })}
      />

      {/* Tandai inquiry KALAH — alasan dari MASTER loss_reasons (B3). Field
          pesaing muncul & wajib hanya untuk kode PRICE/COMPETITOR; aturan itu
          tinggal di DealCloseModals (COMPETITOR_REQUIRED_CODES), bukan di sini. */}
      <LostReasonModal
        key={`lost-${inquiry.id}-${lossOpen}`}
        open={lossOpen}
        inquiryNo={inquiry.inquiry_no}
        reasons={lossReasons}
        saving={lossSaving}
        onSave={markInquiryLost}
        onCancel={() => setLossOpen(false)}
      />

      {/* Batalkan deal — alasan teks bebas (B3). */}
      <CancelReasonModal
        key={`cancel-${inquiry.id}-${cancelOpen}`}
        open={cancelOpen}
        inquiryNo={inquiry.inquiry_no}
        saving={cancelSaving}
        onSave={markInquiryCancel}
        onCancel={() => setCancelOpen(false)}
      />

      {/* Revisi quotation — konfirmasi polos. Perlu konfirmasi karena akibatnya
          menyentuh DUA baris sekaligus: versi lama jadi SUPERSEDED dan versi
          baru lahir. Ditutup di dalam handler supaya tombol "Ya" tak bisa
          diklik dobel. */}
      <ConfirmModal
        open={reviseOpen}
        variant="info"
        title="Create Revision"
        message={activeQuotation
          ? `Create the next version of ${formatQuotationNo(activeQuotation.quotation_no, activeQuotation.revision)}? `
            + 'The current version will be marked SUPERSEDED and a new draft will be created with the same items.'
          : ''}
        confirmLabel={revising ? 'Working…' : 'Yes, Create Revision'}
        cancelLabel="Cancel"
        onConfirm={createRevision}
        onCancel={() => setReviseOpen(false)}
      />
    </div>
  );
}
