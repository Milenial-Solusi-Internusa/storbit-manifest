-- =============================================================================
-- 20261012000003_crm_lead_pool_triggers.sql
--
-- Batch DS 3 Lead Management, irisan 7 Bagian 2 (Paket 2) -- file 3/4
-- (trigger). Bergantung pada file 1 (accounts.is_stale/stale_flagged_at).
--
-- Status: JALAN DI STAGING 12 Okt 2026. BELUM DI PRODUCTION.
--
-- Menambahkan pengosongan is_stale/stale_flagged_at ke DUA trigger promosi
-- (set_prospect_on_inquiry, set_sql_on_quotation_sent) -- begitu akun
-- disentuh aktivitas nyata (inquiry baru, quotation terkirim), tanda stale
-- tak lagi berlaku. Badan SELEBIHNYA TIDAK diubah.
--
-- !! DRIFT TERKONFIRMASI (koreksi 12 Okt 2026, dicek LANGSUNG ke database
--    oleh Den -- bukan dugaan dari membaca file migrasi): versi pertama
--    file ini memakai badan set_prospect_on_inquiry dari migrasi
--    20260908000002_accounts_lifecycle_drop_legacy.sql (HANYA
--    lifecycle_stage, TANPA account_status) sebagai "badan dasar", dengan
--    asumsi itulah yang LIVE karena migrasi itu tercatat sudah berjalan
--    di produksi. ASUMSI ITU SALAH: badan yang SUNGGUH live di production
--    DAN staging hari ini MASIH dual-write account_status+lifecycle_stage,
--    PERSIS bentuk lama yang 20260908000002 (di atas kertas) seharusnya
--    sudah menggantikannya. Artinya 20260908000002 TIDAK pernah benar-
--    benar mendarat untuk fungsi INI -- entah karena urutan file migrasi
--    yang berbeda saat dijalankan, langkah manual belakangan yang
--    mengembalikannya, atau sebab lain yang tidak tercatat; file ini
--    TIDAK menyelidiki ATAU memutuskan yang mana -- dicatat sebagai DRIFT
--    yang DITEMUKAN, bukan dijelaskan sebabnya. schema_snapshot.sql
--    (4441-4454) KEBETULAN mencerminkan keadaan LIVE yang benar di sini
--    (dual-write) -- "snapshot basi" yang disebut versi pertama catatan
--    ini SALAH ALAMAT khusus untuk fungsi ini; snapshot basi untuk banyak
--    hal LAIN tetap berlaku (lihat CLAUDE.md), tapi bukan di sini.
--
--    Badan LIVE yang dipakai sebagai dasar file ini sekarang (dicek
--    langsung ke DB 12 Okt 2026):
--
--      BEGIN
--        UPDATE public.accounts
--        SET account_status  = 'prospect',
--            lifecycle_stage = 'prospect'
--        WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
--          AND lifecycle_stage IN ('lead','mql','sql')
--          AND account_status  IN ('lead','mql','sql');
--        RETURN NEW;
--      END;
--
--    WHERE TIDAK diubah dari badan live ini (tetap mensyaratkan KEDUA
--    kolom, account_status DAN lifecycle_stage, di 'lead','mql','sql').
--
--    set_sql_on_quotation_sent TIDAK terdampak temuan ini -- badan di
--    schema_snapshot.sql (4673-4691) SAMA PERSIS dengan migrasi terakhir
--    yang menyentuhnya (20260918000001_set_sql_on_quotation_sent.sql,
--    "LIVE DI PRODUKSI sejak 18 Sep 2026... direkam retroaktif"), dan
--    sekarang juga TERKONFIRMASI sama dengan dual-write yang live.
--
--    Kesimpulan: KEDUA fungsi promosi, hari ini, SAMA-SAMA dual-write
--    account_status+lifecycle_stage -- bukan "tidak selaras satu sama
--    lain" seperti catatan versi pertama berkas ini. Pembersihan
--    account_status yang DIKIRA sudah terjadi untuk set_prospect_on_inquiry
--    BELUM terjadi di lingkungan manapun -- itu tech debt terpisah, DI
--    LUAR cakupan file ini, TIDAK dikerjakan di sini.
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
  SET account_status   = 'prospect',
      lifecycle_stage  = 'prospect',
      is_stale         = false,
      stale_flagged_at = NULL
  WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
    AND lifecycle_stage IN ('lead','mql','sql')
    AND account_status  IN ('lead','mql','sql');
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
-- -- Harap: KEDUA badan memuat 'account_status', 'is_stale = false', dan
-- --        'stale_flagged_at = NULL' -- set_prospect_on_inquiry sekarang
-- --        dual-write lagi (lihat temuan DRIFT di header), bukan
-- --        lifecycle_stage saja seperti versi pertama file ini.
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
-- ROLLBACK (kembalikan ke badan LIVE SEBELUM file ini -- dual-write,
-- dikurangi dua baris is_stale/stale_flagged_at -- lihat temuan DRIFT di
-- header, BUKAN badan 20260908000002 yang ternyata tak pernah live untuk
-- fungsi ini):
--
--   CREATE OR REPLACE FUNCTION public.set_prospect_on_inquiry() RETURNS trigger
--       LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   BEGIN
--     UPDATE public.accounts
--     SET account_status  = 'prospect',
--         lifecycle_stage = 'prospect'
--     WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
--       AND lifecycle_stage IN ('lead','mql','sql')
--       AND account_status  IN ('lead','mql','sql');
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
