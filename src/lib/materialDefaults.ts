/**
 * Canonical display fallbacks for the flagship material.
 *
 * These are used ONLY when the database row has no title/description — the live
 * values from `materials` / `materials_public` always win. Keeping them in one
 * module stops different screens drifting to different placeholder copy.
 */
export const FALLBACK_MATERIAL_TITLE = 'THE NITTY-GRITTY OF JUPEB';
export const FALLBACK_MATERIAL_DESCRIPTION =
  'THE ULTIMATE GUIDE EVERY JUPEB STUDENT NEEDS TO SUCCEED AND SECURE UNIVERSITY ADMISSION';
