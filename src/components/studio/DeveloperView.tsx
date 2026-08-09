import { motion } from 'framer-motion';
import { Code, Copy, KeyRound, Webhook, FileJson, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';

const CodeBlock = ({ code, language = 'ts' }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-neem-700/40 bg-neem-950 text-sand-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neem-700/40 bg-neem-900/70 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold-400">
        <span>{language}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              /* noop */
            }
          }}
          className="inline-flex items-center gap-1.5 text-sand-200 hover:text-gold-300"
        >
          <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-4 py-3.5 text-[12.5px] font-mono leading-relaxed overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
};

const ENV_KEYS = [
  { key: 'OPENCODE_API_KEY', use: 'big-pickle polishing for captions, summaries, manuscripts' },
  { key: 'RAZORPAY_KEY_ID', use: 'Razorpay payouts disbursal (live bank transfers)' },
  { key: 'RAZORPAY_KEY_SECRET', use: 'Payouts partner signature' },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', use: 'Supabase project gateway (managed by arena)' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', use: 'Server-side admin role (managed by arena)' },
  { key: 'VITE_GOOGLE_CLIENT_ID', use: 'Google OAuth (managed by arena)' },
];

export default function DeveloperView() {
  const { user } = useAuth();
  const openThreads = useUI((s) => s.openThreads);

  return (
    <div className="px-4 lg:px-6 pt-4 pb-14 space-y-6">
      <section className="card-warm p-5">
        <div className="flex items-center gap-2">
          <Code size={16} className="text-saffron-600" />
          <h3 className="font-display font-semibold text-lg text-ink-900">Getting started</h3>
        </div>
        <p className="text-[12.5px] text-ink-500 mt-1">
          AyurVerse exposes a tidy REST surface under <code className="font-mono">/api/*</code>. Every route signs your requests with the session JWT and respects the row-level permissions baked into the database.
        </p>

        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <Stat label="Routes" value="11 serverless" />
          <Stat label="Tables" value="9 + auth" />
          <Stat label="Storage" value="public · 64MB" />
        </div>
      </section>

      <section>
        <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <FileJson size={16} className="text-ink-500" /> Publish a scroll
        </h3>
        <p className="text-[12.5px] text-ink-500 mt-0.5">A clean curl example for the publish endpoint.</p>
        <div className="mt-3"><CodeBlock language="bash" code={`curl -X POST https://$PROJECT/api/posts \\
  -H "Authorization: Bearer $JWT" \\
  -H "Content-Type: application/json" \\
  -d '{ "kind": "forge", "title": "Euler", "summary": "...", "content_md": "..." }'`} /></div>
      </section>

      <section>
        <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <Webhook size={16} className="text-ink-500" /> Subscribe to your live thread
        </h3>
        <p className="text-[12.5px] text-ink-500 mt-0.5">Supabase Realtime — one channel per active thread.</p>
        <div className="mt-3"><CodeBlock language="ts" code={`const channel = supabase.channel(\`messages-\${threadId}\`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (m) => console.log('new:', m.new))
  .on('broadcast', { event: 'typing' }, (p) => console.log('typing:', p.payload))
  .subscribe();`} /></div>
      </section>

      <section>
        <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <KeyRound size={16} className="text-ink-500" /> Secrets catalog
        </h3>
        <p className="text-[12.5px] text-ink-500 mt-0.5">What each secret unlocks in the loom.</p>
        <div className="mt-3 card-warm divide-y divide-sand-300/40">
          {ENV_KEYS.map((e) => (
            <div key={e.key} className="flex items-center gap-3 px-4 py-3">
              <code className="font-mono text-[12px] bg-sand-200/60 rounded-md px-2 py-0.5 text-ink-800">{e.key}</code>
              <p className="text-[12.5px] text-ink-600">{e.use}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card-warm p-5">
        <h3 className="font-display font-semibold text-ink-900">The weave you have already made</h3>
        <p className="text-[12.5px] text-ink-500 mt-1">
          Your session is {user?.email ?? '—'}. Watch the full conversation in Golden Threads.
        </p>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={openThreads}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm px-5 py-2.5"
        >
          <ExternalLink size={14} /> Open Golden Threads
        </motion.button>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-warm p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className="font-display font-semibold text-[16px] mt-0.5 text-ink-900">{value}</p>
    </div>
  );
}
