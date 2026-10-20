-- ==================================================
-- MIGRATION: chapter/section label for live reading progress
-- Run in the Supabase SQL Editor. Idempotent.
-- ==================================================
--
-- SecurePdfReader persists the current chapter title (resolved from the PDF
-- outline) or a page-range fallback alongside the page number and percentage,
-- so the Dashboard can show "42% Completed · Chapter 3" on return.

ALTER TABLE public.user_material_progress
  ADD COLUMN IF NOT EXISTS last_section text;

NOTIFY pgrst, 'reload schema';
