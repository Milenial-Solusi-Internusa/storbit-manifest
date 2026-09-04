// src/modules/logistics/StorbitReportPDF.jsx
// Laporan Per Barang (Dashboard Storbit) — @react-pdf/renderer.
//
// PALET: ungu #5b3fa0 / krem #f6f4f1 / Lora + Cormorant, seluruhnya diimpor
// dari printTokens.js — SATU KELUARGA dengan PickingListPDF, DeliveryNotePDF,
// dan InvoicePDF. NOL token baru diperkenalkan di file ini.
//
//   Catatan supaya tak "dibetulkan" keliru di kemudian hari: navy #144682 /
//   orange #E85A1E adalah brand cetak modul CRM (InquiryPDF/QuotationPDF),
//   BUKAN Storbit. Ketiga dokumen Storbit yang sudah ada memakai ungu/krem,
//   dan laporan ini mengikutinya. Lihat komentar di kepala printTokens.js.
//
// ORIENTASI: LANDSCAPE, menyimpang dari tiga dokumen Storbit lain yang
// portrait. Alasannya isi, bukan selera — tabel daftar SP punya 11 kolom, dan
// di portrait (516pt setelah margin) kolom "Nilai Sisa" pasti terpotong.
// Definition of done menuntut isi PDF SAMA PERSIS dengan layar, jadi kolomnya
// tak boleh dibuang. Konsekuensinya PageChrome dari printKit.jsx tak bisa
// dipakai apa adanya (SVG-nya dipatok PAGE_W×PAGE_H portrait), jadi ornamen
// sudut digambar ulang di sini dengan dimensi tertukar — memakai konstanta
// PURPLE + opacity yang PERSIS SAMA, bukan nilai baru.
import { Document, Page, View, Text, Image, Svg, Polygon } from '@react-pdf/renderer';
import { s, px, PAGE_W, PAGE_H, PURPLE, INK, ink, LOGO_URL, fmtDate } from './printTokens';

// Landscape Letter = portrait yang ditukar.
const L_W = PAGE_H;   // 792
const L_H = PAGE_W;   // 612

// Rupiah tanpa desimal — seluruh nilai laporan ini bulat rupiah.
const fmtIDR = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const fmtNum = (n) => Number(n || 0).toLocaleString('id-ID');
// Qty + satuan produk, apa adanya dari master (products.unit -> uom).
const fmtQtyU = (n, uom) => (uom ? `${fmtNum(n)} ${uom}` : fmtNum(n));

// ── Ligatur fi/fl/ff: pecah run shaping ─────────────────────────────────────
// GEJALA: "defisit" tercetak seperti "defsit", "filter" seperti "flter".
//
// SEBAB SEBENARNYA (didiagnosis 5 Sep 2026 — BUKAN font rusak, BUKAN bug
// embedding, dan BUKAN salah ketik di source):
//   1. Lora & Cormorant sama-sama membawa fitur GSUB `liga`, dan fontkit
//      menerapkannya secara default. "defisit" (7 huruf) jadi 6 glyph — f+i
//      dikolaps ke SATU glyph ligatur (Lora id 369, Cormorant id 1041).
//   2. Glyph ligatur itu SEHAT dan lengkap (advanceWidth 623, bbox penuh),
//      dan PDF-nya pun benar: ToUnicode memetakan glyph tsb ke <0066 0069>,
//      jadi copy-paste dari PDF tetap menghasilkan "defisit".
//   3. Yang bermasalah murni KETERBACAAN: ligatur `fi` memang DIRANCANG tanpa
//      titik — glyph `i` sendiri punya 2 kontur (batang + titik), ligatur `fi`
//      cuma 1 kontur. Pada px(8.5)–px(9) titik yang lebur itu membuat huruf i
//      seolah hilang. Di px(13) ke atas ia terbaca normal.
//
// KENAPA BUKAN CARA LAIN:
//   · Tak ada style prop untuk mematikan ligature di @react-pdf/renderer 4.5.1
//     — getFragments (@react-pdf/layout) merakit atribut textkit secara
//     eksplisit dan TIDAK PERNAH mengisi `features`, sehingga fontkit selalu
//     memakai fitur default. Menaikkannya butuh patch library.
//   · ZWNJ (U+200C) justru merusak: di ketiga font ini ia memetakan ke glyph
//     `space` (advanceWidth 263/234), jadi hasilnya "def isit".
//   · Mengganti kata / keluarga font / ukuran = menambal gejala, bukan sebab.
//
// YANG DIPAKAI: memecah RUN SHAPING lewat <Text> bersarang. Ligatur tak bisa
// terbentuk melintasi batas elemen. Terbukti dari content stream PDF — versi
// polos menghasilkan glyph ligatur tunggal <0003>, versi terpecah menghasilkan
// <000a><0005> (f dan i sebagai glyph terpisah). Nol perubahan pada teks yang
// terbaca maupun yang ter-copy-paste.
const LIG_SPLIT = /(?<=f)(?=[fil])/;
function noLig(value) {
  const s = String(value ?? '');
  if (!LIG_SPLIT.test(s)) return s;
  return s.split(LIG_SPLIT).map((part, i) => (i === 0 ? part : <Text key={i}>{part}</Text>));
}

// Ornamen sudut versi landscape — bentuk & fillOpacity identik PageChrome.
function ReportChrome() {
  const topH = px(96);
  const botH = px(84);
  const botY = L_H - botH;
  return (
    <Svg width={L_W} height={L_H} viewBox={`0 0 ${L_W} ${L_H}`} style={{ position: 'absolute', top: 0, left: 0 }} fixed>
      <Polygon points={`0,0 ${L_W},0 ${L_W},${topH * 0.4} 0,${topH}`} fill={PURPLE} fillOpacity={0.1} />
      <Polygon points={`${L_W},0 ${L_W},${topH} ${L_W - px(150)},0`} fill={PURPLE} fillOpacity={0.22} />
      <Polygon points={`0,${botY} ${L_W},${botY + botH * 0.6} ${L_W},${L_H} 0,${L_H}`} fill={PURPLE} fillOpacity={0.1} />
      <Polygon points={`0,${L_H} 0,${botY} ${px(170)},${L_H}`} fill={PURPLE} fillOpacity={0.22} />
    </Svg>
  );
}

// Kartu angka — dipakai strip outstanding & strip ringkasan produk.
function Stat({ label, value, sub, warn }) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: 0, minWidth: 0,
      borderWidth: 1, borderColor: warn ? PURPLE : '#ded9d4',
      borderRadius: px(4), paddingVertical: px(9), paddingHorizontal: px(11),
    }}>
      <Text style={{ fontSize: px(9), color: ink(0.55), textTransform: 'uppercase', letterSpacing: px(9) * 0.06 }}>
        {noLig(label)}
      </Text>
      <Text style={{ fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: px(17), marginTop: px(3), color: INK }}>
        {noLig(value)}
      </Text>
      {sub ? <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(2) }}>{noLig(sub)}</Text> : null}
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginTop: px(16) }}>
      <Text style={s.sectionLabel}>{noLig(title)}</Text>
      {children}
    </View>
  );
}

// ── Tabel per customer ──────────────────────────────────────────────────────
// Seluruh baris kedua tabel ini produk yang SAMA, jadi satuan cukup sekali di
// header — bukan diulang di tiap sel.
const makeCuCols = (uom) => [
  { k: 'customer_name',     h: 'Customer',      w: '46%', a: 'left'  },
  { k: 'jml_sp',            h: 'Jml SP',        w: '10%', a: 'right' },
  { k: 'qty_outstanding',   h: uom ? `Sisa Qty (${uom})` : 'Sisa Qty', w: '16%', a: 'right' },
  { k: 'nilai_outstanding', h: 'Nilai Sisa',    w: '28%', a: 'right' },
];

// ── Tabel daftar SP — 11 kolom, sama persis dengan yang di layar ────────────
const makeSpCols = (uom) => [
  { k: 'sp_no',        h: 'No SP',     w: '9%',  a: 'left'  },
  { k: 'customer_name',h: 'Customer',  w: '17%', a: 'left'  },
  { k: 'dc_nama',      h: 'DC',        w: '12%', a: 'left'  },
  { k: 'sp_date',      h: 'Tgl SP',    w: '9%',  a: 'left'  },
  { k: 'expired_date', h: 'Tenggat',   w: '9%',  a: 'left'  },
  { k: 'status',       h: 'Status',    w: '12%', a: 'left'  },
  { k: 'qty',          h: uom ? `Qty (${uom})`   : 'Qty',   w: '6%', a: 'right' },
  { k: 'shipped_qty',  h: uom ? `Kirim (${uom})` : 'Kirim', w: '6%', a: 'right' },
  { k: 'sisa',         h: uom ? `Sisa (${uom})`  : 'Sisa',  w: '6%', a: 'right' },
  { k: 'nilai_sisa',   h: 'Nilai Sisa',w: '10%', a: 'right' },
  { k: 'umur_hari',    h: 'Umur',      w: '4%',  a: 'right' },
];

function cell(row, col) {
  const v = row[col.k];
  switch (col.k) {
    case 'sp_date':
    case 'expired_date':     return fmtDate(v);
    case 'nilai_sisa':
    case 'nilai_outstanding':return fmtIDR(v);
    case 'umur_hari':        return v == null ? '—' : `${fmtNum(v)}h`;
    case 'qty':
    case 'shipped_qty':
    case 'sisa':
    case 'jml_sp':
    case 'qty_outstanding':  return fmtNum(v);
    default:                 return v == null || v === '' ? '—' : String(v);
  }
}

function Table({ cols, rows, empty }) {
  if (!rows.length) {
    return (
      <View style={{ borderWidth: 1, borderColor: '#ded9d4', borderRadius: px(4), padding: px(14) }}>
        <Text style={{ fontSize: px(10), color: ink(0.45), textAlign: 'center' }}>{noLig(empty)}</Text>
      </View>
    );
  }
  return (
    <View>
      <View style={[s.thRow, { marginTop: px(4) }]}>
        {cols.map((c) => (
          <Text key={c.h} style={[s.th, { width: c.w, textAlign: c.a, fontSize: px(8) }]}>{noLig(c.h)}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={`${r.sp_no || r.customer_id || i}-${i}`} style={[s.tr, { paddingVertical: px(4) }]} wrap={false}>
          {cols.map((c) => (
            <Text key={c.h} style={{ width: c.w, textAlign: c.a, fontSize: px(9) }}>{noLig(cell(r, c))}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * @param {object}  report     hasil get_storbit_product_report ({summary, per_customer})
 * @param {Array}   spRows     hasil get_storbit_product_sp_list
 * @param {object}  outstanding hasil get_storbit_outstanding_summary
 * @param {object}  product    { code, product_name }
 * @param {object}  filters    { dateFrom, dateTo }
 * @param {boolean} truncated  daftar SP menyentuh limit -> dicetak sbg peringatan
 */
export default function StorbitReportPDF({
  report = {}, spRows = [], outstanding = {}, product = {}, filters = {}, truncated = false,
}) {
  const sum = report.summary || {};
  const perCust = report.per_customer || [];
  const defisit = Number(sum.defisit) || 0;
  const uom = sum.uom || '';
  const cuCols = makeCuCols(uom);
  const spCols = makeSpCols(uom);
  const periode = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom ? fmtDate(filters.dateFrom) : 'awal'} s/d ${filters.dateTo ? fmtDate(filters.dateTo) : 'sekarang'}`
    : 'Seluruh periode';

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={[s.page, { paddingHorizontal: px(44), paddingTop: px(20) }]}>
        <ReportChrome />

        {/* Header */}
        <View style={s.headRow}>
          <View style={s.headLeft}>
            <Image style={{ height: px(74), objectFit: 'contain', alignSelf: 'flex-start' }} src={LOGO_URL} />
          </View>
          <View style={s.headRight}>
            <Text style={s.docTitle}>Laporan Per Barang</Text>
            <Text style={s.docSubtitle}>Outstanding &amp; Stok Storbit</Text>
            <View style={s.metaStack}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.metaLabel}>Produk</Text>
                <Text style={s.metaValue}>{product.product_name || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.metaLabel}>Kode · Satuan</Text>
                <Text style={s.metaValue}>{product.code || '—'}{uom ? ` · ${uom}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.metaLabel}>Periode SP</Text>
                <Text style={s.metaValue}>{periode}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* Strip outstanding — angka seluruh entitas, bukan per produk. */}
        <Section title="Outstanding Storbit — seluruh entitas">
          <View style={{ flexDirection: 'row', gap: px(8), marginTop: px(4) }}>
            {/* Paling kiri: penyebut dari tiga angka lain. Dua kartu BRUTO
                (Nilai Total SP, Piutang), dua DPP (Kirim, Tagih). */}
            <Stat
              label="Nilai Total SP"
              value={fmtIDR(outstanding?.total_sp?.nilai)}
              sub={`${fmtNum(outstanding?.total_sp?.jml_sp)} SP · sudah termasuk PPN`}
            />
            <Stat
              label="Outstanding Kirim"
              value={fmtIDR(outstanding?.kirim?.nilai)}
              sub={`${fmtNum(outstanding?.kirim?.jml_sp)} SP · belum termasuk PPN`}
            />
            <Stat
              label="Outstanding Tagih"
              value={fmtIDR(outstanding?.tagih?.nilai)}
              sub={`${fmtNum(outstanding?.tagih?.jml_sp)} SP · belum termasuk PPN`}
            />
            <Stat
              label="Outstanding Piutang"
              value={fmtIDR(outstanding?.piutang?.nilai)}
              sub={`${fmtNum(outstanding?.piutang?.jml_invoice)} invoice · sudah termasuk PPN`}
            />
          </View>
        </Section>

        {/* Ringkasan produk */}
        <Section title="Ringkasan Produk">
          <View style={{ flexDirection: 'row', gap: px(8), marginTop: px(4) }}>
            <Stat
              label="Total Dipesan"
              value={fmtQtyU(sum.qty_ordered, uom)}
              sub={`dari ${fmtNum(sum.jml_sp)} SP · ${fmtNum(sum.jml_customer)} customer`}
            />
            <Stat label="Terkirim"      value={fmtQtyU(sum.qty_shipped, uom)}      sub="sudah dikirim ke customer" />
            <Stat label="Belum Dikirim" value={fmtQtyU(sum.qty_outstanding, uom)}  sub="sisa yang masih harus dikirim" />
            <Stat label="Nilai Belum Dikirim" value={fmtIDR(sum.nilai_outstanding)} sub="belum termasuk PPN" />
            <Stat
              label="Stok Tersedia"
              value={fmtQtyU(sum.stok_tersedia, uom)}
              sub={defisit > 0 ? `defisit ${fmtQtyU(defisit, uom)}` : 'cukup untuk menutup sisa kirim'}
              warn={defisit > 0}
            />
          </View>
          <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(5) }}>
            {noLig('Stok adalah angka saat laporan dibuat dan tidak mengikuti filter periode.')}
          </Text>
        </Section>

        {/* Per customer */}
        <Section title="Rincian Per Customer">
          <Table cols={cuCols} rows={perCust} empty="Tidak ada customer untuk produk ini." />
        </Section>

        {/* Daftar SP */}
        <Section title={`Daftar SP (${fmtNum(spRows.length)} baris)`}>
          {truncated ? (
            <Text style={{ fontSize: px(9), color: PURPLE, marginBottom: px(4) }}>
              {noLig('PERINGATAN: daftar menyentuh batas baris — isi di bawah TIDAK LENGKAP. Persempit filter periode.')}
            </Text>
          ) : null}
          <Table cols={spCols} rows={spRows} empty="Tidak ada SP untuk produk ini pada periode terpilih." />
        </Section>

        {/* Kaki */}
        <Text
          style={{ position: 'absolute', bottom: px(18), left: px(44), fontSize: px(8), color: ink(0.45) }}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Nexus by MSI · Dashboard Storbit · dicetak ${fmtDate(new Date().toISOString())} · hal. ${pageNumber}/${totalPages}`}
        />
      </Page>
    </Document>
  );
}
