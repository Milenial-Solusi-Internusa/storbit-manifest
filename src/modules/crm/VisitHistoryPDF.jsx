// src/modules/crm/VisitHistoryPDF.jsx
// Riwayat Visit report PDF (@react-pdf/renderer). Pola mengikuti ActivityReportPDF.
// Props:
//   meta    = { periodLabel, salesLabel, generatedAt }
//   summary = { total, scheduled, completed, cancelled }
//   rows    = [{ scheduled_for, activity_time, salesName, customer, status, entity, mom }]
// Brand cetak: navy #144682 (band + table head), orange #E85A1E (accent).

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const INK = '#1F2937';
const GRAY = '#6B7280';
const LINE = '#E5E7EB';
const ZEBRA = '#F7F8FA';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const STATUS_LABEL = { scheduled: 'Terjadwal', completed: 'Selesai', cancelled: 'Dibatalkan' };
const STATUS_COLOR = { scheduled: '#B45309', completed: '#0F766E', cancelled: '#6B7280' };

function fmtDate(r) {
  if (!r.scheduled_for) return '—';
  const d = new Date(r.scheduled_for);
  if (isNaN(d.getTime())) return String(r.scheduled_for);
  const t = r.activity_time ? ' ' + String(r.activity_time).slice(0, 5) : '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}${t}`;
}
// column widths (sum 100%)
const COLS = { no: '4%', date: '15%', sales: '15%', cust: '22%', status: '11%', ent: '8%', mom: '25%' };
// recap-per-sales column widths (sum 100%)
const RCOLS = { sales: '40%', total: '15%', sched: '15%', done: '15%', canc: '15%' };

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

  sectionLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  recapTotalRow: { flexDirection: 'row', backgroundColor: '#EEF2F8', borderTopWidth: 1.5, borderColor: NAVY },
});

function Kpi({ label, value, color, last }) {
  return (
    <View style={[styles.kpiCard, last ? { marginRight: 0 } : null]}>
      <Text style={[styles.kpiNum, { color: color || NAVY }]}>{(value ?? 0).toLocaleString('id-ID')}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function VisitHistoryPDF({ meta = {}, summary = {}, rows = [] }) {
  // Rekap per sales — dari `rows` yang SAMA (sudah tersaring sesuai filter aktif).
  const recapMap = {};
  rows.forEach(r => {
    const name = r.salesName || '—';
    if (!recapMap[name]) recapMap[name] = { name, total: 0, scheduled: 0, completed: 0, cancelled: 0 };
    recapMap[name].total += 1;
    if (r.status === 'scheduled') recapMap[name].scheduled += 1;
    else if (r.status === 'completed') recapMap[name].completed += 1;
    else if (r.status === 'cancelled') recapMap[name].cancelled += 1;
  });
  const recap = Object.values(recapMap).sort((a, b) => b.total - a.total);
  const recapTotal = recap.reduce((acc, s) => ({
    total: acc.total + s.total, scheduled: acc.scheduled + s.scheduled,
    completed: acc.completed + s.completed, cancelled: acc.cancelled + s.cancelled,
  }), { total: 0, scheduled: 0, completed: 0, cancelled: 0 });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.band}>
          <View>
            <Text style={styles.brand}>Nexus by MSI</Text>
            <Text style={styles.brandSub}>PT Milenial Solusi Internusa</Text>
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Riwayat Visit Sales</Text>
            <View style={styles.titleBar} />
          </View>
        </View>

        <View style={styles.subRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Periode</Text>
            <Text style={styles.metaVal}>{meta.periodLabel || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Sales</Text>
            <Text style={styles.metaVal}>{meta.salesLabel || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Dibuat</Text>
            <Text style={styles.metaVal}>{meta.generatedAt || '—'}</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <Kpi label="Total Visit" value={summary.total} color={NAVY} />
          <Kpi label="Terjadwal" value={summary.scheduled} color="#B45309" />
          <Kpi label="Selesai" value={summary.completed} color="#0F766E" />
          <Kpi label="Dibatalkan" value={summary.cancelled} color="#6B7280" last />
        </View>

        {/* Rekap per Sales — konsisten dgn tabel detail (rows tersaring) */}
        <Text style={styles.sectionLabel}>Rekap per Sales</Text>
        <View style={styles.th}>
          <Text style={[styles.thCell, { width: RCOLS.sales }]}>Sales</Text>
          <Text style={[styles.thCell, { width: RCOLS.total, textAlign: 'right' }]}>Total</Text>
          <Text style={[styles.thCell, { width: RCOLS.sched, textAlign: 'right' }]}>Terjadwal</Text>
          <Text style={[styles.thCell, { width: RCOLS.done, textAlign: 'right' }]}>Selesai</Text>
          <Text style={[styles.thCell, { width: RCOLS.canc, textAlign: 'right' }]}>Dibatalkan</Text>
        </View>
        {recap.length === 0 && <Text style={styles.empty}>Tidak ada data.</Text>}
        {recap.map((s, i) => (
          <View key={s.name} style={[styles.tr, i % 2 ? { backgroundColor: ZEBRA } : null]} wrap={false}>
            <Text style={[styles.td, { width: RCOLS.sales }]}>{s.name}</Text>
            <Text style={[styles.td, { width: RCOLS.total, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{s.total}</Text>
            <Text style={[styles.tdMuted, { width: RCOLS.sched, textAlign: 'right' }]}>{s.scheduled}</Text>
            <Text style={[styles.tdMuted, { width: RCOLS.done, textAlign: 'right' }]}>{s.completed}</Text>
            <Text style={[styles.tdMuted, { width: RCOLS.canc, textAlign: 'right' }]}>{s.cancelled}</Text>
          </View>
        ))}
        {recap.length > 0 && (
          <View style={styles.recapTotalRow} wrap={false}>
            <Text style={[styles.td, { width: RCOLS.sales, fontFamily: 'Helvetica-Bold' }]}>Total</Text>
            <Text style={[styles.td, { width: RCOLS.total, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{recapTotal.total}</Text>
            <Text style={[styles.td, { width: RCOLS.sched, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{recapTotal.scheduled}</Text>
            <Text style={[styles.td, { width: RCOLS.done, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{recapTotal.completed}</Text>
            <Text style={[styles.td, { width: RCOLS.canc, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{recapTotal.cancelled}</Text>
          </View>
        )}

        {/* Detail visit */}
        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Detail Visit</Text>
        <View style={styles.th} fixed>
          <Text style={[styles.thCell, { width: COLS.no, textAlign: 'center' }]}>No</Text>
          <Text style={[styles.thCell, { width: COLS.date }]}>Tanggal</Text>
          <Text style={[styles.thCell, { width: COLS.sales }]}>Sales</Text>
          <Text style={[styles.thCell, { width: COLS.cust }]}>Customer/Prospek</Text>
          <Text style={[styles.thCell, { width: COLS.status }]}>Status</Text>
          <Text style={[styles.thCell, { width: COLS.ent }]}>Entitas</Text>
          <Text style={[styles.thCell, { width: COLS.mom }]}>MOM</Text>
        </View>

        {rows.length === 0 && <Text style={styles.empty}>Tidak ada visit pada periode & filter ini.</Text>}
        {rows.map((r, i) => (
          <View key={r.id || i} style={[styles.tr, i % 2 ? { backgroundColor: ZEBRA } : null]}>
            <Text style={[styles.tdMuted, { width: COLS.no, textAlign: 'center' }]}>{i + 1}</Text>
            <Text style={[styles.tdMuted, { width: COLS.date }]}>{fmtDate(r)}</Text>
            <Text style={[styles.td, { width: COLS.sales }]}>{r.salesName || '—'}</Text>
            <Text style={[styles.td, { width: COLS.cust }]}>{r.customer || '—'}</Text>
            <Text style={[styles.td, { width: COLS.status, color: STATUS_COLOR[r.status] || INK, fontFamily: 'Helvetica-Bold' }]}>
              {STATUS_LABEL[r.status] || r.status || '—'}
            </Text>
            <Text style={[styles.tdMuted, { width: COLS.ent }]}>{r.entity || '—'}</Text>
            <Text style={[styles.tdMuted, { width: COLS.mom }]}>{r.mom ? String(r.mom).trim() : '—'}</Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerTxt} render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
          <Text style={styles.footerTxt}>Generated by Nexus by MSI</Text>
        </View>
      </Page>
    </Document>
  );
}
