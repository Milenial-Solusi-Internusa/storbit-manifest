-- =============================================================================
-- Migration: 20261022000001_crm_inquiry_server_side_numbering
-- Inquiry Management Irisan 4 -- Lingkup A (penomoran inquiry server-side)
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging.
-- Dependensi: tidak ada migrasi lain (document_sequences & companies.code
-- sudah ada sejak awal). Boleh dijalankan sendirian.
--
-- RINGKASAN
-- Hari ini inquiry_no dihitung di FE (InquiryFormPage.jsx, generateInquiryNo())
-- lalu dikirim apa adanya lewat INSERT -- DB tidak pernah memverifikasi atau
-- menimpanya. Migrasi ini memindahkan otoritas penomoran ke DB lewat trigger
-- BEFORE INSERT: nilai inquiry_no dari client SELALU diabaikan dan ditimpa.
--
-- FORMAT BARU (dikonfirmasi dari data nyata mockup, bukan tebakan):
--   {ENTITY_CODE}-INQ-{BULAN_ROMAWI}-{TAHUN}-{URUT:04d}
--   Contoh: MSI-INQ-X-2026-0341 (lihat design-handoff/mockup/crm-data.js,
--   catatan 'b3'/'b4': "MSI-QUO-VI-2026-0189", "MSI-INQ-X-2026-0341").
--   Nomor LAMA berformat INQ/MSI/2026/949 TIDAK diubah -- hanya baris BARU
--   yang memakai format ini.
--
-- SUMBER COUNTER -- SENGAJA KUNCI YANG SAMA DENGAN FE LAMA
-- Trigger memanggil kunci counter document_sequences PERSIS yang sudah
-- dipakai generateInquiryNo() hari ini: (company_id, 'INQ', 'CRM', tahun, 0, 0)
-- -- document_type='INQ', department_code='CRM', month=0/day=0 (scope
-- per-entitas-per-tahun, bukan per-bulan). Konsekuensinya baris MSI
-- melanjutkan dari posisi counter yang SUDAH BENAR hari ini (tidak perlu
-- dihitung ulang dari MAX(inquiry_no) untuk kasus normal -- counter itu
-- SUDAH menjadi sumber kebenaran sejak fitur ini ada), dan JCI/SOA otomatis
-- mulai dari 1 (baris document_sequences-nya belum ada -- cabang
-- INSERT...ON CONFLICT di bawah membuatnya).
--
-- ⚠️ KONSEKUENSI TRANSISI YANG DITERIMA (Keputusan Den, bukan bug): selama FE
-- LAMA (belum redeploy) masih memanggil generateInquiryNo() SEBELUM INSERT,
-- counter yang sama akan ter-increment DUA KALI per insert -- sekali oleh FE
-- (hasilnya dibuang, trigger menimpa inquiry_no), sekali oleh trigger ini
-- (hasil INI yang tersimpan). Efeknya: nomor urut bisa melompat (mis.
-- ...0949 langsung ke ...0951, 0950 tak pernah muncul) selama window FE lama
-- masih hidup. Nol duplikat, nol error -- cuma gap kosmetik. Berhenti begitu
-- FE baru (Commit 5 pekerjaan ini) ter-deploy dan berhenti memanggil
-- generateInquiryNo() sendiri. Mas menjalankan migrasi ini TEPAT SEBELUM FE
-- baru naik (keputusan eksekusi Den), jadi window ini seharusnya sangat
-- singkat/nol di produksi.
--
-- KEAMANAN -- TRIGGER SENGAJA TIDAK MEMANGGIL increment_document_sequence()
-- RPC yang sudah ada (dipakai FE hari ini) punya guard
-- "is_super_admin() OR company_id IN get_user_company_ids()" yang bergantung
-- pada auth.uid(). Guard itu HARUS tidak ada di sini, karena trigger ini
-- wajib bekerja juga saat auth.uid() NULL (SQL Editor, skrip uji, Edge
-- Function, service_role) -- bukan hanya saat dipanggil lewat browser.
-- Fungsi trigger di bawah langsung menyentuh document_sequences (UPDATE/
-- INSERT identik dgn badan increment_document_sequence(), disalin inline,
-- BUKAN memanggil ulang fungsinya) dengan SECURITY DEFINER, TANPA guard
-- company_id -- ini AMAN karena satu-satunya cara memicu trigger ini adalah
-- benar-benar INSERT ke inquiries, dan inquiries_insert RLS (WITH CHECK
-- company_id IN get_user_company_ids()) sudah menjaga company_id-nya SEBELUM
-- baris itu benar-benar tersimpan -- kalau RLS menolak, seluruh statement
-- (termasuk increment document_sequences oleh trigger ini) di-rollback dalam
-- transaksi yang sama. Trigger function TIDAK diberi GRANT EXECUTE apa pun
-- (ia hanya dipanggil mesin trigger saat INSERT, bukan RPC langsung) --
-- konsisten dengan seluruh trigger function lain di repo ini.
--
-- SELURUH JALUR INSERT INTO inquiries DI SISTEM (diverifikasi grep menyeluruh
-- src/, supabase/migrations/, supabase/functions/, scripts/ -- bukan tebakan):
--   1. src/modules/crm/InquiryFormPage.jsx:394 -- SATU-SATUNYA jalur INSERT FE.
--      Diubah di Commit 5 (lihat bawah) supaya tidak lagi mengirim inquiry_no
--      dan membaca balik nomor otoritatif dari DB lewat .select().
-- Nol migrasi, nol Edge Function, nol skrip seed yang pernah INSERT ke
-- inquiries. "4. INSERT INTO inquiries(...)" di
-- 20261012000006_crm_lead_pool_notifications.sql:600 hanya KOMENTAR langkah
-- uji manual, bukan kode. manage-schema Edge Function menyebut 'inquiries' di
-- ALLOWED_TABLES (introspeksi custom fields) tapi nol operasi INSERT.
-- Kesimpulan: trigger ini TIDAK berisiko mematahkan jalur lain -- hanya ADA
-- satu jalur, dan jalur itu diubah bersamaan (Commit 5).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.assign_inquiry_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_year    integer;
  v_month   integer;
  v_roman   text;
  v_code    text;
  v_seq     integer;
BEGIN
  v_year  := EXTRACT(YEAR  FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_month := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;

  v_roman := (ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[v_month];

  SELECT code INTO v_code FROM public.companies WHERE id = NEW.company_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Entitas % tidak ditemukan -- tidak bisa menomori inquiry.', NEW.company_id;
  END IF;

  -- Badan identik increment_document_sequence() (schema_snapshot.sql baris
  -- ~2911), disalin inline TANPA guard company_id -- lihat RINGKASAN di atas.
  UPDATE public.document_sequences
  SET    last_sequence = last_sequence + 1
  WHERE  company_id      = NEW.company_id
    AND  document_type   = 'INQ'
    AND  department_code = 'CRM'
    AND  year            = v_year
    AND  month           = 0
    AND  day             = 0
  RETURNING last_sequence INTO v_seq;

  IF NOT FOUND THEN
    INSERT INTO public.document_sequences
      (company_id, document_type, department_code, year, month, day, last_sequence)
    VALUES
      (NEW.company_id, 'INQ', 'CRM', v_year, 0, 0, 1)
    ON CONFLICT (company_id, document_type, department_code, year, month, day)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_seq;
  END IF;

  NEW.inquiry_no := v_code || '-INQ-' || v_roman || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_inquiry_no() IS
  'BEFORE INSERT ON inquiries -- menimpa inquiry_no apa pun dari client dengan nomor otoritatif {ENTITY}-INQ-{ROMAWI}-{TAHUN}-{URUT:04d}. SECURITY DEFINER TANPA guard company_id (sengaja, lihat header migrasi 20261022000001) supaya tetap bekerja saat auth.uid() NULL (SQL Editor/skrip uji/Edge Function). Konter dibagi dgn kunci yang sama dengan generateInquiryNo() FE lama -- gap nomor urut sementara selama masa transisi FE DITERIMA sebagai konsekuensi, bukan bug.';

DROP TRIGGER IF EXISTS trg_z_assign_inquiry_no ON public.inquiries;
CREATE TRIGGER trg_z_assign_inquiry_no
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_inquiry_no();

-- -----------------------------------------------------------------------------
-- Seed defensif: pastikan document_sequences tidak PERNAH di bawah nomor urut
-- tertinggi yang SUDAH tersimpan di inquiries.inquiry_no format lama
-- (INQ/{code}/{tahun}/{urut}), untuk SETIAP (entitas, tahun) yang punya baris
-- historis. Dihitung dari DATA saat migrasi ini jalan -- TIDAK PERNAH
-- di-hardcode -- karena staging dan produksi punya populasi baris yang
-- berbeda. Ini jaring pengaman terhadap kemungkinan ada baris yang pernah
-- masuk inquiries di luar jalur generateInquiryNo() (impor/seed/SQL manual)
-- sehingga counter document_sequences bisa under-count dibanding nomor yang
-- SUDAH beredar -- GREATEST menjaga counter tidak pernah mundur, dan tidak
-- menyentuh baris yang sudah benar.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT i.company_id,
           split_part(i.inquiry_no, '/', 3)::int AS yr,
           MAX(split_part(i.inquiry_no, '/', 4)::int) AS max_seq
      FROM public.inquiries i
     WHERE i.inquiry_no LIKE 'INQ/%/%/%'
       AND split_part(i.inquiry_no, '/', 4) ~ '^[0-9]+$'
       AND split_part(i.inquiry_no, '/', 3) ~ '^[0-9]+$'
     GROUP BY i.company_id, split_part(i.inquiry_no, '/', 3)::int
  LOOP
    INSERT INTO public.document_sequences
      (company_id, document_type, department_code, year, month, day, last_sequence)
    VALUES
      (r.company_id, 'INQ', 'CRM', r.yr, 0, 0, r.max_seq)
    ON CONFLICT (company_id, document_type, department_code, year, month, day)
    DO UPDATE SET last_sequence = GREATEST(document_sequences.last_sequence, EXCLUDED.last_sequence);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (role postgres, auth.uid() NULL -- itu
-- JUSTRU yang mau dibuktikan: trigger ini wajib bekerja tanpa login)
-- =============================================================================
-- 1) Trigger & fungsi terpasang:
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.inquiries'::regclass AND tgname = 'trg_z_assign_inquiry_no';
--
-- 2) Counter MSI tahun ini TIDAK mundur dibanding nomor lama tertinggi:
-- SELECT ds.last_sequence,
--        (SELECT MAX(split_part(inquiry_no,'/',4)::int) FROM public.inquiries
--          WHERE inquiry_no LIKE 'INQ/MSI/%' AND split_part(inquiry_no,'/',3)::int = EXTRACT(YEAR FROM now())::int)
--   FROM public.document_sequences ds
--  WHERE ds.company_id = (SELECT id FROM public.companies WHERE code='MSI')
--    AND ds.document_type='INQ' AND ds.department_code='CRM'
--    AND ds.year = EXTRACT(YEAR FROM now())::int AND ds.month=0 AND ds.day=0;
--
-- Rollback (sebelum ada baris baru memakainya):
--   DROP TRIGGER trg_z_assign_inquiry_no ON public.inquiries;
--   DROP FUNCTION public.assign_inquiry_no();
-- (Baris document_sequences yang sudah di-GREATEST tidak perlu dikembalikan --
--  ia tidak pernah mengurangi nilai yang sudah ada, hanya menaikkan kalau perlu.)
-- =============================================================================
