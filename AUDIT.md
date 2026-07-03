# AUDIT: Halaman baru "Riwayat Visit" (Sales Report) — peta data & pola

> Auditor mode. **Read-only** — tidak ada kode/DB yang diubah; hanya dokumen ini yang ditulis (menimpa isi lama).
> Rencana: halaman "Riwayat Visit" (sub-menu Sales Report) — tabel semua historical visit, filter lengkap, detail + MOM, role-gated, export PDF.
> Bukti: `file:line` / nama kolom. File utama: `supabase/schema_snapshot.sql`, `src/App.jsx`, `src/modules/crm/CRMDashboardPage.jsx`, `src/modules/crm/CRMReportPage.jsx`, `src/modules/crm/ActivityReportPDF.jsx`.

---

## RINGKASAN

**Semua yang kamu mau BISA dibangun dari data yang ada — tanpa perubahan DB.** Visit tersimpan lengkap di tabel `activities` (semua history, bukan cuma bulan berjalan — keunggulan utama vs kalender yang month-locked).

**Siap (tinggal query):** tabel visit, filter **Sales / Periode tanggal / Status / Customer / Entitas**, detail + **MOM** (`details.mom`), export PDF (ada template `ActivityReportPDF` yang tinggal ditiru).

**Butuh penyesuaian / catatan:**
- **Nama sales** bukan JOIN DB — `assigned_to` **tak punya FK**; namanya di-resolve lewat fetch terpisah ke `profiles` (pola sudah ada di codebase).
- **Filter Visit Type** ada tapi di dalam **jsonb** (`details.visit_type`), bukan kolom → filter kurang bersih (client-side / `details->>'visit_type'`).
- **Filter Entitas (MSI/JCI/SOA)** hanya bermakna untuk **super_admin** — RLS membatasi non-super hanya ke company sendiri.
- **Scope data otomatis by RLS:** super_admin lihat semua entitas; manager+ lihat se-company; sales biasa hanya visit sendiri. Ini menentukan apa yang muncul walau menu di-role-gate.

---

## TEMUAN PER PERTANYAAN

### 1. Struktur data visit (tabel `activities`)

Kolom `activities` (`supabase/schema_snapshot.sql`, `CREATE TABLE public.activities`):
`id, company_id, account_id, inquiry_id, quotation_id, assigned_to, type, status, scheduled_for, activity_time, completed_at, prospect_name, contact_name, contact_phone, outcome, notes, next_action, next_action_date, details (jsonb DEFAULT '{}'), migrated_from, created_by, created_at, updated_at, deleted_at`.

- **Penanda "visit":** kolom **`type`** (text, `NOT NULL`). Visit = `type = 'visit'`. Tidak ada CHECK enum di schema, tapi konvensi app konsisten: `.eq('type', 'visit')` (`CRMDashboardPage.jsx:1840`). Jenis lain: call/meeting/prospecting/followup.
- **Tanggal visit:** **`scheduled_for`** (date) + **`activity_time`** (time). `completed_at` (timestamptz) saat selesai.
- **Sales / pemilik:** **`assigned_to`** (uuid; **tanpa FK** — lihat Q3). `created_by` = pembuat.
- **Customer/prospect dikunjungi:** **`account_id`** (uuid, FK → `accounts`, `:6715`) + **`prospect_name`** (text, denormalized/fallback untuk baris tanpa account_id).
- **Status:** **`status`** (text: `todo`/`done`/`cancelled`) → di UI visit dipetakan ke `scheduled`/`completed`/`cancelled` via `ACT_TO_VISIT_STATUS = { todo:'scheduled', done:'completed', cancelled:'cancelled' }` (`CRMDashboardPage.jsx:998`; `VISIT_STATUS` meta `:988`).
- **MOM:** **`details.mom`** (di dalam `details` jsonb). `details` juga memuat `visit_type`, `location`, `point_of_meeting` (`:2086-2089`). `next_action` = follow-up; `outcome`/`notes` teks bebas.

### 2. Field untuk filter (feasibility)

| Filter | Kolom sumber | Status data |
|---|---|---|
| **Sales** | `assigned_to` (uuid) | ✅ siap — nama via fetch `profiles` (Q3) |
| **Periode tanggal** | `scheduled_for` (date) | ✅ siap — query `.gte/.lte` bebas rentang (bukan month-locked) |
| **Status visit** | `status` (todo/done/cancelled) | ✅ siap — map ke scheduled/completed/cancelled |
| **Customer / Prospect** | `account_id` → `accounts.name`, atau `prospect_name` | ✅ siap — filter by account_id / search nama |
| **Entitas (MSI/JCI/SOA)** | `company_id` → `companies.code` (FK `:6723`) | ✅ siap **tapi hanya berguna utk super_admin** (RLS scope) |
| **Visit Type** | `details.visit_type` (jsonb) | ⚠️ bisa, tapi di jsonb → `details->>'visit_type'` atau filter client-side; data mungkin tidak selalu terisi |
| **Ada MOM / punya MOM** | `details.mom` not null | ⚠️ derivable (client-side / jsonb) |
| **Search (customer/prospect/notes)** | `prospect_name` / `notes` / `accounts.name` | ✅ siap |

**Tidak ada backing kolom langsung:** nama sales (bukan kolom — hasil fetch), visit_type & mom (di jsonb, bukan kolom top-level). Semua tetap feasible, hanya bukan filter-by-column murni.

### 3. Relasi nama

- **Nama sales:** `assigned_to` (uuid) → **TIDAK ada FK** (FK activities hanya account/company/inquiry/quotation, `:6715-6739`). Nama di-resolve **fetch terpisah**: kumpulkan `assigned_to` unik → `supabase.from('profiles').select('id, full_name').in('id', ids)` → map client-side. Pola existing: kalender `CRMDashboardPage.jsx:1990`, `ActivitiesPage.jsx:160/286`. (Alternatif roster: `fetchSalesProfiles` via `user_roles`.)
- **Nama customer/prospect:** `account_id` → **embed FK** `account:accounts!activities_account_id_fkey(name)` (dipakai `CRMDashboardPage.jsx:812`; kalender pakai alias `prospects:accounts!activities_account_id_fkey(name)` `:1838`). **Fallback** `prospect_name` (text) untuk baris tanpa account_id — pola `accountLabel(act.account, act.prospect_name)` (`ActivitiesPage.jsx:212`).
- **Entitas:** `company_id` → embed `company:companies!activities_company_id_fkey(code)` (FK `:6723`) → kode MSI/JCI/SOA.

### 4. Pola role-gating (existing)

Tiga lapis yang sudah dipakai:
1. **Menu `role: [...]` (utama)** — `canSeeMenuItem` cek `item.role.includes(role)`. Contoh persis yang kamu mau: `reporting-sales` di `App.jsx:786` → `role: ['super_admin','admin','ceo','gm','manager','supervisor']`. Untuk "Riwayat Visit" tinggal set array role (mis. `['super_admin','ceo', …]`).
2. **Cek `erpRole` di komponen** — `const { erpRole } = useAuth();` lalu `erpRole === 'super_admin'` (mis. `MOMListPage.jsx`, `CustomerDetailPage.jsx`).
3. **Guard render defense-in-depth** — `activeMenu==='x' && (canRenderPage('x') ? <Page/> : <AccessDeniedPage/>)` (dipakai `products` di `App.jsx:2794`, `bulk-edit-price`, `schema-manager` [super-only inline]). **Catatan:** render block `reporting-sales` (`App.jsx:3108`) **tidak** memakai guard ini — hanya mengandalkan menu role array. Rekomendasi: pakai role array + tambah guard `canRenderPage` untuk halaman sensitif.

**Scope data by RLS (`activities_select`, `:8747`):** `(company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=self OR created_by=self)) OR is_super_admin()`. Artinya: super_admin → semua entitas; manager+ → se-company; sales biasa → hanya visit sendiri. Role-gate menu + RLS bekerja bersama.

### 5. Pola menu baru (Sales Report / Reporting)

Ikuti persis pola `reporting-sales`/`reporting-mom`:
1. **ERP_MENU_GROUPS** grup "Reporting & Governance" (`App.jsx:774-788`) — tambah item sejajar `reporting-sales`, dgn `role: [...]` + `icon`. (id usul: `riwayat-visit`.)
2. **NEXUS_NAV** grup `nav-report` children (`App.jsx:965-968`) — tambah entri yang sama.
3. **Render block** — tambah `{activeMenu === 'riwayat-visit' && ( … <RiwayatVisitPage/> … )}` dekat `:3108` (lazy import halaman baru).
4. **⚠️ WAJIB — daftar pengecualian ComingSoon** (`App.jsx:2610`): tambahkan `'riwayat-visit'` ke array `!['dashboard', … ,'reporting-sales','reporting-mom'].includes(activeMenu)`. Kalau lupa → halaman ketimpa ComingSoon generik.
5. (Opsional) bell/notif mapping — tak perlu utk halaman ini.

### 6. Pola PDF export

**Template terbaik: `src/modules/crm/ActivityReportPDF.jsx`** (paling relevan — sudah PDF aktivitas). Pola:
- Komponen `@react-pdf/renderer` (`Document/Page/View/Text/StyleSheet`), props `{ meta, summary, rows }` (header dokumen `ActivityReportPDF.jsx:4-6`).
- Dipanggil di `CRMReportPage.jsx:479`: `const blob = await pdf(<ActivityReportPDF meta={…} summary={…} rows={exportRows} />).toBlob();` lalu download via `URL.createObjectURL` + `<a download>`.
- Brand cetak navy (bukan rebrand layar), Helvetica.

Alternatif lain yang sepola: `QuotationPDF`/`DeliveryNotePDF`/`RateSheetPDF` + `PDFDownloadLink` (dipakai `InquiryListPage`). Untuk Riwayat Visit, **tiru `ActivityReportPDF`** (kolom: Tanggal, Sales, Customer, Status, MOM/Notes) — paling dekat kebutuhan.

### 7. MOM display

- **Struktur:** `details.mom` = **string biasa** (bukan objek/sub-field). Sumbernya textarea free-text di form visit (`CRMDashboardPage.jsx:1232-1233`), disimpan apa adanya (`:2089`). Tidak ada sub-field terstruktur di dalam mom. (`details` jsonb-nya sendiri punya sibling: `visit_type`, `location`, `point_of_meeting`.)
- **Cara tampil:** baca `activity.details.mom` (string) → render di modal/section detail visit. Contoh existing: `VisitDetailModal` menampilkan `row('Minute of Meeting (MOM)', visit.mom)` **hanya saat status completed** (`CRMDashboardPage.jsx:1362`). Untuk Riwayat Visit, tampilkan MOM bila ada (`details.mom` truthy), plus `point_of_meeting`/`next_action` sebagai konteks.

---

## REKOMENDASI STRUKTUR HALAMAN

**Sumber data:** `supabase.from('activities').select('id, scheduled_for, activity_time, status, assigned_to, account_id, prospect_name, notes, next_action, outcome, completed_at, details, account:accounts!activities_account_id_fkey(name), company:companies!activities_company_id_fkey(code)').eq('type','visit').is('deleted_at', null).order('scheduled_for', { ascending: false }).limit(1000)` — lalu resolve nama sales via fetch `profiles` terpisah. (RLS otomatis membatasi per role.)

**Kolom tabel (usul):** Tanggal (`scheduled_for` + `activity_time`) · Sales (nama dari profiles) · Customer/Prospect (`account.name` ?? `prospect_name`) · Entitas (`company.code`, tampil utk super) · Status (badge scheduled/completed/cancelled) · Visit Type (`details.visit_type`) · Ada MOM? (indikator) · Aksi (Detail).

**Filter feasible:** Sales (dropdown, dari profiles) · Periode (date range `scheduled_for`) · Status (scheduled/completed/cancelled) · Customer (dropdown/search account) · Entitas (super_admin saja) · (opsional) Visit Type via `details.visit_type`. Semua client-side atau query — ikut pola `ActivityReportTab` (`CRMDashboardPage.jsx:796`, filter Sales+Periode) yang sudah ada.

**Detail + MOM:** modal/drawer per baris → tampilkan semua field + `details.mom` (string), `point_of_meeting`, `location`, `next_action`, `notes`, `outcome`. Pola `VisitDetailModal`.

**Role-gate:** menu `role: ['super_admin', <role pilihanmu, mis. 'ceo','gm','manager'>]` (App.jsx:786-pattern) + tambahkan id ke ComingSoon exclusion (`:2610`) + (disarankan) guard `canRenderPage` di render block. RLS `activities_select` melengkapi (super=semua, manager=company, sales=own).

**PDF:** tiru `ActivityReportPDF.jsx` — bikin `VisitHistoryPDF` props `{ meta, rows }`, generate via `pdf(<…/>).toBlob()` + download (pola `CRMReportPage.jsx:479`).

**Catatan penting untuk diputuskan:** (1) nama sales butuh fetch `profiles` terpisah (bukan join) — pastikan di-batch. (2) Filter Entitas hanya efektif utk super_admin (RLS). (3) Visit Type & MOM ada di jsonb, bukan kolom — filter/tampil via `details->>'…'`. (4) `.limit(1000)` — kalau history sangat besar, pertimbangkan pagination server-side.

---

*Audit selesai. Tidak ada file kode/DB yang diubah. Hanya AUDIT.md ini yang ditulis.*
