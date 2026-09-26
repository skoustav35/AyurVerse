import { AnimatePresence, motion } from 'framer-motion';
import { Hash, X, Heart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { Post, Profile } from '../../lib/types';
import { ForgeRow, ImageTile, VideoResultRow } from './Rows';
import Mandala from '../common/Mandala';
import { compact } from '../../lib/format';
import { useUI } from '../../store/ui';

interface Resp {
  posts: Post[];
  people: Profile[];
}

export default function HashtagView() {
  const tag = useUI((s) => s.activeHashtag);
  const close = useUI((s) => s.closeHashtag);

  const { data, isLoading } = useQuery({
    queryKey: ['hashtag', tag],
    enabled: !!tag,
    queryFn: () => apiFetch<Resp>(`/api/search?q=${encodeURIComponent(tag || '')}`),
  });

  const posts = data?.posts ?? [];
  const videos = posts.filter((p) => p.media_type === 'video');
  const images = posts.filter((p) => p.media_type === 'image');
  const lore = posts.filter((p) => p.kind === 'forge');
  const totalLikes = posts.reduce((a, p) => a + (p.likes_count || 0), 0);

  return (
    <AnimatePresence>
      {tag && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="fixed inset-0 z-[70] bg-neem-950/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="fixed z-[75] inset-x-0 bottom-0 top-4 sm:inset-6 lg:inset-x-[16%] lg:inset-y-8 bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden flex flex-col shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
          >
            {/* header */}
            <div className="relative shrink-0 px-5 py-5 bg-[radial-gradient(120%_120%_at_30%_0%,#1b4230,#12291c)]">
              <Mandala className="absolute -right-10 -top-12 w-48 h-48 text-gold-400/20 animate-spin-slower pointer-events-none" />
              <button onClick={close} className="absolute top-4 right-4 z-10 grid place-items-center w-9 h-9 rounded-full bg-neem-950/40 text-parchment backdrop-blur hover:bg-neem-950/60" aria-label="Close">
                <X size={18} />
              </button>
              <div className="relative flex items-center gap-3">
                <span className="grid place-items-center w-12 h-12 rounded-2xl bg-gold-500/15 ring-1 ring-gold-500/40 text-gold-300">
                  <Hash size={22} />
                </span>
                <div>
                  <h1 className="font-display font-semibold text-[24px] text-parchment leading-tight">#{tag}</h1>
                  <p className="text-[12px] text-sand-200/80 mt-0.5">
                    {compact(posts.length)} posts · <Heart size={11} className="inline -mt-0.5 fill-sand-200/80" /> {compact(totalLikes)}
                  </p>
                </div>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-8">
              {isLoading && (
                <div className="grid place-items-center py-16">
                  <Mandala className="w-14 h-14 text-gold-500/60 animate-spin-slower" />
                </div>
              )}

              {!isLoading && posts.length === 0 && (
                <div className="text-center py-16">
                  <Hash className="mx-auto text-sand-400" size={30} />
                  <p className="font-display italic text-ink-600 mt-3">Nothing woven under #{tag} yet.</p>
                </div>
              )}

              {videos.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Videos</h3>
                  <div className="space-y-4">
                    {videos.map((p) => <VideoResultRow key={p.id} post={p} q={tag || ''} />)}
                  </div>
                </section>
              )}

              {lore.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Lore &amp; writing</h3>
                  <div className="space-y-2.5">
                    {lore.map((p) => <ForgeRow key={p.id} post={p} q={tag || ''} />)}
                  </div>
                </section>
              )}

              {images.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500 mb-3">Moments</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((p) => <ImageTile key={p.id} post={p} />)}
                  </div>
                </section>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
