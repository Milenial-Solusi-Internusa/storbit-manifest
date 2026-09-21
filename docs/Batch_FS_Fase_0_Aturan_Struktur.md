# Batch FS — Fase 0: Aturan Struktur Folder, Penamaan, dan Routing

Dokumen aturan resmi sebelum eksekusi migrasi struktur folder (Batch FS Fase 1 dan seterusnya). Aturan ditulis dulu, migrasi mengikuti aturan ini, bukan sebaliknya, sama seperti pola yang sudah dipakai untuk Design System (Batch DS).

---

## 1. Prinsip Dasar

1. Aturan ditulis dulu, dokumentasinya jadi acuan, baru migrasi jalan mengikuti aturan itu.
2. Satu konsep, satu rumah. Kalau ada dua folder atau dua nama yang artinya sama, salah satu harus mengalah, tidak ada dua sumber kebenaran untuk hal yang sama.
3. Modul kecil boleh sederhana, modul yang direncanakan berkembang wajib siap dari awal. Bukan semua modul harus punya struktur seberat yang lain, tapi modul yang memang direncanakan tumbuh (sesuai roadmap Grand Design) tidak boleh mulai dari struktur yang akan keburu dibongkar ulang begitu isinya bertambah.
4. Nama boleh Bahasa Indonesia untuk konten yang dilihat user (label, tombol), tapi nama file dan folder di kode konsisten Bahasa Inggris ke depannya, mengikuti keputusan yang sudah diambil saat CRM v3 diinggriskan.

---

## 2. Taksonomi Modul Mengikuti Bagian 1 Grand Design

Sembilan modul yang sudah dirancang di Bagian 1 Grand Design (CRM, Procurement, Logistics & Warehouse, Console, PPJK, Finance & Accounting, HCGA, Digital Transformation, Quality Management) adalah peta resmi yang jadi acuan nama folder `src/modules/`, bukan nama yang tumbuh sendiri-sendiri seperti sekarang.

Kenyataan sekarang berbeda dari peta itu. Contoh: Sales Order Management yang di Bagian 1 rumahnya CRM, di kode malah jadi modul sendiri (`sales-order/`) berisi satu baris data. Finance & Accounting yang di Bagian 1 sudah punya tempat jelas, di kode malah kepencar jadi halaman lepas di dalam `App.jsx`.

Aturan resminya, mulai sekarang, folder modul bisnis baru wajib pakai nama dari sembilan modul itu, bukan nama baru yang muncul spontan. Pemetaan ulang folder yang sudah ada masuk Fase 3 dan 4, bukan bagian dari Fase 0 ini.

Modul yang bukan modul bisnis (Admin/Foundation Settings, Home, Dashboard, Assets) dikelompokkan terpisah sebagai modul sistem/utilitas di bawah `modules/system/`, tidak dipaksa masuk sembilan modul bisnis kalau memang tidak cocok.

---

## 2a. Keputusan: BNF-family Dihapus Total, Bukan Digabung

Tiga modul yang sebelumnya direncanakan digabung jadi satu keluarga (BNF, Briefing Harian, Meeting Mingguan) sudah diputuskan **DIHAPUS TOTAL**, bukan digabung. Alasan: ketiganya dianggap modul coba-coba yang sudah tidak relevan untuk MSI Group.

"Dihapus total" berarti kode DAN data, bukan sekadar disembunyikan dari menu. Sebelum eksekusi, data yang ada (laporan insiden, riwayat eskalasi) diekspor dulu sebagai backup di luar aplikasi sebagai jaring pengaman, baru tabel database dan Edge Function terkait (termasuk cron job pengingat overdue) benar-benar dihapus.

Modul ini tidak muncul lagi di manapun dalam Peta Struktur Target, termasuk sebagai bagian dari `modules/system/`.

---

## 3. Struktur Folder Resmi `src/`

```
src/
  App.jsx              hanya shell/layout dan penyedia context, TIDAK lagi
                       tempat 58 halaman didaftarkan
  main.jsx
  index.css
  routes/              satu-satunya sumber peta routing, lihat bagian 6
  assets/              file statis (logo, font) saja, bukan modul bisnis
  components/          komponen yang dipakai LINTAS MODUL saja
  contexts/
  hooks/               hook yang dipakai LINTAS MODUL saja
  kit/                 design system, sudah settled dari Batch DS
  lib/                 utilitas yang dipakai LINTAS MODUL saja
  modules/
    crm/
    procurement/
    logistics-warehouse/
    console/
    ppjk/
    finance-accounting/
    hcga/
    it/
    quality-management/
    system/            payung modul non-bisnis: admin-settings, home,
                       dashboard, assets
```

---

## 4. Aturan Struktur Internal Modul

```
Modul (atau sub-fitur di dalam modul besar) boleh flat (file langsung di
root) HANYA kalau:
  - jumlah file 3 atau kurang, DAN
  - tidak direncanakan berkembang di roadmap manapun

Modul (atau sub-fitur) WAJIB punya pages/ (dan components/, hooks/ kalau
perlu) kalau:
  - jumlah file lebih dari 3, ATAU
  - memang direncanakan berkembang (modul yang masih kosong di Gap
    Analysis Bagian 4, begitu mulai dibangun, wajib mulai dengan struktur
    ini dari hari pertama, bukan mulai flat lalu dibongkar belakangan)

Aturan ini berlaku BERJENJANG, di level modul maupun di level sub-fitur
di dalamnya. Sub-fitur yang kecil tidak otomatis dibungkus folder cuma
karena modul induknya besar.
```

---

## 4a. Modul Besar: Dipecah per Sub-Fungsi Level 2 Bagian 1

Modul yang jumlah filenya banyak dan kompleks (contoh nyata sekarang: CRM, 45 file) dipecah satu tingkat lagi, per sub-fungsi Level 2 yang sudah dirancang di Bagian 1 Grand Design, bukan folder generik "feature/". Nama sub-fitur pakai nama pendek (`quotation/`, bukan `quotation-management/`), karena konteks modul induk sudah jelas dari posisi foldernya (`modules/crm/quotation/` sudah cukup jelas tanpa perlu diulang).

**Pemisahan `pages/` vs `documents/`:** halaman interaktif (form, list, detail) masuk `pages/`; dokumen cetak (PDF, teknologinya beda, pakai react-pdf) masuk `documents/`. Isi dan tata letak tiap dokumen tetap boleh berbeda sesuai jenisnya (Invoice wajar beda dari Surat Jalan), yang perlu disatukan hanya bagian struktural yang seharusnya identik di semua dokumen (kop surat, footer bernomor halaman, blok tanda tangan, watermark status Draft) — lihat Bagian 9 soal audit ini.

Contoh struktur CRM setelah dipecah (ilustrasi, eksekusi sebenarnya di Fase 7, bukan Fase 3/4, karena ini soal standarisasi struktur internal modul, bukan sekadar nama yang bentrok makna atau penghapusan modul BNF-family):

```
modules/crm/
  lead/
    pages/          LeadListPage.jsx
  inquiry/
    pages/          InquiryListPage.jsx, InquiryDetailPage.jsx
  quotation/
    pages/          QuotationFormPage.jsx, QuotationDetailPage.jsx
    documents/      QuotationPDF.jsx
  pipeline/
    pages/          PipelineKanbanPage.jsx
  customer/
    pages/          CustomerListPage.jsx, CustomerDetailPage.jsx
    documents/      ActivityReportPDF.jsx, VisitHistoryPDF.jsx, RateSheetPDF.jsx
  handover/
    pages/          (menyusul, lihat catatan Order Handover di Bagian 10)
  components/       HANYA komponen yang dipakai 2 sub-fitur CRM atau lebih;
                    dipakai di 1 sub-fitur saja, taruh di dalam sub-fitur itu
```

Modul yang isinya masih sedikit sub-fungsi (Logistics & Warehouse, Finance & Accounting) pakai pola ini kalau memang sudah punya beberapa sub-fitur dan dokumen cetak, tidak perlu dipecah sampai sedetail CRM kalau belum perlu. Modul yang masih kosong sekarang (Console, PPJK), begitu mulai dibangun, tentukan kebutuhan pecahnya dari jumlah sub-fungsi Level 2 di Bagian 1 dulu.

---

## 4b. Barrel Export (`index.js`)

Setiap sub-fitur yang sudah wajib punya `pages/` (bukan flat, lihat Bagian 4) wajib juga punya `index.js` sendiri, isinya re-export komponen halaman utamanya. Jadi impor dari luar cukup:

```
import { QuotationFormPage } from '@/modules/crm/quotation'
```

bukan drilling sampai:

```
import QuotationFormPage from '@/modules/crm/quotation/pages/QuotationFormPage'
```

Sub-fitur yang masih flat (3 file atau kurang) TIDAK wajib `index.js`, impor langsung ke filenya juga masih pendek dan jelas.

---

## 5. Batas Shared vs Milik Satu Modul/Sub-Fitur

```
Naik ke src/hooks/ atau src/lib/ (lintas MODUL) HANYA kalau dipakai 3
modul atau lebih.

Naik ke modules/<modul>/hooks/ atau modules/<modul>/lib/ (lintas
sub-fitur, TAPI masih dalam satu modul) HANYA kalau dipakai 2 sub-fitur
atau lebih dalam modul yang sama.

Naik ke components/ di level MODUL (lintas sub-fitur, dalam modul besar
yang sudah dipecah per Bagian 4a) HANYA kalau dipakai 2 sub-fitur atau
lebih.

Kalau cuma dipakai di 1 sub-fitur, taruh di dalam sub-fitur itu sendiri
(modules/<modul>/<sub-fitur>/hooks/), jangan naik ke level yang lebih
umum "buat jaga-jaga".

Jadi ada tiga tingkat, bukan dua: sub-fitur (dipakai 1 sub-fitur saja)
-> modul (dipakai 2 sub-fitur atau lebih, masih satu modul) -> global
(dipakai 3 modul atau lebih).
```

---

## 5a. Aturan Impor Antar Sub-Fitur dan Antar Modul

Import LANGSUNG antar sub-fitur yang bertetangga DALAM MODUL YANG SAMA itu BOLEH, karena memang mencerminkan hubungan asli di Document Chain Bagian 1 (Quotation merujuk Customer, Inquiry menghasilkan Quotation, dan seterusnya). Ini bukan gejala kode berantakan, ini hubungan bisnis yang memang ada.

Import LANGSUNG antar MODUL BISNIS yang berbeda TIDAK BOLEH untuk komponen tampilan (satu modul tidak boleh mengimpor komponen halaman dari modul lain). Yang boleh lintas modul hanya fungsi dari `src/lib` atau `src/hooks` yang sudah naik ke level global, dan referensi data (ID, tautan ke dokumen) yang memang dirancang lintas modul di Document Chain. Ini konsisten dengan prinsip "menu tertutup per departemen" dan "dokumen numpang lewat, bukan dimiliki" yang sudah ditetapkan di Bagian 3 Grand Design.

---

## 6. Routing Tunggal

Seluruh definisi rute (58 halaman dari `App.jsx`, 25 destinasi dari AdminHub, plus yang di `AssetShell` dan `HrgaShell`) dipindah ke `src/routes/`, satu peta yang mencatat path, komponen, dan modul pemiliknya. `App.jsx` ke depannya hanya me-render shell dan outlet, tidak lagi memegang daftar halaman. Ini sekaligus menutup TD-12.

**Bentuk `src/routes/`:** satu file kecil per modul (`routes/crm.routes.js`, `routes/procurement.routes.js`, dan seterusnya), digabung jadi satu daftar utuh di `routes/index.js` yang diimpor `App.jsx`. Bukan satu file raksasa isinya 58 baris rute dicampur, biar tiap modul juga gampang menambah rute sendiri tanpa menyenggol punya modul lain.

**Konvensi URL:** `/<nama-modul>/<nama-sub-fitur>/<aksi>`, semua kebab-case, PERSIS sama dengan nama folder, supaya begitu tahu struktur foldernya, otomatis tahu URL-nya, tanpa perlu tabel terjemahan terpisah. Contoh:

```
/crm/quotation                              daftar
/crm/quotation/new                          buat baru
/crm/quotation/:id                          detail
/logistics-warehouse/warehouse/picking-packing/:id
```

Modul non-bisnis di bawah `modules/system/` TIDAK perlu prefix `system` di URL-nya (itu detail organisasi kode saja, tidak perlu bocor ke user), cukup `/admin-settings/...`, `/home`, `/profile`.

**Catatan keadaan kode (21 Sep 2026, eksekusi Fase 2.5):** Sebelum Fase 2.5, Nexus tidak memakai library routing berbasis path — navigasi = state `activeMenu` di memori yang dicerminkan ke satu parameter URL (`?menu=<id>`), bukan path sungguhan. Keputusan Den 21 Sep 2026: Fase 2.5 memasang routing berbasis path dengan `react-router` v7 (bukan v8), dikerjakan per giliran G0–G6. G0 sudah memasang dependency-nya dan kontrak URL `src/routes/menu-paths.js` (masih kode mati — nol pengimpor); `?menu=<id>` tetap mekanisme aktif sampai G1+ memindahkan rute ke `src/routes/`, dan `?menu=<id>` lama diharapkan ter-redirect ke path barunya. Jadi konvensi URL di atas BUKAN aspirasi — ia kontrak yang sedang diwujudkan bertahap; status per giliran ada di §Catatan Terbuka "Status Fase 2.5".

---

## 7. Path Alias

Pakai satu alias `@/` menunjuk ke `src/`, sehingga impor menjadi `@/kit/Button` atau `@/modules/crm/...`, bukan lagi `../../../../modules/crm/...`. Satu alias saja, tidak perlu alias granular per folder.

---

## 8. Aturan Penamaan

```
Bahasa    : file dan folder baru wajib Bahasa Inggris. File lama berbahasa
            Indonesia boleh tetap dulu, rename total masuk Fase 8 (opsional)
Folder    : kebab-case (logistics-warehouse, sales-order)
Komponen  : PascalCase.jsx (InquiryListPage.jsx)
Helper/hook/konstanta : camelCase.js (quotationVersion.js, useSpItems.js)
Akronim dalam PascalCase : huruf besar penuh (CRMDashboardPage, PRFFormPage,
            HRGARequestPage), bukan Crm/Prf/Hrga
Akronim dalam camelCase  : huruf kecil penuh di awal gabungan kata
            (prfShared, spCalc), ini sudah benar di kode sekarang
Suffix    : semua file halaman penuh wajib akhiran Page. Shell/hub/router
            (AdminHub, AssetShell) boleh tanpa Page karena bukan halaman konten
Sub-fitur : nama folder pendek (quotation/, bukan quotation-management/),
            konteks modul induk sudah jelas dari posisi folder
```

---

## 9. Audit Bagian Struktural Berulang di Dokumen PDF

Bukan menyamakan format semua dokumen PDF (Invoice, Surat Jalan, Laporan Aktivitas memang wajar beda isi dan tata letak sesuai fungsinya masing-masing, itu Document Chain bekerja dengan benar). Yang perlu diaudit adalah apakah bagian struktural yang seharusnya identik di semua dokumen resmi MSI/JCI/SOA, kop surat, footer bernomor halaman, blok tanda tangan, watermark status Draft, sudah memakai satu fungsi/komponen bersama, atau masih ditulis ulang sendiri-sendiri tiap dokumen.

Dari audit folder sebelumnya, Logistics punya `printKit.jsx` sendiri untuk empat dokumennya, sementara PDF di CRM (Quotation, Activity Report, Visit History, Rate Sheet) belum terkonfirmasi memakai itu atau punya versi sendiri. Ini yang perlu dicek sebelum Fase 7, bukan dipaksa satu format seragam untuk seluruh dokumen.

Kalau hasil audit menyimpulkan bagian struktural ini perlu disatukan, rumah targetnya `src/kit/print/` (perluasan dari `kit/` yang sudah ada dari Batch DS), bukan folder besar terpisah di `src/`. Ini baru dieksekusi setelah hasil audit keluar, bukan diputuskan sekarang.

---

## 10. Daftar Rename yang Sudah Jelas Arahnya

```
modules/sales-order/ (SO CRM, 1 baris data)
  -> digabung masuk modules/crm/, karena itu memang rumahnya di Bagian 1

modules/logistics/SalesOrderPage.jsx (SP Storbit)
  -> tetap nama Sales Order, tapi rumahnya modules/logistics-warehouse/,
     dan penjelasan "ini Surat Pesanan Storbit" ditegaskan di komentar
     kepala file supaya tidak ketukar lagi

App.jsx inline CustomersPage/FinancePage/OutstandingPage/ARTrackerPage
  -> dipindah jadi modules/finance-accounting/pages/, bukan lagi
     nginap di dalam App.jsx

src/modules/foundation/OrgStructurePage.jsx
  -> pindah ke modules/hcga/pages/, karena itu persis Employee Directory
     poin 7.1.2 di Bagian 1, bukan modul sendiri bernama "foundation"

src/pages/foundation/ (AdminHub dan admin-settings/)
  -> semua pindah ke modules/system/admin-settings/, "pages/" di root
     dihapus total, tidak ada lagi dua rumah untuk halaman
```

BNF-family sudah final diputuskan dihapus total (lihat Bagian 2a), bukan lagi menunggu Fase 4. Sisanya (Dashboard yang kepencar tujuh tempat) tetap diputuskan detail di Fase 4.

---

## 11. Aturan Folder `docs/`

Sembilan folder huruf kecil yang beku sejak Mei-Juli (architecture, database, security, dan sejenisnya) dipindah ke `docs/archive/` atau dihapus kalau isinya sudah tergantikan total oleh Governance. `docs/Governance/` jadi satu-satunya dokumentasi teknis yang hidup.

---

## 12. Aturan Root Repo

Seed data dan file backup pindah ke folder baru `scripts/seed/` dan `scripts/backup/`, tidak boleh lagi ada file lepas nangkring di root.

---

## 13. Checklist Scalable

Tiap keputusan struktur di atas dicek balik pakai tiga pertanyaan ini sebelum dianggap final:

```
Kalau modul ini isinya bertambah sepuluh kali lipat, apakah strukturnya
masih masuk akal?
Kalau ada modul baru yang mirip, apakah jelas dia harus ikut pola yang mana?
Kalau developer baru membuka folder ini tanpa penjelasan, apakah dia bisa
menebak isinya apa dari namanya saja?
```

---

## 14. Catatan Risiko Jangka Panjang (Di Luar Scope Batch FS)

Satu hal yang sengaja TIDAK masuk delapan fase Batch FS ini karena skalanya beda kelas dari rapi-rapi folder: Nexus belum pakai TypeScript. Untuk aplikasi ERP seukuran ini (tiga badan usaha, data finansial), ini risiko yang lebih besar dari soal nama folder atau penamaan file, tapi migrasinya sendiri adalah proyek besar terpisah, butuh keputusan dan perencanaan sendiri. Dicatat di sini sebagai kesadaran risiko, tidak diputuskan atau dieksekusi sebagai bagian dari Batch FS.

---

## Catatan Terbuka yang Dibawa ke Fase Berikutnya

### Status Fase 1 — buang dead code yang tidak terjadwal di rencana lain (21 Sep 2026)

```
SELESAI (dihapus, dikerjakan di branch feat/fs-fase1-dead-code):
  [x] src/modules/hrga/components/HrgaRequestDetail.jsx (542 baris) +
      HrgaRequestForm.jsx (398 baris) — fungsinya sudah digantikan
      hrga/pages/HrgaDetailPage.jsx & BuatRequestPage.jsx sejak Jun 2026;
      folder hrga/components/ ikut hilang karena kosong
  [x] src/pages/foundation/admin-settings/AdminSettingsHub.jsx (105 baris) —
      hub lama yang yatim total; BUKAN pages/foundation/AdminHub.jsx (hub
      yang hidup, 25 destinasi, tetap utuh)
  Verifikasi: grep ulang nol pengimpor untuk ketiganya (rujukan tersisa
  hanya komentar + simbol lain useHrgaRequestDetail) · build 2.646 modul ·
  lint 159 (138/21) = baseline · git diff --stat persis 3 file, 1.045 baris,
  nol file lain tersentuh.
  Konsekuensi angka: pengimpor src/kit di Foundation 22 -> 21 file
  (AdminSettingsHub termasuk hitungan Batch DS 2); TD-181 butir (a) tertutup
  penuh (AdminShell sudah dihapus f3172c7), butir (b) tetap terbuka.

SENGAJA TIDAK DISENTUH Fase 1 — sudah punya jadwal sendiri (instruksi Den
21 Sep 2026):
  crm/v3/Chatter.jsx + crm/v3/__demo/CrmV3DemoPage.jsx      -> Batch DS 3
  admin-settings/kit.jsx + tokens.js (kit lama, nol pemakai) -> Batch DS 7
  crm/LightHandoverModal.jsx + StrategicHandoverModal.jsx    -> Fase 3/7,
      jejak fitur Order Handover yang belum dibangun resmi, bukan dead code
      biasa (lihat butir Order Handover di bawah)
```

### Status Fase 2.5 — routing berbasis path (React Router v7), giliran G0 (21 Sep 2026)

```
DIPUTUSKAN Den 21 Sep 2026 (15 asumsi + 2 tambahan dijawab di chat; label
"Fase 2.5" milik Den). Pelaksanaan §6 dipecah per giliran G0–G6; G0 menunggu
review Den sebelum giliran berikutnya. Blok ini = status, ditulis doc-keeper;
§1–§14 tidak diubah.

G0 — fondasi TANPA perubahan perilaku (branch feat/fs-fase2-5-router):
  SELESAI, menunggu review Den. Nol halaman/route pindah; `?menu=<id>` tetap
  mekanisme aktif; nol migrasi/SQL; tampilan tidak berubah.
  [x] dependency: react-router ^7.18.4 (v7, bukan v8 — keputusan #4; belum
      diimpor siapa pun → tree-shaken), @sentry/react ^10.75.0,
      dev playwright-core ^1.63.0; npm audit tetap 2 moderate lama (TD-220)
  [x] vite.config.js alias `@/` → src/ (regex ^@/, §7; nol pemakai dulu) +
      chunk vendor-router / vendor-sentry · jsconfig.json (IntelliSense) ·
      vercel.json rewrite SPA → /index.html kecuali assets/, favicon-,
      icons.svg, apple-touch-icon (BELUM terbukti di Vercel — butuh push)
  [x] src/routes/menu-paths.js = KONTRAK URL (kode mati di G0): MENU_PATHS 68
      (termasuk 4 id sintetis detail → daftar induk) · PLANNED_MENU_IDS 71 →
      /planned/<id> (#3) · LEGACY_MENU_PATHS 20 · DETAIL_ROUTE_TEMPLATES ·
      ADMIN_SECTION_IDS 26 (komentar kode masih "25" — basi) · pathFor() ·
      menuIdForPath() · KNOWN_MENU_IDS 159. Nama modul = TARGET Peta, bukan
      folder hari ini (#1 prefix /logistics-warehouse/warehouse/… tetap;
      #2 leaf /crm/lead, /finance-accounting/*, /hcga/service-request/*,
      /bnf/*, /reporting/mom, /assets/*, /admin-settings/*, /profile)
  [x] src/main.jsx: Sentry init MINIMAL hanya bila VITE_SENTRY_DSN terisi
      (tanpa DSN nol request); ErrorBoundary BELUM diintegrasikan → G1
  [x] .github/workflows/ci.yml: build → scripts/qa/lint-baseline.mjs →
      scripts/qa/check-menu-paths.mjs (Node 22, nol secret; run pertama
      menunggu push)
  [x] scripts/qa/ (masuk repo, tidak di-gitignore — #12): README (cara pakai + checklist manual per
      giliran) · check-menu-paths.mjs (144 id tercakup, 135 rute kanonik
      unik) · lint-baseline.mjs + .json (138 error / 21 warning / 58 file) ·
      menu-sweep.mjs (Playwright; QA_PASSWORD env; menolak ref produksi;
      hash bukan teks; mode menu/restore/path) · baseline/menu-sweep +
      baseline/menu-sweep-restore = 5 akun × 162 tujuan × 2 mode dari build
      main + DB staging (884 KB)
      -> DIBANGUN ULANG 21 Sep 2026 sore dari build main 7e3660c (sesudah
         hotfix TD-271; 896 KB): perbedaan vs baseline pertama (46f249f) =
         22 menu / 28 restore, SEMUANYA perbaikan (tier-3 kini mengadopsi
         persis izin rolenya; 4 id legacy crm-customers-* dinormalkan), nol
         tujuan hilang — dihitung ulang doc-keeper; ronde 2 build hasil
         sinkron branch vs baseline baru IDENTIK 0/1.620
  [x] src/App.jsx:40-44 koreksi komentar basi (satu-satunya sentuhan App.jsx)
  Gate: build 2.997 modul (2.646 + 351 modul Sentry ter-tree-shake) ·
  lint 138/21 = baseline · check-menu-paths lolos · sweep G0 vs main
  IDENTIK (1.620 pembanding). Angka diukur ulang doc-keeper.
  Persiapan G1 (21 Sep 2026 sore–malam, branch yang sama): branch
  disinkronkan dengan main yang memuat hotfix TD-271 (kode yang masuk =
  persis src/contexts/AuthContext.jsx +37/−3; 4 dokumen konflik dilebur);
  gate hasil sinkron diukur ulang doc-keeper = 2.997 · 138/21 · 135 rute.
  NOL kode aplikasi baru; G1 TETAP belum mulai.

Temuan sweep yang BUKAN bagian Batch FS (register 08_TECH_DEBT.md):
  TD-271 (HIGH, produksi; RESOLVED 21 Sep 2026 sore) — deep-link ?menu= & restore
      menu terakhir gagal untuk user tier-3 role-default (race permissionsLoading
      vs erpRoles); bentuk perbaikan (hotfix main vs G1) = Keputusan Terbuka #63
      -> DIJAWAB 21 Sep 2026: (a) hotfix main (AuthContext.jsx, flag rolesReady),
         LIVE produksi 16:05 WIB (deploy 7e3660c); baseline sweep dibangun ulang
         dari build main 7e3660c; G1 tidak perlu menambal race ini sendiri
  TD-272 (LOW) — restore nexus_last_menu menembus gate untuk id di luar
      pohon / anak ber-prefix allow-list → syarat desain G1: gate berbasis
      kunci MENU_KEY_MAP, bukan keanggotaan pohon

Kandidat item Fase 3 (keputusan Den 21 Sep: DITAHAN, bukan sekarang):
  rename istilah HRGA → HCGA di kode/menu id (hrga-*, svc_hrga_*,
  modules/hrga/)

Untuk Den (bukan doc-keeper): §12 perlu +1 baris scripts/qa/; §6 pola nama
  file rute .routes.js → .jsx (keputusan #11); angka "25 destinasi" §6 basi
  (AdminHub 26 kartu sejak 30 Agu 2026); project Sentry + VITE_SENTRY_DSN /
  VITE_APP_ENV di Vercel Production & Preview; push branch supaya CI jalan
  pertama kali & Preview membuktikan vercel.json.

G1–G6: BELUM mulai; hanya atas instruksi Den, setelah review G0.
```

```
Dua Chatter (InquiryChatter dipakai, v3/Chatter.jsx 554 baris nol pemakai)
  -> dead code; semula dijadwalkan Fase 1, DIGESER ke Batch DS 3 bersama
     CrmV3DemoPage.jsx (instruksi Den 21 Sep 2026; Batch DS 3 = giliran kit
     CRM v3 dilebur ke kit tunggal, lihat CLAUDE.md). Keputusan apakah
     InquiryChatter yang hidup masuk components/ level modul CRM tetap
     menyusul setelah itu

Order Handover (sub-fungsi Level 2 CRM di Bagian 1) sudah punya jejak kode:
  dua modal yatim, LightHandoverModal dan StrategicHandoverModal
  -> dihitung sebagai bagian sub-fitur handover/ saat pemetaan ulang CRM
     di Fase 3/4, bukan diskip diam-diam

Bagian struktural PDF (kop, footer, tanda tangan, watermark)
  -> audit dulu pemakaian printKit.jsx vs versi sendiri-sendiri di CRM,
     sebelum eksekusi Fase 7
```

---

*Dokumen ini adalah Fase 0 dari Batch FS (Folder Structure). Fase 1 dan seterusnya (buang dead code termasuk hapus total BNF-family, satukan routing, rename yang bentrok makna, bersihkan docs, bersihkan root, standarisasi struktur modul, standarisasi penamaan) mengeksekusi berdasarkan aturan di dokumen ini.*
