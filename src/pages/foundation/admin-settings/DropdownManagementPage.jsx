/* =========================================================================
   DropdownManagementPage — Nexus by MSI · Admin Settings › Dropdown Management
   Two-pane manager for the system's reference dropdown lists:

     • Left  — searchable tree: groups → dropdown lists (with option counts)
     • Right — option editor: add / edit / delete / toggle-active / reorder

   Exported as <DropdownManagementBody/> and embedded as a tab inside
   GeneralPreferencesPage (no breadcrumb / h1 / outer padding — host provides
   chrome).

   DATA — fully DB-driven (no dummy):
     • `dropdown_options` (group_key→list_key→options) — full CRUD + reorder.
       Writes are super_admin-only (RLS); other roles get the real error toast.
     • `currencies` (global) + `payment_terms` (scoped company_id) merged into
       the Finance group. These two are TOGGLE-ONLY here (no sort_order column,
       and add/edit/delete are managed elsewhere) — add/edit/delete/reorder are
       gated off; toggle flips is_active.
   Every write persists immediately then re-fetches the whole tree.
   Styling/layout preserved verbatim from the Lovable handoff.
   ========================================================================= */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronDown, Search, Plus, Pencil, Trash2, GripVertical,
  Check, X, ListTree, Tag, Users, Coins, Ship, FileText, Inbox,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/useAuth";
import { useToast } from "./kit";

/* ---------- brand tokens ---------- */
const NAVY = "#144682";
const ORANGE = "#E85A1E";
const ORANGE_DK = "#D14E18";
const CREAM = "#F6EFE3";
const SURFACE = "#FFFDF8";
const LINE = "#E5E0D8";
const LINE_SOFT = "#EFE9DD";
const INK = "#16243A";
const INK_SOFT = "#4A5360";
const MUTED = "#6B7280";
const FAINT = "#9CA3AF";
const DANGER = "#DC2626";
const GREEN = "#1F8B4D";
const TINT = "#EAF0F8";
const FONT_HEAD = "'Montserrat', system-ui, -apple-system, sans-serif";
const FONT_BODY = "'Inter', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ---------- group icon map ---------- */
const GROUP_ICON = { Users, Coins, Ship, FileText };

/* ---------- helpers ---------- */
const toCode = (s) =>
  s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const humanize = (k) =>
  String(k || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* ---------- display metadata (DB only stores keys, not friendly names) ---------- */
const GROUP_META = {
  sales:   { name: "Sales & CRM", icon: "Users" },
  finance: { name: "Finance",     icon: "Coins" },
  ops:     { name: "Operations",  icon: "Ship" },
  hrga:    { name: "HRGA",        icon: "FileText" },
};
const GROUP_ORDER = ["sales", "finance", "ops", "hrga"];

const LIST_META = {
  service_type:   { name: "Service Type",      desc: "Jenis layanan inquiry & quotation" },
  lead_source:    { name: "Lead Source",       desc: "Sumber masuknya prospek baru" },
  lost_reason:    { name: "Alasan Kalah",      desc: "Sebab deal tidak berhasil ditutup" },
  activity_type:  { name: "Tipe Aktivitas",    desc: "Jenis aktivitas CRM" },
  customer_type:  { name: "Tipe Customer",     desc: "Klasifikasi pelanggan" },
  customer_tier:  { name: "Tier Customer",     desc: "Tingkatan pelanggan" },
  unit_label:     { name: "Satuan (Unit)",     desc: "Satuan item pada quotation" },
  payment_terms:  { name: "Termin Pembayaran", desc: "Jangka waktu jatuh tempo invoice" },
  currency:       { name: "Mata Uang",         desc: "Mata uang transaksi yang didukung" },
  shipment_mode:  { name: "Moda Pengiriman",   desc: "Jalur transportasi pengiriman" },
  container_type: { name: "Tipe Kontainer",    desc: "Ukuran & jenis peti kemas" },
  incoterm:       { name: "Incoterm",          desc: "Syarat penyerahan barang internasional" },
  leave_type:     { name: "Tipe Cuti",         desc: "Jenis pengajuan cuti" },
  allowance_type: { name: "Tipe Tunjangan",    desc: "Jenis tunjangan/benefit" },
};
const LIST_ORDER = [
  "service_type", "lead_source", "lost_reason", "activity_type", "customer_type", "customer_tier",
  "unit_label", "payment_terms", "currency",
  "shipment_mode", "container_type", "incoterm",
  "leave_type", "allowance_type",
];
const orderIdx = (arr, k) => { const i = arr.indexOf(k); return i < 0 ? 99 : i; };

/* Build the groups→lists→options tree from the three sources.
   Groups are data-driven (from dropdown_options.group_key); currencies +
   payment_terms are injected into the Finance group. */
function buildTree(ddRows, curRows, ptRows) {
  const byGroup = {}; // group_key -> { list_key -> options[] }
  (ddRows || []).forEach((r) => {
    byGroup[r.group_key] = byGroup[r.group_key] || {};
    byGroup[r.group_key][r.list_key] = byGroup[r.group_key][r.list_key] || [];
    byGroup[r.group_key][r.list_key].push({
      id: r.id, label: r.label, value: r.value, active: !!r.is_active,
      source: "dropdown_options", group_key: r.group_key, list_key: r.list_key,
      sort_order: r.sort_order ?? 0,
    });
  });

  // Finance: currencies (global) + payment_terms (company-scoped) — toggle-only.
  byGroup.finance = byGroup.finance || {};
  byGroup.finance.payment_terms = (ptRows || []).map((r) => ({
    id: r.id, label: r.name, value: r.code || r.name, active: !!r.is_active, source: "payment_terms",
  }));
  byGroup.finance.currency = (curRows || []).map((r) => ({
    id: r.code, label: r.name + (r.symbol ? " (" + r.symbol + ")" : ""), value: r.code,
    active: !!r.is_active, source: "currencies",
  }));

  const groupKeys = Object.keys(byGroup).sort(
    (a, b) => orderIdx(GROUP_ORDER, a) - orderIdx(GROUP_ORDER, b) || a.localeCompare(b)
  );

  return groupKeys.map((gk) => {
    const gmeta = GROUP_META[gk] || { name: humanize(gk), icon: "ListTree" };
    const listKeys = Object.keys(byGroup[gk]).sort(
      (a, b) => orderIdx(LIST_ORDER, a) - orderIdx(LIST_ORDER, b) || a.localeCompare(b)
    );
    return {
      id: gk, name: gmeta.name, icon: gmeta.icon,
      lists: listKeys.map((lk) => {
        const lmeta = LIST_META[lk] || { name: humanize(lk), desc: "" };
        const source = lk === "currency" ? "currencies" : lk === "payment_terms" ? "payment_terms" : "dropdown_options";
        const opts = byGroup[gk][lk];
        const options = source === "dropdown_options"
          ? opts.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          : opts;
        return { id: lk, list_key: lk, group_key: gk, name: lmeta.name, desc: lmeta.desc, source, options };
      }),
    };
  });
}

/* =========================================================================
   SMALL PRESENTATIONAL PIECES
   ========================================================================= */

/* icon button with hover state */
function IconBtn({ icon: IconCmp, title, onClick, danger, active }) {
  const [h, setH] = useState(false);
  const c = danger ? DANGER : NAVY;
  return (
    <button type="button" title={title} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", flex: "0 0 32px",
        border: "1px solid " + (h || active ? c : LINE),
        background: h || active ? (danger ? "rgba(220,38,38,.07)" : TINT) : SURFACE,
        color: h || active ? c : MUTED, transition: "all .15s",
      }}>
      <IconCmp size={15} strokeWidth={1.8} />
    </button>
  );
}

/* sliding active toggle */
function Toggle({ on, onChange, title }) {
  return (
    <button type="button" role="switch" aria-checked={on} title={title}
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 23, borderRadius: 20, border: "none", padding: 0,
        position: "relative", cursor: "pointer", flex: "0 0 40px",
        background: on ? GREEN : "#CFC8BA", transition: "background .25s ease",
      }}>
      <span style={{
        position: "absolute", top: 3, left: 3, width: 17, height: 17, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
        transform: on ? "translateX(17px)" : "translateX(0)",
        transition: "transform .25s cubic-bezier(.22,1,.36,1)",
      }} />
    </button>
  );
}

/* inline add/edit editor for one option */
function OptionEditor({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial.label || "");
  const [value, setValue] = useState(initial.value || "");
  const [active, setActive] = useState(initial.active !== false);
  const [touched, setTouched] = useState(!!initial.value);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);

  const onLabel = (v) => { setLabel(v); if (!touched) setValue(toCode(v)); };
  const canSave = label.trim().length > 0;
  const submit = () => { if (canSave) onSave({ label: label.trim(), value: (value || toCode(label)).trim(), active }); };
  const key = (e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); };

  const field = (val, set, ph, mono, refEl) => {
    const [f, setF] = useState(false);
    return (
      <input ref={refEl} value={val} placeholder={ph} onKeyDown={key}
        onChange={(e) => set(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{
          width: "100%", height: 40, borderRadius: 9, border: "1px solid " + (f ? NAVY : LINE),
          background: SURFACE, padding: "0 12px", fontFamily: mono ? FONT_MONO : FONT_BODY,
          fontSize: mono ? 12.5 : 13.5, fontWeight: 500, color: INK, outline: "none",
          boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none",
          transition: "border-color .15s, box-shadow .15s",
        }} />
    );
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
      borderRadius: 11, border: "1.5px solid " + NAVY, background: "#FAFCFF",
      boxShadow: "0 4px 16px rgba(20,70,130,.12)",
    }}>
      <span style={{ width: 24, color: FAINT, display: "flex", justifyContent: "center", flex: "0 0 24px" }}>
        <Plus size={16} />
      </span>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>{field(label, onLabel, "Label opsi…", false, ref)}</div>
      <div style={{ flex: "0 0 200px" }}>{field(value, (v) => { setTouched(true); setValue(v); }, "KODE_NILAI", true)}</div>
      <Toggle on={active} onChange={setActive} title="Aktif" />
      <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
        <button type="button" onClick={submit} disabled={!canSave}
          style={{
            width: 36, height: 36, borderRadius: 9, border: "none", cursor: canSave ? "pointer" : "not-allowed",
            background: canSave ? GREEN : "#B7D6C3", color: "#fff", display: "flex",
            alignItems: "center", justifyContent: "center", transition: "background .15s",
          }}>
          <Check size={17} />
        </button>
        <button type="button" onClick={onCancel}
          style={{
            width: 36, height: 36, borderRadius: 9, border: "1px solid " + LINE, cursor: "pointer",
            background: SURFACE, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <X size={17} />
        </button>
      </div>
    </div>
  );
}

/* single option row (display mode). `editable` gates edit/delete/drag
   (currencies & payment_terms are toggle-only). */
function OptionRow({ opt, index, editable, onEdit, onDelete, onToggle, dnd, pendingDelete, setPendingDelete }) {
  const [h, setH] = useState(false);
  const confirming = pendingDelete === opt.id;
  const isOver = dnd.overId === opt.id && dnd.dragId !== opt.id;
  const isDragging = dnd.dragId === opt.id;

  return (
    <div
      draggable={editable && !confirming}
      onDragStart={(e) => { if (!editable) return; dnd.onDragStart(opt.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { if (!editable) return; e.preventDefault(); dnd.onDragOver(opt.id); }}
      onDrop={(e) => { if (!editable) return; e.preventDefault(); dnd.onDrop(opt.id); }}
      onDragEnd={editable ? dnd.onDragEnd : undefined}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 11,
        border: "1px solid " + (isOver ? NAVY : h ? "#D8D0C2" : LINE_SOFT),
        background: isDragging ? TINT : h ? "#FBF7EF" : SURFACE,
        opacity: isDragging ? 0.5 : opt.active ? 1 : 0.62,
        boxShadow: isOver ? "0 -2px 0 " + NAVY + " inset, 0 4px 14px rgba(20,70,130,.12)" : "none",
        transition: "border-color .15s, background .15s, box-shadow .15s", cursor: "default",
      }}>
      {editable ? (
        <span title="Seret untuk mengurutkan"
          style={{ color: h ? NAVY : FAINT, cursor: "grab", display: "flex", flex: "0 0 auto", transition: "color .15s" }}>
          <GripVertical size={17} />
        </span>
      ) : (
        <span style={{ flex: "0 0 17px" }} />
      )}
      <span style={{
        fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600, color: MUTED, width: 22,
        textAlign: "right", flex: "0 0 22px",
      }}>{index + 1}</span>
      <span style={{ flex: "1 1 auto", minWidth: 0, fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, color: INK }}>
        {opt.label}
      </span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto",
        fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: NAVY,
        background: TINT, border: "1px solid #D7E4F2", borderRadius: 7, padding: "4px 9px",
      }}>
        <Tag size={12} />{opt.value}
      </span>

      {confirming ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: DANGER }}>Hapus?</span>
          <button type="button" onClick={() => { onDelete(opt.id); setPendingDelete(null); }}
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: DANGER, color: "#fff", fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Ya
          </button>
          <button type="button" onClick={() => setPendingDelete(null)}
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid " + LINE, background: SURFACE, color: MUTED, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Batal
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
          <Toggle on={opt.active} onChange={() => onToggle(opt)} title={opt.active ? "Nonaktifkan" : "Aktifkan"} />
          {editable && <IconBtn icon={Pencil} title="Edit" onClick={() => onEdit(opt)} />}
          {editable && <IconBtn icon={Trash2} title="Hapus" danger onClick={() => setPendingDelete(opt.id)} />}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   BODY — embedded inside GeneralPreferencesPage as a tab.
   ========================================================================= */
export function DropdownManagementBody() {
  const { profile } = useAuth();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [selectedListId, setSelectedListId] = useState(null);
  const [treeQuery, setTreeQuery] = useState("");
  const [optQuery, setOptQuery] = useState("");
  const [editor, setEditor] = useState(null); // {mode:'add'|'edit', id?}
  const [pendingDelete, setPendingDelete] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [fireToast, toastNode] = useToast();

  const hasLoaded = useRef(false);
  const refresh = () => setRefreshKey((k) => k + 1);

  /* ---- fetch everything (dropdown_options + currencies + payment_terms) ---- */
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    if (!hasLoaded.current) setLoading(true);
    setError(null);

    (async () => {
      let ptQ = supabase.from("payment_terms")
        .select("id, code, name, is_active, company_id")
        .is("deleted_at", null).order("name").limit(1000);
      if (profile.company_id) ptQ = ptQ.eq("company_id", profile.company_id);

      const [ddRes, curRes, ptRes] = await Promise.all([
        supabase.from("dropdown_options").select("*").is("deleted_at", null).order("sort_order", { ascending: true }).limit(2000),
        supabase.from("currencies").select("code, name, symbol, is_active").order("code").limit(1000),
        ptQ,
      ]);
      if (cancelled) return;
      if (ddRes.error || curRes.error || ptRes.error) {
        throw (ddRes.error || curRes.error || ptRes.error);
      }
      return buildTree(ddRes.data, curRes.data, ptRes.data);
    })().then((tree) => {
      if (cancelled || !tree) return;
      setData(tree);
      setExpanded((prev) => { const e = { ...prev }; tree.forEach((g) => { if (!(g.id in e)) e[g.id] = true; }); return e; });
      setSelectedListId((prev) =>
        tree.some((g) => g.lists.some((l) => l.id === prev)) ? prev : (tree[0]?.lists[0]?.id || null)
      );
      hasLoaded.current = true;
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setError(err?.message || "Gagal memuat data.");
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, refreshKey]);

  /* tree search (auto-expands matches) */
  const tree = useMemo(() => {
    const q = treeQuery.trim().toLowerCase();
    if (!q) return data;
    return data
      .map((g) => {
        const groupHit = g.name.toLowerCase().includes(q);
        const lists = groupHit ? g.lists : g.lists.filter((l) => l.name.toLowerCase().includes(q));
        return { ...g, lists };
      })
      .filter((g) => g.lists.length > 0);
  }, [data, treeQuery]);

  /* currently selected list + its group */
  const { selList, selGroup } = useMemo(() => {
    for (const g of data) {
      const l = g.lists.find((x) => x.id === selectedListId);
      if (l) return { selList: l, selGroup: g };
    }
    return { selList: null, selGroup: null };
  }, [data, selectedListId]);

  const listEditable = !!selList && selList.source === "dropdown_options";

  const visibleOptions = useMemo(() => {
    if (!selList) return [];
    const q = optQuery.trim().toLowerCase();
    if (!q) return selList.options;
    return selList.options.filter(
      (o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)
    );
  }, [selList, optQuery]);

  /* reset transient UI when switching lists */
  useEffect(() => { setEditor(null); setPendingDelete(null); setOptQuery(""); }, [selectedListId]);

  /* ---- DB writes (persist immediately, then re-fetch) ---- */
  const runWrite = async (promise, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error: e } = await promise;
      if (e) throw e;
      fireToast(okMsg || "Tersimpan");
      refresh();
    } catch (err) {
      fireToast(err?.message || "Gagal menyimpan", "alert");
    } finally {
      setBusy(false);
    }
  };

  const addOption = (draft) => {
    if (!selList || selList.source !== "dropdown_options") return;
    const maxSort = selList.options.reduce((m, o) => Math.max(m, o.sort_order ?? 0), 0);
    setEditor(null);
    runWrite(
      supabase.from("dropdown_options").insert({
        group_key: selList.group_key, list_key: selList.list_key,
        label: draft.label, value: draft.value, sort_order: maxSort + 1,
        is_active: draft.active, company_id: null,
      }),
      "Opsi ditambahkan"
    );
  };

  const updateOption = (id, draft) => {
    if (!selList || selList.source !== "dropdown_options") return;
    setEditor(null);
    runWrite(
      supabase.from("dropdown_options").update({ label: draft.label, value: draft.value, is_active: draft.active }).eq("id", id),
      "Opsi diperbarui"
    );
  };

  const deleteOption = (id) => {
    if (!selList || selList.source !== "dropdown_options") return;
    runWrite(
      supabase.from("dropdown_options").update({ deleted_at: new Date().toISOString() }).eq("id", id),
      "Opsi dihapus"
    );
  };

  const toggleOption = (opt) => {
    const next = !opt.active;
    let p;
    if (opt.source === "currencies") p = supabase.from("currencies").update({ is_active: next }).eq("code", opt.id);
    else if (opt.source === "payment_terms") p = supabase.from("payment_terms").update({ is_active: next }).eq("id", opt.id);
    else p = supabase.from("dropdown_options").update({ is_active: next }).eq("id", opt.id);
    runWrite(p, next ? "Opsi diaktifkan" : "Opsi dinonaktifkan");
  };

  const reorder = (fromId, toId) => {
    if (!selList || selList.source !== "dropdown_options" || fromId === toId || busy) return;
    const opts = selList.options.slice();
    const from = opts.findIndex((o) => o.id === fromId);
    const to = opts.findIndex((o) => o.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = opts.splice(from, 1);
    opts.splice(to, 0, moved);
    setBusy(true);
    Promise.all(opts.map((o, idx) => supabase.from("dropdown_options").update({ sort_order: idx }).eq("id", o.id)))
      .then((results) => {
        const err = results.find((r) => r.error)?.error;
        if (err) throw err;
        fireToast("Urutan diperbarui");
        refresh();
      })
      .catch((err) => fireToast(err?.message || "Gagal mengurutkan", "alert"))
      .finally(() => setBusy(false));
  };

  const dnd = {
    dragId, overId,
    onDragStart: (id) => setDragId(id),
    onDragOver: (id) => setOverId(id),
    onDrop: (id) => { reorder(dragId, id); setDragId(null); setOverId(null); },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  };

  const toggleGroup = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const activeCount = selList ? selList.options.filter((o) => o.active).length : 0;

  /* ---- styles ---- */
  const page = { fontFamily: FONT_BODY, color: INK };
  const shell = {
    display: "grid", gridTemplateColumns: "320px 1fr", gap: 20,
    maxWidth: 1280, margin: "0 auto", alignItems: "start",
  };
  const panel = { background: SURFACE, border: "1px solid " + LINE, borderRadius: 16, overflow: "hidden" };

  return (
    <div style={page}>
      <style>{`
        .dm-scroll::-webkit-scrollbar{width:10px;height:10px}
        .dm-scroll::-webkit-scrollbar-thumb{background:#D8D0C2;border-radius:20px;border:3px solid ${SURFACE}}
        .dm-scroll::-webkit-scrollbar-track{background:transparent}
        input::placeholder{color:${FAINT};opacity:1}
        @keyframes dm-spin{to{transform:rotate(360deg)}}
        .dm-spinner{width:34px;height:34px;border-radius:50%;border:3px solid ${LINE};border-top-color:${NAVY};animation:dm-spin .7s linear infinite}
        *{box-sizing:border-box}
      `}</style>

      {loading ? (
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "80px 20px" }}>
          <div className="dm-spinner" />
          <div style={{ color: MUTED, fontSize: 13.5 }}>Memuat data dropdown…</div>
        </div>
      ) : error ? (
        <div style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center", color: DANGER, padding: "60px 20px", fontSize: 13.5 }}>
          Gagal memuat data: {error}
        </div>
      ) : (
      <div style={shell}>
        {/* ===== LEFT: TREE ===== */}
        <div style={panel}>
          <div style={{ padding: 14, borderBottom: "1px solid " + LINE_SOFT }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none", display: "flex" }}>
                <Search size={16} />
              </span>
              <input value={treeQuery} onChange={(e) => setTreeQuery(e.target.value)} placeholder="Cari daftar dropdown…"
                style={{
                  width: "100%", height: 42, borderRadius: 10, border: "1px solid " + LINE, background: CREAM,
                  padding: "0 34px 0 36px", fontFamily: FONT_BODY, fontSize: 13.5, color: INK, outline: "none",
                }} />
              {treeQuery && (
                <button type="button" onClick={() => setTreeQuery("")}
                  style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: MUTED, cursor: "pointer", display: "flex", padding: 4 }}>
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="dm-scroll" style={{ maxHeight: "calc(100vh - 230px)", overflowY: "auto", padding: 10 }}>
            {tree.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: FAINT, fontSize: 13 }}>
                Tidak ada daftar yang cocok.
              </div>
            )}
            {tree.map((g) => {
              const GIcon = GROUP_ICON[g.icon] || ListTree;
              const open = !!expanded[g.id] || !!treeQuery;
              return (
                <div key={g.id} style={{ marginBottom: 4 }}>
                  <button type="button" onClick={() => toggleGroup(g.id)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 10px",
                      border: "none", background: "transparent", cursor: "pointer", borderRadius: 9,
                      fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, color: INK_SOFT,
                      textTransform: "uppercase", letterSpacing: 0.6,
                    }}>
                    <span style={{ display: "flex", color: FAINT, transition: "transform .2s", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
                      <ChevronDown size={15} />
                    </span>
                    <GIcon size={15} color={NAVY} />
                    <span style={{ flex: 1, textAlign: "left" }}>{g.name}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: FAINT }}>{g.lists.length}</span>
                  </button>

                  {open && (
                    <div style={{ marginLeft: 8, paddingLeft: 12, borderLeft: "1px solid " + LINE_SOFT, marginTop: 2 }}>
                      {g.lists.map((l) => {
                        const sel = l.id === selectedListId;
                        return (
                          <TreeListItem key={l.id} list={l} selected={sel} onClick={() => setSelectedListId(l.id)} />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== RIGHT: OPTION EDITOR ===== */}
        <div style={panel}>
          {!selList ? (
            <div style={{ padding: 60, textAlign: "center", color: FAINT }}>Pilih sebuah daftar dropdown.</div>
          ) : (
            <>
              {/* panel header */}
              <div style={{ padding: "20px 22px", borderBottom: "1px solid " + LINE_SOFT, display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5, flexWrap: "wrap" }}>
                    <ListTree size={18} color={NAVY} style={{ flex: "0 0 auto" }} />
                    <h2 style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: NAVY, margin: 0, letterSpacing: -0.2 }}>
                      {selList.name}
                    </h2>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: MUTED, background: CREAM, border: "1px solid " + LINE_SOFT, borderRadius: 6, padding: "2px 7px", flex: "0 0 auto" }}>
                      {selGroup.name}
                    </span>
                    {!listEditable && (
                      <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: MUTED, background: "#F3EFE6", border: "1px solid " + LINE_SOFT, borderRadius: 6, padding: "2px 7px", flex: "0 0 auto" }}>
                        toggle saja
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{selList.desc}</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                    <Stat label="Total" value={selList.options.length} />
                    <Stat label="Aktif" value={activeCount} color={GREEN} />
                    <Stat label="Nonaktif" value={selList.options.length - activeCount} color={FAINT} />
                  </div>
                </div>
                {listEditable && (
                  <button type="button" onClick={() => { setEditor({ mode: "add" }); setPendingDelete(null); }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.97)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 18px",
                      borderRadius: 11, border: "none", background: ORANGE, color: "#fff", fontFamily: FONT_HEAD,
                      fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      boxShadow: "0 6px 16px rgba(232,90,30,.22)", transition: "transform .1s, background .2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = ORANGE_DK)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = ORANGE)}>
                    <Plus size={17} />Tambah Opsi
                  </button>
                )}
              </div>

              {/* option filter */}
              <div style={{ padding: "14px 22px 0" }}>
                <div style={{ position: "relative", maxWidth: 320 }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none", display: "flex" }}>
                    <Search size={15} />
                  </span>
                  <input value={optQuery} onChange={(e) => setOptQuery(e.target.value)} placeholder="Saring opsi pada daftar ini…"
                    style={{
                      width: "100%", height: 38, borderRadius: 9, border: "1px solid " + LINE, background: CREAM,
                      padding: "0 12px 0 34px", fontFamily: FONT_BODY, fontSize: 13, color: INK, outline: "none",
                    }} />
                </div>
              </div>

              {/* option list */}
              <div className="dm-scroll" style={{ padding: "14px 22px 22px", display: "flex", flexDirection: "column", gap: 9, maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}>
                {listEditable && editor && editor.mode === "add" && (
                  <OptionEditor initial={{ active: true }} onSave={addOption} onCancel={() => setEditor(null)} />
                )}

                {visibleOptions.map((o) =>
                  listEditable && editor && editor.mode === "edit" && editor.id === o.id ? (
                    <OptionEditor key={o.id} initial={o} onSave={(d) => updateOption(o.id, d)} onCancel={() => setEditor(null)} />
                  ) : (
                    <OptionRow key={o.id} opt={o} index={selList.options.indexOf(o)} editable={listEditable}
                      onEdit={(opt) => { setEditor({ mode: "edit", id: opt.id }); setPendingDelete(null); }}
                      onDelete={deleteOption} onToggle={toggleOption}
                      dnd={dnd} pendingDelete={pendingDelete} setPendingDelete={setPendingDelete} />
                  )
                )}

                {visibleOptions.length === 0 && !editor && (
                  <div style={{ padding: "44px 20px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12, color: FAINT }}>
                      <Inbox size={34} />
                      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: INK_SOFT }}>
                        {optQuery ? "Tidak ada opsi yang cocok" : "Belum ada opsi"}
                      </div>
                      <div style={{ fontSize: 13 }}>
                        {optQuery ? "Coba kata kunci lain." : listEditable ? "Klik “Tambah Opsi” untuk membuat pilihan pertama." : "Daftar ini dikelola di modul lain."}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      )}
      {toastNode}
    </div>
  );
}

/* tree leaf — its own component so hover state is isolated */
function TreeListItem({ list, selected, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 11px",
        borderRadius: 9, cursor: "pointer", marginBottom: 2, textAlign: "left",
        border: "1px solid " + (selected ? "#CBE0FB" : "transparent"),
        background: selected ? TINT : h ? "#F4EEE2" : "transparent",
        transition: "all .15s",
      }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: selected ? NAVY : "transparent", flex: "0 0 6px" }} />
      <span style={{
        flex: 1, minWidth: 0, fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: selected ? 700 : 500,
        color: selected ? NAVY : INK_SOFT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{list.name}</span>
      <span style={{
        fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: selected ? NAVY : FAINT,
        background: selected ? "#fff" : CREAM, borderRadius: 20, padding: "1px 8px", flex: "0 0 auto",
      }}>{list.options.length}</span>
    </button>
  );
}

/* tiny stat chip used in the panel header */
function Stat({ label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 800, color: color || NAVY, lineHeight: 1 }}>{value}</span>
      <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: MUTED }}>{label}</span>
    </div>
  );
}
