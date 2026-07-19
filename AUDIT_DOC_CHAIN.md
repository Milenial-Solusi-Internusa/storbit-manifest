# AUDIT — Rantai Dokumen: inquiry → PRF → quotation → sales_order

**Mode:** AUDIT read-only. Nol perubahan file/kode/DB. Scope: HANYA dua sambungan yang diusulkan — `quotations.prf_id` dan `sales_orders.quotation_id`.
**Sumber struktur DB:** `supabase/schema_snapshot.sql` (bukan migration lama).
**Tanggal:** 2026-07-20.
**Atribusi kejujuran:** semua klaim struktur DB & kode diverifikasi langsung ke file (baris dikutip). Jumlah baris data (Q10–Q12) **TIDAK dapat diverifikasi** di sesi ini (mode melarang jalankan SQL + tak ada kredensial DB) — ditandai eksplisit, tidak dikarang.

---

## RINGKASAN

**Rantai dokumen ini BUKAN rantai — ini roda berjari (hub-and-spoke) dengan `inquiries` sebagai poros.** Tiga dokumen hilir — PRF, quotation, sales_order — masing-masing menunjuk `inquiry_id` secara **independen**, bukan saling menunjuk satu sama lain. `prf.inquiry_id` (FK, `schema_snapshot.sql:8960`), `quotations.inquiry_id` (FK, `:9160`), dan `sales_orders.inquiry_id` (FK **NOT NULL**, `:9320` + `:4221`) semuanya sudah ada dan sudah dipakai. **Tidak ada** `quotations.prf_id`, **tidak ada** `sales_orders.quotation_id`. Jadi "putusnya" rantai bukan di data — inquiry sudah mengikat ketiganya — melainkan di **ketiadaan tautan langsung dokumen-ke-dokumen** yang bisa menjawab "quotation ini lahir dari PRF yang mana" dan "SO ini mengesahkan quotation yang mana".

**Risiko terbesar bukan menambah kolomnya, tapi kolom itu jadi sumber kebenaran KEDUA yang bisa melenceng dari poros inquiry.** Tidak ada satu pun mekanisme (constraint/trigger/kode) yang akan menjamin `prf.inquiry_id = quotations.inquiry_id` saat `quotations.prf_id` dipasang, maupun `quotation.inquiry_id = sales_orders.inquiry_id` saat `sales_orders.quotation_id` dipasang. Karena `sales_orders.inquiry_id` **NOT NULL dan sudah UNIK-per-inquiry** (`sales_orders_inquiry_unique_live`, `:7108`), menambahkan `quotation_id` di sampingnya menciptakan **dua jalur menuju inquiry yang sama** (langsung via `inquiry_id`, tak-langsung via `quotation_id → quotations.inquiry_id`) yang bisa saling bertentangan tanpa ada yang menjaga.

**Masalah kedua yang sama seriusnya: kolom tautan tidak punya jalan masuk UI untuk diisi.** Quotation **selalu** dibuat dari **picker inquiry** (`QuotationFormPage.jsx:1011`, wajib `:786`, tombol simpan mati tanpa inquiry `:1325`) — **tidak ada** jalur "Buat Quotation dari PRF" di seluruh `src/` (terverifikasi grep). SO **selalu** dibuat dari **picker inquiry** (`SalesOrderDocFormPage.jsx:131`), account diturunkan dari inquiry (`:89`) — **tidak ada** picker quotation. Jadi kalau kolom dipasang hari ini tanpa mengubah form, keduanya akan **selalu NULL** — kolom mati. Menyambung rantai = pekerjaan FE (flow + picker) + DB (kolom) + **RPC `save_quotation` wajib diubah** (jebakan write-through, lihat Temuan H-3), bukan sekadar DDL.

**Masalah ketiga: asimetri RLS yang sudah tercatat (TD-90) akan menular ke sambungan baru.** `procurement` bisa membaca `prf` (`prf_select` `:11518`) dan `sales_orders` (`sales_orders_select` `:11900`) tapi **TIDAK** bisa membaca `quotations` (`quotations_read` `:11718`). Akibatnya `quotations.prf_id` (arah quotation→PRF) aman untuk procurement, tapi `sales_orders.quotation_id` (arah SO→quotation) akan **diam-diam NULL untuk procurement** — persis pengulangan TD-90, tapi kini di embed FK langsung, bukan lagi query via `inquiry_id`.

---

## JAWABAN PER PERTANYAAN

### A. KEADAAN SEKARANG

**1. Nama tabel PRF + seluruh kolom.**
Tabel: **`public.prf`** (`schema_snapshot.sql:3739`). Kolom (verbatim `:3740–3793`):
`id` (uuid PK), `company_id` (uuid NOT NULL), `prf_no` (text NOT NULL), `status` (varchar DEFAULT 'DRAFT'), `created_by`, `updated_by`, `submitted_at`, `acknowledged_by`, `acknowledged_at`, `created_at`, `updated_at`, `deleted_at`, `customer_source` (text), `account_id` (uuid), `account_name_manual` (text), `stream` (text), `deadline_quotation` (date), `direction` (text), `commodity` (text), `hs_code` (text), `msds_available` (bool DEFAULT false), `service_type` (text), `incoterms` (text), `commercial_value` (numeric 14,2), `commercial_currency` (text), `origin` (text), `destination` (text), `pickup_address` (text), `delivery_address` (text), `add_on_services` (text[]), `add_on_others` (text), `cargo_ready_date` (date), `sea_freight_type` (text), `sea_container_types` (text[]), `sea_container_qty` (jsonb), `sea_lcl_gw` (numeric), `sea_lcl_dimension` (text), `sea_lcl_volume` (numeric), `sea_lcl_koli` (int), `air_gw`, `air_dimension`, `air_volume`, `air_koli`, `inland_fleet_types` (text[]), `inland_pickup_address`, `inland_delivery_address`, `inland_gw`, `inland_dimension`, `custom_doc_type` (text), `project_freight_types` (text[]), `project_qty` (int), `notes` (text), **`inquiry_id` (uuid)**. CHECK `prf_status_check`: status ∈ DRAFT/SUBMITTED/ACKNOWLEDGED/CANCELLED/QUOTED/EXPIRED (`:3793`).
**Tidak ada kolom yang menunjuk ke quotation.** Tautan hanya `inquiry_id` (FK `prf_inquiry_id_fkey`, `:8960`) dan `account_id` (FK `:8928`).

**2. Tabel `quotations`: kolom + FK + apakah sudah menyambung ke inquiry/PRF/account.**
Tabel `public.quotations` (`:4033`). Kolom (`:4034–4076`): `id`, `company_id` NOT NULL, `quotation_no` NOT NULL, `revision` (int DEFAULT 1), **`inquiry_id` (uuid)**, **`prospect_id` (uuid)**, **`customer_id` (uuid)**, `service_type`, `valid_until`, `payment_terms_id`, `currency_code`, `notes`, `terms`, `subtotal`, `tax_amount`, `total_amount`, `status` (varchar DEFAULT 'DRAFT', **tanpa CHECK** — free text, terverifikasi), `sent_at`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`, `usd_rate`, `route`, `pricing_done_at`, `quote_sent_at`, `discount_pct`, `margin_floor`, `internal_notes`, `quote_date`, `vat_rate` (DEFAULT 0.011), `attention_to`, `pickup_address`, `delivery_address`, `cargo_mode`, `gw`, `dimension`, `cw`, `cbm`, `container_type`, `container_qty`, `exchange_rates` (jsonb NOT NULL).
FK yang sudah ada: `inquiry_id → inquiries` (`:9160`), `customer_id → accounts` (`:9152`), `prospect_id → accounts` (`:9176`), `payment_terms_id → payment_terms` (`:9168`), `company_id`, `created_by`, `updated_by`.
**Menyambung ke inquiry: YA (`inquiry_id`). Ke account: YA (`customer_id` + `prospect_id`). Ke PRF: TIDAK — kolom `prf_id` TIDAK DITEMUKAN.**

**3. Tabel `sales_orders`: kolom + FK + apakah sudah ada `inquiry_id`.**
Tabel `public.sales_orders` (`:4216`). Kolom (`:4217–4231`): `id`, `company_id` NOT NULL, `so_no` NOT NULL, `status` (varchar NOT NULL DEFAULT 'DRAFT'), **`inquiry_id` (uuid NOT NULL)**, **`account_id` (uuid NOT NULL)**, `signed` (bool), `sign_link` (text), `signed_at`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`. CHECK `sales_orders_status_check`: status ∈ **DRAFT/SENT** saja (`:4231`).
FK: `inquiry_id → inquiries` (`:9320`), `account_id → accounts` (`:9296`), `company_id`, `created_by`, `updated_by`.
Index unik penting: **`sales_orders_inquiry_unique_live` = UNIQUE(`inquiry_id`) WHERE `deleted_at IS NULL`** (`:7108`) → **satu SO hidup per inquiry (hard constraint DB).**
**`inquiry_id` sudah ada dan NOT NULL. `quotation_id` TIDAK DITEMUKAN.**

**4. UI: quotation dibuat lewat mana + asal data.**
File: **`src/modules/crm/QuotationFormPage.jsx`**. Asal data: **dipilih dari INQUIRY** (picker), bukan dari account manual, bukan dari PRF.
- Picker inquiry: `:1011` (`<select value={header.inquiry_id} onChange={handleInquiryChange}>`), opsi di-fetch `:459`.
- `inquiry_id` **wajib**: validasi `:786` (`if (!header.inquiry_id) e.inquiry_id = 'Pilih inquiry'`), tombol Simpan disabled tanpa inquiry `:1325`.
- `prospect_id`/`customer_id` **diturunkan dari inquiry terpilih** (`selectedInquiry`), bukan diketik: create `:908–909`, edit `:850–851`.
- Tulis CREATE: `.from('quotations').insert(insertPayload)` `:940` lalu `.from('quotation_items').insert(itemRows)` `:945`. Tulis EDIT: RPC `save_quotation` `:882`.
- **`prf_id` tak ada di payload manapun** (`insertPayload` `:903+`, `p_header` `:846–880`). **Tidak ada prop `prf` / picker PRF di komponen** (signature `:367` hanya `quotation`, `duplicateFrom`).

**5. UI: sales order dibuat lewat mana + konfirmasi pakai inquiry picker.**
File: **`src/modules/sales-order/SalesOrderDocFormPage.jsx`**. **Konfirmasi: YA, pakai inquiry picker.**
- Picker inquiry (reuse `ProductPicker`): `:131`, opsi `:59`, fetch `:46`.
- `account_id` **diturunkan otomatis** dari inquiry (`customer_id ?? prospect_id`): `:89` (`derivedAccountId`).
- Tulis: `.from('sales_orders').insert({... inquiry_id: picked.id, account_id: derivedAccountId ...})` `:82–89`.
- Anti-dobel: cek SO live per inquiry `:71–79` (benteng 1) + tangkap unique violation `sales_orders_inquiry_unique_live` `:95–98` (benteng 2).
- **Tidak ada picker/kolom quotation.** SO tak pernah menunjuk quotation.

**6. Trigger / RPC / Edge Function yang menulis ke quotations atau sales_orders.**
- **RPC `public.save_quotation(p_quotation_id, p_header, p_items)`** (`:997`) — **UPDATE-in-place** quotation berdasarkan id + `DELETE`+`INSERT` ulang `quotation_items` (`:1046–1069`). **BUKAN insert baru** (CREATE quotation = direct insert di FE, lihat Q4). Menulis ~35 kolom header quotations secara eksplisit (`:1003–1038`) — **`prf_id` tidak ada dalam daftar** (implikasi: lihat H-3).
- **Trigger `trg_z_sync_deal_value_on_quotation_accept`** — AFTER UPDATE ON quotations (`:7451`) → fungsi `sync_deal_value_on_quotation_accept` (`:1345`, SECURITY DEFINER): saat `status` berubah jadi **`ACCEPTED`**, menulis `accounts.estimated_value = NEW.total_amount` via `prospect_id` (atau `customer_id`). Menulis ke `accounts`, bukan ke quotations/sales_orders. **Catatan penting: status `ACCEPTED` sudah menjadi penanda "quotation menang" di sistem** (lihat Opsi Desain).
- **Trigger `set_sales_orders_updated_at`** — BEFORE UPDATE ON sales_orders (`:7171`) → hanya `updated_at`.
- Edge Function menulis quotations/sales_orders: **TIDAK DITEMUKAN** (`supabase/functions/` hanya `manage-schema` yang menyebut nama tabel; itu tool skema, bukan penulis data bisnis). `db.js` juga **tidak** menulis kedua tabel (grep nol).

### B. RLS & GRANT

**7. Policy RLS lengkap `quotations` & `sales_orders`.**

`quotations` (3 policy — **tidak ada DELETE policy**):
- `quotations_insert` (`:11711`): `WITH CHECK ((company_id = get_user_company_id()) OR is_super_admin())`.
- `quotations_read` (`:11718`): `USING (((company_id = get_user_company_id()) AND (is_manager_or_above() OR (created_by = auth.uid()))) OR is_super_admin())`.
- `quotations_update` (`:11725`): USING & WITH CHECK sama seperti read.
- **DELETE: TIDAK ADA policy** → dengan RLS aktif, DELETE efektif ditolak untuk semua non-superuser (soft-delete via `deleted_at` di-`UPDATE`, jadi mungkin disengaja — tapi tetap **celah yang harus disadari**: tak ada jalur hard-delete quotation lewat klien).
- `quotation_items` (4 policy, `:11667–11694`): semua lewat sub-`EXISTS` ke `quotations` → **mewarisi RLS quotations** (kalau tak bisa baca quotation, tak bisa baca itemnya).

`sales_orders` (4 policy — lengkap):
- `sales_orders_insert` (`:11893`): `super OR (company AND created_by=auth.uid() AND (has_role('sales') OR has_role('gm_bd')))`.
- `sales_orders_select` (`:11900`): `super OR (company AND (created_by=auth.uid() OR has_role('procurement') OR is_manager_or_above()))`.
- `sales_orders_update` (`:11907`): `super OR (deleted_at IS NULL AND company AND created_by=auth.uid())`.
- `sales_orders_delete` (`:11886`): `super OR (company AND created_by=auth.uid())`.
**Policy hilang:** `quotations` **tak punya DELETE policy** (lihat di atas). `sales_orders` lengkap 4.

**8. Status TD-90: procurement bisa baca `quotations`?**
**TIDAK.** `quotations_read` (`:11718`) = `((company AND (is_manager_or_above() OR created_by=auth.uid())) OR super)`. Himpunan yang lolos: super_admin, manager-or-above, atau pembuat baris. **`procurement` bukan salah satunya** → diblokir. Policy yang menghalangi = **`quotations_read` itu sendiri** (tak ada cabang `has_role('procurement')`). TD-90 (`08_TECH_DEBT.md:117`) mengonfirmasi ini, status **OPEN — butuh keputusan forum**. Bandingkan: `prf_select` (`:11518`) DAN `sales_orders_select` (`:11900`) **keduanya memuat `has_role('procurement')`** → procurement bisa baca PRF & SO, tapi tidak quotation.

**9. Kalau `sales_orders.quotation_id` dipasang, panel/join mana yang kena efek RLS quotations? (konkret)**
- **`SalesOrderDocDetailPage.jsx`** — saat ini menarik history quotation **via `inquiry_id`** (`:101–103`, `WHERE inquiry_id = SO.inquiry_id`). Sudah kena TD-90 hari ini (panel bisa kosong utk procurement/sales-non-creator). Jika ada panel/embed baru "quotation sumber SO" via `quotation_id` (mis. `quotation:quotations!sales_orders_quotation_id_fkey(...)`), efeknya **identik**: RLS `quotations_read` menyaring → **baris SO tetap tampil, tapi objek quotation ter-embed jadi NULL untuk procurement** (PostgREST embed = left-join yang di-RLS-filter, tidak menggagalkan query induk). Jadi procurement melihat SO tapi kolom "Quotation" kosong — **tanpa pesan bahwa itu karena RLS**, bukan karena tak ada.
- **`sales_orders_select`** sendiri **tidak** terpengaruh (procurement tetap boleh baca baris SO; kolom `quotation_id` adalah uuid biasa, bukan join).
- Siapa pun yang **JOIN/embed quotations dari sales_orders** (list SO, detail SO, laporan lintas-dokumen) akan mewarisi batasan `quotations_read`: hanya super/manager+/creator-quotation yang melihat isi quotation tertaut. **Sales pembuat SO yang bukan pembuat quotation-nya pun bisa terblokir** (quotation dibuat orang lain). Ini bukan hipotetis — himpunan pembaca SO ≠ himpunan pembaca quotation.

### C. DATA EXISTING

**10. Berapa baris di `quotations` dan `sales_orders`?**
**TIDAK DAPAT DIVERIFIKASI di sesi ini** — mode audit melarang menjalankan SQL, dan tak ada kredensial DB. Tidak dikarang. Query untuk kamu jalankan:
```sql
SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS quotations_live, count(*) AS quotations_total FROM public.quotations;
SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS so_live, count(*) AS so_total FROM public.sales_orders;
```

**11. Untuk quotation existing, PRF induk bisa ditebak otomatis?**
**SEBAGIAN, TIDAK ANDAL.** Satu-satunya penghubung adalah `inquiry_id` yang sama: kandidat PRF = `prf WHERE inquiry_id = quotation.inquiry_id AND deleted_at IS NULL`. Tiga masalah membuat backfill otomatis tak aman:
- (a) **Ambigu bila >1 PRF per inquiry** — `prf` tak punya unique pada `inquiry_id`; satu inquiry bisa punya banyak PRF (revisi/multi-permintaan). Tak ada aturan memilih "PRF yang benar".
- (b) **Mustahil bila inquiry punya 0 PRF** — banyak quotation dibuat sebelum modul PRF ada; PRF-nya memang tak pernah ada.
- (c) **PRF legacy `inquiry_id` NULL** — per temuan sesi sebelumnya ada ≥2 PRF (`003`, `006`) `customer_source='customer'`, `inquiry_id` NULL (⚠️ **belum diverifikasi ulang via DB di sesi ini**). PRF ini tak akan pernah cocok lewat inquiry.
Kesimpulan: **hanya bisa best-effort match saat inquiry punya TEPAT 1 PRF live**; sisanya harus NULL. Query diagnosa (untuk kamu):
```sql
-- berapa inquiry punya >1 PRF (ambiguitas backfill quotation.prf_id)
SELECT inquiry_id, count(*) FROM public.prf WHERE deleted_at IS NULL AND inquiry_id IS NOT NULL GROUP BY inquiry_id HAVING count(*) > 1;
```

**12. Sama untuk `sales_orders` terhadap `quotations`.**
**SEBAGIAN, TIDAK ANDAL — bahkan lebih ambigu.** SO punya `inquiry_id` (unik-per-inquiry). Kandidat quotation = `quotations WHERE inquiry_id = SO.inquiry_id`. Tapi satu inquiry lazim punya **banyak** quotation (kolom `quotations.revision` ada → revisi berjilid; ditambah draft/duplicate). Tak ada aturan tunggal "quotation mana yang jadi dasar SO" **kecuali** memakai `status='ACCEPTED'` (penanda menang yang sudah dipakai trigger `:1351`). Jadi backfill terbaik = `quotations WHERE inquiry_id = SO.inquiry_id AND status='ACCEPTED'` — **tapi hanya andal bila tepat 1 quotation ACCEPTED per inquiry.** Bila 0 atau >1 ACCEPTED → tak bisa ditebak. Query diagnosa (untuk kamu):
```sql
SELECT so.id, count(q.*) AS accepted_matches
FROM public.sales_orders so
LEFT JOIN public.quotations q ON q.inquiry_id = so.inquiry_id AND q.status='ACCEPTED' AND q.deleted_at IS NULL
WHERE so.deleted_at IS NULL GROUP BY so.id;
```

### D. KEPUTUSAN DESAIN

**13. Kardinalitas sebenarnya (berbasis bukti).**
- **PRF → quotation = 1 : 0..N.** Bukti: (i) `prf` maupun `quotations` tak punya unique pada `inquiry_id`; (ii) `quotations.revision` (`:4037`) menandakan banyak baris quotation per kesepakatan; (iii) status PRF `QUOTED` (`:3793`) menandakan "satu PRF menghasilkan quotation" tapi tak membatasi jumlahnya. Satu permintaan harga (PRF) bisa melahirkan beberapa revisi quotation. Sebaliknya, apakah **satu quotation menarik dari >1 PRF** (multi-leg): **tak ada bukti di kode** — anggap 1 quotation ← ≤1 PRF (link tunggal di sisi quotation cukup). → **`quotations.prf_id` tunggal-nullable sudah mencukupi arah ini.**
- **quotation → sales_order = 1 : 0..1.** Bukti keras: `sales_orders_inquiry_unique_live` (`:7108`) = **maksimum 1 SO hidup per inquiry**. Karena semua quotation sebuah inquiry berbagi `inquiry_id` itu, praktis **1 inquiry → banyak quotation → paling banyak 1 SO**. SO harus menunjuk **satu** quotation "pemenang" (yang `ACCEPTED`). Jadi satu quotation menghasilkan **0 atau 1** SO. → **`sales_orders.quotation_id` tunggal-nullable sudah mencukupi.**

**14. `sales_orders` SUDAH punya `inquiry_id` (NOT NULL, unik-live) — risiko menambah `quotation_id` berdampingan?**
**Risiko: DESYNC, ya — bisa.** Setelah `quotation_id` dipasang, ada **dua jalur** dari SO ke inquiry: langsung (`sales_orders.inquiry_id`) dan tak-langsung (`quotation_id → quotations.inquiry_id`). Tak ada apa pun yang menjamin keduanya sama. Bug FE, edit manual, atau pemilihan quotation dari inquiry lain → `SO.inquiry_id ≠ quotation.inquiry_id` = rantai dokumen bertentangan yang **tak terdeteksi** (tak ada error, cuma data salah — kelas kegagalan senyap).
Opsi + trade-off:
- **(14-A) Nullable, tanpa penegakan.** Termurah. Desync mungkin; hanya dijaga disiplin FE. Cocok kalau FE selalu menurunkan quotation dari inquiry yang sama (bisa dijamin di form). Trade-off: tak ada jaring pengaman DB.
- **(14-B) Nullable + trigger validasi** `BEFORE INSERT/UPDATE ON sales_orders`: bila `NEW.quotation_id IS NOT NULL`, pastikan `(SELECT inquiry_id FROM quotations WHERE id=NEW.quotation_id) = NEW.inquiry_id`, else RAISE. Menutup desync di level DB. Trade-off: +1 trigger, +1 query per tulis SO (murah, SO jarang).
- **(14-C) Jangan simpan `inquiry_id` DAN `quotation_id` dua-duanya; turunkan inquiry dari quotation.** DITOLAK sebagai rekomendasi: `sales_orders.inquiry_id` NOT NULL + unik-live + dipakai luas (anti-dobel `SalesOrderDocFormPage.jsx:71–98`, history `SalesOrderDocDetailPage.jsx:101`, index `:7108`). Mencabutnya = operasi berisiko tinggi di luar scope.
- **(14-D) Jangan tambah `quotation_id` sama sekali** — pakai `inquiry_id` + `quotations.status='ACCEPTED'` untuk menemukan quotation pemenang (lihat Opsi Desain SO). Nol kolom, nol desync. Trade-off: bergantung disiplin "tepat 1 ACCEPTED per inquiry" (belum ada constraint yang menjamin).

**15. Kolom baru nullable atau NOT NULL?**
**Keduanya WAJIB nullable.** Alasan konkret:
- `quotations.prf_id`: baris quotation existing **tak punya** PRF (Q11); banyak dibuat pra-PRF; sebagian PRF `inquiry_id` NULL. `NOT NULL` akan (i) **menolak seluruh baris lama** saat ALTER (butuh backfill lengkap dulu — mustahil andal, Q11), dan (ii) **memaksa setiap quotation punya PRF** padahal form membuat quotation dari inquiry, bukan PRF. → nullable, isi belakangan lewat flow baru.
- `sales_orders.quotation_id`: SO existing dibuat dari inquiry tanpa tautan quotation (Q5). `NOT NULL` **memecah form SO yang sekarang jalan** (insert `:82–89` tak menyertakan quotation_id) dan menolak baris lama. → nullable.
- Konsekuensi nullable: laporan/JOIN harus tahan NULL (kolom kosong = "belum ditautkan", bukan error). Kalau kelak mau mewajibkan, tegakkan **di FE dulu** (mode create), jangan lewat `NOT NULL` DB, agar baris historis & draft tak pecah — pola yang sudah dipakai di repo ini (mis. `inquiry_id` PRF diwajibkan di FE, bukan constraint).

---

## TEMUAN & RISIKO

| ID | Severity | Temuan |
|----|----------|--------|
| **C-1** | **CRITICAL** | **Kolom tautan tak punya jalan masuk UI → akan selalu NULL (kolom mati).** Quotation hanya dibuat dari picker inquiry (`QuotationFormPage.jsx:1011/786/1325`); **tidak ada** jalur "Buat Quotation dari PRF" di `src/` (grep nol). SO hanya dibuat dari picker inquiry (`SalesOrderDocFormPage.jsx:131`); tidak ada picker quotation. Memasang DDL saja = kolom yang tak pernah terisi. Menyambung rantai **wajib** disertai perubahan flow FE. |
| **H-2** | **HIGH** | **Desync poros ganda.** Tak ada constraint/trigger yang menjamin `prf.inquiry_id = quotation.inquiry_id` (untuk `prf_id`) maupun `quotation.inquiry_id = SO.inquiry_id` (untuk `quotation_id`). `sales_orders.inquiry_id` NOT NULL + unik-live berdampingan `quotation_id` = dua jalur ke inquiry yang bisa bertentangan senyap (Q14). |
| **H-3** | **HIGH** | **Jebakan write-through RPC `save_quotation`.** CREATE quotation = direct insert (`:940`), tapi **EDIT = RPC `save_quotation`** (`:882`) yang meng-UPDATE **daftar kolom eksplisit** (`:1003–1038`). Kalau `prf_id` diisi saat create tapi RPC **tidak** diperluas untuk menulis `prf_id`, maka **edit pertama pada quotation akan membiarkan `prf_id` apa adanya** — sebenarnya aman (kolom tak disebut = tak ditimpa), TAPI kalau nanti seseorang menaruh `prf_id` di `p_header` tanpa menambah baris `COALESCE`, nilainya **diam-diam diabaikan** (silent no-op). Pola persis yang sudah menggigit repo ini (2.11S). RPC WAJIB diperbarui berbarengan. |
| **H-4** | **HIGH** | **RLS asimetris menular ke `sales_orders.quotation_id` (perpanjangan TD-90).** `procurement` boleh baca SO tapi TIDAK boleh baca quotations (`quotations_read` `:11718` tanpa cabang procurement). Embed quotation dari SO akan **NULL senyap** untuk procurement (Q9). Arah sebaliknya (`quotations.prf_id` → embed prf) **aman** karena `prf_select` memuat procurement. |
| **M-5** | **MEDIUM** | **Backfill data lama tak bisa otomatis-andal** (Q11/Q12): inquiry bisa punya >1 PRF dan >1 quotation (revisi). Match hanya aman saat "tepat 1" — sisanya NULL. Jangan janjikan migrasi data mulus. |
| **M-6** | **MEDIUM** | **`quotations` tak punya DELETE policy** (`:11711–11725` hanya insert/read/update). Bukan blocker sambungan, tapi relevan: menautkan `sales_orders.quotation_id → quotations(id)` dengan FK default (NO ACTION) berarti quotation yang **hard-delete** akan tertahan FK — praktiknya quotation di-soft-delete (`deleted_at`), jadi FK NO ACTION tak menjaga apa-apa terhadap soft-delete (SO bisa menunjuk quotation ber-`deleted_at`). Pilih `ON DELETE SET NULL` + sadar bahwa soft-delete tak memicu FK. |
| **M-7** | **MEDIUM** | **`quotation.status` free-text (tanpa CHECK).** Strategi "quotation pemenang = status ACCEPTED" (Opsi SO-B) bergantung pada nilai string yang tak dijaga constraint; salah ketik/kapitalisasi tak tertangkap. Trigger `:1351` juga menyamakan pada literal `'ACCEPTED'`. |
| **L-8** | **LOW** | **Tak ada index pada `quotations.inquiry_id`** (`:6905–6919` hanya company/prospect/status), padahal `SalesOrderDocDetailPage.jsx:101` dan backfill query menyaring by `inquiry_id`. Di luar scope dua kolom, tapi kalau menambah index untuk kolom baru, sekalian pertimbangkan `inquiry_id`. |

---

## OPSI DESAIN (pilih sendiri — tidak kupilihkan)

### Sambungan 1 — `quotations.prf_id` (arah quotation → PRF)

**Opsi Q-A — Kolom FK + flow "Buat Quotation dari PRF".**
`quotations.prf_id` nullable + FK. Tambah entry di UI: dari Detail PRF (SUBMITTED/ACKNOWLEDGED) tombol "Buat Quotation" → buka `QuotationFormPage` dengan `prf_id` terisi + inquiry di-preset dari `prf.inquiry_id`. Tulis `prf_id` di `insertPayload` (create) **dan** `p_header` + baris `COALESCE` di `save_quotation` (edit).
- (+) Tautan bermakna, di-set saat niat jelas; PRF status bisa dinaikkan ke `QUOTED`.
- (−) Pekerjaan FE nyata (entry + preset + validasi 1 inquiry); wajib ubah RPC (H-3).

**Opsi Q-B — Kolom FK + picker PRF opsional di form quotation.**
Di `QuotationFormPage`, setelah inquiry dipilih, tampilkan dropdown PRF **yang inquiry-nya sama** (`prf WHERE inquiry_id = header.inquiry_id`), opsional. Auto-pilih bila hanya 1.
- (+) Menjaga invarian `prf.inquiry_id = quotation.inquiry_id` secara natural (picker sudah difilter by inquiry); minim entry baru.
- (−) Sales bisa lupa mengisi → banyak NULL; tetap wajib ubah RPC (H-3).

**Opsi Q-C — Tanpa kolom; resolusi via `inquiry_id` bersama.**
Nol perubahan skema. "PRF untuk quotation ini" dihitung saat query: `prf WHERE inquiry_id = quotation.inquiry_id`.
- (+) Nol desync, nol migrasi, nol RPC. Poros inquiry sudah mengikat.
- (−) Ambigu bila >1 PRF/inquiry (Q11) — tak bisa menyatakan "PRF X **yang ini**"; tak bisa menaikkan PRF ke QUOTED secara tepat-sasaran.

### Sambungan 2 — `sales_orders.quotation_id` (arah SO → quotation)

**Opsi SO-A — Kolom FK + trigger konsistensi + picker quotation.**
`sales_orders.quotation_id` nullable + FK + **trigger validasi** `quotation.inquiry_id = SO.inquiry_id` (menutup H-2). FE: di form SO, setelah inquiry dipilih, pilih quotation `ACCEPTED` milik inquiry itu (auto bila 1).
- (+) Tautan tegas + dijaga DB; menjawab "SO ini dasar quotation mana".
- (−) Paling banyak kerja; +trigger; wajib tangani RLS H-4 (procurement lihat NULL).

**Opsi SO-B — Tanpa kolom; "quotation pemenang = ACCEPTED per inquiry".**
Nol skema. SO sudah menunjuk inquiry; quotation dasar = `quotations WHERE inquiry_id = SO.inquiry_id AND status='ACCEPTED'`. Trigger `sync_deal_value` (`:1351`) sudah memperlakukan ACCEPTED sebagai status final.
- (+) Nol desync (satu poros), nol migrasi, memakai mekanisme yang sudah ada.
- (−) Bergantung "tepat 1 ACCEPTED per inquiry" tanpa constraint (M-7); status free-text (M-7); tak ada FK formal untuk laporan.

**Opsi SO-C — Kolom FK nullable, tanpa penegakan (minimalis).**
Hanya DDL + isi dari FE. Tanpa trigger.
- (+) Cepat.
- (−) Desync mungkin (H-2); RLS H-4 tetap; paling rapuh.

> **Catatan auditor (jujur):** Opsi **Q-C / SO-B** layak dipertimbangkan serius sebelum menambah kolom. Rantai ini **sudah** tersambung lewat `inquiry_id` di ketiga dokumen; menambah FK langsung memberi ketegasan "dokumen-ke-dokumen" **dengan menukar** permukaan desync + kerja FE + perubahan RPC/RLS. Pertanyaan yang harus kamu jawab dulu: **apakah kamu butuh menyatakan "PRF/quotation SPESIFIK yang mana", atau cukup "terkait via inquiry yang sama"?** Kalau jawabannya "via inquiry cukup", dua kolom ini tak perlu dibangun.

---

## DRAFT SQL (JANGAN DIJALANKAN — untuk review)

> Semua nullable (Q15). FK `ON DELETE SET NULL` (M-6). Grant kolom: **tak perlu** — kolom mewarisi GRANT tabel; RLS baris tetap dari policy yang ada.

```sql
-- ============ Sambungan 1: quotations.prf_id ============
ALTER TABLE public.quotations ADD COLUMN prf_id uuid;                       -- nullable
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_prf_id_fkey FOREIGN KEY (prf_id)
  REFERENCES public.prf(id) ON DELETE SET NULL;
CREATE INDEX idx_quotations_prf_id ON public.quotations USING btree (prf_id);

-- WAJIB berbarengan (H-3): perluas RPC save_quotation agar EDIT menulis prf_id.
-- Tambahkan SATU baris di dalam UPDATE ... SET (reproduksi utuh fungsi saat eksekusi):
--   prf_id = COALESCE(NULLIF(p_header->>'prf_id','')::uuid, prf_id),

-- OPSIONAL (Opsi Q-B, jaga invarian inquiry): trigger konsistensi
-- CREATE FUNCTION public.chk_quotation_prf_inquiry() RETURNS trigger AS $$
-- BEGIN
--   IF NEW.prf_id IS NOT NULL AND NEW.inquiry_id IS NOT NULL
--      AND (SELECT inquiry_id FROM public.prf WHERE id = NEW.prf_id) IS DISTINCT FROM NEW.inquiry_id
--   THEN RAISE EXCEPTION 'prf.inquiry_id != quotation.inquiry_id'; END IF;
--   RETURN NEW; END; $$ LANGUAGE plpgsql;
-- CREATE TRIGGER trg_z_chk_quotation_prf_inquiry BEFORE INSERT OR UPDATE ON public.quotations
--   FOR EACH ROW EXECUTE FUNCTION public.chk_quotation_prf_inquiry();

-- RLS quotations: TIDAK perlu diubah untuk kolom ini (embed prf memakai prf_select yang sudah memuat procurement).

-- ============ Sambungan 2: sales_orders.quotation_id ============
ALTER TABLE public.sales_orders ADD COLUMN quotation_id uuid;              -- nullable
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_quotation_id_fkey FOREIGN KEY (quotation_id)
  REFERENCES public.quotations(id) ON DELETE SET NULL;
CREATE INDEX idx_sales_orders_quotation_id ON public.sales_orders USING btree (quotation_id);

-- OPSIONAL tapi DIREKOMENDASIKAN bila pakai Opsi SO-A (tutup H-2): trigger konsistensi inquiry
-- CREATE FUNCTION public.chk_so_quotation_inquiry() RETURNS trigger AS $$
-- BEGIN
--   IF NEW.quotation_id IS NOT NULL
--      AND (SELECT inquiry_id FROM public.quotations WHERE id = NEW.quotation_id) IS DISTINCT FROM NEW.inquiry_id
--   THEN RAISE EXCEPTION 'quotation.inquiry_id != sales_orders.inquiry_id'; END IF;
--   RETURN NEW; END; $$ LANGUAGE plpgsql;
-- CREATE TRIGGER trg_z_chk_so_quotation_inquiry BEFORE INSERT OR UPDATE ON public.sales_orders
--   FOR EACH ROW EXECUTE FUNCTION public.chk_so_quotation_inquiry();

-- ⚠️ RLS/TD-90 (H-4): kalau panel SO meng-embed quotation via quotation_id, procurement akan
--    melihat NULL. Keputusan forum TD-90 (longgarkan quotations_read utk procurement?) HARUS
--    diambil TERPISAH sebelum mengandalkan embed itu. JANGAN longgarkan RLS diam-diam.
```

**Yang TIDAK ada di draft (sengaja):** perubahan `quotations_read` (itu ranah TD-90 — keputusan forum, bukan efek samping task ini); `NOT NULL`; backfill data (tak andal, Q11/Q12).

---

## URUTAN EKSEKUSI AMAN

Prinsip repo: **kode yang berhenti/mulai baca kolom DULU vs SQL kemudian**, scope kecil, verifikasi tiap langkah. Untuk MENAMBAH kolom + flow, urutannya **DB dulu (nullable, non-destruktif) baru FE** — kebalikan dari drop kolom.

1. **Putuskan dulu (kamu):** butuh FK langsung (Q-A/B, SO-A/C) atau cukup poros inquiry (Q-C, SO-B)? Kalau cukup poros inquiry → **berhenti, tak ada langkah DB/FE**. Ini keputusan paling menentukan.
2. **(Bila lanjut FK) DB — kolom nullable + FK + index**, satu sambungan dulu (mis. `quotations.prf_id`). Non-destruktif, baris lama aman (nullable). Jalankan manual di SQL Editor, verifikasi `\d quotations`.
3. **DB — perluas RPC `save_quotation`** menambah baris `prf_id` (H-3) **sebelum** FE menulis `prf_id`. Tanpa ini, edit quotation mengabaikan `prf_id` secara senyap.
4. **DB — (opsional) trigger konsistensi inquiry** (Q-B/SO-A) untuk menutup H-2. Uji dengan insert yang sengaja salah → harus RAISE.
5. **FE — jalur tulis:** tambah `prf_id` ke `insertPayload` (`QuotationFormPage.jsx:903+`) dan `p_header` (`:846`). Untuk SO: tambah `quotation_id` ke insert (`SalesOrderDocFormPage.jsx:82`).
6. **FE — jalur isi (entry/picker):** flow "Buat Quotation dari PRF" atau picker PRF terfilter-inquiry (Q-A/B); picker quotation ACCEPTED terfilter-inquiry (SO-A). Tanpa langkah ini kolom tetap NULL (C-1).
7. **FE — jalur baca:** panel yang menampilkan tautan. **Sebelum** meng-embed quotation dari SO, selesaikan TD-90 (H-4) atau gunakan pesan netral yang sudah ada (`SalesOrderDocDetailPage`) supaya procurement tak salah paham "kosong".
8. **Verifikasi:** `npm run build` clean + lint net-zero; uji runtime tiap peran (sales pembuat, sales lain, procurement, manager, super) untuk memastikan visibilitas sesuai harapan.
9. **Refresh `schema_snapshot.sql` via `pg_dump`** setelah SQL live (kolom + FK + index + RPC + trigger), lalu ulangi untuk sambungan kedua dari langkah 2.
10. **JANGAN** backfill massal otomatis (M-5); kalau perlu isi historis, lakukan per-baris terverifikasi hanya untuk kasus "tepat 1" (Q11/Q12), sisanya biarkan NULL.

---

*Audit murni observasi. Tidak ada file lain disentuh, tidak ada SQL dijalankan. Angka baris data (Q10–12) dan keberadaan 2 PRF legacy (Q11c) belum diverifikasi ulang via DB di sesi ini — ditandai eksplisit.*
