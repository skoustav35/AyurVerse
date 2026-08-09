import supabase from './db-client.js';

/*
 * The house scribe — resilient OpenCode Zen client.
 * Cascade: /chat/completions (OpenAI) → /responses (OpenAI Responses) → /messages (Anthropic),
 * each with Authorization: Bearer then x-api-key, each with both model id spellings.
 * If the whole gateway is asleep, fall back to an honest local polish (flagged).
 */

const BASE = 'https://opencode.ai/zen/v1';
const MODELS = ['big-pickle', 'opencode/big-pickle'];
const HEADERS = ['Authorization', 'x-api-key'];

const PROMPTS = {
  caption:
    "You are the house scribe of AyurVerse, an ayurvedic-majestic social atelier. Polish the user's caption. Rules: keep every fact, name, place, hashtag and any Bengali line exactly; elevate rhythm and imagery into a warm, regal, slightly poetic voice; output at most 2 short sentences (plus existing hashtags); never add emojis unless present; return ONLY the polished caption, no quotes, no commentary.",
  summary:
    "You are the house scribe of AyurVerse. Rewrite the user's summary into ONE luminous line (max 180 characters) that carries the whole scroll in a single breath. Keep named entities and numbers exact. Warm, precise, majestic-but-tight. Return ONLY the summary line.",
  manuscript:
    'You are the manuscript illuminator of AyurVerse. Restructure the user\'s markdown draft with majestic formatting while preserving ALL content: (1) craft section headers with vivid short names using ##, (2) promote exactly one profound line into a blockquote "sutra" callout with >, (3) place an --- rule between major movements, (4) convert scattered prose into tight bullet lists where it reads cleaner, (5) preserve ALL code fences and ALL math ($...$, $$...$$) character-for-character, untouched, (6) keep every link, image, table and name, (7) never invent facts. Return ONLY the reformatted markdown.',
};

const LIMITS = { caption: 240, summary: 140, manuscript: 3400 };

function extractAnthropic(data) {
  const blocks = data?.content;
  if (!Array.isArray(blocks)) return null;
  const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('');
  return text || null;
}

function extractResponses(data) {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const parts = item?.content;
      if (Array.isArray(parts)) {
        for (const c of parts) {
          if (typeof c?.text === 'string' && c.text) return c.text;
        }
      }
    }
  }
  return null;
}

async function attempt({ path, key, authHeader, model, system, user, maxTokens, form }) {
  const headers = { 'Content-Type': 'application/json' };
  headers[authHeader] = authHeader === 'Authorization' ? `Bearer ${key}` : key;

  let body;
  if (form === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
  } else if (form === 'responses') {
    body = { model, instructions: system, input: user, max_output_tokens: maxTokens };
  } else {
    body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.75, max_tokens: maxTokens };
  }

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'follow',
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${txt ? ` · ${txt.slice(0, 140)}` : ''}`);
  }
  const data = await res.json();
  const text =
    form === 'anthropic'
      ? extractAnthropic(data)
      : form === 'responses'
        ? extractResponses(data)
        : data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') throw new Error('empty page returned');
  return text;
}

/* --- honest offline polish so the quill never dead-ends --- */
function localScribe(mode, text, title) {
  const tidy = text.replace(/\s+/g, ' ').trim();
  if (mode === 'caption') {
    const tags = (tidy.match(/#[\p{L}\p{N}_]+/gu) || []).slice(-6);
    const noTags = tidy.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s{2,}/g, ' ').trim();
    const cap = noTags.charAt(0).toUpperCase() + noTags.slice(1);
    const withPeriod = /[.!?।]$/.test(cap) ? cap : `${cap}.`;
    const poetic = withPeriod.replace(/\.$/, ' — held gently in the light.');
    return `${poetic} ${tags.join(' ')}`.trim().slice(0, 400);
  }
  if (mode === 'summary') {
    const first = tidy.split(/(?<=[.!?।])\s/)[0] || tidy;
    return (first.length > 180 ? `${first.slice(0, 177)}…` : first).trim();
  }
  // manuscript: structure without invention
  let out = text.trim();
  if (!/^#{1,3}\s/m.test(out)) out = `## ${(title || 'The Scroll').replace(/[#*_\n]/g, ' ').slice(0, 70)}\n\n${out}`;
  out = out.replace(/\n(?=## )/g, '\n\n---\n\n');
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to summon the scribe' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    const key = process.env.OPENCODE_API_KEY;
    if (!key) return res.status(503).json({ error: 'The scribe is not configured — add OPENCODE_API_KEY in Secrets' });

    const mode = ['caption', 'summary', 'manuscript'].includes(req.body?.mode) ? req.body.mode : null;
    if (!mode) return res.status(400).json({ error: 'mode must be caption, summary or manuscript' });
    const text = String(req.body?.text || '').slice(0, 12000).trim();
    if (!text) return res.status(400).json({ error: 'Give the scribe a seed line — it polishes, it does not invent' });

    const title = req.body?.title ? String(req.body.title).slice(0, 200) : undefined;
    const userPrompt =
      mode === 'manuscript'
        ? `Manuscript title: ${title || '(untitled)'}\n\nDraft to illuminate:\n${text}`
        : mode === 'caption'
          ? `Caption draft:\n${text}`
          : `Article title: ${title || '(untitled)'}\n\nCurrent summary:\n${text}`;

    const attempts = [];
    for (const model of MODELS) {
      for (const header of HEADERS) {
        attempts.push({ path: '/chat/completions', key, authHeader: header, model, form: 'openai' });
      }
    }
    attempts.push({ path: '/responses', key, authHeader: 'Authorization', model: MODELS[0], form: 'responses' });
    attempts.push({ path: '/messages', key, authHeader: 'x-api-key', model: MODELS[0], form: 'anthropic' });

    const errors = [];
    for (const a of attempts) {
      try {
        const out = await attempt({ ...a, system: PROMPTS[mode], user: userPrompt, maxTokens: LIMITS[mode] });
        let clean = out.trim();
        if (mode === 'manuscript') clean = clean.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
        else clean = clean.replace(/^["'“”]+|["'“”]+$/g, '').trim();
        return res.status(200).json({ text: clean, model: a.model, via: `${a.form}${a.authHeader === 'x-api-key' ? ':x-api-key' : ''}` });
      } catch (err) {
        const cause = err.cause?.code || err.cause?.message;
        errors.push(`${a.form}@${a.authHeader}:${a.model} → ${err.name === 'TimeoutError' ? 'timeout' : err.message}${cause ? ` (${cause})` : ''}`);
      }
    }

    // gateway fully asleep → honest offline polish, flagged
    console.warn('[scribe] gateway unreachable:', errors.join(' | '));
    return res.status(200).json({
      text: localScribe(mode, text, title),
      model: 'house-scribe-offline',
      fallback: true,
      gateway_errors: errors.slice(0, 3),
    });
  } catch (err) {
    console.error('ai error:', err);
    res.status(502).json({ error: err.message });
  }
}
