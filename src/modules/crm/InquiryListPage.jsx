// src/modules/crm/InquiryListPage.jsx
// Putaran 7 -- rebuild halaman 1.2.4 "Inquiry Status & History" agar identik
// mockup design-handoff/mockup/Inquiry Management.dc.html (data-screen-label
// "Status/Filters" + "Status/Table", dibaca utuh termasuk renderVals() --
// bukan screenshot). Keputusan Den (RENCANA PUTARAN 7, koreksi 1-16) dirujuk
// per-komentar di titik yang relevan.
//
// ListView (v3/ListView.jsx) DICABUT dari halaman ini -- mekanismenya
// (savedViews single-select) tidak bisa merepresentasikan Status
// multi-select mockup. Dibangun bespoke, pola sama InquiryClassificationPage.jsx
// (grid CSS tangan, bukan komponen daftar generik) -- komponen ListView.jsx
// sendiri TIDAK disentuh, 3 pemakai lain (PipelineKanbanPage/DealDetailPage/
// demo) nol dampak.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, FileText, FileCheck, Download, ChevronDown, ArrowUpRight, ArrowDownLeft, Truck } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabase';
import { getTodayWIB } from '../../lib/dateUtils';
import { useAuth } from '../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole, isManagerOrAbove } from '../../lib/roles';
import InquiryPDF from './InquiryPDF';
import { STATUS_LABEL, RADIUS } from './v3/tokens';
import { fetchOperationalRoster } from './salesRoster';
import { isWonAwaitingSalesOrder, WON_MANUAL_REASONS } from './inquiryOptions';
import { C } from './inquiryTheme';

// Warna badge status — palet TINTED (mockup Claude Design). Teksnya dirujuk dari
// STATUS_LABEL (v3/tokens.js) yang dipakai bareng papan Pipeline — jangan tulis
// ulang teksnya di sini, itu yang dulu bikin dua peta melenceng.
//
// Hex ditulis literal, BUKAN lewat palet C, karena tujuh pasangan ini datang dari
// mockup sebagai satu set utuh; menyalurkannya lewat C berarti mengubah token yang
// juga dipakai kolom lain di file ini (Payment Term, Service Type) yang TIDAK ikut
// diredesain.
//
// ⚠️ Dua nilai SENGAJA menyimpang dari mockup demi kontras AA 4.5:1 (teks 11.5px =
// normal text): In Review #9C6B12→#916312 (4.11→4.66) dan Negotiation #C1440E→
// #B53F0D (4.30→4.79). Jangan "dikembalikan" ke hex mockup.
const STATUS_META = {
  OPEN:        { label: STATUS_LABEL.OPEN,        bg: '#E4EEF7', color: '#1D5A96', bd: '#BCD0E4' },
  IN_REVIEW:   { label: STATUS_LABEL.IN_REVIEW,   bg: '#FBF0DD', color: '#916312', bd: '#E6D4B4' },
  QUOTED:      { label: STATUS_LABEL.QUOTED,      bg: '#EEEAF6', color: '#5B4A96', bd: '#D1CAE3' },
  NEGOTIATION: { label: STATUS_LABEL.NEGOTIATION, bg: '#FDE7DB', color: '#B53F0D', bd: '#EFC5B2' },
  WON:         { label: STATUS_LABEL.WON,         bg: '#E1E9F2', color: '#144682', bd: '#B8C8DC' },
  LOST:        { label: STATUS_LABEL.LOST,        bg: '#FBE7E5', color: '#B33A2E', bd: '#EDC4C0' },
  CANCELLED:   { label: STATUS_LABEL.CANCELLED,   bg: '#EDEBE7', color: '#6B6459', bd: '#D3D0CB' },
};

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight Forwarding',
  customs:            'Customs Clearance',
  trading:            'General Trading',
  door_to_door:       'Door to Door', // dropdown_options seed Putaran 4 (20261025000004) -- label tampilan saja.
};

const DIRECTION_OPTIONS = ['Import', 'Export', 'Domestic'];
const FILTER_DIRECTIONS = [
  { value: 'all', label: 'All Directions' },
  ...DIRECTION_OPTIONS.map((d) => ({ value: d, label: d })),
  { value: 'not_set', label: 'Not set' },
];

// Mockup: select Inquiry Type "All"/"Single Shipment"/"Rate Sheet" (label
// mockup, bukan "Rate Sheet Request") -- value riil tetap inquiries.inquiry_type
// = 'Rate Sheet Request' (CHECK constraint, lihat verifikasi skema staging).
const FILTER_INQUIRY_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'Single Shipment', label: 'Single Shipment' },
  { value: 'Rate Sheet Request', label: 'Rate Sheet' },
];

// Urutan kanonik 7 status (progresi mockup STALL). Dipakai checklist
// multi-select DAN perhitungan chip/count.
const STATUS_ORDER = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED'];
// Grup "open" -- default stSel mockup (OPEN const di renderVals()).
const OPEN_STATUSES = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];

const PAGE_SIZE = 20;

/* Gate toggle My/All = isManagerOrAbove() di src/lib/roles.js (berbasis roles.level,
   cermin RLS is_manager_or_above()) — bukan lagi daftar role lokal.

   Kenapa digerbang sama sekali: policy `inquiries_read` sudah membatasi user
   non-manager ke `owner_id = auth.uid()`, jadi bagi mereka "All" dan "My"
   mengembalikan baris yang PERSIS SAMA — dua tombol satu hasil. Toggle-nya
   DISEMBUNYIKAN, bukan di-disable: kontrol yang tak pernah mengubah apa pun
   lebih membingungkan daripada tak ada sama sekali.

   Filter Owner & Entity memakai gate yang SAMA (mockup: isMgmt/multi) --
   RENCANA PUTARAN 7 koreksi #11. */

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Umur inquiry = jumlah hari sejak created_at s/d hari ini (BUKAN lama di status —
// kolomnya created_at, bukan penanda perubahan status; accounts/inquiries tak punya
// kolom itu). null → tak bisa dihitung.
function ageDays(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Dipakai ratesInfo() (Rates badge, koreksi C.6/#12) -- "Requested {N}d".
// Fungsi level-modul (seperti ageDays di atas), BUKAN dipanggil Date.now()
// langsung dari dalam komponen -- React Compiler menolak "impure function"
// (Date.now/new Date) yang dipanggil LANGSUNG di badan komponen/closure
// bersarang di dalamnya; fungsi level-modul terpisah tidak ditelusuri.
function daysSince(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

/* ── Preset filter Deadline Quote ──────────────────────────────────────────
   `deadline_quote` bertipe `date` (bukan timestamptz), jadi pembandingnya cukup
   string 'YYYY-MM-DD' — tak ada konversi zona di sisi query. Yang TETAP wajib
   WIB adalah "hari ini": getTodayWIB(), BUKAN toISOString(), yang antara
   00:00-06:59 WIB mengembalikan tanggal KEMARIN (lihat src/lib/dateUtils.js).

   ⚠️ "Due this week/month" dihitung dari HARI INI sampai akhir periode, bukan
   dari awal periode. */
const DEADLINE_PRESETS = [
  { id: 'all',     label: 'Any Deadline'   },
  { id: 'overdue', label: 'Overdue'        },
  { id: 'week',    label: 'Due this week'  },
  { id: 'month',   label: 'Due this month' },
  { id: 'none',    label: 'No deadline'    },
];

// Mockup: select Created Date "Last 30 days"/"This month"/"Last month"/"Custom".
// "Custom" mockup sendiri jatuh ke sentinel '2000-01-01' (nol date-range picker
// ganda di markup) -- diperlakukan sebagai "All time" (nol batas bawah), bukan
// ditafsirkan jadi widget baru yang tak ada di mockup.
const CREATED_DATE_PRESETS = [
  { id: 'last_30d',   label: 'Last 30 days' },
  { id: 'this_month', label: 'This month'   },
  { id: 'last_month', label: 'Last month'   },
  { id: 'custom',     label: 'Custom'       },
];

// Aritmetika tanggal murni di atas string 'YYYY-MM-DD'. Date lokal dipakai TANPA
// komponen jam lalu diformat balik jadi string; nilainya tak pernah dipakai
// sebagai timestamp, sehingga zona mesin tak bisa menggesernya.
function shiftDay(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function endOfWeekWIB(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();      // 0=Minggu … 6=Sabtu
  return shiftDay(ymd, dow === 0 ? 0 : 7 - dow);
}
function endOfMonthWIB(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();        // hari ke-0 bulan berikutnya
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
function startOfMonthWIB(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
function startOfLastMonthWIB(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function endOfLastMonthWIB(ymd) {
  return shiftDay(startOfMonthWIB(ymd), -1);
}
// `created_at` bertipe timestamptz (BEDA dari deadline_quote yang `date`) --
// membandingkannya ke string 'YYYY-MM-DD' polos akan di-cast Postgres ke
// tengah malam UTC, bukan WIB (kelas bug yang sama persis dengan alasan
// getTodayWIB() ada). Offset +07:00 eksplisit menjaga batasnya tetap tengah
// malam WIB, terlepas dari timezone sesi koneksi DB.
function wibMidnightISO(ymd) {
  return `${ymd}T00:00:00+07:00`;
}

function applyDeadlineFilter(query, preset, today) {
  if (preset === 'overdue') return query.lt('deadline_quote', today);
  if (preset === 'week')    return query.gte('deadline_quote', today).lte('deadline_quote', endOfWeekWIB(today));
  if (preset === 'month')   return query.gte('deadline_quote', today).lte('deadline_quote', endOfMonthWIB(today));
  if (preset === 'none')    return query.is('deadline_quote', null);
  return query;
}

function applyCreatedDateFilter(query, preset, today) {
  if (preset === 'last_30d')   return query.gte('created_at', wibMidnightISO(shiftDay(today, -30)));
  if (preset === 'this_month') return query.gte('created_at', wibMidnightISO(startOfMonthWIB(today)));
  if (preset === 'last_month') {
    return query
      .gte('created_at', wibMidnightISO(startOfLastMonthWIB(today)))
      .lt('created_at', wibMidnightISO(shiftDay(endOfLastMonthWIB(today), 1)));
  }
  return query; // 'custom' -> nol batas (All time), ikut sentinel mockup.
}

// Inquiry Type "Single Shipment" mencakup NULL -- kolom ini baru lahir
// Putaran 4 (migrasi 20261025000002); baris lama sebelum kolom ada tak
// pernah diisi 'Rate Sheet Request', jadi NULL = Single Shipment implisit,
// bukan "belum terklasifikasi".
function applyInquiryTypeFilter(query, value) {
  if (value === 'Single Shipment') return query.or('inquiry_type.is.null,inquiry_type.eq.Single Shipment');
  if (value === 'Rate Sheet Request') return query.eq('inquiry_type', 'Rate Sheet Request');
  return query;
}

// Pencarian dua-langkah (RENCANA PUTARAN 7 koreksi #6): `accountIds` = hasil
// pencarian nama akun (lihat effect di komponen). Karakter `,()` dicabut dari
// term sebelum disisipkan ke string `.or()` PostgREST -- bukan proteksi SQLi
// (PostgREST, bukan SQL mentah), tapi mencegah term berisi koma/kurung
// merusak sintaks `.or()` itu sendiri.
function applySearchFilter(query, term, accountIds) {
  if (!term) return query;
  const safe = term.replace(/[,()]/g, '');
  if (!safe) return query;
  if (accountIds.length) {
    const idList = accountIds.join(',');
    return query.or(`inquiry_no.ilike.%${safe}%,prospect_id.in.(${idList}),customer_id.in.(${idList})`);
  }
  return query.ilike('inquiry_no', `%${safe}%`);
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.OPEN;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontFamily: "Montserrat, sans-serif",
      padding: '2px 9px', borderRadius: RADIUS.sm, fontSize: 11.5, fontWeight: 700, lineHeight: 'normal',
      border: `1px solid ${m.bd}`,
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  );
}

function SubBadge({ children, tone = 'warn' }) {
  const t = tone === 'warn'
    ? { bg: C.warnBg, color: C.warn, bd: C.warnBd }
    : { bg: C.lineSoft, color: C.inkSoft, bd: C.line };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "Montserrat, sans-serif",
      padding: '2px 9px', borderRadius: RADIUS.sm, fontSize: 11.5, fontWeight: 700, lineHeight: 'normal',
      whiteSpace: 'nowrap', border: `1px solid ${t.bd}`, background: t.bg, color: t.color,
    }}>
      {children}
    </span>
  );
}

function InquiryDetailModal({ inquiry, onClose }) {
  if (!inquiry) return null;
  const m = STATUS_META[inquiry.status] || STATUS_META.OPEN;

  const Field = ({ label, value, full }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: value ? C.ink : C.inkFaint, fontStyle: value ? 'normal' : 'italic' }}>{value || '—'}</div>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 20, maxWidth: 620, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: `1px solid ${C.line}` }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6 }}>DETAIL INQUIRY</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 10, letterSpacing: -0.5 }}>
                {inquiry.inquiry_no || '—'}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 12px', borderRadius: RADIUS.sm, fontFamily: "Montserrat, sans-serif", fontSize: 11.5, fontWeight: 700, lineHeight: 'normal', border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>
                {m.label}
              </span>
            </div>
            <button onClick={onClose} style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={C.inkSoft} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px 28px' }}>
          <Section title="Informasi Inquiry">
            <Field label="Service Type" value={SERVICE_TYPE_LABELS[inquiry.service_type] || inquiry.service_type} />
            <Field label="Status"       value={m.label} />
            <Field label="Route"        value={inquiry.route} />
            <Field label="Created At"   value={fmtDate(inquiry.created_at)} />
          </Section>

          <Section title="Customer / Prospect">
            <Field label="Nama" value={inquiry.prospect?.name || inquiry.customer?.name} full />
          </Section>

          <Section title="Detail Kargo">
            <Field label="Nama Barang"      value={inquiry.goods_name} />
            <Field label="Estimated Volume" value={inquiry.estimated_volume} />
          </Section>

          {inquiry.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.lineSoft}` }}>Notes</div>
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', background: C.surface2, borderRadius: 8, padding: '10px 14px' }}>{inquiry.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// `presetOwnerId`/`presetStatus` -- Putaran 3 Tahap 3B: deviasi sementara
// yang jadi tujuan AKHIR mockup ("halaman 1.2.4 tersendiri") sejak Putaran 7
// membangun halaman ini identik mockup -- komentar basi lama dicabut.
// Pemanggil: InquiryListRoute (crm.routes.jsx) dari location.state, dikirim
// Team Workload (InquiryOwnerAssignmentPage.jsx, Putaran 8 -- tidak disentuh).
// `presetStatus` kini men-seed ARRAY `stSel` (bukan string `filterStatus`
// tunggal) -- penyesuaian tipe murni, semantik "satu status awal" tetap sama.
export default function InquiryListPage({ onAddInquiry, onSelectInquiry, showToast, presetOwnerId, presetStatus }) {
  const { profile, erpRoles } = useAuth();
  /* Scope per-baris TIDAK lagi disaring di sini — policy `inquiries_read`
     (migrasi 20260830000003) yang menanganinya di server: manager-ke-atas
     melihat seluruh entitasnya, sales melihat yang `owner_id`-nya dirinya,
     procurement melihat yang punya PRF.
     `isAllEntities` TETAP — ia bukan aturan baris, melainkan pilihan apakah
     query dibatasi ke satu entitas. */
  const isAllEntities = isAllEntitiesRole(erpRoles);
  // Cek SELURUH role aktif (erpRoles), bukan erpRole primer. Dipakai jg utk
  // gate filter Owner/Entity (mockup: isMgmt/multi) -- RENCANA koreksi #11.
  const isMgmt = isManagerOrAbove(erpRoles);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchAccountIds, setSearchAccountIds] = useState([]);
  const [stSel, setStSel] = useState(() => (presetStatus ? [presetStatus] : [...OPEN_STATUSES]));
  const [stSelOpen, setStSelOpen] = useState(false);
  const [filterService, setFilterService] = useState('all');
  const [filterInquiryType, setFilterInquiryType] = useState('all');
  const [filterOwner, setFilterOwner] = useState(presetOwnerId || 'all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [filterDeadline, setFilterDeadline] = useState('all');
  const [filterDirection, setFilterDirection] = useState('all');
  const [filterCreatedDate, setFilterCreatedDate] = useState('last_30d');
  /* Default "All", bukan "My" — halaman ini dipakai manager untuk mengawasi, dan
     membuka daftar yang diam-diam sudah tersaring ke diri sendiri menyembunyikan
     pekerjaan tim tanpa memberi tahu. */
  const [scopeMine, setScopeMine] = useState(false);
  /* Nama pemilik TIDAK di-embed dari `profiles`. PipelineKanbanPage:111-121 sudah
     membuktikan embed FK inquiries.owner_id -> profiles ditolak PostgREST walau
     FK-nya valid dan schema cache sudah di-reload. Pola dua langkah: owner_id
     diambil sebagai kolom biasa, namanya diambil sekali per pemuatan halaman. */
  const [ownerNames, setOwnerNames] = useState({});
  const [ownerOptions, setOwnerOptions] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [detailInquiry, setDetailInquiry] = useState(null);
  // Hitungan per status untuk checklist multi-select -- dihitung atas SELURUH
  // baris yang cocok filter lain (preChip mockup), BUKAN dibatasi 1000 (lihat
  // effect-nya di bawah -- RENCANA PUTARAN 7 koreksi #5).
  const [statusCounts, setStatusCounts] = useState({});
  // Toggle "Won, awaiting Sales Order" -- MENGGANTIKAN filter stSel saat
  // aktif (mockup renderVals(): `s.wasF ? awaitSo : stSel.includes(...)`),
  // bukan ditambahkan di atasnya. wasN = count atas preChip (lihat effect-nya).
  const [wasF, setWasF] = useState(false);
  const [wasN, setWasN] = useState(0);
  // Peta id lokasi -> type, utk badge Free Trade Zone (koreksi #4). Diisi
  // SATU KALI per fetch (bukan per baris) dari id yang dikumpulkan lintas
  // inquiries.pol_location_id/pod_location_id + SELURUH inquiry_lanes
  // (pol/pod/via) halaman yang sedang tampil.
  const [locationTypeById, setLocationTypeById] = useState({});
  // Rates (koreksi C.6/#12) -- select All/Waiting for rates, diturunkan dari
  // PRF tanpa migrasi (lihat resolveWaitingForRatesIds). offerCountByPrfId
  // HANYA dihitung utk halaman yang TAMPIL (PAGE-scoped, bukan global) --
  // dipakai display, beda dari resolveWaitingForRatesIds yang global (utk
  // filter, tak butuh hitungan offer sama sekali -- lihat komentarnya).
  const [filterRates, setFilterRates] = useState('all');
  const [offerCountByPrfId, setOfferCountByPrfId] = useState({});

  const todayWIB = getTodayWIB();

  // Select bersama -- embed badge (koreksi #2/#3/#4/#C.5) + kolom dasar.
  // sales_orders/quotations: FK TUNGGAL ke inquiries, nol alias perlu.
  // pol_loc/pod_loc: DUA FK berbeda ke `locations` dari inquiries sendiri --
  // WAJIB alias (lihat verifikasi skema: inquiries_pol_location_id_fkey vs
  // inquiries_pod_location_id_fkey). inquiry_lanes dibawa MENTAH (hanya tiga
  // kolom id lokasi) -- peta id->type-nya diambil terpisah SATU KALI di
  // bawah, BUKAN nested embed per lane (pola "dua langkah" yang sudah
  // dipakai file ini utk nama Owner, menghindari kelas kejutan embed
  // PostgREST yang sudah pernah terjadi di PipelineKanbanPage.jsx).
  const INQUIRY_SELECT = `
    id, inquiry_no, service_type, route, status, created_at, estimated_volume, notes,
    pol, pod, pol_location_id, pod_location_id, direction, inquiry_type, estimated_value,
    incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, dimension,
    cargo_types, un_number, imo_class, has_msds, additional_services, undername_import, deadline_quote,
    won_reason, closed_at,
    prospect:accounts!inquiries_prospect_id_fkey(name, lifecycle_stage),
    customer:accounts!inquiries_customer_id_fkey(name, lifecycle_stage),
    owner_id,
    created_by_profile:profiles!inquiries_created_by_fkey(full_name),
    sales_orders(status, deleted_at),
    quotations(status, valid_until),
    pol_loc:locations!inquiries_pol_location_id_fkey(type),
    pod_loc:locations!inquiries_pod_location_id_fkey(type),
    inquiry_lanes(pol_location_id, pod_location_id, via_location_id),
    prf(id, status, created_at, selected_offer_id, suggested_rate)
  `;

  /* Filter "Waiting for rates" (koreksi C.6/#12) -- GLOBAL (bukan di-page),
     karena ia menyaring HIMPUNAN baris yang dikembalikan, bukan sekadar
     men-tag yang sudah tampil. `prf.inquiry_id` FK TUNGGAL ke inquiries,
     nol alias perlu (verifikasi skema staging).

     Menentukan "waiting" TIDAK butuh hitung prf_vendor_offers sama sekali --
     mockup rtF: `!!r.rates && r.rates !== 'Offer selected' && r.rates !==
     'From rate library'`, dan KEDUA pengecualian itu ('Offer selected' =
     selected_offer_id ADA, 'From rate library' = suggested_rate>0) sudah
     bisa dijawab dari tabel `prf` SENDIRI -- jumlah offer hanya menentukan
     TEKS badge ("3 offers" vs "Requested 2d"), bukan keanggotaan filter.
     Range-loop (koreksi #5): jumlah PRF jauh di bawah jumlah inquiry, tapi
     prinsip "jangan `.limit(1000)` tunggal" diterapkan konsisten. */
  async function resolveWaitingForRatesIds() {
    const RANGE_PAGE = 1000;
    let list = [];
    let from = 0;
    let more = true;
    while (more) {
      let q = supabase.from('prf').select('id, inquiry_id, created_at, selected_offer_id, suggested_rate').is('deleted_at', null);
      if (!isAllEntities) q = q.eq('company_id', profile.company_id);
      q = q.range(from, from + RANGE_PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      const pageRows = data || [];
      list = list.concat(pageRows);
      more = pageRows.length === RANGE_PAGE;
      from += RANGE_PAGE;
    }
    // Hanya PRF TERBARU per inquiry yang menentukan (mockup: satu `rates`
    // per baris, bukan riwayat PRF lama yang sudah ditinggalkan).
    const latestByInquiry = {};
    list.forEach((p) => {
      const cur = latestByInquiry[p.inquiry_id];
      if (!cur || p.created_at > cur.created_at) latestByInquiry[p.inquiry_id] = p;
    });
    return Object.values(latestByInquiry)
      .filter((p) => !p.selected_offer_id && !(Number(p.suggested_rate) > 0))
      .map((p) => p.inquiry_id);
  }

  const fetchInquiries = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      // Rates (koreksi C.6/#12) -- resolve DULU (query terpisah, domain PRF
      // yang jauh lebih kecil dari inquiries), baru disisipkan ke query
      // utama lewat .in('id', ...). Kosong -> short-circuit, .in([]) pada
      // PostgREST rawan ditafsirkan beda-beda, jadi diputus eksplisit di sini.
      let waitingIds = null;
      if (filterRates === 'waiting') {
        waitingIds = await resolveWaitingForRatesIds();
        if (waitingIds.length === 0) {
          setInquiries([]); setTotal(0); setOwnerNames({}); setLocationTypeById({}); setOfferCountByPrfId({});
          return;
        }
      }

      function applyOtherFilters(q) {
        if (!isAllEntities) q = q.eq('company_id', profile.company_id);
        if (filterService !== 'all') q = q.eq('service_type', filterService);
        q = applyInquiryTypeFilter(q, filterInquiryType);
        // 'unassigned' -> IS NULL (mockup <option>Unassigned</option> = !r.ow),
        // bukan .eq, yang tidak pernah match NULL.
        if (filterOwner === 'unassigned') q = q.is('owner_id', null);
        else if (filterOwner !== 'all') q = q.eq('owner_id', filterOwner);
        if (filterEntity !== 'all') q = q.eq('company_id', filterEntity);
        if (filterDeadline !== 'all') q = applyDeadlineFilter(q, filterDeadline, todayWIB);
        q = applyCreatedDateFilter(q, filterCreatedDate, todayWIB);
        // Direction: 'not_set' -> IS NULL (bukan .eq, yang tidak pernah match NULL).
        if (filterDirection === 'not_set') q = q.is('direction', null);
        else if (filterDirection !== 'all') q = q.eq('direction', filterDirection);
        if (scopeMine && profile?.id) q = q.eq('owner_id', profile.id);
        if (waitingIds) q = q.in('id', waitingIds);
        return applySearchFilter(q, search.trim(), searchAccountIds);
      }

      let rows;
      let totalCount;

      if (wasF) {
        /* Toggle "Won, awaiting Sales Order" aktif -- MENGGANTIKAN filter
           stSel (mockup renderVals(): `s.wasF ? awaitSo : stSel.includes`),
           bukan ditambahkan di atasnya. Narrow server-side dulu (status=WON
           + bukan Rate Sheet Request + closed_at > 7 hari lalu) supaya
           himpunan yang perlu diperiksa client-side jauh lebih kecil dari
           total inquiry -- "tak ada Sales Order hidup berstatus SENT" adalah
           NOT EXISTS yang tak bisa diekspresikan bersih lewat filter
           PostgREST tanpa RPC baru (dilarang putaran ini). Range-loop
           (BUKAN `.limit(1000)` tunggal) supaya BENAR pada skala berapa pun
           (koreksi #5); paginasi dilakukan CLIENT-SIDE (slice) di atas hasil
           LENGKAP yang sudah disaring -- bukan di-cap. */
        const cutoffISO = new Date(Date.now() - 7 * 86400000).toISOString();
        const RANGE_PAGE = 1000;
        let list = [];
        let from = 0;
        let more = true;
        while (more) {
          let q = supabase.from('inquiries').select(INQUIRY_SELECT).is('deleted_at', null)
            .eq('status', 'WON').neq('inquiry_type', 'Rate Sheet Request').lt('closed_at', cutoffISO);
          q = applyOtherFilters(q);
          q = q.order('created_at', { ascending: false }).range(from, from + RANGE_PAGE - 1);
          const { data, error } = await q;
          if (error) throw error;
          const pageRows = data || [];
          list = list.concat(pageRows);
          more = pageRows.length === RANGE_PAGE;
          from += RANGE_PAGE;
        }
        const filtered = list.filter((r) => isWonAwaitingSalesOrder(r, r.sales_orders));
        totalCount = filtered.length;
        rows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      } else {
        if (stSel.length === 0) { setInquiries([]); setTotal(0); setOwnerNames({}); setLocationTypeById({}); setOfferCountByPrfId({}); return; }
        let q = supabase.from('inquiries').select(INQUIRY_SELECT, { count: 'exact' })
          .is('deleted_at', null).in('status', stSel);
        q = applyOtherFilters(q);
        q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        rows = data || [];
        totalCount = count || 0;
      }

      setInquiries(rows);
      setTotal(totalCount);

      /* Langkah 2 pola dua-langkah: SATU query per pemuatan halaman, bukan satu per
         baris. Nama yang tak ketemu sengaja dibiarkan kosong — kolom Owner sendiri
         yang memutuskan menampilkan '(unnamed)'. */
      const ownerIds = [...new Set(rows.map(r => r.owner_id).filter(Boolean))];
      if (ownerIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name').in('id', ownerIds).limit(1000);
        const map = {};
        (profs || []).forEach(pr => { map[pr.id] = pr.full_name; });
        setOwnerNames(map);
      } else {
        setOwnerNames({});
      }

      /* Langkah 2 pola dua-langkah utk badge FTZ (koreksi #4): kumpulkan
         SELURUH id lokasi yang relevan utk baris yang TAMPIL (pol/pod
         inquiry sendiri -- fallback saat nol lane -- + pol/pod/via SETIAP
         baris inquiry_lanes), ambil peta id->type dari `locations` SATU
         KALI, bukan per baris/per lane. */
      const laneLocIds = rows.flatMap((r) => (r.inquiry_lanes || []).flatMap((l) => [l.pol_location_id, l.pod_location_id, l.via_location_id]));
      const ownLocIds = rows.flatMap((r) => [r.pol_location_id, r.pod_location_id]);
      const allLocIds = [...new Set([...laneLocIds, ...ownLocIds].filter(Boolean))];
      if (allLocIds.length) {
        const { data: locs } = await supabase.from('locations').select('id, type').in('id', allLocIds);
        const locMap = {};
        (locs || []).forEach((l) => { locMap[l.id] = l.type; });
        setLocationTypeById(locMap);
      } else {
        setLocationTypeById({});
      }

      /* Hitungan offer PER BARIS YANG TAMPIL (PAGE-scoped, BUKAN global --
         beda dari resolveWaitingForRatesIds di atas yang global utk filter).
         Display-only: menentukan teks "{N} offers" vs "Requested {N}d",
         bukan keanggotaan filter. Hanya utk PRF TERBARU per baris yang
         BELUM selected & BELUM suggested_rate (candidate "waiting" --
         prf.selected_offer_id ADA atau suggested_rate>0 tak perlu hitungan
         offer, teksnya sudah pasti "Offer selected"/"From rate library"). */
      const latestPrfByRow = rows.map((r) => (r.prf || []).reduce((best, p) => (!best || p.created_at > best.created_at ? p : best), null));
      const needCountPrfIds = latestPrfByRow.filter((p) => p && !p.selected_offer_id && !(Number(p.suggested_rate) > 0)).map((p) => p.id);
      if (needCountPrfIds.length) {
        const { data: offers } = await supabase.from('prf_vendor_offers').select('prf_id').in('prf_id', needCountPrfIds).is('deleted_at', null);
        const counts = {};
        (offers || []).forEach((o) => { counts[o.prf_id] = (counts[o.prf_id] || 0) + 1; });
        setOfferCountByPrfId(counts);
      } else {
        setOfferCountByPrfId({});
      }
    } catch (err) {
      showToast?.('Failed to load inquiries: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
    // resolveWaitingForRatesIds sengaja TIDAK di deps: plain function (bukan
    // useCallback) supaya tidak menambah beban "Compilation Skipped" baru di
    // atas yang sudah ada (fetchInquiries sendiri, baseline) -- perilakunya
    // sudah mengikuti isAllEntities/profile?.company_id yang SUDAH ada di deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.company_id, isAllEntities, page, wasF, filterRates, stSel, filterService, filterInquiryType, filterOwner, filterEntity, filterDeadline, filterDirection, filterCreatedDate, scopeMine, search, searchAccountIds, todayWIB, showToast, INQUIRY_SELECT]);

  // [Putaran 16, Task 3] Guard 416 -- dibuktikan lewat tab network (lihat
  // laporan chat): saat filter berubah DAN `page` belum sempat di-reset ke
  // 0 oleh efek di bawah (yang baru berlaku RENDER BERIKUTNYA, bukan
  // sinkron di commit yang sama), `fetchInquiries` di efek ini masih
  // membawa `page` LAMA -> `.range(page*20, ...)` terkirim ke himpunan
  // baru yang jauh lebih kecil -> PostgREST 416 PGRST103 ("offset of 40
  // was requested, but there are only 5 rows"). filterSigRef melacak
  // signature filter TERAKHIR yang sudah di-fetch; kalau signature
  // berubah DAN `page !== 0`, lewati fetch ini (hanya update ref) --
  // efek setPage(0) di bawah menjadwalkan render ulang dgn page=0, yang
  // membuat efek ini jalan lagi dengan kombinasi yang sudah benar.
  const filterSigRef = useRef(null);
  useEffect(() => {
    const sig = JSON.stringify([wasF, filterRates, stSel, filterService, filterInquiryType, filterOwner, filterEntity, filterDeadline, filterDirection, filterCreatedDate, scopeMine, search]);
    if (filterSigRef.current !== null && filterSigRef.current !== sig && page !== 0) {
      filterSigRef.current = sig;
      return;
    }
    filterSigRef.current = sig;
    fetchInquiries();
    // Deps di bawah sudah covariant dgn identitas `fetchInquiries` sendiri
    // (useCallback-nya sudah mendeklarasikan seluruhnya) -- dicantumkan
    // eksplisit di sini murni supaya react-hooks/exhaustive-deps lolos,
    // NOL perubahan kapan efek ini menyala.
  }, [fetchInquiries, wasF, filterRates, stSel, filterService, filterInquiryType, filterOwner, filterEntity, filterDeadline, filterDirection, filterCreatedDate, scopeMine, search, page]);
  useEffect(() => { setPage(0); }, [wasF, filterRates, stSel, filterService, filterInquiryType, filterOwner, filterEntity, filterDeadline, filterDirection, filterCreatedDate, scopeMine, search]);

  // Pencarian dua-langkah (koreksi #6): resolve dulu id akun yang NAMANYA cocok,
  // baru dipakai fetchInquiries & effect hitungan di bawah lewat `.or()`.
  useEffect(() => {
    const term = search.trim();
    // Pola sama dengan effect fetchInquiries/setPage di atas (baseline sudah
    // ada 2 instance persis ini); early-return murni membersihkan state lama.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!term) { setSearchAccountIds([]); return undefined; }
    let cancelled = false;
    supabase.from('accounts').select('id').ilike('name', `%${term.replace(/[,()%]/g, '')}%`).limit(500)
      .then(({ data }) => { if (!cancelled) setSearchAccountIds((data || []).map(a => a.id)); })
      .catch(() => { if (!cancelled) setSearchAccountIds([]); });
    return () => { cancelled = true; };
  }, [search]);

  /* Hitungan per-status untuk panel checklist Status -- IKUT menyaring semua
     filter LAIN (service/type/direction/owner/entity/deadline/created/scope/
     search), TAPI TANPA filter status itu sendiri (mockup: `preChip`), dan
     TANPA batas page (chip tak boleh menyusut saat sebuah status dipilih).

     ⚠️ RENCANA PUTARAN 7 koreksi #5: production ~950 inquiry, SATU
     `.limit(1000)` akan terpotong diam-diam begitu lewat ambang itu (nol
     error, cuma sebagian data -- kelas bug yang sama persis dgn yang
     ditemukan review Vir di InquiryClassificationPage.jsx Putaran 3A).
     Diganti loop `.range()` berhalaman sampai halaman terakhir < PAGE_SIZE
     baris -- pola yang SAMA, bukan disalin ulang secara independen. */
  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    (async () => {
      const RANGE_PAGE = 1000;
      let list = [];
      let from = 0;
      let more = true;
      while (more) {
        let query = supabase.from('inquiries').select('status').is('deleted_at', null);
        if (!isAllEntities) query = query.eq('company_id', profile.company_id);
        if (filterService !== 'all') query = query.eq('service_type', filterService);
        query = applyInquiryTypeFilter(query, filterInquiryType);
        if (filterOwner === 'unassigned') query = query.is('owner_id', null);
        else if (filterOwner !== 'all') query = query.eq('owner_id', filterOwner);
        if (filterEntity !== 'all') query = query.eq('company_id', filterEntity);
        if (filterDeadline !== 'all') query = applyDeadlineFilter(query, filterDeadline, todayWIB);
        query = applyCreatedDateFilter(query, filterCreatedDate, todayWIB);
        if (filterDirection === 'not_set') query = query.is('direction', null);
        else if (filterDirection !== 'all') query = query.eq('direction', filterDirection);
        if (scopeMine && profile?.id) query = query.eq('owner_id', profile.id);
        query = applySearchFilter(query, search.trim(), searchAccountIds);
        query = query.range(from, from + RANGE_PAGE - 1);
        const { data, error } = await query;
        if (cancelled) return;
        // Non-fatal: kalau gagal, checklist cukup tak menampilkan angka; list utama tetap jalan.
        if (error) { setStatusCounts({}); return; }
        const pageRows = data || [];
        list = list.concat(pageRows);
        more = pageRows.length === RANGE_PAGE;
        from += RANGE_PAGE;
      }
      if (cancelled) return;
      const counts = {};
      list.forEach(r => { if (r.status) counts[r.status] = (counts[r.status] || 0) + 1; });
      setStatusCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, filterService, filterInquiryType, filterOwner, filterEntity, filterDeadline, filterCreatedDate, filterDirection, scopeMine, search, searchAccountIds, todayWIB]);

  /* Count tombol toggle "Won, awaiting Sales Order" -- atas preChip yang
     SAMA dgn checklist Status di atas (service/type/direction/owner/entity/
     deadline/created/scope/search), TAPI dinarrow status=WON + bukan Rate
     Sheet Request + closed_at > 7 hari (mockup wasN: `preChip.filter(r =>
     r.st==='Won' && !r.so && r.type!=='Rate Sheet' && !!r.wonOn &&
     days(r.wonOn,TODAY)>7).length`). Embed sales_orders SAJA (bukan
     quotations/locations/inquiry_lanes -- tak relevan utk hitungan ini).
     Range-loop (koreksi #5) atas subset WON yang sudah dipersempit server
     -- bukan `.limit(1000)` tunggal. */
  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    (async () => {
      const cutoffISO = new Date(Date.now() - 7 * 86400000).toISOString();
      const RANGE_PAGE = 1000;
      let list = [];
      let from = 0;
      let more = true;
      while (more) {
        let query = supabase.from('inquiries')
          .select('status, inquiry_type, closed_at, sales_orders(status, deleted_at)')
          .is('deleted_at', null)
          .eq('status', 'WON').neq('inquiry_type', 'Rate Sheet Request').lt('closed_at', cutoffISO);
        if (!isAllEntities) query = query.eq('company_id', profile.company_id);
        if (filterService !== 'all') query = query.eq('service_type', filterService);
        if (filterOwner === 'unassigned') query = query.is('owner_id', null);
        else if (filterOwner !== 'all') query = query.eq('owner_id', filterOwner);
        if (filterEntity !== 'all') query = query.eq('company_id', filterEntity);
        if (filterDeadline !== 'all') query = applyDeadlineFilter(query, filterDeadline, todayWIB);
        query = applyCreatedDateFilter(query, filterCreatedDate, todayWIB);
        if (filterDirection === 'not_set') query = query.is('direction', null);
        else if (filterDirection !== 'all') query = query.eq('direction', filterDirection);
        if (scopeMine && profile?.id) query = query.eq('owner_id', profile.id);
        query = applySearchFilter(query, search.trim(), searchAccountIds);
        query = query.range(from, from + RANGE_PAGE - 1);
        const { data, error } = await query;
        if (cancelled) return;
        if (error) { setWasN(0); return; }
        const pageRows = data || [];
        list = list.concat(pageRows);
        more = pageRows.length === RANGE_PAGE;
        from += RANGE_PAGE;
      }
      if (cancelled) return;
      setWasN(list.filter((r) => isWonAwaitingSalesOrder(r, r.sales_orders)).length);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, filterService, filterOwner, filterEntity, filterDeadline, filterCreatedDate, filterDirection, scopeMine, search, searchAccountIds, todayWIB]);

  /* Opsi dropdown Owner dari roster OPERASIONAL — sumber yang sama dengan
     CRMDashboardPage, bukan query distinct owner_id sendiri. */
  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    fetchOperationalRoster(profile.company_id)
      .then((rows) => { if (!cancelled) setOwnerOptions(rows || []); })
      .catch(() => { if (!cancelled) setOwnerOptions([]); });
    return () => { cancelled = true; };
  }, [profile?.company_id]);

  // Entity filter (mockup: hanya tampil utk `multi`) -- daftar 3 entitas,
  // SEKALI per pemuatan halaman, dari tabel companies (bukan hardcode UUID).
  useEffect(() => {
    let cancelled = false;
    supabase.from('companies').select('id, code, name').order('code')
      .then(({ data }) => { if (!cancelled) setCompanyOptions(data || []); })
      .catch(() => { if (!cancelled) setCompanyOptions([]); });
    return () => { cancelled = true; };
  }, []);

  function toggleStatus(st) {
    setStSel((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : prev.concat([st])));
  }
  function clearAll() {
    // Mockup clearAll(): reset SEMUA kontrol filter standar, TAPI BUKAN
    // scope (My/All) -- scope bukan bagian grid filter, ia menentukan
    // HIMPUNAN baris, bukan menyaring di dalamnya.
    setStSel([...OPEN_STATUSES]);
    setFilterService('all');
    setFilterInquiryType('all');
    setFilterDirection('all');
    setFilterOwner('all');
    setFilterEntity('all');
    setFilterDeadline('all');
    setFilterCreatedDate('last_30d');
    setSearch('');
  }

  const stSelLabel = useMemo(() => {
    if (stSel.length === 7) return 'All statuses';
    if (stSel.length === OPEN_STATUSES.length && OPEN_STATUSES.every((s) => stSel.includes(s))) return 'Open statuses';
    if (stSel.length) return stSel.map((s) => STATUS_META[s]?.label || s).join(', ');
    return 'No status';
  }, [stSel]);

  /* Kolom Owner ditaruh SESUDAH Status. Tiga keadaan sengaja dibedakan, mengikuti
     konvensi CRMDashboardPage/DealDetailPage — 'Unassigned' (owner_id NULL)
     tidak sama dengan '(unnamed)' (owner ada, namanya tak ketemu). Avatar
     bulat + inisial (koreksi #11) -- SATU warna netral konsisten, BUKAN
     per-nama seperti mockup (6 hex hardcode per sales yang tak bisa
     digeneralisasi ke roster sungguhan yang jumlahnya berubah-ubah). */
  function initials(name) {
    if (!name) return '';
    return name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  }
  const ownerCell = (inq) => {
    if (!inq.owner_id) return <span style={{ color: C.inkFaint }}>Unassigned</span>;
    const name = ownerNames[inq.owner_id] || '(unnamed)';
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 12, flexShrink: 0,
          background: C.accentSoft, color: C.ink, fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {initials(name)}
        </span>
        {name}
      </span>
    );
  };

  /* Route dibangun dari TEKS inquiries.pol/.pod, BUKAN dari query ke
     `locations` di sini (nol query lokasi tambahan untuk kolom ini).
     Badge "Not recorded" (koreksi #9: dipertahankan, Log CRM — lihat
     laporan akhir untuk status "ada/tidaknya di mockup") muncul kalau ADA
     teks pol/pod tapi ID-nya NULL (baris lama pra-Location-Master). */
  const routeCell = (inq) => {
    const pol = (inq.pol || '').trim();
    const pod = (inq.pod || '').trim();
    if (!pol && !pod) return inq.route || '—';
    const notRecorded = (!!pol && !inq.pol_location_id) || (!!pod && !inq.pod_location_id);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span>{pol || '—'} to {pod || '—'}</span>
        {notRecorded && (
          <span
            title="Teks lokasi ada, tapi belum terpetakan ke Location Master."
            style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', background: C.warnBg, color: C.warn, border: `1px solid ${C.warnBd}` }}
          >
            Not recorded
          </span>
        )}
      </span>
    );
  };

  // Direction: NULL = "Not set" (mockup Matrix), bukan string kosong. Icon
  // (koreksi #11) -- semantik sederhana: Export naik-kanan, Import turun-kiri,
  // Domestic truk.
  const DIRECTION_ICON = { Export: ArrowUpRight, Import: ArrowDownLeft, Domestic: Truck };
  const directionCell = (inq) => {
    const Icon = DIRECTION_ICON[inq.direction];
    if (!inq.direction) return <span style={{ color: C.inkFaint, fontStyle: 'italic' }}>Not set</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={13} />}
        {inq.direction}
      </span>
    );
  };

  // Deadline Quote (kolom BARU, mockup) -- tanggal + badge Overdue, memakai
  // definisi "overdue" yang SAMA dengan preset filter Overdue di atas (status
  // masih open & deadline sebelum hari ini).
  const isOverdue = (inq) => OPEN_STATUSES.includes(inq.status) && !!inq.deadline_quote && inq.deadline_quote < todayWIB;
  const deadlineCell = (inq) => (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>
        {inq.deadline_quote ? fmtDate(inq.deadline_quote) : 'No deadline'}
      </span>
      {isOverdue(inq) && <SubBadge>Overdue</SubBadge>}
    </span>
  );

  /* Estimated Value -- "dari quotation aktif" diutamakan (mockup D.fromQuote:
     quotation TERBARU yang BUKAN SUPERSEDED, ditandai icon kecil), fallback
     ke inquiries.estimated_value apa adanya ("Not set" bila nol dua-duanya).
     "Aktif" = status BUKAN SUPERSEDED (ACCEPTED/DRAFT/REJECTED/SENT semua
     terhitung -- hanya SUPERSEDED yang dikeluarkan, sama definisinya dgn
     isQuotationExpired di bawah). */
  function activeQuotation(inq) {
    return (inq.quotations || []).find((q) => q.status !== 'SUPERSEDED') || null;
  }
  const estimatedValueCell = (inq) => {
    const aq = activeQuotation(inq);
    if (aq && Number(aq.total_amount) > 0) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span title="From quotation" style={{ color: C.inkSoft, display: 'flex' }}>
            <FileCheck size={13} />
          </span>
          {`Rp ${Math.round(Number(aq.total_amount)).toLocaleString('id-ID')}`}
        </span>
      );
    }
    if (!inq.estimated_value) return <span style={{ color: C.inkFaint }}>Not set</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.inkSoft }}>Est.</span>
        {`Rp ${Math.round(Number(inq.estimated_value)).toLocaleString('id-ID')}`}
      </span>
    );
  };

  /* Badge Free Trade Zone (koreksi #4) -- FTZ bila POL, POD, ATAU Via pada
     SALAH SATU lane (inquiry_lanes) bertipe FTZ; tanpa lane -> fallback
     pol_location_id/pod_location_id milik inquiry sendiri (TANPA via --
     inquiries tak punya kolom via/via_location_id sama sekali, dikonfirmasi
     ke skema staging langsung). `locationTypeById` = peta SATU KALI (lihat
     fetchInquiries), bukan query per baris. */
  function isFTZ(inq) {
    const ids = (inq.inquiry_lanes || []).length
      ? inq.inquiry_lanes.flatMap((l) => [l.pol_location_id, l.pod_location_id, l.via_location_id])
      : [inq.pol_location_id, inq.pod_location_id];
    return ids.filter(Boolean).some((id) => locationTypeById[id] === 'FTZ');
  }

  /* Quotation expired (koreksi #3) -- quotation AKTIF (bukan ACCEPTED/
     REJECTED/SUPERSEDED) dengan valid_until < hari ini, DAN status inquiry
     masih QUOTED atau NEGOTIATION (supaya inquiry yang sudah tertutup --
     Won/Lost/Cancelled -- tidak ikut berbadge). */
  function isQuotationExpired(inq) {
    if (!['QUOTED', 'NEGOTIATION'].includes(inq.status)) return false;
    const active = (inq.quotations || []).find((q) => !['ACCEPTED', 'REJECTED', 'SUPERSEDED'].includes(q.status));
    return !!active && !!active.valid_until && active.valid_until < todayWIB;
  }

  // Manual win (koreksi: SATU sumber WON_MANUAL_REASONS, pola sama
  // DealDetailPage.jsx -- lihat inquiryOptions.js).
  const isManualWin = (inq) => inq.status === 'WON' && WON_MANUAL_REASONS.includes(inq.won_reason);

  /* Rates (koreksi C.6/#12) -- teks badge & definisi "Waiting for rates"
     SAMA PERSIS mockup, nol state turunan baru (mockup `r.rates`):
       selected_offer_id ADA   -> "Offer selected"
       suggested_rate > 0      -> "From rate library"
       count(offer) > 0        -> "{N} offers"
       selain itu              -> "Requested {N}d" (N = hari sejak prf.created_at)
     null kalau nol PRF sama sekali -- nol badge, excluded dari filter. */
  function ratesInfo(inq) {
    const latest = (inq.prf || []).reduce((best, p) => (!best || p.created_at > best.created_at ? p : best), null);
    if (!latest) return null;
    if (latest.selected_offer_id) return { text: 'Offer selected', waiting: false };
    if (Number(latest.suggested_rate) > 0) return { text: 'From rate library', waiting: false };
    const n = offerCountByPrfId[latest.id] || 0;
    if (n > 0) return { text: `${n} offer${n === 1 ? '' : 's'}`, waiting: true };
    return { text: `Requested ${daysSince(latest.created_at)}d`, waiting: true };
  }

  const columns = [
    { key: 'inquiry_no', label: 'Inquiry No',
      render: (inq) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, fontSize: 13, color: C.ink }}>
            {inq.inquiry_no || '—'}
          </span>
          {inq.inquiry_type === 'Rate Sheet Request' && <SubBadge tone="neutral">Rate Sheet</SubBadge>}
        </span>
      ) },
    { key: 'account', label: 'Customer',
      render: (inq) => {
        const acc = inq.prospect || inq.customer;
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 600 }}>{acc?.name || '—'}</span>
            {acc?.lifecycle_stage && (
              <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.inkSoft }}>
                {acc.lifecycle_stage}
              </span>
            )}
          </span>
        );
      } },
    { key: 'service_type', label: 'Service Type',
      render: (inq) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {SERVICE_TYPE_LABELS[inq.service_type] || inq.service_type || '—'}
          {isFTZ(inq) && <SubBadge>Free Trade Zone</SubBadge>}
          {inq.undername_import === true && (
            <SubBadge><FileText size={11} />Undername</SubBadge>
          )}
        </span>
      ) },
    { key: 'direction', label: 'Direction', render: directionCell },
    { key: 'route', label: 'Route', render: routeCell },
    { key: 'status', label: 'Status',
      render: (inq) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <StatusBadge status={inq.status} />
          {isWonAwaitingSalesOrder(inq, inq.sales_orders) && <SubBadge>Won, awaiting Sales Order</SubBadge>}
          {isQuotationExpired(inq) && <SubBadge>Quotation expired</SubBadge>}
          {isManualWin(inq) && <SubBadge tone="neutral">Manual win</SubBadge>}
        </span>
      ) },
    { key: 'owner', label: 'Owner', render: ownerCell },
    { key: 'deadline_quote', label: 'Deadline Quote', render: deadlineCell },
    { key: 'estimated_value', label: 'Estimated Value', align: 'right', render: estimatedValueCell },
    { key: 'age', label: 'Inquiry Age',
      render: (inq) => (ageDays(inq.created_at) == null ? '—' : `${ageDays(inq.created_at)} days`) },
    { key: 'rates', label: 'Rates',
      render: (inq) => {
        const r = ratesInfo(inq);
        return r ? <SubBadge tone="neutral">{r.text}</SubBadge> : null;
      } },
    // Chevron DICABUT (koreksi #8) -- klik baris sendiri sudah membuka Detail,
    // tombol PDF DIPERTAHANKAN (pengecualian disengaja: satu-satunya jalan
    // download PDF inquiry, nol analog mockup).
    { key: 'actions', label: '', align: 'right',
      render: (inq) => (
        <PDFDownloadLink
          document={<InquiryPDF inquiry={inq} prospectName={inq.prospect?.name || inq.customer?.name || '—'} salesName={inq.created_by_profile?.full_name || '—'} />}
          fileName={`Inquiry-${inq.inquiry_no?.replace(/\//g, '-') || 'unknown'}-${getTodayWIB()}.pdf`}
          style={{ textDecoration: 'none' }}
        >
          {({ loading: pdfLoading }) => (
            <span
              title="Download PDF"
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', padding: 6, borderRadius: 6, opacity: pdfLoading ? 0.4 : 1, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.accentSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Download size={16} color={C.inkSoft} />
            </span>
          )}
        </PDFDownloadLink>
      ) },
  ];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // [Putaran 16 Tahap 5] bg diukur ULANG mockup (wrapper select Status/search):
  // C.bg (#F6F8F3), BUKAN C.surface2 (#EFF3ED) -- klaim Tahap 4 "sudah cocok"
  // ternyata salah ukur (measure select native yang tak terpakai selStyle).
  const selStyle = {
    height: 44, borderRadius: 10, border: `1px solid ${C.line}`,
    background: C.bg, padding: '0 12px', fontSize: 13.5, color: C.ink,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };
  const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 8 };

  const gridCols = '150px minmax(170px,1.3fr) 130px 100px minmax(170px,1.2fr) 150px minmax(140px,1fr) 130px 130px 90px 130px 48px';
  const cellBase = { padding: '12px', minWidth: 0 };
  const headCell = { ...cellBase, fontFamily: "'Montserrat', sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.inkSoft, whiteSpace: 'nowrap' };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} color={C.inkFaint} />
          </div>
          {/* h1 mockup = "Inquiry Status & History", 700 24px Montserrat.
              Subjudul "{total} inquiry terdaftar" DICABUT (koreksi #9) --
              informasinya sudah ada di baris hitungan di atas tabel. */}
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "Montserrat, sans-serif" }}>Inquiry Status &amp; History</h1>
        </div>
        <button
          onClick={onAddInquiry}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 40,
            background: C.accent, color: C.ink, border: `1px solid ${C.accent}`,
            borderRadius: 10, padding: '0 16px', fontSize: 13.5, fontWeight: 600,
            fontFamily: "Montserrat, sans-serif", cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Add Inquiry
        </button>
      </div>

      {/* ── Filter card (mockup "Status/Filters") ── */}
      <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Scope My/All -- hanya manager ke atas (mockup isMgmt). */}
        {isMgmt && (
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: C.surface2, borderRadius: 10, border: `1px solid ${C.line}`, alignSelf: 'flex-start' }}>
            {[{ mine: false, label: 'All Inquiries' }, { mine: true, label: 'My Inquiries' }].map((opt) => {
              const on = scopeMine === opt.mine;
              return (
                <button
                  key={opt.label} type="button" onClick={() => setScopeMine(opt.mine)}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${on ? C.line : 'transparent'}`,
                    background: on ? C.surface : 'transparent', cursor: 'pointer',
                    color: C.ink, fontSize: 13.5, fontWeight: 600, fontFamily: "Montserrat, sans-serif", whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Toggle "Won, awaiting Sales Order" -- MENGGANTIKAN filter Status
            saat aktif (bukan ditambahkan di atasnya), lihat fetchInquiries.
            Count wasN dihitung atas preChip LENGKAP (koreksi #5). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button" onClick={() => setWasF((f) => !f)}
            style={{
              height: 32, padding: '0 12px', borderRadius: 16,
              border: `1px solid ${wasF ? C.inkSoft : C.line}`,
              background: wasF ? C.surface2 : C.surface,
              color: C.ink, fontSize: 12.5, fontWeight: 600, fontFamily: "Montserrat, sans-serif",
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            Won, awaiting Sales Order
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: C.inkSoft }}>{wasN}</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(176px,1fr))', gap: 12, alignItems: 'end' }}>
          {/* Status -- multi-select checklist (bukan single-select ListView lama). */}
          <div style={{ position: 'relative', minWidth: 0 }}>
            <span style={fieldLabel}>Status</span>
            <button type="button" onClick={() => setStSelOpen((o) => !o)} style={{ ...selStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stSelLabel}</span>
              <ChevronDown size={16} />
            </button>
            {stSelOpen && (
              <>
                <div onClick={() => setStSelOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 240, zIndex: 40, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.16)', padding: 4, display: 'flex', flexDirection: 'column' }}>
                  {STATUS_ORDER.map((st) => (
                    <label key={st} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={stSel.includes(st)} onChange={() => toggleStatus(st)} style={{ width: 16, height: 16 }} />
                      <StatusBadge status={st} />
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: C.inkSoft }}>({statusCounts[st] || 0})</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={fieldLabel}>Service Type</span>
            <select value={filterService} onChange={e => setFilterService(e.target.value)} style={selStyle}>
              <option value="all">All</option>
              {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={fieldLabel}>Inquiry Type</span>
            <select value={filterInquiryType} onChange={e => setFilterInquiryType(e.target.value)} style={selStyle}>
              {FILTER_INQUIRY_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={fieldLabel}>Direction</span>
            <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} style={selStyle}>
              {FILTER_DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>

          {/* Owner -- hanya manager ke atas (mockup isMgmt). Koreksi #11. */}
          {isMgmt && (
            <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={fieldLabel}>Owner</span>
              <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={selStyle}>
                <option value="all">All</option>
                <option value="unassigned">Unassigned</option>
                {ownerOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.full_name || '(unnamed)'}</option>
                ))}
              </select>
            </label>
          )}

          {/* Entity -- hanya multi-entitas (mockup `multi`). Koreksi #11. */}
          {isAllEntities && (
            <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={fieldLabel}>Entity</span>
              <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} style={selStyle}>
                <option value="all">All</option>
                {companyOptions.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={fieldLabel}>Deadline Quote</span>
            <select value={filterDeadline} onChange={e => setFilterDeadline(e.target.value)} style={selStyle}>
              {DEADLINE_PRESETS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={fieldLabel}>Rates</span>
            <select value={filterRates} onChange={e => setFilterRates(e.target.value)} style={selStyle}>
              <option value="all">All</option>
              <option value="waiting">Waiting for rates</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={fieldLabel}>Created Date</span>
            <select value={filterCreatedDate} onChange={e => setFilterCreatedDate(e.target.value)} style={selStyle}>
              {CREATED_DATE_PRESETS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gridColumn: 'span 2' }}>
            <span style={fieldLabel}>Search</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Inquiry number or customer name"
              style={{ ...selStyle, width: '100%' }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', height: 44 }}>
            <button type="button" onClick={clearAll} style={{ height: 40, padding: '0 16px', borderRadius: 10, background: 'transparent', border: '1px solid transparent', color: C.inkSoft, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: "Montserrat, sans-serif" }}>
              Clear all
            </button>
          </div>
        </div>
      </section>

      <span style={{ fontSize: 13, color: C.inkSoft }}>
        {total} inquiries, {isMgmt ? (scopeMine ? 'showing inquiries you own' : 'showing all team inquiries') : 'showing your inquiries only'}
      </span>

      {/* ── Table (mockup "Status/Table") ── */}
      <section style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: 1530, background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
            {columns.map(col => (
              <div key={col.key} style={{ ...headCell, textAlign: col.align === 'right' ? 'right' : 'left' }}>{col.label}</div>
            ))}
          </div>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: C.inkFaint }}>Loading…</div>
          )}
          {!loading && inquiries.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: C.inkSoft }}>
              No inquiries match these filters.
            </div>
          )}
          {!loading && inquiries.map((inq) => (
            <div
              key={inq.id}
              onClick={() => (onSelectInquiry ? onSelectInquiry(inq) : setDetailInquiry(inq))}
              style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: 1530, borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.accentSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map(col => (
                <div key={col.key} style={{ ...cellBase, textAlign: col.align === 'right' ? 'right' : 'left' }}>
                  {col.render(inq)}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Pagination -- mockup: tombol angka halaman + label "Page X of Y,
            20 rows per page" (koreksi #7, Prev/Next dicabut). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: `1px solid ${C.lineSoft}` }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>Page {page + 1} of {totalPages}, 20 rows per page</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: totalPages }, (_, i) => i).map((p) => (
              <button
                key={p} onClick={() => setPage(p)}
                style={{
                  minWidth: 32, height: 32, padding: '0 8px', borderRadius: 10,
                  border: `1px solid ${p === page ? C.accentHover : C.line}`,
                  background: p === page ? C.accentSoft : C.surface,
                  fontSize: 12.5, fontWeight: 600, color: C.ink, cursor: 'pointer', fontFamily: "Montserrat, sans-serif",
                }}
              >
                {p + 1}
              </button>
            ))}
          </div>
        </div>
      </section>

      <InquiryDetailModal inquiry={detailInquiry} onClose={() => setDetailInquiry(null)} />
    </div>
  );
}
