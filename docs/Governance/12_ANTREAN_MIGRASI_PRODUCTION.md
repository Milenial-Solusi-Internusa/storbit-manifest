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

**Butir 3** memblokir launching. **Butir 6 sampai 9** adalah AR Tahap 1 dan wajib, dengan **urutan yang MENGIKAT: 6 → 7 → 8 → 9.**

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

## Invoice lengkap (butir 16-25) — satu gelombang, urutan MENGIKAT

Sepuluh berkas `20260928*` lahir dari satu keputusan: **seluruh kolom form invoice Odoo ditambahkan sekarang**, sekaligus menanam seam untuk invoice MSI (forwarding) yang belum punya SP. Arsitekturnya **opsi C — generalisasi di tempat**: tabelnya tetap `sp_invoices`/`sp_invoice_lines`, yang ditambahkan adalah `source_type`, `sp_order_id` yang boleh NULL dengan CHECK per sumber, uang yang turun ke baris, dan penerbit per sumber di atas satu pemosting jurnal bersama. **Rename fisik sengaja ditunda** — butir 6-14 dokumen ini diuji terhadap nama yang sekarang dan belum satu pun naik ke produksi.

**Urutan produksi (mengikat):**

```
16 -> 17 -> 18 -> 19        (berkas 1-4, berurutan)
17 -> 21 -> 25              (tautan pajak, sesudah baris punya kolomnya)
16 -> 22                    (RPC pasca-terbit)
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

## Cara merawat dokumen ini

1. **Setiap SQL manual di staging masuk ke sini**, di hari yang sama. Perubahan tanpa berkas migrasi adalah perubahan yang paling mudah hilang.
2. Butir yang sudah dijalankan di produksi **jangan dihapus** — ubah kolom Production jadi ✔ beserta tanggalnya. Dokumen ini juga jejak.
3. Catat arahnya. Ada butir yang produksinya lebih dulu; menganggap semuanya "staging → production" akan melahirkan eksekusi ganda.
4. Angka dan keadaan di sini **diukur**, bukan disalin dari laporan. Kalau tidak bisa diukur, tulis apa adanya sebagai laporan.
