/* =========================================================================
   MasterSelect — dropdown custom (tombol + popover absolute), untuk dropdown
   yang sumber opsinya tabel `dropdown_options` (master data bertingkat,
   bukan daftar literal di kode).

   TD-318 Irisan 3 (16 Okt 2026): DIBANGUN ULANG PERSIS
   design-handoff/mockup/MasterSelect.dc.html — menggantikan native
   <select> (versi Batch DS 3 / TD-318 Irisan 0) dengan tombol pemicu +
   popover kustom (`position:absolute`, max-height 280, item 8px/12px radius
   8, centang di item terpilih, tutup saat klik di luar). Dua varian PERSIS
   mockup: default (label di atas kotak, tombol 44px, `FieldLabel` yang sama
   dengan FloatingInput/FloatingSelect/Textarea) dan `variant="box"` (56px,
   label kecil ABSOLUTE di dalam kotak — dipakai Detail/Overview mockup
   untuk Industry/Lead Category, lihat LeadDetailPage.jsx). Placeholder
   default "Select an option"; border invalid `SEMANTIC.warn.bd` (`#E6CE94`,
   PERSIS mockup `bd: p.invalid ? '#E6CE94' : ...` — BUKAN SEMANTIC.danger,
   lihat juga REVISI 2 Irisan 3: validasi field di seluruh modal CRM yang
   memakai MasterSelect kini bernada WARN/amber, bukan DANGER/merah).

   ATURAN PERAN (rule 5, nexus-notes: "manager menambah langsung, sales
   mengajukan, peran lain hanya membaca") — kit TETAP presentasional (nol
   Supabase/useAuth di sini, sama seperti kontrol lain di src/kit/);
   pemanggil yang memutuskan lewat KEBERADAAN dua prop callback, BUKAN
   sebuah prop `role` enum (beda dari mockup yang memakai `role` string
   Sales/Supervisor/Manager — kit versi app ini menaruh keputusan peran di
   pemanggil, PERSIS filosofi header lama "KOMPONEN INI MURNI
   PRESENTASIONAL", kit hanya mengikuti PRESENSI prop):
     a. `onAdd(trimmedName)` ADA  → baris "Add new option" (ikon Plus)
        tampil, diklik berubah jadi input "New option name" + tombol "Add"
        DI DALAM popover; Enter commit, Escape batal (draft TIDAK dibuang
        saat Escape, PERSIS mockup `onKey`/`startAdd` — hanya `adding`
        kembali false, supaya reka ulang perilaku 1:1). `onAdd` dipanggil
        OPTIMISTIK (popover + draft langsung ditutup/dikosongkan, PERSIS
        `commit()` mockup yang murni sinkron) — pemanggil-lah yang
        menjalankan RPC `add_dropdown_option_direct` + memperbarui
        `options`-nya + memanggil `onChange` untuk memilih opsi baru +
        toast sukses/gagal; MasterSelect sendiri tidak menunggu network.
     b. `onRequestNew(label)` ADA → baris "Request new option" (ikon Plus)
        tampil; diklik langsung menutup popover lalu memanggil
        `onRequestNew(label)` (label FIELD, mis. "Industry" — PERSIS
        `openReq(label)` mockup yang menjadi `reqField`). Pemanggil yang
        membuka RequestNewOptionModal (src/modules/crm/components/).
     c. Keduanya tidak ada → hanya daftar pilihan, nol pemisah/aksi
        tambahan (role lain selain Manager/Sales di mockup, mis.
        Supervisor, memang TIDAK mendapat salah satu pun — `isMgr`/
        `isSales` mockup keduanya false untuknya).
   Dua kondisi di atas INDEPENDEN (bukan if/else) — kalau pemanggil sengaja
   mengirim keduanya, mockup sendiri akan merender DUA blok bersama
   pemisahnya masing-masing (kasus yang tak pernah terjadi di pemakai nyata
   hari ini: satu pemanggil hanya pernah mengirim salah satu).

   Prop `requestNewLabel` (sentinel teks lama, khas pola native-<select>)
   DICABUT — tidak relevan lagi utk struktur tombol+popover, dan nol
   pemakai yang pernah override-nya (diverifikasi grep sebelum irisan ini).

   Aksesibilitas minimum (REVISI 1 §5): tombol pemicu adalah <button>
   (fokusable native, nol tabIndex manual); Escape menutup popover (dan
   membatalkan mode "adding" bila sedang terbuka); Enter/Space membuka
   popover saat tombol pemicu berfokus dan popover tertutup. `role="listbox"`
   pada popover + `role="option"`/`aria-selected` per baris + `aria-haspopup`/
   `aria-expanded` pada tombol pemicu.

   KOMPONEN INI MURNI PRESENTASIONAL — pemanggil bertanggung jawab atas:
     1. Mengambil `options` (array {value,label} — BUKAN array string polos
        seperti di mockup, karena data nyata `dropdown_options` punya VALUE
        slug yang berbeda dari LABEL tampilan, mis. value='lost_to_competitor'
        label='Lost to Competitor') dan meneruskannya sebagai prop.
     2. Memutuskan role (manager/sales/lainnya) lewat helper
        `isManagerOrAbove` (src/lib/roles.js) dan memasang `onAdd` ATAU
        `onRequestNew` sesuai hasilnya (lihat MarkAsLostModal.jsx/
        CaptureLeadModal.jsx/LeadDetailPage.jsx untuk pola persis).
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { FieldLabel } from './Form';
import {
  INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, BG, CARD,
  DISABLED_BG, SEMANTIC, ACCENT, FONT_HEAD, FONT_BODY, RADIUS, SIZE, Z,
} from './tokens';

const flexOf = (full, half, third) =>
  (full ? '1 1 100%' : third ? '1 1 calc(33.333% - 11px)' : half ? '1 1 calc(50% - 8px)' : '1 1 calc(50% - 8px)');
const optVal = (o) => (typeof o === 'string' ? o : o.value);
const optLabel = (o) => (typeof o === 'string' ? o : o.label);

// Shadow popover PERSIS mockup (`0 12px 32px rgba(51,66,43,.16)`) — belum
// ada token kit senilai ini (SHADOW_1 = lift kartu tipis, SHADOW_2 = modal),
// jadi literal di sini saja, sama seperti mockup sendiri menulis literal.
const POPOVER_SHADOW = '0 12px 32px rgba(51,66,43,.16)';
const ROW_RADIUS = 8; // persis mockup -- bukan RADIUS.sm (6)

function Note({ hint, error }) {
  if (!hint || error) return null;
  return <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 5, marginLeft: 3, fontFamily: FONT_BODY }}>{hint}</div>;
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: ROW_RADIUS, background: 'transparent', color: INK, fontFamily: FONT_BODY, fontSize: 13.5, cursor: 'pointer', textAlign: 'left', width: '100%' };

/**
 * @param {Object}   props
 * @param {string}   props.label
 * @param {string}   [props.value]
 * @param {(v: string) => void} props.onChange
 * @param {Array<string|{value:string,label:string}>} [props.options]
 * @param {boolean}  [props.loading]        - true saat `options` masih di-fetch pemanggil
 * @param {(trimmedName: string) => void} [props.onAdd] - ADA → "Add new option" (manager, optimistik)
 * @param {(label: string) => void} [props.onRequestNew] - ADA → "Request new option" (sales, buka modal)
 * @param {'box'} [props.variant]  - 'box' = 56px, label kecil di dalam kotak (Detail/Overview mockup)
 * @param {boolean}  [props.isNew]    - badge "New" di sebelah label, persis mockup
 * @param {boolean}  [props.required]
 * @param {boolean}  [props.half]
 * @param {boolean}  [props.third]
 * @param {boolean}  [props.full]
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.placeholder='Select an option']
 * @param {string}   [props.hint]
 * @param {boolean}  [props.error]   - BOOLEAN (border warn) — pesan "X is required" dirender pemanggil, persis mockup (sibling <sc-if>, bukan di dalam komponen)
 * @param {string}   [props.id]
 * @param {string}   [props.name]
 * @param {Object}   [props.style]
 */
export function MasterSelect({
  label, value, onChange, options = [], loading, onAdd, onRequestNew,
  variant, isNew, half, third, full, disabled, required, placeholder = 'Select an option',
  hint, error, id, name, style,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const isDisabled = !!disabled || !!loading;
  const isBox = variant === 'box';
  const selected = options.find((o) => optVal(o) === value);
  const shown = value ? (selected ? optLabel(selected) : value) : (isDisabled ? 'Not set' : placeholder);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setAdding(false); }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function toggle() {
    if (isDisabled) return;
    setOpen((o) => !o);
    setAdding(false);
  }

  function onTriggerKeyDown(e) {
    if (isDisabled) return;
    if (e.key === 'Escape') { setOpen(false); setAdding(false); }
    else if ((e.key === 'Enter' || e.key === ' ') && !open) { e.preventDefault(); setOpen(true); }
  }

  function pick(v) { onChange?.(v); setOpen(false); }

  function commitAdd() {
    const v = draft.trim();
    if (!v) return; // persis mockup: draft kosong -> commit() no-op, tetap di mode adding
    onAdd?.(v);
    setAdding(false); setDraft(''); setOpen(false);
  }

  function onDraftKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitAdd(); }
    else if (e.key === 'Escape') setAdding(false); // persis mockup -- draft TIDAK dibuang
  }

  function requestNew() { setOpen(false); onRequestNew?.(label); }

  const newBadge = isNew && (
    <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: RADIUS.sm, border: `1px solid ${SEMANTIC.orange.bd}`, background: SEMANTIC.orange.bg, color: SEMANTIC.orange.fg, fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>New</span>
  );

  const borderColor = error ? SEMANTIC.warn.bd : isDisabled ? (isBox ? LINE : DISABLED_BG) : LINE;

  return (
    <div ref={rootRef} style={{ flex: flexOf(full, half, third), minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', ...style }}>
      {isBox ? (
        <button
          type="button" id={id} name={name} className="nk-focus" onClick={toggle} onKeyDown={onTriggerKeyDown} disabled={isDisabled}
          aria-haspopup="listbox" aria-expanded={open} aria-invalid={error ? true : undefined}
          style={{
            position: 'relative', height: SIZE.inputFloating, width: '100%', borderRadius: RADIUS.md,
            border: `1px solid ${borderColor}`, background: isDisabled ? 'transparent' : BG,
            padding: '20px 14px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            textAlign: 'left', cursor: isDisabled ? 'default' : 'pointer', outlineOffset: -1,
            outline: open && !isDisabled ? `2px solid ${INK_SOFT}` : 'none',
          }}
        >
          <span style={{ position: 'absolute', top: 6, left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: INK_SOFT, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {label}{newBadge}
          </span>
          <span style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: value ? 500 : 400, fontStyle: value ? 'normal' : 'italic', color: value ? INK : INK_FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shown}
          </span>
          {!isDisabled && <ChevronDown size={16} color={INK_SOFT} style={{ flex: 'none' }} />}
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel label={label} required={required} focus={open} htmlFor={id} />
            </div>
            {newBadge}
          </div>
          <button
            type="button" id={id} name={name} className="nk-focus" onClick={toggle} onKeyDown={onTriggerKeyDown} disabled={isDisabled}
            aria-haspopup="listbox" aria-expanded={open} aria-invalid={error ? true : undefined}
            style={{
              marginTop: -8, height: SIZE.input, width: '100%', borderRadius: RADIUS.md,
              border: `1px solid ${isDisabled ? DISABLED_BG : borderColor}`, background: isDisabled ? DISABLED_BG : BG,
              padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              fontFamily: FONT_BODY, fontSize: 13.5, fontStyle: value ? 'normal' : 'italic',
              color: isDisabled ? INK_FAINT : value ? INK : INK_FAINT, textAlign: 'left',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
            {!isDisabled && <ChevronDown size={16} color={INK_SOFT} style={{ flex: 'none' }} />}
          </button>
        </>
      )}

      {open && !isDisabled && (
        <div role="listbox" className="nk-scroll" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: Z.popover,
          background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, boxShadow: POPOVER_SHADOW,
          padding: 4, display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto',
        }}>
          {options.map((o) => {
            const v = optVal(o), lbl = optLabel(o), on = v === value;
            return (
              <button key={v} type="button" role="option" aria-selected={on} onClick={() => pick(v)} className="nk-ms-row"
                style={{ ...rowStyle, justifyContent: 'space-between', background: on ? HEAD_BG : 'transparent' }}>
                {lbl}
                {on && <Check size={14} color={INK} style={{ flex: 'none' }} />}
              </button>
            );
          })}

          {onAdd && (
            <>
              <div style={{ height: 1, background: LINE_SOFT, margin: '4px 0' }} />
              {!adding ? (
                <button type="button" onClick={() => setAdding(true)} className="nk-ms-row" style={{ ...rowStyle, fontWeight: 600 }}>
                  <Plus size={14} /> Add new option
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, padding: 4 }}>
                  <input
                    autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onDraftKeyDown}
                    placeholder="New option name"
                    style={{ flex: 1, minWidth: 0, height: 32, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, background: BG, padding: '0 8px', fontFamily: FONT_BODY, fontSize: 13, color: INK, outline: 'none' }}
                  />
                  <button type="button" onClick={commitAdd} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: RADIUS.md, background: ACCENT, color: INK, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    Add
                  </button>
                </div>
              )}
            </>
          )}

          {onRequestNew && (
            <>
              <div style={{ height: 1, background: LINE_SOFT, margin: '4px 0' }} />
              <button type="button" onClick={requestNew} className="nk-ms-row" style={{ ...rowStyle, fontWeight: 600 }}>
                <Plus size={14} /> Request new option
              </button>
            </>
          )}
        </div>
      )}

      <Note hint={hint} error={error} />
    </div>
  );
}
