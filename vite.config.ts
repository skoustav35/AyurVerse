import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const vendor = (name: string) => path.resolve(__dirname, 'vendor/node_modules', name)

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

export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss()];
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

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
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
