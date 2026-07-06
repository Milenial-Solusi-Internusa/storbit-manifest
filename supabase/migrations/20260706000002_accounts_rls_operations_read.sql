-- ============================================================================
-- accounts RLS — izinkan role `operations` membaca customer di company sendiri
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-06.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Policy ini SUDAH LIVE di production (dijalankan manual di Supabase SQL Editor,
--    sudah terverifikasi). File ini merekam SQL asli agar tercatat & reproducible.
--
-- TUJUAN: memperbaiki blocker di halaman Input SP — operator SOA (role `operations`)
--   tidak bisa melihat customer di dropdown karena policy `prospects_read` lama hanya
--   meloloskan super_admin / manager-ke-atas / pemilik baris (assigned_to/created_by).
--   Perbaikan menambah cabang `has_role('operations') AND account_status = 'customer'`:
--   operations kini bisa membaca account ber-status customer di company-nya sendiri
--   (least-privilege: hanya customer, bukan prospect CRM; tetap company-scoped).
--
-- Referensi audit: AUDIT_ACCOUNTS_RLS.md (Opsi A′).
-- ============================================================================

DROP POLICY IF EXISTS prospects_read ON public.accounts;

CREATE POLICY prospects_read ON public.accounts
FOR SELECT
USING (
  is_super_admin()
  OR (
    company_id = get_user_company_id()
    AND (
      is_manager_or_above()
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
      OR (has_role('operations') AND account_status = 'customer')
    )
  )
);
