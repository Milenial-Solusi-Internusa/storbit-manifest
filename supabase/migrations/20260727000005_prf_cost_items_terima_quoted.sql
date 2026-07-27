-- ARSIP — dijalankan manual di Supabase SQL Editor, 27 Jul 2026.
-- Prasyarat batch 3C: RLS tulis prf_cost_items diperlebar menerima QUOTED.
--
-- KENAPA: setelah prf_mark_quoted() memindahkan status ke QUOTED (sales mulai
-- bisa memilih penawaran), rincian biaya TERKUNCI dengan daftar status lama.
-- Itu bertentangan dengan keputusan desain nomor 4 — harga vendor BOLEH
-- berubah setelah sales memilih, cukup diberi notifikasi. Tercatat sebagai
-- manifestasi baru TD-109.
--
-- Menggantikan daftar status yang ditetapkan 20260727000004. File itu SENGAJA
-- tidak diedit supaya jejak "kenapa dilebarkan dua kali" tetap terbaca.
--
-- CATATAN ASIMETRI YANG MASIH BERDIRI: prf_vendor_offers_update TIDAK menyaring
-- status sama sekali (hanya acknowledged_by), sehingga secara teknis masih
-- lebih longgar — penawaran bisa diubah bahkan saat PRF CANCELLED/EXPIRED.
-- Belum menggigit karena kedua status itu belum punya jalur penulis. Rapikan
-- bersamaan dengan pembangunan jalur cancel PRF.

DROP POLICY IF EXISTS prf_cost_items_insert ON public.prf_cost_items;

CREATE POLICY prf_cost_items_insert ON public.prf_cost_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED','QUOTED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
);

DROP POLICY IF EXISTS prf_cost_items_update ON public.prf_cost_items;

CREATE POLICY prf_cost_items_update ON public.prf_cost_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED','QUOTED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED','QUOTED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
);

DROP POLICY IF EXISTS prf_cost_items_delete ON public.prf_cost_items;

CREATE POLICY prf_cost_items_delete ON public.prf_cost_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED','QUOTED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
);
