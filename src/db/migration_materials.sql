-- EduVault Material Management Migration
-- 1. Allow file_path to be NULL temporarily for draft materials created before PDF upload
ALTER TABLE public.materials ALTER COLUMN file_path DROP NOT NULL;

-- 2. Ensure RLS is enabled on materials
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing material policies if any and recreate robust policies
DROP POLICY IF EXISTS "Public can view published materials" ON public.materials;
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;

-- Normal users and visitors can view published materials
CREATE POLICY "Public can view published materials"
  ON public.materials
  FOR SELECT
  USING (is_published = true);

-- Authenticated admins can insert, update, and manage materials
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
