/* =========================================================================
   MasterSelect — floating-label select (gaya FloatingSelect, 56px) untuk
   dropdown yang sumber opsinya tabel `dropdown_options` (master data
   bertingkat, bukan daftar literal di kode).

   Batch DS 3 Lead Management, Paket 1 irisan 3 — infrastruktur rule 5
   mockup Lead Management ("manager menambah langsung, sales mengajukan,
   peran lain hanya membaca"). Lihat migrasi
   20261011000002_crm_lead_master_data_requests.sql.

   KOMPONEN INI MURNI PRESENTASIONAL — sama seperti kontrol lain di
   src/kit/, ia TIDAK memanggil Supabase maupun useAuth. Pemanggil yang
   bertanggung jawab:
     1. Mengambil `options` (mis. lewat useDropdownOptions atau fetch
        serupa yang di-scope company_id) dan meneruskannya sebagai prop.
     2. Menyediakan `onRequestNew` kalau ingin baris "+ Ajukan pilihan
        baru…" muncul di akhir daftar — biasanya ini membuka
        RequestNewOptionModal (src/modules/crm/components/), yang BARU
        menyentuh Supabase (insert dropdown_option_requests ATAU panggil
        add_dropdown_option_direct, sesuai role manager/sales).

   Baris "+ Ajukan…" sengaja sentinel di DALAM <select> (bukan tombol
   terpisah di luar) supaya tetap satu kontrol accessible dan konsisten
   dengan FloatingSelect; memilihnya TIDAK mengubah `value` yang
   dikendalikan pemanggil — onChange untuk sentinel itu dicegat di sini
   dan diteruskan ke onRequestNew(), bukan ke onChange biasa, lalu select
   kembali menampilkan `value` lama pada render berikutnya.

   Belum dipakai di halaman nyata manapun pada irisan ini (menunggu
   LeadDetailPage/LeadCapturePage, Paket 1 irisan 4+).
   ========================================================================= */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  INK, INK_SOFT, LINE, DISABLED_BG, DISABLED_INK, INPUT_BG, FOCUS_RING,
  SEMANTIC, FONT_BODY, RADIUS, SIZE, MOTION,
} from './tokens';

const REQUEST_NEW_VALUE = '__request_new__';

const flexOf = (full, half, third) =>
  (full ? '1 1 100%' : third ? '1 1 calc(33.333% - 11px)' : half ? '1 1 calc(50% - 8px)' : '1 1 calc(50% - 8px)');
const optVal = (o) => (typeof o === 'string' ? o : o.value);
const optLabel = (o) => (typeof o === 'string' ? o : o.label);

function Note({ hint, error }) {
  if (!hint && !error) return null;
  return (
    <div style={{ fontSize: 11, color: error ? SEMANTIC.danger.fg : INK_SOFT, marginTop: 5, marginLeft: 3, fontFamily: FONT_BODY }}>
      {error || hint}
    </div>
  );
}

const borderOf = (focus, error, disabled) =>
  `1px solid ${error ? SEMANTIC.danger.fg : focus ? INK_SOFT : disabled ? DISABLED_BG : LINE}`;

/**
 * @param {Object}   props
 * @param {string}   props.label
 * @param {string}   [props.value]
 * @param {(v: string) => void} props.onChange
 * @param {Array<string|{value:string,label:string}>} [props.options]
 * @param {boolean}  [props.loading]      - true saat `options` masih di-fetch pemanggil
 * @param {() => void} [props.onRequestNew] - ADA → baris "+ Ajukan pilihan baru…" tampil di akhir daftar
 * @param {string}   [props.requestNewLabel='+ Ajukan pilihan baru…']
 * @param {boolean}  [props.half]
 * @param {boolean}  [props.third]
 * @param {boolean}  [props.full]
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.hint]
 * @param {string}   [props.error]
 * @param {string}   [props.id]
 * @param {string}   [props.name]
 * @param {Object}   [props.style]
 */
export function MasterSelect({
  label, value, onChange, options = [], loading, onRequestNew,
  requestNewLabel = '+ Ajukan pilihan baru…',
  half, third, full, disabled, hint, error, id, name, style,
}) {
  const [focus, setFocus] = useState(false);
  const isDisabled = disabled || loading;

  function handleChange(e) {
    const v = e.target.value;
    if (v === REQUEST_NEW_VALUE) {
      onRequestNew?.();
      return; // sentinel bukan nilai asli — `value` terkontrol tetap, select kembali ke pilihan lama
    }
    onChange?.(v);
  }

  return (
    <div style={{ position: 'relative', flex: flexOf(full, half, third), minWidth: 0, ...style }}>
      <label htmlFor={id} style={{
        position: 'absolute', left: 14, top: 7, pointerEvents: 'none', fontFamily: FONT_BODY,
        fontSize: 11, fontWeight: 600, color: error ? SEMANTIC.danger.fg : focus ? INK : INK_SOFT, transition: `color ${MOTION.base}`,
      }}>
        {label}
      </label>
      <select
        id={id} name={name} className="nk-select" value={value ?? ''} disabled={isDisabled}
        aria-invalid={error ? true : undefined}
        onChange={handleChange}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', height: SIZE.inputFloating, borderRadius: RADIUS.md, border: borderOf(focus, error, isDisabled),
          background: isDisabled ? DISABLED_BG : INPUT_BG, padding: '20px 38px 7px 14px',
          fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: isDisabled ? DISABLED_INK : INK,
          appearance: 'none', WebkitAppearance: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
          boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
        }}
      >
        {loading && <option value="">Memuat…</option>}
        {!loading && !value && <option value="" />}
        {!loading && options.map((o) => <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>)}
        {!loading && onRequestNew && <option value={REQUEST_NEW_VALUE}>{requestNewLabel}</option>}
      </select>
      <span style={{ position: 'absolute', right: 14, top: 20, color: INK_SOFT, pointerEvents: 'none' }}>
        <ChevronDown size={16} />
      </span>
      <Note hint={hint} error={error} />
    </div>
  );
}
