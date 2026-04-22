-- =============================================
-- Cayo: Employees auth columns
-- Adds phone + password login for hostesses/managers
-- Idempotent — safe to re-run
-- =============================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS password_hash        text,
  ADD COLUMN IF NOT EXISTS last_login_at        timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until         timestamptz;

-- Unique phone (digits only) per active employee — prevents two active
-- employees sharing a phone so login can resolve a single account.
CREATE UNIQUE INDEX IF NOT EXISTS employees_phone_normalized_idx
  ON employees (regexp_replace(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL AND active = true;

-- =============================================
-- Rollback (for reference, don't run in prod):
-- =============================================
-- DROP INDEX IF EXISTS employees_phone_normalized_idx;
-- ALTER TABLE employees
--   DROP COLUMN IF EXISTS locked_until,
--   DROP COLUMN IF EXISTS failed_login_count,
--   DROP COLUMN IF EXISTS last_login_at,
--   DROP COLUMN IF EXISTS password_hash;
