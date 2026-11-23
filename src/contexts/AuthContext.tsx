import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { getFirebaseServices } from '../lib/firebase';
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
  updatePreferences: (patch: Partial<UserPreferencesState>) => Promise<void>;
}

const DEFAULT_PREFERENCES: UserPreferencesState = {
  nfpAlertEnabled: false,
  preferredCurrency: 'USD',
  favoriteAssetIds: ['SPX', 'IXIC', 'IHSG', 'XAUUSD', 'BTCUSD', 'US10Y'],
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferencesState>(DEFAULT_PREFERENCES);

  const ensureUserProfile = useCallback(async (firebaseUser: User) => {
    const userPath = `users/${firebaseUser.uid}`;
    const [{ db }, { doc, getDoc, serverTimestamp, setDoc, updateDoc }] = await Promise.all([
      getFirebaseServices(),
      import('firebase/firestore'),
    ]);
    const userRef = doc(db, 'users', firebaseUser.uid);

    const safeDisplayName = (
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'Investor'
    )
      .trim()
      .slice(0, 120);
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
      setProfileReady(true);
    } catch (error) {
      setProfileReady(false);
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribeAuth: (() => void) | undefined;
    let timerId: number | null = null;
    let idleId: number | null = null;

    const attachAuth = async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([
          getFirebaseServices(),
          import('firebase/auth'),
        ]);
        if (disposed) return;

        unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
          if (disposed) return;
          setUser(currentUser);
          setAuthReady(true);
          setProfileReady(false);
          if (currentUser) {
            void ensureUserProfile(currentUser).catch((err) => {
              setAuthError(
                err instanceof Error ? err.message : 'Unable to sync user profile.'
              );
            });
          } else {
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
    if (isPortfolioRoute) {
      void attachAuth();
    } else if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => void attachAuth(), { timeout: 600 });
    } else {
      timerId = window.setTimeout(() => void attachAuth(), 250);
    }

    return () => {
      disposed = true;
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) window.clearTimeout(timerId);
      unsubscribeAuth?.();
    };
  }, [ensureUserProfile]);

  // Attach preferences listener only when auth + profile are ready
  useEffect(() => {
    if (!authReady || !profileReady || !user) return;
    let disposed = false;
    let unsubscribePref: (() => void) | undefined;

    const attachPrefs = async () => {
      const [{ db }, { doc, onSnapshot }] = await Promise.all([
        getFirebaseServices(),
        import('firebase/firestore'),
      ]);
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
          handleFirestoreError(error, OperationType.GET, prefPath);
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
      const [{ db }, { doc, getDoc, serverTimestamp, setDoc, updateDoc }] = await Promise.all([
        getFirebaseServices(),
        import('firebase/firestore'),
      ]);
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
        handleFirestoreError(error, OperationType.WRITE, prefPath);
      }
    },
    [preferences, user, profileReady]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const [{ auth, googleProvider }, { signInWithPopup }] = await Promise.all([
        getFirebaseServices(),
        import('firebase/auth'),
      ]);
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const errObj = error as { code?: string; message?: string };
      if (errObj?.code !== 'auth/popup-closed-by-user') {
        setAuthError(errObj?.message || 'Google Sign-In failed. Please try again.');
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      const [{ auth }, { signOut }] = await Promise.all([
        getFirebaseServices(),
        import('firebase/auth'),
      ]);
      await signOut(auth);
    } catch (error: unknown) {
      const errObj = error as { message?: string };
      setAuthError(errObj?.message || 'Failed to sign out.');
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
