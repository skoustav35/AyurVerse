import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Flower2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import StoriesRow from './StoriesRow';
import DinacharyaBanner from './DinacharyaBanner';
import PostCard from './PostCard';
import ForgeCard from './ForgeCard';
import { ForgeCardSkeleton, PostCardSkeleton } from '../common/Skeletons';
import Mandala from '../common/Mandala';
import { useFeed } from '../../hooks/queries';
import { ApiError } from '../../lib/api';
import type { Post } from '../../lib/types';
import { useUI } from '../../store/ui';

interface FeedViewProps {
  kind?: 'forge';
}

export default function FeedView({ kind }: FeedViewProps) {
  const query = useFeed(kind);
  const openFeedTuner = useUI((s) => s.openFeedTuner);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      },
      { rootMargin: '700px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query]);

  // Flatten pages and drop any repeated post ids so pagination can never
  // render the same card twice.
  const posts = useMemo(() => {
    const seen = new Set<number>();
    const out: Post[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page?.items ?? []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [query.data]);

  const error = query.error as Error | null;
  const errorStatus = error instanceof ApiError ? error.status : null;
  // 410 (expired) / 400 (invalid) cursor — offer a clean refresh instead of
  // silently appending a duplicate window.
  const cursorExpired = errorStatus === 410 || errorStatus === 400;
  const meta = query.data?.pages?.[0]?.meta;

  return (
    <div className="w-full max-w-[600px] mx-auto pb-10">
      {kind !== 'forge' && <StoriesRow />}
      {kind !== 'forge' && <DinacharyaBanner />}

      {kind !== 'forge' && (
        <div className="flex items-center justify-between gap-3 px-4 lg:px-2 pb-1">
          <p className="text-[11px] italic font-medium text-gold-700 min-w-0 truncate">
            {meta?.personalized ? (
              <>
                ◈ Woven to your taste
                {meta.taste.length > 0 && ` — ${meta.taste.slice(0, 3).map((t) => `#${t.tag}`).join(' ')}`}
              </>
            ) : meta?.coldStart ? (
              <>◈ Fresh start — your garden, growing</>
            ) : (
              <>◈ Your garden, growing</>
            )}
          </p>
          <button
            onClick={openFeedTuner}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-gold-800 hover:bg-gold-500/20 active:scale-95 transition-all"
          >
            <SlidersHorizontal size={12} /> Tune feed
          </button>
        </div>
      )}

      {kind === 'forge' && (
        <header className="px-4 lg:px-2 pt-6 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">The Forge</p>
          <h1 className="font-display text-[26px] lg:text-[30px] font-semibold text-ink-900 mt-1">
            Long-form scrolls of code, math &amp; lore
          </h1>
          <p className="text-sm text-ink-600 mt-1">
            Deep reading rendered with markdown, live code and mathematics — tap any scroll to open the focused reader.
          </p>
        </header>
      )}

      <div id="feed-list" className="flex flex-col gap-5 lg:gap-7 px-0 lg:px-2 mt-1 scroll-mt-24">
        {query.isLoading && (
          <>
            {kind === 'forge' ? (
              <>
                <ForgeCardSkeleton />
                <ForgeCardSkeleton />
                <ForgeCardSkeleton />
              </>
            ) : (
              <>
                <PostCardSkeleton />
                <PostCardSkeleton />
              </>
            )}
          </>
        )}

        {query.isError && (
          <div className="card-warm p-8 text-center">
            <Flower2 className="mx-auto text-terra-500" size={28} />
            <p className="font-display text-lg text-ink-900 mt-3">
              {cursorExpired ? 'This feed window expired' : 'The stream ran dry'}
            </p>
            <p className="text-sm text-ink-500 mt-1">
              {cursorExpired
                ? 'Refresh to weave a fresh page from the top — no duplicates, no stale cards.'
                : error?.message}
            </p>
            <button
              onClick={() => query.refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-neem-800 text-parchment px-5 py-2 text-sm font-medium hover:bg-neem-700 transition-colors"
            >
              <RefreshCw size={14} />
              {cursorExpired ? 'Refresh feed' : 'Draw water again'}
            </button>
          </div>
        )}

        {posts.map((post) =>
          post.kind === 'forge' ? <ForgeCard key={post.id} post={post} /> : <PostCard key={post.id} post={post} />,
        )}

        <div ref={sentinel} className="h-2" />

        {query.isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
              className="w-24 h-24 text-gold-500/70"
            >
              <Mandala className="w-full h-full" />
            </motion.div>
          </div>
        )}

        {!query.hasNextPage && !query.isLoading && posts.length > 0 && (
          <div className="text-center py-8">
            <Mandala className="w-20 h-20 mx-auto text-sand-400" petals={12} />
            <p className="font-display italic text-ink-500 mt-3">You have reached the still water.</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink-400 mt-1">॥ इति ॥</p>
          </div>
        )}
      </div>
    </div>
  );
}
