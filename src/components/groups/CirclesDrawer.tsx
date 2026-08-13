import { AnimatePresence, motion } from 'framer-motion';
import { X, UsersRound, Compass, Plus } from 'lucide-react';
import MyCirclesList from './MyCirclesList';
import { useUI } from '../../store/ui';

export default function CirclesDrawer() {
  const open = useUI((s) => s.circlesDrawerOpen);
  const close = useUI((s) => s.closeCirclesDrawer);
  const setTab = useUI((s) => s.setTab);
  const openCreateGroup = useUI((s) => s.openCreateGroup);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="lg:hidden fixed inset-0 z-[80] bg-neem-950/55 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="lg:hidden fixed inset-x-0 bottom-0 z-[85] max-h-[82dvh] flex flex-col bg-parchment rounded-t-[26px] overflow-hidden shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
          >
            <div className="shrink-0 pt-2.5 pb-1 grid place-items-center">
              <span className="h-1.5 w-11 rounded-full bg-sand-400/70" />
            </div>
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-sand-300/70">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-saffron-500/20 to-gold-400/15 ring-1 ring-gold-500/30">
                  <UsersRound size={16} className="text-saffron-600" />
                </span>
                <p className="font-display font-semibold text-[16px] text-neem-950">My Circles</p>
              </div>
              <button onClick={close} className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
              <MyCirclesList />
            </div>

            <div className="shrink-0 border-t border-sand-300/70 px-4 pt-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] bg-parchment/80 backdrop-blur flex items-center gap-2.5">
              <button
                onClick={() => {
                  close();
                  setTab('search');
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-sand-300 py-2.5 text-[13px] font-semibold text-ink-700 hover:bg-sand-200/60"
              >
                <Compass size={15} /> Discover circles
              </button>
              <button
                onClick={() => {
                  close();
                  openCreateGroup('feed');
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-[13px] py-2.5 hover:brightness-105"
              >
                <Plus size={15} /> Found a circle
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
