/* =========================================================================
   dealOverviewFieldInputs -- Irisan 2 Inquiry, lanjutan audit mockup
   (Pekerjaan B, commit 4). Primitif tampilan floating-label LOKAL untuk
   section inline-edit tab Overview Detail Inquiry (DealDetailPage.jsx).

   SENGAJA TIDAK mengimpor kit sage (`FieldLabel`/`FloatingInput`/
   `FloatingSelect`/`MasterSelect` dari `src/kit/Form.jsx`): CRM/Inquiry
   belum pada gilirannya migrasi kit (CLAUDE.md -- "kit ada != boleh
   diimpor di luar giliran Batch DS"). Ukuran/padding/radius di bawah
   disamakan PIXEL ke mockup Inquiry Management.dc.html (kotak min-height
   56px, padding '20px 14px 7px', radius 10, label mengambang absolute
   top:6/left:14/right:14, font:600 11px). Pola yang SAMA dengan RouteStrip/
   DocumentFlow/RelatedDocuments (Irisan 2 commit 4-6): komponen generik,
   dipakai satu halaman hari ini, tidak dirancang sebagai kit bersama.

   [Putaran 16a Tahap 1] Warna sage lewat ../inquiryTheme.js (`DEAL_C`,
   keputusan J-043 butir 7) -- bukan lagi navy/orange/cream.

   Co-located di `src/modules/crm/`, BUKAN `src/kit/` -- ini bukan komponen
   kit, murni field inline-edit Inquiry.
   ========================================================================= */
import { Lock } from 'lucide-react';
import { DEAL_C as C } from './inquiryTheme';
import { HEAD, BODY } from './DealPanels';
import { FONT_MONO } from './v3/tokens';

const boxBase = {
  width: '100%', minHeight: 56, boxSizing: 'border-box', border: `1px solid ${C.border}`,
  borderRadius: 10, background: C.surfaceAlt, padding: '20px 14px 7px', color: C.text,
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0,
};
const labelStyle = {
  position: 'absolute', top: 6, left: 14, right: 14, display: 'flex', alignItems: 'center',
  gap: 8, fontFamily: BODY, fontSize: 11, fontWeight: 600, color: C.textMute,
  pointerEvents: 'none', zIndex: 1, whiteSpace: 'nowrap',
};
const valueTextStyle = (value, mono) => ({
  fontFamily: mono ? FONT_MONO : BODY, fontSize: mono ? 13.5 : 14,
  fontWeight: value ? (mono ? 400 : 500) : 400, fontStyle: value ? 'normal' : 'italic',
  color: value ? C.text : C.textFaint,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
});

function FieldWrap({ label, span, children }) {
  return (
    <div style={{ position: 'relative', minWidth: 0, gridColumn: span ? `span ${span}` : undefined }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

/** Field teks bebas. `type` meneruskan ke `<input>` (text/date). `mono`
 * dipakai untuk field angka/kode (weight/vol/hs code dkk), font IBM Plex
 * Mono -- pemanggil WAJIB sudah mengonversi angka id-ID lewat
 * `src/lib/numberFormat.js` SEBELUM mengoper `draft`/`value` ke sini --
 * komponen ini murni tampilan, nol parsing angka di dalamnya. */
export function TextField({ label, editing, value, draft, onDraft, mono, type = 'text', placeholder = 'Not set' }) {
  return (
    <FieldWrap label={label}>
      {editing ? (
        <input
          type={type}
          value={draft ?? ''}
          onChange={(e) => onDraft(e.target.value)}
          style={{ ...boxBase, outline: 'none', fontFamily: mono ? FONT_MONO : BODY, fontSize: mono ? 13.5 : 14, fontWeight: mono ? 400 : 500 }}
        />
      ) : (
        <div style={boxBase}>
          <span style={valueTextStyle(value, mono)}>{value || placeholder}</span>
        </div>
      )}
    </FieldWrap>
  );
}

/** Field pilihan tunggal. `options`: array string ATAU array `{value,label}`. */
export function SelectField({ label, editing, value, draft, onDraft, options, placeholder = 'Not set', includeEmpty = false }) {
  return (
    <FieldWrap label={label}>
      {editing ? (
        <select
          value={draft ?? ''}
          onChange={(e) => onDraft(e.target.value)}
          style={{ ...boxBase, outline: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 500, appearance: 'auto' }}
        >
          {includeEmpty && <option value="">Not set</option>}
          {options.map((o) => (typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      ) : (
        <div style={boxBase}>
          <span style={valueTextStyle(value, false)}>{value || placeholder}</span>
        </div>
      )}
    </FieldWrap>
  );
}

/** Field terkunci -- mockup: kotak abu + ikon gembok, dipakai utk "Status"
 * (sumbu deal yang sah ditulis RPC/trigger lain, bukan lewat section ini --
 * ikut mockup sendiri yang TIDAK memasukkan `st` ke whitelist `saveSec`). */
export function LockedField({ label, value }) {
  return (
    <FieldWrap label={label}>
      <div style={{ ...boxBase, background: C.grayBg, justifyContent: 'space-between', color: C.textFaint }}>
        <span style={valueTextStyle(value, false)}>{value}</span>
        <Lock size={14} style={{ flex: 'none', color: C.textFaint }} />
      </div>
    </FieldWrap>
  );
}

/** Field multi-pilih bentuk chip toggle (Incoterms/Container Type/Cargo
 * Type/Additional Services). `options`: array string ATAU array
 * `{id,label}` -- nilai yang disimpan/dibandingkan SELALU `id` (string
 * polos kalau opsinya string), BUKAN label tampilan (lihat komentar
 * `inquiryOptions.js`: "mengubah id = memutus data lama"). */
export function ChipToggleField({ label, editing, values, draft, onDraft, options, span }) {
  const list = editing ? (draft || []) : (values || []);
  const optId = (o) => (typeof o === 'string' ? o : o.id);
  const optLabel = (o) => (typeof o === 'string' ? o : o.label);
  return (
    <FieldWrap label={label} span={span}>
      <div style={boxBase}>
        {editing ? (
          options.map((opt) => {
            const id = optId(opt);
            const on = list.includes(id);
            return (
              <button
                key={id} type="button"
                onClick={() => onDraft(on ? list.filter((x) => x !== id) : [...list, id])}
                style={{
                  height: 24, padding: '0 9px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1px solid ${on ? C.navy : C.border}`, background: on ? C.navySoft : C.surface,
                  color: C.text, fontFamily: HEAD, fontWeight: 700, fontSize: 11.5,
                }}
              >
                {optLabel(opt)}
              </button>
            );
          })
        ) : list.length === 0 ? (
          <span style={{ fontFamily: BODY, fontSize: 14, fontStyle: 'italic', color: C.textFaint }}>Not set</span>
        ) : (
          list.map((v) => {
            const opt = options.find((o) => optId(o) === v);
            return (
              <span key={v} style={{
                display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.textMute,
                fontFamily: HEAD, fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap',
              }}>
                {opt ? optLabel(opt) : v}
              </span>
            );
          })
        )}
      </div>
    </FieldWrap>
  );
}

/** Field teks panjang (Notes). `span` default 3 -- membentang penuh grid
 * 3-kolom section (mockup: Notes satu-satunya field per baris penuh). */
export function TextareaField({ label, editing, value, draft, onDraft, span = 3 }) {
  return (
    <FieldWrap label={label} span={span}>
      {editing ? (
        <textarea
          value={draft ?? ''}
          onChange={(e) => onDraft(e.target.value)}
          rows={4}
          style={{ ...boxBase, minHeight: 100, alignItems: 'flex-start', outline: 'none', fontFamily: BODY, fontSize: 14, fontWeight: 500, resize: 'vertical' }}
        />
      ) : (
        <div style={{ ...boxBase, minHeight: 100, alignItems: 'flex-start' }}>
          <span style={{ ...valueTextStyle(value, false), whiteSpace: 'pre-wrap' }}>{value || 'Not set'}</span>
        </div>
      )}
    </FieldWrap>
  );
}

/** Header section: judul + Edit/Save/Cancel. Gaya tombol Save/Cancel
 * disamakan ke panel inline "Change Inquiry Owner" yang SUDAH ada di
 * DealDetailPage.jsx (satu-satunya presedon Save/Cancel di file ini),
 * bukan ditebak baru -- Edit memakai gaya `ACT_BTN` (tombol aksi toolbar
 * yang sudah ada) pada tinggi 32px (spek mockup, BUKAN 36px `ACT_BTN`). */
export function SectionHeader({ title, editing, canEdit, saving, onEdit, onCancel, onSave }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
      <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>{title}</h3>
      {!editing && canEdit && (
        <button type="button" onClick={onEdit}
          style={{ height: 32, padding: '0 12px', borderRadius: 10, background: 'transparent', border: `1px solid ${C.textMute}`, color: C.text, fontFamily: HEAD, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
          Edit
        </button>
      )}
      {editing && (
        <>
          <button type="button" onClick={onCancel} disabled={saving}
            style={{ height: 32, padding: '0 12px', borderRadius: 10, background: 'transparent', border: '1px solid transparent', color: C.textMute, fontFamily: HEAD, fontWeight: 600, fontSize: 13.5, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving}
            style={{ height: 32, padding: '0 12px', borderRadius: 10, background: C.navy, border: `1px solid ${C.navy}`, color: C.white, fontFamily: HEAD, fontWeight: 600, fontSize: 13.5, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </div>
  );
}
