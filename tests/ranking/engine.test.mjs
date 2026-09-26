/*
 * Ranking engine unit tests — pure JS, no network, no framework.
 * Run:  node --test tests/ranking/engine.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS, DEFAULT_PREFS, clamp, cleanTags, tokenize, timestamp } from '../../api/lib/ranking/config.js';
import { buildIndex, retrieve, cosine, reciprocalRankFusion } from '../../api/lib/ranking/retrieval.js';
import { isEligible, qualitySignals, fingerprint } from '../../api/lib/ranking/quality.js';
import { emptyFeatures, decayFeatures, updateFeatures, personalizedScore, featureContext } from '../../api/lib/ranking/features.js';
import { rankPosts } from '../../api/lib/ranking/engine.js';

const NOW = Date.now();
const iso = (agoMs) => new Date(NOW - agoMs).toISOString();
const HOUR = 3600_000;
const DAY = 86400_000;

let seq = 100000;
function makePost(over = {}) {
  const id = over.id ?? ++seq;
  return {
    id,
    author_id: over.author_id ?? `u${id}`,
    author_username: over.author_username ?? `user${id}`,
    kind: over.kind ?? 'visual',
    created_at: over.created_at ?? iso(HOUR),
    caption: over.caption ?? 'hello garden',
    media_url: over.media_url ?? `media/${id}.jpg`,
    tags: over.tags ?? [],
    ...over,
  };
}

/* ============================== config ============================== */

test('config exports shared contract', () => {
  assert.equal(typeof LIMITS.query, 'number');
  assert.equal(typeof clamp(2, 0, 1), 'number');
  assert.deepEqual(cleanTags(['#Chai', 'chai', 'a b', '__proto__']), ['chai', 'ab', '__proto__']);
  assert.deepEqual(tokenize('Chai & Masala!'), ['chai', 'masala']);
  assert.equal(timestamp('nonsense', 7), 7);
});

/* ============================== retrieval ============================== */

test('BM25 field weighting: title match outranks body match', () => {
  const titlePost = makePost({ id: 1, title: 'chai', caption: 'quiet', kind: 'forge' });
  const bodyPost = makePost({ id: 2, title: 'quiet', content_md: 'chai', kind: 'forge' });
  const index = buildIndex([titlePost, bodyPost]);
  const { candidates } = retrieve(index, { query: 'chai', now: NOW, limit: 10 });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].post.id, 1);
  assert.ok(candidates[0].lexical > candidates[1].lexical);
  assert.ok(candidates[0].sources.includes('lexical'));
});

test('BM25 synonym expansion finds a true synonym', () => {
  const syn = makePost({ id: 3, caption: 'a verse about rain' });
  const other = makePost({ id: 4, caption: 'unrelated content' });
  const index = buildIndex([syn, other]);
  const { candidates } = retrieve(index, { query: 'poetry', now: NOW });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].post.id, 3);
  assert.ok(candidates[0].lexical > 0);
});

test('true vector semantic retrieval (same model/dim)', () => {
  const a = makePost({ id: 5, caption: 'zzz', embedding: [1, 0, 0], embedding_model: 'm1' });
  const b = makePost({ id: 6, caption: 'yyy', embedding: [0, 1, 0], embedding_model: 'm1' });
  const index = buildIndex([a, b]);
  const { candidates, stats } = retrieve(index, { query: 'q', queryVector: [1, 0, 0], embeddingModel: 'm1', now: NOW });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].post.id, 5);
  assert.ok(candidates[0].semantic > 0.99);
  assert.equal(stats.semanticUsed, true);
});

test('semantic is ignored across different embedding models', () => {
  const a = makePost({ id: 7, caption: 'zzz', embedding: [1, 0, 0], embedding_model: 'm1' });
  const index = buildIndex([a]);
  const { candidates, stats } = retrieve(index, { query: 'q', queryVector: [1, 0, 0], embeddingModel: 'm2', now: NOW });
  assert.equal(candidates.length, 0);
  assert.equal(stats.semanticUsed, false);
});

test('no fake hashed semantic when post has no embedding', () => {
  const a = makePost({ id: 8, caption: 'zzz' });
  const index = buildIndex([a]);
  const { candidates, stats } = retrieve(index, { query: 'q', queryVector: [1, 0, 0], embeddingModel: 'm1', now: NOW });
  assert.equal(candidates.length, 0);
  assert.equal(stats.degraded, false);
});

test('hard operator filters with zero matches never broaden', () => {
  const a = makePost({ id: 9, caption: 'chai', tags: ['tea'] });
  const index = buildIndex([a]);
  const { candidates, plan } = retrieve(index, { query: '#zzzznope', now: NOW });
  assert.equal(candidates.length, 0);
  assert.equal(plan.ops.tag, 'zzzznope');

  const authorMiss = retrieve(index, { query: '@nobody', now: NOW });
  assert.equal(authorMiss.candidates.length, 0);
  assert.equal(authorMiss.plan.ops.author, 'nobody');
});

test('inline kind operator and kind param are both hard conjunctive', () => {
  const img = makePost({ id: 10, media_type: 'image', caption: 'chai' });
  const vid = makePost({ id: 11, media_type: 'video', caption: 'chai' });
  const index = buildIndex([img, vid]);

  const inline = retrieve(index, { query: 'kind:video chai', now: NOW });
  assert.deepEqual(inline.candidates.map((c) => c.post.id), [11]);

  const param = retrieve(index, { query: 'chai', kind: 'image', now: NOW });
  assert.deepEqual(param.candidates.map((c) => c.post.id), [10]);

  const both = retrieve(index, { query: 'kind:video chai', kind: 'image', now: NOW });
  assert.equal(both.candidates.length, 0);
});

test('empty text query yields feed union with recent/follow/interest sources', () => {
  const mine = makePost({ id: 12, author_id: 'u12' });
  const index = buildIndex([mine]);
  const { candidates, plan } = retrieve(index, { query: '', followIds: ['u12'], now: NOW });
  assert.equal(plan.mode, 'feed');
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].sources.includes('recent'));
  assert.ok(candidates[0].sources.includes('follow'));
});

test('query is bounded to 160 chars and 16 tokens', () => {
  const long = `${'token '.repeat(40)} ${'x'.repeat(300)}`;
  const index = buildIndex([makePost({ id: 13, caption: 'token' })]);
  const { plan } = retrieve(index, { query: long, now: NOW });
  assert.ok(plan.raw.length <= LIMITS.query);
  assert.ok(plan.tokens.length <= LIMITS.queryTokens);
});

test('cosine validates dims/finiteness and reciprocalRankFusion orders lists', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 2], [1, 2, 3]), 0);
  assert.equal(cosine(['a', 1], [1, 1]), 0);
  assert.equal(cosine(null, [1]), 0);
  assert.equal(cosine([0, 0], [1, 1]), 0);

  const fused = reciprocalRankFusion([[1, 2], [2, 3]], [1, 1]);
  assert.equal(fused[0].id, '2');
  assert.ok(fused[0].score > fused[1].score);
});

test('retrieve tolerates a missing/invalid index', () => {
  assert.deepEqual(retrieve(null, { query: 'x' }).candidates, []);
  assert.deepEqual(retrieve({}, {}).candidates, []);
  assert.deepEqual(retrieve(undefined, { query: { bad: true } }).candidates, []);
});

/* ============================== quality ============================== */

test('isEligible rejects the hard floor cases', () => {
  assert.equal(isEligible(makePost({ id: 20 }), { now: NOW }), true);
  assert.equal(isEligible(null, { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 'bad' }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 21, author_id: null }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 22, deleted: true }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 23, deleted_at: iso(HOUR) }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 24, visibility: 'private' }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 25, visibility: 'public' }), { now: NOW }), true); // legacy ok
  assert.equal(isEligible(makePost({ id: 26, moderation_status: 'removed' }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 27, moderation_status: 'quarantined' }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 28, created_at: 'not-a-date' }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 29, created_at: iso(-10 * 60_000) }), { now: NOW }), false); // future
  assert.equal(isEligible(makePost({ id: 30 }), { now: NOW, userFeatures: { hidden: [30] } }), false);
  assert.equal(isEligible(makePost({ id: 31, tags: ['chai'] }), { now: NOW, preferences: { muted_tags: ['chai'] } }), false);
  assert.equal(isEligible(makePost({ id: 32, author_id: 'badguy' }), { now: NOW, preferences: { muted_authors: ['badguy'] } }), false);
  assert.equal(
    isEligible(makePost({ id: 33, author_id: 'u33' }), { now: NOW, preferences: { feed_mode: 'following' }, followIds: ['someone'] }),
    false,
  );
  assert.equal(
    isEligible(makePost({ id: 34, author_id: 'u34' }), { now: NOW, preferences: { feed_mode: 'following' }, followIds: ['u34'] }),
    true,
  );
});

test('a paid boost can never bypass a reject', () => {
  assert.equal(isEligible(makePost({ id: 40, deleted: true, boost_id: 1, boosted: true }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 41, moderation_status: 'blocked', boosted: true }), { now: NOW }), false);
  assert.equal(isEligible(makePost({ id: 42, tags: ['chai'], boosted: true }), { now: NOW, preferences: { muted_tags: ['chai'] } }), false);
});

test('qualitySignals: raw counters whisper, ranking_stats are authoritative', () => {
  const rawOnly = makePost({ id: 50, likes_count: 1e9, views_count: 1e9, caption: 'hi', media_url: 'm.jpg' });
  const statsBacked = makePost({ id: 51, caption: 'hi', media_url: 'm.jpg', ranking_stats: { impressions: 1000, positive: 500, negative: 0, updated_at: NOW } });
  const raw = qualitySignals(rawOnly, { now: NOW });
  const good = qualitySignals(statsBacked, { now: NOW });
  assert.ok(raw.engagement <= 0.2, `raw-only engagement should stay tiny, got ${raw.engagement}`);
  assert.ok(good.engagement > 0.5, `stats-backed engagement should be high, got ${good.engagement}`);
  assert.ok(raw.quality >= 0 && raw.quality <= 1);
});

test('spam rejects link/repeat spam but keeps short creative posts', () => {
  const spammy = makePost({
    id: 52,
    caption: 'buy now buy now buy now http://a.com http://b.com http://c.com http://d.com http://e.com http://f.com http://g.com http://h.com',
    report_count: 3,
  });
  assert.ok(qualitySignals(spammy, { now: NOW }).spam >= 0.9);
  assert.equal(isEligible(spammy, { now: NOW }), false);

  const shortCreative = makePost({ id: 53, caption: 'hi', media_url: 'art.jpg' });
  const sig = qualitySignals(shortCreative, { now: NOW });
  assert.ok(sig.spam < 0.3);
  assert.equal(isEligible(shortCreative, { now: NOW }), true);
  assert.equal(sig.newContent, true);
});

test('fingerprint dedups true copies but keeps blank visuals distinct', () => {
  const a = makePost({ id: 60, caption: 'Same   Words!', media_url: 'https://cdn/x.jpg?a=1' });
  const b = makePost({ id: 61, caption: 'same words', media_url: 'https://cdn/x.jpg?b=2' });
  assert.equal(fingerprint(a), fingerprint(b));

  const blank1 = makePost({ id: 62, caption: '', media_url: null, tags: [] });
  const blank2 = makePost({ id: 63, caption: '', media_url: null, tags: [] });
  assert.notEqual(fingerprint(blank1), fingerprint(blank2));
});

/* ============================== features ============================== */

test('emptyFeatures shape and featureContext bounds', () => {
  const s = emptyFeatures(NOW);
  assert.equal(s.version, 1);
  assert.equal(s.events, 0);
  assert.deepEqual(s.hidden, []);
  const ctx = featureContext(s, DEFAULT_PREFS, NOW);
  assert.equal(ctx.length, 6);
  assert.ok(ctx.every(Number.isFinite));
  assert.equal(ctx[0], 1);
  assert.equal(ctx[1], 1); // cold
  assert.ok(ctx.every((v) => v >= 0 && v <= 1));

  const warm = featureContext({ ...s, events: 60 }, { ...DEFAULT_PREFS, feed_mode: 'following' }, NOW);
  assert.ok(warm[1] < 1);
  assert.equal(warm[5], 1);
});

test('updateFeatures records positive affinity; hide/report record hidden', () => {
  const p = makePost({ id: 70, tags: ['chai'], author_id: 'u70', kind: 'visual' });
  let s = emptyFeatures(NOW);
  s = updateFeatures(s, 'like', p, NOW);
  s = updateFeatures(s, 'save', p, NOW);
  assert.ok(s.tags.chai > 0);
  assert.ok(s.authors.u70 > 0);
  assert.ok(s.kinds.visual > 0);
  assert.equal(s.events, 2);
  assert.equal(s.hidden.length, 0);

  const hidden = updateFeatures(emptyFeatures(NOW), 'hide', p, NOW);
  assert.ok(hidden.hidden.includes(70));
  assert.ok(hidden.tags.chai < 0);
  const reported = updateFeatures(emptyFeatures(NOW), 'report', p, NOW);
  assert.ok(reported.hidden.includes(70));
});

test('signed decay halves affinity after the 7-day half life', () => {
  const p = makePost({ id: 71, tags: ['chai'] });
  const s = updateFeatures(emptyFeatures(NOW), 'like', p, NOW);
  const before = s.tags.chai;
  const decayed = decayFeatures(s, NOW + 7 * DAY);
  assert.ok(Math.abs(decayed.tags.chai - before / 2) < 0.05);
});

test('maps and id lists stay bounded', () => {
  let s = emptyFeatures(NOW);
  for (let i = 0; i < 120; i++) s = updateFeatures(s, 'like', makePost({ id: 1000 + i, tags: [`tag${i}`] }), NOW);
  assert.ok(Object.keys(s.tags).length <= 80);

  let h = emptyFeatures(NOW);
  for (let i = 0; i < 250; i++) h = updateFeatures(h, 'hide', makePost({ id: 2000 + i }), NOW);
  assert.ok(h.hidden.length <= 200);
});

test('hostile keys and non-finite values cannot pollute prototypes', () => {
  const evil = makePost({ id: 80, tags: ['__proto__', 'constructor', 'prototype', 'chai'] });
  const s = updateFeatures(emptyFeatures(NOW), 'like', evil, NOW);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.ok(s.tags.chai > 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(s.tags, '__proto__'));
  assert.ok(!Object.prototype.hasOwnProperty.call(s.tags, 'constructor'));
  assert.ok(!Object.prototype.hasOwnProperty.call(s.tags, 'prototype'));

  const poisoned = JSON.parse('{"version":1,"events":1,"tags":{"__proto__":{"polluted":true}},"authors":{},"kinds":{},"hidden":[],"seen":[]}');
  decayFeatures(poisoned, NOW);
  assert.equal({}.polluted, undefined);
});

test('personalizedScore respects opt-out and stays bounded', () => {
  const p = makePost({ id: 90, tags: ['chai'], author_id: 'u90' });
  let s = emptyFeatures(NOW);
  for (let i = 0; i < 3; i++) s = updateFeatures(s, 'save', p, NOW);
  const score = personalizedScore(p, s, DEFAULT_PREFS, [], NOW);
  assert.ok(score > 0 && score <= 1);
  assert.equal(personalizedScore(p, s, { ...DEFAULT_PREFS, personalization: false }, [], NOW), 0);
  assert.ok(personalizedScore(p, s, DEFAULT_PREFS, ['u90'], NOW) >= score);
});

/* ============================== engine ============================== */

test('rankPosts returns ranked wrappers and honest meta', () => {
  const posts = [
    makePost({ id: 200, caption: 'chai and rain', tags: ['chai'] }),
    makePost({ id: 201, caption: 'mountain view' }),
  ];
  const { items, meta } = rankPosts({ posts, query: '', now: NOW, limit: 10 });
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.ok(it.post && typeof it.score === 'number');
    assert.ok(it.features && typeof it.reason === 'string' && it.reason.length > 0);
    assert.ok(Array.isArray(it.sources));
  }
  assert.equal(meta.eligible, 2);
  assert.equal(meta.coldStart, true);
  assert.ok(meta.diversity.authors >= 1);
});

test('cold start with zero history produces no personalization', () => {
  const posts = [makePost({ id: 210 }), makePost({ id: 211 })];
  const { items, meta } = rankPosts({ posts, query: '', userFeatures: emptyFeatures(NOW), now: NOW });
  assert.equal(meta.coldStart, true);
  assert.equal(meta.personalized, false);
  assert.ok(items.every((it) => it.features.personalization === 0));
});

test('personalization opt-out yields zero taste even with history', () => {
  const p = makePost({ id: 220, tags: ['chai'], author_id: 'u220' });
  let state = emptyFeatures(NOW);
  for (let i = 0; i < 5; i++) state = updateFeatures(state, 'save', p, NOW);
  const { items, meta } = rankPosts({ posts: [p, makePost({ id: 221, tags: ['chai'] })], query: '', userFeatures: state, preferences: { personalization: false }, now: NOW });
  assert.equal(meta.personalized, false);
  assert.ok(items.every((it) => it.features.personalization === 0));
});

test('rolling author cap is 2 per 10 with no consecutive repeats', () => {
  const posts = [];
  for (let a = 0; a < 4; a++) {
    for (let i = 0; i < 3; i++) posts.push(makePost({ id: 300 + a * 10 + i, author_id: `au${a}` }));
  }
  const { items } = rankPosts({ posts, query: '', now: NOW, limit: 12 });
  for (let i = 0; i < items.length; i++) {
    const window = items.slice(Math.max(0, i - 9), i + 1);
    const counts = {};
    for (const it of window) counts[it.post.author_id] = (counts[it.post.author_id] || 0) + 1;
    for (const k of Object.keys(counts)) assert.ok(counts[k] <= 2, `author ${k} exceeded cap`);
  }
  for (let i = 1; i < items.length; i++) {
    assert.notEqual(items[i].post.author_id, items[i - 1].post.author_id, 'consecutive same author with alternatives available');
  }
});

test('shorter page rather than breaking the author cap', () => {
  const posts = [makePost({ id: 400, author_id: 'solo' }), makePost({ id: 401, author_id: 'solo' }), makePost({ id: 402, author_id: 'solo' })];
  const { items } = rankPosts({ posts, query: '', now: NOW, limit: 10 });
  assert.equal(items.length, 2);
});

test('feed reserves up to two fresh, quality-safe posts in the top ten', () => {
  const posts = [];
  for (let i = 0; i < 10; i++) posts.push(makePost({ id: 500 + i, author_id: `old${i}`, created_at: iso(8 * DAY) }));
  const newA = makePost({ id: 600, author_id: 'freshA', created_at: iso(2 * HOUR) });
  const newB = makePost({ id: 601, author_id: 'freshB', created_at: iso(2 * HOUR) });
  posts.push(newA, newB);

  const { items, meta } = rankPosts({ posts, query: '', now: NOW, limit: 10 });
  const ids = items.slice(0, 10).map((it) => it.post.id);
  assert.ok(ids.includes(600), 'freshA should be promoted into top 10');
  assert.ok(ids.includes(601), 'freshB should be promoted into top 10');
  assert.ok(meta.freshShare > 0);
});

test('latest mode is chronological but still mutes', () => {
  const posts = [
    makePost({ id: 700, created_at: iso(3 * HOUR) }),
    makePost({ id: 701, created_at: iso(1 * HOUR) }),
    makePost({ id: 702, created_at: iso(2 * HOUR), tags: ['muted'] }),
  ];
  const { items } = rankPosts({ posts, query: '', preferences: { feed_mode: 'latest', muted_tags: ['muted'] }, now: NOW, limit: 10 });
  assert.deepEqual(items.map((it) => it.post.id), [701, 700]);
});

test('following mode serves only followed authors', () => {
  const posts = [makePost({ id: 800, author_id: 'me' }), makePost({ id: 801, author_id: 'stranger' })];
  const { items } = rankPosts({ posts, query: '', preferences: { feed_mode: 'following' }, followIds: ['me'], now: NOW });
  assert.deepEqual(items.map((it) => it.post.id), [800]);
  assert.equal(items[0].reason.includes('follow'), true);
});

test('search relevance cannot be dominated by popularity', () => {
  const popular = makePost({
    id: 900,
    caption: 'entirely unrelated words',
    likes_count: 5_000_000,
    views_count: 50_000_000,
    ranking_stats: { impressions: 100000, positive: 60000, negative: 0, updated_at: NOW },
  });
  const textual = makePost({ id: 901, caption: 'chai masala recipe' });
  const { items } = rankPosts({ posts: [popular, textual], query: 'chai', now: NOW, limit: 10 });
  const ids = items.map((it) => it.post.id);
  assert.ok(ids.includes(901));
  assert.ok(!ids.includes(900), 'popular but irrelevant post must be excluded from search');
});

test('paid boost fields never enter the organic score', () => {
  const a = makePost({ id: 910, caption: 'alpha content', created_at: iso(HOUR) });
  const b = makePost({ id: 911, caption: 'beta content', created_at: iso(HOUR), boost_id: 42, boosted: true });
  const { items } = rankPosts({ posts: [a, b], query: '', now: NOW, limit: 10 });
  const scoreA = items.find((it) => it.post.id === 910).score;
  const scoreB = items.find((it) => it.post.id === 911).score;
  assert.equal(scoreA, scoreB);
});

test('deterministic ties break by id and repeat runs match', () => {
  const posts = [makePost({ id: 920, created_at: iso(HOUR) }), makePost({ id: 921, created_at: iso(HOUR) }), makePost({ id: 922, created_at: iso(HOUR) })];
  const first = rankPosts({ posts, query: '', now: NOW, limit: 10 }).items.map((it) => it.post.id);
  const second = rankPosts({ posts, query: '', now: NOW, limit: 10 }).items.map((it) => it.post.id);
  assert.deepEqual(first, second);
  assert.deepEqual(first, [922, 921, 920]);
});

test('near-duplicate content is collapsed', () => {
  const a = makePost({ id: 930, caption: 'identical words', media_url: 'm/dup.jpg', author_id: 'x1' });
  const b = makePost({ id: 931, caption: 'identical words', media_url: 'm/dup.jpg', author_id: 'x2' });
  const { items } = rankPosts({ posts: [a, b], query: '', now: NOW, limit: 10 });
  assert.equal(items.length, 1);
});

test('malformed inputs never throw', () => {
  const { items, meta } = rankPosts({
    posts: [null, {}, 'x', { id: 'bad' }, { id: 1 }],
    query: 123,
    preferences: null,
    userFeatures: 'nope',
    followIds: null,
    index: undefined,
    arm: 'does-not-exist',
    limit: 'nonsense',
  });
  assert.ok(Array.isArray(items));
  assert.ok(meta && typeof meta === 'object');
  assert.ok(items.length <= LIMITS.slate);

  assert.doesNotThrow(() => rankPosts());
  assert.doesNotThrow(() => rankPosts({ posts: [{ id: 999, author_id: 'u', created_at: iso(HOUR) }], query: 'chai' }));
});

test('no embeddings degrades gracefully and reports it', () => {
  const posts = [makePost({ id: 940, caption: 'chai' }), makePost({ id: 941, caption: 'coffee' })];
  const { items, meta } = rankPosts({ posts, query: 'chai', now: NOW, queryVector: null, embeddingModel: null });
  assert.equal(meta.semanticUsed, false);
  assert.ok(items.every((it) => it.features.semantic === 0));
});

test('seen penalty applies to the feed only, never to search', () => {
  const posts = [makePost({ id: 950, caption: 'alpha', created_at: iso(HOUR) }), makePost({ id: 951, caption: 'beta', created_at: iso(HOUR) })];
  const state = { ...emptyFeatures(NOW), events: 1, seen: [950] };

  const feed = rankPosts({ posts, query: '', userFeatures: state, now: NOW, limit: 10 });
  const seenItem = feed.items.find((it) => it.post.id === 950);
  const otherItem = feed.items.find((it) => it.post.id === 951);
  assert.equal(seenItem.features.seen, true);
  assert.equal(otherItem.features.seen, false);
  assert.ok(otherItem.score > seenItem.score, 'seen feed item should be demoted');

  const search = rankPosts({ posts, query: 'alpha', userFeatures: state, now: NOW, limit: 10 });
  const searchItem = search.items.find((it) => it.post.id === 950);
  assert.equal(searchItem.features.seen, false);
});
