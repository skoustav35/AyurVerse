/*
 * =====================================================================
 *  AyurVerse Library · "heavyrank" — final relevance scorer
 *  ---------------------------------------------------------------------
 *  Faithful port note: Twitter's Heavy Ranker (the neural layer above
 *  EarlyBird's textScore) multiplies engagement by publicized weights —
 *  roughly: replies outweigh likes ~20×, retweets ~30×, then injects
 *  recency, author-graph edges (SimClusters), and cultivated taste. We port
 *  the *geometry*, tuned to our engagement vocabulary (save ≈ retweet):
 *
 *      view   0.001·log    (passive attention — cheapest signal)
 *      like   0.90 ·log    (appreciation)
 *      comment 1.80 ·log   (reply — conversation is gold)
 *      save   2.60 ·log    (satchel — the retweet of the atelier)
 *      recency exp decay, half-life ≈ 30h (the freshness dial)
 *      author-follow edge  +2.4   (trusted sources surface for you)
 *      taste overlap      +0.9/tag (your SimClusters, from live signals)
 *      authorAuthority    +0.35·log(posts) (proven hands rise gently)
 * =====================================================================
 */

export const HEAVY_WEIGHTS = {
  text: 2.4,
  fuzzy: 1.1,
  phraseBonus: 1.0,
  coverage: 3.4,
  like: 0.9,
  comment: 1.8,
  save: 2.6,
  view: 0.18,
  recencyTauHours: 30,
  followEdge: 2.4,
  tastePerTag: 0.9,
  tasteCap: 2.7,
  authorAuthority: 0.35,
  operatorBoost: 1.6, // direct @author / #tag / kind operators deserve obedience
};

const log1p = Math.log1p;

export function heavyScore(cand, ctx) {
  const { p, pool, evidence } = cand;
  const now = ctx.now;
  const ageH = Math.max(0.1, (now - new Date(p.created_at).getTime()) / 3600000);

  const f = {
    text: HEAVY_WEIGHTS.text * evidence.text,
    fuzzy: HEAVY_WEIGHTS.fuzzy * evidence.fuzzy,
    phrase: HEAVY_WEIGHTS.phraseBonus * evidence.bonus,
    coverage: HEAVY_WEIGHTS.coverage * evidence.coverage,
    engagement:
      HEAVY_WEIGHTS.like * log1p(p.likes_count || 0) +
      HEAVY_WEIGHTS.comment * log1p(p.comments_count || 0) +
      HEAVY_WEIGHTS.save * log1p(p.saves_count || 0) +
      HEAVY_WEIGHTS.view * log1p(p.views_count || 0),
    recency: 1.2 * Math.exp((-Math.LN2 * ageH) / HEAVY_WEIGHTS.recencyTauHours),
    social: ctx.viewerFollows?.has(p.author_id) ? HEAVY_WEIGHTS.followEdge : 0,
    taste: Math.min(
      HEAVY_WEIGHTS.tasteCap,
      (p.tags || []).reduce((acc, t) => acc + (ctx.taste?.[t] ? HEAVY_WEIGHTS.tastePerTag : 0), 0),
    ),
    authority: HEAVY_WEIGHTS.authorAuthority * log1p(ctx.authorPostCount?.get(p.author_id) || 0),
    operator:
      (ctx.ops?.author && (p.author_username || '').toLowerCase().includes(ctx.ops.author) ? HEAVY_WEIGHTS.operatorBoost : 0) +
      (ctx.ops?.tag && (p.tags || []).includes(ctx.ops.tag) ? HEAVY_WEIGHTS.operatorBoost : 0) +
      (ctx.ops?.kind && ctx.ops.kind === (p.media_type || p.kind) ? HEAVY_WEIGHTS.operatorBoost : 0),
    poolPrior: pool === 'author-op' || pool === 'tag-op' ? 1.2 : pool === 'recency' ? -0.6 : 0,
  };

  // no evidence of relevance at all AND nobody cared → the floor drops out
  const relevance = f.text + f.fuzzy + f.phrase + f.coverage + f.operator;
  if (relevance < 0.5 && f.engagement < 0.3) {
    return { score: relevance + f.recency - 6, features: { ...f, floor: -6 } };
  }
  const score = Object.values(f).reduce((a, b) => a + b, 0);
  return { score, features: f };
}
