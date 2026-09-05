-- 005_one_lockout_per_stop.sql
-- A crew can be locked out at most once per station.
--
-- THE RULE
-- The first wrong station code costs the full lockout. Every wrong code after
-- that, AT THE SAME STOP, is refused without a lock. Moving to the next stop
-- gives a fresh allowance, because it is a new station.
--
-- WHY
-- The lockout exists to stop a crew brute-forcing a code, and one served
-- lockout already does that: it converts a guessing strategy from cheap into
-- expensive. Repeating it does not add deterrence, it just removes a crew from
-- an event they paid to attend. A crew that gets a code wrong twice is
-- normally standing at the wrong door or misreading a character, and the
-- second five minutes teaches them nothing the first did not.
--
-- Brute force is still bounded, by the verify rate limiter: 10 attempts per
-- crew per 15 minutes, which is the control actually suited to that job.
--
-- SHAPE
-- `locked_stops` is the list of route indices (0-4) where this crew has
-- already served a lockout. An integer array rather than a counter, because
-- the allowance is per stop and a counter cannot say which stop it was spent
-- at. Idempotent, so re-running against an existing project is safe.
alter table public.teams
  add column if not exists locked_stops integer[] not null default '{}';

comment on column public.teams.locked_stops is
  'Route indices (0-4) where this crew has already served a lockout. A wrong '
  'station code locks only if the current progress is not already in here. '
  'Written by POST /api/team/verify-code.';

-- The leaderboard view selects an explicit column list and does not touch this
-- column, so it needs no change. Recorded here so the next person does not go
-- looking.
