/* =========================================================================
   EntitySettingsPage — Nexus by MSI · Foundation › Admin Settings › Entity
   Entity switcher (MSI | JCI | SOA) + 3 tabs:
     A. Company Profile  — floating-label form, logo drop zone, dirty banner
     B. Bank Accounts    — table, inline delete confirm, slide-over add form
     C. Signatories      — premium card grid, upload boxes, modal add/edit
   Mock data, no backend (Supabase wiring to follow separately).
   ========================================================================= */

import { useState, useEffect } from "react";
import {
  Icon, PageHeader, SectionLabel, EntitySwitcher, Tabs, FloatingInput,
  FloatingSelect, Toggle, PrimaryBtn, OutlineBtn, SaveButton, SlideOver,
  Modal, DropZone, UploadBox, PillToggle, useToast, Skel, Card, KitStyles,
} from "./kit";
import {
  NAVY, ORANGE, CREAM, SURFACE, LINE, LINE_SOFT, ROW_HOVER, INK, INK_SOFT,
  MUTED, FAINT, DANGER, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO,
} from "./tokens";

/* ---------- mock seed per entity ---------- */
const ENTITY_PROFILE = {
  MSI: { legal: "PT Milenial Solusi Internusa", brand: "Nexus Logistics", npwp: "01.234.567.8-014.000", nib: "9120004567890", website: "www.milenialsolusi.co.id", addr1: "Gedung Cyber 2 Lt. 18, Jl. H.R. Rasuna Said", addr2: "Blok X-5 Kav. 13, Kuningan", city: "Jakarta Selatan", province: "DKI Jakarta", postal: "12950", country: "Indonesia", phone: "+62 21 2553 4100", email: "corporate@milenialsolusi.co.id", currency: "IDR", fiscal: "Januari", tz: "Asia/Jakarta (WIB · GMT+7)" },
  JCI: { legal: "PT Jago Custom Indonesia", brand: "Jago Customs", npwp: "02.876.543.2-021.000", nib: "8120009876540", website: "www.jagocustom.co.id", addr1: "Jl. Yos Sudarso No. 88, Tanjung Priok", addr2: "Komplek Pergudangan Blok C-12", city: "Jakarta Utara", province: "DKI Jakarta", postal: "14320", country: "Indonesia", phone: "+62 21 4390 7720", email: "ops@jagocustom.co.id", currency: "IDR", fiscal: "Januari", tz: "Asia/Jakarta (WIB · GMT+7)" },
  SOA: { legal: "PT Stuja Orbit Abadi", brand: "Storbit Trading", npwp: "03.445.221.9-031.000", nib: "7120003344550", website: "www.stujaorbit.co.id", addr1: "Jl. Perak Timur No. 210, Pabean Cantian", addr2: "Lantai 4, Surabaya Maritime Tower", city: "Surabaya", province: "Jawa Timur", postal: "60165", country: "Indonesia", phone: "+62 31 3520 8800", email: "info@stujaorbit.co.id", currency: "IDR", fiscal: "Januari", tz: "Asia/Jakarta (WIB · GMT+7)" },
};

const ENTITY_BANKS = {
  MSI: [
    { id: "b1", bank: "Bank Central Asia (BCA)", acc: "0123456789", holder: "PT Milenial Solusi Internusa", branch: "KCU Kuningan", currency: "IDR", isDefault: true, active: true },
    { id: "b2", bank: "Bank Mandiri", acc: "1230009876543", holder: "PT Milenial Solusi Internusa", branch: "KCP Rasuna Said", currency: "USD", isDefault: false, active: true },
  ],
  JCI: [
    { id: "b1", bank: "Bank Negara Indonesia (BNI)", acc: "0445678123", holder: "PT Jago Custom Indonesia", branch: "KCU Tanjung Priok", currency: "IDR", isDefault: true, active: true },
  ],
  SOA: [
    { id: "b1", bank: "Bank Rakyat Indonesia (BRI)", acc: "0098123455", holder: "PT Stuja Orbit Abadi", branch: "KCU Perak", currency: "IDR", isDefault: true, active: true },
  ],
};

const DOC_TYPES = [
  { id: "SP", label: "SP" },
  { id: "Invoice", label: "Invoice" },
  { id: "Quotation", label: "Quotation" },
  { id: "PO", label: "PO" },
];

const ENTITY_SIGNERS = {
  MSI: [{ id: "s1", name: "Ir. Bambang Wijaya", title: "Direktur Utama", types: ["SP", "Invoice", "Quotation", "PO"], sig: null, stamp: null, active: true }],
  JCI: [{ id: "s1", name: "Hendra Gunawan, S.E.", title: "Direktur Operasional", types: ["SP", "Quotation"], sig: null, stamp: null, active: true }],
  SOA: [{ id: "s1", name: "Drs. Agus Salim", title: "Direktur Utama", types: ["Invoice", "PO"], sig: null, stamp: null, active: true }],
};

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const CURRENCIES = ["IDR", "USD", "EUR", "SGD", "CNY"];
const TIMEZONES = ["Asia/Jakarta (WIB · GMT+7)", "Asia/Makassar (WITA · GMT+8)", "Asia/Jayapura (WIT · GMT+9)"];

const tdStyle = { padding: "13px 16px", borderBottom: "1px solid " + LINE_SOFT, verticalAlign: "middle" };
const thStyle = { padding: "12px 16px", textAlign: "left", fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: MUTED, whiteSpace: "nowrap" };

/* ---------- shared small icon button ---------- */
function IconBtn({ icon, onClick, danger }) {
  const [h, setH] = useState(false);
  const c = danger ? DANGER : NAVY;
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid " + (h ? c : "transparent"), background: h ? (danger ? "rgba(220,38,38,.08)" : "#EAF0F8") : "transparent", color: h ? c : MUTED, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/* ---------- empty state ---------- */
function EmptyState({ icon, title, desc, cta, onCta }) {
  return (
    <Card style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: CREAM, border: "1px solid " + LINE, display: "flex", alignItems: "center", justifyContent: "center", color: NAVY, margin: "0 auto 18px" }}><Icon name={icon} size={30} /></div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: NAVY }}>{title}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: MUTED, maxWidth: 380, margin: "8px auto 22px", lineHeight: 1.55, textWrap: "pretty" }}>{desc}</div>
      <div style={{ display: "flex", justifyContent: "center" }}><PrimaryBtn icon="plus" onClick={onCta}>{cta}</PrimaryBtn></div>
    </Card>
  );
}

/* ===================== TAB A — COMPANY PROFILE ===================== */
function CompanyProfileTab({ entity, onDirtyChange, fireToast }) {
  const [form, setForm] = useState(ENTITY_PROFILE[entity]);
  const [logo, setLogo] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setForm(ENTITY_PROFILE[entity]); setLogo(null); setDirty(false); }, [entity]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty]);

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setLogoD = (v) => { setLogo(v); setDirty(true); };

  return (
    <div>
      <Card style={{ marginBottom: 18 }}>
        <SectionLabel style={{ marginBottom: 18 }}>Identitas Perusahaan</SectionLabel>
        <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 220, flex: "0 0 220px" }}>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 9 }}>Logo Perusahaan</div>
            <DropZone value={logo} onChange={setLogoD} />
          </div>
          <div style={{ flex: "1 1 420px", display: "flex", flexWrap: "wrap", gap: 16 }}>
            <FloatingInput label="Nama Legal" value={form.legal} onChange={set("legal")} half />
            <FloatingInput label="Nama Brand" value={form.brand} onChange={set("brand")} half />
            <FloatingInput label="NPWP" value={form.npwp} onChange={set("npwp")} mono half />
            <FloatingInput label="NIB" value={form.nib} onChange={set("nib")} mono half />
            <FloatingInput label="Website" value={form.website} onChange={set("website")} full />
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <SectionLabel style={{ marginBottom: 18 }}>Alamat & Kontak</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <FloatingInput label="Alamat Baris 1" value={form.addr1} onChange={set("addr1")} full />
          <FloatingInput label="Alamat Baris 2" value={form.addr2} onChange={set("addr2")} full />
          <FloatingInput label="Kota" value={form.city} onChange={set("city")} third />
          <FloatingInput label="Provinsi" value={form.province} onChange={set("province")} third />
          <FloatingInput label="Kode Pos" value={form.postal} onChange={set("postal")} mono third />
          <FloatingInput label="Negara" value={form.country} onChange={set("country")} third />
          <FloatingInput label="Telepon" value={form.phone} onChange={set("phone")} mono third />
          <FloatingInput label="Email" value={form.email} onChange={set("email")} type="email" third />
        </div>
      </Card>

      <Card>
        <SectionLabel style={{ marginBottom: 18 }}>Preferensi Regional</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <FloatingSelect label="Mata Uang Default" value={form.currency} onChange={set("currency")} options={CURRENCIES} third />
          <FloatingSelect label="Awal Tahun Fiskal" value={form.fiscal} onChange={set("fiscal")} options={MONTHS} third />
          <FloatingSelect label="Zona Waktu" value={form.tz} onChange={set("tz")} options={TIMEZONES} third />
        </div>
      </Card>

      {/* sticky unsaved banner */}
      <div style={{ position: "sticky", bottom: 18, marginTop: 20, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: INK, color: "#fff", borderRadius: 14, padding: "12px 14px 12px 20px", boxShadow: "0 14px 36px rgba(16,24,40,.3)", pointerEvents: "auto", transform: dirty ? "translateY(0)" : "translateY(140%)", opacity: dirty ? 1 : 0, transition: "transform .4s cubic-bezier(.22,1,.36,1), opacity .3s" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} />
            Ada perubahan belum disimpan
          </span>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" onClick={() => { setForm(ENTITY_PROFILE[entity]); setLogo(null); setDirty(false); }}
              style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Buang</button>
            <SaveButton label="Simpan" onSave={() => { setDirty(false); fireToast("Profil " + entity + " tersimpan"); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== TAB B — BANK ACCOUNTS ===================== */
function BankRow({ row, onToggle, onDefault, onDelete }) {
  const [hover, setHover] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <tr onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ background: hover ? ROW_HOVER : "transparent", transition: "background .15s" }}>
        <td style={tdStyle}><div style={{ display: "flex", alignItems: "center", gap: 11 }}><span style={{ width: 34, height: 34, borderRadius: 9, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" }}><Icon name="bank" size={16} /></span><span style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: INK }}>{row.bank}</span></div></td>
        <td style={{ ...tdStyle, fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, letterSpacing: 0.4 }}>{row.acc}</td>
        <td style={{ ...tdStyle, fontSize: 13, color: INK_SOFT }}>{row.holder}</td>
        <td style={{ ...tdStyle, fontSize: 13, color: MUTED }}>{row.branch}</td>
        <td style={tdStyle}><span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: NAVY, background: "#EAF0F8", padding: "3px 9px", borderRadius: 6 }}>{row.currency}</span></td>
        <td style={{ ...tdStyle, textAlign: "center" }}><div style={{ display: "flex", justifyContent: "center" }}><Toggle on={row.isDefault} onChange={() => onDefault(row.id)} /></div></td>
        <td style={{ ...tdStyle, textAlign: "center" }}><div style={{ display: "flex", justifyContent: "center" }}><Toggle on={row.active} onChange={() => onToggle(row.id)} /></div></td>
        <td style={{ ...tdStyle, textAlign: "right" }}>
          <div style={{ display: "inline-flex", gap: 4 }}>
            <IconBtn icon="pencil" onClick={() => {}} />
            <IconBtn icon="trash" danger onClick={() => setConfirm(true)} />
          </div>
        </td>
      </tr>
      <tr>
        <td colSpan={8} style={{ padding: 0, borderBottom: confirm ? "1px solid " + LINE : "none" }}>
          <div style={{ maxHeight: confirm ? 80 : 0, overflow: "hidden", transition: "max-height .3s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(220,38,38,.05)", padding: "14px 20px", margin: "0" }}>
              <Icon name="alert" size={18} color={DANGER} />
              <span style={{ flex: 1, fontFamily: FONT_BODY, fontSize: 13, color: "#991B1B", fontWeight: 500 }}>Hapus rekening <strong>{row.bank}</strong> ({row.acc})? Tindakan ini tidak dapat dibatalkan.</span>
              <button type="button" onClick={() => setConfirm(false)} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1.5px solid " + LINE, background: SURFACE, color: INK_SOFT, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button type="button" onClick={() => { setConfirm(false); onDelete(row.id); }} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: DANGER, color: "#fff", fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="trash" size={14} />Konfirmasi Hapus</button>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

function BankAccountsTab({ entity, fireToast }) {
  const [rows, setRows] = useState(ENTITY_BANKS[entity]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ bank: "", acc: "", holder: "", branch: "", currency: "IDR" });
  useEffect(() => { setRows(ENTITY_BANKS[entity]); }, [entity]);

  const toggle = (id) => setRows((r) => r.map((x) => x.id === id ? { ...x, active: !x.active } : x));
  const setDefault = (id) => setRows((r) => r.map((x) => ({ ...x, isDefault: x.id === id })));
  const del = (id) => { setRows((r) => r.filter((x) => x.id !== id)); fireToast("Rekening dihapus", "trash"); };
  const add = () => {
    setRows((r) => [...r, { ...draft, id: "b" + Date.now(), isDefault: r.length === 0, active: true }]);
    setOpen(false); setDraft({ bank: "", acc: "", holder: "", branch: "", currency: "IDR" });
    fireToast("Rekening bank ditambahkan");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED }}><strong style={{ color: INK, fontFamily: FONT_MONO }}>{rows.length}</strong> rekening terdaftar untuk entitas {entity}</div>
        <PrimaryBtn icon="plus" onClick={() => setOpen(true)}>Tambah Rekening Bank</PrimaryBtn>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="bank" title="Belum ada rekening bank" desc="Tambahkan rekening bank entitas untuk dipakai pada invoice & dokumen pembayaran." cta="Tambah Rekening Bank" onCta={() => setOpen(true)} />
      ) : (
        <Card pad={0} style={{ overflow: "hidden" }}>
          <div className="ak-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
              <thead>
                <tr style={{ background: CREAM }}>
                  <th style={thStyle}>Nama Bank</th>
                  <th style={thStyle}>No. Rekening</th>
                  <th style={thStyle}>Atas Nama</th>
                  <th style={thStyle}>Cabang</th>
                  <th style={thStyle}>Valuta</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Default</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Aktif</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <BankRow key={r.id} row={r} onToggle={toggle} onDefault={setDefault} onDelete={del} />)}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SlideOver open={open} onClose={() => setOpen(false)} title="Tambah Rekening Bank" subtitle={"Entitas " + entity}
        footer={<><OutlineBtn onClick={() => setOpen(false)}>Batal</OutlineBtn><PrimaryBtn icon="check" onClick={add}>Simpan Rekening</PrimaryBtn></>}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <FloatingInput label="Nama Bank" value={draft.bank} onChange={(v) => setDraft({ ...draft, bank: v })} full />
          <FloatingInput label="Nomor Rekening" value={draft.acc} onChange={(v) => setDraft({ ...draft, acc: v })} mono full />
          <FloatingInput label="Atas Nama" value={draft.holder} onChange={(v) => setDraft({ ...draft, holder: v })} full />
          <FloatingInput label="Cabang" value={draft.branch} onChange={(v) => setDraft({ ...draft, branch: v })} half />
          <FloatingSelect label="Valuta" value={draft.currency} onChange={(v) => setDraft({ ...draft, currency: v })} options={CURRENCIES} half />
        </div>
      </SlideOver>
    </div>
  );
}

/* ===================== TAB C — SIGNATORIES & STAMPS ===================== */
function SignerCard({ signer, onToggle, onEdit, onDelete, onUpload }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: SURFACE, border: "1px solid " + (h ? "#C9D8EC" : LINE), borderRadius: 16, padding: 20, transition: "border-color .2s, box-shadow .2s", boxShadow: h ? "0 8px 22px rgba(20,40,70,.07)" : "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 46px", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16 }}>
          {signer.name.split(" ").filter((w) => !w.includes(".")).slice(0, 2).map((w) => w[0]).join("")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: NAVY, letterSpacing: -0.2 }}>{signer.name}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED, marginTop: 2 }}>{signer.title}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
        {signer.types.map((t) => <span key={t} style={{ fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600, color: NAVY, border: "1px solid " + NAVY, borderRadius: 20, padding: "3px 11px" }}>{t}</span>)}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <UploadBox value={signer.sig} onChange={(v) => onUpload(signer.id, "sig", v)} label="Tanda Tangan" icon="pen" />
        <UploadBox value={signer.stamp} onChange={(v) => onUpload(signer.id, "stamp", v)} label="Stempel" icon="stamp" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid " + LINE_SOFT }}>
        <Toggle on={signer.active} onChange={() => onToggle(signer.id)} />
        <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: signer.active ? GREEN : FAINT }}>{signer.active ? "Aktif" : "Nonaktif"}</span>
        <span style={{ flex: 1 }} />
        <IconBtn icon="pencil" onClick={() => onEdit(signer)} />
        <IconBtn icon="trash" danger onClick={() => onDelete(signer.id)} />
      </div>
    </div>
  );
}

function SignatoriesTab({ entity, fireToast }) {
  const [signers, setSigners] = useState(ENTITY_SIGNERS[entity]);
  const [modal, setModal] = useState(null); // null | {mode, data}
  useEffect(() => { setSigners(ENTITY_SIGNERS[entity]); }, [entity]);

  const toggle = (id) => setSigners((s) => s.map((x) => x.id === id ? { ...x, active: !x.active } : x));
  const del = (id) => { setSigners((s) => s.filter((x) => x.id !== id)); fireToast("Penanda tangan dihapus", "trash"); };
  const upload = (id, key, val) => setSigners((s) => s.map((x) => x.id === id ? { ...x, [key]: val } : x));

  const openAdd = () => setModal({ mode: "add", data: { name: "", title: "", types: [], sig: null, stamp: null, active: true } });
  const openEdit = (signer) => setModal({ mode: "edit", data: { ...signer } });

  const save = () => {
    const d = modal.data;
    if (modal.mode === "add") setSigners((s) => [...s, { ...d, id: "s" + Date.now() }]);
    else setSigners((s) => s.map((x) => x.id === d.id ? d : x));
    setModal(null);
    fireToast(modal.mode === "add" ? "Penanda tangan ditambahkan" : "Penanda tangan diperbarui");
  };
  const toggleType = (t) => setModal((m) => ({ ...m, data: { ...m.data, types: m.data.types.includes(t) ? m.data.types.filter((x) => x !== t) : [...m.data.types, t] } }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED }}><strong style={{ color: INK, fontFamily: FONT_MONO }}>{signers.length}</strong> penanda tangan untuk entitas {entity}</div>
        <PrimaryBtn icon="plus" onClick={openAdd}>Tambah Penanda Tangan</PrimaryBtn>
      </div>

      {signers.length === 0 ? (
        <EmptyState icon="pen" title="Belum ada penanda tangan" desc="Tambahkan penanda tangan beserta spesimen tanda tangan & stempel untuk dipakai pada dokumen resmi." cta="Tambah Penanda Tangan" onCta={openAdd} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {signers.map((s) => <SignerCard key={s.id} signer={s} onToggle={toggle} onEdit={openEdit} onDelete={del} onUpload={upload} />)}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal && modal.mode === "add" ? "Tambah Penanda Tangan" : "Edit Penanda Tangan"} subtitle={"Entitas " + entity}
        footer={modal && <><OutlineBtn onClick={() => setModal(null)}>Batal</OutlineBtn><PrimaryBtn icon="check" onClick={save}>Simpan</PrimaryBtn></>}>
        {modal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <FloatingInput label="Nama Lengkap" value={modal.data.name} onChange={(v) => setModal({ ...modal, data: { ...modal.data, name: v } })} full />
              <FloatingInput label="Jabatan" value={modal.data.title} onChange={(v) => setModal({ ...modal, data: { ...modal.data, title: v } })} full />
            </div>
            <div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 10 }}>Jenis Dokumen</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {DOC_TYPES.map((d) => <PillToggle key={d.id} label={d.label} active={modal.data.types.includes(d.id)} onClick={() => toggleType(d.id)} />)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <UploadBox value={modal.data.sig} onChange={(v) => setModal({ ...modal, data: { ...modal.data, sig: v } })} label="Tanda Tangan" icon="pen" height={110} />
              <UploadBox value={modal.data.stamp} onChange={(v) => setModal({ ...modal, data: { ...modal.data, stamp: v } })} label="Stempel" icon="stamp" height={110} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- profile skeleton ---------- */
function ProfileSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {[0, 1].map((i) => (
        <Card key={i}>
          <Skel w={160} h={12} style={{ marginBottom: 20 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[0, 1, 2, 3].map((j) => <Skel key={j} h={56} r={11} style={{ flex: "1 1 calc(50% - 8px)" }} />)}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ===================== PAGE SHELL ===================== */
export default function EntitySettingsPage({ onHome }) {
  const [entity, setEntity] = useState("MSI");
  const [tab, setTab] = useState("profile");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fade, setFade] = useState(false);
  const [fireToast, toastNode] = useToast();

  useEffect(() => { const t = setTimeout(() => setLoading(false), 850); return () => clearTimeout(t); }, []);

  function switchEntity(id) {
    if (id === entity) return;
    setFade(true);
    setTimeout(() => { setEntity(id); setDirty(false); setFade(false); }, 200);
  }

  const tabs = [
    { id: "profile", label: "Company Profile", icon: "building2", dot: dirty },
    { id: "banks",   label: "Bank Accounts",   icon: "bank" },
    { id: "signers", label: "Signatories & Stamps", icon: "pen" },
  ];

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Entity Settings" }]}
        title="Entity Settings" subtitle="Profil perusahaan, rekening bank & penanda tangan per entitas"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {loading ? <ProfileSkeleton /> : (
        <div key={entity + tab} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "ak-rise"}>
          {tab === "profile" && <CompanyProfileTab entity={entity} onDirtyChange={setDirty} fireToast={fireToast} />}
          {tab === "banks" && <BankAccountsTab entity={entity} fireToast={fireToast} />}
          {tab === "signers" && <SignatoriesTab entity={entity} fireToast={fireToast} />}
        </div>
      )}
      {toastNode}
    </div>
  );
}
