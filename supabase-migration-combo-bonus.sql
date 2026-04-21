-- Migration: add combo_bonus_per_pair to restaurant_tables
-- Tables 20-25 are in the sofa zone: every pair of joined tables
-- adds 1 extra seat (the sofa corner). bonus = floor(n_tables / 2).

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS combo_bonus_per_pair INTEGER NOT NULL DEFAULT 0;

UPDATE restaurant_tables
  SET combo_bonus_per_pair = 1
  WHERE table_number BETWEEN 20 AND 25;

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_combo_bonus
  ON restaurant_tables(combo_bonus_per_pair)
  WHERE combo_bonus_per_pair > 0;
