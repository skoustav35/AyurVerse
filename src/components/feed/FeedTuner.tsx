import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, X, Sparkles, VolumeX, Plus, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { FeedPage } from '../../lib/types';
import { usePreferences, useUpdatePreferences, useTopPosts } from '../../hooks/queries';
import { useUI } from '../../store/ui';
import Mandala from '../common/Mandala';

export default function FeedTuner() {
  const open = useUI((s) => s.feedTunerOpen);
  const close = useUI((s) => s.closeFeedTuner);
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const { data: top } = useTopPosts();

  const [boosted, setBoosted] = useState<string[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [entry, setEntry] = useState('');

  // learned taste to offer as quick suggestions
  const { data: feedMeta } = useQuery({
    queryKey: ['taste'],
    queryFn: () => apiFetch<FeedPage>('/api/feed?limit=1&offset=0'),
    staleTime: 300_000,
    retry: 0,
    enabled: open,
  });

  useEffect(() => {
    if (open && prefs) {
      setBoosted(prefs.boosted_tags ?? []);
      setMuted(prefs.muted_tags ?? []);
    }
  }, [open, prefs]);

  const suggestions = useMemo(() => {
    const learned = (feedMeta?.meta?.taste ?? []).map((t) => t.tag);
    const trending = Array.from(new Set((top?.items ?? []).flatMap((p) => p.tags ?? [])));
    return Array.from(new Set([...learned, ...trending]))
      .filter((t) => !boosted.includes(t) && !muted.includes(t))
      .slice(0, 12);
  }, [feedMeta, top, boosted, muted]);

  const clean = (s: string) => s.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9._-]+/g, '');

  const boost = (raw: string) => {
    const t = clean(raw);
    if (!t) return;
    setMuted((m) => m.filter((x) => x !== t));
    setBoosted((b) => (b.includes(t) ? b : [...b, t].slice(0, 30)));
  };
  const mute = (raw: string) => {
    const t = clean(raw);
    if (!t) return;
    setBoosted((b) => b.filter((x) => x !== t));
    setMuted((m) => (m.includes(t) ? m : [...m, t].slice(0, 30)));
  };
  const removeBoost = (t: string) => setBoosted((b) => b.filter((x) => x !== t));
  const removeMute = (t: string) => setMuted((m) => m.filter((x) => x !== t));

  const addFromEntry = () => {
    if (entry.trim()) {
      boost(entry);
      setEntry('');
    }
  };

  const save = () => update.mutate({ boosted_tags: boosted, muted_tags: muted }, { onSuccess: () => close() });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[80] bg-neem-950/55 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[85] grid place-items-end sm:place-items-center p-0 sm:p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="pointer-events-auto w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[86vh] flex flex-col bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
            >
              {/* header */}
              <div className="relative shrink-0 px-5 py-4 border-b border-sand-300/70 bg-[radial-gradient(120%_120%_at_50%_0%,#1b4230,#12291c)]">
                <Mandala className="absolute -right-10 -top-10 w-40 h-40 text-gold-400/15 animate-spin-slower pointer-events-none" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid place-items-center w-9 h-9 rounded-full bg-gold-500/15 ring-1 ring-gold-500/40">
                      <SlidersHorizontal size={16} className="text-gold-300" />
                    </span>
                    <div>
                      <p className="font-display font-semibold text-[16px] text-parchment leading-tight">Tune your feed</p>
                      <p className="text-[11px] text-sand-200/70 leading-tight">Pin what you love, hush what you don’t</p>
                    </div>
                  </div>
                  <button onClick={close} className="grid place-items-center w-8 h-8 rounded-full text-parchment/70 hover:bg-parchment/10" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">
                {/* add field */}
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Add a topic</label>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-xl border border-sand-300 bg-parchment px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-gold-400/60">
                      <span className="text-ink-400">#</span>
                      <input
                        value={entry}
                        onChange={(e) => setEntry(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addFromEntry()}
                        placeholder="ayurveda, poetry, code…"
                        className="flex-1 bg-transparent outline-none text-[14px] text-ink-900 placeholder:text-ink-400"
                      />
                    </div>
                    <button
                      onClick={addFromEntry}
                      className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-saffron-600 to-gold-500 text-parchment shrink-0 hover:brightness-105"
                      aria-label="Add topic to boosts"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                {/* boosted */}
                <div>
                  <h3 className="flex items-center gap-2 text-[12px] font-semibold text-neem-800">
                    <Sparkles size={14} className="text-saffron-600" /> Boosted — more of this
                  </h3>
                  {boosted.length === 0 ? (
                    <p className="text-[12px] text-ink-400 mt-2 italic">Nothing pinned yet — tap a suggestion below or add a topic.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {boosted.map((t) => (
                        <motion.button
                          key={t}
                          layout
                          onClick={() => removeBoost(t)}
                          className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-saffron-500/15 to-gold-400/15 border border-gold-500/40 text-neem-800 text-[12.5px] font-semibold px-3 py-1.5"
                        >
                          #{t}
                          <X size={12} className="text-ink-400 group-hover:text-terra-600" />
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>

                {/* muted */}
                <div>
                  <h3 className="flex items-center gap-2 text-[12px] font-semibold text-neem-800">
                    <VolumeX size={14} className="text-ink-500" /> Muted — less of this
                  </h3>
                  {muted.length === 0 ? (
                    <p className="text-[12px] text-ink-400 mt-2 italic">Nothing muted. Mute a topic to sink it to the bottom.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {muted.map((t) => (
                        <motion.button
                          key={t}
                          layout
                          onClick={() => removeMute(t)}
                          className="group inline-flex items-center gap-1.5 rounded-full bg-sand-200/80 border border-sand-300 text-ink-500 text-[12.5px] font-medium px-3 py-1.5 line-through"
                        >
                          #{t}
                          <X size={12} className="text-ink-400 group-hover:text-neem-700 no-underline" />
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>

                {/* suggestions */}
                {suggestions.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                      <TrendingUp size={13} /> From your taste &amp; trends
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {suggestions.map((t) => (
                        <div key={t} className="inline-flex items-center rounded-full border border-sand-300 bg-parchment overflow-hidden">
                          <button onClick={() => boost(t)} className="pl-3 pr-2 py-1.5 text-[12.5px] font-medium text-neem-800 hover:bg-saffron-500/10">
                            #{t}
                          </button>
                          <button onClick={() => mute(t)} title="Mute this" className="px-2 py-1.5 border-l border-sand-300 text-ink-400 hover:text-terra-600 hover:bg-sand-200/60">
                            <VolumeX size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* footer */}
              <div className="shrink-0 border-t border-sand-300/70 px-5 pt-3.5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] bg-parchment/80 backdrop-blur flex items-center gap-3">
                <button onClick={close} className="flex-1 rounded-xl border border-sand-300 py-3 text-[13.5px] font-semibold text-ink-700 hover:bg-sand-200/60">
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={save}
                  disabled={update.isPending}
                  className="flex-[1.6] rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-[13.5px] py-3 disabled:opacity-50 hover:brightness-105"
                >
                  {update.isPending ? 'Re-tuning…' : 'Save & re-tune feed'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
