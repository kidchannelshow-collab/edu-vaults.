-- ==================================================
-- MIGRATION: Fix material permissions (materials + materials_public)
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run at any time.
-- ==================================================
--
-- SYMPTOM
-- -------
-- Loading a book preview / checking access throws:
--     "permission denied for table materials" (42501)
-- or the storefront/admin screen 400s on `materials_public`.
--
-- CAUSE
-- -----
-- `public.materials` is (correctly) admin-only, and every client-facing read
-- must go through the `materials_public` view. If that view is missing, points
-- at an older column set, has no grant for anon/authenticated, or was created
-- with security_invoker = true (so it inherits the base table's RLS), every
-- read of it fails — even though the data is perfectly readable.
--
-- WHY THE BASE TABLE STAYS ADMIN-ONLY
-- -----------------------------------
-- RLS is ROW-level. A "published materials are readable by anon" policy on
-- public.materials would expose EVERY column of those rows — including
-- `file_path`, the private storage key for paid PDFs. Any visitor could then
-- mint signed URLs for paid content. The safe equivalent of "published
-- metadata, everything except file_path" is the projected view below, which is
-- why clients read the view and never the base table.
-- ==================================================

BEGIN;

--------------------------------------------------------------------------------
-- 1. public.materials — RLS on, admins FOR ALL, no permissive client policy
--------------------------------------------------------------------------------
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can read published materials" ON public.materials;
DROP POLICY IF EXISTS "Users can view published materials" ON public.materials;

DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
CREATE POLICY "Admins can manage materials"
  ON public.materials
  FOR ALL
  TO authenticated
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

-- The service_role key (Edge Functions) bypasses RLS, but it still needs the
-- table privilege. Supabase grants this by default; restate it so a previous
-- REVOKE cannot strand the server-side functions.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO service_role;

--------------------------------------------------------------------------------
-- 2. public.materials_public — rebuilt, correctly granted, definer-rights
--------------------------------------------------------------------------------
-- Must be dropped and recreated: CREATE OR REPLACE VIEW cannot add columns,
-- and the live view is a version behind the application code.
DROP VIEW IF EXISTS public.materials_public;

CREATE VIEW public.materials_public AS
SELECT
  id,
  title,
  description,
  subject,
  category,
  estimated_reading_minutes,
  is_published,
  price,
  preview_images,
  created_at,
  updated_at
FROM public.materials
WHERE is_published = true;

-- Deliberately an owner-rights (definer) view: it bypasses RLS on the base
-- table so anon/authenticated can read published metadata WITHOUT holding any
-- SELECT grant on public.materials. Safety comes from the projection (no
-- file_path) plus the is_published predicate.
ALTER VIEW public.materials_public SET (security_invoker = false);

REVOKE ALL ON public.materials_public FROM PUBLIC;
GRANT SELECT ON public.materials_public TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

COMMENT ON VIEW public.materials_public IS
  'Public catalogue. Exposes published material metadata + preview images only. Must never expose file_path.';

-- PostgREST caches the schema; without this the new view can 404 until the
-- next restart even though SQL sees it.
NOTIFY pgrst, 'reload schema';

COMMIT;

--------------------------------------------------------------------------------
-- VERIFY (run after COMMIT)
--------------------------------------------------------------------------------
/*
  -- 1. anon/authenticated catalogue read: expect 200 and the published row(s)
  --    (postgrest role can be tested with the anon publishable key)
  select * from public.materials_public;

  -- 2. the base table must stay closed to clients: expect [] for anon/auth,
  --    and rows only when signed in as an active admin.
  select id, title from public.materials;

  -- 3. exactly one client-facing policy on materials (admin FOR ALL):
  select policyname, cmd, roles
  from pg_policies
  where schemaname = 'public' and tablename = 'materials';

  -- 4. grants on the view:
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_name = 'materials_public';
*/
