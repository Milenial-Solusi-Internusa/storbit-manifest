// src/modules/crm/DealDetailPage.jsx
// CRM — Detail Deal (per inquiry). Ported from the Lovable handoff, adapted to
// Nexus conventions: Lucide icons, shared supabase client, useAuth, Montserrat/
// Inter fonts.
//
// [Putaran 16a Tahap 1] Warna sage (keputusan J-043 butir 7) lewat
// inquiryTheme.js (`DEAL_C`) -- DealPanels.jsx TIDAK disentuh (dilarang
// eksplisit; masih dipakai CustomerDetailPage.jsx dkk apa adanya). Card/
// InfoRow/PriceSummaryCard difork lokal ke inquiryParts.jsx. Tabel pemetaan
// lengkap: inquiryTheme.js, komentar blok `DEAL_C`.
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
// No DB schema change. Halaman ini tak pernah menulis `accounts` LANGSUNG sejak
// 8 Sep 2026 — dua jalur tulis langsungnya (Move Stage + Edit Deal) sudah dicabut.
// Satu-satunya perubahan `accounts` yang masih berasal dari sini datang lewat RPC
// mark_inquiry_won (server-side: pipeline_stage='WON'), bukan lewat PostgREST.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  FileText, ChevronLeft, CalendarClock,
  Loader2, AlertCircle, Phone, MessageCircle, MapPin, Users, Mail, ListChecks, XCircle,
  Ban, UserCog, UserCheck, CheckCircle2, MoreVertical, PlaneLanding, PlaneTakeoff, Truck,
  Lock, Check, RefreshCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getTodayWIB } from '../../lib/dateUtils';
import { markInquiryWonWithEvidence } from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove, isSuperAdmin, canCreatePrf, isAllEntities } from '../../lib/roles';
import { useDetailCrumb } from '../../routes/useDetailCrumb';
import { HEAD, BODY, fmtDate, fmtRp } from './DealPanels';
import { DEAL_C as C } from './inquiryTheme';
import { Card, PriceSummaryCard } from './inquiryParts';
import StatusBar from './v3/StatusBar';
import FormSheet from './v3/FormSheet';
import Notebook from './v3/Notebook';
import ListView from './v3/ListView';
import { RADIUS, SP, FONT_MONO, STATUS_LABEL } from './v3/tokens';
import { DEAL_STATUS } from '../../kit/tokens';
import { RouteStrip, RouteStripDoorToDoor } from '../../kit/RouteStrip';
import LocationPicker from '../../kit/LocationPicker';
import { LaneTable } from '../../kit/LaneTable';
import { deriveLaneMode, unitForMode } from '../../kit/laneUtils';
import { DocumentFlow } from '../../kit/DocumentFlow';
import { RelatedDocuments } from '../../kit/RelatedDocuments';
import { SectionHeader, SelectField, LockedField, TextField, ChipToggleField, TextareaField } from './dealOverviewFieldInputs';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import { formatQuotationNo, pickActiveQuotation } from './quotationVersion';
import ConfirmModal from '../../components/ConfirmModal';
import { LostReasonModal, CancelReasonModal } from './DealCloseModals';
import { MarkWonModal, RevertWonModal } from './DealWonModals';
import ChangeAccountModal from './ChangeAccountModal';
import OwnerAssignModal from './OwnerAssignModal';
import InquiryChatter from './InquiryChatter';
// Label kargo & layanan tambahan diimpor dari SUMBER BERSAMA, BUKAN dicermin.
// Cermin sudah terjadi tiga kali di file ini dan tiap cermin adalah sumber
// kebenaran kedua yang pasti ketinggalan.
import { CARGO_TYPES, SERVICES, INCOTERMS, CONTAINER_TYPES, IMO_CLASSES, MSDS_OPTS, WON_MANUAL_REASONS, isWonAwaitingSalesOrder } from './inquiryOptions';
import { formatIdNumber, readMoneyInput } from '../../lib/numberFormat';
import { entityByCode } from '../../lib/entities';

// Status inquiry yang masih boleh ditandai KALAH. WON / LOST / CANCELLED terminal →
// aksinya tidak dirender sama sekali (bukan disabled).
// Irisan 6 -- LocationPicker (src/kit/LocationPicker.jsx) adalah TOKEN-
// AGNOSTIC (pola sama RouteStrip/DocumentFlow/RelatedDocuments -- CRM
// belum migrasi kit sage). Dipetakan dari C (./DealPanels, navy/orange/
// cream) -- amber/amberBg/amberBd SUDAH ADA di palet itu, dipakai ulang
// persis (bukan warna amber kedua di halaman yang sama).
const LOCATION_PICKER_TOKENS = {
  bg: C.surfaceAlt, card: C.surface, border: C.border, text: C.text, textMute: C.textMute,
  placeholder: C.textFaint, hover: C.navySoft, divider: C.border,
  warnBg: C.amberBg, warnBorder: C.amberBd, warnText: C.amber,
};
// Ronde "Lane Editor" -- fallback FE utk dropdown_options list_key=lane_mode/
// lane_unit (migrasi 20261025000003), disalin apa adanya dari
// InquiryIntakeWizardPage.jsx (satu-satunya pemakai sebelumnya) -- fallback
// hanya menyala kalau fetch gagal/kosong.
const LANE_MODE_FALLBACK = [{ value: 'Sea LCL', label: 'Sea LCL' }, { value: 'Sea FCL', label: 'Sea FCL' }, { value: 'Air', label: 'Air' }];
const LANE_UNIT_FALLBACK = [{ value: 'CBM', label: 'CBM' }, { value: 'Container', label: 'Container' }, { value: 'KG', label: 'KG' }, { value: 'Ton', label: 'Ton' }];

const LOSABLE_INQUIRY_STATUS = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];

// B3 — "Batalkan" memakai gate yang SAMA PERSIS dengan "Tandai Kalah": keduanya
// jalur penutupan manual, jadi tak ada alasan salah satunya lebih longgar.
const CANCELLABLE_INQUIRY_STATUS = LOSABLE_INQUIRY_STATUS;

const SERVICE_LABEL = {
  freight_forwarding: 'Freight Forwarding',
  customs: 'Customs Clearance',
  trading: 'General Trading',
  door_to_door: 'Door to Door', // dropdown_options seed Putaran 4 (20261025000004) -- label tampilan saja.
};
// TD-318 Irisan 2 Inquiry, commit 4 — RouteStripDoorToDoor (mockup Detail/
// RouteStripDoorToDoor) dipicu oleh service_type door-to-door. SENGAJA KOSONG
// MASIH — nilai 'door_to_door' kini ADA di dropdown_options (Putaran 4 Tahap
// 4A, migrasi 20261025000004) tapi wizard create yang bisa memilihnya belum
// dibangun (Tahap 4B/4C). Mengaktifkan array ini adalah perubahan BEHAVIOR
// (menyalakan komponen RouteStripDoorToDoor), bukan label tampilan — sengaja
// TIDAK disentuh di Tahap 4A ("nol perubahan FE" kecuali label map, lihat
// instruksi eksekusi 4A). Aktifkan di Tahap 4B/4C bersamaan wizard-nya.
const DOOR_TO_DOOR_SERVICE_TYPES = [];

// Ikon chip header Direction -- path SVG mockup (Inquiry Management.dc.html
// baris 282, D.dIm/D.dEx/D.dDo) diverifikasi BYTE-SAMA dengan
// lucide-react PlaneLanding/PlaneTakeoff/Truck (node_modules/lucide-react).
const DIRECTION_ICON = { Import: PlaneLanding, Export: PlaneTakeoff, Domestic: Truck };

// Putaran 9 -- opsi Direction/Customer Role untuk SelectField section
// "Service & Status". MIRROR nilai persis InquiryIntakeWizardPage.jsx
// (DIRECTION_OPTS/CUSTOMER_ROLE_OPTS, baris 86-87) -- bukan impor: file
// itu dikerjakan sesi paralel, dan rule eksekusi Putaran 9 membatasi
// perubahan HANYA DealDetailPage.jsx. inquiryOptions.js juga belum punya
// array ini (dicek, tidak ada). Kalau salah satu sisi berubah nilainya,
// KEDUANYA wajib disunting bersama -- utang mirror, dicatat di laporan
// akhir Putaran 9.
const DIRECTION_OPTIONS = ['Import', 'Export', 'Domestic'];
const CUSTOMER_ROLE_OPTIONS = ['Shipper', 'Consignee', 'Third Party'];

// Putaran 14 Tahap 3 -- MIRROR InquiryIntakeWizardPage.jsx PRICING_BASIS_OPTS
// (baris 108) / ORDER_CATEGORY_OPTS (baris 115), bukan impor -- alasan sama
// DIRECTION_OPTIONS di atas (rule eksekusi membatasi berkas yang disentuh per
// tahap). Kalau salah satu sisi berubah nilainya, KEDUANYA wajib disunting
// bersama -- utang mirror, sama kelas dengan DIRECTION_OPTIONS/
// CUSTOMER_ROLE_OPTIONS.
const PRICING_BASIS_OPTIONS = ['Itemized charges', 'All in per CBM', 'All in per KG'];
const ORDER_CATEGORY_OPTIONS = ['Regular', 'Baking Tray', 'Trolley'];

// Putaran 14 Tahap 3 -- entitas SOA, dipakai gate dropdown Service Type
// (opsi 'trading' hanya muncul kalau inquiry.company_id === SOA_ID). Pola
// identik InquiryIntakeWizardPage.jsx baris 126.
const SOA_ID = entityByCode('SOA')?.id;

// Putaran 9 -- label manusiawi accounts.source (field "Source" di Service
// & Status, read-only). MIRROR CRMDashboardPage.jsx SOURCE_META /
// src/modules/crm/lead/lib/leadOptions.js (dua file itu milik domain
// lain, tidak diimpor -- alasan sama DIRECTION_OPTIONS di atas). Cakupan
// = nilai yang diizinkan CHECK prospects_source_check (schema_snapshot.sql)
// + 'whatsapp' (migrasi 20260830000004, LIVE).
const SOURCE_LABEL = {
  sales_visit: 'Sales Visit', cold_call: 'Cold Call', referral: 'Referral',
  existing_network: 'Existing Network', exhibition: 'Exhibition', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', whatsapp: 'WhatsApp', website: 'Website',
  walk_in: 'Walk In', other: 'Other',
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
  { id: 'OPEN',        label: STATUS_LABEL.OPEN },
  { id: 'IN_REVIEW',   label: STATUS_LABEL.IN_REVIEW },
  { id: 'QUOTED',      label: STATUS_LABEL.QUOTED },
  { id: 'NEGOTIATION', label: STATUS_LABEL.NEGOTIATION },
];
const DEAL_CLOSED_STATUS = ['WON', 'LOST', 'CANCELLED'];

// TD-318 Irisan 2 Inquiry, commit 2: "Inquiry Age" metric row. Fungsi MODUL
// (bukan di badan komponen) -- pola persis `ageDays()` InquiryListPage.jsx:96,
// supaya pemanggilan `Date.now()` tidak ditandai react-hooks/purity. Singular/
// plural persis mockup Inquiry Management.dc.html:708 (`n===1?' day':' days'`).
function inquiryAgeLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const n = Math.floor((Date.now() - d.getTime()) / 86400000);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

// TD-318 Irisan 2 Inquiry, commit 7 -- bar segmented "Time in each status"
// (mockup Detail/StatusHistory). Pola Date.now() modul, bukan badan render
// (sama alasan inquiryAgeLabel di atas).
function daysBetween(startIso, endIso) {
  const a = new Date(startIso).getTime();
  const b = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}
function daysLabel(n) {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/* Penunjuk langkah berikutnya — pengganti INFORMASI dari tombol arah-maju yang
   dicabut 8 Sep 2026 (blueprint §6: perpindahan status digerakkan DOKUMEN).
   Tombolnya hilang, tapi pengetahuan "apa yang harus kulakukan supaya deal ini
   maju" tidak boleh ikut hilang — itulah gunanya baris ini.
   [Putaran 16a Tahap 1] Diukur PERSIS mockup data-screen-label=
   "Detail/NextStep": background #F6F8F3 (C.bg, BUKAN navySoft lama) +
   border 1px solid #ECF0E9 (C.lineSoft, elemen yang SEBELUMNYA tidak ada
   di kode) + teks #33422B (C.text). Bukan warna peringatan: ini informasi,
   bukan error.
   Status tertutup (WON/LOST/CANCELLED) sengaja NOL render — tak ada langkah
   berikutnya untuk deal yang sudah selesai. */
// TD-318 Irisan 2 Inquiry, commit 8: teks disamakan KATA PER KATA ke mockup
// (Detail/NextStep, objek `NS` non-Rate-Sheet di renderVals()) atas
// instruksi eksplisit Mas. ⚠️ Teks QUOTED/NEGOTIATION mockup menyebut
// "sends a Shipment Instruction, or sends a PO" sebagai jalur WON otomatis
// -- hari ini Nexus TIDAK punya trigger yang menyala dari dua peristiwa
// itu (satu-satunya jalur WON LIVE: RPC manual mark_inquiry_won, atau
// trigger set_inquiry_won_on_so yang BELUM PERNAH menyala produksi, lihat
// komentar markInquiryLost di atas). Diikuti verbatim sesuai instruksi
// ("ubah hanya yang beda"), bukan ditebak/dikoreksi sendiri -- dilaporkan
// sebagai pertanyaan untuk Mas, bukan diselesaikan diam-diam di sini.
const NEXT_STEP_HINT = {
  OPEN:        'Start pricing: request rates, use a rate from the library, or create a quotation draft. Any of these moves the inquiry to In Review.',
  IN_REVIEW:   'Send the quotation to the customer and record the channel to advance to Quoted.',
  QUOTED:      'The inquiry is won as soon as the customer accepts the quotation, sends a Shipment Instruction, or sends a PO.',
  NEGOTIATION: 'The inquiry is won as soon as the customer accepts the quotation, sends a Shipment Instruction, or sends a PO.',
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
        background: C.bg,
        border: `1px solid ${C.lineSoft}`,
        color: C.text,
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
// CARGO_LABEL/SERVICE_ADDON_LABEL/mapLabels (peta id->label utk grup
// FIELD_GROUPS "Cargo"/"Additional Services" lama) dicabut Irisan 2
// lanjutan -- kedua grup sudah diganti section inline-edit, yang membaca
// label langsung dari CARGO_TYPES/SERVICES lewat ChipToggleField.

// PRF_SERVICE_LABEL dicabut D-79 (Putaran 10) -- kolom "Service Type" ikut
// tercabut bersama PRF_COLUMNS (tabel ListView digantikan kartu+stepper;
// mockup Detail/Procurement rReqs[] tidak menampilkan service_type di kartu).

// Keputusan Den (koreksi visual Putaran 10, lanjutan Tahap 2 -- masuk daftar
// pembaruan Claude Design): badge readiness pada kartu PRF HANYA dipertahankan
// untuk status CANCELLED/EXPIRED ("Not active") supaya PRF batal tetap
// terlihat di antara yang masih berjalan -- untuk status lain (SUBMITTED/
// ACKNOWLEDGED/QUOTED) badge DICABUT karena stepper 5 tahap di bawah sudah
// menyampaikan progres itu sendiri. PRF_READINESS 4-keadaan lama (ready/
// needs/awaiting) dan prfReadinessKey() dicabut bersamanya -- sudah tak
// terpakai begitu badge "Needs selection" (sumber prfNeedsSelectionCount,
// JUGA dicabut per keputusan Den: mockup `dtabs` baris 1032 nol field
// badge/count di tab mana pun) ikut hilang.
// [Putaran 16a Tahap 1, GAGAL ditutup] diukur PERSIS mockup: "Not active"
// -> QB['Not active']='N' -> SB.N=['#5C6B52','#EFF3ED','#D8E0D2'] = trio
// netral SEMANTIC (C.gray/grayBg/grayBd), bukan abu-abu literal terpisah.
const PRF_NOT_ACTIVE_BADGE = { label: 'Not active', bg: C.grayBg, color: C.gray, bd: C.grayBd };
function isPrfNotActive(p) {
  return ['CANCELLED', 'EXPIRED'].includes(String(p?.status || '').toUpperCase());
}

// D-79 (Putaran 10, dibangun ulang PERSIS mockup atas keputusan Mas) --
// stepper "Rate Requests" LIMA tahap (mockup Inquiry Management.dc.html:1130,
// `const st5 = ['Submitted','Acknowledged','Offers Received','Offer
// Selected','Used in Quotation']`; meta "[nama], [tanggal]"/"Pending" di
// baris 1144). Pemetaan ke kolom Nexus (nol migrasi, kolom semua SUDAH ADA):
//   Submitted         -- prf.submitted_at,     nama dari prf.created_by
//   Acknowledged      -- prf.acknowledged_at,  nama dari prf.acknowledged_by
//   Offers Received   -- prf.answered_at,      nama dari prf.answered_by
//   Offer Selected    -- prf.selected_at,      nama dari prf.selected_by
//   Used in Quotation -- quotations.created_at MILIK quotation ber-prf_id
//                        = id PRF ini, nama dari quotations.created_by
//                        (kolom diverifikasi ke schema_snapshot.sql, bukan
//                        ditebak). TIDAK butuh query .in() terpisah --
//                        `quotations` (state, sudah di-fetch per inquiry_id
//                        di titik fetch utama) sudah mencakup SEMUA
//                        quotation inquiry ini, termasuk punya PRF mana pun
//                        -- filter client-side cukup, zero query tambahan.
const PRF_STAGES = [
  { key: 'submitted', label: 'Submitted', atField: 'submitted_at', byField: 'created_by' },
  { key: 'acknowledged', label: 'Acknowledged', atField: 'acknowledged_at', byField: 'acknowledged_by' },
  { key: 'offersReceived', label: 'Offers Received', atField: 'answered_at', byField: 'answered_by' },
  { key: 'offerSelected', label: 'Offer Selected', atField: 'selected_at', byField: 'selected_by' },
  { key: 'usedInQuotation', label: 'Used in Quotation', atField: null, byField: null },
];
// `quotationsForInquiry` = state `quotations` dioper dari render (bukan
// closure modul) -- satu-satunya tahap yang butuhnya adalah usedInQuotation.
function prfStageInfo(p, key, quotationsForInquiry) {
  if (key === 'usedInQuotation') {
    const q = (quotationsForInquiry || []).find((x) => x.prf_id === p?.id);
    return { at: q?.created_at || null, by: q?.created_by || null };
  }
  const stage = PRF_STAGES.find((s) => s.key === key);
  return { at: p?.[stage.atField] || null, by: p?.[stage.byField] || null };
}
// q.active mockup (gerbang tombol Remind/Cancel): PRF masih menunggu jawaban
// Procurement. Dipakai JUGA sebagai gerbang tampilan tombol di FE -- HARUS
// sinkron dengan cek status di RPC prf_remind_procurement/prf_cancel_request
// (migrasi 20261027000006), supaya tombol yang terlihat = aksi yang diterima.
function isPrfRequestActive(p) {
  return ['SUBMITTED', 'ACKNOWLEDGED'].includes(String(p?.status || '').toUpperCase());
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
// D-74 (Putaran 10, rekonstruksi audit mockup Inquiry Management.dc.html
// Detail/Quotations -- 5 kolom: Quotation No / Version / Date / Value /
// Status): keputusan Mas eksplisit -- kolom Version TERPISAH ditambahkan DI
// SINI SAJA, dan Quotation No di tab ini tampil TANPA sufiks versi
// (formatQuotationNo tetap dipakai di 5 tempat LAIN di file ini -- header
// DocumentFlow/RelatedDocuments/audit log/confirm modal/QuotationItemsCard --
// SENGAJA tidak disentuh, lihat komentar impor). Kolom "No" (index baris) dan
// "Actions" (tombol View) dicabut -- redundan dengan onRowClick ListView yang
// sudah membuka Detail Quotation saat baris diklik; mockup juga tidak
// punya kolom Actions (navigasi lewat link di kolom Quotation No).
const QUOTATION_COLUMNS = [
  { key: 'quotation_no', label: 'Quotation No', render: (r) => (
    <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.navy }}>{r.quotation_no || '—'}</span>
  ) },
  { key: 'revision', label: 'Version', render: (r) => r.revision ?? 1 },
  { key: 'created_at', label: 'Date', render: (r) => fmtDate(r.created_at) },
  { key: 'total_amount', label: 'Value', align: 'right', render: (r) => (
    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRp(r.total_amount)}</span>
  ) },
  { key: 'status', label: 'Status', render: (r) => {
    const m = QUO_STATUS[String(r.status || '').toUpperCase()] || QUO_STATUS.DRAFT;
    return <TintBadge meta={m} />;
  } },
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

/* GRP_TITLE/GRP_MICRO (subjudul kelompok & label mikro kartu badan lama)
   keduanya sudah dicabut -- GRP_MICRO di TD-318 Irisan 2 Inquiry commit 4
   (RouteStrip menggantikan baris POL/POD polos), GRP_TITLE di Irisan 2
   lanjutan audit mockup (section inline-edit, lewat SectionHeader, sudah
   menggantikan seluruh grup FIELD_GROUPS yang dulu memakainya). */

// FIELD_GROUPS (grid 2-kolom generik lama, enam grup) dicabut Irisan 2
// lanjutan audit mockup -- seluruh enam grup sudah diganti section
// inline-edit satu demi satu (Service & Status/Route & Terms/Cargo/
// Additional Services/Timeline & Ownership/Value), masing-masing dengan
// field dan tata letak 3-kolom yang cocok ke mockup per section, bukan
// generik dua kolom.

const ACT_BTN = {
  height: 36, padding: '0 13px', borderRadius: 9,
  border: `1px solid ${C.border}`, background: C.surface, color: C.navy,
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
/* Irisan 2 Inquiry, putaran penutup (Task 2 -- audit tree menu Inquiry
   Management vs mockup, butir 4: teks breadcrumb). SEBELUMNYA ini sendiri
   adalah breadcrumb dua-segmen ad hoc ("Inquiry List > Inquiry Detail") --
   DUPLIKAT dengan breadcrumb SUNGGUHAN yang sudah dirender ContextHeader.jsx
   di luar komponen ini (layout tunggal route-table.jsx, lihat
   `useDetailCrumb` di bawah). Disederhanakan jadi "← Back to list" polos,
   pola PERSIS Lead Detail (TD-318, `LeadDetailPage.jsx:412`, komentarnya
   eksplisit: "Breadcrumb sendiri dirender ContextHeader.jsx di luar
   komponen ini") -- mockup sendiri juga punya DUA elemen terpisah (nav
   `crumbs` + link "Back to list" tersendiri di bawahnya), bukan satu
   breadcrumb ganda. */
function Breadcrumb({ onBack }) {
  return (
    <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: HEAD, fontSize: 13, fontWeight: 600, color: C.textMute }}>
      <ChevronLeft size={15} />Back to list
    </button>
  );
}

/* Judul dokumen. FormSheet merender `title` DI DALAM <h1>-nya sendiri, dan
   `{title}` menerima node apa pun — jadi nama akun tetap bisa diklik tanpa
   menambah prop baru ke kit. Cabang non-klik dipertahankan persis: akun kosong
   atau handler tak dikirim → teks polos, tanpa cursor pointer. */
/* TD-318 Irisan 2 Inquiry, commit 2 (keputusan Mas #1): nama akun sekarang
   link KECIL di bawah h1 (bukan h1 itu sendiri -- h1 = nomor inquiry, lihat
   FormSheet title di bawah). font:600 15px Inter persis Inquiry Management.dc.html
   :280 (`{{ D.cust }}`) -- 15px sudah ambient dari FormSheet, hanya weight 600
   yang perlu ditambah di sini. */
function DealTitle({ name, accountId, onViewCustomer }) {
  if (!(accountId && onViewCustomer)) return name || '—';
  return (
    <span
      className="dd-account-name"
      onClick={() => onViewCustomer(accountId)}
      title="View account details"
      style={{ cursor: 'pointer', fontWeight: 600 }}
    >
      {name || '—'}
    </span>
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
                        <th style={{ padding: '8px 12px', textAlign: 'left',   fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>Description</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>Cost Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>Currency</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>Sell Price</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>Unit Label</th>
                        <th style={{ padding: '8px 8px',  textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>QTY</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right',  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: C.textMute, background: C.surfaceAlt }}>Total IDR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row, ri) => (
                        <tr key={row.id || ri} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '9px 12px', color: C.text }}>{row.description || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.textMute, fontSize: 12 }}>
                            {(Number(row.cost_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: row.currency === 'USD' ? C.amber : C.textMute, fontWeight: 600, fontSize: 12 }}>
                            {row.currency || 'IDR'}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', color: C.text, fontSize: 12 }}>
                            {(Number(row.unit_price) || 0).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.textMute, fontSize: 12 }}>{row.unit_label || '—'}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', color: C.text, fontWeight: 600 }}>{row.qty || 1}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: row.currency !== 'IDR' ? C.amber : C.text, whiteSpace: 'nowrap' }}>
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
export default function DealDetailPage({ inquiryId, onBack, onCreateQuotation, onViewQuotation, onCreatePRF, onViewPRF, onViewCustomer, showToast }) {
  const { profile, erpRole, erpRoles, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inquiry, setInquiry] = useState(null);
  // Bugfix Irisan 4: inquiry_no inquiry yang DIPERTAHANKAN, diambil lewat
  // query TERPISAH (bukan embed) -- lihat catatan di titik fetch-nya di
  // bawah untuk alasan ambiguitas self-reference PostgREST. null = belum
  // ada duplikat, ATAU inquiry yang dipertahankan gagal dibaca (RLS/tidak
  // ditemukan) -- kedua kasus sengaja dibedakan dari "halaman tidak
  // ditemukan", lihat komentar di titik render.
  const [duplicateOfNo, setDuplicateOfNo] = useState(null);
  // Putaran 4 Tahap 4B, Task 2 -- baris inquiry_lanes (urut sort_order),
  // read-only. []  = belum ada lane sama sekali (inquiry lama, pra-Putaran 4)
  // ATAU baru 1 lane (block "Route Options" di bawah hanya tampil >1, lihat
  // titik render) -- kedua kasus sengaja tidak dibedakan di state ini.
  const [lanes, setLanes] = useState([]);
  const [account, setAccount] = useState(null);
  const [quotations, setQuotations] = useState([]);
  // TD-318 Irisan 3, commit 1 — node DocumentFlow "Sales Order" (baris
  // terbaru dari sales_orders.inquiry_id, null kalau belum ada).
  const [salesOrder, setSalesOrder] = useState(null);
  // Putaran 9 -- SELURUH baris sales_orders inquiry ini (bukan hanya yang
  // terbaru), dipakai DUA hal: (1) chip header "Won, awaiting Sales
  // Order" (perlu tahu ADA/TIDAKnya baris berstatus SENT, bukan cuma yang
  // terbaru), (2) blok "Shipments" khusus Rate Sheet (daftar penuh).
  const [salesOrders, setSalesOrders] = useState([]);
  // TD-318 Irisan 2 Inquiry, commit 7 — tab Status History. Bagian status.
  const [statusHistory, setStatusHistory] = useState([]);
  // Putaran 11 Tahap B -- bagian "owner" (ditunda commit 7 di atas,
  // "keputusan Mas") kini dikerjakan: baris inquiry_owner_history
  // digabung ke timeline yang SAMA dengan statusHistory di render (mockup
  // Inquiry Management.dc.html:855-864 -- satu array `changes`, diurut
  // tanggal terbaru-dulu, BUKAN dua daftar terpisah). State ini TETAP
  // terpisah dari statusHistory (ascending, dipakai statusHistorySegments
  // utk bar "Time in each status") -- penggabungan terjadi di
  // statusHistoryEvents saja, pola yang sama TIDAK menyentuh bar.
  const [ownerHistory, setOwnerHistory] = useState([]);
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
  // TD-318 Irisan 2 Inquiry, commit 4 (keputusan Mas #2): tab default Overview,
  // bukan Activity -- urutan lima tab: Overview/Quotation/PRF/Activity/Status History.
  const [tab, setTab] = useState('overview');
  // Tandai inquiry KALAH (Task 4, di-upgrade B3) — alasan kini dari MASTER
  // loss_reasons, bukan teks bebas WinLossModal.
  const [lossOpen, setLossOpen] = useState(false);
  const [lossSaving, setLossSaving] = useState(false);
  const [lossReasons, setLossReasons] = useState([]);
  // B3 — Batalkan deal (alasan teks bebas) + Mulai Negosiasi (tanpa form).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  // Tandai inquiry MENANG (jalur manual) — ConfirmModal polos (nol form alasan
  // diminta), RPC mark_inquiry_won yang menegakkan izin sebenarnya.
  const [wonOpen, setWonOpen] = useState(false);
  const [wonSaving, setWonSaving] = useState(false);
  // TD-318 Irisan 3, commit 4 -- pesan generik saat upload bukti ke bucket
  // inquiry-won-evidence gagal (final decision §9.6: toast + modal TETAP
  // TERBUKA supaya user bisa menekan "Yes, Mark as Won" lagi dengan file
  // yang sama, bukan tombol Retry tersendiri).
  const [wonUploadError, setWonUploadError] = useState('');
  // TD-318 Irisan 3, commit 5 -- Revert Manual Win.
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertSaving, setRevertSaving] = useState(false);
  // Putaran 15, Task 4 -- Change Account (ganti prospect_id/customer_id +
  // contact_id). Modal + RPC change_inquiry_account (20261027000007).
  const [changeAccountOpen, setChangeAccountOpen] = useState(false);
  const [changeAccountSaving, setChangeAccountSaving] = useState(false);
  // Ganti pemilik deal (owner_id) -- Putaran 11 Tahap B: panel inline
  // (satu dropdown, tanpa Reason/Notify) dicabut, diganti modal bersama
  // OwnerAssignModal.jsx (dipakai juga InquiryOwnerAssignmentPage.jsx).
  const [ownerAssignOpen, setOwnerAssignOpen] = useState(false);
  // TD-318 Irisan 3, commit 6 -- kebab (menu titik tiga).
  const [kebabOpen, setKebabOpen] = useState(false);
  // Batch 3C — pilih/ganti penawaran vendor (prf_select_offer). Konfirmasi
  // HANYA dibutuhkan saat MENGGANTI pilihan yang sudah ada; pilihan pertama
  // langsung jalan tanpa dialog.
  const [offerSwitchConfirm, setOfferSwitchConfirm] = useState({ open: false, prf: null, offer: null });
  const [offerActionBusy, setOfferActionBusy] = useState(false);
  // D-83/D-84 (Putaran 10) -- Remind Procurement/Cancel Request. Cancel
  // minta konfirmasi (mengubah status PRF); Remind tidak (satu-kali kirim
  // notifikasi, nol efek ke tabel prf -- pola sama mockup, tanpa modal).
  const [prfActionBusy, setPrfActionBusy] = useState(false);
  const [prfCancelConfirm, setPrfCancelConfirm] = useState({ open: false, prf: null });
  // Irisan 2 Inquiry, lanjutan audit mockup (Pekerjaan B) -- inline edit per
  // section tab Overview. SATU section aktif sekaligus (string|null, cermin
  // `editSec` mockup) -- mencegah dua section terbuka bersamaan yang bisa
  // saling timpa saat Save. `sectionDraft` = isi draft section yang sedang
  // diedit (cermin `dr` mockup, direset kosong tiap buka/tutup section).
  const [editingSection, setEditingSection] = useState(null);
  const [sectionDraft, setSectionDraft] = useState({});
  const [savingSection, setSavingSection] = useState(false);
  // Ronde "Lane Editor" -- section "Route Options" pakai state TERPISAH
  // dari `sectionDraft` (array, bukan field tunggal -- `sectionDraft` dibuat
  // utk objek field inquiry biasa, memaksa lane ke bentuk itu tidak jujur).
  // `editingSection === 'RouteOptions'` tetap berbagi mutual-exclusion
  // dengan enam section lain lewat `editingSection` yang sama.
  const [laneDraft, setLaneDraft] = useState([]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  // Irisan 6 -- daftar locations SEKALI untuk kedua LocationPicker (POL+POD,
  // section "Route & Terms" edit mode) -- kit LocationPicker murni
  // presentasional, tidak fetch sendiri (lihat header src/kit/LocationPicker.jsx).
  const [locations, setLocations] = useState([]);
  useEffect(() => {
    supabase.from('locations').select('id, code, name, country, type, active').order('name').limit(1000)
      .then(({ data }) => setLocations(data || []));
  }, []);
  // Ronde "Lane Editor" -- Mode/Load unit utk LaneTable section "Route
  // Options" (pola sama InquiryIntakeWizardPage.jsx, dua dropdown ini belum
  // pernah dipanggil di halaman ini sebelumnya).
  const { options: laneModeOpts } = useDropdownOptions('lane_mode', LANE_MODE_FALLBACK);
  const { options: laneUnitOpts } = useDropdownOptions('lane_unit', LANE_UNIT_FALLBACK);
  // Koreksi review Vir: Location Master dikelola HANYA super_admin
  // (Keputusan Den) -- manager/role lain memakai jalur onRequest, bukan
  // onManage, sama seperti sales.
  const canManageLocations = isSuperAdmin(erpRoles);
  const openLocationMaster = () => navigate('/admin-settings/locations');
  const requestNewLocation = (name, note) => {
    supabase.rpc('request_new_location', { p_name: name, p_note: note }).then(({ error }) => {
      showToast?.(error ? 'Failed to send request: ' + error.message : 'Request sent to managers.', error ? 'error' : 'success');
    });
  };

  useEffect(() => {
    if (!inquiryId) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data: inq, error: e1 } = await supabase
        .from('inquiries')
        .select('id, inquiry_no, service_type, route, estimated_volume, estimated_value, status, notes, prospect_id, created_by, owner_id, created_at, deadline_quote, pol, pod, pol_location_id, pod_location_id, pickup_address, delivery_address, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, dimension, cargo_types, un_number, imo_class, has_msds, additional_services, company_id, company:companies!inquiries_company_id_fkey(code, name), contact_id, contact:contacts!inquiries_contact_id_fkey(name), won_reason, duplicate_of_id, inquiry_type, validity_from, validity_to, monthly_volume_cbm, direction, customer_role, pricing_basis, cargo_ready_date, n_containers, closed_at, order_category, requested_delivery_date, estimated_shipping_cost, customer_reference')
        .eq('id', inquiryId).is('deleted_at', null).maybeSingle();
      if (cancelled) return;
      if (e1 || !inq) { setNotFound(true); setLoading(false); return; }

      // Bugfix Irisan 4, diganti Putaran 3 Tahap 3A (Lingkup E): inquiry_no
      // inquiry yang dipertahankan dibaca lewat RPC SECURITY DEFINER
      // get_duplicate_of_inquiry_no (migrasi 20261024000002) -- BUKAN lagi
      // query langsung ke `inquiries` (yang gagal SENYAP untuk sales bukan
      // owner target, lihat riwayat di bawah) DAN BUKAN embed PostgREST
      // `duplicate_of:inquiries!inquiries_duplicate_of_id_fkey(...)` pada
      // select utama di atas -- embed self-reference (inquiries menunjuk
      // inquiries lewat FK yang sama) AMBIGU bagi PostgREST, membuat select
      // UTAMA gagal total untuk SETIAP inquiry (bukan hanya yang ber-
      // duplicate_of_id), persis yang dilaporkan dari staging saat Irisan 4.
      // RPC ini menggantikan try/catch lama: gerbangnya sendiri (replika
      // persis USING inquiries_read) menentukan NULL vs nomor asli --
      // bedanya dari query langsung, sales pemilik inquiry Duplicate kini
      // BISA membaca nomor Kept walau Kept dimiliki sales lain (itulah
      // tujuan RPC ini ada), bukan selalu jatuh ke '--' seperti sebelumnya.
      // Dibungkus try/catch sendiri, TETAP TIDAK PERNAH memicu setNotFound --
      // kegagalan apa pun di titik ini (jaringan, dll) bukan alasan membuat
      // HALAMAN INI gagal, cuma teksnya jatuh ke '—'.
      let duplicateOfNoValue = null;
      if (inq.duplicate_of_id) {
        try {
          const { data: dupNo } = await supabase
            .rpc('get_duplicate_of_inquiry_no', { p_inquiry_id: inq.id });
          duplicateOfNoValue = dupNo || null;
        } catch {
          duplicateOfNoValue = null;
        }
      }

      let acc = null;
      if (inq.prospect_id) {
        const { data } = await supabase
          .from('accounts')
          .select('id, name, assigned_to, pic_name, estimated_closing_date, lifecycle_stage, created_at, source')
          .eq('id', inq.prospect_id).maybeSingle();
        acc = data || null;
      }

      // Putaran 4 Tahap 4B, Task 2 -- Route Options (inquiry_lanes, migrasi
      // 20261025000001). Query TERPISAH dari `inquiries` di atas -- BUKAN
      // embed (rule "jangan embed inquiries ke inquiries", dan tabel ini
      // toh anak dari inquiries, bukan inquiries itu sendiri). RLS
      // inquiry_lanes_read mengikuti RLS inquiries_read via EXISTS polos
      // (lihat migrasi) -- nol filter company/owner tambahan perlu di sini.
      // Ronde "Lane Editor" -- *_location_id ditambahkan (sebelumnya nol,
      // cukup untuk tabel read-only lama tapi TIDAK CUKUP untuk LaneTable
      // mode edit, yang butuh `value` numerik buat tiap LocationPicker).
      const { data: laneRows } = await supabase
        .from('inquiry_lanes')
        .select('id, sort_order, pol_location_id, pod_location_id, via_location_id, pol, pod, via, mode, load_unit')
        .eq('inquiry_id', inq.id)
        .order('sort_order', { ascending: true })
        .limit(1000);

      const { data: quos } = await supabase
        .from('quotations')
        // D-79 (Putaran 10, stepper 5 tahap) -- prf_id/created_by ditambah:
        // tahap "Used in Quotation" dicek dari quotation yang prf_id-nya =
        // id PRF, "siapa"-nya dari created_by. Query ini SUDAH inquiry-
        // scoped (bukan query baru per-PRF) -- nol risiko N+1, nol alasan
        // ganti .limit(1000) jadi .range() (1000 quotation untuk SATU
        // inquiry bukan kasus nyata; limit sudah ada sebelum Putaran 10).
        .select('id, quotation_no, revision, total_amount, status, valid_until, created_at, updated_at, payment_terms_id, deleted_at, prf_id, created_by')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1000);

      // TD-318 Irisan 3, commit 1 — node DocumentFlow "Sales Order". Baris
      // terbaru dipakai node itu (so). "Purchase Order" TETAP "Not yet"
      // permanen: nol tabel di Nexus yang merepresentasikan PO vendor
      // (lihat PLAN Irisan 3 §1g/§9.9) — tidak disentuh di sini.
      // Putaran 9 -- limit dinaikkan 1 -> 50: chip "Won, awaiting Sales
      // Order" butuh tahu ADA/TIDAKnya baris SENT di ANTARA SEMUA baris
      // (bukan cuma yang terbaru), dan blok "Shipments" (Rate Sheet) perlu
      // daftar penuh.
      // Putaran 9 perbaikan (review merge p7/p13a) -- KOREKSI komentar lama
      // di baris ini: `sales_orders.deleted_at` TERNYATA ADA (diverifikasi
      // ulang langsung ke schema_snapshot.sql, bukan dipercaya dari
      // komentar lama Irisan 3 yang keliru). Difilter di query (pola sama
      // `quotations`/`prf` di atas) -- bukan cuma dikirim ke
      // isWonAwaitingSalesOrder (yang juga memeriksa `!so.deleted_at`
      // sendiri, lihat inquiryOptions.js), supaya SELURUH pemakai `so`/
      // `salesOrders` di halaman ini (node DocumentFlow, blok Shipments)
      // ikut tidak pernah melihat baris yang sudah soft-delete.
      const { data: soRows } = await supabase
        .from('sales_orders')
        .select('id, so_no, status, created_at')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50);
      const so = (soRows || [])[0] || null;

      // PRF born from this inquiry (RLS-scoped as-is — sales sees only own PRF).
      // D-79/D-83/D-84 (Putaran 10): company_id (gerbang Remind/Cancel scoped
      // ke entitas PRF, pola RPC is_manager_or_above_in) + deadline_quotation/
      // submitted_at/acknowledged_at/acknowledged_by/answered_at (stepper +
      // "Needed by"/"Over target", kolom SUDAH ADA di `prf`, sebelumnya tak
      // ter-select).
      const { data: prfRows } = await supabase
        .from('prf')
        // D-79 (Putaran 10, stepper 5 tahap, keputusan Mas) -- answered_by/
        // selected_at/selected_by ditambah (kolom SUDAH ADA di `prf`, lihat
        // komentar PRF_STAGES) -- "siapa"/"kapan" tahap Offers Received dan
        // Offer Selected.
        .select('id, prf_no, service_type, status, created_at, created_by, company_id, selected_offer_id, min_offers_waiver_reason, deadline_quotation, submitted_at, acknowledged_at, acknowledged_by, answered_at, answered_by, selected_at, selected_by')
        .eq('inquiry_id', inq.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200);

      // Batch 3C — untuk PRF berstatus QUOTED, tarik penawaran vendornya (read-only;
      // RLS prf_vendor_offers_select/prf_cost_items_select sudah mengizinkan sales
      // pembuat PRF membaca lewat EXISTS ke prf.created_by, tak perlu policy baru)
      // + total biaya per penawaran (dari prf_cost_items, dikelompokkan per offer_id).
      // D-80 (Putaran 10): valid_until/notes ditambah ke select (kolom SUDAH ADA
      // di prf_vendor_offers) -- dipakai kartu "Vendor Offers" flat (mockup
      // Detail/Procurement offers[].until/.notes).
      const quotedPrfIds = (prfRows || []).filter((p) => p.status === 'QUOTED').map((p) => p.id);
      const offersByPrf = {};
      if (quotedPrfIds.length) {
        const { data: offerRows } = await supabase
          .from('prf_vendor_offers')
          .select('id, prf_id, vendor_id, currency, valid_until, notes, pros, cons, vendor:vendors!prf_vendor_offers_vendor_id_fkey(name)')
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
            validUntil: o.valid_until,
            notes: o.notes,
            totals: totalsByOffer[o.id] || {},
            pros: o.pros,
            cons: o.cons,
          });
        });
      }
      const prfsAugmented = (prfRows || []).map((p) => (
        p.status === 'QUOTED' ? { ...p, vendorOffers: offersByPrf[p.id] || [] } : p
      ));

      // TD-318 Irisan 2 Inquiry, commit 7 — tab Status History, bagian status
      // SAJA (pola query activityFeed.js:129-141, di sini di-filter `inquiry_id`
      // per inquiry ini, bukan diambil dari feed gabungan lintas-CRM).
      const { data: historyRows } = await supabase
        .from('inquiry_status_history')
        .select('id, from_status, to_status, changed_by, changed_at, reason')
        .eq('inquiry_id', inq.id)
        .order('changed_at', { ascending: true }).limit(200);

      // Putaran 11 Tahap B -- riwayat owner (inquiry_owner_history,
      // 20261027000002), bagian "owner" yang ditunda commit 7 di atas.
      // RLS SELECT = pola inquiry_status_history_select (siapa pun yang
      // boleh membaca inquiry induknya) -- nol filter company_id/role
      // tambahan diperlukan di query ini.
      const { data: ownerHistoryRows } = await supabase
        .from('inquiry_owner_history')
        .select('id, from_owner_id, to_owner_id, reason, changed_by, changed_at')
        .eq('inquiry_id', inq.id)
        .order('changed_at', { ascending: true }).limit(200);

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
      // D-79 (Putaran 10, stepper 5 tahap) -- "siapa" per tahap PRF
      // (created_by/acknowledged_by/answered_by/selected_by) + pembuat
      // quotation (tahap Used in Quotation) ditambah ke SATU query profiles
      // yang sudah ada ini -- bukan query .in() kedua.
      const pIds = [...new Set([
        acc?.assigned_to, inq.created_by, inq.owner_id,
        ...(historyRows || []).map((h) => h.changed_by),
        // Putaran 11 Tahap B -- riwayat owner (from/to/changed_by) ikut
        // satu query profiles ini, bukan query .in() kedua.
        ...(ownerHistoryRows || []).flatMap((h) => [h.from_owner_id, h.to_owner_id, h.changed_by]),
        ...prfsAugmented.flatMap((p) => [p.created_by, p.acknowledged_by, p.answered_by, p.selected_by]),
        ...(quos || []).map((q) => q.created_by),
      ].filter(Boolean))];
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
      setDuplicateOfNo(duplicateOfNoValue);
      setLanes(laneRows || []);
      setAccount(acc);
      setQuotations(quos || []);
      setSalesOrder(so);
      setSalesOrders(soRows || []);
      setPrfs(prfsAugmented);
      setStatusHistory(historyRows || []);
      setOwnerHistory(ownerHistoryRows || []);
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
  // Cetak PRF — cek SELURUH role aktif (erpRoles), bukan erpRole (role primer).
  // User multi-role (mis. manager+sales) sebelumnya kehilangan tombol ini karena
  // role prioritas lebih tinggi menutupi 'sales' di erpRole. Cermin RLS prf_insert
  // (daftar role = PRF_CREATOR_ROLES, helper canCreatePrf di src/lib/roles.js).
  const canCreatePRF = canCreatePrf(erpRoles);
  // D-83/D-84 (Putaran 10) -- gerbang tampilan tombol Remind/Cancel HARUS
  // sama dengan gerbang RPC prf_remind_procurement/prf_cancel_request
  // (migrasi 20261027000006): pembuat PRF, manager ke atas DI ENTITAS PRF
  // (companyId di-scope ke p.company_id, bukan isManagerOrAbove global),
  // atau super admin.
  function canActOnPrf(p) {
    return p?.created_by === profile?.id
      || isManagerOrAbove(erpRoles, { companyId: p?.company_id })
      || isSuperAdmin(erpRoles);
  }
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
  // Aksi "Mark as Won" — TD-318 Irisan 3: gate OWNER/MANAGER (final decision
  // #1), menggantikan isInquiryCreator (created_by) yang dipakai sementara
  // sejak sprint 8 Sep. owner_id adalah sumbu kepemilikan RESMI sejak 18 Sep
  // (bukan created_by — dua kolom berbeda, lihat gotcha #18/komentar
  // canReassignOwner di bawah). isManagerOrAbove di-scope ke company_id
  // INQUIRY ITU (bukan company home user) — cermin PERSIS gate server
  // is_manager_or_above_in(v_company_id) di RPC mark_inquiry_won/
  // revert_manual_win. Gate UI murni UX; RPC yang menegakkan izin sebenarnya.
  const isInquiryOwner = !!(inquiry?.owner_id && profile?.id && inquiry.owner_id === profile.id);
  const canMarkWon = (
    isInquiryOwner
    || isManagerOrAbove(erpRoles, { companyId: inquiry?.company_id })
    || isAllEntities(erpRoles)
  ) && LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase());
  // Ronde "Lane Editor" (K3, keputusan Mas) -- tombol Edit "Route Options"
  // memakai gerbang PERAN yang SAMA BENTUKNYA dengan canMarkWon (owner_id/
  // isManagerOrAbove/isAllEntities) + gerbang status LOSABLE_INQUIRY_STATUS
  // -- konstanta SENDIRI (bukan reuse canMarkWon langsung), karena ini aksi
  // berbeda yang kebetulan gate-nya sama hari ini; kalau canMarkWon berubah
  // alasan Won-spesifik di masa depan, Route Options tidak ikut berubah
  // diam-diam. Ini HANYA menyembunyikan tombol bagi yang tak berhak --
  // RPC update_inquiry_lanes tetap gerbang sebenarnya (SECURITY DEFINER,
  // gate server-side identik bentuknya).
  const canEditRouteOptions = (
    isInquiryOwner
    || isManagerOrAbove(erpRoles, { companyId: inquiry?.company_id })
    || isAllEntities(erpRoles)
  ) && LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase());
  // Putaran 4 Tahap 4C -- "Rate Sheet Request" write-once (ditulis hanya
  // oleh create_inquiry_with_lanes saat Create) -- nol jalur edit untuk
  // inquiry_type itu sendiri dari Detail Inquiry, hanya field turunannya
  // (Validity/Volume) yang bisa diedit lewat section "Route & Terms" di bawah.
  const isInquiryRS = inquiry?.inquiry_type === 'Rate Sheet Request';

  // ---------- Putaran 9 -- chip header turunan data ----------
  // Lookup lokasi by id (Irisan 6 -- state `locations` sudah memuat kolom
  // `type`). Dipakai chip "Free Trade Zone" di bawah.
  const locationById = useMemo(() => {
    const m = {};
    locations.forEach((l) => { m[l.id] = l; });
    return m;
  }, [locations]);
  // FTZ -- keputusan Mas (Putaran 9): FTZ bila POL, POD, ATAU Via pada
  // SALAH SATU lane bertipe FTZ (mockup base() :723, `r.lanes ? ... :
  // [pol,pod,via]`); kalau inquiry tidak punya lane, pakai pol/pod milik
  // inquiry. `inquiries` TIDAK punya kolom `via` sendiri (hanya
  // `inquiry_lanes.via_location_id`) -- untuk kasus nol-lane, via memang
  // tidak ada yang dicek, konsekuensi alami skema, bukan kelalaian.
  // Putaran 9 perbaikan (review merge p7/p13a) -- dibandingkan byte-per-
  // byte dengan InquiryListPage.jsx isFTZ (Putaran 7): LOGIKANYA SAMA
  // (OR per lane vs flatMap+some global = setara; fallback nol-lane sama
  // persis "pol/pod inquiry saja, nol via" dengan alasan skema yang sama).
  // Nol perubahan perlu di sini -- dicatat supaya perbandingannya
  // terlihat, bukan diasumsikan.
  const isLocationFtz = (id) => !!id && locationById[id]?.type === 'FTZ';
  const isInquiryFtz = lanes.length > 0
    ? lanes.some((l) => isLocationFtz(l.pol_location_id) || isLocationFtz(l.pod_location_id) || isLocationFtz(l.via_location_id))
    : isLocationFtz(inquiry?.pol_location_id) || isLocationFtz(inquiry?.pod_location_id);

  // Won, awaiting Sales Order -- Putaran 9 perbaikan (review merge p7/p13a):
  // dipindah ke fungsi BERSAMA `isWonAwaitingSalesOrder` (inquiryOptions.js),
  // persis instruksi komentar di file itu ("WAJIB dipakai ulang oleh
  // DealDetailPage.jsx"). Rumus lokal sebelumnya (duplikat, bukan lagi
  // dipakai di sini) sudah byte-cocok dengan fungsi bersama ini -- lihat
  // inquiryOptions.js untuk definisi lengkap + alasannya. `salesOrders`
  // sudah difilter `deleted_at IS NULL` di query (lihat fetch di atas),
  // jadi `!so.deleted_at` di dalam fungsi bersama selalu benar untuk baris
  // yang sampai ke sini -- bukan redundan yang salah, hanya tidak pernah
  // menyala karena baris mati sudah tersaring lebih dulu.
  const isWonAwaitingSo = isWonAwaitingSalesOrder(
    { status: inquiry?.status, inquiry_type: inquiry?.inquiry_type, closed_at: inquiry?.closed_at },
    salesOrders,
  );

  // Quotation expired -- Putaran 9 perbaikan (review merge p7/p13a): samakan
  // PERSIS ke InquiryListPage.jsx isQuotationExpired (Putaran 7). Dua bagian:
  // (a) "hari ini" WIB (getTodayWIB(), src/lib/dateUtils.js -- lib bersama
  //     existing, sudah dipakai InquiryListPage.jsx juga, bukan file baru).
  //     new Date().toISOString().slice(0,10) adalah UTC: antara 00:00-06:59
  //     WIB ia mengembalikan tanggal KEMARIN, badge jadi telat muncul.
  // (b) pemilihan quotation yang diperiksa -- List memakai quotation
  //     PERTAMA yang statusnya BUKAN ACCEPTED/REJECTED/SUPERSEDED (urutan
  //     array, bukan rantai revisi), BUKAN `activeQuotation` (hasil
  //     `pickActiveQuotation`, dipakai TETAP apa adanya di tempat lain
  //     halaman ini -- Price Breakdown/tombol Create Revision, TIDAK
  //     disentuh perbaikan ini). Untuk kasus umum (satu rantai versi per
  //     inquiry) keduanya mengarah ke baris yang sama; disamakan di sini
  //     supaya definisinya byte-cocok dengan List untuk kasus legacy
  //     multi-quotation_no juga, bukan cuma kebetulan sama di kasus umum.
  const todayIso = getTodayWIB();
  const quotationForExpiryCheck = quotations.find((q) => !['ACCEPTED', 'REJECTED', 'SUPERSEDED'].includes(String(q.status || '').toUpperCase()));
  const isQuotationExpired = ['QUOTED', 'NEGOTIATION'].includes(dealStatus)
    && !!quotationForExpiryCheck && !!quotationForExpiryCheck.valid_until
    && quotationForExpiryCheck.valid_until < todayIso;

  // D-79 (Putaran 10) -- "Over target" (mockup Detail/Procurement rReqs[].late):
  // PRF masih aktif (belum dijawab) DAN deadline_quotation sudah lewat hari
  // ini (WIB, pola sama isQuotationExpired di atas).
  function isPrfLate(p) {
    return !!p?.deadline_quotation && p.deadline_quotation < todayIso && isPrfRequestActive(p);
  }

  // D-80 (Putaran 10) -- "Vendor Offers" mockup = satu section FLAT lintas
  // seluruh PRF inquiry ini (bukan dikelompokkan per kartu PRF seperti
  // sebelumnya). min_offers_waiver_reason & prf_no induk disalin ke setiap
  // offer supaya konteksnya tidak hilang saat diratakan -- "Use This Offer"
  // tetap butuh tahu PRF mana yang dipilih (prf_select_offer per-PRF).
  const allVendorOffers = prfs.flatMap((p) => (
    (p.vendorOffers || []).map((o) => ({ ...o, prf: p }))
  ));

  // notGT -- mockup Inquiry Management.dc.html :1092 (`notGT: cur.svc !==
  // 'General Trading'`). Menggerbang field "Customer Role" (Service &
  // Status) persis sama cara mockup menggerbangnya -- berbasis nilai
  // KOMITMEN inquiry.service_type, bukan draft, pola sama isInquiryRS dkk.
  const notGT = inquiry?.service_type !== 'trading';
  // Putaran 14 Tahap 3 -- mockup :1092 (`isGT: cur.svc === 'General
  // Trading'`), komplemen notGT. Menggerbang seluruh blok Route & Terms/
  // Route Options/Cargo/Additional Services (mockup :317-362, SATU blok
  // notGT yang sama) + section "Delivery" baru (GT-only, kebalikannya).
  const isGT = !notGT;

  // Source (accounts.source) -- label manusiawi, read-only (arah tulis
  // balik belum diputuskan Mas). Section "Service & Status".
  const accountSourceLabel = account?.source ? (SOURCE_LABEL[account.source] || account.source) : '';

  // "Number of containers" (Cargo) -- mockup :960 `showNcont:
  // (cur.cont||[]).some(c => /^FCL/.test(c))`. Baca-saja TOTAL, mockup
  // sendiri nol varian edit untuk field ini (tidak ada di whitelist saveSec).
  const showNcont = (inquiry?.container_types || []).some((c) => /^FCL/.test(c));

  // Blok "Shipments" (Delivery, khusus Rate Sheet) -- mockup :402, data-
  // screen-label="Detail/Shipments". Daftar urut TERLAMA-DULU (kebalikan
  // query yang mengurutkan terbaru-dulu untuk kebutuhan node DocumentFlow).
  const shipmentRows = isInquiryRS ? salesOrders.slice().reverse() : [];

  // TD-318 Irisan 3, commit 4: aksi utama dinamis (final decision #9.1 --
  // "Request Rates" di mockup TIDAK dibangun, Open+In Review SAMA-SAMA
  // "Create Quotation"). Status QUOTED/NEGOTIATION primary-nya "Mark as
  // Won" (lihat render, bukan dihitung di sini -- butuh canMarkWon yang
  // sudah computed di atas). WON/LOST/CANCELLED nol primary action.
  const showCreateQuotationPrimary =
    ['OPEN', 'IN_REVIEW'].includes(String(inquiry?.status || 'OPEN').toUpperCase()) && !!onCreateQuotation;
  // TD-318 Irisan 3, commit 5 -- chip "Manual win" + link "Revert Manual
  // Win". isManualWin = won_reason ADA di whitelist 4 alasan (BUKAN
  // "<> 'Accepted quotation'" -- staging punya baris won_reason teks bebas
  // yang bukan salah satu dari 4 ini dan bukan juga 'Accepted quotation';
  // whitelist positif menolak keduanya, sama persis gate revert_manual_win
  // di DB). canRevertWon: Manager ke atas DI ENTITAS inquiry ATAU Super
  // Admin -- BUKAN owner (final decision #2, beda dari canMarkWon).
  const isManualWin = dealStatus === 'WON' && WON_MANUAL_REASONS.includes(inquiry?.won_reason);
  const canRevertWon = isManualWin
    && (isManagerOrAbove(erpRoles, { companyId: inquiry?.company_id }) || isAllEntities(erpRoles));
  // TD-318 Irisan 3, commit 6 -- kebab (mockup :1029 showDMenu). Terminal =
  // kebalikan LOSABLE_INQUIRY_STATUS (OPEN/IN_REVIEW/QUOTED/NEGOTIATION).
  // Pengecualian: Won TANPA Sales Order nyata (state `salesOrder`, commit 1)
  // tetap menampilkan kebab -- mockup `st==='Won' && !cur.so`.
  const isTerminalStatus = !LOSABLE_INQUIRY_STATUS.includes(dealStatus);
  const showKebab = !isTerminalStatus || (dealStatus === 'WON' && !salesOrder);

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
         `trg_z_lock_inquiry_owner` yang mengunci owner_id sesudah status closed.
     Putaran 11 Tahap B (Keputusan Den, prompt 40 jawaban 2): `isManagerOrAbove`
     diselaraskan ke LINGKUP ENTITAS inquiry ini -- gate FE sebelumnya GLOBAL
     (tanpa `{companyId}`), lebih longgar dari gate RPC
     reassign_inquiry_owner sendiri yang entity-scoped
     (`is_manager_or_above_in(v_company_id)`, 20261027000003). Manager entitas
     LAIN yang dulu melihat tombol ini pada inquiry entitas asing kini tidak
     lagi melihatnya (tombolnya akan GAGAL di RPC kalau diklik, konsisten
     canChangeAccount/canMarkWon yang sudah entity-scoped sejak awal) --
     pola PERSIS canChangeAccount di bawah. Manager di entitasnya sendiri
     TIDAK terdampak. */
  const canReassignOwner =
    LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase())
    && (isManagerOrAbove(erpRoles, { companyId: inquiry?.company_id }) || isAllEntities(erpRoles));
  // Putaran 15, Task 4 -- Change Account. Gate SAMA BENTUKNYA dgn
  // canMarkWon/canRevertWon (owner_id TIDAK ikut -- beda dari
  // canReassignOwner di atas yang global/bukan entity-scoped): manager-ke-
  // atas DI ENTITAS inquiry ini, atau super admin. Disetujui eksplisit Den,
  // Putaran 15 -- lebih ketat dari form lama (InquiryFormPage.jsx) yang nol
  // gerbang role sama sekali (RLS inquiries_update meloloskan owner_id
  // JUGA, bukan hanya manager-ke-atas).
  const canChangeAccount =
    LOSABLE_INQUIRY_STATUS.includes(String(inquiry?.status || 'OPEN').toUpperCase())
    && (isManagerOrAbove(erpRoles, { companyId: inquiry?.company_id }) || isAllEntities(erpRoles));
  // Quotation/PRF hidup untuk inquiry ini mengunci Change Account (RPC
  // menolak keras; ini hanya membuat tombolnya disabled+tooltip, bukan
  // hilang -- pola Putaran 10, PRFDetailPage.jsx:929 `quotationBlockReason`).
  // `quotations`/`prfs` SUDAH di-fetch inquiry-scoped + deleted_at-filtered
  // di effect data loading di atas -- nol fetch baru di sini.
  const changeAccountBlockReason = (quotations.length > 0 || prfs.length > 0)
    ? 'Not available: this inquiry already has a quotation or PRF.'
    : null;
  const ownerName = profMap[inquiry?.owner_id] || null;

  // Putaran 11 Tahap C -- data turunan utk modal Won/Lost/Cancel, SELURUHNYA
  // dari `quotations`/`prfs`/`salesOrders`/`account`/`profile` yang SUDAH
  // di-fetch (nol query baru di sini, konsisten pola changeAccountBlockReason
  // di atas).
  //
  // Quotation yang akan disentuh trigger trg_fn_quotation_auto_close_on_
  // inquiry_closed (LIVE, 20261022000002) kalau inquiry ini jadi LOST/
  // CANCELLED -- WHERE status IN ('DRAFT','SUBMITTED','SENT'), nol
  // perbedaan perlakuan antar ketiganya (REJECTED + alasan sama). Dipakai
  // AffectedDocuments (Lost/Cancel) -- lihat header DealCloseModals.jsx.
  const activeQuotationForClose = quotations.find((q) =>
    ['DRAFT', 'SUBMITTED', 'SENT'].includes(String(q.status || '').toUpperCase()));
  // PRF "terbuka" (bukan CANCELLED/EXPIRED) -- status-saja, TANPA klaim
  // "akan dibatalkan" (nol trigger otomatis membatalkan PRF).
  const openPrfsForClose = prfs.filter((p) =>
    !['CANCELLED', 'EXPIRED'].includes(String(p.status || '').toUpperCase()));
  // Quotation SENT -- gate PERSIS `canRecordOutcome` QuotationDetailPage.jsx:410
  // (canAct && !isInquiryClosed && isLatestRevision && status==='SENT'); di
  // sini dipakai HANYA utk menunjukkan banner saran, bukan menggerbang apa
  // pun -- pemanggil `onOpenQuotation` membuka Detail Quotation yang gate
  // "Record Outcome"-nya sendiri sudah benar.
  const sentQuotationForWon = quotations.find((q) => String(q.status || '').toUpperCase() === 'SENT');
  // "First win" -- account BELUM customer. Koreksi Vir: kode akun
  // (MSI0001 dst) dibuat SAAT akun di-INSERT (trg_z_gen_account_code_ins),
  // BUKAN saat Won pertama -- banner TIDAK menyebut kode apa pun.
  const isFirstWinForAccount = account && account.lifecycle_stage !== 'customer';
  // Supervisor PEMANGGIL RPC (auth.uid()), BUKAN pemilik inquiry -- cermin
  // persis mark_inquiry_won (20261021000001:173).
  const hasSupervisorForWon = !!profile?.reports_to;
  // Cancel: SO hidup mengunci Cancel Inquiry -- RPC tetap penjaga
  // sebenarnya (UPDATE langsung inquiries, bukan RPC -- lihat
  // markInquiryCancel; ini murni UX disabled+tooltip, pola PERSIS
  // changeAccountBlockReason di atas). `salesOrders` SUDAH di-fetch
  // inquiry-scoped + deleted_at-filtered (Putaran 9).
  const cancelBlockReason = salesOrders.length > 0
    ? `Not available. ${salesOrders.length} shipment Sales Order${salesOrders.length === 1 ? '' : 's'} already exist under this inquiry.`
    : null;
  // TD-318 Irisan 2 Inquiry, commit 2: "Inquiry Age" metric row -- `Date.now()`
  // ditaruh di fungsi modul `inquiryAgeLabel()` (bukan langsung di badan
  // komponen), pola PERSIS `ageDays()` InquiryListPage.jsx:96 -- react-hooks/
  // purity hanya menandai pemanggilan Date.now() LANGSUNG di badan render.
  const inquiryAge = inquiryAgeLabel(inquiry?.created_at);
  // TD-318 Irisan 2 Inquiry, commit 5: node rantai dokumen (mockup Detail/
  // DocumentFlow). "Rate Request" mockup = PRF Nexus (nama tab TIDAK diubah --
  // lihat komentar src/kit/DocumentFlow.jsx). Job Order/Carrier Booking/
  // Invoice SELALU "none" -- mockup SENDIRI hardcode begitu (modul itu belum
  // ada di CRM fiktif mockup juga). [TD-318 Irisan 3, commit 1] Sales Order
  // kini data-driven dari `salesOrder` (state, diisi query `sales_orders`
  // di effect fetch utama) -- nol link ke halaman Detail SO (modul itu belum
  // dibangun Nexus, sama seperti node 'inquiry' di atas yang juga no-op).
  // Purchase Order TETAP "none" permanen -- nol tabel di Nexus yang
  // merepresentasikan PO vendor (PLAN Irisan 3 §1g/§9.9, dilaporkan bukan
  // ditebak).
  const documentFlowNodes = [
    {
      type: 'lead', active: false,
      label: account?.lifecycle_stage === 'customer' ? 'Customer' : 'Lead',
      state: account?.name ? 'name' : 'none',
      value: account?.name,
      onClick: () => account?.id && onViewCustomer?.(account.id),
    },
    {
      type: 'inquiry', active: true, label: 'Inquiry', state: 'doc',
      // Fix: `?.` -- `documentFlowNodes` dihitung TANPA SYARAT di setiap
      // render (termasuk render pertama saat `inquiry` masih null, sebelum
      // guard `if (loading)`/`if (!inquiry)` di bawah) -- akses langsung
      // `inquiry.inquiry_no` di sini crash "Cannot read properties of null"
      // pada SETIAP pembukaan Detail Inquiry. Node 'lead' persis di atas
      // sudah benar pakai `account?.`; node ini kelupaan.
      value: inquiry?.inquiry_no, onClick: () => {},
    },
    prfs.length > 1 ? {
      type: 'prf', active: false, label: 'PRF', state: 'multi',
      value: `${prfs.length} PRFs`,
      items: prfs.map((p) => ({ label: p.prf_no, onClick: () => onViewPRF?.(p) })),
    } : prfs.length === 1 ? {
      type: 'prf', active: false, label: 'PRF', state: 'doc',
      value: prfs[0].prf_no, onClick: () => onViewPRF?.(prfs[0]),
    } : { type: 'prf', active: false, label: 'PRF', state: 'none' },
    activeQuotation ? {
      type: 'quotation', active: false, label: 'Quotation', state: 'doc',
      value: formatQuotationNo(activeQuotation.quotation_no, activeQuotation.revision),
      onClick: () => onViewQuotation?.(activeQuotation),
    } : { type: 'quotation', active: false, label: 'Quotation', state: 'none' },
    salesOrder ? {
      type: 'salesOrder', active: false, label: 'Sales Order', state: 'doc',
      value: salesOrder.so_no, onClick: () => {},
    } : { type: 'salesOrder', active: false, label: 'Sales Order', state: 'none' },
    { type: 'purchaseOrder', active: false, label: 'Purchase Order', state: 'none' },
    { type: 'jobOrder', active: false, label: 'Job Order', state: 'none' },
    { type: 'carrierBooking', active: false, label: 'Carrier Booking', state: 'none' },
    { type: 'invoice', active: false, label: 'Invoice', state: 'none' },
  ];
  // TD-318 Irisan 2 Inquiry, commit 6: baris RelatedDocuments. Upstream =
  // akun asal (SATU baris, data yang sudah di-fetch + `created_at` baru
  // ditambah ke select accounts). Downstream = PRF + SELURUH versi quotation
  // (bukan hanya yang aktif) -- keduanya data existing, nol query baru.
  const relatedDocsUpstream = account ? [{
    key: `account-${account.id}`,
    type: account.lifecycle_stage === 'customer' ? 'Customer' : 'Lead',
    no: account.name,
    status: account.lifecycle_stage === 'customer' ? 'Active' : 'Converted',
    date: account.created_at ? fmtDate(account.created_at) : '',
    onClick: account.id ? () => onViewCustomer?.(account.id) : undefined,
  }] : [];
  const relatedDocsDownstream = [
    ...prfs.map((p) => ({
      key: `prf-${p.id}`, type: 'PRF', no: p.prf_no, status: String(p.status || '').toUpperCase(),
      date: fmtDate(p.created_at), onClick: () => onViewPRF?.(p),
    })),
    ...quotations.map((q) => ({
      key: `quo-${q.id}`, type: 'Quotation', no: formatQuotationNo(q.quotation_no, q.revision),
      status: QUO_STATUS[String(q.status || '').toUpperCase()]?.label || q.status,
      date: fmtDate(q.created_at), onClick: () => onViewQuotation?.(q),
    })),
  ];
  // TD-318 Irisan 2 Inquiry, commit 7 -- segmen bar + daftar event Status
  // History. Bagian "owner" TIDAK dikerjakan (keputusan Mas) -- hanya
  // transisi inquiries.status dari inquiry_status_history. Histori baru
  // terisi sejak 7 Sep 2026 (trigger trg_z_log_inquiry_status_change) --
  // inquiry lama (nol baris histori) TIDAK ditebak riwayatnya: bar dan
  // daftar kosong, bukan satu segmen "sejak dibuat" yang mengada-ada.
  // `inquiry?.created_at` (bukan `inquiry.`) -- TD-318 Irisan 2 Inquiry, bug
  // fix round, Task 5: const ini dihitung TANPA SYARAT di setiap render,
  // termasuk sebelum guard `if (!inquiry)`. Baris ini sendiri hanya
  // tereksekusi saat `statusHistory.length > 0`, dan `statusHistory` SELALU
  // `[]` persis saat `inquiry` bisa null (mount pertama) -- jadi TIDAK
  // terbukti bisa crash hari ini -- tapi `?.` ditambahkan untuk KONSISTEN
  // dengan seluruh const turunan lain di sekitarnya (permintaan eksplisit
  // Mas), bukan karena ditemukan crash baru.
  const statusHistorySegments = statusHistory.length === 0 ? [] : [
    ...statusHistory.map((h, i) => ({
      status: h.from_status,
      days: daysBetween(i === 0 ? inquiry?.created_at : statusHistory[i - 1].changed_at, h.changed_at),
    })),
    {
      status: statusHistory[statusHistory.length - 1].to_status,
      days: daysBetween(statusHistory[statusHistory.length - 1].changed_at, null),
    },
  ];
  // TD-318 Irisan 3, commit 7 -- `reason` dibawa apa adanya dari
  // inquiry_status_history (sudah diisi trigger log_inquiry_status_change,
  // migrasi 20261021000001 TASK 8): transisi ke WON = won_reason (manual 4
  // alasan atau "Accepted quotation"); transisi KELUAR dari WON (revert) =
  // revert_won_reason. LOST/CANCELLED sudah ditulis sejak Irisan 2, tidak
  // berubah.
  const statusHistoryEvents = statusHistory.map((h, i) => ({
    key: h.id,
    kind: 'status',
    from: h.from_status,
    to: h.to_status,
    changedAt: h.changed_at,
    byName: profMap[h.changed_by] || '—',
    reason: h.reason || null,
    fromDays: daysBetween(i === 0 ? inquiry?.created_at : statusHistory[i - 1].changed_at, h.changed_at),
  })).reverse();
  // Putaran 11 Tahap B -- baris "owner" (ditunda commit 7 di atas) kini
  // digabung ke timeline YANG SAMA dengan statusHistoryEvents (mockup
  // Inquiry Management.dc.html:855-864: satu array `changes`, diurut
  // tanggal terbaru-dulu -- BUKAN dua daftar terpisah). `fromName`/`toName`
  // null berarti "Unassigned" (baris pertama tab Unassigned, owner lama
  // NULL) -- dibedakan dari string '—' (nama tak ketemu di profMap).
  const ownerHistoryEvents = ownerHistory.map((h) => ({
    key: `owner-${h.id}`,
    kind: 'owner',
    changedAt: h.changed_at,
    byName: profMap[h.changed_by] || '—',
    fromName: h.from_owner_id ? (profMap[h.from_owner_id] || '—') : null,
    toName: h.to_owner_id ? (profMap[h.to_owner_id] || '—') : null,
    reason: h.reason || null,
  }));
  const combinedHistoryEvents = [...statusHistoryEvents, ...ownerHistoryEvents]
    .sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : 0));

  // ── Task 4 — tandai INQUIRY kalah. Menulis inquiries.status + lost_reason SAJA;
  // accounts TIDAK disentuh sama sekali (lifecycle akun hanya naik, tak pernah turun).
  // Tandingannya "Mark as Won" (markInquiryWon, di bawah) sempat dicabut 8 Sep 2026
  // atas asumsi trigger set_inquiry_won_on_so sudah menggantikannya, lalu
  // DIKEMBALIKAN 10 Sep 2026: audit produksi menemukan 37 dari 37 WON lahir dari
  // jalur manual ini, sementara trigger SO belum pernah menyala sekali pun (seluruh
  // tabel sales_orders = 1 baris DRAFT, nol SENT). Jalur SO baru layak jadi
  // pengganti setelah keputusan SO/Odoo — sampai itu, keduanya hidup berdampingan.
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
    const { data, error } = await supabase
      .from('inquiries')
      .update({
        status: 'LOST',
        loss_reason_id:   values.loss_reason_id,
        competitor_name:  values.competitor_name,
        competitor_price: values.competitor_price,
      })
      .eq('id', inquiry.id)
      .select('id');
    setLossSaving(false);
    if (error) { showToast?.('Failed to mark as Lost: ' + error.message, 'error'); return; }
    // RLS bisa menyaring baris tanpa error → 0 baris = gagal senyap (TD-161,
    // pola sama reassignOwner).
    if (!data || data.length === 0) {
      showToast?.('Failed to mark as Lost: inquiry may have changed — reload and try again.', 'error');
      return;
    }
    // Berjejak: ini SATU-SATUNYA jalur menandai inquiry kalah, dan alasannya ikut
    // menghitung win rate. Pola sama saveDealUpdate — fire-and-forget, tak memblokir.
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `${prevStatus} → LOST · reason: ${lossReasons.find(r => r.id === values.loss_reason_id)?.name || values.loss_reason_id}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setLossOpen(false);
    showToast?.('Inquiry marked as Lost.', 'success');
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

  // Roster sales utk dropdown "New Owner" -- Putaran 11 Tahap B: dipindah
  // ke dalam OwnerAssignModal.jsx sendiri (fetch di-scope inquiry.company_id,
  // BUKAN profile.company_id -- perbaikan insidental: manager multi-entitas
  // kini lihat roster entitas INQUIRY-nya, bukan entitas home-nya).

  // ── B3: Batalkan deal. Alasan teks bebas (bukan master) — ini catatan
  // operasional sekali pakai, bukan taksonomi yang di-GROUP BY seperti alasan
  // kalah. closed_at/closed_by distempel trigger, sama seperti jalur LOST.
  async function markInquiryCancel(values) {
    if (!inquiry?.id) return;
    const prevStatus = inquiry.status || 'OPEN';
    setCancelSaving(true);
    const { data, error } = await supabase
      .from('inquiries')
      .update({ status: 'CANCELLED', cancel_reason: values.cancel_reason })
      .eq('id', inquiry.id)
      .select('id');
    setCancelSaving(false);
    if (error) { showToast?.('Failed to cancel inquiry: ' + error.message, 'error'); return; }
    // RLS bisa menyaring baris tanpa error → 0 baris = gagal senyap (TD-161,
    // pola sama reassignOwner).
    if (!data || data.length === 0) {
      showToast?.('Failed to cancel inquiry: inquiry may have changed — reload and try again.', 'error');
      return;
    }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `${prevStatus} → CANCELLED · reason: ${values.cancel_reason}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setCancelOpen(false);
    showToast?.('Inquiry cancelled.', 'success');
    refetch();
  }

  // ── Tandai INQUIRY menang secara manual. TD-318 Irisan 3: mark_inquiry_won
  // kini 4 argumen (reason/evidence_path/notes) dan menegakkan gate owner_id/
  // manager-di-entitas/super_admin + 4 alasan whitelist + bukti wajib — gate
  // `canMarkWon` di atas murni UX, bukan pengganti validasi RPC. Trigger
  // set_customer_on_inquiry_won yang sudah ada mengurus accounts.lifecycle_
  // stage + became_customer_at otomatis.
  //
  // Upload gagal (final decision §9.6): pesan GENERIK ("Upload failed. Try
  // again."), modal TETAP TERBUKA (wonOpen tidak diubah) — user menekan
  // "Yes, Mark as Won" lagi dengan file yang sama untuk mencoba ulang,
  // bukan tombol Retry tersendiri. RPC gagal: pesan RPC apa adanya, modal
  // juga tetap terbuka (bukan upload error -> tidak menimpa wonUploadError).
  async function markInquiryWon({ reason, notes, file }) {
    if (!inquiry?.id) return;
    setWonSaving(true);
    setWonUploadError('');
    const { error, isUploadError } = await markInquiryWonWithEvidence({
      inquiryId: inquiry.id, companyId: inquiry.company_id, reason, notes, file,
    });
    setWonSaving(false);
    if (error) {
      if (isUploadError) { setWonUploadError('Upload failed. Try again.'); return; }
      showToast?.(error.message, 'error');
      return;
    }
    setWonOpen(false);
    showToast?.('Inquiry marked as Won. The linked account is now a customer.', 'success');
    refetch();
  }

  // ── TD-318 Irisan 3, commit 5 -- Revert Manual Win. revert_manual_win
  // menegakkan gate manager/super_admin + whitelist won_reason sebenarnya;
  // canRevertWon di atas murni UX. Status asal diturunkan RPC dari
  // inquiry_status_history (bukan dikirim dari sini) -- quotation yang
  // sudah SUPERSEDED TIDAK dipulihkan, accounts.lifecycle_stage TIDAK
  // dikembalikan (final decision #2).
  async function revertManualWin({ reason }) {
    if (!inquiry?.id) return;
    setRevertSaving(true);
    const { error } = await supabase.rpc('revert_manual_win', { p_inquiry_id: inquiry.id, p_reason: reason });
    setRevertSaving(false);
    if (error) { showToast?.(error.message, 'error'); return; }
    setRevertOpen(false);
    showToast?.('Manual win reverted for ' + inquiry.inquiry_no, 'success');
    refetch();
  }

  // ── Ganti akun (prospect_id/customer_id) + kontak -- Putaran 15, Task 4.
  // RPC change_inquiry_account (20261027000007) sendiri yang menggerbang
  // (manager-ke-atas DI ENTITAS inquiry ini ATAU super admin), menolak
  // status terminal/entitas beda/akun Lost atau Lead Pool/kontak bukan
  // milik akun/inquiry yang sudah punya Quotation atau PRF hidup, dan
  // mencatat audit_logs CHANGE_INQUIRY_ACCOUNT -- logAudit TIDAK dipanggil
  // dari sini, pola sama reassignOwner/revertManualWin. Pesan error RPC
  // ditampilkan apa adanya. Sesudah sukses: refetch() memuat ulang `inquiry`
  // (prospect_id/contact_id baru, lewat select+embed yang sudah ada) DAN
  // `account` (fetch terpisah dari inq.prospect_id baru) -- header Detail
  // ikut terbarui tanpa kode tambahan.
  async function changeInquiryAccount({ newAccountId, newContactId, reason }) {
    if (!inquiry?.id) return;
    setChangeAccountSaving(true);
    const { error } = await supabase.rpc('change_inquiry_account', {
      p_inquiry_id: inquiry.id,
      p_new_account_id: newAccountId,
      p_new_contact_id: newContactId,
      p_reason: reason,
    });
    setChangeAccountSaving(false);
    if (error) { showToast?.(error.message, 'error'); return; }
    setChangeAccountOpen(false);
    showToast?.('Account changed for ' + inquiry.inquiry_no, 'success');
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
      notes: 'Revisi quotation dibuat dari Detail Inquiry',
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    showToast?.('Revision created as a new draft.', 'success');
    refetch();
  }

  // ── Ganti pemilik deal (owner_id) -- Putaran 11 Tahap B/Prompt 42: RPC
  // reassign_inquiry_owner kini dipanggil DI DALAM OwnerAssignModal.jsx
  // sendiri (p_reason/p_notify dikirim dari form modal). JANGAN menutup
  // modal di sini -- modal menutup DIRINYA SENDIRI (onClose) hanya saat
  // sukses PENUH (target tunggal di halaman ini, jadi "penuh" = satu-
  // satunya target berhasil); kalau RPC gagal, modal tetap terbuka
  // menampilkan error-nya sendiri, dan menutupnya paksa di sini akan
  // menyembunyikan pesan itu. Cukup refetch (aman dipanggil bahkan saat
  // gagal -- tidak ada yang berubah untuk di-refresh).
  function onOwnerAssigned() {
    refetch();
  }

  // ── Irisan 2 Inquiry, lanjutan audit mockup (Pekerjaan B) -- SATU jalur
  // simpan dipakai keenam section inline-edit (Service/Route/Cargo/Addl/
  // Timeline/Notes), supaya cek RLS-silent-fail (pola saveDealUpdate,
  // DealPanels.jsx:158-186 -- RLS bisa menyaring baris jadi 0 TANPA Postgres
  // mengembalikan error) tidak bisa lupa ditulis di salah satu dari enam
  // titik. BUKAN RPC baru -- UPDATE langsung ke `inquiries`, pola yang SAMA
  // dengan markInquiryLost/reassignOwner di atas. Kunci in-flight cukup
  // state `savingSection` (semua enam section hidup di komponen yang sama,
  // berbeda dari saveDealUpdate yang butuh Set modul karena dipanggil dari
  // DUA file berbeda).
  // `sectionLabel` masuk ke notes audit (pola sama reassignOwner di atas),
  // BUKAN dipakai utk logic apa pun -- aman dioper teks bebas.
  async function saveInquirySection(patch, sectionLabel) {
    if (!inquiry?.id) return false;
    setSavingSection(true);
    const { data, error } = await supabase
      .from('inquiries')
      .update(patch)
      .eq('id', inquiry.id)
      .select('id');
    setSavingSection(false);
    if (error) { showToast?.('Failed to save: ' + error.message, 'error'); return false; }
    if (!data || data.length === 0) {
      showToast?.('Failed to save: you do not have permission to modify this inquiry, or the inquiry was not found.', 'error');
      return false;
    }
    logAudit(supabase, {
      action: ACTION_TYPES.UPDATE_INQUIRY,
      entityType: ENTITY_TYPES.INQUIRY,
      entityId: inquiry.id,
      entityLabel: inquiry.inquiry_no,
      notes: `Section: ${sectionLabel}`,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    showToast?.('Changes saved', 'success');
    setEditingSection(null);
    setSectionDraft({});
    refetch();
    return true;
  }

  // ── Ronde "Lane Editor" — section "Route Options". `displayLanes` dipakai
  // BAIK oleh mode baca (readOnly) MAUPUN seed draft awal mode edit (K2.2/
  // K2.3): lanes>=1 -> baris nyata; lanes=0 (inquiry lama, pra-Putaran 4A)
  // -> satu baris disintesis dari inquiries.pol/pod/*_location_id, mode/unit
  // lewat deriveLaneMode(container_types) -- SATU fungsi dipakai dua kali
  // (sini + onEdit di bawah), bukan dua salinan logika yang bisa melenceng. ──
  const singleLaneFromInquiry = (inq) => {
    const mode = deriveLaneMode(inq?.container_types);
    return [{
      pol_location_id: inq?.pol_location_id || null, pod_location_id: inq?.pod_location_id || null,
      via_location_id: null, pol: inq?.pol || '', pod: inq?.pod || '', via: '', mode, load_unit: unitForMode(mode),
    }];
  };
  const displayLanes = lanes.length > 0 ? lanes : singleLaneFromInquiry(inquiry);
  const addDetailLane = () => setLaneDraft((a) => {
    const last = a[a.length - 1];
    const mode = last?.mode || 'Sea LCL';
    return [...a, { pol_location_id: null, pod_location_id: null, via_location_id: null, pol: '', pod: '', via: '', mode, load_unit: last?.load_unit || unitForMode(mode) }];
  });
  const updateDetailLane = (i, patch) => setLaneDraft((a) => a.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeDetailLane = (i) => setLaneDraft((a) => a.filter((_, j) => j !== i));
  const moveDetailLane = (from, to) => setLaneDraft((a) => {
    if (to < 0 || to >= a.length) return a;
    const copy = [...a];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  });
  // Pembanding isi lane (K4) -- field SEMANTIK saja (bukan `id`/`sort_order`,
  // yang bisa berbeda antara baris DB lama dan baris baru di draft tanpa
  // berarti RUTE-nya berubah). Dipakai saveInquiryLanesSection SEBELUM
  // memanggil RPC, supaya Save tanpa perubahan tidak menulis apa pun.
  const laneContentEqual = (a, b) => a.length === b.length && a.every((l, i) => {
    const r = b[i];
    return (l.pol_location_id || null) === (r.pol_location_id || null)
      && (l.pod_location_id || null) === (r.pod_location_id || null)
      && (l.via_location_id || null) === (r.via_location_id || null)
      && (l.pol || null) === (r.pol || null) && (l.pod || null) === (r.pod || null) && (l.via || null) === (r.via || null)
      && (l.mode || null) === (r.mode || null) && (l.load_unit || null) === (r.load_unit || null);
  });
  // K4 -- BUANG logAudit() FE: RPC update_inquiry_lanes sudah menulis
  // audit_logs sendiri (action UPDATE_INQUIRY_LANES, old_data/new_data =
  // lane lama/baru) -- menambah logAudit() di sini akan jadi DUA baris
  // audit utk satu aksi, bukan satu pola "section apa" seperti enam section
  // lain (yang RPC-nya TIDAK menulis audit sendiri). No-op diperiksa DI SINI
  // (klien) SEBELUM memanggil RPC -- menutup editor tanpa round-trip
  // jaringan kalau draft persis sama dengan lane tersimpan, toast INFO
  // (bukan error) seperti diminta.
  async function saveInquiryLanesSection(laneRows) {
    if (!inquiry?.id) return false;
    if (!laneRows.length || laneRows.some((l) => !l.pol_location_id || !l.pod_location_id)) {
      showToast?.('Every lane needs a Port of Loading and Port of Discharge.', 'error');
      return false;
    }
    if (laneContentEqual(laneRows, displayLanes)) {
      showToast?.('No changes', 'info');
      setEditingSection(null);
      setLaneDraft([]);
      return true;
    }
    setSavingSection(true);
    const { error } = await supabase.rpc('update_inquiry_lanes', {
      p_inquiry_id: inquiry.id,
      p_lanes: laneRows.map((l) => ({
        pol_location_id: l.pol_location_id, pod_location_id: l.pod_location_id, via_location_id: l.via_location_id || null,
        pol: l.pol || null, pod: l.pod || null, via: l.via || null, mode: l.mode || null, load_unit: l.load_unit || null,
      })),
    }).single();
    setSavingSection(false);
    if (error) { showToast?.('Failed to save: ' + error.message, 'error'); return false; }
    showToast?.('Changes saved', 'success');
    setEditingSection(null);
    setLaneDraft([]);
    refetch();
    return true;
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

  // D-83 (Putaran 10) -- Remind Procurement. RPC prf_remind_procurement
  // sendiri yang menulis audit_logs (pola mark_inquiry_won) -- TIDAK ada
  // logAudit() client-side kedua di sini (akan dobel). Nol efek ke tabel
  // prf/inquiries -- hanya notifications.
  async function doRemindProcurement(prf) {
    setPrfActionBusy(true);
    try {
      const { error } = await supabase.rpc('prf_remind_procurement', { p_prf_id: prf.id });
      if (error) throw error;
      showToast?.('Reminder sent to Procurement.', 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setPrfActionBusy(false);
    }
  }

  // D-84 (Putaran 10) -- Cancel Request. Mengubah prf.status saja -- TIDAK
  // menyentuh inquiries.status (butir 9, instruksi Mas). refetch() supaya
  // kartu PRF ini pindah dari daftar "aktif" (tombol Remind/Cancel hilang
  // begitu status jadi CANCELLED).
  async function doCancelPrfRequest(prf) {
    setPrfActionBusy(true);
    try {
      const { error } = await supabase.rpc('prf_cancel_request', { p_prf_id: prf.id });
      if (error) throw error;
      showToast?.('Request cancelled.', 'success');
      refetch();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setPrfActionBusy(false);
      setPrfCancelConfirm({ open: false, prf: null });
    }
  }

  // Irisan 2 Inquiry, putaran penutup (Task 2, butir 4): crumb ke-4 breadcrumb
  // (ADITIF, lihat ContextHeader.jsx/useDetailCrumb.js) -- pola PERSIS Lead
  // Detail (TD-318, #19). Membuat crumb ke-3 "Inquiry Status & History" jadi
  // link kembali ke daftar, dan menambah inquiry_no sebagai crumb ke-4 --
  // persis mockup: `crumbs` detail = [CRM (Business Development), Inquiry
  // Management, PAGES[s.from] (link), cur.no]. Dipanggil SEBELUM guard
  // loading/notFound di bawah (Rules of Hooks) -- `inquiry` masih `null` di
  // render pertama, `label` jatuh `null` sampai data termuat (byte-identik
  // dgn pola Lead Detail).
  useDetailCrumb(inquiry?.inquiry_no || null);

  // ── loading / not-found ──
  if (loading) {
    return (
      <div style={{ margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textFaint, fontFamily: BODY }}>
        <Loader2 size={30} className="dd-spin" />
        <div style={{ fontSize: 13.5 }}>Loading inquiry details…</div>
        <style>{`@keyframes dd-spin{to{transform:rotate(360deg)}}.dd-spin{animation:dd-spin .8s linear infinite}`}</style>
      </div>
    );
  }
  if (notFound || !inquiry) {
    return (
      <div style={{ margin: '0 auto', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.textMute, fontFamily: BODY }}>
        <AlertCircle size={30} color={C.red} />
        <div style={{ fontFamily: HEAD, fontSize: 16, fontWeight: 700, color: C.text }}>Inquiry not found</div>
        <button onClick={onBack} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.navy, fontFamily: HEAD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ChevronLeft size={15} />Back</button>
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
        // Irisan 2 Inquiry, lanjutan audit mockup (Pekerjaan A): mockup
        // menaruh metric-row SEBELUM StageBar -- lihat komentar prop ini
        // di FormSheet.jsx untuk pembuktian nol dampak ke pemakai lain.
        toolbarFirst
        /* TD-318 Irisan 2 Inquiry, commit 2 (keputusan Mas #1): H1 = nomor
           inquiry (mono), BUKAN nama akun seperti sebelumnya -- kebalikan
           total dari susunan lama. Mockup Inquiry Management.dc.html:279
           -- h1 `font:600 24px 'IBM Plex Mono',monospace` (bukan h1 bawaan
           FormSheet 30px/700/sans) -- dioverride lewat span sendiri di
           dalam h1 kit, nol perubahan ke FormSheet.jsx (satu-satunya
           pemakai produksi hari ini, tapi kontraknya tetap dijaga generik).
           Warna navy (brand task ini), BUKAN sage mockup -- CRM belum
           migrasi kit (CLAUDE.md), dan instruksi eksekusi ini eksplisit
           minta navy/orange/cream. `kicker` = label "INQUIRY" di atas h1
           (mockup :278, data-rule="7") -- slot FormSheet yang sudah ada,
           sebelumnya tidak dipakai. `docNo` dicabut -- nomornya sudah
           pindah ke title, menampilkannya dua kali akan duplikasi. */
        kicker="INQUIRY"
        title={(
          <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 24, color: C.navy }}>
            {inquiry.inquiry_no}
          </span>
        )}
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
        /* TD-318 Irisan 2 Inquiry, commit 2: metric row 4-kolom (keputusan Mas,
           urutan commit) ditaruh di `toolbar` -- slot INI yang membentang
           selebar dokumen (lihat komentar FormSheet.jsx), `meta` di atas
           cuma selebar kolom judul. Grid persis mockup Inquiry Management.dc.html
           :300 (`grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;
           padding-top:16px;border-top:1px solid #ECF0E9`). [Putaran 16a
           Tahap 0, GAGAL ditutup] border kini `C.lineSoft` (LINE_SOFT
           EXACT) -- dulu `C.border`/LINE, satu kelas dgn divider lain yang
           sama-sama ditutup Tahap 0. Owner pakai `ownerName`/Avatar yang SUDAH ada (:799),
           Reassign memanggil panel inline YANG SAMA dengan tombol toolbar
           di bawah (keputusan Mas #4 -- nol modal baru). Overdue & Inquiry
           Age diturunkan dari `deadline_quote`/`created_at` yang SUDAH
           di-select, nol query baru. Estimated Value TANPA badge "from
           quotation"/"Estimated" mockup (:296) -- keduanya butuh data
           provenance yang tidak ada (dilaporkan sebagai dilewati). Grid ini
           SELALU tampil (toolbar sekarang selalu truthy); baris tombol aksi
           lama (Edit/Change Owner/Mark Won/Lost/Cancel) tetap muncul di
           bawahnya dengan gate yang SAMA PERSIS seperti sebelumnya. */
        toolbar={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.textMute }}>Owner</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* TD-318 Irisan 3, commit 6: link "Reassign" inline DICABUT
                    (final decision #9.3) -- mockup Detail TIDAK punya link
                    reassign di metric row sama sekali, aksinya cuma lewat
                    kebab "Reassign Owner". Avatar+nama Owner TETAP tampil
                    (info), hanya tautan aksinya yang pindah. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={ownerName} size={24} />
                  <span style={{ fontFamily: BODY, fontSize: 13, color: C.text, fontWeight: 600 }}>{ownerName || 'Unassigned'}</span>
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.textMute }}>Deadline Quote</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: C.text }}>{inquiry.deadline_quote ? fmtDate(inquiry.deadline_quote) : '—'}</span>
                {inquiry.deadline_quote && inquiry.deadline_quote < new Date().toISOString().slice(0, 10) && !DEAL_CLOSED_STATUS.includes(dealStatus) && (
                  <TintBadge meta={{ label: 'Overdue', bg: C.amberBg, color: C.amber, bd: C.amberBd }} />
                )}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.textMute }}>Estimated Value</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: C.text }}>{inquiry.estimated_value == null ? '—' : fmtRp(Number(inquiry.estimated_value))}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: C.textMute }}>Inquiry Age</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: C.text }}>{inquiryAge}</span>
            </div>
          </div>
          {(canMarkLost || canMarkWon || canCancel || canReassignOwner || showCreateQuotationPrimary) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Putaran 15 Task 1 -- tombol "Edit Inquiry" (onEditInquiry) dicabut:
              mockup tidak punya tombol Edit literal di sini, dan sejak Task 1
              seluruh editing berjalan inline per-section (Overview), bukan lagi
              lewat halaman form terpisah (InquiryFormPage.jsx, dipensiunkan). */}
          {/* TD-318 Irisan 3, commit 4 -- aksi utama dinamis (final decision
              #9.1): Open/In Review = Create Quotation; Quoted/Negotiation =
              Mark as Won (kalau canMarkWon). "Request Rates" mockup TIDAK
              dibangun. Won/Lost/Cancelled = nol primary action. */}
          {showCreateQuotationPrimary && (
            // [Putaran 16a Tahap 1] Satu-satunya aksi UTAMA toolbar (beda
            // dari pasangan tab-lokal Quotations/Procurement yang sudah
            // diubah ghost) -- dipertahankan solid ACCENT, cermin pola
            // tombol primer tunggal mockup ("Next"/"Yes, Mark as Won").
            // Teks WAJIB C.text (INK), BUKAN putih -- ACCENT pucat gagal AA.
            <button onClick={() => onCreateQuotation(inquiryId)} style={{ ...ACT_BTN, background: C.orange, border: `1px solid ${C.orange}`, color: C.text }}>
              <FileText size={14} />Create Quotation
            </button>
          )}
          {canMarkWon && (
            <button onClick={() => setWonOpen(true)} disabled={wonSaving}
              style={{ ...ACT_BTN, border: `1px solid ${C.greenBd}`, color: C.green, cursor: wonSaving ? 'not-allowed' : 'pointer', opacity: wonSaving ? 0.6 : 1 }}>
              <CheckCircle2 size={14} />{wonSaving ? 'Processing…' : 'Mark as Won'}
            </button>
          )}
          {/* TD-318 Irisan 3, commit 6 -- kebab (menu titik tiga), urutan
              mockup persis: Reassign Owner, divider, Mark as Lost, Cancel
              Inquiry (final decision §9.3/§6). "Request Rates"/"Create
              Quotation" duplikat/"Close as Duplicate" TIDAK dibangun (§9.2,
              Irisan 4). Link inline "Reassign" di metric row DICABUT --
              satu-satunya entry point sekarang di sini. */}
          {showKebab && (canReassignOwner || canChangeAccount || canMarkLost || canCancel) && (
            <div style={{ position: 'relative' }}>
              <button type="button" title="More actions" onClick={() => setKebabOpen((v) => !v)}
                style={{ ...ACT_BTN, width: 36, padding: 0, justifyContent: 'center', background: kebabOpen ? C.navySoft : C.surface }}>
                <MoreVertical size={16} />
              </button>
              {kebabOpen && (
                <>
                  <div onClick={() => setKebabOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                  {/* [sapuan bayangan lepas] boxShadow sebelumnya literal '0 12px 32px rgba(51,66,43,.16)'
                      (sudah persis nilai mockup, belum tertelusur ke kit) -- kini C.shadowPopover. */}
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: C.shadowPopover, padding: 4, display: 'flex', flexDirection: 'column', zIndex: 95 }}>
                    {canReassignOwner && (
                      <button type="button"
                        onClick={() => { setKebabOpen(false); setOwnerAssignOpen(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', fontFamily: BODY, fontSize: 13.5, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                        <UserCog size={14} />Reassign Owner
                      </button>
                    )}
                    {/* Putaran 15, Task 4 -- selalu tampil utk canChangeAccount,
                        DISABLED + tooltip bila sudah ada Quotation/PRF hidup
                        (pola Putaran 10, PRFDetailPage.jsx:929). RPC
                        change_inquiry_account tetap penjaga sebenarnya. */}
                    {canChangeAccount && (
                      <button type="button"
                        disabled={!!changeAccountBlockReason}
                        title={changeAccountBlockReason || undefined}
                        onClick={() => { setKebabOpen(false); setChangeAccountOpen(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', fontFamily: BODY, fontSize: 13.5, color: changeAccountBlockReason ? C.textFaint : C.text, cursor: changeAccountBlockReason ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: changeAccountBlockReason ? 0.6 : 1 }}>
                        <RefreshCcw size={14} />Change Account
                      </button>
                    )}
                    {(canReassignOwner || canChangeAccount) && (canMarkLost || canCancel) && (
                      <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
                    )}
                    {canMarkLost && (
                      <button type="button" onClick={() => { setKebabOpen(false); setLossOpen(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', fontFamily: BODY, fontSize: 13.5, color: C.red, cursor: 'pointer', textAlign: 'left' }}>
                        <XCircle size={14} />Mark as Lost
                      </button>
                    )}
                    {canCancel && (
                      /* Putaran 11 Tahap C -- disabled+tooltip bila ada SO hidup,
                         pola PERSIS Change Account (changeAccountBlockReason di
                         atas). RPC/UPDATE tetap penjaga sebenarnya; ini murni UX. */
                      <button type="button"
                        disabled={!!cancelBlockReason}
                        title={cancelBlockReason || undefined}
                        onClick={() => { setKebabOpen(false); setCancelOpen(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8, background: 'transparent', fontFamily: BODY, fontSize: 13.5, color: cancelBlockReason ? C.textFaint : C.textMute, cursor: cancelBlockReason ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: cancelBlockReason ? 0.6 : 1 }}>
                        <Ban size={14} />Cancel Inquiry
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          </div>
          )}
        </div>
        )}
        /* `meta` membawa DUA baris (keputusan Mas #1): nama akun (link kecil,
           DealTitle -- dulu jadi h1), lalu baris chip (keputusan Mas #5 --
           Status/Service Type/Undername, tiga-tiganya datanya sudah ada di
           `inquiry` yang sudah di-fetch; chip mockup lain [migTag/Rate Sheet/
           Direction/Won-awaiting-SO/Quotation-expired/Manual-win/Revert/
           Free-Trade-Zone/Credit-Hold/Onboarding/feasibility] DILEWATI --
           daftar lengkap + alasan di laporan akhir, bukan ditebak di sini).
           Baris `HeaderMeta` (Assigned To/Created/Est. Closing) DICABUT
           (TD-318 Irisan 2 Inquiry, bug fix round): mockup tak punya baris
           itu, dan Assigned To tampak dobel dengan Owner di metric row
           header. Created & Est. Closing TETAP tampil -- dipindah ke kartu
           "Inquiry Detail" (grup "Timeline & Ownership"), bukan dihilangkan. */
        meta={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
            <DealTitle name={account?.name} accountId={account?.id} onViewCustomer={onViewCustomer} />
            <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Putaran 4 Tahap 4C -- badge "Rate Sheet Request", posisi
                  SEBELUM chip Status (diverifikasi langsung ke mockup
                  Inquiry Management.dc.html: urutan markup D.migTag -> isRS
                  "Rate Sheet" -> D.st Status -> D.ent Entity -> D.svc Service
                  -> D.under Undername -- chip "Rate Sheet" mockup ada SEBELUM
                  Status, bukan sesudah Service seperti draft awal). Style
                  SAMA dengan chip Entity/Service (border/bg/color netral,
                  bukan warna status). */}
              {isInquiryRS && (
                <TintBadge meta={{ label: 'Rate Sheet Request', bg: C.surfaceAlt, color: C.textMute, bd: C.border }} />
              )}
              <TintBadge meta={{
                label: STATUS_LABEL[dealStatus] || dealStatus,
                bg: DEAL_STATUS[dealStatus]?.bg, color: DEAL_STATUS[dealStatus]?.fg, bd: DEAL_STATUS[dealStatus]?.bd,
              }} />
              {/* TD-318 Irisan 2 Inquiry, bug fix round, Task 2: chip Entity --
                  mockup :185 `{{ D.ent }}` persis sesudah chip Status, SEBELUM
                  Service -- style IDENTIK dgn chip Service (border #D8E0D2/
                  bg #EFF3ED/color #5C6B52 = C.border/C.surfaceAlt/C.textMute,
                  sudah dipakai di bawah). `D.ent` = kode entitas mentah (mis.
                  'MSI'), bukan nama panjang -- relasi `companies` via FK yang
                  SUDAH ADA di select query (pola `companies!<table>_company_id_
                  fkey(code,name)`, dipakai InquiryFormPage.jsx/db.js dkk),
                  nol query tambahan. `inquiries.company_id` NOT NULL di DB
                  (schema_snapshot.sql:8371) -- cabang "company_id null, chip
                  tidak dirender" secara teori tak akan terpicu hari ini, tapi
                  guard tetap dipasang pada hasil embed (`inquiry.company`),
                  bukan `company_id` mentah -- melindungi dari RLS/relasi
                  gagal, bukan cuma dari company_id kosong. */}
              {inquiry.company?.code && (
                <TintBadge meta={{ label: inquiry.company.code, bg: C.surfaceAlt, color: C.textMute, bd: C.border }} />
              )}
              {inquiry.service_type && (
                <TintBadge meta={{ label: SERVICE_LABEL[inquiry.service_type] || inquiry.service_type, bg: C.surfaceAlt, color: C.textMute, bd: C.border }} />
              )}
              {(inquiry.additional_services || []).includes('undername') && (
                <TintBadge meta={{ label: 'Undername', bg: C.amberBg, color: C.amber, bd: C.amberBd }} />
              )}
              {/* Putaran 9 -- chip Direction, mockup :282 (`{{ D.dirL }}`) --
                  TANPA sc-if, selalu dirender (termasuk saat "Not set"),
                  posisi persis sesudah Undername/sebelum Won-awaiting-SO.
                  Ikon: lihat DIRECTION_ICON. */}
              <TintBadge meta={{
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {(() => { const Icon = DIRECTION_ICON[inquiry.direction]; return Icon ? <Icon size={12} /> : null; })()}
                    {inquiry.direction || 'Not set'}
                  </span>
                ),
                bg: C.surfaceAlt, color: C.textMute, bd: C.border,
              }} />
              {/* Putaran 9 -- "Won, awaiting Sales Order" / "Quotation
                  expired", posisi mockup :282 (sesudah Direction, sebelum
                  Manual win). Rumus: lihat komentar isWonAwaitingSo/
                  isQuotationExpired. */}
              {isWonAwaitingSo && (
                <TintBadge meta={{ label: 'Won, awaiting Sales Order', bg: C.amberBg, color: C.amber, bd: C.amberBd }} />
              )}
              {isQuotationExpired && (
                <TintBadge meta={{ label: 'Quotation expired', bg: C.amberBg, color: C.amber, bd: C.amberBd }} />
              )}
              {/* TD-318 Irisan 3, commit 5 -- chip "Manual win" + link "Revert
                  Manual Win", posisi mockup :282 (sesudah Quotation-expired,
                  sebelum Free Trade Zone -- keduanya belum dibangun di Nexus,
                  jadi posisi praktisnya langsung sesudah chip terakhir yang
                  sudah ada, Undername). Link HANYA tampil untuk canRevertWon
                  (Manager/Super Admin) -- bukan owner (final decision #2). */}
              {isManualWin && (
                <>
                  <TintBadge meta={{ label: 'Manual win', bg: C.surfaceAlt, color: C.textMute, bd: C.border }} />
                  {canRevertWon && (
                    <button type="button" onClick={() => setRevertOpen(true)}
                      style={{ background: 'none', border: 'none', padding: 0, font: '600 12.5px Inter, sans-serif', color: C.navy, cursor: 'pointer' }}>
                      Revert Manual Win
                    </button>
                  )}
                </>
              )}
              {/* Putaran 9 -- chip "Free Trade Zone", posisi mockup :282
                  (sesudah Manual win/Revert). Rumus: lihat komentar
                  isInquiryFtz. */}
              {isInquiryFtz && (
                <TintBadge meta={{ label: 'Free Trade Zone', bg: C.amberBg, color: C.amber, bd: C.amberBd }} />
              )}
            </div>
            {/* TD-318 Irisan 2 Inquiry, commit 4: versi ringkas RouteStrip
                (mockup showRoute, Inquiry Management.dc.html :301-304) —
                satu baris pol->pod sebelum HeaderMeta. Token dioper manual
                (navy/orange/cream `C`), komponennya sendiri tidak mengimpor
                token sage — lihat komentar src/kit/RouteStrip.jsx. */}
            <RouteStrip
              compact
              pol={inquiry.pol}
              pod={inquiry.pod}
              tokens={{ border: C.border, mutedBg: C.bg, text: C.text, textMute: C.textMute }}
            />
          </div>
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
              closed={DEAL_CLOSED_STATUS.includes(dealStatus) ? { stage: dealStatus, label: STATUS_LABEL[dealStatus] || dealStatus } : null}
            />
            {/* TD-318 Irisan 2 Inquiry, bug fix round, Task 4: DocumentFlow
                DIPINDAH ke sini dari dalam tab Overview -- terbukti dari
                mockup (byte offset diverifikasi langsung di file sumber)
                DocumentFlow HIDUP DI LUAR blok kondisional tab mana pun,
                tepat sesudah StageBar/badge "closed" dan SEBELUM NextStep,
                di dalam section Header yang sama -- bukan isi tab Overview.
                Selalu tampil lintas tab, bukan hilang saat pindah tab lain. */}
            <div style={{ marginTop: SP.s3 }}>
              <DocumentFlow
                nodes={documentFlowNodes}
                // [Putaran 16a Tahap 0, GAGAL ditutup] diukur mockup (data
                // node: `bg: i===1 ? '#C3D9B8' : '#FFFFFF'`) -- node aktif
                // = ACCENT polos, BUKAN ROW_HOVER (C.navySoft).
                tokens={{ border: C.border, text: C.text, textMute: C.textMute, activeBg: C.orange, linkColor: C.navy }}
              />
            </div>
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

      {/* TD-318 Irisan 2 Inquiry, commit 4 (keputusan Mas #2): "Inquiry Detail"
          yang dulu SELALU tampil di luar tab sekarang JADI isi tab Overview —
          lima tab urut Overview (default)/Quotation/PRF/Activity/Status
          History. Quotation dan PRF ISI & NAMA TIDAK diubah, hanya posisi
          urutannya di array (Activity digeser ke akhir). Badge angka di label
          PRF dioper sebagai NODE lewat prop `label` — Notebook merender
          `{t.label}` apa adanya, kontraknya tak perlu disentuh sama sekali. */}
      <Notebook
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            render: () => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Card
                title="Inquiry Detail"
                icon={<FileText size={17} />}
              >
        {/* ===== Section "Service & Status" (Irisan 2 Inquiry, lanjutan audit
            mockup, Pekerjaan B commit 4; Direction/Customer Role/Source
            ditambahkan Putaran 9) -- mockup SECS[0], judul "Service &
            Status". Kolom `direction`/`customer_role` BELUM ADA saat
            Irisan 2 ditulis -- komentar lama "DILEWATI, nol kolom" sudah
            basi, dikoreksi di sini. Urutan field PERSIS urutan DOM mockup
            (Service Type, Direction, Customer Role[kondisional notGT],
            Status, Source) -- "Route" (field lama, ada di kode tak ada di
            mockup, keputusan Mas: DIBIARKAN) ditaruh TERAKHIR, sesudah
            Source, supaya 5 field asli mockup tetap mengikuti urutan dan
            pengelompokan barisnya sendiri di grid 3-kolom. */}
        <SectionHeader
          title="Service & Status"
          editing={editingSection === 'Service'}
          canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
          saving={savingSection}
          onEdit={() => {
            setSectionDraft({
              service_type: inquiry.service_type || '',
              direction: inquiry.direction || '',
              customer_role: inquiry.customer_role || '',
              pricing_basis: inquiry.pricing_basis || '',
            });
            setEditingSection('Service');
          }}
          onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
          onSave={() => saveInquirySection({
            service_type: sectionDraft.service_type || null,
            direction: sectionDraft.direction || null,
            customer_role: sectionDraft.customer_role || null,
            pricing_basis: sectionDraft.pricing_basis || null,
          }, 'Service & Status')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, marginBottom: 20 }}>
          <SelectField
            label="Service Type"
            editing={editingSection === 'Service'}
            value={SERVICE_LABEL[inquiry.service_type] || inquiry.service_type}
            draft={sectionDraft.service_type}
            onDraft={(v) => setSectionDraft((d) => ({ ...d, service_type: v }))}
            // Putaran 14 Tahap 2 -- opsi 'trading' hanya muncul bila
            // entitas inquiry (inquiry.company_id) adalah SOA (mockup
            // :756 `og.svc.gt.disp = acc && acc.ent === 'SOA' ? 'flex' :
            // 'none'`, pola sama wizard). Inquiry yang sudah 'trading'
            // tetap tampil benar di mode baca lewat SERVICE_LABEL di
            // atas -- filter ini hanya mengubah pilihan dropdown saat
            // EDIT, bukan tampilan tersimpan.
            options={Object.entries(SERVICE_LABEL)
              .filter(([value]) => value !== 'trading' || inquiry.company_id === SOA_ID)
              .map(([value, label]) => ({ value, label }))}
          />
          <SelectField
            label="Direction"
            editing={editingSection === 'Service'}
            value={inquiry.direction}
            draft={sectionDraft.direction}
            onDraft={(v) => setSectionDraft((d) => ({ ...d, direction: v }))}
            options={DIRECTION_OPTIONS}
            includeEmpty
          />
          {/* Customer Role -- mockup notGT. Nilai yang tersimpan TIDAK
              diubah saat section ini disembunyikan: draft diseed dari
              inquiry.customer_role di onEdit (persis seperti field lain),
              jadi kalau pengguna tak pernah melihat/menyentuhnya, Save
              mengirim balik nilai yang sama persis (keputusan Mas). */}
          {notGT && (
            <SelectField
              label="Customer Role"
              editing={editingSection === 'Service'}
              value={inquiry.customer_role}
              draft={sectionDraft.customer_role}
              onDraft={(v) => setSectionDraft((d) => ({ ...d, customer_role: v }))}
              options={CUSTOMER_ROLE_OPTIONS}
              includeEmpty
            />
          )}
          <LockedField label="Status" value={STATUS_LABEL[dealStatus] || dealStatus} />
          <TextField label="Source" editing={false} value={accountSourceLabel} placeholder="Source not recorded" />
          <TextField label="Route" editing={false} value={inquiry.route} />
          {/* Putaran 14 Tahap 2 -- Pricing Basis diperluas ke Customs
              Clearance (sebelumnya hanya Door to Door). Nilai yang
              tersimpan TIDAK berubah saat disembunyikan -- pola persis
              Customer Role di atas. Pemeriksaan trigger/validasi: nol
              trigger menyentuh pricing_basis di seluruh migrasi (grep
              `CREATE TRIGGER.*inquiries`), hanya CHECK 3 nilai
              (migrasi 20261025000002) -- plain UPDATE aman, dilaporkan
              di laporan akhir. */}
          {['door_to_door', 'customs'].includes(inquiry?.service_type) && (
            <SelectField
              label="Pricing Basis"
              editing={editingSection === 'Service'}
              value={inquiry.pricing_basis}
              draft={sectionDraft.pricing_basis}
              onDraft={(v) => setSectionDraft((d) => ({ ...d, pricing_basis: v }))}
              options={PRICING_BASIS_OPTIONS}
              includeEmpty
            />
          )}
        </div>
        {/* Putaran 14 Tahap 3 -- mockup :317-362: divider + RouteStrip +
            Route & Terms + Route Options + Cargo + Additional Services
            SELURUHNYA di dalam SATU blok `notGT` yang sama (byte-offset
            diverifikasi di file sumber) -- disembunyikan utuh untuk GT,
            bukan dibongkar per-elemen. */}
        {!isGT && (<>
        <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />

        {/* TD-318 Irisan 2 Inquiry, commit 4: RouteStrip menggantikan baris
            panah POL→POD polos (mockup Detail/RouteStrip). Varian DoorToDoor
            (Pickup→POL→POD→Delivery) TIDAK PERNAH bisa terpicu oleh data hari
            ini -- DOOR_TO_DOOR_SERVICE_TYPES sengaja kosong, lihat komentarnya
            dekat SERVICE_LABEL. Dibangun tetap sesuai penamaan eksplisit Mas,
            dilaporkan sebagai temuan (dead code path), bukan ditebak reachable.
            DIPINDAH ke sini (Irisan 2 lanjutan audit mockup) -- RouteStrip di
            mockup adalah pratinjau visual DI DALAM section "Route & Terms"
            (byte-offset diverifikasi langsung di file sumber), bukan sebelum
            section pertama seperti posisi lama. */}
        {DOOR_TO_DOOR_SERVICE_TYPES.includes(inquiry.service_type) ? (
          <div style={{ marginBottom: 20 }}>
            <RouteStripDoorToDoor
              pickup={inquiry.pickup_address}
              pol={inquiry.pol}
              pod={inquiry.pod}
              delivery={inquiry.delivery_address}
              containerLabel={(inquiry.container_types || []).join(', ') || undefined}
              tokens={{ border: C.border, mutedBg: C.bg, text: C.text, textMute: C.textMute }}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <RouteStrip
              pol={inquiry.pol}
              pod={inquiry.pod}
              containerLabel={(inquiry.container_types || []).join(', ') || undefined}
              tokens={{ border: C.border, mutedBg: C.bg, text: C.text, textMute: C.textMute }}
            />
          </div>
        )}

        {/* ===== Section "Route & Terms" (Irisan 2 Inquiry, lanjutan audit
            mockup, Pekerjaan B commit 6) -- mockup SECS[1], judul "Route &
            Terms". RouteStrip di atas adalah pratinjau visual section ini
            (mockup menaruhnya DI DALAM section yang sama) -- pol/pod jadi
            TAMPIL DUA KALI (pratinjau + field edit di sini), sesuai mockup
            sendiri yang juga melakukan ini (dua render berbeda dari data
            yang sama). Cargo ready date DILEWATI -- nol kolom `inquiries`
            (PLAN §8.4). Lanes multi-rute/pre-shipment checklist TETAP di
            luar scope (keputusan lama, tidak disentuh lagi di sini). */}
        <SectionHeader
          title="Route & Terms"
          editing={editingSection === 'Route'}
          canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
          saving={savingSection}
          onEdit={() => {
            setSectionDraft({
              pol: inquiry.pol || '', pod: inquiry.pod || '',
              // Irisan 6 -- ID lokasi ikut diseed draft (dibaca LocationPicker
              // di bawah); pol/pod teks tetap diseed juga, ditulis ulang
              // bersamaan oleh LocationPicker.onChange kalau user memilih lagi.
              pol_location_id: inquiry.pol_location_id || null, pod_location_id: inquiry.pod_location_id || null,
              pickup_address: inquiry.pickup_address || '', delivery_address: inquiry.delivery_address || '',
              incoterms: inquiry.incoterms || [], container_types: inquiry.container_types || [],
              // Putaran 9 -- Cargo ready date, hanya bermakna utk Single
              // Shipment (sama alasan validity_from/to di bawah -- diseed
              // tanpa syarat, harmless utk Rate Sheet).
              cargo_ready_date: inquiry.cargo_ready_date || '',
              // Putaran 4 Tahap 4C -- diseed TANPA SYARAT (harmless utk
              // Single Shipment, tak pernah dirender/dikirim di cabang itu).
              validity_from: inquiry.validity_from || '', validity_to: inquiry.validity_to || '',
              monthly_volume_cbm: inquiry.monthly_volume_cbm != null ? formatIdNumber(inquiry.monthly_volume_cbm) : '',
            });
            setEditingSection('Route');
          }}
          onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
          onSave={() => {
            // Putaran 4 Tahap 4C, REVISI 3 -- cabang Rate Sheet Request:
            // validasi klien MENCERMINKAN constraint DB
            // inquiries_rate_sheet_fields_check, SEBELUM saveInquirySection
            // dipanggil sama sekali (nol panggilan DB kalau gagal).
            if (isInquiryRS) {
              if (!sectionDraft.validity_from || !sectionDraft.validity_to) {
                showToast?.('Validity Requested From and Until are required.', 'error'); return;
              }
              if (sectionDraft.validity_to < sectionDraft.validity_from) {
                showToast?.('Validity Requested Until must be on or after From.', 'error'); return;
              }
              const vol = readMoneyInput(sectionDraft.monthly_volume_cbm);
              if (vol.unrecognized) { showToast?.('Angka tidak dikenali', 'error'); return; }
              if (!(vol.value > 0)) { showToast?.('Estimated Volume per Month is required and must be greater than 0.', 'error'); return; }
              saveInquirySection({
                validity_from: sectionDraft.validity_from,
                validity_to: sectionDraft.validity_to,
                monthly_volume_cbm: vol.value,
              }, 'Route & Terms');
              return;
            }
            // Single Shipment -- byte-identik kode SEBELUM Tahap 4C.
            saveInquirySection({
              // Putaran 4 Tahap 4B, review fix 5 -- pol/pod/*_location_id TIDAK
              // disertakan sama sekali saat inquiry ini punya baris inquiry_lanes
              // (lanes.length > 0): lane utama adalah sumber kebenaran untuk
              // field-field itu (RPC create_inquiry_with_lanes yang menulisnya),
              // menyertakannya di sini bisa menimpa lane utama dengan nilai yang
              // tidak pernah diedit lewat alur lane. Field lain di section ini
              // tetap dikirim seperti biasa.
              ...(lanes.length > 0 ? {} : {
                pol: sectionDraft.pol || null, pod: sectionDraft.pod || null,
                pol_location_id: sectionDraft.pol_location_id || null, pod_location_id: sectionDraft.pod_location_id || null,
              }),
              pickup_address: sectionDraft.pickup_address || null, delivery_address: sectionDraft.delivery_address || null,
              cargo_ready_date: sectionDraft.cargo_ready_date || null,
              incoterms: (sectionDraft.incoterms || []).length ? sectionDraft.incoterms : null,
              container_types: (sectionDraft.container_types || []).length ? sectionDraft.container_types : null,
            }, 'Route & Terms');
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, marginBottom: 20 }}>
          {/* Irisan 6 -- POL/POD pakai LocationPicker HANYA saat editing (rule
              108: "replaces free text for... Origin and Destination in
              Inquiry detail"); tampilan read-only TETAP TextField apa adanya
              (zero perubahan ke komponen itu) -- minimal footprint, pola
              sama field lain di section ini yang tak tersentuh.
              Putaran 4 Tahap 4B, review fix 5 -- begitu inquiry ini punya
              baris inquiry_lanes (lanes.length > 0), POL/POD TETAP read-only
              WALAU editingSection==='Route' -- celah yang sebelumnya membiarkan
              LocationPicker tetap editable di sini padahal lane utama sudah
              mengunci field yang sama di InquiryFormPage.jsx. */}
          {editingSection === 'Route' && lanes.length === 0 ? (
            <>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textMute, marginBottom: 6 }}>Port of Loading</div>
                <LocationPicker
                  value={sectionDraft.pol_location_id} textValue={sectionDraft.pol} options={locations}
                  tokens={LOCATION_PICKER_TOKENS} placeholder="Select port of loading…"
                  onChange={(id, loc) => setSectionDraft((d) => ({ ...d, pol_location_id: id, pol: loc.name }))}
                  onManage={canManageLocations ? openLocationMaster : undefined}
                  onRequest={canManageLocations ? undefined : requestNewLocation}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textMute, marginBottom: 6 }}>Port of Discharge</div>
                <LocationPicker
                  value={sectionDraft.pod_location_id} textValue={sectionDraft.pod} options={locations}
                  tokens={LOCATION_PICKER_TOKENS} placeholder="Select port of discharge or city…"
                  onChange={(id, loc) => setSectionDraft((d) => ({ ...d, pod_location_id: id, pod: loc.name }))}
                  onManage={canManageLocations ? openLocationMaster : undefined}
                  onRequest={canManageLocations ? undefined : requestNewLocation}
                />
              </div>
            </>
          ) : (
            <>
              <TextField label="Port of Loading" editing={false} value={inquiry.pol} />
              <TextField label="Port of Discharge" editing={false} value={inquiry.pod} />
              {lanes.length > 0 && editingSection === 'Route' && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: C.textMute }}>
                  Port of Loading and Port of Discharge come from this inquiry&apos;s route options and can&apos;t be edited here yet.
                </div>
              )}
            </>
          )}
          {/* Putaran 4 Tahap 4C -- Pickup/Delivery/Incoterms/Container Type
              hanya bermakna utk Single Shipment (RPC memaksa keempatnya NULL
              utk Rate Sheet Request, §2 plan) -- disembunyikan, BUKAN
              dihapus, saat isInquiryRS. Validity/Volume menggantikannya. */}
          {isInquiryRS ? (
            <>
              <TextField label="Validity Requested From" type="date" editing={editingSection === 'Route'} value={inquiry.validity_from}
                draft={sectionDraft.validity_from} onDraft={(v) => setSectionDraft((d) => ({ ...d, validity_from: v }))} />
              <TextField label="Validity Requested Until" type="date" editing={editingSection === 'Route'} value={inquiry.validity_to}
                draft={sectionDraft.validity_to} onDraft={(v) => setSectionDraft((d) => ({ ...d, validity_to: v }))} />
              <TextField label="Estimated Volume per Month (CBM)" mono editing={editingSection === 'Route'}
                value={inquiry.monthly_volume_cbm != null ? formatIdNumber(inquiry.monthly_volume_cbm) : ''}
                draft={sectionDraft.monthly_volume_cbm} onDraft={(v) => setSectionDraft((d) => ({ ...d, monthly_volume_cbm: v }))} />
            </>
          ) : (
            <>
              <TextField label="Pickup Address" editing={editingSection === 'Route'} value={inquiry.pickup_address}
                draft={sectionDraft.pickup_address} onDraft={(v) => setSectionDraft((d) => ({ ...d, pickup_address: v }))} />
              <TextField label="Delivery Address" editing={editingSection === 'Route'} value={inquiry.delivery_address}
                draft={sectionDraft.delivery_address} onDraft={(v) => setSectionDraft((d) => ({ ...d, delivery_address: v }))} />
              {/* Putaran 9 -- Cargo ready date. Mockup (:346, baris satu
                  grid dengan Delivery Address) -- kolom cargo_ready_date
                  (migrasi 20261025000002). Nilai mentah ISO, bukan
                  fmtDate() -- konvensi lokal section ini (pola persis
                  Validity Requested From/Until di atas, bukan konvensi
                  Deadline Quote di section lain). */}
              <TextField label="Cargo ready date" type="date" editing={editingSection === 'Route'} value={inquiry.cargo_ready_date}
                draft={sectionDraft.cargo_ready_date} onDraft={(v) => setSectionDraft((d) => ({ ...d, cargo_ready_date: v }))}
                placeholder="Not recorded" />
              <ChipToggleField label="Incoterms" editing={editingSection === 'Route'}
                values={inquiry.incoterms} draft={sectionDraft.incoterms}
                onDraft={(v) => setSectionDraft((d) => ({ ...d, incoterms: v }))} options={INCOTERMS} />
              <ChipToggleField label="Container Type" editing={editingSection === 'Route'}
                values={inquiry.container_types} draft={sectionDraft.container_types}
                onDraft={(v) => setSectionDraft((d) => ({ ...d, container_types: v }))} options={CONTAINER_TYPES} />
            </>
          )}
        </div>

        {/* Ronde "Lane Editor" -- "Route Options" SEKARANG section penuh
            (Edit/Save/Cancel, gate canEditRouteOptions = K3), bukan sub-blok
            read-only bersyarat lanes.length>1 di dalam "Route & Terms".
            SELALU tampil (K2.1): lanes>=1 -> LaneTable readOnly atas data
            nyata; lanes=0 (inquiry lama) -> LaneTable readOnly atas SATU
            baris disintesis dari inquiries.pol/pod (displayLanes, K2.2).
            Mode edit memakai KOMPONEN YANG SAMA (readOnly={false}) --
            bukan dua jalur render terpisah. Catatan kunci POL/POD di section
            "Route & Terms" di atas TIDAK diubah (K2.4). */}
        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <SectionHeader
            title="Route Options"
            editing={editingSection === 'RouteOptions'}
            canEdit={canEditRouteOptions}
            saving={savingSection}
            onEdit={() => {
              setLaneDraft(lanes.length > 0 ? lanes.map((l) => ({ ...l })) : singleLaneFromInquiry(inquiry));
              setEditingSection('RouteOptions');
            }}
            onCancel={() => { setEditingSection(null); setLaneDraft([]); }}
            onSave={() => saveInquiryLanesSection(laneDraft)}
          />
          <div style={{ marginTop: 16 }}>
            <LaneTable
              lanes={editingSection === 'RouteOptions' ? laneDraft : displayLanes}
              locations={locations} laneModeOpts={laneModeOpts} laneUnitOpts={laneUnitOpts} tokens={LOCATION_PICKER_TOKENS}
              canManageLocations={canManageLocations} openLocationMaster={openLocationMaster} requestNewLocation={requestNewLocation}
              readOnly={editingSection !== 'RouteOptions'}
              onUpdate={updateDetailLane} onRemove={removeDetailLane} onAdd={addDetailLane} onMove={moveDetailLane}
            />
          </div>
        </div>
        <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />

        {/* ===== Section "Cargo" (Irisan 2 Inquiry, lanjutan audit mockup,
            Pekerjaan B commit 7) -- mockup SECS[2]. UN Number/IMO Class/
            MSDS Available: TIGA kolom ini SUDAH di-select sejak awal
            Irisan 2 tapi TIDAK PERNAH ditampilkan di mana pun di kode --
            section ini pertama kalinya mereka terlihat, bukan dipindah dari
            tempat lain. "Number of containers" DILEWATI -- nol kolom
            `inquiries` (PLAN §8.5, BUKAN `estimated_volume`, field beda
            konsep dipakai InquiryFormPage.jsx). Weight (kg)/Volume (CBM)
            pakai `src/lib/numberFormat.js` (type="text", BUKAN
            type="number" -- pelajaran TD-285: angka format Indonesia salah
            dibaca type="number", nilai tersimpan sejuta kali lebih kecil
            TANPA error). Simpan DIBLOK (bukan "simpan dgn peringatan" ala
            modul SP) kalau teks weight/volume tak terbaca -- form baru ini
            lebih longgar skalanya dari form SP, lebih aman menolak simpan
            daripada menyimpan 0 diam-diam. */}
        <SectionHeader
          title="Cargo"
          editing={editingSection === 'Cargo'}
          canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
          saving={savingSection}
          onEdit={() => {
            setSectionDraft({
              goods_name: inquiry.goods_name || '', hs_code: inquiry.hs_code || '',
              weight_kg: inquiry.weight_kg != null ? formatIdNumber(inquiry.weight_kg) : '',
              volume_cbm: inquiry.volume_cbm != null ? formatIdNumber(inquiry.volume_cbm) : '',
              dimension: inquiry.dimension || '', cargo_types: inquiry.cargo_types || [],
              un_number: inquiry.un_number || '', imo_class: inquiry.imo_class || '', has_msds: inquiry.has_msds || '',
            });
            setEditingSection('Cargo');
          }}
          onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
          onSave={() => {
            const weight = readMoneyInput(sectionDraft.weight_kg);
            const vol = readMoneyInput(sectionDraft.volume_cbm);
            // Putaran 6 Task 3 -- dulu "Total Weight (kg): angka tidak
            // dikenali." (campur bahasa: label Inggris + isi Indonesia),
            // SATU-SATUNYA tempat di seluruh src/ yang menggabungkan label
            // field dengan frasa "angka tidak dikenali" dalam satu toast --
            // bentuk standalone "Angka tidak dikenali" di file ini (baris
            // ~1934) dan di banyak modul lain (CaptureLeadModal/
            // LeadDetailPage/InvoiceDetailPage/SalesOrderDetailPage/
            // InputSPPage) SENGAJA TIDAK disentuh, itu konvensi mapan
            // lintas-app, bukan toast campur bahasa.
            if (weight.unrecognized) { showToast?.('Total Weight (kg): number not recognized.', 'error'); return; }
            if (vol.unrecognized) { showToast?.('Volume (CBM): number not recognized.', 'error'); return; }
            saveInquirySection({
              goods_name: sectionDraft.goods_name || null, hs_code: sectionDraft.hs_code || null,
              weight_kg: String(sectionDraft.weight_kg || '').trim() === '' ? null : weight.value,
              volume_cbm: String(sectionDraft.volume_cbm || '').trim() === '' ? null : vol.value,
              dimension: sectionDraft.dimension || null,
              cargo_types: (sectionDraft.cargo_types || []).length ? sectionDraft.cargo_types : null,
              un_number: sectionDraft.un_number || null, imo_class: sectionDraft.imo_class || null,
              has_msds: sectionDraft.has_msds || null,
            }, 'Cargo');
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, marginBottom: 20 }}>
          <TextField label="Item Name" editing={editingSection === 'Cargo'} value={inquiry.goods_name}
            draft={sectionDraft.goods_name} onDraft={(v) => setSectionDraft((d) => ({ ...d, goods_name: v }))} />
          <TextField label="HS Code" editing={editingSection === 'Cargo'} value={inquiry.hs_code} mono
            draft={sectionDraft.hs_code} onDraft={(v) => setSectionDraft((d) => ({ ...d, hs_code: v }))} />
          <TextField label="Total Weight (kg)" editing={editingSection === 'Cargo'} mono
            value={inquiry.weight_kg != null ? formatIdNumber(inquiry.weight_kg) : ''}
            draft={sectionDraft.weight_kg} onDraft={(v) => setSectionDraft((d) => ({ ...d, weight_kg: v }))} />
          <TextField label="Volume (CBM)" editing={editingSection === 'Cargo'} mono
            value={inquiry.volume_cbm != null ? formatIdNumber(inquiry.volume_cbm) : ''}
            draft={sectionDraft.volume_cbm} onDraft={(v) => setSectionDraft((d) => ({ ...d, volume_cbm: v }))} />
          <TextField label="Dimension" editing={editingSection === 'Cargo'} value={inquiry.dimension}
            draft={sectionDraft.dimension} onDraft={(v) => setSectionDraft((d) => ({ ...d, dimension: v }))} />
          <ChipToggleField label="Cargo Type" editing={editingSection === 'Cargo'}
            values={inquiry.cargo_types} draft={sectionDraft.cargo_types}
            onDraft={(v) => setSectionDraft((d) => ({ ...d, cargo_types: v }))} options={CARGO_TYPES} />
          {/* Putaran 9 -- "Number of containers". Mockup :357, gated
              `showNcont` (ADA container type FCL-apa pun) -- baca-saja
              TOTAL, mockup sendiri nol varian edit field ini (tidak di
              whitelist saveSec). `mono` memberi font IBM Plex Mono saat
              terisi + italic/muted saat "Not set" -- persis ncontFont/
              ncontClr mockup, nol styling kustom perlu ditulis di sini. */}
          {showNcont && (
            <TextField label="Number of containers" editing={false} mono
              value={inquiry.n_containers != null ? String(inquiry.n_containers) : ''}
              placeholder="Container count not recorded" />
          )}
          {/* Putaran 9 perbaikan 2 -- gating Dangerous Goods (mockup isDG)
              utk UN Number/IMO Class/MSDS Available, yang sebelumnya
              SELALU tampil tanpa syarat (temuan audit Langkah 1). Live
              terhadap DRAFT saat mode edit (bukan nilai komit, beda
              sengaja dari `notGT`) -- toggle Cargo Type langsung
              menunjukkan/menyembunyikan ketiganya tanpa perlu Save dulu.
              Penjaga data lama: tetap tampil (ketiganya, satu kelompok)
              kalau SALAH SATU dari tiga field sudah berisi nilai, walau
              Cargo Type tidak/tidak lagi memuat Dangerous Goods --
              mencegah data lama hilang dari layar. Nilai draft TIDAK
              pernah direset saat tersembunyi (nol kode yang menyentuhnya)
              -- Save tetap mengirim nilai draft apa adanya. */}
          {(() => {
            const cargoTypesNow = editingSection === 'Cargo' ? (sectionDraft.cargo_types || []) : (inquiry.cargo_types || []);
            const unNow = editingSection === 'Cargo' ? sectionDraft.un_number : inquiry.un_number;
            const imoNow = editingSection === 'Cargo' ? sectionDraft.imo_class : inquiry.imo_class;
            const msdsNow = editingSection === 'Cargo' ? sectionDraft.has_msds : inquiry.has_msds;
            const showDgFields = cargoTypesNow.includes('dg') || !!unNow || !!imoNow || !!msdsNow;
            if (!showDgFields) return null;
            return (
              <>
                <TextField label="UN Number" editing={editingSection === 'Cargo'} value={inquiry.un_number}
                  draft={sectionDraft.un_number} onDraft={(v) => setSectionDraft((d) => ({ ...d, un_number: v }))} />
                <SelectField label="IMO Class" editing={editingSection === 'Cargo'} value={inquiry.imo_class}
                  draft={sectionDraft.imo_class} onDraft={(v) => setSectionDraft((d) => ({ ...d, imo_class: v }))}
                  options={IMO_CLASSES} includeEmpty />
                <SelectField label="MSDS Available" editing={editingSection === 'Cargo'} value={inquiry.has_msds}
                  draft={sectionDraft.has_msds} onDraft={(v) => setSectionDraft((d) => ({ ...d, has_msds: v }))}
                  options={MSDS_OPTS} includeEmpty />
              </>
            );
          })()}
        </div>
        <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />

        {/* ===== Section "Additional Services" (Irisan 2 Inquiry, lanjutan
            audit mockup, Pekerjaan B commit 8) -- mockup SECS[3]. SATU-
            SATUNYA field ber-kolom DB di section ini -- Order Category/
            Requested Delivery Date/Estimated Shipping Cost/Customer
            Reference/Delivery Destinations SELURUHNYA DILEWATI (PLAN
            §8.6-10): nol kolom `inquiries` utk empat yang pertama, dan
            Delivery Destinations bahkan READ-ONLY di mockup sendiri (bukan
            bagian whitelist saveSec). */}
        <SectionHeader
          title="Additional Services"
          editing={editingSection === 'Addl'}
          canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
          saving={savingSection}
          onEdit={() => { setSectionDraft({ additional_services: inquiry.additional_services || [] }); setEditingSection('Addl'); }}
          onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
          onSave={() => saveInquirySection({
            additional_services: (sectionDraft.additional_services || []).length ? sectionDraft.additional_services : null,
          }, 'Additional Services')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, marginBottom: 20 }}>
          <ChipToggleField label="Additional Services" editing={editingSection === 'Addl'}
            values={inquiry.additional_services} draft={sectionDraft.additional_services}
            onDraft={(v) => setSectionDraft((d) => ({ ...d, additional_services: v }))} options={SERVICES} span={3} />
        </div>
        <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />
        </>)}

        {/* ===== Blok "Shipments" (Putaran 9, khusus Rate Sheet) -- mockup
            data-screen-label="Detail/Shipments" (:402), sibling SESUDAH
            section "Delivery" (section itu sendiri TIDAK dibangun di sini
            -- kelima fieldnya [Order Category/Requested Delivery Date/
            Estimated Shipping Cost/Customer Reference/Delivery
            Destinations] nol kolom `inquiries`, dicek ulang grep seluruh
            migrations/, tetap pengecualian/ditunda). Daftar penuh
            sales_orders inquiry ini -- so_no + tanggal ADA kolomnya;
            kolom "note" mockup TIDAK ADA sumbernya (nol kolom naratif di
            sales_orders) -- dikosongkan, pengecualian tingkat field.
            Baca-saja TOTAL, mockup sendiri nol tombol Edit untuk blok ini. */}
        {isInquiryRS && (
          <>
            <h3 style={{ margin: 0, marginBottom: 12, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: C.text }}>Shipments</h3>
            {shipmentRows.length > 0 ? (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                {shipmentRows.map((so) => (
                  <div key={so.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 140px 1fr', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.surfaceAlt}`, fontFamily: BODY, fontSize: 13 }}>
                    <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.navy }}>{so.so_no}</span>
                    <span>{fmtDate(so.created_at)}</span>
                    <span style={{ color: C.textFaint }}>—</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '12px 16px', border: `1px dashed ${C.border}`, borderRadius: 10, color: C.textMute, fontFamily: BODY, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
                No shipment yet. Shipments are created from the active Rate Sheet quotation, in the Sales Order stage that comes next. Once a shipment exists, this inquiry can no longer be cancelled.
              </div>
            )}
            <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />
          </>
        )}

        {/* ===== Section "Timeline & Ownership" (Irisan 2 Inquiry, lanjutan
            audit mockup, Pekerjaan B commit 9) -- mockup SECS[4]. Deadline
            Quote SATU-SATUNYA field tersimpan (saveSec whitelist: `dl`).
            Owner/Created By/Created On TETAP read-only (bukan bagian
            saveSec mockup -- Owner sudah punya mekanisme Reassign
            tersendiri di metric row header, keputusan Mas #4 tidak
            membuat jalur kedua). Contact (`contact_id`, uuid FK) DITAMPILKAN
            read-only saja (PLAN §8.11) -- mockup mengeditnya sebagai teks
            nama bebas yang tak cocok tipe data uuid, dan nol komponen
            contact-picker ada di codebase; nama di-resolve lewat embed FK
            yang sudah ditambahkan ke select query (pola sama chip Entity).
            "Est. Closing" (field lama, ada di kode tak ada di mockup --
            dipindah dari header TD-318 Irisan 2 bug-fix round) DIBIARKAN
            tampil di sini, tetap read-only. */}
        <SectionHeader
          title="Timeline & Ownership"
          editing={editingSection === 'Timeline'}
          canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
          saving={savingSection}
          onEdit={() => { setSectionDraft({ deadline_quote: inquiry.deadline_quote || '' }); setEditingSection('Timeline'); }}
          onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
          onSave={() => saveInquirySection({ deadline_quote: sectionDraft.deadline_quote || null }, 'Timeline & Ownership')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, marginBottom: 20 }}>
          <TextField label="Deadline Quote" type="date" editing={editingSection === 'Timeline'}
            value={inquiry.deadline_quote ? fmtDate(inquiry.deadline_quote) : ''}
            draft={sectionDraft.deadline_quote} onDraft={(v) => setSectionDraft((d) => ({ ...d, deadline_quote: v }))} />
          <TextField label="Owner" editing={false} value={ownerName} />
          <TextField label="Created By" editing={false} value={createdByName} />
          <TextField label="Created On" editing={false} value={fmtDate(inquiry.created_at)} />
          <TextField label="Contact" editing={false} value={inquiry.contact?.name} />
          <TextField label="Est. Closing" editing={false} value={account?.estimated_closing_date ? fmtDate(account.estimated_closing_date) : ''} />
        </div>
        <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />

        {/* ===== Section "Value" (Irisan 2 Inquiry, lanjutan audit mockup,
            Pekerjaan B commit 10) -- mockup SECS[5], TETAP READ-ONLY
            seluruhnya (keputusan Mas #2, final): mockup mewajibkan alasan +
            riwayat (`estHist`) untuk setiap perubahan manual nilai, dan
            tabel `inquiries` hanya punya kolom `estimated_value` polos,
            tanpa tempat menyimpan alasan/riwayat itu. SectionHeader
            dipanggil dengan `canEdit={false}` -- tombol Edit TIDAK PERNAH
            dirender utk section ini, apa pun status inquiry-nya (bukan
            cuma status terminal yang menyembunyikannya seperti section
            lain). Kebutuhan kolom DB (alasan+riwayat) BELUM diajukan --
            di luar scope perbaikan FE ini. */}
        <SectionHeader title="Value" editing={false} canEdit={false} saving={false} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16, marginBottom: 20 }}>
          <TextField label="Estimated Value" editing={false} mono
            value={inquiry.estimated_value == null ? '' : fmtRp(Number(inquiry.estimated_value))} />
        </div>
        <div style={{ height: 1, background: C.lineSoft, marginBottom: 20 }} />

        {/* ===== Section "Notes" (Irisan 2 Inquiry, lanjutan audit mockup,
            Pekerjaan B commit 11, TERAKHIR) -- mockup SECS[6]. Satu-satunya
            field (`notes`), textarea bebas, nol validasi wajib. */}
        <SectionHeader
          title="Notes"
          editing={editingSection === 'Notes'}
          canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
          saving={savingSection}
          onEdit={() => { setSectionDraft({ notes: inquiry.notes || '' }); setEditingSection('Notes'); }}
          onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
          onSave={() => saveInquirySection({ notes: sectionDraft.notes || null }, 'Notes')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16 }}>
          <TextareaField label="Notes" editing={editingSection === 'Notes'} value={inquiry.notes}
            draft={sectionDraft.notes} onDraft={(v) => setSectionDraft((d) => ({ ...d, notes: v }))} />
        </div>
        {/* ===== Section "Delivery" (Putaran 14 Tahap 3) -- EMPAT kolom
            baru (migrasi 20261030000001), GT-only (mockup SK-nya sendiri
            menaruh step 'delivery' hanya di cabang isGTf -- lihat
            InquiryIntakeWizardPage.jsx). Ditaruh SESUDAH Notes, bukan di
            posisi mockup "Additional Services"/SECS[3] -- instruksi
            eksekusi eksplisit minta posisi ini. Estimated Shipping Cost
            pakai pola persis Cargo (TD-285: type="text" +
            formatIdNumber/readMoneyInput, simpan DIBLOK kalau tak
            terbaca, pesan toast '<Label>: number not recognized.'). */}
        {isGT && (
          <>
            <div style={{ height: 1, background: C.lineSoft, marginTop: 20, marginBottom: 20 }} />
            <SectionHeader
              title="Delivery"
              editing={editingSection === 'Delivery'}
              canEdit={LOSABLE_INQUIRY_STATUS.includes(dealStatus)}
              saving={savingSection}
              onEdit={() => {
                setSectionDraft({
                  order_category: inquiry.order_category || '',
                  requested_delivery_date: inquiry.requested_delivery_date || '',
                  estimated_shipping_cost: inquiry.estimated_shipping_cost != null ? formatIdNumber(inquiry.estimated_shipping_cost) : '',
                  customer_reference: inquiry.customer_reference || '',
                });
                setEditingSection('Delivery');
              }}
              onCancel={() => { setEditingSection(null); setSectionDraft({}); }}
              onSave={() => {
                const shipCost = readMoneyInput(sectionDraft.estimated_shipping_cost);
                if (shipCost.unrecognized) { showToast?.('Estimated Shipping Cost: number not recognized.', 'error'); return; }
                saveInquirySection({
                  order_category: sectionDraft.order_category || null,
                  requested_delivery_date: sectionDraft.requested_delivery_date || null,
                  estimated_shipping_cost: String(sectionDraft.estimated_shipping_cost || '').trim() === '' ? null : shipCost.value,
                  customer_reference: sectionDraft.customer_reference || null,
                }, 'Delivery');
              }}
            />
            {/* grid 2 kolom (bukan pola 3-kolom file ini) -- khusus di sini,
                karena "Requested Delivery Date"/"Estimated Shipping Cost"
                (23 char) overflow label `FieldWrap` (dealOverviewFieldInputs.jsx,
                nowrap tanpa ellipsis) di kolom 113px standar 3-kolom, teramati
                tabrakan visual saat uji layar -- bukan bug `FieldWrap` yang
                diperbaiki di sini (shared, dipakai semua section file ini),
                cukup diberi kolom lebih lebar (~177px) di section ini saja. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 16 }}>
              <SelectField
                label="Order Category"
                editing={editingSection === 'Delivery'}
                value={inquiry.order_category}
                draft={sectionDraft.order_category}
                onDraft={(v) => setSectionDraft((d) => ({ ...d, order_category: v }))}
                options={ORDER_CATEGORY_OPTIONS}
                includeEmpty
              />
              <TextField label="Requested Delivery Date" type="date" editing={editingSection === 'Delivery'}
                value={inquiry.requested_delivery_date}
                draft={sectionDraft.requested_delivery_date}
                onDraft={(v) => setSectionDraft((d) => ({ ...d, requested_delivery_date: v }))} />
              <TextField label="Estimated Shipping Cost" mono editing={editingSection === 'Delivery'}
                value={inquiry.estimated_shipping_cost != null ? formatIdNumber(inquiry.estimated_shipping_cost) : ''}
                draft={sectionDraft.estimated_shipping_cost}
                onDraft={(v) => setSectionDraft((d) => ({ ...d, estimated_shipping_cost: v }))} />
              <TextField label="Customer Reference" editing={editingSection === 'Delivery'}
                value={inquiry.customer_reference}
                draft={sectionDraft.customer_reference}
                onDraft={(v) => setSectionDraft((d) => ({ ...d, customer_reference: v }))} />
            </div>
          </>
        )}
              </Card>
              </div>
            ),
          },
          {
            id: 'quotation',
            // Koreksi visual Putaran 10 (Tahap 1/2) -- mockup `const DT`
            // (Inquiry Management.dc.html:870) menulis "Quotations" (jamak),
            // bukan "Quotation". `id` tetap 'quotation' (tidak disentuh --
            // tak ada pemakai lain yang bergantung padanya di file ini).
            label: 'Quotations',
            render: () => {
              // D-72/D-73 (Putaran 10, rekonstruksi audit mockup
              // Detail/QuotationActions rule 109): mockup SELALU merender
              // KEDUA tombol ("Create Quotation" + "Create Revision"), masing-
              // masing `disabled` sendiri, dengan ikon gembok DI DALAM tombol
              // saat terkunci -- BUKAN ternary tukar-tampil satu tombol
              // seperti sebelumnya. Chip terkunci tetap tampil BERDAMPINGAN
              // dengan kedua tombol (TIDAK menggantikannya).
              //
              // "locked" menggabungkan DUA kondisi yang (sesuai komentar lama
              // yang dipertahankan di bawah) tidak pernah tumpang tindih: Won
              // (TD-318 Irisan 3) dan ditutup sebagai duplikat (Irisan 4
              // Lingkup B, teks dari mockup Quotation Management.dc.html --
              // mockup Inquiry Management ini sendiri tidak punya kasus ini).
              const locked = dealStatus === 'WON' || !!inquiry?.duplicate_of_id;
              const lockedLabel = inquiry?.duplicate_of_id
                ? `Locked, inquiry closed as duplicate of ${duplicateOfNo || '—'}`
                : 'Won, quotation locked';
              return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* `onSearch` sengaja TIDAK dioper: daftar quotation satu deal
                    isinya sedikit, dan sejak guard baru di ListView, kotak
                    pencarian memang tak dirender kalau tak disediakan.

                    [Bugfix, hari setelahnya] Nomor inquiry yang dipertahankan
                    dibaca dari state `duplicateOfNo` (query terpisah, lihat
                    komentar di titik fetch) — BUKAN embed `inquiry?.
                    duplicate_of?.inquiry_no` seperti sebelumnya (embed itu
                    sendiri yang membuat select utama gagal untuk SEMUA
                    inquiry). Fallback '—' berlaku untuk DUA kasus berbeda
                    yang sengaja TIDAK dibedakan di UI: (a) baris itu memang
                    tak ditemukan (dihapus/id salah), dan (b) RLS inquiries_
                    read menolak sales biasa membaca inquiry yang bukan
                    miliknya — kasus (b) akan sering terjadi karena inquiry
                    yang DIPERTAHANKAN bisa dimiliki sales lain. Membedakan
                    keduanya di UI memerlukan RPC pembaca sendiri (pola
                    SECURITY DEFINER ala find_possible_duplicate_inquiries) —
                    ditunda ke Irisan 8 bersama UI Close as Duplicate lainnya. */}
                <ListView
                  mode="table"
                  rows={quotations}
                  onRowClick={onViewQuotation}
                  emptyTitle="No quotations yet"
                  emptySub="Quotations created from this inquiry will appear here."
                  tokens={{ navy: C.navy, ink: C.text, inkSoft: C.textMute, faint: C.textFaint, line: C.border, lineSoft: C.lineSoft, surface: C.surface, surface2: C.surfaceAlt }}
                  right={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* [Putaran 16a Tahap 1, GAGAL ditutup] diukur PERSIS mockup
                          data-screen-label="Detail/QuotationActions": GHOST
                          (background:transparent;border:1px solid #838E7A;
                          color:#33422B), BUKAN solid accent+putih -- "Create
                          Quotation"/"Create Revision" mockup tidak ditonjolkan
                          sbg CTA utama. */}
                      <button onClick={() => onCreateQuotation(inquiryId)} disabled={!!activeQuotation || locked}
                        style={{ ...ACT_BTN, background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text,
                          cursor: (!!activeQuotation || locked) ? 'not-allowed' : 'pointer', opacity: (!!activeQuotation || locked) ? 0.5 : 1 }}>
                        {locked && <Lock size={14} />}<FileText size={14} />Create Quotation
                      </button>
                      <button onClick={() => setReviseOpen(true)} disabled={!activeQuotation || locked || revising}
                        style={{ ...ACT_BTN, background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text,
                          cursor: (!activeQuotation || locked || revising) ? 'not-allowed' : 'pointer', opacity: (!activeQuotation || locked || revising) ? 0.5 : 1 }}>
                        {locked && <Lock size={14} />}<FileText size={14} />{revising ? 'Working…' : 'Create Revision'}
                      </button>
                      {locked && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.textMute, whiteSpace: 'nowrap' }}>
                          <Lock size={14} />{lockedLabel}
                        </span>
                      )}
                    </div>
                  }
                  columns={QUOTATION_COLUMNS}
                />
                {/* D-72..D-74 keputusan Mas: QuotationItemsCard + PriceSummaryCard
                    DIPERTAHANKAN walau tidak ada di mockup Detail/Quotations --
                    fitur lama yang sudah bekerja (AGENTS.md §12), masuk daftar
                    pembaruan Claude Design, bukan dihapus diam-diam di sini. */}
                {activeQuotation && (
                  <QuotationItemsCard quotation={activeQuotation} items={activeQuotationItems} loading={activeItemsLoading} />
                )}
                <PriceSummaryCard quotations={quotations} termMap={termMap} />
              </div>
              );
            },
          },
          {
            id: 'prf',
            // Koreksi visual Putaran 10 (Tahap 1/2) -- mockup `const DT`
            // (Inquiry Management.dc.html:870) menulis "Procurement", bukan
            // "PRF". `id` tetap 'prf' (tidak disentuh). Lencana angka
            // (prfNeedsSelectionCount) DICABUT per keputusan Mas (lanjutan
            // Tahap 2) -- mockup `dtabs` (baris 1032, dibangun dari
            // `DT.map`) TIDAK membawa field count/badge sama sekali untuk
            // tab mana pun.
            label: 'Procurement',
            render: () => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* D-79 (Putaran 10, rekonstruksi audit mockup
                    Detail/Procurement rReqs): "Rate Requests" -- tabel
                    ListView -> kartu per-PRF + stepper 3 tahap (Submitted/
                    Acknowledged/Quoted). "Find Rates"/Buy Rate Library/
                    "Request Rates" SENGAJA TIDAK dibangun di sini (keputusan
                    Mas: pindah ke Procurement 2.2.3). Readiness badge
                    (PRF_READINESS, fitur lama yang sudah bekerja, nol
                    kontradiksi dengan mockup) DIPERTAHANKAN, dipindah ke
                    dalam kartu -- bukan dihapus.

                    Koreksi visual Putaran 10 (Tahap 2): dicabut dari `<Card>`
                    bertepi -- mockup (Inquiry Management.dc.html:411/:418)
                    merender "Rate Requests"/"Vendor Offers" sebagai judul
                    `<h3>` POLOS (section tab itu sendiri sudah berada di
                    dalam kartu Detail/Quotations-setara, tanpa card kedua di
                    dalamnya) -- hanya KARTU PER-PRF/PER-OFFER di dalamnya
                    yang bertepi, sama seperti tab Quotation (ListView tanpa
                    Card pembungkus). "Create PRF" (keputusan Mas,
                    dipertahankan) dipindah jadi tombol di baris h3, pola
                    sama "Find Rates" + "Request Rates" di mockup
                    (baris ~1662, h3 ber-flex:1 + tombol sebaris). */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>Rate Requests</h3>
                  {canCreatePRF && (
                    // [Putaran 16a Tahap 1, GAGAL ditutup] pola "Request Rates"
                    // mockup (lihat komentar di atas) = GHOST, bukan solid.
                    <button onClick={onCreatePRF} style={{ ...ACT_BTN, background: 'transparent', border: `1px solid ${C.borderStrong}`, color: C.text }}>
                      <FileText size={14} />Create PRF
                    </button>
                  )}
                </div>
                {prfs.length === 0 ? (
                  // Teks persis mockup (Inquiry Management.dc.html:416, `noReqs`).
                  <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>No rate requests for this inquiry.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {prfs.map((p) => {
                      const late = isPrfLate(p);
                      const active = isPrfRequestActive(p);
                      const canAct = canActOnPrf(p);
                      return (
                        <div key={p.id} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => onViewPRF?.(p)}
                              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: FONT_MONO, fontWeight: 700, color: C.navy, fontSize: 13 }}>
                              {p.prf_no}
                            </button>
                            {/* Keputusan Den: badge readiness HANYA untuk
                                CANCELLED/EXPIRED -- status lain sudah
                                tersampaikan lewat stepper 5 tahap di bawah. */}
                            {isPrfNotActive(p) && (
                              <TintBadge meta={PRF_NOT_ACTIVE_BADGE} />
                            )}
                            {p.deadline_quotation && (
                              <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>Needed by {fmtDate(p.deadline_quotation)}</span>
                            )}
                            <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>{inquiryAgeLabel(p.created_at)}</span>
                            {late && (
                              <TintBadge meta={{ label: 'Over target', bg: C.amberBg, color: C.amber, bd: C.amberBd }} />
                            )}
                            <span style={{ flex: 1 }} />
                            {/* D-83/D-84 -- gerbang tombol = gerbang RPC
                                (canActOnPrf/isPrfRequestActive), supaya
                                tombol yang terlihat = aksi yang diterima. */}
                            {active && canAct && (
                              <>
                                <button type="button" onClick={() => doRemindProcurement(p)} disabled={prfActionBusy}
                                  style={{ ...ACT_BTN, background: 'transparent', border: '1px solid transparent', color: C.textMute, cursor: prfActionBusy ? 'not-allowed' : 'pointer' }}>
                                  Remind Procurement
                                </button>
                                <button type="button" onClick={() => setPrfCancelConfirm({ open: true, prf: p })} disabled={prfActionBusy}
                                  style={{ ...ACT_BTN, background: 'transparent', border: '1px solid transparent', color: C.textMute, cursor: prfActionBusy ? 'not-allowed' : 'pointer' }}>
                                  Cancel Request
                                </button>
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
                            {PRF_STAGES.map((stage) => {
                              const { at, by } = prfStageInfo(p, stage.key, quotations);
                              const who = by ? profMap[by] : null;
                              // Format persis mockup (Inquiry Management.dc.html:1144):
                              // "[nama], [tanggal]" bila tercapai -- nama tak ketemu
                              // (profMap miss) jatuh ke tanggal saja, bukan ditebak.
                              const metaText = at ? (who ? `${who}, ${fmtDate(at)}` : fmtDate(at)) : 'Pending';
                              return (
                                <div key={stage.key} style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px', borderRadius: 10,
                                  // [Putaran 16a Tahap 0, GAGAL ditutup] diukur mockup
                                  // (`steps: ... bg: i<=at ? '#E4F0E5' : '#F6F8F3', fg:
                                  // i<=at ? '#2D794D' : '#838E7A'`) -- tahap tercapai
                                  // = hijau SEMANTIC.ok, BUKAN navySoft/navy; tahap
                                  // pending = C.bg/textFaint, BUKAN surfaceAlt/textMute.
                                  background: at ? C.greenBg : C.bg }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: HEAD, fontSize: 12, fontWeight: 600, color: at ? C.green : C.textFaint }}>
                                    {at && <Check size={14} />}{stage.label}
                                  </span>
                                  <span style={{ fontFamily: BODY, fontSize: 11.5, color: C.textMute }}>{metaText}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Divider antar-section, pola persis mockup
                    (Inquiry Management.dc.html, `height:1px;background:
                    #ECF0E9` antara "Rate Requests" dan "Vendor Offers"). */}
                <div style={{ height: 1, background: C.lineSoft }} />

                {/* D-80 (Putaran 10) -- "Vendor Offers": satu Card FLAT
                    lintas seluruh PRF inquiry ini (mockup Detail/Procurement
                    offers[]), bukan dikelompokkan per kartu PRF seperti
                    sebelumnya. Total per-currency DIPERTAHANKAN (keputusan
                    Mas: fitur lama yang sudah bekerja -- mockup sendiri
                    mengasumsikan satu angka "price" tapi satu offer bisa
                    multi-currency di Nexus). "Transit" (mockup) TIDAK
                    DIBANGUN -- nol kolom lead-time di prf_vendor_offers
                    maupun vendors. Link profil vendor (mockup openV) TIDAK
                    DIBANGUN -- nol halaman Detail Vendor untuk dituju (hanya
                    ada daftar, proc-vendor-list, tanpa rute ber-:id).

                    Koreksi visual Putaran 10 (Tahap 2): dicabut dari `<Card>`
                    bertepi, pola sama "Rate Requests" di atas -- mockup
                    (Inquiry Management.dc.html:418) juga h3 polos. */}
                <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: C.text }}>Vendor Offers</h3>
                {allVendorOffers.length === 0 ? (
                  // Teks sudah persis mockup (:420, `noOffers`) -- tidak diubah.
                  <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>No vendor offers yet.</span>
                ) : (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {allVendorOffers.map((o) => {
                      const p = o.prf;
                      const isSelected = p.selected_offer_id === o.id;
                      const canSelect = canActOnPrf(p);
                      return (
                        // [Putaran 16a Tahap 0, GAGAL ditutup] diukur persis mockup
                        // (offers.map 'o.bd'): border SELALU 1px, warna
                        // terpilih = INK_SOFT (bukan ACCENT/orange 2px).
                        <div key={o.id} style={{ width: 260, boxSizing: 'border-box', background: C.surface, border: `1px solid ${isSelected ? C.textMute : C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ flex: 1, fontFamily: HEAD, fontSize: 13, fontWeight: 700, color: C.text }}>{o.vendorName}</span>
                            {isSelected && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6, fontFamily: HEAD, fontSize: 11, fontWeight: 700, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.textMute, whiteSpace: 'nowrap' }}>
                                Selected
                              </span>
                            )}
                          </div>
                          <span style={{ fontFamily: BODY, fontSize: 11.5, color: C.textFaint }}>PRF {p.prf_no}</span>
                          {Object.entries(o.totals || {}).length === 0 ? (
                            <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>No cost breakdown yet.</span>
                          ) : Object.entries(o.totals).map(([cur, v]) => (
                            <div key={cur} style={{ fontFamily: HEAD, fontSize: 14, fontWeight: 800, color: C.navy, fontVariantNumeric: 'tabular-nums' }}>
                              {cur} {Number(v).toLocaleString('id-ID')}
                            </div>
                          ))}
                          {o.validUntil && (
                            <span style={{ fontFamily: BODY, fontSize: 12, color: C.textMute }}>Valid until {fmtDate(o.validUntil)}</span>
                          )}
                          {o.notes && (
                            <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>{o.notes}</span>
                          )}
                          {p.min_offers_waiver_reason && (
                            <span style={{ fontFamily: BODY, fontSize: 11.5, color: C.amber }}>
                              Only {(p.vendorOffers || []).length} offers. Procurement reason: {p.min_offers_waiver_reason}
                            </span>
                          )}
                          {!isSelected && canSelect && (
                            // [Putaran 16a Tahap 0, GAGAL ditutup] mockup
                            // "Use This Offer" solid ACCENT+INK (bukan outline).
                            <button
                              type="button"
                              onClick={() => handleSelectOffer(p, o)}
                              disabled={offerActionBusy}
                              style={{ width: '100%', background: C.orange, color: C.text, border: `1px solid ${C.orange}`, borderRadius: 6, padding: '7px 0', fontFamily: HEAD, fontSize: 12.5, fontWeight: 600, cursor: offerActionBusy ? 'not-allowed' : 'pointer', opacity: offerActionBusy ? 0.6 : 1 }}>
                              {p.selected_offer_id ? 'Switch to This Offer' : 'Use This Offer'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'aktivitas',
            label: 'Activity',
            render: () => (
              <Card title="Related Activity" icon={<ListChecks size={17} />}>
                {activities.length === 0 ? (
                  <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>No activity recorded for this inquiry yet.</div>
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
            id: 'statusHistory',
            label: 'Status History',
            render: () => (
              <Card title="Status History" icon={<ListChecks size={17} />}>
                {statusHistorySegments.length === 0 && combinedHistoryEvents.length === 0 ? (
                  <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>No recorded status transitions yet.</div>
                ) : (
                  <>
                    {statusHistorySegments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.text }}>Time in each status</div>
                        <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
                          {statusHistorySegments.map((s, i) => (
                            <span key={`${s.status}-${i}`} title={`${STATUS_LABEL[s.status] || s.status} ${daysLabel(s.days)}`}
                              style={{ flex: Math.max(s.days, 0.3), background: DEAL_STATUS[s.status]?.bg || C.surfaceAlt }} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          {statusHistorySegments.map((s, i) => (
                            <span key={`${s.status}-legend-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: BODY, fontSize: 13, color: C.text }}>
                              <span style={{ width: 12, height: 12, borderRadius: 3, background: DEAL_STATUS[s.status]?.bg || C.surfaceAlt, border: `1px solid ${DEAL_STATUS[s.status]?.bd || C.border}` }} />
                              {STATUS_LABEL[s.status] || s.status} {daysLabel(s.days)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* TD-318 Irisan 2 Inquiry, bug fix round, Task 4: warna
                        divider disamakan ke mockup -- `height:1px;background:
                        #ECF0E9`. [Putaran 16a Tahap 0] C.lineSoft = LINE_SOFT
                        EXACT (dulu C.surfaceAlt/HEAD_BG, cuma pendekatan
                        terdekat sebelum key lineSoft ada di DEAL_C). */}
                    {statusHistorySegments.length > 0 && combinedHistoryEvents.length > 0 && (
                      <div style={{ height: 1, background: C.lineSoft, marginBottom: 4 }} />
                    )}
                    {/* Putaran 11 Tahap B -- baris status DAN owner digabung
                        SATU timeline, diurut tanggal terbaru-dulu
                        (combinedHistoryEvents) -- mockup Inquiry Management
                        .dc.html:855-864. Ikon pembeda: CalendarClock utk
                        status (tidak berubah), UserCheck utk owner (baru). */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {combinedHistoryEvents.map((e) => e.kind === 'owner' ? (
                        <div key={e.key} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.surfaceAlt}` }}>
                          <span style={{ width: 32, height: 32, borderRadius: 16, background: C.surface, border: `1px solid ${C.border}`, color: C.textMute, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                            <UserCheck size={16} />
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                            <span style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>
                              {e.fromName ? `Owner changed from ${e.fromName} to ${e.toName || 'Unassigned'}` : `Owner assigned to ${e.toName || 'Unassigned'}`}
                            </span>
                            <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
                              {fmtDate(e.changedAt)}, {e.byName}
                            </span>
                            {e.reason && (
                              <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.text }}>Reason: {e.reason}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div key={e.key} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.surfaceAlt}` }}>
                          <span style={{ width: 32, height: 32, borderRadius: 16, background: C.surface, border: `1px solid ${C.border}`, color: C.textMute, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                            <CalendarClock size={16} />
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <TintBadge meta={{ label: STATUS_LABEL[e.from] || e.from, bg: DEAL_STATUS[e.from]?.bg, color: DEAL_STATUS[e.from]?.fg, bd: DEAL_STATUS[e.from]?.bd }} />
                              <span style={{ color: C.textMute }}>to</span>
                              <TintBadge meta={{ label: STATUS_LABEL[e.to] || e.to, bg: DEAL_STATUS[e.to]?.bg, color: DEAL_STATUS[e.to]?.fg, bd: DEAL_STATUS[e.to]?.bd }} />
                            </div>
                            <span style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
                              {fmtDate(e.changedAt)}, {e.byName}, after {daysLabel(e.fromDays)} in {STATUS_LABEL[e.from] || e.from}
                            </span>
                            {/* TD-318 Irisan 3, commit 7 -- `reason` BARU
                                di-select+dirender di sini sama sekali (Irisan
                                2 menghitung statusHistoryEvents tapi TIDAK
                                membawa kolom ini). Won (manual 4 alasan atau
                                "Accepted quotation") dan Revert dibaca apa
                                adanya dari kolom yang sudah diisi trigger
                                (migrasi 20261021000001 TASK 8); LOST/CANCELLED
                                ikut tampil sebagai efek samping -- trigger
                                lama sudah mengisinya sejak Irisan 2, hanya
                                baru sekarang dibaca+ditampilkan. Format TANPA
                                prefiks "Reason:" -- pre-existing, TIDAK diubah
                                Putaran 11 (di luar scope; mockup sebenarnya
                                berpola "Reason: {text}" sama seperti baris
                                owner barusan, dilaporkan sebagai selisih,
                                bukan diperbaiki di sini). */}
                            {e.reason && (
                              <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.text }}>{e.reason}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            ),
          },
        ]}
      />
      {/* TD-318 Irisan 2 Inquiry, bug fix round, Task 4: RelatedDocuments
          DIPINDAH ke sini dari dalam tab Overview -- terbukti dari mockup
          (byte offset diverifikasi langsung di file sumber) RelatedDocuments
          adalah SECTION TERPISAH, sibling dari section Header DAN section
          tab, dirender SESUDAH seluruh blok tab (Overview/Quotations/
          Procurement/Activity/Status History) SELESAI, bukan isi salah
          satu tab -- selalu tampil lintas tab, bukan hilang saat pindah tab. */}
      <RelatedDocuments
        upstream={relatedDocsUpstream}
        downstream={relatedDocsDownstream}
        // [Putaran 16a Tahap 0, GAGAL ditutup] diukur mockup (pembatas
        // antar-baris grup Upstream/Downstream): border-bottom LINE_SOFT
        // #ECF0E9 -- bukan HEAD_BG #EFF3ED (C.surfaceAlt).
        tokens={{
          border: C.border, borderSoft: C.lineSoft, text: C.text, textMute: C.textMute, textFaint: C.textFaint,
          fontHead: HEAD, fontBody: BODY, fontMono: FONT_MONO,
        }}
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

      {/* D-84 (Putaran 10) -- Cancel Request PRF. Mengubah prf.status saja,
          TIDAK menyentuh inquiries.status. */}
      <ConfirmModal
        open={prfCancelConfirm.open}
        variant="warning"
        title="Cancel Request"
        message={`Cancel the rate request ${prfCancelConfirm.prf?.prf_no || ''}? Procurement will no longer work on it.`}
        confirmLabel="Yes, Cancel"
        cancelLabel="Keep Request"
        onConfirm={() => doCancelPrfRequest(prfCancelConfirm.prf)}
        onCancel={() => setPrfCancelConfirm({ open: false, prf: null })}
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
        activeQuotation={activeQuotationForClose}
        openPrfs={openPrfsForClose}
      />

      {/* Batalkan deal — alasan teks bebas (B3). */}
      <CancelReasonModal
        key={`cancel-${inquiry.id}-${cancelOpen}`}
        open={cancelOpen}
        inquiryNo={inquiry.inquiry_no}
        saving={cancelSaving}
        onSave={markInquiryCancel}
        onCancel={() => setCancelOpen(false)}
        activeQuotation={activeQuotationForClose}
        openPrfs={openPrfsForClose}
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

      {/* TD-318 Irisan 3, commit 4 -- Won manual: alasan (4 pilihan), bukti
          wajib, notes opsional. Modal TIDAK ditutup di sini saat submit --
          markInquiryWon sendiri yang menutupnya HANYA saat sukses (upload
          gagal atau RPC gagal -> modal tetap terbuka, lihat komentar
          markInquiryWon). `key` berubah tiap kali dibuka supaya form bersih
          -- pola sama LostReasonModal/CancelReasonModal. */}
      <MarkWonModal
        key={wonOpen ? `won-${inquiry?.id}` : 'won-closed'}
        open={wonOpen}
        inquiryNo={inquiry?.inquiry_no}
        saving={wonSaving}
        uploadError={wonUploadError}
        onSave={markInquiryWon}
        onCancel={() => { setWonOpen(false); setWonUploadError(''); }}
        sentQuotation={sentQuotationForWon}
        onOpenQuotation={onViewQuotation}
        isFirstWin={isFirstWinForAccount}
        customerName={account?.name}
        hasSupervisor={hasSupervisorForWon}
      />

      {/* TD-318 Irisan 3, commit 5 -- Revert Manual Win. */}
      <RevertWonModal
        key={revertOpen ? `revert-${inquiry?.id}` : 'revert-closed'}
        open={revertOpen}
        inquiryNo={inquiry?.inquiry_no}
        saving={revertSaving}
        onSave={revertManualWin}
        onCancel={() => setRevertOpen(false)}
      />

      {/* Putaran 15, Task 4 -- Change Account. `key` berubah tiap dibuka --
          pola sama MarkWonModal/RevertWonModal, form bersih tiap kali. */}
      <ChangeAccountModal
        key={changeAccountOpen ? `change-account-${inquiry?.id}` : 'change-account-closed'}
        open={changeAccountOpen}
        inquiryNo={inquiry?.inquiry_no}
        companyId={inquiry?.company_id}
        currentAccountName={account?.name}
        currentContactName={inquiry?.contact?.name}
        saving={changeAccountSaving}
        onSave={changeInquiryAccount}
        onCancel={() => setChangeAccountOpen(false)}
      />

      {/* Putaran 11 Tahap B -- Reassign Owner. Modal bersama dengan tombol
          per-baris/bulk di InquiryOwnerAssignmentPage.jsx (OwnerAssignModal.jsx);
          `key` berubah tiap dibuka -- pola sama 3 modal lain di atas. Modal
          ini memanggil RPC SENDIRI (lihat header file) -- onSaved hanya
          refetch, modal menutup dirinya sendiri (lihat onOwnerAssigned).
          Prompt 42 TASK 1: mode BUKAN hardcode "reassign" -- canReassignOwner
          (di atas) TIDAK mensyaratkan owner_id ada, jadi kebab "Reassign
          Owner" tetap bisa tampil untuk inquiry TANPA owner (status masih
          LOSABLE_INQUIRY_STATUS); mode modal mengikuti DATA SEBENARNYA,
          bukan asumsi label tombol kebab. */}
      <OwnerAssignModal
        key={ownerAssignOpen ? `owner-assign-${inquiry?.id}` : 'owner-assign-closed'}
        open={ownerAssignOpen}
        onClose={() => setOwnerAssignOpen(false)}
        targets={inquiry ? [{
          id: inquiry.id,
          inquiry_no: inquiry.inquiry_no,
          customer_name: account?.name,
          estimated_value: inquiry.estimated_value,
          owner_id: inquiry.owner_id,
          owner_name: ownerName,
        }] : []}
        mode={inquiry?.owner_id ? 'reassign' : 'assign'}
        companyId={inquiry?.company_id}
        onSaved={onOwnerAssigned}
        showToast={showToast}
      />
    </div>
  );
}
