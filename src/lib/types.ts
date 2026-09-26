export type PostKind = 'visual' | 'forge';

/** Which ranked surface a post was served on. */
export type RankingSurface = 'feed' | 'search';

/**
 * Server-issued ranking metadata. Present only when the viewer is signed in,
 * has personalization on, and is not read-only — absent metadata means the
 * client must not send ranking feedback for that post.
 */
export interface RankingContext {
  request_id: string;
  position: number;
  surface: RankingSurface;
}

export interface Post {
  id: number;
  kind: PostKind;
  author_id: string;
  author_name: string;
  author_username: string;
  author_avatar: string | null;
  caption: string | null;
  title: string | null;
  summary: string | null;
  content_md: string | null;
  media_url: string | null;
  media_urls?: string[];
  media_type: 'image' | 'video' | null;
  media_duration: number | null;
  location: string | null;
  tags: string[] | null;
  likes_count: number;
  saves_count: number;
  comments_count: number;
  views_count: number;
  read_minutes: number | null;
  created_at: string;
  liked?: boolean;
  saved?: boolean;
  reason?: string | null;
  ratio?: number | null;
  boosted?: boolean;
  boost_id?: number | null;
  /** Server-issued ranking metadata for this post on a ranked surface. */
  ranking?: RankingContext;
}

export interface ThreadMember {
  user_id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  last_read_at?: string | null;
}

export interface Thread {
  id: number;
  is_group: boolean;
  name: string | null;
  title: string;
  avatar_url: string | null;
  members: ThreadMember[];
  last_message: { body: string | null; type: string; sender_name: string; created_at: string } | null;
  last_message_at: string;
  unread_count: number;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  type: 'text' | 'image' | 'voice' | 'sticker' | 'post';
  body: string | null;
  media_url: string | null;
  post_id: number | null;
  reactions: { e: string; u: string }[];
  created_at: string;
  post?: Post | null;
  /** client-only: optimistic bubble still travelling to the loom */
  pending?: boolean;
  /** client-only: send failed; tap to retry */
  failed?: boolean;
}

export interface FeedMeta {
  personalized: boolean;
  taste: { tag: string; weight: number }[];
  coldStart?: boolean;
  engine?: string;
  semantic?: { enabled: boolean; degraded?: boolean };
  experiment?: { id: string; variant: string };
  feedbackEnabled?: boolean;
  mode?: string;
  dinacharya_mode?: boolean;
}

export interface FeedPage {
  items: Post[];
  /**
   * Opaque cursor for `/api/feed` (string | null); `/api/posts` still returns a
   * numeric cursor, so both shapes are allowed here.
   */
  nextCursor: number | string | null;
  nextOffset?: number | null;
  meta?: FeedMeta;
}

export interface Profile {
  id?: number;
  user_id: string;
  username: string;
  full_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at?: string;
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
}

export interface Comment {
  id: number;
  post_id: number;
  parent_id?: number | null;
  user_id: string;
  author_name: string;
  author_username: string;
  author_avatar: string | null;
  user_flair?: string | null;
  body: string;
  likes_count?: number;
  liked?: boolean;
  created_at: string;
  children?: Comment[];
}

export interface StoryPollOption {
  text: string;
  votes: number;
}

export interface StoryPoll {
  question: string;
  options: StoryPollOption[];
  user_voted_idx?: number | null;
  total_votes?: number;
}

export interface Story {
  id: number;
  user_id: string;
  author_name: string;
  author_username: string;
  author_avatar: string | null;
  media_url: string;
  media_type?: 'image' | 'video' | null;
  caption?: string | null;
  created_at: string;
  is_following?: boolean;
  is_own?: boolean;
  views_count?: number;
  muhurta?: string | null;
  poll?: StoryPoll | null;
}

export interface StatusChannel {
  user_id: string;
  author_name: string;
  author_username: string;
  author_avatar: string | null;
  stories: Story[];
  has_story: boolean;
  is_own: boolean;
  is_following: boolean;
}

export interface PlaylistLesson {
  id: number;
  title: string | null;
  caption: string | null;
  summary: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  kind: PostKind;
  read_minutes?: number | null;
  author_name: string;
  author_username: string;
}

export interface SanctumPlaylist {
  id: number;
  user_id: string;
  author_name: string;
  author_username: string;
  title: string;
  description: string | null;
  category: string;
  post_ids: number[];
  thumbnail_url: string | null;
  created_at: string;
  total_lessons?: number;
  items?: PlaylistLesson[];
  current_index?: number;
}

/* ------------------------------------------ Studio / payouts */

export interface SeriesPoint { day?: string; month?: string; count: number }

export interface StudioPostStat {
  id: number;
  kind: PostKind;
  media_type: 'image' | 'video' | null;
  media_url: string | null;
  title: string | null;
  caption: string | null;
  summary: string | null;
  location: string | null;
  tags: string[] | null;
  created_at: string;
  likes_count: number;
  views_count: number;
  comments_count: number;
  saves_count: number;
  like_rate_per_day: number;
  likes_last_14d: number;
  spark: number[];
}

export interface StudioAnalytics {
  totals: {
    posts: number;
    likes: number;
    views: number;
    comments: number;
    saves: number;
    followers: number;
  };
  eligible: boolean;
  poolDollars: number;
  likeSeries14d: SeriesPoint[];
  likesByMonth: SeriesPoint[];
  followersByMonth: SeriesPoint[];
  posts: StudioPostStat[];
}

export interface PayoutRequest {
  id: number;
  user_id: string;
  amount_cents: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  created_at: string;
}

export interface PayoutsResponse {
  likesPool: number;
  followerCount: number;
  eligible: boolean;
  earnedCents: number;
  requestedCents: number;
  withdrawableCents: number;
  requests: PayoutRequest[];
  gateway: 'razorpay-payouts';
  gatewayConfigured: boolean;
}
