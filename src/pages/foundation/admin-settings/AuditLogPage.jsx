/* =========================================================================
   AuditLogPage — Nexus by MSI · Admin Settings › Audit Log
   System audit-trail viewer: filter bar (search, user, action, entity type,
   date range), table (Waktu, User, Role, Aksi, Entitas, Catatan), CSV export
   of the filtered set, and pagination.

   DATA: real fetch from `audit_logs` (written by src/lib/auditLogger.js).
   RLS read = is_admin_or_above() (super_admin/admin); this page is already
   gated behind Admin Settings. old_data/new_data are NOT displayed here
   (TODO: optional diff viewer) — they remain available in the DB.
   Styling preserved from the previous version (kit + tokens).
   ========================================================================= */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { ACTION_TYPES, ENTITY_TYPES } from "../../../lib/auditLogger";
import { getTodayWIB } from "../../../lib/dateUtils";

import { Card, Icon, KitSelect, OutlineBtn, PageHeader, useToast } from '../../../kit';
import { CARD, ACCENT, ACCENT_HOVER, LINE, INK, INK_SOFT, LINE_SOFT, HEAD_BG, ROW_HOVER, INPUT_BG, FOCUS_RING, FONT_HEAD, FONT_BODY, FONT_MONO, SEMANTIC, TONE } from '../../../kit/tokens';
// Filter dropdown options, derived from the canonical action/entity catalogs.
const AL_ACTIONS = [{ value: "all", label: "Semua Aksi" }, ...Object.values(ACTION_TYPES).map((a) => ({ value: a, label: a }))];
const AL_ENTITIES = [{ value: "all", label: "Semua Entitas" }, ...Object.values(ENTITY_TYPES).map((e) => ({ value: e, label: e }))];

// action → visual kind (color/icon). Derived from the action prefix.
function kindOf(action) {
  const a = String(action || "").toUpperCase();
  if (a.startsWith("CREATE") || a === "CONVERT_LEAD") return "create";
  if (a.startsWith("UPDATE") || a === "CHANGE_PIPELINE_STAGE" || a === "CHANGE_ROLE") return "update";
  if (a.startsWith("DELETE") || a === "DEACTIVATE_USER") return "delete";
  if (a === "LOGIN" || a === "LOGOUT") return "login";
  if (a === "APPROVE_QUOTATION") return "approve";
  if (a === "REJECT_QUOTATION") return "reject";
  return "update";
}
const AL_KIND_STYLE = {
  // Kelas STATUS/DATA (jenis aksi log) — trio SEMANTIC/TONE kit, bukan warna identitas.
  create:  { bg: SEMANTIC.ok.bg, fg: SEMANTIC.ok.fg, icon: "plus" },
  update:  { bg: SEMANTIC.info.bg, fg: SEMANTIC.info.fg, icon: "pencil" },
  delete:  { bg: SEMANTIC.danger.bg, fg: SEMANTIC.danger.fg, icon: "trash" },
  login:   { bg: TONE.navy.bg, fg: TONE.navy.fg, icon: "lock" },
  approve: { bg: SEMANTIC.ok.bg, fg: SEMANTIC.ok.fg, icon: "check" },
  reject:  { bg: SEMANTIC.danger.bg, fg: SEMANTIC.danger.fg, icon: "x" },
};

const AL_PAGE_SIZE = 12;

/* ---------- format an ISO timestamp → "YYYY-MM-DD HH:mm:ss" (local) ---------- */
function fmtTs(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---------- action badge ---------- */
function ALActionBadge({ action }) {
  const s = AL_KIND_STYLE[kindOf(action)] || AL_KIND_STYLE.update;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 9px", borderRadius: 7, background: s.bg, color: s.fg, fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700 }}>
      <Icon name={s.icon} size={12} />{action || "—"}
    </span>
  );
}

/* ---------- avatar chip from email initials ---------- */
function ALAvatar({ email }) {
  const sys = !email || email === "—";
  const init = sys ? "SY" : email.slice(0, 2).toUpperCase();
  return (
    <span style={{ width: 30, height: 30, borderRadius: 9, background: sys ? HEAD_BG : ACCENT, color: sys ? INK_SOFT : INK, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 30px", fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700 }}>
      {sys ? <Icon name="settings" size={15} /> : init}
    </span>
  );
}

export default function AuditLogPage({ onHome }) {
  const [q, setQ] = useState("");
  const [userF, setUserF] = useState("all");
  const [actionF, setActionF] = useState("all");
  const [entityF, setEntityF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [fireToast, toastNode] = useToast();
  const [qFocus, setQFocus] = useState(false);

  // ── live data (audit_logs) ──
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: rows, error: e1 } = await supabase
        .from("audit_logs")
        .select("id, created_at, user_email, user_role, action, entity_type, entity_id, entity_label, notes")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cancelled) return;
      if (e1) { setError(e1.message || "Gagal memuat audit log."); setLoading(false); return; }

      const mapped = (rows || []).map((r) => ({
        id: r.id,
        ts: fmtTs(r.created_at),
        email: r.user_email || "—",
        role: r.user_role || "",
        action: r.action || "—",
        entityType: r.entity_type || "",
        entityLabel: r.entity_label || "",
        notes: r.notes || "",
      }));
      setLogs(mapped);
      setLoading(false);
    })().catch((err) => {
      if (cancelled) return;
      setError(err?.message || "Gagal memuat audit log.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // user filter options derived from real data
  const AL_USERS = useMemo(() => {
    const emails = [...new Set(logs.map((r) => r.email).filter((n) => n && n !== "—"))].sort((a, b) => a.localeCompare(b));
    return [{ value: "all", label: "Semua Pengguna" }, ...emails.map((n) => ({ value: n, label: n }))];
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((r) => {
      if (userF !== "all" && r.email !== userF) return false;
      if (actionF !== "all" && r.action !== actionF) return false;
      if (entityF !== "all" && r.entityType !== entityF) return false;
      const day = r.ts.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q.trim()) {
        const hay = (r.email + " " + r.role + " " + r.action + " " + r.entityType + " " + r.entityLabel + " " + r.notes).toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, q, userF, actionF, entityF, from, to]);

  useEffect(() => { setPage(1); }, [q, userF, actionF, entityF, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / AL_PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const slice = filtered.slice((curPage - 1) * AL_PAGE_SIZE, curPage * AL_PAGE_SIZE);
  const hasFilters = q || userF !== "all" || actionF !== "all" || entityF !== "all" || from || to;

  function resetFilters() { setQ(""); setUserF("all"); setActionF("all"); setEntityF("all"); setFrom(""); setTo(""); }

  function exportCSV() {
    const head = ["Waktu", "User", "Role", "Aksi", "Entity Type", "Entity Label", "Catatan"];
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [head.join(",")].concat(filtered.map((r) => [r.ts, r.email, r.role, r.action, r.entityType, r.entityLabel, r.notes].map(esc).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audit-log-" + getTodayWIB() + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    fireToast(filtered.length + " baris diekspor ke CSV", "download");
  }

  const dateInput = (val, set, label) => (
    <ALDateInput val={val} set={set} label={label} />
  );

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Audit Log" }]}
        title="Audit Log"
        subtitle="Riwayat aktivitas sistem — siapa, kapan, dan apa yang berubah"
        onBack={onHome}
        right={<OutlineBtn icon="download" onClick={exportCSV}>Ekspor CSV</OutlineBtn>}
      />

      {/* FILTER BAR */}
      <Card pad={16} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: INK_SOFT, pointerEvents: "none" }}><Icon name="search" size={16} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari user, aksi, entitas, catatan…"
              onFocus={() => setQFocus(true)} onBlur={() => setQFocus(false)}
              style={{ width: "100%", height: 44, borderRadius: 11, border: "1px solid " + (qFocus ? INK_SOFT : LINE), background: INPUT_BG, padding: "0 14px 0 38px", fontFamily: FONT_BODY, fontSize: 13.5, color: INK, outline: "none", boxShadow: qFocus ? FOCUS_RING : "none", transition: "border-color .2s, box-shadow .2s" }} />
          </div>
          <KitSelect value={userF} onChange={setUserF} options={AL_USERS} width={200} icon="user" />
          <KitSelect value={actionF} onChange={setActionF} options={AL_ACTIONS} width={190} icon="filter" />
          <KitSelect value={entityF} onChange={setEntityF} options={AL_ENTITIES} width={170} icon="layout" />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {dateInput(from, setFrom, "Dari tanggal")}
            <span style={{ color: INK_SOFT, fontSize: 13 }}>—</span>
            {dateInput(to, setTo, "Sampai tanggal")}
          </div>
          {hasFilters && (
            <button type="button" onClick={resetFilters}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 44, padding: "0 14px", borderRadius: 11, border: "1px solid " + LINE, background: CARD, color: INK_SOFT, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = SEMANTIC.danger.fg; e.currentTarget.style.color = SEMANTIC.danger.fg; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.color = INK_SOFT; }}>
              <Icon name="x" size={14} />Reset
            </button>
          )}
        </div>
      </Card>

      {/* RESULT META */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT }}>
          {loading
            ? "Memuat data…"
            : <>Menampilkan <strong style={{ color: INK }}>{filtered.length === 0 ? 0 : (curPage - 1) * AL_PAGE_SIZE + 1}–{Math.min(curPage * AL_PAGE_SIZE, filtered.length)}</strong> dari <strong style={{ color: INK }}>{filtered.length}</strong> entri</>}
        </span>
      </div>

      {/* TABLE */}
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div className="nk-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
            <thead>
              <tr style={{ background: HEAD_BG }}>
                {["Waktu", "User", "Role", "Aksi", "Entitas", "Catatan"].map((h, i) => (
                  <th key={h} style={{ textAlign: "left", padding: "13px 18px", fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700, color: INK_SOFT, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid " + LINE, whiteSpace: "nowrap", width: i === 5 ? "auto" : "1%" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ padding: "56px 20px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12, color: INK_SOFT }}>
                      <span className="nk-spin" style={{ display: "inline-flex" }}><Icon name="loader" size={28} /></span>
                      <div style={{ fontFamily: FONT_BODY, fontSize: 13 }}>Memuat riwayat aktivitas…</div>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={6} style={{ padding: "56px 20px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12, color: SEMANTIC.danger.fg }}>
                      <Icon name="alert" size={30} />
                      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600 }}>Gagal memuat audit log</div>
                      <div style={{ fontSize: 13, color: INK_SOFT }}>{error}</div>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !error && slice.map((r, i) => (
                <ALRow key={r.id || (r.ts + i)} r={r} zebra={i % 2 === 1} />
              ))}
              {!loading && !error && slice.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "56px 20px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12, color: INK_SOFT }}>
                      <Icon name="inbox" size={34} />
                      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: INK_SOFT }}>Tidak ada entri yang cocok</div>
                      <div style={{ fontSize: 13 }}>{hasFilters ? "Coba ubah atau reset filter pencarian." : "Belum ada aktivitas tercatat."}</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderTop: "1px solid " + LINE_SOFT, flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT }}>Halaman {curPage} dari {pages}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ALPageBtn icon="chevleft" disabled={curPage === 1} onClick={() => setPage(curPage - 1)} />
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)}
                  style={{ minWidth: 36, height: 36, borderRadius: 9, border: "1px solid " + (p === curPage ? ACCENT_HOVER : LINE), background: p === curPage ? ACCENT : INPUT_BG, color: p === curPage ? INK : INK_SOFT, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
                  {p}
                </button>
              ))}
              <ALPageBtn icon="chevright" disabled={curPage === pages} onClick={() => setPage(curPage + 1)} />
            </div>
          </div>
        )}
      </Card>
      {toastNode}
    </div>
  );
}

function ALDateInput({ val, set, label }) {
  const [f, setF] = useState(false);
  return (
    <input type="date" value={val} onChange={(e) => set(e.target.value)} aria-label={label}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ height: 44, borderRadius: 11, border: "1px solid " + (f ? INK_SOFT : LINE), background: INPUT_BG, padding: "0 12px", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: val ? INK : INK_SOFT, outline: "none", boxShadow: f ? FOCUS_RING : "none", transition: "border-color .2s, box-shadow .2s", width: 150 }} />
  );
}

function ALRow({ r, zebra }) {
  const [h, setH] = useState(false);
  return (
    <tr onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: h ? ROW_HOVER : zebra ? HEAD_BG : "transparent", transition: "background .14s", borderBottom: "1px solid " + LINE_SOFT }}>
      <td style={{ padding: "13px 18px", fontFamily: FONT_MONO, fontSize: 12.5, color: INK_SOFT, whiteSpace: "nowrap" }}>{r.ts}</td>
      <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
          <ALAvatar email={r.email} />
          <span style={{ display: "block", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK }}>{r.email}</span>
        </span>
      </td>
      <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: r.role ? INK_SOFT : INK_SOFT }}>{r.role || "—"}</span>
      </td>
      <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
        <ALActionBadge action={r.action} />
      </td>
      <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK, background: ACCENT, borderRadius: 7, padding: "3px 9px", alignSelf: "flex-start" }}>{r.entityType || "—"}</span>
          {r.entityLabel && <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT }}>{r.entityLabel}</span>}
        </span>
      </td>
      <td style={{ padding: "13px 18px", fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT, maxWidth: 360, lineHeight: 1.45 }}>{r.notes || "—"}</td>
    </tr>
  );
}

function ALPageBtn({ icon, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid " + LINE, background: CARD, color: disabled ? INK_SOFT : INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all .15s" }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = INK; e.currentTarget.style.background = ROW_HOVER; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.background = CARD; }}>
      <Icon name={icon} size={16} />
    </button>
  );
}
