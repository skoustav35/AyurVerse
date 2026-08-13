import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, UserPlus, MessageCircle, Send, Bell, X, CheckCheck, AtSign, UsersRound } from 'lucide-react';
import Avatar from '../common/Avatar';
import { timeAgo } from '../../lib/format';
import { useNotifications, useMarkNotificationsRead, type Notification } from '../../hooks/queries';
import { useUI } from '../../store/ui';
import Mandala from '../common/Mandala';

const META: Record<string, { icon: typeof Heart; tint: string; verb: string }> = {
  like: { icon: Heart, tint: 'text-terra-500 bg-terra-500/15', verb: 'appreciated your post' },
  follow: { icon: UserPlus, tint: 'text-neem-700 bg-neem-500/15', verb: 'started following you' },
  comment: { icon: MessageCircle, tint: 'text-saffron-600 bg-saffron-500/15', verb: 'reflected on your post' },
  message: { icon: Send, tint: 'text-gold-600 bg-gold-500/15', verb: 'sent you a message' },
  mention: { icon: AtSign, tint: 'text-neem-700 bg-neem-500/15', verb: 'mentioned you' },
  group_join: { icon: UsersRound, tint: 'text-neem-700 bg-neem-500/15', verb: 'joined your circle' },
};

function Row({ n, onGo }: { n: Notification; onGo: (n: Notification) => void }) {
  const m = META[n.type] ?? META.like;
  const Icon = m.icon;
  return (
    <motion.button
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onGo(n)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-sand-200/50 ${
        n.read ? '' : 'bg-saffron-500/[0.06]'
      }`}
    >
      <div className="relative shrink-0">
        <Avatar url={n.actor_avatar} name={n.actor_name || 'weaver'} size={40} />
        <span className={`absolute -bottom-1 -right-1 grid place-items-center w-5 h-5 rounded-full ring-2 ring-parchment ${m.tint}`}>
          <Icon size={11} className={n.type === 'like' ? 'fill-current' : ''} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink-800 leading-snug">
          <span className="font-semibold text-neem-950">@{n.actor_username || 'weaver'}</span>{' '}
          <span className="text-ink-600">{m.verb}</span>
        </p>
        {n.preview && <p className="text-[12px] text-ink-500 mt-0.5 line-clamp-1 italic">“{n.preview}”</p>}
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-400 mt-1">{timeAgo(n.created_at)}</p>
      </div>
      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-saffron-500 shrink-0" />}
    </motion.button>
  );
}

export default function NotificationsPanel() {
  const open = useUI((s) => s.notificationsOpen);
  const close = useUI((s) => s.closeNotifications);
  const openReader = useUI((s) => s.openReader);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const openThread = useUI((s) => s.openThread);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  // when the panel opens, mark everything read after a beat
  useEffect(() => {
    if (open && unread > 0) {
      const t = window.setTimeout(() => markRead.mutate(undefined), 900);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.type === 'message' && n.conversation_id) openThread(n.conversation_id);
    else if (n.post_id) openReader(n.post_id);
    else if (n.actor_id) openUserProfile(n.actor_id);
    close();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[85] bg-neem-950/50 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed z-[90] top-0 right-0 h-full w-full sm:w-[420px] bg-parchment shadow-[-20px_0_60px_-20px_rgba(12,27,19,0.5)] flex flex-col"
          >
            <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-sand-300/70 bg-gradient-to-b from-parchment/90 to-transparent">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-saffron-500/20 to-gold-400/15 ring-1 ring-gold-500/30">
                  <Bell size={16} className="text-saffron-600" />
                </span>
                <div>
                  <p className="font-display font-semibold text-[16px] text-neem-950 leading-tight">Whispers</p>
                  <p className="text-[10.5px] text-ink-500 leading-tight">{unread > 0 ? `${unread} new` : 'all caught up'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={() => markRead.mutate(undefined)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-neem-700 hover:bg-sand-200/70 transition-colors"
                  >
                    <CheckCheck size={13} /> Mark all
                  </button>
                )}
                <button onClick={close} className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-sand-200/70">
              {items.length === 0 ? (
                <div className="relative h-full grid place-items-center text-center px-8">
                  <Mandala className="absolute inset-0 m-auto w-52 h-52 text-gold-500/10 animate-spin-slower pointer-events-none" />
                  <div className="relative">
                    <Bell size={30} className="mx-auto text-sand-400" />
                    <p className="font-display italic text-ink-600 mt-3">The garden is quiet for now.</p>
                    <p className="text-[12px] text-ink-400 mt-1">Likes, follows, comments and messages will bloom here.</p>
                  </div>
                </div>
              ) : (
                items.map((n) => <Row key={n.id} n={n} onGo={go} />)
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
