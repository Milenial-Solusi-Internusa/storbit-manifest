-- TD-50: Sinkronkan account_status dengan is_in_lead_pool
--
-- Masalah: LeadPoolApprovalPage.handleApprove() melepas is_in_lead_pool=false
-- tapi tidak mengembalikan account_status ke 'prospect'. Akibatnya 8 akun yang
-- ditarik keluar dari Lead Pool tampil di Kanban (filter is_in_lead_pool) tapi
-- hilang dari CRM Dashboard (filter account_status='prospect').
--
-- Perbaikan kode: account_status:'prospect' ditambahkan ke handleApprove,
-- dan account_status:'lead_pool' ditambahkan ke Edge Function aging-pipeline.
--
-- Migrasi ini membersihkan 8 baris yang sudah terlanjur desync.
-- Dijalankan manual 10 Jul 2026. Hasil: UPDATE 8.

UPDATE accounts
SET account_status = 'prospect'
WHERE deleted_at IS NULL
  AND account_status = 'lead_pool'
  AND is_in_lead_pool = false
  AND pull_status = 'approved';

-- Verifikasi:
-- SELECT account_status, is_in_lead_pool, count(*) FROM accounts
-- WHERE deleted_at IS NULL GROUP BY 1,2;
-- Harapan: hanya 'lead_pool+true' (479) dan 'prospect+false' (477),
-- plus customer (40) dan lost (1).
