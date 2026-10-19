-- ==================================================
-- MIGRATION: Converge Security State (order-safe, idempotent)
-- EduVault Database Migration
-- ==================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The migrations in this directory are NOT order-safe. Because each one is
-- applied by hand in the SQL Editor and nothing tracks what has run, re-running
-- an EARLIER file silently reopens holes that a LATER file deliberately closed.
-- Two of these were observed live on 2026-10-15:
--
--   1. `migration_storage.sql` re-creates the storage policy
--      "Authenticated users can read educational materials". That policy was
--      removed by `migration_single_material.sql` precisely because it let ANY
--      free account mint a signed URL for ANY paid PDF — a complete paywall
--      bypass. Re-running the storage file puts it back.
--
--   2. `migration_security_hardening.sql` re-creates the SELECT policy
--      "Users can view published materials", whose `auth.uid() IS NULL` branch
--      makes `public.materials` readable by anon — including the `file_path`
--      column that `migration_fix_pipeline.sql` removed client access to.
--
-- The correct END state is defined by `migration_fix_pipeline.sql` +
-- `migration_single_material.sql`. This file restates that end state and is
-- safe to run at ANY time, in ANY order, as many times as you like. Run it
-- after any other migration, and after any doubt.
-- ==================================================

--------------------------------------------------------------------------------
-- 1. public.materials — admin + service_role only
--------------------------------------------------------------------------------
-- Clients read the catalogue through the `materials_public` view. That view is
-- an owner-rights (definer) view, so it bypasses RLS on this base table and
-- keeps working with the policies below dropped. Any permissive SELECT policy
-- here re-exposes `file_path` to anyone holding the publishable key, which
-- ships in the client bundle.
DROP POLICY IF EXISTS "Public can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can read published materials" ON public.materials;
DROP POLICY IF EXISTS "Users can view published materials" ON public.materials;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
CREATE POLICY "Admins can manage materials"
  ON public.materials
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 2. storage — keep the private PDF bucket private
--------------------------------------------------------------------------------
-- Signed URLs are minted server-side by the `get-secure-material` Edge Function
-- using the service_role key, which bypasses storage RLS entirely. No client
-- SELECT policy on this bucket is needed, and any that exists is a bypass.
DROP POLICY IF EXISTS "Authenticated users can read educational materials" ON storage.objects;

INSERT INTO storage.buckets (id, name, public)
VALUES ('educational-materials', 'educational-materials', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Admins can manage educational materials bucket" ON storage.objects;
CREATE POLICY "Admins can manage educational materials bucket"
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'educational-materials' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    bucket_id = 'educational-materials' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 3. storage — the preview bucket stays world-readable
--------------------------------------------------------------------------------
-- These are marketing samples, intentionally public so <img src> works on the
-- landing page. The protected PDFs live in a different bucket and are never
-- mirrored here.
INSERT INTO storage.buckets (id, name, public)
VALUES ('material-previews', 'material-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can read material previews" ON storage.objects;
CREATE POLICY "Public can read material previews"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'material-previews');

DROP POLICY IF EXISTS "Admins can manage material previews" ON storage.objects;
CREATE POLICY "Admins can manage material previews"
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'material-previews' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    bucket_id = 'material-previews' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 4. Flagship price constraint
--------------------------------------------------------------------------------
-- `price integer NOT NULL DEFAULT 0` plus this CHECK means an INSERT that omits
-- price FAILS (0 != 1500) rather than storing a default. Re-asserted so the
-- guard cannot silently disappear. Normalises any stray row first.
UPDATE public.materials SET price = 1500 WHERE price IS DISTINCT FROM 1500;

ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_flagship_price_check;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_flagship_price_check CHECK (price = 1500);

--------------------------------------------------------------------------------
-- 5. Verification — run these and read the output
--------------------------------------------------------------------------------
-- Expect exactly ONE row: "Admins can manage materials" | ALL
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'materials';

-- Expect NO row for "Authenticated users can read educational materials".
-- Expected set: the two admin-manage policies + "Public can read material previews".
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- Expect public = false for educational-materials, true for material-previews.
SELECT id, public FROM storage.buckets WHERE id IN ('educational-materials', 'material-previews');
