# PRE-FLIGHT — Pemisahan lifecycle `account_status` (FASE 2 backfill + trigger + CHECK)

> Auditor: pre-flight adversarial. Branch `feat/lifecycle-split` @ `08ec4b4` (Fase 1 sudah commit).
> Read-only. TIDAK ada file/DB/kode diubah selain dokumen ini. Angka DB TIDAK dikarang — query di bagian akhir.
> Tiap klaim ada `file:line` atau nama objek DB. Yang tak terverifikasi ditandai eksplisit.

---

## PUTUSAN — **JANGAN DIJALANKAN DULU**

Rencana Fase 2 **akan mengunci ratusan akun dalam keadaan mati** dan **gagal saat membuat CHECK constraint**, bukan karena eksekusi yang ceroboh tapi karena dua cacat struktural di premisnya. **(1) Deadlock gerbang NYATA dan TOTAL:** satu-satunya jalur membuat inquiry di seluruh aplikasi (`InquiryFormPage.jsx:283`) hanya bisa memilih akun ber-`account_status IN ('prospect','customer')` (`InquiryFormPage.jsx:166,168`, toggle `:339`). Setelah backfill menurunkan 114 akun ke `lead/mql/sql`, akun-akun itu **tak bisa dipilih di form inquiry** → inquiry tak bisa dibuat → **trigger gerbang `AFTER INSERT ON inquiries` tak pernah kepicu** → akun terkunci di bawah `prospect` selamanya, dan trigger gerbang praktis **dead-on-arrival** (satu-satunya akun yang bisa memicunya sudah `prospect`/`customer`). **(2) CHECK constraint akan menolak `free_agent`:** aplikasi masih menulis `account_status='free_agent'` (`CustomerListPage.jsx:356`), nilai yang TIDAK ada di kosakata baru (`lead/mql/sql/prospect/customer/lost`) → begitu CHECK dipasang, simpan Free Agent gagal, dan jika ada satu saja baris `free_agent`/`lead_pool` (termasuk **soft-deleted**, yang tak disentuh backfill) CHECK **gagal dibuat**. Rencana bisa aman **hanya jika** Fase 1.5 (memperbaiki read-selector + form inquiry + default kolom + cakupan `free_agent`/soft-deleted) dikerjakan **sebelum** backfill & CHECK. Rincian di bawah.

---

## TEMUAN PER BAGIAN

### 1. DEADLOCK GERBANG — CRITICAL, terkonfirmasi

**Jalur pembuatan inquiry di SELURUH `src/` = SATU.** `grep from('inquiries')` + `insert` → hanya `InquiryFormPage.jsx:283`. Semua referensi `from('inquiries')` lain (`PipelineKanbanPage`, `InquiryListPage`, `QuotationFormPage`, `activityFeed.js`, `CRMDashboardPage`, `DealDetailPage`, `SalesOrderDocFormPage`, `PRFFormPage`) adalah **read/update**, bukan insert. Tidak ada Edge Function yang meng-insert `inquiries` (`grep account_status/inquiries` di `supabase/functions/` = nol insert inquiry).

**Siapa yang bisa dipilih di form inquiry:**
- Dropdown "Prospect": `InquiryFormPage.jsx:166` → `.eq('account_status','prospect')`.
- Dropdown "Customer": `InquiryFormPage.jsx:168` → `.eq('account_status','customer')`.
- Source toggle: `InquiryFormPage.jsx:339` → hanya `['prospect','customer']`. Tidak ada opsi lead/mql/sql.
- Render create (App.jsx:3069) memanggil `InquiryFormPage` **tanpa prefilled akun** (hanya `onBack`/`showToast`) → dropdown adalah satu-satunya selektor.
- `DealDetailPage` (App.jsx:3079) menawarkan `onEditInquiry`/`onCreateQuotation`/`onCreatePRF` — **tidak ada create-inquiry berprefiil-akun**. Edit-mode InquiryForm menyuntik akun tertaut apa pun statusnya (`InquiryFormPage.jsx:210-216`) TAPI itu hanya untuk inquiry yang **sudah ada** (butuh gerbang sudah lewat).

**Kesimpulan:** akun ber-`account_status IN ('lead','mql','sql')` **TIDAK memiliki satu pun jalur UI** untuk mendapatkan inquiry. Karena promosi lead→prospect bergantung pada trigger `AFTER INSERT ON inquiries`, dan insert itu mustahil untuk akun lead/mql/sql, **tidak ada jalur tersisa** untuk menaikkan akun tersebut jadi prospect. **CRITICAL.** Trigger gerbang, sebagaimana dirancang, hanya bisa kepicu oleh akun yang sudah `prospect` (no-op) atau `customer` (harus tidak disentuh) → **trigger tak mempromosikan apa pun**.

Efek berantai: akun lead/mql/sql yang **tidak** `is_in_lead_pool` juga hilang dari Kanban (`:586`) dan Prospect List (`:119`) → **tak terlihat di layar mana pun** kecuali dibuka lewat SQL. Untuk yang `is_in_lead_pool=true`, satu-satunya tempatnya adalah Lead Pool; begitu ditarik (approval), `is_in_lead_pool=false` (`LeadPoolApprovalPage.jsx:122`, Fase 1 sudah **berhenti** menulis `account_status`) → akun jadi lead/mql/sql non-pool non-prospect → **invisible + terkunci**.

### 2. READ-SELECTOR `account_status` — daftar lengkap + dampak

| # | file:line | Filter | Yang HILANG dari layar pasca-backfill | Bisa diterima? | Sev |
|---|---|---|---|---|---|
| 1 | `InquiryFormPage.jsx:166` | `='prospect'` (dropdown create inquiry) | Akun lead/mql/sql tak bisa dipilih → **DEADLOCK gerbang** | TIDAK | **CRITICAL** |
| 2 | `PipelineKanbanPage.jsx:586` (+`:587` `is_in_lead_pool=false`) | `='prospect'` | 114 akun turun-status lenyap dari Kanban; sales tak bisa melihat/menggarap | TIDAK (workflow putus) | **HIGH** |
| 3 | `ProspectListPage.jsx:119` | `='prospect'` | 114 akun lenyap dari daftar prospect | TIDAK (workflow putus) | **HIGH** |
| 4 | `SalesCallsPage.jsx:428` | `='prospect'` (dropdown akun call) | Tak bisa mencatat call ke akun lead/mql/sql | Sebagian (bisa dianggap benar: belum prospect) | MEDIUM |
| 5 | `ActivitiesPage.jsx:584` | `.in(['prospect','customer'])` (picker aktivitas) | Tak bisa mencatat aktivitas ke lead/mql/sql → tak bisa "menyentuh" (aging pakai `last_activity_at`) | Sebagian | MEDIUM |
| 6 | `activityFeed.js:55` | `='prospect'` | Feed menyempit | Ya | LOW |
| 7 | `CRMDashboardPage.jsx:1870` | `='prospect'` | Metrik prospek dashboard mengecil | Ya (TD-91) | MEDIUM |
| 8 | `CRMDashboardPage.jsx:1892,1903` | `='prospect'` | idem | Ya | LOW |
| 9 | `CRMDashboardPage.jsx:2167` | `.in(['prospect','customer'])` (picker) | lead/mql/sql tak muncul di picker | Sebagian | LOW |
| 10 | `PRFFormPage.jsx:175` | `='prospect'` | lead/mql/sql tak bisa dijadikan sumber PRF | Sebagian | LOW-MED |
| 11 | `PRFFormPage.jsx:173` | `='customer'` | — (customer tak berubah) | Ya | — |
| 12 | `CRMReportPage.jsx:196` | `.in(PROSPECT_STATUS)` = `[lead,mql,sql,prospect,lead_pool]` | Sudah diperluas di Fase 1 → tak ada yang hilang; `lead_pool` jadi nilai mati pasca-backfill (harmless, `.is(deleted_at,null)`) | Ya | — |
| 13 | `CustomerListPage.jsx:297,562,568` · `db.js:220` · `CRMDashboardPage.jsx:1946` · `InquiryFormPage.jsx:168` | `='customer'`/`'free_agent'` | — (customer/free_agent tak diturunkan backfill) | Ya | — |

> Catatan `useCustomFields.js:33` menyebut `account_status` sebagai kolom sistem (bukan filter) — tak berdampak.

### 3. PENULIS `account_status` DI LUAR + DALAM `src/` — pemburu pembunuh CHECK

**Di luar `src/` (schema/trigger/EF/migration):**
- **`set_customer_on_won()`** (`schema_snapshot.sql:1080-1090`, trigger `trg_set_customer_on_won` BEFORE INSERT OR UPDATE) → menulis `NEW.account_status := 'customer'` saat `pipeline_stage='WON'`. Nilai `'customer'` **ada** di kosakata baru → tidak dibunuh CHECK. Interaksi trigger: lihat bagian 5.
- **`generate_customer_code()`** (`schema:441-462`, BEFORE trigger) → **membaca** `account_status='customer'` untuk generate `code`; tak menulis `account_status`. Aman.
- **Edge Function `aging-pipeline/index.ts`** — Fase 1 **sudah berhenti** menulis `account_status` (hanya komentar tersisa di `:110`). Aman.
- **Edge Function lain** (`create-user`, `delete-user`, `manage-schema`, `reset-password`) — `grep account_status` = nol. Aman.
- **Kolom default:** `accounts.account_status DEFAULT 'prospect'` (`schema:1467`). Bukan pembunuh CHECK (`prospect` valid), TAPI **melanggar aturan gerbang** — insert tanpa status eksplisit lahir langsung `prospect`. Harus diubah ke `'lead'` di Fase 2 (lihat bagian "Yang harus ditambahkan").
- **Migration `20260710000005_fix_lead_pool_desync.sql`** — resolusi TD-50 lama (sinkron dua kolom); kini di-supersede. Tidak menulis saat runtime; tak berpengaruh ke CHECK.

**Di dalam `src/` (writer literal, dari `grep account_status[:=]`):**
- `ProspectFormPage.jsx:230` → `'prospect'` (insert). Valid vocab. **Tapi "lubang gerbang" TD-91** — akun baru lahir `prospect` tanpa inquiry. Harus jadi `'lead'` (Fase 1.5, ADA URUTAN — lihat TD-91).
- `PipelineKanbanPage.jsx:726` → `'customer'` (finalizeWon); `:764` → `'lost'`. Valid vocab.
- **`CustomerListPage.jsx:356` → `'free_agent'`** ⚠️ **BUKAN di kosakata baru** (`lead/mql/sql/prospect/customer/lost`). **Pembunuh CHECK #1** — begitu CHECK dipasang, tiap simpan Free Agent GAGAL, dan baris `free_agent` existing (jika ada) membuat pembuatan CHECK gagal. Rencana Fase 2 sama sekali **tidak menyebut `free_agent`**.
- `CustomerListPage.jsx:351` / `db.js:258` → `'customer'`. Valid.

**Nilai `account_status` yang PERNAH ditulis sistem = {`prospect`,`customer`,`free_agent`,`lost`,`lead_pool`}.** Kosakata baru = {`lead`,`mql`,`sql`,`prospect`,`customer`,`lost`}. **Selisih = `free_agent` (masih aktif ditulis) + `lead_pool` (legacy, backfill hanya menyentuh `deleted_at IS NULL`)** → keduanya bisa membunuh CHECK. Nilai `lead`/`mql`/`sql` belum pernah ditulis kode mana pun (hanya dibuat oleh backfill + trigger yang belum ada).

### 4. RLS

Satu policy menyentuh `account_status`: **`prospects_read`** (`schema:11574`) —
`... OR (has_role('operations') AND account_status = 'customer')`. Operations hanya baca akun `customer`; backfill tak mengubah `customer` → **tak ada yang kehilangan/mendapat akses**. Aman.

**Tapi RLS berdampak ke trigger gerbang (baru):** `prospects_update` (`schema:11581`, pola `company AND (is_manager_or_above() OR assigned_to=uid OR created_by=uid) OR is_super_admin()`) mengatur UPDATE `accounts`. Jika trigger `AFTER INSERT ON inquiries` meng-`UPDATE accounts SET account_status='prospect'` **tanpa SECURITY DEFINER**, promosi akan **diblokir RLS** bila user peng-insert inquiry bukan pemilik/assignee/manager akun tsb → gerbang gagal senyap. Trigger gerbang **wajib SECURITY DEFINER** + guard status. (Tak bisa dipastikan dari kode karena trigger belum ada — dicatat sebagai syarat desain.)

### 5. BENTROK TRIGGER

- **`set_customer_on_won()`** (BEFORE INSERT/UPDATE accounts, `schema:1080`) & **`track_stage_change()`** (BEFORE UPDATE accounts, `schema:1403`) keduanya pada **tabel `accounts`**; trigger gerbang baru pada **tabel `inquiries`** → tabel beda, tak ada bentrok langsung.
- **Rekursi:** trigger gerbang meng-UPDATE `accounts`; trigger `accounts` (`set_customer_on_won`/`track_stage_change`/`generate_customer_code`) **tidak** meng-insert `inquiries` → **tidak ada rekursi**. Aman.
- **Interaksi berbahaya #1 — downgrade customer:** `InquiryFormPage.jsx:241` menulis akun terpilih (prospect **atau** customer) ke kolom **`inquiries.prospect_id`**, dan `customer_id: null` (`:242`). Jadi `NEW.prospect_id` pada trigger bisa menunjuk **customer**. Trigger gerbang yang naif (`UPDATE accounts SET account_status='prospect' WHERE id=NEW.prospect_id`) akan **menurunkan customer → prospect**. Guard wajib: `AND account_status IN ('lead','mql','sql')`.
- **Interaksi #2 — WON simultan:** jika akun lead/mql/sql "kotor" ber-`pipeline_stage='WON'`, UPDATE gerbang memicu `set_customer_on_won` (BEFORE UPDATE) → status jadi `customer`, menimpa `prospect`. Edge case, low, tapi nyata bila data drift.

### 6. BARIS SOFT-DELETED — CHECK berlaku ke SEMUA baris

`accounts.deleted_at timestamptz` **ADA** (`schema` CREATE TABLE accounts, kolom `deleted_at`). CHECK constraint memvalidasi **seluruh tabel** termasuk `deleted_at IS NOT NULL`, sedangkan backfill (per rencana) hanya menyentuh `deleted_at IS NULL`. **Konsekuensi:** baris soft-deleted ber-`account_status='lead_pool'` atau `'free_agent'` (atau nilai lain di luar vocab) akan membuat **`ALTER TABLE ... ADD CONSTRAINT ... CHECK` GAGAL** (`ERROR: check constraint is violated by some row`). **Angka wajib diquery** (bagian QUERY #2) — jangan diasumsikan nol. **Pembunuh CHECK #2.**

### 7. KOLOM PENDAMPING — inkonsistensi pasca isi-ulang

Backfill menulis ulang `account_status` **tanpa** menyentuh kolom pendamping. Yang berpotensi tak konsisten:
- **`became_customer_at` / `converted_at` / `converted_to`** — hanya relevan untuk `customer`. Backfill tak menyentuh `customer` → aman, KECUALI ada akun `lead_pool`/`prospect` lama yang terlanjur punya `became_customer_at` terisi (drift historis). Query #5 untuk deteksi.
- **`lead_pool_reason` / `lead_pool_at`** — ditulis EF aging bersama (dulu) `account_status='lead_pool'`. Pasca-backfill, akun bisa punya `lead_pool_reason` terisi tapi `account_status` kini `lead/mql/sql/prospect` DAN `is_in_lead_pool` bisa `true`/`false`. Tidak fatal (marker parkir kini murni `is_in_lead_pool`), tapi `lead_pool_reason` jadi sisa historis yang menyesatkan bila dibaca. LOW.
- **`pull_status`/`pull_*`** — approval Lead Pool. Fase 1 memutus `account_status='prospect'` saat approve (`LeadPoolApprovalPage.jsx:122`). Akun dengan `pull_status='approved'` kini tetap di lifecycle aslinya (lead/mql/sql) → **inilah akun invisible** dari bagian 1. Konsistensi kolom OK, tapi **workflow-nya yang rusak** (bagian 1/8).
- **`is_in_lead_pool` vs `account_status`** — dulu (pra-Fase 1) di-set bareng; kini terpisah. Drift historis perlu diukur (Query #3).

### 8. LUBANG LAIN

- **Jendela transisi (deploy Fase 1 sudah live, backfill belum):** cron `aging-pipeline-harian` jalan **harian `0 18 * * *` UTC** (`20260710000009_...:27`). EF versi Fase 1 hanya menyalakan `is_in_lead_pool=true` (tak lagi menulis `account_status`) → parkir aman, tapi akun yang belum di-backfill masih `account_status='lead_pool'`/`'prospect'`. **Selama jendela ini**, data campur (869 masih `lead_pool`), UI Fase 1 sudah menampilkan badge "Lead Pool" dari `is_in_lead_pool` + fallback nilai mentah `lead_pool` → tidak crash (by design Fase 1). **Risiko nyata**: jika backfill dijalankan **sementara cron sedang jalan** (~18:00 UTC), ada race pada baris yang sama (aging meng-UPDATE `is_in_lead_pool` sambil backfill meng-UPDATE `account_status`) — dua UPDATE kolom beda, umumnya aman, tapi **jalankan backfill di luar jam 18:00 UTC** untuk hindari lock/kontensi.
- **Akun `customer` tanpa inquiry:** backfill "berdasarkan pipeline_stage + ada/tidaknya inquiry". Jika logika backfill tak meng-exclude `customer`/`lost`/`free_agent` secara eksplisit, akun customer tanpa inquiry bisa keliru diturunkan. **Rencana harus tegas: hanya sentuh baris yang saat ini `prospect` atau `lead_pool`; JANGAN sentuh `customer`/`lost`/`free_agent`.** (Query #4 mengukur customer-tanpa-inquiry.)
- **Inquiry soft-deleted:** trigger gerbang idealnya hanya menghitung inquiry `deleted_at IS NULL`. Backfill "ada/tidaknya inquiry" juga harus `deleted_at IS NULL`, kalau tidak akun dengan inquiry yang sudah dihapus akan keliru dinaikkan ke prospect. Query #4 pakai `deleted_at IS NULL`.
- **Rollback:** rencana menyebut "backup tabel". Pastikan backup = `CREATE TABLE accounts_backup_YYYYMMDD AS SELECT * FROM accounts;` **sebelum** apa pun, dan rollback = restore kolom `account_status` dari backup by `id`. CHECK harus di-`DROP` sebelum restore bila restore mengembalikan `free_agent`/`lead_pool`.
- **Mapping ambiguus (lead vs mql vs sql):** rencana bilang "114 turun ke lead/mql/sql" tapi **aturan pemetaan pipeline_stage→lifecycle tidak dispesifikasikan**. NEW→? CONTACTED→? QUALIFIED→? Ini keputusan bisnis; salah petakan = akun mendarat di bucket yang tak punya view. **Pertanyaan terbuka #1.**
- **Stage NURTURE (TD-61, 6 baris nyata):** tidak ada di `AGING_RULES` maupun Kanban STAGES. Bagaimana backfill memetakan `pipeline_stage='NURTURE'`? Tidak terjawab rencana. **Pertanyaan terbuka #2.**

---

## HAL YANG AKAN RUSAK KALAU RENCANA DIJALANKAN APA ADANYA (urut severity)

1. **[CRITICAL] Deadlock gerbang — 114 (dan berpotensi ratusan eks-`lead_pool`) akun terkunci selamanya.** Lokasi: `InquiryFormPage.jsx:166,168,339` + satu-satunya insert `:283`. Dampak: akun lead/mql/sql tak bisa dapat inquiry → tak bisa naik ke prospect → trigger gerbang mati kutu.
2. **[CRITICAL] Pembuatan CHECK constraint GAGAL** karena baris `free_agent` (`CustomerListPage.jsx:356`) dan/atau baris soft-deleted `lead_pool`/`free_agent` (bagian 6). `ALTER TABLE ... ADD CONSTRAINT CHECK` menolak seluruh operasi bila ada 1 baris pelanggar.
3. **[HIGH] Simpan Free Agent runtime GAGAL** setelah CHECK terpasang (`CustomerListPage.jsx:356` menulis nilai di luar vocab).
4. **[HIGH] 114 akun lenyap dari Kanban (`PipelineKanbanPage.jsx:586`) & Prospect List (`ProspectListPage.jsx:119`)** — hilang dari pandangan sales, tak ada jalan menggarap/mengangkatnya.
5. **[HIGH] Akun eks-Lead-Pool yang ditarik jadi invisible** — `LeadPoolApprovalPage.jsx:122` (tak lagi set prospect) + tak ada view untuk lead/mql/sql non-pool.
6. **[MEDIUM] Trigger gerbang menurunkan customer → prospect** bila tak di-guard status (`InquiryFormPage.jsx:241` menaruh customer di `prospect_id`).
7. **[MEDIUM] Trigger gerbang diblokir RLS** (`prospects_update`, `schema:11581`) bila bukan SECURITY DEFINER → promosi gagal senyap untuk inquiry lintas-pemilik.
8. **[MEDIUM] Akun customer/lost keliru diturunkan** bila backfill tak meng-exclude mereka eksplisit.
9. **[LOW-MED] SalesCalls/Activities/PRF/Dashboard picker** kehilangan akun lead/mql/sql (`:428`/`:584`/`:175`/`:2167`).
10. **[LOW] `DEFAULT 'prospect'` (`schema:1467`)** tetap melahirkan prospect tanpa inquiry pada insert tanpa status eksplisit.

---

## YANG HARUS DITAMBAHKAN KE RENCANA (FASE 1.5 — sebelum backfill & CHECK)

**A. Tutup deadlock gerbang (WAJIB, blocker CRITICAL).** Minimal salah satu:
- Perluas selektor form inquiry `InquiryFormPage.jsx:166` dari `.eq('account_status','prospect')` → `.in('account_status',['lead','mql','sql','prospect'])`, dan sesuaikan toggle/label (`:339`) agar akun pra-prospect bisa dipilih. Setelah inquiry dibuat, trigger menaikkannya ke prospect. **Tanpa ini trigger gerbang sia-sia.**
- Konsekuensinya akun lead/mql/sql harus **bisa ditemukan** untuk digarap → perluas juga read-selector view kerja (lihat B), atau sediakan entry "pilih dari semua akun pra-prospect".

**B. Perbaiki read-selector SEBELUM ProspectForm menulis `'lead'` (URUTAN dari TD-91 — jangan dibalik):**
`PipelineKanbanPage.jsx:586`, `ProspectListPage.jsx:119`, dropdown `InquiryFormPage.jsx:166`, `PRFFormPage.jsx:175`, `SalesCallsPage.jsx:428`, `ActivitiesPage.jsx:584`, `CRMDashboardPage.jsx:1870,1892,1903,2167` — putuskan mana yang harus `.in([...,'lead','mql','sql'])`. Kalau `ProspectFormPage.jsx:230` diubah menulis `'lead'` **sebelum** ini, tiap akun baru langsung invisible.

**C. Tangani `free_agent` di vocab CHECK (WAJIB, blocker CRITICAL):** entah (i) tambahkan `free_agent` ke daftar CHECK, atau (ii) migrasikan `free_agent` → nilai lain + ubah `CustomerListPage.jsx:356` berhenti menulisnya. **Rencana Fase 2 saat ini mengabaikannya sepenuhnya.**

**D. Bersihkan baris pelanggar SEBELUM CHECK:** backfill/normalisasi juga baris `deleted_at IS NOT NULL` (bukan hanya `IS NULL`) untuk `lead_pool`/`free_agent`, atau buat CHECK `NOT VALID` lalu `VALIDATE` bertahap. (Query #2 mengukur populasi.)

**E. Trigger gerbang harus:** `SECURITY DEFINER` + `SET search_path=public` + guard `WHERE id=NEW.prospect_id AND account_status IN ('lead','mql','sql')` (hindari downgrade customer & blok RLS) + hitung inquiry `deleted_at IS NULL`.

**F. Ubah `accounts.account_status DEFAULT 'prospect'` → `'lead'`** (`schema:1467`) agar insert tanpa status tak melanggar gerbang; selaraskan dengan perubahan `ProspectFormPage.jsx:230`.

**G. Backfill harus eksplisit meng-exclude** `account_status IN ('customer','lost','free_agent')` dan hanya menyentuh `prospect`/`lead_pool`; hitung "ada inquiry" dengan `deleted_at IS NULL`.

**H. Jalankan backfill di luar `18:00 UTC`** (jendela cron aging) untuk hindari kontensi.

---

## QUERY SELECT UNTUK DIJALANKAN MANUAL (read-only — angka TIDAK diisi auditor)

```sql
-- #1 Sebaran account_status × soft-deleted × is_in_lead_pool (peta lengkap; deteksi free_agent & nilai liar)
SELECT account_status, (deleted_at IS NOT NULL) AS soft_deleted, is_in_lead_pool, count(*)
FROM public.accounts GROUP BY 1,2,3 ORDER BY 4 DESC;

-- #2 PEMBUNUH CHECK: baris (termasuk soft-deleted) yang account_status-nya DI LUAR kosakata baru
--    Jika > 0 → ALTER ADD CHECK akan GAGAL. Harus 0 sebelum CHECK.
SELECT account_status, (deleted_at IS NOT NULL) AS soft_deleted, count(*)
FROM public.accounts
WHERE account_status IS NULL
   OR account_status NOT IN ('lead','mql','sql','prospect','customer','lost')
GROUP BY 1,2 ORDER BY 3 DESC;

-- #3 Drift is_in_lead_pool vs account_status (akun yang bakal invisible pasca-backfill)
SELECT account_status, is_in_lead_pool, pull_status, count(*)
FROM public.accounts WHERE deleted_at IS NULL GROUP BY 1,2,3 ORDER BY 4 DESC;

-- #4 UKURAN GERBANG: akun prospect/lead_pool punya/tak-punya inquiry (inquiry non-deleted)
SELECT a.account_status, a.pipeline_stage, (inq.n IS NOT NULL) AS punya_inquiry, count(*)
FROM public.accounts a
LEFT JOIN (
  SELECT prospect_id, count(*) n FROM public.inquiries
  WHERE deleted_at IS NULL AND prospect_id IS NOT NULL GROUP BY 1
) inq ON inq.prospect_id = a.id
WHERE a.deleted_at IS NULL AND a.account_status IN ('prospect','lead_pool')
GROUP BY 1,2,3 ORDER BY 4 DESC;

-- #5 Kolom pendamping tak konsisten: non-customer tapi punya became_customer_at/converted_*
SELECT account_status, count(*) FILTER (WHERE became_customer_at IS NOT NULL) AS ada_became,
       count(*) FILTER (WHERE converted_at IS NOT NULL) AS ada_converted,
       count(*) FILTER (WHERE converted_to IS NOT NULL) AS ada_converted_to
FROM public.accounts
WHERE deleted_at IS NULL AND account_status <> 'customer' GROUP BY 1 ORDER BY 1;

-- #6 Sebaran pipeline_stage untuk baris yang akan di-backfill (cek NURTURE & stage tak dikenal → mapping)
SELECT pipeline_stage, account_status, count(*)
FROM public.accounts
WHERE deleted_at IS NULL AND account_status IN ('prospect','lead_pool')
GROUP BY 1,2 ORDER BY 3 DESC;

-- #7 Inquiry yang prospect_id-nya menunjuk customer/lost (risiko downgrade oleh trigger gerbang)
SELECT a.account_status, count(*)
FROM public.inquiries i JOIN public.accounts a ON a.id = i.prospect_id
WHERE i.deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;
```

---

## PERTANYAAN TERBUKA

1. **Aturan pemetaan `pipeline_stage → lead/mql/sql`** untuk 114 prospect-tanpa-inquiry tidak dispesifikasi. NEW/CONTACTED/QUALIFIED/PROPOSAL/NEGOTIATION masing-masing ke mana? (Keputusan bisnis; menentukan bucket & view mana yang perlu diperluas.) Tak bisa dipastikan dari kode.
2. **`pipeline_stage='NURTURE'` (6 baris, TD-61)** di-backfill jadi apa? Tidak ada di Kanban STAGES maupun AGING_RULES.
3. **`free_agent`** — masuk kosakata CHECK, atau dimigrasikan? Jika tetap ada, apakah `free_agent` dianggap lifecycle atau sub-status customer? (`CustomerListPage` memperlakukannya sbagai segmen customer.)
4. **Apakah `customer`/`lost` benar-benar di-exclude** dari backfill? Rencana hanya menyebut "berdasarkan pipeline_stage + inquiry"; perlu ketegasan eksplisit.
5. **Trigger gerbang: SECURITY DEFINER?** dan guard status/`deleted_at`? Belum ada objek trigger untuk diperiksa — hanya bisa dinilai saat SQL Fase 2 dikeluarkan.
6. **Nilai `account_status='lead'`** sebagai default kolom baru — apakah `DEFAULT 'prospect'` (`schema:1467`) akan diubah? Jika tidak, insert non-eksplisit tetap melanggar gerbang.
7. **Angka aktual** (Query #1–#7) belum tersedia di sesi ini (tak ada kredensial DB) — semua klaim populasi di atas menunggu hasil query, TIDAK dikarang.
