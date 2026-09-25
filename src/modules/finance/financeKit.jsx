// src/modules/finance/financeKit.jsx
// Komponen tampilan bersama tiga halaman Invoice Management.
//
// ⚠️ KELUARGA TOKEN: ungu/serif Storbit (`../logistics/spDetailTokens.js`),
// BUKAN `src/kit` (sage). Itu bukan kelalaian melainkan Keputusan Terbuka #61:
// halaman baru selama masa tunggu ikut kit TETANGGANYA supaya tidak lahir palet
// kelima. Modul Finance bertetangga dengan Detail SP (dari sanalah panel invoice
// dipindah) dan sewarna dengan InvoicePDF. Impor lintas-modulnya tercatat
// sebagai TD-277 dan mati sendiri di Batch DS 4 -- ⛔ JANGAN "diperbaiki"
// dengan menyalin token ke sini.
//
// Nol logika bisnis di berkas ini: ia tidak tahu apa itu invoice. Yang
// memutuskan tombol aktif/nonaktif tetap pemanggilnya.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, MoreHorizontal } from 'lucide-react';
import {
  C, FONT_DISPLAY, FONT_TEXT, FONT_MONO, SP, RADIUS,
  kickerStyle, cardTitleStyle, thStyle,
} from '../logistics/spDetailTokens.js';

/* ========================================================================== */
/* Breadcrumb -- separator teks "/", pola yang sama dengan Detail SP.          */
/* ========================================================================== */
export function Crumbs({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: SP.s2, fontSize: 12, color: C.inkFaint, flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: SP.s2 }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.onClick ? (
            <button
              type="button" onClick={it.onClick}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.inkFaint, fontSize: 12, fontFamily: 'inherit' }}
            >
              {it.label}
            </button>
          ) : (
            <span
              aria-current={i === items.length - 1 ? 'page' : undefined}
              style={{ color: C.ink, fontWeight: 600, fontFamily: it.mono ? FONT_MONO : 'inherit' }}
            >
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ========================================================================== */
/* Kepala halaman daftar -- kicker + judul + slot kanan.                      */
/* ========================================================================== */
export function PageHead({ kicker, title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        {kicker && <div style={{ ...kickerStyle }}>{kicker}</div>}
        <h2 style={{ ...cardTitleStyle, fontSize: 26, margin: '3px 0 0', letterSpacing: '-0.012em' }}>{title}</h2>
        {sub && <p style={{ margin: `${SP.s1}px 0 0`, fontSize: 13, color: C.inkSoft, lineHeight: 1.5, maxWidth: 680 }}>{sub}</p>}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: SP.s2, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

/* ========================================================================== */
/* Tombol -- satu bentuk untuk seluruh modul.                                 */
/* `title` dipakai sebagai ALASAN saat nonaktif (keputusan Den K-6: tombol     */
/* yang akan ditolak server tetap tampil, dengan alasan tertulis).            */
/* ========================================================================== */
const BTN_TONE = {
  primary: { bg: C.accent,     fg: '#FFFFFF', bd: C.accent   },
  outline: { bg: 'transparent', fg: C.accent, bd: C.accent   },
  ghost:   { bg: 'transparent', fg: C.inkSoft, bd: C.line    },
  danger:  { bg: 'transparent', fg: C.danger, bd: C.dangerBd },
};

export function Btn({ variant = 'outline', icon: Icon, children, disabled, onClick, title, size = 'md', style, type = 'button' }) {
  const t = BTN_TONE[variant] || BTN_TONE.outline;
  const pad = size === 'sm' ? '0 11px' : '0 16.56px';
  const h   = size === 'sm' ? 30 : 36;
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: h, padding: pad, borderRadius: RADIUS.md, whiteSpace: 'nowrap',
        border: `1px solid ${disabled ? C.line : t.bd}`,
        background: disabled ? 'transparent' : t.bg,
        color: disabled ? C.inkFaint : t.fg,
        fontFamily: FONT_DISPLAY, fontSize: size === 'sm' ? 13 : 14, fontWeight: 600, lineHeight: 1.2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 14}/>}
      {children}
    </button>
  );
}

/* Menu "Lainnya" -- popover kecil, tutup saat klik di luar / Escape. */
export function MoreMenu({ items = [], label = 'Lainnya' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <Btn variant="ghost" icon={MoreHorizontal} onClick={() => setOpen((v) => !v)}>{label}</Btn>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60, minWidth: 210,
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: RADIUS.md,
            boxShadow: '0 6px 20px rgba(45,43,43,.16)', padding: 5,
          }}
        >
          {items.map((it) => (
            <button
              key={it.label} type="button" role="menuitem" title={it.title}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '8px 10px', border: 'none', borderRadius: RADIUS.md, background: 'transparent',
                color: it.disabled ? C.inkFaint : C.ink, fontFamily: FONT_TEXT, fontSize: 13,
                cursor: it.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {it.icon && <it.icon size={14}/>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Navigasi rekaman "3 / 22" -- pola form Odoo.                               */
/* ========================================================================== */
export function RecordNav({ index, total, onPrev, onNext }) {
  if (!total || index < 0) return null;
  const arrow = (dir, Icon, fn) => (
    <button
      type="button" onClick={fn} disabled={!fn} aria-label={dir}
      style={{
        width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${C.line}`, borderRadius: RADIUS.md, background: 'transparent',
        color: fn ? C.inkSoft : C.inkFaint, cursor: fn ? 'pointer' : 'not-allowed',
      }}
    >
      <Icon size={14}/>
    </button>
  );
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: SP.s2 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: C.inkSoft, whiteSpace: 'nowrap' }}>
        {index + 1} / {total}
      </span>
      {arrow('Rekaman sebelumnya', ChevronLeft, onPrev)}
      {arrow('Rekaman berikutnya', ChevronRight, onNext)}
    </div>
  );
}

/* ========================================================================== */
/* Stepper tahap -- chevron bersambung. Geometri menyalin StatusBar `src/kit`  */
/* (takik 18px, tumpang-tindih -notch); PALETNYA ungu/serif Storbit.          */
/* `closedLabel` hidup BERDAMPINGAN dengan segmen, bukan menggantikannya --    */
/* aturan yang sama dengan StatusBar (perubahan 4 Sep 2026, jangan dibalik).   */
/* ========================================================================== */
const NOTCH = 15;

export function Stepper({ steps = [], currentIndex = -1, closedLabel = null, allDone = false }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 }}>
      {steps.map((s, i) => {
        const past  = allDone || (currentIndex > -1 && i < currentIndex);
        const now   = !allDone && i === currentIndex;
        const first = i === 0;
        const clip = first
          ? `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
          : `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`;
        const tone = now
          ? { background: C.accent,     color: '#FFFFFF', weight: 700 }
          : past
            ? { background: C.accentSoft, color: C.accentDeep, weight: 600 }
            : { background: C.surface2,  color: C.inkFaint,   weight: 500 };
        return (
          <div
            key={s.id} title={s.label} aria-current={now ? 'step' : undefined}
            style={{
              background: tone.background, color: tone.color, boxSizing: 'border-box',
              clipPath: clip, WebkitClipPath: clip, marginLeft: first ? 0 : -NOTCH,
              zIndex: steps.length - i, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: `0 ${NOTCH + 9}px 0 ${first ? 11 : NOTCH + 9}px`,
            }}
          >
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 11.5, fontWeight: tone.weight, letterSpacing: '.03em', whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
          </div>
        );
      })}
      {closedLabel && (
        <span style={{
          marginLeft: SP.s3, display: 'inline-flex', alignItems: 'center', padding: '5px 11px',
          background: C.dangerBg, color: C.danger, border: `1px solid ${C.dangerBd}`, borderRadius: RADIUS.md,
          fontFamily: FONT_DISPLAY, fontSize: 11.5, fontWeight: 700, letterSpacing: '.03em', whiteSpace: 'nowrap',
        }}>
          {closedLabel}
        </span>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Kartu ringkas (KPI) -- dipakai strip atas Daftar Invoice.                  */
/* ========================================================================== */
export function StatCard({ label, value, sub, tone, text = false }) {
  return (
    <div style={{
      border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: `${SP.s3}px ${SP.s3}px`,
      background: C.surface, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
    }}>
      <div style={{ ...kickerStyle }}>{label}</div>
      {/* `text` untuk nilai yang BUKAN angka (mis. nama alasan): monospace
          hanya berguna kalau angkanya perlu dibandingkan sejajar antar-kartu. */}
      <div style={{ fontFamily: text ? FONT_DISPLAY : FONT_MONO, fontSize: text ? 17 : 19, fontWeight: 600, color: tone || C.ink, lineHeight: 1.25, wordBreak: 'break-word' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

/* ========================================================================== */
/* Panel berbingkai dengan kepala opsional.                                   */
/* ========================================================================== */
export function Panel({ title, icon: Icon, right, children, pad = SP.s3, style }) {
  const hasHead = !!(title || right);
  return (
    <section style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, background: C.surface, overflow: 'hidden', ...style }}>
      {hasHead && (
        <header style={{
          display: 'flex', alignItems: 'center', gap: SP.s2, padding: `${SP.s2}px ${SP.s3}px`,
          borderBottom: `1px solid ${C.lineSoft}`, background: C.surface2,
        }}>
          {Icon && <Icon size={14} style={{ color: C.inkSoft, flexShrink: 0 }}/>}
          <span style={{ ...kickerStyle, flex: 1 }}>{title}</span>
          {right}
        </header>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </section>
  );
}

/* Baris label -> nilai, dipakai blok meta dokumen & kartu kanan. */
export function MetaRow({ label, children, mono = false, strong = false }) {
  // `flex-start`, BUKAN `baseline`. Sebabnya spesifik dan mudah terlewat:
  // sebagian nilai di sini adalah <Ref>, yaitu <button> = inline-block, dan
  // baseline sebuah inline-block adalah baseline baris TERAKHIR isinya. Begitu
  // nilainya membungkus, label di sebelahnya ikut turun menyejajari baris
  // kedua itu -- terlihat melorot. Diukur di lebar kolom 280px (kolom meta
  // pada lebar layar 1000px): label turun 13px dengan `baseline`, 0px dengan
  // `flex-start`. Untuk nilai satu baris keduanya identik (font-size sama).
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP.s3, padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: C.inkSoft, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{
        textAlign: 'right', minWidth: 0, color: C.ink,
        fontFamily: mono ? FONT_MONO : 'inherit', fontWeight: strong ? 700 : 500,
      }}>
        {children}
      </span>
    </div>
  );
}

/* ========================================================================== */
/* Tab teks + garis bawah accent -- pola tab Detail SP.                       */
/* ========================================================================== */
export function TabBtn({ active, onClick, label, count }) {
  return (
    <button
      type="button" onClick={onClick} role="tab" aria-selected={active}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px', fontSize: 14,
        fontFamily: active ? FONT_DISPLAY : FONT_TEXT, fontWeight: active ? 600 : 400,
        color: C.ink, opacity: active ? 1 : 0.55,
        borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
        whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline', gap: SP.s1, marginBottom: -1,
      }}
    >
      {label}
      {count != null && <span style={{ fontSize: 11, opacity: 0.55 }}>{count}</span>}
    </button>
  );
}

export function TabBar({ children, style }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: SP.s4, borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap', ...style }}>
      {children}
    </div>
  );
}

/* ========================================================================== */
/* Tabel -- kerangka bersama supaya lebar berlebih bergulir di WADAHNYA        */
/* sendiri, bukan mendorong lebar halaman.                                    */
/* ========================================================================== */
export function TableShell({ head = [], children, minWidth = 0 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: minWidth || undefined, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {head.map(([label, align], i) => (
              <th key={`${label}-${i}`} style={{ ...thStyle, textAlign: align || 'left', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ align = 'left', mono = false, nowrap = false, top = false, children, style }) {
  return (
    <td style={{
      padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: align,
      fontFamily: mono ? FONT_MONO : 'inherit', whiteSpace: nowrap ? 'nowrap' : undefined,
      verticalAlign: top ? 'top' : undefined, color: C.ink, ...style,
    }}>
      {children}
    </td>
  );
}

/* ========================================================================== */
/* Pesan -- galat, peringatan, keadaan kosong.                                */
/* ========================================================================== */
export function Notice({ tone = 'attn', icon: Icon, children }) {
  const map = {
    attn:   { bg: C.attnBg,   fg: C.attn,   bd: C.attnBd },
    danger: { bg: C.dangerBg, fg: C.danger, bd: C.dangerBd },
    info:   { bg: C.infoBg,   fg: C.info,   bd: C.infoBd },
  };
  const t = map[tone] || map.attn;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: SP.s2,
      border: `1px solid ${t.bd}`, background: t.bg, color: t.fg,
      borderRadius: RADIUS.md, padding: SP.s3, fontSize: 13, lineHeight: 1.5,
    }}>
      {Icon && <Icon size={15} style={{ flexShrink: 0, marginTop: 1 }}/>}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Hint({ children }) {
  return <p style={{ margin: 0, fontSize: 12.5, color: C.inkFaint, lineHeight: 1.5 }}>{children}</p>;
}

export function Empty({ icon: Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '34px 20px' }}>
      {Icon && (
        <div style={{ width: 54, height: 54, borderRadius: 14, background: C.surface2, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkFaint, marginBottom: 12 }}>
          <Icon size={24} strokeWidth={1.4}/>
        </div>
      )}
      <b style={{ fontSize: 14, color: C.ink }}>{title}</b>
      {sub && <span style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 4, maxWidth: 360, lineHeight: 1.5 }}>{sub}</span>}
    </div>
  );
}

/* Lingkaran inisial untuk riwayat bergaya chatter. */
export function Avatar({ name, size = 30 }) {
  const initials = String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: '50%',
        background: C.accentSoft, color: C.accentDeep, border: `1px solid ${C.accentBd}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT_DISPLAY, fontSize: size <= 26 ? 10.5 : 11.5, fontWeight: 700, letterSpacing: '.02em',
      }}
    >
      {initials}
    </span>
  );
}

/* ========================================================================== */
/* REF -- rujukan yang bisa diklik untuk membuka PANEL SAMPING.               */
/*                                                                            */
/* Aturan Contextual Master Data Access (Grand Design Bagian 1): satu master  */
/* data cuma punya SATU layar CRUD, yaitu rumah aslinya. Modul lain mengakses */
/* lewat REFERENSI -- panel untuk melihat tanpa pindah halaman, plus tombol   */
/* pintas ke layar aslinya. Dokumen (SP, SJ, BTB, TTF, pembayaran)            */
/* diperlakukan seperti kelas berat (keputusan Den 27 Sep 2026).              */
/*                                                                            */
/* ⛔ JANGAN menjadikan panel ini layar kedua: ia MELIHAT, tidak menyunting.  */
/* ========================================================================== */
export function Ref({ children, onClick, mono = true, title }) {
  if (!onClick) {
    return <span style={{ fontFamily: mono ? FONT_MONO : 'inherit', color: C.inkSoft }}>{children}</span>;
  }
  return (
    <button
      type="button" onClick={onClick} title={title || 'Lihat ringkas'}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: C.accent, fontFamily: mono ? FONT_MONO : 'inherit',
        fontSize: 'inherit', fontWeight: 600, textAlign: 'left',
        borderBottom: `1px dotted ${C.accentBd}`,
      }}
    >
      {children}
    </button>
  );
}

/* ========================================================================== */
/* QUICKPANEL -- panel samping ringkas. Melihat, bukan menyunting.            */
/* `rows` = [[label, nilai]]; `onOpenFull` memunculkan tombol pintas ke layar */
/* aslinya. Tanpa `onOpenFull` panel tetap sah: sebagian rujukan (BTB) memang */
/* belum punya halaman sendiri, dan itu keadaan, bukan kelalaian.             */
/* ========================================================================== */
/** Dropdown daftar tetap. Bentuknya sengaja sama dengan `ModalInp` supaya
 *  isian bebas dan pilihan tidak terlihat seperti dua jenis kolom berbeda. */
export function Sel({ value, onChange, disabled, children }) {
  return (
    <select
      value={value} onChange={onChange} disabled={disabled}
      style={{
        height: 38, padding: '0 11px', border: `1px solid ${C.line}`, borderRadius: 8,
        background: disabled ? C.surface2 : C.surface, fontSize: 13, color: C.ink,
        outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </select>
  );
}

export function QuickPanel({ open, onClose, kicker, title, rows = [], extra, onOpenFull, fullLabel = 'Buka halaman penuh' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div
        onClick={onClose} aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'rgba(42,51,64,.32)', zIndex: 80 }}
      />
      <aside
        role="dialog" aria-modal="true" aria-label={title}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 92vw)', zIndex: 81,
          background: C.surface, borderLeft: `1px solid ${C.line}`,
          boxShadow: '-8px 0 28px rgba(45,43,43,.18)',
          display: 'flex', flexDirection: 'column', fontFamily: FONT_TEXT,
        }}
      >
        <header style={{ padding: `${SP.s3}px ${SP.s4}px`, borderBottom: `1px solid ${C.lineSoft}`, background: C.surface2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: SP.s2 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {kicker && <div style={{ ...kickerStyle }}>{kicker}</div>}
              <div style={{ ...cardTitleStyle, fontSize: 16, marginTop: 2, wordBreak: 'break-word' }}>{title}</div>
            </div>
            <button
              type="button" onClick={onClose} aria-label="Tutup"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, fontSize: 20, lineHeight: 1, padding: 0 }}
            >
              &times;
            </button>
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: SP.s4 }}>
          {rows.map(([label, nilai], i) => (
            <MetaRow key={`${label}-${i}`} label={label}>{nilai}</MetaRow>
          ))}
          {extra}
        </div>
        {onOpenFull && (
          <footer style={{ padding: SP.s3, borderTop: `1px solid ${C.lineSoft}` }}>
            <Btn variant="outline" icon={ExternalLink} onClick={onOpenFull} style={{ width: '100%' }}>
              {fullLabel}
            </Btn>
          </footer>
        )}
      </aside>
    </>
  );
}
