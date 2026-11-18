import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { setAccessTokenReader } from '../lib/accessToken';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { userFromAssignedRole } from '../domain/demoAuthAccounts';
import { classifySignInFailure } from '../server/authorizeRequest';
import type { User } from '../types/domain';

type AuthPhase = 'loading' | 'unconfigured' | 'signed_out' | 'signed_in';

interface AuthContextValue {
  phase: AuthPhase;
  appUser: User | null;
  notice: string | null;
  submitting: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function userForSession(session: Session): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || typeof data?.role_id !== 'string') return null;
  return userFromAssignedRole(data.role_id);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [phase, setPhase] = useState<AuthPhase>(isSupabaseConfigured ? 'loading' : 'unconfigured');
  const [appUser, setAppUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(
    isSupabaseConfigured ? null : 'Sign-in is not configured. Add the Supabase project URL and publishable key.'
  );
  const [submitting, setSubmitting] = useState(false);
  const intentionalSignOut = useRef(false);
  const pendingNotice = useRef<string | null>(null);

  const adoptSession = useCallback(async (session: Session | null, event: string) => {
    if (!supabase) return;
    if (!session) {
      setAppUser(null);
      setPhase('signed_out');
      if (pendingNotice.current) {
        setNotice(pendingNotice.current);
        pendingNotice.current = null;
        intentionalSignOut.current = false;
      } else if (event === 'SIGNED_OUT' && !intentionalSignOut.current) {
        setNotice('Your session expired. Sign in again.');
      } else if (intentionalSignOut.current) {
        intentionalSignOut.current = false;
        setNotice(null);
      }
      return;
    }

    const user = await userForSession(session);
    if (!user) {
      pendingNotice.current = 'This account has no assigned application role.';
      intentionalSignOut.current = true;
      setAppUser(null);
      setPhase('signed_out');
      await supabase.auth.signOut();
      return;
    }

    setAppUser(user);
    setPhase('signed_in');
    setNotice(null);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setPhase('unconfigured');
      return;
    }

    let active = true;
    setAccessTokenReader(async () => {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    });

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      void adoptSession(data.session, data.session ? 'INITIAL_SESSION' : 'NO_SESSION');
    });

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return;
      void adoptSession(session, event);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [adoptSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { ok: false as const, message: 'Sign-in is not configured.' };
    }
    setSubmitting(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (error) {
      const rejected = classifySignInFailure(error.message) === 'rejected';
      return {
        ok: false as const,
        message: rejected ? 'Email or password is incorrect.' : 'Sign-in is unavailable. Try again.',
      };
    }
    return { ok: true as const };
  }, []);

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true;
    setAppUser(null);
    setPhase('signed_out');
    setNotice(null);
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ phase, appUser, notice, submitting, signIn, signOut }),
    [phase, appUser, notice, submitting, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
