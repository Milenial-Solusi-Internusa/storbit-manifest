# 18 — AUDIT PEKERJAAN PENDING: CRM · SALES/SP · PRF

> **Audit read-only, 2026-07-17.** Memetakan pekerjaan yang masih PENDING / SETENGAH JALAN / NYANGKUT di tiga modul: CRM, Sales (SP/Storbit), PRF. Bukan laporan pujian — fokus ke PR yang tersisa.
> **Metode:** silang-cek klaim status di `09_ROADMAP` · `10_TASK_BREAKDOWN` · `08_TECH_DEBT` · `00_DEV_JOURNEY` · `05_WORKFLOW_MAP` · `PROGRESS.md` **vs kenyataan di kode `src/` + `supabase/schema_snapshot.sql` + `supabase/migrations/`**. Dokumen tidak dipercaya sendirian.
> **⚠️ Tidak menjalankan app/DB.** Klaim sisi DB diverifikasi ke **snapshot & migrasi (schema ter-commit)**, bukan instance live — kalau produksi sudah drift, perlu re-konfirmasi. Ditandai di tiap temuan yang relevan.
> **Tidak menyentuh** `AUDIT.md` (dokumen GM BD, masih dirujuk `CLAUDE.md`/`PROGRESS.md`).

---

## RINGKASAN EKSEKUTIF

Ketiga modul **tidak sedang rusak** — alur harian CRM (prospect → pipeline → inquiry → quotation) dan Sales/SP (DRAFT → … → BTB_TERBIT) memang jalan. Masalahnya ada di **ujung-ujung corong**: hampir setiap alur berhenti tepat sebelum menghasilkan konsekuensi bisnis. Quotation tak pernah bisa jadi `ACCEPTED` (tak ada tombolnya) sehingga **88% deal WON nilainya kosong**; PRF bisa dibuat tapi **tak ada halaman untuk membacanya** — draft PRF yang disimpan **tak bisa dibuka lagi selamanya**; handover WON tersimpan lalu **berhenti** (tak ada SO/SP yang lahir darinya); dan status `INVOICED/SUBMITTED/LUNAS` ada di CHECK tapi **tak ada satu baris kode pun** yang bisa menyetelnya. Pola berulangnya: **infrastruktur dibangun lebih dulu, jalan masuknya belum** — ada trigger DB live (`sync_deal_value_on_quotation_accept`) dan RLS policy (`prf_update_status`) yang menunggu konsumen yang tak pernah dibuat.

Temuan paling berbahaya justru yang paling sunyi. **`NURTURE` adalah lubang hitam**: user bisa menyetelnya dari ProspectFormPage, tapi stage itu tak ada di Kanban dan tak ada di aturan aging — prospect yang di-set NURTURE **hilang dari pipeline dan tak akan pernah ter-aging ke Lead Pool**. **`can()` mengembalikan `false` untuk SEMUA aksi** bagi role `supervisor`, `gm_bd`, dan `sales_spv` karena ketiganya absen dari map `PERMISSIONS` — padahal `gm_bd` baru saja dibuat khusus untuk CRM dan dipakai di 9+ gate menu. Dan **~48 policy RLS masih `USING(true)`** (termasuk `sp_items`, `picking_lists`, `delivery_notes`) sehingga isolasi antar-entitas bergantung pada filter aplikasi, bukan database.

Soal kejujuran dokumen: arahnya **dua-duanya meleset, tapi lebih sering under-claim**. Lima klaim "belum merge / belum live / snapshot stale" ternyata **sudah beres** (`delete_sp_dual` sudah di snapshot, tabel `prf` sudah di snapshot, `is_manager_or_above` sudah +`gm_bd`, aging-pipeline sudah merged, dua branch UI sudah merged) — dokumen membuat pekerjaan tampak lebih tertinggal dari kenyataan. Sebaliknya ada **over-claim**: `09_ROADMAP:34` menandai "pricing authority BD-06" **✅** padahal enforcement-nya nol (murni badge warna), dan **TD-37 sudah tidak berlaku** (AuditLogPage terbukti membaca `audit_logs`, bukan `user_login_logs`). Efeknya sama-sama buruk: prioritas jadi susah dipercaya.

### Hitungan item pending

| Modul | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| **CRM** | 0 | 6 | 8 | 9 | **23** |
| **Sales/SP** | 1 | 5 | 5 | 4 | **15** |
| **PRF** | 0 | 3 | 3 | 2 | **8** |
| **Dependency** (blocker dari modul lain) | 2 | 2 | 1 | 0 | **5** |
| **TOTAL** | **3** | **16** | **17** | **15** | **51** |

| Status | Jumlah |
|---|---|
| BELUM MULAI | 19 |
| SELESAI-SEBAGIAN | 13 |
| NYANGKUT-BLOCKED | 8 |
| IN-PROGRESS (mandeg) | 3 |
| KLAIM-DONE-TAPI-MERAGUKAN | 8 |

---

## PETA PEKERJAAN PENDING PER MODUL

### ▌CRM

#### C-01 · Quotation tak pernah bisa `ACCEPTED` → 88% nilai deal WON kosong
- **STATUS:** NYANGKUT-BLOCKED · **P1**
- **SUMBER:** `08_TECH_DEBT` TD-54 · `05_WORKFLOW_MAP:53` · **kode:** satu-satunya transisi = `QuotationDetailPage.jsx:258` (`status:'SENT'`, tombol `:334-336` gated `SUBMITTED`); `QuotationFormPage.jsx:737,797` (`SUBMITTED`/`DRAFT`). **Nol** penulis `ACCEPTED`/`REJECTED` di `src/`. Trigger `sync_deal_value_on_quotation_accept` **live** (`schema_snapshot.sql:1331`, attach `:7336`) tapi hanya nyala saat `NEW.status='ACCEPTED'`.
- **DAMPAK:** 29/33 deal WON (**88%**) `estimated_value` kosong → laporan nilai pipeline cuma menghitung 4 deal. Gate handover (Light ≤Rp100jt / Strategic >Rp100jt) membaca `estimated_value` → nilai 0 **selalu jatuh ke Light**, walau deal-nya besar.
- **BLOKER:** keputusan produk — tambah aksi "Terima" (SENT→ACCEPTED) **atau** nyatakan ACCEPTED mati & buang trigger. Belum diputuskan.
- **LANGKAH LANJUT:** putuskan dulu; kalau "Terima" dipilih → tombol di `QuotationDetailPage` (pola tombol "Kirim ke Customer" yang sudah ada) + backfill `estimated_value` 29 deal WON lama.
- **CATATAN:** `quotations` **tak punya** CHECK constraint status sama sekali → nilai status murni konvensi kode.

#### C-02 · `NURTURE` = lubang hitam (prospect bisa masuk, tak bisa keluar)
- **STATUS:** NYANGKUT-BLOCKED · **P1**
- **SUMBER:** TD-61 · **kode:** `ProspectFormPage.jsx:27` `PIPELINE_STAGES` **memuat** NURTURE (user bisa menyetelnya) + badge `ProspectListPage.jsx:37`; TAPI `PipelineKanbanPage.jsx:18-25` `STAGES` **tanpa** nurture, dan `aging-pipeline/index.ts:4-10` `AGING_RULES` **tanpa** NURTURE.
- **DAMPAK:** **6 akun** (terakhir gerak 25 Jun) tak terlihat di Kanban **dan** tak pernah ter-aging ke Lead Pool → nangkring selamanya, tak tersentuh siapa pun. Efek samping: CRM Dashboard (477) vs Kanban (471) selalu selisih **6** tanpa penjelasan di UI. `PipelineKanbanPage.jsx:331` fallback ke `new` untuk header — menyamarkan masalah.
- **BLOKER:** keputusan — NURTURE dapat kolom Kanban? dapat aturan aging (usul lama: 90 hari → pool)? atau dihapus dari `PIPELINE_STAGES` supaya tak bisa di-set?
- **LANGKAH LANJUT:** keputusan dulu; opsi tercepat & paling aman = **buang NURTURE dari `ProspectFormPage` `PIPELINE_STAGES`** (tutup pintu masuk) + migrasi 6 akun ke stage sah.

#### C-03 · Margin floor & otoritas diskon = pajangan (tak nge-block apa pun)
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** TD-38 · `10_TASK_BREAKDOWN` **H3** · **⚠️ bentrok** `09_ROADMAP:34` yang menandai "pricing authority BD-06" **✅** · **kode:** `validate()` (`QuotationFormPage.jsx:679-684`) **hanya** cek `header.inquiry_id`; `handleSave:687-688` = `if(!validate()) return;` titik. `pricingAuthority()` (`:41-57`) dipanggil **sekali** di `:940` — cuma merender badge warna (`:943`). `marginPct` (`:676`) hanya dirender (`:1112`). `margin_floor` **tak pernah dibandingkan** dengan apa pun, dan **tak ada field input**-nya (cuma passthrough `:742`).
- **DAMPAK:** user bisa submit diskon 90% dengan margin negatif; badge berubah merah "Perlu approval CEO + Finance Controller + BoD" — **tombol simpan tetap jalan**, dan **tak ada record approval yang ditulis ke mana pun**. Kontrol harga = teater.
- **BLOKER:** perlu keputusan: blok keras, warn+konfirmasi, atau bikin alur approval sungguhan? Idealnya server-side di RPC `save_quotation` (FE-only bisa di-bypass).
- **LANGKAH LANJUT:** minimal → blok/warn di `handleSave` bila diskon > otoritas role; benar → validasi di `save_quotation` + tabel approval.

#### C-04 · WON → Handover → Fulfillment: rantai PUTUS
- **STATUS:** SELESAI-SEBAGIAN · **P1**
- **SUMBER:** `13_CRM_FLOW_AUDIT §4.3 C3` · **kode:** `deal_handovers` satu-satunya penulis = `PipelineKanbanPage.jsx:787` (`.insert`), **nol** `.update()`; `deal_handovers` **tak punya trigger** (hanya RLS). SP dibuat manual di `InputSPPage` dari PO customer — **nol** FK/referensi ke `deal_handovers`/`quotations`/WON.
- **DAMPAK:** handover = **catatan buntu**. Tak ada Sales Order/SP yang lahir dari deal yang menang; tim logistik mengetik ulang dari PO customer. Ini gap arsitektural terbesar antara CRM dan Sales.
- **BLOKER:** butuh desain (apakah SP auto-generate dari handover? atau cukup link/referensi?).
- **LANGKAH LANJUT:** desain jembatan handover→SP; minimal simpan referensi (`deal_handovers.id`/`quotation_ref`) di SP supaya bisa ditelusuri.

#### C-05 · Sign-off handover & TOP Request = insert-and-forget
- **STATUS:** SELESAI-SEBAGIAN · **P2**
- **SUMBER:** `13_CRM_FLOW_AUDIT §2` · **kode:** grep `approved_by_sales`/`approved_by_ops`/`approved_by_finance` di `src/` = **0 hit** (kolom ada di `schema_snapshot.sql:2696-2698`, tak pernah dibaca/ditulis). `top_requests`: satu-satunya penulis `TOPRequestModal.jsx:81` `.insert`, status hardcode `'submitted'` (`:4`) — **tak ada** kode yang memajukannya.
- **DAMPAK:** teks "dual sign-off / commission release" di modal handover = **copy UI belaka**. TOP Request masuk DB lalu diam; approval finance yang dijanjikan `05_WORKFLOW_MAP:72` ("proses downstream, di luar FE") **tak ada wujudnya di repo**.
- **BLOKER:** perlu konfirmasi: approval TOP/handover memang dikerjakan manual di luar sistem, atau memang belum dibangun?
- **LANGKAH LANJUT:** **PERLU KONFIRMASI DEN** — kalau manual di luar sistem, hapus teks sign-off yang menyesatkan; kalau tidak, bangun alur approval.

#### C-06 · RLS `rate_sheets` tak filter `company_id` (bocor lintas-entitas, laten)
- **STATUS:** BELUM MULAI · **P1 (keamanan)**
- **SUMBER:** TD-55 · policy = `created_by = auth.uid() OR is_manager_or_above()`; kolom `company_id` ADA (`schema_snapshot.sql:4052`) tapi **tak dipakai policy**.
- **DAMPAK:** manager satu entitas bisa membaca rate sheet entitas lain. Laten sekarang (2 baris, keduanya MSI) — **jadi nyata begitu JCI/SOA mulai input**.
- **BLOKER:** tak ada. Tinggal dikerjakan.
- **LANGKAH LANJUT:** tambah `company_id = get_user_company_id()` (+ bypass `is_super_admin()`) ke SELECT/UPDATE. **WAJIB sebelum entitas non-MSI pakai Rate List.**

#### C-07 · Approval Lead Pool hanya dijaga di client
- **STATUS:** SELESAI-SEBAGIAN · **P2 (keamanan)**
- **SUMBER:** `13_CRM_FLOW_AUDIT §4.1 A2` · gate approver = menu `App.jsx:474`; RLS `prospects_update` = `is_manager_or_above() OR assigned_to OR created_by` — **tanpa column-guard `pull_status`**.
- **DAMPAK:** secara teori sales bisa menyetel `pull_status='approved'` pada barisnya sendiri lewat query langsung → approval terlewati. Belum tentu ada yang melakukannya, tapi kontrolnya memang tak ada di DB.
- **BLOKER:** perlu verifikasi apakah ada guard lain (trigger) — **tak bisa dipastikan dari snapshot**.
- **LANGKAH LANJUT:** verifikasi di SQL Editor; kalau memang terbuka → policy khusus/trigger yang melarang non-manager mengubah `pull_status`.

#### C-08 · Inquiry → PRF: manual, cuma menyalin `account_id`
- **STATUS:** SELESAI-SEBAGIAN · **P2**
- **SUMBER:** `13_CRM_FLOW_AUDIT §4.3 C1` · `14_BACKLOG_RECON` C11 · `PRFFormPage.jsx:226-229` (pilih inquiry → hanya isi `account_id`), `:330` (`inquiry_id` null kecuali sumber=inquiry).
- **DAMPAK:** detail RFQ (service/route/cargo/incoterm) **diketik ulang** dari inquiry → boros + rawan salah ketik + data bisa menyimpang dari inquiry aslinya.
- **BLOKER:** tak ada (murni FE).
- **LANGKAH LANJUT:** saat sumber=inquiry, prefill field yang paralel (direction/commodity/service_type/origin/destination/incoterms).

#### C-09 · Teks UI berbohong: "Submit akan mengubah status inquiry ke QUOTED"
- **STATUS:** BELUM MULAI · **P2**
- **SUMBER:** TD-56 · **kode:** teks `QuotationFormPage.jsx:1154`; file itu menyentuh `inquiries` **hanya** `.select()` (`:423-424`). Satu-satunya update `inquiries` di `src/` = `InquiryFormPage.jsx:268`, payload-nya (`:240-265`) **tanpa** key `status`. RPC `save_quotation` (`schema_snapshot.sql:997+`) hanya update `quotations`+items. **Nol** `UPDATE public.inquiries` di function DB mana pun.
- **DAMPAK:** inquiry **OPEN selamanya**; user percaya statusnya pindah. `QUOTED` di `InquiryListPage.jsx:44` display-only.
- **BLOKER:** tak ada.
- **LANGKAH LANJUT:** implementasikan update `inquiries.status='QUOTED'` saat Submit **atau** hapus teksnya. Jangan dibiarkan.

#### C-10 · LOST tak punya siklus hidup; `lost_reason` tak di-enforce
- **STATUS:** NYANGKUT-BLOCKED · **P2**
- **SUMBER:** TD-58 · hanya **7/997** akun LOST; `lost_reason` terisi **3/7 (43%)** walau `WinLossModal` ada.
- **DAMPAK:** sales tak menandai kekalahan → lead mati menumpuk di stage aktif; data kekalahan tak bisa dianalisis.
- **BLOKER:** perlu desain — LOST masuk pool atau tempat sendiri? reaktivasi lewat mana?
- **LANGKAH LANJUT:** desain dulu; quick win: wajibkan `lost_reason` saat set LOST.

#### C-11 · Bug dilaporkan: Dashboard Calendar ≠ Riwayat Visit
- **STATUS:** BELUM MULAI · **P2**
- **SUMBER:** `14_BACKLOG_RECON` B10 (belum ada TD) — dugaan dari field meeting/catatan di `activities`.
- **DAMPAK:** dua halaman menampilkan angka visit berbeda → user tak tahu mana yang benar.
- **BLOKER:** **belum direproduksi** — perlu verifikasi runtime.
- **LANGKAH LANJUT:** reproduksi dulu, baru audit query. **PERLU KONFIRMASI DEN.**

#### C-12 · Field hilang di PDF Inquiry
- **STATUS:** BELUM MULAI · **P2** · **SUMBER:** `14_BACKLOG_RECON` B9 (belum ada TD). **DAMPAK:** dokumen ke customer tak lengkap. **BLOKER:** field mana belum diidentifikasi — perlu cek mapping `InquiryPDF.jsx`. **LANGKAH:** identifikasi field → tambal.

#### C-13 · MOU belum bisa di-upload; Aktivitas belum tarik status MOU/TOP
- **STATUS:** BELUM MULAI · **P2** · **SUMBER:** `14_BACKLOG_RECON` C16/C17. **DAMPAK:** tak ada tempat menyimpan MOU; `13_CRM_FLOW_AUDIT §3` mengonfirmasi **nol `storage.upload`** di seluruh CRM. **BLOKER:** butuh Supabase Storage + kolom/tabel MOU (belum ada). **LANGKAH:** desain penyimpanan dokumen dulu (C17 bergantung C16; data TOP sudah ada di `top_requests`).

#### C-14 · Menu CRM redundan (dua blok render)
- **STATUS:** BELUM MULAI · **P2** · **SUMBER:** `13_CRM_FLOW_AUDIT §4.2/§6` · `14_BACKLOG_RECON` C18 — blok kanonik (`App.jsx` ~469-796, ber-`role[]`) + list kedua (~855-984, tanpa role inline, di-gate `MENU_KEY_MAP`). **DAMPAK:** peran efektif = interseksi dua blok + permission data-driven → sumber miskomunikasi & sulit diaudit. **BLOKER:** tak ada, tapi berisiko (menyentuh routing). **LANGKAH:** konsolidasi jadi satu registry (kerabat TD-68 ComingSoon catch-all).

#### C-15 · `notification_rules` yatim
- **STATUS:** NYANGKUT-BLOCKED · **P3** · **SUMBER:** TD-53 — 11 rule aktif, semua MSI, **nol pembaca**. Notif nyata ditulis langsung tanpa lewat rules. **DAMPAK:** tabel menipu (tampak ada mesin notifikasi, padahal tidak). **BLOKER:** keputusan: bangun engine atau buang tabel. **LANGKAH:** putuskan; jangan tambah rule baru sebelum ada consumer.

#### C-16 · Kolom `is_odoo_customer` mati
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** TD-57 — 0/997 bernilai true; checkbox+badge UI ada. **LANGKAH:** drop kolom+UI kalau integrasi Odoo batal. **PERLU KONFIRMASI DEN.**

#### C-17 · `SalesCallsPage.jsx` dead code
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** TD-69 · **kode terverifikasi:** `App.jsx:58` lazy-import; route `crm-calls` (`App.jsx:3097`) merender **`ActivitiesPage`** (`:3100`); `ActivitiesPage.jsx:3-4` sendiri menyatakan menggantikannya. `SalesCallsPage.jsx:342` export komponen yang **tak pernah di-mount**. **LANGKAH:** hapus file + import.

#### C-18 · Label filter BANT stale + badge aging NEW hilang
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** `13_CRM_FLOW_AUDIT §6.3-6.4` — `BANT_BANDS` label "Tinggi 6–7/Sedang 4–5/Rendah 1–3" + cutoff 6/4/1 (`PipelineKanbanPage.jsx:209-214,228-234`) memakai model **0–7**, padahal model asli **0–12** & gate-nya 5/8. `AGING_LIMITS` (`:170`) **tanpa key `new`** padahal EF meng-age NEW di 7 hari → kartu NEW ter-pool **tanpa peringatan visual**. **DAMPAK:** menyesatkan sales. **LANGKAH:** selaraskan label + tambah `new: 7`.

#### C-19 · Migrasi label dropdown & seed status catalog
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** `10_TASK_BREAKDOWN` **G1** (`SERVICE_TYPE_LABELS` display map → `dropdown_options`) & **G4** (seed status/stage CRM ke `status_catalog`). **DAMPAK:** label display masih hardcoded walau form sudah DB-driven (2.11E). **LANGKAH:** helper value→label via `useDropdownOptions`.

#### C-20 · `last_activity_at` pakai kompromi `COALESCE(completed_at, created_at)`
- **STATUS:** SELESAI-SEBAGIAN · **P3** · **SUMBER:** TD-59 — hanya **122/269 (45%)** aktivitas ditandai selesai. **BLOKER:** prasyarat proses (sales terbiasa menandai selesai). **LANGKAH:** tinjau ulang bila keterisian `completed_at` >90% → ganti ke `completed_at` murni.

#### C-21 · Perubahan kecil belum dikerjakan
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** `14_BACKLOG_RECON` B4/B5/B8 — mekanisme email → **email group** (B4); rename tombol **"Tambah Deal" → "Tambah Leads"** (B5; label terverifikasi `PipelineKanbanPage.jsx:899`); **template note** di quotation (B8). **LANGKAH:** B5 satu baris; B4 perlu keputusan konfigurasi; B8 perlu desain kecil.

#### C-22 · Verifikasi runtime staging belum jalan
- **STATUS:** BELUM MULAI · **P2** · **SUMBER:** `10_TASK_BREAKDOWN` **A1** (migrasi `accounts`: drag→WON jadi customer, dsb) & **A3** (Quotation: currency/VAT/PDF/fallback vat_rate null). **DAMPAK:** banyak fitur berstatus "build clean, **belum tes manual runtime**" menumpuk sejak 2.10–2.11 — risiko regresi tak ketahuan. **LANGKAH:** sesi verifikasi khusus (butuh login multi-role).

#### C-23 · File CRM raksasa (utang refactor)
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** TD-13/TD-34 — `CRMDashboardPage` **2.457**, `PipelineKanbanPage` **1.142**, `ActivitiesPage` **1.041**, `QuotationFormPage` **1.189**, `CustomerDetailPage` **973**, `QuotationDetailPage` **787**. **BLOKER:** **TD-07 (nol test)** — memecah tanpa test = judi. **LANGKAH:** test dulu (`E2`), baru pecah.

---

### ▌SALES / SP (Storbit)

#### S-01 · RLS `USING(true)` di tabel transaksional SP
- **STATUS:** BELUM MULAI · **P0 (keamanan)**
- **SUMBER:** TD-39 · `10_TASK_BREAKDOWN` **H4** · **terverifikasi:** `sp_items_read/insert/update/delete` semuanya `USING (true)` (`schema_snapshot.sql:11852-11873`). Terdampak juga: `picking_lists`/`_items`/`_materials`, `delivery_notes`/`_items`, `stock_ledger`, `ar_btbs`/`ar_ttfs`, dll (~48 policy).
- **DAMPAK:** **isolasi antar-entitas bergantung filter aplikasi, bukan DB.** Satu query lupa `.eq('company_id')` = data lintas-entitas bocor. Ini satu-satunya P0 murni di modul ini.
- **BLOKER:** tak ada, tapi berisiko tinggi & luas → butuh sesi fresh + tes lintas role.
- **LANGKAH LANJUT:** perketat bertahap, prioritas `sp_items`/`picking_lists`/`delivery_notes`. Catat: `sp_orders`/`sp_order_items` **sudah** company+role-scoped (`:11886-11941`) → polanya sudah ada, tinggal ditiru.

#### S-02 · FASE 4-5 (invoice/payment) belum dibangun → 3 status tak terjangkau
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** `09_ROADMAP:153-154` · `10_TASK_BREAKDOWN` **H1/H2** · `05_WORKFLOW_MAP:234-237` · **terverifikasi:** CHECK `sp_orders.status` memuat `INVOICED/SUBMITTED/LUNAS` (`schema_snapshot.sql:4376`) & guard beku `sp_recompute_status:1266` sudah menghormatinya — tapi **nol** kode/RPC yang menyetelnya.
- **DAMPAK:** corong berhenti di `BTB_TERBIT`. Tak ada invoice, tak ada pelunasan di sistem. Ini **blocker langsung** untuk H7 sub-item "beku saat LUNAS" (lihat S-04).
- **BLOKER:** modul baru (butuh audit + desain skema dulu, pola FASE 0).
- **LANGKAH LANJUT:** H1 = audit alur finance + desain tabel invoice; **jangan** langsung wiring.

#### S-03 · Badge tab SP abaikan filter (angka menyesatkan saat presentasi)
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** TD-65 — `counts` useMemo (`SalesOrderPage.jsx:355-361`) depend **hanya** pada `augmented` (grup penuh), bukan `filtered` (`:377-398`).
- **DAMPAK:** pilih Customer=Indomarco → badge "Semua SP" tetap total seluruh customer. **Rawan salah dipahami saat dipresentasikan ke customer.**
- **BLOKER:** tak ada. **LANGKAH:** hitung `counts` dari himpunan terfilter, atau beri label eksplisit "total keseluruhan".

#### S-04 · H7 Level 2 (kunci harga Edit Item SP) — baru 1 dari 5 sub-item
- **STATUS:** SELESAI-SEBAGIAN · **P1**
- **SUMBER:** `10_TASK_BREAKDOWN` **H7** · `15_INPUT_CONTROL_AUDIT` Misi 1 · `16_SP_TABLES_SYNC_AUDIT`
- **Sudah:** harga `unit_price` **read-only** di EditItemModal (**sudah merge**, `595ab51`) · kolom `price_category` + `review_status` di-ALTER + labeling rekon (**587 `perlu_review` / 140 `review_default` / 727**) · migrasi direkam (`20260716000000_...`).
- **Belum:** ① **backfill `price_category` beneran** (yang jalan baru labeling `review_status`; kolom kategori **masih kosong**) · ② **dropdown kategori** di EditItemModal · ③ **RLS company-aware** "hanya Super Admin + Operations boleh ubah `price_category`" · ④ **beku saat LUNAS** (BLOCKED, lihat "Yang Nyangkut") · ⑤ putuskan kapan `review_status` di-drop.
- **DAMPAK:** tujuan "harga bersumber tunggal dari Master Product" **belum tercapai** — Operations belum bisa ganti kategori, dan enforcement masih client-only (belum sampai RLS sesuai keputusan desain).
- **BLOKER:** ④ blocked; ① butuh SQL + preview per baris; ③ butuh keputusan domain nilai (di bawah).
- **LANGKAH LANJUT:** kerjakan ②+① dulu (tak terblokir), ③ menyusul, ④ tunggu keputusan.

#### S-05 · Domain nilai `price_category` belum baku (dua tabel beda aturan)
- **STATUS:** NYANGKUT-BLOCKED · **P2**
- **SUMBER:** TD-72 · H7 · **terverifikasi:** `sp_order_items.price_category` punya CHECK ketat `('semester','tahunan','project')` (`schema_snapshot.sql:4341`); `sp_items.price_category` **tanpa CHECK** dan dipakai dengan nilai `default`/`semester`/`legacy`.
- **DAMPAK:** dua tabel "kategori harga" dengan domain berbeda → data tak konsisten, validasi tak bisa disatukan.
- **BLOKER:** **keputusan Den** — satukan domain? beri CHECK di `sp_items`? Aturan ops "kategori manual per PKS" **belum menjawabnya**.
- **LANGKAH LANJUT:** putuskan domain final dulu, baru backfill (S-04①) — kalau dibalik, backfill-nya harus diulang.

#### S-06 · Snapshot stale: 2 kolom baru belum terekam
- **STATUS:** IN-PROGRESS (mandeg) · **P2**
- **SUMBER:** TD-72 · **terverifikasi:** blok `CREATE TABLE public.sp_items` di `schema_snapshot.sql` = **0 hit** untuk `price_category`/`review_status`.
- **DAMPAK:** snapshot = "sumber kebenaran struktur DB" (`02_RULES_GOVERNANCE:21`) tapi **berbohong** soal `sp_items`. Sesi berikutnya yang percaya snapshot akan salah.
- **BLOKER:** `pg_dump` tak terpasang di mesin dev → **harus dijalankan Den manual**.
- **LANGKAH LANJUT:** jalankan command di `02_RULES_GOVERNANCE:75` (host **Seoul** `ap-northeast-2`). Catat TD-63: flag `--no-privileges` = GRANT/REVOKE tetap tak terekam.

#### S-07 · "Volume Terealisasi"/Outstanding basis import, bukan realisasi
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** TD-66 — `outstandingQty = qty - shippedQty` (`spCalc.js:24`); `sp_items.shipped_qty` di-set import (Closed/TROLLY=qty) + manual ShipmentModal + dispatch RPC. BTB (`sp_btb`) **tak dihubungkan** ke perhitungan volume.
- **DAMPAK:** angka "terealisasi" untuk data Indomarco mencerminkan **asumsi import**, bukan surat jalan/BTB tervalidasi → **cross-check Indomarco via BTB bisa tak cocok**. Berbahaya karena dipresentasikan ke customer.
- **BLOKER:** perlu keputusan makna angka. **LANGKAH:** definisikan ulang sumber "terealisasi" (dispatch/BTB), atau beri label jujur di UI.

#### S-08 · On-time / ketepatan waktu tak bisa dihitung
- **STATUS:** BELUM MULAI · **P2 (feature gap)** · **SUMBER:** TD-67 — `expired_date` hanya dibandingkan dgn `new Date()` (`spCalc.js:30-36`); **tak ada** perbandingan `expired_date` vs tanggal kirim/BTB aktual di codebase. **DAMPAK:** **jangan janjikan KPI on-time ke customer** sebelum ini dibangun. **LANGKAH:** simpan & bandingkan tanggal realisasi vs deadline.

#### S-09 · `sp_order_items` = cabang mati (basi setelah edit)
- **STATUS:** SELESAI-SEBAGIAN · **P2**
- **SUMBER:** `16_SP_TABLES_SYNC_AUDIT` · TD-40 · TD-49 — dual-write **hanya saat CREATE** (`create_sp_order_dual`); **EDIT** hanya menyentuh `sp_items` (`db.js:311-318`); `sp_order_items` **tak pernah dibaca** siapa pun; `shipped_qty`-nya tetap 0 selamanya.
- **DAMPAK:** tabel "kanonik" berisi data yang **divergen** dari kebenaran. Siapa pun yang kelak memigrasikan reader ke `sp_order_items` akan membaca data salah.
- **BLOKER:** keputusan strategi (pensiunkan `sp_items` vs buang `sp_order_items`).
- **LANGKAH LANJUT:** putuskan arah sebelum menambah investasi ke salah satu tabel.

#### S-10 · `removeRow` (hapus 1 item SP) bikin item kanonik yatim
- **STATUS:** BELUM MULAI · **P2** · **SUMBER:** TD-49 — `useSpItems.js:102` → `deleteSpItem` (hanya `sp_items`). Gated **super_admin-only** → dampak terbatas. **LANGKAH:** hapus juga di `sp_order_items` via `legacy_sp_item_id`, atau RPC dual (pola `delete_sp_dual` yang sudah ada).

#### S-11 · Dead code SP siap-drop
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** TD-41 · **H5** — 4 helper `sp_btbs` di `db.js` (**0 caller**), tabel `sp_btbs` (data sudah migrasi 186→205), `AppLauncher.jsx` (0 import). **LANGKAH:** hapus setelah verifikasi prod.

#### S-12 · `sp_order_items.shipped_qty` kanonik belum di-sync
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** TD-40 · **H6** — dispatch menulis `sp_items.shipped_qty`, belum yang kanonik. Map `legacy_sp_item_id` tersedia. **DAMPAK:** rendah (belum dibaca siapa pun) — tapi menambah divergensi S-09.

#### S-13 · Selisih data import belum diklarifikasi
- **STATUS:** NYANGKUT-BLOCKED · **P2** · **SUMBER:** `CLAUDE.md` Current Phase — **"selisih SP 431 vs 435 (Gigih)"** + **"mapping 30 item kontrak PKS Indomarco"**, keduanya bertanda **PERLU KONFIRMASI**. **DAMPAK:** angka dasar SP belum disepakati. **BLOKER:** menunggu klarifikasi Gigih/Indomarco. **PERLU KONFIRMASI DEN.**

#### S-14 · Tes runtime SP menumpuk
- **STATUS:** BELUM MULAI · **P2** · **SUMBER:** `10_TASK_BREAKDOWN` Completed FASE 0-3 (`:77`) — "sebagian terverifikasi user; sisanya **belum tes runtime penuh**"; ditambah 3 fix UI terbaru (reskin, lock-price, 2 fix input angka) yang semuanya **belum tes runtime**. **LANGKAH:** sesi verifikasi khusus.

#### S-15 · Flag finance lama (INV/FP/SUB/KRM) masih hidup di UI
- **STATUS:** SELESAI-SEBAGIAN · **P3** · **SUMBER:** `05_WORKFLOW_MAP:253` menandainya **USANG** ("BUKAN sumber kebenaran status"), `09_ROADMAP:44` menandai ⏸ — tapi kolomnya masih dipakai di Finance Status table Detail SP. **DAMPAK:** dua bahasa status berdampingan → membingungkan. **LANGKAH:** pensiunkan saat FASE 4-5 (S-02) jadi.

---

### ▌PRF (Procurement)

#### P-01 · Tak ada list/inbox → **draft PRF tak bisa dibuka lagi, selamanya**
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** `09_ROADMAP:55,70` · `10_TASK_BREAKDOWN` · `05_WORKFLOW_MAP:290-295` (Fase 3a) · **terverifikasi:** `src/modules/procurement/` berisi **tepat satu file** (`PRFFormPage.jsx`); `App.jsx:42` lazy-import, `:581`/`:939` menu, `:3120-3123` render form **saja**. Tak ada route/menu list.
- **DAMPAK:** **lebih parah dari sekadar "fitur belum ada".** Tombol "Simpan Draft" (`PRFFormPage.jsx:136`) menulis DRAFT ke DB yang **tak ada jalan untuk membukanya kembali** — dan form-nya sendiri create-only (P-02). Praktis: **fitur draft = jebakan kehilangan data.** Procurement juga tak punya cara melihat PRF yang di-submit → alur "sales bikin PRF → procurement kasih harga" **tak jalan di sistem**.
- **BLOKER:** tak ada (Fase 3a memang belum dijadwalkan).
- **LANGKAH LANJUT:** bangun list/inbox PRF (prioritas tertinggi modul ini). **Sementara belum ada, pertimbangkan sembunyikan tombol "Simpan Draft"** supaya user tak menyimpan sesuatu yang hilang.

#### P-02 · `PRFFormPage` create-only (tak ada jalur edit)
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** **terverifikasi:** signature `PRFFormPage({ onBack, showToast })` (`:142`) — tanpa `mode`/`prfId`; satu-satunya write = `.insert()` (`:371`); **nol** `.update()`. RLS `prf_update_draft` (`migrations/20260710000001_prf_fase0.sql:164`) mengizinkan owner mengedit saat DRAFT — **tak ada konsumen**.
- **DAMPAK:** salah ketik = bikin PRF baru (dan nomor urut hangus, lihat P-05). Menguatkan P-01.
- **LANGKAH LANJUT:** tambah mode edit (pola `InquiryFormPage` yang sudah punya `mode`/`inquiryId`).

#### P-03 · 3 dari 6 status PRF tak terjangkau; RLS menunggu konsumen
- **STATUS:** BELUM MULAI · **P1**
- **SUMBER:** **terverifikasi:** CHECK memuat `DRAFT/SUBMITTED/ACKNOWLEDGED/CANCELLED/QUOTED/EXPIRED` (`schema_snapshot.sql:3760`); **nol** kode di `src/` menulis `ACKNOWLEDGED`/`QUOTED`/`EXPIRED`. Policy `prf_update_status` (`prf_fase0.sql:172-178`) khusus procurement mengakui SUBMITTED — **tak dipakai siapa pun**.
- **DAMPAK:** mesin status PRF **separuh mati**; procurement tak bisa acknowledge. Infrastruktur (CHECK+RLS) sudah dibayar, jalan masuknya belum dibuat.
- **LANGKAH LANJUT:** satu paket dengan P-01 (inbox + tombol Acknowledge).

#### P-04 · Tak ada costing / gate margin di PRF
- **STATUS:** BELUM MULAI · **P2**
- **SUMBER:** `13_CRM_FLOW_AUDIT §4.1 A4` + tabel GAP — desain (`crm_workflow`, kini historis) memodelkan "Run Costing Sheet/BOM" + gate "FM Review: Margin & T&C"; **keduanya tak ada di kode**. PRF hanya `DRAFT`/`SUBMITTED` (2 tombol, `:136-137`).
- **DAMPAK:** PRICING_LANE yang dirancang tereduksi jadi **form input tanpa mesin costing & tanpa approval**. Harga quotation tetap diketik tangan (`13_CRM_FLOW_AUDIT §4.3 C2`).
- **BLOKER:** butuh desain besar (modul costing).
- **LANGKAH LANJUT:** putuskan apakah costing memang mau dibangun, atau proses ini memang manual di luar sistem. **PERLU KONFIRMASI DEN.**

#### P-05 · Nomor PRF hangus saat insert gagal
- **STATUS:** BELUM MULAI · **P3** · **SUMBER:** TD-48 — `generatePrfNo` memanggil `increment_document_sequence` **sebelum** INSERT; insert ditolak (RLS/validasi) → counter sudah naik → nomor bolong. **DAMPAK:** kosmetik (nomor tak rapat), bukan data rusak. **LANGKAH:** generate nomor **setelah** insert sukses, atau via trigger `BEFORE INSERT`. Pola sama berlaku di Inquiry/MOM/HRGA.

#### P-06 · FLAG UX: Custom butuh 2 syarat
- **STATUS:** NYANGKUT-BLOCKED · **P2** · **SUMBER:** `09_ROADMAP:70` · `05_WORKFLOW_MAP:295` — blok Custom muncul hanya bila `service_type='custom'` **DAN** add-on Custom Clearance dicentang; kalau tidak → blok tak muncul + hint. **BLOKER:** menunggu **user testing** untuk konfirmasi apakah ini membingungkan. **PERLU KONFIRMASI DEN.**

#### P-07 · Fase 3b cross-entity inbox ditunda
- **STATUS:** NYANGKUT-BLOCKED · **P2** · **SUMBER:** `09_ROADMAP:70` · `05_WORKFLOW_MAP:296` — butuh cabang RLS custom untuk role `procurement` lintas-3-entitas. **BLOKER:** keputusan + desain RLS; bergantung P-01 (inbox single-entity dulu). **CATATAN:** `super_admin` **sudah** lintas-entitas (fix RLS 10 Jul) — itu bypass standar, **bukan** Fase 3b.

#### P-08 · Role bisa buka form tapi ditolak saat Submit
- **STATUS:** SELESAI-SEBAGIAN · **P3** · **SUMBER:** `04_ROLE_PERMISSION_MATRIX:106` · `05_WORKFLOW_MAP:296` — menu `prf` terlihat `[sales,gm_bd,procurement,manager,ceo,admin,super_admin]` tapi **hanya sales/gm_bd** bisa insert (RLS `prf_insert`); role lain submit → toast error. Ditandai *by design*. **DAMPAK:** UX buruk (user isi form panjang lalu ditolak). **LANGKAH:** disable tombol Submit untuk role tanpa hak, atau sembunyikan menu.

---

### ▌DEPENDENCY (blocker dari modul lain)

#### D-01 · `can()` = `false` untuk `supervisor`, `gm_bd`, `sales_spv`
- **STATUS:** KLAIM-DONE-TAPI-MERAGUKAN (TD-64 under-scoped) · **P0**
- **SUMBER:** TD-64 (hanya menyebut `supervisor`) · **terverifikasi + DIPERLUAS:** `App.jsx:264-282` `ROLES` **tanpa** `supervisor`; `:284-301` `PERMISSIONS` **tanpa** `supervisor` **DAN tanpa `gm_bd`** (walau `gm_bd` ADA di `ROLES:269`); helper `:303` `can = (role,action) => PERMISSIONS[role]?.includes(action) ?? false`. `pricingAuthority` (**`QuotationFormPage.jsx:41`**, bukan `App.jsx`) merujuk `'sales_spv'` (`QuotationFormPage.jsx:44`) yang **tak ada di kedua list**.
- **DAMPAK:** **`gm_bd` — role yang baru dibuat khusus untuk CRM** — mendapat `false` untuk **setiap** aksi `can()`-gated, sama seperti `supervisor`. Keduanya bisa **melihat** menu (gate `role[]`) & data (RLS manager-level) tapi tombol aksinya mati → tampak seperti bug hak akses total. TD-64 menandai ini `supervisor`-only → **cakupan TD-nya salah**.
- **BLOKER:** tak ada. **LANGKAH:** tambah `supervisor` + `gm_bd` ke `PERMISSIONS` (mirror `manager`), rapikan `sales_spv`. Perluas teks TD-64.

#### D-02 · RLS RBAC-driven & 3 sistem permission belum sinkron
- **STATUS:** SELESAI-SEBAGIAN · **P0**
- **SUMBER:** TD-01 (PARTIAL) · TD-02 (VERIFY, `has_permission()` mungkin unseeded) · TD-06 — FE pakai `hasPermission(module,action)` **dan** `hasMenuPermission(menuKey,action)`, RLS pakai role hardcode → **tiga sumber kebenaran**.
- **DAMPAK:** gate menu CRM/PRF tak bisa dipercaya (banyak menu CRM ber-`menuKey` → bergantung seed DB). Akar dari D-01 & C-14.
- **BLOKER:** besar + risiko tinggi; prasyarat HRIS; butuh sesi fresh.
- **LANGKAH:** D1 (verifikasi `has_permission` seed) dulu — itu prasyarat TD-01.

#### D-03 · Nol test → refactor CRM tertahan
- **STATUS:** BELUM MULAI · **P1** · **SUMBER:** TD-07 · **E2** — belum ada Vitest+RTL. **DAMPAK:** memblokir C-23 (pecah file CRM) & TD-12. **LANGKAH:** mulai dari util murni (`spCalc`, `bant`, format).

#### D-04 · Edge Functions belum di-deploy
- **STATUS:** BELUM MULAI · **P1** · **SUMBER:** TD-21/TD-22 · **B1/B2** — `delete-user`/`reset-password` dibuat tapi belum deploy; `manage-schema`/`create-user` perlu re-deploy. **DAMPAK:** manajemen user (termasuk user CRM) pincang.

#### D-05 · 47 tabel tak beri SELECT ke `service_role`
- **STATUS:** SELESAI-SEBAGIAN · **P2** · **SUMBER:** TD-62 (PARTIAL — hanya `companies` di-fix) — termasuk tabel inti `sp_orders`, `sp_items`, `ar_ttfs`. **DAMPAK:** Edge Function apa pun yang menyentuh tabel itu gagal `permission denied`. Belum terasa (hanya aging-pipeline yang baca tabel bisnis). **BLOKER:** ⚠️ **jangan GRANT massal** sebelum akar diketahui (bisa hasil REVOKE yang disengaja).

---

## YANG NYANGKUT & KENAPA

| # | Item | Nunggu apa / siapa |
|---|---|---|
| **S-04④** | **Beku saat LUNAS** (harga & kategori terkunci saat SP lunas) | **Nunggu keputusan Den:** sinyal mana yang jadi acuan "lunas"? **(a)** `sp_orders.status='LUNAS'` via FASE 4-5 (**S-02, belum dibangun**) · **(b)** `ar_ttfs.tgl_pembayaran` (domain AR, lintas-domain) · **(c)** kolom status pelunasan baru diisi manual tim. Den semula menyebut (c), **tapi (c) bentrok dengan FASE 4-5** → dua sumber kebenaran pelunasan. **Kalau (b)/(c) dipilih, `05_WORKFLOW_MAP` wajib menyusul.** Catatan: guard beku di `sp_recompute_status` **sudah ada**, tapi hanya membekukan mesin status — bukan field UI. |
| **S-05** | Domain nilai `price_category` | **Keputusan Den:** satukan dengan CHECK `sp_order_items` (`semester/tahunan/project`) atau biarkan longgar (`default`/`legacy` ikut)? **Backfill (S-04①) menunggu ini** — kalau dibalik, harus diulang. |
| **C-01** | Quotation ACCEPTED | **Keputusan produk:** bikin aksi "Terima", atau nyatakan ACCEPTED mati & buang trigger. Ada **trigger DB live** yang menunggu. |
| **C-02** | NURTURE | **Keputusan produk:** kasih kolom Kanban / aturan aging / atau tutup pintu masuknya. 6 akun menggantung. |
| **C-10** | LOST lifecycle | **Butuh desain:** LOST masuk pool atau tempat sendiri? reaktivasi lewat mana? |
| **C-15** | `notification_rules` | **Keputusan:** bangun rule engine atau buang tabel (11 rule, 0 pembaca). |
| **S-06** | Refresh snapshot | **Nunggu Den** — `pg_dump` tak terpasang di mesin dev. Command: `02_RULES_GOVERNANCE:75`. |
| **S-13** | Selisih SP 431 vs 435 + mapping 30 item PKS Indomarco | **Nunggu klarifikasi Gigih / Indomarco.** |
| **P-04** | Costing / gate margin PRF | **Keputusan:** dibangun, atau memang manual di luar sistem? |
| **P-06** | Custom butuh 2 syarat | **Nunggu user testing.** |
| **P-07** | Fase 3b cross-entity | **Keputusan + desain RLS**; bergantung P-01. |
| **C-05** | Sign-off handover / TOP | **Konfirmasi:** approval manual di luar sistem, atau belum dibangun? |

---

## GAP DOKUMEN vs KENYATAAN

Semua diverifikasi langsung ke kode/schema/git. **Arah dominan: dokumen under-claim** (bilang "belum" padahal sudah) — ini membuat prioritas menyesatkan.

| # | Klaim dokumen | Kenyataan | Bukti | Jenis |
|---|---|---|---|---|
| 1 | **TD-37**: "AuditLogPage masih baca `user_login_logs`" | **SALAH** — membaca `audit_logs` | `AuditLogPage.jsx:102-103` (+header comment `:7`). `user_login_logs` hanya dibaca `activityFeed.js:93` (pemakaian sah, feed CRM) | **TD usang → layak ditutup** |
| 2 | **TD-64**: bug `PERMISSIONS` hanya `supervisor` | **Under-scoped** — `gm_bd` & `sales_spv` kena bug sama | `App.jsx:269` (gm_bd di ROLES) vs `:284-301` (tak di PERMISSIONS); `sales_spv` → `QuotationFormPage.jsx:44` (dalam `pricingAuthority` `:41`) | **Cakupan TD salah** |
| 3 | `09_ROADMAP:34`: Quotation "pricing authority BD-06" **✅** | **Over-claim** — enforcement nol, murni badge | `QuotationFormPage.jsx:679-684` (validate cuma inquiry_id), `:940-943` (badge saja) — sejalan TD-38 | **Over-claim** |
| 4 | **H7**: sub-item read-only "branch `fix/lock-price-edit-item`, **belum merge**" | **Sudah merge ke main** | `595ab51` ada di `git log main` | Under-claim (stale) |
| 5 | `00_DEV_JOURNEY:25`: reskin Detail SP "⚠️ di branch, **belum merge**" | **Sudah merge ke main** | `1ff0ffb` ada di `git log main` | Under-claim (stale) |
| 6 | `PROGRESS.md:66`: "RPC `delete_sp_dual` **BELUM live**" | **Ada di snapshot** + migrasi direkam | `grep delete_sp_dual schema_snapshot.sql` = 2 hit; `migrations/20260710000004_delete_sp_dual_rpc.sql` ada | Under-claim (stale) |
| 7 | `PROGRESS.md:75,84`: "snapshot STALE — belum ada tabel `prf`, `inquiry_id`, `is_manager_or_above`+gm_bd" | **Ketiganya SUDAH ada di snapshot** | `prf` `schema_snapshot.sql:3706`; `inquiry_id` `:3759`; `is_manager_or_above` memuat `'gm_bd'` | Under-claim (stale) |
| 8 | `PROGRESS.md:35`: aging-pipeline "semua di branch `feat/aging-pipeline` — **belum merge**" | **Sudah merged ke main** | `git branch --merged main` memuat `feat/aging-pipeline` | Under-claim (stale) |
| 9 | **TD-72**: snapshot stale utk `price_category` | **BENAR** (masih berlaku) | blok `CREATE TABLE public.sp_items` = **0 hit** utk `price_category`/`review_status` | ✅ akurat |
| 10 | `05_WORKFLOW_MAP:53`: ACCEPTED "label display saja, tanpa transisi UI" | **BENAR** | nol penulis `ACCEPTED`/`REJECTED` di `src/` | ✅ akurat |
| 11 | `09_ROADMAP:55`: PRF "Fase 1+2 ✅, list/inbox (3a) belum" | **BENAR**, tapi **dampaknya di-understate** | `src/modules/procurement/` = 1 file; draft tersimpan **tak bisa dibuka lagi** (P-01) | ✅ akurat, understated |

**Pola yang mengkhawatirkan:** 5 dari 11 (#4–#8) adalah klaim "belum merge/belum live/stale" yang **sudah beres**. Ini bukan sekadar kosmetik — `PROGRESS.md`/`DEV_JOURNEY` dipakai sebagai peta konteks antar-sesi (dan sesi ini sendiri hampir salah menyimpulkan karenanya). Sebaliknya #3 over-claim menandai fitur kontrol harga sebagai selesai padahal nol enforcement — itu yang paling berisiko dipakai untuk mengambil keputusan bisnis.

---

## URUTAN GARAP YANG DISARANKAN

### 🔴 SEGERA (P0/P1 — murah atau menahan yang lain)

- [ ] **D-01** — tambah `supervisor` + `gm_bd` ke `PERMISSIONS`/`ROLES` (`App.jsx:264-301`). **Paling murah, dampak besar**: `gm_bd` (role CRM baru) sekarang mati total di semua aksi `can()`. Sekalian perluas teks TD-64.
- [ ] **C-02** — tutup lubang NURTURE (minimal: buang dari `PIPELINE_STAGES` `ProspectFormPage.jsx:27` + migrasi 6 akun). Mencegah lead hilang diam-diam.
- [ ] **P-01 (mitigasi cepat)** — sembunyikan tombol "Simpan Draft" PRF sampai inbox ada. Draft sekarang = jebakan kehilangan data.
- [ ] **S-03** — `counts` badge tab SP dihitung dari himpunan terfilter. Angka menyesatkan saat presentasi ke Indomarco.
- [ ] **C-06** — RLS `rate_sheets` +`company_id`. **Wajib sebelum JCI/SOA input rate sheet.**
- [ ] **S-06** — Den jalankan `pg_dump` (snapshot berbohong soal `sp_items`).
- [ ] **KEPUTUSAN** — jawab 3 pertanyaan yang memblokir: **S-04④** (sinyal "lunas": a/b/c), **S-05** (domain `price_category`), **C-01** (ACCEPTED: bikin tombol atau buang trigger).

### 🟡 JANGKA PENDEK (P1/P2 — fitur inti)

- [ ] **P-01/P-02/P-03** — bangun **inbox PRF** + mode edit + tombol Acknowledge (satu paket). Tanpa ini alur sales→procurement tak jalan di sistem.
- [ ] **S-04①②** — dropdown kategori di EditItemModal + backfill `price_category` (**setelah S-05 diputuskan**).
- [ ] **C-03** — enforce margin/otoritas diskon (idealnya di RPC `save_quotation`) **atau** koreksi `09_ROADMAP:34` yang menandainya ✅.
- [ ] **C-09** — implementasikan `inquiries.status='QUOTED'` **atau** hapus teks yang berbohong.
- [ ] **S-01** — perketat RLS `USING(true)` bertahap (prioritas `sp_items`/`picking_lists`/`delivery_notes`); pola sudah ada di `sp_orders`.
- [ ] **S-07** — perjelas makna "Volume Terealisasi" (dispatch/BTB vs import) sebelum dipakai ke customer lagi.
- [ ] **C-22/S-14** — sesi verifikasi runtime (tumpukan "belum tes manual" sejak 2.10).
- [ ] **DOKUMEN** — bereskan 5 klaim stale (#4–#8) + tutup **TD-37** + perluas **TD-64**. Murah, dan bikin peta kerja bisa dipercaya lagi.

### 🟢 NANTI (P2/P3 — ada workaround / butuh fondasi)

- [ ] **D-03** (test) → prasyarat **C-23** (pecah file CRM raksasa).
- [ ] **S-02** (FASE 4-5 invoice/payment) — proyek besar; **membuka** S-04④ & S-15.
- [ ] **C-04** — desain jembatan handover→SP.
- [ ] **S-09/S-10/S-12** — putuskan arah `sp_items` vs `sp_order_items` sebelum menambah investasi.
- [ ] **C-08** — prefill PRF dari inquiry.
- [ ] **C-10** (LOST lifecycle), **C-15** (notification_rules), **P-04** (costing) — butuh keputusan/desain dulu.
- [ ] **C-17/S-11** — hapus dead code (`SalesCallsPage`, helper `sp_btbs`, `AppLauncher`).
- [ ] **C-18/C-19/C-21/P-05/P-08** — polish (label BANT, badge aging NEW, dropdown labels, rename tombol, nomor PRF, gate submit PRF).
- [ ] **C-13** — MOU upload (butuh desain penyimpanan dokumen dulu).
- [ ] **C-16** — drop `is_odoo_customer` bila Odoo batal.

---

## Catatan Wajib

Audit ini **tidak menjalankan app maupun DB**. Verifikasi sisi DB dilakukan terhadap **`supabase/schema_snapshot.sql` + `supabase/migrations/`** (schema ter-commit) — **bukan** instance produksi. Kalau produksi sudah drift dari snapshot (mis. constraint/trigger yang di-apply manual dan belum di-`pg_dump` — dan **S-06 membuktikan drift itu nyata untuk `sp_items`**), maka pernyataan DB pada **C-01, C-09, P-03** perlu dikonfirmasi ulang di SQL Editor. Item bertanda **PERLU KONFIRMASI DEN** (C-05, C-11, C-16, S-13, P-04, P-06) tak bisa dipastikan dari dokumen maupun kode — butuh keputusan atau informasi dari luar repo. Nomor baris per `main` @ `5fd2a09`.
