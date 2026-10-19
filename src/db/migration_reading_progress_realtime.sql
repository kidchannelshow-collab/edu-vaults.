-- ==================================================
-- MIGRATION: Realtime updates for reading progress
-- Run in the Supabase SQL Editor. Idempotent.
-- ==================================================
--
-- The Dashboard card subscribes to `reading_progress` so its percentage updates
-- live while a student reads in another view/tab. Supabase Realtime only
-- streams tables in the `supabase_realtime` publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reading_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reading_progress;
  END IF;
END $$;

ALTER TABLE public.reading_progress REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
