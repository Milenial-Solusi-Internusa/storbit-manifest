// src/modules/crm/lead/lib/leadOptions.js
// Daftar pilihan TETAP (bukan dropdown_options/master-data-tiered) dipakai
// bersama LeadCapturePage (filter + kolom) dan CaptureLeadModal (form).
//
// Source: 12 nilai -- terikat CHECK constraint `prospects_source_check` pada
// accounts.source. [Koreksi 16 Okt 2026: komentar lama merujuk
// ProspectFormPage.jsx sebagai acuan label kembar -- file itu sudah tidak
// ada (diganti LeadCapturePage/CaptureLeadModal), rujukannya basi, dicabut.]
export const SOURCES = [
  'sales_visit', 'cold_call', 'referral', 'existing_network', 'exhibition',
  'instagram', 'linkedin', 'tiktok', 'whatsapp', 'website', 'walk_in', 'other',
];
// TD-318 Irisan 1, N6: label Inggris MURNI -- mockup (Lead Management.dc.html,
// `<option>` Source filter + Capture Lead) seluruhnya Inggris; tiga label
// SEBELUMNYA dicampur ("Exhibition / Pameran", "Walk-in" beda ejaan dari
// mockup "Walk In", "Lainnya" utk Other) -- satu-satunya titik non-Inggris
// di modul ini.
export const SOURCE_LABELS = {
  sales_visit: 'Sales Visit', cold_call: 'Cold Call', referral: 'Referral',
  existing_network: 'Existing Network', exhibition: 'Exhibition', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', whatsapp: 'WhatsApp', website: 'Website',
  walk_in: 'Walk In', other: 'Other',
};

// Priority: field tetap (bukan master-data), nilai teks bebas "High/Medium/
// Low" -- lihat COMMENT ON COLUMN accounts.priority di migrasi
// 20261011000001. Default Medium diisi FE saat Capture, bukan DEFAULT kolom.
export const PRIORITIES = ['High', 'Medium', 'Low'];

// Kontak -- preferred_channel, CHECK tiga nilai (migrasi 20261011000001).
export const PREFERRED_CHANNELS = ['whatsapp', 'call', 'email'];
export const PREFERRED_CHANNEL_LABELS = { whatsapp: 'WhatsApp', call: 'Call', email: 'Email' };

// Kontak -- role_type, CHECK lima nilai (contacts_role_type_check,
// schema_snapshot.sql). TD-318 Lead Detail, #28: dipindah dari ContactModal.jsx
// (lokal) ke sini supaya ContactsTab.jsx (LeadDetailPage.jsx) bisa memetakan
// slug -> label TANPA menyalin daftar kedua yang bisa melenceng -- pola yang
// sama dgn PREFERRED_CHANNELS/PREFERRED_CHANNEL_LABELS di atas.
export const ROLE_TYPES = ['decision_maker', 'requester', 'finance', 'operations', 'other'];
export const ROLE_TYPE_LABELS = {
  decision_maker: 'Decision Maker', requester: 'Requester', finance: 'Finance',
  operations: 'Operations', other: 'Other',
};
