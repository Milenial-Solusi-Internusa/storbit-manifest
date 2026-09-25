-- =============================================================================
-- Migration: 20260926000001_set_delivery_signed_date
-- Phase:     AR Tahap 1 (1 dari 2) -- melengkapi signed_date pada Surat Jalan
--            yang SUDAH delivered tetapi tanggalnya kosong.
--
-- Status:    LIVE DI STAGING (25 Sep 2026) - BELUM DIJALANKAN DI PRODUCTION.
--
-- -- KENAPA ------------------------------------------------------------------
--   create_invoice_for_sp hanya menjurnal Surat Jalan yang delivered DAN
--   ber-signed_date. Surat Jalan delivered tanpa tanggal karena itu membuat SP-nya
--   tidak bisa ditagih, dan sampai sekarang tidak ada jalan melengkapinya:
--   mark_delivery_delivered hanya menerima SJ berstatus in_transit.
--
--   Populasi nyata di PRODUKSI (diukur read-only 25 Sep 2026):
--     106 dari 698 Surat Jalan delivered ber-signed_date NULL, yang terakhir
--     15 Sep 2026 -- yaitu sebelum kolomnya jadi wajib pada 17 Sep.
--     9 SP tertahan HANYA karena ini; melengkapi tanggalnya membuka tepat 9 SP.
--
--   ⛔ Ini BUKAN backfill. Tanggal tanda tangan adalah fakta dari kertas Surat
--   Jalan yang dipegang gudang; ia harus diketik orang yang memegang kertasnya,
--   satu per satu. Backfill dari xlsx sudah DIBATALKAN (koreksi D-2): kolom di
--   SURAT_JALAN_2026.xlsx adalah "Tgl Surat Jalan" (tanggal dokumen dibuat),
--   dan di 6 dari 12 SP tanggal itu LEBIH AWAL dari dispatched_at Nexus.
--
-- -- ISI --------------------------------------------------------------------
--   1. Dua kolom jejak di delivery_notes.
--   2. RPC set_delivery_signed_date(uuid, date) + ACL.
--
-- -- SIFAT ------------------------------------------------------------------
--   Aditif dan idempoten. 2 ADD COLUMN IF NOT EXISTS + 1 CREATE OR REPLACE.
--   Nol baris data diubah, nol kolom dihapus, nol policy, nol fungsi lain
--   disentuh. Perilaku penagihan TIDAK berubah oleh berkas ini -- itu berkas
--   kedua (20260926000002). Berkas ini boleh naik sendiri.
--
-- -- KENAPA KOLOM, BUKAN audit_logs (spesifikasi butir e minta dijelaskan) ----
--   audit_logs di repo ini menampung PERISTIWA yang dibaca sebagai riwayat
--   (mis. action='MARK_INQUIRY_WON'). Yang dibutuhkan di sini ATRIBUT BARIS:
--   guard (a) "isi sekali" perlu membacanya pada baris yang sama dengan
--   signed_date, dan UI perlu menampilkannya tanpa join. Menaruhnya di
--   audit_logs memaksa setiap pembaca menjawab pertanyaan tentang SATU baris
--   lewat pencarian di tabel lain, dan membuat guard bergantung pada dua tabel
--   yang bisa berbeda nasib dalam satu transaksi. Kolom lebih jujur di sini.
--   Keduanya tidak saling mengecualikan: kalau kelak AR butuh jejak penuh,
--   audit_logs bisa ditambahkan tanpa membuang kolom ini.
-- =============================================================================


-- =============================================================================
-- V0 -- jalankan SEBELUM blok eksekusi.
-- =============================================================================
SELECT 'kolom signed_date_filled_by ada'  AS metrik,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='delivery_notes'
           AND column_name='signed_date_filled_by') AS nilai
UNION ALL SELECT 'kolom signed_date_filled_at ada',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='delivery_notes'
           AND column_name='signed_date_filled_at')
UNION ALL SELECT 'RPC set_delivery_signed_date ada',
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='set_delivery_signed_date')
UNION ALL SELECT 'SJ delivered tanpa signed_date (sasaran)',
       (SELECT count(*)::text FROM delivery_notes WHERE status='delivered' AND signed_date IS NULL);


-- =============================================================================
-- 1. Kolom jejak
-- =============================================================================
ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS signed_date_filled_by uuid,
  ADD COLUMN IF NOT EXISTS signed_date_filled_at timestamptz;

COMMENT ON COLUMN public.delivery_notes.signed_date_filled_by IS
  'Siapa melengkapi signed_date lewat set_delivery_signed_date. NULL = signed_date diisi jalur normal mark_delivery_delivered(uuid,date), atau belum diisi. HANYA set_delivery_signed_date yang boleh mengisi kolom ini.';
COMMENT ON COLUMN public.delivery_notes.signed_date_filled_at IS
  'Kapan signed_date dilengkapi lewat set_delivery_signed_date. Berpasangan dengan signed_date_filled_by.';

-- Sengaja TANPA FK ke auth.users: pola yang sama dengan created_by di tabel ini
-- (delivery_notes.created_by juga uuid tanpa FK). Menambah FK di sini akan jadi
-- satu-satunya kolom pengguna di tabel ini yang ber-FK, dan itu ketidakteraturan
-- baru, bukan pengetatan yang bermakna.


-- =============================================================================
-- 2. RPC set_delivery_signed_date
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_delivery_signed_date(
  p_delivery_note_id uuid,
  p_signed_date      date
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status  text;
  v_signed  date;
  v_disp    timestamptz;
  v_cust    uuid;
  v_sp      text;
  v_do      text;
  v_uid     uuid := auth.uid();
  v_hari_ini date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  -- GUARD (c) -- peran. Sama persis dengan mark_delivery_delivered: level <= 6
  -- ATAU role operations, yaitu orang gudang yang memegang kertas Surat Jalan.
  -- Finance SENGAJA tidak diberi akses: tanggal tanda tangan adalah fakta
  -- pengiriman, bukan keputusan penagihan.
  -- !! Daftar peran ini duplikat dari mark_delivery_delivered dan prf_release
  -- dkk -- itu instance BARU dari TD-233. Duplikasinya disengaja (peran harus
  -- bisa diikat ke konteksnya), tapi perlakukan sebagai CHECKLIST: mengubah
  -- daftar peran berarti menyentuh semuanya dalam satu migrasi.
  IF NOT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r ON r.id = ur.role_id
    WHERE  ur.user_id   = v_uid
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  (r.level <= 6 OR r.code = 'operations')
  ) THEN
    RAISE EXCEPTION 'Tidak berhak melengkapi tanggal tanda tangan Surat Jalan. Butuh level manager ke atas atau role operations.';
  END IF;

  SELECT status, signed_date, dispatched_at, customer_id, sp_no, do_no
    INTO v_status, v_signed, v_disp, v_cust, v_sp, v_do
    FROM delivery_notes WHERE id = p_delivery_note_id;
  IF v_sp IS NULL THEN
    RAISE EXCEPTION 'Surat Jalan tidak ditemukan.';
  END IF;

  -- GUARD (a) -- hanya delivered, dan hanya kalau masih kosong.
  IF v_status <> 'delivered' THEN
    RAISE EXCEPTION 'Surat Jalan % berstatus % - hanya Surat Jalan delivered yang bisa dilengkapi tanggalnya. Untuk SJ in_transit pakai Tandai Terkirim.', v_do, v_status;
  END IF;
  IF v_signed IS NOT NULL THEN
    RAISE EXCEPTION 'Surat Jalan % sudah punya tanggal tanda tangan (%) - tidak bisa diubah. Tanggal ini sengaja hanya bisa diisi SEKALI.', v_do, v_signed;
  END IF;

  -- GUARD (b) -- tanggal wajib, tidak di masa depan, tidak sebelum berangkat.
  IF p_signed_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal tanda tangan wajib diisi.';
  END IF;
  -- !! WIB, BUKAN current_date UTC. mark_delivery_delivered memakai current_date
  -- dan karena itu menolak tanggal hari ini antara 00:00-06:59 WIB (TD-264).
  -- Berkas ini sengaja TIDAK mewarisi cacat itu.
  IF p_signed_date > v_hari_ini THEN
    RAISE EXCEPTION 'Tanggal tanda tangan tidak boleh di masa depan (hari ini WIB: %).', v_hari_ini;
  END IF;
  -- dispatched_at NULL -> cek ini DILEWATI (spesifikasi butir b). Ada Surat Jalan
  -- lama yang delivered tanpa jejak keberangkatan; menolaknya justru menutup
  -- satu-satunya jalan melengkapi tanggalnya.
  IF v_disp IS NOT NULL
     AND p_signed_date < (v_disp AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal tanda tangan (%) tidak boleh sebelum tanggal berangkat (% WIB) untuk Surat Jalan %.',
      p_signed_date, (v_disp AT TIME ZONE 'Asia/Jakarta')::date, v_do;
  END IF;

  -- GUARD (e) -- jejak. Syarat signed_date IS NULL diulang di WHERE supaya dua
  -- panggilan berbarengan tidak sama-sama lolos: yang kedua meng-update 0 baris.
  UPDATE delivery_notes
     SET signed_date           = p_signed_date,
         signed_date_filled_by = v_uid,
         signed_date_filled_at = now(),
         updated_at            = now()
   WHERE id = p_delivery_note_id
     AND status = 'delivered'
     AND signed_date IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Surat Jalan % gagal diperbarui - kemungkinan tanggalnya baru saja diisi orang lain.', v_do;
  END IF;

  -- Status SP bisa bergerak: SJ yang tadinya tak terhitung kini punya tanggal.
  PERFORM sp_recompute_status(v_cust, v_sp);
END;
$function$;

-- GUARD (d) -- ACL. REVOKE lebih dulu, baru GRANT.
REVOKE ALL ON FUNCTION public.set_delivery_signed_date(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_delivery_signed_date(uuid, date) TO authenticated;


-- =============================================================================
-- V1 -- VERIFIKASI sesudah eksekusi
-- =============================================================================

-- V1a  Kolom ada, nullable, tipe benar. HARAPAN: 2 baris, keduanya YES.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='delivery_notes'
  AND column_name IN ('signed_date_filled_by','signed_date_filled_at')
ORDER BY column_name;

-- V1b  RPC ada dengan signature, SECURITY, search_path, dan ACL yang benar.
SELECT p.proname,
       pg_get_function_arguments(p.oid) AS args,
       pg_get_function_result(p.oid)    AS ret,
       p.prosecdef                      AS security_definer,
       COALESCE(array_to_string(p.proconfig,','),'-') AS config,
       COALESCE(array_to_string(p.proacl,' | '),'(default) = PUBLIC EXECUTE') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_delivery_signed_date';
-- HARAPAN: args 'p_delivery_note_id uuid, p_signed_date date' - ret void
--          security_definer true - config search_path=public
--          acl memuat 'authenticated=X/' dan TIDAK memuat entri ber-grantee kosong
--
-- !! Cara menguji "PUBLIC sudah dicabut" -- jangan pakai LIKE '%=X/%'.
-- PUBLIC diwakili entri ber-grantee KOSONG, jadi stringnya DIAWALI '='
-- (mis. '=X/postgres'). Pola '%=X/%' juga kena 'postgres=X/postgres' dan
-- 'authenticated=X/postgres', sehingga uji itu selalu true dan tidak pernah
-- membuktikan apa pun. Terjadi 25 Sep 2026 saat V1b pertama dijalankan.
SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
                    unnest(p.proacl) a
                WHERE n.nspname='public' AND p.proname='set_delivery_signed_date'
                  AND a::text LIKE '=%') AS masih_public;
-- HARAPAN: false

-- V1c  Belum ada baris yang tersentuh (berkas ini nol mengubah data).
SELECT count(*) AS baris_ber_jejak_pengisi
FROM delivery_notes WHERE signed_date_filled_by IS NOT NULL;
-- HARAPAN: 0 tepat sesudah migrasi.


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   DROP FUNCTION IF EXISTS public.set_delivery_signed_date(uuid, date);
--
-- Kolomnya SENGAJA TIDAK di-drop: aditif, nullable, dan setelah RPC hilang tak
-- ada penulisnya. Men-DROP kolom membuang jejak audit yang sudah terkumpul --
-- tepatnya hal yang paling tidak boleh hilang saat rollback. Kalau benar-benar
-- harus:
--   ALTER TABLE public.delivery_notes
--     DROP COLUMN IF EXISTS signed_date_filled_by,
--     DROP COLUMN IF EXISTS signed_date_filled_at;
--
-- signed_date yang sudah terisi TIDAK dibalik: ia fakta dari kertas Surat Jalan,
-- bukan turunan kode.
