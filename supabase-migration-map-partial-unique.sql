-- =============================================
-- Cayo map — partial unique constraint on table_number
-- Run this in Supabase SQL Editor
-- =============================================
--
-- Problem:
--   The original migration declared `table_number INT NOT NULL UNIQUE`, which
--   creates a UNIQUE constraint that applies to ALL rows — including ones
--   we soft-deleted (active=false). That means a soft-deleted table still
--   "owns" its number forever, blocking anyone else from reusing it.
--
-- Fix:
--   Drop the unconditional UNIQUE constraint and replace it with a partial
--   unique INDEX that only enforces uniqueness for active rows. This lets
--   the number become reusable the moment a table is soft-deleted.
--
-- Idempotent: safe to rerun.
-- =============================================

-- 1) Drop the implicit UNIQUE constraint created by the column declaration.
--    In Postgres the auto-generated name is <table>_<column>_key.
ALTER TABLE public.restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_table_number_key;

-- 2) Replace with a partial unique index (only active rows).
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_table_number_active_uniq
  ON public.restaurant_tables (table_number)
  WHERE active = true;
