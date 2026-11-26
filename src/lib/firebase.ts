import type { FirebaseApp } from 'firebase/app';
import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface FirebaseAuthServices {
  app: FirebaseApp;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
}

export interface FirebaseRuntimeServices extends FirebaseAuthServices {
  db: Firestore;
}

let authPromise: Promise<FirebaseAuthServices> | null = null;
let cachedAuthServices: FirebaseAuthServices | null = null;
let servicesPromise: Promise<FirebaseRuntimeServices> | null = null;
let cachedServices: FirebaseRuntimeServices | null = null;
let connectionTested = false;

export function getCachedAuthUser(): User | null {
  return cachedAuthServices?.auth.currentUser ?? cachedServices?.auth.currentUser ?? null;
}

async function runConnectionCheck(db: Firestore): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  const { doc, getDocFromServer } = await import('firebase/firestore');

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('the client is offline') || msg.includes('unavailable')) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        console.warn('Firestore connection check deferred (network/proxy unavailable):', msg);
        return;
      }
      // PERMISSION_DENIED or NOT_FOUND confirms backend connectivity succeeded cleanly.
      return;
    }
  }
}

export function getFirebaseAuthServices(): Promise<FirebaseAuthServices> {
  if (cachedAuthServices) {
    return Promise.resolve(cachedAuthServices);
  }
  if (!authPromise) {
    authPromise = (async () => {
      const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider }, configMod] =
        await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('../../firebase-applet-config.json'),
        ]);

      const firebaseConfig = configMod.default;
      const existing = getApps();
      const app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });

      const authServices: FirebaseAuthServices = { app, auth, googleProvider };
      cachedAuthServices = authServices;
      return authServices;
    })();
  }
  return authPromise;
}

export function getFirebaseServices(): Promise<FirebaseRuntimeServices> {
  if (cachedServices) {
    return Promise.resolve(cachedServices);
  }
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [authServices, { getFirestore, initializeFirestore }, configMod] = await Promise.all([
        getFirebaseAuthServices(),
        import('firebase/firestore'),
        import('../../firebase-applet-config.json'),
      ]);

      const firebaseConfig = configMod.default;
      let db: Firestore;
      try {
        // Force long polling in iframe/proxied environments so WebChannel stream blocks
        // do not trigger transient "code=unavailable / client is offline" failures.
        db = initializeFirestore(
          authServices.app,
          { experimentalForceLongPolling: true },
          firebaseConfig.firestoreDatabaseId
        );
      } catch {
        db = getFirestore(authServices.app, firebaseConfig.firestoreDatabaseId);
      }

      const services: FirebaseRuntimeServices = { ...authServices, db };
      cachedServices = services;
      void runConnectionCheck(db);
      return services;
    })();
  }
  return servicesPromise;
}
