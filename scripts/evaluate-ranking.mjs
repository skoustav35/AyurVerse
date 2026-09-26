#!/usr/bin/env node
/*
 * =====================================================================
 *  scripts/evaluate-ranking.mjs — offline ranking evaluation CLI
 *  ---------------------------------------------------------------------
 *  Usage:
 *    node scripts/evaluate-ranking.mjs [--input <fixture.json>] [--k 10]
 *                                      [--events <events.json>] [--output <file.json>]
 *
 *  Fixture shape:
 *    { "cases": [ { "id", "segment", "ranked": [ids], "relevance": { id: grade } } ] }
 *
 *  Defaults to the bundled synthetic fixture (tests/ranking/judgments.json).
 *  Reads only local files — no credentials, no network. Writes the JSON
 *  report to stdout unless --output is given.
 *
 *  --events accepts either an array of IPS rows
 *  ({reward, loggingPropensity, targetPropensity}) or an object with
 *  { rows: [...], users: [...] } for IPS and the fixed-horizon A/B report.
 * =====================================================================
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateRankings, estimateIPS, compareExperimentUsers } from '../api/lib/ranking/metrics.js';

const DEFAULT_FIXTURE = fileURLToPath(new URL('../tests/ranking/judgments.json', import.meta.url));

function fail(message) {
  process.stderr.write(`evaluate-ranking: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`could not read JSON at ${path}: ${error.message}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const k = args.k === undefined ? 10 : Number(args.k);
if (!Number.isInteger(k) || k <= 0) fail('--k must be a positive integer');

const inputPath = typeof args.input === 'string' ? args.input : DEFAULT_FIXTURE;
const fixture = readJson(inputPath);
if (!fixture || !Array.isArray(fixture.cases)) fail(`${inputPath} must contain a "cases" array`);

const report = {
  input: inputPath,
  k,
  synthetic: true,
  ranking: evaluateRankings(fixture.cases, k),
};

if (typeof args.events === 'string') {
  const events = readJson(args.events);
  const rows = Array.isArray(events) ? events : Array.isArray(events?.rows) ? events.rows : null;
  const users = Array.isArray(events?.users) ? events.users : null;
  const clip = Number.isFinite(Number(args.clip)) && Number(args.clip) > 0 ? Number(args.clip) : 20;
  if (rows) report.ips = estimateIPS(rows, { clip });
  if (users) report.ab = compareExperimentUsers(users);
  if (!rows && !users) fail('--events file must be an array of rows or contain "rows" / "users"');
}

const text = `${JSON.stringify(report, null, 2)}\n`;
if (typeof args.output === 'string') {
  writeFileSync(args.output, text);
  process.stdout.write(`wrote ${args.output}\n`);
} else {
  process.stdout.write(text);
}
