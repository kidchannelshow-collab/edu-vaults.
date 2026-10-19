-- ==================================================
-- MIGRATION: Security & Audit Logging Hardening Pass
-- EduVault Database Migration
-- ==================================================

-- 1. Ensure RLS is enabled on all core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- 2. Refine PROFILES RLS Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id AND status = 'active')
  WITH CHECK (
    auth.uid() = id 
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

CREATE POLICY "Admins can update profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- 3. Refine MATERIALS RLS Policies
DROP POLICY IF EXISTS "Public can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;

-- Normal active users can view published materials
CREATE POLICY "Users can view published materials"
  ON public.materials
  FOR SELECT
  USING (
    is_published = true 
    AND (
      auth.uid() IS NULL 
      OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND status = 'active'
      )
    )
  );

-- Admins can manage materials
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

-- 4. Refine ENTITLEMENTS RLS Policies
DROP POLICY IF EXISTS "Users can view own entitlements" ON public.entitlements;
DROP POLICY IF EXISTS "Admins can manage entitlements" ON public.entitlements;

CREATE POLICY "Users can view own entitlements"
  ON public.entitlements
  FOR SELECT
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Admins can manage entitlements"
  ON public.entitlements
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

-- 5. Refine READING PROGRESS RLS Policies
DROP POLICY IF EXISTS "Users can manage own reading progress" ON public.reading_progress;
DROP POLICY IF EXISTS "Admins can view reading progress" ON public.reading_progress;

CREATE POLICY "Users can manage own reading progress"
  ON public.reading_progress
  FOR ALL
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Admins can view reading progress"
  ON public.reading_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.status = 'active'
    )
  );

-- 6. Refine ACCESS LOGS RLS Policies (Append-only for users, read/manage for admins)
DROP POLICY IF EXISTS "Users can view own access logs" ON public.access_logs;
DROP POLICY IF EXISTS "Users can insert own access logs" ON public.access_logs;
DROP POLICY IF EXISTS "Admins can view access logs" ON public.access_logs;

CREATE POLICY "Users can view own access logs"
  ON public.access_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access logs"
  ON public.access_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view access logs"
  ON public.access_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.status = 'active'
    )
  );

-- Ensure NO update or delete policies exist for access_logs for normal users (append-only enforced by absence of policy + RLS)

-- 7. Centralized Secure Audit Logging Function
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_material_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return;
  end if;

  insert into public.access_logs (user_id, material_id, event_type, metadata, created_at)
  values (v_user_id, p_material_id, p_event_type, p_metadata, timezone('utc'::text, now()));
end;
$$;
