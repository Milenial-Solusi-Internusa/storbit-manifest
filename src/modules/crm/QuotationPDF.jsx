// src/modules/crm/QuotationPDF.jsx
// Customer-facing quotation PDF, built with @react-pdf/renderer (vector/text,
// automatic pagination). Replaces the old html2canvas+jsPDF raster pipeline.
// IMPORTANT: customer-facing only — NEVER render cost_price, margin/gross profit,
// or internal_notes here.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const LOGO_URL = 'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png';
const VAT_RATE = 0.011;

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight Forwarding',
  customs:            'Customs Clearance',
  trading:            'General Trading',
};

// id-ID number without the "Rp" prefix (callers add "Rp " where needed).
const rpN = (n) => (Number(n) || 0).toLocaleString('id-ID');
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 96, fontFamily: 'Helvetica', fontSize: 9, color: '#333' },

  // [1] Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 12, marginBottom: 16 },
  logo: { height: 36, marginBottom: 6, objectFit: 'contain' },
  coName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },
  tagline: { fontSize: 7.5, color: '#777', marginTop: 3 },
  hRight: { alignItems: 'flex-end' },
  quoTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: NAVY },
  hNo: { fontSize: 10, color: '#333', marginTop: 5 },
  hLine: { fontSize: 9, color: '#555', marginTop: 3 },

  // [2] Customer details
  custTable: { marginBottom: 18, borderWidth: 1, borderColor: '#1a5299' },
  custHeadRow: { backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 10 },
  custHeadText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 1 },
  custRow: { flexDirection: 'row' },
  custLabel: { width: '18%', backgroundColor: NAVY, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8.5, padding: 5, borderWidth: 0.5, borderColor: '#1a5299' },
  custValue: { width: '32%', backgroundColor: '#f9f9f7', fontSize: 8.5, padding: 5, borderWidth: 0.5, borderColor: '#ddd' },

  // [3] Item tables
  secWrap: { marginBottom: 14 },
  secNameRow: { backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 0.5, borderColor: NAVY },
  secNameText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 0.5 },
  row: { flexDirection: 'row' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, padding: 5, borderWidth: 0.5, borderColor: '#ddd' },
  td: { fontSize: 8, padding: 5, borderWidth: 0.5, borderColor: '#ddd' },
  colHeadRow: { backgroundColor: '#f0f0eb' },
  secTotalRow: { backgroundColor: '#f5f5f0' },
  cDesc:  { width: '35%' },
  cCur:   { width: '8%',  textAlign: 'center' },
  cPrice: { width: '14%', textAlign: 'right' },
  cUnit:  { width: '14%', textAlign: 'center' },
  cQty:   { width: '8%',  textAlign: 'center' },
  cTotal: { width: '21%', textAlign: 'right' },

  // [4] Grand summary
  summaryWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  summaryTable: { width: 250 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 8 },
  sumLabel: { fontSize: 9, color: '#555' },
  sumVal: { fontSize: 9, textAlign: 'right' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 2, borderTopColor: NAVY, marginTop: 2 },
  grandLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  grandVal: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right' },

  // [5]/[6] Notes & Terms boxes
  noteBox:  { marginTop: 16, borderWidth: 1, borderColor: '#ddd', borderLeftWidth: 3, borderLeftColor: NAVY, backgroundColor: '#F8FAFC', padding: 10 },
  termsBox: { marginTop: 16, borderWidth: 1, borderColor: '#ddd', borderLeftWidth: 3, borderLeftColor: ORANGE, backgroundColor: '#FBF8F2', padding: 10 },
  noteTitle:  { fontFamily: 'Helvetica-Bold', color: NAVY, fontSize: 9, marginBottom: 4 },
  termsTitle: { fontFamily: 'Helvetica-Bold', color: ORANGE, fontSize: 9, marginBottom: 4 },
  noteText: { fontSize: 8.5, color: '#555', lineHeight: 1.5 },

  // [7] Signatures
  sigWrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  sigColRight: { alignItems: 'center' },
  sigLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  sigLine: { marginTop: 40, borderTopWidth: 1, borderTopColor: '#333', width: 180, paddingTop: 4, fontSize: 9 },
  sigSub: { fontSize: 9, color: '#666' },

  // [8] Divider
  divider: { flexDirection: 'row', marginTop: 28, height: 3 },
  divOrange: { width: '8%', backgroundColor: ORANGE },
  divNavy: { width: '92%', backgroundColor: NAVY },

  // [9] Footer (fixed)
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: NAVY, paddingVertical: 14, paddingHorizontal: 28, flexDirection: 'row' },
  footCol: { width: '50%', paddingRight: 16 },
  footCoName: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#fff', marginBottom: 4 },
  footLine: { fontSize: 7.5, color: '#fff', lineHeight: 1.4 },
  footHours: { fontSize: 7.5, color: '#FFB899', marginTop: 3 },
});

export default function QuotationPDF({ quot, items = [], sections = [], creatorProfile }) {
  if (!quot) return null;

  const clientName = quot.prospect?.name || quot.customer?.name || '-';
  const picEmail   = quot.prospect?.pic_email || quot.customer?.email || '-';
  const picPhone   = quot.prospect?.pic_phone || quot.customer?.phone || '-';
  const custAddr   = [quot.prospect?.address || quot.customer?.address, quot.prospect?.city || quot.customer?.city].filter(Boolean).join(', ') || '-';
  const marketingName = creatorProfile?.full_name || '-';
  const positionName  = creatorProfile?.positions?.name || 'Marketing Executive';
  const inquiryStr = [SERVICE_TYPE_LABELS[quot.service_type] || quot.service_type, quot.route].filter(Boolean).join(' - ') || '-';
  const dateStr  = fmtDateShort(quot.quote_date || quot.created_at);
  const validStr = fmtDateShort(quot.valid_until);

  // Totals — prefer stored values, fall back to derived (mirror on-screen PDF).
  const subtotalCalc = items.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const subtotal     = quot.subtotal ?? subtotalCalc;
  const discountPct    = Number(quot.discount_pct) || 0;
  const discountAmount = Math.round(subtotal * discountPct / 100);
  const tax        = quot.tax_amount   ?? Math.round((subtotal - discountAmount) * VAT_RATE);
  const grandTotal = quot.total_amount ?? ((subtotal - discountAmount) + tax);

  const custRows = [
    ['TO',       clientName, 'MARKETING', marketingName],
    ['ADDRESS',  custAddr,   'EMAIL',     picEmail],
    ['QUO. NO.', quot.quotation_no || '-', 'MOBILE', picPhone],
    ['INQUIRY',  inquiryStr, 'OFFICE',    '+62 21-3970-7558/9'],
    ['DATE',     dateStr,    'VALIDITY',  validStr],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* [1] Header — first page only (not fixed) */}
        <View style={styles.header}>
          <View>
            <Image src={LOGO_URL} style={styles.logo} />
            <Text style={styles.coName}>PT. Milenial Solusi Internusa</Text>
            <Text style={styles.tagline}>SEA FREIGHT · NVOCC · DOMESTIC · LEGALITY · AIRFREIGHT · CUSTOM</Text>
          </View>
          <View style={styles.hRight}>
            <Text style={styles.quoTitle}>QUOTATION</Text>
            <Text style={styles.hNo}>{quot.quotation_no}{quot.revision ? ` Rev.${quot.revision}` : ''}</Text>
            <Text style={styles.hLine}>Tanggal: {dateStr}</Text>
            <Text style={styles.hLine}>Valid: {validStr}</Text>
          </View>
        </View>

        {/* [2] Customer details */}
        <View style={styles.custTable}>
          <View style={styles.custHeadRow}>
            <Text style={styles.custHeadText}>CUSTOMER DETAILS :</Text>
          </View>
          {custRows.map(([l1, v1, l2, v2]) => (
            <View key={l1} style={styles.custRow}>
              <Text style={styles.custLabel}>{l1}</Text>
              <Text style={styles.custValue}>{v1}</Text>
              <Text style={styles.custLabel}>{l2}</Text>
              <Text style={styles.custValue}>{v2}</Text>
            </View>
          ))}
          <View style={styles.custRow}>
            <Text style={styles.custLabel}>APPROVED BY</Text>
            <Text style={styles.custValue}> </Text>
            <Text style={styles.custLabel}>APPROVAL DATE</Text>
            <Text style={styles.custValue}> </Text>
          </View>
        </View>

        {/* [3] Item tables — one View per section */}
        {sections.map((sec, si) => (
          <View key={si} style={styles.secWrap}>
            {/* Section name + column header stay together */}
            <View wrap={false}>
              <View style={styles.secNameRow}>
                <Text style={styles.secNameText}>{sec.name}</Text>
              </View>
              <View style={[styles.row, styles.colHeadRow]}>
                <Text style={[styles.th, styles.cDesc]}>DESCRIPTION</Text>
                <Text style={[styles.th, styles.cCur]}>CUR</Text>
                <Text style={[styles.th, styles.cPrice]}>PRICE</Text>
                <Text style={[styles.th, styles.cUnit]}>UNIT</Text>
                <Text style={[styles.th, styles.cQty]}>QTY</Text>
                <Text style={[styles.th, styles.cTotal]}>TOTAL (IDR)</Text>
              </View>
            </View>
            {sec.rows.map((r, ri) => (
              <View key={r.id || ri} wrap={false} style={[styles.row, { backgroundColor: ri % 2 === 0 ? '#fff' : '#fafaf8' }]}>
                <Text style={[styles.td, styles.cDesc]}>{r.description || '—'}</Text>
                <Text style={[styles.td, styles.cCur, r.currency === 'USD' ? { color: '#a45a22' } : null]}>{r.currency || 'IDR'}</Text>
                <Text style={[styles.td, styles.cPrice]}>{rpN(r.unit_price)}</Text>
                <Text style={[styles.td, styles.cUnit]}>{r.unit_label || '—'}</Text>
                <Text style={[styles.td, styles.cQty]}>{r.qty || 1}</Text>
                <Text style={[styles.td, styles.cTotal, { fontFamily: 'Helvetica-Bold' }]}>Rp {rpN(r.total)}</Text>
              </View>
            ))}
            <View wrap={false} style={[styles.row, styles.secTotalRow]}>
              <Text style={[styles.td, { width: '79%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>Section Total:</Text>
              <Text style={[styles.td, styles.cTotal, { fontFamily: 'Helvetica-Bold' }]}>Rp {rpN(sec.total)}</Text>
            </View>
          </View>
        ))}

        {/* [4] Grand summary */}
        <View style={styles.summaryWrap} wrap={false}>
          <View style={styles.summaryTable}>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Subtotal</Text>
              <Text style={styles.sumVal}>Rp {rpN(subtotal)}</Text>
            </View>
            {discountPct > 0 && (
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Diskon ({discountPct}%)</Text>
                <Text style={styles.sumVal}>−Rp {rpN(discountAmount)}</Text>
              </View>
            )}
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>VAT 1.1%</Text>
              <Text style={styles.sumVal}>Rp {rpN(tax)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>GRAND TOTAL</Text>
              <Text style={styles.grandVal}>Rp {rpN(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* [5] Notes */}
        {quot.notes ? (
          <View style={styles.noteBox} wrap={false}>
            <Text style={styles.noteTitle}>Notes</Text>
            <Text style={styles.noteText}>{quot.notes}</Text>
          </View>
        ) : null}

        {/* [6] Terms / Above rates */}
        {quot.terms ? (
          <View style={styles.termsBox} wrap={false}>
            <Text style={styles.termsTitle}>Above rates :</Text>
            <Text style={styles.noteText}>{quot.terms}</Text>
          </View>
        ) : null}

        {/* [7] Signatures */}
        <View style={styles.sigWrap} wrap={false}>
          <View>
            <Text style={styles.sigLabel}>Best Regards,</Text>
            <Text style={styles.sigLine}>{marketingName} - {positionName}</Text>
            <Text style={styles.sigSub}>PT. Milenial Solusi Internusa</Text>
          </View>
          <View style={styles.sigColRight}>
            <Text style={styles.sigLabel}>Approved by,</Text>
            <Text style={styles.sigLine}>Customer Representative</Text>
            <Text style={styles.sigSub}>{clientName}</Text>
          </View>
        </View>

        {/* [8] Divider */}
        <View style={styles.divider} wrap={false}>
          <View style={styles.divOrange} />
          <View style={styles.divNavy} />
        </View>

        {/* [9] Footer — fixed (every page), text-only logo */}
        <View style={styles.footer} fixed>
          <View style={styles.footCol}>
            <Text style={styles.footCoName}>PT Milenial Solusi Internusa</Text>
            <Text style={styles.footLine}>Latinos Business District</Text>
            <Text style={styles.footLine}>Blok C9 No. 12-15 Jl. Raya Rawa Buntu</Text>
            <Text style={styles.footLine}>Kota Tangerang Selatan, Banten 15310</Text>
            <Text style={styles.footHours}>Senin - Jumat, 08:00 AM - 05:00 PM</Text>
          </View>
          <View style={styles.footCol}>
            <Text style={styles.footCoName}> </Text>
            <Text style={styles.footLine}>Sentra 22, Jl. Cakung Cilincing Raya, No. 22D</Text>
            <Text style={styles.footLine}>Cilincing, Kota Jakarta Utara, Jakarta 14130</Text>
            <Text style={styles.footHours}>Senin - Jumat, 08:00 AM - 05:00 PM</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
