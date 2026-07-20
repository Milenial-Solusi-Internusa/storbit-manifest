-- 20260720000003_quotations_prf_id.sql
-- Menyambung rantai dokumen Inquiry -> PRF -> Quotation.
-- Dijalankan manual di Supabase SQL Editor pada 20 Jul 2026.

-- 1. Kolom penunjuk PRF di quotations
alter table public.quotations
  add column if not exists prf_id uuid references public.prf(id);

create index if not exists idx_quotations_prf_id
  on public.quotations(prf_id) where prf_id is not null;

comment on column public.quotations.prf_id is
  'PRF yang jadi dasar harga quotation ini. Boleh null untuk quotation yang dibuat manual tanpa PRF.';

-- 2. Trigger penjaga konsistensi induk
-- Kalau prf_id diisi, inquiry_id WAJIB sama dengan prf.inquiry_id.
create or replace function public.guard_quotation_prf_consistency()
returns trigger
language plpgsql
as $fn$
declare
  v_prf_inquiry uuid;
begin
  if new.prf_id is null then
    return new;
  end if;

  select inquiry_id into v_prf_inquiry
  from public.prf
  where id = new.prf_id;

  if v_prf_inquiry is null then
    raise exception 'PRF % tidak punya inquiry_id, tidak bisa jadi dasar quotation', new.prf_id;
  end if;

  if new.inquiry_id is null then
    new.inquiry_id := v_prf_inquiry;
  elsif new.inquiry_id <> v_prf_inquiry then
    raise exception 'inquiry_id quotation (%) tidak cocok dengan inquiry_id PRF (%)',
      new.inquiry_id, v_prf_inquiry;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_quotation_prf_consistency on public.quotations;
create trigger trg_quotation_prf_consistency
  before insert or update on public.quotations
  for each row execute function public.guard_quotation_prf_consistency();
