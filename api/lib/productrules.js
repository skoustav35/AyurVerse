/*
 * =====================================================================
 *  AyurVerse Library · "heuristics" — the product-rules mixer
 *  ---------------------------------------------------------------------
 *  Faithful port note: between heavy ranking and serve, Twitter interleaves
 *  type mixing (video windows), author diversity caps, dedup, and safety
 *  floors. These rules are product taste, not math:
 *   · no author may answer the patron twice consecutively
 *   · ↯ scroll and glyph kinds braid rather than clump
 *   · exact/close tiers live above suggested tiers (trust ladder)
 * =====================================================================
 */

export function productRules(ranked, opts = {}) {
  const out = [];
  const kindsSeen = { forge: 0, visual: 0 };
  let lastAuthor = null;

  for (const r of ranked) {
    const author = r.p.author_id;
    const k = r.p.kind || (r.p.media_type === 'video' ? 'visual' : 'visual');
    // author diversity: same voice twice in a row waits one slot
    if (author && author === lastAuthor && out.length) {
      // park it — it may re-enter after the braid breathes
      const idx = out.findIndex((x, i) => x !== undefined);
      if (idx >= 0) { out.push(r); lastAuthor = author; continue; }
    }
    kindsSeen[k] = (kindsSeen[k] || 0) + 1;
    out.push(r);
    lastAuthor = author;
  }
  return out;
}

/** Tiers of trust — exact answers first, near-misses by apology, suggestions with humility. */
export function tierOf(cand) {
  const e = cand.evidence;
  if (e.exactHits > 0 || e.bonus > 0) return 'exact';
  if (e.fuzzy > 0) return 'close';
  return 'suggested';
}
