-- =============================================================================
-- 20260928000008_invoice_attachments.sql     (Invoice lengkap, berkas 8 dari 9)
--
-- Lampiran invoice: bucket PRIVAT + tabel metadata + dua RPC.
--
-- DUA LAPIS PENJAGAAN, dan keduanya perlu:
--   storage.objects policy -> menjaga BYTE-nya (siapa boleh mengambil berkas)
--   invoice_attachments RLS -> menjaga DAFTAR-nya (siapa boleh tahu ada apa)
-- Satu lapis saja tidak cukup: tanpa yang pertama, path yang bocor bisa diunduh
-- siapa saja; tanpa yang kedua, daftar lampiran bocor walau byte-nya aman.
--
-- ⛔ BUCKET PRIVAT, bukan menumpang `assets`/`avatars`. Kedua bucket itu PUBLIK
-- (diukur 27 Sep 2026), dan faktur pajak + bukti potong bukan aset publik.
--
-- PATH: <company_id>/<invoice_id>/<uuid>.<ext>
-- `company_id` di segmen PERTAMA supaya policy storage bisa menggerbang tanpa
-- join ke tabel mana pun -- storage.objects tidak punya company_id sendiri.
--
-- HAK UNGGAH (keputusan Den 27 Sep 2026): super_admin / manager+ /
-- finance_controller / **finance**. `finance` polos IKUT karena staf Finance
-- yang mengunggah faktur pajak dan bukti potong. Menghapus: pengunggahnya
-- sendiri atau super_admin, dan SOFT DELETE.
--
-- BATAS: 10 MB per berkas, 10 berkas per invoice, allow-list 6 tipe.
-- Batas ukuran ditegakkan di TIGA tempat yang berbeda sifatnya -- bucket
-- (menolak unggahan), CHECK (menolak metadata), dan FE. FE saja bukan batas.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. BUCKET
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-docs', 'invoice-docs', false, 10485760, ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/xml',
  'application/xml'
])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. POLICY STORAGE
-- Segmen pertama path dibandingkan sebagai TEKS, bukan di-cast ke uuid:
-- path yang cacat akan gagal cast dan MELEDAK di dalam policy, bukan sekadar
-- ditolak. Perbandingan teks menolaknya dengan tenang.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS invoice_docs_read   ON storage.objects;
DROP POLICY IF EXISTS invoice_docs_insert ON storage.objects;
DROP POLICY IF EXISTS invoice_docs_delete ON storage.objects;

CREATE POLICY invoice_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-docs'
    AND (
      public.is_super_admin()
      OR split_part(name, '/', 1) = public.get_user_company_id()::text
      OR split_part(name, '/', 1) IN (SELECT gc::text FROM public.get_user_company_ids() gc)
    )
  );

CREATE POLICY invoice_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-docs'
    AND (
      public.is_super_admin()
      OR split_part(name, '/', 1) = public.get_user_company_id()::text
      OR split_part(name, '/', 1) IN (SELECT gc::text FROM public.get_user_company_ids() gc)
    )
    AND (
      public.is_super_admin()
      OR public.is_manager_or_above()
      OR public.has_role('finance_controller')
      OR public.has_role('finance')
    )
  );

-- Hapus BYTE hanya super_admin. Pengguna biasa "menghapus" lewat soft delete
-- metadata -- berkasnya tetap ada, dan itu disengaja untuk dokumen pajak.
CREATE POLICY invoice_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-docs' AND public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. TABEL METADATA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.sp_invoices(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  uploaded_by  uuid,
  uploaded_at  timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at   timestamp with time zone,
  CONSTRAINT invoice_attachments_path_unik UNIQUE (storage_path),
  CONSTRAINT invoice_attachments_ukuran_check CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT invoice_attachments_mime_check CHECK (mime_type IN (
    'application/pdf','image/jpeg','image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/xml','application/xml'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice
  ON public.invoice_attachments (invoice_id) WHERE deleted_at IS NULL;

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

-- ⚠️ REVOKE sebelum GRANT: default privileges DB ini menempelkan ALL ke
-- `authenticated` pada tiap tabel baru (temuan 15 Sep 2026, 99 tabel
-- GRANT ALL). Tanpa pencabutan ini, tabel baru lahir bisa ditulis langsung --
-- persis yang baru saja ditutup berkas 4 untuk tabel invoice.
REVOKE ALL ON public.invoice_attachments FROM authenticated, anon;
GRANT SELECT ON public.invoice_attachments TO authenticated;

CREATE POLICY invoice_attachments_read ON public.invoice_attachments
  FOR SELECT TO authenticated
  USING (public.invoice_dapat_dibaca(invoice_id));

COMMENT ON TABLE public.invoice_attachments IS
  'Metadata lampiran invoice. Byte-nya di bucket privat invoice-docs. TULIS hanya lewat add_invoice_attachment / delete_invoice_attachment. Berkas 8, 20260928000008.';

-- ---------------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_invoice_attachment(
  p_invoice_id   uuid,
  p_storage_path text,
  p_file_name    text,
  p_mime_type    text,
  p_size_bytes   bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_co uuid; v_no text; v_n int; v_id uuid;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above()
          OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mengunggah lampiran invoice.';
  END IF;
  IF NOT invoice_dapat_dibaca(p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan atau bukan milik entitas tempat kamu punya peran.';
  END IF;

  SELECT company_id, invoice_no INTO v_co, v_no FROM sp_invoices WHERE id = p_invoice_id;

  -- Path WAJIB diawali <company_id>/<invoice_id>/. Tanpa syarat ini, metadata
  -- bisa menunjuk berkas di folder entitas lain sementara policy storage
  -- menggerbang folder -- dua penjagaan yang saling melewatkan.
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE (v_co::text || '/' || p_invoice_id::text || '/%') THEN
    RAISE EXCEPTION 'Path lampiran harus diawali %/%/ -- diterima: %', v_co, p_invoice_id, COALESCE(p_storage_path, '(kosong)');
  END IF;

  SELECT count(*) INTO v_n FROM invoice_attachments
   WHERE invoice_id = p_invoice_id AND deleted_at IS NULL;
  IF v_n >= 10 THEN
    RAISE EXCEPTION 'Invoice ini sudah punya 10 lampiran. Hapus salah satunya lebih dulu.';
  END IF;

  INSERT INTO invoice_attachments (invoice_id, company_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (p_invoice_id, v_co, p_storage_path, p_file_name, p_mime_type, p_size_bytes, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, new_data)
  VALUES (v_uid, v_co, 'ADD_INVOICE_ATTACHMENT', 'sp_invoices', p_invoice_id, v_no,
          jsonb_build_object('file_name', p_file_name, 'size_bytes', p_size_bytes, 'path', p_storage_path));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_invoice_attachment(p_attachment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_inv uuid; v_co uuid; v_by uuid; v_nama text; v_n int;
BEGIN
  SELECT invoice_id, company_id, uploaded_by, file_name
    INTO v_inv, v_co, v_by, v_nama
    FROM invoice_attachments WHERE id = p_attachment_id AND deleted_at IS NULL;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'Lampiran tidak ditemukan atau sudah dihapus.'; END IF;

  IF NOT (is_super_admin() OR v_by = v_uid) THEN
    RAISE EXCEPTION 'Hanya pengunggahnya sendiri atau Super Admin yang boleh menghapus lampiran ini.';
  END IF;

  UPDATE invoice_attachments SET deleted_at = now()
   WHERE id = p_attachment_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Lampiran sudah dihapus orang lain.'; END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data)
  VALUES (v_uid, v_co, 'DELETE_INVOICE_ATTACHMENT', 'sp_invoices', v_inv, v_nama,
          jsonb_build_object('attachment_id', p_attachment_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.add_invoice_attachment(uuid, text, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_invoice_attachment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_invoice_attachment(uuid, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invoice_attachment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- V1
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE v_pub boolean; v_lim bigint; v_pol int; v_tulis int; v_fn_pub int; v_fn_auth int;
BEGIN
  SELECT public, file_size_limit INTO v_pub, v_lim FROM storage.buckets WHERE id='invoice-docs';
  IF v_pub IS NULL THEN RAISE EXCEPTION 'V1a GAGAL: bucket invoice-docs tidak ada.'; END IF;
  IF v_pub THEN RAISE EXCEPTION 'V1a GAGAL: bucket invoice-docs PUBLIK -- harus privat.'; END IF;
  IF v_lim <> 10485760 THEN RAISE EXCEPTION 'V1a GAGAL: batas ukuran % bukan 10 MB.', v_lim; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname IN ('invoice_docs_read','invoice_docs_insert','invoice_docs_delete');
  IF v_pol <> 3 THEN RAISE EXCEPTION 'V1b GAGAL: hanya % dari 3 policy storage terpasang.', v_pol; END IF;

  -- authenticated TIDAK boleh menulis tabel metadata langsung.
  SELECT count(*) INTO v_tulis
    FROM information_schema.table_privileges
   WHERE table_schema='public' AND table_name='invoice_attachments'
     AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF v_tulis <> 0 THEN
    RAISE EXCEPTION 'V1c GAGAL: authenticated punya % hak tulis langsung ke invoice_attachments.', v_tulis;
  END IF;

  -- PEMBANDING: SELECT harus ADA, kalau tidak tabelnya cuma tak terbaca dan
  -- V1c "lolos" karena tabelnya mati, bukan karena terjaga.
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                  WHERE table_schema='public' AND table_name='invoice_attachments'
                    AND grantee='authenticated' AND privilege_type='SELECT') THEN
    RAISE EXCEPTION 'V1c GAGAL: authenticated tidak bisa MEMBACA invoice_attachments.';
  END IF;

  SELECT count(*) INTO v_fn_pub FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('add_invoice_attachment','delete_invoice_attachment')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  IF v_fn_pub <> 0 THEN RAISE EXCEPTION 'V1d GAGAL: % fungsi lampiran ber-PUBLIC EXECUTE.', v_fn_pub; END IF;

  SELECT count(*) INTO v_fn_auth FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('add_invoice_attachment','delete_invoice_attachment')
     AND EXISTS (SELECT 1 FROM unnest(p.proacl) a
                  WHERE a::text LIKE 'authenticated=%' AND split_part(a::text,'=',2) LIKE '%X%');
  IF v_fn_auth <> 2 THEN RAISE EXCEPTION 'V1d GAGAL: hanya % dari 2 fungsi ber-EXECUTE untuk authenticated.', v_fn_auth; END IF;

  RAISE NOTICE 'V1 LOLOS: bucket privat 10MB, 3 policy storage, metadata baca-saja, 2 RPC tanpa PUBLIC.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.delete_invoice_attachment(uuid);
--   DROP FUNCTION IF EXISTS public.add_invoice_attachment(uuid, text, text, text, bigint);
--   DROP TABLE IF EXISTS public.invoice_attachments;
--   DROP POLICY IF EXISTS invoice_docs_delete ON storage.objects;
--   DROP POLICY IF EXISTS invoice_docs_insert ON storage.objects;
--   DROP POLICY IF EXISTS invoice_docs_read   ON storage.objects;
-- ⚠️ BUCKET DAN ISINYA TIDAK IKUT DIHAPUS. Menghapus bucket berisi berkas
-- menghapus dokumen pajak. Hapus manual, dan hanya kalau sudah kosong.
-- =============================================================================
