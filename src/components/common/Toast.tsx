import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Sparkles } from 'lucide-react';
import { useUI } from '../../store/ui';

export default function ToastHost() {
  const toasts = useUI((s) => s.toasts);

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-10 z-[90] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-warm border backdrop-blur-md ${
              t.tone === 'error'
                ? 'bg-terra-600/95 text-parchment border-terra-400/60'
                : t.tone === 'neem'
                  ? 'bg-neem-800/95 text-sand-100 border-neem-600/60'
                  : 'bg-ink-900/92 text-gold-300 border-gold-500/40'
            }`}
          >
            {t.tone === 'error' ? (
              <AlertCircle size={16} className="shrink-0" />
            ) : t.tone === 'neem' ? (
              <Check size={16} className="shrink-0 text-gold-400" />
            ) : (
              <Sparkles size={16} className="shrink-0 text-gold-400" />
            )}
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
