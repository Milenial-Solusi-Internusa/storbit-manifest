// src/modules/logistics/DeliveryNotePDF.jsx
// Surat Jalan (delivery note) — A4 portrait, @react-pdf/renderer.
// Brand: print navy #144682 + orange #E85A1E (official print palette, matches
// QuotationPDF/RateSheetPDF — NOT the Nexus screen rebrand). Helvetica + Courier.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#144682';
const ORANGE = '#E85A1E';
const CREAM = '#F6EFE3';
const INK = '#1B1B1B';
const MUTE = '#6B7280';
const LINE = '#E4DCCB';
const LOGO_URL = 'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/MSI%20LOGO.png';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, fontFamily: 'Helvetica', fontSize: 9, color: INK },
  header: { backgroundColor: NAVY, paddingVertical: 16, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { height: 38, width: 38, objectFit: 'contain' },
  coName: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#fff' },
  coSub: { fontSize: 8, color: '#C7D3E8', marginTop: 2 },
  hRight: { alignItems: 'flex-end' },
  hLabel: { fontFamily: 'Helvetica-Bold', fontSize: 10, letterSpacing: 2, color: ORANGE },
  hCode: { fontFamily: 'Courier', fontSize: 10, color: '#fff', marginTop: 4 },
  orangeRule: { height: 3, backgroundColor: ORANGE },

  metaWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 28, paddingTop: 16, paddingBottom: 4 },
  metaCol: { width: '50%', marginBottom: 10, paddingRight: 12 },
  metaLabel: { fontSize: 7.5, letterSpacing: 1, color: MUTE, fontFamily: 'Helvetica-Bold' },
  metaVal: { fontSize: 10, marginTop: 3, color: INK },
  metaMono: { fontFamily: 'Courier' },

  tableWrap: { paddingHorizontal: 28, paddingTop: 10 },
  thRow: { flexDirection: 'row', backgroundColor: CREAM, borderBottomWidth: 1.5, borderBottomColor: NAVY },
  th: { paddingVertical: 5, paddingHorizontal: 6, fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE },
  td: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 8.5, color: INK },
  cNo: { width: '8%' }, cProd: { width: '54%' }, cSku: { width: '24%' }, cQty: { width: '14%', textAlign: 'right' },
  tdMono: { fontFamily: 'Courier', fontSize: 8 },

  noteStrip: { marginTop: 12, marginHorizontal: 28, backgroundColor: CREAM, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingVertical: 8, paddingHorizontal: 12 },
  noteText: { fontSize: 8.5, color: '#5B4636', lineHeight: 1.5 },

  signWrap: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginTop: 34 },
  signBox: { width: '30%', alignItems: 'center' },
  signLabel: { fontSize: 8, color: MUTE, marginBottom: 40 },
  signLine: { borderTopWidth: 1, borderTopColor: INK, width: '100%', paddingTop: 4, alignItems: 'center' },
  signName: { fontSize: 8, color: INK },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: NAVY, paddingVertical: 8, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between' },
  footText: { fontSize: 7.5, color: '#C7D3E8' },
});

export default function DeliveryNotePDF({ dn = {}, generatedAt }) {
  const items = dn.items || [];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header} fixed>
          <View style={s.hLeft}>
            <Image style={s.logo} src={LOGO_URL} />
            <View>
              <Text style={s.coName}>STORBIT</Text>
              <Text style={s.coSub}>Milenial Solusi Internusa Group · SOA</Text>
            </View>
          </View>
          <View style={s.hRight}>
            <Text style={s.hLabel}>SURAT JALAN</Text>
            <Text style={s.hCode}>{dn.do_no || '—'}</Text>
          </View>
        </View>
        <View style={s.orangeRule} fixed />

        {/* Meta */}
        <View style={s.metaWrap}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>CUSTOMER</Text>
            <Text style={s.metaVal}>{dn.customer_name || '—'}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>SP NO</Text>
            <Text style={[s.metaVal, s.metaMono]}>{dn.sp_no || '—'}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>ALAMAT TUJUAN</Text>
            <Text style={s.metaVal}>{dn.destination_address || '—'}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>TANGGAL KIRIM</Text>
            <Text style={s.metaVal}>{fmtDate(dn.ship_date)}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>DRIVER</Text>
            <Text style={s.metaVal}>{dn.driver_name || '—'}{dn.driver_phone ? ` · ${dn.driver_phone}` : ''}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>NO. KENDARAAN</Text>
            <Text style={[s.metaVal, s.metaMono]}>{dn.vehicle_no || '—'}</Text>
          </View>
          {(dn.total_koli != null || dn.total_weight != null) && (
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>KOLI / BERAT</Text>
              <Text style={s.metaVal}>{dn.total_koli ?? '—'} koli · {dn.total_weight != null ? `${dn.total_weight} kg` : '—'}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={s.tableWrap}>
          <View style={s.thRow}>
            <Text style={[s.th, s.cNo]}>NO</Text>
            <Text style={[s.th, s.cProd]}>PRODUK</Text>
            <Text style={[s.th, s.cSku]}>SKU</Text>
            <Text style={[s.th, s.cQty]}>QTY</Text>
          </View>
          {items.map((it, i) => (
            <View style={s.tr} key={it.id || i} wrap={false}>
              <Text style={[s.td, s.cNo]}>{i + 1}</Text>
              <Text style={[s.td, s.cProd]}>{it.product_name || '—'}</Text>
              <Text style={[s.td, s.cSku, s.tdMono]}>{it.sku || '—'}</Text>
              <Text style={[s.td, s.cQty, s.tdMono]}>{Number(it.qty || 0).toLocaleString('id-ID')}</Text>
            </View>
          ))}
          {items.length === 0 && (
            <View style={s.tr}><Text style={[s.td, { width: '100%', color: MUTE }]}>Tidak ada item.</Text></View>
          )}
        </View>

        {dn.notes ? (
          <View style={s.noteStrip}><Text style={s.noteText}>{dn.notes}</Text></View>
        ) : null}

        {/* Signatures */}
        <View style={s.signWrap}>
          <View style={s.signBox}>
            <Text style={s.signLabel}>Pengirim (Gudang)</Text>
            <View style={s.signLine}><Text style={s.signName}>( ................. )</Text></View>
          </View>
          <View style={s.signBox}>
            <Text style={s.signLabel}>Driver</Text>
            <View style={s.signLine}><Text style={s.signName}>{dn.driver_name || '( ................. )'}</Text></View>
          </View>
          <View style={s.signBox}>
            <Text style={s.signLabel}>Penerima</Text>
            <View style={s.signLine}><Text style={s.signName}>( ................. )</Text></View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footText}>Dicetak: {fmtDate(generatedAt)}</Text>
          <Text style={s.footText}>{dn.do_no || ''}</Text>
        </View>
      </Page>
    </Document>
  );
}
