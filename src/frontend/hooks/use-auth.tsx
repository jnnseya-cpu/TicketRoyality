'use client';

import * as React from 'react';

import { withAttestation } from '@/frontend/lib/attest';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { auth, isFirebaseConfigured } from '@/shared/firebase/client';
import { createUserProfile, getUserProfile } from '@/shared/data/repositories';
import type { UserProfile, UserType } from '@/shared/types';

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  /** True when the Firebase web config is absent, so sign-in cannot work at all. */
  demoMode: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile | null>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    userType: UserType;
    profile?: Partial<UserProfile>;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Without Firebase there is no identity at all. This used to read a role out of
    // `localStorage` and synthesise a signed-in profile from it — a convenience for
    // local development, and an identity source in the production auth hook that no
    // server ever agreed to. It went with `/dev-access`, the only thing that could
    // write the key.
    if (!isFirebaseConfigured) {
      setUser(null);
      setUserProfile(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          setUserProfile(await getUserProfile(firebaseUser.uid));
        } catch {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /**
   * Sign in, throttled.
   *
   * `/login` was unthrottled, so a list of breached credentials could be tried at any
   * rate. The guard is asked before the attempt and told the outcome after, so the
   * counters live on the server rather than in the browser that is being brute-forced.
   *
   * Its refusal is thrown as a normal error, so the login form reports it the same way
   * it reports a wrong password — and, importantly, without revealing whether the
   * account exists.
   */
  const signIn = React.useCallback(async (email: string, password: string) => {
    const guard = await fetch('/api/login-guard', {
      method: 'POST',
      // Carries the proof-of-work when one is ready. Its absence does not refuse the
      // sign-in; it halves the number of attempts this identifier and network get.
      headers: await withAttestation({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ identifier: email, outcome: 'attempt' }),
    })
      .then((r) => r.json())
      // A guard that cannot be reached must not lock anyone out of their own account.
      .catch(() => ({ allowed: true }));

    if (guard.allowed === false) throw new Error(guard.error ?? 'Too many attempts.');

    const report = (outcome: 'failed' | 'succeeded') =>
      fetch('/api/login-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email, outcome }),
      }).catch(() => undefined);

    let credential;
    try {
      credential = await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      void report('failed');
      throw error;
    }

    void report('succeeded');
    const profile = await getUserProfile(credential.user.uid);
    setUserProfile(profile);
    return profile;
  }, []);

  const register = React.useCallback<AuthContextValue['register']>(
    async ({ email, password, fullName, userType, profile }) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: fullName });

      const newProfile: UserProfile = {
        uid: credential.user.uid,
        email,
        fullName,
        userType,
        // Organisers must be vetted by the superuser before they can publish.
        status: userType === 'organiser' ? 'pending' : 'approved',
        createdAt: new Date().toISOString(),
        ...profile,
      };

      await createUserProfile(newProfile);
      setUserProfile(newProfile);
      return newProfile;
    },
    []
  );

  const logout = React.useCallback(async () => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setUserProfile(null);
      return;
    }
    await signOut(auth);
    setUserProfile(null);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (!user) return;
    setUserProfile(await getUserProfile(user.uid));
  }, [user]);

  const value = React.useMemo(
    () => ({
      user,
      userProfile,
      loading,
      demoMode: !isFirebaseConfigured,
      signIn,
      register,
      logout,
      resetPassword,
      refreshProfile,
    }),
    [user, userProfile, loading, signIn, register, logout, resetPassword, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an <AuthProvider>');
  return context;
}

/** Route path a given account type should land on. */
export function dashboardPathFor(userType?: UserType) {
  switch (userType) {
    case 'organiser':
      return '/dashboard/organiser';
    case 'superuser':
      return '/dashboard/superuser';
    default:
      return '/dashboard/customer';
  }
}
