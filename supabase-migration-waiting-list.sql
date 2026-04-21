-- Migration: waiting_list table
--
-- Stores customers who tried to book when no suitable table was available.
-- Entries are ordered by created_at (FIFO). When a matching table is freed,
-- the system auto-assigns the oldest matching entry and notifies the host UI.

CREATE TABLE IF NOT EXISTS public.waiting_list (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  guests      integer NOT NULL CHECK (guests >= 1 AND guests <= 10),
  -- requested_date: YYYY-MM-DD (Israel shift-day)
  requested_date date NOT NULL,
  -- requested_time: HH:mm (e.g. '20:00')
  requested_time text NOT NULL,
  -- auto_assigned: true once the system assigned a table and converted this
  -- entry to a full reservation. Used to prevent double-processing.
  auto_assigned boolean NOT NULL DEFAULT false,
  -- reservation_id: filled in once auto-assignment creates a reservation
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_waiting_list_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_waiting_list_updated_at ON public.waiting_list;
CREATE TRIGGER set_waiting_list_updated_at
  BEFORE UPDATE ON public.waiting_list
  FOR EACH ROW EXECUTE FUNCTION public.set_waiting_list_updated_at();

-- Index for the most common query: pending entries for a given date, ordered by arrival
CREATE INDEX IF NOT EXISTS waiting_list_pending_date_idx
  ON public.waiting_list (requested_date, created_at)
  WHERE auto_assigned = false;

-- RLS
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- Service role (used by Next.js server) has full access
CREATE POLICY "service role full access"
  ON public.waiting_list
  USING (true)
  WITH CHECK (true);
