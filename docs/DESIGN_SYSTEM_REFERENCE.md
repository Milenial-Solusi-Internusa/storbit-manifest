# Nexus Design System — Dokumen Rujukan

> ⛔ **STATUS KESELURUHAN (19 Sep 2026): KEBIJAKAN SUDAH DIPUTUSKAN, KODE BELUM DIUBAH — SENGAJA DITUNDA MENUNGGU INSTRUKSI DEN.** Bagian **A** di bawah memuat keputusan Den 19 Sep 2026: palet aplikasi **sage** + **tiga font resmi** + arah **satu kit tunggal**. **Tidak satu pun dari itu sudah ada di kode** — penyatuan kit, penggantian warna/font, dan dua temuan TD-269/TD-270 **BELUM dikerjakan**. Bagian §0–§17 memotret kode `main` @ `660168f` apa adanya (palet navy/oranye lama, tiga keluarga token, font legacy) dan **tetap benar sebagai gambaran kode hari ini**. Siapa pun (termasuk sesi Claude Code lain) yang membaca dokumen ini: **jangan mengira kodenya sudah sesuai palet sage, dan jangan mengimplementasikannya sepihak** sebelum ada instruksi.
>
> **Status audit:** hasil AUDIT read-only 19 Sep 2026 (kode `main` @ `660168f`). Nol baris kode diubah; §0–§17 hanya MEMOTRET apa yang ada.
> **Sumber yang dibaca utuh:** `src/pages/foundation/admin-settings/{kit.jsx,tokens.js}` · `src/modules/crm/v3/{kit.jsx,tokens.js,FormSheet.jsx,Notebook.jsx,StatusBar.jsx,ListView.jsx,Chatter.jsx,__demo/CrmV3DemoPage.jsx}` · `src/modules/logistics/{printKit.jsx,printTokens.js}` · `src/modules/hrga/hrga-tokens.js` · `src/modules/admin/pages/userAccessTokens.js` · `src/index.css` · `tailwind.config.js` · `index.html` · blok gaya global & `NexusSidebar` di `src/App.jsx` · `src/components/ConfirmModal.jsx`.
> **Tujuan:** satu rujukan saat mengimplementasikan tampilan baru (termasuk dari mockup alat AI seperti Google Stitch) supaya konsisten dengan yang sudah ada. Semua angka di sini **disalin dari kode**, bukan perkiraan; kalau kode dan dokumen ini berbeda, kode yang benar — perbarui dokumen ini.
> **Aturan yang lebih tinggi:** `CLAUDE.md` (Brand) → `docs/Governance/02_RULES_GOVERNANCE.md §5` → `docs/Governance/06_UI_UX_FLOW.md`. Dokumen ini tidak menggantikan ketiganya; ia merinci angka-angkanya dan mencatat di mana kode sudah menyimpang (§17).

---

## A. Kebijakan resmi (keputusan Den 19 Sep 2026) & arah penyatuan kit — ⛔ BELUM DIKERJAKAN

### A.1 Palet resmi tampilan APLIKASI internal Nexus — "sage"

| Token | Hex | Pakai |
|---|---|---|
| Latar halaman | `#F6F8F3` | background shell / halaman |
| Latar kartu | `#EEF3EA` | kartu, panel, surface |
| Aksen utama | `#C3D9B8` | tombol utama, item aktif, highlight — **hover `#AFC9A0`** |
| Aksen kedua | `#D7C9B0` | aksi sekunder, penanda pendukung — **hover `#C9B896`** |
| Border | `#D8E0D2` | garis, pembatas, border kartu/input |
| Teks utama | `#33422B` | heading, body |
| Teks sekunder | `#5C6B52` | label, subtitle, teks redup |

- Palet sage **menggantikan seluruh navy dan oranye lama sebagai warna aplikasi**. Hex navy/oranye yang muncul di §0–§17 di bawah adalah **keadaan kode hari ini**, bukan warna resmi.
- ⚠️ **Khusus tampilan aplikasi internal.** Dokumen yang dikirim ke customer — **Print kit** (`src/modules/logistics/printKit.jsx` + `printTokens.js`), **PDF Storbit** (Picking List, Surat Jalan, Invoice, Laporan Storbit), Quotation PDF — **tetap memakai warna brand entitas MSI/JCI/SOA yang asli, TIDAK ikut berubah, dan TIDAK disentuh keputusan ini** (§15 tetap berlaku apa adanya).

### A.2 Font resmi — TIGA saja
**Montserrat** (heading/display) · **Inter** (body) · **IBM Plex Mono** (angka & kode). Font lain apa pun tidak resmi. Yang hari ini masih ada di kode dan **belum dibersihkan**: tumpukan font legacy (`index.css:1`, `App.jsx:2782`, `tailwind.config.js` — TD-70, rincian §17.3) dan Cormorant/Lora di dua halaman **web** Storbit (ikut penyatuan ke tiga font — #60 a, BELUM DIKERJAKAN). **Satu pengecualian tercatat: Oswald `.kpi-value` (angka 4 KPI hero CRM Dashboard) DIPERTAHANKAN untuk saat ini** — keputusan sadar Den 20 Sep 2026 yang sengaja ditunda, **bukan kelupaan dan bukan pelanggaran** kebijakan tiga font; jangan dicatat sebagai pelanggaran saat audit ulang (#60 c).

### A.3 Arah penyatuan sistem kit — target akhir yang sudah diputuskan

**Keadaan hari ini (§1):** tiga keluarga token + kit yang kepencar — **kit CRM v3** (`src/modules/crm/v3/`, navy `#144682`), **AdminKit** (`src/pages/foundation/admin-settings/`, soft navy `#1B4D8A`), dan **52 file dengan objek token lokal sendiri-sendiri** (`const C/D/S…`, 11 di antaranya masih `const PASTEL`) + CSS `:root` shell di `index.css`.

**Target akhir yang diputuskan Den 19 Sep 2026:** **SATU sistem kit tunggal untuk seluruh aplikasi** — satu `tokens.js` bersama ber-palet **sage** (A.1) dengan **tiga font resmi** (A.2), satu set komponen (tombol, kartu, tabel/list, form, badge, modal, tab, dsb.) yang dipakai semua modul; kit CRM v3, AdminKit, dan seluruh objek token lokal **melebur ke dalamnya**, `index.css :root` + `tailwind.config.js` ikut diselaraskan (font legacy dibuang). **Dikecualikan dari penyatuan: print kit** (`printKit.jsx`/`printTokens.js` + `InvoicePDF`/`QuotationPDF`) — memang sengaja terpisah untuk dokumen customer dan tetap memakai warna brand entitas asli.

**Status: ⛔ BELUM DIKERJAKAN — murni arah tujuan yang sudah diputuskan, BUKAN klaim sudah selesai.** Belum ada `tokens.js` sage, belum ada komponen tunggal, belum ada satu halaman pun yang dimigrasi, `#144682`/`#1B4D8A`/`#E85A1E`/`#E8703D` masih hidup di kode (sebaran di §3.1). Urutan, pemecahan batch, dan halaman pertama yang dimigrasi **belum direncanakan** dan **menunggu instruksi Den**. Dua temuan kode yang ikut menunggu batch ini: **TD-269** (dark green `#2F6B3F` di 5 file) dan **TD-270** (`SaveButton` tidak menunggu Promise) — keduanya OPEN di `08_TECH_DEBT.md`, belum diperbaiki.

**Aturan selama masa tunggu — DISETUJUI Den 20 Sep 2026 (#61, bukan lagi asumsi kerja):** halaman/fitur baru yang dibuat sementara **mengikuti kit/token yang sudah ada sekarang** (tabel §0), **BUKAN langsung memakai sage duluan** — supaya tidak lahir palet KELIMA di kode (empat yang hidup: v3 `#144682`, AdminKit/shell `#1B4D8A`, warm-beige lokal, ungu/serif Storbit web). Halaman yang lahir di masa tunggu ikut dimigrasi bersama yang lain saat penyatuan.

**Keputusan #60 (Den, 20 Sep 2026) — nasib pengecualian visual lama di bawah sage:** **(a)** dua halaman **web** Storbit ber-ungu `#5b3fa0` + Cormorant/Lora (`SalesOrderDetailPage.jsx`, `StorbitDashboardPage.jsx`; §17.14) **IKUT penyatuan ke sage + tiga font** — **bukan** pengecualian dokumen customer, karena yang membukanya staff internal, bukan customer; PDF-nya tetap dikecualikan. Status: **BELUM DIKERJAKAN**, ikut batch penyatuan. **(b)** lima warna 4 tile KPI hero CRM Dashboard **TETAP warna-warni, TIDAK diseragamkan ke sage** — warna status/data dan warna identitas aplikasi adalah **dua kelas warna yang berbeda tugas**; warna status harus tetap **kontras satu sama lain** (merah tetap beda dari hijau) supaya sinyalnya tidak kabur. Ini keputusan final, **bukan pengecualian yang lupa diseragamkan**, dan bukan pekerjaan tertunda. **(c)** font Oswald di angka KPI hero **DIPERTAHANKAN untuk saat ini** — sengaja belum diganti ke tiga font resmi; keputusan sadar yang ditunda, **bukan kelupaan**, jangan dianggap pelanggaran saat audit ulang. Prinsip (b) berlaku umum untuk kelas warna status/data (turunan, bukan keputusan eksplisit): hex konkret palet status di kit tunggal ditetapkan saat penyatuan.

---

## 0. Cara membaca dokumen ini (baca ini dulu)

> Bagian ini dan seterusnya = **keadaan kode hari ini**. Kebijakan resminya ada di Bagian A; keduanya sengaja dipisah supaya "yang seharusnya" tidak tertukar dengan "yang ada".

**Tidak ada SATU design system di repo — ada TIGA keluarga token yang hidup bersamaan**, masing-masing dengan kit komponennya sendiri (inilah yang akan disatukan — A.3). Sebelum mengimplementasikan mockup apa pun selama masa tunggu, tentukan dulu kit mana yang berlaku:

| Kamu membuat/menyentuh… | Pakai | Alasan |
|---|---|---|
| Halaman **CRM** (Deal, Inquiry, Pipeline, dan halaman CRM yang menyusul dimigrasi) | **Kit CRM v3** — `src/modules/crm/v3/` (§6.1) | Kit termuda (27 Agu 2026), satu-satunya yang memakai navy brand resmi `#144682`, dan arah redesign yang sedang berjalan (Batch B1–B6). |
| Halaman **Foundation / Admin Settings / Master Data** (`AdminHub` dan turunannya) | **AdminKit** — `src/pages/foundation/admin-settings/` (§6.2) | Ditetapkan "kit resmi" untuk area ini di TD-14 (`08_TECH_DEBT.md`); 22 file sudah memakainya. |
| **Dokumen cetak gudang Storbit** (Picking List, Surat Jalan, Invoice, Laporan Storbit) | **Print kit** — `src/modules/logistics/printKit.jsx` + `printTokens.js` (§6.4, §15) | Keluarga visual ungu/krem, sengaja beda dari brand web. |
| **Dokumen cetak CRM** (Quotation PDF) | Pola `QuotationPDF.jsx` (navy/orange, Helvetica) — lihat `06_UI_UX_FLOW.md §5` | Belum ada kit; pola tercatat di §5 dokumen itu. |
| Halaman **lain** (Storbit web, Inventory, HRGA, BNF, Dashboard, Assets, …) | **Belum ada kit resmi.** Halaman-halaman ini memakai objek token lokal per file (`const C = {…}` / `const D = {…}` / `PASTEL`) — 52 file (§3.5). | Kalau harus menambah halaman di modul ini, **tiru objek token file tetangganya** di modul yang sama supaya tidak menambah palet kelima (#61, DISETUJUI); jangan mengimpor kit CRM v3/AdminKit ke sana diam-diam (preseden: token v3 sengaja TIDAK diimpor ke `QuotationListPage` — `CLAUDE.md`, entri 9-10 Sep). ⚠️ **[koreksi doc-keeper 19 Sep 2026]** Dua halaman Storbit web (`SalesOrderDetailPage.jsx`, `StorbitDashboardPage.jsx`) bukan warm-beige: mereka memakai **keluarga ungu/serif print kit** (`#5b3fa0` + Cormorant/Lora via `salesOrderDetail.module.css`) — keluarga visual **keempat** di web, lihat §17.14. **Status (20 Sep 2026, #60 a): sudah diputuskan IKUT sage + tiga font, BELUM DIKERJAKAN**; selama masa tunggu, halaman Storbit web baru tiru keduanya (#61), bukan warm-beige. |

**Aturan yang berlaku untuk SEMUA kit (dari `CLAUDE.md` / `02_RULES_GOVERNANCE.md §5`):**
- Font resmi **tiga saja**: **Montserrat** (heading/display) · **Inter** (body) · **IBM Plex Mono** (angka & kode). Oswald `.kpi-value` = satu-satunya pengecualian tercatat, **dipertahankan untuk saat ini** (sadar ditunda, bukan pelanggaran — #60 c).
- Ikon: **Lucide React saja.** ❌ emoji · ❌ inline-SVG ad-hoc · ❌ dark green (`#1a3a2a`, `#2d5a3d`, `#0F2A23`, `#173D34`, `#2F6B3F`, `#E7EFE2` — masih hidup di 5 file, **TD-269**) · ❌ font di luar tiga font resmi.
- Warna di luar palet hanya lewat pengecualian tercatat; pengecualian lama 4 tile KPI hero CRM Dashboard (`#5C6070` `#EEAA8D` `#B4E0F2` `#7FBBDA` `#5A9CC3` — peach `#EEAA8D` sejak `a709bd5` 31 Agu 2026, dokumen lama menulis `#EE9A7E`; scope komponen itu saja) **TETAP** di bawah palet sage (keputusan final #60 b: warna status/data ≠ warna identitas, harus saling kontras) — jangan disalin ke komponen lain.

---

## 1. Peta sistem — apa yang benar-benar ada di repo

| File | Lahir (git) | Isi | Pemakai (diukur `grep`) |
|---|---|---|---|
| `src/pages/foundation/admin-settings/tokens.js` (37 baris) | 14 Jun 2026 | 14 konstanta warna, 3 font, `ENTITIES`, `fmtRp`/`fmtNum` | 22 file: 11 halaman `admin-settings/` + `AdminHub.jsx` + 10 halaman master-data `src/modules/admin/pages/` |
| `src/pages/foundation/admin-settings/kit.jsx` (573 baris) | 14 Jun 2026 | **24 export** (komentar `crm/v3/kit.jsx:4` yang menyebut "20 export" sudah basi): `Icon`, `KitStyles`, `PageHeader`, `SectionLabel`, `EntitySwitcher`, `Tabs`, `FloatingInput`, `FloatingSelect`, `Toggle`, `NumberStepper`, `Segmented`, `PrimaryBtn`, `OutlineBtn`, `SaveButton`, `Tooltip`, `SlideOver`, `Modal`, `DropZone`, `UploadBox`, `useToast`, `Skel`, `Card`, `KitSelect`, `PillToggle` | sama seperti di atas |
| `src/modules/crm/v3/tokens.js` (151 baris) | 27 Agu 2026 | warna brand resmi + `SP`/`RADIUS` + `TONE`/`STAGE_TONE`/`CLOSED_STAGES`/`STATUS_LABEL` + urutan sumbu + `ENTITIES` (ber-UUID) | `DealDetailPage`, `InquiryListPage`, `PipelineKanbanPage` + 5 komponen v3 |
| `src/modules/crm/v3/kit.jsx` (116 baris) | 27 Agu 2026 | 6 primitif: `Badge`, `Card`, `DocNo`, `EmptyState`, `PrimaryBtn`, `OutlineBtn` | `PipelineKanbanPage` (langsung) + `FormSheet`/`ListView` |
| `src/modules/crm/v3/FormSheet.jsx` · `Notebook.jsx` · `StatusBar.jsx` · `ListView.jsx` · `Chatter.jsx` | 27 Agu 2026 (revisi 4 Sep) | 5 komponen layout | `DealDetailPage` (FormSheet+Notebook+ListView+StatusBar) · `InquiryListPage` (ListView table) · `PipelineKanbanPage` (ListView lanes). **`Chatter` v3 = NOL pemakai produksi** (Detail Deal masih `InquiryChatter.jsx` lama). |
| `src/modules/crm/v3/__demo/CrmV3DemoPage.jsx` | 27 Agu 2026 | etalase 5 primitif, data dummy, **tidak di-route** | pengganti Storybook (repo tak punya `*.stories.*`) |
| `src/modules/logistics/printTokens.js` (160 baris) + `printKit.jsx` (143 baris) | 31 Agu 2026 | skala `px()`, palet ungu/krem, font Lora + Cormorant, `StyleSheet` `s`, 7 komponen react-pdf | `PickingListPDF`, `DeliveryNotePDF`, `InvoicePDF`, `StorbitReportPDF` |
| `src/modules/hrga/hrga-tokens.js` (96 baris) | — | objek `D` warm-beige + status/kategori HRGA + CSS tabel `.hg-tbl` | `HrgaShared.jsx` (→ seluruh HRGA) |
| `src/modules/admin/pages/userAccessTokens.js` (49 baris) | — | objek `PASTEL` 17 warna + `NAVY`/`ORANGE`/`RED` | 5 file User Access / Role |
| `src/index.css` (89 baris) | 9 Mei 2026 (rebrand 1 Jul 2026) | CSS `:root` palet shell soft-navy + 9 pastel modul + helper responsif `.nx-*` | global |
| `src/App.jsx` `PASTEL` (`:105`) + `NAV_TONES` (`:1267`) + blok `<style>` (`:2781-2826`) | — | cermin JS dari `:root`, gaya shell/sidebar, kelas font legacy | shell |

> ⚠️ Dua file bernama `kit.jsx` dan dua `tokens.js` **bukan** satu sistem: `crm/v3/kit.jsx:4` menyatakan dirinya "BUKAN pengganti admin-settings/kit.jsx", dan `crm/v3/tokens.js:7-11` menjelaskan kenapa **sengaja terpisah** (navy berbeda; v3 harus bisa berubah tanpa menyentuh Admin Settings).

---

## 2. Fondasi global (shell aplikasi)

### 2.1 Pemuatan font
- `index.html` memuat dari Google Fonts: **Montserrat** 300/400/600/700/900 · **Inter** 400/500/600/700 · **IBM Plex Mono** 500/600/700 · **Oswald** 600/700 (`display=swap`).
- `src/index.css:1` **dan** `src/App.jsx:2782` masih meng-`@import` tumpukan legacy: **Plus Jakarta Sans, Fraunces, Space Grotesk, JetBrains Mono** — keempatnya **bukan font resmi** (kebijakan tiga font, Bagian A.2); pembersihannya = TD-70, **belum dikerjakan** (lihat §17.3).
- `body` (`index.css:37`): `font-family: 'Inter', 'Plus Jakarta Sans', system-ui, sans-serif` · warna `#212A37` · latar `#F2F5F9` · antialiased. `h1–h6` (`index.css:45`): `'Montserrat', 'Inter', system-ui, sans-serif`.

### 2.2 Cara menulis font di kode (kedua kit)
```js
FONT_HEAD = "'Montserrat', system-ui, sans-serif"
FONT_BODY = "'Inter', system-ui, sans-serif"
FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace"
```
Nilainya **identik** di `admin-settings/tokens.js:24-26` dan `crm/v3/tokens.js:51-53`. Selalu tulis lewat konstanta ini, **bukan** kelas Tailwind `font-mono`/`font-display`/`font-numeric` (kelas-kelas itu = JetBrains Mono / Fraunces / Space Grotesk, lihat §17.3).

### 2.3 CSS variables shell (`src/index.css:12-33`)
| Var | Hex | Peran | Dipakai `var(--x)` (hitungan di `src/`) |
|---|---|---|---|
| `--navy` | `#1B4D8A` | soft navy (komentar kode: "replaces old pekat #144682") | 11 |
| `--navy-d` | `#143C6E` | navy gelap | 0 |
| `--ink` | `#212A37` | teks utama | 4 |
| `--mute` | `#7E8899` | teks sekunder | 5 |
| `--faint` | `#A6AEBD` | teks paling samar | 11 |
| `--orange` | `#E8703D` | aksen (⚠️ bukan `#E85A1E`) | 0 |
| `--bg` | `#F2F5F9` | latar halaman | 0 |
| `--card` | `#FFFFFF` | kartu | 0 |
| `--line` | `#E8ECF2` | garis | 2 |
| `--p-blue` / `--p-blue-i` | `#E9F1FC` / `#3D6BAB` | pastel modul CRM (bg / ikon) | 5 |
| `--p-violet` / `-i` | `#F0EBFB` / `#7A5EBE` | Daftar Pesanan | 0 |
| `--p-amber` / `-i` | `#FCF2E3` / `#C0863A` | Inventory | 0 |
| `--p-green` / `-i` | `#E7F4ED` / `#479467` | Finance | 0 |
| `--p-peach` / `-i` | `#FDEDE4` / `#D4744A` | Procurement | 1 |
| `--p-teal` / `-i` | `#E5F2F4` / `#3F8E9E` | Logistic | 0 |
| `--p-rose` / `-i` | `#F9EBF2` / `#B25E94` | HRGA | 0 |
| `--p-indigo` / `-i` | `#EBECF9` / `#5B61B4` | Reporting | 0 |
| `--p-slate` / `-i` | `#EDF0F4` / `#525E70` | Foundation | 0 |

Cermin JS-nya: `App.jsx` `PASTEL` (`:105-124`; `cream: '#F2F5F9'`, `ink '#212A37'`, `inkSoft '#4A5360'`, `inkMute '#7E8899'`, `line '#E8ECF2'`, `lineSoft '#EDF0F4'`, + 6 pasang pastel) dan `NAV_TONES` (`:1267`, 9 pasang `[bg, ikon]` yang sama dengan `--p-*`). Halaman Storbit/Logistics (mis. `DeliveryNoteDetailPage.jsx`) menyalin palet ini ke objek `C` lokal.

### 2.4 Kerangka layout (`App.jsx`)
- Root: `<div className="min-h-screen" style={{ background: '#F2F5F9', color: '#212A37', fontFamily: Inter }}>` (`:2780`).
- Layout: `flex flex-col lg:flex-row min-h-screen` → sidebar + `<main className="nexus-shell-bg flex-1 min-w-0 w-full overflow-x-hidden">` (`:2900`); `.nexus-shell-bg { background: #F2F5F9 }` (`:2824`).
- Pembungkus konten modul: `.nexus-main-surface` `px-5 sm:px-7 xl:px-9 py-6 lg:py-7` (`:3140`) → padding horizontal **20px** (<640) / **28px** (≥640) / **36px** (≥1280); vertikal **24px** (<1024) / **28px** (≥1024).
- **Sidebar** (`NexusSidebar`, `:1542`): desktop `hidden lg:flex w-[248px] sticky top-0 h-screen`; latar **`#FFFFFF`**, `borderRight: 1px solid var(--line)`, teks `var(--ink)`. Drawer mobile: `w-[264px] max-w-[85vw] fixed z-50`, bayangan terbuka `0 12px 40px rgba(20,42,80,0.22)`, overlay `rgba(0,0,0,0.42)` `z-40`. Baris nav: `padding 7px 10px`, font 12.5 / 500 (aktif 600), aktif bg `var(--p-blue)` teks `var(--navy)`, hover `#F5F7FA`; bubble ikon 30×30 radius 9 (`NAV_TONES`); badge "soon" 9px/700 `rgba(232,112,61,0.14)`/`#E8703D`.
  ⚠️ Deskripsi sidebar "gradient navy" di `06_UI_UX_FLOW.md §1` sudah **tidak sesuai kode** — lihat §17.
- Tanda merek di sidebar/header mobile: teks **Nexus `#144682`** + **BY MSI `#E85A1E`**, hex literal (keputusan sadar, `06_UI_UX_FLOW.md §1`).
- Gaya shell lain (`App.jsx:2781-2826`): scrollbar 8px (`track lineSoft`, `thumb line`, hover `inkMute`); `.nexus-main-surface .rounded-3xl { box-shadow: 0 14px 34px rgba(15,42,35,.045) }`; `.nexus-command-button` `0 10px 24px rgba(15,42,35,.055)`; animasi `slideIn .3s` / `fadeIn .2s` / `slideUp .4s` / `dropdownIn .14s` / `accordionDown .14s` dengan easing `cubic-bezier(0.16, 1, 0.3, 1)`.

### 2.5 Tailwind
`tailwind.config.js` hanya meng-extend `fontFamily` (`sans` = Plus Jakarta Sans, `display` = Fraunces, `numeric` = Space Grotesk, `mono` = JetBrains Mono) — **nol** warna/spacing/breakpoint kustom; breakpoint = default Tailwind (§13). Tailwind dipakai untuk layout utilitas (`flex`, `grid`, `px-*`, `rounded-2xl`, `hidden lg:flex`), **bukan** untuk warna brand — warna brand ditulis inline lewat token.

---

## 3. Warna

### 3.1 Palet resmi (sage) vs palet LAMA yang masih hidup di kode

**Resmi sejak 19 Sep 2026 (Bagian A.1, belum di kode):** latar halaman `#F6F8F3` · latar kartu `#EEF3EA` · aksen utama `#C3D9B8` (hover `#AFC9A0`) · aksen kedua `#D7C9B0` (hover `#C9B896`) · border `#D8E0D2` · teks utama `#33422B` · teks sekunder `#5C6B52`. **Nol kemunculan** ketujuh hex ini di `src/` hari ini.

**Yang hidup di kode (palet LAMA — akan digantikan seluruhnya saat penyatuan):**

| Nama | Kit CRM v3 | AdminKit | Shell `:root` / `PASTEL` | Padanan sage (target) |
|---|---|---|---|---|
| Navy (aksen/tombol utama) | `#144682` | `#1B4D8A` | `#1B4D8A` | aksen utama `#C3D9B8` / hover `#AFC9A0` |
| Navy dark | `#0E3260` | `#0F3666` | `#143C6E` | hover aksen utama `#AFC9A0` |
| Orange (aksen kedua/CTA) | `#E85A1E` | `#E85A1E` | `#E8703D` | aksen kedua `#D7C9B0` / hover `#C9B896` |
| Orange hover | `#D14E18` (+ `#C24A14` utk teks putih) | `#D14E18` | — | hover aksen kedua `#C9B896` |
| Coral | `#F08C7D` | — | — | (tidak ada padanan; dokumen customer saja) |
| Cream | `#F6EFE3` | `#F6EFE3` | — | latar kartu `#EEF3EA` |
| Surface kartu | `#FFFFFF` | `#FFFDF8` | `#FFFFFF` | latar kartu `#EEF3EA` |
| Latar halaman | (ikut shell) | (ikut shell) | **`#F2F5F9`** | latar halaman `#F6F8F3` |
| Border | `#E5E0D8` | `#E5E0D8` | `#E8ECF2` | border `#D8E0D2` |
| Teks utama | `#16243A` | `#16243A` | `#212A37` | teks utama `#33422B` |
| Teks sekunder | `#4A5360` / `#6B7280` / `#9CA3AF` | sama | `#7E8899` / `#A6AEBD` | teks sekunder `#5C6B52` |

Kolom "padanan sage" = pemetaan yang **paling masuk akal** untuk dipakai saat migrasi nanti, **bukan keputusan** — tiap kit punya lebih banyak peran warna (tone status, SURFACE_2, LINE_SOFT) daripada tujuh token sage, jadi pemetaan finalnya bagian dari pekerjaan penyatuan (A.3).

Sebaran palet lama di `src/` (file / kemunculan, case-insensitive): `#144682` **23 / 36** · `#1B4D8A` **54 / 123** · `#E85A1E` **67 / 108** · `#E8703D` **9 / 10** · `#c44d18` 1 / 1 · `#D14E18` 5 / 6. Keempat hex itu **sudah bukan warna aplikasi resmi**, tapi masih di kode — jangan "dirapikan" sepihak (§17.1); penggantiannya = penyatuan kit.

Detail kecil yang konsisten di kedua kit: **fokus & bayangan selalu memakai rgba dari `#144682`** (`rgba(20,70,130,…)`) meski border AdminKit memakai `#1B4D8A`.

### 3.2 Token warna Kit CRM v3 (`src/modules/crm/v3/tokens.js`)

| Token | Hex | Peran |
|---|---|---|
| `NAVY` | `#144682` | brand, teks/tombol utama, segmen "dilewati" StatusBar, WON |
| `NAVY_DK` | `#0E3260` | navy gelap (belum dipakai komponen v3) |
| `NAVY_SOFT` | `#EAF0F8` | latar tone navy |
| `ORANGE` | `#E85A1E` | aksen, tone "sedang berjalan" |
| `ORANGE_DK` | `#D14E18` | oranye gelap — **jangan** untuk teks putih (4.36:1, gagal AA) |
| `ORANGE_AA` | `#C24A14` | **satu-satunya oranye yang boleh memuat teks putih** (4.90:1). Dipakai segmen aktif StatusBar. |
| `ORANGE_SOFT` | `#FEF2EC` | latar tone oranye |
| `CORAL` | `#F08C7D` | aksen (tak dipakai komponen v3) |
| `CREAM` | `#F6EFE3` | segmen "belum" StatusBar |
| `SURFACE` | `#FFFFFF` | kartu, input |
| `SURFACE_2` | `#F7F8FA` | header kartu, `<thead>`, hover baris |
| `LINE` | `#E5E0D8` | border utama |
| `LINE_SOFT` | `#EFE9DD` | border sel tabel, header kartu, avatar |
| `INK` | `#16243A` | teks utama |
| `INK_SOFT` | `#4A5360` | teks sekunder, `<th>`, kicker |
| `MUTED` | `#6B7280` | teks redup |
| `FAINT` | `#9CA3AF` | placeholder, ikon search, sub EmptyState |
| `BRICK` / `BRICK_SOFT` | `#A8503C` / `#F7EAE6` | tone "ditutup" (kalah/batal) — **sengaja bukan merah alarm** |
| `SLATE` / `SLATE_SOFT` | `#6B7280` / `#EDF0F4` | tone "belum mulai / tak aktif" |
| `DANGER` / `DANGER_SOFT` | `#C0392B` / `#FBE3E3` | aksi destruktif, penanda LOST |

Tone (`TONE`, `:79`) — satu sumbu warna, **empat tone saja**:

| tone | fg | bg | border | arti |
|---|---|---|---|---|
| `slate` | `#6B7280` | `#EDF0F4` | `#D8DEE7` | belum mulai / tidak lagi aktif |
| `orange` | `#E85A1E` | `#FEF2EC` | `#F6CDB6` | sedang berjalan |
| `navy` | `#144682` | `#EAF0F8` | `#C3D3E8` | tuntas positif |
| `brick` | `#A8503C` | `#F7EAE6` | `#E3C4BB` | ditutup (bukan alarm) |

Pemetaan `STAGE_TONE` (`:86`): lifecycle `lead`/`mql`/`free_agent` → slate · `prospect`/`sql` → orange · `customer` → navy · `lost` → brick; status deal `OPEN`/`IN_REVIEW`/`QUOTED`/`NEGOTIATION` → orange · `WON` → navy · `LOST`/`CANCELLED` → brick. `CLOSED_STAGES = ['lost','free_agent','WON','LOST','CANCELLED']`. Helper: `toneOf(stage)`, `closedFrom(stage, labelMap)`, `isClosedStage(stage)`.

### 3.3 Token warna AdminKit (`src/pages/foundation/admin-settings/tokens.js`)

| Token | Hex | Peran di kit |
|---|---|---|
| `NAVY` | `#1B4D8A` | judul, tab aktif, border fokus, pil aktif |
| `NAVY_DK` | `#0F3666` | (di-export, tak dipakai kit) |
| `ORANGE` | `#E85A1E` | tombol primer, toggle ON, dot tab, drop-zone hover |
| `ORANGE_DK` | `#D14E18` | hover tombol primer |
| `CREAM` | `#F6EFE3` | latar segmented/entity switcher, input disabled, header tabel halaman, zebra 50% |
| `SURFACE` | `#FFFDF8` | kartu, input, modal, slide-over |
| `LINE` | `#E5E0D8` | border |
| `LINE_SOFT` | `#EFE9DD` | border lembut |
| `ROW_HOVER` | `#EEE8DC` | hover baris tabel |
| `INK` | `#16243A` | teks utama, tooltip & toast bg |
| `INK_SOFT` | `#4A5360` | label mengambang, crumb aktif |
| `MUTED` | `#6B7280` | subtitle, tab non-aktif, chevron select |
| `FAINT` | `#9CA3AF` | crumb, hint, placeholder |
| `DANGER` | `#DC2626` | outline btn danger |
| `GREEN` | `#1F8B4D` | keadaan "Tersimpan!" SaveButton |

Hex tambahan yang **hardcoded di dalam kit** (bukan token): tombol primer disabled `#E7BFA9` · toggle OFF `#CFC8BA` · scrollbar thumb `#D8D0C2` · ikon toast `#7FD6A0` · putih `#fff`.

### 3.4 Palet warm-beige lokal (CRM lama & HRGA) — legacy, masih dominan
Pola `const C = {…}` / `const D = {…}` di **52 file** (reproduksi: `grep -rlE --include='*.jsx' '^const (C|D|S|T) = \{' src | wc -l` = 52; dengan `(C|D|S)` saja = 49), nilainya nyaris seragam (contoh `QuotationListPage.jsx`, `CustomerListPage.jsx`, `hrga-tokens.js`):

| kunci | hex | | kunci | hex |
|---|---|---|---|---|
| `bg` | `#F6EFE3` | | `accent` | `#E85A1E` |
| `surface` | `#FFFDF8` | | `accentSoft` | `#FEF2EC` |
| `surface2` | `#FBF6EC` | | `navy` (CustomerList) | `#1B4D8A` / `navySoft #EEF3FB` |
| `ink` | `#23291E` | | `ok` / `okBg` / `okBd` | `#2E7D4F` / `#E4F0E5` / `#BFDDC4` |
| `inkSoft` | `#5E6553` | | `warn` / bg / bd | `#9A6B0E` / `#F8ECCF` / `#E6CE94` |
| `inkFaint` | `#8A8E7C` | | `danger` / bg / bd | `#B23227` / `#F6E0DB` / `#E6BBB2` |
| `line` | `#E7DCC8` | | `info` / bg / bd | `#2A5B8C` / `#E1ECF5` / `#BAD2E6` |
| `lineSoft` | `#F0E7D6` | | `neutral` / bg / bd | `#6B6F5E` / `#EEE9DC` / `#DDD3BE` |
| `shadow` | `0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)` | | `shadowSm` | `0 1px 2px rgba(40,34,18,.06)` |

⚠️ `hrga-tokens.js` memakai `accent: '#2F6B3F'` + `accentSoft '#E7EFE2'` + `.qa-approve` `#2F6B3F` — keduanya masuk daftar **dark green terlarang** (§17.4). `userAccessTokens.js` `PASTEL` = 17 warna pastel (`mint #C8EFD9`, `rose #F5C8D5`, `lavender #D8C5F0`, `sky #C8E4F5`, `peach #FFD4B8`, `butter #FFE9B8` + varian `*Deep`; `ink #2D2A28`, `line #EDE6DC`) — palet lama, kandidat migrasi TD-14 kelompok (c).

### 3.5 Warna status yang sudah ditetapkan

**Status deal (`inquiries.status`) — badge tinted rounded-square (`InquiryListPage.STATUS_META`, resmi per `06 §1`):**

| Status | bg | text | border |
|---|---|---|---|
| OPEN | `#E4EEF7` | `#1D5A96` | `#BCD0E4` |
| IN_REVIEW | `#FBF0DD` | `#916312` | `#E6D4B4` |
| QUOTED | `#EEEAF6` | `#5B4A96` | `#D1CAE3` |
| NEGOTIATION | `#FDE7DB` | `#B53F0D` | `#EFC5B2` |
| WON | `#E1E9F2` | **`#144682`** | `#B8C8DC` |
| LOST | `#FBE7E5` | `#B33A2E` | `#EDC4C0` |
| CANCELLED | `#EDEBE7` | `#6B6459` | `#D3D0CB` |

Aturan turunannya: **border = 20% warna teks dicampur ke bg**; **"Berhasil = Navy", bukan hijau**; dua hex sengaja menyimpang dari mockup demi AA 4.5:1 (In Review, Negotiation) — jangan dikembalikan.

**Penanda penutupan StatusBar (`CLOSED_STYLE`, `StatusBar.jsx:70`):** WON `bg #144682 / fg #FFFFFF` (semua segmen tuntas) · LOST `bg rgba(192,57,43,0.1) / fg #C0392B / bd rgba(192,57,43,0.3)` · CANCELLED `bg #EDF0F4 / fg #4A5360 / bd #E5E0D8` (juga fallback untuk nilai lain, mis. `free_agent`).

**ConfirmModal (`src/components/ConfirmModal.jsx:26-30`):** danger `bg #FEE2E2 / ikon+btn #DC2626 / hover #B91C1C` · warning `#FEF3C7 / #D97706 / #B45309` · info `#EFF6FF / ikon #2563EB / btn #1B4D8A / hover #0f3366`.

**HRGA (`STATUS_HRGA`):** draft/cancelled/archived → neutral · submitted → info · in_progress → warn · approved/completed → ok · rejected → danger (hex dari palet §3.4).

**Hijau yang masih boleh** (`02 §5`): `#1F8B4D` (badge Customer/Active/Approved/Selesai, SaveButton), `#0F766E`, `#166534`. ⚠️ Funnel CRM Dashboard masih `WON: '#1F8B4D'` (`CRMDashboardPage.jsx:100`) sementara badge Inquiry List sudah navy — divergensi yang **diketahui** (TD-99).

### 3.6 Varian interaksi (hover / fokus / disabled / aktif) — persis dari kode

| Elemen | idle | hover | fokus | disabled | aktif/tekan |
|---|---|---|---|---|---|
| AdminKit `PrimaryBtn` | `#E85A1E`, teks `#fff` | `#D14E18` + `translateY(-1px)` | — | `#E7BFA9`, cursor default | `scale(.96)` saat mousedown |
| AdminKit `OutlineBtn` | border 2px navy/danger, bg transparan | bg `rgba(20,70,130,.05)` (danger: `rgba(220,38,38,.06)`) | — | **tak ada prop `disabled`** | — |
| AdminKit `SaveButton` | oranye (`variant="primary"`) / navy | `brightness(1.06)` | — | — | saving: spinner; saved: `#1F8B4D` "Tersimpan!" |
| v3 `PrimaryBtn` | bg+border `#144682`, teks `#FFFFFF` | (tak ada) | — | `opacity .6`, `not-allowed` | — |
| v3 `OutlineBtn` | border `#E5E0D8`, teks `#144682`, bg transparan | (tak ada) | — | `opacity .6` | — |
| Input AdminKit (`FloatingInput/Select/KitSelect/NumberStepper`) | border `#E5E0D8`, bg `#FFFDF8` | — | border `#1B4D8A` + ring `0 0 0 3px rgba(20,70,130,.16)` (KitSelect `.14`) | bg `#F6EFE3`, teks `#6B7280`, `not-allowed` | — |
| Input v3 (search/textarea) | border `#E5E0D8`, bg `#FFFFFF`, `outline: none` | — | **tak ada gaya fokus** | — | — |
| `Toggle` AdminKit | OFF `#CFC8BA` | — | — | `opacity .5` | ON `#E85A1E`, knob putih geser 19px |
| Tab AdminKit | teks `#6B7280` | teks `#16243A` | — | — | teks `#1B4D8A` + garis bawah 2.5px navy |
| Tab v3 `Notebook` | teks `#4A5360` 600 | — | — | (tab tak lolos gate tidak dirender) | teks `#144682` 700 + garis bawah 2px navy |
| Baris tabel v3 (`onRowClick`) | transparan | `#F7F8FA` (`.12s`) | — | — | — |
| Baris tabel AdminKit-page | zebra `#FFFDF8` / `#F6EFE380` | `#EEE8DC` | — | — | — |
| Baris `.hg-tbl` HRGA | — | `#FBF6EC` | — | — | urgent `#FBF1DC` (hover `#F7EAC9`) |
| Pil saved-view v3 | border `#E5E0D8`, teks `#4A5360` 600 | — | — | — | tinted `{bg,text,border}` → solid `color` → solid navy `#144682` teks putih, 700 |
| `PillToggle` AdminKit | border 1.5px `#E5E0D8`, bg `#FFFDF8` | bg `#F6EFE3` | — | `locked`: `not-allowed`, opacity .85, ikon gembok | bg+border `#1B4D8A`, teks putih, ikon centang |
| Nav sidebar | teks `var(--mute)` | `#F5F7FA` | — | "soon": opacity .75 | bg `var(--p-blue)`, teks `var(--navy)` 600 |

### 3.7 Warna cetak (react-pdf) — lihat §15
Storbit gudang: `INK #201f1d` · `PURPLE #5b3fa0` · `PURPLE_DEEP #4a3585` · `BG #f6f4f1`, garis lewat `inkLine(alpha)` (solid hasil campur, karena react-pdf mengabaikan `rgba` pada border). Quotation CRM: navy `#144682`/orange `#E85A1E` (`06 §5`).

---

## 4. Tipografi

### 4.1 Keluarga
| Font | Konstanta | Bobot dimuat | Pakai untuk |
|---|---|---|---|
| Montserrat | `FONT_HEAD` | 300/400/600/700/900 | judul halaman/dokumen, judul kartu, label tab, label tombol, badge, `<th>`, kicker |
| Inter | `FONT_BODY` | 400/500/600/700 | body, input, sel tabel, subtitle, breadcrumb, hint, tooltip, toast |
| IBM Plex Mono | `FONT_MONO` | 500/600/700 | nomor dokumen, angka, kode/SKU, input mono, stepper |
| Oswald | (kelas `.kpi-value`) | 600/700 | **hanya** 4 angka KPI hero CRM Dashboard, 46px/700 — di luar tiga font resmi, tapi **DIPERTAHANKAN untuk saat ini** (keputusan sadar Den 20 Sep 2026, #60 c; bukan pelanggaran, jangan diperluas) |
| Lora / Cormorant Garamond | react-pdf `Font.register` **+ `@font-face` `'Storbit Display'`/`'Storbit Text'` (`src/modules/logistics/salesOrderDetail.module.css`, TTF lokal `src/assets/fonts/`)** | Lora 400/600, Cormorant 600 | dokumen cetak gudang Storbit **dan ⚠️ dua halaman WEB** — `SalesOrderDetailPage.jsx` (sejak 17 Agu 2026, `8c5b4f2`) & `StorbitDashboardPage.jsx` (18 Agu, `1fc7b0c`) — bersama ungu Storbit `#5b3fa0`, sengaja sewarna PDF. **[koreksi doc-keeper 19 Sep 2026: semula tertulis "cetak saja"]** Bukan font resmi; **keputusan 20 Sep 2026 (#60 a): kedua halaman web IKUT penyatuan ke tiga font — BELUM DIKERJAKAN** (§17.14) |

### 4.2 Skala ukuran per level (angka dari kode; `px`)

| Level | Font / size / weight | Tambahan | Warna | Ditemukan di | Kapan dipakai |
|---|---|---|---|---|---|
| **H1 dokumen** | Montserrat **30 / 700** | ls `-.01em`, lh 1.15 | `INK #16243A` | v3 `FormSheet` (`:89`) | judul halaman detail dokumen (Deal, dst.) |
| **H1 halaman** | Montserrat **24 / 700** | ls `-0.4`, lh 1.1 | `NAVY #1B4D8A` | AdminKit `PageHeader` (`:119`) | judul halaman admin/master data |
| **Judul modal / slide-over** | Montserrat **18 / 700** | ls `-0.3` | `NAVY` | AdminKit `Modal`/`SlideOver`; `ConfirmModal` 18/800 `#1A1A1E` | judul dialog |
| **Judul kartu / section** | Montserrat **13.5 / 700** | — | `INK` | v3 `Card` header, `Chatter` header, `EmptyState` title (INK_SOFT) | header kartu |
| **Section label** | Montserrat **13 / 600** uppercase | ls `1px` | `NAVY` | AdminKit `SectionLabel` | pemisah kelompok field |
| **Kicker** | Montserrat **11 / 700** uppercase | ls `.08em` | `INK_SOFT` | v3 `FormSheet` `kicker` | label kecil di atas judul ("Detail Inquiry") |
| **Label tab** | Montserrat **14 / 600** (AdminKit `Tabs`) · **13.5 / 600→700 aktif** (v3 `Notebook`) | — | MUTED→NAVY / INK_SOFT→NAVY | — | tab |
| **Label tombol** | Montserrat **13.5 / 600** | — | putih / navy | `PrimaryBtn`/`OutlineBtn`/`SaveButton` kedua kit | semua tombol standar |
| **Tombol kecil** | Montserrat **12.5 / 600** (Chatter Kirim) · **11.5 / 600** (`ghostBtn`, 28px) · **13 / 600** (Segmented, EntitySwitcher 700, PillToggle) | — | — | — | aksi sekunder padat |
| **Header tabel** | Montserrat **11 / 700** uppercase ls `.04em` (v3 `ListView`) · Tailwind `text-[10px]` uppercase `tracking-[0.18em]` semibold (halaman AdminKit) · `11px/700` uppercase `.4px` (`.hg-tbl` HRGA) | — | `INK_SOFT` / `MUTED` / `#8A8E7C` | — | `<th>` |
| **Body dasar** | Inter **15 / 400**, lh 1.55 (v3 `FormSheet`) · Inter **14** (`text-sm` baris tabel AdminKit-page; `ConfirmModal` pesan 14, lh 1.6) | — | `INK` | — | teks paragraf/deskripsi |
| **Body UI standar** | Inter **13.5** | — | `INK` | v3 tabel, input, textarea, komentar Chatter; AdminKit `KitSelect`, toast (500), `PrimaryBtn` | teks kontrol & sel |
| **Input** | Inter **14 / 500** (AdminKit `FloatingInput/Select`) · IBM Plex Mono **13.5 / 500** ls `0.3` (`mono`) | tinggi 56 | `INK` | — | field form |
| **Subtitle / meta** | Inter **13** (`PageHeader` subtitle, `Field` v3, hint Chatter) · **12.5** (breadcrumb, subtitle modal, `EmptyState` sub, waktu komentar 11.5) | — | `MUTED` / `FAINT` | — | teks pendukung |
| **Badge** | Montserrat **11.5 / 700** | padding `2px 9px` (v3 Badge) / `2px 10px` ls `.3px` (STATUS_META) | tone fg | v3 `Badge`, `StatusBadge` | status |
| **Pil saved-view** | Montserrat **12 / 600→700** | `5px 12px` | — | v3 `FilterBar` | filter cepat |
| **Label mengambang** | Inter **11 / 600** (terangkat) ↔ **13.5 / 400** (di dalam) | — | NAVY (fokus) / INK_SOFT / FAINT | AdminKit `FloatingInput` | — |
| **Hint / caption** | Inter **11** (`FloatingInput` hint, "Unggah") · **11.5** (tooltip 500, DropZone hint, `UploadBox` label 600) | — | `FAINT` / `MUTED` | — | keterangan di bawah field |
| **Nomor dokumen** | IBM Plex Mono **13**, ls `.02em` | — | `INK_SOFT` | v3 `DocNo` | nomor INQ/QUO/SP di header & kolom |
| **Angka stepper** | IBM Plex Mono **16 / 600** | — | `INK` | AdminKit `NumberStepper` | angka setelan |
| **StatusBar** | Montserrat: penanda 13 (compact 11) / 700 · label 11 (compact 10) ls `.02em` · penanda penutup 12 (compact 11) / 700 | — | — | v3 `StatusBar` | chevron status |
| **Lajur papan** | Montserrat 12.5 / 700 (label) · 11 / 700 (hitungan) · 12 / 700 ls `.04em` vertikal (lajur tertutup) | — | tone fg | v3 `ListView` lanes | Pipeline |
| **Avatar inisial** | Montserrat 11 / 700 (30px) · 10 / 700 (24px) | — | `INK_SOFT` | v3 `Chatter` | — |
| **KPI hero** | Oswald **46 / 700**, lh 1 | — | putih | `CRMDashboardPage` `.kpi-value` | pengecualian, jangan ditiru |

Aturan praktis: **heading = Montserrat 700**, **label/kontrol = Montserrat 600**, **teks isi = Inter 400–500**, **angka/nomor = IBM Plex Mono**. Ukuran body UI yang paling sering adalah **13.5** — kalau mockup menulis 14, bulatkan ke 13.5 untuk tabel/input, dan ke 15 untuk paragraf dokumen v3.

---

## 5. Spacing, radius, bayangan

### 5.1 Skala jarak
Kit CRM v3 mendefinisikan skala eksplisit (`tokens.js:56`):

```js
SP = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32 }
```

Pemakaian kanoniknya di v3: gap ikon–teks **5–8** · gap antar chip/pil **4** · gap dalam baris kontrol **8** · padding sel tabel **12** · padding header kartu **12 × 16** · padding badan kartu **16** · padding tab **10 × 16**, `marginBottom` tablist **20** · gap grid FormSheet **24** · jarak antar section demo **32** · `EmptyState` padding **24 × 16** · `marginBottom` FilterBar **16**.

AdminKit tidak punya skala bernama; angka yang dipakainya (semua px): `PageHeader` `marginBottom 22`, crumb gap 7 & `marginBottom 10`, gap judul–tombol back 13, subtitle `marginTop 5` · `Card` padding **24** (prop `pad`) · `Modal`/`SlideOver` header `22px 24px`, body **24**, footer `16px 24px`, gap tombol footer 10 · `Tabs` padding `13px 16px`, gap 4, `marginBottom 26` · `FloatingInput` padding `20px 14px 7px`, label `left 14`, hint `marginTop 5` · gap field half `calc(50% - 8px)` / third `calc(33.333% - 11px)` (asumsi gap **16**) · tombol `0 20px` / `0 18px` / `0 22px` · `Segmented`/`EntitySwitcher` padding 4 · `Toast` padding `13px 18px`, offset **24** dari kanan & bawah · `DropZone` tinggi 140, padding 16, gap 9 · `UploadBox` tinggi 96.

Shell: padding konten halaman **20/28/36** horizontal, **24/28** vertikal (§2.4) · lebar sidebar **248** · baris nav `7px 10px`.

### 5.2 Radius

| Nilai | Dipakai untuk |
|---|---|
| **6** (`RADIUS.sm`) | badge v3 & STATUS_META, tombol ghost 28px, skeleton, penanda penutup StatusBar, textarea edit komentar |
| **8** | skeleton AdminKit (`Skel`), thumb `Segmented`, tooltip, tombol close ConfirmModal |
| **9** | tombol close modal/slide-over, pil EntitySwitcher, bubble ikon nav |
| **10** (`RADIUS.md`) | tombol v3, input search v3, textarea Chatter, header lajur, kartu filter, dropdown mention, tombol ConfirmModal |
| **11** | **semua input & tombol AdminKit** (FloatingInput/Select, KitSelect, NumberStepper, Segmented, PrimaryBtn, OutlineBtn, SaveButton, tombol back, UploadBox) |
| **12** | EntitySwitcher, toast, kotak ikon DropZone |
| **13** | DropZone |
| **14** (`RADIUS.lg`) | **kartu v3** (`Card`, `aside`, kerangka tabel, lajur tertutup) |
| **16** | **kartu AdminKit** (`Card`), papan gabungan Pipeline (`BOARD_RADIUS`), tabel halaman AdminKit (`rounded-2xl`), kartu AdminHub |
| **18** | `Modal` AdminKit |
| **20** | `ConfirmModal`, track `Toggle`, `PillToggle`, kartu AdminHub state |
| **24** | `rounded-3xl` (legacy shell) |
| **999 / 50%** | pil saved-view (`RADIUS.pill`), badge pill legacy (`borderRadius 999`), avatar |

Pemetaan cepat dari mockup: ≤7 → 6 · 8–9 → 8/9 · 10–12 → 10 (v3) atau 11 (AdminKit) · 13–15 → 14 · 16–18 → 16 · ≥20 → 20 · lingkaran → 999.

### 5.3 Bayangan (persis)

| Nama | Nilai |
|---|---|
| Kartu v3 / kartu AdminKit | **tidak ada** — hanya `1px solid LINE` |
| Fokus input AdminKit | `0 0 0 3px rgba(20,70,130,.16)` (`KitSelect` `.14`) |
| `PrimaryBtn` AdminKit | `0 1px 2px rgba(232,90,30,.3), 0 8px 18px rgba(232,90,30,.18)` |
| `SaveButton` | primer `0 6px 16px rgba(232,90,30,.2)` · navy `0 6px 16px rgba(20,70,130,.2)` · saved `0 6px 16px rgba(31,139,77,.25)` |
| Pil `EntitySwitcher` | `0 2px 8px rgba(20,70,130,.28)` |
| Thumb `Segmented` | `0 1px 3px rgba(20,40,70,.1)` |
| Knob `Toggle` | `0 1px 3px rgba(0,0,0,.25)` |
| `Tooltip` | `0 8px 22px rgba(10,20,40,.25)` |
| `SlideOver` | `-18px 0 50px rgba(20,40,70,.18)` |
| `Modal` AdminKit | `0 24px 70px rgba(20,40,70,.3)` |
| `ConfirmModal` | `0 24px 64px rgba(0,0,0,0.18)` |
| Toast | `0 14px 34px rgba(10,20,40,.3)` |
| Segmen aktif `StatusBar` | `filter: drop-shadow(0 3px 6px rgba(194,74,20,0.35))` |
| Dropdown mention | `0 8px 24px rgba(20,36,58,.12)` |
| Drawer sidebar terbuka | `0 12px 40px rgba(20,42,80,0.22)` |
| Shell `.rounded-3xl` | `0 14px 34px rgba(15,42,35,.045)` |
| Legacy warm-beige `shadow` / `shadowSm` | `0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)` / `0 1px 2px rgba(40,34,18,.06)` |

Backdrop: `SlideOver` `rgba(22,36,58,.42)` + blur 1.5px · `Modal` `rgba(22,36,58,.45)` + blur 2px · `ConfirmModal` `rgba(0,0,0,0.45)` + blur 3px · overlay DropZone `rgba(22,36,58,.55)` · drawer `rgba(0,0,0,0.42)`.

---

## 6. Komponen

### 6.1 Kit CRM v3 — `src/modules/crm/v3/`

Import: `import FormSheet from './v3/FormSheet'` (default) · `import { Badge, Card, DocNo, EmptyState, PrimaryBtn, OutlineBtn } from './v3/kit'` · `import { SP, RADIUS, NAVY, … } from './v3/tokens'`.

**Kontrak kerja kit ini (dari komentar kepala file, mengikat):** tiap penambahan **wajib aditif & mati secara default**; kalau slot terasa dipaksakan, **laporkan — jangan diakali dari sisi pemanggil**; kit dibangun sebelum ada pemakai, jadi bagian yang belum dipakai (terutama `Chatter`) **dianggap belum teruji**.

| Komponen | Kegunaan | Props | Contoh singkat |
|---|---|---|---|
| **`FormSheet`** | cangkang halaman dokumen: header 2 kolom + body + aside sticky | `docNo` `title` `kicker` `status` `actions` `meta` `toolbar` `children` `aside` `breadcrumb` | `<FormSheet kicker="Detail Inquiry" docNo="INQ/MSI/BD/2026/0184" title="PT …" status={<StatusBar …/>} actions={<><OutlineBtn>Sunting</OutlineBtn><PrimaryBtn>Buat Quotation</PrimaryBtn></>} toolbar={…} aside={<Chatter …/>}>{<Notebook …/>}</FormSheet>` |
| **`Notebook`** | tab ber-gate tunggal; tab tak lolos gate tidak dirender, default = tab pertama yang lolos; controlled | `tabs=[{id,label,gate?,render?}]` `value` `onChange` `children` `right` | `<Notebook tabs={[{id:'ringkasan',label:'Ringkasan',render:()=>…},{id:'finance',label:'Finance',gate:()=>isManager}]} value={tab} onChange={setTab}/>` |
| **`StatusBar`** | chevron satu sumbu status + penanda penutupan di kanan; murni tampilan | `stages=[{id,label}]` `current` `closed={stage,label}` `compact` | `<StatusBar stages={DEAL_STATUS_ORDER.map(id=>({id,label:STATUS_LABEL[id]}))} current="QUOTED" closed={closedFrom('LOST', STATUS_LABEL)} />` |
| **`ListView`** `mode="table"` | tabel + filter bar + saved view + skeleton + baris klik | `columns=[{key,label,align,render(row,i)}]` `rows` `search` `onSearch` `filters` `savedViews` `activeView` `onSelectView` `right` `filterCard` `onRowClick` `loading` `emptyTitle` `emptySub` | `<ListView mode="table" columns={cols} rows={rows} search={q} onSearch={setQ} savedViews={[{id:'all',label:'All',count:n}]} activeView={v} onSelectView={setV} onRowClick={r=>open(r)} loading={loading}/>` |
| **`ListView`** `mode="lanes"` | papan lajur; lajur `closed` menciut jadi rel 48px; `groupedBoard` menggabungkan lajur terbuka + bar chevron | `lanes=[{id,label,tone,closed,items,step:{bg,fg,sub}}]` `renderCard` `groupedBoard` + props filter yang sama | `<ListView mode="lanes" lanes={lanes} renderCard={it=><Kartu it={it}/>} groupedBoard/>` |
| **`Chatter`** | komentar + @mention + notifikasi, per entity lewat adapter | `entityType` (hanya `'inquiry'`) `entityId` `companyId` `entityLabel` `priorityUserIds` `showToast` | `<Chatter entityType="inquiry" entityId={id} companyId={cid} entityLabel={inq.inquiry_no} showToast={showToast}/>` — entity lain → pesan penolakan eksplisit |
| `Badge` | satu-satunya bentuk badge v3 (rounded-square) | `tone` = nama tone atau objek `{fg,bg,bd}`, `title` | `<Badge tone="WON">Won</Badge>` (`tone` boleh id status — dipetakan `STAGE_TONE`) |
| `Card` | section berbingkai, header opsional | `title` `icon` `right` `padded` | `<Card title="Ringkasan" icon={<FileText size={15}/>} right={<OutlineBtn>Edit</OutlineBtn>}>…</Card>` |
| `DocNo` | nomor dokumen mono | `children` | `<DocNo>QUO/MSI/BD/2026/007</DocNo>` |
| `EmptyState` | keadaan kosong | `title` `sub` | `<EmptyState title="Tidak ada inquiry" sub="Coba ubah kata kunci."/>` |
| `PrimaryBtn` / `OutlineBtn` | tombol navy solid / outline | `onClick` `disabled` `icon` `children` | `<PrimaryBtn icon={<Plus size={14}/>} onClick={…}>Buat</PrimaryBtn>` |

Helper token: `toneOf`, `closedFrom`, `isClosedStage`, `STATUS_LABEL` (satu-satunya sumber teks status deal), `LIFECYCLE_ORDER = ['lead','mql','prospect','sql','customer']`, `DEAL_STATUS_ORDER = ['OPEN','IN_REVIEW','QUOTED','NEGOTIATION','WON']`, `ENTITIES` (code + UUID + nama legal).

Catatan kontrak yang sudah ditetapkan (jangan dibalik): `StatusBar.closed` = penanda **berdampingan** dengan segmen, bukan pengganti bar (4 Sep 2026) · WON merender semua segmen tuntas, LOST/CANCELLED tidak (asimetri disengaja) · `ListView` search hanya dirender bila `onSearch` ada · `render(row, index)` menerima indeks · `groupedBoard` opt-in · `Chatter` v3 FE-only, satu adapter.

### 6.2 AdminKit — `src/pages/foundation/admin-settings/`

Import: `import { PageHeader, Card, FloatingInput, … } from '../../../pages/foundation/admin-settings/kit'` dan token dari `…/tokens`. **`<KitStyles />` wajib dirender sekali di halaman** (keyframes, `.ak-skel`, `.ak-spin`, `.ak-scroll`, `.ak-rise`).

| Komponen | Kegunaan | Props / catatan | Contoh singkat |
|---|---|---|---|
| `Icon` | pembungkus Lucide lewat nama (registry 66 nama) | `name` `size=18` `color` `strokeWidth=1.7` `style`; nama tak dikenal → ikon `Info` | `<Icon name="pencil" size={16}/>` |
| `KitStyles` | blok `<style>` global kit | — | `<KitStyles/>` |
| `PageHeader` | breadcrumb (klik-tembus) + H1 24 + subtitle + tombol back 40×40 + slot kanan | `crumbs=[{label,onClick?}]` `title` `subtitle` `onBack` `right` | `<PageHeader crumbs={[{label:'Foundation',onClick:goHome},{label:'Companies'}]} title="Companies" subtitle="…" right={<PrimaryBtn icon="plus">Tambah</PrimaryBtn>}/>` |
| `SectionLabel` | label section uppercase navy | `children` `style` | `<SectionLabel>Identitas</SectionLabel>` |
| `EntitySwitcher` | pil geser MSI/JCI/SOA (single-select, pil aktif selalu navy) | `value` (`'MSI'`) `onChange` | `<EntitySwitcher value={ent} onChange={setEnt}/>` — **bukan** `CompanySwitcher` (komponen berbeda) |
| `Tabs` | tab garis bawah geser 2.5px | `tabs=[{id,label,icon?,dot?}]` `value` `onChange` | `<Tabs tabs={[{id:'umum',label:'Umum',icon:'settings'}]} value={t} onChange={setT}/>` |
| `FloatingInput` | input tinggi 56 berlabel mengambang | `label` `value` `onChange(value)` `mono` `type` `full/half/third` `disabled` `placeholder` `hint`; **tak ada `maxLength`** (potong di `onChange`) | `<FloatingInput label="Nama" value={v} onChange={setV} half/>` |
| `FloatingSelect` | select tinggi 56 berlabel tetap | `label` `value` `onChange` `options` (string atau `{value,label}`) `half/third/full`; **tak ada `disabled`** | `<FloatingSelect label="Tipe" value={v} onChange={setV} options={['PT','CV']}/>` |
| `Toggle` | switch 44×25, oranye saat ON (**tak ada varian hijau**) | `on` `onChange` `disabled` | `<Toggle on={active} onChange={setActive}/>` |
| `NumberStepper` | angka + tombol ± yang muncul saat hover | `value` `onChange` `suffix` `min=0` `max=9999` `step=1` `width=150` | `<NumberStepper value={n} onChange={setN} suffix="hari"/>` |
| `Segmented` | kontrol tersegmentasi, thumb geser | `options` `value` `onChange` `full` | `<Segmented options={[{value:'a',label:'A',icon:'layout'},'B']} value={v} onChange={setV}/>` |
| `PrimaryBtn` | tombol oranye 44px | `onClick` `icon` (nama) `disabled` `type` | `<PrimaryBtn icon="plus" onClick={add}>Tambah</PrimaryBtn>` |
| `OutlineBtn` | tombol outline navy/danger 44px, border 2px | `onClick` `icon` `danger`; **tak ada `disabled`** | `<OutlineBtn icon="trash" danger onClick={del}>Hapus</OutlineBtn>` |
| `SaveButton` | tombol simpan 3-keadaan idle→saving→saved | `onSave` `label="Simpan"` `variant="primary"/"navy"`; ⚠️ **tidak menunggu Promise** — `onSave` dipanggil setelah jeda 950ms, "Tersimpan!" 2s lalu reset, apa pun hasil server | `<SaveButton onSave={handleSave}/>` |
| `Tooltip` | tooltip gelap, delay 150ms | `label` `side="top"/"bottom"` | `<Tooltip label="Hapus"><button…/></Tooltip>` |
| `SlideOver` | panel geser dari kanan, lebar 480 (max 94vw), header & footer sticky | `open` `onClose` `title` `subtitle` `footer` `width` | `<SlideOver open={o} onClose={close} title="Edit" footer={<><OutlineBtn onClick={close}>Batal</OutlineBtn><SaveButton…/></>}>…</SlideOver>` |
| `Modal` | dialog tengah, lebar 540 (max 94vw, tinggi max 90vh) | sama dengan `SlideOver` | `<Modal open={o} onClose={close} title="…">…</Modal>` |
| `DropZone` | unggah logo (drag-drop + preview) tinggi 140 | `value` (dataURL) `onChange` `label` `hint` | `<DropZone value={logo} onChange={setLogo}/>` |
| `UploadBox` | unggah tanda tangan/stempel, tinggi 96 | `value` `onChange` `label` `icon` `height` | `<UploadBox label="Tanda tangan" icon="pen" value={sig} onChange={setSig}/>` |
| `useToast` | toast gelap kanan-bawah 2.4s | `[fire, node]` — `fire(msg, icon?)` | `const [toast, toastNode] = useToast(); toast('Tersimpan')` + render `{toastNode}` |
| `Skel` | skeleton pulse | `w` `h=14` `r=8` | `<Skel w={120}/>` |
| `Card` | kartu `SURFACE` border `LINE` radius 16 padding 24 | `pad` `style` | `<Card pad={20}>…</Card>` |
| `KitSelect` | select ringkas 44px lebar tetap (filter/baris setelan) | `value` `onChange` `options` `width=220` `icon` | `<KitSelect value={f} onChange={setF} options={opts} icon="filter"/>` |
| `PillToggle` | chip toggle bulat 38px | `label` `active` `onClick` `locked` | `<PillToggle label="MSI" active={sel} onClick={toggle}/>` |

Yang **tidak** ada di AdminKit: komponen tabel (halaman memakai pola grid Tailwind, §8.2), komponen badge (halaman menulis `StatusBadge`/`CodeBadge` lokal), `LoadingState`/`EmptyState`/`ErrorState` (ada di `src/modules/admin/components/`, masih memakai `PASTEL` lama).

### 6.3 Komponen bersama lintas modul — `src/components/` (di luar kit, tetap wajib dipakai)
`ConfirmModal` (menggantikan semua `window.confirm`; `variant` danger/warning/info; Escape menutup) · `ErrorBoundary` · `AuthGate` · `Login` · `CompanySwitcher` (pemilih entitas aktif, fungsional) · picker: `AccountPicker`, `CodeNamePicker`, `DcPicker`, `InquiryPicker`, `ProductPicker`, `ProfilePicker` · `ProfileMiniView` · `CustomFieldsSection` · `BnfActionItemsChecklist`. Semuanya memakai token lokal (`const C/PASTEL`), belum dimigrasi ke kit mana pun.

### 6.4 Kit cetak — `src/modules/logistics/printKit.jsx` (react-pdf)
`DocPage` (Page LETTER + `PageChrome`) · `PageChrome` (4 poligon ornamen sudut ungu, `fixed` di tiap halaman) · `DocHeader({title, subtitle, meta:[{label,value}], badge})` · `PartyBlock({label, name, sub, address})` · `Field({label, value, width})` · `NoteBox({label, hint, value})` · `SignatureRow({boxes:[{title}], gap})`. Angka & gaya di §15.

### 6.5 Kit modul-lokal (legacy, jangan diperluas ke modul lain)
- **HRGA** `HrgaShared.jsx`: `Card`, `HrgaStatusBadge`, `TypePill`, `CoBadge`, `Avatar`, `Btn`, `Banner`, `FilterBar`, `Pager`, `StatCard`, `EmptyRow`, `LoadingRow`, `FilterDropdown` + CSS `.hg-tbl` (`hrga-tokens.js:74`).
- **User Access** `userAccessShared.jsx`: `Avatar`, `RoleBadge`, `StatusBadge`, `FieldLabel`, `FieldInput`, `FieldSelect`, `FieldToggle`, `SectionLabel`, `Divider`, `SaveError`, `PermissionMatrix`.
- **Admin legacy** `src/modules/admin/components/`: `AdminFormModal` (7 pemakai), `AdminPageHeader` (2 pemakai; heading `.font-display` = Fraunces, off-brand), `LoadingState`/`EmptyState`/`ErrorState`.

---

## 7. Aturan tombol

| Kit | Varian | Tinggi | Padding | Radius | Font | Warna | Ikon |
|---|---|---|---|---|---|---|---|
| **AdminKit** | `PrimaryBtn` | **44** | `0 20px` | 11 | Montserrat 13.5/600 | oranye `#E85A1E` → hover `#D14E18`; disabled `#E7BFA9`; bayangan oranye 2 lapis; hover naik 1px; tekan `scale(.96)` | `Icon` 17, gap 8 |
| | `OutlineBtn` | 44 | `0 18px` | 11 | Montserrat 13.5/600 | border **2px** navy `#1B4D8A` (danger `#DC2626`), teks senada, hover bg 5–6% | `Icon` 16, gap 7 |
| | `SaveButton` | 44, `minWidth 138` | `0 22px` | 11 | Montserrat 13.5/600 | oranye / navy → `#1F8B4D` saat tersimpan | check 17 / loader 17 / checkcircle 18 |
| | tombol ikon (back/close) | 40 / 36 | — | 11 / 9 | — | bg `SURFACE`, border `LINE`, hover `CREAM` | 19 / 18 |
| | `PillToggle` | 38 | `0 16px` | 20 | Montserrat 13/600 | outline → navy solid saat aktif | 14 |
| | `Segmented` / `EntitySwitcher` | 38 / 34 | `0 14px` / `0 16px` | 8 (thumb) / 9 | Montserrat 13/600 (700) | thumb `SURFACE`+border / navy | 15 |
| **CRM v3** | `PrimaryBtn` | auto (padding **9 × 16** → ≈36) | `9px 16px` | 10 | Montserrat 13.5/600 | navy `#144682` solid, teks putih, border navy 1px; disabled opacity .6; **nol hover** | node, gap 6 |
| | `OutlineBtn` | auto | `9px 16px` | 10 | Montserrat 13.5/600 | border `#E5E0D8` 1px, teks navy, bg transparan | node, gap 6 |
| | Kirim (Chatter) | auto | `8px 14px` | 10 | Montserrat 12.5/600 | navy solid | `Send` 13 |
| | `ghostBtn` (Chatter) | **28** | `0 10px` | 6 | Montserrat 11.5/600 | bg `SURFACE`, border `LINE` (danger `#E3C4BB`), teks navy/danger | 12 |
| **Shared** | `ConfirmModal` | auto | `10px 24px` | 10 | inherit 14/600 | batal: border 1.5px `#D1D5DB`, teks `#374151`; konfirmasi: solid per varian | — |

Aturan penempatan: aksi utama satu per header (oranye di AdminKit, navy di v3); di `FormSheet`, aksi pendek di sebelah judul → slot `actions`, baris aksi lebar dokumen → slot `toolbar` (dipisah berdasarkan tabel yang ditulis, bukan muat/tidak — `06 §3`). Tombol destruktif: `OutlineBtn danger` (AdminKit) / `ghostBtn(true)` (v3) + `ConfirmModal variant="danger"`. Label tombol memakai bahasa halamannya (AdminKit Indonesia: Simpan/Batal/Hapus; CRM v3 campuran — lihat §17.7).

---

## 8. Aturan tabel / daftar

### 8.1 Tabel v3 (`ListView mode="table"`, `ListView.jsx:386-460`)
- Kerangka: `div` `overflowX:auto` + `border 1px solid #E5E0D8` + radius **14**; `<table width 100% borderCollapse` font Inter **13.5**.
- `<thead><tr>` bg `#F7F8FA`; `<th>` Montserrat **11/700 uppercase ls .04em** `#4A5360`, padding **12**, `borderBottom 1px #E5E0D8`, `nowrap`, `textAlign` per kolom (`align`).
- `<td>` padding **12**, `borderBottom 1px #EFE9DD`, teks `#16243A`. **Tanpa zebra.** Hover hanya bila `onRowClick` (bg `#F7F8FA`, `.12s`, cursor pointer).
- Loading: **5 baris skeleton** (blok 10px radius 6 `#EFE9DD`, `maxWidth 160`) dengan `<thead>` tetap tampil. Kosong: `EmptyState`, bukan baris.
- Filter bar di atas tabel: input search (`flex 1 1 240px`, `minWidth 200`, padding `8px 12px 8px 32px`, radius 10, ikon `Search` 15 di kiri 10) + slot `filters` + `right` (`marginLeft auto`); pil saved-view di baris atas; opsional dibungkus kartu putih (`filterCard`: bg `#FFFFFF`, border `LINE`, radius 10, padding 16).
- Kolom nomor dokumen: `render: (r) => <DocNo>…</DocNo>` (mono 13). Kolom angka: `align:'right'`. Kolom status: `<Badge tone={r.status}>`.

### 8.2 Daftar halaman AdminKit (pola, mis. `CompaniesPage.jsx:112-150`)
- Pembungkus: `rounded-2xl border overflow-hidden` bg `#FFFDF8` border `#E5E0D8`.
- Header: `grid px-4 py-3 border-b` (padding 16 × 12), teks `text-[10px] uppercase tracking-[0.18em] font-semibold` warna `#6B7280`, bg **`#F6EFE3`** (CREAM).
- Baris: `grid px-4 py-3.5 border-b items-center text-sm` (16 × 14, font 14), zebra ganjil **`#F6EFE380`** (cream 50%), hover **`#EEE8DC`**; kolom lebar tetap ditulis di `gridTemplateColumns` (mis. `'90px 1fr 1fr 80px'`).
- Keadaan: `ErrorState` / `LoadingState rows={6}` / `EmptyState message` (komponen legacy `src/modules/admin/components/`).
- Footer paginasi client-side.

### 8.3 Tabel HRGA (`.hg-tbl`, `hrga-tokens.js:74-96`)
`th` padding `9px 12px`, 11px/700 uppercase ls .4px `#8A8E7C`, border-bottom `#E7DCC8`, bg `#FFFDF8` · `td` padding `9px 12px`, 13px, border-bottom `#F0E7D6`, `#23291E` · hover `#FBF6EC` · kolom sticky kiri/kanan (`.stick-l`/`.stick-r`) · baris urgent `#FBF1DC`.

### 8.4 Papan lajur (`ListView mode="lanes"`)
Lajur terbuka `flex 1 1 240px minWidth 220`, header lajur padding `8px 12px` radius 10 tone bg/border + `Badge` hitungan; kartu bertumpuk gap 8; lajur `closed` menciut ke rel **48px** (minHeight 220, teks vertikal). `groupedBoard`: container bg `#FBFAF9`, border `#ECE7E2`, radius 16, bar chevron tinggi **46** dengan sudut **18** (`ARROW`), kolom dipisah garis `#ECE7E2`, padding kolom 12. Ketiga hex papan sengaja **bukan token** (belum ada pemakai kedua).

Aturan umum (semua kit, `06 §3`): tabel lebar → `overflowX:auto`; list baru wajib paginasi (`PAGE_SIZE`, Inquiry List = 20) atau `.range()`; search di-debounce ≥300ms; fetch `.limit(1000)`.

---

## 9. Aturan kartu, modal, panel

| Permukaan | Latar | Border | Radius | Padding | Bayangan | Catatan |
|---|---|---|---|---|---|---|
| Kartu v3 (`Card`) | `#FFFFFF` | `1px #E5E0D8` | 14 | header `12 × 16` (bg `#F7F8FA`, border-bottom `#EFE9DD`), badan 16 (`padded=false` → 0) | tidak ada | `overflow:hidden`; judul Montserrat 13.5/700; slot `icon` & `right` |
| Aside `FormSheet` | `#FFFFFF` | `1px #E5E0D8` | 14 | (diisi Chatter: header `12×16`, badan 16) | tidak ada | `position: sticky; top: 16`; kolom `1.7fr / 1fr`; `maxWidth 1240` |
| Kartu AdminKit (`Card`) | `#FFFDF8` | `1px #E5E0D8` | 16 | 24 | tidak ada | — |
| Kartu AdminHub (destinasi) | `#FFFDF8` | `1px #E5E0D8` | 16 | `22px 22px 20px 24px` | — | `AdminHub.jsx:176` |
| Kartu filter v3 (`filterCard`) | `#FFFFFF` | `1px #E5E0D8` | 10 | 16 | — | opt-in |
| Kartu lajur (renderCard demo) | `#FFFFFF` | `1px #E5E0D8` | 10 | 12 | — | pola kartu Pipeline |
| Kartu legacy warm-beige | `#FFFDF8` | `1px #E7DCC8` | 12–14 | 16–20 | `shadow` §5.3 | CRM lama/HRGA (`06 §3`: "cardHead bg navy + ikon putih" = pola lama) |
| `Modal` AdminKit | `#FFFDF8` | — | 18 | header `22×24`, badan 24, footer `16×24` | `0 24px 70px rgba(20,40,70,.3)` | lebar 540 / max 94vw / maxHeight 90vh; backdrop `rgba(22,36,58,.45)` blur 2px; masuk `.24s` fade+scale .95→1 |
| `SlideOver` AdminKit | `#FFFDF8` | header/footer `1px #E5E0D8` | 0 (menempel kanan) | sama dengan Modal | `-18px 0 50px rgba(20,40,70,.18)` | lebar 480 / max 94vw; masuk `.34s` dari kanan; header & footer sticky |
| `ConfirmModal` | `#FFFFFF` | — | 20 | 32 | `0 24px 64px rgba(0,0,0,0.18)` | `maxWidth 420`, teks rata tengah, ikon 64px lingkaran |
| Toast AdminKit | `#16243A` | — | 12 | `13px 18px` | `0 14px 34px rgba(10,20,40,.3)` | kanan-bawah 24, 2.4s |
| Tooltip | `#16243A` | — | 8 | `6px 10px` | `0 8px 22px rgba(10,20,40,.25)` | `maxWidth 240`, delay 150ms |
| Dropdown mention | `#FFFFFF` | `1px #E5E0D8` | 10 | item `8 × 12` | `0 8px 24px rgba(20,36,58,.12)` | portal ke `body`, `maxHeight 220`, z 9999 |

Prinsip: **kartu tidak berbayangan** di kedua kit modern (bayangan hanya untuk elemen melayang: modal, slide-over, toast, tooltip, dropdown, tombol primer AdminKit).

---

## 10. Kontrol form

| Kontrol | Kit | Tinggi | Padding | Radius | Font | Detail |
|---|---|---|---|---|---|---|
| `FloatingInput` | AdminKit | **56** | `20px 14px 7px` | 11 | Inter 14/500 (mono: IBM Plex Mono 13.5/500 ls .3) | label 13.5→11 saat terangkat (`top 17→7`), border fokus navy + ring; lebar `half` default (`1 1 calc(50% - 8px)`), `full`, `third` |
| `FloatingSelect` | AdminKit | 56 | `20px 38px 7px 14px` | 11 | Inter 14/500 | label selalu 11/600 di atas; chevron kanan 14; `appearance:none` |
| `KitSelect` | AdminKit | **44** | `0 34px 0 14px` (ikon: kiri 36) | 11 | Inter 13.5/500 | lebar tetap `width=220` |
| `NumberStepper` | AdminKit | 46 | — | 11 | IBM Plex Mono 16/600 | tombol ± 30px muncul saat hover/fokus, hover ± → navy |
| `Toggle` | AdminKit | 25 (lebar 44) | — | 20 | — | knob 19px, ON oranye |
| Search | v3 `FilterBar` | ≈34 (padding 8) | `8px 12px 8px 32px` | 10 | Inter 13.5 | ikon `Search` 15 `#9CA3AF`; **nol gaya fokus** |
| Textarea komposer | v3 `Chatter` | `rows=3` | 12 | 10 | Inter 13.5 | `resize: vertical`; edit: padding 8, radius 6, font 13 |
| Field baca-saja | v3 (Inquiry modal `Field`) | — | gap 3 | — | label 10/700 uppercase ls .5px `inkFaint`; nilai 13.5 | nilai kosong → `—` italic `#D1D5DB` |

Tata letak form: field AdminKit ditata `display:flex; flexWrap:wrap; gap:16` (turunan dari `calc(50% - 8px)`); kelompok field diberi `SectionLabel`; form v3 memakai grid 2 kolom di dalam `Card` (18 field Detail Deal). Validasi client-side, state `useState`, reset modal via `key` remount (`06 §3`).

---

## 11. Badge & status

- **Bentuk v3 (arah baru, hanya untuk sumbu status deal):** rounded-square radius **6**, `padding 2px 9px` (Badge) / `2px 10px` (STATUS_META), Montserrat **11.5/700**, `border 1px`, trio `bg/text/border` — border = 20% teks dicampur ke bg. Teks 11.5px dihitung sebagai *normal text* → kontras minimal **4.5:1**.
- **Bentuk legacy (masih berlaku di modul lain):** pill `borderRadius 999`, `padding 4px 10px`, 11.5/700, bg-soft + fg per status (mis. `DeliveryNoteDetailPage` `STATUS_MAP` memakai pastel shell: draft slate, in_transit amber, delivered green, cancelled rose; ikon Lucide 12 `strokeWidth 2.5`).
- **Jangan menggeneralisasi** "semua badge rounded-square" tanpa keputusan terpisah (`06 §3`).
- Tone semantik v3 hanya **4** (slate/orange/navy/brick); merah alarm (`DANGER`) hanya untuk aksi destruktif & penanda LOST, bukan status administratif.
- Warna status per modul hidup di peta lokal (`STATUS_META`, `INQ_STATUS_TONE`, `STATUS_MAP`, `STATUS_HRGA`); peta status deal terduplikasi 3 tempat (TD-99) — kalau menambah status, sentuh semuanya.

---

## 12. Ikon

- **Lucide React** eksklusif (`lucide-react ^1.14`). AdminKit membungkusnya lewat `Icon name=…` (registry `kit.jsx:31-49`, 66 nama); v3 dan halaman lain mengimpor komponen Lucide langsung.
- Ukuran yang dipakai: **12** (ghost btn, badge ber-ikon) · **13** (chevron crumb, Send) · **14** (stepper, centang pil, ikon tombol v3) · **15** (segmented, kit select, search, nav sub) · **16** (tab, outline btn, nav bubble, close ConfirmModal) · **17** (primary btn, header Chatter) · **18** (default `Icon`, close modal, toast) · **19** (back) · **20** (dropzone) · **22** (uploadbox) · **28** (ikon ConfirmModal).
- `strokeWidth`: default `Icon` **1.7**; nav sidebar 1.7–2 (aktif 2); badge status 2.5.
- Ikon di react-pdf: tidak dirender — pakai bentuk `View`/`Svg` (`06 §1`).

---

## 13. Breakpoint & responsif

| Breakpoint | Sumber | Efek |
|---|---|---|
| **1024px** (`lg`) | Tailwind default + `index.css:60/72/79/86` `@media (max-width:1023px)` | **batas utama desktop/mobile**: sidebar `hidden lg:flex` → drawer; `flex-col lg:flex-row`; `.nx-grid-2` → 1 kolom; `.nx-grid-3`/`.nx-grid-kpi` → 2 kolom; `.nx-stack` → kolom penuh & unsticky; `FormSheet` (kelas `nx-grid-2 nx-stack`) turun ke satu kolom |
| **640px** (`sm`) | Tailwind + `index.css:65` `@media (max-width:639px)` | `.nx-grid-kpi`/`.nx-grid-3` → 1 kolom; `.nx-page-pad` padding 14px; padding konten 20→28 |
| **768px** (`md`) | Tailwind (11 pemakaian) | utilitas per halaman |
| **1280px** (`xl`) | Tailwind (13 pemakaian) | padding konten 28→36 |
| `2xl` 1536 | — | **tidak dipakai** |

- Pendekatan resmi: **opt-in, desktop pixel-identik** — kelas `.nx-*` hanya menimpa via `@media (max-width:…) !important`, inline style tetap menang di desktop (`index.css:48-59`).
- Lebar maksimum dokumen v3: **1240px** (`FormSheet`), kolom `minmax(0,1.7fr) minmax(0,1fr)` (≈766px / 450px pada 1240 dengan gap 24); tanpa `aside` → satu kolom `minmax(0,1fr)`.
- Kepadatan: `StatusBar compact` (40px, bukan 52) untuk header padat; lajur papan `overflowX:auto`.
- `@media` ad-hoc per halaman yang juga ada di kode (bukan sistem): 1100, 1080, 1000, 980, 900, 860, 760, 720, 680, 560, 639.98/1023.98 — jangan menambah angka baru; pakai 1024/640.
- `prefers-reduced-motion: reduce` → `.ak-rise` dimatikan (AdminKit); tak ada perlakuan lain.

---

## 14. Motion & z-index

**Easing:** kit `cubic-bezier(.22,1,.36,1)`; shell `cubic-bezier(0.16,1,0.3,1)`; `ease`/`ease-out` untuk opacity.

**Durasi:** warna/border **.2s** · transform tombol **.12s** · hover baris v3 **.12s** · dropdown/accordion shell **.14s** · tooltip **.15s** (+delay 150ms) · toggle/warna teks **.25s** · toast **.25s** · segmented **.28s** · tabs **.3s** · entity switcher & `.ak-rise` **.32s** · modal **.24s** · slide-over **.34s** (unmount 320ms) · fadeIn `.2s`, slideIn `.3s`, slideUp `.4s` · skeleton pulse **1.3s** · spinner **.8s** · "Tersimpan!" pop `.4s`.

**Tangga z-index:** backdrop drawer **40** → drawer sidebar **50** → tooltip **60** → `SlideOver` **80** → `Modal` **90** → popover/dropdown halaman **150** (`06 §3`) → toast **200** → `ConfirmModal` & dropdown mention **9999**. Di dalam `StatusBar`, segmen ber-`zIndex = stages.length - i` (kiri menimpa kanan); di bar papan `i + 1` (kanan menimpa kiri).

---

## 15. Dokumen cetak (react-pdf)

**Storbit gudang (`printTokens.js`):** halaman **LETTER 612 × 792 pt**; semua angka desain ditulis `px(n) = n × 0.75` (desain 816×1056 css px @96dpi). `page`: bg `#f6f4f1`, teks `#201f1d`, **Lora** `px(13)`, padding atas/bawah `px(26)`, horizontal `px(64)`. Header: logo tinggi `px(130)`; judul **Cormorant Garamond 600 `px(22)`** lh 1.15; subjudul `px(11)` uppercase ls 10% `ink(0.5)`; meta label `px(11)` `ink(0.55)`, nilai `px(13)`; badge status border 1 `#5b3fa0`, teks `#4a3585`, radius `px(20)`, padding `px(4) × px(14)`, `px(11)` uppercase ls 6%. `divider` 1pt `ink(0.16)`. Blok pihak: label section `px(11)` uppercase ls 8% `#5b3fa0`; nama Cormorant 600 `px(19)`; sub `px(14)`; alamat `px(13)` `ink(0.65)`. Tabel: `th` `px(9)` uppercase ls 8% `ink(0.55)`, `thRow` border-bottom `inkLine(0.22)`, `tr` `inkLine(0.14)`, `td` `px(13)`, checkbox `px(15)` radius `px(3)`. Kotak catatan: border `inkLine(0.2)` radius `px(4)`, padding `px(10) × px(16)`, minHeight `px(44)`, teks `px(12)`. Tanda tangan: kotak border `inkLine(0.2)` radius `px(4)`, padding `px(14) × px(16)`, judul Cormorant `px(15)`, ruang `px(64)`, garis `inkLine(0.35)`, label `px(10)`. Ornamen sudut: 4 poligon `#5b3fa0` opacity 0.1/0.22, `fixed`. Pemenggalan kata dimatikan (`registerHyphenationCallback`). ⚠️ `rgba()` pada border **diabaikan react-pdf** (jadi merah) — pakai `inkLine(alpha)`.

**Invoice Storbit (`InvoicePDF.jsx`)**: keluarga yang sama; batas kop `KOP_HEADER_CM = 3` / `KOP_FOOTER_CM = 3,5` (terverifikasi cetak 10 Sep 2026), paginasi aman `n≤5` baris — detail `CLAUDE.md` entri 10-11 Sep.

**Quotation CRM (`QuotationPDF.jsx`)**: navy/orange, Helvetica built-in, 9 section, footer navy `fixed`, `paddingBottom 96` — `06_UI_UX_FLOW.md §5`.

---

## 16. Checklist menerjemahkan mockup AI (Google Stitch, dsb.) ke Nexus

> ⚠️ **Dua lapis:** target akhirnya = palet sage + tiga font + kit tunggal (Bagian A). **Selama penyatuan belum dieksekusi** (status hari ini), langkah 1–2 memakai kit/token yang **ada** supaya tidak lahir palet kelima (#61, DISETUJUI Den 20 Sep 2026). Begitu kit tunggal ada, langkah 1–2 diganti "pakai `tokens.js` sage bersama" dan sisanya tetap berlaku. Kalau mockup datang dalam warna sage (mengikuti kebijakan), **petakan ke token kit yang ada** lewat kolom "padanan sage" §3.1 (kebalikannya) — jangan menyalin hex sage-nya ke kode sebelum instruksi.

1. **Tentukan kit** lewat tabel §0. Mockup untuk halaman CRM → v3; Foundation/Admin → AdminKit; modul lain → tiru objek token file tetangga.
2. **Ganti setiap hex mockup dengan token kit yang dipakai** — bukan hex literal. Warna aksen utama mockup → `NAVY` kit itu; aksen kedua/CTA → `ORANGE` (teks putih di atasnya → **`ORANGE_AA #C24A14`** saja); abu teks → `INK / INK_SOFT / MUTED / FAINT`; garis → `LINE / LINE_SOFT`; latar lembut → `SURFACE_2` (v3) / `CREAM` (AdminKit). Hijau tua, emoji, dan hex bebas → tolak. (Setelah penyatuan: semua ini menjadi token sage.)
3. **Font:** heading → Montserrat 700; label/tombol → Montserrat 600; isi → Inter; angka & nomor → IBM Plex Mono — hanya tiga font ini. Ukuran dibulatkan ke skala §4.2 (30/24/18/15/14/13.5/13/12.5/12/11.5/11/10).
4. **Jarak** dibulatkan ke `SP` (4/8/12/16/20/24/32). Padding kartu 16 (v3) / 24 (AdminKit); sel tabel 12; gap ikon–teks 6–8.
5. **Radius** dipetakan §5.2: badge 6 · tombol/input 10 (v3) atau 11 (AdminKit) · kartu 14 (v3) / 16 (AdminKit) · modal 18–20 · pil 999.
6. **Bayangan:** hapus bayangan kartu dari mockup — kartu Nexus berbingkai tanpa bayangan; bayangan hanya untuk modal/slide-over/toast/tooltip/dropdown/tombol primer AdminKit (nilai persis §5.3).
7. **Tombol:** satu aksi utama per header; ukuran & warna §7; destruktif = outline danger + `ConfirmModal`.
8. **Tabel:** `ListView mode="table"` (v3) atau pola grid AdminKit (§8.2); jangan buat komponen tabel baru; wajib skeleton + empty state + paginasi.
9. **Status:** badge tinted rounded-square hanya untuk sumbu status deal; modul lain tetap pill lokalnya. Tone hanya 4. WON = navy, bukan hijau.
10. **Ikon** → Lucide, ukuran 14–18, `strokeWidth 1.7`.
11. **Responsif:** tata letak 2 kolom pakai `nx-grid-2 nx-stack`; batas 1024 & 640; desktop tak boleh berubah piksel.
12. **Kontras:** teks ≤14px wajib ≥4.5:1 (preseden: dua hex STATUS_META digeser demi AA; `BY MSI` 3.55:1 tercatat TD-227).
13. **Bahasa label** ikut halaman yang disentuh (lihat §17.7) — jangan mencampur di satu layar.
14. **Jangan** menambah `@media` angka baru, font baru, npm package, atau warna di luar palet tanpa keputusan tercatat.
15. Kalau sebuah slot/prop kit tidak muat untuk mockup → **laporkan** (kontrak §6.1), jangan menambal di halaman.

---

## 17. Temuan audit — divergensi & keputusan terbuka (kode tidak diubah; status per 19 Sep 2026 di tiap butir)

> **Butir 1–2 sudah DIJAWAB oleh keputusan 19 Sep 2026** (palet sage menggantikan semua navy/oranye — Bagian A); **butir 3** dijawab sebagian (tiga font resmi; pembersihan kode = TD-70, ditunda); **butir 4 → TD-269**, bagian `SaveButton` di **butir 9 → TD-270** — semuanya **BELUM diperbaiki di kode, sengaja ditunda menunggu instruksi Den**. Sisanya tetap temuan terbuka.

1. **Dua navy "resmi" → DIJAWAB 19 Sep 2026: keduanya berhenti jadi warna aplikasi, diganti palet sage (belum di kode).** Keadaan kode: `CLAUDE.md`/`02 §5`/kit v3: `#144682`. `index.css:13` (`--navy`), `App.jsx PASTEL`, AdminKit, `userAccessTokens.js`, `ConfirmModal info`, dan 54 file lain: **`#1B4D8A`** (komentar `index.css`: "soft navy — replaces old pekat #144682", rebrand `368a10d` 1 Jul 2026). Kit v3 (27 Agu) memilih kembali ke `#144682` dengan merujuk `CLAUDE.md`. Kedua angka sama-sama dipakai di layar produksi hari ini (sidebar: kotak "N" `#1B4D8A` di samping teks "Nexus" `#144682`). Keduanya digantikan palet sage saat penyatuan; sampai saat itu ikuti tabel §0 (per kit), jangan mengganti massal (#61).
2. **Dua oranye → DIJAWAB 19 Sep 2026: keduanya berhenti jadi warna aplikasi, diganti aksen sage (belum di kode).** Keadaan kode: `--orange: #E8703D` (`index.css:18`, badge "soon" sidebar, palet `C` halaman Storbit — 9 file) vs brand `#E85A1E` (67 file). Hover oranye tercatat `#c44d18` di dokumen tapi kit memakai `#D14E18`.
3. **Dua tumpukan font hidup bersamaan → kebijakan DIJAWAB (tiga font resmi saja), pembersihan kode BELUM (TD-70, ditunda).** Selain Montserrat/Inter/IBM Plex Mono, `index.css:1` + `App.jsx:2782` masih memuat **Plus Jakarta Sans** (dilarang), **Fraunces**, **Space Grotesk**, **JetBrains Mono**; kelas `.font-display`/`.font-numeric`/`.font-mono` (App.jsx:2784-2786) dipakai **18 / 39 / 49 kali** (terbanyak di `App.jsx`, `Dashboard.jsx`, `AdminPageHeader`, beberapa halaman admin). `tailwind.config.js` `fontFamily` juga masih menunjuk keempat font itu (`font-sans` = Plus Jakarta Sans, 2 pemakaian). Akibat praktis: **kelas `font-mono` ≠ IBM Plex Mono** — untuk nomor dokumen pakai `FONT_MONO`. (Terkait TD-70 / TD-14.)
4. **Dark green terlarang masih hidup → TD-269 (OPEN, ditunda; sejak 20 Sep 2026 = nomor tunggal gabungan TD-17 + TD-269, termasuk bagian emoji yang kini terukur di sana).** `#2F6B3F` = **5 file / 9 kemunculan** di `src/`, ⚠️ hanya SATU file di HRGA tapi itu token pusat modul: `hrga-tokens.js` (5× — `D.accent` `:15`, `D.msi` `:23`, `AV_COLORS[0]` `:70`, `.qa-approve` `:92` background+border; plus `D.accentSoft`/`D.msiBg` = `#E7EFE2`) → menular ke seluruh HRGA lewat `HrgaShared.jsx`. Empat file lain 1× masing-masing: `CustomerListPage.jsx:94` & `CustomerDetailPage.jsx:176` (`PIC_COLORS` avatar), `ProductsPage.jsx:75` & `ProductDetailPage.jsx:74` (kategori Warehousing `#E7EFE2`/`#2F6B3F`). (Kalimat "5 file HRGA" di ringkasan audit sebelumnya tidak presisi — angka di sini yang benar.)
5. **Latar shell**: `CLAUDE.md` Brand menyebut "app shell putih `#ffffff`" dan `06 §2` menyebut `.nexus-shell-bg` `#ffffff`; kode: `.nexus-shell-bg { background: #F2F5F9 }` (`App.jsx:2824`) dan `body`/root `#F2F5F9`. Yang putih adalah **kartu & sidebar**, bukan shell.
6. **`06 §1` sidebar "gradient 165deg navy" sudah basi** — sidebar sekarang putih, border `var(--line)`, item aktif `--p-blue`/`--navy` (`App.jsx:1567-1577`).
7. **Bahasa label campur** di dalam kit v3: `ListView` "Search…/Empty/No data", `Chatter` "Kirim/Mengirim…/Sunting/Hapus/Simpan/Batal" + "Loading comments…/No comments yet./disunting", `StatusBar` "Not closed"; AdminKit konsisten Indonesia ("Simpan/Menyimpan…/Tersimpan!/Unggah/Ganti/Hapus"); `ConfirmModal` Indonesia default tapi dipanggil dengan judul Inggris. Belum ada aturan bahasa UI tertulis.
8. **52 file** memakai objek token lokal (`const C/D/S…`) dan **11 file** masih `const PASTEL` (TD-14 PARTIAL: `App.jsx`, `AuthGate`, `CompanySwitcher`, `ErrorBoundary`, `AdminFormModal`, `AdminPageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `userAccessTokens.js`, `Dashboard.jsx`). Nilai-nilainya hampir seragam (§3.4) sehingga migrasi ke token bersama mungkin; token bersamanya = `tokens.js` sage kit tunggal (A.3) — belum ada, BELUM DIKERJAKAN.
9. **Celah kontrak AdminKit** yang sudah tercatat di TD-14: `OutlineBtn` & `FloatingSelect` tanpa `disabled`; `FloatingInput` tanpa `maxLength`; `Toggle` hanya oranye; `SaveButton` tidak menunggu Promise (menampilkan "Tersimpan!" 950 ms setelah klik apa pun hasilnya — **TD-270**, OPEN, ditunda; 6 pemakai di Admin Settings); `EntitySwitcher` single-select dengan pil selalu navy.
10. **Celah v3**: input search/textarea tanpa gaya fokus; `PrimaryBtn`/`OutlineBtn` tanpa hover; `Chatter` nol pemakai produksi & satu adapter; tiga hex papan (`#FBFAF9`, `#ECE7E2`, radius 16) sengaja belum jadi token.
11. **Peta status deal duplikat 3 tempat** (`STATUS_META`, `INQ_STATUS_TONE`, `INQ_STAGE_COLOR`) — WON navy di Inquiry List/Detail Deal tapi hijau `#1F8B4D` di funnel CRM Dashboard (TD-99, diketahui).
12. **Kontras `BY MSI`** 3.55:1 di 9.5px (TD-227).
13. Nama entitas Storbit di `hrga-tokens.js` masih `sbi` (`#9A5B2C`), sementara kode resmi entitas = `SOA`.
14. **[ditambahkan doc-keeper 19 Sep 2026 — luput dari audit pagi] Keluarga visual KEEMPAT di halaman WEB: ungu Storbit + serif print kit.** `SalesOrderDetailPage.jsx` (redesign 17 Agu 2026, `8c5b4f2`) dan `StorbitDashboardPage.jsx` (18 Agu, `1fc7b0c`) memakai `C.accent #5b3fa0` / `#4a3585` (+ tint `#EFECF6`/`#D6CFE7`) dan font `'Storbit Display'` (Cormorant Garamond 600) / `'Storbit Text'` (Lora) lewat `@font-face` di `salesOrderDetail.module.css` (TTF lokal, nol request Google Fonts) — komentar kode: *supaya layar & PDF sewarna* (keputusan Den saat itu). Sebaran `#5b3fa0` di `src/`: **6 file** = 4 PDF/print kit + **2 halaman web** ini. Konsekuensi: (a) tabel §4.1 & §0 dikoreksi; (b) pengecualian *heading Space Grotesk Detail SP* (TD-70, 15 Jul) **sudah lenyap** bersama redesign itu — 0 hit hari ini. ✅ **DIPUTUSKAN Den 20 Sep 2026 (#60 a): kedua halaman web ini IKUT penyatuan ke sage + tiga font resmi — TIDAK dianggap pengecualian dokumen customer, karena yang membukanya staff internal, bukan customer** (PDF Storbit-nya tetap dikecualikan). **Status: BELUM DIKERJAKAN** — dikerjakan sebagai bagian batch penyatuan kit (A.3); kode kedua halaman belum disentuh.

Butir 1–3 sudah punya keputusan (Bagian A). **#60 dan #61 DIJAWAB 20 Sep 2026** (`09_ROADMAP.md`): keluarga ungu/serif Storbit web (§17.14) ikut sage + tiga font (belum dikerjakan) · 5 warna KPI hero tetap (warna status ≠ identitas) · Oswald dipertahankan sadar · halaman baru ikut kit yang ada (DISETUJUI). Nol keputusan terbuka tersisa dari audit ini. Butir 4 & 9(SaveButton) tercatat sebagai **TD-269/TD-270**; butir 5–6 sudah dikoreksi di `06_UI_UX_FLOW.md` (19 Sep 2026); butir 7, 8, 10–13 tetap temuan terbuka yang ikut batch penyatuan kit. **Tidak satu pun butir di atas sudah diperbaiki di kode.**

---

## 18. Lampiran — snippet import per kit

```jsx
// CRM v3 (halaman di src/modules/crm/)
import FormSheet from './v3/FormSheet';
import Notebook from './v3/Notebook';
import StatusBar from './v3/StatusBar';
import ListView from './v3/ListView';
import { Badge, Card, DocNo, EmptyState, PrimaryBtn, OutlineBtn } from './v3/kit';
import { NAVY, ORANGE_AA, INK, INK_SOFT, MUTED, FAINT, LINE, LINE_SOFT, SURFACE, SURFACE_2,
         FONT_HEAD, FONT_BODY, FONT_MONO, SP, RADIUS, TONE, toneOf, closedFrom,
         STATUS_LABEL, DEAL_STATUS_ORDER, LIFECYCLE_ORDER } from './v3/tokens';

// AdminKit (halaman Foundation / master data)
import { KitStyles, PageHeader, SectionLabel, Card, Tabs, FloatingInput, FloatingSelect, KitSelect,
         Toggle, NumberStepper, Segmented, PrimaryBtn, OutlineBtn, SaveButton, SlideOver, Modal,
         Tooltip, DropZone, UploadBox, PillToggle, Skel, Icon, useToast, EntitySwitcher }
  from '../../../pages/foundation/admin-settings/kit';
import { NAVY, ORANGE, ORANGE_DK, CREAM, SURFACE, LINE, LINE_SOFT, ROW_HOVER, INK, INK_SOFT,
         MUTED, FAINT, DANGER, GREEN, FONT_HEAD, FONT_BODY, FONT_MONO, ENTITIES, fmtRp, fmtNum }
  from '../../../pages/foundation/admin-settings/tokens';

// Cetak gudang Storbit
import { DocPage, DocHeader, PartyBlock, Field, NoteBox, SignatureRow } from './printKit';
import { s, px, INK, PURPLE, PURPLE_DEEP, BG, ink, inkLine, fmtDate, fmtQty, companyAddress } from './printTokens';

// Bersama
import ConfirmModal from '../../components/ConfirmModal';
```

Konvensi file yang mengikat semua kit: **konstanta/token di `.js` tanpa JSX, komponen di `.jsx` yang hanya meng-export komponen** (aturan lint `react-refresh/only-export-components`) — itulah sebabnya tiap kit berpasangan `kit.jsx` + `tokens.js`.
