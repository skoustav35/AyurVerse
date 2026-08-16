import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import Sidebar from './Sidebar';
import SuggestedRail from './SuggestedRail';
import FeedView from '../feed/FeedView';
import UserProfileOverlay from '../profile/UserProfile';
import ReaderPane from '../reader/ReaderPane';
import ShareTray from '../threads/ShareTray';
import Composer from '../composer/Composer';
import Mandala, { LotusMark } from '../common/Mandala';
import { useUI } from '../../store/ui';

// heavy, non-default tabs stream in on demand — the wave a weaver pays at first
// paint is only ever feed+shell
const ReelsView = lazy(() => import('../reels/ReelsView'));
const SearchView = lazy(() => import('../search/SearchView'));
const ThreadsScreen = lazy(() => import('../threads/ThreadsScreen'));
const ProfileView = lazy(() => import('../profile/ProfileView'));
const AiChat = lazy(() => import('../ai/AiChat'));

function ViewFallback() {
  return (
    <div className="grid place-items-center py-24">
      <div className="text-gold-500 animate-pulse">
        <LotusMark className="w-9 h-9" />
      </div>
    </div>
  );
}

export default function DesktopShell() {
  const tab = useUI((s) => s.tab);
  const readerPostId = useUI((s) => s.readerPostId);
  const vaidyaOpen = useUI((s) => s.vaidyaOpen);
  const toggleVaidya = useUI((s) => s.toggleVaidya);

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
            {tab === 'reels' && (
              <Suspense fallback={<ViewFallback />}>
                <ReelsView />
              </Suspense>
            )}
            {tab === 'forge' && <FeedView kind="forge" />}
            {tab === 'search' && (
              <Suspense fallback={<ViewFallback />}>
                <SearchView />
              </Suspense>
            )}
            {tab === 'threads' && (
              <Suspense fallback={<ViewFallback />}>
                <ThreadsScreen />
              </Suspense>
            )}
            {tab === 'profile' && (
              <Suspense fallback={<ViewFallback />}>
                <ProfileView />
              </Suspense>
            )}
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
              <Suspense fallback={<ViewFallback />}>
                <AiChat />
              </Suspense>
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

      {/* Vaidya — summonable from any tab: a sage in a golden pause */}
      <motion.button
        onClick={toggleVaidya}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05, rotate: -4 }}
        className="fixed bottom-6 right-6 z-[64] grid place-items-center w-[52px] h-[52px] rounded-full bg-gradient-to-br from-neem-800 to-neem-950 shadow-[0_14px_36px_-10px_rgba(18,41,28,0.65)] ring-2 ring-gold-500/50"
        aria-label="Ask Vaidya"
        title="Ask Vaidya"
      >
        <Sparkles size={20} className="text-gold-400" />
        <span className="absolute inset-0 rounded-full border border-gold-400/40 animate-ping-slow" />
      </motion.button>
      <AnimatePresence>
        {vaidyaOpen && (
          <motion.aside
            key="vaidya-pane"
            initial={{ x: 480, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 480, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
            className="fixed right-0 top-0 z-[63] h-full w-[460px] max-w-full border-l border-sand-300 bg-parchment shadow-[-24px_0_60px_-24px_rgba(23,42,31,0.45)]"
          >
            <Suspense fallback={<ViewFallback />}>
              <AiChat onClose={toggleVaidya} />
            </Suspense>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
