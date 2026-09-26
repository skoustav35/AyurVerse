import { motion } from 'framer-motion';
import { Users, Images, Feather, MessagesSquare, Check, Plus } from 'lucide-react';
import Avatar from '../common/Avatar';
import { compact } from '../../lib/format';
import { useJoinGroup, type Group } from '../../hooks/queries';
import { useUI } from '../../store/ui';

const KIND_META = {
  feed: { icon: Images, label: 'Feed circle', tint: 'text-saffron-600 bg-saffron-500/15 border-saffron-500/30' },
  forge: { icon: Feather, label: 'Forge circle', tint: 'text-neem-700 bg-neem-500/15 border-neem-500/30' },
  thread: { icon: MessagesSquare, label: 'Thread circle', tint: 'text-gold-700 bg-gold-500/15 border-gold-500/30' },
} as const;

export default function GroupCard({ group }: { group: Group }) {
  const openGroup = useUI((s) => s.openGroup);
  const join = useJoinGroup();
  const meta = KIND_META[group.kind] ?? KIND_META.feed;
  const Icon = meta.icon;
  const member = !!group.is_member;

  return (
    <motion.div
      layout
      className="card-warm p-4 flex items-start gap-3.5 hover:border-gold-500/40 transition-colors cursor-pointer"
      onClick={() => openGroup(group.id)}
    >
      <div className="relative shrink-0">
        <Avatar url={group.avatar_url} name={group.name} size={52} />
        <span className={`absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full ring-2 ring-parchment border ${meta.tint}`}>
          <Icon size={12} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-[15px] text-neem-950 truncate">{group.name}</h3>
        </div>
        <p className="text-[11px] text-ink-400 mt-0.5 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 border text-[9.5px] font-semibold uppercase tracking-wide ${meta.tint}`}>
            {meta.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={11} /> {compact(group.member_count)}
          </span>
        </p>
        {group.description && <p className="text-[12.5px] text-ink-600 leading-snug mt-1.5 line-clamp-2">{group.description}</p>}
        {group.tags && group.tags.length > 0 && (
          <p className="mt-1.5 text-[11px] font-medium text-saffron-700 space-x-2">
            {group.tags.slice(0, 4).map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (member) openGroup(group.id);
          else join.mutate({ groupId: group.id });
        }}
        disabled={join.isPending}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
          member
            ? 'bg-neem-700/12 text-neem-800 border border-neem-600/30'
            : 'bg-saffron-600 text-parchment hover:bg-saffron-700'
        }`}
      >
        {member ? (
          <>
            <Check size={12} /> Joined
          </>
        ) : (
          <>
            <Plus size={12} /> Join
          </>
        )}
      </button>
    </motion.div>
  );
}
