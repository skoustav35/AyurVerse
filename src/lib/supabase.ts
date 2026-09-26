import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';
import { friendlyAuthError } from './googleAuth';

/**
 * Supabase-shaped compatibility facade over Firebase Auth
 * (project: ananta-ayurverse).
 *
 * The UI was written against `@supabase/supabase-js` (`user.id`,
 * `user.user_metadata`, `supabase.auth.*`, `supabase.channel()`).
 * Rather than rewriting every consumer, this module preserves that
 * surface and delegates identity to Firebase Auth:
 *
 * - `user.id`            → Firebase `uid`
 * - `user.email`         → Firebase `email`
 * - `user.user_metadata` → `{ full_name: displayName, avatar_url: photoURL }`
 * - Google sign-in       → Firebase Google provider (popup, or credential
 *                          when a Google ID token is supplied)
 * - Realtime channels    → inert no-ops (live fan-out is retired with the
 *                          Supabase lane; react-query refetch still works)
 * - `from()`             → throws (data now lives in Firestore — use
 *                          `src/lib/firestore-db.ts` or `/api/*`)
 */

export interface CompatUser {
  id: string;
  email: string | null;
  user_metadata: { full_name: string | null; avatar_url: string | null };
  _firebaseUid: string;
  created_at?: string;
}

export function shapeUser(fb: { uid: string; email: string | null; displayName: string | null; photoURL: string | null; metadata?: { creationTime?: string } } | null): CompatUser | null {
  if (!fb) return null;
  return {
    id: fb.uid,
    email: fb.email ?? null,
    user_metadata: { full_name: fb.displayName ?? null, avatar_url: fb.photoURL ?? null },
    _firebaseUid: fb.uid,
    created_at: fb.metadata?.creationTime ?? undefined,
  };
}

async function idToken(): Promise<string | null> {
  try {
    return (await firebaseAuth?.currentUser?.getIdToken()) || null;
  } catch {
    return null;
  }
}

const noChannel = () => {
  const sub = { unsubscribe() {} };
  const ch: any = {
    on() { return ch; },
    subscribe(cb?: (status: string) => void) {
      try { cb?.('SUBSCRIBED'); } catch { /* noop */ }
      return sub;
    },
  };
  return ch;
};

const auth = {
  async getSession() {
    const fb = firebaseAuth?.currentUser || null;
    const user = shapeUser(fb);
    const token = await idToken();
    return { data: { session: user ? { access_token: token, user } : null }, error: null };
  },
  onAuthStateChange(cb: (event: string, session: any) => void) {
    if (!firebaseAuth) return { data: { subscription: { unsubscribe() {} } } };
    const unsub = onAuthStateChanged(firebaseAuth, async (fb) => {
      const user = shapeUser(fb);
      const token = fb ? await fb.getIdToken().catch(() => null) : null;
      cb(fb ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { access_token: token, user } : null);
    });
    return { data: { subscription: { unsubscribe: unsub } } };
  },
  async signUp({ email, password }: { email: string; password: string }) {
    try {
      if (!firebaseAuth) throw new Error('Firebase Auth is not configured');
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      return { data: { user: shapeUser(cred.user) }, error: null };
    } catch (e: any) {
      return { data: { user: null }, error: { message: friendlyAuthError(e) } };
    }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      if (!firebaseAuth) throw new Error('Firebase Auth is not configured');
      const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      return { data: { user: shapeUser(cred.user) }, error: null };
    } catch (e: any) {
      return { data: { user: null }, error: { message: friendlyAuthError(e) } };
    }
  },
  async signInWithOtp() {
    return { data: {}, error: { message: 'Email OTP is retired — sign in with Google or your password instead.' } };
  },
  async resetPasswordForEmail(email: string) {
    try {
      if (!firebaseAuth) throw new Error('Firebase Auth is not configured');
      await sendPasswordResetEmail(firebaseAuth, email);
      return { data: {}, error: null };
    } catch (e: unknown) {
      return { data: null, error: { message: friendlyAuthError(e) } };
    }
  },
  /** Google ID-token sign-in (used by the Google SSO lane). */
  async signInWithIdToken({ token }: { provider: string; token: string }) {
    try {
      if (!firebaseAuth) throw new Error('Firebase Auth is not configured');
      const cred = await signInWithCredential(firebaseAuth, GoogleAuthProvider.credential(token));
      return { data: { user: shapeUser(cred.user) }, error: null };
    } catch (e: any) {
      return { data: { user: null }, error: { message: friendlyAuthError(e) } };
    }
  },
  /** Interactive Google popup sign-in (used when no ID token is at hand). */
  async signInWithGooglePopup() {
    if (!firebaseAuth) throw new Error('Firebase Auth is not configured');
    const cred = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    return { data: { user: shapeUser(cred.user) }, error: null };
  },
  async setSession() {
    // Firebase persists its own session; nothing to hydrate.
    return { data: {}, error: null };
  },
  async updateUser({ data }: { data?: { full_name?: string; avatar_url?: string | null } }) {
    try {
      const fb = firebaseAuth?.currentUser;
      if (!fb) throw new Error('Not signed in');
      await updateProfile(fb, {
        ...(data?.full_name !== undefined ? { displayName: data.full_name } : {}),
        ...(data?.avatar_url !== undefined ? { photoURL: data.avatar_url } : {}),
      });
      return { data: { user: shapeUser(firebaseAuth!.currentUser) }, error: null };
    } catch (e: any) {
      return { data: { user: null }, error: { message: friendlyAuthError(e) } };
    }
  },
  async signOut() {
    try {
      if (firebaseAuth) await fbSignOut(firebaseAuth);
      return { error: null };
    } catch (e: any) {
      return { error: { message: e?.message || 'Sign-out failed' } };
    }
  },
  async getUser(token?: string) {
    if (token) return { data: { user: null }, error: { message: 'Server-side token check lives in /api (Firebase Admin).' } };
    const fb = firebaseAuth?.currentUser || null;
    return { data: { user: shapeUser(fb) }, error: null };
  },
};

const supabase: any = {
  auth,
  channel: () => noChannel(),
  removeChannel: () => {},
  from: () => {
    throw new Error('supabase.from() is retired — data now lives in Firestore (see src/lib/firestore-db.ts).');
  },
};

export default supabase;
