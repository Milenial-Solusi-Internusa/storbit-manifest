-- ============================================================================
-- Arsip — Fase 1 Contacts: naik dari satu-PIC-per-akun (accounts.pic_name/
-- pic_phone/pic_email) jadi banyak-kontak (tabel contacts). SUDAH DIJALANKAN
-- MANUAL 2026-07-26. File ini ARSIP — SQL-nya sendiri sudah live di produksi
-- SEBELUM file ini dibuat. Idempotent — aman di-replay saat rebuild:
--   - DDL (tabel/index/RLS/kolom baru)  → IF NOT EXISTS / DROP+CREATE POLICY.
--   - Backfill data (bagian paling bawah) → satu guard di kepala DO block:
--     kalau activities.contact_id sudah pernah terisi sama sekali, backfill
--     dianggap sudah pernah jalan dan seluruh blok di-skip. Tiap sub-langkah
--     di dalamnya JUGA independen aman (hanya menyentuh baris yang memang
--     belum tertaut / akun yang memang belum punya kontak), jadi kalaupun
--     guard di atas dilewati, tak ada yang diduplikasi.
--
-- KONTEKS: `accounts.pic_name`/`pic_phone`/`pic_email` SENGAJA MASIH ADA di
-- tabel `accounts` — TIDAK di-drop di sini. Drop kolom itu adalah batch
-- DESTRUKTIF TERPISAH, belum dikerjakan. Kode aplikasi (batch FE terpisah,
-- 2026-07-26) sudah berhenti membaca/menulis kolom itu dan pindah ke tabel
-- ini sebagai sumber kebenaran — tapi kolomnya sendiri masih hidup di DB
-- sampai batch drop itu benar-benar dijalankan.
--
-- RLS `contacts` MEWARISI visibilitas dari `accounts` lewat EXISTS — SENGAJA
-- tidak menduplikasi aturan company_id/assigned_to/role yang sudah ada di
-- policy `accounts` (satu sumber kebenaran otorisasi, bukan disalin ulang).
-- Konsekuensinya: siapa pun yang boleh melihat/mengubah baris `accounts`
-- tertentu otomatis boleh melihat/mengubah kontak akun itu juga — tak ada
-- pembatasan tambahan per-role khusus untuk kontak. DELETE (SQL DELETE asli,
-- BUKAN soft-delete via UPDATE deleted_at) tetap super_admin-only, konsisten
-- pola tabel lain di skema ini.
-- ============================================================================

-- ── 1) Tabel ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES public.accounts(id),
  company_id   uuid NOT NULL,
  name         text NOT NULL,
  position     text,
  email        text,
  phone        text,
  role_type    text,
  is_primary   boolean NOT NULL DEFAULT false,
  is_active    boolean NOT NULL DEFAULT true,
  notes        text,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT contacts_role_type_check CHECK (
    role_type IS NULL OR role_type IN ('decision_maker', 'requester', 'finance', 'operations', 'other')
  )
);

-- ── 2) Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_account ON public.contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company_id);
-- Satu akun maksimal SATU kontak primary (baris yang belum di-soft-delete).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_one_primary
  ON public.contacts(account_id) WHERE is_primary AND deleted_at IS NULL;

-- ── 3) RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- ── 4) Policy — mewarisi visibilitas accounts via EXISTS, TO authenticated ──
DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select ON public.contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = contacts.account_id));

DROP POLICY IF EXISTS contacts_insert ON public.contacts;
CREATE POLICY contacts_insert ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = contacts.account_id));

DROP POLICY IF EXISTS contacts_update ON public.contacts;
CREATE POLICY contacts_update ON public.contacts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = contacts.account_id));

DROP POLICY IF EXISTS contacts_delete ON public.contacts;
CREATE POLICY contacts_delete ON public.contacts FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ── 5) Grant ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;

-- ── 6) Tautan opsional dari activities/inquiries ke contacts ────────────────
-- Kolom ini TIDAK dipakai jalur tulis mana pun di FE per 2026-07-26 (murni
-- struktural, disiapkan untuk fitur masa depan) — KECUALI backfill historis
-- di bawah, yang mengisi activities.contact_id untuk data LAMA.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id);
ALTER TABLE public.inquiries  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON public.activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_contact  ON public.inquiries(contact_id);

-- ── 7) Backfill historis (SUDAH TERJADI 2026-07-26 — hasil nyata dicatat di
--       tiap langkah). Dibungkus SATU guard supaya replay tak menduplikasi. ──
DO $contacts_backfill$
DECLARE
  n_step int;
BEGIN
  -- Guard tunggal: activities.contact_id kolomnya BARU (langkah 6 di atas) dan
  -- tak ada jalur tulis FE lain yang mengisinya — satu-satunya cara kolom ini
  -- punya nilai non-null adalah backfill di bawah sudah pernah jalan.
  IF EXISTS (SELECT 1 FROM public.activities WHERE contact_id IS NOT NULL LIMIT 1) THEN
    RAISE NOTICE 'SKIP backfill kontak: activities.contact_id sudah terisi (backfill sudah pernah jalan).';
    RETURN;
  END IF;

  -- (a) Kontak pertama per akun dari accounts.pic_name/pic_phone/pic_email —
  --     HANYA untuk akun yang belum punya kontak sama sekali. is_primary=true
  --     (satu-satunya kontak akun itu, jadi otomatis yang utama).
  --     Hasil nyata saat dijalankan manual: 951 baris.
  INSERT INTO public.contacts (account_id, company_id, name, email, phone, is_primary, is_active)
  SELECT a.id, a.company_id, TRIM(a.pic_name), NULLIF(TRIM(a.pic_email), ''), NULLIF(TRIM(a.pic_phone), ''), true, true
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
    AND a.pic_name IS NOT NULL AND TRIM(a.pic_name) <> ''
    AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.account_id = a.id);
  GET DIAGNOSTICS n_step = ROW_COUNT;
  RAISE NOTICE 'Backfill (a) kontak dari pic_*: % baris (hasil asli 26 Jul 2026 = 951 baris).', n_step;

  -- (b) Tautkan activities.contact_id ke kontak yang SUDAH ADA (baik lama
  --     maupun baru dari langkah (a)), per akun, 3 tingkat prioritas.
  --     DISTINCT ON dipakai supaya satu activity hanya mendapat SATU kontak
  --     meski ada >1 kandidat cocok (bukan pilihan Postgres yang tak pasti).

  -- (b-1) nama sama persis (case-insensitive, trim).
  UPDATE public.activities act SET contact_id = best.id
  FROM (
    SELECT DISTINCT ON (a2.id) a2.id AS activity_id, c2.id
    FROM public.activities a2
    JOIN public.contacts c2 ON c2.account_id = a2.account_id AND c2.deleted_at IS NULL
    WHERE a2.contact_id IS NULL
      AND a2.contact_name IS NOT NULL AND TRIM(a2.contact_name) <> ''
      AND lower(TRIM(c2.name)) = lower(TRIM(a2.contact_name))
    ORDER BY a2.id, c2.created_at
  ) best
  WHERE act.id = best.activity_id;

  -- (b-2) nomor HP sama (digit saja), untuk yang belum ketemu di (b-1).
  UPDATE public.activities act SET contact_id = best.id
  FROM (
    SELECT DISTINCT ON (a2.id) a2.id AS activity_id, c2.id
    FROM public.activities a2
    JOIN public.contacts c2 ON c2.account_id = a2.account_id AND c2.deleted_at IS NULL
    WHERE a2.contact_id IS NULL
      AND a2.contact_phone IS NOT NULL AND regexp_replace(a2.contact_phone, '[^0-9]', '', 'g') <> ''
      AND c2.phone IS NOT NULL AND regexp_replace(c2.phone, '[^0-9]', '', 'g') <> ''
      AND regexp_replace(a2.contact_phone, '[^0-9]', '', 'g') = regexp_replace(c2.phone, '[^0-9]', '', 'g')
    ORDER BY a2.id, c2.created_at
  ) best
  WHERE act.id = best.activity_id;

  -- (b-3) fuzzy similarity >= 0.6 (pg_trgm, sudah diaktifkan migrasi
  --       20260725000003), untuk yang masih belum ketemu — ambil skor
  --       tertinggi per activity.
  UPDATE public.activities act SET contact_id = best.id
  FROM (
    SELECT DISTINCT ON (a2.id) a2.id AS activity_id, c2.id
    FROM public.activities a2
    JOIN public.contacts c2 ON c2.account_id = a2.account_id AND c2.deleted_at IS NULL
    WHERE a2.contact_id IS NULL
      AND a2.contact_name IS NOT NULL AND TRIM(a2.contact_name) <> ''
      AND similarity(lower(TRIM(c2.name)), lower(TRIM(a2.contact_name))) >= 0.6
    ORDER BY a2.id, similarity(lower(TRIM(c2.name)), lower(TRIM(a2.contact_name))) DESC
  ) best
  WHERE act.id = best.activity_id;
  GET DIAGNOSTICS n_step = ROW_COUNT;
  RAISE NOTICE 'Backfill (b) tautan 3-tingkat ke kontak existing selesai (hasil asli 26 Jul 2026, gabungan 3 tingkat = 194 baris).';

  -- (c) Sisa activities yang masih belum tertaut: buat SATU kontak baru per
  --     pasangan (akun, nama) yang belum punya kontak dengan nama itu.
  --     is_primary=false (bukan kontak utama akun). Hasil nyata: 40 baris.
  INSERT INTO public.contacts (account_id, company_id, name, is_primary, is_active)
  SELECT DISTINCT a2.account_id, acc.company_id, TRIM(a2.contact_name), false, true
  FROM public.activities a2
  JOIN public.accounts acc ON acc.id = a2.account_id
  WHERE a2.contact_id IS NULL
    AND a2.account_id IS NOT NULL
    AND a2.contact_name IS NOT NULL AND TRIM(a2.contact_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.contacts c3
      WHERE c3.account_id = a2.account_id AND c3.deleted_at IS NULL
        AND lower(TRIM(c3.name)) = lower(TRIM(a2.contact_name))
    );
  GET DIAGNOSTICS n_step = ROW_COUNT;
  RAISE NOTICE 'Backfill (c) kontak baru dari activities.contact_name tak-tertaut: % baris (hasil asli 26 Jul 2026 = 40 baris).', n_step;

  -- (d) Tautkan activities yang barusan dapat kontak baru dari (c) — nama
  --     sama persis (kontaknya baru dibuat persis dari nama activity ini).
  UPDATE public.activities act SET contact_id = c.id
  FROM public.contacts c
  WHERE act.contact_id IS NULL
    AND act.account_id = c.account_id AND c.deleted_at IS NULL
    AND act.contact_name IS NOT NULL
    AND lower(TRIM(c.name)) = lower(TRIM(act.contact_name));
  GET DIAGNOSTICS n_step = ROW_COUNT;
  RAISE NOTICE 'Backfill (d) tautan ke kontak baru (c): % baris.', n_step;

  RAISE NOTICE 'Backfill kontak selesai. Hasil akhir nyata 26 Jul 2026: 991 kontak total (951 dari pic_* + 40 dari activities), 239/240 activities tertaut (1 sisa ber-account_id NULL, memang tak bisa ditautkan).';
END
$contacts_backfill$;
