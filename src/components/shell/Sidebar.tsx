import { motion } from 'framer-motion';
import { Clapperboard, Flame, Home, LibraryBig, LogOut, Plus, Send, CircleUserRound } from 'lucide-react';
import { LotusMark } from '../common/Mandala';
import Avatar from '../common/Avatar';
import supabase from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useUnreadThreadCount } from '../../hooks/queries';
import { useUI, type Tab } from '../../store/ui';

const NAV: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'feed', label: 'The Feed', icon: Home },
  { id: 'reels', label: 'Reels', icon: Clapperboard },
  { id: 'forge', label: 'The Forge', icon: Flame },
  { id: 'search', label: 'The Library', icon: LibraryBig },
  { id: 'threads', label: 'Golden Threads', icon: Send },
  { id: 'profile', label: 'You', icon: CircleUserRound },
];

export default function Sidebar() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const setComposerOpen = useUI((s) => s.setComposerOpen);
  const unread = useUnreadThreadCount();
  const { user } = useAuth();

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.email?.split('@')[0] || 'weaver';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <aside className="w-[248px] xl:w-[272px] shrink-0 h-full flex flex-col border-r border-sand-300/70 bg-parchment/80 backdrop-blur-sm relative z-10">
      <button onClick={() => setTab('feed')} className="flex items-center gap-3 px-6 pt-7 pb-6 group text-left">
        <span className="text-gold-600 transition-transform duration-500 group-hover:rotate-[20deg]">
          <LotusMark className="w-9 h-9" />
        </span>
        <span>
          <span className="block font-display font-bold text-[22px] leading-none text-neem-900 tracking-tight">
            Ayur<span className="text-saffron-600">Verse</span>
          </span>
          <span className="block text-[9.5px] uppercase tracking-[0.28em] text-ink-400 mt-1.5">feed · forge · lore</span>
        </span>
      </button>

      <nav className="flex-1 px-3.5 space-y-1.5">
        {NAV.map((item) => {
          const active = tab === item.id;
          const Icon = item.icon;
          const badge = item.id === 'threads' ? unread : 0;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`relative w-full flex items-center gap-3.5 rounded-2xl px-4 py-3 text-[14px] transition-all duration-200 group ${
                active ? 'text-neem-950 font-semibold' : 'text-ink-600 hover:text-neem-900 hover:translate-x-1'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-pillow"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-saffron-500/16 via-gold-400/12 to-transparent border border-saffron-500/25"
                />
              )}
              <span className="relative z-10">
                <Icon
                  size={21}
                  strokeWidth={active ? 2.3 : 1.8}
                  className={`transition-colors ${item.id === 'threads' ? '-rotate-12' : ''} ${active ? 'text-saffron-600' : 'group-hover:text-neem-700'}`}
                />
              </span>
              <span className="relative z-10">{item.label}</span>
              {badge > 0 && (
                <span className="relative z-10 ml-auto min-w-[20px] h-5 px-1.5 grid place-items-center rounded-full bg-saffron-600 text-parchment text-[10.5px] font-bold shadow-[0_4px_12px_-4px_rgba(217,111,16,0.7)]">
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setComposerOpen(true)}
          className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-parchment bg-gradient-to-r from-saffron-600 via-saffron-500 to-gold-500 shadow-[0_10px_28px_-10px_rgba(217,111,16,0.55)] hover:shadow-[0_14px_34px_-10px_rgba(217,111,16,0.7)] hover:brightness-105 transition-all"
        >
          <Plus size={18} strokeWidth={2.5} />
          Weave a Post
        </motion.button>
      </nav>

      <div className="px-4 pb-5">
        <div className="card-warm !rounded-2xl p-3 flex items-center gap-3">
          <Avatar url={avatarUrl} name={displayName} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink-900 truncate">{displayName}</p>
            <p className="text-[11px] text-ink-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 rounded-xl text-ink-400 hover:text-terra-600 hover:bg-terra-500/10 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
