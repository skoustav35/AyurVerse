import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket,
  Users,
  Heart,
  Eye,
  MousePointerClick,
  Target,
  TrendingUp,
  Sparkles,
  Check,
  Minus,
  Plus,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useBoosts, useCreateBoost, type Boost } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { compact, timeAgo } from '../../lib/format';
import type { Post } from '../../lib/types';
import Mandala from '../common/Mandala';

const PRICE = 5;

export default function BoostView() {
  const { user } = useAuth();
  const { data, isLoading } = useBoosts();
  const create = useCreateBoost();

  const [target, setTarget] = useState<'post' | 'channel'>('channel');
  const [postId, setPostId] = useState<number | null>(null);
  const [packages, setPackages] = useState(1);

  // the creator's own posts to pick from (any post can be boosted, media or not)
  const { data: myPosts, isLoading: postsLoading } = useQuery({
    queryKey: ['my-posts', user?.id],
    enabled: !!user,
    queryFn: () => apiFetch<{ items: Post[] }>(`/api/posts?author=${user!.id}&limit=30`),
  });
  const posts = myPosts?.items ?? [];

  // auto-select the first post when entering post mode so the button is live
  useEffect(() => {
    if (target === 'post' && postId === null && posts.length > 0) {
      setPostId(posts[0].id);
    }
  }, [target, postId, posts]);

  const goalUnits = packages * (target === 'channel' ? 300 : 1000);
  const total = packages * PRICE;
  const configured = data?.gatewayConfigured;

  const boosts = data?.boosts ?? [];
  const active = boosts.filter((b) => b.status === 'active');
  const past = boosts.filter((b) => b.status !== 'active');

  const canBuy = target === 'channel' || (target === 'post' && !!postId);

  const buy = () => {
    if (!canBuy) return;
    create.mutate(
      { target_type: target, post_id: target === 'post' ? postId ?? undefined : undefined, packages },
      { onSuccess: () => { setPackages(1); } },
    );
  };

  const totals = useMemo(() => {
    return boosts.reduce(
      (a, b) => ({ imp: a.imp + b.impressions, clk: a.clk + b.clicks, lk: a.lk + b.likes_gained, fol: a.fol + b.followers_gained }),
      { imp: 0, clk: 0, lk: 0, fol: 0 },
    );
  }, [boosts]);
  const avgCtr = totals.imp > 0 ? Math.round((totals.clk / totals.imp) * 10000) / 100 : 0;

  return (
    <div className="px-4 lg:px-6 pt-4 pb-14 space-y-6">
      {/* headline */}
      <section className="relative overflow-hidden card-warm p-6 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(217,111,16,0.12),transparent_55%)]">
        <Mandala className="absolute -right-12 -top-12 w-44 h-44 text-gold-500/15 animate-spin-slower pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-saffron-500 to-gold-500 text-parchment shadow-[0_8px_20px_-8px_rgba(217,111,16,0.7)]">
            <Rocket size={20} />
          </span>
          <div>
            <h3 className="font-display font-semibold text-xl text-ink-900">Amplify your reach</h3>
            <p className="text-[12.5px] text-ink-500 mt-0.5">
              $5 per package · a channel push targets <b>+300 followers</b>, a post push targets <b>+1,000 likes</b>.
            </p>
          </div>
        </div>
        {boosts.length > 0 && (
          <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat icon={Eye} label="Impressions" value={compact(totals.imp)} />
            <MiniStat icon={MousePointerClick} label="Clicks" value={compact(totals.clk)} />
            <MiniStat icon={Target} label="Avg CTR" value={`${avgCtr}%`} tone="gold" />
            <MiniStat icon={TrendingUp} label="Gained" value={`+${compact(totals.lk + totals.fol)}`} tone="neem" />
          </div>
        )}
      </section>

      {/* create a boost */}
      <section className="card-warm p-6">
        <h3 className="font-display font-semibold text-lg text-ink-900 flex items-center gap-2">
          <Sparkles size={16} className="text-saffron-600" /> Launch a boost
        </h3>

        {/* target toggle */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              { id: 'channel', label: 'Boost my channel', hint: '+300 followers / package', icon: Users },
              { id: 'post', label: 'Boost a post', hint: '+1,000 likes / package', icon: Heart },
            ] as const
          ).map((t) => {
            const activeT = target === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTarget(t.id)}
                className={`relative rounded-2xl border p-4 text-left transition-colors ${
                  activeT ? 'border-saffron-500/70 bg-saffron-500/10' : 'border-sand-300 hover:border-gold-500/50 bg-parchment/60'
                }`}
              >
                <t.icon size={18} className={activeT ? 'text-saffron-600' : 'text-ink-400'} />
                <p className={`text-[13.5px] font-semibold mt-2 ${activeT ? 'text-neem-900' : 'text-ink-700'}`}>{t.label}</p>
                <p className="text-[10.5px] text-ink-500 mt-0.5">{t.hint}</p>
                {activeT && (
                  <span className="absolute top-3 right-3 grid place-items-center w-5 h-5 rounded-full bg-saffron-600 text-parchment">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* post picker — any post can be boosted (media or lore) */}
        {target === 'post' && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-2">Choose a post</p>
            {postsLoading ? (
              <div className="flex gap-2.5">
                {[0, 1, 2].map((i) => <div key={i} className="skeleton w-20 h-20 !rounded-xl" />)}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sand-300 bg-parchment/50 px-4 py-4 text-center">
                <p className="text-[12.5px] text-ink-500">You haven’t woven a post yet.</p>
                <p className="text-[11px] text-ink-400 mt-0.5">Publish a post first, or boost your whole channel instead.</p>
              </div>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {posts.map((p) => {
                  const selected = postId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPostId(p.id)}
                      title={p.title || p.caption || `Post #${p.id}`}
                      className={`relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                        selected ? 'border-saffron-500' : 'border-transparent hover:border-gold-500/50'
                      }`}
                    >
                      {p.media_url ? (
                        p.media_type === 'video' ? (
                          <video src={p.media_url} muted className="w-full h-full object-cover" />
                        ) : (
                          <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <span className="w-full h-full grid place-items-center p-1.5 bg-gradient-to-br from-neem-800 to-neem-700 text-center">
                          <span className="text-[9px] font-semibold text-parchment leading-tight line-clamp-3">
                            {p.title || 'Lore'}
                          </span>
                        </span>
                      )}
                      {selected && (
                        <span className="absolute inset-0 bg-saffron-600/25 grid place-items-center">
                          <span className="grid place-items-center w-6 h-6 rounded-full bg-saffron-600 text-parchment"><Check size={13} /></span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* packages stepper */}
        <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-sand-300 bg-parchment/60 p-4">
          <div>
            <p className="text-[12.5px] font-semibold text-ink-800">Packages</p>
            <p className="text-[11px] text-ink-500">
              Goal: <span className="font-semibold text-saffron-700">+{compact(goalUnits)} {target === 'channel' ? 'followers' : 'likes'}</span> reach
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setPackages((n) => Math.max(1, n - 1))} className="grid place-items-center w-9 h-9 rounded-full border border-sand-300 text-ink-600 hover:bg-sand-200/60"><Minus size={15} /></button>
            <span className="font-display font-semibold text-[22px] text-ink-900 w-8 text-center">{packages}</span>
            <button onClick={() => setPackages((n) => Math.min(20, n + 1))} className="grid place-items-center w-9 h-9 rounded-full border border-sand-300 text-ink-600 hover:bg-sand-200/60"><Plus size={15} /></button>
          </div>
        </div>

        {/* pay */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-ink-500">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border ${configured ? 'bg-neem-500/15 text-neem-700 border-neem-600/30' : 'bg-terra-500/15 text-terra-700 border-terra-500/30'}`}>
              <ShieldCheck size={12} /> {configured ? 'Razorpay live' : 'Razorpay test mode'}
            </span>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-1">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={buy}
              disabled={!canBuy || create.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm px-7 py-3 disabled:opacity-40 hover:brightness-105"
            >
              <Rocket size={16} />
              {create.isPending ? 'Launching…' : `Pay $${total.toFixed(2)} & boost`}
            </motion.button>
            {target === 'post' && !postId && posts.length > 0 && (
              <p className="text-[10.5px] text-terra-600 text-center sm:text-right">Select a post above to continue</p>
            )}
          </div>
        </div>
      </section>

      {/* active boosts */}
      <section>
        <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <Radio size={16} className="text-neem-700" /> Live boosts
        </h3>
        <div className="mt-3 space-y-3">
          {isLoading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-28 !rounded-2xl" />)}
          {!isLoading && active.length === 0 && (
            <div className="card-warm p-8 text-center">
              <Rocket className="mx-auto text-sand-400" size={26} />
              <p className="font-display italic text-ink-600 mt-2">No live boosts — launch one above to light up the feed.</p>
            </div>
          )}
          {active.map((b) => <BoostCard key={b.id} boost={b} />)}
        </div>
      </section>

      {/* past boosts */}
      {past.length > 0 && (
        <section>
          <h3 className="font-display font-semibold text-ink-900">Past boosts</h3>
          <div className="mt-3 space-y-3">
            {past.map((b) => <BoostCard key={b.id} boost={b} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone = 'ink' }: { icon: any; label: string; value: string; tone?: 'ink' | 'gold' | 'neem' }) {
  const tint = tone === 'gold' ? 'text-saffron-700' : tone === 'neem' ? 'text-neem-700' : 'text-ink-700';
  return (
    <div className="rounded-xl border border-sand-300 bg-parchment/70 p-3">
      <Icon size={14} className={tint} />
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-500 mt-1.5">{label}</p>
      <p className={`font-display font-semibold text-[18px] mt-0.5 ${tint}`}>{value}</p>
    </div>
  );
}

function BoostCard({ boost: b }: { boost: Boost }) {
  const isChannel = b.target_type === 'channel';
  const label = isChannel ? 'Channel boost' : b.post?.title || b.post?.caption?.slice(0, 40) || `Post #${b.post_id}`;
  const statusMeta = {
    active: { tint: 'bg-neem-500/15 text-neem-700 border-neem-600/30', label: 'Live' },
    completed: { tint: 'bg-gold-500/15 text-gold-700 border-gold-500/30', label: 'Completed' },
    pending: { tint: 'bg-sand-200/70 text-ink-600 border-sand-300', label: 'Pending' },
    expired: { tint: 'bg-ink-700/10 text-ink-500 border-ink-700/20', label: 'Expired' },
  }[b.status];

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-warm p-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-saffron-500/20 to-gold-400/15 text-saffron-600 shrink-0">
          {isChannel ? <Users size={18} /> : <Heart size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-semibold text-ink-900 truncate">{label}</p>
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${statusMeta.tint}`}>
              {b.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-neem-500 animate-pulse" />}
              {statusMeta.label}
            </span>
          </div>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {b.packages} package{b.packages > 1 ? 's' : ''} · ${(b.amount_cents / 100).toFixed(2)} · started {timeAgo(b.starts_at)}
          </p>
        </div>
      </div>

      {/* metrics */}
      <div className="mt-3.5 grid grid-cols-4 gap-2">
        <Metric icon={Eye} label="Views" value={compact(b.impressions)} />
        <Metric icon={MousePointerClick} label="Clicks" value={compact(b.clicks)} />
        <Metric icon={Target} label="CTR" value={`${b.ctr}%`} tone="gold" />
        <Metric
          icon={isChannel ? Users : Heart}
          label={isChannel ? 'Followers' : 'Likes'}
          value={`+${compact(b.goal_gained)}`}
          tone="neem"
        />
      </div>

      {/* progress to goal */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between text-[11px] text-ink-600 mb-1.5">
          <span>Progress to +{compact(b.goal_units)} {isChannel ? 'followers' : 'likes'}</span>
          <span className="font-semibold">{b.progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-sand-200/70 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${b.progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-saffron-500 to-gold-500"
          />
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ icon: Icon, label, value, tone = 'ink' }: { icon: any; label: string; value: string; tone?: 'ink' | 'gold' | 'neem' }) {
  const tint = tone === 'gold' ? 'text-saffron-700' : tone === 'neem' ? 'text-neem-700' : 'text-ink-700';
  return (
    <div className="rounded-xl bg-parchment-deep/50 border border-sand-300/70 p-2.5 text-center">
      <Icon size={13} className={`mx-auto ${tint}`} />
      <p className={`font-display font-semibold text-[15px] mt-1 ${tint}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-[0.12em] text-ink-400 mt-0.5">{label}</p>
    </div>
  );
}
