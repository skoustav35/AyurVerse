import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cardHover, spring, useSpotlight } from '../../lib/motion';

export type CardAccent = 'saffron' | 'neem' | 'gold';

interface HomeCoreCardProps {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  Icon: LucideIcon;
  accent: CardAccent;
  /** A small inline visual: pulse bars, mini-rail, taste chips, etc. */
  sparkline?: ReactNode;
  /** Right-aligned short action label, e.g. "Open the loom". */
  ctaLabel: string;
  onPrimary: () => void;
  /** Full ARIA label spoken to assistive tech. */
  ariaLabel: string;
}

const ACCENT_RING: Record<CardAccent, string> = {
  saffron:
    'from-saffron-500/30 via-saffron-500/12 to-transparent border-saffron-500/35 text-saffron-600',
  neem:
    'from-neem-500/30 via-neem-500/12 to-transparent border-neem-500/35 text-neem-700',
  gold:
    'from-gold-500/35 via-gold-500/15 to-transparent border-gold-500/40 text-gold-700',
};

const ACCENT_ICON_BG: Record<CardAccent, string> = {
  saffron: 'from-saffron-500/25 to-gold-500/20 border-saffron-500/35',
  neem: 'from-neem-500/20 to-gold-500/15 border-neem-500/35',
  gold: 'from-gold-500/30 to-saffron-500/15 border-gold-500/45',
};

export default function HomeCoreCard({
  id,
  eyebrow,
  title,
  copy,
  Icon,
  accent,
  sparkline,
  ctaLabel,
  onPrimary,
  ariaLabel,
}: HomeCoreCardProps) {
  const spotlight = useSpotlight();
  const IconCmp = Icon;

  return (
    <motion.button
      type="button"
      onClick={onPrimary}
      aria-label={ariaLabel}
      data-card-id={id}
      variants={cardHover}
      initial="rest"
      whileHover="hover"
      whileTap="tap"
      onMouseMove={spotlight.onMouseMove}
      onMouseLeave={spotlight.onMouseLeave}
      className="card-apple group block text-left w-full p-5 lg:p-6 will-change-transform focus:outline-none"
    >
      {/* Cursor-tracked spotlight layer. Sits beneath content, above the
          gold-leaf ::before + inner sheen ::after pseudo-elements. The
          `background` MotionValue drives the radial-gradient directly. */}
      <motion.span
        aria-hidden="true"
        className={`spotlight ${spotlight.isActive ? '' : 'is-idle'}`}
        style={{ background: spotlight.background }}
      />

      <div className="relative z-10 flex flex-col gap-4 lg:gap-5 min-h-[210px]">
        {/* Header — icon + eyebrow + sparkline top row */}
        <div className="flex items-start gap-3">
          <motion.span
            variants={{
              rest: { rotate: 0, scale: 1 },
              hover: { rotate: -4, scale: 1.04, transition: spring.appleSnappy },
            }}
            className={`grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br ${ACCENT_ICON_BG[accent]} border text-neem-950 shrink-0`}
          >
            <IconCmp size={20} strokeWidth={1.8} />
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-400">
              {eyebrow}
            </p>
            <h3 className="font-display font-semibold text-[20px] lg:text-[22px] text-neem-950 leading-tight mt-1">
              {title}
            </h3>
          </div>
        </div>

        <p className="text-[13.5px] lg:text-[14px] text-ink-700 leading-relaxed">
          {copy}
        </p>

        {/* Sparkline / mini visual — fills the card body */}
        {sparkline && (
          <div className="mt-auto rounded-2xl border border-sand-300/70 bg-parchment-deep/40 p-3 lg:p-3.5 backdrop-blur-[6px]">
            {sparkline}
          </div>
        )}

        {/* CTA — small, gold-tinted, sits at the bottom on every breakpoint */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.18em] bg-gradient-to-r ${ACCENT_RING[accent]} bg-clip-text text-transparent border-b ${ACCENT_RING[accent].split(' ').pop()}`}
          >
            {eyebrow}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-neem-900 group-hover:text-saffron-700 transition-colors duration-300">
            {ctaLabel}
            <motion.span
              aria-hidden="true"
              variants={{
                rest: { x: 0 },
                hover: { x: 4, transition: spring.appleSnappy },
              }}
              className="inline-block"
            >
              →
            </motion.span>
          </span>
        </div>
      </div>
    </motion.button>
  );
}
