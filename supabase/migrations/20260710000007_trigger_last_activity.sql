-- TD-52 lanjutan: trigger pengisi last_activity_at + selaraskan 180 baris lama
--
-- Masalah: accounts.last_activity_at hanya ditulis SEKALI, saat prospect dibuat
-- (ProspectFormPage.jsx:231, `new Date()` dari client). Tidak pernah diperbarui
-- ketika aktivitas baru dicatat. Akibatnya seluruh 180 baris yang terisi
-- sebenarnya menyimpan "kapan prospect dibuat", bukan "kapan lead disentuh".
--
-- Dampak: Edge Function aging-pipeline akan membuang lead yang digarap intens
-- tapi dibuat lama (mis. lead 16 Jun dengan aktivitas kemarin tampak diam 24 hari).
--
-- Acuan waktu: COALESCE(completed_at, created_at).
-- Kompromi sadar (TD-59): hanya 122 dari 269 aktivitas (45%) ditandai selesai.
-- Secara proses bisnis, completed_at murni lebih benar (rencana bukan penggarapan).
-- Tinjau ulang bila keterisian completed_at sudah di atas 90%.
--
-- Dijalankan manual 10 Jul 2026. Hasil: 180 baris diselaraskan, 0 meleset.

CREATE OR REPLACE FUNCTION sync_last_activity_on_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_account_id uuid;
BEGIN
  v_account_id := COALESCE(NEW.account_id, OLD.account_id);
  IF v_account_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE accounts a
  SET last_activity_at = (
    SELECT max(COALESCE(act.completed_at, act.created_at))
    FROM activities act
    WHERE act.account_id = v_account_id
      AND act.deleted_at IS NULL
  )
  WHERE a.id = v_account_id;

  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_z_sync_last_activity ON activities;

CREATE TRIGGER trg_z_sync_last_activity
AFTER INSERT OR UPDATE OR DELETE ON activities
FOR EACH ROW
EXECUTE FUNCTION sync_last_activity_on_account();

-- Selaraskan 180 baris yang sudah terlanjur salah
UPDATE accounts ac
SET last_activity_at = (
  SELECT max(COALESCE(a.completed_at, a.created_at))
  FROM activities a
  WHERE a.account_id = ac.id AND a.deleted_at IS NULL
)
WHERE ac.deleted_at IS NULL
  AND ac.last_activity_at IS NOT NULL;

-- Verifikasi:
-- SELECT count(*) FILTER (WHERE last_activity_at IS NOT NULL) AS terisi,
--        count(*) FILTER (WHERE last_activity_at IS DISTINCT FROM (
--          SELECT max(COALESCE(a.completed_at, a.created_at)) FROM activities a
--          WHERE a.account_id = accounts.id AND a.deleted_at IS NULL)) AS meleset
-- FROM accounts WHERE deleted_at IS NULL;
-- Harapan: terisi 180, meleset 0.
