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
  // reels queries are keyed as ['reels', focusId | 'all'] — prefix-match them all
  queryClient.setQueriesData<Post[]>({ queryKey: ['reels'] }, (old) =>
    Array.isArray(old) ? old.map((p) => (p.id === postId ? patch(p) : p)) : old,
  );
  // group content is keyed as ['group-posts', groupId] — prefix-match every circle
  queryClient.setQueriesData<{ items: Post[] }>({ queryKey: ['group-posts'] }, (old) =>
    old && Array.isArray(old.items) ? { ...old, items: old.items.map((p) => (p.id === postId ? patch(p) : p)) } : old,
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

/** The signed-in weaver's profile row — the source of truth for their card.
 *  Auth metadata (Google photos etc.) is only a starting value; edits flow
 *  through /api/profiles and this cache. */
export function useMyProfile() {
  return useQuery({
    queryKey: ['me-profile'],
    queryFn: () => apiFetch<Profile | null>('/api/profiles?user_id=me'),
    staleTime: 30_000,
  });
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: conversationId !== null,
    queryFn: () =>
      apiFetch<{ items: ChatMessage[]; has_more?: boolean }>(`/api/messages?conversation_id=${conversationId}`),
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
      queryClient.setQueryData<{ items: ChatMessage[]; has_more?: boolean }>(['messages', conversationId], (old) =>
        old ? { ...old, items: [...old.items, m] } : { items: [m], has_more: false },
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

export interface Group {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  kind: 'feed' | 'forge' | 'thread';
  owner_id: string;
  avatar_url: string | null;
  cover_url: string | null;
  tags: string[] | null;
  conversation_id: number | null;
  member_count: number;
  created_at: string;
  my_role?: 'admin' | 'member' | null;
  is_member?: boolean;
}

export interface GroupMember {
  user_id: string;
  role: 'admin' | 'member';
  username: string;
  full_name: string;
  avatar_url: string | null;
}

export interface ExploreData {
  reels: Post[];
  media: Post[];
  lore: Post[];
  hashtags: { tag: string; weight: number }[];
  circles: Group[];
  people: Profile[];
}

export function useExplore() {
  return useQuery({
    queryKey: ['explore'],
    queryFn: () => apiFetch<ExploreData>('/api/explore'),
    staleTime: 60_000,
  });
}

export function useDiscoverGroups(kind?: 'feed' | 'forge' | 'thread') {
  return useQuery({
    queryKey: ['groups', 'discover', kind ?? 'all'],
    queryFn: () => apiFetch<{ groups: Group[] }>(`/api/groups?discover=1${kind ? `&kind=${kind}` : ''}`),
    staleTime: 60_000,
  });
}

export function useMyGroups(kind?: 'feed' | 'forge' | 'thread') {
  return useQuery({
    queryKey: ['groups', 'mine', kind ?? 'all'],
    queryFn: () => apiFetch<{ groups: Group[] }>(`/api/groups?mine=1${kind ? `&kind=${kind}` : ''}`),
    // always reflect true membership — refetch on mount and when the tab
    // regains focus so a left/removed circle disappears without a hard refresh
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useGroup(id: number | null) {
  return useQuery({
    queryKey: ['group', id],
    enabled: id !== null,
    queryFn: () => apiFetch<{ group: Group; members: GroupMember[]; admins: GroupMember[]; my_role: string | null; is_member: boolean }>(`/api/groups?id=${id}`),
  });
}

export function useGroupPosts(id: number | null) {
  return useQuery({
    queryKey: ['group-posts', id],
    enabled: id !== null,
    queryFn: () => apiFetch<{ items: Post[] }>(`/api/group-content?group_id=${id}`),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: { name: string; kind: string; description?: string; tags?: string[]; avatar_url?: string | null; cover_url?: string | null }) =>
      apiFetch<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      pushToast('Your circle is founded', 'neem');
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async ({ groupId, leave }: { groupId: number; leave?: boolean }) =>
      apiFetch<{ ok: boolean; member_count?: number }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ action: leave ? 'leave' : 'join', group_id: groupId }),
      }),
    onSuccess: (_d, { leave }) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      pushToast(leave ? 'You left the circle' : 'Welcome to the circle', 'neem');
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export function useManageGroup() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: { action: 'add_member' | 'promote' | 'remove_member'; group_id: number; user_id: string }) =>
      apiFetch('/api/groups', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] });
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: { id: number; name?: string; description?: string; tags?: string[]; avatar_url?: string | null; cover_url?: string | null }) =>
      apiFetch<{ group: Group }>('/api/groups', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      pushToast('Circle updated', 'neem');
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export function usePostToGroup(groupId: number) {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiFetch<{ post: Post }>('/api/group-content', { method: 'POST', body: JSON.stringify({ group_id: groupId, ...payload }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
      pushToast('Posted to the circle', 'neem');
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export interface Notification {
  id: number;
  user_id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_avatar: string | null;
  type: 'like' | 'follow' | 'comment' | 'message' | 'mention' | 'group_join';
  post_id: number | null;
  conversation_id: number | null;
  preview: string | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<{ items: Notification[]; unread: number }>('/api/notifications'),
    refetchInterval: 45_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id?: number) =>
      apiFetch('/api/notifications', { method: 'PUT', body: JSON.stringify(id ? { id } : {}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export interface FeedPrefs {
  boosted_tags: string[];
  muted_tags: string[];
}

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: () => apiFetch<FeedPrefs>('/api/preferences'),
    staleTime: 120_000,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (prefs: FeedPrefs) =>
      apiFetch<FeedPrefs>('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['preferences'], data);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      pushToast('Your feed has been re-tuned', 'neem');
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export interface DeployStatus {
  environment: string;
  capabilities: {
    database: boolean;
    auth_google: boolean;
    ai_assistant: boolean;
    payouts: boolean;
    storage: boolean;
  };
  metrics: { posts: number | null; profiles: number | null; groups: number | null; threads: number | null };
  generated_at: string;
}

export function useDeployStatus() {
  return useQuery({
    queryKey: ['deploy-status'],
    queryFn: () => apiFetch<DeployStatus>('/api/status'),
    staleTime: 30_000,
  });
}

export interface Boost {
  id: number;
  user_id: string;
  target_type: 'post' | 'channel';
  post_id: number | null;
  goal_type: 'likes' | 'followers';
  packages: number;
  amount_cents: number;
  goal_units: number;
  status: 'active' | 'pending' | 'completed' | 'expired';
  impressions: number;
  clicks: number;
  likes_gained: number;
  followers_gained: number;
  starts_at: string;
  expires_at: string | null;
  ctr: number;
  progress: number;
  goal_gained: number;
  post?: {
    id: number;
    title: string | null;
    caption: string | null;
    media_url: string | null;
    media_type: 'image' | 'video' | null;
    kind: string;
    likes_count: number;
  } | null;
}

export interface BoostsResponse {
  boosts: Boost[];
  activeCount: number;
  gatewayConfigured: boolean;
  pricing: { perPackageCents: number; followersPerPackage: number; likesPerPackage: number; boostDays: number };
}

export function useBoosts() {
  return useQuery({
    queryKey: ['boosts'],
    queryFn: () => apiFetch<BoostsResponse>('/api/boosts'),
    staleTime: 30_000,
  });
}

export function useCreateBoost() {
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);
  return useMutation({
    mutationFn: async (payload: { target_type: 'post' | 'channel'; post_id?: number; packages: number }) =>
      apiFetch<{ boost: Boost; note: string }>('/api/boosts', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['boosts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      pushToast(res.note, 'neem');
    },
    onError: (err) => pushToast((err as Error).message, 'error'),
  });
}

export function trackBoost(boostId: number, event: 'impression' | 'click' | 'like' | 'follow') {
  // fire-and-forget; never blocks the UI
  apiFetch('/api/boost-track', { method: 'POST', body: JSON.stringify({ boost_id: boostId, event }) }).catch(() => undefined);
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
      queryClient.setQueriesData<Post[]>({ queryKey: ['reels'] }, (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : old,
      );
      queryClient.invalidateQueries({ queryKey: ['studio'] });
      queryClient.invalidateQueries({ queryKey: ['my-posts'] });
      pushToast('The scroll has been burned — but the spirit lives in the next one', 'neem');
    },
    onError: (err) => pushToast(err.message, 'error'),
  });
}
