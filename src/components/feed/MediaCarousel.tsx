import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { LayoutGroup, motion, useAnimationControls, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, Heart, Volume2, VolumeX } from 'lucide-react';

interface MediaCarouselProps {
  urls: string[];
  alt: string;
  edgeToEdge?: boolean;
  onDoubleTap?: () => void;
  onSingleTap?: () => void;
  /** Suppress the built-in heart burst when the host already paints its own. */
  suppressHeartBurst?: boolean;
  /**
   * The post's own media_type. Blobs are served extension-less as
   * `/api/media?id=…`, so the URL sniff below can never spot a video — without
   * this a multi-slide video post renders every slide as a broken <img>.
   */
  mediaType?: 'image' | 'video' | null;
}

/* A settled, unhurried spring — paper sliding over paper, not a rubber band. */
const SLIDE_SPRING = { type: 'spring', stiffness: 320, damping: 36, mass: 0.85 } as const;

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || url.includes('video');
const isImageUrl = (url: string) => /\.(jpe?g|png|gif|webp|avif|bmp)(\?.*)?$/i.test(url);

function slideIsVideo(url: string, mediaType?: 'image' | 'video' | null) {
  if (isVideoUrl(url)) return true;
  // Extension-less blob URL: trust the post's declared type unless the URL
  // clearly says image.
  if (isImageUrl(url)) return false;
  return mediaType === 'video';
}

export default function MediaCarousel({
  urls,
  alt,
  edgeToEdge,
  onDoubleTap,
  onSingleTap,
  suppressHeartBurst,
  mediaType,
}: MediaCarouselProps) {
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [width, setWidth] = useState(0);
  const [hearts, setHearts] = useState<number[]>([]);

  const frameRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const controls = useAnimationControls();
  // Namespaces the shared "carousel-dot" layoutId per instance, so two
  // carousels in one feed never trade their gold lozenge across the screen.
  const layoutScope = useId();

  const total = urls.length;
  const clampedIndex = Math.min(index, Math.max(total - 1, 0));

  /* Slide width == frame width; remeasure on resize so rotation stays honest. */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Drive the track from the index — after a flick, after a chevron, after a resize. */
  useEffect(() => {
    if (!width) return;
    controls.start({ x: -clampedIndex * width, transition: SLIDE_SPRING });
  }, [clampedIndex, width, controls]);

  useEffect(
    () => () => {
      if (singleTapTimer.current) window.clearTimeout(singleTapTimer.current);
    },
    [],
  );

  const burstHeart = useCallback(() => {
    const id = Date.now();
    setHearts((h) => [...h, id]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x !== id)), 900);
  }, []);

  const handleTap = () => {
    // A flick that ends over the frame must never read as a tap.
    if (draggedRef.current) return;

    const now = Date.now();
    if (now - lastTap.current < 320) {
      if (singleTapTimer.current) {
        window.clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      if (!suppressHeartBurst) burstHeart();
      onDoubleTap?.();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      if (onSingleTap) {
        singleTapTimer.current = window.setTimeout(() => {
          onSingleTap();
          singleTapTimer.current = null;
        }, 330);
      }
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = Math.max(44, width * 0.18);
    let target = clampedIndex;
    if (info.offset.x < -threshold || info.velocity.x < -480) target = Math.min(clampedIndex + 1, total - 1);
    else if (info.offset.x > threshold || info.velocity.x > 480) target = Math.max(clampedIndex - 1, 0);

    if (target === clampedIndex) {
      // Nothing won the flick — spring home.
      controls.start({ x: -clampedIndex * width, transition: SLIDE_SPRING });
    } else {
      setIndex(target);
    }
    // Let the synthetic click that trails a drag pass by unnoticed.
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 60);
  };

  const go = (delta: number) => (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIndex((i) => Math.min(Math.max(i + delta, 0), total - 1));
  };

  if (!total) return null;

  return (
    <div
      ref={frameRef}
      onClick={handleTap}
      className={`group/carousel relative w-full aspect-[3/2] select-none overflow-hidden cursor-pointer bg-sand-200 dark:bg-[linear-gradient(140deg,#1d4230,#0e2118)] ${
        edgeToEdge ? '' : 'lg:rounded-2xl'
      }`}
    >
      {/* The track — every slide side by side, dragged as one sheet. */}
      <motion.div
        className="absolute inset-0 flex h-full"
        style={{ width: total * 100 + '%', touchAction: 'pan-y' }}
        drag={total > 1 ? 'x' : false}
        dragElastic={0.16}
        dragMomentum={false}
        dragConstraints={{ left: -(total - 1) * width, right: 0 }}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        animate={controls}
        initial={false}
      >
        {urls.map((url, i) => (
          <div key={`${url}-${i}`} className="relative h-full shrink-0" style={{ width: width || undefined, flexBasis: width ? undefined : `${100 / total}%` }}>
            {slideIsVideo(url, mediaType) ? (
              <>
                <video
                  src={url}
                  autoPlay={i === clampedIndex}
                  muted={muted}
                  loop
                  playsInline
                  preload="metadata"
                  draggable={false}
                  className="w-full h-full object-cover block pointer-events-none"
                />
                {i === clampedIndex && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMuted(!muted);
                    }}
                    className="absolute bottom-3 right-3 z-10 grid place-items-center w-8 h-8 rounded-full bg-neem-950/70 text-parchment backdrop-blur-md hover:bg-neem-950/90 transition-colors"
                    aria-label={muted ? 'Unmute video' : 'Mute video'}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                )}
              </>
            ) : (
              <img
                src={url}
                alt={`${alt} — slide ${i + 1} of ${total}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
                className="w-full h-full object-cover block pointer-events-none"
              />
            )}
          </div>
        ))}
      </motion.div>

      {/* Radiating heart spark on double-tap */}
      {hearts.map((id) => (
        <motion.div
          key={id}
          initial={{ opacity: 0, scale: 0.35 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.35, 1.15, 1, 1.35] }}
          transition={{ duration: 0.9, times: [0, 0.22, 0.58, 1], ease: 'easeOut' }}
          className="absolute inset-0 z-30 grid place-items-center pointer-events-none"
        >
          <span className="relative grid place-items-center">
            <motion.span
              initial={{ opacity: 0.55, scale: 0.4 }}
              animate={{ opacity: 0, scale: 2.1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="absolute w-24 h-24 rounded-full border-2 border-gold-300/70"
            />
            <Heart size={92} className="fill-terra-500 text-terra-500 drop-shadow-[0_6px_24px_rgba(0,0,0,0.45)]" strokeWidth={0} />
          </span>
        </motion.div>
      ))}

      {/* Floating counter pill */}
      {total > 1 && (
        <div className="absolute top-3 right-3 z-20 px-2 py-0.5 rounded-full bg-neem-950/65 backdrop-blur-md text-parchment text-[11px] font-semibold tabular-nums tracking-wide shadow-sm pointer-events-none">
          {clampedIndex + 1}/{total}
        </div>
      )}

      {/* Desktop chevrons */}
      {total > 1 && clampedIndex > 0 && (
        <button
          type="button"
          onClick={go(-1)}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 transition-opacity grid place-items-center w-8 h-8 rounded-full bg-neem-950/60 text-parchment backdrop-blur-md hover:bg-neem-950/90 shadow-md"
          aria-label="Previous slide"
        >
          <ChevronLeft size={18} />
        </button>
      )}

      {total > 1 && clampedIndex < total - 1 && (
        <button
          type="button"
          onClick={go(1)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 transition-opacity grid place-items-center w-8 h-8 rounded-full bg-neem-950/60 text-parchment backdrop-blur-md hover:bg-neem-950/90 shadow-md"
          aria-label="Next slide"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {/* Pagination dots — the gold lozenge glides between them via layoutId. */}
      {total > 1 && (
        <LayoutGroup id={layoutScope}>
          <div className="absolute bottom-2.5 inset-x-0 z-20 flex items-center justify-center gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === clampedIndex}
                className="relative grid place-items-center w-3 h-3"
              >
                <span className="block w-1.5 h-1.5 rounded-full bg-parchment/50 backdrop-blur-xs" />
                {i === clampedIndex && (
                  <motion.span
                    layoutId="carousel-dot"
                    transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                    className="absolute left-1/2 -translate-x-1/2 w-4 h-1.5 rounded-full bg-gold-400 shadow-sm"
                  />
                )}
              </button>
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
  );
}
