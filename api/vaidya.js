import supabase, { db, enterScope, applyCors, resolveUser } from './db-client.js';
import { generateVaidyaWisdom } from './ayurvedic-sage.js';

/*
 * Vaidya chat studio — authenticated passthrough to the caretaker's AVS
 * gateway with a curated model menu and per-model reasoning controls.
 *
 * Model capability contract (measured against the gateway, don't guess):
 *   full    — honors reasoning_effort incl. "max", returns reasoning_content
 *   omit    — REJECTS reasoning_effort with HTTP 400 → never send the param
 *   ignored — accepts and silently ignores reasoning_effort, no chain back
 */

const GATEWAY_BASE = process.env.GATEWAY_BASE_URL || 'https://opencode.ai/zen/v1';
const GATEWAY_KEY =
  process.env.GATEWAY_API_KEY ||
  process.env.OPENCODE_API_KEY ||
  'sk-Fc4ac08nEJWm8yY51omw6K8uOGJdgcjhLq9ez2KSfsc4akhTu8jvsPSw1yeHNilk';

export const VAIDYA_MODELS = {
  'big-pickle': { reasoning: 'full' },
  'mimo-v2.5-free': { reasoning: 'ignored' },
  'gpt-5.4-nano': { reasoning: 'ignored' },
  'gpt-5-nano': { reasoning: 'ignored' },
  'claude-haiku-4-5': { reasoning: 'ignored' },
};

const EFFORTS = ['low', 'medium', 'high', 'max'];
const DEFAULT_MODEL = 'big-pickle';

const SYSTEM_PROMPT = `You are Vaidya, the house sage of AyurVerse — a calm, ayurvedic-majestic social atelier where people share reels, scrolls (long-form posts), circles and conversations.

Temperament: unhurried, warm, precise. You think like a physician-poet: observe carefully, then speak plainly.
Style rules:
- Answer with markdown when structure helps; short flowing prose when it doesn't.
- Never use emojis. Never announce your mode, chain, or that you are an AI persona beyond being Vaidya.
- When asked about the app: the Feed is the visual weave; the Forge is long-form scrolls; the Library is search; Threads are messages; Circles are communities; the Satchel holds saves; the Studio carries Analytics, Boost, Payouts and the Society observatory.
- If you genuinely don't know, say so gracefully and offer the nearest helpful thread.`;

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to sit with Vaidya' });
    const { data: { user }, error: authError } = await resolveUser(req);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    const model = String(req.body?.model || DEFAULT_MODEL);
    const spec = VAIDYA_MODELS[model];
    if (!spec) return res.status(400).json({ error: `Unknown model '${model}'` });

    const effort = EFFORTS.includes(req.body?.reasoning_effort) ? req.body.reasoning_effort : null;

    const raw = Array.isArray(req.body?.messages) ? req.body.messages.slice(-18) : [];
    const history = raw
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    if (!history.length || history[history.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'a user message is required' });
    }

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
    const body = {
      model,
      messages,
      temperature: 0.65,
      max_tokens: 3200,
    };
    // capability contract: full -> send effort, omit -> never send, ignored -> send (harmless)
    if (effort && spec.reasoning !== 'omit') body.reasoning_effort = effort;

    let upstream;
    try {
      upstream = await fetch(`${GATEWAY_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GATEWAY_KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } catch (err) {
      console.warn('[vaidya] Upstream error — using in-house Ayurvedic Sage');
      const lastUserMsg = history[history.length - 1]?.content || '';
      const reply = generateVaidyaWisdom(lastUserMsg, { author_name: user?.user_metadata?.full_name });
      return res.status(200).json({
        reply,
        model: 'ayurvedic-sage',
        reasoning: 'Synthesizing Panchamahabhutas and Tridoshic equilibrium from classical lore.',
      });
    }

    const txt = await upstream.text().catch(() => '');
    if (!upstream.ok) {
      console.warn(`[vaidya] Upstream returned HTTP ${upstream.status} — using in-house Ayurvedic Sage`);
      const lastUserMsg = history[history.length - 1]?.content || '';
      const reply = generateVaidyaWisdom(lastUserMsg, { author_name: user?.user_metadata?.full_name });
      return res.status(200).json({
        reply,
        model: 'ayurvedic-sage',
        reasoning: 'Synthesizing Panchamahabhutas and Tridoshic equilibrium from classical lore.',
      });
    }

    const data = JSON.parse(txt || '{}');
    const msg = data?.choices?.[0]?.message || {};
    const reply = typeof msg.content === 'string' ? msg.content.trim() : '';
    const reasoning = typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()
      ? msg.reasoning_content.trim()
      : null;

    if (!reply) {
      return res.status(200).json({
        reply: 'I thought long enough that the thought itself consumed the answer. Ask again, and I will be briefer.',
        reasoning,
        fallback: true,
      });
    }

    return res.status(200).json({
      reply,
      reasoning,
      model: data?.model || model,
      usage: data?.usage || null,
    });
  } catch (err) {
    console.error('vaidya error:', err);
    return res.status(500).json({ error: err.message || 'The sage stumbled' });
  }
}
