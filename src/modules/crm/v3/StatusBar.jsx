/* =========================================================================
   StatusBar — representasi visual SATU sumbu status sebagai rangkaian chevron
   bersambung, ditutup penanda status penutupan di ujung kanan.

   GENERIK secara sengaja: komponen ini tidak tahu apakah yang dirender adalah
   lifecycle akun atau status deal inquiry. Ia hanya menerima daftar tahap +
   tahap sekarang; kosakata apa pun boleh, asal urut dari awal ke akhir.

   [Putaran 16a Tahap 1] Satu-satunya pemakai produksi berkas ini =
   DealDetailPage.jsx (CrmV3DemoPage.jsx tidak ber-rute, diverifikasi grep
   sebelum diedit) -- warna diganti sage lewat ../inquiryTheme.js (keputusan
   J-043 butir 7), kontrak/perilaku TIDAK berubah satu pun (props, clip-path,
   NOTCH, logika isPast/isNow/allDone, early-return `closed` yang SUDAH
   dicabut 4 Sep tetap tercabut).

   TIGA KEADAAN SEGMEN (nilai baru, pola identik src/kit/Data.jsx StatusBar):
     dilewati → latar ACCENT, teks INK, penanda centang
     aktif    → latar ACCENT_2, teks INK, penanda nomor urut, ber-drop-shadow
     belum    → latar CARD, teks INK_SOFT, garis LINE, penanda nomor urut

   ⚠️ Teks SELALU INK (bukan lagi putih) -- ACCENT/ACCENT_2 sage GAGAL AA
   dengan teks putih (kit/tokens.js baris 19-22). Ini sebabnya keterangan lama
   "ORANGE_AA, BUKAN ORANGE/ORANGE_DK, karena teks putih" sudah tidak relevan
   -- tak ada lagi teks putih di atas segmen.

   ⚠️ PERUBAHAN SEMANTIK `closed` — 4 September 2026.
   SEBELUMNYA `closed` adalah EARLY RETURN: begitu diisi, komponen berhenti di
   situ dan merender satu ribbon sebagai PENGGANTI seluruh bar; segmen tahap
   tidak dirender sama sekali. SEKARANG `closed` adalah PENANDA DI UJUNG KANAN
   yang hidup BERDAMPINGAN dengan segmen — dipisah garis vertikal tipis.
   Alasannya: pemanggil pertama (Detail Deal) perlu menampilkan sekaligus
   "sejauh mana deal berjalan" DAN "bagaimana ia ditutup"; ribbon lama memaksa
   memilih salah satu. Bila `closed` kosong, penanda berbunyi "Not closed".
   JANGAN mengembalikan early-return-nya — hilangnya itu DISENGAJA, bukan
   regresi yang terlewat.

   ⚠️ Komponen ini MURNI TAMPILAN: tak menerima onClick, tak bisa diklik.
   Perpindahan status adalah urusan tombol aksi milik halaman pemanggil.

   ⚠️ `closed` TIDAK disimpulkan sendiri dari `current`. Pemanggil yang
   memutuskan. Sebab satu nilai bisa berarti dua hal tergantung sumbunya — dan
   komponen ini sengaja tak tahu sumbu apa yang sedang dipegangnya.
   ========================================================================= */

import { FONT_HEAD, RADIUS } from './tokens';
import { ACCENT, ACCENT_2, CARD, INK, INK_SOFT, LINE, WHITE, DEAL_STATUS, SHADOW_DROP } from '../inquiryTheme';

/* Lebar takik chevron. Dipakai bertiga sekaligus — bentuk clip-path, tumpang
   tindih antar-segmen (margin kiri negatif), dan padding kanan supaya teks tak
   menabrak ujung runcing. Satu angka, tiga tempat: jangan dipisah. */
const NOTCH = { normal: 18, compact: 14 };

/* Gaya penanda penutupan per nilai `closed.stage`. Nilai di luar tiga kunci ini
   (mis. lifecycle 'free_agent') jatuh ke gaya CANCELLED — netral abu, karena
   "ditutup tanpa menang/kalah" adalah pembacaan yang paling tidak menyesatkan.
   [Putaran 16a Tahap 1] Warna status TETAP DEAL_STATUS dari kit (instruksi
   Tahap 1 butir 6, sudah identik mockup) -- trio LOST/CANCELLED kini dari
   DEAL_STATUS langsung (bukan rgba derivasi DANGER lagi; rgba lama dicabut
   bersama hex-nya, bukan dipertahankan sebagai "helper alpha").

   `done: true` menandai penutupan yang berarti SELURUH tahap tuntas — dipakai
   render segmen, bukan cuma warna penanda. Ini menutup celah kontrak: `current`
   sendirian tak bisa menyatakan "sudah lewat tahap terakhir", karena
   findIndex hanya mengenal id yang ADA di `stages`. Ditaruh di tabel ini supaya
   kosakata penutupan tetap terkumpul di satu tempat, tidak berserak ke badan
   render. Penutupan TANPA `done` (kalah/batal) membiarkan segmen apa adanya.

   ⚠️ ASIMETRI WON vs LOST/CANCELLED — DISENGAJA, BUKAN INKONSISTENSI.
   WON merender keempat segmen TUNTAS; LOST dan CANCELLED merender keempatnya
   BELUM-DIJANGKAU. Bedanya bukan kelalaian, melainkan beda jenis pernyataan:
     - WON menyatakan HASIL — rantainya selesai. Itu sah tanpa data riwayat
       apa pun, karena tak ada klaim tentang tahap mana yang dilalui.
     - LOST/CANCELLED kalau ditampilkan SEBAGIAN akan menyatakan TITIK GAGAL
       yang spesifik ("berhenti di QUOTED") — dan riwayat tahap TIDAK tersedia
       di produksi: `inquiry_status_history` belum naik ke sana (lihat Batch B3).
       Menebaknya dari dokumen yang ada = jawaban separuh, lebih menyesatkan
       daripada tidak menjawab.
   Begitu riwayat tersedia, LOST/CANCELLED BOLEH menampilkan tahap yang
   sesungguhnya dicapai; WON tidak perlu berubah. */
const CLOSED_STYLE = {
  WON:       { bg: DEAL_STATUS.WON.fg,       fg: WHITE,              bd: 'transparent', done: true },
  LOST:      { bg: DEAL_STATUS.LOST.bg,      fg: DEAL_STATUS.LOST.fg,      bd: DEAL_STATUS.LOST.bd },
  CANCELLED: { bg: DEAL_STATUS.CANCELLED.bg, fg: DEAL_STATUS.CANCELLED.fg, bd: DEAL_STATUS.CANCELLED.bd },
};

/**
 * @param {Object}   props
 * @param {Array}    props.stages   - [{ id, label }] urut dari awal ke akhir
 * @param {string}   props.current  - id tahap sekarang
 * @param {Object}   [props.closed] - { stage, label } bila sumbu sudah ditutup.
 *                                    `stage` dipakai untuk mencari gaya penanda.
 * @param {boolean}  [props.compact] - versi rapat untuk header padat
 */
export default function StatusBar({ stages = [], current, closed = null, compact = false }) {
  const notch = compact ? NOTCH.compact : NOTCH.normal;
  const height = compact ? 40 : 52;
  const labelSize = compact ? 10 : 11;
  const markSize = compact ? 11 : 13;
  const closeSize = compact ? 11 : 12;

  const currentIdx = stages.findIndex((s) => s.id === current);
  const t = closed ? (CLOSED_STYLE[closed.stage] || CLOSED_STYLE.CANCELLED) : null;
  const allDone = !!t?.done;

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 }}>
      {stages.map((s, i) => {
        const isPast = allDone || (currentIdx > -1 && i < currentIdx);
        const isNow = !allDone && i === currentIdx;
        const first = i === 0;

        // Segmen pertama rata kiri (tanpa takik masuk); sisanya bertakik dua sisi
        // dan digeser masuk sejauh `notch` supaya ujung runcing tetangganya persis
        // mengisi takiknya. z-index menurun ke kanan supaya yang kiri menimpa.
        const clip = first
          ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
          : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`;

        const tone = isNow
          ? { background: ACCENT_2, color: INK, weight: 700 }
          : isPast
            ? { background: ACCENT, color: INK, weight: 500 }
            : { background: CARD, color: INK_SOFT, weight: 500, border: `1px solid ${LINE}` };

        return (
          <div
            key={s.id}
            title={s.label}
            aria-current={isNow ? 'step' : undefined}
            style={{
              background: tone.background,
              color: tone.color,
              border: tone.border,
              boxSizing: 'border-box',
              clipPath: clip,
              WebkitClipPath: clip,
              marginLeft: first ? 0 : -notch,
              zIndex: stages.length - i,
              height,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              padding: `0 ${notch + 10}px 0 ${first ? notch : notch + 10}px`,
              filter: isNow ? SHADOW_DROP : undefined,
            }}
          >
            <span
              aria-hidden="true"
              style={{ fontFamily: FONT_HEAD, fontSize: markSize, fontWeight: 700, lineHeight: 1 }}
            >
              {isPast ? '✓' : i + 1}
            </span>
            <span
              style={{
                fontFamily: FONT_HEAD, fontSize: labelSize, fontWeight: tone.weight,
                letterSpacing: '.02em', whiteSpace: 'nowrap', lineHeight: 1,
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}

      {/* Pemisah — hanya berarti kalau memang ada segmen di kirinya. */}
      {stages.length > 0 && (
        <span aria-hidden="true" style={{ width: 1, height: height - 16, background: LINE, margin: '0 14px' }} />
      )}

      {closed ? (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: compact ? '5px 10px' : '6px 12px',
            background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
            borderRadius: RADIUS.sm, fontFamily: FONT_HEAD,
            fontSize: closeSize, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap',
          }}
        >
          {closed.label}
        </span>
      ) : (
        <span
          style={{
            fontFamily: FONT_HEAD, fontSize: closeSize, fontWeight: 600,
            color: INK_SOFT, whiteSpace: 'nowrap',
          }}
        >
          Not closed
        </span>
      )}
    </div>
  );
}
