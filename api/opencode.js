/*
 * Shared OpenCode Zen client — the single door to big-pickle.
 * Both the house scribe (/api/ai) and the Vaidya agent (/api/agent) call
 * through here, reading ONE secret: process.env.OPENCODE_API_KEY.
 *
 * Resilient cascade: /chat/completions (OpenAI) → /responses (OpenAI Responses)
 * → /messages (Anthropic), each with Authorization then x-api-key, each with
 * both model-id spellings. Returns the first non-empty completion.
 */

const BASE = 'https://opencode.ai/zen/v1';
// only 'big-pickle' is a valid id on this gateway; the 'opencode/big-pickle'
// spelling always 401s ("Model not supported"), so we don't waste calls on it.
const MODELS = ['big-pickle'];
const HEADERS = ['Authorization', 'x-api-key'];

export function hasKey() {
  return !!process.env.OPENCODE_API_KEY;
}

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

/*
 * One HTTP attempt against a given endpoint form.
 *   form: 'openai' | 'responses' | 'anthropic'
 *   messages: [{ role: 'system'|'user'|'assistant', content }]
 */
// big-pickle is a reasoning model — it can spend a large, VARIABLE number of
// tokens "thinking" (reasoning_content) before it emits the real answer in
// `content`. If the budget is too small the reasoning eats it and `content`
// comes back empty. So we (a) give generous budgets, (b) use a long timeout,
// and (c) treat "200 but empty content" as a distinct, retryable state rather
// than a gateway failure.
const TIMEOUT_MS = 90000;

class EmptyCompletion extends Error {
  constructor() {
    super('empty completion (reasoning consumed the budget)');
    this.code = 'EMPTY';
  }
}

class RateLimited extends Error {
  constructor(detail) {
    super('rate limit exceeded');
    this.code = 'RATE_LIMIT';
    this.detail = detail;
  }
}

async function attempt({ key, path, authHeader, model, form, system, messages, maxTokens, temperature }) {
  const headers = { 'Content-Type': 'application/json' };
  headers[authHeader] = authHeader === 'Authorization' ? `Bearer ${key}` : key;

  let body;
  if (form === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model,
      max_tokens: maxTokens,
      system,
      messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
    };
  } else if (form === 'responses') {
    const input = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    body = { model, instructions: system, input, max_output_tokens: maxTokens };
  } else {
    const full = system ? [{ role: 'system', content: system }, ...messages.filter((m) => m.role !== 'system')] : messages;
    body = { model, messages: full, temperature: temperature ?? 0.7, max_tokens: maxTokens };
  }

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 429) throw new RateLimited(txt.slice(0, 160));
    throw new Error(`HTTP ${res.status}${txt ? ` · ${txt.slice(0, 140)}` : ''}`);
  }
  const data = await res.json();
  const text =
    form === 'anthropic'
      ? extractAnthropic(data)
      : form === 'responses'
        ? extractResponses(data)
        : data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string' || !text.trim()) throw new EmptyCompletion();
  return text;
}

/*
 * Run a full chat completion through the resilient cascade.
 * Returns { text, model, via }. Throws:
 *   - { code:'NO_KEY' }        when the key is unset
 *   - { code:'EMPTY' }         when the gateway answered but produced no text
 *                              even after a bigger-budget retry (reasoning ran
 *                              away) — callers should ask the user to retry
 *   - { code:'GATEWAY_DOWN' }  when every attempt failed with a real error
 */
export async function chat({ system, messages, maxTokens = 2000, temperature = 0.7 }) {
  const key = process.env.OPENCODE_API_KEY;
  if (!key) {
    const err = new Error('OPENCODE_API_KEY is not set');
    err.code = 'NO_KEY';
    throw err;
  }

  const plans = [];
  for (const model of MODELS) {
    for (const header of HEADERS) {
      plans.push({ path: '/chat/completions', authHeader: header, model, form: 'openai' });
    }
  }
  plans.push({ path: '/responses', authHeader: 'Authorization', model: MODELS[0], form: 'responses' });
  plans.push({ path: '/messages', authHeader: 'x-api-key', model: MODELS[0], form: 'anthropic' });

  const errors = [];
  let sawEmpty = false;      // gateway reachable but reasoning ate the budget
  let sawRateLimit = false;  // key is over its usage / rate limit

  for (const p of plans) {
    // budgets to try for this plan: the asked budget, then a doubled budget if
    // the first attempt came back empty (a reasoning spike).
    const budgets = [maxTokens, Math.min(maxTokens * 2, 12000)];
    for (let i = 0; i < budgets.length; i++) {
      try {
        const text = await attempt({ key, ...p, system, messages, maxTokens: budgets[i], temperature });
        return { text: text.trim(), model: p.model, via: `${p.form}${p.authHeader === 'x-api-key' ? ':x-api-key' : ''}` };
      } catch (err) {
        if (err.code === 'EMPTY') {
          sawEmpty = true;
          if (i === 0) continue; // retry same plan once with the larger budget
          errors.push(`${p.form}@${p.authHeader}:${p.model} → empty`);
          break;
        }
        if (err.code === 'RATE_LIMIT') {
          sawRateLimit = true;
          errors.push(`${p.form}@${p.authHeader}:${p.model} → 429 ${err.detail || ''}`);
          break; // same key everywhere → no point hammering other plans hard
        }
        const cause = err.cause?.code || err.cause?.message;
        errors.push(`${p.form}@${p.authHeader}:${p.model} → ${err.name === 'TimeoutError' ? 'timeout' : err.message}${cause ? ` (${cause})` : ''}`);
        break; // real error on this plan → next plan
      }
    }
  }

  const code = sawRateLimit ? 'RATE_LIMIT' : sawEmpty ? 'EMPTY' : 'GATEWAY_DOWN';
  const err = new Error(
    code === 'RATE_LIMIT' ? 'rate limit exceeded' : code === 'EMPTY' ? 'model returned no content' : 'gateway unreachable',
  );
  err.code = code;
  err.gateway_errors = errors.slice(0, 4);
  throw err;
}

export { BASE, MODELS };
