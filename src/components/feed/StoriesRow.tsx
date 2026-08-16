import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Avatar from '../common/Avatar';
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import { useStories, useMyProfile } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import type { StatusChannel, Story } from '../../lib/types';

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
  const { user } = useAuth();
  const isOwn = user?.id === story.user_id;

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (index < stories.length - 1) onNavigate(index + 1);
      else onClose();
    }, 4500);
    return () => window.clearTimeout(t);
  }, [index, stories.length, onNavigate, onClose]);

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
        className="relative w-full max-w-[420px] h-[86dvh] max-h-[780px] rounded-3xl overflow-hidden shadow-warm"
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
        <div className="absolute inset-0 bg-gradient-to-b from-neem-950/70 via-transparent to-neem-950/70 pointer-events-none" />

        <div className="absolute top-3 left-3 right-3 flex gap-1.5">
          {stories.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 rounded-full bg-parchment/30 overflow-hidden">
              {i < index && <div className="h-full w-full bg-parchment" />}
              {i === index && (
                <motion.div
                  key={`bar-${story.id}`}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 4.5, ease: 'linear' }}
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
          className="absolute top-6 left-4 flex items-center gap-2.5 group"
        >
          <Avatar url={story.author_avatar} name={story.author_name} size={32} className="ring-2 ring-gold-400" />
          <span className="text-parchment text-sm font-semibold drop-shadow group-hover:text-gold-300 transition-colors">
            {story.author_username}
          </span>
          {story.is_following && (
            <span className="text-[9px] uppercase tracking-wider font-bold text-neem-950 bg-gold-400/90 rounded px-1.5 py-0.5">
              following
            </span>
          )}
        </button>

        <div className="absolute top-5 right-4 flex items-center gap-1">
          {isOwn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(story.id);
              }}
              className="text-parchment/85 hover:text-terra-400 p-1.5"
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
            className="text-parchment/90 hover:text-parchment p-1"
            aria-label="Close stories"
          >
            <X size={22} />
          </button>
        </div>

        {story.caption && (
          <div className="absolute bottom-6 inset-x-5 text-center">
            <p className="text-parchment text-[14px] font-medium leading-relaxed drop-shadow-lg">{story.caption}</p>
          </div>
        )}

        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(index - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-parchment/80 hover:text-parchment bg-neem-950/40 rounded-full p-1.5 backdrop-blur"
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-parchment/80 hover:text-parchment bg-neem-950/40 rounded-full p-1.5 backdrop-blur"
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
      await apiFetch('/api/stories', {
        method: 'POST',
        body: JSON.stringify({
          media_url: url,
          media_type: file.type.startsWith('video') ? 'video' : 'image',
          caption: caption.trim() || null,
        }),
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
      <div className="fixed inset-0 z-[88] grid place-items-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="pointer-events-auto glass-warm rounded-3xl w-full max-w-[400px] p-5"
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
                <video src={preview} autoPlay muted loop playsInline className="w-full max-h-64 object-cover" />
              ) : (
                <img src={preview} alt="status preview" className="w-full max-h-64 object-cover" />
              )
            ) : (
              <span className="grid place-items-center py-10 bg-parchment/50">
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
            className="mt-3 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-[16px] lg:text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
          />

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={share}
            disabled={!file || busy}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3 disabled:opacity-40 hover:brightness-105 inline-flex items-center justify-center gap-2"
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
