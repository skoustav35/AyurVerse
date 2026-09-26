import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, EyeOff, Heart, MessageCircle, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { compact } from '../../lib/format';
import { useToggleLike, useToggleSave, trackBoost } from '../../hooks/queries';
import { sendRankingFeedback } from '../../lib/signals';
import { spring } from '../../lib/motion';
import type { Post } from '../../lib/types';
import { useUI } from '../../store/ui';

const BURST_COLORS = ['#f4c430', '#ee8a1f', '#ecc34e', '#c05a2e', '#f9a83f'];

function GoldBurst({ burstKey }: { burstKey: number }) {
  const particles = Array.from({ length: 10 });
  return (
    <AnimatePresence>
      {burstKey > 0 && (
        <span key={burstKey} className="absolute inset-0 pointer-events-none">
          {particles.map((_, i) => {
            const angle = (i / particles.length) * Math.PI * 2 + burstKey;
            const dist = 22 + ((i * 13) % 14);
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist - 6,
                  scale: [0, 1.4, 0.6],
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full -ml-[3px] -mt-[3px]"
                style={{ background: BURST_COLORS[i % BURST_COLORS.length] }}
              />
            );
          })}
        </span>
      )}
    </AnimatePresence>
  );
}

interface ActionBarProps {
  post: Post;
  onOpenReader: () => void;
}

export default function ActionBar({ post, onOpenReader }: ActionBarProps) {
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const openShare = useUI((s) => s.openShare);
  const pushToast = useUI((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [burstKey, setBurstKey] = useState(0);
  const [hiding, setHiding] = useState(false);

  const handleLike = () => {
    if (!post.liked) {
      setBurstKey((k) => k + 1);
      if (post.boosted && post.boost_id) trackBoost(post.boost_id, 'like');
    }
    // Confirmed like carries the ranking request_id so the server can log it.
    toggleLike.mutate({ postId: post.id, ranking: post.ranking });
  };

  const handleSave = () => toggleSave.mutate({ postId: post.id, ranking: post.ranking });

  const handleOpenReader = () => {
    if (post.ranking) void sendRankingFeedback(post, 'click').catch(() => undefined);
    onOpenReader();
  };

  const handleHide = async () => {
    if (hiding || !post.ranking) return;
    setHiding(true);
    try {
      // Only report success after the server confirms the hide.
      await sendRankingFeedback(post, 'hide');
      pushToast('Hidden — fewer posts like this', 'neem');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setHiding(false);
    }
  };

  const handleShare = () => openShare(post.id);

  return (
    <div className="flex items-center gap-4 px-4 pt-3">
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.75 }}
          onClick={handleLike}
          aria-label={post.liked ? 'Unlike' : 'Like'}
          className="block"
        >
          <motion.span
            key={post.liked ? 'liked' : 'unliked'}
            initial={{ scale: post.liked ? 0.4 : 1 }}
            animate={{ scale: 1 }}
            transition={spring.appleSnappy}
            className="block"
          >
            <Heart
              size={26}
              strokeWidth={post.liked ? 0 : 1.9}
              className={post.liked ? 'fill-terra-500 text-terra-500' : 'text-ink-800 hover:text-ink-600 transition-colors'}
            />
          </motion.span>
        </motion.button>
        <GoldBurst burstKey={burstKey} />
      </div>

      <motion.button whileTap={{ scale: 0.8 }} onClick={handleOpenReader} aria-label="Open comments" className="group">
        <MessageCircle size={25} strokeWidth={1.9} className="text-ink-800 group-hover:text-ink-600 -scale-x-100 transition-colors" />
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.8, rotate: -8 }}
        onClick={handleShare}
        aria-label="Send to a thread"
        title="Send to a thread"
        className="group"
      >
        <Send size={24} strokeWidth={1.9} className="text-ink-800 group-hover:text-saffron-600 -rotate-12 transition-colors" />
      </motion.button>

      {post.ranking && (
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={handleHide}
          disabled={hiding}
          aria-label="Hide this post"
          title="Hide this post"
          className="group disabled:opacity-50"
        >
          <EyeOff size={23} strokeWidth={1.9} className="text-ink-800 group-hover:text-terra-600 transition-colors" />
        </motion.button>
      )}

      <div className="flex-1" />

      <motion.button
        whileTap={{ scale: 0.75 }}
        onClick={handleSave}
        aria-label={post.saved ? 'Unsave' : 'Save'}
      >
        <motion.span
          key={post.saved ? 'saved' : 'unsaved'}
          initial={post.saved ? { y: -7, scale: 1.15 } : false}
          animate={{ y: 0, scale: 1 }}
          transition={spring.appleSnappy}
          className="block"
        >
          <Bookmark
            size={24}
            strokeWidth={post.saved ? 0 : 1.9}
            className={post.saved ? 'fill-gold-500 text-gold-500' : 'text-ink-800 hover:text-ink-600 transition-colors'}
          />
        </motion.span>
      </motion.button>

      <span className="sr-only">{compact(post.likes_count)} likes</span>
    </div>
  );
}
