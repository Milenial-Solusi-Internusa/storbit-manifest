/* =========================================================================
   FormSheet — shell dokumen. Cetakan visualnya diambil dari DealDetailPage
   (keputusan 19 Jul 2026), tapi DealDetailPage sendiri TIDAK disentuh: file
   ini menyalin polanya, bukan mengimpor darinya.

   ANATOMI (tiga slot, semuanya opsional kecuali body):
     header → nomor dokumen · judul · StatusBar/badge · aksi utama · toolbar
     body   → slot Notebook (atau konten bebas)
     aside  → slot Chatter (kolom kanan persisten lintas tab)

   Kolom kanan SENGAJA hidup di level FormSheet, bukan di dalam salah satu
   tab Notebook. Chatter adalah percakapan tentang DOKUMEN, bukan tentang tab
   yang kebetulan sedang dibuka — menaruhnya di dalam tab akan membuatnya
   hilang begitu user pindah tab, dan itu persis alasan pola ini diangkat
   jadi komponen resmi.

   Turun ke satu kolom di bawah 1024px lewat helper `nx-grid-2`/`nx-stack`
   yang SUDAH ADA di index.css — nol perubahan file global.
   ========================================================================= */

import { INK, INK_SOFT, LINE, SURFACE, FONT_HEAD, FONT_BODY, SP, RADIUS } from './tokens';
import { DocNo } from './kit';

/**
 * @param {Object} props
 * @param {string} [props.docNo]    - nomor dokumen (dirender mono)
 * @param {string} props.title      - judul dokumen
 * @param {string} [props.kicker]   - label kecil di atas judul
 * @param {Node}   [props.status]   - slot StatusBar / Badge
 * @param {Node}   [props.actions]  - slot aksi utama (tombol)
 * @param {Node}   [props.meta]     - baris metadata kecil di bawah judul
 * @param {Node}   [props.toolbar]  - baris aksi selebar dokumen, di bawah status
 * @param {Node}   props.children   - body (biasanya <Notebook/>)
 * @param {Node}   [props.aside]    - kolom kanan (biasanya <Chatter/>)
 * @param {Node}   [props.breadcrumb]
 */
export default function FormSheet({
  docNo, title, kicker, status, actions, meta,
  children, aside = null, breadcrumb = null, toolbar = null,
}) {
  return (
    <div
      className="nx-grid-2 nx-stack"
      style={{
        display: 'grid',
        gridTemplateColumns: aside ? 'minmax(0,1.7fr) minmax(0,1fr)' : 'minmax(0,1fr)',
        gap: SP.s6, alignItems: 'start', maxWidth: 1240,
        fontFamily: FONT_BODY, fontSize: 15, lineHeight: 1.55, color: INK,
      }}
    >
      {/* ── Header: membentang dua kolom supaya kolom kanan sejajar body,
             bukan sejajar breadcrumb (pola SalesOrderDetailPage). ── */}
      <header style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: SP.s3, minWidth: 0 }}>
        {breadcrumb}

        {kicker && (
          <div style={{
            fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700,
            letterSpacing: '.08em', textTransform: 'uppercase', color: INK_SOFT,
          }}>
            {kicker}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: SP.s4, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{
              margin: 0, fontFamily: FONT_HEAD, fontSize: 30, fontWeight: 700,
              letterSpacing: '-.01em', color: INK, lineHeight: 1.15,
            }}>
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

        {status && <div style={{ marginTop: SP.s1 }}>{status}</div>}

        {/* ── `toolbar` — SLOT BARU, 4 September 2026 ───────────────────────
            Baris aksi dokumen. Ditaruh di dalam <header> (yang membentang DUA
            kolom) dan BUKAN di `children`, karena `children` hanya menempati
            kolom kiri: dengan `aside` terpasang, lebarnya cuma ~766px dari 1240px
            header. Diukur langsung di browser: satu baris tujuh tombol aksi
            Detail Deal butuh 986px, sehingga di kolom kiri ia SELALU pecah dua
            baris — di lebar layar mana pun, bukan hanya layar sempit. Mengecilkan
            tombol tak menolong: varian paling agresif (nol ikon, padding 10,
            font 12) masih 768px.
            `actions` TIDAK bisa dipakai untuk ini — slot itu duduk sebaris dengan
            judul dan berbagi lebar dengannya. Dua slot ini memang beda peran:
            `actions` untuk beberapa aksi pendek di sebelah judul, `toolbar` untuk
            baris aksi selebar dokumen. ── */}
        {toolbar && <div style={{ marginTop: SP.s2 }}>{toolbar}</div>}
      </header>

      {/* ── Body ── */}
      <main style={{ minWidth: 0 }}>{children}</main>

      {/* ── Aside (Chatter) ── */}
      {aside && (
        <aside
          style={{
            minWidth: 0, position: 'sticky', top: SP.s4,
            background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg,
            overflow: 'hidden',
          }}
        >
          {aside}
        </aside>
      )}
    </div>
  );
}
