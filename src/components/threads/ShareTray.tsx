import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerUpRight, Link2, Send, X } from 'lucide-react';
import Avatar from '../common/Avatar';
import { apiFetch } from '../../lib/api';
import { useThreads } from '../../hooks/queries';
import { useUI } from '../../store/ui';

/** Instagram "Send to…" — share a post directly into any golden thread. */
export default function ShareTray() {
  const sharePostId = useUI((s) => s.sharePostId);
  const closeShare = useUI((s) => s.closeShare);
  const openThreads = useUI((s) => s.openThreads);
  const pushToast = useUI((s) => s.pushToast);
  const { data: threads } = useThreads(sharePostId !== null);
  const [sentTo, setSentTo] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState<number | null>(null);

  const sendTo = async (threadId: number) => {
    if (!sharePostId || sentTo.has(threadId)) return;
    setSending(threadId);
    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: threadId, type: 'post', post_id: sharePostId }),
      });
      setSentTo((s) => new Set(s).add(threadId));
      pushToast('Scroll sent flying through the thread');
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setSending(null);
    }
  };

  const copyLink = async () => {
    if (!sharePostId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?post=${sharePostId}`);
      pushToast('A golden thread was copied — link ready');
      closeShare();
    } catch {
      pushToast('Could not copy the link', 'error');
    }
  };

  const close = () => {
    setSentTo(new Set());
    closeShare();
  };

  return (
    <AnimatePresence>
      {sharePostId !== null && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[82] bg-neem-950/55 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed z-[84] inset-x-0 bottom-0 lg:inset-0 lg:m-auto lg:max-w-md lg:h-fit card-warm !rounded-t-[26px] lg:!rounded-[26px] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sand-300/70">
              <h3 className="font-display font-semibold text-lg text-neem-950 flex items-center gap-2">
                <CornerUpRight size={17} className="text-saffron-600" />
                Send to a thread
              </h3>
              <button onClick={close} className="p-2 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close share">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[46vh] overflow-y-auto p-3">
              {(threads ?? []).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-ink-500 italic font-display">No threads yet — begin one, then send.</p>
                  <button
                    onClick={() => {
                      close();
                      openThreads();
                    }}
                    className="mt-3 rounded-full bg-saffron-600 text-parchment text-[12.5px] font-semibold px-5 py-2 hover:bg-saffron-700 transition-colors"
                  >
                    Open Golden Threads
                  </button>
                </div>
              ) : (
                (threads ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-sand-200/50 transition-colors">
                    <Avatar url={t.avatar_url} name={t.title} size={42} />
                    <p className="flex-1 min-w-0 text-[13.5px] font-semibold text-ink-900 truncate">{t.title}</p>
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      onClick={() => sendTo(t.id)}
                      disabled={sentTo.has(t.id) || sending === t.id}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold transition-colors ${
                        sentTo.has(t.id)
                          ? 'bg-neem-500/15 border border-neem-600/40 text-neem-800'
                          : 'bg-saffron-600 text-parchment hover:bg-saffron-700'
                      }`}
                    >
                      <Send size={12} className="-rotate-12" />
                      {sentTo.has(t.id) ? 'Sent' : sending === t.id ? 'Sending…' : 'Send'}
                    </motion.button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-sand-300/70 p-3">
              <button
                onClick={copyLink}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-sand-300 py-2.5 text-[13px] font-semibold text-ink-700 hover:bg-sand-200/60 transition-colors"
              >
                <Link2 size={14} />
                Copy link instead
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

