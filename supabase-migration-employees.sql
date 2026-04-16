-- =============================================
-- Cayo: Employees & Shifts tables
-- Run this in Supabase SQL Editor
-- =============================================

-- Enum for employee roles
CREATE TYPE employee_role AS ENUM (
  'bartender',   -- ברמן
  'waiter',      -- מלצר
  'host',        -- מארח/ת
  'kitchen',     -- מטבח
  'dishwasher',  -- שוטף
  'manager'      -- אחמ"ש
);

-- Enum for gender
CREATE TYPE employee_gender AS ENUM ('male', 'female', 'other');

-- =============================================
-- Employees table
-- =============================================
CREATE TABLE employees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  role        employee_role NOT NULL,
  phone       text,
  email       text,
  gender      employee_gender,
  hourly_rate numeric(8,2) NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- =============================================
-- Shifts (work hours) table
-- =============================================
CREATE TABLE shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        date NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate shift for same employee on same date+time
  UNIQUE (employee_id, date, start_time)
);

-- Auto-update updated_at
CREATE TRIGGER set_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Index for fast lookups
CREATE INDEX idx_shifts_employee_date ON shifts (employee_id, date);
CREATE INDEX idx_shifts_date ON shifts (date);

-- =============================================
-- RLS — deny anon, allow service role only
-- (same pattern as reservations table)
-- =============================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- No policies = deny all for anon key
-- Service role bypasses RLS automatically
