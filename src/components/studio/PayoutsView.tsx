import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Wallet, AlertCircle, Shield } from 'lucide-react';
import { usePayouts, useRequestPayout } from '../../hooks/queries';
import { timeAgo } from '../../lib/format';

export default function PayoutsView() {
  const { data, isLoading, isError } = usePayouts();
  const request = useRequestPayout();
  if (isError) return <div className="px-6 py-10 text-center text-sm text-terra-600">Could not reach Razorpay.</div>;

  const withdrawable = (data?.withdrawableCents ?? 0) / 100;
  const requested = (data?.requestedCents ?? 0) / 100;
  const earned = (data?.earnedCents ?? 0) / 100;
  const eligible = !!data?.eligible;
  const configured = !!data?.gatewayConfigured;
  const requests = data?.requests ?? [];

  return (
    <div className="px-4 lg:px-6 pt-4 pb-14 space-y-6">
      <section className="card-warm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display font-semibold text-xl text-ink-900 flex items-center gap-2">
              <Wallet size={18} className="text-saffron-600" /> Razorpay payouts
            </h3>
            <p className="text-[12.5px] text-ink-500 mt-1">
              $1.00 paid for every 1,000 likes across your pool. Minimum: 1,000 channels.
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

        <div className="mt-5 grid sm:grid-cols-4 gap-3">
          <KPI label="Withdrawable" value={`$${withdrawable.toFixed(2)}`} accent />
          <KPI label="Already requested" value={`$${requested.toFixed(2)}`} />
          <KPI label="Earned" value={`$${earned.toFixed(2)}`} />
          <KPI label="Likes in pool" value={data?.likesPool ?? 0} />
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

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`card-warm p-3.5 ${accent ? 'bg-gradient-to-br from-saffron-500/12 to-gold-400/8 border-saffron-500/40' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className={`font-display font-semibold text-[20px] mt-0.5 ${accent ? 'text-saffron-700' : 'text-ink-900'}`}>{value}</p>
    </div>
  );
}
