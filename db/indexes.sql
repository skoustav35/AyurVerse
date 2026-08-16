-- AyurVerse · hot-path indexes
-- Run once in Supabase → SQL Editor. Idempotent (IF NOT EXISTS), zero-downtime
-- friendly (no long locks on these sizes; use CONCURRENTLY manually if the
-- tables are already enormous).

-- Feed paging & forge tab
CREATE INDEX IF NOT EXISTS idx_posts_kind_id_desc   ON posts (kind, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_id      ON posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created        ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin       ON posts USING gin (tags);

-- Engagement
CREATE INDEX IF NOT EXISTS idx_likes_user_post      ON likes (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_user      ON likes (post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saves_user_post      ON saves (user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id     ON comments (post_id, id);
CREATE INDEX IF NOT EXISTS idx_signals_user_time    ON signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_post         ON signals (post_id);

-- Graph & discovery
CREATE INDEX IF NOT EXISTS idx_profiles_username    ON profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_lower_name  ON profiles (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_follows_follower     ON follows (follower_id, followee_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee     ON follows (followee_id, follower_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user   ON group_members (user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group  ON group_members (group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_groups_tags_gin      ON groups USING gin (tags);

-- Threads (the inbox is the hottest read in the app)
CREATE INDEX IF NOT EXISTS idx_conv_members_user    ON conversation_members (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv    ON conversation_members (conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last   ON conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id     ON messages (conversation_id, id DESC);

-- Bell
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications (user_id, id DESC);

-- Statuses rail
CREATE INDEX IF NOT EXISTS idx_statuses_user        ON statuses (user_id, created_at DESC);

-- Housekeeping: let the planner see fresh cardinalities after indexing
ANALYZE;
