-- CAYO: add 'arrived' and 'no_show' statuses to reservations table
-- Run once in Supabase → SQL Editor → New query → paste → Run
-- (safe to re-run; ADD CONSTRAINT is guarded with IF NOT EXISTS pattern via DROP first)

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'arrived', 'no_show'));
