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
     - Kartu vs halaman 1,07:1 (CARD putih, revisi Den 20 Sep 2026 malam —
       semula #EEF3EA, 1,05:1), border vs kartu 1,35:1 → pemisah kartu dari
       halaman = border LINE; sage tampil lewat teks, ikon, dan aksen, bukan
       lewat latar kartu.
     - Aksen vs halaman hanya 1,41:1 → fokus ring memakai `INK_SOFT`, bukan aksen.
   ========================================================================= */

/* ---------- 1. IDENTITAS — 9 hex kebijakan (A.1), persis ---------- */
export const BG             = '#F6F8F3'; // latar halaman / shell
export const CARD           = '#FFFFFF'; // kartu, panel, surface — PUTIH POLOS (revisi Den 20 Sep 2026 malam, semula #EEF3EA); pemisah dari BG = border LINE
export const ACCENT         = '#C3D9B8'; // aksen utama: tombol primer, item aktif, highlight
export const ACCENT_HOVER   = '#AFC9A0';
export const ACCENT_2       = '#D7C9B0'; // aksen kedua: aksi sekunder, penanda pendukung
export const ACCENT_2_HOVER = '#C9B896';
export const LINE           = '#D8E0D2'; // garis, pembatas, border kartu/input
export const INK            = '#33422B'; // heading, body, DAN teks di atas aksen
export const INK_SOFT       = '#5C6B52'; // label, subtitle, teks redup (5,34:1 di BG · 5,71 di CARD)

/* ---------- 1b. TURUNAN — dihitung dari 9 hex di atas, nol hue baru ----------
   Rumus: mix(a, b, t) = a + (b − a) × t per kanal sRGB (dibulatkan). */
export const INK_FAINT    = '#838E7A'; // mix(INK_SOFT, BG, .25) → 3,21:1 di BG / 3,43 di CARD.
                                       // HANYA placeholder, ikon dekoratif, border kontrol
                                       // (ambang non-teks 3:1). BUKAN untuk teks isi/hint —
                                       // teks pendukung tetap INK_SOFT.
export const LINE_SOFT    = '#ECF0E9'; // mix(LINE, CARD, .50) — border sel tabel, garis dalam kartu (dihitung ulang utk CARD putih)
export const HEAD_BG      = '#EFF3ED'; // mix(CARD, LINE, .40) — thead, header kartu, track segmented (dihitung ulang utk CARD putih; INK_SOFT 5,09:1)
export const ROW_HOVER    = '#E4EDDE'; // mix(BG, ACCENT, .35) — hover baris tabel / item daftar
export const INPUT_BG     = BG;        // = BG: sejak CARD putih, input = bidang isian sage samar (1,07:1) di atas kartu — tetap dibedakan border LINE + fokus
export const DISABLED_BG  = '#E8ECE4'; // mix(CARD, LINE, .60) (dihitung ulang utk CARD putih)
export const DISABLED_INK = INK_FAINT; // kontrol nonaktif dikecualikan WCAG; nilai = INK_FAINT
export const FOCUS_RING   = '0 0 0 3px rgba(92,107,82,.35)';   // INK_SOFT rgb(92,107,82) α .35
export const BACKDROP     = 'rgba(51,66,43,.35)';              // INK rgb(51,66,43) α .35 — disamakan ke overlay modal mockup Inquiry Management (audit Tugas 2, semula .45)
export const SHADOW_1     = '0 1px 2px rgba(51,66,43,.06), 0 2px 8px rgba(51,66,43,.07)'; // lift tipis (dropdown/popover)
export const SHADOW_POPOVER = '0 12px 32px rgba(51,66,43,.16)'; // dikutip persis box-shadow kebab menu/DocumentFlow dropdown, mockup Inquiry Management (satu-satunya nilai popover/dropdown di mockup selain SHADOW_1 yang bentuknya beda total) — dipakai dropdown/popover melayang (kebab, dropdown mention), BUKAN Modal/Toast/SlideOver (tiga token lain di bawah)
export const SHADOW_2     = '0 24px 64px rgba(51,66,43,.28)';  // elemen melayang (slide-over, tooltip) — SHADOW_MODAL dipisah di bawah utk Modal, nilainya tak sama dgn ini
export const SHADOW_MODAL = '0 24px 48px rgba(51,66,43,.22)';  // dikutip persis box-shadow Modal/MarkWon dkk, mockup Inquiry Management — dipakai Modal, BUKAN SlideOver/Tooltip (belum ada acuan mockup utk dua itu)
export const SHADOW_TOAST = '0 12px 32px rgba(51,66,43,.25)';  // dikutip persis toast mockup — nilai literal yang sudah dipakai useToast.jsx sejak TD-318 Irisan Kit, kini jadi token
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
/* Skala ukuran huruf (px), dari frekuensi pakai mockup Inquiry Management
   (audit Tugas 2) — kit sebelumnya tak punya scale ini sama sekali (SIZE di
   atas = tinggi kontrol, bukan ukuran huruf). Nilai yang jarang berulang
   (10/10.5/16px dkk) SENGAJA tak dimasukkan — tetap inline di komponen. */
export const FONT_SIZE = { badge: 11.5, body: 13.5, label: 12, button: 13.5, hint: 12, tableHead: 11, modalTitle: 18 };

/* =========================================================================
   4. PALET STATUS/DATA — kelas terpisah dari identitas (#60 b).
   ========================================================================= */

/* SEMANTIC — trio fg/bg/bd dari palet warm-beige yang dipakai 40+ file
   (`C.ok`, `C.warn`, …); `neutral` diturunkan ulang dari sage (INK_SOFT di
   atas HEAD_BG, 5,09:1 sejak CARD putih). bg/bd persis warm-beige.
   ⚠️ DUA fg DIGESER demi AA (Keputusan #62, Den 20 Sep 2026 — JANGAN
   dikembalikan ke hex warm-beige): teks badge 11,5px = teks normal, butuh
   4,5:1. `ok` 4,30 → `#2D794D` (4,53) · `warn` 3,99 → `#8E620D` (4,58);
   danger 4,91 · info 5,89 sudah lolos. Hex lama tercatat di `09_ROADMAP.md`
   #62 (sengaja tidak ditulis di sini supaya grep gate hex lama bersih).
   Preseden: dua hex
   STATUS_META digeser demi AA 2 Sep 2026. Konsekuensi: `SEMANTIC.ok/warn`
   kit ≠ `C.ok/C.warn` warm-beige di file lama — beda 3–8 % gelap, bukan
   hue baru; file lama ikut nilai kit saat dimigrasi. */
export const SEMANTIC = {
  ok:      { fg: '#2D794D', bg: '#E4F0E5', bd: '#BFDDC4' }, // fg digeser 3 % (#62)
  warn:    { fg: '#8E620D', bg: '#F8ECCF', bd: '#E6CE94' }, // fg digeser 8 % (#62)
  danger:  { fg: '#B23227', bg: '#F6E0DB', bd: '#E6BBB2' },
  info:    { fg: '#2A5B8C', bg: '#E1ECF5', bd: '#BAD2E6' },
  neutral: { fg: INK_SOFT,  bg: HEAD_BG,   bd: LINE },
  /* muted — tag "Migrated, legacy number" + teks estimate sekunder (mockup
     Inquiry Management, audit Tugas 2). Kelas sendiri, bukan warn: ini label
     informasi netral ("nomor lama"), bukan peringatan yang perlu tindakan. */
  muted:   { fg: '#7A5A12', bg: '#FBF3DC', bd: '#E6CE94' },
};

/* TONE — satu sumbu warna untuk StatusBar/lajur papan, EMPAT saja (dari v3):
   slate = belum mulai / tak aktif · orange = sedang berjalan · navy = tuntas
   positif · brick = ditutup (bukan alarm merah). bg/bd persis v3.
   ⚠️ DUA fg DIGESER demi AA (Keputusan #62, Den 20 Sep 2026 — JANGAN
   dikembalikan ke nilai v3): `slate` 4,23 → `#676D7B` (4,54) · `orange` 3,23
   → `#BE4A19` (4,57); navy 8,22 · brick 4,61 sudah lolos. Hex lama tercatat
   di `09_ROADMAP.md` #62. `crm/v3/tokens.js` TONE tetap nilai lama sampai
   dihapus Batch DS 3 — dua salinan sementara, yang di kit ini yang berlaku
   ke depan. Sejak geseran ini nol hex oranye brand lama di kit. */
export const TONE = {
  slate:  { fg: '#676D7B', bg: '#EDF0F4', bd: '#D8DEE7' }, // fg digeser 4 % (#62)
  orange: { fg: '#BE4A19', bg: '#FEF2EC', bd: '#F6CDB6' }, // fg digeser 18 % (#62)
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

/* AVATAR_TONES — palet untuk MEMBEDAKAN orang/kategori di avatar bulat (mis.
   kolom Owner tabel Lead Capture), BUKAN status/semantik seperti SEMANTIC/
   DEAL_STATUS. Disusun dari trio SEMANTIC+TONE yang sudah ada (nol hex baru)
   supaya tidak melahirkan palet KEENAM di luar sage -- lihat larangan di
   CLAUDE.md §Brand. `avatarToneFor(id)` memetakan string apa pun (uuid/nama)
   ke salah satu entri secara STABIL (hash sederhana, bukan acak) supaya
   orang yang sama selalu dapat warna yang sama di render manapun. */
export const AVATAR_TONES = [TONE.navy, SEMANTIC.info, TONE.brick, SEMANTIC.warn, TONE.orange, SEMANTIC.danger, TONE.slate, SEMANTIC.ok];
export function avatarToneFor(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/* ---------- 5. Helper format (kompatibilitas AdminKit) ----------
   Bukan token, tapi tiga halaman admin mengimpornya dari `tokens.js` lama;
   ditaruh di sini supaya Batch DS 2 cukup mengganti path impor. Rumah
   permanennya (mis. `src/lib/format.js`) = keputusan saat Batch DS 7. */
export const fmtRp  = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
export const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
