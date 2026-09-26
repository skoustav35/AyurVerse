import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { Eye, Feather, GripHorizontal, Hash, ImagePlus, Loader2, MapPin, PenLine, Play, Sparkles, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Mandala from '../common/Mandala';

const Markdown = lazy(() => import('../reader/Markdown'));
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import type { Post } from '../../lib/types';
import { useMyGroups } from '../../hooks/queries';
import { useUI } from '../../store/ui';

const MAX_SLIDES = 8;

/** A chosen frame, kept identity-stable so drag-reorder never re-mints its blob URL. */
interface Slide {
  id: string;
  /** Null when the frame arrived pre-uploaded from the Creator Studio. */
  file: File | null;
  url: string;
  isVideo: boolean;
  /** Server-side URL already sealed by the studio — publish must reuse, not re-upload. */
  uploadedUrl?: string;
}

const isBlobUrl = (url: string) => url.startsWith('blob:');

let slideSeq = 0;

export default function Composer() {
  const open = useUI((s) => s.composerOpen);
  const composerGroupId = useUI((s) => s.composerGroupId);
  const close = () => useUI.getState().setComposerOpen(false);
  const pushToast = useUI((s) => s.pushToast);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<'visual' | 'forge'>('visual');
  const { data: myGroups } = useMyGroups();
  const targetGroup = composerGroupId ? myGroups?.groups.find((g) => g.id === composerGroupId) : undefined;
  // when posting into a group, the kind is fixed by the group's kind
  const lockedKind: 'visual' | 'forge' | null = targetGroup
    ? targetGroup.kind === 'forge'
      ? 'forge'
      : 'visual'
    : null;
  const effectiveKind = lockedKind ?? kind;
  const [busy, setBusy] = useState(false);
  const [upState, setUpState] = useState<{ index: number; total: number; pct: number } | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [tagText, setTagText] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [previewing, setPreviewing] = useState(false);

  // Hydrate from a Creator Studio draft bundle (one-shot handoff)
  const composerDraft = useUI((s) => s.composerDraft);
  useEffect(() => {
    if (!open || !composerDraft) return;
    const d = composerDraft;
    if (d.kind) setKind(d.kind);
    if (d.title !== undefined) setTitle(d.title);
    if (d.caption !== undefined) setCaption(d.caption);
    if (d.summary !== undefined) setSummary(d.summary);
    if (d.content !== undefined) setContent(d.content);
    if (d.tags) setTagText(d.tags.join(', '));
    if (d.location !== undefined) setLocation(d.location);
    // The desk already uploaded this frame — carry the URL across so the weaver
    // does not pick and re-send the same bytes.
    if (d.mediaUrl) {
      const sealed: Slide = {
        id: `slide-${++slideSeq}`,
        file: null,
        url: d.mediaUrl,
        isVideo: d.mediaType === 'video',
        uploadedUrl: d.mediaUrl,
      };
      setSlides([sealed]);
      setActiveSlideId(sealed.id);
    }
    useUI.getState().setComposerDraft(null);
    pushToast(
      d.mediaUrl ? 'Your studio draft is on the desk — its frame came with it' : 'Your studio draft is on the desk — attach the frame and seal it',
      'neem',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const fileRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);

  // blob URLs live exactly as long as the slides that own them
  const slidesRef = useRef<Slide[]>([]);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  useEffect(
    () => () => {
      slidesRef.current.forEach((s) => {
        if (isBlobUrl(s.url)) URL.revokeObjectURL(s.url);
      });
    },
    [],
  );

  // ---- the house scribe (AI polish via OPENCODE_API_KEY / big-pickle) ----
  const [aiBusy, setAiBusy] = useState<null | 'caption' | 'summary' | 'manuscript'>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ field: 'caption' | 'summary' | 'manuscript'; text: string } | null>(null);

  const polish = async (mode: 'caption' | 'summary' | 'manuscript') => {
    const source = mode === 'manuscript' ? content : mode === 'caption' ? caption : summary;
    if (!source.trim()) {
      pushToast('Write a seed line first — the scribe polishes, it does not invent', 'error');
      return;
    }
    setAiBusy(mode);
    try {
      const res = await apiFetch<{ text: string; fallback?: boolean }>('/api/ai', {
        method: 'POST',
        body: JSON.stringify({ mode, text: source, title }),
      });
      setAiSuggestion({ field: mode, text: res.text });
      if (res.fallback)
        pushToast('The gateway napped — the house scribe polished this by hand', 'neem');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setAiBusy(null);
    }
  };

  const applySuggestion = (field: 'caption' | 'summary' | 'manuscript') => {
    if (!aiSuggestion) return;
    if (field === 'caption') setCaption(aiSuggestion.text);
    if (field === 'summary') setSummary(aiSuggestion.text);
    if (field === 'manuscript') {
      setContent(aiSuggestion.text);
      setPreviewing(true);
    }
    setAiSuggestion(null);
    pushToast('The scribe’s ink settles into your ' + (field === 'manuscript' ? 'manuscript' : field));
  };

  const aiBlock = (field: 'caption' | 'summary' | 'manuscript') => (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => polish(field)}
        disabled={aiBusy !== null}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gold-700 hover:text-saffron-600 transition-colors disabled:opacity-50"
      >
        {aiBusy === field ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
        {aiBusy === field
          ? 'The scribe is composing…'
          : field === 'manuscript'
            ? 'Majestic format with the AI scribe'
            : 'Polish with the AI scribe'}
      </button>
      <AnimatePresence>
        {aiSuggestion?.field === field && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            className="mt-2 rounded-xl border border-gold-500/50 bg-gradient-to-br from-gold-400/10 to-saffron-500/10 p-3.5"
          >
            <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-gold-700 inline-flex items-center gap-1">
              <Sparkles size={10} /> The scribe suggests
            </p>
            {field === 'manuscript' ? (
              <p className="mt-1.5 text-[11.5px] text-ink-700 whitespace-pre-wrap line-clamp-6 font-mono leading-relaxed">
                {aiSuggestion.text.slice(0, 420)}
                {aiSuggestion.text.length > 420 ? ' …' : ''}
              </p>
            ) : (
              <p className="mt-1.5 text-[13.5px] text-ink-800 leading-relaxed">{aiSuggestion.text}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={() => applySuggestion(field)}
                className="rounded-full bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment text-[11.5px] font-semibold px-4 py-1.5 hover:brightness-105"
              >
                Use this ink
              </button>
              <button
                type="button"
                onClick={() => polish(field)}
                className="rounded-full border border-sand-300 text-[11.5px] font-medium px-3.5 py-1.5 text-ink-600 hover:bg-sand-200/60"
              >
                Once more
              </button>
              <button
                type="button"
                onClick={() => setAiSuggestion(null)}
                className="rounded-full text-[11.5px] px-3 py-1.5 text-ink-400 hover:text-terra-600"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const tags = useMemo(
    () =>
      tagText
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 8),
    [tagText],
  );

  const resetAll = () => {
    slides.forEach((s) => {
      if (isBlobUrl(s.url)) URL.revokeObjectURL(s.url);
    });
    setSlides([]);
    setActiveSlideId(null);
    setCaption('');
    setLocation('');
    setTagText('');
    setTitle('');
    setSummary('');
    setContent('');
    setPreviewing(false);
  };

  const pickFiles = (newFiles: FileList | File[]) => {
    const list = Array.from(newFiles);
    if (!list.length) return;
    const valid: File[] = [];
    for (const f of list) {
      const videoTooHeavy = f.type.startsWith('video/') && f.size > 48 * 1024 * 1024;
      const genericTooHeavy = f.size > 60 * 1024 * 1024;
      if (videoTooHeavy || genericTooHeavy) {
        pushToast(
          f.type.startsWith('video/')
            ? 'Videos over ~50MB are too heavy — trim or export at 1080p'
            : 'Media must be under 60MB',
          'error',
        );
        continue;
      }
      valid.push(f);
    }
    if (!valid.length) return;

    const room = MAX_SLIDES - slides.length;
    if (room <= 0) {
      pushToast(`A carousel holds ${MAX_SLIDES} slides at most`, 'error');
      return;
    }
    if (valid.length > room) {
      pushToast(`Only ${room} more ${room === 1 ? 'slide fits' : 'slides fit'} — the rest were set aside`, 'neem');
    }

    const added: Slide[] = valid.slice(0, room).map((file) => ({
      id: `slide-${++slideSeq}`,
      file,
      url: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/'),
    }));
    setSlides((prev) => [...prev, ...added]);
    if (!slides.length) setActiveSlideId(added[0].id);
  };

  const removeSlide = (id: string) => {
    const target = slides.find((s) => s.id === id);
    if (target && isBlobUrl(target.url)) URL.revokeObjectURL(target.url);
    const next = slides.filter((s) => s.id !== id);
    setSlides(next);
    if (activeSlideId === id) setActiveSlideId(next[0]?.id ?? null);
  };

  const activeIdx = Math.max(
    0,
    slides.findIndex((s) => s.id === activeSlideId),
  );
  const activeSlide = slides[activeIdx];

  const canPublish =
    !busy &&
    (effectiveKind === 'visual'
      ? slides.length > 0 && !!caption.trim()
      : !!title.trim() && content.trim().length > 20);

  const publish = async () => {
    setBusy(true);
    try {
      const mediaUrls: string[] = [];
      let mediaType: 'image' | 'video' | null = null;

      if (effectiveKind === 'visual' && slides.length) {
        const total = slides.length;
        for (let i = 0; i < total; i++) {
          const slide = slides[i];
          if (slide.uploadedUrl) {
            mediaUrls.push(slide.uploadedUrl);
            if (!mediaType) mediaType = slide.isVideo ? 'video' : 'image';
            continue;
          }
          if (!slide.file) continue;
          setUpState({ index: i + 1, total, pct: 0 });
          const url = await uploadMedia(slide.file, (p) =>
            setUpState({ index: i + 1, total, pct: Math.min(100, Math.max(0, Math.round(p))) }),
          );
          mediaUrls.push(url);
          if (!mediaType) mediaType = slide.isVideo ? 'video' : 'image';
        }
        setUpState(null);
      }

      const payload = {
        kind: effectiveKind,
        caption: effectiveKind === 'visual' ? caption : null,
        title: effectiveKind === 'forge' ? title : null,
        summary: effectiveKind === 'forge' ? summary : null,
        content_md: effectiveKind === 'forge' ? content : null,
        media_url: mediaUrls[0] || null,
        media_urls: mediaUrls,
        media_type: mediaType,
        location: location || null,
        tags,
      };

      if (composerGroupId) {
        await apiFetch<{ post: Post }>('/api/group-content', {
          method: 'POST',
          body: JSON.stringify({ group_id: composerGroupId, ...payload }),
        });
        queryClient.invalidateQueries({ queryKey: ['group-posts', composerGroupId] });
        pushToast('Posted to your circle');
      } else {
        await apiFetch<Post>('/api/posts', { method: 'POST', body: JSON.stringify(payload) });
        await queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['my-posts'] });
        pushToast(effectiveKind === 'forge' ? 'Your scroll now rests in the Forge' : 'Your moment now blooms in the Feed');
      }
      setUpState(null);
      resetAll();
      close();
    } catch (err) {
      pushToast((err as Error).message, 'error');
      setUpState(null);
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400';

  // one bar across the whole carousel: slides already sealed + this slide's share
  const overallPct = upState
    ? Math.min(100, ((upState.index - 1 + upState.pct / 100) / upState.total) * 100)
    : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[70] bg-neem-950/55 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed z-[75] inset-x-0 bottom-0 h-[92dvh] max-h-[92dvh] lg:inset-0 lg:bottom-auto lg:m-auto lg:h-auto lg:max-w-2xl lg:max-h-[88vh] glass-warm rounded-t-[28px] lg:rounded-[26px] overflow-hidden flex flex-col shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
          >
            {/* grab handle — mobile affordance */}
            <div className="lg:hidden pt-2.5 pb-1 grid place-items-center shrink-0">
              <span className="h-1.5 w-11 rounded-full bg-sand-400/70" />
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 lg:py-4 border-b border-sand-300/60 shrink-0 bg-gradient-to-b from-parchment/80 to-transparent">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-saffron-500/20 to-gold-400/15 ring-1 ring-gold-500/30 shrink-0">
                  <Feather size={16} className="text-saffron-600" />
                </span>
                <div className="min-w-0">
                  <p className="font-display font-semibold text-[17px] leading-tight text-neem-950 truncate">
                    {targetGroup ? `Post to ${targetGroup.name}` : 'Weave into the atelier'}
                  </p>
                  <p className="text-[11px] text-ink-500 leading-tight">
                    {targetGroup
                      ? targetGroup.kind === 'forge'
                        ? 'A lore scroll for this circle'
                        : 'A visual moment for this circle'
                      : 'Share a moment, or set a scroll in the Forge'}
                  </p>
                </div>
              </div>
              <button onClick={close} className="p-2 rounded-full text-ink-500 hover:bg-sand-200/70 transition-colors shrink-0" aria-label="Close composer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-4 no-scrollbar">
              {/* Kind selector — hidden when the group fixes the kind */}
              {!targetGroup && (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'visual', label: 'Visual Post', icon: ImagePlus, hint: 'image or video in the feed' },
                      { id: 'forge', label: 'Deep Lore', icon: Feather, hint: 'markdown · code · math' },
                    ] as const
                  ).map((k) => (
                    <button
                      key={k.id}
                      onClick={() => setKind(k.id)}
                      className={`relative rounded-2xl border p-3.5 text-left transition-colors ${
                        kind === k.id
                          ? 'border-saffron-500/70 bg-saffron-500/10'
                          : 'border-sand-300 hover:border-gold-500/50 bg-parchment/60'
                      }`}
                    >
                      <k.icon size={18} className={kind === k.id ? 'text-saffron-600' : 'text-ink-400'} />
                      <p className={`text-[13.5px] font-semibold mt-2 ${kind === k.id ? 'text-neem-900' : 'text-ink-700'}`}>{k.label}</p>
                      <p className="text-[10.5px] text-ink-500 mt-0.5">{k.hint}</p>
                    </button>
                  ))}
                </div>
              )}

              {effectiveKind === 'visual' ? (
                <>
                  {slides.length > 0 ? (
                    <div className="space-y-3">
                      {/* Active large preview */}
                      <div className="relative w-full rounded-2xl overflow-hidden bg-neem-950/20 border border-sand-300">
                        {activeSlide?.isVideo ? (
                          <video
                            key={activeSlide.id}
                            src={activeSlide.url}
                            className="w-full max-h-72 object-cover"
                            muted
                            autoPlay
                            loop
                            playsInline
                          />
                        ) : activeSlide ? (
                          <img src={activeSlide.url} alt="chosen media" className="w-full max-h-72 object-cover" />
                        ) : null}
                        <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-neem-950/70 text-parchment text-[11px] font-semibold tabular-nums backdrop-blur">
                          {activeIdx + 1} / {slides.length}
                        </span>
                      </div>

                      {/* Drag-orderable slide rail */}
                      <div>
                        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400 mb-1.5">
                          <GripHorizontal size={11} />
                          {slides.length > 1 ? 'Drag to set the order of the carousel' : `Add up to ${MAX_SLIDES} slides`}
                        </p>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                          <Reorder.Group
                            axis="x"
                            values={slides}
                            onReorder={setSlides}
                            as="ul"
                            className="flex items-center gap-2 list-none m-0 p-0"
                          >
                            {slides.map((slide, idx) => (
                              <Reorder.Item
                                key={slide.id}
                                value={slide}
                                as="li"
                                drag={slides.length > 1 ? 'x' : false}
                                onDragStart={() => {
                                  draggingRef.current = true;
                                }}
                                onDragEnd={() => {
                                  window.setTimeout(() => {
                                    draggingRef.current = false;
                                  }, 0);
                                }}
                                whileDrag={{ scale: 1.08, zIndex: 5, cursor: 'grabbing' }}
                                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                                onClick={() => {
                                  if (draggingRef.current) return;
                                  setActiveSlideId(slide.id);
                                }}
                                className={`relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors ${
                                  slides.length > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                } ${
                                  slide.id === activeSlideId
                                    ? 'border-gold-500 ring-2 ring-gold-400/40'
                                    : 'border-sand-300 hover:border-gold-400/70 opacity-80 hover:opacity-100'
                                }`}
                              >
                                {slide.isVideo ? (
                                  <>
                                    <video
                                      src={slide.url}
                                      className="w-full h-full object-cover pointer-events-none"
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                    <span className="absolute inset-0 grid place-items-center bg-neem-950/30 pointer-events-none">
                                      <Play size={14} className="text-parchment fill-parchment drop-shadow" strokeWidth={0} />
                                    </span>
                                  </>
                                ) : (
                                  <img src={slide.url} alt="" className="w-full h-full object-cover pointer-events-none" />
                                )}
                                <span className="absolute bottom-0.5 left-1 text-[9.5px] font-bold text-parchment tabular-nums drop-shadow pointer-events-none">
                                  {idx + 1}
                                </span>
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSlide(slide.id);
                                  }}
                                  className="absolute top-0.5 right-0.5 grid place-items-center w-4 h-4 rounded-full bg-neem-950/80 text-parchment hover:bg-terra-600 transition-colors"
                                  aria-label={`Remove slide ${idx + 1}`}
                                >
                                  <X size={10} />
                                </button>
                              </Reorder.Item>
                            ))}
                          </Reorder.Group>

                          {slides.length < MAX_SLIDES && (
                            <button
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-sand-300 hover:border-gold-500/80 text-ink-500 hover:text-gold-600 grid place-items-center transition-colors bg-parchment/40"
                              title={`Add slide (up to ${MAX_SLIDES})`}
                            >
                              <ImagePlus size={18} />
                              <span className="text-[9.5px] font-medium mt-0.5">Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full rounded-2xl border-2 border-dashed border-sand-300 hover:border-gold-500/60 p-8 grid place-items-center bg-parchment/50 transition-colors"
                    >
                      <span className="text-center">
                        <ImagePlus className="mx-auto text-sand-400" size={30} />
                        <span className="block text-sm font-medium text-ink-700 mt-2">
                          Choose photos or videos (up to {MAX_SLIDES} slides)
                        </span>
                        <span className="block text-[11px] text-ink-400 mt-1">
                          auto-compressed images · carousel enabled · videos up to ~50MB
                        </span>
                      </span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) pickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />

                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Caption</span>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      rows={3}
                      maxLength={2200}
                      placeholder="Tell the garden what this moment means…"
                      className={`${inputClass} resize-none`}
                    />
                  </label>
                  {aiBlock('caption')}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1">
                        <MapPin size={11} /> Location
                      </span>
                      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Varanasi" className={inputClass} maxLength={80} />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1">
                        <Hash size={11} /> Tags
                      </span>
                      <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="river, dawn, film" className={inputClass} />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={220} placeholder="The scroll's name…" className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Summary</span>
                    <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={400} placeholder="One breath that carries the whole scroll…" className={`${inputClass} resize-none`} />
                  </label>
                  {aiBlock('summary')}

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1.5">
                        <PenLine size={11} /> Manuscript — markdown, $math$ and code welcome
                      </span>
                      <button
                        onClick={() => setPreviewing((p) => !p)}
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-saffron-700 hover:text-saffron-600"
                      >
                        <Eye size={12} />
                        {previewing ? 'Back to ink' : 'Preview'}
                      </button>
                    </div>
                    {aiBlock('manuscript')}
                    {previewing ? (
                      <div className="mt-2 rounded-xl border border-sand-300 bg-parchment/85 px-4 py-3 max-h-72 overflow-y-auto">
                        {content.trim() ? (
                          <Suspense fallback={<Mandala className="w-12 h-12 mx-auto my-4 text-gold-500/70 animate-spin-slower" petals={12} />}>
                            <Markdown source={content} />
                          </Suspense>
                        ) : (
                          <p className="text-sm text-ink-400 italic">Nothing inked yet.</p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={10}
                        placeholder={'## The opening sutra\n\nWrite with **markdown**, math $$e^{i\\pi}+1=0$$ and fenced code…\n\n```python\nprint("namaste, world")\n```'}
                        className="mt-2 w-full rounded-xl border border-sand-300 bg-[#fdf9ef] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
                      />
                    )}
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1">
                      <Hash size={11} /> Tags
                    </span>
                    <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="ai, mathematics, poetry" className={inputClass} />
                  </label>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span key={t} className="text-[10.5px] font-medium uppercase tracking-wide text-neem-700 bg-neem-500/10 border border-neem-500/20 rounded-full px-2 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-sand-300/70 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-parchment/80 backdrop-blur">
              {/* Unified carousel upload progress — one bar across every slide */}
              <AnimatePresence initial={false}>
                {upState && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-3">
                      <div className="flex items-center justify-between text-[11px] font-medium text-ink-600 mb-1.5">
                        <span>
                          Uploading slide {upState.index} of {upState.total} ({upState.pct}%)…
                        </span>
                        <span className="tabular-nums text-ink-400">{Math.round(overallPct)}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-sand-300/70 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-saffron-500 to-gold-400"
                          animate={{ width: `${overallPct}%` }}
                          transition={{ type: 'spring', stiffness: 220, damping: 32 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={publish}
                disabled={!canPublish}
                className="w-full rounded-2xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3.5 shadow-[0_10px_24px_-10px_rgba(214,138,20,0.8)] disabled:opacity-40 disabled:shadow-none hover:brightness-105 transition-all inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy
                  ? upState
                    ? `Uploading slide ${upState.index} of ${upState.total} (${upState.pct}%)…`
                    : 'Weaving…'
                  : targetGroup
                    ? `Post to ${targetGroup.name}`
                    : effectiveKind === 'forge'
                      ? 'Set the scroll in the Forge'
                      : 'Release into the Feed'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
