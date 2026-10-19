-- ==================================================
-- MIGRATION: Per-page preview URLs (preview_page_1_url / 2_url)
-- Run in the Supabase SQL Editor. Idempotent.
-- ==================================================
--
-- The admin console lets each preview slot be uploaded independently. The
-- array column `preview_images` already stores the ordered set; these two
-- columns expose the same URLs as named fields for the storefront cards,
-- without requiring a PostgREST array index.
--
-- The public view must be rebuilt because it projects columns explicitly.

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS preview_page_1_url text,
  ADD COLUMN IF NOT EXISTS preview_page_2_url text;

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
  preview_page_1_url,
  preview_page_2_url,
  created_at,
  updated_at
FROM public.materials
WHERE is_published = true;

ALTER VIEW public.materials_public SET (security_invoker = false);

REVOKE ALL ON public.materials_public FROM PUBLIC;
GRANT SELECT ON public.materials_public TO anon, authenticated, service_role;

COMMENT ON VIEW public.materials_public IS
  'Public catalogue. Exposes published material metadata + preview images only. Must never expose file_path.';

NOTIFY pgrst, 'reload schema';
