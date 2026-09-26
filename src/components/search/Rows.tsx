import { motion } from 'framer-motion';
import { BookOpenText, Clock, Heart, Loader2, MessageCircle, Play } from 'lucide-react';
import Avatar from '../common/Avatar';
import { compact, formatDuration, timeAgo } from '../../lib/format';
import type { Post, Profile } from '../../lib/types';
import { useCreateThread, useFollows, useToggleFollow } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useDwellSignal, sendRankingFeedback } from '../../lib/signals';
import { useUI } from '../../store/ui';

export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q.trim()) return <>{text}</>;
  const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.trim().toLowerCase() ? (
          <mark key={i} className="bg-gold-400/50 text-inherit rounded-[3px] px-[1px]">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function TopMatchBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gold-500/95 text-neem-950 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 shadow-sm">
      ◆ Top match
    </span>
  );
}

/** Why the ranker surfaced this result — only rendered when meaningful. */
function ReasonLabel({ reason }: { reason?: string | null }) {
  if (!reason) return null;
  return <p className="mt-1.5 text-[11px] italic font-medium text-gold-700">◈ {reason}</p>;
}

/** Opens the reader and records a click against the result's ranking metadata. */
function useResultActivation(post: Post) {
  const openReader = useUI((s) => s.openReader);
  return () => {
    if (post.ranking) void sendRankingFeedback(post, 'click').catch(() => undefined);
    openReader(post.id);
  };
}

export function VideoResultRow({ post, q, highlight = false }: { post: Post; q: string; highlight?: boolean }) {
  const activate = useResultActivation(post);
  const dwellRef = useDwellSignal<HTMLButtonElement>(post);
  return (
    <motion.button
      ref={dwellRef}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={activate}
      className="w-full text-left flex gap-4 group"
    >
      <div className="relative w-40 sm:w-52 shrink-0 aspect-video rounded-xl overflow-hidden bg-neem-950">
        <video src={post.media_url ?? undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
        <div className="absolute inset-0 grid place-items-center bg-neem-950/20 group-hover:bg-neem-950/5 transition-colors">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-parchment/85 text-neem-900 group-hover:scale-110 transition-transform">
            <Play size={15} className="ml-0.5 fill-neem-900" />
          </span>
        </div>
        {post.media_duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-neem-950/80 text-parchment text-[10px] font-medium px-1.5 py-0.5">
            {formatDuration(post.media_duration)}
          </span>
        ) : null}
        {highlight && <span className="absolute top-1.5 left-1.5"><TopMatchBadge /></span>}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h4 className="font-semibold text-[14px] leading-snug text-ink-900 group-hover:text-saffron-700 transition-colors line-clamp-2">
          <Highlight text={post.title || post.caption || ''} q={q} />
        </h4>
        <p className="text-[11.5px] text-ink-500 mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <Heart size={11} /> {compact(post.likes_count)}
          </span>
          <span aria-hidden="true" className="text-gold-500">·</span>
          <span>{timeAgo(post.created_at)}</span>
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Avatar url={post.author_avatar} name={post.author_name} size={22} />
          <span className="text-[12px] text-ink-600 font-medium truncate">
            <Highlight text={post.author_name} q={q} />
          </span>
        </div>
        {post.caption && post.title && (
          <p className="hidden sm:block text-[12px] text-ink-500 mt-1.5 line-clamp-2 leading-relaxed">
            <Highlight text={post.caption} q={q} />
          </p>
        )}
        <ReasonLabel reason={post.reason} />
      </div>
    </motion.button>
  );
}

export function ForgeRow({ post, q, highlight = false }: { post: Post; q: string; highlight?: boolean }) {
  const activate = useResultActivation(post);
  const dwellRef = useDwellSignal<HTMLButtonElement>(post);
  return (
    <motion.button
      ref={dwellRef}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={activate}
      className={`w-full text-left card-warm p-4 sm:p-5 group hover:border-gold-500/50 transition-colors relative ${
        highlight ? 'border-gold-500/60 ring-1 ring-gold-400/40' : ''
      }`}
    >
      {highlight && <span className="absolute top-3 right-3"><TopMatchBadge /></span>}
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-xl bg-saffron-500/12 border border-saffron-500/25 text-saffron-600 shrink-0">
          <BookOpenText size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-display font-semibold text-[16.5px] leading-snug text-ink-900 group-hover:text-neem-800 transition-colors">
            <Highlight text={post.title ?? ''} q={q} />
          </h4>
          {post.summary && (
            <p className="text-[12.5px] text-ink-600 leading-relaxed mt-1 line-clamp-2">
              <Highlight text={post.summary} q={q} />
            </p>
          )}
          <p className="text-[11px] text-ink-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-ink-700">{post.author_name}</span>
            {post.read_minutes && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> {post.read_minutes} min
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Heart size={11} /> {compact(post.likes_count)}
            </span>
            <span>{timeAgo(post.created_at)}</span>
          </p>
          <ReasonLabel reason={post.reason} />
        </div>
      </div>
    </motion.button>
  );
}

export function ImageTile({ post, highlight = false }: { post: Post; highlight?: boolean }) {
  const activate = useResultActivation(post);
  // `legacy: false` — shared with Explore, where posts carry no ranking
  // metadata, so we never emit stray legacy signals for unranked tiles.
  const dwellRef = useDwellSignal<HTMLButtonElement>(post, { legacy: false });
  return (
    <motion.button
      ref={dwellRef}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={activate}
      className={`relative aspect-square overflow-hidden rounded-xl group bg-sand-200 ${
        highlight ? 'ring-2 ring-gold-400/90 ring-offset-1 ring-offset-parchment' : ''
      }`}
    >
      {highlight && <span className="absolute top-1.5 left-1.5 z-10"><TopMatchBadge /></span>}
      <img
        src={post.media_url ?? ''}
        alt={post.caption ?? 'visual post'}
        loading="lazy"
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-neem-950/0 group-hover:bg-neem-950/40 transition-colors grid place-items-center">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 text-parchment text-[13px] font-semibold">
          <Heart size={15} className="fill-parchment" /> {compact(post.likes_count)}
        </span>
      </div>
    </motion.button>
  );
}

export function ImageResultRow({ post, q, highlight = false }: { post: Post; q: string; highlight?: boolean }) {
  const activate = useResultActivation(post);
  const dwellRef = useDwellSignal<HTMLButtonElement>(post);
  return (
    <motion.button
      ref={dwellRef}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={activate}
      className={`w-full text-left flex gap-4 group rounded-xl p-1 -m-1 ${
        highlight ? 'ring-1 ring-gold-400/50 bg-gold-400/[0.06]' : ''
      }`}
    >
      <div className="relative w-28 h-28 shrink-0 rounded-xl overflow-hidden bg-sand-200">
        <img
          src={post.media_url ?? ''}
          alt={post.caption ?? 'image result'}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {highlight && <span className="absolute top-1.5 left-1.5"><TopMatchBadge /></span>}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h4 className="font-semibold text-[14px] leading-snug text-ink-900 group-hover:text-saffron-700 transition-colors line-clamp-2">
          <Highlight text={post.title || post.caption || ''} q={q} />
        </h4>
        {post.caption && post.title && (
          <p className="hidden sm:block text-[12px] text-ink-500 mt-1 line-clamp-2 leading-relaxed">
            <Highlight text={post.caption} q={q} />
          </p>
        )}
        <p className="text-[11.5px] text-ink-500 mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <Heart size={11} /> {compact(post.likes_count)}
          </span>
          <span aria-hidden="true" className="text-gold-500">·</span>
          <span>{timeAgo(post.created_at)}</span>
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Avatar url={post.author_avatar} name={post.author_name} size={22} />
          <span className="text-[12px] text-ink-600 font-medium truncate">
            <Highlight text={post.author_name} q={q} />
          </span>
        </div>
        <ReasonLabel reason={post.reason} />
      </div>
    </motion.button>
  );
}

export function PersonRow({ person, q }: { person: Profile; q: string }) {
  const openUserProfile = useUI((s) => s.openUserProfile);
  const openThread = useUI((s) => s.openThread);
  const { user } = useAuth();
  const { data: followsData } = useFollows();
  const toggleFollow = useToggleFollow();
  const createThread = useCreateThread();
  const following = (followsData?.ids ?? []).includes(person.user_id);
  const isSelf = user?.id === person.user_id;

  const handleMessage = (e: React.MouseEvent) => {
    e.stopPropagation();
    createThread.mutate(
      { member_ids: [person.user_id] },
      {
        onSuccess: (thread) => {
          openThread(thread.id);
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-3 card-warm p-4">
      <button onClick={() => openUserProfile(person.user_id)} className="flex items-center gap-3 min-w-0 flex-1 text-left group">
        <Avatar url={person.avatar_url} name={person.full_name} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink-900 truncate group-hover:text-saffron-700 transition-colors">
            <Highlight text={person.full_name} q={q} />
          </p>
          <p className="text-[12px] text-ink-500 truncate">
            @{person.username}
            {person.bio ? ` · ${person.bio}` : ''}
          </p>
        </div>
      </button>
      {!isSelf && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleMessage}
            disabled={createThread.isPending}
            className="p-2 rounded-full border border-sand-300/80 hover:border-gold-500/60 bg-sand-100/60 hover:bg-sand-200/80 text-ink-700 hover:text-saffron-700 transition-all"
            title="Message on Golden Threads"
            aria-label={`Message ${person.full_name}`}
          >
            {createThread.isPending ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
          </button>
          <button
            onClick={() => toggleFollow.mutate({ followeeId: person.user_id })}
            disabled={toggleFollow.isPending}
            className={`rounded-full text-[11.5px] font-semibold px-4 py-2 transition-colors disabled:opacity-50 ${
              following
                ? 'border border-neem-600/40 bg-neem-500/10 text-neem-800'
                : 'bg-saffron-600 text-parchment hover:bg-saffron-700'
            }`}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
      )}
    </div>
  );
}
