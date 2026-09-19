/* =========================================================================
   Upload kit tunggal (Batch DS 1): DropZone (logo, 140px) · UploadBox
   (tanda tangan/stempel, 96px). Pindahan AdminKit, kontrak sama; memakai
   FileReader sungguhan sehingga gambar yang dipilih langsung tampil.
   Warna: hover/drag → border INK_SOFT + latar ROW_HOVER (dulu oranye);
   overlay pratinjau = BACKDROP; ikon INK_SOFT.
   ========================================================================= */

import { useRef, useState } from 'react';
import { RefreshCw, Trash2, Upload } from 'lucide-react';
import Icon from './Icon';
import { CARD, INK, INK_SOFT, LINE, HEAD_BG, ROW_HOVER, INPUT_BG, BACKDROP, BG, FONT_HEAD, FONT_BODY, RADIUS, MOTION } from './tokens';

const readAsDataUrl = (file, onChange) => {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => onChange(r.result);
  r.readAsDataURL(file);
};

export function DropZone({ value, onChange, label = 'Lepas logo di sini atau klik untuk unggah', hint = 'PNG / SVG · maks 2 MB', accept = 'image/*' }) {
  const [over, setOver] = useState(false);
  const [hov, setHov] = useState(false);
  const inputRef = useRef(null);
  const hot = over || hov;

  if (value) {
    return (
      <div
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ position: 'relative', height: 140, borderRadius: RADIUS.lg, border: `1px solid ${LINE}`, background: HEAD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        <img src={value} alt="logo" style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }} />
        <div style={{ position: 'absolute', inset: 0, background: BACKDROP, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hov ? 1 : 0, transition: `opacity ${MOTION.base}` }}>
          <button
            type="button" onClick={() => onChange(null)} className="nk-focus"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: RADIUS.md, border: `1.5px solid ${BG}`, background: 'transparent', color: BG, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Trash2 size={15} />Hapus
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      role="button" tabIndex={0} className="nk-focus"
      onClick={() => inputRef.current && inputRef.current.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); readAsDataUrl(e.dataTransfer.files[0], onChange); }}
      style={{
        height: 140, borderRadius: RADIUS.lg, border: `2px dashed ${hot ? INK_SOFT : LINE}`, background: over ? ROW_HOVER : HEAD_BG,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer',
        transition: `border-color ${MOTION.base}, background ${MOTION.base}`, textAlign: 'center', padding: 16,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: hot ? ROW_HOVER : INPUT_BG, border: `1px solid ${hot ? INK_SOFT : LINE}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: hot ? INK : INK_SOFT, transition: `all ${MOTION.base}`, transform: over ? 'translateY(-2px)' : 'none',
      }}>
        <Upload size={20} />
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: INK_SOFT }}>{label}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: INK_SOFT }}>{hint}</div>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => readAsDataUrl(e.target.files[0], onChange)} />
    </div>
  );
}

export function UploadBox({ value, onChange, label, icon = 'image', height = 96, accept = 'image/*' }) {
  const [hov, setHov] = useState(false);
  const inputRef = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {label && <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600, color: INK_SOFT, marginBottom: 7 }}>{label}</div>}
      <div
        role="button" tabIndex={0} className="nk-focus" aria-label={label ? `Unggah ${label}` : 'Unggah'}
        onClick={() => inputRef.current && inputRef.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        onDragOver={(e) => { e.preventDefault(); setHov(true); }}
        onDrop={(e) => { e.preventDefault(); setHov(false); readAsDataUrl(e.dataTransfer.files[0], onChange); }}
        style={{
          position: 'relative', height, borderRadius: RADIUS.md, border: `1.5px dashed ${hov ? INK_SOFT : LINE}`, background: value ? CARD : HEAD_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', transition: `border-color ${MOTION.base}`,
        }}
      >
        {value ? (
          <>
            <img src={value} alt={label || 'unggahan'} style={{ maxWidth: '82%', maxHeight: '78%', objectFit: 'contain' }} />
            <div style={{ position: 'absolute', inset: 0, background: BACKDROP, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hov ? 1 : 0, transition: `opacity ${MOTION.base}`, color: BG, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 600, gap: 6 }}>
              <RefreshCw size={14} />Ganti
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: hov ? INK : INK_SOFT, transition: `color ${MOTION.base}` }}>
            {typeof icon === 'string' ? <Icon name={icon} size={22} /> : icon}
            <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 500 }}>Unggah</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => readAsDataUrl(e.target.files[0], onChange)} />
      </div>
    </div>
  );
}
