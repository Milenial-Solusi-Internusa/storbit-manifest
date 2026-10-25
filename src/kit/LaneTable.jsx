/* =========================================================================
   LaneTable -- tabel baris rute (POL/POD/Via/Mode/Load unit), dipakai di
   DUA tempat: wizard Intake Form (InquiryIntakeWizardPage.jsx, create) dan
   Detail Inquiry (DealDetailPage.jsx, section "Route Options", edit --
   ronde "Lane Editor", RPC update_inquiry_lanes). Menggantikan draft Irisan 1
   (kolom lokasi `FloatingInput` teks bebas, nol pemakai) -- versi ini SUDAH
   `LocationPicker` ber-Location Master (rule 108 nexus-notes.js) dan
   dropdown Mode/Load unit dari dropdown_options (lane_mode/lane_unit,
   migrasi 20261025000003), diekstrak persis dari InquiryIntakeWizardPage.jsx
   (ronde "Lane Editor", Tahap B) supaya dipakai ulang, bukan diduplikasi.

   TOKEN-AGNOSTIC lewat prop `tokens` (pola sama LocationPicker.jsx/
   RouteStrip.jsx/DocumentFlow.jsx/RelatedDocuments.jsx -- CRM belum migrasi
   kit sage, warna TIDAK dihardcode di sini). Kontrak `tokens` SAMA PERSIS
   dengan `LOCATION_PICKER_TOKENS` yang sudah ada di kedua pemanggil (bg/
   card/border/text/textMute/placeholder/hover/divider/warnBg/warnBorder/
   warnText) -- diteruskan apa adanya ke `LocationPicker` di tiap sel, dan
   dipakai ulang untuk chrome tabel sendiri (heading/kolom/ikon) supaya nol
   kunci token baru perlu diperkenalkan di kedua pemanggil.

   `readOnly` (baru, ronde "Lane Editor"): menyembunyikan Add/Remove/
   Reorder dan menonaktifkan picker/select -- dipakai DealDetailPage utk
   SATU komponen yang sama di mode baca MAUPUN edit (readOnly=true/false),
   bukan dua jalur render terpisah (tabel statis lama + LaneTable). `onMove`
   (baru): reorder naik/turun per baris -- tombol panah sederhana, BUKAN
   drag-and-drop (mockup nol preseden reorder sama sekali; keputusan Mas).

   `unitForMode`/`deriveLaneMode` TIDAK diekspor dari sini -- pindah ke
   `./laneUtils.js` (react-refresh/only-export-components menolak file
   komponen mengekspor apa pun selain komponen) -- impor langsung dari
   sana di pemanggil.

   `showUseColumn`/`onToggleUse` (baru, Putaran 4 Tahap 4C -- mode "Rate
   Sheet Request"): kolom pertama jadi checkbox "Use" (lane.on !== false)
   menggantikan nomor baris -- HANYA dipakai wizard saat inquiry_type =
   'Rate Sheet Request'. Default `showUseColumn` undefined/false -- SEMUA
   pemakai lain (Lane Editor Detail Inquiry, wizard mode Single Shipment)
   TIDAK berubah perilakunya sama sekali. State "on" hidup di FE saja (lihat
   InquiryIntakeWizardPage.jsx) -- komponen ini TIDAK menyaring baris yang
   di-uncheck dari tampilan (semua lane tetap dirender supaya bisa dicentang
   lagi), penyaringan sebelum RPC terjadi di pemanggil. */

import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import LocationPicker from './LocationPicker';
import { unitForMode } from './laneUtils';

const COLS_EDIT = '56px minmax(160px,1fr) minmax(160px,1fr) minmax(140px,1fr) 120px 110px 36px';
const COLS_READONLY = '28px minmax(160px,1fr) minmax(160px,1fr) minmax(140px,1fr) 120px 110px';

export function LaneTable({
  lanes, locations, laneModeOpts, laneUnitOpts, tokens,
  canManageLocations, openLocationMaster, requestNewLocation,
  onUpdate, onRemove, onAdd, onMove, readOnly,
  showUseColumn, onToggleUse,
}) {
  const cols = readOnly ? COLS_READONLY : COLS_EDIT;
  const headers = readOnly
    ? [showUseColumn ? 'Use' : '#', 'POL', 'POD', 'Via port', 'Mode', 'Load unit']
    : [showUseColumn ? 'Use' : '#', 'POL', 'POD', 'Via port', 'Mode', 'Load unit', ''];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h4 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: tokens.text, flex: 1 }}>Route options ({lanes.length})</h4>
        {!readOnly && onAdd && (
          <button type="button" onClick={onAdd}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid ' + tokens.border, background: tokens.card, color: tokens.text, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={14} />Add lane
          </button>
        )}
      </div>
      <div style={{ border: '1px solid ' + tokens.border, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, background: tokens.bg, borderBottom: '1px solid ' + tokens.border }}>
          {headers.map((h, i) => (
            <div key={h || `_${i}`} style={{ padding: '9px 8px', fontFamily: "'Montserrat',sans-serif", fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.textMute }}>{h}</div>
          ))}
        </div>
        {lanes.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', borderBottom: '1px solid ' + tokens.border }}>
            <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
              {showUseColumn ? (
                <input type="checkbox" checked={l.on !== false} onChange={() => onToggleUse?.(i)} disabled={readOnly}
                  title="Include this lane" style={{ width: 16, height: 16, accentColor: tokens.textMute, cursor: readOnly ? 'default' : 'pointer' }} />
              ) : (
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: tokens.textMute }}>{i + 1}</span>
              )}
              {!readOnly && onMove && (
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <button type="button" onClick={() => onMove(i, i - 1)} disabled={i === 0} title="Move up"
                    style={{ background: 'none', border: 0, padding: 0, lineHeight: 0, cursor: i === 0 ? 'not-allowed' : 'pointer', color: i === 0 ? tokens.placeholder : tokens.textMute }}>
                    <ChevronUp size={12} />
                  </button>
                  <button type="button" onClick={() => onMove(i, i + 1)} disabled={i === lanes.length - 1} title="Move down"
                    style={{ background: 'none', border: 0, padding: 0, lineHeight: 0, cursor: i === lanes.length - 1 ? 'not-allowed' : 'pointer', color: i === lanes.length - 1 ? tokens.placeholder : tokens.textMute }}>
                    <ChevronDown size={12} />
                  </button>
                </span>
              )}
            </div>
            <div style={{ padding: '6px 4px' }}>
              <LocationPicker variant="cell" value={l.pol_location_id} textValue={l.pol} options={locations} tokens={tokens}
                placeholder="Port of Loading" invalid={!l.pol_location_id} disabled={readOnly}
                onChange={(id, loc) => onUpdate(i, { pol_location_id: id, pol: loc.name })}
                onManage={canManageLocations ? openLocationMaster : undefined}
                onRequest={canManageLocations ? undefined : requestNewLocation} />
            </div>
            <div style={{ padding: '6px 4px' }}>
              <LocationPicker variant="cell" value={l.pod_location_id} textValue={l.pod} options={locations} tokens={tokens}
                placeholder="Port of Discharge" invalid={!l.pod_location_id} disabled={readOnly}
                onChange={(id, loc) => onUpdate(i, { pod_location_id: id, pod: loc.name })}
                onManage={canManageLocations ? openLocationMaster : undefined}
                onRequest={canManageLocations ? undefined : requestNewLocation} />
            </div>
            <div style={{ padding: '6px 4px' }}>
              <LocationPicker variant="cell" value={l.via_location_id} textValue={l.via} options={locations} tokens={tokens}
                placeholder="Optional" disabled={readOnly}
                onChange={(id, loc) => onUpdate(i, { via_location_id: id, via: loc.name })}
                onManage={canManageLocations ? openLocationMaster : undefined}
                onRequest={canManageLocations ? undefined : requestNewLocation} />
            </div>
            <div style={{ padding: '6px 4px' }}>
              <select value={l.mode || ''} onChange={(e) => onUpdate(i, { mode: e.target.value, load_unit: unitForMode(e.target.value) })} disabled={readOnly}
                style={{ height: 36, width: '100%', borderRadius: 8, border: '1px solid ' + tokens.border, background: readOnly ? tokens.bg : tokens.card, padding: '0 8px', fontSize: 12.5, color: tokens.text }}>
                {laneModeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ padding: '6px 4px' }}>
              <select value={l.load_unit || ''} onChange={(e) => onUpdate(i, { load_unit: e.target.value })} disabled={readOnly}
                style={{ height: 36, width: '100%', borderRadius: 8, border: '1px solid ' + tokens.border, background: readOnly ? tokens.bg : tokens.card, padding: '0 8px', fontSize: 12.5, color: tokens.text }}>
                {laneUnitOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {!readOnly && (
              <div style={{ padding: '6px 4px', display: 'flex', justifyContent: 'center' }}>
                {/* Minimum 1 lane ditegakkan (koreksi atas gap validasi mockup) --
                    tombol hapus disabled di baris terakhir; RPC update_inquiry_lanes
                    menegakkan ulang server-side ("Minimal 1 lane..."). */}
                <button type="button" onClick={() => onRemove(i)} disabled={lanes.length <= 1}
                  style={{ background: 'none', border: 0, cursor: lanes.length <= 1 ? 'not-allowed' : 'pointer', color: lanes.length <= 1 ? tokens.placeholder : tokens.textMute, opacity: lanes.length <= 1 ? 0.6 : 1 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
