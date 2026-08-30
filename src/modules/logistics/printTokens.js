// src/modules/logistics/printTokens.js
// Token cetak bersama dokumen gudang Storbit (Picking List + Surat Jalan):
// pendaftaran font, skala, palet, util format, dan StyleSheet.
//
// Sengaja dipisah dari printKit.jsx yang berisi komponennya — eslint
// (react-refresh/only-export-components) melarang satu file mengekspor
// komponen DAN konstanta/fungsi sekaligus.
//
// Sumber desain: Claude Design `Storbit Picking List.dc.html` / `Storbit Surat
// Jalan.dc.html` — satu keluarga dengan `Storbit Invoice.dc.html` yang dipakai
// InvoicePDF.jsx (ungu #5b3fa0 / krem #f6f4f1 / Lora + Cormorant), SENGAJA
// beda dari brand cetak navy/orange modul CRM.
//
// SKALA — desain diautor sebagai halaman web ukuran Letter pada 96dpi
// (816 × 1056 css px). @react-pdf/renderer memakai titik PostScript
// (612 × 792 pt). Rasionya persis 0.75, jadi SEMUA angka desain dilewatkan
// px() supaya nilai di file ini bisa diadu langsung dengan file desainnya
// (mis. padding 26px di desain ditulis px(26), bukan 19.5).
import { Font, StyleSheet } from '@react-pdf/renderer';
import cormorantSemiBold from '../../assets/fonts/CormorantGaramond-SemiBold.ttf';
import loraRegular from '../../assets/fonts/Lora-Regular.ttf';
import loraSemiBold from '../../assets/fonts/Lora-SemiBold.ttf';

// Font sama persis dengan InvoicePDF.jsx — didaftarkan superset yang identik
// supaya urutan import antar-modul tak mengubah hasil (registry react-pdf
// per-family, pendaftaran terakhir menang).
Font.register({
  family: 'Cormorant Garamond',
  fonts: [{ src: cormorantSemiBold, fontWeight: 600 }],
});
Font.register({
  family: 'Lora',
  fonts: [
    { src: loraRegular, fontWeight: 400 },
    { src: loraSemiBold, fontWeight: 600 },
  ],
});

// Matikan pemenggalan suku kata. Default react-pdf memotong kata panjang
// dengan tanda hubung ("(SAY-BREAD)"), yang merusak nama produk & SKU —
// desainnya tak pernah memenggal. Callback identitas = kata tak pernah dipecah.
Font.registerHyphenationCallback((word) => [word]);

// ── Skala & palet ───────────────────────────────────────────────────────────
export const px = (n) => n * 0.75;

export const PAGE_W = 612;   // Letter, pt
export const PAGE_H = 792;

export const INK = '#201f1d';
export const PURPLE = '#5b3fa0';
export const PURPLE_DEEP = '#4a3585';   // teks badge status
export const BG = '#f6f4f1';

// Desain memakai rgba(32,31,29,α) di banyak tempat — 32,31,29 = #201f1d.
export const ink = (a) => `rgba(32, 31, 29, ${a})`;

// ⚠️ react-pdf MENGABAIKAN rgba() pada properti border (borderColor,
// borderBottomColor, borderTopColor) dan menggambarnya MERAH; hanya `color`
// dan `backgroundColor` yang menerimanya. Jadi setiap garis dihitung sebagai
// warna SOLID: #201f1d dicampur ke latar halaman #f6f4f1 pada alpha yang sama
// dengan desain — hasil visualnya setara di atas latar tsb.
export const inkLine = (a) => {
  const hex = [[32, 246], [31, 244], [29, 241]]
    .map(([fg, bg]) => Math.round(a * fg + (1 - a) * bg).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
};

// Logo Storbit (bukan logo MSI) — aset yang sama dengan InvoicePDF.jsx.
export const LOGO_URL = 'https://untmpqceexwxzuhlmyrg.supabase.co/storage/v1/object/public/assets/11.png';

// ── Util ────────────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function fmtQty(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

// Rakit alamat entitas dari kolom companies — pola sama dengan InvoicePDF.jsx.
export function companyAddress(company = {}) {
  const street = [company.address, company.address_2].filter(Boolean).join(', ');
  const city = [company.city, company.province, company.postal_code].filter(Boolean).join(', ');
  return [street, city].filter(Boolean).join(', ') || '—';
}

// ── Style bersama ───────────────────────────────────────────────────────────
export const s = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Lora',
    fontSize: px(13),
    paddingTop: px(26),
    paddingBottom: px(26),
    paddingHorizontal: px(64),
    flexDirection: 'column',
  },

  // Header
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: px(24) },
  headLeft: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  logo: { height: px(130), objectFit: 'contain', alignSelf: 'flex-start' },
  headRight: { flexShrink: 0, alignItems: 'flex-end' },
  docTitle: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: px(22), color: INK, lineHeight: 1.15 },
  docSubtitle: { fontSize: px(11), letterSpacing: px(11) * 0.1, textTransform: 'uppercase', color: ink(0.5), marginBottom: px(8) },
  metaStack: { flexDirection: 'column', gap: px(4), alignItems: 'flex-end' },
  metaLabel: { color: ink(0.55), fontSize: px(11) },
  metaValue: { fontSize: px(13) },

  badge: {
    marginTop: px(8), borderWidth: 1, borderColor: PURPLE, color: PURPLE_DEEP,
    borderRadius: px(20), paddingVertical: px(4), paddingHorizontal: px(14),
    fontSize: px(11), letterSpacing: px(11) * 0.06, textTransform: 'uppercase',
  },

  divider: { height: 1, backgroundColor: ink(0.16), marginTop: px(14), marginBottom: px(12) },

  // Blok pihak (Gudang/Pengirim · Penerima)
  partyRow: { flexDirection: 'row', gap: px(48) },
  partyCol: { width: '50%' },
  sectionLabel: { fontSize: px(11), letterSpacing: px(11) * 0.08, textTransform: 'uppercase', color: PURPLE, marginBottom: px(6) },
  partyName: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: px(19) },
  partySub: { fontSize: px(14), marginTop: px(2) },
  partyAddr: { fontSize: px(13), marginTop: px(6), color: ink(0.65) },

  // Tabel
  th: { fontSize: px(9), letterSpacing: px(9) * 0.08, textTransform: 'uppercase', color: ink(0.55), paddingBottom: px(7) },
  thRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: inkLine(0.22) },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: inkLine(0.14), alignItems: 'center' },
  td: { fontSize: px(13) },
  tdMute: { color: ink(0.65) },
  checkbox: { width: px(15), height: px(15), borderWidth: 1, borderColor: inkLine(0.4), borderRadius: px(3) },

  // Catatan
  noteBox: {
    borderWidth: 1, borderColor: inkLine(0.2), borderRadius: px(4),
    paddingVertical: px(10), paddingHorizontal: px(16), minHeight: px(44),
  },
  noteHint: { fontSize: px(12), color: ink(0.45) },
  noteFilled: { fontSize: px(12), color: INK },

  // Tanda tangan
  signRow: { flexDirection: 'row' },
  signBox: {
    borderWidth: 1, borderColor: inkLine(0.2), borderRadius: px(4),
    paddingVertical: px(14), paddingHorizontal: px(16), flexDirection: 'column',
  },
  signTitle: { fontFamily: 'Cormorant Garamond', fontWeight: 600, fontSize: px(15), marginBottom: px(14) },
  signSpace: { minHeight: px(64), flexGrow: 1 },
  signLine: { borderTopWidth: 1, borderTopColor: inkLine(0.35), paddingTop: px(6) },
  signLineLabel: { fontSize: px(10), color: ink(0.5) },

  spacer: { flexGrow: 1 },
});
