-- ==================================================
-- MIGRATION: Single Administrator Architecture
-- EduVault Database Migration
-- ==================================================

-- 1. Ensure partial unique index exists to guarantee EXACTLY ONE admin in public.profiles
-- PostgreSQL allows unique indexes with WHERE clauses.
DROP INDEX IF EXISTS unique_single_admin_idx;
CREATE UNIQUE INDEX unique_single_admin_idx 
  ON public.profiles (role) 
  WHERE (role = 'admin');

-- 2. Prevent normal users from updating their own role or status via RLS check
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 3. Prevent admins from removing their own admin role or self-suspending if they are the sole admin
CREATE OR REPLACE FUNCTION public.prevent_admin_self_demotion()
RETURNS TRIGGER AS $$
BEGIN
  -- If the user updating is updating themselves
  IF OLD.id = auth.uid() THEN
    -- Prevent changing role away from admin
    IF OLD.role = 'admin' AND NEW.role != 'admin' THEN
      RAISE EXCEPTION 'Security restriction: Administrators cannot demote themselves or remove their single admin status.';
    END IF;
    -- Prevent suspending themselves
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      RAISE EXCEPTION 'Security restriction: Administrators cannot suspend their own active account.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_prevent_admin_self_demotion ON public.profiles;
CREATE TRIGGER tr_prevent_admin_self_demotion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_self_demotion();
