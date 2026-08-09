import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import ReaderBody from './ReaderBody';
import { useUI } from '../../store/ui';

export default function ReaderPane({ postId }: { postId: number }) {
  const closeReader = useUI((s) => s.closeReader);

  return (
    <div className="h-full flex flex-col bg-parchment">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sand-300/70 shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-saffron-700">Reading Pane</p>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={closeReader}
          className="p-1.5 rounded-full text-ink-600 hover:bg-sand-200/70 hover:text-ink-900 transition-colors"
          aria-label="Close reading pane"
        >
          <X size={17} />
        </motion.button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ReaderBody postId={postId} />
      </div>
    </div>
  );
}
