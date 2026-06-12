// src/modules/crm/BantScoreBar.jsx
// BANT score bar — used in both the prospect form and the read-only detail modal.
import { bantScoreMeta, BANT_MAX_SCORE } from './bant';

export default function BantScoreBar({ score, max = BANT_MAX_SCORE }) {
  const meta = bantScoreMeta(score);
  return (
    <div style={{ background: meta.bg, border: `1px solid ${meta.color}33`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '.4px' }}>BANT Score</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: meta.color, fontFamily: "'IBM Plex Mono',monospace" }}>{score} / {max}</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.6)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(score / max) * 100}%`, background: meta.color, borderRadius: 99, transition: 'width .25s' }} />
      </div>
      <div style={{ fontSize: 11.5, color: meta.color, fontWeight: 600, marginTop: 7 }}>{meta.label}</div>
    </div>
  );
}
