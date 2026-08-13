import { motion } from 'framer-motion';
import { Images, Feather, MessagesSquare, Plus, UsersRound, Crown } from 'lucide-react';
import Avatar from '../common/Avatar';
import { compact } from '../../lib/format';
import { useMyGroups, type Group } from '../../hooks/queries';
import { useUI } from '../../store/ui';

const KIND = {
  feed: { icon: Images, tint: 'text-saffron-600 bg-saffron-500/15 border-saffron-500/30' },
  forge: { icon: Feather, tint: 'text-neem-700 bg-neem-500/15 border-neem-500/30' },
  thread: { icon: MessagesSquare, tint: 'text-gold-700 bg-gold-500/15 border-gold-500/30' },
} as const;

function CircleRow({ group, onOpen, compactMode }: { group: Group; onOpen: () => void; compactMode?: boolean }) {
  const meta = KIND[group.kind] ?? KIND.feed;
  const Icon = meta.icon;
  return (
    <motion.button
      layout
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-sand-200/60 transition-colors text-left group"
    >
      <div className="relative shrink-0">
        <Avatar url={group.avatar_url} name={group.name} size={compactMode ? 34 : 40} className="!rounded-xl" />
        <span className={`absolute -bottom-1 -right-1 grid place-items-center rounded-full ring-2 ring-parchment border ${meta.tint}`} style={{ width: 18, height: 18 }}>
          <Icon size={9} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-900 truncate group-hover:text-saffron-700 transition-colors flex items-center gap-1.5">
          {group.name}
          {group.my_role === 'admin' && <Crown size={11} className="text-gold-600 shrink-0" />}
        </p>
        <p className="text-[11px] text-ink-500 truncate flex items-center gap-1">
          <UsersRound size={10} /> {compact(group.member_count)} · {group.kind} circle
        </p>
      </div>
    </motion.button>
  );
}

export default function MyCirclesList({ compactMode }: { compactMode?: boolean }) {
  const { data, isLoading } = useMyGroups();
  const openGroup = useUI((s) => s.openGroup);
  const openCreateGroup = useUI((s) => s.openCreateGroup);
  const groups = data?.groups ?? [];

  return (
    <div className="space-y-1">
      {isLoading && (
        <div className="space-y-2 px-2.5 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-10 h-10 !rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-2.5 w-24" />
                <div className="skeleton h-2 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <button
          onClick={() => openCreateGroup('feed')}
          className="w-full rounded-2xl border border-dashed border-sand-300 hover:border-gold-500/60 bg-parchment/50 px-3 py-3 text-left transition-colors"
        >
          <p className="text-[12.5px] font-medium text-ink-700">You haven’t joined a circle yet.</p>
          <p className="text-[11px] text-saffron-700 font-semibold mt-0.5">Found or discover one →</p>
        </button>
      )}

      {groups.map((g) => (
        <CircleRow key={g.id} group={g} compactMode={compactMode} onOpen={() => openGroup(g.id)} />
      ))}

      {groups.length > 0 && (
        <button
          onClick={() => openCreateGroup('feed')}
          className="w-full flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-ink-500 hover:text-saffron-700 hover:bg-sand-200/50 transition-colors"
        >
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-dashed border-sand-300">
            <Plus size={16} />
          </span>
          <span className="text-[12.5px] font-medium">Found a new circle</span>
        </button>
      )}
    </div>
  );
}
