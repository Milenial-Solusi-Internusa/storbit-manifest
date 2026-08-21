-- =============================================================================
-- Migration: 20260821000005_ar_ttfs_company_scope
-- Task 5 — ar_ttfs / ar_btbs: dari USING(true) ke company- + role-scoped.
--
-- ⚠️ BELUM DIJALANKAN. Dijalankan manual di SQL Editor oleh Den.
--
-- MASALAH: kedelapan policy ar_ttfs/ar_btbs berbunyi USING(true) / WITH CHECK
--   (true) dengan GRANT ALL TO authenticated. Satu-satunya penjaga aksi Add /
--   Edit / HAPUS TTF adalah can(role,'finance') — sebuah objek JavaScript di
--   bundle frontend (App.jsx:311). Hapus TTF meng-CASCADE ke ar_btbs.
--
-- PRASYARAT SKEMA: ar_ttfs TIDAK punya company_id. Ketiga jalur join yang ada
--   (invoice_id / sp_order_id / customer_id) nullable, dan jalur AR Tracker
--   lama tak pernah mengisi dua yang pertama. Karena itu kolomnya ditambah +
--   di-backfill (keputusan Den), bukan diturunkan on-the-fly di policy.
--
-- SIAPA YANG BOLEH (keputusan sadar Den, BUKAN kelewat):
--   is_super_admin() OR ceo OR finance_controller OR finance.
--   is_manager_or_above() SENGAJA TIDAK dipakai -> gm, manager, supervisor,
--   dan admin generik TIDAK dapat akses TTF, padahal hari ini mereka punya
--   lewat can(role,'finance'). Ini penyempitan yang disengaja.
--
-- ar_btbs: TETAP tanpa policy UPDATE. Tabel itu memang DELETE + re-INSERT
--   (COMMENT tabelnya sendiri + updateTtf di db.js). Menambah UPDATE policy =
--   membuka jalur yang nol pemakai.
-- =============================================================================

-- ── STEP 1 — kolom + index ──────────────────────────────────────────────────
ALTER TABLE public.ar_ttfs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

COMMENT ON COLUMN public.ar_ttfs.company_id IS
  'Entitas pemilik TTF. Diisi otomatis trigger trg_ar_ttfs_set_company dari '
  'invoice -> sp_order -> customer. SENGAJA nullable: baris warisan yang '
  'ketiga jalurnya kosong tak boleh menggagalkan migrasi — lihat query yatim '
  'di STEP 3.';

CREATE INDEX IF NOT EXISTS idx_ar_ttfs_company_id
  ON public.ar_ttfs USING btree (company_id);

-- ── STEP 2 — backfill ───────────────────────────────────────────────────────
UPDATE public.ar_ttfs t
   SET company_id = COALESCE(
     (SELECT i.company_id FROM public.sp_invoices i WHERE i.id = t.invoice_id),
     (SELECT o.company_id FROM public.sp_orders   o WHERE o.id = t.sp_order_id),
     (SELECT a.company_id FROM public.accounts    a WHERE a.id = t.customer_id)
   )
 WHERE t.company_id IS NULL;

-- ── STEP 3 — LAPORAN BARIS YATIM (jalankan, tempel hasilnya ke Claude) ──────
-- Baris yang ketiga jalurnya kosong. Setelah policy STEP 5 aktif, baris ini
-- hanya terlihat super_admin. JANGAN ditebak isinya — laporkan.
--   SELECT id, no_ttf, no_inv, no_sp, customer_id, sp_order_id, invoice_id, created_at
--     FROM public.ar_ttfs WHERE company_id IS NULL ORDER BY created_at;

-- ── STEP 4 — trigger pengisi (menutup KEDUA jalur tulis) ────────────────────
-- Tanpa ini setiap TTF BARU lahir ber-company_id NULL dan langsung tak terlihat
-- oleh policy STEP 5. Dua penulis yang ada: insertTtf (db.js, PostgREST) dan
-- RPC mark_ttf_received (SECURITY DEFINER). Satu trigger menutup keduanya.
CREATE OR REPLACE FUNCTION public.ar_ttfs_set_company() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := COALESCE(
      (SELECT i.company_id FROM sp_invoices i WHERE i.id = NEW.invoice_id),
      (SELECT o.company_id FROM sp_orders   o WHERE o.id = NEW.sp_order_id),
      (SELECT a.company_id FROM accounts    a WHERE a.id = NEW.customer_id)
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ar_ttfs_set_company ON public.ar_ttfs;
CREATE TRIGGER trg_ar_ttfs_set_company
  BEFORE INSERT ON public.ar_ttfs
  FOR EACH ROW EXECUTE FUNCTION public.ar_ttfs_set_company();

-- ── STEP 5 — RLS ar_ttfs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS ar_ttfs_read   ON public.ar_ttfs;
DROP POLICY IF EXISTS ar_ttfs_insert ON public.ar_ttfs;
DROP POLICY IF EXISTS ar_ttfs_update ON public.ar_ttfs;
DROP POLICY IF EXISTS ar_ttfs_delete ON public.ar_ttfs;

CREATE POLICY ar_ttfs_read ON public.ar_ttfs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));

CREATE POLICY ar_ttfs_insert ON public.ar_ttfs FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));

CREATE POLICY ar_ttfs_update ON public.ar_ttfs FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ))
  WITH CHECK (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));

CREATE POLICY ar_ttfs_delete ON public.ar_ttfs FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));

-- ── STEP 6 — RLS ar_btbs (scope lewat induknya) ─────────────────────────────
DROP POLICY IF EXISTS ar_btbs_read   ON public.ar_btbs;
DROP POLICY IF EXISTS ar_btbs_insert ON public.ar_btbs;
DROP POLICY IF EXISTS ar_btbs_delete ON public.ar_btbs;

CREATE POLICY ar_btbs_read ON public.ar_btbs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.ar_ttfs t
     WHERE t.id = ar_btbs.ttf_id
       AND t.company_id IN (SELECT public.get_user_company_ids())
       AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));

CREATE POLICY ar_btbs_insert ON public.ar_btbs FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.ar_ttfs t
     WHERE t.id = ar_btbs.ttf_id
       AND t.company_id IN (SELECT public.get_user_company_ids())
       AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));

CREATE POLICY ar_btbs_delete ON public.ar_btbs FOR DELETE TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.ar_ttfs t
     WHERE t.id = ar_btbs.ttf_id
       AND t.company_id IN (SELECT public.get_user_company_ids())
       AND (public.has_role('ceo') OR public.has_role('finance_controller') OR public.has_role('finance'))
  ));
