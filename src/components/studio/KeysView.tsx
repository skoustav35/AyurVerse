import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clipboard, KeyRound, Loader2, Plus, ShieldCheck, Terminal, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useUI } from '../../store/ui';

interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function niceTime(iso: string | null) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export default function KeysView() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  const [naming, setNaming] = useState('');
  const [minting, setMinting] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [freshName, setFreshName] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
  const [revoking, setRevoking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<{ keys: ApiKey[] }>('/api/tokens'),
    refetchInterval: 30_000,
  });
  const live = (data?.keys ?? []).filter((k) => !k.revoked_at);
  const dead = (data?.keys ?? []).filter((k) => k.revoked_at);

  const mint = async () => {
    if (!naming.trim()) {
      pushToast('Name the key — its future self will thank you', 'error');
      return;
    }
    setMinting(true);
    try {
      const res = await apiFetch<{ key: ApiKey; token: string }>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: naming.trim() }),
      });
      setFreshToken(res.token);
      setFreshName(res.key.name);
      setNaming('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setMinting(false);
    }
  };

  const revoke = async (id: number) => {
    setRevoking(true);
    try {
      await apiFetch('/api/tokens', { method: 'PUT', body: JSON.stringify({ id }) });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setConfirmRevoke(null);
      pushToast('Key retired — it answers to nothing now');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  const copyFresh = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      pushToast('Copy failed — select it by hand', 'error');
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="mt-4 space-y-4">
      {/* explainer */}
      <div className="card-warm p-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gold-400/15 text-gold-700 shrink-0">
            <ShieldCheck size={17} />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">Access keys let outside code act exactly as you.</p>
            <p className="text-[12.5px] text-ink-500 leading-relaxed mt-1">
              Hand a key to a script, a bot, or a sibling atelier and it may publish scrolls, write and reply in
              threads, found and join circles, save and appreciate — everything this account can do, nothing more.
              Keys never mint keys, and keys never touch billing.
            </p>
          </div>
        </div>
      </div>

      {/* mint */}
      <div className="card-warm p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2.5">Mint a key</p>
        <div className="flex gap-2">
          <input
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mint()}
            placeholder="e.g. society-runner, portal-bridge…"
            maxLength={60}
            className="flex-1 min-w-0 rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
          />
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={mint}
            disabled={minting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment text-[13px] font-semibold px-4 py-2.5 disabled:opacity-50"
          >
            {minting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Mint
          </motion.button>
        </div>
      </div>

      {/* keys list */}
      <div className="card-warm p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">Your keys</p>
        {isLoading && <div className="h-12 rounded-xl bg-sand-200/70 animate-pulse" />}
        {!isLoading && live.length === 0 && (
          <p className="text-center font-display italic text-[13.5px] text-ink-500 py-5">
            No key on your ring yet — mint one above.
          </p>
        )}
        <div className="space-y-2">
          {live.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-xl border border-sand-300/80 bg-parchment px-3.5 py-2.5">
              <KeyRound size={15} className="text-saffron-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink-900 truncate">{k.name}</p>
                <p className="text-[11px] text-ink-400 font-mono truncate">{k.prefix}…</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10.5px] text-ink-400">used {niceTime(k.last_used_at)}</p>
                <p className="text-[10.5px] text-ink-300">minted {niceTime(k.created_at)}</p>
              </div>
              <button
                onClick={() => (confirmRevoke === k.id ? revoke(k.id) : setConfirmRevoke(k.id))}
                disabled={revoking}
                title={confirmRevoke === k.id ? 'Tap again to retire' : 'Retire key'}
                className={`shrink-0 grid place-items-center w-8 h-8 rounded-full transition-colors ${
                  confirmRevoke === k.id ? 'bg-terra-500 text-parchment' : 'text-ink-400 hover:text-terra-600 hover:bg-terra-500/10'
                }`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {dead.length > 0 && (
          <p className="mt-2.5 text-[10.5px] text-ink-300">
            {dead.length} retired {dead.length === 1 ? 'key rests' : 'keys rest'} in the crypt.
          </p>
        )}
      </div>

      {/* usage example */}
      <div className="card-warm p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2.5 flex items-center gap-2">
          <Terminal size={12} className="text-neem-700" /> Speak as yourself, from anywhere
        </p>
        <div className="rounded-xl bg-neem-950 px-4 py-3 overflow-x-auto">
          <pre className="font-mono text-[11.5px] leading-relaxed text-parchment/90">{`curl ${baseUrl}/api/threads \\
  -H "Authorization: Bearer av_live_…"`}</pre>
        </div>
        <p className="text-[11px] text-ink-400 mt-2">Every <code className="font-mono text-saffron-700">/api/*</code> pipeline accepts the header — threads, circles, posts, saves, follows, your card.</p>
      </div>

      {/* one-time reveal */}
      <AnimatePresence>
        {freshToken && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[85] bg-neem-950/55 backdrop-blur-sm"
              onClick={() => setFreshToken(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="fixed left-1/2 top-1/2 z-[90] w-[330px] -translate-x-1/2 -translate-y-1/2 card-warm !rounded-3xl p-6 shadow-warm"
            >
              <button onClick={() => setFreshToken(null)} className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-ink-400 hover:bg-sand-200/70" aria-label="Close">
                <X size={15} />
              </button>
              <div className="grid place-items-center w-11 h-11 mx-auto rounded-2xl bg-gradient-to-br from-saffron-600 to-gold-500 text-parchment">
                <KeyRound size={19} />
              </div>
              <p className="text-center font-display font-semibold text-[17px] text-neem-950 mt-3">“{freshName}” is born</p>
              <p className="text-center text-[12px] text-ink-500 mt-1 leading-relaxed">
                This is the only time the whole key shows itself. Guard it like a house key.
              </p>
              <button
                onClick={copyFresh}
                className="mt-4 w-full flex items-center gap-2.5 rounded-xl bg-neem-950 px-4 py-3 text-left hover:brightness-110 transition-all"
              >
                <code className="flex-1 min-w-0 font-mono text-[11px] text-gold-300 truncate">{freshToken}</code>
                {copied ? <Check size={15} className="text-neem-400 shrink-0" /> : <Clipboard size={15} className="text-parchment/70 shrink-0" />}
              </button>
              <p className="mt-1.5 text-center text-[10.5px] text-terra-600 font-medium">Shown once. Never stored plain. Never recoverable.</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
