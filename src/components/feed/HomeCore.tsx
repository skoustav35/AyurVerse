import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Compass, Home, Plus } from 'lucide-react';
import HomeCoreCard, { type CardAccent } from './HomeCoreCard';
import PulseBars from './PulseBars';
import TasteSpectrumTop3 from './TasteSpectrumTop3';
import { useFeed, useNotifications } from '../../hooks/queries';
import { useUI } from '../../store/ui';
import { spring, stagger } from '../../lib/motion';

/**
 * The three-card core. Rendered once at the top of FeedView above the
 * StoriesRow. Each card summarises one pillar of the atelier:
 *
 *  - Weave    → open the Composer
 *  - Scroll   → smooth-scroll to the post list
 *  - Discover → open the Feed Tuner (taste dial)
 *
 * Data is read-only. All actions go through the existing useUI() store.
 */
export default function HomeCore() {
  const feed = useFeed();
  const { data: notif } = useNotifications();
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  const openFeedTuner = useUI((s) => s.openFeedTuner);

  // Posts in the current feed window + unique author count. Both come from
  // the same query the post list uses, so they're guaranteed in sync.
  const postsToday = useMemo(() => {
    const items = (feed.data?.pages ?? []).flatMap((p) => p.items);
    return items.length;
  }, [feed.data]);

  const weaversToday = useMemo(() => {
    const ids = new Set<string>();
    for (const p of (feed.data?.pages ?? []).flatMap((p) => p.items)) ids.add(p.author_id);
    return ids.size;
  }, [feed.data]);

  // Synthetic pulse data for the **Scroll** card. We sample the current
  // feed's like counts so the bars feel connected to the actual content.
  const pulse = useMemo(() => {
    const items = (feed.data?.pages ?? []).flatMap((p) => p.items).slice(0, 7);
    if (items.length === 0) return [18, 28, 22, 38, 30, 46, 40];
    const max = Math.max(1, ...items.map((p) => p.likes_count ?? 0));
    return items.map((p) => Math.round(((p.likes_count ?? 0) / max) * 92 + 8));
  }, [feed.data]);

  // Top three taste tags for the **Discover** card.
  const topTaste = useMemo(() => {
    const taste = feed.data?.pages?.[0]?.meta?.taste ?? [];
    return taste.slice(0, 3);
  }, [feed.data]);

  const unreadNotif = notif?.unread ?? 0;

  const tiers: Array<{
    id: 'compose' | 'scroll' | 'discover';
    eyebrow: string;
    title: string;
    copy: string;
    Icon: typeof Plus;
    accent: CardAccent;
    sparkline: React.ReactNode;
    ctaLabel: string;
    ariaLabel: string;
    onPrimary: () => void;
  }> = [
    {
      id: 'compose',
      eyebrow: 'Weave',
      title: 'Begin a fresh scroll',
      copy: 'Snap a status, draft a long-form scroll, or post to the feed — three looms, one breath.',
      Icon: Plus,
      accent: 'saffron',
      sparkline: (
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Status', dot: 'bg-saffron-500' },
            { label: 'Feed', dot: 'bg-gold-500' },
            { label: 'Forge', dot: 'bg-neem-600' },
          ].map((t) => (
            <div
              key={t.label}
              className="flex items-center gap-1.5 rounded-lg bg-parchment/60 border border-sand-300/70 px-2 py-1.5"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-700">
                {t.label}
              </span>
            </div>
          ))}
        </div>
      ),
      ctaLabel: 'Open the loom',
      ariaLabel: 'Open the Composer to weave a new post',
      onPrimary: () => setComposerOpen(true),
    },
    {
      id: 'scroll',
      eyebrow: 'Scroll',
      title: 'The garden today',
      copy: `${postsToday} fresh moments from ${weaversToday} weaver${weaversToday === 1 ? '' : 's'}${unreadNotif ? ` · ${unreadNotif} whisper${unreadNotif === 1 ? '' : 's'}` : ''} — the waters are still.`,
      Icon: Home,
      accent: 'neem',
      sparkline: <PulseBars data={pulse} label="Like activity this session" />,
      ctaLabel: "Jump to today's feed",
      ariaLabel: `Scroll down to see ${postsToday} posts from today`,
      onPrimary: () => {
        const list = document.getElementById('feed-list');
        list?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
    {
      id: 'discover',
      eyebrow: 'Discover',
      title: 'Your taste spectrum',
      copy: 'Top tags, trending scrolls and a hand-tuned dial — go where the river leads.',
      Icon: Compass,
      accent: 'gold',
      sparkline: <TasteSpectrumTop3 tags={topTaste} />,
      ctaLabel: 'Open the tuner',
      ariaLabel: 'Open the feed tuner and discover your taste spectrum',
      onPrimary: () => openFeedTuner(),
    },
  ];

  return (
    <motion.section
      aria-label="Atelier home — three pillars"
      initial="rest"
      animate="rest"
      className="px-4 lg:px-2 pt-4 pb-2"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
        {tiers.map((t, i) => (
          <motion.div
            key={t.id}
            {...stagger(i, 0.08)}
            style={{ willChange: 'transform, opacity' }}
          >
            <HomeCoreCard
              id={t.id}
              eyebrow={t.eyebrow}
              title={t.title}
              copy={t.copy}
              Icon={t.Icon}
              accent={t.accent}
              sparkline={t.sparkline}
              ctaLabel={t.ctaLabel}
              ariaLabel={t.ariaLabel}
              onPrimary={t.onPrimary}
            />
          </motion.div>
        ))}
      </div>

      {/* Tiny spring-loaded section caption so the trio reads as one block */}
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.32 }}
        className="text-center text-[10.5px] uppercase tracking-[0.24em] text-ink-400 mt-4"
      >
        ◈ weave · scroll · discover ◈
      </motion.p>
    </motion.section>
  );
}
