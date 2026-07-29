// src/modules/procurement/prfShared.js
// Helper & lookup map yang sebelumnya disalin verbatim di PRFDetailPage.jsx
// dan ProcInquiryForwardingPage.jsx (TD-148).

export const SERVICE_LABEL = { sea: 'Sea', air: 'Air', inland: 'Inland', project: 'Project', custom: 'Custom' };

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

// Commodity & Add-On Services — dipakai PRFFormPage.jsx (dropdown/pill, butuh
// array utuh incl. `customs` flag) dan PRFDetailPage.jsx (terjemahan enum
// mentah → label, via COMMODITY_LABEL/ADD_ON_LABEL turunan di bawah).
export const COMMODITIES = [
  { value: 'general', label: 'General Cargo' },
  { value: 'special_permit', label: 'Special Permit' },
  { value: 'dg', label: 'Dangerous Good' },
  { value: 'perishable', label: 'Perishable' },
  { value: 'live_animal', label: 'Live Animal' },
  { value: 'valuable', label: 'Valuable' },
  { value: 'pharma', label: 'Pharma' },
];
export const ADD_ONS = [
  { value: 'custom_clearance', label: 'Custom Clearance', customs: true },
  { value: 'inland', label: 'Inland', customs: false },
  { value: 'import_license_undername', label: 'Import License (Undername)', customs: true },
  { value: 'import_license_pi', label: 'Import License (PI)', customs: true },
  { value: 'export_license', label: 'Export License', customs: true },
  { value: 'ls', label: 'LS', customs: true },
  { value: 'warehouse_umum', label: 'Warehouse Umum', customs: false },
  { value: 'warehouse_reefer', label: 'Warehouse Reefer', customs: false },
  { value: 'tkbm', label: 'TKBM', customs: false },
  { value: 'insurance', label: 'Insurance', customs: false },
  { value: 'others', label: 'Others', customs: false },
];
export const COMMODITY_LABEL = Object.fromEntries(COMMODITIES.map((c) => [c.value, c.label]));
export const ADD_ON_LABEL = Object.fromEntries(ADD_ONS.map((a) => [a.value, a.label]));
