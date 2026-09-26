import { Suspense, lazy, useEffect, useState } from 'react';
import { Bookmark, Clock, Eye, Heart, Images, MapPin, PencilLine, Trash2 } from 'lucide-react';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';

const Markdown = lazy(() => import('./Markdown'));
import MediaFrame from '../feed/MediaFrame';
import VideoPlayer from '../feed/VideoPlayer';
import MediaCarousel from '../feed/MediaCarousel';
import CourseSequenceDrawer from './CourseSequenceDrawer';
import VaidyaClinicalSeal from './VaidyaClinicalSeal';
import RichText from '../common/RichText';
import { PostCardSkeleton } from '../common/Skeletons';
import { compact, timeAgo } from '../../lib/format';
import {
  useComments,
  useDeletePost,
  usePost,
  useToggleLike,
  useToggleSave,
} from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import { sendSignal } from '../../lib/signals';
import { VideoScopeContext, postScope } from '../../lib/videoSeek';
import EditPostModal from '../composer/EditPostModal';

import NestedCommentThread from '../common/NestedCommentThread';

function CommentsSection({ postId }: { postId: number }) {
  const { data: comments, isLoading } = useComments(postId);
  const pushToast = useUI((s) => s.pushToast);

  return (
    <section className="mt-8 pt-6 border-t border-sand-300/60 dark:border-sand-800/60">
      <h4 className="font-display font-semibold text-lg text-ink-900 dark:text-parchment mb-4 flex items-center gap-2">
        Discourse & Reflections
      </h4>

      {isLoading ? (
        <div className="py-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="skeleton w-8 h-8 !rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <NestedCommentThread
          postId={postId}
          comments={comments || []}
          onRequireAuth={() => pushToast('Sign in to participate in the circle', 'error')}
        />
      )}
    </section>
  );
}

export default function ReaderBody({ postId }: { postId: number }) {
  const { data: post, isLoading, isError, refetch } = usePost(postId);
  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const openUserProfile = useUI((s) => s.openUserProfile);
  const closeReader = useUI((s) => s.closeReader);
  const { user } = useAuth();
  const deletePost = useDeletePost();
  const [editing, setEditing] = useState(false);
  const isAuthor = user?.id === post?.author_id;

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
  const slides = post.media_urls?.length ? post.media_urls : post.media_url ? [post.media_url] : [];
  const primaryMedia = slides[0] || null;

  return (
    <VideoScopeContext.Provider value={postScope(post.id)}>
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
          {isAuthor && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="p-2 rounded-full border border-sand-300 text-ink-700 hover:border-saffron-500/60 hover:text-saffron-700 transition-colors"
                aria-label="Edit post"
                title="Edit scroll / post"
              >
                <PencilLine size={15} />
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Dissolve this scroll from the garden? This cannot be undone.')) {
                    deletePost.mutate(post.id);
                    closeReader();
                  }
                }}
                className="p-2 rounded-full border border-sand-300 text-ink-500 hover:border-terra-500/40 hover:text-terra-600 transition-colors"
                aria-label="Delete post"
                title="Delete scroll"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>

        {isForge ? (
          <article className="px-5 lg:px-8 pt-7 max-w-[680px] mx-auto">
            {/* Sanctum Sequence course drawer if part of a masterclass */}
            <CourseSequenceDrawer postId={post.id} />

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

            {/* Long-form Video Lecture if attached */}
            {post.media_type === 'video' && post.media_url && (
              <div className="mt-5 rounded-2xl overflow-hidden shadow-warm">
                <VideoPlayer
                  url={post.media_url}
                  title={post.title || undefined}
                  autoPlay={false}
                />
              </div>
            )}

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

            {/* Vaidya Clinical Seal */}
            <VaidyaClinicalSeal
              postId={post.id}
              title={post.title || ''}
              content={post.content_md || post.summary || ''}
            />

            <CommentsSection postId={post.id} />
          </article>
        ) : (
          <article className="px-4 lg:px-6 pt-5 max-w-[620px] mx-auto">
            {/* Sanctum Sequence course drawer if part of a masterclass */}
            <CourseSequenceDrawer postId={post.id} />

            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-saffron-700">
              {post.tags?.[0] ? `${post.tags[0]} · ` : ''}
              {post.media_type === 'video' ? 'Moving Image' : 'From the Garden'}
            </p>

            {slides.length > 1 ? (
              <div className="mt-3 rounded-2xl overflow-hidden shadow-warm">
                <MediaCarousel
                  urls={slides}
                  alt={post.caption || post.title || 'media'}
                  mediaType={post.media_type}
                />
              </div>
            ) : primaryMedia ? (
              <div className="mt-3 rounded-2xl overflow-hidden shadow-warm">
                {post.media_type === 'video' ? (
                  <VideoPlayer
                    url={primaryMedia}
                    title={post.title || post.caption || undefined}
                    autoPlay={false}
                  />
                ) : (
                  <MediaFrame
                    url={primaryMedia}
                    mediaType={post.media_type}
                    alt={post.caption || 'media'}
                    naturalAspect
                  />
                )}
              </div>
            ) : null}

            {(slides.length > 1 || post.location || post.views_count > 0 || (post.media_type === 'video' && post.media_duration)) && (
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3 pb-4 border-b border-sand-300/70 text-[12px] text-ink-500">
                {slides.length > 1 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Images size={13} />
                    {slides.length} frames
                  </span>
                )}
                {post.media_type === 'video' && post.media_duration ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={13} />
                    {Math.round(post.media_duration)}s
                  </span>
                ) : null}
                {post.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={13} />
                    {post.location}
                  </span>
                )}
                {post.views_count > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Eye size={13} />
                    {compact(post.views_count)} views
                  </span>
                )}
              </div>
            )}

            {post.caption && (
              <p className="text-[14.5px] text-ink-800 leading-relaxed mt-4">
                <RichText text={post.caption} />
              </p>
            )}
            {post.tags && post.tags.length > 0 && (
              <p className="mt-3 text-[12.5px] text-saffron-700 font-medium space-x-2">
                {post.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </p>
            )}

            {/* Vaidya Clinical Seal */}
            <VaidyaClinicalSeal
              postId={post.id}
              title={post.title || post.caption || ''}
              content={post.caption || ''}
            />

            <CommentsSection postId={post.id} />
          </article>
        )}

        <EditPostModal post={post} isOpen={editing} onClose={() => setEditing(false)} />
      </div>
    </VideoScopeContext.Provider>
  );
}
