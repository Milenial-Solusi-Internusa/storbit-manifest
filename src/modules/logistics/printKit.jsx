// src/modules/logistics/printKit.jsx
// Komponen cetak bersama dokumen gudang Storbit (Picking List + Surat Jalan).
// Token/style/util-nya ada di printTokens.js — file ini SENGAJA hanya
// mengekspor komponen (aturan eslint react-refresh/only-export-components).
import { Document, Page, View, Text, Image, Svg, Polygon } from '@react-pdf/renderer';
import { s, px, PAGE_W, PAGE_H, PURPLE, LOGO_URL } from './printTokens';

// ── Ornamen sudut ───────────────────────────────────────────────────────────
// Desain memakai 4 div ber-clip-path. react-pdf tak mengenal clip-path, jadi
// poligon yang sama digambar sebagai SVG — bentuk & opacity-nya identik.
// `fixed` supaya ikut tercetak di halaman lanjutan bila item meluber.
export function PageChrome() {
  const topH = px(130);
  const topRightW = px(260);
  const botH = px(110);
  const botLeftW = px(230);
  const botY = PAGE_H - botH;
  return (
    <Svg
      width={PAGE_W}
      height={PAGE_H}
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      style={{ position: 'absolute', top: 0, left: 0 }}
      fixed
    >
      {/* atas, selebar halaman — polygon(0 0, 100% 0, 100% 40%, 0 100%) */}
      <Polygon points={`0,0 ${PAGE_W},0 ${PAGE_W},${topH * 0.4} 0,${topH}`} fill={PURPLE} fillOpacity={0.1} />
      {/* atas-kanan — polygon(100% 0, 100% 100%, 55% 0) */}
      <Polygon
        points={`${PAGE_W},0 ${PAGE_W},${topH} ${PAGE_W - topRightW * 0.45},0`}
        fill={PURPLE}
        fillOpacity={0.22}
      />
      {/* bawah, selebar halaman — polygon(0 0, 100% 60%, 100% 100%, 0 100%) */}
      <Polygon
        points={`0,${botY} ${PAGE_W},${botY + botH * 0.6} ${PAGE_W},${PAGE_H} 0,${PAGE_H}`}
        fill={PURPLE}
        fillOpacity={0.1}
      />
      {/* bawah-kiri — polygon(0 100%, 0 0, 80% 100%) */}
      <Polygon points={`0,${PAGE_H} 0,${botY} ${botLeftW * 0.8},${PAGE_H}`} fill={PURPLE} fillOpacity={0.22} />
    </Svg>
  );
}

// Header: logo kiri, judul + meta kanan, badge status opsional.
// `meta` = [{ label, value }]. `badge` = string (mis. 'Dalam Pengiriman').
export function DocHeader({ title, subtitle, meta = [], badge }) {
  return (
    <View style={s.headRow}>
      <View style={s.headLeft}>
        <Image style={s.logo} src={LOGO_URL} />
      </View>
      <View style={s.headRight}>
        <Text style={s.docTitle}>{title}</Text>
        <Text style={s.docSubtitle}>{subtitle}</Text>
        <View style={s.metaStack}>
          {meta.map((m) => (
            <View key={m.label} style={{ alignItems: 'flex-end' }}>
              <Text style={s.metaLabel}>{m.label}</Text>
              <Text style={s.metaValue}>{m.value || '—'}</Text>
            </View>
          ))}
        </View>
        {badge ? <Text style={s.badge}>{badge}</Text> : null}
      </View>
    </View>
  );
}

// Blok pihak. `address` opsional (Penerima di desain tak punya baris alamat).
export function PartyBlock({ label, name, sub, address }) {
  return (
    <View style={s.partyCol}>
      <Text style={s.sectionLabel}>{label}</Text>
      <Text style={s.partyName}>{name || '—'}</Text>
      {sub ? <Text style={s.partySub}>{sub}</Text> : null}
      {address ? <Text style={s.partyAddr}>{address}</Text> : null}
    </View>
  );
}

// Pasangan label/nilai di grid Armada & Pengiriman.
export function Field({ label, value, width }) {
  return (
    <View style={{ width }}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={{ fontSize: px(13) }}>{value || '—'}</Text>
    </View>
  );
}

// Kotak catatan. Kolom `notes` di DB tak pernah ditulis UI mana pun, jadi
// praktiknya selalu kosong → tampil sebagai kotak bergaris berisi teks bantu,
// persis desain. Kalau suatu hari terisi, isinya yang tampil.
export function NoteBox({ label, hint, value }) {
  return (
    <View style={{ marginTop: px(16) }}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.noteBox}>
        <Text style={value ? s.noteFilled : s.noteHint}>{value || hint}</Text>
      </View>
    </View>
  );
}

// Baris tanda tangan. `boxes` = [{ title }] — isinya selalu kosong untuk
// ditulis tangan: tak satu pun dari lima blok (Picker/Checker/Pengirim/Sopir/
// Penerima) punya sumber data yang bisa dipercaya. `picking_lists.assigned_to`
// misalnya tak pernah ditulis siapa pun (nol INSERT/UPDATE di FE maupun RPC).
export function SignatureRow({ boxes = [], gap }) {
  const w = `${(100 - (boxes.length - 1) * 2) / boxes.length}%`;
  return (
    <View style={{ marginTop: px(20) }}>
      <View style={[s.signRow, { gap }]}>
        {boxes.map((b) => (
          <View key={b.title} style={[s.signBox, { width: w }]}>
            <Text style={s.signTitle}>{b.title}</Text>
            <View style={s.signSpace} />
            <View style={s.signLine}>
              <Text style={s.signLineLabel}>Nama</Text>
            </View>
            <View style={[s.signLine, { marginTop: px(14) }]}>
              <Text style={s.signLineLabel}>Tanggal</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Kerangka halaman: satu Page Letter + ornamen sudut.
export function DocPage({ children }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <PageChrome />
        {children}
      </Page>
    </Document>
  );
}
