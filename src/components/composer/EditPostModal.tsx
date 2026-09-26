import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, MapPin, PencilLine, Tag, X } from 'lucide-react';
import { useEditPost } from '../../hooks/queries';
import { useUI } from '../../store/ui';
import type { Post } from '../../lib/types';

interface EditPostModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditPostModal({ post, isOpen, onClose }: EditPostModalProps) {
  const [caption, setCaption] = useState(post.caption || '');
  const [title, setTitle] = useState(post.title || '');
  const [summary, setSummary] = useState(post.summary || '');
  const [location, setLocation] = useState(post.location || '');
  const [tagText, setTagText] = useState((post.tags || []).join(', '));
  const editPost = useEditPost();
  const pushToast = useUI((s) => s.pushToast);

  if (!isOpen) return null;

  const isForge = post.kind === 'forge';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagText
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 8);

    try {
      await editPost.mutateAsync({
        id: post.id,
        caption: isForge ? undefined : caption.trim(),
        title: isForge ? title.trim() : undefined,
        summary: isForge ? summary.trim() : undefined,
        location: location.trim() || null,
        tags,
      });
      onClose();
    } catch {
      // toast already handled by hook
    }
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-sand-300 bg-parchment/90 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 transition-all';

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
          className="relative w-full max-w-lg bg-parchment rounded-3xl shadow-2xl border border-sand-300/80 overflow-hidden z-10 flex flex-col max-h-[88vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3.5 border-b border-sand-300/70 bg-parchment/90">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-saffron-500/15 text-saffron-700">
                <PencilLine size={16} />
              </span>
              <div>
                <h3 className="font-display font-semibold text-lg text-neem-950">
                  {isForge ? 'Re-ink your scroll' : 'Edit your post'}
                </h3>
                <p className="text-[11px] text-ink-500">Refine the words and signals</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-ink-400 hover:text-ink-700 hover:bg-sand-200/60 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
            {isForge ? (
              <>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                    Scroll Title
                  </span>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={220}
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                    Summary
                  </span>
                  <textarea
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    maxLength={400}
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                  Caption
                </span>
                <textarea
                  rows={4}
                  required
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2200}
                  className={`${inputClass} resize-none`}
                />
              </label>
            )}

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 flex items-center gap-1">
                <MapPin size={11} /> Location
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Where in the garden? (e.g. Kerala, Varanasi, Cloud Atelier)"
                maxLength={120}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 flex items-center gap-1">
                <Tag size={11} /> Tags (comma separated)
              </span>
              <input
                type="text"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="ayurveda, dosha, herbalism, meditation"
                className={inputClass}
              />
            </label>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={editPost.isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-sand-200/60 transition-colors"
              >
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={editPost.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 px-6 py-2.5 text-sm font-semibold text-parchment hover:brightness-105 transition-all disabled:opacity-50"
              >
                {editPost.isPending && <Loader2 size={14} className="animate-spin" />}
                {editPost.isPending ? 'Saving…' : 'Save changes'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
