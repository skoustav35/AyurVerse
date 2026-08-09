import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Feather, Hash, ImagePlus, Loader2, MapPin, PenLine, Sparkles, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Mandala from '../common/Mandala';

const Markdown = lazy(() => import('../reader/Markdown'));
import { apiFetch } from '../../lib/api';
import { uploadMedia } from '../../lib/upload';
import type { Post } from '../../lib/types';
import { useUI } from '../../store/ui';

export default function Composer() {
  const open = useUI((s) => s.composerOpen);
  const close = () => useUI.getState().setComposerOpen(false);
  const pushToast = useUI((s) => s.pushToast);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<'visual' | 'forge'>('visual');
  const [busy, setBusy] = useState(false);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [tagText, setTagText] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setFile(null);
    setPreview(null);
    setCaption('');
    setLocation('');
    setTagText('');
    setTitle('');
    setSummary('');
    setContent('');
    setPreviewing(false);
  };

  const pickFile = (f: File) => {
    const videoTooHeavy = f.type.startsWith('video/') && f.size > 48 * 1024 * 1024;
    const genericTooHeavy = f.size > 60 * 1024 * 1024;
    if (videoTooHeavy || genericTooHeavy) {
      pushToast(
        f.type.startsWith('video/')
          ? 'Videos over ~50MB are too heavy for the loom — trim or export at 1080p'
          : 'Media must be under 60MB',
        'error',
      );
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const canPublish =
    !busy &&
    (kind === 'visual'
      ? !!file && !!caption.trim()
      : !!title.trim() && content.trim().length > 20);

  const publish = async () => {
    setBusy(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType: 'image' | 'video' | null = null;

      if (kind === 'visual' && file) {
        setUpPct(0);
        mediaUrl = await uploadMedia(file, (p) => setUpPct(p));
        mediaType = file.type.startsWith('video') ? 'video' : 'image';
        setUpPct(null);
      }

      await apiFetch<Post>('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          caption: kind === 'visual' ? caption : null,
          title: kind === 'forge' ? title : null,
          summary: kind === 'forge' ? summary : null,
          content_md: kind === 'forge' ? content : null,
          media_url: mediaUrl,
          media_type: mediaType,
          location: location || null,
          tags,
        }),
      });

      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      pushToast(kind === 'forge' ? 'Your scroll now rests in the Forge' : 'Your moment now blooms in the Feed');
      setUpPct(null);
      resetAll();
      close();
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400';

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
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed z-[75] inset-x-0 bottom-0 lg:inset-0 lg:m-auto lg:max-w-2xl lg:h-fit lg:max-h-[88vh] glass-warm rounded-t-[26px] lg:rounded-[26px] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-sand-300/70 shrink-0">
              <p className="font-display font-semibold text-lg text-neem-950">Weave into the atelier</p>
              <button onClick={close} className="p-2 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close composer">
                <X size={17} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 space-y-4">
              {/* Kind selector */}
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

              {kind === 'visual' ? (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className={`w-full rounded-2xl border-2 border-dashed transition-colors overflow-hidden ${
                      preview ? 'border-transparent p-0' : 'border-sand-300 hover:border-gold-500/60 p-8'
                    } grid place-items-center bg-parchment/50`}
                  >
                    {preview ? (
                      file?.type.startsWith('video') ? (
                        <video src={preview} className="w-full max-h-72 object-cover" muted autoPlay loop playsInline />
                      ) : (
                        <img src={preview} alt="chosen media" className="w-full max-h-72 object-cover" />
                      )
                    ) : (
                      <span className="text-center">
                        <ImagePlus className="mx-auto text-sand-400" size={30} />
                        <span className="block text-sm font-medium text-ink-700 mt-2">Choose an image or video</span>
                        <span className="block text-[11px] text-ink-400 mt-1">photos are auto-compressed · videos up to ~50MB</span>
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
                      if (f) pickFile(f);
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

            <div className="shrink-0 border-t border-sand-300/70 px-5 py-4 bg-parchment/70 backdrop-blur">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={publish}
                disabled={!canPublish}
                className="w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3 disabled:opacity-40 hover:brightness-105 transition-all inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy
                  ? upPct !== null
                    ? `Sealing the frame… ${upPct}%`
                    : 'Weaving…'
                  : kind === 'forge'
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
