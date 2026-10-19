-- ==================================================
-- MIGRATION: Single Flagship Material, Two-Page Preview, Public Read View
-- EduVault Database Migration
-- Run AFTER: migration_materials.sql, migration_storage.sql, migration_security_hardening.sql
-- ==================================================

--------------------------------------------------------------------------------
-- 1. PREVIEW IMAGES COLUMN
--------------------------------------------------------------------------------
-- Public URLs of the sample pages (first two pages) shown before purchase.
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS preview_images text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.materials.preview_images IS
  'Public URLs of the two-page preview images shown to prospective buyers. Never contains the protected PDF.';

--------------------------------------------------------------------------------
-- 2. SINGLE FLAGSHIP MATERIAL — PIN PRICE TO ₦1,500
--------------------------------------------------------------------------------
-- The platform sells exactly one material. The price column stays the single
-- source of truth (the create-payment Edge Function charges this value), so we
-- normalise the data rather than hardcoding the amount in application code.
UPDATE public.materials SET price = 1500 WHERE price IS DISTINCT FROM 1500;

-- Guard against a future edit silently repricing the flagship.
ALTER TABLE public.materials
  DROP CONSTRAINT IF EXISTS materials_flagship_price_check;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_flagship_price_check CHECK (price = 1500);

--------------------------------------------------------------------------------
-- 3. PUBLIC READ VIEW — materials_public (NEVER EXPOSES file_path)
--------------------------------------------------------------------------------
-- This view is the ONLY catalogue surface for anon/authenticated clients.
-- It is deliberately an owner-rights (definer) view: it bypasses RLS on the
-- base table so the storefront can read published metadata WITHOUT holding any
-- SELECT grant on public.materials (which would expose file_path).
-- Safety comes from the projection (no file_path, no metadata) plus the
-- is_published = true predicate — keep both intact when editing.
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

COMMENT ON VIEW public.materials_public IS
  'Public catalogue. Exposes published material metadata + preview images only. Must never expose file_path.';

-- Replace the default owner-only grant with read access for the app roles.
REVOKE ALL ON public.materials_public FROM PUBLIC;
GRANT SELECT ON public.materials_public TO anon, authenticated;

--------------------------------------------------------------------------------
-- 4. LOCK DOWN public.materials TO ADMINS ONLY
--------------------------------------------------------------------------------
-- Previously anon/authenticated could SELECT published rows of the base table,
-- which leaked file_path (the internal protected-PDF storage path). Clients now
-- read materials_public instead; the base table is admin + service_role only.
DROP POLICY IF EXISTS "Public can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can read published materials" ON public.materials;
DROP POLICY IF EXISTS "Users can view published materials" ON public.materials;

-- "Admins can manage materials" (FOR ALL) remains the single non-service policy.
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 5. CLOSE THE PAYWALL BYPASS ON THE PRIVATE BUCKET
--------------------------------------------------------------------------------
-- The policy below granted EVERY authenticated user SELECT on EVERY object in
-- the private 'educational-materials' bucket. Because file_path was readable
-- from the base table, any free account could mint its own signed URL for any
-- paid PDF and download it — fully bypassing entitlements.
--
-- It was never required: signed URLs are generated server-side with the
-- service_role key, which bypasses storage RLS entirely.
DROP POLICY IF EXISTS "Authenticated users can read educational materials" ON storage.objects;

-- Bucket stays private. Only the admin policy manages it; consumers reach files
-- exclusively through the get-secure-material Edge Function's 60s signed URL.
UPDATE storage.buckets SET public = false WHERE id = 'educational-materials';

--------------------------------------------------------------------------------
-- 6. PUBLIC PREVIEW BUCKET (two-page samples)
--------------------------------------------------------------------------------
-- Preview images are marketing material and are intentionally world-readable.
-- The protected PDFs live in a different bucket and are never mirrored here.
INSERT INTO storage.buckets (id, name, public)
VALUES ('material-previews', 'material-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Anyone may read preview images (needed for <img src> on the public landing page).
DROP POLICY IF EXISTS "Public can read material previews" ON storage.objects;
CREATE POLICY "Public can read material previews"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'material-previews');

-- Only admins may add/remove previews.
DROP POLICY IF EXISTS "Admins can manage material previews" ON storage.objects;
CREATE POLICY "Admins can manage material previews"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'material-previews'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    bucket_id = 'material-previews'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 7. VERIFY
--------------------------------------------------------------------------------
/*
  -- anon must NOT be able to read the base table (expect 0 rows / denied):
  set role anon;
  select * from public.materials limit 1;        -- denied (no policy for anon)
  select file_path from public.materials limit 1;-- denied
  select * from public.materials_public limit 1; -- 1 row, no file_path column

  -- previews are public, protected PDFs are not:
  --   <project>/storage/v1/object/public/material-previews/previews/<id>/p1.png  -> 200
  --   <project>/storage/v1/object/educational-materials/materials/<id>/x.pdf     -> 400/403

  -- authenticated (non-paying) must NOT be able to mint a signed URL:
  const { data, error } = await supabase.storage
    .from('educational-materials')
    .createSignedUrl('<known file_path>', 60);   -- expect error
*/
