// src/modules/crm/inquiryTheme.js
// Putaran 16a -- adaptor warna sage KHUSUS layar Inquiry Management.
// Keputusan Mas (J-043 butir 7): palet sage di Inquiry Management
// menggantikan larangan impor kit #61 (CLAUDE.md), TERBATAS pada empat
// berkas Task 2 (InquiryListPage/InquiryOwnerAssignmentPage/
// InquiryClassificationPage/InquiryIntakeWizardPage). Nol hex literal di
// berkas ini -- setiap nilai ditelusur ke src/kit/tokens.js.
//
// Dua objek diekspor, bentuknya (nama key) SAMA PERSIS dengan `const C`
// lokal yang sudah ada hari ini di keempat berkas itu, supaya diff
// per-berkas tinggal ganti sumber nilai (hardcode -> impor), bukan
// mengganti nama key atau call-site `C.xxx`:
//   - `C`        -- dipakai InquiryListPage.jsx, InquiryOwnerAssignmentPage.jsx,
//                   InquiryClassificationPage.jsx (ketiganya share SATU shape
//                   warm-beige identik; diverifikasi grep sebelum ditulis).
//   - `WIZARD_C` -- dipakai InquiryIntakeWizardPage.jsx (shape navy/orange
//                   lama berbeda total dari warm-beige di atas -- `orange`
//                   sebagai NAMA KEY muncul di kedua shape dengan ARTI
//                   berbeda, jadi TIDAK bisa digabung jadi satu objek `C`
//                   tanpa tabrakan makna; nama export `WIZARD_C` cukup
//                   diimpor ulang `import { WIZARD_C as C } from './inquiryTheme'`
//                   di berkas wizard supaya call-site `C.xxx`-nya tetap
//                   tidak berubah satu huruf pun).
//
// ⚠️ Satu kehati-hatian WAJIB dibaca sebelum mengedit nilai di bawah:
// beberapa key lama (terutama `navy`/`orange` di WIZARD_C dan `accent` di
// `C`) dipakai di LEBIH dari satu peran visual di kode asalnya (kadang
// sebagai warna TEKS/ikon, kadang sebagai warna LATAR tombol solid dengan
// teks putih di atasnya). Palet sage TIDAK punya satu hex yang aman untuk
// kedua peran itu sekaligus -- ACCENT (#C3D9B8) gagal kontras AA sebagai
// teks ATAU sebagai latar solid + teks putih (lihat komentar kit/tokens.js
// baris 19-22: "Teks PUTIH di atas aksen sage GAGAL AA ... pola lama
// 'solid navy/oranye + teks putih' menjadi LATAR AKSEN + TEKS INK").
// Karena itu pemetaan di bawah TIDAK selalu 1 nilai lama -> 1 token kit
// yang sama di SEMUA titik pakai -- di titik yang perannya beda (warna
// teks di atas latar terang, atau latar terang dengan teks putih lama),
// Task 2 mengganti rujukannya ke KEY LAIN yang sudah ada di objek yang
// sama (mis. `C.navy`/`C.orange` sebagai teks diganti rujukannya jadi
// `C.text`/`C.ink`; latar solid lama + teks putih diganti jadi
// `C.navySoft`/`C.accentSoft` + teks `C.text`/`C.ink`) -- BUKAN menambah
// hex baru di sini. Tabel lengkap per titik: laporan chat Putaran 16a
// Prompt A §2.
import {
  BG, CARD, ACCENT, ACCENT_HOVER, ACCENT_2, LINE, LINE_SOFT, INK, INK_SOFT, INK_FAINT,
  HEAD_BG, ROW_HOVER, DISABLED_BG, WHITE, DEAL_STATUS, SHADOW_DROP, SHADOW_MODAL, BACKDROP,
  SEMANTIC, TONE,
} from '../../kit/tokens';

/* =========================================================================
   `C` -- dipakai InquiryListPage.jsx / InquiryOwnerAssignmentPage.jsx /
   InquiryClassificationPage.jsx (shape warm-beige, identik di ketiganya).

   | key lama (hex lama)        | konstanta kit     | nilai kit  | nilai mockup |
   |-----------------------------|--------------------|------------|--------------|
   | bg        (#F6EFE3)        | BG                 | #F6F8F3    | #F6F8F3      |
   | surface   (#FFFDF8)        | CARD               | #FFFFFF    | #FFFFFF      |
   | surface2  (#FBF6EC)        | HEAD_BG            | #EFF3ED    | #EFF3ED      |
   | ink       (#23291E)        | INK                | #33422B    | #33422B      |
   | inkSoft   (#5E6553)        | INK_SOFT           | #5C6B52    | #5C6B52      |
   | inkFaint  (#8A8E7C)        | INK_FAINT          | #838E7A    | #838E7A      |
   | line      (#E7DCC8)        | LINE               | #D8E0D2    | #D8E0D2      |
   | lineSoft  (#F0E7D6)        | LINE_SOFT          | #ECF0E9    | #ECF0E9      |
   | accent    (#E85A1E)        | ACCENT             | #C3D9B8    | #C3D9B8      |
   | accentSoft(#FEF2EC)        | ROW_HOVER          | #E4EDDE    | #E4EDDE      |
   | ok/okBg/okBd                | SEMANTIC.ok        | lihat kit  | identik kit  |
   | warn/warnBg/warnBd          | SEMANTIC.warn      | lihat kit  | identik kit  |
   | danger/dangerBg/dangerBd    | SEMANTIC.danger    | lihat kit  | identik kit  |
   | info/infoBg/infoBd          | SEMANTIC.info      | lihat kit  | identik kit  |
   | neutral/neutralBg/neutralBd | SEMANTIC.neutral   | lihat kit  | identik kit  |
   | purple/teal/orange (+Bg/Bd) | -- KODE MATI --    | lihat ket. | tidak ada    |

   `purple`/`teal`/`orange`(+Bg/Bd) HANYA ada di InquiryListPage.jsx dan
   nol dipakai di manapun (diverifikasi grep sebelum file ini ditulis) --
   dipertahankan supaya bentuk objek identik dgn `const C` lama, nilainya
   trio TONE yang valid sembarang (nol dampak visual, kode mati, nol hex
   literal). JANGAN dipakai di kode baru.
   ========================================================================= */
export const C = {
  bg:         BG,
  surface:    CARD,
  surface2:   HEAD_BG,
  ink:        INK,
  inkSoft:    INK_SOFT,
  inkFaint:   INK_FAINT,
  line:       LINE,
  lineSoft:   LINE_SOFT,
  accent:     ACCENT,
  accentSoft: ROW_HOVER,
  ok:      SEMANTIC.ok.fg,      okBg: SEMANTIC.ok.bg,      okBd: SEMANTIC.ok.bd,
  warn:    SEMANTIC.warn.fg,    warnBg: SEMANTIC.warn.bg,  warnBd: SEMANTIC.warn.bd,
  danger:  SEMANTIC.danger.fg,  dangerBg: SEMANTIC.danger.bg, dangerBd: SEMANTIC.danger.bd,
  info:    SEMANTIC.info.fg,    infoBg: SEMANTIC.info.bg,  infoBd: SEMANTIC.info.bd,
  neutral: SEMANTIC.neutral.fg, neutralBg: SEMANTIC.neutral.bg, neutralBd: SEMANTIC.neutral.bd,
  // Kode mati -- lihat catatan di atas.
  purple:  TONE.navy.fg,   purpleBg: TONE.navy.bg,   purpleBd: TONE.navy.bd,
  teal:    TONE.slate.fg,  tealBg: TONE.slate.bg,    tealBd: TONE.slate.bd,
  orange:  TONE.orange.fg, orangeBg: TONE.orange.bg, orangeBd: TONE.orange.bd,
};

/* =========================================================================
   `WIZARD_C` -- dipakai InquiryIntakeWizardPage.jsx (shape navy/orange).

   | key lama (hex lama)         | konstanta kit  | nilai kit | nilai mockup |
   |-------------------------------|-----------------|-----------|--------------|
   | navy        (#1B4D8A)        | INK_SOFT        | #5C6B52   | #5C6B52 (border kartu/pil aktif, pola og.svc/dir/cargo/addl) |
   | navyDark    (#0F3768)        | ACCENT_HOVER    | #AFC9A0   | tak terpakai pasca-edit, disediakan utk kelengkapan bentuk  |
   | navySoft    (#EEF3FB)        | ROW_HOVER       | #E4EDDE   | #E4EDDE (latar kartu/pil aktif, pola og.svc/dir/cargo/addl) |
   | orange      (#E85A1E)        | ACCENT          | #C3D9B8   | #C3D9B8 (tombol primer Next/Create Inquiry)                |
   | orangeDark  (#C94D18)        | ACCENT_HOVER    | #AFC9A0   | #AFC9A0 (hover tombol primer)                               |
   | orangeSoft  (#FDF0E9)        | ROW_HOVER       | #E4EDDE   | tak terpakai pasca-edit (lihat navySoft)                    |
   | pageBg      (#F8FAFC)        | BG              | #F6F8F3   | #F6F8F3                                                     |
   | card        (#FFFFFF)        | CARD            | #FFFFFF   | #FFFFFF                                                     |
   | border      (#E2E8F0)        | LINE            | #D8E0D2   | #D8E0D2                                                     |
   | borderStrong(#CBD5E1)        | INK_FAINT       | #838E7A   | tak terpakai pasca-edit                                     |
   | text        (#0F172A)        | INK             | #33422B   | #33422B                                                     |
   | sub         (#475569)        | INK_SOFT        | #5C6B52   | #5C6B52 (label field, teks sekunder)                        |
   | muted       (#94A3B8)        | INK_FAINT       | #838E7A   | #838E7A (placeholder/ikon dekoratif/border ghost button)    |
   | success     (#16A34A)        | SEMANTIC.ok.fg  | #2D794D   | kode mati (nol pemanggil C.success, diverifikasi grep)       |
   | warning     (#F59E0B)        | SEMANTIC.warn.fg| #8E620D   | #8E620D (asterisk wajib, lihat req di bawah)                |
   | error       (#DC2626)        | SEMANTIC.danger.fg | #B23227 | identik kit                                                 |
   | headBg      -- BARU, bukan ganti --| HEAD_BG  | #EFF3ED   | #EFF3ED (latar lingkaran ikon kartu NON-aktif; dulu hardcode #F1F5F9 di luar objek C, 3 titik) |
   | warningBg/warningBorder -- BARU --  | SEMANTIC.warn.bg/.bd | #F8ECCF/#E6CE94 | dipakai LOCATION_PICKER_TOKENS.warnBg/.warnBorder (dulu hardcode #FEF9E7/#F2D675) |

   Dua key BARU di tabel ini (`headBg`, `warningBg`/`warningBorder`) TIDAK
   menggantikan key manapun -- menamai peran warna yang tadinya hardcode DI
   LUAR objek `const C` lama (icon-circle non-aktif ServiceCard/CargoCard/
   TagCard; trio warning LOCATION_PICKER_TOKENS), supaya hex itu juga bisa
   dihapus dari JSX (Task 2.1 "hex hardcode warna layar" -- bukan hanya key
   C yang sudah ada).
   ========================================================================= */
export const WIZARD_C = {
  navy:          INK_SOFT,
  navyDark:      ACCENT_HOVER,
  navySoft:      ROW_HOVER,
  orange:        ACCENT,
  orangeDark:    ACCENT_HOVER,
  orangeSoft:    ROW_HOVER,
  pageBg:        BG,
  card:          CARD,
  border:        LINE,
  borderStrong:  INK_FAINT,
  text:          INK,
  sub:           INK_SOFT,
  muted:         INK_FAINT,
  success:       SEMANTIC.ok.fg,
  warning:       SEMANTIC.warn.fg,
  error:         SEMANTIC.danger.fg,
  headBg:        HEAD_BG,
  warningBg:     SEMANTIC.warn.bg,
  warningBorder: SEMANTIC.warn.bd,
  lineSoft:      LINE_SOFT, // BARU -- satu titik border `RecentInquiriesAside` yang dulu hardcode #ECF0E9 (nilainya kebetulan SUDAH identik LINE_SOFT)
  disabledBg:    DISABLED_BG, // BARU -- latar field terkunci/read-only (dulu hardcode #E8ECE4 di luar objek C -- nilainya kebetulan SUDAH identik DISABLED_BG)
};

/* =========================================================================
   `DEAL_C` -- dipakai DealDetailPage.jsx, dealOverviewFieldInputs.jsx,
   src/modules/crm/inquiryParts.jsx (fork lokal Card/InfoRow/PriceSummaryCard,
   Putaran 16a Tahap 1). Shape SAMA PERSIS `const C` DealPanels.jsx -- impor
   ulang `import { DEAL_C as C } from './inquiryTheme'` supaya call-site
   `C.xxx` di ketiga berkas itu tidak berubah satu huruf pun.
   DealPanels.jsx SENDIRI TIDAK DISENTUH (dilarang eksplisit) -- objek ini
   hanya MENIRU bentuknya dari luar.

   | key lama (hex lama)         | konstanta kit     | catatan |
   |-------------------------------|---------------------|---------|
   | navy      (#1B4D8A)          | INK                 | SELURUH 16 titik pakai di DealDetailPage.jsx adalah teks/link/ikon/border-tipis, nol pakai sbg latar solid (diverifikasi grep) -- INK juga aman sbg latar solid+teks putih (kontras 12,4:1, dihitung manual) utk kotak "Best Quote" PriceSummaryCard |
   | navySoft  (#EAF0F8)          | ROW_HOVER           | latar tint terang (konsisten pola WIZARD_C.navySoft) |
   | orange    (#E85A1E)          | ACCENT              | tombol solid "Create Quotation"/"Create PRF" -- teks WAJIB C.text (INK), BUKAN putih (ACCENT pucat gagal AA) |
   | orangeSoft(#FEF2EC)          | ROW_HOVER           | tak terpakai pasca-edit (konsisten pola WIZARD_C) |
   | text      (#16243A)          | INK                 | |
   | textMute  (#5E6553)          | INK_SOFT            | |
   | textFaint (#8A8E7C)          | INK_FAINT           | |
   | surface   (#FFFFFF)          | CARD                | |
   | surfaceAlt(#FBF6EC)          | HEAD_BG             | |
   | border    (#E7DCC8)          | LINE                | |
   | borderStrong(#D9CDB6)        | INK_FAINT           | |
   | green/greenBg/greenBd        | SEMANTIC.ok.*       | |
   | red/redBg/redBd              | SEMANTIC.danger.*   | |
   | blue/blueBg/blueBd           | SEMANTIC.info.*     | |
   | amber/amberBg/amberBd        | SEMANTIC.warn.*     | JUGA dipakai utk 3 titik teks penekanan mata uang non-IDR yang SEBELUMNYA memakai `orange` sbg teks (ACCENT pucat tak terbaca sbg teks) |
   | gray/grayBg/grayBd           | SEMANTIC.neutral.*  | |
   | white -- BARU, bukan ganti -- | WHITE              | pengganti literal `'#fff'` tersisa (mis. teks di kotak "Best Quote") supaya tetap tertelusur ke kit, bukan hex lepas |
   | backdrop/shadowModal -- BARU -- | BACKDROP/SHADOW_MODAL | lihat catatan di bawah objek |

   ⚠️ `navy`/`orange` SELALU berperan TEKS/LINK/BORDER atau LATAR SOLID+TEKS
   PUTIH di ketiga berkas ini -- KEDUANYA aman dipetakan uniform (INK/ACCENT)
   karena dihitung dulu: putih di atas INK = 12,4:1 (lolos jauh di atas AA).
   SATU-SATUNYA pengecualian adalah `orange` dipakai sbg TEKS highlight mata
   uang (bukan latar) -- itu disurati ke `amber`, bukan dibiarkan `orange`
   (ACCENT pucat gagal terbaca sbg teks, pelajaran sama Prompt A).

   [Putaran 16a Tahap 1, KOREKSI atas tabel di atas -- bukan asumsi, diukur
   LANGSUNG di mockup Modal/AssignOwner, Modal/MarkWon, Modal/RevertManualWin,
   Modal/MarkLost, Modal/CancelInquiry]: TIDAK ADA tombol modal yang memakai
   `navy` solid+putih ATAU `green` solid+putih -- SELURUH tombol primer
   "terima aksi" (Reassign/Assign, Yes Mark as Won, Revert) memakai `orange`
   (ACCENT) solid + teks `text` (INK), SAMA PERSIS tombol toolbar "Create
   Quotation". Tombol danger (Mark as Lost/Cancel Inquiry) memakai
   `redBg`+`redBd`+`red` (latar PINK TER-TINT + teks merah + border ter-tint),
   BUKAN `red` solid+putih. Banner peringatan/validasi (termasuk upload
   gagal) SELALU `amberBg`/`amberBd`/`amber`, TIDAK PERNAH `red` -- SEMANTIC
   danger (#B23227 dkk) nol kemunculan di seluruh region modal mockup
   (diverifikasi grep). Komentar lama "tombol solid DealWonModals/
   DealCloseModals -- teks putih aman" di atas SUDAH DICORET -- biarkan
   trio green/red di DEAL_C seperti sekarang (dipakai SEBAGAI TRIO tint utk
   banner+tombol danger/first-win-neutral), jangan dikembalikan ke bentuk
   solid+putih. */
export const DEAL_C = {
  navy: INK,
  navySoft: ROW_HOVER,
  orange: ACCENT,
  orangeSoft: ROW_HOVER,
  text: INK,
  textMute: INK_SOFT,
  textFaint: INK_FAINT,
  surface: CARD,
  surfaceAlt: HEAD_BG,
  border: LINE,
  borderStrong: INK_FAINT,
  green: SEMANTIC.ok.fg,     greenBg: SEMANTIC.ok.bg,     greenBd: SEMANTIC.ok.bd,
  red: SEMANTIC.danger.fg,   redBg: SEMANTIC.danger.bg,   redBd: SEMANTIC.danger.bd,
  blue: SEMANTIC.info.fg,    blueBg: SEMANTIC.info.bg,    blueBd: SEMANTIC.info.bd,
  amber: SEMANTIC.warn.fg,   amberBg: SEMANTIC.warn.bg,   amberBd: SEMANTIC.warn.bd,
  gray: SEMANTIC.neutral.fg, grayBg: SEMANTIC.neutral.bg, grayBd: SEMANTIC.neutral.bd,
  white: WHITE, // BARU -- lihat tabel di atas
  bg: BG, // BARU -- banner "Next step" DealDetailPage.jsx, diukur persis mockup data-screen-label="Detail/NextStep": background:#F6F8F3 (BUKAN navySoft lama -- lihat laporan chat Tahap 1 §4)
  lineSoft: LINE_SOFT, // BARU -- border banner "Next step" yang sama, mockup: border:1px solid #ECF0E9
  accentHover: ACCENT_HOVER, // BARU [Putaran 16a Tahap 0] -- tombol Save inline-edit Overview (diukur mockup: Save = bg/border #AFC9A0, BUKAN plain ACCENT #C3D9B8) + border chip terpilih (diukur: on.bd #AFC9A0)
  backdrop: BACKDROP, // BARU [Putaran 16a Tahap 1] -- overlay 4 modal (OwnerAssignModal/DealWonModals/DealCloseModals/ChangeAccountModal), diukur mockup data-screen-label="Modal/*": background:rgba(51,66,43,.35) (INK, BUKAN rgba(22,36,58,.45) navy lama)
  shadowModal: SHADOW_MODAL, // BARU [Putaran 16a Tahap 1] -- sheet 4 modal yang sama, diukur mockup: box-shadow:0 24px 48px rgba(51,66,43,.22), NOL border (border lama C.border dicabut)
};

/* Status inquiry (badge tinted rounded-square) -- STATUS_META di
   InquiryListPage.jsx/InquiryOwnerAssignmentPage.jsx/
   InquiryClassificationPage.jsx dan STATUS_BADGE di
   InquiryIntakeWizardPage.jsx dibiarkan APA ADANYA / diselaraskan LANGSUNG
   ke DEAL_STATUS kit di berkasnya masing-masing (Prompt A §6), BUKAN
   di-passthrough lewat objek C/WIZARD_C di atas.
   `DEAL_STATUS` TETAP diekspor di bawah (primitif mentah) -- dibutuhkan
   v3/StatusBar.jsx (Putaran 16a Tahap 1) untuk penanda penutupan WON/
   LOST/CANCELLED, "Warna status tetap DEAL_STATUS dari kit" (instruksi
   Tahap 1 butir 6). */

/* =========================================================================
   PRIMITIF MENTAH -- diekspor ulang APA ADANYA (nol transformasi) untuk
   v3/StatusBar.jsx, v3/FormSheet.jsx, v3/Notebook.jsx (Putaran 16a Tahap 1,
   diedit DI TEMPAT, bukan lewat C/WIZARD_C karena shape ketiga file itu
   bukan objek `const C` bergaya lama -- masing-masing mengimpor konstanta
   lepas langsung dari './tokens'). Satu-satunya tujuan blok ini: ketiga
   file itu tetap "warna sage hanya lewat inquiryTheme.js" tanpa mengimpor
   src/kit/tokens.js langsung.
   ========================================================================= */
export { CARD, ACCENT, ACCENT_2, INK, INK_SOFT, LINE, WHITE, DEAL_STATUS, SHADOW_DROP };
