-- =============================================================================
-- Migration: 20260804000002_bnf_drop_division_recipients
-- Phase:     BNF module expansion — Fase B (UI admin kepala/direktur + rombak
--            notifyDivisionRecipients + drop bnf_division_recipients)
-- Purpose:   DROP TABLE bnf_division_recipients + seluruh RLS policy-nya —
--            digantikan oleh bnf_departments.head_profile_id (Fase A),
--            dikonsumsi oleh notifyDepartmentHead() (kode aplikasi, paket
--            Fase B yang sama — lihat rencana kode di chat 2026-08-04).
-- Depends:   20260803000002_bnf_module_schema (CREATE TABLE aslinya),
--            20260804000001_bnf_org_roles_and_report_field_guard (kolom
--            head_profile_id/director_profile_id pengganti tabel ini)
-- Status:    DRAFT — do NOT execute without explicit approval
--
-- Catatan urutan: tabel ini HANYA dibaca oleh kode yang belum ter-commit/
-- ter-merge di manapun (BNFListPage.jsx masih untracked di branch
-- feat/bnf-module) — tidak ada jalur production yang memanggilnya saat ini,
-- jadi menjalankan DROP ini sebelum kode aplikasi menyusul aman dilakukan.
-- =============================================================================

-- ROLLBACK (recreate — bukan executable statement, tabel+4 policy lengkap ada
-- di supabase/migrations/20260803000002_bnf_module_schema.sql, section 4,
-- sudah ter-commit di git):
-- CREATE TABLE public.bnf_division_recipients (...) — lihat migrasi di atas
-- + bnf_division_recipients_read/insert/update/delete (4 policy)
-- =============================================================================

DROP TABLE IF EXISTS public.bnf_division_recipients;
