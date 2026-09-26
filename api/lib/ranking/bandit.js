/*
 * =====================================================================
 *  AyurVerse Ranking · "bandit" — disjoint LinUCB arm selection
 *  ---------------------------------------------------------------------
 *  A pure, serializable contextual bandit over the reviewed policy arms
 *  declared in ./config.js. There is NO production store and NO database
 *  access here: the caller owns persistence. Every function is pure —
 *  inputs are never mutated and every update returns a fresh state that
 *  can be JSON round-tripped.
 *
 *  Per arm we keep the inverse of the regularized design matrix and the
 *  accumulated reward projection:
 *      A_a = ridge * I + Σ x xᵀ        ->  Ainv_a = A_a⁻¹
 *      b_a = Σ (weight * reward) x
 *      θ_a = Ainv_a · b_a
 *      UCB_a(x) = θ_a·x + alpha * sqrt(xᵀ Ainv_a x)
 *
 *  Updates use the Sherman–Morrison rank-one identity so we never invert
 *  a matrix at serving time:
 *      (A + x xᵀ)⁻¹ = A⁻¹ - (A⁻¹x)(xᵀ A⁻¹) / (1 + xᵀ A⁻¹ x)
 *
 *  Selection is an epsilon-greedy mixture over the LinUCB maximizers:
 *      P(a) = ε/|allowed| + (1-ε)·1[a ∈ argmax] / |argmax|
 *  The propensity returned is the exact probability of the sampled arm,
 *  including the probability mass that the tie-breaking rule assigns to
 *  every co-maximizer. This matters because the propensity is consumed by
 *  off-policy estimators (see metrics.estimateIPS).
 * =====================================================================
 */

import { ARM_NAMES } from './config.js';

/** Bump when selection/update semantics change. */
export const POLICY_VERSION = 'linucb-v1';
/** Exploration width on the confidence bonus. */
export const DEFAULT_ALPHA = 1;
/** Ridge strength of the regularized design matrix (A = RIDGE · I at cold start). */
export const RIDGE = 1;
const EPS_MIN = 0;
const EPS_MAX = 0.2;
const DEFAULT_EPSILON = 0.1;
const TIE_TOLERANCE = 1e-9;

function rankingError(message, code = 'ranking_error') {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

function clampEpsilon(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_EPSILON;
  return Math.max(EPS_MIN, Math.min(EPS_MAX, n));
}

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1 - Number.EPSILON;
  return n;
}

function identity(size, scale = 1) {
  const out = new Array(size);
  for (let i = 0; i < size; i++) {
    const row = new Array(size).fill(0);
    row[i] = scale;
    out[i] = row;
  }
  return out;
}

function zeros(size) {
  return new Array(size).fill(0);
}

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function matVec(matrix, vector) {
  const d = vector.length;
  const out = new Array(d).fill(0);
  for (let i = 0; i < d; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length !== d) {
      throw rankingError('bandit: malformed Ainv matrix');
    }
    let acc = 0;
    for (let j = 0; j < d; j++) acc += row[j] * vector[j];
    out[i] = acc;
  }
  return out;
}

function validateDimension(dimension) {
  if (!Number.isInteger(dimension) || dimension < 1 || dimension > 64) {
    throw rankingError('bandit: dimension must be an integer in [1, 64]');
  }
  return dimension;
}

/** Contexts are finite and every component lies in [-1, 1] (which subsumes [0, 1]). */
function validateContext(context, dimension) {
  if (!Array.isArray(context) || context.length !== dimension) {
    throw rankingError(`bandit: context must be an array of length ${dimension}`);
  }
  const out = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    const value = Number(context[i]);
    if (!Number.isFinite(value) || value < -1 || value > 1) {
      throw rankingError('bandit: context values must be finite and within [-1, 1]');
    }
    out[i] = value;
  }
  return out;
}

function normalizeAllowedArms(input) {
  if (input === undefined || input === null) return ARM_NAMES.slice();
  if (!Array.isArray(input)) throw rankingError('bandit: allowedArms must be an array');
  const filtered = input.filter((name) => ARM_NAMES.includes(name));
  const unique = [...new Set(filtered)];
  if (!unique.length) throw rankingError('bandit: allowedArms must contain at least one known arm');
  return unique;
}

function cloneState(state) {
  const arms = {};
  for (const name of Object.keys(state.arms)) {
    const arm = state.arms[name];
    arms[name] = {
      Ainv: arm.Ainv.map((row) => row.slice()),
      b: arm.b.slice(),
      n: arm.n,
    };
  }
  return { version: state.version, dimension: state.dimension, arms };
}

function assertState(state) {
  if (!state || state.version !== 1 || !state.arms || typeof state.arms !== 'object') {
    throw rankingError('bandit: invalid state');
  }
  return validateDimension(state.dimension);
}

/**
 * Cold-start state: Ainv = I/ridge, b = 0, n = 0 for every reviewed arm.
 * The result is JSON-serializable and safe to persist as-is.
 */
export function initialBandit(dimension = 6) {
  const d = validateDimension(dimension);
  const arms = {};
  for (const name of ARM_NAMES) {
    arms[name] = { Ainv: identity(d, 1 / RIDGE), b: zeros(d), n: 0 };
  }
  return { version: 1, dimension: d, arms };
}

/**
 * Select an arm with the epsilon-greedy LinUCB mixture.
 *
 * @returns {{arm:string, propensity:number, probabilities:Record<string,number>,
 *   scores:Record<string,number>, context:number[], policyVersion:string}}
 */
export function selectArm(state, context, options = {}) {
  const dimension = assertState(state);
  const x = validateContext(context, dimension);
  const epsilon = clampEpsilon(options.epsilon === undefined ? DEFAULT_EPSILON : options.epsilon);
  const alpha = Number.isFinite(Number(options.alpha)) ? Number(options.alpha) : DEFAULT_ALPHA;
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const allowed = normalizeAllowedArms(options.allowedArms);

  const scores = {};
  for (const name of allowed) {
    const arm = state.arms[name];
    if (!arm || !Array.isArray(arm.Ainv) || !Array.isArray(arm.b)) {
      throw rankingError(`bandit: state is missing arm "${name}"`);
    }
    const theta = matVec(arm.Ainv, arm.b);
    const mean = dot(theta, x);
    const variance = Math.max(0, dot(x, matVec(arm.Ainv, x)));
    scores[name] = mean + alpha * Math.sqrt(variance);
  }

  let maxScore = -Infinity;
  for (const name of allowed) if (scores[name] > maxScore) maxScore = scores[name];
  const maximizers = allowed.filter((name) => maxScore - scores[name] <= TIE_TOLERANCE);

  const probabilities = {};
  for (const name of allowed) {
    const exploit = maximizers.includes(name) ? (1 - epsilon) / maximizers.length : 0;
    probabilities[name] = epsilon / allowed.length + exploit;
  }

  const draw = clampUnit(rng());
  let arm;
  if (draw < epsilon) {
    const index = Math.min(allowed.length - 1, Math.floor(clampUnit(rng()) * allowed.length));
    arm = allowed[index];
  } else {
    const index = Math.min(maximizers.length - 1, Math.floor(clampUnit(rng()) * maximizers.length));
    arm = maximizers[index];
  }

  return {
    arm,
    propensity: probabilities[arm],
    probabilities,
    scores,
    context: x.slice(),
    policyVersion: POLICY_VERSION,
  };
}

/**
 * Apply one observed reward to an arm with a Sherman–Morrison rank-one update.
 *
 * `weight` is an optional per-slate multiplier (default 1). Use it to encode
 * normalized slate-level rewards directly — never divide a reward by a
 * propensity here; off-policy correction belongs in metrics.estimateIPS.
 *
 * @returns {object} a new state; the input state is not mutated.
 */
export function updateBandit(state, arm, context, reward, options = {}) {
  const dimension = assertState(state);
  if (!ARM_NAMES.includes(arm)) throw rankingError(`bandit: unknown arm "${arm}"`);
  const x = validateContext(context, dimension);
  const r = Number(reward);
  if (!Number.isFinite(r)) throw rankingError('bandit: reward must be a finite number');
  if (r < -1 || r > 1) throw rankingError('bandit: reward must be within [-1, 1]');
  const weight = options.weight === undefined ? 1 : Number(options.weight);
  if (!Number.isFinite(weight) || weight < 0) {
    throw rankingError('bandit: weight must be a finite number >= 0');
  }

  const next = cloneState(state);
  const target = next.arms[arm];
  const v = matVec(target.Ainv, x);
  const denominator = 1 + dot(x, v);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw rankingError('bandit: singular or non-finite rank-one update');
  }

  const size = target.Ainv.length;
  const updated = new Array(size);
  for (let i = 0; i < size; i++) {
    const row = new Array(size);
    const vi = v[i];
    for (let j = 0; j < size; j++) {
      const value = target.Ainv[i][j] - (vi * v[j]) / denominator;
      if (!Number.isFinite(value)) throw rankingError('bandit: numerical failure in Sherman–Morrison update');
      row[j] = value;
    }
    updated[i] = row;
  }

  const b = target.b.slice();
  for (let i = 0; i < b.length; i++) {
    b[i] += weight * r * x[i];
    if (!Number.isFinite(b[i])) throw rankingError('bandit: numerical failure in reward accumulation');
  }

  target.Ainv = updated;
  target.b = b;
  target.n = (Number.isInteger(target.n) ? target.n : 0) + 1;
  return next;
}

/**
 * Compact, serializable summary of arm priors (pull counts) and learned
 * reward projections — useful for logging and for diffing two states.
 */
export function summarizeBandit(state) {
  assertState(state);
  const arms = {};
  let totalPulls = 0;
  for (const name of ARM_NAMES) {
    const arm = state.arms[name] || { n: 0, b: [] };
    const n = Number.isInteger(arm.n) ? arm.n : 0;
    totalPulls += n;
    arms[name] = {
      n,
      pulled: n > 0,
      bNorm: Number(Math.sqrt(dot(arm.b || [], arm.b || [])).toFixed(6)),
    };
  }
  return { version: state.version, dimension: state.dimension, totalPulls, arms };
}
