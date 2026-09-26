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
import { ease, tabFade } from '../../lib/motion';

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
      <Sidebar />

      {/* Center pane — independent scroll so opening the reader never loses position */}
      <main className="flex-1 min-w-0 min-h-0 h-full overflow-y-auto no-scrollbar relative z-10" id="center-scroll">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={tabFade}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.32, ease: ease.appleCurve }}
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
        className="hidden lg:block h-full shrink-0 border-l border-gold-500/20 bg-black/40 backdrop-blur-2xl relative z-10 overflow-hidden shadow-[-10px_0_35px_-10px_rgba(0,0,0,0.8)]"
      >
        <AnimatePresence mode="wait">
          {readerPostId !== null ? (
            <motion.div
              key={`reader-${readerPostId}`}
              initial={{ opacity: 0, x: 40, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 24, filter: 'blur(4px)' }}
              transition={{ duration: 0.32, ease: ease.appleCurve }}
              className="h-full"
            >
              <ReaderPane postId={readerPostId} />
            </motion.div>
          ) : tab === 'profile' ? (
            <motion.div
              key="vaidya"
              initial={{ opacity: 0, x: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 40, filter: 'blur(4px)' }}
              transition={{ duration: 0.32, ease: ease.appleCurve }}
              className="h-full"
            >
              <Suspense fallback={<ViewFallback />}>
                <AiChat />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="rail"
              initial={{ opacity: 0, x: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 40, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: ease.appleCurve }}
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
        className="fixed bottom-6 right-6 z-[64] grid place-items-center w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#1b3d29] via-[#102419] to-[#0a1710] shadow-[0_14px_36px_-10px_rgba(0,0,0,0.85)] ring-2 ring-gold-500/60 text-gold-400 hover:shadow-[0_0_24px_rgba(224,170,31,0.35)] transition-all"
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
            transition={{ type: 'spring', stiffness: 300, damping: 34, mass: 0.9 }}
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
