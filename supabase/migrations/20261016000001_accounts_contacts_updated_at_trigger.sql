-- =============================================================================
-- 20261016000001_accounts_contacts_updated_at_trigger.sql
--
-- TD-318 Irisan 1, temuan 4c: accounts.updated_at TIDAK PERNAH berubah --
-- accounts punya 5 trigger (trg_a_sync_lifecycle_columns,
-- trg_gen_customer_code_ins, trg_z_gen_customer_code_upd,
-- trg_z_log_lifecycle_change, trg_z_track_stage_change) tapi NOL yang
-- mengisi updated_at, dan FE (saveCommercial/saveQual, LeadDetailPage.jsx)
-- juga tidak mengisinya manual. contacts sama -- CustomerDetailPage.jsx:1192
-- sudah mencatat "tabel contacts tak punya trigger auto-update" dan mengisi
-- updated_at MANUAL di 4 titik (:1209/:1239/:1245/:1269) sebagai siasat --
-- jadi redundan (bukan konflik) begitu trigger ini jalan.
--
-- Fungsi trigger SUDAH ADA -- set_updated_at() (20260524000001_companies.sql),
-- dipakai 46 tabel lain. TIDAK membuat fungsi baru.
--
-- Cakupan SENGAJA hanya accounts + contacts. 33 tabel lain yang juga punya
-- updated_at tanpa trigger (termasuk inquiries, quotations, sp_orders,
-- sp_order_items, sp_invoices, dc_master, dll) dicatat di 08_TECH_DEBT.md
-- sebagai TD terpisah -- TIDAK dikerjakan di sini (keputusan Den 16 Okt 2026).
--
-- Nol backfill (baris lama dibiarkan apa adanya). Idempoten.
--
-- Status: SIAP DIJALANKAN Vir via connector -- STAGING dulu, lalu
--         PRODUCTION dengan SQL identik. Belum dijalankan di mana pun
--         pada saat commit ini.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger
--  WHERE tgname IN ('trg_accounts_updated_at','trg_contacts_updated_at');
-- -- Harap 2 baris, tgenabled = 'O' (origin, aktif).
--
-- UPDATE public.accounts SET name = name WHERE id = '<satu id uji>'
--   RETURNING id, updated_at;
-- -- Harap updated_at = waktu sekarang, bukan nilai lama.
--
-- Rollback (kalau perlu dibatalkan):
-- DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
-- DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
-- =============================================================================
