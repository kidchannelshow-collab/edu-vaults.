-- EduVault Storage Migration: Private Bucket & Policies
-- 1. Create private educational-materials bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('educational-materials', 'educational-materials', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Enable RLS on storage.objects (usually enabled by default)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing storage policies if any
DROP POLICY IF EXISTS "Admins can manage educational materials bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read educational materials" ON storage.objects;

-- 4. Admins can fully manage files in educational-materials bucket
CREATE POLICY "Admins can manage educational materials bucket"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'educational-materials' AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
    AND profiles.status = 'active'
  )
)
WITH CHECK (
  bucket_id = 'educational-materials' AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
    AND profiles.status = 'active'
  )
);

-- 5. Authenticated users can read objects (required for signed URL access)
CREATE POLICY "Authenticated users can read educational materials"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'educational-materials' AND
  auth.role() = 'authenticated'
);
