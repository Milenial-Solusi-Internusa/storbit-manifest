// src/modules/crm/ActivityReportPDF.jsx
// CRM Sales Activity report PDF, built with @react-pdf/renderer (vector/text,
// auto pagination). Consumed by CRMReportPage "Export PDF". Props:
//   meta    = { periodLabel, salesLabel, generatedAt }
//   summary = { total, done, pending, overdue, cancelled }
//   rows    = [{ scheduled_for, activity_time, type, status, customer, salesName, note }]
// Brand: navy #144682 (header band, table head), orange #E85A1E (accent).

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const INK = '#1F2937';
const GRAY = '#6B7280';
const LINE = '#E5E7EB';
const ZEBRA = '#F7F8FA';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const STATUS_LABEL = { Done: 'Selesai', Pending: 'Pending', Overdue: 'Overdue', Cancelled: 'Dibatalkan' };
const STATUS_COLOR = { Done: '#0F766E', Pending: '#B45309', Overdue: '#B91C1C', Cancelled: '#6B7280' };

function fmtDate(r) {
  if (!r.scheduled_for) return '—';
  const d = new Date(r.scheduled_for);
  if (isNaN(d.getTime())) return String(r.scheduled_for);
  const t = r.activity_time ? ' ' + String(r.activity_time).slice(0, 5) : '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}${t}`;
}

// column widths (sum 100%)
const COLS = {
  no: '4%', date: '11%', type: '9%', status: '12%', cust: '22%', sales: '16%', note: '26%',
};

const styles = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 52, paddingHorizontal: 26, fontFamily: 'Helvetica', fontSize: 9, color: INK },

  band: { backgroundColor: NAVY, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  brand: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  brandSub: { color: '#CDDDF0', fontSize: 7.5, marginTop: 2 },
  titleWrap: { alignItems: 'flex-end' },
  title: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Helvetica-Bold' },
  titleBar: { marginTop: 4, height: 3, width: 56, backgroundColor: ORANGE, borderRadius: 2 },

  subRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  metaItem: { marginRight: 22, marginBottom: 2 },
  metaLabel: { fontSize: 7, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaVal: { fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold', marginTop: 1 },

  kpiRow: { flexDirection: 'row', marginBottom: 14 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 8, marginRight: 6 },
  kpiNum: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  kpiLabel: { fontSize: 7, color: GRAY, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  th: { flexDirection: 'row', backgroundColor: NAVY, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  thCell: { color: '#FFFFFF', fontSize: 7.5, fontFamily: 'Helvetica-Bold', paddingVertical: 5, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE },
  td: { fontSize: 8, paddingVertical: 4, paddingHorizontal: 4, color: INK },
  tdMuted: { fontSize: 8, paddingVertical: 4, paddingHorizontal: 4, color: GRAY },

  footer: { position: 'absolute', bottom: 18, left: 26, right: 26, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: LINE, paddingTop: 6 },
  footerTxt: { fontSize: 7.5, color: GRAY },

  empty: { padding: 24, textAlign: 'center', color: GRAY, fontSize: 10 },
});

function Kpi({ label, value, color, last }) {
  return (
    <View style={[styles.kpiCard, last ? { marginRight: 0 } : null]}>
      <Text style={[styles.kpiNum, { color: color || NAVY }]}>{(value ?? 0).toLocaleString('id-ID')}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function ActivityReportPDF({ meta = {}, summary = {}, rows = [] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* header band (page 1 only) */}
        <View style={styles.band}>
          <View>
            <Text style={styles.brand}>Nexus by MSI</Text>
            <Text style={styles.brandSub}>PT Milenial Solusi Internusa</Text>
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Laporan Aktivitas Sales</Text>
            <View style={styles.titleBar} />
          </View>
        </View>

        {/* sub-header meta */}
        <View style={styles.subRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Periode</Text>
            <Text style={styles.metaVal}>{meta.periodLabel || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Salesperson</Text>
            <Text style={styles.metaVal}>{meta.salesLabel || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Dibuat</Text>
            <Text style={styles.metaVal}>{meta.generatedAt || '—'}</Text>
          </View>
        </View>

        {/* KPI summary */}
        <View style={styles.kpiRow}>
          <Kpi label="Total" value={summary.total} color={NAVY} />
          <Kpi label="Selesai" value={summary.done} color="#0F766E" />
          <Kpi label="Pending" value={summary.pending} color="#B45309" />
          <Kpi label="Overdue" value={summary.overdue} color="#B91C1C" />
          <Kpi label="Dibatalkan" value={summary.cancelled} color="#6B7280" last />
        </View>

        {/* table header (repeats each page) */}
        <View style={styles.th} fixed>
          <Text style={[styles.thCell, { width: COLS.no, textAlign: 'center' }]}>No</Text>
          <Text style={[styles.thCell, { width: COLS.date }]}>Tanggal</Text>
          <Text style={[styles.thCell, { width: COLS.type }]}>Tipe</Text>
          <Text style={[styles.thCell, { width: COLS.status }]}>Status</Text>
          <Text style={[styles.thCell, { width: COLS.cust }]}>Customer/Prospek</Text>
          <Text style={[styles.thCell, { width: COLS.sales }]}>Sales</Text>
          <Text style={[styles.thCell, { width: COLS.note }]}>Catatan</Text>
        </View>

        {/* rows */}
        {rows.length === 0 && <Text style={styles.empty}>Tidak ada aktivitas pada periode & filter ini.</Text>}
        {rows.map((r, i) => (
          <View key={r.id || i} style={[styles.tr, i % 2 ? { backgroundColor: ZEBRA } : null]} wrap={false}>
            <Text style={[styles.tdMuted, { width: COLS.no, textAlign: 'center' }]}>{i + 1}</Text>
            <Text style={[styles.tdMuted, { width: COLS.date }]}>{fmtDate(r)}</Text>
            <Text style={[styles.td, { width: COLS.type }]}>{r.type || '—'}</Text>
            <Text style={[styles.td, { width: COLS.status, color: STATUS_COLOR[r.status] || INK, fontFamily: 'Helvetica-Bold' }]}>
              {STATUS_LABEL[r.status] || r.status || '—'}
            </Text>
            <Text style={[styles.td, { width: COLS.cust }]}>{r.customer || '—'}</Text>
            <Text style={[styles.tdMuted, { width: COLS.sales }]}>{r.salesName || '—'}</Text>
            <Text style={[styles.tdMuted, { width: COLS.note }]}>{r.note || '—'}</Text>
          </View>
        ))}

        {/* footer (every page) */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerTxt} render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
          <Text style={styles.footerTxt}>Generated by Nexus by MSI</Text>
        </View>
      </Page>
    </Document>
  );
}
