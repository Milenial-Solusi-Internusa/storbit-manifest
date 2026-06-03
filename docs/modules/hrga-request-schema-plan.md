# HRGA Request Module — Schema Plan

**Status:** APPROVED — open questions resolved, migration in progress  
**Branch:** `phase-2-service-management`  
**Last Updated:** 2026-06-02 (revised — open questions resolved)  
**Author:** Den / Claude

---

## 1. Scope

HRGA Request adalah sub-modul dari **Service Management**, covering semua permintaan karyawan ke divisi HRGA.

### In-Scope Categories

| Kode | Nama Kategori | Sub-tipe |
|---|---|---|
| `ADM` | Administrasi & Dokumen | Surat keterangan kerja, surat keterangan penghasilan, surat referensi, slip gaji ulang, legalisir dokumen |
| `AST` | Aset & Perlengkapan | ATK/supplies, seragam/ID card/name tag, kartu nama, peminjaman laptop, peminjaman kendaraan, SIM card/nomor dinas |
| `FAC` | Fasilitas & Operasional | Akses gedung, parkir, loker, booking ruang meeting, perbaikan ruangan, housekeeping khusus |
| `TRV` | Perjalanan Dinas | Pengajuan perjalanan, uang muka, reimbursement, booking hotel/tiket |
| `FIN` | Keuangan & Reimbursement | Reimbursement operasional, reimbursement kesehatan, petty cash, uang muka kerja |
| `OFF` | Offboarding | Checklist offboarding karyawan |

### Out-of-Scope (Phase 2+)

- Recruitment & Onboarding
- Payroll / Absensi
- Klaim Asuransi

---

## 2. Approval Matrix

Tabel ini adalah source of truth untuk konfigurasi approval rules. Setiap baris menjadi satu record di `hrga_approval_configs`.

| Request Type | Level 1 | Level 2 | Level 3 | Notes |
|---|---|---|---|---|
| Surat keterangan kerja | HRGA | — | — | |
| Surat keterangan penghasilan | HRGA | — | — | |
| Surat referensi | HRGA | — | — | |
| Slip gaji ulang | HRGA | — | — | |
| Legalisir dokumen | HRGA | — | — | |
| Seragam / ID card / name tag | HRGA | — | — | |
| Kartu nama | HRGA | — | — | |
| Booking ruang meeting | HRGA | — | — | |
| Peminjaman kendaraan | HRGA | — | — | |
| ATK / supplies | Supervisor | HRGA | — | |
| Peminjaman laptop | IT | HRGA | — | |
| SIM card / nomor dinas | HRGA | IT | — | |
| Akses gedung | HRGA | IT | — | |
| Perbaikan ruangan | HRGA | Finance | — | |
| Perjalanan dinas | Supervisor | HRGA | Finance | |
| Reimbursement operasional | Supervisor | HRGA | Finance | |
| Reimbursement kesehatan | Supervisor | HRGA | Finance | |
| Petty cash / uang muka kerja | Supervisor | Finance | — | |
| Offboarding checklist | HRGA | IT | Finance | |

---

## 3. Table Design

### 3.1 `hrga_request_types`

Master data tipe request. Seed-able, managed by super_admin/HRGA admin.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id          uuid NOT NULL REFERENCES companies(id)
category_code       varchar(10) NOT NULL          -- ADM, AST, FAC, TRV, FIN, OFF
category_name       varchar(100) NOT NULL
type_code           varchar(30) NOT NULL           -- e.g. ADM_SKK, AST_ATK
type_name           varchar(150) NOT NULL
description         text
requires_attachment boolean DEFAULT false
requires_amount     boolean DEFAULT false          -- tampilkan field nominal
requires_date_range boolean DEFAULT false          -- tampilkan tanggal mulai/selesai
approval_levels     int NOT NULL DEFAULT 1         -- 1, 2, atau 3
is_active           boolean DEFAULT true
sort_order          int DEFAULT 0
created_by          uuid REFERENCES auth.users(id)
updated_by          uuid REFERENCES auth.users(id)
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
deleted_at          timestamptz

UNIQUE (company_id, type_code)
```

---

### 3.2 `hrga_approval_configs`

Konfigurasi chain approval per `request_type_id` per company. Satu record per level.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id          uuid NOT NULL REFERENCES companies(id)
request_type_id     uuid NOT NULL REFERENCES hrga_request_types(id)
level               int NOT NULL                  -- 1, 2, 3
approver_role       varchar(50)                   -- role_code dari roles table: 'hrga', 'it', 'finance', 'supervisor'
approver_user_id    uuid REFERENCES auth.users(id) -- optional: specific user override
is_active           boolean DEFAULT true
created_by          uuid REFERENCES auth.users(id)
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()

UNIQUE (request_type_id, level)
```

> **Note:** `approver_role` menggunakan nilai role_code dari tabel `roles`. Tidak di-hardcode.  
> Level diisi berurutan (1, 2, 3). Jika `approval_levels = 1`, hanya ada record dengan `level = 1`.

---

### 3.3 `hrga_requests`

Header tabel. Satu record = satu request yang diajukan karyawan.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id          uuid NOT NULL REFERENCES companies(id)
document_no         varchar(50) NOT NULL UNIQUE    -- format: HRG/MSI/YYYY/NNNN
request_type_id     uuid NOT NULL REFERENCES hrga_request_types(id)
requester_id        uuid NOT NULL REFERENCES auth.users(id)
department_id       uuid REFERENCES departments(id)
branch_id           uuid REFERENCES branches(id)

-- Konten request
subject             varchar(300) NOT NULL
description         text
requested_date      date                           -- tanggal dibutuhkan (bukan tanggal submit)
start_date          date                           -- untuk perjalanan dinas / booking
end_date            date
amount              numeric(18,4)                  -- untuk reimbursement / petty cash / uang muka
currency_id         uuid REFERENCES currencies(id)
destination         varchar(200)                   -- untuk perjalanan dinas
notes               text

-- Status & Approval tracking
status              varchar(30) NOT NULL DEFAULT 'draft'
                    -- draft | submitted | under_review | revision_requested
                    -- revised | approved | rejected | cancelled | completed | archived
current_level       int DEFAULT 0                  -- level approval yang sedang aktif (0 = belum submit)
total_levels        int NOT NULL DEFAULT 1

-- Timestamps
submitted_at        timestamptz
approved_at         timestamptz
rejected_at         timestamptz
completed_at        timestamptz

-- Audit
created_by          uuid REFERENCES auth.users(id)
updated_by          uuid REFERENCES auth.users(id)
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
deleted_at          timestamptz
```

**Status lifecycle untuk HRGA Request:**

```
draft → submitted → under_review → approved → completed
                              ↓
                    revision_requested → revised → submitted (re-submit)
                              ↓
                           rejected  (terminal)
draft/submitted → cancelled  (terminal)
```

---

### 3.4 `hrga_request_items`

Detail item untuk request yang membutuhkan line items (ATK, seragam, perjalanan multi-destinasi, dll).

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
request_id          uuid NOT NULL REFERENCES hrga_requests(id) ON DELETE CASCADE
line_no             int NOT NULL DEFAULT 1
item_description    varchar(300) NOT NULL
quantity            numeric(18,4) DEFAULT 1
unit                varchar(50)                    -- pcs, set, hari, malam, dll
unit_price          numeric(18,4)
total_price         numeric(18,4)
notes               text
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

> **Keputusan (2026-06-02):** `hrga_request_items` **aktif dari MVP**. Digunakan untuk ATK/supplies (list barang), offboarding checklist (via dedicated table), dan perjalanan dinas multi-destinasi.  
> `hrga_request_types.requires_amount` menentukan apakah amount field wajib. Untuk TRV dan FIN categories, `amount` di header wajib diisi saat submit (server-side validation).

---

### 3.5 `hrga_request_approvals`

Log setiap aksi approval per level. Immutable — tidak ada UPDATE atau DELETE.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
request_id          uuid NOT NULL REFERENCES hrga_requests(id)
level               int NOT NULL
approver_id         uuid NOT NULL REFERENCES auth.users(id)
approver_role       varchar(50)                    -- snapshot role saat approval
action              varchar(30) NOT NULL           -- approved | rejected | revision_requested | noted
comment             text
actioned_at         timestamptz DEFAULT now()
created_at          timestamptz DEFAULT now()
```

> **INSERT-only policy** — approval history tidak boleh diubah.  
> `actioned_at` dicatat saat aksi dilakukan, bukan saat row di-insert.

---

### 3.6 `hrga_request_attachments`

File attachments per request. Menggunakan Supabase private storage.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
request_id          uuid NOT NULL REFERENCES hrga_requests(id)
file_name           varchar(255) NOT NULL
storage_path        text NOT NULL                  -- path di Supabase private bucket
file_size_bytes     bigint
mime_type           varchar(100)
uploaded_by         uuid NOT NULL REFERENCES auth.users(id)
uploaded_at         timestamptz DEFAULT now()
deleted_at          timestamptz                    -- soft delete
```

---

### 3.7 `hrga_notification_queue`

Queue untuk email notifications yang akan diproses oleh n8n atau Supabase Edge Function.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id          uuid NOT NULL REFERENCES companies(id)
request_id          uuid NOT NULL REFERENCES hrga_requests(id)
recipient_id        uuid NOT NULL REFERENCES auth.users(id)
recipient_email     varchar(200) NOT NULL          -- snapshot email saat queue dibuat
notification_type   varchar(50) NOT NULL
                    -- request_submitted | request_approved | request_rejected
                    -- approval_pending | revision_requested
payload             jsonb                          -- data tambahan untuk template email
status              varchar(20) DEFAULT 'pending'  -- pending | sent | failed | skipped
sent_at             timestamptz
error_message       text
created_at          timestamptz DEFAULT now()
```

> Trigger atau aplikasi menulis ke tabel ini saat status request berubah.  
> Worker (n8n / Edge Function) membaca `status = 'pending'`, kirim email, update ke `sent`.

---

### 3.8 `hrga_offboarding_checklists`

Master template checklist offboarding per company. Digunakan sebagai seed item saat request offboarding dibuat.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id          uuid NOT NULL REFERENCES companies(id)
department          varchar(50) NOT NULL DEFAULT 'ALL'
                    -- 'ALL' = berlaku semua departemen, atau nama dept spesifik
responsible_role    varchar(50) NOT NULL           -- 'hrga' | 'it' | 'finance'
item_order          int NOT NULL DEFAULT 0
item_description    varchar(300) NOT NULL
is_required         boolean DEFAULT true           -- wajib diselesaikan atau opsional
notes               text
is_active           boolean DEFAULT true
created_by          uuid REFERENCES auth.users(id)
updated_by          uuid REFERENCES auth.users(id)
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
deleted_at          timestamptz
```

### 3.9 `hrga_offboarding_items`

Realisasi checklist per request offboarding. Di-generate otomatis dari `hrga_offboarding_checklists` saat request type `OFF` dibuat/disubmit.

```sql
id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4()
request_id          uuid NOT NULL REFERENCES hrga_requests(id) ON DELETE CASCADE
checklist_id        uuid REFERENCES hrga_offboarding_checklists(id)  -- NULL jika item manual
item_order          int NOT NULL DEFAULT 0
item_description    varchar(300) NOT NULL
responsible_role    varchar(50) NOT NULL
is_required         boolean DEFAULT true
status              varchar(20) DEFAULT 'pending'  -- pending | done | skipped | na
completed_by        uuid REFERENCES auth.users(id)
completed_at        timestamptz
notes               text
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

---

## 4. Entity Relationship Diagram (ringkas)

```
companies
  ├── hrga_request_types (per company, kategori + tipe)
  │     └── hrga_approval_configs (chain per tipe, per level)
  └── hrga_offboarding_checklists (template checklist per company)

profiles / auth.users
  └── hrga_requests (requester)
        ├── hrga_request_items         (line items — aktif dari MVP)
        ├── hrga_request_approvals     (log aksi approval, immutable)
        ├── hrga_request_attachments   (file, private storage)
        ├── hrga_notification_queue    (email queue → Edge Function)
        └── hrga_offboarding_items     (realisasi checklist, dari OFF request)
              └── hrga_offboarding_checklists (template reference)
```

---

## 5. RLS Approach

### Policy Philosophy

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `hrga_request_types` | company_id scope | admin/hrga only | admin/hrga only | No DELETE (soft-delete) |
| `hrga_approval_configs` | company_id scope | admin/hrga only | admin/hrga only | No DELETE |
| `hrga_requests` | company_id scope + row ownership | requester (own only) | requester (draft) or approver (status update) | No DELETE |
| `hrga_request_items` | via request ownership | requester (draft state only) | requester (draft state only) | No DELETE |
| `hrga_request_approvals` | company_id scope | approver (own action) | **No UPDATE** | **No DELETE** |
| `hrga_request_attachments` | company_id scope | requester/approver | No UPDATE | Soft-delete only |
| `hrga_notification_queue` | admin/service only | app/trigger | service worker only | No DELETE |
| `hrga_offboarding_checklists` | company_id scope | admin/hrga only | admin/hrga only | No DELETE (soft-delete) |
| `hrga_offboarding_items` | via request ownership | system (on submit) | approver/responsible role | No DELETE |

### Key RLS Rules

1. **Karyawan hanya bisa lihat request milik sendiri** — bukan request orang lain di company yang sama.
2. **HRGA, IT, Finance dapat melihat semua request** yang masuk ke approval queue mereka — filter by `current_level` dan role mereka.
3. **Super admin dapat melihat semua request** di scope company mereka.
4. **Approver hanya bisa approve/reject request yang assigned ke mereka** (level + role match).
5. **Requester hanya bisa edit request di status `draft`** — setelah submit, request locked.
6. **Notification queue tidak bisa dibaca atau diubah oleh user biasa** — hanya service role atau Edge Function.

### RLS Helper Functions yang Dibutuhkan

Fungsi-fungsi ini sudah ada dari migration 014:
- `get_user_company_id()` ✅
- `is_super_admin()` ✅
- `is_admin_or_above()` ✅
- `has_role(role_code)` ✅

Fungsi baru yang dibutuhkan:
```sql
-- Cek apakah user adalah approver HRGA, IT, atau Finance
-- (untuk SELECT policy pada hrga_requests)
is_hrga_approver()     -- has_role('hrga') OR is_super_admin()
```

> Kita bisa langsung pakai `has_role()` yang sudah ada daripada membuat fungsi baru.

---

## 6. Document Numbering

Format: `HRG/{ENTITY}/{YYYY}/{NNNN}`

Contoh:
- `HRG/MSI/2026/0001`
- `HRG/JCI/2026/0042`

Menggunakan tabel `document_sequences` yang sudah ada di migration 010.

---

## 7. Notification Design

### Trigger Points

| Event | Notifikasi ke |
|---|---|
| Request di-submit | Requester (konfirmasi), Approver Level 1 (action needed) |
| Level N approved (ada level berikutnya) | Approver Level N+1 (action needed) |
| Request fully approved | Requester |
| Request rejected | Requester |
| Revision requested | Requester |

### Implementation Options

**Option A — Supabase Database Trigger:**
- Trigger pada `hrga_requests` saat `status` berubah → INSERT ke `hrga_notification_queue`
- Edge Function polling / cron untuk kirim email dari queue
- Pro: atomic dengan status change; Con: trigger logic bisa kompleks

**Option B — Application-level (direkomendasikan untuk MVP):**
- Aplikasi menulis ke `hrga_notification_queue` setelah setiap status mutation
- n8n webhook atau Edge Function cron membaca queue dan kirim email
- Pro: lebih mudah debug dan maintain; sesuai dengan n8n integration plan

**Keputusan:** Gunakan **Option B** untuk MVP. Trigger database bisa ditambahkan kemudian sebagai defense-in-depth.

---

## 8. Migration Plan

Akan dibuat dalam 1 migration file setelah schema ini diapprove:

`supabase/migrations/20260602000020_hrga_request_schema.sql`

Urutan objek dalam migration:
1. `hrga_request_types`
2. `hrga_approval_configs`
3. `hrga_requests`
4. `hrga_request_items`
5. `hrga_request_approvals`
6. `hrga_request_attachments`
7. `hrga_notification_queue`
8. `hrga_offboarding_checklists`
9. `hrga_offboarding_items`
10. Indexes
11. RLS enable + policies per tabel
12. Rollback SQL sebagai comment block

---

## 9. Seed Data Plan

Setelah migration diapprove, akan dibuat seed migration terpisah:

`supabase/migrations/20260602000021_hrga_request_types_seed.sql`

Seed mencakup:
- 20 request types dari approval matrix (Section 2) untuk semua 3 company (MSI, JCI, SBI)
- `hrga_approval_configs` rows per request type (1–3 level each)

---

## 10. Open Questions — RESOLVED (2026-06-02)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Apakah `hrga_request_items` diaktifkan dari MVP atau setelah? | ✅ **Aktif dari MVP** |
| 2 | Approval by role vs by specific user | ✅ **Role-only untuk MVP** |
| 3 | Apakah offboarding checklist pakai form yang sama atau form khusus? | ✅ **Dedicated table** (`hrga_offboarding_checklists` + `hrga_offboarding_items`) |
| 4 | Apakah notifikasi email via n8n atau Supabase Edge Function? | ✅ **Supabase Edge Function** (sama seperti `create-user`) |
| 5 | Attachment storage bucket name? | ✅ `hrga-attachments` |
| 6 | Apakah satu karyawan bisa punya multiple draft request sekaligus? | ✅ **Yes, no limit** |
| 7 | Apakah amount field wajib untuk TRV dan FIN categories? | ✅ **Wajib saat submit** (server-side validation di Edge Function / RPC) |

---

## 11. Risk Assessment

| Risk | Level | Mitigasi |
|---|---|---|
| Approval config tidak match role_code di `roles` table | Medium | FK atau CHECK constraint ke `roles.role_code`; seed approval_configs setelah roles seed |
| Status update race condition (dua approver klik approve bersamaan) | Low | `current_level` check di UPDATE policy + optimistic concurrency via `updated_at` |
| Notification queue tidak terkirim (worker down) | Low | Status `pending` + retry logic di worker; `error_message` untuk debug |
| Attachment storage path collision | Very Low | UUID di storage path: `{company_id}/{request_id}/{uuid}_{filename}` |
| RLS: approver bisa lihat semua request terlalu luas | Medium | SELECT policy harus scoped: approver hanya lihat request yang ada di approval queue mereka (`current_level` match) |

---

## Status

- [x] Requirements gathered
- [x] Approval matrix defined
- [x] Table design drafted (9 tables incl. offboarding)
- [x] RLS approach outlined
- [x] Open questions resolved (2026-06-02)
- [x] Schema plan approved
- [x] Migration SQL — `20260602000020_hrga_request_schema.sql` (reviewed + 3 fixes applied)
- [x] Seed data — `20260602000021_hrga_request_seed.sql`
- [ ] Staging execution
