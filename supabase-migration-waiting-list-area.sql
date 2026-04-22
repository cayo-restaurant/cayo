-- Migration: add `area` column to waiting_list
--
-- Without this column the auto-promotion path defaults to 'table' for every
-- entry, which means a guest who originally asked for 'bar' will never be
-- promoted (the bar/table table-picking algorithms are different).
--
-- Default 'table' keeps existing rows valid; the CHECK constraint matches
-- the same enum used elsewhere in the app (see Area in lib/assignments-store.ts).

ALTER TABLE public.waiting_list
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'table';

-- Add the enum constraint separately so re-running the migration is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'waiting_list_area_check'
  ) THEN
    ALTER TABLE public.waiting_list
      ADD CONSTRAINT waiting_list_area_check
      CHECK (area IN ('bar', 'table'));
  END IF;
END
$$;
