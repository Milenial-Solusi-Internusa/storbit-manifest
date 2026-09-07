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
// ⚠️ null DISENGAJA untuk tiga kategori rekap (basisnya belum ditetapkan —
// migrasi 20260907000003). Harus tercetak '—', bukan 'Rp 0'.
const fmtIDRn = (n) => (n === null || n === undefined ? '—' : fmtIDR(n));
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

// Nama produk ikut ke judul section dan ke kaki halaman. Dipotong di 56
// karakter supaya keduanya DIJAMIN tetap satu baris bahkan untuk nama
// selebar "WWWW…" — diukur pada Lora: judul px(11) muat 61 karakter kasus
// terburuk, kaki px(8) muat 80. Memotong, BUKAN mengecilkan font atau
// mengubah lebar kolom. Nama nyata (~18-45 karakter) tak pernah kena.
const NAME_MAX = 56;
function clipName(value) {
  const t = String(value ?? '').trim();
  return t.length > NAME_MAX ? `${t.slice(0, NAME_MAX - 1).trimEnd()}…` : t;
}

// Ornamen sudut versi landscape — bentuk & fillOpacity identik PageChrome.
// `fixed`: tampil di SETIAP halaman. Tabrakannya dengan tabel TIDAK diselesaikan
// dengan menyembunyikan ornamen di halaman lanjutan (itu meninggalkan halaman
// polos putih), melainkan dengan memperbesar padding halaman sehingga area
// konten berhenti sebelum ornamen dimulai — lihat catatan di <Page>.
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

// Tabel generik bagian baru. Lebar kolom dibagi rata kecuali kolom pertama
// (label kategori) yang dapat porsi lebih besar; kolom 'num'/'rp' rata kanan.
function BlockTable({ block }) {
  const n = block.columns.length;
  const first = n <= 2 ? 60 : 34;
  const rest = (100 - first) / (n - 1);
  const w = (i) => `${i === 0 ? first : rest}%`;
  const align = (i) => (block.fmt?.[i] === 'num' || block.fmt?.[i] === 'rp' ? 'right' : 'left');
  // Jarak antar kolom. Kolom terakhir tak perlu — tak ada tetangga di kanannya.
  const gap = (i) => (i === n - 1 ? 0 : px(10));
  const cell = (v, i) => {
    if (v === null || v === undefined) return '—';
    if (block.fmt?.[i] === 'rp')  return fmtIDR(v);
    if (block.fmt?.[i] === 'num') return fmtNum(v);
    return String(v);
  };
  return (
    <View>
      {block.subtitle ? (
        <Text style={{ fontSize: px(10), color: ink(0.55), marginTop: px(6), marginBottom: px(2) }}>
          {noLig(block.subtitle)}
        </Text>
      ) : null}
      <View style={[s.thRow, { marginTop: px(4) }]}>
        {block.columns.map((h, i) => (
          <Text key={h} style={[s.th, { width: w(i), textAlign: align(i), fontSize: px(8), paddingRight: gap(i) }]}>{noLig(h)}</Text>
        ))}
      </View>
      {block.rows.map((row, ri) => (
        <View key={ri} style={[s.tr, { paddingVertical: px(4) }]} wrap={false}>
          {row.map((v, i) => (
            <Text key={i} style={{ width: w(i), textAlign: align(i), fontSize: px(9), paddingRight: gap(i) }}>{noLig(cell(v, i))}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Bagian "Nilai SP & Outstanding" ────────────────────────────────────────
// Strip empat kartu, isi & label PERSIS seperti sebelumnya.
function OutstandingSection({ outstanding = {} }) {
  return (
    <Section title="Nilai SP & Outstanding">
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
  );
}

// ── Bagian "Laporan Per Barang" ────────────────────────────────────────────
// Tiga Section, judul/catatan/label PERSIS seperti sebelumnya — dipindah utuh
// ke komponen sendiri supaya bagian ini bisa dipilih atau dilewati tanpa
// menyentuh isinya.
function ReportSections({ report = {}, spRows = [], product = {}, truncated = false }) {
  const sum = report.summary || {};
  const perCust = report.per_customer || [];
  const defisit = Number(sum.defisit) || 0;
  const uom = sum.uom || '';
  const prodName = clipName(product.product_name);
  const cuCols = makeCuCols(uom);
  const spCols = makeSpCols(uom);
  return (
    <>
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

      <Section title={prodName ? `Rincian Per Customer untuk ${prodName}` : 'Rincian Per Customer'}>
        <Table cols={cuCols} rows={perCust} empty="Tidak ada customer untuk produk ini." />
      </Section>

      <Section title={prodName
        ? `Daftar SP yang memuat ${prodName} (${fmtNum(spRows.length)} baris)`
        : `Daftar SP (${fmtNum(spRows.length)} baris)`}>
        {truncated ? (
          <Text style={{ fontSize: px(9), color: PURPLE, marginBottom: px(4) }}>
            {noLig('PERINGATAN: daftar menyentuh batas baris — isi di bawah TIDAK LENGKAP. Persempit filter periode.')}
          </Text>
        ) : null}
        <Table cols={spCols} rows={spRows} empty="Tidak ada SP untuk produk ini pada periode terpilih." />
        <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(5) }}>
          {noLig('Angka di tabel ini hanya porsi produk tsb, bukan nilai SP secara utuh. Nilai SP utuh (seluruh produk, sudah termasuk PPN) ada di Detail SP.')}
        </Text>
      </Section>
    </>
  );
}

// ── Rekap per Customer — section BERLAPIS ──────────────────────────────────
// customer (tebal) > SP > produk (indent, kecil). Memakai s.thRow/s.tr yang
// sudah ada supaya sewarna dengan tabel lain, tapi barisnya tak seragam
// sehingga tak bisa lewat BlockTable.
function RekapSection({ sec }) {
  const W = ['14%', '22%', '11%', '11%', '22%', '20%'];
  const head = ['No SP', 'DC', 'Tgl SP', 'Tenggat', 'Status', 'Nilai (DPP)'];
  return (
    <Section title={sec.title}>
      {sec.truncated ? (
        <Text style={{ fontSize: px(9), color: PURPLE, marginBottom: px(4) }}>
          {noLig('PERINGATAN: daftar menyentuh batas baris — isi di bawah TIDAK LENGKAP. Persempit filter.')}
        </Text>
      ) : null}
      <View style={[s.thRow, { marginTop: px(4) }]}>
        {head.map((h, i) => (
          <Text key={h} style={[s.th, { width: W[i], textAlign: i === 5 ? 'right' : 'left', fontSize: px(8) }]}>{noLig(h)}</Text>
        ))}
      </View>
      {sec.groups.map((g, gi) => (
        <View key={gi}>
          <View style={[s.tr, { paddingVertical: px(4), backgroundColor: '#efecf6' }]} wrap={false}>
            <Text style={{ width: '80%', fontSize: px(9.5), fontWeight: 600 }}>
              {noLig(`${g.customer_name} · ${g.jml_sp} SP`)}
            </Text>
            <Text style={{ width: '20%', textAlign: 'right', fontSize: px(9.5), fontWeight: 600 }}>
              {noLig(fmtIDRn(g.nilai))}
            </Text>
          </View>
          {g.sps.map((sp, si) => (
            <View key={si}>
              <View style={[s.tr, { paddingVertical: px(3) }]} wrap={false}>
                <Text style={{ width: W[0], fontSize: px(9) }}>{noLig(sp.sp_no)}</Text>
                <Text style={{ width: W[1], fontSize: px(9) }}>{noLig(sp.dc_nama)}</Text>
                <Text style={{ width: W[2], fontSize: px(9) }}>{noLig(fmtDate(sp.sp_date))}</Text>
                <Text style={{ width: W[3], fontSize: px(9) }}>{noLig(fmtDate(sp.expired_date))}</Text>
                <Text style={{ width: W[4], fontSize: px(9) }}>{noLig(sp.status)}</Text>
                <Text style={{ width: W[5], fontSize: px(9), textAlign: 'right' }}>{noLig(fmtIDRn(sp.nilai))}</Text>
              </View>
              <Text style={{ fontSize: px(8), color: ink(0.45), paddingLeft: px(14), paddingBottom: px(3) }}>
                {noLig(sp.produk)}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <View style={[s.tr, { paddingVertical: px(5) }]} wrap={false}>
        <Text style={{ width: '80%', fontSize: px(10), fontWeight: 600 }}>{noLig('TOTAL')}</Text>
        <Text style={{ width: '20%', textAlign: 'right', fontSize: px(10), fontWeight: 600 }}>
          {noLig(fmtIDRn(sec.total))}
        </Text>
      </View>
      {sec.note ? (
        <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(5) }}>{noLig(sec.note)}</Text>
      ) : null}
    </Section>
  );
}

/**
 * @param {object} meta     blok konteks: dicetak, entitas, filter, isi laporan
 * @param {Array}  sections bagian terpilih, URUT. Entri 'outstanding' dan
 *                          'report' punya renderer khusus (bentuknya sengaja
 *                          dipertahankan); sisanya generik lewat BlockTable.
 */
export default function StorbitReportPDF({ meta = {}, sections = [] }) {
  const reportSec = sections.find((x) => x.key === 'report');
  const prodName = clipName(meta.product?.product_name);
  return (
    <Document>
      {/* PADDING DIHITUNG DARI JANGKAUAN ORNAMEN, bukan ditebak.
          Kanvas landscape 792x612. ReportChrome `fixed` di setiap halaman:
            · pita atas + sudut kanan-atas turun sampai topH = px(96) = 72pt
            · pita bawah + sudut kiri-bawah naik sampai botH = px(84) = 63pt
          Area konten karenanya harus berhenti di luar kedua pita itu, kalau
          tidak baris tabel halaman 2 ke atas akan tertimpa ornamen (halaman 1
          aman hanya karena yang berada di sana header, bukan tabel).
            paddingTop    px(104) = 78pt  -> 6pt di bawah pita atas
            paddingBottom px(92)  = 69pt  -> 6pt di atas pita bawah
          paddingBottom juga sekalian melampaui puncak kaki halaman (21,18pt =
          bottom px(18) + tinggi baris 7,68), jadi perbaikan jarak footer tetap
          terpenuhi dengan selisih jauh lebih longgar.
          Konsekuensi yang disengaja: header halaman 1 ikut turun, dan jumlah
          halaman bisa bertambah. Ruang aman didahulukan. */}
      <Page
        size="LETTER"
        orientation="landscape"
        style={[s.page, { paddingHorizontal: px(44), paddingTop: px(104), paddingBottom: px(92) }]}
      >
        <ReportChrome />

        {/* Header */}
        <View style={s.headRow}>
          <View style={s.headLeft}>
            <Image style={{ height: px(74), objectFit: 'contain', alignSelf: 'flex-start' }} src={LOGO_URL} />
          </View>
          <View style={s.headRight}>
            <Text style={s.docTitle}>Laporan Dashboard Storbit</Text>
            <Text style={s.docSubtitle}>Outstanding &amp; Stok Storbit</Text>
            <View style={s.metaStack}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.metaLabel}>Dicetak · Entitas</Text>
                <Text style={s.metaValue}>{fmtDate(meta.printedAt)} · {meta.entity || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.metaLabel}>Customer · Tipe SP</Text>
                <Text style={s.metaValue}>{noLig(`${meta.filterCustomer || '—'} · ${meta.filterSpType || '—'}`)}</Text>
              </View>
              {/* Cakupan per-bagian, hanya dicetak kalau bagiannya ikut.
                  Nilainya dari pilihan panel, bukan filter layar. */}
              {meta.spStatus || meta.rekapStatus || meta.stockCategory ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.metaLabel}>Status · Kategori stok</Text>
                  <Text style={s.metaValue}>
                    {noLig([
                      meta.spStatus     ? `Daftar SP: ${meta.spStatus}` : null,
                      meta.rekapStatus  ? `Rekap: ${meta.rekapStatus}`  : null,
                      meta.stockCategory,
                    ].filter(Boolean).join(' · '))}
                  </Text>
                </View>
              ) : null}
              {/* Produk & periode hanya relevan kalau Laporan Per Barang ikut. */}
              {meta.product ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.metaLabel}>Produk · Periode SP</Text>
                  <Text style={s.metaValue}>{noLig(`${meta.product.product_name || '—'} · ${meta.periode || '—'}`)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* Isi laporan — penerima harus tahu apa yang TIDAK ada di file ini. */}
        <Section title="Isi Laporan Ini">
          <Text style={{ fontSize: px(9), color: ink(0.55) }}>
            {noLig((meta.sections || []).map((x, i) => `${i + 1}. ${x}`).join('   ·   '))}
          </Text>
          {meta.truncatedNotes?.length ? (
            <Text style={{ fontSize: px(9), color: PURPLE, marginTop: px(4) }}>
              {noLig(`PERINGATAN — menyentuh batas baris, isi tidak lengkap: ${meta.truncatedNotes.join(', ')}.`)}
            </Text>
          ) : null}
          <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(4) }}>
            {noLig('Nilai rupiah kartu status: DPP, belum termasuk PPN. Jangan menjumlahkan angka lintas basis pajak.')}
          </Text>
        </Section>

        {sections.map((sec) => {
          if (sec.key === 'outstanding') {
            return <OutstandingSection key={sec.key} outstanding={sec.raw} />;
          }
          if (sec.key === 'rekap') {
            return sec.groups.length ? <RekapSection key={sec.key} sec={sec} /> : null;
          }
          if (sec.key === 'report') {
            return (
              <ReportSections
                key={sec.key}
                report={sec.report}
                spRows={sec.spRows}
                product={sec.product}
                truncated={sec.truncated}
              />
            );
          }
          // Bagian nol baris dilewati — jangan cetak section kosong.
          if (!sec.blocks?.some((b) => b.rows.length)) return null;
          return (
            <Section key={sec.key} title={sec.title}>
              {sec.truncated ? (
                <Text style={{ fontSize: px(9), color: PURPLE, marginBottom: px(4) }}>
                  {noLig('PERINGATAN: daftar menyentuh batas baris — isi di bawah TIDAK LENGKAP. Persempit filter.')}
                </Text>
              ) : null}
              {sec.blocks.map((b, i) => <BlockTable key={i} block={b} />)}
              {sec.note ? (
                <Text style={{ fontSize: px(8.5), color: ink(0.45), marginTop: px(5) }}>{noLig(sec.note)}</Text>
              ) : null}
            </Section>
          );
        })}

        {/* Kaki */}
        <Text
          style={{ position: 'absolute', bottom: px(18), left: px(44), fontSize: px(8), color: ink(0.45) }}
          fixed
          render={({ pageNumber, totalPages }) => noLig(
            `Nexus by MSI · Dashboard Storbit${reportSec && prodName ? ` · ${prodName}` : ''}`
            + ` · dicetak ${fmtDate(new Date().toISOString())} · hal. ${pageNumber}/${totalPages}`)}
        />
      </Page>
    </Document>
  );
}
