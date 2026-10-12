// src/modules/crm/lead/components/LeadStageBar.jsx
// Batang tahapan Detail Lead -- design-handoff/crm-2026-10-11/shots/lead/
// 16-detail-overview-sales.png + Lead Management.dc.html (diukur langsung
// dari DOM mockup, bukan ditaksir dari screenshot). Batch DS 3 Lead
// Management, Paket 1 koreksi visual Paket 1.
//
// SENGAJA BUKAN kit StatusBar: mockup memakai bar DATAR -- 4 segmen SAMA
// LEBAR (flex 1 1 0%), nol clip-path/chevron, nol sudut membulat per segmen
// atau pada wadahnya, nol nomor urut, nol tanda centang, nol penanda "Not
// closed". Warna diukur persis dari DOM: segmen TERLEWATI = ACCENT+INK,
// AKTIF = ACCENT_2+INK (lebih tebal, 700 vs 600), BELUM = HEAD_BG+INK_FAINT
// -- semuanya token kit yang sudah ada, nol hex baru.
//
// Status 'lost' MENGGANTIKAN bar sepenuhnya (bukan ditambahkan di ujung
// kanan seperti StatusBar.closed) dengan Badge tone="danger" + teks
// "Lost at <tahap>". <tahap> diturunkan dari qualified_at (tanpa kolom
// baru): belum pernah qualified_at -> "Raw", sudah -> "Qualified". Kasus
// lost setelah Converted (punya inquiry) belum punya acuan visual mockup
// yang jelas -- lihat laporan akhir.
import { Badge } from '../../../../kit';
import { ACCENT, ACCENT_2, HEAD_BG, INK, INK_FAINT, INK_SOFT, FONT_BODY } from '../../../../kit/tokens';

const SEGMENTS = [
  { id: 'raw', label: 'Raw' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
  { id: 'customer', label: 'Customer' },
];

/**
 * @param {'raw'|'qualified'|'converted'|'customer'|'lost'} status
 * @param {string} [lostAtLabel] - wajib kalau status==='lost' ("Raw"/"Qualified")
 */
export default function LeadStageBar({ status, lostAtLabel }) {
  if (status === 'lost') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40 }}>
        <Badge tone="danger">Lost</Badge>
        <span style={{ fontSize: 12.5, color: INK_SOFT, fontFamily: FONT_BODY }}>Lost at {lostAtLabel}</span>
      </div>
    );
  }
  const idx = SEGMENTS.findIndex((s) => s.id === status);
  return (
    <div style={{ display: 'flex', width: '100%', height: 40 }}>
      {SEGMENTS.map((s, i) => {
        const isPast = idx > -1 && i < idx;
        const isActive = i === idx;
        const bg = isPast ? ACCENT : isActive ? ACCENT_2 : HEAD_BG;
        const color = isPast || isActive ? INK : INK_FAINT;
        return (
          <div key={s.id} style={{
            flex: '1 1 0%', display: 'flex', alignItems: 'center', padding: '0 20px',
            background: bg, color, fontWeight: isActive ? 700 : 600, fontSize: 12.5, fontFamily: FONT_BODY,
          }}>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}
