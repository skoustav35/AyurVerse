import supabase, { db, enterScope, applyCors } from './db-client.js';
import { chat, hasKey } from './opencode.js';

/*
 * The house scribe — caption / summary / manuscript polishing.
 * Runs big-pickle through the shared OpenCode client (api/opencode.js),
 * reading the same OPENCODE_API_KEY as the Vaidya agent. If the whole gateway
 * is asleep, it falls back to an honest local polish (flagged).
 */

const PROMPTS = {
  caption:
    "You are the house scribe of AyurVerse, an ayurvedic-majestic social atelier. Polish the user's caption. Rules: keep every fact, name, place, hashtag and any Bengali line exactly; elevate rhythm and imagery into a warm, regal, slightly poetic voice; output at most 2 short sentences (plus existing hashtags); never add emojis unless present; return ONLY the polished caption, no quotes, no commentary.",
  summary:
    "You are the house scribe of AyurVerse. Rewrite the user's summary into ONE luminous line (max 180 characters) that carries the whole scroll in a single breath. Keep named entities and numbers exact. Warm, precise, majestic-but-tight. Return ONLY the summary line.",
  manuscript:
    'You are the manuscript illuminator of AyurVerse. Restructure the user\'s markdown draft with majestic formatting while preserving ALL content: (1) craft section headers with vivid short names using ##, (2) promote exactly one profound line into a blockquote "sutra" callout with >, (3) place an --- rule between major movements, (4) convert scattered prose into tight bullet lists where it reads cleaner, (5) preserve ALL code fences and ALL math ($...$, $$...$$) character-for-character, untouched, (6) keep every link, image, table and name, (7) never invent facts. Return ONLY the reformatted markdown.',
};

// Budgets include reasoning-token headroom (big-pickle "thinks" before it
// writes). The prompts still constrain the visible output length.
const LIMITS = { caption: 1600, summary: 1200, manuscript: 8000 };

/* --- honest offline polish so the quill never dead-ends --- */
function localScribe(mode, text, title) {
  const tidy = text.replace(/\s+/g, ' ').trim();
  if (mode === 'caption') {
    const tags = (tidy.match(/#[\p{L}\p{N}_]+/gu) || []).slice(-6);
    const noTags = tidy.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s{2,}/g, ' ').trim();
    const cap = noTags.charAt(0).toUpperCase() + noTags.slice(1);
    const withPeriod = /[.!?\u0964]$/.test(cap) ? cap : `${cap}.`;
    const poetic = withPeriod.replace(/\.$/, ' \u2014 held gently in the light.');
    return `${poetic} ${tags.join(' ')}`.trim().slice(0, 400);
  }
  if (mode === 'summary') {
    const first = tidy.split(/(?<=[.!?\u0964])\s/)[0] || tidy;
    return (first.length > 180 ? `${first.slice(0, 177)}\u2026` : first).trim();
  }
  let out = text.trim();
  if (!/^#{1,3}\s/m.test(out)) out = `## ${(title || 'The Scroll').replace(/[#*_\n]/g, ' ').slice(0, 70)}\n\n${out}`;
  out = out.replace(/\n(?=## )/g, '\n\n---\n\n');
  return out;
}

export default async function handler(req, res) {
  enterScope(req);
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Sign in to summon the scribe' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    if (!hasKey()) return res.status(503).json({ error: 'The scribe is not configured \u2014 set OPENCODE_API_KEY in .env' });

    const mode = ['caption', 'summary', 'manuscript'].includes(req.body?.mode) ? req.body.mode : null;
    if (!mode) return res.status(400).json({ error: 'mode must be caption, summary or manuscript' });
    const text = String(req.body?.text || '').slice(0, 12000).trim();
    if (!text) return res.status(400).json({ error: 'Give the scribe a seed line \u2014 it polishes, it does not invent' });

    const title = req.body?.title ? String(req.body.title).slice(0, 200) : undefined;
    const userPrompt =
      mode === 'manuscript'
        ? `Manuscript title: ${title || '(untitled)'}\n\nDraft to illuminate:\n${text}`
        : mode === 'caption'
          ? `Caption draft:\n${text}`
          : `Article title: ${title || '(untitled)'}\n\nCurrent summary:\n${text}`;

    try {
      const { text: out, model, via } = await chat({
        system: PROMPTS[mode],
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: LIMITS[mode],
        temperature: 0.75,
      });
      let clean = out.trim();
      if (mode === 'manuscript') clean = clean.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
      else clean = clean.replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '').trim();
      return res.status(200).json({ text: clean, model, via });
    } catch (err) {
      if (err.code === 'GATEWAY_DOWN' || err.code === 'EMPTY' || err.code === 'RATE_LIMIT') {
        console.warn(`[scribe] ${err.code}:`, (err.gateway_errors || []).join(' | '));
        return res.status(200).json({
          text: localScribe(mode, text, title),
          model: 'house-scribe-offline',
          fallback: true,
          gateway_errors: (err.gateway_errors || []).slice(0, 3),
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('ai error:', err);
    res.status(502).json({ error: err.message });
  }
}
