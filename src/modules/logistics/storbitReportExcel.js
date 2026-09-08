// src/modules/logistics/storbitReportExcel.js
// Perakit workbook .xlsx untuk Laporan Per Barang (Dashboard Storbit).
//
// exceljs DIIMPOR DINAMIS (`await import('exceljs')`) — bukan import statis.
// Paketnya ~950 KB dan halaman ini dipakai jauh lebih sering untuk dilihat
// daripada diekspor, jadi biayanya baru dibayar saat tombol Excel ditekan.
// Ini mengikuti aturan code-splitting Fase 0.4B (lazy-load modul besar).
//
// Isi workbook = cerminan section laporan di layar, mengikuti filter yang
// sedang aktif. Angka ditulis sebagai NUMBER (bukan string terformat) supaya
// bisa dijumlah ulang di Excel; format tampilannya diserahkan ke numFmt.
//
// ⚠️ BASIS PAJAK BEDA — jangan dijumlahkan begitu saja di spreadsheet:
// "Kirim" dan "Tagih" adalah DPP (belum PPN), "Piutang" bruto (sudah PPN).
// Keterangan itu ikut dicetak di sheet Ringkasan supaya tak hilang konteks
// begitu file berpindah tangan.

const PURPLE_ARGB = 'FF5B3FA0';
const RP  = '"Rp"#,##0';
const NUM = '#,##0';

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_ARGB } };
    cell.alignment = { vertical: 'middle' };
  });
  row.height = 18;
}

function titleRow(ws, text, span) {
  const r = ws.addRow([text]);
  r.font = { bold: true, size: 12, color: { argb: PURPLE_ARGB } };
  // span = jumlah kolom tabel di bawahnya; judul di-merge selebar itu supaya
  // tak terpotong sel tetangga. Tanpa span, perilaku lama (sheet Ringkasan).
  if (span > 1) ws.mergeCells(r.number, 1, r.number, span);
  return r;
}

function autoWidth(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// Lebar kolom sheet generik — cukup untuk label kategori + keterangan.
const GENERIC_WIDTHS = [34, 16, 20, 46];

// Sheet "Info": konteks file. SELALU dibuat, tak peduli bagian apa yang
// dicentang, dan TIDAK ikut aturan "lewati kalau nol baris" — ia bukan bagian.
// Penerima membuka sheet mana saja langsung, bukan berurutan, jadi konteksnya
// harus punya satu tempat tetap yang tak bergeser saat komposisi centang
// berubah. Daftar "Bagian dalam file ini" ada di sini supaya penerima tahu apa
// yang TIDAK ada — persis kekurangan yang bikin angka layar dikira tak sinkron.
function infoSheet(wb, meta) {
  const ws = wb.addWorksheet('Info');
  autoWidth(ws, [30, 62]);
  titleRow(ws, 'Dashboard Storbit — Export', 2);
  ws.addRow([]);
  ws.addRow(['Dicetak', new Date(meta.printedAt).toLocaleString('id-ID')]);
  ws.addRow(['Entitas', meta.entity]);
  // ⚠️ Seluruh baris cakupan ini mencerminkan pilihan DI PANEL EXPORT, bukan
  // filter yang sedang aktif di layar pengekspor. Penerima file tak punya cara
  // tahu keadaan layar orang lain, jadi yang tercetak harus benar-benar cakupan
  // yang dipakai merakit angka di file ini.
  ws.addRow(['Filter Customer', meta.filterCustomer]);
  ws.addRow(['Filter Tipe SP', meta.filterSpType]);
  if (meta.spStatus)      ws.addRow(['Status SP', meta.spStatus]);
  if (meta.rekapStatus)   ws.addRow(['Status Rekap per Customer', meta.rekapStatus]);
  if (meta.stockCategory) ws.addRow(['Kategori stok', meta.stockCategory]);
  if (meta.product) {
    ws.addRow(['Produk', `${meta.product.product_name || '—'}${meta.product.code ? ` (${meta.product.code})` : ''}`]);
    ws.addRow(['Periode SP', meta.periode || 'Seluruh periode']);
  }
  ws.addRow([]);
  titleRow(ws, 'Bagian dalam file ini', 2);
  meta.sections.forEach((label, i) => { ws.addRow([`${i + 1}.`, label]); });
  if (meta.truncatedNotes?.length) {
    ws.addRow([]);
    const w = titleRow(ws, 'PERINGATAN — isi tidak lengkap', 2);
    w.font = { bold: true, size: 12, color: { argb: PURPLE_ARGB } };
    meta.truncatedNotes.forEach((t) => {
      ws.addRow(['', `${t} menyentuh batas baris — persempit filter untuk hasil lengkap.`]);
    });
  }
  ws.addRow([]);
  ws.addRow(['', 'Nilai rupiah kartu status: DPP, belum termasuk PPN.']);
  ws.addRow(['', 'Jangan menjumlahkan angka lintas basis pajak.']);
}

// Sheet generik satu-bagian: judul, catatan opsional, lalu tiap blok
// (sub-judul + header + baris). `fmt` menentukan numFmt per kolom.
function sectionSheet(wb, sec) {
  const ws = wb.addWorksheet(sec.sheet);
  const widest = Math.max(...sec.blocks.map((b) => b.columns.length));
  autoWidth(ws, GENERIC_WIDTHS.slice(0, widest));
  titleRow(ws, sec.title, widest);
  if (sec.truncated) {
    const w = ws.addRow(['PERINGATAN: menyentuh batas baris — isi TIDAK LENGKAP. Persempit filter.']);
    w.font = { bold: true, color: { argb: PURPLE_ARGB } };
  }
  ws.addRow([]);
  sec.blocks.forEach((b, bi) => {
    if (bi > 0) ws.addRow([]);
    if (b.subtitle) {
      const r = ws.addRow([b.subtitle]);
      r.font = { bold: true, size: 11 };
    }
    styleHeader(ws.addRow(b.columns));
    b.rows.forEach((row) => {
      const r = ws.addRow(row.map((v) => (v === null ? '—' : v)));
      b.fmt.forEach((f, i) => {
        if (f === 'num' && typeof row[i] === 'number') r.getCell(i + 1).numFmt = NUM;
        if (f === 'rp'  && typeof row[i] === 'number') r.getCell(i + 1).numFmt = RP;
      });
    });
  });
  if (sec.note) { ws.addRow([]); ws.addRow([sec.note]); }
}

// ── Rekap per Customer — sheet BERLAPIS ─────────────────────────────────────
// Tiga tingkat baris: customer (tebal, latar tipis) > SP > daftar produk
// (indent, teks kecil). Sengaja BUKAN lewat sectionSheet(): renderer generik
// itu meratakan semuanya jadi satu tabel dan hierarkinya hilang.
//
// ⚠️ Nilai bisa null dan itu DISENGAJA (kategori terkirim_penuh /
// pernah_risiko_pinalti / cancelled belum punya basis — migrasi
// 20260907000003). Sel null ditulis '—', BUKAN 0, dan numFmt Rupiah hanya
// dipasang pada sel yang benar-benar angka supaya sel '—' tak berubah jadi
// "Rp 0" di layar Excel.
const REKAP_WIDTHS = [16, 26, 12, 12, 24, 20];

function rekapSheet(wb, sec) {
  const ws = wb.addWorksheet(sec.sheet);
  autoWidth(ws, REKAP_WIDTHS);
  titleRow(ws, sec.title, 6);
  if (sec.truncated) {
    const w = ws.addRow(['PERINGATAN: menyentuh batas baris — isi TIDAK LENGKAP. Persempit filter.']);
    w.font = { bold: true, color: { argb: PURPLE_ARGB } };
  }
  ws.addRow([]);
  styleHeader(ws.addRow(['No SP', 'DC', 'Tgl SP', 'Tenggat', 'Status', 'Nilai (DPP)']));

  const money = (row, cell, v) => {
    if (typeof v === 'number') row.getCell(cell).numFmt = RP;
  };

  sec.groups.forEach((g) => {
    const gr = ws.addRow([`${g.customer_name} · ${g.jml_sp} SP`, '', '', '', '', g.nilai === null ? '—' : g.nilai]);
    gr.font = { bold: true };
    gr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFECF6' } };
    ws.mergeCells(gr.number, 1, gr.number, 5);
    money(gr, 6, g.nilai);

    g.sps.forEach((sp) => {
      const r = ws.addRow([
        sp.sp_no, sp.dc_nama, sp.sp_date, sp.expired_date, sp.status,
        sp.nilai === null ? '—' : sp.nilai,
      ]);
      money(r, 6, sp.nilai);
      const pr = ws.addRow(['', sp.produk]);
      pr.font = { size: 9, italic: true, color: { argb: 'FF7A7A78' } };
      ws.mergeCells(pr.number, 2, pr.number, 6);
    });
  });

  const tr = ws.addRow(['TOTAL', '', '', '', '', sec.total === null ? '—' : sec.total]);
  tr.font = { bold: true };
  ws.mergeCells(tr.number, 1, tr.number, 5);
  money(tr, 6, sec.total);

  if (sec.note) { ws.addRow([]); ws.addRow([sec.note]); }
  ws.views = [{ state: 'frozen', ySplit: sec.truncated ? 4 : 3 }];
}

/**
 * Rakit workbook export dan kembalikan Blob siap-unduh.
 *
 * @param {object} meta     blok konteks file (sheet "Info")
 * @param {Array}  sections bagian terpilih, URUT; entri ber-key 'report'
 *                          dirender oleh reportSheets() dgn bentuk 3 sheet
 *                          yang sudah ada — sengaja TIDAK digabung jadi satu.
 * @returns {Promise<Blob>}
 */
export async function buildStorbitReportWorkbook({ meta, sections = [] }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nexus by MSI';
  wb.created = new Date();

  infoSheet(wb, meta);
  sections.forEach((sec) => {
    if (sec.key === 'report') { reportSheets(wb, sec); return; }
    if (sec.key === 'rekap')  { if (sec.groups.length) rekapSheet(wb, sec); return; }
    // Bagian nol baris dilewati — jangan hasilkan sheet kosong.
    if (!sec.blocks.some((b) => b.rows.length)) return;
    sectionSheet(wb, sec);
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── Laporan Per Barang — TIGA sheet, bentuknya sengaja dipertahankan ────────
// Ringkasan / Per Customer / Daftar SP punya kolom yang sama sekali berbeda;
// menumpuknya dalam satu grid mematikan sort & filter per tabel di Excel, yang
// justru cara file ini dipakai. Aturan "satu sheet per bagian" berlaku untuk
// enam bagian lain — ini pengecualian yang disengaja.
function reportSheets(wb, { report = {}, spRows = [], product = {}, filters = {}, truncated = false, outstanding = null }) {
  const sum = report.summary || {};
  const perCust = report.per_customer || [];
  const uom = sum.uom || '';
  // Satuan ikut ke JUDUL kolom, bukan ke tiap sel: sel harus tetap NUMBER
  // supaya bisa dijumlah ulang di Excel. Menempelkan "PCS" ke nilainya akan
  // mengubahnya jadi teks dan mematikan SUM.
  const qtyHdr = (label) => (uom ? `${label} (${uom})` : label);
  // Judul kedua sheet tabel: pembaca yang lompat langsung ke sheet ini tak
  // pernah melihat sheet Ringkasan, jadi produk yang sedang difilter harus
  // ikut tercetak di sini. Tanpa ini angkanya terbaca sebagai nilai SP utuh.
  const prodLabel = `${product.product_name || '—'}${product.code ? ` (${product.code})` : ''}`;
  const periode = filters.dateFrom || filters.dateTo
    ? `${filters.dateFrom || 'awal'} s/d ${filters.dateTo || 'sekarang'}`
    : 'Seluruh periode';

  // ── Sheet 1: Ringkasan ────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Ringkasan');
  autoWidth(ws1, [34, 22, 22, 28]);

  titleRow(ws1, 'Laporan Per Barang — Dashboard Storbit');
  ws1.addRow(['Produk', product.product_name || '—']);
  ws1.addRow(['Kode', product.code || '—']);
  ws1.addRow(['Satuan', uom || '—']);
  ws1.addRow(['Periode SP', periode]);
  ws1.addRow(['Dibuat', new Date().toLocaleString('id-ID')]);
  ws1.addRow([]);

  // Blok Outstanding hanya dicetak di sini kalau bagian "Nilai SP & Outstanding"
  // TIDAK ikut sebagai sheet tersendiri. Keduanya default ON, jadi tanpa
  // penjagaan ini empat angka yang sama muncul dua kali dalam satu file —
  // persis jenis kebingungan "angka mana yang benar" yang sedang ditutup.
  // Kalau Laporan Per Barang diekspor SENDIRIAN, sheet ini tetap identik
  // dengan export lama.
  if (outstanding) {
    titleRow(ws1, 'Outstanding Storbit — seluruh entitas');
    styleHeader(ws1.addRow(['Metrik', 'Jumlah', 'Nilai', 'Basis pajak']));
    // Nilai Total SP paling atas: ia penyebut dari tiga angka di bawahnya.
    const oTotal = ws1.addRow(['Nilai Total SP',      Number(outstanding?.total_sp?.jml_sp) || 0,     Number(outstanding?.total_sp?.nilai) || 0,   'BRUTO — sudah termasuk PPN']);
    const oKirim = ws1.addRow(['Outstanding Kirim',   Number(outstanding?.kirim?.jml_sp) || 0,        Number(outstanding?.kirim?.nilai) || 0,      'DPP — belum termasuk PPN']);
    const oTagih = ws1.addRow(['Outstanding Tagih',   Number(outstanding?.tagih?.jml_sp) || 0,        Number(outstanding?.tagih?.nilai) || 0,      'DPP — belum termasuk PPN']);
    const oPiut  = ws1.addRow(['Outstanding Piutang', Number(outstanding?.piutang?.jml_invoice) || 0, Number(outstanding?.piutang?.nilai) || 0,    'BRUTO — sudah termasuk PPN']);
    [oTotal, oKirim, oTagih, oPiut].forEach((r) => {
      r.getCell(2).numFmt = NUM;
      r.getCell(3).numFmt = RP;
    });
    ws1.addRow(['DUA BRUTO (Nilai Total SP, Piutang) dan DUA DPP (Kirim, Tagih).']);
    ws1.addRow(['Beda basis pajak — jangan dijumlahkan lintas basis.']);
    ws1.addRow([]);
  }

  titleRow(ws1, 'Ringkasan Produk');
  styleHeader(ws1.addRow(['Metrik', 'Nilai', 'Satuan']));
  const rOrd  = ws1.addRow(['Total Dipesan',       Number(sum.qty_ordered) || 0,       uom || '—']);
  const rShp  = ws1.addRow(['Terkirim',            Number(sum.qty_shipped) || 0,       uom || '—']);
  const rOut  = ws1.addRow(['Belum Dikirim',       Number(sum.qty_outstanding) || 0,   uom || '—']);
  const rVal  = ws1.addRow(['Nilai Belum Dikirim', Number(sum.nilai_outstanding) || 0, 'Rp · DPP']);
  const rStk  = ws1.addRow(['Stok Tersedia',       Number(sum.stok_tersedia) || 0,     uom || '—']);
  const rDef  = ws1.addRow(['Defisit',             Number(sum.defisit) || 0,           uom || '—']);
  const rNtsp = ws1.addRow(['Nilai Total SP',      Number(sum.nilai_total_sp) || 0,    'Rp · BRUTO']);
  const rSp   = ws1.addRow(['Jumlah SP',           Number(sum.jml_sp) || 0,            'SP']);
  const rCust = ws1.addRow(['Jumlah Customer',     Number(sum.jml_customer) || 0,      'customer']);
  rNtsp.getCell(2).numFmt = RP;
  [rOrd, rShp, rOut, rStk, rDef, rSp, rCust].forEach((r) => { r.getCell(2).numFmt = NUM; });
  rVal.getCell(2).numFmt = RP;
  if ((Number(sum.defisit) || 0) > 0) {
    rDef.getCell(2).font = { bold: true, color: { argb: PURPLE_ARGB } };
  }
  ws1.addRow(['Stok adalah angka saat laporan dibuat — tidak mengikuti filter periode.']);

  // ── Sheet 2: Per Customer ─────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Per Customer');
  autoWidth(ws2, [40, 10, 22, 20]);
  titleRow(ws2, `Per Customer untuk: ${prodLabel}`, 4);
  ws2.addRow([]);
  styleHeader(ws2.addRow(['Customer', 'Jml SP', qtyHdr('Sisa Qty Produk Ini'), 'Nilai Sisa (DPP)']));
  perCust.forEach((c) => {
    const r = ws2.addRow([
      c.customer_name || '—',
      Number(c.jml_sp) || 0,
      Number(c.qty_outstanding) || 0,
      Number(c.nilai_outstanding) || 0,
    ]);
    r.getCell(2).numFmt = NUM;
    r.getCell(3).numFmt = NUM;
    r.getCell(4).numFmt = RP;
  });
  ws2.views = [{ state: 'frozen', ySplit: 3 }];

  // ── Sheet 3: Daftar SP ────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Daftar SP');
  autoWidth(ws3, [14, 32, 20, 12, 12, 22, 18, 20, 18, 18, 8]);
  titleRow(ws3, `Daftar SP yang memuat: ${prodLabel}`, 11);
  ws3.addRow([]);
  if (truncated) {
    const w = ws3.addRow(['PERINGATAN: daftar menyentuh batas baris — isi TIDAK LENGKAP. Persempit filter periode.']);
    w.font = { bold: true, color: { argb: PURPLE_ARGB } };
  }
  styleHeader(ws3.addRow([
    'No SP', 'Customer', 'DC', 'Tgl SP', 'Tenggat', 'Status',
    qtyHdr('Qty Produk Ini'), qtyHdr('Terkirim Produk Ini'), qtyHdr('Sisa Produk Ini'),
    'Nilai Sisa (DPP)', 'Umur (hari)',
  ]));
  spRows.forEach((r) => {
    const row = ws3.addRow([
      r.sp_no || '—',
      r.customer_name || '—',
      r.dc_nama || '—',
      r.sp_date || '—',
      r.expired_date || '—',
      r.status || '—',
      Number(r.qty) || 0,
      Number(r.shipped_qty) || 0,
      Number(r.sisa) || 0,
      Number(r.nilai_sisa) || 0,
      Number(r.umur_hari) || 0,
    ]);
    [7, 8, 9, 11].forEach((i) => { row.getCell(i).numFmt = NUM; });
    row.getCell(10).numFmt = RP;
  });
  ws3.addRow(['Angka di tabel ini hanya porsi produk tsb, bukan nilai SP secara utuh.']);
  ws3.addRow(['Nilai SP utuh (seluruh produk, sudah termasuk PPN) ada di Detail SP.']);
  // +2 baris judul & baris kosong di atas header.
  ws3.views = [{ state: 'frozen', ySplit: truncated ? 4 : 3 }];
}
