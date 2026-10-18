/* =========================================================================
   Banner — baris pesan kontekstual di atas konten (bukan toast, tak hilang
   sendiri). Acuan mockup Inquiry Management.dc.html: `Banner/InquiryChanged`,
   `Banner/CreditHold`, `Banner/Onboarding`, `Modal/MarkWon/FirstWin`,
   `Intake/VisitPrefill`, `Detail/NextStep` — kelimanya satu bentuk markup:
   padding 12px 16px, border 1px, radius 10px, ikon 16px, teks 13px Inter,
   aksi opsional di ujung kanan (tombol atau link).

   `tone` memetakan warna via SEMANTIC (warn/info/danger) atau 'neutral' utk
   pesan netral (acuan `Banner/Onboarding`, latar BG bukan warna status).
   ========================================================================= */

import { AlertTriangle, Info, X } from 'lucide-react';
import { SEMANTIC, FONT_BODY, RADIUS, SP } from './tokens';

const TONE_ICON = { warn: AlertTriangle, danger: AlertTriangle, info: Info };

/**
 * @param {Object} props
 * @param {'warn'|'info'|'danger'|'neutral'} [props.tone='warn']
 * @param {React.ReactNode} [props.icon]        - override ikon default per tone
 * @param {React.ReactNode} props.children
 * @param {React.ReactNode} [props.action]      - tombol/link di ujung kanan (acuan "Create Revision"/"Dismiss")
 * @param {() => void} [props.onDismiss]        - render X kecil bila diisi
 * @param {Object} [props.style]
 */
export function Banner({ tone = 'warn', icon, children, action, onDismiss, style }) {
  const t = tone === 'neutral' ? SEMANTIC.neutral : SEMANTIC[tone] || SEMANTIC.warn;
  const Typed = TONE_ICON[tone];
  return (
    <div
      role="status"
      style={{
        padding: '12px 16px', background: t.bg, border: `1px solid ${t.bd}`, borderRadius: RADIUS.md,
        color: t.fg, display: 'flex', gap: SP.s3, alignItems: 'center', flexWrap: 'wrap',
        fontFamily: FONT_BODY, fontSize: 13, fontWeight: 400, ...style,
      }}
    >
      {icon !== undefined ? icon : (Typed && <Typed size={16} strokeWidth={1.7} style={{ flex: '0 0 auto' }} />)}
      <span style={{ flex: 1, minWidth: 240 }}>{children}</span>
      {action}
      {onDismiss && (
        <button
          type="button" onClick={onDismiss} aria-label="Dismiss"
          style={{ background: 'transparent', border: 0, color: t.fg, cursor: 'pointer', display: 'flex', padding: 0 }}
        >
          <X size={16} strokeWidth={1.7} />
        </button>
      )}
    </div>
  );
}
