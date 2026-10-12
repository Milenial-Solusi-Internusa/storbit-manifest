// src/modules/crm/lead/components/Pager.jsx
// Paginasi bernomor -- design-handoff/crm-2026-10-11/shots/lead/01/02/10 (list
// Capture Lead + preview Import Leads step 3). Diukur langsung dari DOM
// mockup: tombol bulat 32x32, radius 10 (RADIUS.md), aktif = ROW_HOVER bg +
// border ACCENT_HOVER (token kit yang sudah ada, nol hex baru). Koreksi
// visual Paket 1 -- sebelumnya LeadCapturePage/ImportLeadsModal cuma punya
// ‹ Prev / Next › tanpa nomor halaman.
//
// Windowing >7 halaman TIDAK ada di mockup (datanya cuma 7 halaman) --
// keputusan desain sendiri, pola umum: selalu 1 & halaman terakhir, 1 angka
// di kiri-kanan halaman aktif, "…" untuk yang dilewati. Di-flag di laporan
// akhir, bukan keputusan diam-diam.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD, INK, INK_FAINT, LINE, ACCENT_HOVER, ROW_HOVER, FONT_BODY, RADIUS } from '../../../../kit/tokens';

function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 0 && n < total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

/**
 * @param {number} page - 0-indexed
 * @param {number} totalPages
 * @param {(page: number) => void} onChange
 */
function PageButton({ children, active, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{
      width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: RADIUS.md, border: `1px solid ${active ? ACCENT_HOVER : LINE}`,
      background: active ? ROW_HOVER : CARD, color: disabled ? INK_FAINT : INK,
      fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      {children}
    </button>
  );
}

export default function Pager({ left, page, totalPages, onChange }) {
  if (totalPages <= 1) return left ? <div style={{ fontSize: 13, color: INK_FAINT, fontFamily: FONT_BODY }}>{left}</div> : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      {left && <div style={{ fontSize: 13, color: INK_FAINT, fontFamily: FONT_BODY }}>{left}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <PageButton disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /></PageButton>
        {pageList(page, totalPages).map((n, i) => (n === '…'
          ? <span key={`e${i}`} style={{ width: 24, textAlign: 'center', color: INK_FAINT, fontSize: 13, fontFamily: FONT_BODY }}>…</span>
          : <PageButton key={n} active={n === page} onClick={() => onChange(n)}>{n + 1}</PageButton>))}
        <PageButton disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}><ChevronRight size={15} /></PageButton>
      </div>
    </div>
  );
}
