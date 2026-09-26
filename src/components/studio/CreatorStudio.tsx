import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Feather, Image as ImageIcon, ScrollText, Layers, Wand2, Sparkles, Clock, Hash, MapPin, Type,
  Eye, Smartphone, Monitor, Save, Trash2, Copy, Plus, Send, CheckCircle2, Circle,
  Bold, Italic, Quote, List, Code2, Minus, Heading2, BookOpen, Flame, Gem,
  Timer, ChevronRight, X, Loader2, FileText, Minimize2, ListOrdered, Rocket,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import { timeAgo } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useUI } from '../../store/ui';
import { useCreatePlaylist } from '../../hooks/queries';
import type { Post, StudioPostStat } from '../../lib/types';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';

const Markdown = lazy(() => import('../reader/Markdown'));

/* ============ types + draft persistence (localStorage) ============ */

type Kind = 'visual' | 'forge';
type StudioTab = 'drafts' | 'sequence';

interface Draft {
  id: string; kind: Kind;
  title: string; caption: string; summary: string; content: string;
  tags: string[]; location: string;
  mediaUrl: string | null; mediaType: 'image' | 'video' | null;
  updatedAt: number; createdAt: number;
}

const LS_KEY = 'ayurverse.creatorStudio.drafts.v1';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function blankDraft(kind: Kind): Draft {
  return {
    id: uid(), kind, title: '', caption: '', summary: '', content: '',
    tags: [], location: '', mediaUrl: null, mediaType: null,
    updatedAt: Date.now(), createdAt: Date.now(),
  };
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((d) => d && d.id && d.kind) : [];
  } catch { return []; }
}

/* ============ starter templates ============ */

const TEMPLATES: { id: string; kind: Kind; name: string; icon: typeof Feather; blurb: string; fill: Partial<Draft> }[] = [
  { id: 'moment', kind: 'visual', name: 'A Quiet Moment', icon: ImageIcon, blurb: 'One frame, one feeling.',
    fill: { caption: 'The hour before the lamps are lit — #stillness', tags: ['stillness'] } },
  { id: 'recipe', kind: 'forge', name: 'Kitchen Scroll', icon: Flame, blurb: 'A recipe or ritual, step by step.',
    fill: { title: 'A warming ritual for cold mornings', tags: ['kitchen', 'ritual'], summary: 'A five-minute practice from the family kitchen.',
      content: '## The ingredients\n\n- warm water\n- a thumb of ginger\n- half a lime\n- a thread of honey\n\n---\n\n## The method\n\n1. Wake the ginger in warm water.\n2. Add lime off the heat.\n3. Sweeten only when warm, never hot.\n\n> The stomach is the second heart — tend it first.' } },
  { id: 'field', kind: 'forge', name: 'Field Note', icon: BookOpen, blurb: 'Place, time, texture.',
    fill: { title: 'Field note — ', tags: ['fieldnotes'], summary: 'Observed on location, written the same evening.',
      content: '## Where\n\n## What the light did\n\n## What I carried home\n' } },
  { id: 'essay', kind: 'forge', name: 'Long Scroll', icon: ScrollText, blurb: 'A full markdown manuscript.',
    fill: { title: '', tags: [], summary: '',
      content: '## Opening\n\nBegin with the smallest true thing.\n\n---\n\n## The turn\n\n> One line worth remembering.\n\n## The return\n\nEnd where you began, changed.' } },
];

/* ============ health engine ============ */

function healthOf(d: Draft) {
  const words = (s: string) => (s.trim().match(/\S+/g) || []).length;
  const checks = d.kind === 'visual'
    ? [
        { id: 'frame', label: 'A frame is attached', ok: !!d.mediaUrl, weight: 40, hint: 'Visual posts need an image or video.' },
        { id: 'caption', label: 'Caption present', ok: d.caption.trim().length >= 8, weight: 30, hint: 'At least a sentence (8+ chars).' },
        { id: 'tags', label: '1–4 tags', ok: d.tags.length >= 1 && d.tags.length <= 4, weight: 20, hint: 'A few tags help the garden find you.' },
        { id: 'location', label: 'Place named', ok: d.location.trim().length > 0, weight: 10, hint: 'Optional — grounds the moment.' },
      ]
    : [
        { id: 'title', label: 'Title set', ok: d.title.trim().length >= 4, weight: 20, hint: 'A title readers can hold.' },
        { id: 'body', label: '60+ words', ok: words(d.content) >= 60, weight: 25, hint: 'Scrolls open up past ~60 words.' },
        { id: 'headers', label: 'Has a ## header', ok: /^#{1,3}\s/m.test(d.content), weight: 15, hint: 'Structure invites reading.' },
        { id: 'summary', label: 'Summary written', ok: d.summary.trim().length >= 20, weight: 15, hint: 'One luminous line (20+ chars).' },
        { id: 'sutra', label: 'A > sutra callout', ok: /^>\s/m.test(d.content), weight: 15, hint: 'Lift one profound line into a quote.' },
        { id: 'tags', label: 'Tags present', ok: d.tags.length >= 1, weight: 10, hint: 'Tags braid your scroll into the library.' },
      ];
  const score = Math.round(checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0));
  return { score: Math.min(100, score), checks };
}

/* ============ muhurta (auspicious posting hour) ============ */

const MUHURTA = [
  { h: 5, label: 'Brahma muhurta', note: 'the quiet before dawn — deepest readers', icon: Gem },
  { h: 8, label: 'Morning bloom', note: 'fresh eyes, first scrolls of the day', icon: Sparkles },
  { h: 12, label: 'Midday rest', note: 'lighter attention, softer reach', icon: Circle },
  { h: 17, label: 'Golden hour', note: 'the garden is fullest at dusk', icon: Flame },
  { h: 21, label: 'Lamp-light', note: 'slow, long, devoted reading', icon: Timer },
];

function nearestMuhurta(date: Date) {
  const h = date.getHours();
  let best = MUHURTA[0]; let bestDist = 24;
  for (const m of MUHURTA) {
    const dist = Math.min(Math.abs(h - m.h), 24 - Math.abs(h - m.h));
    if (dist < bestDist) { bestDist = dist; best = m; }
  }
  return { current: best, dist: bestDist };
}

/* ============ small artifacts ============ */

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

function HealthRing({ score }: { score: number }) {
  const r = 26; const c = 2 * Math.PI * r; const frac = score / 100;
  const tone = score >= 80 ? '#3d7a5a' : score >= 55 ? '#e0aa1f' : '#c05a2e';
  return (
    <div className="relative w-[64px] h-[64px]">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#eadcc0" strokeWidth="5" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - frac) }} transition={{ duration: 0.9, ease }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <motion.span key={score} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display font-semibold text-[15px] text-ink-900">{score}</motion.span>
      </div>
    </div>
  );
}

function WordMark({ text }: { text: string }) {
  const words = (text.trim().match(/\S+/g) || []).length;
  const mins = Math.max(1, Math.round(words / 200));
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-400 tabular-nums">
      <Type size={10} /> {words}w · {text.length}c · {mins} min
    </span>
  );
}

const STOP = new Set(('a,an,the,and,or,but,of,in,on,for,with,to,from,by,at,is,are,was,were,be,been,it,its,this,that,these,those,you,your,i,we,they,he,she,as,not,so,do,does,did,have,has,had,will,would,can,could,should,about,into,over,after,before,between,through,my,our,their,his,her').split(','));

function extractTags(text: string, max = 6): string[] {
  const freq = new Map();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}'-]{4,}/gu) || []) {
    const w = raw.replace(/^['-]+|['-]+$/g, '');
    if (!w || STOP.has(w) || /^\d+$/.test(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w);
}
/* ============ the studio ============ */

export default function CreatorStudio({ onExit }: { onExit?: () => void }) {
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const pushToast = useUI((s) => s.pushToast);
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  const setComposerDraft = useUI((s) => s.setComposerDraft);
  const queryClient = useQueryClient();

  /* When the weaver is sent to the Composer, close the fullscreen desk behind. */
  const sendAndExit = (fn: () => void) => () => { fn(); onExit?.(); };

  const [drafts, setDrafts] = useState(loadDrafts);
  const [activeId, setActiveId] = useState(() => loadDrafts()[0]?.id || null);
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone');
  const [previewOn, setPreviewOn] = useState(true);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [muhurta, setMuhurta] = useState(() => nearestMuhurta(new Date()));
  const [aiBusy, setAiBusy] = useState<null | 'caption' | 'summary' | 'manuscript'>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ field: 'caption' | 'summary' | 'manuscript'; text: string } | null>(null);
  const [savingFlash, setSavingFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('drafts');
  const [sequenceTitle, setSequenceTitle] = useState('');
  const [sequenceDescription, setSequenceDescription] = useState('');
  const [sequenceCategory, setSequenceCategory] = useState('Masterclass');
  const [sequenceLessonIds, setSequenceLessonIds] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const createPlaylist = useCreatePlaylist();

  const { data: publishedData } = useQuery({
    queryKey: ['studio'],
    queryFn: ({ signal }) => apiFetch<{ posts: StudioPostStat[] }>('/api/analytics', { signal }),
    enabled: studioTab === 'sequence',
    staleTime: 60_000,
  });
  const publishedLessons = (publishedData?.posts ?? []).filter((post) => post.kind === 'forge' || post.media_type === 'video');

  const toggleSequenceLesson = (postId: number) => {
    setSequenceLessonIds((ids) => (ids.includes(postId) ? ids.filter((id) => id !== postId) : [...ids, postId]));
  };

  const createSequence = () => {
    const title = sequenceTitle.trim();
    if (!title) {
      pushToast('Give this Sanctum Sequence a title', 'error');
      return;
    }
    if (!sequenceLessonIds.length) {
      pushToast('Choose at least one published lesson', 'error');
      return;
    }
    createPlaylist.mutate(
      {
        title,
        description: sequenceDescription.trim() || undefined,
        category: sequenceCategory.trim() || 'Masterclass',
        post_ids: sequenceLessonIds,
        thumbnail_url: publishedLessons.find((post) => sequenceLessonIds.includes(post.id))?.media_url || undefined,
      },
      {
        onSuccess: () => {
          setSequenceTitle('');
          setSequenceDescription('');
          setSequenceCategory('Masterclass');
          setSequenceLessonIds([]);
          setStudioTab('drafts');
        },
      },
    );
  };

  useEffect(() => { const t = setInterval(() => setMuhurta(nearestMuhurta(new Date())), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(drafts)); } catch { /* storage full */ } }, [drafts]);

  const draft = drafts.find((d) => d.id === activeId) || null;
  const health = useMemo(() => (draft ? healthOf(draft) : { score: 0, checks: [] }), [draft]);
  const suggestedTags = useMemo(() => {
    if (!draft) return [];
    const src = draft.kind === 'forge' ? draft.title + ' ' + draft.content : draft.caption;
    return extractTags(src).filter((t) => !draft.tags.includes(t)).slice(0, 5);
  }, [draft]);

  const update = (patch: Partial<Draft>) => {
    if (!activeId) return;
    setDrafts((ds) => ds.map((d) => (d.id === activeId ? { ...d, ...patch, updatedAt: Date.now() } : d)));
  };

  const createDraft = (kind: Kind, fill?: Partial<Draft>) => {
    const d = { ...blankDraft(kind), ...(fill || {}) };
    setDrafts((ds) => [d, ...ds]);
    setActiveId(d.id);
    setVaultOpen(false);
    return d.id;
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    const id = createDraft(t.kind, t.fill);
    pushToast('Template laid on the desk — make it yours', 'neem');
    return id;
  };

  const deleteDraft = (id: string) => {
    setDrafts((ds) => { const rest = ds.filter((d) => d.id !== id); if (id === activeId) setActiveId(rest[0]?.id || null); return rest; });
    pushToast('Draft returned to the wind');
  };

  const duplicateDraft = (id: string) => {
    const src = drafts.find((d) => d.id === id);
    if (!src) return;
    const copy = { ...src, id: uid(), title: src.title ? src.title + ' (copy)' : '', createdAt: Date.now(), updatedAt: Date.now() };
    setDrafts((ds) => [copy, ...ds]);
    setActiveId(copy.id);
    pushToast('A twin scroll appears', 'neem');
  };

  const flashSave = () => { setSavingFlash(true); setTimeout(() => setSavingFlash(false), 900); pushToast('Ink settled — draft kept', 'neem'); };

  /* ---- markdown toolbar ---- */
  const mdWrap = (before: string, after?: string) => {
    if (!draft) return;
    const sel = window.getSelection?.();
    void sel;
    update({ content: draft.content + (draft.content.endsWith('\n') || !draft.content ? '' : '\n') + before + 'text' + (after || before) });
  };
  const mdBlock = (token: string) => { if (draft) update({ content: draft.content + (draft.content ? '\n\n' : '') + token + '\n' }); };

  /* ---- media ---- */
  const pickMedia = async (file: File) => {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const url = await uploadMedia(file);
      update({ mediaUrl: url, mediaType: file.type.startsWith('video') ? 'video' : 'image' });
      pushToast('Frame sealed into the draft', 'neem');
    } catch (err) { pushToast((err as Error).message, 'error'); } finally { setUploading(false); }
  };

  /* ---- AI scribe ---- */
  const polish = async (mode: 'caption' | 'summary' | 'manuscript') => {
    if (!draft) return;
    const source = mode === 'manuscript' ? draft.content : mode === 'caption' ? draft.caption : draft.summary;
    if (!source.trim()) { pushToast('Write a seed line first — the scribe polishes, it does not invent', 'error'); return; }
    setAiBusy(mode);
    try {
      const res = await apiFetch<{ text: string; fallback?: boolean }>('/api/ai', { method: 'POST', body: JSON.stringify({ mode, text: source, title: draft.title }) });
      setAiSuggestion({ field: mode, text: res.text });
      if (res.fallback) pushToast('The gateway napped — the house scribe polished this by hand', 'neem');
    } catch (err) { pushToast((err as Error).message, 'error'); } finally { setAiBusy(null); }
  };
  const applySuggestion = () => {
    if (!aiSuggestion) return;
    if (aiSuggestion.field === 'caption') update({ caption: aiSuggestion.text });
    if (aiSuggestion.field === 'summary') update({ summary: aiSuggestion.text });
    if (aiSuggestion.field === 'manuscript') update({ content: aiSuggestion.text });
    setAiSuggestion(null);
    pushToast('The scribe\'s ink settles in', 'neem');
  };

  /* ---- seal it here, or hand it to the composer ---- */

  /** Mirrors the server's own rules (api/posts.js) so the desk fails early. */
  const publishBlocker = (d: Draft) => {
    if (d.kind === 'visual' && !d.mediaUrl) return 'Attach a frame first — visual posts need media';
    if (d.kind === 'visual' && !d.caption.trim()) return 'A visual post needs a caption';
    if (d.kind === 'forge' && d.title.trim().length < 4) return 'Give the scroll a title worth reading';
    if (d.kind === 'forge' && d.content.trim().length < 20) return 'Give the scroll a little more ink (20+ chars)';
    return null;
  };

  const publishDraft = async () => {
    if (!draft || publishing) return;
    const blocker = publishBlocker(draft);
    if (blocker) {
      pushToast(blocker, 'error');
      return;
    }
    const draftId = draft.id;
    const kind = draft.kind;
    setPublishing(true);
    try {
      await apiFetch<Post>('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          caption: kind === 'visual' ? draft.caption : null,
          title: kind === 'forge' ? draft.title : null,
          summary: kind === 'forge' ? draft.summary : null,
          content_md: kind === 'forge' ? draft.content : null,
          media_url: draft.mediaUrl,
          media_urls: draft.mediaUrl ? [draft.mediaUrl] : [],
          media_type: draft.mediaType,
          location: draft.location || null,
          tags: draft.tags,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      queryClient.invalidateQueries({ queryKey: ['studio'] });
      // It has left the desk — retire the draft so it cannot ship twice.
      setDrafts((ds) => {
        const rest = ds.filter((d) => d.id !== draftId);
        if (draftId === activeId) setActiveId(rest[0]?.id || null);
        return rest;
      });
      pushToast(kind === 'forge' ? 'Your scroll now rests in the Forge' : 'Your moment now blooms in the Feed', 'neem');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setPublishing(false);
    }
  };

  const sendToComposer = () => {
    if (!draft) return;
    if (draft.kind === 'visual' && !draft.mediaUrl) { pushToast('Attach a frame first — visual posts need media', 'error'); return; }
    if (draft.kind === 'forge' && draft.content.trim().length < 20) { pushToast('Give the scroll a little more ink (20+ chars)', 'error'); return; }
    setComposerDraft({
      kind: draft.kind, title: draft.title, caption: draft.caption, summary: draft.summary,
      content: draft.content, tags: draft.tags, location: draft.location,
      // carry the bytes the desk already paid for
      mediaUrl: draft.mediaUrl, mediaType: draft.mediaType,
    });
    setComposerOpen(true);
    pushToast('Draft carried to the Composer — seal it there');
  };
  /* ============ preview + inspector (right pane) ============ */

  const authorName = user?.user_metadata?.full_name || 'You';
  const authorAvatar = user?.user_metadata?.avatar_url || null;

  const feedCard = (
    <div className="rounded-2xl border border-sand-300/80 bg-parchment overflow-hidden shadow-[0_18px_40px_-24px_rgba(12,27,19,0.5)]">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <Avatar url={authorAvatar} name={authorName} size={32} />
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-ink-900 leading-tight truncate">{authorName}</p>
          <p className="text-[10px] text-ink-500 truncate">{draft?.location || 'Somewhere warm'} · preview</p>
        </div>
        <Sparkles size={13} className="ml-auto text-gold-500/60" />
      </div>
      <div className="relative aspect-square bg-[linear-gradient(130deg,#1b4230,#7a4a12)] grid place-items-center overflow-hidden">
        {draft?.mediaUrl ? (
          draft.mediaType === 'video'
            ? <video src={draft.mediaUrl} className="w-full h-full object-cover" muted loop autoPlay playsInline />
            : <img src={draft.mediaUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Mandala className="w-24 h-24 text-parchment/25 animate-spin-slower" petals={12} />
        )}
        {!draft?.mediaUrl && <span className="absolute bottom-3 text-[10px] uppercase tracking-[0.2em] text-parchment/60">your frame appears here</span>}
      </div>
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-3 text-ink-600">
          <motion.span whileTap={{ scale: 1.3 }} className="cursor-pointer"><Flame size={16} className="text-terra-500" /></motion.span>
          <Eye size={16} /> <Save size={16} />
        </div>
        <p className="mt-2 text-[12.5px] text-ink-800 leading-relaxed whitespace-pre-wrap">
          {draft?.caption?.trim() || <span className="italic text-ink-400">Your caption will rest here…</span>}
        </p>
        {draft?.tags?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {draft.tags.map((t) => (<span key={t} className="text-[10px] text-neem-700 font-medium">#{t}</span>))}
          </div>
        ) : null}
      </div>
    </div>
  );

  const scrollReader = (
    <div className="rounded-2xl border border-sand-300/80 bg-parchment overflow-hidden shadow-[0_18px_40px_-24px_rgba(12,27,19,0.5)]">
      <div className="px-4 pt-4 pb-3 border-b border-sand-200/70 bg-gradient-to-b from-parchment-deep/50 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-saffron-700 bg-saffron-500/10 border border-saffron-500/25 rounded-full px-2 py-0.5">scroll</span>
          <WordMark text={draft?.content || ''} />
        </div>
        <h3 className="font-display font-semibold text-[19px] text-ink-900 mt-2 leading-tight">{draft?.title?.trim() || <span className="italic text-ink-400">The untitled scroll</span>}</h3>
        <p className="text-[12px] text-ink-500 mt-1 italic">{draft?.summary?.trim() || 'A one-line summary will glow here.'}</p>
      </div>
      <div className="px-4 py-3 max-h-[46vh] overflow-y-auto">
        {draft?.content?.trim() ? (
          <Suspense fallback={<Mandala className="w-10 h-10 mx-auto my-4 text-gold-500/70 animate-spin-slower" petals={12} />}>
            <div className="md-body text-[13px]"><Markdown source={draft.content} /></div>
          </Suspense>
        ) : (
          <p className="text-[12.5px] text-ink-400 italic py-6 text-center">Nothing inked yet — begin on the canvas.</p>
        )}
      </div>
    </div>
  );

  const previewPane = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-full border border-sand-300 bg-parchment p-0.5">
          {[{ id: 'phone', icon: Smartphone, label: 'Hand' }, { id: 'desktop', icon: Monitor, label: 'Desk' }].map((d) => (
            <button key={d.id} onClick={() => setDevice(d.id as 'phone' | 'desktop')}
              className={'relative inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10.5px] font-semibold transition-colors ' + (device === d.id ? 'text-parchment' : 'text-ink-600')}>
              {device === d.id && <motion.span layoutId="dev-pill" className="absolute inset-0 rounded-full bg-neem-800" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <d.icon size={11} className="relative z-10" /><span className="relative z-10">{d.label}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setPreviewOn((v) => !v)} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-500 hover:text-neem-700">
          <Eye size={12} /> {previewOn ? 'Hide' : 'Show'}
        </button>
      </div>
      <AnimatePresence mode="wait">
        {previewOn && (
          <motion.div key={device + (draft?.kind || '')} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.3, ease }}
            className={device === 'phone' ? 'mx-auto w-full max-w-[300px]' : 'w-full'}>
            <div className={device === 'phone' ? 'rounded-[26px] border-[5px] border-neem-950 bg-parchment p-2 shadow-[0_30px_60px_-24px_rgba(12,27,19,0.6)]' : ''}>
              {draft?.kind === 'forge' ? scrollReader : feedCard}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const inspector = (
    <div className="card-warm p-4">
      <div className="flex items-center gap-3">
        <HealthRing score={health.score} />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">Manuscript health</p>
          <p className="font-display font-semibold text-ink-900 text-[16px] leading-tight">
            {health.score >= 80 ? 'Ready to bloom' : health.score >= 55 ? 'Nearly there' : 'Still forming'}
          </p>
          <p className="text-[10.5px] text-ink-500">{health.checks.filter((c) => c.ok).length}/{health.checks.length} rites observed</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {health.checks.map((c) => (
          <motion.li key={c.id} initial={false} animate={{ opacity: c.ok ? 1 : 0.7 }} className="flex items-start gap-2 text-[11.5px]">
            {c.ok ? <CheckCircle2 size={14} className="text-neem-600 mt-0.5 shrink-0" /> : <Circle size={14} className="text-sand-400 mt-0.5 shrink-0" />}
            <span className={c.ok ? 'text-ink-700' : 'text-ink-500'}>
              <span className="font-medium">{c.label}</span>
              {!c.ok && <span className="block text-[10px] text-ink-400">{c.hint}</span>}
            </span>
          </motion.li>
        ))}
      </ul>
      {suggestedTags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-sand-200">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500 mb-1.5 inline-flex items-center gap-1"><Hash size={10} /> Suggested</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedTags.map((t) => (
              <button key={t} onClick={() => update({ tags: [...(draft?.tags || []), t].slice(0, 8) })}
                className="inline-flex items-center gap-1 rounded-full border border-neem-500/30 bg-neem-500/10 text-neem-700 text-[10px] font-semibold px-2 py-0.5 hover:bg-neem-500/20">
                <Plus size={9} /> {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  /* ============ compose canvas ============ */

  const inputCls = 'mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-3.5 py-2.5 text-[13px] text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400';

  const composePane = !draft ? (
    <div className="card-warm p-10 text-center">
      <Mandala className="w-20 h-20 mx-auto text-sand-400 animate-spin-slower" petals={12} />
      <p className="font-display text-lg text-ink-900 mt-4">The desk is clear.</p>
      <p className="text-[12.5px] text-ink-500 mt-1">Pick a template or begin a blank scroll.</p>
      <div className="mt-5 flex items-center justify-center gap-2.5">
        <button onClick={() => createDraft('visual')} className="rounded-full bg-saffron-600 text-parchment px-5 py-2.5 text-[12.5px] font-semibold hover:bg-saffron-700 inline-flex items-center gap-1.5"><ImageIcon size={14} /> Visual</button>
        <button onClick={() => createDraft('forge')} className="rounded-full border border-sand-300 bg-parchment px-5 py-2.5 text-[12.5px] font-semibold text-ink-700 hover:bg-sand-100 inline-flex items-center gap-1.5"><ScrollText size={14} /> Scroll</button>
      </div>
    </div>
  ) : (
    <div className="card-warm overflow-hidden">
      {/* kind banner + actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sand-200/70 bg-gradient-to-b from-parchment-deep/40 to-transparent">
        <span className={'grid place-items-center w-8 h-8 rounded-xl ' + (draft.kind === 'forge' ? 'bg-gold-500/15 text-gold-600' : 'bg-saffron-500/15 text-saffron-600')}>
          {draft.kind === 'forge' ? <ScrollText size={15} /> : <ImageIcon size={15} />}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">{draft.kind === 'forge' ? 'Scroll manuscript' : 'Visual moment'}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-ink-400">
          {savingFlash ? <CheckCircle2 size={11} className="text-neem-600" /> : <Clock size={11} />} {savingFlash ? 'kept' : 'autosaves'}
        </span>
        <button onClick={() => duplicateDraft(draft.id)} title="Duplicate" className="p-1.5 rounded-lg text-ink-500 hover:text-neem-700 hover:bg-sand-200/60"><Copy size={13} /></button>
        <button onClick={() => deleteDraft(draft.id)} title="Delete" className="p-1.5 rounded-lg text-ink-500 hover:text-terra-600 hover:bg-terra-500/10"><Trash2 size={13} /></button>
      </div>

      <div className="p-4 space-y-4">
        {/* media for visual */}
        {draft.kind === 'visual' && (
          <div>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickMedia(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="relative w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-sand-300 bg-parchment-deep/40 overflow-hidden group hover:border-gold-400/60 transition-colors grid place-items-center">
              {draft.mediaUrl ? (
                <>
                  {draft.mediaType === 'video' ? <video src={draft.mediaUrl} className="w-full h-full object-cover" muted /> : <img src={draft.mediaUrl} alt="" className="w-full h-full object-cover" />}
                  <span className="absolute inset-0 bg-neem-950/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center text-parchment text-[11px] font-semibold">Change frame</span>
                </>
              ) : (
                <span className="flex flex-col items-center gap-2 text-ink-500">
                  {uploading ? <Loader2 size={22} className="animate-spin text-gold-600" /> : <ImageIcon size={22} className="text-sand-400 group-hover:text-gold-600 transition-colors" />}
                  <span className="text-[11.5px] font-medium">{uploading ? 'Sealing the frame…' : 'Attach an image or video'}</span>
                </span>
              )}
            </button>
          </div>
        )}

        {/* toolbar (forge) */}
        {draft.kind === 'forge' && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-sand-200 bg-parchment-deep/40 p-1.5">
            {[
              { icon: Bold, fn: () => mdWrap('**'), t: 'Bold' },
              { icon: Italic, fn: () => mdWrap('*'), t: 'Italic' },
              { icon: Heading2, fn: () => mdBlock('## '), t: 'Heading' },
              { icon: Quote, fn: () => mdBlock('> '), t: 'Sutra quote' },
              { icon: List, fn: () => mdBlock('- item'), t: 'List' },
              { icon: Code2, fn: () => mdBlock(['```', 'code', '```'].join('\n')), t: 'Code' },
              { icon: Minus, fn: () => mdBlock('---'), t: 'Divider' },
            ].map((b) => (
              <button key={b.t} onClick={b.fn} title={b.t} className="grid place-items-center w-8 h-8 rounded-lg text-ink-600 hover:bg-parchment hover:text-neem-800 hover:shadow-sm transition-all">
                <b.icon size={14} />
              </button>
            ))}
            <span className="ml-auto"><WordMark text={draft.content} /></span>
          </div>
        )}

        {/* fields */}
        {draft.kind === 'visual' ? (
          <>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><Type size={11} /> Caption</span>
              <textarea value={draft.caption} onChange={(e) => update({ caption: e.target.value })} rows={3} placeholder="Name the moment — warm, spare, true…" className={inputCls + ' resize-none'} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><MapPin size={11} /> Place</span>
                <input value={draft.location} onChange={(e) => update({ location: e.target.value })} placeholder="Kerala, monsoon" className={inputCls} />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><Hash size={11} /> Tags</span>
                <input value={draft.tags.join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 8) })} placeholder="stillness, dusk" className={inputCls} />
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><Type size={11} /> Title</span>
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="Name the scroll…" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><Sparkles size={11} /> Summary</span>
              <input value={draft.summary} onChange={(e) => update({ summary: e.target.value })} placeholder="One luminous line that carries the whole scroll…" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><BookOpen size={11} /> Manuscript</span>
              <textarea value={draft.content} onChange={(e) => update({ content: e.target.value })} rows={isDesktop ? 10 : 12} placeholder={'## The opening sutra\n\nWrite with **markdown**, a > callout, and a --- rule—'} className={inputCls + ' font-mono text-[12px] leading-relaxed bg-[#fdf9ef]'} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1"><Hash size={11} /> Tags</span>
              <input value={draft.tags.join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 8) })} placeholder="ayurveda, ritual, kitchen" className={inputCls} />
            </label>
          </>
        )}

        {/* AI scribe */}
        <div className="rounded-xl border border-gold-500/25 bg-gradient-to-br from-gold-500/[0.06] to-saffron-500/[0.04] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 size={13} className="text-gold-600" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold-700">The house scribe</span>
            <span className="ml-auto text-[9.5px] text-ink-400">big-pickle</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(draft.kind === 'forge' ? ([['caption', 'Polish summary'], ['manuscript', 'Illuminate manuscript']] as const) : ([['caption', 'Polish caption']] as const)).map(([mode, label]) => (
              <button key={mode} onClick={() => polish(mode)} disabled={aiBusy !== null}
                className="inline-flex items-center gap-1.5 rounded-full bg-parchment border border-gold-500/30 text-gold-700 text-[11px] font-semibold px-3 py-1.5 hover:bg-gold-500/10 disabled:opacity-50">
                {aiBusy === mode ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} {label}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {aiSuggestion && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3 rounded-lg border border-sand-300 bg-parchment p-3">
                <p className="text-[12px] text-ink-800 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">{aiSuggestion.text}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={applySuggestion} className="rounded-full bg-neem-700 text-parchment text-[10.5px] font-semibold px-3 py-1 hover:bg-neem-800 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Use it</button>
                  <button onClick={() => setAiSuggestion(null)} className="rounded-full border border-sand-300 text-ink-600 text-[10.5px] font-semibold px-3 py-1 hover:bg-sand-100 inline-flex items-center gap-1"><X size={11} /> Dismiss</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* footer actions */}
      <div className="px-4 py-3 border-t border-sand-200/70 bg-parchment/70 backdrop-blur flex items-center gap-2.5">
        <button onClick={flashSave} className="inline-flex items-center gap-1.5 rounded-xl border border-sand-300 bg-parchment px-4 py-2.5 text-[12px] font-semibold text-ink-700 hover:bg-sand-100">
          <Save size={13} /> Save draft
        </button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={sendAndExit(sendToComposer)} disabled={health.score < 40}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-sand-300 bg-parchment px-4 py-2.5 text-[12px] font-semibold text-ink-700 hover:bg-sand-100 disabled:opacity-40 transition-colors">
          <Send size={13} /> Send to Composer
        </motion.button>
        <motion.button
          whileHover={{ scale: publishing ? 1 : 1.02 }}
          whileTap={{ scale: publishing ? 1 : 0.97 }}
          onClick={publishDraft}
          disabled={!draft || publishing || !!publishBlocker(draft)}
          title={draft ? publishBlocker(draft) || 'Publish this to the garden' : 'Lay a draft on the desk first'}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment px-5 py-2.5 text-[12.5px] font-semibold shadow-[0_10px_24px_-10px_rgba(214,138,20,0.7)] disabled:opacity-40 disabled:shadow-none hover:brightness-105 transition-all"
        >
          {publishing ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
          {publishing ? 'Publishing…' : 'Publish'}
        </motion.button>
      </div>
    </div>
  );
  /* ============ draft shelf ============ */

  const shelf = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500 inline-flex items-center gap-1.5"><Layers size={12} /> Draft shelf</p>
        <span className="text-[10px] text-ink-400 tabular-nums">{drafts.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => createDraft('visual')} className="rounded-xl border-2 border-dashed border-sand-300 bg-parchment-deep/30 p-3 text-left hover:border-saffron-500/50 hover:bg-saffron-500/5 transition-colors group">
          <ImageIcon size={16} className="text-sand-400 group-hover:text-saffron-600 transition-colors" />
          <p className="text-[11.5px] font-semibold text-ink-700 mt-1.5">New visual</p>
        </button>
        <button onClick={() => createDraft('forge')} className="rounded-xl border-2 border-dashed border-sand-300 bg-parchment-deep/30 p-3 text-left hover:border-gold-500/50 hover:bg-gold-500/5 transition-colors group">
          <ScrollText size={16} className="text-sand-400 group-hover:text-gold-600 transition-colors" />
          <p className="text-[11.5px] font-semibold text-ink-700 mt-1.5">New scroll</p>
        </button>
      </div>
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
        <AnimatePresence initial={false}>
          {drafts.map((d) => {
            const h = healthOf(d);
            const active = d.id === activeId;
            return (
              <motion.button key={d.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14, scale: 0.96 }} transition={{ duration: 0.22, ease }}
                onClick={() => setActiveId(d.id)}
                className={'w-full text-left rounded-xl border p-3 transition-all ' + (active ? 'border-gold-500/60 bg-gradient-to-br from-gold-500/10 to-saffron-500/5 shadow-[0_8px_20px_-12px_rgba(217,111,16,0.5)]' : 'border-sand-300/80 bg-parchment hover:border-sand-400')}>
                <div className="flex items-center gap-2">
                  {d.kind === 'forge' ? <ScrollText size={13} className="text-gold-600 shrink-0" /> : <ImageIcon size={13} className="text-saffron-600 shrink-0" />}
                  <p className="text-[12px] font-semibold text-ink-900 truncate flex-1">{d.title || d.caption.slice(0, 40) || 'Untitled draft'}</p>
                  <span className={'text-[9px] font-bold tabular-nums ' + (h.score >= 80 ? 'text-neem-600' : h.score >= 55 ? 'text-gold-600' : 'text-terra-500')}>{h.score}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-ink-400">
                  <span className="capitalize">{d.kind}</span>
                  <span>{timeAgo(new Date(d.updatedAt).toISOString())}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-sand-200/70 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: h.score + '%' }} transition={{ duration: 0.6, ease }} className={'h-full ' + (h.score >= 80 ? 'bg-neem-500' : h.score >= 55 ? 'bg-gold-500' : 'bg-terra-500')} />
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
        {drafts.length === 0 && <p className="text-[11px] text-ink-400 italic text-center py-4">No drafts yet — the shelf waits.</p>}
      </div>
    </div>
  );

  /* ============ templates drawer + muhurta ============ */

  const templatesAndTime = (
    <div className="space-y-4">
      <div className="card-warm overflow-hidden">
        <button onClick={() => setVaultOpen((v) => !v)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-sand-100/50 transition-colors">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-saffron-500/20 to-gold-500/20 text-saffron-600"><FileText size={15} /></span>
          <div className="flex-1">
            <p className="text-[12px] font-bold text-ink-900">Starter templates</p>
            <p className="text-[10px] text-ink-500">Four ready forms to begin from</p>
          </div>
          <motion.span animate={{ rotate: vaultOpen ? 90 : 0 }} transition={{ duration: 0.25 }}><ChevronRight size={15} className="text-ink-400" /></motion.span>
        </button>
        <AnimatePresence initial={false}>
          {vaultOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
              <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <motion.button key={t.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => applyTemplate(t)}
                    className="rounded-xl border border-sand-300/80 bg-parchment p-3 text-left hover:border-saffron-500/40 hover:shadow-md transition-all">
                    <t.icon size={16} className="text-saffron-600" />
                    <p className="text-[11.5px] font-semibold text-ink-900 mt-1.5">{t.name}</p>
                    <p className="text-[9.5px] text-ink-500 leading-snug">{t.blurb}</p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="card-warm p-4 relative overflow-hidden">
        <Mandala className="absolute -right-8 -bottom-8 w-28 h-28 text-gold-500/10 animate-spin-slower pointer-events-none" petals={12} />
        <div className="flex items-center gap-2">
          <muhurta.current.icon size={15} className="text-gold-600" />
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-500">Muhurta</p>
          <span className="ml-auto text-[9px] text-ink-400">auspicious hour</span>
        </div>
        <p className="font-display font-semibold text-ink-900 text-[15px] mt-2">{muhurta.current.label}</p>
        <p className="text-[11px] text-ink-500 leading-snug mt-0.5">{muhurta.current.note}</p>
        <div className="mt-3 flex gap-1">
          {MUHURTA.map((m) => (
            <div key={m.h} title={m.label} className={'h-1 flex-1 rounded-full transition-colors ' + (m.h === muhurta.current.h ? 'bg-gold-500' : 'bg-sand-200')} />
          ))}
        </div>
        <p className="mt-2 text-[9.5px] text-ink-400 italic">{muhurta.dist === 0 ? 'The hour is upon you — post now.' : 'The next auspicious window nears.'}</p>
      </div>
    </div>
  );

  /* ============ Sanctum Sequence builder ============ */

  const sequencePane = (
    <div className="card-warm overflow-hidden">
      <div className="px-4 py-3 border-b border-sand-200/70 bg-gradient-to-br from-gold-500/10 via-saffron-500/[0.06] to-transparent">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gold-500/15 text-gold-700 ring-1 ring-gold-500/25">
            <ListOrdered size={18} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-700">Creator Studio</p>
            <h3 className="font-display font-semibold text-[17px] text-ink-900 leading-tight">Create Sanctum Sequence</h3>
          </div>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-600">
          Bind published scrolls and masterclasses into an ordered learning path. Lessons remain standalone posts.
        </p>
      </div>

      <div className="p-4 space-y-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Sequence title</span>
          <input
            value={sequenceTitle}
            onChange={(e) => setSequenceTitle(e.target.value)}
            maxLength={120}
            placeholder="Foundations of Agni"
            className={inputCls}
          />
        </label>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_150px] gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Description</span>
            <textarea
              value={sequenceDescription}
              onChange={(e) => setSequenceDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="What will a learner carry from this path?"
              className={inputCls + ' resize-none'}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Category</span>
            <input
              value={sequenceCategory}
              onChange={(e) => setSequenceCategory(e.target.value)}
              maxLength={50}
              placeholder="Masterclass"
              className={inputCls}
            />
          </label>
        </div>

        <div className="border-t border-sand-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Published lessons</p>
              <p className="text-[11px] text-ink-400 mt-0.5">Tap in desired lesson order.</p>
            </div>
            <span className="rounded-full bg-gold-500/12 text-gold-700 px-2.5 py-1 text-[10.5px] font-bold tabular-nums">
              {sequenceLessonIds.length} selected
            </span>
          </div>

          <div className="mt-2.5 space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            {publishedData === undefined ? (
              <div className="py-8 grid place-items-center text-center">
                <Mandala className="w-10 h-10 text-gold-500/60 animate-spin-slower" petals={12} />
                <p className="mt-2 text-[11.5px] text-ink-500">Gathering your published work…</p>
              </div>
            ) : publishedLessons.length ? (
              publishedLessons.map((post) => {
                const sequenceIndex = sequenceLessonIds.indexOf(post.id);
                const selected = sequenceIndex >= 0;
                const label = post.title || post.caption || post.summary || `Lesson ${post.id}`;
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => toggleSequenceLesson(post.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      selected
                        ? 'border-gold-500/60 bg-gold-500/10 shadow-[0_6px_16px_-12px_rgba(217,111,16,0.7)]'
                        : 'border-sand-300 bg-parchment hover:border-gold-500/40'
                    }`}
                  >
                    <span className={`grid place-items-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 ${
                      selected ? 'bg-gold-500 text-parchment' : 'border border-sand-300 text-ink-400'
                    }`}>
                      {selected ? sequenceIndex + 1 : <Plus size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-ink-800 truncate">{label}</span>
                      <span className="block text-[10.5px] text-ink-400 mt-0.5">
                        {post.media_type === 'video' ? 'Video masterclass' : 'Forge scroll'}
                      </span>
                    </span>
                    {selected && <CheckCircle2 size={15} className="text-gold-600 shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-sand-300 px-4 py-8 text-center">
                <BookOpen size={20} className="mx-auto text-sand-400" />
                <p className="mt-2 text-[12px] font-medium text-ink-600">No published scrolls or video lessons yet.</p>
                <p className="mt-1 text-[11px] text-ink-400">Publish a Forge scroll or masterclass, then return to bind it here.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-sand-200/70 bg-parchment/70 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setStudioTab('drafts')}
          className="rounded-xl border border-sand-300 bg-parchment px-4 py-2.5 text-[12px] font-semibold text-ink-700 hover:bg-sand-100"
        >
          Back to drafts
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={createSequence}
          disabled={createPlaylist.isPending || !sequenceTitle.trim() || !sequenceLessonIds.length}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment px-4 py-2.5 text-[12px] font-semibold shadow-[0_10px_24px_-10px_rgba(214,138,20,0.7)] disabled:opacity-40 disabled:shadow-none"
        >
          {createPlaylist.isPending ? <Loader2 size={13} className="animate-spin" /> : <ListOrdered size={13} />}
          Bind sequence
        </motion.button>
      </div>
    </div>
  );

  /* ============ layout: fullscreen chrome + scrollable atrium ============ */

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-parchment to-parchment-deep/30">
      {/* fullscreen chrome — crest left, exit ritual right */}
      <motion.div
        initial={{ y: -14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.32, delay: 0.06, ease }}
        className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-sand-300/70 bg-parchment/95 backdrop-blur-sm"
      >
        <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-saffron-500 to-gold-500 text-parchment shadow-[0_8px_20px_-8px_rgba(217,111,16,0.7)]">
          <Feather size={16} />
          <span className="absolute -inset-1 rounded-xl border border-gold-400/40 animate-ping-slow" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-[17px] text-ink-900 leading-tight truncate">The Illuminator’s Desk</h2>
          <p className="text-[10.5px] text-ink-500 truncate">Draft, polish and preview — before anything leaves your hand.</p>
        </div>
        <div className="ml-auto inline-flex rounded-full border border-sand-300 bg-parchment p-0.5">
          {([
            { id: 'drafts', label: 'Drafts', icon: Feather },
            { id: 'sequence', label: 'Sequence', icon: ListOrdered },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStudioTab(tab.id)}
              aria-pressed={studioTab === tab.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold transition-colors ${
                studioTab === tab.id ? 'bg-neem-800 text-parchment' : 'text-ink-600 hover:bg-sand-100'
              }`}
            >
              <tab.icon size={12} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          onClick={onExit}
          title="Exit fullscreen (Esc)"
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-parchment px-3.5 py-2 text-[11.5px] font-semibold text-ink-600 hover:text-neem-800 hover:border-neem-500/40 hover:bg-neem-500/5 transition-colors shadow-sm"
        >
          <Minimize2 size={13} />
          <span className="hidden sm:inline">Exit fullscreen</span>
          <span className="hidden sm:inline text-[9px] font-normal text-ink-400 border border-sand-300 rounded px-1 py-px">Esc</span>
        </motion.button>
      </motion.div>

      {/* scrollable atrium */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          {studioTab === 'sequence' ? (
            <motion.div
              key="sequence-builder"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease }}
              className="max-w-3xl mx-auto"
            >
              {sequencePane}
            </motion.div>
          ) : isDesktop ? (
            <motion.div
              key="draft-desk"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease }}
              className="grid grid-cols-[270px_minmax(0,1fr)_330px] gap-5 items-start"
            >
              <aside className="sticky top-0 space-y-5 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                {shelf}
                {templatesAndTime}
              </aside>
              <div className="min-w-0">{composePane}</div>
              <aside className="sticky top-0 space-y-4 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                {previewPane}
                {inspector}
              </aside>
            </motion.div>
          ) : (
            <motion.div
              key="draft-mobile"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease }}
              className="space-y-5"
            >
              {shelf}
              {composePane}
              <div className="card-warm p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-3 inline-flex items-center gap-1.5"><Eye size={12} /> Preview</p>
                {previewPane}
              </div>
              {inspector}
              {templatesAndTime}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
