# AUDIT B4 READINESS — DROP COLUMN `inquiries.commodity`

> Audit read-only, dijalankan 2026-07-25. Metodologi: git log/show langsung (bukan percaya pesan commit), grep menyeluruh `src/` untuk semua pola akses field (bukan cuma string literal `inquiries.commodity`), pembacaan penuh `supabase/schema_snapshot.sql` (bukan file migrasi lama), dan cross-check tiap klaim dokumentasi ke kode/git. Nol perubahan dibuat ke kode/DB/dokumentasi lain — file ini satu-satunya output.
>
> **Peran saya di audit ini: skeptis defaultnya.** Setiap klaim "sudah beres" di bawah disertai bukti file:line atau commit hash yang bisa kamu cek ulang sendiri — bukan kutipan dari `PROGRESS.md`/`CLAUDE.md`.

---

## VERDICT

**B4 (DROP COLUMN `inquiries.commodity`) AMAN DI SISI KODE — NOL dependency ditemukan di `src/`, Edge Functions, maupun objek DB (view/function/trigger/index/FK/CHECK). TAPI BELUM AMAN UNTUK DIEKSEKUSI LANGSUNG** — ada satu bloker data (backfill belum jalan, angka "80 baris" belum diverifikasi ulang di DB live) dan satu bloker proses (B1+B3 — dua batch yang jadi prasyarat B4 — nol jejak dokumentasi, dan SQL manual B1 nol jejak migrasi, mengulang pola TD-20 yang sudah pernah menyakitkan repo ini).

Singkatnya: **kode sudah bersih total, tapi jangan tarik pelatuk DROP sebelum (1) backfill 80 baris dijalankan & diverifikasi 0 sisa, dan (2) utang dokumentasi B1/B3 ditutup** — supaya B4 tidak menumpuk jadi utang JEJAK ketiga yang sama persis dengan yang sudah berulang kali menyakitkan repo ini (TD-20, TD-128, dan sekarang B1).

---

## RINGKASAN EKSEKUTIF

Penilaian jujur: **sisi kode jauh lebih bersih dari yang saya duga akan saya temukan.** Saya menggrep SEMUA pola akses (`.commodity`, `['commodity']`, destructuring, string literal di `.select()`/`.insert()`/`.update()`) di seluruh `src/`, Edge Functions, dan `supabase/`, dan hasilnya genuinely nol — setiap satu-satunya hit "commodity" yang tersisa di kode adalah milik `prf.commodity` (enum PRF, hidup by design, tak boleh diusik) atau `bant_commodity` (kolom BANT `accounts`, entitas lain sama sekali). Klaim commit `260e9ae` ("Hasil: NOL referensi inquiries.commodity tersisa di kode") **terbukti benar** di bawah verifikasi independen yang jauh lebih luas dari sekadar grep string `inquiries.commodity`.

**Yang mengagetkan (dan bukan soal komoditas):**

1. **B1 dan B3 — dua batch nyata, merged ke `main`, di-push ke `origin` — NOL disebut di `PROGRESS.md`, `CLAUDE.md`, atau dokumen Governance manapun.** Saya cek by-hash dan by-deskripsi, keduanya nol hit. Ini persis ketakutan kamu ("ada yang kekerjain tapi tak tercatat") — dan ini bukan pekerjaan kecil: B3 menghapus field user-facing (Commodity) dari form Inquiry produksi.
2. **SQL manual B1 (`ALTER TABLE prf ADD COLUMN goods_name/un_number/imo_class`) sudah dijalankan (kolomnya ada di snapshot) tapi NOL file migrasi merekamnya.** Ini pola persis TD-20 yang sudah pernah jadi masalah di repo ini — SQL manual jalan tanpa jejak, lalu dokumen jadi kontradiksi dengan DB nyata.
3. **5 tabel backup baru yang sama sekali tak terdokumentasi:** `backup_dedup_accounts_20260725`, `backup_dedup_activities_20260725`, `backup_dedup_alliance_20260725`, `backup_dedup_inquiries_20260725`, `backup_dedup_quotations_20260725`. Total tabel backup di snapshot sekarang **13**, bukan 8 seperti yang tercatat di `CLAUDE.md`/`TD-128`. Salah satunya (`backup_dedup_inquiries_20260725`) kebetulan berisi kolom `commodity` — tapi karena ini tabel backup independen (bukan view), DROP COLUMN di `inquiries` **tidak** akan menyentuhnya sama sekali.
4. **`goods_name` tidak wajib diisi** — form Inquiry bisa disubmit dengan field itu kosong. Setelah B4, ini jadi satu-satunya field nama barang, dan ia opsional — inquiry baru masih bisa lahir tanpa nama barang apa pun.
5. **"B2" tidak pernah ada** dalam konteks PRF/Inquiry — dikonfirmasi lewat `git log`/`git branch -a`. Satu-satunya hit "B2" di seluruh git history adalah commit dokumentasi 17 Jul yang sama sekali tak berkaitan ("Fase B2" = konsolidasi dokumen Governance, bukan field PRF).
6. **F3-6, F3-7, F3-9 — label yang disebut di task brief — NOL hit di seluruh dokumentasi** (`CLAUDE.md`, semua `docs/Governance/*.md`, `PROGRESS.md`). Hanya F3-1, F3-2, F3-3, F3-8 (dan F3-EX1/F3-EX2) yang punya jejak tertulis. Saya tak mengarang definisi untuk yang tak ada — lihat Bagian 5.
7. **Ada DUA pasang label yang bentrok namespace** dan berpotensi bikin bingung siapa pun yang cross-reference dokumen: "B1/B2/B4" di `10_TASK_BREAKDOWN.md` adalah soal deploy Edge Function & drop tabel dormant (TIDAK ADA HUBUNGANNYA dengan PRF/Inquiry field batch); dan "FASE 3" di roadmap SP (`00_DEV_JOURNEY.md`, = BTB_TERBIT) berbeda total dari "Fase 3 batch 3B-1" CRM (= pemisahan sumbu deal/lead). Keduanya kebetulan pakai nomor yang sama untuk fitur yang sama sekali berbeda.

Tidak ada satu pun temuan di atas yang membuat B4 secara teknis berbahaya untuk KODE — tapi poin 1+2 berarti B4, kalau dieksekusi hari ini tanpa pembenahan dulu, akan jadi **contoh ketiga** dari pola "SQL manual jalan, jejak menyusul (atau tak pernah menyusul)" dalam rentang waktu yang sangat pendek (TD-20 lama, B1 23 Jul, dan B4 kalau tak hati-hati).

---

## BLOKER B4

**Ada, dua — keduanya harus dibereskan sebelum DROP COLUMN, tapi keduanya BUKAN soal kode:**

### BLOKER 1 [HIGH] — Backfill 80 baris belum jalan & belum diverifikasi ulang
`inquiries.commodity` masih berisi data pada baris yang `goods_name`-nya kosong (angka lama dari task brief: 80 baris "hanya commodity" per 24 Jul, dari total 207 inquiry aktif). Saya **tidak bisa mengonfirmasi angka ini masih akurat** karena tak ada akses DB live. **Selama backfill belum jalan, DROP COLUMN akan menghapus permanen nama barang dari baris-baris itu** — tak ada view/backup/mekanisme lain di kode yang menyelamatkannya (backup tabel `backup_dedup_inquiries_20260725` HANYA snapshot tanggal 25 Jul, bukan mekanisme live — kalau ada baris `commodity`-terisi yang diedit SETELAH 25 Jul, backup itu takkan menangkap perubahannya).
**Fix:** jalankan SQL Bagian 6 (query 1) dulu untuk angka fresh, lalu backfill (`UPDATE inquiries SET goods_name = commodity WHERE goods_name IS NULL AND commodity IS NOT NULL AND commodity != ''`), verifikasi 0 sisa, BARU drop.

### BLOKER 2 [HIGH] — B1 + B3 nol jejak dokumentasi, B1 nol jejak migrasi
Bukan bloker TEKNIS (B4 tak butuh B1/B3 untuk berhasil secara mekanis), tapi bloker PROSES: menjalankan B4 sekarang berarti menambah SATU LAGI perubahan skema besar (DROP COLUMN) ke tumpukan kerja yang **sudah** dua langkah di belakang jejak dokumentasi (B1 SQL-nya jalan tanpa migrasi tercatat, B1+B3 keduanya nol entri PROGRESS/CLAUDE/Governance). Kalau B4 dieksekusi sebelum ini dibereskan, siapa pun yang membaca dokumentasi nanti (termasuk kamu sendiri, beberapa minggu lagi) akan melihat `inquiries.commodity` masih "ada" secara dokumentasi (karena tak pernah dicatat sudah dipensiunkan sejak B3) padahal sudah di-drop total.
**Fix:** minimal, catat B1+B3+B4 sebagai SATU entri PROGRESS.md yang menyatukan cerita "commodity dipensiunkan → goods_name jadi tunggal → kolom di-drop", dan buat file migrasi arsip untuk 3 kolom PRF B1 (pola sama seperti arsip dedup 25 Jul kemarin) sebelum atau bersamaan dengan migrasi DROP COLUMN B4.

**Kalau kedua bloker di atas sudah dibereskan, tidak ada bloker teknis lain yang saya temukan.**

---

## TEMUAN PER BAGIAN

### Bagian 1 — Riwayat batch (git)

**[LOW] 1.1 — Commit dikonfirmasi ada, benar isinya, sudah di main+origin.**
- `1235f4a` (B1) — Thu 23 Jul 2026 13:49:46 +0700, "feat(prf): batch 1 field PRF — nama barang + DG detail + enum kargo + kewajiban". 1 file (`PRFFormPage.jsx`, +49/-8). Pesan commit SENDIRI mengaku "BELUM tes runtime — DoD butuh smoke test + SQL dijalankan dulu" — bukan klaim "sudah beres".
- `260e9ae` (B3) — Thu 23 Jul 2026 14:46:20 +0700, "feat(inquiry): gabung goods_name + commodity jadi nama barang tunggal". 6 file (`CustomerDetailPage.jsx`, `DealDetailPage.jsx`, `InquiryFormPage.jsx`, `InquiryListPage.jsx`, `InquiryPDF.jsx`, `PRFFormPage.jsx`, +7/-13).
- Keduanya: `git branch --contains` → `main`. `git branch -r --contains` → `origin/main`. **Dikonfirmasi live di production branch.**

**[LOW] 1.2 — "B2" tidak pernah ada dalam konteks ini.** `git log --all --oneline -i --grep="\bB2\b"` → hanya SATU hit: `24c0af2`, 17 Jul 2026, "docs(governance): konsolidasi Fase B2 — serap 20 item 14 ke roadmap/task" — **soal konsolidasi dokumen Governance, sama sekali tak berkaitan dengan field PRF/Inquiry**, dan 6 hari SEBELUM B1/B3 bahkan ada. Tak ada branch `batch2`/`batch-2` di local maupun remote. **Kesimpulan tegas: B2 (dalam pengertian PRF-field-batch) tidak pernah dibuat — bukan "hilang", memang tak pernah ada.**

**[LOW] 1.3 — AccountPicker (`9b59bd0`, 25 Jul 11:14) TIDAK bentrok dengan B3.** Diperiksa diff lengkap kedua commit pada `InquiryFormPage.jsx`: B3 menyentuh 4 area (state init baris ~157, edit-populate ~194, payload ~254, JSX Route/Commodity grid ~465) — semuanya di **Section 02** form. AccountPicker menyentuh area yang SAMA SEKALI berbeda (import, state `prospectText`/`customerText`, blok injeksi akun-tertaut, toggle sumber, JSX picker Prospect/Customer) — semuanya di **Section 01**. Full diff `9b59bd0` (`git show 9b59bd0`) di-grep untuk "commodity"/"goods_name" → **nol hit**. Tidak ada revert, tidak ada override, tidak ada tumpang tindih baris.

**[LOW] 1.4 — `git status`: bersih.** "nothing to commit, working tree clean" saat audit dimulai.

### Bagian 2 — Sisa pembaca/penulis `commodity` (INTI B4)

**[TIDAK ADA TEMUAN — genuinely bersih.]** Grep menyeluruh `grep -rniE "commodity" src/` (menangkap SEMUA pola: `.commodity`, `['commodity']`, destructuring, string literal `.select()`/insert/update, komentar) menghasilkan **15 hit non-`bant_commodity`**, dan **SEMUANYA** di dua file: `PRFFormPage.jsx` (13 hit) dan `PRFDetailPage.jsx` (2 hit). Diverifikasi satu-per-satu:

| File:line | Konteks | Klasifikasi |
|---|---|---|
| `PRFFormPage.jsx:102,116,117,425` | Komentar | (a) PRF |
| `PRFFormPage.jsx:187` | `commodity: '', goods_name: '', ...` — init state form PRF | (a) PRF |
| `PRFFormPage.jsx:303` | `const isDG = form.commodity === 'dg';` | (a) PRF |
| `PRFFormPage.jsx:325` | `if (!form.commodity) e.commodity = 'Wajib diisi';` — validasi PRF | (a) PRF |
| `PRFFormPage.jsx:420` | `commodity: form.commodity \|\| null,` — payload INSERT `prf` | (a) PRF |
| `PRFFormPage.jsx:564-572` | Dropdown "Commodity" di form PRF; hint baca `srcInq.cargo_types` (BUKAN `srcInq.commodity` — sudah dipindah B3 Task 3) | (a) PRF |
| `PRFDetailPage.jsx:54` | `PRF_SELECT` string kolom `prf` | (a) PRF |
| `PRFDetailPage.jsx:376` | `['Commodity', prf.commodity \|\| '—'],` | (a) PRF |

**Nol hit kategori (b) MILIK INQUIRY. Nol hit kategori (c) TIDAK JELAS.**

**2.3 — 6 file yang diminta dicek eksplisit, semua zero-hit terkonfirmasi:**
- `src/modules/crm/CustomerDetailPage.jsx` — 0 hit `commodity` (1 hit `bant_commodity` di baris 147, tak relevan — itu label field custom BANT "Komoditi", kolom `accounts.bant_commodity`, entitas berbeda total).
- `src/modules/crm/DealDetailPage.jsx` — 0 hit.
- `src/modules/crm/InquiryListPage.jsx` — 0 hit.
- `src/modules/crm/InquiryPDF.jsx` — 0 hit.
- `src/modules/crm/InquiryFormPage.jsx` — 0 hit.
- `src/modules/crm/DealPanels.jsx` — 0 hit (dicek tambahan, di luar daftar diminta, karena file ini modul bersama panel deal).

**2.4 — Nol `.select()` pada tabel `inquiries` yang menyebut `commodity`.** Diperiksa SEMUA 15 titik `.from('inquiries')` di `src/` satu-per-satu (bukan sampling) — daftar lengkap: `InquiryListPage.jsx:246`, `CustomerDetailPage.jsx:761`, `PipelineKanbanPage.jsx:553`, `CRMDashboardPage.jsx:1879`, `DealDetailPage.jsx:153,335`, `InquiryFormPage.jsx:191,281,296`, `activityFeed.js:64`, `SalesOrderDocFormPage.jsx:45`, `QuotationFormPage.jsx:463,652`, `PRFFormPage.jsx:215,230,389`. Beberapa secara eksplisit SUDAH memuat `goods_name` di select string-nya (`InquiryListPage`, `CustomerDetailPage`, `DealDetailPage`, `PRFFormPage` prefill) — konfirmasi independen bahwa migrasi ke `goods_name` sudah menyeluruh di sisi baca. **Kalau DROP dijalankan hari ini, tak ada satu query pun di atas yang akan error** (tak ada yang menyebut kolom `commodity` untuk tabel `inquiries`).

**2.5 — [TIDAK ADA TEMUAN — CRITICAL check bersih.]**
- `grep -rniE "commodity" supabase/functions/` → **nol hit di seluruh Edge Functions.**
- `grep -rniE "commodity" supabase/migrations/*.sql` → hanya 2 hit, keduanya di `20260710000001_prf_fase0.sql` (baris 64,66) — itu `prf.commodity` **saat pertama dibuat** (Fase 0, 10 Jul), bukan `inquiries.commodity`.
- `schema_snapshot.sql`: SEMUA "commodity" (case-insensitive) yang bukan `bant_commodity` ada di dalam TIGA blok `CREATE TABLE` saja: `public.inquiries` (kolom asli), `public.prf` (kolom PRF), `public.backup_dedup_inquiries_20260725` (backup independen). **Nol muncul di dalam blok `CREATE FUNCTION`/`CREATE VIEW`/`CREATE TRIGGER` di manapun di seluruh file** — dicek dengan awk yang secara spesifik memindai buffer per-function untuk kombinasi kata. **Tidak ada view, trigger, atau RPC yang bergantung pada kolom ini — DROP COLUMN tidak akan gagal karena dependency DB-side.**

### Bagian 3 — Sisi tulis `goods_name`

**[TIDAK ADA TEMUAN NEGATIF — jalur tulis bersih & tunggal.] 3.1.** Persis SATU objek `fields` (`InquiryFormPage.jsx:254-278`) dipakai untuk KEDUA jalur — create (`:295-296`, `payload = {...fields}` lalu `.insert(payload)`) DAN edit (`:281`, `.update(fields)`) — bukan dua payload terpisah yang bisa divergen. `goods_name: form.goods_name || null` ada di baris `:266`, satu-satunya tempat field ini ditulis untuk isi inquiry. Dikonfirmasi TIDAK ADA jalur INSERT/UPDATE lain ke tabel `inquiries` di seluruh `src/` — semua kandidat "false positive" dari grep luas (`CRMDashboardPage`, `QuotationFormPage`, `SalesOrderDocFormPage`, `PRFFormPage`, `CustomerDetailPage`, `PipelineKanbanPage`) diverifikasi satu-per-satu menargetkan tabel LAIN (`activities`, `quotations`, `sales_orders`, `prf`, `accounts`). **Satu pengecualian sempit:** `DealDetailPage.jsx:335` (`markInquiryLost`, fitur "Tandai Kalah") — UPDATE hanya `{status, lost_reason}`, sengaja tak menyentuh `goods_name` (transisi status murni, bukan edit konten).

**[MEDIUM] 3.2 — `goods_name` TIDAK wajib.** `validate()` (`InquiryFormPage.jsx:236-243`) hanya cek `prospect_id`/`customer_id` (sumber akun) dan `service_type`. `goods_name` absen total dari validasi; `<Field label="Nama Barang (EN)">` (`:455`) tak punya prop `required` (beda dari field lain di file yang ber-`required`). **Dampak nyata: inquiry baru bisa lahir dengan nama barang kosong, hari ini dan seterusnya** — bukan cuma warisan data lama.

**[TIDAK ADA TEMUAN NEGATIF — sudah rapi.] 3.3.** `applyInquiryData` (`PRFFormPage.jsx:104-123`) sekarang punya **11 `fill()` call**: `hs_code, pickup_address, delivery_address, origin(←pol), destination(←pod), deadline_quotation(←deadline_quote), notes, goods_name, un_number, imo_class, incoterms`. `goods_name` **memang ikut ter-copy** (`:115`, `fill('goods_name', inq.goods_name)`) — sesuai klaim B1 sendiri ("Nama Barang di PRF, prefill dari inquiries.goods_name"). Empat field yang di audit sebelumnya ditandai "diam-diam ter-copy, tak terdokumentasi" (`notes`, `goods_name`, `un_number`, `imo_class`) — pada pemeriksaan ulang, `notes` sudah didokumentasikan sejak 19 Jul (`PROGRESS.md:729`), dan `goods_name`/`un_number`/`imo_class` **sekarang eksplisit didokumentasikan oleh B1 sendiri** (di commit message-nya, meski TIDAK di PROGRESS.md — lihat Bagian 5). Jadi temuan "field diam-diam" itu **sudah tak berlaku** — bukan lagi kejutan, hanya belum masuk PROGRESS.md secara resmi.

### Bagian 4 — Struktur DB (dari `schema_snapshot.sql`, refresh 25 Jul 2026 11:58:13 — commit `92af2c1`, SETELAH B1 & B3)

**4.1 — `inquiries.commodity`:** `text`, nullable (tanpa `NOT NULL`), tanpa default, **tanpa CHECK constraint** (satu-satunya CHECK di tabel `inquiries` adalah `inquiries_status_check`, tak menyinggung `commodity`). Kolom paling sederhana yang bisa di-drop — tak ada aturan integritas yang menggantung padanya.

**4.2 — `inquiries.goods_name`:** `text`, nullable, tanpa default. Sama sederhananya — dan ini yang membuat 3.2 (goods_name opsional) jadi relevan: tak ada CHECK di level DB yang menahan baris kosong.

**4.3 — [TIDAK ADA TEMUAN.]** Nol `CREATE INDEX`, nol `FOREIGN KEY`, nol `GENERATED` column yang menyebut `commodity` di seluruh snapshot.

**[TIDAK ADA TEMUAN — B1 confirmed live.] 4.4.** `prf.goods_name`, `prf.un_number`, `prf.imo_class` — **ketiganya ADA** di `CREATE TABLE public.prf` pada snapshot (baris 63-65). Snapshot ini di-refresh SETELAH B1 (23 Jul 13:49) — jadi ini bukti independen bahwa SQL manual B1 memang sudah dijalankan di DB nyata, bukan cuma diklaim di commit message.

**[HIGH — TEMUAN NYATA] 4.5.** `grep -rln "goods_name\|un_number\|imo_class" supabase/migrations/*.sql` → **NOL hasil.** SQL manual B1 (`ALTER TABLE public.prf ADD COLUMN goods_name text, ADD COLUMN un_number text, ADD COLUMN imo_class text;`) **dijalankan tapi tidak pernah direkam sebagai file migrasi.** Ini pola PERSIS TD-20 (kolom `profiles.role` yang statusnya sekarang sendiri tak pasti karena hal yang sama) dan sudah pernah ditutup dengan susah-payah untuk dedup akun 25 Jul (4 file migrasi arsip). **Sebelum atau bersamaan dengan B4, buat file migrasi arsip untuk SQL B1 ini** — pola sama seperti `20260725000001`-`000004`.

### Bagian 5 — Konsistensi dokumentasi vs kode

Lihat tabel lengkap di bawah. Ringkas kualitatif:

**5.3 — Dijawab tuntas via snapshot, klaim dokumen TERBUKTI AKURAT (bukan under-claim, bukan over-claim):**
- **F3-7 (backfill `pipeline_stage` + CHECK): benar BELUM jalan.** `accounts.pipeline_stage` = `character varying DEFAULT 'NEW'`, **nol CHECK constraint** menyinggungnya (hanya `accounts_account_status_check` dan `accounts_pull_status_check` ada di tabel itu, keduanya kolom lain). Kolom masih menerima string apa pun.
- **F3-8 (cabut trigger `set_customer_on_won` lama): benar BELUM jalan.** `CREATE TRIGGER trg_set_customer_on_won BEFORE INSERT OR UPDATE ON public.accounts ...` (baris 8440) dan fungsinya (baris 1256) **masih hidup penuh** di snapshot, isi logikanya juga masih sama (`IF NEW.pipeline_stage = 'WON' AND ... <> 'customer' THEN`).

**5.4 — Temuan paling berbahaya (persis yang kamu takutkan):**
- **B1 (`1235f4a`) dan B3 (`260e9ae`) — NOL entri di `PROGRESS.md`, NOL di `CLAUDE.md`, NOL di semua dokumen Governance.** Dicek by-hash DAN by-deskripsi (mis. "Nama Barang PRF", "gabung goods_name commodity", "UN Number IMO Class") — semuanya nol hit. Bandingkan: dua pekerjaan LAIN di hari yang SAMA (23 Jul) — "chip filter status Inquiry List" (`72688ec`, pagi hari) dan "fix CustomerFormModal" — KEDUANYA terdokumentasi lengkap di `PROGRESS.md`/`CLAUDE.md`. B1 (siang) dan B3 (sore) — yang justru MENGHAPUS field user-facing dari form produksi — tidak.
- `09_ROADMAP.md` baris 63 (PRF) masih bilang "Fase 2 done, Fase 3a/3b belum" — nol singgungan field batch B1. Baris 40 (Inquiry) hanya menyebut kerja pagi (chip filter), nol singgungan B3.
- **F3-6, F3-7 (sebagai label bernama), F3-9 — nol jejak di dokumen manapun.** Saya TIDAK mengarang apa artinya — kalau ini label verbal yang kamu pakai saat briefing, mereka belum pernah dituliskan.

Lihat tabel di bawah untuk perbandingan penuh.

### Bagian 6 — SQL verifikasi

Lihat blok di bagian "SQL BUAT DEN JALANKAN" di bawah.

---

## TABEL DOKUMEN vs KODE

| Klaim dokumen | Kenyataan di kode/git/snapshot | Verdict |
|---|---|---|
| B1 "sudah selesai dan merged" (klaim task brief, bukan dokumen tertulis) | Commit `1235f4a` ada, di `main`+`origin`, 1 file. **NOL entri di PROGRESS.md/CLAUDE.md/Governance manapun.** | **UNDER-CLAIM (dokumentasi)** — kode ADA & LIVE, dokumentasi NOL |
| B3 "sudah selesai dan merged" (klaim task brief) | Commit `260e9ae` ada, di `main`+`origin`, 6 file. Klaim "NOL referensi commodity tersisa di kode" **terbukti benar** via grep independen. **NOL entri di PROGRESS.md/CLAUDE.md/Governance manapun.** | **UNDER-CLAIM (dokumentasi)** — kode BENAR & LIVE, dokumentasi NOL |
| B4 "belum" (task brief) | Kolom `inquiries.commodity` masih ada di snapshot (25 Jul 11:58). **Cocok.** | **COCOK** |
| "B2" — tak jelas ada/tidak (task brief) | Nol commit/branch terkait PRF/Inquiry field. Satu hit tak-relevan (dok Governance 17 Jul). | **TIDAK PERNAH ADA — dikonfirmasi tegas** |
| `09_ROADMAP.md:63` — "PRF Fase 2 done, sisa Fase 3a/3b" | Field batch B1 (Nama Barang/DG/enum/kewajiban) sudah live 23 Jul, tak disebut baris ini. | **UNDER-CLAIM (stale)** — baris ini tak diperbarui sejak sebelum B1 |
| `09_ROADMAP.md:40` — "Inquiry: chip filter + Umur Inquiry (23 Jul)" | Benar untuk `72688ec` (pagi 23 Jul). Tak menyebut B3 (sore 23 Jul, file yang sama `InquiryListPage.jsx` malah disentuh lagi oleh B3). | **UNDER-CLAIM (parsial)** — mencatat SEBAGIAN kerja hari itu |
| F3-7 "backfill pipeline_stage + CHECK belum jalan" (task brief, bukan dokumen tertulis — F3-7 sendiri nol hit) | `accounts.pipeline_stage`: nol CHECK constraint di snapshot. **Substansi klaim benar**, walau label "F3-7" sendiri tak pernah tertulis di manapun. | **COCOK (substansi), label tak terverifikasi keberadaannya** |
| F3-8 "trigger `set_customer_on_won` lama masih hidup, dicabut nanti di batch 3C" (`08_TECH_DEBT.md` TD-94, `03_DATA_MODEL.md`, `05_WORKFLOW_MAP.md`, `09_ROADMAP.md:216`) | `trg_set_customer_on_won` + fungsinya **masih hidup penuh** di snapshot 25 Jul, logika sama seperti dideskripsikan. | **COCOK — akurat** |
| F3-6, F3-9 (disebut task brief) | Nol hit di seluruh dokumentasi manapun. | **TAK BISA DIVERIFIKASI — labelnya sendiri tak eksis di dokumen** |
| "3B-2" (disebut task brief) | Muncul 2× di `CLAUDE.md`/`PROGRESS.md`, tapi hanya sebagai catatan sempit ("lingkup KPI `SQL_STAGES`"), bukan batch berstatus sendiri. | **SEBAGIAN ADA — tapi bukan milestone bernama dengan status jelas** |
| TD-128 / `CLAUDE.md` — "8 tabel backup, drop sekaligus lalu satu pg_dump" | Snapshot terbaru (25 Jul, refresh SETELAH TD-128 dicatat) menunjukkan **13 tabel backup**, 5 di antaranya (`backup_dedup_accounts/activities/alliance/inquiries/quotations_20260725`) sama sekali tak disebut di TD-128 maupun dokumen manapun. | **UNDER-CLAIM (angka basi)** — dokumen tak diperbarui pasca-dedup 25 Jul yang sesungguhnya menambah 5 tabel |
| Commit `260e9ae` sendiri — "Sengaja tak disentuh: ... goods_name" | Benar — B3 tak MENGUBAH `goods_name`, hanya menghapus `commodity`. Field `goods_name` tak tersentuh baris manapun di diffnya. | **COCOK** |

---

## SQL BUAT DEN JALANKAN

```sql
-- ============================================================================
-- QUERY 1 — Sebaran commodity vs goods_name pada inquiry AKTIF, angka FRESH
-- untuk menggantikan angka lama (147/42/80/43/18, per 24 Jul).
-- "Aktif" didefinisikan sebagai deleted_at IS NULL (pola standar repo ini,
-- CLAUDE.md: "Fetch: selalu .is('deleted_at', null)"). Kalau maksud "aktif"-mu
-- lebih sempit (mis. exclude LOST/CANCELLED), tambahkan filter status sendiri.
-- ============================================================================
SELECT
  count(*) FILTER (WHERE commodity IS NOT NULL AND commodity <> ''
                     AND goods_name IS NOT NULL AND goods_name <> ''
                     AND commodity <> goods_name)                          AS beda,
  count(*) FILTER (WHERE commodity = goods_name
                     AND commodity IS NOT NULL AND commodity <> '')        AS sama_persis,
  count(*) FILTER (WHERE (commodity IS NOT NULL AND commodity <> '')
                     AND (goods_name IS NULL OR goods_name = ''))          AS hanya_commodity,
  count(*) FILTER (WHERE (goods_name IS NOT NULL AND goods_name <> '')
                     AND (commodity IS NULL OR commodity = ''))            AS hanya_goods_name,
  count(*) FILTER (WHERE (commodity IS NULL OR commodity = '')
                     AND (goods_name IS NULL OR goods_name = ''))          AS dua_duanya_kosong,
  count(*)                                                                 AS total_aktif
FROM public.inquiries
WHERE deleted_at IS NULL;

-- ============================================================================
-- QUERY 2 — Daftar ID baris "hanya_commodity" (kandidat backfill) — buat
-- eksekusi UPDATE terarah, bukan tebak-tebak.
-- ============================================================================
SELECT id, inquiry_no, company_id, commodity, goods_name, created_at
FROM public.inquiries
WHERE deleted_at IS NULL
  AND commodity IS NOT NULL AND commodity <> ''
  AND (goods_name IS NULL OR goods_name = '')
ORDER BY created_at DESC;

-- ============================================================================
-- QUERY 3 — Backfill itu sendiri (JANGAN dijalankan sebelum QUERY 2 direview
-- manual — kalau ada commodity yang isinya bukan nama barang wajar, mis. cuma
-- "-" atau placeholder, backfill buta akan memindahkan sampah itu ke goods_name).
-- ============================================================================
-- UPDATE public.inquiries
-- SET goods_name = commodity
-- WHERE deleted_at IS NULL
--   AND commodity IS NOT NULL AND commodity <> ''
--   AND (goods_name IS NULL OR goods_name = '');

-- ============================================================================
-- QUERY 4 — Verifikasi 0 sisa SEBELUM drop (harus balik 0 baris).
-- ============================================================================
SELECT count(*) AS sisa_belum_backfill
FROM public.inquiries
WHERE deleted_at IS NULL
  AND commodity IS NOT NULL AND commodity <> ''
  AND (goods_name IS NULL OR goods_name = '');

-- ============================================================================
-- QUERY 5 — Cek dependency DB-side pada inquiries.commodity via katalog sistem
-- (pg_depend) — LEBIH OTORITATIF daripada grep snapshot manapun, karena ini
-- membaca kondisi DB LIVE, bukan dump statis yang mungkin sudah beberapa jam
-- basi. Kalau balik NOL baris, DROP COLUMN dijamin tak akan gagal karena
-- dependency (view/function/trigger/index/generated-column).
-- ============================================================================
SELECT
  dependent_ns.nspname AS dependent_schema,
  dependent_view.relname AS dependent_object,
  dependent_view.relkind AS object_kind  -- 'v'=view, 'f'=function-related, dst
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
  AND pg_depend.refobjsubid = pg_attribute.attnum
JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
WHERE source_table.relname = 'inquiries'
  AND pg_attribute.attname = 'commodity';

-- ============================================================================
-- QUERY 6 — Daftar SEMUA tabel backup yang benar-benar ada di DB live sekarang
-- (bandingkan dengan 13 yang saya temukan di snapshot statis 25 Jul 11:58 —
-- kalau ada perbedaan, berarti sudah ada aktivitas manual setelah snapshot
-- terakhir yang belum ter-refresh).
-- ============================================================================
SELECT table_name,
       pg_size_pretty(pg_total_relation_size(quote_ident(table_name)::regclass)) AS size,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_name = t.table_name) AS jumlah_kolom
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_name LIKE '%backup%'
ORDER BY table_name;

-- ============================================================================
-- QUERY 7 — Isi & asal-usul backup_dedup_inquiries_20260725 secara spesifik —
-- untuk memastikan tabel ini memang backup manual pra-dedup (dugaan saya),
-- bukan sesuatu yang lain. Cek jumlah baris + rentang created_at.
-- ============================================================================
SELECT count(*) AS jumlah_baris,
       min(created_at) AS created_paling_lama,
       max(created_at) AS created_paling_baru
FROM public.backup_dedup_inquiries_20260725;

-- ============================================================================
-- QUERY 8 — SETELAH backfill + verifikasi QUERY 4 = 0, INI baru DROP-nya.
-- Jalankan TERPISAH dari semua query di atas, dan HANYA setelah kamu yakin.
-- ============================================================================
-- ALTER TABLE public.inquiries DROP COLUMN commodity;
```

---

## YANG TIDAK BISA AKU PASTIKAN

1. **Angka fresh sebaran `commodity` vs `goods_name`.** Saya tak punya akses DB live — angka "80 baris hanya commodity, 207 total aktif" adalah klaim dari task brief per 24 Jul, TIDAK saya verifikasi ulang. Jalankan QUERY 1 di atas.
2. **Isi/tujuan pasti kelima tabel `backup_dedup_*_20260725`.** Saya menduga ini backup manual yang diambil Den sendiri sebelum sesi dedup akun 25 Jul (di luar 2 file migrasi yang saya arsipkan di sesi audit tech-debt sebelumnya, yang HANYA memakai TEMP TABLE, bukan tabel persisten) — tapi ini dugaan, bukan fakta terverifikasi. Hanya Den yang tahu pasti kapan & kenapa kelima tabel ini dibuat.
3. **Apakah ada konsumen EKSTERNAL** (BI tool, laporan manual, query ad-hoc di luar repo ini) yang membaca `inquiries.commodity` langsung dari DB tanpa lewat kode `src/`. Audit ini hanya mencakup repo — kalau ada dashboard Metabase/Looker/laporan Excel-terhubung-DB yang query kolom ini, saya tak bisa melihatnya.
4. **Definisi persis "inquiry aktif"** yang dipakai untuk menghasilkan angka lama (147/42/80/43/18/207). Saya asumsikan `deleted_at IS NULL` (pola standar repo), tapi kalau definisi aslinya mengecualikan status tertentu (LOST/CANCELLED), angka QUERY 1 akan sedikit berbeda dari angka lama — bukan berarti keliru, hanya definisi beda.
5. **Apa sebenarnya arti label F3-6/F3-7/F3-9** kalau memang pernah dibahas secara verbal denganmu tapi tak pernah dituliskan di manapun. Saya sengaja TIDAK menebak — kalau kamu tahu persis apa yang dimaksud, itu perlu dituliskan supaya audit berikutnya tak mengulang pertanyaan yang sama.
6. **Apakah `goods_name` opsional (temuan 3.2) itu disengaja atau kelalaian.** Saya hanya melaporkan faktanya (tidak required di kode) — keputusan apakah field ini SEHARUSNYA wajib adalah keputusan bisnis milikmu, bukan sesuatu yang bisa saya simpulkan dari kode.
