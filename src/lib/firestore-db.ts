/**
 * AyurVerse · Firestore data layer (project: ayurverse)
 *
 * Mirrors every Supabase table as a Firestore collection with the same field
 * names, so the UI types in src/lib/types.ts keep working unchanged:
 *
 *   posts, comments, likes, saves, follows, profiles, signals,
 *   notifications, groups, group_members, group_posts, conversations,
 *   conversation_members, messages, statuses, user_prefs, boosts,
 *   payout_requests, api_tokens, media_blobs
 *
 * Auth: Firebase Auth (Google provider + email/password for the demo account).
 * IDs: Firestore auto-IDs (string). The old Supabase numeric ids are kept in
 * `legacy_id` by the seed script for traceability.
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  serverTimestamp,
  onSnapshot,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { firestoreDb, FIREBASE_CONFIGURED } from './firebase';

function mustDb() {
  if (!firestoreDb) throw new Error('Firebase is not configured — set VITE_FIREBASE_* in .env first.');
  return firestoreDb;
}

export function isFirebaseReady() {
  return FIREBASE_CONFIGURED || import.meta.env.VITE_FIREBASE_USE_EMULATOR === '1';
}

const nowIso = () => new Date().toISOString();

/* ---------------- generic helpers ---------------- */

export async function listDocs<T = DocumentData>(
  coll: string,
  constraints: QueryConstraint[] = [],
  max = 30,
): Promise<(T & { _id: string })[]> {
  const db = mustDb();
  const q = query(collection(db, coll), ...constraints, limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as T), _id: d.id }));
}

export async function getDocById<T = DocumentData>(coll: string, id: string): Promise<(T & { _id: string }) | null> {
  const snap = await getDoc(doc(mustDb(), coll, id));
  return snap.exists() ? ({ ...(snap.data() as T), _id: snap.id }) : null;
}

export async function createDoc<T extends DocumentData>(coll: string, data: T): Promise<string> {
  const ref = await addDoc(collection(mustDb(), coll), { ...data, created_at: (data as any).created_at ?? nowIso() });
  return ref.id;
}

export async function patchDoc(coll: string, id: string, patch: DocumentData) {
  await updateDoc(doc(mustDb(), coll, id), patch);
}

export async function removeDoc(coll: string, id: string) {
  await deleteDoc(doc(mustDb(), coll, id));
}

/* ---------------- domain: profiles ---------------- */

/**
 * Write the signed-in weaver's profile card straight to Firestore.
 *
 * The `/api/profiles` lane only reaches Firestore when the server holds admin
 * credentials (FIREBASE_SERVICE_ACCOUNT_JSON); without them the write lands in
 * a per-instance cache and the weaver stays invisible to Library search and
 * the Golden Threads people-picker. The browser already carries an ID token,
 * and the security rules allow an owner write (`isOwner(data.user_id)`), so
 * this is the lane that guarantees every real account becomes discoverable.
 *
 * `onlyIfMissing` — sign-in sync: create the card once, never stomp later edits.
 */
export async function upsertMyProfile(
  profile: { user_id: string; username: string; full_name: string; bio?: string | null; avatar_url?: string | null },
  opts: { onlyIfMissing?: boolean } = {},
): Promise<void> {
  const db = mustDb();
  const ref = doc(db, 'profiles', profile.user_id);
  const snap = await getDoc(ref);
  const username = (profile.username || 'weaver').toLowerCase().replace(/[^a-z0-9._]+/g, '.').slice(0, 30) || 'weaver';
  if (snap.exists()) {
    if (opts.onlyIfMissing) return;
    const existing = snap.data();
    await setDoc(ref, {
      ...existing,
      user_id: profile.user_id,
      username,
      full_name: (profile.full_name || existing.full_name || 'Weaver').slice(0, 300),
      bio: (profile.bio ?? existing.bio ?? null)?.slice?.(0, 300) ?? null,
      avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : (existing.avatar_url ?? null),
    }, { merge: true });
    return;
  }
  await setDoc(ref, {
    // numeric id keeps parity with the API rows (`order('id')`, newest first)
    id: Date.now(),
    user_id: profile.user_id,
    username,
    full_name: (profile.full_name || 'Weaver').slice(0, 300),
    bio: (profile.bio ?? 'New weaver in the atelier.').slice(0, 300),
    avatar_url: profile.avatar_url ?? null,
    created_at: nowIso(),
  });
}

/* ---------------- domain: feed / posts ---------------- */

export async function fetchFeed(kind?: 'visual' | 'forge', pageSize = 8, cursor?: string) {
  const filters: QueryConstraint[] = [orderBy('created_at', 'desc')];
  if (kind) filters.unshift(where('kind', '==', kind));
  if (cursor) {
    const cur = await getDoc(doc(mustDb(), 'posts', cursor));
    if (cur.exists()) filters.push(startAfter(cur));
  }
  return listDocs('posts', filters, pageSize);
}

export async function toggleLike(postId: string, userId: string) {
  const db = mustDb();
  const likeId = `${userId}_${postId}`;
  const likeRef = doc(db, 'likes', likeId);
  const existing = await getDoc(likeRef);
  const postRef = doc(db, 'posts', postId);
  if (existing.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(postRef, { likes_count: increment(-1) });
    return { liked: false };
  }
  await setDoc(likeRef, { user_id: userId, post_id: postId, created_at: nowIso() });
  await updateDoc(postRef, { likes_count: increment(1) });
  return { liked: true };
}

export async function toggleSave(postId: string, userId: string) {
  const db = mustDb();
  const saveId = `${userId}_${postId}`;
  const ref = doc(db, 'saves', saveId);
  const existing = await getDoc(ref);
  const postRef = doc(db, 'posts', postId);
  if (existing.exists()) {
    await deleteDoc(ref);
    await updateDoc(postRef, { saves_count: increment(-1) });
    return { saved: false };
  }
  await setDoc(ref, { user_id: userId, post_id: postId, created_at: nowIso() });
  await updateDoc(postRef, { saves_count: increment(1) });
  return { saved: true };
}

export async function addComment(postId: string, userId: string, body: string, author: { name: string; username: string; avatar: string | null }) {
  const id = await createDoc('comments', {
    post_id: postId, user_id: userId, body,
    author_name: author.name, author_username: author.username, author_avatar: author.avatar,
  });
  await updateDoc(doc(mustDb(), 'posts', postId), { comments_count: increment(1) });
  return id;
}

/* ---------------- domain: social graph ---------------- */

export async function toggleFollow(followerId: string, followeeId: string) {
  const db = mustDb();
  const fid = `${followerId}_${followeeId}`;
  const ref = doc(db, 'follows', fid);
  if ((await getDoc(ref)).exists()) {
    await deleteDoc(ref);
    return { following: false };
  }
  await setDoc(ref, { follower_id: followerId, followee_id: followeeId, created_at: nowIso() });
  return { following: true };
}

/* ---------------- domain: threads ---------------- */

export async function fetchMyThreads(userId: string, max = 50) {
  const memberships = await listDocs<any>('conversation_members', [where('user_id', '==', userId)], max);
  const ids = memberships.map((m) => m.conversation_id);
  const out = [];
  for (const id of ids.slice(0, max)) {
    const conv = await getDocById<any>('conversations', String(id));
    if (conv) out.push(conv);
  }
  return out.sort((a, b) => String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')));
}

export async function sendMessage(conversationId: string, senderId: string, payload: { type: string; body?: string | null; media_url?: string | null; post_id?: string | null; sender_name?: string; sender_avatar?: string | null }) {
  const id = await createDoc('messages', { conversation_id: conversationId, sender_id: senderId, ...payload });
  await patchDoc('conversations', conversationId, { last_message_at: nowIso() });
  return id;
}

export function subscribeToMessages(conversationId: string, cb: (items: any[]) => void) {
  const db = mustDb();
  const q = query(collection(db, 'messages'), where('conversation_id', '==', conversationId), orderBy('created_at', 'asc'), limit(200));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), _id: d.id }))));
}

/* ---------------- domain: everything else (thin wrappers) ---------------- */

export const col = {
  posts: 'posts',
  comments: 'comments',
  likes: 'likes',
  saves: 'saves',
  follows: 'follows',
  profiles: 'profiles',
  signals: 'signals',
  notifications: 'notifications',
  groups: 'groups',
  group_members: 'group_members',
  group_posts: 'group_posts',
  conversations: 'conversations',
  conversation_members: 'conversation_members',
  messages: 'messages',
  statuses: 'statuses',
  user_prefs: 'user_prefs',
  boosts: 'boosts',
  payout_requests: 'payout_requests',
  api_tokens: 'api_tokens',
  media_blobs: 'media_blobs',
} as const;

export const FIRESTORE_COLLECTIONS = Object.values(col);
