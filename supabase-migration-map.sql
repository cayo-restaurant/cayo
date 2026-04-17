-- =============================================
-- Cayo: Restaurant map — tables + reservation linking
-- Run this in Supabase SQL Editor
-- =============================================
--
-- Adds:
--   • restaurant_tables           — the physical tables on the floor/bar
--   • reservations.table_id       — which table a reservation is assigned to
--   • reservations.is_walk_in     — mark bookings created by the hostess on-shift
--
-- This migration is idempotent — safe to rerun.
-- =============================================


-- ---------------------------------------------
-- 1) restaurant_tables
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-facing number shown on the map and in the reservation UI.
  -- Unique across all tables. Floor tables typically 1-99, bar stools 100+.
  table_number  integer NOT NULL UNIQUE,

  -- Optional free-text label ("בר קצה", "שולחן חלון") — UI can show this instead
  -- of the raw number when set. Not used in v1 but reserved for later.
  label         text,

  -- Visual shape on the map.
  shape         text NOT NULL CHECK (shape IN ('square','rectangle','bar_stool')),

  -- Size in px within the map's coordinate system.
  width         integer NOT NULL DEFAULT 80  CHECK (width  BETWEEN 20 AND 500),
  height        integer NOT NULL DEFAULT 80  CHECK (height BETWEEN 20 AND 500),

  -- Top-left position in px on the map canvas.
  pos_x         integer NOT NULL DEFAULT 0 CHECK (pos_x >= 0),
  pos_y         integer NOT NULL DEFAULT 0 CHECK (pos_y >= 0),

  -- Capacity range — used by the auto-assignment algorithm to pick a
  -- best-fit table for a given party size.
  capacity_min  integer NOT NULL DEFAULT 1
                CHECK (capacity_min >= 1),
  capacity_max  integer NOT NULL DEFAULT 2
                CHECK (capacity_max >= capacity_min AND capacity_max <= 20),

  -- Matches reservations.area so auto-assignment can filter easily.
  -- Even though the map UI is unified, the logical area lives on the row.
  area          text NOT NULL DEFAULT 'table'
                CHECK (area IN ('bar','table')),

  -- Soft-delete flag. We don't hard-delete because old reservations may still
  -- reference this table; we just hide it from the map.
  active        boolean NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at (moddatetime is preinstalled on Supabase)
DROP TRIGGER IF EXISTS set_restaurant_tables_updated_at ON public.restaurant_tables;
CREATE TRIGGER set_restaurant_tables_updated_at
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Index for the common "give me the active tables" lookup.
CREATE INDEX IF NOT EXISTS restaurant_tables_active_idx
  ON public.restaurant_tables (active) WHERE active = true;

-- RLS: deny-all, same pattern as reservations. All access goes through
-- server-side API routes using the service role, which bypasses RLS.
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------
-- 2) Link reservations → tables
-- ---------------------------------------------

-- The table this reservation is assigned to. NULL means unassigned
-- (either a legacy reservation from before this feature, or the
-- auto-assignment algorithm couldn't find a match).
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS table_id uuid
  REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;

-- Walk-ins: reservations created on the spot by the hostess (no online
-- booking). Stored in the same table so availability math stays simple.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;

-- Index for "what reservations are on this table today".
CREATE INDEX IF NOT EXISTS reservations_table_id_idx
  ON public.reservations (table_id);

-- Partial index for the "list today's walk-ins" query.
CREATE INDEX IF NOT EXISTS reservations_walk_in_idx
  ON public.reservations (is_walk_in) WHERE is_walk_in = true;


-- =============================================
-- Optional seed: uncomment to insert a couple of demo tables
-- so the map shows something before the editor UI is built.
-- =============================================
-- INSERT INTO public.restaurant_tables
--   (table_number, shape, width, height, pos_x, pos_y, capacity_min, capacity_max, area)
-- VALUES
--   (1,  'square',    80,  80,  60,   60, 1, 2, 'table'),
--   (2,  'square',    80,  80, 160,   60, 1, 2, 'table'),
--   (3,  'rectangle', 140, 80, 260,   60, 2, 4, 'table'),
--   (101,'bar_stool', 50,  50,  60,  260, 1, 1, 'bar'),
--   (102,'bar_stool', 50,  50, 130,  260, 1, 1, 'bar')
-- ON CONFLICT (table_number) DO NOTHING;
