import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  CornerDownLeft,
  CornerUpRight,
  ImagePlus,
  Loader2,
  LogOut,
  MessageCircle,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Search,
  Send,
  SmilePlus,
  Sparkles,
  SquarePen,
  Sticker,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Avatar from '../common/Avatar';
import Mandala, { LotusMark } from '../common/Mandala';
import supabase from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import { formatDuration, timeAgo } from '../../lib/format';
import type { ChatMessage, Post, Profile, Thread } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  useCreateThread,
  useDeleteMessage,
  useLeaveThread,
  useMarkThreadRead,
  useMessages,
  useReactToMessage,
  useSendMessage,
  useThreads,
  useMyProfile,
} from '../../hooks/queries';
import { useUI } from '../../store/ui';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { usePresence } from '../../hooks/usePresence';

const QUICK_EMOJI = ['❤️', '🙏', '🔥', '😂', '👏', '😮'];
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
const STICKERS = ['🪷', '🌺', '🪔', '🦚', '🐘', '🌊', '🔥', '🌙', '☀️', '📿', '🎶', '🌿', '☕', '🪔', '🧡', '🙏'];
const REPLY_TOKEN = /^⟦r:(\d+)⟧([\s\S]*)$/;

/* ------------------------------------------------------- rich chat text */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|_[a-zA-Z0-9][^_\n]*[^_\n\s]_|https?:\/\/[^\s<>")\]]+)/g;

function richText(text: string, mine: boolean) {
  const parts = text.split(INLINE);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className={`font-mono text-[12px] px-1.5 py-0.5 rounded ${
          mine ? 'bg-neem-950/25 text-parchment' : 'bg-sand-200 text-terra-700'
        }`}>
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^https?:\/\//.test(part))
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`underline underline-offset-2 break-all ${mine ? 'text-parchment decoration-parchment/60' : 'text-saffron-700 decoration-gold-400'}`}
        >
          {part}
        </a>
      );
    return <span key={i}>{part}</span>;
  });
}

/* ------------------------------------------------------------ voice note */

let __waveCache = new Map<number, number[]>();
function waveBars(seed: number): number[] {
  const hit = __waveCache.get(seed);
  if (hit) return hit;
  let s = seed * 2654435761 >>> 0;
  const bars = Array.from({ length: 30 }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return 22 + ((s / 4294967296) * 78);
  });
  if (__waveCache.size > 400) __waveCache = new Map();
  __waveCache.set(seed, bars);
  return bars;
}

function VoiceNote({ src, mine, seedKey }: { src: string; mine: boolean; seedKey: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(0);

  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 min-w-[200px] ${
        mine
          ? 'bg-gradient-to-br from-saffron-500 to-saffron-600 text-parchment'
          : 'bg-parchment border border-sand-300/80 text-ink-800'
      }`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        onClick={() => (playing ? audioRef.current?.pause() : audioRef.current?.play())}
        className={`grid place-items-center w-9 h-9 rounded-full shrink-0 transition-transform active:scale-90 ${
          mine ? 'bg-parchment text-saffron-700' : 'bg-saffron-600 text-parchment'
        }`}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-[2.5px] h-7" aria-hidden="true">
          {waveBars(seedKey).map((h, i) => {
            const played = dur > 0 && i / 30 <= t / dur;
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-colors duration-150 ${
                  played ? (mine ? 'bg-parchment' : 'bg-saffron-600') : mine ? 'bg-parchment/35' : 'bg-sand-300'
                }`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <p className={`text-[10px] mt-0.5 ${mine ? 'text-parchment/85' : 'text-ink-500'}`}>
          {formatDuration(t)} / {formatDuration(dur)}
        </p>
      </div>
      <Mic size={13} className={mine ? 'text-parchment/70' : 'text-sand-400'} />
    </div>
  );
}

/* ----------------------------------------------------------- post share */

function SharedPostCard({ post }: { post: Post }) {
  const openReader = useUI((s) => s.openReader);
  return (
    <button
      onClick={() => openReader(post.id)}
      className="w-56 text-left rounded-2xl border border-gold-500/40 bg-parchment overflow-hidden hover:border-gold-500 transition-colors"
    >
      {post.media_url &&
        (post.media_type === 'video' ? (
          <video src={post.media_url} muted playsInline preload="metadata" className="w-full aspect-video object-cover" />
        ) : (
          <img src={post.media_url} alt="shared post" className="w-full aspect-video object-cover" loading="lazy" />
        ))}
      <div className="p-2.5">
        <p className="text-[12px] font-semibold text-ink-900 line-clamp-2 leading-snug">
          {post.kind === 'forge' ? post.title : post.caption}
        </p>
        <p className="text-[10.5px] text-ink-500 mt-1 flex items-center gap-1">
          <CornerUpRight size={10} className="text-gold-600" />
          @{post.author_username} · {post.kind === 'forge' ? 'scroll' : 'post'}
        </p>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- bubble */

interface BubbleProps {
  msg: ChatMessage;
  mine: boolean;
  grouped: boolean;
  showName: boolean;
  parent: ChatMessage | null;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onUnsend: () => void;
  onRetry: () => void;
  onShowImage: (url: string) => void;
}

const bubbleTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

function Bubble({ msg, mine, grouped, showName, parent, onReact, onReply, onUnsend, onRetry, onShowImage }: BubbleProps) {
  const pushToast = useUI((s) => s.pushToast);
  const [picker, setPicker] = useState(false);
  const reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
  const counts = new Map<string, number>();
  reactions.forEach((r) => counts.set(r.e, (counts.get(r.e) || 0) + 1));

  const plainBody = msg.body?.replace(REPLY_TOKEN, '$2') ?? '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      drag={FINE_POINTER ? 'x' : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ right: 0.22, left: mine ? 0.22 : 0.05 }}
      onDragEnd={(_e, info) => {
        if (info.offset.x > 52 || (mine && info.offset.x < -52)) onReply();
      }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-3'}`}
    >
      <div className={`flex items-end gap-2 max-w-[80%] ${mine ? 'flex-row-reverse' : ''}`}>
        {!mine && (
          <div className="w-7 shrink-0">{!grouped && <Avatar url={msg.sender_avatar} name={msg.sender_name} size={28} />}</div>
        )}

        <div className="relative group min-w-0">
          {/* action toolbar — hover on desktop, long-press/context on touch */}
          <div
            className={`absolute -top-8 ${mine ? 'right-1' : 'left-1'} z-10 hidden group-hover:flex items-center gap-0.5 card-warm !rounded-full px-1.5 py-1 shadow-warm`}
          >
            <button onClick={() => setPicker((p) => !p)} className="p-1 rounded-full text-ink-500 hover:text-saffron-600" aria-label="React">
              <SmilePlus size={14} />
            </button>
            <button onClick={onReply} className="p-1 rounded-full text-ink-500 hover:text-saffron-600" aria-label="Reply">
              <CornerDownLeft size={14} />
            </button>
            {msg.type === 'text' && plainBody && (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(plainBody);
                    pushToast('Copied');
                  } catch {
                    /* noop */
                  }
                }}
                className="p-1 rounded-full text-ink-500 hover:text-saffron-600"
                aria-label="Copy text"
              >
                <Copy size={13} />
              </button>
            )}
            {mine && (
              <button onClick={onUnsend} className="p-1 rounded-full text-ink-500 hover:text-terra-600" aria-label="Unsend">
                <Trash2 size={13} />
              </button>
            )}
          </div>

          <AnimatePresence>
            {picker && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`absolute -top-16 ${mine ? 'right-0' : 'left-0'} z-20 flex gap-0.5 card-warm !rounded-full px-1.5 py-1 shadow-warm`}
              >
                {QUICK_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      onReact(e);
                      setPicker(false);
                    }}
                    className="text-lg hover:scale-125 transition-transform px-0.5"
                  >
                    {e}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* reply context */}
          {parent && (
            <div
              className={`mb-1 mx-1 rounded-xl px-3 py-1.5 border-l-[3px] text-[11px] leading-snug max-w-full truncate ${
                mine ? 'border-gold-500 bg-gold-400/10 text-ink-600' : 'border-saffron-600 bg-saffron-500/8 text-ink-600'
              }`}
            >
              <span className="font-semibold text-saffron-700">{parent.sender_name.split(' ')[0]}</span>
              {' · '}
              {parent.type === 'text' ? parent.body?.replace(REPLY_TOKEN, '$2').slice(0, 90) : parent.type === 'image' ? '🖼 photo' : parent.type === 'voice' ? '🎙 voice note' : parent.type === 'sticker' ? 'sticker' : '◈ shared scroll'}
            </div>
          )}

          {showName && (
            <p className="text-[10.5px] font-semibold mb-1 pl-1 text-saffron-700">{msg.sender_name.split(' ')[0]}</p>
          )}
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              onReply();
            }}
            onDoubleClick={() => onReact('❤️')}
            className={`${
              msg.failed ? 'opacity-80 ring-2 ring-terra-500/60 rounded-2xl' : msg.pending ? 'opacity-70' : ''
            } ${
              msg.type === 'text'
                ? mine
                  ? 'rounded-3xl rounded-br-md bg-gradient-to-br from-saffron-500 to-saffron-600 text-parchment px-4 py-2.5 shadow-[0_6px_18px_-8px_rgba(217,111,16,0.5)]'
                  : 'rounded-3xl rounded-bl-md bg-parchment border border-sand-300/80 text-ink-800 px-4 py-2.5'
                : msg.type === 'sticker'
                  ? ''
                  : 'rounded-2xl'
            }`}
          >
            {msg.type === 'text' && (
              (() => {
                const nameLabel = !mine && !grouped && !showName ? (
                  <span className="block text-[10.5px] font-semibold mb-0.5 text-saffron-700">{msg.sender_name.split(' ')[0]}</span>
                ) : null;
                return (
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                    {nameLabel}
                    {richText(plainBody, mine)}
                    <span className={`float-right ml-2.5 mt-2 text-[9.5px] select-none ${mine ? 'text-parchment/70' : 'text-ink-400'}`}>
                      {bubbleTime(msg.created_at)}
                      {msg.pending && ' ·…'}
                    </span>
                  </p>
                );
              })()
            )}

            {msg.type === 'image' && msg.media_url && (
              <div className={`relative rounded-2xl overflow-hidden border ${mine ? 'border-saffron-500/40' : 'border-sand-300/70'}`}>
                <button onClick={() => onShowImage(msg.media_url!)} className="block w-full cursor-zoom-in" aria-label="Open image">
                  <img src={msg.media_url} alt="shared media" className="w-full max-h-64 object-cover hover:opacity-95 transition-opacity" loading="lazy" />
                </button>
                {msg.body && <p className="text-[12px] text-ink-700 bg-parchment px-3 py-2">{richText(msg.body, false)}</p>}
                <span className="absolute bottom-2 right-2.5 text-[9.5px] text-parchment/90 bg-neem-950/60 rounded-md px-1.5 py-0.5 backdrop-blur-sm select-none">
                  {bubbleTime(msg.created_at)}
                </span>
              </div>
            )}

            {msg.type === 'voice' && msg.media_url && <VoiceNote src={msg.media_url} mine={mine} seedKey={msg.id} />}

            {msg.type === 'sticker' && (
              <div className="relative inline-block">
                <p className="text-[54px] leading-none select-none py-1 drop-shadow-sm">{plainBody || '🪷'}</p>
                <span className="block text-right text-[9.5px] text-ink-400 select-none -mt-0.5">{bubbleTime(msg.created_at)}</span>
              </div>
            )}

            {msg.type === 'post' && msg.post && <SharedPostCard post={msg.post} />}
            {msg.type === 'post' && !msg.post && (
              <p className="text-[12.5px] italic text-ink-500 px-3 py-2">A scroll that has wandered off…</p>
            )}
          </div>

          {counts.size > 0 && (
            <div className={`flex gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
              {[...counts.entries()].map(([e, n]) => (
                <button
                  key={e}
                  onClick={() => onReact(e)}
                  className="inline-flex items-center gap-0.5 text-[11px] bg-parchment border border-sand-300 rounded-full px-1.5 py-0.5 shadow-sm hover:border-gold-500/60"
                >
                  {e}
                  {n > 1 && <span className="text-[9px] font-semibold text-ink-500">{n}</span>}
                </button>
              ))}
            </div>
          )}

          {msg.pending && (
            <p className={`text-[10px] text-ink-400 mt-1 flex items-center gap-1 ${mine ? 'justify-end pr-1' : 'pl-1'}`}>
              <Clock3 size={10} className="animate-spin" style={{ animationDuration: '2.4s' }} /> Weaving…
            </p>
          )}
          {msg.failed && (
            <button
              onClick={onRetry}
              className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-terra-700 bg-terra-500/10 border border-terra-500/40 rounded-full px-2.5 py-1 hover:bg-terra-500/20 transition-colors"
            >
              <AlertCircle size={11} /> The thread dropped it — tap to retry
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------ recorder */

interface RecorderCtl {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
}

function pickMime(): string | undefined {
  const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return prefs.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
}

/* ------------------------------------------------------------------ chat */

function ChatPane({ thread, onBack }: { thread: Thread; onBack: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: messages, isLoading } = useMessages(thread.id);
  const sendMessage = useSendMessage(thread.id);
  const deleteMessage = useDeleteMessage(thread.id);
  const reactTo = useReactToMessage(thread.id);
  const markRead = useMarkThreadRead();
  const pushToast = useUI((s) => s.pushToast);

  const [draft, setDraft] = useState(() => localStorage.getItem(`av_draft_${thread.id}`) || '');
  const [sendingImage, setSendingImage] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [recording, setRecording] = useState<RecorderCtl | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [typists, setTypists] = useState<string[]>([]);
  const [phantoms, setPhantoms] = useState<ChatMessage[]>([]);
  const [jumpCount, setJumpCount] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveThread = useLeaveThread();

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingThrottle = useRef(0);
  const atBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const didInitScrollRef = useRef(false);
  const openedReadRef = useRef<string | null>(null);
  const draftKeyRef = useRef(`av_draft_${thread.id}`);

  useEffect(() => {
    const key = `av_draft_${thread.id}`;
    draftKeyRef.current = key;
    setDraft(localStorage.getItem(key) || '');
    setPhantoms([]);
    setJumpCount(0);
    setReplyTo(null);
    setStickersOpen(false);
    didInitScrollRef.current = false;
    prevCountRef.current = 0;
    const me = thread.members.find((m) => m.user_id === user?.id);
    openedReadRef.current = me?.last_read_at ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => {
    const key = draftKeyRef.current;
    if (draft.trim()) localStorage.setItem(key, draft);
    else localStorage.removeItem(key);
  }, [draft]);

  const byId = useMemo(() => new Map<number, ChatMessage>((messages?.items ?? []).map((m) => [m.id, m])), [messages]);
  const meProfile = useMyProfile().data;
  const myName = meProfile?.full_name || (user?.user_metadata?.full_name as string | undefined) || user?.email?.split('@')[0] || 'weaver';
  const others = thread.members.filter((m) => m.user_id !== user?.id);
  const onlineIds = usePresence();
  const otherOnline = !thread.is_group && others.some((m) => onlineIds.has(m.user_id));
  const onlineCount = others.filter((m) => onlineIds.has(m.user_id)).length;

  /* realtime: new notes, edits (reactions), unsends + typing presence */
  useEffect(() => {
    const channel = supabase.channel(`messages-${thread.id}`, { config: { broadcast: { self: false } } });
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
        const m = payload.new as ChatMessage;
        if (m.conversation_id !== thread.id) return;
        queryClient.setQueryData<{ items: ChatMessage[]; has_more?: boolean }>(['messages', thread.id], (old) =>
          old ? (old.items.some((x) => x.id === m.id) ? old : { ...old, items: [...old.items, m] }) : { items: [m], has_more: false },
        );
        queryClient.invalidateQueries({ queryKey: ['threads'] });
        if (m.sender_id !== user?.id) markRead.mutate(thread.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload: any) => {
        const m = payload.new as ChatMessage;
        if (m.conversation_id !== thread.id) return;
        queryClient.setQueryData<{ items: ChatMessage[]; has_more?: boolean }>(['messages', thread.id], (old) =>
          old ? { ...old, items: old.items.map((x) => (x.id === m.id ? { ...x, reactions: m.reactions } : x)) } : old,
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload: any) => {
        const oldId = (payload.old as { id?: number }).id;
        if (oldId)
          queryClient.setQueryData<{ items: ChatMessage[]; has_more?: boolean }>(['messages', thread.id], (old) =>
            old ? { ...old, items: old.items.filter((x) => x.id !== oldId) } : old,
          );
        queryClient.invalidateQueries({ queryKey: ['threads'] });
      })
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const name = payload.payload?.name as string | undefined;
        if (!name) return;
        setTypists((t) => (t.includes(name) ? t : [...t, name]));
        window.setTimeout(() => setTypists((t) => t.filter((n) => n !== name)), 2600);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => {
    markRead.mutate(thread.id);
    stopRecording(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const list = useMemo(() => messages?.items ?? [], [messages]);
  const hasMore = !!messages?.has_more;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const fullList = useMemo(() => [...list, ...phantoms], [list, phantoms]);

  const loadOlder = async () => {
    if (loadingOlder || !list.length) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const data = await apiFetch<{ items: ChatMessage[]; has_more?: boolean }>(
        `/api/messages?conversation_id=${thread.id}&before=${list[0].id}&limit=60`,
      );
      queryClient.setQueryData<{ items: ChatMessage[]; has_more?: boolean }>(['messages', thread.id], (old) => ({
        items: [...data.items, ...(old?.items ?? [])],
        has_more: !!data.has_more,
      }));
      requestAnimationFrame(() => {
        const elNow = scrollRef.current;
        if (elNow) elNow.scrollTop += elNow.scrollHeight - prevHeight;
      });
    } catch {
      pushToast('The older weave refused to surface — try again', 'error');
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    atBottomRef.current = near;
    if (near) setJumpCount(0);
  };

  const scrollDown = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setJumpCount(0);
  };

  /* first paint lands at the newest note instantly; after that, growth glides if
     the reader is home, or raises the jump chip if they are up-thread */
  useEffect(() => {
    if (!isLoading && !didInitScrollRef.current && fullList.length) {
      didInitScrollRef.current = true;
      requestAnimationFrame(() => scrollDown(false));
    }
  }, [isLoading, fullList.length]);

  useEffect(() => {
    if (fullList.length <= prevCountRef.current) {
      prevCountRef.current = fullList.length;
      return;
    }
    prevCountRef.current = fullList.length;
    const last = fullList[fullList.length - 1];
    if (!last) return;
    if (last.sender_id === user?.id || atBottomRef.current) {
      requestAnimationFrame(() => scrollDown(true));
    } else {
      setJumpCount((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullList.length, recording !== null]);

  const broadcastTyping = () => {
    const nowTs = Date.now();
    if (nowTs - typingThrottle.current < 1600) return;
    typingThrottle.current = nowTs;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { name: myName.split(' ')[0] } });
  };

  /* optimistic lane: paint the bubble instantly, settle (or retry) when the loom answers */
  const sendWithPhantom = (payload: { type: ChatMessage['type']; body?: string; media_url?: string; post_id?: number }) => {
    const temp: ChatMessage = {
      id: -Date.now(),
      conversation_id: thread.id,
      sender_id: user?.id || '',
      sender_name: myName,
      sender_avatar: (meProfile?.avatar_url || user?.user_metadata?.avatar_url || null) as string | null,
      type: payload.type,
      body: payload.body ?? null,
      media_url: payload.media_url ?? null,
      post_id: payload.post_id ?? null,
      reactions: [],
      created_at: new Date().toISOString(),
      pending: true,
    };
    setPhantoms((p) => [...p, temp]);
    sendMessage.mutate(payload, {
      onSuccess: () => setPhantoms((p) => p.filter((x) => x.id !== temp.id)),
      onError: () => setPhantoms((p) => p.map((x) => (x.id === temp.id ? { ...x, pending: false, failed: true } : x))),
    });
  };

  const retryPhantom = (m: ChatMessage) => {
    setPhantoms((p) => p.filter((x) => x.id !== m.id));
    sendWithPhantom({
      type: m.type,
      body: m.body ?? undefined,
      media_url: m.media_url ?? undefined,
      post_id: m.post_id ?? undefined,
    });
  };

  const submit = () => {
    const raw = draft.trim();
    if (!raw) return;
    const body = replyTo ? `⟦r:${replyTo.id}⟧${raw}` : raw;
    sendWithPhantom({ type: 'text', body });
    setDraft('');
    setReplyTo(null);
    if (composerRef.current) composerRef.current.style.height = 'auto';
  };

  const sendImage = async (file: File) => {
    if (file.size > 48 * 1024 * 1024) {
      pushToast('Images over ~48MB are too heavy even for the loom', 'error');
      return;
    }
    setSendingImage(true);
    try {
      const url = await uploadMedia(file);
      sendWithPhantom({ type: 'image', media_url: url, body: draft.trim() || undefined });
      setDraft('');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setSendingImage(false);
    }
  };

  const sendSticker = (emoji: string) => {
    sendWithPhantom({ type: 'sticker', body: emoji });
    setStickersOpen(false);
  };

  /* close lightbox with Escape */
  useEffect(() => {
    if (!lightbox) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [lightbox]);

  /* ---- voice notes ---- */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const ctl: RecorderCtl = { recorder, stream, chunks: [] };
      recorder.ondataavailable = (e) => {
        if (e.data.size) ctl.chunks.push(e.data);
      };
      recorder.onstop = async () => {
        ctl.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(ctl.chunks, { type: ctl.recorder.mimeType || 'audio/webm' });
        if (ctl.chunks.length === 0 || blob.size < 400) return; // too short / cancelled
        try {
          const url = await uploadMedia(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }));
          sendWithPhantom({ type: 'voice', media_url: url });
        } catch (err) {
          pushToast((err as Error).message, 'error');
        }
      };
      recorder.start(250);
      setRecording(ctl);
      setRecSeconds(0);
    } catch {
      pushToast('Microphone unavailable — grant permission to whisper', 'error');
    }
  };

  const stopRecording = (cancelled: boolean) => {
    setRecording((ctl) => {
      if (!ctl) return null;
      if (cancelled) ctl.chunks = [];
      try {
        if (ctl.recorder.state !== 'inactive') ctl.recorder.stop();
      } catch {
        /* noop */
      }
      return null;
    });
  };

  useEffect(() => {
    if (!recording) return;
    const iv = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(iv);
  }, [recording]);

  /* seen receipts */
  const lastOwn = [...list].reverse().find((m) => m.sender_id === user?.id);
  const unreadFromId = (() => {
    const cut = openedReadRef.current;
    if (!cut) return null;
    const t0 = new Date(cut).getTime();
    const firstNew = fullList.find((mm) => mm.sender_id !== user?.id && !mm.pending && new Date(mm.created_at).getTime() > t0);
    return firstNew?.id ?? null;
  })();
  const seenBy =
    lastOwn
      ? others.filter((m) => m.last_read_at && new Date(m.last_read_at).getTime() >= new Date(lastOwn.created_at).getTime())
      : [];

  let lastDay = '';

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-sand-300/70 bg-parchment/90 backdrop-blur">
        <button onClick={onBack} className="lg:hidden p-1.5 -ml-1.5 rounded-full text-ink-600 hover:bg-sand-200/70" aria-label="Back">
          <ArrowLeft size={19} />
        </button>
        <div className="relative shrink-0">
          <Avatar url={thread.avatar_url} name={thread.title} size={38} />
          {otherOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-neem-500 ring-2 ring-parchment shadow-[0_0_6px_rgba(61,122,90,0.9)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14.5px] text-ink-900 truncate">{thread.title}</p>
          <p className="text-[11px] text-ink-500 truncate flex items-center gap-1">
            {thread.is_group && <Users size={11} />}
            {typists.length > 0 ? (
              <span className="text-saffron-700 font-semibold animate-pulse">
                {typists.join(', ')} {typists.length > 1 ? 'are' : 'is'} writing…
              </span>
            ) : otherOnline ? (
              <span className="text-neem-600 font-semibold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neem-500 shadow-[0_0_6px_rgba(61,122,90,0.8)]" />
                Online now
              </span>
            ) : thread.is_group && onlineCount > 0 ? (
              <span className="text-neem-600 font-semibold inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-neem-500 shadow-[0_0_6px_rgba(61,122,90,0.8)]" />
                {onlineCount} online
              </span>
            ) : (
              thread.members.map((m) => m.name.split(' ')[0]).join(', ')
            )}
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="p-2 rounded-full text-ink-500 hover:text-ink-800 hover:bg-sand-200/70 transition-colors"
            aria-label="Thread options"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl card-warm p-1 shadow-warm border border-sand-300 text-[13px]">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmLeave(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-terra-600 hover:bg-terra-500/10 font-medium transition-colors text-left"
                >
                  <LogOut size={14} />
                  {thread.is_group ? 'Leave conversation' : 'Delete conversation'}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-4 relative bg-[radial-gradient(120%_80%_at_50%_0%,#f6efdf_0%,#f2ead8_60%,#eaddc4_100%)] dark:bg-[radial-gradient(120%_80%_at_50%_0%,#0e1c14_0%,#09150f_60%,#060e0a_100%)]">
        <Mandala className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] text-neem-600/[0.055] dark:text-gold-400/[0.06] animate-spin-slower" />
        {isLoading && (
          <div className="h-full grid place-items-center">
            <Loader2 className="animate-spin text-gold-500" size={22} />
          </div>
        )}

        {!isLoading && list.length === 0 && (
          <div className="h-full grid place-items-center text-center px-6">
            <div>
              <LotusMark className="w-10 h-10 mx-auto text-sand-400" />
              <p className="font-display italic text-ink-500 mt-3">An empty page between weavers.</p>
              <p className="text-[11.5px] text-ink-400 mt-1">Words, voice notes, stickers, scrolls — all travel this thread.</p>
            </div>
          </div>
        )}

        {hasMore && !isLoading && (
          <div className="flex justify-center mb-3 relative z-10">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-parchment/90 px-4 py-1.5 text-[11.5px] font-semibold text-ink-600 hover:border-gold-400 hover:text-saffron-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {loadingOlder ? <Loader2 size={12} className="animate-spin" /> : null}
              Bring earlier notes down the thread
            </button>
          </div>
        )}

        {fullList.map((m, i) => {
          const day = new Date(m.created_at).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = fullList[i - 1];
          const grouped =
            !!prev &&
            prev.sender_id === m.sender_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000 &&
            !showDay;
          let parent: ChatMessage | null = null;
          const match = m.body?.match(REPLY_TOKEN);
          if (match) parent = byId.get(parseInt(match[1], 10)) ?? null;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="text-center my-4">
                  <span className="inline-block text-[10px] uppercase tracking-[0.18em] text-ink-600 bg-sand-200/85 border border-sand-300/70 rounded-full px-3 py-1 font-semibold">
                    {new Date(m.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                </p>
              )}
              {unreadFromId === m.id && (
                <div className="flex items-center gap-3 my-4" role="separator" aria-label="New messages">
                  <span className="flex-1 h-px bg-saffron-500/40" />
                  <span className="text-[9.5px] uppercase tracking-[0.2em] font-bold text-saffron-700 bg-saffron-500/10 border border-saffron-500/40 rounded-full px-3 py-1">
                    New notes
                  </span>
                  <span className="flex-1 h-px bg-saffron-500/40" />
                </div>
              )}
              <Bubble
                msg={m}
                mine={m.sender_id === user?.id}
                grouped={grouped}
                showName={thread.is_group && m.sender_id !== user?.id && !grouped}
                parent={parent}
                onReact={(e) => { if (!m.pending && !m.failed) reactTo.mutate({ messageId: m.id, emoji: e }); }}
                onReply={() => { if (!m.pending && !m.failed) setReplyTo(m); }}
                onUnsend={() => (m.pending || m.failed ? setPhantoms((p) => p.filter((x) => x.id !== m.id)) : deleteMessage.mutate(m.id))}
                onRetry={() => retryPhantom(m)}
                onShowImage={(url) => setLightbox(url)}
              />
              {lastOwn?.id === m.id && !m.pending && !m.failed && (
                <p className="text-right text-[9.5px] font-medium text-ink-400 mt-1 pr-1 flex items-center justify-end gap-1">
                  {seenBy.length > 0 ? (
                    <>
                      <CheckCheck size={11} className="text-saffron-600" />
                      Seen by {seenBy.map((s) => s.name.split(' ')[0]).join(', ')}
                    </>
                  ) : (
                    <>
                      <Check size={11} /> Delivered
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}

        {typists.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="mt-3.5 flex justify-start relative z-10">
            <div className="rounded-3xl rounded-bl-md bg-parchment border border-sand-300/80 px-4 py-3 flex items-center gap-1.5 shadow-sm">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
                  transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.16, ease: 'easeInOut' }}
                  className="w-2 h-2 rounded-full bg-saffron-600"
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {jumpCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 460, damping: 28 }}
            onClick={() => scrollDown(true)}
            className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-neem-800 text-parchment text-[11.5px] font-semibold pl-3 pr-4 py-2 shadow-warm hover:bg-neem-900"
          >
            <ArrowDown size={13} />
            {jumpCount} new {jumpCount === 1 ? 'note' : 'notes'}
          </motion.button>
        )}
      </AnimatePresence>
      </div>

      {/* reply context */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-t border-sand-300/70 bg-saffron-500/8"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <CornerDownLeft size={14} className="text-saffron-700 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-saffron-700">Replying to {replyTo.sender_name.split(' ')[0]}</p>
                <p className="text-[11px] text-ink-500 truncate">
                  {replyTo.type === 'text'
                    ? replyTo.body?.replace(REPLY_TOKEN, '$2')
                    : replyTo.type === 'image'
                      ? '🖼 photo'
                      : replyTo.type === 'voice'
                        ? '🎙 voice note'
                        : replyTo.type === 'sticker'
                          ? 'sticker'
                          : '◈ shared scroll'}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 rounded-full text-ink-400 hover:text-terra-600" aria-label="Cancel reply">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* composer */}
      <div className="shrink-0 border-t border-sand-300/70 bg-parchment px-3 py-2.5 relative">
        <AnimatePresence>
          {stickersOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              className="absolute bottom-full left-3 mb-2 card-warm !rounded-2xl p-2.5 grid grid-cols-4 gap-1 shadow-warm z-20"
            >
              {STICKERS.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  onClick={() => sendSticker(s)}
                  className="text-3xl p-1.5 rounded-xl hover:bg-saffron-500/15 hover:scale-110 transition-all"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {recording ? (
          <div className="flex items-center gap-3 rounded-full border border-terra-500/50 bg-terra-500/10 px-4 py-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terra-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-terra-500" />
            </span>
            <p className="text-[13px] font-semibold text-terra-700 flex-1">
              Recording… {formatDuration(recSeconds)}
            </p>
            <button onClick={() => stopRecording(true)} className="text-[12px] font-medium text-ink-500 hover:text-terra-700 px-2 py-1">
              Cancel
            </button>
            <button
              onClick={() => stopRecording(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-saffron-600 text-parchment text-[12px] font-semibold px-4 py-1.5"
            >
              <Send size={12} className="-rotate-12" /> Send
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={sendingImage}
              className="p-2.5 rounded-full text-ink-500 hover:bg-sand-200/70 hover:text-saffron-600 transition-colors"
              aria-label="Send an image"
            >
              {sendingImage ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={19} />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) sendImage(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => setStickersOpen((s) => !s)}
              className={`p-2.5 rounded-full transition-colors ${stickersOpen ? 'text-saffron-600 bg-saffron-500/15' : 'text-ink-500 hover:bg-sand-200/70 hover:text-saffron-600'}`}
              aria-label="Stickers"
            >
              <Sticker size={19} />
            </button>
            <textarea
              ref={composerRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                broadcastTyping();
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(116, el.scrollHeight)}px`;
              }}
              onFocus={() => {
                window.setTimeout(() => scrollDown(true), 350);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Write on the golden thread… (**bold** _italic_ `code`)"
              className="flex-1 min-w-0 rounded-[22px] border border-sand-300 bg-parchment-deep/60 px-4 py-2.5 text-[13.5px] leading-relaxed text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 resize-none overflow-y-auto"
            />
            {draft.trim() ? (
              <motion.button
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.85, rotate: -10 }}
                onClick={submit}
                disabled={sendMessage.isPending}
                className="grid place-items-center w-10 h-10 rounded-full bg-gradient-to-br from-saffron-500 to-saffron-600 text-parchment disabled:opacity-40 shadow-[0_8px_18px_-6px_rgba(217,111,16,0.55)]"
                aria-label="Send message"
              >
                <Send size={16} className="-rotate-12 translate-x-[1px]" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={startRecording}
                className="grid place-items-center w-10 h-10 rounded-full border border-sand-300 text-ink-600 hover:bg-sand-200/70 hover:text-saffron-600 transition-colors"
                aria-label="Record a voice note"
              >
                <Mic size={18} />
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* image lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[92] grid place-items-center bg-neem-950/85 backdrop-blur-md p-4 sm:p-8 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              src={lightbox}
              alt="shared media enlarged"
              className="max-h-[86vh] max-w-full rounded-2xl border border-parchment/25 shadow-warm object-contain"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 grid place-items-center w-10 h-10 rounded-full bg-parchment/15 text-parchment hover:bg-parchment/25 backdrop-blur"
              aria-label="Close image"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* leave / delete confirmation dialog */}
      <AnimatePresence>
        {confirmLeave && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-neem-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card-warm rounded-2xl p-6 max-w-sm w-full border border-sand-300 shadow-warm space-y-4 text-center"
            >
              <h3 className="font-display font-semibold text-lg text-neem-950">
                {thread.is_group ? 'Leave this conversation?' : 'Delete this conversation?'}
              </h3>
              <p className="text-xs text-ink-600 leading-relaxed">
                {thread.is_group
                  ? 'You will no longer receive notes in this circle unless invited back.'
                  : 'This conversation will be removed from your inbox.'}
              </p>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="flex-1 py-2 rounded-xl border border-sand-300 text-xs font-semibold text-ink-700 hover:bg-sand-200/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={leaveThread.isPending}
                  onClick={() => {
                    leaveThread.mutate(thread.id, {
                      onSuccess: () => {
                        setConfirmLeave(false);
                        onBack();
                      },
                    });
                  }}
                  className="flex-1 py-2 rounded-xl bg-terra-600 text-parchment text-xs font-semibold hover:bg-terra-700 disabled:opacity-50 transition-colors"
                >
                  {leaveThread.isPending ? 'Departing…' : thread.is_group ? 'Leave' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- new thread */

function useThreadsPeoplePicker(q: string) {
  const [data, setData] = useState<Profile[] | undefined>(undefined);
  const [fetching, setFetching] = useState(false);
  const [dq, setDq] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 220);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let alive = true;
    setFetching(true);
    apiFetch<Profile[]>(`/api/profiles?limit=30${dq ? `&q=${encodeURIComponent(dq)}` : ''}`)
      .then((rows) => alive && setData(rows))
      .catch(() => alive && setData([]))
      .finally(() => alive && setFetching(false));
    return () => {
      alive = false;
    };
  }, [dq]);
  return { data, fetching };
}

function NewThreadSheet({ onClose, initialQuery = '' }: { onClose: () => void; initialQuery?: string }) {
  const { user } = useAuth();
  const openThread = useUI((s) => s.openThread);
  const createThread = useCreateThread();
  const [selectedMap, setSelectedMap] = useState<Map<string, Profile>>(new Map());
  const [name, setName] = useState('');
  const [q, setQ] = useState(initialQuery);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const { data: all, fetching } = useThreadsPeoplePicker(q);
  const list = (all ?? []).filter((p) => p.user_id !== user?.id);
  const cleanQ = q.replace(/^@/, '').trim().toLowerCase();
  const filtered = cleanQ
    ? list.filter(
        (p) =>
          p.full_name.toLowerCase().includes(cleanQ) || p.username.toLowerCase().includes(cleanQ),
      )
    : list;

  const toggle = (p: Profile) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(p.user_id)) next.delete(p.user_id);
      else next.set(p.user_id, p);
      return next;
    });
  };

  const selectedCount = selectedMap.size;

  const start = () => {
    if (!selectedCount) return;
    createThread.mutate(
      { member_ids: Array.from(selectedMap.keys()), name: selectedCount > 1 && name.trim() ? name.trim() : null },
      {
        onSuccess: (data) => {
          onClose();
          openThread(data.id);
        },
      },
    );
  };

  return (
    <div className="flex flex-col p-5">
      <div className="flex items-center justify-between pb-3 border-b border-sand-300/60">
        <div>
          <h3 className="font-display font-semibold text-lg text-ink-900 flex items-center gap-2">
            Begin a golden thread
            <Sparkles size={16} className="text-gold-500" />
          </h3>
          <p className="text-[12px] text-ink-500 mt-0.5">
            Select one or more weavers to begin a direct whisper or a circle
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full text-ink-500 hover:text-ink-800 hover:bg-sand-200/70 transition-colors"
          aria-label="Close"
        >
          <X size={17} />
        </button>
      </div>

      <div className="relative mt-4 flex items-center">
        <Search size={15} className="absolute left-3.5 text-ink-400 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search weavers by name or @handle…"
          className="w-full rounded-xl border border-sand-300/80 bg-sand-100/50 dark:bg-sand-900/30 pl-9 pr-9 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 transition-all"
          autoFocus
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-2.5 p-1 rounded-full text-ink-400 hover:text-ink-700 hover:bg-sand-200/60 transition-colors"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 max-h-24 overflow-y-auto no-scrollbar py-0.5">
          {Array.from(selectedMap.values()).map((p) => (
            <span
              key={p.user_id}
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-saffron-500/15 border border-saffron-500/40 text-ink-900 text-xs font-medium"
            >
              <Avatar url={p.avatar_url} name={p.full_name} size={18} />
              <span className="max-w-[120px] truncate">{p.full_name}</span>
              <button
                type="button"
                onClick={() => toggle(p)}
                className="p-0.5 rounded-full hover:bg-saffron-500/30 text-ink-500 hover:text-ink-900 transition-colors"
                aria-label={`Remove ${p.full_name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedCount > 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Name this circle (e.g. Rasayana Keepers, Vaidya Council)…"
              className="mt-3 w-full rounded-xl border border-sand-300/80 bg-sand-100/50 dark:bg-sand-900/30 px-3.5 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 transition-all"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex-1 overflow-y-auto space-y-1 pr-1 min-h-[160px] max-h-64">
        {filtered.map((p) => {
          const on = selectedMap.has(p.user_id);
          return (
            <button
              key={p.user_id}
              onClick={() => toggle(p)}
              className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all text-left ${
                on
                  ? 'bg-saffron-500/12 border border-saffron-500/40 shadow-sm'
                  : 'hover:bg-sand-200/50 dark:hover:bg-sand-800/40 border border-transparent'
              }`}
            >
              <Avatar url={p.avatar_url} name={p.full_name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink-900 truncate">{p.full_name}</p>
                <p className="text-[11.5px] text-ink-500 truncate">
                  @{p.username}
                  {p.bio ? ` · ${p.bio}` : ''}
                </p>
              </div>
              <span
                className={`grid place-items-center w-6 h-6 rounded-full border-2 transition-all ${
                  on
                    ? 'bg-saffron-600 border-saffron-600 text-parchment scale-105'
                    : 'border-sand-300 dark:border-sand-600 text-transparent'
                }`}
              >
                <Check size={13} strokeWidth={3} />
              </span>
            </button>
          );
        })}
        {fetching && (
          <p className="text-center text-[12px] tracking-wide text-ink-400 py-3 animate-pulse">
            Consulting the atelier weavers…
          </p>
        )}
        {filtered.length === 0 && !fetching && (
          <div className="text-center py-8">
            <p className="text-sm text-ink-500 italic font-display">No weaver answers to that name.</p>
            <p className="text-xs text-ink-400 mt-1">Try another name or search without spaces.</p>
          </div>
        )}
      </div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={start}
        disabled={!selectedCount || createThread.isPending}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3 disabled:opacity-40 inline-flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:cursor-not-allowed"
      >
        {createThread.isPending && <Loader2 size={16} className="animate-spin" />}
        {selectedCount > 1
          ? `Light circle with ${selectedCount} weavers`
          : selectedCount === 1
          ? 'Open the golden thread'
          : 'Select a weaver to start'}
      </motion.button>
    </div>
  );
}

/* ------------------------------------------------------------------ inbox */

function previewText(t: Thread): string {
  const lm = t.last_message;
  if (!lm) return 'Say the first word';
  const who = `${lm.sender_name.split(' ')[0]}: `;
  if (lm.type === 'image') return `${who}🖼 photo`;
  if (lm.type === 'voice') return `${who}🎙 voice note`;
  if (lm.type === 'sticker') return `${who}${lm.body || 'sticker'}`;
  if (lm.type === 'post') return `${who}◈ shared a scroll`;
  return `${who}${(lm.body || '').replace(REPLY_TOKEN, '$2')}`;
}

export default function ThreadsScreen() {
  const activeThreadId = useUI((s) => s.activeThreadId);
  const openThread = useUI((s) => s.openThread);
  const backToInbox = useUI((s) => s.backToInbox);
  const isDesktop = useIsDesktop();
  const onlineIds = usePresence();
  const { data: threads, isLoading } = useThreads(true);
  const [creating, setCreating] = useState(false);
  const [inboxQ, setInboxQ] = useState('');
  const [sheetQuery, setSheetQuery] = useState('');

  const activeThread = useMemo(
    () => threads?.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const shownThreads = useMemo(() => {
    const q0 = inboxQ.trim().toLowerCase();
    const arr = threads ?? [];
    if (!q0) return arr;
    return arr.filter(
      (t) => t.title.toLowerCase().includes(q0) || previewText(t).toLowerCase().includes(q0),
    );
  }, [threads, inboxQ]);

  return (
    <div className="relative h-[calc(var(--vvh,100dvh)-118px)] lg:h-[calc(100vh-24px)] flex overflow-hidden bg-parchment lg:rounded-3xl lg:border lg:border-sand-300/60 lg:mx-2">
        {/* inbox column */}
        <div
          className={
            isDesktop
              ? 'w-[320px] xl:w-[340px] shrink-0 flex flex-col border-r border-sand-300/70 bg-parchment'
              : `${activeThread ? 'hidden' : 'flex'} flex-col w-full bg-parchment`
          }
        >
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-sand-300/60">
            <div>
              <h2 className="font-display font-semibold text-[21px] text-ink-900 flex items-center gap-2">
                Golden Threads
                <MessageCircle size={17} className="text-gold-600" />
              </h2>
              <p className="text-[10.5px] uppercase tracking-[0.2em] text-ink-400 mt-0.5">messages · circles · voice</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setSheetQuery('');
                  setCreating(true);
                }}
                className="p-2.5 rounded-full text-ink-600 hover:bg-saffron-500/15 hover:text-saffron-700 transition-colors"
                aria-label="New thread"
                title="Begin a new golden thread"
              >
                <SquarePen size={19} />
              </button>
            </div>
          </div>

          {/* inbox search — threads by name or last whisper */}
          <div className="px-4 py-2.5 border-b border-sand-300/60">
            <label className="flex items-center gap-2.5 rounded-full bg-sand-200/60 border border-sand-300/70 px-3.5 py-[7px] transition-shadow focus-within:ring-2 focus-within:ring-gold-400/50 focus-within:border-gold-400">
              <Search size={14} className="text-ink-400 shrink-0" />
              <input
                value={inboxQ}
                onChange={(e) => setInboxQ(e.target.value)}
                placeholder="Search threads…"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-ink-800 placeholder:text-ink-400 focus:outline-none"
                aria-label="Search threads"
              />
              {inboxQ && (
                <button onClick={() => setInboxQ('')} className="p-0.5 rounded-full text-ink-400 hover:text-ink-700" aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </label>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton w-12 h-12 !rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-2/5" />
                    <div className="skeleton h-2.5 w-3/4" />
                  </div>
                </div>
              ))}

            {!isLoading && (threads ?? []).length === 0 && (
              <div className="text-center px-6 py-14">
                <LotusMark className="w-11 h-11 mx-auto text-sand-400" />
                <p className="font-display text-lg text-ink-900 mt-4">No threads yet</p>
                <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
                  Begin a thread with any weaver — or tap the paper-plane on a post to send it flying into a chat.
                </p>
                <button
                  onClick={() => {
                    setSheetQuery('');
                    setCreating(true);
                  }}
                  className="mt-5 rounded-full bg-saffron-600 text-parchment text-[13px] font-semibold px-6 py-2.5 hover:bg-saffron-700 transition-colors"
                >
                  Begin a thread
                </button>
              </div>
            )}

            {inboxQ.trim() && (
              <button
                onClick={() => {
                  setSheetQuery(inboxQ.trim());
                  setCreating(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sand-200/50 border-b border-sand-200/70 transition-colors group"
              >
                <span className="grid place-items-center w-11 h-11 rounded-full bg-gold-400/15 text-gold-700 group-hover:scale-105 transition-transform shrink-0">
                  <Users size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink-800 font-medium">
                    Find weavers named <span className="font-semibold text-saffron-700">“{inboxQ.trim()}”</span>
                  </p>
                  <p className="text-[11px] text-ink-400">Search weavers &amp; begin a new thread</p>
                </div>
              </button>
            )}
            {shownThreads.length === 0 && inboxQ.trim() && (
              <div className="text-center px-4 py-8">
                <p className="text-[13px] text-ink-600 italic">No existing threads match “{inboxQ.trim()}”.</p>
                <button
                  onClick={() => {
                    setSheetQuery(inboxQ.trim());
                    setCreating(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-saffron-600 text-parchment text-[12px] font-semibold px-4 py-2 hover:bg-saffron-700 transition-colors shadow-sm"
                >
                  <SquarePen size={14} /> Begin thread with “{inboxQ.trim()}”
                </button>
              </div>
            )}
            {shownThreads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  t.id === activeThreadId ? 'bg-saffron-500/10 border-r-2 border-saffron-600' : 'hover:bg-sand-200/50'
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar url={t.avatar_url} name={t.title} size={48} />
                  {t.unread_count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-terra-500 ring-2 ring-parchment" />
                  )}
                  {!t.is_group && t.members.some((m) => onlineIds.has(m.user_id)) && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-neem-500 ring-2 ring-parchment shadow-[0_0_6px_rgba(61,122,90,0.9)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13.5px] truncate ${t.unread_count > 0 ? 'font-bold text-ink-900' : 'font-semibold text-ink-800'}`}>
                    {t.title}
                  </p>
                  <p className={`text-[12px] truncate mt-0.5 ${t.unread_count > 0 ? 'text-ink-800 font-medium' : 'text-ink-500'}`}>
                    {previewText(t)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-ink-400">{t.last_message ? timeAgo(t.last_message.created_at) : ''}</p>
                  {t.unread_count > 0 && (
                    <span className="inline-grid place-items-center mt-1 min-w-[20px] h-5 px-1.5 rounded-full bg-saffron-600 text-parchment text-[10.5px] font-bold">
                      {t.unread_count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* chat column */}
        {(isDesktop || activeThread) && (
          <div className="flex-1 min-w-0 flex flex-col bg-parchment">
            {activeThread ? (
              <ChatPane thread={activeThread} onBack={backToInbox} />
            ) : (
              <div className="flex-1 grid place-items-center">
                <div className="text-center">
                  <LotusMark className="w-12 h-12 mx-auto text-gold-500/60" />
                  <p className="font-display italic text-lg text-ink-600 mt-4">Your messages glow here.</p>
                  <p className="text-[12px] text-ink-400 mt-1.5">
                    Pick a thread, or begin one — send words, images, voice and whole scrolls.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* new-thread sheet */}
        <AnimatePresence>
          {creating && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-ink-950/60 backdrop-blur-md"
                onClick={() => setCreating(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-lg card-warm !rounded-3xl shadow-2xl z-10 overflow-hidden border border-sand-300/80"
              >
                <NewThreadSheet onClose={() => setCreating(false)} initialQuery={sheetQuery} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>
    </div>
  );
}
