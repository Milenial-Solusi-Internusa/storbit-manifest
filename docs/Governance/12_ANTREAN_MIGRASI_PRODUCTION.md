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

Hanya **butir 3** yang memblokir launching.

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

**Satu-satunya butir yang memblokir launching.**

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

---

## Cara merawat dokumen ini

1. **Setiap SQL manual di staging masuk ke sini**, di hari yang sama. Perubahan tanpa berkas migrasi adalah perubahan yang paling mudah hilang.
2. Butir yang sudah dijalankan di produksi **jangan dihapus** — ubah kolom Production jadi ✔ beserta tanggalnya. Dokumen ini juga jejak.
3. Catat arahnya. Ada butir yang produksinya lebih dulu; menganggap semuanya "staging → production" akan melahirkan eksekusi ganda.
4. Angka dan keadaan di sini **diukur**, bukan disalin dari laporan. Kalau tidak bisa diukur, tulis apa adanya sebagai laporan.
