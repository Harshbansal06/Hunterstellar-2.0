-- 001_schema.sql
-- Baseline schema for Odyssey, reconstructed from what the code reads and
-- writes (backend/routes/*, backend/utils/teamState.js, frontend Leaderboard).
-- Idempotent: safe to run against a project that already has these tables.

create extension if not exists pgcrypto;

-- One row per crew. `route` is the ordered list of five stops the crew was
-- dealt at registration: [{island_id, question_id}], question_id null on the
-- terminal stop. `progress` indexes into it.
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  team_name       text not null unique,
  team_leader     text,
  members         jsonb,
  password        text not null,
  route           jsonb not null,
  email           text,
  progress        integer not null default 0,
  stage           text not null default 'awaiting_code',
  status          text not null default 'active',
  lock_until      timestamptz,
  wrong_attempts  integer not null default 0,
  notice          text,
  last_correct_at timestamptz,
  session_token   text,
  created_at      timestamptz not null default now()
);

-- A physical station. `order` (1-5) is the slot it can fill in a route:
-- buildRandomRoute picks one island per slot, and slot 5 is the terminal stop.
create table if not exists public.islands (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  "order"        integer not null,
  correct_code   text not null,
  clue_statement text not null,
  clue_images    jsonb not null default '[]'::jsonb,
  is_terminal    boolean not null default false,
  is_common_room boolean not null default false
);

create table if not exists public.questions (
  id                 uuid primary key default gen_random_uuid(),
  domain             text not null,
  question_statement text not null,
  question_answer    text not null,
  que_img            jsonb not null default '[]'::jsonb
);

-- Exactly one row, id = 1. Read by every verify request through a 5s cache.
create table if not exists public.event_config (
  id               integer primary key,
  started_at       timestamptz,
  duration_minutes integer,
  ended_at         timestamptz
);
insert into public.event_config (id, duration_minutes)
  values (1, 180)
  on conflict (id) do nothing;

create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  message    text not null,
  created_at timestamptz not null default now()
);

-- Columns added after the first deploy. Kept as ALTERs so this file also
-- upgrades a database created from the original hand-made tables.
alter table public.teams add column if not exists last_correct_at timestamptz;
alter table public.teams add column if not exists session_token text;
alter table public.teams add column if not exists notice text;
alter table public.event_config add column if not exists ended_at timestamptz;
alter table public.islands add column if not exists clue_images jsonb not null default '[]'::jsonb;
alter table public.islands add column if not exists is_terminal boolean not null default false;
alter table public.questions add column if not exists que_img jsonb not null default '[]'::jsonb;

create index if not exists teams_progress_idx on public.teams (progress desc, last_correct_at asc);
create index if not exists questions_domain_idx on public.questions (domain);
create index if not exists islands_order_idx on public.islands ("order");
