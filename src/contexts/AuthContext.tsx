import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { firebaseAuth, FIREBASE_CONFIGURED } from '../lib/firebase';
import { shapeUser, type CompatUser } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { upsertMyProfile } from '../lib/firestore-db';

/**
 * Auth — Firebase-first (project: ananta-ayurverse).
 * `user` is Supabase-shaped (`id`, `email`, `user_metadata`) so every
 * existing consumer keeps working; `firebaseUser` carries the raw identity.
 */
interface AuthContextValue {
  user: CompatUser | null;
  session: { access_token: string | null; user: CompatUser } | null;
  loading: boolean;
  firebaseUser: FirebaseUser | null;
  firebaseReady: boolean;
}

const syncedUsers = new Set<string>();
const AuthContext = createContext<AuthContextValue>({ user: null, session: null, loading: true, firebaseUser: null, firebaseReady: FIREBASE_CONFIGURED });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CompatUser | null>(null);
  const [session, setSession] = useState<AuthContextValue['session']>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(firebaseAuth, async (fb) => {
      setFirebaseUser(fb);
      const shaped = shapeUser(fb);
      setUser(shaped);
      if (shaped && fb) {
        const token = await fb.getIdToken().catch(() => null);
        setSession({ access_token: token, user: shaped });

        // Ensure newly registered or signed-in weaver profile is saved once to backend
        if (!syncedUsers.has(shaped.id)) {
          syncedUsers.add(shaped.id);
          const meta = (shaped.user_metadata || {}) as Record<string, string>;
          const card = {
            user_id: shaped.id,
            username: meta.username || shaped.email?.split('@')[0] || 'weaver',
            full_name: meta.full_name || fb.displayName || shaped.email?.split('@')[0] || 'Weaver',
            avatar_url: meta.avatar_url || fb.photoURL || null,
          };
          // Write the card straight to Firestore too — the API lane only reaches
          // Firestore when the server holds admin credentials, so without this a
          // real sign-in stays invisible to Library search and Golden Threads.
          // onlyIfMissing: never stomp a card the weaver already re-inked.
          upsertMyProfile(card, { onlyIfMissing: true }).catch(() => {});
          apiFetch('/api/profiles', {
            method: 'POST',
            body: JSON.stringify(card),
          }).catch(() => {
            syncedUsers.delete(shaped.id);
          });
        }
      } else {
        setSession(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return <AuthContext.Provider value={{ user, session, loading, firebaseUser, firebaseReady: FIREBASE_CONFIGURED }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
