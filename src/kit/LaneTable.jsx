/* =========================================================================
   LaneTable — baris rute pengiriman (POL/POD/Via/Mode), dipakai berulang:
   `Detail/Lanes`, `Intake/Lanes` (mockup Inquiry Management.dc.html).

   VERSI DRAFT (Irisan 1 PLAN) — kolom lokasi TEKS BEBAS (`FloatingInput`),
   BUKAN picker. Versi akhir (dengan `LocationPicker` ber-Location Master)
   menyusul Irisan 6 — JANGAN menambah picker lokasi di sini sebelum itu;
   lihat PLAN §Irisan 6.
   ========================================================================= */

import { Plus, Trash2 } from 'lucide-react';
import { FloatingInput } from './Form';
import { IconButton } from './Button';
import { INK_SOFT, LINE, FONT_BODY, SP } from './tokens';

/** @typedef {{ pol: string, pod: string, via?: string, mode?: string }} Lane */

/**
 * @param {Object} props
 * @param {Lane[]} props.lanes
 * @param {(idx:number, field:keyof Lane, value:string)=>void} props.onChange
 * @param {()=>void} [props.onAdd]
 * @param {(idx:number)=>void} [props.onRemove]
 * @param {boolean} [props.readOnly]
 */
export function LaneTable({ lanes = [], onChange, onAdd, onRemove, readOnly }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s2 }}>
      {lanes.map((lane, i) => (
        <div key={i} style={{ display: 'flex', gap: SP.s2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <FloatingInput label="POL" value={lane.pol} half
            onChange={(v) => onChange?.(i, 'pol', v)} disabled={readOnly} />
          <FloatingInput label="POD" value={lane.pod} half
            onChange={(v) => onChange?.(i, 'pod', v)} disabled={readOnly} />
          <FloatingInput label="Via" value={lane.via || ''} half
            onChange={(v) => onChange?.(i, 'via', v)} disabled={readOnly} />
          <FloatingInput label="Mode" value={lane.mode || ''} half
            onChange={(v) => onChange?.(i, 'mode', v)} disabled={readOnly} />
          {!readOnly && onRemove && (
            <IconButton icon={<Trash2 size={16} />} label="Hapus lane" onClick={() => onRemove(i)}
              style={{ marginTop: 22 }} />
          )}
        </div>
      ))}
      {!readOnly && onAdd && (
        <button
          type="button" onClick={onAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '8px 12px',
            border: `1px dashed ${LINE}`, borderRadius: 8, background: 'transparent', cursor: 'pointer',
            color: INK_SOFT, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500,
          }}
        >
          <Plus size={14} /> Add lane
        </button>
      )}
    </div>
  );
}
