-- Fungsi sempit buat badge di Briefing Harian: kasih tau status laporan BNF
-- (Open/In Progress/Escalated/Closed) ke pelapor asli insiden ATAU orang
-- yang authorized, TANPA expose nomor laporan atau isi apapun. bnf_reports
-- tetap terkunci is_bnf_authorized() buat akses penuh -- ini jalan sempit
-- khusus satu field status doang, biar staff pelapor tau nasib laporannya
-- tanpa buka akses BNF yang sengaja udah dibatesin hari ini.

BEGIN;

CREATE OR REPLACE FUNCTION get_linked_bnf_status(p_daily_report_item_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $fn$
DECLARE
  v_status text;
  v_created_by uuid;
  v_pulled_to uuid;
BEGIN
  SELECT created_by, pulled_to_bnf_report_id INTO v_created_by, v_pulled_to
  FROM daily_report_items WHERE id = p_daily_report_item_id;

  IF v_pulled_to IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_created_by != auth.uid() AND NOT is_bnf_authorized() THEN
    RETURN NULL;
  END IF;

  SELECT status INTO v_status FROM bnf_reports WHERE id = v_pulled_to;
  RETURN v_status;
END;
$fn$;

COMMIT;
