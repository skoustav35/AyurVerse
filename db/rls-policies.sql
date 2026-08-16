-- ============================================================================
-- AyurVerse · Row-Level Security suite v2 ("the lockdown, fitted")
--
-- v2 fixes (verified against the live schema before publication):
--   * ALL user-id comparisons are cast to text — AyurVerse id columns are TEXT
--     (seed users like 'seed_rishi' are not UUIDs), so bare auth.uid() equality
--     would type-error and deny legitimate writes.
--   * group_posts has no added_by column — delete path is post-author or
--     circle-owner, nothing phantom.
--   * column GRANTs are wrapped in DO blocks that verify the column exists,
--     so this file can never half-apply and leave the app mangled.
--   * NEW: storage — a public 'media' bucket with member-gated writes, so the
--     upload lane stays healthy even without the auxiliary project.
--
-- Run ONCE in Supabase → SQL Editor (project owner). Idempotent. Re-runnable.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) helpers
-- ---------------------------------------------------------------------------
create or replace function public._grant_update_cols_if_exists(
  p_table text, p_cols text[], p_roles name[] default '{authenticated}'
) returns void language plpgsql as $$
declare c text; r name;
begin
  if to_regclass(p_table) is null then return; end if;
  foreach c in array p_cols loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=split_part(p_table,'.',2) and column_name=c) then
      foreach r in array p_roles loop
        execute format('grant update (%I) on %s to %I', c, p_table, r);
      end loop;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1) enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array[
    'posts','comments','likes','saves','follows','profiles','signals','notifications',
    'groups','group_members','group_posts','conversations','conversation_members',
    'messages','statuses','user_prefs','boosts','payout_requests'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) posts — public read, owned write, counter bumps via column grants
-- ---------------------------------------------------------------------------
drop policy if exists posts_read_all    on public.posts;
create policy posts_read_all    on public.posts for select using (true);

drop policy if exists posts_insert_own  on public.posts;
create policy posts_insert_own  on public.posts for insert to authenticated
  with check (author_id = auth.uid()::text);

drop policy if exists posts_update_own  on public.posts;
create policy posts_update_own  on public.posts for update to authenticated
  using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);

drop policy if exists posts_engagement_bump on public.posts;
create policy posts_engagement_bump on public.posts for update to authenticated using (true);

drop policy if exists posts_delete_own  on public.posts;
create policy posts_delete_own  on public.posts for delete to authenticated
  using (author_id = auth.uid()::text);

revoke update on public.posts from anon, authenticated;
select public._grant_update_cols_if_exists('public.posts',
  array['likes_count','saves_count','comments_count','views_count']);

-- ---------------------------------------------------------------------------
-- 3) voices & engagement rows
-- ---------------------------------------------------------------------------
drop policy if exists comments_read_all   on public.comments;
create policy comments_read_all   on public.comments for select using (true);
drop policy if exists comments_write_own  on public.comments;
create policy comments_write_own  on public.comments for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists comments_del_own    on public.comments;
create policy comments_del_own    on public.comments for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists likes_read_own    on public.likes;
create policy likes_read_own    on public.likes for select to authenticated using (user_id = auth.uid()::text);
drop policy if exists likes_write_own   on public.likes;
create policy likes_write_own   on public.likes for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists likes_unwrite_own on public.likes;
create policy likes_unwrite_own on public.likes for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists saves_read_own    on public.saves;
create policy saves_read_own    on public.saves for select to authenticated using (user_id = auth.uid()::text);
drop policy if exists saves_write_own   on public.saves;
create policy saves_write_own   on public.saves for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists saves_unwrite_own on public.saves;
create policy saves_unwrite_own on public.saves for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists follows_read_all    on public.follows;
create policy follows_read_all    on public.follows for select using (true);
drop policy if exists follows_write_own   on public.follows;
create policy follows_write_own   on public.follows for insert to authenticated with check (follower_id = auth.uid()::text);
drop policy if exists follows_unwrite_own on public.follows;
create policy follows_unwrite_own on public.follows for delete to authenticated using (follower_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 4) profiles, signals, preferences
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read_all on public.profiles;
create policy profiles_read_all on public.profiles for select using (true);
drop policy if exists profiles_write_own on public.profiles;
create policy profiles_write_own on public.profiles for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists signals_self on public.signals;
create policy signals_self on public.signals for all to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists prefs_self on public.user_prefs;
create policy prefs_self on public.user_prefs for all to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 5) notifications: read your bell; others ring it as themselves
-- ---------------------------------------------------------------------------
drop policy if exists notif_read_own on public.notifications;
create policy notif_read_own  on public.notifications for select to authenticated using (user_id = auth.uid()::text);
drop policy if exists notif_ring on public.notifications;
create policy notif_ring      on public.notifications for insert to authenticated with check (actor_id = auth.uid()::text);
drop policy if exists notif_mark on public.notifications;
create policy notif_mark      on public.notifications for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 6) circles
-- ---------------------------------------------------------------------------
drop policy if exists groups_read_all on public.groups;
create policy groups_read_all   on public.groups for select using (true);
drop policy if exists groups_found on public.groups;
create policy groups_found      on public.groups for insert to authenticated with check (owner_id = auth.uid()::text);
drop policy if exists groups_edit_own on public.groups;
create policy groups_edit_own   on public.groups for update to authenticated
  using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);
drop policy if exists groups_membercount on public.groups;
create policy groups_membercount on public.groups for update to authenticated using (true);
select public._grant_update_cols_if_exists('public.groups', array['member_count']);
drop policy if exists groups_delete_own on public.groups;
create policy groups_delete_own on public.groups for delete to authenticated using (owner_id = auth.uid()::text);

drop policy if exists gmembers_read_all on public.group_members;
create policy gmembers_read_all  on public.group_members for select using (true);
drop policy if exists gmembers_join on public.group_members;
create policy gmembers_join      on public.group_members for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists gmembers_leave on public.group_members;
create policy gmembers_leave     on public.group_members for delete to authenticated
  using (user_id = auth.uid()::text or exists (
    select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()::text));
drop policy if exists gmembers_admin on public.group_members;
create policy gmembers_admin     on public.group_members for update to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()::text));
select public._grant_update_cols_if_exists('public.group_members', array['role']);

-- circle sharing: any member may share their scroll into the circle;
-- the poster or the circle owner may unweave it.
drop policy if exists gposts_read on public.group_posts;
create policy gposts_read    on public.group_posts for select using (true);
drop policy if exists gposts_share on public.group_posts;
create policy gposts_share   on public.group_posts for insert to authenticated
  with check (exists (select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()::text));
drop policy if exists gposts_unshare on public.group_posts;
create policy gposts_unshare on public.group_posts for delete to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()::text)
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()::text));

-- ---------------------------------------------------------------------------
-- 7) threads — strictly member-scoped
-- ---------------------------------------------------------------------------
drop policy if exists conv_read on public.conversations;
create policy conv_read  on public.conversations for select to authenticated
  using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()::text));
drop policy if exists conv_open on public.conversations;
create policy conv_open  on public.conversations for insert to authenticated with check (created_by = auth.uid()::text);
drop policy if exists conv_touch on public.conversations;
create policy conv_touch on public.conversations for update to authenticated
  using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()::text));
select public._grant_update_cols_if_exists('public.conversations', array['last_message_at','last_message_preview']);

drop policy if exists cm_read on public.conversation_members;
create policy cm_read   on public.conversation_members for select to authenticated
  using (user_id = auth.uid()::text or exists (
    select 1 from public.conversation_members self where self.conversation_id = conversation_id and self.user_id = auth.uid()::text));
drop policy if exists cm_join on public.conversation_members;
create policy cm_join   on public.conversation_members for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists cm_leave on public.conversation_members;
create policy cm_leave  on public.conversation_members for delete to authenticated
  using (user_id = auth.uid()::text or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid()::text));
drop policy if exists cm_markread on public.conversation_members;
create policy cm_markread on public.conversation_members for update to authenticated using (user_id = auth.uid()::text);
select public._grant_update_cols_if_exists('public.conversation_members', array['last_read_at']);

drop policy if exists msg_member_read on public.messages;
create policy msg_member_read  on public.messages for select to authenticated
  using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()::text));
drop policy if exists msg_member_send on public.messages;
create policy msg_member_send  on public.messages for insert to authenticated
  with check (sender_id = auth.uid()::text and exists (
    select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()::text));
drop policy if exists msg_member_react on public.messages;
create policy msg_member_react on public.messages for update to authenticated
  using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()::text));
select public._grant_update_cols_if_exists('public.messages', array['reactions']);
drop policy if exists msg_unsend on public.messages;
create policy msg_unsend on public.messages for delete to authenticated using (sender_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 8) statuses (stories), boosts, payout requests
-- ---------------------------------------------------------------------------
drop policy if exists statuses_read on public.statuses;
create policy statuses_read     on public.statuses for select using (true);
drop policy if exists statuses_own on public.statuses;
create policy statuses_own      on public.statuses for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists statuses_unfurl on public.statuses;
create policy statuses_unfurl   on public.statuses for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists boosts_read on public.boosts;
create policy boosts_read       on public.boosts for select using (true);
drop policy if exists boosts_own_write on public.boosts;
create policy boosts_own_write  on public.boosts for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists boosts_own_edit on public.boosts;
create policy boosts_own_edit   on public.boosts for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists payouts_self on public.payout_requests;
create policy payouts_self on public.payout_requests for all to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 9) storage — a healthy public media bucket with member-gated writes
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists media_member_write on storage.objects;
create policy media_member_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media');

drop policy if exists media_member_update on storage.objects;
create policy media_member_update on storage.objects for update to authenticated
  using (bucket_id = 'media') with check (bucket_id = 'media');

drop policy if exists media_owner_delete on storage.objects;
create policy media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and owner = auth.uid()::text);

commit;

-- ============================================================================
-- VERIFY (expect: every app table rowsecurity=true; anon insert into likes
-- fails; anon select * from messages returns 0 rows; anon select from posts works)
--   select tablename, rowsecurity from pg_tables where schemaname='public' order by 1;
-- ============================================================================
