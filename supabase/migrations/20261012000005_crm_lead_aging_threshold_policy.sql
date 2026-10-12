-- =============================================================================
-- 20261012000005_crm_lead_aging_threshold_policy.sql
--
-- Batch DS 3 Lead Management, irisan 8 Paket 2 -- file 1/2 (kebijakan
-- ambang). Dibaca oleh Edge Function aging-pipeline (file 2, ditulis ulang
-- di commit yang sama) -- nol FK langsung ke migrasi 20261012000001/
-- ...000003 (is_stale/stale_flagged_at/aging_baseline_at), hanya hubungan
-- LOGIS lewat kode EF.
--
-- Status: BELUM DIJALANKAN.
--
-- KEPUTUSAN Den (irisan 8): penuaan TIDAK LAGI memindahkan lead ke Lead
-- Pool. Penuaan sekarang HANYA menandai stale (accounts.is_stale/
-- stale_flagged_at) + notifikasi ke pemilik. Kepemilikan TIDAK PERNAH
-- berubah karena penuaan -- beda total dari mekanisme lama (AGING_RULES di
-- aging-pipeline/index.ts, dihapus di file 2). Ambang hari diam per
-- entitas kini disimpan di sla_policies (baris ini), BUKAN hardcode di
-- kode Edge Function -- supaya ambangnya bisa diubah per entitas tanpa
-- deploy ulang.
--
-- !! PELEBARAN CONSTRAINT, DISETUJUI Den -- sla_policies SEBELUM file ini
--    menampung TEPAT TIGA jenis kebijakan (migrasi 20260827000001,
--    komentar header persis: "sla_policies (PER-ENTITAS, TIGA jenis
--    kebijakan dalam satu tabel)"): prf_response, deal_aging,
--    account_dormancy. 'lead_aging' adalah jenis KEEMPAT -- ditolak DUA
--    constraint SEBELUM file ini:
--      sla_policies_type_check -- daftar policy_type yang diizinkan belum
--        memuat 'lead_aging'.
--      sla_policies_axis_check -- tiga cabang OR-nya terikat ke tiga
--        policy_type lama; policy_type lain (termasuk 'lead_aging') jatuh
--        ke "tidak ada cabang yang cocok" = constraint gagal, TERLEPAS
--        dari isi transport_mode/target_status/target_scope.
--    Kedua ALTER di bawah MELEBARKAN (menambah nilai/cabang), TIDAK
--    mempersempit apa pun untuk ketiga jenis lama -- baris
--    prf_response/deal_aging/account_dormancy yang sudah hidup di
--    produksi/staging tidak terdampak sama sekali. Cabang baru
--    'lead_aging' SENGAJA mensyaratkan transport_mode/target_status/
--    target_scope SEMUANYA NULL -- kebijakan ini murni company+threshold,
--    nol sumbu tambahan (beda dari deal_aging yang butuh target_status
--    NOT NULL, atau account_dormancy yang butuh target_scope NOT NULL).
--    action='flag_stale' dan time_unit='day' SUDAH diizinkan
--    sla_policies_action_check/sla_policies_unit_check SEBELUM file ini
--    (dirancang 27 Agu 2026, baru terpakai sekarang) -- TIDAK disentuh.
--
-- Baris yang diseed: SATU per company AKTIF (is_active=true -- companies
-- TIDAK punya kolom deleted_at, lihat schema_snapshot.sql:7318-7343, jadi
-- "aktif" di sini = is_active, bukan soft-delete), code 'LEAD_STALE',
-- threshold 14 hari, time_unit 'day', action 'flag_stale',
-- requires_human false, is_active true. Idempoten lewat
-- ON CONFLICT (company_id, code) WHERE (deleted_at IS NULL) -- predikat
-- PERSIS index unik sla_policies_company_code_uidx (schema_snapshot.sql:
-- 13684-13687, dicek langsung ke definisinya, bukan diasumsikan).
-- =============================================================================

BEGIN;

-- Lebarkan sla_policies_type_check: +'lead_aging'.
ALTER TABLE public.sla_policies DROP CONSTRAINT sla_policies_type_check;
ALTER TABLE public.sla_policies ADD CONSTRAINT sla_policies_type_check
  CHECK (((policy_type)::text = ANY (ARRAY[
    'prf_response'::character varying,
    'deal_aging'::character varying,
    'account_dormancy'::character varying,
    'lead_aging'::character varying
  ]::character varying[])::text[]));

-- Lebarkan sla_policies_axis_check: +cabang keempat utk 'lead_aging'
-- (transport_mode/target_status/target_scope semuanya NULL).
ALTER TABLE public.sla_policies DROP CONSTRAINT sla_policies_axis_check;
ALTER TABLE public.sla_policies ADD CONSTRAINT sla_policies_axis_check
  CHECK (
       ((((policy_type)::text = 'prf_response'::text) AND (transport_mode IS NOT NULL) AND (target_status IS NULL) AND (target_scope IS NULL)))
    OR ((((policy_type)::text = 'deal_aging'::text) AND (target_status IS NOT NULL) AND (target_scope IS NULL)))
    OR ((((policy_type)::text = 'account_dormancy'::text) AND (target_scope IS NOT NULL) AND (transport_mode IS NULL) AND (target_status IS NULL)))
    OR ((((policy_type)::text = 'lead_aging'::text) AND (transport_mode IS NULL) AND (target_status IS NULL) AND (target_scope IS NULL)))
  );

-- Seed LEAD_STALE, satu baris per company AKTIF. Idempoten.
INSERT INTO public.sla_policies (
  company_id, code, name, policy_type, threshold, time_unit, action,
  requires_human, is_active, description
)
SELECT
  c.id,
  'LEAD_STALE',
  'Ambang Diam Lead/MQL',
  'lead_aging',
  14,
  'day',
  'flag_stale',
  false,
  true,
  'Lead/MQL yang diam lebih dari ambang ini (hari) ditandai stale (is_stale=true) dan pemiliknya dinotifikasi. Kepemilikan TIDAK berubah -- penuaan tidak lagi memindahkan ke Lead Pool. Dibaca Edge Function aging-pipeline.'
FROM public.companies c
WHERE c.is_active = true
ON CONFLICT (company_id, code) WHERE (deleted_at IS NULL) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.sla_policies'::regclass
--    AND conname IN ('sla_policies_type_check','sla_policies_axis_check')
--  ORDER BY conname;
-- -- Harap: sla_policies_type_check memuat 'lead_aging' di daftar ARRAY;
-- --        sla_policies_axis_check memuat cabang keempat
-- --        "policy_type = 'lead_aging' AND transport_mode IS NULL AND
-- --        target_status IS NULL AND target_scope IS NULL".
--
-- SELECT company_id, code, policy_type, threshold, time_unit, action,
--        requires_human, is_active
--   FROM public.sla_policies
--  WHERE policy_type = 'lead_aging' AND code = 'LEAD_STALE'
--  ORDER BY company_id;
-- -- Harap: SATU baris per company is_active=true, threshold=14,
-- --        time_unit='day', action='flag_stale', requires_human=false,
-- --        is_active=true. Jumlah baris = jumlah company is_active=true
-- --        (SELECT count(*) FROM public.companies WHERE is_active = true).
--
-- -- Idempoten -- jalankan ULANG persis INSERT di atas (seluruh blok SELECT
-- -- ... FROM companies ... ON CONFLICT ... DO NOTHING), harap 0 baris baru
-- -- (RETURNING * pada percobaan kedua harus kosong).
--
-- -- Ketiga jenis lama TIDAK terdampak -- harap jumlah baris sama persis
-- -- sebelum/sesudah migrasi ini:
-- SELECT policy_type, count(*) FROM public.sla_policies
--  WHERE policy_type IN ('prf_response','deal_aging','account_dormancy')
--  GROUP BY policy_type ORDER BY policy_type;
-- =============================================================================

-- =============================================================================
-- ROLLBACK (urutan WAJIB: hapus baris 'lead_aging' DULU, baru persempit
-- constraint -- mempersempit sebelum baris dihapus akan GAGAL, karena
-- baris 'lead_aging' yang masih ada melanggar constraint yang sudah
-- dipersempit):
--
--   DELETE FROM public.sla_policies
--    WHERE policy_type = 'lead_aging' AND code = 'LEAD_STALE';
--
--   ALTER TABLE public.sla_policies DROP CONSTRAINT sla_policies_axis_check;
--   ALTER TABLE public.sla_policies ADD CONSTRAINT sla_policies_axis_check
--     CHECK (
--          ((((policy_type)::text = 'prf_response'::text) AND (transport_mode IS NOT NULL) AND (target_status IS NULL) AND (target_scope IS NULL)))
--       OR ((((policy_type)::text = 'deal_aging'::text) AND (target_status IS NOT NULL) AND (target_scope IS NULL)))
--       OR ((((policy_type)::text = 'account_dormancy'::text) AND (target_scope IS NOT NULL) AND (transport_mode IS NULL) AND (target_status IS NULL)))
--     );
--
--   ALTER TABLE public.sla_policies DROP CONSTRAINT sla_policies_type_check;
--   ALTER TABLE public.sla_policies ADD CONSTRAINT sla_policies_type_check
--     CHECK (((policy_type)::text = ANY (ARRAY[
--       'prf_response'::character varying,
--       'deal_aging'::character varying,
--       'account_dormancy'::character varying
--     ]::character varying[])::text[]));
-- =============================================================================
