import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { Profile, getProfile, updateProfile } from '../lib/profileService';

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  updateUserFullName: (fullName: string) => Promise<{ error: any }>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserMissionProfile = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const { profile: data, error: fetchError } = await getProfile(
      user.id,
      user.email,
      user.user_metadata?.full_name
    );

    if (fetchError) {
      console.error('Error fetching profile:', fetchError);
      // If profile doesn't exist yet, handle gracefully
      if (fetchError.code === 'PGRST116') {
        setError('Your profile could not be found.');
      } else {
        setError('Failed to load profile information.');
      }
      setProfile(null);
    } else {
      setProfile(data);
      setError(null);
    }

    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => {
    fetchUserMissionProfile();
  }, [fetchUserMissionProfile]);

  const updateUserFullName = async (fullName: string) => {
    if (!user) return { error: new Error('Not authenticated') };
    const { error: updateError } = await updateProfile(user.id, { full_name: fullName });
    if (!updateError) {
      setProfile((prev) =>
        prev
          ? { ...prev, full_name: fullName, updated_at: new Date().toISOString() }
          : prev,
      );
    }
    return { error: updateError };
  };

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading: authLoading || loading,
        error,
        refreshProfile: fetchUserMissionProfile,
        updateUserFullName,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
