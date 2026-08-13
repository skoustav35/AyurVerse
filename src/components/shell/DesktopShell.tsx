import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import SuggestedRail from './SuggestedRail';
import FeedView from '../feed/FeedView';
import ReelsView from '../reels/ReelsView';
import SearchView from '../search/SearchView';
import ProfileView from '../profile/ProfileView';
import UserProfileOverlay from '../profile/UserProfile';
import ReaderPane from '../reader/ReaderPane';
import ThreadsScreen from '../threads/ThreadsScreen';
import ShareTray from '../threads/ShareTray';
import Composer from '../composer/Composer';
import Mandala from '../common/Mandala';
import AiChat from '../ai/AiChat';
import { useUI } from '../../store/ui';

export default function DesktopShell() {
  const tab = useUI((s) => s.tab);
  const readerPostId = useUI((s) => s.readerPostId);

  return (
    <div className="h-screen w-full flex overflow-hidden relative">
      {/* Ambient parallax mandalas — desktop only */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        <Mandala className="absolute -left-48 -top-48 w-[620px] h-[620px] text-gold-500/[0.13] animate-spin-slower" />
        <Mandala className="absolute -right-56 top-1/3 w-[700px] h-[700px] text-neem-600/[0.1] animate-spin-rev" petals={20} />
      </div>

      <Sidebar />

      {/* Center pane — independent scroll so opening the reader never loses position */}
      <main className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto relative z-10" id="center-scroll">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="pt-4"
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

      {/* Right pane — reading pane expands over the rail, feed scroll untouched (hidden during threads) */}
      <motion.aside
        animate={{
          width: tab === 'threads' ? 0 : readerPostId !== null ? 520 : tab === 'profile' ? 428 : 372,
          opacity: tab === 'threads' ? 0 : 1,
        }}
        transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        className="hidden lg:block h-full shrink-0 border-l border-sand-300/70 bg-parchment-deep/50 backdrop-blur-sm relative z-10 overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {readerPostId !== null ? (
            <motion.div
              key={`reader-${readerPostId}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="h-full"
            >
              <ReaderPane postId={readerPostId} />
            </motion.div>
          ) : tab === 'profile' ? (
            <motion.div
              key="vaidya"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="h-full"
            >
              <AiChat />
            </motion.div>
          ) : (
            <motion.div
              key="rail"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.22 }}
              className="h-full"
            >
              <SuggestedRail />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>

      <UserProfileOverlay />
      <ShareTray />
      <Composer />
    </div>
  );
}
