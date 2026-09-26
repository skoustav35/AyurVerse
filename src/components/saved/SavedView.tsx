import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Feather, Images } from 'lucide-react';
import Mandala from '../common/Mandala';
import { RowSkeleton } from '../common/Skeletons';
import { ForgeRow, ImageTile } from '../search/Rows';
import { useSavedPosts } from '../../hooks/queries';
import { useUI } from '../../store/ui';

/** The Apothecary — polished sub-panel living inside the You tab. */
export default function SavedPanel() {
  const { data, isLoading, isError, refetch } = useSavedPosts(true);
  const [segment, setSegment] = useState<'media' | 'lore'>('media');
  const setTab = useUI((s) => s.setTab);

  const items = data?.items ?? [];
  const media = items.filter((p) => p.kind === 'visual' && p.media_url);
  const lore = items.filter((p) => p.kind === 'forge');

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-500 italic font-display">
          Remedies you ground and kept — {items.length} {items.length === 1 ? 'jar' : 'jars'} on the shelf.
        </p>
        <div className="flex rounded-full border border-sand-300 bg-parchment p-1 shrink-0">
          {(
            [
              { id: 'media', label: 'Media', icon: Images, count: media.length },
              { id: 'lore', label: 'Lore', icon: Feather, count: lore.length },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                segment === s.id ? 'text-parchment' : 'text-ink-600 hover:text-neem-800'
              }`}
            >
              {segment === s.id && (
                <motion.span layoutId="apothecary-pill" className="absolute inset-0 rounded-full bg-neem-800" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
              )}
              <s.icon size={13} className="relative z-10" />
              <span className="relative z-10">{s.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {isLoading && (
          <div className="space-y-3">
            <RowSkeleton />
            <RowSkeleton />
          </div>
        )}

        {isError && (
          <div className="card-warm p-8 text-center">
            <p className="font-display text-lg text-ink-900">The shelf would not open</p>
            <button onClick={() => refetch()} className="mt-4 rounded-full bg-neem-800 text-parchment px-5 py-2 text-sm font-medium hover:bg-neem-700 transition-colors">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="text-center py-12 card-warm">
            <Mandala className="w-20 h-20 mx-auto text-sand-400" petals={12} />
            <p className="font-display text-lg text-ink-900 mt-4">Your apothecary is empty</p>
            <p className="text-sm text-ink-500 mt-2 max-w-xs mx-auto">
              Tap the bookmark on any post or scroll and it will be ground gently onto this shelf.
            </p>
            <button
              onClick={() => setTab('feed')}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-saffron-600 text-parchment px-6 py-2.5 text-sm font-semibold hover:bg-saffron-700 transition-colors"
            >
              <Bookmark size={14} />
              Wander the feed
            </button>
          </div>
        )}

        {!isLoading && items.length > 0 && segment === 'media' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {media.length === 0 ? (
              <p className="text-sm text-ink-500 italic font-display py-8 text-center">No kept media yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {media.map((p) => (
                  <ImageTile key={p.id} post={p} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {!isLoading && items.length > 0 && segment === 'lore' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
            {lore.length === 0 ? (
              <p className="text-sm text-ink-500 italic font-display py-8 text-center">No kept scrolls yet.</p>
            ) : (
              lore.map((p) => <ForgeRow key={p.id} post={p} q="" />)
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
