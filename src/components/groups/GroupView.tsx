import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Users,
  Images,
  Feather,
  MessagesSquare,
  Check,
  Plus,
  Crown,
  Settings,
  LogOut,
  Trash2,
  MessageSquare,
  UserPlus,
  Shield,
} from 'lucide-react';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';
import PostCard from '../feed/PostCard';
import ForgeCard from '../feed/ForgeCard';
import ReaderBody from '../reader/ReaderBody';
import { compact } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import {
  useGroup,
  useGroupPosts,
  useJoinGroup,
  useManageGroup,
  type GroupMember,
} from '../../hooks/queries';
import { apiFetch } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useUI } from '../../store/ui';

const KIND_META = {
  feed: { icon: Images, label: 'Feed circle', tint: 'text-saffron-300 bg-saffron-500/20 border-saffron-400/40' },
  forge: { icon: Feather, label: 'Forge circle', tint: 'text-gold-300 bg-gold-500/20 border-gold-400/40' },
  thread: { icon: MessagesSquare, label: 'Thread circle', tint: 'text-neem-200 bg-neem-500/25 border-neem-300/40' },
} as const;

export default function GroupView() {
  const groupId = useUI((s) => s.activeGroupId);
  const close = useUI((s) => s.closeGroup);
  const openThread = useUI((s) => s.openThread);
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  const setComposerGroup = useUI((s) => s.setComposerGroup);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const pushToast = useUI((s) => s.pushToast);
  // posts inside the circle open the reader in a dedicated on-top overlay so it
  // is never hidden behind this full-screen circle sheet
  const readerPostId = useUI((s) => s.readerPostId);
  const closeReader = useUI((s) => s.closeReader);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGroup(groupId);
  const { data: postsData } = useGroupPosts(data?.group.kind !== 'thread' ? groupId : null);
  const join = useJoinGroup();
  const manage = useManageGroup();
  const [showMembers, setShowMembers] = useState(false);

  if (groupId === null) return null;

  const group = data?.group;
  const meta = group ? KIND_META[group.kind] ?? KIND_META.feed : KIND_META.feed;
  const Icon = meta.icon;
  const isMember = !!data?.is_member;
  const isAdmin = data?.my_role === 'admin';
  const isOwner = group?.owner_id === user?.id;
  const posts = postsData?.items ?? [];

  const openChat = () => {
    if (group?.conversation_id) {
      openThread(group.conversation_id);
      close();
    }
  };

  const postToGroup = () => {
    if (groupId) {
      setComposerGroup(groupId);
      setComposerOpen(true);
    }
  };

  const dissolve = async () => {
    if (!group) return;
    if (!window.confirm(`Dissolve “${group.name}”? This cannot be undone.`)) return;
    try {
      await apiFetch('/api/groups', { method: 'DELETE', body: JSON.stringify({ id: group.id }) });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      pushToast('The circle has been dissolved', 'neem');
      close();
    } catch (err) {
      pushToast((err as Error).message, 'error');
    }
  };

  return (
    <AnimatePresence>
      {groupId !== null && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="fixed inset-0 z-[70] bg-neem-950/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="fixed z-[75] inset-x-0 bottom-0 top-4 sm:inset-6 lg:inset-x-[12%] lg:inset-y-8 bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden flex flex-col shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
          >
            {/* Cover header */}
            <div className="relative shrink-0 h-40 sm:h-48 overflow-hidden bg-[radial-gradient(120%_120%_at_30%_0%,#1b4230,#12291c)]">
              {group?.cover_url && <img src={group.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />}
              <Mandala className="absolute -right-10 -top-12 w-52 h-52 text-gold-400/20 animate-spin-slower pointer-events-none" />
              <button onClick={close} className="absolute top-4 right-4 z-10 grid place-items-center w-9 h-9 rounded-full bg-neem-950/40 text-parchment backdrop-blur hover:bg-neem-950/60" aria-label="Close">
                <X size={18} />
              </button>

              <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 flex items-end gap-3.5">
                <div className="p-[3px] rounded-2xl bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)] shrink-0">
                  <div className="p-[2px] rounded-2xl bg-parchment">
                    <Avatar url={group?.avatar_url} name={group?.name || 'Circle'} size={64} className="!rounded-xl" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-[9.5px] font-bold uppercase tracking-wide ${meta.tint}`}>
                    <Icon size={11} /> {meta.label}
                  </span>
                  <h1 className="font-display font-semibold text-[22px] text-parchment leading-tight mt-1 truncate drop-shadow">{group?.name || '…'}</h1>
                  <button onClick={() => setShowMembers(true)} className="text-[12px] text-sand-200/90 inline-flex items-center gap-1.5 mt-0.5 hover:text-parchment">
                    <Users size={12} /> {compact(group?.member_count || 0)} members
                  </button>
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="shrink-0 flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-sand-300/70 bg-parchment/80">
              {isMember ? (
                <>
                  {group?.kind === 'thread' ? (
                    <button onClick={openChat} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-[13px] py-2.5 hover:brightness-105">
                      <MessageSquare size={15} /> Open the chat
                    </button>
                  ) : (
                    <button onClick={postToGroup} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-[13px] py-2.5 hover:brightness-105">
                      <Plus size={15} /> Post to circle
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setShowMembers(true)} className="grid place-items-center w-10 h-10 rounded-full border border-sand-300 text-ink-600 hover:bg-sand-200/60" title="Manage members">
                      <Settings size={16} />
                    </button>
                  )}
                  {!isOwner && (
                    <button onClick={() => groupId && join.mutate({ groupId, leave: true })} className="grid place-items-center w-10 h-10 rounded-full border border-sand-300 text-ink-500 hover:text-terra-600 hover:border-terra-500/40" title="Leave circle">
                      <LogOut size={16} />
                    </button>
                  )}
                  {isOwner && (
                    <button onClick={dissolve} className="grid place-items-center w-10 h-10 rounded-full border border-sand-300 text-ink-500 hover:text-terra-600 hover:border-terra-500/40" title="Dissolve circle">
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => groupId && join.mutate({ groupId })}
                  disabled={join.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-saffron-600 text-parchment font-semibold text-[13px] py-2.5 hover:bg-saffron-700 disabled:opacity-50"
                >
                  <Plus size={15} /> Join this circle
                </button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {group?.description && (
                <div className="px-4 sm:px-5 py-4 border-b border-sand-200/70">
                  <p className="text-[13.5px] text-ink-700 leading-relaxed">{group.description}</p>
                  {group.tags && group.tags.length > 0 && (
                    <p className="mt-2 text-[12px] font-medium text-saffron-700 space-x-2">
                      {group.tags.map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </p>
                  )}
                  {data && data.admins.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 inline-flex items-center gap-1"><Crown size={11} className="text-gold-600" /> Admins:</span>
                      {data.admins.map((a) => (
                        <button key={a.user_id} onClick={() => openUserProfile(a.user_id)} className="inline-flex items-center gap-1.5 rounded-full bg-sand-200/60 px-2 py-1 hover:bg-sand-300/60">
                          <Avatar url={a.avatar_url} name={a.full_name} size={18} />
                          <span className="text-[11.5px] font-medium text-ink-700">@{a.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Content pane */}
              <div className="px-3 sm:px-4 py-4">
                {isLoading && (
                  <div className="grid place-items-center py-16">
                    <Mandala className="w-16 h-16 text-gold-500/60 animate-spin-slower" />
                  </div>
                )}

                {!isLoading && group?.kind === 'thread' && (
                  <div className="text-center py-14">
                    <MessagesSquare className="mx-auto text-gold-500/70" size={30} />
                    <p className="font-display italic text-ink-600 mt-3">This is a thread circle — its life is in the chat.</p>
                    {isMember ? (
                      <button onClick={openChat} className="mt-4 inline-flex items-center gap-2 rounded-full bg-saffron-600 text-parchment px-6 py-2.5 text-sm font-semibold hover:bg-saffron-700">
                        <MessageSquare size={15} /> Open the chat
                      </button>
                    ) : (
                      <p className="text-[12px] text-ink-400 mt-2">Join to enter the conversation.</p>
                    )}
                  </div>
                )}

                {!isLoading && group?.kind === 'feed' && (
                  posts.length === 0 ? (
                    <EmptyPane label={isMember ? 'Be the first to post a moment here.' : 'No moments yet in this circle.'} onPost={isMember ? postToGroup : undefined} />
                  ) : (
                    <div className="flex flex-col gap-5 lg:gap-6 max-w-[540px] mx-auto">
                      {posts.map((p) => <PostCard key={p.id} post={p} />)}
                    </div>
                  )
                )}

                {!isLoading && group?.kind === 'forge' && (
                  posts.length === 0 ? (
                    <EmptyPane label={isMember ? 'Compose the first scroll for this circle.' : 'No scrolls yet in this circle.'} onPost={isMember ? postToGroup : undefined} />
                  ) : (
                    <div className="flex flex-col gap-4 max-w-[620px] mx-auto">
                      {posts.map((p) => <ForgeCard key={p.id} post={p} />)}
                    </div>
                  )
                )}
              </div>
            </div>
          </motion.div>

          {/* Members sheet */}
          <AnimatePresence>
            {showMembers && data && (
              <MembersSheet
                members={data.members}
                isAdmin={isAdmin}
                ownerId={group?.owner_id || ''}
                meId={user?.id || ''}
                onClose={() => setShowMembers(false)}
                onManage={(action, userId) => groupId && manage.mutate({ action, group_id: groupId, user_id: userId })}
                onOpenProfile={(uid) => {
                  openUserProfile(uid);
                  setShowMembers(false);
                  close();
                }}
              />
            )}
          </AnimatePresence>

          {/* Reader overlay — rendered ABOVE the circle so forge scrolls & posts open properly */}
          <AnimatePresence>
            {readerPostId !== null && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeReader}
                  className="fixed inset-0 z-[90] bg-neem-950/65 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 40 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                  className="fixed z-[95] inset-x-0 bottom-0 top-4 sm:inset-6 lg:inset-x-[18%] lg:inset-y-8 bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden flex flex-col shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.7)]"
                >
                  <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-sand-300/70 bg-parchment/90">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-saffron-700">Reading Pane</p>
                    <button onClick={closeReader} className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close reader">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                    <ReaderBody postId={readerPostId} />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

function EmptyPane({ label, onPost }: { label: string; onPost?: () => void }) {
  return (
    <div className="text-center py-14">
      <Mandala className="w-16 h-16 mx-auto text-sand-400" petals={12} />
      <p className="font-display italic text-ink-600 mt-3">{label}</p>
      {onPost && (
        <button onClick={onPost} className="mt-4 inline-flex items-center gap-2 rounded-full bg-saffron-600 text-parchment px-6 py-2.5 text-sm font-semibold hover:bg-saffron-700">
          <Plus size={15} /> Post now
        </button>
      )}
    </div>
  );
}

function MembersSheet({
  members,
  isAdmin,
  ownerId,
  meId,
  onClose,
  onManage,
  onOpenProfile,
}: {
  members: GroupMember[];
  isAdmin: boolean;
  ownerId: string;
  meId: string;
  onClose: () => void;
  onManage: (action: 'promote' | 'remove_member', userId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[80] bg-neem-950/50 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="fixed z-[85] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:max-h-[80vh] max-h-[80dvh] bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden flex flex-col"
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-sand-300/70">
          <p className="font-display font-semibold text-[16px] text-neem-950 inline-flex items-center gap-2">
            <Users size={16} className="text-saffron-600" /> Members
          </p>
          <button onClick={onClose} className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-sand-200/70">
          {members.map((m) => {
            const isTheOwner = m.user_id === ownerId;
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => onOpenProfile(m.user_id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <Avatar url={m.avatar_url} name={m.full_name} size={40} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink-900 truncate flex items-center gap-1.5">
                      {m.full_name}
                      {isTheOwner && <Crown size={12} className="text-gold-600" />}
                    </p>
                    <p className="text-[11.5px] text-ink-500 truncate">
                      @{m.username} · <span className={m.role === 'admin' ? 'text-neem-700 font-semibold' : ''}>{m.role}</span>
                    </p>
                  </div>
                </button>
                {isAdmin && !isTheOwner && m.user_id !== meId && (
                  <div className="flex items-center gap-1 shrink-0">
                    {m.role !== 'admin' && (
                      <button onClick={() => onManage('promote', m.user_id)} title="Make admin" className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:text-neem-700 hover:bg-neem-500/10">
                        <Shield size={15} />
                      </button>
                    )}
                    <button onClick={() => onManage('remove_member', m.user_id)} title="Remove" className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:text-terra-600 hover:bg-terra-500/10">
                      <UserPlus size={15} className="rotate-45" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
