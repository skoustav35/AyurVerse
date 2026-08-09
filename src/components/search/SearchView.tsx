import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Images, LibraryBig, Play, ScrollText, Search, SearchX, TrendingUp, Users, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { Post, Profile } from '../../lib/types';
import { useTopPosts } from '../../hooks/queries';
import { sendSignal } from '../../lib/signals';
import { ForgeRow, ImageTile, PersonRow, VideoResultRow } from './Rows';
import Mandala from '../common/Mandala';

type Filter = 'all' | 'video' | 'image' | 'forge' | 'people';

const FILTERS: { id: Filter; label: string; icon: typeof Search }[] = [
  { id: 'all', label: 'All', icon: LibraryBig },
  { id: 'video', label: 'Videos', icon: Play },
  { id: 'image', label: 'Images', icon: Images },
  { id: 'forge', label: 'Lore', icon: ScrollText },
  { id: 'people', label: 'People', icon: Users },
];

interface SearchResponse {
  posts: Post[];
  people: Profile[];
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
  const { data: top } = useTopPosts();

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input.trim()), 240);
    return () => window.clearTimeout(t);
  }, [input]);

  const kindParam = filter === 'video' ? '&kind=video' : filter === 'image' ? '&kind=image' : filter === 'forge' ? '&kind=forge' : '';

  const { data, isFetching } = useQuery({
    queryKey: ['search', query, filter],
    enabled: query.length > 0,
    placeholderData: (prev) => prev,
    queryFn: () => apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}${kindParam}`),
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
  const videos = posts.filter((p) => p.media_type === 'video');
  const images = posts.filter((p) => p.media_type === 'image');
  const lore = posts.filter((p) => p.kind === 'forge');
  const topId = posts.length > 0 ? posts[0].id : null;
  const showPeople = (filter === 'all' || filter === 'people') && people.length > 0;
  const empty = !isFetching && query && posts.length === 0 && (filter === 'people' ? true : people.length === 0);

  return (
    <div className="w-full max-w-[760px] mx-auto px-4 pt-4 lg:pt-8 pb-14">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">The Library</p>
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
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold border transition-colors ${
                  active
                    ? 'bg-neem-800 text-parchment border-neem-800'
                    : 'bg-parchment text-ink-600 border-sand-300 hover:border-gold-500/60 hover:text-neem-800'
                }`}
              >
                <Icon size={13} />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty state / discovery */}
      {!query && (
        <div className="mt-8 space-y-8">
          {recent.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                <History size={13} /> Recent wanderings
              </h3>
              <div className="flex flex-wrap gap-2 mt-3">
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => setInput(r)}
                    className="rounded-full bg-sand-200/70 hover:bg-sand-300/70 text-ink-700 text-[12.5px] font-medium px-3.5 py-1.5 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}

          {trendingTags.length > 0 && (
            <section>
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                <TrendingUp size={13} /> Living tags
              </h3>
              <div className="flex flex-wrap gap-2 mt-3">
                {trendingTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setInput(t)}
                    className="rounded-full bg-neem-500/10 border border-neem-500/20 hover:border-gold-500/60 text-neem-800 text-[12.5px] font-medium px-3.5 py-1.5 transition-colors"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="relative overflow-hidden card-warm p-8 text-center">
            <Mandala className="absolute -right-14 -bottom-14 w-52 h-52 text-gold-500/15 animate-spin-slower" />
            <p className="font-display italic text-[17px] text-ink-600 leading-relaxed relative z-10">
              “Search for a recitation, and find the verse beside the voice —<br className="hidden sm:block" />
              the library binds motion, image and manuscript in one breath.”
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {query && (
        <div className="mt-6">
          {!empty && data && (
            <p className="mb-4 text-[11.5px] font-medium text-ink-400">
              {posts.length + (showPeople ? people.length : 0)} results · ranked by relevance × engagement × freshness
            </p>
          )}
          {empty ? (
            <div className="text-center py-14">
              <SearchX className="mx-auto text-sand-400" size={34} />
              <p className="font-display text-lg text-ink-900 mt-4">No lore answered to “{query}”</p>
              <p className="text-sm text-ink-500 mt-1">Try “poetry”, “attention”, “ayurveda”, “river”…</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={`${query}-${filter}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
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

                {(filter === 'all' || filter === 'video') && videos.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Videos</h3>
                    <div className="space-y-4">
                      {videos.map((p) => (
                        <VideoResultRow key={p.id} post={p} q={query} highlight={p.id === topId} />
                      ))}
                    </div>
                  </section>
                )}

                {(filter === 'all' || filter === 'forge') && lore.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Lore &amp; writing</h3>
                    <div className="space-y-2.5">
                      {lore.map((p) => (
                        <ForgeRow key={p.id} post={p} q={query} highlight={p.id === topId} />
                      ))}
                    </div>
                  </section>
                )}

                {(filter === 'all' || filter === 'image') && images.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Images</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {images.map((p) => (
                        <ImageTile key={p.id} post={p} highlight={p.id === topId} />
                      ))}
                    </div>
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
