-- ==================================================
-- MIGRATION: Admin Control Center Foundation
-- EduVault Database Migration
-- ==================================================

-- 1. Add role and status columns to public.profiles if they do not exist
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- 2. Add check constraints for allowed values
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_check,
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_status_check,
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'suspended'));

-- 3. Create indexes for efficient admin lookups
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles(status);

-- 4. Enable RLS on profiles (ensuring it's active)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if needed to recreate cleanly
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

-- 6. Recreate robust RLS policies
-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

-- Users can update their own profile (restricted: cannot change their own role or status)
CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
  );

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
  ON public.profiles 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Admins can update any profile
CREATE POLICY "Admins can update profiles" 
  ON public.profiles 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- 7. Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger for updated_at on profiles
DROP TRIGGER IF EXISTS on_profiles_updated ON public.profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
