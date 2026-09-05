-- 004_locked_clue.sql
-- Redefines get_team_state so a locked crew still receives its clue.
--
-- WHY THIS IS A NEW FILE RATHER THAN AN EDIT TO 003
-- `create or replace function` is idempotent, so editing 003 in place would
-- work on a fresh project. It would NOT work on one where 003 has already been
-- applied: the repo would change, the deployed function would not, and the
-- lockout screen's "Read clue" button would silently do nothing against
-- production while working perfectly in development. A numbered file is the
-- visible "run me" signal that prevents that.
--
-- WHAT CHANGED
-- Only the `t.status = 'locked'` branch. It now looks the island up and
-- returns clue_statement / clue_images / is_terminal alongside lock_until.
-- Every other branch is byte-identical to 003.
--
-- Being locked means a crew cannot SUBMIT for a few minutes; it does not mean
-- they stop having earned the clue. They were looking at it when they typed
-- the wrong code, so there is no secret left to protect by withholding it, and
-- withholding it removed the one productive thing available during the wait:
-- re-reading the clue they just got wrong.
--
-- Mirrors the same change in backend/utils/teamState.js, which is the
-- sequential fallback used when this RPC is not deployed. The two must agree.
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
    -- Only awaiting_code can be locked in practice: a lockout comes from a
    -- wrong station code, and only that stage takes one. The guard means a
    -- lock applied by some future path cannot make this lookup meaningless.
    if t.stage = 'awaiting_code' then
      select * into isl from public.islands where id = (stop ->> 'island_id')::uuid;
      return json_build_object(
        'team', safe_team,
        'stage', 'locked',
        'lock_until', t.lock_until,
        'clue_statement', isl.clue_statement,
        'clue_images', coalesce(isl.clue_images, '[]'::jsonb),
        'is_terminal', coalesce(isl.is_terminal, (stop -> 'question_id') = 'null'::jsonb),
        'notice', t.notice,
        'announcement', ann
      );
    end if;

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
