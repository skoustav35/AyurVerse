/**
 * AyurVerse · Firestore RE-seed (project: ananta-ayurverse).
 *
 * v2: numeric entity ids everywhere (doc ID = String(numeric id)),
 * because every /api/* route does parseInt() on ids (Postgres heritage).
 * User/auth fields stay string uids (Firebase uid shape).
 *
 * Run ONLY while the temporary open rules are deployed:
 *   node scripts/reseed-firestore.mjs
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeFirestore, connectFirestoreEmulator, terminate, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

const USE_EMULATOR = true; // reseed ALWAYS targets the local emulator — never the cloud
const EMULATOR_PROJECT_ID = 'demo-ayurverse-local';
// Seed via the emulator's REST surface (not the grpc SDK): deterministic under
// single-project mode, honours the demo-* bypass, no SDK version quirks.
const EMU_REST = 'http://127.0.0.1:8080/v1/projects/demo-ayurverse-local/databases/(default)/documents';

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = enc(val);
    return { mapValue: { fields } };
  }
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

async function restPut(coll, id, data) {
  const fields = {};
  for (const [k, val] of Object.entries(data)) fields[k] = enc(val);
  const res = await fetch(`${EMU_REST}/${encodeURIComponent(coll)}?documentId=${encodeURIComponent(String(id))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`seed ${coll}/${id} → ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

async function restWipe(coll) {
  const res = await fetch(`${EMU_REST}/${encodeURIComponent(coll)}?pageSize=1000`);
  if (!res.ok) return;
  const body = await res.json();
  for (const d of body.documents || []) {
    const id = d.name.split('/').pop();
    await fetch(`${EMU_REST}/${encodeURIComponent(coll)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  return (body.documents || []).length;
}

const app = initializeApp(
  {
    apiKey: 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I',
    authDomain: 'ananta-ayurverse.firebaseapp.com',
    // demo-* project id triggers the emulator's rules bypass for local seeds
    // (real project ids enforce firestore.*.rules even under the emulator).
    projectId: USE_EMULATOR ? EMULATOR_PROJECT_ID : 'ananta-ayurverse',
  },
  USE_EMULATOR ? 'reseed-local' : undefined,
);
// initializeFirestore (not getFirestore) so the emulator host binds to this
// instance deterministically — getFirestore auto-init can target the cloud
// backend before connectFirestoreEmulator attaches.
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
if (USE_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.log('[reseed] targeting local Firestore emulator 127.0.0.1:8080');
}

const T0 = Date.now();
const iso = (minsAgo) => new Date(T0 - minsAgo * 60000).toISOString();

const COLLS = ['profiles', 'posts', 'comments', 'likes', 'saves', 'follows', 'groups',
  'group_members', 'group_posts', 'conversations', 'conversation_members', 'messages',
  'statuses', 'notifications', 'signals', 'user_prefs', 'boosts', 'payout_requests'];

// ---- wipe (REST on emulator; SDK on cloud) ----
for (const coll of COLLS) {
  if (USE_EMULATOR) {
    const n = await restWipe(coll);
    if (n) console.log(`wiped ${coll} (${n})`);
  } else {
    const snap = await getDocs(collection(db, coll));
    for (const d of snap.docs) await deleteDoc(d.ref);
    if (snap.size) console.log(`wiped ${coll} (${snap.size})`);
  }
}

// ---- write (numeric ids; user fields stay string uids) ----
const docs = [
  ['profiles', '1', { id: 1, user_id: 'demo-vaidya-1', username: 'vaidya.meera', full_name: 'Vaidya Meera Nair', bio: 'Kerala panchakarma physician · 15 yrs', avatar_url: null, created_at: iso(5000) }],
  ['profiles', '2', { id: 2, user_id: 'demo-vaidya-2', username: 'arjun.rasa', full_name: 'Arjun Rasa', bio: 'Rasashastra student & herbal grower', avatar_url: null, created_at: iso(4800) }],
  ['profiles', '3', { id: 3, user_id: 'demo-vaidya-3', username: 'tulsi.threads', full_name: 'Tulsi Threads', bio: 'Ayurvedic kitchen · recipes & rituals', avatar_url: null, created_at: iso(4600) }],

  ['posts', '1', { id: 1, kind: 'visual', author_id: 'demo-vaidya-1', author_name: 'Vaidya Meera Nair', author_username: 'vaidya.meera', author_avatar: null, caption: 'Morning abhyanga — warm sesame oil, slow strokes, before sunrise. The nervous system drinks it first.', title: null, summary: null, content_md: null, media_url: null, media_type: null, tags: ['abhyanga', 'dinacharya', 'vata'], likes_count: 24, saves_count: 9, comments_count: 2, views_count: 310, created_at: iso(300) }],
  ['posts', '2', { id: 2, kind: 'forge', author_id: 'demo-vaidya-2', author_name: 'Arjun Rasa', author_username: 'arjun.rasa', author_avatar: null, caption: null, title: 'Rasashastra notes: what shodhana actually removes', summary: 'Purification is not symbolism — a practical look at media, heat cycles, and assay results.', content_md: '# Shodhana, practically\n\nShodhana (purification) of metals and minerals uses repeated quenching in herbal decoctions. Each cycle…', media_url: null, media_type: null, tags: ['rasashastra', 'shodhana'], read_minutes: 4, likes_count: 41, saves_count: 17, comments_count: 1, views_count: 520, created_at: iso(700) }],
  ['posts', '3', { id: 3, kind: 'visual', author_id: 'demo-vaidya-3', author_name: 'Tulsi Threads', author_username: 'tulsi.threads', author_avatar: null, caption: 'Golden milk, done right: cracked pepper + fat + low heat for 7 minutes. No shortcuts.', title: null, summary: null, content_md: null, media_url: null, media_type: null, tags: ['recipes', 'haldi', 'kapha'], likes_count: 58, saves_count: 31, comments_count: 0, views_count: 890, created_at: iso(150) }],
  ['posts', '4', { id: 4, kind: 'forge', author_id: 'demo-vaidya-1', author_name: 'Vaidya Meera Nair', author_username: 'vaidya.meera', author_avatar: null, caption: null, title: 'Reading your prakriti without a quiz', summary: 'Forget the 20-question quizzes. Here is how a vaidya actually reads constitution in the first five minutes.', content_md: '# Prakriti, clinically\n\nNadi, jihva, sparsha — pulse, tongue, touch. Before any questionnaire…', media_url: null, media_type: null, tags: ['prakriti', 'diagnosis'], read_minutes: 6, likes_count: 73, saves_count: 40, comments_count: 0, views_count: 1200, created_at: iso(1200) }],

  ['comments', '1', { id: 1, post_id: 1, user_id: 'demo-vaidya-2', body: 'Do you warm the oil each time, or keep a heated vessel through the week?', author_name: 'Arjun Rasa', author_username: 'arjun.rasa', author_avatar: null, created_at: iso(200) }],
  ['comments', '2', { id: 2, post_id: 1, user_id: 'demo-vaidya-1', body: 'Fresh-warm every morning — reheated oil loses its snigdha quality.', author_name: 'Vaidya Meera Nair', author_username: 'vaidya.meera', author_avatar: null, created_at: iso(180) }],
  ['comments', '3', { id: 3, post_id: 2, user_id: 'demo-vaidya-3', body: 'Would love a follow-up on bhasma pariksha tests at home scale.', author_name: 'Tulsi Threads', author_username: 'tulsi.threads', author_avatar: null, created_at: iso(600) }],

  ['likes', 'demo-vaidya-2_1', { id: 1, user_id: 'demo-vaidya-2', post_id: 1, created_at: iso(190) }],
  ['likes', 'demo-vaidya-3_3', { id: 2, user_id: 'demo-vaidya-3', post_id: 3, created_at: iso(100) }],
  ['saves', 'demo-vaidya-2_4', { id: 1, user_id: 'demo-vaidya-2', post_id: 4, created_at: iso(1100) }],
  ['follows', 'demo-vaidya-2_demo-vaidya-1', { id: 1, follower_id: 'demo-vaidya-2', followee_id: 'demo-vaidya-1', created_at: iso(4000) }],
  ['follows', 'demo-vaidya-3_demo-vaidya-1', { id: 2, follower_id: 'demo-vaidya-3', followee_id: 'demo-vaidya-1', created_at: iso(3900) }],

  ['groups', '1', { id: 1, name: 'Dinacharya Club', slug: 'dinacharya-club', description: 'Daily routine check-ins and seasonal tweaks.', kind: 'circle', owner_id: 'demo-vaidya-1', tags: ['dinacharya'], member_count: 2, conversation_id: 1, created_at: iso(3000) }],
  ['groups', '2', { id: 2, name: 'Rasa Lab', slug: 'rasa-lab', description: 'Classical pharmacy study circle.', kind: 'study', owner_id: 'demo-vaidya-2', tags: ['rasashastra'], member_count: 1, conversation_id: null, created_at: iso(2500) }],
  ['group_members', '1', { id: 1, group_id: 1, user_id: 'demo-vaidya-1', role: 'admin', created_at: iso(3000) }],
  ['group_members', '2', { id: 2, group_id: 1, user_id: 'demo-vaidya-3', role: 'member', created_at: iso(2900) }],
  ['group_posts', '1', { id: 1, group_id: 1, post_id: 1, kind: 'visual', created_at: iso(280) }],

  ['conversations', '1', { id: 1, name: 'Dinacharya Club', is_group: true, created_by: 'demo-vaidya-1', last_message_at: iso(30), created_at: iso(3000) }],
  ['conversation_members', '1', { id: 1, conversation_id: 1, user_id: 'demo-vaidya-1', created_at: iso(3000) }],
  ['conversation_members', '2', { id: 2, conversation_id: 1, user_id: 'demo-vaidya-3', created_at: iso(2900) }],
  ['messages', '1', { id: 1, conversation_id: 1, sender_id: 'demo-vaidya-3', type: 'text', body: 'Did my abhyanga before 6 today — reporting for duty 🌿', media_url: null, post_id: null, sender_name: 'Tulsi Threads', sender_avatar: null, created_at: iso(45) }],
  ['messages', '2', { id: 2, conversation_id: 1, sender_id: 'demo-vaidya-1', type: 'text', body: 'Beautiful. Keep the oil warm, not hot — sukha, not sweat.', media_url: null, post_id: null, sender_name: 'Vaidya Meera Nair', sender_avatar: null, created_at: iso(30) }],

  ['statuses', '1', { id: 1, user_id: 'demo-vaidya-3', media_url: null, caption: 'Tulsi harvest day 🌱', created_at: iso(90) }],
  ['notifications', '1', { id: 1, user_id: 'demo-vaidya-1', actor_id: 'demo-vaidya-2', type: 'like', preview: 'liked your abhyanga post', read: false, created_at: iso(190) }],
  ['signals', '1', { id: 1, user_id: 'demo-vaidya-2', type: 'like', post_id: 1, tags: ['abhyanga'], kind: 'visual', created_at: iso(190) }],
  ['user_prefs', 'demo-vaidya-2', { user_id: 'demo-vaidya-2', boosted_tags: ['rasashastra'], muted_tags: [], created_at: iso(2000) }],

  ['boosts', '1', { id: 1, user_id: 'demo-vaidya-3', target_type: 'post', post_id: 3, goal_type: 'reach', status: 'active', expires_at: new Date(T0 + 6 * 86400000).toISOString(), created_at: iso(60) }],
  ['payout_requests', '1', { id: 1, user_id: 'demo-vaidya-1', amount_cents: 4200, status: 'queued', created_at: iso(500) }],

  // id counters continue after the seed (backend auto-increments from here)
  ['counters', 'posts', { next: 5 }],
  ['counters', 'comments', { next: 4 }],
  ['counters', 'likes', { next: 3 }],
  ['counters', 'saves', { next: 2 }],
  ['counters', 'follows', { next: 3 }],
  ['counters', 'groups', { next: 3 }],
  ['counters', 'group_members', { next: 3 }],
  ['counters', 'group_posts', { next: 2 }],
  ['counters', 'conversations', { next: 2 }],
  ['counters', 'conversation_members', { next: 3 }],
  ['counters', 'messages', { next: 3 }],
  ['counters', 'statuses', { next: 2 }],
  ['counters', 'notifications', { next: 2 }],
  ['counters', 'signals', { next: 2 }],
  ['counters', 'boosts', { next: 2 }],
  ['counters', 'payout_requests', { next: 2 }],
];

let ok = 0;
for (const [coll, id, data] of docs) {
  if (USE_EMULATOR) await restPut(coll, id, data);
  else await setDoc(doc(db, coll, String(id)), data);
  ok++;
}
console.log(`\nReseed done — ${ok} documents.`);
if (USE_EMULATOR) process.exit(0);
await terminate(db);
await deleteApp(app);
process.exit(0);
