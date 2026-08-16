import { Suspense, lazy, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Clock, Heart, Send, Trash2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';

const Markdown = lazy(() => import('./Markdown'));
import MediaFrame from '../feed/MediaFrame';
import { PostCardSkeleton } from '../common/Skeletons';
import { compact, timeAgo } from '../../lib/format';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  usePost,
  useToggleLike,
  useToggleSave,
  useMyProfile,
} from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import { sendSignal } from '../../lib/signals';

function CommentsSection({ postId }: { postId: number }) {
  const { user } = useAuth();
  const meProfile = useMyProfile().data;
  const { data: comments, isLoading } = useComments(postId);
  const addComment = useAddComment(postId);
  const deleteComment = useDeleteComment(postId);
  const pushToast = useUI((s) => s.pushToast);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    if (!user) {
      pushToast('Sign in to leave a reflection', 'error');
      return;
    }
    addComment.mutate(body);
    setDraft('');
  };

  return (
    <section className="mt-8">
      <h4 className="font-display font-semibold text-lg text-ink-900 flex items-center gap-2">
        Reflections
        <span className="text-sm font-sans font-medium text-ink-500">
          {comments ? compact(comments.length) : '…'}
        </span>
      </h4>

      <div className="mt-4 flex items-start gap-3">
        <Avatar url={(meProfile?.avatar_url || user?.user_metadata?.avatar_url) as string | undefined} name={meProfile?.full_name || user?.email || 'you'} size={34} />
        <div className="flex-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={user ? 'Offer a reflection…' : 'Sign in to join the circle'}
            rows={1}
            maxLength={600}
            className="w-full resize-none rounded-2xl border border-sand-300 bg-parchment-deep/60 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
          />
          <div className="flex justify-end mt-2">
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={submit}
              disabled={!draft.trim() || addComment.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-saffron-600 text-parchment text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-40 hover:bg-saffron-700 transition-colors"
            >
              <Send size={12} className="-rotate-12" />
              Share
            </motion.button>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="skeleton w-8 h-8 !rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        {comments?.map((c) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 group">
            <Avatar url={c.author_avatar} name={c.author_name} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] leading-relaxed text-ink-800">
                <span className="font-semibold text-ink-900 mr-2">{c.author_username}</span>
                {c.body}
              </p>
              <p className="text-[11px] text-ink-400 mt-0.5">{timeAgo(c.created_at)}</p>
            </div>
            {user && user.id === c.user_id && (
              <button
                onClick={() => deleteComment.mutate(c.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-terra-600 self-start p-1"
                aria-label="Delete comment"
              >
                <Trash2 size={14} />
              </button>
            )}
          </motion.div>
        ))}
        {comments && comments.length === 0 && (
          <p className="text-sm text-ink-500 italic font-display">The circle is quiet — be the first voice.</p>
        )}
      </div>
    </section>
  );
}

export default function ReaderBody({ postId }: { postId: number }) {
  const { data: post, isLoading, isError, refetch } = usePost(postId);
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const openUserProfile = useUI((s) => s.openUserProfile);

  useEffect(() => {
    if (post) sendSignal({ type: 'view', post_id: post.id, tags: post.tags ?? [], kind: post.kind });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  if (isLoading) {
    return (
      <div className="p-4">
        <PostCardSkeleton />
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="p-10 text-center">
        <p className="font-display text-lg text-ink-900">This scroll could not be unrolled.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-full bg-neem-800 text-parchment px-5 py-2 text-sm font-medium hover:bg-neem-700 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const isForge = post.kind === 'forge';

  return (
    <div className="pb-10">
      {/* Author strip */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-sand-300/60 sticky top-0 bg-parchment/90 backdrop-blur-md z-10">
        <div className="p-[2px] rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)]">
          <div className="p-[2px] rounded-full bg-parchment">
            <Avatar url={post.author_avatar} name={post.author_name} size={34} />
          </div>
        </div>
        <button onClick={() => openUserProfile(post.author_id)} className="flex-1 min-w-0 text-left group">
          <p className="font-semibold text-[13.5px] text-ink-900 truncate group-hover:text-saffron-700 transition-colors">
            {post.author_name}
          </p>
          <p className="text-[11.5px] text-ink-500 truncate">
            @{post.author_username} · {timeAgo(post.created_at)}
          </p>
        </button>
        <button
          onClick={() => toggleLike.mutate({ postId: post.id })}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition-colors ${
            post.liked
              ? 'bg-terra-500/12 border-terra-500/40 text-terra-600'
              : 'border-sand-300 text-ink-700 hover:border-terra-500/50 hover:text-terra-600'
          }`}
        >
          <Heart size={14} className={post.liked ? 'fill-terra-500 text-terra-500' : ''} strokeWidth={post.liked ? 0 : 2} />
          {compact(post.likes_count)}
        </button>
        <button
          onClick={() => toggleSave.mutate({ postId: post.id })}
          className={`p-2 rounded-full border transition-colors ${
            post.saved
              ? 'bg-gold-500/15 border-gold-500/40 text-gold-600'
              : 'border-sand-300 text-ink-700 hover:border-gold-500/60 hover:text-gold-600'
          }`}
          aria-label="Save"
        >
          <Bookmark size={15} className={post.saved ? 'fill-gold-500 text-gold-500' : ''} strokeWidth={post.saved ? 0 : 2} />
        </button>
      </div>

      {isForge ? (
        <article className="px-5 lg:px-8 pt-7 max-w-[680px] mx-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">
            {post.tags?.[0] ? `${post.tags[0]} · ` : ''}Deep Lore
          </p>
          <h1 className="font-display font-semibold text-[30px] lg:text-[36px] leading-[1.15] text-ink-900 mt-3">
            {post.title}
          </h1>
          {post.summary && <p className="text-[15px] text-ink-600 leading-relaxed mt-3 italic font-display">{post.summary}</p>}

          <div className="flex items-center gap-4 mt-4 pb-5 border-b border-sand-300/70 text-[12px] text-ink-500">
            {post.read_minutes && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} />
                {post.read_minutes} min
              </span>
            )}
            {post.location && <span>{post.location}</span>}
          </div>

          <div className="mt-6">
            <Suspense
              fallback={
                <div className="py-14 grid place-items-center">
                  <Mandala className="w-16 h-16 text-gold-500/70 animate-spin-slower" petals={12} />
                </div>
              }
            >
              <Markdown source={post.content_md || ''} />
            </Suspense>
          </div>

          <CommentsSection postId={post.id} />
        </article>
      ) : (
        <article className="px-4 lg:px-6 pt-5 max-w-[620px] mx-auto">
          {post.media_url && (
            <div className="rounded-2xl overflow-hidden">
              <MediaFrame url={post.media_url} mediaType={post.media_type} alt={post.caption || 'media'} />
            </div>
          )}
          {post.caption && <p className="text-[14px] text-ink-800 leading-relaxed mt-4">{post.caption}</p>}
          {post.tags && post.tags.length > 0 && (
            <p className="mt-2 text-[12.5px] text-saffron-700 font-medium space-x-2">
              {post.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
          <CommentsSection postId={post.id} />
        </article>
      )}
    </div>
  );
}
