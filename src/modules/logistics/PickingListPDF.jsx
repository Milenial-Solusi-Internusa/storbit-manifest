// src/modules/logistics/PickingListPDF.jsx
// Picking List checklist — A4 portrait, @react-pdf/renderer. Dipakai tim gudang
// sebagai checklist fisik saat mengambil barang (ada kolom checkbox untuk dicentang
// manual pakai pulpen). Print-brand navy #144682 (sama QuotationPDF/DeliveryNotePDF).
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
  metaCol: { width: '33%', marginBottom: 10, paddingRight: 12 },
  metaLabel: { fontSize: 7.5, letterSpacing: 1, color: MUTE, fontFamily: 'Helvetica-Bold' },
  metaVal: { fontSize: 10, marginTop: 3, color: INK },
  metaMono: { fontFamily: 'Courier' },

  sectionTitle: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 4, fontFamily: 'Helvetica-Bold', fontSize: 10, color: NAVY },
  tableWrap: { paddingHorizontal: 28, paddingTop: 4 },
  thRow: { flexDirection: 'row', backgroundColor: CREAM, borderBottomWidth: 1.5, borderBottomColor: NAVY },
  th: { paddingVertical: 5, paddingHorizontal: 6, fontFamily: 'Helvetica-Bold', fontSize: 8, color: NAVY },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: 'center' },
  td: { paddingVertical: 6, paddingHorizontal: 6, fontSize: 8.5, color: INK },
  tdMono: { fontFamily: 'Courier', fontSize: 8 },
  checkbox: { width: 11, height: 11, borderWidth: 1, borderColor: INK, borderRadius: 1 },
  cChk: { width: '7%', alignItems: 'center' },
  cNo: { width: '7%' }, cProd: { width: '40%' }, cSku: { width: '20%' }, cLoc: { width: '14%' }, cQty: { width: '12%', textAlign: 'right' },
  // material table cols
  mProd: { width: '54%' }, mSku: { width: '26%' }, mQty: { width: '13%', textAlign: 'right' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: NAVY, paddingVertical: 8, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between' },
  footText: { fontSize: 7.5, color: '#C7D3E8' },
});

export default function PickingListPDF({ pl = {}, generatedAt }) {
  const items = pl.items || [];
  const materials = pl.materials || [];
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
            <Text style={s.hLabel}>PICKING LIST</Text>
            <Text style={s.hCode}>{pl.picking_no || '—'}</Text>
          </View>
        </View>
        <View style={s.orangeRule} fixed />

        {/* Meta — checklist kerja gudang (tanpa driver/kirim) */}
        <View style={s.metaWrap}>
          <View style={s.metaCol}><Text style={s.metaLabel}>SP NO</Text><Text style={[s.metaVal, s.metaMono]}>{pl.sp_no || '—'}</Text></View>
          <View style={s.metaCol}><Text style={s.metaLabel}>CUSTOMER</Text><Text style={s.metaVal}>{pl.customer_name || '—'}</Text></View>
          <View style={s.metaCol}><Text style={s.metaLabel}>GUDANG</Text><Text style={s.metaVal}>{pl.warehouse_name || '—'}</Text></View>
          <View style={s.metaCol}><Text style={s.metaLabel}>TANGGAL</Text><Text style={s.metaVal}>{fmtDate(pl.created_at)}</Text></View>
        </View>

        {/* Item table — kolom checkbox untuk dicentang manual */}
        <Text style={s.sectionTitle}>Item yang Diambil</Text>
        <View style={s.tableWrap}>
          <View style={s.thRow}>
            <Text style={[s.th, s.cChk]}>✓</Text>
            <Text style={[s.th, s.cNo]}>NO</Text>
            <Text style={[s.th, s.cProd]}>PRODUK</Text>
            <Text style={[s.th, s.cSku]}>SKU</Text>
            <Text style={[s.th, s.cLoc]}>LOKASI</Text>
            <Text style={[s.th, s.cQty]}>QTY DIMINTA</Text>
          </View>
          {items.map((it, i) => (
            <View style={s.tr} key={it.id || i} wrap={false}>
              <View style={[s.td, s.cChk]}><View style={s.checkbox} /></View>
              <Text style={[s.td, s.cNo]}>{i + 1}</Text>
              <Text style={[s.td, s.cProd]}>{it.product_name || '—'}</Text>
              <Text style={[s.td, s.cSku, s.tdMono]}>{it.sku || '—'}</Text>
              <Text style={[s.td, s.cLoc]}>{it.location_detail || '—'}</Text>
              <Text style={[s.td, s.cQty, s.tdMono]}>{Number(it.qty_requested || 0).toLocaleString('id-ID')}</Text>
            </View>
          ))}
          {items.length === 0 && (
            <View style={s.tr}><Text style={[s.td, { width: '100%', color: MUTE }]}>Tidak ada item.</Text></View>
          )}
        </View>

        {/* Material Packing — hanya bila sudah dicatat */}
        {materials.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Material Packing</Text>
            <View style={s.tableWrap}>
              <View style={s.thRow}>
                <Text style={[s.th, s.cChk]}>✓</Text>
                <Text style={[s.th, s.mProd]}>MATERIAL</Text>
                <Text style={[s.th, s.mSku]}>SKU</Text>
                <Text style={[s.th, s.mQty]}>QTY</Text>
              </View>
              {materials.map((m, i) => (
                <View style={s.tr} key={m.id || i} wrap={false}>
                  <View style={[s.td, s.cChk]}><View style={s.checkbox} /></View>
                  <Text style={[s.td, s.mProd]}>{m.product_name || '—'}</Text>
                  <Text style={[s.td, s.mSku, s.tdMono]}>{m.sku || '—'}</Text>
                  <Text style={[s.td, s.mQty, s.tdMono]}>{Number(m.qty || 0).toLocaleString('id-ID')}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footText}>Dicetak: {fmtDate(generatedAt)}</Text>
          <Text style={s.footText}>{pl.picking_no || ''}</Text>
        </View>
      </Page>
    </Document>
  );
}
