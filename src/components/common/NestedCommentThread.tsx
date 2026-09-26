import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownRight, Heart, MessageSquare, Minus, Plus, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import type { Comment } from '../../lib/types';
import { useAddComment, useDeleteComment, useToggleCommentLike } from '../../hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { timeAgo } from '../../lib/format';

interface NestedCommentThreadProps {
  postId: number;
  comments: Comment[];
  onRequireAuth?: () => void;
  className?: string;
}

interface CommentTreeNode extends Comment {
  children: CommentTreeNode[];
}

function buildCommentTree(comments: Comment[], sort: 'top' | 'newest' | 'oldest'): CommentTreeNode[] {
  const map = new Map<number, CommentTreeNode>();
  const roots: CommentTreeNode[] = [];

  // Initialize nodes
  for (const c of comments) {
    map.set(c.id, { ...c, children: [] });
  }

  // Link hierarchy
  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort helper
  const sortFn = (a: CommentTreeNode, b: CommentTreeNode) => {
    if (sort === 'top') {
      const diff = (b.likes_count || 0) - (a.likes_count || 0);
      if (diff !== 0) return diff;
      return b.id - a.id;
    }
    if (sort === 'newest') return b.id - a.id;
    return a.id - b.id;
  };

  const recursiveSort = (nodes: CommentTreeNode[]) => {
    nodes.sort(sortFn);
    for (const n of nodes) {
      if (n.children.length > 0) recursiveSort(n.children);
    }
  };

  recursiveSort(roots);
  return roots;
}

function FlairBadge({ flair }: { flair?: string | null }) {
  if (!flair || flair === 'Weaver') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-sand-200/70 text-ink-600 dark:bg-sand-800/40 dark:text-ink-400">
        Weaver
      </span>
    );
  }

  if (flair === 'Vaidya') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-gradient-to-r from-gold-500/20 to-saffron-500/20 text-gold-700 dark:text-gold-300 ring-1 ring-gold-500/30">
        <Sparkles size={8.5} className="text-gold-600 dark:text-gold-400" />
        Vaidya
      </span>
    );
  }

  if (flair === 'Yoga Acharya') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-neem-600/15 text-neem-700 dark:text-neem-300 ring-1 ring-neem-500/30">
        <ShieldCheck size={8.5} />
        Yoga Acharya
      </span>
    );
  }

  if (flair === 'Herbalist') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
        🌿 Herbalist
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-sand-200/70 text-ink-600 dark:bg-sand-800/40 dark:text-ink-400">
      {flair}
    </span>
  );
}

function SingleCommentNode({
  node,
  postId,
  depth = 0,
  onRequireAuth,
}: {
  node: CommentTreeNode;
  postId: number;
  depth?: number;
  onRequireAuth?: () => void;
}) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');

  const addComment = useAddComment(postId);
  const deleteComment = useDeleteComment(postId);
  const toggleLike = useToggleCommentLike(postId);

  const isOwn = user?.id === node.user_id;

  const handleSendReply = async () => {
    if (!user) {
      onRequireAuth?.();
      return;
    }
    const trimmed = replyText.trim();
    if (!trimmed) return;
    await addComment.mutateAsync({ body: trimmed, parentId: node.id });
    setReplyText('');
    setReplying(false);
  };

  const handleLike = () => {
    if (!user) {
      onRequireAuth?.();
      return;
    }
    toggleLike.mutate(node.id);
  };

  const countDescendants = (n: CommentTreeNode): number => {
    return n.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
  };

  const totalDescendants = useMemo(() => countDescendants(node), [node]);

  return (
    <div className={`relative ${depth > 0 ? 'ml-3 sm:ml-5 mt-2.5' : 'mt-3.5'}`}>
      {/* Vertical Thread Connector Line */}
      {depth > 0 && (
        <div
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -left-2.5 sm:-left-3.5 top-2.5 bottom-0 w-[1.5px] bg-sand-300/70 hover:bg-gold-500/80 dark:bg-sand-700/50 dark:hover:bg-gold-400/80 cursor-pointer transition-colors"
          title={collapsed ? 'Expand branch' : 'Collapse branch'}
        />
      )}

      {/* Main Comment Capsule */}
      <div className="group/item flex items-start gap-2.5">
        <Avatar
          url={node.author_avatar}
          name={node.author_name}
          size={depth > 0 ? 26 : 30}
          className="shrink-0 mt-0.5 ring-1 ring-sand-300/60 dark:ring-sand-700/60"
        />

        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-display font-medium text-[13px] text-ink-900 dark:text-parchment leading-tight truncate">
              {node.author_name}
            </span>
            <span className="text-[11px] text-ink-400 dark:text-ink-500">@{node.author_username}</span>
            <FlairBadge flair={node.user_flair} />
            <span className="text-[10px] text-ink-400 dark:text-ink-500">· {timeAgo(node.created_at)}</span>

            {/* Collapse toggle */}
            {totalDescendants > 0 && (
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="ml-auto text-[10.5px] text-ink-400 hover:text-gold-600 dark:hover:text-gold-400 inline-flex items-center gap-0.5 px-1 py-0.5 rounded transition-colors"
              >
                {collapsed ? <Plus size={10} /> : <Minus size={10} />}
                {collapsed ? `${totalDescendants} replies` : 'fold'}
              </button>
            )}
          </div>

          {/* Comment Body (or collapsed stub) */}
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="mt-1 text-[12px] text-gold-700 dark:text-gold-400 hover:underline flex items-center gap-1 italic"
            >
              Thread collapsed ({totalDescendants + 1} thoughts folded) · Click to reveal
            </button>
          ) : (
            <>
              <p className="mt-1 text-[13px] text-ink-800 dark:text-ink-200 leading-relaxed whitespace-pre-wrap break-words">
                {node.body}
              </p>

              {/* Action Bar: Like, Reply, Delete */}
              <div className="mt-1.5 flex items-center gap-3.5 text-[11px] text-ink-500 dark:text-ink-400">
                <button
                  type="button"
                  onClick={handleLike}
                  className={`inline-flex items-center gap-1 transition-colors hover:text-terra-600 ${
                    node.liked ? 'text-terra-600 font-semibold dark:text-terra-400' : ''
                  }`}
                  aria-label="Like comment"
                >
                  <Heart size={12} className={node.liked ? 'fill-current' : ''} />
                  <span>{node.likes_count || 0}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      onRequireAuth?.();
                      return;
                    }
                    setReplying(!replying);
                    if (!replying && !replyText) setReplyText(`@${node.author_username} `);
                  }}
                  className="inline-flex items-center gap-1 hover:text-saffron-600 dark:hover:text-gold-400 transition-colors"
                >
                  <CornerDownRight size={12} />
                  <span>Reply</span>
                </button>

                {isOwn && (
                  <button
                    type="button"
                    onClick={() => deleteComment.mutate(node.id)}
                    className="opacity-0 group-hover/item:opacity-100 hover:text-terra-600 transition-opacity ml-auto"
                    aria-label="Delete comment"
                  >
                    <Trash2 size={11.5} />
                  </button>
                )}
              </div>

              {/* In-line Reply Box */}
              <AnimatePresence>
                {replying && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2.5 overflow-hidden"
                  >
                    <div className="flex gap-2 items-center bg-sand-100/80 dark:bg-sand-900/60 p-1.5 rounded-xl border border-sand-300/80 dark:border-sand-700/60">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply();
                          }
                        }}
                        placeholder={`Reply to @${node.author_username}…`}
                        autoFocus
                        className="flex-1 bg-transparent px-2.5 py-1 text-[12.5px] text-ink-900 dark:text-parchment placeholder:text-ink-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || addComment.isPending}
                        className="px-3 py-1 rounded-lg bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment text-[11px] font-semibold hover:brightness-105 disabled:opacity-50 transition-all shrink-0"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplying(false)}
                        className="text-[11px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Children Branches (Recursive) */}
              {node.children.length > 0 && (
                <div className="space-y-1">
                  {node.children.map((child) => (
                    <SingleCommentNode
                      key={child.id}
                      node={child}
                      postId={postId}
                      depth={depth + 1}
                      onRequireAuth={onRequireAuth}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NestedCommentThread({
  postId,
  comments,
  onRequireAuth,
  className = '',
}: NestedCommentThreadProps) {
  const { user } = useAuth();
  const [rootText, setRootText] = useState('');
  const [sort, setSort] = useState<'top' | 'newest' | 'oldest'>('top');
  const addComment = useAddComment(postId);

  const tree = useMemo(() => buildCommentTree(comments, sort), [comments, sort]);

  const handleSendRoot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth?.();
      return;
    }
    const trimmed = rootText.trim();
    if (!trimmed) return;
    await addComment.mutateAsync(trimmed);
    setRootText('');
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Root Input Composer */}
      <form onSubmit={handleSendRoot} className="relative mb-3">
        <div className="flex items-center gap-2 p-1.5 rounded-2xl border border-sand-300 bg-parchment/90 dark:bg-sand-900/70 dark:border-sand-700/70 shadow-sm focus-within:ring-2 focus-within:ring-gold-400/50 transition-all">
          <input
            type="text"
            value={rootText}
            onChange={(e) => setRootText(e.target.value)}
            placeholder={user ? 'Add to the scroll discourse…' : 'Sign in to join the discussion…'}
            className="flex-1 bg-transparent px-3 py-1.5 text-[13px] text-ink-900 dark:text-parchment placeholder:text-ink-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!rootText.trim() || addComment.isPending}
            className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment hover:brightness-105 disabled:opacity-40 transition-all shrink-0"
            aria-label="Send comment"
          >
            <Send size={13} />
          </button>
        </div>
      </form>

      {/* Sorting bar & Counter */}
      <div className="flex items-center justify-between pb-2 border-b border-sand-200/80 dark:border-sand-800/60 text-[11.5px] text-ink-500 dark:text-ink-400">
        <span className="font-semibold text-ink-700 dark:text-ink-300">
          {comments.length} Thought{comments.length === 1 ? '' : 's'}
        </span>

        <div className="flex items-center gap-1 bg-sand-200/60 dark:bg-sand-800/40 p-0.5 rounded-lg text-[10.5px]">
          {(['top', 'newest', 'oldest'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`px-2 py-0.5 rounded-md capitalize transition-all ${
                sort === s
                  ? 'bg-parchment text-ink-900 font-semibold shadow-xs dark:bg-sand-700 dark:text-parchment'
                  : 'text-ink-500 hover:text-ink-800 dark:hover:text-parchment'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Comment Tree */}
      {tree.length === 0 ? (
        <div className="py-8 text-center text-ink-400 dark:text-ink-500">
          <MessageSquare size={22} className="mx-auto mb-1.5 opacity-40" />
          <p className="text-[12.5px]">The sanctum is quiet. Speak the first thought.</p>
        </div>
      ) : (
        <div className="space-y-1 pb-4">
          {tree.map((node) => (
            <SingleCommentNode
              key={node.id}
              node={node}
              postId={postId}
              depth={0}
              onRequireAuth={onRequireAuth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
