import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
    return () => unsubscribe();
  }, [ensureUserProfile]);

  // Attach preferences listener only when auth + profile are ready
  useEffect(() => {
    if (!authReady || !profileReady || !user) return;
    const prefPath = `users/${user.uid}/preferences/settings`;
    const prefRef = doc(db, 'users', user.uid, 'preferences', 'settings');

    const unsubscribe = onSnapshot(
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

    return () => unsubscribe();
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
