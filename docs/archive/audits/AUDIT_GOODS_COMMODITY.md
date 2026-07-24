# AUDIT SEMPIT — `goods_name` / `commodity` / `cargo_types` (Inquiry)

> **Tujuan:** memastikan penggabungan `goods_name` + `commodity`-teks-Inquiry (di prod diisi nilai sama, mis. dua-duanya "SOLAR PANEL") menjadi **satu field nama barang** tidak memecahkan apa pun, dan menentukan di mana "jenis/sifat kargo" ditaruh setelahnya.
> **Mode:** AUDIT (read-only). Tidak ada file kode/dokumen diubah. File ini satu-satunya yang dibuat.
> **Scope:** hanya tiga field — `inquiries.goods_name`, `commodity` (di `inquiries` **dan** `prf`), `inquiries.cargo_types`.
> **Atribusi:** seluruh nomor baris diverifikasi langsung dari file per tanggal audit. Tidak ada tes runtime, tidak ada query DB dijalankan.

---

## RINGKASAN

**Penggabungan aman dari sisi logika.** Ketiga field adalah **kolom teks polos** di DB (`inquiries.commodity text`, `inquiries.goods_name text`, `inquiries.cargo_types text[]`, `prf.commodity text`) — **tanpa CHECK constraint, tanpa trigger, tanpa fungsi, tanpa referensi RLS** apa pun (diverifikasi: grep `CHECK`/`NEW.`/`OLD.` atas ketiga nama di `schema_snapshot.sql` = nol hit di luar definisi kolom). Artinya **tidak ada logika DB yang bergantung pada isinya** — penggabungan tidak bisa memicu pelanggaran constraint atau memecah trigger. Yang paling penting: **tidak ada satu pun kode yang membaca `inquiries.commodity` sebagai "jenis kargo"** — seluruh pembacaannya murni **display** (list modal, Detail Account, InquiryPDF, DealDetail) plus satu **teks bantu di PRF**. Percabangan "sifat kargo" (DG dll) di Inquiry berjalan **eksklusif** dari `cargo_types` (`InquiryFormPage.jsx:307` `cargo_types.includes('dg')`), **bukan** dari `commodity`. Jadi mengubah isi `commodity` Inquiry jadi murni nama barang **tidak merusak logika mana pun**.

**Jenis/sifat kargo di Inquiry disimpan di `cargo_types`, bukan di `commodity`.** `commodity` Inquiry selama ini adalah teks bebas bernuansa *nama* (placeholder form: "Jenis komoditi"), sedangkan checklist `cargo_types` (normal/dg/liquid/reefer/oversize/permit) adalah tempat sebenarnya sifat kargo dicatat — dan itulah yang menggerakkan section Dangerous Goods (UN Number / IMO Class / MSDS). Maka **setelah penggabungan, jenis kargo tetap di `cargo_types` — tidak perlu direlokasi.** `commodity` Inquiry tidak pernah menjadi penyimpan sifat kargo, jadi menggabungnya ke field nama tidak menghilangkan informasi sifat kargo.

**Keputusan yang harus diambil sebelum eksekusi: kolom mana yang menjadi field tunggal.** Ini bukan sekadar "hapus salah satu input form". `goods_name` dan `commodity` masing-masing punya **pembaca berbeda**: `goods_name` dibaca sebagai "Nama Barang" di InquiryPDF/DealDetail/Detail Account; `commodity` dibaca sebagai "Komoditas/Commodity" di tempat-tempat itu **plus dibaca lintas-modul oleh form PRF** (`PRFFormPage.jsx:554`, teks bantu "Dari inquiry: … — pilih padanan manual"). Kolom yang "dipensiunkan" akan membuat pembacanya menampilkan kosong/basi kalau tidak ikut diperbarui. **PRF adalah satu-satunya konsumen lintas-modul** dan ia membaca `inquiries.commodity` secara spesifik — bila kolom yang menang adalah `goods_name` dan `commodity` dikosongkan, teks bantu PRF itu ikut kosong. Rincian per-pembaca ada di Risiko.

---

## PETA PER FIELD

### 1. `inquiries.goods_name` — teks bebas ("Nama Barang (EN)")

**Bentuk DB:** `goods_name text` (`schema_snapshot.sql:3700`). Nullable, tanpa default, tanpa CHECK.

**Ditulis (create + edit) — hanya di `InquiryFormPage.jsx`:**
- state init `:160` · populate edit-mode `:205` · payload create/edit `:263` · input form "Nama Barang (EN)" `:442`.

**Dibaca (semuanya display; tak ada logika/percabangan):**
- `CustomerDetailPage.jsx:416` — baris "Nama Barang" di blok detail inquiry (di-`select` `:763`).
- `InquiryPDF.jsx:166` — "Nama Barang (EN)" di PDF.
- `DealDetailPage.jsx:441` — "Nama Barang" (di-`select` `:154`).
- `InquiryListPage.jsx:249` — **hanya di klausa `select`** (di-fetch), **tidak dirender** di modal list-nya (modal hanya menampilkan Commodity + Estimated Volume, `:203–204`); nilainya mengalir ke **InquiryPDF** lewat `inquiry={inq}` (`:433`).

**Pemakaian lintas modul:** **TIDAK ADA.** Tabel `prf` tak punya kolom `goods_name`; Quotation/SO/Dashboard/RLS/trigger nol referensi.

---

### 2a. `inquiries.commodity` — teks bebas ("Commodity" / "Komoditas")

**Bentuk DB:** `commodity text` (`schema_snapshot.sql:3687`). Nullable, tanpa default, **tanpa CHECK** — teks bebas murni.

**Ditulis (create + edit) — hanya di `InquiryFormPage.jsx`:**
- state init `:157` · populate edit-mode `:197` · payload create/edit `:255` · input form "Commodity" (teks bebas, placeholder "Jenis komoditi") `:468`.

**Dibaca:**
- `InquiryListPage.jsx:203` — "Commodity" di detail modal (di-`select` `:248`). **Display.**
- `CustomerDetailPage.jsx:415` — "Komoditas" (di-`select` `:763`). **Display.**
- `InquiryPDF.jsx:195` — "Komoditas" di PDF. **Display.**
- `DealDetailPage.jsx:449` — "Komoditas" (di-`select` `:154`). **Display.**
- **`PRFFormPage.jsx:554`** — **LINTAS MODUL**: teks bantu read-only "Dari inquiry: `{srcInq.commodity}` — pilih padanan manual" (di-`select` dari `inquiries` `:202`). **Bukan** disalin ke `prf.commodity`; hanya ditampilkan sebagai petunjuk agar procurement memilih enum PRF secara manual.

**Logika/percabangan yang bergantung padanya:** **NOL.** Tidak ada `inquiry.commodity === '…'` di mana pun.

**Pemakaian lintas modul:** hanya **PRF form** (baca sebagai teks bantu, `:554`). Tidak ke Quotation/SO/Dashboard/RLS/trigger.

---

### 2b. `prf.commodity` — kolom teks, **enum ditegakkan FORM** (general / special_permit / dg)

**Bentuk DB:** `commodity text` (`schema_snapshot.sql:4126`). **Tanpa CHECK** — jadi "enum" hanya konvensi UI, bukan DB. Komentar migrasi menyebut "single: general/special_permit/dg" (`20260710000001_prf_fase0.sql:64`) tapi tidak ada constraint yang menegakkannya.

**Ditulis (PRF create) — hanya di `PRFFormPage.jsx`:**
- state init `:175` · payload `:407` · dropdown 3 opsi `:548–553`.

**Dibaca:**
- **`PRFFormPage.jsx:290`** — **LOGIKA**: `isDG = form.commodity === 'dg'` → menggerakkan visibilitas + kewajiban field **MSDS** (`:314`, `:563–571`). **Ini sumbu "sifat kargo" di PRF.**
- `PRFFormPage.jsx:312` — validasi wajib diisi.
- `PRFDetailPage.jsx:376` — baris "Commodity" di detail PRF (di-`select` `PRF_SELECT` `:54`). **Display.**

**Hubungan dengan `inquiries.commodity`:** **tidak sinkron / tidak disalin.** `applyInquiryData` **sengaja tidak** menyalin commodity (komentar `PRFFormPage.jsx:95`). Satu-satunya sambungan = teks bantu `:554` (lihat 2a). Jadi `prf.commodity` (enum sifat kargo) dan `inquiries.commodity` (nama bebas) adalah **dua field berbeda makna yang kebetulan senama** — **di luar scope penggabungan** (penggabungan hanya menyentuh sisi Inquiry).

---

### 3. `inquiries.cargo_types` — array checklist (sifat kargo sebenarnya di Inquiry)

**Bentuk DB:** `cargo_types text[]` (`schema_snapshot.sql:3704`). Array; nilai: normal/dg/liquid/reefer/oversize/permit (dari `CARGO_TYPES` di `InquiryFormPage.jsx:35–42`).

**Ditulis (create + edit) + LOGIKA — di `InquiryFormPage.jsx`:**
- state init `:161` · populate edit-mode `:210` · payload `:268` · render CargoCard checklist `:483`.
- **`:307` — LOGIKA**: `dgSelected = form.cargo_types.includes('dg')` → membuka section Dangerous Goods (UN Number `:493`, IMO Class `:496`, MSDS `:505`). **Ini penggerak sifat-kargo di Inquiry.**

**Dibaca (display):**
- `InquiryPDF.jsx:115` (baca array) + `:179` "Kategori Kargo".
- `CustomerDetailPage.jsx:425` — "Cargo Type" (di-`select` `:763`).
- `DealDetailPage.jsx:445` — "Cargo Type" BadgeRow (di-`select` `:154`).
- `InquiryListPage.jsx:250` — **hanya di `select`**, **tidak dirender** di modal list; mengalir ke InquiryPDF (`:433`).

**Pemakaian lintas modul:** **TIDAK ADA.** `prf` tak punya `cargo_types`. Nol RLS/trigger/fungsi.

---

### Catatan pemisah — `bant_commodity` BUKAN bagian scope

`bant_commodity` (`accounts` + tabel backup, `schema:1684/1760/1833`; UI `ProspectFormPage.jsx:456` label "Komoditi", `CustomerDetailPage.jsx:147`, `bant.js:93`, `useCustomFields.js:29`) adalah **field BANT di tabel `accounts`** — sama sekali terpisah dari `inquiries.commodity`. Disebut di sini hanya agar tidak tertukar saat grep "commodity". **Tidak terpengaruh penggabungan.**

---

## JAWABAN PERTANYAAN INTI

### A. Kalau `goods_name` + `commodity`-Inquiry digabung, apa yang terpengaruh?

**Tidak ada logika yang rusak.** Seluruh pembaca `inquiries.commodity` bersifat **display** (`InquiryListPage:203`, `CustomerDetailPage:415`, `InquiryPDF:195`, `DealDetailPage:449`) plus satu **teks bantu di PRF** (`PRFFormPage:554`). **Tidak ada** kode yang membaca `inquiries.commodity` sebagai "jenis kargo" atau mempercabangkannya — jadi mengubah isinya jadi murni nama barang aman terhadap logika.

Yang **terpengaruh** hanyalah **presentasi + pilihan kolom kanonik**:
- Setelah digabung, label "Commodity"/"Komoditas" (5 tempat) akan menampilkan nilai yang **sama** dengan "Nama Barang" — duplikat kosmetik sampai label/renderernya dirapikan.
- **Keputusan kolom kanonik menentukan renderer mana yang harus diperbarui:**
  - Bila field tunggal disimpan di **`goods_name`** dan `commodity` dipensiunkan → perbarui/pindahkan pembaca `commodity`: `InquiryListPage:203`, `CustomerDetailPage:415`, `InquiryPDF:195`, `DealDetailPage:449`, **dan `PRFFormPage:554` (lintas modul)**. Jika tidak, kelimanya menampilkan kosong.
  - Bila field tunggal disimpan di **`commodity`** dan `goods_name` dipensiunkan → perbarui pembaca `goods_name`: `CustomerDetailPage:416`, `InquiryPDF:166`, `DealDetailPage:441`.
- Form Inquiry sendiri (`InquiryFormPage`) punya **dua input terpisah** hari ini — "Nama Barang (EN)" `:442` dan "Commodity" `:468` — penggabungan berarti menghapus salah satu input + payload key-nya.

### B. "Jenis/sifat kargo" sekarang disimpan di mana?

- **Di Inquiry: di `cargo_types` (array), BUKAN `commodity`.** Percabangan DG memakai `cargo_types.includes('dg')` (`InquiryFormPage:307`). `commodity` Inquiry adalah teks bebas bernuansa nama, tak pernah menggerakkan logika sifat kargo.
- **Di PRF: di `prf.commodity` (enum general/special_permit/dg)**, yang menggerakkan `isDG` (`PRFFormPage:290`). PRF tak punya `cargo_types`.

**Konsekuensi keputusan:** setelah penggabungan di Inquiry, **jenis kargo tetap di `cargo_types` — tidak dipindah ke mana pun.** Field nama hasil gabungan hanya menampung **nama barang**. Jangan menaruh sifat kargo ke field nama; sifat kargo sudah punya rumah (`cargo_types`). (Catatan: PRF memakai kolom senama `commodity` untuk sumbu sifat kargo, tapi itu tabel & alur berbeda dan **di luar scope** penggabungan Inquiry.)

### C. Apakah `commodity` Inquiry (teks) & `commodity` PRF (enum) tersambung/di-prefill?

**Tidak disalin/di-prefill.** `applyInquiryData` (helper prefill PRF) **sengaja melewati** commodity (komentar `PRFFormPage:95`: "service_type/commodity/… SENGAJA tak disalin"). Satu-satunya sambungan = **teks bantu display** di `PRFFormPage:554` yang menampilkan `srcInq.commodity` agar procurement memilih enum PRF secara manual.

**Dampak penggabungan ke PRF:** karena PRF **membaca `inquiries.commodity`** untuk teks bantu itu:
- Jika kolom kanonik = `commodity` (goods_name dipensiunkan) → teks bantu PRF otomatis menampilkan nilai gabungan (nama barang). **Tak ada perubahan mekanisme**, hanya isinya kini pasti nama barang (yang memang sudah terjadi di prod).
- Jika kolom kanonik = `goods_name` (commodity dikosongkan) → **teks bantu PRF `:554` akan kosong** kecuali diarahkan membaca `goods_name`. Ini efek lintas-modul yang harus diperhitungkan.

PRF **tidak** menyimpan apa pun dari `inquiries.commodity`; jadi tidak ada data PRF yang rusak — hanya petunjuk layar yang perlu tetap terisi.

### D. Berapa baris existing yang `goods_name` ≠ `commodity`?

**Tidak bisa dihitung tanpa query DB** (audit tak menjalankan query). SQL siap-jalan disediakan di bagian **SQL VERIFIKASI** — jalankan manual. Ini menentukan **aturan merge** untuk baris yang berbeda (mana yang menang / apakah perlu gabung teks), bukan sekadar konfirmasi "kebanyakan sama".

---

## RISIKO PENGGABUNGAN

| # | Risiko | Severity | Cara menghindari |
|---|---|---|---|
| R1 | **Pembaca kolom yang dipensiunkan menampilkan kosong.** Bila `commodity` dikosongkan, 5 renderer (`InquiryListPage:203`, `CustomerDetailPage:415`, `InquiryPDF:195`, `DealDetailPage:449`, **`PRFFormPage:554` lintas modul**) tampil kosong; bila `goods_name` dikosongkan, 3 renderer (`CustomerDetailPage:416`, `InquiryPDF:166`, `DealDetailPage:441`) tampil kosong. | **MEDIUM** (kosmetik/UX, bukan data corruption — nol logika/DB rusak) | Tetapkan kolom kanonik dulu; perbarui SEMUA pembaca kolom yang dipensiunkan (daftar lengkap di Jawaban A) dalam commit yang sama. |
| R2 | **Baris existing dengan `goods_name` ≠ `commodity`** — merge menimpa salah satu → salah satu nilai historis hilang. | **MEDIUM** (tergantung hasil SQL D) | Jalankan SQL D dulu; kalau ada baris beda, putuskan aturan (kolom mana menang / backfill kolom kanonik dari yang non-kosong) sebelum drop/kosongkan. Ambil backup tabel `inquiries` sebelum tulis massal (pola batch DB lain). |
| R3 | **Teks bantu PRF (`:554`) jadi salah arah** bila kolom kanonik = `goods_name` dan `commodity` dikosongkan. | **LOW-MEDIUM** (lintas modul, mudah luput karena ada di modul Procurement, bukan CRM) | Sertakan `PRFFormPage:554` dalam daftar pembaca yang diperbarui; arahkan ke kolom kanonik. |
| R4 | **Sifat kargo tak sengaja ikut "digabung".** Kalau ada anggapan `commodity` = jenis kargo, orang bisa keliru memindah sifat kargo ke field nama. | **LOW** (sudah dipetakan: sifat kargo = `cargo_types`, terpisah) | Jangan sentuh `cargo_types`. Field nama hanya menampung nama. Section DG tetap digerakkan `cargo_types` (`:307`). |
| R5 | **Regresi diam di form Inquiry**: menghapus satu input (Nama Barang atau Commodity) tapi lupa membuang key payload/populate-nya → nilai lama tertimpa `null` saat edit. | **MEDIUM** | Saat menghapus input, buang juga key di `form` state (`:157`/`:160`), populate edit (`:197`/`:205`), dan payload (`:255`/`:263`) secara konsisten. |
| R6 | **Ketiadaan constraint DB menyembunyikan asumsi.** `prf.commodity` "enum" hanya ditegakkan form; audit ini menemukan nol CHECK. | **INFO** (bukan risiko penggabungan; catatan) | Tidak perlu tindakan untuk penggabungan; hanya jangan berasumsi DB memvalidasi enum. |

**Tidak ada risiko CRITICAL:** nol constraint/trigger/fungsi/RLS bergantung pada ketiga field, dan nol logika membaca `inquiries.commodity`. Risiko tertinggi = **MEDIUM display/data-merge**, seluruhnya dapat dicegah dengan menetapkan kolom kanonik + memperbarui pembaca + menjalankan SQL D lebih dulu.

---

## SQL VERIFIKASI (jalankan manual — JANGAN dieksekusi oleh audit)

```sql
-- (D-1) Ringkasan: berapa baris goods_name vs commodity BEDA vs sama vs kosong.
-- Normalisasi: trim + lower + NULL→'' supaya "SOLAR PANEL" == " solar panel ".
SELECT
  count(*) FILTER (WHERE gn <> cm)                 AS beda,
  count(*) FILTER (WHERE gn = cm AND gn <> '')     AS sama_terisi,
  count(*) FILTER (WHERE gn = '' AND cm = '')      AS dua_duanya_kosong,
  count(*) FILTER (WHERE gn <> '' AND cm = '')     AS hanya_goods_name,
  count(*) FILTER (WHERE gn = '' AND cm <> '')     AS hanya_commodity,
  count(*)                                         AS total
FROM (
  SELECT
    lower(btrim(coalesce(goods_name, ''))) AS gn,
    lower(btrim(coalesce(commodity,  ''))) AS cm
  FROM public.inquiries
  WHERE deleted_at IS NULL
) t;

-- (D-2) Contoh baris yang BEDA — untuk memutuskan aturan merge / kolom kanonik.
SELECT inquiry_no, goods_name, commodity, created_at
FROM public.inquiries
WHERE deleted_at IS NULL
  AND lower(btrim(coalesce(goods_name, ''))) <> lower(btrim(coalesce(commodity, '')))
ORDER BY created_at DESC
LIMIT 50;

-- (D-3) OPSIONAL — sertakan baris soft-deleted (bila migrasi data juga menyentuhnya,
-- pola batch DB lain yang mem-backup termasuk soft-deleted). Hapus filter deleted_at:
-- SELECT count(*) FILTER (WHERE lower(btrim(coalesce(goods_name,''))) <> lower(btrim(coalesce(commodity,'')))) AS beda_termasuk_terhapus,
--        count(*) AS total_termasuk_terhapus
-- FROM public.inquiries;
```

---

## CATATAN AMBIGU

1. **Kolom kanonik belum ditentukan.** Keputusan menyebut "gabung jadi satu field nama barang" tapi tidak menyebut **kolom DB mana** yang bertahan (`goods_name` atau `commodity`). Ini menentukan daftar pembaca yang harus diperbarui (Jawaban A) dan apakah teks bantu PRF `:554` terdampak (R3). **Perlu keputusan sebelum eksekusi.** Pertimbangan: `commodity` punya pembaca lintas-modul (PRF), sedangkan `goods_name` murni CRM — memilih `commodity` sebagai kanonik meminimalkan perubahan lintas modul, tapi label historis "Nama Barang" ada di `goods_name`.
2. **Aturan merge untuk baris berbeda tak bisa ditentukan dari kode** — butuh hasil SQL D. Bila `beda > 0`, perlu aturan eksplisit (kolom mana menang, atau backfill kanonik dari kolom non-kosong, atau gabung teks). Audit tidak memutuskan ini.
3. **`prf.commodity` "enum" tanpa CHECK DB** — penegakan hanya di form. Di luar scope penggabungan (Inquiry), tapi dicatat agar tak ada asumsi DB memvalidasi. Penggabungan sisi Inquiry **tidak** menyentuh `prf.commodity`.
4. **Teks bantu PRF semantiknya sudah "canggung" hari ini** — `PRFFormPage:554` menampilkan teks bebas Inquiry sebagai petunjuk untuk memilih enum (general/special_permit/dg). Menampilkan "SOLAR PANEL" untuk memandu pemilihan kategori memang kurang pas, tapi itu **kondisi eksisting**, bukan akibat penggabungan. Penggabungan tak memperburuknya; hanya memastikan nilainya konsisten satu sumber.
5. **`cargo_types` vs `commodity` PRF tidak sinkron** — sifat kargo Inquiry (`cargo_types`, mis. `dg`) dan sifat kargo PRF (`commodity='dg'`) tidak saling mengisi (prefill sengaja skip commodity). Ini di luar scope penggabungan, tapi relevan bila kelak diinginkan agar penandaan DG mengalir Inquiry→PRF (butuh keputusan terpisah; bukan bagian audit ini).
6. **Metode audit = pembacaan kode + skema, bukan runtime/query.** Jumlah baris beda (D), dan klaim prod "dua-duanya SOLAR PANEL", tidak diverifikasi terhadap DB oleh audit — SQL disediakan untuk dijalankan manual.

---

*Akhir laporan. Tidak ada file kode/dokumen lain yang disentuh.*
