// src/modules/logistics/PickingListPDF.jsx
// Picking List — Letter portrait, @react-pdf/renderer. Dipakai tim gudang
// sebagai checklist fisik saat mengambil barang (kolom kotak dicentang pulpen).
// Layout & palet mengikuti PERSIS Claude Design `Storbit Picking List.dc.html`;
// token bersamanya ada di printKit.jsx (dipakai bareng DeliveryNotePDF.jsx).
import { View, Text } from '@react-pdf/renderer';
import { DocPage, DocHeader, PartyBlock, NoteBox, SignatureRow } from './printKit';
import { s, px, ink, fmtDate, fmtQty, companyAddress } from './printTokens';

// Lebar kolom — desainnya pakai tabel HTML auto-layout dengan kolom centang
// 32px; react-pdf butuh angka eksplisit.
const cChk = { width: '6%' };
const cProd = { width: '48%', paddingHorizontal: px(12) };
const cSku = { width: '22%', paddingHorizontal: px(12) };
const cLoc = { width: '14%', paddingHorizontal: px(12) };
const cQty = { width: '10%', textAlign: 'right' };

// Material Packing memakai kolom sendiri (tanpa Lokasi Rak).
const mProd = { width: '60%', paddingHorizontal: px(12) };
const mSku = { width: '24%', paddingHorizontal: px(12) };
const mQty = { width: '10%', textAlign: 'right' };

function Checkbox() {
  return (
    <View style={cChk}>
      <View style={[s.checkbox, { marginHorizontal: 'auto' }]} />
    </View>
  );
}

export default function PickingListPDF({ pl = {} }) {
  const items = pl.items || [];
  const materials = pl.materials || [];
  const company = pl.company || {};

  return (
    <DocPage>
      <DocHeader
        title="Picking List"
        subtitle="Daftar Pengambilan Barang"
        meta={[
          { label: 'No. Picking List', value: pl.picking_no },
          { label: 'Ref. No. SP', value: pl.sp_no },
          { label: 'Tanggal', value: fmtDate(pl.created_at) },
        ]}
      />

      <View style={s.divider} />

      <View style={s.partyRow}>
        <PartyBlock
          label="Gudang"
          name="Storbit Indonesia"
          sub={company.legal_name || '—'}
          address={companyAddress(company)}
        />
        <PartyBlock label="Penerima" name={pl.customer_name} sub={pl.dc_name} />
      </View>

      {/* Item untuk Diambil */}
      <View style={{ marginTop: px(20) }}>
        <Text style={s.sectionLabel}>Item untuk Diambil</Text>
        <View style={s.thRow}>
          <Text style={[s.th, cChk]} />
          <Text style={[s.th, cProd]}>Produk</Text>
          <Text style={[s.th, cSku]}>SKU</Text>
          <Text style={[s.th, cLoc]}>Lokasi Rak</Text>
          <Text style={[s.th, cQty]}>Qty</Text>
        </View>
        {items.map((it, i) => (
          <View style={[s.tr, { paddingVertical: px(9) }]} key={it.id || i} wrap={false}>
            <Checkbox />
            <Text style={[s.td, cProd]}>{it.product_name || '—'}</Text>
            <Text style={[s.td, s.tdMute, cSku]}>{it.sku || '—'}</Text>
            <Text style={[s.td, s.tdMute, cLoc]}>{it.location_detail || '—'}</Text>
            <Text style={[s.td, cQty]}>{fmtQty(it.qty_requested)}</Text>
          </View>
        ))}
        {items.length === 0 && (
          <View style={[s.tr, { paddingVertical: px(9) }]}>
            <Text style={[s.td, { width: '100%', color: ink(0.45) }]}>Tidak ada item.</Text>
          </View>
        )}
      </View>

      {/* Material Packing — bahan kemas (kardus/lakban/dll) yang ikut memotong
          stock_ledger lewat add_picking_material. SENGAJA dipertahankan walau
          tak ada di file desain: ini satu-satunya permukaan cetaknya.
          Aturan tampil/sembunyi TIDAK diubah — seluruh blok termasuk judulnya
          hilang saat belum ada material yang dicatat. */}
      {materials.length > 0 && (
        <View style={{ marginTop: px(20) }}>
          <Text style={s.sectionLabel}>Material Packing</Text>
          <View style={s.thRow}>
            <Text style={[s.th, cChk]} />
            <Text style={[s.th, mProd]}>Material</Text>
            <Text style={[s.th, mSku]}>SKU</Text>
            <Text style={[s.th, mQty]}>Qty</Text>
          </View>
          {materials.map((m, i) => (
            <View style={[s.tr, { paddingVertical: px(9) }]} key={m.id || i} wrap={false}>
              <Checkbox />
              <Text style={[s.td, mProd]}>{m.product_name || '—'}</Text>
              <Text style={[s.td, s.tdMute, mSku]}>{m.sku || '—'}</Text>
              <Text style={[s.td, mQty]}>{fmtQty(m.qty)}</Text>
            </View>
          ))}
        </View>
      )}

      <NoteBox
        label="Catatan"
        hint="Catat bila terdapat selisih stok atau kendala saat pengambilan barang."
        value={pl.notes}
      />

      <View style={s.spacer} />

      <SignatureRow
        gap={px(24)}
        boxes={[{ title: 'Diambil oleh (Picker)' }, { title: 'Diperiksa oleh (Checker)' }]}
      />
    </DocPage>
  );
}
