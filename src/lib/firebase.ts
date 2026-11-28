import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth, type User } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseAuthServices {
  app: FirebaseApp;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
}

export interface FirebaseRuntimeServices extends FirebaseAuthServices {
  db: Firestore;
}

let cachedAuthServices: FirebaseAuthServices | null = null;
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

  const existing = getApps();
  const app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });

  const authServices: FirebaseAuthServices = { app, auth, googleProvider };
  cachedAuthServices = authServices;
  return Promise.resolve(authServices);
}

export function getFirebaseServices(): Promise<FirebaseRuntimeServices> {
  if (cachedServices) {
    return Promise.resolve(cachedServices);
  }

  return getFirebaseAuthServices().then((authServices) => {
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
  });
}
