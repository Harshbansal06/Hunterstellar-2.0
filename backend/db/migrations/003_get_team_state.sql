-- 003_get_team_state.sql
-- One round trip for GET /team/state. Returns the same shape the sequential
-- fallback in backend/utils/teamState.js builds from four queries, including
-- clue_images / question_images / is_terminal, so RPC_HAS_IMAGES=true can be
-- set once this is deployed.
--
-- Returns json. `null` when the team does not exist, which the caller turns
-- into a 404. A lock that has already expired is still reported as
-- stage 'locked' with its lock_until: the caller clears it and retries.
create or replace function public.get_team_state(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  t         public.teams%rowtype;
  stop      jsonb;
  ann       text;
  isl       public.islands%rowtype;
  q         public.questions%rowtype;
  safe_team json;
begin
  select * into t from public.teams where id = p_user_id;
  if not found then
    return null;
  end if;

  select message into ann
    from public.announcements
    order by created_at desc
    limit 1;

  safe_team := (
    select to_json(x) from (
      -- No password, route or session_token: this object is sent to every
      -- device holding a valid token, including a superseded one.
      select t.id, t.team_name, t.team_leader, t.members, t.email, t.progress,
             t.stage, t.status, t.lock_until, t.wrong_attempts, t.notice,
             t.last_correct_at, t.created_at
    ) x
  );

  stop := t.route -> t.progress;

  if stop is null or t.progress >= 5 then
    return json_build_object(
      'team', safe_team,
      'stage', case when t.status = 'finished' or t.progress >= 5
                    then 'finished' else coalesce(t.stage, 'ready') end,
      'notice', t.notice,
      'announcement', ann
    );
  end if;

  if t.status = 'locked' then
    return json_build_object(
      'team', safe_team,
      'stage', 'locked',
      'lock_until', t.lock_until,
      'notice', t.notice,
      'announcement', ann
    );
  end if;

  if t.stage = 'awaiting_code' then
    select * into isl from public.islands where id = (stop ->> 'island_id')::uuid;
    return json_build_object(
      'team', safe_team,
      'stage', 'awaiting_code',
      'clue_statement', isl.clue_statement,
      'clue_images', coalesce(isl.clue_images, '[]'::jsonb),
      'is_terminal', coalesce(isl.is_terminal, (stop -> 'question_id') = 'null'::jsonb),
      'notice', t.notice,
      'announcement', ann
    );
  end if;

  if t.stage = 'awaiting_puzzle' then
    select * into q from public.questions where id = (stop ->> 'question_id')::uuid;
    return json_build_object(
      'team', safe_team,
      'stage', 'awaiting_puzzle',
      'question', q.question_statement,
      'question_images', coalesce(q.que_img, '[]'::jsonb),
      'notice', t.notice,
      'announcement', ann
    );
  end if;

  return json_build_object(
    'team', safe_team,
    'stage', coalesce(t.stage, 'ready'),
    'notice', t.notice,
    'announcement', ann
  );
end;
$$;

revoke all on function public.get_team_state(uuid) from public, anon, authenticated;
grant execute on function public.get_team_state(uuid) to service_role;
