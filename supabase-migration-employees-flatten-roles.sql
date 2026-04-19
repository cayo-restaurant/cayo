-- =============================================
-- Cayo: flatten employee roles
-- Replaces the separate role + secondary_roles columns with a single
-- roles[] list, and moves the "role" concept onto the shifts table
-- (so grouping/rendering in /admin/hours no longer depends on an
-- employee's "primary" role).
--
-- Run this in Supabase SQL Editor, one block at a time.
-- =============================================

-- -------- 1. Add role column to shifts --------
-- Nullable to start so we can backfill from employees.role.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS role employee_role;

-- Backfill: every existing shift gets the current primary role of its employee.
UPDATE shifts s
SET role = e.role
FROM employees e
WHERE s.employee_id = e.id
  AND s.role IS NULL;

-- Lock it in.
ALTER TABLE shifts
  ALTER COLUMN role SET NOT NULL;

-- -------- 2. Add flat roles[] column to employees --------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS roles employee_role[] NOT NULL DEFAULT '{}';

-- Populate from primary + secondary, dedup via DISTINCT.
UPDATE employees
SET roles = ARRAY(
  SELECT DISTINCT r
  FROM unnest(ARRAY[role] || secondary_roles) r
)
WHERE coalesce(array_length(roles, 1), 0) = 0;

-- Every employee must have at least one role.
ALTER TABLE employees
  ADD CONSTRAINT employees_roles_not_empty
  CHECK (array_length(roles, 1) >= 1);

-- -------- 3. Drop the old primary/secondary columns --------
-- These are now fully replaced by roles[].
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_primary_not_in_secondary;

ALTER TABLE employees
  DROP COLUMN IF EXISTS secondary_roles;

ALTER TABLE employees
  DROP COLUMN IF EXISTS role;
