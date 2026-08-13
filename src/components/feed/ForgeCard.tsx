import { motion } from 'framer-motion';
import { Clock, Flame } from 'lucide-react';
import Avatar from '../common/Avatar';
import ActionBar from './ActionBar';
import { compact, timeAgo } from '../../lib/format';
import { useDwellSignal } from '../../lib/signals';
import type { Post } from '../../lib/types';
import { useUI } from '../../store/ui';
import { useIsDesktop } from '../../hooks/useIsDesktop';

interface ForgeCardProps {
  post: Post;
}

export default function ForgeCard({ post }: ForgeCardProps) {
  const isDesktop = useIsDesktop();
  const openReader = useUI((s) => s.openReader);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const open = () => openReader(post.id);
  const dwellRef = useDwellSignal(post);

  return (
    <motion.article
      ref={dwellRef}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`card-warm overflow-hidden ${isDesktop ? '' : 'rounded-none border-x-0'}`}
    >
      <div
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') open();
        }}
        className="block w-full text-left group cursor-pointer"
      >
        <div className="px-5 pt-5 pb-4 relative overflow-hidden">
          <div
            className="absolute -right-16 -top-16 w-48 h-48 text-gold-500/15 group-hover:text-gold-500/25 transition-colors pointer-events-none"
            aria-hidden="true"
          >
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full animate-spin-slower">
              <circle cx="50" cy="50" r="46" stroke="currentColor" strokeDasharray="2 5" />
              <circle cx="50" cy="50" r="30" stroke="currentColor" />
              <circle cx="50" cy="50" r="12" stroke="currentColor" strokeDasharray="1 3" />
            </svg>
          </div>

          {post.reason && (
            <p className="relative z-10 mb-2.5 text-[11px] italic font-medium text-gold-700">◈ {post.reason}</p>
          )}

          <p className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-saffron-700 bg-saffron-500/12 border border-saffron-500/25 rounded-full px-2.5 py-1">
            <Flame size={11} />
            Deep Lore
          </p>

          <h3 className="font-display font-semibold text-[21px] leading-snug text-ink-900 mt-3 group-hover:text-neem-800 transition-colors">
            {post.title}
          </h3>

          {post.summary && (
            <p className="text-[13.5px] text-ink-600 leading-relaxed mt-2 line-clamp-3">{post.summary}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-[11.5px] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Avatar url={post.author_avatar} name={post.author_name} size={20} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openUserProfile(post.author_id);
                }}
                className="font-medium text-ink-700 hover:text-saffron-700 transition-colors"
              >
                {post.author_name}
              </button>
            </span>
            {post.read_minutes && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                {post.read_minutes} min read
              </span>
            )}
            <span>{timeAgo(post.created_at)}</span>
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {post.tags.slice(0, 5).map((t) => (
                <span
                  key={t}
                  className="text-[10.5px] font-medium tracking-wide uppercase text-neem-700 bg-neem-500/10 border border-neem-500/20 rounded-full px-2 py-0.5"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-sand-300/60">
        <ActionBar post={post} onOpenReader={open} />
        <div className="px-4 pb-3.5 -mt-1 flex items-center gap-3 text-[12px] text-ink-500">
          <span>{compact(post.likes_count)} appreciations</span>
          <span aria-hidden="true" className="text-gold-500">·</span>
          <span>{compact(post.comments_count)} reflections</span>
        </div>
      </div>
    </motion.article>
  );
}
