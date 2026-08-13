import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Send, Bell, UsersRound } from 'lucide-react';
import BottomNav from './BottomNav';
import FeedView from '../feed/FeedView';
import ReelsView from '../reels/ReelsView';
import SearchView from '../search/SearchView';
import ProfileView from '../profile/ProfileView';
import UserProfileOverlay from '../profile/UserProfile';
import ReaderSheet from '../reader/ReaderSheet';
import Composer from '../composer/Composer';
import ThreadsScreen from '../threads/ThreadsScreen';
import ShareTray from '../threads/ShareTray';
import { LotusMark } from '../common/Mandala';
import { useUnreadThreadCount, useNotifications } from '../../hooks/queries';
import { useUI } from '../../store/ui';

export default function MobileShell() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const readerPostId = useUI((s) => s.readerPostId);
  const closeReader = useUI((s) => s.closeReader);
  const openThreads = useUI((s) => s.openThreads);
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  const openNotifications = useUI((s) => s.openNotifications);
  const openCirclesDrawer = useUI((s) => s.openCirclesDrawer);
  const unread = useUnreadThreadCount();
  const { data: notif } = useNotifications();
  const unreadNotif = notif?.unread ?? 0;

  return (
    <div className="flex flex-col overflow-hidden bg-parchment" style={{ height: 'var(--vvh, 100%)' }}>
      <header className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2 border-b border-sand-300/60 bg-parchment/95 backdrop-blur z-30">
        <button onClick={() => setTab('feed')} className="flex items-center gap-2">
          <span className="text-gold-600">
            <LotusMark className="w-7 h-7" />
          </span>
          <span className="font-display font-bold text-[19px] text-neem-900">
            Ayur<span className="text-saffron-600">Verse</span>
          </span>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={openCirclesDrawer}
            className="p-2 rounded-full text-ink-700 hover:bg-sand-200/70 transition-colors"
            aria-label="My Circles"
          >
            <UsersRound size={21} />
          </button>
          <button
            onClick={openNotifications}
            className="relative p-2 rounded-full text-ink-700 hover:bg-sand-200/70 transition-colors"
            aria-label="Whispers — notifications"
          >
            <Bell size={21} />
            {unreadNotif > 0 && (
              <span className="absolute top-0.5 right-0 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-terra-500 text-parchment text-[9px] font-bold ring-2 ring-parchment">
                {unreadNotif}
              </span>
            )}
          </button>
          <button
            onClick={openThreads}
            className="relative p-2 rounded-full text-ink-700 hover:bg-sand-200/70 transition-colors"
            aria-label="Golden Threads — messages"
          >
            <Send size={21} className="-rotate-12" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-terra-500 text-parchment text-[9px] font-bold ring-2 ring-parchment">
                {unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'feed' && <FeedView />}
            {tab === 'reels' && <ReelsView />}
            {tab === 'forge' && <FeedView kind="forge" />}
            {tab === 'search' && <SearchView />}
            {tab === 'threads' && <ThreadsScreen />}
            {tab === 'profile' && <ProfileView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      {/* floating create loom — smaller, and it politely leaves the stage on immersive tabs (Threads / Reels) so it never sits on the send button */}
      <AnimatePresence>
        {tab !== 'threads' && tab !== 'reels' && (
          <motion.button
            key="fab"
            initial={{ scale: 0, rotate: -45, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, rotate: 45, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 480, damping: 26 }}
            whileTap={{ scale: 0.82, rotate: 45 }}
            onClick={() => setComposerOpen(true)}
            aria-label="Create post"
            className="fixed z-40 right-3.5 bottom-[calc(76px+env(safe-area-inset-bottom))] grid place-items-center w-11 h-11 rounded-full text-parchment bg-gradient-to-br from-saffron-500 via-saffron-600 to-terra-500 shadow-[0_10px_24px_-8px_rgba(217,111,16,0.7)] ring-[3px] ring-parchment"
          >
            <Plus size={22} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {readerPostId !== null && (
          <ReaderSheet key={readerPostId} postId={readerPostId} onClose={closeReader} />
        )}
      </AnimatePresence>

      <UserProfileOverlay />
      <ShareTray />
      <Composer />
    </div>
  );
}
