// src/modules/finance/ttfImport.js
// Logika murni impor TTF massal (6.2.2 Invoice Submission & Acknowledgement).
// Nol JSX -- pola sama dengan invoiceStatus.js/useInvoiceWorkflow.js.
//
// exceljs DIIMPOR DINAMIS di dua fungsi (template & parse), pola yang sama
// dengan storbitReportExcel.js: paketnya ~950 KB dan halaman ini jauh lebih
// sering dilihat (daftar kerja Belum TTF) daripada dipakai mengimpor.
//
// ALUR (keputusan Den): unduh template -> isi -> unggah -> kategorikan (enam
// kategori di bawah) -> Proses Impor memanggil markTtfReceived() (db.js) SATU
// PER BARIS, hanya untuk baris yang lolos. TIDAK ada RPC baru, TIDAK ada tulis
// langsung ke tabel ar_ttfs -- jalur tulisnya persis sama dengan pencatatan
// TTF manual satu-per-satu di Detail Invoice, supaya jatuh tempo, "isi sekali"
// tanggal_menerima, dan audit KOREKSI_TTF ikut terhitung.
import { OPEN_STATUSES, STATUS_LABEL } from './invoiceStatus.js';

export const TEMPLATE_HEADERS = ['No. Invoice', 'No. SP', 'No. TTF', 'Tanggal TTF', 'Diterima Oleh', 'Catatan'];

const PURPLE_ARGB = 'FF5B3FA0'; // keluarga ungu Storbit, sama dengan storbitReportExcel.js

/** Bangun & unduh template .xlsx (header + satu baris contoh). */
export async function downloadTtfImportTemplate() {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nexus by MSI';
  wb.created = new Date();
  const ws = wb.addWorksheet('Impor TTF');
  const head = ws.addRow(TEMPLATE_HEADERS);
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_ARGB } };
    cell.alignment = { vertical: 'middle' };
  });
  head.height = 18;
  const contoh = ws.addRow([
    'SOA-INV-X-2026-0001', '9100024', 'TTF-0001', new Date(2026, 6, 16),
    'Budi (Indomarco)', 'Contoh baris -- hapus sebelum mengisi data sungguhan',
  ]);
  contoh.font = { italic: true, color: { argb: 'FF9AA3B2' } };
  ws.columns = [{ width: 24 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 26 }, { width: 38 }];
  ws.getColumn(4).numFmt = 'dd/mm/yyyy';

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Template-Impor-TTF.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nilai mentah satu sel exceljs -> string/Date/number polos. */
function nilaiSel(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    return '';
  }
  return v;
}

/** Baca file .xlsx yang diunggah user -> array baris mentah (belum
 *  dikategorikan). Baris kosong (keenam kolom kosong semua) dilewati. */
export async function parseTtfImportFile(file) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const noInvoice    = String(nilaiSel(row.getCell(1)) ?? '').trim();
    const noSp         = String(nilaiSel(row.getCell(2)) ?? '').trim();
    const noTtf        = String(nilaiSel(row.getCell(3)) ?? '').trim();
    const tanggalRaw   = nilaiSel(row.getCell(4));
    const diterimaOleh = String(nilaiSel(row.getCell(5)) ?? '').trim();
    const catatan      = String(nilaiSel(row.getCell(6)) ?? '').trim();
    if (!noInvoice && !noSp && !noTtf && !tanggalRaw && !diterimaOleh && !catatan) return;
    out.push({ baris: rowNumber, noInvoice, noSp, noTtf, tanggalRaw, diterimaOleh, catatan });
  });
  return out;
}

/** Nilai tanggal dari sel exceljs (Date, atau teks DD/MM/YYYY atau
 *  YYYY-MM-DD) -> 'YYYY-MM-DD', atau null kalau tidak terbaca.
 *  Sel bertipe tanggal exceljs mem-parse-nya sebagai Date tengah malam UTC --
 *  bagian UTC yang diambil, BUKAN getFullYear() lokal (bisa mundur sehari di
 *  zona sebelah barat UTC, kelas bug yang sama dengan getTodayWIB). */
export function normalizeExcelDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return null;
}

// ── Enam kategori pratinjau ─────────────────────────────────────────────────
export const KATEGORI = {
  COCOK_BARU:      'cocok_baru',
  TTF_IDENTIK:     'ttf_identik',
  TTF_BEDA:        'ttf_beda',
  TIDAK_COCOK:     'tidak_cocok',
  STATUS_TERTUTUP: 'status_tertutup',
  TIDAK_VALID:     'tidak_valid',
};

export const KATEGORI_LABEL = {
  [KATEGORI.COCOK_BARU]:      'Cocok, belum ada TTF',
  [KATEGORI.TTF_IDENTIK]:     'Sudah ada TTF (identik, dilewati)',
  [KATEGORI.TTF_BEDA]:        'Sudah ada TTF (berbeda)',
  [KATEGORI.TIDAK_COCOK]:     'Tidak cocok',
  [KATEGORI.STATUS_TERTUTUP]: 'Status tidak mengizinkan',
  [KATEGORI.TIDAK_VALID]:     'Tanggal/data tidak valid',
};

// Kategori yang BISA diproses -- COCOK_BARU selalu, TTF_BEDA hanya kalau
// checkbox "izinkan koreksi" baris itu dicentang (keputusan dibaca di halaman,
// bukan di sini -- berkas ini nol state).
export const KATEGORI_BISA_DIPROSES = new Set([KATEGORI.COCOK_BARU, KATEGORI.TTF_BEDA]);

const samaTeks = (a, b) => (a || '').trim() === (b || '').trim();

/** Bandingkan satu baris mentah terhadap peta invoice (by invoice_no, lower-
 *  case) dan peta TTF yang sudah tercatat (by invoice id). Fungsi murni, nol
 *  I/O -- datanya sudah harus dimuat lebih dulu oleh pemanggil. */
export function categorizeRow(baris, { invoiceByNo, ttfByInvoiceId, todayIso }) {
  const noInvoice = (baris.noInvoice || '').trim();
  if (!noInvoice) {
    return { ...baris, kategori: KATEGORI.TIDAK_COCOK, alasan: 'No. Invoice kosong', invoice: null, tanggalTtf: null };
  }
  const invoice = invoiceByNo.get(noInvoice.toLowerCase());
  if (!invoice) {
    return { ...baris, kategori: KATEGORI.TIDAK_COCOK, alasan: 'No. Invoice tidak ditemukan', invoice: null, tanggalTtf: null };
  }
  if (!OPEN_STATUSES.includes(invoice.status)) {
    const label = STATUS_LABEL[invoice.status] || invoice.status || '—';
    const boleh = OPEN_STATUSES.map((s) => STATUS_LABEL[s]).join(', ');
    return {
      ...baris, kategori: KATEGORI.STATUS_TERTUTUP, invoice, tanggalTtf: null,
      alasan: `Status invoice "${label}" tidak bisa diimpor TTF-nya (hanya ${boleh})`,
    };
  }
  const tanggalTtf = normalizeExcelDate(baris.tanggalRaw);
  if (!tanggalTtf) {
    return {
      ...baris, kategori: KATEGORI.TIDAK_VALID, invoice, tanggalTtf: null,
      alasan: baris.tanggalRaw ? 'Format Tanggal TTF tidak terbaca' : 'Tanggal TTF kosong',
    };
  }
  if (tanggalTtf > todayIso) {
    return { ...baris, kategori: KATEGORI.TIDAK_VALID, invoice, tanggalTtf, alasan: 'Tanggal TTF di masa depan' };
  }
  if (!baris.diterimaOleh) {
    return { ...baris, kategori: KATEGORI.TIDAK_VALID, invoice, tanggalTtf, alasan: 'Nama penerima (Diterima Oleh) wajib diisi' };
  }

  const existing = ttfByInvoiceId.get(invoice.id);
  if (existing) {
    const identik = samaTeks(existing.no_ttf, baris.noTtf)
      && String(existing.tanggal_ttf || '') === tanggalTtf
      && samaTeks(existing.diterima_oleh, baris.diterimaOleh)
      && samaTeks(existing.notes, baris.catatan);
    return identik
      ? { ...baris, kategori: KATEGORI.TTF_IDENTIK, invoice, tanggalTtf, existing, alasan: 'Sama persis dengan TTF yang sudah tercatat' }
      : { ...baris, kategori: KATEGORI.TTF_BEDA,    invoice, tanggalTtf, existing, alasan: 'Berbeda dari TTF yang sudah tercatat -- akan mengoreksi' };
  }
  return { ...baris, kategori: KATEGORI.COCOK_BARU, invoice, tanggalTtf, existing: null, alasan: null };
}

/** Kategorikan SELURUH baris hasil parse terhadap daftar invoice (listInvoices)
 *  dan peta TTF (getTtfStatusByInvoices) yang sudah dimuat. */
export function categorizeImportRows(parsedRows, { invoices, ttfMap, todayIso }) {
  const invoiceByNo = new Map();
  (invoices || []).forEach((inv) => {
    if (inv.invoice_no) invoiceByNo.set(inv.invoice_no.trim().toLowerCase(), inv);
  });
  return (parsedRows || []).map((baris) => categorizeRow(baris, { invoiceByNo, ttfByInvoiceId: ttfMap, todayIso }));
}
