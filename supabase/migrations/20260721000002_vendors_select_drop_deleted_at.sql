-- Cabut syarat deleted_at IS NULL dari USING vendors_select.
-- Alasan: soft delete (UPDATE deleted_at = now()) ditolak 42501 saat dijalankan
-- oleh role procurement. Terukur berulang di browser dan di SQL Editor.
-- Terbukti secara perilaku lewat A/B: update kolom lain (city) lolos, update
-- deleted_at ditolak; setelah syarat ini dicabut, update deleted_at lolos.
-- Mekanisme persisnya belum ditelusuri sampai level source Postgres.
-- Konsekuensi: penyaringan vendor terarsip jadi tanggung jawab query di kode.

ALTER POLICY vendors_select ON public.vendors
  USING (
    is_super_admin()
    OR company_id = get_user_company_id()
  );
