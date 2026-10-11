// src/modules/crm/lead/lib/leadImport.js
// Logika murni Import Leads (4 langkah: Upload File / Column Mapping /
// Defaults and Preview / sukses) -- nol JSX, pola sama dengan
// src/modules/finance/ttfImport.js (exceljs diimpor DINAMIS, baru dipanggil
// saat user benar-benar membuka wizard).
//
// Kolom yang didukung template: Company Name, Contact Name, Phone, Email,
// Source, Lead Description -- persis daftar di mockup
// design-handoff/crm-2026-10-11/shots/lead/07-modal-import-leads-step1-upload.png.
//
// CSV dibaca TANPA exceljs (exceljs.csv.read mengharapkan readable stream
// Node, bukan API File browser) -- parser baris sendiri, cukup untuk file
// hasil Export Excel/Google Sheets standar (koma, kutip dua untuk field
// ber-koma). .xlsx/.xls tetap lewat exceljs seperti ttfImport.js.

export const NEXUS_FIELDS = [
  { key: 'name',         label: 'Company Name' },
  { key: 'contact_name', label: 'Contact Name' },
  { key: 'phone',        label: 'Phone' },
  { key: 'email',        label: 'Email' },
  { key: 'source',       label: 'Source' },
  { key: 'description',  label: 'Lead Description' },
  { key: 'ignore',       label: 'Ignore this column' },
];

const FIELD_KEYWORDS = {
  name:         ['company name', 'company', 'perusahaan', 'nama perusahaan', 'nama'],
  contact_name: ['contact name', 'contact person', 'nama kontak', 'pic', 'contact'],
  phone:        ['phone', 'telp', 'telepon', 'no hp', 'no. hp', 'whatsapp', 'wa'],
  email:        ['email', 'e-mail'],
  source:       ['source', 'sumber'],
  description:  ['description', 'notes', 'catatan', 'lead description', 'keterangan'],
};

/** Cocokkan satu header kolom file -> key NEXUS_FIELDS, 'ignore' kalau tak
 *  ada yang cocok. Pencocokan case-insensitive, substring, urutan keyword
 *  per field menentukan prioritas. */
export function matchFieldForHeader(header) {
  const h = (header || '').trim().toLowerCase();
  if (!h) return 'ignore';
  for (const [key, keywords] of Object.entries(FIELD_KEYWORDS)) {
    if (keywords.some((kw) => h === kw || h.includes(kw))) return key;
  }
  return 'ignore';
}

/** Bangun mapping awal { headerIndex: fieldKey } dari daftar header file. */
export function autoMatchColumns(headers) {
  const used = new Set();
  const mapping = {};
  headers.forEach((h, i) => {
    const key = matchFieldForHeader(h);
    if (key !== 'ignore' && !used.has(key)) { mapping[i] = key; used.add(key); }
    else mapping[i] = 'ignore';
  });
  return mapping;
}

/** Parser CSV baris-per-baris minimal: koma pemisah, kutip dua untuk field
 *  ber-koma/ber-baris-baru, "" = kutip literal di dalam field berkutip.
 *  Cukup untuk ekspor standar (Excel/Google Sheets), bukan RFC 4180 penuh. */
function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  return rows;
}

/** Nilai mentah satu sel exceljs -> string polos (sama dengan ttfImport.js). */
function nilaiSel(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return v.text;
    return '';
  }
  return String(v);
}

/** Baca file .csv/.xlsx/.xls -> { headers: string[], rows: string[][] }. */
export async function parseLeadImportFile(file) {
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) {
    const text = await file.text();
    const all = parseCsvText(text);
    if (all.length === 0) return { headers: [], rows: [] };
    return { headers: all[0], rows: all.slice(1) };
  }
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  let headers = [];
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    const values = [];
    const colCount = Math.max(row.cellCount, headers.length);
    for (let c = 1; c <= colCount; c++) values.push(nilaiSel(row.getCell(c)));
    if (rowNumber === 1) { headers = values; return; }
    if (values.some((v) => String(v ?? '').trim() !== '')) rows.push(values);
  });
  return { headers, rows };
}

/** Terapkan mapping + default values -> baris siap pratinjau/impor.
 *  `defaults` = { source, companyId, assignedTo } -- source & companyId WAJIB
 *  (mockup: "Source *" / "Entity *"), dipakai HANYA untuk baris yang kolom
 *  filenya tak terpetakan ke field itu (lihat §7 plan: Source wajib diisi
 *  kalau kolom Source tak ada di file). */
export function buildPreviewRows(rows, mapping, defaults) {
  const indexForField = (key) => Object.entries(mapping).find(([, v]) => v === key)?.[0];
  const nameIdx = indexForField('name');
  const contactIdx = indexForField('contact_name');
  const phoneIdx = indexForField('phone');
  const emailIdx = indexForField('email');
  const sourceIdx = indexForField('source');
  const descIdx = indexForField('description');
  return rows.map((r, i) => ({
    rowNumber: i + 2, // +1 header, +1 1-based
    name: (nameIdx != null ? r[nameIdx] : '') || '',
    contact_name: (contactIdx != null ? r[contactIdx] : '') || '',
    phone: (phoneIdx != null ? r[phoneIdx] : '') || '',
    email: (emailIdx != null ? r[emailIdx] : '') || '',
    source: ((sourceIdx != null ? r[sourceIdx] : '') || defaults.source || '').toString(),
    description: (descIdx != null ? r[descIdx] : '') || '',
    company_id: defaults.companyId || null,
    assigned_to: defaults.assignedTo || null,
    include: true, // dibalik ke false oleh pemanggil kalau baris ini mirip akun existing
  })).filter((r) => r.name.trim());
}

/** Template .xlsx unduhan -- enam kolom mockup, satu baris contoh. */
export async function downloadLeadImportTemplate() {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nexus by MSI';
  wb.created = new Date();
  const ws = wb.addWorksheet('Import Leads');
  const head = ws.addRow(['Company Name', 'Contact Name', 'Phone', 'Email', 'Source', 'Lead Description']);
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF33422B' } }; // INK (sage) -- sage adalah palet aplikasi Nexus, dokumen ini internal (template impor), bukan PDF customer
    cell.alignment = { vertical: 'middle' };
  });
  head.height = 18;
  const contoh = ws.addRow(['PT Contoh Logistik', 'Budi Santoso', '0812 3456 7890', 'budi@contohlogistik.co.id', 'Exhibition', 'Needs LCL to Makassar']);
  contoh.font = { italic: true, color: { argb: 'FF9AA3B2' } };
  ws.columns = [{ width: 28 }, { width: 20 }, { width: 18 }, { width: 28 }, { width: 16 }, { width: 36 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Template-Import-Leads.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
