import { useEffect } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import DesktopShell from './DesktopShell';
import MobileShell from './MobileShell';
import NotificationsPanel from '../notifications/NotificationsPanel';
import FeedTuner from '../feed/FeedTuner';
import GroupView from '../groups/GroupView';
import CreateGroupModal from '../groups/CreateGroupModal';
import CirclesDrawer from '../groups/CirclesDrawer';
import HashtagView from '../search/HashtagView';
import supabase from '../../lib/supabase';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import type { FeedPage, Post } from '../../lib/types';

export default function AppShell() {
  const isDesktop = useIsDesktop();
  const openReader = useUI((s) => s.openReader);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Live notifications: a new row for me → refresh the bell
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notif-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Deep link: ?post=<id> opens the reader directly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('post');
    if (id && !Number.isNaN(Number(id))) openReader(Number(id));
  }, [openReader]);

  // Live engagement: any like/save/comment count changes propagate into caches
  // Live engagement: like/save/comment counts fan out from postgres_changes.
  // Under real load that channel fires in bursts — so events are buffered and
  // the query cache is rewritten at most once every 220ms, never per-row.
  useEffect(() => {
    const pending = new Map<number, Post>();
    let flushTimer: number | undefined;

    const flush = () => {
      flushTimer = undefined;
      if (!pending.size) return;
      const rows = new Map(pending);
      pending.clear();

      const countsOf = (p: Post) => {
        const hit = rows.get(p.id);
        return hit
          ? { likes_count: hit.likes_count, saves_count: hit.saves_count, comments_count: hit.comments_count }
          : null;
      };

      for (const key of ['posts', 'feed']) {
        queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: [key] }, (old) => {
          if (!old || !('pages' in old)) return old;
          let touched = false;
          const pages = old.pages.map((pg) => {
            let pt = false;
            const items = pg.items.map((p) => {
              const c = countsOf(p);
              if (c) {
                pt = true;
                return { ...p, ...c };
              }
              return p;
            });
            if (pt) touched = true;
            return pt ? { ...pg, items } : pg;
          });
          return touched ? { ...old, pages } : old;
        });
      }
      for (const row of rows.values()) {
        queryClient.setQueryData<Post>(['post', row.id], (old) =>
          old
            ? {
                ...old,
                likes_count: row.likes_count,
                saves_count: row.saves_count,
                comments_count: row.comments_count,
              }
            : old,
        );
      }
    };

    const channel = supabase
      .channel('posts-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
        const row = payload.new as Post;
        pending.set(row.id, row);
        if (!flushTimer) flushTimer = window.setTimeout(flush, 220);
      })
      .subscribe();

    return () => {
      if (flushTimer) window.clearTimeout(flushTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <>
      {isDesktop ? <DesktopShell /> : <MobileShell />}
      <NotificationsPanel />
      <FeedTuner />
      <GroupView />
      <CreateGroupModal />
      <CirclesDrawer />
      <HashtagView />
    </>
  );
}
