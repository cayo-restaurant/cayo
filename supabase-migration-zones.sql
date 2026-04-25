-- Migration: zones table
--
-- Holds per-zone capacity configuration for the venue. Previously these numbers
-- lived in env vars (BAR_CAPACITY / TABLE_CAPACITY / MAX_BAR_PARTY), but the
-- owner needs to tweak them without redeploying — so they move to a config
-- table that server code reads on each request (cached briefly in-memory).
--
-- The venue currently has two zones:
--   • 'bar'   — 14 stools at the bar counter; per-reservation cap of 4 people
--   • 'table' — 44 seats across window tables + sofa area; no per-reservation cap
--
-- `id` is a stable text slug (not a uuid) because server code references zones
-- by name ('bar' / 'table'), matching `reservations.area` values. If a third
-- zone ever gets added (e.g. 'patio'), it's a single INSERT + matching check
-- constraint widen on reservations.area.
--
-- `max_party_size` is nullable. NULL means "no per-reservation limit at this
-- zone, only the aggregate capacity applies".

CREATE TABLE IF NOT EXISTS public.zones (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  capacity        integer NOT NULL CHECK (capacity >= 0),
  max_party_size  integer CHECK (max_party_size IS NULL OR max_party_size >= 1),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change so we can tell when config was last
-- tweaked (useful when the in-memory cache looks wrong).
CREATE OR REPLACE FUNCTION public.set_zones_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_zones_updated_at ON public.zones;
CREATE TRIGGER set_zones_updated_at
  BEFORE UPDATE ON public.zones
  FOR EACH ROW EXECUTE FUNCTION public.set_zones_updated_at();

-- Seed the two existing zones with the numbers that previously lived in env
-- vars. Uses ON CONFLICT so re-running the migration doesn't clobber the
-- owner's manual edits.
INSERT INTO public.zones (id, name, capacity, max_party_size)
VALUES
  ('bar',   'בר',        14, 4),
  ('table', 'שולחנות',   44, NULL)
ON CONFLICT (id) DO NOTHING;

-- RLS: deny-all except service role (matches reservations / waiting_list /
-- restaurant_tables pattern — all config is server-only, the anon key never
-- reads zones directly; the customer form gets zone data via the availability
-- API response).
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON public.zones
  USING (true)
  WITH CHECK (true);
