/* =========================================================================
   GeneralPreferencesPage — Nexus by MSI · Admin Settings › General Preferences
   Localization, formatting & display preferences, per entity. Settings-row
   layout (label/description left, control right) grouped into cards with a
   per-section Save button.

   Ported from the Claude Design handoff (GeneralPreferences.jsx). Layout &
   styling preserved verbatim; shared-scope refs replaced with ES imports
   from ./kit + ./tokens. Data persisted to localStorage per entity
   (TODO: migrate to a DB settings table once available). Default entity
   derived from the signed-in user's company via useAuth.
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../contexts/useAuth";
import {
  Icon, PageHeader, EntitySwitcher, Tabs, Segmented, Toggle, KitSelect,
  SaveButton, Card, useToast, KitStyles,
} from "./kit";
import { DropdownManagementBody } from "./DropdownManagementPage";
import {
  NAVY, ORANGE, CREAM, LINE, LINE_SOFT, INK, MUTED, GREEN,
  FONT_HEAD, FONT_BODY,
} from "./tokens";

/* ---------- entity code ← companies.id (default selection from useAuth) ---------- */
const ENTITY_CODE_BY_ID = {
  "0e1840d8-e6fb-4190-bd09-88338e68b492": "MSI",
  "42569e7c-531b-4d2b-832a-d5a7268c455b": "JCI",
  "d2e5e565-5f67-4954-b8d9-5979a2a0c697": "SOA",
};

const GP_LANGS = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "English" },
];
const GP_TZ = [
  { value: "wib",  label: "WIB · GMT+7 (Jakarta)" },
  { value: "wita", label: "WITA · GMT+8 (Makassar)" },
  { value: "wit",  label: "WIT · GMT+9 (Jayapura)" },
];
const GP_DATEFMT = [
  { value: "dmy_slash", label: "31/12/2025" },
  { value: "dmy_dash",  label: "31-12-2025" },
  { value: "ymd",       label: "2025-12-31" },
  { value: "long",      label: "31 Desember 2025" },
];
const GP_NUMFMT = [
  { value: "id", label: "1.234.567,89" },
  { value: "en", label: "1,234,567.89" },
];
const GP_CURR = [
  { value: "rp",  label: "Rp 1.250.000" },
  { value: "idr", label: "IDR 1.250.000" },
  { value: "sym", label: "1.250.000" },
];
const GP_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const GP_ACCENTS = [
  { value: "orange", color: ORANGE, label: "Oranye" },
  { value: "navy",   color: NAVY,   label: "Navy" },
  { value: "teal",   color: "#0E8A8A", label: "Teal" },
  { value: "green",  color: GREEN,  label: "Hijau" },
  { value: "violet", color: "#6D4AC4", label: "Violet" },
];

/* ---------- persisted defaults (localStorage fallback) ---------- */
const GP_DEFAULTS = {
  lang: "id", tz: "wib", dateFmt: "dmy_slash", timeFmt: "24h", numFmt: "id", curr: "rp",
  theme: "light", density: "nyaman", accent: "orange", sidebar: "open", animations: true,
  firstDay: "mon", fiscalStart: "0", weekend: true,
};
const GP_KEY = (entity) => "general_prefs_" + entity;

/* ---------- one setting row ---------- */
function GPRow({ title, desc, children, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "17px 0", borderBottom: last ? "none" : "1px solid " + LINE_SOFT, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, color: INK }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.5, textWrap: "pretty" }}>{desc}</div>}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "flex-end" }}>{children}</div>
    </div>
  );
}

/* ---------- section card with header + per-section save ---------- */
function GPSection({ icon, title, desc, children, onSave }) {
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

/* ---------- accent swatch picker ---------- */
function GPAccent({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {GP_ACCENTS.map((a) => {
        const active = a.value === value;
        return (
          <button key={a.value} type="button" onClick={() => onChange(a.value)} title={a.label}
            style={{ width: 34, height: 34, borderRadius: 10, background: a.color, border: "2px solid " + (active ? INK : "transparent"), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: active ? "0 0 0 3px " + CREAM + ", 0 0 0 4px " + a.color : "none", transition: "all .15s" }}>
            {active && <Icon name="check" size={16} color="#fff" />}
          </button>
        );
      })}
    </div>
  );
}

export default function GeneralPreferencesPage({ onHome }) {
  const { profile } = useAuth();
  const [entity, setEntity] = useState("MSI");
  const [fade, setFade] = useState(false);
  const [fireToast, toastNode] = useToast();

  // localization
  const [lang, setLang] = useState(GP_DEFAULTS.lang);
  const [tz, setTz] = useState(GP_DEFAULTS.tz);
  const [dateFmt, setDateFmt] = useState(GP_DEFAULTS.dateFmt);
  const [timeFmt, setTimeFmt] = useState(GP_DEFAULTS.timeFmt);
  const [numFmt, setNumFmt] = useState(GP_DEFAULTS.numFmt);
  const [curr, setCurr] = useState(GP_DEFAULTS.curr);

  // appearance
  const [theme, setTheme] = useState(GP_DEFAULTS.theme);
  const [density, setDensity] = useState(GP_DEFAULTS.density);
  const [accent, setAccent] = useState(GP_DEFAULTS.accent);
  const [sidebar, setSidebar] = useState(GP_DEFAULTS.sidebar);
  const [animations, setAnimations] = useState(GP_DEFAULTS.animations);

  // regional
  const [firstDay, setFirstDay] = useState(GP_DEFAULTS.firstDay);
  const [fiscalStart, setFiscalStart] = useState(GP_DEFAULTS.fiscalStart);
  const [weekend, setWeekend] = useState(GP_DEFAULTS.weekend);

  // Default the entity switcher to the signed-in user's company (once).
  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current || !profile?.company_id) return;
    initDone.current = true;
    const code = ENTITY_CODE_BY_ID[profile.company_id];
    if (code) setEntity(code);
  }, [profile?.company_id]);

  // Load persisted settings whenever the active entity changes.
  // TODO: replace localStorage with a DB settings table (per-entity).
  useEffect(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(GP_KEY(entity)) || "{}") || {}; } catch (e) { saved = {}; }
    const s = { ...GP_DEFAULTS, ...saved };
    setLang(s.lang); setTz(s.tz); setDateFmt(s.dateFmt); setTimeFmt(s.timeFmt);
    setNumFmt(s.numFmt); setCurr(s.curr); setTheme(s.theme); setDensity(s.density);
    setAccent(s.accent); setSidebar(s.sidebar); setAnimations(s.animations);
    setFirstDay(s.firstDay); setFiscalStart(s.fiscalStart); setWeekend(s.weekend);
  }, [entity]);

  function switchEntity(id) { if (id === entity) return; setFade(true); setTimeout(() => { setEntity(id); setFade(false); }, 200); }

  function persist() {
    const payload = { lang, tz, dateFmt, timeFmt, numFmt, curr, theme, density, accent, sidebar, animations, firstDay, fiscalStart, weekend };
    try { localStorage.setItem(GP_KEY(entity), JSON.stringify(payload)); } catch (e) { /* ignore quota/availability */ }
  }
  const save = (label) => { persist(); fireToast(label + " disimpan untuk " + entity); };

  const [tab, setTab] = useState("prefs");

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "General Preferences" }]}
        title="General Preferences"
        subtitle="Lokalisasi, format angka & tanggal, dan preferensi tampilan per entitas"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />

      <Tabs
        tabs={[{ id: "prefs", label: "Preferensi Umum" }, { id: "dropdown", label: "Dropdown Management" }]}
        value={tab}
        onChange={setTab}
      />

      {tab === "prefs" && (
      <div key={entity} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease" }} className={fade ? "" : "ak-rise"}>
        <GPSection icon="globe" title="Lokalisasi" desc="Bahasa, zona waktu, dan format regional" onSave={() => save("Lokalisasi")}>
          <GPRow title="Bahasa" desc="Bahasa antarmuka untuk seluruh pengguna entitas ini.">
            <KitSelect value={lang} onChange={setLang} options={GP_LANGS} width={240} icon="globe2" />
          </GPRow>
          <GPRow title="Zona Waktu" desc="Digunakan untuk timestamp dokumen & laporan.">
            <KitSelect value={tz} onChange={setTz} options={GP_TZ} width={240} icon="clock" />
          </GPRow>
          <GPRow title="Format Tanggal" desc="Cara tanggal ditampilkan di seluruh sistem.">
            <KitSelect value={dateFmt} onChange={setDateFmt} options={GP_DATEFMT} width={240} icon="calendar" />
          </GPRow>
          <GPRow title="Format Waktu" desc="Tampilan jam 24 jam atau 12 jam (AM/PM)." last>
            <Segmented value={timeFmt} onChange={setTimeFmt} options={[{ value: "24h", label: "24 Jam" }, { value: "12h", label: "12 Jam" }]} />
          </GPRow>
        </GPSection>

        <GPSection icon="banknote" title="Format Angka & Mata Uang" desc="Pemisah ribuan, desimal, dan tampilan nominal" onSave={() => save("Format angka")}>
          <GPRow title="Format Angka" desc="Pemisah ribuan dan desimal untuk seluruh nilai numerik.">
            <KitSelect value={numFmt} onChange={setNumFmt} options={GP_NUMFMT} width={240} icon="hash" />
          </GPRow>
          <GPRow title="Tampilan Mata Uang" desc="Cara nominal rupiah ditampilkan pada dokumen." last>
            <KitSelect value={curr} onChange={setCurr} options={GP_CURR} width={240} icon="wallet" />
          </GPRow>
        </GPSection>

        <GPSection icon="layout" title="Tampilan" desc="Tema, kepadatan, dan aksen antarmuka" onSave={() => save("Tampilan")}>
          <GPRow title="Tema" desc="Mode terang, gelap, atau mengikuti sistem perangkat.">
            <Segmented value={theme} onChange={setTheme} options={[{ value: "light", label: "Terang" }, { value: "dark", label: "Gelap" }, { value: "system", label: "Sistem" }]} />
          </GPRow>
          <GPRow title="Kepadatan" desc="Jarak antar elemen pada tabel & daftar.">
            <Segmented value={density} onChange={setDensity} options={[{ value: "ringkas", label: "Ringkas" }, { value: "nyaman", label: "Nyaman" }, { value: "lega", label: "Lega" }]} />
          </GPRow>
          <GPRow title="Warna Aksen" desc="Warna utama tombol & elemen interaktif.">
            <GPAccent value={accent} onChange={setAccent} />
          </GPRow>
          <GPRow title="Sidebar Default" desc="Status sidebar saat aplikasi pertama dibuka.">
            <Segmented value={sidebar} onChange={setSidebar} options={[{ value: "open", label: "Terbuka" }, { value: "collapsed", label: "Tertutup" }]} />
          </GPRow>
          <GPRow title="Animasi Antarmuka" desc="Transisi & efek gerak. Matikan untuk performa maksimal." last>
            <Toggle on={animations} onChange={setAnimations} />
          </GPRow>
        </GPSection>

        <GPSection icon="calendar" title="Preferensi Regional" desc="Awal pekan & tahun fiskal" onSave={() => save("Preferensi regional")}>
          <GPRow title="Hari Pertama Pekan" desc="Hari awal pada tampilan kalender.">
            <Segmented value={firstDay} onChange={setFirstDay} options={[{ value: "mon", label: "Senin" }, { value: "sun", label: "Minggu" }]} />
          </GPRow>
          <GPRow title="Awal Tahun Fiskal" desc="Bulan dimulainya periode pembukuan keuangan.">
            <KitSelect value={fiscalStart} onChange={setFiscalStart} options={GP_MONTHS.map((m, i) => ({ value: String(i), label: m }))} width={200} icon="receipt" />
          </GPRow>
          <GPRow title="Tandai Akhir Pekan" desc="Sorot Sabtu & Minggu pada kalender dan jadwal." last>
            <Toggle on={weekend} onChange={setWeekend} />
          </GPRow>
        </GPSection>
      </div>
      )}

      {tab === "dropdown" && (
        <div className="gp-dropdown-tab">
          {/* DropdownManagementBody centers its inner grid at max-width:1280 (inline
              style in the embedded body). Inside this tab that makes it look narrow
              vs Tab 1. Defeat the cap so the tree + editor stretch full width —
              scoped to this tab only (direct grandchild = the body's shell/state div). */}
          <style>{`
            .gp-dropdown-tab > div > div { max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; }
          `}</style>
          <DropdownManagementBody />
        </div>
      )}
      {toastNode}
    </div>
  );
}
