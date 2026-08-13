import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Heart,
  MessageCircle,
  Music2,
  Play,
  Plus,
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
import { sendSignal } from '../../lib/signals';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import { useIsDesktop } from '../../hooks/useIsDesktop';

function useReels(focusId: number | null) {
  return useQuery({
    queryKey: ['reels', focusId ?? 'all'],
    staleTime: 60_000,
    queryFn: async () => {
      // server-side video feed, already ranked — no fragile client probing
      const data = await apiFetch<{ items: Post[] }>('/api/reels?limit=80');
      const deck = (data.items || []).filter((p) => p.media_type === 'video' && p.media_url);

      // the tapped-open clip opens first so the jump from the feed is instant
      if (focusId != null) {
        const inDeck = deck.find((p) => p.id === focusId);
        if (inDeck) {
          return [inDeck, ...deck.filter((p) => p.id !== focusId)];
        }
        try {
          const one = await apiFetch<Post>(`/api/posts?id=${focusId}`);
          if (one && one.media_type === 'video' && one.media_url) {
            return [one, ...deck];
          }
        } catch {
          /* fall back to the deck */
        }
      }
      return deck;
    },
  });
}

/* A count that rolls when it changes — likes/comments feel alive. */
function RollingCount({ value }: { value: number }) {
  return (
    <div className="h-[15px] overflow-hidden grid">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="row-start-1 col-start-1 block text-[11px] font-semibold text-parchment drop-shadow tabular-nums text-center"
        >
          {compact(value)}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* Radiating spark ring that fires each time a reel is freshly liked. */
function LikeSparks({ trigger }: { trigger: number }) {
  if (!trigger) return null;
  const dots = Array.from({ length: 8 });
  return (
    <span className="absolute inset-0 grid place-items-center pointer-events-none" aria-hidden>
      {dots.map((_, i) => {
        const angle = (i / dots.length) * Math.PI * 2;
        return (
          <motion.span
            key={`${trigger}-${i}`}
            className="absolute w-1.5 h-1.5 rounded-full bg-terra-400"
            initial={{ x: 0, y: 0, scale: 1, opacity: 0.9 }}
            animate={{ x: Math.cos(angle) * 28, y: Math.sin(angle) * 28, scale: 0.2, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}

/* One glassy, springy rail action — the shared shell for like/comment/share/save. */
function RailAction({
  onClick,
  label,
  count,
  children,
  extra,
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  count?: number;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        whileTap={{ scale: 0.74 }}
        whileHover={{ scale: 1.09 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        onClick={onClick}
        aria-label={label}
        className="relative grid place-items-center w-12 h-12 rounded-full bg-neem-950/30 border border-parchment/10 backdrop-blur-md shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6)] hover:bg-neem-950/45 transition-colors pointer-events-auto"
      >
        {children}
        {extra}
      </motion.button>
      {count !== undefined && <RollingCount value={count} />}
    </div>
  );
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
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const dwellTimer = useRef<number | null>(null);
  const lastTap = useRef(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [muted, setMuted] = useState(true);
  const [splash, setSplash] = useState(0);
  const [likeSpark, setLikeSpark] = useState(0);
  const [saveGlow, setSaveGlow] = useState(0);
  const [progress, setProgress] = useState(0);

  const isSelf = user?.id === post.author_id;
  const following = (followsData?.ids ?? []).includes(post.author_id);

  // Local, authoritative like/save state so the UI reacts instantly and can
  // never be visually reverted by cache-key timing. Server truth (via props)
  // is folded back in whenever the post object changes.
  const [liked, setLiked] = useState(!!post.liked);
  const [likes, setLikes] = useState(post.likes_count);
  const [saved, setSaved] = useState(!!post.saved);
  const [saves, setSaves] = useState(post.saves_count);

  useEffect(() => {
    setLiked(!!post.liked);
    setLikes(post.likes_count);
    setSaved(!!post.saved);
    setSaves(post.saves_count);
  }, [post.liked, post.likes_count, post.saved, post.saves_count]);

  useEffect(() => {
    const v = videoRef.current;
    const bg = bgVideoRef.current;
    if (!v) return;
    if (active) {
      v.play().catch(() => undefined);
      bg?.play().catch(() => undefined);
      sendSignal({ type: 'view', post_id: post.id, tags: post.tags ?? [], kind: post.kind });
      dwellTimer.current = window.setTimeout(() => {
        sendSignal({ type: 'dwell', post_id: post.id, dwell_ms: 3800, tags: post.tags ?? [], kind: post.kind });
      }, 3800);
    } else {
      v.pause();
      bg?.pause();
      if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    }
    return () => {
      if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, post.id]);

  const likeReel = () => {
    const willLike = !liked;
    if (willLike) setLikeSpark((s) => s + 1); // spark only on the up-beat
    // optimistic local flip — instant red, instant count
    setLiked(willLike);
    setLikes((n) => Math.max(0, n + (willLike ? 1 : -1)));
    toggleLike.mutate({ postId: post.id });
  };

  const saveReel = () => {
    const willSave = !saved;
    if (willSave) setSaveGlow((s) => s + 1);
    setSaved(willSave);
    setSaves((n) => Math.max(0, n + (willSave ? 1 : -1)));
    toggleSave.mutate({ postId: post.id });
  };

  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setSplash((s) => s + 1);
      if (!liked) likeReel();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      window.setTimeout(() => {
        if (Date.now() - now >= 290 && lastTap.current === now) {
          setPausedByUser((p) => {
            const next = !p;
            const v = videoRef.current;
            const bg = bgVideoRef.current;
            if (v) (next ? v.pause() : v.play().catch(() => undefined));
            if (bg) (next ? bg.pause() : bg.play().catch(() => undefined));
            return next;
          });
        }
      }, 300);
    }
  };

  return (
    <div className="h-full w-full snap-start relative flex items-center justify-center bg-neem-950">
      <div className="relative h-full w-full lg:h-[96%] lg:w-auto lg:aspect-[9/16] lg:rounded-[28px] overflow-hidden lg:border lg:border-gold-500/25 lg:shadow-[0_30px_90px_-30px_rgba(12,27,19,0.8)]">
        {/* blurred echo fills the bars so every reel shows its true frame full-screen */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <video
            ref={bgVideoRef}
            src={post.media_url ?? ''}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover scale-110 blur-2xl opacity-40"
          />
          <div className="absolute inset-0 bg-neem-950/35" />
        </div>
        <video
          ref={videoRef}
          src={post.media_url ?? ''}
          onClick={tap}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          muted={muted}
          loop
          playsInline
          preload={active ? 'auto' : 'metadata'}
          className="absolute inset-0 z-[1] w-full h-full object-contain"
        />

        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-neem-950/80 to-transparent pointer-events-none z-[2]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-neem-950/90 via-neem-950/35 to-transparent pointer-events-none z-[2]" />

        {/* double-tap heart splash with a little radiating shimmer */}
        <AnimatePresence>
          {splash > 0 && (
            <motion.div
              key={splash}
              className="absolute inset-0 grid place-items-center pointer-events-none z-[5]"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.65, duration: 0.35 }}
            >
              <motion.div
                initial={{ scale: 0.2, opacity: 0, rotate: -12 }}
                animate={{ scale: [0.2, 1.2, 1], opacity: [0, 1, 1], rotate: 0 }}
                transition={{ duration: 0.5, times: [0, 0.55, 1], ease: 'easeOut' }}
                className="relative drop-shadow-[0_8px_32px_rgba(214,89,50,0.6)]"
              >
                <Heart size={104} className="fill-terra-500 text-terra-500" strokeWidth={0} />
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-parchment/60"
                  initial={{ scale: 0.4, opacity: 0.7 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* tap-to-play affordance when the viewer paused */}
        <AnimatePresence>
          {pausedByUser && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="absolute inset-0 grid place-items-center pointer-events-none z-[5]"
            >
              <span className="grid place-items-center w-20 h-20 rounded-full bg-neem-950/45 backdrop-blur-md border border-parchment/15">
                <Play size={30} className="text-parchment fill-parchment translate-x-0.5" />
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* mute toggle */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-end px-4 pt-4 z-[6] pointer-events-none">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={(e) => {
              e.stopPropagation();
              setMuted((m) => !m);
            }}
            className="pointer-events-auto grid place-items-center w-9 h-9 rounded-full bg-neem-950/45 text-parchment backdrop-blur-md border border-parchment/10"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={muted ? 'm' : 'u'}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

        {/* ---------------- action rail ---------------- */}
        <div className="absolute right-3 bottom-28 z-[6] flex flex-col items-center gap-4">
          {/* Like */}
          <RailAction
            label={liked ? 'Unlike reel' : 'Like reel'}
            count={likes}
            onClick={(e) => {
              e.stopPropagation();
              likeReel();
            }}
            extra={<LikeSparks trigger={likeSpark} />}
          >
            <motion.span
              key={liked ? 'liked' : 'unliked'}
              initial={{ scale: liked ? 0.3 : 1 }}
              animate={{ scale: liked ? [1, 1.35, 1] : 1 }}
              transition={{ type: 'spring', stiffness: 640, damping: 15 }}
              className="block"
            >
              <Heart
                size={26}
                strokeWidth={liked ? 0 : 2.2}
                className={`drop-shadow-lg transition-colors ${liked ? 'fill-terra-500 text-terra-500' : 'text-parchment'}`}
              />
            </motion.span>
          </RailAction>

          {/* Comment */}
          <RailAction
            label="Comments"
            count={post.comments_count}
            onClick={(e) => {
              e.stopPropagation();
              openReader(post.id);
            }}
          >
            <MessageCircle size={25} strokeWidth={2.1} className="text-parchment drop-shadow-lg -scale-x-100" />
          </RailAction>

          {/* Share */}
          <RailAction
            label="Send reel"
            onClick={(e) => {
              e.stopPropagation();
              openShare(post.id);
            }}
          >
            <motion.span whileTap={{ x: 6, y: -6, rotate: 18 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }}>
              <Send size={23} strokeWidth={2.1} className="text-parchment drop-shadow-lg -rotate-[18deg] -translate-x-[1px]" />
            </motion.span>
          </RailAction>

          {/* Save */}
          <RailAction
            label={saved ? 'Unsave reel' : 'Save reel'}
            count={saves}
            onClick={(e) => {
              e.stopPropagation();
              saveReel();
            }}
            extra={
              <AnimatePresence>
                {saveGlow > 0 && (
                  <motion.span
                    key={saveGlow}
                    className="absolute inset-0 rounded-full border-2 border-gold-400"
                    initial={{ scale: 0.6, opacity: 0.8 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
            }
          >
            <motion.span
              key={saved ? 'saved' : 'unsaved'}
              initial={{ scale: saved ? 0.4 : 1, y: saved ? -2 : 0 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 620, damping: 16 }}
              className="block"
            >
              <Bookmark
                size={23}
                strokeWidth={saved ? 0 : 2.1}
                className={`drop-shadow-lg transition-colors ${saved ? 'fill-gold-400 text-gold-400' : 'text-parchment'}`}
              />
            </motion.span>
          </RailAction>

          {/* Spinning audio disc (Instagram-style) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openUserProfile(post.author_id);
            }}
            className="mt-1 pointer-events-auto"
            aria-label="Original audio"
          >
            <motion.span
              className="relative grid place-items-center w-11 h-11 rounded-full overflow-hidden border-2 border-parchment/70 bg-neem-900 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.7)]"
              animate={active && !pausedByUser ? { rotate: 360 } : { rotate: 0 }}
              transition={active && !pausedByUser ? { repeat: Infinity, ease: 'linear', duration: 6 } : { duration: 0.3 }}
            >
              <Avatar url={post.author_avatar} name={post.author_name} size={44} />
              <span className="absolute inset-0 grid place-items-center bg-neem-950/25">
                <Music2 size={13} className="text-parchment drop-shadow" />
              </span>
            </motion.span>
          </button>
        </div>

        {/* ---------------- channel + caption ---------------- */}
        <div className="absolute bottom-0 inset-x-0 pl-4 pr-20 pb-6 z-[6]">
          <div className="flex items-center gap-2.5">
            <button onClick={() => openUserProfile(post.author_id)} className="relative shrink-0 pointer-events-auto">
              <span className="block p-[2px] rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)]">
                <span className="block p-[2px] rounded-full bg-neem-950">
                  <Avatar url={post.author_avatar} name={post.author_name} size={38} />
                </span>
              </span>
              {!isSelf && !following && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 }}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 grid place-items-center w-4 h-4 rounded-full bg-terra-500 border-2 border-neem-950"
                >
                  <Plus size={9} strokeWidth={3} className="text-parchment" />
                </motion.span>
              )}
            </button>

            <button
              onClick={() => openUserProfile(post.author_id)}
              className="pointer-events-auto text-parchment text-[13.5px] font-semibold drop-shadow hover:text-gold-300 transition-colors truncate max-w-[40%]"
            >
              @{post.author_username}
            </button>

            {!isSelf && (
              <motion.button
                layout
                whileTap={{ scale: 0.92 }}
                onClick={() => toggleFollow.mutate({ followeeId: post.author_id })}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className={`pointer-events-auto ml-1 overflow-hidden rounded-full px-3.5 py-1 text-[11px] font-bold backdrop-blur border transition-colors ${
                  following
                    ? 'border-parchment/40 text-parchment/90 bg-neem-950/30'
                    : 'border-transparent bg-parchment text-neem-950 hover:bg-gold-300'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {following ? (
                    <motion.span
                      key="following"
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-1"
                    >
                      <Check size={12} strokeWidth={3} /> Following
                    </motion.span>
                  ) : (
                    <motion.span
                      key="follow"
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="block"
                    >
                      Follow
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )}
          </div>

          {post.title && (
            <p className="mt-2.5 text-[13.5px] font-semibold text-parchment leading-snug drop-shadow">{post.title}</p>
          )}
          {post.caption && (
            <p className="mt-1 text-[12.5px] text-parchment/85 leading-relaxed line-clamp-2 drop-shadow">{post.caption}</p>
          )}
          {post.tags && post.tags.length > 0 && (
            <p className="mt-1.5 text-[12px] font-medium text-gold-300/90 space-x-2 drop-shadow">
              {post.tags.slice(0, 3).map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-2 text-[10.5px] text-parchment/75">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-neem-950/35 border border-parchment/10 backdrop-blur px-2.5 py-1">
              <Music2 size={10} className="text-gold-300" />
              <span className="max-w-[180px] truncate">
                original audio · {post.author_name.split(' ')[0].toLowerCase()}
              </span>
            </span>
          </div>
        </div>

        {/* video progress bar */}
        <div className="absolute bottom-0 inset-x-0 z-[7] h-[3px] bg-parchment/15">
          <div
            className="h-full bg-gradient-to-r from-saffron-500 to-gold-400"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ReelsView() {
  const isDesktop = useIsDesktop();
  // capture the tapped-open video once at mount; the deck then stays stable
  const clearReelFocus = useUI((s) => s.clearReelFocus);
  const [focusId] = useState(() => useUI.getState().reelsFocusPostId);
  const { data: reels, isLoading, isError, refetch } = useReels(focusId);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // consume the focus so returning to Reels later shows the normal deck
  useEffect(() => {
    if (focusId != null) clearReelFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
