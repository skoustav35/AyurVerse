/**
 * AyurVerse · Auth emulator seed
 *
 * Creates the demo identities in the LOCAL Auth emulator with uids that match
 * the seeded Firestore profiles, so signing in as demo@ayurverse.app makes the
 * seeded posts/threads yours.
 *
 * Requires the auth emulator on 127.0.0.1:9099 (firebase.seed.json).
 * Safe to re-run — existing users are updated, not duplicated.
 */
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ||= 'demo-ayurverse-local';

const { initializeApp, getApps, deleteApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: 'demo-ayurverse-local' });

const auth = getAuth(app);

const USERS = [
  { uid: 'demo-vaidya-1', email: 'demo@ayurverse.app', password: 'password123', displayName: 'Vaidya Meera Nair' },
  { uid: 'demo-vaidya-2', email: 'arjun.rasa@ayurverse.app', password: 'password123', displayName: 'Arjun Rasa' },
  { uid: 'demo-vaidya-3', email: 'tulsi.threads@ayurverse.app', password: 'password123', displayName: 'Tulsi Threads' },
];

for (const u of USERS) {
  let existing = null;
  try {
    existing = await auth.getUser(u.uid);
  } catch {
    existing = null;
  }
  if (!existing) {
    try {
      existing = await auth.getUserByEmail(u.email);
    } catch {
      existing = null;
    }
  }

  try {
    if (existing) {
      await auth.updateUser(existing.uid, { email: u.email, password: u.password, displayName: u.displayName });
      console.log(`~ updated ${u.email} (uid ${existing.uid})`);
    } else {
      await auth.createUser(u);
      console.log(`+ created ${u.email} (uid ${u.uid})`);
    }
  } catch (err) {
    console.error(`! ${u.email}: ${err?.code || ''} ${err?.message || err}`);
    process.exitCode = 1;
  }
}

console.log('\nAuth seed done — sign in with demo@ayurverse.app / password123');
await deleteApp(app);