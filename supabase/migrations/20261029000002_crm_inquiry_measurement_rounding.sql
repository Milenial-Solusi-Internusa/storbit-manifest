-- =============================================================================
-- Migration: 20261029000002_crm_inquiry_measurement_rounding
-- Inquiry Management Putaran 12 -- Butir 2: pembulatan weight_kg/volume_cbm
-- ke 2 desimal DI SERVER, menutup DUA jalur tulis sekaligus.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- TANPA DROP -- objek baru (fungsi + trigger), nol versi lama. Boleh
-- dijalankan lewat connector Vir.
--
-- KENAPA TRIGGER, BUKAN ROUND() di dalam RPC -- inquiries.weight_kg/
-- volume_cbm ditulis lewat DUA jalur: (a) create_inquiry_with_lanes (INSERT,
-- 20261025000005) dan (b) DealDetailPage.jsx inline-edit section Cargo --
-- `supabase.from('inquiries').update(...)` LANGSUNG dari client, BUKAN lewat
-- RPC apa pun. Menambah ROUND() di create_inquiry_with_lanes saja akan
-- menutup jalur (a) tapi membiarkan jalur (b) terbuka. Trigger BEFORE
-- INSERT OR UPDATE OF weight_kg, volume_cbm menutup KEDUA jalur sekaligus,
-- dan jalur mana pun di masa depan -- satu tempat, tidak perlu diduplikasi
-- tiap RPC baru yang menyentuh dua kolom ini.
--
-- MEMBULATKAN, BUKAN MENOLAK -- round(numeric, 2) standar Postgres (half
-- away from zero), NULL tetap NULL (tidak pernah dipaksa 0). Nol RAISE
-- EXCEPTION di trigger ini -- tidak ada input yang bisa ditolak olehnya.
--
-- TIDAK MENYENTUH K1c -- weight_kg/volume_cbm TIDAK ada di daftar 12 kolom
-- trg_z_guard_inquiries_protected_columns (20261027000008) -- trigger ini
-- berjalan independen, BEFORE K1c dalam urutan alfabetis nama trigger kalau
-- keduanya pernah menyala pada UPDATE yang sama (prefix default, bukan
-- trg_z_ -- tidak perlu menyala SESUDAH K1c, karena yang dilakukannya murni
-- menormalkan NEW.* sebelum disimpan, tidak bergantung pada hasil K1c).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.trg_fn_round_inquiry_measurements() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.weight_kg IS NOT NULL THEN
    NEW.weight_kg := round(NEW.weight_kg, 2);
  END IF;
  IF NEW.volume_cbm IS NOT NULL THEN
    NEW.volume_cbm := round(NEW.volume_cbm, 2);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_round_inquiry_measurements() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.trg_fn_round_inquiry_measurements() IS
  'BEFORE INSERT/UPDATE pada inquiries -- membulatkan weight_kg/volume_cbm ke 2 desimal, NULL dibiarkan NULL. Menutup jalur create_inquiry_with_lanes DAN inline-edit langsung DealDetailPage.jsx sekaligus, independen dari K1c (weight_kg/volume_cbm bukan kolom terjaga).';

CREATE TRIGGER trg_round_inquiry_measurements
  BEFORE INSERT OR UPDATE OF weight_kg, volume_cbm ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_round_inquiry_measurements();

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT tgname, tgrelid::regclass, tgtype FROM pg_trigger
--  WHERE tgname = 'trg_round_inquiry_measurements'; -- 1 baris
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'trg_fn_round_inquiry_measurements';
--  -- proacl TANPA authenticated/PUBLIC/anon (trigger function, dipanggil DB sendiri)
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-12.sql untuk uji self-rollback.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_round_inquiry_measurements ON public.inquiries;
--   DROP FUNCTION IF EXISTS public.trg_fn_round_inquiry_measurements();
-- =============================================================================
