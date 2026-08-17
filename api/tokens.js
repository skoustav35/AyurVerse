import supabase, { enterScope, applyCors, resolveUser } from './db-client.js';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CENTRAL } from './env.js';

/*
 * Access-key manager. Mint / list / revoke the `av_live_...` keys that let a
 * weaver's own code (bots, scripts, sibling apps) act fully as them via
 * `${origin}/api/*`. The full key is revealed EXACTLY once at mint; only its
 * SHA-256 hash rests in the vault. The vault lives on the healthy AUX project
 * (RLS-locked); only this server's env key may touch it.
 */

const VAULT_URL = process.env.AUX_SUPABASE_URL || CENTRAL.AUX_SUPABASE_URL;
// only publishable keys are allowed to age in this stack — the route itself
// verifies the caller's session before any vault read/write
const VAULT_KEY =
  process.env.AUX_SUPABASE_ANON_KEY ||
  'sb_publishable_u-WSJ6oD_EabXjdWwi5S_g_iH0y9yqO';
const vault = VAULT_URL && VAULT_KEY ? createClient(VAULT_URL, VAULT_KEY, { auth: { persistSession: false } }) : null;

function vaultReady(res) {
  if (vault) return true;
  res.status(503).json({ error: 'The key vault is not configured on this deployment.' });
  return false;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { data: { user }, error: authErr } = await resolveUser(req);
  if (authErr || !user) return res.status(401).json({ error: 'Sign in required' });
  // management of keys itself needs the real session — a key may not mint keys
  if (user.pat) return res.status(403).json({ error: 'Access keys cannot manage access keys' });
  if (!vaultReady(res)) return;

  try {
    if (req.method === 'GET') {
      const { data, error } = await vault
        .from('api_tokens')
        .select('id, name, prefix, last_used_at, created_at, revoked_at, scopes')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.status(200).json({ keys: data || [] });
    }

    if (req.method === 'POST') {
      const name = String(req.body?.name || 'Untitled key').trim().slice(0, 60) || 'Untitled key';
      const open = 'av_live_' + randomBytes(36).toString('base64url');
      const hash = createHash('sha256').update(open).digest('hex');
      const prefix = open.slice(0, 18); // "av_live_xxxxxx" — shown in the list
      const { data, error } = await vault
        .from('api_tokens')
        .insert({ user_id: user.id, name, prefix, token_hash: hash, scopes: ['*'] })
        .select('id, name, prefix, created_at')
        .single();
      if (error) throw error;
      return res.status(201).json({ key: data, token: open });
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      const id = parseInt(req.body?.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: row } = await vault.from('api_tokens').select('user_id').eq('id', id).maybeSingle();
      if (!row || row.user_id !== user.id) return res.status(404).json({ error: 'No such key' });
      const { error } = await vault.from('api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('tokens error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
