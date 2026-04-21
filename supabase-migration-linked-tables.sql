-- Migration: add link_group_id + combo_zone to restaurant_tables
-- Run this once in the Supabase SQL editor.
--
-- link_group_id  → fixed pairs/triples that must ALL be free to be combined
--                  (tables 1-3, 4-6, 8-9, 10-11, 12-13, 14-15)
--
-- combo_zone     → flexible zone: any contiguous run of 2-4 free tables
--                  (no gaps in table_number order) can be combined
--                  (tables 20-25, zone = 1)
--
-- Bar seats 101-110 are handled by consecutive-seat logic; no column needed.

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS link_group_id UUID;

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS combo_zone INTEGER;

-- ── Fixed link groups ─────────────────────────────────────────────────────────
DO $$
DECLARE
  g_8_9    UUID := gen_random_uuid();
  g_10_11  UUID := gen_random_uuid();
  g_12_13  UUID := gen_random_uuid();
  g_14_15  UUID := gen_random_uuid();
  g_1_3    UUID := gen_random_uuid();
  g_4_6    UUID := gen_random_uuid();
BEGIN
  UPDATE restaurant_tables SET link_group_id = g_8_9   WHERE table_number IN (8,  9);
  UPDATE restaurant_tables SET link_group_id = g_10_11 WHERE table_number IN (10, 11);
  UPDATE restaurant_tables SET link_group_id = g_12_13 WHERE table_number IN (12, 13);
  UPDATE restaurant_tables SET link_group_id = g_14_15 WHERE table_number IN (14, 15);
  UPDATE restaurant_tables SET link_group_id = g_1_3   WHERE table_number IN (1, 2, 3);
  UPDATE restaurant_tables SET link_group_id = g_4_6   WHERE table_number IN (4, 5, 6);
END $$;

-- ── Flexible combo zone (tables 20-25) ────────────────────────────────────────
-- Zone 1: any contiguous run of 2-4 tables, no gaps, max 4 tables per booking.
UPDATE restaurant_tables
  SET combo_zone = 1
  WHERE table_number BETWEEN 20 AND 25;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_link_group_id
  ON restaurant_tables(link_group_id)
  WHERE link_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_combo_zone
  ON restaurant_tables(combo_zone)
  WHERE combo_zone IS NOT NULL;
