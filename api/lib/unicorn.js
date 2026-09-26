/*
 * =====================================================================
 *  AyurVerse Library · "unicorn" — query understanding
 *  ---------------------------------------------------------------------
 *  Faithful port note: on Twitter, Unicorn fronts the search fleet — it
 *  parses free text into a structured plan before EarlyBird ever sees an
 *  index. Operators, entities, intent. Ours does the same for the atelier:
 *
 *    @ishaan.writes          → author intent
 *    #holi                   → tag intent
 *    kind:forge | kind:video → shelf intent
 *    kind:image              → media intent
 *    "payar chhanda"         → phrase
 *    chai spices             → free terms (stop-words trimmed, light stems)
 * =====================================================================
 */

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'or', 'for', 'with', 'is', 'are',
  'at', 'by', 'from', 'that', 'this', 'it', 'as', 'be', 'was', 'were', 'my', 'me',
  'how', 'why', 'what', 'when', 'who', 'your', 'our',
]);

export function stem(w) {
  let s = w;
  s = s.replace(/(ies)$/, 'y');
  s = s.replace(/(sses)$/, 'ss');
  s = s.replace(/(ing|edly|ed|ly|es|s)$/, '');
  return s.length < 2 ? w : s;
}

export function tokens(q) {
  return (q || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

/**
 * parseQuery("kind:forge chai #spices") →
 *   { terms:['chai'], stems:['chai'], ops:{kind:'forge', tag:'spices'},
 *     phrase:'chai spices', author:'…' | null }
 */
export function parseQuery(raw) {
  const text = String(raw || '').trim();
  const ops = {};
  const bareParts = [];

  for (const part of text.split(/\s+/)) {
    if (!part) continue;
    const opIndex = part.indexOf(':');
    if (opIndex > 0) {
      const key = part.slice(0, opIndex).toLowerCase();
      const val = part.slice(opIndex + 1).toLowerCase();
      if (['kind', 'media', 'type'].includes(key) && val) {
        ops.kind = { forge: 'forge', lore: 'forge', visual: 'visual', video: 'video', image: 'image' }[val] || val;
        continue;
      }
      if (['by', 'author', 'from'].includes(key) && val) {
        ops.author = val.replace(/^@/, '');
        continue;
      }
    }
    if (part.startsWith('@') && part.length > 2) {
      ops.author = part.slice(1).toLowerCase();
      continue;
    }
    if (part.startsWith('#') && part.length > 2) {
      ops.tag = part.slice(1).toLowerCase();
      continue;
    }
    bareParts.push(part);
  }

  const bare = bareParts.join(' ');
  // operators are ALSO evidence — @aarav guides ranking even as a token
  const fromOps = [];
  if (ops.author) fromOps.push(ops.author.replace(/[._]/g, ' '), ops.author);
  if (ops.tag) fromOps.push(ops.tag);
  const baseParts = (bare + ' ' + fromOps.join(' ')).trim();

  const rawTerms = tokens(baseParts).filter((t) => !STOP.has(t)).slice(0, 12);
  const terms = rawTerms.length ? rawTerms : tokens(baseParts).slice(0, 12);
  const stems = terms.map(stem);
  const phrase = bare.toLowerCase();

  return { terms, stems, phrase, ops, raw: text };
}
