import React, { useState, useRef, useEffect } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, LabelList, AreaChart, Area } from "recharts";

/* =========================================================================
   CRMDashboardPage — Nexus by MSI · CRM Sales Dashboard (freight forwarding)
   Self-contained: inline styles only, no external CSS, mock data, no backend.
   Fonts: 'Montserrat' (headings) + 'Inter' (body) + 'IBM Plex Mono' (figures)
   — load globally in your app for an exact match.
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

/* ---------- data ---------- */
const KPIS = [
  { label: "Total Prospect Aktif", icon: "users",  value: "58",       unit: "prospect", accent: NAVY,      accentBg: "#EAF0F8", trend: { dir: "up",   good: true, val: "+8",     note: "vs bulan lalu" } },
  { label: "Total Nilai Pipeline", icon: "wallet", value: "Rp 14,28", unit: "Miliar",   accent: ORANGE,    accentBg: "#FBE6DA", trend: { dir: "up",   good: true, val: "+12,4%", note: "vs bulan lalu" } },
  { label: "Conversion Rate",      icon: "target", value: "32,4",     unit: "%",        accent: "#1F8B4D", accentBg: "#DEF0E4", trend: { dir: "up",   good: true, val: "+3,1%",  note: "prospect → customer" } },
  { label: "Avg Deal Cycle",       icon: "clock",  value: "47",       unit: "hari",     accent: "#6E4B8C", accentBg: "#EEE7F4", trend: { dir: "down", good: true, val: "-5 hari", note: "NEW → WON" } },
];

const STAGES = [
  { id: "new",         name: "New",         count: 18, value: 3420000000, color: NAVY },
  { id: "contacted",   name: "Contacted",   count: 14, value: 2950000000, color: NAVY },
  { id: "qualified",   name: "Qualified",   count: 11, value: 2680000000, color: NAVY },
  { id: "proposal",    name: "Proposal",    count: 8,  value: 2400000000, color: NAVY },
  { id: "negotiation", name: "Negotiation", count: 7,  value: 2830000000, color: NAVY },
  { id: "won",         name: "Won",         count: 9,  value: 2150000000, color: "#1F8B4D" },
  { id: "lost",        name: "Lost",        count: 6,  value: 1020000000, color: "#C0392B" },
];

const TREND = [
  { week: "Minggu 1", ini: 3200000000,  lalu: 2600000000 },
  { week: "Minggu 2", ini: 6900000000,  lalu: 5400000000 },
  { week: "Minggu 3", ini: 10800000000, lalu: 8900000000 },
  { week: "Minggu 4", ini: 14280000000, lalu: 12100000000 },
];

const SOURCE_DIST = [
  { name: "Digital Marketing", count: 22, color: NAVY },
  { name: "Referral",          count: 18, color: "#1E5894" },
  { name: "Website",           count: 16, color: "#2A6FA8" },
  { name: "Existing Network",  count: 14, color: "#3E88C0" },
  { name: "Instagram",         count: 12, color: "#5BA0D0" },
  { name: "Cold Call",         count: 11, color: ORANGE },
  { name: "LinkedIn",          count: 9,  color: "#F0894B" },
  { name: "Exhibition",        count: 7,  color: "#1F8B4D" },
  { name: "TikTok",            count: 5,  color: "#2BA866" },
  { name: "Walk-in",           count: 4,  color: "#6E4B8C" },
  { name: "Lainnya",           count: 3,  color: "#9AA0AC" },
];

const SALES = [
  { name: "Rahmat Adiputra",  prospects: 16, inquiries: 24, quotations: 19, conv: 38, status: "Exceeding" },
  { name: "Dewi Anggraini",   prospects: 14, inquiries: 20, quotations: 15, conv: 31, status: "On Track" },
  { name: "Bayu Pratama",     prospects: 12, inquiries: 17, quotations: 11, conv: 27, status: "On Track" },
  { name: "Sari Melati",      prospects: 9,  inquiries: 11, quotations: 6,  conv: 19, status: "Need Push" },
  { name: "Fajar Nugroho",    prospects: 7,  inquiries: 8,  quotations: 3,  conv: 12, status: "At Risk" },
];

const STATUS_BADGE = {
  "Exceeding": { bg: "#DEF0E4", fg: "#1F8B4D" },
  "On Track":  { bg: "#E5EDF7", fg: "#1E5894" },
  "Need Push": { bg: "#FBEFD3", fg: "#9A6B12" },
  "At Risk":   { bg: "#F7E1DE", fg: "#C0392B" },
};

const LEADS_BY_SOURCE = [
  { source: "Referral",          leads: 18, conv: 41, response: "2,4 jam" },
  { source: "Existing Network",  leads: 14, conv: 38, response: "3,1 jam" },
  { source: "Exhibition",        leads: 7,  conv: 33, response: "1,9 jam" },
  { source: "LinkedIn",          leads: 9,  conv: 29, response: "3,7 jam" },
  { source: "Digital Marketing", leads: 22, conv: 24, response: "5,8 jam" },
  { source: "Website",           leads: 16, conv: 21, response: "4,2 jam" },
  { source: "Instagram",         leads: 12, conv: 18, response: "6,5 jam" },
  { source: "Cold Call",         leads: 11, conv: 15, response: "8,2 jam" },
];

const ACTIVITY = [
  { type: "quotation", text: "Quotation terkirim",        co: "PT Trans Kontinental",            time: "12 menit lalu",   user: "Rahmat Adiputra" },
  { type: "prospect",  text: "Prospect baru ditambahkan", co: "PT Sentosa Logistik Nusantara",   time: "38 menit lalu",   user: "Dewi Anggraini" },
  { type: "won",       text: "Deal dimenangkan (WON)",    co: "PT Cahaya Anugerah Ekspres",      time: "1 jam lalu",      user: "Bayu Pratama" },
  { type: "inquiry",   text: "Inquiry baru masuk",        co: "PT Global Indo Perkasa",          time: "2 jam lalu",      user: "Sari Melati" },
  { type: "move",      text: "Dipindah ke Negotiation",   co: "PT Delta Marine Cargo",           time: "3 jam lalu",      user: "Rahmat Adiputra" },
  { type: "lost",      text: "Prospect ditandai LOST",    co: "PT Prima Cipta Logistik",         time: "5 jam lalu",      user: "Fajar Nugroho" },
  { type: "quotation", text: "Quotation terkirim",        co: "PT Wira Logistik Utama",          time: "Kemarin, 16:40",  user: "Dewi Anggraini" },
  { type: "inquiry",   text: "Inquiry baru masuk",        co: "PT Indofresh Distribusi",         time: "Kemarin, 14:12",  user: "Bayu Pratama" },
];

const ACT_META = {
  quotation: { icon: "filetext",    bg: "#FBE6DA", fg: "#C8521B" },
  prospect:  { icon: "userplus",    bg: "#EAF0F8", fg: NAVY },
  won:       { icon: "checkcircle", bg: "#DEF0E4", fg: "#1F8B4D" },
  inquiry:   { icon: "inbox",       bg: "#E5EDF7", fg: "#1E5894" },
  move:      { icon: "arrowright",  bg: "#EAF0F8", fg: NAVY },
  lost:      { icon: "ban",         bg: "#F7E1DE", fg: "#C0392B" },
};

/* ---------- avatar helper ---------- */
const AV_COLORS = ["#144682", "#1E5894", "#1F8B4D", "#6E4B8C", "#C8521B", "#1F6B6B"];
function initials(name) { return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }
function avatarColor(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }

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
   avoids the ResponsiveContainer + animation race that can collapse marks to 0. */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const update = () => { if (ref.current) setW(ref.current.clientWidth); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---------- style tokens ---------- */
const D = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", background: "#F7F7F8", minHeight: "100%", padding: "26px 28px 44px", boxSizing: "border-box", color: "#1A2330" },
  wrap: { maxWidth: 1280, margin: "0 auto" },

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
  cardHead: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: NAVY, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  cardIco: { width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" },
  cardTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: -0.2 },
  cardSub: { fontSize: 11.5, color: "rgba(255,255,255,.7)", marginTop: 1 },

  /* tab navigation (below page header) */
  tabBar: { display: "flex", gap: 4, borderBottom: "1px solid #ECEDF1", marginBottom: 22 },
  tab: { position: "relative", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "transparent", border: 0, color: "#7A828E", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "color .15s ease" },
  tabHover: { color: NAVY },
  tabActive: { color: NAVY },
  tabInd: { position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: NAVY },

  /* calendar tab */
  calGridHead: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
  calDow: { padding: "9px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#9AA0AC", background: "#FAFBFC", borderBottom: "1px solid #F0F1F4", borderRight: "1px solid #F4F5F7" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
  calCell: { minHeight: 118, padding: "7px 8px", borderRight: "1px solid #F4F5F7", borderBottom: "1px solid #F4F5F7" },
  calCellMuted: { background: "#FBFBFC" },
  calNum: { fontSize: 12, fontWeight: 700, color: "#48505C", marginBottom: 6 },
  calEvent: { padding: "7px 8px", borderRadius: 8, marginBottom: 5, lineHeight: 1.3 },
  calEventCo: { fontSize: 11, fontWeight: 700, color: "#16243A", marginBottom: 5, letterSpacing: -0.1 },
  calSvc: { display: "inline-block", fontSize: 9, fontWeight: 700, letterSpacing: 0.2, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap" },
  calVal: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 10.5, color: NAVY, marginTop: 5, fontVariantNumeric: "tabular-nums" },

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
  donutWrap: { position: "relative", flex: "0 0 150px", width: 150, height: 150 },
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
  const up = data.trend.dir === "up";
  const good = data.trend.good;
  const tone = good ? { fg: "#1F8B4D", bg: "#DEF0E4" } : { fg: "#C0392B", bg: "#F7E1DE" };
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...D.kpiCard, ...(h ? D.kpiCardHover : null) }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, " + data.accent + ", " + data.accent + "55)" }} />
      <div style={D.kpiTop}>
        <div style={{ ...D.kpiIco, background: data.accentBg, color: data.accent }}><Icon name={data.icon} size={20} /></div>
        <span style={{ ...D.kpiTrend, color: tone.fg, background: tone.bg }}>
          <Icon name={up ? "arrowup" : "arrowdown"} size={12} color={tone.fg} />{data.trend.val}
        </span>
      </div>
      <div style={D.kpiLabel}>{data.label}</div>
      <div style={D.kpiValue}><span style={{ whiteSpace: "nowrap" }}>{data.value}</span><span style={D.kpiUnit}>{data.unit}</span></div>
      <div style={D.kpiNote}>{data.trend.note}</div>
    </div>
  );
}

/* ---------- pipeline value trend (recharts area) ---------- */
function AreaTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const get = (k) => { const p = payload.find((x) => x.dataKey === k); return p ? p.value : 0; };
  return (
    <div style={D.tip}>
      <div style={D.tipTitle}>{label}</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ ...D.tipRow, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#5B8FCB", flex: "0 0 8px" }} />
          Bulan Ini · <b style={{ color: "#fff", fontWeight: 700 }}>{rpShort(get("ini"))}</b>
        </div>
        <div style={{ ...D.tipRow, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE, flex: "0 0 8px" }} />
          Bulan Lalu · <b style={{ color: "#fff", fontWeight: 700 }}>{rpShort(get("lalu"))}</b>
        </div>
      </div>
    </div>
  );
}

function PipelineTrend() {
  const [areaRef, areaW] = useWidth();
  const yFmt = (v) => "Rp " + (v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " M";
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="trendup" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Nilai Pipeline Trend</div>
          <div style={D.cardSub}>Perbandingan nilai pipeline bulan ini vs bulan lalu</div>
        </div>
      </div>
      <div style={{ padding: "16px 16px 4px" }}>
        <div ref={areaRef} className="bar-in">
        {areaW > 0 && (
          <AreaChart width={areaW} height={240} data={TREND} margin={{ top: 10, right: 22, left: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="areaIni" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NAVY} stopOpacity={0.20} />
                <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="areaLalu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ORANGE} stopOpacity={0.10} />
                <stop offset="100%" stopColor={ORANGE} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#F1F2F5" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} dy={6}
              tick={{ fontSize: 11.5, fill: "#7A828E", fontWeight: 600 }} />
            <YAxis axisLine={false} tickLine={false} width={64} tickFormatter={yFmt}
              tick={{ fontSize: 11, fill: "#9AA0AC" }} />
            <Tooltip content={<AreaTip />} cursor={{ stroke: "#C7CBD4", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="lalu" stroke={ORANGE} strokeWidth={2} strokeDasharray="6 5"
              fill="url(#areaLalu)" dot={{ r: 3, fill: ORANGE, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Area type="monotone" dataKey="ini" stroke={NAVY} strokeWidth={2.5}
              fill="url(#areaIni)" dot={{ r: 3, fill: NAVY, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </AreaChart>
        )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, padding: "8px 0 14px" }}>
          <span style={D.legItem}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: NAVY, flex: "0 0 11px" }} />
            Bulan Ini
          </span>
          <span style={D.legItem}>
            <span style={{ width: 14, height: 0, borderTop: "2.5px dashed " + ORANGE, flex: "0 0 14px" }} />
            Bulan Lalu
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
  const color = d.id === "won" ? "#1F8B4D" : d.id === "lost" ? "#C0392B" : NAVY;
  return (
    <div style={D.tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: "0 0 8px" }} />
        <span style={D.tipTitle}>{d.name}</span>
      </div>
      <div style={D.tipRow}><b style={{ color: "#fff", fontWeight: 700 }}>{d.count}</b> deal · {rpShort(d.value)}</div>
    </div>
  );
}

function PipelineByStage() {
  const [barRef, barW] = useWidth();
  const totalCount = STAGES.reduce((a, s) => a + s.count, 0);
  const totalVal = STAGES.reduce((a, s) => a + s.value, 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="bars" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Pipeline by Stage</div>
          <div style={D.cardSub}>Jumlah deal & nilai per tahap pipeline</div>
        </div>
      </div>
      <div style={{ padding: "14px 14px 4px" }}>
        <div ref={barRef} className="bar-in">
        {barW > 0 && (
          <BarChart layout="vertical" width={barW} height={300} data={STAGES} margin={{ top: 4, right: 80, left: 6, bottom: 4 }} barCategoryGap={10}>
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
            <Bar dataKey="value" radius={[0, 7, 7, 0]} barSize={22} isAnimationActive={false}>
              {STAGES.map((s) => (
                <Cell key={s.id} fill={s.id === "won" ? "#1F8B4D" : s.id === "lost" ? "#C0392B" : "url(#navyBar)"} />
              ))}
              <LabelList dataKey="count" position="insideRight" fill="#fff" fontSize={11} fontWeight={700} />
              <LabelList dataKey="value" position="right" formatter={rpShort} fill="#16243A" fontSize={11} fontWeight={700} />
            </Bar>
          </BarChart>
        )}
        </div>
        <div style={{ ...D.barFoot, margin: "2px 8px 0", padding: "13px 0 14px" }}>
          <span style={{ fontSize: 12, color: "#7A828E", fontWeight: 600 }}>
            <b style={{ color: NAVY, fontWeight: 800 }}>{totalCount}</b> total deal
          </span>
          <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: NAVY, letterSpacing: -0.3 }}>{rpShort(totalVal)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- donut (recharts) ---------- */
function PieTip({ active, payload, total }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const pct = Math.round((d.count / total) * 100);
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

function LeadSourceDonut() {
  const total = SOURCE_DIST.reduce((a, s) => a + s.count, 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="pie" size={17} /></div>
        <div>
          <div style={D.cardTitle}>Lead Source Distribution</div>
          <div style={D.cardSub}>Asal lead sepanjang periode</div>
        </div>
      </div>
      <div style={D.donutBody}>
        <div style={D.donutWrap} className="donut-in">
          <PieChart width={150} height={150}>
            <Pie data={SOURCE_DIST} dataKey="count" nameKey="name" cx={75} cy={75}
              innerRadius={48} outerRadius={72} paddingAngle={1.5} stroke="none"
              startAngle={90} endAngle={-270} isAnimationActive={false}>
              {SOURCE_DIST.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip content={<PieTip total={total} />} />
          </PieChart>
          <div style={{ ...D.donutCenter, pointerEvents: "none" }}>
            <div style={D.donutTotal}>{total}</div>
            <div style={D.donutTotalLbl}>TOTAL LEAD</div>
          </div>
        </div>
        <div style={D.legend}>
          {SOURCE_DIST.map((s) => (
            <div key={s.name} style={D.legRow}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: "0 0 9px" }} />
              <span style={D.legName}>{s.name}</span>
              <span style={D.legVal}>{s.count}</span>
              <span style={D.legPct}>{Math.round((s.count / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- sales performance table ---------- */
function SalesPerformance() {
  const [hover, setHover] = useState(-1);
  const maxConv = Math.max(...SALES.map((s) => s.conv));
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="award" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Sales Performance</div>
          <div style={D.cardSub}>Performa tim sales bulan ini</div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 430 }}>
        <thead>
          <tr>
            <th style={D.th}>Salesperson</th>
            <th style={{ ...D.th, textAlign: "center" }}>Prospek</th>
            <th style={{ ...D.th, textAlign: "center" }}>Inquiry</th>
            <th style={{ ...D.th, textAlign: "center" }}>Quotation</th>
            <th style={{ ...D.th, textAlign: "center" }}>Conv %</th>
            <th style={{ ...D.th, textAlign: "right" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {SALES.map((s, i) => {
            const b = STATUS_BADGE[s.status];
            return (
              <tr key={s.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                style={{ background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
                <td style={D.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ ...D.avatar, background: avatarColor(s.name) }}>{initials(s.name)}</span>
                    <span style={{ fontWeight: 600, color: "#16243A" }}>{s.name}</span>
                  </div>
                </td>
                <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{s.prospects}</span></td>
                <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{s.inquiries}</span></td>
                <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{s.quotations}</span></td>
                <td style={{ ...D.td, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <span style={{ ...D.num, fontWeight: 700, color: "#16243A" }}>{s.conv}%</span>
                    <div style={{ height: 5, width: 60, background: "#F2F3F6", borderRadius: 4, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: (s.conv / maxConv) * 100 + "%", background: b.fg, borderRadius: 4 }} />
                    </div>
                  </div>
                </td>
                <td style={{ ...D.td, textAlign: "right" }}>
                  <span style={{ ...D.badge, background: b.bg, color: b.fg }}>{s.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ---------- new leads by source table ---------- */
function LeadsBySource() {
  const [hover, setHover] = useState(-1);
  const maxConv = Math.max(...LEADS_BY_SOURCE.map((l) => l.conv));
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="inbox" size={18} /></div>
        <div>
          <div style={D.cardTitle}>New Leads by Source</div>
          <div style={D.cardSub}>Lead baru & efektivitas per kanal</div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 430 }}>
        <thead>
          <tr>
            <th style={D.th}>Source</th>
            <th style={{ ...D.th, textAlign: "center", width: 96 }}>New Leads</th>
            <th style={{ ...D.th, width: 150 }}>Conversion %</th>
            <th style={{ ...D.th, textAlign: "right" }}>Avg Response</th>
          </tr>
        </thead>
        <tbody>
          {LEADS_BY_SOURCE.map((l, i) => (
            <tr key={l.source} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
              style={{ background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
              <td style={D.td}><span style={{ fontWeight: 600, color: "#16243A" }}>{l.source}</span></td>
              <td style={{ ...D.td, textAlign: "center" }}><span style={D.countPill}>{l.leads}</span></td>
              <td style={D.td}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ ...D.num, fontWeight: 700, color: "#16243A", width: 34, flex: "0 0 34px" }}>{l.conv}%</span>
                  <div style={{ ...D.miniTrack, marginTop: 0 }}>
                    <span style={{ display: "block", height: "100%", width: (l.conv / maxConv) * 100 + "%", borderRadius: 4, background: l.conv >= 30 ? ORANGE : NAVY }} />
                  </div>
                </div>
              </td>
              <td style={{ ...D.td, textAlign: "right" }}><span style={{ ...D.num, color: "#6B7280" }}>{l.response}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ---------- recent activity ---------- */
function RecentActivity() {
  const [hover, setHover] = useState(-1);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="activity" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Recent Activity</div>
          <div style={D.cardSub}>Aktivitas prospect, inquiry & quotation terbaru</div>
        </div>
      </div>
      <div style={D.actBody}>
        {ACTIVITY.map((a, i) => {
          const m = ACT_META[a.type];
          const last = i === ACTIVITY.length - 1;
          return (
            <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
              style={{ ...D.actRow, borderBottom: last ? "none" : D.actRow.borderBottom, marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8, borderRadius: 9, background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
              <div style={{ ...D.actIco, background: m.bg, color: m.fg }}><Icon name={m.icon} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={D.actText}>{a.text}</div>
                <div style={D.actCo}>{a.co}</div>
              </div>
              <span style={D.actTime}>{a.time}</span>
              <span style={D.userBadge}>
                <span style={{ ...D.userBadgeAv, background: avatarColor(a.user) }}>{initials(a.user)}</span>
                {a.user}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- calendar tab (mock data) ---------- */
const CAL_SVC = {
  sea:     { label: "Sea Freight",   bg: "#E5EDF7", fg: "#1E5894" },
  air:     { label: "Air Freight",   bg: "#DCF0F2", fg: "#0E7C8B" },
  customs: { label: "Customs",       bg: "#EEE7F4", fg: "#6E4B8C" },
  land:    { label: "Trucking",      bg: "#FBE6DA", fg: "#C8521B" },
  wh:      { label: "Warehousing",   bg: "#DEF0E4", fg: "#1F8B4D" },
  project: { label: "Project Cargo", bg: "#E5EDF7", fg: "#234F86" },
};
const CAL_MONTH = { label: "Juli 2026", year: 2026, month: 6 };
const CAL_EVENTS = {
  2:  [{ co: "PT Samudra Jaya Makmur",   value: 145000000, svc: "sea" }],
  7:  [{ co: "PT Karya Nusantara Cargo", value: 268000000, svc: "customs" }],
  9:  [{ co: "PT Global Indo Perkasa",   value: 420000000, svc: "air" }],
  14: [{ co: "PT Delta Marine Cargo",    value: 720000000, svc: "sea" }],
  16: [{ co: "CV Berkah Mandiri",        value: 78000000,  svc: "land" }],
  18: [{ co: "PT Maju Bersama Logistik", value: 185000000, svc: "sea" }],
  21: [{ co: "PT Wira Logistik Utama",   value: 355000000, svc: "customs" }],
  24: [{ co: "PT Mitra Sukses Sejahtera",value: 240000000, svc: "air" }],
  28: [{ co: "PT Indofresh Distribusi",  value: 535000000, svc: "wh" }],
  30: [{ co: "PT Bintang Timur Niaga",   value: 310000000, svc: "project" }],
};

/* ---------- tab navigation ---------- */
const DASH_TABS = [
  { id: "summary",  label: "Summary",  icon: "layoutdashboard" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
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

/* ---------- calendar view ---------- */
function DashCalendar() {
  const dow = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const first = new Date(CAL_MONTH.year, CAL_MONTH.month, 1).getDay();
  const offset = (first + 6) % 7;
  const days = new Date(CAL_MONTH.year, CAL_MONTH.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="calendar" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Calendar Prospect</div>
          <div style={D.cardSub}>Estimasi closing prospect · {CAL_MONTH.label}</div>
        </div>
      </div>
      <div style={D.calGridHead}>
        {dow.map((d) => <div key={d} style={D.calDow}>{d}</div>)}
      </div>
      <div style={D.calGrid}>
        {cells.map((d, i) => {
          const evs = d ? CAL_EVENTS[d] : null;
          return (
            <div key={i} style={{ ...D.calCell, ...(d ? null : D.calCellMuted) }}>
              {d ? <div style={D.calNum}>{d}</div> : null}
              {evs ? evs.map((e, j) => {
                const sv = CAL_SVC[e.svc] || CAL_SVC.sea;
                return (
                  <div key={j} style={{ ...D.calEvent, background: sv.bg }}>
                    <div style={D.calEventCo}>{e.co}</div>
                    <span style={{ ...D.calSvc, background: "#fff", color: sv.fg }}>{sv.label}</span>
                    <div style={D.calVal}>{rpShort(e.value)}</div>
                  </div>
                );
              }) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========================================================================= */
function CRMDashboardPage() {
  const [period, setPeriod] = useState("This Month");
  const [tab, setTab] = useState("summary");
  const [toast, setToast] = useState({ msg: "", icon: "check", show: false });
  const toastTimer = useRef(null);
  const PERIODS = ["This Month", "This Quarter", "This Year"];

  function showToast(msg, icon) {
    setToast({ msg, icon: icon || "info", show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }

  return (
    <div style={D.root}>
      <style>{".om-card{transition:box-shadow .18s ease, transform .18s ease;} .om-card:hover{box-shadow:0 2px 4px rgba(20,40,70,.06), 0 14px 32px rgba(20,40,70,.11);transform:translateY(-3px);} .recharts-surface{outline:none;} @keyframes chartFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}} @keyframes popIn{from{opacity:0;transform:scale(.86);}to{opacity:1;transform:scale(1);}} .bar-in{animation:chartFade .7s ease-out both;} .donut-in{animation:popIn .7s cubic-bezier(.34,1.2,.5,1) both;} @media (prefers-reduced-motion: reduce){.bar-in,.donut-in{animation:none;}}"}</style>
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
            <div style={D.sub}>Overview pipeline, leads, dan performa sales MSI Group</div>
          </div>
          <div style={D.seg}>
            {PERIODS.map((p) => (
              <button key={p} onClick={() => { setPeriod(p); showToast("Periode: " + p, "refresh"); }}
                style={{ ...D.segBtn, ...(period === p ? D.segBtnActive : null) }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* tab navigation */}
        <DashTabs active={tab} onSelect={setTab} />

        {tab === "calendar" ? <DashCalendar /> : (
        <React.Fragment>
        {/* row 1 — KPI */}
        <div style={D.kpiRow}>
          {KPIS.map((k) => <KpiCard key={k.label} data={k} />)}
        </div>

        {/* row 2 — pipeline value trend */}
        <div style={{ marginBottom: 16 }}>
          <PipelineTrend />
        </div>

        {/* row 3 — charts */}
        <div style={D.chartsRow}>
          <PipelineByStage />
          <LeadSourceDonut />
        </div>

        {/* row 3 — tables */}
        <div style={D.tablesRow}>
          <SalesPerformance />
          <LeadsBySource />
        </div>

        {/* row 4 — activity */}
        <RecentActivity />
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