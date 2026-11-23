import type { FirebaseApp } from 'firebase/app';
import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface FirebaseRuntimeServices {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  googleProvider: GoogleAuthProvider;
}

let servicesPromise: Promise<FirebaseRuntimeServices> | null = null;
let cachedServices: FirebaseRuntimeServices | null = null;
let connectionTested = false;

export function getCachedAuthUser(): User | null {
  return cachedServices?.auth.currentUser ?? null;
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

export function getFirebaseServices(): Promise<FirebaseRuntimeServices> {
  if (cachedServices) {
    return Promise.resolve(cachedServices);
  }
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [
        { initializeApp },
        { getAuth, GoogleAuthProvider },
        { getFirestore, initializeFirestore },
        configMod,
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('../../firebase-applet-config.json'),
      ]);

      const firebaseConfig = configMod.default;
      const app = initializeApp(firebaseConfig);

      let db: Firestore;
      try {
        // Force long polling in iframe/proxied environments so WebChannel stream blocks
        // do not trigger transient "code=unavailable / client is offline" failures.
        db = initializeFirestore(
          app,
          { experimentalForceLongPolling: true },
          firebaseConfig.firestoreDatabaseId
        );
      } catch {
        db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      }

      const auth = getAuth(app);
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });

      const services: FirebaseRuntimeServices = { app, db, auth, googleProvider };
      cachedServices = services;
      void runConnectionCheck(db);
      return services;
    })();
  }
  return servicesPromise;
}
