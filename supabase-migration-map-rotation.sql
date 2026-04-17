-- =============================================
-- Cayo map — add rotation column to restaurant_tables
-- Run this in Supabase SQL Editor
-- =============================================
--
-- Adds a rotation column (0/90/180/270 degrees) so admins can rotate
-- tables on the map. This migration is idempotent.
-- =============================================

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0
  CHECK (rotation IN (0, 90, 180, 270));
