// src/modules/crm/RateSheetPDF.jsx
// Customer-facing Rate List brochure (landscape), built with @react-pdf/renderer.
// Columns & rows are dynamic (from rate_sheets.columns / rate_sheets.rows).
// Brand: navy #144682, orange #E85A1E, cream #F6EFE3. No registered fonts —
// Helvetica / Helvetica-Bold + Courier (mono), matching QuotationPDF/InquiryPDF.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const CREAM = '#F6EFE3';
const INK = '#1B1B1B';
const MUTE = '#6B7280';
const LINE = '#E4DCCB';
// Logo: MSI for all entities (per brief).
const LOGO_URL = 'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 34, fontFamily: 'Helvetica', fontSize: 9, color: INK },

  // Header band
  header: { backgroundColor: NAVY, paddingVertical: 16, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { height: 40, width: 40, objectFit: 'contain' },
  coName: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#fff' },
  coSub: { fontSize: 8, color: '#C7D3E8', marginTop: 2 },
  hRight: { alignItems: 'flex-end' },
  hLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 2, color: ORANGE },
  hCode: { fontFamily: 'Courier', fontSize: 9, color: '#C7D3E8', marginTop: 4 },
  orangeRule: { height: 3, backgroundColor: ORANGE },

  // Title + meta
  titleRow: { paddingTop: 16, paddingBottom: 12, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: LINE },
  tLabel: { fontSize: 8, letterSpacing: 1.2, color: MUTE, fontFamily: 'Helvetica-Bold' },
  tName: { fontFamily: 'Helvetica-Bold', fontSize: 17, color: INK, marginTop: 3 },
  metaWrap: { flexDirection: 'row', gap: 26 },
  metaItem: { alignItems: 'flex-end' },
  metaLabel: { fontSize: 7.5, letterSpacing: 1, color: MUTE, fontFamily: 'Helvetica-Bold' },
  metaVal: { fontFamily: 'Courier', fontSize: 11, marginTop: 3, color: INK },
  metaValAccent: { color: ORANGE },

  // Table
  tableWrap: { paddingHorizontal: 28, paddingTop: 12 },
  thRow: { flexDirection: 'row', backgroundColor: CREAM, borderBottomWidth: 1.5, borderBottomColor: NAVY },
  th: { paddingVertical: 5, paddingHorizontal: 5, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: NAVY },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  td: { paddingVertical: 4, paddingHorizontal: 5, fontSize: 7.5, color: INK },
  tdRoute: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY },
  tdMono: { fontFamily: 'Courier', fontSize: 7.5, color: INK },
  tdFree: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: NAVY },

  // Note strip
  noteStrip: { marginTop: 12, marginHorizontal: 28, backgroundColor: CREAM, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingVertical: 8, paddingHorizontal: 12 },
  noteText: { fontSize: 8.5, color: '#5B4636', lineHeight: 1.5 },
  noteLabel: { fontFamily: 'Helvetica-Bold', color: NAVY },

  // Footer (sales + signature)
  footer: { marginTop: 18, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  fLabel: { fontSize: 8, letterSpacing: 1, color: MUTE, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  fName: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: NAVY },
  fRole: { fontSize: 9, color: MUTE, marginTop: 2 },
  fContact: { fontFamily: 'Courier', fontSize: 8.5, color: INK, marginTop: 5, lineHeight: 1.4 },
  sigWrap: { alignItems: 'center', width: 220 },
  sigHello: { fontSize: 8.5, color: MUTE, marginBottom: 34 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: INK, width: 200, marginBottom: 5 },
  sigName: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: INK },
  sigEntity: { fontSize: 8.5, color: MUTE, marginTop: 1 },

  // Bottom bar (fixed)
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: NAVY, paddingVertical: 8, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between' },
  bottomText: { fontFamily: 'Courier', fontSize: 8, color: '#C7D3E8' },
});

export default function RateSheetPDF({ sheet, company, creator }) {
  if (!sheet) return null;
  const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const entityName = company?.name || 'PT Milenial Solusi Internusa';
  const entityCode = company?.code || 'MSI';
  const year = (sheet.created_at ? new Date(sheet.created_at) : new Date()).getFullYear?.() || new Date().getFullYear();
  const salesName = creator?.full_name || '—';
  const salesRole = creator?.positions?.name || 'Sales Representative';
  const salesPhone = creator?.phone || '';
  const salesEmail = creator?.email || '';
  const colW = columns.length ? `${100 / columns.length}%` : '100%';

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header band */}
        <View style={styles.header} fixed>
          <View style={styles.hLeft}>
            <Image src={LOGO_URL} style={styles.logo} />
            <View>
              <Text style={styles.coName}>{entityName}</Text>
              <Text style={styles.coSub}>Freight Forwarding &amp; Logistics · MSI Group</Text>
            </View>
          </View>
          <View style={styles.hRight}>
            <Text style={styles.hLabel}>RATE LIST</Text>
            <Text style={styles.hCode}>{entityCode}/RATE/{year}</Text>
          </View>
        </View>
        <View style={styles.orangeRule} fixed />

        {/* Title + meta */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.tLabel}>NAMA RATE</Text>
            <Text style={styles.tName}>{sheet.rate_name || '—'}</Text>
          </View>
          <View style={styles.metaWrap}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>TANGGAL DIBUAT</Text>
              <Text style={styles.metaVal}>{fmtDate(sheet.created_at)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>BERLAKU SAMPAI</Text>
              <Text style={[styles.metaVal, styles.metaValAccent]}>{sheet.valid_until ? fmtDate(sheet.valid_until) : '—'}</Text>
            </View>
          </View>
        </View>

        {/* Rate table */}
        <View style={styles.tableWrap}>
          {/* Column headers */}
          <View style={styles.thRow}>
            {columns.map((h, ci) => (
              <Text key={ci} style={[styles.th, { width: colW }]}>{String(h ?? '')}</Text>
            ))}
          </View>
          {/* Rows */}
          {rows.map((row, ri) => (
            <View key={ri} style={[styles.tr, { backgroundColor: ri % 2 ? '#FBF8F1' : '#fff' }]} wrap={false}>
              {columns.map((_, ci) => {
                const cell = String(row?.[ci] ?? '');
                const isRoute = ci === 0 || ci === 1;
                const isFree = cell.trim().toUpperCase() === 'FREE';
                const cellStyle = isFree ? styles.tdFree : (isRoute ? styles.tdRoute : styles.tdMono);
                return <Text key={ci} style={[styles.td, cellStyle, { width: colW }]}>{cell}</Text>;
              })}
            </View>
          ))}
        </View>

        {/* Note strip */}
        {sheet.note ? (
          <View style={styles.noteStrip} wrap={false}>
            <Text style={styles.noteText}><Text style={styles.noteLabel}>Catatan: </Text>{sheet.note}</Text>
          </View>
        ) : null}

        {/* Footer: sales + signature */}
        <View style={styles.footer} wrap={false}>
          <View>
            <Text style={styles.fLabel}>DISIAPKAN OLEH</Text>
            <Text style={styles.fName}>{salesName}</Text>
            <Text style={styles.fRole}>{salesRole} · {entityCode}</Text>
            {(salesPhone || salesEmail) ? (
              <Text style={styles.fContact}>{salesPhone}{salesPhone && salesEmail ? '\n' : ''}{salesEmail}</Text>
            ) : null}
          </View>
          <View style={styles.sigWrap}>
            <Text style={styles.sigHello}>Hormat kami,</Text>
            <View style={styles.sigLine} />
            <Text style={styles.sigName}>{salesName}</Text>
            <Text style={styles.sigEntity}>{entityName}</Text>
          </View>
        </View>

        {/* Bottom bar (fixed) */}
        <View style={styles.bottomBar} fixed>
          <Text style={styles.bottomText}>{entityName}</Text>
          <Text style={styles.bottomText}>Digenerate dari Nexus by MSI · {fmtDate(new Date().toISOString())}</Text>
        </View>
      </Page>
    </Document>
  );
}
