// src/modules/crm/CRMReportPage.jsx
// CRM Sales Report — visual ported verbatim from Claude Design (Lovable) handoff.
// Data layer rewritten from seeded dummy → live Supabase (activities / accounts /
// quotations + sales roster). Tokens, layout, recharts config, and CSS are kept
// EXACTLY as designed; only the data source changed.
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { pdf } from "@react-pdf/renderer";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/useAuth";
import ActivityReportPDF from "./ActivityReportPDF";

/* ---------------- tokens ---------------- */
const C = {
  navy: "#144682",
  orange: "#E85A1E",
  teal: "#0F766E",
  amber: "#D97706",
  red: "#DC2626",
  purple: "#7C3AED",
  blue: "#2563EB",
  page: "#ffffff",
  subtle: "#F8FAFC",
  ink: "#0F172A",
  gray500: "#64748B",
  gray400: "#94A3B8",
  line: "#E2E8F0",
  line100: "#F1F5F9",
};
const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
// amt > 0 lightens, amt < 0 darkens
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))))
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
};
const kpiGrad = (hex) => `linear-gradient(135deg, ${shade(hex, 0.16)} 0%, ${shade(hex, -0.18)} 100%)`;
const FONT_HEAD = "'Montserrat',system-ui,sans-serif";
const FONT_BODY = "'Inter',system-ui,sans-serif";
const CARD_SHADOW = "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)";
const CARD_SHADOW_HOVER = "0 2px 6px rgba(0,0,0,0.08), 0 12px 28px rgba(0,0,0,0.08)";

/* ---------------- entity + mapping (real data) ---------------- */
const ENTITY_BY_ID = {
  "0e1840d8-e6fb-4190-bd09-88338e68b492": "MSI",
  "42569e7c-531b-4d2b-832a-d5a7268c455b": "JCI",
  "d2e5e565-5f67-4954-b8d9-5979a2a0c697": "SOA",
};
const ENTITIES = ["MSI", "JCI", "SOA"];
const ENTITY_COLOR = { MSI: C.navy, JCI: C.orange, SOA: C.purple };

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// activities.type (lowercase) → report category (Call/Visit/Task/Email)
const TYPE_MAP = { call: "Call", whatsapp: "Call", visit: "Visit", meeting: "Visit", email: "Email", followup: "Task" };
// quotation "dikirim" statuses (real enum is uppercase; lowercase kept as fallback)
const QUOTE_SENT = ["SENT", "SUBMITTED", "sent", "quoted"];
const PROSPECT_STATUS = ["prospect", "lead", "lead_pool"];

/* ---------------- date-range helpers ---------------- */
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfWeekMon() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow); d.setHours(0, 0, 0, 0); return d;
}
function startOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Returns { start, end } Date for the given period (custom → today, per spec TODO).
function rangeFor(period) {
  const now = new Date();
  if (period === "week")  return { start: startOfWeekMon(), end: now };
  if (period === "month") return { start: startOfMonth(),  end: now };
  // today + custom
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start: startOfToday(), end };
}
// Immediately-preceding window of the same length (for the "vs periode lalu" chip).
function prevRangeFor(period) {
  const { start, end } = rangeFor(period);
  const dur = end.getTime() - start.getTime();
  const pEnd = new Date(start.getTime() - 1);
  const pStart = new Date(pEnd.getTime() - dur);
  return { start: pStart, end: pEnd };
}
const weekOfMonth = (d) => Math.min(4, Math.max(1, Math.ceil(d.getDate() / 7)));

/* ---------------- aggregation (from real activities) ---------------- */
const cnt = (arr, st) => arr.filter((a) => a.status === st).length;

function kpis(acts, prospects, quotations) {
  return {
    total: acts.length,
    done: cnt(acts, "Done"),
    pending: cnt(acts, "Pending"),
    overdue: cnt(acts, "Overdue"),
    prospect: prospects.length,
    quotation: quotations.length,
  };
}
// Trend: group by day (today/week/custom) or by week-of-month (month).
function buildTrend(acts, period) {
  if (period === "month") {
    return [1, 2, 3, 4].map((w) => {
      const inB = acts.filter((a) => a.scheduled_for && weekOfMonth(new Date(a.scheduled_for)) === w);
      return { label: "Minggu " + w, total: inB.length, done: cnt(inB, "Done"), pending: cnt(inB, "Pending") };
    });
  }
  return DAY_LABELS.map((label, d) => {
    const inB = acts.filter((a) => {
      if (!a.scheduled_for) return false;
      return ((new Date(a.scheduled_for).getDay() + 6) % 7) === d;
    });
    return { label, total: inB.length, done: cnt(inB, "Done"), pending: cnt(inB, "Pending") };
  });
}
function perSales(acts, prospects, quotations, salesList) {
  return salesList.map((s) => {
    const a = acts.filter((x) => x.salesId === s.id);
    const done = cnt(a, "Done");
    const total = a.length;
    return {
      id: s.id, name: s.name, entity: s.entity,
      call: a.filter((x) => x.type === "Call").length,
      visit: a.filter((x) => x.type === "Visit").length,
      task: a.filter((x) => x.type === "Task").length,
      total,
      done, pending: cnt(a, "Pending"), overdue: cnt(a, "Overdue"),
      prospect: prospects.filter((p) => p.assigned_to === s.id).length,
      quotation: quotations.filter((q) => q.created_by === s.id).length,
      winRate: total ? Math.round((done / total) * 100) : 0,
    };
  });
}

/* ---------------- sales roster (RBAC, mirrors fetchSalesProfiles) ---------------- */
// Sales/supervisor/manager users; entity from user_roles.company_id.
async function fetchReportSales({ companyId, isSuper }) {
  let rolesQ = supabase.from("roles").select("id, company_id, code").in("code", ["sales", "supervisor", "manager"]);
  if (!isSuper) rolesQ = rolesQ.eq("company_id", companyId);
  const { data: roleRows } = await rolesQ;
  const roleIds = (roleRows || []).map((r) => r.id);
  if (!roleIds.length) return [];

  let urQ = supabase.from("user_roles").select("user_id, company_id")
    .in("role_id", roleIds).eq("is_active", true).is("revoked_at", null);
  if (!isSuper) urQ = urQ.eq("company_id", companyId);
  const { data: urs } = await urQ;

  const compByUser = {};
  (urs || []).forEach((u) => { if (u.user_id && !(u.user_id in compByUser)) compByUser[u.user_id] = u.company_id; });
  const userIds = Object.keys(compByUser);
  if (!userIds.length) return [];

  const { data: profs } = await supabase.from("profiles")
    .select("id, full_name").in("id", userIds).eq("active", true).order("full_name").limit(1000);
  return (profs || []).map((p) => ({
    id: p.id,
    name: p.full_name || "—",
    entity: ENTITY_BY_ID[compByUser[p.id]] || "MSI",
  }));
}

// Fetch the three datasets for one date window (RLS scopes by company/role).
async function fetchWindow({ start, end }) {
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const [actRes, prospRes, quoRes] = await Promise.all([
    supabase.from("activities")
      .select("id, type, status, scheduled_for, activity_time, assigned_to, created_by, contact_name, prospect_name, notes, outcome, account:accounts!activities_account_id_fkey(name)")
      .is("deleted_at", null)
      .gte("scheduled_for", ymd(start)).lte("scheduled_for", ymd(end))
      .limit(1000),
    supabase.from("accounts")
      .select("id, assigned_to, account_status, created_at")
      .is("deleted_at", null)
      .in("account_status", PROSPECT_STATUS)
      .gte("created_at", startISO).lte("created_at", endISO)
      .limit(1000),
    supabase.from("quotations")
      .select("id, created_by, status, created_at")
      .is("deleted_at", null)
      .in("status", QUOTE_SENT)
      .gte("created_at", startISO).lte("created_at", endISO)
      .limit(1000),
  ]);
  if (actRes.error) throw actRes.error;
  return {
    activities: actRes.data || [],
    prospects: prospRes.data || [],
    quotations: quoRes.data || [],
  };
}

/* ---------------- icons (inline, no lib) ---------------- */
const Ic = {
  Activity: (p) => (<svg viewBox="0 0 24 24" {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>),
  CheckCircle: (p) => (<svg viewBox="0 0 24 24" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>),
  Clock: (p) => (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>),
  AlertCircle: (p) => (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><line x1="12" y1="16" x2="12" y2="16" /></svg>),
  UserPlus: (p) => (<svg viewBox="0 0 24 24" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>),
  FileText: (p) => (<svg viewBox="0 0 24 24" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>),
  Chevron: (p) => (<svg viewBox="0 0 24 24" {...p}><polyline points="6 9 12 15 18 9" /></svg>),
  Search: (p) => (<svg viewBox="0 0 24 24" {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>),
  Sort: (p) => (<svg viewBox="0 0 24 24" {...p}><polyline points="8 9 12 5 16 9" /><polyline points="8 15 12 19 16 15" /></svg>),
  XCircle: (p) => (<svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>),
  Download: (p) => (<svg viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>),
};
const iconBase = { width: 32, height: 32, fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

/* ---------------- status / type styling ---------------- */
const STATUS_STYLE = {
  Done: { color: C.teal, bg: tint(C.teal, 0.12), label: "Selesai" },
  Pending: { color: C.amber, bg: tint(C.amber, 0.12), label: "Pending" },
  Overdue: { color: C.red, bg: tint(C.red, 0.12), label: "Overdue" },
  Cancelled: { color: C.gray500, bg: tint(C.gray500, 0.14), label: "Dibatalkan" },
};
const TYPE_COLOR = { Call: C.blue, Visit: C.purple, Task: C.amber, Email: C.teal };

/* ===========================================================================
   COMPONENT
   =========================================================================== */
export default function CRMReportPage() {
  const { profile, erpRole } = useAuth();
  const isSuper = erpRole === "super_admin";

  const [period, setPeriod] = useState("week");
  const [selectedSales, setSelectedSales] = useState(new Set());
  const [selectedEntities, setSelectedEntities] = useState(new Set(ENTITIES));
  const [salesOpen, setSalesOpen] = useState(false);
  const [salesQuery, setSalesQuery] = useState("");
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const [detailOpen, setDetailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [animate, setAnimate] = useState(false);
  const dropRef = useRef(null);

  // ── live data ──
  const [salesList, setSalesList] = useState([]);
  const [rawCur, setRawCur] = useState({ activities: [], prospects: [], quotations: [] });
  const [rawPrev, setRawPrev] = useState({ activities: [], prospects: [], quotations: [] });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const selInit = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 120);
    return () => clearTimeout(t);
  }, []);

  // close sales dropdown on outside click
  useEffect(() => {
    function onDoc(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setSalesOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Sales roster — fetch once when profile is ready; default-select all on first load.
  useEffect(() => {
    if (!profile?.id) return;
    if (!isSuper && !profile?.company_id) return;
    let cancelled = false;
    fetchReportSales({ companyId: profile.company_id, isSuper })
      .then((list) => {
        if (cancelled) return;
        setSalesList(list);
        if (!selInit.current && list.length) {
          selInit.current = true;
          setSelectedSales(new Set(list.map((s) => s.id)));
        }
      })
      .catch((e) => console.debug("[CRMReport] sales fetch failed:", e?.message || e));
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isSuper]);

  // Main data — refetch when period changes (current + previous window).
  useEffect(() => {
    if (!profile?.id) return;
    if (!isSuper && !profile?.company_id) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    Promise.all([fetchWindow(rangeFor(period)), fetchWindow(prevRangeFor(period))])
      .then(([curData, prevData]) => {
        if (cancelled) return;
        setRawCur(curData);
        setRawPrev(prevData);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.debug("[CRMReport] data fetch failed:", e?.message || e);
        setErrorMsg(e?.message || "Gagal memuat data report.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period, profile?.id, profile?.company_id, isSuper]);

  const nameById = useMemo(() => Object.fromEntries(salesList.map((s) => [s.id, s.name])), [salesList]);

  // map raw activities → report shape (status: Done/Pending/Overdue; cancelled dropped)
  const mapActs = useMemo(() => {
    const nowMs = Date.now();
    const map = (rows) => (rows || []).map((a) => {
      let status;
      if (a.status === "cancelled") status = "Cancelled";
      else if (a.status === "done") status = "Done";
      else {
        const sd = a.scheduled_for ? new Date(a.scheduled_for + "T23:59:59").getTime() : null;
        status = sd !== null && sd < nowMs ? "Overdue" : "Pending";
      }
      return {
        id: a.id,
        salesId: a.assigned_to,
        type: TYPE_MAP[a.type] || "Task",
        status,
        customer: a.account?.name || a.contact_name || a.prospect_name || "—",
        note: a.notes || a.outcome || "—",
        scheduled_for: a.scheduled_for,
        activity_time: a.activity_time,
        salesName: nameById[a.assigned_to] || "—",
      };
    }).filter(Boolean);
    return { cur: map(rawCur.activities), prev: map(rawPrev.activities) };
  }, [rawCur.activities, rawPrev.activities, nameById]);

  // effective sales = checked AND entity active
  const effSalesIds = useMemo(() => {
    const set = new Set();
    salesList.forEach((s) => {
      if (selectedSales.has(s.id) && selectedEntities.has(s.entity)) set.add(s.id);
    });
    return set;
  }, [selectedSales, selectedEntities, salesList]);

  // actsAll includes cancelled (detail table + export + cancelled counter);
  // acts = active-only (Done/Pending/Overdue) so existing KPI/trend/per-sales/winRate stay unchanged.
  const actsAll     = useMemo(() => mapActs.cur.filter((a) => effSalesIds.has(a.salesId)), [mapActs, effSalesIds]);
  const prevAll     = useMemo(() => mapActs.prev.filter((a) => effSalesIds.has(a.salesId)), [mapActs, effSalesIds]);
  const acts        = useMemo(() => actsAll.filter((a) => a.status !== "Cancelled"), [actsAll]);
  const prevActs    = useMemo(() => prevAll.filter((a) => a.status !== "Cancelled"), [prevAll]);
  const cancelledCount     = useMemo(() => actsAll.length - acts.length, [actsAll, acts]);
  const prevCancelledCount = useMemo(() => prevAll.length - prevActs.length, [prevAll, prevActs]);
  const curProspects  = useMemo(() => rawCur.prospects.filter((p) => effSalesIds.has(p.assigned_to)), [rawCur.prospects, effSalesIds]);
  const prevProspects = useMemo(() => rawPrev.prospects.filter((p) => effSalesIds.has(p.assigned_to)), [rawPrev.prospects, effSalesIds]);
  const curQuotations  = useMemo(() => rawCur.quotations.filter((q) => effSalesIds.has(q.created_by)), [rawCur.quotations, effSalesIds]);
  const prevQuotations = useMemo(() => rawPrev.quotations.filter((q) => effSalesIds.has(q.created_by)), [rawPrev.quotations, effSalesIds]);

  const k = useMemo(() => kpis(acts, curProspects, curQuotations), [acts, curProspects, curQuotations]);
  const kPrev = useMemo(() => kpis(prevActs, prevProspects, prevQuotations), [prevActs, prevProspects, prevQuotations]);
  const trend = useMemo(() => buildTrend(acts, period), [acts, period]);
  const rows = useMemo(() => perSales(acts, curProspects, curQuotations, salesList).filter((r) => effSalesIds.has(r.id)), [acts, curProspects, curQuotations, salesList, effSalesIds]);

  const barData = useMemo(
    () => rows.map((r) => ({ name: shortName(r.name), done: r.done, pending: r.pending, overdue: r.overdue })),
    [rows]
  );

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      if (key === "name") return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      return dir === "asc" ? a[key] - b[key] : b[key] - a[key];
    });
    return arr;
  }, [rows, sort]);

  // Full filtered set (active + cancelled), newest first — used by export.
  const exportRows = useMemo(
    () => [...actsAll].sort((a, b) => new Date(b.scheduled_for || 0) - new Date(a.scheduled_for || 0)),
    [actsAll]
  );
  const detailActs = useMemo(() => exportRows.slice(0, 40), [exportRows]);

  const pct = (cur, prev) => {
    if (!prev) return cur ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const KPI_DEFS = [
    { key: "total", name: "Total Aktivitas", color: C.navy, Icon: Ic.Activity, val: k.total, prev: kPrev.total },
    { key: "done", name: "Selesai", color: C.teal, Icon: Ic.CheckCircle, val: k.done, prev: kPrev.done },
    { key: "pending", name: "Pending", color: C.amber, Icon: Ic.Clock, val: k.pending, prev: kPrev.pending, goodWhenDown: true },
    { key: "overdue", name: "Overdue", color: C.red, Icon: Ic.AlertCircle, val: k.overdue, prev: kPrev.overdue, goodWhenDown: true },
    { key: "cancelled", name: "Dibatalkan", color: C.gray500, Icon: Ic.XCircle, val: cancelledCount, prev: prevCancelledCount, goodWhenDown: true },
    { key: "prospect", name: "Prospect Baru", color: C.purple, Icon: Ic.UserPlus, val: k.prospect, prev: kPrev.prospect },
    { key: "quotation", name: "Quotation Dikirim", color: C.orange, Icon: Ic.FileText, val: k.quotation, prev: kPrev.quotation },
  ];

  const salesLabel = (() => {
    const ids = [...effSalesIds];
    if (salesList.length && ids.length === salesList.length) return "Semua Sales";
    if (ids.length === 0) return "Tidak ada Sales";
    if (ids.length === 1) return (salesList.find((s) => s.id === ids[0]) || {}).name || "1 Sales";
    return ids.length + " Sales";
  })();

  const toggleSet = (set, val) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  };
  const clickSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const periodPresets = [
    { id: "today", label: "Hari Ini" },
    { id: "week", label: "Minggu Ini" },
    { id: "month", label: "Bulan Ini" },
    { id: "custom", label: "Custom" },
  ];
  const periodLabel = (periodPresets.find((p) => p.id === period) || {}).label || period;

  // ── Export PDF (download langsung; tanpa preview) ──────────────────────────
  const canExport = !loading && !errorMsg && exportRows.length > 0;
  const handleExportPDF = async () => {
    if (exporting || !canExport) return;
    setExporting(true);
    try {
      const now = new Date();
      const generatedAt =
        `${String(now.getDate()).padStart(2, "0")} ${MONTHS_ID[now.getMonth()]} ${now.getFullYear()} ` +
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const meta = { periodLabel, salesLabel, generatedAt };
      const summary = { total: k.total, done: k.done, pending: k.pending, overdue: k.overdue, cancelled: cancelledCount };
      const blob = await pdf(<ActivityReportPDF meta={meta} summary={summary} rows={exportRows} />).toBlob();
      const url = URL.createObjectURL(blob);
      const slug = (s) => String(s).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `Laporan-Aktivitas-${slug(salesLabel)}-${slug(periodLabel)}-${ymd(now)}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      window.alert("Gagal generate PDF: " + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ fontFamily: FONT_BODY, background: C.page, backgroundImage: "radial-gradient(rgba(20,70,130,0.04) 1px, transparent 1px)", backgroundSize: "22px 22px", color: C.ink }}>
      <style>{CSS}</style>

      {/* ============ FILTER BAR ============ */}
      <div style={st.filterBar}>
        <div style={st.filterInner}>
          {/* period presets */}
          <div style={st.pillGroup}>
            {periodPresets.map((p) => {
              const on = period === p.id;
              return (
                <button
                  key={p.id}
                  className="crm-pill"
                  onClick={() => setPeriod(p.id === "custom" ? "custom" : p.id)}
                  style={{
                    ...st.pill,
                    background: on ? C.navy : "transparent",
                    color: on ? "#fff" : C.gray500,
                    boxShadow: on ? "0 0 0 1px rgba(20,70,130,.25), 0 4px 14px rgba(20,70,130,.5)" : "none",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {period === "custom" && (
            <div style={st.dateRange}>
              <span style={{ color: C.gray400, fontSize: 12 }}>Rentang</span>
              <strong style={{ fontSize: 13, color: C.navy }}>Hari ini</strong>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* salesperson multi-select */}
          <div ref={dropRef} style={{ position: "relative" }}>
            <button className="crm-select" style={st.selectBtn} onClick={() => setSalesOpen((o) => !o)}>
              <span style={{ fontWeight: 600 }}>{salesLabel}</span>
              <Ic.Chevron style={{ width: 15, height: 15, fill: "none", stroke: C.gray500, strokeWidth: 2.4, transform: salesOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {salesOpen && (
              <div style={st.dropdown}>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <Ic.Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, fill: "none", stroke: C.gray400, strokeWidth: 2.2 }} />
                  <input
                    className="crm-input"
                    placeholder="Cari sales…"
                    value={salesQuery}
                    onChange={(e) => setSalesQuery(e.target.value)}
                    style={st.dropInput}
                  />
                </div>
                <label style={{ ...st.checkRow, fontWeight: 600, color: C.navy }}>
                  <input
                    type="checkbox"
                    checked={salesList.length > 0 && selectedSales.size === salesList.length}
                    onChange={() => setSelectedSales(selectedSales.size === salesList.length ? new Set() : new Set(salesList.map((s) => s.id)))}
                    style={st.cb}
                  />
                  Pilih semua
                </label>
                <div style={{ height: 1, background: C.line100, margin: "4px 0" }} />
                {salesList.filter((s) => s.name.toLowerCase().includes(salesQuery.toLowerCase())).map((s) => (
                  <label key={s.id} className="crm-checkrow" style={st.checkRow}>
                    <input
                      type="checkbox"
                      checked={selectedSales.has(s.id)}
                      onChange={() => setSelectedSales((p) => toggleSet(p, s.id))}
                      style={st.cb}
                    />
                    <span style={{ ...st.entityDot, background: ENTITY_COLOR[s.entity] }} />
                    {s.name}
                  </label>
                ))}
                {salesList.length === 0 && (
                  <div style={{ padding: "8px", fontSize: 12.5, color: C.gray400 }}>Tidak ada sales</div>
                )}
              </div>
            )}
          </div>

          {/* entity pills */}
          <div style={st.pillGroup}>
            {ENTITIES.map((e) => {
              const on = selectedEntities.has(e);
              return (
                <button
                  key={e}
                  className="crm-pill"
                  onClick={() => setSelectedEntities((p) => {
                    const n = toggleSet(p, e);
                    return n.size === 0 ? p : n; // never allow zero
                  })}
                  style={{
                    ...st.entityPill,
                    background: on ? ENTITY_COLOR[e] : "transparent",
                    color: on ? "#fff" : C.gray400,
                    borderColor: on ? ENTITY_COLOR[e] : C.line,
                    boxShadow: on ? `0 2px 8px ${tint(ENTITY_COLOR[e], 0.4)}` : "none",
                  }}
                >
                  {e}
                </button>
              );
            })}
          </div>

          {/* export PDF — pojok kanan bar */}
          <button
            className="crm-pill"
            onClick={handleExportPDF}
            disabled={!canExport || exporting}
            title={canExport ? "Export laporan ke PDF" : "Tidak ada aktivitas untuk diekspor"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px",
              borderRadius: 11, border: "none", background: C.orange, color: "#fff",
              fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              boxShadow: "0 4px 14px rgba(232,90,30,.3)",
              opacity: (!canExport || exporting) ? 0.5 : 1,
              cursor: (!canExport || exporting) ? "not-allowed" : "pointer",
            }}
          >
            <Ic.Download style={{ width: 15, height: 15, fill: "none", stroke: "#fff", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" }} />
            {exporting ? "Membuat…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* ============ BODY ============ */}
      {loading ? (
        <div style={{ ...st.body, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 14 }}>
          <div className="crm-spinner" />
          <div style={{ color: C.gray500, fontSize: 13.5 }}>Memuat data report…</div>
        </div>
      ) : errorMsg ? (
        <div style={{ ...st.body, textAlign: "center", color: C.red, padding: "60px 24px" }}>
          Gagal memuat report: {errorMsg}
        </div>
      ) : (
      <div style={st.body}>
        {/* KPI ROW */}
        <div style={st.kpiGrid}>
          {KPI_DEFS.map((d) => {
            const change = pct(d.val, d.prev);
            const up = change >= 0;
            const good = d.goodWhenDown ? !up : up;
            return (
              <div key={d.key} className="crm-card" style={{ ...st.kpiCard, background: kpiGrad(d.color), boxShadow: `0 8px 22px ${tint(d.color, 0.34)}` }}>
                <div style={st.kpiTop}>
                  <span style={st.kpiLabel}>{d.name}</span>
                  <span style={{ ...st.kpiIconWrap, color: d.color, boxShadow: `0 4px 12px ${tint(d.color, 0.45)}` }}>
                    <d.Icon style={{ ...iconBase, width: 20, height: 20, stroke: d.color }} />
                  </span>
                </div>
                <div style={st.kpiNum}>{d.val.toLocaleString("id-ID")}</div>
                <div style={st.kpiTrendRow}>
                  <span style={st.trendChip}>
                    {up ? "▲" : "▼"} {Math.abs(change)}%
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>vs periode lalu</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* CHART ROW */}
        <div style={st.chartRow}>
          {/* Area trend */}
          <div className="crm-card" style={{ ...st.panel, gridColumn: "span 3" }}>
            <div style={st.panelHead}>
              <div>
                <div style={st.sectionLabel}>Tren Aktivitas</div>
                <div style={st.panelSub}>Total · Selesai · Pending</div>
              </div>
              <LegendDots items={[["Total", C.navy], ["Selesai", C.teal], ["Pending", C.amber]]} />
            </div>
            <div style={st.chartWrap}>
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                  <defs>
                    {[["gTotal", C.navy], ["gDone", C.teal], ["gPending", C.amber]].map(([id, col]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={col} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={col} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line100} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.gray500, fontFamily: FONT_BODY }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: C.gray400, fontFamily: FONT_BODY }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 700, color: C.ink, fontFamily: FONT_HEAD }} />
                  <Area type="monotone" dataKey="total" name="Total" stroke={C.navy} strokeWidth={2.5} fill="url(#gTotal)" dot={{ r: 4, fill: "#fff", stroke: C.navy, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Area type="monotone" dataKey="done" name="Selesai" stroke={C.teal} strokeWidth={2.5} fill="url(#gDone)" dot={{ r: 4, fill: "#fff", stroke: C.teal, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Area type="monotone" dataKey="pending" name="Pending" stroke={C.amber} strokeWidth={2.5} fill="url(#gPending)" dot={{ r: 4, fill: "#fff", stroke: C.amber, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-sales bar */}
          <div className="crm-card" style={{ ...st.panel, gridColumn: "span 2" }}>
            <div style={st.panelHead}>
              <div>
                <div style={st.sectionLabel}>Aktivitas per Sales</div>
                <div style={st.panelSub}>Status terdistribusi</div>
              </div>
              <LegendDots items={[["Selesai", C.teal], ["Pending", C.amber], ["Overdue", C.red]]} />
            </div>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart layout="vertical" data={barData} margin={{ top: 6, right: 16, left: 6, bottom: 0 }} barCategoryGap={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line100} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: C.gray400, fontFamily: FONT_BODY }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12, fill: C.gray500, fontFamily: FONT_BODY }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: tint(C.navy, 0.04) }} />
                  <Bar dataKey="done" name="Selesai" stackId="a" fill={C.teal} radius={[4, 0, 0, 4]} barSize={16} />
                  <Bar dataKey="pending" name="Pending" stackId="a" fill={C.amber} barSize={16} />
                  <Bar dataKey="overdue" name="Overdue" stackId="a" fill={C.red} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* PER SALES TABLE */}
        <div className="crm-card" style={{ ...st.panel, padding: 0, overflow: "hidden" }}>
          <div style={{ ...st.panelHead, padding: "18px 22px" }}>
            <div style={st.sectionLabel}>Performa Sales</div>
            <span style={st.countBadge}>{rows.length} Sales</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={st.table}>
              <thead>
                <tr>
                  <Th label="#" />
                  <Th label="Nama Sales" col="name" sort={sort} onClick={clickSort} align="left" />
                  <Th label="Call" col="call" sort={sort} onClick={clickSort} />
                  <Th label="Visit" col="visit" sort={sort} onClick={clickSort} />
                  <Th label="Task" col="task" sort={sort} onClick={clickSort} />
                  <Th label="Total" col="total" sort={sort} onClick={clickSort} />
                  <Th label="Selesai" col="done" sort={sort} onClick={clickSort} />
                  <Th label="Pending" col="pending" sort={sort} onClick={clickSort} />
                  <Th label="Overdue" col="overdue" sort={sort} onClick={clickSort} />
                  <Th label="Prospect" col="prospect" sort={sort} onClick={clickSort} />
                  <Th label="Quotation" col="quotation" sort={sort} onClick={clickSort} />
                  <Th label="Win Rate" col="winRate" sort={sort} onClick={clickSort} align="left" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.id} className="crm-row" style={{ background: i % 2 ? C.subtle : "#fff" }}>
                    <td style={st.td}><RankBadge rank={i + 1} /></td>
                    <td style={{ ...st.td, textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...st.entityDot, background: ENTITY_COLOR[r.entity] }} />
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={st.td}>{r.call}</td>
                    <td style={st.td}>{r.visit}</td>
                    <td style={st.td}>{r.task}</td>
                    <td style={{ ...st.td, fontWeight: 700, fontFamily: FONT_HEAD }}>{r.total}</td>
                    <td style={st.td}><Pill text={r.done} c={C.teal} /></td>
                    <td style={st.td}><Pill text={r.pending} c={C.amber} /></td>
                    <td style={st.td}><Pill text={r.overdue} c={C.red} /></td>
                    <td style={st.td}>{r.prospect}</td>
                    <td style={st.td}>{r.quotation}</td>
                    <td style={{ ...st.td, textAlign: "left", minWidth: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={st.barTrack}>
                          <div style={{ ...st.barFill, width: animate ? r.winRate + "%" : "0%" }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.teal, minWidth: 32 }}>{r.winRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr><td colSpan={12} style={{ ...st.td, padding: 40, color: C.gray400 }}>Tidak ada data untuk filter ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ACTIVITY DETAIL */}
        <div className="crm-card" style={{ ...st.panel, padding: 0, overflow: "hidden" }}>
          <button className="crm-detailToggle" onClick={() => setDetailOpen((o) => !o)} style={st.detailToggle}>
            <span style={st.sectionLabel}>Lihat Detail Aktivitas</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: C.gray500, fontSize: 13 }}>
              {detailActs.length} aktivitas
              <Ic.Chevron style={{ width: 18, height: 18, fill: "none", stroke: C.navy, strokeWidth: 2.4, transform: detailOpen ? "rotate(180deg)" : "none", transition: "transform .25s" }} />
            </span>
          </button>
          <div style={{ maxHeight: detailOpen ? 1600 : 0, overflow: "hidden", transition: "max-height .35s ease" }}>
            <div style={{ overflowX: "auto", borderTop: `1px solid ${C.line100}` }}>
              <table style={st.table}>
                <thead>
                  <tr>
                    <th style={{ ...st.th, textAlign: "left" }}>Tanggal</th>
                    <th style={{ ...st.th, textAlign: "left" }}>Tipe</th>
                    <th style={{ ...st.th, textAlign: "left" }}>Status</th>
                    <th style={{ ...st.th, textAlign: "left" }}>Customer</th>
                    <th style={{ ...st.th, textAlign: "left" }}>Sales</th>
                    <th style={{ ...st.th, textAlign: "left" }}>Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {detailActs.map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 ? C.subtle : "#fff" }}>
                      <td style={{ ...st.td, textAlign: "left", whiteSpace: "nowrap", color: C.gray500 }}>{dateLabel(a)}</td>
                      <td style={{ ...st.td, textAlign: "left" }}>
                        <span style={{ ...st.typePill, color: TYPE_COLOR[a.type], background: tint(TYPE_COLOR[a.type], 0.1) }}>
                          <span style={{ width: 6, height: 6, borderRadius: 9, background: TYPE_COLOR[a.type] }} />
                          {a.type}
                        </span>
                      </td>
                      <td style={{ ...st.td, textAlign: "left" }}>
                        <span style={{ ...st.statusPill, color: STATUS_STYLE[a.status].color, background: STATUS_STYLE[a.status].bg }}>
                          {STATUS_STYLE[a.status].label}
                        </span>
                      </td>
                      <td style={{ ...st.td, textAlign: "left", fontWeight: 600 }}>{a.customer}</td>
                      <td style={{ ...st.td, textAlign: "left", color: C.gray500 }}>{a.salesName}</td>
                      <td style={{ ...st.td, textAlign: "left", color: C.gray500, maxWidth: 280 }}>{a.note}</td>
                    </tr>
                  ))}
                  {detailActs.length === 0 && (
                    <tr><td colSpan={6} style={{ ...st.td, padding: 32, textAlign: "center", color: C.gray400 }}>Tidak ada aktivitas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ height: 28 }} />
      </div>
      )}
    </div>
  );
}

/* ---------------- small presentational helpers ---------------- */
function LegendDots({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {items.map(([label, c]) => (
        <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.gray500, fontWeight: 500 }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: c }} />
          {label}
        </span>
      ))}
    </div>
  );
}
function Th({ label, col, sort, onClick, align = "center" }) {
  const active = sort && sort.key === col;
  return (
    <th
      className={col ? "crm-th-sort" : ""}
      onClick={col ? () => onClick(col) : undefined}
      style={{ ...stTh(align), cursor: col ? "pointer" : "default", color: active ? C.navy : "rgba(20,70,130,.6)" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: align === "left" ? "flex-start" : "center" }}>
        {label}
        {col && (
          <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: "none", stroke: active ? C.navy : C.gray400, strokeWidth: 2.4, opacity: active ? 1 : 0.5 }}>
            {active ? (sort.dir === "asc" ? <polyline points="8 14 12 10 16 14" /> : <polyline points="8 10 12 14 16 10" />) : <><polyline points="8 11 12 7 16 11" /><polyline points="8 13 12 17 16 13" /></>}
          </svg>
        )}
      </span>
    </th>
  );
}
function RankBadge({ rank }) {
  const medal = {
    1: { bg: "linear-gradient(135deg, #F59E0B, #D97706)", glow: "rgba(217,119,6,0.45)" },
    2: { bg: "#94A3B8", glow: "rgba(148,163,184,0.45)" },
    3: { bg: "#CD7C54", glow: "rgba(205,124,84,0.45)" },
  }[rank];
  if (medal) {
    return <span style={{ display: "inline-flex", width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, fontFamily: FONT_HEAD, color: "#fff", background: medal.bg, boxShadow: `0 2px 7px ${medal.glow}` }}>{rank}</span>;
  }
  return <span style={{ fontSize: 12, color: C.gray400, fontWeight: 600 }}>{rank}</span>;
}
function Pill({ text, c }) {
  return <span style={{ display: "inline-block", minWidth: 26, padding: "3px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: c, background: tint(c, 0.12) }}>{text}</span>;
}
const shortName = (n) => { const p = n.split(" "); return p.length > 1 ? p[0] + " " + p[p.length - 1][0] + "." : n; };
function dateLabel(a) {
  if (!a.scheduled_for) return "—";
  const d = new Date(a.scheduled_for);
  if (isNaN(d.getTime())) return String(a.scheduled_for);
  const t = a.activity_time ? " · " + String(a.activity_time).slice(0, 5) : "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_ID[d.getMonth()]}${t}`;
}

/* ---------------- styles ---------------- */
const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${C.line}`,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  fontFamily: FONT_BODY,
  fontSize: 12,
  padding: "8px 12px",
};
const stTh = (align) => ({
  fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
  padding: "12px 12px", textAlign: align, whiteSpace: "nowrap", borderBottom: `1px solid ${C.line}`, userSelect: "none",
});
const st = {
  filterBar: { background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}`, boxShadow: "0 6px 20px rgba(20,70,130,0.08)" },
  filterInner: { display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", maxWidth: "100%", margin: "0 auto", flexWrap: "wrap" },
  pillGroup: { display: "flex", alignItems: "center", gap: 4, padding: 4, background: C.subtle, borderRadius: 12, border: `1px solid ${C.line}` },
  pill: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap" },
  entityPill: { fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", padding: "6px 12px", borderRadius: 9, border: "1px solid", cursor: "pointer", transition: "all .15s" },
  dateRange: { display: "flex", flexDirection: "column", lineHeight: 1.3, padding: "4px 12px", borderLeft: `2px solid ${C.line}` },
  selectBtn: { display: "flex", alignItems: "center", gap: 10, fontFamily: FONT_BODY, fontSize: 13, padding: "9px 14px", borderRadius: 11, border: `1px solid ${C.line}`, background: "#fff", cursor: "pointer", color: C.ink, minWidth: 150, justifyContent: "space-between" },
  dropdown: { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 260, background: "#fff", borderRadius: 14, border: `1px solid ${C.line}`, boxShadow: "0 12px 32px rgba(0,0,0,0.12)", padding: 10, zIndex: 40 },
  dropInput: { width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 13, fontFamily: FONT_BODY, outline: "none", background: C.subtle },
  checkRow: { display: "flex", alignItems: "center", gap: 9, padding: "8px 8px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  cb: { width: 16, height: 16, accentColor: C.navy, cursor: "pointer" },
  entityDot: { width: 9, height: 9, borderRadius: 9, flex: "0 0 auto" },

  body: { maxWidth: "100%", margin: "0 auto", padding: "22px 24px 0" },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 16, marginBottom: 18 },
  kpiCard: { position: "relative", borderRadius: 16, padding: "17px 17px 18px", boxShadow: CARD_SHADOW, overflow: "hidden", color: "#fff", transition: "transform .18s ease, box-shadow .18s ease" },
  kpiTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  kpiLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.88)", maxWidth: 100, lineHeight: 1.3 },
  kpiIconWrap: { width: 40, height: 40, borderRadius: 999, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  kpiNum: { fontFamily: FONT_HEAD, fontSize: 44, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, color: "#fff" },
  kpiTrendRow: { display: "flex", alignItems: "center", gap: 7, marginTop: 11 },
  trendChip: { fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: "#fff", background: "rgba(255,255,255,0.22)" },
  kpiAccent: { position: "absolute", left: 0, bottom: 0, height: 3, width: "100%" },

  chartRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 18 },
  panel: { background: "#fff", borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: CARD_SHADOW, padding: 20, transition: "transform .18s ease, box-shadow .18s ease" },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12, rowGap: 8, flexWrap: "wrap" },
  panelSub: { fontSize: 12, color: C.gray400, marginTop: 3 },
  sectionLabel: { display: "inline-block", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(20,70,130,.85)", fontFamily: FONT_BODY, paddingLeft: 11, borderLeft: `3px solid ${C.navy}`, lineHeight: 1.1 },
  chartWrap: { width: "100%", height: 280, borderRadius: 12, boxShadow: "inset 0 10px 18px -14px rgba(15,23,42,0.25)" },
  countBadge: { fontSize: 12, fontWeight: 700, color: C.navy, background: tint(C.navy, 0.08), padding: "4px 12px", borderRadius: 999 },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: stTh("center"),
  td: { padding: "11px 12px", textAlign: "center", borderBottom: `1px solid ${C.line100}`, whiteSpace: "nowrap" },
  barTrack: { flex: 1, height: 8, borderRadius: 99, background: tint(C.teal, 0.14), overflow: "hidden", minWidth: 60 },
  barFill: { height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${C.teal}, #14b8a6)`, transition: "width 1s cubic-bezier(.2,.8,.2,1)" },

  detailToggle: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", background: "#fff", border: "none", cursor: "pointer", textAlign: "left" },
  typePill: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 },
  statusPill: { display: "inline-block", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999 },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800;900&display=swap');
.crm-card:hover{transform:translateY(-1px);box-shadow:${CARD_SHADOW_HOVER};}
.crm-pill:hover{filter:brightness(.97);}
.crm-row{transition:background .12s ease, box-shadow .12s ease;}
.crm-row:hover{background:${tint(C.navy, 0.05)} !important;box-shadow:inset 3px 0 0 ${C.navy};}
.crm-checkrow:hover{background:${C.subtle};}
.crm-th-sort:hover{color:${C.navy} !important;background:${tint(C.navy, 0.04)};}
.crm-detailToggle:hover{background:${C.subtle};}
.crm-input:focus,.crm-select:focus{outline:none;border-color:${C.navy};}
.crm-spinner{width:34px;height:34px;border-radius:50%;border:3px solid ${C.line};border-top-color:${C.navy};animation:crmspin .7s linear infinite;}
@keyframes crmspin{to{transform:rotate(360deg);}}
*::-webkit-scrollbar{height:9px;width:9px;}
*::-webkit-scrollbar-thumb{background:${C.line};border-radius:9px;}
@media (max-width:1100px){
  .crm-card{}
}
`;
