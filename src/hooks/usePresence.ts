import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/*
 * Global online presence. Every signed-in client joins one shared channel and
 * tracks itself; the hook returns the live set of online user ids. A tiny
 * module-level cache keeps the set stable across components without re-joining.
 */
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
const listeners = new Set<(ids: Set<string>) => void>();
let onlineIds = new Set<string>();

function emit() {
  for (const l of listeners) l(new Set(onlineIds));
}

export function usePresence(): Set<string> {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(() => new Set(onlineIds));

  useEffect(() => {
    if (!user) return;
    listeners.add(setIds);
    refCount += 1;

    if (!sharedChannel) {
      sharedChannel = supabase.channel('presence:global', {
        config: { presence: { key: user.id } },
      });
      sharedChannel
        .on('presence', { event: 'sync' }, () => {
          const state = sharedChannel!.presenceState() as Record<string, unknown[]>;
          onlineIds = new Set(Object.keys(state));
          emit();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            sharedChannel!.track({ online_at: new Date().toISOString() });
          }
        });
    }

    return () => {
      listeners.delete(setIds);
      refCount -= 1;
      if (refCount <= 0 && sharedChannel) {
        supabase.removeChannel(sharedChannel);
        sharedChannel = null;
        onlineIds = new Set();
      }
    };
  }, [user]);

  return ids;
}
