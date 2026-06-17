// src/modules/inventory/pages/InventoryDashboardPage.jsx
// Dashboard Inventory / Warehouse — Nexus by MSI · Inventory module.
// Visual port of the Lovable design (claude.ai/design handoff) wired to REAL
// Supabase data: stock_summary × products × warehouses + stock_ledger.
// Role-aware & company-scoped (super_admin/admin see all entities, others their
// own) — mirrors CRMDashboardPage. Module accent: TEAL (distinct from navy CRM).
// Fonts: Montserrat (headings) + Inter (body) + IBM Plex Mono (figures).

import { useState, useRef, useEffect, useCallback } from "react";
import { CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/useAuth";

/* ---------- brand + module tokens ---------- */
const TEAL    = "#0D9488";   /* module accent */
const TEALD   = "#0F766E";   /* darker teal for text/gradient stop */
const TEALBG  = "#D6F0EC";   /* soft teal tint (icon badges) */
const AMBER   = "#D97917";   /* warning accent */
const AMBERBG = "#FBEFD3";
const REDFG   = "#DC2626";
const REDBG   = "#FEE2E2";
const CREAM   = "#F6F3EE";

/* category pastel palette (assigned dynamically per real products.category) */
const CAT_PALETTE = ["#5EEAD4", "#7FB5E6", "#2DD4BF", "#C9B8E0", "#F5C97A", "#E6A8B8", "#9DB4D8"];

const THRESHOLD = 10;                 // low-stock threshold (no min_stock column yet)
const WEEKS_MAX = 12;                 // ledger lookback window (weeks)
const WEEKS_BY_PERIOD = { "This Month": 4, "This Quarter": 8, "This Year": 12 };

/* ---------- icons (inline lucide paths) ---------- */
const ICONS = {
  chevright: '<path d="m9 18 6-6-6-6"/>',
  package:   '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  coins:     '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  boxes:     '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  triangle:  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  trendup:   '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  layers:    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/>',
  trophy:    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  refresh:   '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  pie:       '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
  info:      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
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
const nf = (n) => Number(n || 0).toLocaleString("id-ID");
const rp = (n) => "Rp " + nf(Math.round(n));
const rpShort = (n) => {
  if (n >= 1e9) return "Rp " + (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  if (n >= 1e6) return "Rp " + (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " Jt";
  if (n >= 1e3) return "Rp " + (n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " Rb";
  return rp(n);
};
function fmtDate(d) {
  if (!d) return "–";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "–";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

/* ---------- width hook — CALLBACK REF (measures when the chart container
   actually mounts, including after data loads; the useRef+useEffect([]) form
   leaves charts at width 0 if the container is conditional). ---------- */
function useWidth() {
  const [w, setW] = useState(0);
  const roRef = useRef(null);
  const ref = useCallback((node) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!node) return;
    setW(node.clientWidth);
    const ro = new ResizeObserver(() => setW(node.clientWidth));
    ro.observe(node);
    roRef.current = ro;
  }, []);
  return [ref, w];
}

/* ---------- style tokens ---------- */
const D = {
  root: { fontFamily: "'Inter', system-ui, sans-serif", background: CREAM, minHeight: "100%", padding: "26px 28px 44px", boxSizing: "border-box", color: "#1A2330" },
  wrap: { maxWidth: 1320, margin: "0 auto" },

  topRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, marginBottom: 24, flexWrap: "wrap" },
  crumbs: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#A39B8C", marginBottom: 8 },
  crumbCur: { color: "#5C5547", fontWeight: 600 },
  title: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: -0.5, color: "#16243A", margin: 0 },
  sub: { fontSize: 13, color: "#857D6E", marginTop: 5 },

  seg: { display: "inline-flex", background: "#EAE5DC", borderRadius: 11, padding: 4, gap: 2 },
  segBtn: { border: 0, background: "transparent", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "#857D6E", padding: "8px 14px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", transition: "color .15s ease" },
  segBtnActive: { background: TEAL, color: "#fff", boxShadow: "0 1px 2px rgba(13,80,75,.18), 0 2px 6px rgba(13,80,75,.14)" },

  card: { background: "#FFFDF8", border: "1px solid #ECE6DA", borderRadius: 14, boxShadow: "0 1px 2px rgba(40,35,25,.04), 0 4px 14px rgba(40,35,25,.03)", overflow: "hidden" },
  cardHead: { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: TEAL },
  cardHeadAmber: { background: AMBER },
  cardIco: { width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.18)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" },
  cardTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: -0.2 },
  cardSub: { fontSize: 11.5, color: "rgba(255,255,255,.78)", marginTop: 1 },

  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, marginBottom: 16 },
  chartsRow: { display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16, marginBottom: 16, alignItems: "start" },
  chartsRow2: { display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16, marginBottom: 16, alignItems: "start" },

  kpiCard: { position: "relative", overflow: "hidden", background: "#FFFDF8", border: "1px solid #ECE6DA", borderRadius: 14, boxShadow: "0 1px 2px rgba(40,35,25,.04), 0 4px 14px rgba(40,35,25,.03)", padding: "21px 20px 18px", transition: "box-shadow .18s ease, transform .18s ease" },
  kpiTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  kpiIco: { width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 42px" },
  kpiLabel: { fontSize: 10.5, fontWeight: 700, color: "#A39B8C", letterSpacing: 0.6, textTransform: "uppercase" },
  kpiValue: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 28, color: "#16243A", letterSpacing: -0.8, lineHeight: 1.05, marginTop: 7, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap" },
  kpiValueMono: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 26, letterSpacing: -1, fontVariantNumeric: "tabular-nums" },
  kpiUnit: { fontSize: 13, fontWeight: 600, color: "#A39B8C", letterSpacing: 0 },
  kpiNote: { fontSize: 11.5, color: "#A39B8C", marginTop: 9 },

  legItem: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "#5C5547" },

  donutBody: { padding: "18px 16px 20px", display: "flex", alignItems: "center", gap: 14 },
  donutWrap: { position: "relative", flex: "0 0 134px", width: 134, height: 144 },
  donutCenter: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  donutTotal: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 800, fontSize: 23, color: "#16243A", letterSpacing: -0.6, lineHeight: 1, fontVariantNumeric: "tabular-nums" },
  donutTotalLbl: { fontSize: 9.5, color: "#A39B8C", fontWeight: 700, marginTop: 4, letterSpacing: 0.5, textTransform: "uppercase" },
  legend: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 },
  legRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11.5 },
  legName: { color: "#4A4438", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  legVal: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, color: "#16243A", fontVariantNumeric: "tabular-nums" },
  legPct: { color: "#A39B8C", fontWeight: 600, fontSize: 10, width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums", flex: "0 0 28px" },

  whBody: { padding: "10px 18px 18px" },
  whRow: { padding: "13px 0", borderBottom: "1px solid #F1ECE2" },
  whTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 },
  whName: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  whIco: { width: 34, height: 34, borderRadius: 9, background: TEALBG, color: TEALD, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" },
  whNameT: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 700, fontSize: 13, color: "#16243A", letterSpacing: -0.1 },
  whNote: { fontSize: 11, color: "#A39B8C", marginTop: 1 },
  whQty: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 14, color: "#16243A", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  whTrack: { position: "relative", height: 8, background: "#EFEAE0", borderRadius: 5, overflow: "hidden" },
  whFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5, background: "linear-gradient(90deg, #2DD4BF, " + TEAL + ")" },
  whUtil: { fontSize: 10.5, fontWeight: 700, color: TEALD, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", marginLeft: 10 },

  th: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#A39B8C", background: "#FAF7F1", borderBottom: "1px solid #F1ECE2", padding: "10px 16px", textAlign: "left", whiteSpace: "nowrap" },
  td: { padding: "12px 16px", borderBottom: "1px solid #F4F0E8", fontSize: 12.5, color: "#1A2330", verticalAlign: "middle", whiteSpace: "nowrap" },
  skuCell: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, fontSize: 12, color: TEALD, letterSpacing: 0.1 },
  nameCell: { fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600, fontSize: 13, color: "#16243A", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  catPill: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: "#5C5547", background: "#F3EFE7", padding: "3px 9px 3px 7px", borderRadius: 20, whiteSpace: "nowrap" },
  qtyCell: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" },
  uomCell: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: "#A39B8C", marginLeft: 5 },
  badge: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },

  topBody: { padding: "14px 20px 16px" },
  topRowR: { display: "grid", gridTemplateColumns: "22px minmax(0,1fr) 96px", alignItems: "center", gap: 12, padding: "8px 0" },
  topRank: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: "#A39B8C", textAlign: "center" },
  topName: { fontSize: 12, fontWeight: 600, color: "#16243A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 5 },
  topTrack: { position: "relative", height: 9, background: "#EFEAE0", borderRadius: 5, overflow: "hidden" },
  topFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5, transition: "width .6s cubic-bezier(.4,0,.2,1)" },
  topVal: { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 12, color: "#16243A", textAlign: "right", fontVariantNumeric: "tabular-nums" },

  empty: { padding: "40px 0", textAlign: "center", color: "#A39B8C", fontSize: 13 },
  toast: { position: "fixed", right: 24, bottom: 24, display: "flex", alignItems: "center", gap: 9, background: "#16243A", color: "#fff", padding: "11px 15px", borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: "0 12px 30px rgba(10,20,40,.28)", zIndex: 200, transition: "opacity .2s ease, transform .2s ease", pointerEvents: "none" },
  tip: { background: "#16243A", color: "#fff", padding: "9px 12px", borderRadius: 9, boxShadow: "0 10px 26px rgba(10,20,40,.28)", border: "1px solid rgba(255,255,255,.08)" },
  tipTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontWeight: 700, fontSize: 12.5, color: "#fff" },
  tipRow: { fontSize: 11.5, color: "rgba(255,255,255,.82)", fontVariantNumeric: "tabular-nums", marginTop: 2, display: "flex", alignItems: "center", gap: 7 },
};

/* ---------- KPI card (trend pill rendered only when real trend data exists) ---------- */
function KpiCard({ data }) {
  const [h, setH] = useState(false);
  const accent = data.warn ? AMBER : TEAL;
  const accentBg = data.warn ? AMBERBG : TEALBG;
  const accentFg = data.warn ? AMBER : TEALD;
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...D.kpiCard, ...(h ? { boxShadow: "0 2px 4px rgba(40,35,25,.06), 0 14px 32px rgba(40,35,25,.10)", transform: "translateY(-3px)" } : null) }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, " + accent + ", " + accent + "55)" }} />
      <div style={D.kpiTop}>
        <div style={{ ...D.kpiIco, background: accentBg, color: accentFg }}><Icon name={data.icon} size={21} /></div>
      </div>
      <div style={D.kpiLabel}>{data.label}</div>
      <div style={D.kpiValue}>
        <span style={data.mono ? D.kpiValueMono : null}>{data.value}</span>
        {data.unit ? <span style={D.kpiUnit}>{data.unit}</span> : null}
      </div>
      <div style={D.kpiNote}>{data.note}</div>
    </div>
  );
}

/* ---------- movement trend (area) ---------- */
function MoveTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const get = (k) => { const p = payload.find((x) => x.dataKey === k); return p ? p.value : 0; };
  return (
    <div style={D.tip}>
      <div style={D.tipTitle}>Minggu {String(label).replace("M", "")}</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={D.tipRow}><span style={{ width: 8, height: 8, borderRadius: 2, background: TEAL, flex: "0 0 8px" }} />Inbound · <b style={{ color: "#fff", fontWeight: 700 }}>{nf(get("masuk"))}</b></div>
        <div style={D.tipRow}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#7FB5E6", flex: "0 0 8px" }} />Outbound · <b style={{ color: "#fff", fontWeight: 700 }}>{nf(get("keluar"))}</b></div>
      </div>
    </div>
  );
}
function MovementTrend({ data = [], weeks }) {
  const [ref, w] = useWidth();
  const isEmpty = data.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="trendup" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Tren Pergerakan Stok</div>
          <div style={D.cardSub}>Inbound vs outbound per minggu ({weeks} minggu terakhir)</div>
        </div>
      </div>
      <div style={{ padding: "16px 16px 4px" }}>
        {isEmpty ? (
          <div style={D.empty}>Belum ada pergerakan stok pada periode ini</div>
        ) : (
          <div ref={ref} className="bar-in">
          {w > 0 && (
            <AreaChart width={w} height={250} data={data} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="invAreaMasuk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TEAL} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="invAreaKeluar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7FB5E6" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="#7FB5E6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#F1ECE2" />
              <XAxis dataKey="week" axisLine={false} tickLine={false} dy={6} tick={{ fontSize: 11.5, fill: "#857D6E", fontWeight: 600 }} />
              <YAxis axisLine={false} tickLine={false} width={42} tickFormatter={(v) => v >= 1000 ? (v / 1000) + "k" : v} tick={{ fontSize: 11, fill: "#A39B8C" }} />
              <Tooltip content={<MoveTip />} cursor={{ stroke: "#D8D0C2", strokeWidth: 1, strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="keluar" stroke="#7FB5E6" strokeWidth={2.5} fill="url(#invAreaKeluar)" dot={{ r: 3, fill: "#7FB5E6", strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Area type="monotone" dataKey="masuk"  stroke={TEAL}    strokeWidth={2.5} fill="url(#invAreaMasuk)"  dot={{ r: 3, fill: TEAL,    strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </AreaChart>
          )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 26, padding: "8px 0 14px" }}>
          <span style={D.legItem}><span style={{ width: 11, height: 11, borderRadius: "50%", background: TEAL, flex: "0 0 11px" }} />Inbound (masuk)</span>
          <span style={D.legItem}><span style={{ width: 11, height: 11, borderRadius: "50%", background: "#7FB5E6", flex: "0 0 11px" }} />Outbound (keluar)</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- category donut ---------- */
function CatTip({ active, payload, total }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
  return (
    <div style={D.tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flex: "0 0 8px" }} />
        <span style={D.tipTitle}>{d.name}</span>
      </div>
      <div style={{ ...D.tipRow, marginTop: 0 }}><b style={{ color: "#fff", fontWeight: 700 }}>{nf(d.value)}</b> unit · {pct}%</div>
    </div>
  );
}
function CategoryDonut({ data = [] }) {
  const total = data.reduce((a, c) => a + c.value, 0);
  const isEmpty = data.length === 0;
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="layers" size={17} /></div>
        <div>
          <div style={D.cardTitle}>Stok per Kategori</div>
          <div style={D.cardSub}>Distribusi on-hand per kategori produk</div>
        </div>
      </div>
      {isEmpty ? (
        <div style={D.empty}>Belum ada data kategori</div>
      ) : (
        <div style={D.donutBody}>
          <div style={D.donutWrap} className="donut-in">
            <PieChart width={134} height={144}>
              <Pie data={data} dataKey="value" nameKey="name" cx={67} cy={72} innerRadius={43} outerRadius={63} paddingAngle={1.5} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                {data.map((c) => <Cell key={c.name} fill={c.color} />)}
              </Pie>
              <Tooltip content={<CatTip total={total} />} />
            </PieChart>
            <div style={{ ...D.donutCenter, pointerEvents: "none" }}>
              <div style={D.donutTotal}>{nf(total)}</div>
              <div style={D.donutTotalLbl}>Total Unit</div>
            </div>
          </div>
          <div style={D.legend}>
            {data.map((c) => (
              <div key={c.name} style={D.legRow}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, flex: "0 0 9px" }} />
                <span style={D.legName}>{c.name}</span>
                <span style={D.legVal}>{nf(c.value)}</span>
                <span style={D.legPct}>{total > 0 ? Math.round((c.value / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- top 10 by value ---------- */
function TopByValue({ data = [] }) {
  const max = Math.max(1, ...data.map((p) => p.value));
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="trophy" size={17} /></div>
        <div>
          <div style={D.cardTitle}>Top 10 Produk by Nilai</div>
          <div style={D.cardSub}>Peringkat nilai inventory (on-hand × harga jual)</div>
        </div>
      </div>
      {data.length === 0 ? (
        <div style={D.empty}>Belum ada produk bernilai</div>
      ) : (
        <div style={D.topBody}>
          {data.map((p, i) => (
            <div key={p.sku} style={D.topRowR}>
              <span style={D.topRank}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={D.topName}>{p.name}</div>
                <div style={D.topTrack}>
                  <span style={{ ...D.topFill, width: (p.value / max) * 100 + "%", background: "linear-gradient(90deg, #2DD4BF, " + TEAL + ")" }} />
                </div>
              </div>
              <span style={D.topVal}>{rpShort(p.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- stock per warehouse (bar = share of total units; no capacity column) ---------- */
function StockPerWarehouse({ data = [] }) {
  return (
    <div className="om-card" style={D.card}>
      <div style={D.cardHead}>
        <div style={D.cardIco}><Icon name="warehouse" size={18} /></div>
        <div>
          <div style={D.cardTitle}>Stok per Gudang</div>
          <div style={D.cardSub}>Distribusi on-hand per lokasi penyimpanan</div>
        </div>
      </div>
      {data.length === 0 ? (
        <div style={D.empty}>Belum ada data gudang</div>
      ) : (
        <div style={D.whBody}>
          {data.map((w, i) => (
            <div key={w.code + i} style={{ ...D.whRow, borderBottom: i === data.length - 1 ? "none" : D.whRow.borderBottom }}>
              <div style={D.whTop}>
                <div style={D.whName}>
                  <div style={D.whIco}><Icon name="warehouse" size={17} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={D.whNameT}>{w.name}</div>
                    {w.note ? <div style={D.whNote}>{w.note}</div> : null}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={D.whQty}>{nf(w.qty)}</div>
                  <div style={{ fontSize: 10.5, color: "#A39B8C", fontWeight: 600, marginTop: 1 }}>unit on-hand</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ ...D.whTrack, flex: 1 }}><span style={{ ...D.whFill, width: w.share + "%" }} /></div>
                <span style={D.whUtil}>{w.share}% dari total</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- low stock alert table ---------- */
function LowStockTable({ rows = [] }) {
  const [hover, setHover] = useState(-1);
  return (
    <div className="om-card" style={D.card}>
      <div style={{ ...D.cardHead, ...D.cardHeadAmber }}>
        <div style={D.cardIco}><Icon name="triangle" size={18} /></div>
        <div style={{ flex: 1 }}>
          <div style={D.cardTitle}>Low Stock Alert</div>
          <div style={D.cardSub}>Produk di bawah ambang batas ({THRESHOLD} unit) — paling kritis di atas</div>
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 700, fontSize: 13, color: "#fff", background: "rgba(255,255,255,.2)", padding: "5px 12px", borderRadius: 20 }}>{rows.length} produk</span>
      </div>
      {rows.length === 0 ? (
        <div style={D.empty}>Tidak ada produk di bawah ambang batas — stok aman</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr>
                <th style={D.th}>SKU</th>
                <th style={D.th}>Nama Produk</th>
                <th style={D.th}>Kategori</th>
                <th style={{ ...D.th, textAlign: "right" }}>On-Hand</th>
                <th style={{ ...D.th, textAlign: "right" }}>Available</th>
                <th style={D.th}>Last Count</th>
                <th style={{ ...D.th, textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const avail = p.onhand - p.reserved;
                const habis = p.onhand === 0;
                const st = habis ? { label: "Habis", bg: REDBG, fg: REDFG } : { label: "Kritis", bg: AMBERBG, fg: AMBER };
                return (
                  <tr key={p.sku + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                    style={{ background: hover === i ? "#FAF7F1" : (i % 2 ? "#FCFAF5" : "transparent"), transition: "background .12s ease" }}>
                    <td style={D.td}><span style={D.skuCell}>{p.sku}</span></td>
                    <td style={D.td}><span style={D.nameCell}>{p.name}</span></td>
                    <td style={D.td}><span style={D.catPill}><span style={{ width: 8, height: 8, borderRadius: 3, background: p.catColor, flex: "0 0 8px" }} />{p.cat}</span></td>
                    <td style={{ ...D.td, textAlign: "right" }}><span style={{ ...D.qtyCell, color: habis ? REDFG : AMBER }}>{nf(p.onhand)}</span><span style={D.uomCell}>{p.uom}</span></td>
                    <td style={{ ...D.td, textAlign: "right" }}><span style={{ ...D.qtyCell, fontWeight: 600, color: "#5C5547" }}>{nf(avail)}</span></td>
                    <td style={D.td}><span style={{ fontSize: 11.5, color: "#A39B8C" }}>{fmtDate(p.lastRaw)}</span></td>
                    <td style={{ ...D.td, textAlign: "right" }}><span style={{ ...D.badge, background: st.bg, color: st.fg }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: st.fg, flex: "0 0 6px" }} />{st.label}</span></td>
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

/* ========================================================================= */
export default function InventoryDashboardPage() {
  const { profile, erpRole } = useAuth();
  // Role-aware scope (mirror CRMDashboard): super_admin/admin → all entities,
  // everyone else → their own company (RLS scopes the rest).
  const isAllEntities = ["super_admin", "admin"].includes(erpRole);

  const [period, setPeriod] = useState("This Month");
  const [toast, setToast] = useState({ msg: "", icon: "info", show: false });
  const toastTimer = useRef(null);
  const PERIODS = ["This Month", "This Quarter", "This Year"];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  function showToast(msg, icon) {
    setToast({ msg, icon: icon || "info", show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }

  const fetchDash = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    setError(null);
    try {
      const sinceISO = new Date(Date.now() - WEEKS_MAX * 7 * 24 * 3600 * 1000).toISOString();

      let stockQ = supabase
        .from("stock_summary")
        .select(`
          product_id, warehouse_id, company_id,
          on_hand, reserved, available, last_count_date,
          products ( code, name, category, unit, uom, default_price ),
          warehouses ( code, name, city )
        `);
      if (!isAllEntities) stockQ = stockQ.eq("company_id", profile.company_id);
      stockQ = stockQ.limit(1000);

      let ledgerQ = supabase
        .from("stock_ledger")
        .select("movement_type, qty, created_at, product_id, company_id")
        .gte("created_at", sinceISO);
      if (!isAllEntities) ledgerQ = ledgerQ.eq("company_id", profile.company_id);
      ledgerQ = ledgerQ.limit(1000);

      const [stockRes, ledgerRes] = await Promise.all([stockQ, ledgerQ]);
      if (stockRes.error) throw stockRes.error;
      const stock  = stockRes.data || [];
      const ledger = ledgerRes.data || []; // graceful — movement just empty if table/col absent

      // ── group stock_summary by product (combine warehouses) ──────────────
      const prodMap = {};
      for (const row of stock) {
        const pid = row.product_id;
        if (!prodMap[pid]) {
          prodMap[pid] = {
            pid,
            sku:  row.products?.code || "–",
            name: row.products?.name || "–",
            cat:  row.products?.category || "Lainnya",
            // Value basis = default_price (harga jual). unit_cost is all-NULL in
            // the data, so inventory value is computed from selling price.
            // Number(... ) || 0 acts as COALESCE(default_price, 0) → no NaN.
            cost: Number(row.products?.default_price) || 0,
            uom:  row.products?.uom || row.products?.unit || "PCS",
            onhand: 0, reserved: 0, lastRaw: null,
          };
        }
        prodMap[pid].onhand   += Number(row.on_hand)  || 0;
        prodMap[pid].reserved += Number(row.reserved) || 0;
        if (row.last_count_date && (!prodMap[pid].lastRaw || row.last_count_date > prodMap[pid].lastRaw)) {
          prodMap[pid].lastRaw = row.last_count_date;
        }
      }
      const products = Object.values(prodMap);

      // ── categories (dynamic, pastel palette by descending volume) ─────────
      const catAgg = {};
      products.forEach((p) => { catAgg[p.cat] = (catAgg[p.cat] || 0) + p.onhand; });
      const catList = Object.entries(catAgg)
        .map(([name, value]) => ({ name, value }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((c, i) => ({ ...c, color: CAT_PALETTE[i % CAT_PALETTE.length] }));
      const catColor = Object.fromEntries(catList.map((c) => [c.name, c.color]));

      // ── KPIs ──────────────────────────────────────────────────────────────
      const totalSku    = products.length;
      const totalValue  = products.reduce((a, p) => a + p.onhand * p.cost, 0);
      const totalOnHand = products.reduce((a, p) => a + p.onhand, 0);
      const lowProducts = products
        .filter((p) => p.onhand < THRESHOLD)
        .sort((a, b) => a.onhand - b.onhand)
        .map((p) => ({ ...p, catColor: catColor[p.cat] || "#9DB4D8" }));

      const KPIS = [
        { label: "Total SKU", icon: "package", value: nf(totalSku), unit: "produk", note: "Produk dengan stok tercatat" },
        { label: "Total Nilai Inventory", icon: "coins", value: "Rp " + (totalValue / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }), unit: "Juta", mono: true, note: "Berdasarkan harga jual" },
        { label: "Total On-Hand", icon: "boxes", value: nf(totalOnHand), unit: "unit", mono: true, note: "Kuantitas seluruh gudang" },
        { label: "Stok Menipis", icon: "triangle", value: nf(lowProducts.length), unit: "produk", warn: true, note: `Di bawah ${THRESHOLD} unit — restock` },
      ];

      // ── top 10 by value ─────────────────────────────────────────────────
      const topByValue = [...products]
        .map((p) => ({ sku: p.sku, name: p.name, value: p.onhand * p.cost }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      // ── warehouses (qty + share of total) ───────────────────────────────
      const whMap = {};
      for (const row of stock) {
        const wid = row.warehouse_id || "—";
        if (!whMap[wid]) {
          whMap[wid] = { code: row.warehouses?.code || String(wid).slice(0, 6), name: row.warehouses?.name || "Gudang", note: row.warehouses?.city || "", qty: 0 };
        }
        whMap[wid].qty += Number(row.on_hand) || 0;
      }
      const whTotal = Object.values(whMap).reduce((a, w) => a + w.qty, 0);
      const warehouses = Object.values(whMap)
        .map((w) => ({ ...w, share: whTotal > 0 ? Math.round((w.qty / whTotal) * 100) : 0 }))
        .sort((a, b) => b.qty - a.qty);

      // ── movement (weekly buckets from stock_ledger) ─────────────────────
      const now = Date.now();
      const weekMs = 7 * 24 * 3600 * 1000;
      const buckets = Array.from({ length: WEEKS_MAX }, () => ({ masuk: 0, keluar: 0 }));
      for (const row of ledger) {
        const t = new Date(row.created_at).getTime();
        if (isNaN(t)) continue;
        const wAgo = Math.floor((now - t) / weekMs);
        if (wAgo < 0 || wAgo >= WEEKS_MAX) continue;
        const idx = WEEKS_MAX - 1 - wAgo; // oldest → newest
        const mt = (row.movement_type || "").toLowerCase();
        const q = Number(row.qty) || 0;
        if (mt.startsWith("out")) buckets[idx].keluar += q;
        else buckets[idx].masuk += q; // inbound / default
      }
      const movementFull = buckets.map((b, i) => ({ week: "M" + (i + 1), masuk: b.masuk, keluar: b.keluar }));

      setData({ KPIS, catList, topByValue, warehouses, movementFull, lowProducts, totalSku });
    } catch (err) {
      console.error("[InventoryDashboardPage] fetch error:", err);
      setError(err.message || "Gagal memuat data inventory.");
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities]);

  useEffect(() => { fetchDash(); }, [fetchDash]);

  // Period control genuinely slices the trailing N weeks of aggregated ledger.
  const weeksN = WEEKS_BY_PERIOD[period] || 8;
  const movement = (data?.movementFull || []).slice(-weeksN).map((m, i) => ({ ...m, week: "M" + (i + 1) }));

  return (
    <div className="nx-page-pad" style={D.root}>
      <style>{".om-card{transition:box-shadow .18s ease, transform .18s ease;} .om-card:hover{box-shadow:0 2px 4px rgba(40,35,25,.06), 0 14px 32px rgba(40,35,25,.10);transform:translateY(-3px);} .recharts-surface{outline:none;}"}</style>
      <div style={D.wrap}>
        {/* header */}
        <div style={D.topRow}>
          <div>
            <nav style={D.crumbs}>
              <span>Inventory</span>
              <Icon name="chevright" size={13} />
              <span style={D.crumbCur}>Dashboard</span>
            </nav>
            <h1 style={D.title}>Dashboard Inventory</h1>
            <div style={D.sub}>Ringkasan stok &amp; pergerakan barang gudang{isAllEntities ? " · semua entitas" : ""}</div>
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

        {loading ? (
          <div style={{ ...D.card, ...D.empty, padding: "80px 0" }}>
            <Icon name="refresh" size={26} color="#A39B8C" style={{ margin: "0 auto 12px" }} />
            Memuat data inventory…
          </div>
        ) : error ? (
          <div style={{ ...D.card, padding: "60px 0", textAlign: "center" }}>
            <Icon name="triangle" size={26} color={AMBER} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: "#16243A", marginBottom: 4 }}>Gagal memuat data</div>
            <div style={{ fontSize: 12.5, color: "#A39B8C", marginBottom: 16 }}>{error}</div>
            <button onClick={fetchDash}
              style={{ border: 0, background: TEAL, color: "#fff", fontWeight: 700, fontSize: 13, padding: "9px 18px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>
              Coba lagi
            </button>
          </div>
        ) : data && data.totalSku === 0 ? (
          <div style={{ ...D.card, ...D.empty, padding: "80px 0" }}>
            <Icon name="package" size={28} color="#A39B8C" style={{ margin: "0 auto 12px" }} />
            Belum ada data stok untuk ditampilkan
          </div>
        ) : data ? (
          <>
            {/* row 1 — KPI */}
            <div className="nx-grid-kpi" style={D.kpiRow}>
              {data.KPIS.map((k) => <KpiCard key={k.label} data={k} />)}
            </div>

            {/* row 2 — movement + category */}
            <div className="nx-grid-2" style={D.chartsRow}>
              <MovementTrend data={movement} weeks={weeksN} />
              <CategoryDonut data={data.catList} />
            </div>

            {/* row 3 — top value + warehouse */}
            <div className="nx-grid-2" style={D.chartsRow2}>
              <TopByValue data={data.topByValue} />
              <StockPerWarehouse data={data.warehouses} />
            </div>

            {/* row 4 — low stock alert */}
            <LowStockTable rows={data.lowProducts} />
          </>
        ) : null}
      </div>

      {/* toast */}
      <div style={{ ...D.toast, opacity: toast.show ? 1 : 0, transform: toast.show ? "translateY(0)" : "translateY(8px)" }}>
        <Icon name={toast.icon} size={17} />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
