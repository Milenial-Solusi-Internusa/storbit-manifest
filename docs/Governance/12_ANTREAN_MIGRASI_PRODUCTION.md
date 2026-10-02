# Antrean Migrasi Production

**Dibuat 25 September 2026** · daftar urut perubahan database yang **belum** berlaku di produksi.

| | |
|---|---|
| Tujuan | Satu tempat untuk menjawab "apa yang harus dijalankan di produksi saat launching" |
| Dibuka | Sebelum merge `develop` → `main`, dan setiap kali ada SQL manual di staging |
| Production | `untmpqceexwxzuhlmyrg` (`nexus-msi`) |
| Staging | `oovmlhilhqzejnawqkvt` (`nexus-staging`) |

> ⚠️ **Deploy kode TIDAK membawa perubahan DB.** Seluruh butir di bawah adalah langkah **manual di SQL Editor**, terpisah dari merge dan dari Vercel. Melewatkannya berarti kode baru bertemu skema lama.
>
> ⚠️ **Dua arah, jangan tertukar.** Sebagian butir justru sudah LIVE di produksi dan stagingnya yang menyusul (butir 1 & 2). Butir itu **nol tindakan** saat launching; dicatat supaya tidak dikira utang.
>
> Kolom "staging" di bawah **diukur langsung** ke `nexus-staging` 25 Sep 2026, bukan diasumsikan dari laporan.

---

## Ringkasan

| # | Perubahan | Staging | Production | Tindakan saat launching |
|---|---|---|---|---|
| 1 | `20260917000001_delivery_signed_date` | ✔ 24 Sep | ✔ 17 Sep | **nol** — referensi |
| 2 | Parity AR Tahap 0 + seed COA SOA | ✔ 24 Sep | ✔ (rekonsiliasi AR) | **nol** — referensi |
| 3 | `crm_rate_list` → katalog modul `procurement` | ✔ 24 Sep | ⛔ **belum** | ⛔ **WAJIB jalankan** |
| 4 | Cabut 4 izin `bd_sales_executive` | ✔ 24 Sep | ⏸ belum | ⏸ **menunggu keputusan** |
| 5 | `20260924000001` + `20260924000002` (katalog menu) | ⛔ belum | ⛔ belum | opsional, lihat butir 5 |
| 6 | `20260925000001_dni_sp_order_item_link` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — paling lambat bersama AR Tahap 1 |
| 7 | `20260925000002_sp_order_items_legacy_unique` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 6 |
| 8 | `20260926000001_set_delivery_signed_date` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 1 |
| 9 | `20260926000002_ar_single_issue_path` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 1, TERAKHIR |
| 10 | `20260925000003` — `notify_sp_milestone` no-op | ✔ 25 Sep | — **tidak boleh** | ⛔ **JANGAN dijalankan** — arah terbalik, staging saja |
| 11 | `20260927000001_invoice_due_date_backfill` | ✔ 25 Sep (fixture) | ⛔ belum | ⛔ **WAJIB** — AR Tahap 2 |
| 12 | `20260927000002_account_role_mapping` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 2, SEBELUM butir 13 |
| 13 | `20260927000003_journal_account_roles_and_readiness` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 9 DAN butir 12 |
| 14 | Grant menu `fin_invoice` (`20260927000004`) | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — tanpa ini halaman baru super_admin-only |
| 15 | Parity staging: `20260902000006` + `20260910000001` | ✔ 25 Sep | ✔ sudah sejak 2-11 Sep | — **nol** — arah terbalik |
| 16 | `20260928000001_invoice_header_v2` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — invoice lengkap, PERTAMA |
| 17 | `20260928000002_invoice_line_v2` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 16 |
| 18 | `20260928000003_invoice_issue_v2` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 17 DAN butir 9 |
| 19 | `20260928000004_invoice_write_lockdown` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 18 |
| 20 | `20260928000005_staging_only_taxes_from_production` | ✔ 25 Sep | — **tidak boleh** | ⛔ **JANGAN dijalankan** — arah terbalik, staging saja |
| 21 | `20260928000006_invoice_line_tax_link` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 17 |
| 22 | `20260928000007_invoice_post_issue_rpcs` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 16 |
| 23 | `20260928000008_invoice_attachments` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — bucket Storage, lihat butir 23 |
| 24 | `20260928000009_invoice_notes` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — mandiri |
| 25 | `20260928000010_invoice_issue_tax_link` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 18 dan 21 |
| 26 | `20260928000011_invoice_coretax_code_whitelist` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 22 |
| 27 | `20260928000012_td281_h1_revoke_public_execute` | ✔ 28 Sep | ✔ **28 Sep** | — **selesai** — ⚠️ arah terbalik, production dulu |
| 28 | `20260928000013_td281_h1_lapis2_guard_dan_jejak` | ✔ 28 Sep | ✔ **28 Sep** | — **selesai** — ⚠️ naik BERSAMA butir 29, satu sesi |
| 29 | `20260928000014_td281_l2_fix_check_similar_accounts` | ✔ 28 Sep | ✔ **28 Sep** | — **selesai** — ⚠️ arah terbalik + satu sesi dengan butir 28 |
| 30 | `20260929000001_td281_h2_default_privileges` | ✔ 28 Sep | ✔ **28 Sep** | — **selesai** — ⚠️ arah terbalik, mandiri |
| 31 | `20260929000002_td281_h3_search_path` | ✔ 28 Sep | ✔ **28 Sep** | — **selesai** — ⚠️ arah terbalik, mandiri |
| 32 | `20260929000004_ar_tahap3_compute_payment_term_days` | ✔ 29 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 3, PERTAMA |
| 33 | `20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan` | ✔ 29 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 12 |
| 34 | `20260929000006_ar_tahap3_sp_payments_potongan_kolom` | ✔ 29 Sep | ⛔ belum | ⛔ **WAJIB** — mandiri |
| 35 | `20260929000007_ar_tahap3_record_payment_v3` | ✔ 29 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 9, 13, 33, 34 |
| 36 | `20260929000008_ar_tahap3_ttf_tanggal_dan_due_date` | ✔ 29 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 18, 25, 32 |
| 37 | `20260929000009_ar_tahap3_due_date_ttf_backfill` | ✔ 29 Sep (STOP KERAS dilewati manual, sesudah review V0 Den) | ⛔ belum | ⏸ **MENUNGGU REVIEW DEN** (ulang, untuk data production saat launching) — sesudah butir 36 |
| 38 | `20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali` | ✔ 29 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 36 |
| 39 | `20260930000001_ar_tahap3b_status_pending_approval` | ✔ 30 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 3 bagian kedua, PERTAMA |
| 40 | `20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate` | ✔ 30 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 39 |
| 41 | `20260930000003_ar_tahap3b_approve_reject_invoice` | ✔ 30 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 39, 40 |
| 42 | `20260930000004_ar_tahap3b_record_payment_ttf_pending_guard` | ✔ 30 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 39 |
| 43 | `20260930000005_ar_tahap3b_submit_invoice_finance_role` | ✔ 30 Sep | ⛔ belum | ⛔ **WAJIB** — mandiri |
| 44 | `20260930000006_ar_tahap3b_get_invoice_audit_trail` | ✔ 30 Sep | ⛔ belum | ⛔ **WAJIB** — mandiri |
| 45 | `20260930000007_td281_h5_lapis1_revoke_trtm_existing` | ✔ 30 Sep | ✔ 30 Sep | — **selesai** — pengerasan mandiri, dijalankan sebelum launching, staging & production hari yang sama |
| 46 | `20260930000008_td281_h5_lapis2_anon_business_tables` | ✔ 30 Sep | ✔ 30 Sep | — **selesai** — dijalankan dengan koreksi (lihat §H5); staging & production hari yang sama |

**Butir 3** memblokir launching. **Butir 6 sampai 9** adalah AR Tahap 1 dan wajib, dengan **urutan yang MENGIKAT: 6 → 7 → 8 → 9.** **Butir 32 sampai 38 adalah AR Tahap 3, dan urutannya MENGIKAT: 32 → 33 → 34 → 35 → 36 → 37 (37 opsional/menunggu review) → 38** (rincian dependensi tiap butir: lihat seksinya masing-masing di bawah; butir 38 hanya butuh 36, tidak bergantung pada 37). Seed staging `scripts/seed/staging_ar_tahap3_potongan_pelanggan.sql` (peran `potongan_pelanggan` → akun 4-1900 SOA) **TIDAK masuk antrean ini** — ia staging-only by design, tidak pernah naik ke produksi (lihat butir 33).

✅ **Pemblokir launching KEDUA: PAKET KEAMANAN TD-281 (H4 + H5 + H6) — SELESAI, TIDAK LAGI MEMBLOKIR.** Lihat §*Paket Keamanan TD-281* di bawah. Butir 27-31 (H1-H3), **butir 45-46 (H5 lapis 1 & 2)**, dan **H6 (koreksi README/security-baseline.md) SEMUANYA ✅ SELESAI** — H5 dijalankan 30 Sep 2026 sebagai pengerasan mandiri **SEBELUM** launching (staging & production hari yang sama, keputusan Den 30 Sep 2026); H6 ditulis ulang 30 Sep 2026 sesudah H5 live, menemukan TD-301 (HIGH) dan TD-302 (LOW) sebagai temuan sampingan di luar cakupan paket ini. H4 sisa (`get_linked_bnf_status`) **sengaja TIDAK diperbaiki terpisah** — ikut Fase 4 (penghapusan total BNF-family) — lihat rincian di §*Paket Keamanan TD-281*.

⛔ **Pemblokir launching KETIGA (baru, 1 Okt 2026): TD-300 ("Group E") — keputusan Den.** 99 fungsi `public` di production (98 staging) masih EXECUTE untuk `anon` dan/atau `PUBLIC`, dan **belum satu pun badannya dibaca satu-per-satu** — lahir dari riset H5, sengaja **tidak** digabung ke paket TD-281 (cakupannya jauh lebih besar dan lebih berisiko daripada Group A/B H5, yang terbukti aman lewat bukti kode+log 7 hari). **Status TETAP OPEN, baru sebatas PLAN** — rancangan lengkap (V-PRA-1/2/3, loop GRANT-lalu-REVOKE pola H1, migrasi companion `ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS`) ada di `08_TECH_DEBT.md` TD-300, **belum ditulis migrasinya** (instruksi Den 30 Sep 2026: PLAN dulu, jangan eksekusi). Naik statusnya jadi pemblokir launching KETIGA justru karena cakupannya besar — membiarkan 99 fungsi tak terbaca bukan sesuatu yang boleh terbawa lewat launching berikutnya tanpa keputusan eksplisit.

✅ **TD-301 (user nonaktif tetap bisa login, HIGH) SELESAI sebagai HOTFIX — tidak pernah jadi pemblokir launching, dan sekarang sudah lewat.** Beda dengan TD-300: celah ini sudah live di production hari ia ditemukan (insiden ditangani darurat 30 Sep 2026), jadi perbaikan permanennya dirancang dan dieksekusi sebagai hotfix (`hotfix/td301-user-nonaktif`, branch dari `main` — bukan dari `develop`), lepas dari siklus `develop` → `main` yang dipakai fitur biasa. **Status 2 Okt 2026: tiga lapis (Edge Function `set-user-status` + migrasi `is_caller_active()`/`20261001000001` + `AuthGate` auto-signout) LIVE staging DAN production**, dengan dua koreksi performa/kebenaran yang ditemukan saat dijalankan (lihat `08_TECH_DEBT.md` TD-301 pembaruan 2 Okt + gotcha #46/#47 di `03_DATA_MODEL.md`). Hotfix sudah merge ke `main` lalu ke `develop`, keduanya nol konflik. Karena sudah lewat sebelum gerbang launching mana pun relevan, baris ini **tidak** dan tidak pernah jadi gerbang — dicatat di sini murni sebagai jejak hotfix keamanan di luar alur launching biasa.

⛔ Urutan itu bukan kerapian. Butir 9 punya palang yang **menolak jalan** kalau butir 6 dan 7 belum terpasang, karena invariant piutang di dalamnya menuntut setiap Surat Jalan punya `sp_order_item_id`; tanpa butir 6, setiap invoice baru nol jurnal dan invariant gagal untuk **semuanya**. Butir 8 sebelum 9 karena butir 9 menyempitkan apa yang boleh ditagih, dan butir 8 adalah satu-satunya jalan membuka 9 SP yang tertahan hanya karena tanggal tanda tangan kosong.

**Butir 11 sampai 14 = AR Tahap 2, dan urutannya MENGIKAT pada dua titik:** butir **12 sebelum 13** (butir 13 menolak jalan tanpa tabel pemetaan — periksa palangnya), dan butir **13 sesudah butir 9**. Yang kedua mudah terlewat: butir 13 menulis ulang `create_invoice_for_sp`, dan palangnya menolak jalan kalau yang hidup belum versi AR Tahap 1 — kalau palang itu tidak ada, menjalankan butir 13 di produksi hari ini akan **memasang guard AR Tahap 1 di luar urutan antrean**, tanpa satu pun butir 6-9 dijalankan.

Butir **11** dan **14** berdiri sendiri: yang pertama cuma menyentuh `sp_invoices.due_date`, yang kedua cuma baris izin menu.

**Butir 10 arahnya bukan "staging menyusul produksi", melainkan "staging sengaja BERBEDA dari produksi, selamanya".** Ia ada di daftar ini justru supaya tidak ikut terbawa naik saat butir lain dijalankan.

Butir 6 dan 7 boleh dijalankan **lebih awal** dari 8 dan 9 — keduanya idempoten, dan setiap Surat Jalan baru yang terbit sebelum butir 6 jalan menambah baris cacat yang harus di-backfill nanti.

---

## 1. `20260917000001_delivery_signed_date` — REFERENSI SAJA

Arahnya **terbalik** dari butir lain: produksi lebih dulu.

| | |
|---|---|
| Isi | `delivery_notes.signed_date` (date) + overload `mark_delivery_delivered(uuid, date)` + ACL |
| Production | **LIVE 17 Sep 2026**, dijalankan manual di SQL Editor |
| Staging | menyusul **24 Sep 2026** (menutup TD-265) |
| Terukur di staging | kolom ada · overload 2-argumen ada |
| Tindakan | **NOL.** Jangan dijalankan lagi |

~~⚠️ Overload lama `mark_delivery_delivered(uuid)` **masih hidup di kedua environment**, tanpa `REVOKE … FROM PUBLIC` dan tanpa syarat `signed_date` — **TD-263**, DROP-nya = Keputusan Terbuka **#59**. Bukan bagian antrean ini.~~ **[KOREKSI 25 Sep 2026 — dua hal berubah.]** **(1)** Ia **KINI BAGIAN antrean ini**: butir **9** men-DROP-nya, jadi di staging sudah tidak ada dan di produksi akan hilang bersama butir 9 (**#59 TERJAWAB**, opsi DROP; **TD-263 RESOLVED di kode**). **(2)** Deskripsinya **salah pada satu titik**: overload itu **tidak bisa dipanggil sama sekali** — versi 2-argumen ber-`DEFAULT NULL` membuat setiap panggilan 1-argumen **ambigu** (`42725 function … is not unique`), dibuktikan di produksi lewat `EXPLAIN`. Jadi jalan pintas "tandai terkirim tanpa tanggal" **terkunci**, bukan terbuka. ⚠️ Dan badannya **tetap punya guard peran** — yang absen hanyalah syarat tanggal + `REVOKE PUBLIC`. Lihat butir 9 dan `03_DATA_MODEL.md` gotcha **#39**.

## 2. Parity AR Tahap 0 + seed COA SOA — REFERENSI SAJA

Juga terbalik: produksi lebih dulu (sesi rekonsiliasi AR Storbit), staging disamakan **24 Sep 2026**.

Objek yang disamakan, **terukur di staging 25 Sep 2026**:

| Objek | Staging |
|---|---|
| `journal_entries.delivery_note_id` + FK → `delivery_notes(id)` | ✔ ada |
| `create_invoice_for_sp(uuid, date)` | ✔ ada |
| `create_invoice(uuid, date)` | ✔ ada, **satu overload saja** (`pronargs` = 2) |
| `sp_invoice_one_per_sp` | ✔ `UNIQUE INDEX … (sp_order_id) WHERE (status <> 'void')` — **parsial**, cermin produksi |
| `chart_of_accounts` entitas SOA | ✔ 7 akun (disalin dari produksi) |

| | |
|---|---|
| Tindakan | **NOL.** Produksi sudah memilikinya |

~~⚠️ ACL kedua fungsi invoice **masih default PUBLIC di kedua environment**. Pengetatannya (`REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`) adalah **Tahap 1 rencana AR**, bukan butir antrean ini.~~ **[KOREKSI 25 Sep 2026: pengetatan itu KINI butir 9 (butir e), dan cakupannya TIGA fungsi — `create_invoice` + `create_invoice_for_sp` + `submit_invoice`, ketiganya ber-PUBLIC EXECUTE sebelumnya.** Sudah berlaku di staging; produksi mengikut butir 9. Jadi kalimat "bukan butir antrean ini" **tidak berlaku lagi**.]

## 3. ⛔ `crm_rate_list` → katalog modul `procurement` — WAJIB

**Satu-satunya butir yang memblokir launching** (butir 6 juga wajib, tapi tenggatnya AR Tahap 1, bukan launching).

| | |
|---|---|
| Isi | Saklar/toggle **Rate List** (`module_menus.key = 'crm_rate_list'`) dipindah dari katalog modul `crm` ke modul **`procurement`** |
| Staging | ✔ dilakukan **manual 24 Sep 2026**. Terukur 25 Sep: modul = `procurement` |
| Production | ⛔ **belum** |
| Berkas migrasi | ⛔ **tidak ada** — nol jejak git, nol berkas di `supabase/migrations/` |
| Kenapa wajib | Kerangka menu Bagian 1 menempatkan Rate List di bawah Procurement. Tanpa pemindahan katalog, izin menu untuk Rate List tidak cocok dengan posisinya di sidebar produksi |

**Langkah:** jalankan `UPDATE` di SQL Editor produksi untuk memindah `module_menus.module_id` baris `crm_rate_list` ke id modul `procurement`. Sebelum dan sesudah, catat hasil:

```sql
-- V0 (sebelum) dan V1 (sesudah) - jalankan query yang SAMA
SELECT m.key AS modul, mm.key AS menu_key, mm.is_active
FROM module_menus mm JOIN modules m ON m.id = mm.module_id
WHERE mm.key = 'crm_rate_list';
-- HARAPAN sesudah: modul = procurement
```

⚠️ **Jangan hapus-lalu-buat-ulang barisnya.** `role_menu_permissions` dan `user_menu_permissions` menunjuk ke `menu_actions.id`; menghapus baris menu akan ikut menjatuhkan seluruh grant yang menempel padanya. Yang benar = `UPDATE module_id`, bukan DELETE + INSERT.

⚠️ Sesudah dijalankan, **rekam sebagai migrasi retroaktif** (pola `20260917000001`) supaya berhenti jadi perubahan tanpa jejak.

## 4. ⏸ Cabut 4 izin `bd_sales_executive` — MENUNGGU KEPUTUSAN

| | |
|---|---|
| Isi | Izin `view` role **`bd_sales_executive`** dicabut untuk **`proc_prf`**, **`proc_inquiry_fwd_msi`**, **`report_mom`**, **`crm_rate_list`** |
| Staging | ✔ dilakukan **manual 24 Sep 2026** lewat Role Defaults. Terukur 25 Sep: role ini punya **10** grant (semuanya `crm_*`); migrasi `20260912000005` dulu menyeed **14** |
| Production | ⏸ **belum, dan belum diputuskan apakah harus** |
| Berkas migrasi | ⛔ tidak ada — nol jejak git |
| Efek yang terlihat | Akun ber-role ini dipental ke Beranda/Command Center saat membuka keempat tujuan itu. Tiga role BD saudaranya (`bd_account_executive`, `bd_sales_spv_console`, `bd_sales_spv_forwarding`) **tidak disentuh** dan masih punya keempatnya |

⚠️ **Ini keputusan bisnis, bukan konsekuensi teknis dari kerangka menu.** Kerangka Bagian 1 tidak menuntutnya: ia nol menggeser menu key. Kalau pencabutan ini dimaksudkan berlaku untuk pemegang role di produksi, itu langkah tersendiri yang **belum diputuskan** — jangan diikutkan ke launching hanya karena stagingnya sudah begitu.

⚠️ Pencabutan ini kini **bagian dari baseline sweep QA**. Kalau kelak dibalik di staging, sweep akan melaporkannya sebagai perubahan akses — itu benar, bukan regresi.

## 5. Dua migrasi katalog menu — BELUM DIJALANKAN DI MANA PUN

| | |
|---|---|
| Berkas | `20260924000001_menu_skeleton_catalog.sql` · `20260924000002_menu_skeleton_grant_template.sql` |
| Staging | ⛔ belum. Terukur 25 Sep: **0** baris `module_menus` ber-key `skel_%` |
| Production | ⛔ belum |

**`20260924000001`** mendaftarkan 157 menu key placeholder `skel_*` ke katalog (`modules` / `module_menus` / `menu_actions`). 100% DATA, idempoten (`ON CONFLICT DO NOTHING`), **nol baris `role_menu_permissions`**.

⭐ **TIDAK WAJIB supaya kerangka menu bekerja.** Kode sudah benar tanpanya: `hasMenuPermission` default-deny, dan key yang **tidak ada** di katalog otomatis berarti "hanya `super_admin`" (bypass tier 1). Gunanya hanya membuat ke-157 key itu **muncul di matriks** RoleDefaultsPage / UserEditPage supaya kelak bisa di-grant lewat UI tanpa SQL.

⚠️ Karena isinya 100% DATA, `schema_snapshot.sql` yang schema-only **tidak akan pernah memuatnya**. Jangan menunggu bukti dari snapshot.

**`20260924000002`** = template pemberian izin. Jalankan hanya bila memang mau memberi izin ke key placeholder.

## 6. ⛔ `20260925000001_dni_sp_order_item_link` — WAJIB, paling lambat bersama AR Tahap 1

| | |
|---|---|
| Isi | (1) `generate_delivery_from_picking` mengisi `delivery_note_items.sp_order_item_id` · (2) backfill idempoten baris yang masih NULL · (3) guard keras di `create_invoice_for_sp` |
| Berkas migrasi | ✔ `supabase/migrations/20260925000001_dni_sp_order_item_link.sql` |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ⛔ belum |
| Sifat | 2 `CREATE OR REPLACE` (signature & ACL identik) + 1 `UPDATE` ber-`WHERE … IS NULL`. Nol DDL tabel, nol GRANT/REVOKE, nol baris dihapus |

**Sebabnya, dan kenapa ia tidak terlihat sampai sekarang.** `generate_delivery_from_picking` menyisipkan baris `delivery_note_items` **tanpa** kolom `sp_order_item_id` — kolomnya ada, dibiarkan NULL. `create_invoice_for_sp` menghitung jurnal per Surat Jalan lewat `JOIN sp_order_items soi ON soi.id = dni.sp_order_item_id`. Dengan NULL, join itu kosong → `v_amount_sj = 0` → `IF v_amount_sj = 0 THEN CONTINUE` → **invoice terbit, nol jurnal, nol error**.

⚠️ **Produksi hari ini tampak bersih, dan itu menyesatkan.** `delivery_note_items` = 1070 baris, **1070 terisi, 0 NULL** — tapi 237 baris yang berasal dari picking terisi oleh **backfill rekonsiliasi 22-23 Sep**, bukan oleh fungsinya; dan belum ada Surat Jalan baru dari picking sejak **22 Sep 15:50 UTC**. Jadi angka "0 NULL" bukan bukti fungsinya benar — ia bukti belum ada yang memakainya sejak backfill. Surat Jalan berikutnya dari UI akan NULL lagi.

**Bukti runtime (staging, 25 Sep 2026):** satu SP diuji rantai penuh SP → picking → Surat Jalan → BTB → invoice. Invoice `SOA-INV-VII-2026-0001` terbit dengan `total_amount` 9.490.500, **`n_jurnal` = 0**, debit piutang NULL. Data ujinya sudah dihapus.

**Keterkaitan dengan AR Tahap 1 (`…0003_ar_single_issue_path`).** Rencana AR Tahap 1 menambah **tiga** guard ke `create_invoice_for_sp`: (a) tolak SP tanpa BTB hidup, (b) pra-terbang tolak SP yang masih punya Surat Jalan selain `delivered`/`cancelled`, (c) invariant debit piutang = `total_amount` dengan toleransi Rp1 per Surat Jalan. Guard di butir ini adalah **yang keempat** dan **tidak bentrok** — (a) dan (b) dinilai sebelum loop jurnal, guard ini di dalam loop.

⭐ Yang mengikat: **guard (c) TIDAK BISA lolos tanpa butir ini.** Kalau AR Tahap 1 naik lebih dulu, invariant piutang akan gagal untuk **setiap** invoice baru, karena jurnalnya nol. Jadi butir 6 adalah **prasyarat** Tahap 1, bukan pekerjaan sejajar.

⛔ **Kalau AR Tahap 1 ditulis setelah butir ini jalan, salin badan `create_invoice_for_sp` dari LIVE (`pg_get_functiondef`), jangan dari snapshot** — `schema_snapshot.sql` (18 Sep) tidak memuat fungsi ini sama sekali, dan menyalin dari sana akan menghapus guard butir 6 tanpa terlihat di diff.

⚠️ **Jangan DROP lalu CREATE.** `generate_delivery_from_picking` punya ACL eksplisit (`authenticated=X/postgres`); `create_invoice_for_sp` memakai default PUBLIC. `CREATE OR REPLACE` menjaga keduanya, DROP mereset (gotcha #37 versi ACL).

⚠️ **Satu hal yang sengaja TIDAK dikerjakan di migrasi itu, dan perlu keputusan.** Keunikan `sp_order_items.legacy_sp_item_id` — rantai yang dipakai untuk memetakan — **tidak dijamin constraint apa pun**; satu-satunya index di tabel itu adalah `sp_order_items_pkey` (diukur di produksi 25 Sep 2026). Yang menjaganya hari ini adalah **data**, bukan skema: produksi 974 item, nol duplikat, nol yang dipakai lintas SP. Migrasi itu melindungi diri dengan dua cara (subquery skalar yang tidak bisa menggandakan baris + guard pra-terbang yang menolak jalan kalau ada duplikat), tapi index unik parsial `ON sp_order_items (legacy_sp_item_id) WHERE legacy_sp_item_id IS NOT NULL` akan menjadikannya jaminan skema. Itu DDL tabel, jadi diajukan sebagai keputusan terpisah — bukan diselipkan.

**Verifikasi:** blok `V0` dan `V1a`/`V1b`/`V1c` ada di dalam berkas migrasinya. **Hasil staging 25 Sep 2026:** `V1c` lolos penuh — `create_invoice_for_sp` mempertahankan `DEFAULT NULL::date`, `RETURNS uuid`, `SECURITY DEFINER`, `search_path=public`, ACL default, dan guardnya terpasang; `generate_delivery_from_picking` mempertahankan signature serta ACL eksplisitnya, dan INSERT-nya kini mengisi kolom.

⚠️ **`V1a` di staging = 5, dan itu BUKAN kegagalan.** Kelima baris milik SP uji lama `ZZZTEST-SP-0001` (24–26 Agu 2026) yang dual-write-nya tidak pernah lengkap: sisi lama punya 5 `sp_items` terkirim lewat 2 Surat Jalan, sisi baru hanya **satu** baris `sp_order_items` ber-`legacy_sp_item_id` NULL dan `shipped_qty` 0 — tidak ada kandidat untuk dipetakan. Dibiarkan apa adanya (data uji milik orang lain) dan tidak berbahaya: SP itu ditolak `create_invoice_for_sp` lebih dulu di cek "terkirim penuh". **Di produksi `V1a` harus 0** (1070/1070 sudah terisi per 25 Sep 2026); kalau > 0, selidiki `V1b` sebelum menerbitkan invoice untuk SP-nya.

⚠️ **Satu bug ditemukan saat dijalankan, sudah dikoreksi di berkasnya:** backfill semula ditulis `UPDATE … FROM a JOIN b ON b.x = dni.y`, dan Postgres menolaknya (`42P01`) karena kondisi `JOIN` tidak boleh merujuk tabel target. Bentuk yang benar = daftar FROM + seluruh syarat di `WHERE`. Kalau berkas ini disalin ke migrasi lain, salin bentuk yang sudah dikoreksi.

## 7. ⛔ `20260925000002_sp_order_items_legacy_unique` — WAJIB, sesudah butir 6

| | |
|---|---|
| Isi | `CREATE UNIQUE INDEX` parsial `sp_order_items_legacy_sp_item_id_key ON sp_order_items (legacy_sp_item_id) WHERE legacy_sp_item_id IS NOT NULL` + pra-cek duplikat |
| Berkas migrasi | ✔ `supabase/migrations/20260925000002_sp_order_items_legacy_unique.sql` |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ⛔ belum |
| Sifat | DDL index saja, idempoten (`IF NOT EXISTS`). Nol kolom, nol data, nol GRANT/REVOKE, nol policy |

**Kenapa wajib, bukan kosmetik.** Butir 6 memetakan lewat rantai `picking_list_items.sp_item_id` → `sp_order_items.legacy_sp_item_id`. Rantai itu hanya benar kalau `legacy_sp_item_id` unik — dan sebelum butir ini, **keunikannya tidak dijamin apa pun**: satu-satunya index di `sp_order_items` adalah `sp_order_items_pkey` (diukur di produksi 25 Sep 2026). Yang menjaganya adalah keadaan data, bukan skema.

⭐ **Kolomnya HANYA `legacy_sp_item_id`, bukan `(sp_order_id, legacy_sp_item_id)`** — satu baris `sp_items` lama boleh dimiliki tepat satu baris `sp_order_items` di seluruh sistem. Id lama yang sama muncul di dua SP berbeda bukan keadaan sah yang perlu diizinkan; itu tanda dual-write melenceng. Produksi 25 Sep: **nol** id yang dipakai lintas SP.

**Produksi siap:** 974 baris, **nol** `legacy_sp_item_id` NULL, **nol** nilai duplikat — pra-ceknya akan lolos. ⚠️ `CREATE UNIQUE INDEX` (tanpa `CONCURRENTLY`) mengambil ShareLock: penulisan ke `sp_order_items` tertahan selama pembuatan. Di 974 baris itu hitungan milidetik; `CONCURRENTLY` sengaja tidak dipakai karena ia tidak boleh berada di dalam blok transaksi.

**Verifikasi staging 25 Sep 2026:** index ada, `unik = true`, `parsial = true`; dan `V1c` membuktikan ia **mengikat** — insert duplikat ditolak `23505`, nol baris uji tertinggal.

⚠️ **`V1c` sempat hijau palsu dan resepnya sudah dikoreksi di berkasnya.** Percobaan pertama hanya mengisi lima kolom, lalu **gagal lebih dulu** di `company_id` dan `product_id` yang `NOT NULL` — cek uniknya tidak pernah tersentuh. Bentuk yang benar menyalin seluruh kolom dari baris yang sudah ada dan hanya mengganti `product_name`, plus cabang `WHEN OTHERS` yang membedakan "ditolak karena duplikat" dari "ditolak karena hal lain". Tanpa cabang itu, error `NOT NULL` terbaca sebagai bukti index bekerja. **Kelas yang sama dengan pelajaran lintas-alat di `scripts/qa/README.md`: asersi yang lolos karena prasyaratnya tak pernah terpenuhi.**

**Rollback:** `DROP INDEX IF EXISTS public.sp_order_items_legacy_sp_item_id_key;` — aman dan lengkap; index ini tidak menopang FK maupun constraint apa pun, dan butir 6 tetap benar tanpanya.

## 8. ⛔ `20260926000001_set_delivery_signed_date` — WAJIB (AR Tahap 1)

| | |
|---|---|
| Isi | 2 kolom jejak `delivery_notes.signed_date_filled_by`/`_at` + RPC `set_delivery_signed_date(uuid, date)` + ACL |
| Berkas | ✔ `supabase/migrations/20260926000001_set_delivery_signed_date.sql` |
| Staging | ✔ **dijalankan 25 Sep 2026**, V1a/V1b/V1c lolos |
| Production | ⛔ belum |
| Sifat | Aditif dan idempoten. 2 `ADD COLUMN IF NOT EXISTS` + 1 `CREATE OR REPLACE`. Nol baris data diubah. **Boleh naik sendiri** — perilaku penagihan tidak berubah oleh butir ini |

**Untuk apa.** `create_invoice_for_sp` hanya menjurnal Surat Jalan yang `delivered` **dan** ber-`signed_date`. SJ `delivered` tanpa tanggal karena itu membuat SP-nya tidak bisa ditagih, dan sampai sekarang **tidak ada jalan melengkapinya** — `mark_delivery_delivered` hanya menerima SJ `in_transit`.

**Populasi di produksi (read-only 25 Sep 2026):** **106 dari 698** SJ `delivered` ber-`signed_date` NULL, yang terakhir 15 Sep 2026 — sebelum kolomnya jadi wajib pada 17 Sep. **9 SP tertahan HANYA karena ini**; butir ini membuka tepat 9 SP.

⛔ **Ini bukan backfill.** Tanggal tanda tangan adalah fakta dari kertas SJ yang dipegang gudang; ia diketik orang yang memegang kertasnya, satu per satu. Backfill dari xlsx sudah dibatalkan (koreksi D-2): kolom di `SURAT_JALAN_2026.xlsx` adalah tanggal **dokumen dibuat**, dan di 6 dari 12 SP tanggal itu lebih awal dari `dispatched_at`.

Guard: hanya `delivered` + `signed_date IS NULL` (isi **sekali**, tidak bisa menimpa) · tanggal wajib, tidak di masa depan **WIB**, tidak sebelum `dispatched_at` WIB (dilewati bila `dispatched_at` NULL) · peran `roles.level <= 6` **ATAU** `operations` — **Finance tidak diberi akses** · `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.

⚠️ Guard tanggalnya memakai **WIB**, sengaja tidak mewarisi TD-264 (`mark_delivery_delivered` memakai `current_date` UTC sehingga menolak tanggal hari ini antara 00:00–06:59 WIB).

⚠️ Daftar peran di dalamnya adalah instance **baru** TD-233 (kini hidup di `is_manager_or_above()`, `mark_delivery_delivered`, `prf_release`, `prf_select_offer`, `is_manager_or_above_in()`, dan ini). Duplikasinya disengaja; perlakukan sebagai **checklist**.

**Rollback:** `DROP FUNCTION IF EXISTS public.set_delivery_signed_date(uuid, date);`. Kolomnya **sengaja tidak di-drop** — men-DROP kolom membuang jejak audit yang sudah terkumpul, tepatnya hal yang paling tidak boleh hilang saat rollback.

## 9. ⛔ `20260926000002_ar_single_issue_path` — WAJIB (AR Tahap 1, TERAKHIR)

| | |
|---|---|
| Isi | (a) `create_invoice` jadi pembungkus tipis · (b) `due_date` saat terbit · (c) `record_payment` tolak `issued` · (d) tiga guard baru · (e) ACL 3 fungsi · (f) DROP `mark_delivery_delivered(uuid)` |
| Berkas | ✔ `supabase/migrations/20260926000002_ar_single_issue_path.sql` |
| Staging | ✔ **dijalankan 25 Sep 2026**, V1a/V1b/V1c lolos + uji a–f lolos + seed 30/30 agregat + 21/21 rinci V11b |
| Production | ⛔ belum |
| Sifat | 3 `CREATE OR REPLACE` + 3 blok ACL + 1 `DROP FUNCTION`. Nol DDL tabel, nol policy, nol baris data diubah |

**Masalah yang ditutup.** Ada **dua** penerbit invoice yang hidup bersamaan dengan aturan berbeda: `create_invoice` (dipakai FE, 1 jurnal per invoice, nol guard BTB/SJ) dan `create_invoice_for_sp` (jurnal dipecah per SJ, tak pernah dipakai FE). Selama dua-duanya ada, "bagaimana invoice dijurnal" tidak punya satu jawaban.

⛔ **RADIUS DAMPAK DI PRODUKSI — baca sebelum menjalankan.** Diukur read-only 25 Sep 2026:

| | |
|---|---|
| SP terkirim penuh, belum ber-invoice | **62** |
| → **LOLOS** ketiga guard, masih bisa ditagih hari-1 | **5** |
| → tertahan **hanya** karena `signed_date` kosong (dibuka butir 8) | **9** |
| → tertahan karena **BTB belum ada** | **47** |
| → tertahan karena ada SJ belum `delivered` | **1** |

Yang bisa ditagih menyempit **62 → 5**, lalu **→ 14** setelah 9 tanggal dilengkapi lewat butir 8. **47 sisanya tertahan BTB, dan itu DITERIMA sebagai konsekuensi aturan CEO** (kirim penuh + BTB lengkap) — pekerjaan gudang, bukan pekerjaan Tahap 1 (keputusan Den D-17). Daftar 47 SP itu ada di laporan sesi 25 Sep 2026, **sengaja tidak ditulis ke berkas repo** (data produksi yang berubah tiap hari).

✅ **Guard (c) nol blast radius:** produksi punya **0** pembayaran pada invoice berstatus `issued`.

⚠️ **`due_date` NULL di 508 dari 509 invoice hidup.** Butir (b) hanya memperbaiki invoice **BARU**. Backfill 508 invoice lama **TIDAK** di Tahap 1 (keputusan Den D-14) — AR Aging nanti berbasis tanggal **TTF**, bukan `due_date`; itu Tahap 2.

⚠️ **TODO Tahap 3 (keputusan Den D-15):** sesudah butir (b), `due_date` dihitung di **dua** tempat (`create_invoice_for_sp` saat terbit, `submit_invoice` saat submit). Sengaja dibiarkan — rantai terminnya sama sehingga nilainya identik (idempoten). Dirapikan saat `submit_invoice` ditulis ulang. Sampai itu, **mengubah rantai termin berarti menyentuh kedua fungsi.**

⭐ **Butir (f) melakukan dua hal, dan yang kedua tidak langsung kelihatan.** Overload `mark_delivery_delivered(uuid)` sebenarnya sudah **tidak bisa dipanggil**: versi 2-argumen ber-`p_signed_date DEFAULT NULL`, jadi setiap panggilan 1-argumen cocok untuk **kedua** kandidat dan Postgres menolak dengan `42725 function ... is not unique` — dibuktikan di produksi lewat `EXPLAIN` (read-only, nol baris tersentuh). Jadi DROP ini **memperbaiki pesan gagalnya** (sesudahnya panggilan 1-argumen sah, jatuh ke versi 2-argumen, lalu ditolak guard "signed_date wajib" — pesan bisnis, bukan error resolusi fungsi) **dan** menutup lubang `PUBLIC EXECUTE` pada satu-satunya jalur yang bisa menandai SJ terkirim tanpa tanggal. Itu isi **TD-263**, dan butir ini menutupnya. Nol pemanggil 1-argumen di mana pun (FE punya satu titik panggil dan selalu mengirim dua argumen; nol fungsi/trigger DB di staging maupun produksi).

⚠️ **Cadangan rollback WAJIB diambil ulang pada hari launching** sebelum butir 9 dijalankan. Cadangan 25 Sep 2026 ada (5 fungsi, md5 dicocokkan ke produksi), tapi ia memotret produksi pada tanggal itu. Cocokkan md5-nya ke produksi lebih dulu; kalau berbeda, produksi sudah bergerak dan cadangannya basi.

⚠️ **Saat rollback butir 9:** `create_invoice_for_sp` di cadangan adalah versi **produksi**, yaitu **tanpa** guard butir 6. Kalau butir 6 sudah jalan, memulihkan dari cadangan akan **menghapus guard itu**. Yang benar: pulihkan dari cadangan lalu jalankan ulang butir 6 bagian 1 dan 3.

---

## 10. ⛔ `20260925000003_staging_only_notify_sp_milestone_noop` — ARAH TERBALIK, **JANGAN NAIK KE PRODUKSI**

| | |
|---|---|
| Berkas | `supabase/migrations/20260925000003_staging_only_notify_sp_milestone_noop.sql` (221 baris, ASCII murni) |
| Staging | ✔ **dipasang manual 25 Sep 2026**; berkas ini rekaman retroaktifnya, dijalankan ulang 25 Sep dan hasilnya **byte-identik** (md5 `1fc558be2e4a29800ca8c2f4da3da998`, 465 karakter) |
| Production | — **tidak pernah, dan tidak boleh** |
| Tindakan saat launching | ⛔ **lewati.** Ia bukan bagian antrean produksi |

**Apa isinya.** `notify_sp_milestone` di staging dijadikan **no-op**: ia hanya `RAISE NOTICE`, tidak memanggil apa pun ke luar.

**Kenapa.** Badan **produksi** fungsi itu memanggil Edge Function **produksi** lewat URL yang **di-hardcode di dalam badan fungsi** (`net.http_post` ke `.../functions/v1/notify-sp-milestone`; tokennya sudah diambil dari vault, URL-nya tidak — **TD-274**). Selama staging membawa badan produksi, **setiap perubahan status SP di staging menyuruh PRODUKSI mengirim notifikasi.** Itu bukan risiko teoretis: satu run seed UAT memanggil `sp_recompute_status` ratusan kali.

**Kenapa dicatat di sini walau tidak akan pernah dijalankan ke produksi.** Perubahannya dilakukan **manual, di luar berkas migrasi mana pun**, jadi nol jejak di git — kelas yang sama dengan butir 3. Bedanya: butir 3 **harus diulang di produksi**, butir ini **harus tidak pernah**. Dua-duanya berbahaya kalau tidak tertulis, dengan cara yang berlawanan.

**Kapan berkas ini dipakai.** Setiap kali staging di-refresh/di-restore dari produksi dan membawa badan produksi lagi. Gejalanya sudah ada alat pendeteksinya: seluruh skrip `scripts/seed/uat/` **menolak jalan** kalau badan fungsi ini memuat `net.http` atau ref produksi (uji V10 di `06-verify.sql`). ⛔ Kalau seed tiba-tiba menolak jalan sesudah staging di-refresh, jawabannya **jalankan berkas ini**, bukan melemahkan palangnya.

**Palangnya rem tangan, bukan deteksi lingkungan — dan itu disengaja.** Tidak ada cara andal mendeteksi "ini produksi" dari dalam SQL: staging yang baru di-restore dari produksi berisi data yang sama persis, sehingga penanda berbasis data akan menolak tepat pada saat berkas ini paling dibutuhkan. Maka operator harus menyatakan niatnya di sesi yang sama:

```
SET nexus.izin_staging_only = 'ya-ini-staging';
```

Tanpa baris itu berkas ini berhenti dan tidak mengubah apa pun — diuji 25 Sep 2026: dijalankan tanpa `SET`, ditolak `P0001`; dijalankan dengan `SET`, lolos dan V1 hijau. Palang kedua menolak kalau tanda tangan fungsinya berubah, supaya `CREATE OR REPLACE` tidak diam-diam melahirkan **overload baru** yang hidup berdampingan dengan badan produksi (kelas gotcha #37/#39).

**Rollback.** "Rollback" di sini berarti mengembalikan badan produksi ke staging, dan itu hampir selalu salah. Badan produksi **sengaja tidak disalin** ke dalam berkas migrasi ini — menaruhnya di sana membuatnya mudah ter-copy-paste ke staging, persis hal yang berkas ini cegah. Sumbernya hidup di produksi (`pg_proc.prosrc`) dan hanya di sana ia perlu ada.

---

## 11. ⛔ `20260927000001_invoice_due_date_backfill` — WAJIB (AR Tahap 2)

| | |
|---|---|
| Berkas | `supabase/migrations/20260927000001_invoice_due_date_backfill.sql` (208 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — menyentuh **0 baris** di sana (seluruh invoice seed sudah ber-`due_date` karena diterbitkan jalur AR Tahap 1). Yang MENGUJI isinya = fixture: 21 invoice seed di-NULL-kan lalu di-backfill → **21/21 hasilnya IDENTIK** dengan nilai yang dihitung `create_invoice_for_sp` saat terbit |
| Production | ⛔ **belum** — di sanalah pekerjaan sesungguhnya: **508** invoice non-void ber-`due_date` NULL |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

**Apa isinya.** Mengisi `due_date` invoice **non-void** yang NULL, memakai rantai termin tiga tingkat yang **sama persis** dengan `create_invoice_for_sp`: override akun → `entity_finance_settings` → `default_payment_terms` → cadangan 30.

**Invoice VOID sengaja TIDAK diisi** (keputusan Den K-3): `due_date` pada invoice yang dibatalkan tidak punya arti. Di produksi itu **30 baris** yang akan tetap NULL, dan itu benar — jangan "dirapikan" belakangan.

**Cadangan dibuat SEBELUM UPDATE**, di tabel `sp_invoices_due_date_backfill_20260927`, lengkap dengan `term_days` dan `sumber_term` per baris. UPDATE-nya membaca angkanya **dari tabel cadangan itu**, bukan menghitung ulang — dengan begitu yang tersimpan sebagai jejak dan yang mendarat di `sp_invoices` dijamin sama.

⚠️ **Yang teruji di produksi hanya TINGKAT 1 rantai termin.** 538 dari 538 invoice NULL di sana terjawab oleh `accounts.invoice_payment_terms_days` (satu customer, Indomarco). Tingkat 2 dan 3 hanya tersentuh di staging (tiga customer ber-NULL → cadangan 30). Jangan baca "backfill lolos di produksi" sebagai "rantai terminnya teruji".

⚠️ Bentuk rantainya di sini `COALESCE` berantai, bukan IF/ELSE seperti di PL/pgSQL — ekuivalen untuk keempat kasus, KECUALI kalau satu company punya lebih dari satu baris `entity_finance_settings` (subquery skalar akan gagal). V0 memeriksanya lebih dulu.

**Rollback.** Ada di ekor berkasnya, dan syaratnya disengaja: ia hanya mengembalikan baris yang `due_date`-nya **masih sama** dengan yang ditulis backfill. Kalau seseorang sudah mengoreksi sebuah invoice sesudahnya, rollback tidak menimpanya.

---

## 12. ⛔ `20260927000002_account_role_mapping` — WAJIB, SEBELUM butir 13

| | |
|---|---|
| Berkas | `supabase/migrations/20260927000002_account_role_mapping.sql` (290 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — 6 baris pemetaan untuk entitas **SOA**; V1 (bukti identitas) **0 selisih** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, SEBELUM butir 13** |

**Apa isinya.** Tabel `account_role_mappings` (per entitas: peran akun → `account_id`) + helper `get_mapped_account(uuid, text)`. **Aditif sepenuhnya:** nol fungsi jurnal disentuh, jadi menjalankan butir ini saja **tidak mengubah satu pun jurnal**.

**Enam peran:** `piutang_usaha` · `ppn_keluaran` · `pendapatan_barang` · `pendapatan_jasa_kirim` · `kas_bank` · `pph23_dibayar_dimuka`. Seed-nya diambil dari kode yang dipakai hari ini (`1-1200`, `2-1200`, `4-1000`, `4-1100`, `1-1101`, `1-1300`).

**Kenapa ada.** Draft CoA baru Finance mengubah **arti** kode yang sama (mis. `1-1200` jadi Bank Rupiah). Begitu CoA itu naik, fungsi jurnal yang mencari akun lewat kode akan tetap berjalan **tanpa error** dan menjurnal ke akun yang SALAH — kegagalan yang tidak berbunyi, cuma menghasilkan pembukuan yang rapi dan keliru.

⭐ **V1-nya bukan hitungan baris, melainkan BUKTI IDENTITAS:** untuk setiap baris pemetaan, `get_mapped_account()` harus mengembalikan akun yang **sama** dengan lookup kode lama. Kalau ada selisih, migrasi berhenti dan butir 13 **tidak boleh** dijalankan — karena bukti itulah yang membuat "jurnalnya identik" jadi klaim terukur, bukan harapan.

⚠️ Di produksi hari ini **hanya SOA punya `chart_of_accounts`**, jadi seed-nya 6 baris dan entitas lain akan kosong. Itu BENAR — mereka belum punya CoA sama sekali, bukan "lupa dipetakan".

**Rollback.** `DROP FUNCTION get_mapped_account` + `DROP TABLE account_role_mappings` — tapi **hanya** kalau butir 13 belum jalan atau sudah dibalik. Urutan membalikkan: 13 dulu, baru 12.

---

## 13. ⛔ `20260927000003_journal_account_roles_and_readiness` — WAJIB, sesudah butir 9 DAN 12

| | |
|---|---|
| Berkas | `supabase/migrations/20260927000003_journal_account_roles_and_readiness.sql` (660 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026**; V1 hijau; proyeksi jurnal **identik sebelum vs sesudah** (104 baris, 0 selisih dua arah) |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** sesudah butir 9 dan butir 12 |

**DUA perubahan, satu berkas** — karena keduanya menulis ulang fungsi yang sama, dan memecahnya berarti `create_invoice_for_sp` ditranskripsi dua kali berturut-turut:

**(A) Jurnal berhenti mencari akun lewat kode.** Enam lookup `chart_of_accounts WHERE code = '...'` di `create_invoice_for_sp` dan `record_payment` diganti `get_mapped_account()`.

**(B) Alasan "belum bisa ditagih" punya SATU implementasi.** Fungsi baru `sp_invoice_readiness(uuid)` memegang aturannya, dan `create_invoice_for_sp` **memanggilnya** — bukan menyalinnya. Halaman Siap Ditagih memakai fungsi yang sama lewat `sp_invoice_readiness_all(uuid)`, jadi alasan yang ditampilkan FE tidak bisa menyimpang dari guard yang menolak.

⭐ **Palangnya menjaga URUTAN, bukan cuma prasyarat.** Ia menolak jalan kalau `create_invoice_for_sp` yang hidup **belum versi AR Tahap 1** (penanda: pesan invariant piutang). Tanpa palang itu, menjalankan butir ini di produksi hari ini akan diam-diam **memasang guard Tahap 1** — BTB wajib, SJ harus `delivered`, invariant piutang — padahal butir 6-9 belum dijalankan dan radius dampaknya belum diumumkan ke gudang.

**Urutan guard DIPERTAHANKAN PERSIS** (keputusan Den K-2): invoice aktif → terkirim penuh → BTB → SJ belum selesai → SJ tanpa tanggal tanda tangan. Teks pesannya disalin verbatim; yang berpindah hanya **tempat teks itu dirakit**.

⭐ **Terbukti setara, bukan diasumsikan:** untuk **40 SP seed**, `sp_invoice_readiness` dibandingkan dengan hasil `create_invoice_for_sp` yang sungguh dijalankan lalu dibatalkan — **40/40 cocok**, dan untuk 33 yang ditolak pesannya **sama karakter per karakter**. Kelima kode alasan terbukti (dua di antaranya lewat fixture yang dibatalkan).

⚠️ `sp_invoice_readiness` **SECURITY DEFINER**, `sp_invoice_readiness_all` **SECURITY INVOKER** — perbedaannya disengaja: *SP mana yang boleh dilihat* = urusan RLS; *kenapa sebuah SP tertahan* = urusan guard. Kalau readiness dibuat INVOKER, FE bisa melewatkan Surat Jalan yang RLS sembunyikan lalu melaporkan "siap" untuk SP yang sebenarnya ditolak — persis divergensi yang fungsi ini ada untuk mencegahnya.

**Rollback.** Pulihkan badan `create_invoice_for_sp` + `record_payment` dari cadangan yang diambil **sebelum** butir ini jalan, dan pakai cadangan yang cocok dengan LINGKUNGANNYA — staging dan produksi BERBEDA (Tahap 1 sudah jalan di staging, belum di produksi). ⛔ Memakai cadangan produksi untuk memulihkan staging akan mencabut guard Tahap 1 tanpa ada yang memberi tahu. Rollback FE-nya sekalian: readiness yang hidup tanpa `create_invoice_for_sp` yang memanggilnya bisa menyimpang.

---

## 14. ⛔ Grant menu `fin_invoice` (`20260927000004`) — WAJIB (AR Tahap 2)

| | |
|---|---|
| Berkas | `supabase/migrations/20260927000004_menu_grant_fin_invoice.sql` (157 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — 3 baris: `finance`, `finance_controller`, `ceo` (aksi `view`) |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** — tanpa ini halaman Invoice Management hanya terlihat `super_admin` |

**100% DATA.** Nol DDL, nol policy, nol RPC, nol baris dihapus. Idempoten.

**Tidak ada key menu baru.** `fin_invoice` ("Billing / Invoice", modul `finance`) sudah ada di katalog; sebelum ini ia punya **nol grant role** karena id menu `billing` terparkir di `PLANNED_MENU_IDS` dan tidak dipasang di tab mana pun. AR Tahap 2 memasangnya di tab **6.2.1**, jadi gate-nya cuma soal grant.

⚠️ **IZIN MENU BUKAN IZIN AKSI.** Role `finance` akan MELIHAT halaman ini, tapi DB tetap menolaknya menerbitkan invoice, submit, dan mencatat pembayaran. Itu DISENGAJA (keputusan Den K-6): FE menampilkan tombolnya **nonaktif beserta alasannya**, bukan menyembunyikannya — supaya orang tahu jalurnya ada dan siapa yang bisa memakainya. Terbukti runtime di staging: `zzztest.finance` ditolak peran untuk terbit DAN bayar, `zzztest.controller` diterima keduanya, dan tebakan FE cocok dengan hasil DB **8 dari 8**.

⚠️ **Tidak menggeser baseline sweep QA.** Kelima akun sweep memegang `bd_sales_executive` / `operations` / `hcga_personel` / `proc_staff` / `viewer` — diukur 25 Sep 2026, nol di antaranya `finance`, `finance_controller`, atau `ceo`.

⚠️ **Berkas `20260924000001` ikut disunting** (keputusan Den K-8): key `skel_6_2_1` dicabut dari seed katalog, karena tab 6.2.1 berhenti jadi placeholder. Angka di dalamnya turun **157 → 156**. Migrasi itu sendiri masih **belum dijalankan di mana pun**.

**Rollback.** DELETE ber-batas: hanya aksi `view` dan ketiga role itu. Menghapus SEMUA grant `fin_invoice` akan ikut mencabut grant per-user yang mungkin sudah diberikan lewat Admin Settings.

---

## 15. Parity staging — ARAH TERBALIK, produksi TIDAK disentuh

| | |
|---|---|
| Berkas | `20260902000006_td180_sp_btb_dc_master` + `20260910000001_finance_read_access` (keduanya sudah di repo) |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ✔ **sudah sejak 2 dan 10-11 Sep 2026** — tidak ada yang perlu dijalankan |
| Tindakan saat launching | **nol** |

**Apa yang terjadi.** Uji manual AR Tahap 2 di Preview menampilkan **Siap Ditagih 0 dan Tertahan 0** untuk `zzztest.controller` dan `zzztest.finance`, padahal staging punya 40 SP seed. Akarnya: **LIMA policy di staging masih home-company-only** sementara produksi sudah punya varian jamak — `sp_order_items_read`, `sp_invoices_read`, `sp_invoice_lines_read`, `sp_btb_read`, `dc_master_read`.

Seluruh data seed milik **SOA**, home kedua akun finance **MSI**. `sp_orders_read` sudah jamak (itu sebabnya 40 SP tetap terlihat dan halamannya tampak hidup), tapi `sp_invoice_readiness_all` menghitung kandidat dari `SUM(sp_order_items.qty) > 0` → nol baris → nol kandidat. **Gagalnya senyap: nol baris, bukan error.**

⭐ **Perbaikannya BUKAN keputusan RLS baru.** Produksi sudah benar, jadi yang dijalankan adalah dua migrasi yang **sudah ada di repo dan sudah LIVE di produksi**. Blast radius di produksi: **NOL**.

⚠️ `20260910000001` tampaknya dulu dijalankan **separuh** di staging: FIX 1 (`prospects_read` + cabang finance) sudah ada, FIX 2a/2b/2c (tiga policy jamak) tidak. Karena itu ia dijalankan **utuh** — ALTER POLICY idempoten.

**Perbaikan data yang menyertainya (bukan migrasi):** `zzztest.controller.profiles.company_id` MSI → **SOA**. Akun itu hanya ber-role `finance_controller@SOA`, jadi home MSI membuat `activeCompanyId` default ke entitas tempat ia tak punya role — label topbar berbunyi "Tanpa role di entitas ini" padahal CompanySwitcher menampilkan nama SOA. Populasi keadaan itu di **produksi = NOL** (23 profil aktif, semuanya punya role di home-nya), jadi ini fixture yang tidak representatif, bukan bug pengguna. Perbaikan kodenya → **TD-278**.

⭐ **Dan inilah yang paling penting dari butir ini: sisa drift-nya JAUH lebih banyak.** Alat baru `scripts/qa/env-drift-check.mjs` membandingkan staging vs produksi dan menemukan **23 perbedaan yang tidak punya penjelasan** — 8 fungsi hanya ada di produksi, 5 fungsi beda isi, 8 policy, 1 trigger, dan tabel `sp_orders` yang di staging **kurang enam kolom** (`inv`, `fp`, `submit`, `kirim`, `submit_date`, `email_status`). Rincian + rencana → **TD-279**. Butir 15 ini hanya menutup lima policy yang memblokir UAT AR Tahap 2; sisanya pekerjaan tersendiri.

---

## RUTINITAS SEBELUM UAT — `env-drift-check` (Tahap 3 TD-279, berlaku 28 Sep 2026)

⛔ **WAJIB: jalankan `node scripts/qa/env-drift-check.mjs` SEBELUM setiap putaran UAT di staging, DAN sebelum hari launching (`develop` → `main`).** Ia membandingkan staging dengan produksi untuk **fungsi, policy, trigger, kolom, dan HAK** (`relacl`/`attacl`/`proacl`), lalu memilah hasilnya jadi tiga:

| kelas | artinya | tindakan |
|---|---|---|
| **ANTRE** | memang berbeda karena menunggu naik ke produksi; nomor butir dokumen ini ikut dicetak | nol — ini yang dijaga dokumen ini |
| **SELAMANYA** | sengaja berbeda selamanya (mis. `notify_sp_milestone` no-op staging, butir 10) | nol |
| **DRIFT** | **tidak ada penjelasannya** | ⛔ berhenti, selidiki sebelum UAT |

**Kenapa ini rutinitas, bukan pemeriksaan sesekali.** Butir 15 lahir dari UAT yang menampilkan **Siap Ditagih 0 / Tertahan 0** — bukan error, bukan layar putih, hanya angka nol yang tampak masuk akal. Akarnya lima policy staging yang tertinggal. *Drift skema gagal SENYAP: nol baris, bukan exception.* UAT yang berjalan di atas staging yang berbeda dari produksi menguji aplikasi yang tidak akan pernah dipakai siapa pun.

**Angkanya dibaca dari baris ringkasan**, bukan dari `grep '[DRIFT]'` — dengan `--hak-detail` tiap perbedaan hak tercetak dua kali dan grep polos menghitungnya dobel (61 pernah terbaca 100).

**Riwayat TD-279, supaya angkanya punya arti:** 61 DRIFT (27 Sep) → 56 → **16** (Kelompok A) → **11** (Kelompok B) → **0** (Kelompok C, 28 Sep). Sesudah itu laporan yang sehat berbunyi **0 DRIFT** dengan ANTRE + SELAMANYA saja.

✅ **Pengukuran terakhir 28 Sep 2026, sesudah butir 27-31 seluruhnya LIVE di kedua lingkungan: `59 ANTRE, 7 SELAMANYA, 0 DRIFT`** (`scripts/qa/out/drift-20260928-143832/drift.txt`). ⭐ Nol drift itu **bukan berarti butir 30 ikut terbukti**: `env-drift-check` membandingkan `relacl`/`attacl`/`proacl` dan **tidak menyentuh `pg_default_acl`**, jadi H2 tak akan pernah muncul di laporannya — yang membuktikannya keluaran runner-nya sendiri. Yang **memang** terbukti di sini: `proconfig` kedelapan fungsi H3 kini **sama di kedua sisi**, sehingga penguncian itu tidak melahirkan drift.

⚠️ **Arah default: staging mengikuti produksi.** Satu-satunya pengecualian kelas ANTRE. Kalau suatu hari DRIFT muncul lagi, jangan "perbaiki" dengan mengubah produksi.

**Empat pelajaran 28 Sep 2026 yang mengikat cara menyamakan lingkungan:**

1. **Samakan ke teks PRODUKSI, bukan ke berkas repo.** Berkas migrasi tidak selalu mencerminkan produksi — diukur, bukan dikira (**TD-282**): enam RPC Storbit berbeda badannya, dua di antaranya nol berkas. Menjalankan berkas repo bisa menyamakan staging ke sesuatu yang bukan produksi, lalu melaporkannya sebagai parity.
2. **Keluaran deparse alat BACA, bukan sumber SALIN.** `pg_policies.qual` adalah pencetakan ekspresi; memberikannya kembali ke `ALTER POLICY` menghasilkan bentuk berbeda lagi. Cari migrasi asalnya.
3. **Blok verifikasi wajib memakai sidik jari yang sama dengan alat ukurnya.** Verifikasi yang lebih longgar dari alat pemeriksanya adalah jaminan palsu — dan angka harapannya wajib **diukur**, bukan dihitung (`prosecdef::text` = `true`, bukan `t`).
4. **Hak tabel/kolom/fungsi ikut dibandingkan** (`relacl`/`attacl`/`proacl`). `proacl` **NULL = PUBLIC EXECUTE**, bukan "tanpa hak".

⛔ **WAJIB juga sebelum HARI LAUNCHING (`develop` → `main`), bukan cuma sebelum UAT.** Dokumen ini mendaftar apa yang harus dinaikkan; `env-drift-check` yang membuktikan tidak ada yang lain ikut berbeda diam-diam.

⚠️ **Alatnya butuh `STG_DB_URL` + `PRD_DB_URL` (Session pooler), dan ke produksi ia SELECT saja.** Satu koneksi per DB. Palang ref dua arah aktif: URL yang tertukar ditolak sebelum satu byte dikirim.

---

## Invoice lengkap (butir 16-25) — satu gelombang, urutan MENGIKAT

Sepuluh berkas `20260928*` lahir dari satu keputusan: **seluruh kolom form invoice Odoo ditambahkan sekarang**, sekaligus menanam seam untuk invoice MSI (forwarding) yang belum punya SP. Arsitekturnya **opsi C — generalisasi di tempat**: tabelnya tetap `sp_invoices`/`sp_invoice_lines`, yang ditambahkan adalah `source_type`, `sp_order_id` yang boleh NULL dengan CHECK per sumber, uang yang turun ke baris, dan penerbit per sumber di atas satu pemosting jurnal bersama. **Rename fisik sengaja ditunda** — butir 6-14 dokumen ini diuji terhadap nama yang sekarang dan belum satu pun naik ke produksi.

**Urutan produksi (mengikat):**

```
16 -> 17 -> 18 -> 19        (berkas 1-4, berurutan)
17 -> 21 -> 25              (tautan pajak, sesudah baris punya kolomnya)
16 -> 22 -> 26              (RPC pasca-terbit, lalu daftar kode Coretax)
23, 24                      (mandiri, boleh kapan saja sesudah 16)
20                          JANGAN — staging saja
```

⛔ **Butir 18 juga menuntut butir 9 (`ar_single_issue_path`) sudah jalan**, karena ia menulis ulang `create_invoice_for_sp` di atas bentuk yang dibuat butir 9. Menjalankan 18 di produksi yang belum punya butir 9 akan menimpa jalur penerbitan dengan versi yang mengandaikan guard yang belum ada.

⚠️ **Seluruh sepuluh berkas dijalankan di STAGING 25 Sep 2026. Produksi belum satu pun.** Angka di bawah diukur di staging kecuali disebutkan lain.

---

## 16. ⛔ `20260928000001_invoice_header_v2` — WAJIB (invoice lengkap, PERTAMA)

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000001_invoice_header_v2.sql` (416 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — V1a-V1e lolos |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, PALING DULU di gelombang ini** |

**Apa isinya.** 20 kolom kepala (`customer_tax_id`, `payment_term_days/label`, `salesperson_id`, `sales_team`, `is_reimbursement`, `print_to`, `replaces_invoice_id`, `printed_*`, `emailed_*`, `coretax_tx_code`, `use_dpp_nilai_lain`, `rounding_method`, `currency_code`, `fx_rate`, `total_amount_currency`), kolom `source_type`, `sp_order_id` jadi nullable dengan CHECK per sumber, dan **tiga CHECK "terkunci"** yang namanya menyebut apa yang membukanya: `..._dpp_nilai_lain_terkunci`, `..._rounding_terkunci`, `..._fx_terkunci`.

⭐ **Kolom angka yang tampil tapi tidak ikut jurnal DILARANG.** Itu aturan Den, dan CHECK terkunci adalah bentuk penegakannya: mata uang, pembulatan, dan DPP Nilai Lain ADA sebagai kolom (supaya form Odoo bisa dipetakan satu-satu) tapi **tidak bisa diisi nilai lain** sampai kebijakannya ada. Kolom yang bisa diisi tapi diabaikan jurnal adalah angka yang berbohong.

⚠️ **`REVOKE UPDATE (faktur_no) FROM authenticated`** ikut di berkas ini — sejak butir 22, satu-satunya jalur mengisinya adalah `set_invoice_tax_info`.

⭐ **Pelajaran urutan yang dibayar mahal:** versi pertama menambahkan CHECK `total_amount_currency` **sebelum** backfill-nya, dan seluruh transaksi gagal 23514 lalu rollback penuh. Urutan di berkas yang sekarang **backfill dulu, CONSTRAINT belakangan**, dan alasannya ditulis di dalam berkasnya. Jangan "dirapikan" kembali ke urutan deklaratif.

**Rollback.** `DROP` 20 kolom + 3 constraint + kembalikan `sp_order_id` ke NOT NULL. Hanya aman selama butir 17-25 belum jalan.

---

## 17. ⛔ `20260928000002_invoice_line_v2` — WAJIB, sesudah butir 16

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000002_invoice_line_v2.sql` (378 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — V1a-V1f lolos |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

**Apa isinya.** 15 kolom baris (`line_type`, `product_name`, `sku`, `uom`, `description`, `unit_price`, `line_amount`, `account_id`, `tax_id`, `tax_rate`, `discount_pct`, `analytic_ref`, `analytic_label`, `days`, `position`), `qty` naik dari `integer` ke `numeric(18,4)`, dan **baris ongkos kirim** yang selama ini hanya hidup sebagai angka di kepala.

⭐ **`line_amount` TERPISAH dari `dpp`, dan itu keputusan Den yang menyelamatkan tiga identitas sekaligus.** `dpp` adalah dasar pengenaan pajak BARANG; `ppn` per baris **sudah memuat porsi ongkir baris itu** (rumusnya cocok 23/23 saat diukur). Kalau ongkir diberi `dpp`, PPN-nya terhitung dua kali. Jadi baris ongkir membawa `line_amount` dengan `dpp = 0, ppn = 0`, dan yang berlaku adalah:

```
SUM(dpp)         = total_dpp
SUM(ppn)         = total_ppn
SUM(line_amount) + SUM(ppn) = total_amount
```

⚠️ **Nol angka kepala berubah** — V1 membuktikannya untuk SELURUH invoice hidup, bukan sampel.

⚠️ **Dua CHECK terkunci lagi di sini:** `..._diskon_terkunci` (diskon hidup di harga SP, bukan di invoice) dan `..._tarif_pajak_terkunci`, `..._days_terkunci`, ditambah `..._amount_rumus` dan `..._shipping_bukan_basis_pajak`.

⭐ **Pelajaran SQL:** backfill-nya memakai **subquery skalar berkorelasi**, bukan `UPDATE ... FROM ... JOIN` — bentuk JOIN gagal 42P01 karena merujuk tabel target dari dalam JOIN-nya sendiri. Alasannya ditulis di berkasnya.

**Rollback.** `DROP` 15 kolom + 5 constraint, `qty` kembali `integer`, hapus baris `line_type = 'shipping'`. Hanya aman selama butir 18/21/25 belum jalan.

---

## 18. ⛔ `20260928000003_invoice_issue_v2` — WAJIB, sesudah butir 17 DAN butir 9

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000003_invoice_issue_v2.sql` (611 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — proyeksi jurnal identik dua arah, **0 selisih** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 17 dan butir 9** |

**Apa isinya.** `create_invoice_for_sp` versi 3 (mengisi kolom kepala + baris + baris ongkir), `post_invoice_journal()`, dan — yang paling penting — **`invoice_journal_projection()`**.

⭐ **Bentuk pembuktiannya adalah desain, bukan lampiran.** Seluruh aritmetika jurnal pindah ke SATU fungsi **baca-saja** yang mengembalikan baris jurnal yang *seharusnya*. `post_invoice_journal()` tidak menghitung apa pun; ia hanya **menulis** apa yang diproyeksikan. Karena itu bukti "jurnalnya identik" mengeksekusi **kode yang sama dengan yang menulis**, bukan salinan kedua yang bisa melenceng diam-diam. Blok pembuktiannya berjalan **SEBELUM** pergantian fungsi, di transaksi yang sama: kalau ada selisih, migrasi berhenti dan tidak ada yang tertukar.

⚠️ **Jurnal kini per AKUN BARIS**, bukan satu akun untuk seluruh invoice. Akun diambil lewat `get_mapped_account()` (butir 12) dengan cadangan ke kode lama.

**Rollback.** Kembalikan `create_invoice_for_sp` ke versi butir 9 + `DROP` dua fungsi baru. Berkas 25 bergantung pada versi ini — balikkan 25 dulu.

---

## 19. ⛔ `20260928000004_invoice_write_lockdown` — WAJIB, sesudah butir 18

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000004_invoice_write_lockdown.sql` (164 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — V1a-V1d lolos, termasuk uji sesi user asli |
| Production | ⛔ **belum** — bentuk hak di sana **sudah diukur read-only** dan **identik** dengan staging sebelum pengerasan |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

**Apa yang dicabut.** `INSERT, UPDATE, DELETE ON sp_invoice_lines` dan `INSERT ON sp_invoices`, keduanya dari `authenticated`.

**Kenapa boleh dicabut.** Diukur lebih dulu, per lokasi: **nol penulis langsung** dari FE (`src/`) maupun dari fungsi non-`SECURITY DEFINER`. Seluruh penulisan sudah lewat RPC. Kalau pengukuran itu menemukan penulis, perintahnya adalah **berhenti dan lapor, jangan cabut** — dan itu tidak terjadi.

⚠️ **Satu pengecualian tercatat: `seed_uat_bill`** (staging-only, dijalankan sebagai `postgres`, dihapus `99-purge`, tidak menyentuh `sp_invoice_lines`, dan UPDATE-nya tidak terdampak `REVOKE INSERT`). Pengecualiannya ditulis di komentar berkas migrasi **dan** di `scripts/seed/uat/README.md` — dua tempat, karena yang membaca seed belum tentu membaca migrasi.

⭐ **Koreksi atas rencana yang disetujui, dan ini harus dibaca sebelum menyentuh hak invoice lagi:** rencana semula menulis "kolom baru baca-saja". Itu **SALAH untuk `sp_invoice_lines`**. Diukur dari `pg_class.relacl` dan `pg_attribute.attacl` (bukan `information_schema`, yang memipihkan bentuknya): pada `sp_invoices`, SELECT dan INSERT adalah hak **TABEL** sementara UPDATE **kolom-spesifik**; pada `sp_invoice_lines`, UPDATE juga hak tabel. Artinya kolom baru **tidak bisa** dikecualikan satu-satu — yang bisa dilakukan adalah mencabut haknya sekalian, dan itulah yang dilakukan.

⚠️ **`sp_invoices.UPDATE` SENGAJA tidak dicabut** — tetap kolom-spesifik (9 kolom sesudah `faktur_no` dicabut berkas 1). V1d menegaskan angka 9 itu sebagai **pembanding**, supaya "nol hak tulis" tidak lolos hanya karena semuanya nol.

**Rollback.** `GRANT` kembali persis bentuk yang diukur sebelum pengerasan; bentuk itu tercatat di berkasnya.

---

## 20. ⛔ `20260928000005_staging_only_taxes_from_production` — ARAH TERBALIK, **JANGAN NAIK KE PRODUKSI**

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000005_staging_only_taxes_from_production.sql` (128 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — 21 baris masuk |
| Production | — **TIDAK BOLEH** — di sanalah 21 baris itu berasal |
| Tindakan saat launching | ⛔ **JANGAN dijalankan** |

**Apa isinya.** Menyalin 21 baris master `taxes` produksi (7 kode x 3 entitas, **id identik**, termasuk 6 baris yang sudah `deleted_at`) ke staging, yang punya **nol** baris. Tanpa ini, `sp_invoice_lines.tax_id` di staging tidak punya apa pun untuk ditunjuk dan butir 21 mendarat kosong.

**Di produksi hanya dilakukan SELECT** (disetujui Den), dan **isi master tidak diubah**.

⛔ **Guard-nya berbentuk DATA, bukan nama environment:** berkas menolak jalan kalau `taxes` sudah berisi baris. Di produksi ia akan berhenti sendiri — tapi jangan bersandar pada itu; ia tercatat di sini justru supaya tidak dijalankan.

---

## 21. ⛔ `20260928000006_invoice_line_tax_link` — WAJIB, sesudah butir 17

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000006_invoice_line_tax_link.sql` (135 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

**Apa isinya.** Mengisi `sp_invoice_lines.tax_id` untuk baris yang sudah ada. **Aman untuk produksi** (beda dari butir 20): produksi sudah punya master `taxes` sejak Mei/Juni 2026.

⭐ **Penautannya lewat KODE + TARIF, bukan lewat id.** Pencarian memakai `(company_id, code = 'VAT_FULL', deleted_at IS NULL)` **dan memeriksa** bahwa tarif baris master itu benar-benar sama dengan tarif yang tersimpan di barisnya. Menyalin id antar-lingkungan akan bekerja hari ini dan patah diam-diam begitu master dibuat ulang.

⚠️ **`tax_id` MURNI RUJUKAN NAMA.** Yang menghitung tetap `tax_rate` dan `ppn`. Nol total bergerak.

⚠️ **Ini backfill — ia berjalan SEKALI.** Jalur yang mengisinya saat terbit ada di butir 25, dan tanpa butir 25 setiap invoice baru lahir dengan tautan kosong.

---

## 22. ⛔ `20260928000007_invoice_post_issue_rpcs` — WAJIB, sesudah butir 16

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000007_invoice_post_issue_rpcs.sql` (336 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — V1 tiap RPC lolos, termasuk uji ACL grantee kosong |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

**Apa isinya.** `invoice_dapat_dibaca()` + empat RPC kelas (c): `set_invoice_tax_info`, `mark_invoice_printed`, `mark_invoice_emailed`, `link_replacement_invoice`. Semuanya `SECURITY DEFINER` + `REVOKE ALL FROM PUBLIC` + menulis `audit_logs`.

**Izin (koreksi Den yang sudah diterapkan):** `set_invoice_tax_info` boleh **`finance`**, `finance_controller`, `super_admin`. **Isi sekali**; mengubah nilai yang sudah terisi **hanya `super_admin`**. `mark_invoice_printed`/`mark_invoice_emailed` boleh **siapa pun yang boleh membaca** invoice itu.

⭐ **"Isi sekali" ditegakkan DUA KALI** — di `IF` dan **diulang di `WHERE` UPDATE-nya** — supaya dua panggilan berbarengan tidak sama-sama lolos. Pola yang sama dengan `set_delivery_signed_date`.

⚠️ **`invoice_dapat_dibaca()` menduplikasi syarat `sp_invoices_read`, dan itu disengaja** (RLS tidak berlaku di dalam `SECURITY DEFINER`). **Kelas checklist TD-233:** kalau `sp_invoices_read` berubah, fungsi ini **wajib ikut**. Yang menjaganya bukan ingatan: `scripts/qa/ar-role-visibility-check.sql` Bagian 3 mengasersi, **per akun uji**, bahwa jumlah invoice yang lolos `invoice_dapat_dibaca()` **SAMA** dengan jumlah yang terlihat lewat RLS di sesi user asli.

⚠️ **Uji ACL grantee kosong wajib** untuk tiap RPC: `proacl IS NULL` **atau** ada entri berawalan `'='` sama-sama berarti PUBLIC EXECUTE (gotcha #40).

---

## 23. ⛔ `20260928000008_invoice_attachments` — WAJIB (ada bucket Storage)

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000008_invoice_attachments.sql` (279 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** — dan **periksa bucket-nya benar-benar terbuat** |

**Apa isinya.** Bucket **PRIVAT** `invoice-docs` (10 MB, 6 tipe MIME), 3 policy `storage.objects`, tabel `invoice_attachments` + RLS, dan dua RPC (`add_invoice_attachment` / `delete_invoice_attachment`, batas **10 lampiran** per invoice).

⭐ **Dua lapis penjagaan, dan keduanya perlu:** policy `storage.objects` menjaga **byte**-nya, RLS `invoice_attachments` menjaga **daftar**-nya. Satu lapis saja meninggalkan salah satu bocor.

⛔ **Bucket PRIVAT, bukan menumpang `assets`/`avatars`** — keduanya publik. Faktur pajak dan bukti potong tidak boleh punya URL yang bisa ditebak; FE membukanya lewat URL bertanda tangan yang dibuat saat diklik dan **tidak disimpan**.

⚠️ **Kontrak path `<company_id>/<invoice_id>/<uuid>.<ext>`** ditegakkan RPC-nya, dan **segmen pertama** itulah yang dibaca policy Storage. Mengubah bentuk path berarti mengubah policy-nya juga.

**Izin unggah (koreksi Den):** `finance`, `finance_controller`, manager ke atas, `super_admin`. **Hapus** = pengunggahnya sendiri atau `super_admin`, dan **soft delete**.

---

## 24. ⛔ `20260928000009_invoice_notes` — WAJIB (mandiri)

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000009_invoice_notes.sql` (167 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

**Apa isinya.** Tabel `invoice_notes` **append-only** + `add_invoice_note`, tampil digabung ke Riwayat invoice.

**Siapa boleh menulis: siapa pun yang boleh MEMBACA invoice itu** — termasuk `finance` polos yang tidak boleh menerbitkan maupun mencatat pembayaran. Gerbangnya **READ, bukan peran**, dan itu disengaja: menutup catatan dari orang yang mengerjakan dokumennya membuat fitur ini mati sebelum dipakai.

⛔ **Tidak ada jalur sunting**, dan itu bukan kelalaian: jejak yang bisa ditulis ulang bukan jejak. Salah tulis → tulis catatan baru. Hapus = soft delete, dan barisnya tetap tampil sebagai "Catatan dihapus."

⚠️ `created_by` **tanpa FK ke `profiles`** (pola yang sama dengan `signed_date_filled_by`), jadi nama penulisnya diambil FE dalam dua langkah, bukan lewat embed PostgREST.

---

## 25. ⛔ `20260928000010_invoice_issue_tax_link` — WAJIB, sesudah butir 18 dan 21

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000010_invoice_issue_tax_link.sql` (243 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — dibuktikan **saat terbit** lewat dua uji RPC yang di-rollback, salah satunya SP berongkir |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** |

⚠️ **Berkas ini lahir SESUDAH kesepuluh butir direncanakan** — Den memerintahkan "butir 16 sampai 24" ketika berkasnya baru sembilan. Ia ditambahkan karena gerbang (d) menemukan cacat, bukan karena rencananya berubah.

⭐ **Cacat yang ditemukan dengan MENJALANKAN, bukan membaca.** Butir 21 adalah backfill: ia berjalan sekali. `create_invoice_for_sp` versi butir 18 mengisi `tax_rate` tapi **tidak** `tax_id`, jadi setiap invoice yang terbit sesudah backfill lahir dengan tautan pajak kosong. Tidak terlihat sampai seed UAT dijalankan ulang penuh: purge menghapus 25 baris hasil backfill, seed menerbitkan 22 invoice baru lewat RPC, dan **V12h berbunyi 25 baris tanpa `tax_id`**.

⭐ **Kelas kegagalan yang sama persis dengan `delivery_note_items.sp_order_item_id` (25 Sep 2026):** kolom yang TAMPAK terisi karena pernah di-backfill, padahal jalur yang mengisinya tidak ada. *Kolom yang penuh karena backfill bukan kolom yang terisi.*

⛔ **Butir 18 SENGAJA TIDAK DISUNTING.** Ia sudah tercatat dijalankan di staging; mengubah isinya membuat berkas di repo berhenti menggambarkan apa yang benar-benar jalan. Perbaikan punya nomornya sendiri.

**Isinya.** `create_invoice_for_sp` mengisi `tax_id` saat terbit + UPDATE susulan yang **idempoten** untuk baris yang terlanjur lahir kosong. Pencariannya sama dengan butir 21 (kode + tarif). **Nol total bergerak**, dan V1 membuktikannya.

---

## 26. ⛔ `20260928000011_invoice_coretax_code_whitelist` — WAJIB, sesudah butir 22

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000011_invoice_coretax_code_whitelist.sql` (~200 baris) |
| Staging | ✔ **dijalankan 25 Sep 2026** — V1 lolos, V2 mencetak keadaan data lama |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 22** |

**Apa isinya.** Satu `CREATE OR REPLACE set_invoice_tax_info` yang menolak kode transaksi Coretax di luar daftar **01..10**. Nol kolom, nol tabel, nol izin berubah; badannya disalin dari butir 22 dan **hanya** ditambahi satu blok validasi.

**Kenapa ada.** Sampai berkas 10, kode Coretax adalah **isian bebas** — salah ketik masuk tanpa perlawanan dan baru ketahuan saat rekonsiliasi Faktur Pajak. FE kini memakai dropdown, tapi **dropdown adalah kenyamanan, bukan penjagaan**: RPC-nya bisa dipanggil langsung.

⭐ **Yang diperiksa HANYA kodenya, bukan kalimat keterangannya** (bentuk `'[NN] ...'`, NN salah satu dari 01..10). Itu keputusan sadar: keterangan tiap kode **masih menunggu konfirmasi Finance** (`09_ROADMAP.md` §Pertanyaan untuk Finance butir 3b), dan memvalidasi kalimat berarti setiap koreksi kata dari Finance akan menolak nilai yang sudah tersimpan. Yang mengikat secara pajak adalah kodenya.

⚠️ **`substring` dipakai, BUKAN `LIKE '[0-9][0-9]%'`** — di SQL kurung siku bukan kelas karakter, jadi pola itu mencari kurung siku harfiah dan **meloloskan `'[99] apa pun'`**. Kegagalannya akan senyap.

⛔ **Kembaran yang wajib bergerak bersama (kelas checklist TD-233):** himpunan kode di RPC ↔ `CORETAX_TX_CODES` di `src/lib/taxConstants.js`. Menambah/menghapus **baris** = sentuh keduanya; mengubah **kalimat** = FE saja.

⚠️ **Tidak retroaktif.** Nilai yang sudah tersimpan tidak divalidasi ulang dan tidak diubah — fungsinya "isi sekali", jadi nilai lama memang tidak lewat sini lagi. **V2 menghitung dan MENCETAK** berapa baris lama yang di luar daftar (sampai 20 contoh): angka > 0 **bukan kegagalan**, itu daftar kerja untuk Finance.

**Rollback.** Jalankan ulang blok `CREATE OR REPLACE set_invoice_tax_info` dari butir 22. Nol data yang perlu dibalik — berkas ini tidak menyentuh satu baris pun.

---

## 27. ✔ `20260928000012_td281_h1_revoke_public_execute` — SELESAI 28 Sep 2026 (⚠️ ARAH TERBALIK: production dulu)

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000012_td281_h1_revoke_public_execute.sql` (306 baris) — lahir di `hotfix/td281-h1`, kini **sudah merge ke `main` DAN `develop`** |
| Staging | ✔ **dijalankan 28 Sep 2026** sebagai **UJI** — uji runtime lewat PostgREST **LOLOS 11/0** |
| Production | ✔ **LIVE 28 Sep 2026** — V-PRA 1-3 LOLOS, ACL sesuai matriks, `md5(prosrc)` identik |
| Tindakan saat launching | **nol** — butir ini sudah menutup sendiri |
| Catatan rollback | `scripts/qa/out/td281-h1-production-20260928-125318/acl-sebelum.txt` (produksi) · `…-staging-20260928-124000/…` (staging) — ⚠️ folder `out/` **ter-gitignore**, jadi berkas ini hidup **di mesin Den saja** |
| Sisa | ⏳ verifikasi **satu notifikasi milestone SP produksi** benar-benar terkirim (menunggu SP berikutnya berubah status) |

⛔ **ARAHNYA TERBALIK dari seluruh butir lain di dokumen ini, dan itu disengaja.** Paparannya **ADA DI PRODUCTION**; staging di sini berperan sebagai **tempat uji**, bukan sebagai gerbang rilis. Membacanya sebagai butir "staging → production" biasa akan membuat orang menunggu hal yang salah.

**Apa yang ditutup.** Enam fungsi `SECURITY DEFINER` ter-`EXECUTE` **PUBLIC** — sebagian lewat `proacl NULL`, yang artinya PUBLIC EXECUTE (gotcha #40). PUBLIC mencakup `anon`, dan **kunci `anon` memang publik: ia ikut ter-bundle ke browser**. Jadi keenamnya bisa dipanggil **siapa pun di internet** lewat `POST /rest/v1/rpc/<nama>`, dan karena `SECURITY DEFINER` berjalan sebagai pemiliknya, **RLS tidak melindungi apa pun di dalamnya**.

⭐ **Yang paling mudah dieksploitasi bukan yang namanya paling menakutkan:** `increment_document_sequence` — seluruh parameternya bisa ditebak (UUID entitas ada di `CLAUDE.md` **dan** di bundle FE), jadi penomoran dokumen bisa dibakar tanpa batas, **permanen** (preseden: nomor invoice 0012 & 0013 terpakai permanen, `PROGRESS.md` 2026-09-07).

**Matriks ACL:**

| fungsi | REVOKE | GRANT | dasar |
|---|---|---|---|
| `increment_document_sequence` | PUBLIC, anon | `authenticated` | 8 pemanggil FE |
| `check_similar_accounts` | PUBLIC, anon | `authenticated` | 3 pemanggil FE |
| `complete_picking` | PUBLIC, anon | `authenticated` | 2 pemanggil FE |
| `attach_price_contract_info` | PUBLIC, anon | `authenticated` | 1 pemanggil FE |
| `is_admin_tier_role` | PUBLIC, anon | `authenticated` | ⛔ dipakai **2 RLS policy** |
| `notify_sp_milestone` | PUBLIC, anon | **— nol** | nol FE, nol policy, pemanggil `SECURITY DEFINER` |

⛔ **`is_admin_tier_role` WAJIB tetap di-GRANT, dan alasannya mudah terlewat.** Ia dipakai **di dalam** `user_roles_insert` dan `user_roles_update` (keduanya `TO authenticated`). Ekspresi policy dievaluasi **sebagai pemanggil**, dan hak `EXECUTE` fungsi **ikut diperiksa di sana** — mencabutnya tanpa GRANT membuat **admin gagal menetapkan role**, dan kedua policy itu justru yang menutup privilege escalation **TD-170**. ⭐ *"Nol pemanggil FE" BUKAN "nol pemanggil": sebuah fungsi bisa terjangkau lewat RLS policy tanpa satu baris frontend menyebutnya.*

**Nol sentuhan badan.** `md5(prosrc)` dibandingkan sebelum/sesudah **dua kali** — di dalam migrasi (V-POST-1) dan sekali lagi **di luar database** oleh runner-nya. Guard peran di dalam badan adalah **lapis 2**, berkas terpisah.

⭐ **Tiga gerbang diperiksa LIVE, bukan diasumsikan dari repo.** Survei pemanggil dari `schema_snapshot.sql` hanya berhasil membaca **83 dari 106** `CREATE FUNCTION`, dan snapshot itu tertanggal 18 Sep — menyimpulkan darinya berarti menyimpulkan dari 78% data yang sudah basi. Karena itu: **V-PRA-1** tepat satu tanda tangan per nama (overload → `REVOKE` bisa mengenai tanda tangan yang salah) · **V-PRA-2** nol fungsi `SECURITY INVOKER` memanggil keenamnya · **V-PRA-3** pemakaian di policy hanya kedua policy `user_roles`. Satu gagal → migrasi berhenti, nol perubahan.

⚠️ **`service_role` sengaja TIDAK diberi GRANT.** Diukur: nol Edge Function memanggil keenamnya (EF hanya memakai `is_super_admin` dan `exec_sql`). Konsekuensi yang diterima: otomasi masa depan yang memakai service key untuk keenam RPC ini **akan ditolak**.

⚠️ **Satu hal yang TIDAK BISA dibuktikan di staging:** jalur pemanggil **internal** `notify_sp_milestone`. Badannya di staging sudah **no-op sejak 25 Sep** (butir 10), jadi staging tidak bisa membuktikan apa pun tentang perilakunya di produksi. Dasarnya logis — pemanggilnya `SECURITY DEFINER` milik `postgres`, berjalan sebagai pemilik. **Buktinya baru ada SESUDAH produksi:** pastikan satu notifikasi milestone SP benar-benar terkirim.

**Hasil eksekusi (28 Sep 2026).**

⭐ **Gerbang V-PRA-2 BERBUNYI di run staging pertama dan menolak melanjutkan** — `seed_uat_build` (`SECURITY INVOKER`) memanggil `complete_picking`. **Nol perubahan terjadi**, transaksinya batal utuh. ⚠️ Fungsi itu **tidak pernah ada di `schema_snapshot.sql`** — ia lahir dari seed UAT, hanya di staging — jadi **survei pemanggil dari repo mustahil menemukannya**. Gerbang yang membaca database hidup menangkap apa yang pembacaan berkas tidak bisa. Pengecualian berawalan `seed_uat_` kemudian dipasang, **dengan nama yang dicetak sebagai NOTICE**, dan pemanggil INVOKER lain apa pun tetap menghentikan migrasi.

⭐ **Di PRODUCTION gerbang itu lolos TANPA pengecualian sama sekali** — helper seed memang tidak ada di sana, persis seperti yang diharapkan. Itu sekaligus membuktikan palang dua arah `seed.sh` bekerja.

**ACL sesudah, kedua lingkungan:** nol entri berawalan `=` (PUBLIC), nol `anon=`, `authenticated=X` di lima fungsi, `notify_sp_milestone` hanya `postgres=X/postgres`.

⚠️ **Dua bentuk awal yang berbeda, dan keduanya sama-sama terbuka:** tiga fungsi ber-`=X/postgres` **eksplisit**, tiga lagi `proacl NULL`. Yang kedua adalah gotcha #40 — *"tanpa ACL" terbaca seperti "tanpa hak", padahal artinya terbuka untuk semua*.

⚠️ **Catatan yang berguna untuk pembacaan drift:** `notify_sp_milestone` di produksi **745 byte** (`f82b70bc…`), di staging **465** (`1fc558be…`) — itu no-op staging butir 10, bukan temuan baru.

**Uji runtime staging (PostgREST, bukan psql):** 6 panggilan dengan anon key ditolak `42501`; 4 fungsi ber-grant lolos sebagai user asli; `notify_sp_milestone` **tetap** ditolak. ⚠️ Skrip ujinya sempat **keluar diam-diam** pada versi pertama — `grep` keluar 1 saat tidak menemukan `"code"`, dan itu terjadi persis saat panggilannya **BERHASIL** (respons 2xx tidak punya field itu). *Skripnya mati di jalur sukses.* Kini ada `trap EXIT` yang mencetak ringkasan di setiap jalur keluar beserta peringatan "jangan baca GAGAL 0 sebagai lulus".

**Rollback.** Runner menyimpan `proacl` sebelum perubahan ke berkas **sebelum** migrasi jalan — pulihkan dari berkas itu, bukan dari ingatan. ⚠️ Memberi kembali ke PUBLIC berarti **membuka kembali paparannya**; lakukan hanya kalau ada yang benar-benar patah, dan **catat apa yang patah** — itulah pemanggil yang tidak terdaftar, dan ia temuan tersendiri.

**Sesudah butir ini:** H1 lapis 2 (guard peran), lalu H2 (`pg_default_acl`), H3 (`SET search_path` 8 fungsi), H4, H5 — seluruhnya **TD-281**.

---

## 28. ✔ `20260928000013_td281_h1_lapis2_guard_dan_jejak` — SELESAI 28 Sep 2026 (⚠️ ARAH TERBALIK + naik bersama butir 29)

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000013_td281_h1_lapis2_guard_dan_jejak.sql` — hidup di branch **`hotfix/td281-h1-lapis2`** (dari `main`) |
| Staging | ✔ **28 Sep 2026** — dijalankan sebagai **UJI**, dan ujinya **MENEMUKAN CACAT** (lihat blok di bawah), lalu ditutup butir 29 |
| Production | ✔ **28 Sep 2026** — dijalankan **bersama butir 29 dalam satu sesi**, butir 28 lebih dulu |
| Urutan | ✔ terlaksana: uji staging → butir 29 → uji ulang staging → PRODUCTION (28 lalu 29, satu sesi) |
| Catatan rollback | `scripts/qa/out/badan-lapis2-20260928-130907/def-*.sql` — teks badan **LAMA** dari produksi. ⚠️ folder `out/` **ter-gitignore**, berkasnya hidup di mesin Den saja |

**Apa yang ditambahkan.** Lapis 1 (butir 27) menjawab *"siapa boleh MEMANGGIL"*. Lapis 2 menjawab pertanyaan berikutnya: *"di antara yang boleh memanggil, siapa boleh MELAKUKAN"*. Tanpanya, **setiap user yang login** bisa menyelesaikan picking mana pun dan menomori dokumen untuk entitas mana pun.

| fungsi | guard | jejak |
|---|---|---|
| `complete_picking` | `is_super_admin() OR is_sp_item_writer()` | `audit_logs` + kolom `picking_lists.completed_by` |
| `attach_price_contract_info` | `is_super_admin() OR is_manager_or_above()` | `audit_logs` |
| `increment_document_sequence` | `is_super_admin() OR p_company_id IN (SELECT get_user_company_ids())` | — |
| `check_similar_accounts` | sama | — |

⚠️ **`has_role('operations')` sengaja DICABUT** dari rancangan awal: diukur, `is_sp_item_writer()` sudah memuat `super_admin, admin, manager, operations`. Ia nol menambah user, tapi akan jadi **tempat kedelapan** daftar peran hidup (TD-233 di tujuh).

⚠️ **`is_super_admin()` tetap eksplisit di keempatnya** walau `super_admin` (level 0) sudah lolos `is_manager_or_above()` (level ≤ 6) — diukur 28 Sep. `level` adalah **data**; kalau ia berubah, hak ini tidak boleh ikut hilang diam-diam.

**Badan diambil dari PRODUCTION** (`pg_get_functiondef`, dump 28 Sep), bukan dari repo — **TD-282**. ⭐ **V-PRA-2 memeriksa `md5(prosrc)` SEBELUM mengganti**: kalau produksi sudah bergerak sejak dump, migrasi **berhenti** dan tidak menimpa apa pun.

⛔ **TIGA keputusan yang harus terbaca, bukan ditemukan belakangan:**

1. **`check_similar_accounts` diubah dari `LANGUAGE sql` ke `plpgsql`.** Fungsi SQL murni **tidak bisa** `RAISE EXCEPTION`, sementara syaratnya pesan tolak yang jelas. Alternatifnya — guard di `WHERE` — membuat penolakan tampak seperti **"nol hasil"**, dan penolakan senyap adalah yang paling mahal didiagnosis. Biayanya kehilangan inlining planner; dampaknya nol (ia pre-check form saat membuat akun, bukan jalur panas).
2. **Penolakan guard memakai ERRCODE bawaan `P0001`, BUKAN `42501`.** Kalau ikut `42501`, *"ditolak guard"* dan *"tidak punya hak EXECUTE"* jadi **tidak bisa dibedakan**, dan uji lapis 1 akan melaporkan TOLAK palsu. Satu kode galat, satu arti.
3. **`completed_by` TIDAK di-backfill.** 151 picking lama tetap NULL — datanya memang tidak pernah direkam. Mengisinya dari `created_by` akan membuat kolom itu **berbohong dengan rapi**. ⭐ **TD-283 karena itu tertutup MULAI SEKARANG, bukan surut ke belakang** — jangan tulis "TD-283 selesai" tanpa kalimat itu.

⚠️ **Satu risiko diukur dan diterima:** guard entitas memakai `get_user_company_ids()` (entitas tempat user punya role **aktif**) sementara FE mengirim `profile.company_id` (entitas **HOME**) — **himpunan yang berbeda**. User ber-home MSI yang role-nya hanya di SOA akan ditolak. Populasi itu di produksi hari ini **NOL** (butir 15). Pesan tolaknya **menyebut nama entitas** supaya sebabnya langsung terbaca kalau kelak ada.

⭐ **V-POST memeriksa empat hal, dan yang keempat paling mudah terlewat: ACL keempat fungsi harus TETAP.** `CREATE OR REPLACE` mempertahankan hak; `DROP`+`CREATE` **tidak**. Kalau ACL bergeser, **butir 27 baru saja dibatalkan tanpa ada yang menyadarinya**.

⛔⛔ **HASIL UJI STAGING 28 Sep 2026: SATU DARI EMPAT FUNGSI RUSAK — dan itu ditemukan oleh uji, bukan oleh pembacaan.**

`check_similar_accounts` menjawab **HTTP 400 SQLSTATE 42702** (*ambiguous column reference*) untuk **setiap** pemanggil. Sebabnya keputusan nomor 1 di atas: `RETURNS TABLE(id, name, similarity)` pada fungsi **plpgsql** melahirkan tiga **variabel OUT** bernama sama dengan kolom di dalam query, dan plpgsql menolak menebak. Versi `LANGUAGE sql` sebelumnya tidak punya variabel sama sekali — **cacat ini lahir bersama konversinya**, ia tidak pernah ada sebelumnya.

⭐ **Yang lebih perlu diingat daripada cacatnya: uji runtime MELIHAT galat itu dan menilainya LULUS.** Pengklasifikasi di `uji-td281-h1.sh` menganggap *"4xx yang membawa kode SQLSTATE"* sebagai TERIMA — karena itulah bentuk penolakan bisnis (`P0001`). Tapi `42702` **bukan penolakan, ia kerusakan**: fungsinya tidak menolak siapa pun, ia gagal untuk **semua orang**.
>> **Uji yang tidak bisa membedakan *ditolak* dari *rusak* akan meloloskan fungsi yang mati, dan terlihat hijau saat melakukannya.**
Kedua skrip uji sudah diperkeras: SQLSTATE kelas **42 / 22 / 23 / XX / 0A / 40 = RUSAK**; hanya **`P0001`** (penolakan yang memang kita tetapkan) dan **2xx** yang TERIMA; `42501` tetap TOLAK (diperiksa lebih dulu, karena ia *juga* kelas 42 tapi artinya "tidak punya EXECUTE"); kode yang tidak dikenal jadi **RAGU**, bukan lulus tebakan. Kasus `42702` masuk uji sintetis keduanya.

**Perbaikannya butir 29** — berkas **BARU**. ⛔ **`20260928000013` sengaja TIDAK disunting**: ia sudah tercatat jalan di staging, dan mengubah isinya membuat repo berhenti menggambarkan apa yang benar-benar dijalankan (pola yang sama dipakai saat berkas 3 AR Tahap 2 cacat — `PROGRESS.md` 2026-09-25).

✔ **HASIL 28 Sep 2026 — LIVE di staging DAN production.** Dijalankan berurutan dalam satu sesi, butir 28 lalu butir 29. Seluruh gerbang lolos: V-PRA-2 (`md5(prosrc)` keempat fungsi cocok dengan dump) dan V-POST (badan berubah, **ACL butir 27 tetap** — nol PUBLIC, nol `anon`, `authenticated` ada).

**Bukti yang diambil sesudahnya, bukan diasumsikan** *(dijalankan Den, read-only, impersonasi `super_admin`)*: `md5(prosrc)` `check_similar_accounts` di production = **`8a97edf6…`** = versi yang lolos uji kesetaraan di staging, dan `check_similar_accounts('PT Indomarco Prismatama', <SOA>)` mengembalikan **1 hasil** — guard dilewati, fungsi bekerja. ⭐ Dua pemeriksaan itu menjawab hal yang berbeda: md5 membuktikan **teks yang naik benar**, panggilan membuktikan **teksnya benar-benar jalan**. Yang pertama saja tidak cukup — 42702 pun punya md5 yang konsisten.

**Catatan rollback:** `scripts/qa/out/badan-lapis2-20260928-130907/def-*.sql` (teks badan **LAMA** dari produksi, empat berkas + `info.txt`). ⚠️ folder `out/` **ter-gitignore**, berkasnya hidup di mesin Den saja — kalau mesin itu hilang, badan lama hanya bisa diambil ulang dari lingkungan yang belum di-upgrade, dan hari ini **tidak ada lagi**.

**Dampak ke drift.** Berkas ini mengubah `prosrc` **empat fungsi** + menambah **satu kolom** → menggeser sidik `fungsi` dan `kolom`. Selama jendela produksi→staging, `env-drift-check` akan melaporkannya sebagai DRIFT. **Itu diharapkan**; samakan staging segera sesudah produksi.

---

## 29. ✔ `20260928000014_td281_l2_fix_check_similar_accounts` — SELESAI 28 Sep 2026 (satu sesi dengan butir 28)

| | |
|---|---|
| Berkas | `supabase/migrations/20260928000014_td281_l2_fix_check_similar_accounts.sql` — hidup di branch **`hotfix/td281-h1-lapis2`** (dari `main`) |
| Staging | ✔ **28 Sep 2026** |
| Production | ✔ **28 Sep 2026** — sesudah butir 28, sesi yang sama |
| Urutan | ✔ terlaksana: butir 28 lebih dulu, lalu berkas ini, satu sesi — di staging maupun di produksi |
| Catatan rollback | badan `LANGUAGE sql` lama: `scripts/qa/out/badan-lapis2-20260928-130907/def-check_similar_accounts.sql`. ⚠️ versi itu **NOL guard entitas** — memulihkannya berarti mencabut guard butir 28 |

**Apa yang diperbaiki.** SQLSTATE **42702** yang lahir dari konversi `check_similar_accounts` ke plpgsql di butir 28. Uraian lengkap sebabnya ada di butir 28; yang perlu diketahui di sini: **tanpa berkas ini, butir 28 mematikan fungsi itu untuk semua orang.**

⛔ **Karena itu butir 28 dan 29 adalah SATU langkah, bukan dua.** Menjalankan 28 saja di produksi = memasang guard sekaligus mematahkan pemeriksaan nama akun di form pembuatan akun. Jarak antara keduanya harus sependek mungkin — idealnya dua `-f` berurutan dalam satu sesi psql.

**Perbaikannya dua lapis, dan itu disengaja** — sebabnya jujur: saya tidak bisa menjalankan SQL untuk memastikan identifier mana persisnya yang ambigu, jadi perbaikannya menutup dua kemungkinan sekaligus.

1. `#variable_conflict use_column` — acuan tak berkualifikasi yang terlewat diselesaikan sebagai **KOLOM**, bukan sebagai variabel OUT.
2. Alias keluaran diganti jadi `akun_id` / `akun_nama` / `skor` — **tabrakannya dihapus**, bukan sekadar diatur cara menyelesaikannya.

⭐ **Nama kolom yang diterima pemanggil TIDAK berubah** — tetap `id` / `name` / `similarity`. Itu datang dari `RETURNS TABLE`, dan `RETURN QUERY` memetakan kolom **per POSISI**, bukan per nama. FE membaca `d.name` dan itu tetap bekerja. Kalau ada yang kelak "merapikan" alias di dalam query menjadi sama dengan nama OUT-nya, 42702 kembali.

**Palangnya menjawab urutan, bukan sekadar mengecek keberadaan.** V-PRA **menolak jalan** kalau fungsi yang hidup masih `LANGUAGE sql` — artinya butir 28 belum jalan di DB itu, dan menjalankan berkas ini sendirian akan memasang versi perbaikan **tanpa guard**, yaitu persis kebalikan dari tujuan seluruh lapis 2. Ia juga berhenti kalau `get_user_company_ids` tidak ditemukan di badan yang hidup.

**V-POST mengasersi ACL lapis 1 (butir 27) utuh** — nol PUBLIC, nol `anon`, `authenticated` ada. Alasannya sama dengan di butir 28: `CREATE OR REPLACE` mempertahankan hak, `DROP`+`CREATE` tidak.

⭐⭐ **Yang membuktikan berkas ini benar BUKAN penalaran di atas, melainkan uji kesetaraan di staging.** `scripts/qa/out/uji-kesetaraan-csa.sh` menyalin badan **LAMA verbatim dari dump produksi** menjadi fungsi bernama lain di dalam satu transaksi, mengimpersonasi `super_admin` lewat GUC `request.jwt.claim.sub` (tanpa itu guard menolak, dan kita akan salah membaca *ditolak* sebagai *rusak*), menjalankan **keduanya berdampingan** atas nama uji yang diambil dari data nyata, membandingkan keluarannya, lalu **`ROLLBACK`** — nol perubahan permanen, apa pun hasilnya.

⚠️ Ujinya **GAGAL kalau nol nama uji mengembalikan hasil**. Nol perbedaan dari nol hasil bukan bukti; itu kelas asersi yang lolos karena prasyaratnya tak pernah terpenuhi — kelas yang sama dengan tiga asersi hijau-palsu 25 Sep (`PROGRESS.md` 2026-09-25).

**Urutan penuh yang harus diikuti:**

1. Staging: jalankan butir 28 (sudah ✔), lalu berkas ini.
2. Staging: `./scripts/qa/out/uji-kesetaraan-csa.sh` — harus **IDENTIK** dan **ber-hasil > 0**.
3. Staging: `./scripts/qa/out/uji-td281-l2.sh` **dan** `./scripts/qa/out/uji-td281-h1.sh` — keduanya lolos, dan ⛔ **nol SQLSTATE kelas 42 di mana pun**.
4. Baru **PRODUCTION**: butir 28 lalu butir 29, satu sesi.
5. `env-drift-check` — lima fungsi + satu kolom akan bergerak; samakan staging kalau masih berbeda.

✔ **HASIL 28 Sep 2026 — LIVE di staging DAN production**, kelima langkah urutan di bawah terlaksana. Uji kesetaraan staging LOLOS (keluaran versi baru **identik** dengan versi produksi lama, dan jumlah nama uji ber-hasil **> 0**, sehingga bukan lolos karena kosong), kedua uji runtime lolos **tanpa satu pun SQLSTATE kelas 42**, lalu production. `md5(prosrc)` di production **sama dengan versi yang diuji itu** — diperiksa, bukan diandaikan.

**Catatan rollback:** `scripts/qa/out/badan-lapis2-20260928-130907/def-check_similar_accounts.sql` (versi `LANGUAGE sql` lama). ⚠️ versi itu **NOL guard entitas** — memulihkannya berarti mencabut guard butir 28, jadi ia rollback untuk *kerusakan*, bukan untuk *ketidaksukaan*.

**Dampak ke drift.** Berkas ini mengubah `prosrc` **satu fungsi**. Selama jendela antara staging dan produksi, `env-drift-check` melaporkannya sebagai DRIFT — **itu diharapkan**.

---

## 30. ✔ `20260929000001_td281_h2_default_privileges` — SELESAI 28 Sep 2026 (⚠️ arah terbalik)

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000001_td281_h2_default_privileges.sql` (215 baris) — branch **`hotfix/td281-h2-default-privileges`** (dari `main`) |
| Staging | ✔ **28 Sep 2026** — COMMIT, V-PRA + V-POST-1 + V-POST-2 LOLOS, probe bersih |
| Production | ✔ **28 Sep 2026** — V-PRA, V-POST-1, V-POST-2 lolos; probe bersih |
| Urutan | **mandiri** — tidak bergantung pada butir mana pun, dan butir 31 tidak bergantung padanya. Urutan H2 → H3 adalah pilihan, bukan keharusan teknis |
| Catatan rollback | ada di ekor berkas: `ALTER DEFAULT PRIVILEGES … GRANT …` |

**Apa yang berubah.** Default privileges `public/r/postgres` memberi **`Dxtm`** (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) kepada `anon` dan `authenticated`, jadi **setiap tabel baru di `public` LAHIR memberikannya** — termasuk kepada `anon`, peran untuk permintaan **tanpa login**. ⛔ `TRUNCATE` **tidak tunduk RLS**: policy seketat apa pun tidak menghalanginya; yang menahannya hanya hak tabel.

⭐ **Buktinya ada sebagai tabel hidup di production, bukan sebagai dugaan:** `customers_backup_20260614` lahir tanpa GRANT eksplisit dan membawa `anon=Dxtm, authenticated=Dxtm`. Bandingkan `goods_receipts`, yang mencabutnya **dengan tangan** di `20260914000002`. Pencabutan manual itulah yang butir ini bakukan — supaya tidak perlu diulang, dan tidak perlu diingat, di setiap tabel berikutnya. ⭐ **Dan itu bukan kejadian sekali.** Diukur 28 Sep: tiga tabel `public` TERBARU di **staging** lahir bersih (`invoice_notes`, `invoice_attachments`, `account_role_mappings`) — **bukan** karena default staging berbeda dari production (keduanya sama persis), melainkan karena **tiga migrasi berbeda masing-masing mencabutnya dengan tangan**, dan ketiganya menulis komentar sendiri untuk menjelaskan kenapa. Ditambah `goods_receipts`, itu **empat kali dalam dua pekan**. *Sesuatu yang harus diingat empat kali adalah sesuatu yang akan terlupakan yang kelima.* Sekaligus menjelaskan kenapa tabel terbaru **production** masih membawa `anon=Dxtm`: tabel-tabel itu tidak lewat migrasi yang mencabut.

**Sesudahnya tabel baru lahir dengan NOL hak untuk `anon`/`authenticated`.** Tidak ada DML yang "dipertahankan", karena default-nya memang **tidak pernah memberi DML** — aturan repo *"GRANT eksplisit setelah CREATE"* tidak berubah beratnya, ia sudah wajib hari ini.

⛔ **BATAS YANG WAJIB TERBACA: `ALTER DEFAULT PRIVILEGES` TIDAK RETROAKTIF.** Sesudah butir ini, **139+ tabel yang sudah ada tetap** memberi TRUNCATE kepada `authenticated` (TD-230) dan kepada `anon` di 111 tabel. **Jangan baca "default privileges sudah dibereskan" sebagai "TRUNCATE ditutup"** — itu **H5**. Justru sifat tidak-retroaktif inilah yang membuat butir ini **nol risiko** terhadap data dan aplikasi yang hidup.

⚠️ **`service_role` SENGAJA TIDAK dicabut** (keputusan Den 28 Sep). Ia sudah mem-bypass RLS dan memegang DML penuh; siapa pun yang memegang kuncinya bisa `DELETE` tanpa `WHERE`, jadi TRUNCATE bukan kelas kemampuan baru baginya, dan kuncinya tidak pernah dikirim ke browser. Yang tetap disebut apa adanya: **TRUNCATE melewati trigger `ON DELETE`**, jadi penghancuran lewatnya lebih senyap. Bedanya kecil tapi nyata. Reversibel, satu baris. V-POST mengasersi ia **masih utuh** supaya pergeseran diam-diam kelak ketahuan dari uji.

⚠️⚠️ **Entri `supabase_admin` tidak disentuh (keputusan Den) — dan ukurannya ditulis di sini supaya tidak lewat sebagai "sisa risiko" tanpa angka:** `public | tabel | supabase_admin` memberi **`arwdDxtm` PENUH** kepada `anon` **dan** `authenticated`. Itu **jauh lebih longgar** daripada entri `postgres` yang butir ini tambal. Setiap tabel `public` yang lahir lewat jalur `supabase_admin` akan **terbuka sepenuhnya untuk anon**. Yang menahannya hari ini hanyalah kenyataan bahwa migrasi kita berjalan sebagai `postgres` — itu **keadaan, bukan jaminan**. Entrinya milik platform Supabase; mengubahnya keputusan terpisah.

✅ **Dikonfirmasi sesuai permintaan:** `public | fungsi | postgres` = **`postgres=X/postgres` saja** — fungsi baru buatan `postgres` di `public` tidak lahir PUBLIC EXECUTE. (Yang ber-`proacl NULL` hari ini adalah fungsi **lama**, lahir sebelum entri itu ada.)

⭐ **V-POST-2 adalah gerbang yang sebenarnya:** ia **membuat tabel sungguhan**, membaca hak yang ia **bawa**, mengasersi nol untuk anon/authenticated, lalu membuangnya (plus sabuk pengaman yang menolak COMMIT kalau probe tertinggal). V-POST-1 hanya membuktikan *perintahnya jalan*; probe membuktikan *tabel berikutnya benar-benar lahir sempit*. Menalar dari isi `pg_default_acl` bukan hal yang sama dengan melihat hasilnya.

✔ **HASIL STAGING 28 Sep 2026: LOLOS.** Migrasi COMMIT; V-PRA, V-POST-1 dan V-POST-2 lolos; probe tidak tertinggal. Default privileges `public/r/postgres` untuk `anon` dan `authenticated` kini **kosong**.

⚠️ **Runner-nya sendiri sempat melaporkan KEGAGALAN palsu, dan bentuk cacatnya layak dicatat.** Bagian BUKTI di `jalankan-td281-h2.sh` menghitung `"| anon |"` di **seluruh** keluaran, padahal query-nya membaca `pg_default_acl` untuk **semua** peran pembuat — maka delapan hak entri `supabase_admin` ikut terhitung dan ia berteriak *"anon masih punya 8 hak default"* pada keadaan yang sebenarnya **benar**. **Migrasinya sendiri memfilter `defaclrole = postgres` dan lolos**; yang keliru hanya pemeriksa di shell.
⭐ Jadi: **satu pemeriksaan ditulis DUA kali, dan salinan kedua ditulis lebih longgar** — kelas TD-233, kali ini pada gerbang uji alih-alih pada daftar peran. Arahnya kebetulan aman (berteriak pada yang benar, bukan diam pada yang salah), **tapi alarm palsu memakan kepercayaan yang sama dengan alarm yang hilang.** Runner sudah diperbaiki (filter pembuat eksplisit) **dan diuji dua arah atas data sintetis** — termasuk uji negatif yang memastikan ia **masih** gagal kalau hak `postgres/anon` benar-benar tertinggal, karena perbaikan yang hanya menghentikan alarm palsu bisa dengan mudah menghentikan alarm sama sekali. Entri `supabase_admin` kini **dicetak terpisah sebagai sisa risiko diketahui**, bukan dinilai — *sisa risiko yang tidak pernah terlihat berhenti terasa sebagai risiko.*

✔ **HASIL PRODUCTION 28 Sep 2026: LOLOS.** V-PRA, V-POST-1, V-POST-2 lolos; probe bersih. BUKTI runner (versi yang sudah diperbaiki): `postgres/anon` **0**, `postgres/authenticated` **0**, `postgres/service_role` **4** (sengaja dipertahankan), dan entri `supabase_admin` **tercetak terpisah sebagai sisa risiko diketahui**.

⚠️ **Cara membuktikan butir ini sudah jalan BUKAN lewat `jalankan-drift.sh`** — alat itu membandingkan `relacl`/`attacl`/`proacl` dan **tidak menyentuh `pg_default_acl`**, jadi butir 30 tidak akan pernah muncul di sana, di lingkungan mana pun. Yang membuktikannya: keluaran runner di atas, atau `baca-h2-h3.sh`.

**Dampak ke drift.** Kategori `hak` `env-drift-check` membandingkan `relacl`/`attacl`/`proacl` — **bukan** `pg_default_acl`. Jadi butir ini **tidak akan muncul sebagai drift sama sekali**, di lingkungan mana pun. ⚠️ Itu berarti **alat drift tidak bisa memberi tahu apakah butir ini sudah jalan di suatu lingkungan** — gunakan `baca-h2-h3.sh`, bukan `jalankan-drift.sh`.

---

## 31. ✔ `20260929000002_td281_h3_search_path` — SELESAI 28 Sep 2026 (⚠️ arah terbalik)

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000002_td281_h3_search_path.sql` (245 baris) — branch **`hotfix/td281-h3-search-path`** (dari `main`) |
| Staging | ✔ **28 Sep 2026** — dengan uji runtime lengkap |
| Production | ✔ **28 Sep 2026** — V-PRA 1-3 + V-POST lolos; md5 identik 8/8, ACL tetap, proconfig 8/8 |
| Urutan | **mandiri** terhadap butir 30 |
| Catatan rollback | delapan `ALTER FUNCTION … RESET search_path` ada di ekor berkas |

**Apa yang berubah.** Delapan fungsi `SECURITY DEFINER` terakhir yang belum mengunci `search_path` dikunci ke `'public'`: `exec_sql` · `get_linked_bnf_status` · `get_table_columns` · `get_user_role_code` · `handle_new_user` · `is_admin_or_above` · `is_bnf_authorized` · `is_super_admin`. Dari **76** SECURITY DEFINER di `public`, **66 sudah mengunci** — ini menuntaskan kebiasaan yang sudah ada, bukan kebijakan baru.

**Kenapa nyata:** fungsi DEFINER berjalan sebagai **pemiliknya**; tanpa `search_path` terkunci ia memakai search_path **si pemanggil**, sehingga acuan tak berkualifikasi di dalam badan bisa diarahkan ke objek milik pemanggil lalu dipakai dengan hak pemilik.

⭐ **Bentuk buktinya adalah alasan mengerjakannya begini:** `ALTER FUNCTION … SET` **tidak menyentuh `prosrc`**, jadi **`md5(prosrc)` wajib identik sebelum/sesudah** untuk kedelapannya dan hanya `proconfig` yang bergerak. Klaim *"nol badan berubah"* di sini **bukan janji, ia diasersi** — bentuk yang sama dengan butir 27.

⛔ **Kedelapan badan dibaca dari PRODUCTION lebih dulu** (bukan repo — TD-282) **dan disisir** untuk acuan tak berkualifikasi ke luar `public`, karena mengunci `search_path` **mengubah resolusi nama**, dan matinya muncul saat **runtime**, bukan saat `ALTER`. Itu persis kelas 42702: **cacat yang lahir dari perbaikannya**.

⭐ **Hasil sisiran menjawab satu syarat bersyarat di rencana, dan jawabannya TIDAK:** `handle_new_user` ternyata sudah menulis **`public.companies` / `public.branches` / `public.departments` / `public.profiles`** — **keempatnya ber-skema** — dan `NEW` adalah record trigger, bukan acuan skema. Jadi **`'public, auth'` TIDAK diperlukan**; kedelapannya memakai nilai yang sama. `exec_sql` tidak punya acuan sendiri (badannya `EXECUTE sql`); yang terpengaruh adalah SQL **yang dikirim pemanggil**, dan satu-satunya pemanggil (EF `manage-schema`) mengirim `ALTER TABLE public.<t> ADD COLUMN …` yang **sudah ber-skema**, dengan tipe dari daftar bawaan yang resolve lewat `pg_catalog`. ⚠️ Kalau kelak lahir pemanggil `exec_sql` baru yang mengirim acuan tak berkualifikasi ke luar `public`, **ia akan patah** — dan itu konsekuensi yang diterima.

⚠️ **Batas yang disengaja:** nilainya **`'public'` saja, bukan `'public, pg_temp'`**. Kalau `pg_temp` tidak disebut, PostgreSQL **tetap mencarinya lebih dulu** untuk nama **relasi**, jadi secara teori pemanggil yang bisa membuat tabel temporer masih bisa membayangi `user_roles`. Itu **tidak terjangkau lewat PostgREST** (ia tidak mengizinkan DDL), dan **66 fungsi lain memakai bentuk yang sama** — keseragaman punya harga nyata di sini karena `config_bentuk` ikut jadi sidik jari `env-drift-check`, sehingga bentuk yang berbeda akan tampil **drift selamanya**. Menyapu ke `'public, pg_temp'` = keputusan terpisah untuk **seluruh 74**, bukan untuk delapan ini sendirian.

⛔ **Butir ini TIDAK menyentuh hak akses** — **enam dari delapan** masih `proacl NULL` = **PUBLIC EXECUTE** sesudahnya. Itu **H4**, dan salah satunya punya kebocoran yang sudah terukur (lihat TD-281).

⚠️ **TD-231 tertutup bagian `search_path`-nya SAJA** oleh butir ini; bagian `company_id` singular-nya **tidak** — jangan tandai TD-231 selesai.

**Uji runtime staging (wajib, sebelum production):** login + halaman ber-RLS (membuktikan `is_super_admin`/`is_admin_or_above` masih bekerja **di dalam policy**, bukan hanya sebagai RPC) · buat user lewat EF `create-user` (`handle_new_user`) · SchemaManager (`get_table_columns`) · halaman BNF (`is_bnf_authorized`, `get_linked_bnf_status`). ⚠️ Jalankan ujinya **sebelum DAN sesudah** migrasi — "sesudahnya jalan" tanpa pembanding tidak membuktikan migrasi ini tidak merusak apa pun yang memang sudah rusak.

✔ **Baseline uji runtime staging diambil 28 Sep 2026 SEBELUM migrasi: LOLOS 9/0** (`scripts/qa/out/uji-td281-h3-20260928-140217/hasil.txt`). Itu pembanding wajibnya — jalankan `uji-td281-h3.sh --banding <berkas itu>` sesudah migrasi, dan bandingkan **nilainya**, bukan hanya lulus/gagalnya.

⚠️ **Bagian A skrip uji itu sempat berjudul "Lima fungsi" sementara hanya empat yang diuji.** Itu **judulnya** yang salah, bukan uji yang hilang: fungsi nol-argumen memang **lima**, tetapi yang kelima (`handle_new_user`) mengembalikan `trigger` sehingga **PostgREST tidak mengeksposnya sama sekali**. Skripnya kini membawa **pembukuan eksplisit** — 8 fungsi = 4 (bagian A) + 2 (bagian B) + 2 yang tak terjangkau headless — supaya uji yang hilang kelak muncul sebagai **selisih angka**, bukan sebagai judul yang kebetulan tidak dibaca ulang.

✔ **HASIL PRODUCTION 28 Sep 2026: LOLOS.** V-PRA-1, V-PRA-2, V-PRA-3 dan V-POST lolos: **`md5(prosrc)` identik 8/8** (nol badan berubah, persis janji berkasnya), **ACL tetap**, **`proconfig` 8/8 memuat `search_path=public`**.

✅ **Uji runtime staging lengkap, dan dua di antaranya tidak bisa digantikan pembacaan kode:**
• `handle_new_user` — user dummy dibuat lewat **User Access di beta** 28 Sep 14:13 WIB, **sesudah** migrasi (14:03), dan profilnya terbentuk otomatis dengan company MSI + branch Head Office. ⭐ **Branch yang ketemu itulah buktinya**: `public.branches` dan `public.departments` dibaca dengan bentuk query yang sama di skema yang sama — kalau penguncian merusak resolusi nama, branch ikut NULL dan `public.companies` sudah lebih dulu melempar exception.
• `exec_sql` — diuji **DISKRIMINATIF**, bukan sekadar "masih jalan": sesi di-`SET search_path TO auth, public`, lalu `exec_sql` disuruh membaca `users` (tabel yang **hanya** ada di skema `auth`; ketiadaan `public.users` diperiksa sebagai prasyarat). Ia **tidak menemukannya** → penguncian **benar-benar berlaku**. ⭐ Tanpa uji berbentuk begini, *"exec_sql masih bekerja"* bisa benar **sekaligus** penguncian tidak terpasang — dan membaca `proconfig` pun tidak menutup celah itu, karena itu membaca **niat**, bukan **akibat**. Uji positifnya memakai bentuk persis yang dikirim EF `manage-schema`, lalu `ROLLBACK`, lalu diperiksa bersih **di luar** transaksi.

**Dampak ke drift.** `proconfig` **ikut** sidik jari `fungsi` di `env-drift-check`, jadi selama jendela production→staging kedelapannya akan dilaporkan **BEDA ISI**. **Itu diharapkan**; samakan staging segera.

---

## AR Tahap 3 (butir 32-38) — pengaman pembayaran + potongan pelanggan + jatuh tempo dari TTF

Enam berkas lahir dari TD-285 (batas total pembayaran), TD-286 (batas PPh), TD-287 (kolom potongan lain) dan dari penutupan D-15 (`due_date` dulu dihitung di dua/tiga tempat sekaligus); satu berkas ketujuh (butir 38) menyusul sebagai koreksi hasil UAT (`tanggal_menerima` isi sekali). **Ditulis 29 Sep 2026, LIVE STAGING 29 Sep 2026** (ketujuh berkas, termasuk `20260929000009` yang STOP KERAS-nya sudah dilewati manual sesudah review V0 oleh Den) — **PRODUCTION BELUM SATU PUN**. Urutan **MENGIKAT: 32 → 33 → 34 → 35 → 36 → 37 (37 opsional/menunggu review V0 ulang untuk production) → 38** (38 hanya butuh 36, tidak bergantung pada 37).

⛔ **Dasar `record_payment` (butir 35) adalah v2** (`20260927000003_journal_account_roles_and_readiness.sql`, `get_mapped_account` + menolak status `issued`) — **BUKAN** v1 produksi (`20260817000001`, kode akun hardcode). Keputusan Den: AR Tahap 3 naik **BERSAMA** Tahap 1 (butir 6-9) dan Tahap 2 (butir 11-14), karena UI-nya (`InvoiceDetailPage.jsx`/`useInvoiceWorkflow.js`) sendiri menumpang di sana dan belum ada di `main`. Konsekuensinya: **butir 35 punya prasyarat butir 9 DAN 13**, bukan cuma butir 12.

⛔ **`create_invoice_for_sp` versi TERAKHIR bukan `20260928000003` (butir 18) — dicoret dari PLAN semula.** Audit sebelum menulis butir 36 menemukan `20260928000010_invoice_issue_tax_link.sql` (butir 25) lahir belakangan di atas badan butir 18 (mengisi `tax_id`), dan itulah yang hidup di staging hari ini. Badan yang diganti `CREATE OR REPLACE` di butir 36 disalin dari **20260928000010**, dengan diff yang diverifikasi mekanis (bukan dibaca sekilas) hanya tiga baris: deklarasi `v_due_date`, baris hitungnya, dan kolom `due_date` di `UPDATE` — `payment_term_days`/`payment_term_label`/`tax_id`/`post_invoice_journal` semuanya **tetap ada**.

---

## 32. ⛔ `20260929000004_ar_tahap3_compute_payment_term_days` — WAJIB (AR Tahap 3, PERTAMA)

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000004_ar_tahap3_compute_payment_term_days.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, PERTAMA di gelombang ini** — mandiri, nol dependensi lain |

**Apa isinya.** Fungsi baru `compute_payment_term_days(company_id, customer_id)` — memusatkan rantai termin tiga tingkat (override akun → `entity_finance_settings` → cadangan 30) yang sebelum ini terduplikasi di `submit_invoice`, `create_invoice_for_sp`, dan backfill `20260927000001`. **Aditif sepenuhnya**, nol tabel/fungsi lama disentuh.

⛔ **REVOKE ALL dari PUBLIC, anon, DAN authenticated** — beda dari `get_mapped_account` yang di-GRANT ke `authenticated`. Fungsi ini **hanya** dipanggil dari dalam fungsi `SECURITY DEFINER` lain (butir 36); tidak ada alasan ia terjangkau langsung lewat PostgREST.

**Rollback.** `DROP FUNCTION IF EXISTS public.compute_payment_term_days(uuid, uuid);` — aman selama butir 36 belum jalan.

---

## 33. ⛔ `20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan` — WAJIB, sesudah butir 12

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 12** (`account_role_mappings` harus sudah ada) |

**Apa isinya.** Memperluas `CHECK` `account_role_mappings_role_key_check` dari enam peran menjadi tujuh, menambahkan `potongan_pelanggan` — dipakai `record_payment` (butir 35) untuk menjurnal potongan lain (TD-287). **Nol baris `account_role_mappings` ditulis di sini** — V1 memastikan itu (0 baris `potongan_pelanggan` sesudah migrasi ini).

⛔ **Nama peran ini koreksi Den atas usulan PLAN semula** ("beban_potongan_lain" → **"potongan_pelanggan"**) — draft CoA grup menempatkannya di akun **4-1900** "Diskon, rebate, listing fee & potongan trading term" (**kontra-pendapatan, normal DEBIT**). Baris jurnalnya (di `record_payment`) tetap debit.

**Pengisian akun 4-1900 untuk SOA adalah SEED STAGING TERPISAH** — `scripts/seed/staging_ar_tahap3_potongan_pelanggan.sql`, **di luar folder migration, TIDAK PERNAH naik ke produksi**. **Sudah LIVE di staging 29 Sep 2026** (bersama seluruh butir 32-38), jadi `get_mapped_account(SOA, 'potongan_pelanggan')` sudah bisa dipanggil di sana. **Di production, sampai seed ini (atau padanannya, kalau/ketika ada CoA final) dijalankan manual**, `get_mapped_account(company, 'potongan_pelanggan')` akan menolak dengan pesan jelas — dan `record_payment` hanya memanggilnya kalau `p_potongan_lain > 0`, jadi pembayaran tanpa potongan tetap jalan normal di production juga.

⚠️ **Enam peran lama TIDAK disentuh** — berkas ini murni menambah satu nilai CHECK.

**Rollback.** Ada di ekor berkas — hapus baris `potongan_pelanggan` (kalau ada) lalu kembalikan CHECK ke enam peran.

---

## 34. ⛔ `20260929000006_ar_tahap3_sp_payments_potongan_kolom` — WAJIB, mandiri

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000006_ar_tahap3_sp_payments_potongan_kolom.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** — nol dependensi terhadap butir 32/33 |

**Apa isinya.** Dua kolom baru `sp_payments.potongan_lain` (`numeric(18,2) NOT NULL DEFAULT 0`, `CHECK >= 0`) dan `sp_payments.potongan_keterangan` (`text`). `DEFAULT 0` → nol dampak ke baris lama.

⛔ **Sengaja NOL GRANT UPDATE tambahan ke `authenticated`** untuk kedua kolom — pola sama dengan `amount`/`pph` (beda dari `reference`/`bukti_potong_url`/`bukti_potong_no` yang memang dapat GRANT UPDATE kolom sejak `20260817000001`). Nominal potongan hanya bisa masuk lewat `record_payment`.

**Rollback.** Ada di ekor berkas — `DROP COLUMN`, **hanya** kalau `record_payment` (butir 35) belum pernah menulis `potongan_lain > 0` di baris mana pun.

---

## 35. ⛔ `20260929000007_ar_tahap3_record_payment_v3` — WAJIB, sesudah butir 9, 13, 33, 34

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000007_ar_tahap3_record_payment_v3.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 9, 13 (AR Tahap 1/2), 33, dan 34** |

**Apa isinya.** `record_payment` v3 — TD-285 (batas total pembayaran vs sisa tagihan, baris invoice dikunci `FOR UPDATE` untuk menutup race dua pembayaran bersamaan), TD-286 (batas PPh vs sisa tagihan, diperiksa lebih dulu supaya pesannya spesifik), TD-287 (parameter `p_potongan_lain`/`p_potongan_keterangan`, keterangan wajib kalau potongan > 0, dijurnal debit ke peran `potongan_pelanggan`). Toleransi pembulatan **`c_tolerance = 1`, dipakai ulang** dari penentu status `'paid'` yang sudah ada (TD-294) — bukan angka baru untuk menyembunyikan potongan TTF.

⛔ **Tanda tangan bertambah 2 parameter → FUNGSI BARU bagi Postgres (gotcha #37)**, bukan `CREATE OR REPLACE` atas yang lama. Berkas **DROP eksplisit** signature 7-argumen sebelum `CREATE` yang 9-argumen — membiarkan keduanya hidup bersama membuat panggilan 7-argumen ambigu (kelas insiden `mark_delivery_delivered`, 17 Sep 2026).

⛔ **ACL WAJIB dipulihkan manual** karena DROP+CREATE tidak mewarisi hak: `REVOKE ALL FROM PUBLIC` + `REVOKE ALL FROM anon` + `GRANT EXECUTE TO authenticated` — persis pola v1/v2. V-POST mengasersi ini (gotcha #40: `proacl NULL` **atau** entri berawalan `=` sama-sama PUBLIC EXECUTE).

**V-PRA menolak jalan** kalau badan yang hidup bukan v2 (tidak memuat `get_mapped_account` atau tidak menolak status `issued`) — mencegah menimpa buta badan yang sudah bergerak (gotcha #35).

**Rollback.** Ada di ekor berkas — mengembalikan v2 (badan lengkap ada di `20260927000003_journal_account_roles_and_readiness.sql`). Kehilangan cap TD-285/286 dan potongan TD-287 — hanya untuk kondisi darurat.

---

## 36. ⛔ `20260929000008_ar_tahap3_ttf_tanggal_dan_due_date` — WAJIB, sesudah butir 18, 25, 32

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 18 dan 25** (`create_invoice_for_sp` harus sudah versi `20260928000010`) **dan sesudah butir 32** (`compute_payment_term_days`) |

**Apa isinya.** `due_date` pindah pemicu: dari "invoice_date + termin, dihitung saat terbit/submit" menjadi "tanggal_ttf + termin, dihitung SEKALI saat TTF diterima". Tiga fungsi diubah dalam **satu** migrasi supaya nol jendela dua sumber `due_date` hidup bersamaan:

| fungsi | bentuk perubahan | badan sumber |
|---|---|---|
| `mark_ttf_received` | **DROP+CREATE** (+`p_ttf_date date DEFAULT CURRENT_DATE`, dulu hardcode `CURRENT_DATE` — tidak pernah bisa diisi dari UI) + hitung `due_date` sekali kalau `tanggal_ttf` sungguh berubah | `20260817000001` (satu-satunya versi) |
| `submit_invoice` | **CREATE OR REPLACE** (signature tetap), blok hitung `due_date` dicabut | `20260814000003` (satu-satunya versi) |
| `create_invoice_for_sp` | **CREATE OR REPLACE** (signature tetap), blok hitung `due_date` dicabut | `20260928000010` (versi TERAKHIR — lihat catatan pembuka seksi ini) |

⛔ **Pencarian "siapa saja yang menulis `due_date`" dilakukan penuh sebelum berkas ini ditulis** (backfill sekali-jalan `20260927000001` sengaja dikeluarkan — ia sudah selesai tugasnya). `create_invoice` (wrapper, bukan `_for_sp`) **diperiksa dan NOL menyentuh due_date** — ia hanya memanggil `create_invoice_for_sp` per Surat Jalan.

⭐ **Diff `create_invoice_for_sp` diverifikasi MEKANIS** (`diff` dua badan, bukan dibaca sekilas) — persis 3 baris berubah: deklarasi `v_due_date`, baris hitungnya, kolom `due_date` di `UPDATE`. `v_override_days`/`v_term_days`/`v_term_label` **TETAP ADA dan TETAP DIPAKAI** — keduanya mengisi `payment_term_days`/`payment_term_label` (metadata termin di header invoice), yang tidak ada hubungannya dengan `due_date`. `tax_id`/`post_invoice_journal` (butir 18/25) **tidak tersentuh**.

⭐ **"`due_date` dihitung sekali lalu permanen" (rapat 13 Agu 2026) TETAP berlaku** — yang berubah hanya PEMICUnya (TTF, bukan submit/terbit). `mark_ttf_received` hanya menghitung ulang kalau `tanggal_ttf` **sungguh berubah** (insert TTF pertama, atau koreksi eksplisit); mengedit No. TTF/nama penerima/catatan saja tidak menyentuh `due_date`.

**Cek frontend (diminta, dilaporkan, TIDAK diubah — di luar scope):** `src/` nol menulis `due_date` langsung. Seluruh kemunculannya di `db.js`/`InvoiceListPage.jsx`/`InvoiceDetailPage.jsx`/`invoiceStatus.js`/`InvoicePDF.jsx` adalah baca (mapper, tampilan, `isOverdue`) — satu-satunya jalur tulis selalu RPC, konsisten dengan `sp_invoices` yang nol GRANT `UPDATE(due_date)` ke `authenticated` sejak `20260814000003`.

**V-PRA menolak jalan** kalau salah satu dari ketiga fungsi tidak dalam bentuk PERSIS yang diharapkan (termasuk memastikan `create_invoice_for_sp` benar-benar versi `20260928000010`, bukan versi lain). **V-POST** memastikan `due_date` sungguh hilang dari ketiga badan, `payment_term_days`/`tax_id`/`post_invoice_journal` di `create_invoice_for_sp` tetap ada, dan ACL ketiganya `authenticated`-only.

**Rollback.** Ada di ekor berkas — kembalikan ketiga fungsi ke bentuk sebelum berkas ini (badan lengkap masing-masing ada di file sumber yang disebut di tabel atas).

---

## 37. ⛔ `20260929000009_ar_tahap3_due_date_ttf_backfill` — MENUNGGU REVIEW DEN, sesudah butir 36

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000009_ar_tahap3_due_date_ttf_backfill.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** — blok STOP KERAS dilewati MANUAL di staging sesudah V0 direview dan disetujui Den (22 invoice tersentuh: 8 dari TTF, 14 jadi "Belum TTF") |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⏸ **JANGAN jalankan** sampai query pengukuran dampak (blok V0 di berkas ini) direview dan disetujui Den **untuk data production saat itu** — angkanya akan berbeda dari staging |

**Apa isinya.** Menghitung ulang `due_date` untuk SELURUH invoice hidup (non-void) memakai basis TTF (butir 36), bukan cuma mengisi yang `NULL` — beda dari backfill AR Tahap 2 (`20260927000001`) yang hanya mengisi kekosongan. Karena basisnya berubah (`invoice_date` → `tanggal_ttf`), nilai `due_date` yang **sudah terisi** dari basis lama juga bisa berubah, dan invoice tanpa TTF yang **sudah** punya `due_date` akan **kehilangannya** (jadi tampil "Belum TTF").

⛔⛔⛔ **Berkas ini punya STOP KERAS, dan blok itu TETAP ADA di repo** — satu blok `DO $stop$ ... RAISE EXCEPTION ...` yang menggagalkan transaksi tanpa syarat, ditempatkan **sesudah** blok pengukuran dampak (V0, read-only, aman dijalankan sendirian) dan **sebelum** blok backfill sungguhan. Blok STOP itu harus **dihapus manual** sesudah angka V0 direview — desain ini disengaja supaya berkas tidak bisa tereksekusi utuh secara tidak sengaja. **Di staging, blok ini sudah dilewati manual 29 Sep 2026** (sesudah review V0 oleh Den) supaya backfill sungguhan bisa jalan di sana — **berkas di repo TIDAK diubah**, jadi menjalankannya lagi (mis. di production) akan berhenti di STOP KERAS itu lagi seperti seharusnya, sampai seseorang mengulang langkah yang sama: baca V0, review dengan Den, baru hapus blok itu manual untuk sesi eksekusi production.

**Cadangan** `sp_invoices_due_date_ttf_backfill_20260929` menyimpan `due_date` lama, `tanggal_ttf` yang dipakai, `term_days`, dan `due_date` baru — pola sama dengan `sp_invoices_due_date_backfill_20260927`. **Tabel ini sekarang ada di staging** (lahir dari eksekusi 29 Sep) — didaftarkan ke kelas ANTRE `scripts/qa/env-drift-check.mjs` (butir 32-38) supaya `env-drift-check` tidak melaporkannya sebagai DRIFT tak dikenal.

⚠️ **Dua angka dampak yang JANGAN tertukar:** laporan sesi sebelumnya (produksi, read-only, sebelum eksekusi apa pun) mengukur **1 invoice** yang akan kehilangan `due_date` di **production**. Eksekusi staging 29 Sep 2026 (V0, sesudah butir 32-36 live di sana) mengukur **22 invoice tersentuh — 8 karena sudah punya TTF (due_date berubah basis), 14 jadi "Belum TTF"** — angka **staging**, bukan production. Angka pasti untuk production saat launching **wajib diukur ulang** lewat blok V0 saat itu, karena data bergerak setiap hari dan populasi staging ≠ populasi production.

**Rollback.** Ada di ekor berkas — syarat: hanya mengembalikan baris yang `due_date`-nya masih sama dengan `due_date_baru` backfill ini (koreksi manual sesudahnya tidak ditimpa).

---

## 38. ⛔ `20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali` — WAJIB, sesudah butir 36

| | |
|---|---|
| Berkas | `supabase/migrations/20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali.sql` |
| Staging | ✔ **LIVE 29 Sep 2026** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 36** (`mark_ttf_received` harus sudah versi `20260929000008`) |

**Apa isinya.** Koreksi hasil UAT `mark_ttf_received` (butir 36): cabang UPDATE-nya menulis `tanggal_menerima = CURRENT_DATE` **setiap kali** fungsi dipanggil, sehingga mengedit TTF (tanggal_ttf/No. TTF/nama penerima/catatan) menimpa kapan TTF **pertama kali** dicatat. Kasus nyata: `SOA-INV-VII-2026-0161`, TTF pertama dicatat 16 Jul, satu koreksi membuatnya berubah jadi 29 Sep. Perbaikan: `tanggal_menerima` kini diisi **SEKALI**, hanya di cabang INSERT — pola sama dengan `set_invoice_tax_info` dan `signed_date_filled_by`.

**Tanda tangan TIDAK berubah** — `(uuid, text, text, text, date)`, sama dengan butir 36. `CREATE OR REPLACE`, **bukan** DROP+CREATE (gotcha #37 tidak berlaku, nol parameter berubah) — ACL diwarisi otomatis, tetap diasersi ulang di V-POST.

⛔ **Berkas BARU, bukan mengedit `20260929000008`** — berkas itu sudah tercatat jalan di staging. **Diff terhadap `20260929000008` diverifikasi MEKANIS (`diff`) sebelum ditulis: HANYA satu baris kode hilang** (`tanggal_menerima = CURRENT_DATE,` di cabang UPDATE) — cabang INSERT dan blok hitung `due_date` (fungsi yang sama, `compute_payment_term_days`) **tidak disentuh**.

**V-PRA menolak jalan** kalau badan yang hidup bukan versi butir 36 (tidak lagi menimpa `tanggal_menerima` di UPDATE, atau kehilangan blok `due_date`) — `oidvectortypes(proargtypes)` dipakai mencocokkan tipe (gotcha #44), bukan `pg_get_function_identity_arguments()`. **V-POST** memastikan pola penimpaan itu sungguh hilang, cabang INSERT + blok `due_date` utuh, dan ACL tetap `authenticated` saja.

⚠️ **Jejak koreksi TTF (nilai lama vs baru) TIDAK dicatat di mana pun** — Nexus belum punya mekanisme audit yang bisa dipakai untuk `ar_ttfs` (lihat laporan sesi 29 Sep 2026 untuk temuan lengkap: `audit_logs` ada tapi skemanya per-record generik dan baru dipakai segelintir RPC lain, `mark_ttf_received` bukan salah satunya). Di luar scope unit kerja ini — dicatat sebagai temuan, bukan dikerjakan. **[→ ditutup butir 42 (`20260930000004`), AR Tahap 3 bagian kedua: `mark_ttf_received` versi berkas itu menulis `audit_logs` aksi `KOREKSI_TTF` di cabang UPDATE, dibaca lewat RPC baru `get_invoice_audit_trail` (butir 44) karena `audit_logs` sendiri tak bisa dibaca finance/finance_controller langsung.]**

**Rollback.** Ada di ekor berkas — tempel ulang badan `20260929000008` (mengembalikan penimpaan `tanggal_menerima` tiap edit).

---

## AR Tahap 3 bagian kedua (butir 39-44) — approval terbit invoice + izin role finance + jejak koreksi TTF

Enam berkas dari PLAN AR Tahap 3 bagian kedua, DISETUJUI Den 30 Sep 2026 sesudah PLAN dipresentasikan: TASK 1 (approval terbit invoice — status baru `pending_approval`, fungsi `approve_invoice_issue`/`reject_invoice_issue`), TASK 2 (izin `finance` dibuka untuk ajukan/submit/TTF/pembayaran; `submit_invoice` disesuaikan), TASK 3 (jejak koreksi TTF ke `audit_logs`, dibaca lewat RPC baru karena `audit_logs` sendiri tak terbaca finance/finance_controller). ✅ **LIVE STAGING 30 Sep 2026 (isi yang sama persis yang dijalankan, seluruh palang dan V-POST lolos) — PRODUCTION BELUM.** Urutan **MENGIKAT: 39 → 40 → 41, dan 39 → 42** (42 tidak bergantung 40/41); **43 dan 44 mandiri** terhadap kelima lainnya, tapi wajar dijalankan di ujung batch ini karena sama-sama bagian PLAN yang sama.

⛔ **Dasar setiap fungsi yang disunting = versi TERAKHIR yang hidup di staging pada AR Tahap 3 bagian pertama (butir 32-38), BUKAN versi produksi** — produksi belum menjalankan satu pun dari butir 32-38, jadi keenam berkas baru ini **TIDAK BOLEH** dijalankan ke production tanpa butir 32-38 (dan butir 6-31 di bawahnya) lebih dulu. Rincian basis per fungsi ada di kepala tiap berkas.

⚠️ **Guard "satu SP satu invoice" punya TIGA penegak, bukan dua** — ditemukan saat Den mengoreksi PLAN semula: `sp_invoice_readiness()` dan `sp_invoice_readiness_all()` adalah guard APLIKASI, tapi ada penegak KETIGA di level index yang independen dari keduanya:

| | Sebelum (butir 40) | Sesudah (butir 40) |
|---|---|---|
| `sp_invoice_one_per_sp` (UNIQUE INDEX partial, lahir `20260923000001`, `schema_snapshot.sql:13701`) | `ON public.sp_invoices USING btree (sp_order_id) WHERE (status <> 'void'::text)` | `ON public.sp_invoices USING btree (sp_order_id) WHERE (status NOT IN ('draft', 'void'))` |

Tanpa perubahan index ini, guard aplikasi akan **mengizinkan** pengajuan ulang untuk SP yang invoice-nya ditolak, tapi `INSERT` baris baru akan **gagal di index ini** (index masih menganggap baris `draft` menempati slot `sp_order_id` itu) — guard yang longgar bertemu index yang masih ketat, hasilnya error yang membingungkan di detik terakhir. Ketiganya (`sp_invoice_readiness`, `sp_invoice_readiness_all`, index ini) disunting DALAM SATU berkas (40) supaya tidak bisa bergerak terpisah.

⚠️ **Tanggal jurnal TIDAK ikut pindah ke tanggal approve.** `post_invoice_journal` (`20260928000003_invoice_issue_v2.sql:349-403`) membaca `entry_date` dari `invoice_journal_projection(p_invoice_id)` (berkas sama, `:92-227`), dan fungsi itu SELALU mengisi `entry_date := dn.signed_date` (baris `:142/:147/:205/:212/:220/:226`, dari `delivery_notes.signed_date`) — nol referensi ke `now()`/`CURRENT_DATE`/waktu approve di kedua fungsi, diverifikasi dengan membaca badannya. Memanggil `post_invoice_journal` lebih lambat (saat `approve_invoice_issue`, bukan saat `create_invoice_for_sp`) tidak mengubah satu pun tanggal jurnal yang dihasilkan.

⚠️ **`is_manager_or_above()` pada `create_invoice_for_sp`/`submit_invoice`/`mark_ttf_received` SENGAJA TIDAK dipersempit** — meloloskan seluruh role ber-`level<=6` lintas departemen adalah perilaku LAMA (sejak `20260817000001`), bukan lahir di batch ini; instruksi Den eksplisit: jangan disentuh di PLAN ini. Dicatat **TD-297** (`08_TECH_DEBT.md`) — perlu keputusan Den siapa saja yang seharusnya boleh, sebelum dipersempit.

**Dampak ke data production saat launching (dilaporkan sesuai instruksi Den):** keenam berkas ini **100% ADITIF terhadap perilaku invoice yang sudah `issued`/`submitted`/`partial`/`paid`** — status baru `pending_approval` hanya bisa lahir dari PEMANGGILAN BARU `create_invoice_for_sp` (butir 40) sesudah berkas ini live; **invoice yang sudah terbit SEBELUM migrasi ini tetap `issued` apa adanya, TIDAK tersentuh, TIDAK berubah status**, karena tidak ada UPDATE massal di berkas mana pun — seluruhnya `ALTER TABLE`/`CREATE OR REPLACE FUNCTION`/`CREATE INDEX`. Nol baris `sp_invoices` diubah oleh proses migrasi itu sendiri.

## 39. ⛔ `20260930000001_ar_tahap3b_status_pending_approval` — WAJIB (AR Tahap 3 bagian kedua, PERTAMA)

| | |
|---|---|
| Berkas | `supabase/migrations/20260930000001_ar_tahap3b_status_pending_approval.sql` |
| Staging | ✔ **30 Sep** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan PERTAMA** dari batch ini |

**Apa isinya.** 100% ADITIF: `sp_invoices_status_check` diperluas dengan `pending_approval`; lima kolom baru `approved_by`/`approved_at`/`rejected_by`/`rejected_at`/`rejection_note` (semua nullable, tanpa FK — pola sama `created_by`). Nol fungsi disentuh, nol baris data diubah.

**Rollback.** Ada di ekor berkas — aman HANYA sebelum butir 40 jalan (sesudahnya bisa ada baris `pending_approval` hidup yang akan gagal masuk constraint lama).

---

## 40. ⛔ `20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate` — WAJIB, sesudah butir 39

| | |
|---|---|
| Berkas | `supabase/migrations/20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate.sql` |
| Staging | ✔ **30 Sep** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 39** |

**Apa isinya.** Tiga objek, harus bergerak bersama (lihat tabel index di pengantar bagian ini): `sp_invoice_readiness()` guard #1 (`status <> 'void'` → `status NOT IN ('draft', 'void')`), `sp_invoice_readiness_all()` CTE kandidat (syarat yang sama), dan index `sp_invoice_one_per_sp` (predikat yang sama). Plus `create_invoice_for_sp` dipotong jadi tahap PENGAJUAN saja — dicabut: penomoran (`increment_document_sequence`, susun `v_invoice_no`), `PERFORM post_invoice_journal`, `PERFORM sp_recompute_status`; INSERT header memakai `status='pending_approval'`, `invoice_no` tidak diisi; ditambah `INSERT INTO audit_logs` aksi `AJUKAN_INVOICE`. Guard peran ditambah `has_role('finance')`.

**Basis `create_invoice_for_sp`:** `20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql` (versi TERAKHIR yang hidup di staging). **Diff diverifikasi MEKANIS** (`diff`) — hanya menyentuh: deklarasi 5 variabel penomoran dicabut, satu baris guard peran, satu baris `v_year` dicabut, blok penomoran 7 baris dicabut, kolom `invoice_no` dicabut dari INSERT + nilai status `'issued'`→`'pending_approval'`, dan ekor fungsi (`PERFORM post_invoice_journal`+`PERFORM sp_recompute_status`) diganti `INSERT INTO audit_logs`. Segala sesuatu yang lain (readiness check, rantai termin, hitung `invoice_date`, `tax_id`, baris item, baris ongkir, hitung total) byte-identik.

**V-PRA menolak jalan** kalau `create_invoice_for_sp` yang hidup bukan versi `20260929000008` (dicek: memanggil `post_invoice_journal` langsung, belum menyebut `pending_approval`). **V-POST** memastikan `create_invoice_for_sp` tidak lagi memanggil `post_invoice_journal`/`sp_recompute_status`, meng-INSERT `pending_approval`, memuat `has_role('finance')` dan `AJUKAN_INVOICE`; ACL ketiga fungsi + index `sp_invoice_one_per_sp` diverifikasi.

**Rollback.** Ada di ekor berkas — kembalikan ketiga fungsi + index ke bentuk `20260929000008`/`20260927000003`/`20260923000001`. Aman hanya kalau belum ada baris `pending_approval` hidup.

---

## 41. ⛔ `20260930000003_ar_tahap3b_approve_reject_invoice` — WAJIB, sesudah butir 39, 40

| | |
|---|---|
| Berkas | `supabase/migrations/20260930000003_ar_tahap3b_approve_reject_invoice.sql` |
| Staging | ✔ **30 Sep** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 39 dan 40** |

**Apa isinya.** Dua fungsi BARU. `approve_invoice_issue(uuid)`: mengunci baris (`FOR UPDATE`), menolak kalau bukan `pending_approval`, menolak kalau `created_by = auth.uid()` KECUALI `super_admin` (jawaban Den atas pertanyaan PLAN), lalu memindahkan VERBATIM blok penomoran yang dicabut dari `create_invoice_for_sp` di butir 40, `UPDATE ... SET invoice_no=..., status='issued', approved_by, approved_at`, `PERFORM post_invoice_journal`, `PERFORM sp_recompute_status`, `INSERT INTO audit_logs` aksi `SETUJUI_INVOICE`. `reject_invoice_issue(uuid, text)`: guard sama (termasuk larangan menolak pengajuan sendiri), catatan penolakan wajib, `UPDATE ... SET status='draft', rejected_by, rejected_at, rejection_note`, `INSERT INTO audit_logs` aksi `TOLAK_INVOICE`.

Guard peran **SENGAJA TANPA `is_manager_or_above()`** — hanya `super_admin`/`finance_controller`/`ceo`, sesuai keputusan rapat 9/11/24 Sep 2026 (penyetuju = finance_controller, pengganti = Finance Controller lain atau CEO).

**V-POST** memastikan kedua fungsi ada dan ACL `authenticated`-only.

**Rollback.** `DROP FUNCTION` keduanya — aman hanya kalau nol baris `pending_approval` hidup butuh jalur ini.

---

## 42. ⛔ `20260930000004_ar_tahap3b_record_payment_ttf_pending_guard` — WAJIB, sesudah butir 39

| | |
|---|---|
| Berkas | `supabase/migrations/20260930000004_ar_tahap3b_record_payment_ttf_pending_guard.sql` |
| Staging | ✔ **30 Sep** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan, sesudah butir 39** |

**Apa isinya.** Dua fungsi, masing-masing untuk dua alasan yang harus mendarat bersama. `record_payment` (basis `20260929000007`, v3, signature TIDAK berubah): guard status ditambah cabang `pending_approval`; guard peran ditambah `has_role('finance')` (keputusan rapat 24 Sep 2026). `mark_ttf_received` (basis `20260929000010`, TERAKHIR): guard status + `pending_approval`; guard peran + `has_role('finance')`; **jejak koreksi TTF** — `audit_logs` aksi `KOREKSI_TTF` diisi HANYA di cabang UPDATE (bukan INSERT pertama) dan HANYA kalau `tanggal_ttf`/`no_ttf`/`diterima_oleh`/`notes` sungguh berubah dari nilai sebelumnya (menutup catatan terbuka di butir 38: "jejak koreksi TTF tidak dicatat di mana pun").

⛔ **`is_manager_or_above()` pada `mark_ttf_received` TIDAK disentuh** — lihat TD-297.

**Kedua diff diverifikasi MEKANIS.** `record_payment`: `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION` (signature sama, kata kunci saja), satu baris guard peran, tiga baris guard status baru — selebihnya byte-identik. `mark_ttf_received`: tiga variabel deklarasi baru (nilai lama no_ttf/diterima_oleh/notes) + dua variabel nilai baru, satu baris guard peran, tiga baris guard status baru, SELECT "sebelum" diperluas 2→5 kolom, dan blok `IF ... THEN INSERT INTO audit_logs ... END IF;` baru di cabang UPDATE — cabang INSERT dan blok hitung `due_date` tidak tersentuh.

**V-PRA** menolak jalan kalau salah satu fungsi bukan basis yang diharapkan atau sudah menyebut `pending_approval` (migrasi sudah pernah jalan). **V-POST** memastikan kedua guard status+peran ada, `KOREKSI_TTF` ada, pola lama "menimpa `tanggal_menerima`" TIDAK kembali, dan ACL keduanya `authenticated`-only.

**Rollback.** Tempel ulang badan dari `20260929000007`/`20260929000010`, REVOKE/GRANT ulang.

---

## 43. ⛔ `20260930000005_ar_tahap3b_submit_invoice_finance_role` — WAJIB, mandiri

| | |
|---|---|
| Berkas | `supabase/migrations/20260930000005_ar_tahap3b_submit_invoice_finance_role.sql` |
| Staging | ✔ **30 Sep** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** — nol dependensi terhadap butir 39-42 |

**Apa isinya.** Satu baris berubah: guard peran `submit_invoice` ditambah `has_role('finance')`. Guard status TIDAK disentuh — sudah gaya allowlist (`status <> 'issued'`), otomatis menolak `pending_approval` tanpa perubahan.

**Basis:** `20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql`. **Diff diverifikasi MEKANIS: HANYA satu baris** (penambahan `OR has_role('finance')`).

**Rollback.** Tempel ulang badan dari `20260929000008`, REVOKE/GRANT ulang.

---

## 44. ⛔ `20260930000006_ar_tahap3b_get_invoice_audit_trail` — WAJIB, mandiri

| | |
|---|---|
| Berkas | `supabase/migrations/20260930000006_ar_tahap3b_get_invoice_audit_trail.sql` |
| Staging | ✔ **30 Sep** |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan** (perlu berjalan sebelum panel Riwayat FE bisa memuat data apa pun, tapi tidak bergantung ke butir lain di batch ini) |

**Apa isinya.** RPC BARU `get_invoice_audit_trail(uuid)`, `SECURITY DEFINER`, gerbang `invoice_dapat_dibaca()` (sudah ada sejak `20260928000007`). Melayani panel Riwayat Detail Invoice: gabungan baris `audit_logs` `entity_type='sp_invoices'` (AJUKAN/SETUJUI/TOLAK dari butir 40/41) dan `entity_type='ar_ttfs'` milik invoice itu (KOREKSI_TTF dari butir 42), satu urutan waktu.

⛔ **Perlu ada karena `audit_logs_read` (RLS) dibatasi `is_admin_or_above()`** (`role.code IN ('super_admin','admin')`, diverifikasi ke definisi fungsi) — finance dan finance_controller BUKAN admin, jadi tidak bisa membaca `audit_logs` langsung lewat PostgREST. Tanpa RPC ini, panel Riwayat yang diminta TASK 1 dan TASK 3 akan kosong PERSIS untuk orang yang paling butuh melihatnya.

**Rollback.** `DROP FUNCTION` — aman kapan pun, baca-saja.

---

## Paket Keamanan TD-281 — ✅ H1-H6 SELESAI (sisa H4 sengaja ikut Fase 4 BNF)

| | |
|---|---|
| Sumber | **TD-281** (`08_TECH_DEBT.md`) |
| Berkas migrasi | **H5 lapis 1 & 2 ✅ LIVE staging DAN production 30 Sep 2026** — butir **45** (`20260930000007_td281_h5_lapis1_revoke_trtm_existing`) & **46** (`20260930000008_td281_h5_lapis2_anon_business_tables`, dijalankan dengan koreksi PUBLIC-grant, lihat §H5). **H6 ✅ SELESAI 30 Sep 2026** — `README.md` + `docs/security/security-baseline.md` ditulis ulang (lihat §H6). H4 sisa (`get_linked_bnf_status`) sengaja ikut Fase 4 BNF, bukan pekerjaan tertunda paket ini |
| Status | ✅ **H1/H2/H3/H5/H6 SELESAI di production DAN staging.** H4 invoice-bagian ✅ tertutup 30 Sep (efek samping butir 9). Sisa H4 `get_linked_bnf_status` sengaja ikut Fase 4 BNF — bukan bagian syarat launching paket ini lagi. H6 menemukan **TD-301** (HIGH, user nonaktif bisa login — ditangani darurat production) dan **TD-302** (LOW, MFA belum ditegakkan); keduanya tetap OPEN sebagai TD tersendiri, di luar cakupan H1-H6 |
| Sifat | H5 (butir 45-46) **SUDAH dijalankan** sebagai pengerasan mandiri SEBELUM launching (keputusan Den 30 Sep 2026). H6 **SUDAH dikerjakan** sesudah H5 live, sesuai rencana, supaya klaimnya mencerminkan keadaan yang sungguh tercapai — bukan lagi syarat terbuka |

**Kenapa satu paket, bukan tiga pekerjaan terpisah.** Ketiganya menutup **satu kelas** yang sama: hal yang bisa dipanggil atau ditulis dari internet dengan anon key. Menyelesaikan sebagian saja meninggalkan pintu yang lain terbuka sambil membuat dokumen terbaca seolah keamanannya sudah beres — dan itu lebih berbahaya daripada tidak mengerjakannya sama sekali, karena yang membaca berikutnya akan berhenti memeriksa.

### H4 — permukaan panggil yang masih PUBLIC EXECUTE

**Tiga penerbit invoice di production:** `create_invoice` dan `create_invoice_for_sp` (`proacl NULL` = **PUBLIC EXECUTE**) dan `submit_invoice` (`=X/postgres` = PUBLIC). Staging sudah mengetatkannya lewat `20260926000002`, jadi `env-drift-check` melaporkannya sebagai **ANTRE** — ⚠️ dan **"ANTRE" berarti *sudah diperbaiki di staging*, BUKAN *tidak berbahaya di produksi*.** Arah longgarnya ada di produksi.

✅ **[30 Sep 2026] Bagian INVOICE dari H4 TERTUTUP sebagai efek samping antrean butir 9** (`20260926000002_ar_single_issue_path.sql:535-542`, sudah berisi `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` untuk ketiga fungsi ini) — bukan karena PLAN AR Tahap 3 bagian kedua (butir 39-44) melakukan sesuatu yang baru untuk H4, melainkan karena ketiga fungsi itu memang sudah dibenahi ACL-nya sejak butir 9 ditulis, dan PLAN AR Tahap 3 bagian kedua mengasersi ulang ACL itu secara defensif di setiap `CREATE OR REPLACE` yang menyentuhnya (butir 40, 43). Menjalankan butir 9 ke production (prasyarat wajib bagi butir 39-44 apa pun) dengan sendirinya menutup baris "tiga penerbit invoice" di paragraf ini. **BUKAN berarti H4 selesai** — sisanya (`get_linked_bnf_status`, paragraf di bawah) TIDAK tersentuh, dan H5 + H6 **tidak disinggung sama sekali oleh batch invoice mana pun** *(H5 kemudian tertutup SENDIRI lewat butir 45-46 30 Sep 2026 — lihat §H5 — TIDAK ada hubungannya dengan batch invoice ini; H6 tetap terbuka)*.

⛔ **`get_linked_bnf_status(uuid)` — dan ini BUKAN sekadar soal ACL.** Ia PUBLIC EXECUTE, tapi guard di dalamnya juga **gagal untuk `anon`** lewat logika tiga nilai: `IF v_created_by != auth.uid() AND NOT is_bnf_authorized()` — untuk `anon`, `auth.uid()` NULL, maka `v_created_by != NULL` → **NULL**, `NULL AND true` → **NULL**, dan `IF NULL` **tidak diambil**, sehingga eksekusi jatuh terus dan **mengembalikan status**. `SECURITY DEFINER` mem-bypass RLS.
>> **`REVOKE` saja menutup pintunya sambil membiarkan logikanya tetap keliru** untuk setiap pemanggil ber-`auth.uid()` NULL. **Keduanya wajib diperbaiki bersama**, dan itulah sebabnya fungsi ini masuk H4 alih-alih jadi pekerjaan ACL biasa.

✅ **[30 Sep 2026, keputusan Den] Sisa H4 (`get_linked_bnf_status`) SENGAJA TIDAK direncanakan terpisah di sini — ia ikut Fase 4 (penghapusan total BNF-family, Fase 0 §2a Batch FS).** BNF-family (modul BNF/Briefing Harian/Meeting Mingguan) akan dihapus TOTAL — kode DAN data — bukan digabung/diperbaiki; begitu Fase 4 berjalan, `get_linked_bnf_status` beserta seluruh fungsi/tabel/EF BNF lenyap sekaligus, dan pertanyaan "REVOKE dulu atau perbaiki guard dulu" jadi tidak relevan. **Paparannya TETAP hidup di production sampai Fase 4 berjalan** — ini bukan penutupan, murni keputusan untuk tidak menambal sesuatu yang akan dibongkar seluruhnya. Jangan buat migrasi ACL/guard terpisah untuk fungsi ini sebelum Fase 4 diputuskan jadwalnya.

### H5 — hak TABEL yang SUDAH ADA

`TRUNCATE`, `TRIGGER`, `REFERENCES`, `MAINTAIN` untuk `anon` **dan** `authenticated` pada tabel `public` yang sudah terlanjur ada (TD-230: `authenticated` menyeluruh, `anon` 111 dari 139 — angka lama, lihat pengukuran ulang di bawah), **ditambah DML `anon` di 11 tabel** (TD-24). ⛔ **H2 TIDAK menyentuh satu pun dari ini** — `ALTER DEFAULT PRIVILEGES` **tidak retroaktif**, ia hanya menghentikan tabel **baru**.

⭐ **Inilah kelas yang membuat seluruh audit RLS sebelumnya memeriksa lapis yang salah:** *`TRUNCATE` tidak tunduk RLS*, jadi policy seketat apa pun tidak relevan terhadapnya. Yang menahannya hari ini hanyalah **PostgREST tidak mengekspos TRUNCATE** — itu sifat perkakas, bukan izin yang kita atur.

✅✅ **[30 Sep 2026] LIVE STAGING DAN PRODUCTION — butir 45 (lapis 1) & 46 (lapis 2), HARI YANG SAMA.** Blast radius diukur lebih dulu (bukan ditebak, menjawab peringatan gotcha #26 di bawah): `git grep` `src/` di `develop` **dan** `main` untuk `.from('table').insert/update/upsert/delete(` (74 tabel ditemukan, IDENTIK di kedua branch — nol tabel yang "sudah pindah RPC di develop tapi belum di main"); tiga Edge Function yang menulis tabel langsung (`aging-pipeline`, `create-user`, `delete-user`) semuanya memakai `SUPABASE_SERVICE_ROLE_KEY`, bukan JWT pemanggil; `manage-schema` menjalankan DDL-nya lewat `exec_sql` dengan service role key juga — nol jalur yang bergantung pada hak `anon`/`authenticated` di tabel. Log Edge production 23-30 Sep (~80rb permintaan `/rest/v1`+`/graphql`): nol permintaan ber-anon-key dari luar `nexus.msigroup.co.id`. **Seluruh palang V-PRA dan V-POST kedua berkas LOLOS di kedua lingkungan.**

**Angka SEBELUM/SESUDAH yang SUNGGUH terjadi (bukan lagi perkiraan pra-eksekusi):**
- **Production SEBELUM:** `anon` T-R-T-M di **113** objek; `authenticated` T-R-T-M di **142** objek (termasuk view `stock_summary`); `anon` SELECT/INSERT/UPDATE/DELETE tepat di **11 tabel TD-24** (daftar sama persis dengan pengukuran 2 Sep). Tabel tanpa RLS: `code_counters`, `customers_backup_20260614` (keduanya cuma T-R-T-M, tanpa SELECT — tidak eksploitatif). 24 tabel backup ber-RLS tanpa policy (terkunci total, wajar).
- **Staging SEBELUM:** `anon` T-R-T-M di **114** objek; `authenticated` di **142** objek. ⭐ **View `stock_summary` di staging JUGA membawa T-R-T-M untuk `anon`** — bukti empiris bahwa `REVOKE ... ON ALL TABLES IN SCHEMA public` menyentuh VIEW, bukan cuma tabel biasa. Karena itu snapshot SEBELUM/V-POST kedua berkas mencakup `relkind IN ('r','p','v','m')`, bukan `('r','p')` saja — koreksi Den atas draft rencana semula.
- **SESUDAH, KEDUA lingkungan:** `anon` T-R-T-M **0**, `authenticated` T-R-T-M **0**; `service_role` tetap utuh (153 tabel production, 146 staging) — diverifikasi eksplisit oleh V-POST, bukan diasumsikan.
- **Diuji langsung di production (transaksi dibatalkan, tanpa mengubah data):** `authenticated` tetap bisa membaca `prf` dan `sp_orders` serta memanggil `storbit_sp_customers`; `TRUNCATE` **ditolak** untuk `anon` **dan** `authenticated`; `anon` **ditolak** membaca `prf` dan memanggil RPC.
- **Butir 45 (lapis 1)** menutup T-R-T-M untuk `anon`+`authenticated` di SELURUH tabel/view/matview sekaligus (mencakup TD-230 penuh, dan otomatis mencakup 3 tabel finding (a) TD-281 tanpa daftar terpisah). **Butir 46 (lapis 2)** menutup 11 tabel TD-24 + EXECUTE `anon` pada `indomarco_dashboard_stats`/`storbit_sp_customers`. `service_role` **sengaja TIDAK dicabut** di keduanya — keputusan SAMA dengan H2, ditegaskan ulang 30 Sep 2026.
- ⛔⛔ **KOREKSI ditemukan lewat eksekusi sungguhan di staging, bukan ditalar sebelumnya: draft awal butir 46 hanya `REVOKE EXECUTE ... FROM anon` pada kedua RPC, dan V-POST-nya GAGAL DENGAN BENAR.** Kedua RPC ternyata JUGA punya grant `PUBLIC` eksplisit (`=X/postgres`), TERPISAH dari grant `anon` — mencabut dari `anon` saja menyisakan `PUBLIC` utuh, dan `PUBLIC` mencakup `anon` juga. **Dijalankan dengan versi yang sudah dibetulkan:** di dalam loop, `GRANT EXECUTE ... TO authenticated` LEBIH DULU (pola H1), baru `REVOKE EXECUTE ... FROM PUBLIC, anon` SEKALIGUS. Berkas `20260930000008` di repo sudah versi yang dijalankan ini. **+gotcha #45** (`03_DATA_MODEL.md`): REVOKE dari `anon` tidak menghapus grant `PUBLIC` — cek pola `=X` di `proacl` sebelum menyimpulkan sebuah fungsi tertutup.
- ⛔ **`sp_invoices`/`sp_invoice_lines` yang di produksi masih ber-INSERT/UPDATE/DELETE untuk `authenticated` sementara staging sudah mencabutnya BUKAN bagian butir 45/46.** Itu sudah tertutup oleh `20260928000004_invoice_write_lockdown` (**butir 19**, antrean AR Tahap 2) — begitu butir 19 naik ke production saat launching, baris ini otomatis tertutup, **pola sama persis** dengan bagian invoice H4 yang tertutup sebagai efek samping butir 9. **Jangan tulis migrasi terpisah yang menduplikasi REVOKE ini** — akan menabrak `CREATE OR REPLACE`/REVOKE yang sudah ada di berkas butir 19.
- ⚠️ **Arah eksekusi BERBEDA dari H1-H3 dan dari kebanyakan butir lain di dokumen ini:** T-R-T-M `authenticated` seragam di KEDUA lingkungan (bukan "staging duluan, production menyusul") — karena itu `env-drift-check` **tidak pernah melaporkannya sebagai drift** (nilainya sama di kedua sisi). Dijalankan: **staging dan production di HARI YANG SAMA**, sebagai pengerasan mandiri, **SEBELUM launching**, tidak menunggu fitur `develop` (keputusan Den 30 Sep 2026).
- ⚠️ **Group D (di luar cakupan butir 45/46, DI LUAR syarat launching):** hak DML `authenticated` pada ~65 tabel `public` di luar 74 yang ditulis langsung dari `src/` — kandidat "harusnya RPC-only" tapi WAJIB ditinjau satu-per-satu (beda dari T-R-T-M yang aman disapu sekaligus, DML bisa punya jalur legitimate lewat RLS yang belum terukur). Pekerjaan terpisah pasca-launching.
- ⚠️ **Group E (BARU, PLAN saja, BELUM ditulis migrasinya — TD-300):** cabut EXECUTE `anon`+`PUBLIC` dari 99 fungsi `public` yang masih anon/PUBLIC-executable di production (98 di staging) — 28 trigger, 33 SECURITY DEFINER non-trigger (badan BELUM dibaca satu-per-satu), sisanya SECURITY INVOKER. WAJIB disertai `ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS` (belum ada di mana pun — beda dari H2 yang hanya `ON TABLES`) supaya fungsi baru tidak lahir PUBLIC-executable lagi. Rancangan lengkap: `08_TECH_DEBT.md` TD-300.

⚠️ **Pengetatan di sini WAJIB diukur blast radius-nya lebih dulu.** `REFERENCES` dan `TRIGGER` bisa dipakai jalur yang sah; mencabutnya buta akan mematahkan sesuatu yang belum terdaftar — kelas pelajaran `20260821000004` (gotcha #26). **Sudah dipenuhi untuk butir 45/46** — lihat pengukuran blast radius di atas.

### H6 — koreksi README bagian Security

Klaim keamanannya belum diselaraskan dengan keadaan hari ini. Dokumentasi yang mengklaim lebih dari yang benar **bukan sekadar tidak rapi**: ia membuat peninjau berikutnya berhenti memeriksa.

✅ **[30 Sep 2026] SELESAI.** Audit baris-per-baris `README.md` §Security Requirements dan seluruh `docs/security/security-baseline.md` (status BENAR/SALAH/SEBAGIAN/BELUM BISA DIVERIFIKASI per klaim) dijalankan SESUDAH H5 live production — supaya teks yang ditulis mencerminkan keadaan yang sungguh tercapai, bukan janji. Kedua dokumen ditulis ulang jadi **ringkasan status + rujukan nomor TD** (bukan lagi klaim rinci) — keputusan disengaja karena repo **PUBLIK** sampai Vercel di-upgrade ke paid (dikonfirmasi 30 Sep 2026: `git clone` tanpa kredensial berhasil; koreksi atas catatan lama `CLAUDE.md` yang mengira repo sudah private sejak 26 Agu 2026). Rincian teknis (daftar 19 tabel `USING(true)` TD-173, nama fungsi Group E, dll) SENGAJA tidak disalin ke dua dokumen publik itu — tetap tinggal di `docs/Governance/` (yang juga publik, tapi bukan pintu depan proyek). **+TD-301** (HIGH — user nonaktif tetap bisa login lewat sesi Supabase Auth yang tidak pernah diputus; ditemukan DAN ditangani darurat di production hari yang sama, perbaikan permanen belum ada) **+TD-302** (LOW — MFA belum ditegakkan, cuma kolom+toggle, belum dijadwalkan). Env var salah nama (`VITE_SUPABASE_ANON_KEY` di `README.md`/`.env.example`, kode baca `VITE_SUPABASE_KEY`) ikut dibetulkan sebagai temuan sampingan H6. **DENGAN INI PAKET H1-H6 TD-281 SELESAI** — lihat `08_TECH_DEBT.md` TD-281 untuk status akhir lengkap.

### Yang SUDAH tertutup (jangan dikerjakan ulang)

**H1 lapis 1** (butir 27) · **H1 lapis 2** + perbaikan `check_similar_accounts` (butir 28 & 29) · **H2** (butir 30) · **H3** (butir 31) — **keempatnya LIVE di production DAN staging 28 Sep 2026**, masing-masing dengan gerbangnya sendiri. **H5 lapis 1** (butir 45) · **H5 lapis 2** (butir 46) — **keduanya LIVE di production DAN staging 30 Sep 2026**, dijalankan sebagai pengerasan mandiri sebelum launching. **H6** (koreksi `README.md` §Security Requirements + `docs/security/security-baseline.md`) — **✅ SELESAI 30 Sep 2026**, dokumentasi saja, nol migrasi.

⭐ **Peta lapisnya, supaya sisa pekerjaannya tidak salah ditaksir:** H1 + H3 menutup **permukaan panggil fungsi** dan **resolusi nama di dalamnya**; H2 menutup **pabrik tabel baru**; **H5 menutup hak tabel yang sudah terlanjur ada** (TD-230 + TD-24) — bagian yang paling luas, sekarang sudah tertutup; **H6 menutup klaim dokumentasi publik** yang tertinggal dari keadaan sungguhan, dan audit yang dilakukan untuk menulisnya menemukan dua tech debt baru di luar cakupan paket ini (**TD-301** HIGH, **TD-302** LOW). **Yang BELUM tersentuh:** H4 sisa (`get_linked_bnf_status`, sengaja ikut Fase 4 BNF, bukan dikerjakan terpisah) · Group D (DML `authenticated` di ~65 tabel RPC-only lain, di luar syarat launching) · Group E (EXECUTE `anon`/PUBLIC di 99 fungsi lain, baru sebatas PLAN — TD-300). **Dengan H1-H3+H5+H6 tertutup, paket TD-281 tidak lagi jadi pemblokir launching** — sisanya (H4 residual, Group D/E) sengaja di luar cakupan.

---

## Cara merawat dokumen ini

1. **Setiap SQL manual di staging masuk ke sini**, di hari yang sama. Perubahan tanpa berkas migrasi adalah perubahan yang paling mudah hilang.
2. Butir yang sudah dijalankan di produksi **jangan dihapus** — ubah kolom Production jadi ✔ beserta tanggalnya. Dokumen ini juga jejak.
3. Catat arahnya. Ada butir yang produksinya lebih dulu; menganggap semuanya "staging → production" akan melahirkan eksekusi ganda.
4. Angka dan keadaan di sini **diukur**, bukan disalin dari laporan. Kalau tidak bisa diukur, tulis apa adanya sebagai laporan.
