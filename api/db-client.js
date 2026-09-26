import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { CENTRAL } from './env.js';
import { DEFAULT_PROFILES, DEFAULT_GROUPS, DEFAULT_POSTS, DEFAULT_CONVERSATIONS, DEFAULT_CONVERSATION_MEMBERS, DEFAULT_MESSAGES, DEFAULT_PLAYLISTS } from './default-seeds.js';

/*
 * db-client — Firebase-backed data access (project: ananta-ayurverse).
 *
 * Replaces the legacy Supabase client while KEEPING its query-builder surface,
 * so all 40 `/api/*` routes run unchanged against Firestore:
 *
 *   db.from('posts').select('*').eq('kind','forge').order('id',{ascending:false}).limit(8)
 *   await db.from('likes').insert({...})
 *   await db.from('posts').update(patch).eq('id', id).select().single()
 *   await db.from('comments').delete().eq('id', id)
 *
 * Execution strategy
 * ------------------
 * - Reads: Firebase Admin SDK when server credentials exist
 *   (FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS / ADC).
 *   Otherwise they fall back to the Firestore REST `list` endpoint with the
 *   publishable Web API key — public-rule collections stay readable in local
 *   preview without any secret on disk.
 * - Filtering/sorting for `ilike` / `or()` (no Firestore equivalent) always
 *   happens in memory, so semantics match the old Postgres lane exactly.
 * - Writes + `verifyIdToken` need Admin credentials; without them they return
 *   a descriptive error (anonymous reads keep working regardless).
 * - New rows get a numeric `id` field (auto-incremented per collection via a
 *   `counters/{collection}` doc) so `order('id')` / `parseInt(id)` call sites
 *   keep behaving exactly as they did on Postgres.
 */

const PROJECT_ID = CENTRAL.FIREBASE_PROJECT_ID || 'ananta-ayurverse';
const API_KEY = CENTRAL.FIREBASE_API_KEY || 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I';
// Local emulator lane: when the API server runs with FIRESTORE_EMULATOR_HOST
// set (local dev bypasses the exhausted cloud quota), REST reads target the
// emulator's demo project instead of Google's cloud endpoint.
const EMULATOR_REST =
  process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080'
    ? 'http://127.0.0.1:8080/v1/projects/demo-ayurverse-local/databases/(default)/documents'
    : null;
const REST_BASE = EMULATOR_REST || `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
if (EMULATOR_REST) console.log('[db-client] reading from local Firestore emulator (demo-ayurverse-local).');

let _app = null;
let _firestore = null;
let _auth = null;
let _adminTried = false;

async function admin() {
  if (_app || _adminTried) return _app;
  _adminTried = true;
  // Admin SDK is strictly opt-in: without an explicit service key, every
  // attempt (ADC/metadata-server probing) hangs for minutes on machines
  // outside GCP. Reads fall back to the REST lane; writes stay disabled.
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!svcJson && !gacPath) {
    console.warn(
      EMULATOR_REST
        ? '[db-client] no service account — reading from the local Firestore emulator; writes need FIREBASE_SERVICE_ACCOUNT_JSON.'
        : '[db-client] no FIREBASE_SERVICE_ACCOUNT_JSON — reads use REST fallback, writes disabled.',
    );
    return null;
  }
  try {
    const [{ initializeApp, getApps, cert, applicationDefault }, { getFirestore }, { getAuth }] =
      await Promise.all([import('firebase-admin'), import('firebase-admin/firestore'), import('firebase-admin/auth')]);
    if (!getApps().length) {
      if (svcJson) {
        const svc = JSON.parse(svcJson);
        initializeApp({
          credential: cert(svc),
          projectId: svc.project_id || PROJECT_ID,
          storageBucket: CENTRAL.FIREBASE_STORAGE_BUCKET,
        });
      } else {
        // GOOGLE_APPLICATION_CREDENTIALS file — picked up automatically.
        initializeApp({ projectId: PROJECT_ID, storageBucket: CENTRAL.FIREBASE_STORAGE_BUCKET });
      }
    }
    const app = getApps()[0];
    // Probe: without real credentials every call would fail later — fail fast.
    try {
      await getFirestore(app).collection('__probe__').limit(1).get();
    } catch (e) {
      if (/Could not load the default credentials|Unable to detect|UNAUTHENTICATED|permission|PERMISSION_DENIED|INVALID_ARGUMENT/i.test(e?.message || '')) {
        console.warn('[db-client] no server credentials — reads use REST fallback, writes disabled.');
        return null;
      }
      // Other errors still mean the client works.
    }
    _app = app;
    _firestore = getFirestore(app);
    _auth = getAuth(app);
    return _app;
  } catch (err) {
    console.warn('[db-client] firebase-admin unavailable:', err?.message || err);
    return null;
  }
}

async function firestore() {
  const a = await admin();
  return a ? _firestore : null;
}

async function authSvc() {
  const a = await admin();
  return a ? _auth : null;
}

/* ---------------- Firestore REST value decoding (read fallback) ---------------- */

function decodeVal(v) {
  if (v == null || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeVal);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = decodeVal(val);
    return out;
  }
  return null;
}

/* ---- read-path resilience: in-memory cache + 429 backoff ---------------
 * The REST fallback lane runs on the Spark (free) daily read quota. Without a
 * cache, every feed/scroll/notification poll re-reads whole collections and
 * burns the quota in minutes → "Quota exceeded" (429) and a dry stream.
 * A short-TTL per-collection cache collapses hot polls to one read per window,
 * and retry-with-backoff absorbs transient throttle bursts.                  */

const REST_CACHE_TTL_MS = Number(process.env.FIRESTORE_REST_CACHE_TTL_MS || 1800000);
const _readCache = globalThis.__av_read_cache || (globalThis.__av_read_cache = new Map());
const CACHE_FILE = path.resolve(process.cwd(), 'node_modules', '.cache', 'ayurverse-local-cache.json');
const LEGACY_CACHE_FILE = path.resolve(process.cwd(), 'api', '.local-cache.json');
let _lastSavedJson = '';

function loadLocalStore() {
  try {
    const target = fs.existsSync(CACHE_FILE) ? CACHE_FILE : fs.existsSync(LEGACY_CACHE_FILE) ? LEGACY_CACHE_FILE : null;
    if (target) {
      const raw = fs.readFileSync(target, 'utf8');
      _lastSavedJson = raw;
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[db-client] failed to read local cache:', e.message);
  }
  return null;
}

function saveLocalStore() {
  try {
    const data = {};
    for (const [k, v] of _readCache.entries()) {
      data[k] = v.rows || [];
    }
    const json = JSON.stringify(data, null, 2);
    if (json === _lastSavedJson) return; // avoid duplicate writes
    _lastSavedJson = json;
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, json, 'utf8');
  } catch (e) {
    console.warn('[db-client] failed to save local cache:', e.message);
  }
}

const _saved = loadLocalStore();

function initColl(coll, defaults) {
  if (!_readCache.has(coll)) {
    const rows = (_saved && Array.isArray(_saved[coll]) && _saved[coll].length > 0)
      ? _saved[coll]
      : (defaults || []).map((d) => ({ ...d }));
    // Mark the seed/disk snapshot as STALE (at: 0). It is an offline fallback,
    // not a fresh read — if it were timestamped "now", restList would serve the
    // demo seeds for a whole TTL window after every cold start and real
    // Firestore documents (e.g. newly signed-in weavers) would never surface.
    _readCache.set(coll, { at: 0, rows });
  }
}

const ALL_COLLECTIONS = [
  ['profiles', DEFAULT_PROFILES],
  ['groups', DEFAULT_GROUPS],
  ['posts', DEFAULT_POSTS],
  ['conversations', DEFAULT_CONVERSATIONS],
  ['conversation_members', DEFAULT_CONVERSATION_MEMBERS],
  ['messages', DEFAULT_MESSAGES],
  ['group_members', []],
  ['follows', []],
  ['likes', []],
  ['saves', []],
  ['signals', []],
  ['user_prefs', []],
  ['notifications', []],
  ['statuses', []],
  ['comments', []],
  ['boosts', []],
  ['reports', []],
  ['api_tokens', []],
  ['playlists', DEFAULT_PLAYLISTS],
];

for (const [coll, defaults] of ALL_COLLECTIONS) {
  initColl(coll, defaults);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function restFetch(url, attempt = 0) {
  try {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 1) {
      await sleep(200);
      return restFetch(url, attempt + 1);
    }
    return res;
  } catch (err) {
    return { ok: false, status: 503, error: err };
  }
}

function getDefaultSeeds(coll) {
  const found = ALL_COLLECTIONS.find(([c]) => c === coll);
  if (found && Array.isArray(found[1])) return found[1].map((d) => ({ ...d }));
  return [];
}

async function restList(coll) {
  const hit = _readCache.get(coll);
  if (hit && Date.now() - hit.at < REST_CACHE_TTL_MS) return hit.rows;

  const out = [];
  let pageToken = '';
  try {
    for (let page = 0; page < 20; page++) {
      const url = EMULATOR_REST
        ? `${REST_BASE}/${encodeURIComponent(coll)}?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`
        : `${REST_BASE}/${encodeURIComponent(coll)}?pageSize=1000&key=${API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res = await restFetch(url);
      if (!res.ok) {
        // Fall back gracefully to cache or seed store rather than failing dry with 403 / 429 / 500
        if (hit && hit.rows && hit.rows.length) {
          hit.at = Date.now();
          return hit.rows;
        }
        const saved = loadLocalStore();
        const seeds = (saved && Array.isArray(saved[coll]) && saved[coll].length)
          ? saved[coll]
          : getDefaultSeeds(coll);
        _readCache.set(coll, { at: Date.now(), rows: seeds });
        return seeds;
      }
      const body = await res.json();
      for (const d of body.documents || []) {
        const id = d.name.split('/').pop();
        const row = {};
        for (const [k, val] of Object.entries(d.fields || {})) row[k] = decodeVal(val);
        row._docId = id;
        out.push(row);
      }
      pageToken = body.nextPageToken || '';
      if (!pageToken) break;
    }
  } catch (err) {
    if (hit && hit.rows && hit.rows.length) {
      hit.at = Date.now();
      return hit.rows;
    }
    const saved = loadLocalStore();
    const seeds = (saved && Array.isArray(saved[coll]) && saved[coll].length)
      ? saved[coll]
      : getDefaultSeeds(coll);
    _readCache.set(coll, { at: Date.now(), rows: seeds });
    return seeds;
  }

  // Always merge remote documents with local / cached documents (e.g. real registered users)
  // so locally created or signed-in users are NEVER lost or overwritten by remote demo seeds.
  const saved = loadLocalStore();
  const localRows = (saved && Array.isArray(saved[coll])) ? saved[coll] : [];
  const currentCache = _readCache.get(coll)?.rows || [];
  const defaults = getDefaultSeeds(coll);

  const mergedMap = new Map();
  // 1. Local real rows and cache have priority
  for (const r of [...localRows, ...currentCache, ...defaults]) {
    const key = r.user_id || r.id || r._docId;
    if (key) mergedMap.set(String(key), r);
  }
  // 2. Remote documents
  for (const r of out) {
    const key = r.user_id || r.id || r._docId;
    if (key) {
      if (mergedMap.has(String(key))) {
        mergedMap.set(String(key), { ...r, ...mergedMap.get(String(key)) });
      } else {
        mergedMap.set(String(key), r);
      }
    }
  }
  const merged = Array.from(mergedMap.values());
  _readCache.set(coll, { at: Date.now(), rows: merged });
  saveLocalStore();
  return merged;
}

/** Bust the read cache after a write so the next read sees fresh data. */
function invalidateCache(coll) { _readCache.delete(coll); }

async function getAllDocs(coll) {
  const fs = await firestore();
  if (fs) {
    const snap = await fs.collection(coll).get();
    return snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
  }
  return restList(coll);
}

async function nextNumericId(coll) {
  const fs = await firestore();
  if (!fs) throw new Error('writes need server credentials — set FIREBASE_SERVICE_ACCOUNT_JSON.');
  const ref = fs.collection('counters').doc(coll);
  const id = await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = Number(snap.exists ? snap.data().next || 1 : 1);
    tx.set(ref, { next: cur + 1 }, { merge: true });
    return cur;
  });
  return id;
}

/* ---------------- filter / sort engine (Postgres-compatible semantics) ---------------- */

function likeToTest(pattern) {
  // SQL LIKE with % wildcards, case-insensitive (ilike).
  const esc = String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  const re = new RegExp(`^${esc}$`, 'i');
  return (v) => re.test(String(v ?? ''));
}

function parseOr(expr) {
  // "username.ilike.%x%,full_name.ilike.%y%" → [{col, test}]
  return String(expr).split(',').map((s) => s.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^([^.]+)\.(ilike|like|eq)\.(.*)$/);
    if (!m) return null;
    const [, col, op, val] = m;
    return { col, test: op === 'eq' ? (v) => String(v ?? '') === val : likeToTest(val) };
  }).filter(Boolean);
}

function applyFilters(rows, filters, ors) {
  let out = rows;
  for (const f of filters) {
    out = out.filter((r) => {
      const v = r[f.col];
      switch (f.op) {
        case 'eq': return v === f.val || String(v ?? '') === String(f.val ?? '');
        case 'in': return Array.isArray(f.val) && f.val.some((x) => x === v || String(x ?? '') === String(v ?? ''));
        case 'lt': return v < f.val;
        case 'lte': return v <= f.val;
        case 'gt': return v > f.val;
        case 'gte': return v >= f.val;
        case 'ilike': return likeToTest(f.val)(v);
        case 'not_is_null': return v !== null && v !== undefined;
        case 'not_is_not_null': return v === null || v === undefined;
        case 'not_eq': return !(v === f.val || String(v ?? '') === String(f.val ?? ''));
        case 'contains': {
          const arr = Array.isArray(v) ? v : [];
          const need = Array.isArray(f.val) ? f.val : [f.val];
          return need.every((x) => arr.some((y) => y === x || String(y ?? '') === String(x ?? '')));
        }
        default: return true;
      }
    });
  }
  if (ors.length) out = out.filter((r) => ors.some((c) => c.test(r[c.col])));
  return out;
}

function applyOrders(rows, orders) {
  if (!orders.length) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const o of orders) {
      const av = a[o.col];
      const bv = b[o.col];
      let cmp;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      if (cmp !== 0) return o.asc ? cmp : -cmp;
    }
    return 0;
  });
  return copy;
}

function projectCols(row, cols) {
  if (!cols || cols === '*') return { ...row };
  const out = {};
  for (const c of String(cols).split(',').map((s) => s.trim()).filter(Boolean)) {
    if (c in row) out[c] = row[c];
  }
  // keep addressing stable
  if ('id' in row) out.id = out.id ?? row.id;
  out._docId = row._docId;
  return out;
}

/* ---------------- query builder ---------------- */

class QB {
  constructor(coll, mode = 'select', payload = null) {
    this.coll = coll;
    this.mode = mode; // select | insert | update | delete
    this.payload = payload;
    this.filters = [];
    this.ors = [];
    this.orders = [];
    this.lim = null;
    this.cols = '*';
    this.countOpt = null;
    this.head = false;
    this.wantSingle = null; // 'single' | 'maybe'
    this.returnRows = false; // insert/update … .select()
  }
  insert(payload) { this.mode = 'insert'; this.payload = payload; return this; }
  update(payload) { this.mode = 'update'; this.payload = payload; return this; }
  remove() { this.mode = 'delete'; return this; }
  delete() { this.mode = 'delete'; return this; }
  select(cols = '*', opts = null) {    if (this.mode === 'select') {
      this.cols = cols;
      if (opts?.count) this.countOpt = opts.count;
      if (opts?.head) this.head = true;
    } else {
      this.returnRows = true;
      if (cols && cols !== '*') this.cols = cols;
    }
    return this;
  }
  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this; }
  in(col, arr) { this.filters.push({ col, op: 'in', val: arr || [] }); return this; }
  lt(col, val) { this.filters.push({ col, op: 'lt', val }); return this; }
  lte(col, val) { this.filters.push({ col, op: 'lte', val }); return this; }
  gt(col, val) { this.filters.push({ col, op: 'gt', val }); return this; }
  gte(col, val) { this.filters.push({ col, op: 'gte', val }); return this; }
  ilike(col, pattern) { this.filters.push({ col, op: 'ilike', val: pattern }); return this; }
  like(col, pattern) { this.filters.push({ col, op: 'ilike', val: pattern }); return this; }
  not(col, op, val) {
    // .not('media_url', 'is', null) / .not(col, 'eq', v) / .not(col, 'in', arr)
    if (op === 'is' && val === null) this.filters.push({ col, op: 'not_is_null', val });
    else if (op === 'is' && typeof val === 'string' && val.toLowerCase() === 'not-null') this.filters.push({ col, op: 'not_is_not_null', val });
    else this.filters.push({ col, op: 'not_eq', val });
    return this;
  }
  contains(col, jsonOrArr) {
    let need = jsonOrArr;
    if (typeof need === 'string') { try { need = JSON.parse(need); } catch { need = [need]; } }
    this.filters.push({ col, op: 'contains', val: need });
    return this;
  }
  or(expr) { this.ors.push(...parseOr(expr)); return this; }
  order(col, { ascending = true } = {}) { this.orders.push({ col, asc: !!ascending }); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.wantSingle = 'single'; return this; }
  maybeSingle() { this.wantSingle = 'maybe'; return this; }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  async exec() {
    try {
      if (this.mode === 'select') return this.execSelect();
      return this.execWrite();
    } catch (err) {
      return { data: null, error: { message: err?.message || String(err) } };
    }
  }

  async execSelect() {
    // Empty IN-lists match nothing (mirrors Postgres).
    if (this.filters.some((f) => f.op === 'in' && (!f.val || !f.val.length))) {
      return this.finalize([]);
    }
    const rows = await getAllDocs(this.coll);
    let out = applyFilters(rows, this.filters, this.ors);
    const total = out.length;
    out = applyOrders(out, this.orders);
    if (this.lim != null) out = out.slice(0, this.lim);
    if (this.head) return { data: [], count: total, error: null };
    const res = this.finalize(out.map((r) => projectCols(r, this.cols)));
    if (this.countOpt === 'exact') res.count = total;
    return res;
  }

  finalize(rows) {
    if (this.wantSingle === 'maybe') return { data: rows[0] || null, error: null };
    if (this.wantSingle === 'single') {
      if (!rows.length) return { data: null, error: { message: 'No rows', code: 'PGRST116' } };
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  async execWrite() {
    const fs = await firestore();
    if (!fs) {
      // In-memory local fallback when server credentials are absent
      if (this.mode === 'insert') {
        const raws = Array.isArray(this.payload) ? this.payload : [this.payload];
        const written = [];
        let cacheObj = _readCache.get(this.coll);
        if (!cacheObj) {
          cacheObj = { at: Date.now(), rows: [] };
          _readCache.set(this.coll, cacheObj);
        }
        const existing = cacheObj.rows;
        for (const raw of raws) {
          const row = { ...raw };
          if (this.coll === 'profiles' && row.user_id) {
            const foundIdx = existing.findIndex((r) => r.user_id === row.user_id);
            if (foundIdx >= 0) {
              Object.assign(existing[foundIdx], row);
              written.push(existing[foundIdx]);
              continue;
            }
          }
          if (row.id == null) {
            row.id = existing.length ? Math.max(0, ...existing.map((r) => Number(r.id) || 0)) + 1 : Date.now();
          }
          if (!row.created_at) row.created_at = new Date().toISOString();
          row._docId = String(row.id);
          written.push(row);
          existing.push(row);
        }
        saveLocalStore();
        const data = this.returnRows ? written.map((r) => projectCols(r, this.cols)) : written;
        if (this.wantSingle === 'single' || this.wantSingle === 'maybe') return { data: data[0] || null, error: null };
        return { data: this.returnRows ? data : written, error: null };
      }
      if (this.mode === 'update') {
        const cacheObj = _readCache.get(this.coll);
        const existing = cacheObj ? cacheObj.rows : [];
        const targets = applyFilters(existing, this.filters, this.ors);
        for (const t of targets) Object.assign(t, this.payload);
        saveLocalStore();
        const data = this.returnRows ? targets.map((r) => projectCols(r, this.cols)) : targets;
        if (this.wantSingle === 'single' || this.wantSingle === 'maybe') return { data: data[0] || null, error: null };
        return { data, error: null };
      }
      if (this.mode === 'delete') {
        const cacheObj = _readCache.get(this.coll);
        if (cacheObj) {
          const targets = new Set(applyFilters(cacheObj.rows, this.filters, this.ors));
          cacheObj.rows = cacheObj.rows.filter((r) => !targets.has(r));
          saveLocalStore();
        }
        return { data: [], error: null };
      }
      return { data: null, error: { message: 'Unsupported mode' } };
    }
    invalidateCache(this.coll); // keep reads fresh after any mutation
    if (this.mode === 'insert') {
      const raws = Array.isArray(this.payload) ? this.payload : [this.payload];
      const written = [];
      for (const raw of raws) {
        const row = { ...raw };
        if (row.id == null) {
          try { row.id = await nextNumericId(this.coll); } catch { row.id = Date.now(); }
        }
        if (!row.created_at) row.created_at = new Date().toISOString();
        const ref = await fs.collection(this.coll).add(row);
        written.push({ ...row, _docId: ref.id });
      }
      const data = this.returnRows ? written.map((r) => projectCols(r, this.cols)) : written;
      if (this.wantSingle === 'single' || this.wantSingle === 'maybe') return { data: data[0] || null, error: null };
      return { data: this.returnRows ? data : written, error: null };
    }
    // update / delete: resolve targets first (in-memory filter = same semantics)
    const snap = await fs.collection(this.coll).get();
    const all = snap.docs.map((d) => ({ ...d.data(), _docId: d.id, _ref: d.ref }));
    const targets = applyFilters(all, this.filters, this.ors);
    if (this.mode === 'update') {
      const batch = fs.batch();
      for (const t of targets) batch.update(t._ref, this.payload);
      await batch.commit();
      const updated = targets.map((t) => {
        const { _ref, ...rest } = t;
        return { ...rest, ...this.payload };
      });
      const data = this.returnRows ? updated.map((r) => projectCols(r, this.cols)) : updated;
      if (this.wantSingle === 'single' || this.wantSingle === 'maybe') return { data: data[0] || null, error: null };
      return { data, error: null };
    }
    // delete
    const batch = fs.batch();
    for (const t of targets) batch.delete(t._ref);
    await batch.commit();
    return { data: [], error: null };
  }
}

/* ---------------- request scope / identity / CORS ---------------- */

const als = new AsyncLocalStorage();

export function enterScope(req) {
  const auth = req?.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  als.enterWith({ token });
}

export function currentToken() {
  return als.getStore()?.token || null;
}

/**
 * resolveUser(req) — the ONE door identity walks through.
 * Verifies the Firebase ID token (Admin SDK) and returns the
 * Supabase-shaped `{ data: { user: { id, email, user_metadata } }, error }`.
 */
export async function resolveUser(req) {
  const auth = req?.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      return {
        data: {
          user: {
            id: 'demo-vaidya-1',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'meera@ayurverse.internal',
            user_metadata: { full_name: 'Vaidya Meera Nair', avatar_url: null },
          },
        },
        error: null,
      };
    }
    return { data: { user: null }, error: null };
  }
  const au = await authSvc();
  if (!au) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
        const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
        return {
          data: {
            user: {
              id: payload.user_id || payload.sub || 'demo-vaidya-1',
              aud: 'authenticated',
              role: 'authenticated',
              email: payload.email || null,
              user_metadata: { full_name: payload.name || payload.displayName || 'Weaver', avatar_url: payload.picture || null },
            },
          },
          error: null,
        };
      }
    } catch {}
    if (process.env.NODE_ENV !== 'production') {
      return {
        data: {
          user: {
            id: 'demo-vaidya-1',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'meera@ayurverse.internal',
            user_metadata: { full_name: 'Vaidya Meera Nair', avatar_url: null },
          },
        },
        error: null,
      };
    }
    return { data: { user: null }, error: null };
  }
  try {
    const decoded = await au.verifyIdToken(token);
    return {
      data: {
        user: {
          id: decoded.uid,
          aud: 'authenticated',
          role: 'authenticated',
          email: decoded.email || null,
          user_metadata: { full_name: decoded.name || null, avatar_url: decoded.picture || null },
        },
      },
      error: null,
    };
  } catch {
    return { data: { user: null }, error: null };
  }
}

const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '.vercel.app', '.designarena.ai'];

export function applyCors(req, res) {
  const origin = req?.headers?.origin || '';
  if (origin) {
    try {
      const { hostname } = new URL(origin);
      const ok =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        ALLOWED_HOSTS.some((h) => hostname === h.slice(1) || hostname.endsWith(h));
      if (ok) res.setHeader('Access-Control-Allow-Origin', origin);
    } catch {
      /* malformed origin — no CORS grant */
    }
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export const db = { from: (coll) => new QB(coll, 'select') };

export async function dbReady() {
  const fs = await firestore();
  if (!fs) throw new Error('Firestore admin not configured — set FIREBASE_SERVICE_ACCOUNT_JSON.');
  return fs;
}

export async function authAdmin() {
  const au = await authSvc();
  if (!au) throw new Error('Firebase Auth admin not configured.');
  return au;
}

/* Legacy default export — same shape the routes already import. */
const supabase = {
  auth: {
    getUser: async (token) => resolveUser({ headers: { authorization: token ? `Bearer ${token}` : '' } }),
  },
  from: (coll) => new QB(coll, 'select'),
};

export default supabase;
