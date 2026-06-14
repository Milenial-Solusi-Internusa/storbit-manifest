/* =========================================================================
   AdminKit — Nexus by MSI · Foundation › Admin Settings
   Shared design kit: lucide-react Icon wrapper + premium interaction
   primitives (floating-label inputs, toggles, slide-over, modal, segmented
   control, entity switcher, save button, drop zones, toast, skeletons).

   Ported from the Claude Design handoff (AdminKit.jsx). Inline icon paths
   were replaced with real lucide-react components per project convention.
   Self-contained, inline styles, no backend.
   ========================================================================= */

import React, { useState, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronLeft, ChevronDown, ArrowLeft, ArrowRight, Building2,
  FileText, Coins, GitBranch, Bell, Shield, ClipboardList, Settings, Plug,
  Plus, Minus, Check, CheckCircle2, X, Pencil, Trash2, Lock, Upload, Image,
  Stamp, PenTool, RefreshCw, Loader, Info, AlertTriangle, Hash, Layout,
  Receipt, Search, Inbox, Quote, ShoppingCart, Globe, MapPin, Phone, Mail,
  Globe2, Calendar, Landmark, Percent, Wallet, Scale, Clock, Banknote,
  AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";

import {
  NAVY, ORANGE, ORANGE_DK, CREAM, SURFACE, LINE, LINE_SOFT, INK, INK_SOFT,
  MUTED, FAINT, DANGER, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO, ENTITIES,
} from "./tokens";

/* ---------- icon registry (name → lucide-react component) ---------- */
const ICONS = {
  chevright: ChevronRight, chevleft: ChevronLeft, chevdown: ChevronDown,
  arrowleft: ArrowLeft, arrowright: ArrowRight, building2: Building2,
  filetext: FileText, coins: Coins, gitbranch: GitBranch, bell: Bell,
  shield: Shield, clipboard: ClipboardList, settings: Settings, plug: Plug,
  plus: Plus, minus: Minus, check: Check, checkcircle: CheckCircle2, x: X,
  pencil: Pencil, trash: Trash2, lock: Lock, upload: Upload, image: Image,
  stamp: Stamp, pen: PenTool, refresh: RefreshCw, loader: Loader, info: Info,
  alert: AlertTriangle, hash: Hash, layout: Layout, receipt: Receipt,
  search: Search, inbox: Inbox, quote: Quote, shoppingcart: ShoppingCart,
  globe: Globe, mappin: MapPin, phone: Phone, mail: Mail, globe2: Globe2,
  calendar: Calendar, bank: Landmark, percent: Percent, wallet: Wallet,
  scale: Scale, clock: Clock, banknote: Banknote, alignleft: AlignLeft,
  aligncenter: AlignCenter, alignright: AlignRight,
};

export function Icon({ name, size = 18, color, style, strokeWidth = 1.7 }) {
  const Cmp = ICONS[name] || Info;
  return (
    <Cmp
      size={size}
      color={color || "currentColor"}
      strokeWidth={strokeWidth}
      style={{ display: "block", flex: "0 0 auto", ...style }}
    />
  );
}

/* =========================================================================
   GLOBAL STYLE BLOCK — keyframes, focus rings, placeholders, scrollbars.
   ========================================================================= */
export function KitStyles() {
  return (
    <style>{`
      @keyframes ak-spin { to { transform: rotate(360deg); } }
      @keyframes ak-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
      @keyframes ak-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
      @keyframes ak-charin { 0% { transform: translateY(5px); } 100% { transform: translateY(0); } }
      @keyframes ak-rise { 0% { transform: translateY(9px); } 100% { transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) { .ak-rise { animation: none !important; } }
      .ak-spin { animation: ak-spin .8s linear infinite; }
      .ak-skel { background: ${LINE}; border-radius: 8px; animation: ak-pulse 1.3s ease-in-out infinite; }
      .ak-rise { animation: ak-rise .32s cubic-bezier(.22,1,.36,1) both; }
      .ak-input:focus, .ak-area:focus, .ak-select:focus { outline: none; }
      .ak-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
      .ak-scroll::-webkit-scrollbar-thumb { background: #D8D0C2; border-radius: 20px; border: 3px solid ${SURFACE}; }
      .ak-scroll::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  );
}

/* =========================================================================
   PAGE HEADER — breadcrumb + title + subtitle + optional back / actions
   ========================================================================= */
export function PageHeader({ crumbs, title, subtitle, onBack, right }) {
  const [bh, setBh] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
      <div style={{ minWidth: 0 }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: FAINT, marginBottom: 10, flexWrap: "wrap" }}>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chevright" size={13} color={FAINT} />}
              {c.onClick ? (
                <button type="button" onClick={c.onClick}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT_BODY, fontSize: 12.5, color: i === crumbs.length - 1 ? INK_SOFT : FAINT, fontWeight: i === crumbs.length - 1 ? 600 : 400, transition: "color .2s", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = NAVY)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = i === crumbs.length - 1 ? INK_SOFT : FAINT)}>
                  {c.label}
                </button>
              ) : (
                <span style={{ color: i === crumbs.length - 1 ? INK_SOFT : FAINT, fontWeight: i === crumbs.length - 1 ? 600 : 400, whiteSpace: "nowrap" }}>{c.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          {onBack && (
            <button type="button" onClick={onBack} onMouseEnter={() => setBh(true)} onMouseLeave={() => setBh(false)}
              style={{ width: 40, height: 40, borderRadius: 11, border: "1px solid " + LINE, background: bh ? CREAM : SURFACE, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "0 0 40px", transition: "all .2s", transform: bh ? "translateX(-2px)" : "none" }}>
              <Icon name="arrowleft" size={19} />
            </button>
          )}
          <div>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, letterSpacing: -0.4, color: NAVY, margin: 0, lineHeight: 1.1 }}>{title}</h1>
            {subtitle && <div style={{ fontSize: 13, color: MUTED, marginTop: 5, fontFamily: FONT_BODY }}>{subtitle}</div>}
          </div>
        </div>
      </div>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div>}
    </div>
  );
}

/* ---------- section header label ---------- */
export function SectionLabel({ children, style }) {
  return (
    <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: NAVY, ...style }}>
      {children}
    </div>
  );
}

/* =========================================================================
   ENTITY SWITCHER — sliding pill indicator (MSI | JCI | SOA)
   ========================================================================= */
export function EntitySwitcher({ value, onChange }) {
  const idx = ENTITIES.findIndex((e) => e.id === value);
  const n = ENTITIES.length;
  return (
    <div style={{ display: "inline-flex", position: "relative", background: CREAM, border: "1px solid " + LINE, borderRadius: 12, padding: 4, gap: 0 }}>
      <div style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${n})`, transform: `translateX(${idx * 100}%)`, background: NAVY, borderRadius: 9, boxShadow: "0 2px 8px rgba(20,70,130,.28)", transition: "transform .32s cubic-bezier(.22,1,.36,1)" }} />
      {ENTITIES.map((e) => {
        const active = e.id === value;
        return (
          <button key={e.id} type="button" onClick={() => onChange(e.id)} title={e.name}
            style={{ position: "relative", zIndex: 1, minWidth: 64, height: 34, padding: "0 16px", border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 13, letterSpacing: 0.3, color: active ? "#fff" : MUTED, transition: "color .25s", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {e.code}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   TAB UNDERLINE — animated sliding underline tabs
   ========================================================================= */
export function Tabs({ tabs, value, onChange }) {
  const [w, setW] = useState({});
  const refs = useRef({});
  useEffect(() => {
    const map = {};
    tabs.forEach((t) => { const el = refs.current[t.id]; if (el) map[t.id] = { left: el.offsetLeft, width: el.offsetWidth }; });
    setW(map);
  }, [tabs.map((t) => t.id).join(","), value]);
  const cur = w[value] || { left: 0, width: 0 };
  return (
    <div style={{ position: "relative", borderBottom: "1px solid " + LINE, display: "flex", gap: 4, marginBottom: 26 }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} type="button" ref={(el) => (refs.current[t.id] = el)} onClick={() => onChange(t.id)}
            style={{ position: "relative", border: "none", background: "transparent", cursor: "pointer", padding: "13px 16px", fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: active ? NAVY : MUTED, display: "flex", alignItems: "center", gap: 8, transition: "color .2s" }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = INK; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = MUTED; }}>
            {t.icon && <Icon name={t.icon} size={16} />}
            {t.label}
            {t.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: ORANGE, marginLeft: 1 }} />}
          </button>
        );
      })}
      <div style={{ position: "absolute", bottom: -1, height: 2.5, background: NAVY, borderRadius: 3, left: cur.left, width: cur.width, transition: "left .3s cubic-bezier(.22,1,.36,1), width .3s cubic-bezier(.22,1,.36,1)" }} />
    </div>
  );
}

/* =========================================================================
   FLOATING-LABEL INPUT
   ========================================================================= */
export function FloatingInput({ label, value, onChange, mono, type = "text", full, half, third, disabled, placeholder, hint }) {
  const [focus, setFocus] = useState(false);
  const floated = focus || (value !== undefined && value !== null && String(value).length > 0);
  const flex = full ? "1 1 100%" : half ? "1 1 calc(50% - 8px)" : third ? "1 1 calc(33.333% - 11px)" : "1 1 calc(50% - 8px)";
  return (
    <div style={{ position: "relative", flex, minWidth: 0 }}>
      <label style={{ position: "absolute", left: 14, pointerEvents: "none", fontFamily: FONT_BODY, transition: "all .2s cubic-bezier(.22,1,.36,1)", top: floated ? 7 : 17, fontSize: floated ? 11 : 13.5, fontWeight: floated ? 600 : 400, color: focus ? NAVY : floated ? INK_SOFT : FAINT, background: "transparent" }}>
        {label}
      </label>
      <input className="ak-input" type={type} value={value} disabled={disabled}
        placeholder={focus ? placeholder : ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ width: "100%", height: 56, borderRadius: 11, border: "1px solid " + (focus ? NAVY : LINE), background: disabled ? CREAM : SURFACE, padding: "20px 14px 7px", fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: mono ? 13.5 : 14, fontWeight: mono ? 500 : 500, color: disabled ? MUTED : INK, letterSpacing: mono ? 0.3 : 0, boxShadow: focus ? "0 0 0 3px rgba(20,70,130,.16)" : "none", transition: "border-color .2s, box-shadow .2s", cursor: disabled ? "not-allowed" : "text" }} />
      {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 5, marginLeft: 3, fontFamily: FONT_BODY }}>{hint}</div>}
    </div>
  );
}

/* ---------- floating-label SELECT ---------- */
export function FloatingSelect({ label, value, onChange, options, half, third, full }) {
  const [focus, setFocus] = useState(false);
  const flex = full ? "1 1 100%" : third ? "1 1 calc(33.333% - 11px)" : half ? "1 1 calc(50% - 8px)" : "1 1 calc(50% - 8px)";
  return (
    <div style={{ position: "relative", flex, minWidth: 0 }}>
      <label style={{ position: "absolute", left: 14, top: 7, pointerEvents: "none", fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: focus ? NAVY : INK_SOFT, transition: "color .2s" }}>{label}</label>
      <select className="ak-select" value={value} onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ width: "100%", height: 56, borderRadius: 11, border: "1px solid " + (focus ? NAVY : LINE), background: SURFACE, padding: "20px 38px 7px 14px", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: INK, appearance: "none", WebkitAppearance: "none", cursor: "pointer", boxShadow: focus ? "0 0 0 3px rgba(20,70,130,.16)" : "none", transition: "border-color .2s, box-shadow .2s" }}>
        {options.map((o) => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}
      </select>
      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-2px)", color: MUTED, pointerEvents: "none" }}><Icon name="chevdown" size={16} /></span>
    </div>
  );
}

/* =========================================================================
   TOGGLE — sliding, orange when active
   ========================================================================= */
export function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!on)}
      style={{ width: 44, height: 25, borderRadius: 20, border: "none", padding: 0, position: "relative", cursor: disabled ? "not-allowed" : "pointer", background: on ? ORANGE : "#CFC8BA", opacity: disabled ? 0.5 : 1, transition: "background .25s ease", flex: "0 0 44px" }}>
      <span style={{ position: "absolute", top: 3, left: 3, width: 19, height: 19, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transform: on ? "translateX(19px)" : "translateX(0)", transition: "transform .25s cubic-bezier(.22,1,.36,1)" }} />
    </button>
  );
}

/* =========================================================================
   NUMBER STEPPER — +/- buttons on hover, suffix
   ========================================================================= */
export function NumberStepper({ value, onChange, suffix, min = 0, max = 9999, step = 1, width = 150 }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const show = hover || focus;
  const StepBtn = ({ dir }) => {
    const [h, setH] = useState(false);
    return (
      <button type="button" tabIndex={-1}
        onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        onClick={() => onChange(clamp((Number(value) || 0) + dir * step))}
        style={{ width: 30, height: "100%", border: "none", borderLeft: dir > 0 ? "1px solid " + LINE : "none", borderRight: dir < 0 ? "1px solid " + LINE : "none", background: h ? NAVY : "transparent", color: h ? "#fff" : MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
        <Icon name={dir > 0 ? "plus" : "minus"} size={14} />
      </button>
    );
  };
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "inline-flex", alignItems: "center", height: 46, width, borderRadius: 11, border: "1px solid " + (focus ? NAVY : LINE), background: SURFACE, overflow: "hidden", boxShadow: focus ? "0 0 0 3px rgba(20,70,130,.16)" : "none", transition: "border-color .2s, box-shadow .2s" }}>
      <div style={{ width: 30, transition: "opacity .18s, width .18s", opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none", height: "100%" }}>{show && <StepBtn dir={-1} />}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
        <input value={value} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); onChange(v === "" ? "" : clamp(Number(v))); }}
          style={{ width: 54, border: "none", background: "transparent", textAlign: "center", fontFamily: FONT_MONO, fontSize: 16, fontWeight: 600, color: INK, outline: "none" }} />
        {suffix && <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: FAINT }}>{suffix}</span>}
      </div>
      <div style={{ width: 30, transition: "opacity .18s", opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none", height: "100%" }}>{show && <StepBtn dir={1} />}</div>
    </div>
  );
}

/* =========================================================================
   SEGMENTED CONTROL — sliding active indicator
   ========================================================================= */
export function Segmented({ options, value, onChange, full }) {
  const idx = options.findIndex((o) => (typeof o === "string" ? o : o.value) === value);
  const n = options.length;
  return (
    <div style={{ display: full ? "flex" : "inline-flex", position: "relative", background: CREAM, border: "1px solid " + LINE, borderRadius: 11, padding: 4, width: full ? "100%" : "auto" }}>
      <div style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${n})`, transform: `translateX(${idx < 0 ? 0 : idx * 100}%)`, background: SURFACE, border: "1px solid " + LINE, borderRadius: 8, boxShadow: "0 1px 3px rgba(20,40,70,.1)", transition: "transform .28s cubic-bezier(.22,1,.36,1)", opacity: idx < 0 ? 0 : 1 }} />
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        const icon = typeof o === "object" ? o.icon : null;
        const active = val === value;
        return (
          <button key={val} type="button" onClick={() => onChange(val)}
            style={{ position: "relative", zIndex: 1, flex: 1, height: 38, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: active ? NAVY : MUTED, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "color .25s", whiteSpace: "nowrap", padding: "0 14px" }}>
            {icon && <Icon name={icon} size={15} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   BUTTONS
   ========================================================================= */
export function PrimaryBtn({ children, onClick, icon, disabled, type = "button" }) {
  const [h, setH] = useState(false);
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 11, border: "none", background: disabled ? "#E7BFA9" : h ? ORANGE_DK : ORANGE, color: "#fff", fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 2px rgba(232,90,30,.3), 0 8px 18px rgba(232,90,30,.18)", transition: "background .2s, transform .12s", transform: h && !disabled ? "translateY(-1px)" : "none" }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = h ? "translateY(-1px)" : "none")}>
      {icon && <Icon name={icon} size={17} />}{children}
    </button>
  );
}
export function OutlineBtn({ children, onClick, icon, danger }) {
  const [h, setH] = useState(false);
  const c = danger ? DANGER : NAVY;
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "0 18px", borderRadius: 11, border: "2px solid " + c, background: h ? (danger ? "rgba(220,38,38,.06)" : "rgba(20,70,130,.05)") : "transparent", color: c, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "background .2s" }}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

/* ---------- SAVE BUTTON — spinner → check "Saved!" → reset ---------- */
export function SaveButton({ onSave, label = "Simpan", variant = "primary" }) {
  const [state, setState] = useState("idle"); // idle | saving | saved
  function go() {
    if (state !== "idle") return;
    setState("saving");
    setTimeout(() => {
      setState("saved");
      onSave && onSave();
      setTimeout(() => setState("idle"), 2000);
    }, 950);
  }
  const isPrimary = variant === "primary";
  const bg = state === "saved" ? GREEN : isPrimary ? ORANGE : NAVY;
  const [h, setH] = useState(false);
  return (
    <button type="button" onClick={go} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, minWidth: 138, padding: "0 22px", borderRadius: 11, border: "none", background: bg, color: "#fff", fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: state === "idle" ? "pointer" : "default", boxShadow: state === "saved" ? "0 6px 16px rgba(31,139,77,.25)" : isPrimary ? "0 6px 16px rgba(232,90,30,.2)" : "0 6px 16px rgba(20,70,130,.2)", transition: "background .3s, filter .2s", filter: h && state === "idle" ? "brightness(1.06)" : "none" }}>
      {state === "idle" && <><Icon name="check" size={17} />{label}</>}
      {state === "saving" && <><span className="ak-spin" style={{ display: "inline-flex" }}><Icon name="loader" size={17} /></span>Menyimpan…</>}
      {state === "saved" && <span style={{ display: "inline-flex", alignItems: "center", gap: 8, animation: "ak-pop .4s ease both" }}><Icon name="checkcircle" size={18} />Tersimpan!</span>}
    </button>
  );
}

/* =========================================================================
   TOOLTIP — fade in on hover with 150ms delay
   ========================================================================= */
export function Tooltip({ label, children, side = "top" }) {
  const [show, setShow] = useState(false);
  const t = useRef(null);
  const pos = side === "top"
    ? { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
    : { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => { t.current = setTimeout(() => setShow(true), 150); }}
      onMouseLeave={() => { clearTimeout(t.current); setShow(false); }}>
      {children}
      <span style={{ position: "absolute", ...pos, background: INK, color: "#fff", fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 500, padding: "6px 10px", borderRadius: 8, whiteSpace: "nowrap", maxWidth: 240, pointerEvents: "none", zIndex: 60, opacity: show ? 1 : 0, transform: pos.transform + (show ? " translateY(0)" : side === "top" ? " translateY(4px)" : " translateY(-4px)"), transition: "opacity .15s ease, transform .15s ease", boxShadow: "0 8px 22px rgba(10,20,40,.25)" }}>
        {label}
      </span>
    </span>
  );
}

/* =========================================================================
   SLIDE-OVER — slide-in from right with backdrop
   ========================================================================= */
export function SlideOver({ open, onClose, title, subtitle, children, footer, width = 480 }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); }
    else { setShown(false); const t = setTimeout(() => setMounted(false), 320); return () => clearTimeout(t); }
  }, [open]);
  if (!mounted) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(22,36,58,.42)", opacity: shown ? 1 : 0, transition: "opacity .3s ease", backdropFilter: "blur(1.5px)" }} />
      <div className="ak-scroll" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width, maxWidth: "94vw", background: SURFACE, boxShadow: "-18px 0 50px rgba(20,40,70,.18)", display: "flex", flexDirection: "column", transform: shown ? "translateX(0)" : "translateX(100%)", transition: "transform .34s cubic-bezier(.22,1,.36,1)", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "22px 24px", borderBottom: "1px solid " + LINE, position: "sticky", top: 0, background: SURFACE, zIndex: 2 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: NAVY, letterSpacing: -0.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid " + LINE, background: SURFACE, color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px", transition: "all .2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = CREAM; e.currentTarget.style.color = INK; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = SURFACE; e.currentTarget.style.color = MUTED; }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: "24px", flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: "16px 24px", borderTop: "1px solid " + LINE, position: "sticky", bottom: 0, background: SURFACE, display: "flex", gap: 10, justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

/* =========================================================================
   MODAL — fade + scale in
   ========================================================================= */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 540 }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); }
    else { setShown(false); const t = setTimeout(() => setMounted(false), 240); return () => clearTimeout(t); }
  }, [open]);
  if (!mounted) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(22,36,58,.45)", opacity: shown ? 1 : 0, transition: "opacity .24s ease", backdropFilter: "blur(2px)" }} />
      <div className="ak-scroll" style={{ position: "relative", width, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", background: SURFACE, borderRadius: 18, boxShadow: "0 24px 70px rgba(20,40,70,.3)", opacity: shown ? 1 : 0, transform: shown ? "scale(1)" : "scale(.95)", transition: "opacity .24s ease, transform .24s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "22px 24px", borderBottom: "1px solid " + LINE }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: NAVY, letterSpacing: -0.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid " + LINE, background: SURFACE, color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ padding: "16px 24px", borderTop: "1px solid " + LINE, display: "flex", gap: 10, justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

/* =========================================================================
   DROP ZONE (logo) & UPLOAD BOX (signature/stamp)
   Uses real FileReader so a chosen image previews immediately.
   ========================================================================= */
export function DropZone({ value, onChange, label = "Lepas logo di sini atau klik untuk unggah", hint = "PNG / SVG · maks 2 MB" }) {
  const [over, setOver] = useState(false);
  const [hov, setHov] = useState(false);
  const inputRef = useRef(null);
  function read(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => onChange(r.result);
    r.readAsDataURL(file);
  }
  if (value) {
    return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ position: "relative", height: 140, borderRadius: 13, border: "1px solid " + LINE, background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <img src={value} alt="logo" style={{ maxWidth: "70%", maxHeight: "70%", objectFit: "contain" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(22,36,58,.55)", display: "flex", alignItems: "center", justifyContent: "center", opacity: hov ? 1 : 0, transition: "opacity .2s" }}>
          <button type="button" onClick={() => onChange(null)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10, border: "1.5px solid #fff", background: "transparent", color: "#fff", fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon name="trash" size={15} />Hapus
          </button>
        </div>
      </div>
    );
  }
  return (
    <div onClick={() => inputRef.current && inputRef.current.click()}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]); }}
      style={{ height: 140, borderRadius: 13, border: "2px dashed " + (over || hov ? ORANGE : LINE), background: over ? "rgba(232,90,30,.05)" : CREAM, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer", transition: "border-color .2s, background .2s", textAlign: "center", padding: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: over || hov ? "rgba(232,90,30,.12)" : SURFACE, border: "1px solid " + (over || hov ? "transparent" : LINE), display: "flex", alignItems: "center", justifyContent: "center", color: over || hov ? ORANGE : NAVY, transition: "all .2s", transform: over ? "translateY(-2px)" : "none" }}>
        <Icon name="upload" size={20} />
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK_SOFT }}>{label}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: FAINT }}>{hint}</div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => read(e.target.files[0])} />
    </div>
  );
}

export function UploadBox({ value, onChange, label, icon = "image", height = 96 }) {
  const [hov, setHov] = useState(false);
  const inputRef = useRef(null);
  function read(file) { if (!file) return; const r = new FileReader(); r.onload = () => onChange(r.result); r.readAsDataURL(file); }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 7 }}>{label}</div>
      <div onClick={() => inputRef.current && inputRef.current.click()}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        onDragOver={(e) => { e.preventDefault(); setHov(true); }}
        onDrop={(e) => { e.preventDefault(); setHov(false); read(e.dataTransfer.files[0]); }}
        style={{ position: "relative", height, borderRadius: 11, border: "1.5px dashed " + (hov ? ORANGE : LINE), background: value ? "#fff" : CREAM, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", transition: "border-color .2s" }}>
        {value ? (
          <>
            <img src={value} alt={label} style={{ maxWidth: "82%", maxHeight: "78%", objectFit: "contain" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(22,36,58,.5)", display: "flex", alignItems: "center", justifyContent: "center", opacity: hov ? 1 : 0, transition: "opacity .2s", color: "#fff", fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 600, gap: 6 }}>
              <Icon name="refresh" size={14} />Ganti
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: hov ? ORANGE : FAINT, transition: "color .2s" }}>
            <Icon name={icon} size={22} />
            <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 500 }}>Unggah</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => read(e.target.files[0])} />
      </div>
    </div>
  );
}

/* =========================================================================
   TOAST
   ========================================================================= */
export function useToast() {
  const [toast, setToast] = useState({ show: false, msg: "", icon: "checkcircle" });
  const fire = (msg, icon) => {
    setToast({ show: true, msg, icon: icon || "checkcircle" });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 2400);
  };
  const node = (
    <div style={{ position: "fixed", right: 24, bottom: 24, display: "flex", alignItems: "center", gap: 10, background: INK, color: "#fff", padding: "13px 18px", borderRadius: 12, fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500, boxShadow: "0 14px 34px rgba(10,20,40,.3)", zIndex: 200, transition: "opacity .25s ease, transform .25s ease", opacity: toast.show ? 1 : 0, transform: toast.show ? "translateY(0)" : "translateY(10px)", pointerEvents: "none" }}>
      <Icon name={toast.icon} size={18} color="#7FD6A0" />{toast.msg}
    </div>
  );
  return [fire, node];
}

/* =========================================================================
   SKELETON LOADER
   ========================================================================= */
export function Skel({ w = "100%", h = 14, r = 8, style }) {
  return <div className="ak-skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/* ---------- card shell ---------- */
export function Card({ children, style, pad = 24 }) {
  return <div style={{ background: SURFACE, border: "1px solid " + LINE, borderRadius: 16, padding: pad, ...style }}>{children}</div>;
}

/* ---------- selectable pill (tag toggle) ---------- */
export function PillToggle({ label, active, onClick, locked }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" onClick={() => !locked && onClick && onClick()}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 20, border: "1.5px solid " + (active ? NAVY : LINE), background: active ? NAVY : h ? CREAM : SURFACE, color: active ? "#fff" : INK_SOFT, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: locked ? "not-allowed" : "pointer", transition: "all .2s", opacity: locked ? 0.85 : 1 }}>
      {active && <Icon name="check" size={14} />}
      {label}
      {locked && <Icon name="lock" size={12} color={active ? "rgba(255,255,255,.7)" : FAINT} />}
    </button>
  );
}
