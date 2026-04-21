-- Migration: Management Dashboard
--
-- Adds:
--   1. `source` column on reservations (tracks who created the booking:
--      customer via public form, admin via /admin, host via hostess dashboard,
--      or 'unknown' for rows that existed before this migration).
--   2. `reservation_events` audit log — records status/guests/time/date changes
--      so the dashboard can report edit volume and behavior patterns.
--   3. `get_dashboard_metrics(period_days)` RPC — returns all dashboard
--      aggregations as a single JSON payload, so the UI only pulls ~5KB
--      instead of the full reservations list (~5MB at scale). Critical for
--      staying under the Supabase free-tier 2GB/mo bandwidth cap.
--
-- Idempotent — safe to run multiple times.

-- ─── 1. source column ───────────────────────────────────────────────────────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown'
    CHECK (source IN ('customer', 'admin', 'host', 'unknown'));

CREATE INDEX IF NOT EXISTS reservations_source_idx ON public.reservations (source);

-- ─── 2. audit log table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reservation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  -- event_type: what kind of change this is
  event_type      text NOT NULL CHECK (event_type IN (
    'created', 'status_change', 'guests_change', 'time_change', 'date_change', 'deleted'
  )),
  -- old/new values stored as jsonb for flexibility (numbers, strings, or objects)
  old_value       jsonb,
  new_value       jsonb,
  -- actor: who performed the change
  actor           text NOT NULL DEFAULT 'unknown' CHECK (actor IN (
    'customer', 'admin', 'host', 'system', 'unknown'
  )),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservation_events_reservation_idx
  ON public.reservation_events (reservation_id);
CREATE INDEX IF NOT EXISTS reservation_events_type_idx
  ON public.reservation_events (event_type);
CREATE INDEX IF NOT EXISTS reservation_events_created_idx
  ON public.reservation_events (created_at DESC);

ALTER TABLE public.reservation_events ENABLE ROW LEVEL SECURITY;

-- ─── 3. aggregation RPC ────────────────────────────────────────────────────
-- Returns a single JSON object with all dashboard metrics. Accepts a period
-- (in days) so the client can switch between month/quarter/year views without
-- a full refetch. All expensive aggregation runs in Postgres, not on the
-- client — this is the bandwidth-saver.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(period_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  cutoff date := (current_date - (period_days || ' days')::interval)::date;
  year_cutoff date := (current_date - interval '1 year')::date;
BEGIN
  WITH
    -- Filter to the requested window — re-used by most aggregates
    period_reservations AS (
      SELECT * FROM public.reservations
      WHERE date >= cutoff AND date <= current_date
    ),

    -- Volume
    volume AS (
      SELECT
        (SELECT COUNT(*) FROM period_reservations) AS total_bookings_period,
        (SELECT COUNT(*) FROM public.reservations
          WHERE date >= year_cutoff AND date <= current_date) AS total_bookings_year,
        (SELECT COALESCE(SUM(guests), 0) FROM period_reservations
          WHERE status IN ('arrived', 'completed', 'confirmed')) AS total_guests_served,
        (SELECT COALESCE(AVG(guests)::numeric(10,2), 0) FROM period_reservations) AS avg_guests_per_booking
    ),

    -- Day-of-week distribution (0 = Sunday, 6 = Saturday in PG)
    dow_dist AS (
      SELECT jsonb_agg(jsonb_build_object(
        'dow', dow, 'bookings', bookings, 'guests', guests
      ) ORDER BY dow) AS data
      FROM (
        SELECT
          EXTRACT(DOW FROM date)::int AS dow,
          COUNT(*) AS bookings,
          COALESCE(SUM(guests), 0) AS guests
        FROM period_reservations
        GROUP BY EXTRACT(DOW FROM date)
      ) d
    ),

    -- Hour-of-evening distribution (time is stored as HH:MM text)
    hour_dist AS (
      SELECT jsonb_agg(jsonb_build_object(
        'time', time_slot, 'bookings', bookings, 'guests', guests
      ) ORDER BY time_slot) AS data
      FROM (
        SELECT
          time AS time_slot,
          COUNT(*) AS bookings,
          COALESCE(SUM(guests), 0) AS guests
        FROM period_reservations
        GROUP BY time
      ) h
    ),

    -- Advance booking time: minutes between creation and scheduled arrival
    advance AS (
      SELECT
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (
            (date::timestamp + time::interval) - created_at
          )) / 3600),
          0
        )::numeric(10,2) AS avg_hours_ahead,
        COALESCE(
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
            EXTRACT(EPOCH FROM ((date::timestamp + time::interval) - created_at)) / 3600
          ),
          0
        )::numeric(10,2) AS median_hours_ahead
      FROM period_reservations
      WHERE created_at IS NOT NULL
    ),

    -- Returning customers: phone/email that appear on 2+ reservations across ALL history
    returners AS (
      SELECT
        COUNT(DISTINCT phone) FILTER (WHERE n > 1) AS returning_count,
        COUNT(DISTINCT phone) AS total_customers,
        COALESCE(
          (COUNT(DISTINCT phone) FILTER (WHERE n > 1)::numeric
            / NULLIF(COUNT(DISTINCT phone), 0) * 100),
          0
        )::numeric(10,2) AS returning_rate
      FROM (
        SELECT phone, COUNT(*) AS n
        FROM public.reservations
        WHERE phone != '' AND status IN ('arrived', 'completed', 'confirmed')
        GROUP BY phone
      ) p
    ),

    -- Top "heavy" customers — most guests brought (all-time, any status except
    -- cancelled/no-show so we reward actual attendance)
    heavy AS (
      SELECT jsonb_agg(row_to_json(t)) AS data
      FROM (
        SELECT
          phone,
          MAX(name) AS name,
          COUNT(*) AS visits,
          SUM(guests) AS total_guests
        FROM public.reservations
        WHERE phone != '' AND status IN ('arrived', 'completed', 'confirmed')
        GROUP BY phone
        ORDER BY SUM(guests) DESC
        LIMIT 10
      ) t
    ),

    -- Source breakdown (customer/admin/host/unknown)
    source_breakdown AS (
      SELECT jsonb_object_agg(source, bookings) AS data
      FROM (
        SELECT source, COUNT(*) AS bookings
        FROM period_reservations
        GROUP BY source
      ) s
    ),

    -- Cancellation / no-show rates
    rates AS (
      SELECT
        COALESCE(
          (COUNT(*) FILTER (WHERE status = 'cancelled')::numeric
            / NULLIF(COUNT(*), 0) * 100),
          0
        )::numeric(10,2) AS cancellation_rate,
        COALESCE(
          (COUNT(*) FILTER (WHERE status = 'no_show')::numeric
            / NULLIF(COUNT(*), 0) * 100),
          0
        )::numeric(10,2) AS no_show_rate
      FROM period_reservations
    ),

    -- Edit volume from audit log (scoped to the period by event created_at)
    edits AS (
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'status_change') AS status_changes,
        COUNT(*) FILTER (WHERE event_type = 'guests_change') AS guests_changes,
        COUNT(*) FILTER (WHERE event_type IN ('time_change', 'date_change')) AS time_changes,
        COUNT(*) AS total_edits
      FROM public.reservation_events
      WHERE created_at >= cutoff
    ),

    -- Customer loyalty: average days between consecutive visits per customer
    loyalty AS (
      SELECT
        COALESCE(AVG(gap_days)::numeric(10,1), 0) AS avg_gap_days,
        COUNT(DISTINCT phone) AS customers_with_multiple_visits
      FROM (
        SELECT
          phone,
          (date - LAG(date) OVER (PARTITION BY phone ORDER BY date)) AS gap_days
        FROM public.reservations
        WHERE phone != '' AND status IN ('arrived', 'completed', 'confirmed')
      ) g
      WHERE gap_days IS NOT NULL AND gap_days > 0
    )

  -- Assemble the final JSON
  SELECT jsonb_build_object(
    'period_days', period_days,
    'generated_at', now(),
    'volume', (SELECT row_to_json(volume) FROM volume),
    'day_of_week', (SELECT data FROM dow_dist),
    'hour_distribution', (SELECT data FROM hour_dist),
    'advance_booking', (SELECT row_to_json(advance) FROM advance),
    'returning_customers', (SELECT row_to_json(returners) FROM returners),
    'heavy_customers', (SELECT data FROM heavy),
    'source_breakdown', (SELECT data FROM source_breakdown),
    'rates', (SELECT row_to_json(rates) FROM rates),
    'edits', (SELECT row_to_json(edits) FROM edits),
    'loyalty', (SELECT row_to_json(loyalty) FROM loyalty)
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to the service role (the API routes) so it can call the RPC
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(int) TO service_role;
