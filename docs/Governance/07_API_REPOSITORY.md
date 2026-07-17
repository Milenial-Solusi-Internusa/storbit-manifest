# API & REPOSITORY — Nexus by MSI

> Supabase client patterns, RPC, Edge Functions, query patterns, error handling. Sumber: `supabase/schema_snapshot.sql`, `docs/03_DATA_MODEL.md`, `docs/02_RULES_GOVERNANCE.md`.

---

## 1. Supabase Client Pattern

- **Init:** `import { supabase } from '../../lib/supabase'` (singleton; anon key + URL dari env). Service-role key **TIDAK** pernah di frontend.
- **Auth:** `useAuth()` (`src/contexts/`) → `{ profile, erpRole, user, hasPermission, hasMenuPermission, isCrossEntity, permissionsLoading, ... }`. `erpRole` dari `user_roles` (bukan `profiles.role`). Super-admin gating via `is_super_admin()` RPC / `erpRole==='super_admin'`.
- **Fetch yang benar:**
  - **Selalu `.limit(1000)`** (default PostgREST = 10, silent) atau server-side `.range(from, to)`.
  - **`.maybeSingle()`** bila bisa 0-row (bukan `.single()` yang throw "coerce" saat 0/banyak). `.single()` hanya bila yakin tepat 1.
  - **Select kolom eksplisit**, hindari `SELECT *` untuk list besar.
  - **`.is('deleted_at', null)`** untuk tabel business (kecuali `profiles` → pakai `.eq('active', true)`).
  - **Scope:** `company_id` + role-aware (lihat §4).
  - **Embed FK alias** saat constraint belum di-rename: `prospect:accounts!inquiries_prospect_id_fkey(name)`, `customers:accounts!sp_items_customer_id_fkey(name)` — alias menjaga consumer/mapper tak berubah.

---

## 2. RPC Functions

(Dari `schema_snapshot.sql`. Panggil via `supabase.rpc(name, params)`.)

| RPC | Signature | Tujuan / kapan dipakai | Catatan |
|-----|-----------|------------------------|---------|
| `save_quotation` | `(p_quotation_id uuid, p_header jsonb, p_items jsonb)` → `jsonb` | Simpan quotation **atomik** (EDIT path). UPDATE header (COALESCE per-field) + DELETE+INSERT items dalam 1 txn. | `RAISE` bila RLS tolak / 0-row. Terima `p_header.vat_rate`. SECURITY [TODO: konfirmasi DEFINER/INVOKER]. |
| `increment_document_sequence` | `(p_company_id uuid, p_document_type text, p_department_code text, p_year int, p_month int=0)` → int | Generate nomor dokumen sekuensial (QUO/HRG/SP/dll). | **SECURITY DEFINER**, atomik. Seed sequence dulu untuk doc type baru. |
| `is_super_admin` | `()` → bool | Gating super-admin (RLS + frontend). | Top-level RLS bypass. |
| `get_user_company_id` | `()` → uuid | Company user dari profiles. | STABLE SECURITY DEFINER. Null di SQL Editor. |
| `is_admin_or_above` | `()` → bool | super_admin + admin saja. | ⚠️ tak kenal manager/ceo (TD-01). |
| `is_manager_or_above` | `()` → bool | super_admin/admin/ceo/gm/manager/sales_head. | — |
| `has_permission` | `(module_code text, action_code text)` → bool | Cek role_permissions. | ⚠️ flagged broken/unseeded (TD-02). |
| `has_role` | `(role_code text)` → bool | Cek role di user_roles. | — |
| `get_user_role_code` | `()` → text | Role code user. | — |
| `get_table_columns` | `(p_table text)` | Introspeksi kolom (Schema Manager, `useCustomFields`). | — |
| `exec_sql` | `(sql text)` | Eksekusi SQL arbitrer. | **Service-role only** (Edge Function `manage-schema`). Jangan ekspos ke frontend. |
| `int_to_roman` | `(num int)` → text | Helper (code customer angka romawi). | — |
| **Trigger fns** (bukan RPC langsung) | — | `generate_customer_code()`, `set_customer_on_won()`, `handle_new_user()`, `set_updated_at()`, `capture_login_session()`. | Jalan via trigger. |

---

## 3. Edge Functions

Folder `supabase/functions/`. Pola umum: CORS const + `json()` helper + **two-client** (`callerClient` ANON_KEY+Authorization untuk `rpc('is_super_admin')` gate; `adminClient` SERVICE_ROLE_KEY untuk operasi privileged); Deno std http `serve`.

| EF | Status | Fungsi |
|----|--------|--------|
| **`create-user`** | ✅ ada (deployed) | Body user baru → `auth.admin.createUser` + upsert `profiles` (full_name/company/branch/dept/position, **tanpa role** sejak 2.3G) + upsert `user_roles` (role_id). Gate `is_super_admin`. |
| **`delete-user`** | ✅ kode ada, **deploy pending** (TD-21) | Body `{user_id}`; gate super_admin; safety tolak hapus akun sendiri; hapus `user_roles` → `profiles` → `auth.admin.deleteUser`. |
| **`reset-password`** | ✅ kode ada, **deploy pending** (TD-21) | Body `{user_id, new_password}` (min 8); gate super_admin; `auth.admin.updateUserById(password)`. |
| **`manage-schema`** | ✅ ada, **re-deploy pending** (TD-22) | Schema Manager — `add_column` dll via `exec_sql` (service-role). Gate via `callerClient.rpc('is_super_admin')`. |

**Deploy:** `supabase functions deploy delete-user reset-password manage-schema create-user`. Pastikan `SUPABASE_ANON_KEY` ter-set di env (manage-schema pakai `MSI_DB_KEY` untuk service). EF tidak masuk Vite build/lint — verifikasi syntax saat deploy.

---

## 4. Query Patterns (contoh per tipe data)

**Role-aware scope (template CRM):**
```js
const isAllEntities = ['super_admin'].includes(erpRole);
const isSalesOnly   = ['sales','operations'].includes(erpRole);
if (!profile?.id) return;
if (!isAllEntities && !profile?.company_id) return;
let q = supabase.from('accounts').select('…').eq('account_status','prospect').is('deleted_at', null);
if (!isAllEntities) q = q.eq('company_id', profile.company_id);
if (isSalesOnly)    q = q.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);
const { data, error } = await q.order('created_at',{ascending:false}).limit(1000);
```

- **accounts (CRM):** `.eq('account_status', 'prospect'|'customer'|'lead_pool'|'free_agent')` + embed `assigned_profile:profiles!prospects_assigned_to_fkey(full_name)`.
- **activities:** `.from('activities')` + embed `account:accounts!activities_account_id_fkey(name)`; nama sales via map id→full_name (assigned_to TIDAK punya FK ke profiles). Lifecycle log ke `activity_logs`.
- **quotations + items:** detail = `Promise.all([quotations…maybeSingle(), quotation_items…order(sort_order)])`; embed customer/prospect via `accounts!quotations_*_fkey`. Save EDIT via RPC `save_quotation`; CREATE via insert + `.select('id').single()`.
- **profiles + roles:** `profiles` filter `.eq('active', true)`; `user_roles.user_id → auth.users` (bukan profiles) → query terpisah `.in('user_id', ids)` lalu map company_id/role.
- **currencies:** `.eq('is_active', true).order('code')` — RLS `USING(true)`.
- **roster salesperson (`salesRoster.js`):** `fetchOperationalRoster(companyId)` — `roles.code IN ('sales','gm_bd')` (**RBAC, tak pernah hardcode role_id**) → `user_roles` (`is_active` + `revoked_at IS NULL`) → `profiles` (`active`). **Selalu company-scoped.** Satu-satunya sumber roster operasional (4 salinan `fetchSalesProfiles` dihapus 17 Jul). ⚠️ **Bukan** untuk roster laporan (`CRMReportPage`) & assignee deal (`DealDetailPage`) — beda kriteria, lihat `04_ROLE_PERMISSION_MATRIX` §3.1.
- **unified feed (`activityFeed.js`):** merge 5 sumber (accounts/inquiries/quotations/activity_logs/user_login_logs); embed FK pakai nama constraint sendiri (`inquiries_prospect_id_fkey`, dll); `user_login_logs` tanpa filter company (RLS).

---

## 5. Error Handling Pattern

- **Cek `error` tiap call:** `const { data, error } = await …; if (error) throw error;` → tangkap di `try/catch` → `showToast?.('Pesan: ' + err.message, 'error')`.
- **Silent-fail RLS (BAHAYA):** UPDATE/DELETE yang ke-block RLS **tidak** selalu mengembalikan `error` — bisa "sukses" 0-row. **Deteksi 0-row** dengan `.select('id')` lalu cek `!data.length`:
  ```js
  const { data, error } = await supabase.from('quotations').update({…}).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('0 baris ter-update (cek izin akses).');
  ```
  (Pelajaran: `quotation_items` delete-then-insert silent gagal karena policy DELETE hilang → fix policy + pola ini.)
- **`.maybeSingle()`** untuk render yang aman 0-row (guard `if (!quot) return <NotFound/>`).
- **Fire-and-forget log** (mis. `activity_logs`): jangan block UI / jangan toast — `console.error` saja di `.then(({error})=>{ if(error) console.error(...) })`.
- **Edge Function error:** unwrap `error.context.json()` untuk surface pesan asli dari EF (pola `createUser`/`deleteUser` di `useUserAccess.js`).
- **Generate nomor dokumen:** RPC gagal → **throw** (jangan fallback timestamp non-sekuensial) → batalkan save.
- **Embed FK error (400):** kalau constraint di-rename DBA, embed `!constraint` error → update nama constraint di query.
