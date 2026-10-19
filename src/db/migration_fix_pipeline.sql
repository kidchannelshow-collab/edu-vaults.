-- ==================================================
-- MIGRATION: Fix the flagship material pipeline
-- Run this in the Supabase SQL Editor on project mjusqmgjeucjjjehlbzc.
-- Idempotent — safe to run more than once.
-- ==================================================
--
-- WHY THIS IS NEEDED (verified against the live database, not assumed):
--
--   GET /rest/v1/materials_public?select=preview_images
--     -> HTTP 400  {"code":"42703","message":"column materials_public.preview_images does not exist"}
--
--   `migration_single_material.sql` was never applied. The live schema is a
--   version behind the application code, which breaks THREE things at once:
--
--   1. "Material could not load" — getFlagshipMaterial() requests
--      preview_images (PUBLIC_MATERIAL_COLUMNS) and PostgREST 400s. The
--      storefront and the material page both fail to load.
--   2. Material deletion -> "Material not found." — deleteMaterial() selects
--      preview_images too, so the same 42703 is mis-reported as a missing row.
--   3. The two-page preview cannot work at all — the column does not exist.
--
--   Also verified live: an anon key can still read public.materials, and the
--   flagship price is 1000, not the intended 1500.
-- ==================================================

--------------------------------------------------------------------------------
-- 1. preview_images — the column the client already depends on
--------------------------------------------------------------------------------
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS preview_images text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.materials.preview_images IS
  'Public URLs of the two-page preview images shown to prospective buyers. Never contains the protected PDF.';

--------------------------------------------------------------------------------
-- 2. Recreate the public view so it actually exposes preview_images
--------------------------------------------------------------------------------
-- The live view predates this column, so it must be dropped and rebuilt.
-- Owner-rights (definer) view: it deliberately bypasses RLS on the base table
-- so anon can read published metadata WITHOUT holding any SELECT grant on
-- public.materials (which would expose file_path). Safety comes from the
-- projection (no file_path) plus the is_published predicate — keep both.
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

REVOKE ALL ON public.materials_public FROM PUBLIC;
GRANT SELECT ON public.materials_public TO anon, authenticated;

--------------------------------------------------------------------------------
-- 3. Stop leaking public.materials to anonymous clients
--------------------------------------------------------------------------------
-- Verified live: an anon key still receives rows (including the file_path
-- column) from public.materials. The base table must be admin + service_role
-- only; all client reads go through materials_public.
DROP POLICY IF EXISTS "Public can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Authenticated users can read published materials" ON public.materials;
DROP POLICY IF EXISTS "Users can view published materials" ON public.materials;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 4. Flagship price
--------------------------------------------------------------------------------
-- The live row is priced 1000. The product is sold at 1500, and create-payment
-- charges materials.price as the authoritative amount — so this is the line
-- that decides what customers are actually billed. Remove or adjust if 1000
-- was intentional.
UPDATE public.materials SET price = 1500 WHERE price IS DISTINCT FROM 1500;

ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_flagship_price_check;
ALTER TABLE public.materials
  ADD CONSTRAINT materials_flagship_price_check CHECK (price = 1500);

--------------------------------------------------------------------------------
-- 5. Preview bucket + policies
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('material-previews', 'material-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can read material previews" ON storage.objects;
CREATE POLICY "Public can read material previews"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'material-previews');

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

-- The protected PDF bucket stays private, and the blanket authenticated-SELECT
-- policy that let any free account mint its own signed URL is removed (signed
-- URLs are generated server-side with service_role, which bypasses storage RLS).
DROP POLICY IF EXISTS "Authenticated users can read educational materials" ON storage.objects;
UPDATE storage.buckets SET public = false WHERE id = 'educational-materials';

--------------------------------------------------------------------------------
-- 6. Real session telemetry for the Settings page
--------------------------------------------------------------------------------
-- device_sessions has no IP or user-agent column, which is why Settings was
-- showing a hardcoded "IP: 192.168.1.84 / Chrome on macOS". These columns let
-- the session list show real data.
ALTER TABLE public.device_sessions
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

--------------------------------------------------------------------------------
-- 7. Realtime for the admin console
--------------------------------------------------------------------------------
-- Supabase Realtime only streams changes for tables in the `supabase_realtime`
-- publication. Without this, every `.channel().on('postgres_changes', …)`
-- subscribes successfully and then never receives anything.
--
-- Realtime is RLS-aware: a subscriber only gets rows it may SELECT, so these
-- streams are admin-only in practice (the "Admins can manage …" policies).
--
-- REPLICA IDENTITY FULL makes the OLD row available on UPDATE/DELETE, which the
-- console needs to react to a payment being confirmed or a session revoked.
--
-- If `ALTER PUBLICATION` is refused (it needs ownership of supabase_realtime),
-- enable the same tables via Dashboard -> Database -> Replication instead; the
-- effect is identical. The REPLICA IDENTITY statements are independent of that
-- and should still be run.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'access_logs',
    'payments',
    'entitlements',
    'device_sessions',
    'profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 8. Screenshot-abuse account lock
--------------------------------------------------------------------------------
-- The reader locks an account on the third screenshot strike. The lock has to
-- live on profiles.status rather than on the device, because a device-only lock
-- is bypassed by clearing localStorage — which simply mints a new device id.
--
-- SECURITY DEFINER is required: a student must not be able to write their own
-- profiles.status, but this function is the one legitimate self-service path to
-- it, and it can only ever move the account to 'suspended' (never back).
--
-- Admins reinstate from Admin -> Users -> Reactivate, which already sets
-- status back to 'active' via updateUserStatus().
CREATE OR REPLACE FUNCTION public.suspend_account_screenshot_abuse()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Never suspend an admin, and never un-suspend: this can only tighten.
  UPDATE public.profiles
  SET status = 'suspended'
  WHERE id = v_user_id
    AND role <> 'admin'
    AND status <> 'suspended';

  INSERT INTO public.access_logs (user_id, event_type, metadata)
  VALUES (
    v_user_id,
    'account_suspended_screenshot_abuse',
    jsonb_build_object('reason', 'screenshot_limit_exceeded', 'strikes', 3)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_account_screenshot_abuse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_account_screenshot_abuse() TO authenticated;

--------------------------------------------------------------------------------
-- 9. Admin material deletion (RLS-proof)
--------------------------------------------------------------------------------
-- Deleting a material from the browser is unreliable. The DELETE is subject to
-- the "Admins can manage materials" RLS policy, and when that policy's EXISTS
-- check on profiles does not resolve as expected the statement affects ZERO
-- rows while PostgREST reports NO error. The UI then cannot tell "deleted" from
-- "RLS said no" — which is exactly the "Nothing was deleted" warning.
--
-- This SECURITY DEFINER function performs the delete with definer rights, so
-- RLS on materials cannot silently swallow it, while still verifying that the
-- CALLER is an active admin before doing anything.
--
-- Deliberately does NOT delete payment rows: those are financial records, and
-- payments.material_id is ON DELETE RESTRICT, so a material with payments
-- cannot be removed at all and must be unpublished instead.
--
-- BEHAVIOUR CHANGE: unlike the old client-side guard, this clears derived
-- access rows (entitlements, reading_progress) rather than refusing. Those are
-- downstream of a payment, so a material with no payments has no entitlement
-- anyone paid for. It still refuses outright when payments exist.
CREATE OR REPLACE FUNCTION public.admin_delete_material(p_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin      boolean;
  v_payment_count integer;
  v_deleted       integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden: admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_payment_count
  FROM public.payments
  WHERE material_id = p_material_id;

  IF v_payment_count > 0 THEN
    RAISE EXCEPTION
      'This material has % payment record(s) and cannot be permanently deleted. Unpublish it instead.',
      v_payment_count
      USING ERRCODE = '23503';
  END IF;

  -- Clear derived access rows so no FK can block the delete.
  DELETE FROM public.reading_progress WHERE material_id = p_material_id;
  DELETE FROM public.entitlements     WHERE material_id = p_material_id;

  DELETE FROM public.materials WHERE id = p_material_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO public.access_logs (user_id, event_type, metadata)
    VALUES (
      auth.uid(),
      'material_deleted',
      jsonb_build_object('material_id', p_material_id, 'via', 'admin_delete_material')
    );
  END IF;

  RETURN jsonb_build_object('success', v_deleted > 0, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_material(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_material(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 10. Verify — run these after the statements above
--------------------------------------------------------------------------------
/*
  -- storefront metadata now loads (expect 200 + a row):
  --   /rest/v1/materials_public?select=id,title,price,preview_images

  -- anon must NOT read the base table (expect 200 with [] or 401/403):
  --   /rest/v1/materials?select=id,file_path

  -- previews public, protected PDFs not:
  --   <project>/storage/v1/object/public/material-previews/...      -> 200
  --   <project>/storage/v1/object/educational-materials/...         -> 400/403
*/
