/* =========================================================================
   CRM v3 — token brand + pemetaan warna sumbu status.

   Konstanta polos saja (nol JSX) supaya file ini ramah Fast-Refresh —
   pola sama dengan `src/pages/foundation/admin-settings/tokens.js`.

   ⚠️ SENGAJA TERPISAH dari admin-settings/tokens.js. Dua alasan:
   (1) NAVY di sana `#1B4D8A`, sementara brand resmi (CLAUDE.md) `#144682`.
       Menyatukannya berarti mengubah tampilan seluruh halaman Admin Settings
       yang sudah jalan — di luar scope batch ini.
   (2) v3 harus bisa berubah tanpa menyentuh layar produksi mana pun.
   ========================================================================= */

/* ---------- brand (CLAUDE.md — sumber otoritatif) ---------- */
export const NAVY      = '#144682';
export const NAVY_DK   = '#0E3260';
export const NAVY_SOFT = '#EAF0F8';
export const ORANGE    = '#E85A1E';
export const ORANGE_DK = '#D14E18';
export const ORANGE_SOFT = '#FEF2EC';
export const CORAL     = '#F08C7D';
export const CREAM     = '#F6EFE3';

export const SURFACE   = '#FFFFFF';
export const SURFACE_2 = '#F7F8FA';
export const LINE      = '#E5E0D8';
export const LINE_SOFT = '#EFE9DD';
export const INK       = '#16243A';
export const INK_SOFT  = '#4A5360';
export const MUTED     = '#6B7280';
export const FAINT     = '#9CA3AF';

/* Brick muted — penutup "kalah/batal". SENGAJA bukan merah alarm:
   status tertutup itu fakta administratif, bukan kondisi darurat. */
export const BRICK      = '#A8503C';
export const BRICK_SOFT = '#F7EAE6';

/* Slate netral — belum mulai / tidak lagi aktif. */
export const SLATE      = '#6B7280';
export const SLATE_SOFT = '#EDF0F4';

export const DANGER     = '#C0392B';
export const DANGER_SOFT = '#FBE3E3';

/* ---------- tipografi ---------- */
export const FONT_HEAD = "'Montserrat', system-ui, sans-serif";
export const FONT_BODY = "'Inter', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ---------- spacing & radius ---------- */
export const SP = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32 };
export const RADIUS = { sm: 6, md: 10, lg: 14, pill: 999 };

/* =========================================================================
   STAGE_TONE — pemetaan SATU sumbu warna untuk StatusBar.

   Empat tone, bukan lebih. Ditetapkan di brief redesign v3:
     slate  → belum mulai / tidak lagi aktif
     orange → sedang berjalan aktif
     navy   → tuntas positif
     brick  → ditutup (bukan alarm merah)

   Kunci di sini memuat DUA kosakata sekaligus dengan sengaja:
     - lifecycle akun  : lead, mql, prospect, sql, customer, free_agent, lost
     - status deal     : OPEN, IN_REVIEW, QUOTED, NEGOTIATION, WON, LOST, CANCELLED
   StatusBar generik dan tak tahu sumbu mana yang sedang dirender; ia cuma
   melihat kunci. Menaruh keduanya di satu peta membuat komponennya tetap
   bodoh, dan mencegah dua tabel warna yang pasti melenceng suatu hari.

   ⚠️ Kosakata lifecycle di sini memakai URUTAN BARU (keputusan Den, batch
   persiapan CRM v3): lead → mql → prospect → sql → customer, di mana
   `prospect` (ada inquiry) MENDAHULUI `sql` (quotation terkirim).
   ========================================================================= */
export const TONE = {
  slate:  { fg: SLATE,  bg: SLATE_SOFT,  bd: '#D8DEE7' },
  orange: { fg: ORANGE, bg: ORANGE_SOFT, bd: '#F6CDB6' },
  navy:   { fg: NAVY,   bg: NAVY_SOFT,   bd: '#C3D3E8' },
  brick:  { fg: BRICK,  bg: BRICK_SOFT,  bd: '#E3C4BB' },
};

export const STAGE_TONE = {
  /* lifecycle akun */
  lead:        'slate',
  mql:         'slate',
  free_agent:  'slate',
  prospect:    'orange',
  sql:         'orange',
  customer:    'navy',
  lost:        'brick',
  /* status deal (inquiries.status) */
  OPEN:        'orange',
  IN_REVIEW:   'orange',
  QUOTED:      'orange',
  NEGOTIATION: 'orange',
  WON:         'navy',
  LOST:        'brick',
  CANCELLED:   'brick',
};

/* Status yang berarti "sudah ditutup" — StatusBar merender ribbon penutup,
   bukan bar yang berhenti di tengah. */
export const CLOSED_STAGES = ['lost', 'free_agent', 'WON', 'LOST', 'CANCELLED'];

export const toneOf = (stage) => TONE[STAGE_TONE[stage] || 'slate'];

/* Bangun props `closed` StatusBar dari satu nilai status. Tinggal di sini,
   bukan di StatusBar.jsx, supaya file komponen itu hanya meng-export
   komponen (syarat react-refresh/only-export-components). */
export const closedFrom = (stage, labelMap = {}) =>
  (stage ? { stage, label: labelMap[stage] || stage } : null);
export const isClosedStage = (stage) => CLOSED_STAGES.includes(stage);

/* =========================================================================
   STATUS_LABEL — SATU-SATUNYA sumber teks status deal (inquiries.status).

   Tinggal di sini, bukan di salah satu halaman, karena dua layar memakainya
   dan dulu keduanya punya salinan sendiri yang melenceng: badge di Deal List
   menulis 'Open'/'In Review' sementara chip filternya menulis 'Baru'/'Menunggu
   Harga' — satu status tampil dua nama di layar yang sama.

   Dipakai: InquiryListPage (badge tabel, badge modal, chip filter) dan
   PipelineKanbanPage (header lajur papan). Tambah/ubah teks CUKUP di sini.

   ⚠️ Ini teks murni. Warnanya TIDAK di sini — badge Deal List punya paletnya
   sendiri (STATUS_META), papan Pipeline punya STAGE_TONE + palet `step`-nya.
   ========================================================================= */
export const STATUS_LABEL = {
  OPEN:        'Open',
  IN_REVIEW:   'In Review',
  QUOTED:      'Quoted',
  NEGOTIATION: 'Negotiation',
  WON:         'Won',
  LOST:        'Lost',
  CANCELLED:   'Cancelled',
};

/* ---------- urutan kanonik dua sumbu (dipakai halaman pemanggil) ---------- */
export const LIFECYCLE_ORDER = ['lead', 'mql', 'prospect', 'sql', 'customer'];
export const DEAL_STATUS_ORDER = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION', 'WON'];

/* ---------- entitas (nama resmi — README/AGENTS.md) ---------- */
export const ENTITIES = [
  { code: 'MSI', id: '0e1840d8-e6fb-4190-bd09-88338e68b492', name: 'PT Milenial Solusi Internusa' },
  { code: 'JCI', id: '42569e7c-531b-4d2b-832a-d5a7268c455b', name: 'PT Jago Custom Indonesia' },
  { code: 'SOA', id: 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', name: 'PT Stuja Orbit Abadi' },
];
