-- =============================================
-- Cayo — Admin Realtime: enable postgres_changes
-- =============================================
-- Purpose:
--   Allow the server-side SSE endpoint (app/api/admin/stream/route.ts)
--   to receive INSERT/UPDATE/DELETE events on the three tables the
--   admin dashboard cares about. Supabase's default `supabase_realtime`
--   publication is empty on new projects, so we add the tables here.
--
-- Safety:
--   Each ADD TABLE is wrapped in a DO block that checks the publication
--   membership first, so the migration is idempotent — re-running it
--   will no-op on tables already in the publication.
--
-- Run order:
--   Run AFTER supabase-schema.sql, supabase-migration-map.sql, and
--   supabase-migration-assignments.sql (which create the three tables).
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'reservations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'reservation_tables'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reservation_tables';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'restaurant_tables'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables';
  END IF;
END $$;
