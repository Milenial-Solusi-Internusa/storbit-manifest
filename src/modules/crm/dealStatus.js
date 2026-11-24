// src/modules/crm/dealStatus.js
// Batch DS 3 -- kosakata CRM yang TIDAK punya padanan di src/kit/tokens.js
// (label teks + urutan tahap + daftar entitas). Dibuat supaya `v3/tokens.js`
// bisa pensiun tanpa kehilangan nilai yang belum sempat dipindah ke kit.
//
// Nol logika warna di berkas ini -- TONE/STAGE_TONE/CLOSED_STAGES/toneOf/
// closedFrom/isClosedStage SUDAH ADA di `kit/tokens.js` (byte-identik atau
// superset v3/tokens.js: `toneOf` kit menambah passthrough objek + nama
// SEMANTIC/TONE di atas fallback STAGE_TONE yang sudah dimiliki v3), jadi
// di-re-export dari sana, BUKAN diduplikasi.
export {
  TONE, STAGE_TONE, CLOSED_STAGES, toneOf, closedFrom, isClosedStage,
} from '../../kit/tokens';

/* Label teks status deal (`inquiries.status`) -- murni teks, nol kaitan
   warna. Nilai verbatim dari v3/tokens.js. */
export const STATUS_LABEL = {
  OPEN:        'Open',
  IN_REVIEW:   'In Review',
  QUOTED:      'Quoted',
  NEGOTIATION: 'Negotiation',
  WON:         'Won',
  LOST:        'Lost',
  CANCELLED:   'Cancelled',
};

/* Urutan tahap lifecycle akun (`accounts.lifecycle_stage`) dan status deal
   (`inquiries.status`) -- dipakai pemanggil yang perlu tahu "tahap ke berapa
   dari yang mana", bukan cuma warnanya. Verbatim dari v3/tokens.js. */
export const LIFECYCLE_ORDER = ['lead', 'mql', 'prospect', 'sql', 'customer'];
export const DEAL_STATUS_ORDER = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION', 'WON'];

/* Entitas (nama resmi -- README/AGENTS.md). Verbatim dari v3/tokens.js. */
export const ENTITIES = [
  { code: 'MSI', id: '0e1840d8-e6fb-4190-bd09-88338e68b492', name: 'PT Milenial Solusi Internusa' },
  { code: 'JCI', id: '42569e7c-531b-4d2b-832a-d5a7268c455b', name: 'PT Jago Custom Indonesia' },
  { code: 'SOA', id: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', name: 'PT Stuja Orbit Abadi' },
];
