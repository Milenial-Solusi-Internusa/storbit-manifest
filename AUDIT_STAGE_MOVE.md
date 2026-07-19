# AUDIT — Rencana pindah `pipeline_stage` dari `accounts` → `inquiries`

> Read-only. Sumber: `src/`, `supabase/schema_snapshot.sql`, `supabase/functions/`, docs Governance. Tanggal: 2026-07-19 (branch `feat/crm-edit-inquiry-gate-menuperm`).
> Verifikasi ke KODE & schema, bukan ke dokumentasi. Tiap klaim ada `file:line` / nama objek DB. Angka data yang butuh query DB ditandai eksplisit (tak ada kredensial DB di sesi ini). **NOL file diubah selain dokumen ini. NOL SQL ditulis/dijalankan.**

---

## RINGKASAN EKSEKUTIF

> **REVISI 2 (19 Jul 2026)** — masuk fakta baru dari **query DB Den** (§PT-1 A–E) + usulan desain **dua papan** dari Den. Ringkasan diperbarui; temuan lama yang masih berlaku dipertahankan; angka `±937` audit v1 **DIKOREKSI eksplisit** di bawah.
> **REVISI 3 (19 Jul 2026)** — koreksi angka **"19 akun tunawisma" → 13** (19 = jumlah `sql×QUALIFIED` yang JUSTRU tak tunawisma; salah-hitung revisi 2, ditandai eksplisit di §Usulan 4d#2); pertegas atribusi cacat 4d#1 (batas prospect NYATA/dijaga trigger vs gradasi lead→mql→sql = tautologi/artefak); +§PT-12 (kolom BANT). Pembelahan populasi **80+19+13+44=156** tetap.

**Diagnosisnya BENAR, dan usulan "dua papan" (dari Den) adalah reframe yang TEPAT — data mendukungnya kuat.** Deal-stage memang milik inquiry, dan rencana naif "satu papan Kanban berbasis inquiry" memang buruk (membuang corong lead). TAPI fakta baru mengubah lanskap: (i) blocker "lead lenyap" jauh lebih kecil & punya jalan keluar bersih; (ii) gerbang `set_prospect_on_inquiry` sudah membelah populasi dengan SEMPURNA jadi dua corong alami (pra-inquiry vs punya-inquiry — terbukti angka: 44 punya-inquiry = persis 44 `prospect`; 112 tanpa-inquiry = persis lead 42 + mql 38 + sql 32). **Verdict: arah dua-papan LAYAK dan lebih baik dari rencana asli; sisa masalah menyempit, tapi dua di antaranya tetap BLOCKER.**

**⚠️ KOREKSI angka audit v1:** audit v1 menyebut **"±937/±950 akun lead/mql/sql tanpa inquiry"** sebagai BLOCKER #1 yang "lenyap dari Kanban". **Itu MELESET dalam konteks** — ±937 adalah TOTAL lead/mql/sql seluruh DB (termasuk yang diparkir Lead Pool + nonaktif), **bukan** populasi papan aktif. **Angka papan aktif sebenarnya = 112** (query Den, §PT-1 A). Lebih penting: **80 dari 112 (42 lead=NEW + 38 mql=CONTACTED) punya `pipeline_stage` = cermin PERSIS `account_status`** (nol pengecualian, §PT-1 B) → untuk mereka `pipeline_stage` **nol informasi tambahan**; membuangnya tak kehilangan apa pun. Jadi framing "lenyap total" di v1 **terlalu alarmis** — dikoreksi.

**3 hal terberat (dinilai ulang dengan angka baru):**

1. **[TURUN: BLOCKER → TERTANGANI OLEH DESAIN, dengan syarat] "Lead lenyap".** 112 akun pra-inquiry tak bisa hidup di papan inquiry — TAPI usulan dua-papan memberi mereka rumah (papan lead berbasis `account_status`), dan 80/112 bahkan **tak butuh** `pipeline_stage`. Bukan lagi blocker **kalau** dua-papan diadopsi. **Syaratnya nyata:** mekanisme "naik tahap" papan lead (`lead→mql→sql`) **belum ada di kode** — drag Kanban sekarang menulis `pipeline_stage`, BUKAN `account_status`; kesatuan 1-ke-1 fakta B adalah **artefak backfill yang beku** (belum ada yang men-drag akun-akun itu sejak backfill 18 Jul). Papan lead butuh KODE BARU, bukan sekadar repoint (§Usulan 4a/4d).

2. **[TETAP BLOCKER] Multi-inquiry (30 akun / 90 inquiry).** Tak tersentuh usulan dua-papan (usulan itu soal lead-vs-deal, bukan soal membagi satu stage ke banyak inquiry). `inquiries.status` semua OPEN → nol sinyal. SUNWAY/TIGA REKSA tetap tak punya jawaban dari data. **Keputusan bisnis + kemungkinan input manual.** (Catatan: SUNWAY[LOST]/TIGA REKSA[WON] ada di LUAR papan aktif 156 — beban migrasi live hanya menyentuh multi-inquiry di antara 44 prospect; jumlahnya §PT-8 baru.)

3. **[TETAP HIGH/BLOCKER] `set_customer_on_won` + aging + kolom nilai deal + 13 akun tunawisma.** Split papan mengklarifikasi DI MANA stage hidup tapi TIDAK menghapus: ganti trigger WON→customer (kini inquiry-based, ambigu multi-inquiry §PT-2), rewrite EF aging, bawa `estimated_value`/`estimated_closing_date`/`stage_changed_at` ikut pindah. **Plus temuan baru:** **13** akun (PROPOSAL 3 + NEGOTIATION 4 + NURTURE 6) past-QUALIFIED **tanpa inquiry** menjadi TUNAWISMA di batas dua-papan (papan lead berhenti QUALIFIED, papan deal butuh inquiry) — §Usulan 4d.

**Rekomendasi tingkat tinggi (bukan keputusan):** adopsi arah dua-papan (lebih benar secara model + didukung data), tapi jangan anggap "gratis" — mekanisme papan lead + nasib 13 akun past-QUALIFIED-tanpa-inquiry + aturan multi-inquiry + ganti `set_customer_on_won` semuanya masih pekerjaan nyata. Tetap bertahap (kolom baru `inquiries` berdampingan, cutover per-halaman), bukan big-bang.

---

## INVENTARIS PEMBACA/PENULIS `accounts.pipeline_stage`

| Lokasi | Baca/Tulis | Apa | Severity |
|---|---|---|---|
| **DB trigger `set_customer_on_won`** (`schema:1080-1091`, `trg_set_customer_on_won` BEFORE INSERT/UPDATE accounts) | BACA | `IF NEW.pipeline_stage='WON' AND account_status<>'customer' → account_status='customer' + became/converted_at` | **BLOCKER** (putus total) |
| **DB trigger `track_stage_change`** (`schema:1422-1430`, `trg_z_track_stage_change` BEFORE UPDATE accounts) | BACA | `IF NEW.pipeline_stage IS DISTINCT FROM OLD → stage_changed_at=now()` | **HIGH** (harus pindah ke inquiries) |
| **DB index `idx_prospects_pipeline_stage`** (`schema:6884`, ON accounts) | — | index btree | LOW (pindah ke inquiries) |
| **DB default** `accounts.pipeline_stage DEFAULT 'NEW'` (`schema:1459`) | — | default kolom | LOW |
| **DB: TIDAK ada** CHECK constraint pada `pipeline_stage`, **TIDAK ada** RLS policy yang merujuknya, **TIDAK ada** view | — | grep schema: nol | (info) NURTURE bisa masuk (TD-61/104) |
| `PipelineKanbanPage.jsx:463` | BACA | fetch `.select(... pipeline_stage ...)` semua akun pra-customer | HIGH |
| `PipelineKanbanPage.jsx:508` (`applyStageMove`) | **TULIS** | `.update({pipeline_stage:newStage})` drag antar-stage | **HIGH** |
| `PipelineKanbanPage.jsx:605` (`finalizeWon`) | **TULIS** | `.update({pipeline_stage:'WON', ...})` | **HIGH** |
| `PipelineKanbanPage.jsx:644` (LOST) | **TULIS** | `.update({pipeline_stage:'LOST', account_status:'lost'})` | **HIGH** |
| `PipelineKanbanPage.jsx:496/503/523/534/594/610/618/651/655/686/718` | BACA (optimistic state) | mapping deal, prevStage, revert | MEDIUM |
| `DealPanels.jsx saveDealUpdate` (`:120`) | **TULIS** | `supabase.from('accounts').update(patch)` — SATU-SUMBER jalur tulis stage + audit `CHANGE_PIPELINE_STAGE` (entityId=**accountId**) | **BLOCKER** (jalur tulis + audit harus repoint ke inquiry) |
| `DealDetailPage.jsx:149/218/230/240/241/246` | BACA + **TULIS** (via `updateAccount`→`saveDealUpdate`) | stepper, Pindah Stage, Edit Deal | HIGH |
| `CustomerDetailPage.jsx:582/812-815/823/835/840/906/913/1266/1270/1379` | BACA + **TULIS** (via `saveDealUpdate`) | DealStepper, Nilai Deal, Pindah Stage, Edit Deal, Health Score, BANT tab | HIGH |
| `ProspectFormPage.jsx:83/126/202/206/226/347/348` | BACA + **TULIS** (insert/update akun) | "Tambah Prospect/Deal" set `pipeline_stage:'NEW'` saat **buat akun** (belum ada inquiry!) | **BLOCKER** (create-flow) |
| `CRMDashboardPage.jsx:1869/1902/1945/1948/1966/1981/1992/2045/2079` | BACA | Funnel/stage breakdown, Win Rate, Sales Performance, SQL-this-month, kartu Prospect Aktif (filter WON/LOST) | HIGH |
| `InquiryListPage.jsx:192/193/319` | BACA (embed) | `StageBadge` per baris inquiry = **stage AKUN** (semua inquiry akun sama → SUNWAY 11 baris "LOST") | MEDIUM (justru yang mau diperbaiki) |
| `ProspectListPage.jsx:112/133/272` | BACA (fetch + filter + badge) | filter `.eq('pipeline_stage', …)` + StageBadge | MEDIUM |
| `LeadPoolPage.jsx:49/119/228` | BACA + hitung `prevStageOf` | tampil stage + target tarik-keluar | MEDIUM |
| `LeadPoolApprovalPage.jsx:82/116/126` | BACA + **TULIS** | tarik dari pool → `.update({pipeline_stage: prevStageOf(...)})` | MEDIUM |
| `useCustomFields.js:24` | BACA (metadata) | `pipeline_stage` di `STANDARD_COLUMNS.accounts` (agar tak dianggap custom field) | LOW |
| **EF `aging-pipeline/index.ts:45/49/61/78`** | BACA | `.in('pipeline_stage', stages)` + `AGING_RULES[pipeline_stage]` + `stage_changed_at` → parkir Lead Pool | HIGH (rewrite; + konflik lead-tanpa-inquiry) |

**Penulis (mutasi) akun.pipeline_stage:** PipelineKanban (drag/WON/LOST), `saveDealUpdate` (Detail pages), ProspectForm (create), LeadPoolApproval (pull-back). **Nol trigger DB yang MENULIS** `pipeline_stage` (dua trigger hanya MEMBACA-nya). `inquiries` **tidak punya** kolom `pipeline_stage`, `estimated_value`, `estimated_closing_date`, `stage_changed_at`, `assigned_to`, `won/lost_reason` (schema `inquiries` — semua deal-column adalah kolom BARU yang harus ditambah).

---

## TRIGGER & ATURAN BISNIS DB

**`set_customer_on_won()`** (`schema:1080`, BEFORE INSERT OR UPDATE ON accounts):
```
IF NEW.pipeline_stage = 'WON' AND account_status <> 'customer'
   → account_status='customer', became_customer_at=now(), converted_at=now()
```
- **Dipicu oleh:** perubahan `accounts.pipeline_stage` menjadi `'WON'` (write dari FE: PipelineKanban finalizeWon, saveDealUpdate).
- **Kalau stage pindah ke inquiries → PUTUS TOTAL.** Tak ada `pipeline_stage` di accounts untuk dipicu. Ini adalah satu-satunya jembatan otomatis deal-stage → lifecycle (`account_status='customer'`).
- **Pengganti butuh KEPUTUSAN BISNIS:** trigger baru `AFTER UPDATE ON inquiries WHEN NEW.pipeline_stage='WON'` yang meng-`UPDATE accounts SET account_status='customer'`? **Tapi ambigu untuk multi-inquiry:** kalau 1 dari 10 inquiry TIGA REKSA jadi WON, apakah SELURUH akun jadi customer? Biasanya ya (satu deal menang = customer). Tapi lalu 9 inquiry lain (masih OPEN) tinggal di akun `customer` — persis pola drift **TD-94** (akun customer, deal non-WON), sekarang malah jadi normal. **Pertanyaan terbuka §PT-2.**

**`track_stage_change()`** (`schema:1422`, BEFORE UPDATE ON accounts): stamp `stage_changed_at=now()` saat stage berubah. → harus **pindah ke inquiries** (jadi `BEFORE UPDATE ON inquiries`), dan kolom `stage_changed_at` ikut pindah. Dipakai EF aging + badge aging Kanban (`PipelineKanbanPage.jsx` `agingBadge`).

**`set_prospect_on_inquiry()`** (`schema:1139`, AFTER INSERT ON inquiries): `UPDATE accounts SET account_status='prospect' WHERE id=COALESCE(prospect_id,customer_id) AND account_status IN (lead,mql,sql)`. **TIDAK menyentuh `pipeline_stage`** → tidak langsung pecah. TAPI relevansinya berubah: ini gerbang lifecycle (lead→prospect saat inquiry pertama). Kalau deal-stage pindah ke inquiry, inquiry baru idealnya lahir dengan `pipeline_stage='NEW'` — trigger ini bisa diperluas untuk itu, atau default kolom. **Interaksi perlu didesain.**

**Constraint/RLS lain:** nol RLS merujuk `pipeline_stage` (aman). Satu-satunya CHECK di `accounts` = `account_status` (7 nilai) + `pull_status` + `source` — tak ada untuk `pipeline_stage`. Tabel `accounts_lifecycle_backup_20260718` (`schema:1521`) memuat `pipeline_stage` tapi itu tabel backup (bukan logika hidup).

---

## DAMPAK PER HALAMAN

| Halaman / objek | Yang berubah | Effort |
|---|---|---|
| **PipelineKanbanPage** | Fetch dari `accounts` (pra-customer) → `inquiries` (join akun); **kartu = inquiry, bukan akun**; drag menulis `inquiries.pipeline_stage` (bukan accounts); `activeCount` = inquiry aktif; filter "Semua Anggota" pakai `assigned_to` — **inquiries tak punya `assigned_to`** (harus ditambah / diturunkan dari akun); tombol **"Tambah Deal"** sekarang membuat AKUN + stage (`ProspectFormPage`) — jadi tak masuk akal (deal tanpa inquiry). **⚠️ Lead/mql/sql tanpa inquiry HILANG dari board.** WON/LOST flow + handover (`WinLossModal`/`LightHandover`/`StrategicHandover`) menulis `accounts` (account_status) — perlu dipisah dari stage. | **Sangat Besar** |
| **CRMDashboardPage** | Funnel/stage breakdown (`:1992`), Win Rate (`:1981/2045`), Sales Performance (`:1902/2045`), SQL-this-month (`:2079`) semua baca `accounts.pipeline_stage` → rewrite ke `inquiries`. Kartu **Prospect Aktif** (`:1966`) hitung AKUN pra-customer (bukan stage) — tetap akun-based, TAPI filter `pipeline_stage NOT IN (WON,LOST)` pindah sumber. Sudah ada **TD-101** (scope) & **TD-102** (Win Rate denominator rusak) yang makin rumit bila sumbu pindah. | **Besar** |
| **DealDetailPage** | DealStepper/Nilai Deal/Pindah Stage/Edit Deal sudah **per-inquiry secara konsep** (halaman dibuka per `inquiryId`), tapi menulis `accounts` via `saveDealUpdate`. Repoint tulis → `inquiries` (id yang sedang dibuka) = **paling natural** di sini. Resolusi akun `inq.prospect_id`-only (abaikan `customer_id`) = pekerjaan sampingan. | Sedang |
| **CustomerDetailPage** (Detail Account) | DealStepper/Nilai Deal/Pindah Stage/Edit Deal di header **akun** — tapi akun kini tak punya satu stage. Header deal jadi **tak bermakna di level akun** (akun bisa punya banyak inquiry banyak stage). Harus dibuang dari header akun atau diganti agregat. Health Score (`:582`) & tab BANT baca `pipeline_stage` akun. **Konseptual besar** (kontrol deal di halaman akun kehilangan makna). | **Besar** |
| **DealPanels.jsx `saveDealUpdate`** | Jalur tulis tunggal + audit `CHANGE_PIPELINE_STAGE` entityType `DEAL` entityId=**accountId**. Repoint ke `inquiries` + entityId=inquiryId. Semua pemanggil (DealDetailPage, CustomerDetailPage) ikut. | Sedang |
| **ProspectFormPage** | "Tambah Prospect/Deal" membuat AKUN dengan `pipeline_stage:'NEW'` — **create-flow** deal-stage tanpa inquiry. Harus dipikir ulang (buat akun ≠ buat deal). | Sedang-Besar |
| **InquiryListPage** | `StageBadge` per baris kini pakai `accounts.pipeline_stage` (semua inquiry akun sama). Setelah pindah → per-inquiry benar (justru perbaikan). | Kecil |
| **ProspectListPage** | filter `.eq('pipeline_stage')` + badge → kalau daftar tetap akun-based, akun tak punya stage tunggal; filter jadi ambigu. | Sedang |
| **LeadPoolPage / LeadPoolApprovalPage** | `prevStageOf(pipeline_stage)` untuk tarik-keluar dari pool + display. Lead Pool adalah kondisi AKUN (`is_in_lead_pool`), tapi memakai stage. Bila stage pindah, "tarik ke stage sebelumnya" jadi tak jelas (akun mana stage?). | Sedang |
| **EF `aging-pipeline`** | Baca `accounts.pipeline_stage` + `stage_changed_at` → rewrite ke `inquiries`. **Konflik konsep:** aging saat ini menidurkan LEAD idle; lead tak punya inquiry → aging pra-inquiry hilang. Butuh definisi ulang "apa yang di-aging". | Sedang |
| **useCustomFields** | pindahkan `pipeline_stage` dari `STANDARD_COLUMNS.accounts` → `inquiries`. | Kecil |

---

## MASALAH MIGRASI DATA (bagian terpenting)

**Prasyarat skema (prosa, TANPA SQL):** tambah ke `inquiries` kolom deal — minimal `pipeline_stage` (default `'NEW'`), plus (lihat §Kolom) `estimated_value`, `estimated_closing_date`, `stage_changed_at`, kemungkinan `assigned_to`, `won_reason`, `lost_reason`. Pindahkan index + trigger `track_stage_change` + ganti `set_customer_on_won`.

**⚠️ Populasi terbelah oleh fakta baru (query DB Den 19 Jul 2026 — TERVERIFIKASI, bukan verifikasi auditor):** dalam populasi papan aktif (156 akun), migrasi TIDAK seragam. Empat kelompok, effort sangat berbeda:

| Kelompok | Jumlah | `pipeline_stage` vs `account_status` | Migrasi |
|---|---|---|---|
| **lead×NEW + mql×CONTACTED** | **80** | cermin PERSIS (nol pengecualian, §PT-1 B) | **NOL** — `account_status` sudah membawa posisi; drop `pipeline_stage` tak kehilangan apa pun |
| **sql×QUALIFIED** | **19** | `sql`↔QUALIFIED (satu-ke-satu) | **NOL/trivial** — redundan dgn `account_status=sql` |
| **sql×{NURTURE 6, PROPOSAL 3, NEGOTIATION 4}** | **13** | `pipeline_stage` membawa info TAMBAHAN (past-QUALIFIED) yang TAK ADA di `account_status=sql` | **KEPUTUSAN** — satu-satunya akun tanpa-inquiry yang stage-nya bukan sekadar cermin; overlap anomali §PT-1 D; tunawisma di batas dua-papan (§Usulan 4d) |
| **prospect (punya inquiry)** | **44** | stage akun harus di-backfill ke inquiry-nya | **INTI PEKERJAAN** — single-inquiry trivial; multi-inquiry ambigu (di bawah) |

**Konsekuensi langsung — MEMBALIK premis audit v1:** untuk **99 dari 112** akun tanpa-inquiry (80+19), migrasi stage = **NOL** (drop; `account_status` sudah cukup). Opsi backfill A–E **tak relevan** untuk kelompok tanpa-inquiry (tak ada inquiry untuk menerima stage). Yang v1 sebut "blocker terbesar" (semua lead/mql/sql kehilangan stage) **runtuh** — mayoritas tak punya stage bermakna untuk dihilangkan.

**Yang MASIH butuh keputusan migrasi:**

**(1) 44 akun prospect (punya inquiry) — backfill stage akun → inquiry:** single-inquiry = trivial (stage → satu inquiry itu). Multi-inquiry = ambigu (`inquiries.status` semua OPEN → nol diskriminator). **⚠️ Berapa dari 44 prospect yang multi-inquiry? TIDAK diketahui tanpa query** — fakta "30 dari 125 akun multi-inquiry" mencakup SELURUH akun berinquiry (termasuk customer/lost/lead-pool di luar papan aktif), bukan spesifik 44 prospect. **Pertanyaan terbuka baru §PT-8.** Untuk yang multi-inquiry, opsi A/D/E berlaku (B/C gugur).

**(2) 13 akun sql past-QUALIFIED tanpa inquiry — BUKAN masalah "stage ke inquiry mana" (tak ada inquiry):** ini masalah **data-realita** — stage bilang penawaran sudah dikirim/dinegosiasi tapi nol inquiry+quotation (kerja di luar Nexus, dikonfirmasi Den §PT-1 D). Opsi: (i) buatkan inquiry mundur agar masuk papan deal; (ii) cap ke QUALIFIED di papan lead (buang info PROPOSAL/NEGOTIATION); (iii) biarkan sbg anomali. **Keputusan §PT-9.**

**Opsi backfill — kini HANYA untuk 44 prospect yang multi-inquiry + historis WON/LOST (SUNWAY/TIGA REKSA), bukan lagi seluruh populasi:**

| Opsi | Aturan | Konsekuensi |
|---|---|---|
| **A. Broadcast** | semua inquiry akun dapat stage akun | SUNWAY → **11 inquiry jadi LOST** (padahal semua OPEN); TIGA REKSA → **10 inquiry jadi WON** (implikasi 10 deal menang — salah). |
| **~~B. Satu inquiry saja~~** | — | **GUGUR** — tak ada sinyal inquiry mana. |
| **~~C. Turunkan `inquiries.status`~~** | — | **GUGUR** — status selalu OPEN. |
| **D. Reset semua ke NEW** | semua inquiry mulai `NEW` | Paling jujur; untuk 44 prospect aktif **paling masuk akal** (deal baru mulai dari awal); tapi buang jejak WON/LOST historis. |
| **E. Hibrida** | customer→1 inquiry WON + sisanya NEW; lost→LOST; prospect→NEW | Kompleks, sebagian arbitrer; butuh input manual "yang mana WON". |

**Kasus SUNWAY (akun LOST, 11 inquiry OPEN) & TIGA REKSA (akun WON→customer, 10 inquiry OPEN):** keduanya **di LUAR papan aktif 156** (stage WON/LOST). Untuk state papan deal HIDUP mereka tak relevan (deal tertutup); untuk kelengkapan historis backfill-nya tetap ambigu (data akun sekarang pun tak konsisten: akun LOST/WON tapi inquiry OPEN → migrasi tak bisa "membetulkan" yang memang ambigu). **Keputusan bisnis, prioritas lebih rendah dari 44 prospect.**

**(d) `accounts.pipeline_stage` dipertahankan sebagai turunan?**
- **Pro (pertahankan sebagai rollup, mis. stage "tertinggi" dari inquiry-inquiry akun):** kompatibilitas mundur — `set_customer_on_won`, dashboard funnel, ProspectList filter, LeadPool `prevStageOf` tetap jalan tanpa rewrite besar; badge akun tetap ada.
- **Kontra:** butuh trigger/rollup baru yang meng-recompute akun dari inquiry (kompleks, urutan "tertinggi" = keputusan: apakah WON > NEGOTIATION > … > LOST? di mana LOST?); dua sumber kebenaran (drift risk, persis kelas TD-50/TD-94); NURTURE tak berperingkat (TD-61/104).
- **Buang total:** paling bersih secara model, tapi memaksa rewrite SEMUA pembaca akun-stage sekaligus (big-bang) + memutus `set_customer_on_won`.
- **Trade-off:** rollup = transisi lebih halus tapi utang kompleksitas + potensi drift; buang = bersih tapi big-bang berisiko.

---

## KOLOM YANG IKUT TERSERET

Semua kolom ini kini di `accounts`; `inquiries` tak punya satupun.

| Kolom | Milik DEAL atau AKUN | Alasan |
|---|---|---|
| `estimated_value` | **DEAL** (pindah) | Nilai peluang spesifik. Kalau tetap di akun sementara stage di inquiry, "Nilai Deal" per inquiry tak bermakna (semua inquiry akun berbagi satu angka). DealStepper/Nilai Deal (`DealPanels`) menampilkannya per-deal. **Wajib ikut.** |
| `estimated_closing_date` | **DEAL** (pindah) | Tanggal tutup per-peluang; Edit Deal menyetelnya bersama stage. |
| `stage_changed_at` | **DEAL** (pindah) | Terikat langsung ke `pipeline_stage` (trigger `track_stage_change`); dipakai aging + badge. Ikut ke mana stage ikut. |
| `won_reason` | **DEAL** (cenderung pindah) | Alasan sebuah DEAL menang. Tapi ada nuansa akun (jadi customer). Mostly deal. |
| `lost_reason` | **DEAL** (cenderung pindah) | Alasan sebuah DEAL kalah. Akun bisa punya deal kalah + deal jalan (SUNWAY). Mostly deal. **Keputusan.** |
| `assigned_to` / `assigned_profile` | **AMBIGU** | Sekarang = pemilik AKUN. Deal bisa dipegang orang berbeda dari pemilik akun. **Konsekuensi RLS besar** (lihat Risiko): `inquiries` tak punya `assigned_to` → kalau deal per-inquiry butuh assignee + visibilitas assigned, kolom baru + policy baru. **Keputusan §PT-3.** |
| `bant_*` (budget/authority/need/timeline/score/commodity/…) | **AKUN** (tetap) | Kualifikasi perusahaan/akun, bukan per-peluang. TAPI gate QUALIFIED (Kanban `handleDropStage`) memakai BANT akun untuk menaikkan STAGE — kalau stage per-inquiry, gate BANT akun-level vs stage inquiry-level jadi mismatch. Catat. |
| `converted_at` / `became_customer_at` | **AKUN** (tetap) | Lifecycle akun (kapan jadi customer). Dipicu WON. |
| `source`, `tier`, `credit_limit`, `payment_terms_id`, `is_in_lead_pool`, `pull_*`, `account_status` | **AKUN** (tetap) | Properti akun/lifecycle/parkir. |

**Poin tegas:** memindah `pipeline_stage` **tanpa** `estimated_value`+`estimated_closing_date`+`stage_changed_at` = setengah jalan yang merusak "Nilai Deal" & aging. Ketiganya paket dengan stage.

---

## RISIKO & URUTAN AMAN

**Big-bang (sekaligus) — apa yang pecah:**
- `set_customer_on_won` putus → akun tak pernah otomatis jadi customer (jalur WON→customer mati) sampai trigger pengganti ada.
- Semua penulis `accounts.pipeline_stage` (PipelineKanban drag/WON/LOST, `saveDealUpdate`, ProspectForm create, LeadPoolApproval) menulis kolom yang tak lagi jadi sumber → data hantu / error.
- Dashboard funnel/winrate/sales-perf membaca kolom kosong/berpindah → angka nol/salah.
- **Lead/mql/sql lenyap dari Kanban** seketika (tak ada inquiry) — populasi papan aktif **112 akun** (BUKAN ±937 audit v1; §PT-1). Hanya teratasi bila papan lead terpisah dibangun DULU (§Usulan).
- EF aging membaca `accounts.pipeline_stage` (kini kosong/pindah) → berhenti bekerja.
- Migrasi backfill multi-inquiry (§b) menulis stage salah ke 90 inquiry (SUNWAY/TIGA REKSA).

**Jalur bertahap (disarankan bila tetap jalan):**
1. **Tambah kolom `inquiries.pipeline_stage` (+ paket nilai deal)** berdampingan; default `'NEW'`; pindahkan/duplikat trigger `track_stage_change` ke inquiries. `accounts.pipeline_stage` **tetap hidup** sebagai sumber lama.
2. **Dual-write:** `saveDealUpdate` + drag Kanban menulis KEDUA tempat sementara (akun lama + inquiry baru) — TAPI dual-write untuk multi-inquiry ambigu (akun mana ↔ inquiry mana) → hanya bisa dual-write bersih untuk akun 1-inquiry; multi-inquiry butuh keputusan lebih dulu.
3. **Backfill** inquiry dari akun per aturan yang **diputuskan** (§b) — reversibel selama kolom lama masih ada.
4. **Cutover pembaca per-halaman** (InquiryList → DealDetail → Kanban → Dashboard → EF), verifikasi tiap langkah.
5. **Ganti `set_customer_on_won`** dengan trigger inquiry-based (setelah aturan multi-inquiry WON→customer diputuskan).
6. **Baru** drop `accounts.pipeline_stage` (+ index) — **titik tak-bisa-rollback**.

**Tidak bisa di-rollback setelah dijalankan:**
- **DROP `accounts.pipeline_stage`** (nilai lama hilang permanen kecuali ada backup; ada `accounts_lifecycle_backup_20260718` tapi hanya id/status/stage/is_in_lead_pool — parsial).
- **Backfill multi-inquiry** yang menandai 90 inquiry: begitu ditulis + kolom akun di-drop, **tak ada jalan tahu stage asli per inquiry** (informasi memang tak pernah ada). Keputusan salah = permanen.
- Audit log `CHANGE_PIPELINE_STAGE` lama (entityId=accountId) tetap merujuk akun — jejak historis tak bisa "dipindah" ke inquiry.

---

## USULAN DESAIN — PEMISAHAN DUA PAPAN

> **Usulan ini dari Den** (bukan auditor), lahir dari fakta §PT-1. Tugas bagian ini: **membedah kritis**, bukan merapikan.

**Ringkas usulan:** Nexus punya DUA corong yang selama ini dipaksa ke SATU papan Kanban:
- **Papan LEAD (pra-inquiry, 112 akun)** — berbasis `account_status` (`lead → mql → sql`). Tak butuh `pipeline_stage`.
- **Papan DEAL (punya-inquiry, 44 akun)** — berbasis `inquiries.pipeline_stage` (`NEW → … → WON/LOST`). Di sinilah stage hidup.

Gerbang `set_prospect_on_inquiry` (HIDUP) membelah **prospect vs non-prospect** dengan nyata: 44 punya-inquiry = 44 `prospect`; 112 tanpa = 112 non-prospect (lead/mql/sql — TERVERIFIKASI query Den). **⚠️ Tapi lihat 4d#1:** klaim usulan bahwa gradasi INTERNAL `lead→mql→sql` juga "terbelah sempurna" (terbukti lead=NEW & mql=CONTACTED) adalah **tautologi**, bukan bukti. Batas papan lead diusulkan berhenti di QUALIFIED (PROPOSAL+ hanya untuk yang punya inquiry, karena penawaran mustahil tanpa permintaan). NURTURE (6) diusulkan pindah ke papan lead → TD-61/104 "sebagian selesai tanpa dikerjakan" (⚠️ tidak gratis — 4d#3).

**Penilaian auditor: arah ini BENAR dan lebih bersih dari rencana "satu papan inquiry".** Ia menyelaraskan Kanban dengan model lifecycle-split yang sudah ada (`account_status` = sumbu lifecycle, `pipeline_stage` = sumbu deal) alih-alih menabraknya. TAPI ada cacat nyata (4d) yang belum tertangani.

### (a) Apa yang PECAH kalau Kanban dipecah dua?
- **PipelineKanbanPage:** dari SATU fetch `accounts` pra-customer → DUA sumber (papan lead fetch `accounts` by `account_status`; papan deal fetch `inquiries` by `pipeline_stage` join akun). Praktis dua komponen (atau satu ber-toggle). Rewrite **Besar**.
- **Drag-drop:** papan lead → drag menulis **`account_status`** (`lead→mql→sql`) — **BUKAN yang ditulis kode sekarang** (`applyStageMove` `PipelineKanbanPage.jsx:508` menulis `pipeline_stage`). Jadi bukan repoint: **mekanisme baru** (+ hormati CHECK `account_status` + gerbang). Papan deal → drag menulis `inquiries.pipeline_stage`. Dua handler tulis berbeda.
- **Filter "Semua Anggota" (assignee):** papan lead pakai `accounts.assigned_to` (ada); papan deal pakai `inquiries.assigned_to` — **`inquiries` tak punya `assigned_to`** → harus ditambah / diturunkan dari akun.
- **Dashboard:** metrik campur lead+prospect (funnel, "Prospect Aktif", trend) harus memutuskan sumbernya: `account_status` (lead), `inquiries.pipeline_stage` (deal), atau keduanya. Win Rate murni deal (inquiries). TD-101/TD-102 makin rumit.
- **EF aging-pipeline:** sekarang menidurkan LEAD idle via `accounts.pipeline_stage`+`stage_changed_at`. Setelah split: aging lead pakai `account_status`, TAPI **`accounts` TIDAK punya kolom "kapan `account_status` berubah"** — `stage_changed_at` terikat `pipeline_stage`. Jadi aging lead **kehilangan acuan waktu** kecuali kolom baru. **Aging harus dibelah + kolom waktu baru.**

### (b) Saat akun MELINTASI batas (inquiry pertama lahir) — kartu pindah papan, stage-nya?
Gerbang promosikan `account_status` lead/mql/sql → `prospect` → kartu **pindah dari papan lead ke papan deal**. Stage deal barunya:
- **Reset ke NEW (disarankan):** inquiry = peluang baru, mulai dari awal. Bersih; tapi lead yang tadinya QUALIFIED "mundur" ke deal NEW — bisa terasa regresi (padahal benar: yang QUALIFIED itu AKUN/lead, bukan deal).
- **Warisi `account_status`→stage (sql→QUALIFIED):** mempertahankan "sudah panas", tapi **mencampur dua sumbu** — persis kekacauan yang split ini mau bereskan. Tidak disarankan.
- **Aturan lain:** butuh keputusan — **§PT-10**.
Catatan: prospect di papan deal yang dapat inquiry KE-2 → `account_status` tetap prospect (gerbang hanya promosikan lead/mql/sql) → inquiry ke-2 = deal ke-2 (kartu ke-2), mulai NEW. Konsisten.

### (c) `accounts.pipeline_stage` masih perlu ada setelah split?
Setelah split, **nol pembaca papan** butuh `accounts.pipeline_stage` (papan lead=`account_status`, papan deal=`inquiries`). TAPI **belum bisa di-drop** sampai: (1) **`set_customer_on_won`** (dipicu `accounts.pipeline_stage='WON'`) diganti trigger inquiry-based (aturan multi-inquiry WON→customer §PT-2); (2) **EF aging** direwrite; (3) **dashboard funnel/winrate + ProspectList filter + LeadPool `prevStageOf`** dipindah sumbernya. Jadi split **memperjelas** bahwa kolom itu bisa dibuang, tapi **tidak menghapus** rewrite trigger+aging+dashboard. Drop = tetap titik tak-bisa-rollback, tetap terakhir.

### (d) CACAT SERIUS yang belum kalian lihat (bagian paling berharga)
1. **[BESAR] Mekanisme papan lead BELUM ADA.** Kesatuan 1-ke-1 (lead=NEW, mql=CONTACTED, sql=QUALIFIED) adalah **artefak backfill 18 Jul yang BEKU** — `account_status` di-derive DARI `pipeline_stage` saat backfill (per `PROGRESS.md`/TD-91: NEW→lead, CONTACTED→mql, else→sql), dan **tak ada UI yang menaikkan `account_status` sejak itu** (drag hanya menulis `pipeline_stage`). Jadi "papan lead jalan di `account_status`" **bukan repoint** — harus membangun advancement `lead→mql→sql` dari nol; dan begitu itu ada, `account_status`↔`pipeline_stage` untuk 80 akun itu bisa **langsung divergen** (bukti 1-ke-1 cuma kebetulan beku, bukan invariant). **Pisahkan tegas apa yang RUNTUH vs TIDAK:** yang **RUNTUH** = klaim "dua corong terbelah sempurna, terbukti dari kecocokan lead=NEW & mql=CONTACTED" — kecocokan itu **tautologi** (`account_status` di-derive DARI `pipeline_stage` saat backfill 18 Jul, jadi pasti cocok; bukan konfirmasi independen). Yang **TIDAK runtuh** = batas **prospect vs non-prospect** — dijaga trigger `set_prospect_on_inquiry` yang **masih HIDUP** (`schema:1139`, setiap inquiry baru mempromosikan akun → **invariant nyata**, bukan artefak). Yang **tak dijaga apa pun** = gradasi `lead → mql → sql` (nol trigger/UI menegakkannya). Jadi arah dua-papan tetap berpijak pada batas yang NYATA; yang rapuh hanya sub-kolom di dalam papan lead.
2. **[BESAR] 13 akun TUNAWISMA di batas.** PROPOSAL 3 + NEGOTIATION 4 + NURTURE 6 = **13** akun `sql` ber-stage di atas QUALIFIED **tanpa inquiry**. Batas usulan (lead≤QUALIFIED, deal=punya-inquiry) membuat mereka **tak masuk papan mana pun**. Usulan tak menjawab nasib mereka (§PT-9). **[KOREKSI: revisi 2 sempat tulis "19" — SALAH. 19 justru jumlah `sql×QUALIFIED` yang JUSTRU TIDAK tunawisma (QUALIFIED = puncak papan lead, masih di dalam batas). Tunawisma sebenarnya = 3+4+6 = 13.]**
3. **[SEDANG] NURTURE tak punya rumah di sumbu `account_status`.** `account_status` ∈ {lead,mql,sql,prospect,customer,lost,free_agent} — **tak ada `'nurture'`**. Klaim "NURTURE pindah ke papan lead → TD-61/104 selesai" **tidak otomatis**: NURTURE (nilai `pipeline_stage`) tak bisa jadi kolom papan lead tanpa (i) menambah `account_status='nurture'` (ubah CHECK + skema) atau (ii) memperlakukannya `sql` (buang label NURTURE). Jadi TD-61/104 **tidak gratis** — butuh keputusan representasi.
4. **[TETAP] Multi-inquiry TIDAK tersentuh split.** Usulan soal lead-vs-deal, bukan satu-akun-banyak-deal. 30 akun multi-inquiry tetap butuh aturan backfill; split tak membantu di sini.
5. **[SEDANG] Kepemilikan/visibilitas deal.** `inquiries` tak punya `assigned_to`; RLS `inquiries_read` (sales=`created_by`) ≠ `accounts` (sales=`assigned_to OR created_by`). Papan deal berbasis inquiry → sales yang di-assign akun tapi bukan pembuat inquiry **kehilangan** deal. Split memperjelas, tak menyelesaikan (§PT-3).
6. **[LOW-SEDANG] UX dua papan + navigasi.** Satu akun bisa muncul di papan lead lalu pindah ke papan deal (mungkin banyak kartu deal). Relasi "deal ini milik lead yang itu" perlu UI; laporan gabungan lead+deal perlu didefinisikan.

**Kesimpulan (d):** cacat **#1 (mekanisme papan lead adalah pekerjaan baru, bukan repoint)**, **#2 (13 akun tunawisma)**, dan **#3 (NURTURE tak punya representasi di `account_status`)** adalah yang belum terlihat dan paling penting. Arah dua-papan tetap BENAR, tapi ketiganya harus dijawab sebelum eksekusi — kalau tidak, "papan lead gratis dari `account_status`" ternyata tidak gratis.

---

## ESTIMASI EFFORT

| Area | Ukuran | Paralel/berurutan |
|---|---|---|
| **Keputusan bisnis (§PT-1/2/3)** | — (BLOCKER) | **HARUS pertama**, sebelum apa pun |
| **DB/migrasi** (kolom baru inquiries + trigger track_stage_change pindah + ganti set_customer_on_won + backfill + index) | **Sangat Besar** | Berurutan; backfill bergantung keputusan §b |
| **Kanban** (fetch akun→inquiry, kartu, drag-write, assignee/filter, "Tambah Deal", WON/handover, lead-tanpa-inquiry) | **Sangat Besar** | Setelah DB |
| **Dashboard** (funnel/winrate/sales-perf/trend + interaksi TD-101/102) | **Besar** | Bisa paralel dgn Detail pages setelah DB |
| **Detail pages** (DealDetail + CustomerDetail + DealPanels saveDealUpdate + audit) | **Besar** | Paralel dgn Dashboard |
| **EF aging-pipeline** (rewrite + redefinisi aging) | **Sedang** | Paralel, setelah DB |
| **RLS/visibilitas** (assignee deal, inquiries_read vs accounts scope) | **Sedang** (bisa Besar bila tambah assigned_to + policy) | Berurutan dgn keputusan §PT-3 |
| **Halaman kecil** (InquiryList badge, ProspectList filter, LeadPool prevStageOf, useCustomFields) | **Kecil–Sedang** | Paralel |

**Total realistis: Sangat Besar + didahului keputusan produk.** Ini bukan pekerjaan satu batch.

---

## PERTANYAAN TERBUKA UNTUK DEN (harus dijawab sebelum eksekusi)

1. **§PT-1 — ✅ TERJAWAB (query DB Den 19 Jul 2026, bukan verifikasi auditor).** Populasi papan aktif = **156** akun; **112 tanpa inquiry** (lead×NEW 42 + mql×CONTACTED 38 + sql×QUALIFIED 19 + sql×NURTURE 6 + sql×NEGOTIATION 4 + sql×PROPOSAL 3) + **44 punya inquiry** (= persis 44 `prospect`). **80 (lead+mql) punya `pipeline_stage` = cermin PERSIS `account_status`** (nol info tambahan). Jejak dokumen 156 akun: 44 punya-inquiry, 35 punya-quotation (subset — nol quotation yatim), 112 nol-dokumen. **Konsekuensi:** premis blocker "lead lenyap" **runtuh untuk 99/112** (redundan); jalan keluar = usulan **dua-papan** (lead=`account_status`, deal=`inquiries`) — §Usulan. **KOREKSI:** angka `±937` audit v1 = salah-konteks (total DB, bukan populasi papan). **Keputusan produk yang tersisa: adopsi dua-papan? (arah disarankan, cacatnya §Usulan 4d).**
2. **§PT-2 (BLOCKER) — aturan multi-inquiry:** (i) stage akun lama dibagikan bagaimana ke inquiry-inquiri-nya (Opsi A/D/E; B/C gugur)? **Kini menyempit ke akun multi-inquiry saja — populasinya §PT-8.** (ii) kalau 1 dari N inquiry jadi WON, apakah SELURUH akun jadi customer (pengganti `set_customer_on_won`)? (iii) apakah akun boleh punya deal WON dan deal jalan sekaligus (SUNWAY/TIGA REKSA jadi "normal")?
3. **§PT-3 (HIGH) — kepemilikan & visibilitas deal:** `inquiries` tak punya `assigned_to`; RLS `inquiries_read` = `created_by=me` (sales), beda dari `accounts` (`assigned_to=me OR created_by=me`). Apakah deal punya assignee sendiri (kolom + policy baru), dan apakah visibilitas sales harus mengikuti assigned (bukan hanya created)? Tanpa ini, sales yang di-assign akun tapi bukan pembuat inquiry **kehilangan** deal dari Kanban.
4. **§PT-4 (HIGH) — paket kolom deal:** setuju `estimated_value` + `estimated_closing_date` + `stage_changed_at` ikut pindah ke inquiries? `won_reason`/`lost_reason` deal-level atau akun-level? (Kalau nilai tetap di akun, "Nilai Deal" per inquiry rusak.)
5. **§PT-5 (MEDIUM) — `accounts.pipeline_stage`:** dibuang total (big-bang, bersih) atau dipertahankan sebagai rollup turunan (transisi halus, utang kompleksitas + drift)? Kalau rollup, definisikan "stage tertinggi" (peringkat WON/…/LOST, posisi NURTURE).
6. **§PT-6 (MEDIUM) — gate & aging:** gate QUALIFIED pakai BANT **akun** untuk menaikkan stage **inquiry** — apakah BANT tetap akun-level (mismatch) atau ikut inquiry? Aging saat ini menidurkan lead idle — apa yang di-aging setelah stage per-inquiry (lead tak punya inquiry)?
7. **§PT-7 (LOW) — audit & histori:** audit `CHANGE_PIPELINE_STAGE` lama merujuk `accountId`; jejak historis tak bisa dipindah. Terima diskontinuitas jejak?
8. **§PT-8 (BLOCKER, angka belum ada) — dari 44 akun `prospect` (papan deal), berapa yang MULTI-inquiry?** Fakta "30 dari 125" mencakup SELURUH akun berinquiry (termasuk customer/lost/lead-pool di luar papan aktif), **bukan** spesifik 44 prospect. Beban migrasi stage→inquiry yang ambigu (Opsi A/D/E) hanya menyentuh yang multi-inquiry di antara 44 ini. **Butuh query:** 44 prospect aktif — berapa single vs multi inquiry?
9. **§PT-9 (BLOCKER produk) — nasib 13 akun past-QUALIFIED TANPA inquiry** (PROPOSAL 3 + NEGOTIATION 4 + NURTURE 6 = 13; **bukan 19** — 19 itu `sql×QUALIFIED` yang tak tunawisma): tunawisma di batas dua-papan (§Usulan 4d#2). Pilihan penempatan: (i) buatkan inquiry mundur → papan deal; (ii) cap ke QUALIFIED di papan lead (buang info PROPOSAL/NEGOTIATION); (iii) biarkan anomali. **+ representasi NURTURE:** tambah `account_status='nurture'` (ubah CHECK+skema) atau perlakukan sbg `sql`? — **TD-61/104 TIDAK selesai gratis** (§Usulan 4d#3).
10. **§PT-10 (MEDIUM) — stage saat akun melintasi batas** (inquiry pertama lahir → lead/mql/sql promosi `prospect`, kartu pindah papan): deal baru mulai `NEW` (disarankan) atau warisi posisi lead (`sql`→QUALIFIED, mencampur sumbu)? (§Usulan 4b)
11. **§PT-11 (LOW — dicatat TERPISAH atas permintaan Den, tak dianalisis dalam) — anomali data:** 7 akun `sql` PROPOSAL/NEGOTIATION aktif nol inquiry+quotation (penawaran ada tapi di LUAR Nexus, dikonfirmasi Den); **27 akun** bila filter `is_active`/`is_in_lead_pool` dilepas (7 aktif + 20 diparkir/nonaktif), semua nol quotation. Mau dirapikan sbg data (buatkan inquiry mundur) atau dibiarkan? (Beririsan dgn §PT-9 tapi ini keputusan HIGIENE DATA, bukan penempatan papan.)
12. **§PT-12 (MEDIUM — dicatat, JANGAN diputuskan) — kolom BANT: sebagian logis milik INQUIRY, tapi sudah terisi di 576 akun.** Query DB Den 19 Jul (1078 akun aktif): `bant_budget` + `bant_authority` terisi **1078** (100% → **hampir pasti nilai default, bukan input manusia** — kalau `bant_score` dihitung dari kolom-kolom ini, skornya ikut tak bermakna; kerabat gate QUALIFIED yang pakai BANT akun, §PT-6). `bant_commodity` + `bant_origin` + `bant_destination` + `bant_decision_maker` terisi **576** (angka **identik** → kemungkinan satu sumber/impor yang sama). **Relevansi rencana:** `bant_commodity`/`bant_origin`/`bant_destination` secara logis milik **INQUIRY** (isi permintaan — satu akun bisa rute berbeda per inquiry; terbukti HINOMOTO 2 inquiry rute beda), **bukan AKUN** (sifat perusahaan). TAPI karena sudah terisi di **576 akun**, memindah/menghapusnya **BUKAN keputusan gratis**. Keputusan terpisah dari sumbu stage (dicatat agar tak hilang; tak diputuskan di sini).

---

**Catatan wajib:** Audit ini tidak menjalankan app/DB. **Fakta populasi (156/44/112, sebaran §PT-1 B, jejak dokumen §PT-1 C, anomali §PT-1 D) = query DB Den 19 Jul 2026 — bukan verifikasi auditor** (tak ada kredensial DB di sesi ini). Fakta lama (125/185/30/90, SUNWAY/TIGA REKSA) = Den + `PROGRESS.md`/TD-91. **Usulan dua-papan = dari Den; pembedahannya (§Usulan) = analisis auditor ke kode/schema.** Angka `±937` di audit v1 DIKOREKSI (salah-konteks). Semua klaim kode/trigger/RLS dari `src/` + `schema_snapshot.sql`. Angka **§PT-8** (44 prospect single vs multi) **belum diquery**. NOL file diubah selain dokumen ini; NOL SQL ditulis.
