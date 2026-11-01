-- =============================================================================
-- Migration: 20261101000003_revoke_public_anon_execute_more_write_rpcs
-- Phase:     Hardening keamanan -- pencabutan EXECUTE PUBLIC/anon dari 5 RPC
--            SECURITY DEFINER penulis data TAMBAHAN (lanjutan
--            20261101000002, 18 fungsi pertama).
-- Purpose:   5 fungsi berikut masih bisa dipanggil PUBLIC/anon:
--              - create_invoice, create_invoice_for_sp -- nol baris ACL
--                eksplisit di schema_snapshot.sql (lahir sebelum TD-300,
--                tidak pernah disentuh sejak -- sudah tercatat TD-295).
--                Logic guard-nya sendiri AMAN (is_super_admin() OR
--                is_manager_or_above() OR has_role('finance_controller'),
--                nol bare-equality terhadap auth.uid()) -- jadi belum
--                tereksploitasi lewat bug NULL, tapi ACL-nya tetap longgar.
--              - submit_invoice -- pola ACL sama (nol baris eksplisit),
--                guard-nya juga AMAN (is_super_admin() OR
--                is_manager_or_above() OR has_role('finance_controller')).
--              - mark_delivery_delivered -- 2 overload (uuid) dan
--                (uuid,date). Overload (uuid) punya PUBLIC EXECUTE
--                ter-GRANT tanpa REVOKE (TD-263); overload (uuid,date)
--                sudah REVOKE ALL FROM PUBLIC sejak lahir (20260917000001)
--                -- migrasi ini menegaskan ulang KEDUANYA sekaligus,
--                idempoten utk overload yang sudah benar. Guard kedua
--                overload AMAN (IF NOT EXISTS(...), nol bare-equality).
--              - mark_inquiry_won -- versi 1-argumen (LIVE PRODUKSI) sudah
--                REVOKE ALL FROM PUBLIC (guard-nya sendiri AMAN, pakai
--                IS DISTINCT FROM). Versi 4-argumen (STAGING SAJA, migrasi
--                20261021000001) JUGA sudah REVOKE ALL FROM PUBLIC sejak
--                lahir -- TAPI guard 4-argumennya mengandung bare
--                `v_owner_id = auth.uid()` yang rentan NULL-bypass (lihat
--                laporan audit terpisah, bukan bagian migrasi ini).
--                Migrasi ini TIDAK memperbaiki logic guard tersebut --
--                HANYA menegaskan ulang ACL kedua overload.
--            Loop berbasis pg_proc.oid (regprocedure) MENCAKUP SEMUA
--            overload dari tiap nama fungsi secara otomatis -- disengaja,
--            supaya mark_delivery_delivered (2 overload) dan
--            mark_inquiry_won (1-arg produksi + 4-arg staging) kena
--            keduanya tanpa perlu menyebut tanda tangan argumen satu per
--            satu.
-- Depends:   Tidak ada. Migrasi ini HANYA mengubah ACL (REVOKE/GRANT
--            EXECUTE) -- tidak menyentuh badan fungsi, tidak menyentuh
--            data. Idempoten -- aman dijalankan ulang kapan pun.
-- Status:    BELUM DIJALANKAN -- disiapkan untuk dijalankan Mas di SQL
--            Editor (staging dulu, lalu produksi).
-- =============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'create_invoice','create_invoice_for_sp','submit_invoice',
        'mark_delivery_delivered','mark_inquiry_won')
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   SELECT p.proname, p.oid::regprocedure AS tanda_tangan,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_boleh,
--          has_function_privilege('public', p.oid, 'EXECUTE')        AS public_boleh,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_boleh,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role_boleh
--     FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN (
--        'create_invoice','create_invoice_for_sp','submit_invoice',
--        'mark_delivery_delivered','mark_inquiry_won')
--    ORDER BY p.proname, tanda_tangan;
--   -- Diharapkan untuk SEMUA baris (termasuk SEMUA overload
--   -- mark_delivery_delivered dan mark_inquiry_won): anon_boleh = false,
--   -- public_boleh = false, authenticated_boleh = true,
--   -- service_role_boleh = true.

-- ─── ROLLBACK ─────────────────────────────────────────────────────────────────
-- do $$
-- declare r record;
-- begin
--   for r in
--     select p.oid::regprocedure as f
--     from pg_proc p
--     where p.pronamespace = 'public'::regnamespace
--       and p.proname in (
--         'create_invoice','create_invoice_for_sp','submit_invoice',
--         'mark_delivery_delivered','mark_inquiry_won')
--   loop
--     execute format('grant execute on function %s to public', r.f);
--   end loop;
-- end $$;
-- =============================================================================
