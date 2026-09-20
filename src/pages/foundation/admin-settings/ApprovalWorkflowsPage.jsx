/* =========================================================================
   ApprovalWorkflowsPage — Nexus by MSI · Admin Settings › Approval Workflows
   Entity switcher + 2 tabs:
     A. Dokumen Bisnis — workflow cards (numbered approval steps, threshold,
        slide-over editor with reorderable steps)
     B. HRGA Request   — approver matrix grouped by category (accordion)
   Data layer: Supabase (approval_workflows + approval_workflow_steps,
   hrga_request_types + hrga_approval_configs).
   Note: glyphs not in kit's Icon registry (user, arrow up/down) are pulled
   directly from lucide-react — kit.jsx is not modified.
   ========================================================================= */

import { useState, useEffect } from "react";
import { User, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "../../../lib/supabase";

import { Button, EntitySwitcher, FloatingInput, FloatingSelect, Icon, OutlineBtn, PageHeader, PrimaryBtn, SaveButton, SectionLabel, Segmented, Skel, SlideOver, Tabs, Toggle, useToast } from '../../../kit';
import { CARD, ACCENT, ACCENT_HOVER, LINE, INK, INK_SOFT, LINE_SOFT, HEAD_BG, ROW_HOVER, INPUT_BG, DISABLED_BG, DISABLED_INK, FOCUS_RING, SHADOW_1, FONT_HEAD, FONT_BODY, FONT_MONO, SEMANTIC, fmtRp } from '../../../kit/tokens';
import { ENTITIES } from '../../../lib/entities';
/* ---------- entity code → companies.id ---------- */
const ENTITY_IDS = Object.fromEntries(ENTITIES.map((e) => [e.code, e.id]));

/* ---------- approval_workflows (+ steps) row → UI workflow ---------- */
function wfToUi(row) {
  const steps = (row.approval_workflow_steps || [])
    .slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0))
    .map((s) => ({
      id: s.id,
      type: s.approver_type || "role",
      role: s.approver_role || "manager",
      user: s.approver_user_id || "",
      timeout: s.timeout_hours == null ? "" : s.timeout_hours,
      required: !!s.is_required,
    }));
  return {
    id: row.id,
    doc: row.document_type,
    name: row.name || "",
    min: row.amount_threshold_min == null ? "" : String(row.amount_threshold_min),
    max: row.amount_threshold_max == null ? "" : String(row.amount_threshold_max),
    active: !!row.is_active,
    steps,
  };
}

/* ---------- shared error state (fetch failed) ---------- */
function ErrorState({ msg, onRetry }) {
  return (
    <div style={{ background: CARD, border: "1px solid " + LINE, borderRadius: 16, textAlign: "center", padding: "48px 32px" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: SEMANTIC.danger.bg, border: "1px solid " + SEMANTIC.danger.bd, display: "flex", alignItems: "center", justifyContent: "center", color: SEMANTIC.danger.fg, margin: "0 auto 18px" }}><Icon name="alert" size={30} /></div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: INK }}>Gagal memuat data</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: INK_SOFT, maxWidth: 420, margin: "8px auto 22px", lineHeight: 1.55, textWrap: "pretty" }}>{msg || "Terjadi kesalahan saat mengambil data. Coba lagi."}</div>
      <div style={{ display: "flex", justifyContent: "center" }}><OutlineBtn icon="refresh" onClick={onRetry}>Coba Lagi</OutlineBtn></div>
    </div>
  );
}
function CardsSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: CARD, border: "1px solid " + LINE, borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}><Skel w={54} h={26} r={8} /><Skel w={150} h={16} /><span style={{ flex: 1 }} /><Skel w={44} h={24} r={20} /></div>
          <Skel w={160} h={30} r={8} style={{ marginBottom: 18 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{[0, 1].map((j) => <div key={j} style={{ display: "flex", gap: 12, alignItems: "center" }}><Skel w={30} h={30} r={15} /><Skel w={180} h={14} /></div>)}</div>
        </div>
      ))}
    </div>
  );
}
function HrgaSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: CARD, border: "1px solid " + LINE, borderRadius: 14, padding: "15px 18px", display: "flex", alignItems: "center", gap: 13 }}>
          <Skel w={38} h={38} r={10} /><Skel w={160} h={16} /><span style={{ flex: 1 }} /><Skel w={90} h={20} r={11} />
        </div>
      ))}
    </div>
  );
}

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
  SP:        { label: "SP",        full: "Surat Penawaran" },
  Invoice:   { label: "Invoice",   full: "Invoice" },
  Quotation: { label: "Quotation", full: "Quotation" },
  PO:        { label: "PO",        full: "Purchase Order" },
};
const DOC_FILTERS = ["Semua", "SP", "Invoice", "Quotation", "PO"];

/* ---------- info banner ---------- */
function InfoBanner({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 20, background: SEMANTIC.info.bg, border: "1px solid " + SEMANTIC.info.bd, borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ flex: "0 0 auto", marginTop: 1 }}><Icon name="info" size={17} color={INK} /></span>
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
    <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 11px", borderRadius: 8, border: "1.5px solid " + INK, color: INK, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, background: CARD }}>
      {WF_DOCS[doc] ? WF_DOCS[doc].label : doc}
    </span>
  );
}
function ApproverTypeBadge({ type }) {
  const isRole = type === "role";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 6, background: isRole ? SEMANTIC.info.bg : SEMANTIC.warn.bg, color: isRole ? SEMANTIC.info.fg : SEMANTIC.warn.fg, border: "1px solid " + (isRole ? SEMANTIC.info.bd : SEMANTIC.warn.bd), fontFamily: FONT_HEAD, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
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
      style={{ background: CARD, border: "1px solid " + (hover ? ACCENT_HOVER : LINE), borderRadius: 14, overflow: "hidden", transition: "border-color .2s, box-shadow .2s", boxShadow: hover ? SHADOW_1 : "none", opacity: wf.active ? 1 : 0.82 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "18px 20px 14px" }}>
        <DocBadge doc={wf.doc} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15.5, fontWeight: 600, color: INK, letterSpacing: -0.2 }}>{wf.name}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: INK_SOFT, marginTop: 2 }}>{meta.full} · {wf.steps.length} langkah</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: wf.active ? SEMANTIC.ok.fg : INK_SOFT }}>{wf.active ? "Aktif" : "Nonaktif"}</span>
          <Toggle on={wf.active} onChange={() => onToggle(wf.id)} />
        </div>
      </div>

      {/* threshold */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 20px 16px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 12px", borderRadius: 8, background: HEAD_BG, border: "1px solid " + LINE_SOFT }}>
          <Icon name="coins" size={14} color={INK_SOFT} />
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
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: ACCENT, color: INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, flex: "0 0 30px", boxShadow: "none" }}>{i + 1}</span>
                  {!last && <span style={{ flex: 1, width: 0, borderLeft: "2px dashed " + LINE, margin: "4px 0", minHeight: 22 }} />}
                </div>
                {/* detail */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 16 : 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <ApproverTypeBadge type={s.type} />
                    <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>{s.type === "role" ? roleLabel(s.role) : (s.user || "—")}</span>
                    {s.required && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: SEMANTIC.warn.fg }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: SEMANTIC.warn.fg }} />Wajib
                      </span>
                    )}
                    {s.timeout !== "" && s.timeout != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 6, background: HEAD_BG, color: INK_SOFT, fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600 }}>
                        <Icon name="clock" size={12} color={INK_SOFT} />{s.timeout}h
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
      <div style={{ padding: "12px 20px 16px", borderTop: "1px solid " + LINE_SOFT, background: confirm ? SEMANTIC.danger.bg : "transparent", transition: "background .2s" }}>
        {confirm ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: SEMANTIC.danger.fg, flex: 1, minWidth: 160 }}>
              <Icon name="alert" size={16} />Hapus workflow ini?
            </span>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Batal</Button>
            <Button variant="danger" size="sm" icon="trash" onClick={() => onDelete(wf.id)}>Ya, hapus</Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="outline" size="sm" icon="pencil" onClick={() => onEdit(wf)}>Edit Workflow</Button>
            <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirm(true)}>Hapus</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   STEP EDITOR ROW (inside slide-over)
   ========================================================================= */
function MiniSelect({ value, onChange, options, disabled }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", height: 40, borderRadius: 9, border: "1px solid " + (f ? INK_SOFT : LINE), background: disabled ? DISABLED_BG : INPUT_BG, padding: "0 30px 0 11px", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: disabled ? DISABLED_INK : INK, appearance: "none", WebkitAppearance: "none", cursor: disabled ? "not-allowed" : "pointer", outline: "none", boxShadow: f ? FOCUS_RING : "none", transition: "border-color .2s, box-shadow .2s" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: INK_SOFT, pointerEvents: "none" }}><Icon name="chevdown" size={14} /></span>
    </div>
  );
}

function StepEditor({ step, index, total, onChange, onMove, onRemove }) {
  const [userF, setUserF] = useState(false);
  return (
    <div className="nk-rise" style={{ background: HEAD_BG, border: "1px solid " + LINE, borderRadius: 13, padding: "14px 14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: ACCENT, color: INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, flex: "0 0 28px" }}>{index + 1}</span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: INK_SOFT, flex: 1 }}>Step {index + 1}</span>
        {/* reorder */}
        <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} style={moveBtn(index === 0)} title="Naik"><ArrowUp size={15} strokeWidth={1.7} /></button>
        <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)} style={moveBtn(index === total - 1)} title="Turun"><ArrowDown size={15} strokeWidth={1.7} /></button>
        <button type="button" disabled={total <= 1} onClick={() => onRemove(step.id)} title="Hapus step"
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + (total <= 1 ? LINE : SEMANTIC.danger.bd), background: INPUT_BG, color: total <= 1 ? INK_SOFT : SEMANTIC.danger.fg, display: "flex", alignItems: "center", justifyContent: "center", cursor: total <= 1 ? "not-allowed" : "pointer", transition: "all .15s" }}>
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
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: INK_SOFT, pointerEvents: "none" }}><Icon name="search" size={15} /></span>
              <input value={step.user || ""} onChange={(e) => onChange(step.id, "user", e.target.value)} placeholder="Nama atau email…"
                onFocus={() => setUserF(true)} onBlur={() => setUserF(false)}
                style={{ width: "100%", height: 40, borderRadius: 9, border: "1px solid " + (userF ? INK_SOFT : LINE), background: INPUT_BG, padding: "0 12px 0 34px", fontFamily: FONT_BODY, fontSize: 13, color: INK, outline: "none", boxShadow: userF ? FOCUS_RING : "none", transition: "border-color .2s, box-shadow .2s" }} />
            </div>
          </>
        )}
      </div>

      {/* timeout + required */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 150px", minWidth: 130 }}>
          <FieldLabel>Timeout (jam)</FieldLabel>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: INK_SOFT, pointerEvents: "none" }}><Icon name="clock" size={15} /></span>
            <input value={step.timeout} onChange={(e) => onChange(step.id, "timeout", e.target.value.replace(/[^0-9]/g, ""))} placeholder="Opsional"
              style={{ width: "100%", height: 40, borderRadius: 9, border: "1px solid " + LINE, background: INPUT_BG, padding: "0 12px 0 34px", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: INK, outline: "none" }} />
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
const moveBtn = (dis) => ({ width: 32, height: 32, borderRadius: 8, border: "1px solid " + LINE, background: INPUT_BG, color: dis ? INK_SOFT : INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: dis ? "not-allowed" : "pointer", transition: "all .15s" });
function FieldLabel({ children }) {
  return <div style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT, marginBottom: 6 }}>{children}</div>;
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
        <SaveButton label="Simpan Workflow" onSave={() => onSave(form)} />
      </>}>
      {/* meta */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <FloatingSelect full label="Tipe Dokumen" value={form.doc} onChange={(v) => set("doc", v)}
          options={Object.keys(WF_DOCS).map((d) => ({ value: d, label: WF_DOCS[d].full + " (" + WF_DOCS[d].label + ")" }))} />
        <FloatingInput full label="Nama Workflow" value={form.name} onChange={(v) => set("name", v)} placeholder="mis. Approval SP Standar" />
        <FloatingInput half label="Threshold Min" value={form.min} onChange={(v) => set("min", v.replace(/[^0-9]/g, ""))} mono placeholder="Rp" />
        <FloatingInput half label="Threshold Max" value={form.max} onChange={(v) => set("max", v.replace(/[^0-9]/g, ""))} mono placeholder="Rp" />
        <div style={{ flex: "1 1 100%", marginTop: -4, marginBottom: 2, display: "flex", alignItems: "center", gap: 7, color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 11.5 }}>
          <Icon name="info" size={13} color={INK_SOFT} />Kosongkan untuk semua amount.
        </div>
        <div style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 11, background: HEAD_BG, border: "1px solid " + LINE }}>
          <Toggle on={form.active} onChange={(v) => set("active", v)} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK_SOFT }}>Workflow Aktif</span>
        </div>
      </div>

      {/* steps */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 0 14px" }}>
        <SectionLabel>Langkah Persetujuan</SectionLabel>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600, color: INK_SOFT }}>{form.steps.length} step</span>
      </div>
      {form.steps.map((s, i) => (
        <StepEditor key={s.id} step={s} index={i} total={form.steps.length} onChange={setStep} onMove={moveStep} onRemove={removeStep} />
      ))}
      <button type="button" onClick={addStep}
        style={{ width: "100%", height: 46, borderRadius: 11, border: "1.5px dashed " + INK, background: "transparent", color: INK, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background .2s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
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

function DokumenBisnisTab({ entity, fireToast }) {
  const [workflows, setWorkflows] = useState([]);
  const [filter, setFilter] = useState("Semua");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [errMsg, setErrMsg] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    supabase.from("approval_workflows")
      .select("*, approval_workflow_steps(*)")
      .eq("company_id", ENTITY_IDS[entity])
      .order("document_type", { ascending: true })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setErrMsg(error.message); setState("error"); return; }
        setWorkflows((data || []).map(wfToUi)); setState("ready");
      });
    return () => { cancelled = true; };
  }, [entity, reload]);

  const refetch = () => setReload((n) => n + 1);
  const shown = filter === "Semua" ? workflows : workflows.filter((w) => w.doc === filter);

  const toggle = async (id) => {
    const wf = workflows.find((x) => x.id === id);
    if (!wf) return;
    const { error } = await supabase.from("approval_workflows").update({ is_active: !wf.active }).eq("id", id);
    if (error) { fireToast("Gagal memperbarui: " + error.message, "alert"); return; }
    refetch();
  };
  const del = async (id) => {
    const { error } = await supabase.from("approval_workflows").delete().eq("id", id);
    if (error) { fireToast("Gagal menghapus: " + error.message, "alert"); return; }
    fireToast("Workflow dihapus", "trash"); refetch();
  };
  const openAdd = () => { setDraft(newWorkflow()); setOpen(true); };
  const openEdit = (wf) => { setDraft({ ...wf, steps: wf.steps.map((s) => ({ ...s })) }); setOpen(true); };
  const save = async (form) => {
    try {
      const wfPayload = {
        company_id: ENTITY_IDS[entity],
        document_type: form.doc,
        name: form.name || "",
        amount_threshold_min: form.min === "" || form.min == null ? null : Number(form.min),
        amount_threshold_max: form.max === "" || form.max == null ? null : Number(form.max),
        is_active: !!form.active,
      };
      let wfId = form.id;
      if (form._isNew || form.id === "new") {
        const { data: ins, error } = await supabase.from("approval_workflows").insert(wfPayload).select().single();
        if (error) throw error;
        wfId = ins.id;
      } else {
        const { error } = await supabase.from("approval_workflows").update(wfPayload).eq("id", wfId);
        if (error) throw error;
        const { error: delErr } = await supabase.from("approval_workflow_steps").delete().eq("workflow_id", wfId);
        if (delErr) throw delErr;
      }
      const stepsPayload = form.steps.map((s, i) => ({
        workflow_id: wfId,
        step_order: i + 1,
        approver_type: s.type,
        approver_role: s.type === "role" ? (s.role || null) : null,
        approver_user_id: s.type === "user" ? (s.user || null) : null,
        is_required: !!s.required,
        timeout_hours: s.timeout === "" || s.timeout == null ? null : Number(s.timeout),
      }));
      if (stepsPayload.length) {
        const { error: stErr } = await supabase.from("approval_workflow_steps").insert(stepsPayload);
        if (stErr) throw stErr;
      }
      setOpen(false);
      fireToast("Workflow \"" + (form.name || "Tanpa nama") + "\" disimpan");
      refetch();
    } catch (e) {
      fireToast("Gagal menyimpan: " + e.message, "alert");
      return { error: e }; // SaveButton kit: keadaan GAGAL, bukan "Tersimpan!"
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <SectionLabel>Workflow Persetujuan Dokumen</SectionLabel>
        </div>
        <PrimaryBtn icon="plus" onClick={openAdd}>Tambah Workflow</PrimaryBtn>
      </div>

      <InfoBanner>Workflow aktif akan otomatis digunakan saat dokumen dibuat. <strong style={{ color: INK }}>Threshold amount</strong> menentukan workflow mana yang berlaku.</InfoBanner>

      {/* filter pills */}
      <div className="nk-scroll" style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 6, marginBottom: 20 }}>
        {DOC_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button key={f} type="button" onClick={() => setFilter(f)}
              style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 20, border: "1.5px solid " + (active ? ACCENT_HOVER : LINE), background: active ? ACCENT : INPUT_BG, color: INK, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .18s", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = HEAD_BG; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = INPUT_BG; }}>
              {f}
              {f !== "Semua" && (
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: INK_SOFT }}>
                  {workflows.filter((w) => w.doc === f).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* cards */}
      {state === "loading" ? (
        <CardsSkeleton />
      ) : state === "error" ? (
        <ErrorState msg={errMsg} onRetry={refetch} />
      ) : shown.length === 0 ? (
        <WfEmptyState filter={filter} onAdd={openAdd} />
      ) : (
        <div key={filter} className="nk-rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
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
    <div className="nk-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "56px 24px", background: CARD, border: "1px dashed " + LINE, borderRadius: 16 }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: ACCENT, color: INK, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Icon name="gitbranch" size={28} />
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: INK }}>Belum ada workflow {filter !== "Semua" ? "untuk " + filter : ""}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT, marginTop: 6, maxWidth: 340, textWrap: "pretty" }}>Buat rantai persetujuan agar dokumen otomatis mengikuti alur approval yang sesuai.</div>
      <div style={{ marginTop: 20 }}><PrimaryBtn icon="plus" onClick={onAdd}>Tambah Workflow</PrimaryBtn></div>
    </div>
  );
}

/* =========================================================================
   TAB B — HRGA REQUEST APPROVER MATRIX
   ========================================================================= */
const hThStyle = { padding: "11px 14px", textAlign: "left", fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: INK_SOFT, whiteSpace: "nowrap" };
const hTdStyle = { padding: "10px 14px", borderBottom: "1px solid " + LINE_SOFT, verticalAlign: "middle" };

function HrgaRow({ row, zebra, onChange }) {
  const [hover, setHover] = useState(false);
  return (
    <tr onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: hover ? ROW_HOVER : zebra ? HEAD_BG : CARD, transition: "background .15s" }}>
      <td style={hTdStyle}>
        <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>{row.name}</span>
      </td>
      <td style={hTdStyle}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: INK, letterSpacing: 0.4 }}>{row.code}</span>
      </td>
      <td style={{ ...hTdStyle, textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 24, padding: "0 8px", borderRadius: 7, background: ACCENT, color: INK, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700 }}>{row.levels}</span>
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
    <div style={{ height: 40, borderRadius: 9, border: "1px dashed " + LINE, background: DISABLED_BG, display: "flex", alignItems: "center", justifyContent: "center", color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 12 }}>
      Tidak ada
    </div>
  );
}

function CategoryAccordion({ cat, rows, open, onToggle, onChange, onSave }) {
  const activeCount = rows.filter((r) => r.active).length;
  return (
    <div style={{ background: CARD, border: "1px solid " + (open ? ACCENT_HOVER : LINE), borderRadius: 14, overflow: "hidden", transition: "border-color .2s" }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "15px 18px", background: open ? ROW_HOVER : "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background .2s" }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: ACCENT, color: INK, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}><Icon name="clipboard" size={19} /></span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: INK }}>{cat.name}</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 6, border: "1.5px solid " + INK, color: INK, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>{cat.code}</span>
          <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 9px", borderRadius: 11, background: HEAD_BG, border: "1px solid " + LINE_SOFT, color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600 }}>{cat.types.length} jenis · {activeCount} aktif</span>
        </div>
        <span style={{ display: "inline-flex", color: INK_SOFT, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .3s cubic-bezier(.22,1,.36,1)" }}><Icon name="chevdown" size={20} /></span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows .35s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ borderTop: "1px solid " + LINE_SOFT }}>
            <div className="nk-scroll" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                <thead>
                  <tr style={{ background: HEAD_BG }}>
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
              <SaveButton label="Simpan Semua" variant="primary" onSave={onSave} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HrgaRequestTab({ entity, fireToast }) {
  const [cats, setCats] = useState([]);   // [{ code, name, types: [request_type rows] }]
  const [data, setData] = useState({});   // { catCode: [{ id, code, name, levels, l1, l2, l3, active }] }
  const [open, setOpen] = useState({});
  const [state, setState] = useState("loading"); // loading | ready | error
  const [errMsg, setErrMsg] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    Promise.all([
      supabase.from("hrga_request_types").select("*").eq("company_id", ENTITY_IDS[entity]).is("deleted_at", null).order("category_code", { ascending: true }).order("sort_order", { ascending: true }).limit(1000),
      supabase.from("hrga_approval_configs").select("*").eq("company_id", ENTITY_IDS[entity]).eq("is_active", true).limit(1000),
    ]).then(([typesRes, cfgRes]) => {
      if (cancelled) return;
      if (typesRes.error) { setErrMsg(typesRes.error.message); setState("error"); return; }
      if (cfgRes.error) { setErrMsg(cfgRes.error.message); setState("error"); return; }
      const cfgByKey = {};
      (cfgRes.data || []).forEach((c) => { cfgByKey[c.request_type_id + ":" + c.level] = c; });
      const catMap = {}; const order = [];
      (typesRes.data || []).forEach((t) => {
        if (!catMap[t.category_code]) { catMap[t.category_code] = { code: t.category_code, name: t.category_name, types: [] }; order.push(t.category_code); }
        catMap[t.category_code].types.push(t);
      });
      const nextCats = order.map((c) => catMap[c]);
      const nextData = {};
      nextCats.forEach((cat) => {
        nextData[cat.code] = cat.types.map((t) => {
          const lv = t.approval_levels || 1;
          const c1 = cfgByKey[t.id + ":1"], c2 = cfgByKey[t.id + ":2"], c3 = cfgByKey[t.id + ":3"];
          return {
            id: t.id, code: t.type_code, name: t.type_name, levels: lv,
            l1: c1 ? c1.approver_role : "hrga",
            l2: lv >= 2 ? (c2 ? c2.approver_role : "manager") : "",
            l3: lv >= 3 ? (c3 ? c3.approver_role : "ceo") : "",
            active: true,
          };
        });
      });
      setCats(nextCats); setData(nextData); setState("ready");
    });
    return () => { cancelled = true; };
  }, [entity, reload]);

  const refetch = () => setReload((n) => n + 1);
  const change = (catCode) => (rowCode, key, val) =>
    setData((d) => ({ ...d, [catCode]: d[catCode].map((r) => r.code === rowCode ? { ...r, [key]: val } : r) }));

  const saveCategory = (catCode) => async () => {
    const rows = data[catCode] || [];
    const payload = [];
    rows.forEach((r) => {
      for (let lv = 1; lv <= (r.levels || 1); lv++) {
        const role = r["l" + lv];
        if (role) payload.push({ company_id: ENTITY_IDS[entity], request_type_id: r.id, level: lv, approver_role: role, is_active: r.active !== false });
      }
    });
    const cat = cats.find((c) => c.code === catCode);
    if (!payload.length) { fireToast("Tidak ada approver untuk disimpan", "alert"); return false; } // false = SaveButton kembali idle tanpa "Tersimpan!"
    const { error } = await supabase.from("hrga_approval_configs").upsert(payload, { onConflict: "request_type_id,level" });
    if (error) { fireToast("Gagal menyimpan: " + error.message, "alert"); return { error }; } // SaveButton kit: keadaan GAGAL
    fireToast("Approver " + (cat ? cat.name : catCode) + " disimpan");
    refetch();
  };

  if (state === "loading") return <HrgaSkeleton />;
  if (state === "error") return <ErrorState msg={errMsg} onRetry={refetch} />;

  return (
    <div>
      <SectionLabel style={{ marginBottom: 14 }}>Konfigurasi Approver HRGA</SectionLabel>
      <InfoBanner>Approver dikonfigurasi per jenis request HRGA. <strong style={{ color: INK }}>Urutan level</strong> menentukan urutan persetujuan.</InfoBanner>
      {cats.length === 0 ? (
        <div style={{ background: CARD, border: "1px dashed " + LINE, borderRadius: 16, textAlign: "center", padding: "48px 32px" }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: ACCENT, color: INK, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="clipboard" size={28} /></div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: INK }}>Belum ada jenis request HRGA</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT, marginTop: 6, maxWidth: 340, margin: "6px auto 0", textWrap: "pretty" }}>Jenis request HRGA untuk entitas ini belum dikonfigurasi.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cats.map((cat) => (
            <CategoryAccordion key={cat.code} cat={cat} rows={data[cat.code] || []}
              open={open[cat.code] ?? true} onToggle={() => setOpen((o) => ({ ...o, [cat.code]: !(o[cat.code] ?? true) }))}
              onChange={change(cat.code)} onSave={saveCategory(cat.code)} />
          ))}
        </div>
      )}
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
          <div key={i} style={{ background: CARD, border: "1px solid " + LINE, borderRadius: 16, padding: 20 }}>
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
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Approval Workflows" }]}
        title="Approval Workflows"
        subtitle="Konfigurasi rantai persetujuan per jenis dokumen & HRGA request"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {loading ? <WfSkeleton /> : (
        <div key={entity + tab} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "nk-rise"}>
          {tab === "dokumen" && <DokumenBisnisTab entity={entity} fireToast={fireToast} />}
          {tab === "hrga" && <HrgaRequestTab entity={entity} fireToast={fireToast} />}
        </div>
      )}
      {toastNode}
    </div>
  );
}
