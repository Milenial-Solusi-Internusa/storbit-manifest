import React, { useState, useRef, useEffect, useCallback } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, LabelList, AreaChart, Area } from "recharts";
import { supabase } from '../../lib/supabase';
import { fetchOperationalRoster } from './salesRoster';
import { useAuth } from '../../contexts/useAuth';
import { fetchActivityFeed } from './activityFeed';

/* =========================================================================
   CRMDashboardPage — Nexus by MSI · CRM Sales Dashboard (freight forwarding)
   Self-contained: inline styles only, no external CSS, real Supabase data.
   Fonts: 'Montserrat' (headings) + 'Inter' (body) + 'IBM Plex Mono' (figures)
   ========================================================================= */

/* ---------- brand tokens ---------- */
const NAVY = "#144682";
const ORANGE = "#E85A1E";

/* ---------- icons (inline lucide paths) ---------- */
const ICONS = {
  chevright:   '<path d="m9 18 6-6-6-6"/>',
  chevdown:    '<path d="m6 9 6 6 6-6"/>',
  arrowup:     '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowdown:   '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  wallet:      '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  target:      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  bars:        '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
  pie:         '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
  award:       '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  inbox:       '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  filetext:    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  userplus:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  login:       '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  checkcircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  ban:         '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  arrowright:  '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  activity:    '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  trendup:     '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  refresh:     '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  layoutdashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  calendar:    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  receipt:     '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M12 16H8"/>',
  alert:       '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  plus:        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x:           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mappin:      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
};

function Icon({ name, size = 18, color, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color || "currentColor"}
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flex: "0 0 auto", ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }} />
  );
}

/* ---------- formatting ---------- */
const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const rpShort = (n) => {
  if (n >= 1e9) return "Rp " + (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  if (n >= 1e6) return "Rp " + (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " Jt";
  return rp(n);
};

/* ---------- static/fallback data ---------- */
const KPIS = [
  { label: "Total Active Prospects", icon: "users",  value: "—", unit: "prospect", accent: NAVY,      accentBg: "#EAF0F8", trend: null },
  { label: "Total Inquiry",        icon: "filetext",value: "—", unit: "inquiry",  accent: ORANGE,    accentBg: "#FBE6DA", trend: null },
  { label: "Total Quotation",      icon: "receipt", value: "—", unit: "quotation",accent: "#6E4B8C", accentBg: "#EEE7F4", trend: null },
  { label: "Win Rate",             icon: "target",  value: "—", unit: "%",        accent: "#1F8B4D", accentBg: "#DEF0E4", trend: null },
];

/* ─── Sumbu deal = inquiries.status ────────────────────────────────────────
   Sejak Batch Pipeline (B3), tahap deal dibaca dari `inquiries.status` — BUKAN
   lagi `accounts.pipeline_stage` (kolom lama, dijadwalkan drop). Urutan lajur
   SENGAJA identik dengan PipelineKanbanPage supaya angka di dashboard dan di
   papan Pipeline selalu bisa direkonsiliasi; kalau salah satu berubah, ubah
   dua-duanya. */
const INQ_OPEN_STATUSES   = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];
const INQ_CLOSED_STATUSES = ['WON', 'LOST', 'CANCELLED'];
const INQ_STAGE_ORDER     = [...INQ_OPEN_STATUSES, ...INQ_CLOSED_STATUSES];
const INQ_STAGE_LABELS = {
  OPEN: 'Open', IN_REVIEW: 'In Review', QUOTED: 'Quoted', NEGOTIATION: 'Negotiation',
  WON: 'Won', LOST: 'Lost', CANCELLED: 'Cancelled',
};
// Warna bar dipertahankan apa adanya dari versi sebelumnya (won hijau / lost
// merah); CANCELLED lajur baru → abu netral. Penyelarasan visual ke kit v3
// adalah batch tersendiri dan sengaja TIDAK dikerjakan di sini.
const INQ_STAGE_COLOR = { WON: '#1F8B4D', LOST: '#C0392B', CANCELLED: '#9AA0AC' };

// Fallback funnel — dipakai PipelineByStage saat data belum tiba.
const STAGES = INQ_STAGE_ORDER.map((id) => ({
  id, name: INQ_STAGE_LABELS[id], count: 0, value: 0,
}));

/* ─── Sumbu LIFECYCLE akun ─────────────────────────────────────────────────
   Sumbu KEDUA, sepenuhnya terpisah dari inquiries.status di atas: yang satu
   perjalanan AKUN, yang satu perjalanan DEAL. Lima tahap progresif mengikuti
   COMMENT kolom accounts.lifecycle_stage (migrasi 20260827000002).

   `free_agent` dan `lost` SENGAJA di luar urutan funnel: keduanya exit yang
   bisa terjadi dari tahap mana pun, bukan kelanjutan perjalanan. Memaksanya
   masuk urutan akan membuat corongnya berbohong soal arah. Tapi keduanya
   TETAP dihitung dan ditampilkan terpisah — menyembunyikannya sama dengan
   membuang akun dari pandangan tanpa jejak. */
const LIFECYCLE_FUNNEL = ['lead', 'mql', 'prospect', 'sql', 'customer'];
const LIFECYCLE_EXITS  = ['free_agent', 'lost'];
const LIFECYCLE_LABELS = {
  lead: 'Lead', mql: 'MQL', prospect: 'Prospect', sql: 'SQL', customer: 'Customer',
  free_agent: 'Free Agent', lost: 'Lost',
};

/* ─── Rentang periode ──────────────────────────────────────────────────────
   Satu sumber untuk SELURUH widget tim. Bucket trend adaptif supaya bentuk
   grafiknya tetap masuk akal di ketiga periode: bulan = 4 minggu, kuartal =
   3 bulan, tahun = 12 bulan. `prev*` = periode setara sebelumnya, dipakai
   sebagai garis pembanding.
   ⚠️ KPI personal sales (Call/Visit Minggu Ini, Quotation Bulan Ini) SENGAJA
   TIDAK memakai rentang ini — lihat catatan di fetchDash. */
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function periodRange(period, now) {
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'This Year') {
    const start = new Date(y, 0, 1);
    return {
      start, end: new Date(y + 1, 0, 1),
      prevStart: new Date(y - 1, 0, 1), prevEnd: start,
      curLabel: 'This Year', prevLabel: 'Last Year',
      buckets: Array.from({ length: 12 }, (_, i) => ({
        name: MONTH_SHORT[i],
        start: new Date(y, i, 1),     end: new Date(y, i + 1, 1),
        prevStart: new Date(y - 1, i, 1), prevEnd: new Date(y - 1, i + 1, 1),
      })),
    };
  }

  if (period === 'This Quarter') {
    const q = Math.floor(m / 3) * 3;
    const start = new Date(y, q, 1);
    return {
      start, end: new Date(y, q + 3, 1),
      prevStart: new Date(y, q - 3, 1), prevEnd: start,
      curLabel: 'This Quarter', prevLabel: 'Last Quarter',
      buckets: Array.from({ length: 3 }, (_, i) => {
        const bs = new Date(y, q + i, 1);
        return {
          name: MONTH_SHORT[bs.getMonth()],
          start: bs, end: new Date(y, q + i + 1, 1),
          prevStart: new Date(y, q - 3 + i, 1), prevEnd: new Date(y, q - 3 + i + 1, 1),
        };
      }),
    };
  }

  // Default "This Month" — 4 minggu, pembanding bulan lalu (perilaku lama).
  // Minggu ke-4 sengaja memanjang sampai akhir bulan: versi lama memotong di
  // tanggal 28, jadi tanggal 29-31 hilang dari grafik tanpa jejak.
  const start = new Date(y, m, 1);
  const end   = new Date(y, m + 1, 1);
  const pStart = new Date(y, m - 1, 1);
  return {
    start, end, prevStart: pStart, prevEnd: start,
    curLabel: 'This Month', prevLabel: 'Last Month',
    buckets: [1, 2, 3, 4].map((w) => ({
      name: `Week ${w}`,
      start: new Date(y, m, (w - 1) * 7 + 1),
      end:   w === 4 ? end : new Date(y, m, w * 7 + 1),
      prevStart: new Date(y, m - 1, (w - 1) * 7 + 1),
      prevEnd:   w === 4 ? start : new Date(y, m - 1, w * 7 + 1),
    })),
  };
}

const STATUS_BADGE = {
  "Exceeding": { bg: "#DEF0E4", fg: "#1F8B4D" },
  "On Track":  { bg: "#E5EDF7", fg: "#1E5894" },
  "Need Push": { bg: "#FBEFD3", fg: "#9A6B12" },
  "At Risk":   { bg: "#F7E1DE", fg: "#C0392B" },
};

const ACTIVITY = [];

const ACT_META = {
  quotation: { icon: "filetext",    bg: "#FBE6DA", fg: "#C8521B" },
  prospect:  { icon: "userplus",    bg: "#EAF0F8", fg: NAVY },
  won:       { icon: "checkcircle", bg: "#DEF0E4", fg: "#1F8B4D" },
  inquiry:   { icon: "inbox",       bg: "#E5EDF7", fg: "#1E5894" },
  move:      { icon: "arrowright",  bg: "#EAF0F8", fg: NAVY },
  lost:      { icon: "ban",         bg: "#F7E1DE", fg: "#C0392B" },
  activity:  { icon: "activity",    bg: "#EFE7F6", fg: "#7C3AED" },
  login:     { icon: "login",       bg: "#EEF0F3", fg: "#51607A" },
};

/* ---------- lead source color palette ---------- */
// Pastel ungu/pink/biru — selaras dengan gradient line "Bulan Ini" (pie only)
const SOURCE_PALETTE = [
  "#8B7DD8", "#E89BC4", "#7FB5E6", "#A8C5E0", "#C9B8E0",
];

/* ---------- avatar helper ---------- */
const AV_COLORS = ["#144682", "#1E5894", "#1F8B4D", "#6E4B8C", "#C8521B", "#1F6B6B"];
function initials(name) { return (name || '?').split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function avatarColor(name) { let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }

/* ---------- hoverable button ---------- */
function HoverButton({ base, hover, children, ...rest }) {
  const [h, setH] = useState(false);
  return (
    <button {...rest} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...base, ...(h ? hover : null) }}>
      {children}
    </button>
  );
}

/* Measure a container's width so charts mount at a real (non-zero) size —
   avoids the ResponsiveContainer + animation race that can collapse marks to 0.
   Uses a CALLBACK REF (not useRef + useEffect([])) so the measurement runs
   whenever the element actually mounts — including when the chart container
   appears later, after data loads. A plain effect with [] deps would run once
   on first render when the (conditional) element isn't in the DOM yet, never
   re-running once it appears → width stays 0 and the chart is skipped. */
function useWidth() {
  const [w, setW] = useState(0);
  const roRef = useRef(null);
  const ref = useCallback((node) => {
    // Tear down any observer attached to a previous node.
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!node) return; // unmount
    const update = () => setW(node.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    roRef.current = ro;
  }, []);
  return [ref, w];
}

/* Viewport <1024px detector (initial value from matchMedia → no flash).
   Used ONLY for the calendar's tap behavior (dot+popup on mobile vs the
   unchanged desktop day-click). Visuals stay CSS-driven via lg: breakpoints. */
function useIsMobile(maxWidth = 1023) {
  const query = `(max-width:${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return isMobile;
}

/* Pastel dot colours per visit status (mobile calendar indicators —
   intentionally NOT navy/orange). */
const VISIT_DOT_PASTEL = {
  scheduled: '#A5C8E8', // sky
  completed: '#7FD8C4', // teal muda
  cancelled: '#F5C9A8', // peach
};

/* ---------- style tokens ---------- */
const D = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", background: "#ffffff", minHeight: "100%", padding: "26px 20px 44px", boxSizing: "border-box", color: "#1A2330" },
  wrap: { maxWidth: "100%", margin: "0 auto" },

  topRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, marginBottom: 22, flexWrap: "wrap" },
  crumbs: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#9AA0AC", marginBottom: 8 },
  crumbCur: { color: "#545B66", fontWeight: 600 },
  title: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.4, color: "#16243A", margin: 0 },
  sub: { fontSize: 13, color: "#7A828E", marginTop: 4 },

  /* segmented date filter */
  seg: { display: "inline-flex", background: "#ECEDF1", borderRadius: 11, padding: 4, gap: 2 },
  segBtn: { border: 0, background: "transparent", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "#6B7280", padding: "8px 14px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", transition: "color .15s ease" },
  segBtnActive: { background: "#fff", color: NAVY, boxShadow: "0 1px 2px rgba(20,40,70,.10), 0 2px 6px rgba(20,40,70,.06)" },

  /* card */
  card: { background: "#fff", border: "1px solid #ECEDF1", borderRadius: 14, boxShadow: "0 1px 2px rgba(20,40,70,.04), 0 4px 14px rgba(20,40,70,.03)", overflow: "hidden" },
  /* Header kartu — gaya light-gray mengikuti pola Card di v3/kit.jsx (bar abu
     muda + garis bawah + judul tinta gelap), menggantikan bar navy solid
     berjudul putih. Nilai warnanya mencerminkan v3/tokens.js: SURFACE_2
     #F7F8FA, LINE_SOFT #EFE9DD, INK #16243A, MUTED #6B7280, NAVY_SOFT #EAF0F8. */
  cardHead: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#F7F8FA", borderBottom: "1px solid #EFE9DD", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  cardIco: { width: 34, height: 34, borderRadius: 9, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" },
  cardTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 700, fontSize: 13.5, color: "#16243A", letterSpacing: -0.2 },
  cardSub: { fontSize: 11.5, color: "#6B7280", marginTop: 1 },

  /* tab navigation (below page header) */
  tabBar: { display: "flex", gap: 4, borderBottom: "1px solid #ECEDF1", marginBottom: 22 },
  tab: { position: "relative", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "transparent", border: 0, color: "#7A828E", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "color .15s ease" },
  tabHover: { color: NAVY },
  tabActive: { color: NAVY },
  tabInd: { position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: NAVY },

  /* calendar */
  calGridHead: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
  calDow: { padding: "9px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#9AA0AC", background: "#FAFBFC", borderBottom: "1px solid #F0F1F4", borderRight: "1px solid #F4F5F7" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
  calCell: { minHeight: 110, padding: "7px 8px", borderRight: "1px solid #F4F5F7", borderBottom: "1px solid #F4F5F7" },
  calCellMuted: { background: "#FBFBFC" },
  calCellToday: { background: "#EAF0F8" },
  calNum: { fontSize: 12, fontWeight: 700, color: "#48505C", marginBottom: 4 },
  calNumToday: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: NAVY, color: "#fff", fontSize: 11, fontWeight: 800, marginBottom: 4 },
  calEvent: { padding: "5px 7px", borderRadius: 7, marginBottom: 4, lineHeight: 1.3, background: "#EAF0F8", borderLeft: "3px solid " + NAVY },
  calEventProspect: { fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  calEventMeta: { fontSize: 10, color: "#6B7280" },

  /* layout rows */
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, marginBottom: 16 },
  chartsRow: { display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16, marginBottom: 16, alignItems: "start" },
  tablesRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 16, marginBottom: 16, alignItems: "start" },

  /* kpi */
  kpiCard: { position: "relative", overflow: "hidden", background: "#fff", border: "1px solid #ECEDF1", borderRadius: 14, boxShadow: "0 1px 2px rgba(20,40,70,.04), 0 4px 14px rgba(20,40,70,.03)", padding: "21px 20px 18px", transition: "box-shadow .18s ease, transform .18s ease" },
  kpiCardHover: { boxShadow: "0 2px 4px rgba(20,40,70,.06), 0 14px 32px rgba(20,40,70,.11)", transform: "translateY(-3px)" },
  kpiTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  kpiIco: { width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 40px" },
  kpiTrend: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, fontWeight: 700, padding: "4px 8px", borderRadius: 20, fontVariantNumeric: "tabular-nums" },
  kpiLabel: { fontSize: 12, fontWeight: 600, color: "#7A828E", letterSpacing: 0.1 },
  kpiValue: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 29, color: "#16243A", letterSpacing: -0.8, lineHeight: 1.05, marginTop: 5, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", whiteSpace: "nowrap" },
  kpiUnit: { fontSize: 13, fontWeight: 600, color: "#9AA0AC", letterSpacing: 0 },
  kpiNote: { fontSize: 11.5, color: "#9AA0AC", marginTop: 9 },

  /* bar chart */
  barBody: { padding: "16px 20px 18px" },
  barRow: { display: "grid", gridTemplateColumns: "108px minmax(0,1fr) 96px", alignItems: "center", gap: 12, padding: "9px 0" },
  barLabel: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  barDot: { width: 9, height: 9, borderRadius: "50%", flex: "0 0 9px" },
  barName: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "#16243A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  barTrack: { position: "relative", height: 26, background: "#F2F3F6", borderRadius: 7, overflow: "hidden" },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 9, transition: "width .5s cubic-bezier(.4,0,.2,1)" },
  barCount: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: "#fff" },
  barVal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 12.5, color: "#16243A", textAlign: "right", letterSpacing: -0.2, fontVariantNumeric: "tabular-nums" },
  barFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 13, borderTop: "1px solid #F1F2F5" },

  /* donut */
  donutBody: { padding: "18px 18px 20px", display: "flex", alignItems: "center", gap: 16 },
  donutWrap: { position: "relative", flex: "0 0 150px", width: 150, height: 160 },
  donutCenter: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  donutTotal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 26, color: "#16243A", letterSpacing: -0.6, lineHeight: 1 },
  donutTotalLbl: { fontSize: 10.5, color: "#9AA0AC", fontWeight: 600, marginTop: 3, letterSpacing: 0.3 },
  legend: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 },
  legRow: { display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 11 },
  legName: { color: "#48505C", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  legVal: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: "#16243A", fontVariantNumeric: "tabular-nums" },
  legPct: { color: "#9AA0AC", fontWeight: 600, fontSize: 10, width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  legItem: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "#48505C" },

  /* tables */
  th: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#9AA0AC", background: "#FAFBFC", borderBottom: "1px solid #F0F1F4", padding: "9px 16px", textAlign: "left", whiteSpace: "nowrap" },
  td: { padding: "11px 16px", borderBottom: "1px solid #F4F5F7", fontSize: 12.5, color: "#1A2330", verticalAlign: "middle" },
  avatar: { width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flex: "0 0 30px", fontFamily: "'Montserrat', system-ui, sans-serif" },
  num: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  badge: { display: "inline-block", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },
  countPill: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11.5, fontWeight: 700, color: NAVY, background: "#EAF0F8", padding: "2px 9px", borderRadius: 20 },
  miniTrack: { height: 6, background: "#F2F3F6", borderRadius: 4, overflow: "hidden", marginTop: 5, width: "100%" },

  /* activity */
  actBody: { padding: "6px 20px 8px" },
  actRow: { display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: "1px solid #F4F5F7" },
  actIco: { width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" },
  actText: { fontWeight: 600, fontSize: 13, color: "#16243A" },
  actCo: { fontSize: 12, color: "#7A828E", marginTop: 2 },
  actTime: { fontSize: 11.5, color: "#9AA0AC", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  userBadge: { display: "inline-flex", alignItems: "center", gap: 7, background: "#F5F6F8", border: "1px solid #ECEDF1", borderRadius: 20, padding: "4px 11px 4px 4px", fontSize: 11.5, fontWeight: 600, color: "#48505C", whiteSpace: "nowrap" },
  userBadgeAv: { width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 9, flex: "0 0 22px", fontFamily: "'Montserrat', system-ui, sans-serif" },

  toast: { position: "fixed", right: 24, bottom: 24, display: "flex", alignItems: "center", gap: 9, background: "#16243A", color: "#fff", padding: "11px 15px", borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px rgba(10,20,40,.28)", zIndex: 200, transition: "opacity .2s ease, transform .2s ease", pointerEvents: "none" },
  tip: { background: "#16243A", color: "#fff", padding: "9px 12px", borderRadius: 9, boxShadow: "0 10px 26px rgba(10,20,40,.28)", border: "1px solid rgba(255,255,255,.08)" },
  tipTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 700, fontSize: 12.5, color: "#fff" },
  tipRow: { fontSize: 11.5, color: "rgba(255,255,255,.82)", fontVariantNumeric: "tabular-nums", marginTop: 1 },
};

/* ---------- KPI card ---------- */
function KpiCard({ data }) {
  const [h, setH] = useState(false);
  const hasTrend = !!data.trend;
  const up   = hasTrend && data.trend.dir === "up";
  const good = hasTrend && data.trend.good;
  const tone = good ? { fg: "#1F8B4D", bg: "#DEF0E4" } : { fg: "#C0392B", bg: "#F7E1DE" };
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...D.kpiCard, ...(h ? D.kpiCardHover : null) }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, " + data.accent + ", " + data.accent + "55)" }} />
      <div style={D.kpiTop}>
        <div style={{ ...D.kpiIco, background: data.accentBg, color: data.accent }}><Icon name={data.icon} size={20} /></div>
        {hasTrend && (
          <span style={{ ...D.kpiTrend, color: tone.fg, background: tone.bg }}>
            <Icon name={up ? "arrowup" : "arrowdown"} size={12} color={tone.fg} />{data.trend.val}
          </span>
        )}
      </div>
      <div style={D.kpiLabel}>{data.label}</div>
      <div style={D.kpiValue}><span style={{ whiteSpace: "nowrap" }}>{data.value}</span><span style={D.kpiUnit}>{data.unit}</span></div>
      {hasTrend && <div style={D.kpiNote}>{data.trend.note}</div>}
      {!hasTrend && data.subtitle && <div style={{ ...D.kpiNote, color: "#6B7280" }}>{data.subtitle}</div>}
      {!hasTrend && !data.subtitle && <div style={{ ...D.kpiNote, color: "#BCC0C8" }}>Realtime</div>}
      {data.progress && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "#EEF0F3" }}>
          <div style={{ height: "100%", width: `${data.progress.pct}%`, background: data.progress.color, transition: "width .3s" }} />
        </div>
      )}
    </div>
  );
}

/* ---------- pipeline prospect trend (recharts area — count per week) ---------- */
function AreaTip({ active, payload, label, curLabel = 'This Month', prevLabel = 'Last Month' }) {
  if (!active || !payload || !payload.length) return null;
  const get = (k) => { const p = payload.find((x) => x.dataKey === k); return p ? p.value : 0; };
  return (
    <div style={D.tip}>
      <div style={D.tipTitle}>{label}</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ ...D.tipRow, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#8B5CF6", flex: "0 0 8px" }} />
          {curLabel} · <b style={{ color: "#fff", fontWeight: 700 }}>{get("bulanIni")} prospect</b>
        </div>
        <div style={{ ...D.tipRow, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#CBD5E1", flex: "0 0 8px" }} />
          {prevLabel} · <b style={{ color: "#fff", fontWeight: 700 }}>{get("bulanLalu")} prospect</b>
        </div>
      </div>
    </div>
  );
}

function PipelineTrend({ data = [], curLabel = 'This Month', prevLabel = 'Last Month', bucketNoun = 'minggu' }) {
  const [areaRef, areaW] = useWidth();
  const isEmpty = data.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="trendup" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Prospect Trend</div>
          <div style={D.cardSub}>{`New prospects per ${bucketNoun}, ${curLabel.toLowerCase()} vs ${prevLabel.toLowerCase()}`}</div>
        </div>
      </div>
      <div style={{ padding: "16px 16px 4px" }}>
        {isEmpty ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9AA0AC", fontSize: 13 }}>No prospect data yet</div>
        ) : (
          <div ref={areaRef} className="bar-in">
          {areaW > 0 && (
            <AreaChart width={areaW} height={240} data={data} margin={{ top: 10, right: 22, left: -10, bottom: 0 }}>
              <defs>
                {/* Horizontal (kiri→kanan) gradient untuk garis "Bulan Ini" */}
                <linearGradient id="lineGradIni" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#7C3AED" />
                  <stop offset="35%"  stopColor="#D946A6" />
                  <stop offset="70%"  stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#60A5FA" />
                </linearGradient>
                <linearGradient id="areaIni" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#8B5CF6" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="areaLalu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#CBD5E1" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#CBD5E1" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#F1F2F5" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} dy={6}
                tick={{ fontSize: 11.5, fill: "#7A828E", fontWeight: 600 }} />
              <YAxis axisLine={false} tickLine={false} width={30} allowDecimals={false}
                tick={{ fontSize: 11, fill: "#9AA0AC" }} />
              <Tooltip content={<AreaTip curLabel={curLabel} prevLabel={prevLabel} />} cursor={{ stroke: "#C7CBD4", strokeWidth: 1, strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="bulanLalu" stroke="#CBD5E1" strokeWidth={2} strokeDasharray="6 5"
                fill="url(#areaLalu)" dot={{ r: 3, fill: "#CBD5E1", strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Area type="monotone" dataKey="bulanIni" stroke="url(#lineGradIni)" strokeWidth={2.5}
                fill="url(#areaIni)" dot={{ r: 3, fill: "#8B5CF6", strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </AreaChart>
          )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 24, padding: "8px 0 14px" }}>
          <span style={D.legItem}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#8B5CF6", flex: "0 0 11px" }} />
            {curLabel}
          </span>
          <span style={D.legItem}>
            <span style={{ width: 14, height: 0, borderTop: "2.5px dashed #CBD5E1", flex: "0 0 14px" }} />
            {prevLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- pipeline by stage (recharts) ---------- */
function BarTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const color = INQ_STAGE_COLOR[d.id] || NAVY;
  return (
    <div style={D.tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: "0 0 8px" }} />
        <span style={D.tipTitle}>{d.name}</span>
      </div>
      <div style={D.tipRow}><b style={{ color: "#fff", fontWeight: 700 }}>{d.count}</b> prospect{d.value > 0 ? ' · ' + rpShort(d.value) : ''}</div>
    </div>
  );
}

function PipelineByStage({ stages = STAGES, conversion = [] }) {
  const [barRef, barW] = useWidth();
  const totalVal   = stages.reduce((a, s) => a + (s.value || 0), 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="bars" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Pipeline by Stage</div>
          <div style={D.cardSub}>Inquiry count by status, using the same axis as the Pipeline board</div>
        </div>
      </div>
      <div style={{ padding: "14px 14px 4px" }}>
        <div ref={barRef} className="bar-in">
        {barW > 0 && (
          <BarChart layout="vertical" width={barW} height={300} data={stages} margin={{ top: 4, right: 80, left: 6, bottom: 4 }} barCategoryGap={10}>
            <defs>
              <linearGradient id="navyBar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2A6FA8" />
                <stop offset="100%" stopColor="#144682" />
              </linearGradient>
            </defs>
            <CartesianGrid horizontal={false} stroke="#F1F2F5" />
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="name" width={86} axisLine={false} tickLine={false}
              tickFormatter={(v) => v.toUpperCase()}
              tick={{ fontSize: 10.5, fill: "#16243A", fontWeight: 700, letterSpacing: 0.4 }} />
            <Tooltip content={<BarTip />} cursor={{ fill: "rgba(20,70,130,.05)" }} />
            <Bar dataKey="count" radius={[0, 7, 7, 0]} barSize={22} isAnimationActive={false}>
              {stages.map((s) => (
                <Cell key={s.id} fill={INQ_STAGE_COLOR[s.id] || "url(#navyBar)"} />
              ))}
              <LabelList dataKey="count" position="right" fill="#16243A" fontSize={11} fontWeight={700} />
            </Bar>
          </BarChart>
        )}
        </div>
        {totalVal > 0 && (
          <div style={{ ...D.barFoot, margin: "2px 8px 0", padding: "13px 0 14px", justifyContent: "flex-end" }}>
            <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: NAVY, letterSpacing: -0.3 }}>{rpShort(totalVal)}</span>
          </div>
        )}
        {/* Konversi antar-tahap — "pernah mencapai", dari riwayat transisi.
            LOST/CANCELLED tidak masuk rantai: keduanya exit dari tahap mana pun,
            bukan tahap berikutnya. */}
        {conversion.length > 0 && (
          <div style={{ borderTop: "1px solid #ECEDF1", margin: "2px 8px 0", padding: "11px 0 13px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#9AA0AC", marginBottom: 7 }}>
              Konversi antar-tahap
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {conversion.map((c) => (
                <span key={c.to} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "#F4F5F7", fontSize: 11, color: "#48505C", fontWeight: 600 }}>
                  {c.fromLabel} → {c.toLabel}
                  <b style={{ ...D.legVal, fontSize: 11.5 }}>{c.pct === null ? "—" : c.pct + "%"}</b>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 7, fontSize: 10.5, color: "#9AA0AC", lineHeight: 1.5 }}>
              Dari riwayat transisi. Deal yang bergerak sebelum 28 Agu 2026 belum punya riwayat
              penuh, jadi angkanya masih under-report untuk data lama.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- donut (recharts) ---------- */
function PieTip({ active, payload, total }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
  return (
    <div style={D.tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flex: "0 0 8px" }} />
        <span style={D.tipTitle}>{d.name}</span>
      </div>
      <div style={D.tipRow}><b style={{ color: "#fff", fontWeight: 700 }}>{d.count}</b> lead · {pct}%</div>
    </div>
  );
}

function LeadSourceDonut({ data = [] }) {
  // Normalise: data has { source, count } — add name + color for chart
  const normalised = data.map((d, i) => ({
    name:  d.source || 'Lainnya',
    count: d.count,
    color: SOURCE_PALETTE[i % SOURCE_PALETTE.length],
  }));
  const total = normalised.reduce((a, s) => a + s.count, 0);
  // Skala bar volume — warisan satu-satunya kolom bermakna dari tabel "New
  // Leads by Source" yang dilebur ke sini (kolom conv/response tabel itu
  // permanen kosong, jadi ikut dilepas bersama tabelnya).
  const maxCount = normalised.reduce((a, s) => Math.max(a, s.count), 0);
  const isEmpty = normalised.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="pie" size={17} /></div>
        <div>
          <div style={D.cardTitle}>Lead Source Distribution</div>
          <div style={D.cardSub}>Lead origin across the period</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>No lead source data yet</div>
      ) : (
        <div style={D.donutBody}>
          <div style={D.donutWrap} className="donut-in">
            <PieChart width={150} height={160}>
              <Pie data={normalised} dataKey="count" nameKey="name" cx={75} cy={80}
                innerRadius={46} outerRadius={70} paddingAngle={1.5} stroke="none"
                startAngle={90} endAngle={-270} isAnimationActive={false}>
                {normalised.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip content={<PieTip total={total} />} />
            </PieChart>
            <div style={{ ...D.donutCenter, pointerEvents: "none" }}>
              <div style={D.donutTotal}>{total}</div>
              <div style={D.donutTotalLbl}>TOTAL LEAD</div>
            </div>
          </div>
          <div style={D.legend}>
            {normalised.map((s) => (
              <div key={s.name}>
                <div style={D.legRow}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: "0 0 9px" }} />
                  <span style={D.legName}>{s.name}</span>
                  <span style={D.legVal}>{s.count}</span>
                  <span style={D.legPct}>{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
                </div>
                <div style={{ ...D.miniTrack, marginTop: 3, marginBottom: 7 }}>
                  <span style={{
                    display: "block", height: "100%", borderRadius: 4, background: s.color,
                    width: (maxCount > 0 ? (s.count / maxCount) * 100 : 0) + "%",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- baris funnel (dipakai dua widget baru) ---------- */
// Gaya bar mengikuti D.miniTrack yang sudah dipakai legenda donut Lead Source —
// bukan Recharts, karena kedua widget ini cuma butuh daftar berbanding, bukan
// grafik dengan sumbu.
function FunnelRow({ label, count, max, muted = false }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ flex: 1, minWidth: 0, color: muted ? "#7A828E" : "#48505C", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span style={D.legVal}>{count}</span>
      </div>
      <div style={D.miniTrack}>
        <span style={{ display: "block", height: "100%", borderRadius: 4, background: muted ? "#C7CBD4" : NAVY, width: (max > 0 ? (count / max) * 100 : 0) + "%" }} />
      </div>
    </div>
  );
}

/* ---------- funnel lifecycle akun ---------- */
function LifecycleFunnel({ funnel = [], exits = [] }) {
  const max        = funnel.reduce((a, s) => Math.max(a, s.count), 0);
  const totalFun   = funnel.reduce((a, s) => a + s.count, 0);
  const totalExit  = exits.reduce((a, s) => a + s.count, 0);
  const isEmpty    = totalFun === 0 && totalExit === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="users" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Account Lifecycle Funnel</div>
          <div style={D.cardSub}>Current account distribution (does not follow the period filter)</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>No accounts yet</div>
      ) : (
        <div style={{ padding: "14px 16px 16px" }}>
          {funnel.map((s) => <FunnelRow key={s.id} label={s.name} count={s.count} max={max} />)}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid #ECEDF1", paddingTop: 12, marginTop: 3 }}>
            {exits.map((e) => (
              <span key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "#F4F5F7", fontSize: 11.5, color: "#7A828E", fontWeight: 600 }}>
                {e.name}<span style={D.legVal}>{e.count}</span>
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#9AA0AC" }}>
              Total akun <b style={{ color: "#16243A" }}>{totalFun + totalExit}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- pie konversi MQL → SQL ---------- */
// Tooltip sendiri, BUKAN PieTip: PieTip membaca field `count` dan mencetak
// satuan "lead" — dua-duanya salah di sini (slice-nya pakai `value`, dan
// satuannya akun MQL, bukan lead).
function MqlTip({ active, payload, total }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
  return (
    <div style={D.tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flex: "0 0 8px" }} />
        <span style={D.tipTitle}>{d.name}</span>
      </div>
      <div style={D.tipRow}><b style={{ color: "#fff", fontWeight: 700 }}>{d.value}</b> akun · {pct}%</div>
    </div>
  );
}

function MqlToSqlPie({ data }) {
  const converted = data?.converted ?? 0;
  const pending   = data?.pending   ?? 0;
  const lost      = data?.lost      ?? 0;
  const pct       = data?.pct ?? null;
  const slices = [
    { name: 'Reached SQL', value: converted, color: NAVY },
    { name: 'Belum',          value: pending,   color: '#C7CBD4' },
  ];
  const isEmpty = converted + pending + lost === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="pie" size={17} /></div>
        <div>
          <div style={D.cardTitle}>Konversi MQL ke SQL</div>
          <div style={D.cardSub}>Accounts that have ever reached MQL</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>
          Belum ada akun yang tercatat mencapai MQL
        </div>
      ) : (
        <div style={{ padding: "14px 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "0 0 auto" }}>
              <PieChart width={132} height={132}>
                <Pie data={slices} dataKey="value" nameKey="name" cx={66} cy={66}
                  innerRadius={40} outerRadius={62} paddingAngle={1.5} stroke="none"
                  startAngle={90} endAngle={-270} isAnimationActive={false}>
                  {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip content={<MqlTip total={converted + pending} />} />
              </PieChart>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 19, color: "#16243A" }}>
                  {pct === null ? '—' : pct + '%'}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "#9AA0AC" }}>REACHED SQL</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              {slices.map((s) => (
                <div key={s.name} style={D.legRow}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: "0 0 9px" }} />
                  <span style={D.legName}>{s.name}</span>
                  <span style={D.legVal}>{s.value}</span>
                </div>
              ))}
              {/* `lost` DI LUAR pie: akun mati bukan "belum konversi" — satu masih
                  mungkin jadi SQL, satu tidak akan pernah. Mencampurnya akan
                  membuat penyebutnya menghukum konversi untuk sesuatu yang sudah
                  selesai. Tetap ditampilkan supaya tak hilang dari pandangan. */}
              {lost > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ECEDF1" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 20, background: "#F4F5F7", fontSize: 11, color: "#7A828E", fontWeight: 600 }}>
                    Lost (di luar hitungan)<span style={D.legVal}>{lost}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 10.5, color: "#9AA0AC", lineHeight: 1.5 }}>
            Kohort dari riwayat lifecycle, bukan dari tahap sekarang — akun bisa melompati MQL.
            Akun yang melewati MQL sebelum 27 Agu 2026 belum punya jejaknya, jadi kohort ini
            masih under-report untuk data lama.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- breakdown alasan kalah ---------- */
function LossReasonBreakdown({ data = [], total = 0 }) {
  const max = data.reduce((a, s) => Math.max(a, s.count), 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="ban" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Loss Reason</div>
          <div style={D.cardSub}>Deals marked Lost that closed in the active period</div>
        </div>
      </div>
      {data.length === 0 ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>No lost deals in this period</div>
      ) : (
        <div style={{ padding: "14px 16px 16px" }}>
          {/* Baris "Tanpa Alasan" diredupkan tapi TIDAK disembunyikan: totalnya
              harus tetap sama dengan jumlah LOST di Pipeline by Stage. */}
          {data.map((s) => (
            <FunnelRow key={s.id} label={s.name} count={s.count} max={max} muted={s.unknown} />
          ))}
          <div style={{ borderTop: "1px solid #ECEDF1", paddingTop: 12, marginTop: 3, fontSize: 11.5, color: "#9AA0AC" }}>
            Total LOST periode ini <b style={{ color: "#16243A" }}>{total}</b> — harus sama dengan batang LOST di Pipeline by Stage.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- beban pipeline aktif per sales ---------- */
function ActivePipelineLoad({ rows = [], totalDeals = 0 }) {
  const [hover, setHover] = useState(-1);
  const anyMissing = rows.some((r) => r.missing > 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="users" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Active Pipeline Load</div>
          {/* Sengaja tegas membedakan diri dari Sales Performance: yang itu
              tentang deal yang SUDAH ditutup di periode, yang ini tentang beban
              yang MASIH dipegang hari ini. Dua sumbu waktu berbeda. */}
          <div style={D.cardSub}>Open deals currently held, not closed-deal performance</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>
          Tidak ada deal terbuka
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
              <thead>
                <tr>
                  <th style={D.th}>Salesperson</th>
                  <th style={{ ...D.th, textAlign: "center", width: 76 }}>Active Deals</th>
                  <th style={{ ...D.th, textAlign: "right" }}>Pipeline Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                    style={{ background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
                    <td style={D.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ ...D.avatar, background: r.noOwner ? "#C7CBD4" : avatarColor(r.name) }}>
                          {r.noOwner ? "—" : initials(r.name)}
                        </span>
                        <span style={{ fontWeight: 600, color: r.noOwner ? "#7A828E" : "#16243A" }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{r.deals}</span></td>
                    <td style={{ ...D.td, textAlign: "right" }}>
                      <span style={D.num}>{rpShort(r.value)}</span>
                      {/* Gap per baris disebut, supaya total per sales tak
                          terbaca lengkap padahal sebagian dealnya tak bernilai. */}
                      {r.missing > 0 && (
                        <div style={{ fontSize: 10, color: "#C0392B", marginTop: 2 }}>
                          {r.missing} deal tanpa nilai
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px 14px", fontSize: 10.5, color: "#9AA0AC", lineHeight: 1.5 }}>
            Total <b>{totalDeals} deal</b> terbuka — sama dengan jumlah keempat batang terbuka di
            Pipeline by Stage.
            {anyMissing && <> Pipeline value only sums deals that already have a value; the deal count is still counted in full.</>}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- aging per tahap ---------- */
function AgingPerStage({ rows = [], unknown = 0 }) {
  const isEmpty = rows.every((r) => r.count === 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="clock" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Aging by Stage</div>
          <div style={D.cardSub}>Median days at the current stage (does not follow the period filter)</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>No open deals yet</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={D.th}>Stage</th>
                <th style={{ ...D.th, textAlign: "center", width: 62 }}>Deal</th>
                <th style={{ ...D.th, textAlign: "center", width: 86 }}>Median</th>
                <th style={{ ...D.th, textAlign: "center", width: 78 }}>Ambang</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const over = r.median !== null && r.threshold !== null && r.median > r.threshold;
                return (
                  <tr key={r.id}>
                    <td style={D.td}><span style={{ fontWeight: 600, color: "#16243A" }}>{r.name}</span></td>
                    <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{r.count}</span></td>
                    <td style={{ ...D.td, textAlign: "center" }}>
                      {/* Median null = tak ada deal yang umurnya bisa diukur.
                          "—", bukan 0 — nol hari mengklaim deal baru masuk. */}
                      <span style={{ ...D.num, fontWeight: 700, color: over ? "#C0392B" : "#16243A" }}>
                        {r.median === null ? '—' : `${r.median} hr`}
                      </span>
                    </td>
                    <td style={{ ...D.td, textAlign: "center", color: "#9AA0AC" }}>
                      <span style={D.num}>{r.threshold === null ? '—' : `${r.threshold} hr`}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "10px 16px 14px", fontSize: 10.5, color: "#9AA0AC", lineHeight: 1.5 }}>
            Ambang dari master SLA. <b>IN_REVIEW has no threshold</b> — kebijakannya bersumbu moda
            transport yang tidak ada di inquiry, jadi tak diarang-arang. Ambang hari kerja
            diperlakukan sebagai hari kalender (belum ada kalender kerja).
            {unknown > 0 && <> · <b>{unknown} deal</b> has no status history yet, so its age cannot be computed.</>}
            <br />Deal yang bergerak sebelum 28 Agu 2026 umurnya dihitung dari edit terakhir, bukan
            perubahan status — angkanya bisa lebih muda dari kenyataan.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- daftar deal stale ---------- */
function StaleDeals({ rows = [], total = 0, cap = 30 }) {
  const [hover, setHover] = useState(-1);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="alert" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Deal Stale</div>
          <div style={D.cardSub}>Past the SLA threshold for their stage, worst first</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>
          Tidak ada deal yang melewati ambang
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={D.th}>Inquiry</th>
                  <th style={D.th}>Account</th>
                  <th style={D.th}>Stage</th>
                  <th style={D.th}>Owner</th>
                  <th style={{ ...D.th, textAlign: "center", width: 70 }}>Age</th>
                  <th style={{ ...D.th, textAlign: "center", width: 84 }}>Lewat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                    style={{ background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
                    <td style={{ ...D.td, ...D.num, whiteSpace: "nowrap" }}>{r.inquiryNo}</td>
                    <td style={D.td}><span style={{ fontWeight: 600, color: "#16243A" }}>{r.account}</span></td>
                    <td style={{ ...D.td, color: "#7A828E" }}>{r.statusLabel}</td>
                    <td style={{ ...D.td, color: r.noOwner ? "#9AA0AC" : "#48505C" }}>{r.owner}</td>
                    <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{r.days} hr</span></td>
                    <td style={{ ...D.td, textAlign: "center" }}>
                      <span style={{ ...D.num, fontWeight: 700, color: "#C0392B" }}>+{r.over} hr</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px 14px", fontSize: 10.5, color: "#9AA0AC", lineHeight: 1.5 }}>
            {/* Pemotongan disebutkan, tidak diam-diam. */}
            {total > cap
              ? <>Showing <b>{cap}</b> of <b>{total}</b> stale deals — the rest are truncated, ordered worst first.</>
              : <>Total <b>{total}</b> deal stale.</>}
            {' '}IN_REVIEW tidak ikut dinilai (tak punya ambang yang bisa dipakai).
            Deal yang bergerak sebelum 28 Agu 2026 umurnya dihitung dari edit terakhir, jadi
            sebagian deal mandek bisa belum muncul di sini.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- sel pencapaian target ----------
   Satu sel, dua baris (Nilai + Deal). SENGAJA tidak dirata-ratakan jadi satu
   angka: dua persentase yang penyebutnya berbeda, kalau digabung, menghasilkan
   angka yang tak mewakili keadaan mana pun — sales dengan 120% nilai dan 40%
   deal akan tampil 80% dan terbaca stabil.

   Empat keadaan yang gampang tertukar dan sengaja dibedakan:
     • tak ada baris target sama sekali   → "—" tunggal (BUKAN 0%)
     • ada target, metriknya belum diisi  → baris itu "—"
     • ada target, hasilnya nol           → 0%, angka sungguhan
     • ada target nilai, hasil tak terukur → "—" + penanda (lihat komentar
       valueUnmeasured di fetchDash)

   Persentasenya sengaja TIDAK diberi warna: kolom Status di sebelahnya sudah
   memegang penilaian visual, dan dua sumbu warna yang bisa bertentangan
   (mis. 120% target tapi win rate "At Risk") justru membingungkan. */
function AttainmentCell({ att }) {
  if (!att) return <span style={{ ...D.num, color: "#9AA0AC" }}>—</span>;

  const row = (label, pct) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 10, color: "#9AA0AC", fontWeight: 600, width: 32 }}>{label}</span>
      <span style={{ ...D.num, fontWeight: 700, fontSize: 12.5, color: pct === null ? "#9AA0AC" : "#16243A" }}>
        {pct === null ? "—" : `${pct}%`}
      </span>
    </div>
  );

  // Penanda cakupan hanya relevan untuk periode multi-bulan. Angka di atasnya
  // OPTIMIS saat cakupannya belum penuh — penyebutnya lebih kecil dari target
  // sebenarnya, jadi bisa turun belakangan tanpa kinerja berubah.
  const partial = att.expectedMonths > 1 && att.monthsCovered < att.expectedMonths;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
      {row("Nilai", att.valuePct)}
      {row("Deal", att.dealsPct)}
      {att.valueUnmeasured && (
        <div style={{ fontSize: 9.5, color: "#C0392B", lineHeight: 1.35, maxWidth: 104 }}>
          nilai deal belum diisi
        </div>
      )}
      {partial && (
        <div style={{ fontSize: 9.5, color: "#9AA0AC", lineHeight: 1.35 }}>
          {att.monthsCovered}/{att.expectedMonths} bln
        </div>
      )}
    </div>
  );
}

/* ---------- sales performance table ---------- */
function salesStatus(convRate) {
  if (convRate >= 30) return "Exceeding";
  if (convRate >= 20) return "On Track";
  if (convRate >= 10) return "Need Push";
  return "At Risk";
}

function SalesPerformance({ data = [] }) {
  const [hover, setHover] = useState(-1);
  const maxConv = data.length > 0 ? Math.max(...data.map((s) => s.convRate || 0)) : 100;
  const isEmpty = data.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="award" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Sales Performance</div>
          <div style={D.cardSub}>Won deals per salesperson, from deals closed in the active period</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>
          Belum ada deal yang ditutup di periode ini
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
          <thead>
            <tr>
              <th style={D.th}>Salesperson</th>
              <th style={{ ...D.th, textAlign: "center" }}>Deal WON</th>
              <th style={{ ...D.th, textAlign: "right" }}>Won Value</th>
              <th style={{ ...D.th, textAlign: "center" }}>Win %</th>
              <th style={{ ...D.th, textAlign: "center", width: 108 }}>% Target</th>
              <th style={{ ...D.th, textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s, i) => {
              const status = salesStatus(s.convRate || 0);
              const b = STATUS_BADGE[status];
              return (
                <tr key={s.name + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                  style={{ background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
                  <td style={D.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ ...D.avatar, background: s.noOwner ? "#C7CBD4" : avatarColor(s.name) }}>
                        {s.noOwner ? "—" : initials(s.name)}
                      </span>
                      <span style={{ fontWeight: 600, color: s.noOwner ? "#7A828E" : "#16243A" }}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{s.won}</span></td>
                  <td style={{ ...D.td, textAlign: "right" }}><span style={D.num}>{rpShort(s.value)}</span></td>
                  <td style={{ ...D.td, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      <span style={{ ...D.num, fontWeight: 700, color: "#16243A" }}>{s.convRate}%</span>
                      <div style={{ height: 5, width: 60, background: "#F2F3F6", borderRadius: 4, overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: (maxConv > 0 ? (s.convRate / maxConv) * 100 : 0) + "%", background: b.fg, borderRadius: 4 }} />
                      </div>
                    </div>
                  </td>
                  {/* ── % Target ── satu kolom, dua baris. TIDAK dirata-ratakan:
                      dua persentase berpenyebut berbeda kalau dijadikan satu
                      angka akan mewakili keadaan yang tak pernah terjadi. */}
                  <td style={{ ...D.td, textAlign: "center" }}>
                    <AttainmentCell att={s.att} />
                  </td>
                  <td style={{ ...D.td, textAlign: "right" }}>
                    <span style={{ ...D.badge, background: b.bg, color: b.fg }}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Keterangan muncul HANYA saat barisnya ada — supaya angka tabel ini
            selalu bisa dicocokkan dengan kartu Win Rate tanpa user menebak ke
            mana perginya selisihnya. */}
        {data.some((s) => s.noOwner) && (
          <div style={{ padding: "10px 16px 14px", fontSize: 11.5, color: "#7A828E", lineHeight: 1.5 }}>
            <b>Unassigned</b> = deals that <code>owner_id</code>-nya belum terisi, jadi belum bisa
            diatribusikan ke salesperson mana pun. Barisnya tetap dihitung agar total di sini
            cocok dengan kartu Win Rate dan grafik Pipeline by Stage.
          </div>
        )}
        </div>
      )}
    </div>
  );
}

/* ---------- recent activity ---------- */
function RecentActivity({ items = ACTIVITY }) {
  const [hover, setHover] = useState(-1);
  const list = items.length > 0 ? items : [];
  if (list.length === 0) {
    return (
      <div className="om-card" style={D.card}>
        <div style={D.cardHead}>
          <div style={D.cardIco}><Icon name="activity" size={18} /></div>
          <div><div style={D.cardTitle}>Recent Activity</div><div style={D.cardSub}>Prospect, inquiry, quotation & aktivitas terbaru</div></div>
        </div>
        <div style={{ padding: "32px 20px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>No activity yet</div>
      </div>
    );
  }
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="activity" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Recent Activity</div>
          <div style={D.cardSub}>Prospect, inquiry, quotation & aktivitas terbaru</div>
        </div>
      </div>
      <div style={D.actBody}>
        {list.map((a, i) => {
          const m = ACT_META[a.type] || ACT_META.prospect;
          const last = i === list.length - 1;
          return (
            <div key={i} className="nx-act-row" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
              style={{ ...D.actRow, borderBottom: last ? "none" : D.actRow.borderBottom, marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8, borderRadius: 9, background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
              <div style={{ ...D.actIco, background: m.bg, color: m.fg }}><Icon name={m.icon} size={18} /></div>
              {/* content: desktop = row [text | meta]; mobile (<1024px) = column (meta drops below name) */}
              <div className="nx-act-content" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={D.actText}>{a.text}</div>
                  <div style={D.actCo}>{a.co}</div>
                </div>
                <div className="nx-act-meta" style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  <span style={D.actTime}>{a.time}</span>
                  {a.user && a.user !== '—' && (
                    <span style={D.userBadge}>
                      <span style={{ ...D.userBadgeAv, background: avatarColor(a.user) }}>{initials(a.user)}</span>
                      {a.user}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- tab navigation ---------- */
const DASH_TABS = [
  { id: "summary",  label: "Summary",   icon: "layoutdashboard" },
  { id: "calendar", label: "Calendar",  icon: "calendar" },
];
function DashTab({ tab, active, onSelect }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={() => onSelect(tab.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...D.tab, ...(active ? D.tabActive : (h ? D.tabHover : null)) }}>
      <Icon name={tab.icon} size={16} />
      <span>{tab.label}</span>
      {active ? <span style={D.tabInd} /> : null}
    </button>
  );
}
function DashTabs({ active, onSelect }) {
  return <div style={D.tabBar}>{DASH_TABS.map((t) => <DashTab key={t.id} tab={t} active={active === t.id} onSelect={onSelect} />)}</div>;
}

/* ---------- visit status badge ---------- */
const VISIT_STATUS = {
  scheduled: { bg: "#EFF6FF", fg: "#3B82F6", label: "Terjadwal",  dot: "#3B82F6" },
  completed: { bg: "#F0FDF4", fg: "#22C55E", label: "Selesai",    dot: "#22C55E" },
  cancelled: { bg: "#FFF1F2", fg: "#EF4444", label: "Dibatalkan", dot: "#EF4444" },
};
const VISIT_STAGES = ['scheduled', 'completed', 'cancelled'];

/* Visits live in `activities` (status: todo/done/cancelled). The visit UI keeps
   its own vocabulary (scheduled/completed/cancelled) — map between the two on
   read/write. activity_logs keep the visit vocabulary (matches migrated rows). */
const ACT_TO_VISIT_STATUS = { todo: 'scheduled', done: 'completed', cancelled: 'cancelled' };
const VISIT_TO_ACT_STATUS = { scheduled: 'todo', completed: 'done', cancelled: 'cancelled' };

/* Roster operasional (sales + gm_bd) → helper bersama `./salesRoster`. */

/* ---------- visit type (BD-07) ---------- */
const VISIT_TYPES = [
  { id: 'discovery',             label: 'Discovery Visit',       desc: 'Explore new prospect needs',       output: 'Output: Discovery Notes lengkap + next step jelas' },
  { id: 'solution_presentation', label: 'Solution Presentation', desc: 'Presentasi solusi',                  output: 'Output: Feedback recorded + komitmen ke RFQ' },
  { id: 'qbr',                   label: 'QBR Visit',             desc: 'Quarterly Business Review (Tier A)',  output: 'Output: Signed-off action items + JBP refresh' },
  { id: 'problem_solving',       label: 'Problem Solving',       desc: 'Resolusi complaint/issue',           output: 'Output: SLA improvement plan signed-off' },
  { id: 'routine_touch',         label: 'Routine Touch',         desc: 'Relationship maintenance Tier B/C',   output: 'Output: Relationship notes updated' },
];
const VISIT_TYPE_MAP = Object.fromEntries(VISIT_TYPES.map(t => [t.id, t]));

/* ---------- calendar view — real Supabase data ---------- */
/* ---------- VisitStepper — shared by form and detail ---------- */
function VisitStepper({ status, onStageClick }) {
  const activeIdx = VISIT_STAGES.indexOf(status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, userSelect: 'none' }}>
      {VISIT_STAGES.map((s, i) => {
        const meta    = VISIT_STATUS[s];
        const isActive = i === activeIdx;
        const isDone   = i < activeIdx;
        const color    = isActive || isDone ? meta.dot : '#D1D5DB';
        const bgColor  = isActive ? meta.dot : isDone ? meta.dot + '30' : '#F9FAFB';
        const border   = isActive ? `2px solid ${meta.dot}` : isDone ? `2px solid ${meta.dot}60` : '2px solid #D1D5DB';
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <div style={{ flex: 1, height: 2, background: isDone ? VISIT_STATUS[VISIT_STAGES[i-1]].dot + '40' : '#E5E7EB', margin: '0 4px', marginBottom: 18 }} />
            )}
            <div
              onClick={() => onStageClick?.(s)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: onStageClick ? 'pointer' : 'default' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: bgColor, border,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700,
                color: isActive ? '#fff' : color,
                transition: 'all .18s',
              }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? meta.dot : '#9CA3AF', whiteSpace: 'nowrap' }}>
                {meta.label}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- AddVisitModal ---------- */
function AddVisitModal({ open, onClose, onSave, saving, error, draft, setDraft, salesProfiles, prospectOptions, isEdit, canCancel, onCancelBlocked }) {
  if (!open) return null;

  const status = draft.status || 'scheduled';

  const inp = (props) => (
    <input {...props} style={{
      width: '100%', height: 38, borderRadius: 8,
      border: '1px solid #E5E7EB', padding: '0 12px',
      fontSize: 13, fontFamily: 'inherit', outline: 'none',
      boxSizing: 'border-box', background: 'white',
    }} />
  );
  const sel = (props) => (
    <select {...props} style={{
      width: '100%', height: 38, borderRadius: 8,
      border: '1px solid #E5E7EB', padding: '0 12px',
      fontSize: 13, fontFamily: 'inherit', outline: 'none',
      boxSizing: 'border-box', background: 'white', cursor: 'pointer',
    }} />
  );
  const lbl = (text, req) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
      {text}{req && <span style={{ color: '#EF4444' }}> *</span>}
    </div>
  );
  const ta = (value, onChange, placeholder, rows = 3) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{ width: '100%', borderRadius: 8, border: '1px solid #E5E7EB', padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
    />
  );

  const st = VISIT_STATUS[status];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, maxWidth: 520, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>VISIT SCHEDULE</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827', fontFamily: "'Montserrat',sans-serif" }}>
              {isEdit ? 'Edit Visit' : 'Add Visit'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="x" size={16} color="#6B7280" />
          </button>
        </div>

        {/* Stepper — klik untuk ganti status */}
        <VisitStepper
          status={status}
          onStageClick={(s) => {
            if (s === 'cancelled' && !canCancel) {
              onCancelBlocked?.();
              return;
            }
            setDraft(d => ({ ...d, status: s }));
          }}
        />

        {/* Stage context hint */}
        <div style={{ background: st.bg, border: `1px solid ${st.dot}30`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: st.fg, fontWeight: 600 }}>
          {status === 'scheduled' && 'Fill in the agenda for the upcoming visit.'}
          {status === 'completed' && 'Meeting completed. Fill in the outcome and follow-up.'}
          {status === 'cancelled' && 'Visit cancelled. Fill in the cancellation reason.'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Jenis Kunjungan (BD-07) */}
          <div>
            {lbl('Visit Type', true)}
            {sel({
              value: draft.visit_type || '',
              onChange: e => setDraft(d => ({ ...d, visit_type: e.target.value })),
              children: [
                <option key="" value="">— Select Visit Type —</option>,
                ...VISIT_TYPES.map(t => <option key={t.id} value={t.id}>{`${t.label} — ${t.desc}`}</option>),
              ],
            })}
            {draft.visit_type && VISIT_TYPE_MAP[draft.visit_type] && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>
                {VISIT_TYPE_MAP[draft.visit_type].output}
              </div>
            )}
          </div>

          {/* Prospect / Customer + Salesperson */}
          <div className="nx-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Prospect / Customer')}
              {sel({
                value: draft.prospect_id,
                onChange: e => setDraft(d => ({ ...d, prospect_id: e.target.value })),
                children: [
                  <option key="" value="">— Optional —</option>,
                  ...(prospectOptions.length === 0 ? [<option key="__empty" value="" disabled>All accounts are currently in the Lead Pool. Claim one from the Lead Pool first to use it.</option>] : []),
                  ...prospectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>),
                ],
              })}
            </div>
            <div>
              {lbl('Salesperson', true)}
              {sel({
                value: draft.salesperson_id,
                onChange: e => setDraft(d => ({ ...d, salesperson_id: e.target.value })),
                children: [
                  <option key="" value="">— Select —</option>,
                  ...salesProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>),
                ],
              })}
            </div>
          </div>

          {/* Tanggal + Waktu */}
          <div className="nx-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {lbl('Visit Date', true)}
              {inp({ type: 'date', value: draft.visit_date, onChange: e => setDraft(d => ({ ...d, visit_date: e.target.value })) })}
            </div>
            <div>
              {lbl('Waktu')}
              {inp({ type: 'time', value: draft.visit_time, onChange: e => setDraft(d => ({ ...d, visit_time: e.target.value })) })}
            </div>
          </div>

          {/* Lokasi */}
          <div>
            {lbl('Lokasi')}
            {inp({ type: 'text', placeholder: 'cth: Kantor PT ABC, Jakarta Utara', value: draft.location, onChange: e => setDraft(d => ({ ...d, location: e.target.value })) })}
          </div>

          {/* Stage 1 — Agenda editable */}
          {status === 'scheduled' && (
            <div>
              {lbl('Agenda / Points of Meeting')}
              {ta(draft.point_of_meeting, e => setDraft(d => ({ ...d, point_of_meeting: e.target.value })), 'Points to be discussed during the visit...')}
            </div>
          )}

          {/* Stage 2 & 3 — Agenda readonly card + stage-specific fields */}
          {(status === 'completed' || status === 'cancelled') && (
            <>
              {/* Readonly agenda card */}
              <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Planned agenda</div>
                <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: draft.point_of_meeting?.trim() ? '#374151' : '#9CA3AF', fontStyle: draft.point_of_meeting?.trim() ? 'normal' : 'italic', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {draft.point_of_meeting?.trim() || 'No agenda recorded.'}
                </div>
              </div>

              {/* COMPLETED extra fields */}
              {status === 'completed' && (
                <>
                  <div>
                    {lbl('Minute of Meeting (MOM)')}
                    {ta(draft.mom, e => setDraft(d => ({ ...d, mom: e.target.value })), 'Full notes from the meeting...', 4)}
                  </div>
                  <div>
                    {lbl('Follow-up')}
                    {ta(draft.follow_up, e => setDraft(d => ({ ...d, follow_up: e.target.value })), 'Follow-up actions required...')}
                  </div>
                </>
              )}

              {/* CANCELLED extra field */}
              {status === 'cancelled' && (
                <div>
                  {lbl('Cancellation Reason', true)}
                  {ta(draft.notes, e => setDraft(d => ({ ...d, notes: e.target.value })), 'Explain why the visit was cancelled...')}
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #D1D5DB', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Batal
            </button>
            <button onClick={onSave} disabled={saving} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: st.dot, color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Visit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- VisitDetailModal ---------- */
function VisitDetailModal({ visit, onClose, onEdit }) {
  const [logs,     setLogs]     = useState([]);
  const [logsLoad, setLogsLoad] = useState(false);

  useEffect(() => {
    if (!visit?.id) return;
    setLogsLoad(true);
    // activity_logs (replaces the old visit-logs table). changed_by has no profiles FK →
    // resolve author names client-side (all profiles, no active filter).
    supabase
      .from('activity_logs')
      .select('id, changed_at, from_status, to_status, notes, changed_by')
      .eq('activity_id', visit.id)
      .order('changed_at', { ascending: false })
      .limit(50)
      .then(async ({ data }) => {
        const rows = data || [];
        const ids = [...new Set(rows.map(l => l.changed_by).filter(Boolean))];
        const nm = {};
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
          (profs || []).forEach(p => { nm[p.id] = p.full_name; });
        }
        setLogs(rows.map(l => ({ ...l, profiles: { full_name: l.changed_by ? (nm[l.changed_by] || null) : null } })));
        setLogsLoad(false);
      });
  }, [visit?.id]);

  if (!visit) return null;
  const st = VISIT_STATUS[visit.status || 'scheduled'] || VISIT_STATUS.scheduled;

  const row = (label, value) => value ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 14, borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{value}</div>
    </div>
  ) : null;

  const dateObj = visit.date ? new Date(visit.date + 'T00:00:00') : null;
  const MONTHS  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const DAYS    = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const dateStr = dateObj
    ? `${DAYS[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`
    : '—';

  const fmtLogTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const logLabel = (log) => {
    if (!log.from_status && log.to_status) return `Visit dibuat → ${VISIT_STATUS[log.to_status]?.label || log.to_status}`;
    if (log.from_status !== log.to_status)
      return `${VISIT_STATUS[log.from_status]?.label || log.from_status} → ${VISIT_STATUS[log.to_status]?.label || log.to_status}`;
    return 'Visit updated';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 32, maxWidth: 500, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.20)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>VISIT DETAILS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827', fontFamily: "'Montserrat',sans-serif" }}>
                {visit.prospect !== '—' ? visit.prospect : 'General Visit'}
              </h2>
              <span style={{ background: st.bg, color: st.fg, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="x" size={16} color="#6B7280" />
          </button>
        </div>

        {/* Stepper — read-only */}
        <VisitStepper status={visit.status || 'scheduled'} onStageClick={null} />

        {/* Info rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {visit.visit_type && VISIT_TYPE_MAP[visit.visit_type] && row(
            'Visit Type',
            `${VISIT_TYPE_MAP[visit.visit_type].label} — ${VISIT_TYPE_MAP[visit.visit_type].desc}\n${VISIT_TYPE_MAP[visit.visit_type].output}`,
          )}
          {row('Date & Time', dateStr + (visit.time ? ' · ' + visit.time.slice(0,5) : ''))}
          {row('Salesperson', visit.salesperson !== '—' ? visit.salesperson : null)}
          {row('Lokasi', visit.location !== '—' ? visit.location : null)}
          {row('Agenda / Points of Meeting', visit.point_of_meeting || null)}
          {visit.status === 'completed' && row('Minute of Meeting (MOM)', visit.mom || null)}
          {visit.status === 'completed' && row('Follow-up', visit.follow_up || null)}
          {visit.status === 'cancelled' && row('Cancellation Reason', visit.notes || null)}
        </div>

        {/* History section */}
        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Change History</div>
          {logsLoad ? (
            <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0' }}>Loading history…</div>
          ) : logs.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF', padding: '8px 0' }}>No change history yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {logs.map((log, i) => {
                const isStatus = log.from_status !== log.to_status || !log.from_status;
                const dotColor = log.to_status ? (VISIT_STATUS[log.to_status]?.dot || '#9CA3AF') : '#9CA3AF';
                return (
                  <div key={log.id || i} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
                    {/* Timeline line + dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, border: `2px solid ${dotColor}`, marginTop: 2, flexShrink: 0 }} />
                      {i < logs.length - 1 && <div style={{ width: 2, flex: 1, background: '#E5E7EB', marginTop: 3 }} />}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{logLabel(log)}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: log.notes ? 4 : 0 }}>
                        {log.profiles?.full_name || '—'} · {fmtLogTime(log.changed_at)}
                      </div>
                      {log.notes && <div style={{ fontSize: 12, color: '#6B7280', background: '#F9FAFB', borderRadius: 6, padding: '5px 9px', whiteSpace: 'pre-wrap' }}>{log.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 16, borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #D1D5DB', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Tutup
          </button>
          <button onClick={onEdit} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#144682', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function DashCalendar({
  visits = [], loading = false, isSuper = false,
  anchor, mode = 'month', range = { from: '', to: '' },
  onPrevMonth, onNextMonth, onThisMonth, onApplyRange,
  onAddVisit, onDayClick, onVisitClick,
}) {
  const isMobile = useIsMobile();
  const [dayPopup, setDayPopup] = useState(null); // mobile day-detail sheet: { label, dateKey, visits }
  // Client-side filters — all period data is already loaded, so filtering the
  // calendar needs no refetch (mirrors RiwayatVisitPage's combinable filters).
  const [fSales,  setFSales]  = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fEntity, setFEntity] = useState('all');
  const [fType,   setFType]   = useState('all');

  const now = new Date();
  const year  = anchor.getFullYear();
  const month = anchor.getMonth();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const todayDate = now.getDate();

  const MONTH_LABELS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const DOW = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"];

  const firstDay = new Date(year, month, 1).getDay();   // 0=Sun
  const offset   = (firstDay + 6) % 7;                  // Monday-first offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Filter options derived from the loaded visits
  const salesMap = {};
  visits.forEach(v => { if (v.salesperson_id) salesMap[v.salesperson_id] = v.salesperson; });
  const salesOptions  = Object.entries(salesMap).map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const entityOptions = [...new Set(visits.map(v => v.entity).filter(e => e && e !== '—'))].sort();
  const typeOptions   = [...new Set(visits.map(v => v.visit_type).filter(Boolean))];

  // Apply client-side filters (combinable)
  const shown = visits.filter(v => {
    if (fSales  !== 'all' && v.salesperson_id !== fSales) return false;
    if (fStatus !== 'all' && (v.status || 'scheduled') !== fStatus) return false;
    if (isSuper && fEntity !== 'all' && v.entity !== fEntity) return false;
    if (fType   !== 'all' && v.visit_type !== fType) return false;
    return true;
  });
  const filtersActive = fSales !== 'all' || fStatus !== 'all' || fEntity !== 'all' || fType !== 'all';
  const resetFilters = () => { setFSales('all'); setFStatus('all'); setFEntity('all'); setFType('all'); };

  // Group filtered visits by date string "YYYY-MM-DD"
  const visitsByDay = {};
  shown.forEach(v => {
    if (!v.date) return;
    const key = v.date.slice(0, 10);
    if (!visitsByDay[key]) visitsByDay[key] = [];
    visitsByDay[key].push(v);
  });

  // Build cell array
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n) => String(n).padStart(2, '0');
  const totalVisits = shown.length;

  const fmtRangeD = (s) => { const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? s : `${d.getDate()} ${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
  const inRange  = mode === 'range' && range.from && range.to;
  const subLabel = inRange ? `Range: ${fmtRangeD(range.from)} – ${fmtRangeD(range.to)}` : `Sales team visits — ${MONTH_LABELS[month]} ${year}`;

  // control styles (white toolbar below the navy header)
  const selSm  = { height: 34, border: '1px solid #E3E7EE', borderRadius: 8, background: '#fff', padding: '0 9px', fontSize: 12.5, color: '#2A3340', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' };
  const dateSm = { height: 34, border: '1px solid #E3E7EE', borderRadius: 8, background: '#fff', padding: '0 8px', fontSize: 12, color: '#2A3340', outline: 'none', fontFamily: 'inherit' };
  const navBtn = { width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E3E7EE', borderRadius: 8, background: '#fff', cursor: 'pointer', color: NAVY, fontSize: 18, lineHeight: 1, fontFamily: 'inherit' };

  return (
    <div className="om-card" style={D.card}>
      <div style={{ ...D.cardHead, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={D.cardIco}><Icon name="calendar" size={18} /></div>
          <div>
            <div style={D.cardTitle}>Sales Visit Schedule</div>
            <div style={D.cardSub}>{subLabel}</div>
          </div>
        </div>
        {/* Ikut header kartu yang kini abu muda: putih-transparan di atas navy
            solid dulu terbaca, di latar terang jadi tak kelihatan. */}
        <button
          onClick={onAddVisit}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#EAF0F8", border: "1px solid #C3D3E8", color: NAVY, borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <Icon name="plus" size={14} />
          Add Visit
        </button>
      </div>

      {/* toolbar — month nav (left) + filters & custom range (right) */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F0F1F4" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={onPrevMonth} title="Previous month" style={navBtn}>‹</button>
          <div style={{ minWidth: 138, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#16243A", fontFamily: "'Montserrat',system-ui,sans-serif" }}>{MONTH_LABELS[month]} {year}</div>
          <button onClick={onNextMonth} title="Next month" style={navBtn}>›</button>
          <button onClick={onThisMonth} style={{ height: 34, border: "1px solid #CFDDF0", borderRadius: 8, background: "#EAF0F8", color: NAVY, padding: "0 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>This Month</button>
        </div>

        <div style={{ flex: 1, minWidth: 8 }} />

        <select value={fSales} onChange={e => setFSales(e.target.value)} style={selSm} title="Sales">
          <option value="all">All Salespeople</option>
          {salesOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={selSm} title="Status">
          <option value="all">All Statuses</option>
          {VISIT_STAGES.map(s => <option key={s} value={s}>{VISIT_STATUS[s].label}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={selSm} title="Visit type">
          <option value="all">All Types</option>
          {typeOptions.map(t => <option key={t} value={t}>{VISIT_TYPE_MAP[t]?.label || t}</option>)}
        </select>
        {isSuper && (
          <select value={fEntity} onChange={e => setFEntity(e.target.value)} style={selSm} title="Entitas">
            <option value="all">All Entities</option>
            {entityOptions.map(en => <option key={en} value={en}>{en}</option>)}
          </select>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={range.from} max={range.to || undefined} onChange={e => onApplyRange(e.target.value, range.to)} style={dateSm} title="From date" />
          <span style={{ color: "#9AA3B2", fontSize: 12 }}>–</span>
          <input type="date" value={range.to} min={range.from || undefined} onChange={e => onApplyRange(range.from, e.target.value)} style={dateSm} title="To date" />
        </div>

        {(filtersActive || inRange) && (
          <button onClick={() => { resetFilters(); if (mode === 'range') onThisMonth(); }} style={{ height: 34, border: "1px solid #E3E7EE", borderRadius: 8, background: "#fff", color: "#6B7686", padding: "0 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
        )}
      </div>

      {/* stats row */}
      <div style={{ display: "flex", gap: 20, padding: "10px 16px 0", borderBottom: "1px solid #F0F1F4", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ padding: "8px 0", fontSize: 12, color: "#7A828E" }}>
          <b style={{ color: NAVY, fontFamily: "'Montserrat',system-ui,sans-serif", fontWeight: 800 }}>{totalVisits}</b> {inRange ? "scheduled in range" : "scheduled this month"}
        </div>
        {Object.entries(VISIT_STATUS).map(([key, meta]) => {
          const cnt = shown.filter(v => (v.status || 'scheduled') === key).length;
          if (cnt === 0) return null;
          return (
            <div key={key} style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ ...D.badge, background: meta.bg, color: meta.fg, padding: "2px 7px", fontSize: 10 }}>{meta.label}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, color: "#16243A" }}>{cnt}</span>
            </div>
          );
        })}
        {loading && <div style={{ padding: "8px 0", fontSize: 12, color: "#9AA3B2" }}>Loading…</div>}
      </div>

      {/* day headers */}
      <div style={D.calGridHead}>
        {DOW.map((d) => <div key={d} className="nx-cal-dow" style={D.calDow}>{d}</div>)}
      </div>

      {/* grid — desktop: event text in cell; mobile (<1024px): pastel dots, tap → day sheet */}
      <div style={D.calGrid}>
        {cells.map((d, i) => {
          const isToday = isCurrentMonth && d === todayDate;
          const dateKey = d ? `${year}-${pad(month + 1)}-${pad(d)}` : null;
          const dayVisits = dateKey ? (visitsByDay[dateKey] || []) : [];
          return (
            <div key={i}
              className="nx-cal-cell"
              onClick={d ? () => {
                // Mobile + has visits → open day sheet; else fall back to add-visit-for-date.
                if (isMobile && dayVisits.length > 0) {
                  setDayPopup({ label: `${d} ${MONTH_LABELS[month]} ${year}`, dateKey, visits: dayVisits });
                } else {
                  onDayClick?.(dateKey);
                }
              } : undefined}
              onMouseEnter={d ? (e) => { if (!isToday) e.currentTarget.style.background = '#F0F4FA'; } : undefined}
              onMouseLeave={d ? (e) => { if (!isToday) e.currentTarget.style.background = ''; } : undefined}
              style={{
                ...D.calCell,
                ...(d ? null : D.calCellMuted),
                ...(isToday ? D.calCellToday : null),
                cursor: d ? 'pointer' : 'default',
              }}>
              {d ? (
                isToday
                  ? <div style={D.calNumToday}>{d}</div>
                  : <div style={D.calNum}>{d}</div>
              ) : null}

              {/* DESKTOP (≥1024px): full event text in cell */}
              <div className="hidden lg:block">
                {dayVisits.slice(0, 3).map((v, j) => {
                  const st = VISIT_STATUS[v.status || 'scheduled'] || VISIT_STATUS.scheduled;
                  return (
                    <div key={j}
                      onClick={e => { e.stopPropagation(); onVisitClick?.(v); }}
                      style={{ ...D.calEvent, borderLeftColor: st.fg, background: st.bg + "88", cursor: 'pointer' }}>
                      <div style={D.calEventProspect} title={v.prospect}>{v.prospect}</div>
                      <div style={D.calEventMeta}>
                        {v.time ? v.time.slice(0, 5) + ' · ' : ''}{v.salesperson !== '—' ? v.salesperson : ''}
                      </div>
                    </div>
                  );
                })}
                {dayVisits.length > 3 && (
                  <div style={{ fontSize: 10, color: "#9AA0AC", fontWeight: 600, paddingLeft: 2 }}>+{dayVisits.length - 3} lainnya</div>
                )}
              </div>

              {/* MOBILE (<1024px): pastel dot indicators */}
              {dayVisits.length > 0 && (
                <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 2.5, marginTop: 2, flexWrap: 'wrap' }}>
                  {dayVisits.slice(0, 3).map((v, j) => (
                    <span key={j} style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                      background: VISIT_DOT_PASTEL[v.status || 'scheduled'] || VISIT_DOT_PASTEL.scheduled }} />
                  ))}
                  {dayVisits.length > 3 && (
                    <span style={{ fontSize: 8.5, fontWeight: 700, color: '#9AA0AC', lineHeight: 1 }}>+{dayVisits.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MOBILE day-detail sheet (bottom sheet) — opened by tapping a date with visits */}
      {dayPopup && (
        <div onClick={() => setDayPopup(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '18px 18px 24px', maxHeight: '72vh', overflowY: 'auto', boxShadow: '0 -8px 30px rgba(10,20,40,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontFamily: "'Montserrat',system-ui,sans-serif", fontWeight: 800, fontSize: 16, color: '#16243A' }}>{dayPopup.label}</div>
              <button onClick={() => setDayPopup(null)} aria-label="Tutup"
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #ECEDF1', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280' }}>
                <Icon name="x" size={15} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {dayPopup.visits.map((v, j) => {
                const st = VISIT_STATUS[v.status || 'scheduled'] || VISIT_STATUS.scheduled;
                return (
                  <button key={j} onClick={() => { onVisitClick?.(v); setDayPopup(null); }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', width: '100%', background: '#FAFBFC', border: '1px solid #F0F1F4', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: VISIT_DOT_PASTEL[v.status || 'scheduled'] || VISIT_DOT_PASTEL.scheduled }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#16243A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.prospect}</div>
                      <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 2 }}>
                        {v.time ? <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{v.time.slice(0, 5)}</span> : null}
                        {v.time && v.salesperson !== '—' ? ' · ' : ''}{v.salesperson !== '—' ? v.salesperson : ''}
                      </div>
                    </div>
                    <span style={{ ...D.badge, background: st.bg, color: st.fg, padding: '2px 8px', fontSize: 10, flexShrink: 0 }}>{st.label}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { const k = dayPopup.dateKey; setDayPopup(null); onDayClick?.(k); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Icon name="plus" size={15} /> Add Visit
            </button>
          </div>
        </div>
      )}

      {totalVisits === 0 && (
        <div style={{ padding: "20px", textAlign: "center", color: "#9AA0AC", fontSize: 13, borderTop: "1px solid #F4F5F7" }}>
          Belum ada jadwal visit bulan ini. Klik "+ Add Visit" untuk menambah jadwal.
        </div>
      )}

      {/* Visit List */}
      {visits.length > 0 && (
        <div style={{ borderTop: '1px solid #F0F1F4', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
            Daftar Kunjungan Bulan Ini
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...visits]
              .sort((a, b) => (a.date + (a.time || '')) > (b.date + (b.time || '')) ? 1 : -1)
              .map((v, i) => {
                const st = VISIT_STATUS[v.status || 'scheduled'] || VISIT_STATUS.scheduled;
                const dateObj = new Date(v.date + 'T00:00:00');
                const dayName = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][dateObj.getDay()];
                const dayNum  = dateObj.getDate();
                const isPast  = new Date(v.date) < new Date(new Date().toDateString());
                return (
                  <div key={v.id || i}
                    onClick={() => onVisitClick?.(v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: isPast && v.status === 'scheduled' ? '#FFFBEB' : '#F9FAFB',
                      border: '1px solid #F0F1F4',
                      opacity: v.status === 'cancelled' ? 0.6 : 1,
                      cursor: 'pointer',
                    }}>
                    {/* Date badge */}
                    <div style={{ textAlign: 'center', minWidth: 40 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' }}>{dayName}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#144682', fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.1 }}>{dayNum}</div>
                    </div>
                    {/* Divider */}
                    <div style={{ width: 1, height: 36, background: '#E5E7EB' }} />
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.prospect || 'General Visit'}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                        {v.salesperson !== '—' ? v.salesperson : '—'}
                        {v.time ? ' · ' + v.time.slice(0, 5) : ''}
                        {v.location ? ' · ' + v.location : ''}
                      </div>
                    </div>
                    {/* Status badge */}
                    <span style={{ ...D.badge, background: st.bg, color: st.fg, fontSize: 10, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}
    </div>
  );
}

/* ── time-ago helper ─────────────────────────────────────────────────────── */
function fmtTimeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff} seconds ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

/* Urutan/label/warna funnel kini hidup di INQ_STAGE_* (dekat puncak file),
   turunan langsung dari inquiries.status. Trio STAGE_ORDER/STAGE_COLORS/
   STAGE_LABELS lama ikut dilepas bersama sumbu accounts.pipeline_stage. */

/* ========================================================================= */
/* ---------- S2: "Aktivitas Saya" personal target tracker (sales view) ---------- */
function ActivityItem({ label, value, target, sublabel }) {
  const ratio = target > 0 ? value / target : 0;
  const pct   = Math.min(ratio * 100, 100);
  const color = ratio >= 1 ? '#22C55E' : ratio >= 0.5 ? '#F59E0B' : '#EF4444';
  const status = ratio >= 1 ? 'On Track' : ratio >= 0.5 ? 'Perlu ditingkatkan' : 'Below target';
  return (
    <div style={{ background: '#fff', border: '1px solid #E8EBF0', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2430' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{sublabel || status}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#1F2430', fontFamily: "'IBM Plex Mono',monospace" }}>{value}</span>
        <span style={{ fontSize: 13, color: '#9AA0AC' }}>/ {target}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: '#EEF0F3', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function ActivitySaya({ data }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Blok ini SENGAJA tidak mengikuti selector periode: metrik kadens
          dengan target per-minggu/per-bulan. Penanda di bawah supaya tidak
          terbaca ikut berubah saat periode diganti. */}
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.5px', color: '#6B7280', textTransform: 'uppercase', marginBottom: 2 }}>
        Aktivitas Saya — Minggu Ini &amp; Bulan Ini
      </div>
      <div style={{ fontSize: 11.5, color: '#9AA0AC', marginBottom: 12 }}>
        Selalu minggu &amp; bulan berjalan — tidak mengikuti filter periode di atas.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <ActivityItem label="Calls This Week"     value={data.callsThisWeek}        target={60} />
        <ActivityItem label="Visits This Week"    value={data.visitsThisWeek}       target={5} />
        <ActivityItem label="Quotations This Month" value={data.quotationsThisMonth}  target={20} />
        <ActivityItem label="New SQL This Month"  value={data.sqlThisMonth}         target={15} sublabel="Qualified Lead" />
      </div>
    </div>
  );
}

function CRMDashboardPage() {
  const { profile, erpRole } = useAuth();
  // Sales/operations may cancel their OWN visits (the visit list is already scoped
  // to assigned_to/created_by = self, and RLS only permits the owner to UPDATE).
  const canCancel = ['super_admin', 'admin', 'ceo', 'gm', 'manager', 'sales', 'operations'].includes(erpRole);
  // S2 — sales/operations see a personal dashboard; everyone else sees team-wide.
  const isSalesOnly = ['sales', 'operations'].includes(erpRole);
  // Cakupan entitas — definisi SAMA dengan PipelineKanbanPage supaya super_admin
  // tidak melihat dua cakupan berbeda di dua halaman modul yang sama.
  const isAllEntities = ['super_admin'].includes(erpRole);
  const [period, setPeriod] = useState("This Month");
  const [tab, setTab]       = useState("summary");
  const [toast, setToast]   = useState({ msg: "", icon: "check", show: false });
  const toastTimer          = useRef(null);
  const PERIODS = ["This Month", "This Quarter", "This Year"];

  // ── real data state ──────────────────────────────────────────────────────
  const [dashData,    setDashData]    = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError,   setDashError]   = useState(null);
  // Daftar bagian data sekunder yang gagal dimuat. Kegagalan sekunder tidak
  // mengosongkan halaman, tapi WAJIB terlihat — angka nol yang lahir dari fetch
  // gagal tak bisa dibedakan dari nol yang memang benar.
  const [partialFail, setPartialFail] = useState([]);

  // ── add visit modal state ────────────────────────────────────────────────
  const [addVisitOpen,     setAddVisitOpen]     = useState(false);
  const [visitDraft,       setVisitDraft]       = useState({
    visit_date: '', visit_time: '', prospect_id: '',
    salesperson_id: '', location: '', notes: '', status: 'scheduled',
    visit_type: '', point_of_meeting: '', mom: '', follow_up: '',
  });
  const [visitSaving,      setVisitSaving]      = useState(false);
  const [visitError,       setVisitError]       = useState(null);
  const [salesProfiles,    setSalesProfiles]    = useState([]);
  const [prospectOptions,  setProspectOptions]  = useState([]);
  // detail + edit state
  const [visitDetail,      setVisitDetail]      = useState(null);
  const [editVisitId,      setEditVisitId]      = useState(null);

  // ── calendar period state (decoupled from fetchDash) ─────────────────────
  // ONE active period source at a time: month-mode (calAnchor) OR range-mode
  // (calRange). Arrow/Bulan Ini → month-mode + clear range; applying a full
  // range → range-mode. calAnchor = first-of-displayed-month.
  const isSuper = erpRole === 'super_admin';
  const [calAnchor, setCalAnchor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [calMode,   setCalMode]   = useState('month');           // 'month' | 'range'
  const [calRange,  setCalRange]  = useState({ from: '', to: '' });
  const [calVisits, setCalVisits] = useState([]);
  const [calLoading, setCalLoading] = useState(true);

  // useCallback with an empty dependency array — same fix as App.jsx's
  // showToast (2026-08-05, BNF Fase G 403 incident): this closes over only
  // setToast (useState setter, stable) and toastTimer (useRef object, stable
  // — mutating .current doesn't require it in deps). Dipertahankan meski
  // konsumen aslinya (ActivityReportTab) sudah dihapus: identitas stabil ini
  // syarat aman bagi komponen anak mana pun yang menaruh showToast di
  // dependency array fetch-effect-nya — kalau identitasnya berubah tiap render,
  // fetch gagal → showToast → set state → render → refire, loop yang sama
  // dengan insiden BNF Fase G.
  const showToast = useCallback((msg, icon) => {
    setToast({ msg, icon: icon || "info", show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }, []);

  // ── fetch dashboard data from Supabase ───────────────────────────────────
  const fetchDash = useCallback(async () => {
    if (!profile?.company_id) return;
    setDashLoading(true);
    setDashError(null);
    setPartialFail([]);
    try {
      const cid = profile.company_id;
      const uid = profile.id;
      const now = new Date();
      const P   = periodRange(period, now);

      /* Scope ENTITAS — diselaraskan dengan applyScope PipelineKanbanPage:
         super_admin lintas entitas (tanpa filter company_id), sisanya terkunci
         ke entitasnya. Sebelumnya dashboard SELALU mengunci company_id, jadi
         super_admin melihat cakupan lebih sempit di sini dibanding di papan
         Pipeline — dua angka berbeda untuk pertanyaan yang sama. */
      const byCompany = (q) => (isAllEntities ? q : q.eq('company_id', cid));

      /* Scope KEPEMILIKAN, sengaja dua macam:
         - accounts  : tetap `assigned_to OR created_by` (perilaku lama yang
                       DIPERTAHANKAN — untuk sebuah AKUN, "punya saya" memang
                       wajar mencakup yang di-assign ke saya maupun yang saya
                       buat). Di luar scope batch ini.
         - inquiries : `owner_id` SAJA, sama persis dengan applyScope di
                       PipelineKanbanPage. `created_by` sengaja DILEPAS dari
                       sini: kepemilikan deal bisa dioper, dan selama created_by
                       ikut di-OR, deal yang sudah dioper akan tetap menempel di
                       Dashboard pembuat lamanya — bertentangan dengan papan
                       Pipeline yang sudah pindah. Cermin RLS `inquiries_read`
                       sesudah migrasi 20260830000003. */
      const ownAccounts  = (q) => (isSalesOnly ? q.or(`assigned_to.eq.${uid},created_by.eq.${uid}`) : q);
      const ownInquiries = (q) => (isSalesOnly ? q.eq('owner_id', uid) : q);
      const ownBySales   = (q) => (isSalesOnly ? q.eq('assigned_to', uid) : q);
      const ownByCreator = (q) => (isSalesOnly ? q.eq('created_by', uid) : q);

      /* KPI personal sales memakai minggu/bulan berjalan dan SENGAJA TIDAK ikut
         `period` (keputusan Den): ini metrik KADENS dengan target per-minggu/
         per-bulan, jadi merentangkannya ke kuartal/tahun membuat label DAN
         target sama-sama bohong. Tanggal LOKAL (bukan toISOString) supaya WIB
         sebelum 07:00 tak menggeser tanggal mundur sehari — `scheduled_for`
         itu DATE lokal. */
      const dow            = (now.getDay() + 6) % 7;          // 0 = Senin … 6 = Minggu
      const mondayDate     = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
      const pad            = (n) => String(n).padStart(2, '0');
      const localDate      = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const startOfWeek    = localDate(mondayDate);
      const todayStr       = localDate(now);
      const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      /* Bulan-bulan yang dicakup periode aktif — dipakai query target sales.
         `sales_targets` tersimpan per (tahun, bulan), jadi untuk kuartal/tahun
         target yang relevan adalah PENJUMLAHAN beberapa baris bulanan, bukan
         satu baris. Ketiga mode selalu di dalam satu tahun kalender, jadi cukup
         satu `period_year` + daftar bulan. */
      const targetYear = now.getFullYear();
      const targetMonths = period === 'This Year'
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : period === 'This Quarter'
          ? [0, 1, 2].map((i) => Math.floor(now.getMonth() / 3) * 3 + i + 1)
          : [now.getMonth() + 1];

      const feedPromise = fetchActivityFeed({ companyId: cid, uid, isAllEntities, isSalesOnly });

      const res = await Promise.all([
        // [0] accounts periode aktif — sumber Lead Source + Prospect Trend
        ownAccounts(byCompany(supabase
          .from('accounts')
          .select('id, created_at, source'))
          .in('lifecycle_stage', ['lead', 'mql', 'sql', 'prospect', 'lead_pool']) /* TODO: hapus 'lead_pool' setelah backfill (AUDIT_CRM_FLOW.md) */
          .is('deleted_at', null)
          .gte('created_at', P.start.toISOString())
          .lt('created_at', P.end.toISOString())
          .limit(1000)),

        // [1] accounts periode SEBELUMNYA — garis pembanding trend
        ownAccounts(byCompany(supabase
          .from('accounts')
          .select('created_at'))
          .in('lifecycle_stage', ['lead', 'mql', 'sql', 'prospect', 'lead_pool']) /* TODO: hapus 'lead_pool' setelah backfill (AUDIT_CRM_FLOW.md) */
          .is('deleted_at', null)
          .gte('created_at', P.prevStart.toISOString())
          .lt('created_at', P.prevEnd.toISOString())
          .limit(1000)),

        // [2] "Prospect Aktif" — server count, TANPA batas periode: ini keadaan
        //     saat ini, bukan kejadian dalam rentang waktu. Filter lama
        //     `pipeline_stage NOT IN (WON,LOST)` DILEPAS — whitelist
        //     lifecycle_stage di bawah sudah mengecualikan customer/lost/
        //     free_agent, jadi filter itu mubazir sekaligus jadi referensi
        //     terakhir ke kolom yang dijadwalkan drop.
        ownAccounts(byCompany(supabase
          .from('accounts')
          .select('id', { count: 'exact', head: true }))
          .in('lifecycle_stage', ['lead', 'mql', 'sql', 'prospect', 'lead_pool']) /* TODO: hapus 'lead_pool' setelah backfill (AUDIT_CRM_FLOW.md) */
          .eq('is_in_lead_pool', false)
          .is('deleted_at', null)),

        // [3] Inquiry lajur TERBUKA — tanpa batas periode, persis seperti papan
        //     Pipeline: deal terbuka tak punya tanggal tutup untuk disaring.
        // Kolom tambahan (inquiry_no, owner_id, company_id, nama akun) dipakai
        // widget Aging Per Tahap & Daftar Deal Stale. Embed dua FK akun ini
        // pola yang sudah terbukti jalan di PipelineKanbanPage dan
        // activityFeed.js — beda dari embed `profiles` yang dulu gagal.
        ownInquiries(byCompany(supabase
          .from('inquiries')
          .select(`id, status, inquiry_no, owner_id, company_id, estimated_value,
                   prospect:accounts!inquiries_prospect_id_fkey(name),
                   customer:accounts!inquiries_customer_id_fkey(name)`))
          .in('status', INQ_OPEN_STATUSES)
          .is('deleted_at', null)
          .limit(1000)),

        // [4] Inquiry lajur TERTUTUP di periode aktif — sumber Win Rate,
        //     hitungan CANCELLED, dan Sales Performance.
        ownInquiries(byCompany(supabase
          .from('inquiries')
          .select('id, status, closed_at, owner_id, estimated_value, loss_reason_id'))
          .in('status', INQ_CLOSED_STATUSES)
          .is('deleted_at', null)
          .gte('closed_at', P.start.toISOString())
          .lt('closed_at', P.end.toISOString())
          .limit(1000)),

        // [5] Total Inquiry periode aktif
        ownInquiries(byCompany(supabase
          .from('inquiries')
          .select('id', { count: 'exact', head: true }))
          .is('deleted_at', null)
          .gte('created_at', P.start.toISOString())
          .lt('created_at', P.end.toISOString())),

        // [6] Total Quotation periode aktif — `deleted_at` disamakan dengan
        //     query inquiries; tanpa ini quotation yang sudah dibuang ikut
        //     terhitung.
        ownByCreator(byCompany(supabase
          .from('quotations')
          .select('id', { count: 'exact', head: true }))
          .is('deleted_at', null)
          .gte('created_at', P.start.toISOString())
          .lt('created_at', P.end.toISOString())),

        // [7] KPI personal — call minggu ini
        ownBySales(byCompany(supabase
          .from('activities')
          .select('id, scheduled_for, assigned_to'))
          .eq('type', 'call')
          .is('deleted_at', null)
          .gte('scheduled_for', startOfWeek)
          .lte('scheduled_for', todayStr)
          .limit(1000)),

        // [8] KPI personal — visit minggu ini
        ownBySales(byCompany(supabase
          .from('activities')
          .select('id, scheduled_for, assigned_to'))
          .eq('type', 'visit')
          .is('deleted_at', null)
          .gte('scheduled_for', startOfWeek)
          .lte('scheduled_for', todayStr)
          .limit(1000)),

        // [9] KPI personal — quotation bulan ini
        ownByCreator(byCompany(supabase
          .from('quotations')
          .select('id, created_at, created_by'))
          .is('deleted_at', null)
          .gte('created_at', startThisMonth.toISOString())
          .lt('created_at', startNextMonth.toISOString())
          .limit(1000)),

        // [10] "SQL Baru Bulan Ini" — dari riwayat lifecycle, BUKAN lagi tebakan
        //      dari pipeline_stage. Ini menjawab "berapa yang BARU jadi SQL
        //      bulan ini", bukan "berapa yang kebetulan sekarang di tahap
        //      lanjut". Tanpa filter company_id: tabelnya tak punya kolom itu —
        //      scoping datang dari RLS `alh_read` yang mendelegasikan ke RLS
        //      `accounts` (entitas + kepemilikan sekaligus).
        supabase
          .from('account_lifecycle_history')
          .select('id', { count: 'exact', head: true })
          .eq('to_stage', 'sql')
          .gte('changed_at', startThisMonth.toISOString())
          .lt('changed_at', startNextMonth.toISOString()),

        // [11] Distribusi lifecycle akun — SNAPSHOT keadaan sekarang, sengaja
        //      TANPA filter periode: pertanyaannya "sekarang akun-akun itu ada
        //      di tahap mana", bukan "berapa yang masuk tahap X bulan ini".
        //      Menyaringnya per periode akan mengubah maknanya jadi cohort dan
        //      membuat corongnya menyusut tiap ganti bulan tanpa alasan.
        // `id` ikut diambil karena widget Konversi MQL→SQL butuh memetakan
        // kohort riwayat ke tahap akun SEKARANG. Nol dampak ke funnel lifecycle
        // yang hanya membaca lifecycle_stage.
        ownAccounts(byCompany(supabase
          .from('accounts')
          .select('id, lifecycle_stage'))
          .is('deleted_at', null)
          .limit(1000)),

        // [12] Master alasan kalah — untuk memberi NAMA pada loss_reason_id.
        //      ⚠️ TANPA filter company_id: `loss_reasons` GLOBAL (company_id
        //      selalu NULL), memfilternya mengembalikan NOL BARIS tanpa error
        //      (gotcha #18) dan seluruh breakdown akan jatuh ke "Tanpa Alasan".
        supabase
          .from('loss_reasons')
          .select('id, name')
          .is('deleted_at', null)
          .limit(1000),

        // [13] Ambang aging dari master SLA. PER-ENTITAS, jadi ikut byCompany:
        //      super_admin lintas entitas dapat semuanya dan dipetakan
        //      per (company_id, status); role lain terkunci ke entitasnya.
        byCompany(supabase
          .from('sla_policies')
          .select('company_id, code, target_status, threshold, time_unit'))
          .eq('policy_type', 'deal_aging')
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(1000),

        /* [14] Target sales untuk periode aktif.
           Filter (tahun, bulan) bisa sesederhana ini karena KETIGA mode periode
           selalu berada di dalam satu tahun kalender — This Month/Quarter/Year
           semuanya dibatasi Jan–Des tahun berjalan, jadi tak perlu penanganan
           rentang lintas tahun.
           RLS `sales_targets_read` sudah pas apa adanya: manager+ dapat seluruh
           entitasnya, sales hanya barisnya sendiri. */
        byCompany(supabase
          .from('sales_targets')
          .select('user_id, period_year, period_month, target_value, target_deals'))
          .eq('period_year', targetYear)
          .in('period_month', targetMonths)
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(1000),
      ]);

      /* Pemeriksaan error MENYELURUH. Sebelumnya hanya hasil [0] yang diperiksa
         dan sembilan sisanya jatuh diam-diam ke `?? 0` / `|| []` — kegagalan
         fetch tampil sebagai angka yang kelihatan sah. Yang esensial tetap
         melempar; sisanya dikumpulkan dan dilaporkan lewat banner. */
      const ESSENTIAL = [
        ['prospect', res[0]],
        ['active prospects', res[2]],
        ['pipeline terbuka', res[3]],
        ['deal tertutup', res[4]],
      ];
      for (const [label, r] of ESSENTIAL) {
        if (r?.error) throw new Error(`${label} — ${r.error.message}`);
      }

      const failed = [
        ['previous-period trend', res[1]],
        ['total inquiry', res[5]],
        ['total quotation', res[6]],
        ['calls this week', res[7]],
        ['visits this week', res[8]],
        ['quotations this month', res[9]],
        ['new SQL this month', res[10]],
        ['account lifecycle funnel', res[11]],
        ['loss reason master', res[12]],
        ['ambang SLA aging', res[13]],
        ['sales targets', res[14]],
      ].filter(([, r]) => r?.error).map(([label]) => label);

      const accountsRows        = res[0].data  || [];
      const prevRows            = res[1].data  || [];
      const activeProspects     = res[2].count ?? 0;
      const openInq             = res[3].data  || [];
      const closedInq           = res[4].data  || [];
      const totalInquiries      = res[5].count ?? 0;
      const totalQuotations     = res[6].count ?? 0;
      const callsThisWeek       = (res[7].data || []).length;
      const visitsThisWeek      = (res[8].data || []).length;
      const quotationsThisMonth = (res[9].data || []).length;
      const sqlThisMonth        = res[10].count ?? 0;
      const lifecycleRows       = res[11].data || [];
      const lossReasonRows      = res[12].data || [];
      const slaRows             = res[13].data || [];
      const targetRows          = res[14].data || [];

      // Cap 1000 baris pada distribusi lifecycle: kalau kena, corongnya
      // memang terpotong — dikabarkan lewat banner, bukan ditampilkan
      // seolah-olah itu seluruh populasi akun.
      if (lifecycleRows.length === 1000) failed.push('account lifecycle funnel (truncated at 1000 rows)');

      /* Nama pemilik deal lewat query TERPISAH, bukan embed FK — pola yang
         sudah dipakai di file ini (feed aktivitas & kalender). Satu query untuk
         seluruh papan: id dikumpulkan lebih dulu lalu di-dedup, jadi jumlah
         query tidak tumbuh mengikuti jumlah deal (nol N+1). */
      // openInq ikut: daftar Deal Stale menampilkan pemilik deal yang MASIH
      // terbuka, jadi namanya harus ikut teresolusi di sini.
      const ownerIds   = [...new Set([...closedInq, ...openInq].map((r) => r.owner_id).filter(Boolean))];
      const ownerNames = {};
      if (ownerIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles').select('id, full_name').in('id', ownerIds).limit(1000);
        if (profErr) failed.push('deal owner names');
        else (profs || []).forEach((p) => { ownerNames[p.id] = p.full_name; });
      }

      // ── Pipeline by Stage — sumbu inquiries.status ───────────────────────
      const statusCounts = {};
      for (const r of [...openInq, ...closedInq]) {
        const s = String(r.status || '').toUpperCase();
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }
      const stagesData = INQ_STAGE_ORDER.map((id) => ({
        id, name: INQ_STAGE_LABELS[id], count: statusCounts[id] || 0, value: 0,
      }));

      /* ── Win Rate ────────────────────────────────────────────────────────
         WON / (WON + LOST) atas deal yang DITUTUP di periode aktif.
         CANCELLED sengaja di luar pembilang MAUPUN penyebut: deal yang
         dibatalkan bukan kompetisi yang kita kalah, jadi memasukkannya ke
         penyebut menghukum win rate untuk sesuatu yang tak pernah
         diperebutkan. Angkanya tetap dibawa keluar dan ditampilkan di sebelah
         kartu — dikeluarkan dari rumus, bukan disembunyikan. */
      const wonCount       = closedInq.filter((r) => r.status === 'WON').length;
      const lostCount      = closedInq.filter((r) => r.status === 'LOST').length;
      const cancelledCount = closedInq.filter((r) => r.status === 'CANCELLED').length;
      const decided        = wonCount + lostCount;
      const winRate        = decided > 0 ? Math.round((wonCount / decided) * 100) : 0;

      /* ── Konversi antar-tahap (dari riwayat transisi) ────────────────────
         Kohortnya = PERSIS deal yang ditampilkan widget ini (openInq +
         closedInq), jadi dasar persentasenya selalu bisa direkonsiliasi dengan
         batang di sebelahnya. "Pernah mencapai X" = ada baris riwayat dengan
         to_status = X — jadi deal yang mati di tengah tetap terhitung pernah
         melewati tahap-tahap sebelumnya. Itulah yang membuat angka ini menjawab
         "bocor di tahap mana", bukan sekadar "sekarang ada berapa".

         ⚠️ BATASAN YANG DISADARI (keputusan Den 30 Agu 2026): backfill
         28 Agu 2026 hanya menulis SATU baris per inquiry (status saat itu),
         bukan riwayat penuh. Deal yang sudah melewati beberapa tahap SEBELUM
         tanggal itu tampak melompat langsung ke status akhirnya, jadi angka ini
         UNDER-REPORT untuk data lama dan makin akurat seiring waktu. Alternatif
         satu-satunya — menyimpulkan dari urutan status sekarang — justru buta
         terhadap deal LOST/CANCELLED, yang persis kebocoran yang dicari. */
      const cohortIds = [...openInq, ...closedInq].map((r) => r.id);
      const reached = {};
      // Peta inquiry_id -> kapan ia masuk status yang SEKARANG. Diturunkan dari
      // query riwayat yang sama (diurut menurun, jadi baris pertama tiap inquiry
      // = transisi terakhirnya) — dipakai widget Aging Per Tahap & Deal Stale.
      const stageSince = {};
      if (cohortIds.length) {
        const { data: hist, error: histErr } = await supabase
          .from('inquiry_status_history')
          .select('inquiry_id, to_status, changed_at')
          .in('inquiry_id', cohortIds)
          .order('changed_at', { ascending: false })
          .limit(1000);
        if (histErr) {
          failed.push('stage-to-stage conversion & stage age');
        } else {
          const rows = hist || [];
          // Cap 1000: riwayat tumbuh per TRANSISI, bukan per inquiry, jadi cap
          // ini lebih cepat kena daripada query lain. Dikabarkan, tidak dipotong
          // diam-diam jadi persentase yang terlihat sah.
          if (rows.length === 1000) failed.push('status history truncated at 1000 rows (conversion & age)');
          const seen = {};
          for (const r of rows) {
            const s = String(r.to_status || '').toUpperCase();
            (seen[s] || (seen[s] = new Set())).add(r.inquiry_id);
            if (!(r.inquiry_id in stageSince)) stageSince[r.inquiry_id] = r.changed_at;
          }
          for (const s of INQ_STAGE_ORDER) reached[s] = seen[s] ? seen[s].size : 0;
        }
      }
      /* Rantai konversi menyusuri lajur terbuka + WON saja. LOST/CANCELLED
         SENGAJA di luar rantai: keduanya exit yang bisa terjadi dari tahap mana
         pun, jadi menempatkannya sebagai "tahap berikutnya" akan menyesatkan. */
      const CONV_CHAIN = [...INQ_OPEN_STATUSES, 'WON'];
      const conversionData = CONV_CHAIN.slice(1).map((to, i) => {
        const from = CONV_CHAIN[i];
        const base = reached[from] || 0;
        return {
          to,
          fromLabel: INQ_STAGE_LABELS[from],
          toLabel:   INQ_STAGE_LABELS[to],
          // base 0 → null, BUKAN 0%. Nol persen mengklaim "semua gagal lolos";
          // yang sebenarnya terjadi adalah tak ada yang bisa diukur.
          pct: base > 0 ? Math.round(((reached[to] || 0) / base) * 100) : null,
        };
      });

      /* ── Beban pipeline per sales ────────────────────────────────────────
         Snapshot deal TERBUKA hari ini (openInq), tanpa filter periode, dan
         diturunkan dari array yang sama dengan Pipeline by Stage — jadi jumlah
         dealnya rekonsiliasi secara konstruksi.

         Widget "Nilai Pipeline Berbobot" yang dulu berbagi loop ini sudah
         di-drop (keputusan Den): konsep nilai berbobot vs nilai penuh menuntut
         penjelasan tambahan dan berisiko membuat Dashboard rancu bagi pembaca
         tanpa konteks. Yang ikut hilang cuma perhitungan berbobotnya; kolom
         `estimated_value` di query deal terbuka TETAP diambil karena tabel ini
         memakainya.

         ⚠️ `inquiries.estimated_value` baru punya jalur tulis sejak 30 Agu 2026,
         jadi deal lama masih NULL. Yang kosong tidak ikut ke total nilai tapi
         TETAP dihitung sebagai deal — beban kerja seseorang tidak berkurang
         hanya karena nilainya belum diisi — dan gap-nya disebut per baris di
         UI, bukan didiamkan. */
      const loadByOwner = {};
      for (const r of openInq) {
        const key = r.owner_id || '__no_owner__';
        if (!loadByOwner[key]) loadByOwner[key] = { deals: 0, value: 0, missing: 0 };
        loadByOwner[key].deals++;

        const raw = (r.estimated_value === null || r.estimated_value === undefined)
          ? null : Number(r.estimated_value);
        if (raw === null || !Number.isFinite(raw)) {
          loadByOwner[key].missing++;
          continue;
        }
        loadByOwner[key].value += raw;
      }
      // Dipakai tabel Beban Pipeline untuk menyatakan totalnya sama dengan
      // keempat batang terbuka di Pipeline by Stage.
      const openDealTotal = openInq.length;
      const loadRows = Object.entries(loadByOwner)
        .map(([id, s]) => ({
          id,
          name:    id === '__no_owner__' ? 'Unassigned' : (ownerNames[id] || '(unnamed)'),
          noOwner: id === '__no_owner__',
          deals: s.deals, value: s.value, missing: s.missing,
        }))
        // "Tanpa Pemilik" selalu di dasar — keranjang sisa, bukan salesperson.
        .sort((a, b) => (a.noOwner - b.noOwner) || (b.deals - a.deals) || (b.value - a.value));

      /* ── Aging per tahap + daftar deal stale ─────────────────────────────
         Umur = sekarang − saat masuk status ini (stageSince). MEDIAN, bukan
         rata-rata: distribusi umur deal condong ke kanan, jadi beberapa deal
         yang nyangkut ekstrem lama akan menarik rata-rata sampai ia tak
         mewakili deal tipikal mana pun.

         ⚠️ KETERBATASAN — ARAHNYA BERBAHAYA, beda dari widget sebelumnya.
         Backfill 28 Agu 2026 mengisi changed_at dengan
         COALESCE(updated_at, created_at, now()). Untuk deal yang status
         terakhirnya berubah SEBELUM tanggal itu, "masuk status ini" sebenarnya
         = waktu edit TERAKHIR apa pun — ganti catatan, rute, nilai. Efeknya
         umur ter-UNDER-STATE: deal yang benar-benar mandek berbulan-bulan tapi
         baru disunting kemarin tampak berumur sehari dan LOLOS dari daftar
         stale. Ini false negative yang menyamar, bukan sekadar data hilang —
         justru deal yang paling perlu ditemukan yang paling mungkin luput.
         Transisi setelah 28 Agu akurat. Ditulis apa adanya di UI kedua widget. */
      const DAY_MS = 86400000;
      const nowMs  = now.getTime();
      const median = (arr) => {
        if (!arr.length) return null;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      };

      /* Ambang dari master `sla_policies` (policy_type='deal_aging'), diambil
         MINIMUM per (entitas, status). QUOTED punya DUA baris — 14 hari
         flag_stale dan 30 hari propose_cancel — dan yang dipakai adalah ambang
         PERTAMA yang terlewati, 14 (keputusan Den): `flag_stale` memang aksi
         yang menandai stale, sementara 30 hari itu tahap eskalasi berikutnya,
         bukan definisi stale.

         `business_day` diperlakukan sebagai hari kalender — repo ini tak punya
         tabel kalender kerja/hari libur, jadi menghitung hari kerja sungguhan
         mustahil; aproksimasinya disebutkan di UI. `business_hour` SENGAJA
         ditolak: satu-satunya pemakainya ambang IN_REVIEW, yang memang
         dikecualikan di bawah. */
      const thrByKey = {};
      slaRows.forEach((p) => {
        if (!['day', 'business_day'].includes(p.time_unit)) return;
        const v = Number(p.threshold);
        if (!Number.isFinite(v) || v <= 0) return;
        const key = `${p.company_id}|${String(p.target_status || '').toUpperCase()}`;
        if (thrByKey[key] === undefined || v < thrByKey[key]) thrByKey[key] = v;
      });

      /* IN_REVIEW SENGAJA TANPA AMBANG (keputusan Den): keenam baris
         AGING_IN_REVIEW_* bersumbu `transport_mode` dan hanya ada untuk MSI,
         sementara `inquiries` tak punya kolom moda sama sekali — moda hidup di
         PRF dengan taksonomi berbeda dari service_type. Mengarang ambangnya
         akan menghasilkan angka buatan yang menyamar sebagai kebijakan. Median
         IN_REVIEW tetap ditampilkan (median tak butuh ambang); yang absen hanya
         pembanding dan keikutsertaannya di daftar stale. */
      const agingRows = [];
      const staleAll  = [];
      let ageUnknown  = 0;
      for (const st of INQ_OPEN_STATUSES) {
        const inStage = openInq.filter((r) => String(r.status || '').toUpperCase() === st);
        const ages = [];
        for (const r of inStage) {
          const since = stageSince[r.id];
          // Tanpa baris riwayat, umurnya TAK DIKETAHUI — bukan nol. Dihitung
          // terpisah dan dilaporkan, tidak dibuang diam-diam.
          if (!since) { ageUnknown++; continue; }
          const days = Math.floor((nowMs - new Date(since).getTime()) / DAY_MS);
          ages.push(days);
          const thr = thrByKey[`${r.company_id}|${st}`];
          if (thr !== undefined && days > thr) {
            staleAll.push({
              id: r.id,
              inquiryNo: r.inquiry_no || '—',
              account:   r.customer?.name || r.prospect?.name || '—',
              statusLabel: INQ_STAGE_LABELS[st],
              owner:     r.owner_id ? (ownerNames[r.owner_id] || '(unnamed)') : 'Unassigned',
              noOwner:   !r.owner_id,
              days,
              over:      days - thr,
            });
          }
        }
        // Pembanding hanya ditampilkan kalau ambangnya TUNGGAL untuk seluruh
        // deal di tahap itu. Untuk super_admin lintas entitas, ambang bisa
        // berbeda antar-entitas — menampilkan salah satunya sebagai "ambang"
        // akan salah untuk sebagian barisnya.
        const thrSet = new Set(
          inStage.map((r) => thrByKey[`${r.company_id}|${st}`]).filter((v) => v !== undefined),
        );
        agingRows.push({
          id: st,
          name: INQ_STAGE_LABELS[st],
          count: inStage.length,
          median: median(ages),
          threshold: thrSet.size === 1 ? [...thrSet][0] : null,
        });
      }
      staleAll.sort((a, b) => (b.over - a.over) || (b.days - a.days));
      const STALE_CAP  = 30;
      const staleRows  = staleAll.slice(0, STALE_CAP);
      const staleTotal = staleAll.length;

      /* ── Konversi MQL → SQL ──────────────────────────────────────────────
         Kohort HARUS dari riwayat, TIDAK boleh disimpulkan dari lifecycle_stage
         sekarang — sudah diverifikasi bahwa akun BISA melompati mql:
           • set_prospect_on_inquiry menaikkan lead → prospect begitu inquiry
             pertamanya dibuat (WHERE lifecycle_stage IN ('lead','mql')), jadi
             sebuah lead bisa jadi prospect tanpa pernah menyentuh mql;
           • set_customer_on_inquiry_won menaikkan tahap APA PUN → customer.
         Artinya akun ber-tahap prospect/sql/customer belum tentu pernah MQL,
         dan menghitung kohort dari tahap sekarang akan melebih-lebihkannya.

         ⚠️ KETERBATASAN CAKUPAN (sama kelasnya dengan konversi status inquiry):
         backfill 27 Agu 2026 hanya menulis SATU baris per akun (tahap saat itu,
         from_stage NULL), bukan riwayat penuh. Akun yang melewati mql SEBELUM
         tanggal itu lalu sudah bergerak lagi tidak punya jejak mql sama sekali,
         jadi kohort ini UNDER-REPORT untuk data lama dan makin lengkap seiring
         waktu. Ditulis apa adanya di UI, bukan disembunyikan. */
      const lcById = {};
      lifecycleRows.forEach((a) => { if (a.id) lcById[a.id] = a.lifecycle_stage; });
      const accIds = Object.keys(lcById);
      let mqlSql = 0, mqlPending = 0, mqlLost = 0;
      if (accIds.length) {
        const { data: mqlRows, error: mqlErr } = await supabase
          .from('account_lifecycle_history')
          .select('account_id')
          .eq('to_stage', 'mql')
          .in('account_id', accIds)
          .limit(1000);
        if (mqlErr) {
          failed.push('konversi MQL ke SQL');
        } else {
          const rows = mqlRows || [];
          if (rows.length === 1000) failed.push('konversi MQL ke SQL (kohort terpotong di 1000 baris)');
          const cohort = new Set(rows.map((r) => r.account_id));
          // Klasifikasi EKSHAUSTIF — tiap anggota kohort masuk salah satu dari
          // tiga ember, tak ada yang jatuh diam-diam ke luar hitungan.
          for (const id of cohort) {
            const st = lcById[id];
            if (st === 'lost') mqlLost++;
            else if (st === 'sql' || st === 'customer') mqlSql++;
            else mqlPending++;
          }
        }
      }
      const mqlBase = mqlSql + mqlPending;
      const mqlData = {
        converted: mqlSql,
        pending:   mqlPending,
        lost:      mqlLost,
        // Basis nol → null, BUKAN 0%. Nol persen mengklaim "tak satu pun lolos";
        // yang sebenarnya terjadi adalah belum ada yang bisa diukur.
        pct: mqlBase > 0 ? Math.round((mqlSql / mqlBase) * 100) : null,
      };

      /* ── Funnel lifecycle akun ───────────────────────────────────────────
         Snapshot distribusi akun, bukan cohort periode (lihat query [11]). */
      const lcCounts = {};
      lifecycleRows.forEach((a) => {
        const s = a.lifecycle_stage || '(empty)';
        lcCounts[s] = (lcCounts[s] || 0) + 1;
      });
      const lifecycleFunnel = LIFECYCLE_FUNNEL.map((id) => ({
        id, name: LIFECYCLE_LABELS[id], count: lcCounts[id] || 0,
      }));
      // Nilai di luar 5 tahap funnel + 2 exit yang dikenal (termasuk NULL)
      // dikumpulkan ke keranjang "Lainnya" — supaya "Total akun" di kartu itu
      // benar-benar sama dengan jumlah baris yang terbaca, bukan cuma yang
      // kebetulan cocok dengan daftar yang kita kenal.
      const knownLc = new Set([...LIFECYCLE_FUNNEL, ...LIFECYCLE_EXITS]);
      const lcOther = Object.entries(lcCounts)
        .filter(([k]) => !knownLc.has(k))
        .reduce((a, [, v]) => a + v, 0);
      const lifecycleExits = [
        ...LIFECYCLE_EXITS.map((id) => ({ id, name: LIFECYCLE_LABELS[id], count: lcCounts[id] || 0 })),
        ...(lcOther > 0 ? [{ id: '__other__', name: 'Lainnya', count: lcOther }] : []),
      ];

      /* ── Breakdown alasan kalah ──────────────────────────────────────────
         Diturunkan dari array `closedInq` yang SAMA dengan Pipeline by Stage
         dan Win Rate — jadi totalnya rekonsiliasi secara konstruksi, bukan
         karena kebetulan dua query menghasilkan angka yang mirip.
         `loss_reason_id` NULL → "Tanpa Alasan", bukan dibuang: LOST lama
         (sebelum B3) dan jalur penutupan non-modal tidak mengisi kolom itu. */
      const lossNameById = {};
      lossReasonRows.forEach((r) => { lossNameById[r.id] = r.name; });
      const lossCounts = {};
      closedInq.filter((r) => r.status === 'LOST').forEach((r) => {
        const k = r.loss_reason_id || '__none__';
        lossCounts[k] = (lossCounts[k] || 0) + 1;
      });
      const lossReasonData = Object.entries(lossCounts)
        .map(([id, count]) => ({
          id,
          name: id === '__none__' ? 'No Reason' : (lossNameById[id] || '(unknown reason)'),
          count,
          unknown: id === '__none__',
        }))
        // "Tanpa Alasan" selalu paling bawah — ia keranjang sisa, bukan alasan.
        .sort((a, b) => (a.unknown - b.unknown) || (b.count - a.count));

      // ── Lead source (periode aktif) ─────────────────────────────────────
      const sourceCounts = {};
      accountsRows.forEach((a) => {
        const s = a.source || 'Lainnya';
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
      });
      const leadSourceData = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // ── Trend — bucket adaptif + pembanding periode setara ──────────────
      const inBucket = (rows, from, to) => rows.filter((r) => {
        const d = new Date(r.created_at);
        return d >= from && d < to;
      }).length;
      const trendData = P.buckets.map((b) => ({
        name:      b.name,
        bulanIni:  inBucket(accountsRows, b.start, b.end),
        bulanLalu: inBucket(prevRows, b.prevStart, b.prevEnd),
      }));

      /* ── Sales performance — per PEMILIK DEAL (inquiries.owner_id) ───────
         ⚠️ Deal ber-`owner_id` NULL DIKUMPULKAN ke baris "Tanpa Pemilik", bukan
         dibuang. Sebelumnya baris NULL di-`return` diam-diam, sehingga widget
         ini bisa berkata "belum ada deal yang ditutup" untuk periode yang sama
         di mana kartu Win Rate menghitung deal itu — persis kelas kegagalan
         senyap yang dibereskan di batch sebelumnya, lahir kembali dalam bentuk
         baru.
         NULL-nya sendiri bukan anomali data langka: `owner_id` lahir di Batch
         Persiapan dengan backfill dari `created_by`, tapi TIDAK ADA satu pun
         jalur tulis yang mengisinya sejak itu (insert InquiryFormPage tak
         memuat kolom ini), jadi setiap inquiry BARU pasti NULL sampai jalur
         tulisnya dibuat. Sampai saat itu, baris ini yang menahan angkanya tetap
         rekonsiliasi dengan Win Rate dan Pipeline by Stage. */
      const NO_OWNER = '__no_owner__';
      const perOwner = {};
      closedInq.forEach((r) => {
        const id = r.owner_id || NO_OWNER;
        if (!perOwner[id]) perOwner[id] = { won: 0, lost: 0, value: 0 };
        if (r.status === 'WON') {
          perOwner[id].won++;
          perOwner[id].value += Number(r.estimated_value) || 0;
        } else if (r.status === 'LOST') {
          perOwner[id].lost++;
        }
      });
      /* ── Target per sales ────────────────────────────────────────────────
         Dijumlahkan dari baris-baris BULANAN dalam periode aktif, dan dihitung
         TERPISAH per metrik: satu bulan boleh menetapkan hanya salah satunya
         (CHECK di DB cuma menuntut minimal satu terisi), jadi cakupan bulan
         untuk `value` bisa berbeda dari `deals`. */
      const expectedMonths = targetMonths.length;
      const targetByUser = {};
      targetRows.forEach((t) => {
        if (!t.user_id) return;
        if (!targetByUser[t.user_id]) {
          targetByUser[t.user_id] = { value: 0, deals: 0, hasValue: false, hasDeals: false, months: new Set() };
        }
        const acc = targetByUser[t.user_id];
        acc.months.add(t.period_month);
        if (t.target_value !== null && t.target_value !== undefined) {
          acc.value += Number(t.target_value) || 0;
          acc.hasValue = true;
        }
        if (t.target_deals !== null && t.target_deals !== undefined) {
          acc.deals += Number(t.target_deals) || 0;
          acc.hasDeals = true;
        }
      });

      /* Pencapaian per sales. Mengembalikan null kalau tak ada baris target
         sama sekali — pemanggilnya menampilkan "—", BUKAN 0%: "belum ada
         target" dan "target tak tercapai" adalah dua pernyataan berbeda. */
      const attainmentFor = (ownerId, won, wonValue) => {
        const t = ownerId === NO_OWNER ? null : targetByUser[ownerId];
        if (!t) return null;

        /* WON > 0 tapi total nilainya 0 → nilai deal-nya memang belum pernah
           diisi (inquiries.estimated_value baru punya jalur tulis 30 Agu 2026,
           deal lama masih NULL). Ini BUKAN 0%: nol persen mengklaim "tak
           menghasilkan apa-apa", padahal yang terjadi adalah hasilnya tak
           terukur — dua hal yang sangat berbeda bagi orang yang dinilai.
           Keputusan Den, menyimpang sadar dari aturan "aktual 0 → 0%". */
        const valueUnmeasured = t.hasValue && won > 0 && wonValue === 0;

        return {
          // Target 0 → null, bukan pembagian nol.
          valuePct: (t.hasValue && t.value > 0 && !valueUnmeasured)
            ? Math.round((wonValue / t.value) * 100) : null,
          valueUnmeasured,
          dealsPct: (t.hasDeals && t.deals > 0)
            ? Math.round((won / t.deals) * 100) : null,
          monthsCovered: t.months.size,
          expectedMonths,
        };
      };

      const salesPerfData = Object.entries(perOwner)
        .map(([id, s]) => {
          const dec = s.won + s.lost;
          return {
            ownerId:   id,
            name:      id === NO_OWNER ? 'Unassigned' : (ownerNames[id] || '(unnamed)'),
            noOwner:   id === NO_OWNER,
            won:       s.won,
            lost:      s.lost,
            value:     s.value,
            convRate:  dec > 0 ? Math.round((s.won / dec) * 100) : 0,
            att:       attainmentFor(id, s.won, s.value),
          };
        })
        // "Tanpa Pemilik" selalu di dasar tabel — ia keranjang sisa, bukan
        // salesperson yang sedang diperingkat.
        .sort((a, b) => (a.noOwner - b.noOwner) || (b.won - a.won) || (b.value - a.value));

      // ── Recent activity (feed terpadu) ──────────────────────────────────
      const feedEvents = await feedPromise;
      const recentActivity = feedEvents.slice(0, 7).map((ev) => ({
        type: ev.type,
        text: ev.title,
        co:   ev.subtitle,
        time: fmtTimeAgo(ev.timestamp),
        user: ev.user_name || '—',
      }));

      if (failed.length) setPartialFail(failed);

      setDashData({
        activeProspects, totalInquiries, totalQuotations,
        winRate, wonCount, lostCount, cancelledCount, decided,
        stagesData, recentActivity, trendData, leadSourceData, salesPerfData,
        lifecycleFunnel, lifecycleExits, lossReasonData, conversionData, mqlData,
        agingRows, ageUnknown, staleRows, staleTotal, staleCap: STALE_CAP,
        loadRows, openDealTotal,
        callsThisWeek, visitsThisWeek, quotationsThisMonth, sqlThisMonth,
        curLabel: P.curLabel, prevLabel: P.prevLabel,
        bucketNoun: period === 'This Month' ? 'minggu' : 'bulan',
      });
    } catch (err) {
      console.error('[CRMDashboardPage] fetch error:', err);
      setDashError(err.message || 'Failed to load dashboard data.');
    } finally {
      setDashLoading(false);
    }
  }, [profile?.company_id, profile?.id, isSalesOnly, isAllEntities, period]);

  useEffect(() => { fetchDash(); }, [fetchDash]);

  // ── calendar visits fetch (decoupled) ────────────────────────────────────
  // Follows the active period: range-mode → [from..to], else month-mode → the
  // whole calAnchor month. NO company filter — RLS scopes (super=all entities,
  // manager/ceo=company, sales=own), same pattern as RiwayatVisitPage. Salesperson
  // names resolved via profiles map (assigned_to has no FK). limit(1000).
  const fetchCalVisits = useCallback(async () => {
    if (!profile?.company_id) return;
    setCalLoading(true);
    try {
      let startStr, endStr;
      if (calMode === 'range' && calRange.from && calRange.to) {
        startStr = calRange.from;
        endStr   = calRange.to;
      } else {
        const y = calAnchor.getFullYear(), m = calAnchor.getMonth();
        const p = (n) => String(n).padStart(2, '0');
        startStr = `${y}-${p(m + 1)}-01`;
        endStr   = `${y}-${p(m + 1)}-${p(new Date(y, m + 1, 0).getDate())}`;
      }
      const { data, error: err } = await supabase
        .from('activities')
        .select('id, scheduled_for, activity_time, status, notes, next_action, account_id, assigned_to, details, prospects:accounts!activities_account_id_fkey(name), company:companies!activities_company_id_fkey(code)')
        .eq('type', 'visit')
        .is('deleted_at', null)
        .gte('scheduled_for', startStr)
        .lte('scheduled_for', endStr)
        .order('scheduled_for', { ascending: true })
        .limit(1000);
      if (err) throw err;
      const rows = data || [];
      const ids = [...new Set(rows.map(v => v.assigned_to).filter(Boolean))];
      const nameMap = {};
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
      }
      setCalVisits(rows.map(v => ({
        id:               v.id,
        date:             v.scheduled_for,
        time:             v.activity_time,
        prospect:         v.prospects?.name    || '—',
        prospect_id:      v.account_id         || '',
        salesperson:      (v.assigned_to && nameMap[v.assigned_to]) || '—',
        salesperson_id:   v.assigned_to,
        location:         v.details?.location  || '—',
        notes:            v.notes              || '',
        status:           ACT_TO_VISIT_STATUS[v.status] || 'scheduled',
        visit_type:       v.details?.visit_type        || '',
        point_of_meeting: v.details?.point_of_meeting  || '',
        mom:              v.details?.mom               || '',
        follow_up:        v.next_action               || '',
        entity:           v.company?.code             || '—',
      })));
    } catch {
      setCalVisits([]);
    } finally {
      setCalLoading(false);
    }
  // calAnchor (new Date on month nav) keys the month; calMode/calRange key range vs month.
  }, [profile?.company_id, calMode, calRange.from, calRange.to, calAnchor]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCalVisits(); }, [fetchCalVisits]);

  // Month navigation — always month-mode (clears any custom range).
  const goPrevMonth = useCallback(() => { setCalMode('month'); setCalRange({ from: '', to: '' }); setCalAnchor(a => new Date(a.getFullYear(), a.getMonth() - 1, 1)); }, []);
  const goNextMonth = useCallback(() => { setCalMode('month'); setCalRange({ from: '', to: '' }); setCalAnchor(a => new Date(a.getFullYear(), a.getMonth() + 1, 1)); }, []);
  const goThisMonth = useCallback(() => { setCalMode('month'); setCalRange({ from: '', to: '' }); const n = new Date(); setCalAnchor(new Date(n.getFullYear(), n.getMonth(), 1)); }, []);
  // Range picker — full range (from ≤ to) → range-mode + anchor jumps to `from`'s
  // month; clearing/incomplete → back to month-mode.
  const applyCalRange = useCallback((from, to) => {
    setCalRange({ from, to });
    if (from && to && from <= to) {
      setCalMode('range');
      const d = new Date(from + 'T00:00:00');
      if (!isNaN(d.getTime())) setCalAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setCalMode('month');
    }
  }, []);

  // ── fetch options for AddVisitModal ─────────────────────────────────────
  // Salesperson dropdown = active 'sales' users in the current entity only
  // (RBAC role code, scoped by company_id — see fetchOperationalRoster).
  useEffect(() => {
    if (!addVisitOpen || !profile?.company_id) return;
    Promise.all([
      fetchOperationalRoster(profile.company_id),
      // Akun parkir Lead Pool tak boleh dipilih untuk visit baru — is_in_lead_pool=false.
      supabase.from('accounts').select('id, name').eq('company_id', profile.company_id).in('lifecycle_stage', ['lead', 'mql', 'sql', 'prospect', 'lead_pool', 'customer', 'free_agent']).eq('is_in_lead_pool', false).is('deleted_at', null).order('name').limit(1000), /* TODO: hapus 'lead_pool' setelah backfill (AUDIT_CRM_FLOW.md) */
    ]).then(([sales, prospRes]) => {
      setSalesProfiles(sales);
      // Suntik akun yang SUDAH tertaut ke visit yang diedit (walau parkir) supaya relasi lama tak hilang.
      let list = prospRes.data || [];
      const editing = editVisitId ? calVisits.find(x => x.id === editVisitId) : null;
      if (editing?.prospect_id && !list.some(p => p.id === editing.prospect_id)) {
        list = [{ id: editing.prospect_id, name: editing.prospect && editing.prospect !== '—' ? editing.prospect : '(linked account)' }, ...list];
      }
      setProspectOptions(list);
    });
  }, [addVisitOpen, profile?.company_id, editVisitId, calVisits]);

  // ── save new visit ───────────────────────────────────────────────────────
  const EMPTY_DRAFT = { visit_date: '', visit_time: '', prospect_id: '', salesperson_id: '', location: '', notes: '', status: 'scheduled', visit_type: '', point_of_meeting: '', mom: '', follow_up: '' };

  const handleSaveVisit = useCallback(async () => {
    if (!visitDraft.visit_type) { setVisitError('Visit type is required.'); return; }
    if (!visitDraft.visit_date) { setVisitError('Visit date is required.'); return; }
    if (!visitDraft.salesperson_id) { setVisitError('Salesperson is required.'); return; }
    if (visitDraft.status === 'cancelled' && !visitDraft.notes?.trim()) {
      setVisitError('A cancellation reason is required.'); return;
    }
    setVisitSaving(true);
    setVisitError(null);
    try {
      // Write to `activities` (type='visit'). Visit-specific fields live in
      // details jsonb; follow_up → next_action; status mapped to activity vocab.
      const payload = {
        type:             'visit',
        scheduled_for:    visitDraft.visit_date,
        activity_time:    visitDraft.visit_time       || null,
        account_id:       visitDraft.prospect_id      || null,
        assigned_to:      visitDraft.salesperson_id,
        notes:            visitDraft.notes            || null,
        status:           VISIT_TO_ACT_STATUS[visitDraft.status] || 'todo',
        next_action:      visitDraft.follow_up        || null,
        details: {
          visit_type:       visitDraft.visit_type       || null,
          location:         visitDraft.location         || null,
          point_of_meeting: visitDraft.point_of_meeting || null,
          mom:              visitDraft.mom              || null,
        },
      };
      let visitId = editVisitId;
      let error;
      // find previous status for log (only relevant in edit mode)
      const prevVisit = editVisitId ? calVisits.find(v => v.id === editVisitId) : null;
      const prevStatus = prevVisit?.status || null;

      if (editVisitId) {
        ({ error } = await supabase.from('activities').update(payload).eq('id', editVisitId));
      } else {
        const res = await supabase.from('activities').insert({ ...payload, company_id: profile.company_id, created_by: profile.id }).select('id').single();
        error = res.error;
        if (res.data) visitId = res.data.id;
      }
      if (error) throw error;

      // fire-and-forget history log → activity_logs. Keep the visit-status
      // vocabulary (scheduled/completed/cancelled) so VisitDetailModal's
      // VISIT_STATUS lookup + the migrated logs stay consistent.
      if (visitId) {
        const logNote = editVisitId
          ? (prevStatus !== visitDraft.status ? null : 'Visit updated')
          : 'Visit dibuat';
        supabase.from('activity_logs').insert({
          activity_id:  visitId,
          changed_by:   profile.id,
          from_status:  editVisitId ? (prevStatus || null) : null,
          to_status:    visitDraft.status,
          notes:        logNote,
        }).then(() => {});
      }

      setAddVisitOpen(false);
      setEditVisitId(null);
      setVisitDraft(EMPTY_DRAFT);
      fetchDash();
      fetchCalVisits();
    } catch (err) {
      setVisitError('Failed to save: ' + err.message);
    } finally {
      setVisitSaving(false);
    }
  }, [visitDraft, editVisitId, calVisits, profile, fetchDash, fetchCalVisits]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── KPI cards from real data ─────────────────────────────────────────────
  const kpisReal = dashData ? [
    { label: "Active Prospects", icon: "users",       value: String(dashData.activeProspects), unit: "prospect",  accent: NAVY,      accentBg: "#EAF0F8", trend: null },
    { label: "Total Inquiry",   icon: "filetext",    value: String(dashData.totalInquiries), unit: "inquiry",   accent: ORANGE,    accentBg: "#FBE6DA", trend: null },
    { label: "Total Quotation", icon: "receipt",     value: String(dashData.totalQuotations),unit: "quotation", accent: "#6E4B8C", accentBg: "#EEE7F4", trend: null },
    // CANCELLED tidak masuk rumus Win Rate, tapi ikut ditampilkan di subtitle —
    // dikeluarkan dari hitungan, bukan disembunyikan dari pembaca.
    { label: "Win Rate",        icon: "checkcircle", value: String(dashData.winRate),        unit: "%",         accent: "#1F8B4D", accentBg: "#DEF0E4", trend: null,
      subtitle: `${dashData.wonCount} won / ${dashData.decided} deals decided · ${dashData.cancelledCount} cancelled (not counted)` },
  ] : KPIS;

  // ── S2 — personal KPI cards (sales/operations view) ──────────────────────
  const progColor = (v, green, yellow) => v >= green ? '#22C55E' : v >= yellow ? '#F59E0B' : '#EF4444';
  const kpisSales = dashData ? [
    { label: "Calls This Week",     icon: "target",      value: String(dashData.callsThisWeek),       unit: "call",      accent: NAVY,      accentBg: "#EAF0F8", trend: null,
      subtitle: `${dashData.callsThisWeek} / 60 target this week`,       progress: { pct: Math.min(dashData.callsThisWeek / 60 * 100, 100),       color: progColor(dashData.callsThisWeek, 60, 30) } },
    { label: "Visits This Week",    icon: "calendar",    value: String(dashData.visitsThisWeek),      unit: "visit",     accent: ORANGE,    accentBg: "#FBE6DA", trend: null,
      subtitle: `${dashData.visitsThisWeek} / 5 target this week`,        progress: { pct: Math.min(dashData.visitsThisWeek / 5 * 100, 100),       color: progColor(dashData.visitsThisWeek, 5, 3) } },
    { label: "Quotations This Month", icon: "receipt",     value: String(dashData.quotationsThisMonth), unit: "quotation", accent: "#6E4B8C", accentBg: "#EEE7F4", trend: null,
      subtitle: `${dashData.quotationsThisMonth} / 20 target this month`,    progress: { pct: Math.min(dashData.quotationsThisMonth / 20 * 100, 100), color: progColor(dashData.quotationsThisMonth, 20, 10) } },
    { label: "Win Rate Personal",   icon: "checkcircle", value: String(dashData.winRate),             unit: "%",         accent: "#1F8B4D", accentBg: "#DEF0E4", trend: null,
      subtitle: `${dashData.wonCount} won / ${dashData.decided} deals decided · ${dashData.cancelledCount} cancelled` },
  ] : KPIS;

  const kpiCards = isSalesOnly ? kpisSales : kpisReal;

  // ── skeleton row ─────────────────────────────────────────────────────────
  const SkeletonRow = () => (
    <div className="nx-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16, marginBottom: 16 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ height: 130, borderRadius: 14, background: "linear-gradient(90deg,#F2F4F7 25%,#E8EBF0 50%,#F2F4F7 75%)", backgroundSize: "400% 100%", animation: "db-shimmer 1.4s ease infinite" }} />
      ))}
    </div>
  );

  return (
    <div className="nx-page-pad" style={D.root}>
      <style>{`
        .om-card{transition:box-shadow .18s ease, transform .18s ease;}
        .om-card:hover{box-shadow:0 2px 4px rgba(20,40,70,.06), 0 14px 32px rgba(20,40,70,.11);transform:translateY(-3px);}
        .recharts-surface{outline:none;}
        @keyframes chartFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
        @keyframes popIn{from{opacity:0;transform:scale(.86);}to{opacity:1;transform:scale(1);}}
        @keyframes db-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
        .bar-in{animation:chartFade .7s ease-out both;}
        .donut-in{animation:popIn .7s cubic-bezier(.34,1.2,.5,1) both;}
        @media (prefers-reduced-motion: reduce){.bar-in,.donut-in{animation:none;}}
      `}</style>
      <div style={D.wrap}>
        {/* header */}
        <div style={D.topRow}>
          <div>
            <nav style={D.crumbs}>
              <span>Home</span>
              <Icon name="chevright" size={13} />
              <span>CRM / Sales</span>
              <Icon name="chevright" size={13} />
              <span style={D.crumbCur}>Dashboard</span>
            </nav>
            <h1 style={D.title}>CRM Dashboard</h1>
            <div style={D.sub}>{isSalesOnly ? `Dashboard personal · ${profile?.full_name || ''}` : 'Team dashboard · all data'}</div>
          </div>
          <div style={D.seg}>
            {PERIODS.map((p) => (
              <button key={p} onClick={() => { setPeriod(p); showToast("Period: " + p, "refresh"); }}
                style={{ ...D.segBtn, ...(period === p ? D.segBtnActive : null) }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* error bar */}
        {dashError && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
            <Icon name="alert" size={15} />
            {dashError}
          </div>
        )}

        {/* Kegagalan SEBAGIAN — halaman tetap tampil, tapi bagian yang gagal
            disebut namanya. Tanpa ini, fetch yang gagal berubah jadi angka nol
            yang tak bisa dibedakan dari nol yang memang benar. */}
        {!dashError && partialFail.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 13, marginBottom: 16 }}>
            <Icon name="alert" size={15} />
            <span>
              Sebagian data gagal dimuat — angka berikut belum tentu benar:{' '}
              <b>{partialFail.join(', ')}</b>. Coba muat ulang halaman.
            </span>
          </div>
        )}

        {/* tab navigation */}
        <DashTabs active={tab} onSelect={setTab} />

        {tab === "calendar" ? (
          <>
            <DashCalendar
              visits={calVisits}
              loading={calLoading}
              isSuper={isSuper}
              anchor={calAnchor}
              mode={calMode}
              range={calRange}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              onThisMonth={goThisMonth}
              onApplyRange={applyCalRange}
              onAddVisit={() => {
                setEditVisitId(null);
                setVisitDraft({ ...EMPTY_DRAFT, visit_date: '' });
                setAddVisitOpen(true);
              }}
              onDayClick={(dateStr) => {
                setEditVisitId(null);
                setVisitDraft({ ...EMPTY_DRAFT, visit_date: dateStr });
                setAddVisitOpen(true);
              }}
              onVisitClick={(v) => setVisitDetail(v)}
            />
            <AddVisitModal
              open={addVisitOpen}
              onClose={() => { setAddVisitOpen(false); setEditVisitId(null); setVisitError(null); }}
              onSave={handleSaveVisit}
              saving={visitSaving}
              error={visitError}
              draft={visitDraft}
              setDraft={setVisitDraft}
              salesProfiles={salesProfiles}
              prospectOptions={prospectOptions}
              isEdit={!!editVisitId}
              canCancel={canCancel}
              onCancelBlocked={() => showToast('Only Manager and above can cancel a visit', 'error')}
            />
            <VisitDetailModal
              visit={visitDetail}
              onClose={() => setVisitDetail(null)}
              onEdit={() => {
                if (!visitDetail) return;
                setVisitDraft({
                  visit_date:       visitDetail.date             || '',
                  visit_time:       visitDetail.time             || '',
                  prospect_id:      visitDetail.prospect_id      || '',
                  salesperson_id:   visitDetail.salesperson_id   || '',
                  location:         visitDetail.location !== '—' ? visitDetail.location : '',
                  notes:            visitDetail.notes            || '',
                  status:           visitDetail.status           || 'scheduled',
                  visit_type:       visitDetail.visit_type       || '',
                  point_of_meeting: visitDetail.point_of_meeting || '',
                  mom:              visitDetail.mom              || '',
                  follow_up:        visitDetail.follow_up        || '',
                });
                setEditVisitId(visitDetail.id);
                setVisitError(null);
                setVisitDetail(null);
                setAddVisitOpen(true);
              }}
            />
          </>
        ) : (
          <React.Fragment>
          {/* row 1 — KPI */}
          {dashLoading ? <SkeletonRow /> : (
            <div className="nx-grid-kpi" style={D.kpiRow}>
              {kpiCards.map((k) => <KpiCard key={k.label} data={k} />)}
            </div>
          )}

          {/* S2 — Aktivitas Saya (sales/operations view only) */}
          {!dashLoading && isSalesOnly && dashData && <ActivitySaya data={dashData} />}

          {/* row 2 — pipeline trend */}
          <div style={{ marginBottom: 16 }}>
            <PipelineTrend
              data={dashData?.trendData || []}
              curLabel={dashData?.curLabel} prevLabel={dashData?.prevLabel}
              bucketNoun={dashData?.bucketNoun}
            />
          </div>

          {/* row 3 — charts */}
          <div className="nx-grid-2" style={D.chartsRow}>
            <PipelineByStage stages={dashData?.stagesData} conversion={dashData?.conversionData || []} />
            <LeadSourceDonut data={dashData?.leadSourceData || []} />
          </div>

          {/* row 3b — dua funnel baru. Lifecycle akun (sumbu AKUN) sengaja
              bersebelahan dengan Alasan Kalah (sumbu DEAL) supaya perbedaan
              kedua sumbu itu terbaca langsung, bukan tercampur jadi satu. */}
          <div className="nx-grid-3" style={{ ...D.tablesRow, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <LifecycleFunnel
              funnel={dashData?.lifecycleFunnel || []}
              exits={dashData?.lifecycleExits || []}
            />
            {/* Pie MQL→SQL duduk tepat di samping funnel lifecycle: keduanya
                sumbu AKUN dan membaca kohort yang sama, jadi angkanya saling
                menjelaskan. */}
            <MqlToSqlPie data={dashData?.mqlData} />
            <LossReasonBreakdown
              data={dashData?.lossReasonData || []}
              total={dashData?.lostCount || 0}
            />
          </div>

          {/* row 3d — beban pipeline per sales, lebar penuh. Dulu berbagi baris
              dengan "Nilai Pipeline Berbobot"; sesudah widget itu di-drop,
              tabelnya melebar sendiri alih-alih meninggalkan kolom kosong.
              Pola satu-kartu-selebar-baris ini sama dengan row 4 di bawah. */}
          <div style={{ marginBottom: 16 }}>
            <ActivePipelineLoad
              rows={dashData?.loadRows || []}
              totalDeals={dashData?.openDealTotal || 0}
            />
          </div>

          {/* row 3c — aging (sempit) + daftar deal stale (lebar). Keduanya
              snapshot kondisi hari ini dan saling menjelaskan: median yang
              melewati ambang seharusnya punya baris-barisnya di tabel sebelah. */}
          <div className="nx-grid-2" style={{ ...D.tablesRow, gridTemplateColumns: "minmax(0,1fr) minmax(0,1.9fr)" }}>
            <AgingPerStage
              rows={dashData?.agingRows || []}
              unknown={dashData?.ageUnknown || 0}
            />
            <StaleDeals
              rows={dashData?.staleRows || []}
              total={dashData?.staleTotal || 0}
              cap={dashData?.staleCap || 30}
            />
          </div>

          {/* row 4 — tabel (team view only — hidden for sales/operations).
              Dulu dua kolom; "New Leads by Source" dilebur ke donut Lead Source
              karena sumber datanya sama persis. */}
          {!isSalesOnly && (
            <div style={{ marginBottom: 16 }}>
              <SalesPerformance data={dashData?.salesPerfData || []} />
            </div>
          )}

          {/* row 5 — activity */}
          <RecentActivity items={dashData?.recentActivity} />
          </React.Fragment>
        )}
      </div>

      {/* toast */}
      <div style={{ ...D.toast, opacity: toast.show ? 1 : 0, transform: toast.show ? "translateY(0)" : "translateY(8px)" }}>
        <Icon name={toast.icon} size={17} />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

export default CRMDashboardPage;
