import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, CheckCircle, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useUI } from '../../store/ui';
import Markdown from './Markdown';

interface VaidyaClinicalSealProps {
  postId: number;
  title: string;
  content: string;
}

export default function VaidyaClinicalSeal({ postId, title, content }: VaidyaClinicalSealProps) {
  const pushToast = useUI((s) => s.pushToast);
  const [sealText, setSealText] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`ayurverse_seal_${postId}`);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const summonSeal = async () => {
    if (!content && !title) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ text: string }>('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'vaidya_seal',
          title,
          text: content || title,
        }),
      });

      if (res?.text) {
        setSealText(res.text);
        try {
          localStorage.setItem(`ayurverse_seal_${postId}`, res.text);
        } catch {
          /* noop */
        }
        pushToast('Vaidya’s Clinical Seal has been stamped upon this scroll', 'gold');
      }
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-8">
      {!sealText ? (
        <div className="rounded-2xl border border-gold-500/30 bg-gradient-to-r from-gold-500/10 via-saffron-500/10 to-transparent p-5 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
              <Award size={15} className="text-gold-500" />
              <span>Sovereign Scholarly Verification</span>
            </div>
            <h5 className="font-display font-medium text-ink-900 dark:text-parchment text-sm sm:text-base mt-1">
              Summon Vaidya’s Canonical Clinical Seal
            </h5>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
              Analyze doshic compatibility, classical shlokas, and anupana vehicles.
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={summonSeal}
            disabled={loading}
            className="shrink-0 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 px-4 py-2.5 text-xs font-semibold text-parchment shadow-md hover:brightness-105 transition-all inline-flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>{loading ? 'Consulting the Canon…' : 'Summon Clinical Seal'}</span>
          </motion.button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative rounded-2xl border-2 border-gold-500/40 bg-gradient-to-b from-parchment/95 to-sand-100/90 dark:from-neem-950/90 dark:to-neem-900/80 p-5 sm:p-6 shadow-warm backdrop-blur-md overflow-hidden"
        >
          {/* Ornate corner stamps */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-gold-500/15 via-transparent to-transparent pointer-events-none" />
          <div className="absolute -top-3 -right-3 rotate-12 bg-gradient-to-r from-gold-500 to-saffron-600 text-neem-950 font-bold text-[9px] uppercase tracking-widest px-8 py-1 shadow-md">
            Canonical Seal
          </div>

          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={20} className="text-gold-500" />
            <span className="font-display font-semibold text-sm tracking-wide text-gold-700 dark:text-gold-400 uppercase">
              Authenticated Clinical Annotation
            </span>
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none text-ink-800 dark:text-sand-100 text-xs sm:text-sm leading-relaxed">
            <Markdown source={sealText} />
          </div>

          <div className="mt-4 pt-3 border-t border-gold-500/25 flex items-center justify-between text-[11px] text-ink-500 dark:text-ink-400 font-serif">
            <span className="flex items-center gap-1 text-gold-600 dark:text-gold-400 font-medium">
              <CheckCircle size={13} />
              Inscribed into AyurVerse Sovereign Ledger
            </span>
            <button
              onClick={() => {
                localStorage.removeItem(`ayurverse_seal_${postId}`);
                setSealText(null);
              }}
              className="text-ink-400 hover:text-ink-600 transition-colors text-[10px]"
            >
              Regenerate Seal
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
