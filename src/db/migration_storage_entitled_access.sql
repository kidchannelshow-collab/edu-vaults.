-- ==================================================
-- MIGRATION: Entitlement-scoped storage access (reader fallback)
-- Run in the Supabase SQL Editor. Idempotent.
-- ==================================================
--
-- WHY THIS EXISTS
-- ---------------
-- Signed URLs are normally minted by the `get-secure-material` Edge Function
-- with the service_role key. If that function is not deployed (or the gateway
-- is unreachable), an entitled student had no path to the PDF and saw
-- "secure reader could not be connected".
--
-- This policy lets an authenticated user LIST and SIGN objects in the private
-- `educational-materials` bucket ONLY when they hold an active, unexpired
-- entitlement for the material whose id appears in the object path
-- (`materials/<material_id>/<file>.pdf`).
--
-- It is NOT a paywall bypass: the entitlement check is evaluated by Postgres on
-- every request, including createSignedUrl and list. A student with no active
-- entitlement gets zero rows and cannot mint anything.
--
-- Object paths are expected to follow `materials/<uuid>/<filename>`.
-- ==================================================

-- Speed up the per-object EXISTS check.
CREATE INDEX IF NOT EXISTS entitlements_user_material_active_idx
  ON public.entitlements (user_id, material_id)
  WHERE status = 'active';

DROP POLICY IF EXISTS "Entitled users can sign their purchased material" ON storage.objects;
CREATE POLICY "Entitled users can sign their purchased material"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'educational-materials'
    AND split_part(name, '/', 1) = 'materials'
    AND EXISTS (
      SELECT 1
      FROM public.entitlements e
      WHERE e.user_id = auth.uid()
        AND e.status = 'active'
        AND (e.expires_at IS NULL OR e.expires_at > timezone('utc'::text, now()))
        AND e.material_id::text = split_part(name, '/', 2)
    )
  );

-- The private bucket stays private (no anon access, no public URLs).
UPDATE storage.buckets SET public = false WHERE id = 'educational-materials';

NOTIFY pgrst, 'reload schema';

--------------------------------------------------------------------------------
-- VERIFY
--------------------------------------------------------------------------------
/*
  -- As an entitled student (authenticated role):
  --   select from storage.objects where bucket_id='educational-materials';
  --   -> only their own material's objects

  -- createSignedUrl succeeds only for those objects:
  --   supabase.storage.from('educational-materials')
  --     .createSignedUrl('materials/<their-material-id>/<file>.pdf', 3600)
*/
