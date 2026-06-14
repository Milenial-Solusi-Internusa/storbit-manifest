/* =========================================================================
   DocumentSettingsPage — Nexus by MSI · Admin Settings › Document Settings
   Entity switcher + 2 tabs:
     A. Numbering Schemes  — table w/ in-place inline edit + live preview
     B. Document Templates — accordion, auto-resize textareas, per-item save
   Mock data, no backend (Supabase wiring to follow separately).
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import {
  Icon, PageHeader, EntitySwitcher, Tabs, Toggle, SaveButton, Segmented,
  Skel, Card, KitStyles, useToast,
} from "./kit";
import {
  NAVY, CREAM, SURFACE, LINE, LINE_SOFT, ROW_HOVER, INK, INK_SOFT, MUTED,
  FAINT, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO,
} from "./tokens";

const DOC_META = {
  SP:        { icon: "filetext",     label: "Surat Penawaran",  tint: "#EAF0F8", fg: NAVY },
  Inquiry:   { icon: "inbox",        label: "Inquiry",          tint: "#E5EDF7", fg: "#1E5894" },
  Quotation: { icon: "quote",        label: "Quotation",        tint: "#EEE7F4", fg: "#6E4B8C" },
  Invoice:   { icon: "receipt",      label: "Invoice",          tint: "#FBE6DA", fg: "#C8521B" },
  ARTTF:     { icon: "banknote",     label: "AR-TTF",           tint: "#DEF0E4", fg: GREEN },
  PO:        { icon: "shoppingcart", label: "Purchase Order",   tint: "#FBEFD3", fg: "#9A6B12" },
};

const NUM_SEED = [
  { id: "SP",        prefix: "SP",     suffix: "",    padding: 4, separator: "/", reset: "Tahunan", lastSeq: 142, active: true },
  { id: "Inquiry",   prefix: "INQ",    suffix: "",    padding: 4, separator: "/", reset: "Tahunan", lastSeq: 318, active: true },
  { id: "Quotation", prefix: "QTN",    suffix: "",    padding: 4, separator: "/", reset: "Tahunan", lastSeq: 97,  active: true },
  { id: "Invoice",   prefix: "INV",    suffix: "",    padding: 5, separator: "/", reset: "Bulanan", lastSeq: 2051, active: true },
  { id: "ARTTF",     prefix: "TTF",    suffix: "AR",  padding: 4, separator: "/", reset: "Tahunan", lastSeq: 64,  active: true },
  { id: "PO",        prefix: "PO",     suffix: "",    padding: 4, separator: "/", reset: "Tahunan", lastSeq: 205, active: false },
];

const RESET_OPTS = ["Tahunan", "Bulanan", "Tidak Pernah"];
const SEP_OPTS = ["/", "-", "."];
const YEAR = "2026";

function buildPreview(s, entity) {
  const seq = String((Number(s.lastSeq) || 0) + 1).padStart(Math.max(1, Number(s.padding) || 1), "0");
  const parts = [s.prefix, entity, YEAR, seq].filter((p) => p !== "" && p != null);
  let str = parts.join(s.separator || "/");
  if (s.suffix) str = [s.prefix, s.suffix, entity, YEAR, seq].filter(Boolean).join(s.separator || "/");
  return str;
}

/* ---------- animated, character-by-character code preview ---------- */
function AnimatedCode({ value, size = 14 }) {
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: size, fontWeight: 700, color: NAVY, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
      {value.split("").map((ch, i) => (
        <span key={i + ":" + ch} style={{ display: "inline-block", animation: "ak-charin .26s cubic-bezier(.22,1,.36,1) both" }}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

/* ---------- compact in-cell input ---------- */
function CellInput({ value, onChange, mono, width = 64, center }) {
  const [f, setF] = useState(false);
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ width, height: 36, borderRadius: 8, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "0 9px", textAlign: center ? "center" : "left", fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: 13, fontWeight: 500, color: INK, outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
  );
}
function CellSelect({ value, onChange, options, width = 110 }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: "relative", width }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "0 28px 0 9px", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: INK, appearance: "none", WebkitAppearance: "none", cursor: "pointer", outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none" }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}><Icon name="chevdown" size={13} /></span>
    </div>
  );
}

const dThStyle = { padding: "12px 14px", textAlign: "left", fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: MUTED, whiteSpace: "nowrap" };
const dTdStyle = { padding: "12px 14px", borderBottom: "1px solid " + LINE_SOFT, verticalAlign: "middle", whiteSpace: "nowrap" };
const codeChip = { fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: NAVY };

function NumberingRow({ row, entity, editing, onEdit, onSave, onChange, onToggle, hovered, onHover }) {
  const meta = DOC_META[row.id];
  const preview = buildPreview(row, entity);
  return (
    <tr onMouseEnter={() => onHover(row.id)} onMouseLeave={() => onHover(null)}
      style={{ background: editing ? "rgba(20,70,130,.035)" : hovered ? ROW_HOVER : "transparent", transition: "background .15s" }}>
      <td style={dTdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: meta.tint, color: meta.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" }}><Icon name={meta.icon} size={16} /></span>
          <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>{meta.label}</span>
        </div>
      </td>
      <td style={dTdStyle}>{editing ? <CellInput value={row.prefix} onChange={(v) => onChange("prefix", v)} mono width={70} /> : <span style={codeChip}>{row.prefix || "—"}</span>}</td>
      <td style={dTdStyle}>{editing ? <CellInput value={row.suffix} onChange={(v) => onChange("suffix", v)} mono width={64} /> : <span style={{ ...codeChip, color: row.suffix ? NAVY : FAINT }}>{row.suffix || "—"}</span>}</td>
      <td style={{ ...dTdStyle, textAlign: "center" }}>{editing ? <CellInput value={row.padding} onChange={(v) => onChange("padding", v.replace(/[^0-9]/g, ""))} mono width={48} center /> : <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT }}>{row.padding}</span>}</td>
      <td style={{ ...dTdStyle, textAlign: "center" }}>{editing ? <CellSelect value={row.separator} onChange={(v) => onChange("separator", v)} options={SEP_OPTS} width={64} /> : <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: INK_SOFT }}>{row.separator}</span>}</td>
      <td style={dTdStyle}>{editing ? <CellSelect value={row.reset} onChange={(v) => onChange("reset", v)} options={RESET_OPTS} width={130} /> : <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: MUTED }}>{row.reset}</span>}</td>
      <td style={{ ...dTdStyle, textAlign: "right" }}><span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: INK_SOFT }}>{String(row.lastSeq).padStart(Number(row.padding) || 1, "0")}</span></td>
      <td style={dTdStyle}>
        <span style={{ display: "inline-flex", alignItems: "center", background: "#EAF0F8", border: "1px solid #CFE0F2", borderRadius: 8, padding: "7px 12px" }}>
          <AnimatedCode value={preview} />
        </span>
      </td>
      <td style={{ ...dTdStyle, textAlign: "center" }}><div style={{ display: "flex", justifyContent: "center" }}><Toggle on={row.active} onChange={() => onToggle(row.id)} /></div></td>
      <td style={{ ...dTdStyle, textAlign: "right" }}>
        {editing ? (
          <button type="button" onClick={() => onSave(row.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 9, border: "none", background: NAVY, color: "#fff", fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Icon name="check" size={14} />Simpan</button>
        ) : (
          <button type="button" onClick={() => onEdit(row.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 9, border: "1px solid " + LINE, background: SURFACE, color: NAVY, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = NAVY; e.currentTarget.style.background = "#EAF0F8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.background = SURFACE; }}><Icon name="pencil" size={14} />Edit</button>
        )}
      </td>
    </tr>
  );
}

function NumberingTab({ entity, fireToast }) {
  const [rows, setRows] = useState(NUM_SEED);
  const [editId, setEditId] = useState(null);
  const [hover, setHover] = useState(null);

  const change = (key, val) => setRows((r) => r.map((x) => x.id === editId ? { ...x, [key]: val } : x));
  const toggle = (id) => setRows((r) => r.map((x) => x.id === id ? { ...x, active: !x.active } : x));
  const save = (id) => { setEditId(null); fireToast("Skema penomoran " + DOC_META[id].label + " disimpan"); };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16, background: "#EAF0F8", border: "1px solid #CFE0F2", borderRadius: 12, padding: "12px 16px" }}>
        <Icon name="info" size={17} color={NAVY} />
        <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT }}>Live preview diperbarui real-time saat Anda mengubah prefix, suffix, atau padding. Format: <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: NAVY }}>PREFIX/ENTITAS/TAHUN/URUTAN</span></span>
      </div>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div className="ak-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr style={{ background: CREAM }}>
                <th style={dThStyle}>Jenis Dokumen</th>
                <th style={dThStyle}>Prefix</th>
                <th style={dThStyle}>Suffix</th>
                <th style={{ ...dThStyle, textAlign: "center" }}>Padding</th>
                <th style={{ ...dThStyle, textAlign: "center" }}>Pemisah</th>
                <th style={dThStyle}>Reset</th>
                <th style={{ ...dThStyle, textAlign: "right" }}>Urutan Terakhir</th>
                <th style={dThStyle}>Live Preview</th>
                <th style={{ ...dThStyle, textAlign: "center" }}>Aktif</th>
                <th style={{ ...dThStyle, textAlign: "right" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <NumberingRow key={r.id} row={r} entity={entity} editing={editId === r.id} onEdit={setEditId} onSave={save} onChange={change} onToggle={toggle} hovered={hover === r.id} onHover={setHover} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ===================== TAB B — DOCUMENT TEMPLATES ===================== */
function AutoTextarea({ value, onChange, placeholder, minH = 70 }) {
  const ref = useRef(null);
  const [f, setF] = useState(false);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = Math.max(minH, el.scrollHeight) + "px"; } }, [value, minH]);
  return (
    <textarea ref={ref} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      onFocus={() => setF(true)} onBlur={() => setF(false)} className="ak-area"
      style={{ width: "100%", minHeight: minH, resize: "none", borderRadius: 11, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "12px 14px", fontFamily: FONT_BODY, fontSize: 13.5, lineHeight: 1.55, color: INK, outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
  );
}

const TPL_SEED = {
  SP:        { header: "PT Milenial Solusi Internusa — Freight Forwarding & Trading", footer: "Dokumen ini diterbitkan secara elektronik dan sah tanpa tanda tangan basah.", tc: "1. Harga belum termasuk PPN.\n2. Penawaran berlaku 14 hari sejak tanggal terbit.\n3. Pembayaran sesuai termin yang disepakati.", footnote: "Hal. {page} dari {total}", logoPos: "left", stamp: true, sign: true, saved: "—" },
  Inquiry:   { header: "PT Milenial Solusi Internusa", footer: "Terima kasih atas inquiry Anda.", tc: "", footnote: "", logoPos: "left", stamp: false, sign: false, saved: "—" },
  Quotation: { header: "PT Milenial Solusi Internusa — Quotation", footer: "Berlaku sesuai validitas tercantum.", tc: "1. Harga dalam mata uang tercantum.\n2. Subject to space & equipment availability.", footnote: "Hal. {page}", logoPos: "center", stamp: true, sign: true, saved: "—" },
  Invoice:   { header: "PT Milenial Solusi Internusa", footer: "Mohon transfer ke rekening yang tertera.", tc: "Pembayaran jatuh tempo sesuai termin. Keterlambatan dikenakan denda 2%/bulan.", footnote: "Hal. {page} dari {total}", logoPos: "left", stamp: true, sign: true, saved: "—" },
  ARTTF:     { header: "PT Milenial Solusi Internusa — Tanda Terima Faktur", footer: "", tc: "", footnote: "", logoPos: "left", stamp: false, sign: true, saved: "—" },
  PO:        { header: "PT Milenial Solusi Internusa — Purchase Order", footer: "Konfirmasi penerimaan PO dalam 2x24 jam.", tc: "Barang/jasa sesuai spesifikasi PO.", footnote: "Hal. {page}", logoPos: "right", stamp: true, sign: true, saved: "—" },
};

function Field({ label, children }) {
  return <div><div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>{label}</div>{children}</div>;
}
function ToggleField({ label, on, onChange }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Toggle on={on} onChange={onChange} /><span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: INK_SOFT }}>{label}</span></div>;
}

function TemplateAccordion({ id, data, open, onToggle, onChange, fireToast }) {
  const meta = DOC_META[id];
  return (
    <div style={{ background: SURFACE, border: "1px solid " + (open ? "#C9D8EC" : LINE), borderRadius: 14, overflow: "hidden", transition: "border-color .2s" }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: open ? "rgba(20,70,130,.03)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background .2s" }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: meta.tint, color: meta.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 40px" }}><Icon name={meta.icon} size={19} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 600, color: NAVY }}>{meta.label}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: FAINT, marginTop: 2 }}>Terakhir disimpan: {data.saved}</div>
        </div>
        <span style={{ display: "inline-flex", color: MUTED, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .3s cubic-bezier(.22,1,.36,1)" }}><Icon name="chevdown" size={20} /></span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows .35s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "4px 18px 18px", borderTop: "1px solid " + LINE_SOFT }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <Field label="Header Text"><AutoTextarea value={data.header} onChange={(v) => onChange("header", v)} placeholder="Teks kop dokumen…" /></Field>
              <Field label="Footer Text"><AutoTextarea value={data.footer} onChange={(v) => onChange("footer", v)} placeholder="Teks footer…" /></Field>
              <Field label="Syarat & Ketentuan (T&C)"><AutoTextarea value={data.tc} onChange={(v) => onChange("tc", v)} placeholder="Syarat & ketentuan…" minH={90} /></Field>
              <Field label="Footnote"><AutoTextarea value={data.footnote} onChange={(v) => onChange("footnote", v)} placeholder="Catatan kaki…" minH={90} /></Field>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 28, marginTop: 18 }}>
              <div>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>Posisi Logo</div>
                <Segmented value={data.logoPos} onChange={(v) => onChange("logoPos", v)} options={[{ value: "left", label: "Kiri", icon: "alignleft" }, { value: "center", label: "Tengah", icon: "aligncenter" }, { value: "right", label: "Kanan", icon: "alignright" }]} />
              </div>
              <div style={{ display: "flex", gap: 22 }}>
                <ToggleField label="Tampilkan Stempel" on={data.stamp} onChange={(v) => onChange("stamp", v)} />
                <ToggleField label="Tampilkan Tanda Tangan" on={data.sign} onChange={(v) => onChange("sign", v)} />
              </div>
              <span style={{ flex: 1 }} />
              <SaveButton label="Simpan Template" variant="primary" onSave={() => { onChange("saved", "baru saja"); fireToast("Template " + meta.label + " disimpan"); }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplatesTab({ fireToast }) {
  const [tpl, setTpl] = useState(TPL_SEED);
  const [open, setOpen] = useState("SP");
  const change = (id) => (key, val) => setTpl((t) => ({ ...t, [id]: { ...t[id], [key]: val } }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Object.keys(DOC_META).map((id) => (
        <TemplateAccordion key={id} id={id} data={tpl[id]} open={open === id} onToggle={() => setOpen(open === id ? null : id)} onChange={change(id)} fireToast={fireToast} />
      ))}
    </div>
  );
}

/* ---------- table skeleton ---------- */
function TableSkeleton() {
  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <div style={{ background: CREAM, height: 44 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: "1px solid " + LINE_SOFT }}>
          <Skel w={34} h={34} r={9} /><Skel w={140} h={14} /><span style={{ flex: 1 }} /><Skel w={90} h={14} /><Skel w={150} h={30} r={8} />
        </div>
      ))}
    </Card>
  );
}

/* ===================== PAGE SHELL ===================== */
export default function DocumentSettingsPage({ onHome }) {
  const [entity, setEntity] = useState("MSI");
  const [tab, setTab] = useState("numbering");
  const [fade, setFade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fireToast, toastNode] = useToast();

  useEffect(() => { const t = setTimeout(() => setLoading(false), 800); return () => clearTimeout(t); }, []);
  function switchEntity(id) { if (id === entity) return; setFade(true); setTimeout(() => { setEntity(id); setFade(false); }, 200); }

  const tabs = [
    { id: "numbering", label: "Numbering Schemes", icon: "hash" },
    { id: "templates", label: "Document Templates", icon: "layout" },
  ];

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Document Settings" }]}
        title="Document Settings" subtitle="Skema penomoran & template dokumen per entitas"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {loading ? <TableSkeleton /> : (
        <div key={entity + tab} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "ak-rise"}>
          {tab === "numbering" && <NumberingTab entity={entity} fireToast={fireToast} />}
          {tab === "templates" && <TemplatesTab fireToast={fireToast} />}
        </div>
      )}
      {toastNode}
    </div>
  );
}
