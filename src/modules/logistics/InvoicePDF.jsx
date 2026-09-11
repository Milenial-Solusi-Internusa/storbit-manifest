// src/modules/logistics/InvoicePDF.jsx
// Invoice (Storbit/SBI) — Letter portrait, @react-pdf/renderer. Layout & palet
// mengikuti PERSIS Claude Design "Storbit commercial invoice design" (proyek
// e819a78c-d919-4a91-bfbc-c44d547aafd8, file `Storbit Invoice.dc.html`) —
// ungu/krem/serif, SENGAJA beda dari brand cetak navy/orange
// PickingListPDF/DeliveryNotePDF (keputusan Den, bukan kelalaian/inkonsistensi).
//
// Font: cuma 2 kombinasi weight/style benar-benar dipakai di desain sumbernya
// (dikonfirmasi baca ulang tiap elemen di file desain) —
//   Cormorant Garamond 600 normal SAJA (tak pernah 400/italic)
//   Lora 400 normal (default) + Lora 600 normal (cuma label vertikal "INVOICE #"
//     dan NILAI Grand Total — labelnya sendiri pakai Cormorant, bukan Lora).
// File .ttf di-bundle lokal (bukan URL remote — beda dari LOGO_URL yang boleh
// berubah sewaktu-waktu; font ini keputusan desain yang menempel di kode).
import { Document, Page, View, Text, Image, Font, StyleSheet } from '@react-pdf/renderer';
import cormorantSemiBold from '../../assets/fonts/CormorantGaramond-SemiBold.ttf';
import loraRegular from '../../assets/fonts/Lora-Regular.ttf';
import loraSemiBold from '../../assets/fonts/Lora-SemiBold.ttf';
import { DPP_NILAI_LAIN_RATIO } from '../../lib/taxConstants';

Font.register({
  family: 'Cormorant Garamond',
  fonts: [{ src: cormorantSemiBold, fontWeight: 600 }],
});
Font.register({
  family: 'Lora',
  fonts: [
    { src: loraRegular, fontWeight: 400 },
    { src: loraSemiBold, fontWeight: 600 },
  ],
});

const LOGO_URL = 'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/11.png';
const INK = '#201f1d';
const PURPLE = '#5b3fa0';
const PURPLE_DEEP = '#4a3585';
const BG = '#f6f4f1';
const MUTE_50 = 'rgba(32,31,29,0.5)';
const MUTE_55 = 'rgba(32,31,29,0.55)';
const MUTE_60 = 'rgba(32,31,29,0.6)';
const MUTE_65 = 'rgba(32,31,29,0.65)';
// Hex opaque, BUKAN rgba() — @react-pdf/render meneruskan string warna border
// mentah ke pdfkit._normalizeColor(), yang cuma paham '#hex'/nama warna CSS,
// TIDAK paham sintaks rgba(). Border yang dikasih rgba() gagal senyap (fungsi
// balikin null → pdfkit skip set warna sama sekali) dan berakhir pewarisan
// warna stroke terakhir yang berhasil di-set sebelumnya (nongol merah/acak,
// BUKAN warna yang diminta). backgroundColor/color teks tidak kena masalah
// ini (lewat parseColor() yang beda & benar). Nilai di bawah = rgba(32,31,29,X)
// di-composite manual di atas BG halaman (#f6f4f1) jadi hex opaque setara —
// hasil render identik, aman dipakai di borderColor MAUPUN backgroundColor.
const RULE_16 = '#d4d2cf';
const RULE_20 = '#cbc9c7';
const RULE_22 = '#c7c5c2';
const RULE_14 = '#d8d6d3';

const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

function fmtDate(input) {
  if (!input) return '—';
  const d = input instanceof Date ? input : new Date(String(input).length <= 10 ? `${input}T00:00:00` : input);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ── DUA VARIAN ──────────────────────────────────────────────────────────────
// Komponen ini merender dua bentuk dokumen yang sama:
//
//   variant='download'  dikirim/diarsipkan sebagai PDF. Berdiri sendiri, jadi
//                       kopnya harus digambar (logo, "Storbit Indonesia",
//                       label Invoice, tiga baris meta) dan latar krem ikut.
//   variant='print'     dicetak di atas KERTAS KOP yang kop & kakinya SUDAH
//                       tercetak. Blok kop TIDAK digambar (kertas sudah
//                       membawanya), latar krem dibuang (akan menutupi kop
//                       yang tercetak), dan isinya dijauhkan dari kedua pita.
//
// Badan invoice — Billed By/To, tabel item, totals — IDENTIK di keduanya dan
// hanya ditulis sekali. Yang bercabang cuma satu blok JSX (kop) dan nilai-
// nilai style di bawah.
//
// ⚠️ Pemadatan jarak footBlock HANYA berlaku di varian cetak. Itu dijamin
// STRUKTURAL, bukan oleh kehati-hatian: keduanya StyleSheet yang berbeda,
// dibangun sekali saat modul dimuat. `hr` khususnya dipakai bersama blok di
// luar footBlock, jadi kalau nilainya dibagi satu sheet ia PASTI bocor.
//
// ── Batas area cetak varian 'print' ─────────────────────────────────────────
// ASALNYA: ukuran FISIK kertas kop, diukur Den 9 Sep 2026 —
//   header 4 cm   dari tepi atas    -> 4   x 28,3465 = 113,39 pt
//   footer 4,5 cm dari tepi bawah   -> 4,5 x 28,3465 = 127,56 pt
// masing-masing ditambah jarak aman 6 pt supaya isi tidak menempel persis di
// batas kop. Angka 6 pt itu BUKAN angka baru: sama dengan yang dipakai
// StorbitReportPDF.jsx (paddingTop = topH + 6, paddingBottom = botH + 6).
//
// ⚠️⚠️ KEDUANYA SUDAH DISETEL ULANG 10 Sep 2026 — 4 -> 3 (atas) dan
// 4,5 -> 3,5 (bawah). Cetak percobaan di kertas kop sungguhan menunjukkan isi
// mulai TERLALU JAUH di bawah logo: batas atas yang benar adalah tepi BAWAH
// LOGO Storbit, bukan tinggi pita kop 4 cm yang ikut membawa ruang kosong di
// bawah logo. Batas bawah dikecilkan atas alasan yang sejenis (ruang terbuang
// di atas kaki kop), sekaligus SATU-SATUNYA cara menurunkan blok Terms &
// Payment 1 cm — ia pakai marginTop:'auto' dan sudah menempel batas lama
// (diukur: baseline disclaimer 655,86, batas 658,44, sisa 2,58 pt).
//
// ⚠️ KEDUA ANGKA BARU ITU SEMENTARA. Keduanya diturunkan dari PEMBACAAN FOTO
// cetak percobaan 9 Sep 2026, BUKAN dari pengukuran penggaris langsung di
// kertas — bedanya nyata, dan angka lamanya (4 dan 4,5) justru berasal dari
// pengukuran langsung. Disetel ulang sesudah cetak percobaan berikutnya kalau
// masih meleset. Angka lama sengaja tetap tertulis di atas supaya
// perubahannya terlacak.
//
// ⚠️ Ini KALIBRASI, bukan konstanta abadi. Kalau cetak percobaan ternyata
// masih menabrak kop atau kakinya, yang disetel adalah dua angka cm di bawah
// — jangan menambal dengan menyisipkan angka lain ke dalam `page`.
//
// paddingHorizontal SENGAJA sama di kedua varian (kop kertas hanya membatasi
// atas & bawah).
const CM_TO_PT = 28.3465;
const KOP_CLEARANCE_PT = 6;
const KOP_HEADER_CM = 3;    // SEMENTARA, dari foto cetak percobaan 9 Sep 2026 (sebelumnya 4)
const KOP_FOOTER_CM = 3.5;  // SEMENTARA, dari foto cetak percobaan 9 Sep 2026 (sebelumnya 4,5)
const PRINT_PAD_TOP = KOP_HEADER_CM * CM_TO_PT + KOP_CLEARANCE_PT;
const PRINT_PAD_BOTTOM = KOP_FOOTER_CM * CM_TO_PT + KOP_CLEARANCE_PT;
// Ruang yang dibebaskan waktu batas atas dikecilkan dari 4 cm — dipakai HABIS
// oleh blok meta dokumen, dan bukan oleh isi yang lain. Ditulis sebagai
// turunan KOP_HEADER_CM, bukan angka mati, supaya kalibrasi ulang batas kop
// otomatis membawa serta blok meta tanpa ada yang perlu ingat menyetel dua
// tempat. Lihat pemakaiannya di blok meta varian cetak di bawah.
const META_LIFT_PT = (4 - KOP_HEADER_CM) * CM_TO_PT;
// Varian download tak punya kop fisik yang harus dihindari — margin tipis asli.
const SCREEN_PAD_TOP = 20;
const SCREEN_PAD_BOTTOM = 24;
const PAD_X = 46;

// `print` = true menghasilkan sheet varian cetak. Dipanggil DUA KALI di bawah,
// sekali per varian, lalu hasilnya dipakai apa adanya — tidak ada sheet yang
// dirakit ulang per render.
const makeStyles = (print) => StyleSheet.create({
  page: {
    color: INK, fontFamily: 'Lora', fontSize: 9.5,
    paddingTop: print ? PRINT_PAD_TOP : SCREEN_PAD_TOP,
    paddingBottom: print ? PRINT_PAD_BOTTOM : SCREEN_PAD_BOTTOM,
    paddingHorizontal: PAD_X,
    // Latar krem menutupi seluruh halaman — di kertas kop ia akan menimpa kop
    // yang sudah tercetak, jadi varian cetak sengaja tanpa key ini.
    ...(print ? {} : { backgroundColor: BG }),
  },

  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 },
  headName: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { height: 65, width: 65, objectFit: 'contain' },
  coName: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 19.5, color: INK },
  invLabel: { fontSize: 8.25, letterSpacing: 1, textTransform: 'uppercase', color: PURPLE, marginTop: 7.5, marginBottom: 4.5 },
  // Meta dokumen = TIGA KOLOM: label | titik dua | nilai. Bentuk ini dipilih
  // supaya titik duanya SEJAJAR VERTIKAL walau panjang labelnya beda-beda
  // ("Invoice Date" vs "Due Date" vs "SP No."). Menyambung label+':'+nilai jadi
  // satu string dan meratakannya dengan spasi TIDAK bisa rata di font
  // proporsional seperti Lora — lebarnya bergantung huruf, bukan jumlah spasi.
  // `metaKey` karena itu berlebar TETAP, bukan mengikuti panjang teks.
  metaRow: { flexDirection: 'column' },
  metaLine: { flexDirection: 'row', marginBottom: print ? 1.5 : 3 },
  // Ungu + tebal, warna diambil dari konstanta PURPLE yang sama dengan label
  // "Billed By"/"Billed To" (`billLabel`) — bukan hex baru.
  metaKey: { width: 68, fontWeight: 600, fontSize: 9.75, color: PURPLE },
  metaColon: { width: 8, fontWeight: 600, fontSize: 9.75, color: PURPLE },
  // Nilai sengaja gaya biasa: tidak tebal, warna tinta normal.
  //
  // Rata KANAN hanya di varian cetak. `flex:1` membuat kolom nilai memakan
  // sisa lebar kolom kanan billRow (324..566), lalu `textAlign:'right'`
  // mendorong isinya ke tepi 566 — tepi yang SAMA dengan kolom SUBTOTAL tabel
  // dan tepi kanan kotak Grand Total, jadi ketiga blok itu segaris.
  //
  // ⚠️ FORK-nya WAJIB, bukan kerapian. Di varian download blok meta duduk di
  // kolom kiri kop yang selebar halaman, jadi rata kanan akan melempar
  // nilainya ke x=478 sementara titik duanya tetap di x=114 — terukur, bukan
  // dugaan. Ini kelas kebocoran yang sama dengan yang sudah diperingatkan
  // untuk `hr` di catatan DUA VARIAN di atas: satu nilai style yang dipakai
  // bersama PASTI bocor ke varian yang tidak memintanya.
  //
  // Titik dua tetap sejajar sesudah perubahan ini — diverifikasi dari
  // koordinat x di PDF hasil render: x=392 di ketiga baris varian cetak,
  // x=114 di ketiga baris varian download. Rata kanan hanya menyentuh kolom
  // nilai; `metaKey` 68pt dan `metaColon` 8pt tidak berubah sama sekali.
  metaVal: { ...(print ? { flex: 1, textAlign: 'right' } : {}), fontSize: 9.75, color: INK },

  hr: { height: 1, backgroundColor: RULE_16, marginVertical: print ? 4 : 7.5 },

  billRow: { flexDirection: 'row', gap: 36 },
  billCol: { flex: 1 },
  billLabel: { fontSize: 8.25, letterSpacing: 0.66, textTransform: 'uppercase', color: PURPLE, marginBottom: 4.5 },
  billName: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 14.25, color: INK },
  billMute: { fontSize: 9.75, marginTop: 4.5, color: MUTE_65, lineHeight: 1.55 },
  billFaint: { fontSize: 9.75, marginTop: 2.25, color: MUTE_55 },

  // Label vertikal "INVOICE #..." — react-pdf/Yoga TIDAK meng-clip otomatis
  // konten yang di-transform, dan sebelum di-rotate, Text tanpa width eksplisit
  // di-wrap dulu supaya muat di lebar parent — hasilnya numpuk beberapa baris
  // pendek, lalu keseluruhan blok itu yang di-rotate, jadi lebar & bocor ke
  // section lain (bug lama). Fix: (1) `sideLabel` dikasih width tetap yang
  // lega supaya dia layout SATU baris utuh sebelum rotate — BUKAN di-wrap.
  // react-pdf TIDAK punya prop setara "no-wrap"/whiteSpace:nowrap buat Text
  // (dicek ke source @react-pdf/stylesheet + textkit — `wrap` yang ada di
  // Text/View itu soal PAGE-break, bukan line-wrap; line-breaker textkit
  // murni berbasis lebar tersedia, tidak ada API buat mematikannya) — jadi
  // satu-satunya cara pasti aman: kasih ruang lebih dari cukup. Diukur
  // presisi (render+ukur bbox tinta asli, bukan tebak) beberapa kombinasi
  // kode entitas 3-huruf real: kebutuhan terlebar ~210pt (WWW/FIN/2026/8888,
  // prefix "INV/" sudah dibuang buat display — lihat helper shortInvoiceNo
  // di bawah). width:300 di sini kasih headroom BESAR (bukan pas-pasan
  // kayak width:220 sebelumnya yang cuma 0.3pt di atas kebutuhan nyata
  // "INV/SOA/FIN/2026/0002" 229.7pt — makanya kepotong/ke-wrap 2 baris pas
  // dites data asli). (2) `sideLabelWrap` dikasih overflow:hidden + height
  // GEOMETRIS SETARA sideLabel.width (rotate 90° menukar w↔h — width:300
  // pre-rotate jadi tinggi post-rotate, bukan angka sembarang) supaya jadi
  // jendela clip yang pasti muat, tidak bergantung tinggi tabel di sebelahnya.
  //
  // `sideLabelWrap` posisinya position:'absolute' di dalam `itemsRow` yang
  // position:'relative' — SENGAJA, bukan flex sibling dari `table` lagi
  // (dulu begitu, tapi height:230 yang wajib buat nampung label ikut jadi
  // tinggi MINIMUM itemsRow walau isi tabelnya cuma 2-3 baris pendek, nyisain
  // ratusan pt ruang kosong sebelum Totals/Footer dan mendorong PDF ke
  // halaman 2 — ditemukan Den di app asli). Dengan absolute, itemsRow punya
  // 1 anak in-flow (`table`) yang nentuin tinggi ASLINYA (ikut jumlah baris),
  // sementara label numpang render di atasnya tanpa ikut menghitung tinggi.
  // itemsRow TETAP posisi normal-flow (bukan ikut Page), jadi tetap otomatis
  // turun kalau Billed By di atasnya tambah tinggi (bug SEBELUM-sebelumnya).
  // marginLeft negatif (desain: -36px≈-27pt) narik itemsRow ke gutter kiri
  // halaman, biar label vertikal nempel tepi — bukan sejajar kolom konten
  // lain. `table` dikasih marginLeft manual (24+10.5) buat gantiin gap yang
  // dulu didapat gratis dari flex row, biar posisi visualnya identik.
  itemsRow: { position: 'relative', flexDirection: 'row', marginTop: 15, marginLeft: -27 },
  // justifyContent WAJIB 'center', BUKAN 'flex-start'/'flex-end' — react-pdf
  // nge-rotate elemen di sekitar TITIK TENGAH box-nya SENDIRI (pre-rotate),
  // bukan di sekitar titik (0,0) container. Kalau box pre-rotate diposisikan
  // flex-start (nempel atas, titik tengahnya deket y=0), hasil rotasi
  // menjorok SIMETRIS ke ATAS *dan* BAWAH titik tengah itu — separuh
  // (segmen y negatif) kepotong overflow:hidden di ATAS, walau titik start
  // teks "kelihatan" pas sejajar DESCRIPTION (sudah dicoba & terbukti salah,
  // teks "INVOICE #INV/SOA/FIN/2026/0002" cuma tampil sampai
  // "INVOIC.../#INV/SOA/FIN/" lalu kepotong). 'center' pada wrap 230pt +
  // box pre-rotate 220pt lebar → titik tengah pas di tengah 230pt → hasil
  // rotasi [5,225], simetris muat dengan margin kecil di dua sisi — SATU-
  // SATUNYA opsi yang aman untuk elemen yang di-rotate 90°.
  // `top: -80` — SATU nilai untuk KEDUA varian (keputusan Den: tampilannya
  // harus seragam). Label ini absolut relatif terhadap `itemsRow`, dan
  // `justifyContent:'center'` menaruhnya di TENGAH jendela 310pt — artinya
  // jaraknya ke header tabel TETAP, tak peduli tabelnya berapa baris. Pada
  // `top:0` label mulai 228,91pt di bawah header DESCRIPTION (diukur, dan
  // IDENTIK di kedua varian — perbedaannya cuma bacaan mata, bukan geometri);
  // -80 membawa tepi atasnya ke garis header itu.
  //
  // Digeser lewat `top`, BUKAN dengan mengecilkan `height` atau menukar
  // `justifyContent` ke 'flex-start' — dua-duanya merusak. `height:310` adalah
  // jendela clip yang geometrinya harus >= `sideLabel.width` (lihat catatan
  // panjang di atas), dan 'flex-start' memotong separuh teks karena react-pdf
  // me-rotate di sekitar titik tengah box. Menggeser `top` memindahkan jendela
  // DAN isinya bersama-sama, jadi margin clip-nya tetap utuh (78pt di dua sisi).
  sideLabelWrap: { position: 'absolute', top: -80, left: 0, width: 24, height: 310, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  sideLabel: { fontFamily: 'Lora', fontWeight: 600, fontSize: 12.75, width: 300, textAlign: 'center', transform: 'rotate(-90deg)', color: MUTE_50 },
  sideLabelAccent: { color: PURPLE_DEEP },

  // Lebar kolom organik (bukan persen tetap) — DESCRIPTION flex:1 ambil sisa
  // ruang & boleh wrap multi-baris, kolom lain lebar tetap secukupnya buat
  // konten realistis (SKU/qty/harga) supaya tidak ikut ketarik menyempit.
  // marginLeft (24+10.5) gantiin offset yang dulu didapat gratis dari
  // sideLabelWrap+gap sewaktu masih flex sibling — flex:1 tetap jalan normal
  // karena `table` masih satu-satunya anak in-flow dari itemsRow (row-flex).
  table: { flex: 1, marginLeft: 34.5 },
  thRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RULE_22 },
  th: { fontSize: 7, letterSpacing: 0.54, textTransform: 'uppercase', color: MUTE_55, paddingBottom: 5 },
  cDesc: { flex: 1, paddingRight: 9 },
  cSku: { width: 92, paddingRight: 9, flexShrink: 0 },
  cQty: { width: 34, textAlign: 'right', paddingRight: 9, flexShrink: 0 },
  cPrice: { width: 66, textAlign: 'right', paddingRight: 9, flexShrink: 0 },
  cSub: { width: 72, textAlign: 'right', flexShrink: 0 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: RULE_14 },
  td: { fontSize: 9.75, paddingVertical: 5 },
  tdMute: { color: MUTE_65 },

  // Blok totals dikecilkan HANYA di varian cetak — font, jarak, dan padding
  // sekaligus, karena mengecilkan salah satunya saja membuat blok terlihat
  // renggang alih-alih ringkas. Penghematannya 22,41 pt (diukur lewat spacer
  // biner, bukan dijumlah dari nilai style), dan itu MELAMPAUI tinggi satu
  // baris tabel 22,94 pt di ambang batasnya — ini satu-satunya penataan sesi
  // 10 Sep 2026 yang benar-benar menaikkan batas halaman varian cetak.
  //
  // ⚠️ Grand Total TIDAK ikut kehilangan penekanan, dan itu dijaga oleh rasio,
  // bukan oleh kehati-hatian: ia tetap satu-satunya kotak berbingkai, tetap
  // tipe terbesar di blok, dan rasionya ke baris biasa cuma bergeser dari
  // 14,25/9,75 = 1,46 jadi 13/9 = 1,44. Kalau kelak angkanya disetel lagi,
  // jaga rasio itu — bukan selisih absolutnya.
  //
  // SENGAJA tidak diterapkan ke varian download (keputusan Den 10 Sep 2026):
  // download adalah varian yang setia pada desain sumber (lihat catatan kepala
  // file), dan ia tidak sedang tertekan paginasi. Mengubahnya berarti
  // menyimpang dari desain sumber untuk masalah yang tidak ia punya. Kalau
  // kelak diputuskan sebaliknya, terukur: batas download naik n<=6 -> n<=7.
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: print ? 9 : 10.5 },
  totalsBox: { width: 240, flexDirection: 'column', gap: print ? 3.5 : 5 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: print ? 9 : 9.75, color: MUTE_60 },
  totalVal: { fontSize: print ? 9 : 9.75, color: INK },
  totalHr: { height: 1, backgroundColor: RULE_20, marginVertical: print ? 3 : 4.5 },
  grandBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: PURPLE, borderRadius: 3, paddingVertical: print ? 5.5 : 7.5, paddingHorizontal: print ? 11 : 12, marginTop: print ? 2 : 3 },
  grandLabel: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: print ? 10.5 : 11.25 },
  grandVal: { fontFamily: 'Lora', fontWeight: 600, fontSize: print ? 13 : 14.25, color: PURPLE_DEEP },

  // ⚠️ `marginTop:'auto'` = blok ini SELALU menempel batas bawah halaman, tak
  // peduli isinya berapa baris (diukur: baseline disclaimer 655,86 identik di
  // n=1 maupun n=4). Konsekuensinya, MENURUNKAN blok ini tidak bisa dilakukan
  // dari sini — tak ada nilai style di blok ini yang menggerakkannya ke bawah,
  // ruang yang tersedia cuma 2,58 pt sampai batas. Satu-satunya tuas yang
  // bekerja adalah KOP_FOOTER_CM, dan itulah yang dipakai waktu blok ini
  // diturunkan 1 cm pada 10 Sep 2026 (4,5 -> 3,5 cm). Jangan mencoba
  // menambalnya dengan marginBottom negatif atau paddingTop — yang pertama
  // menembus batas kop tanpa penjaga, yang kedua justru memakan ruang tabel.
  footBlock: { marginTop: 'auto', paddingTop: print ? 4 : 7.5 },
  termsLabel: { fontSize: 8.25, letterSpacing: 0.66, textTransform: 'uppercase', color: PURPLE, marginBottom: print ? 3 : 4.5 },
  termsText: { fontSize: 9, color: MUTE_60 },
  payBox: { borderWidth: 1, borderColor: RULE_20, borderRadius: 3, paddingVertical: print ? 5 : 7.5, paddingHorizontal: 13, maxWidth: 260, marginTop: print ? 4 : 6 },
  payTitle: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 12, marginBottom: print ? 3 : 6 },
  // Inline (bukan kolom rata) — persis desain: label + spasi kecil, lalu
  // value nyambung di baris yang sama, lebar organik ikut panjang teks.
  payRow: { fontSize: 9.75, marginBottom: print ? 1.5 : 3 },
  payLabel: { color: MUTE_55 },

  disclaimer: { fontSize: print ? 7.5 : 8.25, color: MUTE_50, lineHeight: print ? 1.35 : 1.6, marginTop: print ? 6 : 10 },
});

const S_DOWNLOAD = makeStyles(false);
const S_PRINT = makeStyles(true);

// `variant` default 'download' — pemanggil lama tetap mendapat bentuk yang
// sama persis seperti sebelumnya tanpa perlu diubah.
// Satu baris meta dokumen. Sengaja tiga <Text> bersaudara di dalam View
// ber-flexDirection row — BUKAN satu <Text> yang disambung — karena hanya
// dengan kolom terpisah titik duanya bisa dijamin sejajar.
function MetaLine({ s, label, value }) {
  return (
    <View style={s.metaLine}>
      <Text style={s.metaKey}>{label}</Text>
      <Text style={s.metaColon}>:</Text>
      <Text style={s.metaVal}>{value}</Text>
    </View>
  );
}

export default function InvoicePDF({ invoice = {}, variant = 'download' }) {
  const isPrint = variant === 'print';
  const s = isPrint ? S_PRINT : S_DOWNLOAD;
  const lines = invoice.lines || [];
  const company = invoice.company || {};
  const bank = invoice.bank || null;
  // Informational-only — TIDAK dari kolom DB, TIDAK ikut dijumlahkan ke Grand
  // Total (yang tetap total_dpp + total_ppn + total_shipping seperti semula).
  const dppNilaiLain = ((Number(invoice.total_dpp) || 0) + (Number(invoice.total_shipping) || 0)) * DPP_NILAI_LAIN_RATIO;

  const address = [company.address, company.address_2].filter(Boolean).join(', ');
  const cityLine = [company.city, company.province, company.postal_code].filter(Boolean).join(', ');
  const fullAddress = [address, cityLine].filter(Boolean).join(', ') || '—';

  // Buang prefix entitas+"-INV-" dari invoice_no buat label vertikal —
  // "INVOICE" udah kepakai sebagai kata di depannya, "INVOICE #SOA-INV-..."
  // jadi redundan. [Update 14 Agu 2026] format invoice_no ganti dari
  // "INV/{entitas}/FIN/{tahun}/{urut}" ke "{entitas}-INV-{bulan romawi}-
  // {tahun}-{urut}" — regex diperbarui dari /^INV\// (match prefix lama)
  // ke /^[A-Z]+-INV-/ (match kode entitas apa pun di depan "-INV-").
  // Cuma buat tampilan label ini; invoice_no ASLI tetap dipakai apa adanya
  // di tempat lain (nama file download, dst).
  const shortInvoiceNo = invoice.invoice_no ? invoice.invoice_no.replace(/^[A-Z]+-INV-/, '') : '—';

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header — beserta garis pemisahnya, TIDAK dirender di varian cetak:
            kertas kop sudah membawa keduanya, dan garis yang tak memisahkan
            apa pun cuma jadi coretan di puncak halaman. */}
        {!isPrint && (
          <>
            <View style={s.headRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.headName}>
                  <Image style={s.logo} src={LOGO_URL} />
                  {/* "Storbit" = judul dokumen tetap, sama seperti "STORBIT" hardcode di
                      PickingListPDF/DeliveryNotePDF — bukan kolom companies.name
                      ("Storbit / SBI", dipakai internal, bukan buat tampilan customer). */}
                  <Text style={s.coName}>Storbit Indonesia</Text>
                </View>
                <Text style={s.invLabel}>Invoice</Text>
                <View style={s.metaRow}>
                  <MetaLine s={s} label="Invoice Date" value={fmtDate(invoice.invoice_date)} />
                  <MetaLine s={s} label="Due Date" value={fmtDate(invoice.due_date)} />
                  <MetaLine s={s} label="SP No." value={invoice.sp_no || '—'} />
                </View>
              </View>
            </View>

            <View style={s.hr} />
          </>
        )}

        {/* ⚠️ NAIK 1 CM (10 Sep 2026) — dan cara naiknya penting. Blok ini tidak
            digeser sendiri; yang terjadi adalah batas atas kertas kop
            dikecilkan 4 cm -> 3 cm (commit sebelumnya), lalu ruang 1 cm yang
            terbebas itu DISERAP KEMBALI oleh `marginBottom` di bawah sini
            (3 + META_LIFT_PT). Hasil bersihnya: cuma blok meta yang naik,
            Billed By/To dan segala yang di bawahnya TETAP di koordinat semula
            (diverifikasi: BILLED BY tetap y=172,63 — identik dengan sebelum
            kedua commit itu), dan paginasi TIDAK berubah sama sekali.

            ⚠️ Konsekuensi yang harus diingat kalau batas kop dikalibrasi ulang:
            kenaikan blok meta SAMA PERSIS dengan pengurangan KOP_HEADER_CM.
            Menyetel batas ke 3,5 cm otomatis menurunkan kenaikan meta jadi
            0,5 cm — bukan bug, itu memang definisi META_LIFT_PT. Kalau yang
            diinginkan meta naik 1 cm sementara batasnya 3,5 cm, marginBottom
            inilah yang harus dilepas dari META_LIFT_PT, dan konsekuensinya
            SELURUH isi ikut naik 0,5 cm.

            ⚠️ JANGAN diganti dengan marginTop negatif pada blok ini. Itu
            menaruh meta di atas padding halaman — di luar batas kop, persis
            hal yang padding itu jaga — dan tak ada yang menahannya waktu
            KOP_HEADER_CM dikecilkan lagi kelak. */}
        {/* Meta dokumen — HANYA varian cetak. Ketiganya hidup di blok kop yang
            dicabut untuk kertas kop, tapi tanggal & nomor SP berbeda tiap
            invoice sehingga kop tercetak mustahil memuatnya.
            Duduk di KANAN ATAS dengan Billed By/To sejajar di bawahnya. Dibuat
            sebagai baris berkolom dua dengan separuh kiri KOSONG, supaya meta
            tetap sejajar kolom kanan dan tidak melebar ke kiri.
            Label "INVOICE" sengaja tidak ikut: kop kertas dan label vertikal
            nomor invoice sudah menandai jenis dokumennya.

            ⚠️ YANG DIBAYAR OLEH POSISI INI — baca sebelum memindahkannya lagi.
            Sebagai baris tersendiri, blok ini membayar TINGGI PENUH-nya, karena
            tak ada kolom lain yang menyerapnya. Di posisi sebelumnya (di dalam
            kolom Billed To) ia cuma membayar SELISIH antar-kolom: tinggi
            `billRow` = max(kiri, kanan), dan kolom kanan lebih pendek dari kiri,
            jadi sebagian tingginya gratis.
            Konsekuensinya diukur (9 Sep 2026, varian cetak, batas satu halaman):
              posisi lama (kanan bawah): n<=6 alamat kosong / n<=5 satu baris /
                                         n<=4 dua baris / n<=3 tiga baris
              posisi ini  (kanan atas):  n<=4 untuk SEMUA panjang alamat
            Ditukar dengan sadar: pada sebaran produksi (522 SP, 49 DC beralamat
            — 5 satu baris, 30 dua baris, 14 tiga baris) posisi ini membuat 26 SP
            pecah ke halaman kedua, turun dari 30. Ia kalah di kasus yang jarang
            dan menang di kolom tiga-baris yang mencakup 28,6% DC, sekaligus
            membuat batasnya tidak lagi bergantung DC mana. */}
        {isPrint && (
          <View style={[s.billRow, { marginBottom: 3 + META_LIFT_PT }]}>
            <View style={s.billCol} />
            <View style={[s.billCol, s.metaRow]}>
              <MetaLine s={s} label="Invoice Date" value={fmtDate(invoice.invoice_date)} />
              <MetaLine s={s} label="Due Date" value={fmtDate(invoice.due_date)} />
              <MetaLine s={s} label="SP No." value={invoice.sp_no || '—'} />
            </View>
          </View>
        )}

        {/* Billed By / Billed To */}
        <View style={s.billRow}>
          <View style={s.billCol}>
            <Text style={s.billLabel}>Billed By</Text>
            {/* Nama PT jadi nama pihak — memakai `billName`, style yang sama
                dengan nama customer di Billed To, supaya kedua blok pihak
                sejajar bentuknya. Baris "Storbit" (judul dokumen tetap yang
                dulu di atasnya) dicabut 11 Sep 2026: di kertas kop nama itu
                sudah tercetak, dan di varian download ia sudah ada di kop
                atas. `billSub` tak lagi dipakai di kolom ini. Nilainya DATA —
                companies.legal_name entitas SP — bukan literal. */}
            <Text style={s.billName}>{company.legal_name || '—'}</Text>
            <Text style={s.billMute}>{fullAddress}</Text>
            <Text style={s.billFaint}>NPWP: {company.tax_id || '—'}</Text>
          </View>
          <View style={s.billCol}>
            <Text style={s.billLabel}>Billed To</Text>
            <Text style={s.billName}>{invoice.customer_name || '—'}</Text>
            {/* Alamat CUSTOMER (accounts.address). ⚠️ NOL informasi DC di
                invoice — nama maupun alamatnya (keputusan Den 10 Sep 2026
                sesudah cetak percobaan): dokumen ini ditagihkan ke customer,
                bukan ke gudang tujuan. Baris `billSub` berisi nama DC dicabut
                bersamaan, jadi kolom ini sekarang nama + alamat saja.

                Alamat kosong dicetak '—', BUKAN barisnya dihilangkan — kebalikan
                dari perlakuan sebelumnya yang meniru `PartyBlock` printKit.jsx.
                Alasannya berubah karena sumbernya berubah: alamat DC memang
                boleh tak ada (tak semua SP punya DC), sedangkan alamat customer
                SEHARUSNYA selalu ada dan kosongnya adalah master data yang
                belum diisi — '—' membuat kekosongan itu terlihat dan tertagih,
                baris yang hilang menyembunyikannya. Diukur 10 Sep 2026: dari
                empat customer Storbit yang punya SP, cuma Indomarco yang
                alamatnya terisi. Sengaja TIDAK dicadangkan ke dc_master.alamat
                — lihat catatan di getInvoicePdfData (db.js). */}
            <Text style={s.billMute}>{invoice.customer_address || '—'}</Text>
          </View>
        </View>

        {/* Item table + label vertikal */}
        <View style={s.itemsRow}>
          <View style={s.sideLabelWrap}>
            <Text style={s.sideLabel}>
              INVOICE <Text style={s.sideLabelAccent}>#{shortInvoiceNo}</Text>
            </Text>
          </View>
          <View style={s.table}>
            <View style={s.thRow}>
              <Text style={[s.th, s.cDesc]}>Description</Text>
              <Text style={[s.th, s.cSku]}>SKU</Text>
              <Text style={[s.th, s.cQty]}>Qty</Text>
              <Text style={[s.th, s.cPrice]}>Unit Price</Text>
              <Text style={[s.th, s.cSub]}>Subtotal</Text>
            </View>
            {lines.map((l, i) => (
              <View style={s.tr} key={l.id || i}>
                <Text style={[s.td, s.cDesc]}>{l.product_name || '—'}</Text>
                <Text style={[s.td, s.cSku, s.tdMute]}>{l.sku || '—'}</Text>
                <Text style={[s.td, s.cQty]}>{Number(l.qty || 0).toLocaleString('id-ID')}</Text>
                <Text style={[s.td, s.cPrice]}>{rp(l.unit_price)}</Text>
                <Text style={[s.td, s.cSub]}>{rp(l.dpp)}</Text>
              </View>
            ))}
            {lines.length === 0 && (
              <View style={s.tr}><Text style={[s.td, { width: '100%', color: MUTE_55 }]}>Tidak ada item.</Text></View>
            )}
          </View>
        </View>

        {/* Totals */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalVal}>{rp(invoice.total_dpp)}</Text></View>
            <View style={s.totalRow}><Text style={s.totalLabel}>Shipping</Text><Text style={s.totalVal}>{rp(invoice.total_shipping)}</Text></View>
            <View style={s.totalRow}><Text style={s.totalLabel}>DPP (Nilai Lain)</Text><Text style={s.totalVal}>{rp(dppNilaiLain)}</Text></View>
            <View style={s.totalRow}><Text style={s.totalLabel}>VAT (11%)</Text><Text style={s.totalVal}>{rp(invoice.total_ppn)}</Text></View>
            <View style={s.totalHr} />
            <View style={s.grandBox}>
              <Text style={s.grandLabel}>Grand Total</Text>
              <Text style={s.grandVal}>{rp(invoice.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* Terms & Payment */}
        <View style={s.footBlock}>
          <View style={s.hr} />
          <Text style={s.termsLabel}>Terms &amp; Instructions</Text>
          <Text style={s.termsText}>Payment must be made in full to the account below.</Text>

          <View style={s.payBox}>
            <Text style={s.payTitle}>Payment</Text>
            {bank ? (
              <>
                <Text style={s.payRow}><Text style={s.payLabel}>Bank  </Text>{bank.bank_name}{bank.branch ? ` ${bank.branch}` : ''}</Text>
                <Text style={s.payRow}><Text style={s.payLabel}>Account No.  </Text>{bank.account_number}</Text>
                <Text style={s.payRow}><Text style={s.payLabel}>Account Name  </Text>{bank.account_holder}</Text>
              </>
            ) : (
              <Text style={{ fontSize: 9.5, color: MUTE_55 }}>Rekening pembayaran belum diatur untuk entitas ini.</Text>
            )}
          </View>

          <View style={s.hr} />
          <Text style={s.disclaimer}>
            This document is not a Tax Invoice (Faktur Pajak). The Tax Invoice is issued separately in accordance with applicable Indonesian tax regulations.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
