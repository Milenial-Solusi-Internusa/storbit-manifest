-- =============================================================================
-- Migration: 20261002000001_crm_rate_list_module_procurement
-- Status:    LIVE DI PRODUCTION — dijalankan MANUAL lewat Supabase MCP (Claude)
--            2 Okt 2026. File ini CUMA REKAMAN (retroaktif); idempotent bila
--            toh dijalankan ulang (UPDATE dengan kunci `key`, bukan INSERT).
--            Staging sudah lebih dulu begini sejak 24 Sep 2026 (manual, nol
--            jejak git saat itu) — berkas ini menyamakan production.
--
-- Isi:       Pindahkan saklar/toggle menu "Rate List" dari katalog modul `crm`
--            ke modul `procurement`. Kerangka menu Grand Design Bagian 1
--            menempatkan Rate List di bawah Procurement; tanpa pemindahan
--            katalog ini, izin menu untuk Rate List tidak cocok dengan
--            posisinya di sidebar production.
--
-- Rujukan:   docs/Governance/12_ANTREAN_MIGRASI_PRODUCTION.md butir 3 —
--            SATU-SATUNYA butir yang ditandai "memblokir launching" di
--            dokumen itu. Ditutup dengan berkas ini: butir 3 TIDAK LAGI
--            memblokir launching 15 Oktober 2026 (dicatat doc-keeper
--            terpisah ke doc 12).
--
-- Catatan:   `sort_order = 8` menyamakan posisinya dengan staging (24 Sep
--            2026) — bukan angka yang ditebak di sini. 10 baris grant role
--            (role_menu_permissions / user_menu_permissions) yang sudah
--            menunjuk `menu_actions` milik `crm_rate_list` TIDAK ikut
--            tersentuh — migrasi ini sengaja UPDATE module_id, BUKAN
--            hapus-lalu-buat-ulang baris menu (pola itu akan menjatuhkan
--            seluruh grant yang menempel padanya, lihat peringatan di doc 12
--            butir 3).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- V0 — keadaan SEBELUM perubahan ini (diukur Claude, 2 Okt 2026, production):
--   modul = 'crm', menu_key = 'crm_rate_list', is_active = true.
-- Query yang SAMA dipakai sebagai V1 di bawah untuk membuktikan perubahan.
-- ---------------------------------------------------------------------------
-- SELECT m.key AS modul, mm.key AS menu_key, mm.sort_order, mm.is_active
--   FROM module_menus mm JOIN modules m ON m.id = mm.module_id
--  WHERE mm.key = 'crm_rate_list';

BEGIN;

-- ⚠️ UPDATE module_id, BUKAN DELETE+INSERT — role_menu_permissions/
-- user_menu_permissions menunjuk menu_actions.id, yang mengikuti module_menus
-- lewat FK; menghapus baris menu akan ikut menjatuhkan grant yang menempel.
UPDATE module_menus
   SET module_id = (SELECT id FROM modules WHERE key = 'procurement'),
       sort_order = 8
 WHERE key = 'crm_rate_list';

-- ---------------------------------------------------------------------------
-- V1 — harus sesudah ini: modul = procurement, sort_order = 8.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_modul      text;
  v_sort_order int;
  v_aktif      boolean;
BEGIN
  SELECT m.key, mm.sort_order, mm.is_active
    INTO v_modul, v_sort_order, v_aktif
    FROM module_menus mm JOIN modules m ON m.id = mm.module_id
   WHERE mm.key = 'crm_rate_list';

  IF v_modul IS NULL THEN
    RAISE EXCEPTION 'V1 GAGAL: baris module_menus key=crm_rate_list tidak ditemukan.';
  END IF;
  IF v_modul <> 'procurement' THEN
    RAISE EXCEPTION 'V1 GAGAL: modul crm_rate_list masih "%", seharusnya "procurement".', v_modul;
  END IF;
  IF v_sort_order <> 8 THEN
    RAISE EXCEPTION 'V1 GAGAL: sort_order crm_rate_list = %, seharusnya 8.', v_sort_order;
  END IF;

  RAISE NOTICE 'V1 LOLOS: crm_rate_list -> modul=%, sort_order=%, is_active=%.', v_modul, v_sort_order, v_aktif;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
--   UPDATE module_menus
--      SET module_id = (SELECT id FROM modules WHERE key = 'crm')
--    WHERE key = 'crm_rate_list';
--
-- ⚠️ `sort_order` SEBELUM perubahan ini TIDAK dicatat saat eksekusi (bukan 8 —
-- nilai lamanya tidak diukur sebagai bagian V0 di atas). Kalau rollback ini
-- benar-benar dipakai, periksa dulu urutan menu lain di modul `crm` sebelum
-- memutuskan sort_order pengganti; jangan tebak angkanya.
-- =============================================================================
