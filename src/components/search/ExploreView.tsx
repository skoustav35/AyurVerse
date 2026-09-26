import { motion } from 'framer-motion';
import { Flame, Clapperboard, Images, ScrollText, UsersRound, Hash, Play, Heart, UserPlus, Sparkles } from 'lucide-react';
import Avatar from '../common/Avatar';
import Mandala from '../common/Mandala';
import { ForgeRow, ImageTile } from './Rows';
import GroupCard from '../groups/GroupCard';
import { compact } from '../../lib/format';
import { useExplore, useFollows, useToggleFollow } from '../../hooks/queries';
import { useUI } from '../../store/ui';

export default function ExploreView() {
  const { data, isLoading } = useExplore();
  const openReader = useUI((s) => s.openReader);
  const openReel = useUI((s) => s.openReel);
  const openHashtag = useUI((s) => s.openHashtag);
  const openUserProfile = useUI((s) => s.openUserProfile);
  const { data: followsData } = useFollows();
  const toggleFollow = useToggleFollow();
  const followingIds = new Set(followsData?.ids ?? []);

  if (isLoading) {
    return (
      <div className="mt-8 grid place-items-center py-16">
        <div className="text-center">
          <Mandala className="w-16 h-16 mx-auto text-gold-500/60 animate-spin-slower" />
          <p className="font-display italic text-ink-500 mt-3">Gathering what’s blooming…</p>
        </div>
      </div>
    );
  }

  const reels = data?.reels ?? [];
  const media = data?.media ?? [];
  const lore = data?.lore ?? [];
  const hashtags = data?.hashtags ?? [];
  const circles = data?.circles ?? [];
  const people = data?.people ?? [];

  return (
    <div className="mt-6 space-y-9">
      {/* Trending hashtags */}
      {hashtags.length > 0 && (
        <section>
          <SectionTitle icon={Hash} label="Trending threads" />
          <div className="flex flex-wrap gap-2 mt-3">
            {hashtags.map((h, i) => (
              <motion.button
                key={h.tag}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => openHashtag(h.tag)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-saffron-500/12 to-gold-400/12 border border-gold-500/40 text-neem-800 text-[12.5px] font-semibold px-3 py-1.5 hover:from-saffron-500/25 hover:to-gold-400/25 transition-colors"
              >
                #{h.tag}
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Trending reels — horizontal rail */}
      {reels.length > 0 && (
        <section>
          <SectionTitle icon={Clapperboard} label="Reels on fire" />
          <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {reels.map((p) => (
              <button
                key={p.id}
                onClick={() => openReel(p.id)}
                className="relative shrink-0 w-32 aspect-[9/16] rounded-2xl overflow-hidden bg-neem-950 group"
              >
                <video src={p.media_url ?? undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-neem-950/80 via-transparent to-transparent" />
                <span className="absolute top-2 right-2 grid place-items-center w-6 h-6 rounded-full bg-neem-950/50 text-parchment backdrop-blur">
                  <Play size={11} className="fill-parchment translate-x-[1px]" />
                </span>
                <div className="absolute bottom-0 inset-x-0 p-2">
                  <p className="text-[10.5px] font-semibold text-parchment truncate">@{p.author_username}</p>
                  <p className="text-[9.5px] text-parchment/80 flex items-center gap-1">
                    <Heart size={9} className="fill-parchment/80" /> {compact(p.likes_count)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Rising circles */}
      {circles.length > 0 && (
        <section>
          <SectionTitle icon={UsersRound} label="Circles rising" />
          <div className="mt-3 space-y-2.5">
            {circles.slice(0, 4).map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}

      {/* Suggested people */}
      {people.length > 0 && (
        <section>
          <SectionTitle icon={Sparkles} label="Weavers to discover" />
          <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {people.map((pr) => {
              const following = followingIds.has(pr.user_id);
              return (
                <div key={pr.user_id} className="shrink-0 w-40 card-warm p-4 text-center">
                  <button onClick={() => openUserProfile(pr.user_id)} className="block mx-auto">
                    <Avatar url={pr.avatar_url} name={pr.full_name} size={56} className="mx-auto" />
                    <p className="text-[13px] font-semibold text-ink-900 truncate mt-2">{pr.full_name}</p>
                    <p className="text-[11px] text-ink-500 truncate">@{pr.username}</p>
                  </button>
                  <button
                    onClick={() => toggleFollow.mutate({ followeeId: pr.user_id })}
                    disabled={toggleFollow.isPending}
                    className={`mt-2.5 w-full inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                      following ? 'bg-neem-700/12 text-neem-800 border border-neem-600/30' : 'bg-saffron-600 text-parchment hover:bg-saffron-700'
                    }`}
                  >
                    {!following && <UserPlus size={11} />}
                    {following ? 'Following' : 'Follow'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Trending media grid */}
      {media.length > 0 && (
        <section>
          <SectionTitle icon={Images} label="Moments trending now" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {media.map((p) => (
              <ImageTile key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* Rising lore */}
      {lore.length > 0 && (
        <section>
          <SectionTitle icon={ScrollText} label="Scrolls worth reading" />
          <div className="mt-3 space-y-2.5">
            {lore.map((p) => (
              <ForgeRow key={p.id} post={p} q="" />
            ))}
          </div>
        </section>
      )}

      <div className="relative overflow-hidden card-warm p-8 text-center">
        <Mandala className="absolute -right-14 -bottom-14 w-52 h-52 text-gold-500/15 animate-spin-slower" />
        <p className="font-display italic text-[16px] text-ink-600 leading-relaxed relative z-10">
          “The library breathes — search a word above, or wander what is blooming below.”
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Flame; label: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-saffron-700">
      <Icon size={13} /> {label}
    </h3>
  );
}
