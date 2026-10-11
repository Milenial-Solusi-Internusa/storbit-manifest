// src/modules/crm/lead/lib/leadOptions.js
// Daftar pilihan TETAP (bukan dropdown_options/master-data-tiered) dipakai
// bersama LeadCapturePage (filter + kolom) dan CaptureLeadModal (form).
//
// Source: 12 nilai, SAMA PERSIS urutan+label dgn ProspectFormPage.jsx --
// terikat CHECK constraint `prospects_source_check` pada accounts.source.
// Kalau nilainya bertambah, ubah DI SINI dan di ProspectFormPage berbarengan
// (dua daftar belum disatukan -- pola yang sudah ada, bukan baru dari sini).
export const SOURCES = [
  'sales_visit', 'cold_call', 'referral', 'existing_network', 'exhibition',
  'instagram', 'linkedin', 'tiktok', 'whatsapp', 'website', 'walk_in', 'other',
];
export const SOURCE_LABELS = {
  sales_visit: 'Sales Visit', cold_call: 'Cold Call', referral: 'Referral',
  existing_network: 'Existing Network', exhibition: 'Exhibition / Pameran', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', whatsapp: 'WhatsApp', website: 'Website',
  walk_in: 'Walk-in', other: 'Lainnya',
};

// Priority: field tetap (bukan master-data), nilai teks bebas "High/Medium/
// Low" -- lihat COMMENT ON COLUMN accounts.priority di migrasi
// 20261011000001. Default Medium diisi FE saat Capture, bukan DEFAULT kolom.
export const PRIORITIES = ['High', 'Medium', 'Low'];

// Kontak -- preferred_channel, CHECK tiga nilai (migrasi 20261011000001).
export const PREFERRED_CHANNELS = ['whatsapp', 'call', 'email'];
export const PREFERRED_CHANNEL_LABELS = { whatsapp: 'WhatsApp', call: 'Call', email: 'Email' };
