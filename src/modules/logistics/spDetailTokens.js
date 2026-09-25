// src/modules/logistics/spDetailTokens.js
// Token desain + helper format keluarga UNGU/SERIF Storbit (halaman web Detail SP
// & Dashboard Storbit), diangkat dari SalesOrderDetailPage.jsx saat AR Tahap 2
// memindahkan panel Invoice ke modul Finance.
//
// Diangkat, BUKAN disalin: SalesOrderDetailPage.jsx mengimpor dari sini, jadi
// tidak ada dua salinan yang bisa melenceng. Yang TIDAK ikut diangkat adalah
// token/helper yang cuma dipakai satu halaman (rp2, DEC2, qtyFmt, daysUntil,
// finColor, custColor, itemStatusMeta) -- memindahkannya cuma memperbesar
// permukaan bersama tanpa pemakai kedua.
//
// KEPUTUSAN #61 masih berlaku: ini keluarga token LAMA. Batch DS 4 kelak
// menyatukan seluruh halaman ke src/kit (sage + tiga font); sampai itu terjadi,
// panel Invoice di modul Finance sengaja ikut kit TETANGGANYA, bukan sage
// duluan -- supaya tidak lahir palet kelima.


//
// KOREKSI: baris ini dulu berbunyi "tanpa ungu". Sudah tidak berlaku — aksi utama,
// tab/link, dan seluruh badge status halaman ini kini memakai ungu Storbit, mengikuti
// Claude Design "Detail Surat Pesanan B.dc.html" dan menyamakan diri dengan
// InvoicePDF.jsx yang memang sudah ungu/krem/serif sejak awal (keputusan Den).
// Navy/amber/merah TETAP hidup di elemen non-badge (stat card, MiniBar, modal hapus).
const C = {
  surface:   '#FFFFFF',
  surface2:  '#F4F6F9',
  ink:       '#2A3340',
  inkSoft:   '#6B7686',
  inkFaint:  '#9AA3B2',
  // Divider dipertegas. Nilainya = #201f1d (ink mockup) di-composite ke background
  // halaman #F2F5F9 pada opasitas tetap, jadi hasilnya hex opaque yang aman dipakai
  // di border MAUPUN background. line = 23%, lineSoft = 16% (tingkat divider mockup)
  // — hierarki dua tingkat tetap terjaga, tidak menyatu jadi satu tebal.
  line:      '#C2C4C6',   // was #E7EAF0 (≈5%)
  lineSoft:  '#D0D3D6',   // was #EEF1F5 (≈3%)
  // Ungu Storbit — anchor diambil dari InvoicePDF.jsx (PURPLE #5b3fa0 /
  // PURPLE_DEEP #4a3585) supaya layar & PDF sewarna. Tint pale + border
  // diturunkan di sini dgn mencampur #5b3fa0 ke putih: 10% → accentSoft,
  // 25% → accentBd. Ramp mockup (#7c4fd1 dst) SENGAJA tidak dipakai — cuma
  // perannya yang diambil, basis warnanya ikut token yang sudah ada.
  accent:    '#5b3fa0',
  accentDeep:'#4a3585',
  accentSoft:'#EFECF6',
  accentBd:  '#D6CFE7',
  // Grand Total sengaja TETAP keluarga oranye (accent-2-700 mockup), bukan ungu.
  grandTotal:'#82480F',
  // Oranye "perlu perhatian" — varian ke-4 di luar tiga varian ungu/outline/netral.
  // Hex teksnya sengaja SAMA dengan grandTotal (#82480F) tapi perannya beda, jadi
  // ditulis terpisah supaya tak tertukar saat salah satunya diubah. Tint diturunkan
  // dgn pola yang sama seperti ungu: 10% pada putih → bg, 25% → border.
  attn:      '#82480F',
  attnBg:    '#F3EDE7',
  attnBd:    '#E0D1C3',
  ok:        '#1B4D8A', okBg:  '#EAF0F8', okBd:  '#CFDDF0',   // positive/done → navy (was dark green)
  warn:      '#B5772A', warnBg:'#FBEEDD', warnBd:'#E6CE94',   // amber (list SP)
  danger:    '#C0392B', dangerBg:'#FBEAE8', dangerBd:'#E6BBB2',
  info:      '#1B4D8A', infoBg:'#EAF0F8', infoBd:'#CFDDF0',   // navy (was steel-blue)
  neutral:   '#6B7686', neutralBg:'#EEF1F5', neutralBd:'#DDE2EA',
  // orange/orangeBg/orangeBd dihapus — nol pemakaian setelah aksi & badge pindah
  // ke keluarga ungu. Satu-satunya sisa oranye di halaman ini adalah `grandTotal`
  // (disengaja) + palet hash `custColor` (identitas customer, bukan status).
  yellow:    '#B5772A', yellowBg:'#FBEEDD', yellowBd:'#E6CE94',   // amber (was mustard)
  purple:    '#B5772A', purpleBg:'#FBEEDD', purpleBd:'#E6CE94',   // amber (was ungu; sisa: stage Faktur Pajak)
  slate:     '#525E70', slateBg:'#EDF0F4', slateBd:'#D7DDE6',   // PICKING/PACKED — slate-blue soft (samain badge Picking List)
};

// ─── Tipografi & skala spasi (dari design system mockup) ──────────────────
// FONT_DISPLAY = --font-heading (Cormorant Garamond 600) → nomor dokumen, judul
// card, label kicker, teks tab, tombol. FONT_TEXT = --font-body (Lora 400/600).
// Identifier inline (nomor SP di breadcrumb, kolom angka tabel) SENGAJA tetap
// IBM Plex Mono — konvensi lintas halaman, mockup sendiri nol monospace.
const FONT_DISPLAY = "'Storbit Display', 'Cormorant Garamond', Georgia, serif";
const FONT_TEXT    = "'Storbit Text', Lora, Georgia, serif";
const FONT_MONO    = "'IBM Plex Mono', ui-monospace, monospace";

// Skala spasi & radius mockup — dipakai apa adanya (bukan dibulatkan) supaya
// ritme vertikalnya sama persis dengan file desain.
const SP = { s1: 4.6, s2: 9.2, s3: 13.8, s4: 18.4, s6: 27.6 };
const RADIUS = { sm: 2, md: 4, lg: 7 };

// .card-kicker mockup. Catatan: design system dasarnya mewarnai kicker dgn accent,
// TAPI file desain ini meng-override-nya jadi muted 60% — kita ikut override itu.
const kickerStyle = {
  fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkSoft,
};
// .card-title mockup (17px) — dipakai judul card Overview.
const cardTitleStyle = {
  fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: 1.2, color: C.ink,
};
// .table th mockup.
const thStyle = {
  fontSize: 11, fontWeight: 400, letterSpacing: '.08em', textTransform: 'uppercase',
  color: C.inkSoft, padding: SP.s2, textAlign: 'left',
};


// Mengikuti statusTagCls() dari Claude Design "Detail Surat Pesanan B.dc.html":
// hanya tiga varian, semuanya satu hue + abu — tanpa hijau/amber/merah semantik.
// Aturan pemetaan yang dipakai konsisten di seluruh halaman ini:
//   PALE    → selesai / terpenuhi / positif
//   OUTLINE → sedang berjalan ATAU butuh perhatian (aktif, belum selesai)
//   NEUTRAL → belum mulai / inert / informasi netral
const TAG_PALE    = { bg: C.accentSoft, color: C.accentDeep, bd: C.accentBd };
const TAG_OUTLINE = { bg: 'transparent', color: C.accent,    bd: C.accent   };
const TAG_NEUTRAL = { bg: C.neutralBg,   color: C.neutral,   bd: C.neutralBd };
// Varian ke-4, PENGECUALIAN sempit: hanya untuk kondisi yang menuntut perhatian
// (stok kurang, invoice belum diterbitkan, menunggu konfirmasi DC). Sumber
// desain memang punya 4 warna semantik, oranye terpisah dari status siklus
// hidup biasa. Badge status lain TETAP tiga varian di atas — ini bukan
// pembatalan keputusan itu.
const TAG_ATTN    = { bg: C.attnBg,      color: C.attn,      bd: C.attnBd   };

// ─── Helpers ───────────────────────────────────────────────────────────────
// Cegah scroll roda mouse mengubah nilai input type=number saat ter-focus.
const blurOnWheel = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.blur(); };
// Pilih seluruh isi saat focus → ketikan menimpa nilai default (0), tak ter-append.
const selectOnFocus = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.select(); };
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export {
  C, FONT_DISPLAY, FONT_TEXT, FONT_MONO, SP, RADIUS,
  kickerStyle, cardTitleStyle, thStyle,
  TAG_PALE, TAG_OUTLINE, TAG_NEUTRAL, TAG_ATTN,
  blurOnWheel, selectOnFocus, rp, fmtDate,
};
