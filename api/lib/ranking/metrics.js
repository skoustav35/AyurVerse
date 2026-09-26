/*
 * =====================================================================
 *  AyurVerse Ranking · "metrics" — offline + online evaluation
 *  ---------------------------------------------------------------------
 *  Offline ranking quality:
 *    · NDCG@k  — graded relevance 0..3, exponential gain (2^rel − 1),
 *                log2(rank+1) discount.
 *    · AP@k    — denominator is min(totalRelevant, k). This is the
 *                standard truncation so AP@k never exceeds 1.
 *    · MRR@k   — reciprocal rank of the first relevant item.
 *  Duplicate ids are ignored after their first appearance: they neither
 *  double-count nor improve any metric. Missing ids score relevance 0.
 *
 *  Off-policy estimation:
 *    · estimateIPS — inverse propensity scoring with weight clipping,
 *      self-normalized IPS (SNIPS) and Kish effective sample size. Zero
 *      or negative logging propensities are rejected. Estimates are only
 *      valid with correct propensities and bounded support; warnings say
 *      so explicitly rather than implying causal evidence.
 *
 *  Online A/B (fixed horizon only — no sequential peeking):
 *    · compareExperimentUsers — per-user aggregated reward and negative
 *      rate, normal 95% CIs, and a df=1 chi-square sample-ratio-mismatch
 *      test. A winner is never declared below the minimum sample size.
 * =====================================================================
 */

function metricError(message) {
  return new RangeError(message);
}

function validateK(k) {
  if (!Number.isInteger(k) || k <= 0) throw metricError('k must be a positive integer');
  return k;
}

function clampRelevance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n));
}

/** Exponential gain used by NDCG. */
function gain(relevance) {
  return Math.pow(2, relevance) - 1;
}

function relevanceOf(relevance, id) {
  if (!relevance || typeof relevance !== 'object') return 0;
  return clampRelevance(relevance[id]);
}

function uniqueTopK(rankedIds, k) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(rankedIds) ? rankedIds : []) {
    const id = String(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= k) break;
  }
  return out;
}

function relevantIdSet(relevance) {
  const set = new Set();
  if (relevance && typeof relevance === 'object') {
    for (const id of Object.keys(relevance)) {
      if (clampRelevance(relevance[id]) > 0) set.add(String(id));
    }
  }
  return set;
}

/** Normalized discounted cumulative gain at k. No positives → 0. */
export function ndcgAtK(rankedIds, relevance, k) {
  validateK(k);
  const top = uniqueTopK(rankedIds, k);
  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    const g = gain(relevanceOf(relevance, top[i]));
    if (g > 0) dcg += g / Math.log2(i + 2);
  }

  const idealGains = [];
  if (relevance && typeof relevance === 'object') {
    for (const id of Object.keys(relevance)) {
      const g = gain(clampRelevance(relevance[id]));
      if (g > 0) idealGains.push(g);
    }
  }
  idealGains.sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < idealGains.length && i < k; i++) {
    idcg += idealGains[i] / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Average precision at k.
 * AP@k = (Σ P(i)·rel(i)) / min(totalRelevant, k); no positives → 0.
 */
export function averagePrecisionAtK(rankedIds, relevance, k) {
  validateK(k);
  const relevant = relevantIdSet(relevance);
  if (relevant.size === 0) return 0;
  const top = uniqueTopK(rankedIds, k);
  let hits = 0;
  let sum = 0;
  for (let i = 0; i < top.length; i++) {
    if (relevant.has(top[i])) {
      hits += 1;
      sum += hits / (i + 1);
    }
  }
  return sum / Math.min(relevant.size, k);
}

/** Reciprocal rank of the first relevant item within the top k; none → 0. */
export function reciprocalRankAtK(rankedIds, relevance, k) {
  validateK(k);
  const relevant = relevantIdSet(relevance);
  if (relevant.size === 0) return 0;
  const top = uniqueTopK(rankedIds, k);
  for (let i = 0; i < top.length; i++) {
    if (relevant.has(top[i])) return 1 / (i + 1);
  }
  return 0;
}

function recallAtK(rankedIds, relevance, k) {
  const relevant = relevantIdSet(relevance);
  if (relevant.size === 0) return 0;
  const top = uniqueTopK(rankedIds, k);
  let hits = 0;
  for (const id of top) if (relevant.has(id)) hits += 1;
  return hits / relevant.size;
}

function macro(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Evaluate a batch of judged slates.
 * @returns {{k:number,queries:number,ndcg:number,map:number,mrr:number,recall:number,
 *   segments:Record<string,object>,cases:object[]}}
 */
export function evaluateRankings(cases, k = 10) {
  validateK(k);
  const list = Array.isArray(cases) ? cases : [];
  const perCase = [];
  for (let index = 0; index < list.length; index++) {
    const item = list[index] || {};
    const ranked = item.ranked || [];
    const relevance = item.relevance || {};
    perCase.push({
      id: item.id === undefined ? String(index) : String(item.id),
      segment: typeof item.segment === 'string' && item.segment ? item.segment : 'all',
      ndcg: ndcgAtK(ranked, relevance, k),
      map: averagePrecisionAtK(ranked, relevance, k),
      mrr: reciprocalRankAtK(ranked, relevance, k),
      recall: recallAtK(ranked, relevance, k),
    });
  }

  const segments = {};
  for (const row of perCase) {
    if (!segments[row.segment]) segments[row.segment] = [];
    segments[row.segment].push(row);
  }
  const segmentReport = {};
  for (const [name, rows] of Object.entries(segments)) {
    segmentReport[name] = {
      queries: rows.length,
      ndcg: macro(rows.map((r) => r.ndcg)),
      map: macro(rows.map((r) => r.map)),
      mrr: macro(rows.map((r) => r.mrr)),
      recall: macro(rows.map((r) => r.recall)),
    };
  }

  return {
    k,
    queries: perCase.length,
    ndcg: macro(perCase.map((r) => r.ndcg)),
    map: macro(perCase.map((r) => r.map)),
    mrr: macro(perCase.map((r) => r.mrr)),
    recall: macro(perCase.map((r) => r.recall)),
    segments: segmentReport,
    cases: perCase,
  };
}

/**
 * Inverse propensity scoring over logged rows.
 * rows: {reward, loggingPropensity, targetPropensity}. Zero/negative
 * propensities are rejected; weights are clipped to `clip`.
 * @returns {{ips:number,snips:number,ess:number,clipped:number,count:number,warnings:string[]}}
 */
export function estimateIPS(rows, options = {}) {
  const clip = Number.isFinite(Number(options.clip)) && Number(options.clip) > 0 ? Number(options.clip) : 20;
  const list = Array.isArray(rows) ? rows : [];
  let sumW = 0;
  let sumW2 = 0;
  let sumWR = 0;
  let clipped = 0;
  let count = 0;

  for (const row of list) {
    const loggingPropensity = Number(row?.loggingPropensity);
    const targetPropensity = Number(row?.targetPropensity);
    const reward = Number(row?.reward);
    if (!Number.isFinite(loggingPropensity) || loggingPropensity <= 0) {
      throw metricError('estimateIPS: loggingPropensity must be a finite number > 0');
    }
    if (!Number.isFinite(targetPropensity) || targetPropensity < 0) {
      throw metricError('estimateIPS: targetPropensity must be a finite number >= 0');
    }
    if (!Number.isFinite(reward)) {
      throw metricError('estimateIPS: reward must be a finite number');
    }
    let weight = targetPropensity / loggingPropensity;
    if (!Number.isFinite(weight)) throw metricError('estimateIPS: non-finite importance weight');
    if (weight > clip) {
      weight = clip;
      clipped += 1;
    }
    sumW += weight;
    sumW2 += weight * weight;
    sumWR += weight * reward;
    count += 1;
  }

  const ips = count > 0 ? sumWR / count : 0;
  const snips = sumW > 0 ? sumWR / sumW : 0;
  const ess = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;

  const warnings = [];
  if (clipped > 0) {
    warnings.push('importance weights were clipped: limited support, estimate is biased');
  }
  if (count > 0 && ess < 0.5 * count) {
    warnings.push('low effective sample size: high-variance estimate');
  }
  warnings.push('IPS is valid only with correct propensities and bounded rewards; it is not causal evidence');

  return { ips, snips, ess, clipped, count, clip, warnings };
}

/* ---------------- statistics helpers ---------------- */

/** Complementary error function (Numerical Recipes rational approximation). */
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const poly = t * (1.00002368
    + t * (0.37409196
      + t * (0.09678418
        + t * (-0.18628806
          + t * (0.27886807
            + t * (-1.13520398
              + t * (1.48851587
                + t * (-0.82215223
                  + t * 0.17087277))))))));
  const r = t * Math.exp(-z * z - 1.26551223 + poly);
  return x >= 0 ? r : 2 - r;
}

function chiSquarePValueDf1(chi2) {
  if (!Number.isFinite(chi2) || chi2 <= 0) return 1;
  return erfc(Math.sqrt(chi2 / 2));
}

/** Inverse standard-normal CDF (Acklam's rational approximation). */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function variantStats(rows) {
  const n = rows.length;
  if (n === 0) return { n: 0, meanReward: 0, varReward: 0, meanNegativeRate: 0, varNegativeRate: 0 };
  let sumR = 0;
  let sumR2 = 0;
  let sumN = 0;
  let sumN2 = 0;
  for (const row of rows) {
    sumR += row.reward;
    sumR2 += row.reward * row.reward;
    sumN += row.negativeRate;
    sumN2 += row.negativeRate * row.negativeRate;
  }
  const meanReward = sumR / n;
  const meanNegativeRate = sumN / n;
  return {
    n,
    meanReward,
    varReward: n > 1 ? Math.max(0, (sumR2 - n * meanReward * meanReward) / (n - 1)) : 0,
    meanNegativeRate,
    varNegativeRate: n > 1 ? Math.max(0, (sumN2 - n * meanNegativeRate * meanNegativeRate) / (n - 1)) : 0,
  };
}

function differenceOfMeans(control, treatment, z, minSample) {
  const difference = treatment.mean - control.mean;
  const se = Math.sqrt(control.variance + treatment.variance);
  const ci = [difference - z * se, difference + z * se];
  const enoughSample = control.n >= minSample && treatment.n >= minSample;
  const significant = enoughSample && se > 0 && (ci[0] > 0 || ci[1] < 0);
  return { difference, se, ci, significant, enoughSample };
}

/**
 * Fixed-horizon online A/B comparison over per-user aggregated rows.
 * rows: {userId, variant, reward, negativeRate?|negative?}.
 * Requires >= minSample (default 100) users per variant before a winner
 * can be declared, and reports a df=1 chi-square sample-ratio-mismatch.
 */
export function compareExperimentUsers(rows, options = {}) {
  const minSample = Number.isInteger(options.minSample) && options.minSample >= 0 ? options.minSample : 100;
  const alpha = Number.isFinite(Number(options.alpha)) && Number(options.alpha) > 0 && Number(options.alpha) < 1
    ? Number(options.alpha)
    : 0.05;
  const controlVariant = typeof options.controlVariant === 'string' ? options.controlVariant : 'control';
  const treatmentVariant = typeof options.treatmentVariant === 'string' ? options.treatmentVariant : 'treatment';

  const controlRows = [];
  const treatmentRows = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const variant = row?.variant;
    if (variant !== controlVariant && variant !== treatmentVariant) continue;
    const reward = Number(row?.reward);
    if (!Number.isFinite(reward)) continue;
    let negativeRate;
    if (row && Number.isFinite(Number(row.negativeRate))) negativeRate = clamp01(row.negativeRate);
    else if (row && typeof row.negative === 'boolean') negativeRate = row.negative ? 1 : 0;
    else negativeRate = 0;
    (variant === controlVariant ? controlRows : treatmentRows).push({ reward, negativeRate });
  }

  const control = variantStats(controlRows);
  const treatment = variantStats(treatmentRows);
  const z = normalQuantile(1 - alpha / 2);

  const reward = differenceOfMeans(
    { mean: control.meanReward, variance: control.n > 0 ? control.varReward / control.n : 0, n: control.n },
    { mean: treatment.meanReward, variance: treatment.n > 0 ? treatment.varReward / treatment.n : 0, n: treatment.n },
    z, minSample,
  );
  const negativeRate = differenceOfMeans(
    { mean: control.meanNegativeRate, variance: control.n > 0 ? control.varNegativeRate / control.n : 0, n: control.n },
    { mean: treatment.meanNegativeRate, variance: treatment.n > 0 ? treatment.varNegativeRate / treatment.n : 0, n: treatment.n },
    z, minSample,
  );

  const total = control.n + treatment.n;
  const expected = total / 2;
  let chi2 = 0;
  if (expected > 0) {
    chi2 = ((control.n - expected) ** 2) / expected + ((treatment.n - expected) ** 2) / expected;
  }
  const p = total > 0 ? chiSquarePValueDf1(chi2) : 1;
  const srm = {
    chi2,
    df: 1,
    p,
    mismatch: total > 0 && p < 0.001,
    observed: [control.n, treatment.n],
    expected: [expected, expected],
  };

  const warnings = [];
  if (control.n < minSample || treatment.n < minSample) {
    warnings.push(`insufficient sample: need >= ${minSample} users per variant before declaring a winner`);
  }
  if (srm.mismatch) warnings.push('sample ratio mismatch detected: assignment may be biased');
  warnings.push('fixed-horizon comparison only; repeated peeking inflates false positives');

  const canDeclareWinner = control.n >= minSample && treatment.n >= minSample && !srm.mismatch;

  return {
    method: 'fixed-horizon-normal-ci',
    alpha,
    minSample,
    control,
    treatment,
    reward: { ...reward, controlMean: control.meanReward, treatmentMean: treatment.meanReward },
    negativeRate: { ...negativeRate, controlMean: control.meanNegativeRate, treatmentMean: treatment.meanNegativeRate },
    srm,
    canDeclareWinner,
    warnings,
  };
}
