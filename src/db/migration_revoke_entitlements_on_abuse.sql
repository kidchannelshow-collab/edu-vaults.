-- ==================================================
-- MIGRATION: Revoke entitlements on screenshot abuse (3-strike lock)
-- Run in the Supabase SQL Editor. Idempotent.
-- ==================================================
--
-- The reader locks an account on the third screenshot/print strike. The account
-- suspension is handled by `suspend_account_screenshot_abuse()`; this function
-- withdraws the PAID access itself by moving every active entitlement for the
-- caller to 'revoked'.
--
-- SECURITY DEFINER is required: `entitlements` is writable by admins only, and
-- a student must not be able to revoke (or re-grant) entitlements generally.
-- This function can only ever revoke the CALLER's own rows, and only downward.

CREATE OR REPLACE FUNCTION public.revoke_my_entitlements_on_abuse()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_updated integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.entitlements
  SET status = 'revoked'
  WHERE user_id = v_user_id
    AND status <> 'revoked';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.access_logs (user_id, event_type, metadata)
  VALUES (
    v_user_id,
    'entitlements_revoked_screenshot_abuse',
    jsonb_build_object('reason', 'screenshot_limit_exceeded', 'strikes', 3, 'revoked', v_updated)
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_my_entitlements_on_abuse() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_my_entitlements_on_abuse() TO authenticated;

NOTIFY pgrst, 'reload schema';
