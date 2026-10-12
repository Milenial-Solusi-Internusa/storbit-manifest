// src/modules/crm/lead/components/LeadStageBar.jsx
// Batang tahapan Detail Lead -- design-handoff/crm-2026-10-11/Lead Management.dc.html
// StageBar + shots/lead/16-detail-overview-sales.png. Batch DS 3 Lead
// Management, irisan 7 Bagian 1 (KOREKSI atas versi "kotak datar" irisan
// sebelumnya -- mockup berbentuk PANAH/chevron, bukan segmen rata).
//
// SENGAJA BUKAN kit StatusBar (clip-path/ukuran beda) -- spec diberikan Den
// persis: clip-path segmen pertama TANPA takik kiri, segmen berikutnya
// DENGAN takik kiri (mengunci ke ujung kanan segmen sebelumnya) +
// margin-left -8px. Warna/token SAMA dengan versi lama (sudah diverifikasi
// cocok persis dengan DOM mockup): ACCENT/ACCENT_2/HEAD_BG + INK/INK_FAINT,
// nol hex baru.
//
// Status 'lost' MENGGANTIKAN bar sepenuhnya (bukan ditambahkan di ujung
// kanan seperti StatusBar.closed) dengan Badge tone="danger" + teks
// "Lost at <tahap>". <tahap> diturunkan dari qualified_at (tanpa kolom
// baru): belum pernah qualified_at -> "Raw", sudah -> "Qualified". Kasus
// lost setelah Converted (punya inquiry) belum punya acuan visual mockup
// yang jelas -- lihat laporan akhir.
import { Badge } from '../../../../kit';
import { ACCENT, ACCENT_2, HEAD_BG, INK, INK_FAINT, INK_SOFT, FONT_HEAD, FONT_BODY } from '../../../../kit/tokens';

const SEGMENTS = [
  { id: 'raw', label: 'Raw' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'converted', label: 'Converted' },
  { id: 'customer', label: 'Customer' },
];

const CLIP_FIRST = 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)';
const CLIP_REST = 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)';

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
    <div style={{ display: 'flex' }}>
      {SEGMENTS.map((s, i) => {
        const isPast = idx > -1 && i < idx;
        const isActive = i === idx;
        const bg = isPast ? ACCENT : isActive ? ACCENT_2 : HEAD_BG;
        const color = isPast || isActive ? INK : INK_FAINT;
        return (
          <div key={s.id} style={{
            flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 20px', background: bg, color, fontWeight: isActive ? 700 : 600,
            fontSize: 12.5, fontFamily: FONT_HEAD, whiteSpace: 'nowrap',
            clipPath: i === 0 ? CLIP_FIRST : CLIP_REST,
            marginLeft: i === 0 ? 0 : -8,
          }}>
            {s.label}
          </div>
        );
      })}
    </div>
  );
}
