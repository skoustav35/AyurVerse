import { useEffect } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import DesktopShell from './DesktopShell';
import MobileShell from './MobileShell';
import supabase from '../../lib/supabase';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useUI } from '../../store/ui';
import type { FeedPage, Post } from '../../lib/types';

export default function AppShell() {
  const isDesktop = useIsDesktop();
  const openReader = useUI((s) => s.openReader);
  const queryClient = useQueryClient();

  // Deep link: ?post=<id> opens the reader directly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('post');
    if (id && !Number.isNaN(Number(id))) openReader(Number(id));
  }, [openReader]);

  // Live engagement: any like/save/comment count changes propagate into caches
  useEffect(() => {
    const channel = supabase
      .channel('posts-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
        const row = payload.new as Post;
        for (const key of ['posts', 'feed']) {
          queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: [key] }, (old) => {
            if (!old || !('pages' in old)) return old;
            return {
              ...old,
              pages: old.pages.map((pg) => ({
                ...pg,
                items: pg.items.map((p) =>
                  p.id === row.id
                    ? {
                        ...p,
                        likes_count: row.likes_count,
                        saves_count: row.saves_count,
                        comments_count: row.comments_count,
                      }
                    : p,
                ),
              })),
            };
          });
        }
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
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return isDesktop ? <DesktopShell /> : <MobileShell />;
}
