/* =========================================================================
   quotationVersion — versi & penomoran tampilan quotation.

   KENAPA FILE TERSENDIRI, bukan di-export dari salah satu halaman.
   Lint `react-refresh/only-export-components`: file yang meng-export komponen
   tak boleh sekaligus meng-export helper. Proyek ini sudah punya jawaban
   kanoniknya — `v3/tokens.js`, `bant.js`, `salesRoster.js`, `activityFeed.js`,
   `inquiryOptions.js` semuanya lahir karena alasan yang sama.

   SATU sumber kebenaran, BUKAN cermin. Lima permukaan membaca dari sini:
   QuotationListPage · QuotationDetailPage · QuotationPDF · DealDetailPage ·
   DealPanels. Sebelum ada file ini, logika nomor tersebar sebagai empat
   salinan yang pasti melenceng suatu hari.

   ⚠️ KEDUA fungsi butuh kolom `revision` IKUT DI-SELECT. Kalau lupa, nilainya
   `undefined` → diperlakukan sebagai revisi 1 → SELURUH nomor tampil tanpa
   sufiks dan `pickActiveQuotation` memilih berdasarkan tanggal saja. Gagalnya
   SENYAP: tak ada error, hasilnya cuma diam-diam salah.
   ========================================================================= */

/* Kode huruf pertama sufiks. Revisi 2 -> 'A' (bukan revisi 1 -> 'A'):
   nomor yang sudah terlanjur beredar di tangan customer TIDAK boleh berubah
   tampilannya hanya karena fitur versi ini lahir. */
const LETTER_A = 'A'.charCodeAt(0);
const FIRST_SUFFIXED_REVISION = 2;
const LAST_LETTER_REVISION = 27; // revisi 27 -> 'Z'

/**
 * Nomor quotation SIAP TAMPIL: `quotation_no` + sufiks huruf dari `revision`.
 *
 * Sufiksnya MURNI TAMPILAN. `quotations.quotation_no` di DB tetap bersih —
 * yang membedakan versi di DB adalah kolom `revision`, dijaga
 * UNIQUE (quotation_no, revision).
 *
 * @param {string|null|undefined} quotationNo
 * @param {number|null|undefined} revision  1 = versi pertama (default aman)
 * @returns {string}
 *
 *   ('QUO/MSI/2026/007', 1)    -> 'QUO/MSI/2026/007'
 *   ('QUO/MSI/2026/007', 2)    -> 'QUO/MSI/2026/007-A'
 *   ('QUO/MSI/2026/007', 3)    -> 'QUO/MSI/2026/007-B'
 *   ('QUO/MSI/2026/007', 27)   -> 'QUO/MSI/2026/007-Z'
 *   ('QUO/MSI/2026/007', 28)   -> 'QUO/MSI/2026/007-R28'
 *   ('QUO/MSI/2026/007', null) -> 'QUO/MSI/2026/007'
 *   (null, 2)                  -> '—'
 */
export function formatQuotationNo(quotationNo, revision) {
  if (!quotationNo) return '—';

  const rev = Number(revision);
  if (!Number.isFinite(rev) || rev < FIRST_SUFFIXED_REVISION) return quotationNo;

  /* Di atas 'Z' huruf habis. `String.fromCharCode` polos akan meneruskan ke
     '[', '\', ']' — sampah yang tampak seperti nomor sah. Jatuh ke bentuk
     numerik yang jelas-jelas bukan huruf. Mustahil dalam praktik (27 revisi
     untuk satu quotation), tapi fungsi ini tidak boleh bisa mengeluarkan
     sampah sama sekali. */
  if (rev > LAST_LETTER_REVISION) return `${quotationNo}-R${rev}`;

  return `${quotationNo}-${String.fromCharCode(LETTER_A + rev - FIRST_SUFFIXED_REVISION)}`;
}

/* Waktu baris untuk perbandingan. Tanggal hilang/invalid -> 0 (paling tua),
   supaya baris cacat KALAH, bukan menang secara kebetulan. */
function createdTime(row) {
  const t = new Date(row?.created_at).getTime();
  return Number.isFinite(t) ? t : 0;
}

function revisionOf(row) {
  const r = Number(row?.revision);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/**
 * Quotation "aktif" milik SATU inquiry — yang mewakili keadaan terkini.
 *
 * Dua lapis, karena data lama dan data baru berbentuk beda:
 *
 *   1. Kelompokkan per `quotation_no`. Tiap kelompok = satu rantai versi.
 *      Ambil `revision` TERTINGGI di kelompok itu = ujung rantainya.
 *   2. Antar-ujung: ambil `created_at` PALING BARU.
 *
 * Lapis (1) yang melayani data BARU: satu inquiry = satu quotation_no, jadi
 * kelompoknya cuma satu dan jawabannya langsung ketemu.
 * Lapis (2) yang melayani data LAMA: sebelum fitur ini ada, satu inquiry bisa
 * punya BEBERAPA quotation_no independen (revision semuanya masih 1) — 29
 * kasus terukur di produksi. Tanpa lapis ini mereka tak punya jawaban sama
 * sekali.
 *
 * ⚠️ Ujung rantai dipilih tanpa memandang STATUS. Revisi terbaru yang masih
 * DRAFT tetap "aktif" — ia memang ujung rantainya, dan itulah yang harus
 * dilihat orang saat memutuskan langkah berikutnya.
 *
 * @param {Array<object>|null|undefined} quotations
 * @returns {object|null}
 */
export function pickActiveQuotation(quotations) {
  if (!Array.isArray(quotations) || quotations.length === 0) return null;

  const live = quotations.filter((q) => q && !q.deleted_at);
  if (live.length === 0) return null;

  /* Baris tanpa quotation_no dapat kunci unik dari id-nya. Kalau tidak, dua
     baris warisan bernomor null melebur jadi satu kelompok palsu dan salah
     satunya lenyap dari pertimbangan. */
  const tips = new Map();
  for (const q of live) {
    const key = q.quotation_no || ` id:${q.id}`;
    const cur = tips.get(key);
    if (!cur || revisionOf(q) > revisionOf(cur)) tips.set(key, q);
  }

  /* Tiebreak berlapis supaya hasilnya deterministik — dua baris ber-created_at
     identik tidak boleh membuat pilihan berayun antar-render. */
  return [...tips.values()].reduce((best, q) => {
    const dt = createdTime(q) - createdTime(best);
    if (dt !== 0) return dt > 0 ? q : best;
    const dr = revisionOf(q) - revisionOf(best);
    if (dr !== 0) return dr > 0 ? q : best;
    return String(q.id) > String(best.id) ? q : best;
  });
}
