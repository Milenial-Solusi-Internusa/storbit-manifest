-- =============================================================================
-- 20261012000009_crm_lead_pool_legacy_cleanup.sql
--
-- Pembersihan pool LAMA: 1.183 akun production (is_in_lead_pool = true,
-- deleted_at NULL) lahir dari mekanisme penuaan cara lama, yang tidak
-- mengosongkan assigned_to saat memasukkan akun ke pool. Aturan BARU (migrasi
-- 20261012000001 dst.): pool = akun TANPA pemilik. Migrasi ini menyelaraskan
-- 1.183 akun lama itu ke aturan baru, satu kali, dalam satu transaksi.
--
-- Status: JALAN DI STAGING 12 Okt 2026. BELUM DI PRODUCTION.
--
-- PRASYARAT: file 20261012000001 s/d 20261012000005 HARUS sudah jalan lebih
-- dulu -- migrasi ini butuh tabel account_pool_history dan kolom
-- lead_pool_last_owner, keduanya lahir di 20261012000001. Tanpa itu, setiap
-- statement di bawah yang menyentuh dua objek itu gagal langsung.
--
-- URUTAN PRODUCTION LENGKAP (mengikat): 1, 2, 3, 4, 5, 9, 6, 7, 8 -- migrasi
-- ini (9) WAJIB jalan SEBELUM 20261012000006, karena DUA alasan:
--   a. Trigger trg_block_inquiry_for_pooled_account (file 6) menolak inquiry
--      baru untuk akun is_in_lead_pool = true APAPUN status pemiliknya;
--      kalau file 6 jalan duluan, akun pool lama yang masih berpemilik akan
--      mendadak tidak bisa dipakai membuat inquiry baru sampai migrasi ini
--      menyusul.
--   b. Migrasi ini JUGA melebarkan account_pool_history_event_type_check
--      (+'legacy_pool_exit') dan menulis ±1.079 baris bertipe itu. File 6
--      melakukan DROP+ADD CONSTRAINT-nya SENDIRI (+'assign'+'auto_release')
--      -- daftarnya di file 6 SUDAH dikoreksi memuat 'legacy_pool_exit'
--      (sembilan nilai total), jadi urutan 9-lalu-6 maupun 6-lalu-9 kini
--      SAMA-SAMA aman khusus untuk constraint ini (keduanya ADD CONSTRAINT
--      ke daftar sembilan nilai yang identik -- melebarkan ke superset
--      yang sama tidak peka urutan). Alasan (a) di atas -- trigger blokir
--      inquiry -- tetap SATU-SATUNYA alasan urutan 9-sebelum-6 mengikat;
--      poin (b) ini murni dokumentasi supaya histori "kenapa daftarnya
--      sembilan nilai, bukan delapan" tetap terbaca dari kedua file.
--
-- Kondisi production per 12 Okt 2026 (dilaporkan Den, DIVERIFIKASI ULANG
-- oleh SELECT "hitung SEBELUM" di bawah, bukan dipercaya mentah -- angka di
-- komentar ini bisa basi begitu waktu berjalan):
--   1. Pemilik aktif    : 1.079 (lead 691, mql 137, prospect 202, sql 47,
--                          customer 2). 28 di antaranya pull_status pending.
--   2. Pemilik nonaktif : 103 (lead 12, mql 27, prospect 10, sql 54).
--   3. Tanpa pemilik    : 1 prospect dengan inquiry terbuka.
--
-- =============================================================================
-- RINGKASAN PERUBAHAN
-- =============================================================================
-- 0. Backup accounts_lead_pool_backup_20261012 -- seluruh kolom pool/pull +
--    assigned_to (bukan nama "pool" tapi WAJIB ikut -- itulah kolom yang
--    diubah kelompok 2/3, dan satu-satunya cara rollback tahu pemilik
--    semula) + lifecycle_stage (konteks saja, TIDAK direstore -- tidak
--    pernah diubah migrasi ini).
--
-- 1. Kelompok 1 (pemilik AKTIF) -- keluar dari pool, assigned_to TETAP:
--    is_in_lead_pool=false, lead_pool_reason/lead_pool_at/lead_pool_last_
--    owner dan SELURUH pull_* NULL. 28 pull pending ditutup + pengajunya
--    dinotifikasi (best-effort) SEBELUM kolomnya dikosongkan.
--
-- 2. Kelompok 2/3 (pemilik NONAKTIF / tanpa pemilik) -- ikuti aturan sweep
--    lead_pool_sweep_deactivated_owner PERSIS (WHERE NOT EXISTS inquiry/
--    quotation terbuka disalin verbatim dari migrasi 20261012000002), tapi
--    lewat UPDATE set-based, BUKAN memanggil ulang RPC sweep -- RPC itu
--    tidak dibatasi ke akun yang sedang di pool (WHERE-nya cuma
--    assigned_to = p_user_id), jadi memanggilnya per pemilik nonaktif akan
--    ikut menyentuh akun MILIK pemilik itu yang BUKAN bagian dari 1.183
--    akun ini, dan memicu notifikasi "Lead Pool Sweep: X deactivated"
--    (migrasi 20261012000008) yang salah konteks (pemiliknya bisa sudah
--    nonaktif lama, bukan baru saja).
--      a. lead/mql TANPA inquiry/quotation terbuka -> TETAP di pool, TANPA
--         pemilik (assigned_to NULL, lead_pool_last_owner terisi).
--         pull_* TIDAK disentuh -- sweep kasus 1 juga tidak menyentuhnya
--         (akun ini tetap di pool, pull yang mungkin sedang berjalan tetap
--         sah). Dihitung SEBELUM (harap 0): kalau ada, dilaporkan lewat
--         SELECT, bukan diam-diam dibiarkan atau dihapus.
--      b. Sisanya (bukan lead/mql, ATAU ada inquiry/quotation terbuka, ATAU
--         lifecycle lost/free_agent -- guard terakhir ini juga disalin dari
--         sweep kasus 2, sweep sendiri tidak menyentuh lost/free_agent) ->
--         KELUAR pool (is_in_lead_pool=false), assigned_to NULL,
--         lead_pool_last_owner terisi. ⛔ BERBEDA dari sweep (yang tidak
--         menyentuh pull_*): SELURUH pull_* di sini DIKOSONGKAN JUGA
--         (koreksi Den) -- akun yang sudah keluar pool tidak boleh
--         menyisakan status tarikan.
--
-- 3. account_pool_history untuk SETIAP akun yang tersentuh, actor_id NULL
--    (sistem), reason berprefiks 'Pembersihan pool lama:' (dipakai sebagai
--    penanda lewat query, bukan kolom/timestamp terpisah -- lihat
--    verifikasi). event_type kelompok 1 = 'legacy_pool_exit' (BARU --
--    delapan tipe yang ada tidak ada yang cocok; 'release' artinya
--    JUSTRU kebalikannya, akun MASUK pool). event_type kelompok 2a/2b =
--    'enter_pool'/'owner_cleared' -- SAMA dengan vokabuler sweep, sesuai
--    instruksi "ikuti aturan sweep yang sama".
--
-- 4. Hitung SEBELUM dan SESUDAH dikembalikan sebagai SELECT (bisa dibaca
--    dari SQL Editor atau tool apa pun), bukan hanya RAISE NOTICE.
--
-- 5. trg_b_lead_pool_auto_release TIDAK PERNAH menyala -- dibuktikan dari
--    WHEN clause-nya (migrasi 20261012000006): hanya menyala kalau
--    NEW.lifecycle_stage berubah jadi 'lost' atau NEW.deleted_at baru
--    terisi. Migrasi ini TIDAK PERNAH menyentuh lifecycle_stage maupun
--    deleted_at di SET clause manapun, jadi kedua cabang WHEN selalu
--    false. Dua trigger BEFORE UPDATE lain di accounts
--    (trg_a_sync_lifecycle_columns, trg_z_track_stage_change) juga hanya
--    bereaksi kalau lifecycle_stage/account_status/pipeline_stage
--    berubah -- tidak pernah terjadi di sini, jadi stage_changed_at juga
--    aman tanpa penjagaan manual tambahan.
--
-- 6. RLS tidak relevan -- migrasi ini jalan sebagai postgres di SQL
--    Editor, bukan lewat PostgREST/API. Baris account_pool_history baru
--    (actor_id NULL) terlihat admin HANYA lewat has_menu_permission_in
--    (company_id, 'crm_lead_pool_approval', 'view') -- sama persis dengan
--    baris auto_release yang sudah ada, bukan risiko baru.
--
-- Versi UJI COBA (dry-run, berakhir ROLLBACK, tabel backup berakhiran
-- _dryrun) ada di blok komentar terpisah di akhir file -- untuk dijalankan
-- di production guna membandingkan angka sebelum/sesudah TANPA menyimpan
-- apa pun.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. BACKUP
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.accounts_lead_pool_backup_20261012 AS
SELECT
  id, company_id, assigned_to, lifecycle_stage,
  is_in_lead_pool, lead_pool_reason, lead_pool_at, lead_pool_last_owner,
  pull_status, pull_justification, pull_requested_at, pull_requested_by,
  pull_approved_by, pull_approved_at, pull_rejection_reason
FROM public.accounts
WHERE is_in_lead_pool = true AND deleted_at IS NULL;

COMMENT ON TABLE public.accounts_lead_pool_backup_20261012 IS 'Snapshot SEBELUM pembersihan pool lama (migrasi 20261012000009), 12 Okt 2026. lifecycle_stage disertakan sbg konteks saja -- TIDAK direstore oleh blok ROLLBACK (migrasi ini tidak pernah mengubahnya). Hapus tabel ini setelah cukup yakin pembersihan tidak perlu dibalik.';

-- ─────────────────────────────────────────────────────────────────────────
-- HITUNG SEBELUM (SELECT -- bukan RAISE NOTICE, supaya terbaca dari tool
-- apa pun). Rincian per kelompok x lifecycle_stage, plus jumlah pull
-- pending per kelompok -- verifikasi angka 1.079/103/1/28 di header,
-- sekaligus mengungkap kalau ada baris lost/free_agent yang tersisa
-- tersembunyi (sweep sendiri tidak menyentuh keduanya -- lihat §2b).
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  CASE
    WHEN a.assigned_to IS NULL THEN 'tanpa_pemilik'
    WHEN p.active THEN 'pemilik_aktif'
    ELSE 'pemilik_nonaktif'
  END AS kelompok,
  a.lifecycle_stage,
  count(*) AS jumlah,
  count(*) FILTER (WHERE a.pull_status = 'pending') AS pull_pending
FROM public.accounts a
LEFT JOIN public.profiles p ON p.id = a.assigned_to
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Lebarkan CHECK account_pool_history.event_type +'legacy_pool_exit'
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.account_pool_history DROP CONSTRAINT account_pool_history_event_type_check;
ALTER TABLE public.account_pool_history ADD CONSTRAINT account_pool_history_event_type_check
  CHECK (event_type IN ('enter_pool', 'release', 'request_pull', 'approve_pull', 'reject_pull',
                         'owner_cleared', 'assign', 'auto_release', 'legacy_pool_exit'));

-- ─────────────────────────────────────────────────────────────────────────
-- 1. KELOMPOK 1 -- pemilik AKTIF: riwayat + notifikasi pull pending DULU
-- (sebelum kolomnya dikosongkan), baru UPDATE.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, new_owner, reason)
SELECT a.id, a.company_id, 'legacy_pool_exit', NULL, a.assigned_to,
       'Pembersihan pool lama: akun punya pemilik aktif, dikeluarkan dari pool (assigned_to tetap)'
FROM public.accounts a
JOIN public.profiles p ON p.id = a.assigned_to
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL AND p.active = true;

-- Notifikasi best-effort ke pengaju pull pending yang ditutup -- pola sama
-- dengan lead_pool_reject_pull / trg_fn_lead_pool_auto_release.
DO $$
BEGIN
  INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
  SELECT a.company_id, a.pull_requested_by, 'lead_pool_pull_result', 'Pull Request Closed',
         'Your pull request for ' || a.name || ' was closed because the account was returned to its active owner during a Lead Pool data cleanup.',
         'lead_pool', a.id
  FROM public.accounts a
  JOIN public.profiles p ON p.id = a.assigned_to
  WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL AND p.active = true
    AND a.pull_status = 'pending' AND a.pull_requested_by IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

UPDATE public.accounts a
SET is_in_lead_pool       = false,
    lead_pool_reason      = NULL,
    lead_pool_at          = NULL,
    lead_pool_last_owner  = NULL,
    pull_status           = NULL,
    pull_justification    = NULL,
    pull_requested_at     = NULL,
    pull_requested_by     = NULL,
    pull_approved_by      = NULL,
    pull_approved_at      = NULL,
    pull_rejection_reason = NULL
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
  AND a.assigned_to IN (SELECT id FROM public.profiles WHERE active = true);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. KELOMPOK 2/3 -- pemilik NONAKTIF / tanpa pemilik. Riwayat DULU
-- (sebelum assigned_to dikosongkan), baru UPDATE. Kondisi WHERE disalin
-- verbatim dari lead_pool_sweep_deactivated_owner (migrasi 20261012000002).
-- ─────────────────────────────────────────────────────────────────────────

-- 2a. lead/mql TANPA inquiry/quotation terbuka -> TETAP di pool, TANPA pemilik.
INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
SELECT a.id, a.company_id, 'enter_pool', NULL, a.assigned_to,
       'Pembersihan pool lama: pemilik nonaktif/tanpa pemilik, tanpa inquiry/quotation terbuka -> tetap di pool tanpa pemilik'
FROM public.accounts a
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
  AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
  AND a.lifecycle_stage IN ('lead', 'mql')
  AND NOT EXISTS (
    SELECT 1 FROM public.inquiries i
    WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
      AND i.deleted_at IS NULL
      AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
      AND q.deleted_at IS NULL
      AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
  );

-- 2b. Sisanya -> KELUAR pool. lifecycle_stage NOT IN ('lost','free_agent')
-- disalin dari sweep kasus 2 -- kalau ada baris lost/free_agent di sini
-- (harap 0, lihat hitung SEBELUM), sweep sendiri juga tidak menyentuhnya,
-- jadi baris itu akan TETAP di pool dengan pemilik nonaktif, TIDAK ikut 2a
-- maupun 2b -- residu yang sama dengan batas sweep, bukan gap baru.
INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
SELECT a.id, a.company_id, 'owner_cleared', NULL, a.assigned_to,
       'Pembersihan pool lama: pemilik nonaktif/tanpa pemilik, ada inquiry/quotation terbuka atau bukan lead/mql -> dikeluarkan dari pool'
FROM public.accounts a
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
  AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
  AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
  AND NOT (
    a.lifecycle_stage IN ('lead', 'mql')
    AND NOT EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
        AND i.deleted_at IS NULL
        AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
        AND q.deleted_at IS NULL
        AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
    )
  );

-- UPDATE 2a -- tetap di pool, tanpa pemilik. pull_* SENGAJA TIDAK disentuh
-- (lihat §2a di RINGKASAN).
UPDATE public.accounts a
SET assigned_to          = NULL,
    lead_pool_last_owner = COALESCE(a.assigned_to, a.lead_pool_last_owner)
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
  AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
  AND a.lifecycle_stage IN ('lead', 'mql')
  AND NOT EXISTS (
    SELECT 1 FROM public.inquiries i
    WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
      AND i.deleted_at IS NULL
      AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
      AND q.deleted_at IS NULL
      AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
  );

-- UPDATE 2b -- keluar pool. ⛔ KOREKSI Den: pull_* DIKOSONGKAN JUGA di sini
-- (beda dari sweep, yang tidak menyentuhnya) -- akun yang sudah keluar
-- pool tidak boleh menyisakan status tarikan.
UPDATE public.accounts a
SET is_in_lead_pool       = false,
    assigned_to           = NULL,
    lead_pool_last_owner  = COALESCE(a.assigned_to, a.lead_pool_last_owner),
    pull_status           = NULL,
    pull_justification    = NULL,
    pull_requested_at     = NULL,
    pull_requested_by     = NULL,
    pull_approved_by      = NULL,
    pull_approved_at      = NULL,
    pull_rejection_reason = NULL
WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
  AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
  AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
  AND NOT (
    a.lifecycle_stage IN ('lead', 'mql')
    AND NOT EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
        AND i.deleted_at IS NULL
        AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
        AND q.deleted_at IS NULL
        AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- HITUNG SESUDAH (SELECT). Dibandingkan ke backup, bukan ke accounts saat
-- ini saja -- supaya akun yang SUDAH keluar pool (tidak lagi is_in_lead_
-- pool=true) tetap terhitung lewat id yang ada di backup.
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  CASE
    WHEN a.is_in_lead_pool AND a.assigned_to IS NULL THEN 'pool_tanpa_pemilik (benar, aturan baru)'
    WHEN a.is_in_lead_pool AND a.assigned_to IS NOT NULL THEN 'pool_DENGAN_pemilik (harap 0 -- residu lost/free_agent, lihat §2b)'
    ELSE 'sudah_keluar_pool'
  END AS kelompok,
  count(*) AS jumlah
FROM public.accounts a
WHERE a.id IN (SELECT id FROM public.accounts_lead_pool_backup_20261012)
GROUP BY 1
ORDER BY 1;

-- Jumlah baris account_pool_history yang ditulis migrasi ini (penanda =
-- prefix reason, bukan kolom/timestamp terpisah).
SELECT event_type, count(*) AS jumlah
FROM public.account_pool_history
WHERE reason LIKE 'Pembersihan pool lama:%'
GROUP BY event_type
ORDER BY event_type;

COMMIT;

-- =============================================================================
-- VERIFIKASI
-- =============================================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'account_pool_history_event_type_check';
-- -- Harap memuat 'legacy_pool_exit'.
--
-- SELECT count(*) FROM public.accounts
--  WHERE is_in_lead_pool = true AND deleted_at IS NULL AND assigned_to IS NOT NULL
--    AND assigned_to IN (SELECT id FROM public.profiles WHERE active = true);
-- -- Harap 0 -- nol akun pool lagi yang masih berpemilik aktif.
--
-- SELECT count(*) FROM public.accounts_lead_pool_backup_20261012;
-- -- Harap 1183 (atau jumlah aktual dari hitung SEBELUM kalau sudah berubah
-- -- sejak 12 Okt 2026).
-- =============================================================================

-- =============================================================================
-- ROLLBACK (restore dari backup -- urutan WAJIB: kembalikan accounts DULU,
-- baru persempit CHECK -- mempersempit dulu akan GAGAL selama baris
-- 'legacy_pool_exit' masih ada):
--
--   UPDATE public.accounts a SET
--     is_in_lead_pool = b.is_in_lead_pool, lead_pool_reason = b.lead_pool_reason,
--     lead_pool_at = b.lead_pool_at, lead_pool_last_owner = b.lead_pool_last_owner,
--     assigned_to = b.assigned_to, pull_status = b.pull_status,
--     pull_justification = b.pull_justification, pull_requested_at = b.pull_requested_at,
--     pull_requested_by = b.pull_requested_by, pull_approved_by = b.pull_approved_by,
--     pull_approved_at = b.pull_approved_at, pull_rejection_reason = b.pull_rejection_reason
--   FROM public.accounts_lead_pool_backup_20261012 b
--   WHERE a.id = b.id;
--
--   -- account_pool_history yang ditulis migrasi ini TIDAK otomatis terhapus
--   -- (nol kolom/timestamp penanda terpisah selain prefix reason) -- hapus
--   -- manual kalau benar-benar perlu:
--   --   DELETE FROM public.account_pool_history WHERE reason LIKE 'Pembersihan pool lama:%';
--
--   ALTER TABLE public.account_pool_history DROP CONSTRAINT account_pool_history_event_type_check;
--   ALTER TABLE public.account_pool_history ADD CONSTRAINT account_pool_history_event_type_check
--     CHECK (event_type IN ('enter_pool', 'release', 'request_pull', 'approve_pull', 'reject_pull',
--                            'owner_cleared', 'assign', 'auto_release'));
--
--   DROP TABLE public.accounts_lead_pool_backup_20261012;
-- =============================================================================

-- =============================================================================
-- VERSI UJI COBA (DRY-RUN) -- isi SAMA PERSIS dengan blok BEGIN...COMMIT di
-- atas, HANYA DUA beda: nama tabel backup berakhiran _dryrun, dan ditutup
-- ROLLBACK bukan COMMIT. Untuk dijalankan di production membandingkan angka
-- sebelum/sesudah TANPA menyimpan apa pun -- hapus komentar blok ini (buang
-- "-- " di awal tiap baris) sebelum dieksekusi, lalu biarkan ROLLBACK di
-- ujungnya membatalkan semuanya.
-- =============================================================================
--
-- BEGIN;
--
-- CREATE TABLE public.accounts_lead_pool_backup_20261012_dryrun AS
-- SELECT
--   id, company_id, assigned_to, lifecycle_stage,
--   is_in_lead_pool, lead_pool_reason, lead_pool_at, lead_pool_last_owner,
--   pull_status, pull_justification, pull_requested_at, pull_requested_by,
--   pull_approved_by, pull_approved_at, pull_rejection_reason
-- FROM public.accounts
-- WHERE is_in_lead_pool = true AND deleted_at IS NULL;
--
-- SELECT
--   CASE
--     WHEN a.assigned_to IS NULL THEN 'tanpa_pemilik'
--     WHEN p.active THEN 'pemilik_aktif'
--     ELSE 'pemilik_nonaktif'
--   END AS kelompok,
--   a.lifecycle_stage,
--   count(*) AS jumlah,
--   count(*) FILTER (WHERE a.pull_status = 'pending') AS pull_pending
-- FROM public.accounts a
-- LEFT JOIN public.profiles p ON p.id = a.assigned_to
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
-- GROUP BY 1, 2
-- ORDER BY 1, 2;
--
-- ALTER TABLE public.account_pool_history DROP CONSTRAINT account_pool_history_event_type_check;
-- ALTER TABLE public.account_pool_history ADD CONSTRAINT account_pool_history_event_type_check
--   CHECK (event_type IN ('enter_pool', 'release', 'request_pull', 'approve_pull', 'reject_pull',
--                          'owner_cleared', 'assign', 'auto_release', 'legacy_pool_exit'));
--
-- INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, new_owner, reason)
-- SELECT a.id, a.company_id, 'legacy_pool_exit', NULL, a.assigned_to,
--        'Pembersihan pool lama: akun punya pemilik aktif, dikeluarkan dari pool (assigned_to tetap)'
-- FROM public.accounts a
-- JOIN public.profiles p ON p.id = a.assigned_to
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL AND p.active = true;
--
-- DO $$
-- BEGIN
--   INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
--   SELECT a.company_id, a.pull_requested_by, 'lead_pool_pull_result', 'Pull Request Closed',
--          'Your pull request for ' || a.name || ' was closed because the account was returned to its active owner during a Lead Pool data cleanup.',
--          'lead_pool', a.id
--   FROM public.accounts a
--   JOIN public.profiles p ON p.id = a.assigned_to
--   WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL AND p.active = true
--     AND a.pull_status = 'pending' AND a.pull_requested_by IS NOT NULL;
-- EXCEPTION WHEN OTHERS THEN NULL;
-- END $$;
--
-- UPDATE public.accounts a
-- SET is_in_lead_pool       = false,
--     lead_pool_reason      = NULL,
--     lead_pool_at          = NULL,
--     lead_pool_last_owner  = NULL,
--     pull_status           = NULL,
--     pull_justification    = NULL,
--     pull_requested_at     = NULL,
--     pull_requested_by     = NULL,
--     pull_approved_by      = NULL,
--     pull_approved_at      = NULL,
--     pull_rejection_reason = NULL
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
--   AND a.assigned_to IN (SELECT id FROM public.profiles WHERE active = true);
--
-- INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
-- SELECT a.id, a.company_id, 'enter_pool', NULL, a.assigned_to,
--        'Pembersihan pool lama: pemilik nonaktif/tanpa pemilik, tanpa inquiry/quotation terbuka -> tetap di pool tanpa pemilik'
-- FROM public.accounts a
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
--   AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
--   AND a.lifecycle_stage IN ('lead', 'mql')
--   AND NOT EXISTS (
--     SELECT 1 FROM public.inquiries i
--     WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
--       AND i.deleted_at IS NULL
--       AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
--   )
--   AND NOT EXISTS (
--     SELECT 1 FROM public.quotations q
--     WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
--       AND q.deleted_at IS NULL
--       AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
--   );
--
-- INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
-- SELECT a.id, a.company_id, 'owner_cleared', NULL, a.assigned_to,
--        'Pembersihan pool lama: pemilik nonaktif/tanpa pemilik, ada inquiry/quotation terbuka atau bukan lead/mql -> dikeluarkan dari pool'
-- FROM public.accounts a
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
--   AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
--   AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
--   AND NOT (
--     a.lifecycle_stage IN ('lead', 'mql')
--     AND NOT EXISTS (
--       SELECT 1 FROM public.inquiries i
--       WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
--         AND i.deleted_at IS NULL
--         AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
--     )
--     AND NOT EXISTS (
--       SELECT 1 FROM public.quotations q
--       WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
--         AND q.deleted_at IS NULL
--         AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
--     )
--   );
--
-- UPDATE public.accounts a
-- SET assigned_to          = NULL,
--     lead_pool_last_owner = COALESCE(a.assigned_to, a.lead_pool_last_owner)
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
--   AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
--   AND a.lifecycle_stage IN ('lead', 'mql')
--   AND NOT EXISTS (
--     SELECT 1 FROM public.inquiries i
--     WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
--       AND i.deleted_at IS NULL
--       AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
--   )
--   AND NOT EXISTS (
--     SELECT 1 FROM public.quotations q
--     WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
--       AND q.deleted_at IS NULL
--       AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
--   );
--
-- UPDATE public.accounts a
-- SET is_in_lead_pool       = false,
--     assigned_to           = NULL,
--     lead_pool_last_owner  = COALESCE(a.assigned_to, a.lead_pool_last_owner),
--     pull_status           = NULL,
--     pull_justification    = NULL,
--     pull_requested_at     = NULL,
--     pull_requested_by     = NULL,
--     pull_approved_by      = NULL,
--     pull_approved_at      = NULL,
--     pull_rejection_reason = NULL
-- WHERE a.is_in_lead_pool = true AND a.deleted_at IS NULL
--   AND (a.assigned_to IS NULL OR a.assigned_to IN (SELECT id FROM public.profiles WHERE active = false))
--   AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
--   AND NOT (
--     a.lifecycle_stage IN ('lead', 'mql')
--     AND NOT EXISTS (
--       SELECT 1 FROM public.inquiries i
--       WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
--         AND i.deleted_at IS NULL
--         AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
--     )
--     AND NOT EXISTS (
--       SELECT 1 FROM public.quotations q
--       WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
--         AND q.deleted_at IS NULL
--         AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
--     )
--   );
--
-- SELECT
--   CASE
--     WHEN a.is_in_lead_pool AND a.assigned_to IS NULL THEN 'pool_tanpa_pemilik (benar, aturan baru)'
--     WHEN a.is_in_lead_pool AND a.assigned_to IS NOT NULL THEN 'pool_DENGAN_pemilik (harap 0 -- residu lost/free_agent, lihat §2b)'
--     ELSE 'sudah_keluar_pool'
--   END AS kelompok,
--   count(*) AS jumlah
-- FROM public.accounts a
-- WHERE a.id IN (SELECT id FROM public.accounts_lead_pool_backup_20261012_dryrun)
-- GROUP BY 1
-- ORDER BY 1;
--
-- SELECT event_type, count(*) AS jumlah
-- FROM public.account_pool_history
-- WHERE reason LIKE 'Pembersihan pool lama:%'
-- GROUP BY event_type
-- ORDER BY event_type;
--
-- ROLLBACK;
-- =============================================================================
