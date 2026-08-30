// src/modules/logistics/DeliveryNotePDF.jsx
// Surat Jalan (delivery note) — Letter portrait, @react-pdf/renderer.
// Layout & palet mengikuti PERSIS Claude Design `Storbit Surat Jalan.dc.html`
// (ungu #5b3fa0 / krem #f6f4f1 / Lora + Cormorant) — satu keluarga dengan
// InvoicePDF.jsx, SENGAJA beda dari brand cetak navy/orange modul CRM.
// Semua token bersama (skala px(), palet, header, tanda tangan) ada di
// printKit.jsx; file ini tinggal menyusunnya.
import { View, Text } from '@react-pdf/renderer';
import { DocPage, DocHeader, PartyBlock, Field, NoteBox, SignatureRow } from './printKit';
import { s, px, ink, fmtDate, fmtQty, companyAddress } from './printTokens';

// Label badge — disamakan dengan STATUS_MAP di DeliveryNoteDetailPage.jsx
// supaya teks di layar dan di kertas tak pernah beda.
const STATUS_LABEL = {
  draft: 'Draft',
  in_transit: 'Dalam Pengiriman',
  delivered: 'Terkirim',
  cancelled: 'Dibatalkan',
};

// Lebar kolom — desainnya pakai tabel HTML auto-layout; react-pdf butuh angka.
const cProd = { width: '60%' };
const cSku = { width: '28%', paddingHorizontal: px(12) };
const cQty = { width: '12%', textAlign: 'right' };

export default function DeliveryNotePDF({ dn = {} }) {
  const items = dn.items || [];
  const company = dn.company || {};

  return (
    <DocPage>
      <DocHeader
        title="Surat Jalan"
        subtitle="Delivery Note"
        meta={[
          { label: 'No. Surat Jalan', value: dn.do_no },
          { label: 'Ref. No. SP', value: dn.sp_no },
        ]}
        badge={STATUS_LABEL[dn.status] || STATUS_LABEL.draft}
      />

      <View style={s.divider} />

      <View style={s.partyRow}>
        <PartyBlock
          label="Pengirim"
          name="Storbit Indonesia"
          sub={company.legal_name || '—'}
          address={companyAddress(company)}
        />
        <PartyBlock label="Penerima" name={dn.customer_name} sub={dn.dc_name} />
      </View>

      {/* Armada & Pengiriman — grid 3 kolom, Alamat Tujuan selebar baris */}
      <View style={{ marginTop: px(18) }}>
        <Text style={s.sectionLabel}>Armada &amp; Pengiriman</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: px(14) }}>
          <Field label="Nama Driver" value={dn.driver_name} width="33.33%" />
          <Field label="Telp Driver" value={dn.driver_phone} width="33.33%" />
          <Field label="No. Kendaraan" value={dn.vehicle_no} width="33.33%" />
          <Field label="Tanggal Kirim" value={fmtDate(dn.ship_date)} width="33.33%" />
          <Field label="Koli" value={dn.total_koli != null ? fmtQty(dn.total_koli) : null} width="33.33%" />
          <Field
            label="Berat (KG)"
            value={dn.total_weight != null ? fmtQty(dn.total_weight) : null}
            width="33.33%"
          />
          <Field label="Alamat Tujuan" value={dn.destination_address} width="100%" />
        </View>
      </View>

      {/* Item Dikirim */}
      <View style={{ marginTop: px(18) }}>
        <Text style={s.sectionLabel}>Item Dikirim</Text>
        <View style={s.thRow}>
          <Text style={[s.th, cProd]}>Produk</Text>
          <Text style={[s.th, cSku]}>SKU</Text>
          <Text style={[s.th, cQty]}>Qty</Text>
        </View>
        {items.map((it, i) => (
          <View style={[s.tr, { paddingVertical: px(8) }]} key={it.id || i} wrap={false}>
            <Text style={[s.td, cProd]}>{it.product_name || '—'}</Text>
            <Text style={[s.td, s.tdMute, cSku]}>{it.sku || '—'}</Text>
            <Text style={[s.td, cQty]}>{fmtQty(it.qty)}</Text>
          </View>
        ))}
        {items.length === 0 && (
          <View style={[s.tr, { paddingVertical: px(8) }]}>
            <Text style={[s.td, { width: '100%', color: ink(0.45) }]}>Tidak ada item.</Text>
          </View>
        )}
      </View>

      <NoteBox
        label="Catatan Kondisi Barang"
        hint="Catat bila terdapat barang rusak atau kurang saat serah terima."
        value={dn.notes}
      />

      <View style={s.spacer} />

      {/* Ketiganya sengaja kosong, sesuai desain — nama sopir sudah tercetak
          di blok Armada & Pengiriman, jadi mengisinya di sini cuma mengulang
          sekaligus membuat garis kotak Sopir tak sejajar dua kotak lain. */}
      <SignatureRow
        gap={px(20)}
        boxes={[{ title: 'Pengirim (Gudang)' }, { title: 'Sopir' }, { title: 'Penerima' }]}
      />
    </DocPage>
  );
}
