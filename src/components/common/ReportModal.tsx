import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Flag, Loader2, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useUI } from '../../store/ui';

interface ReportModalProps {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
}

const REASONS = [
  { id: 'spam', label: 'Spam, bot traffic, or excessive solicitation' },
  { id: 'harmful', label: 'Harassment, hate speech, or harmful conduct' },
  { id: 'inappropriate', label: 'Inappropriate or sexually graphic imagery' },
  { id: 'misleading', label: 'Misleading ayurvedic or medical claims' },
  { id: 'copyright', label: 'Intellectual property or copyright infringement' },
  { id: 'other', label: 'Other disturbance to the garden' },
];

export default function ReportModal({ postId, isOpen, onClose }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState(REASONS[0].id);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const pushToast = useUI((s) => s.pushToast);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          post_id: postId,
          reason: selectedReason,
          details: details.trim() || undefined,
        }),
      });
      pushToast('Reported. The gardeners will review this scroll.', 'neem');
      onClose();
    } catch (err) {
      pushToast((err as Error).message || 'Failed to submit report', 'error');
    } finally {
      setBusy(false);
    }
  };

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
          className="relative w-full max-w-md bg-parchment rounded-3xl shadow-2xl border border-sand-300/80 overflow-hidden z-10 flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3.5 border-b border-sand-300/70 bg-parchment/90">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-terra-500/15 text-terra-600">
                <Flag size={16} />
              </span>
              <div>
                <h3 className="font-display font-semibold text-lg text-neem-950">Report to Gardeners</h3>
                <p className="text-[11px] text-ink-500">Help protect the peace of the atelier</p>
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

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            <p className="text-[13px] text-ink-700 font-medium">Why are you reporting this scroll?</p>

            <div className="space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-[13px] cursor-pointer transition-all ${
                    selectedReason === r.id
                      ? 'border-saffron-600/60 bg-saffron-500/10 text-neem-950 font-medium'
                      : 'border-sand-300/80 hover:bg-sand-100/60 text-ink-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={r.id}
                    checked={selectedReason === r.id}
                    onChange={() => setSelectedReason(r.id)}
                    className="mt-0.5 text-saffron-600 focus:ring-saffron-500"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1">
                Additional context (optional)
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Share any details that help the gardeners understand the context…"
                maxLength={500}
                className="w-full rounded-xl border border-sand-300 bg-parchment/90 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 resize-none transition-all"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-sand-200/60 transition-colors"
              >
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-terra-600 px-6 py-2.5 text-sm font-semibold text-parchment hover:bg-terra-700 transition-all disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? 'Submitting…' : 'Submit report'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
