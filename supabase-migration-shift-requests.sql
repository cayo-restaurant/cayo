-- =============================================
-- Cayo: shift_requests — employee availability submissions
-- Run this in Supabase SQL Editor
-- =============================================
--
-- Each row = "employee E is available to work shift_type T on date D".
-- Employees submit these from /staff/submit for the upcoming week. The
-- admin uses them as an input when building the actual shifts in
-- /admin/hours (not wired yet — manual handoff until phase 3).
--
-- One row per (employee, date, shift_type). Unchecking a box deletes
-- the row rather than setting a boolean — keeps the data pure and makes
-- "is X available for opening on Y" a simple existence check.
--
-- shift_type is stored as text with a CHECK constraint rather than a
-- Postgres enum because enums are expensive to evolve; "opening" and
-- "closing" should cover us, but if we ever need e.g. "double" or
-- "split", a text column is easier to extend.

CREATE TABLE IF NOT EXISTS shift_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date         date NOT NULL,
  shift_type   text NOT NULL CHECK (shift_type IN ('opening', 'closing')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, date, shift_type)
);

-- Fast lookup for a given employee + date range (the /staff/submit page
-- loads all rows for the current + next week for the logged-in employee).
CREATE INDEX IF NOT EXISTS idx_shift_requests_employee_date
  ON shift_requests (employee_id, date);

-- Fast lookup for "who's available on date D" — used by the admin when
-- assembling the schedule.
CREATE INDEX IF NOT EXISTS idx_shift_requests_date
  ON shift_requests (date);

-- Auto-update updated_at on any change.
CREATE TRIGGER set_shift_requests_updated_at
  BEFORE UPDATE ON shift_requests
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- RLS — same pattern as employees / shifts: deny anon, allow service role.
-- All reads/writes go through our Next.js API routes with server-side
-- auth checks; we never hand out the anon key for this table.
ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;
