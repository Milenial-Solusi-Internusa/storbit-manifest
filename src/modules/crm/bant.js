// src/modules/crm/bant.js
// BANT qualification — sumber kebenaran scoring (no JSX).
// Model baru: 4 dimensi (Budget / Authority / Need / Timeline), tiap dimensi
// rubric 0–3 → skor 0–12. Dipakai ProspectFormPage (capture), BantScoreBar
// (visual), PipelineKanbanPage (gate CONTACTED→QUALIFIED).

export const BANT_DIMENSIONS = [
  {
    key: 'bant_budget',
    label: 'Budget',
    description: 'Seberapa jelas budget customer?',
    options: [
      { value: 0, label: 'No budget indication' },
      { value: 1, label: 'Budget exists but value not confirmed' },
      { value: 2, label: 'Value range diketahui' },
      { value: 3, label: 'Value & approval channel confirmed' },
    ],
  },
  {
    key: 'bant_authority',
    label: 'Authority',
    description: 'Siapa decision maker?',
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
    description: 'Seberapa jelas kebutuhan customer?',
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
    description: 'When is the customer ready to start?',
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
