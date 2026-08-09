import { useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useDragControls } from 'framer-motion';
import { CalendarDays, Feather, Images, UserCheck, UserPlus, X } from 'lucide-react';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';
import { RowSkeleton } from '../common/Skeletons';
import { ForgeRow, ImageTile } from '../search/Rows';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useFollows, useToggleFollow, useUserPosts, useUserProfile } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import { compact } from '../../lib/format';

export default function UserProfileOverlay() {
  const profileUserId = useUI((s) => s.profileUserId);
  const closeUserProfile = useUI((s) => s.closeUserProfile);

  if (profileUserId === null) return null;
  return <UserProfileInner key={profileUserId} userId={profileUserId} onClose={closeUserProfile} />;
}

function UserProfileInner({ userId, onClose }: { userId: string; onClose: () => void }) {
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const { data: profileData, isLoading: profileLoading } = useUserProfile(userId);
  const { data: postsData, isLoading: postsLoading } = useUserPosts(userId);
  const { data: followsData } = useFollows();
  const toggleFollow = useToggleFollow();
  const [segment, setSegment] = useState<'media' | 'lore'>('media');

  const y = useMotionValue(0);
  const controls = useDragControls();
  const backdrop = useTransform(y, [0, 600], [0.55, 0]);

  const posts = postsData?.items ?? [];
  const derived = posts[0];
  const profile = profileData ?? (derived
    ? {
        user_id: userId,
        username: derived.author_username,
        full_name: derived.author_name,
        bio: null as string | null,
        avatar_url: derived.author_avatar,
      }
    : null);

  const media = posts.filter((p) => p.kind === 'visual' && p.media_url);
  const lore = posts.filter((p) => p.kind === 'forge');
  const totalLikes = posts.reduce((acc, p) => acc + p.likes_count, 0);
  const following = (followsData?.ids ?? []).includes(userId);
  const isSelf = user?.id === userId;

  const dismiss = () => {
    if (isDesktop) onClose();
    else animate(y, window.innerHeight, { type: 'tween', duration: 0.26, ease: [0.32, 0.72, 0, 1] }).then(onClose);
  };

  const content = (
    <div className="pb-10">
      <div className="relative h-32 overflow-hidden bg-[linear-gradient(120deg,#12291c,#1b4230_50%,#7a4a12)]">
        <Mandala className="absolute -right-10 -top-14 w-56 h-56 text-gold-400/25 animate-spin-slower" />
      </div>

      <div className="px-5 -mt-9 relative z-10">
        {profileLoading ? (
          <div className="card-warm p-5"><RowSkeleton /></div>
        ) : (
          <div className="card-warm p-4">
            <div className="flex items-start gap-3.5">
              <div className="p-[3px] rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)] shrink-0">
                <div className="p-[3px] rounded-full bg-parchment">
                  <Avatar url={profile?.avatar_url} name={profile?.full_name || '?'} size={66} />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="font-display font-semibold text-[19px] text-ink-900 leading-tight truncate">
                  {profile?.full_name || 'Unknown weaver'}
                </h2>
                <p className="text-[12.5px] text-ink-500">@{profile?.username}</p>
                {profile?.bio && (
                  <p className="text-[12.5px] text-ink-700 leading-relaxed mt-1.5">{profile.bio}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-[11.5px] text-ink-500">
                  <span><b className="text-ink-900 font-semibold">{compact(posts.length)}</b> posts</span>
                  <span><b className="text-ink-900 font-semibold">{compact(totalLikes)}</b> appreciations</span>
                  <span><b className="text-ink-900 font-semibold">{compact(lore.length)}</b> scrolls</span>
                </div>
                {profile?.created_at && (
                  <p className="text-[11px] text-ink-400 mt-2 inline-flex items-center gap-1.5">
                    <CalendarDays size={11} />
                    Weaving since {new Date(profile.created_at).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>

            {!isSelf && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => toggleFollow.mutate({ followeeId: userId })}
                disabled={toggleFollow.isPending}
                className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  following
                    ? 'border border-neem-600/40 bg-neem-500/10 text-neem-800'
                    : 'bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment hover:brightness-105'
                }`}
              >
                {following ? <UserCheck size={15} /> : <UserPlus size={15} />}
                {following ? 'Following — in your channels' : 'Follow this channel'}
              </motion.button>
            )}
          </div>
        )}

        <div className="flex rounded-full border border-sand-300 bg-parchment p-1 mt-4 w-fit">
          {(
            [
              { id: 'media', label: 'Media', icon: Images, count: media.length },
              { id: 'lore', label: 'Scrolls', icon: Feather, count: lore.length },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                segment === s.id ? 'text-parchment' : 'text-ink-600 hover:text-neem-800'
              }`}
            >
              {segment === s.id && (
                <motion.span layoutId="channel-pill" className="absolute inset-0 rounded-full bg-neem-800" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
              )}
              <s.icon size={13} className="relative z-10" />
              <span className="relative z-10">{s.label} · {s.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          {postsLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-square !rounded-xl" />
              ))}
            </div>
          ) : segment === 'media' ? (
            media.length === 0 ? (
              <p className="text-center text-sm text-ink-500 italic font-display py-10">No visual blooms on this channel yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {media.map((p) => (
                  <ImageTile key={p.id} post={p} />
                ))}
              </div>
            )
          ) : lore.length === 0 ? (
            <p className="text-center text-sm text-ink-500 italic font-display py-10">No scrolls inked on this channel yet.</p>
          ) : (
            <div className="space-y-2.5">
              {lore.map((p) => (
                <ForgeRow key={p.id} post={p} q="" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={dismiss}
          className="fixed inset-0 z-[72] bg-neem-950/55 backdrop-blur-sm"
        />
        <div className="fixed inset-0 z-[76] grid place-items-center p-6 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 22 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="pointer-events-auto card-warm !rounded-[26px] w-full max-w-lg max-h-[86vh] overflow-hidden flex flex-col relative"
          >
            <button
              onClick={dismiss}
              className="absolute top-3.5 right-3.5 z-20 p-2 rounded-full bg-parchment/85 text-ink-700 hover:bg-parchment backdrop-blur transition-colors"
              aria-label="Close profile"
            >
              <X size={16} />
            </button>
            <div className="overflow-y-auto">{content}</div>
          </motion.div>
        </div>
      </>
    );
  }

  return (
    <>
      <motion.div
        style={{ opacity: backdrop }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.55 }}
        onClick={dismiss}
        className="fixed inset-0 z-[72] bg-neem-950"
      />
      <motion.div
        style={{ y }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.12}
        onDragEnd={(_e, info) => {
          if (info.offset.y > 110 || info.velocity.y > 500) dismiss();
          else animate(y, 0, { type: 'spring', stiffness: 320, damping: 32 });
        }}
        className="fixed inset-x-0 bottom-0 z-[76] h-[92dvh] bg-parchment rounded-t-[26px] shadow-warm overflow-hidden flex flex-col"
      >
        <div
          onPointerDown={(e) => controls.start(e)}
          className="shrink-0 pt-2.5 pb-2.5 grid place-items-center cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-11 h-[5px] rounded-full bg-sand-400" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{content}</div>
      </motion.div>
    </>
  );
}
