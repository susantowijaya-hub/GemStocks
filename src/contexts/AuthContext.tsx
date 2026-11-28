import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseAuthServices, getFirebaseServices } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import { CurrencyCode } from '../types/market';

export interface UserPreferencesState {
  nfpAlertEnabled: boolean;
  preferredCurrency: CurrencyCode;
  favoriteAssetIds: string[];
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profileReady: boolean;
  authLoading: boolean;
  authError: string | null;
  preferences: UserPreferencesState;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  retryProfileSync: () => Promise<boolean>;
  updatePreferences: (patch: Partial<UserPreferencesState>) => Promise<void>;
}

const DEFAULT_PREFERENCES: UserPreferencesState = {
  nfpAlertEnabled: false,
  preferredCurrency: 'USD',
  favoriteAssetIds: ['SPX', 'IXIC', 'IHSG', 'XAUUSD', 'BTCUSD', 'US10Y'],
};

const AuthContext = createContext<AuthContextValue | null>(null);

function extractReadableFirebaseError(error: unknown, fallback: string): string {
  const errObj = error as { code?: string; message?: string };
  const code = errObj?.code || '';
  const msg = errObj?.message || '';
  if (code === 'auth/popup-blocked') {
    return 'Sign-in popup was blocked by your browser. Allow popups for this site and try again.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This preview domain is not authorized for Google Sign-In in Firebase Console.';
  }
  if (code === 'permission-denied' || /Missing or insufficient permissions/i.test(msg)) {
    return 'Cloud permissions check failed for your profile. Please sign out and sign in again, or check Firestore rules.';
  }
  if (code === 'unavailable' || /offline/i.test(msg)) {
    return 'Cloud database temporarily unreachable. Check your connection and retry sync.';
  }
  return msg || fallback;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferencesState>(DEFAULT_PREFERENCES);

  const ensureUserProfile = useCallback(async (firebaseUser: User): Promise<boolean> => {
    const userPath = `users/${firebaseUser.uid}`;
    const { db } = await getFirebaseServices();
    const userRef = doc(db, 'users', firebaseUser.uid);

    const safeDisplayName = (
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'Investor'
    )
      .trim()
      .slice(0, 120) || 'Investor';
    const safeEmail = (firebaseUser.email || '').trim().slice(0, 254);
    const safePhoto = firebaseUser.photoURL ? firebaseUser.photoURL.slice(0, 512) : '';

    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        const payload: Record<string, unknown> = {
          uid: firebaseUser.uid,
          email: safeEmail,
          displayName: safeDisplayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (safePhoto) {
          payload.photoURL = safePhoto;
        }
        await setDoc(userRef, payload);
      } else {
        const updatePayload: Record<string, unknown> = {
          email: safeEmail,
          displayName: safeDisplayName,
          updatedAt: serverTimestamp(),
        };
        if (safePhoto) {
          updatePayload.photoURL = safePhoto;
        }
        await updateDoc(userRef, updatePayload);
      }
      setAuthError(null);
      setProfileReady(true);
      return true;
    } catch (error) {
      setProfileReady(false);
      setAuthError(extractReadableFirebaseError(error, 'Unable to initialize cloud profile.'));
      try {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      } catch {
        // Structured JSON error already logged; handled via authError state so UI stays responsive
      }
      return false;
    }
  }, []);

  const retryProfileSync = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setAuthError(null);
    return ensureUserProfile(user);
  }, [user, ensureUserProfile]);

  useEffect(() => {
    let disposed = false;
    let unsubscribeAuth: (() => void) | undefined;
    let timerId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;

    const attachAuth = async () => {
      try {
        const { auth } = await getFirebaseAuthServices();
        if (disposed) return;

        unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
          if (disposed) return;
          setUser(currentUser);
          setAuthReady(true);
          setProfileReady(false);
          if (currentUser) {
            void ensureUserProfile(currentUser);
          } else {
            setAuthError(null);
            setPreferences(DEFAULT_PREFERENCES);
          }
        });
      } catch {
        if (!disposed) {
          setAuthReady(true);
        }
      }
    };

    // Defer Firebase Auth initialization until after first paint / idle so initial screen mounts immediately
    const isPortfolioRoute =
      typeof window !== 'undefined' && window.location.hash === '#portfolio';
    const winWithIdle =
      typeof window !== 'undefined'
        ? (window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
          })
        : null;

    if (isPortfolioRoute) {
      void attachAuth();
    } else if (winWithIdle && typeof winWithIdle.requestIdleCallback === 'function') {
      idleId = winWithIdle.requestIdleCallback(() => void attachAuth(), { timeout: 1400 });
    } else {
      timerId = globalThis.setTimeout(() => void attachAuth(), 550);
    }

    return () => {
      disposed = true;
      if (idleId !== null && winWithIdle && typeof winWithIdle.cancelIdleCallback === 'function') {
        winWithIdle.cancelIdleCallback(idleId);
      }
      if (timerId !== null) globalThis.clearTimeout(timerId);
      unsubscribeAuth?.();
    };
  }, [ensureUserProfile]);

  // Attach preferences listener only when auth + profile are ready
  useEffect(() => {
    if (!authReady || !profileReady || !user) return;
    let disposed = false;
    let unsubscribePref: (() => void) | undefined;

    const attachPrefs = async () => {
      const { db } = await getFirebaseServices();
      if (disposed) return;

      const prefPath = `users/${user.uid}/preferences/settings`;
      const prefRef = doc(db, 'users', user.uid, 'preferences', 'settings');

      unsubscribePref = onSnapshot(
        prefRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setPreferences({
              nfpAlertEnabled: Boolean(data.nfpAlertEnabled),
              preferredCurrency: (data.preferredCurrency as CurrencyCode) || 'USD',
              favoriteAssetIds: Array.isArray(data.favoriteAssetIds)
                ? (data.favoriteAssetIds as string[]).slice(0, 30)
                : DEFAULT_PREFERENCES.favoriteAssetIds,
            });
          }
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.GET, prefPath);
          } catch {
            // logged silently without crashing React tree
          }
        }
      );
    };

    void attachPrefs();

    return () => {
      disposed = true;
      unsubscribePref?.();
    };
  }, [authReady, profileReady, user]);

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferencesState>) => {
      const next: UserPreferencesState = {
        ...preferences,
        ...patch,
        favoriteAssetIds: (patch.favoriteAssetIds ?? preferences.favoriteAssetIds).slice(0, 30),
      };
      setPreferences(next);

      if (!user || !profileReady) return;

      const prefPath = `users/${user.uid}/preferences/settings`;
      const { db } = await getFirebaseServices();
      const prefRef = doc(db, 'users', user.uid, 'preferences', 'settings');
      try {
        const snap = await getDoc(prefRef);
        if (!snap.exists()) {
          await setDoc(prefRef, {
            ownerId: user.uid,
            nfpAlertEnabled: next.nfpAlertEnabled,
            preferredCurrency: next.preferredCurrency,
            favoriteAssetIds: next.favoriteAssetIds,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(prefRef, {
            nfpAlertEnabled: next.nfpAlertEnabled,
            preferredCurrency: next.preferredCurrency,
            favoriteAssetIds: next.favoriteAssetIds,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, prefPath);
        } catch {
          // structured error logged
        }
      }
    },
    [preferences, user, profileReady]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { auth, googleProvider } = await getFirebaseAuthServices();
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred?.user) {
        await ensureUserProfile(cred.user);
      }
    } catch (error: unknown) {
      const errObj = error as { code?: string };
      if (errObj?.code !== 'auth/popup-closed-by-user') {
        setAuthError(
          extractReadableFirebaseError(error, 'Google Sign-In failed. Please try again.')
        );
      }
    } finally {
      setAuthLoading(false);
    }
  }, [ensureUserProfile]);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      const { auth } = await getFirebaseAuthServices();
      await signOut(auth);
      setProfileReady(false);
    } catch (error: unknown) {
      setAuthError(extractReadableFirebaseError(error, 'Failed to sign out.'));
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        profileReady,
        authLoading,
        authError,
        preferences,
        signInWithGoogle,
        logout,
        clearAuthError,
        retryProfileSync,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
