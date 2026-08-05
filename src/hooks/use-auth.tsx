'use client';

import * as React from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { createUserProfile, getUserProfile } from '@/server/database';
import type { UserProfile, UserType } from '@/shared/types';
import { WELCOME_BONUS_ACU } from '@/shared/constants/billing';

const DEMO_ROLE_KEY = 'tr:demo-role';

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  /** True when running without Firebase credentials — dashboards use the demo identity. */
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
  /** Demo-mode role switcher used by /dev-access. */
  setDemoRole: (role: UserType | null) => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

function demoProfile(role: UserType): UserProfile {
  const base = {
    status: 'approved' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    wallet: {
      balanceAcu: WELCOME_BONUS_ACU,
      lifetimeGrantedAcu: WELCOME_BONUS_ACU,
      lifetimePurchasedAcu: 0,
      lifetimeSpentAcu: 0,
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    },
    welcomeBonusGranted: true,
  };

  if (role === 'organiser') {
    return {
      ...base,
      uid: 'org-midlands-collective',
      email: 'organiser@ticketroyality.com',
      fullName: 'Idris Kaur',
      userType: 'organiser',
      companyName: 'Midlands Event Collective',
      website: 'https://midlands.example.com',
      bio: 'Birmingham-based collective specialising in conferences, networking and cultural programming.',
    };
  }
  if (role === 'superuser') {
    return {
      ...base,
      uid: 'demo-superuser',
      email: 'admin@ticketroyality.com',
      fullName: 'Platform Administrator',
      userType: 'superuser',
    };
  }
  return {
    ...base,
    uid: 'demo-customer',
    email: 'customer@ticketroyality.com',
    fullName: 'Jordan Miles',
    userType: 'customer',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const applyDemoRole = React.useCallback((role: UserType | null) => {
    if (!role) {
      setUser(null);
      setUserProfile(null);
      return;
    }
    const profile = demoProfile(role);
    setUserProfile(profile);
    // A minimal User-shaped object is enough for everything the UI reads.
    setUser({
      uid: profile.uid,
      email: profile.email,
      displayName: profile.fullName,
    } as User);
  }, []);

  React.useEffect(() => {
    if (!isFirebaseConfigured) {
      // Demo mode: identity comes from localStorage, set via /dev-access.
      const stored = window.localStorage.getItem(DEMO_ROLE_KEY) as UserType | null;
      applyDemoRole(stored);
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
  }, [applyDemoRole]);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
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
      window.localStorage.removeItem(DEMO_ROLE_KEY);
      applyDemoRole(null);
      return;
    }
    await signOut(auth);
    setUserProfile(null);
  }, [applyDemoRole]);

  const resetPassword = React.useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (!user) return;
    setUserProfile(await getUserProfile(user.uid));
  }, [user]);

  const setDemoRole = React.useCallback(
    (role: UserType | null) => {
      if (role) window.localStorage.setItem(DEMO_ROLE_KEY, role);
      else window.localStorage.removeItem(DEMO_ROLE_KEY);
      applyDemoRole(role);
    },
    [applyDemoRole]
  );

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
      setDemoRole,
    }),
    [user, userProfile, loading, signIn, register, logout, resetPassword, refreshProfile, setDemoRole]
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
