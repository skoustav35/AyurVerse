import { motion } from 'framer-motion';
import { Hash, Heart, Leaf, TrendingUp, UserPlus, Users, SlidersHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Avatar from '../common/Avatar';
import { RowSkeleton } from '../common/Skeletons';
import { apiFetch } from '../../lib/api';
import type { FeedPage } from '../../lib/types';
import { useFollows, useToggleFollow, useTopPosts, useWeavers } from '../../hooks/queries';
import { compact } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';

export default function SuggestedRail() {
  const { data: top } = useTopPosts();
  const { data: weavers, isLoading } = useWeavers();
  const openReader = useUI((s) => s.openReader);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const openFeedTuner = useUI((s) => s.openFeedTuner);
  const { user } = useAuth();
  const { data: followsData } = useFollows();
  const toggleFollow = useToggleFollow();
  const followingIds = new Set(followsData?.ids ?? []);

  const { data: feedMeta } = useQuery({
    queryKey: ['taste'],
    queryFn: () => apiFetch<FeedPage>('/api/feed?limit=1&offset=0'),
    staleTime: 300_000,
    retry: 0,
  });
  const taste = feedMeta?.meta?.taste ?? [];

  const tags = Array.from(new Set((top?.items ?? []).flatMap((p) => p.tags ?? []))).slice(0, 8);

  return (
    <div className="h-full overflow-y-auto px-5 py-6 space-y-8">
      <section>
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">
          <TrendingUp size={14} />
          Rising Lore
        </h3>
        <div className="mt-4 space-y-1">
          {top?.items.slice(0, 5).map((p, i) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => openReader(p.id)}
              className="w-full text-left flex items-center gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-sand-200/50 transition-colors group"
            >
              <span className="font-display italic text-sand-400 text-lg w-5 shrink-0 group-hover:text-gold-600 transition-colors">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink-800 truncate group-hover:text-neem-900">
                  {p.kind === 'forge' ? p.title : p.caption}
                </p>
                <p className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-2">
                  <span>@{p.author_username}</span>
                  <span className="inline-flex items-center gap-1">
                    <Heart size={10} /> {compact(p.likes_count)}
                  </span>
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">
            <Leaf size={14} />
            Your Taste Spectrum
          </h3>
          <button
            onClick={openFeedTuner}
            className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/40 bg-gold-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-gold-800 hover:bg-gold-500/20 transition-colors"
          >
            <SlidersHorizontal size={11} /> Tune
          </button>
        </div>
        <p className="text-[11px] text-ink-500 mt-2 leading-relaxed">
          Learned live from what you linger on, keep and search — or tune it by hand to pin and hush topics.
        </p>
        {taste.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {taste.map((t) => (
              <span
                key={t.tag}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-neem-800 bg-gradient-to-r from-saffron-500/15 to-gold-400/15 border border-gold-500/40 rounded-full px-2.5 py-1"
                title={`Affinity weight ${t.weight}`}
              >
                #{t.tag}
                <span className="text-[9px] text-gold-700 font-bold">{t.weight.toFixed(1)}</span>
              </span>
            ))}
          </div>
        ) : (
          <button
            onClick={openFeedTuner}
            className="mt-3 w-full rounded-xl border border-dashed border-sand-300 hover:border-gold-500/60 bg-parchment/60 px-3 py-2.5 text-left text-[12px] text-ink-600 hover:text-neem-800 transition-colors"
          >
            Your spectrum is still forming — <span className="font-semibold text-saffron-700">tune it by hand →</span>
          </button>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">
          <Users size={14} />
          Weavers to Follow
        </h3>
        <div className="mt-4 space-y-3">
          {isLoading && (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          )}
          {weavers
            ?.filter((w) => w.user_id !== user?.id)
            .slice(0, 5)
            .map((w) => (
              <div key={w.user_id} className="flex items-center gap-3">
                <button onClick={() => openUserProfile(w.user_id)} className="flex items-center gap-3 min-w-0 flex-1 text-left group">
                  <Avatar url={w.avatar_url} name={w.full_name} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink-900 truncate group-hover:text-saffron-700 transition-colors">
                      {w.full_name}
                    </p>
                    <p className="text-[11px] text-ink-500 truncate">@{w.username}</p>
                  </div>
                </button>
                <button
                  onClick={() => toggleFollow.mutate({ followeeId: w.user_id })}
                  disabled={toggleFollow.isPending}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    followingIds.has(w.user_id)
                      ? 'bg-neem-700/12 text-neem-800 border border-neem-600/30'
                      : 'bg-saffron-600 text-parchment hover:bg-saffron-700'
                  }`}
                >
                  {!followingIds.has(w.user_id) && <UserPlus size={11} />}
                  {followingIds.has(w.user_id) ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
        </div>
      </section>

      {tags.length > 0 && (
        <section>
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">
            <Hash size={14} />
            Living Tags
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[11px] font-medium text-neem-800 bg-neem-500/10 border border-neem-500/20 rounded-full px-2.5 py-1"
              >
                #{t}
              </span>
            ))}
          </div>
        </section>
      )}

      <footer className="pt-2 text-[10.5px] leading-relaxed text-ink-400">
        <p className="font-display italic text-ink-500">॥ where the feed becomes a garden ॥</p>
        <p className="mt-2">AyurVerse Atelier · crafted with leaf &amp; logic</p>
      </footer>
    </div>
  );
}
