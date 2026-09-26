import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  Check,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { SEEK_EVENT, consumePendingSeek, useVideoScope } from '../../lib/videoSeek';

interface VideoPlayerProps {
  url: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  aspectRatio?: string;
  onEnded?: () => void;
  /**
   * Which timestamp scope this player answers to. Defaults to the surrounding
   * VideoScopeContext, so a reader only ever drives its own lecture.
   */
  seekScope?: string;
}

/**
 * Screen Orientation lock is still behind a vendor-ish surface in the DOM libs —
 * present on Android/Chrome, absent on desktop Safari. Narrow it here instead of
 * sprinkling `any` at the call site.
 */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait' | 'any') => Promise<void>;
};

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export default function VideoPlayer({
  url,
  poster,
  title,
  autoPlay = false,
  className = '',
  aspectRatio = '16 / 9',
  onEnded,
  seekScope,
}: VideoPlayerProps) {
  const contextScope = useVideoScope();
  const scope = seekScope ?? contextScope;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [skipNotice, setSkipNotice] = useState<{ dir: 'left' | 'right'; id: number } | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  const controlsTimeoutRef = useRef<number | null>(null);
  const skipNoticeTimeoutRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  // Reset hide timer
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        if (!showSpeedMenu) setShowControls(false);
      }, 3200);
    }
  }, [playing, showSpeedMenu]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControlsTimeout]);

  // Timestamps in prose ("02:15 — Preparing the Ghee") seek this player, but
  // only when the dispatch carries *our* scope — a feed full of mounted
  // players must not all jump at once.
  useEffect(() => {
    if (scope === 'none') return;
    const handleSeek = (e: WindowEventMap[typeof SEEK_EVENT]) => {
      const { time, scope: target } = e.detail ?? {};
      if (target !== scope || typeof time !== 'number') return;
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = time;
      setCurrentTime(time);
      video.play().catch(() => {});
      setPlaying(true);
      setShowControls(true);
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(SEEK_EVENT, handleSeek);
    return () => window.removeEventListener(SEEK_EVENT, handleSeek);
  }, [scope]);

  // Fullscreen change listener — also releases any orientation lock the
  // browser kept when the user left theater mode via Esc / the back gesture.
  useEffect(() => {
    const handleFsChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) {
        try {
          (screen.orientation as LockableOrientation | undefined)?.unlock?.();
        } catch {
          /* desktop browsers have nothing to unlock */
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
      setShowControls(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !muted;
    videoRef.current.muted = nextMuted;
    setMuted(nextMuted);
    if (nextMuted) setVolume(0);
    else setVolume(videoRef.current.volume || 1);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setMuted(val === 0);
    }
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        // Phones: a 16:9 lecture deserves the long edge. Best-effort — desktop
        // and iOS Safari have no lock() and simply fall through.
        const orientation = screen.orientation as LockableOrientation | undefined;
        if (orientation?.lock && window.matchMedia('(max-width: 900px)').matches) {
          await orientation.lock('landscape').catch(() => {});
        }
      } catch {
        /* user or browser declined fullscreen */
      }
    } else {
      try {
        (screen.orientation as LockableOrientation | undefined)?.unlock?.();
      } catch {
        /* nothing to unlock */
      }
      try {
        await document.exitFullscreen();
      } catch {
        /* noop */
      }
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      /* noop */
    }
  };

  const skipTime = (delta: number) => {
    if (!videoRef.current) return;
    const newTime = Math.min(Math.max(videoRef.current.currentTime + delta, 0), duration || 0);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setSkipNotice({ dir: delta > 0 ? 'right' : 'left', id: Date.now() });
    if (skipNoticeTimeoutRef.current) clearTimeout(skipNoticeTimeoutRef.current);
    skipNoticeTimeoutRef.current = window.setTimeout(() => {
      setSkipNotice(null);
      skipNoticeTimeoutRef.current = null;
    }, 700);
  };

  useEffect(
    () => () => {
      if (skipNoticeTimeoutRef.current) clearTimeout(skipNoticeTimeoutRef.current);
    },
    [],
  );

  // Double tap detection (left side -10s, right side +10s). Bound to the
  // <video> element itself, so keep the target generic.
  const handleTouchTap = (e: React.MouseEvent<HTMLElement>) => {
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftSide = x < rect.width * 0.4;
    const isRightSide = x > rect.width * 0.6;

    if (now - lastTapRef.current.time < 300) {
      // Double tap!
      if (isLeftSide) {
        skipTime(-10);
      } else if (isRightSide) {
        skipTime(10);
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x };
      togglePlay();
    }
  };

  // Scrubber interactions
  const handleScrubMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
    setHoverPosition(ratio * 100);
  };

  const handleScrubSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration || !videoRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => {
        if (playing && !showSpeedMenu) setShowControls(false);
      }}
      className={`relative group/player bg-neem-950 select-none overflow-hidden rounded-2xl shadow-xl flex items-center justify-center ${className}`}
      style={{ aspectRatio: isFullscreen ? 'auto' : aspectRatio }}
    >
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (!videoRef.current) return;
          setDuration(videoRef.current.duration);
          // A timestamp tapped in the feed, before this player existed.
          const parked = consumePendingSeek(scope);
          if (parked !== null) {
            videoRef.current.currentTime = parked;
            setCurrentTime(parked);
            videoRef.current.play().catch(() => {});
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setShowControls(true);
          onEnded?.();
        }}
        className="w-full h-full object-contain cursor-pointer"
        onClick={handleTouchTap}
      />

      {/* Buffering Indicator */}
      <AnimatePresence>
        {isBuffering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 grid place-items-center pointer-events-none z-20"
          >
            <div className="w-12 h-12 rounded-full border-4 border-gold-400/30 border-t-gold-400 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip Feedback Animation */}
      <AnimatePresence>
        {skipNotice && (
          <motion.div
            key={skipNotice.id}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={`absolute top-1/2 -translate-y-1/2 z-30 pointer-events-none p-4 rounded-full bg-neem-950/80 backdrop-blur-md text-gold-400 flex items-center gap-1 text-sm font-semibold shadow-2xl ${
              skipNotice.dir === 'left' ? 'left-8' : 'right-8'
            }`}
          >
            {skipNotice.dir === 'left' ? <RotateCcw size={20} /> : <RotateCw size={20} />}
            <span>10s</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-gradient-to-t from-neem-950/90 via-transparent to-neem-950/60 pointer-events-none flex flex-col justify-between p-4 z-20"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between pointer-events-auto">
              {title ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-widest font-bold text-gold-400 flex items-center gap-1">
                    <Sparkles size={12} />
                    Theater
                  </span>
                  <span className="text-sm font-medium text-parchment drop-shadow truncate max-w-[280px] sm:max-w-md">
                    {title}
                  </span>
                </div>
              ) : (
                <div />
              )}

              {/* Speed Menu Toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-neem-900/80 text-parchment/90 hover:text-gold-300 border border-parchment/15 backdrop-blur-sm transition-colors"
                >
                  <span>{playbackRate === 1 ? 'Speed' : `${playbackRate}x`}</span>
                  <ChevronDown size={13} />
                </button>

                {showSpeedMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute right-0 top-full mt-2 w-32 bg-neem-950/95 border border-gold-500/30 rounded-xl p-1.5 shadow-2xl backdrop-blur-md z-30"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 px-2 py-1">Playback Speed</p>
                    {PLAYBACK_SPEEDS.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => changePlaybackRate(rate)}
                        className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg transition-colors ${
                          playbackRate === rate
                            ? 'bg-gold-500/20 text-gold-400 font-bold'
                            : 'text-parchment/80 hover:bg-parchment/10'
                        }`}
                      >
                        <span>{rate === 1.0 ? '1.0x (Normal)' : `${rate}x`}</span>
                        {playbackRate === rate && <Check size={12} className="text-gold-400" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Center Big Play/Pause for Instant Feedback */}
            <div className="self-center pointer-events-auto">
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-neem-900/70 border border-gold-500/40 text-gold-400 hover:text-gold-300 hover:scale-105 transition-all grid place-items-center shadow-warm backdrop-blur-md"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause size={26} /> : <Play size={26} className="ml-1" />}
              </button>
            </div>

            {/* Bottom Controls Strip */}
            <div className="space-y-2 pointer-events-auto">
              {/* Interactive Scrubber Bar */}
              <div
                ref={progressRef}
                onClick={handleScrubSeek}
                onMouseMove={handleScrubMove}
                onMouseLeave={() => setHoverTime(null)}
                className="relative h-2 w-full group/scrub cursor-pointer rounded-full bg-parchment/25 hover:h-3 transition-all"
              >
                {/* Buffered / Progress Bar */}
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-saffron-500 to-gold-400 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />

                {/* Scrubber Knob */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-parchment shadow-md ring-2 ring-gold-400 pointer-events-none group-hover/scrub:scale-125 transition-transform"
                  style={{ left: `calc(${progressPercent}% - 7px)` }}
                />

                {/* Scrubber Hover Timestamp Preview */}
                {hoverTime !== null && (
                  <div
                    className="absolute -top-7 -translate-x-1/2 bg-neem-950/90 text-gold-300 text-[11px] font-mono px-2 py-0.5 rounded border border-parchment/20 shadow-md pointer-events-none"
                    style={{ left: `${hoverPosition}%` }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
              </div>

              {/* Lower Buttons Bar */}
              <div className="flex items-center justify-between text-parchment">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="hover:text-gold-400 transition-colors"
                    aria-label={playing ? 'Pause' : 'Play'}
                  >
                    {playing ? <Pause size={20} /> : <Play size={20} />}
                  </button>

                  <button
                    onClick={() => skipTime(-10)}
                    className="hover:text-gold-400 transition-colors p-1"
                    title="Rewind 10 seconds"
                  >
                    <RotateCcw size={16} />
                  </button>

                  <button
                    onClick={() => skipTime(10)}
                    className="hover:text-gold-400 transition-colors p-1"
                    title="Forward 10 seconds"
                  >
                    <RotateCw size={16} />
                  </button>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-1.5 group/vol">
                    <button
                      onClick={toggleMute}
                      className="hover:text-gold-400 transition-colors"
                      aria-label={muted ? 'Unmute' : 'Mute'}
                    >
                      {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 accent-gold-400 cursor-pointer hidden sm:block opacity-75 group-hover/vol:opacity-100 transition-opacity"
                    />
                  </div>

                  {/* Time Display */}
                  <div className="text-xs font-mono text-parchment/80 flex items-center gap-1 ml-1">
                    <span>{formatTime(currentTime)}</span>
                    <span className="text-parchment/40">/</span>
                    <span className="text-parchment/60">{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* PiP */}
                  {document.pictureInPictureEnabled && (
                    <button
                      onClick={togglePiP}
                      className="hover:text-gold-400 transition-colors p-1 hidden sm:block"
                      title="Picture in Picture"
                    >
                      <PictureInPicture2 size={18} />
                    </button>
                  )}

                  {/* Fullscreen */}
                  <button
                    onClick={toggleFullscreen}
                    className="hover:text-gold-400 transition-colors p-1"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
