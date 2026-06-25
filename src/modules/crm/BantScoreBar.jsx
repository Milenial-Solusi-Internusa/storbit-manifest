// src/modules/crm/BantScoreBar.jsx
// BANT score bar — used in both the prospect form and the read-only detail modal.
// Model 0–12 (4 dimensi × 0–3). Warna/label dari bantScoreMeta (≥8 hijau, ≥5
// amber, <5 merah).
import { bantScoreMeta, BANT_MAX_SCORE } from './bant';

export default function BantScoreBar({ score, max = BANT_MAX_SCORE }) {
  const meta = bantScoreMeta(score);
  const tint = `${meta.color}14`; // ~8% alpha background derived from the band colour
  return (
    <div style={{ background: tint, border: `1px solid ${meta.color}33`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '.4px' }}>BANT Score</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: meta.color, fontFamily: "'IBM Plex Mono',monospace" }}>{score} / {max}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: meta.color, borderRadius: 99, padding: '2px 9px', textTransform: 'uppercase', letterSpacing: '.3px' }}>{meta.label}</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.6)', overflow: 'hidden', marginTop: 8 }}>
        <div style={{ height: '100%', width: `${(score / max) * 100}%`, background: meta.color, borderRadius: 99, transition: 'width .25s' }} />
      </div>
    </div>
  );
}
