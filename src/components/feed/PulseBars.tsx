import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';

interface PulseBarsProps {
  /** Bar heights as percentage of container (0-100). */
  data: number[];
  /** Accessible label for screen readers. */
  label?: string;
}

/**
 * A small SVG bar chart used inside the **Scroll** card. Bars animate in
 * with staggered spring heights so the card feels alive on first paint.
 */
export default function PulseBars({ data, label = 'Recent engagement' }: PulseBarsProps) {
  // Normalize: clamp to [6, 100] so bars always have a visible sliver.
  const values = (data.length ? data : [12, 18, 22, 16]).map((v) =>
    Math.max(6, Math.min(100, v)),
  );

  return (
    <div
      role="img"
      aria-label={label}
      className="flex items-end gap-1.5 h-16 px-1"
    >
      {values.map((height, i) => (
        <motion.div
          key={i}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: `${height}%`, opacity: 1 }}
          transition={{ ...spring.appleSoft, delay: 0.15 + i * 0.06 }}
          className={`flex-1 rounded-t-md ${
            i === values.length - 1
              ? 'bg-gradient-to-t from-saffron-500 to-gold-400'
              : 'bg-gradient-to-t from-neem-500/60 to-neem-400/40'
          }`}
        />
      ))}
    </div>
  );
}
