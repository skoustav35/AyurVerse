import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Wallet,
  AlertCircle,
  Shield,
  Target,
  CalendarRange,
  TrendingUp,
  Trophy,
  Lock,
} from 'lucide-react';
import { usePayouts, useRequestPayout, useStudio } from '../../hooks/queries';
import { timeAgo, compact } from '../../lib/format';

const LIKES_PER_DOLLAR = 1000;
const FOLLOWERS_TO_UNLOCK = 1000;

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en', { month: 'short' });
};

export default function PayoutsView() {
  const { data, isLoading, isError } = usePayouts();
  const { data: studio } = useStudio();
  const request = useRequestPayout();
  if (isError) return <div className="px-6 py-10 text-center text-sm text-terra-600">Could not reach Razorpay.</div>;

  const withdrawable = (data?.withdrawableCents ?? 0) / 100;
  const requested = (data?.requestedCents ?? 0) / 100;
  const earned = (data?.earnedCents ?? 0) / 100;
  const eligible = !!data?.eligible;
  const configured = !!data?.gatewayConfigured;
  const requests = data?.requests ?? [];
  const likesPool = data?.likesPool ?? 0;
  const followers = data?.followerCount ?? 0;

  // Lifetime value of the pool regardless of eligibility gate — "what this is worth".
  const potential = Math.floor(likesPool / LIKES_PER_DOLLAR);

  // Distribute the authoritative earned pot across months by engagement timing,
  // so the month / year curve always reconciles to the real total.
  const byMonth = studio?.likesByMonth ?? [];
  const sumMonthLikes = byMonth.reduce((a, m) => a + m.count, 0);
  const monthEarnings = byMonth.map((m) => ({
    month: m.month ?? '',
    dollars: sumMonthLikes > 0 ? (earned * m.count) / sumMonthLikes : 0,
  }));

  const nowYM = new Date().toISOString().slice(0, 7);
  const nowYear = nowYM.slice(0, 4);
  const thisMonth = monthEarnings.find((m) => m.month === nowYM)?.dollars ?? 0;
  const thisYear = monthEarnings.filter((m) => m.month.startsWith(nowYear)).reduce((a, m) => a + m.dollars, 0);

  // Targets
  const followersToGate = Math.max(0, FOLLOWERS_TO_UNLOCK - followers);
  const likesToNextDollar = (LIKES_PER_DOLLAR - (likesPool % LIKES_PER_DOLLAR)) % LIKES_PER_DOLLAR;
  const nextDollarPct = Math.round(((likesPool % LIKES_PER_DOLLAR) / LIKES_PER_DOLLAR) * 100);

  return (
    <div className="px-4 lg:px-6 pt-4 pb-14 space-y-6">
      {/* ---------------- Earnings header ---------------- */}
      <section className="card-warm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display font-semibold text-xl text-ink-900 flex items-center gap-2">
              <Wallet size={18} className="text-saffron-600" /> Earnings &amp; payouts
            </h3>
            <p className="text-[12.5px] text-ink-500 mt-1">
              $1.00 for every 1,000 likes across your whole video pool — disbursed through{' '}
              <span className="font-semibold text-ink-700">Razorpay payouts</span>. Unlocks at{' '}
              {compact(FOLLOWERS_TO_UNLOCK)} channels.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
              configured ? 'bg-neem-500/15 text-neem-700 border border-neem-600/30' : 'bg-terra-500/15 text-terra-700 border border-terra-500/30'
            }`}
          >
            <Shield size={12} />
            {configured ? 'Live gateway' : 'Gateway keys pending'}
          </span>
        </div>

        {/* Per month / year / all-time */}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <EarnCard icon={CalendarRange} label="This month" value={`$${thisMonth.toFixed(2)}`} accent />
          <EarnCard icon={TrendingUp} label="This year" value={`$${thisYear.toFixed(2)}`} />
          <EarnCard icon={Trophy} label="All-time earned" value={`$${earned.toFixed(2)}`} />
          <EarnCard
            icon={Lock}
            label={eligible ? 'Pool value' : 'Locked pool value'}
            value={`$${potential.toFixed(2)}`}
            muted={!eligible}
          />
        </div>

        {/* Monthly earnings curve */}
        <div className="mt-6">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-2">
            Earnings by month
          </p>
          <div className="h-40">
            {monthEarnings.some((m) => m.dollars > 0) ? (
              <EarnBars data={monthEarnings.slice(-12)} />
            ) : (
              <div className="h-full grid place-items-center text-center">
                <p className="font-display italic text-ink-500 text-[13px]">
                  {eligible
                    ? 'The pot is still filling — your monthly curve will bloom here.'
                    : 'Earnings begin once you cross 1,000 channels.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Targets ---------------- */}
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="card-warm p-5">
          <h4 className="font-display font-semibold text-ink-900 flex items-center gap-2">
            <Target size={15} className="text-neem-700" /> Unlock target
          </h4>
          <p className="text-[12px] text-ink-500 mt-0.5">Payouts open at 1,000 channels.</p>
          <div className="mt-4 flex items-center justify-between text-[12.5px] text-ink-700 mb-1.5">
            <span>{compact(followers)} / {compact(FOLLOWERS_TO_UNLOCK)} channels</span>
            <span className="font-semibold">{Math.min(100, Math.round((followers / FOLLOWERS_TO_UNLOCK) * 100))}%</span>
          </div>
          <Bar value={followers} max={FOLLOWERS_TO_UNLOCK} color={eligible ? 'bg-neem-500' : 'bg-gradient-to-r from-neem-600 to-gold-500'} />
          <p className="text-[12px] mt-3 text-ink-600">
            {eligible ? (
              <span className="inline-flex items-center gap-1.5 text-neem-700 font-semibold">
                <CheckCircle2 size={14} /> Unlocked — you can withdraw below.
              </span>
            ) : (
              <>Just <span className="font-semibold text-ink-800">{compact(followersToGate)}</span> more channels to open the gate.</>
            )}
          </p>
        </div>

        <div className="card-warm p-5">
          <h4 className="font-display font-semibold text-ink-900 flex items-center gap-2">
            <TrendingUp size={15} className="text-saffron-600" /> Next dollar
          </h4>
          <p className="text-[12px] text-ink-500 mt-0.5">Every 1,000 likes in the pool is worth $1.</p>
          <div className="mt-4 flex items-center justify-between text-[12.5px] text-ink-700 mb-1.5">
            <span>{compact(likesPool % LIKES_PER_DOLLAR)} / {compact(LIKES_PER_DOLLAR)} likes</span>
            <span className="font-semibold">{nextDollarPct}%</span>
          </div>
          <Bar value={likesPool % LIKES_PER_DOLLAR} max={LIKES_PER_DOLLAR} color="bg-gradient-to-r from-saffron-500 to-gold-500" />
          <p className="text-[12px] mt-3 text-ink-600">
            <span className="font-semibold text-ink-800">{compact(likesToNextDollar)}</span> more likes earns your next{' '}
            <span className="font-semibold text-saffron-700">$1.00</span>.
          </p>
        </div>
      </section>

      {/* ---------------- Withdraw ---------------- */}
      <section className="card-warm p-6">
        <h3 className="font-display font-semibold text-lg text-ink-900 flex items-center gap-2">
          <Wallet size={16} className="text-saffron-600" /> Withdraw
        </h3>
        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <KPI label="Withdrawable now" value={`$${withdrawable.toFixed(2)}`} accent />
          <KPI label="Already requested" value={`$${requested.toFixed(2)}`} />
          <KPI label="Likes in pool" value={compact(likesPool)} />
        </div>

        <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl border border-sand-300 bg-parchment-deep/50">
          <div>
            <p className="text-[12.5px] font-semibold text-ink-800">
              {eligible
                ? withdrawable > 0
                  ? `$${withdrawable.toFixed(2)} is ready to be sent to your bank via Razorpay payouts.`
                  : 'You are eligible. The pot is still filling — no new money to withdraw right now.'
                : 'The gate opens at 1,000 channels — keep weaving, they will follow.'}
            </p>
            {!configured && (
              <p className="text-[11px] text-ink-500 mt-1.5">
                Add <code className="font-mono">RAZORPAY_KEY_ID</code> and <code className="font-mono">RAZORPAY_KEY_SECRET</code> in Secrets to enable live disbursal. Requests queue locally until then.
              </p>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={!eligible || withdrawable <= 0 || request.isPending}
            onClick={() => request.mutate()}
            className="rounded-full bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm px-6 py-2.5 disabled:opacity-40 hover:brightness-105"
          >
            {request.isPending ? 'Sending…' : `Withdraw $${withdrawable.toFixed(2)}`}
          </motion.button>
        </div>
      </section>

      {/* ---------------- Ledger ---------------- */}
      <section>
        <h3 className="font-display font-semibold text-ink-900">Withdrawals ledger</h3>
        <p className="text-[12px] text-ink-500 mt-0.5">Each entry is a request the loom has placed at Razorpay payouts.</p>
        <div className="mt-3 space-y-2">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 !rounded-2xl" />)}
          {!isLoading && requests.length === 0 && (
            <div className="card-warm p-8 text-center">
              <p className="font-display italic text-ink-600">No withdrawals yet — when the pot is heavy enough, your first request will land here.</p>
            </div>
          )}
          {requests.map((r) => {
            const status =
              r.status === 'paid' ? 'paid' : r.status === 'processing' ? 'processing' : r.status === 'failed' ? 'failed' : 'pending';
            const meta = {
              paid: { icon: CheckCircle2, color: 'text-neem-700', bg: 'bg-neem-500/12', label: 'Paid' },
              processing: { icon: Clock, color: 'text-saffron-700', bg: 'bg-saffron-500/15', label: 'Processing' },
              failed: { icon: AlertCircle, color: 'text-terra-600', bg: 'bg-terra-500/15', label: 'Failed' },
              pending: { icon: Clock, color: 'text-ink-700', bg: 'bg-sand-200/70', label: 'Pending' },
            }[status];
            const Icon = meta.icon;
            return (
              <div key={r.id} className="card-warm p-4 flex items-center gap-3">
                <span className={`grid place-items-center w-9 h-9 rounded-full ${meta.bg}`}>
                  <Icon size={16} className={meta.color} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-ink-900">${(r.amount_cents / 100).toFixed(2)}</p>
                  <p className="text-[11px] text-ink-500 mt-0.5">Requested {timeAgo(r.created_at)}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.bg} ${meta.color}`}>{meta.label}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function EarnCard({ icon: Icon, label, value, accent, muted }: { icon: any; label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={`card-warm p-3.5 ${accent ? 'bg-gradient-to-br from-saffron-500/14 to-gold-400/8 border-saffron-500/40' : ''}`}>
      <Icon size={15} className={accent ? 'text-saffron-700' : muted ? 'text-ink-400' : 'text-ink-600'} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500 mt-2">{label}</p>
      <p className={`font-display font-semibold text-[20px] mt-0.5 ${accent ? 'text-saffron-700' : muted ? 'text-ink-500' : 'text-ink-900'}`}>{value}</p>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`card-warm p-3.5 ${accent ? 'bg-gradient-to-br from-saffron-500/12 to-gold-400/8 border-saffron-500/40' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className={`font-display font-semibold text-[20px] mt-0.5 ${accent ? 'text-saffron-700' : 'text-ink-900'}`}>{value}</p>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="h-2.5 rounded-full bg-sand-200/70 overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className={`h-full ${color}`} />
    </div>
  );
}

function EarnBars({ data }: { data: { month: string; dollars: number }[] }) {
  const max = Math.max(0.01, ...data.map((d) => d.dollars));
  return (
    <div className="h-full w-full flex items-end gap-1.5">
      {data.map((d, i) => (
        <div key={d.month + i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="w-full flex-1 flex items-end" title={`${d.month}: $${d.dollars.toFixed(2)}`}>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-saffron-600 to-gold-400 transition-all"
              style={{ height: `${(d.dollars / max) * 100}%`, minHeight: d.dollars > 0 ? 3 : 0, opacity: i === data.length - 1 ? 1 : 0.8 }}
            />
          </div>
          <span className="text-[9.5px] text-ink-400 truncate w-full text-center">{d.month ? monthLabel(d.month) : ''}</span>
        </div>
      ))}
    </div>
  );
}
