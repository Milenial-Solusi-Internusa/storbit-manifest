-- =============================================================================
-- 20261012000003_crm_lead_pool_triggers.sql
--
-- Batch DS 3 Lead Management, irisan 7 Bagian 2 (Paket 2) -- file 3/4
-- (trigger). Bergantung pada file 1 (accounts.is_stale/stale_flagged_at).
--
-- Status: BELUM DIJALANKAN.
--
-- Menambahkan pengosongan is_stale/stale_flagged_at ke DUA trigger promosi
-- (set_prospect_on_inquiry, set_sql_on_quotation_sent) -- begitu akun
-- disentuh aktivitas nyata (inquiry baru, quotation terkirim), tanda stale
-- tak lagi berlaku. Badan SELEBIHNYA TIDAK diubah.
--
-- !! TEMUAN SAAT MEMBANDINGKAN -- schema_snapshot.sql BASI untuk
--    set_prospect_on_inquiry, DILAPORKAN DI SINI sesuai instruksi "kalau
--    beda, laporkan dulu" (bukan ditemukan lewat menjalankan SQL -- lewat
--    membaca supabase/migrations/*.sql, lihat gotcha di bawah):
--
--    schema_snapshot.sql:4441-4454 (refresh terakhir ~29 Sep 2026, basi
--    untuk banyak hal lain -- lihat CLAUDE.md) masih menunjukkan badan
--    LAMA (dual-write account_status+lifecycle_stage, syarat kedua kolom
--    di WHERE). Migrasi TERAKHIR yang benar-benar menyentuh fungsi ini,
--    20260908000002_accounts_lifecycle_drop_legacy.sql (LIVE 18 Sep 2026,
--    bagian dari merge CRM v3 yang sudah terkonfirmasi di produksi),
--    sudah menyederhanakannya jadi HANYA lifecycle_stage, TANPA
--    account_status:
--
--      CREATE OR REPLACE FUNCTION public.set_prospect_on_inquiry() RETURNS trigger
--          LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--      BEGIN
--        UPDATE public.accounts
--        SET lifecycle_stage = 'prospect'
--        WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
--          AND lifecycle_stage IN ('lead','mql','sql');
--        RETURN NEW;
--      END;
--      $$;
--
--    File ini memakai badan 20260908000002 di atas sebagai DASAR (bukan
--    snapshot) -- menyalin bentuk snapshot yang basi akan MEMBATALKAN
--    pembersihan 20260908000002 secara senyap. Perbedaan ini TIDAK
--    menghalangi migrasi ini jalan (badan dasarnya tetap benar), tapi
--    DILAPORKAN sesuai instruksi sebelum CREATE OR REPLACE dieksekusi.
--
--    set_sql_on_quotation_sent SEBALIKNYA -- badan di schema_snapshot.sql
--    (4673-4691) SAMA PERSIS dengan migrasi terakhir yang menyentuhnya
--    (20260918000001_set_sql_on_quotation_sent.sql, "LIVE DI PRODUCTION
--    sejak 18 Sep 2026... direkam retroaktif"), KEDUANYA dual-write
--    account_status+lifecycle_stage. Nol perbedaan untuk fungsi ini.
--
--    Kedua fungsi TIDAK SELARAS satu sama lain soal account_status (satu
--    sudah berhenti menulisnya, satu belum) -- itu TETAP BEGITU di file
--    ini, bukan diselaraskan di sini (di luar cakupan irisan ini, dan
--    20260918000001 sendiri sudah mencatat "siapa pun yang mencabut salah
--    satu kolom harus ikut menyentuh fungsi ini").
--
-- !! ACL KEDUA FUNGSI SENGAJA TIDAK DISENTUH -- CREATE OR REPLACE TIDAK
--    mereset hak akses yang sudah ada (selama tanda tangan tak berubah,
--    dan keduanya tidak berubah di sini). set_sql_on_quotation_sent
--    PROACL NULL (PUBLIC EXECUTE) hari ini -- 20260918000001 SENGAJA
--    membiarkannya ("menyalin apa adanya, bukan memperbaiki") supaya
--    staging tidak berbeda dari production. File ini mengikuti alasan
--    yang sama: TIDAK menambahkan REVOKE/GRANT untuk fungsi ini, supaya
--    tidak diam-diam mengubah ACL yang jadi tanggung jawab keputusan
--    terpisah (TD-300, "99 fungsi LAMA... belum disentuh"). Status ACL
--    set_prospect_on_inquiry sama -- nol REVOKE/GRANT pernah menyentuhnya
--    di migrasi manapun (diperiksa), jadi kemungkinan besar juga PUBLIC
--    EXECUTE -- TIDAK disentuh di sini dengan alasan yang sama.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_prospect_on_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.accounts
  SET lifecycle_stage  = 'prospect',
      is_stale         = false,
      stale_flagged_at = NULL
  WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
    AND lifecycle_stage IN ('lead','mql','sql');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sql_on_quotation_sent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'SENT' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SENT') THEN
    UPDATE public.accounts
    SET account_status   = 'sql',
        lifecycle_stage  = 'sql',
        is_stale         = false,
        stale_flagged_at = NULL
    WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
      AND lifecycle_stage IN ('lead','mql','prospect')
      AND account_status  IN ('lead','mql','prospect');
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT proname, prosrc FROM pg_proc
--  WHERE proname IN ('set_prospect_on_inquiry','set_sql_on_quotation_sent');
-- -- Harap: kedua badan memuat 'is_stale = false' dan 'stale_flagged_at = NULL'.
--
-- SELECT p.proname, p.proacl FROM pg_proc p
--  WHERE p.proname IN ('set_prospect_on_inquiry','set_sql_on_quotation_sent');
-- -- Harap: proacl KEDUANYA tidak berubah dari sebelum migrasi ini
-- --        (set_sql_on_quotation_sent tetap NULL/PUBLIC -- lihat catatan
-- --        header, SENGAJA tidak disentuh).
--
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
--  WHERE tgname IN ('trg_set_prospect_on_inquiry','trg_set_sql_on_quotation_sent');
-- -- Harap: 2 baris, tidak berubah (file ini tidak menyentuh DROP/CREATE
-- --        TRIGGER, hanya badan fungsinya).
--
-- -- Uji end-to-end (staging, data uji -- BUKAN SQL manual terhadap
-- -- accounts.is_stale, lewat alur asli supaya trigger yang benar-benar
-- -- teruji):
-- -- 1. UPDATE accounts SET is_stale=true, stale_flagged_at=now()
-- --    WHERE id=<akun uji>;
-- -- 2. Buat inquiry baru untuk akun itu (lifecycle_stage harus
-- --    lead/mql/sql) -- lewat alur InquiryFormPage, bukan INSERT manual.
-- -- 3. SELECT lifecycle_stage, is_stale, stale_flagged_at FROM accounts
-- --    WHERE id=<akun uji>;
-- -- -- Harap: lifecycle_stage='prospect', is_stale=false,
-- --    stale_flagged_at IS NULL.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (kembalikan ke badan SEBELUM file ini -- SAMA dengan badan
-- "DASAR" yang dikutip di header, dikurangi dua baris is_stale/
-- stale_flagged_at):
--
--   CREATE OR REPLACE FUNCTION public.set_prospect_on_inquiry() RETURNS trigger
--       LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   BEGIN
--     UPDATE public.accounts
--     SET lifecycle_stage = 'prospect'
--     WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
--       AND lifecycle_stage IN ('lead','mql','sql');
--     RETURN NEW;
--   END;
--   $$;
--
--   CREATE OR REPLACE FUNCTION public.set_sql_on_quotation_sent() RETURNS trigger
--       LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   BEGIN
--     IF NEW.status = 'SENT' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SENT') THEN
--       UPDATE public.accounts
--       SET account_status  = 'sql',
--           lifecycle_stage = 'sql'
--       WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
--         AND lifecycle_stage IN ('lead','mql','prospect')
--         AND account_status  IN ('lead','mql','prospect');
--     END IF;
--     RETURN NEW;
--   END;
--   $$;
-- =============================================================================
