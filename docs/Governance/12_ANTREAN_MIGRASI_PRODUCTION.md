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

**Butir 3** memblokir launching. **Butir 6 dan 7** wajib tapi tenggatnya lebih jauh: paling lambat serempak dengan AR Tahap 1. Menjalankannya **lebih awal aman dan justru dianjurkan** — keduanya idempoten, dan setiap Surat Jalan baru yang terbit sebelum butir 6 jalan menambah baris cacat yang harus di-backfill nanti. **Urutannya mengikat: 6 lalu 7.**

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

⚠️ Overload lama `mark_delivery_delivered(uuid)` **masih hidup di kedua environment**, tanpa `REVOKE … FROM PUBLIC` dan tanpa syarat `signed_date` — **TD-263**, DROP-nya = Keputusan Terbuka **#59**. Bukan bagian antrean ini.

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

⚠️ ACL kedua fungsi invoice **masih default PUBLIC di kedua environment**. Pengetatannya (`REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`) adalah **Tahap 1 rencana AR**, bukan butir antrean ini.

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

---

## Cara merawat dokumen ini

1. **Setiap SQL manual di staging masuk ke sini**, di hari yang sama. Perubahan tanpa berkas migrasi adalah perubahan yang paling mudah hilang.
2. Butir yang sudah dijalankan di produksi **jangan dihapus** — ubah kolom Production jadi ✔ beserta tanggalnya. Dokumen ini juga jejak.
3. Catat arahnya. Ada butir yang produksinya lebih dulu; menganggap semuanya "staging → production" akan melahirkan eksekusi ganda.
4. Angka dan keadaan di sini **diukur**, bukan disalin dari laporan. Kalau tidak bisa diukur, tulis apa adanya sebagai laporan.
