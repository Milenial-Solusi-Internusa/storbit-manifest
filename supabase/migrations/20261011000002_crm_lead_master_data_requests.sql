-- =============================================================================
-- 20261011000002_crm_lead_master_data_requests.sql
--
-- Batch DS 3 giliran Lead Management, Paket 1 irisan 1 (bagian B/2) --
-- infrastruktur rule 5 mockup ("manager menambah langsung, sales mengajukan,
-- peran lain hanya membaca"). Tabel dropdown_options SUDAH ADA (seed lama,
-- migrasi 20260827000001) tapi write-nya super_admin-only tanpa tingkatan --
-- file ini menambah jalur pengajuan + persetujuan, TANPA mengubah tabel
-- dropdown_options maupun RLS-nya yang sudah ada.
--
-- Status: SUDAH DIJALANKAN DI STAGING 11 Okt 2026 (Den), terverifikasi via
--         query verifikasi di bawah. BELUM DI PRODUCTION. Prasyarat: TIDAK
--         bergantung pada migrasi lain yang belum jalan.
--
-- -- Tabel baru: dropdown_option_requests -----------------------------------
-- Permintaan opsi baru dari sales, menunggu disetujui manager. TIDAK
-- langsung menulis dropdown_options -- hanya approve_dropdown_option_request
-- (di bawah) yang boleh, dan itu pun lewat add_dropdown_option_direct supaya
-- satu jalur tulis untuk kedua pintu masuk (manager langsung / sales lewat
-- approval).
--
-- -- RPC: tiga fungsi --------------------------------------------------------
-- add_dropdown_option_direct(list_key, label, company_id)  -- manager/
--   super_admin menambah opsi LANGSUNG, tanpa pengajuan. Dipanggil juga oleh
--   approve_dropdown_option_request supaya satu badan logika menulis
--   dropdown_options, bukan dua.
-- approve_dropdown_option_request(request_id)               -- manager
--   menyetujui, memanggil add_dropdown_option_direct, mencatat siapa & kapan.
-- reject_dropdown_option_request(request_id, reason)        -- manager
--   menolak, alasan wajib.
--
-- Ketiganya SECURITY DEFINER, cermin is_manager_or_above() yang sudah ada --
-- BUKAN is_manager_or_above_in(company_id), karena dropdown_options hari ini
-- bisa company_id NULL (global) maupun per-entitas, dan rule 5 mockup tidak
-- membedakan "manager entitas mana" untuk opsi GLOBAL. Kalau kelak dibedakan
-- per-entitas, fungsi ini yang pertama perlu diubah -- dicatat di sini
-- supaya tidak terlupakan saat itu.
--
-- -- Seed: lead_industry, lead_category, lost_reason --------------------------
-- lead_industry: 12 nilai disalin APA ADANYA dari dropdown Industry di
-- design-handoff/crm-2026-10-11/Lead Management.dc.html (bukan dikarang).
-- lead_category (3 nilai) dan lost_reason (6 nilai) dikonfirmasi Den
-- 11 Okt 2026 -- ditulis di sini belakangan (SESUDAH migrasi ini sudah
-- dijalankan di staging tanpa keduanya), supaya file migrasi mencerminkan
-- keadaan DB yang sebenarnya. INSERT-nya sendiri sudah terjadi lewat SQL
-- manual di staging, BUKAN lewat COMMIT blok ini -- ON CONFLICT di bawah
-- karena itu idempoten kalau file ini dijalankan ulang di environment lain
-- (mis. production) yang belum punya baris-baris ini.
--
-- Kunci unik dropdown_options ADALAH index PARSIAL:
--   dropdown_options_global_unique ON (list_key, value) WHERE company_id IS NULL
-- (schema_snapshot.sql). ON CONFLICT WAJIB menyebut predikat ini persis --
-- tanpa predikat, Postgres tidak bisa mencocokkan ke index parsial dan
-- INSERT akan gagal dengan "no unique or exclusion constraint matching".
-- =============================================================================

BEGIN;

CREATE TABLE public.dropdown_option_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key text NOT NULL,
  label text NOT NULL,
  reason text,
  company_id uuid REFERENCES public.companies(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_dropdown_option_id uuid REFERENCES public.dropdown_options(id)
);

COMMENT ON TABLE public.dropdown_option_requests IS 'Rule 5 mockup Lead Management: sales mengajukan opsi master data baru (Industry/Lead Category/Lost Reason dkk), manager menyetujui/menolak. Tidak menulis dropdown_options langsung -- lihat approve_dropdown_option_request.';

ALTER TABLE public.dropdown_option_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY dropdown_option_requests_select ON public.dropdown_option_requests
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_manager_or_above() OR requested_by = auth.uid());

CREATE POLICY dropdown_option_requests_insert ON public.dropdown_option_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Sengaja NOL policy UPDATE/DELETE untuk authenticated -- satu-satunya jalur
-- ubah status (approve/reject) adalah dua RPC SECURITY DEFINER di bawah,
-- yang berjalan sebagai pemilik tabel dan tidak butuh GRANT/policy UPDATE
-- terpisah. Ini sengaja mengunci "approve/reject HANYA lewat RPC" di level
-- hak akses, bukan cuma konvensi di frontend.

REVOKE ALL ON public.dropdown_option_requests FROM authenticated, anon;
GRANT SELECT, INSERT ON public.dropdown_option_requests TO authenticated;

CREATE FUNCTION public.add_dropdown_option_direct(
  p_list_key text,
  p_label text,
  p_company_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_manager_or_above()) THEN
    RAISE EXCEPTION 'Hanya manager ke atas yang boleh menambah opsi master data langsung';
  END IF;
  INSERT INTO public.dropdown_options (group_key, list_key, label, value, company_id)
    VALUES ('crm', p_list_key, p_label, lower(regexp_replace(trim(p_label), '\s+', '_', 'g')), p_company_id)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.add_dropdown_option_direct(text, text, uuid) IS 'Jalur "manager menambah langsung" rule 5. Dipanggil FE (manager) dan approve_dropdown_option_request (sales, sesudah disetujui) -- satu badan tulis dropdown_options.';

CREATE FUNCTION public.approve_dropdown_option_request(p_request_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.dropdown_option_requests;
  v_opt_id uuid;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_manager_or_above()) THEN
    RAISE EXCEPTION 'Hanya manager ke atas yang boleh menyetujui permintaan opsi';
  END IF;
  SELECT * INTO r FROM public.dropdown_option_requests WHERE id = p_request_id AND status = 'pending';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Permintaan tidak ditemukan atau sudah diproses';
  END IF;
  v_opt_id := public.add_dropdown_option_direct(r.list_key, r.label, r.company_id);
  UPDATE public.dropdown_option_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         created_dropdown_option_id = v_opt_id
   WHERE id = p_request_id;
  RETURN v_opt_id;
END $$;

CREATE FUNCTION public.reject_dropdown_option_request(p_request_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.is_manager_or_above()) THEN
    RAISE EXCEPTION 'Hanya manager ke atas yang boleh menolak permintaan opsi';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;
  UPDATE public.dropdown_option_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan tidak ditemukan atau sudah diproses';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.add_dropdown_option_direct(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_dropdown_option_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_dropdown_option_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_dropdown_option_direct(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_dropdown_option_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_dropdown_option_request(uuid, text) TO authenticated;

-- Seed lead_industry -- 12 nilai disalin dari mockup, company_id NULL (global).
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'lead_industry', 'Logistics',          'logistics',          1,  NULL),
  ('crm', 'lead_industry', 'Manufacturing',       'manufacturing',      2,  NULL),
  ('crm', 'lead_industry', 'Agriculture',         'agriculture',        3,  NULL),
  ('crm', 'lead_industry', 'Packaging',           'packaging',          4,  NULL),
  ('crm', 'lead_industry', 'Retail',              'retail',             5,  NULL),
  ('crm', 'lead_industry', 'Electronics',         'electronics',        6,  NULL),
  ('crm', 'lead_industry', 'Chemicals',           'chemicals',          7,  NULL),
  ('crm', 'lead_industry', 'Textile',             'textile',            8,  NULL),
  ('crm', 'lead_industry', 'Food and Beverage',   'food_and_beverage',  9,  NULL),
  ('crm', 'lead_industry', 'Automotive',          'automotive',         10, NULL),
  ('crm', 'lead_industry', 'Pharmaceutical',      'pharmaceutical',     11, NULL),
  ('crm', 'lead_industry', 'Furniture',           'furniture',          12, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

-- Seed lead_category -- 3 nilai dikonfirmasi Den 11 Okt 2026, company_id NULL (global).
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'lead_category', 'Corporate',   'corporate',   1, NULL),
  ('crm', 'lead_category', 'SME',         'sme',         2, NULL),
  ('crm', 'lead_category', 'Individual',  'individual',  3, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

-- Seed lost_reason -- 6 nilai dikonfirmasi Den 11 Okt 2026, company_id NULL (global).
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'lost_reason', 'Price',                 'price',                 1, NULL),
  ('crm', 'lost_reason', 'Lost to Competitor',     'lost_to_competitor',    2, NULL),
  ('crm', 'lost_reason', 'No Response',            'no_response',           3, NULL),
  ('crm', 'lost_reason', 'Requirement Changed',    'requirement_changed',   4, NULL),
  ('crm', 'lost_reason', 'Service Not Offered',    'service_not_offered',   5, NULL),
  ('crm', 'lost_reason', 'Other',                  'other',                 6, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT to_regclass('public.dropdown_option_requests');
-- -- Harap: bukan NULL.
--
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('add_dropdown_option_direct','approve_dropdown_option_request','reject_dropdown_option_request');
-- -- Harap: 3 baris, masing-masing proacl memuat authenticated=X, TANPA baris kosong '=X' (PUBLIC).
--
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.dropdown_option_requests'::regclass;
-- -- Harap: 2 baris (select, insert) -- nol update/delete.
--
-- SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name='dropdown_option_requests'
--    AND grantee IN ('authenticated','anon')
--  GROUP BY grantee;
-- -- Harap: authenticated = INSERT,SELECT ; anon = tidak muncul sama sekali.
--
-- SELECT list_key, count(*) FROM public.dropdown_options
--  WHERE list_key IN ('lead_industry','lead_category','lost_reason') AND company_id IS NULL
--  GROUP BY 1 ORDER BY 1;
-- -- Harap: 3 baris -- lead_category=3, lead_industry=12, lost_reason=6.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (kalau perlu dibatalkan sebelum ada baris pengajuan/penolakan):
--   DELETE FROM public.dropdown_options WHERE list_key IN ('lead_industry','lead_category','lost_reason') AND company_id IS NULL;
--   DROP FUNCTION public.reject_dropdown_option_request(uuid, text);
--   DROP FUNCTION public.approve_dropdown_option_request(uuid);
--   DROP FUNCTION public.add_dropdown_option_direct(text, text, uuid);
--   DROP TABLE public.dropdown_option_requests;
-- =============================================================================
