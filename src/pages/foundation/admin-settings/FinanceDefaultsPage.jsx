/* =========================================================================
   FinanceDefaultsPage — Nexus by MSI · Admin Settings › Finance Defaults
   Two-column: form (left) + sticky live-calculation summary (right).
   Sections: Tax Configuration · Currency & Exchange · Terms & Defaults.
   Sticky bottom save bar appears when the form is dirty.
   Data layer: Supabase (entity_finance_settings, upsert per company).
   ========================================================================= */

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import {
  Icon, PageHeader, EntitySwitcher, NumberStepper, Segmented, OutlineBtn,
  SaveButton, Tooltip, PillToggle, useToast, Skel, Card, KitStyles,
} from "./kit";
import {
  NAVY, ORANGE, CREAM, SURFACE, LINE, LINE_SOFT, INK, INK_SOFT, MUTED,
  FAINT, DANGER, FONT_HEAD, FONT_BODY, FONT_MONO, fmtRp,
} from "./tokens";

/* ---------- entity code → companies.id ---------- */
const ENTITY_IDS = {
  MSI: "0e1840d8-e6fb-4190-bd09-88338e68b492",
  JCI: "42569e7c-531b-4d2b-832a-d5a7268c455b",
  SOA: "d2e5e565-5f67-4954-b8d9-5979a2a0c697",
};

const FIN_SEED = {
  ppnRate: 11,
  ppnFormula: "A",
  pphRate: 2,
  taxMode: "exclusive",
  currencies: ["IDR", "USD"],
  rateMode: "manual",
  paymentTerms: 30,
  quotationValidity: 14,
  incoterm: "FOB",
  rounding: "round",
};

/* ---------- entity_finance_settings row ⇄ form ---------- */
function finToForm(row) {
  if (!row) return { ...FIN_SEED };
  return {
    ppnRate:           row.ppn_rate ?? FIN_SEED.ppnRate,
    ppnFormula:        row.ppn_formula === "opsi_b" ? "B" : "A",
    pphRate:           row.pph_rate ?? FIN_SEED.pphRate,
    taxMode:           row.tax_mode || FIN_SEED.taxMode,
    currencies:        Array.isArray(row.supported_currencies) && row.supported_currencies.length ? row.supported_currencies : FIN_SEED.currencies,
    rateMode:          row.rate_input_mode || FIN_SEED.rateMode,
    paymentTerms:      row.default_payment_terms ?? FIN_SEED.paymentTerms,
    quotationValidity: row.quotation_validity_days ?? FIN_SEED.quotationValidity,
    incoterm:          row.default_incoterm || FIN_SEED.incoterm,
    rounding:          row.rounding_mode || FIN_SEED.rounding,
  };
}
function formToFin(form, companyId) {
  return {
    company_id:              companyId,
    ppn_rate:                Number(form.ppnRate) || 0,
    ppn_formula:             form.ppnFormula === "B" ? "opsi_b" : "opsi_a",
    pph_rate:                Number(form.pphRate) || 0,
    tax_mode:                form.taxMode,
    supported_currencies:    form.currencies,
    rate_input_mode:         form.rateMode,
    default_payment_terms:   Number(form.paymentTerms) || 0,
    quotation_validity_days: Number(form.quotationValidity) || 0,
    default_incoterm:        form.incoterm,
    rounding_mode:           form.rounding,
  };
}

const CURRENCY_TAGS = [
  { id: "IDR", label: "IDR", locked: true },
  { id: "USD", label: "USD" },
  { id: "EUR", label: "EUR" },
  { id: "SGD", label: "SGD" },
  { id: "CNY", label: "CNY" },
  { id: "MYR", label: "MYR" },
];

const INCOTERMS = [
  { group: "Group E — Departure", items: [{ v: "EXW", l: "EXW · Ex Works" }] },
  { group: "Group F — Main Carriage Unpaid", items: [{ v: "FCA", l: "FCA · Free Carrier" }, { v: "FAS", l: "FAS · Free Alongside Ship" }, { v: "FOB", l: "FOB · Free On Board" }] },
  { group: "Group C — Main Carriage Paid", items: [{ v: "CFR", l: "CFR · Cost and Freight" }, { v: "CIF", l: "CIF · Cost, Insurance & Freight" }, { v: "CPT", l: "CPT · Carriage Paid To" }, { v: "CIP", l: "CIP · Carriage & Insurance Paid" }] },
  { group: "Group D — Arrival", items: [{ v: "DAP", l: "DAP · Delivered At Place" }, { v: "DPU", l: "DPU · Delivered At Place Unloaded" }, { v: "DDP", l: "DDP · Delivered Duty Paid" }] },
];

/* ---------- premium radio card ---------- */
function RadioCard({ selected, onClick, title, desc, locked, lockTip }) {
  const [h, setH] = useState(false);
  const inner = (
    <div onClick={() => !locked && onClick()} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ position: "relative", flex: "1 1 200px", border: "1.5px solid " + (selected ? NAVY : h && !locked ? "#C9D8EC" : LINE), background: selected ? "rgba(20,70,130,.04)" : locked ? CREAM : SURFACE, borderRadius: 13, padding: "14px 16px", cursor: locked ? "not-allowed" : "pointer", transition: "all .2s", opacity: locked ? 0.78 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid " + (selected ? NAVY : "#CFC8BA"), background: selected ? NAVY : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 20px", marginTop: 1, transition: "all .2s" }}>
          {selected && <Icon name="check" size={12} color="#fff" />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: selected ? NAVY : INK }}>{title}</span>
            {locked && <Icon name="lock" size={12} color={FAINT} />}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: MUTED, marginTop: 4, letterSpacing: 0.2 }}>{desc}</div>
        </div>
      </div>
    </div>
  );
  return locked ? <Tooltip label={lockTip} side="top">{inner}</Tooltip> : inner;
}

/* ---------- searchable grouped dropdown ---------- */
function SearchableSelect({ value, onChange, groups }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const cur = groups.flatMap((g) => g.items).find((i) => i.v === value);
  const ql = q.toLowerCase();
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", height: 46, display: "flex", alignItems: "center", gap: 8, borderRadius: 11, border: "1px solid " + (open ? NAVY : LINE), background: SURFACE, padding: "0 14px", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 14, color: INK, boxShadow: open ? "0 0 0 3px rgba(20,70,130,.14)" : "none", transition: "border-color .2s, box-shadow .2s" }}>
        <Icon name="globe" size={16} color={NAVY} />
        <span style={{ flex: 1, textAlign: "left", fontWeight: 500 }}>{cur ? cur.l : "Pilih incoterm…"}</span>
        <span style={{ color: MUTED, transform: open ? "rotate(180deg)" : "none", transition: "transform .25s" }}><Icon name="chevdown" size={16} /></span>
      </button>
      {open && (
        <div className="ak-scroll ak-rise" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: SURFACE, border: "1px solid " + LINE, borderRadius: 13, boxShadow: "0 16px 40px rgba(20,40,70,.16)", zIndex: 40, maxHeight: 320, overflowY: "auto" }}>
          <div style={{ position: "sticky", top: 0, background: SURFACE, padding: 10, borderBottom: "1px solid " + LINE_SOFT }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: FAINT }}><Icon name="search" size={15} /></span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari incoterm…"
                style={{ width: "100%", height: 38, borderRadius: 9, border: "1px solid " + LINE, background: CREAM, padding: "0 12px 0 34px", fontFamily: FONT_BODY, fontSize: 13, color: INK, outline: "none" }} />
            </div>
          </div>
          {groups.map((g) => {
            const items = g.items.filter((i) => i.l.toLowerCase().includes(ql) || i.v.toLowerCase().includes(ql));
            if (!items.length) return null;
            return (
              <div key={g.group} style={{ padding: "6px 0" }}>
                <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: FAINT, padding: "6px 14px 4px" }}>{g.group}</div>
                {items.map((i) => {
                  const sel = i.v === value;
                  return (
                    <button key={i.v} type="button" onClick={() => { onChange(i.v); setOpen(false); setQ(""); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", border: "none", background: sel ? "#EAF0F8" : "transparent", cursor: "pointer", textAlign: "left", transition: "background .12s" }}
                      onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = CREAM; }}
                      onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: NAVY, width: 38 }}>{i.v}</span>
                      <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT, flex: 1 }}>{i.l.split("· ")[1]}</span>
                      {sel && <Icon name="check" size={15} color={NAVY} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- field label ---------- */
function FLabel({ children, hint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK_SOFT, whiteSpace: "nowrap" }}>{children}</span>
      {hint && <Tooltip label={hint}><Icon name="info" size={14} color={FAINT} /></Tooltip>}
    </div>
  );
}
function FinSection({ icon, title, children }) {
  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 20 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#EAF0F8", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}><Icon name={icon} size={18} /></span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: NAVY }}>{title}</span>
      </div>
      {children}
    </Card>
  );
}

/* ---------- live summary line ---------- */
function SumLine({ label, value, strong, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: strong ? "10px 0 2px" : "5px 0" }}>
      <span style={{ fontFamily: FONT_BODY, fontSize: strong ? 13.5 : 12.5, fontWeight: strong ? 700 : 500, color: strong ? INK : MUTED, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: strong ? 17 : 13, fontWeight: strong ? 700 : 500, color: accent ? ORANGE : strong ? NAVY : INK_SOFT, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
function MetaChip({ label }) {
  return <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: MUTED, background: CREAM, border: "1px solid " + LINE, borderRadius: 20, padding: "4px 10px", whiteSpace: "nowrap" }}>{label}</span>;
}

function LiveSummary({ form }) {
  const unit = 10000000, qty = 2, shipping = 500000;
  const subtotal = unit * qty;
  const rate = (Number(form.ppnRate) || 0) / 100;
  let base, ppn, grand;
  if (form.taxMode === "inclusive") {
    const gross = subtotal + shipping;
    base = gross / (1 + rate);
    ppn = gross - base;
    grand = gross;
  } else {
    base = subtotal + shipping;
    ppn = base * rate;
    grand = base + ppn;
  }
  return (
    <div style={{ position: "sticky", top: 18 }}>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 20px", background: NAVY, color: "#fff" }}>
          <span className="ak-spin" style={{ display: "inline-flex", animationDuration: "6s" }}><Icon name="refresh" size={17} /></span>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, letterSpacing: 0.2 }}>Live Preview</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,.16)", padding: "3px 9px", borderRadius: 20 }}>{form.taxMode === "inclusive" ? "Inclusive" : "Exclusive"}</span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 700, color: INK, marginBottom: 12 }}>Contoh Kalkulasi SP</div>
          <SumLine label="Harga Satuan" value={fmtRp(unit)} />
          <SumLine label="Qty" value={"× " + qty} />
          <SumLine label="Pengiriman" value={fmtRp(shipping)} />
          <div style={{ height: 1, background: LINE, margin: "10px 0" }} />
          <SumLine label="Subtotal" value={fmtRp(subtotal)} />
          <SumLine label="Dasar PPN (DPP)" value={fmtRp(base)} />
          <SumLine label={"PPN (" + (form.ppnRate || 0) + "%)"} value={fmtRp(ppn)} accent />
          <div style={{ height: 1, background: LINE, margin: "10px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#EAF0F8", border: "1px solid #CFE0F2", borderRadius: 12, padding: "13px 15px" }}>
            <span style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700, color: NAVY }}>Grand Total</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 19, fontWeight: 700, color: NAVY, letterSpacing: -0.3, whiteSpace: "nowrap" }}>{fmtRp(grand)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
            <MetaChip label={"Termin " + form.paymentTerms + " hari"} />
            <MetaChip label={form.incoterm} />
            <MetaChip label={"PPh " + form.pphRate + "%"} />
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- finance skeleton ---------- */
function FinSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 22, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {[0, 1, 2].map((i) => (
          <Card key={i}><Skel w={180} h={14} style={{ marginBottom: 20 }} /><div style={{ display: "flex", gap: 16 }}><Skel w={150} h={46} r={11} /><Skel w={150} h={46} r={11} /></div><div style={{ display: "flex", gap: 12, marginTop: 20 }}><Skel h={70} r={13} style={{ flex: 1 }} /><Skel h={70} r={13} style={{ flex: 1 }} /></div></Card>
        ))}
      </div>
      <Card><Skel w={120} h={14} style={{ marginBottom: 16 }} />{[0, 1, 2, 3, 4].map((i) => <Skel key={i} h={16} style={{ marginBottom: 12 }} />)}<Skel h={48} r={12} style={{ marginTop: 8 }} /></Card>
    </div>
  );
}

/* ---------- error state (fetch failed) ---------- */
function ErrorState({ msg, onRetry }) {
  return (
    <Card style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.2)", display: "flex", alignItems: "center", justifyContent: "center", color: DANGER, margin: "0 auto 18px" }}><Icon name="alert" size={30} /></div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, color: NAVY }}>Gagal memuat data</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: MUTED, maxWidth: 420, margin: "8px auto 22px", lineHeight: 1.55, textWrap: "pretty" }}>{msg || "Terjadi kesalahan saat mengambil data. Coba lagi."}</div>
      <div style={{ display: "flex", justifyContent: "center" }}><OutlineBtn icon="refresh" onClick={onRetry}>Coba Lagi</OutlineBtn></div>
    </Card>
  );
}

/* ===================== PAGE SHELL ===================== */
export default function FinanceDefaultsPage({ onHome }) {
  const [entity, setEntity] = useState("MSI");
  const [form, setForm] = useState(FIN_SEED);
  const [pristine, setPristine] = useState(FIN_SEED);
  const [dirty, setDirty] = useState(false);
  const [fade, setFade] = useState(false);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [errMsg, setErrMsg] = useState("");
  const [reload, setReload] = useState(0);
  const [fireToast, toastNode] = useToast();

  useEffect(() => {
    let cancelled = false;
    setState("loading"); setDirty(false);
    supabase.from("entity_finance_settings").select("*").eq("company_id", ENTITY_IDS[entity]).limit(1000).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setErrMsg(error.message); setState("error"); return; }
        const mapped = finToForm(data); // data null (first time) → FIN_SEED fallback
        setForm(mapped); setPristine(mapped); setState("ready");
      });
    return () => { cancelled = true; };
  }, [entity, reload]);

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  function switchEntity(id) { if (id === entity) return; setFade(true); setTimeout(() => { setEntity(id); setFade(false); }, 200); }
  function toggleCurrency(id) {
    if (id === "IDR") return;
    setForm((f) => ({ ...f, currencies: f.currencies.includes(id) ? f.currencies.filter((c) => c !== id) : [...f.currencies, id] }));
    setDirty(true);
  }
  const save = async () => {
    const { error } = await supabase.from("entity_finance_settings").upsert(formToFin(form, ENTITY_IDS[entity]), { onConflict: "company_id" });
    if (error) { fireToast("Gagal menyimpan: " + error.message, "alert"); return; }
    setPristine(form); setDirty(false);
    fireToast("Finance defaults " + entity + " tersimpan");
  };

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: "Foundation" }, { label: "Admin Settings", onClick: onHome }, { label: "Finance Defaults" }]}
        title="Finance Defaults" subtitle="Konfigurasi pajak, mata uang & termin pembayaran per entitas"
        onBack={onHome}
        right={<EntitySwitcher value={entity} onChange={switchEntity} />}
      />

      {state === "loading" ? <FinSkeleton /> : state === "error" ? <ErrorState msg={errMsg} onRetry={() => setReload((n) => n + 1)} /> : (
        <div key={entity} className={fade ? "" : "ak-rise"} style={{ opacity: fade ? 0 : 1, transition: "opacity .2s ease", display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 22, alignItems: "start" }}>
          {/* LEFT — form */}
          <div>
            <FinSection icon="percent" title="Konfigurasi Pajak">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
                <div>
                  <FLabel hint="Tarif Pajak Pertambahan Nilai yang berlaku.">Tarif PPN</FLabel>
                  <NumberStepper value={form.ppnRate} onChange={set("ppnRate")} suffix="%" min={0} max={100} width={150} />
                </div>
                <div>
                  <FLabel>Tarif PPh</FLabel>
                  <NumberStepper value={form.pphRate} onChange={set("pphRate")} suffix="%" min={0} max={100} width={150} />
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <FLabel hint="Rumus perhitungan Dasar Pengenaan Pajak.">Formula PPN</FLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <RadioCard selected={form.ppnFormula === "A"} onClick={() => set("ppnFormula")("A")} title="Opsi A — Standar" desc="DPP = DPP × Tarif" />
                  <RadioCard selected={form.ppnFormula === "B"} locked lockTip="Opsi B: DPP × (11/12) × Tarif — mengikuti PMK terbaru. Dikunci, hubungi finance controller." title="Opsi B — Nilai Lain" desc="DPP × 11/12 × Tarif" />
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <FLabel>Mode Pajak</FLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <RadioCard selected={form.taxMode === "exclusive"} onClick={() => set("taxMode")("exclusive")} title="Exclusive" desc="Pajak ditambahkan di atas harga" />
                  <RadioCard selected={form.taxMode === "inclusive"} onClick={() => set("taxMode")("inclusive")} title="Inclusive" desc="Pajak sudah termasuk dalam harga" />
                </div>
              </div>
            </FinSection>

            <FinSection icon="wallet" title="Mata Uang & Kurs">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
                <div>
                  <FLabel>Mata Uang Dasar</FLabel>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 46, padding: "0 18px", borderRadius: 11, background: CREAM, border: "1px solid " + LINE, fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, color: NAVY }}>
                    <Icon name="lock" size={15} color={MUTED} />IDR
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <FLabel>Mata Uang Didukung</FLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                  {CURRENCY_TAGS.map((c) => <PillToggle key={c.id} label={c.label} active={form.currencies.includes(c.id)} locked={c.locked} onClick={() => toggleCurrency(c.id)} />)}
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <FLabel>Mode Input Kurs</FLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <RadioCard selected={form.rateMode === "manual"} onClick={() => set("rateMode")("manual")} title="Manual" desc="Input kurs manual oleh finance" />
                  <div style={{ position: "relative", flex: "1 1 200px" }}>
                    <RadioCard selected={false} locked lockTip="Integrasi kurs harian otomatis — segera hadir." title="Daily" desc="Sinkron kurs otomatis harian" />
                    <span style={{ position: "absolute", top: 12, right: 12, fontFamily: FONT_BODY, fontSize: 10, fontWeight: 600, color: "#fff", background: ORANGE, borderRadius: 20, padding: "3px 9px" }}>Segera Hadir</span>
                  </div>
                </div>
              </div>
            </FinSection>

            <FinSection icon="scale" title="Termin & Default">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
                <div>
                  <FLabel>Termin Pembayaran Default</FLabel>
                  <NumberStepper value={form.paymentTerms} onChange={set("paymentTerms")} suffix="hari" min={0} max={365} width={170} />
                </div>
                <div>
                  <FLabel>Masa Berlaku Quotation</FLabel>
                  <NumberStepper value={form.quotationValidity} onChange={set("quotationValidity")} suffix="hari" min={0} max={365} width={170} />
                </div>
              </div>
              <div style={{ marginTop: 22, maxWidth: 440 }}>
                <FLabel>Incoterm Default</FLabel>
                <SearchableSelect value={form.incoterm} onChange={set("incoterm")} groups={INCOTERMS} />
              </div>
              <div style={{ marginTop: 22 }}>
                <FLabel>Mode Pembulatan</FLabel>
                <Segmented value={form.rounding} onChange={set("rounding")} options={[{ value: "round", label: "Round" }, { value: "floor", label: "Floor" }, { value: "ceil", label: "Ceil" }]} />
              </div>
            </FinSection>
          </div>

          {/* RIGHT — live summary */}
          <LiveSummary form={form} />
        </div>
      )}

      {/* sticky bottom save bar */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", padding: 18, pointerEvents: "none", zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, background: SURFACE, border: "1px solid " + LINE, borderRadius: 14, padding: "12px 14px 12px 22px", boxShadow: "0 16px 40px rgba(20,40,70,.16)", pointerEvents: "auto", maxWidth: 720, width: "calc(100% - 36px)", transform: dirty ? "translateY(0)" : "translateY(160%)", opacity: dirty ? 1 : 0, transition: "transform .42s cubic-bezier(.22,1,.36,1), opacity .3s" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500, color: INK }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} />Ada perubahan belum disimpan
          </span>
          <span style={{ flex: 1 }} />
          <OutlineBtn onClick={() => { setForm(pristine); setDirty(false); }}>Buang</OutlineBtn>
          <SaveButton label="Simpan Perubahan" onSave={save} />
        </div>
      </div>
      {toastNode}
    </div>
  );
}
