/* =========================================================================
   Admin Settings — shared brand tokens, entity list & format helpers.
   Plain constants only (no JSX) so this file stays Fast-Refresh friendly.
   Source: Claude Design handoff (AdminKit.jsx) adapted for Nexus by MSI.
   ========================================================================= */

/* ---------- brand tokens (MSI Brand Guideline v1.0) ---------- */
export const NAVY      = "#1B4D8A";
export const NAVY_DK   = "#0F3666";
export const ORANGE    = "#E85A1E";
export const ORANGE_DK = "#D14E18";
export const CREAM     = "#F6EFE3";
export const SURFACE   = "#FFFDF8";
export const LINE      = "#E5E0D8";
export const LINE_SOFT = "#EFE9DD";
export const ROW_HOVER = "#EEE8DC";
export const INK       = "#16243A";
export const INK_SOFT  = "#4A5360";
export const MUTED     = "#6B7280";
export const FAINT     = "#9CA3AF";
export const DANGER    = "#DC2626";
export const GREEN     = "#1F8B4D";

export const FONT_HEAD = "'Montserrat', system-ui, sans-serif";
export const FONT_BODY = "'Inter', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ---------- entities (Nexus by MSI group) ---------- */
export const ENTITIES = [
  { id: "MSI", code: "MSI", name: "PT Milenial Solusi Internusa" },
  { id: "JCI", code: "JCI", name: "PT Jago Custom Indonesia" },
  { id: "SOA", code: "SOA", name: "PT Stuja Orbit Abadi" },
];

/* ---------- helpers ---------- */
export const fmtRp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
export const fmtNum = (n) => Math.round(n).toLocaleString("id-ID");
