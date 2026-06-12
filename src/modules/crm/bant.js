// src/modules/crm/bant.js
// BANT qualification — shared options and scoring helpers (no JSX).
// Used by ProspectFormPage (capture) and PipelineKanbanPage ProspectDetailModal (read-only).

// Dropdown options — values are stored verbatim (text columns) so detail views render as-is.
export const BANT_FREQUENCY_OPTIONS = [
  '', 'Rutin Mingguan', 'Rutin Bulanan', 'Per Kuartal', 'Tidak Menentu', 'Proyek',
];
export const BANT_PAYMENT_OPTIONS = [
  '', 'Cash Before Delivery (CBD)', 'TOP 7', 'TOP 14', 'TOP 30', 'TOP 45', 'TOP 60',
];

// The 7 fields that each contribute 1 point to the BANT score (max 7).
export const BANT_SCORE_FIELDS = [
  'bant_commodity', 'bant_origin', 'bant_destination', 'bant_frequency',
  'bant_current_vendor', 'bant_payment', 'bant_decision_maker',
];

export const BANT_MAX_SCORE = BANT_SCORE_FIELDS.length; // 7

// Every non-empty scoring field = 1 point.
export function calcBantScore(obj) {
  return BANT_SCORE_FIELDS.reduce(
    (n, k) => n + (obj?.[k] != null && String(obj[k]).trim() !== '' ? 1 : 0),
    0,
  );
}

// Colour + message band for a given score.
export function bantScoreMeta(score) {
  if (score >= 6) return { color: '#1F8B4D', bg: '#DEF0E4', label: 'Data lengkap, siap di-qualify' };
  if (score >= 4) return { color: '#E85A1E', bg: '#FBE6DA', label: 'Cukup untuk lanjut, lengkapi sisanya' };
  return { color: '#C0392B', bg: '#FBE3E0', label: 'Belum cukup data untuk qualify' };
}
