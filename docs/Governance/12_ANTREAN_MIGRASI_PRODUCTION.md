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
>
> ⏰ **[Klarifikasi 7 Okt 2026] Rencana rilis gabungan "15 Oktober 2026" (AR Tahap 1-3b + Batch Finance AR) punya DUA tanggal, jangan tertukar:** jendela **EKSEKUSI** SQL/deploy = **malam 14 Okt 2026** (sesudah jam kerja); **EFEKTIF** dipakai Finance = **pagi 15 Okt 2026**. "15 Oktober" di seluruh dokumen (`CLAUDE.md`, `PROGRESS.md`) merujuk tanggal EFEKTIF, bukan jendela eksekusi.
>
> ⛔ **Koreksi 13 Okt 2026: kedua tanggal di atas (14 dan 15 Oktober) MUNDUR ke awal November 2026, tanggal pasti menyusul** — keputusan Den, lihat §Naskah Eksekusi Malam Rilis dan §Persiapan H-1 di bawah untuk detail lengkap. Pola "jendela eksekusi malam vs efektif pagi besoknya" TETAP berlaku, hanya tanggalnya yang berubah.
>
> 👉 **Naskah urut siap pakai untuk malam eksekusi itu: §Naskah Eksekusi Malam Rilis — 14 Oktober 2026**, di bagian akhir dokumen ini (sesudah §Koreksi Data dan Akses Manual) — berisi **§Persiapan H-1** (pratinjau read-only sehari sebelumnya, boleh dijalankan hari ini — termasuk H-1.0 cek akun penyetuju invoice — ~~per 7 Okt 2026 BELUM ADA `finance_controller` aktif di production~~ **[✅ TERPENUHI 9 Okt 2026, lihat H-1.0 & §Koreksi Data dan Akses Manual]**), urutan lengkap Langkah 0-5 (termasuk pembekuan input Finance/Gudang di 0.6, dan smoke test non-Finance di Langkah 4.5-4.8), tabel migrasi yang TIDAK aman untuk kode lama (Langkah 2), **§Kriteria batal dan titik tanpa jalan mundur** (titik baliknya = commit butir 9), titik berhenti wajib di butir 37, dan penegasan TD-300 Group E di luar jendela ini.
>
> 👉 **Naskah terpisah untuk rilis Lead Management (TD-318 Paket 1+2): §Runbook Rilis Lead Management (TD-318 Paket 1+2) — awal November 2026**, ditulis 17 Okt 2026 (sesudah §Paket 2 Lead Pool, sebelum §Cara merawat dokumen ini) — cakupan butir 47-64, malam EKSEKUSI terpisah dari naskah AR di atas (rekomendasi Den: AR dulu, Lead Management beberapa hari sesudahnya).

---

## Ringkasan

| # | Perubahan | Staging | Production | Tindakan saat launching |
|---|---|---|---|---|
| 1 | `20260917000001_delivery_signed_date` | ✔ 24 Sep | ✔ 17 Sep | **nol** — referensi |
| 2 | Parity AR Tahap 0 + seed COA SOA | ✔ 24 Sep | ✔ (rekonsiliasi AR) | **nol** — referensi |
| 2b | `20260918000001_set_sql_on_quotation_sent` — **DITEMUKAN hilang dari tabel ini saat audit kesiapan launching (koreksi review Vir, 17 Okt 2026)**, walau sudah tercatat LIVE di `PROGRESS.md`/`08_TECH_DEBT.md` TD-310 | ✔ LIVE (trigger sudah dipakai di tabel `quotations` sejak staging dibangun) | ✔ **LIVE sejak 18 Sep 2026** — fungsi `set_sql_on_quotation_sent` terkonfirmasi ADA di production (Vir, 17 Okt 2026) | — **nol** — **SUDAH LIVE produksi; JANGAN dijalankan ulang saat checklist migrasi hari-H** |
| 3 | `crm_rate_list` → katalog modul `procurement` | ✔ 24 Sep | ✔ **2 Okt** | — **selesai** |
| 3b | `20261002000002_td300_default_privileges_revoke_execute` — **DITEMUKAN hilang dari tabel ini saat audit kesiapan launching (koreksi review Vir, 17 Okt 2026)**, walau sudah tercatat LIVE di `PROGRESS.md`/`CLAUDE.md` §Aturan Wajib | ✔ LIVE 2 Okt 2026 | ✔ **LIVE sejak 2 Okt 2026** — default ACL fungsi untuk role `postgres` di production terkonfirmasi `{postgres=X/postgres}` (PUBLIC sudah tercabut, Vir 17 Okt 2026) | — **nol** — **SUDAH LIVE produksi DAN staging; JANGAN dijalankan ulang saat checklist migrasi hari-H** |
| 4 | Cabut 4 izin `bd_sales_executive` | ✔ 24 Sep | ⏸ belum | ⏸ **menunggu keputusan** |
| 5 | `20260924000001` + `20260924000002` (katalog menu) | ⛔ belum | ⛔ belum | opsional, lihat butir 5 |
| 6 | `20260925000001_dni_sp_order_item_link` | ✔ 25 Sep | ✔ **2 Okt** | — **selesai** |
| 7 | `20260925000002_sp_order_items_legacy_unique` | ✔ 25 Sep | ✔ **2 Okt** | — **selesai** |
| 8 | `20260926000001_set_delivery_signed_date` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 1 |
| 9 | `20260926000002_ar_single_issue_path` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 1, TERAKHIR |
| 10 | `20260925000003` — `notify_sp_milestone` no-op | ✔ 25 Sep | — **tidak boleh** | ⛔ **JANGAN dijalankan** — arah terbalik, staging saja |
| 11 | `20260927000001_invoice_due_date_backfill` | ✔ 25 Sep (fixture) | ⛔ belum | ⛔ **WAJIB** — AR Tahap 2 |
| 12 | `20260927000002_account_role_mapping` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — AR Tahap 2, SEBELUM butir 13 |
| 13 | `20260927000003_journal_account_roles_and_readiness` | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB** — sesudah butir 9 DAN butir 12 |
| 14 | Grant menu `fin_invoice` (`20260927000004`) | ✔ 25 Sep | ⛔ belum | ⛔ **WAJIB, JALANKAN SEBELUM LANGKAH 4** — tanpa ini `finance_controller` terkunci TOTAL dari halaman Finance AR (bukan cuma "halaman baru super_admin-only") |
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
| 47 | `20261011000001_crm_lead_capture_fields` | ✔ 11 Okt | ⛔ belum | ⛔ **WAJIB** — Paket 2 Lead Pool, mandiri |
| 48 | `20261011000002_crm_lead_master_data_requests` | ✔ 11 Okt | ⛔ belum | ⛔ **WAJIB** — mandiri |
| 49 | `20261012000001_crm_lead_pool_schema` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB** — fondasi Paket 2 (file 1/4) |
| 50 | `20261012000002_crm_lead_pool_rpc` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB** — sesudah butir 49 |
| 51 | `20261012000003_crm_lead_pool_triggers` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB** — sesudah butir 49 |
| 52 | `20261012000004_crm_lead_pool_approval_roles` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB** — mandiri (lihat catatan DELETE §52) |
| 53 | `20261012000005_crm_lead_aging_threshold_policy` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB** — berpasangan dgn deploy EF `aging-pipeline` |
| 54 | `20261012000009_crm_lead_pool_legacy_cleanup` | ✔ **dijalankan 12 Okt 2026** (commit sungguhan, bukan dry-run; 7 akun pool staging, nol berpemilik aktif → nol baris `legacy_pool_exit` — lihat §54) | ⛔ belum | ⛔ **WAJIB, SEBELUM butir 55** — lihat §54 |
| 55 | `20261012000006_crm_lead_pool_notifications` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB, SESUDAH butir 54** |
| 55a | Migrasi baru (belum ditulis) — `lead_pool_assign` versi `(uuid, uuid, text DEFAULT NULL)` menggantikan versi 2-argumen; DROP overload lama di migrasi yang sama; ACL dipulihkan | ⛔ belum ditulis, rencana PLAN TD-318 (`08_TECH_DEBT.md`) | ⛔ belum | Dijalankan Den di staging di AWAL Irisan 2 TD-318 — lihat TD-318 untuk alasan lengkap |
| 56 | `20261012000007_crm_quotation_lock_on_closed_inquiry` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB** — didahului langkah manual backup, lihat §56 ("9a") |
| 57 | `20261012000008_crm_lead_pool_sweep_notify` | ✔ 12 Okt | ⛔ belum | ⛔ **WAJIB, TERAKHIR** dari rangkaian 11 berkas |
| 58 | Perubahan manual khusus STAGING (seed CRM dummy + reaktivasi akun uji) | ✔ 12 Okt (manual) | — **tidak boleh** | ⛔ **JANGAN dijalankan** — arah terbalik, staging saja |
| 59 | `20261016000001_accounts_contacts_updated_at_trigger` | ✔ **16 Okt** (via connector Vir) | ✔ **16 Okt** (via connector Vir) | — **selesai** — SUDAH LIVE produksi; lewati saat checklist migrasi hari-H, HANYA refresh `schema_snapshot.sql` yang perlu |
| 60 | `20261016000002_bd_digital_marketing_manager_role` | ✔ **16 Okt** (via connector Vir) | ✔ **16 Okt** (via connector Vir) | — **selesai** — SUDAH LIVE produksi; lewati saat checklist migrasi hari-H, HANYA refresh `schema_snapshot.sql` yang perlu |
| 61 | `20261016000003_crm_lead_capture_computed_sort_columns` | ✔ 16 Okt | ⛔ belum | ⛔ **WAJIB** — rilis November, SEBELUM ATAU BERSAMAAN kode naik ke `main` (TD-318 Irisan Sorting bergantung penuh) |
| 62 | `20261016000004_lead_pool_assign_reason` | ✔ 16 Okt (via SQL Editor Den) | ⛔ belum | ⛔ **WAJIB** — rilis November, SEBELUM ATAU BERSAMAAN kode `ReassignModal.jsx` (TD-318 Irisan 2) naik ke `main`. Memuat `DROP FUNCTION` — **wajib dijalankan Den via SQL Editor, bukan connector** |
| 63 | `20261017000001_lead_pool_assign_candidates` | ✔ 17 Okt | ⛔ belum | ⛔ **WAJIB** — rilis November, SEBELUM ATAU BERSAMAAN kode `ReassignModal.jsx` cabang `allUnassigned` (TD-318 Irisan 4) naik ke `main` |
| 64 | Data uji staging TD-318 Irisan 1-4 (16-17 Okt 2026) | ✔ 16-17 Okt (manual) | — **tidak boleh** | ⛔ **JANGAN dijalankan** — arah terbalik, staging saja, lihat §64 |
| 65 | `20261020000001_crm_option_requests_approve_note_and_notify` | ✔ **20 Okt 2026** (4 uji self-rollback lolos, dikonfirmasi Vir/Den) | ⛔ belum | ⛔ **WAJIB** — rilis November, SEBELUM ATAU BERSAMAAN kode `RequestNewOptionModal.jsx`/`OptionRequestsPage.jsx` (Irisan 5, branch `feat/inquiry-irisan-5`, BELUM merge) naik ke `main` — lihat §65 untuk blast radius yang melebar ke jalur "Request new option" Lead Management yang SUDAH ADA |

**Butir 47-58 = Paket 2 Lead Pool (Batch DS 3, Lead Management) — MUNDUR ke target awal November 2026 (keputusan Den 13 Okt 2026, syarat Fase 1+2 TD-318 selesai & lolos tes staging — lihat §Paket 2 Lead Pool), jalur TERPISAH dari rantai AR Storbit (butir 1-46) di atas.** Urutan mengikat, kedua Edge Function yang menyusul, dan konfigurasi aging pasca-rilis: **§Paket 2 Lead Pool (butir 47-57)** di bagian akhir dokumen ini, sesudah §Naskah Eksekusi Malam Rilis.

~~**Butir 3** memblokir launching.~~ **✅ SELESAI 2 Okt 2026 — lihat paragraf di bawah; butir 3 BUKAN LAGI pemblokir launching.** **Butir 6 dan 7 SELESAI di production 2 Okt 2026** (lihat seksinya masing-masing) — sisa **8 dan 9** dari rantai AR Tahap 1 masih **⛔ belum**, dengan **urutan yang MENGIKAT: 6 → 7 → 8 → 9** tetap berlaku untuk dua butir sisanya. **Butir 32 sampai 38 adalah AR Tahap 3, dan urutannya MENGIKAT: 32 → 33 → 34 → 35 → 36 → 37 (37 opsional/menunggu review) → 38** (rincian dependensi tiap butir: lihat seksinya masing-masing di bawah; butir 38 hanya butuh 36, tidak bergantung pada 37). Seed staging `scripts/seed/staging_ar_tahap3_potongan_pelanggan.sql` (peran `potongan_pelanggan` → akun 4-1900 SOA) **TIDAK masuk antrean ini** — ia staging-only by design, tidak pernah naik ke produksi (lihat butir 33).

✅ **Pemblokir launching PERTAMA: butir 3 (`crm_rate_list` → katalog modul `procurement`) — SELESAI 2 Okt 2026.** Dijalankan di production lewat Supabase MCP (bukan oleh doc-keeper, dan bukan lewat merge kode) — `UPDATE module_menus SET module_id = (modul procurement), sort_order = 8 WHERE key = 'crm_rate_list'`, pola `UPDATE module_id` sesuai langkah yang sudah ditulis di seksi 3 (bukan hapus-buat-ulang, 10 grant role yang menempel ke menu ini tidak ikut tersentuh). Direkam retroaktif sebagai `supabase/migrations/20261002000001_crm_rate_list_module_procurement.sql`. **Dengan ini, satu-satunya pemblokir launching yang TERSISA dan masih AKTIF adalah pemblokir KETIGA (TD-300, Group E) di bawah** — pemblokir KEDUA (Paket Keamanan TD-281) sudah selesai duluan.

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

### 2b. ✔ `20260918000001_set_sql_on_quotation_sent` — SUDAH LIVE produksi, baru masuk tabel ini 17 Okt 2026

| | |
|---|---|
| Isi | `CREATE OR REPLACE FUNCTION public.set_sql_on_quotation_sent()` (trigger function, nol argumen) + `CREATE TRIGGER trg_set_sql_on_quotation_sent AFTER INSERT OR UPDATE ON public.quotations` — mempromosikan lead/MQL ke SQL (`lifecycle_stage`) begitu quotation pertama dikirim. |
| Staging | ✔ LIVE (sudah dipakai sebelum jendela 60-migrasi ini dibuat) |
| Production | ✔ **LIVE sejak 18 Sep 2026** — dikonfirmasi Vir 17 Okt 2026 langsung ke production (fungsi ADA). Sudah tercatat `PROGRESS.md` baris TD-310 dan `08_TECH_DEBT.md` TD-310 sejak 27 Sep 2026 — **tapi baru masuk `12_ANTREAN_MIGRASI_PRODUCTION.md` hari ini**, ditemukan hilang saat audit kesiapan launching. |
| Tindakan saat rilis | **NOL — SUDAH LIVE produksi. JANGAN dijalankan ulang saat checklist migrasi hari-H.** File-nya tetap termasuk 44 file migrasi AR di rentang `main..release/2026-10-14` (karena `main` belum punya file-nya sama sekali — migrasi ini LIVE via eksekusi manual/SQL Editor sebelum file-nya direkam ke repo, bukan via `main` yang pernah menjalankannya), tapi SQL-nya sendiri tidak boleh dieksekusi ulang. |

**Kerabat dicatat sebelumnya:** TD-310 (166 akun lama tertahan MQL karena trigger ini hanya berlaku untuk quotation yang SENT SESUDAH trigger aktif — bukan bug, housekeeping tertunda).

### 3b. ✔ `20261002000002_td300_default_privileges_revoke_execute` — SUDAH LIVE produksi+staging, baru masuk tabel ini 17 Okt 2026

| | |
|---|---|
| Isi | `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` — fungsi BARU di schema `public` tidak lagi otomatis ter-EXECUTE PUBLIC; companion TD-300 (Group A/B dari paket H5-adjacent, BUKAN Group E yang masih OPEN). |
| Staging | ✔ **LIVE sejak 2 Okt 2026** |
| Production | ✔ **LIVE sejak 2 Okt 2026** — dikonfirmasi Vir 17 Okt 2026 langsung ke production: default ACL fungsi untuk role `postgres` sudah `{postgres=X/postgres}` (PUBLIC sudah tercabut). Sudah tercatat `PROGRESS.md` dan `CLAUDE.md` §Aturan Wajib sejak 2 Okt 2026 — **tapi baru masuk `12_ANTREAN_MIGRASI_PRODUCTION.md` hari ini**, ditemukan hilang saat audit kesiapan launching. |
| Tindakan saat rilis | **NOL — SUDAH LIVE produksi DAN staging. JANGAN dijalankan ulang saat checklist migrasi hari-H.** |

**Kerabat, JANGAN tertukar:** TD-300 "Group E" (`20261007000001_td300_group_e_revoke_public_execute.sql`) adalah pekerjaan TERPISAH dan LEBIH BESAR (mencabut EXECUTE dari 99 fungsi LAMA yang sudah ada SEBELUM companion ini) — lihat §TD-300 Group E — SENGAJA DI LUAR jendela rilis ini, di bawah. File `20261002000002` ini HANYA mengunci fungsi BARU ke depan, TIDAK menyentuh 99 fungsi lama itu.

## 3. ✔ `crm_rate_list` → katalog modul `procurement` — SELESAI 2 Okt 2026

**Dulu satu-satunya butir yang memblokir launching** (butir 6 juga wajib, tapi tenggatnya AR Tahap 1, bukan launching) — **tidak lagi**, lihat §Ringkasan di atas.

| | |
|---|---|
| Isi | Saklar/toggle **Rate List** (`module_menus.key = 'crm_rate_list'`) dipindah dari katalog modul `crm` ke modul **`procurement`**, `sort_order = 8` |
| Staging | ✔ dilakukan **manual 24 Sep 2026**. Terukur 25 Sep: modul = `procurement` |
| Production | ✔ **dijalankan 2 Okt 2026**, lewat Supabase MCP |
| Berkas migrasi | ✔ **direkam retroaktif** `supabase/migrations/20261002000001_crm_rate_list_module_procurement.sql` (91 baris) — ditulis SESUDAH eksekusi, pola yang sama dengan `20260917000001` (butir 1) |
| Kenapa wajib | Kerangka menu Bagian 1 menempatkan Rate List di bawah Procurement. Tanpa pemindahan katalog, izin menu untuk Rate List tidak cocok dengan posisinya di sidebar produksi |

**Cara eksekusi production sesuai langkah yang sudah ditulis di atas:** `UPDATE module_id`, **BUKAN** hapus-buat-ulang baris menu — 10 grant role yang menempel ke `crm_rate_list` tidak ikut jatuh. Staging sudah dalam keadaan ini sejak 24 Sep 2026 (manual, nol jejak git saat itu); production kini menyusul dan sejak 2 Okt 2026 **kedua environment sama**.

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

## 6. ✔ `20260925000001_dni_sp_order_item_link` — SELESAI (production) 2 Okt 2026

| | |
|---|---|
| Isi | (1) `generate_delivery_from_picking` mengisi `delivery_note_items.sp_order_item_id` · (2) backfill idempoten baris yang masih NULL · (3) guard keras di `create_invoice_for_sp` |
| Berkas migrasi | ✔ `supabase/migrations/20260925000001_dni_sp_order_item_link.sql` |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ✔ **dijalankan 2 Okt 2026**, lewat Supabase MCP |
| Sifat | 2 `CREATE OR REPLACE` (signature & ACL identik) + 1 `UPDATE` ber-`WHERE … IS NULL`. Nol DDL tabel, nol GRANT/REVOKE, nol baris dihapus |

**✅ Eksekusi production 2 Okt 2026 (laporan sesi).** `generate_delivery_from_picking` dipasang memakai **badan LIVE staging** (komentarnya lebih pendek dari berkas di repo ini, karena staging sempat diiterasi sejak 25 Sep) — dipilih supaya md5 badannya **SAMA PERSIS** dengan staging: `88f5525343075eeddeb2ccbb6253e7ed`. `create_invoice_for_sp` production kini bermd5 `1b754c87def41341134823aeb6a1dc06` (badan dari berkas migrasi di atas, guard terpasang). **Verifikasi `V1a` di production = 0** (lolos — tak ada baris `sp_order_items` yatim yang gagal dipetakan, beda dari staging yang punya 5 baris data uji lama). **77 baris di 33 Surat Jalan** (rentang 25 Sep s/d 2 Okt 2026 — persis Surat Jalan yang lahir sejak migrasi staging sampai hari eksekusi production) kini tersambung lewat perbaikan ini, dari yang sebelumnya NULL. Cadangan badan LAMA (sebelum diganti) disimpan oleh sesi yang mengerjakan, **di luar repo**.

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

## 7. ✔ `20260925000002_sp_order_items_legacy_unique` — SELESAI (production) 2 Okt 2026

| | |
|---|---|
| Isi | `CREATE UNIQUE INDEX` parsial `sp_order_items_legacy_sp_item_id_key ON sp_order_items (legacy_sp_item_id) WHERE legacy_sp_item_id IS NOT NULL` + pra-cek duplikat |
| Berkas migrasi | ✔ `supabase/migrations/20260925000002_sp_order_items_legacy_unique.sql` |
| Staging | ✔ **dijalankan 25 Sep 2026** |
| Production | ✔ **dijalankan 2 Okt 2026**, lewat Supabase MCP, sesudah butir 6 |
| Sifat | DDL index saja, idempoten (`IF NOT EXISTS`). Nol kolom, nol data, nol GRANT/REVOKE, nol policy |

**✅ Eksekusi production 2 Okt 2026 (laporan sesi).** Index unique parsial terpasang **VALID**. Uji sisip duplikat ditolak dengan kode error Postgres **23505** (`unique_violation`), sesuai harapan — rantai `legacy_sp_item_id` kini dijamin skema, bukan lagi hanya oleh keadaan data. **Nol baris uji tertinggal** di tabel sesudah pengujian.

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

⛔ **WAJIB JALAN SEBELUM LANGKAH 4 (smoke test pasca-deploy) — bukan sekadar "wajib jalankan" generik.** Migrasi ini SATU-SATUNYA izin menu modul Finance untuk peran `finance_controller`. Kalau terlewat di tengah 30+ migrasi malam itu, peran `finance_controller` akan terkunci TOTAL dari seluruh halaman Finance AR (Invoice Management, Submission/TTF, AR Aging, Payment & Collection — keempatnya satu menu `billing`→`fin_invoice`) **walau peran dan RPC approval-nya sendiri sudah benar** — role check `finance_controller` di `approve_invoice_issue`/`reject_invoice_issue` (butir 41) TIDAK bergantung pada menu permission, jadi **nol error terlihat** sampai ada yang mencoba membuka halamannya. Ini sudah TERUJI di staging — 3 baris grant (`ceo`, `finance`, `finance_controller`) dipasang 25 Sep 2026 (lihat baris "Staging" di atas), bukan migrasi yang belum pernah dicoba.

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

> ⚠️ **[7 Okt 2026] PERINGATAN RILIS — tabel tracking migrasi Supabase TIDAK BISA DIPERCAYA untuk rentang tanggal ini.** Temuan (read-only, lewat `list_migrations` Supabase dibandingkan file repo): kesepuluh migrasi invoice v2 di atas (`invoice_header_v2` dkk) tercatat di tabel `supabase_migrations.schema_migrations` **STAGING** dengan timestamp versi **25 September** (contoh: `20260925094015`), TAPI file-nya di repo bertanggal **28 September** (`20260928000001_invoice_header_v2.sql` dkk). **Penyebab paling mungkin:** migrasi pertama kali dijalankan ke staging 25 Sep (lewat `supabase db push` atau serupa, tercatat versi itu), lalu file-nya ditulis ulang/diberi nomor baru 3 hari kemudian (28 Sep) saat didokumentasikan ke repo, **tanpa memperbarui tabel tracking staging** supaya cocok.
>
> ✅ **[7 Okt 2026, lanjutan] DIVERIFIKASI — isinya IDENTIK, anomalinya murni kosmetik di tabel tracking.** Dibandingkan langsung (read-only `execute_sql` ke **staging**, `oovmlhilhqzejnawqkvt`, nol tulis) terhadap isi kesepuluh berkas repo saat ini:
> - **`set_invoice_tax_info`** (butir 22, diamandemen butir 26) — `pg_get_functiondef` yang hidup di staging **byte-identik** dengan badan `CREATE OR REPLACE` di `20260928000011_invoice_coretax_code_whitelist.sql`, termasuk komentar inline-nya ("BARU di berkas 11: kode Coretax harus dari daftar 01..10", peringatan `substring` vs `LIKE '[0-9][0-9]%'`) — bukan cuma logiknya yang sama, teksnya sama sampai ke komentar.
> - **10 fungsi lain yang diperiksa** (`invoice_dapat_dibaca`, `mark_invoice_printed`, `mark_invoice_emailed`, `link_replacement_invoice`, `add_invoice_attachment`, `delete_invoice_attachment`, `add_invoice_note`, `delete_invoice_note`, `get_mapped_account`, `compute_payment_term_days`) — semuanya ADA, nol yang hilang.
> - **Kolom** `sp_invoices` (21 kolom baru dari butir 16) dan `sp_invoice_lines` (16 kolom dari butir 17, termasuk `qty` sudah `numeric` bukan `integer`) — seluruhnya ADA dengan tipe/default/nullable **persis** seperti yang ditulis di file.
> - **14 CHECK constraint** (seluruh `*_terkunci` + `sp_invoices_source_type_check`/`sp_invoices_sp_order_id_wajib_utk_storbit`/`sp_invoices_print_to_check`/`sp_invoices_print_count_check`/`sp_invoices_total_currency_cocok`/`sp_invoice_lines_line_type_check`/`sp_invoice_lines_amount_rumus`/`sp_invoice_lines_shipping_bukan_basis_pajak`) — seluruhnya ADA dengan definisi yang cocok kata demi kata (`pg_get_constraintdef`).
> - **3 tabel baru** (`invoice_notes` 7 kolom, `invoice_attachments` 10 kolom, `account_role_mappings` 7 kolom) + **bucket Storage `invoice-docs`** (privat, `public=false`) — seluruhnya ADA.
> - **ACL write-lockdown (butir 19):** `sp_invoice_lines.authenticated` = `r` saja (nol insert/update/delete) · `sp_invoices.authenticated` = `rd` di level tabel (nol insert/update tabel) **ditambah tepat 9 kolom** ber-`UPDATE` kolom-spesifik untuk `authenticated` (`company_id`/`created_at`/`created_by`/`deleted_at`/`id`/`invoice_date`/`sp_order_id`/`submit_ref`/`updated_at`) — **`faktur_no` SENGAJA TIDAK ADA di daftar itu**, persis klaim butir 16/19 "9 kolom sesudah faktur_no dicabut".
>
> **Kesimpulan: anomali versi HANYA ADA di tabel tracking Supabase, BUKAN di isi objeknya.** SQL yang benar-benar jalan di staging 25 Sep = SQL yang hari ini tertulis di kesepuluh file repo bertanggal 28 Sep — tidak ada versi lain yang tercecer di antaranya.
>
> ⛔ **SEBELUM rilis 14/15 Oktober: JANGAN menjalankan ulang `20260928000001` dkk ke staging** mengira belum jalan HANYA berdasarkan tabel tracking Supabase. Kalau perlu memastikan lagi, **cek objeknya (fungsi/kolom/tabel), bukan tabel tracking** — cara itu sudah terbukti lewat verifikasi di atas. **Saat malam rilis, jalankan kesepuluh file ke PRODUCTION memakai NAMA FILE yang ada di repo sekarang** (`20260928000001` s/d `20260928000011`, kecuali `20260928000005` yang memang staging-only) — produksi belum pernah menjalankan satu pun darinya, jadi di sisi production tidak ada risiko dijalankan dua kali untuk batch ini; risiko "tertukar versi" hanya relevan kalau pola push-lalu-ganti-nama ini terulang untuk migrasi berikutnya, dan aturannya tetap sama: verifikasi dengan query ke objeknya. Pola serupa juga ditemukan di **production** untuk migrasi 18 Sep (`20260918000001_set_sql_on_quotation_sent.sql` vs tracking versi `20260918100429`) — **TD-279** (`08_TECH_DEBT.md`) sudah menyinggung sebagian dari kelas masalah ini (drift staging vs produksi), ditautkan di sini sebagai kerabat, bukan duplikat.

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

## 44a. ⛔ `20261013000001_ar_tahap3b_invoice_two_stage_approval` — WAJIB, sesudah butir 39, 40, 41, 42

| | |
|---|---|
| Berkas | `supabase/migrations/20261013000001_ar_tahap3b_invoice_two_stage_approval.sql` |
| Staging | ✅ **SUDAH JALAN 13 Okt 2026** — dieksekusi Vir lewat connector Supabase MCP. Badan kedelapan fungsi diverifikasi md5 identik dengan file; 23 skenario uji fungsional (impersonasi JWT, satu transaksi dibatalkan) semua sesuai harapan — rincian di §VERIFIKASI STAGING di bawah |
| Production | ⛔ **belum** |
| Tindakan saat launching | ⛔ **WAJIB jalankan**, SESUDAH butir 39-42 (pre-check berkas ini menolak jalan kalau basis `reject_invoice_issue`/`record_payment`/`mark_ttf_received` bukan versi butir 41/42) |

**Apa isinya.** Persetujuan invoice dua tahap (keputusan verbal Den 7 Okt 2026, dieksekusi 13 Okt 2026, lalu DIREVISI Den hari yang sama sesudah mockup Invoice Management [Claude Design] diperbarui): invoice yang diajukan kini menunggu **endorsement Finance Manager** (Rini Andriyani @ SOA) lebih dulu, sebelum sampai ke persetujuan akhir Finance Controller/CEO.

⛔ **REVISI 13 Okt 2026 — tiga keputusan berubah dari versi pertama berkas ini:**
1. **`approve_invoice_issue` KINI IKUT DISENTUH** (versi pertama menjanjikan "TIDAK DISENTUH SAMA SEKALI" — itu DIBATALKAN). **Aturan SATU ORANG SATU TAHAP**: siapa pun yang meng-endorse ATAU melompati endorsement sebuah invoice TIDAK BOLEH menjadi orang yang memberi persetujuan akhir pada invoice yang SAMA — ditegakkan lewat kolom BARU `sp_invoices.endorsed_by` (diisi `endorse_invoice_issue`/`skip_invoice_endorsement`, dibaca `approve_invoice_issue`).
2. **`super_admin` DICABUT dari KEEMPAT RPC persetujuan invoice** (`endorse_invoice_issue`, `skip_invoice_endorsement`, `approve_invoice_issue`, `reject_invoice_issue`) — mockup menjadikan Super Admin murni pengamat, bukan peserta rantai persetujuan. ⛔ **Konsekuensi operasional: `super_admin` TIDAK LAGI BISA menyetujui/endorse/skip/menolak invoice** — kalau malam rilis hanya ada akun `super_admin` yang terjaga dan BELUM ada `finance_manager`/`finance_controller`/`ceo` aktif, invoice akan menumpuk tanpa ada yang bisa memprosesnya (kelas pelajaran yang sama dengan butir 9 Okt soal akun Bagus).
3. **Notifikasi PINDAH ke badan RPC** (bukan lagi "dibangun di FE nanti") — pola disalin dari Lead Pool Paket 2 (`develop`, `20261012000006`/`20261012000008`; branch rilis ini dicabangkan sebelum Paket 2, jadi pola itu tidak kelihatan di branch ini): tiap `INSERT INTO notifications` dibungkus `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END;` (best-effort). `notifications.event_type` TIDAK punya CHECK constraint (`character varying NOT NULL` polos) — nol pelebaran constraint diperlukan.

Larangan "tidak boleh menyetujui/endorse/skip/menolak pengajuan sendiri" kini berlaku untuk SEMUA peran TANPA pengecualian (klausa "kecuali `super_admin`" dicabut dari keempat fungsi).

⛔ **TAMBALAN KEDUA (sesudah SQL pertama ditulis, SEBELUM dijalankan di staging — revisi Den, dua butir):**
4. **Peran di KEEMPAT RPC persetujuan kini diperiksa PER ENTITAS invoice** (`ur.company_id = invoice.company_id`), bukan di entitas mana pun — `has_role()` mengabaikan `company_id` sama sekali (perilaku LAMA, bukan sesuatu yang lahir di sini; lihat gotcha TD-233: "uji role DI ENTITAS BARIS ITU"). Disisir dulu: **nol fungsi pembantu generik `has_role_in(kode, company)` ada di repo/develop** — yang ada hanya sibling KHUSUS per fungsi (`is_manager_or_above_in`, `is_procurement_functional_in`, dst., masing-masing hardcode daftar rolenya sendiri). Pola itu dipertahankan: pengecekan ditulis **EXISTS inline** langsung ke `user_roles`/`roles`/`profiles` di tiap fungsi, konsisten dengan kriteria `invoice_role_holders` (`company_id`, `is_active`, `valid_until`, profil aktif) — bukan fungsi generik baru. Karena peran butuh `company_id` invoice, urutan guard berubah: baris invoice dibaca+dikunci LEBIH DULU, baru peran diperiksa (`reject_invoice_issue` sudah begini sejak putaran pertama, karena perannya sendiri bergantung status).
5. **`invoice_role_holders` TIDAK LAGI di-`GRANT EXECUTE`** ke `authenticated` (atau siapa pun) — fungsi itu HANYA dipanggil dari dalam badan RPC `SECURITY DEFINER` lain, yang berjalan sebagai pemilik fungsi (`postgres`), jadi tidak butuh grant eksplisit. Klien tidak ada alasan memanggilnya langsung.

- Status BARU `pending_manager_approval`, disisip SEBELUM `pending_approval` di CHECK constraint.
- **Empat kolom BARU** `sp_invoices.endorsed_by`/`endorsed_at`/`endorsement_skipped`/`endorsement_skip_reason` — satu kolom (`endorsed_by`) untuk KEDUA jalur masuk ke `pending_approval` (endorse ATAU skip); `endorsement_skipped`/`endorsement_skip_reason` hanya terisi lewat jalur skip.
- **Fungsi helper notifikasi BARU** `invoice_role_holders(company_id, role_codes[])` — SETOF uuid, profil aktif ber-peran aktif di entitas itu (pola sama `lead_pool_approvers`, tapi berbasis `has_role()` bukan izin menu — mencerminkan gerbang RPC yang sama). **NOL grant EXECUTE** ke siapa pun (tambalan kedua).
- `create_invoice_for_sp` (butir 40) — INSERT ke `pending_manager_approval` (TIDAK berubah dari putaran pertama) + **notifikasi BARU** ke pemegang `finance_manager` di entitas itu.
- RPC BARU `endorse_invoice_issue(uuid)` — tahap 1: `pending_manager_approval` → `pending_approval`. Peran: **`finance_manager` SAJA** (`super_admin` dicabut). Mengisi `endorsed_by`/`endorsed_at`. Notifikasi ke `finance_controller`+`ceo` entitas itu.
- RPC BARU `skip_invoice_endorsement(uuid, text)` — melompati tahap 1 langsung ke `pending_approval`, **alasan WAJIB**. Peran **`finance_controller`/`ceo` SAJA** (`super_admin` dicabut) — SAMA dengan `approve_invoice_issue`, **BUKAN** `finance_manager`. Mengisi `endorsed_by`/`endorsed_at`/`endorsement_skipped`/`endorsement_skip_reason`. Audit_logs aksi khusus `LOMPATI_ENDORSEMENT`. **Dua notifikasi**: `finance_controller`+`ceo` (sama dengan endorse) DAN `finance_manager` entitas itu (menyertakan alasan).
- `approve_invoice_issue` — **BARU DISENTUH revisi ini**. Peran **`finance_controller`/`ceo` SAJA** (`super_admin` dicabut). **Pengecekan BARU**: menolak kalau `endorsed_by` invoice itu = `auth.uid()` (satu orang satu tahap; pesan error Bahasa Inggris). Notifikasi BARU ke `created_by` invoice saat terbit.
- `reject_invoice_issue` (butir 41) **dilebarkan ke dua status DAN peran kini bergantung tahap**: tahap 1 (`pending_manager_approval`) — `finance_manager`/`finance_controller`/`ceo`; tahap 2 (`pending_approval`) — `finance_controller`/`ceo` SAJA (sama dengan approve). `super_admin` dicabut di kedua cabang. Notifikasi BARU ke `created_by` invoice.
- `record_payment` (butir 42) dan `mark_ttf_received` (butir 42) — **TIDAK disentuh revisi ini**, tetap guard `pending_manager_approval` dari putaran pertama.
- Role BARU `finance_manager` (level 7 — **sama dengan** `finance_controller`/`finance`, **bukan** manajer-ke-atas) + grant menu `fin_invoice` (`view`) — **nol pemegang** sampai Den menambahkannya manual (lihat langkah sesudah tabel ini).

⛔ **TAMPILAN (badge, tombol Endorse/Lompat Tahap/Approve/Reject yang disesuaikan) mengikuti mockup Invoice Management [Claude Design] yang sudah diperbarui — SENGAJA TIDAK DIBANGUN di berkas ini** (keputusan Den: backend dulu). FE yang disentuh hari ini hanya `src/lib/roles.js` (`canApproveInvoice`/`canEndorseInvoice`/`canSkipInvoiceEndorsement` — `super_admin` dicabut dari ketiganya) dan `src/modules/finance/invoiceStatus.js` (label/tag/`dueDateText`/`invoiceNoLabel` untuk status baru, dari putaran pertama — TIDAK disentuh ulang revisi ini).

**Basis tiap fungsi yang diubah** (diverifikasi diff mekanis terhadap file yang sungguh mendefinisikannya, BUKAN `schema_snapshot.sql` yang nol hit untuk `approve_invoice_issue`/`reject_invoice_issue`): `create_invoice_for_sp` ← butir 40 · `approve_invoice_issue`/`reject_invoice_issue` ← butir 41 · `record_payment`/`mark_ttf_received` ← butir 42.

**Rollback.** ⛔ Hanya aman kalau **nol** baris `sp_invoices` berstatus `pending_manager_approval` ATAU `pending_approval` hidup (kini TERMASUK `pending_approval`, karena `approve_invoice_issue` lama tidak tahu soal `endorsed_by`). Lihat blok ROLLBACK lengkap di ekor berkas migrasi (DROP `invoice_role_holders` + dua RPC baru, tempel ulang badan lama EMPAT fungsi yang dilebarkan/direvisi termasuk `approve_invoice_issue`, DROP empat kolom jejak endorsement, kembalikan CHECK constraint, hapus grant menu — JANGAN hapus role `finance_manager` kalau sudah dipegang user).

### ✅ VERIFIKASI STAGING 13 Okt 2026

**Eksekusi:** Vir, lewat connector Supabase MCP (bukan CC — CC tidak menjalankan SQL, konsisten aturan proyek).

**Badan fungsi.** Kedelapan fungsi yang disentuh/baru oleh migrasi ini (`create_invoice_for_sp`, `endorse_invoice_issue`, `skip_invoice_endorsement`, `approve_invoice_issue`, `reject_invoice_issue`, `record_payment`, `mark_ttf_received`, `invoice_role_holders`) diverifikasi **md5 identik** antara badan yang hidup di staging dan isi berkas migrasi — nol drift antara yang dijalankan dan yang tercatat di repo.

**23 skenario uji fungsional**, lewat impersonasi JWT (GUC `request.jwt.claim.sub`, pola yang sama dengan seed UAT 25 Sep 2026) di **satu transaksi yang dibatalkan** (nol data staging berubah permanen akibat pengujian ini) — **SEMUA sesuai harapan**:
- Alur normal: Elvira ajukan → **Rini endorse** → **Bagus approve** → `issued`
- **Skip** dengan alasan wajib (kosong ditolak; diisi berhasil, `endorsement_skip_reason` terisi)
- **Satu orang satu tahap**: aktor yang endorse/skip pada sebuah invoice ditolak saat mencoba approve invoice yang sama; aktor LAIN berhasil
- **Super admin ditolak** di keempat RPC (endorse/skip/approve/reject) — konsisten (B) di atas
- **Finance Manager @MSI ditolak meng-endorse invoice @SOA** (peran per entitas, tambalan kedua) — dan sebaliknya diterima di entitasnya sendiri
- **Larangan atas pengajuan sendiri** — ditolak di keempat RPC, tanpa pengecualian
- **Tolak di tahap 1** (`pending_manager_approval`, oleh `finance_manager`/`finance_controller`/`ceo`) dan **tolak di tahap 2** (`pending_approval`, oleh `finance_controller`/`ceo` saja) — keduanya kembali ke `draft` + `rejection_note`
- **Guard pembayaran di tahap 1** — `record_payment`/`mark_ttf_received` menolak invoice `pending_manager_approval`
- **Empat titik notifikasi** (invoice lahir → `finance_manager`; endorse/skip → `finance_controller`+`ceo`; skip juga → `finance_manager` dengan alasan; ditolak/terbit → `created_by`) — baris `notifications` muncul di penerima yang benar, nol baris ke pelaku aksinya sendiri

⛔ **Bug ditemukan DAN ditutup hari yang sama:** blok V-POST migrasi ini (empat pengecekan `v_def LIKE '%has_role(%'` untuk approve/endorse/skip/reject) memberi **alarm palsu** — teks "has_role()" (tanpa tanda kutip, bentuk prosa) muncul di KOMENTAR inline badan `endorse_invoice_issue` dan `reject_invoice_issue` (menjelaskan KENAPA peran kini diperiksa per entitas), bukan sebagai panggilan fungsi sungguhan. V-POST sempat gagal di `endorse_invoice_issue` padahal fungsinya BENAR — gejala klasik *pengecekan `LIKE` yang tak bisa membedakan kode dari komentar*. **Diperbaiki**: pola diganti `'%has_role(''%'` (bentuk panggilan sungguhan, `has_role('...')`, dengan tanda kutip pembuka) — kebal terhadap komentar prosa yang menyebut nama fungsinya tanpa tanda kutip. Nol badan fungsi disentuh; keempat pengecekan lolos sesudahnya.

**Perubahan manual KHUSUS STAGING (bukan migrasi, TIDAK naik ke production)** — tiga grant peran lewat Admin Settings/connector Supabase, untuk kebutuhan pengujian 23 skenario di atas:
- `finance_manager`@SOA → akun `zzztest.h3@msi.com`
- `ceo`@SOA → akun `zzztest.deactivate@msi.com`
- `finance_manager`@MSI → akun `test@msi.com`

⚠️ **Ketiganya eksplisit TIDAK termasuk dalam cakupan launching production** — mereka akun uji staging, bukan akun operasional nyata. Langkah manual yang WAJIB untuk production tetap hanya satu: peran `finance_manager`@SOA untuk **Rini Andriyani** (lihat paragraf di bawah). Jangan membawa ketiga grant staging ini ke production dengan asumsi "sudah pernah dikerjakan di sana".

**Langkah manual SESUDAH migrasi ini live di suatu environment (BUKAN SQL — lewat Admin Settings, dikerjakan Den sendiri):** tambahkan peran **`finance_manager`** ke akun **Rini Andriyani @ SOA** lewat User Access/User Edit. Migrasi ini hanya menyiapkan role + izin menunya — **nol pemegang** sampai langkah ini dijalankan. Tanpa langkah ini, setiap invoice baru akan menumpuk tak terbatas di `pending_manager_approval` (sama persis dengan pelajaran butir 9 Okt soal akun `finance_controller` Bagus — gerbang approval tanpa penyetuju aktif = macet, bukan lewat begitu saja).

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

## Koreksi Data dan Akses Manual (di luar Migrasi)

Bagian ini **berbeda sifat** dari seluruh butir di atas: butir 1-46 adalah **berkas migrasi** (skema/fungsi/RLS, tercatat `supabase/migrations/`). Bagian ini mencatat **SQL/perubahan akses manual langsung di production** — dieksekusi lewat **Claude chat + connector Supabase MCP** (kecuali disebutkan lain), **nol jejak git**, tidak akan pernah muncul di `supabase/migrations/`. Tanpa catatan di sini, perubahan jenis ini adalah yang **paling mudah hilang** dari sejarah proyek.

| Tanggal | Apa yang diubah | Alasan | Lewat mana | Status |
|---|---|---|---|---|
| 17 Sep 2026 | INSERT `user_roles`: akun CEO (Azhar Malik / "Pak Adam") diberi role `ceo` tambahan di entitas **SOA**, selain `ceo`@MSI yang sudah ada | Dashboard Storbit kosong untuk akun ini tanpa akses SOA (RLS company-scoped) | Claude chat + connector Supabase | Permanen. Pola `user_roles` jamak yang sama sudah dipakai 3 orang lain (Elvira MSI→SOA; Camelia & Dery SOA→3 entitas) — bukan kasus baru, prosedurnya memang belum pernah ditulis sebagai SOP (`04_ROLE_PERMISSION_MATRIX.md` §5 #12). Sudah tercatat sebelumnya di `CLAUDE.md` bullet [17 Sep 2026]. |
| **2 Okt 2026** | Role `super_admin`@MSI milik Azhar Malik **diaktifkan kembali** (tanpa `valid_until`), atas permintaan Den | Tidak dicatat di sesi ini — permintaan Den | Claude chat + connector Supabase | ⚠️ **[SEMENTARA, PERLU DITINJAU]** TERVERIFIKASI MASIH AKTIF per 6 Okt 2026. Akun ini sekarang punya **TIGA role aktif sekaligus**: `ceo`@MSI, `super_admin`@MSI, `ceo`@SOA. Ini **akses sementara yang harus ditinjau/dicabut** — keputusan pencabutan diambil Den terpisah, **BUKAN bagian dari catatan ini**. `super_admin` bypass seluruh RLS company-scoped — radius dampaknya jauh lebih besar daripada tambahan role `ceo`@SOA di baris sebelumnya. |
| 17 Sep 2026 | UPDATE `picking_lists`/item picking: `qty_picked` 500→550 untuk `PICK/SOA/WH/2026/0146` (SP `2280683`, item Shelf Strip Flat 90 CM); pemindahan **1.165 unit** Shelf Strip Flat 90 CM dari Gudang Lainnya ke Gudang Semper | Koreksi picking list statis yang tak ikut update (TD-267) + koreksi input penerimaan salah gudang (TD-268) — belum ada fitur transfer/edit stok antar gudang di aplikasi | SQL manual | Permanen. Detail lengkap: `08_TECH_DEBT.md` **TD-267** (picking snapshot statis) / **TD-268** (belum ada fitur transfer stok). |
| 18 Sep 2026 | UPDATE `roles` (level 7→6) + INSERT 6 baris `role_menu_permissions` untuk role `bd_digital_marketing_spv` ("Digital Marketing Supervisor") — enam izin VIEW: `crm_dashboard`, `crm_pipeline`, `crm_prospects`, `crm_inquiry`, `crm_quotation`, `crm_customers` | Supaya role ini lolos `is_manager_or_above()` dan sejajar dengan Sales Supervisor | Claude chat + connector Supabase | Permanen. |
| ~2 Sep 2026 (tanggal eksekusi tidak presisi, ditemukan lewat diff snapshot 5 Sep) | REVOKE akses `anon` pada fungsi `get_table_columns` | Pengerasan akses — fungsi itu tak seharusnya terbuka untuk `anon` | Tidak diketahui persis (ditemukan dari diff snapshot, bukan dicatat saat eksekusi) | Permanen. Sudah tercatat `08_TECH_DEBT.md` **TD-24 RESOLVED** / `03_DATA_MODEL.md` **gotcha #23** — ditautkan di sini karena ini JUGA contoh akses manual tanpa jejak git. |
| 6 Okt 2026, 08:04 UTC | UPDATE `accounts.source`: akun "HOME WELL INDONESIA" (`id = 40808722-7a4a-4756-9061-c002692a685c`, company MSI) diubah dari `sales_visit` ke `whatsapp` | Salah pilih saat input awal | Claude chat + connector Supabase | Permanen. Terkait **TD-307** (`08_TECH_DEBT.md`) — field `source` di `ProspectFormPage.jsx` punya nilai DEFAULT diam-diam, bukan field wajib tanpa pilihan, yang sedang memicu kesalahan input seperti ini. |
| 9 Okt 2026 | Akun baru **Bagus Putra Kurnia** (`bagus.putra@msigroup.co.id`) dibuat lewat Admin Settings dengan peran `finance_controller`@MSI; peran `finance_controller`@SOA ditambahkan manual (`INSERT user_roles`, `granted_by` = Den) | Penyetuju invoice Storbit tersedia sebelum rilis 14 Okt — gerbang approval RPC `approve_invoice_issue`/`reject_invoice_issue` (butir 40-41) tanpa penyetuju aktif berarti setiap invoice baru menumpuk tak terbatas di `pending_approval` | Admin Settings (akun) + Claude chat + connector Supabase (role @SOA) | Permanen. Diverifikasi: 2 baris `user_roles` aktif (`finance_controller`@MSI, `finance_controller`@SOA). **Butir H-1.0 di bawah ("cek akun penyetuju") kini TERPENUHI** — lihat anotasi koreksi di sana. |
| 11 Okt 2026 | **`cron.alter_job(1, active := false)`** menonaktifkan job **`aging-pipeline-harian`** (jobid 1) — schedule dan command-nya TETAP tersimpan, hanya flag aktifnya dimatikan; terpisah, UPDATE **`companies.aging_enabled`** = `false` untuk entitas **MSI** | Mengikuti temuan audit mekanisme aging (dikerjakan sesi Claude Code sebelumnya) — Lead Pool aging otomatis dihentikan SEMENTARA, dieksekusi atas persetujuan eksplisit Den sebelum dijalankan | Claude chat + connector Supabase (MCP) | ⚠️ **[SEMENTARA, PERLU DITINJAU]** **Data pool TIDAK disentuh/diubah sama sekali** — hanya dua pengaturan di atas (job cron + flag entitas). Cara membalikkan: `cron.alter_job(1, active := true)` + set `companies.aging_enabled` MSI kembali `true`. |
| 13 Okt 2026 | Akun **"akun test"** (`test@msi.com`) DIHAPUS — profil, auth user, dan `user_roles` (peran `finance`, `operations`, `procurement` di SOA, dibuat 21 Agu 2026, terakhir login 30 Sep 2026, nol invoice/aktivitas/akun yang dibuat) | Akun uji tidak boleh punya akses finance di production | Admin Settings > User Access (Den) | Permanen. Terverifikasi 13 Okt 2026: profil, auth user, dan `user_roles` nol baris untuk akun ini. |

### Backfill Fase B — 68 SP historis Storbit-Indomarco (23-24 Sep 2026)

**Status: SELESAI.** SQL langsung di production (BUKAN migrasi — diuji dulu dengan `BEGIN`+`ROLLBACK` sebelum dieksekusi sungguhan), memasukkan **68 SP historis Storbit-Indomarco** yang belum ada di Nexus ke `sp_orders`, `sp_items`, `sp_btb`, `picking_lists`, `delivery_notes`. **Sengaja TIDAK** menyentuh `stock_ledger`.

⚠️ **Verifikasi kode (dilakukan sesi ini, 7 Okt 2026, read-only):** **TIDAK ADA file SQL/migrasi apa pun di repo** untuk backfill ini (konsisten dengan "SQL langsung di production, tanpa migration file"). Migrasi `20260923000001_invoice_historis_retroaktif.sql` yang ADA di repo (tanggal berdekatan) **TERNYATA untuk keperluan BERBEDA** — menambahkan parameter tanggal historis ke `create_invoice` untuk impor **468 invoice historis** 23-24 Sep 2026, **bukan** untuk 68 SP Fase B ini. **JANGAN disamakan kedua hal ini.**

### Fase C — generate invoice untuk SP lama (TERTUNDA)

**Status: TERTUNDA.** Rencana: generate invoice untuk SP lama dari backfill Fase B + sinkron status untuk **427 SP** yang cocok dengan rekap Finance. **Blocker:** fungsi `create_invoice`/`create_invoice_for_sp` membaca baris item dari `sp_order_items`, sedangkan Fase B mengisi `sp_items` — 68 SP baru itu **TIDAK punya baris di `sp_order_items`**, jadi invoice-nya tidak bisa diterbitkan lewat jalur normal. Menunggu keputusan: patch `create_invoice`/`create_invoice_for_sp` agar juga membaca `sp_items` untuk kasus ini, ATAU backfill ulang ke `sp_order_items` — dicatat sebagai **Keputusan Terbuka #68** di `09_ROADMAP.md`.

**23 SP batch terakhir Fase C** ditahan karena bentrok dengan `STORBIT_SHIPPING_MANIFEST` (13 SP masih status Pending di manifest, 7 SP malah tidak ada di manifest sama sekali) — menunggu konfirmasi dari Gigih (pihak eksternal/Finance).

> ⛔ **Aturan:** setiap perubahan manual terhadap data atau akses di production ke depan (SQL langsung, bukan lewat migrasi terkelola) wajib dicatat di bagian ini — tanggal, apa yang diubah, alasan, dan lewat mana dieksekusi.

---

## Naskah Eksekusi Malam Rilis — MUNDUR ke awal November 2026 (tanggal pasti menyusul)

**Jendela eksekusi:** malam **[tanggal menyusul, awal November 2026]**, sesudah jam kerja. **Efektif dipakai Finance:** pagi hari berikutnya. Dua tanggal ini TIDAK boleh tertukar (klarifikasi 7 Okt 2026, lihat catatan di kepala dokumen). ⛔ **Koreksi 13 Okt 2026: mundur dari rencana semula 14/15 Oktober — keputusan Den, alasan + rekomendasi jadwal di bawah.**

⛔ **Keputusan Den 13 Okt 2026: mundur ke awal November 2026, tanggal pasti menyusul.** Rekomendasi yang dicatat (bukan keputusan final, arah yang disetujui Den): **AR dan Lead Management (TD-318) dirilis di MALAM BERBEDA** — AR lebih dulu, Lead Management beberapa hari SESUDAH AR terbukti stabil di production (bukan malam yang sama, supaya kalau salah satu bermasalah, yang lain tidak ikut terseret investigasi). Lihat §Paket 2 Lead Pool untuk status TD-318 secara terpisah.

**Cakupan naskah ini: butir 6-46** (AR Tahap 1 sisa, AR Tahap 2 + Invoice Lengkap, Paket Keamanan TD-281 H1/H2/H3/H5 — sudah LIVE, hanya checkpoint, AR Tahap 3, AR Tahap 3b). **Butir 6, 7, 27-31, 45, 46 SUDAH LIVE** di kedua lingkungan — disebut di sini hanya sebagai checkpoint "pastikan masih utuh", bukan tindakan baru. ⛔ **TIDAK termasuk TD-300 Group E** — lihat penjelasan di penutup naskah ini.

**Siapa menjalankan apa:** seluruh SQL di bawah dijalankan **Den** secara manual di SQL Editor/`execute_sql`, berurutan sesuai nomor. Naskah ini hanya urutan + apa yang harus dilihat di tiap langkah — bukan tombol otomatis.

### Tata kelola branch `release/2026-10-14`

**Sejak 11 Oktober 2026**, isi rilis ini dikunci di branch **`release/2026-10-14`** (dicabangkan dari `develop`@`1176df7`) — `develop` sendiri dibuka kembali hari yang sama untuk pekerjaan baru (Batch DS 3 dkk) yang **bukan** bagian rilis ini. Tiga aturan berlaku sampai rilis ini benar-benar terkirim:

1. **Perbaikan terhadap isi rilis ini** (dari sekarang sampai malam rilis, tanggal baru awal November 2026) **di-commit ke `release/2026-10-14` dulu, lalu di-merge balik ke `develop`** — supaya `develop` tidak kehilangan perbaikan itu.
2. **Perubahan yang berdampak ke STAGING dari pekerjaan `develop` yang berjalan** (Batch DS 3 dkk, atau apa pun yang mendarat di `develop` di periode ini) **wajib murni ADITIF** sampai rilis ini terkirim — tidak boleh ada yang mengubah atau mengganggu apa pun yang sudah terkunci di `release/2026-10-14` dan siap kirim pada malam rilis (tanggal baru, awal November 2026).
3. **Sesudah rilis ini sukses dikirim, `main` di-merge balik ke `develop`** (supaya `develop` menyerap apa pun yang mendarat di `main` selama rilis), dan **hanya sesudah itu** `release/2026-10-14` boleh dihapus.

**Konsekuensi untuk naskah di bawah:** setiap langkah yang dulu menyebut "merge `develop` → `main`" sekarang berarti **merge `release/2026-10-14` → `main`** (merge commit biasa, bukan squash, bukan fast-forward-only) — lihat Langkah 2.

### Persiapan H-1 (13 Oktober 2026)

⛔ **H-1 WAJIB DIULANG sehari sebelum tanggal rilis baru** (bukan dianggap final dari hasil 13 Okt 2026 di atas) — data production bergerak setiap hari, terutama H-1.1 (jumlah SP lolos) dan H-1.2 (baris `ar_ttfs` seharusnya bertambah begitu impor TTF mulai berjalan rutin sebelum rilis).

**Tujuan: pindahkan sebanyak mungkin KEPUTUSAN keluar dari malam rilis.** Kelima langkah di bawah **read-only** (nol tabel diubah, aman dijalankan ke **production** kapan pun, termasuk hari ini) — hasilnya dipakai untuk meninjau angka lebih awal, BUKAN untuk menggantikan pengukuran ULANG di Langkah 0/1E malam itu (data bergerak setiap hari; angka H-1 adalah pratinjau, bukan angka final).

#### H-1.0 — Akun penyetuju

~~⛔ **Temuan 7 Okt 2026: di production BELUM ADA SATU PUN akun aktif ber-role `finance_controller`.**~~ **[✅ TERPENUHI 9 Okt 2026: akun Bagus Putra Kurnia (`finance_controller`@MSI + @SOA) dibuat, lihat tabel §Koreksi Data dan Akses Manual di atas. Teks temuan asli di bawah dipertahankan sebagai jejak — SOA kini punya penyetuju aktif di luar CEO/super_admin, tapi baca tetap seluruh paragraf ini untuk konteksnya.]** Guard `approve_invoice_issue`/`reject_invoice_issue` (butir 41) — sengaja TANPA `is_manager_or_above()`, keputusan rapat 9/11/24 Sep 2026 — hanya meloloskan `super_admin`, `finance_controller`, atau `ceo` (lihat `src/lib/roles.js`, `canApproveInvoice`). Hari ini satu-satunya penyetuju yang tersedia di entitas SOA adalah **CEO (Azhar Malik)** dan **super_admin**.

**Kenapa ini genting, bukan cuma catatan:** sejak butir 40 live, `create_invoice_for_sp` **berhenti** langsung menerbitkan — setiap invoice baru masuk `pending_approval` dan **menunggu** salah satu dari ketiga role itu menyetujuinya. **Tanpa penyetuju yang benar-benar tersedia malam/pagi itu, SETIAP invoice yang diajukan sesudah butir 40 akan menumpuk di `pending_approval` tanpa batas waktu** — bukan gagal, tapi juga tidak pernah selesai sampai ada yang membuka halaman Approval dan menekan Setujui.

**Kueri read-only untuk mengecek** (aman di production kapan pun):

```sql
-- READ-ONLY. Aman di production kapan pun -- SELECT murni, nol tabel diubah.
SELECT c.code AS entitas, r.code AS role, p.full_name AS nama, p.active AS profil_aktif,
       ur.valid_from, ur.valid_until
  FROM user_roles ur
  JOIN roles r     ON r.id = ur.role_id
  JOIN profiles p  ON p.id = ur.user_id
  JOIN companies c ON c.id = ur.company_id
 WHERE r.code IN ('finance', 'finance_controller', 'ceo', 'super_admin')
   AND ur.is_active = true
   AND ur.revoked_at IS NULL
   AND (ur.valid_from  IS NULL OR ur.valid_from  <= current_date)
   AND (ur.valid_until IS NULL OR ur.valid_until >= current_date)
   AND p.active = true
   AND r.is_active = true AND r.deleted_at IS NULL
 ORDER BY entitas, role, nama;
```

**Tindakan sebelum rilis (keputusan Den, bukan sesuatu yang bisa saya putuskan):** pastikan minimal SATU akun `finance_controller` aktif di SOA sebelum butir 40 dijalankan — baik dengan mengaktifkan akun yang sudah ada atau menambah role `finance_controller` ke akun yang tepat (lewat Admin Settings/User Access, bukan SQL manual). Kalau tidak memungkinkan malam itu, pastikan CEO (Azhar Malik) ATAU pemegang `super_admin` benar-benar **siap dan terjaga** untuk membuka Approval di pagi 15 Okt — jangan asumsikan "ada penyetuju di kertas" berarti "ada yang akan benar-benar menyetujui".

**Hasil dijalankan ulang 13 Okt 2026:** penyetuju SOA tersedia — **Bagus Putra Kurnia** (`finance_controller`@SOA) dan **Azhar Malik** (`ceo`@SOA). Konsisten dengan baris 9 Okt 2026 di §Koreksi Data dan Akses Manual — nol perubahan sejak itu.

#### H-1.1 — Pratinjau radius dampak butir 9

Replika PERSIS logika tiga guard di `20260926000002_ar_single_issue_path.sql` (BTB ada → SJ tidak ada yang belum selesai → ada SJ `delivered` ber-`signed_date`), dengan urutan prioritas kategori sama dengan urutan pengecekan di fungsinya (kalau sebuah SP gagal di lebih dari satu guard, ia dihitung di guard yang PERTAMA kali ditolak fungsinya):

```sql
-- READ-ONLY. Aman di production kapan pun -- SELECT murni, nol tabel diubah.
WITH kirim AS (
  SELECT so.id, so.sp_no, so.company_id, so.customer_id,
         COALESCE(SUM(soi.qty),0) AS ordered, COALESCE(SUM(soi.shipped_qty),0) AS shipped
    FROM sp_orders so
    JOIN sp_order_items soi ON soi.sp_order_id = so.id
   WHERE so.deleted_at IS NULL
   GROUP BY so.id, so.sp_no, so.company_id, so.customer_id
),
terkirim_penuh AS (
  SELECT * FROM kirim WHERE ordered > 0 AND shipped = ordered
),
belum_invoice AS (
  SELECT t.* FROM terkirim_penuh t
   WHERE NOT EXISTS (SELECT 1 FROM sp_invoices i WHERE i.sp_order_id = t.id AND i.status <> 'void')
),
kategori AS (
  SELECT b.*,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM sp_btb bt WHERE bt.sp_order_id = b.id AND bt.deleted_at IS NULL)
        THEN '1_tertahan_btb'
      WHEN EXISTS (SELECT 1 FROM delivery_notes d WHERE d.sp_order_id = b.id AND d.status NOT IN ('delivered','cancelled'))
        THEN '2_tertahan_sj_belum_selesai'
      WHEN NOT EXISTS (SELECT 1 FROM delivery_notes d WHERE d.sp_order_id = b.id AND d.status = 'delivered' AND d.signed_date IS NOT NULL)
        THEN '3_tertahan_signed_date_kosong'
      ELSE '4_lolos_bisa_ditagih'
    END AS kategori
  FROM belum_invoice b
)
SELECT kategori, count(*) AS jumlah_sp, string_agg(sp_no, ', ' ORDER BY sp_no) AS daftar_sp
  FROM kategori
 GROUP BY kategori
 ORDER BY kategori;
```

**Cara membaca:** bandingkan total baris dengan angka 25 Sep 2026 (62 total → 5 lolos / 9 tertahan signed_date / 47 tertahan BTB / 1 tertahan SJ). Pergeseran kecil WAJAR (SP baru masuk/invoice baru terbit sejak 25 Sep); pergeseran BESAR (mis. "lolos" tiba-tiba 0 atau total jauh di luar ~60-an) layak ditanyakan sebelum malam rilis, bukan ditemukan saat itu.

**Hasil dijalankan 13 Okt 2026:** total **88 SP** belum ditagih — **32 lolos** (`4_lolos_bisa_ditagih`), **44 tertahan BTB**, **11 tertahan signed_date kosong**, **1 tertahan SJ belum selesai**. Naik dari baseline 25 Sep 2026 (62 total, 5 lolos). ⛔ **Tindakan WAJIB sebelum rilis: cek ke Elvira apakah ke-32 SP kategori "lolos" itu sudah ditagih manual di luar Nexus** (pola sama dengan temuan rekonsiliasi AR Storbit 28-29 Sep — populasi "lolos di Nexus" dan "sudah ditagih di Finance" bisa tidak selaras) — kalau sudah, pastikan tidak dobel-tagih saat Langkah 1A/1F berjalan.

**Siapkan sebagai daftar kerja gudang, dikerjakan SESUDAH rilis.** Kolom `daftar_sp` pada kategori **`1_tertahan_btb`** dan **`3_tertahan_signed_date_kosong`** adalah SP yang akan tetap tidak bisa ditagih sesudah butir 9 live — bukan karena ada yang salah, tapi karena pekerjaan gudangnya memang belum tuntas (BTB belum terbit, atau Surat Jalan sudah `delivered` tapi tanggal tanda tangannya belum diisi lewat "Lengkapi Tanggal Ditandatangani"). **Salin kedua daftar itu sebelum rilis** dan serahkan ke tim gudang sebagai checklist pasca-rilis — begitu masing-masing item diselesaikan (BTB diterbitkan / tanggal diisi), SP itu otomatis pindah ke `4_lolos_bisa_ditagih` tanpa butuh migrasi atau tindakan DB apa pun lagi. Kategori **`2_tertahan_sj_belum_selesai`** TIDAK termasuk daftar ini — itu menunggu Surat Jalannya sendiri selesai dikirim, bukan tindakan administratif.

#### H-1.2 — Pratinjau data yang akan disentuh butir 37 (V0)

Adaptasi V0 di `20260929000009_ar_tahap3_due_date_ttf_backfill.sql`, **TANPA bergantung pada `compute_payment_term_days`** (fungsi itu baru ada sesudah butir 32 dijalankan malam itu — di production HARI INI belum ada). Logika rantai termin di-inline persis dari `20260929000004` (override akun → `entity_finance_settings` → cadangan 30):

```sql
-- READ-ONLY. Aman di production kapan pun -- SELECT murni, nol tabel diubah.
WITH ttf_pick AS (
  SELECT DISTINCT ON (invoice_id) invoice_id, tanggal_ttf
    FROM ar_ttfs
   WHERE invoice_id IS NOT NULL
   ORDER BY invoice_id, created_at ASC
),
term AS (
  SELECT o.id AS sp_order_id,
    COALESCE(
      (SELECT invoice_payment_terms_days FROM accounts WHERE id = o.customer_id),
      (SELECT CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END
         FROM entity_finance_settings efs
         LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
        WHERE efs.company_id = o.company_id LIMIT 1),
      (SELECT efs2.default_payment_terms FROM entity_finance_settings efs2
        WHERE efs2.company_id = o.company_id LIMIT 1),
      30
    ) AS term_days
  FROM sp_orders o
),
calon AS (
  SELECT i.id, i.due_date AS due_date_lama, t.tanggal_ttf,
         CASE WHEN t.tanggal_ttf IS NOT NULL THEN t.tanggal_ttf + tm.term_days ELSE NULL END AS due_date_baru
    FROM sp_invoices i
    JOIN sp_orders o ON o.id = i.sp_order_id
    JOIN term tm ON tm.sp_order_id = o.id
    LEFT JOIN ttf_pick t ON t.invoice_id = i.id
   WHERE i.deleted_at IS NULL AND i.status <> 'void'
)
SELECT
  count(*) AS invoice_hidup_non_void,
  count(*) FILTER (WHERE tanggal_ttf IS NOT NULL) AS ada_ttf,
  count(*) FILTER (WHERE tanggal_ttf IS NOT NULL AND due_date_lama IS DISTINCT FROM due_date_baru) AS due_date_berubah,
  count(*) FILTER (WHERE tanggal_ttf IS NULL AND due_date_lama IS NOT NULL) AS hilang_jadi_belum_ttf,
  count(*) FILTER (WHERE tanggal_ttf IS NULL AND due_date_lama IS NULL) AS tetap_null
FROM calon;

-- Pembanding -- invoice VOID, TIDAK disentuh backfill ini sama sekali:
SELECT count(*) AS invoice_void FROM sp_invoices WHERE deleted_at IS NULL AND status = 'void';
```

⚠️ Angka H-1.2 ini **BUKAN pengganti V0 malam itu** — butir 37 TETAP wajib menjalankan V0 miliknya sendiri (di dalam berkas, sesudah butir 32 live) sebagai syarat menghapus blok STOP KERAS. Gunanya di sini murni supaya Den sudah punya gambaran kasar sebelum malam itu, bukan melihat angka ini untuk PERTAMA KALINYA sambil ditunggu.

**Hasil dijalankan 13 Okt 2026:** production **BELUM PUNYA SATU PUN baris `ar_ttfs`** (nol TTF tercatat). ⛔ **Keputusan Den 13 Okt 2026 — butir 37 DIPINDAH, dijalankan SESUDAH impor TTF di Langkah 4 (bukan di Langkah 1E seperti rencana semula).** Alasan: menjalankan butir 37 selagi `ar_ttfs` masih nol baris berarti backfill `due_date` dari TTF tidak punya satu pun sumber data untuk dipakai — sekitar **500 invoice** (lihat baseline "508 dari 509" di tempat lain dokumen ini) akan kehilangan `due_date` sampai impor TTF benar-benar terjadi, padahal impor TTF itu sendiri adalah fitur HEADLINE rilis ini (Langkah 4.2). Lihat perubahan struktur Langkah 1E/Langkah 4 di bawah untuk detail pemindahannya.

#### H-1.3 — Cek koneksi `pg_dump`/session pooler

Memastikan jalur backup (Langkah 0.1) tidak gagal karena masalah jaringan/kredensial yang baru ketahuan malam itu:

```bash
pg_isready -h aws-1-ap-northeast-2.pooler.supabase.com -p 5432 -d postgres -U postgres.untmpqceexwxzuhlmyrg
# atau, kalau pg_isready tidak tersedia:
psql "postgresql://postgres.untmpqceexwxzuhlmyrg@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" -c "select version();"
```

Harapan: koneksi diterima (password akan diminta/`PGPASSWORD` — **jangan simpan di shell history**). Kalau gagal (timeout/connection refused), ini saatnya memperbaiki jaringan/VPN/kredensial — bukan di tengah Langkah 0 malam rilis.

**Cek versi `pg_dump` lokal terhadap versi server production.** `pg_dump` yang LEBIH LAMA dari server-nya bisa gagal atau diam-diam menghasilkan dump yang tidak lengkap untuk fitur/katalog yang lebih baru — ini WAJIB dicek sebelum malam rilis, bukan ditemukan saat backup Langkah 0.1 sedang berjalan.

```bash
pg_dump --version
```

**Server production (diukur via Supabase API, 7 Okt 2026): PostgreSQL 17.6** (`postgres_engine: 17`). Aturannya: `pg_dump` lokal **wajib versi major 17 atau lebih baru** (pg_dump versi 14/15/16 TIDAK dijamin mengerti seluruh fitur Postgres 17 — risikonya dump gagal keras ATAU "berhasil" tapi kehilangan sesuatu tanpa pesan jelas). Kalau versi lokal lebih lama, **upgrade `pg_dump` dulu** (lewat `brew upgrade libpq`/`postgresql@17` atau sejenisnya) — jangan memaksakan backup dengan versi yang lebih lama hanya karena "biasanya jalan".

**Hasil dijalankan 13 Okt 2026:** `pg_dump` lokal Den versi **18.4** — memenuhi syarat (server production PostgreSQL 17.6, aturan minimal major 17).

#### H-1.4 — Perkiraan durasi tiap kelompok migrasi

**Perkiraan, bukan ukuran** — volume data di production kecil (ratusan baris per tabel yang disentuh, bukan jutaan), jadi waktu eksekusi SQL murni diperkirakan sub-detik sampai beberapa detik per berkas; durasi TOTAL malam itu didominasi **kecepatan Den membaca output dan mengeksekusi satu-per-satu**, bukan beban database.

| Kelompok | Jumlah berkas | Perkiraan | Faktor yang bisa memperlambat |
|---|---|---|---|
| 1A (AR Tahap 1 sisa) | 2 | 2-5 menit | — |
| 1B (AR Tahap 2) | 4 | 5-10 menit | Butir 11 (backfill ~508 invoice) sedikit lebih lama dari sekadar `CREATE FUNCTION`, tetap dalam hitungan detik |
| 1C (Invoice Lengkap) | 10 | 15-25 menit | Paling banyak berkas; butir 19 mengambil lock singkat saat REVOKE jika ada transaksi lain sedang menulis tabel yang sama |
| 1D (checkpoint, nol eksekusi) | 0 | 2-5 menit | Murni membaca & membandingkan, bukan menjalankan apa pun |
| 1E (AR Tahap 3) | 6 | 8-15 menit | Butir 37 **TIDAK lagi di kelompok ini** — dipindah ke Langkah 4.2a (lihat koreksi 13 Okt 2026), dijalankan sesudah impor TTF, bukan di sini |
| 1F (AR Tahap 3b) | 6 | 8-15 menit | — |
| **Total Langkah 1 (tanpa hitung diskusi butir 37)** | **34-35** | **≈ 45-80 menit** | |
| Langkah 2 (merge+deploy) | — | 5-15 menit | Tergantung CI (build+lint) dan apakah lewat PR atau merge langsung |
| Langkah 3 (cek Vercel) | — | 2-5 menit | Build Vercel untuk app ini historisnya ~10 detik (lihat verifikasi rilis Bagian A 7 Okt), tapi beri jeda untuk propagasi alias |
| Langkah 4 (smoke test + impor TTF + butir 37 di 4.2a) | — | 15-30 menit **+ waktu review V0/diskusi butir 37** (tidak bisa diperkirakan, pindah dari baris 1E — lihat koreksi 13 Okt 2026) | Tergantung jumlah dokumen TTF yang diuji & ketersediaan Finance malam itu |

**Perkiraan total malam itu (tanpa menghitung diskusi butir 37, yang bergantung keputusan real-time): ≈ 1,5-2,5 jam.**

### Langkah 0 — Pra-penerbangan (wajib, sebelum butir 6 apa pun)

| # | Langkah | Detail |
|---|---|---|
| 0.1 | Backup penuh production (schema + data) | `pg_dump "postgresql://postgres.untmpqceexwxzuhlmyrg@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" --no-owner --no-privileges > backup_pre_launch_20261014.sql` — **TANPA** `--schema-only` (beda dari refresh `schema_snapshot.sql` yang memang schema-only). Simpan di luar repo. |
| 0.2 | Catat posisi commit `main` SAAT INI (sebelum merge) | `git rev-parse main` — dibutuhkan kalau merge harus di-revert |
| 0.3 | Catat posisi commit `release/2026-10-14` yang akan di-merge | `git rev-parse release/2026-10-14` |
| 0.4 | `node scripts/qa/env-drift-check.mjs` sekali lagi | Harapan: hanya **ANTRE** (= butir 8-46 di bawah) + **SELAMANYA**, **0 DRIFT**. Kalau ada DRIFT tak dikenal, **berhenti dan selidiki** sebelum lanjut — lihat §RUTINITAS SEBELUM UAT di atas. |
| 0.5 | Cadangan ACL segar untuk fungsi yang di-DROP+CREATE malam ini | Butir 9(f) dan 35 mengganti tanda tangan fungsi (gotcha #37) — cadangan ACL 25 Sep **sudah basi**. Ambil `pg_get_functiondef`/`proacl` untuk `create_invoice`, `create_invoice_for_sp`, `submit_invoice`, `record_payment`, `mark_delivery_delivered` **malam ini, sebelum butir 9 dijalankan**. |
| 0.6 | ⛔ **BEKUKAN input Finance DAN input SP/Surat Jalan/BTB gudang** | Minta Finance berhenti menerbitkan/mengubah invoice & pembayaran, dan tim gudang berhenti menginput SP baru, Surat Jalan, dan BTB, **sebelum butir 6 pertama dijalankan**. Alasan: tiga migrasi malam ini (butir 9, 35, 40 — lihat tabel di Langkah 2) mengubah kontrak yang dipakai kode LAMA secara aktif; SP/invoice/pembayaran/BTB yang diinput TEPAT di jendela antara "migrasi commit" dan "kode baru live" berisiko mendarat dalam keadaan tidak konsisten (lihat Langkah 2). **Jendela beku: dari langkah ini sampai Langkah 4.4 (smoke test + `env-drift-check` ulang) selesai dan dinyatakan lolos** — baru sesudah itu Finance dan gudang boleh kembali bekerja normal. |
| 0.7 | ⛔ **Cek status dua migrasi yang SUDAH LIVE tapi filenya baru masuk tabel 17 Okt 2026 (butir 2b/3b) — JANGAN jalankan ulang** | `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='set_sql_on_quotation_sent';` harus mengembalikan 1 baris (butir 2b, LIVE sejak 18 Sep 2026) — kalau file `20260918000001_set_sql_on_quotation_sent.sql` muncul di urutan migrasi malam ini, LEWATI. `SELECT defaclacl FROM pg_default_acl WHERE defaclrole='postgres'::regrole AND defaclobjtype='f' AND defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');` harus mengembalikan 1 baris yang ACL-nya TIDAK memberi EXECUTE ke grantee kosong (`=X`) — kalau file `20261002000002_td300_default_privileges_revoke_execute.sql` muncul di urutan migrasi malam ini, LEWATI (butir 3b, LIVE sejak 2 Okt 2026). |

### Langkah 1 — Migrasi database, urutan WAJIB per kelompok

⚠️ **Tanda berhasil generik, berlaku untuk SEMUA berkas di bawah** (sudah dibangun ke dalam tiap file, tidak diulang per baris): migrasi **COMMIT** tanpa error = lolos. Setiap berkas punya blok `V-PRA` (prasyarat, menolak jalan dengan `RAISE EXCEPTION` kalau basis yang hidup bukan versi yang diharapkan) dan `V-POST` (mengasersi hasil, `RAISE EXCEPTION` kalau ada yang tidak sesuai) — **kalau transaksi COMMIT, blok-blok itu sudah lolos**. Baca `RAISE NOTICE` di output untuk detail yang dicetak (ACL sebelum/sesudah, jumlah baris tersentuh, dll).

#### 1A. AR Tahap 1 sisa — butir 8 → 9

| Urutan | Berkas | Prasyarat | Perhatian khusus |
|---|---|---|---|
| 8 | `20260926000001_set_delivery_signed_date.sql` | — (mandiri) | Aditif, boleh commit sendiri |
| 9 | `20260926000002_ar_single_issue_path.sql` | Butir 6, 7 (✔ sudah live) + butir 8 | ⛔⏳ **Rollback MENYEMPIT sesudah ini jalan** — lihat §Langkah tak-bisa-di-rollback di bawah. **Radius dampak yang DITERIMA**: dari 62 SP terkirim-penuh-belum-invoice, hanya ~5+9=14 langsung bisa ditagih, 47 tertahan BTB (pekerjaan gudang, bukan bug) — **jangan melonggarkan guard kalau radius ini terlihat mengejutkan saat dijalankan, itu memang hasil yang diharapkan** |

#### 1B. AR Tahap 2 — butir 11 → 12 → 13 → 14

| Urutan | Berkas | Prasyarat |
|---|---|---|
| 11 | `20260927000001_invoice_due_date_backfill.sql` | sesudah butir 9 |
| 12 | `20260927000002_account_role_mapping.sql` | — |
| 13 | `20260927000003_journal_account_roles_and_readiness.sql` | butir 9 **dan** 12 |
| 14 | `20260927000004_menu_grant_fin_invoice.sql` | — (tanpa ini, 6.2.1 hanya terlihat super_admin) ⛔ **JALANKAN SEBELUM LANGKAH 4** — satu-satunya izin menu Finance untuk `finance_controller`, lihat ## 14 |

#### 1C. Invoice Lengkap — butir 16 → 17 → 18 → 19 → 21 → 22 → 23 → 24 → 25 → 26

⚠️ **Lihat peringatan anomali versi di kepala bagian "Invoice lengkap (butir 16-25)" di atas — SUDAH DIVERIFIKASI 7 Okt 2026, isinya identik dengan repo, jalankan apa adanya.** ⛔ **`20260928000005` (butir 20) JANGAN dijalankan** — arahnya terbalik, staging-only selamanya.

| Urutan | Berkas | Prasyarat |
|---|---|---|
| 16 | `20260928000001_invoice_header_v2.sql` | — |
| 17 | `20260928000002_invoice_line_v2.sql` | butir 16 |
| 18 | `20260928000003_invoice_issue_v2.sql` | butir 17 **dan** 9 |
| 19 | `20260928000004_invoice_write_lockdown.sql` | butir 18 |
| 21 | `20260928000006_invoice_line_tax_link.sql` | butir 17 |
| 22 | `20260928000007_invoice_post_issue_rpcs.sql` | butir 16 |
| 23 | `20260928000008_invoice_attachments.sql` | butir 16 (mandiri, boleh kapan saja sesudahnya) — **periksa bucket `invoice-docs` benar-benar terbuat** |
| 24 | `20260928000009_invoice_notes.sql` | — (mandiri) |
| 25 | `20260928000010_invoice_issue_tax_link.sql` | butir 18 **dan** 21 |
| 26 | `20260928000011_invoice_coretax_code_whitelist.sql` | butir 22 |

#### 1D. Checkpoint Paket Keamanan TD-281 (H1/H2/H3/H5 — sudah LIVE, nol tindakan baru)

Sebelum lanjut ke AR Tahap 3, konfirmasi cepat objek-objek ini **masih seperti seharusnya** (sudah live sejak 28 & 30 Sep 2026, jadi ini checkpoint, bukan eksekusi):
- `create_invoice`, `create_invoice_for_sp`, `submit_invoice` — ACL `authenticated`-only (butir 9 akan menyentuhnya lagi di langkah 1A, tidak masalah, `CREATE OR REPLACE` + ACL dipasang ulang eksplisit di berkasnya).
- `increment_document_sequence`, `check_similar_accounts`, `complete_picking`, `attach_price_contract_info`, `is_admin_tier_role` — `authenticated`-only; `notify_sp_milestone` — nol grant.
- `env-drift-check.mjs` kategori `hak`: nol drift untuk keenamnya + H3 (8 fungsi `search_path`) + H5 (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN `anon`+`authenticated` di seluruh tabel).

Kalau salah satu di atas TIDAK sesuai, **berhenti** — artinya ada yang berubah di luar urutan dokumen ini sejak 30 Sep, selidiki dulu sebelum lanjut ke AR Tahap 3 (yang membangun di atas asumsi keadaan ini).

#### 1E. AR Tahap 3 — butir 32 → 33 → 34 → 35 → 36 → 38 (butir 37 PINDAH ke Langkah 4, lihat 4.2a)

| Urutan | Berkas | Prasyarat |
|---|---|---|
| 32 | `20260929000004_ar_tahap3_compute_payment_term_days.sql` | — |
| 33 | `20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan.sql` | butir 12 |
| 34 | `20260929000006_ar_tahap3_sp_payments_potongan_kolom.sql` | — |
| 35 | `20260929000007_ar_tahap3_record_payment_v3.sql` | butir 9, 13, 33, 34 — ⛔⏳ **rollback menyempit, lihat di bawah** |
| 36 | `20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql` | butir 18, 25, 32 |

| Urutan | Berkas | Prasyarat |
|---|---|---|
| 38 | `20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali.sql` | butir 36 (TIDAK butuh 37) |

#### 1F. AR Tahap 3 bagian kedua — butir 39 → 40 → 41 → 42 → 43 → 44 → 44a

| Urutan | Berkas | Prasyarat |
|---|---|---|
| 39 | `20260930000001_ar_tahap3b_status_pending_approval.sql` | — |
| 40 | `20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate.sql` | butir 39 — ⛔⏳ **rollback menyempit begitu ada invoice `pending_approval` hidup** |
| 41 | `20260930000003_ar_tahap3b_approve_reject_invoice.sql` | butir 39, 40 |
| 42 | `20260930000004_ar_tahap3b_record_payment_ttf_pending_guard.sql` | butir 39 (boleh sebelum/sesudah 40-41) |
| 43 | `20260930000005_ar_tahap3b_submit_invoice_finance_role.sql` | — (mandiri) |
| 44 | `20260930000006_ar_tahap3b_get_invoice_audit_trail.sql` | — (mandiri, tapi diperlukan panel Riwayat FE) |
| 44a | `20261013000001_ar_tahap3b_invoice_two_stage_approval.sql` | butir 39, 40, 41, 42 — ⛔⏳ **rollback hanya aman kalau nol invoice `pending_manager_approval` hidup.** Sesudah ini COMMIT, lakukan **langkah manual** (bukan SQL): tambahkan peran `finance_manager` ke akun Rini Andriyani @ SOA lewat Admin Settings — lihat ## 44a |

### Langkah 2 — Merge `release/2026-10-14` → `main` dan deploy kode

⛔ **Urutan ini DISENGAJA: migrasi DULU (Langkah 1), kode SESUDAH.** Sebagian besar butir 6-44 aditif/backward-compatible (kolom baru, fungsi baru). **TAPI tiga di antaranya BUKAN sepenuhnya aman untuk kode lama yang masih tayang di `main` selama jendela antara "migrasi commit" dan "kode baru live" — dan itulah alasan Langkah 0.6 (pembekuan) ada:**

| Butir | Yang berubah | Dampak ke kode LAMA (`main`) selama jendela ini |
|---|---|---|
| **9** (`ar_single_issue_path`) | `create_invoice`/`create_invoice_for_sp` dapat 3 guard baru (BTB wajib, SJ harus `delivered`, invariant jurnal) | Signature TETAP sama (kode lama tetap bisa memanggilnya) — tapi tombol "Terbitkan Invoice" di UI LAMA (Detail SP) akan mulai **DITOLAK dengan error yang belum pernah terlihat** untuk SP yang tidak memenuhi guard baru (47 dari 62 SP per radius dampak di atas). **Terlihat jelas** (user dapat pesan error), tapi mengejutkan kalau tidak diberi tahu lebih dulu. |
| **35** (`record_payment` v3) | Tanda tangan bertambah 2 parameter → **DROP signature 7-argumen, CREATE 9-argumen** (gotcha #37) | Kode lama memanggil versi 7-argumen. **Sesudah butir 35, signature itu TIDAK ADA LAGI** — setiap klik "Catat Pembayaran" di UI LAMA akan gagal KERAS (`42883 function does not exist`), bukan sekadar ditolak guard. **Fitur pencatatan pembayaran via UI lama benar-benar tidak bisa dipakai** selama jendela ini. |
| **40** (`create_invoice_for_sp` approval-gate) | Fungsi berhenti langsung menerbitkan (`status='issued'`, `invoice_no` terisi, jurnal terposting) — sekarang berhenti di `status='pending_approval'`, `invoice_no` KOSONG, jurnal belum diposting; penyelesaiannya pindah ke fungsi BARU `approve_invoice_issue` yang tidak ada di UI lama | ⛔⛔ **PALING BERBAHAYA dari ketiganya karena SENYAP** — signature tetap sama, RPC tetap RETURN NORMAL (nol error terlihat), tapi invoice yang "diterbitkan" lewat UI LAMA selama jendela ini akan **tersangkut permanen** di `pending_approval` tanpa nomor invoice dan tanpa jurnal — UI lama tidak punya tombol "Approve" untuk menyelesaikannya. User mengira sudah terbit; Finance baru sadar saat membuka Finance baru dan melihat antrean approval, atau saat mengecek database. Badge status di UI lama untuk nilai `pending_approval` yang tidak dikenalinya akan jatuh ke badge netral/kosong (bukan crash, tapi membingungkan). |

**Inilah sebab Langkah 0.6 mewajibkan pembekuan input Finance DAN input SP/Surat Jalan/BTB gudang SEBELUM butir 6 pertama dijalankan** — tanpa pembekuan, ketiga skenario di atas bisa benar-benar terjadi ke data nyata pada jendela antara commit Langkah 1 dan deploy Langkah 2-3. Dengan migrasi dulu (bukan kode dulu), jendela "kode baru mengharapkan skema yang belum ada" tetap nol detik — kebalikannya (kode dulu, migrasi menyusul) akan membuat SETIAP halaman Finance error, bukan cuma tiga fitur spesifik di atas.

| # | Langkah |
|---|---|
| 2.1 | Buka PR `release/2026-10-14` → `main` di GitHub (disarankan, bukan wajib) — supaya CI (build+lint) jalan dan ada jejak audit; atau merge lokal langsung kalau waktu sempit |
| 2.2 | Tunggu CI hijau (build clean, lint baseline) |
| 2.3 | Merge dengan **merge commit biasa** (bukan squash, bukan rebase, bukan fast-forward-only) — riwayat commit individual yang dibawa `release/2026-10-14` (persis commit-commit yang sampai 11 Okt 2026 masih disebut `develop`, sebelum branch rilis ini dikunci) sudah berulang kali dirujuk per-hash di dokumen ini dan `PROGRESS.md`; squash akan memutus rujukan itu |
| 2.4 | `git push origin main` |
| 2.5 | Catat SHA commit merge yang baru masuk `main` |

### Langkah 3 — Cek deploy Vercel (Production)

| # | Langkah | Tanda berhasil |
|---|---|---|
| 3.1 | Tunggu Vercel build untuk `main` (otomatis dari push 2.4) | — |
| 3.2 | Cek lewat Vercel API/Dashboard: deployment untuk SHA commit merge (2.5) | `state`/`readyState` = **READY**, `alias` mencakup **`nexus.msigroup.co.id`**, `aliasError` = **null** |
| 3.3 | Kalau gagal/`aliasError` tidak null | **Berhenti** — jangan lanjut ke Langkah 4 (smoke test) dengan kode lama yang masih tayang; perbaiki deploy dulu. Migrasi DB di Langkah 1 **tidak perlu di-rollback** untuk ini — ia memang didesain aman dengan kode lama (lihat Langkah 2) |

### Langkah 4 — Verifikasi pasca-deploy (kode + DB keduanya live)

| # | Langkah | Pemilik |
|---|---|---|
| 4.1 | Login sebagai akun `finance`/`finance_controller` nyata, buka **Finance & Accounting › Accounts Receivable › Invoice Management** (6.2.1) | Finance |
| 4.2 | Buka **Invoice Submission & Acknowledgement** (6.2.2), jalankan **"Proses Impor"** (impor TTF massal) dengan batch kecil dokumen TTF fisik yang sudah menumpuk — ini smoke test fitur HEADLINE rilis ini, bukan langkah DB. Konfirmasi status invoice yang diimpor berubah sesuai jumlah TTF yang benar-benar dicocokkan | Finance (Elvira) |
| 4.2a | ⛔⛔ **TITIK BERHENTI WAJIB — butir 37, `20260929000009_ar_tahap3_due_date_ttf_backfill.sql`.** Berkas ini punya `STOP KERAS` tertanam (blok `RAISE EXCEPTION` tanpa syarat) yang **harus tetap ada** sampai langkah ini dijalankan manual. **Dipindah ke SINI (keputusan Den 13 Okt 2026) karena `ar_ttfs` baru punya baris SESUDAH 4.2 berjalan** — menjalankannya lebih awal (rencana semula, Langkah 1E) berarti backfill `due_date` nol sumber data, ±500 invoice kehilangan `due_date` sampai impor TTF terjadi. Prosedur: (1) Jalankan **HANYA** blok **V0** di kepala berkas (read-only, aman) — mengukur berapa invoice production yang `due_date`-nya akan berubah basis, SEKARANG `ar_ttfs` sudah berisi data dari 4.2. (2) **Tunjukkan angka V0 ke Den dan tunggu persetujuan EKSPLISIT malam itu.** (3) **Hanya sesudah disetujui**, hapus/lewati blok STOP KERAS untuk SESI eksekusi ini saja, lalu jalankan sisa berkas. (4) Kalau TIDAK disetujui malam itu: **lewati butir 37 untuk sekarang** — ia tidak memblokir butir 38 (sudah dijalankan di Langkah 1E) atau langkah lain, backfill ini bisa menyusul kapan saja. | Finance/Den |
| 4.3 | Terbitkan SATU invoice baru end-to-end (ajukan → approve → lihat jurnal) untuk membuktikan rantai AR Tahap 1/2/3/3b tersambung di production sungguhan, bukan cuma lolos `V-POST` | Finance/Finance Controller |
| 4.4 | `node scripts/qa/env-drift-check.mjs` sekali lagi | Harapan: seluruh butir 8-44 yang baru dijalankan pindah dari **ANTRE** jadi **cocok** (nol DRIFT baru) |
| 4.5 | Login sebagai akun **Sales** (bukan super_admin), buka sidebar — konfirmasi **nol baris "Soon"** terlihat | Siapa pun yang pegang akun uji Sales |
| 4.6 | Dari akun yang sama, konfirmasi kartu **"Layanan Karyawan"** tampil di Beranda dan kedua tombolnya ("Buat Permintaan"/"Permintaan Saya") membuka halaman HRGA | Siapa pun yang pegang akun uji Sales |
| 4.7 | Login sebagai akun **gudang/Operations**, buka Detail SP yang Surat Jalannya sudah `delivered`, isi tanggal tanda tangan lewat **"Lengkapi Tanggal Ditandatangani"** — fitur ini BARU di production malam ini (butir 8) | Gudang |
| 4.8 | Dari akun yang sama atau admin, buka **Edit Item SP**, ketik ongkir **`1.766.050`**, simpan, buka lagi — konfirmasi nilainya **tetap `1.766.050`**, BUKAN berubah jadi `1,77` (regresi lama yang baru ditutup di commit `4d81943`, 7 Okt 2026) | Gudang/Admin |
| 4.9 | Login sebagai akun **Bagus Putra Kurnia** (`finance_controller`), pastikan menu "Billing / Invoice" tampil di sidebar dan tab invoice **"Menunggu Persetujuan"** (`pending_approval`) bisa dibuka. ⚠️ **JANGAN tekan tombol Setujui atau Tolak pada invoice ASLI selama smoke test ini** — persetujuan nyata PERTAMA dilakukan Pak Bagus sendiri pada 15 Okt (bukan bagian smoke test malam rilis) | Finance Controller (Bagus) |
| 4.9a | **Prasyarat: langkah manual "peran `finance_manager` untuk Rini" (## 44a) sudah dikerjakan Den.** Login sebagai akun **Rini Andriyani** (`finance_manager`@SOA), pastikan menu "Billing / Invoice" tampil di sidebar dan invoice yang baru diajukan (dari 4.3 atau pengajuan lain malam itu) menampilkan status **"Menunggu Persetujuan Manager"** (`pending_manager_approval`) sebagai teks, bukan status mentah/kosong. ⚠️ **Tombol Endorse/Lompat Tahap/Approve/Reject SENGAJA BELUM ADA di rilis ini** (menunggu mockup Invoice Management final) — langkah ini murni cek peran + visibilitas menu + bacaan status, BUKAN uji tombol. Jangan laporkan "tombol tidak ada" sebagai bug | Finance Manager (Rini) |
| 4.9b | ⛔ **Konsekuensi operasional revisi 13 Okt 2026 (bukan bug, dicatat supaya tidak mengejutkan malam itu): akun `super_admin` TIDAK LAGI BISA menyetujui/endorse/skip/menolak invoice** — keempat RPC persetujuan kini menolak `super_admin` sama sekali. Pastikan Bagus (`finance_controller`) DAN/ATAU Adam (`ceo`) terjaga malam itu, jangan mengandalkan `super_admin` sebagai cadangan kalau penyetuju lain tidak aktif | Siapa pun yang memverifikasi kesiapan rilis |

⚠️ **Butir 4.3 memakai invoice SUNGGUHAN, bukan data uji yang bisa dihapus.** Nomor invoice yang keluar **permanen** (preseden: nomor 0012/0013 terpakai permanen dari insiden 7 Sep 2026), jurnalnya **benar-benar terposting**, dan **jalur void belum ada** di rilis ini — begitu terbit, tidak ada tombol untuk membatalkannya. **Wajib memakai SP yang memang sudah waktunya ditagih** (ambil dari kategori `4_lolos_bisa_ditagih` hasil H-1.1/pengukuran ulang malam itu) — JANGAN memakai SP sembarangan "cuma untuk tes".

### Langkah 5 — Penutup

| # | Langkah |
|---|---|
| 5.1 | Refresh `supabase/schema_snapshot.sql` (`pg_dump --schema-only --schema=public`, pooler Seoul) |
| 5.2 | Update kolom **Production** di tabel Ringkasan (atas dokumen ini) + setiap butir 8-44 yang dijalankan malam ini jadi ✔ beserta tanggal |
| 5.3 | Catat SHA commit `main` final (pasca-merge) di `PROGRESS.md` |
| 5.4 | Kalau butir 37 DILEWATI (tidak disetujui malam itu), catat eksplisit sebagai **TERTUNDA**, bukan dihapus dari antrean |

### Kriteria batal dan titik tanpa jalan mundur

**Titik tanpa jalan mundur malam ini = begitu butir 9 COMMIT.** Sebelum itu (butir 6-7 sudah live, butir 8 murni aditif), kontrak yang dipakai kode LAMA belum tersentuh sama sekali.

**Kalau SATU berkas gagal SEBELUM butir 9 commit** (termasuk butir 9 itu sendiri, kalau ia gagal di tengah jalan — setiap berkas dibungkus `BEGIN...COMMIT` sendiri, jadi kegagalan `RAISE EXCEPTION` dari V-PRA/V-POST membatalkan TRANSAKSI ITU SENDIRI secara otomatis, nol perubahan tersisa):
1. **BERHENTI.** Production = persis seperti sebelum malam ini dimulai.
2. **JANGAN lanjut ke Langkah 2 (merge `release/2026-10-14` → `main`).**
3. **Tunda rilis** — jadwalkan ulang, jangan dipaksakan malam itu.
4. **Buka kembali pembekuan Langkah 0.6** — Finance dan gudang boleh kembali bekerja normal; belum ada satu pun kontrak yang berubah untuk mereka.

**Begitu butir 9 COMMIT**, kode lama dan baru sama-sama tunduk pada tiga guard barunya, dan tabel "Langkah yang TIDAK bisa di-rollback dengan aman" di bawah mulai berlaku. Kalau SATU berkas gagal SESUDAH titik ini (di mana pun di Langkah 1B-1F):
- Rollback per-berkas (kolom Rollback di tiap file migrasi) **TIDAK lagi mengembalikan production ke keadaan "fitur lama berfungsi penuh seperti sebelum malam ini"** — ia hanya membalikkan OBJEK database itu sendiri, bukan konsekuensi yang sudah terjadi di data nyata selama guard baru aktif (lihat tabel di Langkah 2: invoice/pembayaran yang sempat diproses lewat kode LAMA sesudah butir 9/35/40 commit tidak otomatis "benar lagi" hanya karena fungsinya dikembalikan).
- **Pilihannya hanya DUA sejak titik ini:** (a) **perbaiki forward** — cari akar masalah berkas yang gagal, benahi, lanjutkan urutan Langkah 1 dari situ; atau (b) **pulihkan SELURUH production dari backup Langkah 0.1** (`backup_pre_launch_20261014.sql`) dan tunda rilis.

**Siapa yang memutuskan antara (a) dan (b): Den.** Ini bukan keputusan teknis yang diambil sepihak di tengah eksekusi.

⏱️ **Batas waktu yang saya usulkan: 30 menit** dari saat kegagalan pertama kali terlihat. Kalau dalam 30 menit itu akar masalahnya BELUM jelas (bukan "belum selesai diperbaiki" — tapi "belum tahu kenapa gagal"), **pindah ke opsi (b)** daripada terus mencoba menebak di bawah tekanan waktu tengah malam. Angka ini usulan, bisa Anda sesuaikan — alasannya: memulihkan dari backup punya durasi yang bisa diperkirakan dan PASTI selesai, sementara "terus mencoba memperbaiki" di tengah insiden tanpa tahu akar masalah punya risiko durasi tak terbatas, dan setiap menit tambahan memperpanjang jendela pembekuan Finance/gudang.

### Langkah yang TIDAK bisa di-rollback dengan aman

| Butir | Kapan rollback berhenti aman | Kalau sudah lewat titik itu |
|---|---|---|
| 9(f) — DROP `mark_delivery_delivered(uuid)` | Begitu fungsi 2-argumen dipakai sesudahnya | Reversibel (buat ulang overload-nya), tapi pakai cadangan ACL **segar malam ini** (Langkah 0.5) — cadangan 25 Sep sudah basi |
| 35 — `record_payment` v3 (`potongan_lain`) | Begitu SATU pembayaran nyata mencatat `potongan_lain > 0` | Rollback ke v2 akan menghapus kemampuan mencatat potongan itu untuk baris yang sudah terlanjur memakainya |
| 37 — backfill `due_date` dari TTF | Begitu SIAPA PUN mengoreksi manual `due_date` sebuah invoice sesudah backfill jalan | Rollback hanya mengembalikan baris yang `due_date`-nya **masih sama** dengan hasil backfill — koreksi manual sesudahnya tidak ditimpa (ini FITUR rollback-nya, bukan celah) |
| 40/41 — status `pending_approval` | Begitu SATU invoice nyata melalui alur ajukan→approve/reject | Rollback DROP fungsi/kolom akan menghapus jejak invoice yang sudah lewat alur baru itu |

**Mitigasi untuk keempatnya: jalankan 9, 35, 40 secara berurutan TANPA jeda operasional di antaranya** (nol invoice/pembayaran nyata diproses user di sela-sela langkah migrasi) — menyempitkan jendela antara "migrasi commit" dan "rollback masih 100% bersih" serapat mungkin.

### TD-300 Group E — SENGAJA DI LUAR jendela rilis ini

⛔ **TD-300 Group E (lihat `08_TECH_DEBT.md` TD-300 dan migrasi `20261007000001_td300_group_e_revoke_public_execute.sql`) BUKAN bagian naskah malam ini.** Ia pemblokir keamanan yang **terpisah**, dengan keputusan go/no-go **sendiri** — bukan prasyarat, bukan dependensi fungsional AR Tahap 1-3b, dan tidak ada halaman/fitur rilis 14-15 Okt yang bergantung padanya. Alasan dipisah: cakupannya (sampai ~90 fungsi, badan belum dibaca satu-per-satu) jauh lebih besar dan lebih baru (ditulis 7 Okt 2026, belum pernah diuji sekali pun) dibanding rantai AR yang sudah lolos uji staging penuh berminggu-minggu. **Jangan jalankan di malam yang sama dengan Langkah 1-5 di atas** — jadwalkan sesi TERSENDIRI, hanya sesudah migrasi ini lolos SELURUH langkah uji staging (lihat ekor berkas migrasinya), termasuk dua uji nyata (signup user baru, DML pada tabel bertrigger) yang tidak bisa digantikan pembacaan kode.

---

## Paket 2 Lead Pool (butir 47-57) — MUNDUR ke awal November 2026, BUKAN bagian malam rilis 14 Oktober itu

> **Sifat berbeda dari seluruh butir di atas.** Butir 1-46 + §Naskah Eksekusi Malam Rilis adalah rantai AR Storbit yang **JUGA mundur ke awal November 2026** (keputusan Den 13 Okt 2026, terpisah dari keputusan TD-318 di bawah — lihat §Naskah Eksekusi Malam Rilis untuk detail). ⚠️ **Rekomendasi yang dicatat: AR dan Lead Management (TD-318) dirilis di MALAM BERBEDA** — AR lebih dulu, Lead Management beberapa hari sesudah AR stabil; jangan dibaca sebagai satu malam gabungan. Sebelas berkas migrasi di bawah ini (+ dua Edge Function + satu langkah manual staging-only, butir 47-58) adalah pekerjaan TERPISAH — Lead Management "Paket 2" (Batch DS 3, irisan 7-9) — yang **TIDAK termasuk** jendela rilis AR itu sama sekali. **Jangan jalankan berkas-berkas ini di malam yang sama dengan Langkah 1-5 §Naskah Eksekusi** — jadwalkan sesi tersendiri. ⛔ **Keputusan Den 13 Okt 2026: jadwal MUNDUR dari "sesudah 14 Oktober 2026" menjadi target awal November 2026.** Syarat: Fase 1 DAN Fase 2 dari TD baru hasil audit mockup Lead Management (lihat `08_TECH_DEBT.md` TD-318) harus SELESAI dan LOLOS TES DI STAGING dulu — launching (migrasi Paket 2 ke production) tidak boleh dijadwalkan sebelum syarat itu terpenuhi. Alasan: audit 13 Okt 2026 menemukan implementasinya belum persis mockup (386 temuan); detail lengkap di TD-318.
>
> **Status staging vs production diukur dari DUA sumber yang harus cocok, bukan dikarang dari salah satu:** tanggal commit (`git log`) DAN baris `Status:` di header tiap berkas migrasi itu sendiri. Seluruh **sebelas** berkas sudah **JALAN DI STAGING** sebagai commit sungguhan — dua yang pertama 11 Okt 2026, sembilan sisanya 12 Okt 2026, **termasuk butir 54** (dikonfirmasi langsung ke staging oleh Den 12 Okt 2026: tabel `accounts_lead_pool_backup_20261012` ada, constraint `account_pool_history_event_type_check` sudah sembilan nilai — lihat §54 untuk angka lengkapnya; jangan tertukar dengan uji coba **dry-run** di PRODUCTION yang terpisah, lihat §Catatan uji coba). **Production: BELUM SATU PUN dijalankan sungguhan (commit).**

**Urutan production yang MENGIKAT** (ditulis eksplisit per nama berkas, supaya tidak ambigu — perhatikan khusus butir 54 yang akhiran nomor filenya `...009` tapi WAJIB jalan SEBELUM butir 55 yang akhiran nomor filenya `...006`, terbalik dari urutan angka di nama file):

**47 → 48 → 49 → 50 → 51 → 52 → 53 → 54 → 55 → [LANGKAH MANUAL "9a", lihat §56] → 56 → 57.**

Ini identik dengan urutan yang ditulis sendiri di header berkas butir 54: *"URUTAN PRODUCTION LENGKAP (mengikat): 1, 2, 3, 4, 5, 9, 6, 7, 8"* — di mana angka-angka itu adalah akhiran nomor file dalam seri `20261012*` (1=skema/butir 49, 2=RPC/butir 50, 3=trigger/butir 51, 4=approval roles/butir 52, 5=aging threshold/butir 53, 9=legacy cleanup/butir 54, 6=notifications/butir 55, 7=quotation lock/butir 56, 8=sweep notify/butir 57).

---

### 47. `20261011000001_crm_lead_capture_fields`

| | |
|---|---|
| Isi | 9 kolom baru `accounts` (`industry`, `lead_category`, `priority`, `website`, `description`, `qualified_reason`, `qualified_at`, `competitor_name`, `competitor_price`) + 2 kolom baru `contacts` (`whatsapp`, `preferred_channel` + `CHECK` tiga nilai) |
| Staging | ✔ **dijalankan 11 Okt 2026** (commit `66dde46`) |
| Production | ⛔ belum |
| Sifat | Aditif murni — nol kolom diubah/di-drop, nol tabel baru, nol GRANT baru (kolom baru otomatis ikut cakupan GRANT table-level yang sudah ada). Mandiri |

**Untuk apa.** Field baru untuk layar Capture Lead + Detail Lead (tab Overview/Contacts) sesuai mockup `design-handoff/mockup/Lead Management.dc.html`. `qualified_at` adalah sumbu status "Qualified" di layar baru: `lifecycle_stage IN ('lead','mql') AND qualified_at IS NULL` = Raw, `IS NOT NULL` = Qualified — diisi lewat aksi "Mark Qualified" di UI, **bukan** trigger DB. `competitor_name`/`competitor_price` menyalin pola kolom yang sudah ada di `inquiries` (bukan tabel/relasi baru) — relevan untuk Mark as Lost **sebelum** lead sempat jadi inquiry. **Pemakai FE konkret (ditambahkan 16 Okt 2026, audit TD-318 Irisan 1):** `src/modules/crm/lead/pages/LeadCapturePage.jsx` (`.select()` `industry`/`priority`/`qualified_at`), `src/modules/crm/lead/components/CaptureLeadModal.jsx` (INSERT `industry`/`lead_category`/`priority`; kolom `contacts.whatsapp` di INSERT kontak), `src/modules/crm/lead/components/ImportLeadsModal.jsx` (INSERT `description`) — ketiganya tertahan gerbang branch `develop`→`main` yang sama dengan `LeadQualificationPage.jsx` (lihat `08_TECH_DEBT.md` TD-318 §Irisan 0c "Perluasan cakupan"). **+Pemakai baru (17 Okt 2026, TD-318 Irisan 3):** `src/modules/crm/lead/components/MarkAsLostModal.jsx` menulis `competitor_price` (field "Competitor Price", TD-318 #9) saat `lostReason` menunjuk kompetitor — tertahan GERBANG YANG SAMA, tidak membuka butir baru.

**Rollback.** `DROP COLUMN` untuk kesebelas kolom — aman selama belum ada baris terisi.

---

### 48. `20261011000002_crm_lead_master_data_requests`

| | |
|---|---|
| Isi | Tabel baru `dropdown_option_requests` (RLS: SELECT untuk manager-ke-atas/pengaju sendiri, INSERT untuk pengaju, NOL policy UPDATE/DELETE) + 3 RPC (`add_dropdown_option_direct`, `approve_dropdown_option_request`, `reject_dropdown_option_request`, ketiganya `SECURITY DEFINER` + `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`) + seed `dropdown_options` (12 baris `lead_industry`, 3 baris `lead_category`, 6 baris `lost_reason`, semua `company_id NULL`/global) |
| Staging | ✔ **dijalankan 11 Okt 2026** (commit `66dde46`) |
| Production | ⛔ belum |
| Sifat | Mandiri — header file menegaskan eksplisit "TIDAK bergantung pada migrasi lain yang belum jalan" |

**Untuk apa.** Infrastruktur rule 5 mockup Lead Management: "manager menambah langsung, sales mengajukan, peran lain hanya membaca". Tabel `dropdown_options` sendiri sudah ada sejak lama (migrasi `20260827000001`) tapi tulisnya super_admin-only tanpa tingkatan — file ini menambah jalur pengajuan+persetujuan TANPA mengubah tabel `dropdown_options` atau RLS-nya yang sudah ada. Satu-satunya jalur tulis baru `dropdown_options` tetap `add_dropdown_option_direct` (dipanggil manager langsung ATAU oleh `approve_dropdown_option_request` sesudah sales mengajukan) — satu badan logika untuk kedua pintu masuk. Nilai `lead_category` (3) dan `lost_reason` (6) dikonfirmasi Den 11 Okt 2026 dan ditulis ke file migrasi **sesudah** eksekusi staging (file mencerminkan keadaan DB yang sebenarnya) — `ON CONFLICT` memakai predikat index unik parsial `dropdown_options_global_unique ON (list_key, value) WHERE company_id IS NULL`, idempoten untuk environment yang belum punya baris-baris ini.

**Pemakai FE konkret (ditambahkan 17 Okt 2026, TD-318 Irisan 3):** `src/kit/MasterSelect.jsx` (`onAdd` → RPC `add_dropdown_option_direct` langsung dari popover dropdown) dan `src/modules/crm/components/RequestNewOptionModal.jsx` (INSERT `dropdown_option_requests` untuk peran non-manager) — dipanggil dari `CaptureLeadModal.jsx`/`LeadDetailPage.jsx`/`MarkAsLostModal.jsx` (Industry/Lead Category/Lost Reason). Tertahan GERBANG YANG SAMA dengan butir 47, tidak membuka butir baru. Data uji staging (Vir): opsi `lead_industry` "test industry" (`test_industry`) + satu baris `dropdown_option_requests` "test" — **tidak ikut ke production**.

**Rollback.** Ekor file — `DELETE` ketiga seed + `DROP FUNCTION` ketiga RPC + `DROP TABLE dropdown_option_requests`, aman selama belum ada baris pengajuan/penolakan.

---

### 49. `20261012000001_crm_lead_pool_schema`

| | |
|---|---|
| Isi | 5 kolom baru `accounts` (`lead_pool_last_owner`, `pull_requested_by`, `pull_rejection_reason`, `is_stale`, `stale_flagged_at`) + 1 kolom baru `companies` (`aging_baseline_at`) + tabel baru `account_pool_history` (audit-only, RLS: SELECT untuk pemegang izin `crm_lead_pool_approval` di entitas baris ATAU pelaku sendiri, NOL policy tulis untuk `authenticated` — hanya RPC `SECURITY DEFINER` butir 50 yang menulis) + 2 helper function baru `has_menu_permission_in(company_id, menu_key, action)` dan `lead_pool_approvers(company_id)` |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `6a36ca6`) |
| Production | ⛔ belum |
| Sifat | Fondasi — file 1/4 rangkaian skema Lead Pool BARU (prinsip baru: pool = akun TANPA pemilik, tarik = KLAIM kepemilikan, penuaan hanya menandai `is_stale`, tidak lagi memindahkan ke pool). Butir 50-52 bergantung pada objek-objek di file ini |

**Untuk apa.** Mengganti mekanisme pool LAMA (`is_in_lead_pool` yang tak pernah mengosongkan `assigned_to`, persetujuan tanpa RPC) dengan prinsip baru. `lead_pool_last_owner` beda dari `pull_approved_by`/`pull_requested_by` yang sudah ada — kolom lama mencatat **siklus tarikan**, kolom baru mencatat **siklus pelepasan**. `pull_requested_by` sendiri BARU — mekanisme lama tidak pernah mencatat siapa yang mengajukan tarikan, hanya siapa yang menyetujui. `is_stale`/`stale_flagged_at` menggantikan "penuaan otomatis pindah ke pool" (cron `aging-pipeline-harian` sudah dimatikan sejak 11 Okt 2026 — lihat baris itu di §Koreksi Data dan Akses Manual) — penuaan sekarang HANYA menandai, tidak memindahkan kepemilikan. `aging_baseline_at` sengaja **tidak diisi** migrasi ini (nol nilai historis untuk dikarang) — diisi manual per entitas saat Paket 2 rilis (lihat §Urutan konfigurasi penuaan di bawah). **Pemakai FE konkret (ditambahkan 16 Okt 2026, audit TD-318 Irisan 1):** `src/modules/crm/lead/pages/LeadCapturePage.jsx` men-`.select()` `is_stale`/`stale_flagged_at` untuk badge "Stale" + sentinel filter Status "Stale" — tertahan gerbang branch yang sama (lihat `08_TECH_DEBT.md` TD-318 §Irisan 0c "Perluasan cakupan").

⭐ **`has_menu_permission_in` MENIRU PERSIS logika resolusi 3-tingkat `AuthContext.jsx` (FE), bukan memperbaiki/memperketatnya** — kalau FE kelak diperketat per-entitas, fungsi ini WAJIB ikut diubah, kalau tidak RPC bisa menolak aksi yang UI-nya masih menampilkan tombolnya (atau sebaliknya).

**Rollback.** `DROP FUNCTION` kedua helper + `DROP TABLE account_pool_history` + `DROP COLUMN` keenam kolom — aman selama butir 50-52 belum jalan.

---

### 50. `20261012000002_crm_lead_pool_rpc`

| | |
|---|---|
| Isi | 4 RPC siklus pool baru: `lead_pool_release(account_id, reason)`, `lead_pool_request_pull(account_id, reason)`, `lead_pool_approve_pull(account_id)`, `lead_pool_reject_pull(account_id, reason)` — semua `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`, menulis riwayat ke `account_pool_history`. Plus rancangan `lead_pool_sweep_deactivated_owner(user_id)` (`service_role` ONLY — badannya disempurnakan lagi di butir 57) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `6a36ca6`) |
| Production | ⛔ belum |
| Sifat | Bergantung pada butir 49 (kolom `accounts`/`companies`, tabel `account_pool_history`, `has_menu_permission_in`) |

**Untuk apa.** Gerbang izin SELURUH empat RPC siklus lewat `has_menu_permission_in(company_id, 'crm_lead_pool_approval', 'view')` — **BUKAN** level peran — supaya Finance (`manager`/`finance_controller`, level ≤ 6) tidak ikut berhak meski level-nya tinggi. `lead_pool_approve_pull` punya guard self-approval (pemegang izin **DAN BUKAN** pengaju sendiri). `lead_pool_request_pull` nol gerbang peran (siapa pun authenticated boleh mengajukan), alasan wajib minimal 20 karakter. Transisi `lifecycle_stage` free_agent→customer hanya terjadi di `lead_pool_approve_pull`; `account_status` dan `pipeline_stage` **sengaja tidak disentuh** (kolom pertama "dipensiunkan sejak 7 Sep 2026", kolom kedua instruksi eksplisit).

**Rollback.** `DROP FUNCTION` kelima fungsi — aman kalau belum ada baris riwayat `account_pool_history` yang bergantung padanya.

---

### 51. `20261012000003_crm_lead_pool_triggers`

| | |
|---|---|
| Isi | Menambahkan pengosongan `is_stale`/`stale_flagged_at` ke DUA trigger promosi yang sudah ada (`set_prospect_on_inquiry`, `set_sql_on_quotation_sent`) — begitu akun disentuh aktivitas nyata (inquiry baru, quotation terkirim), tanda stale tak lagi berlaku. Badan selebihnya TIDAK diubah |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `6a36ca6`) |
| Production | ⛔ belum |
| Sifat | Bergantung pada butir 49 (`accounts.is_stale`/`stale_flagged_at`) |

⚠️ **Temuan drift yang dikoreksi DI DALAM file ini sendiri sebelum dijalankan (12 Okt 2026, dicek langsung ke database oleh Den) — murni catatan, bukan TD baru.** Draft pertama file ini mengasumsikan `set_prospect_on_inquiry` sudah dibersihkan jadi hanya menulis `lifecycle_stage` (badan dari `20260908000002_accounts_lifecycle_drop_legacy`, dikira sudah live karena "tercatat sudah berjalan di produksi"). Asumsi itu salah — badan yang SUNGGUH live di production DAN staging hari ini **masih dual-write** `account_status`+`lifecycle_stage`, konsisten dengan status `20260908000002` yang memang masih ⛔ STOP di seluruh dokumen governance lain (TD-246; Keputusan Terbuka #35 di `09_ROADMAP.md`). File ini sudah dikoreksi memakai badan dual-write yang sungguh live sebagai dasar sebelum dijalankan di staging — jadi **tidak mengubah** fakta bahwa drop-legacy belum jalan, hanya memastikan file ini sendiri menyalin badan yang benar. `set_sql_on_quotation_sent` tidak terdampak temuan ini — badannya sudah terkonfirmasi sama dengan yang live.

**Rollback.** Kembalikan kedua fungsi ke badan sebelum file ini (tanpa blok pengosongan `is_stale`).

---

### 52. `20261012000004_crm_lead_pool_approval_roles`

| | |
|---|---|
| Isi | §1 tambah izin `view` menu `crm_lead_pool_approval` untuk 3 role supervisor (`bd_sales_spv_console`, `bd_sales_spv_forwarding`, `bd_digital_marketing_spv`) · §2 **CABUT** izin `view` menu itu dari role `manager` (`DELETE`, baris 70) · §4 set `roles.level = 6` untuk `bd_digital_marketing_spv` (idempoten, `WHERE level <> 6`) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `6a36ca6`) — menulis ulang hasil akhir yang SAMA secara idempoten; SEBAGIAN sudah dikerjakan manual Den di staging sebelum file ini ditulis (lihat header file) |
| Production | ⛔ belum |
| Sifat | Mandiri — nol dependensi pada butir 49-51; murni data `role_menu_permissions`/`roles` |

**Perhatian khusus untuk siapa pun yang menjalankan file ini di production: baris 70 berisi statement `DELETE`.** Statement itu menghapus izin `view` menu `crm_lead_pool_approval` untuk role **`manager` (generik)** — sesuai aturan 2 mockup ("supervisor sales ke atas", BUKAN "manager generik ke atas", keputusan Den). Peran yang **tetap** berhak menyetujui tarikan Lead Pool sesudahnya: `ceo`, `gm_bd`, `gm`, `admin`, plus ketiga role supervisor dari §1. `DELETE` ini **aman/idempoten secara alami** — kalau baris `manager` untuk menu itu sudah tidak ada (sudah dihapus manual di staging sebelumnya, atau belum pernah ada di production), statement ini nol baris terhapus, nol error. Ia **dijalankan dalam proses yang sama seperti seluruh SQL di dokumen ini** — manual oleh Den di SQL Editor/`execute_sql`, bukan lewat runner migrasi otomatis terpisah — jadi tidak ada mekanisme tersembunyi yang membedakannya dari `INSERT`/`UPDATE` lain di file ini; ia hanya layak diperhatikan khusus karena **menghapus** hak akses yang sebelumnya ada (role `manager` kehilangan izin), bukan menambahkannya.

**Rollback.** Ekor file — `INSERT` kembali baris `manager`, `DELETE` ketiga baris supervisor. **TAPI** `roles.level` `bd_digital_marketing_spv` **TIDAK** dirollback ke 7 — mengembalikannya akan merusak keadaan yang sudah benar kalau staging/production sudah 6 sebelum file ini jalan; konfirmasi dulu level SEBELUM file ini jalan di environment itu.

---

### 53. `20261012000005_crm_lead_aging_threshold_policy`

| | |
|---|---|
| Isi | Pelebaran `sla_policies_type_check` (+`'lead_aging'`) dan `sla_policies_axis_check` (+cabang baru, mensyaratkan `transport_mode`/`target_status`/`target_scope` SEMUANYA NULL) + seed SATU baris per company AKTIF (code `LEAD_STALE`, threshold 14 hari, `action='flag_stale'`) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `be52eed`) — versi yang jalan SAMA dengan isi file ini SESUDAH koreksi cast `sla_policies_type_check` + GRANT `service_role` (commit `38c8b8b`), bukan versi awal `be52eed` |
| Production | ⛔ belum |
| Sifat | Nol FK langsung ke butir 49/51 (`is_stale`/`stale_flagged_at`/`aging_baseline_at`) — hanya hubungan LOGIS lewat kode Edge Function `aging-pipeline` (ditulis ulang di commit yang sama, `be52eed`, lihat §Dua Edge Function di bawah) |

**Untuk apa.** KEPUTUSAN Den (irisan 8): penuaan **TIDAK LAGI** memindahkan lead ke Lead Pool — hanya menandai `is_stale` + notifikasi ke pemilik. Kepemilikan tidak pernah berubah karena penuaan (beda total dari mekanisme lama `AGING_RULES` yang dihapus dari `aging-pipeline/index.ts` di commit yang sama). Ambang hari diam per entitas kini di `sla_policies`, bukan hardcode di kode EF — bisa diubah per entitas tanpa deploy ulang. Pelebaran constraint-nya MELEBARKAN saja, TIDAK mempersempit cabang lama (`prf_response`/`deal_aging`/`account_dormancy`) — baris existing tidak terdampak.

**Rollback.** Persempit kembali kedua constraint (hanya aman kalau belum ada baris `lead_aging` tersisa) + `DELETE` baris seed `LEAD_STALE`.

---

### 54. `20261012000009_crm_lead_pool_legacy_cleanup` — ⛔⛔ STATUS KHUSUS, baca sebelum menjalankan

| | |
|---|---|
| Isi | Migrasi data SATU KALI (bukan skema baru): menyelaraskan **1.183 akun production** (`is_in_lead_pool=true`, `deleted_at IS NULL`) yang lahir dari mekanisme pool LAMA ke aturan BARU (pool = akun TANPA pemilik) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit sungguhan, bukan dry-run) — dikonfirmasi langsung ke staging oleh Den: tabel `accounts_lead_pool_backup_20261012` ADA, dan constraint `account_pool_history_event_type_check` sudah berisi **sembilan** nilai termasuk `'legacy_pool_exit'`. Baris riwayat ber-`event_type='legacy_pool_exit'` di staging = **0** — ini WAJAR, bukan tanda migrasinya gagal: populasi akun pool di staging (`is_in_lead_pool=true`) hanya **7 akun, semuanya TANPA pemilik AKTIF** (beda dari production yang 1.183 akun dengan campuran pemilik aktif/nonaktif/tanpa-pemilik). Karena nol akun pool staging berpemilik aktif, kelompok "keluar pool, `assigned_to` tetap" (yang menulis `legacy_pool_exit`) nol baris — ketujuh akun itu semuanya jatuh ke kelompok "tetap di pool tanpa pemilik" (`enter_pool`) atau sudah sesuai aturan baru sejak awal |
| Production | ⛔ **belum** (commit sungguhan) — HANYA pernah diuji **dry-run**, lihat §Catatan uji coba di bawah |
| Sifat | Harus jalan **SEBELUM butir 55** (`20261012000006`, posisi 9 dalam daftar) — DUA alasan independen, dijelaskan di header kedua file secara saling-silang |

**Dua alasan file ini wajib jalan sebelum butir 55:**

1. **Trigger baru di butir 55**, `trg_block_inquiry_for_pooled_account`, menolak INSERT inquiry baru untuk akun mana pun yang `is_in_lead_pool = true` — **termasuk akun pool LAMA yang masih punya pemilik** (pool lama tidak mengikuti aturan "pool = tanpa pemilik" yang baru). Kalau butir 55 dijalankan duluan, sales/BD yang account-nya masih di pool lama akan **mendadak tidak bisa membuat inquiry baru** untuk akun itu, tanpa penjelasan yang jelas kenapa (pesan errornya bicara soal Lead Pool, bukan soal "akun ini warisan sistem lama").
2. **Butir 55 juga melebarkan `account_pool_history_event_type_check`** menjadi **sembilan** nilai (delapan lama + `'legacy_pool_exit'`, nilai yang baru ditulis file ini). `ADD CONSTRAINT` dengan sembilan nilai itu akan **GAGAL** di production kalau butir 54 belum menulis baris `'legacy_pool_exit'`-nya lebih dulu (ADD CONSTRAINT memeriksa baris yang SUDAH ADA terhadap daftar baru — kalau urutannya dibalik, migrasi 55 batal total).

**Apa yang dilakukan migrasi ini** (ringkas; lihat isi file untuk SQL lengkap). Backup penuh ke `accounts_lead_pool_backup_20261012` → Kelompok 1 (pemilik AKTIF, 1.079 akun diproyeksikan) keluar dari pool TAPI `assigned_to` tetap, 28 pull pending ditutup + dinotifikasi lebih dulu (riwayat `legacy_pool_exit`) → Kelompok 2/3 (pemilik nonaktif/tanpa pemilik) mengikuti aturan sweep `lead_pool_sweep_deactivated_owner` PERSIS (disalin verbatim): lead/mql tanpa inquiry/quotation terbuka tetap di pool TANPA pemilik (riwayat `enter_pool`), sisanya keluar pool dengan `pull_*` **dikosongkan juga** (koreksi Den — beda dari sweep yang tidak menyentuhnya) (riwayat `owner_cleared`).

**Rollback.** Restore dari `accounts_lead_pool_backup_20261012` (urutan WAJIB: kembalikan `accounts` dulu, baru persempit CHECK — membalik urutan akan gagal selama baris `'legacy_pool_exit'` masih ada); `account_pool_history` yang ditulis migrasi ini **tidak otomatis terhapus** (penanda = prefix `reason`, bukan kolom terpisah) — hapus manual kalau benar-benar perlu.

---

### Catatan uji coba dry-run butir 54 di production (12 Okt 2026) — BUKAN eksekusi, NOL perubahan tersimpan

Berkas migrasi butir 54 menyertakan blok komentar terpisah di akhir file — **versi uji coba (dry-run)**, isi SAMA PERSIS dengan blok `BEGIN...COMMIT` utama, hanya dua beda: nama tabel backup berakhiran `_dryrun`, dan ditutup `ROLLBACK` bukan `COMMIT`. Blok ini **sudah dijalankan di production 12 Okt 2026** sebagai uji coba.

⚠️ **Jangan tertukar dengan eksekusi SUNGGUHAN di STAGING** (lihat §54 di atas, tabel "Staging") — keduanya peristiwa yang BERBEDA: yang di atas ini adalah dry-run di **PRODUCTION** (ROLLBACK, nol perubahan tersimpan), sementara di **STAGING** migrasi ini sudah benar-benar di-**COMMIT** (12 Okt 2026, bukti tabel backup + constraint sembilan nilai).

**Angka hasil uji coba (dilaporkan Den):**
- Backup (dry-run): **1.183 akun**.
- Keluar pool (gabungan `legacy_pool_exit` + `owner_cleared`): **1.144**.
- Tetap di pool (`enter_pool`): **39**.
- Rincian riwayat per `event_type`: `enter_pool` = **39**, `legacy_pool_exit` = **1.079**, `owner_cleared` = **65**.
- Verifikasi aritmetika (supaya pembaca berikutnya tidak perlu menghitung ulang): `1.079 + 65 = 1.144` ✔ cocok dengan angka "keluar pool"; `1.144 + 39 = 1.183` ✔ cocok dengan angka backup.
- Notifikasi pending yang akan dikirim (grup pemilik aktif, `pull_status='pending'`) pada saat uji dry-run ini: **0**.

⚠️ **Jangan samakan angka "0 pull pending" di atas dengan angka 28 pull pending yang pernah dilaporkan Den sebelumnya sebagai kondisi production 12 Okt 2026.** Kedua angka diukur pada **momen pengukuran yang berbeda** — data production bergerak antar-waktu; catat kedua angka dengan konteks/tanggalnya masing-masing, jangan diselaraskan paksa jadi satu angka.

**Kenapa dry-run bisa diuji di production tanpa risiko.** Blok di atas diakhiri `ROLLBACK`, bukan `COMMIT` — seluruh perubahan di dalam transaksi itu (UPDATE `accounts`, INSERT `account_pool_history`, kemungkinan INSERT `notifications`, bahkan DROP/ADD CONSTRAINT) **dibatalkan menyeluruh** begitu blok selesai. Uji ini membuktikan ANGKA yang akan terjadi, bukan menjalankannya sungguhan — bukan "koreksi" apa pun, karena itu BUKAN baris baru di tabel §Koreksi Data dan Akses Manual (di luar Migrasi).

---

### 55. `20261012000006_crm_lead_pool_notifications`

| | |
|---|---|
| Isi | `lead_pool_request_pull`/`lead_pool_approve_pull`/`lead_pool_reject_pull` (`CREATE OR REPLACE`, badan dasar SAMA PERSIS butir 50 + tambahan insert notifikasi best-effort) · `lead_pool_release` (`CREATE OR REPLACE`, +4 guard baru) · RPC BARU `lead_pool_assign(account_id, target_user_id)` · trigger BARU `trg_b_lead_pool_auto_release` (BEFORE UPDATE ON accounts) · trigger BARU `trg_block_inquiry_for_pooled_account` (BEFORE INSERT ON inquiries) · pelebaran `account_pool_history_event_type_check` (+`'assign'`+`'auto_release'`, DAN `'legacy_pool_exit'` — sembilan nilai total, lihat §54) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `86c7aca`) — dengan DELAPAN nilai constraint (tanpa `'legacy_pool_exit'`), karena butir 54 belum pernah dijalankan di staging. Menjalankan ulang file ini di staging akan GAGAL dengan cara yang sama seperti di production kalau butir 54 belum menyusul lebih dulu di sana juga |
| Production | ⛔ belum |
| Sifat | Bergantung pada butir 49-53 (kolom, RPC lama, approval roles) DAN **WAJIB sesudah butir 54** (lihat §54 untuk dua alasannya) |

**Dua trigger baru WAJIB `SECURITY DEFINER` (keputusan Den).** `trg_fn_lead_pool_auto_release` menulis `account_pool_history` (yang hanya punya policy SELECT untuk `authenticated` — sebagai INVOKER trigger ini akan ditolak RLS tepat saat paling dibutuhkan, user biasa menandai Lost/Archive lewat UI); `trg_fn_block_inquiry_for_pooled_account` membaca `accounts` (sebagai INVOKER, RLS SELECT pemanggil bisa membuat baris akun "tidak terlihat" sehingga guard lolos diam-diam — DEFINER menjamin trigger selalu melihat baris sebenarnya terlepas dari RLS pemanggil). Urutan trigger `BEFORE UPDATE` di `accounts` ditentukan alfabetis per nama (`trg_a_` → `trg_b_lead_pool_auto_release` BARU → `trg_z_...`) — trigger baru WAJIB menyala sesudah `trg_a_sync_lifecycle_columns` supaya update yang hanya mengisi `account_status='lost'` (tanpa menyentuh `lifecycle_stage` eksplisit) tetap tertangkap.

**Rollback.** `DROP TRIGGER`/`DROP FUNCTION` untuk kedua trigger baru + kembalikan tiga RPC lama dan `lead_pool_release` ke badan butir 50 + persempit constraint kembali ke delapan nilai (hanya aman kalau belum ada baris `'assign'`/`'auto_release'` yang bergantung padanya).

---

### 56. `20261012000007_crm_quotation_lock_on_closed_inquiry` — didahului LANGKAH MANUAL "9a"

| | |
|---|---|
| Isi | Trigger BARU `trg_z_quotation_auto_close_on_inquiry_closed` (AFTER UPDATE OF status ON inquiries — auto-REJECT quotation DRAFT/SUBMITTED/SENT saat inquiry jadi LOST/CANCELLED) · trigger BARU `trg_z_lock_quotation_closed_inquiry` (BEFORE INSERT OR UPDATE ON quotations — tolak tulis kalau inquiry induk tertutup) · trigger BARU `trg_lock_quotation_items_closed_inquiry` (BEFORE INSERT OR UPDATE OR DELETE ON quotation_items — defense-in-depth) · pembersihan data SATU KALI (Task 4 di dalam file ini) — di production LOST punya 96 SENT/17 DRAFT/2 SUBMITTED yang diubah jadi REJECTED (angka CANCELLED dihitung live oleh DO-block, bukan ditebak) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `e6aea81`) |
| Production | ⛔ belum |
| Sifat | WAJIB didahului langkah SQL manual di bawah ini — backup data yang akan ditutup oleh Task 4 dalam file ini |

⛔⛔ **LANGKAH SQL MANUAL WAJIB ("9a" dalam urutan instruksi) — jalankan SEBELUM file ini, backup quotation yang akan ditutup Task 4:**

```sql
CREATE TABLE quotations_lock_backup_20261012 AS
SELECT q.id, q.status, q.inquiry_id, now() AS backed_up_at
FROM quotations q
JOIN inquiries i ON i.id = q.inquiry_id
WHERE i.status IN ('LOST','CANCELLED')
  AND q.status IN ('DRAFT','SUBMITTED','SENT');
```

**Kenapa langkah ini wajib, bukan opsional.** Blok rollback di ekor file migrasi ini **HANYA** `DROP TRIGGER`/`DROP FUNCTION` untuk keenam objek baru (Task 1/2a/2b) — ia **TIDAK** mengembalikan quotation yang statusnya sudah diubah jadi REJECTED oleh Task 4. Ini diverifikasi langsung dari isi berkas: komentar ekor file secara eksplisit menulis *"TIDAK ADA rollback otomatis utk Task 4, data yang sudah diubah jadi REJECTED oleh pembersihan tetap REJECTED kecuali dipulihkan manual dari backup/log"*. Tabel `quotations_lock_backup_20261012` di atas adalah **SATU-SATUNYA jalan** memulihkan status quotation itu kalau file ini perlu dibatalkan sesudah dijalankan — tanpa backup ini, membatalkan trigger tidak membatalkan konsekuensinya yang sudah terjadi pada data.

**Catatan isi Task 1/2 (trigger).** Pengecualian trigger Task 2a (supaya tidak ikut mengunci update cascading dari Task 1/Task 4 sendiri) memakai GUC transaksi-lokal `nexus.quotation_auto_close` (`set_config`, pola yang sama dengan impersonasi `request.jwt.claim.sub` di skrip seed UAT) — bukan mencocokkan BENTUK update, karena quotation NORMAL yang ditolak customer (inquiry masih OPEN) bisa punya bentuk akhir yang identik dengan update cascading. GUC ini tidak bisa di-set lewat PostgREST (nol RPC yang mengeksposnya ke client).

**Rollback (keenam objek trigger, TANPA memulihkan data Task 4 — lihat peringatan di atas):**
```sql
DROP TRIGGER trg_lock_quotation_items_closed_inquiry ON public.quotation_items;
DROP FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry();
DROP TRIGGER trg_z_lock_quotation_closed_inquiry ON public.quotations;
DROP FUNCTION public.trg_fn_lock_quotation_closed_inquiry();
DROP TRIGGER trg_z_quotation_auto_close_on_inquiry_closed ON public.inquiries;
DROP FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed();
```

---

### 57. `20261012000008_crm_lead_pool_sweep_notify`

| | |
|---|---|
| Isi | `CREATE OR REPLACE lead_pool_sweep_deactivated_owner` — badan dasar (kedua loop Kasus 1/Kasus 2) DISALIN VERBATIM dari butir 50, tanda tangan & `RETURNS TABLE(account_id, action)` TIDAK berubah, GRANT TETAP `service_role` ONLY. Satu-satunya tambahan: notifikasi ringkasan per company sesudah kedua loop selesai (event `lead_pool_sweep_summary`, dua `reference_type` — existing `'lead_pool'` untuk akun yang ikut ter-pool, BARU `'unowned_customers'`/`'unowned_leads'` untuk akun yang keluar pool tanpa pemilik) |
| Staging | ✔ **dijalankan 12 Okt 2026** (commit `f27131a`) |
| Production | ⛔ belum |
| Sifat | TERAKHIR dalam rangkaian sebelas berkas — berpasangan dengan langkah 4d Edge Function `set-user-status` (lihat §Dua Edge Function) + dua cabang navigasi baru `App.jsx` (commit kode terpisah, di luar migrasi SQL ini) |

**Untuk apa.** Pemanggilnya: `set-user-status` langkah 4d, SESUDAH langkah 4a/4b/4c (deaktivasi akun — perubahan kode EF itu di luar migrasi SQL ini). Fungsi dipanggil **sesudah** user dinonaktifkan, mengirim MAKSIMAL DUA notifikasi per company yang tersentuh sweep ke setiap penerima dari `lead_pool_approvers(company_id)`. ⛔ **Koreksi atas rancangan awal yang disetujui Den:** notifikasi `'pooled'` **TIDAK** diarahkan ke `crm-prospects` — filter "Tanpa pemilik" di `LeadCapturePage` sengaja mensyaratkan `assigned_to IS NULL AND is_in_lead_pool = false`, sehingga akun yang baru ter-pool (`is_in_lead_pool = true`) tidak pernah lolos filter itu; `'lead_pool'` (cabang existing, `LeadAssignmentPage`) adalah satu-satunya tujuan yang benar untuk notifikasi `pooled`.

**Rollback.** Kembalikan `lead_pool_sweep_deactivated_owner` ke badan butir 50 (tanpa blok notifikasi ringkasan).

---

### Dua Edge Function yang harus di-deploy ke PRODUCTION sesudah SELURUH migrasi di atas

| Edge Function | Versi staging saat ini | Catatan |
|---|---|---|
| `aging-pipeline` | **v1** | Ditulis ulang di commit `be52eed` (bersamaan dengan butir 53) — menghapus mekanisme `AGING_RULES` lama (yang memindahkan lead ke Lead Pool), menulis `is_stale`/`stale_flagged_at` berdasarkan `sla_policies` code `LEAD_STALE` |
| `set-user-status` | **v2** | Memuat langkah **4d** (`supabase/functions/set-user-status/index.ts`, komentar `// 4d. Lead Pool sweep` + `rpc('lead_pool_sweep_deactivated_owner', ...)`) — langkah ini memanggil RPC butir 57, sesudah langkah 4a/4b/4c (deaktivasi akun) |

Keduanya `verify_jwt: true`. *(Nomor versi v1/v2 di atas adalah informasi yang disampaikan langsung oleh Den, bukan sesuatu yang diukur dari tool DB oleh sesi ini — pola yang sama dengan butir-butir lain di dokumen ini yang ditandai "info Den".)*

---

### Urutan konfigurasi penuaan (aging) SESUDAH kedua Edge Function di atas di-deploy

1. **Isi `companies.aging_baseline_at` untuk entitas MSI** — jam mulai penuaan dihitung (lihat komentar kolom di butir 49: migrasi ini sengaja tidak mengisinya, nol nilai historis untuk dikarang).
2. **Cek vault key `aging_pipeline_key` sudah ber-role `service_role`** — key ini yang dipakai `cron.job` memanggil `aging-pipeline` lewat `net.http_post` (lihat `05_WORKFLOW_MAP.md` §Mekanisme cron + TD-274 `08_TECH_DEBT.md`); EF membaca `role !== 'service_role'` sebagai gerbang (`aging-pipeline/index.ts:69`).
3. **Set `companies.aging_enabled` = `true` untuk MSI.**
4. **`cron.alter_job(1, active := true)`** — menyalakan kembali job `aging-pipeline-harian` (jobid 1).

⚠️ **Urutan di atas pada dasarnya adalah LANGKAH PEMBALIK dari baris tanggal 11 Okt 2026 di tabel §Koreksi Data dan Akses Manual (di luar Migrasi) di atas** — baris itu mencatat `cron.alter_job(1, active := false)` + `companies.aging_enabled = false` untuk MSI **DIMATIKAN** hari itu (mengikuti temuan audit mekanisme aging, sebelum Paket 2 ini ditulis). Langkah 3-4 di atas adalah menyalakannya kembali, kini dengan mekanisme `is_stale`-saja yang baru (butir 49/51/53) — bukan mengembalikan mekanisme lama yang memindahkan ke pool. **Jangan baca dua catatan ini sebagai dua hal yang bertentangan** — satu mencatat kapan dimatikan (sebelum Paket 2), satu mencatat kapan/bagaimana dinyalakan kembali (sesudah Paket 2 rilis).

---

### 58. Perubahan manual khusus STAGING (nol jejak git) — ARAH TERBALIK, **JANGAN NAIK KE PRODUKSI**

| | |
|---|---|
| Isi | (a) Seed data CRM dummy — sekitar 25 lead/inquiry/quotation · (b) `UPDATE stage_changed_at = created_at` pada data seed itu · (c) Aktivasi ulang akun uji "ZZZ Test Sales 2" (`profiles.active`, `auth.users.banned_until` → NULL, `user_roles` diaktifkan lagi) |
| Staging | ✔ **dilakukan manual 12 Okt 2026**, lewat SQL manual — nol jejak git |
| Production | — **tidak pernah, dan tidak boleh** |
| Tindakan saat rilis Paket 2 | ⛔ **lewati** — bukan bagian antrean production |

**Kenapa.** Data seed + akun uji dummy hanya relevan untuk menguji Paket 2 di staging sebelum rilis — data dummy dan akun uji tidak boleh ada di production.

**Kapan diulang.** Kalau staging suatu saat di-refresh/disamakan dari production, ketiga langkah ini perlu diulang manual lagi — pola yang sama dengan butir 10/20 (ARAH TERBALIK selamanya, bukan "staging menyusul production").

---

### 59. `20261016000001_accounts_contacts_updated_at_trigger`

| | |
|---|---|
| Isi | `CREATE OR REPLACE TRIGGER trg_accounts_updated_at`/`trg_contacts_updated_at` BEFORE UPDATE, memakai fungsi yang SUDAH ADA `set_updated_at()` (46 tabel lain sudah memakainya). TD-318 Irisan 1 temuan 4c: `accounts`/`contacts.updated_at` tidak pernah berubah. Nol backfill, nol tabel lain disentuh (30 tabel aktif lain yang punya gap sama + 11 tabel cadangan lama → **TD-322** di `08_TECH_DEBT.md`, OPEN menunggu keputusan Den PER TABEL — daftar lengkap keduanya sudah diisi 17 Okt 2026 dari query production [review Vir]; baris ini ditutup 17 Okt 2026 saat audit kesiapan launching menemukan bahwa rujukan "TD terpisah" ini sempat dangling selama sebelas hari, nol baris TD pernah dibuat untuknya). ⚠️ Draf awal memakai `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` — connector Vir memblokir `DROP TRIGGER` dengan prompt konfirmasi, jadi yang benar-benar dijalankan (dan kini isi file-nya) adalah `CREATE OR REPLACE TRIGGER` (PostgreSQL 14+, kedua environment PG 17.6) — hasil akhir identik, tetap idempoten. |
| Staging | ✔ **DIJALANKAN 16 Okt 2026** oleh Vir via connector. Verifikasi: `UPDATE` PT Prima Tekstil Pekalongan, `updated_at` langsung jadi `2026-10-16 08:10 UTC`. |
| Production | ✔ **DIJALANKAN 16 Okt 2026** oleh Vir via connector, SQL identik dengan staging. |
| Sifat | Berdiri sendiri, aditif murni. Nol kode FE yang wajib menyertainya (4 titik tulis manual `updated_at` di `CustomerDetailPage.jsx` jadi redundan-tapi-tidak-konflik, bisa dirapikan belakangan). Nol pembaca `accounts.updated_at` di seluruh `src/`/`supabase/functions/` hari ini — nol risiko regresi. |

**Rollback.** `DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts; DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;` (lihat komentar di ekor file migrasi).

---

### 60. `20261016000002_bd_digital_marketing_manager_role`

| | |
|---|---|
| Isi | Peran baru `bd_digital_marketing_manager` (level 4, global) untuk Faris (faris.el@exportimportdept.com, MSI) — akses = salinan persis `role_menu_permissions`+`role_permissions` milik `bd_digital_marketing_spv` (disalin lewat query) ditambah `crm_lead_pool_approval`/`view` eksplisit. Cabut `bd_digital_marketing_spv` Faris di MSI (soft, pola 12 Sep 2026) + `job_title` → "Digital Marketing Manager". `bd_digital_marketing_spv` TETAP ADA di tabel `roles`. |
| Staging | ✔ **DIJALANKAN 16 Okt 2026** oleh Vir via connector. §5 (Faris) dilewati sesuai guard — profil `faris.el@exportimportdept.com` tidak ada di staging. |
| Production | ✔ **DIJALANKAN 16 Okt 2026** oleh Vir via connector. Verifikasi: izin menu peran lama (SPV) **7**, peran baru **8** (termasuk `crm_lead_pool_approval`). Faris hanya punya `bd_digital_marketing_manager` aktif di MSI — `bd_digital_marketing_spv` dan `manager` lama nonaktif, `job_title` = "Digital Marketing Manager". |
| Sifat | TANPA hotfix branch — kode FE tidak wajib berubah (fetch role `AuthContext.jsx` generik, `isManagerOrAbove`/`hasMenuPermission` level-based atau data-driven, nol allow-list kode role yang menolak kode baru). Satu baris `ERP_ROLE_PRIORITY` (kosmetik, `src/lib/roleResolution.js`, sesudah `proc_manager`) sudah ikut `develop`, bukan prasyarat keamanan. Key `crm_lead_pool_approval` SUDAH ADA di `module_menus` production (dicek Vir 16 Okt 2026) — §4 file migrasi tetap ber-guard (`RAISE NOTICE` kalau tak ditemukan) sebagai jaga-jaga murah; tidak terpicu karena key-nya memang ada. |

**Untuk apa.** Peran `manager` umum (level 4) membawa akses lintas divisi yang tidak relevan untuk Faris dan tidak punya menu CRM yang ia pakai — peran baru ini menyalin persis cakupan `bd_digital_marketing_spv` (levelnya saja yang naik ke 4, bukan jangkauan RLS-nya — level 4 dan level 6 sama-sama lolos `is_manager_or_above()`/`MANAGER_LEVEL_MAX=6`).

**Rollback.** `DELETE FROM public.roles WHERE code = 'bd_digital_marketing_manager';` (FK `role_id` ON DELETE CASCADE di `user_roles`/`role_permissions`/`role_menu_permissions` mencabut baris turunannya otomatis — diverifikasi Vir 16 Okt 2026). Reaktivasi manual baris `bd_digital_marketing_spv` Faris sesudahnya kalau perlu (query di ekor file migrasi).

---

### 61. `20261016000003_crm_lead_capture_computed_sort_columns`

| | |
|---|---|
| Isi | TD-318 Irisan Sorting — 4 fungsi "computed column" PostgREST di `accounts` (`bant_score`, `lead_status_rank`, `owner_name`, `primary_contact_name`), `LANGUAGE sql STABLE SECURITY INVOKER` + `GRANT EXECUTE TO authenticated`. Melengkapi 9 kolom sortable `Capture/Table` (mockup) — 5 kolom lain (code/source/name/estimated_value/last_activity_at) sudah sortable lewat `.order()` dinamis tanpa migrasi, di branch `feat/td318-irisan-sorting`. `lead_status_rank` cermin persis `deriveLeadStatus()` (`leadStatus.js`) + urutan `LEAD_STATUSES` (0=raw…4=lost), `is_stale` sengaja tidak dilipat ke dalamnya (sumbu terpisah, badge independen). Keempat fungsi **hanya dipakai di `.order()`, tidak pernah di-`select()`** — jadi 5 kolom langsung tetap jalan di Preview branch ini walau fungsi-fungsi ini belum ada di suatu environment. |
| Staging | ✔ **DIJALANKAN 16 Okt 2026** oleh Vir via connector (`CREATE OR REPLACE FUNCTION`, bukan `CREATE FUNCTION` draf awal) + `NOTIFY pgrst, 'reload schema'`. Verifikasi: PT Verifikasi Irisan Enam — `bant_score` 12, `lead_status_rank` 1, `owner_name` "ZZZTEST Sales", `primary_contact_name` "Andi Wijaya". PT Bumi Agro Jember — `owner_name` NULL (Unassigned tetap ikut hasil, tidak terbuang lewat `!inner`). |
| Production | ⛔ belum — **bagian rilis November** bersama sisa Irisan Sorting, bukan jendela rilis AR. ⛔ **WAJIB jalan SEBELUM ATAU BERSAMAAN `develop` naik ke `main`, BUKAN sesudahnya** — keempat kolom computed (BANT Score/Status/Owner/Primary Contact) di `LeadCapturePage.jsx` bergantung penuh pada fungsi-fungsi ini; kalau kode naik duluan tanpa migrasi ini, mengklik salah satu dari 4 header itu gagal lewat `showToast` error (PostgREST: kolom tak dikenal) — 5 kolom langsung tetap jalan (regresi parsial, bukan halaman mati, tapi tetap terlihat user). SQL identik dengan staging (file migrasi sudah mencerminkan `CREATE OR REPLACE FUNCTION` yang benar-benar jalan), plus `NOTIFY pgrst, 'reload schema'` WAJIB diulang di production. |
| Sifat | 100% BACA (fungsi `STABLE`, nol tabel baru, nol DDL pada `accounts`/`profiles`/`contacts`). `SECURITY INVOKER` — RLS `profiles`/`contacts` pemanggil tetap berlaku saat `owner_name`/`primary_contact_name` di-resolve. Nol dampak ke kode FE lain — hanya dipanggil dari `LeadCapturePage.jsx` lewat `.order()`. |

**Untuk apa.** PostgREST tidak bisa `.order()` baris induk lintas tabel (Owner, Primary Contact) tanpa `!inner` — yang akan membuang baris Unassigned/tanpa kontak dari hasil — dan tidak bisa `.order()` ekspresi SQL (BANT Score = SUM 4 kolom, Status = turunan 2 kolom). Computed column PostgREST (fungsi berargumen tunggal bertipe baris `accounts`) menyelesaikan keduanya tanpa `!inner` dan tanpa mengubah bentuk hasil.

**Rollback.** `DROP FUNCTION IF EXISTS public.bant_score(public.accounts); DROP FUNCTION IF EXISTS public.lead_status_rank(public.accounts); DROP FUNCTION IF EXISTS public.owner_name(public.accounts); DROP FUNCTION IF EXISTS public.primary_contact_name(public.accounts); NOTIFY pgrst, 'reload schema';` (lihat ekor file migrasi) — aman kapan pun karena keempatnya cuma dipakai di `.order()`, bukan di `.select()` manapun.

---

### 62. `20261016000004_lead_pool_assign_reason`

| | |
|---|---|
| Isi | TD-318 Irisan 2 (Reassign) — `lead_pool_assign` 2 argumen → 3 (`p_reason text DEFAULT NULL`). DROP versi lama + CREATE versi baru di migrasi yang sama (bukan overload berdampingan — kedua pemanggil nyata, `ReassignModal.jsx` dan `AssignToSalesModal.jsx`, memanggil dengan argumen bernama, ambigu kalau dua overload hidup berdampingan). Badan disalin verbatim dari `20261012000006` + 1 kolom INSERT `account_pool_history.reason` + 1 nilai (`p_reason`). `account_pool_history.event_type` CHECK sudah memuat `'assign'`, kolom `reason` sudah ada — nol perubahan skema lain diperlukan. |
| Staging | ✔ **DIJALANKAN 16 Okt 2026** — **lewat SQL Editor oleh Den** (bukan connector Vir: `DROP FUNCTION` diblokir connector dengan prompt konfirmasi, pola yang sama dengan `20261016000001`). Diverifikasi Vir sesudahnya: hanya ADA satu `lead_pool_assign` (signature `uuid, uuid, text`, versi 2-argumen tidak ada lagi), badan identik file di repo, ACL `authenticated` saja. Uji assign dari Lead Pool dengan alasan diisi — alasan tersimpan ke `account_pool_history.reason`, notifikasi terkirim. |
| Production | ⛔ belum — **bagian rilis November**, diurutkan SESUDAH `20261012000006` (yang men-CREATE `lead_pool_assign` versi 2-argumen pertama kali). ⛔ **WAJIB jalan SEBELUM ATAU BERSAMAAN kode `ReassignModal.jsx` (TD-318 Irisan 2) naik ke `main`, BUKAN sesudahnya** — FE SELALU mengirim `p_reason` di setiap panggilan `lead_pool_assign` (baik ada isi reason atau tidak, lihat `ReassignModal.jsx`), jadi kalau kode naik duluan tanpa migrasi ini, assign dari Lead Pool **gagal TOTAL** (PostgREST tidak menemukan fungsi `lead_pool_assign` dengan parameter `p_reason` di production yang masih versi 2-argumen) — bukan degradasi sebagian, satu-satunya jalur assign dari Lead Pool/Pull Approval mati sampai migrasi ini menyusul. |
| Sifat | Satu RPC, badan hampir identik versi lama (3 baris berubah: parameter + 1 kolom INSERT + 1 nilai). ACL diajukan ulang utk signature baru (`REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`) — grant versi lama tidak ikut pindah otomatis (arity beda = objek beda bagi Postgres). Kedua pemanggil FE existing tetap jalan tanpa diubah (p_reason implisit NULL) — `ReassignModal.jsx` SEKARANG ikut mengisinya (lihat `08_TECH_DEBT.md` §Irisan 2 hasil eksekusi). |

**Untuk apa.** Field "Reason" sudah ada di modal Reassign tapi tak pernah tersimpan untuk baris pool — RPC lama tak punya parameter untuk itu, sehingga alasan reassign baris pool selalu hilang (gap TD-318 #36 lama, 08_TECH_DEBT.md).

**Rollback.** `DROP FUNCTION IF EXISTS public.lead_pool_assign(uuid, uuid, text);` lalu `CREATE FUNCTION public.lead_pool_assign(uuid, uuid)` badan identik versi lama (`20261012000006_crm_lead_pool_notifications.sql`) + `REVOKE`/`GRANT` lama (lihat ekor file migrasi).

---

### 63. `20261017000001_lead_pool_assign_candidates`

| | |
|---|---|
| Isi | TD-318 Irisan 4 (Lead Assignment, tes Den + review Vir), item G. RPC baru `lead_pool_assign_candidates(p_company_id uuid) RETURNS TABLE (id uuid, full_name text)`, `SECURITY DEFINER`, digerbang **syarat persis sama** dengan `lead_pool_assign` sendiri (`has_menu_permission_in(p_company_id, 'crm_lead_pool_approval', 'view')`). Mengembalikan profil aktif dengan peran aktif (`user_roles.is_active=true`, `valid_until IS NULL`) di entitas akun, tanpa diri sendiri. `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`. |
| Staging | ✔ **DIJALANKAN 17 Okt 2026 oleh Vir** — badan identik file di repo. Diuji sebagai supervisor MSI (7 kandidat tampil) dan sebagai approver TANPA izin di entitas target (ditolak dengan pesan izin dari guard `has_menu_permission_in`). |
| Production | ⛔ belum — **rilis November**, SESUDAH `20261016000004`. ⛔ **Kode `ReassignModal.jsx` (cabang `allUnassigned`, TD-318 Irisan 4) sudah memanggil RPC ini — WAJIB jalan SEBELUM ATAU BERSAMAAN kode itu naik ke `main`, BUKAN sesudahnya.** Tanpa migrasi ini, cabang `allUnassigned` (assign dari Lead Pool/Free Agent Customer) selalu mendapat `function … does not exist` dari PostgREST — daftar kandidat kosong, tidak ada yang bisa di-assign lewat UI sampai migrasi ini menyusul. |
| Sifat | Satu RPC baca-saja (`STABLE`), nol tabel/kolom baru, nol dampak ke `lead_pool_assign` atau fungsi lain. |

**Untuk apa.** RLS `user_roles_read` mengizinkan baris sendiri, ATAU (`company_id = get_user_company_id()` [HOME profil] `AND is_manager_or_above()`), ATAU super admin. Dua kasus NYATA yang gagal tembus RLS itu lewat query `user_roles`+`profiles` langsung dari client: **(1)** approver yang izinnya (`crm_lead_pool_approval`) ada di entitas **berbeda** dari entitas HOME profilnya — klausa `company_id=get_user_company_id()` gagal karena entitas target bukan HOME-nya; **(2)** approver **di bawah level manager** (izin `crm_lead_pool_approval` diberikan lewat grant per-user, bukan lewat level org) — klausa `is_manager_or_above()` gagal walau entitasnya cocok. Kelas bug yang sama dengan gotcha #26/#35 — perbaikan policy tidak otomatis memperbaiki jalur yang menembus RLS dari sisi lain. RPC `SECURITY DEFINER` ini menembus RLS itu dengan guard yang sama persis dengan `lead_pool_assign`, supaya kandidat yang ditampilkan selalu kandidat yang akan DITERIMA RPC assign-nya. **[Koreksi Vir, 17 Okt 2026]** Contoh awal draf ini ("`ceo` di SOA") KELIRU — `ceo` yang HOME-nya SOA dan mengajukan izin di SOA sendiri LOLOS kedua klausa RLS di atas; kalau ditolak, itu guard `has_menu_permission_in` RPC ini sendiri yang bekerja BENAR (ceo memang tidak punya `crm_lead_pool_approval` di entitas itu), bukan bug RLS yang diperbaiki migrasi ini.

**Rollback.** `DROP FUNCTION IF EXISTS public.lead_pool_assign_candidates(uuid);` — `ReassignModal.jsx` cabang `allUnassigned` akan kembali gagal (daftar kandidat kosong untuk approver lintas entitas) sampai fungsi ini dipasang ulang; cabang `!allUnassigned` (reassign biasa) tidak terpengaruh.

---

### 64. Data uji staging TD-318 Irisan 1–4 (16-17 Okt 2026) — ARAH TERBALIK, **JANGAN NAIK KE PRODUKSI**

| | |
|---|---|
| Isi | Konsolidasi mutasi data uji staging yang terjadi SELAMA eksekusi Irisan 1-4 TD-318 (16-17 Okt 2026) — di luar seed 12 Okt yang sudah dicatat butir 58. Lima mutasi: **(a)** opsi `lead_industry` baru `value='test_industry'`/label "test industry" (Irisan 3, dibuat lewat `add_dropdown_option_direct`) — **dinonaktifkan** 17 Okt (bukan dihapus fisik — `DELETE` diblokir connector Vir, pola sama `DROP`). **(b)** satu baris `dropdown_option_requests` status pending ("new option", `list_key='lead_industry'`, diajukan ZZZTEST Sales) — **SENGAJA DIBIARKAN HIDUP**, disiapkan untuk menguji halaman "Option Requests" (TD-318 #18) begitu halamannya dibangun. **(c)** akun "ZZZTEST Free Agent Irisan 4" (FAC tanpa pemilik, dibuat untuk Temuan A Irisan 4) — **di-soft-delete** 17 Okt. **(d)** pull request pending pada "PT Tekstil Mandiri Bandung" (dibuat untuk tes Irisan 4) — **di-approve** sebagai bagian tes commit `0950761`, kini dimiliki pengaju (ZZZTEST Sales), bukan dibersihkan. **(e)** `accounts.competitor_price` terisi nilai uji 150.000.000 pada akun yang dipakai menguji `MarkAsLostModal` (Irisan 3) — status Lost + nilai uji **dibiarkan apa adanya**, bukan dibersihkan (lihat `08_TECH_DEBT.md` §Irisan 3 "Data diverifikasi Vir..."). ⚠️ **(d) dan (e) TIDAK dikonfirmasi dibersihkan di dokumen governance mana pun** — kalau belum dibersihkan saat rilis, baris ini tetap data uji yang ikut staging, bukan ikut production (staging tidak pernah naik mentah ke production). |
| Staging | ✔ terjadi 16-17 Okt 2026, manual (Vir, via connector + SQL Editor Den untuk `DROP`) — nol jejak git untuk kelima mutasi data ini (migrasinya sendiri, kalau ada, tercatat terpisah di butir 61-63) |
| Production | — **tidak pernah, dan tidak boleh** |
| Tindakan saat rilis November | ⛔ **lewati** — bukan bagian antrean production. Kalau staging di-refresh/disamakan dari production sebelum rilis November, (a)-(e) hilang dan TIDAK perlu diulang kecuali Den ingin menguji ulang Irisan 1-4/Option Requests. |

**Kenapa dicatat terpisah dari butir 58.** Pola yang sama ("ARAH TERBALIK, staging saja") tapi mutasi BERBEDA periode (16-17 Okt, bukan 12 Okt) dan asalnya BERBEDA (hasil menjalankan/menguji fitur TD-318 Irisan 1-4, bukan seed awal Paket 2) — digabung ke butir 58 akan mengaburkan kapan tepatnya staging menyimpang dari "baseline seed 12 Okt".

---

### 65. `20261020000001_crm_option_requests_approve_note_and_notify`

> ⚠️ **Nomor ini DIKOREKSI dari rencana semula.** Komentar header file migrasi (ditulis 20 Okt 2026) mengusulkan dirinya sebagai "butir BARU #58" — pada saat itu ditulis, nomor #58 di dokumen ini dikira kosong. **Sudah dipakai** sejak Paket 2 Lead Pool (12 Okt 2026) untuk "Perubahan manual khusus STAGING" (seed CRM dummy, lihat §58 di atas). Diberi nomor **65** di sini (lanjutan dari §64, bukan sisipan di antara 47-57) — kalau membaca komentar header file migrasi itu sendiri, nomor "#58" di sana sudah BASI, acuan yang benar adalah butir ini.

| | |
|---|---|
| Isi | TD-318 item #18 (Option Requests) — menambah **catatan Approve** (`approval_note`, kolom baru di `dropdown_option_requests`) + **notifikasi** submit/approve/reject (tabel `notifications`, konsumen sudah ada lewat lonceng notifikasi) ke tiga RPC dari `20261011000002` (butir 48): `approve_dropdown_option_request` ganti signature `(uuid)` → `(uuid, text DEFAULT NULL)` lewat `DROP FUNCTION` + `CREATE FUNCTION` (bukan `CREATE OR REPLACE` — nol pemanggil produksi/FE saat ditulis, diverifikasi grep repo, jadi aman ganti signature) · `reject_dropdown_option_request` `CREATE OR REPLACE` (signature tetap) + notifikasi · RPC **BARU** `submit_dropdown_option_request(p_list_key, p_label, p_reason, p_company_id)` menggantikan INSERT langsung di `RequestNewOptionModal.jsx`, menambah notifikasi ke seluruh penerima `is_manager_or_above()` (query mereplikasi badan fungsi itu — lihat koreksi di bawah) tanpa mengetatkan RLS insert (lihat `08_TECH_DEBT.md` TD-323). Query penerima submit memakai `company_id` PER-BARIS = company HOME penerima itu sendiri, bukan satu nilai pengaju. `approve_dropdown_option_request`/`reject_dropdown_option_request` memakai `FOR UPDATE` + `AND status='pending'` di UPDATE (bukan hanya SELECT) untuk menutup race konkurensi dua panggilan approve/reject bersamaan pada request yang sama. ⚠️ **Koreksi header migrasi sendiri (20 Okt 2026, Vir):** draft awal menyebut `is_manager_or_above()` SAAT ITU belum memuat `JOIN profiles pa ... pa.active=true`, mengutip `schema_snapshot.sql:3151-3161` — ternyata SALAH, badan fungsi yang sungguh live di staging DAN production SUDAH memuat JOIN itu sejak hotfix TD-301 lapis B (`20261001000001`, LIVE 1-2 Okt 2026); snapshot itu BASI, bukan cerminan DB sekarang (lihat `03_DATA_MODEL.md` gotcha #10, contoh baru 20 Okt 2026). |
| Staging | ✔ **DIJALANKAN 20 Okt 2026**, dikonfirmasi Vir/Den — 4 blok uji self-rollback (`scripts/qa/sql/verify-option-requests-rpc.sql`) lolos: (a) submit → notifikasi terkirim ke manager, (b) approve → opsi baru + `approval_note` tersimpan, (c) reject tanpa alasan ditolak, (d) approve kedua kali pada request yang sama ditolak (menguji guard `FOR UPDATE`/`status='pending'` SEKUENSIAL dalam satu sesi — kasus KONKUREN lintas-sesi tidak diuji skrip ini, hanya dijamin oleh `FOR UPDATE` itu sendiri). |
| Production | ⛔ belum | ⛔ **WAJIB** — rilis November, SEBELUM ATAU BERSAMAAN kode `OptionRequestsPage.jsx`/`RequestNewOptionModal.jsx` (branch `feat/inquiry-irisan-5`, 9 commit 20 Okt 2026, **BELUM MERGE ke `develop`, belum ada PR**) naik ke `main`. ⛔⛔ **Dependensi SEMPIT, tapi blast radius-nya LEBAR dan itu alasan baris ini WAJIB, bukan opsional:** migrasi ini **hanya bergantung pada butir 48** (tabel `dropdown_option_requests` + 3 RPC dasarnya) — **independen dari butir 49-57** (skema/RPC/trigger Lead Pool). Tapi `RequestNewOptionModal.jsx` (ronde FE kedua, commit `c67c814`) **sudah dipindah dari INSERT langsung ke RPC `submit_dropdown_option_request`**, dan modal itu dipakai BUKAN hanya oleh halaman Option Requests baru — ia juga dipakai `CaptureLeadModal.jsx`, `MarkAsLostModal.jsx`, dan `LeadDetailPage.jsx` untuk field "Request new option" (Industry/Lead Category/Lost Reason) di Lead Management yang **SUDAH ADA dan SUDAH dipakai sebelum Irisan 5**. Kalau kode `develop`→`main` naik membawa commit `c67c814` tanpa migrasi ini sudah live, **SELURUH jalur "Request new option" Lead Management gagal keras di production** (`function submit_dropdown_option_request does not exist`) — bukan cuma halaman Option Requests baru yang terdampak. |
| Sifat | Aditif (1 kolom baru, 1 RPC baru, 2 RPC `CREATE OR REPLACE`/`DROP+CREATE` signature berubah). Nol tabel baru, nol DDL pada tabel lain. RLS insert `dropdown_option_requests` TIDAK diketatkan oleh migrasi ini (`08_TECH_DEBT.md` TD-323, diterima apa adanya). |

**Untuk apa.** Menutup TD-318 #18 (Lead Management): sebelumnya permintaan opsi baru dari sales tersimpan aman di `dropdown_option_requests` tapi nol UI untuk menyetujui/menolaknya dan nol notifikasi dua arah — mockup "Option Requests" (tiba 19 Okt 2026) mengunci bentuknya sebagai halaman inbox Manager-ke-atas, bukan tab tambahan di halaman lain.

**Rollback.** Lihat blok komentar di ekor file migrasi: `DROP FUNCTION submit_dropdown_option_request(text,text,text,uuid)` → `DROP FUNCTION reject_dropdown_option_request(uuid,text)` lalu re-create versi `20261011000002` apa adanya → `DROP FUNCTION approve_dropdown_option_request(uuid,text)` lalu re-create versi 1-argumen dari `20261011000002` → `ALTER TABLE dropdown_option_requests DROP COLUMN approval_note`.

---

## Runbook Rilis Lead Management (TD-318 Paket 1+2) — awal November 2026

> Runbook ini **TERPISAH** dari §Naskah Eksekusi Malam Rilis (butir 6-46, rantai AR Storbit) — keduanya dirilis di **malam berbeda** (rekomendasi Den, lihat §Naskah Eksekusi Malam Rilis), AR lebih dulu. Cakupan runbook ini: butir 47-65 (Paket 2 Lead Pool + TD-318 Irisan Sorting/2/4 + Irisan 5 Option Requests). **Ditulis 17 Okt 2026 sebagai bagian audit kesiapan launching** (butir 65 ditambahkan 20 Okt 2026, lihat §65) **— BELUM pernah dijalankan, tanggal pasti menyusul.** ⚠️ Butir 65 bergantung HANYA pada butir 48 (independen dari 49-63) tapi kodenya (branch `feat/inquiry-irisan-5`, BELUM merge ke `develop`) membawa dependensi balik ke jalur Lead Management yang sudah ada — lihat §65 sebelum mengasumsikan urutan ini bisa dipisah bebas dari sisa Paket 2.

> ⛔⛔ **PRASYARAT KERAS (koreksi review Vir, 17 Okt 2026, diverifikasi langsung ke git+production) — BUKAN sekadar rekomendasi urutan, melainkan KETERGANTUNGAN TEKNIS MUTLAK:** malam rilis Lead Management **HANYA BOLEH dijalankan SESUDAH §Naskah Eksekusi Malam Rilis (AR Tahap 1-3b, butir 6-46) selesai DAN terverifikasi di production, ATAU di malam yang SAMA dengan AR dijalankan LEBIH DULU**. Alasan: kode Lead Management dan kode AR hidup BERSAMA dalam satu `develop` — `git merge-base --is-ancestor origin/release/2026-10-14 develop` = **TRUE** (branch rilis AR `release/2026-10-14` fully contained di `develop`; 44 file migrasi AR ada di rentang `main`..`release/2026-10-14`, 16 file TD-318 ada di rentang `release/2026-10-14`..`develop`, total tepat 60 = jumlah seluruh migrasi yang belum di `main`). **Merge `develop` → `main` menaikkan KEDUANYA sekaligus — tidak ada cara menaikkan Lead Management TANPA ikut menaikkan seluruh kode AR.** Dikonfirmasi Vir ke production 17 Okt 2026: fungsi AR (`approve_invoice_issue`, `mark_invoice_printed`, `get_invoice_audit_trail`, `invoice_role_holders`, `sp_invoice_readiness`), tabel (`invoice_attachments`, `invoice_notes`, `account_role_mappings`), kolom (`sp_invoices.coretax_tx_code`) **BELUM ADA SATU PUN** — AR sendiri punya prasyarat eksekusi yang jauh lebih besar dan lebih berisiko (butir 6-46, Langkah 0-5 §Naskah Eksekusi Malam Rilis) daripada sekadar menjalankan migrasinya. **JANGAN mencoba memisah `develop`→`main` jadi dua merge terpisah (satu untuk AR, satu untuk Lead Management) tanpa instruksi eksplisit Den** — itu berarti cherry-pick/rebase manual yang berisiko tinggi dan di luar cakupan runbook ini.

### a. Pra-rilis

1. **Backup/snapshot production** sebelum migrasi apa pun dijalankan — `pg_dump --schema-only --schema=public` (pola yang sudah berlaku, `CLAUDE.md` §Sumber kebenaran DB) ditambah backup data penuh untuk tabel yang disentuh migrasi 47-63 (`accounts`, `contacts`, `account_pool_history`, `roles`, `role_menu_permissions`, `role_permissions`, `user_roles`, `dropdown_option_requests`).
2. **Freeze** input Lead Management (Lead Capture/Qualification/Assignment) selama jendela eksekusi — pola yang sama dengan pembekuan input Finance/Gudang di Langkah 0.6 §Naskah Eksekusi Malam Rilis.
3. **Akun uji PER PERAN** (bukan `super_admin` — aturan smoke test yang berlaku di repo ini, lihat §Naskah Eksekusi Malam Rilis Langkah 4): sales biasa (`ZZZTEST Sales` atau akun MSI nyata non-manajerial), supervisor/manager (akun ber-`is_manager_or_above()` TRUE — mis. pemegang `bd_sales_spv_*` atau `manager`), DAN **`bd_digital_marketing_manager`** (Faris, `faris.el@exportimportdept.com`@MSI — SATU-SATUNYA pemegang role ini, dibuat migrasi butir 60; dipakai khusus smoke test approval Lead Pool karena role ini satu-satunya yang eksplisit diberi `crm_lead_pool_approval`/`view` di luar role `manager`/`ceo`/`super_admin` generik). ⚠️ **Faris WAJIB logout+login ulang sebelum smoke test** — lihat Tugas 4e/tabel kekurangan launching, cache role di client tidak otomatis menyegarkan menu Manager yang baru.

### b. Urutan migrasi hari-H — dengan query verifikasi konkret

**Urutan MENGIKAT:** `47 → 48 → 49 → 50 → 51 → 52 → 53 → 54 → 55 → [langkah manual "9a", §56] → 56 → 57` (Paket 2 inti, SUDAH tertulis di atas), lalu **59 dan 60 boleh kapan pun** (berdiri sendiri, aditif — lihat §59/§60; **SUDAH LIVE production sejak 16 Okt 2026, jangan dijalankan ulang**, cukup diverifikasi query di bawah), lalu **61 → 62 → 63** (bergantung pada skema Paket 2 di atas DAN pada kode TD-318 Irisan Sorting/2/4 yang naik bersamaan), lalu **65 boleh kapan pun setelah 48** — hanya bergantung pada butir 48, tidak pada 49-63, tapi **WAJIB sudah live sebelum kode `RequestNewOptionModal.jsx`/`OptionRequestsPage.jsx` (branch `feat/inquiry-irisan-5`) ikut naik** (lihat §65 untuk alasan blast radius). Butir 58 dan 64 **tidak pernah dijalankan di production** (arah terbalik, staging saja).

⚠️ **Teknik verifikasi fungsi WAJIB `oidvectortypes(p.proargtypes)`, BUKAN `pg_get_function_identity_arguments(p.oid)`** — yang kedua ikut mencetak NAMA parameter sehingga perbandingan string ke daftar tipe polos tidak pernah cocok (gotcha #44, `CLAUDE.md` §Aturan Wajib). Seluruh query di bawah mengikuti aturan ini.

**Verifikasi butir 47 — kolom `accounts.competitor_price`/`description`:**
```sql
-- READ-ONLY. Aman kapan pun.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'accounts'
   AND column_name IN ('competitor_price', 'description', 'industry', 'lead_category',
                        'priority', 'qualified_at', 'qualified_reason', 'estimated_value')
 ORDER BY column_name;
-- Harus mengembalikan 8 baris sesudah butir 47 jalan (sebagian kolom lahir di migrasi lain
-- dalam rentang yang sama -- lihat §47/§48 untuk daftar per-berkas).
```

**Verifikasi butir 49-54 — skema + RPC + trigger Lead Pool:**
```sql
-- READ-ONLY. Tabel baru.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('account_pool_history', 'dropdown_option_requests')
 ORDER BY table_name;
-- Harus 2 baris sesudah butir 49 (account_pool_history) + 48 (dropdown_option_requests, cek terpisah).

-- READ-ONLY. RPC inti Lead Pool -- signature via oidvectortypes, BUKAN
-- pg_get_function_identity_arguments.
SELECT p.proname, oidvectortypes(p.proargtypes) AS args, p.prosecdef AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('lead_pool_assign', 'lead_pool_release', 'lead_pool_request_pull',
                      'lead_pool_approve_pull', 'lead_pool_reject_pull',
                      'add_dropdown_option_direct', 'approve_dropdown_option_request',
                      'reject_dropdown_option_request')
 ORDER BY p.proname;
-- lead_pool_assign HARUS tampil args 'uuid, uuid, text' (SATU baris, bukan dua -- versi
-- 2-argumen lama harus sudah di-DROP oleh butir 62; kalau masih ada DUA baris
-- "lead_pool_assign", urutan butir 62 terlewat atau gagal).

-- READ-ONLY. Trigger Lead Pool.
SELECT tgname, tgrelid::regclass AS tabel, tgenabled
  FROM pg_trigger
 WHERE tgname LIKE '%pool%' OR tgname LIKE '%lead%'
 ORDER BY tgname;
```

**Verifikasi butir 61 — 4 computed sort column:**
```sql
-- READ-ONLY. oidvectortypes, bukan pg_get_function_identity_arguments.
SELECT p.proname, oidvectortypes(p.proargtypes) AS args, p.provolatile, p.prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('bant_score', 'lead_status_rank', 'owner_name', 'primary_contact_name')
 ORDER BY p.proname;
-- Keempat harus ada, args 'accounts' (tipe baris), provolatile = 's' (STABLE), prosecdef = false
-- (SECURITY INVOKER).

-- WAJIB sesudah CREATE/REPLACE: NOTIFY pgrst, 'reload schema';
-- Verifikasi grant EXECUTE (ACL), BUKAN pg_get_function_identity_arguments:
SELECT has_function_privilege('authenticated', 'public.bant_score(public.accounts)', 'EXECUTE') AS bisa_authenticated,
       has_function_privilege('anon', 'public.bant_score(public.accounts)', 'EXECUTE') AS bisa_anon;
-- Harus true / false.
```

**Verifikasi butir 62 — signature `lead_pool_assign` 3-argumen, DROP versi lama:**
```sql
-- READ-ONLY. Pastikan HANYA satu signature yang hidup.
SELECT oidvectortypes(p.proargtypes) AS args, count(*) OVER () AS total_signature
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'lead_pool_assign';
-- total_signature HARUS 1, args HARUS 'uuid, uuid, text'. Kalau 2 baris muncul (uuid,uuid
-- DAN uuid,uuid,text), DROP versi lama belum jalan -- PostgREST akan ambigu untuk panggilan
-- ber-argumen bernama (gotcha #44/#39, lihat 08_TECH_DEBT.md TD-318 §Irisan 2).

SELECT has_function_privilege('authenticated', 'public.lead_pool_assign(uuid,uuid,text)', 'EXECUTE') AS bisa_authenticated,
       has_function_privilege('public', 'public.lead_pool_assign(uuid,uuid,text)', 'EXECUTE') AS bisa_public;
-- Harus true / false (REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated saja).
```

**Verifikasi butir 63 — `lead_pool_assign_candidates`:**
```sql
-- READ-ONLY.
SELECT oidvectortypes(p.proargtypes) AS args, p.prosecdef AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'lead_pool_assign_candidates';
-- args HARUS 'uuid', security_definer HARUS true.

-- Policy RLS yang relevan (bukan diubah migrasi ini, sekadar konteks guard):
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
  FROM pg_policy
 WHERE polrelid = 'public.user_roles'::regclass;
```

**Verifikasi butir 59/60 (sudah LIVE — checkpoint saja, BUKAN dijalankan ulang):**
```sql
-- READ-ONLY. Trigger updated_at.
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgname IN ('trg_accounts_updated_at', 'trg_contacts_updated_at');
-- Harus 2 baris, tgenabled = 'O' (enabled).

-- READ-ONLY. Role bd_digital_marketing_manager + Faris.
SELECT r.code, r.level, count(*) FILTER (WHERE rmp.id IS NOT NULL) AS jumlah_izin_menu
  FROM roles r LEFT JOIN role_menu_permissions rmp ON rmp.role_id = r.id
 WHERE r.code = 'bd_digital_marketing_manager'
 GROUP BY r.code, r.level;
-- level harus 4, jumlah_izin_menu harus 8 (7 salinan SPV + crm_lead_pool_approval eksplisit).
```

### c. Merge `develop` → `main` dan cek deploy Production READY

⛔ **Sub-langkah WAJIB SEBELUM merge `develop` — cek dulu rilis AR sudah masuk `main`** (koreksi review Vir 17 Okt 2026 — menegakkan prasyarat keras di atas secara mekanis, bukan cuma dibaca):
```bash
git fetch origin main release/2026-10-14
git merge-base --is-ancestor origin/release/2026-10-14 origin/main && echo "AMAN: release/2026-10-14 sudah di main" || echo "STOP: release/2026-10-14 BELUM di main -- JANGAN merge develop, AR harus jalan dulu"
```
Kalau keluarannya "STOP" — **HENTIKAN runbook ini**, AR belum dirilis, dan merge `develop`→`main` sekarang akan ikut menaikkan kode Lead Management TD-318 BERSAMA kode AR yang belum punya migrasinya di production (lihat prasyarat keras di atas). Lanjut ke langkah merge di bawah HANYA kalau keluarannya "AMAN".

**Perintah merge (ditulis sebagai instruksi runbook — JANGAN dieksekusi sebelum hari-H, dan HANYA sesudah sub-langkah di atas mengembalikan "AMAN"):**
```bash
git fetch origin
git checkout main
git pull origin main
git merge --no-ff origin/develop   # merge commit biasa, BUKAN squash, BUKAN fast-forward-only
                                     # (pola yang sama dengan §Tata kelola branch release/2026-10-14
                                     # Langkah 2, kalau release branch TD-318 sendiri dibuat nanti)
git push origin main
```
**Cek deploy Vercel Production READY** (pola G1 Batch FS 2.5, `08_TECH_DEBT.md`/`CLAUDE.md`):
```bash
# Lewat Vercel CLI atau API -- cek deployment yang memegang alias produksi
vercel ls nexus --prod
# ATAU, API: deployment yang readyState=READY dan alias mencakup nexus.msigroup.co.id
```
Verifikasi tambahan: buka `nexus.msigroup.co.id` di browser incognito, cek `index.html` ter-update (hash chunk baru), dan buka `/crm/lead/capture` (deep-link) untuk konfirmasi rute Lead Management ter-deploy (bukan 404).

### d. Smoke test production

**Lead Management (akun sales biasa, kecuali disebutkan lain):**
- **Lead Capture:** buka `/crm/lead/capture` — filter Source/Industry/Created Date/Last Touched berfungsi; klik 9 header kolom `Capture/Table` satu-satu, cek arah panah naik/turun berubah dan baris Unassigned tetap di akhir; klik "+ Capture Lead", isi section Opportunity (Estimated Value + Description), simpan; klik "Import Leads", upload file, cek kolom Phone/Email tampil di preview step 3.
- **Lead Detail:** buka satu lead, klik Edit di section Company — isi berubah, Save, cek `updated_at` berubah (badge "Updated X ago" kalau ada); cek breadcrumb 4 level, klik level ke-3 untuk kembali ke daftar; klik kartu kontak — nomor telepon/WhatsApp/Email harus bisa diklik; buka tab Activity, klik "Schedule Follow Up", cek kolom **Time** ada dan terisi default.
- **Lead Assignment (akun supervisor/manager):** buka `/crm/lead/assignment`, tab Pool — klik "Assign to Sales" pada baris pending SEKALIGUS baris non-pending (keduanya harus menampilkan tombol); isi Reason, simpan, cek toast dinamis muncul dengan nama lead yang benar.
- **Lead Pool Approval (akun `bd_digital_marketing_manager` — Faris, WAJIB logout+login ulang dulu):** login sebagai Faris, cek menu Manager/approval muncul di sidebar (kalau tidak muncul, logout+login lagi — cache role client); buka tab Pull Approvals, klik Approve pada satu pull request pending, cek toast menyebut nama PENGAJU (bukan nama Faris sendiri) sebagai pemilik baru.
- **Lead Qualification:** buka `/crm/lead/qualification`, cek hanya lead ber-status Qualified yang tampil; expand satu baris, cek panel BANT baca-saja (nol tombol Simpan) dengan nilai KPI 24px; klik "Create Inquiry".
- **Modal aksi sekunder:** Reassign (judul berubah sesuai `allUnassigned` — "Assign to Sales" vs "Reassign Lead"), Mark as Lost (field Competitor Price muncul kalau alasan "Price"/"Lost to Competitor"), Archive, Request New Option (dari dropdown Industry/Lead Category — buka popover, klik "+ Request new option", isi, kirim; untuk manajer, cek "+ Add new option" langsung menambah tanpa modal).
- **Toast:** trigger satu toast sukses dan satu toast error (mis. simpan form dengan field wajib kosong) — kotak gelap + teks putih, posisi tengah-bawah, tidak bertumpuk dengan toast `useToast` kit (kalau keduanya kebetulan tampil bersamaan dari dua aksi berurutan).

**42 migrasi NON-TD-318 (AR/invoice/TD-281/TD-300 security, butir 1-46) — smoke test MINIMUM per kelompok, bukan sedetail Lead Management (detail penuh: §Naskah Eksekusi Malam Rilis Langkah 4):**
- **AR Tahap 1 (butir 6-10):** buka satu SP ber-SJ `delivered`, buka Detail SP tab Shipment — cek tombol "Lengkapi Tanggal Ditandatangani" tidak error.
- **AR Tahap 2 + Invoice lengkap (butir 11-26):** buka Invoice Management, Daftar Invoice — cek kolom UOM terisi, klik satu invoice, cek panel Payment & lampiran tidak error.
- **TD-281 Paket Keamanan (butir 27-31, 45-46) — SUDAH LIVE, checkpoint saja:** login sebagai 2-3 role berbeda, cek tak ada halaman yang mendadak Akses Ditolak (regresi hak akses dari pengerasan RLS).
- **AR Tahap 3 + 3b (butir 32-44, 44a):** buka Finance Inbox, tab "Menunggu Persetujuan" (akun `finance_controller` — Bagus Putra Kurnia), cek daftar invoice `pending_approval` tampil, JANGAN tekan Setujui/Tolak pada invoice asli (pola smoke test yang sudah berlaku, Langkah 4.9 §Naskah Eksekusi Malam Rilis).

### e. Rollback

**Per migrasi** — ambil langsung dari blok rollback di tiap file migrasi (dikonfirmasi ADA, dibaca dari file, bukan dikarang):
- Butir 59: `DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts; DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;`
- Butir 60: `DELETE FROM public.roles WHERE code = 'bd_digital_marketing_manager';` (CASCADE mencabut `user_roles`/`role_permissions`/`role_menu_permissions` turunannya) + reaktivasi manual baris `bd_digital_marketing_spv` Faris kalau perlu.
- Butir 61: `DROP FUNCTION IF EXISTS public.bant_score(public.accounts); DROP FUNCTION IF EXISTS public.lead_status_rank(public.accounts); DROP FUNCTION IF EXISTS public.owner_name(public.accounts); DROP FUNCTION IF EXISTS public.primary_contact_name(public.accounts); NOTIFY pgrst, 'reload schema';`
- Butir 62: `DROP FUNCTION IF EXISTS public.lead_pool_assign(uuid, uuid, text);` lalu `CREATE FUNCTION public.lead_pool_assign(uuid, uuid)` badan identik versi lama (`20261012000006`) + `REVOKE`/`GRANT` lama.
- Butir 63: `DROP FUNCTION IF EXISTS public.lead_pool_assign_candidates(uuid);`
- Butir 47-57: lihat blok rollback di masing-masing file — **DROP berurutan TERBALIK dari urutan jalannya** (57→56→...→47), karena dependensi FK/fungsi yang sama berlaku dua arah.

**Rollback kode:** `git revert -m 1 <hash-merge-commit>` pada `main` (merge commit dari langkah c) — **BUKAN** `git reset --hard`, yang menghapus jejak dan memaksa force-push ke `main`. `git revert` menghasilkan commit baru yang membalikkan perubahan, aman untuk branch yang sudah di-deploy.

⚠️ **Urutan rollback DB vs kode kalau keduanya perlu dibalik:** balikkan KODE dulu (revert merge commit, deploy), BARU DB — pola yang sama dengan "deploy code yang berhenti baca kolom dulu, baru drop kolom" (`CLAUDE.md` §Aturan Wajib). Membalik DB dulu sementara kode baru masih berjalan akan memutus fungsi yang kode itu panggil (persis skenario gotcha #44 yang dihindari urutan maju).

---

### Lampiran — Tabel Deteksi 60 Migrasi `develop`..`main` (dibuat 17 Okt 2026, review Vir)

> Tabel ini mencakup **SELURUH 60 file migrasi** yang ada di `develop` tapi belum di `main` — 44 file rantai AR Storbit/TD-281/TD-300 (`main..release/2026-10-14`) + 16 file TD-318 Paket 2 Lead Pool (`release/2026-10-14..develop`). Setiap baris bisa **DIJALANKAN LANGSUNG** ke SQL Editor tanpa interpretasi lebih lanjut. Teknik sesuai gotcha #44 (`CLAUDE.md`): `oidvectortypes(p.proargtypes)` untuk signature fungsi — BUKAN `pg_get_function_identity_arguments`. **Catatan umum untuk fungsi yang DIGANTI ULANG (`CREATE OR REPLACE`) lebih dari sekali dalam rentang 60 file ini:** query existence/signature pada fungsi semacam itu mengonfirmasi "kapabilitas ini sudah live", BUKAN "file INI SPESIFIK yang terakhir menulis badannya" — operator WAJIB mengandalkan URUTAN EKSEKUSI (kolom dependency di tabel Ringkasan/Langkah 1) untuk kepastian per-file, dan menjalankan query SEGERA sesudah masing-masing file dijalankan (bukan retroaktif). Baris yang terdampak ditandai eksplisit di kolom Catatan.

#### Kelompok A — 44 file rantai AR Storbit/TD-281/TD-300

| File | Objek Kunci | Query Deteksi | Catatan |
|---|---|---|---|
| `20260918000001_set_sql_on_quotation_sent.sql` | trigger `trg_set_sql_on_quotation_sent` | `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='quotations' AND t.tgname='trg_set_sql_on_quotation_sent' AND NOT t.tgisinternal;` | Butir 2b. **SUDAH LIVE production sejak 18 Sep 2026 — JANGAN jalankan ulang.** |
| `20260924000001_menu_skeleton_catalog.sql` | baris `module_menus` key `skel_1_2_1` | `SELECT 1 FROM public.module_menus WHERE key='skel_1_2_1';` | Butir 5. Data-only, idempoten (`ON CONFLICT DO NOTHING`). Cek jumlah penuh: `SELECT count(*) FROM public.module_menus WHERE key LIKE 'skel_%';` harus 156. |
| `20260924000002_menu_skeleton_grant_template.sql` | TEMPLATE — blok `VALUES` sengaja kosong | `SELECT mm.key, count(*) FROM public.role_menu_permissions rmp JOIN public.menu_actions ma ON ma.id=rmp.menu_action_id JOIN public.module_menus mm ON mm.id=ma.menu_id WHERE mm.key LIKE 'skel_%' GROUP BY mm.key;` | Butir 5. File ini TIDAK punya efek terdeteksi sampai `VALUES` diisi manual dan dijalankan. Query ini mendeteksi grant `skel_%` dari SUMBER APA PUN (file ini ATAU UI Role Defaults manual), bukan khusus file ini. |
| `20260925000001_dni_sp_order_item_link.sql` | function `generate_delivery_from_picking(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='generate_delivery_from_picking' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 6. File ini JUGA me-replace `create_invoice_for_sp` (direplace lagi 4× lebih lanjut di tabel ini) — `generate_delivery_from_picking` dipilih karena TIDAK direplace lagi. |
| `20260925000002_sp_order_items_legacy_unique.sql` | unique index `sp_order_items_legacy_sp_item_id_key` | `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='sp_order_items_legacy_sp_item_id_key';` | Butir 7. |
| `20260925000003_staging_only_notify_sp_milestone_noop.sql` | STAGING ONLY, arah terbalik | `SELECT p.prosrc NOT LIKE '%Dinonaktifkan sengaja%' AS masih_versi_produksi_asli FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='notify_sp_milestone';` | Butir 10. **HARUS `true` di production** (versi no-op TIDAK pernah mendarat di sana). **JANGAN jalankan file ini ke production.** |
| `20260926000001_set_delivery_signed_date.sql` | kolom `delivery_notes.signed_date_filled_by` | `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_notes' AND column_name='signed_date_filled_by';` | Butir 8. |
| `20260926000002_ar_single_issue_path.sql` | ACL `create_invoice(uuid, date)` — `REVOKE ALL FROM PUBLIC` (`:535-536`) | `SELECT has_function_privilege('anon','public.create_invoice(uuid, date)','EXECUTE') AS anon_masih_bisa_eksekusi;` | Butir 9 (⛔ rollback MENYEMPIT sesudah ini — lihat §Langkah tak-bisa-di-rollback). **[KOREKSI 17 Okt 2026, review Vir — query LAMA dijalankan ke production dan SELALU `true`]** existence `create_invoice(uuid,date)` salah jadi marker: fungsi ini **SUDAH ADA sebelum file ini**, ber-`proacl NULL` = PUBLIC EXECUTE (gejala H4, §Paket Keamanan TD-281) — keberadaannya tak membuktikan file ini sudah jalan. Query baru mengecek ACL yang file ini benar-benar UBAH: harus `false` sesudah butir 9 jalan. Verifikasi setara untuk dua fungsi lain yang di-REVOKE baris yang sama: `SELECT has_function_privilege('anon','public.create_invoice_for_sp(uuid, date)','EXECUTE');` (`:538`) dan `SELECT has_function_privilege('anon','public.submit_invoice(uuid)','EXECUTE');` (`:541`) — ketiganya harus `false`. |
| `20260927000001_invoice_due_date_backfill.sql` | tabel `sp_invoices_due_date_backfill_20260927` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sp_invoices_due_date_backfill_20260927';` | Butir 11. |
| `20260927000002_account_role_mapping.sql` | tabel `account_role_mappings` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_role_mappings';` | Butir 12, WAJIB sebelum butir 13. ⚠️ Tabrakan nomor file dengan baris di bawah (keduanya `20260927000002`) — DISENGAJA, lihat `08_TECH_DEBT.md`. |
| `20260927000002_get_table_columns_revoke_anon.sql` | REVOKE EXECUTE `anon` dari `get_table_columns(text)` | `SELECT has_function_privilege('anon','public.get_table_columns(text)','EXECUTE') AS bisa_anon;` | Harus `false`. Tabrakan nomor file DISENGAJA (lihat baris di atas). **SUDAH LIVE production (dan staging) — dikonfirmasi `anon` tidak bisa EXECUTE, checkpoint saja, review Vir 17 Okt 2026.** |
| `20260927000003_hak_anon_catchup.sql` | REVOKE MAINTAIN/REFERENCES/TRIGGER/TRUNCATE dari `anon` pada 25 tabel | `SELECT has_table_privilege('anon','public.sales_calls','TRIGGER') AS anon_masih_bisa_trigger;` | Harus `false`. `sales_calls` dipilih karena tabel ini tak disentuh migrasi lain di tabel ini. **SUDAH LIVE production (dan staging) — dikonfirmasi `anon` tidak bisa TRIGGER `sales_calls`, checkpoint saja, review Vir 17 Okt 2026.** |
| `20260927000003_journal_account_roles_and_readiness.sql` | function `sp_invoice_readiness(uuid)` [introduksi PERTAMA] | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sp_invoice_readiness' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 13, sesudah 9 DAN 12. **Fungsi ini DIGANTI ULANG oleh `20260930000002`** (signature sama) — existence memastikan rantai dimulai, bukan versi spesifik. ⚠️ Tabrakan nomor file dengan baris di atas (keduanya `20260927000003`) — DISENGAJA. |
| `20260927000004_menu_grant_fin_invoice.sql` | grant `role_menu_permissions` `fin_invoice`/`view` untuk `finance_controller` | `SELECT 1 FROM public.role_menu_permissions rmp JOIN public.roles r ON r.id=rmp.role_id JOIN public.menu_actions ma ON ma.id=rmp.menu_action_id JOIN public.module_menus mm ON mm.id=ma.menu_id WHERE mm.key='fin_invoice' AND ma.action='view' AND r.code='finance_controller';` | Butir 14 — ⛔ **WAJIB SEBELUM Langkah 4** (tanpa ini `finance_controller` terkunci total dari halaman Finance AR). |
| `20260928000001_invoice_header_v2.sql` | kolom `sp_invoices.customer_tax_id` | `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sp_invoices' AND column_name='customer_tax_id';` | Butir 16, WAJIB PERTAMA rantai invoice lengkap. |
| `20260928000002_invoice_line_v2.sql` | kolom `sp_invoice_lines.line_type` | `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sp_invoice_lines' AND column_name='line_type';` | Butir 17, sesudah 16. |
| `20260928000003_invoice_issue_v2.sql` | function `post_invoice_journal(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='post_invoice_journal' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 18, sesudah 17 DAN 9. File ini JUGA me-replace `create_invoice_for_sp` — `post_invoice_journal` dipilih karena unik. |
| `20260928000004_invoice_write_lockdown.sql` | REVOKE INSERT `sp_invoices` dari `authenticated` | `SELECT has_table_privilege('authenticated','public.sp_invoices','INSERT') AS authenticated_bisa_insert;` | Butir 19, sesudah 18. Harus `false`. |
| `20260928000005_staging_only_taxes_from_production.sql` | STAGING ONLY, arah terbalik | `SELECT count(*) AS jumlah_baris_taxes FROM public.taxes;` | Butir 20. Harus `>0` di production (21 baris) — guard di dalam file menolak jalan kalau `>0`. **JANGAN jalankan ke production.** |
| `20260928000006_invoice_line_tax_link.sql` | backfill `UPDATE … SET tax_id` | `SELECT count(*) AS sisa_null FROM public.sp_invoice_lines sl JOIN public.sp_invoices i ON i.id=sl.invoice_id JOIN public.taxes t ON t.company_id=i.company_id AND t.code='VAT_FULL' AND t.deleted_at IS NULL WHERE t.rate=sl.tax_rate AND sl.tax_id IS NULL;` | Butir 21, sesudah 17. Harus `0` sesudah dijalankan. |
| `20260928000007_invoice_post_issue_rpcs.sql` | function `invoice_dapat_dibaca(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='invoice_dapat_dibaca' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 22, sesudah 16. File ini JUGA create `set_invoice_tax_info(uuid,text,text)` yang direplace lagi di butir 26 — `invoice_dapat_dibaca` dipilih karena unik. |
| `20260928000008_invoice_attachments.sql` | tabel `invoice_attachments` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoice_attachments';` | Butir 23. Bucket Storage perlu dicek manual (di luar SQL). |
| `20260928000009_invoice_notes.sql` | tabel `invoice_notes` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoice_notes';` | Butir 24, mandiri. |
| `20260928000010_invoice_issue_tax_link.sql` | prosrc marker `v_tax_id` di `create_invoice_for_sp` | `SELECT p.prosrc LIKE '%v_tax_id%' AS versi_010_atau_lebih_baru FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';` | Butir 25, sesudah 18 dan 21. Marker ini TETAP `true` sesudah `20261013000001` juga jalan (pola self-check yang sama dipakai V1a file ini sendiri). |
| `20260928000011_invoice_coretax_code_whitelist.sql` | prosrc marker `v_kode` di `set_invoice_tax_info` | `SELECT p.prosrc LIKE '%v_kode%' AS versi_coretax_whitelist FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='set_invoice_tax_info';` | Butir 26, sesudah 22. |
| `20260929000004_ar_tahap3_compute_payment_term_days.sql` | function `compute_payment_term_days(uuid,uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='compute_payment_term_days' AND oidvectortypes(p.proargtypes)='uuid, uuid';` | Butir 32, WAJIB PERTAMA AR Tahap 3. |
| `20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan.sql` | CHECK constraint `account_role_mappings_role_key_check` memuat `potongan_pelanggan` | `SELECT pg_get_constraintdef(oid) LIKE '%potongan_pelanggan%' AS sudah_diperluas FROM pg_constraint WHERE conname='account_role_mappings_role_key_check';` | Butir 33, sesudah butir 12. |
| `20260929000006_ar_tahap3_sp_payments_potongan_kolom.sql` | kolom `sp_payments.potongan_lain` | `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sp_payments' AND column_name='potongan_lain';` | Butir 34, mandiri. |
| `20260929000007_ar_tahap3_record_payment_v3.sql` | function `record_payment` 9-arg | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='record_payment' AND oidvectortypes(p.proargtypes)='uuid, numeric, date, text, numeric, text, text, numeric, text';` | Butir 35, sesudah 9,13,33,34. **Signature SAMA dengan `20260930000004`** (replace berikutnya) — existence memastikan rantai dimulai, jalankan berurutan & cek segera sesudah masing-masing file. |
| `20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql` | function `mark_ttf_received(uuid,text,text,text,date)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_ttf_received' AND oidvectortypes(p.proargtypes)='uuid, text, text, text, date';` | Butir 36, sesudah 18,25,32. **Signature SAMA dengan `20260929000010` dan `20260930000004`** (dua replace berikutnya) — existence memastikan rantai dimulai. |
| `20260929000009_ar_tahap3_due_date_ttf_backfill.sql` | tabel `sp_invoices_due_date_ttf_backfill_20260929` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sp_invoices_due_date_ttf_backfill_20260929';` | Butir 37, MENUNGGU REVIEW DEN (opsional), sesudah 36. |
| `20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali.sql` | function `mark_ttf_received` (signature sama baris di atas) | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='mark_ttf_received' AND oidvectortypes(p.proargtypes)='uuid, text, text, text, date';` | Butir 38, sesudah 36. Chain sama dengan baris `20260929000008`/`20260930000004` — cek SEGERA sesudah file ini dijalankan untuk kepastian versi. |
| `20260930000001_ar_tahap3b_status_pending_approval.sql` | kolom `sp_invoices.approved_by` | `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sp_invoices' AND column_name='approved_by';` | Butir 39, WAJIB PERTAMA AR Tahap 3b. |
| `20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate.sql` | definisi index `sp_invoice_one_per_sp` — predikat BARU (`:234-236`) | `SELECT pg_get_indexdef('public.sp_invoice_one_per_sp'::regclass) LIKE '%draft%' AS versi_baru_sudah_live;` | Butir 40, sesudah 39. **[KOREKSI 17 Okt 2026, review Vir — query LAMA (existence index) SELALU `true`]** index `sp_invoice_one_per_sp` **SUDAH ADA sejak `20260923000001`** (sebelum file ini, predikat lama `WHERE (status <> 'void'::text)`) — existence polos tak membedakan versi. Query baru mencocokkan predikat PERSIS yang file ini ubah (`:219-224`, komentar before/after di file): baru = `WHERE (status NOT IN ('draft', 'void'))` — harus `true` sesudah file ini jalan. File ini JUGA me-replace `sp_invoice_readiness` dan `create_invoice_for_sp`. |
| `20260930000003_ar_tahap3b_approve_reject_invoice.sql` | function `approve_invoice_issue(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_invoice_issue' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 41, sesudah 39,40. |
| `20260930000004_ar_tahap3b_record_payment_ttf_pending_guard.sql` | function `record_payment` 9-arg (sama `20260929000007`) | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='record_payment' AND oidvectortypes(p.proargtypes)='uuid, numeric, date, text, numeric, text, text, numeric, text';` | Butir 42, sesudah 39. **Signature SAMA dengan `20260929000007`** (migrasi SEBELUMNYA dalam rantai) — jalankan berurutan 35 lalu 42, cek segera sesudah masing-masing. File ini JUGA me-replace `mark_ttf_received`. |
| `20260930000005_ar_tahap3b_submit_invoice_finance_role.sql` | prosrc marker peran finance di `submit_invoice` (`:42`) | `SELECT prosrc LIKE '%has_role(''finance'')%' AS versi_dengan_peran_finance FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='submit_invoice';` | Butir 43, mandiri. **[KOREKSI 17 Okt 2026, review Vir — query LAMA (existence `submit_invoice(uuid)`) SELALU `true`]** fungsi ini **SUDAH ADA sejak `20260929000008`** — existence polos tak membedakan versi. Marker baru = PERSIS palang pra/pasca-eksekusi yang file ini sendiri pakai (`:27-30`, `:79-84`): guard `has_role('finance')` ditambahkan ke badan fungsi baris `:42` — harus `true` sesudah file ini jalan. |
| `20260930000006_ar_tahap3b_get_invoice_audit_trail.sql` | function `get_invoice_audit_trail(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_invoice_audit_trail' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 44, mandiri. |
| `20260930000007_td281_h5_lapis1_revoke_trtm_existing.sql` | REVOKE TRUNCATE/REFERENCES/TRIGGER/MAINTAIN dari `authenticated` (ALL TABLES) | `SELECT has_table_privilege('authenticated','public.accounts','TRIGGER') AS authenticated_masih_bisa_trigger;` | Butir 45. Harus `false`. **SUDAH LIVE kedua environment 28 Sep 2026 — checkpoint saja.** |
| `20260930000008_td281_h5_lapis2_anon_business_tables.sql` | REVOKE ALL dari `anon` pada 11 tabel spesifik | `SELECT has_table_privilege('anon','public.audit_logs','SELECT') AS anon_masih_bisa_select;` | Butir 46. Harus `false`. **SUDAH LIVE kedua environment 30 Sep 2026 — checkpoint saja.** |
| `20261002000001_crm_rate_list_module_procurement.sql` | `module_menus.module_id` untuk `crm_rate_list` | `SELECT m.key AS modul FROM public.module_menus mm JOIN public.modules m ON m.id=mm.module_id WHERE mm.key='crm_rate_list';` | Butir 3. Harus mengembalikan `modul='procurement'`. **SUDAH SELESAI 2 Okt 2026 — checkpoint saja.** |
| `20261002000002_td300_default_privileges_revoke_execute.sql` | default ACL fungsi untuk role `postgres` | `SELECT defaclacl FROM pg_default_acl WHERE defaclrole='postgres'::regrole AND defaclobjtype='f' AND defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');` | Butir 3b. Harus 1 baris, ACL TIDAK memuat grantee kosong (`=X`). **SUDAH LIVE kedua environment 2 Okt 2026 — JANGAN jalankan ulang.** |
| `20261007000001_td300_group_e_revoke_public_execute.sql` | EXCLUDED dari jendela rilis ini (informasional, BUKAN go/no-go) | `SELECT count(*) AS fungsi_masih_anon_executable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');` | ⛔⛔ **FILE INI SENGAJA DI LUAR jendela rilis Lead Management/AR — JANGAN jalankan malam ini**, keputusan go/no-go terpisah (lihat §TD-300 Group E — SENGAJA DI LUAR jendela rilis ini). Query murni informasional. |
| `20261013000001_ar_tahap3b_invoice_two_stage_approval.sql` | function `invoice_role_holders(uuid, text[])` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='invoice_role_holders' AND oidvectortypes(p.proargtypes)='uuid, text[]';` | Butir 44a, sesudah 39,40,41,42. File ini JUGA me-replace `create_invoice_for_sp` (replace TERAKHIR dalam rantai 5-file) — `invoice_role_holders` dipilih karena unik. |

#### Kelompok B — 16 file TD-318 Paket 2 Lead Pool

| File | Objek Kunci | Query Deteksi | Catatan |
|---|---|---|---|
| `20261011000001_crm_lead_capture_fields.sql` | kolom `accounts.competitor_price` | `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='competitor_price';` | Butir 47, mandiri. File ini JUGA tambah 8 kolom lain `accounts` + 2 kolom `contacts` (`whatsapp`, `preferred_channel`) — baca isi file untuk daftar lengkap. |
| `20261011000002_crm_lead_master_data_requests.sql` | tabel `dropdown_option_requests` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dropdown_option_requests';` | Butir 48, mandiri. |
| `20261012000001_crm_lead_pool_schema.sql` | function `has_menu_permission_in(uuid,text,text)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_menu_permission_in' AND oidvectortypes(p.proargtypes)='uuid, text, text';` | Butir 49, fondasi Paket 2 (file 1/4). File ini JUGA tambah kolom `is_stale`/`stale_flagged_at` di `accounts` dan function `lead_pool_approvers(uuid)`. |
| `20261012000002_crm_lead_pool_rpc.sql` | function `lead_pool_release(uuid,text)` [versi TANPA notifikasi] | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_pool_release' AND oidvectortypes(p.proargtypes)='uuid, text';` | Butir 50, sesudah 49. **Signature SAMA dengan versi `20261012000006`** (notifikasi) yang mereplace-nya lagi — existence memastikan rantai dimulai. Keempat function (release/request_pull/approve_pull/reject_pull) lahir di file ini. |
| `20261012000003_crm_lead_pool_triggers.sql` | prosrc marker `stale_flagged_at` di `set_prospect_on_inquiry` | `SELECT p.prosrc LIKE '%stale_flagged_at%' AS versi_lead_pool FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='set_prospect_on_inquiry';` | Butir 51, sesudah 49. Fungsi ini SUDAH ADA sejak 18 Jul 2026 (migrasi lama) — marker ini membedakan versi Lead Pool, BUKAN existence polos. |
| `20261012000004_crm_lead_pool_approval_roles.sql` | grant `role_menu_permissions` `crm_lead_pool_approval`/`view` untuk `bd_sales_spv_console` | `SELECT 1 FROM public.role_menu_permissions rmp JOIN public.roles r ON r.id=rmp.role_id JOIN public.menu_actions ma ON ma.id=rmp.menu_action_id JOIN public.module_menus mm ON mm.id=ma.menu_id WHERE mm.key='crm_lead_pool_approval' AND ma.action='view' AND r.code='bd_sales_spv_console';` | Butir 52, mandiri (lihat §52 utk detail cabut role `manager` umum). |
| `20261012000005_crm_lead_aging_threshold_policy.sql` | baris `sla_policies` `code='LEAD_STALE'` | `SELECT 1 FROM public.sla_policies WHERE code='LEAD_STALE';` | Butir 53, berpasangan dengan deploy EF `aging-pipeline`. |
| `20261012000006_crm_lead_pool_notifications.sql` | function BARU `trg_fn_lead_pool_auto_release()` (`:467`) | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='trg_fn_lead_pool_auto_release';` | Butir 55, **SESUDAH butir 54** (bukan 50/51/52/53 — lihat urutan production MENGIKAT khusus). **[KOREKSI 17 Okt 2026, review Vir — dijalankan ke staging, marker LAMA salah]** badan `lead_pool_release` yang live di staging **TIDAK memuat kata "notifications"**. Marker baru = fungsi yang DIPERKENALKAN PERTAMA KALI oleh file ini (nol ambiguitas replace); alternatif setara: `trg_fn_block_inquiry_for_pooled_account()` (`:526`). File ini JUGA memperkenalkan `lead_pool_assign(uuid,uuid)` 2-argumen yang KEMUDIAN di-DROP `20261016000004` — JANGAN pakai itu sebagai marker. |
| `20261012000007_crm_quotation_lock_on_closed_inquiry.sql` | trigger `trg_z_quotation_auto_close_on_inquiry_closed` ON `inquiries` (`:167-168`) | `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='inquiries' AND t.tgname='trg_z_quotation_auto_close_on_inquiry_closed' AND NOT t.tgisinternal;` | Butir 56, didahului LANGKAH MANUAL backup "9a" (lihat §56). **[KOREKSI 17 Okt 2026, review Vir]** query LAMA mencari trigger ini di `quotations` — SALAH, trigger ini `AFTER UPDATE OF status ON public.inquiries` (`:168`), bukan `quotations`. Alternatif setara lahir dari file yang sama, terpasang di `quotations` (dikonfirmasi live staging): `trg_z_lock_quotation_closed_inquiry` (`BEFORE INSERT OR UPDATE ON public.quotations`, `:217-219`) — `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='quotations' AND t.tgname='trg_z_lock_quotation_closed_inquiry' AND NOT t.tgisinternal;` |
| `20261012000008_crm_lead_pool_sweep_notify.sql` | function `lead_pool_sweep_deactivated_owner(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_pool_sweep_deactivated_owner' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 57, TERAKHIR dari rangkaian 11 berkas Paket 2. |
| `20261012000009_crm_lead_pool_legacy_cleanup.sql` | tabel `accounts_lead_pool_backup_20261012` | `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='accounts_lead_pool_backup_20261012';` | Butir 54 — ⚠️ WAJIB jalan SEBELUM butir 55 (akhiran nomor file `...009` tapi urutan production MENDAHULUI `...006`/`...007`/`...008`) — lihat §54. |
| `20261016000001_accounts_contacts_updated_at_trigger.sql` | trigger `trg_accounts_updated_at` | `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='accounts' AND t.tgname='trg_accounts_updated_at' AND NOT t.tgisinternal;` | Butir 59. **SUDAH LIVE production sejak 16 Okt 2026 — JANGAN jalankan ulang.** |
| `20261016000002_bd_digital_marketing_manager_role.sql` | role `bd_digital_marketing_manager` | `SELECT 1 FROM public.roles WHERE code='bd_digital_marketing_manager' AND deleted_at IS NULL;` | Butir 60. **SUDAH LIVE production sejak 16 Okt 2026 — JANGAN jalankan ulang.** |
| `20261016000003_crm_lead_capture_computed_sort_columns.sql` | function `bant_score(accounts)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='bant_score' AND oidvectortypes(p.proargtypes)='accounts';` | Butir 61, LIVE STAGING SAJA — WAJIB jalan SEBELUM/BERSAMAAN kode naik ke `main`; perlu `NOTIFY pgrst, 'reload schema'` sesudahnya. |
| `20261016000004_lead_pool_assign_reason.sql` | function `lead_pool_assign` 3-arg DAN absennya versi 2-arg | `SELECT count(*) AS jumlah_signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_pool_assign';` | Butir 62, LIVE STAGING SAJA (via SQL Editor Den — file ini memuat `DROP FUNCTION`, bukan connector). Harus `jumlah_signature=1`; kalau 2, DROP versi lama belum jalan — PostgREST akan ambigu. |
| `20261017000001_lead_pool_assign_candidates.sql` | function `lead_pool_assign_candidates(uuid)` | `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_pool_assign_candidates' AND oidvectortypes(p.proargtypes)='uuid';` | Butir 63, LIVE STAGING SAJA, sesudah 62. |

#### Hasil deteksi 17 Okt 2026 (review Vir — seluruh 60 query dijalankan ke production DAN staging)

Vir menjalankan seluruh 60 baris Lampiran ini (versi SEBELUM koreksi di atas) ke production dan staging malam 17 Okt 2026. **5 query keliru** (ditemukan dan diperbaiki di tabel Kelompok A/B di atas — lihat anotasi `[KOREKSI 17 Okt 2026, review Vir]` pada baris `20260926000002` (butir 9), `20260930000002` (butir 40), `20260930000005` (butir 43), `20261012000006` (butir 55), `20261012000007` (butir 56)). Peta hasil di bawah ini memakai kebenaran SEBENARNYA dari production/staging (sesudah dikoreksi secara manual untuk kelima query yang salah), bukan output mentah ke-55 query yang benar.

**Production — SUDAH LIVE (11 file/checkpoint, verifikasi query sudah benar):**
`20260918000001_set_sql_on_quotation_sent` (butir 2b) · `20260925000001_dni_sp_order_item_link` (butir 6) · `20260925000002_sp_order_items_legacy_unique` (butir 7) · `20260927000002_get_table_columns_revoke_anon` (`anon` tidak bisa EXECUTE — sebelumnya tidak ditandai live di tabel ini, dikoreksi di atas) · `20260927000003_hak_anon_catchup` (`anon` tidak bisa TRIGGER `sales_calls` — sebelumnya tidak ditandai live di tabel ini, dikoreksi di atas) · `20260930000007_td281_h5_lapis1_revoke_trtm_existing` (butir 45) · `20260930000008_td281_h5_lapis2_anon_business_tables` (butir 46) · `20261002000001_crm_rate_list_module_procurement` (butir 3, rate list = modul `procurement`) · `20261002000002_td300_default_privileges_revoke_execute` (butir 3b, `defaclacl` = `{postgres=X/postgres}`) · `20261016000001_accounts_contacts_updated_at_trigger` (butir 59) · `20261016000002_bd_digital_marketing_manager_role` (butir 60).

**Production — BELUM (butir 8, 9, 11–26, 32–44, 44a, 47–57, 61, 62, 63):** `20260926000001` (8) · `20260926000002` (9, ACL belum di-REVOKE) · `20260927000001` (11) · `20260927000002_account_role_mapping` (12) · `20260927000003_journal_account_roles_and_readiness` (13) · `20260927000004` (14) · `20260928000001`–`20260928000004` (16–19) · `20260928000006`–`20260928000011` (21–26) · `20260929000004`–`20260929000010` (32–38) · `20260930000001`–`20260930000006` (39–44) · `20261013000001` (44a) · `20261011000001`–`20261012000005` (47–53) · `20261012000006` (55) · `20261012000007` (56) · `20261012000008` (57) · `20261016000003`–`20261017000001` (61–63, LIVE STAGING SAJA sampai sekarang). **Ini bukan temuan baru** — sudah ditulis apa adanya di kolom Status Production pada tabel Ringkasan; Vir mengonfirmasi lewat query, bukan mengubah status.

**Production — SENGAJA TIDAK dijalankan (di luar jendela rilis ini atau arah terbalik):** `20260924000001_menu_skeleton_catalog` + `20260924000002_menu_skeleton_grant_template` (katalog menu kerangka, belum dijalankan di mana pun sesuai header file sendiri) · `20261007000001_td300_group_e_revoke_public_execute` (Group E — 97 fungsi masih `anon`-executable, informasional, keputusan go/no-go TERPISAH, lihat §TD-300 Group E) · `20260925000003_staging_only_notify_sp_milestone_noop` (production terbukti versi ASLI — `prosrc NOT LIKE '%Dinonaktifkan sengaja%'` = `true`) · `20260928000005_staging_only_taxes_from_production` (production 21 baris `taxes`, guard di dalam file menolak jalan kalau `>0`).

**Staging:** seluruh 60 file sudah live KECUALI katalog menu kerangka (`20260924000001`/`20260924000002`, belum dijalankan di mana pun). `20260925000003_staging_only_notify_sp_milestone_noop` di staging = versi NO-OP (sesuai desain — lihat butir 10, bukan kekeliruan).

⚠️ **Dua implikasi operasional dari hasil ini, bukan sekadar status:** (1) kedua file `20260927000002`/`20260927000003_hak_anon_catchup` SUDAH LIVE production tapi SEBELUMNYA tidak ditandai demikian di tabel di atas — operator malam rilis yang membaca tabel Kelompok A tanpa membaca bagian ini bisa salah mengira keduanya masih perlu dijalankan; (2) kelima query yang salah SUDAH diperbaiki di tabel Kelompok A/B di atas, tapi kalau ada salinan/ekspor tabel ini yang dibuat SEBELUM 17 Okt 2026 malam (mis. dicetak atau disalin ke tempat lain), salinan itu memuat query yang salah — pastikan operator malam rilis membaca versi TERBARU `12_ANTREAN_MIGRASI_PRODUCTION.md`, bukan salinan lama.

---

## Tabel Kekurangan Launching (ringkasan status, 17 Okt 2026)

> Ditulis sebagai bagian audit kesiapan launching 17 Okt 2026 — ditaruh di sini (bukan `08_TECH_DEBT.md`) karena isinya campuran item TD murni dan item operasional non-TD (mockup/akses/infrastruktur) yang semuanya relevan khusus untuk KEPUTUSAN "boleh launching atau belum", bukan utang teknis jangka panjang. Baris yang MEMANG tech debt tetap merujuk nomor TD-nya (sumber tunggal di `08_TECH_DEBT.md`), tidak disalin isinya di sini.

| Item | Status | Pemilik | Menghalangi launching? | Langkah berikutnya |
|---|---|---|---|---|
| **#18 — halaman "Option Requests"** | **[✅ KOREKSI 20 Okt 2026]** Mockup tiba 19 Okt 2026, **kode SUDAH DIBANGUN** 20 Okt 2026 di branch `feat/inquiry-irisan-5` (9 commit) — halaman Option Requests + migrasi `20261020000001` (approval_note/notifikasi/RPC `submit_dropdown_option_request`). ⛔ **BELUM MERGE ke `develop`, belum ada PR.** Migrasi **LIVE STAGING SAJA**, belum production (lihat §65) | Sebelumnya: Claude Design (mockup, SUDAH tiba) → **sekarang: Den** (merge branch + migrasi production) | **YA** — migrasi butir 65 wajib live di production sebelum/bersamaan kode ini naik; blast radius MELEBAR ke jalur "Request new option" Lead Management yang sudah ada (lihat §65) | Review + merge branch `feat/inquiry-irisan-5` ke `develop`; jalankan migrasi butir 65 di production sebelum/bersamaan `develop`→`main` yang membawa Lead Management naik |
| **3 pembaruan mockup belum dikirim ke Claude Design** (opsi "All" filter Created Date · menu "Release to Pool" di Lead Detail · judul kolom "ACCOUNT CODE" menempel dua baris) | **Status beda-beda per item** (diverifikasi 17 Okt 2026): "ACCOUNT CODE" sudah ada catatan "tercatat utk Claude Design" di `08_TECH_DEBT.md` §Irisan 4 Temuan E (ditutup di KODE dgn `whiteSpace` dicabut, tapi mockup-nya sendiri belum dikoreksi/dikirimi feedback); opsi "All" Created Date tercatat sebagai Fase 3 (kosmetik, boleh sesudah launching), BUKAN sebagai "kirim ke mockup"; "Release to Pool" tercatat sebagai Kategori E (app SENGAJA lebih kaya dari mockup, bukan gap mockup) | Den (mengirim feedback ke Claude Design tool) | **TIDAK** — ketiganya Fase 3/Kategori E, boleh sesudah launching | Kirim ketiga catatan ke Claude Design kalau Den ingin mockup-nya diperbarui; tidak ada aksi kode yang menunggu ini |
| **Tanggal cut-off migrasi Finance/AR mundur ke November** (impor TTF, butir 44a, rilis AR) | Sudah tercatat lengkap — lihat §Naskah Eksekusi Malam Rilis (tanggal pasti menyusul) dan §Persiapan H-1 | Den | **✅ KOREKSI 17 Okt 2026 (review Vir, diverifikasi langsung ke git+production): MENGHALANGI launching Lead Management** — ~~sebelumnya ditulis "TIDAK, jalur terpisah"~~, itu SALAH. Alasan: kode AR dan kode TD-318 hidup BERSAMA di satu `develop` (`git merge-base --is-ancestor origin/release/2026-10-14 develop` = TRUE — branch rilis AR fully contained di `develop`; `git diff --name-only origin/main..origin/release/2026-10-14 -- supabase/migrations/` = 44 file, `git diff --name-only origin/release/2026-10-14..develop -- supabase/migrations/` = 16 file TD-318, 44+16=60). Merge `develop`→`main` menaikkan SEMUANYA sekaligus — TIDAK BISA menaikkan Lead Management saja tanpa AR ikut naik. Dikonfirmasi Vir ke production: fungsi AR (`approve_invoice_issue`, `mark_invoice_printed`, `get_invoice_audit_trail`, `invoice_role_holders`, `sp_invoice_readiness`), tabel (`invoice_attachments`, `invoice_notes`, `account_role_mappings`), kolom (`sp_invoices.coretax_tx_code`) **BELUM ADA SATU PUN** di production — dan AR punya prasyarat SENDIRI yang jauh lebih besar dari migrasi (Naskah Eksekusi Malam Rilis, `12_ANTREAN` butir 6-46) | **AR Tahap 1-3b (butir 6-46) WAJIB selesai dan terverifikasi dulu, ATAU dijalankan di malam yang SAMA sebelum Lead Management** — lihat prasyarat keras baru di kepala §Runbook Rilis Lead Management |
| **TD-322 — 30 tabel aktif + 11 tabel cadangan lama tanpa trigger `updated_at`** | OPEN, daftar NYATA sudah diisi 17 Okt 2026 (review Vir, query langsung ke production) — sebelumnya rujukan dangling di `12_ANTREAN` butir 59, nol baris TD pernah dibuat sebelas hari | Den (keputusan per tabel, 30 aktif saja — 11 cadangan BUKAN scope keputusan trigger) | **TIDAK** | Den memutuskan per tabel (30 aktif) apakah pasang trigger `set_updated_at()`; 2 dari 30 (`app_settings`, `inquiry_comments`) sudah punya pengisi manual PARSIAL di kode, 28 belum diperiksa — lihat baris TD-322 lengkap |
| **Faris perlu logout+login ulang** supaya menu Manager (`bd_digital_marketing_manager`) muncul | Bukan bug — cache role di client (`AuthContext.jsx`) tidak otomatis menyegarkan sesi yang sedang login saat role di DB berubah | — (syarat prosedur, bukan item kerja) | **TIDAK** — syarat SMOKE TEST, bukan pemblokir | Sudah dicatat di §Runbook Rilis Lead Management bagian a.3/d sebagai prasyarat sebelum smoke test approval |
| **TD-319** — modal bertumpuk Admin (`AdminFormModal`+`ConfirmModal`) di luar `kit/Overlay.jsx` | OPEN — belum diinvestigasi apakah bug urutan Escape yang sama (TD-318 Irisan 3 #15) terjadi di sini | — belum ditugaskan | **TIDAK** — modul Admin, bukan Lead Management | Lihat baris TD-319 `08_TECH_DEBT.md` untuk langkah investigasi |
| **TD-320** — `EmptyState` 6 implementasi lain di luar kit | OPEN — belum diinvestigasi/dikerjakan, di luar lingkup Irisan Kit by design | — belum ditugaskan | **TIDAK** | Kandidat konsolidasi masa depan, lihat baris TD-320 |
| **TD-321** — dua sistem toast sengaja tetap terpisah + 2 leftover (`MyProfilePage.jsx`, `AdminHub.jsx`) tidak ikut direstyle | DITUNDA — keputusan sadar Den, bukan bug | Den (kapan unifikasi penuh diputuskan) | **TIDAK** | Lihat baris TD-321; keempat permukaan disatukan SEKALIGUS kalau diputuskan, bukan ditambal satu-satu |
| **Keputusan Terbuka #69 (baru) — breadcrumb dobel 6 halaman HRGA** | OPEN — gejala DIKONFIRMASI via kode 17 Okt 2026 (`ContextHeader` + breadcrumb lokal hardcode di `PendingApprovalPage.jsx` dkk), belum diputuskan disengaja atau bug | Den | **TIDAK** — modul HRGA, nol irisan TD-318 menyentuhnya | Lihat #69 `09_ROADMAP.md`; opsi (a) cabut sekarang (murah) vs (b) biarkan sampai giliran Batch FS G4-G6 HCGA |
| **Keputusan Terbuka #55 — roster notifikasi/approval Lead Pool `['manager','supervisor']`** | OPEN sejak 14 Sep 2026; **untuk Faris spesifik SUDAH TERTUTUP** oleh migrasi butir 60 (`crm_lead_pool_approval`/`view` eksplisit) — tapi SPV sales role lain (`bd_sales_spv_*`, level 6) di LUAR Faris **masih tidak dinotifikasi dan kemungkinan tidak bisa approve** (roster `.in('code',['manager','supervisor'])`, `supervisor` tak ada di `roles`) | Den / BD | **TIDAK untuk smoke test Faris** (role spesifiknya sudah benar); **YA untuk kelengkapan roster SPV sales lain** kalau Den berharap SEMUA SPV bisa approve, bukan cuma Faris | Lihat #55 `09_ROADMAP.md`; perbaikan (ganti roster ke `.in('level',[4,6])`) belum dikerjakan, di luar cakupan migrasi butir 47-64 |
| **Usulan Pak Adam (CEO) — SLA kontak 1 hari kerja + timestamp assign** | MENUNGGU PERSETUJUAN CEO, nol rencana implementasi | Pak Adam (CEO) → Den | **TIDAK** — murni usulan, belum disetujui | Tidak ada aksi sampai persetujuan datang |
| **Supabase organisasi Free Plan, kuota Log Ingestion terlampaui** | **Terverifikasi SEBAGIAN, dua sumber berbeda tingkat kepastian — JANGAN dicampur:** (1) fakta "Free Plan + kuota Log Ingestion terlampaui" **terverifikasi dari kode** — komentar `scripts/qa/env-drift-check.mjs:424-430` eksplisit menyebutnya sebagai alasan desain "satu koneksi per DB" di skrip itu. (2) klaim **"QA sweep pernah dihentikan karenanya"** — ⚠️ **koreksi 17 Okt 2026 (review Vir): sumbernya adalah pernyataan Den di sesi chat Oktober 2026, BUKAN sesuatu yang tertulis di repo** — tidak ada jejak tertulis (commit message, komentar kode, entri `PROGRESS.md`) yang mencatat kejadian "sweep dihentikan" secara spesifik. Jangan dibaca sebagai "terverifikasi dari kode/dokumen" — itu laporan lisan Den yang diteruskan apa adanya, benar sepanjang Den yang menyampaikannya, tapi doc-keeper tidak punya cara independen memverifikasinya dari repo | Den (keputusan upgrade plan) | **PERLU DIPERTIMBANGKAN** — malam rilis melibatkan banyak migrasi+smoke test+kemungkinan sweep QA berurutan; kalau kuota log terlampaui SELAMA jendela eksekusi, kegagalan diam-diam (silent failure) lebih sulit terlihat lewat Supabase Logs dashboard — risikonya ke **observability saat insiden**, bukan ke migrasi itu sendiri gagal | Pertimbangkan upgrade plan SEBELUM malam rilis (biaya observability saat insiden > biaya upgrade), atau pastikan verifikasi hari-H memakai query SQL langsung (seperti query di §b di atas) yang tidak bergantung pada Supabase Logs |

---

## Cara merawat dokumen ini

1. **Setiap SQL manual di staging masuk ke sini**, di hari yang sama. Perubahan tanpa berkas migrasi adalah perubahan yang paling mudah hilang.
2. Butir yang sudah dijalankan di produksi **jangan dihapus** — ubah kolom Production jadi ✔ beserta tanggalnya. Dokumen ini juga jejak.
3. Catat arahnya. Ada butir yang produksinya lebih dulu; menganggap semuanya "staging → production" akan melahirkan eksekusi ganda.
4. Angka dan keadaan di sini **diukur**, bukan disalin dari laporan. Kalau tidak bisa diukur, tulis apa adanya sebagai laporan.
