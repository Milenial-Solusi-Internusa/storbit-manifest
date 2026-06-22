# WORKFLOW MAP — Nexus by MSI

> Alur bisnis per modul live. Sumber: `CLAUDE.md` (CRM Flow, phase notes), `docs/03_DATA_MODEL.md`. Notasi: **[role]** = pelaku, **⚙** = trigger/otomatis DB.

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
            │   status: DRAFT → SUBMITTED → SENT (Kirim ke Customer, ⚙ quote_sent_at) → ACCEPTED/REJECTED
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
- **Lead Pool** (`account_status='lead_pool'`): arsip lead → [sales] "Tarik ke Pipeline" → account_status='prospect'.
- **Activities** (call/visit/meeting/email/WA/followup): [sales] catat; status todo→done/cancelled; tiap transisi tulis `activity_logs` (feed). Convert-to-prospect dari activity tanpa account.

**Trigger otomatis terkait:**
- `trg_set_customer_on_won` — WON → customer.
- `trg_z_gen_customer_code_upd` / `trg_gen_customer_code_ins` — generate `code` customer (prefix entity + `/CUST/` + tahun + romawi) saat jadi customer & code kosong (guard `deleted_at IS NULL`).
- `capture_login_session()` — catat login ke `user_login_logs` (sumber feed "Login").

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

## Logistics (Storbit SP/AR) Flow

```
[Sales/Operations] Sales Order (SP) — list + detail
   → customer dari accounts (account_status='customer')
   → finance stages per item: INV → FP → SUB → KRM (progress bar)
   → BTB numbers (sp_btbs, per-SP) + remarks
   → AR/TTF (ar_ttfs) untuk penagihan
```
[TODO: detail status lifecycle SP/AR — sebagian di db.js legacy Storbit; perlu konfirmasi alur finance INV/FP/SUB/KRM secara bisnis].

---

## Inventory Flow

```
[Operations] Penerimaan Barang (goods receipt)
   → pilih products + vendor + warehouse → simpan ke stock_ledger (movement masuk)
   → Stok Barang: agregasi stock_summary (qty per product per warehouse)
   → Inventory Dashboard: KPI + movement trend (dari stock_ledger) + low-stock alert
```

---

## [Modul lain]

- **Finance (transaksi), Procurement/PO, Approval engine runtime, Billing/AR-AP, Reporting konsolidasi** — [TODO: belum cukup info / belum dibangun. Lihat `docs/09_ROADMAP.md` status 📋].
