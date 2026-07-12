# WORKFLOW MAP — Nexus by MSI

> Alur bisnis per modul live. Sumber: `CLAUDE.md` (CRM Flow, phase notes), `docs/03_DATA_MODEL.md`. Notasi: **[role]** = pelaku, **⚙** = trigger/otomatis DB.
>
> **Diperbarui 2026-07-10 (peluncuran aging-pipeline, pagi) — section Aging Pipeline: LIVE + terjadwal.** Filter per-entitas via `companies.aging_enabled` (hanya MSI); pg_cron harian 01:00 WIB (Vault key); verify_jwt beres (TD-60 DONE); dry_run pasca-filter 469 diperiksa / 304 memenuhi. + KONTEKS ADOPSI sebaran pencatatan sales (bukan kinerja). Sebelumnya (audit CRM E2E): koreksi mesin status QUOTATION (DRAFT→SUBMITTED→SENT) + struktur pipeline (tabel `accounts`, tak ada `deals`) + trigger `trg_z_sync_last_activity`. Alur SP 12 tahap FASE 0-3 (mesin status `sp_orders.status` via `sp_recompute_status`, LIVE s/d BTB_TERBIT). Bagian non-CRM/non-SP belum ditinjau ulang.

---

## CRM / Sales Flow

```
Lead Pool ──┐
            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ ACCOUNTS (master customer tunggal — account_status menentukan tahap) │
   └─────────────────────────────────────────────────────────────────┘
            ▼
 [Sales/BD] buat Prospect  →  account_status = 'prospect'
            │  (auto-assign ke sales pembuat; BANT scorecard; dup-check nama)
            ▼
 PIPELINE (drag Kanban / edit form) — pipeline_stage:
   NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST
            │
            │  soft-gate (konfirmasi, bukan blok):
            │    • → PROPOSAL  : disarankan sudah ada Inquiry
            │    • → WON       : disarankan sudah ada Quotation
            ▼
 [Sales] buat INQUIRY  (inquiry_no, service_type, route, commodity)  →  prospect_id → accounts
            ▼
 [Sales] buat QUOTATION dari Inquiry  (quotation_no, items per-section, currency, discount, VAT)
            │   status: DRAFT → SUBMITTED → SENT (Kirim ke Customer, ⚙ quote_sent_at)
            │            ACCEPTED / REJECTED / EXPIRED = label display, TANPA transisi UI (lihat catatan)
            │   SLA dihitung pricing_done_at → quote_sent_at (target per service_type)
            │   simpan via RPC save_quotation (atomik); PDF via @react-pdf/renderer
            ▼
 Pindah ke WON  ──⚙ trigger trg_set_customer_on_won──►  account_status = 'customer'
            │                                            became_customer_at + converted_at di-stamp
            │                                            ⚙ trg_z_gen_customer_code_upd → generate code customer
            ▼
 MASTER CUSTOMER  (account_status='customer') — health score, history, dst.
```

**Status transisi & pelaku:**
- **Prospect → stage**: [sales] drag Kanban / edit form. Manager+ bisa semua; sales hanya miliknya (RLS).
- **WON → customer**: **otomatis DB** (`trg_set_customer_on_won`, BEFORE INSERT OR UPDATE) — sumber kebenaran tunggal; menutup semua jalur (drag/edit/import). Frontend `WinLossModal` collect alasan WON/LOST (redundan tapi dipertahankan).
- **LOST**: account_status='lost' + lost_reason (kategori).
- **Lead Pool** (`account_status='lead_pool'` **DAN** `is_in_lead_pool=true` — dua kolom kini disinkron, lihat TD-50): arsip lead → [sales] "Tarik ke Pipeline" → butuh approval → account_status='prospect'. ⚠️ **479 baris pool (per 10 Jul pagi) seluruhnya hasil migrasi 13 Jun 2026 18:59:03** (satu timestamp, `lead_pool_reason='Migrasi dari sistem lama'`) — belum ada baris "Aging N hari di stage X" sampai cron nyala. **Sejak 11 Jul cron aging berjalan** → pool tumbuh via aging (lihat "Aging Pipeline" di bawah; dampak malam pertama 479 → 783).
- **Activities** (call/visit/meeting/email/WA/followup): [sales] catat; status todo→done/cancelled; tiap transisi tulis `activity_logs` (feed). Convert-to-prospect dari activity tanpa account.

**Mesin status QUOTATION (terverifikasi kode):**
- **DRAFT → SUBMITTED**: [sales] tombol **"Submit Quotation"** (`QuotationFormPage.jsx:730,790`, `status='SUBMITTED'`). Tombol **disabled sampai `inquiry_id` terisi** — HARD gate **ketertautan inquiry** (bukan gate diskon/margin). Simpan Draft = `status='DRAFT'`.
- **SUBMITTED → SENT**: [sales] tombol **"Kirim ke Customer"** (`QuotationDetailPage.jsx:258`, `status='SENT'` + ⚙ `quote_sent_at`); tombol muncul saat `status='SUBMITTED'`.
- **ACCEPTED / REJECTED / EXPIRED** = **label display saja, TANPA transisi UI** — tak ada aksi/tombol yang menulis status ini (nol baris ACCEPTED di DB). ⚠️ Konsekuensi: trigger `sync_deal_value_on_quotation_accept` (nyala hanya saat ACCEPTED) **tak pernah jalan** → 88% deal WON `estimated_value` kosong (lihat `08_TECH_DEBT.md` **TD-54**).

**Struktur pipeline (koreksi — TIDAK ada tabel `deals`/`pipeline`):**
- Pipeline = tabel **`accounts`**, kolom **`pipeline_stage`**. Nilai deal disimpan di **`accounts.estimated_value`** (BUKAN `deal_value`).
- Trigger di `accounts`: `trg_set_customer_on_won` (WON → customer) + `trg_z_track_stage_change` (log perubahan stage → `activity_logs`). Trigger di `quotations`: `trg_z_sync_deal_value_on_quotation_accept` (quotation ACCEPTED → `accounts.estimated_value`; lihat catatan TD-54 di atas).
- **`set_customer_on_won` terbukti sehat** (audit 10 Jul): 33 WON, nol `account_status` bukan 'customer', nol `became_customer_at` NULL.

**Trigger otomatis terkait:**
- `trg_set_customer_on_won` — WON → customer.
- `trg_z_gen_customer_code_upd` / `trg_gen_customer_code_ins` — generate `code` customer (prefix entity + `/CUST/` + tahun + romawi) saat jadi customer & code kosong (guard `deleted_at IS NULL`).
- `trg_z_track_stage_change` — log perubahan `pipeline_stage` ke `activity_logs`.
- `trg_z_sync_last_activity` [BARU 10 Jul] — sinkron `accounts.last_activity_at` dari tabel `activities` (AFTER INSERT/UPDATE/DELETE) = `max(COALESCE(completed_at, created_at))`. Menggantikan penulisan sekali-saat-buat yang tak jujur (lihat TD-52/TD-59).
- `capture_login_session()` — catat login ke `user_login_logs` (sumber feed "Login").

**Gate & Approval (pipeline / WON / lead pool)** — terverifikasi di kode (`PipelineKanbanPage.jsx`, dll):
- **CONTACTED → QUALIFIED — BANT gate:** saat drag ke Qualified, hitung skor BANT (0-12): **<5 = BLOK total** (toast, batal — tak bisa lanjut) · **5-7 = ConfirmModal** (soft, boleh lanjut) · **≥8 = lolos** langsung.
- **→ PROPOSAL / → WON — soft gate:** PROPOSAL tanpa Inquiry / WON tanpa Quotation → ConfirmModal (boleh lanjut). *(lihat juga catatan soft-gate di diagram atas)*
- **WON → Handover — HARD gate by nilai deal:** `estimated_value` **≤ Rp100jt → Light Handover** / **> Rp100jt → Strategic Handover**; WON resmi (`finalizeWon`: convert ke customer) **hanya jalan setelah** form handover tersimpan (`deal_handovers`).
- **Lead Pool → Pipeline — HARD (butuh approval):** [sales] "Tarik ke Pipeline" → `pull_status='pending'` → [manager/supervisor/admin] **approve** (Approval Lead Pool) → balik ke pipeline stage sebelumnya. Reject → tetap di pool.
- **TOP Request — soft:** [sales/manager] ajukan Terms of Payment → insert `top_requests` status='submitted' → approval finance (proses downstream, di luar FE).
- **MOM approval — HARD:** MOM `submitted` → [CEO/admin] **approve/reject** (MOMDetailPage).

---

## Aging Pipeline (Lead idle → Lead Pool) — Edge Function (LIVE + TERJADWAL harian 01:00 WIB)

Edge Function **`aging-pipeline`** (`supabase/functions/aging-pipeline/index.ts`) — pindahkan lead yang terlalu lama diam ke Lead Pool + notifikasi ke sales pemilik. Sebelumnya ter-deploy dgn slug auto `bright-handler` & **tak ada di version control**; kini di-commit (branch `feat/aging-pipeline`, belum merge).

**Batas diam per stage (hari):** NEW 7 · CONTACTED 5 · QUALIFIED 5 · PROPOSAL 3 · NEGOTIATION 14.

**Filter per-entitas (`companies.aging_enabled`) — HANYA MSI:** EF pakai **service role key** → menembus RLS → semula melihat SELURUH entitas. Tapi aturan aging di atas adalah aturan sales **MSI**, bukan Storbit (SOA)/JCI. Terbukti dry_run: dari 472 lead, **3 milik PT Stuja Orbit Abadi** (General Order, Indogrosir, CK — Central Kitchen; ketiganya `assigned_to` NULL). **Perbaikan** (migrasi `20260710000008`): kolom `companies.aging_enabled boolean NOT NULL DEFAULT false` (MSI=true, JCI/SOA=false); EF baca daftar `company_id` yang `aging_enabled=true` lalu `.in('company_id', companyIds)` di query accounts; +GRANT SELECT `companies` ke `service_role` (fix `permission denied for table companies` — lihat TD-62). Hasil dry_run pasca-filter: diperiksa **469** (turun dari 472), memenuhi **304** (tak berubah — 3 lead Storbit diam 7 hari di NEW, batas 7, belum lewat).

**Perhitungan:** `diamHari = Math.floor((now − MAX(stage_changed_at, last_activity_at)) / hari)`. Lead dianggap "disentuh" bila **stage naik ATAU ada aktivitas** (pakai yang paling baru dari keduanya). `Math.floor` (pembulatan ke bawah) → lead dapat jatah hari penuh. Bila `diamHari > batas`:
- `is_in_lead_pool=true`, `account_status='lead_pool'` (kedua kolom serempak — fix TD-50), `lead_pool_at=now`, `lead_pool_reason='Aging N hari di stage X'`, + notifikasi ke `assigned_to` (`event_type='crm.lead_idle'`).
- **Mode kering** (`?dry_run=true`) → laporkan kandidat (diperiksa/memenuhi/per-stage/daftar), **tak memindahkan** apa pun.

**Perbaikan EF (commit `ca7aad3`, `9f59f8c`, `96974bb`):**
1. +aturan **NEW:7** (sebelumnya 157 lead NEW tanpa aturan → tak pernah diperiksa).
2. Aging dari **`MAX(stage_changed_at, last_activity_at)`** (bukan `stage_changed_at` saja) — menyelamatkan lead yang digarap meski stage tak berubah (mitigasi TD-51).
3. **Fix insert notifikasi** — kolom `message`→`body`, buang `type`, +`event_type='crm.lead_idle'` +`reference_type`/`reference_id`. Insert LAMA **PASTI GAGAL** (kolom `message`/`type` tak ada di `notifications`) dan gagal diam-diam (tak ada cek error).
4. Buang `PREV_STAGE` dead code.
5. +mode kering (`dry_run`).
6. +`.is('deleted_at', null)`.
7. `Math.floor` (jatah hari penuh).
8. Set `account_status` bareng `is_in_lead_pool` (TD-50).

**Simulasi `dry_run` — terverifikasi 10 Jul (`verify_jwt` aktif, pasca-filter per-entitas):** **469 diperiksa** (hanya MSI), **304 memenuhi syarat** (setelah `Math.floor`). Sebaran: CONTACTED 121 · NEW 118 · QUALIFIED 45 · PROPOSAL 20 · NEGOTIATION 0. Sebelum `Math.floor` angkanya **332** (termasuk 6 NEGOTIATION); pembulatan ke bawah menyelamatkan **28 lead** yang harinya belum genap — seluruhnya deal NEGOTIATION aman.

**Rencana peluncuran (status per-langkah — urut):**
1. ✅ **SELESAI (10 Jul)** — TD-60 `verify_jwt` beres; `config.toml` diberi entri `[functions.aging-pipeline]` `verify_jwt=true`. Terverifikasi: **401** tanpa key sah, **200** dgn anon key.
2. ✅ **SELESAI (10 Jul)** — `aging-pipeline` di-deploy ulang dgn slug benar (sebelumnya `bright-handler`). Live.
3. ✅ **SELESAI (10 Jul)** — `dry_run` dijalankan manual: 469 diperiksa, **304 memenuhi syarat**.
4. ✅ **SELESAI (10 Jul)** — sales diberi tahu **sebelum** cron berjalan. **TIDAK** pakai tenggat seminggu; keputusan Den: sales perlu melihat pipeline punya konsekuensi nyata. Pemberitahuan dikirim pagi, cron jalan 01:00 WIB (malam yang sama).
5. ✅ **SELESAI (10 Jul)** — pg_cron terjadwal (migrasi `20260710000009`). Sejak ini **lead berpindah otomatis tiap malam**.

**Mekanisme cron (migrasi `20260710000009`):**
- Job **`aging-pipeline-harian`**, schedule **`0 18 * * *`** (18:00 UTC = **01:00 WIB**), harian.
- Panggil EF via **`net.http_post`** (extension `pg_net`).
- **Service role key disimpan di Vault** (nama `aging_pipeline_key`), BUKAN hardcode di `cron.job` — tabel itu terbaca siapa pun yang punya akses schema `cron`.
- Prasyarat terpenuhi: `pg_cron` 1.6.4 + `pg_net` aktif, EF `verify_jwt=true`, `aging_enabled=true` hanya MSI, GRANT SELECT `companies` ke `service_role`.
- Diverifikasi: `net.http_post` manual `?dry_run=true` → status **200**, memenuhi **304**.

**Dampak malam pertama (11 Jul 01:00 WIB):** pipeline aktif **469 → 165**; Lead Pool **479 → 783**; **~303 notifikasi**. Malam berikutnya diperkirakan mendekati nol (sisa lead belum lewat batas) — **"aging jadi aliran, bukan gelombang"**.

**Perintah darurat:**
```sql
-- (a) matikan cron
SELECT cron.unschedule('aging-pipeline-harian');

-- (b) kembalikan lead yang dipindah malam pertama
UPDATE accounts
SET is_in_lead_pool = false, account_status = 'prospect',
    lead_pool_at = NULL, lead_pool_reason = NULL
WHERE lead_pool_reason LIKE 'Aging%'
  AND lead_pool_at >= '2026-07-10 18:00:00+00';

-- (c) pantau harian berapa lead masuk pool via aging
SELECT date_trunc('day', lead_pool_at) AS tanggal, count(*)
FROM accounts
WHERE lead_pool_reason LIKE 'Aging%'
GROUP BY 1 ORDER BY 1 DESC;
```

---

## Sebaran pencatatan sales — KONTEKS ADOPSI (⚠️ BUKAN penilaian kinerja)

> **DISCLAIMER WAJIB DIBACA.** Angka di bawah **mengukur PENCATATAN di Nexus, BUKAN KINERJA sales.** Sales bisa menggarap lead lewat WhatsApp/telepon tanpa mencatatnya di Nexus; data ini **tak bisa membedakan** keduanya. **Jangan jadikan dasar penilaian kinerja / evaluasi orang.** Yang bisa disimpulkan hanya: **Nexus belum menjadi tempat sales mencatat kerja** → ini masalah **adopsi/desain produk, bukan orang**. Tindak lanjut = perbaikan proses/UX, bukan teguran individu (dibahas terpisah).

Konteks saat cron aging dinyalakan (10 Jul): rasio aktivitas tercatat per lead vs proporsi lead yang akan terbuang ke Lead Pool. Total: **269 aktivitas tercatat untuk 469 lead aktif** dalam sebulan.

| Sales | Lead | Aktivitas/lead | Akan terbuang |
|---|---|---|---|
| Rossy Siregar | 30 | 1.83 | 33% |
| F Ayumurni Hartanti | 27 | 0.89 | 74% |
| Nurul Andini Karina | 96 | 0.78 | 67% |
| Martin | 12 | 0.50 | 67% |
| Maria Marcia Mannuela | 23 | 0.39 | 96% |
| Gusti Raharjo | 94 | 0.32 | 65% |
| Endang Kumolo Ratih | 66 | 0.14 | 92% |
| Suhana Nia | 120 | 0.10 | 48% |

> Baca sebagai sinyal adopsi: jumlah aktivitas tercatat jauh di bawah jumlah lead → alat belum melekat di kebiasaan kerja. Ini bahan diagnosa produk, sekali lagi **bukan rapor sales.**

---

## Foundation Flow

**Onboarding user baru:**
```
[Admin/super_admin] User Access → "Add User"
   → Edge Function create-user (service-role):
        ⚙ auth.admin.createUser  → buat akun auth
        ⚙ profiles upsert (full_name, company_id, branch/dept/position)
        ⚙ user_roles upsert (role_id = ERP role; cross-company via service-role)
   → User Edit page: Profile + Permission Matrix (user_menu_permissions diff-save)
        + avatar upload (bucket avatars), Ubah Password (reset-password EF), Hapus User (delete-user EF)
```
- **Assign role:** via `user_roles` (bukan `profiles.role` yang deprecated). Role menentukan `erpRole` di AuthContext + RLS.
- **Set company:** `profiles.company_id` (+ `user_roles.company_id`). Menentukan `get_user_company_id()` untuk RLS.
- **Org structure:** [Admin] Struktur Organisasi → set `profiles.reports_to` (self-FK) → org chart top-down; warna node per **position level** (Director/Manager/Head/Supervisor/Staff/Operator), badge per entitas.

**Master data CRUD:** [Admin/IT] Companies/Branches/Departments/Positions/Roles/Products/Payment Terms/Taxes/Document Types/Status Catalog/Currencies. Positions = compact group-by-code + checkbox entitas (INSERT/reactivate/deactivate per entity).

---

## Service Management Flow

**HRGA Request:**
```
[Requester] My Requests → pilih request type (per company) → isi form + line items (ATK)
   → submit (status: submitted) → ⚙ increment_document_sequence (HRG nomor)
   → approval matrix (hrga_approval_configs per request_type × level, scoped company_id)
   → [Approver L1/L2/L3] approve/reject (hrga_request_approvals, INSERT-only audit)
   → status lifecycle: draft → submitted → under_review → approved/rejected/revision_requested → completed
```
- Approval config: `hrga_approval_configs` UNIQUE(request_type_id, level); **selalu filter company_id**.
- Offboarding: tabel `hrga_offboarding_checklists`/`_items` ada, UI [TODO: belum dibangun].

**IT Service Management:** [TODO: modul belum dibangun — planned].

**Asset Management:**
```
[Procurement/IT] tambah aset (Add Asset wizard, per kategori IT-EQP/VEH/FURN/BLDG)
   → assets + asset_specifications + asset_network (+ software/maintenance/fuel per kategori)
   → assignment_status (available/checked_out), assigned_to user
   → detail: inline-edit (IT), tab Health Score (heuristik), Maintenance, Fuel (kendaraan)
```
- ⚠️ Save wizard masih **dummy** (belum persist). Documents/Work Orders/Routes = tabel belum ada (TECH_DEBT TD-26).

---

## Logistics (Storbit SP) Flow — Mesin Status 12 Tahap (FASE 0-3, LIVE)

Status headline = **`sp_orders.status`**, **fact-derived** via `sp_recompute_status(customer_id, sp_no)` (di-maintain otomatis oleh event, BUKAN diketik). Detail skema/RPC: `docs/03_DATA_MODEL.md §3 (Inventory & Logistics) + §5`.

```
[Sales/Operations] Input SP (single door: InputSPPage)
   → penomoran MANUAL (nomor dari customer), DC WAJIB, identitas komposit (customer_id, sp_no)
   → dual-write: sp_items (lama) + sp_orders/sp_order_items (baru, ⚙ create_sp_order_dual)
   ══►  status = DRAFT
         │
 [Ops/Manager] Konfirmasi SP (set_sp_status 'confirmed') ─⚙ recompute─►  CONFIRMED
         │                                                (stok kurang → MENUNGGU_STOK)
         │  [Ops] Tolak SP (set_sp_status 'cancelled') ──►  CANCELLED (terminal)
         ▼
 [Ops] Generate Picking (generate_picking_from_sp; hanya saat CONFIRMED/MENUNGGU_STOK)
         │   → picking_lists + items + reservasi stok  ─⚙ recompute─►  PICKING
         ▼
 [Ops] Selesai picking/packing (complete_picking)      ─⚙ recompute─►  PACKED
         ▼
 [Ops] Buat Surat Jalan (generate_delivery_from_picking) → delivery_notes (draft)
 [Ops] Berangkatkan (dispatch_delivery)
         │   → ledger outbound + isi sp_items.shipped_qty ─⚙ recompute─►  DIKIRIM
         ▼
 [Ops] Tandai sampai (mark_delivery_delivered)          ─⚙ recompute─►  SAMPAI
         │   (bila Σshipped ≥ Σqty)                      ─⚙ recompute─►  TERKIRIM_PENUH
         ▼
 [Ops] Terbit BTB di Detail SP (sp_issue_btb) → sp_btb  ─⚙ recompute─►  BTB_TERBIT ★ PUNCAK
         │   (BTB_TERBIT = rank TERTINGGI, MENGALAHKAN TERKIRIM_PENUH — "puncak sebelum invoice")
         ▼
 ─────────── FASE 4-5 (📋 PLANNED — belum dibangun, butuh modul invoice/payment) ───────────
 [Finance] Terbit invoice        →  INVOICED   📋
 [Finance] Submit/serah faktur   →  SUBMITTED  📋
 [Finance] Lunas (payment)       →  LUNAS      📋
```

**Aksi mundur (fact-derived — recompute otomatis balik ke tahap fakta tertinggi):**
- **Batal picking** (`cancel_picking`): picking → cancelled, release reservasi, set flag **`had_cancelled_picking`** (permanen) → status **mundur ke CONFIRMED**.
- **Batal Surat Jalan** (`cancel_delivery`): reverse ledger + **kembalikan `sp_items.shipped_qty`** → status mundur (mis. TERKIRIM_PENUH → SAMPAI/DIKIRIM).
- **Hapus BTB** (`sp_delete_btb`, soft-delete): status **mundur** dari BTB_TERBIT ke tahap fakta tertinggi berikutnya.

**Guard recompute:** `status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS')` → beku (recompute tak menyentuh). **BTB_TERBIT TIDAK beku** (ikut fakta BTB).

**Batalkan vs Hapus SP (di Detail SP):**
- **[Ops/Manager/GM/super_admin] Batalkan SP** (`set_sp_status 'cancelled'`, hanya saat **DRAFT**) — alasan **wajib** (textarea); status → **CANCELLED** (terminal, data tetap tersimpan). Dual-table + komposit `(customer_id, sp_no)`. Tombol "Batalkan SP" di header actions, TERPISAH dari Danger Zone.
- **[super_admin] Hapus SP** (`delete_sp_dual`, ⚠️ **belum live** — RPC dijalankan user manual, hanya saat **DRAFT**) — hapus permanen dual-table: `sp_orders` (+`sp_order_items` via FK CASCADE) **dan** `sp_items`, di-kunci komposit → nomor bisa dipakai ulang. Guard `is_super_admin()` + DRAFT strict di RPC. Di Danger Zone. **operations kehilangan akses hapus** (dulu `['super_admin','operations']` tanpa gate status) → diberi "Batalkan SP" sebagai gantinya.

**Catatan transisi & yang USANG:**
- Live sekarang **DRAFT s/d BTB_TERBIT**; **INVOICED/SUBMITTED/LUNAS = FASE 4-5 (planned)**.
- ⚠️ **USANG (flag finance lama):** progress per-item **INV → FP → SUB → KRM** (kolom `sp_items.inv/fp/submit/kirim`) = generasi lama, **BUKAN sumber kebenaran status** — digantikan mesin status + (nanti) modul invoice FASE 4-5.
- ⚠️ `sp_btbs` (BTB legacy per-SP) digantikan `sp_btb`; **AR/TTF (`ar_ttfs`/`ar_btbs`) = domain finance/penagihan terpisah**, bukan status SP.

---

## Inventory Flow

```
[Operations] Penerimaan Barang (goods receipt)
   → pilih products + vendor + warehouse → simpan ke stock_ledger (movement masuk)
   → Stok Barang: agregasi stock_summary (qty per product per warehouse)
   → Inventory Dashboard: KPI + movement trend (dari stock_ledger) + low-stock alert
```

---

## Procurement — PRF (Price Request Form) Flow (Fase 1+2 LIVE; Fase 3 belum)

```
[Sales / GM BD] Buat PRF (PRFFormPage)
   → pilih Sumber (Customer / Prospect / Inquiry) → account_id / inquiry_id (+ auto-isi account dari inquiry)
   → Section 01 Informasi Dasar (stream, deadline_quotation)
   → Section 02 Inquiry Details (direction, commodity, HS Code, MSDS jika DG,
       service_type, incoterms, commercial value/currency jika CIF/CIP/DDP,
       pickup/delivery address per incoterm, add-on services [11 opsi], cargo_ready_date)
   → Section 03 Detail Layanan (child fields dinamis per service_type — MUNCUL saat service_type dipilih):
       • Sea → Freight Type FCL/LCL; FCL → container types (multi) + qty per tipe; LCL → gw/dimension/volume/koli
       • Air → gw/dimension/volume/koli
       • Inland (service=inland ATAU add-on 'inland') → fleet types (multi) + pickup/delivery (wajib) + gw/dim (opsional)
       • Custom (service=custom DAN add-on Custom Clearance) → doc type AUTO PIB/PEB dari direction
       • Project → freight types (multi) + qty  (note: penentuan project masih sementara)
       ganti service_type → reset semua field child; field tak relevan → payload null
   → Section 04 Notes
   → nomor auto PRF/{ENTITAS}/{TAHUN}/{ROMAWI}/{URUT} (increment_document_sequence, reset per-bulan)
   → Simpan Draft (status=DRAFT) ATAU Submit (status=SUBMITTED + submitted_at)
   → INSERT prf (RLS prf_insert: hanya sales/gm_bd se-company)

[Procurement] lihat PRF submitted → acknowledge (status=ACKNOWLEDGED)   ← Fase 3a (list/inbox) BELUM
   → RLS prf_select (own OR procurement OR manager+); prf_update_status (procurement, saat SUBMITTED)
```

- **Live sekarang:** FORM lengkap (Section 01/02/03/04) + menu + nomor auto (Fase 1+2). Sumber inquiry mengisi `inquiry_id` + auto `account_id`. Section 03 child fields dinamis per `service_type` (Fase 2).
- **Belum:** list/inbox procurement (Fase 3a), cross-entity inbox (Fase 3b). Status QUOTED/EXPIRED disiapkan di CHECK tapi belum ada transisinya. **⚠️ FLAG UX (perlu konfirmasi user testing):** Custom butuh 2 syarat (service=custom DAN add-on Custom Clearance) — jika custom tanpa add-on, blok tak muncul + hint.
- **Gate role:** menu terlihat sales/gm_bd/procurement/manager+; **hanya sales/gm_bd yang bisa Submit/Draft** (RLS `prf_insert`). Detail: `04_ROLE_PERMISSION_MATRIX`. Skema: `03_DATA_MODEL` (tabel `prf`). Rujukan desain: `AUDIT_PROCUREMENT.md`.

---

## [Modul lain]

- **Finance (transaksi), Procurement/PO, Approval engine runtime, Billing/AR-AP, Reporting konsolidasi** — [TODO: belum cukup info / belum dibangun. Lihat `docs/09_ROADMAP.md` status 📋].
