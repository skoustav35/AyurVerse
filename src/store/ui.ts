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
  setComposerOpen: (open) => set({ composerOpen: open }),
  toasts: [],
  pushToast: (message, tone = 'gold') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    window.setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
