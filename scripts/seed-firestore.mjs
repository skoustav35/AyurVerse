/**
 * AyurVerse · Firestore seed (project: ananta-ayurverse)
 *
 * Run ONLY while the temporary open rules are deployed:
 *   1. (backup made automatically) open rules deployed
 *   2. node scripts/seed-firestore.mjs
 *   3. strict rules restored + redeployed
 *
 * Uses the publishable Web API key (public by design). No service account needed.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I',
  authDomain: 'ananta-ayurverse.firebaseapp.com',
  projectId: 'ananta-ayurverse',
});
const db = getFirestore(app);

const T0 = Date.now();
const iso = (minsAgo) => new Date(T0 - minsAgo * 60000).toISOString();

const docs = [
  // ---- profiles ----
  ['profiles', 'demo-vaidya-1', { id: 1, user_id: 'demo-vaidya-1', username: 'vaidya.meera', full_name: 'Vaidya Meera Nair', bio: 'Kerala panchakarma physician · 15 yrs', avatar_url: null, created_at: iso(5000) }],
  ['profiles', 'demo-vaidya-2', { id: 2, user_id: 'demo-vaidya-2', username: 'arjun.rasa', full_name: 'Arjun Rasa', bio: 'Rasashastra student & herbal grower', avatar_url: null, created_at: iso(4800) }],
  ['profiles', 'demo-vaidya-3', { id: 3, user_id: 'demo-vaidya-3', username: 'tulsi.threads', full_name: 'Tulsi Threads', bio: 'Ayurvedic kitchen · recipes & rituals', avatar_url: null, created_at: iso(4600) }],

  // ---- posts (visual + forge) ----
  ['posts', 'demo-post-1', { id: 1, kind: 'visual', author_id: 'demo-vaidya-1', author_name: 'Vaidya Meera Nair', author_username: 'vaidya.meera', author_avatar: null, caption: 'Morning abhyanga — warm sesame oil, slow strokes, before sunrise. The nervous system drinks it first.', title: null, summary: null, content_md: null, media_url: null, media_type: null, tags: ['abhyanga', 'dinacharya', 'vata'], likes_count: 24, saves_count: 9, comments_count: 2, views_count: 310, created_at: iso(300) }],
  ['posts', 'demo-post-2', { id: 2, kind: 'forge', author_id: 'demo-vaidya-2', author_name: 'Arjun Rasa', author_username: 'arjun.rasa', author_avatar: null, caption: null, title: 'Rasashastra notes: what shodhana actually removes', summary: 'Purification is not symbolism — a practical look at media, heat cycles, and assay results.', content_md: '# Shodhana, practically\n\nShodhana (purification) of metals and minerals uses repeated quenching in herbal decoctions. Each cycle…', media_url: null, media_type: null, tags: ['rasashastra', 'shodhana'], read_minutes: 4, likes_count: 41, saves_count: 17, comments_count: 1, views_count: 520, created_at: iso(700) }],
  ['posts', 'demo-post-3', { id: 3, kind: 'visual', author_id: 'demo-vaidya-3', author_name: 'Tulsi Threads', author_username: 'tulsi.threads', author_avatar: null, caption: 'Golden milk, done right: cracked pepper + fat + low heat for 7 minutes. No shortcuts.', title: null, summary: null, content_md: null, media_url: null, media_type: null, tags: ['recipes', 'haldi', 'kapha'], likes_count: 58, saves_count: 31, comments_count: 0, views_count: 890, created_at: iso(150) }],
  ['posts', 'demo-post-4', { id: 4, kind: 'forge', author_id: 'demo-vaidya-1', author_name: 'Vaidya Meera Nair', author_username: 'vaidya.meera', author_avatar: null, caption: null, title: 'Reading your prakriti without a quiz', summary: 'Forget the 20-question quizzes. Here is how a vaidya actually reads constitution in the first five minutes.', content_md: '# Prakriti, clinically\n\nNadi, jihva, sparsha — pulse, tongue, touch. Before any questionnaire…', media_url: null, media_type: null, tags: ['prakriti', 'diagnosis'], read_minutes: 6, likes_count: 73, saves_count: 40, comments_count: 0, views_count: 1200, created_at: iso(1200) }],

  // ---- comments ----
  ['comments', 'demo-comment-1', { id: 1, post_id: 'demo-post-1', user_id: 'demo-vaidya-2', body: 'Do you warm the oil each time, or keep a heated vessel through the week?', author_name: 'Arjun Rasa', author_username: 'arjun.rasa', author_avatar: null, created_at: iso(200) }],
  ['comments', 'demo-comment-2', { id: 2, post_id: 'demo-post-1', user_id: 'demo-vaidya-1', body: 'Fresh-warm every morning — reheated oil loses its snigdha quality.', author_name: 'Vaidya Meera Nair', author_username: 'vaidya.meera', author_avatar: null, created_at: iso(180) }],
  ['comments', 'demo-comment-3', { id: 3, post_id: 'demo-post-2', user_id: 'demo-vaidya-3', body: 'Would love a follow-up on bhasma pariksha tests at home scale.', author_name: 'Tulsi Threads', author_username: 'tulsi.threads', author_avatar: null, created_at: iso(600) }],

  // ---- likes / saves / follows ----
  ['likes', 'demo-vaidya-2_demo-post-1', { user_id: 'demo-vaidya-2', post_id: 'demo-post-1', created_at: iso(190) }],
  ['likes', 'demo-vaidya-3_demo-post-3', { user_id: 'demo-vaidya-3', post_id: 'demo-post-3', created_at: iso(100) }],
  ['saves', 'demo-vaidya-2_demo-post-4', { user_id: 'demo-vaidya-2', post_id: 'demo-post-4', created_at: iso(1100) }],
  ['follows', 'demo-vaidya-2_demo-vaidya-1', { follower_id: 'demo-vaidya-2', followee_id: 'demo-vaidya-1', created_at: iso(4000) }],
  ['follows', 'demo-vaidya-3_demo-vaidya-1', { follower_id: 'demo-vaidya-3', followee_id: 'demo-vaidya-1', created_at: iso(3900) }],

  // ---- circles ----
  ['groups', 'demo-group-1', { id: 1, name: 'Dinacharya Club', slug: 'dinacharya-club', description: 'Daily routine check-ins and seasonal tweaks.', kind: 'circle', owner_id: 'demo-vaidya-1', tags: ['dinacharya'], member_count: 2, conversation_id: 'demo-conv-1', created_at: iso(3000) }],
  ['groups', 'demo-group-2', { id: 2, name: 'Rasa Lab', slug: 'rasa-lab', description: 'Classical pharmacy study circle.', kind: 'study', owner_id: 'demo-vaidya-2', tags: ['rasashastra'], member_count: 1, conversation_id: null, created_at: iso(2500) }],
  ['group_members', 'demo-gm-1', { group_id: 'demo-group-1', user_id: 'demo-vaidya-1', role: 'admin', created_at: iso(3000) }],
  ['group_members', 'demo-gm-2', { group_id: 'demo-group-1', user_id: 'demo-vaidya-3', role: 'member', created_at: iso(2900) }],
  ['group_posts', 'demo-gp-1', { group_id: 'demo-group-1', post_id: 'demo-post-1', kind: 'visual', created_at: iso(280) }],

  // ---- threads ----
  ['conversations', 'demo-conv-1', { id: 1, name: 'Dinacharya Club', is_group: true, created_by: 'demo-vaidya-1', last_message_at: iso(30), created_at: iso(3000) }],
  ['conversation_members', 'demo-cm-1', { conversation_id: 'demo-conv-1', user_id: 'demo-vaidya-1', created_at: iso(3000) }],
  ['conversation_members', 'demo-cm-2', { conversation_id: 'demo-conv-1', user_id: 'demo-vaidya-3', created_at: iso(2900) }],
  ['messages', 'demo-msg-1', { id: 1, conversation_id: 'demo-conv-1', sender_id: 'demo-vaidya-3', type: 'text', body: 'Did my abhyanga before 6 today — reporting for duty 🌿', media_url: null, post_id: null, sender_name: 'Tulsi Threads', sender_avatar: null, created_at: iso(45) }],
  ['messages', 'demo-msg-2', { id: 2, conversation_id: 'demo-conv-1', sender_id: 'demo-vaidya-1', type: 'text', body: 'Beautiful. Keep the oil warm, not hot — sukha, not sweat.', media_url: null, post_id: null, sender_name: 'Vaidya Meera Nair', sender_avatar: null, created_at: iso(30) }],

  // ---- stories / notifications / signals / prefs ----
  ['statuses', 'demo-status-1', { id: 1, user_id: 'demo-vaidya-3', media_url: null, caption: 'Tulsi harvest day 🌱', created_at: iso(90) }],
  ['notifications', 'demo-notif-1', { id: 1, user_id: 'demo-vaidya-1', actor_id: 'demo-vaidya-2', type: 'like', preview: 'liked your abhyanga post', read: false, created_at: iso(190) }],
  ['signals', 'demo-signal-1', { id: 1, user_id: 'demo-vaidya-2', type: 'like', post_id: 'demo-post-1', tags: ['abhyanga'], kind: 'visual', created_at: iso(190) }],
  ['user_prefs', 'demo-vaidya-2', { user_id: 'demo-vaidya-2', boosted_tags: ['rasashastra'], muted_tags: [], created_at: iso(2000) }],

  // ---- monetisation ----
  ['boosts', 'demo-boost-1', { id: 1, user_id: 'demo-vaidya-3', target_type: 'post', post_id: 'demo-post-3', goal_type: 'reach', status: 'active', expires_at: new Date(T0 + 6 * 86400000).toISOString(), created_at: iso(60) }],
  ['payout_requests', 'demo-payout-1', { id: 1, user_id: 'demo-vaidya-1', amount_cents: 4200, status: 'queued', created_at: iso(500) }],
];

let ok = 0;
for (const [coll, id, data] of docs) {
  await setDoc(doc(db, coll, String(id)), data);
  ok++;
  console.log(`seeded ${coll}/${id}`);
}
console.log(`\nDone — ${ok} documents across ${new Set(docs.map((d) => d[0])).size} collections.`);
process.exit(0);
