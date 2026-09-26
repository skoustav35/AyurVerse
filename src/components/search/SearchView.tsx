import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Images, LibraryBig, Play, ScrollText, Search, Sparkles, TrendingUp, Users, UsersRound, WandSparkles, X, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { Post, Profile } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useTopPosts, useDiscoverGroups, type Group } from '../../hooks/queries';
import { sendSignal } from '../../lib/signals';
import { ForgeRow, ImageResultRow, ImageTile, PersonRow, VideoResultRow } from './Rows';
import GroupCard from '../groups/GroupCard';
import ExploreView from './ExploreView';
import { useUI } from '../../store/ui';

type Filter = 'all' | 'video' | 'image' | 'forge' | 'people' | 'groups';

const FILTERS: { id: Filter; label: string; icon: typeof Search }[] = [
  { id: 'all', label: 'All', icon: LibraryBig },
  { id: 'groups', label: 'Circles', icon: UsersRound },
  { id: 'video', label: 'Videos', icon: Play },
  { id: 'image', label: 'Images', icon: Images },
  { id: 'forge', label: 'Lore', icon: ScrollText },
  { id: 'people', label: 'People', icon: Users },
];

interface SearchMeta {
  terms: number | string[];
  ranked?: number;
  matchQuality: 'exact' | 'close' | 'suggested' | 'discovery' | 'none' | 'semantic';
  suggestion: string | null;
  query?: string;
  engine?: string;
  ms?: number;
  semantic?: { enabled?: boolean; degraded?: boolean };
  personalized?: boolean;
  feedbackEnabled?: boolean;
}

interface SearchResponse {
  posts: Post[];
  people: Profile[];
  groups?: Group[];
  meta?: SearchMeta;
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem('av_recent') || '[]');
  } catch {
    return [];
  }
}

export default function SearchView() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { data: top } = useTopPosts();
  const { data: discoverGroups } = useDiscoverGroups();
  const openCreateGroup = useUI((s) => s.openCreateGroup);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input.trim()), 240);
    return () => window.clearTimeout(t);
  }, [input]);

  const kindParam =
    filter === 'video' ? '&kind=video'
    : filter === 'image' ? '&kind=image'
    : filter === 'forge' ? '&kind=forge'
    : filter === 'people' ? '&kind=people'
    : filter === 'groups' ? '&kind=groups'
    : '';

  const { data: allWeavers, isLoading: loadingWeavers } = useQuery<Profile[]>({
    queryKey: ['profiles', 'directory'],
    enabled: filter === 'people' && !query,
    queryFn: () => apiFetch<Profile[]>('/api/profiles?limit=60'),
  });

  const { data, isFetching } = useQuery<SearchResponse>({
    // scoped per viewer so one account's private results never leak to another
    queryKey: ['search', user?.id ?? null, query, filter],
    enabled: query.length > 0,
    placeholderData: (prev) => prev,
    queryFn: ({ signal }) =>
      apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}${kindParam}`, { signal }),
  });

  useEffect(() => {
    if (query && data && (data.posts.length > 0 || data.people.length > 0)) {
      sendSignal({ type: 'search', query });
      setRecent((prev) => {
        const next = [query, ...prev.filter((r) => r !== query)].slice(0, 6);
        localStorage.setItem('av_recent', JSON.stringify(next));
        return next;
      });
    }
  }, [data, query]);

  const trendingTags = useMemo(
    () => Array.from(new Set((top?.items ?? []).flatMap((p) => p.tags ?? []))).slice(0, 10),
    [top],
  );

  const posts = data?.posts ?? [];
  const people = data?.people ?? [];
  const groups = data?.groups ?? [];
  const meta = data?.meta;
  const topId = posts.length > 0 ? posts[0].id : null;
  const showPeople = (filter === 'all' || filter === 'people') && people.length > 0;
  const showGroups = (filter === 'all' || filter === 'groups') && groups.length > 0;
  const showPostList = filter === 'all' || filter === 'video' || filter === 'image' || filter === 'forge';
  const hasPosts = showPostList && posts.length > 0;
  const hasResults = hasPosts || showPeople || showGroups;
  // Only real matches are shown — an empty result stays empty (no fallback feed).
  const noMatches = !!query && !isFetching && !hasResults;
  const approximate = meta?.matchQuality === 'close' || meta?.matchQuality === 'suggested';
  const semanticMatch = meta?.matchQuality === 'semantic';
  const semanticOn = !!meta?.semantic?.enabled && !meta?.semantic?.degraded;
  const resultCount = posts.length + (showPeople ? people.length : 0) + (showGroups ? groups.length : 0);

  const renderRow = (p: Post) =>
    p.kind === 'forge' ? (
      <ForgeRow key={p.id} post={p} q={query} highlight={p.id === topId} />
    ) : p.media_type === 'video' ? (
      <VideoResultRow key={p.id} post={p} q={query} highlight={p.id === topId} />
    ) : p.media_type === 'image' ? (
      <ImageResultRow key={p.id} post={p} q={query} highlight={p.id === topId} />
    ) : null;

  return (
    <div className="w-full max-w-[760px] mx-auto px-4 pt-4 lg:pt-8 pb-14">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700 flex items-center gap-2">
          The Library
          {data?.meta?.engine && (
            <span className="normal-case tracking-normal text-[9.5px] font-bold text-gold-700 bg-gold-400/15 border border-gold-400/50 rounded-full px-2 py-0.5">
              {data.meta.engine}
            </span>
          )}
          {semanticOn && (
            <span className="normal-case tracking-normal text-[9.5px] font-bold text-neem-800 bg-neem-500/12 border border-neem-500/40 rounded-full px-2 py-0.5">
              semantic
            </span>
          )}
        </p>
        <h1 className="font-display text-[26px] lg:text-[32px] font-semibold text-ink-900 mt-1">
          Ask, and the atelier answers
        </h1>
      </header>

      {/* Keystroke search field */}
      <div className="mt-5 relative">
        <div className="flex items-center gap-3 card-warm !rounded-2xl px-4 py-3.5 focus-within:ring-2 focus-within:ring-gold-400/60 focus-within:border-gold-400 transition-shadow">
          <Search size={19} className={isFetching ? 'text-gold-600 animate-pulse' : 'text-ink-400'} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'Try "Bengali poetry recitation", "transformer", "turmeric"…'}
            className="flex-1 bg-transparent outline-none text-[15px] text-ink-900 placeholder:text-ink-400"
            aria-label="Search the library"
          />
          {input && (
            <button
              onClick={() => {
                setInput('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-full text-ink-400 hover:bg-sand-200/70"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3.5 overflow-x-auto no-scrollbar pb-0.5">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold border transition-all ${
                  active
                    ? 'bg-gradient-to-r from-saffron-600 to-gold-600 text-parchment border-saffron-600 shadow-sm'
                    : 'bg-parchment text-ink-600 border-sand-300/80 hover:border-gold-500/60 hover:text-ink-900'
                }`}
              >
                <Icon size={13} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty state → the full Explore discovery surface */}
      {!query && (
        <div>
          <div className="flex items-center justify-between gap-2 mt-6">
            {recent.length > 0 ? (
              <div className="flex items-center justify-between gap-2 w-full overflow-hidden">
                <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
                  <History size={13} className="text-ink-400 shrink-0" />
                  {recent.map((r) => (
                    <button
                      key={r}
                      onClick={() => setInput(r)}
                      className="shrink-0 rounded-full bg-sand-200/70 hover:bg-sand-300/70 text-ink-700 text-[12px] font-medium px-3 py-1.5 transition-colors"
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem('av_recent');
                    setRecent([]);
                  }}
                  className="shrink-0 text-[11px] text-ink-400 hover:text-ink-700 underline underline-offset-2 ml-1"
                >
                  Clear
                </button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-saffron-700">
                <TrendingUp size={13} /> Explore the atelier
              </p>
            )}
            <button
              onClick={() => openCreateGroup('feed')}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-saffron-600 text-parchment text-[11.5px] font-semibold px-3 py-1.5 hover:bg-saffron-700 transition-colors"
            >
              <Plus size={12} /> Circle
            </button>
          </div>

          {filter === 'people' ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-saffron-700">
                  Weavers & Artisans ({allWeavers?.length || 0})
                </p>
                <span className="text-[11px] text-ink-400">Newest weavers first</span>
              </div>
              {loadingWeavers ? (
                <div className="py-12 flex justify-center">
                  <div className="w-6 h-6 border-2 border-saffron-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(allWeavers || []).map((p) => (
                    <PersonRow key={p.user_id} person={p} q="" />
                  ))}
                </div>
              )}
            </div>
          ) : filter === 'groups' ? (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-saffron-700">
                  Circles & Collectives ({discoverGroups?.groups?.length || 0})
                </p>
              </div>
              <div className="space-y-2.5">
                {(discoverGroups?.groups || []).map((g) => (
                  <GroupCard key={g.id} group={g} />
                ))}
              </div>
            </div>
          ) : (
            <ExploreView />
          )}
        </div>
      )}

      {/* Results */}
      {query && (
        <div className="mt-6">
          {/* did-you-mean chip */}
          {data && meta?.suggestion && meta.suggestion !== query && (
            <button
              onClick={() => setInput(meta.suggestion as string)}
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold-500/50 bg-gold-500/10 px-3.5 py-1.5 text-[12.5px] font-medium text-gold-800 hover:bg-gold-500/20 transition-colors"
            >
              <WandSparkles size={13} className="text-saffron-600" />
              Did you mean <span className="font-semibold">“{meta.suggestion}”</span>?
            </button>
          )}

          {/* relevance banner — approximate / semantic matches get a soft note */}
          {data && hasResults && (
            approximate ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-saffron-500/30 bg-saffron-500/[0.07] px-3.5 py-2.5">
                <Sparkles size={15} className="text-saffron-600 mt-0.5 shrink-0" />
                <p className="text-[12.5px] text-ink-700 leading-relaxed">
                  No exact match for <span className="font-semibold">“{query}”</span> — showing the{' '}
                  <span className="font-semibold text-saffron-700">closest results</span> the atelier could find.
                </p>
              </div>
            ) : semanticMatch ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-neem-500/30 bg-neem-500/[0.07] px-3.5 py-2.5">
                <Sparkles size={15} className="text-neem-700 mt-0.5 shrink-0" />
                <p className="text-[12.5px] text-ink-700 leading-relaxed">
                  Showing semantically related matches for <span className="font-semibold">“{query}”</span>.
                </p>
              </div>
            ) : (
              <p className="mb-4 text-[11.5px] font-medium text-ink-400">
                {resultCount} result{resultCount === 1 ? '' : 's'} · ranked by relevance × engagement × freshness
              </p>
            )
          )}

          {noMatches ? (
            <div className="card-warm !rounded-2xl border border-sand-300/60 p-8 text-center shadow-warm">
              <div className="w-12 h-12 rounded-full bg-saffron-500/10 text-saffron-600 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={20} />
              </div>
              <p className="text-[15px] font-semibold text-ink-900">
                No {filter === 'all' ? 'results' : FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} for{' '}
                <span className="text-saffron-700">“{query}”</span>
              </p>
              <p className="text-[13px] text-ink-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                Try a different filter or search a broader concept{meta?.suggestion && meta.suggestion !== query ? (
                  <>
                    {' '}— or explore <button onClick={() => setInput(meta.suggestion as string)} className="font-semibold text-saffron-700 hover:underline">“{meta.suggestion}”</button>
                  </>
                ) : (
                  '.'
                )}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {filter !== 'all' && (
                  <button
                    onClick={() => setFilter('all')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sand-200/80 hover:bg-sand-300 text-ink-700 text-xs font-semibold px-3.5 py-1.5 transition-colors"
                  >
                    Search all categories
                  </button>
                )}
                <button
                  onClick={() => setInput('')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-saffron-600/10 hover:bg-saffron-600/20 text-saffron-700 text-xs font-semibold px-3.5 py-1.5 transition-colors"
                >
                  Clear search query
                </button>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={`${query}-${filter}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                {showGroups && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Circles</h3>
                    <div className="space-y-2.5">
                      {groups.map((g) => (
                        <GroupCard key={g.id} group={g} />
                      ))}
                    </div>
                  </section>
                )}

                {showPeople && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">People</h3>
                    <div className="space-y-2.5">
                      {people.map((p) => (
                        <PersonRow key={p.user_id} person={p} q={query} />
                      ))}
                    </div>
                  </section>
                )}

                {hasPosts && (
                  <section>
                    {filter === 'all' ? (
                      // Server-ranked order is preserved across media types.
                      <div className="space-y-4">{posts.map(renderRow)}</div>
                    ) : filter === 'image' ? (
                      <div className="grid grid-cols-3 gap-2">
                        {posts.map((p) => (
                          <ImageTile key={p.id} post={p} highlight={p.id === topId} />
                        ))}
                      </div>
                    ) : filter === 'video' ? (
                      <div className="space-y-4">
                        {posts.map((p) => (
                          <VideoResultRow key={p.id} post={p} q={query} highlight={p.id === topId} />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {posts.map((p) => (
                          <ForgeRow key={p.id} post={p} q={query} highlight={p.id === topId} />
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
}
