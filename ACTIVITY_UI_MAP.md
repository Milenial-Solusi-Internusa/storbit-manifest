# ACTIVITY_UI_MAP.md — Inventory UI Call / Visit / Activity (AS-IS)

> Tanggal: 2026-06-17 · Mode: pemetaan read-only, **tidak ada kode diubah**.
> Tujuan: tahu UI mana yang harus dibangun-ulang vs di-rewire ke tabel `public.activities` (Phase 2.9B).
> Sumber: `grep sales_calls/sales_visits/sales_visit_logs` + baca komponen. Tabel target `activities` lihat `CLAUDE.md` & `CRM_FLOW.md`.

**Ringkas:** **0 file frontend** menyentuh `activities` saat ini. Semua call/visit masih ke `sales_calls`/`sales_visits`/`sales_visit_logs` (DORMANT-target). Penulis aktif: **2 file** (`SalesCallsPage.jsx`, `CRMDashboardPage.jsx`). Pembaca: **+1 live** (`CustomerDetailPage.jsx`) **+1 dead** (`CustomerMasterPage.legacy.jsx`).

---

## KOMPONEN call/visit (file:line — baca/tulis — tabel)

### `sales_calls`
| File:line | Fungsi | Baca/Tulis | Keterangan |
|---|---|---|---|
| [SalesCallsPage.jsx:355](src/modules/crm/SalesCallsPage.jsx#L355) | `fetchCalls` | **READ** | list call, embed `prospect:accounts!sales_calls_prospect_id_fkey` + `salesperson:profiles!...` ([:358-359](src/modules/crm/SalesCallsPage.jsx#L358)), role-scoped (mirror RLS) |
| [SalesCallsPage.jsx:481](src/modules/crm/SalesCallsPage.jsx#L481) | `CallFormModal.handleSave` | **WRITE** (update) | edit call |
| [SalesCallsPage.jsx:483](src/modules/crm/SalesCallsPage.jsx#L483) | `CallFormModal.handleSave` | **WRITE** (insert) | create call (+`company_id`,`created_by`) |
| [CRMDashboardPage.jsx:1551](src/modules/crm/CRMDashboardPage.jsx#L1551) | `fetchDash` | **READ** | KPI "Call Minggu Ini" (count mingguan, sales-scoped) |

### `sales_visits`
| File:line | Fungsi | Baca/Tulis | Keterangan |
|---|---|---|---|
| [CRMDashboardPage.jsx:1541](src/modules/crm/CRMDashboardPage.jsx#L1541) | `fetchDash` | **READ** | sumber **kalender visit** (visitsData), embed `prospects:accounts(name)` + salesperson |
| [CRMDashboardPage.jsx:1560](src/modules/crm/CRMDashboardPage.jsx#L1560) | `fetchDash` | **READ** | KPI "Visit Minggu Ini" (count mingguan) |
| [CRMDashboardPage.jsx:1782](src/modules/crm/CRMDashboardPage.jsx#L1782) | `handleSaveVisit` | **WRITE** (update) | edit visit (AddVisitModal) |
| [CRMDashboardPage.jsx:1784](src/modules/crm/CRMDashboardPage.jsx#L1784) | `handleSaveVisit` | **WRITE** (insert) | create visit (+`company_id`,`created_by`) |
| [CustomerDetailPage.jsx:445](src/modules/crm/CustomerDetailPage.jsx#L445) | fetch visits effect | **READ** | tab **History Visit** + **Health Score**, `.eq('prospect_id', account.id)` |
| [CustomerMasterPage.legacy.jsx:159](src/modules/crm/CustomerMasterPage.legacy.jsx#L159) | — | **READ** | **DEAD** (file `.legacy`, tidak di-route) — abaikan |

### `sales_visit_logs` (riwayat status visit)
| File:line | Fungsi | Baca/Tulis | Keterangan |
|---|---|---|---|
| [CRMDashboardPage.jsx:1006](src/modules/crm/CRMDashboardPage.jsx#L1006) | `fetchVisitLogs` (VisitDetailModal) | **READ** | timeline perubahan status di detail visit |
| [CRMDashboardPage.jsx:1795](src/modules/crm/CRMDashboardPage.jsx#L1795) | `handleSaveVisit` | **WRITE** (insert) | fire-and-forget log saat create/edit visit |

> **Tidak ada padanan tabel log di `activities`** → fitur history-status visit perlu keputusan (drop, atau tabel `activity_logs` baru). Flag.

---

## NAV & ROUTE

- **Menu Call:** [App.jsx:454](src/App.jsx#L454) → `{ id: 'crm-calls', label: 'Activity & Calls', icon: PhoneCall }` di grup CRM (`crm-dashboard`). **TIDAK** ada di `MENU_KEY_MAP` → tanpa role-gate (`canSeeMenuItem` fallback true = semua role lihat).
- **Route Call:** [App.jsx:2461](src/App.jsx#L2461) `activeMenu === 'crm-calls'` → `<SalesCallsPage showToast profile />` (lazy [App.jsx:42](src/App.jsx#L42)).
- **Menu Visit:** **TIDAK ADA menu/route khusus.** Visit hidup **di dalam** Dashboard ([App.jsx:439](src/App.jsx#L439) `crm-dashboard` → [App.jsx:2366](src/App.jsx#L2366) `CRMDashboardPage`) lewat widget kalender. Tidak ada halaman list visit mandiri.
- Tidak ada entry "Activity" generik di nav (modul activities belum punya UI).

---

## KALENDER TAMBAH VISIT (alur sekarang)

Komponen `DashCalendar` ([CRMDashboardPage.jsx:1130](src/modules/crm/CRMDashboardPage.jsx#L1130)) di dalam `CRMDashboardPage`:

1. **Tombol "Tambah Visit"** ([:1174](src/modules/crm/CRMDashboardPage.jsx#L1174)) → `onAddVisit` ([:1899](src/modules/crm/CRMDashboardPage.jsx#L1899)) → reset `visitDraft` ke `EMPTY_DRAFT` + `setAddVisitOpen(true)`.
2. **Klik tanggal** ([:1217](src/modules/crm/CRMDashboardPage.jsx#L1217)) → `onDayClick(dateKey)` ([:1904](src/modules/crm/CRMDashboardPage.jsx#L1904)) → pre-fill `visit_date` + buka modal.
3. **Klik event/visit** ([:1240](src/modules/crm/CRMDashboardPage.jsx#L1240), [:1334](src/modules/crm/CRMDashboardPage.jsx#L1334)) → `onVisitClick` → `setVisitDetail(v)` → **VisitDetailModal** ([:998](src/modules/crm/CRMDashboardPage.jsx#L998)) (baca `sales_visit_logs` utk timeline).
4. **AddVisitModal** ([:802](src/modules/crm/CRMDashboardPage.jsx#L802)) → submit `handleSaveVisit` ([:1752](src/modules/crm/CRMDashboardPage.jsx#L1752)):
   - validasi wajib: `visit_type`, `visit_date`, `salesperson_id` (+`notes` wajib jika status `cancelled`).
   - **TULIS ke `sales_visits`** ([:1782/1784](src/modules/crm/CRMDashboardPage.jsx#L1782)) lalu **`sales_visit_logs`** ([:1795](src/modules/crm/CRMDashboardPage.jsx#L1795)) → `fetchDash()` refresh.
- Dropdown opsi (sales + prospect/customer) di-load saat modal buka ([:1738-1747](src/modules/crm/CRMDashboardPage.jsx#L1738)).

---

## MAPPING FIELD form → kolom (call & visit) → target `activities`

### CALL — `EMPTY_CALL` ([SalesCallsPage.jsx:183](src/modules/crm/SalesCallsPage.jsx#L183)) / payload ([:465](src/modules/crm/SalesCallsPage.jsx#L465))
| Field form | Kolom `sales_calls` | Target `activities` |
|---|---|---|
| `prospect_id` | prospect_id | **`account_id`** |
| `salesperson_id` (`||profile.id`) | salesperson_id | **`assigned_to`** |
| `call_date` | call_date | **`scheduled_for`** |
| `call_time` | call_time | **`activity_time`** |
| `contact_name` (wajib) | contact_name | `contact_name` (langsung) |
| `contact_phone` | contact_phone | `contact_phone` (langsung) |
| `result` (wajib) | result | **`outcome`** |
| `notes` | notes | `notes` (langsung) |
| `next_action` | next_action | `next_action` (langsung) |
| `next_action_date` | next_action_date | `next_action_date` (langsung) |
| `call_type` (discovery/follow_up/closing) | call_type | **`details.call_type`** |
| `duration_minutes` | duration_minutes | **`details.duration_minutes`** |
| `bant_collected` (0-6) | bant_collected | **`details.bant_collected`** |
| (konstanta) | — | **`type='call'`** |
| (turunan dari `result`) | — | **`status`** (mis. connected→`done`, callback→`todo`) |
| company_id / created_by | sama | sama |

### VISIT — `EMPTY_DRAFT` ([CRMDashboardPage.jsx:1750](src/modules/crm/CRMDashboardPage.jsx#L1750)) / payload ([:1762](src/modules/crm/CRMDashboardPage.jsx#L1762))
| Field form | Kolom `sales_visits` | Target `activities` |
|---|---|---|
| `prospect_id` | prospect_id | **`account_id`** |
| `salesperson_id` (wajib) | salesperson_id | **`assigned_to`** |
| `visit_date` (wajib) | visit_date | **`scheduled_for`** |
| `visit_time` | visit_time | **`activity_time`** |
| `status` (scheduled/completed/cancelled) | status | **`status`** (scheduled→`todo`, completed→`done`, cancelled→`cancelled`) + `completed_at` saat done |
| `notes` | notes | `notes` (langsung) |
| `visit_type` (wajib; discovery/solution_presentation/qbr/…) | visit_type | **`details.visit_type`** |
| `location` | location | **`details.location`** (tak ada kolom langsung di activities) |
| `point_of_meeting` | point_of_meeting | **`details.point_of_meeting`** |
| `mom` | mom | **`details.mom`** |
| `follow_up` | follow_up | **`next_action`** (atau `details.follow_up`) |
| (konstanta) | — | **`type='visit'`** |
| nama account (embed) | — | bisa simpan ke `prospect_name` (denormalized di activities) |
| company_id / created_by | sama | sama |

> Anchor BARU yang belum ada di form lama tapi tersedia di activities: **`inquiry_id`, `quotation_id`** → menjawab titik-putus #3 di `CRM_FLOW.md`.

---

## DROPDOWN SALES (#3) — akar masalah

**Lokasi:** AddVisitModal options fetch di `CRMDashboardPage` — [CRMDashboardPage.jsx:1741](src/modules/crm/CRMDashboardPage.jsx#L1741):
```js
supabase.from('profiles').select('id, full_name').eq('active', true).limit(100)
```
**Akar masalah: query TIDAK punya `.eq('company_id', profile.company_id)`** → mengembalikan **semua user aktif lintas entitas** (MSI + JCI + SOA), bukan hanya se-perusahaan.

**Bandingkan jalur Call yang benar** — [SalesCallsPage.jsx:387](src/modules/crm/SalesCallsPage.jsx#L387):
```js
supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('active', true).order('full_name').limit(1000)
```
SalesCallsPage **sudah** filter `company_id` + `order` + limit 1000. Jadi inkonsistensi murni: dropdown visit lupa filter company (dan limit 100 vs 1000). **Fix wajib** apa pun keputusan rebuild/rewire.

---

## REKOMENDASI per area

| Area | File | Keputusan | Alasan |
|---|---|---|---|
| **Halaman Call (Activity & Calls)** | SalesCallsPage.jsx | **RE-WIRE moderat → activities** (`type='call'`) | CRUD terisolasi & rapi (1 page, 2 write site). Swap tabel + remap field ke `details jsonb` (call_type/duration_minutes/bant_collected). Pertahankan visual & role-scope. Tambah anchor `inquiry_id`/`quotation_id` opsional saat remap. Risiko sedang (remap jsonb), bukan rebuild penuh |
| **Visit (kalender + AddVisitModal + VisitDetailModal)** | CRMDashboardPage.jsx | **BANGUN ULANG** | Tertanam dalam Dashboard, multi-titik (calendar render, 2 modal, fetch, KPI). Pakai `sales_visit_logs` (timeline status) yang **tak ada padanan** di activities → butuh keputusan. Lebih bersih dibuat sbg modul Activity terpisah (atau komponen visit baru) yang baca/tulis `activities` (`type='visit'`), lalu kalender Dashboard dialihkan baca `activities`. Patching in-place berisiko karena banyak cabang |
| **History Visit + Health Score (Customer)** | CustomerDetailPage.jsx:445 | **RE-WIRE tipis** | Hanya 1 query read. Ganti `.from('sales_visits').eq('prospect_id', id)` → `.from('activities').eq('account_id', id).in('type',['visit','call'])` + baca field khas dari `details`. Health Score hitung dari count/field — sesuaikan path. Risiko rendah |
| **KPI mingguan Call & Visit** | CRMDashboardPage.jsx:1551, 1560 | **RE-WIRE tipis** | 2 count query → arahkan ke `activities` (`type='call'`/`'visit'`, `scheduled_for` ganti `call_date`/`visit_date`). Risiko rendah |
| **Riwayat status visit (logs)** | CRMDashboardPage.jsx:1006, 1795 | **KEPUTUSAN DULU** | `activities` tak punya tabel log. Opsi: (a) drop fitur timeline, (b) simpan log ringkas di `details`, (c) buat `activity_logs`. Tentukan sebelum rebuild visit |
| **Dropdown sales visit** | CRMDashboardPage.jsx:1741 | **FIX WAJIB** (lipat ke rebuild visit) | Tambah `.eq('company_id', profile.company_id)` + naikkan limit. Harus benar di modul baru |
| **CustomerMasterPage.legacy.jsx:159** | (legacy) | **ABAIKAN** | File `.legacy`, tidak di-route. Hilang saat dead code dibersihkan |

### Catatan migrasi data
- Data lama sudah dimigrasi ke `activities` (0 call + 2 visit, `migrated_from` ter-set) → UI baru cukup baca `activities`, tak perlu baca tabel lama.
- `sales_calls`/`sales_visits` **DORMANT** — biarkan sampai semua UI di atas dipindah & diverifikasi, baru drop (backlog 🟢 di CLAUDE.md).

### Urutan eksekusi yang disarankan
1. RE-WIRE tipis dulu (read-only, risiko rendah): KPI mingguan + CustomerDetail History/Health → validasi `activities` terbaca benar.
2. RE-WIRE Call page (write) → uji CRUD ke `activities`.
3. Putuskan nasib `sales_visit_logs`.
4. BANGUN ULANG Visit (kalender + modal) + fix dropdown company_id.
5. Verifikasi semua jalur → drop `sales_calls`/`sales_visits`.
