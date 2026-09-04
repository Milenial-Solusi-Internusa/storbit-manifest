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

function titleRow(ws, text) {
  const r = ws.addRow([text]);
  r.font = { bold: true, size: 12, color: { argb: PURPLE_ARGB } };
  return r;
}

function autoWidth(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

/**
 * Rakit workbook laporan dan kembalikan Blob siap-unduh.
 *
 * @param {object}  report      hasil get_storbit_product_report
 * @param {Array}   spRows      hasil get_storbit_product_sp_list
 * @param {object}  outstanding hasil get_storbit_outstanding_summary
 * @param {object}  product     { code, product_name }
 * @param {object}  filters     { dateFrom, dateTo }
 * @param {boolean} truncated   daftar SP menyentuh limit
 * @returns {Promise<Blob>}
 */
export async function buildStorbitReportWorkbook({
  report = {}, spRows = [], outstanding = {}, product = {}, filters = {}, truncated = false,
}) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nexus by MSI';
  wb.created = new Date();

  const sum = report.summary || {};
  const perCust = report.per_customer || [];
  const uom = sum.uom || '';
  // Satuan ikut ke JUDUL kolom, bukan ke tiap sel: sel harus tetap NUMBER
  // supaya bisa dijumlah ulang di Excel. Menempelkan "PCS" ke nilainya akan
  // mengubahnya jadi teks dan mematikan SUM.
  const qtyHdr = (label) => (uom ? `${label} (${uom})` : label);
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
  autoWidth(ws2, [40, 10, 14, 20]);
  styleHeader(ws2.addRow(['Customer', 'Jml SP', qtyHdr('Sisa Qty'), 'Nilai Sisa (DPP)']));
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
  ws2.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Sheet 3: Daftar SP ────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Daftar SP');
  autoWidth(ws3, [14, 32, 20, 12, 12, 22, 10, 10, 10, 18, 8]);
  if (truncated) {
    const w = ws3.addRow(['PERINGATAN: daftar menyentuh batas baris — isi TIDAK LENGKAP. Persempit filter periode.']);
    w.font = { bold: true, color: { argb: PURPLE_ARGB } };
  }
  styleHeader(ws3.addRow([
    'No SP', 'Customer', 'DC', 'Tgl SP', 'Tenggat', 'Status',
    qtyHdr('Qty'), qtyHdr('Terkirim'), qtyHdr('Sisa'), 'Nilai Sisa (DPP)', 'Umur (hari)',
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
  ws3.views = [{ state: 'frozen', ySplit: truncated ? 2 : 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
