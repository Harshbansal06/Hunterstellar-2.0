import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trophy, Users } from 'lucide-react'
import supabase from '../api/supabase'
import { useAuth } from '../context/AuthContext'
import { LeaderboardSkeleton } from '../components/ui/Skeleton'
import { Layout } from '../components/shell/Layout'

/**
 * Standings.
 *
 * Row treatment follows docs/design/leaderboard-comp.png: first place is a
 * solid accent slab, second is outlined, third is inverted, and everything
 * below is a plain surface row. That is a real hierarchy rather than one card
 * style stamped eleven times, and it means the top of the board reads at a
 * glance from arm's length.
 *
 * The per-row 5px progress bar is gone. The row already states "3/5" and
 * "3 fragments secured", so the bar was a third channel for a fact told twice.
 *
 * The crew's own row is marked wherever it lands, because finding yourself in a
 * list of 150 is the actual job on this screen.
 */

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function statusLabel(status) {
  if (!status) return null
  const s = String(status).toLowerCase()
  if (s === 'finished' || s === 'complete' || s === 'done') return 'Finished'
  if (s === 'locked' || s === 'cooldown') return 'On cooldown'
  if (s === 'active' || s === 'awaiting_puzzle' || s === 'awaiting_code') return 'Active'
  return s
}

const BASE_COLUMNS = 'team_name, progress, status, last_correct_at'

/**
 * `in_null_void` only exists once migration 002 has been applied. Selecting a
 * column the view does not have is a hard error in Postgres, so ask for it
 * first and fall back to the original column list. Otherwise deploying the
 * frontend ahead of the migration takes the whole leaderboard down.
 */
async function fetchRows() {
  const withVoid = await supabase
    .from('leaderboard')
    .select(`${BASE_COLUMNS}, in_null_void`)
  if (!withVoid.error) return withVoid.data || []

  const legacy = await supabase.from('leaderboard').select(BASE_COLUMNS)
  if (legacy.error) throw legacy.error
  return legacy.data || []
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [teams, setTeams] = useState([])
  // Initialised from whether a client exists at all. Setting it false inside
  // the effect for the unconfigured case was a synchronous effect setState.
  const [loading, setLoading] = useState(() => Boolean(supabase))
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async (cancelled) => {
    try {
      const rows = await fetchRows()
      if (cancelled?.()) return
      setTeams(rows)
      setError('')
      setUpdatedAt(Date.now())
    } catch {
      if (!cancelled?.()) setError('Could not load the standings.')
    } finally {
      if (!cancelled?.()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let done = false
    const cancelled = () => done

    // `load` awaits the query before it touches state, but the compiler cannot
    // see through the async boundary and reads the call as a synchronous
    // setState in the effect body. Deferring by a macrotask makes that
    // provable rather than suppressing the rule, and costs nothing on a path
    // that is about to make a network round trip anyway.
    const kick = setTimeout(() => load(cancelled), 0)
    const interval = setInterval(() => load(cancelled), 10000)

    return () => {
      done = true
      clearTimeout(kick)
      clearInterval(interval)
    }
  }, [load])

  const configured = Boolean(supabase)
  const displayError = configured ? error : 'Live standings are not configured.'

  const sorted = [...teams].sort((a, b) => {
    if ((b.progress ?? 0) !== (a.progress ?? 0))
      return (b.progress ?? 0) - (a.progress ?? 0)
    if (a.last_correct_at && b.last_correct_at)
      return new Date(a.last_correct_at) - new Date(b.last_correct_at)
    if (a.last_correct_at) return -1
    if (b.last_correct_at) return 1
    return 0
  })

  let body
  if (configured && loading && sorted.length === 0) {
    body = <LeaderboardSkeleton />
  } else if (displayError && sorted.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-[14px] text-text-muted">{displayError}</p>
        {configured && (
          <button
            onClick={() => load()}
            className="flex items-center gap-2 px-4 min-h-11 rounded-md bg-surface border
              border-surface-alt text-text-secondary text-[14px] motion-press cursor-pointer
              focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again
          </button>
        )}
      </div>
    )
  } else if (sorted.length === 0) {
    // Honest zero. "No teams registered yet" is a real state, and it is not
    // the same thing as a query that failed.
    body = (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Users
          className="w-10 h-10 text-text-muted"
          strokeWidth={1.4}
          aria-hidden="true"
        />
        <p className="text-text-primary text-[16px] font-medium">
          No crews registered yet.
        </p>
        <p className="text-text-muted text-[14px] max-w-[240px]">
          Be the first to solve a station challenge and claim the top of the route.
        </p>
      </div>
    )
  } else {
    body = (
      <ol className="w-full flex flex-col gap-2.5">
        {sorted.map((team, i) => (
          <Row
            key={team.team_name}
            team={team}
            rank={i + 1}
            isSelf={Boolean(user?.team_name) && team.team_name === user.team_name}
          />
        ))}
      </ol>
    )
  }

  return (
    <Layout title="Standings">
      <div className="flex-1 flex flex-col px-5 pt-6 pb-8 w-full gap-5">
        <header className="w-full flex flex-col gap-2">
          <h1 className="display-grunge text-[40px] leading-none text-text-primary">
            Leaderboard
          </h1>
          <p className="text-text-muted text-[14px] leading-relaxed">
            Crews ranked by fragments recovered, ties broken by who got there first.
          </p>
          {updatedAt && (
            <p className="font-mono text-[12px] text-text-muted/70 uppercase tracking-[0.14em]">
              Updated {relativeTime(updatedAt)}
            </p>
          )}
        </header>

        {body}
      </div>
    </Layout>
  )
}

/**
 * Four treatments, spent by rank. Border, fill and weight each say "this one
 * matters more", so they are used where that is true instead of on every row.
 */
function Row({ team, rank, isSelf }) {
  const progress = team.progress ?? 0
  const inVoid = team.in_null_void ?? progress >= 5
  const status = statusLabel(team.status)

  const first = rank === 1
  const second = rank === 2
  const third = rank === 3

  const shell = first
    ? 'bg-accent border-accent'
    : second
      ? 'bg-transparent border-text-secondary'
      : third
        ? 'bg-text-primary border-text-primary'
        : 'card-noise border-surface-alt/50'

  const nameTone = first || third ? 'text-text-inverse' : 'text-text-primary'
  const metaTone = first || third ? 'text-text-inverse/70' : 'text-text-muted'
  const rankTone =
    first || third
      ? 'text-text-inverse'
      : second
        ? 'text-text-secondary'
        : 'text-text-muted'

  return (
    <li
      className={`relative flex items-center gap-3 px-4 py-3.5 border ${shell} ${
        isSelf ? 'ring-1 ring-teal ring-offset-2 ring-offset-bg' : ''
      }`}
    >
      <span
        className={`font-bebas text-[26px] leading-none tabular-nums w-8 shrink-0 ${rankTone}`}
      >
        {rank}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <p className={`font-display text-[16px] truncate ${nameTone}`}>
            {team.team_name}
          </p>
          {first && (
            <Trophy
              className="w-4 h-4 shrink-0 text-text-inverse"
              strokeWidth={2}
              aria-hidden="true"
            />
          )}
          {isSelf && (
            <span
              className={`shrink-0 font-mono text-[12px] tracking-[0.14em] uppercase px-1.5
                border border-teal text-teal ${first || third ? 'bg-bg' : ''}`}
            >
              You
            </span>
          )}
        </div>
        <p className={`text-[12px] truncate ${metaTone}`}>
          {inVoid
            ? 'In the Null Void'
            : `${progress} fragment${progress === 1 ? '' : 's'} secured`}
          {team.last_correct_at ? ` · ${relativeTime(team.last_correct_at)}` : ''}
        </p>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className={`font-bebas text-[20px] leading-none tabular-nums ${rankTone}`}>
          {progress}/5
        </span>
        {(inVoid || status) && (
          <span
            className={`font-mono text-[12px] tracking-[0.1em] uppercase whitespace-nowrap px-1.5
              border ${
                inVoid
                  ? 'border-void-gold/60 text-void-gold bg-bg'
                  : first || third
                    ? 'border-text-inverse/40 text-text-inverse/80'
                    : 'border-border text-text-muted'
              }`}
          >
            {inVoid ? 'Null Void' : status}
          </span>
        )}
      </div>
    </li>
  )
}
