-- 002_leaderboard.sql
-- Public, read-only projection of teams for the leaderboard. The frontend
-- reads this directly with the anon key, so it must never expose password,
-- route, session_token, email or members.
--
-- in_null_void: the crew has reached the terminal stop (route index 4), which
-- includes crews that have already finished there.
create or replace view public.leaderboard as
select
  id,
  team_name,
  progress,
  status,
  lock_until,
  wrong_attempts,
  last_correct_at,
  (progress >= 4) as in_null_void
from public.teams
order by progress desc, last_correct_at asc nulls last;

-- Row-level security on the base tables. The service-role key bypasses it;
-- the anon key only gets what is granted below.
alter table public.teams enable row level security;
alter table public.islands enable row level security;
alter table public.questions enable row level security;
alter table public.event_config enable row level security;
alter table public.announcements enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.leaderboard to anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Realtime enforces RLS with the SUBSCRIBING client's role and reports
-- SUBSCRIBED either way, so without an anon SELECT policy the frontend's
-- postgres_changes nudge (useTeamState.js, Admin.jsx) never fires and every
-- device falls back to the 30s poll. The grant is column-scoped: anon can see
-- the same progress fields the leaderboard already publishes, and nothing
-- else. Realtime filters the change payload to the columns the role can read;
-- PostgREST refuses a select on any other column outright.
grant select (id, team_name, progress, stage, status, lock_until, wrong_attempts, last_correct_at)
  on public.teams to anon, authenticated;
drop policy if exists "anon can watch team progress" on public.teams;
create policy "anon can watch team progress"
  on public.teams for select to anon, authenticated using (true);

-- Announcements are broadcast to every crew by design.
grant select on public.announcements to anon, authenticated;
drop policy if exists "announcements are public" on public.announcements;
create policy "announcements are public"
  on public.announcements for select to anon, authenticated using (true);

-- Realtime only streams tables in the supabase_realtime publication. Guarded
-- so the file also runs on a plain Postgres without that publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = 'teams') then
      alter publication supabase_realtime add table public.teams;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = 'announcements') then
      alter publication supabase_realtime add table public.announcements;
    end if;
  end if;
end $$;
