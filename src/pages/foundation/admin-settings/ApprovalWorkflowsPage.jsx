/* =========================================================================
   ApprovalWorkflowsPage — Nexus by MSI · Admin Settings › Approval Workflows
   Entity switcher + 2 tabs:
     A. Dokumen Bisnis — workflow cards (numbered approval steps, threshold,
        slide-over editor with reorderable steps)
     B. HRGA Request   — approver matrix grouped by category (accordion)
   Data dummy/statis (Supabase wiring to follow separately).
   Note: glyphs not in kit's Icon registry (user, arrow up/down) are pulled
   directly from lucide-react — kit.jsx is not modified.
   ========================================================================= */

import { useState, useEffect } from "react";
import { User, ArrowUp, ArrowDown } from "lucide-react";
import {
  Icon, PageHeader, EntitySwitcher, Tabs, Toggle, PrimaryBtn, OutlineBtn,
  SaveButton, SlideOver, useToast, Skel, FloatingInput, FloatingSelect,
  Segmented, SectionLabel, KitStyles,
} from "./kit";
import {
  NAVY, CREAM, SURFACE, LINE, LINE_SOFT, ROW_HOVER, INK, INK_SOFT, MUTED,
  FAINT, DANGER, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO, fmtRp,
} from "./tokens";

/* ---------- role catalogue ---------- */
const APPR_ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin",       label: "Admin" },
  { value: "ceo",         label: "CEO" },
  { value: "gm",          label: "GM" },
  { value: "manager",     label: "Manager" },
  { value: "finance",     label: "Finance" },
  { value: "hrga",        label: "HRGA" },
  { value: "operations",  label: "Operations" },
  { value: "sales",       label: "Sales" },
];
const HRGA_ROLES = [
  { value: "hrga",    label: "HRGA" },
  { value: "manager", label: "Manager" },
  { value: "gm",      label: "GM" },
  { value: "ceo",     label: "CEO" },
  { value: "finance", label: "Finance" },
  { value: "admin",   label: "Admin" },
];
const roleLabel = (v) => (APPR_ROLES.find((r) => r.value === v) || {}).label || v;

/* ---------- document type metadata ---------- */
const WF_DOCS = {
  SP:        { label: "SP",        full: "Surat Penawaran", tint: "#EAF0F8", fg: NAVY },
  Invoice:   { label: "Invoice",   full: "Invoice",         tint: "#FBE6DA", fg: "#C8521B" },
  Quotation: { label: "Quotation", full: "Quotation",       tint: "#EEE7F4", fg: "#6E4B8C" },
  PO:        { label: "PO",        full: "Purchase Order",  tint: "#FBEFD3", fg: "#9A6B12" },
};
const DOC_FILTERS = ["Semua", "SP", "Invoice", "Quotation", "PO"];

/* ---------- seed workflows ---------- */
const WF_SEED = [
  {
    id: "wf1", doc: "SP", name: "Approval SP Standar", min: "", max: "", active: true,
    steps: [
      { id: "s1", type: "role", role: "manager", user: "", timeout: 48, required: true },
      { id: "s2", type: "role", role: "ceo", user: "", timeout: "", required: true },
    ],
  },
  {
    id: "wf2", doc: "Invoice", name: "Approval Invoice > 50jt", min: "50000000", max: "", active: true,
    steps: [
      { id: "s1", type: "role", role: "finance", user: "", timeout: 24, required: true },
      { id: "s2", type: "role", role: "gm", user: "", timeout: "", required: true },
    ],
  },
  {
    id: "wf3", doc: "Quotation", name: "Approval Quotation", min: "", max: "", active: true,
    steps: [
      { id: "s1", type: "role", role: "manager", user: "", timeout: "", required: true },
    ],
  },
];

/* ---------- info banner ---------- */
function InfoBanner({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 20, background: "#EAF0F8", border: "1px solid #CFE0F2", borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ flex: "0 0 auto", marginTop: 1 }}><Icon name="info" size={17} color={NAVY} /></span>
      <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 1.55, color: INK_SOFT, textWrap: "pretty" }}>{children}</span>
    </div>
  );
}

/* ---------- threshold formatting ---------- */
function thresholdText(min, max) {
  const hasMin = min !== "" && min != null;
  const hasMax = max !== "" && max != null;
  if (!hasMin && !hasMax) return null;
  if (hasMin && hasMax) return fmtRp(Number(min)) + " — " + fmtRp(Number(max));
  if (hasMin) return "≥ " + fmtRp(Number(min));
  return "≤ " + fmtRp(Number(max));
}

/* ---------- small badges ---------- */
function DocBadge({ doc }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 11px", borderRadius: 8, border: "1.5px solid " + NAVY, color: NAVY, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, background: SURFACE }}>
      {WF_DOCS[doc] ? WF_DOCS[doc].label : doc}
    </span>
  );
}
function ApproverTypeBadge({ type }) {
  const isRole = type === "role";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 6, background: isRole ? "#EAF0F8" : "#FBE6DA", color: isRole ? NAVY : "#C8521B", fontFamily: FONT_HEAD, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {isRole ? <Icon name="shield" size={11} /> : <User size={11} strokeWidth={1.7} />}{isRole ? "Role" : "User"}
    </span>
  );
}

/* =========================================================================
   WORKFLOW CARD
   ========================================================================= */
function WorkflowCard({ wf, onToggle, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const meta = WF_DOCS[wf.doc] || { full: wf.doc };
  const th = thresholdText(wf.min, wf.max);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: SURFACE, border: "1px solid " + (hover ? "#C9D8EC" : LINE), borderRadius: 16, overflow: "hidden", transition: "border-color .2s, box-shadow .2s", boxShadow: hover ? "0 8px 24px rgba(20,40,70,.08)" : "0 1px 2px rgba(20,40,70,.03)", opacity: wf.active ? 1 : 0.82 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "18px 20px 14px" }}>
        <DocBadge doc={wf.doc} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15.5, fontWeight: 600, color: NAVY, letterSpacing: -0.2 }}>{wf.name}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: FAINT, marginTop: 2 }}>{meta.full} · {wf.steps.length} langkah</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: wf.active ? GREEN : FAINT }}>{wf.active ? "Aktif" : "Nonaktif"}</span>
          <Toggle on={wf.active} onChange={() => onToggle(wf.id)} />
        </div>
      </div>

      {/* threshold */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 20px 16px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 12px", borderRadius: 8, background: CREAM, border: "1px solid " + LINE_SOFT }}>
          <Icon name="coins" size={14} color={MUTED} />
          {th ? (
            <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>{th}</span>
          ) : (
            <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: INK_SOFT, whiteSpace: "nowrap" }}>Semua Amount</span>
          )}
        </span>
      </div>

      {/* steps */}
      <div style={{ padding: "0 20px 6px", borderTop: "1px solid " + LINE_SOFT }}>
        <div style={{ paddingTop: 16 }}>
          {wf.steps.map((s, i) => {
            const last = i === wf.steps.length - 1;
            return (
              <div key={s.id} style={{ display: "flex", gap: 14, position: "relative" }}>
                {/* number + connector */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 30px" }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: NAVY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, flex: "0 0 30px", boxShadow: "0 2px 6px rgba(20,70,130,.25)" }}>{i + 1}</span>
                  {!last && <span style={{ flex: 1, width: 0, borderLeft: "2px dashed " + LINE, margin: "4px 0", minHeight: 22 }} />}
                </div>
                {/* detail */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 16 : 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <ApproverTypeBadge type={s.type} />
                    <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>{s.type === "role" ? roleLabel(s.role) : (s.user || "—")}</span>
                    {s.required && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: "#C8521B" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#C8521B" }} />Wajib
                      </span>
                    )}
                    {s.timeout !== "" && s.timeout != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 6, background: "#F4EFE4", color: INK_SOFT, fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600 }}>
                        <Icon name="clock" size={12} color={MUTED} />{s.timeout}h
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* footer */}
      <div style={{ padding: "12px 20px 16px", borderTop: "1px solid " + LINE_SOFT, background: confirm ? "rgba(220,38,38,.04)" : "transparent", transition: "background .2s" }}>
        {confirm ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: DANGER, flex: 1, minWidth: 160 }}>
              <Icon name="alert" size={16} />Hapus workflow ini?
            </span>
            <button type="button" onClick={() => setConfirm(false)} style={pillBtn(false)}>Batal</button>
            <button type="button" onClick={() => onDelete(wf.id)} style={pillBtn(true)}>
              <Icon name="trash" size={14} />Ya, hapus
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => onEdit(wf)} style={ftBtn(NAVY)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#EAF0F8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Icon name="pencil" size={14} />Edit Workflow
            </button>
            <button type="button" onClick={() => setConfirm(true)} style={ftBtn(DANGER)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Icon name="trash" size={14} />Hapus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
const ftBtn = (c) => ({ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10, border: "1.5px solid " + c, background: "transparent", color: c, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "background .2s" });
const pillBtn = (danger) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 9, border: "none", background: danger ? DANGER : "transparent", color: danger ? "#fff" : MUTED, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: danger ? "0 4px 12px rgba(220,38,38,.22)" : "none" });

/* =========================================================================
   STEP EDITOR ROW (inside slide-over)
   ========================================================================= */
function MiniSelect({ value, onChange, options, disabled }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", height: 40, borderRadius: 9, border: "1px solid " + (f ? NAVY : LINE), background: disabled ? CREAM : SURFACE, padding: "0 30px 0 11px", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: disabled ? FAINT : INK, appearance: "none", WebkitAppearance: "none", cursor: disabled ? "not-allowed" : "pointer", outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}><Icon name="chevdown" size={14} /></span>
    </div>
  );
}

function StepEditor({ step, index, total, onChange, onMove, onRemove }) {
  const [userF, setUserF] = useState(false);
  return (
    <div className="ak-rise" style={{ background: CREAM, border: "1px solid " + LINE, borderRadius: 13, padding: "14px 14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: NAVY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, flex: "0 0 28px" }}>{index + 1}</span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: INK_SOFT, flex: 1 }}>Step {index + 1}</span>
        {/* reorder */}
        <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} style={moveBtn(index === 0)} title="Naik"><ArrowUp size={15} strokeWidth={1.7} /></button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} style={moveBtn(index === total - 1)} title="Turun"><ArrowDown size={15} strokeWidth={1.7} /></button>
        <button type="button" disabled={total <= 1} onClick={() => onRemove(step.id)} title="Hapus step"
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + (total <= 1 ? LINE : "rgba(220,38,38,.35)"), background: SURFACE, color: total <= 1 ? FAINT : DANGER, display: "flex", alignItems: "center", justifyContent: "center", cursor: total <= 1 ? "not-allowed" : "pointer", transition: "all .15s" }}>
          <Icon name="x" size={15} />
        </button>
      </div>

      {/* approver type */}
      <div style={{ marginBottom: 11 }}>
        <FieldLabel>Tipe Approver</FieldLabel>
        <Segmented full value={step.type} onChange={(v) => onChange(step.id, "type", v)}
          options={[{ value: "role", label: "Role", icon: "shield" }, { value: "user", label: "User", icon: "building2" }]} />
      </div>

      {/* role or user */}
      <div style={{ marginBottom: 12 }}>
        {step.type === "role" ? (
          <>
            <FieldLabel>Role</FieldLabel>
            <MiniSelect value={step.role || "manager"} onChange={(v) => onChange(step.id, "role", v)} options={APPR_ROLES} />
          </>
        ) : (
          <>
            <FieldLabel>Cari User</FieldLabel>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}><Icon name="search" size={15} /></span>
              <input value={step.user || ""} onChange={(e) => onChange(step.id, "user", e.target.value)} placeholder="Nama atau email…"
                onFocus={() => setUserF(true)} onBlur={() => setUserF(false)}
                style={{ width: "100%", height: 40, borderRadius: 9, border: "1px solid " + (userF ? NAVY : LINE), background: SURFACE, padding: "0 12px 0 34px", fontFamily: FONT_BODY, fontSize: 13, color: INK, outline: "none", boxShadow: userF ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
            </div>
          </>
        )}
      </div>

      {/* timeout + required */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 150px", minWidth: 130 }}>
          <FieldLabel>Timeout (jam)</FieldLabel>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}><Icon name="clock" size={15} /></span>
            <input value={step.timeout} onChange={(e) => onChange(step.id, "timeout", e.target.value.replace(/[^0-9]/g, ""))} placeholder="Opsional"
              style={{ width: "100%", height: 40, borderRadius: 9, border: "1px solid " + LINE, background: SURFACE, padding: "0 12px 0 34px", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: INK, outline: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 40 }}>
          <Toggle on={step.required} onChange={(v) => onChange(step.id, "required", v)} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: INK_SOFT }}>Wajib</span>
        </div>
      </div>
    </div>
  );
}
const moveBtn = (dis) => ({ width: 32, height: 32, borderRadius: 8, border: "1px solid " + LINE, background: SURFACE, color: dis ? FAINT : NAVY, display: "flex", alignItems: "center", justifyContent: "center", cursor: dis ? "not-allowed" : "pointer", transition: "all .15s" });
function FieldLabel({ children }) {
  return <div style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{children}</div>;
}

/* =========================================================================
   WORKFLOW SLIDE-OVER (add / edit)
   ========================================================================= */
let WF_STEP_SEQ = 100;
function WorkflowSlideOver({ open, draft, onClose, onSave }) {
  const [form, setForm] = useState(draft);
  useEffect(() => { if (open) setForm(draft); }, [open, draft && draft.id]);
  if (!form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setStep = (id, k, v) => setForm((f) => ({ ...f, steps: f.steps.map((s) => s.id === id ? { ...s, [k]: v } : s) }));
  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, { id: "n" + (++WF_STEP_SEQ), type: "role", role: "manager", user: "", timeout: "", required: true }] }));
  const removeStep = (id) => setForm((f) => f.steps.length > 1 ? { ...f, steps: f.steps.filter((s) => s.id !== id) } : f);
  const moveStep = (i, dir) => setForm((f) => {
    const j = i + dir; if (j < 0 || j >= f.steps.length) return f;
    const arr = f.steps.slice(); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; return { ...f, steps: arr };
  });

  return (
    <SlideOver open={open} onClose={onClose} width={520}
      title={draft && draft._isNew ? "Tambah Workflow" : "Edit Workflow"}
      subtitle="Konfigurasi rantai persetujuan dokumen"
      footer={<>
        <OutlineBtn onClick={onClose}>Batal</OutlineBtn>
        <PrimaryBtn icon="check" onClick={() => onSave(form)}>Simpan Workflow</PrimaryBtn>
      </>}>
      {/* meta */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <FloatingSelect full label="Tipe Dokumen" value={form.doc} onChange={(v) => set("doc", v)}
          options={Object.keys(WF_DOCS).map((d) => ({ value: d, label: WF_DOCS[d].full + " (" + WF_DOCS[d].label + ")" }))} />
        <FloatingInput full label="Nama Workflow" value={form.name} onChange={(v) => set("name", v)} placeholder="mis. Approval SP Standar" />
        <FloatingInput half label="Threshold Min" value={form.min} onChange={(v) => set("min", v.replace(/[^0-9]/g, ""))} mono placeholder="Rp" />
        <FloatingInput half label="Threshold Max" value={form.max} onChange={(v) => set("max", v.replace(/[^0-9]/g, ""))} mono placeholder="Rp" />
        <div style={{ flex: "1 1 100%", marginTop: -4, marginBottom: 2, display: "flex", alignItems: "center", gap: 7, color: FAINT, fontFamily: FONT_BODY, fontSize: 11.5 }}>
          <Icon name="info" size={13} color={FAINT} />Kosongkan untuk semua amount.
        </div>
        <div style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 11, background: CREAM, border: "1px solid " + LINE }}>
          <Toggle on={form.active} onChange={(v) => set("active", v)} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK_SOFT }}>Workflow Aktif</span>
        </div>
      </div>

      {/* steps */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 0 14px" }}>
        <SectionLabel>Langkah Persetujuan</SectionLabel>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600, color: FAINT }}>{form.steps.length} step</span>
      </div>
      {form.steps.map((s, i) => (
        <StepEditor key={s.id} step={s} index={i} total={form.steps.length} onChange={setStep} onMove={moveStep} onRemove={removeStep} />
      ))}
      <button type="button" onClick={addStep}
        style={{ width: "100%", height: 46, borderRadius: 11, border: "1.5px dashed " + NAVY, background: "transparent", color: NAVY, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background .2s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#EAF0F8")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <Icon name="plus" size={16} />Tambah Step
      </button>
    </SlideOver>
  );
}

/* =========================================================================
   TAB A — DOKUMEN BISNIS
   ========================================================================= */
function newWorkflow() {
  return { id: "new", _isNew: true, doc: "SP", name: "", min: "", max: "", active: true,
    steps: [{ id: "n" + (++WF_STEP_SEQ), type: "role", role: "manager", user: "", timeout: "", required: true }] };
}

function DokumenBisnisTab({ fireToast }) {
  const [workflows, setWorkflows] = useState(WF_SEED);
  const [filter, setFilter] = useState("Semua");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const shown = filter === "Semua" ? workflows : workflows.filter((w) => w.doc === filter);

  const toggle = (id) => setWorkflows((w) => w.map((x) => x.id === id ? { ...x, active: !x.active } : x));
  const del = (id) => { setWorkflows((w) => w.filter((x) => x.id !== id)); fireToast("Workflow dihapus", "trash"); };
  const openAdd = () => { setDraft(newWorkflow()); setOpen(true); };
  const openEdit = (wf) => { setDraft({ ...wf, steps: wf.steps.map((s) => ({ ...s })) }); setOpen(true); };
  const save = (form) => {
    setWorkflows((w) => {
      if (form._isNew || form.id === "new") {
        const rest = { ...form }; delete rest._isNew;
        return [...w, { ...rest, id: "wf" + Date.now() }];
      }
      return w.map((x) => x.id === form.id ? { ...form } : x);
    });
    setOpen(false);
    fireToast("Workflow \"" + (form.name || "Tanpa nama") + "\" disimpan");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <SectionLabel>Workflow Persetujuan Dokumen</SectionLabel>
        </div>
        <PrimaryBtn icon="plus" onClick={openAdd}>Tambah Workflow</PrimaryBtn>
      </div>

      <InfoBanner>Workflow aktif akan otomatis digunakan saat dokumen dibuat. <strong style={{ color: NAVY }}>Threshold amount</strong> menentukan workflow mana yang berlaku.</InfoBanner>

      {/* filter pills */}
      <div className="ak-scroll" style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 6, marginBottom: 20 }}>
        {DOC_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button key={f} type="button" onClick={() => setFilter(f)}
              style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 20, border: "1.5px solid " + (active ? NAVY : LINE), background: active ? NAVY : SURFACE, color: active ? "#fff" : INK_SOFT, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .18s", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = CREAM; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = SURFACE; }}>
              {f}
              {f !== "Semua" && (
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: active ? "rgba(255,255,255,.7)" : FAINT }}>
                  {workflows.filter((w) => w.doc === f).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* cards */}
      {shown.length === 0 ? (
        <WfEmptyState filter={filter} onAdd={openAdd} />
      ) : (
        <div key={filter} className="ak-rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {shown.map((wf) => (
            <WorkflowCard key={wf.id} wf={wf} onToggle={toggle} onEdit={openEdit} onDelete={del} />
          ))}
        </div>
      )}

      <WorkflowSlideOver open={open} draft={draft} onClose={() => setOpen(false)} onSave={save} />
    </div>
  );
}

function WfEmptyState({ filter, onAdd }) {
  return (
    <div className="ak-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "56px 24px", background: SURFACE, border: "1px dashed " + LINE, borderRadius: 16 }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Icon name="gitbranch" size={28} />
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: NAVY }}>Belum ada workflow {filter !== "Semua" ? "untuk " + filter : ""}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED, marginTop: 6, maxWidth: 340, textWrap: "pretty" }}>Buat rantai persetujuan agar dokumen otomatis mengikuti alur approval yang sesuai.</div>
      <div style={{ marginTop: 20 }}><PrimaryBtn icon="plus" onClick={onAdd}>Tambah Workflow</PrimaryBtn></div>
    </div>
  );
}

/* =========================================================================
   TAB B — HRGA REQUEST APPROVER MATRIX
   ========================================================================= */
const HRGA_CATS = [
  { code: "ADM", name: "Administrasi", types: [
    { code: "SKK", name: "Surat Keterangan Kerja",       levels: 1 },
    { code: "SKP", name: "Surat Keterangan Penghasilan",  levels: 1 },
    { code: "SKR", name: "Surat Keterangan Resign",       levels: 1 },
    { code: "SLIP", name: "Slip Gaji",                    levels: 1 },
    { code: "LEG", name: "Legalisir Dokumen",             levels: 1 },
  ]},
  { code: "AST", name: "Aset & Perlengkapan", types: [
    { code: "ATK", name: "Alat Tulis Kantor",     levels: 2 },
    { code: "UNF", name: "Seragam Kerja",          levels: 1 },
    { code: "CARD", name: "Kartu Akses / ID Card", levels: 1 },
    { code: "LAPP", name: "Laptop / Perangkat",    levels: 2 },
    { code: "VHCL", name: "Kendaraan Operasional", levels: 1 },
    { code: "SIM", name: "Kartu SIM / Pulsa",      levels: 2 },
  ]},
  { code: "FAC", name: "Fasilitas", types: [
    { code: "ACC", name: "Akomodasi",            levels: 2 },
    { code: "MEET", name: "Ruang Meeting",       levels: 1 },
    { code: "REP", name: "Perbaikan Fasilitas",  levels: 2 },
  ]},
  { code: "FIN", name: "Keuangan", types: [
    { code: "ROPS", name: "Reimburse Operasional", levels: 3 },
    { code: "RMED", name: "Reimburse Medis",       levels: 3 },
    { code: "CASH", name: "Cash Advance",          levels: 2 },
  ]},
  { code: "OFF", name: "Offboarding", types: [
    { code: "EXIT", name: "Exit Clearance", levels: 3 },
  ]},
  { code: "TRV", name: "Perjalanan", types: [
    { code: "TRIP", name: "Perjalanan Dinas",     levels: 3 },
    { code: "REIM", name: "Reimburse Perjalanan", levels: 3 },
  ]},
];

function defaultRows() {
  const out = {};
  HRGA_CATS.forEach((cat) => {
    out[cat.code] = cat.types.map((t) => ({
      ...t,
      l1: "hrga",
      l2: t.levels >= 2 ? "manager" : "",
      l3: t.levels >= 3 ? "ceo" : "",
      active: true,
    }));
  });
  return out;
}

const hThStyle = { padding: "11px 14px", textAlign: "left", fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: MUTED, whiteSpace: "nowrap" };
const hTdStyle = { padding: "10px 14px", borderBottom: "1px solid " + LINE_SOFT, verticalAlign: "middle" };

function HrgaRow({ row, zebra, onChange }) {
  const [hover, setHover] = useState(false);
  return (
    <tr onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: hover ? ROW_HOVER : zebra ? "rgba(246,239,227,.5)" : SURFACE, transition: "background .15s" }}>
      <td style={hTdStyle}>
        <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>{row.name}</span>
      </td>
      <td style={hTdStyle}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: NAVY, letterSpacing: 0.4 }}>{row.code}</span>
      </td>
      <td style={{ ...hTdStyle, textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 24, padding: "0 8px", borderRadius: 7, background: "#EAF0F8", color: NAVY, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700 }}>{row.levels}</span>
      </td>
      <td style={{ ...hTdStyle, minWidth: 150 }}><MiniSelect value={row.l1} onChange={(v) => onChange(row.code, "l1", v)} options={HRGA_ROLES} /></td>
      <td style={{ ...hTdStyle, minWidth: 150 }}>
        {row.levels >= 2 ? <MiniSelect value={row.l2 || "manager"} onChange={(v) => onChange(row.code, "l2", v)} options={HRGA_ROLES} /> : <DisabledCell />}
      </td>
      <td style={{ ...hTdStyle, minWidth: 150 }}>
        {row.levels >= 3 ? <MiniSelect value={row.l3 || "ceo"} onChange={(v) => onChange(row.code, "l3", v)} options={HRGA_ROLES} /> : <DisabledCell />}
      </td>
      <td style={{ ...hTdStyle, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Toggle on={row.active} onChange={(v) => onChange(row.code, "active", v)} /></div>
      </td>
    </tr>
  );
}
function DisabledCell() {
  return (
    <div style={{ height: 40, borderRadius: 9, border: "1px dashed " + LINE, background: "rgba(229,224,216,.35)", display: "flex", alignItems: "center", justifyContent: "center", color: FAINT, fontFamily: FONT_BODY, fontSize: 12 }}>
      Tidak ada
    </div>
  );
}

function CategoryAccordion({ cat, rows, open, onToggle, onChange, fireToast }) {
  const activeCount = rows.filter((r) => r.active).length;
  return (
    <div style={{ background: SURFACE, border: "1px solid " + (open ? "#C9D8EC" : LINE), borderRadius: 14, overflow: "hidden", transition: "border-color .2s" }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "15px 18px", background: open ? "rgba(20,70,130,.03)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background .2s" }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}><Icon name="clipboard" size={19} /></span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: NAVY }}>{cat.name}</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 6, border: "1.5px solid " + NAVY, color: NAVY, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>{cat.code}</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 11, background: CREAM, border: "1px solid " + LINE_SOFT, color: MUTED, fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600 }}>{cat.types.length} jenis · {activeCount} aktif</span>
        </div>
        <span style={{ display: "inline-flex", color: MUTED, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .3s cubic-bezier(.22,1,.36,1)" }}><Icon name="chevdown" size={20} /></span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows .35s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ borderTop: "1px solid " + LINE_SOFT }}>
            <div className="ak-scroll" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                <thead>
                  <tr style={{ background: CREAM }}>
                    <th style={hThStyle}>Jenis Request</th>
                    <th style={hThStyle}>Kode</th>
                    <th style={{ ...hThStyle, textAlign: "center" }}>Level</th>
                    <th style={hThStyle}>Approver Level 1</th>
                    <th style={hThStyle}>Approver Level 2</th>
                    <th style={hThStyle}>Approver Level 3</th>
                    <th style={{ ...hThStyle, textAlign: "center" }}>Aktif</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => <HrgaRow key={r.code} row={r} zebra={i % 2 === 1} onChange={onChange} />)}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 18px", borderTop: "1px solid " + LINE_SOFT }}>
              <SaveButton label="Simpan Semua" variant="primary" onSave={() => fireToast("Approver " + cat.name + " disimpan")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HrgaRequestTab({ fireToast }) {
  const [data, setData] = useState(defaultRows);
  const [open, setOpen] = useState(() => HRGA_CATS.reduce((a, c) => ({ ...a, [c.code]: true }), {}));

  const change = (catCode) => (rowCode, key, val) =>
    setData((d) => ({ ...d, [catCode]: d[catCode].map((r) => r.code === rowCode ? { ...r, [key]: val } : r) }));

  return (
    <div>
      <SectionLabel style={{ marginBottom: 14 }}>Konfigurasi Approver HRGA</SectionLabel>
      <InfoBanner>Approver dikonfigurasi per jenis request HRGA. <strong style={{ color: NAVY }}>Urutan level</strong> menentukan urutan persetujuan.</InfoBanner>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {HRGA_CATS.map((cat) => (
          <CategoryAccordion key={cat.code} cat={cat} rows={data[cat.code]}
            open={!!open[cat.code]} onToggle={() => setOpen((o) => ({ ...o, [cat.code]: !o[cat.code] }))}
            onChange={change(cat.code)} fireToast={fireToast} />
        ))}
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE SHELL
   ========================================================================= */
function WfSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", gap: 9, marginBottom: 20 }}>{[60, 60, 80, 90, 60].map((w, i) => <Skel key={i} w={w} h={36} r={20} />)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ background: SURFACE, border: "1px solid " + LINE, borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}><Skel w={54} h={26} r={8} /><Skel w={150} h={16} /><span style={{ flex: 1 }} /><Skel w={44} h={24} r={20} /></div>
            <Skel w={160} h={30} r={8} style={{ marginBottom: 18 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{[0, 1].map((j) => <div key={j} style={{ display: "flex", gap: 12, alignItems: "center" }}><Skel w={30} h={30} r={15} /><Skel w={180} h={14} /></div>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ApprovalWorkflowsPage({ onHome }) {
  const [entity, setEntity] = useState("MSI");
  const [tab, setTab] = useState("dokumen");
  const [fade, setFade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fireToast, toastNode] = useToast();

  useEffect(() => { const t = setTimeout(() => setLoading(false), 750); return () => clearTimeout(t); }, []);
  function switchEntity(id) { if (id === entity) return; setFade(true); setTimeout(() => { setEntity(id); setFade(false); }, 200); }

  const tabs = [
    { id: "dokumen", label: "Dokumen Bisnis", icon: "gitbranch" },
    { id: "hrga", label: "HRGA Request", icon: "clipboard" },
  ];

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Approval Workflows" }]}
        title="Approval Workflows"
        subtitle="Konfigurasi rantai persetujuan per jenis dokumen & HRGA request"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {loading ? <WfSkeleton /> : (
        <div key={entity + tab} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "ak-rise"}>
          {tab === "dokumen" && <DokumenBisnisTab fireToast={fireToast} />}
          {tab === "hrga" && <HrgaRequestTab fireToast={fireToast} />}
        </div>
      )}
      {toastNode}
    </div>
  );
}
