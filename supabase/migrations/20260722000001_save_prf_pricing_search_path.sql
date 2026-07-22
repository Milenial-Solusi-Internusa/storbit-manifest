-- STATUS: BELUM DIJALANKAN saat file ini dibuat (22 Jul 2026).
-- Jalankan manual di Supabase SQL Editor, lalu verifikasi dengan query di bagian
-- VERIFIKASI di bawah. Jangan percaya pesan "Success".
--
-- Kembalikan SET search_path TO 'public' pada save_prf_pricing.
--
-- Migrasi 20260721000004 mengganti fungsi ini lewat CREATE OR REPLACE tanpa
-- menuliskan ulang klausa SET-nya. CREATE OR REPLACE mengganti SELURUH properti
-- fungsi, jadi setelan itu ikut tercabut — dan pg_dump berikutnya kehilangan
-- barisnya. 33 fungsi lain di snapshot masih punya setelan ini.
--
-- URGENSI: RENDAH, dan jangan dinaikkan. save_prf_pricing adalah SECURITY
-- INVOKER (snapshot :1032 hanya menulis LANGUAGE plpgsql; pg_dump menghilangkan
-- "SECURITY INVOKER" karena itu default). Pada INVOKER, fungsi berjalan dengan
-- hak PEMANGGIL, sehingga search_path yang dibelokkan tidak bisa menaikkan
-- privilege — pemanggil hanya menyesatkan dirinya sendiri. Kedua tabel di body
-- juga sudah schema-qualified (public.prf, public.prf_cost_items), begitu pula
-- auth.uid(). Ini perbaikan KONSISTENSI, bukan menutup lubang keamanan. Alasan
-- mengerjakannya sekarang: supaya tidak muncul lagi sebagai temuan audit.
-- (Kalau fungsinya SECURITY DEFINER, penilaian ini akan berbeda total.)
--
-- SECURITY INVOKER sengaja TIDAK ditulis eksplisit. Kalau ditulis, pg_dump tetap
-- tidak akan menuliskannya di snapshot karena itu default — migrasi dan snapshot
-- jadi berbeda lagi, persis jenis divergensi yang sedang dibereskan. Biarkan
-- implisit supaya keduanya konsisten.
--
-- BODY DISALIN VERBATIM dari supabase/schema_snapshot.sql:1034-1094 (versi LIVE),
-- BUKAN dari 20260721000004. Alasannya: body live memuat TIGA baris komentar yang
-- tidak ada di file migrasi itu. Setelah komentar dan whitespace dinormalisasi
-- keduanya identik — nol beda eksekusi — tapi live adalah kebenaran, jadi live
-- yang disalin supaya tidak ada yang ter-revert dan md5(prosrc) tetap sama.
-- Lihat TD-C soal file migrasi yang mengklaim REKAMAN tanpa pernah diverifikasi.
--
-- Dollar-quote BERNAMA ($fn$), bukan $$ polos — $$ polos rawan ke-truncate di
-- SQL Editor.

CREATE OR REPLACE FUNCTION public.save_prf_pricing(p_prf_id uuid, p_header jsonb, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_count   int;
  v_vendors int;
BEGIN
  -- 1) Header jawaban harga (RLS prf_update_status: procurement + status='SUBMITTED').
  UPDATE public.prf SET
    suggested_rate = NULLIF(p_header->>'suggested_rate','')::numeric,
    rate_currency  = COALESCE(NULLIF(p_header->>'rate_currency',''), 'IDR'),
    valid_from     = NULLIF(p_header->>'valid_from','')::date,
    valid_until    = NULLIF(p_header->>'valid_until','')::date,
    pricing_notes  = NULLIF(p_header->>'pricing_notes',''),
    exchange_rates = COALESCE(p_header->'exchange_rates', exchange_rates),
    answered_by    = auth.uid(),
    answered_at    = now()
  WHERE id = p_prf_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PRF tidak ditemukan atau tidak ada izin menyimpan jawaban harga (RLS).';
  END IF;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'save_prf_pricing: p_items harus jsonb array (atau NULL), tetapi menerima jsonb_typeof = %', jsonb_typeof(p_items);
  END IF;

  -- Guard aturan bisnis: satu PRF hanya boleh punya SATU vendor pemenang.
  IF p_items IS NOT NULL THEN
    SELECT count(DISTINCT it->>'vendor_id') INTO v_vendors
    FROM jsonb_array_elements(p_items) AS it
    WHERE COALESCE(NULLIF(it->>'is_awarded','')::boolean, true) = true
      AND NULLIF(it->>'vendor_id','') IS NOT NULL;

    IF v_vendors > 1 THEN
      RAISE EXCEPTION 'save_prf_pricing: hanya boleh satu vendor pemenang per PRF, tetapi menerima % vendor ter-award.', v_vendors;
    END IF;
  END IF;

  -- 2) Replace rincian biaya (RLS prf_cost_items_delete + _insert: procurement + SUBMITTED).
  DELETE FROM public.prf_cost_items WHERE prf_id = p_prf_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.prf_cost_items (
      prf_id, component, cost_type, amount, currency, sort_order, notes,
      vendor_id, item_group, is_awarded, exchange_rate
    )
    SELECT p_prf_id,
      it->>'component',
      CASE WHEN (it->>'cost_type') = 'internal' THEN 'internal' ELSE 'vendor' END,
      COALESCE(NULLIF(it->>'amount','')::numeric, 0),
      COALESCE(NULLIF(it->>'currency',''), 'IDR'),
      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
      NULLIF(it->>'notes',''),
      NULLIF(it->>'vendor_id','')::uuid,
      NULLIF(it->>'item_group',''),
      COALESCE(NULLIF(it->>'is_awarded','')::boolean, true),
      COALESCE(NULLIF(it->>'exchange_rate','')::numeric, 1)
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  RETURN jsonb_build_object('ok', true, 'prf_id', p_prf_id);
END;
$fn$;

-- ─── VERIFIKASI ──────────────────────────────────────────────────────────────
-- Jalankan query ini SEBELUM migrasi (catat body_md5), lalu SESUDAH.
--
--   SELECT p.prosecdef AS security_definer, p.proconfig,
--          md5(p.prosrc) AS body_md5, length(p.prosrc) AS body_len
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'save_prf_pricing';
--
-- Yang harus terjadi SESUDAH:
--   body_md5        IDENTIK dengan sebelum  <- SET search_path masuk ke proconfig,
--                                              bukan ke prosrc. Kalau md5 berubah,
--                                              body termodifikasi -> ROLLBACK.
--   proconfig       NULL -> {search_path=public}
--   security_definer tetap false
--
-- ROLLBACK (kalau body_md5 berubah): jalankan ulang file ini setelah MENGHAPUS
-- baris "SET search_path TO 'public'" di atas. CREATE OR REPLACE mengganti
-- seluruh properti fungsi, jadi menghilangkan klausa SET akan mengembalikan
-- proconfig ke NULL — mekanisme yang sama persis yang menyebabkan setelan ini
-- hilang di 20260721000004. Body-nya sendiri sudah verbatim dari versi live,
-- jadi menjalankan ulang mengembalikan keadaan sebelum migrasi ini.
