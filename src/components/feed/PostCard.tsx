import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, MapPin, MoreHorizontal, Rocket } from 'lucide-react';
import Avatar from '../common/Avatar';
import MediaFrame from './MediaFrame';
import ActionBar from './ActionBar';
import { compact, timeAgo } from '../../lib/format';
import { useToggleLike, trackBoost } from '../../hooks/queries';
import { useDwellSignal } from '../../lib/signals';
import type { Post } from '../../lib/types';
import { useUI } from '../../store/ui';
import { useIsDesktop } from '../../hooks/useIsDesktop';

interface PostCardProps {
  post: Post;
}

export default function PostCard({ post }: PostCardProps) {
  const isDesktop = useIsDesktop();
  const openReader = useUI((s) => s.openReader);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const openReel = useUI((s) => s.openReel);
  const openHashtag = useUI((s) => s.openHashtag);
  const pushToast = useUI((s) => s.pushToast);
  const toggleLike = useToggleLike();
  const [expanded, setExpanded] = useState(false);
  const [splash, setSplash] = useState(0);
  const [menu, setMenu] = useState(false);
  const dwellRef = useDwellSignal(post);
  const impressedRef = useRef(false);

  // fire a boost impression once, when a boosted card first mounts into view
  useEffect(() => {
    if (post.boosted && post.boost_id && !impressedRef.current) {
      impressedRef.current = true;
      trackBoost(post.boost_id, 'impression');
    }
  }, [post.boosted, post.boost_id]);

  const open = () => {
    if (post.boosted && post.boost_id) trackBoost(post.boost_id, 'click');
    openReader(post.id);
  };

  const handleDoubleTap = () => {
    setSplash((s) => s + 1);
    if (!post.liked) {
      if (post.boosted && post.boost_id) trackBoost(post.boost_id, 'like');
      toggleLike.mutate({ postId: post.id });
    }
  };

  const captionLong = (post.caption?.length ?? 0) > 140;

  return (
    <motion.article
      ref={dwellRef}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`card-warm overflow-hidden ${isDesktop ? '' : 'rounded-none border-x-0'} ${
        post.boosted ? 'ring-1 ring-gold-500/50 shadow-[0_0_0_1px_rgba(212,160,23,0.15),0_18px_40px_-20px_rgba(212,160,23,0.5)]' : ''
      }`}
    >
      {post.boosted ? (
        <div className="flex items-center gap-1.5 px-4 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-saffron-500 to-gold-500 text-parchment text-[10px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 shadow-[0_4px_12px_-4px_rgba(217,111,16,0.7)]">
            <Rocket size={11} /> Boosted
          </span>
          {post.reason && <span className="text-[11px] italic font-medium text-gold-700">{post.reason}</span>}
        </div>
      ) : (
        post.reason && <p className="px-4 pt-3 text-[11px] italic font-medium text-gold-700">◈ {post.reason}</p>
      )}

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => openUserProfile(post.author_id)}
          className="p-[2px] rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#e0aa1f,#c05a2e,#2e6b4e,#ee8a1f)] hover:scale-105 transition-transform"
          aria-label={`Open ${post.author_username}'s profile`}
        >
          <div className="p-[2px] rounded-full bg-parchment">
            <Avatar url={post.author_avatar} name={post.author_name} size={34} />
          </div>
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={() => openUserProfile(post.author_id)}
            className="font-semibold text-[13.5px] text-ink-900 leading-tight hover:text-saffron-700 transition-colors truncate block text-left"
          >
            {post.author_username}
          </button>
          <p className="text-[11.5px] text-ink-500 flex items-center gap-1 truncate">
            {post.location && <MapPin size={10} className="shrink-0" />}
            {post.location ? `${post.location} · ` : ''}
            {post.author_name}
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            className="p-1.5 rounded-full text-ink-600 hover:bg-sand-200/70 transition-colors"
            aria-label="Post options"
          >
            <MoreHorizontal size={18} />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 top-9 z-20 card-warm !rounded-xl p-1.5 w-44 shadow-warm"
              >
                <button
                  onClick={async () => {
                    setMenu(false);
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?post=${post.id}`);
                      pushToast('Link copied');
                    } catch {
                      pushToast('Could not copy link', 'error');
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-sand-200/70 text-ink-800"
                >
                  Copy link
                </button>
                <button
                  onClick={open}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-sand-200/70 text-ink-800"
                >
                  Open reading pane
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    pushToast('Reported. The gardeners will review.', 'neem');
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-sand-200/70 text-terra-600"
                >
                  Report
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Media */}
      {post.media_url && (
        <div className="relative">
          <MediaFrame
            url={post.media_url}
            mediaType={post.media_type}
            alt={post.caption || post.title || 'post media'}
            edgeToEdge={!isDesktop}
            onDoubleTap={handleDoubleTap}
            onSingleTap={post.media_type === 'video' ? () => openReel(post.id) : undefined}
          />
          <AnimatePresence>
            {splash > 0 && (
              <motion.div
                key={splash}
                className="absolute inset-0 grid place-items-center pointer-events-none"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: 0.62, duration: 0.3 }}
              >
                <motion.div
                  initial={{ scale: 0.2, opacity: 0, rotate: -8 }}
                  animate={{ scale: [0.2, 1.18, 1], opacity: [0, 1, 1], rotate: 0 }}
                  transition={{ duration: 0.45, times: [0, 0.55, 1], ease: 'easeOut' }}
                  className="drop-shadow-[0_8px_28px_rgba(244,196,48,0.55)]"
                >
                  <Heart size={92} className="fill-parchment text-parchment" strokeWidth={0} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Actions */}
      <ActionBar post={post} onOpenReader={open} />

      {/* Meta */}
      <div className="px-4 pt-2 pb-4">
        <button onClick={open} className="text-[13.5px] font-semibold text-ink-900">
          {compact(post.likes_count)} {post.likes_count === 1 ? 'like' : 'likes'}
        </button>

        {post.caption && (
          <p className="text-[13.5px] text-ink-800 leading-relaxed mt-1">
            <button
              onClick={() => openUserProfile(post.author_id)}
              className="font-semibold text-ink-900 mr-1.5 hover:text-saffron-700 transition-colors"
            >
              {post.author_username}
            </button>
            {expanded || !captionLong ? (
              <> {post.caption}</>
            ) : (
              <>
                {post.caption.slice(0, 140)}…{' '}
                <button onClick={() => setExpanded(true)} className="text-ink-500 font-medium">
                  more
                </button>
              </>
            )}
          </p>
        )}

        {post.tags && post.tags.length > 0 && (
          <p className="mt-1.5 text-[12.5px] text-saffron-700 font-medium space-x-2">
            {post.tags.slice(0, 4).map((t) => (
              <button key={t} onClick={() => openHashtag(t)} className="hover:text-saffron-600 hover:underline transition-colors">
                #{t}
              </button>
            ))}
          </p>
        )}

        {post.comments_count > 0 && (
          <button onClick={open} className="block mt-1.5 text-[13px] text-ink-500 hover:text-ink-700 transition-colors">
            View all {compact(post.comments_count)} comments
          </button>
        )}

        <p className="mt-1.5 text-[10.5px] uppercase tracking-[0.14em] text-ink-400">{timeAgo(post.created_at)}</p>
      </div>
    </motion.article>
  );
}
