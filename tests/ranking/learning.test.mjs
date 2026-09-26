/*
 * tests/ranking/learning.test.mjs
 * node:test coverage for the pure ranking learning/eval modules:
 *   api/lib/ranking/bandit.js
 *   api/lib/ranking/experiments.js
 *   api/lib/ranking/metrics.js
 * All expected values are hand-computed; there is no network or DB access.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  initialBandit, selectArm, updateBandit, summarizeBandit, POLICY_VERSION,
} from '../../api/lib/ranking/bandit.js';
import { ARM_NAMES } from '../../api/lib/ranking/config.js';
import {
  assignExperiment, rewardForEvent, aggregateReward,
} from '../../api/lib/ranking/experiments.js';
import {
  ndcgAtK, averagePrecisionAtK, reciprocalRankAtK, evaluateRankings,
  estimateIPS, compareExperimentUsers,
} from '../../api/lib/ranking/metrics.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
const seqRng = (values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

/** Gauss-Jordan inverse, used only to verify the Sherman-Morrison update. */
function invert(matrix) {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const pv = aug[col][col];
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let c = 0; c < 2 * n; c++) aug[r][c] -= factor * aug[col][c];
    }
  }
  return aug.map((row) => row.slice(n));
}
const X = [1, 0.5, -0.25, 0, 0.75, -1];
const ZERO = [0, 0, 0, 0, 0, 0];
const E1 = [1, 0, 0, 0, 0, 0];

/* ================================================================== */
/* metrics: exact hand-computed ranking quality                        */
/* ================================================================== */

test('ndcgAtK: perfect ranking of graded relevance equals 1', () => {
  const relevance = { a: 3, b: 2, c: 0 };
  close(ndcgAtK(['a', 'b', 'c'], relevance, 3), 1);
});

test('ndcgAtK: swapping graded items matches hand-computed ratio', () => {
  const relevance = { a: 3, b: 2 };
  const dcg = 3 / 1 + 7 / Math.log2(3);      // b(2) first, then a(3)
  const idcg = 7 / 1 + 3 / Math.log2(3);     // ideal: a(3), b(2)
  close(ndcgAtK(['b', 'a'], relevance, 2), dcg / idcg);
  assert.ok(ndcgAtK(['b', 'a'], relevance, 2) < 1);
});

test('ndcgAtK: gain is exponential (2^rel - 1)', () => {
  // single item, rel=2 -> gain 3 at rank 1, ideal 3 -> 1
  close(ndcgAtK(['x'], { x: 2 }, 1), 1);
  // top item rel=1 vs an ideal rel=3 in the judged set -> (2^1-1)/(2^3-1) = 1/7
  close(ndcgAtK(['x'], { x: 1, y: 3 }, 1), 1 / 7);
});

test('averagePrecisionAtK: hand-computed with min(R,k) denominator', () => {
  // relevant at ranks 1 and 3 -> (1/1 + 2/3) / min(2,3) = 5/6
  close(averagePrecisionAtK(['a', 'b', 'c'], { a: 1, b: 0, c: 1 }, 3), 5 / 6);
});

test('averagePrecisionAtK: denominator is min(totalRelevant, k)', () => {
  // 3 relevant, k=1, first item relevant -> 1 / min(3,1) = 1
  close(averagePrecisionAtK(['a'], { a: 1, b: 1, c: 1 }, 1), 1);
  // same but k=2, only rank-1 relevant retrieved -> (1) / min(3,2) = 0.5
  close(averagePrecisionAtK(['a', 'x'], { a: 1, b: 1, c: 1 }, 2), 0.5);
});

test('reciprocalRankAtK: first relevant rank and truncation', () => {
  close(reciprocalRankAtK(['x', 'a'], { a: 1 }, 2), 0.5);
  close(reciprocalRankAtK(['a', 'x'], { a: 1 }, 2), 1);
  close(reciprocalRankAtK(['x', 'a'], { a: 1 }, 1), 0); // relevant outside top-k
});

test('duplicates never double count or improve any metric', () => {
  const relevance = { a: 1, b: 1 };
  const ranked = ['a', 'a', 'b'];
  close(ndcgAtK(ranked, relevance, 3), 1);
  close(averagePrecisionAtK(ranked, relevance, 3), 1);
  close(reciprocalRankAtK(ranked, relevance, 3), 1);
  assert.ok(ndcgAtK(ranked, relevance, 3) <= 1);
  // duplicate cannot inflate AP above 1
  assert.ok(averagePrecisionAtK(['a', 'a', 'a'], relevance, 3) <= 1);
});

test('missing relevance is treated as 0 and no positives yields 0', () => {
  close(ndcgAtK(['a', 'b'], { a: 1 }, 2), ndcgAtK(['a'], { a: 1 }, 2));
  close(ndcgAtK(['a'], {}, 1), 0);
  close(averagePrecisionAtK(['a'], {}, 1), 0);
  close(reciprocalRankAtK(['a'], {}, 1), 0);
  close(ndcgAtK(['a'], { a: 0, b: 0 }, 2), 0);
});

test('invalid k throws for every metric', () => {
  for (const bad of [0, -1, 1.5, NaN, '3']) {
    assert.throws(() => ndcgAtK(['a'], { a: 1 }, bad));
    assert.throws(() => averagePrecisionAtK(['a'], { a: 1 }, bad));
    assert.throws(() => reciprocalRankAtK(['a'], { a: 1 }, bad));
  }
  assert.throws(() => evaluateRankings([], 0));
});

test('evaluateRankings: macro averages, segments and query count', () => {
  const cases = [
    { id: 'q1', segment: 'ayurveda', ranked: ['a', 'b'], relevance: { a: 3, b: 2 } }, // ndcg 1, mrr 1
    { id: 'q2', segment: 'ayurveda', ranked: ['b', 'a'], relevance: { a: 3, b: 2 } }, // ndcg < 1
    { id: 'q3', segment: 'wellness', ranked: [], relevance: { a: 1 } },               // all 0
  ];
  const report = evaluateRankings(cases, 2);
  assert.equal(report.k, 2);
  assert.equal(report.queries, 3);
  close(report.cases[0].ndcg, 1);
  close(report.cases[2].ndcg, 0);
  close(report.segments.ayurveda.queries, 2);
  close(report.segments.wellness.ndcg, 0);
  close(report.ndcg, (report.cases[0].ndcg + report.cases[1].ndcg + report.cases[2].ndcg) / 3);
  close(report.segments.ayurveda.ndcg, (report.cases[0].ndcg + report.cases[1].ndcg) / 2);
});

/* ================================================================== */
/* metrics: inverse propensity scoring                                 */
/* ================================================================== */

test('estimateIPS: identity propensities reproduce the mean reward', () => {
  const out = estimateIPS([{ reward: 1, loggingPropensity: 0.5, targetPropensity: 0.5 }]);
  close(out.ips, 1);
  close(out.snips, 1);
  close(out.ess, 1);
  assert.equal(out.clipped, 0);
  assert.equal(out.count, 1);
});

test('estimateIPS: weight is target/logging and snips self-normalizes', () => {
  const single = estimateIPS([{ reward: 1, loggingPropensity: 0.25, targetPropensity: 0.5 }]);
  close(single.ips, 2);        // mean of (w · r) = 2/1
  close(single.snips, 1);      // Σ(w · r) / Σw = 2/2
  close(single.ess, 1);

  const two = estimateIPS([
    { reward: 1, loggingPropensity: 0.25, targetPropensity: 0.5 }, // w=2
    { reward: 0, loggingPropensity: 0.5, targetPropensity: 0.5 },  // w=1
  ]);
  close(two.ips, (2 * 1 + 1 * 0) / 2);
  close(two.snips, (2 * 1 + 1 * 0) / (2 + 1));
  close(two.ess, (3 * 3) / (4 + 1));
});

test('estimateIPS: effective sample size for uniform weights equals count', () => {
  const rows = Array.from({ length: 4 }, () => ({ reward: 1, loggingPropensity: 0.5, targetPropensity: 0.5 }));
  const out = estimateIPS(rows);
  close(out.ess, 4);
  assert.equal(out.count, 4);
});

test('estimateIPS: clips weights and warns about limited support', () => {
  const out = estimateIPS([{ reward: 1, loggingPropensity: 0.001, targetPropensity: 1 }], { clip: 20 });
  close(out.ips, 20);
  assert.equal(out.clipped, 1);
  assert.ok(out.warnings.some((w) => w.includes('clipped')));
  assert.ok(out.warnings.some((w) => w.includes('not causal evidence')));
});

test('estimateIPS: rejects zero/negative propensity and non-finite reward', () => {
  assert.throws(() => estimateIPS([{ reward: 1, loggingPropensity: 0, targetPropensity: 0.5 }]));
  assert.throws(() => estimateIPS([{ reward: 1, loggingPropensity: -0.1, targetPropensity: 0.5 }]));
  assert.throws(() => estimateIPS([{ reward: 1, loggingPropensity: 0.5, targetPropensity: -0.5 }]));
  assert.throws(() => estimateIPS([{ reward: NaN, loggingPropensity: 0.5, targetPropensity: 0.5 }]));
});

test('estimateIPS: empty rows yield zeros', () => {
  const out = estimateIPS([]);
  close(out.ips, 0);
  close(out.snips, 0);
  close(out.ess, 0);
  assert.equal(out.count, 0);
});

/* ================================================================== */
/* metrics: fixed-horizon A/B                                          */
/* ================================================================== */

function abRows(variant, n, base) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ userId: `${variant}-${i}`, variant, reward: base + (i % 2) * 0.2 });
  return rows;
}

test('compareExperimentUsers: deterministic and fixed-horizon', () => {
  const rows = [...abRows('control', 120, 0), ...abRows('treatment', 120, 0.8)];
  const a = compareExperimentUsers(rows);
  const b = compareExperimentUsers(rows);
  assert.deepEqual(a, b);
  assert.equal(a.method, 'fixed-horizon-normal-ci');
  assert.equal(a.canDeclareWinner, true);
  assert.equal(a.reward.significant, true);
  close(a.reward.difference, 0.8);
});

test('compareExperimentUsers: never declares a winner below min sample', () => {
  const rows = [...abRows('control', 10, 0), ...abRows('treatment', 10, 0.8)];
  const out = compareExperimentUsers(rows);
  assert.equal(out.canDeclareWinner, false);
  assert.equal(out.reward.significant, false);
  assert.equal(out.reward.enoughSample, false);
  assert.ok(out.warnings.some((w) => w.includes('insufficient sample')));
});

test('compareExperimentUsers: sample ratio mismatch chi-square df=1', () => {
  const rows = [...abRows('control', 150, 0.1), ...abRows('treatment', 50, 0.2)];
  const out = compareExperimentUsers(rows);
  assert.equal(out.srm.df, 1);
  close(out.srm.chi2, 50); // (150-100)^2/100 + (50-100)^2/100
  assert.ok(out.srm.p < 0.001);
  assert.equal(out.srm.mismatch, true);
  assert.equal(out.canDeclareWinner, false);
});

test('compareExperimentUsers: balanced groups have no SRM', () => {
  const rows = [...abRows('control', 100, 0.1), ...abRows('treatment', 100, 0.2)];
  const out = compareExperimentUsers(rows);
  close(out.srm.chi2, 0);
  assert.ok(out.srm.p > 0.9);
  assert.equal(out.srm.mismatch, false);
});

test('compareExperimentUsers: compares per-user negative rate', () => {
  const rows = [
    ...Array.from({ length: 120 }, (_, i) => ({ userId: `c${i}`, variant: 'control', reward: 0.2, negativeRate: 0.1 })),
    ...Array.from({ length: 120 }, (_, i) => ({ userId: `t${i}`, variant: 'treatment', reward: 0.2, negativeRate: 0.5 })),
  ];
  const out = compareExperimentUsers(rows);
  close(out.negativeRate.difference, 0.4);
  close(out.control.meanNegativeRate, 0.1);
  close(out.treatment.meanNegativeRate, 0.5);
  assert.equal(out.negativeRate.significant, true);
});

test('compareExperimentUsers: ignores unknown variants and bad rewards', () => {
  const rows = [
    { userId: 'x', variant: 'other', reward: 5 },
    { userId: 'y', variant: 'control', reward: NaN },
    { userId: 'z', variant: 'control', reward: 1 },
  ];
  const out = compareExperimentUsers(rows, { minSample: 1 });
  assert.equal(out.control.n, 1);
  assert.equal(out.treatment.n, 0);
});

/* ================================================================== */
/* experiments: deterministic bucketing                                */
/* ================================================================== */

const ON = { id: 'feed-hybrid-v1', enabled: true, traffic: 0.2, treatment: 0.5, salt: 'test-salt' };

test('assignExperiment: disabled experiment is always off', () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(assignExperiment(`user-${i}`, { ...ON, enabled: false }).variant, 'off');
  }
});

test('assignExperiment: anonymous identities are never enrolled', () => {
  for (const id of ['', '   ', 'anonymous', 'ANON', 'guest', null, undefined, 0, -5, 1.5]) {
    assert.equal(assignExperiment(id, ON).variant, 'off');
  }
});

test('assignExperiment: deterministic and stable across unrelated config', () => {
  const first = assignExperiment('user-42', ON);
  assert.deepEqual(assignExperiment('user-42', ON), first);
  // model/feature churn must not reshuffle buckets
  const noisy = { ...ON, modelVersion: 'hybrid-v9', featureVersion: 99 };
  assert.deepEqual(assignExperiment('user-42', noisy), first);
});

test('assignExperiment: variant is independent of the traffic setting', () => {
  // For any user enrolled at low traffic, the same variant must hold at traffic=1.
  let checked = 0;
  for (let i = 0; i < 200; i++) {
    const low = assignExperiment(`user-${i}`, ON); // traffic 0.2
    if (low.variant === 'off') continue;
    const full = assignExperiment(`user-${i}`, { ...ON, traffic: 1 });
    assert.equal(full.variant, low.variant);
    assert.equal(full.bucket, low.bucket);
    checked += 1;
  }
  assert.ok(checked > 0);
});

test('assignExperiment: traffic and treatment clamps and extremes', () => {
  assert.equal(assignExperiment('user-1', { ...ON, traffic: 0 }).variant, 'off');
  assert.notEqual(assignExperiment('user-1', { ...ON, traffic: 1 }).variant, 'off');
  for (let i = 0; i < 20; i++) {
    assert.equal(assignExperiment(`u${i}`, { ...ON, traffic: 1, treatment: 1 }).variant, 'treatment');
    assert.equal(assignExperiment(`u${i}`, { ...ON, traffic: 1, treatment: 0 }).variant, 'control');
  }
  // out-of-range traffic clamps to 1 -> everyone in
  for (let i = 0; i < 20; i++) {
    assert.notEqual(assignExperiment(`u${i}`, { ...ON, traffic: 9 }).variant, 'off');
  }
  // out-of-range negative traffic clamps to 0 -> everyone off
  for (let i = 0; i < 20; i++) {
    assert.equal(assignExperiment(`u${i}`, { ...ON, traffic: -9 }).variant, 'off');
  }
});

test('assignExperiment: bucket is in [0,1) and traffic share is roughly correct', () => {
  let included = 0;
  let treatments = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const result = assignExperiment(`user-${i}`, ON);
    assert.ok(result.bucket >= 0 && result.bucket < 1);
    assert.ok(['control', 'treatment', 'off'].includes(result.variant));
    if (result.variant !== 'off') {
      included += 1;
      if (result.variant === 'treatment') treatments += 1;
    }
  }
  const trafficShare = included / N;
  const treatmentShare = treatments / included;
  assert.ok(trafficShare > 0.15 && trafficShare < 0.25, `traffic share ${trafficShare}`);
  assert.ok(treatmentShare > 0.45 && treatmentShare < 0.55, `treatment share ${treatmentShare}`);
});

test('rewardForEvent: exact reward vocabulary', () => {
  assert.equal(rewardForEvent('impression'), 0);
  assert.equal(rewardForEvent('click'), 0.1);
  assert.equal(rewardForEvent('like'), 0.35);
  assert.equal(rewardForEvent('save'), 0.7);
  assert.equal(rewardForEvent('hide'), -0.8);
  assert.equal(rewardForEvent('report'), -1);
  close(rewardForEvent('dwell', 30_000), 0.25);
  close(rewardForEvent('dwell', 60_000), 0.5);
  close(rewardForEvent('dwell', 600_000), 0.5); // capped
  close(rewardForEvent('dwell'), 0);
  close(rewardForEvent('dwell', -5_000), 0);
  assert.equal(rewardForEvent('unknown'), 0);
});

test('aggregateReward: caps positive spam and keeps only the most negative', () => {
  const clicks = Array.from({ length: 20 }, () => ({ type: 'click' }));
  close(aggregateReward(clicks), 1); // capped at MAX_POSITIVE_REWARD
  close(aggregateReward([{ type: 'click' }, { type: 'like' }, { type: 'save' }]), 1); // 1.15 -> 1
  close(aggregateReward([{ type: 'click' }, { type: 'hide' }]), -0.7);
  close(aggregateReward([{ type: 'click' }, { type: 'report' }]), -0.9);
  close(aggregateReward([{ type: 'save' }, { type: 'hide' }, { type: 'report' }]), -0.3); // 0.7 + (-1)
  close(aggregateReward([0.5, 0.75]), 1);
  close(aggregateReward([]), 0);
  close(aggregateReward([{ type: 'impression' }, { type: 'impression' }]), 0);
});

/* ================================================================== */
/* bandit: cold state, learning, propensity, guards                    */
/* ================================================================== */

test('initialBandit: shape is pure, serializable and ridge-initialized', () => {
  const state = initialBandit(6);
  assert.equal(state.version, 1);
  assert.equal(state.dimension, 6);
  assert.deepEqual(Object.keys(state.arms).sort(), [...ARM_NAMES].sort());
  for (const name of ARM_NAMES) {
    assert.equal(state.arms[name].n, 0);
    assert.deepEqual(state.arms[name].b, [0, 0, 0, 0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) assert.equal(state.arms[name].Ainv[i][j], i === j ? 1 : 0);
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('selectArm: cold state ties every arm -> uniform propensity', () => {
  const state = initialBandit(6);
  const result = selectArm(state, ZERO, { epsilon: 0.1, rng: seqRng([0.99, 0]) });
  assert.equal(result.policyVersion, POLICY_VERSION);
  assert.equal(result.arm, ARM_NAMES[0]); // exploit path, first co-maximizer
  close(result.propensity, 0.25); // eps/4 + (1-eps)/4
  for (const name of ARM_NAMES) close(result.probabilities[name], 0.25);
  const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
  close(sum, 1);
  assert.deepEqual(result.context, ZERO);
});

test('selectArm: exploit vs explore sampling is driven by rng', () => {
  const state = initialBandit(6);
  // draw 0.99 >= eps -> exploit; next 0 -> first maximizer (balanced, ties -> all)
  const exploit = selectArm(state, ZERO, { epsilon: 0.1, rng: seqRng([0.99, 0]) });
  assert.equal(exploit.arm, ARM_NAMES[0]);
  // draw 0.0 < eps -> explore; next 0 -> first allowed arm
  const explore = selectArm(state, ZERO, { epsilon: 0.1, rng: seqRng([0, 0]) });
  assert.equal(explore.arm, ARM_NAMES[0]);
});

test('selectArm: propensity reflects the maximizer and the epsilon mass', () => {
  let state = initialBandit(6);
  state = updateBandit(state, 'balanced', E1, 1);
  const result = selectArm(state, E1, { epsilon: 0.1, allowedArms: ['balanced', 'fresh'], rng: () => 0.5 });
  assert.equal(result.arm, 'balanced');
  close(result.propensity, 0.1 / 2 + 0.9); // eps/2 + (1-eps)*1
  close(result.probabilities.fresh, 0.05);
  close(result.probabilities.balanced + result.probabilities.fresh, 1);
});

test('selectArm: exact propensity includes the tie probability among maximizers', () => {
  let state = initialBandit(6);
  state = updateBandit(state, 'balanced', E1, 1);
  state = updateBandit(state, 'fresh', E1, 1); // identical update -> tie at the top
  const result = selectArm(state, E1, { epsilon: 0.1, allowedArms: ['balanced', 'fresh', 'discovery'], rng: () => 0.5 });
  close(result.probabilities.balanced, 0.1 / 3 + 0.9 / 2);
  close(result.probabilities.fresh, 0.1 / 3 + 0.9 / 2);
  close(result.probabilities.discovery, 0.1 / 3);
  const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
  close(sum, 1);
});

test('selectArm: epsilon is clamped to [0, 0.2]', () => {
  let state = initialBandit(6);
  state = updateBandit(state, 'balanced', E1, 1);
  const high = selectArm(state, E1, { epsilon: 5, allowedArms: ['balanced', 'fresh'], rng: () => 0.5 });
  close(high.propensity, 0.2 / 2 + 0.8); // clamped to 0.2
  const low = selectArm(state, E1, { epsilon: -3, allowedArms: ['balanced', 'fresh'], rng: () => 0.5 });
  close(low.propensity, 1); // clamped to 0
});

test('selectArm: validates context and allowed arms', () => {
  const state = initialBandit(6);
  assert.throws(() => selectArm(state, [0, 0, 0, 0, 0], {}));
  assert.throws(() => selectArm(state, [0, 0, 0, 0, 0, 2], {}));
  assert.throws(() => selectArm(state, [0, 0, 0, 0, 0, NaN], {}));
  assert.throws(() => selectArm(state, 'nope', {}));
  assert.throws(() => selectArm(state, ZERO, { allowedArms: [] }));
  assert.throws(() => selectArm(state, ZERO, { allowedArms: ['nope'] }));
  // [0,1] contexts are accepted (subset of [-1,1])
  assert.ok(selectArm(state, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], {}).arm);
});

test('updateBandit: Sherman-Morrison matches a direct matrix inverse', () => {
  const state = initialBandit(6);
  const next = updateBandit(state, 'balanced', X, 1);
  // A = I + x x^T ; invert by Gauss-Jordan and compare
  const d = 6;
  const A = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0) + X[i] * X[j]));
  const inv = invert(A);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) close(next.arms.balanced.Ainv[i][j], inv[i][j], 1e-9);
  }
  // b = reward * x and n increments
  for (let i = 0; i < d; i++) close(next.arms.balanced.b[i], X[i]);
  assert.equal(next.arms.balanced.n, 1);
});

test('updateBandit: does not mutate the input state', () => {
  const state = initialBandit(6);
  const snapshot = JSON.parse(JSON.stringify(state));
  updateBandit(state, 'fresh', X, 0.5);
  assert.deepEqual(state, snapshot);
});

test('updateBandit: weight scales reward accumulation but not Ainv', () => {
  const state = initialBandit(6);
  const one = updateBandit(state, 'balanced', X, 1);
  const two = updateBandit(state, 'balanced', X, 1, { weight: 2 });
  assert.deepEqual(two.arms.balanced.Ainv, one.arms.balanced.Ainv);
  for (let i = 0; i < 6; i++) close(two.arms.balanced.b[i], 2 * one.arms.balanced.b[i]);
});

test('updateBandit: zero context is a safe no-op update', () => {
  const state = initialBandit(6);
  const next = updateBandit(state, 'balanced', ZERO, 1);
  assert.deepEqual(next.arms.balanced.Ainv, state.arms.balanced.Ainv);
  assert.deepEqual(next.arms.balanced.b, state.arms.balanced.b);
  assert.equal(next.arms.balanced.n, 1);
});

test('updateBandit: rejects invalid arms, rewards and contexts', () => {
  const state = initialBandit(6);
  assert.throws(() => updateBandit(state, 'nope', X, 1));
  assert.throws(() => updateBandit(state, 'balanced', X, 1.5));
  assert.throws(() => updateBandit(state, 'balanced', X, -1.5));
  assert.throws(() => updateBandit(state, 'balanced', X, NaN));
  assert.throws(() => updateBandit(state, 'balanced', [1, 2, 3], 1));
  assert.throws(() => updateBandit(state, 'balanced', X, 1, { weight: -1 }));
});

test('updateBandit: numerical guard trips on a singular/corrupt state', () => {
  const state = initialBandit(6);
  state.arms.balanced.Ainv[0][0] = Infinity;
  assert.throws(() => updateBandit(state, 'balanced', X, 1), /singular|numerical/);
});

test('summarizeBandit: reports arm priors and pull counts', () => {
  let state = initialBandit(6);
  state = updateBandit(state, 'balanced', X, 1);
  state = updateBandit(state, 'balanced', X, -0.5);
  state = updateBandit(state, 'fresh', ZERO, 1);
  const summary = summarizeBandit(state);
  assert.equal(summary.totalPulls, 3);
  assert.equal(summary.arms.balanced.n, 2);
  assert.equal(summary.arms.fresh.n, 1);
  assert.equal(summary.arms.discovery.n, 0);
  assert.equal(summary.arms.discovery.pulled, false);
  assert.ok(summary.arms.balanced.bNorm > 0);
});

test('bandit learning: a rewarded arm gains preference over cold arms', () => {
  let state = initialBandit(6);
  for (let i = 0; i < 25; i++) state = updateBandit(state, 'discovery', E1, 1);
  const result = selectArm(state, E1, { epsilon: 0, allowedArms: ['discovery', 'balanced'], rng: () => 0.5 });
  assert.equal(result.arm, 'discovery');
  assert.ok(result.scores.discovery > result.scores.balanced);
  close(result.propensity, 1); // epsilon 0, sole maximizer
});

test('bandit replay: identical logs reproduce identical state', () => {
  const log = [
    ['balanced', X, 1],
    ['fresh', E1, -0.8],
    ['discovery', ZERO, 0.35],
    ['balanced', E1, 0.1],
    ['familiar', [0.2, 0.4, 0.6, 0.8, 1, -1], 0.7],
  ];
  const replay = () => {
    let state = initialBandit(6);
    for (const [arm, context, reward] of log) state = updateBandit(state, arm, context, reward);
    return state;
  };
  assert.deepEqual(replay(), replay());
});

test('bandit replay: an invalid event in the log errors', () => {
  let state = initialBandit(6);
  state = updateBandit(state, 'balanced', X, 1);
  assert.throws(() => updateBandit(state, 'balanced', X, 2), /reward/);
  assert.throws(() => updateBandit(state, 'ghost', X, 1), /unknown arm/);
});
