// src/modules/crm/IndomarcoDashboardPage.jsx
// Dashboard Customer (default Indomarco) — INTERNAL (dipakai tim MSI untuk presentasi,
// bukan diakses customer). Lintas-modul: CRM + data SP (tabel sp_items).
// Sumber data: sp_items (flat, 1 baris = 1 line item) difilter customer_id yang dipilih
// via dropdown (default Indomarco). SEMUA KPI/chart ikut customer terpilih.
// Layout mengacu prototipe visual IndomarcoDashboard.jsx; WARNA/FONT diambil dari
// token brand repo (navy/orange, Montserrat/Inter/IBM Plex Mono) — bukan dari mockup.
// TIDAK menampilkan: harga, margin, cost, on-time rate, atau rasio % fulfillment.
// shipped_qty ditampilkan sebagai "Volume Terealisasi" (angka absolut), bukan status kirim.
import { useState, useEffect } from "react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Package, Boxes, Truck, MapPin, TrendingUp, ShieldCheck, Globe2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Indomarco customer_id (dari PLANNING_Indomarco / audit 3 Jul 2026)
const INDOMARCO_ID = "a18fad3c-75ee-4fc6-b3d2-5c5dfa810661";

/* ---------------- tokens (brand repo — pola sama CRMReportPage) ---------------- */
const C = {
  navy: "#1B4D8A",
  orange: "#E85A1E",
  ink: "#0F172A",
  slate: "#64748B",
  line: "#E2E8F0",
  card: "#FFFFFF",
  subtle: "#F8FAFC",
  red: "#DC2626",
};
const FONT_HEAD = "'Montserrat',system-ui,sans-serif";
const FONT_BODY = "'Inter',system-ui,sans-serif";
const FONT_MONO = "'IBM Plex Mono',monospace";
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
// Palet wilayah donut — diturunkan dari token brand (navy/orange + tint + slate)
const REGION_COLORS = [C.navy, C.orange, shade(C.navy, 0.35), shade(C.orange, 0.4), C.slate];

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmt = (n) => new Intl.NumberFormat("id-ID").format(n || 0);
const fmtLongDate = (s) => {
  if (!s) return "—";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  if (!y || !m || !d) return String(s);
  return `${Number(d)} ${MONTHS_ID[Number(m) - 1] || m} ${y}`;
};

// DUMMY - ganti setelah mapping wilayah final (dc → wilayah dari SELECT DISTINCT dc).
// Center donut ("DC aktif") memakai angka LIVE dari data; hanya pembagian wilayah ini dummy.
const REGION_DATA = [
  { name: "Jawa", value: 622000 },
  { name: "Sulawesi", value: 141000 },
  { name: "Sumatera", value: 118000 },
  { name: "Bali & Nusa Tenggara", value: 62000 },
  { name: "Kalimantan", value: 38000 },
];
const totalRegion = REGION_DATA.reduce((a, b) => a + b.value, 0);

/* ---------------- presentational bits ---------------- */
function KpiCard({ item }) {
  const Icon = item.icon;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(C.navy, 0.06), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color={C.navy} strokeWidth={2} />
      </div>
      <div>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 30, color: C.ink, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{item.value}</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: C.slate, marginTop: 2 }}>{item.unit}</div>
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "24px 26px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Icon size={18} color={C.orange} strokeWidth={2.2} />
        <h3 style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 17, color: C.ink, margin: 0 }}>{title}</h3>
      </div>
      <p style={{ fontFamily: FONT_BODY, fontSize: 13, color: C.slate, margin: "0 0 20px 28px" }}>{subtitle}</p>
      {children}
    </div>
  );
}

function SimpleTooltip({ active, payload, titleKey, valueSuffix }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontFamily: FONT_BODY, fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: C.ink }}>{p[titleKey]}</div>
      <div style={{ color: C.slate }}>{fmt(payload[0].value)} {valueSuffix}</div>
    </div>
  );
}

/* ---------------- main ---------------- */
export default function IndomarcoDashboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Customer selector — default Indomarco. Opsi = customer yang punya data di sp_items.
  const [customerId, setCustomerId] = useState(INDOMARCO_ID);
  const [customerOptions, setCustomerOptions] = useState([]);

  // Opsi dropdown: DISTINCT customer_id dari sp_items → resolve nama via accounts
  // (sp_items.customer_id → accounts.id; accounts.name). Sekali saat mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: idRows, error: e1 } = await supabase
          .from("sp_items").select("customer_id").not("customer_id", "is", null).limit(5000);
        if (e1) throw e1;
        const ids = [...new Set((idRows || []).map((r) => r.customer_id).filter(Boolean))];
        if (!ids.length) { if (alive) setCustomerOptions([]); return; }
        const { data: accs, error: e2 } = await supabase
          .from("accounts").select("id, name").in("id", ids);
        if (e2) throw e2;
        const opts = (accs || [])
          .map((a) => ({ id: a.id, name: a.name || "(Tanpa nama)" }))
          .sort((a, b) => a.name.localeCompare(b.name, "id"));
        if (alive) setCustomerOptions(opts);
      } catch { /* dropdown fallback ke opsi terpilih; data utama tetap jalan */ }
    })();
    return () => { alive = false; };
  }, []);

  // Data dashboard — ikut customer terpilih; re-fetch tiap ganti customer.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // sp_items: tak ada company_id/deleted_at; RLS read = USING(true). Scope via
        // customer_id (dropdown) + role-gate menu (manager-or-above). limit(1000).
        const { data, error: err } = await supabase
          .from("sp_items")
          .select("sp_no, qty, shipped_qty, dc, sp_date, sp_status")
          .eq("customer_id", customerId)
          .limit(1000);
        if (err) throw err;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) { setError(e.message || "Gagal memuat data."); setRows([]); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [customerId]);

  // ── agregasi (client-side, dari satu fetch) ──────────────────────────────
  const spSet = new Set();
  const dcSet = new Set();
  const dcVol = {};                          // dc → Σ qty (Bar DC Teratas)
  const trendSets = Array.from({ length: 7 }, () => new Set()); // Jan–Jul 2026, distinct sp_no
  let totalOrdered = 0;
  let totalRealized = 0;
  const dateStrs = [];
  rows.forEach((r) => {
    if (r.sp_no) spSet.add(r.sp_no);
    totalOrdered += r.qty || 0;
    totalRealized += r.shipped_qty || 0;
    const dc = (r.dc || "").trim();
    if (dc) { dcSet.add(dc); dcVol[dc] = (dcVol[dc] || 0) + (r.qty || 0); }
    if (r.sp_date) {
      dateStrs.push(String(r.sp_date).slice(0, 10));
      const [y, m] = String(r.sp_date).slice(0, 10).split("-");
      if (y === "2026" && r.sp_no) { const idx = Number(m) - 1; if (idx >= 0 && idx <= 6) trendSets[idx].add(r.sp_no); }
    }
  });
  const totalSP = spSet.size;
  const dcCount = dcSet.size;
  const dcData = Object.entries(dcVol).map(([name, volume]) => ({ name, volume })).sort((a, b) => b.volume - a.volume).slice(0, 6);
  const trendData = trendSets.map((s, i) => ({ bulan: MONTHS_ID[i], sp: s.size }));
  dateStrs.sort();
  const periodLabel = dateStrs.length ? `${fmtLongDate(dateStrs[0])} – ${fmtLongDate(dateStrs[dateStrs.length - 1])}` : "—";
  const generatedAt = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const selectedName = customerOptions.find((c) => c.id === customerId)?.name || (customerId === INDOMARCO_ID ? "Indomarco" : "Customer");

  const KPI = [
    { key: "sp",       label: "Total Sales Plan",   value: fmt(totalSP),       unit: "SP tercatat",      icon: Package },
    { key: "ordered",  label: "Total Unit Dipesan", value: fmt(totalOrdered),  unit: "unit",             icon: Boxes },
    { key: "realized", label: "Volume Terealisasi", value: fmt(totalRealized), unit: "unit tercatat",    icon: Truck },
    { key: "dc",       label: "Jangkauan DC",       value: fmt(dcCount),       unit: "titik se-Indonesia", icon: MapPin },
  ];

  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <div className="nx-page-pad" style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT_BODY }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: tint(C.navy, 0.06), color: C.navy, fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, letterSpacing: "0.03em", marginBottom: 12 }}>
            <ShieldCheck size={14} strokeWidth={2.2} />
            Ringkasan Kemitraan {selectedName}
          </div>
          <h1 style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 30, color: C.ink, margin: 0, letterSpacing: "-0.02em" }}>
            Pesanan Anda, Terkontrol &amp; Terlacak
          </h1>
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, color: C.slate, margin: "8px 0 0", maxWidth: 560 }}>
            Setiap Sales Plan tercatat digital dan menjangkau puluhan Distribution Center di seluruh Indonesia.
            {periodLabel !== "—" && <> Periode data {periodLabel}.</>}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="indomarco-cust" style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: C.slate }}>Customer</label>
            <select
              id="indomarco-cust"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ height: 40, minWidth: 240, border: `1px solid ${C.line}`, borderRadius: 10, background: C.card, padding: "0 12px", fontSize: 13.5, color: C.ink, cursor: "pointer", outline: "none", fontFamily: FONT_BODY }}
            >
              {!customerOptions.some((c) => c.id === customerId) && (
                <option value={customerId}>{selectedName}</option>
              )}
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16, color: C.navy }}>Nexus by MSI</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.slate }}>Data per {generatedAt}</div>
          </div>
        </div>
      </div>

      {/* ── Error / loading / empty ──────────────────────────────────────── */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: tint(C.red, 0.06), border: `1px solid ${tint(C.red, 0.25)}`, color: C.red, fontSize: 13, fontFamily: FONT_BODY }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.slate, fontSize: 14, fontFamily: FONT_BODY }}>Memuat data {selectedName}…</div>
      )}
      {isEmpty && (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.slate, fontSize: 14, fontFamily: FONT_BODY }}>Belum ada data SP untuk {selectedName}.</div>
      )}

      {!loading && !error && !isEmpty && (
        <>
          {/* ── KPI row ─────────────────────────────────────────────────── */}
          <div className="nx-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
            {KPI.map((item) => <KpiCard key={item.key} item={item} />)}
          </div>

          {/* ── Row: donut wilayah + bar top DC ─────────────────────────── */}
          <div className="nx-grid-2" style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(340px, 1.3fr)", gap: 20 }}>
            <Panel title="Jangkauan per Wilayah" subtitle="Sebaran volume pesanan di 5 wilayah, dari total DC aktif." icon={Globe2}>
              <div style={{ position: "relative" }}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={REGION_DATA} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2} stroke="none">
                      {REGION_DATA.map((entry, i) => <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<SimpleTooltip titleKey="name" valueSuffix="unit" />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label — angka DC LIVE, pembagian wilayah masih dummy */}
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 26, color: C.ink }}>{fmt(dcCount)}</div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: C.slate }}>DC aktif</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {REGION_DATA.map((r, i) => (
                  <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: REGION_COLORS[i % REGION_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: C.ink, flex: 1 }}>{r.name}</span>
                    <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: C.slate }}>{Math.round((r.value / totalRegion) * 100)}%</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Distribution Center Teratas" subtitle="6 DC dengan volume tertinggi. Tiga teratas ditandai oranye." icon={MapPin}>
              {dcData.length === 0 ? (
                <div style={{ padding: "80px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>Belum ada data DC.</div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={dcData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}rb`} tick={{ fontFamily: FONT_BODY, fontSize: 12, fill: C.slate }} axisLine={{ stroke: C.line }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={92} tick={{ fontFamily: FONT_BODY, fontSize: 13, fill: C.ink }} axisLine={false} tickLine={false} />
                    <Tooltip content={<SimpleTooltip titleKey="name" valueSuffix="unit" />} cursor={{ fill: tint(C.navy, 0.03) }} />
                    <Bar dataKey="volume" radius={[0, 6, 6, 0]} barSize={22}>
                      {dcData.map((entry, i) => <Cell key={i} fill={i < 3 ? C.orange : C.navy} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* ── Trend — area gradient ───────────────────────────────────── */}
          <Panel title="Tren Sales Plan per Bulan" subtitle="Konsistensi pesanan yang tercatat secara digital sepanjang 2026 (Jan–Jul)." icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="indomarcoTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.orange} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="bulan" tick={{ fontFamily: FONT_BODY, fontSize: 12, fill: C.slate }} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis tick={{ fontFamily: FONT_BODY, fontSize: 12, fill: C.slate }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<SimpleTooltip titleKey="bulan" valueSuffix="SP" />} cursor={{ stroke: C.line }} />
                <Area type="monotone" dataKey="sp" stroke={C.orange} strokeWidth={2.5} fill="url(#indomarcoTrendFill)" dot={{ r: 4, fill: C.orange, strokeWidth: 0 }} activeDot={{ r: 6, fill: C.orange, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
            <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: C.slate, margin: "14px 0 0", fontStyle: "italic" }}>
              Bulan berjalan mungkin belum penuh — angka menyesuaikan data terbaru.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
