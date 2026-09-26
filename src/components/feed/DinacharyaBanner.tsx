import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Moon, Sparkles, Sun, Sunrise, Sunset, Wind } from 'lucide-react';
import { usePreferences, useUpdatePreferences } from '../../hooks/queries';
import { useUI } from '../../store/ui';

interface DinacharyaPhase {
  name: string;
  sanskrit: string;
  icon: typeof Sun;
  /** Gradient wash + hairline border. Accent tokens flip with the theme, so a
      wash never turns into a bruise the way a raw amber-900/stone-900 stop did. */
  wash: string;
  /** Mid-luminance accent that stays legible on both the cream and obsidian canvas. */
  accent: string;
  dosha: string;
  advice: string;
  tags: string[];
}

function getCircadianPhase(): DinacharyaPhase {
  const d = new Date();
  const hour = d.getHours() + d.getMinutes() / 60;

  // Brahma Muhurta & Morning (4:30 AM - 9:00 AM)
  if (hour >= 4.5 && hour < 9.0) {
    return {
      name: 'Dawn & Awakening',
      sanskrit: 'Brahma Muhurta & Pratah',
      icon: Sunrise,
      wash: 'from-saffron-500/14 via-saffron-500/6 to-gold-500/10 border-saffron-500/30',
      accent: 'text-saffron-500',
      dosha: 'Vata clarity & Kapha awakening',
      advice: 'The subtle channels are open. Ideal for meditation reels, pranayama, chants, warm water, and light herbal tea.',
      tags: ['dinacharya', 'pranayama', 'meditation', 'chants', 'herbal-tea', 'morning'],
    };
  }

  // Midday Surya Agni Peak (11:00 AM - 2:30 PM)
  if (hour >= 11.0 && hour < 14.5) {
    return {
      name: 'Midday Solar Peak',
      sanskrit: 'Madhyahna · Surya Agni',
      icon: Sun,
      wash: 'from-gold-500/16 via-gold-500/7 to-saffron-500/10 border-gold-500/32',
      accent: 'text-gold-500',
      dosha: 'Pitta peak · Highest Jatharagni',
      advice: 'Digestive and mental fires peak together. Ideal for dense lore manuscripts and your main meal.',
      tags: ['forge', 'deep-lore', 'agni', 'rasashastra', 'recipes'],
    };
  }

  // Evening Twilight / Sunset (5:30 PM - 8:30 PM)
  if (hour >= 17.5 && hour < 20.5) {
    return {
      name: 'Twilight Transition',
      sanskrit: 'Sandhya Kala',
      icon: Sunset,
      wash: 'from-terra-500/14 via-terra-500/6 to-saffron-500/10 border-terra-500/30',
      accent: 'text-terra-500',
      dosha: 'Vata transition · Sensory grounding',
      advice: 'Transition toward stillness. Soften sensory lights, sip warm tulsi or spiced milk, and reflect.',
      tags: ['sandhya', 'vata', 'restorative', 'herbal', 'reflection'],
    };
  }

  // Night Nidra & Ojas Building (9:30 PM - 4:30 AM)
  if (hour >= 21.5 || hour < 4.5) {
    return {
      name: 'Night Restoration',
      sanskrit: 'Ratri Nidra & Ojas',
      icon: Moon,
      wash: 'from-neem-400/14 via-neem-500/7 to-gold-500/8 border-neem-400/28',
      accent: 'text-neem-400',
      dosha: 'Kapha cellular repair · Ojas synthesis',
      advice: 'Wind down gently. Rest the sensory organs; somatic stillness rebuilds immunity (Ojas) and quietens the mind.',
      tags: ['nidra', 'sleep', 'rest', 'ojas', 'wind-down'],
    };
  }

  // Daytime Equilibrium (default balance)
  return {
    name: 'Sattvic Equilibrium',
    sanskrit: 'Samanavata · Harmony',
    icon: Wind,
    wash: 'from-neem-500/12 via-neem-500/5 to-sand-500/10 border-neem-500/28',
    accent: 'text-neem-500',
    dosha: 'Tridoshic balance',
    advice: 'Walk with gentle mindfulness. Maintain steady, dignified focus.',
    tags: ['ayurveda', 'equilibrium', 'sattva'],
  };
}

export default function DinacharyaBanner() {
  const [phase, setPhase] = useState<DinacharyaPhase>(getCircadianPhase);
  const [expanded, setExpanded] = useState(false);
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const pushToast = useUI((s) => s.pushToast);

  useEffect(() => {
    const timer = setInterval(() => setPhase(getCircadianPhase()), 60000);
    return () => clearInterval(timer);
  }, []);

  const Icon = phase.icon;
  const dinacharyaEnabled = prefs?.dinacharya_mode ?? true;

  const tuneToMuhurta = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!prefs) {
      pushToast('Sign in to tune your feed with circadian rhythm', 'error');
      return;
    }

    const currentBoosted = prefs.boosted_tags || [];
    const newBoosted = Array.from(new Set([...currentBoosted, ...phase.tags])).slice(0, 30);

    update.mutate(
      {
        boosted_tags: newBoosted,
        diversity: 0.35,
        freshness: 0.6,
      },
      {
        onSuccess: () => {
          pushToast(`Feed tuned to ${phase.sanskrit} rhythm`, 'gold');
        },
      },
    );
  };

  if (!dinacharyaEnabled) return null;

  return (
    <div className="mx-4 lg:mx-2 my-2">
      <motion.div
        layout
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className={`cursor-pointer rounded-2xl border bg-gradient-to-r p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 ${phase.wash}`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`grid place-items-center w-8 h-8 rounded-full bg-ink-900/[0.06] dark:bg-ink-900/25 shrink-0 ${phase.accent}`}>
              <Icon size={15} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${phase.accent}`}>
                  Digital Dinacharya
                </span>
                <span className="text-[10px] font-medium text-ink-600 truncate">· {phase.dosha}</span>
              </div>
              <p className="font-display font-medium text-[13px] leading-tight truncate text-ink-900 mt-0.5">
                {phase.sanskrit} <span className="font-normal text-ink-600">({phase.name})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={tuneToMuhurta}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gold-500/35 bg-gold-500/12 text-ink-900 hover:bg-gold-500/22 active:scale-95 transition-all flex items-center gap-1"
              title="Align feed algorithm with current bio-rhythm"
            >
              <Sparkles size={10} className="text-gold-500" />
              <span>Align Feed</span>
            </button>
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.22 }}
              className="grid place-items-center text-ink-500"
              aria-hidden="true"
            >
              <ChevronDown size={14} />
            </motion.span>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 pt-2.5 border-t border-ink-900/10 dark:border-ink-900/25 text-xs leading-relaxed">
                <p className="font-serif italic text-ink-700">{phase.advice}</p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-[0.12em] text-ink-500">
                    Recommended lore:
                  </span>
                  {phase.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-ink-900/[0.06] dark:bg-ink-900/20 font-medium text-ink-700"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
