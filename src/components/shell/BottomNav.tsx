import { motion } from 'framer-motion';
import { Clapperboard, Flame, Home, LibraryBig, Send, CircleUserRound } from 'lucide-react';
import { useUnreadThreadCount } from '../../hooks/queries';
import { useUI, type Tab } from '../../store/ui';

const ITEMS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'feed', label: 'Feed', icon: Home },
  { id: 'reels', label: 'Reels', icon: Clapperboard },
  { id: 'threads', label: 'Threads', icon: Send },
  { id: 'search', label: 'Library', icon: LibraryBig },
  { id: 'forge', label: 'Forge', icon: Flame },
  { id: 'profile', label: 'You', icon: CircleUserRound },
];

export default function BottomNav() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const unread = useUnreadThreadCount();

  return (
    <nav className="app-bottom-nav shrink-0 relative z-30 border-t border-gold-500/20 bg-black/60 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-5px_rgba(0,0,0,0.8)]">
      <div className="grid grid-cols-6 items-center px-1 pt-1 pb-1">
        {ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={tab === item.id}
            badge={item.id === 'threads' ? unread : 0}
            onClick={() => setTab(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: { id: Tab; label: string; icon: typeof Home };
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 py-1.5" aria-label={item.label}>
      <motion.span whileTap={{ scale: 0.8 }} className="relative grid place-items-center">
        <Icon
          size={21}
          strokeWidth={active ? 2.4 : 1.7}
          className={`${active ? 'text-saffron-600' : 'text-ink-500'} ${item.id === 'threads' ? '-rotate-12' : ''}`}
        />
        {badge > 0 && (
          <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-terra-500 text-parchment text-[9px] font-bold ring-2 ring-parchment">
            {badge}
          </span>
        )}
        {active && (
          <motion.span
            layoutId="nav-pillow"
            className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-saffron-500/16 via-gold-400/12 to-transparent border border-saffron-500/25"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
      </motion.span>
      <span className={`text-[8.5px] tracking-wide ${active ? 'text-neem-900 font-semibold' : 'text-ink-400'}`}>
        {item.label}
      </span>
    </button>
  );
}
