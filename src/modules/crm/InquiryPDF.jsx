// src/modules/crm/InquiryPDF.jsx
// Inquiry / RFQ PDF (customer-internal form), built with @react-pdf/renderer —
// same pattern as QuotationPDF.jsx (vector/text, auto pagination, fixed footer).
// Array fields are joined to a single string (", ") because @react-pdf has no
// flex-wrap for pill rows. Empty/null → "—". All text wraps (wrap default true).
//
// Props: { inquiry, prospectName, salesName }
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const NAVY_SOFT = '#EEF3FB';
const ORANGE_SOFT = '#FDF0E9';

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight Forwarding', customs: 'Customs Clearance', trading: 'General Trading',
};
const CARGO_LABELS = {
  normal: 'Normal Cargo', dg: 'DG / Hazmat', liquid: 'Barang Cair',
  reefer: 'Reefer', oversize: 'Oversize / Overweight', permit: 'Izin Khusus',
};
const SERVICE_LABELS = {
  customs: 'Custom Clearance', warehouse: 'Warehouse', undername: 'Undername',
  insurance: 'Cargo Insurance', trucking: 'Trucking',
};

const val = (v) => (v === null || v === undefined || v === '') ? '—' : String(v);
const joinArr = (arr, map) => (Array.isArray(arr) && arr.length) ? arr.map(v => (map && map[v]) || v).join(', ') : '—';
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  page: { paddingTop: 0, paddingHorizontal: 0, paddingBottom: 70, fontFamily: 'Helvetica', fontSize: 10, color: '#1E293B' },
  body: { paddingHorizontal: 40, paddingTop: 18 },

  // header (navy band)
  header: { backgroundColor: NAVY, paddingHorizontal: 40, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hCo: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#fff', letterSpacing: 0.3 },
  hCoSub: { fontSize: 8.5, color: '#AEC3DE', marginTop: 3 },
  hRight: { alignItems: 'flex-end' },
  hBadge: { backgroundColor: ORANGE, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 0.5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 3 },
  hNo: { fontFamily: 'Courier', fontSize: 11, color: '#fff', marginTop: 6 },

  // meta strip
  metaStrip: { flexDirection: 'row', backgroundColor: '#0F3768', paddingHorizontal: 40, paddingVertical: 9 },
  metaCol: { flex: 1, paddingRight: 8 },
  metaK: { fontSize: 6.5, color: '#AEC3DE', letterSpacing: 0.6, marginBottom: 2 },
  metaV: { fontSize: 9, color: '#fff', fontFamily: 'Helvetica-Bold' },

  // section
  secBar: { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, marginBottom: 8, marginTop: 14 },
  secNum: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', color: NAVY, fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingTop: 3, marginRight: 7 },
  secTitle: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 0.4 },

  // row
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', paddingVertical: 6 },
  rLabel: { width: 140, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#475569' },
  rColon: { width: 14, fontSize: 9, color: '#94A3B8' },
  rValue: { flex: 1, fontSize: 9, color: '#1E293B' },
  vNavy: { color: NAVY, fontFamily: 'Helvetica-Bold' },

  // POL/POD boxes
  polRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  polBox: { flex: 1, padding: 9, borderRadius: 4 },
  polK: { fontSize: 6.5, letterSpacing: 0.5, marginBottom: 3 },
  polV: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  polArrow: { width: 24, textAlign: 'center', fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#94A3B8' },

  // 2-col grid
  grid: { flexDirection: 'row' },
  gcol: { flex: 1 },

  // note box
  noteBox: { borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 3, borderLeftColor: NAVY, backgroundColor: '#F8FAFC', padding: 9, marginTop: 6 },
  noteText: { fontSize: 9, color: '#475569', lineHeight: 1.5, fontStyle: 'italic' },

  // signatures
  sigWrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  sigBox: { width: '47%', borderWidth: 0.5, borderColor: '#CBD5E1', borderRadius: 4, padding: 10, minHeight: 90 },
  sigRole: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#475569' },
  sigName: { fontSize: 9, color: '#1E293B', marginTop: 4 },
  sigLine: { marginTop: 38, borderTopWidth: 0.7, borderTopColor: '#334155', paddingTop: 4, fontSize: 8, color: '#64748B' },

  // footer (fixed)
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', paddingHorizontal: 40, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between' },
  footL: { fontSize: 7.5, color: '#94A3B8' },
  footR: { fontSize: 7.5, color: '#94A3B8', fontFamily: 'Courier' },
});

function Section({ num, title }) {
  return (
    <View style={styles.secBar}>
      <Text style={styles.secNum}>{num}</Text>
      <Text style={styles.secTitle}>{title}</Text>
    </View>
  );
}
function Row({ label, value, navy }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.rLabel}>{label}</Text>
      <Text style={styles.rColon}>:</Text>
      <Text style={[styles.rValue, navy ? styles.vNavy : null]}>{value}</Text>
    </View>
  );
}

export default function InquiryPDF({ inquiry, prospectName, salesName }) {
  const inq = inquiry || {};
  const cargo = Array.isArray(inq.cargo_types) ? inq.cargo_types : [];
  const isDG = cargo.includes('dg');
  const weight = (inq.weight_kg !== null && inq.weight_kg !== undefined && inq.weight_kg !== '') ? `${inq.weight_kg} KG` : '—';
  const volume = (inq.volume_cbm !== null && inq.volume_cbm !== undefined && inq.volume_cbm !== '') ? `${inq.volume_cbm} CBM` : '—';
  const noStr = val(inq.inquiry_no);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.hCo}>Nexus by MSI</Text>
            <Text style={styles.hCoSub}>PT Milenial Solusi Internusa</Text>
          </View>
          <View style={styles.hRight}>
            <Text style={styles.hBadge}>FORM PERMINTAAN PENAWARAN</Text>
            <Text style={styles.hNo}>{noStr}</Text>
          </View>
        </View>
        <View style={styles.metaStrip} fixed>
          <View style={styles.metaCol}><Text style={styles.metaK}>TANGGAL INQUIRY</Text><Text style={styles.metaV}>{fmtDate(inq.created_at)}</Text></View>
          <View style={styles.metaCol}><Text style={styles.metaK}>DEADLINE QUOTE</Text><Text style={[styles.metaV, { color: '#FFC9AE' }]}>{fmtDate(inq.deadline_quote)}</Text></View>
          <View style={styles.metaCol}><Text style={styles.metaK}>STATUS</Text><Text style={styles.metaV}>{val(inq.status)}</Text></View>
          <View style={styles.metaCol}><Text style={styles.metaK}>JENIS LAYANAN</Text><Text style={styles.metaV}>{SERVICE_TYPE_LABELS[inq.service_type] || val(inq.service_type)}</Text></View>
        </View>

        <View style={styles.body}>
          {/* SECTION 01 */}
          <Section num="1" title="INFORMASI DASAR" />
          <Row label="Customer / Prospect" value={val(prospectName)} navy />
          <Row label="Nama Sales" value={val(salesName)} />
          <Row label="Jenis Layanan" value={SERVICE_TYPE_LABELS[inq.service_type] || val(inq.service_type)} />
          <Row label="Deadline Quote" value={fmtDate(inq.deadline_quote)} navy />

          {/* SECTION 02 */}
          <Section num="2" title="DETAIL SHIPMENT & KARGO" />
          <View style={styles.polRow}>
            <View style={[styles.polBox, { backgroundColor: NAVY_SOFT }]}>
              <Text style={[styles.polK, { color: NAVY }]}>ORIGIN — PORT OF LOADING</Text>
              <Text style={[styles.polV, { color: NAVY }]}>{val(inq.pol)}</Text>
            </View>
            <Text style={styles.polArrow}>{'→'}</Text>
            <View style={[styles.polBox, { backgroundColor: ORANGE_SOFT }]}>
              <Text style={[styles.polK, { color: ORANGE }]}>DESTINATION — PORT OF DISCHARGE</Text>
              <Text style={[styles.polV, { color: ORANGE }]}>{val(inq.pod)}</Text>
            </View>
          </View>
          <View style={styles.grid}>
            <View style={styles.gcol}>
              <Row label="Incoterm" value={joinArr(inq.incoterms)} />
              <Row label="Nama Barang (EN)" value={val(inq.goods_name)} navy />
              <Row label="Berat Total" value={weight} />
            </View>
            <View style={[styles.gcol, { marginLeft: 16 }]}>
              <Row label="Jenis Kontainer" value={joinArr(inq.container_types)} />
              <Row label="HS Code" value={val(inq.hs_code)} />
              <Row label="Volume" value={volume} />
              <Row label="Dimensi" value={val(inq.dimension)} />
            </View>
          </View>

          {/* SECTION 03 */}
          <Section num="3" title="CHECKLIST KARGO KHUSUS" />
          <Row label="Kategori Kargo" value={joinArr(inq.cargo_types, CARGO_LABELS)} />
          {isDG && (
            <>
              <Row label="UN Number" value={val(inq.un_number)} />
              <Row label="IMO Class" value={val(inq.imo_class)} />
              <Row label="Sudah Ada MSDS?" value={val(inq.has_msds)} />
            </>
          )}

          {/* SECTION 04 */}
          <Section num="4" title="LAYANAN TAMBAHAN" />
          <Row label="Layanan" value={joinArr(inq.additional_services, SERVICE_LABELS)} />

          {/* SECTION 05 */}
          <Section num="5" title="INFORMASI TAMBAHAN" />
          <Row label="Route" value={val(inq.route)} />
          {inq.notes ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{inq.notes}</Text>
            </View>
          ) : null}

          {/* SIGNATURES */}
          <View style={styles.sigWrap} wrap={false}>
            <View style={styles.sigBox}>
              <Text style={styles.sigRole}>Dibuat oleh (Sales)</Text>
              <Text style={styles.sigName}>{val(salesName)}</Text>
              <Text style={styles.sigLine}>Nama & TTD</Text>
            </View>
            <View style={styles.sigBox}>
              <Text style={styles.sigRole}>Disetujui oleh (Manager)</Text>
              <Text style={styles.sigName}> </Text>
              <Text style={styles.sigLine}>Nama & TTD</Text>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text style={styles.footL}>Digenerate oleh Nexus by MSI · {fmtDate(new Date().toISOString())}</Text>
          <Text style={styles.footR}>{noStr}</Text>
        </View>
      </Page>
    </Document>
  );
}
