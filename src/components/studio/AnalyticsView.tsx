import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  Bookmark,
  TrendingUp,
  Users,
  CalendarRange,
  Sparkles,
  Hourglass,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStudio, useEditPost, useDeletePost } from '../../hooks/queries';
import { compact } from '../../lib/format';
import Mandala, { LotusMark } from '../common/Mandala';

const SUBLINK = '#studio';

function MiniSpark({ values, color = 'bg-gold-500' }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[2px] h-9 w-full">
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t-sm ${i === values.length - 1 ? 'bg-saffron-500' : color} ${i === values.length - 1 ? 'opacity-100' : 'opacity-60'}`}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ value, max, color = 'bg-saffron-500' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="h-2 rounded-full bg-sand-200/70 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full ${color}`}
      />
    </div>
  );
}

function PostRow({ post, onEdit, onDelete, deleting }: { post: import('../../lib/types').StudioPostStat; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  const eta = post.like_rate_per_day > 1 ? 'gaining' : post.like_rate_per_day > 0.2 ? 'steady' : 'cooling';
  return (
    <motion.article
      layout
      className="card-warm p-3.5 flex gap-3 items-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-neem-900/10 shrink-0">
        {post.media_url ? (
          post.media_type === 'video' ? (
            <video src={post.media_url} className="w-full h-full object-cover" muted />
          ) : (
            <img src={post.media_url} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full grid place-items-center text-ink-500"><Sparkles size={20} /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-900 truncate">
          {post.title || post.caption?.slice(0, 80) || `Scroll #${post.id}`}
        </p>
        <p className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-2">
          <span className="capitalize">{post.kind}</span>·<span>{eta}</span>·<span>{post.like_rate_per_day}/day</span>
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11.5px] text-ink-600">
          <span className="inline-flex items-center gap-1"><Heart size={12} className="text-terra-500" />{compact(post.likes_count)}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{compact(post.comments_count)}</span>
          <span className="inline-flex items-center gap-1"><Bookmark size={12} />{compact(post.saves_count)}</span>
        </div>
      </div>
      <div className="hidden sm:block w-28 shrink-0">
        <MiniSpark values={post.spark} />
        <p className="text-[10px] text-ink-400 text-right mt-1">{compact(post.likes_last_14d)} / 14d</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={onEdit} className="text-[11.5px] font-semibold text-saffron-700 hover:text-saffron-600 px-3 py-1 rounded-lg bg-saffron-500/10 hover:bg-saffron-500/20">Edit</button>
        <button onClick={onDelete} disabled={deleting} className="text-[11.5px] font-semibold text-terra-600 hover:text-terra-700 px-3 py-1 rounded-lg bg-terra-500/10 hover:bg-terra-500/20 disabled:opacity-50">
          {deleting ? 'Burning…' : 'Delete'}
        </button>
      </div>
    </motion.article>
  );
}

function EditModal({ post, onClose }: { post: import('../../lib/types').StudioPostStat; onClose: () => void }) {
  const edit = useEditPost();
  const [caption, setCaption] = useState(post.caption ?? '');
  const [title, setTitle] = useState(post.title ?? '');
  const [summary, setSummary] = useState(post.summary ?? '');
  const [tags, setTags] = useState((post.tags ?? []).join(', '));
  const save = () => {
    edit.mutate(
      {
        id: post.id,
        caption: post.kind === 'visual' ? caption : undefined,
        title: post.kind === 'forge' ? title : undefined,
        summary: post.kind === 'forge' ? summary : undefined,
        tags: tags.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
      },
      { onSuccess: () => onClose() },
    );
  };
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[80] bg-neem-950/60 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[85] grid place-items-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="pointer-events-auto glass-warm rounded-3xl w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto"
        >
          <h3 className="font-display font-semibold text-lg text-neem-950">Re-ink this scroll</h3>
          <p className="text-[11.5px] text-ink-500 mt-0.5">Caption, summary, title and tags. Media is preserved.</p>

          <div className="mt-4 space-y-3">
            {post.kind === 'forge' && (
              <>
                <label className="block">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">Title</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/60" maxLength={220} />
                </label>
                <label className="block">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">Summary</span>
                  <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={400} className="mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/60 resize-none" />
                </label>
              </>
            )}
            {post.kind === 'visual' && (
              <label className="block">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">Caption</span>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={2200} className="mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/60 resize-none" />
              </label>
            )}
            <label className="block">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">Tags (comma separated)</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="poetry, mathematics" className="mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/60" />
            </label>
          </div>

          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="flex-1 rounded-xl border border-sand-300 py-2.5 text-sm font-semibold text-ink-700">Cancel</button>
            <button onClick={save} disabled={edit.isPending} className="flex-1 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-2.5 disabled:opacity-50">
              {edit.isPending ? 'Inking…' : 'Save changes'}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

type Range = '14d' | '90d' | 'year' | 'all';

export default function AnalyticsView() {
  const { data, isLoading, isError } = useStudio();
  const deletePost = useDeletePost();
  const [editing, setEditing] = useState<import('../../lib/types').StudioPostStat | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>('90d');

  const t = data?.totals;
  const byMonth = data?.likesByMonth ?? [];
  const fByMonth = data?.followersByMonth ?? [];
  const lastN = useMemo(() => {
    if (!byMonth.length) return [];
    if (range === '14d') return byMonth.slice(-1);
    if (range === '90d') return byMonth.slice(-3);
    if (range === 'year') return byMonth.slice(-12);
    return byMonth;
  }, [byMonth, range]);

  const likesThisPeriod = lastN.reduce((a, b) => a + b.count, 0);
  const followersThisPeriod = fByMonth.slice(-lastN.length).reduce((a, b) => a + b.count, 0);

  return (
    <div className="px-4 lg:px-6 pt-4 pb-14 space-y-6">
      {editing && <EditModal post={editing} onClose={() => setEditing(null)} />}

      {/* Top KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Sparkles} label="Posts" value={t?.posts} loading={isLoading} />
        <KpiCard icon={Heart} label="Likes" value={t?.likes} loading={isLoading} tone="terra" />
        <KpiCard icon={MessageCircle} label="Reflections" value={t?.comments} loading={isLoading} />
        <KpiCard icon={Users} label="Channels" value={t?.followers} loading={isLoading} tone="gold" />
      </section>

      {/* Engagement timeline */}
      <section className="card-warm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display font-semibold text-lg text-ink-900">Engagement over time</h3>
            <p className="text-[11.5px] text-ink-500 mt-0.5">Likes arriving across the days and months.</p>
          </div>
          <div className="flex rounded-full border border-sand-300 bg-parchment p-1 text-[11.5px] font-semibold">
            {(['14d', '90d', 'year', 'all'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-full transition-colors ${range === r ? 'bg-neem-800 text-parchment' : 'text-ink-600 hover:text-neem-800'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid sm:grid-cols-3 gap-3">
          <Stat label="Likes in window" value={compact(likesThisPeriod)} />
          <Stat label="New channels in window" value={compact(followersThisPeriod)} />
          <Stat label="Avg likes per post" value={t?.posts ? Math.round((t.likes || 0) / Math.max(1, t.posts)) : 0} />
        </div>

        <div className="mt-5 h-48">
          {lastN.length ? (
            <BarChart data={lastN.map((m) => ({ label: m.month ?? '', value: m.count }))} color="bg-saffron-500" />
          ) : (
            <EmptyChart label="No activity in this window yet — keep weaving." />
          )}
        </div>
      </section>

      {/* Channels growth + Pool earning */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="card-warm p-5 lg:col-span-1">
          <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
            <Users size={16} className="text-neem-700" /> Channels joining
          </h3>
          <p className="text-[11.5px] text-ink-500 mt-0.5">New followers, by month.</p>
          <div className="mt-4 h-44">
            {fByMonth.length ? (
              <BarChart data={fByMonth.slice(-12).map((m) => ({ label: m.month ?? '', value: m.count }))} color="bg-neem-500" />
            ) : (
              <EmptyChart label="Your circle is just beginning to form." />
            )}
          </div>
        </div>

        <div className="card-warm p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-saffron-600" /> Pool earnings (Razorpay payouts)
              </h3>
              <p className="text-[11.5px] text-ink-500 mt-0.5">
                $1.00 paid for every 1,000 likes across your pool — paid out via Razorpay payouts.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">Eligible</p>
              <p className={`text-sm font-bold ${data?.eligible ? 'text-neem-700' : 'text-ink-500'}`}>
                {data?.eligible ? 'Open' : 'Locked'}
              </p>
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <Stat label="Likes in pool" value={compact(data?.totals.likes ?? 0)} />
            <Stat label="Channels" value={compact(data?.totals.followers ?? 0)} />
            <Stat label="Earned" value={`$${data?.poolDollars ?? 0}`} tone="gold" />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-[12px] text-ink-600 mb-1.5">
              <span>From 0 → $1k (1,000,000 likes)</span>
              <span>{Math.min(100, Math.round(((data?.totals.likes || 0) / 1_000_000) * 100))}%</span>
            </div>
            <ProgressBar
              value={data?.totals.likes ?? 0}
              max={1_000_000}
              color={data?.eligible ? 'bg-gradient-to-r from-saffron-500 to-gold-500' : 'bg-gold-500/70'}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-600">
            <Hourglass size={14} className="text-gold-600" />
            <span>
              {data?.eligible
                ? 'Withdrawals open. Withdraw your pot from the Payouts sub-tab.'
                : `Need ${1000 - (data?.totals.followers ?? 0)} more channels to unlock the pool.`}
            </span>
          </div>
        </div>
      </section>

      {/* Posts table */}
      <section>
        <h3 className="font-display font-semibold text-ink-900 flex items-center gap-2">
          <CalendarRange size={16} className="text-ink-500" /> Your scrolls
        </h3>
        <p className="text-[11.5px] text-ink-500 mt-0.5">Edit, delete or simply watch each post breathe.</p>
        <div className="mt-3 space-y-2.5">
          {isError && <div className="card-warm p-6 text-center text-sm text-terra-600">The loom fell silent — refresh.</div>}
          {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24 !rounded-2xl" />)}
          {!isLoading && data && data.posts.length === 0 && (
            <div className="card-warm p-10 text-center">
              <Mandala className="w-16 h-16 mx-auto text-sand-400" />
              <p className="mt-3 font-display italic text-ink-600">You haven’t woven a scroll yet — that is your next move.</p>
            </div>
          )}
          {data?.posts.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              onEdit={() => setEditing(p)}
              onDelete={() => {
                setDeletingId(p.id);
                deletePost.mutate(p.id, { onSettled: () => setDeletingId(null) });
              }}
              deleting={deletingId === p.id}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, loading, tone = 'ink' }: { icon: any; label: string; value: number | string | undefined; loading?: boolean; tone?: 'ink' | 'terra' | 'neem' | 'gold' }) {
  const tones = {
    ink: 'text-ink-700 bg-ink-700/10',
    terra: 'text-terra-600 bg-terra-500/12',
    neem: 'text-neem-700 bg-neem-500/12',
    gold: 'text-saffron-700 bg-saffron-500/12',
  } as const;
  return (
    <div className="card-warm p-4 flex flex-col">
      <span className={`grid place-items-center w-9 h-9 rounded-xl ${tones[tone]}`}>
        <Icon size={17} />
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 mt-3 leading-tight min-h-[26px] flex items-end">
        {label}
      </p>
      <p className={`font-display font-semibold text-[26px] leading-none mt-1.5 ${loading ? 'text-ink-300' : 'text-ink-900'}`}>
        {loading ? '—' : value !== undefined ? compact(typeof value === 'number' ? value : Number(value)) : '—'}
      </p>
    </div>
  );
}

function Stat({ label, value, tone = 'ink' }: { label: string; value: string | number; tone?: 'ink' | 'gold' }) {
  return (
    <div className="card-warm !rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className={`font-display font-semibold text-[17px] mt-0.5 ${tone === 'gold' ? 'text-saffron-700' : 'text-ink-900'}`}>{value}</p>
    </div>
  );
}

function BarChart({ data, color = 'bg-saffron-500' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="h-full w-full flex items-end gap-1.5">
      {data.map((d, i) => (
        <div key={d.label + i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="w-full flex-1 flex items-end">
            <div
              className={`w-full ${color} rounded-t-md transition-all`}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 2, opacity: i === data.length - 1 ? 1 : 0.78 }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[9.5px] text-ink-400 truncate w-full text-center">{d.label.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-full grid place-items-center text-center">
      <div>
        <LotusMark className="w-10 h-10 mx-auto text-sand-400" />
        <p className="font-display italic text-ink-500 mt-2 text-[13px]">{label}</p>
      </div>
    </div>
  );
}
