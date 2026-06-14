/* =========================================================================
   NotificationsPage — Nexus by MSI · Admin Settings › Notifications
   Entity switcher + 2 tabs:
     A. In-App — notification rules grouped by event scope; edit via modal
     B. Email  — same layout, locked behind a "Coming Soon" overlay (SMTP)
   Data dummy/statis (Supabase wiring to follow separately).
   Note: glyphs not in kit's Icon registry (user, users, external-link) are
   pulled directly from lucide-react — kit.jsx is not modified.
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import { User, Users, ExternalLink } from "lucide-react";
import {
  Icon, PageHeader, EntitySwitcher, Tabs, Toggle, PrimaryBtn, OutlineBtn,
  Modal, useToast, Skel, KitStyles,
} from "./kit";
import {
  NAVY, ORANGE, CREAM, SURFACE, LINE, LINE_SOFT, ROW_HOVER, INK, INK_SOFT,
  MUTED, FAINT, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO,
} from "./tokens";

const NOTIF_ROLES = [
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
const notifRoleLabel = (v) => (NOTIF_ROLES.find((r) => r.value === v) || {}).label || v;

/* recipient kinds */
const REC_KINDS = [
  { value: "role",        label: "Role" },
  { value: "created_by",  label: "Pembuat" },
  { value: "assigned_to", label: "Ditugaskan ke" },
];
const recipientText = (r) => r.recipient === "role" ? notifRoleLabel(r.role) : r.recipient === "created_by" ? "Pembuat" : "Ditugaskan ke";

/* channel kinds */
const CH_KINDS = [
  { value: "inapp", label: "In-App",   icon: "bell" },
  { value: "email", label: "Email",    icon: "mail" },
  { value: "both",  label: "Keduanya", icon: "globe2" },
];
const channelText = (c) => c === "inapp" ? "In-App" : c === "email" ? "Email" : "Keduanya";

/* ---------- seed rules, grouped ---------- */
const NOTIF_GROUPS = [
  {
    id: "sp", name: "SP & Dokumen", icon: "filetext",
    rules: [
      { id: "sp.created",  label: "SP Baru Dibuat",  channel: "both",  recipient: "role", role: "manager", active: true,
        subject: "SP baru menunggu tindakan Anda", body: "Halo {recipient}, SP {doc_number} baru saja dibuat oleh {actor} dan menunggu tindakan Anda." },
      { id: "sp.approved", label: "SP Disetujui",    channel: "inapp", recipient: "created_by", role: "", active: true,
        subject: "SP Anda telah disetujui", body: "SP {doc_number} yang Anda buat telah disetujui oleh {approver}." },
      { id: "sp.rejected", label: "SP Ditolak",      channel: "inapp", recipient: "created_by", role: "", active: true,
        subject: "SP Anda ditolak", body: "SP {doc_number} ditolak. Alasan: {reason}." },
    ],
  },
  {
    id: "approval", name: "Approval", icon: "gitbranch",
    rules: [
      { id: "approval.pending",  label: "Persetujuan Menunggu", channel: "both",  recipient: "role", role: "manager", active: true,
        subject: "Ada dokumen menunggu persetujuan", body: "Halo {recipient}, dokumen {doc_number} menunggu persetujuan Anda." },
      { id: "approval.approved", label: "Persetujuan Disetujui", channel: "inapp", recipient: "created_by", role: "", active: true,
        subject: "Dokumen Anda disetujui", body: "Dokumen {doc_number} telah disetujui pada langkah {step}." },
      { id: "approval.rejected", label: "Persetujuan Ditolak", channel: "inapp", recipient: "created_by", role: "", active: false,
        subject: "Dokumen Anda ditolak", body: "Dokumen {doc_number} ditolak oleh {approver}." },
    ],
  },
  {
    id: "crm", name: "CRM", icon: "users",
    rules: [
      { id: "crm.deal_won",  label: "Deal Dimenangkan", channel: "both",  recipient: "role", role: "manager", active: true,
        subject: "Deal baru dimenangkan", body: "Selamat! Deal {deal_name} senilai {amount} berhasil dimenangkan oleh {actor}." },
      { id: "crm.lead_idle", label: "Lead Tidak Aktif",  channel: "inapp", recipient: "assigned_to", role: "", active: true,
        subject: "Lead Anda tidak aktif", body: "Lead {lead_name} belum ada aktivitas selama {idle_days} hari." },
    ],
  },
  {
    id: "hrga", name: "HRGA", icon: "clipboard",
    rules: [
      { id: "hrga.request_submitted", label: "Request HRGA Diajukan", channel: "both",  recipient: "role", role: "hrga", active: true,
        subject: "Request HRGA baru diajukan", body: "Request {request_code} diajukan oleh {actor} dan menunggu peninjauan tim HRGA." },
      { id: "hrga.request_approved",  label: "Request HRGA Disetujui", channel: "inapp", recipient: "created_by", role: "", active: true,
        subject: "Request HRGA Anda disetujui", body: "Request {request_code} Anda telah disetujui." },
      { id: "hrga.request_rejected",  label: "Request HRGA Ditolak", channel: "inapp", recipient: "created_by", role: "", active: true,
        subject: "Request HRGA Anda ditolak", body: "Request {request_code} ditolak. Alasan: {reason}." },
    ],
  },
];

/* group icon — 'users' isn't in kit's Icon registry, render via lucide directly */
function GroupIcon({ name, size }) {
  if (name === "users") return <Users size={size} strokeWidth={1.7} />;
  return <Icon name={name} size={size} />;
}

/* ---------- channel badge ---------- */
function NChannelBadge({ channel }) {
  const map = {
    inapp: { bg: "#EAF0F8", fg: NAVY,      icon: "bell" },
    email: { bg: "#FBE6DA", fg: "#C8521B", icon: "mail" },
    both:  { bg: "#E7EEF1", fg: "#2C6E73", icon: "globe2" },
  };
  const m = map[channel] || map.inapp;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 11px", borderRadius: 7, background: m.bg, color: m.fg, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700 }}>
      <Icon name={m.icon} size={13} />{channelText(channel)}
    </span>
  );
}
function NRecipientBadge({ rule }) {
  const isRole = rule.recipient === "role";
  const glyph = isRole
    ? <Icon name="shield" size={12} color={MUTED} />
    : rule.recipient === "created_by"
      ? <User size={12} color={MUTED} strokeWidth={1.7} />
      : <Users size={12} color={MUTED} strokeWidth={1.7} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: 7, background: CREAM, border: "1px solid " + LINE_SOFT, color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600 }}>
      {glyph}
      {recipientText(rule)}
    </span>
  );
}
function NCodeBadge({ code }) {
  return <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: NAVY, background: "#EAF0F8", border: "1px solid #D7E4F2", borderRadius: 6, padding: "3px 8px", letterSpacing: 0.2 }}>{code}</span>;
}

/* ---------- one rule row ---------- */
function NRuleRow({ rule, zebra, onToggle, onEdit, locked }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", background: hover && !locked ? ROW_HOVER : zebra ? "rgba(246,239,227,.5)" : "transparent", borderBottom: "1px solid " + LINE_SOFT, transition: "background .15s", opacity: rule.active ? 1 : 0.62 }}>
      <div style={{ flex: "1 1 220px", minWidth: 180 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 5 }}>{rule.label}</div>
        <NCodeBadge code={rule.id} />
      </div>
      <div style={{ flex: "0 0 auto" }}><NChannelBadge channel={rule.channel} /></div>
      <div style={{ flex: "0 0 auto", minWidth: 120 }}><NRecipientBadge rule={rule} /></div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
        <Toggle on={rule.active} onChange={() => onToggle(rule.id)} disabled={locked} />
        <button type="button" onClick={() => onEdit(rule)} disabled={locked}
          style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid " + LINE, background: SURFACE, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", cursor: locked ? "not-allowed" : "pointer", transition: "all .15s" }}
          onMouseEnter={(e) => { if (!locked) { e.currentTarget.style.borderColor = NAVY; e.currentTarget.style.background = "#EAF0F8"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.background = SURFACE; }}>
          <Icon name="pencil" size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------- group card ---------- */
function NGroupCard({ group, rules, onToggle, onEdit, onAdd, locked }) {
  const activeCount = rules.filter((r) => r.active).length;
  return (
    <div style={{ background: SURFACE, border: "1px solid " + LINE, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "16px 18px", borderBottom: "1px solid " + LINE_SOFT }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 40px" }}><GroupIcon name={group.icon} size={20} /></span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 15.5, fontWeight: 700, color: NAVY }}>{group.name}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 11, background: "#E8F3EC", color: GREEN, fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN }} />{activeCount} aktif
          </span>
        </div>
        <button type="button" onClick={() => onAdd(group.id)} disabled={locked}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 10, border: "2px solid " + NAVY, background: "transparent", color: NAVY, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: locked ? "not-allowed" : "pointer", transition: "background .2s" }}
          onMouseEnter={(e) => { if (!locked) e.currentTarget.style.background = "rgba(20,70,130,.05)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <Icon name="plus" size={15} />Tambah Rule
        </button>
      </div>
      <div>
        {rules.map((r, i) => <NRuleRow key={r.id} rule={r} zebra={i % 2 === 1} onToggle={onToggle} onEdit={onEdit} locked={locked} />)}
      </div>
    </div>
  );
}

/* ---------- auto-resize textarea ---------- */
function NAutoTextarea({ value, onChange, placeholder, minH = 96 }) {
  const ref = useRef(null);
  const [f, setF] = useState(false);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = Math.max(minH, el.scrollHeight) + "px"; } }, [value, minH]);
  return (
    <textarea ref={ref} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      onFocus={() => setF(true)} onBlur={() => setF(false)} className="ak-area"
      style={{ width: "100%", minHeight: minH, resize: "none", borderRadius: 11, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "12px 14px", fontFamily: FONT_BODY, fontSize: 13.5, lineHeight: 1.55, color: INK, outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
  );
}

/* ---------- channel radio card ---------- */
function NChannelCard({ kind, active, onClick }) {
  const [h, setH] = useState(false);
  const warn = kind.value !== "inapp";
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ flex: 1, minWidth: 0, textAlign: "left", borderRadius: 12, border: "1.5px solid " + (active ? NAVY : h ? "#C9D8EC" : LINE), background: active ? "#EAF0F8" : SURFACE, padding: "13px 14px", cursor: "pointer", transition: "all .18s", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: active ? NAVY : CREAM, color: active ? "#fff" : MUTED, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 30px", transition: "all .18s" }}><Icon name={kind.icon} size={16} /></span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: active ? NAVY : INK }}>{kind.label}</span>
        {active && <span style={{ marginLeft: "auto", color: NAVY }}><Icon name="checkcircle" size={17} /></span>}
      </div>
      {warn && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 500, color: "#B45309" }}>
          <Icon name="alert" size={12} />Membutuhkan SMTP
        </div>
      )}
    </button>
  );
}

/* ---------- recipient pill ---------- */
function NRecipientPill({ kind, active, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ flex: 1, height: 40, borderRadius: 10, border: "1.5px solid " + (active ? NAVY : LINE), background: active ? NAVY : h ? CREAM : SURFACE, color: active ? "#fff" : INK_SOFT, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all .18s", whiteSpace: "nowrap", padding: "0 10px" }}>
      {kind.label}
    </button>
  );
}

function NEditLabel({ children }) {
  return <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>{children}</div>;
}

/* ---------- edit modal ---------- */
function NRuleModal({ open, draft, onClose, onSave }) {
  const [form, setForm] = useState(draft);
  const [f1, setF1] = useState(false);
  useEffect(() => { if (open) setForm(draft); }, [open, draft && draft.id]);
  if (!form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} width={580}
      title={form._isNew ? "Tambah Rule Notifikasi" : "Edit Rule Notifikasi"}
      subtitle={form._isNew ? "Buat aturan notifikasi baru" : form.label}
      footer={<>
        <OutlineBtn onClick={onClose}>Batal</OutlineBtn>
        <PrimaryBtn icon="check" onClick={() => onSave(form)}>Simpan Rule</PrimaryBtn>
      </>}>
      {/* event type (display / or input for new) */}
      <NEditLabel>Event Type</NEditLabel>
      {form._isNew ? (
        <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="mis. SP Baru Dibuat"
          onFocus={() => setF1(true)} onBlur={() => setF1(false)}
          style={{ width: "100%", height: 46, borderRadius: 11, border: "1px solid " + (f1 ? NAVY : LINE), background: SURFACE, padding: "0 14px", fontFamily: FONT_BODY, fontSize: 14, color: INK, outline: "none", boxShadow: f1 ? "0 0 0 3px rgba(20,70,130,.14)" : "none", marginBottom: 6 }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 11, background: CREAM, border: "1px solid " + LINE }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, color: INK }}>{form.label}</span>
          <NCodeBadge code={form.id} />
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11.5, color: FAINT }}><Icon name="lock" size={12} />Tidak dapat diubah</span>
        </div>
      )}

      {/* channel */}
      <div style={{ marginTop: 22 }}>
        <NEditLabel>Channel</NEditLabel>
        <div style={{ display: "flex", gap: 10 }}>
          {CH_KINDS.map((k) => <NChannelCard key={k.value} kind={k} active={form.channel === k.value} onClick={() => set("channel", k.value)} />)}
        </div>
      </div>

      {/* recipient */}
      <div style={{ marginTop: 22 }}>
        <NEditLabel>Tipe Penerima</NEditLabel>
        <div style={{ display: "flex", gap: 9 }}>
          {REC_KINDS.map((k) => <NRecipientPill key={k.value} kind={k} active={form.recipient === k.value} onClick={() => set("recipient", k.value)} />)}
        </div>
      </div>

      {/* role (if recipient = role) */}
      {form.recipient === "role" && (
        <div className="ak-rise" style={{ marginTop: 18 }}>
          <NEditLabel>Role Penerima</NEditLabel>
          <NSelect value={form.role || "manager"} onChange={(v) => set("role", v)} options={NOTIF_ROLES} />
        </div>
      )}

      {/* template */}
      <div style={{ marginTop: 22 }}>
        <NEditLabel>Template Subject</NEditLabel>
        <NSubjectInput value={form.subject} onChange={(v) => set("subject", v)} />
      </div>
      <div style={{ marginTop: 18 }}>
        <NEditLabel>Template Body</NEditLabel>
        <NAutoTextarea value={form.body} onChange={(v) => set("body", v)} placeholder="Isi pesan notifikasi…" />
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontFamily: FONT_BODY, fontSize: 11, color: FAINT }}>
          <Icon name="info" size={12} color={FAINT} />Gunakan variabel seperti <span style={{ fontFamily: FONT_MONO, color: NAVY }}>{"{doc_number}"}</span>, <span style={{ fontFamily: FONT_MONO, color: NAVY }}>{"{actor}"}</span>.
        </div>
      </div>

      {/* active */}
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 11, background: CREAM, border: "1px solid " + LINE }}>
        <Toggle on={form.active} onChange={(v) => set("active", v)} />
        <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK_SOFT }}>Rule Aktif</span>
      </div>
    </Modal>
  );
}

function NSubjectInput({ value, onChange }) {
  const [f, setF] = useState(false);
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Judul notifikasi…"
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ width: "100%", height: 46, borderRadius: 11, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "0 14px", fontFamily: FONT_BODY, fontSize: 14, color: INK, outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
  );
}
function NSelect({ value, onChange, options }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", height: 46, borderRadius: 11, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "0 34px 0 14px", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: INK, appearance: "none", WebkitAppearance: "none", cursor: "pointer", outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}><Icon name="chevdown" size={15} /></span>
    </div>
  );
}

/* ---------- rules board (shared by both tabs) ---------- */
function NRulesBoard({ groups, onToggle, onEdit, onAdd, locked }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {NOTIF_GROUPS.map((g) => (
        <NGroupCard key={g.id} group={g} rules={groups[g.id]} onToggle={onToggle} onEdit={onEdit} onAdd={onAdd} locked={locked} />
      ))}
    </div>
  );
}

/* ---------- Email coming-soon overlay ---------- */
function NEmailLock() {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "70px 24px", background: "rgba(246,239,227,.72)", backdropFilter: "blur(2.5px)", borderRadius: 16 }}>
      <div className="ak-rise" style={{ maxWidth: 420, textAlign: "center", background: SURFACE, border: "1px solid " + LINE, borderRadius: 18, padding: "34px 30px", boxShadow: "0 22px 60px rgba(20,40,70,.16)" }}>
        <div style={{ width: 66, height: 66, borderRadius: 18, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Icon name="lock" size={30} />
        </div>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: NAVY, letterSpacing: -0.3 }}>Email Notifications</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: INK_SOFT, marginTop: 10, lineHeight: 1.6, textWrap: "pretty" }}>
          Fitur ini akan tersedia setelah konfigurasi SMTP selesai. Hubungi administrator sistem untuk mengaktifkan.
        </div>
        <a href="#" onClick={(e) => e.preventDefault()}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 20, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: ORANGE, textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
          Pelajari cara setup SMTP <ExternalLink size={15} strokeWidth={1.7} />
        </a>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE SHELL
   ========================================================================= */
function buildGroupState() {
  const out = {};
  NOTIF_GROUPS.forEach((g) => { out[g.id] = g.rules.map((r) => ({ ...r })); });
  return out;
}
let N_RULE_SEQ = 100;

function NSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[0, 1].map((g) => (
        <div key={g} style={{ background: SURFACE, border: "1px solid " + LINE, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "16px 18px", borderBottom: "1px solid " + LINE_SOFT }}>
            <Skel w={40} h={40} r={11} /><Skel w={130} h={16} /><span style={{ flex: 1 }} /><Skel w={120} h={38} r={10} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: "1px solid " + LINE_SOFT }}>
              <div style={{ flex: 1 }}><Skel w={150} h={14} style={{ marginBottom: 8 }} /><Skel w={90} h={18} r={6} /></div>
              <Skel w={80} h={26} r={7} /><Skel w={100} h={24} r={7} /><Skel w={44} h={24} r={20} /><Skel w={36} h={36} r={9} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage({ onHome }) {
  const [entity, setEntity] = useState("MSI");
  const [tab, setTab] = useState("inapp");
  const [fade, setFade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(buildGroupState);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftGroup, setDraftGroup] = useState(null);
  const [fireToast, toastNode] = useToast();

  useEffect(() => { const t = setTimeout(() => setLoading(false), 750); return () => clearTimeout(t); }, []);
  function switchEntity(id) { if (id === entity) return; setFade(true); setTimeout(() => { setEntity(id); setFade(false); }, 200); }

  const findGroup = (ruleId) => NOTIF_GROUPS.find((g) => data[g.id].some((r) => r.id === ruleId)).id;
  const toggle = (ruleId) => {
    const gid = findGroup(ruleId);
    setData((d) => ({ ...d, [gid]: d[gid].map((r) => r.id === ruleId ? { ...r, active: !r.active } : r) }));
  };
  const openEdit = (rule) => { setDraftGroup(findGroup(rule.id)); setDraft({ ...rule }); setModalOpen(true); };
  const openAdd = (gid) => {
    setDraftGroup(gid);
    setDraft({ id: gid + ".custom_" + (++N_RULE_SEQ), _isNew: true, label: "", channel: "inapp", recipient: "role", role: "manager", active: true, subject: "", body: "" });
    setModalOpen(true);
  };
  const save = (form) => {
    const gid = draftGroup;
    setData((d) => {
      const exists = d[gid].some((r) => r.id === form.id);
      const rest = { ...form }; delete rest._isNew;
      return { ...d, [gid]: exists ? d[gid].map((r) => r.id === form.id ? rest : r) : [...d[gid], rest] };
    });
    setModalOpen(false);
    fireToast("Rule \"" + (form.label || form.id) + "\" disimpan");
  };

  const tabs = [
    { id: "inapp", label: "In-App", icon: "bell" },
    { id: "email", label: "Email", icon: "mail" },
  ];

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Notification Settings" }]}
        title="Notification Settings"
        subtitle="Atur aturan notifikasi in-app dan email per entitas"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {loading ? <NSkeleton /> : (
        <div key={entity + tab} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "ak-rise"}>
          {tab === "inapp" ? (
            <NRulesBoard groups={data} onToggle={toggle} onEdit={openEdit} onAdd={openAdd} locked={false} />
          ) : (
            <div style={{ position: "relative" }}>
              <div style={{ pointerEvents: "none", filter: "saturate(.92)" }}>
                <NRulesBoard groups={data} onToggle={() => {}} onEdit={() => {}} onAdd={() => {}} locked={true} />
              </div>
              <NEmailLock />
            </div>
          )}
        </div>
      )}
      <NRuleModal open={modalOpen} draft={draft} onClose={() => setModalOpen(false)} onSave={save} />
      {toastNode}
    </div>
  );
}
