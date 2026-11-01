-- =============================================================================
-- Migration: 20261101000002_revoke_public_anon_execute_write_rpcs
-- Phase:     Hardening keamanan -- pencabutan EXECUTE PUBLIC/anon dari 18 RPC
--            SECURITY DEFINER yang menulis data.
-- Purpose:   18 fungsi SECURITY DEFINER di schema public yang menulis data
--            ternyata bisa dipanggil oleh PUBLIC dan anon (EXECUTE tidak
--            pernah di-REVOKE/di-GRANT ulang secara eksplisit saat fungsinya
--            dibuat). Fungsi prf_release TERBUKTI lolos penjaga hak akses
--            saat dipanggil tanpa identitas aplikasi (auth.uid() NULL):
--            kondisi `IF NOT (is_super_admin() OR v_ack = v_uid OR
--            EXISTS(...))` bernilai NULL (bukan TRUE) ketika v_uid NULL,
--            sehingga cabang RAISE tidak pernah jalan -- penjaganya lolos,
--            bukan menolak. Badan fungsi di produksi IDENTIK dengan di
--            staging untuk temuan ini.
-- Depends:   Tidak ada. Migrasi ini HANYA mengubah ACL (REVOKE/GRANT EXECUTE)
--            -- tidak menyentuh badan fungsi, tidak menyentuh data.
--            Idempoten -- aman dijalankan ulang kapan pun (REVOKE/GRANT atas
--            hak yang sudah sesuai adalah no-op).
-- Status:    SUDAH DIJALANKAN manual di staging 1 Nov 2026 oleh Mas,
--            terverifikasi. PRODUKSI BELUM -- menyusul.
-- =============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'add_picking_material','bulk_update_product_prices','cancel_delivery','cancel_picking',
        'delete_picking_material','delete_sp_dual','dispatch_delivery','generate_delivery_from_picking',
        'generate_picking_from_sp','prf_claim','prf_mark_quoted','prf_release','prf_select_offer',
        'set_product_category_prices','set_sp_status','sp_delete_btb','sp_issue_btb','update_sp_item_dual')
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_boleh,
--          has_function_privilege('public', p.oid, 'EXECUTE')        AS public_boleh,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_boleh,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role_boleh
--     FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN (
--        'add_picking_material','bulk_update_product_prices','cancel_delivery','cancel_picking',
--        'delete_picking_material','delete_sp_dual','dispatch_delivery','generate_delivery_from_picking',
--        'generate_picking_from_sp','prf_claim','prf_mark_quoted','prf_release','prf_select_offer',
--        'set_product_category_prices','set_sp_status','sp_delete_btb','sp_issue_btb','update_sp_item_dual')
--    ORDER BY p.proname;
--   -- Diharapkan untuk SELURUH 18 baris: anon_boleh = false, public_boleh = false,
--   -- authenticated_boleh = true, service_role_boleh = true.
--   -- CATATAN: kalau ada nama yang punya lebih dari satu overload (beberapa
--   -- tanda tangan argumen berbeda), query ini bisa mencetak LEBIH dari 18
--   -- baris -- itu bukan kegagalan, migrasi di atas sudah menjangkau SEMUA
--   -- overload (pg_proc.oid per fungsi, bukan per nama).

-- ─── ROLLBACK ─────────────────────────────────────────────────────────────────
-- do $$
-- declare r record;
-- begin
--   for r in
--     select p.oid::regprocedure as f
--     from pg_proc p
--     where p.pronamespace = 'public'::regnamespace
--       and p.proname in (
--         'add_picking_material','bulk_update_product_prices','cancel_delivery','cancel_picking',
--         'delete_picking_material','delete_sp_dual','dispatch_delivery','generate_delivery_from_picking',
--         'generate_picking_from_sp','prf_claim','prf_mark_quoted','prf_release','prf_select_offer',
--         'set_product_category_prices','set_sp_status','sp_delete_btb','sp_issue_btb','update_sp_item_dual')
--   loop
--     execute format('grant execute on function %s to public', r.f);
--   end loop;
-- end $$;
-- =============================================================================
