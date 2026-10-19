import { supabase } from './supabase';

export interface ReadingProgressRecord {
  id: string;
  user_id: string;
  material_id: string;
  current_page: number;
  total_pages: number;
  progress_percent: number;
  last_read_at: string;
}

/**
 * Fetch reading progress for a user and material
 */
export async function getReadingProgress(userId: string, materialId: string): Promise<{ progress: ReadingProgressRecord | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('material_id', materialId)
      .maybeSingle();

    if (error) {
      return { progress: null, error };
    }

    return { progress: data as ReadingProgressRecord, error: null };
  } catch (err) {
    return { progress: null, error: err };
  }
}

/**
 * Save or update reading progress for a user and material
 */
export async function saveReadingProgress(
  userId: string,
  materialId: string,
  currentPage: number,
  totalPages: number = 6
): Promise<{ success: boolean; error: any }> {
  try {
    const progressPercent = Math.min(100, Math.max(0, Math.round((currentPage / totalPages) * 100)));
    const now = new Date().toISOString();

    // Check if record exists
    const { data: existing } = await supabase
      .from('reading_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('material_id', materialId)
      .maybeSingle();

    let error = null;

    if (existing) {
      const { error: updateError } = await supabase
        .from('reading_progress')
        .update({
          current_page: currentPage,
          total_pages: totalPages,
          progress_percent: progressPercent,
          last_read_at: now,
        })
        .eq('id', existing.id)
        .eq('user_id', userId); // security check
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('reading_progress')
        .insert({
          user_id: userId,
          material_id: materialId,
          current_page: currentPage,
          total_pages: totalPages,
          progress_percent: progressPercent,
          last_read_at: now,
        });
      error = insertError;
    }

    if (error) {
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}
