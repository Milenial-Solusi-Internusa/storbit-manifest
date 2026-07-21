-- Tahap A dari batch PRF multi vendor + currency.
-- Semua kolom sengaja LONGGAR (nullable / berdefault) supaya RPC save_prf_pricing
-- lama dan UI lama tetap jalan tanpa disentuh.
-- item_group di-SET NOT NULL dan partial unique index dipasang di TAHAP D,
-- setelah UI + RPC baru live dan backfill selesai.
-- is_awarded default true: semua baris lama otomatis dianggap pemenang,
-- angka modal PRF yang sudah ada tidak berubah.
-- exchange_rate default 1: semua baris lama IDR.

ALTER TABLE public.prf_cost_items
  ADD COLUMN vendor_id     uuid    NULL REFERENCES public.vendors(id),
  ADD COLUMN item_group    text    NULL,
  ADD COLUMN is_awarded    boolean NOT NULL DEFAULT true,
  ADD COLUMN exchange_rate numeric NOT NULL DEFAULT 1;
