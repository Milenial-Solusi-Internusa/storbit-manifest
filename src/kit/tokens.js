/* =========================================================================
   Nexus Kit — SATU file token untuk seluruh aplikasi internal (Batch DS 1).

   Konstanta polos saja (nol JSX) supaya ramah Fast-Refresh — pola yang sama
   dengan dua pendahulunya (`admin-settings/tokens.js`, `crm/v3/tokens.js`).
   Kedua file itu SENGAJA dibiarkan hidup selama Batch DS 1–6 dan baru dihapus
   di Batch DS 7 (`docs/DESIGN_SYSTEM_REFERENCE.md` A.4.3).

   DUA KELAS WARNA, JANGAN DICAMPUR (keputusan Den 20 Sep 2026, #60 b):
     1. IDENTITAS aplikasi — palet "sage" A.1: 9 hex kebijakan + turunannya.
        Nol hue baru: setiap turunan dihitung dari 9 hex itu (rumus di komentar).
     2. STATUS/DATA — warna yang membawa makna (ok/warn/danger/info, tone
        sumbu status, badge status deal). Wajib saling kontras satu sama lain
        (merah ≠ hijau), jadi TIDAK diseragamkan ke sage. WON tetap navy
        `#144682` sebagai warna STATUS, bukan identitas.

   Fakta WCAG yang MENENTUKAN desain kit (dihitung ulang 20 Sep 2026, skrip
   di luar repo — hasil lengkap di PROGRESS.md 2026-09-20):
     - Teks PUTIH di atas aksen sage GAGAL AA (1,51–1,95:1) → semua pola lama
       "solid navy/oranye + teks putih" menjadi LATAR AKSEN + TEKS `INK`
       (7,13:1 di ACCENT · 6,58:1 di ACCENT_2). `INK_SOFT` di atas aksen pun
       gagal (3,79 / 3,50) — di permukaan aksen SELALU `INK`.
     - Kartu vs halaman 1,05:1, border vs kartu 1,20:1 → hierarki bertumpu
       pada border + bayangan turunan, bukan beda latar.
     - Aksen vs halaman hanya 1,41:1 → fokus ring memakai `INK_SOFT`, bukan aksen.
   ========================================================================= */

/* ---------- 1. IDENTITAS — 9 hex kebijakan (A.1), persis ---------- */
export const BG             = '#F6F8F3'; // latar halaman / shell
export const CARD           = '#EEF3EA'; // kartu, panel, surface
export const ACCENT         = '#C3D9B8'; // aksen utama: tombol primer, item aktif, highlight
export const ACCENT_HOVER   = '#AFC9A0';
export const ACCENT_2       = '#D7C9B0'; // aksen kedua: aksi sekunder, penanda pendukung
export const ACCENT_2_HOVER = '#C9B896';
export const LINE           = '#D8E0D2'; // garis, pembatas, border kartu/input
export const INK            = '#33422B'; // heading, body, DAN teks di atas aksen
export const INK_SOFT       = '#5C6B52'; // label, subtitle, teks redup (5,34:1 di BG · 5,07 di CARD)

/* ---------- 1b. TURUNAN — dihitung dari 9 hex di atas, nol hue baru ----------
   Rumus: mix(a, b, t) = a + (b − a) × t per kanal sRGB (dibulatkan). */
export const INK_FAINT    = '#838E7A'; // mix(INK_SOFT, BG, .25) → 3,21:1 di BG / 3,05 di CARD.
                                       // HANYA placeholder, ikon dekoratif, border kontrol
                                       // (ambang non-teks 3:1). BUKAN untuk teks isi/hint —
                                       // teks pendukung tetap INK_SOFT.
export const LINE_SOFT    = '#E3EADE'; // mix(LINE, CARD, .50) — border sel tabel, garis dalam kartu
export const HEAD_BG      = '#E5EBE0'; // mix(CARD, LINE, .40) — thead, header kartu, track segmented
export const ROW_HOVER    = '#E4EDDE'; // mix(BG, ACCENT, .35) — hover baris tabel / item daftar
export const INPUT_BG     = BG;        // = BG, supaya input TIMBUL (lebih terang) di atas kartu
export const DISABLED_BG  = '#E1E8DC'; // mix(CARD, LINE, .60)
export const DISABLED_INK = INK_FAINT; // kontrol nonaktif dikecualikan WCAG; nilai = INK_FAINT
export const FOCUS_RING   = '0 0 0 3px rgba(92,107,82,.35)';   // INK_SOFT rgb(92,107,82) α .35
export const BACKDROP     = 'rgba(51,66,43,.45)';              // INK rgb(51,66,43) α .45
export const SHADOW_1     = '0 1px 2px rgba(51,66,43,.06), 0 2px 8px rgba(51,66,43,.07)'; // lift tipis (dropdown/popover)
export const SHADOW_2     = '0 24px 64px rgba(51,66,43,.28)';  // elemen melayang (modal, slide-over, toast)
export const SHADOW_DROP  = 'drop-shadow(0 3px 6px rgba(51,66,43,.22))'; // segmen aktif StatusBar (clip-path butuh filter)

/* Putih hanya untuk teks di atas warna STATUS solid (mis. penanda WON navy
   9,42:1, pil saved-view ber-`color`). JANGAN dipakai di atas aksen sage. */
export const WHITE = '#FFFFFF';

/* ---------- 2. FONT — tiga saja (A.2), nilai persis kedua kit lama ---------- */
export const FONT_HEAD = "'Montserrat', system-ui, sans-serif";
export const FONT_BODY = "'Inter', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ---------- 3. SKALA ---------- */
export const SP = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32 };
/* AdminKit 11 → md 10, 16 → lg 14; xl 18 untuk modal (keputusan #7). */
export const RADIUS = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 };
/* Tangga z-index (DSR §14). `confirm` = ConfirmModal bersama (9999) — tetap
   yang tertinggi selama komponen itu belum masuk kit (Batch DS 4a). */
export const Z = { tooltip: 60, slideOver: 80, modal: 90, popover: 150, toast: 200, confirm: 9999 };
export const MOTION = {
  ease: 'cubic-bezier(.22,1,.36,1)',
  fast: '.12s',   // transform tombol, hover baris
  base: '.2s',    // warna/border
  slow: '.3s',    // tab, modal
};
/* Tinggi kontrol tunggal (keputusan #7): tombol md 40 / sm 32 / xs 28 ·
   input ringkas 44 · input mengambang 56. Dipakai Button.jsx & Form.jsx. */
export const SIZE = { btnMd: 40, btnSm: 32, btnXs: 28, input: 44, inputFloating: 56 };

/* =========================================================================
   4. PALET STATUS/DATA — kelas terpisah dari identitas (#60 b).
   ========================================================================= */

/* SEMANTIC — trio fg/bg/bd yang sudah dipakai 40+ file warm-beige (`C.ok`,
   `C.warn`, …), dipindahkan apa adanya (keputusan #3); `neutral` diturunkan
   ulang dari sage (INK_SOFT di atas HEAD_BG, 4,70:1).
   ⚠️ Terukur 20 Sep 2026: `ok` 4,30:1 dan `warn` 3,99:1 di bawah AA 4,5:1
   untuk teks badge 11,5px (danger 4,91 · info 5,89 lolos). Nilainya SENGAJA
   tidak digeser di sini — itu keputusan Den (preseden: dua hex STATUS_META
   digeser demi AA, 2 Sep 2026). Lihat laporan Batch DS 1. */
export const SEMANTIC = {
  ok:      { fg: '#2E7D4F', bg: '#E4F0E5', bd: '#BFDDC4' },
  warn:    { fg: '#9A6B0E', bg: '#F8ECCF', bd: '#E6CE94' },
  danger:  { fg: '#B23227', bg: '#F6E0DB', bd: '#E6BBB2' },
  info:    { fg: '#2A5B8C', bg: '#E1ECF5', bd: '#BAD2E6' },
  neutral: { fg: INK_SOFT,  bg: HEAD_BG,   bd: LINE },
};

/* TONE — satu sumbu warna untuk StatusBar/lajur papan, EMPAT saja (v3, apa
   adanya): slate = belum mulai / tak aktif · orange = sedang berjalan ·
   navy = tuntas positif · brick = ditutup (bukan alarm merah).
   ⚠️ Terukur: slate 4,23 · orange 3,23 (di bawah 4,5 untuk teks 11,5px);
   navy 8,22 · brick 4,61. Dibawa apa adanya dari v3 — lihat laporan. */
export const TONE = {
  slate:  { fg: '#6B7280', bg: '#EDF0F4', bd: '#D8DEE7' },
  orange: { fg: '#E85A1E', bg: '#FEF2EC', bd: '#F6CDB6' },
  navy:   { fg: '#144682', bg: '#EAF0F8', bd: '#C3D3E8' },
  brick:  { fg: '#A8503C', bg: '#F7EAE6', bd: '#E3C4BB' },
};

/* DEAL_STATUS — badge tinted rounded-square status deal (`inquiries.status`),
   trio persis `STATUS_META` InquiryListPage (resmi per 06 §1; In Review &
   Negotiation sudah digeser demi AA, jangan dikembalikan). Semua ≥ 4,66:1.
   WON navy `#144682` = warna STATUS ("Berhasil = Navy", bukan hijau).
   Label teksnya TIDAK di sini — kosakata CRM (`STATUS_LABEL`, urutan sumbu)
   pindah ke `src/modules/crm/dealStatus.js` di Batch DS 3; kit buta sumbu. */
export const DEAL_STATUS = {
  OPEN:        { fg: '#1D5A96', bg: '#E4EEF7', bd: '#BCD0E4' },
  IN_REVIEW:   { fg: '#916312', bg: '#FBF0DD', bd: '#E6D4B4' },
  QUOTED:      { fg: '#5B4A96', bg: '#EEEAF6', bd: '#D1CAE3' },
  NEGOTIATION: { fg: '#B53F0D', bg: '#FDE7DB', bd: '#EFC5B2' },
  WON:         { fg: '#144682', bg: '#E1E9F2', bd: '#B8C8DC' },
  LOST:        { fg: '#B33A2E', bg: '#FBE7E5', bd: '#EDC4C0' },
  CANCELLED:   { fg: '#6B6459', bg: '#EDEBE7', bd: '#D3D0CB' },
};

/* STAGE_TONE — pemetaan kunci sumbu → tone (disalin dari v3, kedua kosakata
   sengaja di satu peta supaya StatusBar/Badge tetap bodoh soal sumbu).
   Lifecycle memakai urutan lead → mql → prospect → sql → customer. */
export const STAGE_TONE = {
  /* lifecycle akun */
  lead: 'slate', mql: 'slate', free_agent: 'slate',
  prospect: 'orange', sql: 'orange',
  customer: 'navy', lost: 'brick',
  /* status deal (inquiries.status) */
  OPEN: 'orange', IN_REVIEW: 'orange', QUOTED: 'orange', NEGOTIATION: 'orange',
  WON: 'navy', LOST: 'brick', CANCELLED: 'brick',
};

/* Status yang berarti "sudah ditutup" (v3, apa adanya). */
export const CLOSED_STAGES = ['lost', 'free_agent', 'WON', 'LOST', 'CANCELLED'];

/* Resolusi tone untuk Badge/lajur: objek trio → dipakai langsung; nama
   SEMANTIC → SEMANTIC; nama TONE → TONE; id sumbu → STAGE_TONE; sisanya slate. */
export const toneOf = (tone) => {
  if (tone && typeof tone === 'object') return tone;
  if (SEMANTIC[tone]) return SEMANTIC[tone];
  if (TONE[tone]) return TONE[tone];
  return TONE[STAGE_TONE[tone] || 'slate'];
};

/* Bangun props `closed` StatusBar dari satu nilai status (tinggal di token,
   bukan di komponen — syarat react-refresh/only-export-components). */
export const closedFrom = (stage, labelMap = {}) =>
  (stage ? { stage, label: labelMap[stage] || stage } : null);
export const isClosedStage = (stage) => CLOSED_STAGES.includes(stage);

/* ---------- 5. Helper format (kompatibilitas AdminKit) ----------
   Bukan token, tapi tiga halaman admin mengimpornya dari `tokens.js` lama;
   ditaruh di sini supaya Batch DS 2 cukup mengganti path impor. Rumah
   permanennya (mis. `src/lib/format.js`) = keputusan saat Batch DS 7. */
export const fmtRp  = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
export const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
