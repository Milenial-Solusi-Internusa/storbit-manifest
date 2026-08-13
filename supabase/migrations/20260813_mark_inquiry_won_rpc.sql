-- ============================================================================
-- mark_inquiry_won(p_inquiry_id uuid)
--
-- Jalur manual "Tandai sebagai WON" dari Inquiry Detail (DealDetailPage.jsx).
-- Terpisah dari DUA jalur lain yang sudah ada dan TETAP TIDAK DISENTUH:
--   1. sales_orders.status='SENT' -> set_inquiry_won_on_so -> inquiries.status='WON'
--      -> set_customer_on_inquiry_won (jalur resmi, belum kepakai di praktik).
--   2. accounts.pipeline_stage lewat Kanban/dropdown Pindah Stage/Edit Deal
--      (pickStage/applyStageMove, di-clamp ACTIVE_STAGE_KEYS ['NEW','CONTACTED',
--      'QUALIFIED'] -- sengaja tetap diblok, tidak direplikasi di sini).
--
-- Validasi: hanya pembuat inquiry (inquiries.created_by = auth.uid()) atau
-- super_admin yang boleh memicu -- mirror persis pola sendToProcurement() di
-- SalesOrderDocDetailPage.jsx (isCreator || erpRole==='super_admin'), TANPA
-- pengecualian manager-or-above (dikonfirmasi eksplisit).
--
-- Idempotency: ditolak kalau inquiries.status sudah 'WON'. Baris dikunci pakai
-- FOR UPDATE di SELECT awal supaya dua panggilan hampir-bersamaan pada inquiry
-- yang sama benar-benar diserialisasi.
--
-- accounts.account_status dan accounts.became_customer_at TIDAK disentuh
-- manual di sini -- trigger trg_set_customer_on_inquiry_won yang SUDAH ADA
-- jalan otomatis begitu inquiries.status jadi 'WON' di bawah. Function ini
-- SEKALIAN set accounts.pipeline_stage='WON' untuk akun terkait, karena
-- trigger itu sendiri tidak menyentuh pipeline_stage.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_inquiry_won(p_inquiry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $mark_inquiry_won$
DECLARE
  v_status      text;
  v_created_by  uuid;
  v_prospect_id uuid;
  v_customer_id uuid;
  v_inquiry_no  text;
  v_company_id  uuid;
  v_account_id  uuid;
  v_user_email  text;
  v_user_role   text;
BEGIN
  SELECT status, created_by, prospect_id, customer_id, inquiry_no, company_id
    INTO v_status, v_created_by, v_prospect_id, v_customer_id, v_inquiry_no, v_company_id
  FROM public.inquiries
  WHERE id = p_inquiry_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  IF v_created_by IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Anda bukan pembuat inquiry ini — tidak bisa menandai WON.';
  END IF;

  IF v_status = 'WON' THEN
    RAISE EXCEPTION 'Inquiry ini sudah WON.';
  END IF;

  UPDATE public.inquiries
  SET status = 'WON', updated_at = now()
  WHERE id = p_inquiry_id;

  v_account_id := COALESCE(v_prospect_id, v_customer_id);
  IF v_account_id IS NOT NULL THEN
    UPDATE public.accounts
    SET pipeline_stage = 'WON'
    WHERE id = v_account_id
      AND deleted_at IS NULL;
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();

  SELECT r.code INTO v_user_role
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  ORDER BY ur.granted_at DESC
  LIMIT 1;

  INSERT INTO public.audit_logs (
    user_id, user_email, user_role, company_id,
    action, entity_type, entity_id, entity_label,
    old_data, new_data, notes
  ) VALUES (
    auth.uid(), v_user_email, v_user_role, v_company_id,
    'MARK_INQUIRY_WON', 'INQUIRY', p_inquiry_id, v_inquiry_no,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'WON'),
    'Ditandai WON manual dari Inquiry Detail'
  );
END;
$mark_inquiry_won$;

ALTER FUNCTION public.mark_inquiry_won(p_inquiry_id uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.mark_inquiry_won(p_inquiry_id uuid) TO authenticated;
