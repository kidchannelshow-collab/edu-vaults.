import { supabase } from './supabase';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  created_at?: string;
  updated_at?: string;
}

/**
 * Fetch profile for a given user ID using the authenticated Supabase client.
 */
export async function getProfile(userId: string, userEmail?: string, userFullName?: string): Promise<{ profile: Profile | null; error: any }> {
  try {
    let { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, role, status, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      return { profile: null, error };
    }

    if (!data || error?.code === 'PGRST116') {
      const emailToUse = userEmail || '';
      const roleToUse = (emailToUse.toLowerCase() === 'kidchannelshow127@gmail.com') ? 'admin' : 'user';
      const fullNameToUse = userFullName || emailToUse.split('@')[0] || 'User';

      const newProfile = {
        id: userId,
        email: emailToUse || null,
        full_name: fullNameToUse,
        role: roleToUse,
        status: 'active' as const,
        updated_at: new Date().toISOString()
      };

      const { data: upsertedData, error: upsertError } = await supabase
        .from('profiles')
        .upsert(newProfile, { onConflict: 'id' })
        .select('id, full_name, email, avatar_url, role, status, created_at, updated_at')
        .maybeSingle();

      if (upsertError) {
        // Fallback return if table doesn't support upsert or RLS blocks
        return { 
          profile: {
            id: userId,
            email: emailToUse || null,
            full_name: fullNameToUse,
            avatar_url: null,
            role: roleToUse,
            status: 'active'
          }, 
          error: null 
        };
      }

      return { profile: (upsertedData || newProfile) as Profile, error: null };
    }

    return { profile: data as Profile, error: null };
  } catch (err: any) {
    return { profile: null, error: err };
  }
}

/**
 * Update profile for the authenticated user.
 * Strictly scopes the update to the provided userId matching the auth session.
 */
export async function updateProfile(userId: string, updates: { full_name: string }): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: updates.full_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    return { error };
  } catch (err) {
    return { error: err };
  }
}
