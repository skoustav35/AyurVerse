import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useUI } from '../store/ui';
import type {
  ChatMessage,
  Comment,
  FeedPage,
  PayoutsResponse,
  Post,
  Profile,
  StatusChannel,
  StudioAnalytics,
  Thread,
} from '../lib/types';

export function useFeed(kind?: 'forge') {
  return useInfiniteQuery({
    queryKey: ['feed', { kind: kind ?? null }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch<FeedPage>(`/api/feed?offset=${pageParam}&limit=8${kind ? '&kind=forge' : ''}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
}

export function usePost(id: number | null) {
  return useQuery({
    queryKey: ['post', id],
    enabled: id !== null,
    queryFn: () => apiFetch<Post>(`/api/posts?id=${id}`),
  });
}

export function useTopPosts() {
  return useQuery({
    queryKey: ['posts', 'top'],
    queryFn: () => apiFetch<FeedPage>('/api/posts?sort=top&limit=6'),
  });
}

export function useStories() {
  return useQuery({
    queryKey: ['stories'],
    queryFn: () => apiFetch<StatusChannel[]>('/api/stories'),
    staleTime: 60_000,
  });
}

export function useWeavers() {
  return useQuery({
    queryKey: ['profiles', 'rail'],
    queryFn: () => apiFetch<Profile[]>('/api/profiles?limit=6'),
    staleTime: 60_000,
  });
}

export function useSavedPosts(enabled: boolean) {
  return useQuery({
    queryKey: ['saved'],
    enabled,
    queryFn: () => apiFetch<{ items: Post[] }>('/api/saves?full=1'),
  });
}

export function useComments(postId: number | null) {
  return useQuery({
    queryKey: ['comments', postId],
    enabled: postId !== null,
    queryFn: () => apiFetch<Comment[]>(`/api/comments?post_id=${postId}`),
  });
}

function patchPostInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: number,
  patch: (p: Post) => Post,
) {
  for (const key of ['posts', 'feed']) {
    queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: [key] }, (old) => {
      if (!old || !('pages' in old)) return old;
      return {
        ...old,
        pages: old.pages.map((pg) => ({
          ...pg,
          items: pg.items.map((p) => (p.id === postId ? patch(p) : p)),
        })),
      };
    });
  }
  queryClient.setQueryData<Post>(['post', postId], (old) => (old ? patch(old) : old));
  queryClient.setQueryData<{ items: Post[] }>(['saved'], (old) =>
    old ? { items: old.items.map((p) => (p.id === postId ? patch(p) : p)) } : old,
  );
  queryClient.setQueryData<Post[]>(['reels'], (old) => (old ? old.map((p) => (p.id === postId ? patch(p) : p)) : old));
  queryClient.setQueryData<Post[]>(['reels'], (old) =>
    old ? old.map((p) => (p.id === postId ? patch(p) : p)) : old,
  );
  queryClient.setQueryData<StudioAnalytics>(['studio'], (old) =>
    old
      ? {
          ...old,
          posts: old.posts.map((p) => (p.id === postId ? { ...p, likes_count: (patch(p as any) as Post).likes_count } : p)),
          totals: { ...old.totals, likes: old.totals.likes + (patch({ likes_count: 0 } as Post).likes_count || 0) },
        }
      : old,
  );
}

export function useToggleLike() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async ({ postId }: { postId: number }) =>
      apiFetch<{ liked: boolean; likes_count: number }>('/api/likes', {
        method: 'POST',
        body: JSON.stringify({ post_id: postId }),
      }),
    onMutate: async ({ postId }) => {
      patchPostInCaches(queryClient, postId, (p) => ({
        ...p,
        liked: !p.liked,
        likes_count: Math.max(0, p.likes_count + (p.liked ? -1 : 1)),
      }));
    },
    onSuccess: (data, { postId }) => {
      patchPostInCaches(queryClient, postId, (p) => ({ ...p, liked: data.liked, likes_count: data.likes_count }));
    },
    onError: (err, { postId }) => {
      patchPostInCaches(queryClient, postId, (p) => ({
        ...p,
        liked: !p.liked,
        likes_count: Math.max(0, p.likes_count + (p.liked ? -1 : 1)),
      }));
      pushToast(err.message, 'error');
    },
  });
}

export function useToggleSave() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async ({ postId }: { postId: number }) =>
      apiFetch<{ saved: boolean; saves_count: number }>('/api/saves', {
        method: 'POST',
        body: JSON.stringify({ post_id: postId }),
      }),
    onSuccess: (data, { postId }) => {
      patchPostInCaches(queryClient, postId, (p) => ({ ...p, saved: data.saved, saves_count: data.saves_count }));
      queryClient.invalidateQueries({ queryKey: ['saved'] });
      pushToast(data.saved ? 'Kept in your apothecary' : 'Removed from your apothecary', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useAddComment(postId: number) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (body: string) =>
      apiFetch<{ comment: Comment; comments_count: number }>('/api/comments', {
        method: 'POST',
        body: JSON.stringify({ post_id: postId, body }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData<Comment[]>(['comments', postId], (old) =>
        old ? [...old, data.comment] : [data.comment],
      );
      patchPostInCaches(queryClient, postId, (p) => ({ ...p, comments_count: data.comments_count }));
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useDeleteComment(postId: number) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (id: number) =>
      apiFetch<{ comments_count: number }>('/api/comments', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      }),
    onSuccess: (data, id) => {
      queryClient.setQueryData<Comment[]>(['comments', postId], (old) =>
        old ? old.filter((c) => c.id !== id) : old,
      );
      patchPostInCaches(queryClient, postId, (p) => ({ ...p, comments_count: data.comments_count }));
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useFollows() {
  return useQuery({
    queryKey: ['follows'],
    queryFn: () => apiFetch<{ ids: string[] }>('/api/follows'),
    staleTime: 60_000,
  });
}

export function useToggleFollow() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async ({ followeeId }: { followeeId: string }) =>
      apiFetch<{ following: boolean }>('/api/follows', {
        method: 'POST',
        body: JSON.stringify({ followee_id: followeeId }),
      }),
    onSuccess: (data, { followeeId }) => {
      queryClient.setQueryData<{ ids: string[] }>(['follows'], (old) => {
        const ids = old?.ids ?? [];
        return {
          ids: data.following ? [...new Set([...ids, followeeId])] : ids.filter((i) => i !== followeeId),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['taste'] });
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      pushToast(data.following ? 'Channel added — their threads now rise in your feed' : 'Channel left', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useUserProfile(userId: string | null) {
  return useQuery({
    queryKey: ['user-profile', userId],
    enabled: userId !== null,
    queryFn: () => apiFetch<Profile | null>(`/api/profiles?user_id=${userId}`),
  });
}

export function useUserPosts(userId: string | null) {
  return useQuery({
    queryKey: ['user-posts', userId],
    enabled: userId !== null,
    queryFn: () => apiFetch<{ items: Post[] }>(`/api/posts?author=${userId}&limit=30`),
  });
}

export function useDeleteMessage(conversationId: number) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (id: number) =>
      apiFetch('/api/messages', { method: 'DELETE', body: JSON.stringify({ id }) }),
    onSuccess: (_d, id) => {
      queryClient.setQueryData<ChatMessage[]>(['messages', conversationId], (old) =>
        old ? old.filter((m) => m.id !== id) : old,
      );
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      pushToast('Unsent — the thread forgets', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useThreads(enabled = true) {
  return useQuery({
    queryKey: ['threads'],
    queryFn: () => apiFetch<Thread[]>('/api/threads'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useUnreadThreadCount() {
  const { data } = useThreads(true);
  return (data ?? []).reduce((acc, t) => acc + t.unread_count, 0);
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: conversationId !== null,
    queryFn: () => apiFetch<ChatMessage[]>(`/api/messages?conversation_id=${conversationId}`),
  });
}

export function useSendMessage(conversationId: number) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: {
      type: 'text' | 'image' | 'voice' | 'sticker' | 'post';
      body?: string;
      media_url?: string;
      post_id?: number;
    }) =>
      apiFetch<ChatMessage>('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, ...payload }),
      }),
    onSuccess: (m) => {
      queryClient.setQueryData<ChatMessage[]>(['messages', conversationId], (old) =>
        old ? [...old, m] : [m],
      );
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useReactToMessage(conversationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) =>
      apiFetch<ChatMessage>('/api/messages', {
        method: 'PUT',
        body: JSON.stringify({ message_id: messageId, emoji }),
      }),
    onSuccess: (m) => {
      queryClient.setQueryData<ChatMessage[]>(['messages', conversationId], (old) =>
        old ? old.map((x) => (x.id === m.id ? { ...x, reactions: m.reactions } : x)) : old,
      );
    },
  });
}

export function useMarkThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: number) =>
      apiFetch('/api/threads', { method: 'PUT', body: JSON.stringify({ conversation_id: conversationId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
    onError: () => undefined,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: { member_ids: string[]; name?: string | null }) =>
      apiFetch<{ id: number; existing: boolean }>('/api/threads', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      if (data.existing) pushToast('That thread already hummed — reopened it', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useStudio() {
  return useQuery({
    queryKey: ['studio'],
    queryFn: () => apiFetch<StudioAnalytics>('/api/analytics'),
    staleTime: 60_000,
  });
}

export function usePayouts() {
  return useQuery({
    queryKey: ['payouts'],
    queryFn: () => apiFetch<PayoutsResponse>('/api/payouts'),
    staleTime: 60_000,
  });
}

export function useRequestPayout() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async () => apiFetch<{ request: { id: number; amount_cents: number }; note: string }>('/api/payouts', { method: 'POST' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      pushToast(`Payout queued for $${(res.request.amount_cents / 100).toFixed(2)}`, 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useEditPost() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: { id: number; caption?: string; title?: string; summary?: string; location?: string | null; tags?: string[] }) =>
      apiFetch<Post>('/api/posts', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ['studio'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      queryClient.setQueryData<Post>(['post', post.id], post);
      pushToast('The scroll has been re-inked', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (id: number) => apiFetch<{ ok: true }>('/api/posts', { method: 'DELETE', body: JSON.stringify({ id }) }),
    onSuccess: (_d, id) => {
      queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['posts'] }, (old) => {
        if (!old || !('pages' in old)) return old;
        return {
          ...old,
          pages: old.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== id) })),
        };
      });
      queryClient.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] }, (old) => {
        if (!old || !('pages' in old)) return old;
        return {
          ...old,
          pages: old.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== id) })),
        };
      });
      queryClient.setQueryData<{ items: Post[] }>(['saved'], (old) =>
        old ? { items: old.items.filter((p) => p.id !== id) } : old,
      );
      queryClient.setQueryData<Post[]>(['reels'], (old) =>
        old ? old.filter((p) => p.id !== id) : old,
      );
      queryClient.invalidateQueries({ queryKey: ['studio'] });
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      pushToast('The scroll has been burned — but the spirit lives in the next one', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}
