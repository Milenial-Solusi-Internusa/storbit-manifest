-- scripts/seed/uat/00-guards.sql
-- Palang untuk SELURUH skrip seed. Di-include di kepala tiap berkas.
--
-- Impersonasi: auth.uid() di staging membaca GUC request.jwt.claim.sub, dan
-- is_super_admin() hanya bergantung padanya. Dengan set_config(...,true)
-- (transaction-scoped) guard RPC lolos sementara sesi tetap role postgres,
-- sehingga RLS tidak menghalangi UPDATE tanggal historis.
--
-- ASCII murni. Jangan tambahkan karakter non-ASCII (bash 3.2 + locale UTF-8).

DO $$
DECLARE
  v_uid  uuid := 'd730c348-ceab-463d-bc3b-458126314373';  -- test@msi.com (staging)
  v_soa  uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';  -- entitas SOA
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid AND email = 'test@msi.com') THEN
    RAISE EXCEPTION 'PALANG: uid % bukan test@msi.com di database ini', v_uid;
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'PALANG: impersonasi tidak diterima guard (is_super_admin false)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_soa AND code = 'SOA') THEN
    RAISE EXCEPTION 'PALANG: entitas SOA tidak ditemukan';
  END IF;
  -- Palang terakhir: notify_sp_milestone HARUS no-op. Seed memanggil
  -- sp_recompute_status ratusan kali; kalau badan produksi masih hidup di sini,
  -- staging akan menyuruh PRODUKSI mengirim notifikasi.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'notify_sp_milestone'
                AND (p.prosrc LIKE '%net.http%' OR p.prosrc LIKE '%untmpqceexwxzuhlmyrg%')) THEN
    RAISE EXCEPTION 'PALANG: notify_sp_milestone BELUM no-op - jalankan dulu no-op-nya';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: impersonasi aktif, notify_sp_milestone no-op';
END $$;
