/**
 * AyurVerse · local preview server (no logins required).
 *
 * Serves the production build from ./dist and executes the REAL Vercel
 * `/api/*` route modules (now Firestore-backed) in-process:
 *
 *   1. npx vite build
 *   2. node scripts/local-server.mjs [port]
 *
 * Open http://localhost:3000
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2]) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

async function handleApi(req, res, url) {
  const name = (url.pathname.slice('/api/'.length).split('/')[0] || 'index').split('?')[0];
  if (!/^[a-z0-9-]+$/i.test(name)) return send(res, 404, 'not found');
  const file = path.join(ROOT, 'api', `${name}.js`);
  if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: `no such api: ${name}` }), 'application/json');

  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }

  const mod = await import(`../api/${name}.js`);
  const handler = mod.default;
  if (typeof handler !== 'function') return send(res, 500, JSON.stringify({ error: 'no default handler' }), 'application/json');

  const rq = {
    method: req.method,
    headers: req.headers,
    query: Object.fromEntries(url.searchParams),
    body,
  };
  const rs = {
    statusCode: 200,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    getHeader(k) { return this._headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(o) {
      const payload = JSON.stringify(o);
      res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...this._headers });
      res.end(payload);
    },
    send(t) {
      res.writeHead(this.statusCode, { ...this._headers });
      res.end(t);
    },
    end(t) {
      res.writeHead(this.statusCode, { ...this._headers });
      res.end(t);
    },
  };
  try {
    await handler(rq, rs);
  } catch (err) {
    console.error(`[api/${name}]`, err);
    if (!res.writableEnded) send(res, 500, JSON.stringify({ error: err?.message || 'boom' }), 'application/json');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(DIST, rel.slice(1));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html'); // SPA fallback
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error('[static]', err);
    if (!res.writableEnded) send(res, 500, 'boom');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AyurVerse preview → http://localhost:${PORT}`);
});
