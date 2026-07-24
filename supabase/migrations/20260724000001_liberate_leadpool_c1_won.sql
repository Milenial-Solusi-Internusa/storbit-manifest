-- ============================================================================
-- Bebaskan 15 akun dari Lead Pool: 14 akun "hidup" (>=2 quotation) + 1 customer
-- WON yang nyasar. Tanggal: 2026-07-24
-- ============================================================================
--
-- ⚠️ FILE INI TIDAK IDEMPOTEN — rekaman SATU KALI JALAN, BUKAN skrip yang boleh
--    diulang. Predikat "count(quotations) >= 2" dievaluasi ulang tiap dijalankan,
--    jadi replay akan menyapu akun LAIN yang sementara sudah punya >=2 quotation
--    dan kebetulan di pool. CREATE TABLE IF NOT EXISTS juga akan MELEWATI backup
--    diam-diam kalau tabelnya sudah ada. JANGAN jalankan ulang di database yang
--    sama. Untuk environment baru, tinjau manual dulu.
--
-- KONTEKS:
-- Lanjutan dari fix aging Lead Pool (lihat 20260724000000). Setelah 27 korban
-- trap 'approved' dibebaskan, tersisa ~58 akun berdokumen yang ter-pool SEBELUM
-- fix EF. Keputusan bisnis (opsi C1): bebaskan hanya yang sinyal komitmennya kuat
-- (punya >=2 quotation hidup) + satu anomali customer WON yang seharusnya tak
-- pernah ada di pool. Sisanya (dokumen tipis / 1 quotation) SENGAJA dibiarkan;
-- pull_status-nya null sehingga sales bisa menariknya sendiri lewat UI.
--
-- Anomali INDO KARYA ANUGERAH: pipeline_stage=WON, account_status=customer, tapi
-- is_in_lead_pool=true. Customer WON tak boleh di Lead Pool. Ter-aging saat masih
-- PROPOSAL lalu maju ke WON tanpa flag pool ter-clear. Dibersihkan di sini;
-- pencegahan struktural (guard WON) dicatat sebagai tech debt terpisah.
--
-- Yang di-reset: is_in_lead_pool + jejak pool (lead_pool_at, lead_pool_reason).
-- Kolom pull_* TIDAK disentuh (akun ini pull_status-nya sudah null, bukan trap).
-- pipeline_stage & account_status TIDAK disentuh.
-- Akun pull_status='pending' DIKECUALIKAN (sedang menunggu approval).
--
-- CATATAN: SQL ini SUDAH dijalankan manual 2026-07-24; file ini rekaman jejak.
-- BACKUP 15 baris ada di public.backup_leadpool_c1_won_20260724.
-- Terverifikasi: 15 akun keluar, INDO KARYA bebas, won_di_pool=0, sisa_target=0.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.backup_leadpool_c1_won_20260724 AS
SELECT * FROM public.accounts a
WHERE a.is_in_lead_pool = true
  AND a.deleted_at IS NULL
  AND a.pull_status IS DISTINCT FROM 'pending'
  AND (
    a.pipeline_stage = 'WON'
    OR (SELECT count(*) FROM public.quotations q
        WHERE (q.prospect_id=a.id OR q.customer_id=a.id) AND q.deleted_at IS NULL) >= 2
  );

UPDATE public.accounts a
SET
  is_in_lead_pool  = false,
  lead_pool_at     = null,
  lead_pool_reason = null,
  updated_at       = now()
WHERE a.is_in_lead_pool = true
  AND a.deleted_at IS NULL
  AND a.pull_status IS DISTINCT FROM 'pending'
  AND (
    a.pipeline_stage = 'WON'
    OR (SELECT count(*) FROM public.quotations q
        WHERE (q.prospect_id=a.id OR q.customer_id=a.id) AND q.deleted_at IS NULL) >= 2
  );
