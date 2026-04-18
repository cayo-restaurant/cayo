-- =============================================
-- Cayo — Phase 1: Seating Assignments Migration
-- =============================================
-- Purpose:
--   • Introduce reservation_tables junction (many-to-many) so one
--     reservation can span 2+ tables (large parties / joined tables).
--   • Add 'completed' status so the hostess can free a table when
--     guests leave (kept separate from 'no_show' / 'cancelled').
--   • Backfill the junction from the legacy reservations.table_id
--     column so existing data keeps working during the transition.
--
-- Safety:
--   • Idempotent — safe to re-run.
--   • Does NOT drop reservations.table_id; it stays as a legacy
--     read-only column during the transition and will be removed
--     in a later migration once all code reads from the junction.
--
-- Run order:
--   Run AFTER supabase-schema.sql and supabase-migration-map.sql.
-- =============================================

-- Ensure moddatetime is available (defensive — also created in map migration)
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- ---------------------------------------------
-- 1) Allow 'completed' status on reservations
-- ---------------------------------------------
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending','confirmed','cancelled','arrived','no_show','completed'));


-- ---------------------------------------------
-- 2) Junction table: reservation_tables
-- ---------------------------------------------
-- One row = one (reservation, table) assignment. For parties that
-- occupy several tables, insert several rows — exactly one of them
-- MUST have is_primary=true (enforced by the partial unique index
-- below). The primary table is the "home" table the hostess will
-- greet the guest at.

CREATE TABLE IF NOT EXISTS public.reservation_tables (
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  table_id       uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT,
  is_primary     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reservation_id, table_id)
);

-- Exactly one primary per reservation (0 is OK — reservation with
-- no assignment yet).
CREATE UNIQUE INDEX IF NOT EXISTS reservation_tables_primary_idx
  ON public.reservation_tables(reservation_id)
  WHERE is_primary = true;

-- Fast lookup: "what's happening at table X?"
CREATE INDEX IF NOT EXISTS reservation_tables_table_idx
  ON public.reservation_tables(table_id);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS set_reservation_tables_updated_at ON public.reservation_tables;
CREATE TRIGGER set_reservation_tables_updated_at
  BEFORE UPDATE ON public.reservation_tables
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- 3) Backfill from legacy reservations.table_id
-- ---------------------------------------------
-- Any reservation that already had a table_id gets a matching
-- row in the junction, marked as primary. Existing rows are kept
-- as-is (ON CONFLICT DO NOTHING) so re-running the migration is
-- safe.
INSERT INTO public.reservation_tables (reservation_id, table_id, is_primary)
SELECT id, table_id, true
FROM public.reservations
WHERE table_id IS NOT NULL
ON CONFLICT (reservation_id, table_id) DO NOTHING;


-- ---------------------------------------------
-- 4) Verification queries (run manually after migration)
-- ---------------------------------------------
-- Expected results after a clean run:
--   1. No reservation should have more than one primary:
--      SELECT reservation_id, count(*) FROM reservation_tables
--        WHERE is_primary = true GROUP BY 1 HAVING count(*) > 1;
--      → zero rows
--
--   2. Every legacy table_id should be mirrored in the junction:
--      SELECT r.id FROM reservations r
--        LEFT JOIN reservation_tables rt
--          ON rt.reservation_id = r.id AND rt.is_primary = true
--        WHERE r.table_id IS NOT NULL AND rt.reservation_id IS NULL;
--      → zero rows
