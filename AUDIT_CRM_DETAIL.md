# AUDIT — Halaman Detail CRM (DealDetailPage & CustomerDetailPage) — kondisi APA ADANYA

> Read-only. Sumber: `src/modules/crm/DealDetailPage.jsx`, `src/modules/crm/CustomerDetailPage.jsx`, `src/App.jsx`, `supabase/schema_snapshot.sql`, `docs/Governance/08_TECH_DEBT.md` (TD-90). Tanggal: 2026-07-19 (branch `feat/crm-nav-tahap2c`, di atas `main`@b857adf).
> Sifat: **pemetaan, bukan usulan**. Tiap klaim ada `file:line` atau nama objek DB. Yang tak bisa dipastikan dari kode ditandai eksplisit + disertai query SELECT untuk dijalankan manual. **NOL file kode/DB diubah.** Satu-satunya file yang dibuat = dokumen ini.
> Singkatan: **DDP** = `DealDetailPage.jsx`, **CDP** = `CustomerDetailPage.jsx`, **App** = `src/App.jsx`, **snap** = `supabase/schema_snapshot.sql`.

---

## RINGKASAN — kondisi kedua halaman sekarang

**DealDetailPage adalah halaman "detail deal per-inquiry", tapi mayoritas isinya sebenarnya milik AKUN, bukan inquiry.** Halaman dibuka dengan membawa satu `inquiryId` (DDP:400), lalu me-resolve akun lewat `inquiry.prospect_id` (DDP:431). Dari 8 blok yang dirender, hanya **3 yang benar-benar terikat inquiry** (kartu "Detail Inquiry", "Daftar Quotation", "Daftar PRF" — dua terakhir di-query `WHERE inquiry_id`), sementara **Stepper 7-stage, "Nilai Deal", badge stage, assignee, est. closing, tombol Edit Deal, Pindah Stage, dan kartu "Aktivitas Terkait" semuanya membaca kolom di baris `accounts`** (DDP:503-506, 573, 575-585, 641-663). Karena satu akun bisa punya banyak inquiry (premis: SUNWAY TREK MASINDO = 11 inquiry — **belum diverifikasi dari DB**, query di §6), blok-blok akun itu **identik dan diulang** di setiap halaman inquiry, dan `accounts.pipeline_stage`/`estimated_value` hanya **satu nilai per akun** (snap: `pipeline_stage` hanya ada di tabel `accounts`, index `idx_prospects_pipeline_stage`) — jadi "deal" secara data model = akun, bukan inquiry.

**CustomerDetailPage adalah halaman "detail akun" bertab (7 tab), dan hampir seluruh isinya memang akun-level.** Ia fetch satu baris `accounts` + embed (CDP:458-467), lalu menampilkan Info Dasar, Komersial, History Visit, Aktivitas, BANT & Pipeline, Health Score, dan Notes — semua bersumber dari baris `accounts` yang sama atau dari `activities WHERE account_id` (CDP:493-499, 531-536). **Yang tidak ada di CustomerDetailPage: daftar Quotation, daftar PRF, daftar Sales Order, dan stepper pipeline penuh.** Jadi riwayat komersial per-akun (quotation/PRF/SO) **tidak pernah teragregasi** di halaman akun; ia hanya muncul sepotong-sepotong di DealDetailPage per-inquiry.

**Tumpang tindih terbesar antara keduanya = data akun yang dibaca dua kali dengan query berbeda.** Keduanya membaca `accounts` (DDP baca subset kolom tanpa embed di DDP:434; CDP baca `*` + 3 embed di CDP:460-465) dan keduanya membaca `activities` dengan sumbu filter yang sama (`account_id`) tapi limit/tipe berbeda (DDP: limit 5, semua tipe; CDP: limit 200 semua tipe + limit 50 `type='visit'`). `pipeline_stage`, `estimated_value`, identitas akun, dan aktivitas semuanya muncul di dua tempat.

**Fakta paling tidak nyaman untuk tahap 3: RLS baris-per-baris membuat "riwayat lengkap satu akun" TIDAK lengkap untuk sebagian role.** `inquiries`, `quotations`, dan `activities` semuanya di-SELECT dengan pola `is_manager_or_above() OR created_by/assigned_to = auth.uid()` (snap, §7). Artinya **role `sales` hanya melihat inquiry/quotation/aktivitas yang IA sendiri buat/di-assign** — kalau satu akun dikerjakan >1 sales (atau di-reassign), timeline "lengkap" itu terpotong per orang. `procurement` bahkan **tidak bisa membaca `quotations` sama sekali** (TD-90) maupun `inquiries`/`activities`. Jadi menaikkan panel ke halaman akun **tidak otomatis memberi riwayat utuh** — kelengkapannya bergantung role, dan itu keputusan kebijakan, bukan sekadar refactor UI.

---

## PETA DEALDETAILPAGE — panel per panel

Props diterima (DDP:400): `inquiryId`, `onBack`, `onCreateQuotation`, `onViewQuotation`, `onEditInquiry`, `onCreatePRF`, `showToast`.
State internal (DDP:402-413): `loading`, `notFound`, `inquiry`, `account`, `quotations`, `prfs`, `activities`, `profMap`, `termMap`, `assignees`, `editOpen`, `reloadKey`.

| # | Panel / blok | file:line (render / komponen) | Data ditampilkan | Sumber (tabel + query + embed) | Milik **inquiry / akun / campuran** |
|---|---|---|---|---|---|
| 1 | **Stepper** 7-stage chevron | DDP:573 render · komp DDP:154 | Stage aktif + probabilitas + nilai (per stage) | `accounts.pipeline_stage` (DDP:503), `accounts.estimated_value` (DDP:504) | **AKUN** |
| 2 | **Header** (nama, badge stage, no inquiry, assignee, est closing, Nilai Deal) | DDP:575 render · komp DDP:284 | `name`, StageBadge, `inquiry_no`, nama assignee, est closing, Nilai Deal | `accounts` (name/pipeline_stage/estimated_closing_date/estimated_value, DDP:576-581) + `inquiries.inquiry_no` (DDP:578) + `profiles` (profMap, DDP:463-468) | **CAMPURAN** (akun, kecuali `inquiry_no`) |
| 3 | **"Nilai Deal"** (angka besar di header) | DDP:322-324 | `estimated_value` | `accounts.estimated_value` (DDP:504) | **AKUN** |
| 4 | Tombol **Pindah Stage** (dropdown 7 stage) | DDP:329-349 · handler `pickStage` DDP:527 → `updateAccount` DDP:509 | — (aksi) | `UPDATE accounts SET pipeline_stage` (DDP:511) + audit `CHANGE_PIPELINE_STAGE` (DDP:514) | **AKUN** (aksi tulis) |
| 5 | Tombol **Edit** → EditDealModal | DDP:327 → komp DDP:219 render DDP:777 · handler `saveEdit` DDP:533 | stage, assigned, estimated_value, closing | `UPDATE accounts SET pipeline_stage/assigned_profile/estimated_value/estimated_closing_date` (DDP:534-538) | **AKUN** (aksi tulis) |
| 6 | Kartu **"Detail Inquiry"** (+ tombol Edit Inquiry) | DDP:590-639 | service_type, status, POL→POD, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, additional_services, deadline_quote, route, commodity, dibuat oleh, created_at, notes | `inquiries` single row (DDP:423-426), `profiles` utk "Dibuat Oleh" (DDP:463) | **INQUIRY** |
| 7 | Kartu **"Aktivitas Terkait"** (5 terbaru) | DDP:641-663 | type, contact_name, notes/outcome, created_at | `activities` **WHERE account_id = inq.prospect_id**, limit 5 (DDP:454-458) | **AKUN** (difilter `account_id`, **bukan** inquiry) |
| 8 | Kartu **"Daftar Quotation"** (+ tombol Buat Quotation) | DDP:668-712 | quotation_no, created_at, total_amount, status; aksi Eye(view)/Download(disabled) | `quotations` **WHERE inquiry_id = inq.id**, limit 1000 (DDP:439-443) | **INQUIRY** (di-query per inquiry; DB punya FK akun langsung — lihat §6) |
| 9 | Kartu **"Daftar PRF"** (+ tombol Cetak PRF, role sales/gm_bd) | DDP:714-754 | prf_no, created_at, service_type, status | `prf` **WHERE inquiry_id = inq.id**, limit 200 (DDP:446-450) | **INQUIRY** (di-query per inquiry; DB punya `prf.account_id` — lihat §6) |
| 10 | Kartu **"Summary Harga"** (best quote, range) | DDP:756-773 | best quote (accepted / max total), valid_until, payment_terms, rentang min–max | Turunan dari `quotations` (inquiry-scoped) (DDP:563-567) + `payment_terms` (termMap DDP:471-475) | **INQUIRY** (turunan dari quotations inquiry-scoped) |

**Aksi yang bisa dilakukan user di DDP:** Kembali (onBack); Edit Inquiry (onEditInquiry → form inquiry, App:3154); Edit Deal (modal → tulis `accounts`); Pindah Stage (tulis `accounts.pipeline_stage`); Buat Quotation (onCreateQuotation → App:3152, **form kosong tanpa prefill**); Lihat Quotation (Eye → onViewQuotation, App:3153); Cetak PRF (onCreatePRF → App:3155, hanya `erpRole ∈ {sales,gm_bd}` DDP:717); Download quotation (**disabled/segera hadir**, DDP:703).

---

## PETA CUSTOMERDETAILPAGE — panel per panel

Props diterima (CDP:428): `id`, `onBack`, `showToast`.
State internal (CDP:433-449): `customer`, `loading`, `tab`, `visits`, `visitsLoading`, `activities`, `activitiesLoading`, `editing`, `topOpen`, `confirmDel`, `deleting`, `editNotes`, `notesDraft`, `savingNotes`.
Catatan model: `const prospect = customer` (CDP:618) — akun ADALAH baris prospect; BANT/pipeline ada langsung di baris akun.

| # | Panel / blok | file:line | Data ditampilkan | Sumber (tabel + query + embed) | Milik **inquiry / akun / campuran** |
|---|---|---|---|---|---|
| A | **Page head** (breadcrumb `CRM › Customer › {name}`, judul "Detail Customer") | CDP:701-712 | breadcrumb + judul statis | — (statis + `customer.name`) | **AKUN** |
| B | Tombol header: **Ajukan TOP Request** (kondisi tempo), **Edit**, **Hapus** (super_admin) | CDP:713-719 | — (aksi) | TOP: `TOPRequestModal` (CDP:961); Edit: `CustomerFormModal` (CDP:951); Hapus: `UPDATE accounts SET deleted_at` soft-delete (CDP:562) | **AKUN** (aksi) |
| C | **Header card** (avatar, code, status, Lead Pool badge, nama, subLine, badge Odoo/entitas/tier/PIC, Credit Limit, "Customer sejak") | CDP:723-750 | code, `account_status`, `is_in_lead_pool`, name, legal_name/type, is_odoo_customer, source_company, tier, pic_name, credit_limit, created_at | `accounts` `*` + embed `assigned_profile`/`source_company`/`payment_term` (CDP:458-467) | **AKUN** |
| D | Tab **Info Dasar** (Identitas, Kontak, PIC) | CDP:762, sections CDP:636-656 | name, legal_name, customer_type, tax_id, code, phone, email, address, city, country, pic_name/phone/email | `accounts` (baris yang sama) | **AKUN** |
| E | Tab **Komersial** (Klasifikasi & Kepemilikan, Ketentuan Komersial) | CDP:763, sections CDP:657-671 | tier, status, entitas owner, assigned salesperson, payment_terms, credit_limit, currency, contract_no, last_activity | `accounts` + embed `source_company`/`assigned_profile`/`payment_term` | **AKUN** |
| F | Tab **History Visit** | CDP:766-780 · row komp `VisitRow` CDP:317 | tanggal, visit_type, status, point_of_meeting, salesperson, location, time, MOM, follow_up | `activities` **WHERE account_id=id AND type='visit'**, limit 50 (CDP:493-499) + `profiles` client-map (CDP:505) | **AKUN** |
| G | Tab **Aktivitas** (semua tipe) | CDP:783-820 | tanggal, tipe, status, sales, outcome/notes | `activities` **WHERE account_id=id** (semua tipe), limit 200 (CDP:531-536) + `profiles` client-map (CDP:542) | **AKUN** |
| H | Tab **BANT & Pipeline** | CDP:823-873 | BantScoreBar (bant_score / `calcBantScore`), 7 field BANT (`bant_*`), `pipeline_stage` | `accounts` (baris yang sama; `prospect=customer` CDP:618); `BantScoreBar` + `bant.js` (import) | **AKUN** |
| I | Tab **Health Score** (gauge + breakdown + rekomendasi) | CDP:876-917 · `computeHealth` CDP:402 | skor heuristik dari visit count + BANT% + pipeline + kelengkapan profil + kontrak | Turunan client-side dari `customer` + `visits` (CDP:402-424); **TODO auto-calculate** (CDP:398) | **AKUN** (turunan heuristik) |
| J | Tab **Notes** (inline edit) | CDP:920-948 · `saveNotes` CDP:578 | `notes` | `accounts.notes` (read + `UPDATE accounts SET notes`) | **AKUN** |
| K | Modal **Edit Customer** | CDP:951 | form akun penuh | `CustomerFormModal` (di-import dari `CustomerListPage`, CDP:13) → `UPDATE accounts` | **AKUN** |
| L | Modal **TOP Request** | CDP:961 | form perpanjangan termin | `TOPRequestModal` (CDP:14) → tabel `top_requests` (FK `top_requests.account_id`) | **AKUN** |
| M | Modal **Konfirmasi Hapus** | CDP:970 | — | `ConfirmModal` → soft-delete akun | **AKUN** |

**Aksi yang bisa dilakukan user di CDP:** Kembali; Ajukan TOP Request (hanya payment terms tempo, `isTempoTerm` CDP:714/40); Edit (modal akun); Hapus (hanya `erpRole==='super_admin'`, soft-delete, CDP:431/718); ganti tab (7 tab); expand MOM/follow-up per visit (CDP:336); Edit Notes inline (CDP:925).

---

## TEMUAN PER BAGIAN (1–10)

### 1. DealDetailPage — isi lengkap
Lihat tabel **PETA DEALDETAILPAGE**. Ringkas: 8 kartu/blok. Yang membaca `accounts` (akun-level): Stepper (DDP:503-504,573), Header nilai/stage/assignee (DDP:575-581), Edit Deal (DDP:533), Pindah Stage (DDP:527), Aktivitas Terkait (DDP:454-458). Yang membaca `inquiries`: kartu Detail Inquiry (DDP:423-426, 590-639). Yang membaca `quotations`/`prf` **per inquiry**: Daftar Quotation (DDP:439-443), Daftar PRF (DDP:446-450), Summary Harga (turunan, DDP:563-567). Fetch akun **tidak pakai embed** (DDP:434) — nama assignee di-resolve manual lewat `profiles` (DDP:463-468) dan payment_terms lewat `payment_terms` (DDP:471-475).

### 2. CustomerDetailPage — isi lengkap
Lihat tabel **PETA CUSTOMERDETAILPAGE**. Semua tab akun-level. Fetch akun pakai `*` + 3 embed (CDP:460-465), dengan **fallback plain select** bila embed gagal (CDP:471-476). History Visit & Aktivitas = dua query terpisah ke `activities` (CDP:489-523 dan CDP:528-557), keduanya `account_id`-scoped, nama sales via client-map karena `activities.assigned_to` tak punya FK ke `profiles` (CDP:488, 527). Health Score = heuristik yang diberi label "skor sementara" (CDP:881-884) dengan `TODO auto-calculate` (CDP:398-401).

### 3. Tumpang tindih antara keduanya

| Pasangan panel | Sama | Beda | Query sama/berbeda | Besar overlap |
|---|---|---|---|---|
| DDP Stepper+Header (stage/value) ↔ CDP Header card + tab BANT&Pipeline | Sumber `accounts.pipeline_stage` + identitas akun | DDP = stepper 7-stage penuh + editable (DDP:154,527,533); CDP = tampil `pipeline_stage` read-only (CDP:860) + BANT | **Beda query** (DDP:434 subset tanpa embed; CDP:458 `*`+embed), tabel sama `accounts` | **TINGGI** |
| DDP "Aktivitas Terkait" (limit 5) ↔ CDP tab "Aktivitas" (limit 200) + "History Visit" (type=visit, limit 50) | Tabel `activities`, sumbu filter sama `account_id` | DDP: 5 terbaru semua tipe (DDP:454-458); CDP-Aktivitas: 200 semua tipe (CDP:531-536); CDP-Visit: `type='visit'` (CDP:496) | **Beda query** (limit/tipe/kolom), tabel + sumbu `account_id` sama | **TINGGI** |
| DDP "Nilai Deal" (DDP:322) ↔ CDP (tidak ada padanan langsung) | — | CDP **tidak menampilkan** `estimated_value` sama sekali | — | Nol (gap: nilai deal absen di CDP) |
| DDP "Daftar Quotation/PRF/Summary Harga" ↔ CDP | — | CDP **tidak punya** quotation/PRF/summary sama sekali | — | Nol (gap: riwayat komersial absen di CDP) |
| CDP Health Score / History Visit / BANT ↔ DDP | — | DDP **tidak punya** ketiganya | — | Nol (gap: absen di DDP) |
| DDP Header identitas ↔ CDP Header card | name, assignee | CDP jauh lebih kaya (code, status, tier, owner, PIC, credit, Odoo) | Tabel `accounts` sama, query beda | SEDANG |

Kesimpulan: overlap besar **hanya** di data akun-inti (stage, identitas, aktivitas). Quotation/PRF/Summary Harga eksklusif DDP; Health/Visit/BANT/Notes/Komersial eksklusif CDP. Keduanya membaca `accounts` + `activities` dengan query berbeda → duplikasi fetch.

### 4. Jalan masuk & keluar

**DealDetailPage — JALAN MASUK TUNGGAL:**
- Satu-satunya: baris di **InquiryListPage** → `onSelectInquiry(inq)` (`InquiryListPage.jsx:305`) → App set `crmDealInquiry = inq` (App:3130) → render `DealDetailPage inquiryId={crmDealInquiry.id}` (App:3146-3150). `crmDealInquiry` **hanya** di-set truthy di App:3130 (grep: sisanya reset `null` di App:1798, 3151-3155). **Tidak ada deep-link notifikasi** ke DealDetailPage.
- **Keluar:** `onBack` → `setCrmDealInquiry(null)` (App:3151) → kembali ke InquiryList. Nav lanjut: Buat Quotation → `quotation-draft` form (App:3152); Lihat Quotation → `quotation-draft` detail (App:3153); Edit Inquiry → form inquiry (App:3154); Cetak PRF → `prf` (App:3155).

**CustomerDetailPage — JALAN MASUK TUNGGAL:**
- Satu-satunya: baris di **CustomerListPage** → `onSelect(id)` (`CustomerListPage.jsx:743`) → App `onSelectCustomer = navigateToCustomerDetail` (App:3283) → `navigateToCustomerDetail(customerId)` (App:1827) set `activeMenu='customer-detail'` + `activeCustomerId` (App:1834-1835) → render `CustomerDetailPage id={activeCustomerId}` (App:3292). **Tidak ada deep-link notifikasi** ke CustomerDetailPage.
- **Keluar:** `onBack` → `backFromCustomerDetail` (App:1838) → `setActiveMenu(prevCustomerMenu)` (App:1840) → kembali ke halaman Customer (tab). Selain modal (Edit/TOP/Hapus), tak ada nav keluar lain.

**Catatan:** kedua halaman **jalan masuknya cuma satu**, dan tidak saling terhubung (dari DealDetail tidak ada tombol ke CustomerDetail akun terkait, dan sebaliknya) — padahal keduanya berputar di akun yang sama.

### 5. Keterikatan ke inquiry (INTI AUDIT)

DealDetailPage dibuka membawa `inquiryId`; akun di-resolve via `inquiry.prospect_id` (DDP:431). **Kalau `inquiryId` diganti ke inquiry lain dari AKUN yang sama** (prospect_id sama):

**BERUBAH (terikat inquiry):**
- `inquiry_no` di Header (DDP:578).
- Seluruh kartu **"Detail Inquiry"** (DDP:590-639) — service_type, POL/POD, incoterm, kontainer, kargo, HS, berat, volume, deadline, route, komoditas, notes, dibuat oleh.
- Kartu **"Daftar Quotation"** (DDP:439-443 `WHERE inquiry_id`) — set quotation berbeda.
- Kartu **"Daftar PRF"** (DDP:446-450 `WHERE inquiry_id`) — set PRF berbeda.
- Kartu **"Summary Harga"** (DDP:563-567) — dihitung ulang dari quotation inquiry itu.

**TIDAK BERUBAH SAMA SEKALI (milik akun; identik untuk semua inquiry akun yang sama):**
- **Stepper** (stage + value) — `accounts.pipeline_stage`/`estimated_value` (DDP:503-504).
- **Header**: nama akun, StageBadge, assignee, est. closing, **"Nilai Deal"** (DDP:576-581).
- Tombol **Edit Deal** & **Pindah Stage** — menulis baris `accounts` yang sama (DDP:509, 533).
- Kartu **"Aktivitas Terkait"** — `activities WHERE account_id = prospect_id` (DDP:454-458), tak tergantung inquiry.

**Bukti struktural bahwa "deal" = akun, bukan inquiry:** `pipeline_stage` **hanya ada di tabel `accounts`** (snap: satu-satunya index `idx_prospects_pipeline_stage ON public.accounts`); `inquiries` **tidak punya** `pipeline_stage` (kolomnya `status` default `'OPEN'`, terpisah). Jadi satu akun = satu `pipeline_stage` + satu `estimated_value`, dipakai ulang oleh setiap inquiry. Meng-edit "deal" dari halaman inquiry A dan inquiry B (akun sama) **menulis baris akun yang sama** → tidak ada "deal per-inquiry" di data; yang ada satu deal per akun. Ini persis alasan tahap 3.

⚠️ **Sub-temuan penting:** DealDetailPage me-resolve akun **HANYA** lewat `inquiry.prospect_id` (DDP:431) dan **mengabaikan `inquiry.customer_id`** (kolomnya ada — snap: `inquiries.customer_id` FK `inquiries_customer_id_fkey`). Bila sebuah inquiry ter-link ke akun via `customer_id` (bukan `prospect_id`), maka akun, stepper, Nilai Deal, dan Aktivitas Terkait **semuanya kosong/`—`** di DealDetailPage. Perlu verifikasi berapa banyak inquiry yang `prospect_id IS NULL AND customer_id IS NOT NULL` (query di §6).

### 6. Akses data untuk riwayat per akun

**Semua tabel riwayat punya FK LANGSUNG ke `accounts` (tidak wajib lewat inquiry):**

| Entitas | Kolom link ke akun | FK constraint (snap) | Dipakai halaman detail sekarang? |
|---|---|---|---|
| `inquiries` | `prospect_id`, `customer_id` (dua-duanya) | `inquiries_prospect_id_fkey`, `inquiries_customer_id_fkey` → `accounts(id)` | DDP resolve akun via **`prospect_id` saja** (DDP:431); `customer_id` **diabaikan** |
| `quotations` | `prospect_id`, `customer_id` (**langsung**) **+** `inquiry_id` | `quotations_prospect_id_fkey`, `quotations_customer_id_fkey` → `accounts(id)` | DDP query via **`inquiry_id`** (DDP:442), **bukan** akun — walau FK akun langsung ADA |
| `prf` | `account_id` (**langsung**) **+** `inquiry_id` | `prf_account_id_fkey` → `accounts(id)` | DDP query via **`inquiry_id`** (DDP:449), **bukan** `account_id` — walau FK akun langsung ADA |
| `sales_orders` | `account_id` **NOT NULL** (**langsung**) **+** `inquiry_id` **NOT NULL** | `sales_orders_account_id_fkey` → `accounts(id)` | **TIDAK ditampilkan** di DDP maupun CDP sama sekali |
| `activities` | `account_id` (**langsung**) | `activities_account_id_fkey` → `accounts(id)` | Ya — DDP (DDP:457) & CDP (CDP:495, 533) keduanya `account_id`-scoped |

**Kesimpulan §6:** untuk halaman detail account yang ingin menampilkan SELURUH riwayat, **jalur langsung sudah tersedia untuk kelimanya** — `inquiries.prospect_id`/`customer_id`, `quotations.prospect_id`/`customer_id`, `prf.account_id`, `sales_orders.account_id`, `activities.account_id`. **Tidak ada** yang WAJIB lewat inquiry. **Namun ada dua caveat data (perlu verifikasi DB):**
1. `quotations` & `prf` sekarang di-query per-inquiry; agar account-scoping tidak menjatuhkan baris, kolom akun langsung (`quotations.prospect_id/customer_id`, `prf.account_id`) harus **terisi konsisten**. Bila ada quotation lama yang hanya punya `inquiry_id` (kolom akun null), query account-scoped akan melewatkannya.
2. `inquiries` bisa ter-link via `prospect_id` **atau** `customer_id`; agregasi per akun harus menyatukan keduanya.

**Query verifikasi (READ-ONLY — jalankan manual, aku tak punya kredensial DB; jangan percaya angka yang tak diverifikasi):**
```sql
-- (a) Premis "1 akun banyak inquiry" (mis. SUNWAY TREK MASINDO 11):
SELECT a.name, COUNT(i.id) AS n_inquiry
FROM inquiries i JOIN accounts a ON a.id = COALESCE(i.prospect_id, i.customer_id)
WHERE i.deleted_at IS NULL
GROUP BY a.name ORDER BY n_inquiry DESC LIMIT 20;

-- (b) Inquiry yang ter-link via customer_id saja (akan hilang di DealDetailPage prospect_id-only):
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE prospect_id IS NOT NULL)                          AS via_prospect,
       COUNT(*) FILTER (WHERE prospect_id IS NULL AND customer_id IS NOT NULL)  AS customer_only,
       COUNT(*) FILTER (WHERE prospect_id IS NULL AND customer_id IS NULL)      AS no_account
FROM inquiries WHERE deleted_at IS NULL;

-- (c) Apakah quotations punya link akun langsung (viabilitas account-scoping):
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE prospect_id IS NOT NULL OR customer_id IS NOT NULL) AS has_account_fk,
       COUNT(*) FILTER (WHERE inquiry_id IS NOT NULL)                             AS has_inquiry,
       COUNT(*) FILTER (WHERE prospect_id IS NULL AND customer_id IS NULL AND inquiry_id IS NOT NULL) AS inquiry_only
FROM quotations WHERE deleted_at IS NULL;

-- (d) PRF & Sales Order coverage account_id:
SELECT 'prf' AS t, COUNT(*) total, COUNT(account_id) has_account, COUNT(inquiry_id) has_inquiry FROM prf WHERE deleted_at IS NULL
UNION ALL
SELECT 'sales_orders', COUNT(*), COUNT(account_id), COUNT(inquiry_id) FROM sales_orders WHERE deleted_at IS NULL;
```

### 7. RLS & role — bagian mana yang KOSONG untuk role tertentu

Fungsi kunci (snap): `is_manager_or_above()` = role ∈ **`{super_admin, admin, ceo, gm, gm_bd, manager, supervisor}`** (snap: definisi fungsi memuat `'supervisor'` — **catatan: 04_ROLE_PERMISSION_MATRIX §4 masih menulis `sales_head`; snapshot lebih baru & memuat `supervisor`, bukan `sales_head`**).

Policy SELECT (snap):
- **`accounts` (`prospects_read`)**: `super OR (company AND (manager_or_above OR assigned_to=me OR created_by=me OR (has_role('operations') AND account_status='customer')))`. → **sales hanya bisa membuka akun yang di-assign/dibuat dia**; operations hanya akun berstatus `customer`.
- **`inquiries_read`**: `(company AND (manager_or_above OR created_by=me)) OR super`.
- **`quotations_read`**: `(company AND (manager_or_above OR created_by=me)) OR super`.
- **`prf_select`**: `super OR (company AND (created_by=me OR has_role('procurement') OR manager_or_above))`.
- **`sales_orders_select`**: `super OR (company AND (created_by=me OR has_role('procurement') OR manager_or_above))`.
- **`activities_select`**: `(company AND (manager_or_above OR assigned_to=me OR created_by=me)) OR super`.

**Kelengkapan "riwayat gabungan per akun" per role:**

| Role | Inquiries | Quotations | PRF | Sales Orders | Activities | Bisa buka akun? |
|---|---|---|---|---|---|---|
| super_admin | semua | semua | semua | semua | semua | semua |
| manager / ceo / gm / gm_bd / admin / **supervisor** | company | company | company | company | company | company |
| **sales** | **hanya buatan sendiri** | **hanya buatan sendiri** | **hanya buatan sendiri** | **hanya buatan sendiri** | **hanya assigned/created sendiri** | hanya akun assigned/created dia |
| **procurement** | **KOSONG** (bukan creator/manager) | **KOSONG** (TD-90) | semua company | semua company | **KOSONG** | umumnya tidak (kecuali kebetulan assigned) |
| finance / finance_controller / operations / hrga / it / viewer | KOSONG | KOSONG | KOSONG | KOSONG | KOSONG | operations: akun `customer` saja; lainnya ~tidak |

**Temuan tegas:**
1. **Hanya `manager_or_above` (7 role) & `super_admin` yang melihat riwayat akun UTUH.** Untuk `sales`, semua panel riwayat (inquiry/quotation/PRF/SO/aktivitas) **hanya berisi baris buatannya sendiri** → bila satu akun dikerjakan beberapa sales atau di-reassign, riwayat "lengkap" itu **terpotong** dan bisa menyesatkan (terlihat seolah utuh padahal parsial).
2. **`procurement`**: `inquiries`, `quotations`, `activities` **KOSONG karena RLS** (bukan karena datanya tak ada) — persis kasus **TD-90** (`quotations_read` tak memuat procurement; `SalesOrderDocDetailPage` sudah menangani dengan pesan netral "Quotation tidak dapat ditampilkan untuk role ini"). PRF & SO terlihat penuh untuk procurement.
3. **Klien tak bisa membedakan "kosong karena RLS" vs "genuinely kosong"** untuk role non-definitif (pelajaran TD-90) — halaman akun gabungan akan mewarisi ambiguitas ini di panel inquiry/quotation/aktivitas.

### 8. Komponen yang bisa dipakai ulang vs harus diekstrak

**Sudah komponen mandiri / di-import (reusable tanpa tulis ulang):**
- `BantScoreBar` — import `./BantScoreBar` (CDP:10).
- `calcBantScore` — `./bant` (CDP:11).
- `ConfirmModal` — `../../components/ConfirmModal` (CDP:12).
- `CustomerFormModal` — **di-export** dari `CustomerListPage` (CDP:13; export di `CustomerListPage.jsx:265`).
- `TOPRequestModal` — `./TOPRequestModal` (CDP:14).

**Tertanam di DDP (module-scope, TIDAK di-export → harus diekstrak dulu):** `Stepper` (DDP:154), `Header` (DDP:284), `EditDealModal` (DDP:219), `StageBadge` (DDP:143), `Avatar` (DDP:132), `Card`/`InfoRow`/`BadgeRow` (DDP:359/373/383), `fetchAssignees` (DDP:115). **Daftar Quotation / Daftar PRF / Summary Harga = JSX inline** di dalam `return` (DDP:668-773), **bukan** komponen — harus dipecah jadi komponen dulu.

**Tertanam di CDP (module-scope, TIDAK di-export → harus diekstrak dulu):** `VisitRow` (CDP:317), `HealthGauge` (CDP:360), `HealthComp` (CDP:378), `GridSection`/`GridField` (CDP:292/300), `Tab` (CDP:284), `Badge` (CDP:269), `PicAvatar` (CDP:277), `computeHealth` (CDP:402), `healthStatus` (CDP:392). Panel tab (Info/Komersial/Visit/Aktivitas/BANT/Health/Notes) = **JSX inline** di `return` (CDP:762-948).

**Kesimpulan §8:** hampir **semua** panel yang relevan untuk halaman akun (stepper, quotation list, PRF list, activities, health, BANT, visit) **tertanam** — praktis tak ada panel akun-level yang bisa dipindah as-is; ekstraksi komponen adalah prasyarat. Satu-satunya potongan siap-pakai = `BantScoreBar`, `CustomerFormModal`, `TOPRequestModal`, `ConfirmModal`.

### 9. Risiko perubahan (diurut severity)

| # | Risiko | Lokasi | Dampak nyata | Severity |
|---|---|---|---|---|
| R1 | **RLS baris-per-baris → "riwayat lengkap akun" tidak lengkap untuk sales/procurement.** | RLS `inquiries_read`/`quotations_read`/`activities_select` (snap); TD-90 | Panel akun yang menjanjikan "seluruh riwayat" akan menampilkan subset diam-diam untuk sales (hanya rownya) & kosong utk procurement (inquiry/quotation/aktivitas). Salah paham data / keputusan bisnis. | **CRITICAL** (kebenaran data lintas-role, butuh keputusan kebijakan) |
| R2 | **Quotation/PRF pindah dari inquiry-scoped → account-scoped bisa menjatuhkan baris** bila kolom akun langsung tak terisi. | DDP:442/449 vs kolom `quotations.prospect_id/customer_id`, `prf.account_id` | Riwayat quotation/PRF di halaman akun bisa **lebih sedikit** dari jumlah asli (silent loss) kalau data lama hanya punya `inquiry_id`. | **HIGH** (perlu verifikasi query §6c/d dulu) |
| R3 | **Resolusi akun DealDetailPage `prospect_id`-only** mengabaikan `customer_id`. | DDP:431 | Inquiry ter-link via `customer_id` → akun/stage/nilai/aktivitas kosong. Kalau tahap 3 pivot ke akun, linkage akun↔inquiry harus menyatukan dua kolom, atau sebagian inquiry "yatim". | **HIGH** (perlu verifikasi query §6b) |
| R4 | **Semua panel akun tertanam (tak diekstrak).** | DDP:154-397 (789 baris total), CDP:269-425 (983 baris total) | Menaikkan panel = ekstraksi + rewire di dua file besar → churn tinggi, risiko regresi visual & data. | **MEDIUM-HIGH** |
| R5 | **Dua sumber tulis stage/value selama transisi.** | DDP Edit/Pindah Stage (DDP:509,533) menulis `accounts`; CDP tak menulis stage | Selama DealDetailPage masih hidup per-inquiry, edit deal dari inquiry mana pun menulis akun yang sama → membingungkan bila panel juga ada di halaman akun. | **MEDIUM** |
| R6 | **Health Score bergantung `visits` yang RLS-scoped.** | CDP:402 `computeHealth` pakai `visits` (CDP:493 activities type=visit) | Skor "Engagement Visit" berubah menurut role yang melihat (sales lihat lebih sedikit visit → skor lebih rendah). Skor akun jadi tidak deterministik lintas-role. | **MEDIUM** |
| R7 | **DealDetailPage jalan masuk tunggal (InquiryList).** | App:3130, `InquiryListPage.jsx:305` | Mempensiunkan DDP menuntut InquiryList mengarahkan ke halaman lain (akun detail?); tanpa itu, baris inquiry kehilangan tujuan klik. | **MEDIUM** |
| R8 | **Sales Order tak pernah tampil** di kedua halaman meski `sales_orders.account_id` NOT NULL. | (absen di DDP & CDP) | Kalau "riwayat akun" diharapkan lengkap, SO adalah entitas yang belum pernah diikutkan — keputusan cakupan baru, bukan sekadar pindah. | **MEDIUM** |
| R9 | **`estimated_value` (Nilai Deal) tak ada di CustomerDetailPage.** | CDP (tak ada padanan DDP:322) | Bila CDP jadi tuan rumah, "Nilai Deal" harus ditambahkan (baru), bukan dipindah. | **LOW-MEDIUM** |
| R10 | **Dua set brand token / gaya berbeda.** | DDP:31-41 (navy `#1B4D8A`), CDP:16-27 (cream/`SURFACE #FFFDF8`) | Menggabung UI perlu penyeragaman token; kosmetik tapi terlihat. Terkait TD-93 (`--navy` #1B4D8A vs brand #144682). | **LOW** |

### 10. Pertanyaan kunci untuk manusia
Lihat bagian **PERTANYAAN KUNCI UNTUK MANUSIA** di bawah.

---

## PANEL YANG SEBENARNYA MILIK AKUN, BUKAN INQUIRY (daftar tegas)

Berdasarkan sumber data di kode (bukan asumsi):

1. **Stepper pipeline 7-stage** — `accounts.pipeline_stage` + `accounts.estimated_value` (DDP:503-504, 573). `pipeline_stage` hanya ada di `accounts` (snap).
2. **"Nilai Deal" / estimated_value** — `accounts.estimated_value` (DDP:322-324, 504). Satu nilai per akun.
3. **Badge stage, assignee, est. closing date** di Header — `accounts.pipeline_stage`/`assigned_profile`/`assigned_to`/`estimated_closing_date` (DDP:576-581).
4. **Aksi Edit Deal & Pindah Stage** — menulis baris `accounts` (DDP:509, 533-538). Bukan properti inquiry.
5. **"Aktivitas Terkait"** — `activities WHERE account_id` (DDP:454-458). Sudah akun-scoped, cuma dibatasi 5.

**Milik akun secara DATA (FK langsung ada), tapi SEKARANG di-query per-inquiry di DealDetailPage:**
6. **Daftar Quotation** — `quotations` punya `prospect_id`/`customer_id` langsung ke akun; DDP query `WHERE inquiry_id` (DDP:442). Riwayat quotation akun **tidak pernah teragregasi**.
7. **Daftar PRF** — `prf.account_id` langsung ke akun; DDP query `WHERE inquiry_id` (DDP:449).
8. **Summary Harga** — turunan dari quotations (item #6).

**Milik akun & belum pernah ditampilkan di halaman detail mana pun:**
9. **Sales Orders** — `sales_orders.account_id` NOT NULL; absen di DDP & CDP.

**TETAP milik inquiry (benar di per-inquiry, jangan dinaikkan):**
- Kartu **"Detail Inquiry"** (DDP:590-639): service_type, POL/POD, incoterm, kontainer, kargo, HS, berat, volume, deadline, route, komoditas, notes — **spesifik per permintaan** (sesuai rencana "detail inquiry dipangkas jadi tipis").

---

## RISIKO PERUBAHAN — diurut severity
(Lihat tabel lengkap §9.) Ringkas:
- **CRITICAL:** R1 — RLS membuat riwayat akun parsial/kosong per-role (sales, procurement); butuh keputusan kebijakan, bukan sekadar UI.
- **HIGH:** R2 — account-scoping quotation/PRF bisa menjatuhkan baris bila kolom akun tak terisi (verifikasi query dulu). R3 — DealDetailPage abaikan `inquiries.customer_id`.
- **MEDIUM-HIGH:** R4 — semua panel tertanam, ekstraksi wajib.
- **MEDIUM:** R5 dua sumber tulis stage; R6 health score role-dependent; R7 pensiun DealDetail = rewire InquiryList; R8 Sales Order belum diikutkan.
- **LOW:** R9 Nilai Deal absen di CDP; R10 dua set token/brand.

---

## PERTANYAAN KUNCI UNTUK MANUSIA

1. **Arsitektur halaman:** Gabung `DealDetailPage` + `CustomerDetailPage` jadi SATU halaman detail account, ATAU perluas `CustomerDetailPage` (tambah Quotation/PRF/SO/Stepper/Nilai Deal) lalu **pensiunkan** `DealDetailPage`? (Konsekuensi §4/§7/R7.)
2. **Kelengkapan riwayat vs RLS (paling menentukan):** Apakah "riwayat lengkap satu akun" untuk role `sales` boleh **parsial** (hanya row miliknya, sesuai RLS sekarang), atau perlu **pelonggaran RLS** supaya sales melihat seluruh riwayat akun yang di-assign kepadanya? Dan untuk `procurement` (quotation/inquiry/aktivitas kosong, TD-90) — tetap tertutup, atau dibuka via view/RPC `SECURITY DEFINER` terbatas? **Ini keputusan forum, bukan refactor.** (§7, TD-90)
3. **Scope Quotation/PRF di halaman akun:** account-scoped (via `quotations.prospect_id/customer_id`, `prf.account_id`) atau tetap per-inquiry? Prasyarat: jalankan query §6(c)/(d) untuk memastikan kolom akun terisi agar tak ada baris hilang. (R2)
4. **Linkage akun↔inquiry:** Normalisasi `prospect_id` vs `customer_id`? DealDetailPage sekarang **hanya** baca `prospect_id` (DDP:431). Jalankan §6(b) untuk hitung inquiry yang `customer_id`-only. (R3)
5. **Model "deal":** Konfirmasi bahwa **satu deal = satu akun** (`accounts.pipeline_stage`/`estimated_value`, satu nilai) memang model final untuk kasus 11-inquiry-per-akun — atau stage/nilai perlu jadi per-inquiry? (§5)
6. **Batas "detail inquiry tipis":** Field mana yang tetap tinggal di inquiry (rute/incoterm/kontainer/kargo → kartu Detail Inquiry, DDP:607-637) vs mana yang naik ke akun? (Rencana sudah menyebut yang tipis; konfirmasi daftarnya.)
7. **Entry point pasca-pensiun DealDetailPage:** Klik baris di `InquiryListPage` (`InquiryListPage.jsx:305`) mengarah ke mana — halaman akun (dengan inquiry ter-highlight) atau detail inquiry tipis? (R7)
8. **Cakupan Sales Order:** Apakah `sales_orders` (punya `account_id` NOT NULL, tapi belum pernah tampil) ikut dimasukkan ke riwayat akun? (R8)
9. **Nilai Deal di CustomerDetailPage:** Bila CDP jadi tuan rumah, "Nilai Deal"/`estimated_value` dan stepper harus **ditambahkan** (belum ada di CDP) — konfirmasi ini bagian scope tahap 3. (R9)
10. **Health Score lintas-role:** Skor bergantung `visits` yang RLS-scoped (R6) → skor akun berbeda per role yang membuka. Dibiarkan (skor "sementara/heuristik", CDP:398) atau di-pindah ke perhitungan server-side deterministik?

---

**Catatan wajib:** Audit ini **tidak menjalankan app/DB**. Klaim FK & RLS dari `supabase/schema_snapshot.sql` (`--schema-only`, tanpa data) — angka baris (11 inquiry SUNWAY, coverage kolom akun) **belum diverifikasi**; jalankan query §6 secara manual. Status seed permission per-user (`user_menu_permissions`) tak terbaca dari snapshot. NOL file kode/DB diubah; hanya `AUDIT_CRM_DETAIL.md` dibuat.
