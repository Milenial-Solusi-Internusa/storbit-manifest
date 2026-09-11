-- =============================================================================
-- Migration: 20260911000006_roles_dedup_code_unique
-- Phase:     Beres-beres katalog `roles` (TD-247, catatan Den) — hapus 26 baris
--            role per-entitas yang tersisa sesudah globalisasi roles, lalu kunci
--            keunikan `code` dengan constraint.
-- Status:    LIVE (retroaktif) — dieksekusi manual oleh Den di STAGING dan
--            PRODUKSI pagi 11 Sep 2026 (jam persisnya tidak dicatat), langsung
--            lewat akses Supabase, SEBELUM sesi roles.level (20260911000004) dan
--            SEBELUM konvensi "setiap perubahan skema punya file migrasi"
--            diberlakukan hari itu. FILE INI DITULIS SESUDAHNYA (11 Sep 2026,
--            malam) — nomornya sengaja 000006 (urutan penulisan), walau
--            eksekusinya mendahului 000004/000005.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Keduanya idempoten kalau tetap dijalankan: DELETE mengenai 0 baris (semua
--    company_id sudah NULL), ADD CONSTRAINT gagal dengan "already exists" —
--    bungkus IF NOT EXISTS di bawah membuatnya jadi no-op.
--    ⚠️ Ditulis retroaktif: SQL di bawah direkonstruksi dari keterangan Den;
--    angka & keadaan akhir dibaca ulang langsung dari kedua DB saat file ini
--    ditulis (bagian verifikasi). Isi 26 baris yang dihapus TIDAK tercatat
--    (dihapus keras sebelum ada rekaman) — yang diketahui: 13 kode × 2 entitas
--    (JCI, SOA), semua ber-company_id NOT NULL.
--
-- ── LATAR ──────────────────────────────────────────────────────────────────
--   Migrasi 20260821000003_globalize_roles menyatukan role per-entitas jadi
--   satu baris global per kode (company_id NULL) dan mengalihkan seluruh FK ke
--   baris survivor. Salinan per-entitas JCI/SOA (13 kode × 2 = 26 baris,
--   company_id NOT NULL) masih tertinggal di tabel — tak dibaca gate mana pun
--   (semua query FE/RLS sudah membaca baris global), tapi membuat "berapa role
--   yang ada" punya dua jawaban (14 kode unik vs 40 baris) — TD-247. Katalog
--   yang ambigu itu juga menghalangi UNIQUE (code), yang sejak globalisasi
--   memang seharusnya berlaku.
--
-- ── SIFAT ──────────────────────────────────────────────────────────────────
--   1 DELETE keras (26 baris katalog, BUKAN data bisnis — pengecualian sadar
--   dari aturan soft-delete: baris-baris itu duplikat teknis sisa migrasi,
--   bukan rekaman yang perlu jejak) + 1 ADD CONSTRAINT UNIQUE. Nol fungsi,
--   nol policy, nol GRANT.
--
-- ⚠️ KENAPA "NOL DEPENDENCY" HARUS DICEK SEBELUM DELETE — dan sudah dicek Den:
--   Lima FK menunjuk roles(id):
--     approval_rules.approver_role_id      [ON DELETE NO ACTION]  → DELETE gagal kalau ada
--     role_menu_permissions.role_id        [ON DELETE CASCADE]    → ikut TERHAPUS DIAM-DIAM
--     role_permission_templates.role_id    [ON DELETE CASCADE]    → idem
--     role_permissions.role_id             [ON DELETE CASCADE]    → idem
--     user_roles.role_id                   [ON DELETE CASCADE]    → idem — PENUGASAN USER
--   Empat dari lima CASCADE: kalau ada satu saja user_roles yang masih menunjuk
--   baris JCI/SOA, DELETE ini akan mencabut penugasan user itu tanpa error.
--   Den memverifikasi nol baris di kelima tabel sebelum menghapus; hasil
--   sesudahnya (V3) konsisten: nol user_roles yatim.
--
-- ── KONSEKUENSI CONSTRAINT (untuk Pekerjaan 4 & seterusnya) ────────────────
--   UNIQUE (code) LEBIH KETAT daripada index parsial yang sudah ada,
--   roles_company_code_active_uidx (COALESCE(company_id, 0-uuid), code) WHERE
--   deleted_at IS NULL:
--     - role per-entitas ber-kode sama TIDAK BISA dibuat lagi (memang tak
--       diinginkan sejak globalisasi — scoping ada di user_roles.company_id);
--     - kode yang sudah soft-delete TIDAK BISA dibuat ulang sebagai baris baru
--       (harus di-"hidupkan" kembali: deleted_at = NULL). Pekerjaan 4 (role
--       per-posisi baru) perlu tahu ini.
--   Index parsial lama dibiarkan (tidak dihapus) — kini redundan tapi tak
--   merugikan.
-- =============================================================================

BEGIN;

-- 26 baris (13 kode × JCI/SOA) — hasil saat dijalankan: DELETE 26 (produksi
-- dan staging). Sekarang: 0 baris memenuhi syarat.
DELETE FROM public.roles
 WHERE company_id IS NOT NULL;

-- Bentuk asli: ALTER TABLE public.roles ADD CONSTRAINT roles_code_unique UNIQUE (code);
-- Dibungkus supaya file ini aman dijalankan ulang.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_code_unique') THEN
    ALTER TABLE public.roles ADD CONSTRAINT roles_code_unique UNIQUE (code);
  END IF;
END $$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFIKASI (dibaca ulang langsung dari PRODUKSI dan STAGING, 11 Sep 2026
-- malam, saat file ini ditulis — hasil identik di keduanya)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Katalog bersih: 14 baris = 14 kode unik, semua global, nol soft-delete.
--    HASIL: 14 | true | true | 14
SELECT count(*)                       AS n_baris,
       bool_and(company_id IS NULL)   AS semua_global,
       bool_and(deleted_at IS NULL)   AS nol_soft_delete,
       count(DISTINCT code)           AS n_kode_unik
FROM   public.roles;

-- 2. Constraint terpasang (dan indeks pendukungnya).
--    HASIL: UNIQUE (code) | CREATE UNIQUE INDEX roles_code_unique ON public.roles USING btree (code)
SELECT pg_get_constraintdef(c.oid) AS constraint_def, i.indexdef
FROM   pg_constraint c
JOIN   pg_indexes i ON i.indexname = c.conname
WHERE  c.conname = 'roles_code_unique';

-- 3. Nol penugasan yatim (bukti CASCADE tidak memakan user_roles).
--    HASIL: 0
SELECT count(*) AS user_roles_yatim
FROM   public.user_roles ur
LEFT   JOIN public.roles r ON r.id = ur.role_id
WHERE  r.id IS NULL;

-- 4. Sudah termuat di schema_snapshot.sql (refresh 11 Sep 2026 23:44):
--    `ADD CONSTRAINT roles_code_unique UNIQUE (code)` — diff refresh itulah yang
--    membuat perubahan ini ketahuan belum punya rekaman.
