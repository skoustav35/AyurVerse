import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Avatar from '../common/Avatar';
import { apiFetch } from '../../lib/api';
import { compact } from '../../lib/format';
import type { Post } from '../../lib/types';
import { useFollows, useToggleFollow, useToggleLike, useToggleSave } from '../../hooks/queries';
import { cachedRatio, probeMediaRatio } from '../../lib/mediaRatio';
import { sendSignal } from '../../lib/signals';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import { useIsDesktop } from '../../hooks/useIsDesktop';

function useReels() {
  return useQuery({
    queryKey: ['reels'],
    staleTime: 60_000,
    queryFn: async () => {
      const data = await apiFetch<{ items: Post[] }>('/api/posts?kind=visual&limit=120');
      // only vertical (9:16) videos get to be reels
      const filtered: Post[] = [];
      for (const p of data.items) {
        if (p.media_type !== 'video' || !p.media_url) continue;
        const ratio = p.ratio ?? cachedRatio(p.media_url) ?? (await probeMediaRatio(p.media_url, 'video'));
        if (ratio && ratio < 1) {
          filtered.push({ ...p, ratio });
        } else if (!ratio) {
          // unknown → keep only if it looks vertical from the pre-empt
          filtered.push({ ...p, ratio: 0.5625 });
        }
      }
      return filtered.sort(
        (a, b) => b.likes_count + b.views_count / 22 - (a.likes_count + a.views_count / 22),
      );
    },
  });
}

function ReelCard({ post, active }: { post: Post; active: boolean }) {
  const { user } = useAuth();
  const openReader = useUI((s) => s.openReader);
  const openShare = useUI((s) => s.openShare);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const toggleFollow = useToggleFollow();
  const { data: followsData } = useFollows();

  const videoRef = useRef<HTMLVideoElement>(null);
  const dwellTimer = useRef<number | null>(null);
  const lastTap = useRef(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [muted, setMuted] = useState(true);
  const [splash, setSplash] = useState(0);

  const isSelf = user?.id === post.author_id;
  const following = (followsData?.ids ?? []).includes(post.author_id);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.play().catch(() => undefined);
      sendSignal({ type: 'view', post_id: post.id, tags: post.tags ?? [], kind: post.kind });
      dwellTimer.current = window.setTimeout(() => {
        sendSignal({ type: 'dwell', post_id: post.id, dwell_ms: 3800, tags: post.tags ?? [], kind: post.kind });
      }, 3800);
    } else {
      v.pause();
      if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    }
    return () => {
      if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, post.id]);

  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setSplash((s) => s + 1);
      if (!post.liked) toggleLike.mutate({ postId: post.id });
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      window.setTimeout(() => {
        if (Date.now() - now >= 290 && lastTap.current === now) {
          setPausedByUser((p) => {
            const next = !p;
            const v = videoRef.current;
            if (v) (next ? v.pause() : v.play().catch(() => undefined));
            return next;
          });
        }
      }, 300);
    }
  };

  return (
    <div className="h-full w-full snap-start relative flex items-center justify-center bg-neem-950">
      <div className="relative h-full w-full lg:h-[96%] lg:w-auto lg:aspect-[9/16] lg:rounded-[28px] overflow-hidden lg:border lg:border-gold-500/25 lg:shadow-[0_30px_90px_-30px_rgba(12,27,19,0.8)]">
        <video
          ref={videoRef}
          src={post.media_url ?? ''}
          onClick={tap}
          muted={muted}
          loop
          playsInline
          preload={active ? 'auto' : 'metadata'}
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-neem-950/80 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-neem-950/85 via-neem-950/35 to-transparent pointer-events-none" />

        <AnimatePresence>
          {splash > 0 && (
            <motion.div key={splash} className="absolute inset-0 grid place-items-center pointer-events-none" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.6, duration: 0.3 }}>
              <motion.div initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 1.15, 1], opacity: [0, 1, 1] }} transition={{ duration: 0.45, times: [0, 0.55, 1] }} className="drop-shadow-[0_8px_28px_rgba(244,196,48,0.55)]">
                <Heart size={96} className="fill-parchment text-parchment" strokeWidth={0} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pausedByUser && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="grid place-items-center w-16 h-16 rounded-full bg-neem-950/55 backdrop-blur">
                <Pause size={26} className="text-parchment" />
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute top-0 inset-x-0 flex items-center justify-end px-4 pt-4 pointer-events-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMuted((m) => !m);
            }}
            className="pointer-events-auto grid place-items-center w-9 h-9 rounded-full bg-neem-950/55 text-parchment backdrop-blur-md"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>

        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-1">
            <motion.button whileTap={{ scale: 0.7 }} onClick={() => toggleLike.mutate({ postId: post.id })} className="relative" aria-label="Like reel">
              <motion.span key={post.liked ? 'rl' : 'ru'} initial={{ scale: post.liked ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 620, damping: 14 }} className="block">
                <Heart size={30} strokeWidth={post.liked ? 0 : 2} className={`drop-shadow-lg ${post.liked ? 'fill-terra-500 text-terra-500' : 'text-parchment'}`} />
              </motion.span>
            </motion.button>
            <span className="text-[11px] font-semibold text-parchment drop-shadow">{compact(post.likes_count)}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <motion.button whileTap={{ scale: 0.7 }} onClick={() => openReader(post.id)} aria-label="Comments">
              <MessageCircle size={29} strokeWidth={2} className="text-parchment drop-shadow-lg -scale-x-100" />
            </motion.button>
            <span className="text-[11px] font-semibold text-parchment drop-shadow">{compact(post.comments_count)}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <motion.button whileTap={{ scale: 0.7, rotate: -10 }} onClick={() => openShare(post.id)} aria-label="Send reel">
              <Send size={27} strokeWidth={2} className="text-parchment drop-shadow-lg -rotate-12" />
            </motion.button>
          </div>

          <motion.button whileTap={{ scale: 0.7 }} onClick={() => toggleSave.mutate({ postId: post.id })} aria-label="Save reel">
            <Bookmark size={27} strokeWidth={post.saved ? 0 : 2} className={`drop-shadow-lg ${post.saved ? 'fill-gold-400 text-gold-400' : 'text-parchment'}`} />
          </motion.button>
        </div>

        <div className="absolute bottom-0 inset-x-0 pl-4 pr-20 pb-5 pointer-events-none">
          <div className="flex items-center gap-2.5">
            <button onClick={() => openUserProfile(post.author_id)} className="shrink-0 pointer-events-auto">
              <Avatar url={post.author_avatar} name={post.author_name} size={38} className="ring-2 ring-parchment/70" />
            </button>
            <button
              onClick={() => openUserProfile(post.author_id)}
              className="pointer-events-auto text-parchment text-[13.5px] font-semibold drop-shadow hover:text-gold-300 transition-colors"
            >
              @{post.author_username}
            </button>
            {!isSelf && (
              <button
                onClick={() => toggleFollow.mutate({ followeeId: post.author_id })}
                className={`pointer-events-auto ml-1 rounded-full px-3.5 py-1 text-[11px] font-bold backdrop-blur transition-colors ${
                  following ? 'border border-parchment/40 text-parchment/90' : 'bg-parchment text-neem-950 hover:bg-gold-300'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          {post.title && <p className="mt-2.5 text-[13.5px] font-semibold text-parchment leading-snug drop-shadow">{post.title}</p>}
          {post.caption && <p className="mt-1 text-[12.5px] text-parchment/85 leading-relaxed line-clamp-2 drop-shadow">{post.caption}</p>}
          <p className="mt-2 text-[10.5px] text-parchment/70 flex items-center gap-1.5">
            <Play size={10} className="fill-parchment/70" />
            {compact(post.views_count)} plays · original audio · {post.author_name.split(' ')[0].toLowerCase()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ReelsView() {
  const isDesktop = useIsDesktop();
  const { data: reels, isLoading, isError, refetch } = useReels();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveIndex(Number((e.target as HTMLElement).dataset.idx));
        });
      },
      { root: container, threshold: 0.62 },
    );
    container.querySelectorAll('[data-idx]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reels?.length]);

  const goTo = (dir: 1 | -1) => {
    const c = containerRef.current;
    if (!c) return;
    c.scrollBy({ top: dir * c.clientHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') goTo(1);
      if (e.key === 'ArrowUp') goTo(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  return (
    <div className="relative h-[calc(var(--vvh,100dvh)-118px)] lg:h-[calc(100vh-24px)] bg-neem-950 lg:rounded-[28px] lg:mx-2 overflow-hidden lg:border lg:border-neem-800">
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-4 pointer-events-none">
        <p className="font-display font-bold text-[20px] text-parchment drop-shadow-[0_2px_8px_rgba(12,27,19,0.9)] flex items-center gap-2 pointer-events-auto">
          <Clapperboard size={18} className="text-gold-400" /> Reels
        </p>
        <p className="text-[10px] uppercase tracking-[0.24em] text-parchment/60 drop-shadow">॥ ॥ ॥</p>
      </div>

      {isLoading && (
        <div className="h-full grid place-items-center">
          <div className="text-center">
            <Clapperboard className="mx-auto text-gold-500 animate-pulse" size={30} />
            <p className="font-display italic text-parchment/70 mt-3">Rolling the projector…</p>
          </div>
        </div>
      )}

      {isError && (
        <div className="h-full grid place-items-center text-center px-8">
          <div>
            <p className="font-display text-lg text-parchment">The projector lamp flickered out</p>
            <button onClick={() => refetch()} className="mt-4 rounded-full bg-saffron-600 text-parchment px-6 py-2 text-sm font-semibold">
              Relight it
            </button>
          </div>
        </div>
      )}

      {reels && reels.length === 0 && (
        <div className="h-full grid place-items-center px-8 text-center">
          <div>
            <Clapperboard className="mx-auto text-gold-500/60" size={28} />
            <p className="font-display italic text-parchment/70 mt-4">No vertical reels in the tin yet.</p>
            <p className="text-[12px] text-parchment/50 mt-2 max-w-xs mx-auto">Record a 9:16 clip from the Reels tab on your phone — it will weave in here.</p>
          </div>
        </div>
      )}

      {reels && reels.length > 0 && (
        <div ref={containerRef} className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar">
          {reels.map((post, i) => (
            <div key={post.id} data-idx={i} className="h-full snap-start">
              <ReelCard post={post} active={i === activeIndex} />
            </div>
          ))}
        </div>
      )}

      {isDesktop && reels && reels.length > 1 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 hidden lg:flex flex-col gap-3">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => goTo(-1)}
            className="grid place-items-center w-11 h-11 rounded-full bg-parchment/12 border border-parchment/25 text-parchment backdrop-blur hover:bg-parchment/25 transition-colors"
            aria-label="Previous reel"
          >
            <ChevronUp size={20} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => goTo(1)}
            className="grid place-items-center w-11 h-11 rounded-full bg-parchment/12 border border-parchment/25 text-parchment backdrop-blur hover:bg-parchment/25 transition-colors"
            aria-label="Next reel"
          >
            <ChevronDown size={20} />
          </motion.button>
          <p className="text-[9.5px] text-center text-parchment/50 font-medium tracking-wide">
            {activeIndex + 1}/{reels.length}
          </p>
        </div>
      )}
    </div>
  );
}
