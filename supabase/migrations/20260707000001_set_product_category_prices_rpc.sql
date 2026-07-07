-- ============================================================================
-- RPC set_product_category_prices — simpan 3 harga kategori produk + riwayat
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-07.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    RPC ini SUDAH LIVE di database (dibuat manual di Supabase SQL Editor,
--    sudah terverifikasi jalan). File ini merekam SQL asli agar tercatat &
--    reproducible.
--
-- TUJUAN: ProductDetailPage kini menampilkan + mengedit 3 harga kategori
--   (price_semester/price_tahunan/price_project) selain default_price. Trigger DB
--   `trg_z_products_price_history` HANYA meng-cover `default_price`, jadi perubahan
--   harga kategori TAK tercatat oleh trigger. RPC ini menyimpan harga kategori DAN
--   mencatat ke `product_price_history` per kategori yang berubah (source='category_edit',
--   price_category diisi). Menerima NULL untuk mengosongkan kategori ("belum diatur").
--
-- Authz: mirror policy `products_update` — super_admin ATAU admin-or-above di company
--   yang sama dengan produk. SECURITY DEFINER (diperlukan agar bisa INSERT ke
--   product_price_history yang immutable/hanya-DEFINER).
--
-- Kenapa BUKAN bulk_update_product_prices: fungsi itu super_admin-only + menolak NULL
--   (raise) → tak bisa clear + pecah parity dengan edit default_price (keputusan user).
--
-- Referensi: DESIGN_SP_SCHEMA.md keputusan #13 + CLAUDE.md (Recent — ProductDetailPage
--   3 harga kategori) + PROGRESS.md 2026-07-07.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_product_category_prices(
  p_product_id uuid,
  p_semester   numeric,   -- NULL = kosongkan (belum diatur)
  p_tahunan    numeric,
  p_project    numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_cur numeric;
        v_cols text[] := ARRAY['semester','tahunan','project'];
        v_new  numeric[]; v_c text; v_i int;
BEGIN
  SELECT company_id INTO v_company FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan: %', p_product_id; END IF;
  IF NOT (is_super_admin() OR (v_company = get_user_company_id() AND is_admin_or_above())) THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah harga produk ini';
  END IF;
  IF (p_semester IS NOT NULL AND p_semester < 0)
     OR (p_tahunan IS NOT NULL AND p_tahunan < 0)
     OR (p_project IS NOT NULL AND p_project < 0) THEN
    RAISE EXCEPTION 'Harga tidak boleh negatif';
  END IF;
  v_new := ARRAY[p_semester, p_tahunan, p_project];
  FOR v_i IN 1..3 LOOP
    v_c := v_cols[v_i];
    SELECT CASE v_c WHEN 'semester' THEN price_semester
                    WHEN 'tahunan'  THEN price_tahunan
                    ELSE price_project END
      INTO v_cur FROM products WHERE id = p_product_id;
    IF v_cur IS DISTINCT FROM v_new[v_i] THEN
      IF v_c = 'semester' THEN UPDATE products SET price_semester = v_new[v_i] WHERE id = p_product_id;
      ELSIF v_c = 'tahunan' THEN UPDATE products SET price_tahunan = v_new[v_i] WHERE id = p_product_id;
      ELSE UPDATE products SET price_project = v_new[v_i] WHERE id = p_product_id; END IF;
      INSERT INTO product_price_history
        (product_id, company_id, old_price, new_price, changed_by, source, price_category)
      VALUES (p_product_id, v_company, v_cur, v_new[v_i], auth.uid(), 'category_edit', v_c);
    END IF;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_product_category_prices(uuid,numeric,numeric,numeric) TO authenticated;
