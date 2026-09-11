-- =============================================================================
-- Migration: 20260911000002_fix_legal_name_soa
-- Phase:     Koreksi data — `companies.legal_name` entitas SOA salah nama PT.
-- Status:    LIVE (retroaktif) — dieksekusi manual di Supabase SQL Editor
--            11 Sep 2026 pukul 10:57 WIB (updated_at = 2026-09-11 03:57:07 UTC,
--            dibaca langsung dari produksi); FILE INI DITULIS SESUDAHNYA
--            (11 Sep 2026, hari yang sama).
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di produksi. Ia direkam di sini karena mengubah
--    NAMA LEGAL yang tercetak di dokumen yang dikirim ke customer (invoice,
--    surat jalan, picking list) — dan karena `schema_snapshot.sql` schema-only
--    sejak 5 Sep 2026 TIDAK AKAN PERNAH memuat perubahan data. Tanpa file ini,
--    satu-satunya jejak perubahannya di repo adalah `PROGRESS.md`.
--    Guard `AND legal_name = 'PT Storbit Indonesia'` membuatnya idempoten:
--    dijalankan lagi = "UPDATE 0", bukan menimpa ulang.
--    ⚠️ Ditulis retroaktif: UPDATE-nya persis yang diserahkan ke Den untuk
--    dijalankan (11 Sep 2026); nilai-nilai di bagian verifikasi dibaca ulang
--    dari produksi sesudahnya, bukan direkonstruksi.
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   `companies.legal_name` untuk SOA (d2e5e565-5f67-4954-b8d9-5979a2a0c697)
--   berisi "PT Storbit Indonesia" — nama PRODUK/merek, bukan nama badan hukum.
--   Nama legalnya "PT Stuja Orbit Abadi". Kolom ini dibaca HIDUP oleh lima
--   permukaan yang menghadap customer:
--     - PDF Invoice, dua varian (Billed By + blok tanda tangan) — InvoicePDF.jsx
--     - PDF Picking List (PartyBlock Pengirim)                    — PickingListPDF.jsx:54
--     - PDF Surat Jalan (PartyBlock Pengirim)                     — DeliveryNotePDF.jsx:48
--     - preview Surat Pesanan                                     — SalesOrderDetailPage.jsx:861
--       (yang ini ber-fallback literal 'PT Stuja Orbit Abadi' — nama yang
--        benar sudah ada di kode sebagai cadangan yang tak pernah terpakai,
--        karena datanya terisi, cuma salah)
--   Memperbaiki DATA-nya menutup kelimanya sekaligus, nol deploy. Ini
--   keputusan Den 11 Sep 2026: perbaikan lewat data, bukan tampilan.
--
-- ── EJAAN: TANPA TITIK ─────────────────────────────────────────────────────
--   "PT Stuja Orbit Abadi", bukan "PT. Stuja Orbit Abadi". Mengikuti lima
--   literal di kode (ProductsPage, ProductDetailPage, PositionsPage,
--   tokens.js, fallback SalesOrderDetailPage) DAN
--   entity_bank_accounts.account_holder di produksi — keduanya tanpa titik.
--   Ejaan resmi di akta belum dicek. Kalau kelak ternyata bertitik: yang diubah
--   kolom INI saja; lima literal itu fallback yang tak pernah terpakai.
--
-- ── SIFAT ──────────────────────────────────────────────────────────────────
--   UPDATE satu baris, satu kolom (+ updated_at), nol DDL. `companies.name`
--   SENGAJA tidak disentuh — kolom itu nama internal (CompanySwitcher, daftar
--   entitas), bukan nama dokumen. ⚠️ Temuan sampingan saat verifikasi:
--   `companies.name` SOA ternyata JUGA "PT Stuja Orbit Abadi", bukan
--   "Storbit / SBI" seperti yang tertulis di komentar lama InvoicePDF.jsx —
--   komentar itu basi, bukan datanya.
-- =============================================================================

BEGIN;

UPDATE public.companies
   SET legal_name = 'PT Stuja Orbit Abadi',
       updated_at = now()
 WHERE id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'
   AND legal_name = 'PT Storbit Indonesia';
-- Hasil saat dijalankan: UPDATE 1.

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFIKASI (dijalankan 11 Sep 2026 sesudah UPDATE; hasilnya dibaca ulang
-- langsung dari produksi saat file ini ditulis, hari yang sama)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Nilai baru + waktu perubahan + selaras dengan nama pemilik rekening.
--    HASIL: code SOA · legal_name 'PT Stuja Orbit Abadi' ·
--           updated_at 2026-09-11 03:57:07.183735+00 ·
--           account_holder 'PT Stuja Orbit Abadi' · selaras_rekening = true
SELECT c.code, c.name, c.legal_name, c.updated_at,
       b.account_holder,
       (c.legal_name = b.account_holder) AS selaras_rekening
FROM   public.companies c
LEFT   JOIN public.entity_bank_accounts b
       ON b.company_id = c.id AND b.is_default AND b.is_active
WHERE  c.id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

-- 2. Nol baris di seluruh tabel yang masih memakai nama lama.
--    HASIL: sisa_nama_lama = 0
SELECT count(*) AS sisa_nama_lama
FROM   public.companies
WHERE  legal_name = 'PT Storbit Indonesia';

-- 3. Verifikasi runtime (browser, 11 Sep 2026, dilaporkan Den): PDF invoice
--    cetak menampilkan Billed By "PT Stuja Orbit Abadi" tanpa baris "Storbit",
--    blok tanda tangan "PT STUJA ORBIT ABADI". Nol deploy diperlukan.
