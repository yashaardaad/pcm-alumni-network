'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  /** False until we know whether someone is signed in and have loaded their profile. */
  ready: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null);

  useEffect(() => {
    // Fires once with the stored session, then again on every sign in or sign out.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchProfile(userId).then((profile) => {
      if (alive) setLoaded({ userId, profile });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo<AuthState>(() => {
    const profileLoaded = userId !== null && loaded?.userId === userId;
    return {
      session,
      profile: profileLoaded ? (loaded?.profile ?? null) : null,
      ready: sessionReady && (userId === null || profileLoaded),
      refreshProfile: async () => {
        if (userId) setLoaded({ userId, profile: await fetchProfile(userId) });
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [session, sessionReady, userId, loaded]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in, approved person. Only call this from pages inside app/(app). */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useMe was called before a profile was loaded');
  return profile;
}
