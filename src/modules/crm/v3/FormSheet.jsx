/* =========================================================================
   FormSheet — shell dokumen. Cetakan visualnya diambil dari DealDetailPage
   (keputusan 19 Jul 2026), tapi DealDetailPage sendiri TIDAK disentuh: file
   ini menyalin polanya, bukan mengimpor darinya.

   [Putaran 16a Tahap 1] Satu-satunya pemakai produksi = DealDetailPage.jsx
   (CrmV3DemoPage.jsx tidak ber-rute, diverifikasi grep sebelum diedit) --
   warna diganti sage lewat ../inquiryTheme.js (keputusan J-043 butir 7).
   `toolbarFirst` TIDAK disentuh -- perilaku, urutan, dan seluruh slot persis
   seperti sebelumnya, hanya SUMBER nilai INK/INK_SOFT/LINE/CARD yang berubah.

   [Putaran D1 Inquiry, restrukturisasi layout Detail] TIGA slot baru, semua
   opt-in dengan default yang mempertahankan perilaku lama byte-identik
   (pola sama `toolbarFirst`) -- `aside` TIDAK diubah/dicabut, masih dipakai
   `CrmV3DemoPage.jsx` apa adanya:
     - `maxWidth` (default 1240, perilaku lama) -- DealDetailPage.jsx
       mengoper nilai lebih lebar supaya mendekati `<main>` mockup yang
       tanpa cap.
     - `headerAside` -- kolom kanan SEJAJAR HEADER (bukan sejajar body),
       dipakai saat `<header>` ikut menyempit jadi kolom kiri saja (lihat
       perubahan `gridColumn` di bawah). BEDA dari `aside`: TIDAK sticky
       (tinggi header jauh melebihi kontennya, sticky tak relevan untuk
       baris setinggi ini) dan BUKAN kolom-kanan-lintas-tab -- isinya
       berganti tergantung tab aktif (diputuskan pemanggil, FormSheet tidak
       tahu apa itu "tab"). `headerAside` dan `aside` TIDAK dirancang
       terpasang bersamaan pada satu pemanggil (DealDetailPage memakai
       `headerAside`+`footer`, CrmV3DemoPage memakai `aside`) tapi grid
       tetap masuk akal kalau suatu saat ada yang mengoper keduanya --
       `headerAside` mengisi kolom kanan BARIS HEADER, `aside` mengisi
       kolom kanan BARIS BODY, dua baris berbeda.
     - `footer` -- baris PALING BAWAH, SELALU membentang penuh
       (`gridColumn:'1/-1'`), dirender SETELAH `<main>`/`aside`. Lahir
       dari kebutuhan Comments (`InquiryChatter`) yang mockup taruh
       full-width di bagian bawah halaman, sama di semua tab -- BUKAN di
       kolom kanan sticky (itu sebabnya ia bukan sekadar isi `children`:
       `children` hidup di dalam `<main>`, yang cuma kolom kiri, jadi
       `gridColumn:1/-1` di DALAM `<main>` tidak melebar apa-apa).

   ANATOMI (enam slot, semuanya opsional kecuali body):
     header      → nomor dokumen · judul · StatusBar/badge · aksi utama · toolbar
     headerAside → kolom kanan sejajar header, isi tergantung tab aktif (pemanggil)
     body        → slot Notebook (atau konten bebas)
     aside       → slot Chatter (kolom kanan persisten lintas tab) -- LAMA, tak diubah
     footer      → baris full-width paling bawah (mis. Comments)

   Kolom kanan `aside` SENGAJA hidup di level FormSheet, bukan di dalam salah
   satu tab Notebook. Chatter adalah percakapan tentang DOKUMEN, bukan
   tentang tab yang kebetulan sedang dibuka — menaruhnya di dalam tab akan
   membuatnya hilang begitu user pindah tab, dan itu persis alasan pola ini
   diangkat jadi komponen resmi. (DealDetailPage.jsx sendiri sudah tidak
   memakai `aside` lagi sejak Putaran D1 -- Comments pindah ke `footer`,
   supaya full-width sesuai mockup, bukan sticky-kanan.)

   Turun ke satu kolom di bawah 1024px lewat helper `nx-grid-2`/`nx-stack`
   yang SUDAH ADA di index.css — nol perubahan file global. `headerAside`
   dan `footer` otomatis ikut turun/melebar lewat mekanisme yang sama
   (`.nx-grid-2{grid-template-columns:1fr !important}` memaksa satu kolom,
   `footer` yang sudah `1/-1` otomatis jadi satu-satunya kolom itu).

   ⚠️ KEADAAN KIT INI, APA ADANYA — 4 September 2026 (diperbarui akhir Batch B).
   FormSheet kini punya SEPULUH slot dan sudah DUA KALI diperluas (chrome
   `aside`, lalu `toolbar`) sementara pemakai produksinya baru SATU:
   DealDetailPage. Artinya bentuknya sejauh ini didikte satu halaman.
   Slot `toolbar` lahir dari kebutuhan yang terukur, bukan selera — baris aksi
   butuh lebar dokumen penuh (986px), sedangkan kolom `children` cuma 766px saat
   `aside` terpasang — jadi kemungkinan besar ia berguna untuk halaman lain juga.
   Tapi sampai ADA PEMAKAI KEDUA, itu belum terbukti.
   Siapa pun yang memasang FormSheet di halaman berikutnya: kalau ada slot yang
   terasa dipaksakan, LAPORKAN — jangan diakali dari sisi pemanggil. Slot yang
   salah bentuk lebih murah diperbaiki sekarang, selagi pemakainya masih sedikit,
   daripada setelah lima halaman terlanjur menyiasatinya masing-masing.

   Dan ini bukan cuma soal FormSheet. ListView mengalami hal yang sama di batch
   yang sama: input pencariannya dirender tanpa memeriksa apakah pemanggil
   menyediakan `onSearch`, dan `render` kolomnya tak pernah mengoper indeks baris
   sehingga kolom nomor urut mustahil dibuat (ketahuan sebagai NaN di layar).
   Ketiga celah — satu di FormSheet, dua di ListView — sama sebabnya: kit v3
   dibangun LEBIH DULU, sebelum ada satu pun pemakai produksi, jadi bentuknya
   ditebak dari rencana. Ketiganya baru muncul saat halaman pertama benar-benar
   memakainya. Perlakukan sisa kit ini sebagai BELUM TERUJI, bukan sudah jadi.
   ========================================================================= */

import { FONT_HEAD, FONT_BODY, SP, RADIUS } from './tokens';
import { INK, INK_SOFT, LINE, CARD } from '../inquiryTheme';
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
 * @param {Node}   [props.aside]       - kolom kanan lintas-tab, sticky (biasanya <Chatter/>)
 * @param {Node}   [props.headerAside] - kolom kanan SEJAJAR HEADER, tidak sticky, isi tergantung tab aktif (pemanggil yang memutuskan)
 * @param {Node}   [props.footer]      - baris full-width paling bawah (mis. Comments)
 * @param {number|string} [props.maxWidth] - default 1240 (perilaku lama)
 * @param {Node}   [props.breadcrumb]
 */
export default function FormSheet({
  docNo, title, kicker, status, actions, meta,
  children, aside = null, headerAside = null, footer = null,
  breadcrumb = null, toolbar = null, maxWidth = 1240,
  // Irisan 2 Inquiry, lanjutan audit mockup (Pekerjaan A): urutan status/
  // toolbar di bawah ini selalu status-dulu -- cocok utk pemakai lama, tapi
  // mockup Inquiry Management.dc.html menaruh metric-row (slot `toolbar`
  // DealDetailPage) SEBELUM StageBar (slot `status`). `toolbarFirst=true`
  // membalik urutan DUA blok ini SAJA; default `false` mempertahankan
  // perilaku lama byte-identik untuk pemanggil yang tak mengoper prop ini
  // (CrmV3DemoPage.jsx -- satu-satunya pemakai lain, dan ia tak pernah
  // mengoper `toolbar` sama sekali, jadi nilai prop ini tak berpengaruh
  // padanya apa pun isinya).
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
      {/* ── Header: membentang dua kolom HANYA kalau `headerAside` kosong
             (supaya kolom kanan lama, `aside`, tetap sejajar BODY -- pola
             SalesOrderDetailPage). Kalau `headerAside` terisi, header
             menyusut jadi kolom kiri saja supaya `headerAside` bisa duduk
             sejajarnya di kolom kanan, baris yang sama. ── */}
      <header style={{ gridColumn: headerAside ? 'auto' : '1 / -1', display: 'flex', flexDirection: 'column', gap: SP.s3, minWidth: 0 }}>
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
            baris aksi selebar dokumen. ──
            Urutan terhadap `status` di bawah ini DUA ARAH, lihat `toolbarFirst`
            di signature komponen -- defaultnya status dulu (perilaku lama),
            dibalik hanya kalau pemanggil eksplisit minta. ── */}
        {toolbarFirst && toolbar && <div style={{ marginTop: SP.s2 }}>{toolbar}</div>}
        {status && <div style={{ marginTop: SP.s1 }}>{status}</div>}
        {!toolbarFirst && toolbar && <div style={{ marginTop: SP.s2 }}>{toolbar}</div>}
      </header>

      {/* ── Header-aside: sejajar <header>, BUKAN sticky (lihat komentar
             anatomi di atas file). Dibungkus satu div supaya `headerAside`
             boleh berisi beberapa elemen tanpa memecah grid-placement. ── */}
      {headerAside && (
        <div style={{ minWidth: 0 }}>{headerAside}</div>
      )}

      {/* ── Body ── */}
      <main style={{ minWidth: 0 }}>{children}</main>

      {/* ── Aside (Chatter) — LAMA, tak diubah ── */}
      {aside && (
        <aside
          style={{
            minWidth: 0, position: 'sticky', top: SP.s4,
            background: CARD, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg,
            overflow: 'hidden',
          }}
        >
          {aside}
        </aside>
      )}

      {/* ── Footer: SELALU full-width, dirender terakhir (mis. Comments). ── */}
      {footer && (
        <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>{footer}</div>
      )}
    </div>
  );
}
