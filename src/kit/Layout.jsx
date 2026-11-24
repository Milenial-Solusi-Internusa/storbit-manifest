/* =========================================================================
   Layout kit tunggal (Batch DS 1): PageHeader · SectionLabel · Card ·
   EmptyState · Skeleton · DocNo · FormSheet · Notebook.

   `FormSheet` dan `Notebook` LAHIR sebagai SALINAN `src/modules/crm/
   v3/FormSheet.jsx` & `Notebook.jsx`. Batch DS 3 memigrasikan satu-satunya
   pemakai keduanya (DealDetailPage.jsx) ke sini dan menghapus kedua
   berkas v3 aslinya. Kontrak warna TIDAK berubah dari salinan v3; Batch
   DS 3 menambah 4 prop opt-in ke FormSheet (headerAside/footer/headerCard/
   toolbarFirst, diport dari v3/FormSheet.jsx apa adanya) dan 1 prop
   opt-in ke Notebook (`dense`, replika spacing v3/Notebook.jsx).
   `Notebook` menyerap `Tabs` AdminKit: tiap tab kini boleh punya `icon`
   (node Lucide atau nama registri) dan `dot`.

   `Card` melebur dua kartu lama: header ber-judul (v3) + `pad` numerik
   (AdminKit). Default padding 16 (v3); halaman admin yang ingin 24 mengoper
   `pad={24}`. Radius 14 untuk semua kartu (keputusan #7). Kartu tetap TANPA
   bayangan (prinsip kedua kit modern); `SHADOW_1` hanya untuk elemen melayang.

   `DocNo` tinggal di sini (bukan Data.jsx) supaya Data → Layout satu arah;
   Data.jsx me-re-export-nya.
   Alias `Skel`/`Tabs` = kompatibilitas AdminKit, dicabut Batch DS 7.
   ========================================================================= */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Icon from './Icon';
import { IconButton } from './Button';
import {
  CARD, INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, SEMANTIC,
  FONT_HEAD, FONT_BODY, FONT_MONO, SP, RADIUS, MOTION,
} from './tokens';

const renderIcon = (icon, size) => (typeof icon === 'string' ? <Icon name={icon} size={size} /> : icon);

/* =========================================================================
   PAGE HEADER — breadcrumb (klik-tembus) + H1 24 + subtitle + back + slot kanan
   ========================================================================= */
export function PageHeader({ crumbs = [], title, subtitle, onBack, right, style }) {
  const [hoverCrumb, setHoverCrumb] = useState(-1);
  const last = crumbs.length - 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 22, ...style }}>
      <div style={{ minWidth: 0 }}>
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontFamily: FONT_BODY, color: INK_SOFT, marginBottom: 10, flexWrap: 'wrap' }}>
            {crumbs.map((c, i) => {
              const isLast = i === last;
              const color = isLast || hoverCrumb === i ? INK : INK_SOFT;
              return (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  {i > 0 && <ChevronRight size={13} color={INK_FAINT} />}
                  {c.onClick ? (
                    <button
                      type="button" onClick={c.onClick} className="nk-focus"
                      onMouseEnter={() => setHoverCrumb(i)} onMouseLeave={() => setHoverCrumb(-1)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 12.5, color, fontWeight: isLast ? 600 : 400, transition: `color ${MOTION.base}`, whiteSpace: 'nowrap', borderRadius: 4 }}
                    >
                      {c.label}
                    </button>
                  ) : (
                    <span aria-current={isLast ? 'page' : undefined} style={{ color, fontWeight: isLast ? 600 : 400, whiteSpace: 'nowrap' }}>{c.label}</span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          {onBack && <IconButton icon={<ArrowLeft size={19} />} label="Kembali" onClick={onBack} />}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, letterSpacing: -0.4, color: INK, margin: 0, lineHeight: 1.1 }}>{title}</h1>
            {subtitle && <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 5, fontFamily: FONT_BODY }}>{subtitle}</div>}
          </div>
        </div>
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

/* ---------- label section uppercase ---------- */
export function SectionLabel({ children, style }) {
  return (
    <div style={{ fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: INK_SOFT, ...style }}>
      {children}
    </div>
  );
}

/* =========================================================================
   CARD — kartu berbingkai tanpa bayangan; header opsional (judul/ikon/slot kanan)
   @param {number}  [pad]     - padding badan (menang atas `padded`)
   @param {boolean} [padded]  - false → badan tanpa padding (tabel di dalam kartu)
   ========================================================================= */
export function Card({ title, icon, right, children, padded = true, pad, style, className, as: Tag = 'section' }) {
  const hasHead = !!(title || right || icon);
  const bodyPad = pad ?? (padded ? SP.s4 : 0);
  return (
    <Tag
      className={className}
      style={{
        background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg,
        overflow: hasHead ? 'hidden' : undefined, ...style,
      }}
    >
      {hasHead && (
        <header style={{
          display: 'flex', alignItems: 'center', gap: SP.s2, padding: `${SP.s3}px ${SP.s4}px`,
          borderBottom: `1px solid ${LINE_SOFT}`, background: HEAD_BG, color: INK_SOFT,
        }}>
          {renderIcon(icon, 15)}
          <h3 style={{ margin: 0, flex: 1, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700, color: INK }}>{title}</h3>
          {right}
        </header>
      )}
      <div style={{ padding: bodyPad }}>{children}</div>
    </Tag>
  );
}

/* ---------- EmptyState ---------- */
// TD-318 Irisan Kit, N9: persis mockup Capture/EmptyState (Lead Management.
// dc.html :99-104) -- badge lingkaran 48px (HEAD_BG=#EFF3ED, ikon INK_SOFT=
// #5C6B52, nol hex baru), judul 15px INK (bukan INK_SOFT 13.5px), teks
// maxWidth 360px tengah, padding 64px 24px. Kontrak prop TIDAK berubah
// (icon/title/sub/action tetap string/node bebas) -- 7 pemanggil nyata
// (LeadAssignmentPage/LeadCapturePage/LeadDetailPage) tidak perlu disentuh.
export function EmptyState({ title, sub, icon, action, style }) {
  return (
    <div style={{ padding: '64px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s3, ...style }}>
      {icon && (
        <span style={{ width: 48, height: 48, borderRadius: 24, background: HEAD_BG, color: INK_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 48px' }}>
          {renderIcon(icon, 18)}
        </span>
      )}
      <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
      {sub && <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT, maxWidth: 360 }}>{sub}</div>}
      {/* mockup: gap:12 (parent) + margin-top:8px (lokal, :103) -- 20px total
          dari teks ke baris tombol, bukan 12px seperti jarak icon/judul/teks. */}
      {action && <div style={{ display: 'flex', justifyContent: 'center', gap: SP.s2, marginTop: SP.s2 }}>{action}</div>}
    </div>
  );
}

/* ---------- Skeleton (kelas .nk-skel dari kit.css) ---------- */
export function Skeleton({ w = '100%', h = 14, r = 8, style }) {
  return <div className="nk-skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/* ---------- DocNo — nomor dokumen, selalu mono ---------- */
export function DocNo({ children, style }) {
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: '.02em', color: INK_SOFT, ...style }}>
      {children}
    </span>
  );
}

/* =========================================================================
   FORMSHEET — cangkang halaman dokumen (salinan v3, kontrak utuh + 4 prop
   Batch DS 3: `headerAside`/`footer`/`headerCard`/`toolbarFirst`, diport
   dari v3/FormSheet.jsx apa adanya -- satu-satunya pemakai hari ini
   [DealDetailPage.jsx] sudah mengoper semuanya).

   ANATOMI (enam slot, semuanya opsional kecuali body):
     header      → breadcrumb · kicker · judul · docNo/meta · actions ·
                   status · toolbar (opsional dibungkus kartu putih via `headerCard`)
     headerAside → kolom kanan sejajar header, isi tergantung tab aktif (pemanggil)
     body        → children (biasanya <Notebook/>)
     aside       → kolom kanan persisten lintas tab (biasanya Chatter)
     footer      → baris full-width paling bawah (mis. Comments)
   `aside` hidup di level FormSheet, bukan di dalam tab, karena ia percakapan
   tentang DOKUMEN. `actions` = beberapa aksi pendek di sebelah judul;
   `toolbar` = baris aksi selebar dokumen (dua kolom), lahir dari kebutuhan
   terukur Detail Deal (986px) — bukan muat/tidak muat. Turun ke satu kolom
   <1024px lewat helper `nx-grid-2`/`nx-stack` yang sudah ada di index.css.
   `headerAside` dan `footer` otomatis ikut turun/melebar lewat mekanisme
   yang sama.
   ========================================================================= */
export function FormSheet({
  docNo, title, kicker, status, actions, meta,
  children, aside = null, headerAside = null, footer = null,
  breadcrumb = null, toolbar = null, maxWidth = 1240, headerCard = false,
  // Urutan status/toolbar di bawah ini selalu status-dulu -- cocok utk
  // pemanggil lama. `toolbarFirst=true` membalik urutan DUA blok ini SAJA;
  // default `false` mempertahankan perilaku lama byte-identik.
  toolbarFirst = false,
}) {
  return (
    <div
      className="nx-grid-2 nx-stack"
      style={{
        display: 'grid',
        gridTemplateColumns: (aside || headerAside) ? 'minmax(0,1.7fr) minmax(0,1fr)' : 'minmax(0,1fr)',
        gap: SP.s6, alignItems: 'start', maxWidth,
        fontFamily: FONT_BODY, fontSize: 15, lineHeight: 1.55, color: INK,
      }}
    >
      {/* Header: membentang dua kolom HANYA kalau `headerAside` kosong
          (supaya kolom kanan lama, `aside`, tetap sejajar BODY). Kalau
          `headerAside` terisi, header menyusut jadi kolom kiri saja supaya
          `headerAside` bisa duduk sejajarnya di kolom kanan, baris yang
          sama. `gap` berubah 12px→20px HANYA saat `headerCard=true` --
          jarak breadcrumb-ke-kartu beda dari jarak antar-blok di dalam
          header lama. */}
      <header style={{ gridColumn: headerAside ? 'auto' : '1 / -1', display: 'flex', flexDirection: 'column', gap: headerCard ? SP.s5 : SP.s3, minWidth: 0 }}>
        {breadcrumb}

        {/* `headerInner` = satu sumber kebenaran utk isi header selain
            breadcrumb -- dibungkus kartu putih saat `headerCard=true`,
            atau dirender apa adanya (Fragment, nol DOM tambahan) saat
            `false` -- byte-identik dgn perilaku sebelum `headerCard` ada. */}
        {(() => {
          const headerInner = (
            <>
              {kicker && (
                <div style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: INK_SOFT }}>
                  {kicker}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: SP.s4, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  {/* fontSize 24 -- TD-318 Irisan 0d: persis <h1 style="font:700 24px
                      Montserrat,sans-serif"> h1 Detail di seluruh mockup design-handoff/mockup/
                      *.dc.html. */}
                  <h1 style={{ margin: 0, fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: INK, lineHeight: 1.15 }}>
                    {title}
                  </h1>
                  {(docNo || meta) && (
                    <div style={{ marginTop: SP.s2, display: 'flex', alignItems: 'center', gap: SP.s3, flexWrap: 'wrap' }}>
                      {docNo && <DocNo>{docNo}</DocNo>}
                      {meta}
                    </div>
                  )}
                </div>

                {actions && (
                  <div style={{ display: 'flex', gap: SP.s2, flexWrap: 'wrap', alignItems: 'center' }}>
                    {actions}
                  </div>
                )}
              </div>

              {toolbarFirst && toolbar && <div style={{ marginTop: SP.s2 }}>{toolbar}</div>}
              {status && <div style={{ marginTop: SP.s1 }}>{status}</div>}
              {!toolbarFirst && toolbar && <div style={{ marginTop: SP.s2 }}>{toolbar}</div>}
            </>
          );
          return headerCard ? (
            <div style={{
              background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg,
              padding: SP.s4, display: 'flex', flexDirection: 'column', gap: SP.s4,
            }}>
              {headerInner}
            </div>
          ) : headerInner;
        })()}
      </header>

      {/* Header-aside: sejajar <header>, BUKAN sticky. Dibungkus satu div
          supaya `headerAside` boleh berisi beberapa elemen tanpa memecah
          grid-placement. */}
      {headerAside && (
        <div style={{ minWidth: 0 }}>{headerAside}</div>
      )}

      <main style={{ minWidth: 0 }}>{children}</main>

      {aside && (
        <aside style={{
          minWidth: 0, position: 'sticky', top: SP.s4,
          background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, overflow: 'hidden',
        }}>
          {aside}
        </aside>
      )}

      {/* Footer: SELALU full-width, dirender terakhir (mis. Comments). */}
      {footer && (
        <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>{footer}</div>
      )}
    </div>
  );
}

/* =========================================================================
   NOTEBOOK — tab ber-gate tunggal (salinan v3) + `icon`/`dot` per tab (Tabs).

   Gate dievaluasi SATU KALI di level daftar: tab tak lolos gate tidak
   dirender; tab default = tab PERTAMA YANG LOLOS. Kontrak gate:
   undefined/true → tampil · false → tidak · function → dipanggil sekali.
   Controlled: pemanggil memegang `value`; komponen hanya mengoreksi otomatis
   bila `value` menunjuk tab yang tak (lagi) berhak.

   `dense` (Batch DS 3) -- varian spacing yang mencocokkan
   v3/Notebook.jsx persis (gap 24px, tinggi tab 48px, padding tombol 0,
   wrapper padding '0 16px' + `overflowX:auto`, sudut tombol lurus bukan
   membulat) -- dipakai halaman yang mockup-nya sudah mensyaratkan ukuran
   itu (Detail Inquiry). Default `false` = gaya kit biasa (gap rapat 2px,
   padding tombol 10px/16px, sudut membulat), byte-identik untuk konsumen
   lain (KitGallery demo). `icon`/`dot` tetap berfungsi di kedua varian. */
export function Notebook({ tabs = [], value, onChange, children, right = null, style, dense = false }) {
  const visible = useMemo(
    () => tabs.filter((t) => (typeof t.gate === 'function' ? !!t.gate() : t.gate !== false)),
    [tabs],
  );
  const activeId = visible.some((t) => t.id === value) ? value : visible[0]?.id;
  useEffect(() => {
    if (activeId && activeId !== value) onChange?.(activeId);
  }, [activeId, value, onChange]);
  const [hover, setHover] = useState(null);
  if (!visible.length) return null;
  const active = visible.find((t) => t.id === activeId);

  return (
    <div style={style}>
      <div
        role="tablist"
        style={dense
          ? { display: 'flex', alignItems: 'center', gap: 24, padding: '0 16px', borderBottom: `1px solid ${LINE}`, marginBottom: SP.s5, flexWrap: 'wrap', overflowX: 'auto' }
          : { display: 'flex', alignItems: 'center', gap: 2, borderBottom: `1px solid ${LINE}`, marginBottom: SP.s5, flexWrap: 'wrap' }}
      >
        {visible.map((t) => {
          const on = t.id === activeId;
          return (
            <button
              key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(t.id)} className="nk-focus"
              onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}
              style={{
                appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
                padding: dense ? 0 : '10px 16px', height: dense ? 48 : undefined,
                marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 8,
                fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: on ? 700 : 600,
                color: on || hover === t.id ? INK : INK_SOFT,
                borderBottom: `2px solid ${on ? INK : 'transparent'}`, transition: `color ${MOTION.base}`,
                borderRadius: dense ? 0 : '4px 4px 0 0',
              }}
            >
              {t.icon && renderIcon(t.icon, 16)}
              {t.label}
              {t.dot && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: SEMANTIC.warn.fg }} />}
            </button>
          );
        })}
        {right && <div style={{ marginLeft: 'auto', paddingBottom: SP.s2 }}>{right}</div>}
      </div>
      <div role="tabpanel">{active?.render ? active.render() : children}</div>
    </div>
  );
}

/* ---------- ALIAS kompatibilitas (dicabut Batch DS 7) ---------- */
export function Skel(props) { return <Skeleton {...props} />; }
export function Tabs(props) { return <Notebook {...props} />; }
