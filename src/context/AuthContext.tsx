import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { authorizeDeviceSession, sendDeviceHeartbeat, checkDeviceSessionActive, revokeCurrentDeviceSession } from '../lib/deviceService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  deviceConflict: { existingDevice?: string; message?: string } | null;
  resolveDeviceConflict: (forceTakeover: boolean) => Promise<{ success: boolean; error?: any }>;
  cancelDeviceConflict: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null; conflict?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null; conflict?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceConflict, setDeviceConflict] = useState<{ existingDevice?: string; message?: string } | null>(null);

  // Authorize device session whenever user becomes active
  const checkAndAuthorizeDevice = async () => {
    const authResult = await authorizeDeviceSession(false);
    if (!authResult.success) {
      if (authResult.conflict) {
        setDeviceConflict({
          existingDevice: authResult.existingDevice,
          message: authResult.message || 'Your EduVault account is currently active on another device.',
        });
      }
    } else {
      setDeviceConflict(null);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkAndAuthorizeDevice();
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkAndAuthorizeDevice();
      } else {
        setDeviceConflict(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Heartbeat & Session Validation interval (every 3 minutes)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      // 1. Send heartbeat
      await sendDeviceHeartbeat();

      // 2. Check if session has been explicitly revoked
      const sessionCheck = await checkDeviceSessionActive();
      if (sessionCheck.revoked) {
        // Session revoked remotely or on another device
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setDeviceConflict({
          message: 'Your EduVault session is no longer active on this device (revoked or superseded).',
        });
      }
    }, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const resolveDeviceConflict = async (forceTakeover: boolean) => {
    if (forceTakeover) {
      const res = await authorizeDeviceSession(true);
      if (res.success) {
        setDeviceConflict(null);
        return { success: true };
      }
      return { success: false, error: res.error };
    }
    return { success: false };
  };

  const cancelDeviceConflict = async () => {
    await revokeCurrentDeviceSession();
    await supabase.auth.signOut();
    setDeviceConflict(null);
    setUser(null);
    setSession(null);
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (!error && data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email: email,
        updated_at: new Date().toISOString(),
      });

      // Authorize device session
      const authRes = await authorizeDeviceSession(false);
      if (!authRes.success && authRes.conflict) {
        setDeviceConflict({
          existingDevice: authRes.existingDevice,
          message: authRes.message,
        });
        return { error: null, conflict: true };
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      const authRes = await authorizeDeviceSession(false);
      if (!authRes.success && authRes.conflict) {
        setDeviceConflict({
          existingDevice: authRes.existingDevice,
          message: authRes.message,
        });
        return { error: null, conflict: true };
      }
    }

    return { error };
  };

  const signOut = async () => {
    await revokeCurrentDeviceSession();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setDeviceConflict(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      deviceConflict, 
      resolveDeviceConflict, 
      cancelDeviceConflict, 
      signUp, 
      signIn, 
      signOut, 
      resetPassword 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
