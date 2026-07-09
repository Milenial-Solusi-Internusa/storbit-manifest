# WORKFLOW MAP — Nexus by MSI

> Alur bisnis per modul live. Sumber: `CLAUDE.md` (CRM Flow, phase notes), `docs/03_DATA_MODEL.md`. Notasi: **[role]** = pelaku, **⚙** = trigger/otomatis DB.
>
> **Diperbarui 2026-07-08 — alur SP 12 tahap FASE 0-3** (mesin status `sp_orders.status` via `sp_recompute_status`, LIVE s/d BTB_TERBIT). Bagian non-SP belum ditinjau ulang di update ini.

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

**Gate & Approval (pipeline / WON / lead pool)** — terverifikasi di kode (`PipelineKanbanPage.jsx`, dll):
- **CONTACTED → QUALIFIED — BANT gate:** saat drag ke Qualified, hitung skor BANT (0-12): **<5 = BLOK total** (toast, batal — tak bisa lanjut) · **5-7 = ConfirmModal** (soft, boleh lanjut) · **≥8 = lolos** langsung.
- **→ PROPOSAL / → WON — soft gate:** PROPOSAL tanpa Inquiry / WON tanpa Quotation → ConfirmModal (boleh lanjut). *(lihat juga catatan soft-gate di diagram atas)*
- **WON → Handover — HARD gate by nilai deal:** `estimated_value` **≤ Rp100jt → Light Handover** / **> Rp100jt → Strategic Handover**; WON resmi (`finalizeWon`: convert ke customer) **hanya jalan setelah** form handover tersimpan (`deal_handovers`).
- **Lead Pool → Pipeline — HARD (butuh approval):** [sales] "Tarik ke Pipeline" → `pull_status='pending'` → [manager/supervisor/admin] **approve** (Approval Lead Pool) → balik ke pipeline stage sebelumnya. Reject → tetap di pool.
- **TOP Request — soft:** [sales/manager] ajukan Terms of Payment → insert `top_requests` status='submitted' → approval finance (proses downstream, di luar FE).
- **MOM approval — HARD:** MOM `submitted` → [CEO/admin] **approve/reject** (MOMDetailPage).

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

## Procurement — PRF (Price Request Form) Flow (Fase 1 LIVE; Fase 2-3 belum)

```
[Sales / GM BD] Buat PRF (PRFFormPage)
   → pilih Sumber (Customer / Prospect / Inquiry) → account_id / inquiry_id (+ auto-isi account dari inquiry)
   → Section 01 Informasi Dasar (stream, deadline_quotation)
   → Section 02 Inquiry Details (direction, commodity, HS Code, MSDS jika DG,
       service_type, incoterms, commercial value/currency jika CIF/CIP/DDP,
       pickup/delivery address per incoterm, add-on services, cargo_ready_date)
   → Section 03 Notes
   → nomor auto PRF/{ENTITAS}/{TAHUN}/{ROMAWI}/{URUT} (increment_document_sequence, reset per-bulan)
   → Simpan Draft (status=DRAFT) ATAU Submit (status=SUBMITTED + submitted_at)
   → INSERT prf (RLS prf_insert: hanya sales/gm_bd se-company)

[Procurement] lihat PRF submitted → acknowledge (status=ACKNOWLEDGED)   ← Fase 3a (list/inbox) BELUM
   → RLS prf_select (own OR procurement OR manager+); prf_update_status (procurement, saat SUBMITTED)
```

- **Live sekarang:** FORM + menu + nomor auto (Fase 1). Sumber inquiry mengisi `inquiry_id` + auto `account_id`.
- **Belum:** child fields Sea/Air/Inland/Project/Custom (Fase 2 — kolom DB sudah ada), list/inbox procurement (Fase 3a), cross-entity inbox (Fase 3b). Status QUOTED/EXPIRED disiapkan di CHECK tapi belum ada transisinya.
- **Gate role:** menu terlihat sales/gm_bd/procurement/manager+; **hanya sales/gm_bd yang bisa Submit/Draft** (RLS `prf_insert`). Detail: `04_ROLE_PERMISSION_MATRIX`. Skema: `03_DATA_MODEL` (tabel `prf`). Rujukan desain: `AUDIT_PROCUREMENT.md`.

---

## [Modul lain]

- **Finance (transaksi), Procurement/PO, Approval engine runtime, Billing/AR-AP, Reporting konsolidasi** — [TODO: belum cukup info / belum dibangun. Lihat `docs/09_ROADMAP.md` status 📋].
