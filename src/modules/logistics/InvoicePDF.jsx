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

const s = StyleSheet.create({
  page: { backgroundColor: BG, color: INK, fontFamily: 'Lora', fontSize: 9.5, paddingTop: 20, paddingBottom: 24, paddingHorizontal: 46 },

  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 },
  headName: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { height: 65, width: 65, objectFit: 'contain' },
  coName: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 19.5, color: INK },
  // Placeholder kosong — posisi/ukuran ikut desain (image-slot 96x96px≈72x72pt),
  // isinya SENGAJA belum diisi (belum diputuskan QR itu bakal ngarah ke link
  // verifikasi/pembayaran yang mana — nyusul task terpisah).
  qrBox: { width: 72, height: 72, flexShrink: 0, borderWidth: 1, borderStyle: 'dashed', borderColor: RULE_20 },

  invLabel: { fontSize: 8.25, letterSpacing: 1, textTransform: 'uppercase', color: PURPLE, marginTop: 7.5, marginBottom: 4.5 },
  metaRow: { flexDirection: 'column', gap: 3 },
  metaItem: { flexDirection: 'column' },
  metaLabel: { fontSize: 8.25, color: MUTE_55 },
  metaVal: { fontSize: 9.75, color: INK },

  hr: { height: 1, backgroundColor: RULE_16, marginVertical: 7.5 },

  billRow: { flexDirection: 'row', gap: 36 },
  billCol: { flex: 1 },
  billLabel: { fontSize: 8.25, letterSpacing: 0.66, textTransform: 'uppercase', color: PURPLE, marginBottom: 4.5 },
  billName: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 14.25, color: INK },
  billSub: { fontSize: 10.5, marginTop: 2, color: INK },
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
  sideLabelWrap: { position: 'absolute', top: 0, left: 0, width: 24, height: 310, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
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

  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10.5 },
  totalsBox: { width: 240, flexDirection: 'column', gap: 5 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 9.75, color: MUTE_60 },
  totalVal: { fontSize: 9.75, color: INK },
  totalHr: { height: 1, backgroundColor: RULE_20, marginVertical: 4.5 },
  grandBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: PURPLE, borderRadius: 3, paddingVertical: 7.5, paddingHorizontal: 12, marginTop: 3 },
  grandLabel: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 11.25 },
  grandVal: { fontFamily: 'Lora', fontWeight: 600, fontSize: 14.25, color: PURPLE_DEEP },

  footBlock: { marginTop: 'auto', paddingTop: 7.5 },
  termsLabel: { fontSize: 8.25, letterSpacing: 0.66, textTransform: 'uppercase', color: PURPLE, marginBottom: 4.5 },
  termsText: { fontSize: 9, color: MUTE_60 },
  payBox: { borderWidth: 1, borderColor: RULE_20, borderRadius: 3, paddingVertical: 7.5, paddingHorizontal: 13, maxWidth: 260, marginTop: 6 },
  payTitle: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: 12, marginBottom: 6 },
  // Inline (bukan kolom rata) — persis desain: label + spasi kecil, lalu
  // value nyambung di baris yang sama, lebar organik ikut panjang teks.
  payRow: { fontSize: 9.75, marginBottom: 3 },
  payLabel: { color: MUTE_55 },

  disclaimer: { fontSize: 8.25, color: MUTE_50, lineHeight: 1.6, marginTop: 10 },
});

export default function InvoicePDF({ invoice = {} }) {
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
        {/* Header */}
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
              <View style={s.metaItem}><Text style={s.metaLabel}>Invoice Date</Text><Text style={s.metaVal}>{fmtDate(invoice.invoice_date)}</Text></View>
              <View style={s.metaItem}><Text style={s.metaLabel}>Due Date</Text><Text style={s.metaVal}>{fmtDate(invoice.due_date)}</Text></View>
              <View style={s.metaItem}><Text style={s.metaLabel}>PO No.</Text><Text style={s.metaVal}>{invoice.sp_no || '—'}</Text></View>
            </View>
          </View>
          <View style={s.qrBox} />
        </View>

        <View style={s.hr} />

        {/* Billed By / Billed To */}
        <View style={s.billRow}>
          <View style={s.billCol}>
            <Text style={s.billLabel}>Billed By</Text>
            <Text style={s.billName}>Storbit</Text>
            <Text style={s.billSub}>{company.legal_name || '—'}</Text>
            <Text style={s.billMute}>{fullAddress}</Text>
            <Text style={s.billFaint}>NPWP: {company.tax_id || '—'}</Text>
          </View>
          <View style={s.billCol}>
            <Text style={s.billLabel}>Billed To</Text>
            <Text style={s.billName}>{invoice.customer_name || '—'}</Text>
            <Text style={s.billSub}>{invoice.dc_name || '—'}</Text>
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
