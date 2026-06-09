import React, { useState, useRef, useEffect, useCallback } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, LabelList, AreaChart, Area } from "recharts";
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

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
  { label: "Total Prospect Aktif", icon: "users",  value: "—", unit: "prospect", accent: NAVY,      accentBg: "#EAF0F8", trend: null },
  { label: "Total Inquiry",        icon: "filetext",value: "—", unit: "inquiry",  accent: ORANGE,    accentBg: "#FBE6DA", trend: null },
  { label: "Total Quotation",      icon: "receipt", value: "—", unit: "quotation",accent: "#6E4B8C", accentBg: "#EEE7F4", trend: null },
  { label: "Win Rate",             icon: "target",  value: "—", unit: "%",        accent: "#1F8B4D", accentBg: "#DEF0E4", trend: null },
];

const STAGES = [
  { id: "new",         name: "New",         count: 0, value: 0, color: NAVY },
  { id: "contacted",   name: "Contacted",   count: 0, value: 0, color: NAVY },
  { id: "qualified",   name: "Qualified",   count: 0, value: 0, color: NAVY },
  { id: "proposal",    name: "Proposal",    count: 0, value: 0, color: NAVY },
  { id: "negotiation", name: "Negotiation", count: 0, value: 0, color: NAVY },
  { id: "won",         name: "Won",         count: 0, value: 0, color: "#1F8B4D" },
  { id: "lost",        name: "Lost",        count: 0, value: 0, color: "#C0392B" },
];

const STATUS_BADGE = {
  "Exceeding": { bg: "#DEF0E4", fg: "#1F8B4D" },
  "On Track":  { bg: "#E5EDF7", fg: "#1E5894" },
  "Need Push": { bg: "#FBEFD3", fg: "#9A6B12" },
  "At Risk":   { bg: "#F7E1DE", fg: "#C0392B" },
};

const LEADS_BY_SOURCE = [
  { source: "Referral",          leads: "—", conv: "—", response: "—" },
  { source: "Existing Network",  leads: "—", conv: "—", response: "—" },
  { source: "Digital Marketing", leads: "—", conv: "—", response: "—" },
  { source: "Cold Call",         leads: "—", conv: "—", response: "—" },
];

const ACTIVITY = [];

const ACT_META = {
  quotation: { icon: "filetext",    bg: "#FBE6DA", fg: "#C8521B" },
  prospect:  { icon: "userplus",    bg: "#EAF0F8", fg: NAVY },
  won:       { icon: "checkcircle", bg: "#DEF0E4", fg: "#1F8B4D" },
  inquiry:   { icon: "inbox",       bg: "#E5EDF7", fg: "#1E5894" },
  move:      { icon: "arrowright",  bg: "#EAF0F8", fg: NAVY },
  lost:      { icon: "ban",         bg: "#F7E1DE", fg: "#C0392B" },
};

/* ---------- lead source color palette ---------- */
const SOURCE_PALETTE = [
  NAVY, "#1E5894", "#2A6FA8", "#3E88C0", "#5BA0D0",
  ORANGE, "#F0894B", "#1F8B4D", "#2BA866", "#6E4B8C", "#9AA0AC",
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
      {!hasTrend && <div style={{ ...D.kpiNote, color: "#BCC0C8" }}>Realtime</div>}
    </div>
  );
}

/* ---------- pipeline prospect trend (recharts area — count per week) ---------- */
function AreaTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const get = (k) => { const p = payload.find((x) => x.dataKey === k); return p ? p.value : 0; };
  return (
    <div style={D.tip}>
      <div style={D.tipTitle}>{label}</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ ...D.tipRow, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#5B8FCB", flex: "0 0 8px" }} />
          Bulan Ini · <b style={{ color: "#fff", fontWeight: 700 }}>{get("bulanIni")} prospect</b>
        </div>
        <div style={{ ...D.tipRow, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE, flex: "0 0 8px" }} />
          Bulan Lalu · <b style={{ color: "#fff", fontWeight: 700 }}>{get("bulanLalu")} prospect</b>
        </div>
      </div>
    </div>
  );
}

function PipelineTrend({ data = [] }) {
  const [areaRef, areaW] = useWidth();
  const isEmpty = data.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="trendup" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Prospect Trend</div>
          <div style={D.cardSub}>Jumlah prospect baru per minggu — bulan ini vs bulan lalu</div>
        </div>
      </div>
      <div style={{ padding: "16px 16px 4px" }}>
        {isEmpty ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9AA0AC", fontSize: 13 }}>Belum ada data prospect</div>
        ) : (
          <div ref={areaRef} className="bar-in">
          {areaW > 0 && (
            <AreaChart width={areaW} height={240} data={data} margin={{ top: 10, right: 22, left: -10, bottom: 0 }}>
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
              <XAxis dataKey="name" axisLine={false} tickLine={false} dy={6}
                tick={{ fontSize: 11.5, fill: "#7A828E", fontWeight: 600 }} />
              <YAxis axisLine={false} tickLine={false} width={30} allowDecimals={false}
                tick={{ fontSize: 11, fill: "#9AA0AC" }} />
              <Tooltip content={<AreaTip />} cursor={{ stroke: "#C7CBD4", strokeWidth: 1, strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="bulanLalu" stroke={ORANGE} strokeWidth={2} strokeDasharray="6 5"
                fill="url(#areaLalu)" dot={{ r: 3, fill: ORANGE, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Area type="monotone" dataKey="bulanIni" stroke={NAVY} strokeWidth={2.5}
                fill="url(#areaIni)" dot={{ r: 3, fill: NAVY, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </AreaChart>
          )}
          </div>
        )}
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
      <div style={D.tipRow}><b style={{ color: "#fff", fontWeight: 700 }}>{d.count}</b> prospect{d.value > 0 ? ' · ' + rpShort(d.value) : ''}</div>
    </div>
  );
}

function PipelineByStage({ stages = STAGES }) {
  const [barRef, barW] = useWidth();
  const totalCount = stages.reduce((a, s) => a + s.count, 0);
  const totalVal   = stages.reduce((a, s) => a + (s.value || 0), 0);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="bars" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Pipeline by Stage</div>
          <div style={D.cardSub}>Jumlah deal per tahap pipeline</div>
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
                <Cell key={s.id} fill={s.id === "won" ? "#1F8B4D" : s.id === "lost" ? "#C0392B" : "url(#navyBar)"} />
              ))}
              <LabelList dataKey="count" position="right" fill="#16243A" fontSize={11} fontWeight={700} />
            </Bar>
          </BarChart>
        )}
        </div>
        <div style={{ ...D.barFoot, margin: "2px 8px 0", padding: "13px 0 14px" }}>
          <span style={{ fontSize: 12, color: "#7A828E", fontWeight: 600 }}>
            <b style={{ color: NAVY, fontWeight: 800 }}>{totalCount}</b> total prospect
          </span>
          {totalVal > 0 && (
            <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: NAVY, letterSpacing: -0.3 }}>{rpShort(totalVal)}</span>
          )}
        </div>
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
  const isEmpty = normalised.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="pie" size={17} /></div>
        <div>
          <div style={D.cardTitle}>Lead Source Distribution</div>
          <div style={D.cardSub}>Asal lead sepanjang periode</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>Belum ada data lead source</div>
      ) : (
        <div style={D.donutBody}>
          <div style={D.donutWrap} className="donut-in">
            <PieChart width={150} height={150}>
              <Pie data={normalised} dataKey="count" nameKey="name" cx={75} cy={75}
                innerRadius={48} outerRadius={72} paddingAngle={1.5} stroke="none"
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
              <div key={s.name} style={D.legRow}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: "0 0 9px" }} />
                <span style={D.legName}>{s.name}</span>
                <span style={D.legVal}>{s.count}</span>
                <span style={D.legPct}>{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
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
          <div style={D.cardSub}>Performa tim sales berdasarkan prospect</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>
          Belum ada data — assign salesperson ke prospects dulu
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
          <thead>
            <tr>
              <th style={D.th}>Salesperson</th>
              <th style={{ ...D.th, textAlign: "center" }}>Prospek</th>
              <th style={{ ...D.th, textAlign: "center" }}>Won</th>
              <th style={{ ...D.th, textAlign: "center" }}>Conv %</th>
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
                      <span style={{ ...D.avatar, background: avatarColor(s.name) }}>{initials(s.name)}</span>
                      <span style={{ fontWeight: 600, color: "#16243A" }}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{s.prospek}</span></td>
                  <td style={{ ...D.td, textAlign: "center" }}><span style={D.num}>{s.won}</span></td>
                  <td style={{ ...D.td, textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      <span style={{ ...D.num, fontWeight: 700, color: "#16243A" }}>{s.convRate}%</span>
                      <div style={{ height: 5, width: 60, background: "#F2F3F6", borderRadius: 4, overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: (maxConv > 0 ? (s.convRate / maxConv) * 100 : 0) + "%", background: b.fg, borderRadius: 4 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ ...D.td, textAlign: "right" }}>
                    <span style={{ ...D.badge, background: b.bg, color: b.fg }}>{status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

/* ---------- new leads by source table (static reference data) ---------- */
function LeadsBySource({ sourceData = [] }) {
  const [hover, setHover] = useState(-1);
  // Build from real lead source data if available
  const rows = sourceData.length > 0
    ? sourceData.slice(0, 8).map(d => ({ source: d.source || d.name || '—', leads: d.count, conv: '—', response: '—' }))
    : LEADS_BY_SOURCE;
  const maxLeads = rows.reduce((a, r) => Math.max(a, typeof r.leads === 'number' ? r.leads : 0), 1);
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="inbox" size={18} /></div>
        <div>
          <div style={D.cardTitle}>New Leads by Source</div>
          <div style={D.cardSub}>Lead baru per kanal</div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
        <thead>
          <tr>
            <th style={D.th}>Source</th>
            <th style={{ ...D.th, textAlign: "center", width: 96 }}>New Leads</th>
            <th style={{ ...D.th, width: 150 }}>Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={l.source + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
              style={{ background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
              <td style={D.td}><span style={{ fontWeight: 600, color: "#16243A" }}>{l.source}</span></td>
              <td style={{ ...D.td, textAlign: "center" }}>
                {typeof l.leads === 'number' ? <span style={D.countPill}>{l.leads}</span> : <span style={{ color: "#9AA0AC" }}>—</span>}
              </td>
              <td style={D.td}>
                {typeof l.leads === 'number' ? (
                  <div style={{ ...D.miniTrack, marginTop: 0 }}>
                    <span style={{ display: "block", height: "100%", width: (l.leads / maxLeads) * 100 + "%", borderRadius: 4, background: NAVY }} />
                  </div>
                ) : <span style={{ color: "#9AA0AC", fontSize: 12 }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
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
          <div><div style={D.cardTitle}>Recent Activity</div><div style={D.cardSub}>Aktivitas prospect, inquiry & quotation terbaru</div></div>
        </div>
        <div style={{ padding: "32px 20px", textAlign: "center", color: "#9AA0AC", fontSize: 13 }}>Belum ada aktivitas</div>
      </div>
    );
  }
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
        {list.map((a, i) => {
          const m = ACT_META[a.type] || ACT_META.prospect;
          const last = i === list.length - 1;
          return (
            <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
              style={{ ...D.actRow, borderBottom: last ? "none" : D.actRow.borderBottom, marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8, borderRadius: 9, background: hover === i ? "#FAFBFC" : "transparent", transition: "background .12s ease" }}>
              <div style={{ ...D.actIco, background: m.bg, color: m.fg }}><Icon name={m.icon} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={D.actText}>{a.text}</div>
                <div style={D.actCo}>{a.co}</div>
              </div>
              <span style={D.actTime}>{a.time}</span>
              {a.user && a.user !== '—' && (
                <span style={D.userBadge}>
                  <span style={{ ...D.userBadgeAv, background: avatarColor(a.user) }}>{initials(a.user)}</span>
                  {a.user}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

/* ---------- visit status badge ---------- */
const VISIT_STATUS = {
  scheduled:  { bg: "#E5EDF7", fg: "#1E5894", label: "Scheduled" },
  completed:  { bg: "#DEF0E4", fg: "#1F8B4D", label: "Completed" },
  cancelled:  { bg: "#F7E1DE", fg: "#C0392B", label: "Cancelled" },
  rescheduled:{ bg: "#FBEFD3", fg: "#9A6B12", label: "Reschedule" },
};

/* ---------- calendar view — real Supabase data ---------- */
function DashCalendar({ visits = [] }) {
  const now = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  const MONTH_LABELS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const DOW = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"];

  const firstDay = new Date(year, month, 1).getDay();   // 0=Sun
  const offset   = (firstDay + 6) % 7;                  // Monday-first offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group visits by date string "YYYY-MM-DD"
  const visitsByDay = {};
  visits.forEach(v => {
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
  const totalVisits = visits.length;

  return (
    <div className="om-card" style={D.card}>
      <div style={{ ...D.cardHead, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={D.cardIco}><Icon name="calendar" size={18} /></div>
          <div>
            <div style={D.cardTitle}>Jadwal Visit Sales</div>
            <div style={D.cardSub}>Kunjungan tim sales — {MONTH_LABELS[month]} {year}</div>
          </div>
        </div>
        <button
          disabled
          title="Fitur ini belum tersedia"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: "not-allowed", opacity: 0.7 }}>
          <Icon name="plus" size={14} />
          Tambah Visit
        </button>
      </div>

      {/* stats row */}
      <div style={{ display: "flex", gap: 20, padding: "10px 16px 0", borderBottom: "1px solid #F0F1F4" }}>
        <div style={{ padding: "8px 0", fontSize: 12, color: "#7A828E" }}>
          <b style={{ color: NAVY, fontFamily: "'Montserrat',system-ui,sans-serif", fontWeight: 800 }}>{totalVisits}</b> jadwal bulan ini
        </div>
        {Object.entries(VISIT_STATUS).map(([key, meta]) => {
          const cnt = visits.filter(v => (v.status || 'scheduled') === key).length;
          if (cnt === 0) return null;
          return (
            <div key={key} style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ ...D.badge, background: meta.bg, color: meta.fg, padding: "2px 7px", fontSize: 10 }}>{meta.label}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, color: "#16243A" }}>{cnt}</span>
            </div>
          );
        })}
      </div>

      {/* day headers */}
      <div style={D.calGridHead}>
        {DOW.map((d) => <div key={d} style={D.calDow}>{d}</div>)}
      </div>

      {/* grid */}
      <div style={D.calGrid}>
        {cells.map((d, i) => {
          const isToday = d === todayDate;
          const dateKey = d ? `${year}-${pad(month + 1)}-${pad(d)}` : null;
          const dayVisits = dateKey ? (visitsByDay[dateKey] || []) : [];
          return (
            <div key={i} style={{
              ...D.calCell,
              ...(d ? null : D.calCellMuted),
              ...(isToday ? D.calCellToday : null),
            }}>
              {d ? (
                isToday
                  ? <div style={D.calNumToday}>{d}</div>
                  : <div style={D.calNum}>{d}</div>
              ) : null}
              {dayVisits.slice(0, 3).map((v, j) => {
                const st = VISIT_STATUS[v.status || 'scheduled'] || VISIT_STATUS.scheduled;
                return (
                  <div key={j} style={{ ...D.calEvent, borderLeftColor: st.fg, background: st.bg + "88" }}>
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
          );
        })}
      </div>

      {totalVisits === 0 && (
        <div style={{ padding: "20px", textAlign: "center", color: "#9AA0AC", fontSize: 13, borderTop: "1px solid #F4F5F7" }}>
          Belum ada jadwal visit bulan ini. Tabel <code style={{ background: "#F2F3F6", padding: "1px 5px", borderRadius: 4 }}>sales_visits</code> mungkin belum tersedia.
        </div>
      )}
    </div>
  );
}

/* ── time-ago helper ─────────────────────────────────────────────────────── */
function fmtTimeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff} detik lalu`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

/* ── stage order for pipeline chart ─────────────────────────────────────── */
const STAGE_ORDER  = ['new','contacted','qualified','proposal','negotiation','won','lost'];
const STAGE_COLORS = { won: '#1F8B4D', lost: '#C0392B' };
const STAGE_LABELS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };

/* ========================================================================= */
function CRMDashboardPage() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState("This Month");
  const [tab, setTab]       = useState("summary");
  const [toast, setToast]   = useState({ msg: "", icon: "check", show: false });
  const toastTimer          = useRef(null);
  const PERIODS = ["This Month", "This Quarter", "This Year"];

  // ── real data state ──────────────────────────────────────────────────────
  const [dashData,    setDashData]    = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError,   setDashError]   = useState(null);

  function showToast(msg, icon) {
    setToast({ msg, icon: icon || "info", show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }

  // ── fetch dashboard data from Supabase ───────────────────────────────────
  const fetchDash = useCallback(async () => {
    if (!profile?.company_id) return;
    setDashLoading(true);
    setDashError(null);
    try {
      const cid = profile.company_id;

      const now            = new Date();
      const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endLastMonth   = new Date(startThisMonth.getTime() - 1);
      const startOfMonth   = startThisMonth.toISOString().slice(0, 10);
      const endOfMonth     = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [prospectsRes, inquiriesRes, quotationsRes, lastMonthRes, salesPerfRes, visitsRes] = await Promise.all([
        // Full prospects for this company — all fields needed for multiple computations
        supabase
          .from('prospects')
          .select('id, pipeline_stage, name, created_at, source, assigned_to, profiles!prospects_assigned_to_fkey(full_name)')
          .eq('company_id', cid)
          .is('deleted_at', null)
          .limit(1000),

        // Inquiry count
        supabase
          .from('inquiries')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', cid)
          .is('deleted_at', null),

        // Quotation count
        supabase
          .from('quotations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', cid),

        // Last month prospects — for trend comparison
        supabase
          .from('prospects')
          .select('created_at')
          .eq('company_id', cid)
          .is('deleted_at', null)
          .gte('created_at', startLastMonth.toISOString())
          .lt('created_at', startThisMonth.toISOString())
          .limit(1000),

        // Sales performance — assigned prospects with pipeline stage
        supabase
          .from('prospects')
          .select('assigned_to, pipeline_stage, profiles!prospects_assigned_to_fkey(full_name)')
          .eq('company_id', cid)
          .is('deleted_at', null)
          .not('assigned_to', 'is', null)
          .limit(1000),

        // Sales visits calendar — graceful fail if table doesn't exist
        supabase
          .from('sales_visits')
          .select('id, visit_date, visit_time, location, notes, status, prospect_id, salesperson_id, prospects(name), profiles!sales_visits_salesperson_id_fkey(full_name)')
          .eq('company_id', cid)
          .gte('visit_date', startOfMonth)
          .lte('visit_date', endOfMonth)
          .order('visit_date', { ascending: true })
          .limit(100),
      ]);

      if (prospectsRes.error) throw prospectsRes.error;

      const prospects       = prospectsRes.data || [];
      const totalProspects  = prospects.length;
      const wonCount        = prospects.filter(p => (p.pipeline_stage || '').toUpperCase() === 'WON').length;
      const winRate         = totalProspects > 0 ? Math.round((wonCount / totalProspects) * 100) : 0;
      const totalInquiries  = inquiriesRes.count  ?? 0;
      const totalQuotations = quotationsRes.count ?? 0;
      const lastMonthProspects = lastMonthRes.data || [];

      // ── Stage breakdown ─────────────────────────────────────────────────
      const stageCounts = {};
      prospects.forEach(p => {
        const s = (p.pipeline_stage || 'new').toLowerCase();
        stageCounts[s] = (stageCounts[s] || 0) + 1;
      });
      const stagesData = STAGE_ORDER.map(id => ({
        id,
        name:  STAGE_LABELS[id] || id,
        count: stageCounts[id] || 0,
        value: 0,
        color: STAGE_COLORS[id] || NAVY,
      }));

      // ── Lead source distribution ─────────────────────────────────────────
      const sourceCounts = {};
      prospects.forEach(p => {
        const s = p.source || 'Lainnya';
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
      });
      const leadSourceData = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // ── Pipeline trend — prospect count per week (bulan ini vs bulan lalu) ─
      const trendData = [1, 2, 3, 4].map(week => {
        const weekStart = new Date(startThisMonth);
        weekStart.setDate((week - 1) * 7 + 1);
        const weekEnd = new Date(startThisMonth);
        weekEnd.setDate(week * 7);

        const thisCount = prospects.filter(p => {
          const d = new Date(p.created_at);
          return d >= weekStart && d <= weekEnd;
        }).length;

        const lmStart = new Date(weekStart); lmStart.setMonth(lmStart.getMonth() - 1);
        const lmEnd   = new Date(weekEnd);   lmEnd.setMonth(lmEnd.getMonth() - 1);
        const lastCount = lastMonthProspects.filter(p => {
          const d = new Date(p.created_at);
          return d >= lmStart && d <= lmEnd;
        }).length;

        return { name: `Minggu ${week}`, bulanIni: thisCount, bulanLalu: lastCount };
      });

      // ── Sales performance ─────────────────────────────────────────────────
      const salesMap = {};
      (salesPerfRes.data || []).forEach(p => {
        const id   = p.assigned_to;
        const name = p.profiles?.full_name || 'Unknown';
        if (!salesMap[id]) salesMap[id] = { name, prospek: 0, won: 0 };
        salesMap[id].prospek++;
        if ((p.pipeline_stage || '').toLowerCase() === 'won') salesMap[id].won++;
      });
      const salesPerfData = Object.values(salesMap)
        .map(s => ({ ...s, convRate: s.prospek > 0 ? Math.round((s.won / s.prospek) * 100) : 0 }))
        .sort((a, b) => b.prospek - a.prospek);

      // ── Calendar visits ────────────────────────────────────────────────────
      // visitsRes.error is acceptable — table may not exist yet
      const visitsData = (visitsRes.data || []).map(v => ({
        id:          v.id,
        date:        v.visit_date,
        time:        v.visit_time,
        prospect:    v.prospects?.name   || '—',
        salesperson: v.profiles?.full_name || '—',
        location:    v.location || '—',
        notes:       v.notes   || '',
        status:      v.status  || 'scheduled',
      }));

      // ── Recent activity ────────────────────────────────────────────────────
      const recentActivity = [...prospects]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(p => ({
          type: 'prospect',
          text: 'Prospect baru',
          co:   p.name || '(tanpa nama)',
          time: fmtTimeAgo(p.created_at),
          user: p.profiles?.full_name || '—',
        }));

      setDashData({
        totalProspects, totalInquiries, totalQuotations, winRate,
        stagesData, recentActivity,
        trendData, leadSourceData, salesPerfData, visitsData,
      });
    } catch (err) {
      console.error('[CRMDashboardPage] fetch error:', err);
      setDashError(err.message || 'Gagal memuat data dashboard.');
    } finally {
      setDashLoading(false);
    }
  }, [profile?.company_id]);

  useEffect(() => { fetchDash(); }, [fetchDash]);

  // ── KPI cards from real data ─────────────────────────────────────────────
  const kpisReal = dashData ? [
    { label: "Total Prospects", icon: "users",       value: String(dashData.totalProspects), unit: "prospect",  accent: NAVY,      accentBg: "#EAF0F8", trend: null },
    { label: "Total Inquiry",   icon: "filetext",    value: String(dashData.totalInquiries), unit: "inquiry",   accent: ORANGE,    accentBg: "#FBE6DA", trend: null },
    { label: "Total Quotation", icon: "receipt",     value: String(dashData.totalQuotations),unit: "quotation", accent: "#6E4B8C", accentBg: "#EEE7F4", trend: null },
    { label: "Win Rate",        icon: "checkcircle", value: String(dashData.winRate),        unit: "%",         accent: "#1F8B4D", accentBg: "#DEF0E4", trend: null },
  ] : KPIS;

  // ── skeleton row ─────────────────────────────────────────────────────────
  const SkeletonRow = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16, marginBottom: 16 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ height: 130, borderRadius: 14, background: "linear-gradient(90deg,#F2F4F7 25%,#E8EBF0 50%,#F2F4F7 75%)", backgroundSize: "400% 100%", animation: "db-shimmer 1.4s ease infinite" }} />
      ))}
    </div>
  );

  return (
    <div style={D.root}>
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

        {/* error bar */}
        {dashError && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
            <Icon name="alert" size={15} />
            {dashError}
          </div>
        )}

        {/* tab navigation */}
        <DashTabs active={tab} onSelect={setTab} />

        {tab === "calendar" ? (
          <DashCalendar visits={dashData?.visitsData || []} />
        ) : (
          <React.Fragment>
          {/* row 1 — KPI */}
          {dashLoading ? <SkeletonRow /> : (
            <div style={D.kpiRow}>
              {kpisReal.map((k) => <KpiCard key={k.label} data={k} />)}
            </div>
          )}

          {/* row 2 — pipeline trend */}
          <div style={{ marginBottom: 16 }}>
            <PipelineTrend data={dashData?.trendData || []} />
          </div>

          {/* row 3 — charts */}
          <div style={D.chartsRow}>
            <PipelineByStage stages={dashData?.stagesData} />
            <LeadSourceDonut data={dashData?.leadSourceData || []} />
          </div>

          {/* row 4 — tables */}
          <div style={D.tablesRow}>
            <SalesPerformance data={dashData?.salesPerfData || []} />
            <LeadsBySource sourceData={dashData?.leadSourceData || []} />
          </div>

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
