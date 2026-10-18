/* =========================================================================
   FileChip — badge nama berkas terlampir. Acuan mockup Inquiry Management
   .dc.html: `{{ wonProof }}` (Modal/MarkWon), `MSDS.pdf`/`Packing List.xlsx`
   (Modal/RequestRates attachments), `{{ adFile }}` (Attach Customer Document,
   Quotation Management.dc.html) — satu bentuk persis di ketiganya: border
   LINE, latar HEAD_BG, teks INK_SOFT, radius 6, ikon paperclip.
   ========================================================================= */

import { Paperclip, X } from 'lucide-react';
import { INK_SOFT, LINE, HEAD_BG, FONT_HEAD } from './tokens';

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {() => void} [props.onRemove]
 */
export function FileChip({ label, onRemove }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 6,
        border: `1px solid ${LINE}`, background: HEAD_BG, color: INK_SOFT,
        fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      <Paperclip size={14} strokeWidth={1.7} style={{ flex: '0 0 auto' }} />
      {label}
      {onRemove && (
        <button
          type="button" onClick={onRemove} aria-label="Hapus lampiran"
          style={{ display: 'flex', background: 'transparent', border: 0, color: INK_SOFT, cursor: 'pointer', padding: 0, marginLeft: 2 }}
        >
          <X size={12} strokeWidth={1.7} />
        </button>
      )}
    </span>
  );
}
