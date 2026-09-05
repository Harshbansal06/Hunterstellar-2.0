# Hunterstellar 2.0

A real-time treasure hunt for college events. Crews register, get a randomised
five-stop route, and solve a code plus a challenge at each stop. Marshals watch
every crew's progress live.

```
Register -> Station I -> Station II -> Station III -> Station IV -> The Null Void
```

Four stations each yield one fragment of the Ultimate Power. The fifth stop
takes a code and ends the hunt in the app; the final challenge itself happens in
person.

## Layout

An npm workspace with two deployable apps.

| Path        | What                                             |
| ----------- | ------------------------------------------------ |
| `backend/`  | Express 5 REST API (CommonJS), Supabase Postgres |
| `frontend/` | React 19 + Vite + Tailwind v4 single-page app    |
| `docs/`     | Design spec for the UX rebuild                   |

## Running it

Node 22 or newer.

```bash
npm install                  # installs both workspaces

cp backend/.env.example backend/.env       # then fill it in
cp frontend/.env.example frontend/.env

npm run dev                  # API on :3005 and web on :5173, together
```

The backend **refuses to start** without a complete environment. That is
deliberate: it used to boot with no database, export a null client, and turn
every request into a generic 500 while `/health` reported healthy.
`backend/config/env.js` names every missing variable at once so a deploy is
fixed in one pass.

### Commands

Run from the repo root.

| Command             | Does                                            |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Both servers, colour-tagged output              |
| `npm run verify`    | Format check, lint, all tests, production build |
| `npm test`          | Backend suites plus frontend suites             |
| `npm run test:load` | The 150-crew and 600-user load suites, serially |
| `npm run build`     | Production frontend bundle                      |
| `npm run format`    | Prettier across the repo                        |

`npm test` deliberately excludes the load suites. They take two minutes and
push hundreds of concurrent requests through the app, so they are a separate,
deliberate run rather than something that blocks every commit. CI runs both
jobs.

## Architecture

### Backend

`app.js` validates the environment, then mounts four routers under `/api`.

- **Auth.** Symmetric JWT for crews, issued by `POST /api/login`, verified by
  `requireAuth`. Admin routes use a static `x-admin-secret` header instead,
  which is a separate path on purpose.
- **One session per crew.** A crew shares one login across up to four phones.
  Signing in mints a session id and stores it on the row; an older device can
  still read its clue but cannot submit. Enforced only on the write endpoints,
  which already fetch the row, so it costs no extra queries. See
  `utils/session.js`.
- **Event gating.** `requireEventActive` blocks the verify endpoints before
  `started_at` and after whichever of `ended_at` or `started_at + duration`
  comes first. Config is cached for 5s (`utils/eventConfigCache.js`).
- **Rate limits.** Verify: 10 attempts per crew per 15 minutes. Login: 5 per
  crew per minute, with a loose 300-per-IP backstop. The per-IP number is
  deliberately high: at a venue every phone is behind one NAT address, and a
  tight per-IP login cap would lock out the whole event.
- **State machine.** `utils/teamState.js`. Each crew holds a `route` of five
  stops and alternates `awaiting_code` -> `awaiting_puzzle`. Both verify
  endpoints advance with a conditional UPDATE matched on the expected stage and
  progress, so four teammates submitting at once produce exactly one advance.
  A wrong code locks the crew; a wrong answer costs nothing.

#### Endpoints

All under `/api`. Team routes need a `Bearer` token from `/login`; admin
routes need the `x-admin-secret` header; register needs `x-webhook-secret`.

| Method | Path                  | Auth    | Does                                                |
| ------ | --------------------- | ------- | --------------------------------------------------- |
| GET    | `/event`              | none    | `started_at`, `duration_minutes`, `ended_at`        |
| POST   | `/login`              | none    | Team name + password, returns token and team        |
| POST   | `/team/register`      | webhook | Creates a crew and deals its random route           |
| GET    | `/team/state`         | token   | Current stage, clue or puzzle, notice, announcement |
| POST   | `/team/verify-code`   | token   | Station code. Wrong code locks the crew             |
| POST   | `/team/verify-answer` | token   | Puzzle answer. Advances to the next clue            |
| POST   | `/admin/start`        | admin   | Sets `started_at`                                   |
| POST   | `/admin/end`          | admin   | Sets `ended_at`                                     |
| POST   | `/admin/unlock-team`  | admin   | Clears a lockout                                    |
| GET    | `/admin/teams`        | admin   | Every crew's progress and status                    |
| POST   | `/admin/send-message` | admin   | Sets one crew's `notice`                            |
| POST   | `/admin/announce`     | admin   | Inserts an announcement every crew sees             |
| GET    | `/health`             | none    | 200 when the database answers, 503 otherwise        |

#### Database

The schema lives as SQL in `backend/db/migrations/`, applied in order. All
three files are idempotent, so re-running them against an existing project is
safe.

| File                     | Creates                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `001_schema.sql`         | `teams`, `islands`, `questions`, `event_config`, `announcements`    |
| `002_leaderboard.sql`    | The public `leaderboard` view, row-level security and grants        |
| `003_get_team_state.sql` | `get_team_state(uuid)`, which serves `GET /team/state` in one query |

Apply them in the Supabase SQL editor, or with `supabase db push` if the
project is linked. The backend works with or without `003`: when the RPC is
missing, `utils/teamState.js` falls back to four sequential queries.

`backend/db/seed.sql` is fixture data for local development only: ten islands
across the five route slots and eight questions across four domains. Never run
it against the event project.

### Frontend

Grouped by domain rather than by file type, because a flat `components/` folder
of twenty files tells you nothing about which of them are generic and which
belong to one screen.

```
src/
  main.jsx            entry
  App.jsx             providers only
  routes.jsx          route table, guards, code splitting
  api/                client.js (axios), supabase.js (browser client)
  config/rules.js     numbers the UI states that the server enforces
  content/            fragment records and the prologue crawl
  context/            AuthContext
  hooks/              useTeamState, useOnline, useCountdown
  lib/                motion tokens, error copy
  styles/index.css    theme, tokens, semantic motion
  components/
    shell/            Layout, SessionSheet
    ui/               Button, Input, Badge, Sheet, Skeleton, RemoteImage
    feedback/         StateView, StatusSlot, OfflineBanner, ErrorBoundary
    journey/          ClueCard, PuzzleCard, StopIndicator, sheets, LockoutScreen
    fragments/        FragmentDeck, FragmentRecord, FragmentReveal
    brand/            Wordmark
  pages/              Landing, Login, Journey, Fragments, Prologue,
                      Finished, Leaderboard, Admin, NotFound
```

Load-bearing decisions:

- **`useTeamState` is the only owner of `/team/state`.** 15s poll, with
  Supabase realtime used as a nudge to re-read rather than as a source of
  state, and a guard so an in-flight refetch cannot clobber a newer POST
  response.
- **One task per screen.** The Journey screen renders the current clue or
  question and nothing else. Route position, clue images, status and session
  all sit one tap behind a labelled control.
- **One status surface.** `StatusSlot` carries stale, rate-limit,
  teammate-moved, crew notice and broadcast in a single collapsible line.
  These were five stacked full-width boxes, plus a bell, for the same
  information.
- **Fragments work offline.** Derived from `progress`, never fetched, so they
  are correct on a freshly cleared phone. That is why a locked-out crew is sent
  there.
- **A 403 is not a logout.** Only a 401 ends a session. A 403 from the event
  gate is a normal game state.
- **Motion is tokenised.** Three durations and three curves in
  `styles/index.css`, mirrored in `lib/motion.js` with a dev-time drift
  warning. Anime.js is used at exactly one site, the fragment reveal, which a
  player sees four times in the whole event; everything else is CSS.

## Deploying

Frontend and backend deploy separately.

- **Frontend.** Any static host. `frontend/vercel.json` rewrites all paths to
  `index.html` for client-side routing. `frontend/.env.production` carries the
  API URL and is committed on purpose: Vite inlines it at build time, it is
  visible in the shipped bundle anyway, and leaving it to a host dashboard is
  what broke a previous deploy. Set `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` in the build environment if you want the public
  leaderboard; without them it shows its not-configured state rather than
  failing.
- **Backend.** Node or serverless. `app.js` exports the app and only calls
  `.listen()` under `require.main === module`, so it runs both ways. Set every
  variable in `backend/.env.example` marked required, and set
  `TRUST_PROXY_HOPS` to the number of proxies in front of it (1 behind Vercel).
  Too high lets clients spoof `X-Forwarded-For` and dodge the rate limiter.

`/health` returns 200 when the database answers and **503** when it does not,
so an uptime monitor reads the status code rather than a string in the body.
