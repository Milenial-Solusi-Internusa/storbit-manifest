// src/modules/crm/InquiryIntakeWizardPage.jsx
// Inquiry Management Putaran 4 — Tahap 4B. Wizard "Intake Form" untuk membuat
// inquiry BARU, Single Shipment saja (Rate Sheet Request = Tahap 4C, belum
// dibangun). CREATE-ONLY — editing berjalan inline per-section di
// DealDetailPage.jsx (InquiryFormPage.jsx, dulu satu-satunya halaman EDIT,
// dipensiunkan Putaran 15 Task 1).
//
// Kontrak: design-handoff/mockup/Inquiry Management.dc.html (kutipan baris
// di komentar tiap bagian) + nexus-notes.js + crm-metrics.js. Urutan langkah
// (SK) dan nama field mengikuti mockup; token visual kini SAGE (Putaran
// 16a, keputusan J-043 butir 7 -- menggantikan larangan impor kit #61
// khusus utk layar Inquiry), lewat ./inquiryTheme.js (adaptor, bukan impor
// langsung src/kit/tokens.js -- lihat inquiryTheme.js utk tabel pemetaan
// key lama navy/orange/cream -> konstanta kit). Montserrat/Inter/IBM Plex
// Mono TIDAK berubah (sudah sesuai kebijakan font tiga resmi sejak awal).
//
// Penulisan HANYA lewat RPC create_inquiry_with_lanes (migrasi
// 20261025000001-5, Tahap 4A, LIVE staging) — nol INSERT langsung ke
// inquiries/inquiry_lanes dari sini.
//
// Props: prefillAccountId, prefillContactId, onBack (Cancel → daftar),
// onCreated(id) (sukses → Detail Inquiry), showToast.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronLeft, ChevronRight, X, Check, Lock,
  AlertTriangle, Ship, Shield, Home, Truck, Plus, Loader2, Package,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { useDropdownOptions } from '../../hooks/useDropdownOptions';
import { isSuperAdmin, isManagerOrAbove } from '../../lib/roles';
import { readMoneyInput, formatIdNumber } from '../../lib/numberFormat';
import AccountPicker from '../../components/AccountPicker';
import LocationPicker from '../../kit/LocationPicker';
import { LaneTable } from '../../kit/LaneTable';
import { deriveLaneMode, unitForMode } from '../../kit/laneUtils';
import { fetchOperationalRoster } from './salesRoster';
import { CARGO_TYPES, SERVICES, INCOTERMS, CONTAINER_TYPES, IMO_CLASSES, MSDS_OPTS } from './inquiryOptions';
import { MENU_PATHS } from '../../routes/menu-paths';
import { entityCodeOf, entityByCode } from '../../lib/entities';
import { WIZARD_C as C } from './inquiryTheme';
import { DEAL_STATUS } from '../../kit/tokens';

// ── Token sage (Putaran 16a, keputusan J-043 butir 7 -- lihat inquiryTheme.js
// utk tabel pemetaan lengkap key lama navy/orange/cream -> konstanta kit) ──
const LOCATION_PICKER_TOKENS = {
  bg: C.pageBg, card: C.card, border: C.border, text: C.text, textMute: C.sub,
  placeholder: C.muted, hover: C.navySoft, divider: C.border,
  warnBg: C.warningBg, warnBorder: C.warningBorder, warnText: C.warning,
};

// Fallback FE (dropdown_options list_key='service_type' punya 6 baris sejak
// Tahap 4A — fallback ini hanya menyala kalau fetch gagal/kosong). 'trading'
// (General Trading) SENGAJA tetap ada di sini (nilainya valid, InquiryFormPage.jsx
// lama tetap memakainya) tapi DISARING saat render kartu di bawah — GT tidak
// dibangun di wizard ini (lingkup 4C/di luar Putaran 4 sama sekali untuk Items/
// Delivery). "HAL YANG TIDAK BOLEH DISENTUH" #2 — ini KONSTANTA LOKAL baru,
// bukan SERVICE_TYPES_FALLBACK milik InquiryFormPage/InquiryClassificationPage
// yang tidak disentuh sama sekali.
const SERVICE_TYPES_FALLBACK = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'customs', label: 'Customs Clearance' },
  { value: 'door_to_door', label: 'Door to Door' },
  { value: 'trucking', label: 'Trucking' },
  { value: 'trading', label: 'General Trading' },
];
const SERVICE_ICON = {
  freight_forwarding: Ship, customs: Shield, door_to_door: Home, trucking: Truck,
  // Putaran 14 (Scope 1) -- `Package` (kotak/kargo), BUKAN `Ship` yang
  // sudah dipakai Freight Forwarding -- ikon mockup utk General Trading
  // adalah ilustrasi kapal+kotak kargo gabungan, tanpa satu ikon Lucide
  // yang sama persis; `Package` paling dekat maknanya (barang/kargo
  // distribusi, bukan jasa pelayaran) dan tidak bertabrakan dgn ikon lain
  // yang sudah dipakai di kartu Service Type ini. Bisa diganti Mas.
  trading: Package,
};
// Badge status aside "Your recent inquiries" -- 7 nilai inquiries_status_check
// (schema_snapshot.sql:8412). [Putaran 16a] Diselaraskan ke DEAL_STATUS kit
// (src/kit/tokens.js) -- mockup SB map (Inquiry Management.dc.html, fungsi
// `bd(k)`) TERNYATA memakai trio fg/bg/bd yang IDENTIK DEAL_STATUS utk
// seluruh 7 status, termasuk badge aside ini (bukan palet lokal berbeda
// spt tertulis sebelumnya) -- diverifikasi langsung ke sumber mockup
// sebelum ditulis, bukan diasumsikan.
const STATUS_LABEL = { OPEN: 'Open', IN_REVIEW: 'In Review', QUOTED: 'Quoted', NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled' };
const STATUS_BADGE = Object.fromEntries(
  Object.entries(DEAL_STATUS).map(([k, v]) => [k, { bg: v.bg, border: v.bd, fg: v.fg }])
);
const LANE_MODE_FALLBACK = [{ value: 'Sea LCL', label: 'Sea LCL' }, { value: 'Sea FCL', label: 'Sea FCL' }, { value: 'Air', label: 'Air' }];
const LANE_UNIT_FALLBACK = [{ value: 'CBM', label: 'CBM' }, { value: 'Container', label: 'Container' }, { value: 'KG', label: 'KG' }, { value: 'Ton', label: 'Ton' }];
const IMPORTER_OF_RECORD_FALLBACK = [
  { value: 'PT Mitra Niaga Sejahtera', label: 'PT Mitra Niaga Sejahtera' },
  { value: 'PT Sentra Impor Nusantara', label: 'PT Sentra Impor Nusantara' },
];
// Duties & Taxes / Pricing Basis / Customer Role / Direction — opsi TETAP di
// DB (CHECK constraint, migrasi 20261025000002), bukan dropdown_options.
// Hardcode lokal di sini sama seperti INCOTERMS/CONTAINER_TYPES/MSDS_OPTS
// (inquiryOptions.js) — bukan field yang dipakai InquiryFormPage/DealDetailPage
// hari ini, jadi tidak ditambahkan ke file bersama itu (scope creep).
const DUTIES_AND_TAXES_OPTS = ['Included in price', 'Billed separately as per receipt'];
const PRICING_BASIS_OPTS = ['Itemized charges', 'All in per CBM', 'All in per KG'];
const CUSTOMER_ROLE_OPTS = ['Shipper', 'Consignee', 'Third Party'];
const DIRECTION_OPTS = ['Import', 'Export', 'Domestic'];
// Putaran 14 (W-60, Scope 3) -- Order Category, mockup baris 93: <select>
// 3 opsi tetap + placeholder kosong, markup polos TANPA sc-for/dropdown
// dinamis -- CHECK literal di DB (migrasi 20261030000001), pola sama 4
// konstanta di atas, bukan dropdown_options.
const ORDER_CATEGORY_OPTS = ['Regular', 'Baking Tray', 'Trolley'];

// Putaran 13a — JCI (mockup svcJciBlocked/fEnt baris 57/62/1136): "Customs
// Clearance" standalone (BUKAN Door-to-Door) adalah lini JCI. `JCI_ID` dipakai
// gerbang akses lintas-entitas (D2) — bukan dipakai utk menimpa Entity field
// (lihat komentar di dekat `entityCode` di bawah -- deviasi disengaja,
// dilaporkan di chat, bukan ditebak).
const JCI_ID = entityByCode('JCI')?.id;
// Putaran 14 (W-10, Scope 1) -- rule desain #7 (nexus-notes.js): "General
// Trading belongs to SOA." Dipakai menggerbang kartu Service Type (akun
// terpilih harus ber-entitas SOA) -- pola PERSIS JCI_ID di atas.
const SOA_ID = entityByCode('SOA')?.id;

const PRA_CUSTOMER_STATUS = ['lead', 'mql', 'sql', 'prospect', 'lead_pool'];
const CUSTOMER_SIDE_STATUS = ['customer', 'free_agent'];
const LIFECYCLE_LABEL = { lead: 'Lead', mql: 'MQL', sql: 'SQL', prospect: 'Prospect', lead_pool: 'Lead Pool', customer: 'Customer', free_agent: 'Free Agent' };
const lifecycleLabel = (s) => LIFECYCLE_LABEL[s] || s || '';

// ── Urutan langkah (mockup baris 763-764, SK) ──────────────────────────────
const STEPS_DOOR_TO_DOOR = ['cust', 'svc', 'route', 'cargo', 'customs', 'commercial', 'review'];
const STEPS_DEFAULT = ['cust', 'svc', 'route', 'cargo', 'addl', 'commercial', 'review'];
// Putaran 14 (W-10, Scope 1c) -- mockup SK utk 'trading':
// ['cust','svc','items','delivery','commercial','review'] -- langkah
// "Items" SENGAJA TIDAK dibangun (ditunda ke batch Sales Order, instruksi
// eksplisit), jadi urutan Putaran 14 jadi 5 langkah (bukan 6): route/
// cargo/addl dilewati TOTAL, sama seperti mockup.
const STEPS_GENERAL_TRADING = ['cust', 'svc', 'delivery', 'commercial', 'review'];
const STEP_LABEL = {
  cust: 'Customer & Contact', svc: 'Service & Direction', route: 'Route & Terms', cargo: 'Cargo',
  addl: 'Additional Services', customs: 'Customs & Undername', commercial: 'Commercial', review: 'Review',
  // Putaran 14 (W-60) -- mockup SNAME.delivery (baris 763), khusus General
  // Trading.
  delivery: 'Delivery',
};

const S = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '4px 0 8px', fontFamily: "'Inter',system-ui,sans-serif", color: C.text },
  headerCard: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', padding: '22px 26px', marginBottom: 18 },
  hTitle: { fontFamily: "'Montserrat',sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: -0.6, color: C.text, margin: 0, lineHeight: 1.1 },
  pillBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, overflowX: 'auto' },
  card: { background: C.card, border: '1px solid ' + C.border, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 18, overflow: 'hidden' },
  secBody: { padding: 28 },
  // Judul step di body card (mockup baris 49, h3 "{{stepN}}. {{SNAME[sKey]}}"
  // -- di atas isi tiap langkah, berdampingan dgn label yg sudah tampil di pill).
  stepHeading: { margin: '0 0 4px', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, color: C.text },
  // [Putaran 16 Tahap 4] diukur mockup langsung (field "Direction" step 2):
  // Inter 600 12px, warna sub, TANPA uppercase/letter-spacing -- label field
  // wizard BUKAN label uppercase ala tabel (beda dari headCell layar daftar).
  label: { fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.35 },
  req: { color: C.warning, fontWeight: 800 },
  input: { height: 44, borderRadius: 10, border: '1px solid ' + C.border, background: C.card, padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box' },
  textarea: { borderRadius: 10, border: '1px solid ' + C.border, background: C.card, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.55 },
  // "Next"/"Create Inquiry" mockup (baris ~111214): bg+border #C3D9B8 (ACCENT),
  // teks #33422B (INK -- BUKAN putih, lihat kit/tokens.js:19-22).
  // [Putaran 16 Tahap 5] diukur ULANG mockup Next/Back/Create Inquiry (ketiganya
  // identik): height 40 (bukan 44), padding '0 16px' (bukan 26/20px), fontSize
  // 13.5 (bukan 14), fontWeight 600 (bukan 700), NOL box-shadow.
  btnPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid ' + C.orange, background: C.orange, color: C.text, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
  // "Back"/"Cancel" footer mockup: border #838E7A (INK_FAINT), teks #33422B (INK),
  // bg TRANSPARAN (bukan C.card solid). height/padding/fontSize beda per lokasi
  // pakai (tombol footer 40/'0 16px'/13.5, tombol inline lebih kecil spt "Add
  // route option" 32/'0 12px'/13) -- base di sini dipakai tombol footer, dua
  // titik lain sudah override sendiri di call-site-nya.
  btnGhost: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid ' + C.muted, background: 'transparent', color: C.text, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
};
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '18px 20px' };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px 16px' };
const selInput = { ...S.input, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' };

function Field({ label, required, span, children, hint }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : 'auto' }}>
      <div style={S.label}>{label}{required && <span style={S.req}>*</span>}</div>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: C.muted, marginTop: 5, display: 'block' }}>{hint}</span>}
    </div>
  );
}
function FieldError({ children }) {
  if (!children) return null;
  return <span style={{ fontSize: 12, color: C.error, marginTop: 5, display: 'block' }}>{children}</span>;
}
// Pola "kartu/pil aktif" (og.svc/og.dir/og.cargo/og.addl, mockup): latar
// AKTIF = C.navySoft (ROW_HOVER), border AKTIF = C.navy (INK_SOFT), teks/
// ikon SELALU C.text (INK) -- tidak berubah warna antara aktif/non-aktif,
// mockup menandai "aktif" lewat border+latar+ikon centang, bukan teks
// putih di atas latar solid (lihat kit/tokens.js:19-22, pola lama "solid
// navy/oranye + teks putih" sudah tidak dipakai).
// [Putaran 16a Tahap 2] `variant='chip'` BARU -- diukur mockup (Incoterms/
// Container Type, Inquiry Intake Form: `fch.inco`/`fch.cont`, bg:
// on?'#C3D9B8':'#FFFFFF', bd: on?'#AFC9A0':'#D8E0D2'). Pil BULAT (radius
// 16, tinggi 32) tanpa ikon centang, teks SELALU INK (C.text) di kedua
// state -- beda total dari variant default 'card' (kartu besar radius 10
// tinggi 44, navySoft+navy+Check). Default TETAP 'card' supaya SELURUH
// pemanggil lain (Direction/Customer Role/Pricing Basis) byte-identik.
function Pill({ active, onClick, children, invalid, variant = 'card' }) {
  if (variant === 'chip') {
    return (
      <button type="button" onClick={onClick}
        style={{ height: 32, padding: '0 12px', borderRadius: 16, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 12.5, cursor: 'pointer', border: '1px solid ' + (active ? C.orangeDark : C.border), background: active ? C.orange : C.card, color: C.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, whiteSpace: 'nowrap' }}>
        {children}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick}
      style={{ height: 44, borderRadius: 10, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', border: '1px solid ' + (active ? C.navy : invalid ? C.warning : C.border), background: active ? C.navySoft : C.card, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {active && <Check size={15} />}{children}
    </button>
  );
}
// [Putaran 16 Tahap 5] diputar jadi HORIZONTAL persis mockup (kartu "Door
// to Door" step 2, markup lengkap diukur dari sumber mockup): ikon 36px
// lingkaran PENUH (radius 18, bukan rounded-square 42/11) di kiri, label
// flex:1 di tengah/kanan, centang muncul di ujung kanan saat aktif. min-
// height (bukan height tetap) + padding 12px 16px (bukan 18px 14px) + gap
// 12 (bukan 10). Perilaku klik/state aktif/aria TIDAK diubah -- hanya tata
// letak & ukuran.
function ServiceCard({ icon: Icon, label, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ minHeight: 72, borderRadius: 14, padding: '12px 16px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (active ? C.navy : C.border), background: active ? C.navySoft : C.card, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: C.text }}>
      <span style={{ width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? C.orange : C.headBg, color: C.text, flex: 'none' }}>{Icon && <Icon size={18} />}</span>
      <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, color: C.text, flex: 1, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{label}</span>
      {active && <Check size={16} style={{ flex: 'none' }} />}
    </button>
  );
}
function CargoCard({ item, active, onClick }) {
  const I = item.Icon;
  return (
    <button type="button" onClick={onClick}
      style={{ textAlign: 'left', borderRadius: 12, padding: '16px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (active ? C.navy : C.border), background: active ? C.navySoft : C.card, display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, flex: '0 0 38px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? C.orange : C.headBg, color: C.text }}><I size={19} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: C.text, lineHeight: 1.25 }}>{item.label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>{item.desc}</span>
      </span>
    </button>
  );
}
// [Putaran 16 Tahap 5] REBUILD, bukan sekadar diputar horizontal -- diukur
// mockup (`ech.addl` chip "Additional Services" step, bukan pola kartu
// `og.*` seperti ServiceCard): bukan kartu ikon sama sekali, melainkan pil
// kecil TANPA ikon dalam baris flex-wrap. Sumber warna aktif/nonaktif
// ditelusur dari JS mockup (`ech[g][k] = { bg: on?'#C3D9B8':'#FFFFFF',
// bd: on?'#AFC9A0':'#D8E0D2' }`) -- persis C.orange/orangeDark/card/border.
function TagCard({ item, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        height: 24, padding: '0 9px', borderRadius: 6, cursor: 'pointer',
        border: '1px solid ' + (active ? C.orangeDark : C.border),
        background: active ? C.orange : C.card,
        fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 11.5, color: C.text,
        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
      }}>
      {item.label}
    </button>
  );
}
function RadioPill({ value, current, onClick, children }) {
  const active = value === current;
  return (
    <button type="button" onClick={onClick}
      style={{ height: 40, padding: '0 18px', borderRadius: 999, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5, cursor: 'pointer', border: '1px solid ' + (active ? C.navy : C.border), background: active ? C.navySoft : C.card, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid ' + (active ? C.navy : C.borderStrong), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 14px' }}>
        {active && <span style={{ width: 6, height: 6, borderRadius: 999, background: C.navy }} />}
      </span>{children}
    </button>
  );
}
function Chevron() { return <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span>; }

// Aside "Your recent inquiries" (mockup Intake/Recent, baris 170-173).
function RecentInquiriesAside({ items, onOpen }) {
  return (
    <aside style={{ flex: '1 1 280px', minWidth: 280, background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3 style={{ margin: '0 0 8px', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, color: C.text }}>Your recent inquiries</h3>
      {items.length === 0 && <span style={{ fontSize: 12.5, color: C.muted }}>No inquiries yet.</span>}
      {items.map((r) => {
        const badge = STATUS_BADGE[r.status] || STATUS_BADGE.OPEN;
        return (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderBottom: '1px solid ' + C.lineSoft }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" onClick={() => onOpen(r.id)}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>
                {r.inquiry_no}
              </button>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6, border: '1px solid ' + badge.border, background: badge.bg, color: badge.fg, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 11.5, lineHeight: 'normal', whiteSpace: 'nowrap' }}>
                {STATUS_LABEL[r.status] || r.status}
              </span>
            </div>
            <span style={{ fontSize: 13, color: C.sub }}>{r.prospect?.name || '—'}</span>
          </div>
        );
      })}
    </aside>
  );
}

// Ronde "Lane Editor" (5c, bug nyata dikonfirmasi data staging
// MSI-INQ-X-2026-0024 -- kontainer FCL 20' tapi kedua lane tetap Sea
// LCL/CBM): `blankLane` SEBELUMNYA hardcode mode:'Sea LCL' tanpa syarat --
// `deriveLaneMode()`/`unitForMode()` (sekarang di src/kit/LaneTable.jsx,
// dipakai ulang bersama DealDetailPage.jsx) HANYA diterapkan di jalur
// single-lane `handleCreate`, tidak pernah di `startLanes`/`addLane`.
// `blankLane` sekarang MENERIMA `seed.mode` (bukan selalu hardcode) --
// `startLanes` mengoper `deriveLaneMode(f.container_types)` ke KEDUA baris
// yang diseed; `addLane` TETAP mewarisi dari baris terakhir (tidak
// diubah -- itu perilaku yang sudah benar: user mungkin sengaja mengubah
// mode baris sebelumnya).
// Form kosong -- diekstrak jadi fungsi (bukan literal inline di useState)
// supaya bisa dipanggil ulang dari "Clear" banner prefill (D6, mockup
// clearPrefill baris 941: `set({ f: this.blankF, ... })`).
const blankF = () => ({
  account_id: '', contact_id: '',
  service_type: '', direction: '', customer_role: '',
  undername_import: false, importer_of_record: '', duties_and_taxes: '', supporting_docs_received: false,
  pricing_basis: '',
  pol_location_id: null, pod_location_id: null, pol: '', pod: '', via_location_id: null, via: '',
  laneMode: false, lanes: [],
  inquiry_type: 'Single Shipment', validity_from: '', validity_to: '', monthly_volume_cbm: '',
  incoterms: [], container_types: [], n_containers: '', cargo_ready_date: '',
  pickup_address: '', delivery_address: '',
  goods_name: '', hs_code: '', weight_kg: '', volume_cbm: '', dimension: '',
  cargo_types: [], un_number: '', imo_class: '', has_msds: '',
  additional_services: [],
  // Putaran 14 (W-60, Scope 3) -- grup "Delivery", HANYA utk General
  // Trading (langkah 'delivery', mockup baris 93/94/100/101). Nol field
  // ini wajib di mockup manapun (absen dari objek req baris 759).
  order_category: '', requested_delivery_date: '', estimated_shipping_cost: '', customer_reference: '',
  deadline_quote: '', estimated_value: '', owner_id: null, notes: '',
  duplicate_warning_reason: '',
});

const blankLane = (seed = {}) => {
  const mode = seed.mode ?? 'Sea LCL';
  return {
    pol_location_id: seed.pol_location_id ?? null, pod_location_id: seed.pod_location_id ?? null,
    via_location_id: null, pol: seed.pol ?? '', pod: seed.pod ?? '', via: '',
    mode, load_unit: unitForMode(mode),
  };
};

export default function InquiryIntakeWizardPage({ prefillAccountId = null, prefillContactId = null, onBack, onCreated, showToast }) {
  const { profile, erpRole, erpRoles, user, myCompanyIds } = useAuth();
  const navigate = useNavigate();
  const { options: serviceTypeOptsRaw } = useDropdownOptions('service_type', SERVICE_TYPES_FALLBACK);
  const { options: laneModeOpts } = useDropdownOptions('lane_mode', LANE_MODE_FALLBACK);
  const { options: laneUnitOpts } = useDropdownOptions('lane_unit', LANE_UNIT_FALLBACK);
  const { options: iorOpts } = useDropdownOptions('importer_of_record', IMPORTER_OF_RECORD_FALLBACK);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Putaran 13a (D1) — toggle "Sumber" (Prospect/Customer) DICABUT: mockup
  // cuma punya SATU pencarian "Customer" gabungan, hasilnya ditandai stage
  // badge (AccountPicker.jsx sudah mendukung ini apa adanya, nol komponen
  // baru). `accounts` = union PRA_CUSTOMER_STATUS ∪ CUSTOMER_SIDE_STATUS.
  const [accounts, setAccounts] = useState([]);
  const [accountText, setAccountText] = useState('');
  // Banner prefill generik (D6, mockup `prefilled`/`prefTxt`/`clearPrefill`
  // baris 47/941) — HANYA jalur yg reachable hari ini (`prefillAccountId`
  // dari "+ New Inquiry" Account/Lead Detail). "Visit Prefill" (D5) TIDAK
  // dibangun — pemicunya di modul Sales Activity, di luar 3 file scope ini.
  const [prefillBanner, setPrefillBanner] = useState(null);
  const [contactsFor, setContactsFor] = useState({ accountId: null, list: [] });
  const [accountSource, setAccountSource] = useState(''); // accounts.source — read-only display

  const [f, setF] = useState(blankF);
  const [directionTouched, setDirectionTouched] = useState(false);
  // Review fix 2 (TD-285) -- Estimated Value/Total Weight/Volume: SATU field
  // dipakai utk tampilan DAN kirim (pola CaptureLeadModal.jsx, bukan buffer
  // teks terpisah ala InputSPPage.jsx -- field ini WAJIB memblokir Create
  // kalau tak terbaca, beda dari pola SP yang membiarkan 0 tersimpan).
  // Format ulang HANYA saat blur, bukan live -- mengetik "1.500.000" apa
  // adanya sampai user pindah field.
  const [weightUnrecognized, setWeightUnrecognized] = useState(false);
  const [volumeUnrecognized, setVolumeUnrecognized] = useState(false);
  const [estValUnrecognized, setEstValUnrecognized] = useState(false);
  // Putaran 4 Tahap 4C -- Estimated Volume per Month (CBM), mode Rate Sheet
  // Request. Pola IDENTIK weight_kg/volume_cbm/estimated_value di atas
  // (TD-285) -- type="text", format ulang hanya saat blur, blokir Create
  // kalau tak terbaca.
  const [monthlyVolumeUnrecognized, setMonthlyVolumeUnrecognized] = useState(false);
  // Putaran 14 (W-60, Scope 2) -- Estimated Shipping Cost (grup Delivery,
  // General Trading). Pola IDENTIK weight_kg/volume_cbm/estimated_value/
  // monthly_volume_cbm di atas (TD-285).
  const [shipCostUnrecognized, setShipCostUnrecognized] = useState(false);

  // Putaran 13a (D3) — "Add new contact" inline. Jalur simpan SAMA dengan
  // ContactModal.jsx (src/modules/crm/lead/components/ContactModal.jsx, dibaca
  // sebelum menulis ini): INSERT langsung ke `contacts` (nol RPC), company_id
  // = company_id AKUN (bukan profile.company_id — pola sama LeadDetailPage.jsx
  // `companyId = account.company_id`), nol logAudit (ContactModal.jsx sendiri
  // tidak memanggilnya utk aksi ini), nol validasi format email (ContactModal
  // juga tidak — FloatingInput type="email" polos). Field dipersempit ke yang
  // disetujui Den: Name* + Position/Email/Phone opsional (role_type/whatsapp/
  // preferred_channel milik Lead Management, di luar scope). Field lokal
  // (bukan ContactModal.jsx sage — CRM belum migrasi kit; lihat header file).
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', position: '', email: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleArr = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const handleWeightChange = (v) => { setF((x) => ({ ...x, weight_kg: v })); setWeightUnrecognized(readMoneyInput(v).unrecognized); };
  const handleWeightBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.weight_kg);
    if (unrecognized) return;
    setF((x) => ({ ...x, weight_kg: x.weight_kg.trim() === '' ? '' : formatIdNumber(value) }));
  };
  const handleVolumeChange = (v) => { setF((x) => ({ ...x, volume_cbm: v })); setVolumeUnrecognized(readMoneyInput(v).unrecognized); };
  const handleVolumeBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.volume_cbm);
    if (unrecognized) return;
    setF((x) => ({ ...x, volume_cbm: x.volume_cbm.trim() === '' ? '' : formatIdNumber(value) }));
  };
  const handleEstValChange = (v) => { setF((x) => ({ ...x, estimated_value: v })); setEstValUnrecognized(readMoneyInput(v).unrecognized); };
  const handleEstValBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.estimated_value);
    if (unrecognized) return;
    setF((x) => ({ ...x, estimated_value: x.estimated_value.trim() === '' ? '' : formatIdNumber(value) }));
  };
  // n_containers -- integer (p_n_containers RPC), digit saja, nol titik/koma.
  const handleNContainersChange = (e) => setF((x) => ({ ...x, n_containers: e.target.value.replace(/\D/g, '') }));
  const handleMonthlyVolumeChange = (v) => { setF((x) => ({ ...x, monthly_volume_cbm: v })); setMonthlyVolumeUnrecognized(readMoneyInput(v).unrecognized); };
  const handleMonthlyVolumeBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.monthly_volume_cbm);
    if (unrecognized) return;
    setF((x) => ({ ...x, monthly_volume_cbm: x.monthly_volume_cbm.trim() === '' ? '' : formatIdNumber(value) }));
  };
  // Putaran 14 (W-60, Scope 2) -- Estimated Shipping Cost, pola PERSIS
  // handleEstValChange/handleEstValBlur (TD-285, format id-ID hanya saat
  // blur) -- field ini opsional (mockup baris 759 absen total), tapi angka
  // tak terbaca tetap memblokir Create (lihat stepErrors).
  const handleShipCostChange = (v) => { setF((x) => ({ ...x, estimated_shipping_cost: v })); setShipCostUnrecognized(readMoneyInput(v).unrecognized); };
  const handleShipCostBlur = () => {
    const { value, unrecognized } = readMoneyInput(f.estimated_shipping_cost);
    if (unrecognized) return;
    setF((x) => ({ ...x, estimated_shipping_cost: x.estimated_shipping_cost.trim() === '' ? '' : formatIdNumber(value) }));
  };

  const isDoorToDoor = f.service_type === 'door_to_door';
  // Putaran 14 (W-10, Scope 1) -- isGTf dipakai di SELURUH komponen (step
  // array, validasi, payload, Review) -- mockup `isGTf`/`isGT`.
  const isGTf = f.service_type === 'trading';
  // Putaran 14 (W-41, Scope 2) -- Pricing Basis kini berlaku Door-to-Door
  // DAN Customs Clearance standalone, TANPA syarat Direction=Import.
  // PENGECUALIAN SADAR DARI MOCKUP (keputusan Mas, dicatat bukan ditebak):
  // mockup HANYA punya UI Pricing Basis utk Door-to-Door (langkah
  // "customs", lihat STEPS_DOOR_TO_DOOR) -- Customs Clearance berdiri
  // sendiri sama sekali tidak punya field ini di mockup manapun.
  const pricingBasisVisible = isDoorToDoor || f.service_type === 'customs';
  const SK = isGTf ? STEPS_GENERAL_TRADING : isDoorToDoor ? STEPS_DOOR_TO_DOOR : STEPS_DEFAULT;
  // service_type bisa berubah SETELAH user sudah lebih jauh dari langkah
  // svc (mis. balik dari Cargo) — step tidak pernah dibiarkan lewat batas.
  const stepIdx = Math.min(step, SK.length);
  const stepKey = SK[stepIdx - 1];

  // Putaran 4 Tahap 4C -- "Rate Sheet Request". laneTbl menyatukan DUA
  // kondisi yang masing-masing membuat tabel lane tampil: isRS (RS SELALU
  // tabel lane, nol transisi "Add route option") ATAU f.laneMode (Single
  // Shipment, multi-route lewat "Add route option" -- TIDAK disentuh).
  // selectedLanes = lane yang checkbox "Use"-nya TIDAK di-uncheck, HANYA
  // disaring saat isRS (Perbaikan 1, review Vir) -- filter ini BUKAN no-op
  // transparan untuk Single Shipment seperti diasumsikan sebelumnya: kolom
  // "Use" tidak pernah ada di UI Single Shipment, tapi `lane.on` bisa
  // tertinggal `false` dari toggle RS->Single Shipment sebelumnya (nilai
  // TIDAK dikosongkan saat toggle, supaya bolak-balik tidak kehilangan
  // pilihan) -- tanpa guard `isRS`, lane itu diam-diam tidak terkirim ke
  // RPC walau nol cara bagi user Single Shipment untuk melihat/mengubahnya.
  // Putaran 14 Tahap 3, Task 4 -- `&& !isGTf` menutup celah: pilih Rate
  // Sheet Request di step Route, balik, ganti Service Type ke General
  // Trading TANPA ganti akun -- f.inquiry_type bisa tetap 'Rate Sheet
  // Request' (reset akun tidak tersentuh). isRS turunan dari sini
  // dipakai di SELURUH validasi/lane/payload RS, jadi satu guard di
  // titik ini cukup -- bukan menambal tiap pemakainya satu-satu.
  const isRS = !isGTf && f.inquiry_type === 'Rate Sheet Request';
  const laneTbl = isRS || f.laneMode;
  const selectedLanes = isRS ? f.lanes.filter((l) => l.on !== false) : f.lanes;
  // Putaran 13b (W-21) -- mockup `routeStd` (!laneTbl) membungkus Pickup/
  // Delivery Address + Cargo ready date SEKALIGUS, jadi ketiganya hilang
  // begitu "Add route option" aktif. Keputusan Den: Door-to-Door PENGECUALIAN
  // utk Pickup/Delivery saja (tetap tampil+wajib apa pun laneTbl-nya) --
  // Cargo ready date TETAP ikut mockup apa adanya (hilang utk SEMUA service
  // type saat laneTbl, termasuk DtD, nol pengecualian). State TIDAK pernah
  // dikosongkan saat disembunyikan (pola sama container_types RS, R1) --
  // hanya disembunyikan DI UI dan DINOLKAN di payload (lihat handleCreate),
  // bukan sekadar disembunyikan tanpa menolkan.
  const pickupDeliveryVisible = isDoorToDoor || !laneTbl;

  const dgSelected = f.cargo_types.includes('dg');
  // mockup req.nCont (baris 759): wajib bila ADA tipe kontainer "/^FCL/",
  // BUKAN bila ada lane bermode "Sea FCL" (dua field berbeda — lane.mode vs
  // container_types — ikut mockup, bukan bacaan literal instruksi; dicatat
  // sebagai klarifikasi di laporan, bukan dibangun dua kali).
  // REVISI 1 -- `!isRS` DI SUMBER: container_types state TETAP tersimpan
  // (toggle balik ke Single Shipment tidak kehilangan isian), tapi field-nya
  // disembunyikan untuk RS sehingga syarat Number of containers tidak boleh
  // ikut memblokir Create lewat sisa isian yang tak lagi terlihat user.
  const needsNContainers = !isRS && f.container_types.some((c) => /^FCL/.test(c));

  // ── Akun: SATU pencarian gabungan prospect+customer (D1, mockup custRes
  // baris 746: `this.accounts.filter(a => (multi || a.ent==='MSI') && ...)`)
  // — union PRA_CUSTOMER_STATUS ∪ CUSTOMER_SIDE_STATUS, `is_in_lead_pool=false`
  // (konvensi RLS/lead-pool yang sudah ada, dipertahankan apa adanya).
  // `company_id` ikut di-select (D2) — dipakai derivasi Entity field +
  // `p_company_id` yang DIKIRIM ke RPC saat Create (bukan selalu
  // profile.company_id lagi — lihat `handleCreate`). Cakupan ENTITAS pencarian
  // (D2): super_admin TANPA filter company_id sama sekali (RLS `prospects_read`
  // yang membatasi — `is_super_admin() OR company_id IN (get_user_company_ids())`,
  // bukan FE); selain itu `.in('company_id', myCompanyIds)` — akun user yang
  // benar2 cuma punya SATU entitas otomatis hanya melihat entitas itu (RLS
  // juga tetap gerbang akhir, FE hanya mempersempit query). ──────────────────
  const scopeCompanyIds = isSuperAdmin(erpRoles) ? null : myCompanyIds;
  const scopeKey = scopeCompanyIds ? scopeCompanyIds.slice().sort().join(',') : '__all__';
  useEffect(() => {
    if (!profile?.company_id) return undefined;
    let cancelled = false;
    let query = supabase.from('accounts').select('id, name, code, lifecycle_stage, source, company_id')
      .in('lifecycle_stage', [...PRA_CUSTOMER_STATUS, ...CUSTOMER_SIDE_STATUS])
      .eq('is_in_lead_pool', false).is('deleted_at', null).order('name').limit(1000);
    if (scopeCompanyIds) query = query.in('company_id', scopeCompanyIds);
    query.then(({ data }) => { if (!cancelled) setAccounts(data || []); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, scopeKey]);

  const [locations, setLocations] = useState([]);
  useEffect(() => {
    supabase.from('locations').select('id, code, name, country, type, active').order('name').limit(1000)
      .then(({ data }) => setLocations(data || []));
  }, []);
  const canManageLocations = isSuperAdmin(erpRoles);
  // D4 — Via port kondisional (mode rute tunggal, `!laneTbl`): mockup baris
  // 131 `loc.pod.inland` (`cur0[3]==='Inland City'`, draft lama BASI sejak
  // Location Master Irisan 6). Dipetakan ke skema 4-tipe asli: "inland" =
  // `locations.type==='City'` (lokasi bukan Seaport/Airport/FTZ — butuh via
  // port untuk transit sebelum tiba inland).
  const podLocation = locations.find((l) => l.id === f.pod_location_id);
  const podIsInland = podLocation?.type === 'City';

  // ── Aside "Your recent inquiries" (mockup baris 170-173, Intake/Recent) --
  // 5 inquiry terakhir MILIK user ini sendiri (owner_id, bukan created_by --
  // sumbu RLS inquiries_read sejak 18 Sep 2026), lintas status termasuk
  // terminal (mockup `recent` tidak menyaring status). Nama customer lewat
  // embed FK prospect_id (customer_id selalu NULL -- create_inquiry_with_lanes
  // tidak pernah menulisnya, lihat migrasi 20261025000005). ──────────────────
  const [recentInquiries, setRecentInquiries] = useState([]);
  useEffect(() => {
    if (!profile?.id) return undefined;
    let cancelled = false;
    supabase.from('inquiries').select('id, inquiry_no, status, prospect:accounts!inquiries_prospect_id_fkey(name)')
      .eq('owner_id', profile.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (!cancelled) setRecentInquiries(data || []); });
    return () => { cancelled = true; };
  }, [profile?.id]);
  const openLocationMaster = () => navigate('/admin-settings/locations');
  const requestNewLocation = (name, note) => {
    supabase.rpc('request_new_location', { p_name: name, p_note: note }).then(({ error }) => {
      showToast?.(error ? 'Failed to send request: ' + error.message : 'Request sent to managers.', error ? 'error' : 'success');
    });
  };

  const resolvedAccountId = f.account_id;
  const selectedAccount = accounts.find((a) => a.id === resolvedAccountId) || null;
  const contactsLoaded = contactsFor.accountId === resolvedAccountId;
  const contacts = contactsLoaded ? contactsFor.list : [];

  // Putaran 14 (W-10, Scope 1a) -- kartu 'trading' (General Trading)
  // DIKEMBALIKAN, tapi HANYA kalau akun terpilih ber-entitas SOA (mockup
  // `og.svc.gt.disp = acc && acc.ent==='SOA'`, rule desain #7). Sebelum
  // akun dipilih (`selectedAccount` null) kartu TIDAK tampil -- cermin
  // mockup yang juga memerlukan `acc` terisi dulu. Dipindah ke SINI (bukan
  // di dekat `serviceTypeOptsRaw` di atas) krn butuh `selectedAccount`,
  // yang baru terdefinisi di titik ini. 'warehousing' TETAP disembunyikan
  // (review fix 6) -- bukan kartu Service Type di mockup sama sekali
  // (hanya tag di Additional Services, SERVICES id='warehouse' -- konsep
  // berbeda). dropdown_options tidak disentuh.
  const serviceTypeOpts = useMemo(
    () => serviceTypeOptsRaw.filter((o) => {
      if (o.value === 'warehousing') return false;
      if (o.value === 'trading') return !!selectedAccount && selectedAccount.company_id === SOA_ID;
      return true;
    }),
    [serviceTypeOptsRaw, selectedAccount],
  );

  // ── Entity (read-only, D2) — mockup fEnt baris 57/1136: entitas AKUN
  // terpilih, atau "Set from customer" sebelum akun dipilih. ⚠️ DEVIASI
  // DISENGAJA dari mockup, dilaporkan bukan ditebak: mockup menimpa nilai ini
  // jadi literal "JCI" saat Service Type = Customs Clearance, TANPA mengubah
  // akun yang sebenarnya dipilih — tapi `p_company_id` yang DIKIRIM ke RPC
  // (lihat `handleCreate`) tetap company_id AKUN itu sendiri (tidak ada
  // parameter RPC yang bisa memaksa company_id lain). Menimpa TAMPILAN Entity
  // tanpa menimpa company_id yang BENAR-BENAR tertulis = field read-only yang
  // berbohong (persis yang diminta dihindari) — jadi override itu TIDAK
  // diikuti di sini. Entity SELALU mencerminkan company_id yang akan
  // benar-benar ditulis. Ditanyakan di laporan chat, bukan diputuskan sendiri.
  const entityCode = selectedAccount ? (entityCodeOf(selectedAccount.company_id) || '—') : 'Set from customer';

  // ── Prefill dari "+ New Inquiry" (Detail Account/Lead) — pola IDENTIK
  // InquiryFormPage.jsx (sama guard is_in_lead_pool, sama injeksi ke daftar). ──
  useEffect(() => {
    if (!prefillAccountId) return undefined;
    let cancelled = false;
    supabase.from('accounts').select('id, name, code, lifecycle_stage, is_in_lead_pool, source, company_id')
      .eq('id', prefillAccountId).is('deleted_at', null).maybeSingle()
      .then(({ data: acc }) => {
        if (cancelled || !acc) return;
        if (acc.is_in_lead_pool) {
          showToast?.('This account is in the Lead Pool and must be assigned before an inquiry can be created.', 'error');
          return;
        }
        const opt = { id: acc.id, name: acc.name, code: acc.code, lifecycle_stage: acc.lifecycle_stage, source: acc.source, company_id: acc.company_id };
        setAccounts((prev) => (prev.some((a) => a.id === acc.id) ? prev : [opt, ...prev]));
        setAccountText(acc.name);
        setAccountSource(acc.source || '');
        // D6 — banner prefill generik (bukan "Visit Prefill", D5 ditunda).
        const kind = acc.lifecycle_stage === 'lead' ? 'lead' : 'account';
        setPrefillBanner({ text: `Prefilled from ${kind} ${acc.code || '—'}, ${acc.name}.` });
        setF((x) => ({
          ...x,
          account_id: acc.id,
          contact_id: prefillContactId || x.contact_id,
        }));
      });
    return () => { cancelled = true; };
  }, [prefillAccountId, prefillContactId, showToast]);

  // ── Kontak akun terpilih — pola IDENTIK InquiryFormPage.jsx. ──────────────
  useEffect(() => {
    if (!resolvedAccountId) return undefined;
    let cancelled = false;
    supabase.from('contacts').select('id, name, position, is_primary, is_active')
      .eq('account_id', resolvedAccountId).is('deleted_at', null)
      .order('is_primary', { ascending: false }).order('name').limit(1000)
      .then(({ data }) => {
        if (cancelled) return;
        const list = data || [];
        setContactsFor({ accountId: resolvedAccountId, list });
        setF((x) => {
          if (x.contact_id) return x;
          const auto = list.find((c) => c.is_primary) || (list.length === 1 ? list[0] : null);
          return auto ? { ...x, contact_id: auto.id } : x;
        });
      });
    return () => { cancelled = true; };
  }, [resolvedAccountId]);

  // D3 -- "Add new contact" inline. Jalur simpan SAMA dengan ContactModal.jsx
  // (INSERT langsung, nol RPC, nol logAudit, nol validasi format email —
  // dibaca dulu sebelum menulis ini, lihat komentar state `addingContact` di
  // atas). `company_id` = company_id AKUN (bukan profile.company_id — pola
  // LeadDetailPage.jsx `companyId = account.company_id`). `is_primary` =
  // true kalau ini kontak PERTAMA akun ini (sama dgn `makePrimaryDefault`
  // ContactModal.jsx). Hasil insert DIPERIKSA benar2 ada (`data.length===0`
  // -- RLS bisa menolak tanpa error, pola "RLS-silent-fail" yang sudah dipakai
  // berulang di repo ini) sebelum dianggap sukses.
  const handleSaveNewContact = async () => {
    if (!newContact.name.trim() || !selectedAccount) return;
    setSavingContact(true);
    const { data, error } = await supabase.from('contacts').insert({
      account_id: selectedAccount.id,
      company_id: selectedAccount.company_id,
      name: newContact.name.trim(),
      position: newContact.position.trim() || null,
      email: newContact.email.trim() || null,
      phone: newContact.phone.trim() || null,
      is_primary: contacts.length === 0,
    }).select('id, name, position, is_primary, is_active');
    setSavingContact(false);
    if (error) {
      showToast?.('Failed to add contact: ' + error.message, 'error');
      return;
    }
    if (!data || data.length === 0) {
      showToast?.('Contact was not saved — check your permissions for this account.', 'error');
      return;
    }
    const created = data[0];
    setContactsFor((prev) => (prev.accountId === selectedAccount.id ? { accountId: selectedAccount.id, list: [...prev.list, created] } : prev));
    setF((x) => ({ ...x, contact_id: created.id }));
    setAddingContact(false);
    setNewContact({ name: '', position: '', email: '', phone: '' });
    showToast?.('Contact added.');
  };

  // Source read-only (task 7) — ikut akun yang dipilih manual lewat picker
  // (bukan hanya jalur prefill di atas). D7 — TETAP read-only (Mas belum
  // memutuskan arah tulisnya), satu daftar `accounts` gabungan (D1).
  useEffect(() => {
    let cancelled = false;
    const acc = accounts.find((a) => a.id === resolvedAccountId);
    // setState dijadwalkan lewat setTimeout (pola sama InquiryFormPage.jsx
    // possible-duplicate effect) — menghindari setState sinkron di badan
    // effect (react-hooks/set-state-in-effect).
    const t = setTimeout(() => { if (!cancelled) setAccountSource(acc?.source || ''); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [resolvedAccountId, accounts]);

  // ── Direction auto-suggest (lane pertama yang terkirim — mockup PLAN
  // addendum §B.5): trim+lowercase dibanding 'indonesia'. Berhenti menimpa
  // begitu user menyentuh Direction manual (directionTouched). ─────────────
  // C3.3 -- "lane pertama" untuk Rate Sheet Request = lane pertama yang
  // checkbox "Use"-nya TETAP tercentang (selectedLanes[0]), bukan f.lanes[0]
  // mentah. Untuk Single Shipment (laneMode, l.on selalu undefined) hasilnya
  // identik f.lanes[0] -- nol perubahan perilaku di sana.
  const primaryPolLoc = laneTbl ? selectedLanes[0]?.pol_location_id : f.pol_location_id;
  const primaryPodLoc = laneTbl ? selectedLanes[0]?.pod_location_id : f.pod_location_id;
  useEffect(() => {
    if (directionTouched) return undefined;
    const pol = locations.find((l) => l.id === primaryPolLoc);
    const pod = locations.find((l) => l.id === primaryPodLoc);
    if (!pol || !pod) return undefined; // lokasi belum lengkap/negara tak diketahui — tidak menyarankan
    const polID = (pol.country || '').trim().toLowerCase() === 'indonesia';
    const podID = (pod.country || '').trim().toLowerCase() === 'indonesia';
    let suggestion = null;
    if (polID && podID) suggestion = 'Domestic';
    else if (polID && !podID) suggestion = 'Export';
    else if (!polID && podID) suggestion = 'Import';
    if (!suggestion) return undefined;
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) setF((x) => ({ ...x, direction: suggestion })); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [primaryPolLoc, primaryPodLoc, locations, directionTouched]);
  // Putaran 13b (W-14) -- mockup `og.dir.<k>.go` menimpa `custRole` SETIAP
  // kali Direction diklik (Export->Shipper, Import->Consignee), TANPA guard
  // "touched" -- Domestic dan kasus lain yang mockup tidak definisikan TIDAK
  // mengubah customer_role yang sudah ada (keputusan Den, bukan tebakan).
  // Nol dampak ke General Trading (dikecualikan #2 di bawah, 'trading' tetap
  // tidak reachable di wizard ini).
  const pickDirection = (v) => {
    setDirectionTouched(true);
    setF((x) => ({
      ...x,
      direction: v,
      customer_role: v === 'Export' ? 'Shipper' : v === 'Import' ? 'Consignee' : x.customer_role,
    }));
  };

  // Putaran 13b (W-64) -- default Pricing Basis/Duties & Taxes (mockup
  // `blankF.pricing='Itemized charges'`/`blankF.duties='Included in price'`)
  // SENGAJA TIDAK dipasang di `blankF()` langsung -- itu akan mengisi state
  // utk SEMUA service type sejak form dibuka, termasuk yang tidak pernah
  // menampilkan ATAU mengirim field ini (Freight Forwarding/Trucking/Customs
  // Clearance+Export, dst). Diisi LAZY, HANYA begitu step 'customs' benar2
  // tercapai (yang hanya ada di SK utk Door-to-Door) -- jadi nol inquiry
  // layanan lain yang pernah menyimpan nilai yang tak pernah dilihat
  // penggunanya. Payload (`handleCreate`) tetap menolkan keduanya kecuali
  // `isDoorToDoor` (pricing_basis) / `dutiesVisible` (duties_and_taxes) --
  // jadi jalur aman INI GANDA: state kosong kalau step tak tercapai, DAN
  // payload menolak mengirim kalau kondisinya tak terpenuhi, apa pun isi
  // state. Pola "isi sekali kalau masih kosong" sama dgn `duties_and_taxes`
  // di checkbox Undername (Review fix 1) -- di sini pemicunya step, bukan
  // checkbox.
  useEffect(() => {
    if (stepKey !== 'customs') return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setF((x) => (x.pricing_basis && x.duties_and_taxes ? x : {
        ...x,
        pricing_basis: x.pricing_basis || PRICING_BASIS_OPTS[0],
        duties_and_taxes: x.duties_and_taxes || DUTIES_AND_TAXES_OPTS[0],
      }));
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [stepKey]);

  // Putaran 14 (W-41, Scope 2/3) -- default malas Pricing Basis utk Customs
  // Clearance standalone, SAMA dgn Door-to-Door di atas (W-64, "Itemized
  // charges") -- keputusan Mas yang BISA DIBALIK (laporan). Efek TERPISAH
  // dari efek Door-to-Door di atas (bukan memperluas kondisinya) supaya
  // NOL risiko mengubah perilaku duties_and_taxes Door-to-Door yang sudah
  // benar -- duties_and_taxes utk Customs Clearance standalone punya jalur
  // default SENDIRI lewat checkbox Undername (UndernamePanel, Review fix
  // 1), BUKAN lewat efek ini. Dipicu begitu langkah 'svc' tercapai DENGAN
  // Customs Clearance terpilih (Customs Clearance tidak punya langkah
  // "customs" tersendiri di SK, field-nya dirender inline di langkah
  // 'svc' -- lihat blok Pricing Basis inline di render).
  useEffect(() => {
    if (!(stepKey === 'svc' && f.service_type === 'customs')) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setF((x) => (x.pricing_basis ? x : { ...x, pricing_basis: PRICING_BASIS_OPTS[0] }));
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [stepKey, f.service_type]);

  // ── Possible Duplicate — lane pertama yang dipakai + container_types.
  // Mockup crm-metrics.js baris 82-85 (C.contOf/C.lane): hasil KOSONG bila
  // container_types kosong — ditiru persis (RPC Postgres sendiri sebenarnya
  // akan membandingkan NULL/[] sebagai setara, tapi FE sengaja TIDAK memanggil
  // RPC sama sekali di sini supaya perilakunya identik mockup, bukan lebih
  // permisif — deviasi dicatat di laporan). ─────────────────────────────────
  const [possibleDuplicates, setPossibleDuplicates] = useState([]);
  const [dupCheckLoading, setDupCheckLoading] = useState(false);
  const containerTypesKey = f.container_types.join(',');
  // Review fix 4 -- duplicate_warning_reason dikosongkan SETIAP kali input
  // yang menentukan "situasi duplikat ini" berubah (akun/lane/container di
  // deps effect ini), bukan hanya saat daftarnya jadi kosong. Pindah rute
  // lalu balik ke daftar duplikat yang BERBEDA tetap butuh alasan baru --
  // alasan lama untuk situasi lama tidak boleh ikut terkirim diam-diam.
  const clearStaleDupReason = () => setF((x) => (x.duplicate_warning_reason ? { ...x, duplicate_warning_reason: '' } : x));
  useEffect(() => {
    let cancelled = false;
    // REVISI 1 -- `isRS` ikut gerbang bailout: Rate Sheet Request tidak
    // pernah memanggil cek duplikat sama sekali (Keputusan Q1), termasuk
    // kalau container_types masih berisi sisa dari sebelum toggle (state
    // TIDAK dikosongkan saat toggle, hanya field-nya yang disembunyikan).
    if (isRS || !profile?.company_id || !resolvedAccountId || !primaryPolLoc || !primaryPodLoc || !f.container_types.length) {
      const t = setTimeout(() => { if (!cancelled) { setPossibleDuplicates([]); clearStaleDupReason(); } }, 0);
      return () => { cancelled = true; clearTimeout(t); };
    }
    const loadingTimer = setTimeout(() => { if (!cancelled) setDupCheckLoading(true); }, 0);
    const timer = setTimeout(() => {
      supabase.rpc('find_possible_duplicate_inquiries', {
        // D2 — company_id AKUN (bukan profile.company_id): cek duplikat harus
        // di entitas tempat inquiry ini akan benar2 tercipta.
        p_company_id: selectedAccount?.company_id || profile.company_id,
        p_customer_id: resolvedAccountId,
        p_pol_location_id: primaryPolLoc,
        p_pod_location_id: primaryPodLoc,
        p_container_types: f.container_types,
        p_exclude_id: null,
      }).then(({ data, error }) => {
        if (cancelled) return;
        setDupCheckLoading(false);
        setPossibleDuplicates(error ? [] : (data || []));
        clearStaleDupReason();
      });
    }, 500);
    return () => { cancelled = true; clearTimeout(loadingTimer); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRS, profile?.company_id, resolvedAccountId, primaryPolLoc, primaryPodLoc, containerTypesKey]);

  // ── Possible duplicate Rate Sheet (Putaran 12 Butir 4) — mirror pattern di
  // atas: debounce 500ms, cancel panggilan lama, state SAMA (possibleDuplicates/
  // dupCheckLoading) karena isRS membuat kedua cek ini berbunyi bergantian,
  // tidak pernah bersamaan. RPC find_possible_duplicate_rate_sheets read-only,
  // nol baris untuk input belum lengkap -- effect ini hanya memanggilnya begitu
  // akun + validity_from + validity_to + minimal 1 lane ber-POL+POD (dari
  // location master, bukan teks bebas) sudah terisi.
  const rsLaneLocKey = selectedLanes.map((l) => `${l.pol_location_id || ''}|${l.pod_location_id || ''}`).join(',');
  useEffect(() => {
    // Koreksi -- `!isRS` WAJIB keluar di sini TANPA menyentuh state sama
    // sekali (nol setTimeout, nol setPossibleDuplicates/setDupCheckLoading).
    // rsLaneLocKey (dependency di bawah) berasal dari selectedLanes, yang
    // untuk Single Shipment = f.lanes mentah -- mengubah/menambah lane KEDUA
    // (laneMode, bukan lane[0] yang dipakai cek Single Shipment) mengubah
    // key itu dan me-retrigger effect INI walau isRS tetap false, padahal
    // effect Single Shipment di atas TIDAK ikut jalan ulang (lane kedua
    // bukan dependency-nya). Cabang lama di bawah ini (sebelum koreksi)
    // tetap mengosongkan possibleDuplicates lewat setTimeout pada kasus itu
    // -- menghapus diam-diam banner DAN kewajiban alasan milik cek Single
    // Shipment yang sedang tampil. Pembersihan saat berpindah Rate Sheet ->
    // Single Shipment sudah ditangani effect LAMA di atas (isRS ada di
    // dependency-nya, cabang awalnya mengosongkan daftar) -- bukan tugas
    // effect ini.
    if (!isRS) return undefined;
    let cancelled = false;
    const completeLanes = selectedLanes.filter((l) => l.pol_location_id && l.pod_location_id);
    if (!profile?.company_id || !resolvedAccountId || !f.validity_from || !f.validity_to || !completeLanes.length) {
      const t = setTimeout(() => { if (!cancelled) setPossibleDuplicates([]); }, 0);
      return () => { cancelled = true; clearTimeout(t); };
    }
    const loadingTimer = setTimeout(() => { if (!cancelled) setDupCheckLoading(true); }, 0);
    const timer = setTimeout(() => {
      supabase.rpc('find_possible_duplicate_rate_sheets', {
        p_company_id: selectedAccount?.company_id || profile.company_id,
        p_prospect_id: resolvedAccountId,
        p_validity_from: f.validity_from,
        p_validity_to: f.validity_to,
        p_lanes: completeLanes.map((l) => ({ pol_location_id: l.pol_location_id, pod_location_id: l.pod_location_id })),
      }).then(({ data, error }) => {
        if (cancelled) return;
        setDupCheckLoading(false);
        if (error) {
          console.error('find_possible_duplicate_rate_sheets failed', error);
          setPossibleDuplicates([]);
          return;
        }
        setPossibleDuplicates(data || []);
      });
    }, 500);
    return () => { cancelled = true; clearTimeout(loadingTimer); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRS, profile?.company_id, resolvedAccountId, f.validity_from, f.validity_to, rsLaneLocKey]);

  // ── Owner — manager-ke-atas lihat roster + "Leave unassigned"; sales tidak
  // lihat kontrolnya sama sekali (default diri sendiri, ditegakkan RPC). ────
  const canPickOwner = isManagerOrAbove(erpRoles);

  // ── JCI (D2) — "Customs Clearance" standalone (mockup svcJciBlocked baris
  // 62) adalah lini JCI; tanpa akses JCI, Service Type ini diblokir + banner
  // "Request Access". `hasJciAccess` = super_admin ATAU punya baris role
  // aktif di JCI (myCompanyIds, dari useAuth — sumber sama dgn CompanySwitcher). ──
  const hasJciAccess = isSuperAdmin(erpRoles) || (JCI_ID && myCompanyIds.includes(JCI_ID));
  const svcJciBlocked = f.service_type === 'customs' && !hasJciAccess;
  const requestJciAccess = () => showToast?.('Ask your manager to request JCI sales access for your account.', 'info');
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    if (!canPickOwner || !profile?.company_id) return;
    let cancelled = false;
    fetchOperationalRoster(profile.company_id).then((r) => { if (!cancelled) setRoster(r); });
    return () => { cancelled = true; };
  }, [canPickOwner, profile?.company_id]);
  // 5b -- Owner default = diri sendiri untuk manager BILA ia ada di roster
  // sales (bukan selalu "Leave unassigned" seperti sebelumnya). Pola
  // "touched" SAMA dengan Direction (directionTouched) -- berhenti menimpa
  // begitu user menyentuh Owner manual (termasuk balik ke "Leave unassigned"),
  // dan berjalan sekali setelah roster termuat, bukan tiap render.
  const [ownerTouched, setOwnerTouched] = useState(false);
  useEffect(() => {
    if (ownerTouched || !canPickOwner || !roster.length || !profile?.id) return undefined;
    if (!roster.some((r) => r.id === profile.id)) return undefined;
    let cancelled = false;
    const t = setTimeout(() => { if (!cancelled) setF((x) => (x.owner_id ? x : { ...x, owner_id: profile.id })); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ownerTouched, canPickOwner, roster, profile?.id]);

  // ── Lane table (laneMode) — mockup startLanes baris 949: dua baris awal
  // mewarisi POL (dan Via/Mode) dari pasangan POL/POD yang sudah terisi.
  // Mode diturunkan dari container_types SEKALI (deriveLaneMode) dan dioper
  // ke KEDUA baris yang diseed (5c -- lihat komentar blankLane). ───────────
  const startLanes = () => {
    const mode = deriveLaneMode(f.container_types);
    setF((x) => ({
      ...x,
      laneMode: true,
      lanes: x.lanes.length ? x.lanes : [
        blankLane({ pol_location_id: x.pol_location_id, pol: x.pol, pod_location_id: x.pod_location_id, pod: x.pod, mode }),
        blankLane({ pol_location_id: x.pol_location_id, pol: x.pol, mode }),
      ],
    }));
  };
  const addLane = () => setF((x) => {
    const last = x.lanes[x.lanes.length - 1];
    return { ...x, lanes: [...x.lanes, blankLane({ pol_location_id: last?.pol_location_id, pol: last?.pol, pod_location_id: last?.pod_location_id, pod: last?.pod })] };
  });
  const updateLane = (i, patch) => setF((x) => ({ ...x, lanes: x.lanes.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const removeLane = (i) => setF((x) => ({ ...x, lanes: x.lanes.filter((_, j) => j !== i) }));
  // Putaran 4 Tahap 4C -- toggle Inquiry Type. HANYA mengubah `inquiry_type`
  // + seed 1 lane kosong kalau Rate Sheet Request dipilih dan `lanes` masih
  // kosong (mockup typeOpts[...].go, baris 946) -- TIDAK menyentuh
  // `laneMode` sama sekali (laneTbl sudah benar lewat `isRS` saja; `laneMode`
  // tetap murni konsep "Add route option" Single Shipment).
  const switchInquiryType = (type) => setF((x) => ({
    ...x,
    inquiry_type: type,
    lanes: type === 'Rate Sheet Request' && !x.lanes.length
      ? [blankLane({ pol_location_id: x.pol_location_id, pol: x.pol, pod_location_id: x.pod_location_id, pod: x.pod, mode: 'Sea LCL' })]
      : x.lanes,
  }));
  const toggleLaneUse = (i) => updateLane(i, { on: f.lanes[i]?.on === false });

  // ── Validasi — Direction WAJIB tapi TIDAK memblokir Next (deviasi kecil
  // dari mockup: mockup sendiri juga tidak pernah memblokir Next untuk ini,
  // tapi saat gagal di Create ia hanya pindah ke Review lalu membiarkan user
  // mencari sendiri; di sini kami lompat ke LANGKAH PERTAMA yang error —
  // perbaikan UX kecil, dicatat sebagai deviasi). ───────────────────────────
  const stepErrors = () => {
    const e = {};
    // D1/mockup baris 55 — satu akun gabungan, pesan error persis mockup.
    if (!f.account_id) e.cust_account = 'Customer is required';
    // Putaran 13a — Contact WAJIB (perubahan perilaku nyata, berlaku di
    // KEDUA mode — Single Shipment dan Rate Sheet Request, korekis Den):
    // field Contact tidak dicabangkan per `isRS` sama sekali, jadi gate-nya
    // juga tidak perlu dicabangkan.
    if (!f.contact_id) e.cust_contact = 'Contact is required';
    if (!f.service_type) e.svc_service_type = 'Service Type is required';
    if (svcJciBlocked) e.svc_jci = 'JCI sales access is required for Customs Clearance.';
    if (!f.direction) e.svc_direction = 'Direction is required';
    // Putaran 14 (W-10, Scope 1) -- Customer Role TIDAK wajib utk General
    // Trading (mockup req.role baris 759, cermin RPC
    // create_inquiry_with_lanes: "Customer Role wajib kecuali General
    // Trading"). Field-nya pun tidak dirender utk GT (lihat langkah 'svc').
    if (!isGTf && !f.customer_role) e.svc_customer_role = 'Customer Role is required';
    const undernameActive = f.direction === 'Import' && ['customs', 'door_to_door'].includes(f.service_type) && f.undername_import;
    if (undernameActive) {
      if (!f.importer_of_record) e.under_ior = 'Importer of Record is required';
      // Review fix 1 -- divalidasi juga di sini (bukan hanya bergantung pada
      // default yang di-set saat checkbox dicentang) supaya kombinasi mana
      // pun yang membuat duties_and_taxes kosong tetap tertangkap sebelum
      // RPC/CHECK inquiries_undername_docs_check menolaknya.
      if (!f.duties_and_taxes) e.under_duties = 'Duties & Taxes is required';
      if (!f.supporting_docs_received) e.under_docs = 'Supporting documents must be confirmed received';
    }
    // Putaran 14 (W-10, Scope 1) -- General Trading tidak punya langkah
    // "Route & Terms"/"Cargo" sama sekali (SK GT = cust/svc/delivery/
    // commercial/review, STEPS_GENERAL_TRADING) -- SELURUH validasi route/
    // lane/n_containers/pickup-delivery/duplikat/Rate-Sheet/cargo di bawah
    // ini dibungkus `!isGTf` supaya nilai sisa dari sebelum GT dipilih
    // (mis. user mengisi Cargo sebagai Freight Forwarding lalu berpindah
    // Service Type ke GT tanpa mengganti akun) tidak ikut memblokir Create
    // dengan error yang menunjuk ke langkah yang sudah tidak ada di SK.
    if (!isGTf) {
      // C2/R2 -- laneTbl menyatukan Single Shipment multi-route DAN Rate
      // Sheet Request; selectedLanes (filter "Use") dipakai utk laneTbl,
      // lane tunggal apa adanya utk mode biasa. REVISI 2 -- pesan "0 lane
      // terpilih" dibedakan dari "lane terpilih tapi POL/POD belum
      // lengkap": kasus pertama HANYA bisa terjadi utk Rate Sheet Request
      // (Single Shipment laneMode tak pernah bisa 0 lane -- tombol Remove
      // LaneTable disabled di lanes.length<=1), tapi cabang fallback tetap
      // disediakan, bukan dibiarkan unguarded.
      if (laneTbl) {
        if (!selectedLanes.length) {
          e.route_lanes = isRS ? 'Select at least one lane to include.' : 'Every lane needs a Port of Loading and Port of Discharge';
        } else if (selectedLanes.some((l) => !l.pol_location_id || !l.pod_location_id)) {
          e.route_lanes = 'Every lane needs a Port of Loading and Port of Discharge';
        }
      } else if (!f.pol_location_id || !f.pod_location_id) {
        e.route_lanes = 'Every lane needs a Port of Loading and Port of Discharge';
      }
      if (needsNContainers && !(Number(f.n_containers) > 0)) e.route_ncont = 'Number of containers is required for FCL';
      // Putaran 13a -- Pickup/Delivery Address WAJIB untuk Door-to-Door
      // (perubahan perilaku nyata). Digerbang `!isRS` SAMA dengan field-nya
      // sendiri (disembunyikan utk Rate Sheet Request apa pun service_type-nya).
      if (isDoorToDoor && !isRS) {
        if (!f.pickup_address.trim()) e.route_pickup = 'Pickup Address is required for Door to Door.';
        if (!f.delivery_address.trim()) e.route_delivery = 'Delivery Address is required for Door to Door.';
      }
      // Putaran 12 Butir 4 -- gerbang `!isRS` BARU: possibleDuplicates kini
      // juga terisi lewat cek Rate Sheet (state yang sama, dipakai ulang),
      // dan Rate Sheet TIDAK WAJIB mengisi alasan -- banner-nya non-blocking
      // (lihat task Butir 4). Tanpa guard ini, cek duplikat Rate Sheet akan
      // ikut memblokir Submit lewat jalur yang sama dengan Single Shipment.
      if (!isRS && possibleDuplicates.length > 0 && !f.duplicate_warning_reason.trim()) {
        e.route_dup = 'Required when a possible duplicate is shown';
      }
      // Putaran 4 Tahap 4C -- Validity Requested + Estimated Volume per Month,
      // HANYA Rate Sheet Request (mencerminkan inquiries_rate_sheet_fields_check).
      if (isRS) {
        if (!f.validity_from || !f.validity_to || f.validity_to < f.validity_from) {
          e.route_validity = 'Enter the requested validity, with Until on or after From.';
        }
        if (monthlyVolumeUnrecognized) {
          e.route_volume = 'Angka tidak dikenali';
        } else if (!(readMoneyInput(f.monthly_volume_cbm).value > 0)) {
          e.route_volume = 'Estimated Volume per Month is required and must be greater than 0.';
        }
      }
      // Review fix 2 (TD-285) -- angka tak terbaca MEMBLOKIR Create (pola
      // CaptureLeadModal.jsx), bukan diam-diam terkirim null.
      if (weightUnrecognized) e.cargo_weight = 'Angka tidak dikenali';
      if (volumeUnrecognized) e.cargo_volume = 'Angka tidak dikenali';
    }
    if (estValUnrecognized) e.commercial_estval = 'Angka tidak dikenali';
    // Putaran 14 (W-60, Scope 2) -- Estimated Shipping Cost TIDAK wajib
    // (mockup req baris 759 absen total utk grup Delivery), tapi angka tak
    // terbaca MEMBLOKIR Create (pola sama weight_kg/volume_cbm/
    // estimated_value, TD-285). Field ini HANYA tampil di langkah
    // "delivery", yang HANYA ada utk GT -- guard `isGTf` murni jaga-jaga
    // (state sisa dari GT yang ditinggalkan via kasus tepi ganti akun tidak
    // ikut memblokir Create service_type lain).
    if (isGTf && shipCostUnrecognized) e.delivery_shipcost = 'Angka tidak dikenali';
    return e;
  };
  // Pemetaan error -> langkah (urutan SK), untuk "lompat ke step pertama yang error".
  const errorStepKey = (key) => {
    if (key === 'cust_account' || key === 'cust_contact') return 'cust';
    if (key.startsWith('svc_')) return 'svc';
    if (key.startsWith('under_')) return isDoorToDoor ? 'customs' : 'svc';
    if (key.startsWith('route_')) return 'route';
    if (key.startsWith('cargo_')) return 'cargo';
    if (key.startsWith('delivery_')) return 'delivery';
    if (key.startsWith('commercial_')) return 'commercial';
    return 'review';
  };

  const handleCreate = async () => {
    const e = stepErrors();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      const firstKey = Object.keys(e)[0];
      const target = errorStepKey(firstKey);
      const idx = SK.indexOf(target);
      setStep(idx >= 0 ? idx + 1 : 1);
      showToast?.('Please complete the required fields first.', 'error');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // Mode/load_unit lane TUNGGAL (laneMode mati) diturunkan dari
      // container_types lewat deriveLaneMode() bersama (src/kit/LaneTable.jsx,
      // PERSIS modeOf() mockup baris 743) -- SATU sumber dengan blankLane/
      // startLanes (5c), bukan dua salinan logika yang sama.
      const singleLaneMode = deriveLaneMode(f.container_types);
      // C2/C3.2 -- laneTbl + selectedLanes (bukan f.laneMode/f.lanes mentah):
      // utk Rate Sheet Request, baris yang "Use"-nya di-uncheck TIDAK PERNAH
      // masuk p_lanes. `.map()` di bawah whitelist 8 key eksplisit -- `on`
      // TIDAK ikut tersalin, jadi field itu tidak mungkin terkirim ke RPC.
      const laneRows = (laneTbl ? selectedLanes : [{
        pol_location_id: f.pol_location_id, pod_location_id: f.pod_location_id,
        // D4 -- Via port kondisional (podIsInland) kini ikut terkirim, bukan
        // hardcode null -- satu-satunya jalur tulis `via_location_id`/`via`
        // mode rute tunggal.
        via_location_id: f.via_location_id, pol: f.pol, pod: f.pod, via: f.via,
        mode: singleLaneMode, load_unit: unitForMode(singleLaneMode),
      }]).map((l) => ({
        pol_location_id: l.pol_location_id, pod_location_id: l.pod_location_id,
        via_location_id: l.via_location_id || null,
        pol: l.pol || null, pod: l.pod || null, via: l.via || null,
        mode: l.mode || null, load_unit: l.load_unit || null,
      }));
      const undernameActive = f.direction === 'Import' && ['customs', 'door_to_door'].includes(f.service_type) && f.undername_import;
      // Putaran 13b (W-33/W-64) -- Duties & Taxes kini field MANDIRI utk
      // Door-to-Door (tampil apa pun Direction/checkbox-nya), jadi syarat
      // kirimnya ikut melebar dari `undernameActive` saja menjadi "field itu
      // benar2 tampil ke pengguna": DtD (selalu) ATAU undernameActive (jalur
      // 'svc'/Customs Clearance standalone, tak berubah).
      const dutiesVisible = isDoorToDoor || undernameActive;
      // Review fix 2 -- nilai ke RPC = readMoneyInput(...).value (angka
      // tak terbaca sudah diblokir di stepErrors di atas, jadi di sini
      // string yang tersisa sudah pasti kosong ATAU benar-benar terbaca).
      const estVal = f.estimated_value.trim() === '' ? null : readMoneyInput(f.estimated_value).value;
      const weightVal = f.weight_kg.trim() === '' ? null : readMoneyInput(f.weight_kg).value;
      const volumeVal = f.volume_cbm.trim() === '' ? null : readMoneyInput(f.volume_cbm).value;

      // Putaran 4 Tahap 4C -- monthly_volume_cbm lewat readMoneyInput (C1),
      // BUKAN Number(...) -- angka tak terbaca sudah diblokir stepErrors,
      // jadi string yang tersisa di sini sudah pasti kosong ATAU terbaca.
      const monthlyVolumeVal = isRS && f.monthly_volume_cbm.trim() !== '' ? readMoneyInput(f.monthly_volume_cbm).value : null;
      // Putaran 14 (W-60, Scope 2) -- angka tak terbaca sudah diblokir
      // stepErrors (isGTf && shipCostUnrecognized) -- pola sama estVal dkk.
      const shipCostVal = isGTf && f.estimated_shipping_cost.trim() !== '' ? readMoneyInput(f.estimated_shipping_cost).value : null;

      const params = {
        // D2(a) — company_id AKUN terpilih, BUKAN selalu profile.company_id
        // lagi: RPC create_inquiry_with_lanes menerima p_company_id APA PUN
        // yang caller punya akses (is_super_admin() ATAU
        // p_company_id IN get_user_company_ids(), migrasi 20261025000005),
        // tidak derive-nya sendiri dari akun — jadi FE wajib mengirim yang
        // benar supaya Entity field (selalu = entitas akun, lihat `entityCode`
        // di atas) TIDAK berbohong dibanding yang benar2 tersimpan.
        p_company_id: selectedAccount.company_id,
        // D1 — satu akun gabungan: TIDAK ada parameter p_customer_id di
        // signature RPC ini sama sekali (customer_id inquiries SELALU NULL,
        // "paritas InquiryFormPage.jsx" -- komentar migrasi) -- apa pun tahap
        // akunnya, id-nya selalu ke p_prospect_id, persis hari ini.
        p_prospect_id: f.account_id,
        p_service_type: f.service_type,
        p_direction: f.direction || null,
        // Putaran 14 (W-10, Scope 1) -- General Trading TIDAK mengirim
        // Customer Role (field-nya pun tidak dirender utk GT -- `isGTf`
        // membuat ini EKSPLISIT alih-alih mengandalkan `f.customer_role`
        // yang kebetulan kosong).
        p_customer_role: isGTf ? null : (f.customer_role || null),
        p_contact_id: f.contact_id || null,
        p_deadline_quote: f.deadline_quote || null,
        p_estimated_value: estVal,
        p_notes: f.notes || null,
        // Putaran 4 Tahap 4C -- enam field Single-Shipment-only DIPAKSA null
        // eksplisit saat Rate Sheet Request ("Jangan dikirim ke RPC"),
        // bukan hanya mengandalkan RPC menormalisasinya server-side (yang
        // juga tetap jadi pengaman kedua, nol perubahan di sana).
        p_incoterms: isRS ? null : (f.incoterms.length ? f.incoterms : null),
        p_container_types: isRS ? null : (f.container_types.length ? f.container_types : null),
        p_goods_name: f.goods_name || null,
        p_hs_code: f.hs_code || null,
        p_weight_kg: weightVal,
        p_volume_cbm: volumeVal,
        p_dimension: f.dimension || null,
        p_cargo_types: f.cargo_types.length ? f.cargo_types : null,
        p_un_number: f.un_number || null,
        p_imo_class: f.imo_class || null,
        p_has_msds: f.has_msds || null,
        p_additional_services: f.additional_services.length ? f.additional_services : null,
        // W-21 -- hilang di UI = hilang di payload juga (pola sama
        // p_container_types RS di atas), bukan sekadar disembunyikan sambil
        // tetap mengirim nilai basi.
        p_pickup_address: isRS || !pickupDeliveryVisible ? null : (f.pickup_address || null),
        p_delivery_address: isRS || !pickupDeliveryVisible ? null : (f.delivery_address || null),
        // Review fix 4 -- hanya dikirim saat kartu duplikat BENAR-BENAR
        // tampil saat ini (possibleDuplicates.length > 0), bukan apa pun
        // yang kebetulan masih ada di field teksnya (bisa basi dari rute
        // sebelumnya -- lihat juga efek yang mengosongkannya di atas).
        p_duplicate_warning_reason: possibleDuplicates.length > 0 ? (f.duplicate_warning_reason || null) : null,
        p_n_containers: isRS ? null : (f.n_containers !== '' ? Number(f.n_containers) : null),
        // W-21 -- nol pengecualian DtD di sini (beda dari pickup/delivery).
        p_cargo_ready_date: isRS || laneTbl ? null : (f.cargo_ready_date || null),
        p_undername_import: undernameActive,
        p_importer_of_record: undernameActive ? (f.importer_of_record || null) : null,
        p_duties_and_taxes: dutiesVisible ? (f.duties_and_taxes || null) : null,
        p_supporting_docs_received: undernameActive ? !!f.supporting_docs_received : false,
        // Putaran 14 (W-41, Scope 2) -- Pricing Basis kini berlaku
        // Door-to-Door ATAU Customs Clearance (`pricingBasisVisible`,
        // didefinisikan di atas) -- PENGECUALIAN SADAR DARI MOCKUP, lihat
        // komentar di definisinya.
        p_pricing_basis: pricingBasisVisible ? (f.pricing_basis || null) : null,
        p_owner_id: canPickOwner ? (f.owner_id || null) : null,
        // Putaran 14 Tahap 3, Task 4 -- GT MEMAKSA 'Single Shipment' di
        // payload juga, bukan hanya lewat `isRS` (celah yang sama: `isRS`
        // di atas sudah benar false untuk GT, tapi baris ini dulu membaca
        // f.inquiry_type MENTAH, memotong jalur isRS sama sekali).
        p_inquiry_type: isGTf ? 'Single Shipment' : f.inquiry_type,
        p_validity_from: isRS ? (f.validity_from || null) : null,
        p_validity_to: isRS ? (f.validity_to || null) : null,
        p_monthly_volume_cbm: monthlyVolumeVal,
        // Putaran 14 (W-10, Scope 1a) -- General Trading TIDAK punya
        // langkah "Route & Terms" sama sekali -- `laneRows` (dihitung di
        // atas dari `f.pol_location_id`/dst, yang utk GT tetap NULL sejak
        // blankF) akan membentuk SATU baris lane ber-POL/POD NULL kalau
        // dibiarkan apa adanya, dan RPC akan menolaknya ("Setiap lane
        // wajib punya Port of Loading dan Port of Discharge") walau
        // syarat minimal-1-lane sendiri sudah dikecualikan utk 'trading'.
        // Dipaksa array kosong eksplisit utk GT.
        p_lanes: isGTf ? [] : laneRows,
        // Putaran 14 (W-60, Scope 3) -- grup "Delivery", HANYA dikirim
        // utk General Trading; selain itu NULL (field-nya pun tidak
        // pernah dirender utk service_type lain).
        p_order_category: isGTf ? (f.order_category || null) : null,
        p_requested_delivery_date: isGTf ? (f.requested_delivery_date || null) : null,
        p_estimated_shipping_cost: shipCostVal,
        p_customer_reference: isGTf ? (f.customer_reference || null) : null,
      };

      const { data, error } = await supabase.rpc('create_inquiry_with_lanes', params).single();
      if (error) throw error;

      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_INQUIRY, entityType: ENTITY_TYPES.INQUIRY, entityId: data?.id || null, entityLabel: data?.inquiry_no,
      }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
      showToast?.('Inquiry created' + (data?.inquiry_no ? ` — ${data.inquiry_no}` : ''));
      onCreated?.(data?.id);
    } catch (err) {
      // Pesan RPC (bahasa Indonesia) ditampilkan APA ADANYA (task 10) — nol
      // pembungkusan ulang, termasuk saat RPC menolak akun Lead Pool.
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Putaran 13b (W-16) -- mockup `nextStep()` menolak pindah step saat
  // Customs Clearance dipilih tanpa akses JCI (svcJciBlocked), TANPA toast
  // baru -- banner "Request Access" yang sudah tampil di step 'svc' itulah
  // yang membuat penolakannya tidak diam-diam (keputusan Den: ikut mockup
  // apa adanya, bukan rekomendasi semula). Pengaman Create (stepErrors)
  // TETAP ada, nol perubahan di sana -- ini cuma menutup jalur "lanjut dulu,
  // ditolak nanti di Review".
  const goNext = () => {
    if (stepKey === 'svc' && svcJciBlocked) return;
    setStep((s) => Math.min(SK.length, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  // D6 — "Clear" mengosongkan SELURUH form (mockup clearPrefill baris 941),
  // bukan hanya menutup banner. Akun/kontak pencarian ikut direset.
  const clearPrefill = () => {
    setF(blankF());
    setPrefillBanner(null);
    setAccountText('');
    setStep(1);
    setErrors({});
  };

  return (
    <div style={{ background: C.pageBg, padding: '8px 8px 40px', borderRadius: 16 }}>
      <div style={S.page}>
        <div style={S.headerCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={S.hTitle}>Inquiry Intake Form</h1>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 560px', minWidth: 0 }}>
        {/* step pills — klik bebas, TANPA validasi (mockup steps[i].go baris
            766 juga tidak memvalidasi navigasi pill). */}
        <div style={S.pillBar}>
          {SK.map((k, i) => (
            <button key={k} type="button" onClick={() => setStep(i + 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5,
                border: '1px solid ' + (i + 1 === stepIdx ? C.navy : C.border), background: i + 1 === stepIdx ? C.navySoft : C.card, color: C.text,
              }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i + 1 === stepIdx ? C.orange : C.headBg, color: C.text, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600 }}>{i + 1}</span>
              {STEP_LABEL[k]}
            </button>
          ))}
        </div>

        {/* Banner prefill generik (D6) — "Visit Prefill" (D5) tidak dibangun. */}
        {prefillBanner && (
          <div style={{ margin: '0 0 16px', padding: '8px 12px', background: C.headBg, border: '1px solid ' + C.border, borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: C.text }}>
            <AlertTriangle size={14} color={C.sub} style={{ flex: '0 0 14px' }} />
            <span style={{ flex: 1 }}>{prefillBanner.text}</span>
            <button type="button" onClick={clearPrefill} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 700, color: C.text }}>Clear</button>
          </div>
        )}

        <section style={S.card}>
          <div style={S.secBody}>

            <h3 style={S.stepHeading}>{stepIdx}. {STEP_LABEL[stepKey]}</h3>

            {stepKey === 'cust' && (
              <div style={{ display: 'grid', gap: 18 }}>
                {/* Putaran 4 Tahap 4C -- toggle "Inquiry Type", posisi step 1
                    SEBELUM field lain (mockup Inquiry Management.dc.html
                    baris 51). Style tombol IDENTIK toggle "Sumber" di bawah
                    (navy aktif/putih tak aktif) -- bukan komponen baru.
                    switchInquiryType HANYA mengubah inquiry_type + men-seed
                    1 lane kosong kalau Rate Sheet Request dipilih dan lanes
                    masih kosong -- field Single Shipment lain (incoterms,
                    container_types, dst.) TIDAK dikosongkan (toggle balik
                    tidak kehilangan isian, R1). */}
                <Field label="Inquiry Type" span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['Single Shipment', 'Rate Sheet Request'].map((t) => (
                      <button key={t} type="button" onClick={() => switchInquiryType(t)}
                        style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", border: '1px solid ' + (f.inquiry_type === t ? C.navy : C.border), background: f.inquiry_type === t ? C.navySoft : C.card, color: C.text }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: C.sub, marginTop: 6, display: 'block' }}>
                    {isRS
                      ? 'The customer asks for rates on many lanes for a period. One Rate Sheet quotation follows, and shipments are created later under it.'
                      : 'One shipment, priced once. Add a route option if the customer wants to compare routes.'}
                  </span>
                </Field>
                {/* D1 -- toggle "Sumber" (Prospect/Customer) DICABUT. Mockup
                    (baris 52-56) cuma punya SATU field "Customer" -- hasilnya
                    gabungan prospect+customer dengan badge stage (AccountPicker
                    sudah mendukung `lifecycle_stage` apa adanya). */}
                <div style={grid2}>
                  <Field label="Customer" required>
                    {/* Putaran 14 (W-10, Scope 1, kasus tepi) -- ganti akun
                        TIDAK boleh meninggalkan service_type='trading'
                        tertinggal kalau akun barunya bukan SOA (kartu GT
                        akan hilang dari daftar serviceTypeOpts, tapi
                        service_type di state masih 'trading' kalau tidak
                        direset di sini). onChangeText (akun dikosongkan
                        total) SELALU reset kalau sedang GT -- tanpa akun,
                        GT pasti tidak valid. onPick (akun BARU dipilih)
                        hanya reset kalau akun baru BUKAN SOA -- pindah ke
                        akun SOA lain sambil GT terpilih TETAP valid, tidak
                        direset (pola "sebaliknya" di instruksi). Field
                        turunan GT (direction/customer_role) SENGAJA TIDAK
                        ikut direset -- pola sama field tersembunyi lain di
                        file ini (pickup_address dkk, W-21): nilainya
                        harmless sampai dikirim ulang, dan payload sudah
                        menolkannya sendiri kalau service_type bukan lagi
                        'trading'. */}
                    <AccountPicker value={accountText} accounts={accounts} statusLabel={lifecycleLabel} inputStyle={S.input} placeholder="Search account name or account code…"
                      onChangeText={(v) => {
                        setAccountText(v);
                        setF((x) => ({ ...x, account_id: '', contact_id: '', service_type: x.service_type === 'trading' ? '' : x.service_type }));
                      }}
                      onPick={(a) => {
                        setAccountText(a.name);
                        setF((x) => ({
                          ...x, account_id: a.id, contact_id: '',
                          service_type: (x.service_type === 'trading' && a.company_id !== SOA_ID) ? '' : x.service_type,
                        }));
                        setAddingContact(false);
                      }} />
                    <FieldError>{errors.cust_account}</FieldError>
                  </Field>
                  {/* Entity (D2) -- read-only, SELALU entitas AKUN terpilih
                      (lihat komentar panjang di dekat `entityCode` soal
                      deviasi dari override mockup utk Customs Clearance). */}
                  <Field label="Entity" hint="Read-only, from the account's company.">
                    <div style={{ ...S.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.disabledBg, color: C.muted }}>
                      <span>{entityCode}</span>
                      <Lock size={14} />
                    </div>
                  </Field>
                </div>
                <div style={grid2}>
                  <Field label="Source" hint="Read-only, from the account record.">
                    <div style={{ ...S.input, display: 'flex', alignItems: 'center', background: C.pageBg, color: accountSource ? C.text : C.muted, fontStyle: accountSource ? 'normal' : 'italic' }}>
                      {accountSource || 'Not set'}
                    </div>
                  </Field>
                </div>
                {resolvedAccountId && (
                  <div style={grid2}>
                    <Field label="Contact" required>
                      {!contactsLoaded ? (
                        <span style={{ fontSize: 12, color: C.muted, display: 'block', paddingTop: 6 }}>Loading contacts…</span>
                      ) : addingContact ? null : contacts.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 12, color: C.sub }}>This account has no contacts yet.</span>
                          <button type="button" onClick={() => setAddingContact(true)} style={{ ...S.btnGhost, height: 36, alignSelf: 'flex-start' }}><Plus size={14} />Add new contact</button>
                        </div>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <select value={f.contact_id} onChange={(e) => { if (e.target.value === '__add') { setAddingContact(true); return; } setF((x) => ({ ...x, contact_id: e.target.value })); }} style={selInput}>
                            <option value="">— Select contact —</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}{c.position ? ` — ${c.position}` : ''}{c.is_primary ? ' (Primary)' : ''}{c.is_active === false ? ' (Inactive)' : ''}</option>
                            ))}
                            <option value="__add">Add new contact</option>
                          </select><Chevron />
                        </div>
                      )}
                      <FieldError>{errors.cust_contact}</FieldError>
                    </Field>
                    {/* D3 -- "Add new contact" inline, Name wajib + Position/
                        Email/Phone opsional. Jalur simpan: handleSaveNewContact. */}
                    {contactsLoaded && addingContact && (
                      <div style={{ gridColumn: '1 / -1', border: '1px dashed ' + C.border, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={grid2}>
                          <Field label="Name" required>
                            <input value={newContact.name} onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))} style={S.input} autoFocus />
                          </Field>
                          <Field label="Position">
                            <input value={newContact.position} onChange={(e) => setNewContact((c) => ({ ...c, position: e.target.value }))} style={S.input} />
                          </Field>
                        </div>
                        <div style={grid2}>
                          <Field label="Email">
                            <input type="email" value={newContact.email} onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))} style={S.input} />
                          </Field>
                          <Field label="Phone">
                            <input value={newContact.phone} onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))} style={S.input} />
                          </Field>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                          <button type="button" style={S.btnGhost} onClick={() => { setAddingContact(false); setNewContact({ name: '', position: '', email: '', phone: '' }); }}>Cancel</button>
                          <button type="button" style={{ ...S.btnPrimary, opacity: savingContact || !newContact.name.trim() ? 0.6 : 1, cursor: savingContact || !newContact.name.trim() ? 'not-allowed' : 'pointer' }}
                            disabled={savingContact || !newContact.name.trim()} onClick={handleSaveNewContact}>
                            {savingContact ? 'Saving…' : 'Add Contact'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {stepKey === 'svc' && (
              <div style={{ display: 'grid', gap: 20 }}>
                <Field label="Service Type" required span>
                  {/* [Putaran 16 Tahap 5] bukan grid3 (3 kolom tetap) -- diukur mockup:
                      `grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px`. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
                    {serviceTypeOpts.map((o) => (
                      <ServiceCard key={o.value} icon={SERVICE_ICON[o.value]} label={o.label} active={f.service_type === o.value}
                        onClick={() => setF((x) => ({
                          ...x,
                          service_type: o.value,
                          // Putaran 14 (W-10, Scope 1) -- mockup `og.svc.gt.go`:
                          // memilih General Trading menimpa Direction jadi
                          // 'Domestic' KECUALI sudah 'Import'. Nol dampak ke
                          // service_type lain.
                          ...(o.value === 'trading' && x.direction !== 'Import' ? { direction: 'Domestic' } : {}),
                        }))} />
                    ))}
                  </div>
                  {/* Hint JCI, Door-to-Door (mockup baris 61) -- customs fulfilled
                      by JCI dalam paket, TANPA mengubah entitas inquiry. */}
                  {isDoorToDoor && (
                    <span style={{ fontSize: 12, color: C.muted, marginTop: 6, display: 'block' }}>Customs clearance in this package is fulfilled by JCI.</span>
                  )}
                  {/* Banner blokir akses JCI (D2, mockup baris 62) -- Customs
                      Clearance STANDALONE adalah lini JCI; tanpa akses JCI,
                      diblokir + "Request Access" (D2(b): teks JUJUR, BUKAN
                      klaim "terkirim" seperti mockup -- nol RPC notifikasi
                      nyata hari ini, dicatat sbg butir terbuka di laporan). */}
                  {svcJciBlocked && (
                    <div style={{ marginTop: 10, padding: '12px 16px', background: C.warningBg, border: '1px solid ' + C.warningBorder, borderRadius: 10, display: 'flex', gap: 12, alignItems: 'center', color: C.warning, fontSize: 13 }}>
                      <AlertTriangle size={16} color={C.warning} style={{ flex: '0 0 16px' }} />
                      <span style={{ flex: 1 }}>Customs Clearance is a JCI service line. Ask your manager to request JCI sales access for your account to continue.</span>
                      <button type="button" onClick={requestJciAccess} style={{ height: 32, padding: '0 12px', borderRadius: 10, background: 'transparent', border: '1px solid ' + C.warning, color: C.warning, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>Request Access</button>
                    </div>
                  )}
                  <FieldError>{errors.svc_service_type}</FieldError>
                  <FieldError>{errors.svc_jci}</FieldError>
                </Field>

                <Field label="Direction" required span>
                  <div style={grid3}>
                    {/* Putaran 14 (W-10, Scope 1) -- mockup `og.dir.ex.disp`:
                        Export DISEMBUNYIKAN utk General Trading (GT hanya
                        Domestic/Import). */}
                    {DIRECTION_OPTS.filter((d) => !(isGTf && d === 'Export')).map((d) => <Pill key={d} active={f.direction === d} onClick={() => pickDirection(d)}>{d}</Pill>)}
                  </div>
                  <FieldError>{errors.svc_direction}</FieldError>
                </Field>

                {/* Putaran 13b (W-14) -- mockup `crShow`: tampil HANYA setelah
                    Service Type dipilih dan bukan General Trading. */}
                {!!f.service_type && !isGTf && (
                  <Field label="Customer Role" required span
                    hint="Who is our customer in this shipment? Full shipper and consignee details are filled in the Shipment Instruction or Job Order.">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {CUSTOMER_ROLE_OPTS.map((r) => <Pill key={r} active={f.customer_role === r} onClick={() => setF((x) => ({ ...x, customer_role: r }))}>{r}</Pill>)}
                    </div>
                    <FieldError>{errors.svc_customer_role}</FieldError>
                  </Field>
                )}

                {/* Putaran 14 (W-41, Scope 2/3) -- Pricing Basis utk Customs
                    Clearance standalone, TANPA syarat Direction. LIHAT
                    komentar `pricingBasisVisible` di atas: PENGECUALIAN SADAR
                    DARI MOCKUP -- mockup tidak punya UI ini sama sekali utk
                    Customs Clearance berdiri sendiri (hanya Door-to-Door,
                    langkah "customs" di bawah). Dirender di blok inline yang
                    sama dengan Duties & Taxes/Undername krn Customs Clearance
                    tidak punya langkah tersendiri. Default malas "Itemized
                    charges" (W-64) diisi efek terpisah di atas. */}
                {f.service_type === 'customs' && (
                  <Field label="Pricing Basis">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {PRICING_BASIS_OPTS.map((p) => <Pill key={p} active={f.pricing_basis === p} onClick={() => setF((x) => ({ ...x, pricing_basis: p }))}>{p}</Pill>)}
                    </div>
                  </Field>
                )}

                {/* Undername — Customs Clearance, inline (mockup baris 63-67).
                    Door-to-Door punya versi sendiri di langkah "customs" di bawah. */}
                {f.service_type === 'customs' && f.direction === 'Import' && (
                  <UndernamePanel f={f} setF={setF} errors={errors} iorOpts={iorOpts} />
                )}
              </div>
            )}

            {stepKey === 'route' && (
              <div style={{ display: 'grid', gap: 20 }}>
                {!laneTbl ? (
                  <>
                    <div style={grid2}>
                      <div style={{ minWidth: 0 }}>
                        <div style={S.label}>Port of Loading <span style={S.req}>*</span></div>
                        <LocationPicker value={f.pol_location_id} textValue={f.pol} options={locations} tokens={LOCATION_PICKER_TOKENS}
                          placeholder="Select port of loading…"
                          onChange={(id, loc) => setF((x) => ({ ...x, pol_location_id: id, pol: loc.name }))}
                          onManage={canManageLocations ? openLocationMaster : undefined}
                          onRequest={canManageLocations ? undefined : requestNewLocation} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={S.label}>Port of Discharge or City <span style={S.req}>*</span></div>
                        <LocationPicker value={f.pod_location_id} textValue={f.pod} options={locations} tokens={LOCATION_PICKER_TOKENS}
                          placeholder="Select port of discharge or city…"
                          onChange={(id, loc) => setF((x) => ({ ...x, pod_location_id: id, pod: loc.name }))}
                          onManage={canManageLocations ? openLocationMaster : undefined}
                          onRequest={canManageLocations ? undefined : requestNewLocation} />
                      </div>
                    </div>
                    {/* D4 -- Via port kondisional, HANYA saat POD type='City' (inland). */}
                    {podIsInland && (
                      <div style={{ minWidth: 0 }}>
                        <div style={S.label}>Via port</div>
                        <LocationPicker value={f.via_location_id} textValue={f.via} options={locations} tokens={LOCATION_PICKER_TOKENS}
                          placeholder="Optional"
                          onChange={(id, loc) => setF((x) => ({ ...x, via_location_id: id, via: loc.name }))}
                          onManage={canManageLocations ? openLocationMaster : undefined}
                          onRequest={canManageLocations ? undefined : requestNewLocation} />
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {/* [Putaran 16 Tahap 5] tombol kecil, diukur mockup terpisah dari
                          S.btnGhost footer: height 32, padding '0 12px', fontSize 13. */}
                      <button type="button" onClick={startLanes} style={{ ...S.btnGhost, height: 32, padding: '0 12px', fontSize: 13 }}><Plus size={15} />Add route option</button>
                      <span style={{ fontSize: 12, color: C.sub }}>Add a second route when the customer wants to compare routes for the same shipment.</span>
                    </div>
                  </>
                ) : (
                  <LaneTable
                    lanes={f.lanes} locations={locations} laneModeOpts={laneModeOpts} laneUnitOpts={laneUnitOpts} tokens={LOCATION_PICKER_TOKENS}
                    canManageLocations={canManageLocations} openLocationMaster={openLocationMaster} requestNewLocation={requestNewLocation}
                    onUpdate={updateLane} onRemove={removeLane} onAdd={addLane}
                    showUseColumn={isRS} onToggleUse={isRS ? toggleLaneUse : undefined}
                  />
                )}
                <FieldError>{errors.route_lanes}</FieldError>

                {/* Putaran 4 Tahap 4C -- Validity Requested + Estimated Volume
                    per Month, HANYA Rate Sheet Request (mockup baris 119-126,
                    label persis). Volume lewat pola TD-285 (handleMonthlyVolumeChange/
                    Blur) -- type="text", bukan type="number". */}
                {isRS && (
                  <div style={grid3}>
                    <Field label="Validity Requested From" required>
                      <input type="date" value={f.validity_from} onChange={set('validity_from')} style={S.input} />
                    </Field>
                    <Field label="Validity Requested Until" required>
                      <input type="date" value={f.validity_to} onChange={set('validity_to')} style={S.input} />
                      <FieldError>{errors.route_validity}</FieldError>
                    </Field>
                    <Field label="Estimated Volume per Month (CBM)" required>
                      <input value={f.monthly_volume_cbm} onChange={(e) => handleMonthlyVolumeChange(e.target.value)} onBlur={handleMonthlyVolumeBlur}
                        inputMode="decimal" style={S.input} placeholder="e.g. 20" />
                      <FieldError>{errors.route_volume}</FieldError>
                    </Field>
                  </div>
                )}

                {/* Putaran 12 Butir 4 -- banner Rate Sheet duplikat (read-only,
                    non-blocking: tanpa field alasan, tidak menghalangi Next/
                    Submit -- lihat guard `!isRS` di stepErrors). Pakai ulang
                    shell/style banner duplikat Single Shipment di bawah,
                    hanya isi dan gerbang `isRS` yang berbeda. */}
                {isRS && !dupCheckLoading && possibleDuplicates.length > 0 && (
                  <div style={{ background: C.warningBg, border: '1px solid ' + C.warningBorder, borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <AlertTriangle size={18} color={C.warning} style={{ flex: '0 0 18px', marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: C.warning }}>
                          Possible duplicate Rate Sheet
                        </div>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                          {possibleDuplicates.slice(0, 3).map((d) => (
                            <li key={d.id} style={{ fontSize: 12.5, color: C.warning }}>
                              <button type="button" onClick={() => navigate(`${MENU_PATHS['crm-inquiry']}/${d.id}`)}
                                style={{ fontFamily: "'IBM Plex Mono',monospace", color: C.warning, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit' }}>
                                {d.inquiry_no}
                              </button>
                              {` covers this account and lane for ${d.validity_from} to ${d.validity_to}.`}
                            </li>
                          ))}
                          {possibleDuplicates.length > 3 && (
                            <li style={{ fontSize: 12.5, color: C.warning }}>and {possibleDuplicates.length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {isRS && dupCheckLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 12.5 }}><Loader2 size={14} className="animate-spin" />Checking for possible duplicates…</div>
                )}

                {/* Putaran 4 Tahap 4C -- enam field ini SEBELUMNYA dirender
                    TANPA SYARAT (sibling dari ternary POL/POD-vs-LaneTable di
                    atas, bukan bagian darinya) -- `laneTbl` TIDAK pernah
                    menyembunyikannya utk Single Shipment multi-route, jadi
                    guard `!isRS` di sini BARU, bukan penyesuaian laneMode→
                    laneTbl. State-nya TETAP (R1) -- hanya tampilannya
                    disembunyikan. */}
                {!isRS && (
                  <>
                    {/* W-21 -- disembunyikan begitu laneTbl aktif, KECUALI
                        Door-to-Door (pickupDeliveryVisible, lihat komentar
                        definisinya di atas). */}
                    {pickupDeliveryVisible && (
                      <div style={grid2}>
                        <div style={{ minWidth: 0 }}>
                          <div style={S.label}>Pickup Address{isDoorToDoor && <span style={S.req}> *</span>}</div>
                          <textarea value={f.pickup_address} onChange={set('pickup_address')} rows={2} style={S.textarea} placeholder="Cargo pickup address…" />
                          <FieldError>{errors.route_pickup}</FieldError>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={S.label}>Delivery Address{isDoorToDoor && <span style={S.req}> *</span>}</div>
                          <textarea value={f.delivery_address} onChange={set('delivery_address')} rows={2} style={S.textarea} placeholder="Cargo delivery address…" />
                          <FieldError>{errors.route_delivery}</FieldError>
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={S.label}>Incoterms</div>
                      <div style={grid3}>{INCOTERMS.map((t) => <Pill key={t} variant="chip" active={f.incoterms.includes(t)} onClick={() => toggleArr('incoterms', t)}>{t}</Pill>)}</div>
                    </div>
                    <div>
                      <div style={S.label}>Container Type</div>
                      <div style={grid2}>{CONTAINER_TYPES.map((t) => <Pill key={t} variant="chip" active={f.container_types.includes(t)} onClick={() => toggleArr('container_types', t)}>{t}</Pill>)}</div>
                    </div>
                    <div style={grid2}>
                      <Field label="Number of containers" required={needsNContainers} hint={needsNContainers ? 'Required when an FCL container type is selected.' : undefined}>
                        <input value={f.n_containers} onChange={handleNContainersChange} inputMode="numeric" style={S.input} placeholder="0" />
                        <FieldError>{errors.route_ncont}</FieldError>
                      </Field>
                      {/* W-21 -- Cargo ready date hilang utk SEMUA service type
                          saat laneTbl aktif, nol pengecualian DtD (beda dari
                          Pickup/Delivery di atas). */}
                      {!laneTbl && (
                        <Field label="Cargo ready date">
                          <input type="date" value={f.cargo_ready_date} onChange={set('cargo_ready_date')} style={S.input} />
                        </Field>
                      )}
                    </div>
                  </>
                )}

                {/* REVISI 1 -- cek duplikat TIDAK PERNAH jalan untuk Rate
                    Sheet Request (Keputusan Q1); effect pemicunya sudah
                    bailout duluan (isRS di dependency), guard `!isRS` di sini
                    adalah lapis kedua supaya banner tak mungkin tampil kalau
                    state possibleDuplicates kebetulan basi dari toggle. */}
                {!isRS && !dupCheckLoading && possibleDuplicates.length > 0 && (
                  <div style={{ background: C.warningBg, border: '1px solid ' + C.warningBorder, borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <AlertTriangle size={18} color={C.warning} style={{ flex: '0 0 18px', marginTop: 1 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: C.warning }}>
                          Possible duplicate{possibleDuplicates.length > 1 ? 's' : ''} found
                        </div>
                        <div style={{ fontSize: 12.5, color: C.warning, marginTop: 4 }}>Same account, same route, created in the last 30 days:</div>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                          {possibleDuplicates.map((d) => (
                            <li key={d.id} style={{ fontSize: 12.5, color: C.warning, fontFamily: "'IBM Plex Mono',monospace" }}>
                              {d.inquiry_no} — {new Date(d.created_at).toLocaleDateString('en-GB')}{d.owner_name ? ` (${d.owner_name})` : ''}
                            </li>
                          ))}
                        </ul>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ ...S.label, color: C.warning }}>Reason to continue as a separate shipment</div>
                          <textarea value={f.duplicate_warning_reason} onChange={set('duplicate_warning_reason')} rows={2}
                            style={{ ...S.textarea, borderColor: errors.route_dup ? C.error : C.warningBorder }}
                            placeholder="Explain why this is a separate shipment…" />
                          <FieldError>{errors.route_dup}</FieldError>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {!isRS && dupCheckLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 12.5 }}><Loader2 size={14} className="animate-spin" />Checking for possible duplicates…</div>
                )}
              </div>
            )}

            {stepKey === 'cargo' && (
              <div style={{ display: 'grid', gap: 20 }}>
                <div style={grid2}>
                  <Field label="Item Name (EN)"><input value={f.goods_name} onChange={set('goods_name')} style={S.input} placeholder="e.g. Industrial Machinery" /></Field>
                  <Field label="HS Code"><input value={f.hs_code} onChange={set('hs_code')} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="0000.00.00" /></Field>
                </div>
                <div style={grid2}>
                  <Field label="Total Weight">
                    <div style={{ position: 'relative' }}>
                      <input value={f.weight_kg} onChange={(e) => handleWeightChange(e.target.value)} onBlur={handleWeightBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingRight: 56 }} placeholder="0" />
                      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>KG</span>
                    </div>
                    {weightUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                  </Field>
                  <Field label="Volume">
                    <div style={{ position: 'relative' }}>
                      <input value={f.volume_cbm} onChange={(e) => handleVolumeChange(e.target.value)} onBlur={handleVolumeBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingRight: 56 }} placeholder="0" />
                      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>CBM</span>
                    </div>
                    {volumeUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                  </Field>
                </div>
                <div style={grid2}>
                  <Field label="Dimensi (P x L x T)"><input value={f.dimension} onChange={set('dimension')} style={S.input} placeholder="cth: 120 x 80 x 100 cm" /></Field>
                </div>
                <div>
                  {/* [Tahap 0, GAGAL ditutup] label field mockup SELALU C.sub
                      (#5C6B52) -- "Cargo Category" nol padanan literal di
                      mockup, tapi seluruh label sejenis (Service Type/Cargo
                      Type/Customer Role/dst.) konsisten C.sub, bukan C.text. */}
                  <div style={{ ...S.label, color: C.sub }}>Cargo Category</div>
                  <div style={grid2}>{CARGO_TYPES.map((c) => <CargoCard key={c.id} item={c} active={f.cargo_types.includes(c.id)} onClick={() => toggleArr('cargo_types', c.id)} />)}</div>
                </div>
                {dgSelected && (
                  /* [Tahap 0, GAGAL ditutup] kotak ini PERSIS
                     data-screen-label="Intake/DangerousGoods" mockup:
                     background:#F8ECCF;border:1px solid #E6CE94 UNIFORM di
                     keempat sisi -- bukan C.card + aksen kiri C.orange yang
                     dipasang Prompt A. Heading+ikon ikut C.warning supaya
                     senada dengan latar warn, bukan INK/navy (mockup sendiri
                     tak punya heading ini, jadi dipilih yang paling koheren). */
                  <div style={{ border: '1px solid ' + C.warningBorder, borderRadius: 12, background: C.warningBg, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <AlertTriangle size={16} color={C.warning} /><span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: C.warning }}>Detail Dangerous Goods</span>
                    </div>
                    <div style={{ ...grid2, marginBottom: 18 }}>
                      <Field label="UN Number"><input value={f.un_number} onChange={(e) => setF((x) => ({ ...x, un_number: e.target.value.replace(/\D/g, '') }))} style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="0000" /></Field>
                      <Field label="IMO Class">
                        <div style={{ position: 'relative' }}>
                          <select value={f.imo_class} onChange={set('imo_class')} style={selInput}>
                            <option value="">— Select IMO Class —</option>
                            {IMO_CLASSES.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select><Chevron />
                        </div>
                      </Field>
                    </div>
                    <div style={S.label}>MSDS Available?</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {MSDS_OPTS.map((o) => <RadioPill key={o} value={o} current={f.has_msds} onClick={() => setF((x) => ({ ...x, has_msds: o }))}>{o}</RadioPill>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {stepKey === 'addl' && (
              <div>
                <div style={S.label}>Additional Services</div>
                {/* [Putaran 16 Tahap 5] bukan grid3 (dipakai kartu ikon ServiceCard/
                    CargoCard) -- diukur mockup: `display:flex;gap:8px;flex-wrap:wrap`. */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SERVICES.map((s) => <TagCard key={s.id} item={s} active={f.additional_services.includes(s.id)} onClick={() => toggleArr('additional_services', s.id)} />)}</div>
              </div>
            )}

            {/* Putaran 14 (W-60, Scope 3) -- langkah "Delivery", HANYA utk
                General Trading (SK: cust/svc/delivery/commercial/review).
                4 field, mockup baris 93 (Order Category)/94 (Requested
                Delivery Date)/100 (Estimated Shipping Cost)/101 (Customer
                Reference) -- nol field wajib (absen dari objek req mockup
                baris 759). Delivery Destinations (mockup baris 95, multi-DC)
                SENGAJA TIDAK dibangun -- ditunda ke batch Sales Order. */}
            {stepKey === 'delivery' && (
              <div style={grid2}>
                <Field label="Order Category">
                  <div style={{ position: 'relative' }}>
                    <select value={f.order_category} onChange={set('order_category')} style={selInput}>
                      <option value="">Select order category</option>
                      {ORDER_CATEGORY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select><Chevron />
                  </div>
                </Field>
                <Field label="Requested Delivery Date">
                  <input type="date" value={f.requested_delivery_date} onChange={set('requested_delivery_date')} style={S.input} />
                </Field>
                <Field label="Estimated Shipping Cost" hint="Optional">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>Rp</span>
                    <input value={f.estimated_shipping_cost} onChange={(e) => handleShipCostChange(e.target.value)} onBlur={handleShipCostBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingLeft: 38 }} placeholder="0" />
                  </div>
                  {shipCostUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                </Field>
                <Field label="Customer Reference" hint="Optional">
                  <input value={f.customer_reference} onChange={set('customer_reference')} style={S.input} placeholder="PO or SP number" />
                </Field>
              </div>
            )}

            {stepKey === 'customs' && (
              <div style={{ display: 'grid', gap: 20 }}>
                <Field label="Pricing Basis">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PRICING_BASIS_OPTS.map((p) => <Pill key={p} active={f.pricing_basis === p} onClick={() => setF((x) => ({ ...x, pricing_basis: p }))}>{p}</Pill>)}
                  </div>
                </Field>
                {/* Putaran 13b (W-33) -- mockup merender Duties & Taxes
                    MANDIRI di sini, SELALU tampil utk Door-to-Door apa pun
                    Direction-nya dan terlepas dari checkbox Undername --
                    bukan hanya di dalam panel Undername (itu sebabnya field
                    ini sebelumnya absen total utk Export/Domestic DAN utk
                    Import yang belum mencentang Undername). Dirender SEKALI
                    di sini (hideDuties pada UndernamePanel di bawah mencegah
                    duplikat mockup-nya sendiri -- "bug prototipe" yang
                    sengaja tidak ditiru, lihat komentar UndernamePanel). */}
                <Field label="Duties & Taxes">
                  <div style={{ position: 'relative' }}>
                    <select value={f.duties_and_taxes} onChange={(e) => setF((x) => ({ ...x, duties_and_taxes: e.target.value }))} style={selInput}>
                      {DUTIES_AND_TAXES_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select><Chevron />
                  </div>
                </Field>
                {f.direction === 'Import' ? (
                  <UndernamePanel f={f} setF={setF} errors={errors} iorOpts={iorOpts} hideDuties />
                ) : (
                  /* W-34 */
                  <span style={{ fontSize: 12, color: C.muted }}>Undername applies to import shipments only.</span>
                )}
              </div>
            )}

            {stepKey === 'commercial' && (
              <div style={grid2}>
                <Field label="Deadline Quote"><input type="date" value={f.deadline_quote} onChange={set('deadline_quote')} style={S.input} /></Field>
                <Field label="Estimated (intake)" hint="Leave empty if unknown.">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 12, fontWeight: 600, color: C.muted }}>Rp</span>
                    <input value={f.estimated_value} onChange={(e) => handleEstValChange(e.target.value)} onBlur={handleEstValBlur} inputMode="decimal" style={{ ...S.input, fontFamily: "'IBM Plex Mono',monospace", paddingLeft: 38 }} placeholder="0" />
                  </div>
                  {estValUnrecognized && <FieldError>Angka tidak dikenali</FieldError>}
                </Field>
                {/* Putaran 13b (W-40) -- blok statis mockup, murni teks (nol
                    RPC/data -- inquiry ini belum ada sampai Create ditekan,
                    jadi quotation memang belum mungkin ada). "Suggested
                    estimate" (W-39, komparabel dari quotation diterima)
                    SENGAJA TIDAK dibangun -- butuh RPC baru, dilimpahkan. */}
                <div style={{ gridColumn: '1 / -1', border: '1px solid ' + C.border, borderRadius: 10, background: C.card, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>Latest quoted value</span>
                  <span style={{ fontSize: 12.5, color: C.muted }}>No quotation yet. It shows here and on the inquiry once a quotation exists.</span>
                </div>
                {canPickOwner ? (
                  <Field label="Owner">
                    <div style={{ position: 'relative' }}>
                      <select value={f.owner_id || ''} onChange={(e) => { setOwnerTouched(true); setF((x) => ({ ...x, owner_id: e.target.value || null })); }} style={selInput}>
                        <option value="">Leave unassigned</option>
                        {roster.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                      </select><Chevron />
                    </div>
                  </Field>
                ) : (
                  <Field label="Owner">
                    <div style={{ ...S.input, display: 'flex', alignItems: 'center', background: C.pageBg, color: C.sub }}>{profile?.full_name || user?.email || '—'}</div>
                  </Field>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={S.label}>Notes</div>
                  <textarea value={f.notes} onChange={set('notes')} rows={3} style={S.textarea} placeholder="Anything the pricing team should know" />
                </div>
              </div>
            )}

            {stepKey === 'review' && (
              <ReviewStep f={f} accountText={accountText} contacts={contacts} isDoorToDoor={isDoorToDoor} isGTf={isGTf} isRS={isRS}
                serviceTypeOpts={serviceTypeOpts} roster={roster} accountSource={accountSource} entityCode={entityCode} needsNContainers={needsNContainers}
                onEditStep={(key) => { const idx = SK.indexOf(key); if (idx >= 0) setStep(idx + 1); }} />
            )}

          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
          <button type="button" style={S.btnGhost} onClick={onBack}><X size={16} />Cancel</button>
          <span style={{ flex: 1 }} />
          {stepIdx > 1 && <button type="button" style={S.btnGhost} onClick={goPrev}><ChevronLeft size={16} />Back</button>}
          {stepIdx < SK.length && <button type="button" style={S.btnPrimary} onClick={goNext}>Next<ChevronRight size={16} /></button>}
          {stepIdx === SK.length && (
            <button type="button" style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Inquiry'}
            </button>
          )}
        </div>
        </div>

        <RecentInquiriesAside items={recentInquiries} onOpen={(id) => navigate(`${MENU_PATHS['crm-inquiry']}/${id}`)} />
        </div>
      </div>
    </div>
  );
}

// ── Undername cluster — mockup baris 63-67 (Customs Clearance inline) /
// 68-75 (Door-to-Door, di dalam langkah "Customs & Undername"). Mockup
// merender Duties & Taxes DUA KALI untuk Door-to-Door (binding identik,
// bug prototipe) — SENGAJA TIDAK ditiru di sini: field ini dirender SEKALI,
// di dalam panel bersyarat Undername saja (deviasi, dicatat di laporan). ──
// `hideDuties` (Putaran 13b, W-33) -- dipakai saat panel ini dipanggil dari
// step 'customs' (Door-to-Door), yang SUDAH merender Duties & Taxes mandiri
// di atas panel ini (selalu tampil, lepas dari checkbox) -- mencegah
// duplikat render field yang sama. Dipanggil TANPA prop ini dari step 'svc'
// (Customs Clearance standalone), yang sama sekali tidak punya field Duties
// & Taxes mandiri -- di sana field itu TETAP di dalam panel, gated checkbox.
function UndernamePanel({ f, setF, errors, iorOpts, hideDuties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, background: C.warningBg, border: '1px solid ' + C.warningBorder, borderRadius: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: C.text }}>
        <input type="checkbox" checked={f.undername_import} onChange={(e) => setF((x) => ({
          ...x,
          undername_import: e.target.checked,
          // Review fix 1 -- mockup blankF.duties (baris 557) = 'Included in
          // price', dan select-nya TANPA opsi kosong (baris 66/73) -- begitu
          // Undername dicentang, state HARUS ikut diset ke default yang sama
          // dengan apa yang langsung TAMPIL (opsi pertama <select>), supaya
          // "yang terlihat = yang terkirim". Tidak menimpa pilihan user yang
          // sudah ada (toggle off lalu on lagi).
          duties_and_taxes: e.target.checked && !x.duties_and_taxes ? DUTIES_AND_TAXES_OPTS[0] : x.duties_and_taxes,
        }))} />
        Undername import
      </label>
      {f.undername_import && (
        <div style={grid2}>
          <Field label="Importer of Record" required>
            <div style={{ position: 'relative' }}>
              <select value={f.importer_of_record} onChange={(e) => setF((x) => ({ ...x, importer_of_record: e.target.value }))} style={selInput}>
                <option value="">Select an approved partner</option>
                {iorOpts.map((o) => <option key={o.value} value={o.value}>{o.label} (approved partner)</option>)}
              </select><Chevron />
            </div>
            <FieldError>{errors.under_ior}</FieldError>
          </Field>
          {!hideDuties && (
            <Field label="Duties & Taxes">
              <div style={{ position: 'relative' }}>
                <select value={f.duties_and_taxes} onChange={(e) => setF((x) => ({ ...x, duties_and_taxes: e.target.value }))} style={selInput}>
                  {DUTIES_AND_TAXES_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select><Chevron />
              </div>
              <FieldError>{errors.under_duties}</FieldError>
            </Field>
          )}
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={f.supporting_docs_received} onChange={(e) => setF((x) => ({ ...x, supporting_docs_received: e.target.checked }))} />
            Supporting documents from the customer have been received. <span style={S.req}>*</span>
          </label>
          <FieldError>{errors.under_docs}</FieldError>
        </div>
      )}
    </div>
  );
}

// Ronde "Lane Editor" -- LaneTable diekstrak ke src/kit/LaneTable.jsx
// (unitForMode/deriveLaneMode ke src/kit/laneUtils.js), dipakai ulang
// bersama DealDetailPage.jsx section "Route Options" -- bukan lagi
// didefinisikan lokal di sini.

// ── Review — ringkasan sederhana per langkah, cukup setia dengan mockup
// (field + value/"Not set", required-but-missing ditandai) tanpa menyalin
// mekanisme grup dinamis mockup-nya byte-per-byte. ──────────────────────
function ReviewRow({ label, value, required }) {
  const missing = required && !value;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, marginBottom: 3 }}>{label}</div>
      {missing ? (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.error }}>Required</span>
      ) : (
        <span style={{ fontSize: 13.5, color: value ? C.text : C.muted, fontStyle: value ? 'normal' : 'italic' }}>{value || 'Not set'}</span>
      )}
    </div>
  );
}
// Putaran 13b (W-44) -- mockup: setiap grup Review punya link "Edit" yang
// lompat ke step terkait (`review.edit`, baris 793 mockup). `onEditStep`
// menerima stepKey ('cust'/'svc'/dst), komponen induk yang memetakannya ke
// indeks SK (lihat pemanggilan <ReviewStep onEditStep=... />).
function GroupHeader({ title, onClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
      <button type="button" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12.5, color: C.navy }}>Edit</button>
    </div>
  );
}
function ReviewStep({ f, accountText, contacts, isDoorToDoor, isGTf, isRS, serviceTypeOpts, roster, accountSource, entityCode, needsNContainers, onEditStep }) {
  const serviceLabel = serviceTypeOpts.find((o) => o.value === f.service_type)?.label || f.service_type;
  const ownerLabel = f.owner_id ? (roster.find((r) => r.id === f.owner_id)?.full_name || f.owner_id) : 'Unassigned (or yourself)';
  const contactLabel = f.contact_id ? (contacts.find((c) => c.id === f.contact_id)?.name || f.contact_id) : '';
  // Putaran 4 Tahap 4C -- laneTbl/selectedLanes dihitung lokal dari props
  // (pola sama showUndernameReview di bawah, dihitung lokal dari isDoorToDoor
  // + f), bukan dioper sebagai prop terpisah -- isRS saja cukup.
  // Perbaikan 1 (review Vir) -- filter "Use" HANYA berlaku isRS, pola SAMA
  // dengan body komponen utama: `lane.on` bisa tertinggal `false` dari
  // toggle RS->Single Shipment sebelumnya, dan Single Shipment nol UI utk
  // melihat/mengubahnya -- filter di sini sebelumnya diam-diam ikut
  // menyaringnya juga, tidak konsisten dgn label "Route options (N)" yang
  // masih memakai f.lanes.length (menghitung SEMUA).
  const laneTbl = isRS || f.laneMode;
  const selectedLanes = isRS ? f.lanes.filter((l) => l.on !== false) : f.lanes;
  const lanesText = laneTbl
    ? selectedLanes.map((l) => `${l.pol || '…'} → ${l.pod || '…'}`).join('; ')
    : `${f.pol || '…'} → ${f.pod || '…'}`;
  // Putaran 13b (W-21) -- cermin gate form-nya sendiri (pickupDeliveryVisible/
  // laneTbl di komponen utama), BUKAN literal mockup (mockup sendiri
  // menyembunyikan Pickup/Delivery utk SEMUA service type saat laneTbl --
  // keputusan Den: Door-to-Door pengecualian).
  const pickupDeliveryVisible = isDoorToDoor || !laneTbl;
  // 5a -- gate SAMA dengan kedua tempat Undername inline muncul di
  // langkah-langkah sebelumnya: Door-to-Door (langkah "customs") ATAU
  // Customs Clearance + Import (langkah "svc"). Pricing Basis tetap
  // Door-to-Door-only (hanya step itu yang punya field ini).
  const showUndernameReview = isDoorToDoor || (f.service_type === 'customs' && f.direction === 'Import');
  // Putaran 13b (W-33) -- cermin `dutiesVisible` di handleCreate: Duties &
  // Taxes kini field mandiri (selalu tampil) utk Door-to-Door, bukan lagi
  // terkunci di dalam blok "Undername dicentang".
  const dutiesVisible = isDoorToDoor || (f.service_type === 'customs' && f.direction === 'Import' && f.undername_import);
  // Putaran 14 (W-41, Scope 2) -- Pricing Basis kini berlaku Door-to-Door
  // ATAU Customs Clearance standalone, TANPA syarat Direction (cermin
  // `pricingBasisVisible` di komponen utama). Karena baris Pricing Basis
  // bisa relevan utk Customs Clearance BUKAN-Import (yang
  // `showUndernameReview` sendiri bernilai false utk kasus itu -- Undername
  // memang hanya utk Import), grup "Customs & Undername" kini tampil kalau
  // SALAH SATU dari dua kondisi benar, supaya baris Pricing Basis tidak
  // ikut tersembunyi. Baris Duties & Taxes/Undername di dalamnya TETAP
  // digerbang kondisi masing-masing yang SUDAH ADA, TIDAK diubah.
  const pricingBasisVisible = isDoorToDoor || f.service_type === 'customs';
  const showUndernameGroup = showUndernameReview || pricingBasisVisible;
  // W-44 -- grup "Customs & Undername" dipetakan ke step 'customs' kalau
  // Door-to-Door, atau 'svc' kalau Customs Clearance standalone (step
  // 'customs' tidak ada di SK utk kasus itu).
  const undernameEditKey = isDoorToDoor ? 'customs' : 'svc';
  const additionalServicesLabel = f.additional_services.map((id) => SERVICES.find((s) => s.id === id)?.label || id).join(', ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <GroupHeader title="Customer & Contact" onClick={() => onEditStep('cust')} />
        <div style={grid3}>
          <ReviewRow label="Account" value={accountText} required />
          <ReviewRow label="Entity" value={entityCode === 'Set from customer' ? '' : entityCode} />
          <ReviewRow label="Contact" value={contactLabel} required />
          <ReviewRow label="Source" value={accountSource} />
        </div>
      </div>
      <div>
        <GroupHeader title="Service & Direction" onClick={() => onEditStep('svc')} />
        <div style={grid3}>
          <ReviewRow label="Service Type" value={serviceLabel} required />
          <ReviewRow label="Direction" value={f.direction} required />
          {/* Putaran 14 (W-10, Scope 1) -- Customer Role disembunyikan utk
              General Trading (nol UI utk mengisinya, nol kewajiban). */}
          {!isGTf && <ReviewRow label="Customer Role" value={f.customer_role} required />}
        </div>
      </div>
      {/* Putaran 14 (W-10, Scope 1) -- General Trading tidak punya langkah
          "Route & Terms" sama sekali -- grup ini disembunyikan total. */}
      {!isGTf && (
        <div>
          <GroupHeader title="Route & Terms" onClick={() => onEditStep('route')} />
          <div style={grid3}>
            <ReviewRow label={isRS ? `Lanes (${selectedLanes.length})` : `Route options (${laneTbl ? selectedLanes.length : 1})`} value={lanesText} required />
            {!laneTbl && f.via && <ReviewRow label="Via port" value={f.via} />}
            {isRS ? (
              <>
                <ReviewRow label="Validity Requested" value={f.validity_from && f.validity_to ? `${f.validity_from} to ${f.validity_to}` : ''} required />
                <ReviewRow label="Estimated Volume per Month" value={f.monthly_volume_cbm ? `${f.monthly_volume_cbm} CBM` : ''} required />
              </>
            ) : (
              <>
                {pickupDeliveryVisible && <ReviewRow label="Pickup Address" value={f.pickup_address} required={isDoorToDoor} />}
                {pickupDeliveryVisible && <ReviewRow label="Delivery Address" value={f.delivery_address} required={isDoorToDoor} />}
                <ReviewRow label="Incoterms" value={f.incoterms.join(', ')} />
                <ReviewRow label="Container Type" value={f.container_types.join(', ')} />
                <ReviewRow label="Number of containers" value={f.n_containers} required={needsNContainers} />
                {!laneTbl && <ReviewRow label="Cargo ready date" value={f.cargo_ready_date} />}
              </>
            )}
          </div>
        </div>
      )}
      {/* 5a -- sebelumnya ABSEN dari Review sama sekali (Cargo/Additional
          Services/Notes) atau SEBAGIAN (Undername: cuma flag Yes/No, dan
          hanya utk Door-to-Door -- jalur Customs Clearance+Import nol
          representasi apa pun). Putaran 14 -- grup ini jg disembunyikan
          total utk General Trading (tidak punya langkah "Cargo"). */}
      {!isGTf && (
        <div>
          <GroupHeader title="Cargo" onClick={() => onEditStep('cargo')} />
          <div style={grid3}>
            <ReviewRow label="Total Weight (KG)" value={f.weight_kg} />
            <ReviewRow label="Volume (CBM)" value={f.volume_cbm} />
          </div>
        </div>
      )}
      {showUndernameGroup && (
        <div>
          <GroupHeader title="Customs & Undername" onClick={() => onEditStep(undernameEditKey)} />
          <div style={grid3}>
            {pricingBasisVisible && <ReviewRow label="Pricing Basis" value={f.pricing_basis} />}
            {dutiesVisible && <ReviewRow label="Duties & Taxes" value={f.duties_and_taxes} />}
            <ReviewRow label="Undername import" value={f.undername_import ? 'Yes' : 'No'} />
            {f.undername_import && (
              <>
                <ReviewRow label="Importer of Record" value={f.importer_of_record} required />
                <ReviewRow label="Supporting Documents Received" value={f.supporting_docs_received ? 'Yes' : 'No'} />
              </>
            )}
          </div>
        </div>
      )}
      {f.additional_services.length > 0 && (
        <div>
          <GroupHeader title="Additional Services" onClick={() => onEditStep('addl')} />
          <div style={grid3}>
            <ReviewRow label="Additional Services" value={additionalServicesLabel} />
          </div>
        </div>
      )}
      {/* Putaran 14 (W-60, Scope 3/4) -- grup "Delivery", HANYA utk General
          Trading. Ditaruh sebelum "Commercial" (posisi mockup: items ->
          delivery -> commercial, Items tidak dibangun). */}
      {isGTf && (
        <div>
          <GroupHeader title="Delivery" onClick={() => onEditStep('delivery')} />
          <div style={grid3}>
            <ReviewRow label="Order Category" value={f.order_category} />
            <ReviewRow label="Requested Delivery Date" value={f.requested_delivery_date} />
            <ReviewRow label="Estimated Shipping Cost" value={f.estimated_shipping_cost} />
            <ReviewRow label="Customer Reference" value={f.customer_reference} />
          </div>
        </div>
      )}
      <div>
        <GroupHeader title="Commercial" onClick={() => onEditStep('commercial')} />
        <div style={grid3}>
          <ReviewRow label="Deadline Quote" value={f.deadline_quote} />
          <ReviewRow label="Estimated (intake)" value={f.estimated_value} />
          <ReviewRow label="Owner" value={ownerLabel} />
          <ReviewRow label="Notes" value={f.notes} />
        </div>
      </div>
    </div>
  );
}
