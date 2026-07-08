# AUDIT — Setup Role GM BD (General Manager Business Development)

> Read-only. Sumber: kode (`src/`) + `supabase/schema_snapshot.sql`. Tanggal: 2026-07-08.
> Ekspektasi user: GM BD di ATAS sales, di BAWAH CEO; akses FULL Reporting + Approval + CRM.

---

## BAGIAN 1 — Verdict Keberadaan Role

**Role generik `gm` ADA. Role "GM BD" spesifik BELUM ADA.**

| Aspek | Temuan | Bukti |
|---|---|---|
| Role kanonik `gm` | ADA (label "GM / Senior GM") | `ERP_ROLE_PRIORITY` (`src/contexts/AuthContext.jsx:11`); opsi role (`src/App.jsx:267`); tabel `roles` (DB) |
| Posisi hierarki `gm` | `super_admin > admin > ceo > **gm** > manager > supervisor > finance_controller > finance > operations > sales > …` | `AuthContext.jsx:10-14` |
| Cocok posisi GM BD? | **YA** — `gm` sudah tepat "di atas sales/manager, di bawah ceo" | — |
| Role BD-spesifik (`gm_bd`/`business_development`/`bd_head`) | **TIDAK ADA** di kode maupun schema | grep = 0 |
| `sales_head` | **TIDAK kanonik** — 0 di `ERP_ROLE_PRIORITY`; hanya sisa di dokumen lama (04 §4 masih menyebutnya, tapi `is_manager_or_above` live pakai `supervisor`, bukan `sales_head`) | schema `is_manager_or_above` |
| `sales_spv` | **Typo non-kanonik** (bukan role sah) | `src/modules/crm/QuotationFormPage.jsx:41` |

**Verdict:** Tidak perlu bikin role baru untuk memenuhi "GM BD di atas sales/bawah CEO" — role **`gm`** sudah menempati slot itu. Keputusan tinggal: **assign `gm`** vs **bikin `gm_bd` terpisah** (lihat Kesimpulan).

---

## BAGIAN 2 — Peta Akses SAAT INI (role `gm`)

Gate ada 3 jenis: **role[]** (array di menu def), **menuKey** (`hasMenuPermission` → butuh grant DB), **module** (`hasPermission(module,'view')` → grant DB). `gm` masuk banyak `role[]`, TAPI menu ber-**menuKey** bergantung seed DB.

### CRM
| Menu / Halaman | `gm` akses? | Gate | Bukti |
|---|---|---|---|
| Lead Pool | ✅ ya | role[…,gm,…] | `App.jsx:471` |
| **Approval Lead Pool** | ❌ **TIDAK** | role[`manager,supervisor,admin,super_admin`] — **gm & ceo tak masuk** | `App.jsx:472` |
| Prospects | ✅ ya | module `crm` + role[…,gm] | `App.jsx:473` |
| Rate List | ✅ ya | role[…,gm] | `App.jsx:476` |
| Activities · Activity Log | ✅ ya | role[…,gm] | `App.jsx:486-487` |
| **CRM Dashboard** | ⚠️ **tergantung DB** | menuKey `crm_dashboard` (bukan role[]) | `App.jsx:1014` |
| **Pipeline / Leads** | ⚠️ **tergantung DB** | menuKey `crm_pipeline` | `App.jsx:1015` |
| **Master Customer (+Detail)** | ⚠️ **tergantung DB** | menuKey `crm_customers` | `App.jsx:1019-1024` |
| Inquiry · Quotation | ⚠️ via grup crm | (turun dari parent crm) | `App.jsx` |

### Reporting
| Menu | `gm` akses? | Gate | Bukti |
|---|---|---|---|
| Sales Report | ✅ ya | role[…,gm,supervisor] | `App.jsx:791` |
| Indomarco Dashboard | ✅ ya | role[…,gm,supervisor] | `App.jsx:793` |
| MOM (lihat) | ✅ ya | role[…,gm,…] | `App.jsx:795` |
| **Riwayat Visit** | ❌ **TIDAK** | role[`super_admin,ceo`] saja — **gm tak masuk** | `App.jsx:792` |

### Approval (mekanik)
| Gate | `gm` bisa? | Detail | Bukti |
|---|---|---|---|
| **MOM approve/reject** | ❌ **TIDAK** | `APPROVER_ROLES = ['ceo','admin','super_admin']` — gm SKIP | `MOMDetailPage.jsx:10,81` |
| **Approval Lead Pool** | ❌ **TIDAK** | role[] tak masuk gm (lihat CRM) | `App.jsx:472` |
| HRGA Pending Approval (menu) | ❌ **TIDAK** | role[`super_admin,admin,finance,it,hrga,supervisor`] | `App.jsx:661` |
| Handover WON (Light/Strategic) | ✅ (tak role-gated) | dipicu `estimated_value`, siapa pun yang WON | `PipelineKanbanPage` |
| Discount authority (Quotation) | ✅ (display-only) | gm di tier ≤15% — TAPI **tak di-enforce** (TD-38) | `QuotationFormPage.jsx:47` |
| Approval Center (cockpit) | — | **PLANNED/ComingSoon, belum dibangun** | `App.jsx:715` |

**Ringkas saat ini:** `gm` sudah kuat di CRM leaf + Reporting utama, TAPI **ke-blok di 4 titik**: Approval Lead Pool, Riwayat Visit, MOM approve, HRGA approver menu; + 3 menu CRM inti (Dashboard/Pipeline/Master Customer) bergantung grant DB.

---

## BAGIAN 3 — Peta Akses IDEAL (GM BD, tiru pola `ceo`/`manager`)

Pembanding paling dekat = **`ceo`** (satu tingkat di atas gm; hampir selalu ada di role[]) dan **`manager`** (yang justru punya Approval Lead Pool). Ideal GM BD = union pola keduanya untuk Reporting/Approval/CRM.

| Domain | Menu / Halaman | Akses disarankan | Role pembanding yang sudah punya |
|---|---|---|---|
| **Reporting** | Sales Report | ✅ (sudah) | ceo, manager, supervisor |
| | Indomarco Dashboard | ✅ (sudah) | ceo, manager, supervisor |
| | MOM (lihat) | ✅ (sudah) | ceo, manager, supervisor |
| | **Riwayat Visit** | ✅ **tambah gm** | ceo (super_admin,ceo) |
| **Approval** | **Approval Lead Pool** | ✅ **tambah gm** | manager, supervisor |
| | **MOM approve/reject** | ✅ **tambah gm** | ceo, admin |
| | HRGA approval | ⚙️ via `hrga_approval_configs` (DB) | dikonfig per level (gm sudah jadi contoh level-1) |
| | Handover WON | ✅ (sudah, tak role-gated) | semua |
| **CRM** | Lead Pool, Prospects, Rate List, Activities, Activity Log | ✅ (sudah) | ceo, manager |
| | **CRM Dashboard, Pipeline, Master Customer** | ✅ **grant menuKey `crm_dashboard`/`crm_pipeline`/`crm_customers` ke gm (DB)** | role yang di-seed grant-nya (perlu cek) |
| | Inquiry, Quotation | ✅ (via grup crm) | ceo, manager |
| **Lainnya (info)** | Logistics/Finance | `gm` SUDAH punya (role[] di :501/504/505/533/634/639/641) | — (bisa dipersempit kalau GM **BD** tak perlu gudang/finance) |

⚠️ Catatan: role `gm` existing **juga** punya akses Logistics + Finance. Kalau GM **BD** idealnya tak menyentuh gudang/finance, `gm` generik **kelebihan akses** → argumen untuk role `gm_bd` terpisah (lihat Kesimpulan).

---

## BAGIAN 4 — Temuan Berpotensi (kritis)

| # | Temuan | Severity | Dampak | Bukti | Saran |
|---|---|---|---|---|---|
| T1 | **MOM approval hardcode `['ceo','admin','super_admin']`** | **HIGH** (kalau GM BD approve MOM) | gm bisa LIHAT MOM tapi **tak bisa approve/reject** → mandek | `MOMDetailPage.jsx:10` (`APPROVER_ROLES`) | tambah `'gm'` ke `APPROVER_ROLES` |
| T2 | **Approval Lead Pool: role[] tak masuk gm & ceo** (padahal manager/supervisor bisa) | **HIGH** | GM BD (dan CEO!) **tak bisa** approve tarik lead → inkonsistensi hierarki (bawahan bisa, atasan tak) | `App.jsx:472` (+ NEXUS_NAV `:855`) | tambah `'gm'` (dan pertimbangkan `'ceo'`) ke role[] |
| T3 | **Riwayat Visit role `['super_admin','ceo']` saja** | MEDIUM | GM BD tak bisa lihat Riwayat Visit → Reporting tak "FULL" | `App.jsx:792` (+ NEXUS_NAV `:975`) | tambah `'gm'` (± manager/supervisor sesuai kebijakan) |
| T4 | **3 menu CRM inti ber-menuKey** (`crm_dashboard`/`crm_pipeline`/`crm_customers`) — bukan role[] | **HIGH (blocker setup)** | Assign role `gm` saja **TIDAK** membuka Dashboard/Pipeline/Master Customer; butuh grant `user_menu_permissions`/`role_permissions` di DB | `App.jsx:1014-1024` | seed grant menuKey utk gm; **perlu konfirmasi** apakah gm existing sudah punya (TD-02 `has_permission` flagged unseeded) |
| T5 | **`is_admin_or_above()` = `super_admin`/`admin` SAJA** (tak kenal gm/ceo) | MEDIUM | Tabel/policy yang di-gate `is_admin_or_above` (mis. `app_settings`, sebagian oversight-read) **menolak gm**; ini akar stopgap `profiles_read USING(true)` | schema `is_admin_or_above`; TD-01/TD-04 | GM BD kemungkinan tak butuh admin — tapi kalau ada laporan oversight pakai `is_admin_or_above`, gm ke-block. `is_manager_or_above` (yang **memang** kenal gm) dipakai CRM RLS → aman |
| T6 | **RLS CRM company-scoped → gm = single entity** | MEDIUM (**perlu konfirmasi**) | `get_user_company_id()` batasi gm ke 1 company. Kalau GM BD harus lihat Reporting/CRM **lintas 3 entitas** (MSI/JCI/SOA), `gm` **tak cukup** (cuma super_admin bypass) | schema pola `accounts`/`activities` (03 §4); `is_manager_or_above` ⇒ "seluruh entitasnya" = company sendiri | konfirmasi scope: single-entity (cukup gm) vs cross-entity (butuh mekanisme lain / multi-assign per company) |
| T7 | **Discount authority display-only** (gm masuk tier tapi tak nge-block) | LOW | Otoritas diskon gm **kosmetik** — tak enforce (TD-38) | `QuotationFormPage.jsx:47`; TD-38 | bukan blocker GM BD; catat saja |
| T8 | **Approval Center (`approvals`) belum dibangun** (ComingSoon) | LOW–MEDIUM | "FULL Approval" **belum punya satu rumah** — approval tersebar per-modul (MOM/Lead Pool/HRGA) | `App.jsx:715` (PLANNED) | ekspektasi "FULL Approval" saat ini = jumlah dari T1/T2 + HRGA config, bukan satu cockpit |
| T9 | **Role guard `is_admin_or_above` legacy `'super'` fallback** + `sales_spv` typo | LOW | Noise/legacy; `sales_spv` (`QuotationFormPage.jsx:41`) bukan role sah | schema comment; `QuotationFormPage.jsx:41` | abaikan / bersihkan terpisah |

**Catatan menu-gate public:true (dari TD-45):** menu HRGA subs `public:true` — tak relevan langsung ke GM BD, tapi menandakan gating menu belum rapi. GM BD gate sebaiknya role[] eksplisit, bukan public.

---

## KESIMPULAN — Langkah Setup Disarankan

### Pilihan A — **Assign role `gm`** (rekomendasi, paling cepat)
`gm` sudah menempati posisi hierarki yang benar + mayoritas akses CRM/Reporting. **Kelebihan:** minim kerja, konsisten pola existing. **Kekurangan:** `gm` generik **juga** buka Logistics + Finance (kalau GM **BD** idealnya tak perlu itu, ini over-grant).

### Pilihan B — **Bikin role `gm_bd` baru**
Kalau mau BD terpisah dari GM operasional (tanpa gudang/finance). **Kekurangan:** kerja banyak + berisiko — harus: seed di tabel `roles`, sisip ke `ERP_ROLE_PRIORITY`, tambah ke **~15 titik `role[]`** (App.jsx), tambah ke `is_manager_or_above()` (kalau tidak, RLS CRM tak kasih akses company-wide), dan ke semua approver-set. **Perlu audit ulang tiap titik.** Untuk kebutuhan "FULL Reporting+Approval+CRM", **Pilihan A lebih aman**.

### Risiko yang WAJIB dibereskan dulu (apa pun pilihannya), supaya "FULL" benar-benar penuh
| Prioritas | Fix | Lokasi |
|---|---|---|
| 1 (blocker CRM) | Grant menuKey `crm_dashboard`/`crm_pipeline`/`crm_customers` ke role (T4) + **konfirmasi seed `has_permission`/`user_menu_permissions`** (TD-02) | DB |
| 2 (Approval) | Tambah `gm` ke `APPROVER_ROLES` MOM (T1) + role[] Approval Lead Pool (T2) | `MOMDetailPage.jsx:10`, `App.jsx:472/855` |
| 3 (Reporting) | Tambah `gm` ke Riwayat Visit role[] (T3) | `App.jsx:792/975` |
| 4 (konfirmasi) | **Scope entitas GM BD**: single-company (gm cukup) vs lintas-3-entitas (butuh solusi khusus) (T6) | RLS |
| 5 (opsional) | HRGA approver via `hrga_approval_configs` kalau GM BD approve HRGA | DB config |

**Perlu konfirmasi dari user sebelum eksekusi:** (a) GM BD single-entity atau lintas-entitas? (b) GM BD perlu akses Logistics/Finance atau CRM+Reporting+Approval saja? (c) Approval "FULL" mencakup Lead Pool + MOM + HRGA, atau subset? Jawaban ini menentukan Pilihan A vs B + fix mana yang dijalankan.

---

# LANJUTAN — Mekanisme Multi-Entitas + Peta Fix Final (2026-07-08)

> Setup final GM BD: base `gm`; **lintas 3 entitas (MSI+JCI+SOA)**; FULL CRM+Reporting+Approval(Lead Pool+MOM); **TUTUP** Logistics+Finance; HRGA skip.

## BAGIAN 5 — Mekanisme Lintas-Entitas (bukti kode+schema)

| Pertanyaan | Jawaban | Bukti |
|---|---|---|
| Sistem tentukan user lihat company mana? | **Single** — `get_user_company_id()` = `SELECT company_id FROM profiles WHERE id=auth.uid()`. Satu user = satu `profiles.company_id`. | schema `get_user_company_id()` (LANGUAGE sql STABLE) |
| Ada mekanisme multi-company? | `user_roles.company_id` ADA per-assignment (user bisa punya banyak baris user_roles beda company), TAPI **RLS tak pakai itu** — RLS pakai `profiles.company_id` (single). AuthContext `pickPrimaryErpRole` pilih 1 role; `companyId = profiles.company_id`. → multi-user_roles **dormant** utk scope data. | `user_roles` (`company_id NOT NULL`); `AuthContext.jsx:184,190` |
| RLS CRM company-scoped gimana? | Pola seragam: `((company_id = get_user_company_id() AND (is_manager_or_above() OR own)) OR is_super_admin())`. `accounts`/`activities`/`quotations` semua begini. | `prospects_read` (accounts); `activities_select` `schema:9299`; `quotations_read` `schema:11241` |
| Helper gate-nya? | `get_user_company_id()` (filter company) + `is_manager_or_above()` (lihat se-company, **gm masuk**) + `is_super_admin()` (**bypass total**). | `is_manager_or_above` = `('super_admin','admin','ceo','gm','manager','supervisor')` |
| Role `gm` sekarang lintas atau 1 entitas? | **1 entitas** (company `profiles.company_id`-nya). `is_manager_or_above` cuma bikin gm lihat SEMUA baris **dalam company itu**, bukan lintas. | RLS di atas |
| ceo/admin lintas-entitas? | **TIDAK.** ceo/admin/gm/manager semua single-company. **Cross-entity = HANYA `is_super_admin()`** (satu-satunya cabang yang bypass `company_id`). | Semua policy CRM |
| Frontend cross-entity? | `isAllEntities = ['super_admin']` saja; non-super → `.eq('company_id', profile.company_id)`. Tak ada entity-switcher data global (EntitySwitcher yang ada = editor config per-entitas di Admin Settings, super/admin-only). | `InquiryListPage.jsx:170,199`; `SalesCallsPage.jsx:348,387` |

**Kesimpulan mekanisme:** Tidak ada tier "cross-entity" selain **super_admin (bypass total)**. Tak ada pola menengah yang bisa ditiru untuk gm. `super_admin` = over-grant ekstrem (bypass SEMUA RLS + semua modul + admin) → **bukan** pola sehat untuk GM BD.

## BAGIAN 6 — Feasibility (lintas-3-entitas TAPI CRM+Reporting saja)

| Aspek | Verdict |
|---|---|
| Bisa dgn mekanisme ADA? | **TIDAK untuk lintas-entitas.** Cross-entity cuma via `is_super_admin()`. Butuh **CUSTOM**: cabang RLS baru (mis. helper `is_crossentity_crm()` / role-check) di-`OR`-kan ke policy **read** tabel CRM+reporting: `accounts, activities, activity_logs, inquiries, quotations, quotation_items, rate_sheets, meeting_moms, mom_*, deal_handovers, top_requests` (~12 tabel) + frontend `isAllEntities` diperluas. Module-restrict (CRM saja) = **bisa** dgn role[] existing. |
| Kalau gm dibikin lintas-entitas, otomatis buka finance/logistics? | **TIDAK** — **scope entitas (RLS `company_id`) & scope modul (role[]/menuKey) TERPISAH.** Cabang RLS cross-entity cuma buka baca-data lintas-company; menu logistics/finance tetap di-gate role[] sendiri. **KECUALI** dipakai `is_super_admin` (opsi buruk) → itu buka semua. Jadi custom helper ber-scope menjaga keduanya independen. ✓ |
| Cara paling bersih | **Cenderung role `gm_bd` baru**, bukan modif `gm` — karena kombinasi GM BD (lintas-entitas + modul dibatasi) beda dari `gm` generik. Cross-entity helper di-attach ke `gm_bd` saja (bukan semua gm), dan modul dibatasi cukup dgn **tidak** menaruh `gm_bd` di role[] logistics/finance. Ini juga menghindari "ganggu gm lain". **⚠️ perlu konfirmasi: apakah `gm` cuma dipakai GM BD, atau ada GM lain (SCM/Finance) yang juga `gm`?** Kalau cuma GM BD → modif `gm` boleh; kalau ada GM lain → **wajib** `gm_bd` terpisah. |

## BAGIAN 7 — Peta Fix Final (gabung 5 fix + lintas-entitas)

| Fix | Jenis | Detail + lokasi |
|---|---|---|
| **T2 Lead Pool approver +gm (+ceo)** | **KODE** | `App.jsx:472` role[] (+ NEXUS_NAV `:855` kalau perlu). Tambah `'gm'` (dan pertimbangkan `'ceo'` — sekarang ceo pun ke-skip). |
| **T1 MOM approve +gm** | **KODE** | `MOMDetailPage.jsx:10` `APPROVER_ROLES = ['ceo','admin','super_admin']` → +`'gm'`. |
| **T3 Riwayat Visit +gm** | **KODE** | `App.jsx:792` role[`super_admin,ceo`] → +`'gm'` (+ NEXUS_NAV `:975`). |
| **T4 menuKey CRM inti** | **SQL** | Grant menuKey `crm_dashboard`/`crm_pipeline`/`crm_customers` ke role (gm/gm_bd) via `role_permissions`/`user_menu_permissions`. **⚠️ perlu konfirmasi** seed `has_permission` (TD-02 flagged unseeded) — cek apakah gm existing sudah punya. |
| **T5 is_admin_or_above / hierarki** | **tak perlu** (untuk GM BD) | gm sudah di `is_manager_or_above` (cukup utk RLS CRM). `is_admin_or_above` (super/admin) TAK dibutuhkan GM BD (dia bukan admin master data). Kecuali ada oversight-read yang GM BD perlu & di-gate `is_admin_or_above` — **perlu konfirmasi**, kemungkinan tidak. |
| **Lintas-3-entitas** | **DUA-DUANYA** | **SQL:** buat helper cross-entity CRM (mis. `is_crossentity_crm()` true utk gm_bd) + `OR is_crossentity_crm()` ke read-policy ~12 tabel CRM/reporting. **KODE:** perluas `isAllEntities` (di `InquiryListPage`/`SalesCallsPage`/list CRM lain + reporting) agar sertakan role GM BD (jangan hanya super_admin). ⚠️ Ini fix **terbesar & paling berisiko** (menyentuh banyak policy + banyak query FE); audit + tes lintas-role wajib. |
| **TUTUP logistics/finance utk gm** | **KODE** (± tergantung) | gm ada di role[] `input:501`, `picking:504`, `surat-jalan:505`, `shipment:533`, `ar:634`, `outstanding:639`, `finance:641`. **Kalau GM BD satu-satunya gm** → buang `'gm'` dari 7 array itu. **Kalau ada gm lain** → JANGAN sentuh array; pakai role `gm_bd` (yang memang tak dimasukkan ke array itu) atau revoke per-user via `user_menu_permissions`. ⚠️ **perlu konfirmasi jumlah gm.** |

**Urutan aman:** (1) putuskan `gm` vs `gm_bd` [tergantung "gm cuma GM BD?"], (2) fix KODE approver/visit/module (kecil, verifikasi build+lint), (3) SQL menuKey grant + preview, (4) **paling akhir & hati-hati**: SQL+KODE lintas-entitas (sesi fresh, tes 3 entitas × role, rollback plan) — ini praktis sub-proyek sendiri (nyerempet TD-01/TD-39 RLS).

## BAGIAN 8 — Draft TD HRGA (untuk 08, JANGAN ditulis dulu)

> `| TD-46 | LOW | **HRGA approval untuk role manajemen (GM BD) di-skip / belum dikonfig.** GM BD sengaja tak di-setup sebagai HRGA approver (department terpisah). Bila kelak perlu, approval HRGA di-DB via `hrga_approval_configs` (per `request_type` × `level` × `approver_role`), bukan role[] menu. Terkait **TD-45** (gate menu HRGA `public:true` + Asset gate kasar). | `hrga_approval_configs` (DB) + `App.jsx:661` | OPEN | Konfirmasi kebutuhan approver HRGA per role manajemen; kalau perlu, tambah baris config, bukan hardcode. |`

## KESIMPULAN REVISI

Requirement baru (lintas-entitas + modul dibatasi) **menggeser rekomendasi** dari "assign `gm`" ke **pertimbangkan role `gm_bd` terpisah**, karena: (a) lintas-entitas **wajib** custom RLS apa pun jalurnya (tak ada tier selain super_admin) → lebih rapi di-attach ke `gm_bd`; (b) menutup logistics/finance via role[] mengganggu semua `gm` — aman kalau lewat role terpisah. **Keputusan bergantung 1 pertanyaan: `gm` cuma dipakai GM BD, atau ada GM lain?** Kalau cuma GM BD → modif `gm` lebih hemat; kalau ada GM lain → `gm_bd` wajib.

**Perlu konfirmasi sebelum eksekusi:** (1) `gm` dipakai role lain selain GM BD? (2) Lintas-entitas GM BD = baca-saja semua entitas, atau juga tulis/kelola lintas-entitas? (3) menuKey CRM (`has_permission`) sudah ter-seed untuk gm? (4) Approval "FULL" = Lead Pool + MOM saja (HRGA skip, sesuai), betul?

---

---

# FINAL — Cakupan Pembuatan Role `gm_bd` (2026-07-08)

> Keputusan: **bikin role baru `gm_bd`** (karena `gm` dipakai GM SCM juga). Posisi sejajar gm (`ceo > gm_bd > manager`). Target: FULL CRM+Reporting+Approval(Lead Pool+MOM), lintas-3-entitas r/w, TUTUP logistics/finance, HRGA skip.

## BAGIAN 9 — Seed menuKey CRM (⚠️ 3 sistem permission, TD-06)

`canSeeMenuItem` (`App.jsx`) precedence — **menentukan cara seed**:
| Urutan | Cek | Sumber data |
|---|---|---|
| 1 | `public===true` | — |
| 2 | **ada menuKey → `return hasMenuPermission(menuKey,'view')`** (STOP, **TANPA fallback role**) | **`user_menu_permissions` (PER-USER)** |
| 3 | ada `module` → `return hasPermission(module,'view')` | **`role_permissions` (PER-ROLE)** |
| 4 | `item.role` → `role.includes(...)` | array di kode (per-role) |
| 5 | else deny | — |

**Konsekuensi krusial:** 3 menu CRM inti ber-menuKey → **di-gate PER-USER, bukan per-role**. Bikin role `gm_bd` **TIDAK cukup** untuk membukanya; harus grant USER-nya.

| Menu | menuKey | Cara buka utk GM BD |
|---|---|---|
| CRM Dashboard | `crm_dashboard` | **per-user** `user_menu_permissions` |
| Pipeline/Leads | `crm_pipeline` | **per-user** `user_menu_permissions` |
| Master Customer | `crm_customers` | **per-user** `user_menu_permissions` |
| Prospects | (module `crm`) | **per-role** `role_permissions(gm_bd, crm.view)` |
| Lead Pool, Rate List, Activities, Activity Log, Lead-Pool-Approval, reporting-* | (role[]) | **+`gm_bd` di array kode** |

**Seed DB (illustratif — `permissions.module` = STRING, bukan FK):**
```sql
-- (a) module-level CRM utk role gm_bd (buka crm-prospects + fallback module)
INSERT INTO role_permissions (role_id, permission_id, is_cross_entity)
SELECT '<gm_bd_role_id>', p.id, false
FROM permissions p WHERE p.module='crm' AND p.action IN ('view','create','edit','delete')
ON CONFLICT DO NOTHING;

-- (b) menuKey CRM inti — PER-USER (bukan role): grant USER GM BD
INSERT INTO user_menu_permissions (user_id, menu_action_id, company_id)
SELECT '<gm_bd_user_id>', ma.id, '<company_id>'
FROM menu_actions ma JOIN module_menus mm ON mm.id = ma.menu_id
WHERE mm.key IN ('crm_dashboard','crm_pipeline','crm_customers') AND ma.action='view';
```
⚠️ **perlu konfirmasi:** apakah `has_permission`/seed `role_permissions` sudah hidup (TD-02 flagged unseeded). Kalau seluruh RBAC granular belum dipakai runtime, alternatif = ubah kode (`MENU_KEY_MAP` lepas 3 menu itu → pakai `module:'crm'` role_permissions / role[]) — tapi itu ganti gating semua user (hati-hati).

## BAGIAN 10 — Inventaris Titik Sisip `gm_bd`

**(A) role[] arrays yang WAJIB +`gm_bd`** (CRM/Reporting/Approval, gate murni role[]):
| Menu | file:line |
|---|---|
| crm-lead-pool | `App.jsx:471` |
| crm-lead-pool-approval (T2, +ceo juga) | `App.jsx:472` |
| crm-rate-list | `App.jsx:476` |
| crm-calls (Activities) | `App.jsx:486` |
| crm-activity-log | `App.jsx:487` |
| reporting-sales | `App.jsx:791` |
| riwayat-visit (T3) | `App.jsx:792` |
| indomarco-dashboard | `App.jsx:793` |
| reporting-mom | `App.jsx:795` |
| crm-prospects *(punya `module:'crm'` → sebetulnya role_permissions yang gate; +array harmless)* | `App.jsx:473` |

**(B) In-page guard `.includes(erpRole)` yang mirror gm → +`gm_bd`:**
| Guard | file:line |
|---|---|
| MOM approve (`APPROVER_ROLES`, T1) | `MOMDetailPage.jsx:10` |
| MOM see-all (`SEE_ALL_ROLES`) | `MOMListPage.jsx:12` |
| Activities manager-view | `ActivitiesPage.jsx:505` |
| Prospect delete | `ProspectListPage.jsx:84`, `ProspectFormPage.jsx:74` |
| CRM cancel visit | `CRMDashboardPage.jsx:1802` |
| Quotation discount tiers *(display-only, TD-38 — opsional)* | `QuotationFormPage.jsx:41/44/47` |

**(C) SENGAJA TIDAK +gm_bd (TUTUP logistics/finance):**
| Menu | file:line | Gate |
|---|---|---|
| input (Input SP) | `App.jsx:501` | module logistics + role[] |
| picking | `App.jsx:504` | role[] |
| surat-jalan | `App.jsx:505` | role[] |
| shipment | `App.jsx:533` | module logistics |
| ar | `App.jsx:634` | module finance |
| outstanding | `App.jsx:639` | module finance |
| finance | `App.jsx:641` | module finance |
→ Cukup **JANGAN** taruh `gm_bd` di array/role_permissions logistics+finance. Karena role terpisah, **nol risiko ganggu `gm`** (GM SCM) yang tetap di array itu. ✓

**(D) Hierarki (biar gm_bd dikenali `ceo > gm_bd > manager`):**
| Titik | Aksi | file:line / obj |
|---|---|---|
| `ERP_ROLE_PRIORITY` | sisip `'gm_bd'` setelah `'gm'` | `AuthContext.jsx:11` (KODE) |
| Daftar opsi role (User Access) | +`{ id:'gm_bd', label:'GM BD' }` setelah gm | `App.jsx:267` (KODE) |
| `is_manager_or_above()` | +`'gm_bd'` ke `code IN (…)` | schema (SQL) — **WAJIB**, tanpa ini gm_bd cuma lihat baris own (assigned_to/created_by), bukan se-company |

**(E) DB role (validasi):**
`roles` = **company-scoped** (`company_id NOT NULL`, `code varchar(50)`, `is_system_role`). **TIDAK ada enum/CHECK di `code`** → **tak perlu ALTER type**; cukup `INSERT` baris. Role per-entitas → butuh 1 baris `gm_bd` **per company** (MSI [Paket 1]; +JCI +SOA [Paket 2]). `profiles.role` legacy enum = **jangan disentuh** (deprecated).

## BAGIAN 11 — PAKET 1 vs PAKET 2

### PAKET 1 — Single-entity (MSI dulu): bikin role + approval + menuKey + hierarki
| # | Perubahan | Jenis |
|---|---|---|
| 1 | `INSERT roles` (`code='gm_bd'`, `company_id=MSI`, `is_system_role=true`) | SQL |
| 2 | `is_manager_or_above()` +`'gm_bd'` | SQL |
| 3 | `role_permissions(gm_bd_MSI, crm.view/create/edit/delete)` + reporting bila ada modul-nya | SQL |
| 4 | `user_menu_permissions` (USER GM BD) utk `crm_dashboard/crm_pipeline/crm_customers` | SQL |
| 5 | `ERP_ROLE_PRIORITY` + daftar opsi role +`gm_bd` | KODE |
| 6 | role[] arrays (A) +`gm_bd` | KODE |
| 7 | in-page guards (B) +`gm_bd` (khususnya MOM approve T1 + Lead Pool T2 + Riwayat Visit T3) | KODE |
| 8 | assign `user_roles(user, gm_bd_MSI, MSI)` + set `profiles.company_id=MSI` | SQL |
**Risiko PAKET 1: RENDAH–SEDANG.** Additive; role baru tak ganggu existing; approval langsung jalan di MSI. Verifikasi: build+lint + login user GM BD MSI (lihat Dashboard/Pipeline/Customer, approve MOM & Lead Pool, TAK lihat logistics/finance).

### PAKET 2 — Lintas-3-entitas read-write
| # | Perubahan | Jenis |
|---|---|---|
| 1 | `INSERT roles gm_bd` utk JCI + SOA (2 baris lagi) | SQL |
| 2 | Helper cross-entity (mis. `is_gmbd()` = user punya role gm_bd aktif di company mana pun) | SQL |
| 3 | `OR is_gmbd()` di policy **read + write** ~12 tabel: `accounts, activities, activity_logs, inquiries, quotations, quotation_items, rate_sheets, meeting_moms, mom_action_plans, mom_issues, mom_progress_updates, mom_improvements, deal_handovers, top_requests` (SELECT/INSERT/UPDATE/DELETE) | SQL |
| 4 | FE: `isAllEntities` diperluas sertakan `gm_bd` di tiap list CRM/reporting (`InquiryListPage:170`, `SalesCallsPage:348`, ProspectListPage, PipelineKanbanPage, QuotationListPage, ActivitiesPage, CRMReportPage, RiwayatVisitPage, MOMListPage, dll) | KODE |
| 5 | **Write lintas-entitas:** tentukan company_id saat INSERT (butuh entity-picker) — GM BD nulis ke entitas mana? | **perlu konfirmasi** + KODE |
**Risiko PAKET 2: TINGGI.** Menyentuh ~14 tabel × 4 operasi + ~10 file FE + ambiguitas company_id saat write; nyerempet TD-01/TD-39 (RLS). Wajib sesi fresh, tes matriks (3 entitas × baca/tulis × role lain tak bocor), rollback plan (dump `pg_policies`). Praktis **sub-proyek tersendiri** — jangan disambi Paket 1.

## BAGIAN 12 — Konfirmasi No-Side-Effect (bikin role tanpa user)

| Perubahan | Efek ke role/user lain? |
|---|---|
| `INSERT roles gm_bd` | **Nol** — tak ada `user_roles` yang menunjuk → tak ada user memilikinya |
| `role_permissions gm_bd` | **Nol** — hanya berlaku utk pemegang gm_bd (belum ada) |
| `ERP_ROLE_PRIORITY` sisip `gm_bd` | **Aman** — `pickPrimaryErpRole` pakai `indexOf` (relatif); urutan role lain tak berubah, hanya +1 entri |
| `is_manager_or_above()` +`gm_bd` | **Aman** — cuma `true` utk pemegang gm_bd; role lain tak terpengaruh |
| role[] arrays +`gm_bd` | **Aman** — cuma match `erpRole==='gm_bd'` |
| Daftar opsi role +`gm_bd` | **Aman** — hanya nambah opsi assign di UI User Access |

**Kesimpulan:** membuat `gm_bd` **100% additive & inert** sampai ada user di-assign. Tak ada default/hierarki yang rusak. `gm` (GM SCM) sama sekali tak tersentuh (role terpisah). ✓

**Perlu konfirmasi final sebelum eksekusi Paket 1:** (1) `<gm_bd_user_id>` + `profiles.company_id` user GM BD (MSI?); (2) status seed `role_permissions`/`has_permission` hidup atau belum (TD-02) — menentukan menuKey lewat `user_menu_permissions` vs ubah kode; (3) reporting menu (`reporting-sales`/`indomarco`) apakah butuh `role_permissions` modul juga atau cukup role[] (mereka role[] murni → cukup KODE).

---

---

# EKSEKUSI PAKET 1 — Provisioning User Vendi + Urutan Final (2026-07-08)

> User: **Vendi P Sjahlendra** (`vendi.sjahlendra@msigroup.co.id`), company **MSI**, belum ada. Role: `gm_bd`.

## BAGIAN 13 — Cara Bikin User (jalur resmi)

| Aspek | Temuan | Bukti |
|---|---|---|
| UI provisioning | Admin → **User Access** page → "Add User" → `createUser()` → `supabase.functions.invoke('create-user')` | `UserAccessPage.jsx:200`; `useUserAccess.js:133,140` |
| Edge Function `create-user` | super_admin-only; `auth.admin.createUser` (email_confirm:true) → trigger `handle_new_user` insert `profiles` → UPDATE profiles (full_name/company/branch/dept/position) → **INSERT `user_roles` (role_id=erp_role_id)** → `{id}` | `supabase/functions/create-user/index.ts:80-130` |
| Input wajib | `email`, `password` (≥8), `full_name`, `company_id`, **`erp_role_id`** (UUID role — **wajib**) + branch/dept/position opsional | EF validate step 1 |
| Role di-set di mana? | **DI TITIK BIKIN USER** (`erp_role_id` wajib → INSERT user_roles). Bukan langkah terpisah. | EF step 5 |
| Sumber dropdown role | `fetchRolesForCompany(companyId)` = `roles WHERE company_id=<MSI> AND is_active AND deleted_at IS NULL` | `useUserAccess.js:265` |

**Konsekuensi ordering:** Karena `erp_role_id` wajib + dropdown role difilter company MSI → **role `gm_bd` (MSI) HARUS sudah ada SEBELUM bikin Vendi** (biar muncul di dropdown & ada UUID-nya).

**Rekomendasi cara paling AMAN:** pakai **Admin → User Access → Add User** (Den login super_admin) — **JANGAN** manual `INSERT auth.users` (jalur resmi via `auth.admin.createUser` menjaga password hash + `handle_new_user` + email_confirm). ⚠️ **perlu konfirmasi:** `create-user` **ter-deploy & jalan** (07_API bilang "✅ deployed", tapi TD-22 sebut re-deploy pending pasca-2.3G). Kalau tombol Add User error → `supabase functions deploy create-user` dulu.

## BAGIAN 14 — Urutan Eksekusi PAKET 1 (final, bernomor)

Template seed: mirror `supabase/migrations/20260606000028_new_roles_seed_and_permissions.sql` (pola `INSERT roles` + `role_permissions`, `ON CONFLICT DO NOTHING`, ada rollback note).

| # | Langkah | Jenis | Butuh user_id? | Verifikasi |
|---|---|---|---|---|
| 1 | `INSERT roles` gm_bd — MSI (`code='gm_bd'`, `name='GM BD'`, `is_system_role=true`, `is_active=true`). *(Opsional sekalian JCI+SOA — inert tanpa user, siap Paket 2.)* | SQL | tidak | `SELECT id,company_id FROM roles WHERE code='gm_bd'` → ada baris MSI |
| 2 | `is_manager_or_above()` +`'gm_bd'` (CREATE OR REPLACE, tambah ke `code IN (...)`) | SQL | tidak | body fungsi memuat gm_bd; test RLS di browser |
| 3 | `role_permissions(gm_bd_MSI, ...)` — grant modul `crm` (view/create/edit/delete) + reporting bila ada modul-nya (pola migrasi 028 STEP 2, `ON CONFLICT DO NOTHING`) | SQL | tidak | `SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='gm_bd'` |
| 4 | KODE: `ERP_ROLE_PRIORITY` sisip `'gm_bd'` setelah `'gm'` (`AuthContext.jsx:11`) + opsi role `App.jsx:267` | KODE | tidak | build clean + lint |
| 5 | KODE: role[] +`gm_bd` (`App.jsx:471,472,476,486,487,791,792,793,795`) + in-page guard +`gm_bd` (`MOMDetailPage.jsx:10`, `MOMListPage.jsx:12`, `ActivitiesPage.jsx:505`, `ProspectListPage.jsx:84`, `ProspectFormPage.jsx:74`, `CRMDashboardPage.jsx:1802`) | KODE | tidak | build clean + lint; **push/deploy FE** (biar menu Vendi benar saat login) |
| 6 | **Bikin Vendi** via Admin→User Access→Add User: email `vendi.sjahlendra@msigroup.co.id`, password (≥8), full_name "Vendi P Sjahlendra", company MSI, **role gm_bd** (dari step 1) | UI (EF create-user) | **menghasilkan user_id** | user muncul di list; Vendi bisa login |
| 7 | **`user_menu_permissions` utk Vendi** — menuKey `crm_dashboard`/`crm_pipeline`/`crm_customers` (view) → **butuh user_id Vendi** dari step 6 | SQL | **YA (wajib setelah #6)** | login Vendi → Dashboard/Pipeline/Master Customer muncul |

**Langkah yang WAJIB setelah user dibuat (butuh user_id): hanya #7** (`user_menu_permissions`). Step 6 sudah otomatis assign role (user_roles) — **tak ada langkah "assign" terpisah**. Step 1-5 semua role/company-level atau kode → boleh duluan.

**Urutan aman:** 1→2→3 (SQL, verifikasi tiap gerbang) → 4→5 (KODE, build+lint, **deploy FE**) → 6 (bikin user) → 7 (SQL per-user). Kalau FE belum deploy saat #6, Vendi tetap kebikin tapi menu-nya belum lengkap sampai FE naik + #7 jalan.

## BAGIAN 15 — Konfirmasi TD-02 (apakah role_permissions kebaca)

| Pertanyaan | Jawaban |
|---|---|
| `role_permissions` ter-seed? | **YA** — migrasi `20260524000005_roles_permissions`, `20260524000013_role_permissions_seed`, `20260606000028_new_roles_seed_and_permissions` mengisi tabel. Frontend `hasPermission(module,action)` baca `role_permissions` (`AuthContext.jsx:203,237`) → utk gm_bd cukup **tambah baris** (step 3). |
| Lalu TD-02 "broken/unseeded" apa? | Itu **fungsi DB `has_permission()`** (RLS SQL), BUKAN tabel `role_permissions` maupun gate frontend. `07_API` menandai fungsi ini flagged (TD-02). | 
| Apakah jalur CRM gm_bd kena TD-02? | **TIDAK** — RLS tabel CRM (accounts/activities/quotations) pakai `is_manager_or_above()` + `is_super_admin()`, **bukan** `has_permission()`. Frontend module-gate pakai tabel `role_permissions` (seeded). → gm_bd CRM **tak bergantung** pada `has_permission()` DB yang broken. **perlu konfirmasi** cepat: buka role existing (mis. `sales`) → pastikan ada baris `role_permissions` utk `crm` (bukti mekanisme hidup), lalu seed gm_bd pola sama. |

**Kesimpulan Paket 1:** jalur resmi ADA & aman (create-user EF, super_admin). Role `gm_bd` MSI dibuat dulu (step 1) supaya muncul di dropdown + jadi `erp_role_id`. Role otomatis ter-assign saat bikin user. Hanya `user_menu_permissions` (step 7) yang butuh nunggu user_id. TD-02 tak menghalangi (CRM pakai is_manager_or_above + role_permissions seeded, bukan DB has_permission). **Perlu konfirmasi:** (1) create-user ter-deploy? (2) role_permissions existing role punya baris crm (bukti seed hidup)? (3) mau gm_bd langsung 3 company (step 1) atau MSI dulu?

---

> ⚠️ Tidak ada kode/DB diubah di audit ini. Semua fix di atas = **saran**, belum dieksekusi.

---

---

# AUDIT UI RBAC — Wired atau Display-Only? (2026-07-08)

> Pertanyaan: apakah UI RBAC (Roles matrix + User Access permissions + kolom CROSS ENTITY) benar-benar enforced, atau cuma nyimpen tanpa efek. Sumber: `src/` + `supabase/schema_snapshot.sql` (source of truth). Read-only.

## BAGIAN 16 — Ringkas Verdict (TL;DR)

| UI / Mekanisme | Nulis ke | Kebaca saat login? | Enforced? | Verdict |
|---|---|---|---|---|
| **Roles matrix** (centang VIEW/CREATE/…) | `role_permissions` | ya (`hasPermission`) | **hanya action `view`** (gate menu) | **WIRED sebagian** — view saja; create/edit/delete/approve/export/print = inert |
| **Kolom CROSS ENTITY** | `role_permissions.is_cross_entity` | ya (`isCrossEntity()`) | **TIDAK** (0 policy RLS, helper FE tak dikonsumsi) | **DISPLAY-ONLY / inert** |
| **User Access → Permissions** (per-user) | `user_menu_permissions` | ya (`hasMenuPermission`) | **ya** (gate menuKey) | **WIRED** — cara resmi grant crm_dashboard/pipeline/customers |
| Bikin role baru via Roles UI | — (SELECT-only) | — | — | **TIDAK BISA** — role creation wajib SQL |

## BAGIAN 17 — Task 1: Halaman Roles (matriks permission)

**Komponen:** [`src/modules/admin/pages/RolesPage.jsx`](src/modules/admin/pages/RolesPage.jsx) (list role via hook [`useRoles.js`](src/hooks/useRoles.js); matrix via `useRolePermissions` internal).

| Aspek | Temuan | Bukti |
|---|---|---|
| Baca dari | `permissions` (katalog) + `role_permissions` (grant role ini) | `RolesPage.jsx:133-139` |
| Centang checkbox → nulis ke | **`role_permissions`** — INSERT `{role_id, permission_id}` saat centang / DELETE by id saat uncentang | `RolesPage.jsx:194-218` (handleToggle) |
| Editable oleh | **super_admin SAJA** (`isEditable = viewerRole==='super_admin'`); role lain matrix tak di-load (dikirim `null`) → read-only | `RolesPage.jsx:150-153` |
| Kebaca saat user login? | **YA** — `fetchPermissionsForRoleId` baca `role_permissions`→`userPermissions`; `hasPermission(module,action)` cek `module===… && action===…` | `AuthContext.jsx:200-208, 237-243` |
| Beneran kepakai (enforce)? | **HANYA action `view`.** Satu-satunya konsumen `hasPermission` = `canSeeMenuItem` yang panggil `hasPermission(item.module,'view')`. **Tak ada** call `hasPermission(x,'create'/'edit'/'approve'/…)` di seluruh `src/`. | `App.jsx:1099-1100`; grep `hasPermission(` konsumen = hanya canSeeMenuItem/navChildGate |
| Bikin ROLE baru di UI ini? | **TIDAK BISA.** `useRoles` cuma SELECT `roles`; RolesPage cuma tulis `role_permissions`. Tak ada INSERT ke `roles`. | `useRoles.js:28-30`; `RolesPage.jsx` (0 `from('roles').insert`) |

**Kesimpulan Task 1:** Roles matrix **wired** untuk menyimpan+membaca `role_permissions`, TAPI enforcement-nya **cuma level "view" (visibilitas menu)**. Kolom action lain (create/edit/delete/approve/export/print) tersimpan tapi **tak ada kode yang mengeceknya** → kosmetik untuk enforcement. **RLS DB tidak baca `role_permissions` sama sekali** (RLS pakai `is_manager_or_above`/`is_super_admin`) → mencentang matrix **tak pernah** mengubah row yang dikembalikan DB.

## BAGIAN 18 — Task 2: Kolom CROSS ENTITY (KRUSIAL)

**Map ke kolom:** `is_cross_entity boolean` — ADA di 3 tabel: `role_permissions` (`schema:3885`, NOT NULL default false), `user_menu_permissions` (`schema:4430`), `role_permission_templates` (`schema:3870`).

**Alur UI→DB→baca:**
- **Tulis:** `handleCrossEntityToggle` → `UPDATE role_permissions SET is_cross_entity=… ` untuk semua perm granted modul itu | `RolesPage.jsx:220-241`.
- **Baca (FE):** `isCrossEntity(module)` = true bila ada `role_permissions.is_cross_entity=true` utk modul | `AuthContext.jsx:286-292`.

**Apakah ada RLS / kode yang benar-benar ngecek flag ini?** → **TIDAK.**

| Cek | Hasil | Bukti |
|---|---|---|
| `is_cross_entity` di RLS policy? | **0 dari 278 policy.** Total kemunculan `is_cross_entity` di schema = **3, semuanya definisi kolom** (bukan body policy). | `grep -c is_cross_entity schema = 3`; 0 di `CREATE POLICY … is_cross_entity` |
| Helper FE `isCrossEntity()` dikonsumsi? | **TIDAK.** Di-destructure di `App.jsx:1509` tapi **tak dipakai** di mana pun (satu-satunya kemunculan = baris destructure). | grep `isCrossEntity` src → cuma AuthContext (definisi) + App.jsx:1509 (destructure) |
| Konsumen terdekat lain? | `useAllHrgaRequests({crossEntity})` — tapi **no-op**: `crossEntity` cuma di dependency array, query tak punya filter `company_id` untuk "dihapus" (andalkan RLS). Pemanggil (`AllRequestsPage:32`, `ArsipPage:30`) **tak pernah** kirim `crossEntity` → selalu `false`. | `useHrgaRequests.js:469,533`; callers |

**VERDICT CROSS ENTITY: DISPLAY-ONLY (tersimpan tapi inert).** Mencentang kolom ini menulis `role_permissions.is_cross_entity=true`, tapi **tak ada satu pun** policy RLS atau jalur kode yang membacanya untuk memberi akses lintas company.

**Rekonsiliasi dgn audit sebelumnya (Bagian 5/9): audit lama BENAR.** Cross-entity di RLS = **HANYA `is_super_admin()`**. `is_manager_or_above()` (yang memuat gm/manager) cuma bikin "lihat se-**company**", bukan lintas. Kolom CROSS ENTITY di UI **tidak** mengubah itu. → Untuk gm_bd lintas-3-entitas, **checkbox CROSS ENTITY tidak menolong** — tetap butuh cabang RLS custom (Paket 2, ~12-14 tabel).

## BAGIAN 19 — Task 3: User Access per-user (Permissions)

**Komponen:** [`src/modules/admin/pages/UserEditPage.jsx`](src/modules/admin/pages/UserEditPage.jsx) (tab Permissions).

| Aspek | Temuan | Bukti |
|---|---|---|
| Baca dari | `user_menu_permissions` + katalog `module_menus`/`module_actions`/`menu_actions` | `UserEditPage.jsx:296-301` |
| Simpan → nulis ke | **`user_menu_permissions`** — DELETE by id (uncheck) + INSERT `{user_id, company_id, module_action_id\|menu_action_id}` (check) | `UserEditPage.jsx:372, 384` |
| Kebaca saat login? | **YA** — `fetchMenuPermissions` baca `user_menu_permissions`→`menuPermissions`; `hasMenuPermission(menuKey,'view')` | `AuthContext.jsx:246-259` |
| Enforced di mana? | `canSeeMenuItem` **prioritas ke-2**: bila `MENU_KEY_MAP[item.id]` ada → `return hasMenuPermission(menuKey,'view')` (STOP, tanpa fallback role) | `App.jsx:1093-1096` |

**Kesimpulan Task 3: WIRED.** Grant per-user via UI ini **adalah cara resmi** membuka 3 menu CRM inti ber-menuKey (`crm_dashboard`/`crm_pipeline`/`crm_customers`). Karena precedence menuKey **berhenti tanpa fallback role[]**, menu ini **tak bisa** dibuka lewat role/role_permissions — **wajib** per-user di sini. (Catatan: INSERT tak set `is_cross_entity` → konsisten dgn Bagian 18, flag itu memang tak dipakai.)

## BAGIAN 20 — Task 4: Rekonsiliasi "3 sistem permission"

Precedence `canSeeMenuItem` (`App.jsx:1089-1105`): **(1)** `public` → **(2)** menuKey `hasMenuPermission` [`user_menu_permissions`, PER-USER] → **(3)** module `hasPermission` [`role_permissions`, PER-ROLE, **view saja**] → **(4)** `role[]` array [hardcode di kode] → **(5)** default-deny.

| Sistem | Status | Catatan |
|---|---|---|
| **role[] array** (di kode) | **ENFORCED** (cabang 4) | Dipakai mayoritas menu CRM/Reporting. Live. |
| **role_permissions** via `hasPermission(module,'view')` | **ENFORCED sebagian** (cabang 3) | Gate menu ber-`module` (crm-prospects, logistics, finance, inventory, foundation). **Hanya view.** |
| **user_menu_permissions** via `hasMenuPermission(menuKey,'view')` | **ENFORCED** (cabang 2) | Gate menuKey (crm_dashboard/pipeline/customers, logistics_sp). Live. |

**Yang "gadipake" (inert) — inilah yang Den dengar:**
1. **Kolom CROSS ENTITY** (`is_cross_entity`) — 0 policy, helper FE tak dikonsumsi. **MATI.** (Bagian 18)
2. **Action toggles selain `view`** di Roles matrix (create/edit/delete/approve/export/print) — tersimpan, **tak ada konsumen**. **INERT.**
3. **Fungsi DB `has_permission()`** (TD-02) — RLS CRM pakai `is_manager_or_above`, **bukan** `has_permission` → policy live tak memanggilnya. **Efektif tak terpakai.**
4. **Helper FE `isCrossEntity()`** — di-destructure, tak dipakai. **MATI.**

**Nuансa penting:** ketiga sistem itu **hanya mengatur VISIBILITAS MENU (frontend)**. **Tak satu pun mendrive RLS.** RLS = pengecekan role hardcode terpisah (`is_manager_or_above`/`is_super_admin`/`get_user_company_id`). Jadi "merapikan" UI RBAC **tak pernah** mengubah data yang boleh dibaca/ditulis DB — itu ranah RLS.

## BAGIAN 21 — Task 5: VERDICT — gm_bd Full via UI?

**TIDAK BISA full lewat UI. SQL + (untuk lintas-entitas) custom RLS tetap WAJIB.**

| Kebutuhan gm_bd | Bisa via UI? | Alasan / bukti |
|---|---|---|
| **Bikin role `gm_bd`** | ❌ **TIDAK** | Roles UI SELECT-only, tak ada INSERT `roles` (`useRoles.js:28`). → **SQL** `INSERT INTO roles` per-company. |
| **gm_bd dikenali "manager-or-above"** (lihat CRM se-company, bukan cuma own) | ❌ **TIDAK** | `is_manager_or_above()` hardcode `code IN ('super_admin','admin','ceo','gm','manager','supervisor')` — **tanpa gm_bd** (`schema:829`). Tanpa +gm_bd, RLS CRM cuma kasih baris `assigned_to/created_by` = own. → **SQL** `CREATE OR REPLACE`. |
| **Lintas-3-entitas (MSI+JCI+SOA)** | ❌ **TIDAK** | CROSS ENTITY checkbox **inert** (Bagian 18). Cross-entity RLS = cuma `is_super_admin`. → **SQL custom RLS** (cabang baru ~12-14 tabel) = Paket 2. |
| Grant modul CRM (view) ke role | ⚠️ **sebagian** | Roles UI bisa toggle `role_permissions` (super_admin), TAPI cuma gate view + **role harus sudah ada dulu (SQL)** + katalog perlu ada baris `module='crm'` (lihat Bagian 15/temuan sebelumnya — perlu konfirmasi). |
| **Bikin user Vendi + assign role** | ✅ **YA** | User Access → Add User (create-user EF), role via dropdown. |
| **Buka crm_dashboard/pipeline/customers** utk Vendi | ✅ **YA** | User Access → Permissions → `user_menu_permissions` (Bagian 19). **Cara resmi & satu-satunya.** |
| role[] menu (Lead Pool/Reporting/MOM approve dll) | ❌ **TIDAK (via UI)** | Array di kode (`App.jsx`, `MOMDetailPage.jsx` dll) — **KODE**, bukan data. → edit source. |

**Alasan tegas:** UI RBAC **wired untuk 3 hal**: (a) toggle `role_permissions` view, (b) bikin user+assign role, (c) grant per-user menuKey. Tapi **role creation, pengenalan hierarki (`is_manager_or_above`), dan lintas-entitas** semuanya di luar jangkauan UI → **SQL wajib**; lintas-entitas bahkan butuh **custom RLS** (checkbox CROSS ENTITY tak menggantikannya). Ditambah gate role[] & in-page guard (MOM approve dll) = **perubahan KODE**. → Peta eksekusi Paket 1 (Bagian 14) + Paket 2 (Bagian 11) **tetap berlaku**; UI hanya menggantikan langkah "assign role" + "grant menuKey" (step 6-7), **bukan** langkah SQL role/hierarki/RLS.

**Perlu konфirmasi (jujur — tak bisa dipastikan dari repo):** (1) apakah ada policy SQL-editor yang membaca `is_cross_entity` TAPI belum masuk `schema_snapshot.sql` (snapshot = source of truth, tapi bisa tertinggal dari perubahan manual) — sangat kecil kemungkinannya krn helper FE-nya juga mati, tapi bisa diverifikasi Den via `SELECT … FROM pg_policies WHERE qual ILIKE '%is_cross_entity%'`. (2) Katalog `permissions` punya baris `module='crm'`? (query di Bagian 15) — menentukan bisa/tidak grant crm.view via Roles UI.

> ⚠️ Tidak ada kode/DB diubah di audit ini (hanya AUDIT.md ditambah section baru). Semua di atas = temuan/saran, belum dieksekusi.

---

---

# BAHAN EKSEKUSI PAKET 1 — MOM/Approval + Dump SQL (2026-07-09)

> Klarifikasi kenapa MOM/Approval tak muncul di UI Permissions + bahan mentah untuk nyusun INSERT `gm_bd`. Read-only. Sumber: `src/` + `schema_snapshot.sql`.

## BAGIAN 22 — A: MOM & Approval di-gate DI MANA

**Akar kenapa tak ada di UI User Access:** UI Permissions cuma nulis `user_menu_permissions`, dan itu **hanya dikonsumsi untuk menu yang punya entri di `MENU_KEY_MAP`** (`App.jsx:1093-1096`). **`reporting-mom` dan `crm-lead-pool-approval` TIDAK ada di `MENU_KEY_MAP`** (`App.jsx:1012-…`, dicek — tak ada). Jadi keduanya jatuh ke cabang **role[]** di `canSeeMenuItem` → **tak bisa disetel dari UI**.

### A1 — Akses MOM (lihat + approve) di-gate di mana

| Aspek MOM | Gate | Sumber | Via UI? |
|---|---|---|---|
| **Lihat menu MOM** (visibilitas) | **role[]** di kode | `App.jsx:795` → `role:['super_admin','admin','ceo','gm','manager','supervisor','sales','operations']` | ❌ (role[], bukan menuKey) |
| **Lihat SEMUA MOM** (bukan cuma bikinan sendiri) | in-page const `SEE_ALL_ROLES` | `MOMListPage.jsx:12,22` → `['super_admin','admin','ceo','gm','manager','supervisor']` | ❌ (hardcode kode) |
| **Approve/Reject MOM** | in-page const `APPROVER_ROLES` | `MOMDetailPage.jsx:10,81` → `['ceo','admin','super_admin']` | ❌ (hardcode kode) |

→ **Semua jalur MOM = role[] / const di KODE.** Nol lewat `user_menu_permissions`. `reporting-mom` **tak punya** menuKey.

### A2 — Approval (Lead Pool, MOM) = role[] hardcode?

**KONFIRMASI TEGAS: YA, hardcode di kode. TIDAK bisa diatur dari UI Permissions.**

| Approval | Gate | Sumber |
|---|---|---|
| **Approval Lead Pool** (menu) | **role[]** — `['manager','supervisor','admin','super_admin']` (gm/ceo/gm_bd TAK masuk) | `App.jsx:472` (+ label NEXUS_NAV `:855`, tanpa role → ikut :472) |
| **MOM approve** | const `APPROVER_ROLES` | `MOMDetailPage.jsx:10` |

`crm-lead-pool-approval` **tak ada** di `MENU_KEY_MAP` → cabang role[]. Approve/Reject di dalam halaman = `.includes(erpRole)` terhadap array literal. **Keduanya data-di-kode, bukan data-di-DB** → UI Permissions (yang cuma sentuh `user_menu_permissions`) **mustahil** mengubahnya.

### A3 — Kesimpulan: untuk gm_bd bisa MOM + approval → UBAH KODE, bukan UI

**Untuk MOM + Approval, yang diubah = KODE (tambah `'gm_bd'` ke role[]/const), BUKAN centang UI.** Itulah sebabnya "Approval" tak muncul di UI Permissions: **approval sengaja tak dimodelkan sebagai menu-permission** — ia array role literal di source. Titik sisip untuk gm_bd:

| Target | File:line | Aksi |
|---|---|---|
| Lihat menu MOM | `App.jsx:795` | +`'gm_bd'` (opsional — sudah luas; tambah biar eksplisit) |
| Lihat semua MOM | `MOMListPage.jsx:12` | +`'gm_bd'` |
| **Approve MOM** (T1) | `MOMDetailPage.jsx:10` | +`'gm_bd'` |
| **Approval Lead Pool** (T2) | `App.jsx:472` | +`'gm_bd'` (± `'ceo'`) |

**Kontras:** menu ber-menuKey (CRM Dashboard/Pipeline/Master Customer) = **UI per-user** (`user_menu_permissions`). MOM/Approval = **KODE**. Dua mekanisme beda — itu sebabnya sebagian muncul di UI, sebagian tidak.

## BAGIAN 23 — B: Dump Bahan SQL

### B4 — Struktur tabel `roles` (DDL live)

```sql
CREATE TABLE public.roles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,   -- PK, auto
    company_id uuid NOT NULL,                                 -- FK company (per-entitas)
    code character varying(50) NOT NULL,                      -- 'gm_bd'
    name character varying(100) NOT NULL,                     -- 'GM BD'
    description text,                                         -- nullable
    is_system_role boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,                                          -- nullable
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone                       -- nullable (soft delete)
);
-- Constraint: UNIQUE (company_id, code)  [roles_company_code_unique, schema:5467]
-- PK: id [roles_pkey]
```

**PENTING (jawab Q4):** **TIDAK ADA kolom `is_cross_entity` di tabel `roles`.** Kolom itu hanya di `role_permissions`/`user_menu_permissions`/`role_permission_templates` (dan **inert** — Bagian 18). Jadi INSERT `gm_bd` **tak** melibatkan flag cross-entity. Kolom wajib diisi: `company_id`, `code`, `name` (sisanya punya default). `is_system_role` best-practice `true` (role sistem, cegah user hapus dari UI).

### B5 — Pola INSERT dari seed migrasi `20260606000028` (format nyontek)

Seed resmi pakai **CROSS JOIN companies + `ON CONFLICT DO NOTHING`** (idempoten). Baris `manager` di VALUES-nya:

```sql
-- dari 20260606000028_new_roles_seed_and_permissions.sql (STEP 1)
INSERT INTO roles (company_id, code, name, description, is_system_role, is_active)
SELECT c.id, r.code, r.name, r.description, true, true
FROM companies c
CROSS JOIN (VALUES
    ('manager', 'Manager', 'Department Manager. Manage team operations and approve documents.')
    -- ...role lain...
) AS r(code, name, description)
WHERE c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;
```

→ Template `gm_bd` (MSI dulu; ganti VALUES + filter company sesuai kebutuhan Paket 1 single-entity):
```sql
-- ILUSTRATIF — MSI saja (Paket 1). company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492
INSERT INTO roles (company_id, code, name, description, is_system_role, is_active)
VALUES ('0e1840d8-e6fb-4190-bd09-88338e68b492', 'gm_bd', 'GM BD',
        'GM Business Development. Lintas-entitas CRM+Reporting+Approval.', true, true)
ON CONFLICT (company_id, code) DO NOTHING;
-- verifikasi: SELECT id, company_id, code FROM roles WHERE code='gm_bd';
```
*(Nilai di atas = draft untuk direview, BUKAN dieksekusi. Deskripsi/entitas final tunggu keputusan Den.)*

### B6 — Body LIVE `is_manager_or_above()` (baris yang perlu +gm_bd)

```sql
CREATE FUNCTION public.is_manager_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','ceo','gm','manager','supervisor')  -- ← +'gm_bd' DI SINI
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$$;
```
**Role di dalamnya:** `super_admin, admin, ceo, gm, manager, supervisor` (6). **Tanpa `gm_bd`.** Baris yang perlu diubah = klausa `r.code IN (...)`. Tanpa ini, gm_bd cuma lihat baris **own** (`assigned_to`/`created_by`) di RLS CRM, **bukan** se-company. Cara: `CREATE OR REPLACE FUNCTION` (signature sama), test RLS di browser (auth.uid() NULL di SQL Editor). *(Catatan: doc `04` sebut `sales_head` di fungsi ini — STALE; body live pakai `supervisor`, tak ada `sales_head`.)*

### B7 — ERP_ROLE_PRIORITY (posisi sisip gm_bd)

```js
// src/contexts/AuthContext.jsx:10-14
const ERP_ROLE_PRIORITY = [
  'super_admin','admin','ceo','gm','manager','supervisor',   // ← sisip 'gm_bd' setelah 'gm' → …'ceo','gm','gm_bd','manager'…
  'finance_controller','finance','operations',
  'sales','procurement','hrga','it','viewer',
];
```
**Posisi `gm_bd`:** setelah `'gm'`, sebelum `'manager'` (setara/dekat gm; index dipakai `pickPrimaryErpRole` untuk pilih role tertinggi bila user multi-role — relatif, aman disisip). Titik lain yang butuh entri role (dari audit Bagian 10/14): daftar opsi role di User Access `App.jsx:267` (+`{id:'gm_bd', label:'GM BD'}`).

## BAGIAN 24 — Ringkas untuk Paket 1

- **MOM + Approval = KODE** (role[]/const di `App.jsx:472,795`, `MOMDetailPage.jsx:10`, `MOMListPage.jsx:12`) — **bukan** UI. Itu sebabnya tak ada di User Access Permissions.
- **INSERT `roles`** = kolom minimal `company_id, code, name` (+`is_system_role=true`, `is_active=true`); **UNIQUE(company_id, code)**; **tak ada** kolom cross-entity di `roles`.
- **`is_manager_or_above()`** wajib +`'gm_bd'` (SQL `CREATE OR REPLACE`) — kalau tidak, RLS CRM cuma kasih baris own.
- **`ERP_ROLE_PRIORITY`** + opsi role `App.jsx:267` = KODE.
- Lintas-3-entitas & checkbox CROSS ENTITY = **tak menolong** (Paket 2, custom RLS — lihat Bagian 18/21).

> ⚠️ Tidak ada kode/DB diubah (hanya AUDIT.md ditambah). SQL/kode di atas = draft untuk direview, belum dieksekusi. Nilai UUID/deskripsi final tunggu keputusan Den.
