// src/modules/crm/components/BantCard.jsx
// BANT dimension card (score 0–3 per dimension) — dipakai LeadDetailPage/
// LeadCapturePage dan CustomerDetailPage (edit inline BANT & Pipeline).
//
// Pindah dari src/modules/crm/ProspectFormPage.jsx (dulu diekspor dari sana
// "supaya bisa dipakai ulang di CustomerDetailPage.jsx") ke file sendiri —
// Batch DS 3 Lead Management, Paket 1 irisan 2, aturan Batch_FS_Fase_0 §5
// (dipakai ≥2 sub-fitur CRM, naik level ke modules/crm/components/).
//
// Tokens (C/S.input) dan SelectChevron DIDUPLIKASI dari ProspectFormPage.jsx
// apa adanya, bukan dipakai bersama — keduanya masih dipakai di banyak
// tempat lain di ProspectFormPage.jsx yang tidak pindah, jadi menariknya ke
// satu sumber bersama akan menambah kopling yang tidak perlu untuk
// segelintir warna. Nilai-nilai di bawah byte-identik dengan sumbernya.
import { useState } from 'react';
import { ChevronDown, DollarSign, Users, Target, Clock } from 'lucide-react';

const C = {
  navy: '#1B4D8A', navyDark: '#0F3768', navySoft: '#EEF3FB',
  orange: '#E85A1E', orangeDark: '#C94D18', orangeSoft: '#FDF0E9',
  pageBg: '#F8FAFC', card: '#FFFFFF',
  border: '#E2E8F0', borderStrong: '#CBD5E1',
  text: '#0F172A', sub: '#475569', muted: '#94A3B8',
  success: '#16A34A', warning: '#F59E0B', error: '#DC2626',
};

const INPUT_STYLE = { height: 44, borderRadius: 10, border: '1px solid ' + C.border, background: '#fff', padding: '0 14px', fontSize: 14, fontFamily: 'inherit', color: C.text, width: '100%', outline: 'none', boxSizing: 'border-box' };

const BANT_ICON = { bant_budget: DollarSign, bant_authority: Users, bant_need: Target, bant_timeline: Clock };

function SelectChevron() {
  return <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><ChevronDown size={16} color={C.muted} /></span>;
}

export function BantCard({ dim, value, onChange }) {
  const [h, setH] = useState(false);
  const DimIcon = BANT_ICON[dim.key] || Target;
  const selected = dim.options.find(o => o.value === value);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ border: '1px solid ' + (h ? C.borderStrong : C.border), borderRadius: 14, padding: 18, background: h ? '#FCFDFE' : '#fff', transition: 'border-color .16s ease, background .16s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: C.navySoft, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 32px' }}><DimIcon size={17} /></div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14.5, color: C.text }}>{dim.label}</div>
        <div style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 13, color: value > 0 ? C.navy : C.muted }}>{value}<span style={{ color: C.muted, fontWeight: 500 }}>/3</span></div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 13, minHeight: 34 }}>{dim.description}</div>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={onChange} style={{ ...INPUT_STYLE, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 38, cursor: 'pointer' }}>
          {dim.options.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
        </select>
        <SelectChevron />
      </div>
      {selected && (
        <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.orange, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C.orange, flex: '0 0 6px' }} />{selected.label}
        </div>
      )}
    </div>
  );
}
