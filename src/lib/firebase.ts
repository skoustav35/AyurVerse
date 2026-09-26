import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

// Project: ananta-ayurverse (display name: AyurVerse). Fill these from
// `firebase apps:sdkconfig` output, or copy into .env as VITE_FIREBASE_*.
// When unset, the app still boots and reports "not configured".
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ananta-ayurverse.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ananta-ayurverse',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ananta-ayurverse.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '521076795359',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:521076795359:web:9e32be00956dafe2aa466a',
};

// Local emulator lane: the emulator is seeded under the demo-* namespace (see
// scripts/reseed-firestore.mjs + firebase.seed.json), so the client must use the
// SAME project id or every read lands in an empty namespace.
const USE_EMULATOR = import.meta.env.VITE_FIREBASE_USE_EMULATOR === '1';
const EMULATOR_PROJECT_ID = 'demo-ayurverse-local';
if (USE_EMULATOR) {
  firebaseConfig.projectId = EMULATOR_PROJECT_ID;
  firebaseConfig.authDomain = 'demo-ayurverse-local.firebaseapp.com';
}

export const FIREBASE_CONFIGURED = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (FIREBASE_CONFIGURED || USE_EMULATOR) {
  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  if (USE_EMULATOR) {
    try {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectStorageEmulator(storage, '127.0.0.1', 9199);
    } catch {
      /* emulators already connected (HMR) */
    }
  }
}

export { app as firebaseApp, auth as firebaseAuth, db as firestoreDb, storage as firebaseStorage };
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
