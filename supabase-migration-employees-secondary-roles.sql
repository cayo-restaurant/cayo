-- =============================================
-- Cayo: add secondary_roles to employees
-- Run this in Supabase SQL Editor (after the initial employees migration)
-- =============================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS secondary_roles employee_role[] NOT NULL DEFAULT '{}';

-- Safety: primary role should not appear in secondary_roles.
-- App-level validation enforces this too, but we add a DB check as backup.
ALTER TABLE employees
  ADD CONSTRAINT employees_primary_not_in_secondary
  CHECK (NOT (role = ANY (secondary_roles)));
