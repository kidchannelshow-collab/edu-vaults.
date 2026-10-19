-- ==================================================
-- MIGRATION: user_material_progress (live reading progress)
-- Run in the Supabase SQL Editor. Idempotent.
-- ==================================================
--
-- A lightweight per-user/per-material progress row that the reader upserts on
-- scroll (debounced). The Dashboard reads it first and falls back to the older
-- `reading_progress` table when no row exists yet.
--
-- RLS: a student may read/write only their own row; admins may read all.

CREATE TABLE IF NOT EXISTS public.user_material_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  last_page integer NOT NULL DEFAULT 1,
  total_pages integer NOT NULL DEFAULT 0,
  progress_percent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, material_id)
);

ALTER TABLE public.user_material_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own material progress" ON public.user_material_progress;
CREATE POLICY "Users can view own material progress"
  ON public.user_material_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own material progress" ON public.user_material_progress;
CREATE POLICY "Users can insert own material progress"
  ON public.user_material_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own material progress" ON public.user_material_progress;
CREATE POLICY "Users can update own material progress"
  ON public.user_material_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all material progress" ON public.user_material_progress;
CREATE POLICY "Admins can view all material progress"
  ON public.user_material_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Realtime for the Dashboard card.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_material_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_material_progress;
  END IF;
END $$;

ALTER TABLE public.user_material_progress REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
