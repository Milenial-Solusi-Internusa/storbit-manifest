-- ARSIP — dijalankan manual di Supabase SQL Editor, 27 Jul 2026.
-- Melengkapi 20260727000005 yang KELIRU HANYA melebarkan prf_cost_items.
--
-- MASALAH: save_prf_pricing() dimulai dengan UPDATE ke tabel `prf` (header
-- jawaban harga). Kalau UPDATE itu ditolak RLS, fungsinya langsung RAISE
-- sebelum menyentuh baris biaya sama sekali. Jadi melebarkan RLS
-- prf_cost_items ke QUOTED saja TIDAK cukup — panel "Jawaban Harga" lama tetap
-- mati total begitu PRF berstatus QUOTED.
--
-- Ini baru menggigit setelah batch 3C memberi tombol "Nyatakan Penawaran Siap"
-- (pemanggil pertama prf_mark_quoted). Ditemukan doc-keeper saat mencatat
-- batch 3C, bukan lewat tes runtime.
--
-- DAMPAK YANG DICEGAH: Biaya Internal HANYA bisa diedit lewat panel lama, dan
-- biaya internal ikut terhitung dalam formula modal. Tanpa perbaikan ini,
-- procurement tidak bisa lagi mengoreksi biaya internal setelah menyatakan
-- penawaran siap.
--
-- Terverifikasi: setelah perbaikan, UPDATE prf.pricing_notes pada PRF
-- berstatus QUOTED berhasil lewat sesi procurement asli (dibungkus ROLLBACK).

DROP POLICY IF EXISTS prf_update_status ON public.prf;

CREATE POLICY prf_update_status ON public.prf
FOR UPDATE TO authenticated
USING (
  is_super_admin() OR (
    deleted_at IS NULL
    AND company_id = get_user_company_id()
    AND has_role('procurement')
    AND status::text IN ('SUBMITTED','ACKNOWLEDGED','QUOTED')
    AND (acknowledged_by IS NULL OR acknowledged_by = auth.uid())
  )
)
WITH CHECK (
  is_super_admin() OR (
    company_id = get_user_company_id()
    AND has_role('procurement')
  )
);
