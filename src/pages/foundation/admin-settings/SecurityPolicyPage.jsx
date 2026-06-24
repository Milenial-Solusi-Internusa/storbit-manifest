/* =========================================================================
   SecurityPolicyPage — Nexus by MSI · Admin Settings › Security Policy
   Password policy, session settings, login protection, and per-role 2FA.
   Settings-row layout in cards with a per-section Save button.

   Ported from the Claude Design handoff (SecurityPolicy.jsx). Layout &
   styling preserved verbatim; shared-scope refs replaced with ES imports
   from ./kit + ./tokens. Settings persisted to the app_settings table
   (category 'security_policy') per entity via useAppSettings(). Default
   entity from useAuth. (TODO: wire to real server-side enforcement.)
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../contexts/useAuth";
import useAppSettings from "../../../hooks/useAppSettings";
import {
  Icon, PageHeader, EntitySwitcher, NumberStepper, Toggle, Segmented,
  SaveButton, Card, useToast, KitStyles,
} from "./kit";
import {
  NAVY, CREAM, SURFACE, LINE, LINE_SOFT, INK, INK_SOFT, MUTED, FAINT,
  DANGER, GREEN, FONT_HEAD, FONT_BODY,
} from "./tokens";

/* ---------- entity code ← companies.id (default selection from useAuth) ---------- */
const ENTITY_CODE_BY_ID = {
  "0e1840d8-e6fb-4190-bd09-88338e68b492": "MSI",
  "42569e7c-531b-4d2b-832a-d5a7268c455b": "JCI",
  "d2e5e565-5f67-4954-b8d9-5979a2a0c697": "SOA",
};
// Selected entity code → company UUID (app_settings.company_id is per-entity).
const ENTITY_ID_BY_CODE = {
  MSI: "0e1840d8-e6fb-4190-bd09-88338e68b492",
  JCI: "42569e7c-531b-4d2b-832a-d5a7268c455b",
  SOA: "d2e5e565-5f67-4954-b8d9-5979a2a0c697",
};

const SEC_ROLES = [
  { value: "super_admin", label: "Super Admin", desc: "Akses penuh sistem" },
  { value: "admin",       label: "Admin",       desc: "Pengelola konfigurasi" },
  { value: "finance",     label: "Finance",     desc: "Keuangan & pembayaran" },
  { value: "manager",     label: "Manager",     desc: "Persetujuan & tim" },
  { value: "sales",       label: "Sales",       desc: "CRM & penjualan" },
  { value: "hrga",        label: "HRGA",        desc: "SDM & umum" },
];

/* ---------- default fallback values (when app_settings has no row) ---------- */
const SEC_DEFAULTS = {
  minLen: 10, reqUpper: true, reqNumber: true, reqSymbol: false, reuse: 3, expiry: 90,
  timeout: 30, maxSessions: 3, rememberMe: true, singleDevice: false,
  maxFails: 5, lockout: 15, captcha: true, notifyLock: true,
  twoFA: { super_admin: true, admin: true, finance: true, manager: false, sales: false, hrga: false },
  twoFAMethod: "app", graceDays: 7,
};

/* ---------- setting row ---------- */
function SECRow({ title, desc, children, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 0", borderBottom: last ? "none" : "1px solid " + LINE_SOFT, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, color: INK }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5, textWrap: "pretty" }}>{desc}</div>}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "flex-end" }}>{children}</div>
    </div>
  );
}

/* ---------- section card ---------- */
function SECSection({ icon, title, desc, children, onSave }) {
  return (
    <Card pad={0} style={{ marginBottom: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderBottom: "1px solid " + LINE_SOFT }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 42px" }}><Icon name={icon} size={21} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 700, color: NAVY, letterSpacing: -0.2 }}>{title}</div>
          {desc && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{desc}</div>}
        </div>
        <SaveButton onSave={onSave} variant="navy" />
      </div>
      <div style={{ padding: "6px 22px 16px" }}>{children}</div>
    </Card>
  );
}

/* ---------- live password-strength preview meter ---------- */
function SECStrength({ minLen, upper, number, symbol }) {
  let score = 1;
  if (minLen >= 8) score++;
  if (minLen >= 12) score++;
  if (upper) score++;
  if (number) score++;
  if (symbol) score++;
  const pct = Math.min(100, Math.round((score / 6) * 100));
  const tier = score <= 2 ? { c: DANGER, t: "Lemah" } : score <= 4 ? { c: "#D9871F", t: "Sedang" } : { c: GREEN, t: "Kuat" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, padding: "13px 16px", borderRadius: 12, background: CREAM, border: "1px solid " + LINE }}>
      <Icon name="shield" size={18} color={tier.c} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>Estimasi kekuatan kebijakan</span>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 700, color: tier.c }}>{tier.t}</span>
        </div>
        <div style={{ height: 7, borderRadius: 99, background: "#E4DDD0", overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: tier.c, transition: "width .3s ease, background .3s ease" }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- per-role 2FA row ---------- */
function SEC2FARow({ role, on, onToggle, last }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 12, border: "1px solid " + (on ? "#CFE0D6" : LINE), background: on ? "#F1F8F3" : h ? CREAM : SURFACE, marginBottom: last ? 0 : 10, transition: "all .18s" }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: on ? GREEN : "#E7E1D6", color: on ? "#fff" : MUTED, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px", transition: "all .18s" }}><Icon name="user" size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: INK }}>{role.label}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{role.desc}</div>
      </div>
      <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: on ? GREEN : FAINT, marginRight: 4 }}>{on ? "Wajib" : "Opsional"}</span>
      <Toggle on={on} onChange={onToggle} />
    </div>
  );
}

export default function SecurityPolicyPage({ onHome }) {
  const { profile } = useAuth();
  const [entity, setEntity] = useState("MSI");
  const [fade, setFade] = useState(false);
  const [fireToast, toastNode] = useToast();

  // DB-backed settings, scoped to the selected entity's company (app_settings).
  const companyId = ENTITY_ID_BY_CODE[entity] || profile?.company_id || null;
  const { getVal, saveSettings, loading } = useAppSettings('security_policy', companyId);

  // password policy
  const [minLen, setMinLen] = useState(SEC_DEFAULTS.minLen);
  const [reqUpper, setReqUpper] = useState(SEC_DEFAULTS.reqUpper);
  const [reqNumber, setReqNumber] = useState(SEC_DEFAULTS.reqNumber);
  const [reqSymbol, setReqSymbol] = useState(SEC_DEFAULTS.reqSymbol);
  const [reuse, setReuse] = useState(SEC_DEFAULTS.reuse);
  const [expiry, setExpiry] = useState(SEC_DEFAULTS.expiry);

  // session
  const [timeout, setTimeoutMin] = useState(SEC_DEFAULTS.timeout);
  const [maxSessions, setMaxSessions] = useState(SEC_DEFAULTS.maxSessions);
  const [rememberMe, setRememberMe] = useState(SEC_DEFAULTS.rememberMe);
  const [singleDevice, setSingleDevice] = useState(SEC_DEFAULTS.singleDevice);

  // login protection
  const [maxFails, setMaxFails] = useState(SEC_DEFAULTS.maxFails);
  const [lockout, setLockout] = useState(SEC_DEFAULTS.lockout);
  const [captcha, setCaptcha] = useState(SEC_DEFAULTS.captcha);
  const [notifyLock, setNotifyLock] = useState(SEC_DEFAULTS.notifyLock);

  // 2FA
  const [twoFA, setTwoFA] = useState(SEC_DEFAULTS.twoFA);
  const [twoFAMethod, setTwoFAMethod] = useState(SEC_DEFAULTS.twoFAMethod);
  const [graceDays, setGraceDays] = useState(SEC_DEFAULTS.graceDays);

  // Default the entity switcher to the signed-in user's company (once).
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current || !profile?.company_id) return;
    initDone.current = true;
    const code = ENTITY_CODE_BY_ID[profile.company_id];
    if (code) setEntity(code);
  }, [profile?.company_id]);

  // Hydrate fields from DB (app_settings). Re-runs when the hook refetches —
  // including when the active entity changes (companyId → new fetch → new getVal).
  useEffect(() => {
    setMinLen(getVal('minLen', SEC_DEFAULTS.minLen));
    setReqUpper(getVal('reqUpper', SEC_DEFAULTS.reqUpper));
    setReqNumber(getVal('reqNumber', SEC_DEFAULTS.reqNumber));
    setReqSymbol(getVal('reqSymbol', SEC_DEFAULTS.reqSymbol));
    setReuse(getVal('reuse', SEC_DEFAULTS.reuse));
    setExpiry(getVal('expiry', SEC_DEFAULTS.expiry));
    setTimeoutMin(getVal('timeout', SEC_DEFAULTS.timeout));
    setMaxSessions(getVal('maxSessions', SEC_DEFAULTS.maxSessions));
    setRememberMe(getVal('rememberMe', SEC_DEFAULTS.rememberMe));
    setSingleDevice(getVal('singleDevice', SEC_DEFAULTS.singleDevice));
    setMaxFails(getVal('maxFails', SEC_DEFAULTS.maxFails));
    setLockout(getVal('lockout', SEC_DEFAULTS.lockout));
    setCaptcha(getVal('captcha', SEC_DEFAULTS.captcha));
    setNotifyLock(getVal('notifyLock', SEC_DEFAULTS.notifyLock));
    setTwoFA({ ...SEC_DEFAULTS.twoFA, ...(getVal('twoFA', SEC_DEFAULTS.twoFA) || {}) });
    setTwoFAMethod(getVal('twoFAMethod', SEC_DEFAULTS.twoFAMethod));
    setGraceDays(getVal('graceDays', SEC_DEFAULTS.graceDays));
  }, [getVal]);

  function switchEntity(id) { if (id === entity) return; setFade(true); setTimeout(() => { setEntity(id); setFade(false); }, 200); }

  const save = async (label) => {
    const payload = { minLen, reqUpper, reqNumber, reqSymbol, reuse, expiry, timeout, maxSessions, rememberMe, singleDevice, maxFails, lockout, captcha, notifyLock, twoFA, twoFAMethod, graceDays };
    const { error } = await saveSettings(payload);
    if (error) fireToast('Gagal menyimpan: ' + (error.message || error), 'alert');
    else fireToast(label + " disimpan untuk " + entity);
  };
  const enabled2FA = Object.values(twoFA).filter(Boolean).length;

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Security Policy" }]}
        title="Security Policy"
        subtitle="Kebijakan kata sandi, sesi, proteksi login & autentikasi dua faktor"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />

      {loading && <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: MUTED, padding: "2px 2px 12px" }}>Memuat pengaturan…</div>}

      <div key={entity} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "ak-rise"}>
        {/* PASSWORD POLICY */}
        <SECSection icon="lock" title="Kebijakan Kata Sandi" desc="Aturan kekuatan & masa berlaku kata sandi" onSave={() => save("Kebijakan kata sandi")}>
          <SECRow title="Panjang Minimum" desc="Jumlah karakter minimal untuk kata sandi baru.">
            <NumberStepper value={minLen} onChange={setMinLen} suffix="char" min={6} max={64} width={150} />
          </SECRow>
          <SECRow title="Wajib Huruf Kapital" desc="Minimal satu huruf besar (A–Z).">
            <Toggle on={reqUpper} onChange={setReqUpper} />
          </SECRow>
          <SECRow title="Wajib Angka" desc="Minimal satu digit angka (0–9).">
            <Toggle on={reqNumber} onChange={setReqNumber} />
          </SECRow>
          <SECRow title="Wajib Simbol" desc="Minimal satu karakter spesial (!@#$…).">
            <Toggle on={reqSymbol} onChange={setReqSymbol} />
          </SECRow>
          <SECRow title="Larang Kata Sandi Berulang" desc="Tidak boleh sama dengan N kata sandi terakhir.">
            <NumberStepper value={reuse} onChange={setReuse} suffix="terakhir" min={0} max={24} width={170} />
          </SECRow>
          <SECRow title="Masa Berlaku" desc="Paksa ganti kata sandi setelah sekian hari. 0 = tanpa kedaluwarsa." last>
            <NumberStepper value={expiry} onChange={setExpiry} suffix="hari" min={0} max={365} width={150} />
          </SECRow>
          <SECStrength minLen={minLen} upper={reqUpper} number={reqNumber} symbol={reqSymbol} />
        </SECSection>

        {/* SESSION */}
        <SECSection icon="clock" title="Pengaturan Sesi" desc="Durasi & batas sesi pengguna" onSave={() => save("Pengaturan sesi")}>
          <SECRow title="Timeout Idle" desc="Logout otomatis setelah tidak ada aktivitas.">
            <NumberStepper value={timeout} onChange={setTimeoutMin} suffix="menit" min={5} max={480} step={5} width={160} />
          </SECRow>
          <SECRow title="Maks. Sesi Bersamaan" desc="Jumlah perangkat aktif per pengguna.">
            <NumberStepper value={maxSessions} onChange={setMaxSessions} suffix="sesi" min={1} max={10} width={150} />
          </SECRow>
          <SECRow title="Izinkan “Ingat Saya”" desc="Perpanjang sesi hingga 30 hari pada perangkat tepercaya.">
            <Toggle on={rememberMe} onChange={setRememberMe} />
          </SECRow>
          <SECRow title="Paksa Satu Perangkat" desc="Login baru otomatis mengakhiri sesi lainnya." last>
            <Toggle on={singleDevice} onChange={setSingleDevice} />
          </SECRow>
        </SECSection>

        {/* LOGIN PROTECTION */}
        <SECSection icon="shield" title="Proteksi Login" desc="Pertahanan terhadap percobaan login berulang" onSave={() => save("Proteksi login")}>
          <SECRow title="Maks. Percobaan Gagal" desc="Kunci akun setelah sekian login gagal beruntun.">
            <NumberStepper value={maxFails} onChange={setMaxFails} suffix="kali" min={3} max={10} width={150} />
          </SECRow>
          <SECRow title="Durasi Penguncian" desc="Lama akun terkunci setelah melewati batas.">
            <NumberStepper value={lockout} onChange={setLockout} suffix="menit" min={1} max={120} step={5} width={160} />
          </SECRow>
          <SECRow title="CAPTCHA Setelah Gagal" desc="Tampilkan verifikasi setelah percobaan gagal pertama.">
            <Toggle on={captcha} onChange={setCaptcha} />
          </SECRow>
          <SECRow title="Notifikasi Penguncian" desc="Kirim email saat sebuah akun terkunci." last>
            <Toggle on={notifyLock} onChange={setNotifyLock} />
          </SECRow>
        </SECSection>

        {/* 2FA */}
        <SECSection icon="smartphone" title="Autentikasi Dua Faktor (2FA)" desc={enabled2FA + " dari " + SEC_ROLES.length + " role mewajibkan 2FA"} onSave={() => save("Pengaturan 2FA")}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "8px 0 16px", borderBottom: "1px solid " + LINE_SOFT, marginBottom: 16 }}>
            <div style={{ flex: "1 1 240px" }}>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>Metode Verifikasi</div>
              <Segmented value={twoFAMethod} onChange={setTwoFAMethod} full
                options={[{ value: "app", label: "Aplikasi", icon: "smartphone" }, { value: "email", label: "Email", icon: "mail" }, { value: "sms", label: "SMS", icon: "phone" }]} />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>Masa Tenggang Pendaftaran</div>
              <NumberStepper value={graceDays} onChange={setGraceDays} suffix="hari" min={0} max={30} width={150} />
            </div>
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 12 }}>Wajibkan 2FA per role</div>
          {SEC_ROLES.map((r, i) => (
            <SEC2FARow key={r.value} role={r} on={!!twoFA[r.value]} onToggle={(v) => setTwoFA((s) => ({ ...s, [r.value]: v }))} last={i === SEC_ROLES.length - 1} />
          ))}
        </SECSection>
      </div>
      {toastNode}
    </div>
  );
}
