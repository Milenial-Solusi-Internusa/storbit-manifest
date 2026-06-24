/* =========================================================================
   IntegrationsPage — Nexus by MSI · Admin Settings › Integrations
   Connector hub: WhatsApp (Waha/WABA), Email SMTP, n8n Webhook, and API
   Keys. Each service is a card with a status badge + configure action;
   forms open in a SlideOver/Modal, the webhook + SMTP have "test"
   simulations, and API keys can be generated / copied / revoked.

   Ported from the Claude Design handoff (Integrations.jsx). Layout &
   styling preserved verbatim; shared-scope refs replaced with ES imports
   from ./kit + ./tokens. Config persisted to the app_settings table
   (category 'integrations') via useAppSettings(). TODO: secrets/tokens
   (wa.token / smtp.pass / API keys) should move to a server-side secret
   store (Supabase Vault / Edge Function env), NOT app_settings jsonb.
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import useAppSettings from "../../../hooks/useAppSettings";
import {
  Icon, PageHeader, Segmented, Toggle, PrimaryBtn, OutlineBtn,
  SlideOver, Modal, useToast, KitStyles,
} from "./kit";
import {
  NAVY, ORANGE, CREAM, SURFACE, LINE, LINE_SOFT, INK, INK_SOFT, MUTED,
  FAINT, DANGER, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO,
} from "./tokens";

// app_settings keys (category 'integrations'). NOTE: wa.token / smtp.pass / API
// keys are sensitive — TODO: migrate sensitive credentials to Supabase Vault /
// Edge Function environment variables (do NOT keep them in app_settings jsonb).
const INT_KEYS = { wa: "wa", smtp: "smtp", hook: "hook", apikeys: "keys" };

/* ---------- status pill ---------- */
function INTStatus({ kind }) {
  const map = {
    connected:  { bg: "#E8F3EC", fg: GREEN,     dot: GREEN,     label: "Terhubung" },
    unconfig:   { bg: "#FBF0DD", fg: "#B45309",  dot: "#D9871F", label: "Belum dikonfigurasi" },
    error:      { bg: "#FBE3E3", fg: "#C0392B",  dot: "#C0392B", label: "Gagal" },
    testing:    { bg: "#EAF0F8", fg: NAVY,       dot: NAVY,      label: "Menguji…" },
  };
  const m = map[kind] || map.unconfig;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 11px", borderRadius: 20, background: m.bg, color: m.fg, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.dot, boxShadow: kind === "connected" ? "0 0 0 3px rgba(31,139,77,.18)" : "none" }} />
      {m.label}
    </span>
  );
}

/* ---------- service card shell ---------- */
function INTServiceCard({ icon, iconBg, iconFg, name, tag, desc, status, children, footer }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: SURFACE, border: "1px solid " + (h ? "#D8D0C2" : LINE), borderRadius: 16, padding: 0, overflow: "hidden", boxShadow: h ? "0 10px 28px rgba(20,40,70,.08)" : "0 1px 2px rgba(20,40,70,.03)", transition: "border-color .2s, box-shadow .2s", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span style={{ width: 50, height: 50, borderRadius: 13, background: iconBg, color: iconFg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 50px" }}><Icon name={icon} size={25} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT_HEAD, fontSize: 16.5, fontWeight: 700, color: NAVY, letterSpacing: -0.2 }}>{name}</span>
            {tag && <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 600, color: MUTED, background: CREAM, border: "1px solid " + LINE_SOFT, borderRadius: 6, padding: "2px 7px", letterSpacing: 0.3 }}>{tag}</span>}
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 1.5, textWrap: "pretty" }}>{desc}</div>
        </div>
        <INTStatus kind={status} />
      </div>
      {children && <div style={{ padding: "0 22px 4px" }}>{children}</div>}
      {footer && <div style={{ marginTop: "auto", padding: "16px 22px", borderTop: "1px solid " + LINE_SOFT, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{footer}</div>}
    </div>
  );
}

/* ---------- compact key/value detail ---------- */
function INTField({ label, value, mono }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: FAINT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: 13, fontWeight: 600, color: INK, wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

/* ---------- labelled text input for forms ---------- */
function INTInput({ label, value, onChange, placeholder, type = "text", mono, full, half }) {
  const [f, setF] = useState(false);
  const flex = full ? "1 1 100%" : half ? "1 1 calc(50% - 7px)" : "1 1 100%";
  return (
    <div style={{ flex, minWidth: 0 }}>
      <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 7 }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", height: 46, borderRadius: 11, border: "1px solid " + (f ? NAVY : LINE), background: SURFACE, padding: "0 14px", fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: mono ? 13 : 14, fontWeight: 500, color: INK, outline: "none", boxShadow: f ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
    </div>
  );
}

function INTLabel({ children }) {
  return <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>{children}</div>;
}

/* ---------- small ghost / solid buttons ---------- */
function INTGhostBtn({ children, icon, onClick, danger }) {
  const [h, setH] = useState(false);
  const c = danger ? DANGER : NAVY;
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 15px", borderRadius: 10, border: "1px solid " + (h ? c : LINE), background: h ? (danger ? "rgba(220,38,38,.06)" : "#EAF0F8") : SURFACE, color: c, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .18s" }}>
      {icon && <Icon name={icon} size={15} />}{children}
    </button>
  );
}

const intRandKey = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
  let s = ""; for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)];
  return "nxs_live_" + s;
};
const intMask = (k) => k.slice(0, 12) + "••••••••••••••••" + k.slice(-4);

/* =========================================================================
   PAGE
   ========================================================================= */
export default function IntegrationsPage({ onHome }) {
  const [fireToast, toastNode] = useToast();

  // DB-backed config (app_settings, scoped to the user's company).
  const { getVal, saveSetting, loading } = useAppSettings('integrations');

  // WhatsApp
  const [waOpen, setWaOpen] = useState(false);
  const [wa, setWa] = useState({ provider: "waha", url: "https://waha.nexus-msi.id", session: "MSI-Sales", token: "••••••••••••", number: "+62 811-2000-441" });
  const [waDraft, setWaDraft] = useState(wa);

  // SMTP
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [smtp, setSmtp] = useState({ configured: false, host: "", port: "587", enc: "tls", user: "", pass: "", fromName: "Nexus by MSI", fromEmail: "" });
  const [smtpDraft, setSmtpDraft] = useState(smtp);
  const [smtpTest, setSmtpTest] = useState("idle"); // idle | testing | ok

  // n8n webhook
  const [hook, setHook] = useState({ url: "https://n8n.nexus-msi.id/webhook/crm-events", active: true });
  const [hookFocus, setHookFocus] = useState(false);
  const [hookTest, setHookTest] = useState("idle");

  // API keys
  const [keys, setKeys] = useState([
    { id: 1, name: "Mobile App (iOS/Android)", key: "nxs_live_8Kd2Mn4pQrLs9vWxYz3aBc7eHj6Tf1U", created: "12 Mar 2026", lastUsed: "Hari ini, 09:41", reveal: false },
    { id: 2, name: "Power BI Connector",        key: "nxs_live_Tn7Vb3Wq9Lm2Px5Rs8Dc4Ef6Hj1Ka", created: "28 Jan 2026", lastUsed: "Kemarin, 18:22", reveal: false },
    { id: 3, name: "Webhook · Marketing",       key: "nxs_live_Qp4Ls9Vn2Mk7Rt3Wx8Bc6Df1Hj5Ea", created: "05 Des 2025", lastUsed: "3 hari lalu",     reveal: false },
  ]);
  const [keyModal, setKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [justMade, setJustMade] = useState(null);
  const seq = useRef(3);

  // Hydrate config from DB once the fetch completes. The `loaded` ref gates the
  // persist effects below so they don't fire during hydration.
  // TODO: migrate sensitive credentials (wa.token / smtp.pass / API keys) to
  // Supabase Vault / Edge Function environment variables — NOT app_settings.
  const loaded = useRef(false);
  useEffect(() => {
    if (loading || loaded.current) return;
    const wa0 = getVal(INT_KEYS.wa, null);
    if (wa0) { setWa(wa0); setWaDraft(wa0); }
    const smtp0 = getVal(INT_KEYS.smtp, null);
    if (smtp0) { setSmtp(smtp0); setSmtpDraft(smtp0); }
    const hook0 = getVal(INT_KEYS.hook, null);
    if (hook0) setHook(hook0);
    const keys0 = getVal(INT_KEYS.apikeys, null);
    if (Array.isArray(keys0)) { setKeys(keys0); seq.current = keys0.reduce((m, k) => Math.max(m, Number(k.id) || 0), 3); }
    loaded.current = true;
  }, [loading, getVal]);

  // Persist each slice whenever it changes (after the initial load). Fire-and-
  // forget upsert to app_settings.
  useEffect(() => { if (loaded.current) saveSetting(INT_KEYS.wa, wa); }, [wa]);
  useEffect(() => { if (loaded.current) saveSetting(INT_KEYS.smtp, smtp); }, [smtp]);
  useEffect(() => { if (loaded.current) saveSetting(INT_KEYS.hook, hook); }, [hook]);
  useEffect(() => { if (loaded.current) saveSetting(INT_KEYS.apikeys, keys); }, [keys]);

  function openWa() { setWaDraft(wa); setWaOpen(true); }
  function saveWa() { setWa(waDraft); setWaOpen(false); fireToast("Konfigurasi WhatsApp disimpan"); }

  function openSmtp() { setSmtpDraft(smtp); setSmtpTest("idle"); setSmtpOpen(true); }
  function testSmtp() {
    setSmtpTest("testing");
    setTimeout(() => { setSmtpTest("ok"); fireToast("Koneksi SMTP berhasil", "checkcircle"); }, 1300);
  }
  function saveSmtp() {
    const ok = smtpDraft.host && smtpDraft.user && smtpDraft.fromEmail;
    setSmtp({ ...smtpDraft, configured: !!ok });
    setSmtpOpen(false);
    fireToast(ok ? "SMTP berhasil dikonfigurasi" : "SMTP disimpan sebagai draft");
  }

  function testHook() {
    if (!hook.url) { fireToast("URL webhook masih kosong", "alert"); return; }
    setHookTest("testing");
    setTimeout(() => { setHookTest("ok"); fireToast("Webhook merespons 200 OK (142 ms)", "checkcircle"); setTimeout(() => setHookTest("idle"), 2500); }, 1200);
  }

  function copyKey(k) {
    try { navigator.clipboard && navigator.clipboard.writeText(k); } catch (e) { /* clipboard unavailable */ }
    fireToast("API key disalin ke clipboard", "copy");
  }
  function revokeKey(id) { setKeys((ks) => ks.filter((k) => k.id !== id)); fireToast("API key dicabut", "trash"); }
  function genKey() {
    if (!newKeyName.trim()) return;
    const k = { id: ++seq.current + 100, name: newKeyName.trim(), key: intRandKey(), created: "Hari ini", lastUsed: "Belum pernah", reveal: true };
    setKeys((ks) => [k, ...ks]);
    setJustMade(k.key);
    setKeyModal(false);
    setNewKeyName("");
    fireToast("API key baru dibuat", "key");
  }

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Integrations" }]}
        title="Integrations"
        subtitle="Konektor eksternal — WhatsApp, email, otomasi & akses API"
        onBack={onHome}
      />

      {loading && <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: MUTED, padding: "2px 2px 12px" }}>Memuat konfigurasi…</div>}

      <div className="ak-rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 18 }}>
        {/* WHATSAPP */}
        <INTServiceCard icon="messagecircle" iconBg="#E6F4EA" iconFg="#1F8B4D" name="WhatsApp" tag={wa.provider === "waha" ? "WAHA" : "WABA"}
          desc="Kirim notifikasi & dokumen ke pelanggan melalui WhatsApp." status="connected"
          footer={<>
            <PrimaryBtn icon="settings" onClick={openWa}>Konfigurasi</PrimaryBtn>
            <INTGhostBtn icon="signal" onClick={() => fireToast("Sesi WhatsApp aktif & tersinkron", "checkcircle")}>Tes Koneksi</INTGhostBtn>
          </>}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "14px 16px", borderRadius: 12, background: CREAM, border: "1px solid " + LINE_SOFT }}>
            <INTField label="Provider" value={wa.provider === "waha" ? "Waha (self-hosted)" : "WhatsApp Business API"} />
            <INTField label="Sesi" value={wa.session} mono />
            <INTField label="Nomor" value={wa.number} mono />
          </div>
        </INTServiceCard>

        {/* EMAIL SMTP */}
        <INTServiceCard icon="mail" iconBg="#EAF0F8" iconFg={NAVY} name="Email SMTP" tag="SMTP"
          desc="Server keluar untuk email notifikasi, invoice & laporan." status={smtp.configured ? "connected" : "unconfig"}
          footer={<>
            <PrimaryBtn icon="settings" onClick={openSmtp}>{smtp.configured ? "Ubah Konfigurasi" : "Konfigurasi"}</PrimaryBtn>
            {smtp.configured && <INTGhostBtn icon="zap" onClick={() => fireToast("Email uji dikirim ke admin", "mail")}>Kirim Email Uji</INTGhostBtn>}
          </>}>
          {smtp.configured ? (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "14px 16px", borderRadius: 12, background: CREAM, border: "1px solid " + LINE_SOFT }}>
              <INTField label="Host" value={smtp.host + ":" + smtp.port} mono />
              <INTField label="Enkripsi" value={smtp.enc.toUpperCase()} />
              <INTField label="Pengirim" value={smtp.fromEmail} mono />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 12, background: "#FBF0DD", border: "1px solid #F0DCB6", color: "#92500B" }}>
              <Icon name="alert" size={17} />
              <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500 }}>Belum dikonfigurasi — notifikasi email nonaktif hingga SMTP diatur.</span>
            </div>
          )}
        </INTServiceCard>

        {/* N8N WEBHOOK */}
        <INTServiceCard icon="webhook" iconBg="#F1ECFB" iconFg="#6D4AC4" name="n8n Webhook" tag="AUTOMATION"
          desc="Teruskan event sistem ke alur kerja otomatis di n8n." status={hook.url && hook.active ? "connected" : "unconfig"}
          footer={<>
            <button type="button" onClick={testHook}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, minWidth: 130, padding: "0 18px", borderRadius: 11, border: "none", background: hookTest === "ok" ? GREEN : NAVY, color: "#fff", fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: hookTest === "testing" ? "default" : "pointer", boxShadow: "0 6px 16px rgba(20,70,130,.2)", transition: "background .3s" }}>
              {hookTest === "idle" && <><Icon name="zap" size={16} />Tes Webhook</>}
              {hookTest === "testing" && <><span className="ak-spin" style={{ display: "inline-flex" }}><Icon name="loader" size={16} /></span>Menguji…</>}
              {hookTest === "ok" && <><Icon name="checkcircle" size={17} />200 OK</>}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>Aktif</span>
              <Toggle on={hook.active} onChange={(v) => setHook((s) => ({ ...s, active: v }))} />
            </div>
          </>}>
          <div>
            <INTLabel>Webhook URL</INTLabel>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}><Icon name="link2" size={16} /></span>
              <input value={hook.url} onChange={(e) => setHook((s) => ({ ...s, url: e.target.value }))} placeholder="https://n8n.example.com/webhook/…"
                onFocus={() => setHookFocus(true)} onBlur={() => setHookFocus(false)}
                style={{ width: "100%", height: 46, borderRadius: 11, border: "1px solid " + (hookFocus ? NAVY : LINE), background: SURFACE, padding: "0 14px 0 38px", fontFamily: FONT_MONO, fontSize: 13, color: INK, outline: "none", boxShadow: hookFocus ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }} />
            </div>
          </div>
        </INTServiceCard>

        {/* API KEYS */}
        <INTServiceCard icon="key" iconBg="#FBEFE5" iconFg={ORANGE} name="API Keys" tag="REST API"
          desc="Kunci akses untuk integrasi pihak ketiga & aplikasi internal." status={keys.length ? "connected" : "unconfig"}
          footer={<PrimaryBtn icon="plus" onClick={() => { setNewKeyName(""); setKeyModal(true); }}>Buat Key Baru</PrimaryBtn>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {keys.map((k) => (
              <INTKeyRow key={k.id} k={k} justMade={justMade} onReveal={() => setKeys((ks) => ks.map((x) => x.id === k.id ? { ...x, reveal: !x.reveal } : x))} onCopy={() => copyKey(k.key)} onRevoke={() => revokeKey(k.id)} />
            ))}
            {keys.length === 0 && (
              <div style={{ padding: "26px", textAlign: "center", color: FAINT, fontFamily: FONT_BODY, fontSize: 13 }}>Belum ada API key. Buat key pertama Anda.</div>
            )}
          </div>
        </INTServiceCard>
      </div>

      {/* WHATSAPP SLIDE-OVER */}
      <SlideOver open={waOpen} onClose={() => setWaOpen(false)} title="Konfigurasi WhatsApp" subtitle="Sambungkan gateway WhatsApp untuk notifikasi keluar"
        footer={<><OutlineBtn onClick={() => setWaOpen(false)}>Batal</OutlineBtn><PrimaryBtn icon="check" onClick={saveWa}>Simpan</PrimaryBtn></>}>
        <INTLabel>Provider</INTLabel>
        <Segmented full value={waDraft.provider} onChange={(v) => setWaDraft((s) => ({ ...s, provider: v }))}
          options={[{ value: "waha", label: "Waha (self-hosted)" }, { value: "waba", label: "WhatsApp Business API" }]} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 20 }}>
          <INTInput full label={waDraft.provider === "waha" ? "Waha Base URL" : "WABA Endpoint"} value={waDraft.url} onChange={(v) => setWaDraft((s) => ({ ...s, url: v }))} placeholder="https://…" mono />
          <INTInput half label="Nama Sesi" value={waDraft.session} onChange={(v) => setWaDraft((s) => ({ ...s, session: v }))} placeholder="MSI-Sales" mono />
          <INTInput half label="Nomor Pengirim" value={waDraft.number} onChange={(v) => setWaDraft((s) => ({ ...s, number: v }))} placeholder="+62 …" mono />
          <INTInput full label="API Token" value={waDraft.token} onChange={(v) => setWaDraft((s) => ({ ...s, token: v }))} placeholder="Token akses" type="password" mono />
        </div>
      </SlideOver>

      {/* SMTP SLIDE-OVER */}
      <SlideOver open={smtpOpen} onClose={() => setSmtpOpen(false)} title="Konfigurasi Email SMTP" subtitle="Server keluar untuk seluruh email sistem" width={520}
        footer={<>
          <button type="button" onClick={testSmtp} disabled={smtpTest === "testing"}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 18px", borderRadius: 11, border: "2px solid " + (smtpTest === "ok" ? GREEN : NAVY), background: "transparent", color: smtpTest === "ok" ? GREEN : NAVY, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: smtpTest === "testing" ? "default" : "pointer", marginRight: "auto" }}>
            {smtpTest === "idle" && <><Icon name="zap" size={16} />Tes Koneksi</>}
            {smtpTest === "testing" && <><span className="ak-spin" style={{ display: "inline-flex" }}><Icon name="loader" size={16} /></span>Menguji…</>}
            {smtpTest === "ok" && <><Icon name="checkcircle" size={17} />Berhasil</>}
          </button>
          <OutlineBtn onClick={() => setSmtpOpen(false)}>Batal</OutlineBtn>
          <PrimaryBtn icon="check" onClick={saveSmtp}>Simpan</PrimaryBtn>
        </>}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <INTInput half label="Host SMTP" value={smtpDraft.host} onChange={(v) => setSmtpDraft((s) => ({ ...s, host: v }))} placeholder="smtp.gmail.com" mono />
          <INTInput half label="Port" value={smtpDraft.port} onChange={(v) => setSmtpDraft((s) => ({ ...s, port: v }))} placeholder="587" mono />
          <div style={{ flex: "1 1 100%" }}>
            <INTLabel>Enkripsi</INTLabel>
            <Segmented full value={smtpDraft.enc} onChange={(v) => setSmtpDraft((s) => ({ ...s, enc: v }))}
              options={[{ value: "none", label: "None" }, { value: "tls", label: "TLS" }, { value: "ssl", label: "SSL" }]} />
          </div>
          <INTInput full label="Username" value={smtpDraft.user} onChange={(v) => setSmtpDraft((s) => ({ ...s, user: v }))} placeholder="noreply@msi.co.id" mono />
          <INTInput full label="Password" value={smtpDraft.pass} onChange={(v) => setSmtpDraft((s) => ({ ...s, pass: v }))} placeholder="••••••••" type="password" mono />
          <INTInput half label="Nama Pengirim" value={smtpDraft.fromName} onChange={(v) => setSmtpDraft((s) => ({ ...s, fromName: v }))} placeholder="Nexus by MSI" />
          <INTInput half label="Email Pengirim" value={smtpDraft.fromEmail} onChange={(v) => setSmtpDraft((s) => ({ ...s, fromEmail: v }))} placeholder="noreply@msi.co.id" mono />
        </div>
      </SlideOver>

      {/* GENERATE API KEY MODAL */}
      <Modal open={keyModal} onClose={() => setKeyModal(false)} title="Buat API Key Baru" subtitle="Beri nama yang menjelaskan penggunaannya" width={480}
        footer={<><OutlineBtn onClick={() => setKeyModal(false)}>Batal</OutlineBtn><PrimaryBtn icon="key" onClick={genKey}>Generate Key</PrimaryBtn></>}>
        <INTInput full label="Nama Key" value={newKeyName} onChange={setNewKeyName} placeholder="mis. Aplikasi Mobile, Power BI…" />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 16, padding: "12px 14px", borderRadius: 11, background: "#FBF0DD", border: "1px solid #F0DCB6", color: "#92500B" }}>
          <Icon name="info" size={16} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 1.5 }}>Key hanya ditampilkan penuh satu kali setelah dibuat. Salin & simpan di tempat aman.</span>
        </div>
      </Modal>

      {/* JUST-CREATED KEY REVEAL */}
      <Modal open={!!justMade} onClose={() => setJustMade(null)} title="API Key Berhasil Dibuat" subtitle="Salin sekarang — key ini tidak akan ditampilkan penuh lagi" width={520}
        footer={<PrimaryBtn icon="copy" onClick={() => { copyKey(justMade); setJustMade(null); }}>Salin & Tutup</PrimaryBtn>}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", borderRadius: 12, background: "#0F2740", border: "1px solid #1C3A5C" }}>
          <Icon name="key" size={18} color="#7FB2E8" />
          <code style={{ flex: 1, fontFamily: FONT_MONO, fontSize: 13.5, fontWeight: 600, color: "#EAF2FB", wordBreak: "break-all" }}>{justMade}</code>
        </div>
      </Modal>

      {toastNode}
    </div>
  );
}

/* ---------- one API key row ---------- */
function INTKeyRow({ k, justMade, onReveal, onCopy, onRevoke }) {
  const [h, setH] = useState(false);
  const fresh = justMade && justMade === k.key;
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 15px", borderRadius: 12, border: "1px solid " + (fresh ? "#CFE0D6" : LINE), background: fresh ? "#F1F8F3" : h ? CREAM : SURFACE, transition: "all .16s" }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: "#FBEFE5", color: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}><Icon name="key" size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: INK }}>{k.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <code style={{ fontFamily: FONT_MONO, fontSize: 12, color: INK_SOFT, letterSpacing: 0.2 }}>{k.reveal ? k.key : intMask(k.key)}</code>
          <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: FAINT }}>· dibuat {k.created} · dipakai {k.lastUsed}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
        <INTIconBtn icon={k.reveal ? "eyeoff" : "eye"} title={k.reveal ? "Sembunyikan" : "Tampilkan"} onClick={onReveal} />
        <INTIconBtn icon="copy" title="Salin" onClick={onCopy} />
        <INTIconBtn icon="trash" title="Cabut" danger onClick={onRevoke} />
      </div>
    </div>
  );
}

function INTIconBtn({ icon, title, onClick, danger }) {
  const [h, setH] = useState(false);
  const c = danger ? DANGER : NAVY;
  return (
    <button type="button" title={title} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid " + (h ? c : LINE), background: h ? (danger ? "rgba(220,38,38,.07)" : "#EAF0F8") : SURFACE, color: h ? c : MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .15s" }}>
      <Icon name={icon} size={15} />
    </button>
  );
}
