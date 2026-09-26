import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserCheck, UserPlus, Users, X } from 'lucide-react';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';
import { useAuth } from '../../contexts/AuthContext';
import { useFollowList, useFollows, useToggleFollow } from '../../hooks/queries';
import { useUI } from '../../store/ui';
import type { Profile } from '../../lib/types';

interface FollowListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialTab?: 'followers' | 'following';
  userName?: string;
}

export default function FollowListModal({
  isOpen,
  onClose,
  userId,
  initialTab = 'followers',
  userName,
}: FollowListModalProps) {
  const [tab, setTab] = useState<'followers' | 'following'>(initialTab);
  const { user } = useAuth();
  const openUserProfile = useUI((s) => s.openUserProfile);
  const { data: followsData } = useFollows();
  const toggleFollow = useToggleFollow();

  const { data, isLoading } = useFollowList(isOpen ? userId : null, tab);
  const items = data?.items ?? [];
  const myFollowingSet = new Set(followsData?.ids ?? []);

  const handleSelectUser = (targetUserId: string) => {
    openUserProfile(targetUserId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-neem-950/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative w-full max-w-md bg-parchment rounded-3xl shadow-2xl border border-sand-300/80 overflow-hidden z-10 flex flex-col max-h-[82vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sand-300/70 bg-parchment/90">
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-lg text-neem-950 truncate">
                {userName ? `${userName}'s network` : 'Channels & Weavers'}
              </h3>
              <p className="text-[11px] text-ink-500">The tapestry of connections</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-ink-400 hover:text-ink-700 hover:bg-sand-200/60 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Segment Tabs */}
          <div className="flex px-4 pt-3 pb-2 border-b border-sand-200/80 gap-2 bg-sand-100/30">
            {(
              [
                { id: 'followers', label: 'Followers' },
                { id: 'following', label: 'Following' },
              ] as const
            ).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all relative ${
                    active ? 'text-parchment' : 'text-ink-600 hover:bg-sand-200/50'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="follow-tab-pill"
                      className="absolute inset-0 bg-neem-800 rounded-xl"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    {t.label}
                    {tab === t.id && data?.count !== undefined && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gold-400/30 text-gold-200">
                        {data.count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-sand-200/60 no-scrollbar">
            {isLoading && (
              <div className="py-12 grid place-items-center">
                <Mandala className="w-12 h-12 text-gold-500/50 animate-spin-slower" />
                <p className="font-display italic text-[12.5px] text-ink-500 mt-2">Unrolling threads…</p>
              </div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="py-12 text-center px-4">
                <Users className="w-10 h-10 mx-auto text-sand-400 mb-2" />
                <p className="font-display text-[14px] text-ink-700 font-medium">
                  {tab === 'followers' ? 'No followers yet' : 'Not following any weavers yet'}
                </p>
                <p className="text-[11.5px] text-ink-400 mt-1">
                  As weavers interact, this circle will expand.
                </p>
              </div>
            )}

            {!isLoading &&
              items.map((profile: Profile) => {
                const isSelf = user?.id === profile.user_id;
                const isFollowing = myFollowingSet.has(profile.user_id);

                return (
                  <div
                    key={profile.user_id}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-2xl hover:bg-sand-100/60 transition-colors"
                  >
                    <button
                      onClick={() => handleSelectUser(profile.user_id)}
                      className="shrink-0 p-[2px] rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)]"
                    >
                      <div className="p-[2px] rounded-full bg-parchment">
                        <Avatar url={profile.avatar_url} name={profile.full_name} size={42} />
                      </div>
                    </button>

                    <div
                      onClick={() => handleSelectUser(profile.user_id)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="font-semibold text-[13.5px] text-ink-900 truncate hover:text-saffron-700 transition-colors">
                        {profile.full_name}
                      </p>
                      <p className="text-[11.5px] text-ink-500 truncate">@{profile.username}</p>
                      {profile.bio && (
                        <p className="text-[11px] text-ink-600 line-clamp-1 mt-0.5">{profile.bio}</p>
                      )}
                    </div>

                    {!isSelf && user && (
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        onClick={() => toggleFollow.mutate({ followeeId: profile.user_id })}
                        disabled={toggleFollow.isPending}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                          isFollowing
                            ? 'bg-neem-600/10 text-neem-800 border border-neem-600/30'
                            : 'bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment hover:brightness-105'
                        }`}
                      >
                        {isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
                        {isFollowing ? 'Following' : 'Follow'}
                      </motion.button>
                    )}
                  </div>
                );
              })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
