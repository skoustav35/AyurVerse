import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  FlaskConical,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserX,
  VolumeX,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { FeedPage } from '../../lib/types';
import { usePreferences, useResetRankingProfile, useTopPosts, useUpdatePreferences, type FeedPrefs } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import Mandala from '../common/Mandala';

type FeedMode = 'balanced' | 'following' | 'latest';

const MODES: { id: FeedMode; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Blend your taste with fresh finds' },
  { id: 'following', label: 'Following', hint: 'Lean toward channels you follow' },
  { id: 'latest', label: 'Latest', hint: 'Newest first, least tuned' },
];

const DIVERSITY_DEFAULT = 0.35;
const FRESHNESS_DEFAULT = 0.5;
const EXPLORATION_DEFAULT = 0.05;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export default function FeedTuner() {
  const open = useUI((s) => s.feedTunerOpen);
  const close = useUI((s) => s.closeFeedTuner);
  const { data: prefs, isLoading, isError, error, refetch } = usePreferences();
  const panelRef = useRef<HTMLDivElement>(null);

  // Accessible dialog: Escape to close, focus trap while open, focus restored on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusables = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null || el === document.activeElement)
        : [];
    (focusables()[0] ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        node?.focus();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !node?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="tuner-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[80] bg-neem-950/55 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[85] grid place-items-end sm:place-items-center p-0 sm:p-4 pointer-events-none">
            <motion.div
              key="tuner-panel"
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tuner-title"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="pointer-events-auto w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[86vh] flex flex-col bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)] outline-none"
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
                      <p id="tuner-title" className="font-display font-semibold text-[16px] text-parchment leading-tight">
                        Tune your feed
                      </p>
                      <p className="text-[11px] text-sand-200/70 leading-tight">Pin what you love, exclude what you don’t</p>
                    </div>
                  </div>
                  <button
                    onClick={close}
                    className="grid place-items-center w-8 h-8 rounded-full text-parchment/70 hover:bg-parchment/10 focus-visible:ring-2 focus-visible:ring-gold-300"
                    aria-label="Close feed tuner"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {prefs ? (
                <TunerForm prefs={prefs} onClose={close} />
              ) : (
                <TunerStatus loading={isLoading} isError={isError} error={error as Error | null} onRetry={() => refetch()} />
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function TunerStatus({
  loading,
  isError,
  error,
  onRetry,
}: {
  loading: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 grid place-items-center px-6 py-10 text-center bg-sand-100">
      {loading ? (
        <div>
          <Mandala className="w-16 h-16 mx-auto text-gold-500/70 animate-spin-slower" />
          <p className="text-[13px] text-ink-600 mt-3">Reading your preferences…</p>
        </div>
      ) : isError ? (
        <div className="max-w-xs">
          <AlertTriangle className="mx-auto text-terra-500" size={26} />
          <p className="font-display text-[17px] text-ink-900 mt-2">The tuner is out of reach</p>
          <p className="text-[12.5px] text-ink-500 mt-1">{error?.message ?? 'Please try again.'}</p>
          <button
            onClick={onRetry}
            className="mt-4 rounded-full bg-neem-800 text-parchment px-4 py-2 text-[13px] font-medium hover:bg-neem-700 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="max-w-xs">
          <SlidersHorizontal className="mx-auto text-ink-400" size={26} />
          <p className="font-display text-[17px] text-ink-900 mt-2">Sign in to tune</p>
          <p className="text-[12.5px] text-ink-500 mt-1">Personal tuning is available to signed-in weavers.</p>
        </div>
      )}
    </div>
  );
}

function TunerForm({ prefs, onClose }: { prefs: FeedPrefs; onClose: () => void }) {
  const update = useUpdatePreferences();
  const resetRanking = useResetRankingProfile();
  const pushToast = useUI((s) => s.pushToast);
  const { user } = useAuth();

  // Draft initialised once at mount — the dialog is only mounted while open, so
  // there is no setState-in-effect to sync props.
  const [mode, setMode] = useState<FeedMode>(prefs.feed_mode ?? 'balanced');
  const [diversity, setDiversity] = useState(() => clamp(prefs.diversity ?? DIVERSITY_DEFAULT, 0, 1));
  const [freshness, setFreshness] = useState(() => clamp(prefs.freshness ?? FRESHNESS_DEFAULT, 0, 1));
  const [exploration, setExploration] = useState(() => clamp(prefs.exploration ?? EXPLORATION_DEFAULT, 0, 0.2));
  const [personalization, setPersonalization] = useState(prefs.personalization ?? true);
  const [dinacharyaMode, setDinacharyaMode] = useState(prefs.dinacharya_mode ?? true);
  const [boosted, setBoosted] = useState<string[]>(prefs.boosted_tags ?? []);
  const [excluded, setExcluded] = useState<string[]>(prefs.muted_tags ?? []);
  const [excludedAuthors, setExcludedAuthors] = useState<string[]>(prefs.muted_authors ?? []);
  const [entry, setEntry] = useState('');
  const [authorEntry, setAuthorEntry] = useState('');

  // learned taste to offer as quick suggestions
  const { data: feedMeta } = useQuery({
    queryKey: ['taste', user?.id ?? null],
    queryFn: ({ signal }) => apiFetch<FeedPage>('/api/feed?limit=1', { signal }),
    staleTime: 300_000,
    retry: 0,
  });
  const { data: top } = useTopPosts();

  const suggestions = useMemo(() => {
    const learned = (feedMeta?.meta?.taste ?? []).map((t) => t.tag);
    const trending = Array.from(new Set((top?.items ?? []).flatMap((p) => p.tags ?? [])));
    return Array.from(new Set([...learned, ...trending]))
      .filter((t) => !boosted.includes(t) && !excluded.includes(t))
      .slice(0, 12);
  }, [feedMeta, top, boosted, excluded]);

  const clean = (s: string) => s.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9._-]+/g, '');
  const cleanAuthor = (s: string) => s.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '');

  const boost = (raw: string) => {
    const t = clean(raw);
    if (!t) return;
    setExcluded((m) => m.filter((x) => x !== t));
    setBoosted((b) => (b.includes(t) ? b : [...b, t].slice(0, 30)));
  };
  const exclude = (raw: string) => {
    const t = clean(raw);
    if (!t) return;
    setBoosted((b) => b.filter((x) => x !== t));
    setExcluded((m) => (m.includes(t) ? m : [...m, t].slice(0, 30)));
  };
  const addFromEntry = () => {
    if (entry.trim()) {
      boost(entry);
      setEntry('');
    }
  };
  const addAuthor = () => {
    const a = cleanAuthor(authorEntry);
    if (!a) return;
    setExcludedAuthors((list) => (list.includes(a) ? list : [...list, a].slice(0, 50)));
    setAuthorEntry('');
  };

  const save = () =>
    update.mutate(
      {
        feed_mode: mode,
        diversity,
        freshness,
        personalization,
        exploration,
        dinacharya_mode: dinacharyaMode,
        boosted_tags: boosted,
        muted_tags: excluded,
        muted_authors: excludedAuthors,
      },
      { onSuccess: () => onClose() },
    );

  const reset = () => {
    if (!window.confirm('Clear everything the feed has learned about you? This also resets ranking experiments.')) return;
    resetRanking.mutate();
  };

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4 bg-sand-100">
        {/* mode */}
        <Panel title="Feed mode" icon={<SlidersHorizontal size={14} className="text-saffron-600" />}>
          <div role="group" aria-label="Feed mode" className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={`rounded-xl border px-2.5 py-2.5 text-[12.5px] font-semibold transition-colors ${
                  mode === m.id
                    ? 'border-neem-800 bg-neem-800 text-parchment'
                    : 'border-sand-300 bg-parchment text-ink-700 hover:border-gold-500/60'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-500 mt-2">{MODES.find((m) => m.id === mode)?.hint}</p>
        </Panel>

        {/* tuning dials */}
        <Panel title="Ranking dials" icon={<Sparkles size={14} className="text-saffron-600" />}>
          <div className="space-y-4">
            <Dial
              id="diversity"
              label="Diversity"
              hint="Higher shows more variety across creators"
              value={diversity}
              min={0}
              max={1}
              step={0.05}
              onChange={setDiversity}
            />
            <Dial
              id="freshness"
              label="Freshness"
              hint="Higher favours newer posts"
              value={freshness}
              min={0}
              max={1}
              step={0.05}
              onChange={setFreshness}
            />
            <Dial
              id="exploration"
              label="Exploration"
              hint="How much the feed experiments beyond your taste"
              value={exploration}
              min={0}
              max={0.2}
              step={0.01}
              onChange={setExploration}
            />
          </div>
        </Panel>

        {/* circadian pacing */}
        <Panel title="Digital Dinacharya" icon={<Sparkles size={14} className="text-saffron-600" />}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12.5px] text-ink-600 leading-relaxed">
                Shape feed cues around local solar rhythm: Brahma Muhurta, Surya peak, Sandhya, and a gentle Nidra wind-down.
              </p>
              <p className="mt-1.5 text-[11px] font-medium text-gold-700">Enabled by default</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dinacharyaMode}
              aria-label="Dinacharya Mode"
              onClick={() => setDinacharyaMode((v) => !v)}
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
                dinacharyaMode ? 'bg-neem-700' : 'bg-sand-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-parchment shadow transition-transform ${
                  dinacharyaMode ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </Panel>

        {/* personalization */}
        <Panel title="Personalization" icon={<FlaskConical size={14} className="text-saffron-600" />}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[12.5px] text-ink-600 leading-relaxed">
              When on, your feed is ranked to your taste and may take part in ranking experiments. Turn it off to opt out —
              posts return to a simple, non-personalised order.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={personalization}
              aria-label="Personalized ranking"
              onClick={() => setPersonalization((v) => !v)}
              className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
                personalization ? 'bg-neem-700' : 'bg-sand-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-parchment shadow transition-transform ${
                  personalization ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </Panel>

        {/* add topic */}
        <Panel title="Add a topic" icon={<Plus size={14} className="text-saffron-600" />}>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-sand-300 bg-parchment px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-gold-400/60">
              <span className="text-ink-400">#</span>
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addFromEntry()}
                placeholder="ayurveda, poetry, code…"
                aria-label="Add a topic"
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

          <div className="mt-4">
            <h4 className="flex items-center gap-2 text-[12px] font-semibold text-neem-800">
              <Sparkles size={14} className="text-saffron-600" /> Boosted — more of this
            </h4>
            {boosted.length === 0 ? (
              <p className="text-[12px] text-ink-400 mt-2 italic">Nothing pinned yet — tap a suggestion or add a topic.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {boosted.map((t) => (
                  <button
                    key={t}
                    onClick={() => setBoosted((b) => b.filter((x) => x !== t))}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-saffron-500/15 to-gold-400/15 border border-gold-500/40 text-neem-800 text-[12.5px] font-semibold px-3 py-1.5"
                  >
                    #{t}
                    <X size={12} className="text-ink-400 group-hover:text-terra-600" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h4 className="flex items-center gap-2 text-[12px] font-semibold text-neem-800">
              <VolumeX size={14} className="text-ink-500" /> Excluded — never shown
            </h4>
            {excluded.length === 0 ? (
              <p className="text-[12px] text-ink-400 mt-2 italic">
                Nothing excluded. Excluded topics are kept out of your feed entirely.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {excluded.map((t) => (
                  <button
                    key={t}
                    onClick={() => setExcluded((m) => m.filter((x) => x !== t))}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-sand-200/80 border border-sand-300 text-ink-600 text-[12.5px] font-medium px-3 py-1.5"
                  >
                    #{t}
                    <X size={12} className="text-ink-400 group-hover:text-neem-700" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* excluded authors */}
        <Panel title="Excluded authors" icon={<UserX size={14} className="text-ink-500" />}>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl border border-sand-300 bg-parchment px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-gold-400/60">
              <span className="text-ink-400">@</span>
              <input
                value={authorEntry}
                onChange={(e) => setAuthorEntry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAuthor()}
                placeholder="username"
                aria-label="Exclude an author by username"
                className="flex-1 bg-transparent outline-none text-[14px] text-ink-900 placeholder:text-ink-400"
              />
            </div>
            <button
              onClick={addAuthor}
              className="grid place-items-center w-11 h-11 rounded-xl border border-sand-300 bg-parchment text-neem-800 shrink-0 hover:bg-sand-200/60"
              aria-label="Add author to excluded list"
            >
              <Plus size={18} />
            </button>
          </div>
          {excludedAuthors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {excludedAuthors.map((a) => (
                <button
                  key={a}
                  onClick={() => setExcludedAuthors((list) => list.filter((x) => x !== a))}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-sand-200/80 border border-sand-300 text-ink-600 text-[12.5px] font-medium px-3 py-1.5"
                >
                  @{a}
                  <X size={12} className="text-ink-400 group-hover:text-terra-600" />
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* suggestions */}
        {suggestions.length > 0 && (
          <Panel title="From your taste & trends" icon={<TrendingUp size={13} />}>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((t) => (
                <div key={t} className="inline-flex items-center rounded-full border border-sand-300 bg-parchment overflow-hidden">
                  <button onClick={() => boost(t)} className="pl-3 pr-2 py-1.5 text-[12.5px] font-medium text-neem-800 hover:bg-saffron-500/10">
                    #{t}
                  </button>
                  <button
                    onClick={() => exclude(t)}
                    title={`Exclude #${t}`}
                    aria-label={`Exclude #${t}`}
                    className="px-2 py-1.5 border-l border-sand-300 text-ink-400 hover:text-terra-600 hover:bg-sand-200/60"
                  >
                    <VolumeX size={12} />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* adaptive experiments */}
        <Panel title="Adaptive experiments" icon={<FlaskConical size={14} className="text-saffron-600" />}>
          <p className="text-[12.5px] text-ink-600 leading-relaxed">
            The atelier occasionally runs ranking experiments to learn what serves you better. You can opt out at any time by
            turning personalization off, or clear everything learned so far.
          </p>
          <button
            onClick={reset}
            disabled={resetRanking.isPending}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-terra-500/40 bg-terra-500/10 px-3.5 py-2 text-[12.5px] font-semibold text-terra-600 hover:bg-terra-500/20 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {resetRanking.isPending ? 'Clearing…' : 'Reset learned preferences'}
          </button>
        </Panel>
      </div>

      {/* footer */}
      <div className="shrink-0 border-t border-sand-300/70 px-5 pt-3.5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] bg-parchment/90 backdrop-blur flex items-center gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-sand-300 py-3 text-[13.5px] font-semibold text-ink-700 hover:bg-sand-200/60"
        >
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
    </>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-sand-300 bg-white/80 p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
        {icon}
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Dial({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-semibold text-ink-800">
          {label}
        </label>
        <span className="text-[11.5px] font-semibold text-ink-500 tabular-nums" aria-hidden="true">
          {pct}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={`${pct} percent`}
        className="mt-2 w-full accent-neem-700"
      />
      <p className="text-[11.5px] text-ink-500 mt-1">{hint}</p>
    </div>
  );
}
