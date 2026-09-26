import path from 'node:path'
import fs from 'node:fs'
import net from 'node:net'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const vendor = (name: string) => path.resolve(__dirname, 'vendor/node_modules', name)

/** True when something is accepting TCP connections on 127.0.0.1:port. */
function isPortOpen(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = (open: boolean) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

// Workspace node_modules is read-only in this sandbox; the project keeps its
// real dependency tree under vendor/node_modules (fetched from the lockfile).
// Bare imports from src/** are pinned there. Sibling packages resolve their
// own internals from within vendor/, which is a complete npm install.
const runtimeAliases: Record<string, string> = {
  'react/jsx-runtime': vendor('react/jsx-runtime'),
  'react/jsx-dev-runtime': vendor('react/jsx-dev-runtime'),
  'react-dom/client': vendor('react-dom/client'),
  react: vendor('react'),
  'react-dom': vendor('react-dom'),
  'react-router-dom': vendor('react-router-dom'),
  'react-router': vendor('react-router'),
  'framer-motion': vendor('framer-motion'),
  'lucide-react': vendor('lucide-react'),
  zustand: vendor('zustand'),
  '@tanstack/react-query': vendor('@tanstack/react-query'),
  '@supabase/supabase-js': vendor('@supabase/supabase-js'),
  'react-markdown': vendor('react-markdown'),
  'remark-gfm': vendor('remark-gfm'),
  'remark-math': vendor('remark-math'),
  'rehype-katex': vendor('rehype-katex'),
  'rehype-highlight': vendor('rehype-highlight'),
  katex: vendor('katex'),
}

/**
 * Dev-only: execute the real Vercel `/api/*` route modules in-process so the
 * Firestore/REST data layer stays connected while you keep Vite's HMR. Without
 * this, plain `vite dev` returns 404 for every /api call and the UI reports the
 * database as disconnected. Mirrors scripts/local-server.mjs.
 */
function apiDevMiddleware(): Plugin {
  return {
    name: 'ayurverse-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = (req.url || '').split('?')[0]
        if (rawUrl !== '/api' && !rawUrl.startsWith('/api/')) return next()
        const name = rawUrl.slice('/api/'.length).split('/')[0] || 'index'
        if (!/^[a-z0-9-]+$/i.test(name)) return next()
        const file = path.join(__dirname, 'api', `${name}.js`)
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: `no such api: ${name}` }))
        }
        try {
          let body: unknown
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            let raw = ''
            for await (const chunk of req) raw += chunk
            if (raw) {
              try { body = JSON.parse(raw) } catch { body = raw }
            }
          }
          // Bust ESM cache so route edits hot-reload in dev. Import via a file
          // URL (pure Node) so Vite doesn't statically analyze the template.
          const mod = await import(/* @vite-ignore */ `${pathToFileURL(file).href}?t=${Date.now()}`)
          const handler = mod.default
          if (typeof handler !== 'function') throw new Error('no default handler')
          const url = new URL(req.url || '/', 'http://localhost')
          const headers: Record<string, string> = {}
          const rq = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body }
          const rs = {
            statusCode: 200,
            setHeader(k: string, v: string) { headers[k] = v },
            getHeader(k: string) { return headers[k] },
            status(c: number) { this.statusCode = c; return this },
            json(o: unknown) {
              res.statusCode = this.statusCode
              for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(o))
            },
            send(t: unknown) {
              res.statusCode = this.statusCode
              for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
              res.end(t as never)
            },
            end(t?: unknown) {
              res.statusCode = this.statusCode
              for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
              res.end(t as never)
            },
          }
          await handler(rq, rs)
        } catch (err) {
          if (!res.headersSent) res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (err as Error)?.message || 'api error' }))
        }
      })
    },
  }
}

export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss(), apiDevMiddleware()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  // Firestore emulator lane: when the local emulator is actually listening,
  // point route modules at it (seeded demo data, no cloud quota). When it is
  // not running, leave the cloud REST lane untouched so plain `npm run dev`
  // still works.
  if (!process.env.FIRESTORE_EMULATOR_HOST && (await isPortOpen(8080))) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  }

  // The /api dev middleware runs route modules in Node (not the browser), so
  // `define` doesn't reach them — hydrate process.env from .env so db-client /
  // env.js resolve the Firestore keys and optional service credentials.
  const serverEnv = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(serverEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
    server: {
      // Bind both IPv4 and IPv6 so `localhost` resolves no matter which family
      // the browser picks (Vite otherwise listens on IPv6-only and IPv4 fails,
      // which also breaks the Google popup's return hop to 127.0.0.1).
      host: true,
      port: 5173,
      strictPort: false,
      watch: {
        ignored: ['**/api/**', '**/.local-cache*', '**/node_modules/**', '**/scratch/**'],
      },
      headers: {
        // Firebase Auth popups must keep the opener relationship so the popup
        // can post its credential back and `window.closed` can be polled.
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    preview: {
      host: true,
      port: 4173,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    resolve: {
      // Vendor aliases engage only when the sandbox vendor tree actually
      // exists; on a clean install (Vercel CI / a fresh clone) resolution is
      // entirely standard node_modules.
      alias: Object.entries(runtimeAliases)
        .filter(([, target]) => fs.existsSync(target))
        .map(([find, replacement]) => ({ find, replacement })),
    },
    optimizeDeps: {
      include: [...Object.keys(runtimeAliases)],
    },
  };
})
