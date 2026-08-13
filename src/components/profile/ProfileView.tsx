import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, CalendarDays, Camera, LogOut, PencilLine, Sprout, Users, Wand2, Wallet, Sparkles, X, Rocket } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';
import { RowSkeleton } from '../common/Skeletons';
import { ForgeRow, ImageTile } from '../search/Rows';
import SavedPanel from '../saved/SavedView';
import AiChat from '../ai/AiChat';
import AnalyticsView from '../studio/AnalyticsView';
import BoostView from '../studio/BoostView';
import PayoutsView from '../studio/PayoutsView';
import supabase from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import { compact } from '../../lib/format';
import type { Post, Profile } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useFollows } from '../../hooks/queries';
import { useUI } from '../../store/ui';

function EditProfileModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  const [fullName, setFullName] = useState(profile.full_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarFile = async (file: File) => {
    if (file.size > 32 * 1024 * 1024) {
      pushToast('Avatar must be under 32MB', 'error');
      return;
    }
    try {
      setBusy(true);
      const url = await uploadMedia(file);
      setAvatarUrl(url);
      pushToast('Portrait uploaded', 'neem');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!fullName.trim() || !username.trim()) {
      pushToast('Name and username are required', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFetch<Profile>('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName.trim(), username: username.trim(), bio: bio.trim(), avatar_url: avatarUrl || null }),
      });
      await queryClient.invalidateQueries({ queryKey: ['me-profile'] });
      pushToast('Your card in the atelier has been re-inked', 'neem');
      onClose();
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-sand-300 bg-parchment/80 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400';

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[75] bg-neem-950/55 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[80] grid place-items-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="pointer-events-auto glass-warm rounded-3xl w-full max-w-md p-6"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-xl text-neem-950">Re-ink your card</h3>
            <button onClick={onClose} className="p-2 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close">
              ✕
            </button>
          </div>

          <div className="flex items-center gap-4 mt-5">
            <Avatar url={avatarUrl || null} name={fullName || 'w'} size={64} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-sand-300 px-4 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-sand-200/60 transition-colors"
            >
              <Camera size={14} /> Change portrait
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarFile(f);
              }}
            />
          </div>

          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Full name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} maxLength={60} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Username</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} maxLength={30} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Bio</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} className={`${inputClass} resize-none`} rows={3} maxLength={200} />
            </label>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={save}
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3 disabled:opacity-50 hover:brightness-105"
          >
            {busy ? 'Grinding pigment…' : 'Save changes'}
          </motion.button>
        </motion.div>
      </div>
    </>
  );
}

type StudioSub = 'analytics' | 'boost' | 'payouts';

export default function ProfileView() {
  const { user } = useAuth();
  const pushToast = useUI((s) => s.pushToast);
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  const [editing, setEditing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [subTab, setSubTab] = useState<'weave' | 'apothecary' | 'studio'>('weave');
  const [studioSub, setStudioSub] = useState<StudioSub>('analytics');
  const [segment, setSegment] = useState<'media' | 'lore'>('media');
  const { data: followsData } = useFollows();

  const profileQuery = useQuery({
    queryKey: ['me-profile'],
    enabled: !!user,
    queryFn: async () => {
      const existing = await apiFetch<Profile | null>('/api/profiles?user_id=me');
      if (existing) return existing;
      return apiFetch<Profile>('/api/profiles', { method: 'POST', body: JSON.stringify({}) });
    },
  });

  const postsQuery = useQuery({
    queryKey: ['my-posts', user?.id],
    enabled: !!user,
    queryFn: () => apiFetch<{ items: Post[] }>(`/api/posts?author=${user!.id}&limit=30`),
  });

  useEffect(() => {
    if (profileQuery.error) pushToast((profileQuery.error as Error).message, 'error');
  }, [profileQuery.error, pushToast]);

  const posts = postsQuery.data?.items ?? [];
  const media = posts.filter((p) => p.kind === 'visual' && p.media_url);
  const lore = posts.filter((p) => p.kind === 'forge');
  const totalLikes = posts.reduce((acc, p) => acc + p.likes_count, 0);
  const followingCount = followsData?.ids.length ?? 0;

  const profile = profileQuery.data;
  const fallbackName = (user?.user_metadata?.full_name as string | undefined) || user?.email?.split('@')[0] || 'weaver';

  return (
    <div className="w-full max-w-[820px] mx-auto pb-14">
      <div className="relative h-40 lg:h-48 overflow-hidden lg:rounded-b-3xl bg-[linear-gradient(120deg,#12291c,#1b4230_45%,#7a4a12)]">
        <Mandala className="absolute -right-16 -top-20 w-72 h-72 text-gold-400/25 animate-spin-slower" />
        <Mandala className="absolute left-10 -bottom-24 w-64 h-64 text-saffron-500/20 animate-spin-rev" petals={12} />
      </div>

      <div className="px-4 lg:px-6 -mt-10 relative z-10">
        {profileQuery.isLoading ? (
          <div className="card-warm p-6"><RowSkeleton /></div>
        ) : (
          <div className="card-warm p-5">
            <div className="flex items-start gap-4">
              <div className="p-[3px] rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)] shrink-0">
                <div className="p-[3px] rounded-full bg-parchment">
                  <Avatar url={profile?.avatar_url} name={profile?.full_name || fallbackName} size={78} />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <h1 className="font-display font-semibold text-[22px] text-ink-900 leading-tight">
                  {profile?.full_name || fallbackName}
                </h1>
                <p className="text-[13px] text-ink-500">@{profile?.username || fallbackName.toLowerCase()}</p>
                {profile?.bio && <p className="text-[13px] text-ink-700 leading-relaxed mt-2">{profile.bio}</p>}
                <p className="text-[11.5px] text-ink-400 mt-2 inline-flex items-center gap-1.5">
                  <CalendarDays size={12} />
                  Weaving since {new Date(user?.created_at ?? Date.now()).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5 mt-5 px-1 flex-wrap">
              <div>
                <p className="font-display font-semibold text-lg text-ink-900">{compact(posts.length)}</p>
                <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-400">posts</p>
              </div>
              <div>
                <p className="font-display font-semibold text-lg text-ink-900">{compact(totalLikes)}</p>
                <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-400">appreciations</p>
              </div>
              <div>
                <p className="font-display font-semibold text-lg text-ink-900 inline-flex items-center gap-1">
                  <Users size={13} className="text-gold-600" />
                  {compact(followingCount)}
                </p>
                <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-400">channels</p>
              </div>
              <div className="flex-1" />
              {profile && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sand-300 px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-sand-200/60 hover:border-gold-500/60 transition-colors"
                >
                  <PencilLine size={13} />
                  Edit profile
                </button>
              )}
              <button
                onClick={() => supabase.auth.signOut()}
                className="lg:hidden p-2.5 rounded-full border border-sand-300 text-ink-500 hover:text-terra-600 hover:border-terra-500/40 transition-colors"
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Top-level sub-tabs — a hand-finished ayurvedic segmented control */}
        <div className="relative mt-6">
          {/* palm-leaf tray with a double hairline (sand outer, gold inner) */}
          <div className="relative grid grid-cols-3 gap-1 rounded-[20px] p-1.5 bg-gradient-to-b from-parchment via-parchment to-parchment-deep/70 border border-sand-300/90 ring-1 ring-inset ring-gold-500/20 shadow-[0_10px_30px_-16px_rgba(18,41,28,0.45),inset_0_1px_0_rgb(255_252_240/0.7)]">
            {(
              [
                { id: 'weave', label: 'Weave', icon: Sprout, hint: 'what you have grown' },
                { id: 'apothecary', label: 'Apothecary', icon: Bookmark, hint: 'what you have kept' },
                { id: 'studio', label: 'Studio', icon: Wand2, hint: 'analytics · payouts' },
              ] as const
            ).map((t) => {
              const activeTab = subTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSubTab(t.id)}
                  className={`group relative rounded-2xl px-1.5 py-2.5 sm:px-4 min-h-[64px] sm:min-h-0 transition-colors ${
                    activeTab ? '' : 'hover:bg-sand-200/40'
                  }`}
                >
                  {activeTab && (
                    <motion.span
                      layoutId="you-subtab"
                      className="absolute inset-0 rounded-2xl bg-gradient-to-br from-neem-800 via-neem-800 to-neem-700 ring-1 ring-gold-400/40 shadow-[0_12px_26px_-10px_rgba(18,41,28,0.75)] overflow-hidden"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    >
                      {/* warm turmeric glow + top sheen */}
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-gold-400/25 blur-2xl" />
                      <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/60 to-transparent" />
                    </motion.span>
                  )}
                  <span className="relative z-10 flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-2">
                    <span
                      className={`grid place-items-center w-9 h-9 sm:w-7 sm:h-7 rounded-full transition-all duration-300 ${
                        activeTab
                          ? 'bg-gradient-to-br from-gold-400/25 to-saffron-500/15 ring-1 ring-gold-400/50 shadow-[inset_0_1px_0_rgb(255_246_214/0.4)]'
                          : 'bg-sand-200/60 group-hover:bg-sand-300/70'
                      }`}
                    >
                      <t.icon
                        size={16}
                        className={`transition-colors ${activeTab ? 'text-gold-300' : 'text-ink-500 group-hover:text-neem-700'}`}
                      />
                    </span>
                    <span className="flex flex-col items-center sm:items-start leading-tight">
                      <span
                        className={`text-[11.5px] sm:text-[13px] font-semibold tracking-tight transition-colors ${
                          activeTab ? 'text-parchment' : 'text-ink-700'
                        }`}
                      >
                        {t.label}
                      </span>
                      <span
                        className={`hidden lg:inline text-[9px] uppercase tracking-[0.14em] ${
                          activeTab ? 'text-gold-300/75' : 'text-ink-400'
                        }`}
                      >
                        {t.hint}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {subTab === 'apothecary' ? (
          <SavedPanel />
        ) : subTab === 'studio' ? (
          <StudioView active={studioSub} onChange={setStudioSub} />
        ) : (
          <div>
            <div className="flex rounded-full border border-sand-300 bg-parchment p-1 mt-5 w-fit">
              {(
                [
                  { id: 'media', label: 'Media', icon: '🖼', count: media.length },
                  { id: 'lore', label: 'Scrolls', icon: '📜', count: lore.length },
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
                    <motion.span layoutId="profile-pill" className="absolute inset-0 rounded-full bg-neem-800" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                  )}
                  <span className="relative z-10">{s.label} · {s.count}</span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              {postsQuery.isLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton aspect-square !rounded-xl" />
                  ))}
                </div>
              ) : segment === 'media' ? (
                media.length === 0 ? (
                  <EmptyWeave onWeave={() => setComposerOpen(true)} label="Weave your first visual post" />
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {media.map((p) => (
                      <ImageTile key={p.id} post={p} />
                    ))}
                  </div>
                )
              ) : lore.length === 0 ? (
                <EmptyWeave onWeave={() => setComposerOpen(true)} label="Compose your first scroll" />
              ) : (
                <div className="space-y-2.5">
                  {lore.map((p) => (
                    <ForgeRow key={p.id} post={p} q="" />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>{editing && profile && <EditProfileModal profile={profile} onClose={() => setEditing(false)} />}</AnimatePresence>

      {/* Mobile-only: floating Vaidya AI button + full-screen chat sheet */}
      <motion.button
        onClick={() => setAiOpen(true)}
        whileTap={{ scale: 0.92 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 24, delay: 0.2 }}
        className="lg:hidden fixed right-3.5 bottom-[calc(130px+env(safe-area-inset-bottom))] z-[45] grid place-items-center w-12 h-12 rounded-full bg-gradient-to-br from-neem-800 to-neem-700 ring-2 ring-gold-500/50 shadow-[0_14px_30px_-10px_rgba(18,41,28,0.7)]"
        aria-label="Open Vaidya AI"
      >
        <Sparkles size={20} className="text-gold-300" />
        <span className="absolute inset-0 rounded-full border border-gold-400/40 animate-ping-slow" />
      </motion.button>

      <AnimatePresence>
        {aiOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAiOpen(false)}
              className="lg:hidden fixed inset-0 z-[70] bg-neem-950/55 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="lg:hidden fixed inset-x-0 bottom-0 z-[75] h-[94dvh] rounded-t-[26px] overflow-hidden bg-parchment shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
            >
              <AiChat onClose={() => setAiOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function StudioView({ active, onChange }: { active: StudioSub; onChange: (s: StudioSub) => void }) {
  const tabs: { id: StudioSub; label: string; icon: typeof Wand2 }[] = [
    { id: 'analytics', label: 'Analytics', icon: Wand2 },
    { id: 'boost', label: 'Boost', icon: Rocket },
    { id: 'payouts', label: 'Payouts', icon: Wallet },
  ];
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-sand-300 bg-parchment p-1 text-[11.5px] font-semibold">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex-1 justify-center px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
              active === t.id ? 'text-parchment' : 'text-ink-600 hover:text-neem-800'
            }`}
          >
            {active === t.id && (
              <motion.span layoutId="studio-pill" className="absolute inset-0 rounded-xl bg-neem-800" transition={{ type: 'spring', stiffness: 360, damping: 30 }} />
            )}
            <t.icon size={13} className="relative z-10" />
            <span className="relative z-10">{t.label}</span>
          </button>
        ))}
      </div>
      {active === 'analytics' && <AnalyticsView />}
      {active === 'boost' && <BoostView />}
      {active === 'payouts' && <PayoutsView />}
    </div>
  );
}

function EmptyWeave({ onWeave, label }: { onWeave: () => void; label: string }) {
  return (
    <div className="text-center py-12 card-warm">
      <Mandala className="w-20 h-20 mx-auto text-sand-400" petals={12} />
      <p className="font-display text-lg text-ink-900 mt-4">This corner of your garden awaits.</p>
      <button
        onClick={onWeave}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-saffron-600 text-parchment px-6 py-2.5 text-sm font-semibold hover:bg-saffron-700 transition-colors"
      >
        {label}
      </button>
    </div>
  );
}
