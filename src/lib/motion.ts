import { useEffect, useRef, useState } from 'react';
import {
  useMotionValue,
  useMotionTemplate,
  useReducedMotion,
  type MotionValue,
  type Transition,
  type Variants,
} from 'framer-motion';

// ---------------------------------------------------------------------------
// Easing curves. The first three mirror Apple's "smooth out", "decel", and
// "sharp out" cubic-beziers found across iOS / macOS springs. Every motion in
// the home shell and feed derives from one of these.
// ---------------------------------------------------------------------------

export const ease = {
  appleCurve: [0.22, 1, 0.36, 1] as [number, number, number, number],
  appleDecel: [0.16, 1, 0.3, 1] as [number, number, number, number],
  sharpOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;

// ---------------------------------------------------------------------------
// Spring presets. All numeric values mirror common Apple motion guidance:
//   - stiffness higher = snappier response
//   - damping higher = less bounce
// appleSoft is the default for hero surfaces (cards, sheets).
// appleSnappy is for icon swaps, like bursts, taps.
// gentle is for long, calm things (mandalas, ambient).
// ---------------------------------------------------------------------------

export const spring = {
  appleSoft: { type: 'spring', stiffness: 220, damping: 28 } satisfies Transition,
  appleSnappy: { type: 'spring', stiffness: 380, damping: 26 } satisfies Transition,
  gentle: { type: 'spring', stiffness: 160, damping: 22 } satisfies Transition,
} as const;

// ---------------------------------------------------------------------------
// Card hover / tap variant — applied to every .card-apple root.
// `tap` is intentionally a fade rather than a spring so the press feels
// mechanical, not bouncy.
// ---------------------------------------------------------------------------

export const cardHover: Variants = {
  rest: { y: 0, scale: 1 },
  hover: { y: -6, scale: 1.015, transition: spring.appleSoft },
  tap: { scale: 0.985, transition: { duration: 0.12, ease: ease.sharpOut } },
};

// ---------------------------------------------------------------------------
// Stagger helper for sequential mount / reveal.
// ---------------------------------------------------------------------------

export const stagger = (i: number, gap = 0.08) => ({
  initial: { opacity: 0, y: 24, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { ...spring.appleSoft, delay: i * gap },
});

// ---------------------------------------------------------------------------
// Tab fade — used by both shells' AnimatePresence wrappers. Adds a subtle
// blur so the page swap reads as a soft cross-fade rather than a slide.
// ---------------------------------------------------------------------------

export const tabFade: Variants = {
  initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -10, filter: 'blur(4px)' },
};

// ---------------------------------------------------------------------------
// useSpotlight — a cursor-tracked radial gradient that lives inside a card.
// Returns:
//   onMouseMove / onMouseLeave — handlers to spread onto the card root
//   style — spread onto an absolutely-positioned <motion.span className="spotlight">
//   isActive — true while the cursor is inside the card (so we can keep
//              the gradient visible briefly during exit)
// The hook honors prefers-reduced-motion: when reduced motion is on,
// onMouseMove never sets state and the consuming JSX should hide the spotlight
// layer entirely (the .spotlight class also has a CSS guard).
// ---------------------------------------------------------------------------

export interface SpotlightAPI {
  onMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  /**
   * The cursor-tracked gradient as a `MotionValue<string>`. Spread directly
   * onto a motion component's `style` (motion accepts MotionValues for any
   * animatable CSS prop). The `motion.span` consumer in HomeCoreCard does
   * exactly that.
   */
  background: MotionValue<string>;
  isActive: boolean;
}

const SPOTLIGHT_SIZE = 320; // px — radius of the cursor halo
const SPOTLIGHT_REST_OPACITY = 0.0;
const SPOTLIGHT_ACTIVE_OPACITY = 0.85;

export function useSpotlight(): SpotlightAPI {
  const reduced = useReducedMotion();
  const x = useMotionValue(50);
  const y = useMotionValue(50);
  const opacity = useMotionValue(SPOTLIGHT_REST_OPACITY);
  const [isActive, setActive] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  const rafId = useRef<number | null>(null);

  // Compose a radial gradient at the cursor position. The colors are tuned for
  // a warm saffron / gold halo over the parchment card surface.
  const background = useMotionTemplate`radial-gradient(${SPOTLIGHT_SIZE}px circle at ${x}px ${y}px,
    rgba(236, 195, 78, calc(${opacity} * 0.42)),
    rgba(232, 129, 42, calc(${opacity} * 0.18)) 35%,
    transparent 70%)`;

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduced) return;
    const el = e.currentTarget;
    elRef.current = el;
    // Coalesce per-frame updates via rAF so a fast-moving cursor doesn't
    // trigger more than one paint per frame.
    if (rafId.current !== null) return;
    rafId.current = window.requestAnimationFrame(() => {
      rafId.current = null;
      const rect = el.getBoundingClientRect();
      x.set(e.clientX - rect.left);
      y.set(e.clientY - rect.top);
      if (!isActive) {
        setActive(true);
        // Fade the halo in. Use a tween rather than a spring so the cursor
        // enters/exits feel immediate rather than bouncy.
        animateOpacity(opacity, SPOTLIGHT_ACTIVE_OPACITY, 0.18);
      }
    });
  };

  const onMouseLeave = () => {
    if (rafId.current !== null) {
      window.cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    setActive(false);
    animateOpacity(opacity, SPOTLIGHT_REST_OPACITY, 0.24);
  };

  // Clean up any pending rAF on unmount.
  useEffect(() => {
    return () => {
      if (rafId.current !== null) window.cancelAnimationFrame(rafId.current);
    };
  }, []);

  return {
    onMouseMove,
    onMouseLeave,
    isActive,
    background,
  };
}

// Tiny helper: tween a MotionValue from its current value to `target` over
// `seconds` seconds. We use this rather than spring because cursor entries
// should feel responsive, not bouncy.
function animateOpacity(value: MotionValue<number>, target: number, seconds: number) {
  const start = value.get();
  const delta = target - start;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / (seconds * 1000));
    // Smoothstep keeps the entry/exit gentle.
    const eased = p * p * (3 - 2 * p);
    value.set(start + delta * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
