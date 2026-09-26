import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { usePostPlaylist } from '../../hooks/queries';
import { useUI } from '../../store/ui';

interface CourseSequenceDrawerProps {
  postId: number;
}

export default function CourseSequenceDrawer({ postId }: CourseSequenceDrawerProps) {
  const { data, isLoading } = usePostPlaylist(postId);
  const openReader = useUI((s) => s.openReader);
  const [expanded, setExpanded] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<Set<number>>(new Set());

  // Load completed lessons from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ayurverse_completed_lessons');
      if (stored) {
        setCompletedLessons(new Set(JSON.parse(stored)));
      }
    } catch {
      /* noop */
    }
  }, []);

  const toggleLessonComplete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setCompletedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('ayurverse_completed_lessons', JSON.stringify(Array.from(next)));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  if (isLoading || !data?.playlist) return null;

  const playlist = data.playlist;
  const items = playlist.items || [];
  const currentIndex = playlist.current_index ?? items.findIndex((i) => i.id === postId);
  const nextItem = currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null;

  const completedCount = items.filter((i) => completedLessons.has(i.id)).length;
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  return (
    <div className="my-5 rounded-2xl border border-gold-500/30 bg-gradient-to-br from-sand-100/90 to-parchment/90 dark:from-neem-950/80 dark:to-neem-900/60 p-4 shadow-sm backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between gap-3 cursor-pointer group"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-saffron-600 dark:text-gold-400 mb-1">
            <Sparkles size={11} className="text-gold-500" />
            <span>Sanctum Sequence · {playlist.category}</span>
          </div>
          <h4 className="font-display font-semibold text-sm sm:text-base text-ink-900 dark:text-parchment leading-snug truncate group-hover:text-gold-600 dark:group-hover:text-gold-300 transition-colors">
            {playlist.title}
          </h4>
          <p className="text-[11.5px] text-ink-500 dark:text-ink-400 mt-0.5">
            Lesson {currentIndex >= 0 ? currentIndex + 1 : 1} of {items.length} · {completedCount} completed ({progressPct}%)
          </p>
        </div>

        <button
          className="p-1.5 rounded-full text-ink-500 dark:text-ink-400 group-hover:bg-sand-200/60 dark:group-hover:bg-sand-800/60 transition-colors"
          aria-label={expanded ? 'Collapse course outline' : 'Expand course outline'}
        >
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown size={18} />
          </motion.div>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-1.5 w-full bg-sand-200 dark:bg-sand-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-saffron-500 to-gold-400"
        />
      </div>

      {/* Collapsible Outline */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-3 border-t border-sand-200 dark:border-sand-800 space-y-2 overflow-hidden"
          >
            {playlist.description && (
              <p className="text-xs text-ink-600 dark:text-ink-300 italic mb-3 font-serif">
                "{playlist.description}"
              </p>
            )}

            <div className="space-y-1.5">
              {items.map((item, idx) => {
                const isCurrent = item.id === postId;
                const isDone = completedLessons.has(item.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!isCurrent) openReader(item.id);
                    }}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isCurrent
                        ? 'border-gold-500/60 bg-gold-500/10 dark:bg-gold-500/15 shadow-xs'
                        : 'border-transparent hover:border-sand-300/60 dark:hover:border-sand-800/60 hover:bg-sand-200/40 dark:hover:bg-sand-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        onClick={(e) => toggleLessonComplete(e, item.id)}
                        className="text-ink-400 hover:text-gold-500 transition-colors shrink-0"
                        title={isDone ? 'Mark uncompleted' : 'Mark completed'}
                      >
                        <CheckCircle
                          size={16}
                          className={isDone ? 'text-gold-500 fill-gold-500/20' : 'text-sand-400 dark:text-sand-600'}
                        />
                      </button>

                      <span className="font-mono text-xs text-ink-400 shrink-0">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>

                      <div className="min-w-0">
                        <p
                          className={`text-xs font-medium truncate ${
                            isCurrent
                              ? 'text-gold-700 dark:text-gold-300 font-bold'
                              : 'text-ink-800 dark:text-ink-200'
                          }`}
                        >
                          {item.title || item.caption || `Lesson ${idx + 1}`}
                        </p>
                        <p className="text-[10px] text-ink-400">
                          {item.media_type === 'video' ? 'Video masterclass' : `${item.read_minutes || 3} min read`}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {isCurrent ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400 bg-gold-400/20 px-2 py-0.5 rounded-full">
                          Playing
                        </span>
                      ) : (
                        <ChevronRight size={14} className="text-ink-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next Up Quick Button */}
      {nextItem && !expanded && (
        <div className="mt-3 pt-2.5 border-t border-sand-200/60 dark:border-sand-800/60 flex items-center justify-between text-xs">
          <span className="text-[11px] text-ink-500 dark:text-ink-400">Next lesson:</span>
          <button
            onClick={() => openReader(nextItem.id)}
            className="flex items-center gap-1 font-semibold text-gold-600 dark:text-gold-400 hover:underline truncate max-w-[240px]"
          >
            <span className="truncate">{nextItem.title || nextItem.caption || 'Next in sequence'}</span>
            <ChevronRight size={14} className="shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
