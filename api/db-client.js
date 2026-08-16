import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';
import { CENTRAL } from './env.js';

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
  const client = token ? clientForToken(token) : anonClient;
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
export default supabase;
