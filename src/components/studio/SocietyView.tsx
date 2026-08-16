import { useQuery } from '@tanstack/react-query';
import { Heart, MessageCircle, Bookmark, UserPlus, Feather, Users, CircleDot, Activity, Radar } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { compact } from '../../lib/format';

interface SocietyData {
  weavers: number;
  kpis: { likes: number; comments: number; saves: number; follows: number; posts: number; circles: number; joins: number };
  timeline: { h: string; likes: number; comments: number }[];
  recent: { actor_name: string; type: string; preview: string | null; created_at: string }[];
  top: { user_id: string; name: string; likes: number }[];
  generated_at: string;
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const ACTION_ICON: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  save: Bookmark,
  follow: UserPlus,
  group_join: Users,
  post: Feather,
  group_create: CircleDot,
};

const ACTION_VERB: Record<string, string> = {
  like: 'appreciated a weave',
  comment: 'left a voice',
  save: 'tucked a scroll into the satchel',
  follow: 'started following',
  group_join: 'joined a circle',
  post: 'forged a scroll',
  group_create: 'founded a circle',
};

export default function SocietyView() {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['society'],
    queryFn: () => apiFetch<SocietyData>('/api/society'),
    refetchInterval: 20_000,
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-warm p-4 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  if (!data || data.weavers === 0) {
    return (
      <div className="card-warm mt-4 p-8 text-center">
        <Radar size={28} className="mx-auto text-sand-400" />
        <p className="font-display text-lg text-ink-900 mt-3">No society is walking the garden yet.</p>
        <p className="text-[13px] text-ink-500 mt-1.5 max-w-sm mx-auto">
          Run <code className="text-saffron-700 bg-sand-200/70 rounded px-1.5 py-0.5 text-[12px]">python ayurverse_society.py provision</code> then <code className="text-saffron-700 bg-sand-200/70 rounded px-1.5 py-0.5 text-[12px]">live</code> locally — this observatory lights up the moment they arrive.
        </p>
      </div>
    );
  }

  const kpis = [
    { label: 'Appreciations', value: data.kpis.likes, Icon: Heart },
    { label: 'Voices', value: data.kpis.comments, Icon: MessageCircle },
    { label: 'Satchel saves', value: data.kpis.saves, Icon: Bookmark },
    { label: 'Follows', value: data.kpis.follows, Icon: UserPlus },
    { label: 'Scrolls forged', value: data.kpis.posts, Icon: Feather },
    { label: 'Circles founded', value: data.kpis.circles, Icon: CircleDot },
    { label: 'Circles joined', value: data.kpis.joins, Icon: Users },
  ];

  const maxPulse = Math.max(1, ...data.timeline.map((b) => b.likes + b.comments));
  const maxTop = Math.max(1, ...data.top.map((t) => t.likes));

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neem-500 opacity-70" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-neem-600" />
          </span>
          <p className="text-[12px] font-semibold text-ink-600">
            {compact(data.weavers)} simulated weavers · live
            {isFetching && <span className="text-gold-600 animate-pulse"> · refreshing</span>}
          </p>
        </div>
        <p className="text-[11px] text-ink-400">as of {ago(data.generated_at)} ago</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {kpis.map(({ label, value, Icon }) => (
          <div key={label} className="card-warm p-3.5">
            <Icon size={15} className="text-saffron-600" />
            <p className="mt-2 text-xl font-display font-semibold text-neem-950">{compact(value)}</p>
            <p className="text-[11px] text-ink-500 mt-0.5">{label}</p>
          </div>
        ))}
        <div className="card-warm p-3.5 bg-gradient-to-br from-neem-800 to-neem-900 !border-neem-700">
          <Activity size={15} className="text-gold-400" />
          <p className="mt-2 text-xl font-display font-semibold text-parchment">{compact(data.kpis.likes + data.kpis.comments + data.kpis.saves + data.kpis.follows)}</p>
          <p className="text-[11px] text-parchment/70 mt-0.5">Total ripples</p>
        </div>
      </div>

      {/* 24h pulse */}
      <div className="card-warm p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-1">Pulse of the last day</p>
        <p className="text-[11px] text-ink-400 mb-3">gold = appreciations · neem = voices</p>
        <div className="flex items-end gap-[3px] h-20">
          {data.timeline.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end gap-[2px] group" title={`${b.h} — ${b.likes} likes, ${b.comments} comments`}>
              <div
                className="w-full rounded-t-[3px] bg-gold-400/85 group-hover:bg-gold-500 transition-colors"
                style={{ height: `${Math.max(2, (b.likes / maxPulse) * 100)}%` }}
              />
              <div
                className="w-full rounded-b-[3px] bg-neem-600/85 group-hover:bg-neem-500 transition-colors"
                style={{ height: `${Math.max(b.comments ? 2 : 0, (b.comments / maxPulse) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-ink-400 mt-1.5">
          <span>{data.timeline[0]?.h}</span>
          <span>{data.timeline[Math.floor(data.timeline.length / 2)]?.h}</span>
          <span>{data.timeline[data.timeline.length - 1]?.h}</span>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        {/* latest moves */}
        <div className="card-warm p-4 md:col-span-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">Latest moves</p>
          <div className="space-y-2.5">
            {data.recent.length === 0 && (
              <p className="text-[13px] italic text-ink-500 py-4 text-center font-display">The atelier is holding its breath.</p>
            )}
            {data.recent.map((r, i) => {
              const Icon = ACTION_ICON[r.type] || Activity;
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-saffron-500/12 text-saffron-700 shrink-0 mt-0.5">
                    <Icon size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-800 leading-snug">
                      <span className="font-semibold">{r.actor_name}</span>{' '}
                      <span className="text-ink-500">{ACTION_VERB[r.type] || r.type.replace(/_/g, ' ')}</span>
                    </p>
                    {r.preview && <p className="text-[11.5px] text-ink-500 truncate mt-0.5">“{r.preview}”</p>}
                  </div>
                  <span className="text-[10.5px] text-ink-400 shrink-0 mt-1">{ago(r.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* most active weavers */}
        <div className="card-warm p-4 md:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-3">Busiest hands</p>
          <div className="space-y-2.5">
            {data.top.length === 0 && (
              <p className="text-[13px] italic text-ink-500 py-4 text-center font-display">Still warming up.</p>
            )}
            {data.top.map((t) => (
              <div key={t.user_id}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="font-medium text-ink-800 truncate">{t.name}</span>
                  <span className="text-ink-400 tabular-nums">{compact(t.likes)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-sand-200 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-saffron-600 to-gold-500" style={{ width: `${(t.likes / maxTop) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
