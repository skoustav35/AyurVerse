import { motion } from 'framer-motion';
import { Hash } from 'lucide-react';
import { spring } from '../../lib/motion';

interface TasteTag {
  tag: string;
  weight: number;
}

interface TasteSpectrumTop3Props {
  tags: TasteTag[];
}

/**
 * Top three tags from the user's taste spectrum, rendered as Apple-style
 * inline pills. Used inside the **Discover** card. Falls back to a calm
 * placeholder when no taste data is available yet.
 */
export default function TasteSpectrumTop3({ tags }: TasteSpectrumTop3Props) {
  if (!tags.length) {
    return (
      <p className="text-[12px] italic font-display text-ink-500 leading-snug">
        Your spectrum is still forming — post, save and linger and we'll learn.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {tags.slice(0, 3).map((t, i) => (
        <motion.li
          key={t.tag}
          initial={{ opacity: 0, y: 8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring.appleSnappy, delay: 0.12 + i * 0.06 }}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-neem-800 bg-gradient-to-r from-saffron-500/15 to-gold-400/15 border border-gold-500/40 rounded-full px-2.5 py-1"
        >
          <Hash size={11} className="text-gold-700" />
          <span>{t.tag}</span>
          <span className="text-[9.5px] font-bold text-gold-700 tabular-nums">
            {t.weight.toFixed(1)}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
