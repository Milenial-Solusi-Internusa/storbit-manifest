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

### Status Fase 2.5 — routing berbasis path (React Router v7), giliran G0 (21 Sep 2026) + G1 (22 Sep 2026) + G2 (22 Sep 2026)

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
      [→ G1 (22 Sep) SENGAJA tidak mengerjakannya — di luar 8 butir G1; TD-08 tetap]
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
  NOL kode aplikasi baru; G1 TETAP belum mulai [→ G1 dikerjakan 22 Sep 2026,
  blok berikut].

G1 — mekanisme alamat ditukar: `?menu=<id>` → PATH (22 Sep 2026):
  SELESAI, DIREVIEW Den, DI-MERGE, dan LIVE DI PRODUKSI 22 Sep 2026 (PR #31 →
  main lewat MERGE COMMIT 0efec44 — keputusan Den: bukan squash/rebase, supaya
  3 commit c729d99 / 2df30f8 / 76beb9a tetap bisa ditelusuri satu-satu; branch
  feat/fs-fase2-5-router tidak dihapus). Nol migrasi/SQL; NOL halaman pindah
  lokasi fisik; NOL prop komponen halaman berubah — hanya bentuk alamat +
  sumber activeMenu (state → URL). Angka diukur ulang doc-keeper; detail per
  file + bukti merge/CI/deploy: PROGRESS.md 2026-09-22 (butir 14).
  [x] src/main.jsx: <RouterProvider router={router} useTransitions={false}/>
      di dalam AuthProvider; root route = <AuthGate><App/></AuthGate> (urutan
      pembungkus tetap). useTransitions={false} = prop resmi react-router 7.18
      (handoff setState+navigate tetap satu commit) — asumsi teknis sesi
  [x] src/routes/index.jsx (peta rute tunggal; §6 mulai terwujud): index →
      IndexRedirect (nexus_last_path | pathFor(nexus_last_menu) | /home,
      divalidasi matchRoutes; tak menunggu izin = restore lama) ·
      ...legacyMenuRoutes · `*` → `/` (menu terakhir/home, BUKAN NotFound —
      keputusan Den #2; NOT_FOUND_PATH tetap tak dipakai)
  [x] src/routes/legacy.routes.jsx: 167 rute `${path}/*` (MENU_PATHS
      non-sintetis 64 + PLANNED 103), handle.menuId, SATU instance
      <LegacyMenuOutlet/> dibagi semua rute (pindah rute tak me-remount).
      Nama .routes.jsx = keputusan #11; file per modul (crm.routes.jsx …)
      lahir di G2–G6
  [x] src/routes/LegacyMenuRedirect.jsx: `?menu=<id>` lama → path barunya,
      dirender App.jsx MENGGANTIKAN <Outlet/> selama param ada; gate = replika
      persis effect adopsi lama (tunggu permissionsLoading/bnfAuthLoading →
      canRenderPage → lolos pathFor, gagal `/`)
  [x] src/contexts/appShellCtx.js + useAppShell.js (jembatan state App →
      anak rute) · src/hooks/useUrlState.js DIHAPUS (keputusan Den #4)
  [x] src/App.jsx +273/−168 (5.613 → 5.718 baris): state activeMenu DIHAPUS →
      turunan handle.menuId (useMatches); 3 id sintetis detail
      (customer-detail/assets-detail/product-detail) dibawa location.state.menu
      di path daftar induk, berlaku hanya bila payload ada (keputusan Den #1) ·
      setActiveMenu = useCallback → navigate(pathFor(id), {replace bila path
      sama, state}) — nama/tanda tangan tetap · adminInitialSection = turunan
      splat /admin-settings/<section> (ADMIN_SECTION_IDS) · nexus_last_path
      ditulis + nexus_last_menu TETAP ditulis (keputusan Den #3) · FIX B guard
      tetap, pentalan → navigate(replace) · 3 effect URL-sync lama (71 baris)
      dicabut; 2 effect normalisasi id lama dibiarkan (#4) · region render
      (973 baris) pindah UTUH ke `export function LegacyMenuOutlet()`
      (App.jsx:3265-4271, 113 kunci via useAppShell) — byte-identik kecuali
      IIFE redirect 12 id legacy → <Navigate/>
  [x] ⚠️ KONTRAK URL BERUBAH: +32 id camelCase ke PLANNED_MENU_IDS (jobCosting,
      cashBank, procRequest+4, purchaseOrder+4, docMgmt+4, apiCenter+3,
      publicTracking+2, customerPortal+3, vendorPortal+3) → PLANNED 71 → 103 ·
      KNOWN_MENU_IDS 159 → 191 · rute kanonik 135 → 167. Path /planned/<id>
      VERBATIM camelCase (bukan kebab; supaya PLANNED_MODULES[activeMenu] tetap
      cocok) — rename ke kebab = kandidat Fase 3/8, belum diputuskan. Akar:
      regex gate G0 [a-z0-9-] melewatkan id camelCase (kini [A-Za-z0-9-]; id
      tercakup 144 → 176); ketahuan karena klik Job Costing / Cash-Bank diam
  [x] scripts/qa: check-menu-paths regex 3 tempat · menu-sweep `--ignore a,b` ·
      lint-baseline.json 138 → 137 (App.jsx 6 → 5, --update sadar) · README
      +aturan pembanding (menu↔menu · restore↔restore · path↔RESTORE)
  Gate: build 3.009 modul (+vendor-router 96,66 kB) · lint 137/21 = baseline
  baru · check-menu-paths ✔ 176 id / 167 rute. Sweep final (5 akun × 194 × 3
  mode, staging, dihitung ulang doc-keeper): menu 2 perbedaan (hash drift data,
  hash identik dengan build main hari ini) · restore 39 (10 probe → /home · 20
  id sintetis detail → daftar induk/pentalan · 7 kontainer CRM → tab pertama ·
  2 hash) — semua disengaja · path 39 yang PERSIS sama (= semantik restore) ·
  +160 tujuan baru (32 id × 5) identik 160/160 vs main · nol gagal-muat.
  Uji interaktif super_admin (laporan sesi): sidebar, alur detail/handoff,
  Back/Forward, `/?menu=` → path, `/foo/bar` → `/`, drawer mobile, logout —
  lolos. BELUM saat itu: login dari path dalam · akun sales via sidebar ·
  Vercel Preview. [→ Preview + login dari path dalam LOLOS, CI hijau, deploy
  produksi terverifikasi — lihat ekor blok ini; sisa: uji akun sales via
  sidebar.]
  Register: nol TD baru, nol Keputusan Terbuka baru (TD-12 tetap; TD-272 TETAP
  OPEN — gate tidak diubah; TD-08 ErrorBoundary Sentry sengaja tidak
  dikerjakan) — keduanya DIKONFIRMASI Den 22 Sep 2026: tetap di luar scope G1.
  Kandidat (keputusan Den): rename 32 id camelCase → kebab (Fase 3/8) · cabut
  dual-write nexus_last_menu + overlay location.state saat detail dapat /:id
  (G2+). → G2 (keputusan Den 22 Sep): AdminHub masih state lokal — sub-path
  /admin-settings/<section> hanya dibaca saat mount, klik kartu di hub tidak
  mengubah URL (sama seperti sebelum G1); TD-129 tetap OPEN.
  Tindak lanjut 22 Sep 2026 (keputusan Den; nol kode aplikasi): BASELINE SWEEP
  RESMI DIGANTI dengan hasil G1 — baseline/menu-sweep ← out/g1f-menu ·
  menu-sweep-restore ← g1f-restore · menu-sweep-path (BARU) ← g1f-path; 5 akun
  × 194 tujuan, build G1 (c729d99) + staging; byte-identik out/g1f-*
  (diverifikasi doc-keeper); lama→baru: menu 162 (2 hash drift + 160 baru) ·
  restore 199 (39 + 160 baru) · path = folder baru, isinya ≡ restore (hanya
  `url` yang dibuka berbeda). Sejak ini tiap mode ↔ baseline mode-nya sendiri,
  --ignore tidak wajib (scripts/qa/README.md, diperbarui sesi).
  Vercel Preview TERBUKTI (laporan sesi + uji Den): rewrite vercel.json jalan
  dan LOGIN DARI PATH DALAM mendarat di Quotation List, bukan Home (butir 6
  checklist README tertutup) → lampu hijau merge dari Den.
  PRODUKSI (22 Sep 2026, laporan sesi — HTTP, nol login): deploy terverifikasi
  (index.html sha + chunk index berubah); 8 path dalam → 200 text/html
  byte-identik root, termasuk /planned/jobCosting dan /foo/bar; aset tetap
  aset (application/javascript · image/svg+xml · image/png); chunk
  vendor-router-* ter-deploy (react-router masuk bundle produksi, bukan
  tree-shaken seperti G0). Sebelum merge /crm/dashboard = 404 text/plain →
  inilah bukti vercel.json bekerja di produksi (§6/G0 "belum terbukti" sudah
  terlampaui). CI GitHub Actions jalan PERTAMA kali sejak dibuat di G0: dua
  run HIJAU (PR + pasca-merge), angkanya cocok pengukuran doc-keeper (build
  3.009 · lint 137/21 · 176 id). Anotasi untuk Den (bukan kegagalan):
  actions/checkout@v4 + setup-node@v4 menargetkan Node 20 yang deprecated;
  ubuntu-latest → Ubuntu 26 mulai 19 Okt 2026 = housekeeping workflow.
  Baseline sweep scripts/qa/baseline/* kini mencerminkan kode yang LIVE di
  produksi → sweep berikutnya dibandingkan ke perilaku produksi, bukan ke
  main pra-G1. BELUM: uji interaktif akun sales lewat sidebar.
  BATAS G1 YANG DISENGAJA (bukan temuan/gap baru; koreksi atas dugaan saat uji
  Preview): halaman detail & form yang dibuka DARI dalam satu menu — Detail
  Deal, Detail Quotation, Detail PRF, Detail SP, Detail Picking/Surat Jalan,
  Detail MOM, seluruh form — TIDAK punya alamat sendiri: 18 state jadi kondisi
  cabang render di LegacyMenuOutlet (+ payload spt editingQuotation) yang tak
  pernah menyentuh URL, persis seperti sebelum G1 (kondisi render Detail Deal
  byte-identik main 7e3660c). Ini BUKAN "id sintetis detail" — id sintetis
  tetap 4 (customer-detail/product-detail/assets-detail/user-edit); string
  `deal-detail` nol hit di kode (src/, scripts/) dan nol kunci di baseline
  sweep — id itu tidak pernah ada. Diselesaikan
  G2+ lewat rute ber-:id (DETAIL_ROUTE_TEMPLATES), sekaligus mencabut overlay
  location.state untuk 3 id sintetis.

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
  Tambahan sejak G1 (22 Sep 2026): §6 kini TERWUJUD SEBAGIAN — routing tunggal
  src/routes/ aktif, App.jsx = shell + region legacy (LegacyMenuOutlet, masih
  di App.jsx); kalimat §6 "App.jsx ke depannya hanya me-render shell dan
  outlet" belum sepenuhnya tercapai (halaman keluar per G2–G6); §6 konvensi
  URL kebab-case punya pengecualian sementara /planned/<id> camelCase (32 id);
  ~~komentar kode src/routes/index.jsx:8 "135 rute kanonik" basi (167)~~
  [→ TERTUTUP di G2: komentar headernya ditulis ulang, nol hit "135 rute" di src/].
  Tambahan sejak G2 (22 Sep 2026): §6 "satu file kecil per modul" mulai terwujud —
  file modul PERTAMA ada (src/routes/logistics-warehouse.routes.jsx); nama file
  mengikuti keputusan #11 (.routes.jsx, bukan .routes.js seperti tertulis §6).
  ⚠️ Komentar kode App.jsx:1447 menyebut komponen "RequireMenu" yang TIDAK ADA di
  src/ (sisa istilah rancangan G1) — koreksi komentar = ranah Den.

G2 — modul PERTAMA keluar dari LegacyMenuOutlet: Logistics & Warehouse
     (chain Storbit + Inventory), 22 Sep 2026, branch feat/fs-fase2-5-g2-logistics:
  SELESAI di branch (dibuat dari main 1e2e97d, sesudah G1 LIVE). PRODUKSI BELUM
  BERUBAH — G2 belum naik. Nol migrasi/SQL; nol DB; snapshot tidak terdampak;
  NOL file halaman DIPINDAH lokasi fisik (pemindahan FILE = Fase 3/7); nol prop
  komponen halaman berubah. Angka diukur ulang doc-keeper; detail per file +
  dua bug yang diperkenalkan sendiri lalu ditutup: PROGRESS.md 2026-09-22
  (entri G2, butir 8).
  Keputusan Den 22 Sep 2026 (G2 sebelumnya TIDAK punya spesifikasi tertulis —
  dokumen hanya menyebut "G2–G6 hanya atas instruksi Den"):
    #1 cakupan = chain Storbit + Inventory (13 cabang render / 9 id menu),
       BUKAN CRM (27 cabang), bukan 15 kelompok detail sekaligus — risiko
       terkecil, alur paling sering dipakai gudang, handoff teruji di G1;
       G3–G6 menyusul per modul
    #2 bentuk = WRAPPER TIPIS per rute (useParams()+useAppShell() → render
       komponen halaman apa adanya): nol prop berubah, file halaman tidak
       disentuh (pengecualian sadar: #5)
    #3 state pembawa DICABUT; tombol kembali → path daftar induk (bukan
       navigate(-1): dari deep-link bisa melempar keluar aplikasi; bukan state
       sebagai cermin: menghidupkan lagi dua sumber kebenaran yang baru dihapus
       G1 untuk activeMenu)
    #4 AdminHub / TD-129 TIDAK ikut G2 → giliran modul Admin/Foundation
       (perbaikannya di dalam AdminHub.jsx, paling murah sekali jalan bersama
       products/:id + user-access/:userId). MENGOREKSI catatan G1 yang menulis
       "batas AdminHub masuk scope G2"
    #5 penyatuan jalur Input SP (kontrak G0 #9) = "satu gate + tombol
       disembunyikan"; biayanya disetujui eksplisit = satu file halaman
       disentuh (SalesOrderPage.jsx, pembungkus render + komentar)
  [x] src/routes/logistics-warehouse.routes.jsx (BARU, 340) — 12 rute + 12
      wrapper; path dari kontrak G0 (MENU_PATHS + DETAIL_ROUTE_TEMPLATES → kini
      DIPAKAI kode, bukan disalin). 9 id menu: manifest · input · picking ·
      surat-jalan · storbit-dashboard · shipment · inventory-dashboard ·
      inventory-stok · inventory-penerimaan. +3 RUTE DETAIL BARU:
      …/sales-order/:customerId/:spNo · …/picking-packing/:id ·
      …/delivery-note/:id (handle.menuId = id daftar INDUK → activeMenu,
      sidebar, gate konten tetap benar). 11 lazy() halaman + handleGeneratePicking
      + handleCreateDelivery pindah dari App.jsx (nol pemakai lain); helper
      Boundary = ErrorBoundary+Suspense dengan fallback persis sama
  [x] src/routes/ModuleShell.jsx (BARU, 36) — pembungkus WAJIB tiap rute modul:
      bingkai .nexus-main-surface + gate konten (salinan persis penjaga lama,
      termasuk sifat "selama izin belum settle halaman tetap dirender" = catatan
      TD-271, bukan keputusan G2)
  [x] src/routes/RecordNotFound.jsx (BARU, 33) — keadaan "record tidak ada" untuk
      rute detail; dipakai wrapper Detail SP saja (Picking & SJ sudah punya)
  [x] src/routes/route-table.jsx (BARU, 18) — SATU daftar childRoutes (modul +
      legacy), dibaca index.jsx DAN IndexRedirect.jsx; G3–G6 cukup +1 baris
  [x] src/App.jsx +60/−299 (5.718 → 5.479 baris — PERTAMA KALI TURUN, sudah di
      bawah angka pra-G1 5.613): 13 cabang render dicabut · 4 state pembawa
      dicabut (selectedSpId/selectedPickingId/selectedDeliveryId/showInputSP) ·
      2 handler + 11 lazy() pindah · AccessDeniedPage & ShipmentPage di-export
      (ShipmentPage = halaman inline yang FILE-nya tetap di App.jsx) ·
      updateShipmentRow dibentuk di App supaya can() tak perlu di-export dan prop
      ShipmentPage tidak berubah · loading: spLoading dari useSpItems diambil ·
      shell 113 → 105 kunci, destructure LegacyMenuOutlet 113 → 94 (AST)
  [x] legacy.routes.jsx MOVED_MENU_IDS (9 id) → 12 rute modul + 158 legacy = 170,
      nol path ganda; index.jsx & IndexRedirect.jsx membaca childRoutes.
      Konsekuensi sampingan: catatan G1 "komentar index.jsx:8 '135 rute' basi"
      kini TERTUTUP (nol hit "135 rute" di src/)
  [x] src/modules/logistics/SalesOrderPage.jsx +18/−11 — SATU-SATUNYA file
      HALAMAN yang disentuh (keputusan #5): tombol "Input SP" dibungkus
      {onAddSP && ( … )} → HILANG, bukan sekadar mati; prop onAddSP tidak
      berubah, nol perubahan lain. Sebelumnya tombol itu TANPA GATE SAMA SEKALI
      padahal menu `input` ber-gate canInputSP dan InputSPPage tak punya guard
      sendiri = jalan pintas. Efek: role yang melihat daftar SP tanpa hak tulis
      (mis. ceo/gm/finance) tak lagi melihat tombolnya — PENGETATAN DISENGAJA;
      blast radius 5 akun uji = nol (hanya warehouse yang bisa membuka manifest,
      dan ia lolos canInputSP)
  [x] scripts/qa/detail-routes.mjs (BARU, 170, masuk repo) — uji checklist README
      butir 2 (refresh di detail → konteks bertahan) & 4 (deep-link id tak sah →
      keadaan wajar, bukan layar putih) + klik baris mengubah alamat, tombol
      kembali → daftar, Back/Forward; opsi --suite <modul>, dipakai lagi G3–G6;
      menolak jalan ke ref produksi, QA_PASSWORD dari env
  DUA BUG YANG DIPERKENALKAN SENDIRI DI G2, ketemu & ditutup sebelum selesai —
  pelajarannya berlaku untuk G3–G6:
    (a) bingkai .nexus-main-surface HILANG untuk halaman yang dipindah — div itu
        ikut terbawa ke DALAM LegacyMenuOutlet waktu G1 (App.jsx:3268), jadi yang
        keluar kehilangan padding DAN dua aturan CSS yang menempel pada kelasnya
        (.rounded-3xl box-shadow + table{min-width}, :2812-2817). Ketahuan dari
        uji ronde 1 (2/6 lolos) lewat penanda panjang=0 di SEMUA kasus termasuk
        yang tampak "lolos"; "daftar kosong" yang dilaporkan skrip = ARTEFAK
        selector, bukan data staging kosong. -> memindahkan blok render keluar
        dari LegacyMenuOutlet berarti ikut kehilangan pembungkus yang hidup DI
        DALAMNYA: periksa pembungkusnya, bukan hanya isinya
    (b) restore "kembali ke menu terakhir" akan RUSAK untuk seluruh path modul —
        IndexRedirect (G1) memvalidasi nexus_last_path dengan
        matchRoutes(legacyMenuRoutes, …); begitu modul keluar dari legacy, 12
        path modul dianggap asing → /home. Ditemukan dari MEMBACA KODE sebelum
        harness jalan. -> tiap pemindahan modul menggeser makna "daftar rute yang
        dikenal"; pembacanya bukan cuma router
  TEMUAN KETIGA (milik G2, bukan bug sesi): deep-link Detail SP dengan id palsu =
  LAYAR KOSONG — SalesOrderDetailPage tak punya keadaan "tidak ditemukan" (beda
  dari PickingListDetailPage/DeliveryNoteDetailPage). Ditangani di wrapper lewat
  RecordNotFound, dengan spLoading ikut diuji supaya SP yang SAH tidak dituduh
  hilang selama fetch pertama.
  Gate (diukur ulang doc-keeper SESUDAH perubahan SalesOrderPage.jsx): build
  clean 3.013 modul (G1 3.009; +4 file rute baru) · 128 chunk JS (= G1) ·
  lint-baseline 137/21 ✔ = baseline persis · eslint 4 file rute + detail-routes
  + SalesOrderPage = 0/0 (file peta rute memakai eslint-disable
  react-refresh/only-export-components, preseden DealPanels.jsx:2) ·
  check-menu-paths ✔ 176 id / 167 rute — TIDAK berubah (kontrak id tak disentuh),
  tapi komposisinya bergeser: "id blok render" 48 → 39 = persis 9 id yang pindah.
  Uji rute detail 18/18 LOLOS (laporan sesi; detail-routes.mjs, build G2 via vite
  preview, staging, akun zzztest.warehouse) = 3 flow × 5 butir + 3 deep-link
  palsu; struktur 3×5+3 diverifikasi doc-keeper dari isi skripnya.
  CHECKLIST MANUAL butir 5 (role terbatas) — DIJALANKAN 23 Sep 2026, LOLOS 4/4
  (laporan sesi; build G2 via vite preview, staging). Diuji dengan cara lain dari
  yang diandaikan: bukan mencari akun ceo/gm/finance (tak ada di antara 5 akun
  uji staging), melainkan GRANT MENU SEMENTARA ke akun viewer yang sudah ada —
  zzztest.restricted diberi DUA grant view (logistics_sp + logistics_input,
  company MSI), uji dijalankan, KEDUA GRANT DICABUT lagi; keadaan sebelum/sesudah
  diverifikasi lewat query DB (user_menu_permissions: 0 → 2 → 0; pembanding
  zzztest.warehouse tetap 74) sehingga data staging kembali ke keadaan semula dan
  baseline sweep tetap sahih. Dua grant sekaligus supaya sebabnya tunggal: dengan
  izin menu input ikut diberikan, satu-satunya sebab tombol bisa hilang adalah
  ROLE (viewer tak ada di SP_ITEM_WRITER_ROLES). Hasil: (A) daftar SP terbuka
  (heading "Sales Order / SP") · (B) tombol "Input SP" TIDAK ADA = pengetatan
  keputusan #5 terbukti RUNTIME, bukan lagi deduksi kode · (C) path /new diketik
  langsung → Akses Ditolak = gate rute ikut menjaga (dua lapis) · (D) pembanding
  warehouse tetap melihat tombolnya. Alatnya (scripts/qa/out/butir5.mjs) SENGAJA
  di luar repo (folder gitignored) — resep manualnya di scripts/qa/README.md
  §Checklist; masuk-repo atau tidak = keputusan Den. Ronde pertama sempat
  melaporkan "3/4 lolos" yang MENYESATKAN (asersi A terlalu longgar meloloskan
  pentalan ke Command Center; akarnya grant tercentang tapi belum tersimpan) —
  kelas yang sama dengan "identik palsu" menu-sweep.mjs: asersi lolos karena
  prasyaratnya tak pernah terpenuhi. Sisa checklist G2 yang BELUM dijalankan:
  butir 1 (masuk dari tiap titik) · 3 (Back/Forward 3× berturut) · 6 (login dari
  path dalam — terbukti utk path G1 22 Sep, belum diulang utk path modul G2).
  Detail: PROGRESS.md 2026-09-22 (entri G2, butir 12a/12b).
  SWEEP — SELESAI, KETIGA MODE IDENTIK dengan baseline G1. 5 akun × 194 tujuan
  × 3 mode = 2.910 pembanding, NOL gagal-muat, NOL loginShown. Dihitung ulang
  doc-keeper dari JSON scripts/qa/out/ dan --diff dijalankan ulang sendiri:
    menu    (label g2d-menu,   startedAt 16:07:35Z) vs baseline/menu-sweep
            -> ✔ identik (5/5 akun); 970 · gagal-muat 0 · denied 0 · coming-soon 1
    restore (label g2b-restore, 14:37:28Z) vs baseline/menu-sweep-restore
            -> ✔ identik; 970 · gagal-muat 0 · denied 15 · coming-soon 57
    path    (label g2b-path,    15:28:40Z) vs baseline/menu-sweep-path
            -> ✔ identik; 970 · gagal-muat 0 · denied 15 · coming-soon 57
  Ketiganya project staging oovmlhilhqzejnawqkvt, meta.targets 194.
  Ekspektasi yang ditulis SEBELUM hasilnya ada TERBUKTI: memindahkan 9 id ke rute
  modulnya sendiri tidak menggeser satu pun fingerprint halaman. Dua hal yang
  layak digarisbawahi: (1) path = perbandingan PERTAMA terhadap
  baseline/menu-sweep-path sejak folder itu lahir 22 Sep 2026, dan ia identik ->
  12 rute modul + 3 rute detail nol menggeser fingerprint tujuan MENU (rute /:id
  diuji terpisah); (2) restore identik sekaligus BUKTI bahwa perbaikan
  IndexRedirect/route-table.jsx (bug (b) di atas) bekerja — tanpa itu 9 path
  modul + 3 rute detail dianggap asing dan jatuh ke /home.
  Catatan status sebelumnya ("mode menu BELUM SAH, ulangi sendirian") SUDAH
  TERLAMPAUI — menu diulang bersih sebagai g2d-menu; jangan dihidupkan lagi.
  CATATAN PROSES — dua run dibuang sebelum hasil yang sah (proses, bukan temuan
  produk):
    - Run mode menu yang pertama TERCEMAR, dan penyebabnya doc-keeper sendiri:
      `npm run build` yang dijalankan agen dokumentasi di latar untuk mengukur
      ulang gate MENIMPA dist/ yang sedang dilayani vite preview; nama chunk
      ber-hash berubah -> 55 dari 970 tujuan gagal muat + 1 tujuan
      (vendorPortal-invoice, akun hcga) bergejala sama = 56 "perbedaan" yang
      seluruhnya artefak. Gejala: lastMenu/lastPath null, surfaceHash = hash
      string kosong, consoleErrors melonjak, lalu cascade "page.goto: …
      interrupted by another navigation"; satu akun menggantung >30 menit (node
      0 % CPU) karena page.evaluate di ekor loop tak ber-timeout. Yang sah dari
      run itu: 914 dari 970 pembanding nol perbedaan.
      KOREKSI DIAGNOSIS: catatan pertama menduga penyebabnya KONTENSI (menu +
      restore paralel, 10 konteks browser ke satu server). Itu bukan akarnya —
      restore yang jalan berbarengan justru BERSIH, dan 404 atas chunk tertentu
      adalah tanda khas dist/ ditimpa, bukan tanda beban. PELAJARAN YANG BENAR
      untuk G3–G6: jangan menjalankan build — termasuk lewat agen/alat lain —
      selama vite preview melayani dist/. Saran "mode dijalankan berurutan"
      tetap berguna sebagai kehati-hatian, tapi BUKAN obat kelas kegagalan ini.
    - Run berikutnya gagal login kelima akun (invalid_credentials), DAN skrip
      tetap mencetak "✔ identik dengan baseline" padahal NOL data terkumpul —
      kesimpulan persis terbalik dari kenyataan. Itulah pemicu pengerasan alat.
  ALAT DIPERKERAS (scripts/qa/menu-sweep.mjs +22/−3, dibaca doc-keeper — bukan
  kode aplikasi): (a) compare() mengembalikan -1 bila nol akun menghasilkan data
  -> "✖ pembandingan DIBATALKAN — nol data" + exit 1 (nol data = TIDAK ADA
  pembanding, bukan nol perbedaan); (b) jalur sweep selalu menyebut cakupan
  ("✔ identik dengan baseline (5/5 akun)" / "✖ … (HANYA 3/5 akun)") dan exit
  code gagal juga saat nol perbedaan tapi akun tak lengkap; (c) jalur --diff
  ikut diselaraskan. Nuansa: baris cakupan hanya dicetak jalur sweep
  (--compare); jalur --diff dua folder tetap mencetak "✔ identik" polos.
  Cacat harness sesi (bukan file repo, tidak diperbaiki): output sweep lewat
  `| tail -18` menyembunyikan progres ±15 menit — untuk G3–G6 pakai tee penuh.
  Register: +TD-273 (MEDIUM, lihat blok di bawah), nol Keputusan Terbuka baru.
  TD-12 (App.jsx pertama kali BERKURANG; LegacyMenuOutlet 48 → 39 id) · TD-129 (3 detail Storbit kini punya
  alamat + refresh-safe; 18 → 14 state cabang render; sisanya G3–G6; AdminHub
  tetap di luar per #4) · TD-272 TETAP OPEN (gate tidak diubah) · TD-08 tetap
  (Boundary = ErrorBoundary lama, bukan Sentry) · TD-181 (b) nomor baris bergeser
  (App.jsx:3414/:3427/:3440).
  +TD-273 (MEDIUM, BARU — satu-satunya TD dari G2; dinomori atas keputusan Den
  22 Sep 2026, sebelumnya catatan kandidat di ekor TD-272): GATE KONTEN +
  bingkai .nexus-main-surface punya DUA salinan selama G2-G6 — App.jsx:3272
  (39 id yang masih di LegacyMenuOutlet) dan src/routes/ModuleShell.jsx:30
  (12 rute / 9 id menu modul yang sudah keluar, termasuk 3 rute detail :id).
  Duplikasi transisional yang DISENGAJA; salinan App.jsx mati sendiri di G6.
  Gagalnya SENYAP (nol error build/lint/runtime; jumlah rute & id tak bergeser).
  MENGIKAT: kalau TD-272 dikerjakan SEBELUM G6, kedua salinan wajib diubah dalam
  SATU perubahan yang sama — menambal satu sisi menutup celah untuk separuh
  aplikasi dan membiarkannya terbuka untuk separuh lain. Berlaku juga untuk
  perubahan lain pada penjaga ini (perilaku "selama izin belum settle halaman
  tetap dirender" = efek samping TD-271; tujuan onGoHome).
  G3-G6: JANGAN bikin salinan KETIGA — pakai ModuleShell yang sudah ada.
  Kandidat/tindak lanjut (belum bernomor): cabut dual-write nexus_last_menu +
  overlay location.state 3 id sintetis saat detail modul lain dapat /:id — masih
  relevan, karena product-detail justru DIPAKAI wrapper StorbitDashboardRoute
  untuk drill-down produk (pola lama sengaja dipertahankan: Products belum
  pindah) · komentar kode App.jsx:1447 menyebut
  "RequireMenu" yang TIDAK ADA di src/ (sisa istilah rancangan G1; ranah Den,
  bukan doc-keeper).

G1: SELESAI — di-merge & LIVE di produksi 22 Sep 2026 (merge commit 0efec44).
  G2: SELESAI di branch (chain Storbit + Inventory keluar dari LegacyMenuOutlet;
      produksi belum berubah). G3–G6: BELUM mulai; hanya atas instruksi Den.
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
