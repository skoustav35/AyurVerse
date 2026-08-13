import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { cachedRatio, probeMediaRatio } from '../../lib/mediaRatio';

interface MediaFrameProps {
  url: string;
  mediaType: 'image' | 'video' | null;
  alt: string;
  edgeToEdge?: boolean;
  onDoubleTap?: () => void;
  onSingleTap?: () => void;
}

export default function MediaFrame({ url, mediaType, alt, edgeToEdge, onDoubleTap, onSingleTap }: MediaFrameProps) {
  const isDesktop = useIsDesktop();
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const lastTap = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  // the true frame of the medium — cached across sessions
  const [ratio, setRatio] = useState<number | null>(() => (url ? cachedRatio(url) : null));

  useEffect(() => {
    if (!ratio && url) probeMediaRatio(url, mediaType).then((r) => r && setRatio(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sRx = useSpring(rx, { stiffness: 200, damping: 22 });
  const sRy = useSpring(ry, { stiffness: 200, damping: 22 });
  const transform = useTransform(() => `perspective(1000px) rotateX(${sRx.get()}deg) rotateY(${sRy.get()}deg)`);

  const tiltable = isDesktop && mediaType === 'image';

  const handleMove = (e: React.MouseEvent) => {
    if (!tiltable || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ry.set(px * 6);
    rx.set(-py * 6);
  };

  const resetTilt = () => {
    rx.set(0);
    ry.set(0);
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      // double tap → like; cancel any pending single-tap navigation
      if (singleTapTimer.current) {
        window.clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      onDoubleTap?.();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      // a confirmed single tap (no second tap follows) fires the primary action
      if (onSingleTap) {
        singleTapTimer.current = window.setTimeout(() => {
          onSingleTap();
          singleTapTimer.current = null;
        }, 330);
      }
    }
  };

  useEffect(() => () => {
    if (singleTapTimer.current) window.clearTimeout(singleTapTimer.current);
  }, []);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={resetTilt}
      onClick={handleTap}
      style={{
        ...(tiltable ? { transform } : {}),
        aspectRatio: '3 / 2',
      }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      className={`relative w-full select-none overflow-hidden cursor-pointer will-change-transform bg-[linear-gradient(140deg,#1d4230,#0e2118)] ${
        edgeToEdge ? '' : 'lg:rounded-2xl'
      }`}
    >
      {mediaType === 'video' ? (
        <>
          <video
            ref={videoRef}
            src={url}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight);
            }}
            className="block w-full h-full"
            style={{ objectFit: 'cover' }}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <button
            onClick={toggleSound}
            className="absolute bottom-3 right-3 z-10 grid place-items-center w-9 h-9 rounded-full bg-neem-950/70 text-parchment backdrop-blur-md hover:bg-neem-950/90 transition-colors"
            aria-label={muted ? 'Unmute video' : 'Mute video'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </>
      ) : (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
          }}
          className="block w-full h-full"
          style={{ objectFit: 'cover' }}
          draggable={false}
        />
      )}
    </motion.div>
  );
}
