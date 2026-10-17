// src/modules/crm/lib/bant.js
// BANT qualification — sumber kebenaran scoring (no JSX).
// Model baru: 4 dimensi (Budget / Authority / Need / Timeline), tiap dimensi
// rubric 0–3 → skor 0–12. Dipakai LeadDetailPage/LeadCapturePage (capture),
// BantScoreBar (visual), PipelineKanbanPage (gate CONTACTED→QUALIFIED).
//
// Pindah dari src/modules/crm/bant.js (Batch DS 3 Lead Management, Paket 1
// irisan 2) ke sini karena dipakai ≥2 sub-fitur CRM (lead DAN customer) —
// aturan Batch_FS_Fase_0_Aturan_Struktur.md §5: naik ke level MODUL
// (modules/crm/lib/), bukan tetap di lead/ atau di root crm/. Isi file
// byte-identik, nol perubahan perilaku.

// TD-318 Lead Detail, item 3 (tes Den): keempat `description` disamakan
// PERSIS teks mockup `bantRows[].h` (Lead Management.dc.html :706) --
// sebelumnya Budget/Authority/Need Indonesia, Timeline Inggris TAPI beda
// kalimat dari mockup. Dipakai bersama LeadDetailPage.jsx (BantTab) DAN
// BantCard.jsx (CustomerDetailPage.jsx, Customer Master) -- lihat laporan
// akhir utk daftar pemakai lengkap. `options[].label` TIDAK disentuh --
// di luar lingkup disetujui (hanya `description`), dicatat terpisah.
export const BANT_DIMENSIONS = [
  {
    key: 'bant_budget',
    label: 'Budget',
    description: 'Is there an approved budget for logistics?',
    options: [
      { value: 0, label: 'No budget indication' },
      { value: 1, label: 'Budget exists but value not confirmed' },
      { value: 2, label: 'Value range known' },
      { value: 3, label: 'Value & approval channel confirmed' },
    ],
  },
  {
    key: 'bant_authority',
    label: 'Authority',
    description: 'Are we talking to the decision maker?',
    options: [
      { value: 0, label: 'No PIC' },
      { value: 1, label: 'Engaged 1 stakeholder operational' },
      { value: 2, label: 'Decision-maker identified' },
      { value: 3, label: 'Decision-maker engaged direct' },
    ],
  },
  {
    key: 'bant_need',
    label: 'Need',
    description: 'Is the shipping need clear and recurring?',
    options: [
      { value: 0, label: 'Pain is unclear' },
      { value: 1, label: 'Pain general (cost/transit)' },
      { value: 2, label: 'Specific pain with context' },
      { value: 3, label: 'Pain quantified + alternative explored' },
    ],
  },
  {
    key: 'bant_timeline',
    label: 'Timeline',
    description: 'Is there a confirmed start date?',
    options: [
      { value: 0, label: 'Exploratory only' },
      { value: 1, label: '6+ months' },
      { value: 2, label: '1-3 months' },
      { value: 3, label: 'Immediate (≤30 days)' },
    ],
  },
];

export const BANT_MAX_SCORE = 12;

export const calcBantScore = (obj) =>
  BANT_DIMENSIONS.reduce((sum, d) => sum + (Number(obj?.[d.key]) || 0), 0);

// Gate BANT untuk naik ke QUALIFIED — SATU aturan untuk semua jalur tulis
// (Kanban drag, Pindah Stage & Edit Deal di Detail Account / Detail Deal, form
// Prospect). Ambang & teksnya diambil apa adanya dari gate Kanban yang sudah ada
// supaya pesan yang dilihat sales identik di mana pun ia menaikkan stage.
// Ditaruh di sini (bukan di DealPanels) karena file ini sudah memiliki
// calcBantScore + ambang 8/5 pada bantScoreMeta, dan bebas JSX.
export const bantQualifyGate = (account) => {
  const score = calcBantScore(account);
  if (score < 5) {
    return {
      verdict: 'block',
      score,
      message: `BANT score is too low (${score}/12). Complete the qualification before moving to Qualified.`,
    };
  }
  if (score < 8) {
    return {
      verdict: 'confirm',
      score,
      message: `BANT score ${score}/12 — this prospect still needs nurturing. Move to Qualified anyway?`,
    };
  }
  return { verdict: 'pass', score };
};

export const bantScoreMeta = (score) => {
  if (score >= 8) return { color: '#16A34A', label: 'Qualified', canQualify: true };
  if (score >= 5) return { color: '#F59E0B', label: 'Nurture', canQualify: false };
  return { color: '#DC2626', label: 'Disqualify', canQualify: false };
};

// Legacy compatibility — kolom lama dipertahankan di DB (tech debt). Disisakan
// agar import lama (mis. useCustomFields reserved-list / detail view) tak error.
export const BANT_SCORE_FIELDS = [
  'bant_commodity', 'bant_origin', 'bant_destination',
  'bant_frequency', 'bant_current_vendor', 'bant_payment',
  'bant_decision_maker',
];

// Opsi dropdown lama (dipertahankan utk kompatibilitas import yang mungkin ada).
export const BANT_FREQUENCY_OPTIONS = [
  '', 'Rutin Mingguan', 'Rutin Bulanan', 'Per Kuartal', 'Undetermined', 'Proyek',
];
export const BANT_PAYMENT_OPTIONS = [
  '', 'Cash Before Delivery (CBD)', 'TOP 7', 'TOP 14', 'TOP 30', 'TOP 45', 'TOP 60',
];

// Katalog label+kolom "Qualification Data" (BANT_SCORE_FIELDS di atas +
// label manusiawi) — SATU sumber dipakai LeadDetailPage (tab BANT &
// Pipeline) dan LeadQualificationPage (panel per baris, Paket 1 irisan 6)
// supaya field/urutan/label tidak bisa melenceng antar halaman. Teks bebas
// (FloatingInput), BUKAN dropdown BANT_FREQUENCY_OPTIONS/BANT_PAYMENT_OPTIONS
// di atas -- nilai contoh mockup ("2 × 40ft per month", "Credit 30 days")
// tidak cocok opsi dropdown legacy itu.
export const QUALIFICATION_FIELDS = [
  { label: 'Commodity', key: 'bant_commodity' }, { label: 'Origin', key: 'bant_origin' },
  { label: 'Destination', key: 'bant_destination' }, { label: 'Shipping Frequency', key: 'bant_frequency' },
  { label: 'Current Vendor', key: 'bant_current_vendor' }, { label: 'Payment Method', key: 'bant_payment' },
  { label: 'Decision Maker', key: 'bant_decision_maker' },
];
