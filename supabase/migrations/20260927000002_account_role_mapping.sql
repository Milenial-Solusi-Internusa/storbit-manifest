-- =============================================================================
-- 20260927000002_account_role_mapping.sql   (AR Tahap 2, butir 2 dari 3)
--
-- Tabel pemetaan PERAN AKUN per entitas + helper pembacanya.
-- ADITIF SEPENUHNYA: nol fungsi jurnal disentuh di berkas ini, jadi menjalankan
-- ini saja TIDAK mengubah satu pun jurnal. Yang memakainya = butir 3.
--
-- KENAPA ADA
--   Hari ini create_invoice_for_sp dan record_payment mencari akun lewat KODE
--   yang di-hardcode di badan fungsi ('1-1200', '4-1000', '4-1100', '2-1200',
--   '1-1101', '1-1300'). Draft CoA baru Finance mengubah ARTI kode yang sama
--   (mis. 1-1200 jadi Bank Rupiah, 2-1200 jadi akrual) -- begitu CoA itu naik,
--   kedua fungsi akan tetap berjalan tanpa error dan menjurnal ke akun yang
--   SALAH. Kegagalan seperti itu tidak berbunyi; ia cuma menghasilkan pembukuan
--   yang rapi dan keliru.
--
--   Karena itu jurnal berhenti bergantung pada kode, dan bergantung pada PERAN.
--   Kode boleh berubah arti; peran "piutang usaha" tidak.
--
-- ENAM PERAN (dan kode yang MEWAKILINYA HARI INI -- bukan definisinya)
--   piutang_usaha           1-1200  Piutang Usaha
--   ppn_keluaran            2-1200  PPN Keluaran
--   pendapatan_barang       4-1000  Pendapatan Penjualan (Barang)
--   pendapatan_jasa_kirim   4-1100  Pendapatan Jasa Kirim
--   kas_bank                1-1101  Bank
--   pph23_dibayar_dimuka    1-1300  PPh 23 Dibayar Dimuka
--
--   !! Enam ini SELURUH kebutuhan kedua fungsi jurnal hari ini -- diukur, bukan
--   ditaksir: hanya tiga fungsi di produksi yang menyentuh journal_entry_lines
--   (create_invoice, create_invoice_for_sp, record_payment), dan sesudah AR
--   Tahap 1 yang pertama cuma pembungkus tipis. Peran baru = pekerjaan baru,
--   bukan tambalan di sini.
--
-- SEED
--   Isi awal = akun yang DIPAKAI SEKARANG, dicari lewat kode lama. Itulah yang
--   membuat butir 3 bisa dibuktikan menghasilkan jurnal identik. Di produksi
--   hari ini hanya SOA punya chart_of_accounts (6 akun, 1 entitas), jadi seed-nya
--   6 baris; entitas lain akan kosong dan itu BENAR -- mereka belum punya CoA
--   sama sekali, bukan "belum dipetakan karena lupa".
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan sebelum.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.code, count(*) AS n_entitas,
           string_agg(co.code, ',' ORDER BY co.code) AS entitas
      FROM chart_of_accounts c
      JOIN companies co ON co.id = c.company_id
     WHERE c.deleted_at IS NULL
       AND c.code IN ('1-1101','1-1200','1-1300','2-1200','4-1000','4-1100')
     GROUP BY c.code ORDER BY c.code
  LOOP
    RAISE NOTICE 'V0 kode % ada di % entitas (%)', r.code, r.n_entitas, r.entitas;
  END LOOP;
END
$v0$;

-- ---------------------------------------------------------------------------
-- TABEL
--
-- Kunci unik (company_id, role_key): satu peran tepat satu akun per entitas.
-- FK ke chart_of_accounts DIPASANG (bukan uuid lepas) supaya akun yang dipetakan
-- tidak bisa dihapus keras sementara jurnal masih mengandalkannya.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_role_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  role_key    text NOT NULL,
  account_id  uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  CONSTRAINT account_role_mappings_role_key_check CHECK (role_key IN (
    'piutang_usaha',
    'ppn_keluaran',
    'pendapatan_barang',
    'pendapatan_jasa_kirim',
    'kas_bank',
    'pph23_dibayar_dimuka'
  )),
  CONSTRAINT account_role_mappings_unik UNIQUE (company_id, role_key)
);

COMMENT ON TABLE public.account_role_mappings IS
  'Peran akun per entitas untuk fungsi jurnal (AR Tahap 2, 20260927000002). Jurnal mencari akun lewat role_key, bukan lewat chart_of_accounts.code -- draft CoA baru mengubah arti kode yang sama.';

CREATE INDEX IF NOT EXISTS account_role_mappings_company_idx
  ON public.account_role_mappings (company_id);

-- ---------------------------------------------------------------------------
-- GRANT + RLS
--
-- REVOKE eksplisit: default privileges DB menempelkan TRUNCATE/REFERENCES/
-- TRIGGER ke authenticated untuk setiap tabel baru (pelajaran 20260914000002).
-- ---------------------------------------------------------------------------
ALTER TABLE public.account_role_mappings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_role_mappings FROM PUBLIC;
REVOKE ALL ON TABLE public.account_role_mappings FROM anon;
REVOKE ALL ON TABLE public.account_role_mappings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_role_mappings TO authenticated;

-- BACA sengaja LEBIH LUAS dari TULIS, dan dipisah jadi policy sendiri.
-- Pelajaran TD-253: policy FOR ALL ber-syarat admin membuat MEMBACA pun butuh
-- admin, lalu UI melaporkan "belum diatur" padahal datanya ada.
DROP POLICY IF EXISTS account_role_mappings_read ON public.account_role_mappings;
CREATE POLICY account_role_mappings_read ON public.account_role_mappings
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR company_id IN (SELECT get_user_company_ids())
  );

DROP POLICY IF EXISTS account_role_mappings_insert ON public.account_role_mappings;
CREATE POLICY account_role_mappings_insert ON public.account_role_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (is_admin_or_above() AND company_id IN (SELECT get_user_company_ids()))
  );

DROP POLICY IF EXISTS account_role_mappings_update ON public.account_role_mappings;
CREATE POLICY account_role_mappings_update ON public.account_role_mappings
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (is_admin_or_above() AND company_id IN (SELECT get_user_company_ids()))
  )
  WITH CHECK (
    is_super_admin()
    OR (is_admin_or_above() AND company_id IN (SELECT get_user_company_ids()))
  );

DROP POLICY IF EXISTS account_role_mappings_delete ON public.account_role_mappings;
CREATE POLICY account_role_mappings_delete ON public.account_role_mappings
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ---------------------------------------------------------------------------
-- HELPER
--
-- SECURITY DEFINER supaya fungsi jurnal (yang juga DEFINER) tidak bergantung
-- pada RLS pemanggilnya. STABLE: dipanggil berulang dalam satu transaksi.
--
-- Pesan gagalnya menyebut ENTITAS dan PERAN -- bukan "akun tidak ditemukan".
-- Orang yang membacanya harus langsung tahu baris mana yang harus diisi.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mapped_account(p_company_id uuid, p_role_key text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_account_id  uuid;
  v_entity_code text;
  v_deleted     timestamptz;
BEGIN
  SELECT co.code INTO v_entity_code FROM companies co WHERE co.id = p_company_id;

  SELECT m.account_id INTO v_account_id
    FROM account_role_mappings m
   WHERE m.company_id = p_company_id AND m.role_key = p_role_key;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Peran akun [%] belum dipetakan untuk entitas [%]. Isi dulu pemetaannya (tabel account_role_mappings) sebelum menerbitkan invoice atau mencatat pembayaran - hubungi Finance Controller.',
      p_role_key, COALESCE(v_entity_code, p_company_id::text);
  END IF;

  -- Akun yang dipetakan tapi sudah di-soft-delete = keadaan yang HARUS berbunyi.
  -- Kalau dibiarkan lewat, jurnalnya mendarat ke akun yang sudah dipensiunkan.
  SELECT c.deleted_at INTO v_deleted
    FROM chart_of_accounts c WHERE c.id = v_account_id;

  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Peran akun [%] di entitas [%] menunjuk akun yang sudah dihapus (deleted_at %). Petakan ulang ke akun yang aktif.',
      p_role_key, COALESCE(v_entity_code, p_company_id::text), v_deleted;
  END IF;

  RETURN v_account_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_mapped_account(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mapped_account(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_mapped_account(uuid, text) IS
  'Mengembalikan account_id untuk (entitas, peran). Gagal dengan pesan jelas kalau belum dipetakan atau akunnya sudah dihapus. AR Tahap 2, 20260927000002.';

-- ---------------------------------------------------------------------------
-- SEED -- dari kode yang dipakai hari ini.
-- ON CONFLICT DO NOTHING: idempoten, dan pemetaan yang sudah disunting manusia
-- TIDAK ditimpa oleh eksekusi ulang.
-- ---------------------------------------------------------------------------
INSERT INTO public.account_role_mappings (company_id, role_key, account_id)
SELECT c.company_id, m.role_key, c.id
  FROM chart_of_accounts c
  JOIN (VALUES
    ('1-1200', 'piutang_usaha'),
    ('2-1200', 'ppn_keluaran'),
    ('4-1000', 'pendapatan_barang'),
    ('4-1100', 'pendapatan_jasa_kirim'),
    ('1-1101', 'kas_bank'),
    ('1-1300', 'pph23_dibayar_dimuka')
  ) AS m(code, role_key) ON m.code = c.code
 WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, role_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- V1 -- sesudah. Asersi intinya BUKTI IDENTITAS: untuk setiap baris pemetaan,
-- get_mapped_account() harus mengembalikan akun yang SAMA dengan hasil lookup
-- kode lama. Itu yang membuat butir 3 aman -- tanpa ini, "jurnalnya identik"
-- cuma harapan.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_baris     int;
  v_entitas   int;
  v_beda      int;
  v_kode_yatim int;
  r           record;
BEGIN
  SELECT count(*), count(DISTINCT company_id) INTO v_baris, v_entitas
    FROM account_role_mappings;

  -- Bukti identitas: helper vs lookup kode lama, untuk seluruh baris.
  SELECT count(*) INTO v_beda
    FROM account_role_mappings m
    JOIN (VALUES
      ('1-1200', 'piutang_usaha'),
      ('2-1200', 'ppn_keluaran'),
      ('4-1000', 'pendapatan_barang'),
      ('4-1100', 'pendapatan_jasa_kirim'),
      ('1-1101', 'kas_bank'),
      ('1-1300', 'pph23_dibayar_dimuka')
    ) AS peta(code, role_key) ON peta.role_key = m.role_key
   WHERE get_mapped_account(m.company_id, m.role_key) IS DISTINCT FROM (
     SELECT c.id FROM chart_of_accounts c
      WHERE c.company_id = m.company_id AND c.code = peta.code AND c.deleted_at IS NULL
   );

  IF v_beda > 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: % baris pemetaan tidak mengembalikan akun yang sama dengan lookup kode lama. JANGAN jalankan butir 3.', v_beda;
  END IF;

  -- Kode yang ada di CoA tapi tidak punya baris pemetaan -- bukan kegagalan,
  -- tapi wajib terbaca: itulah daftar yang akan membuat butir 3 gagal keras.
  SELECT count(*) INTO v_kode_yatim
    FROM chart_of_accounts c
    JOIN (VALUES ('1-1200'),('2-1200'),('4-1000'),('4-1100'),('1-1101'),('1-1300')) AS k(code)
      ON k.code = c.code
   WHERE c.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM account_role_mappings m WHERE m.account_id = c.id);

  RAISE NOTICE 'V1 LOLOS: % baris pemetaan di % entitas; bukti identitas helper vs kode lama = 0 selisih; kode ber-CoA tanpa pemetaan = %.',
    v_baris, v_entitas, v_kode_yatim;

  FOR r IN
    SELECT co.code AS entitas, m.role_key, c.code AS kode_akun, c.name AS nama_akun
      FROM account_role_mappings m
      JOIN companies co ON co.id = m.company_id
      JOIN chart_of_accounts c ON c.id = m.account_id
     ORDER BY co.code, m.role_key
  LOOP
    RAISE NOTICE 'V1 peta: % / % -> % (%)', r.entitas, r.role_key, r.kode_akun, r.nama_akun;
  END LOOP;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- hanya SAH kalau butir 3 belum jalan atau sudah dibalik lebih dulu.
--
--   DROP FUNCTION IF EXISTS public.get_mapped_account(uuid, text);
--   DROP TABLE IF EXISTS public.account_role_mappings;
--
-- ⛔ Kalau butir 3 sudah jalan, menjalankan ini akan membuat SETIAP penerbitan
-- invoice dan pencatatan pembayaran gagal keras ("function get_mapped_account
-- does not exist"). Urutan membalikkannya: butir 3 dulu, baru berkas ini.
-- =============================================================================
