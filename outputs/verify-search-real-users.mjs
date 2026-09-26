/**
 * Verification: the Library / Golden Threads people lane must surface REAL
 * Firestore profile docs (users who signed in via Firebase Auth), not just
 * the baked-in demo seeds.
 *
 * We stub global fetch to emulate the Firestore REST `list` endpoint
 * returning one real signed-in weaver, then run a `profiles` select through
 * the same query builder /api/search and /api/profiles use.
 *
 * With the old initColl (fresh-timestamped seed cache) restList never called
 * fetch at all → 'real.weaver' was invisible. With at: 0 the first read
 * refreshes from Firestore and merges.
 */

const realDoc = {
  name: 'projects/ananta-ayurverse/databases/(default)/documents/profiles/real-uid-123',
  fields: {
    id: { integerValue: '999001' },
    user_id: { stringValue: 'real-uid-123' },
    username: { stringValue: 'real.weaver' },
    full_name: { stringValue: 'Real Weaver' },
    bio: { stringValue: 'Actually signed-in human from Firebase Auth' },
    avatar_url: { nullValue: null },
    created_at: { stringValue: new Date().toISOString() },
  },
};

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return { ok: true, status: 200, json: async () => ({ documents: [realDoc] }) };
};

const { db } = await import('../api/db-client.js');

const { data, error } = await db.from('profiles').select('*');
if (error) { console.error('FAIL: query errored', error); process.exit(1); }

const usernames = (data || []).map((p) => p.username);
const hasReal = usernames.includes('real.weaver');
const hasDemo = usernames.includes('vaidya.meera');

console.log('firestore REST fetch called:', fetchCalls > 0);
console.log('profiles returned:', data.length);
console.log('real signed-in user visible:', hasReal);
console.log('demo seed still present (fallback merge):', hasDemo);

// simulate the search-side ilike filter used by /api/search people pool
const q = await db.from('profiles').select('*').or('username.ilike.%real%,full_name.ilike.%real%,bio.ilike.%real%').limit(240);
console.log('ilike search for "real" finds:', (q.data || []).map((p) => p.username));

if (fetchCalls === 0) { console.error('FAIL: restList served stale seed cache without refreshing'); process.exit(1); }
if (!hasReal) { console.error('FAIL: real Firestore user missing from people results'); process.exit(1); }
if (!hasDemo) { console.error('FAIL: demo seeds lost in merge'); process.exit(1); }
if (!(q.data || []).some((p) => p.username === 'real.weaver')) { console.error('FAIL: real user not searchable'); process.exit(1); }
console.log('\nPASS — real signed-in users now surface in the people search schema.');
