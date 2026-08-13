import { create } from 'zustand';

export type Tab = 'feed' | 'reels' | 'forge' | 'search' | 'profile' | 'threads';

export interface Toast {
  id: number;
  message: string;
  tone: 'gold' | 'neem' | 'error';
}

interface UIState {
  tab: Tab;
  setTab: (tab: Tab) => void;
  readerPostId: number | null;
  openReader: (id: number) => void;
  closeReader: () => void;
  profileUserId: string | null;
  openUserProfile: (id: string) => void;
  closeUserProfile: () => void;
  reelsFocusPostId: number | null;
  openReel: (id: number) => void;
  clearReelFocus: () => void;
  notificationsOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
  feedTunerOpen: boolean;
  openFeedTuner: () => void;
  closeFeedTuner: () => void;
  activeGroupId: number | null;
  openGroup: (id: number) => void;
  closeGroup: () => void;
  createGroupOpen: boolean;
  createGroupKind: 'feed' | 'forge' | 'thread';
  openCreateGroup: (kind?: 'feed' | 'forge' | 'thread') => void;
  closeCreateGroup: () => void;
  circlesDrawerOpen: boolean;
  openCirclesDrawer: () => void;
  closeCirclesDrawer: () => void;
  activeHashtag: string | null;
  openHashtag: (tag: string) => void;
  closeHashtag: () => void;
  threadsOpen: boolean;
  activeThreadId: number | null;
  openThreads: () => void;
  closeThreads: () => void;
  openThread: (id: number) => void;
  backToInbox: () => void;
  sharePostId: number | null;
  openShare: (id: number) => void;
  closeShare: () => void;
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  composerGroupId: number | null;
  setComposerGroup: (id: number | null) => void;
  toasts: Toast[];
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useUI = create<UIState>()((set, get) => ({
  tab: 'feed',
  setTab: (tab) => set({ tab }),
  readerPostId: null,
  openReader: (id) =>
    set((s) => ({
      readerPostId: id,
      profileUserId: null,
      threadsOpen: false,
      sharePostId: null,
      // reading a shared post walks you back out of the chat tab on desktop rails
      tab: s.tab === 'threads' ? 'feed' : s.tab,
    })),
  closeReader: () => set({ readerPostId: null }),
  profileUserId: null,
  openUserProfile: (id) => set({ profileUserId: id, readerPostId: null }),
  closeUserProfile: () => set({ profileUserId: null }),
  reelsFocusPostId: null,
  // tapping a video in the feed jumps straight into the immersive Reels player
  openReel: (id) =>
    set({
      tab: 'reels',
      reelsFocusPostId: id,
      readerPostId: null,
      profileUserId: null,
      threadsOpen: false,
      sharePostId: null,
      // opening a reel navigates to the Reels tab, so dismiss any full-screen
      // circle / hashtag overlay that would otherwise cover it
      activeGroupId: null,
      activeHashtag: null,
    }),
  clearReelFocus: () => set({ reelsFocusPostId: null }),
  notificationsOpen: false,
  openNotifications: () => set({ notificationsOpen: true }),
  closeNotifications: () => set({ notificationsOpen: false }),
  feedTunerOpen: false,
  openFeedTuner: () => set({ feedTunerOpen: true }),
  closeFeedTuner: () => set({ feedTunerOpen: false }),
  activeGroupId: null,
  openGroup: (id) => set({ activeGroupId: id, readerPostId: null, profileUserId: null, circlesDrawerOpen: false }),
  closeGroup: () => set({ activeGroupId: null }),
  createGroupOpen: false,
  createGroupKind: 'feed',
  openCreateGroup: (kind = 'feed') => set({ createGroupOpen: true, createGroupKind: kind }),
  closeCreateGroup: () => set({ createGroupOpen: false }),
  circlesDrawerOpen: false,
  openCirclesDrawer: () => set({ circlesDrawerOpen: true }),
  closeCirclesDrawer: () => set({ circlesDrawerOpen: false }),
  activeHashtag: null,
  openHashtag: (tag) => set({ activeHashtag: tag, readerPostId: null, profileUserId: null }),
  closeHashtag: () => set({ activeHashtag: null }),
  threadsOpen: false,
  activeThreadId: null,
  openThreads: () => set({ tab: 'threads', threadsOpen: true }),
  closeThreads: () => set({ threadsOpen: false, activeThreadId: null }),
  openThread: (id) => set({ tab: 'threads', threadsOpen: true, activeThreadId: id, sharePostId: null }),
  backToInbox: () => set({ activeThreadId: null }),
  sharePostId: null,
  openShare: (id) => set({ sharePostId: id }),
  closeShare: () => set({ sharePostId: null }),
  composerOpen: false,
  setComposerOpen: (open) => set({ composerOpen: open, ...(open ? {} : { composerGroupId: null }) }),
  composerGroupId: null,
  setComposerGroup: (id) => set({ composerGroupId: id }),
  toasts: [],
  pushToast: (message, tone = 'gold') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    window.setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
