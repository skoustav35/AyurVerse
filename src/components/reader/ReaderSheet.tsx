import { useEffect } from 'react';
import { motion, useDragControls, useMotionValue, useTransform, animate } from 'framer-motion';
import ReaderBody from './ReaderBody';
import { useUI } from '../../store/ui';

export default function ReaderSheet({ postId, onClose }: { postId: number; onClose: () => void }) {
  const y = useMotionValue(0);
  const controls = useDragControls();
  const backdrop = useTransform(y, [0, 600], [0.55, 0]);
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  void setComposerOpen;

  useEffect(() => {
    animate(y, 0, { type: 'spring', stiffness: 320, damping: 32 });
  }, [y, postId]);

  const dismiss = () => {
    animate(y, window.innerHeight, { type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }).then(onClose);
  };

  return (
    <>
      <motion.div
        style={{ opacity: backdrop }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.55 }}
        exit={{ opacity: 0 }}
        onClick={dismiss}
        className="fixed inset-0 z-[60] bg-neem-950"
      />
      <motion.div
        style={{ y }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.12}
        onDragEnd={(_e, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) dismiss();
          else animate(y, 0, { type: 'spring', stiffness: 320, damping: 32 });
        }}
        className="fixed inset-x-0 bottom-0 z-[65] h-[92dvh] bg-parchment rounded-t-[26px] shadow-warm overflow-hidden flex flex-col"
      >
        <div
          onPointerDown={(e) => controls.start(e)}
          className="shrink-0 pt-2.5 pb-2 grid place-items-center cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-11 h-[5px] rounded-full bg-sand-400" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <ReaderBody postId={postId} />
        </div>
      </motion.div>
    </>
  );
}
