/**
 * AyurVerse · one-command local stack
 *
 *   npm run dev:local
 *
 * 1. boots the Firestore + Auth emulators (config: firebase.seed.json, open
 *    rules for seeding, data persisted to ./emulator-data across restarts)
 * 2. waits for 127.0.0.1:8080 / :9099 to accept connections
 * 3. seeds the demo dataset (scripts/reseed-firestore.mjs)
 * 4. starts Vite (which serves /api/* in-process and points the data client at
 *    the emulator)
 *
 * Ctrl-C tears down both children.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

// Java 21+ is required by the Firestore emulator; prefer any Adoptium install.
function withJava(env) {
  if (env.JAVA_HOME) return env;
  const roots = ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dir = fs.readdirSync(root).find((d) => /jre-2[1-9]|jdk-2[1-9]/.test(d));
    if (dir) {
      const home = path.join(root, dir);
      return { ...env, JAVA_HOME: home, PATH: `${path.join(home, 'bin')};${env.PATH || ''}` };
    }
  }
  return env;
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const sock = net.connect({ port, host });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`timed out waiting for ${host}:${port}`));
        else setTimeout(tick, 700);
      });
    };
    tick();
  });
}

function run(cmd, args, env) {
  const child = spawn(cmd, args, { cwd: ROOT, env, shell: isWin, stdio: 'inherit' });
  return child;
}

const children = [];
const shutdown = () => {
  for (const c of children) {
    try { c.kill(); } catch { /* already gone */ }
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const env = withJava(process.env);

console.log('\n▶ starting Firestore + Auth emulators…');
const emu = run('npx', [
  'firebase', 'emulators:start',
  '--only', 'firestore,auth',
  '--project', 'demo-ayurverse-local',
  '--config', 'firebase.seed.json',
  '--import', './emulator-data',
  '--export-on-exit',
], env);
children.push(emu);
emu.on('exit', (code) => {
  if (code) console.error(`\n emulators exited (${code})`);
  shutdown();
});

await waitForPort(8080);
await waitForPort(9099);
console.log('✔ emulators ready (firestore :8080, auth :9099, UI :4000)');

console.log('\n▶ seeding demo dataset…');
await new Promise((resolve) => {
  const seed = run('node', ['scripts/reseed-firestore.mjs'], { ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
  seed.on('exit', resolve);
});

console.log('\n▶ seeding demo identities…');
await new Promise((resolve) => {
  const seedAuth = run('node', ['scripts/seed-auth.mjs'], { ...env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
  seedAuth.on('exit', resolve);
});

console.log('\n▶ starting Vite…\n');
const vite = run('npx', ['vite'], { ...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
children.push(vite);
vite.on('exit', () => shutdown());