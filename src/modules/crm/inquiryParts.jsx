// src/modules/crm/inquiryParts.jsx
// Putaran 16a Tahap 1 -- fork LOKAL dari tiga komponen DealPanels.jsx
// (Card, InfoRow, PriceSummaryCard) KHUSUS untuk DealDetailPage.jsx, ber-
// warna sage lewat inquiryTheme.js. DealPanels.jsx SENDIRI TIDAK DISENTUH
// (dilarang eksplisit, dan masih dipakai CustomerDetailPage.jsx/
// InquiryChatter.jsx/OwnerAssignModal.jsx/DealWonModals.jsx/
// DealCloseModals.jsx/ChangeAccountModal.jsx apa adanya).
//
// Ketiganya difork BERSAMA (bukan cuma Card+PriceSummaryCard yang disebut
// instruksi) karena PriceSummaryCard memanggil InfoRow secara internal --
// memforknya sendirian tanpa InfoRow akan membuatnya memanggil InfoRow
// DealPanels (warna lama) secara diam-diam.
//
// Isi, perilaku, dan ukuran BYTE-IDENTIK salinan asalnya -- HANYA sumber
// warna yang berubah (C object literal -> DEAL_C dari inquiryTheme.js).
// fmtRp/fmtDate TETAP diimpor dari DealPanels.jsx (fungsi murni, bukan
// warna, instruksi eksplisit). formatQuotationNo/pickActiveQuotation
// diimpor LANGSUNG dari ./quotationVersion (sumber asli DealPanels.jsx
// sendiri, bukan re-export -- DealPanels.jsx tidak mengekspor ulang
// keduanya, diverifikasi grep sebelum ditulis).
import { FileText } from 'lucide-react';
import { DEAL_C as C } from './inquiryTheme';
import { HEAD, BODY, fmtRp, fmtDate } from './DealPanels';
import { formatQuotationNo, pickActiveQuotation } from './quotationVersion';

/* ---------- Card (fork DealPanels.jsx:189-202) ---------- */
export function Card({ title, icon, right, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          {icon && <span style={{ color: C.navy, display: 'flex' }}>{icon}</span>}
          <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------- InfoRow (fork DealPanels.jsx:203-210) ---------- */
export function InfoRow({ label, value, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text, lineHeight: 1.45 }}>{value || '—'}</div>
    </div>
  );
}

/* ---------- PriceSummaryCard (fork DealPanels.jsx:643-669) ---------- */
export function PriceSummaryCard({ quotations, termMap }) {
  const accepted = quotations.find((q) => String(q.status).toUpperCase() === 'ACCEPTED');
  const best = accepted || pickActiveQuotation(quotations);
  const totals = quotations.map((q) => Number(q.total_amount || 0));
  const minT = totals.length ? Math.min(...totals) : null;
  const maxT = totals.length ? Math.max(...totals) : null;
  return (
    <Card title="Price Summary" icon={<FileText size={17} />}>
      {!best ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: C.textFaint, padding: '8px 0' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: C.navy, borderRadius: 12, padding: '14px 16px', color: C.white }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Best Quote</div>
            <div style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0' }}>{fmtRp(best.total_amount)}</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.85 }}>{formatQuotationNo(best.quotation_no, best.revision)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <InfoRow label="Valid Until" value={fmtDate(best.valid_until)} />
            <InfoRow label="Payment Terms" value={termMap?.[best.payment_terms_id]} />
            <InfoRow label="Offer Range" value={(minT != null && maxT != null) ? `${fmtRp(minT)} – ${fmtRp(maxT)}` : '—'} full />
          </div>
        </div>
      )}
    </Card>
  );
}
