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
        {label}
      </Text>
      <Text style={{ fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: px(17), marginTop: px(3), color: INK }}>
        {value}
      </Text>
      {sub ? <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(2) }}>{sub}</Text> : null}
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginTop: px(16) }}>
      <Text style={s.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

// ── Tabel per customer ──────────────────────────────────────────────────────
const cuCols = [
  { k: 'customer_name',     h: 'Customer',      w: '46%', a: 'left'  },
  { k: 'jml_sp',            h: 'Jml SP',        w: '10%', a: 'right' },
  { k: 'qty_outstanding',   h: 'Sisa Qty',      w: '16%', a: 'right' },
  { k: 'nilai_outstanding', h: 'Nilai Sisa',    w: '28%', a: 'right' },
];

// ── Tabel daftar SP — 11 kolom, sama persis dengan yang di layar ────────────
const spCols = [
  { k: 'sp_no',        h: 'No SP',     w: '9%',  a: 'left'  },
  { k: 'customer_name',h: 'Customer',  w: '17%', a: 'left'  },
  { k: 'dc_nama',      h: 'DC',        w: '12%', a: 'left'  },
  { k: 'sp_date',      h: 'Tgl SP',    w: '9%',  a: 'left'  },
  { k: 'expired_date', h: 'Tenggat',   w: '9%',  a: 'left'  },
  { k: 'status',       h: 'Status',    w: '12%', a: 'left'  },
  { k: 'qty',          h: 'Qty',       w: '6%',  a: 'right' },
  { k: 'shipped_qty',  h: 'Kirim',     w: '6%',  a: 'right' },
  { k: 'sisa',         h: 'Sisa',      w: '6%',  a: 'right' },
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
        <Text style={{ fontSize: px(10), color: ink(0.45), textAlign: 'center' }}>{empty}</Text>
      </View>
    );
  }
  return (
    <View>
      <View style={[s.thRow, { marginTop: px(4) }]}>
        {cols.map((c) => (
          <Text key={c.h} style={[s.th, { width: c.w, textAlign: c.a, fontSize: px(8) }]}>{c.h}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={`${r.sp_no || r.customer_id || i}-${i}`} style={[s.tr, { paddingVertical: px(4) }]} wrap={false}>
          {cols.map((c) => (
            <Text key={c.h} style={{ width: c.w, textAlign: c.a, fontSize: px(9) }}>{cell(r, c)}</Text>
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
                <Text style={s.metaLabel}>Kode</Text>
                <Text style={s.metaValue}>{product.code || '—'}</Text>
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
            <Stat label="Total Dipesan"      value={fmtNum(sum.qty_ordered)} />
            <Stat label="Terkirim"           value={fmtNum(sum.qty_shipped)} />
            <Stat label="Belum Dikirim"      value={fmtNum(sum.qty_outstanding)} />
            <Stat label="Nilai Belum Dikirim" value={fmtIDR(sum.nilai_outstanding)} sub="belum termasuk PPN" />
            <Stat
              label="Stok Tersedia"
              value={fmtNum(sum.stok_tersedia)}
              sub={defisit > 0 ? `Defisit ${fmtNum(defisit)}` : 'Stok mencukupi'}
              warn={defisit > 0}
            />
          </View>
          <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(5) }}>
            {fmtNum(sum.jml_sp)} SP · {fmtNum(sum.jml_customer)} customer. Stok adalah angka saat laporan dibuat
            dan tidak mengikuti filter periode.
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
              PERINGATAN: daftar menyentuh batas baris — isi di bawah TIDAK LENGKAP. Persempit filter periode.
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
