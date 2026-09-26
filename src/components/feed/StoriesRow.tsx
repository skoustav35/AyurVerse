import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CheckCircle, ChevronLeft, ChevronRight, Eye, Loader2, Plus, Sparkles, Trash2, Vote, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Avatar from '../common/Avatar';
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import { useStories, useMyProfile } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import type { StatusChannel, Story, StoryPoll } from '../../lib/types';

const MUHURTA_PRESETS = [
  '🌅 Brahma Muhurta',
  '☀️ Surya Agni Peak',
  '🌙 Sandhya Twilight',
  '🌿 Sattvic Dinacharya',
  '✨ Ojas Vitality',
];

/* ------------------------------------------------------------------ viewer */

function StoryViewer({
  stories,
  index,
  onClose,
  onNavigate,
  onDelete,
}: {
  stories: Story[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onDelete: (id: number) => void;
}) {
  const story = stories[index];
  const openUserProfile = useUI((s) => s.openUserProfile);
  const pushToast = useUI((s) => s.pushToast);
  const { user } = useAuth();
  const isOwn = user?.id === story.user_id;

  const [pollData, setPollData] = useState<StoryPoll | null>(story.poll || null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setPollData(story.poll || null);
  }, [story.id, story.poll]);

  useEffect(() => {
    apiFetch('/api/stories', {
      method: 'PUT',
      body: JSON.stringify({ id: story.id }),
    }).catch(() => {});
  }, [story.id]);

  useEffect(() => {
    if (isHovered) return;
    const duration = pollData ? 8000 : 5000;
    const t = window.setTimeout(() => {
      if (index < stories.length - 1) onNavigate(index + 1);
      else onClose();
    }, duration);
    return () => window.clearTimeout(t);
  }, [index, stories.length, onNavigate, onClose, isHovered, pollData]);

  const voteOption = async (optionIdx: number) => {
    if (!user) {
      pushToast('Sign in to participate in this Muhurta poll', 'error');
      return;
    }
    if (!pollData) return;

    const oldPoll = pollData;
    const newOptions = pollData.options.map((opt, i) => {
      let votes = opt.votes;
      if (oldPoll.user_voted_idx === i) votes = Math.max(0, votes - 1);
      if (i === optionIdx) votes += 1;
      return { ...opt, votes };
    });
    const total = newOptions.reduce((s, o) => s + o.votes, 0);
    setPollData({
      ...pollData,
      options: newOptions,
      total_votes: total,
      user_voted_idx: optionIdx,
    });

    try {
      const res = await apiFetch<{ ok: boolean; poll: StoryPoll }>('/api/stories', {
        method: 'PUT',
        body: JSON.stringify({ id: story.id, action: 'vote', option_idx: optionIdx }),
      });
      if (res.poll) setPollData(res.poll);
    } catch (err) {
      setPollData(oldPoll);
      pushToast((err as Error).message, 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-neem-950/95 backdrop-blur-sm grid place-items-center"
      onClick={onClose}
    >
      <motion.div
        key={story.id}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="relative w-full max-w-[420px] h-[86dvh] max-h-[780px] rounded-3xl overflow-hidden shadow-warm select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x > rect.width * 0.5) {
            if (index < stories.length - 1) onNavigate(index + 1);
            else onClose();
          } else if (index > 0) {
            onNavigate(index - 1);
          }
        }}
      >
        {story.media_type === 'video' ? (
          <video src={story.media_url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <img src={story.media_url} alt={`${story.author_username}'s status`} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-neem-950/75 via-transparent to-neem-950/75 pointer-events-none" />

        <div className="absolute top-3 left-3 right-3 flex gap-1.5 z-30">
          {stories.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 rounded-full bg-parchment/30 overflow-hidden">
              {i < index && <div className="h-full w-full bg-parchment" />}
              {i === index && (
                <motion.div
                  key={`bar-${story.id}`}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: pollData ? 8 : 5, ease: 'linear' }}
                  className="h-full bg-gradient-to-r from-saffron-400 to-gold-400"
                />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            openUserProfile(story.user_id);
          }}
          className="absolute top-6 left-4 flex items-center gap-2.5 group z-30"
        >
          <Avatar url={story.author_avatar} name={story.author_name} size={32} className="ring-2 ring-gold-400" />
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-parchment text-sm font-semibold drop-shadow group-hover:text-gold-300 transition-colors">
                {story.author_username}
              </span>
              {story.is_following && (
                <span className="text-[9px] uppercase tracking-wider font-bold text-neem-950 bg-gold-400/90 rounded px-1.5 py-0.5">
                  following
                </span>
              )}
            </div>
            {story.muhurta && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gold-300 font-medium drop-shadow">
                <Sparkles size={10} className="text-gold-400 animate-pulse" />
                {story.muhurta}
              </span>
            )}
          </div>
        </button>

        <div className="absolute top-5 right-4 flex items-center gap-1 z-30">
          {isOwn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(story.id);
              }}
              className="text-parchment/85 hover:text-terra-400 p-1.5 transition-colors"
              aria-label="Delete status"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-parchment/90 hover:text-parchment p-1 transition-colors"
            aria-label="Close stories"
          >
            <X size={22} />
          </button>
        </div>

        {/* Interactive Story Poll */}
        {pollData && (
          <div
            className="absolute top-1/2 left-5 right-5 -translate-y-1/2 z-20 bg-neem-950/85 backdrop-blur-md border border-gold-500/35 rounded-2xl p-4 shadow-2xl text-parchment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 mb-2 text-gold-400 text-[11px] font-bold uppercase tracking-wider">
              <Vote size={14} className="text-gold-400" />
              <span>Ayur Muhurta Poll</span>
            </div>
            <p className="font-display font-medium text-[15px] mb-3 leading-snug text-parchment">{pollData.question}</p>
            <div className="space-y-2">
              {pollData.options.map((opt, oIdx) => {
                const hasVoted = pollData.user_voted_idx !== null && pollData.user_voted_idx !== undefined;
                const isMyVote = pollData.user_voted_idx === oIdx;
                const total = pollData.total_votes || 0;
                const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;

                return (
                  <button
                    key={oIdx}
                    onClick={() => voteOption(oIdx)}
                    className={`w-full relative overflow-hidden text-left py-2.5 px-3.5 rounded-xl border transition-all ${
                      isMyVote
                        ? 'border-gold-400 bg-gold-500/20 shadow-sm'
                        : 'border-parchment/15 bg-neem-900/60 hover:border-gold-400/50'
                    }`}
                  >
                    {hasVoted && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-saffron-500/40 to-gold-500/40 pointer-events-none"
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between gap-2 text-xs md:text-sm">
                      <span className="font-medium text-parchment flex items-center gap-1.5">
                        {opt.text}
                        {isMyVote && <CheckCircle size={14} className="text-gold-400 inline shrink-0" />}
                      </span>
                      {hasVoted && (
                        <span className="font-mono text-xs font-bold text-gold-300 shrink-0">
                          {pct}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 flex justify-between items-center text-[11px] text-ink-300">
              <span className="text-[10px] text-gold-400/80">Tap to vote</span>
              <span>{pollData.total_votes || 0} {(pollData.total_votes || 0) === 1 ? 'response' : 'responses'}</span>
            </div>
          </div>
        )}

        {story.caption && (
          <div className="absolute bottom-6 inset-x-5 text-center z-20">
            <p className="text-parchment text-[14px] font-medium leading-relaxed drop-shadow-lg">{story.caption}</p>
          </div>
        )}

        {isOwn && (
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 text-parchment/90 text-xs bg-neem-950/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-parchment/10">
            <Eye size={13} className="text-gold-400" />
            <span className="font-semibold">{story.views_count || 0}</span>
          </div>
        )}

        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-parchment/80 hover:text-parchment bg-neem-950/40 rounded-full p-1.5 backdrop-blur z-30"
            aria-label="Previous status"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {index < stories.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-parchment/80 hover:text-parchment bg-neem-950/40 rounded-full p-1.5 backdrop-blur z-30"
            aria-label="Next status"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------- creator */

function StatusCreator({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [muhurta, setMuhurta] = useState<string>('🌅 Brahma Muhurta');
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpt1, setPollOpt1] = useState('');
  const [pollOpt2, setPollOpt2] = useState('');
  const [busy, setBusy] = useState(false);
  const [upPct, setUpPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File) => {
    if (f.type.startsWith('video/') && f.size > 48 * 1024 * 1024) {
      pushToast('Videos over 50MB are too heavy — trim the clip first', 'error');
      return;
    }
    if (f.size > 60 * 1024 * 1024) {
      pushToast('Status media must be under 60MB', 'error');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const share = async () => {
    if (!file) return;
    setBusy(true);
    setUpPct(0);
    try {
      const url = await uploadMedia(file, (p) => setUpPct(p));
      const payload: Record<string, unknown> = {
        media_url: url,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        caption: caption.trim() || null,
        muhurta: muhurta || null,
      };

      if (hasPoll && pollQ.trim() && pollOpt1.trim() && pollOpt2.trim()) {
        payload.poll = {
          question: pollQ.trim(),
          options: [pollOpt1.trim(), pollOpt2.trim()],
        };
      }

      await apiFetch('/api/stories', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
      pushToast('Your status now glows atop the feed');
      setUpPct(null);
      onClose();
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[85] bg-neem-950/60 backdrop-blur-sm"
      />
      <div className="fixed inset-0 z-[88] grid place-items-center p-4 pointer-events-none overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="pointer-events-auto glass-warm rounded-3xl w-full max-w-[420px] p-5 my-auto max-h-[92vh] overflow-y-auto no-scrollbar"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-lg text-neem-950">Kindle a status</h3>
            <button onClick={onClose} className="p-2 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className={`mt-4 w-full overflow-hidden rounded-2xl border-2 transition-colors ${
              preview ? 'border-transparent' : 'border-dashed border-sand-300 hover:border-gold-500/60'
            }`}
          >
            {preview ? (
              file?.type.startsWith('video') ? (
                <video src={preview} autoPlay muted loop playsInline className="w-full max-h-56 object-cover" />
              ) : (
                <img src={preview} alt="status preview" className="w-full max-h-56 object-cover" />
              )
            ) : (
              <span className="grid place-items-center py-8 bg-parchment/50">
                <Camera className="text-sand-400" size={26} />
                <span className="block text-sm font-medium text-ink-700 mt-2">Choose a photo or video</span>
                <span className="block text-[11px] text-ink-400 mt-0.5">it glows for a while, then fades</span>
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
            }}
          />

          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={160}
            placeholder="Whisper a caption…"
            className="mt-3 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2 text-[15px] lg:text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
          />

          {/* Muhurta Selector */}
          <div className="mt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
              Muhurta Badge
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MUHURTA_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMuhurta(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-all ${
                    muhurta === p
                      ? 'bg-gold-500 text-neem-950 font-bold shadow-xs'
                      : 'bg-sand-200/60 text-ink-700 hover:bg-sand-300/60'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Story Poll Toggle */}
          <div className="mt-4 pt-3 border-t border-sand-200">
            <button
              type="button"
              onClick={() => setHasPoll(!hasPoll)}
              className="flex items-center justify-between w-full text-left text-xs font-semibold text-neem-900 hover:text-gold-600"
            >
              <span className="flex items-center gap-1.5">
                <Vote size={14} className="text-gold-500" />
                {hasPoll ? 'Remove Interactive Poll' : 'Add Ayur Muhurta Poll'}
              </span>
              <span className="text-[11px] text-gold-600 font-bold">{hasPoll ? '[-] Remove' : '[+] Add'}</span>
            </button>

            {hasPoll && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2.5 space-y-2 bg-sand-100/60 p-3 rounded-2xl border border-sand-300/60"
              >
                <input
                  value={pollQ}
                  onChange={(e) => setPollQ(e.target.value)}
                  maxLength={100}
                  placeholder="Poll Question (e.g. Which herbal infusion today?)"
                  className="w-full rounded-lg border border-sand-300 bg-parchment px-3 py-1.5 text-xs text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={pollOpt1}
                    onChange={(e) => setPollOpt1(e.target.value)}
                    maxLength={35}
                    placeholder="Option 1 (e.g. Warm Tulsi 🌿)"
                    className="w-full rounded-lg border border-sand-300 bg-parchment px-3 py-1.5 text-xs text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                  <input
                    value={pollOpt2}
                    onChange={(e) => setPollOpt2(e.target.value)}
                    maxLength={35}
                    placeholder="Option 2 (e.g. Golden Milk 🥛)"
                    className="w-full rounded-lg border border-sand-300 bg-parchment px-3 py-1.5 text-xs text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              </motion.div>
            )}
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={share}
            disabled={!file || busy}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-2.5 disabled:opacity-40 hover:brightness-105 inline-flex items-center justify-center gap-2 shadow-sm"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? (upPct !== null ? `Kindling… ${upPct}%` : 'Kindling…') : 'Share status'}
          </motion.button>
        </motion.div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- rail: channels */

export default function StoriesRow() {
  const { data: channels, isLoading } = useStories();
  const { user } = useAuth();
  const pushToast = useUI((s) => s.pushToast);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const queryClient = useQueryClient();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  const chans = useMemo(() => channels ?? [], [channels]);
  const storyList = useMemo(
    () => chans.filter((c) => c.has_story).flatMap((c) => c.stories),
    [chans],
  );
  const firstIndexOf = useMemo(() => {
    const map = new Map<string, number>();
    let cursor = 0;
    for (const c of chans) {
      if (c.has_story) {
        map.set(c.user_id, cursor);
        cursor += c.stories.length;
      }
    }
    return map;
  }, [chans]);

  const open = (i: number) => {
    setViewerIndex(i);
    const s = storyList[i];
    if (s) setSeen((prev) => new Set(prev).add(s.id));
  };

  const deleteStatus = async (id: number) => {
    try {
      await apiFetch('/api/stories', { method: 'DELETE', body: JSON.stringify({ id }) });
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
      setViewerIndex(null);
      pushToast('Status let go — like smoke', 'neem');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    }
  };

  const myName = (user?.user_metadata?.full_name as string | undefined) || 'you';
  const meProfile = useMyProfile().data;
  const myAvatar = (meProfile?.avatar_url || user?.user_metadata?.avatar_url) as string | undefined;
  const ownChannel = chans.find((c) => c.is_own);
  const ownSeen = ownChannel ? ownChannel.stories.every((s) => seen.has(s.id)) : false;

  const channelTile = (c: StatusChannel) => {
    const allSeen = c.has_story && c.stories.every((s) => seen.has(s.id));
    return (
      <button
        key={c.user_id}
        onClick={() => {
          if (c.has_story) open(firstIndexOf.get(c.user_id) ?? 0);
          else openUserProfile(c.user_id);
        }}
        className="group flex flex-col items-center gap-1.5 shrink-0"
        title={c.has_story ? `${c.author_username}'s status` : `${c.author_username} — channel you follow (no status yet)`}
      >
        <motion.span
          whileTap={{ scale: 0.9 }}
          className={`block p-[2.5px] rounded-full ${
            c.has_story
              ? allSeen
                ? 'bg-sand-400'
                : 'bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)]'
              : 'border-2 border-dashed border-gold-500/60'
          }`}
        >
          <span className={`block ${c.has_story ? 'p-[2.5px] bg-parchment' : 'p-[3px] bg-parchment'} rounded-full`}>
            <Avatar url={c.author_avatar} name={c.author_name} size={58} />
          </span>
        </motion.span>
        <span className={`text-[11px] max-w-[72px] truncate ${allSeen ? 'text-ink-500' : 'text-ink-800 font-medium'}`}>
          {c.author_username}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400">
          Your channels
        </p>
      </div>
      <div className="flex gap-4 px-4 pb-4 overflow-x-auto no-scrollbar">
        {/* own tile — + creates; a live own story opens the viewer */}
        <button
          onClick={() => {
            if (ownChannel?.has_story) open(firstIndexOf.get(ownChannel.user_id) ?? 0);
            else setCreating(true);
          }}
          className="flex flex-col items-center gap-1.5 shrink-0 group relative"
        >
          <motion.span
            whileTap={{ scale: 0.9 }}
            className={`relative block p-[2.5px] rounded-full ${
              ownChannel?.has_story
                ? ownSeen
                  ? 'bg-sand-400'
                  : 'bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)]'
                : 'border-2 border-dashed border-sand-400 group-hover:border-gold-500'
            } transition-colors`}
          >
            <span className={`block ${ownChannel?.has_story ? 'p-[2.5px]' : 'p-[3px]'} rounded-full bg-parchment`}>
              <Avatar url={myAvatar} name={myName} size={58} />
            </span>
          </motion.span>
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              setCreating(true);
            }}
            className="absolute bottom-[18px] -right-0.5 grid place-items-center w-[22px] h-[22px] rounded-full bg-saffron-600 text-parchment ring-2 ring-parchment hover:bg-saffron-500 transition-colors"
            title="Share a status"
          >
            <Plus size={13} strokeWidth={3} />
          </span>
          <span className="text-[11px] text-ink-700 font-medium">You</span>
        </button>

        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="skeleton w-16 h-16 !rounded-full" />
              <div className="skeleton h-2 w-12" />
            </div>
          ))}

        {chans.filter((c) => !c.is_own).map(channelTile)}

        {!isLoading && chans.filter((c) => !c.is_own).length === 0 && (
          <p className="self-center text-[12px] italic font-display text-ink-500 leading-snug max-w-[220px]">
            Follow a weaver and their channel will glow here.
          </p>
        )}
      </div>

      <AnimatePresence>
        {viewerIndex !== null && storyList[viewerIndex] && (
          <StoryViewer
            stories={storyList}
            index={viewerIndex}
            onClose={() => setViewerIndex(null)}
            onNavigate={setViewerIndex}
            onDelete={deleteStatus}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{creating && <StatusCreator onClose={() => setCreating(false)} />}</AnimatePresence>
    </>
  );
}
