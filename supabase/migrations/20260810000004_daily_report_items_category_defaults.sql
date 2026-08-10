-- Fix: task_status/insiden_resolution di daily_report_items ternyata tidak
-- punya DEFAULT sama sekali di migration sebelumnya (20260810000003),
-- padahal prosa migration itu menyebut "otomatis dari default". Ditemukan
-- CC saat baca schema langsung untuk Layer 1. Trigger kondisional per
-- kategori (bukan DEFAULT polos di kolom) supaya kategori aktivitas/task
-- tidak ikut keisi field yang tidak relevan.

BEGIN;

CREATE OR REPLACE FUNCTION set_daily_report_items_defaults()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.category = 'task' AND NEW.task_status IS NULL THEN
    NEW.task_status := 'pending';
  END IF;
  IF NEW.category = 'insiden' AND NEW.insiden_resolution IS NULL THEN
    NEW.insiden_resolution := 'pending_review';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_set_daily_report_items_defaults
BEFORE INSERT ON daily_report_items
FOR EACH ROW EXECUTE FUNCTION set_daily_report_items_defaults();

COMMIT;
