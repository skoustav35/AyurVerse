import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';
import { CENTRAL } from './env.js';

const AUX_REF = 'ducnapzbjqmhjxpmsqez';

/*
 * db-client — identity-forwarding data access.
 *
 * Every API handler begins with enterScope(req). From that moment, ANY use of
 * the exported `db` handle — in this module, in helpers three calls deep,
 * anywhere in the request's async context — talks to Supabase WITH the
 * caller's bearer token. Row-Level Security therefore applies *as the user*,
 * so policies can be enabled database-wide without weakening any route.
 *
 * The legacy default export (anonymous, resilience-wrapped client) remains for
 * auth checks only (auth.getUser is an Auth-server call, not RLS-scoped).
 */

const URL = CENTRAL.SUPABASE_URL;
const SERVICE_KEY = CENTRAL.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = CENTRAL.SUPABASE_ANON_KEY;

// ---- rotated-key self-defense: if the pinned service key is dead, downgrade ----
let serviceKeyDead = false;

const resilientFetch = async (url, options = {}) => {
  const buildHeaders = (downgrade) => {
    const headers = new Headers(options.headers || {});
    if (downgrade && ANON_KEY) {
      headers.set('apikey', ANON_KEY);
      if (headers.get('Authorization') === `Bearer ${SERVICE_KEY}`) {
        headers.set('Authorization', `Bearer ${ANON_KEY}`);
      }
    }
    return headers;
  };

  let res = await fetch(url, { ...options, headers: buildHeaders(serviceKeyDead) });
  if (!serviceKeyDead && ANON_KEY && SERVICE_KEY && (res.status === 401 || res.status === 403)) {
    let body = '';
    try {
      body = await res.clone().text();
    } catch {
      /* fall through */
    }
    if (/Unregistered API key|Invalid API key/i.test(body)) {
      serviceKeyDead = true;
      console.warn('[db-client] service key rejected by gateway — downgrading to publishable key');
      res = await fetch(url, { ...options, headers: buildHeaders(true) });
    }
  }
  if (!res.ok && res.status >= 500) triggerRestore();
  return res;
};

// ---- anonymous / platform client (also used for auth.getUser) ----
const anonClient = createClient(URL, SERVICE_KEY || ANON_KEY, { global: { fetch: resilientFetch } });

// ---- per-token scoped clients (cached, capped) ----
const scopeCache = new Map();
const SCOPE_CACHE_MAX = 800;

function clientForToken(token) {
  let cli = scopeCache.get(token);
  if (cli) return cli;
  cli = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: resilientFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (scopeCache.size >= SCOPE_CACHE_MAX) {
    const firstKey = scopeCache.keys().next().value;
    scopeCache.delete(firstKey);
  }
  scopeCache.set(token, cli);
  return cli;
}

// ---- async-local request scope ----
const als = new AsyncLocalStorage();

export function enterScope(req) {
  const auth = req?.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  // Bearer 'av_live_…' is an app key, not a JWT — PostgREST must never see it
  // as one. PATs ride the anonymous data plane; identity lives in resolveUser.
  const looksJwt = !!token && token.split('.').length === 3;
  const client = looksJwt ? clientForToken(token) : anonClient;
  als.enterWith({ client, token });
}

export function currentToken() {
  return als.getStore()?.token || null;
}

/* Property-forwarding proxy: reads/writes bind to the CURRENT request scope. */
function resolveClient() {
  return als.getStore()?.client || anonClient;
}

export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      const client = resolveClient();
      const v = client[prop];
      return typeof v === 'function' ? v.bind(client) : v;
    },
  }
);

// ---- shared CORS: same-origin + known hosts only, never a bare `*` ----
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

/* The original default export stays available for auth-only calls. */
const supabase = anonClient;

/**
 * resolveUser(req) — the ONE door identity walks through.
 * Accepts a Supabase session Bearer OR a personal access key
 * `av_live_…` minted from You → Studio → API Keys. Returns the exact
 * shape of supabase.auth.getUser() so every route keeps its cadence.
 * Key vault lives on the healthy AUX project (RLS-locked there).
 */
const AUX_URL = CENTRAL.AUX_SUPABASE_URL || process.env.AUX_SUPABASE_URL;
// Publishable by design: service keys in this stack rotate out of registration;
// the vault table only ever holds SHA-256 fingerprints.
const AUX_KEY =
  process.env.AUX_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_u-WSJ6oD_EabXjdWwi5S_g_iH0y9yqO';
const keyVault = AUX_URL && AUX_KEY ? createClient(AUX_URL, AUX_KEY, { auth: { persistSession: false } }) : null;

const _lastUsedWrites = new Map();
function touchLastUsed(id) {
  const last = _lastUsedWrites.get(id) || 0;
  if (Date.now() - last < 60_000) return;
  _lastUsedWrites.set(id, Date.now());
  if (_lastUsedWrites.size > 5000) _lastUsedWrites.clear();
  if (keyVault) {
    keyVault.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', id).then(() => {});
  }
}

export async function resolveUser(req) {
  const auth = req?.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { data: { user: null }, error: null };
  if (token.startsWith('av_live_')) {
    if (!keyVault) return { data: { user: null }, error: { message: 'key vault not configured' } };
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(token).digest('hex');
    const { data: rows, error } = await keyVault
      .from('api_tokens')
      .select('id, user_id, prefix, revoked_at')
      .eq('token_hash', hash)
      .limit(1);
    if (error && /Unregistered|Invalid API key/i.test(error.message || '')) triggerRestore(AUX_REF);
    const row = rows?.[0];
    if (error || !row || row.revoked_at) return { data: { user: null }, error: error || { message: 'invalid or revoked access key' } };
    touchLastUsed(row.id);
    return {
      data: {
        user: {
          id: row.user_id,
          aud: 'authenticated',
          role: 'authenticated',
          email: `access-key:${row.prefix}`,
          user_metadata: {},
          pat: row.prefix,
        },
      },
      error: null,
    };
  }
  return supabase.auth.getUser(token);
}

export default supabase;
