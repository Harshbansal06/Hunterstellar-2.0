import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import supabase from '../api/supabase'
import { describeError } from '../lib/errorCopy'

const POLL_MS = 30000
const REALTIME_DEBOUNCE_MS = 300

/**
 * The one owner of /team/state.
 *
 * Previously AuthContext and Dashboard each fetched this on login (two round
 * trips), and Dashboard's effect depended on the `user` object that its own
 * fetch replaced -- so every poll tore down and rebuilt the interval and the
 * realtime channel.
 *
 * `applyState` lets a caller push the state a POST already returned. The
 * verify endpoints hand back the full next state, so trusting that response is
 * both faster than re-fetching and immune to the server's per-process cache
 * briefly disagreeing across instances.
 */
export function useTeamState({ teamId, enabled = true } = {}) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // A refresh must never clobber a newer state that a submission just set.
  const latestWriteAt = useRef(0)
  const cancelled = useRef(false)

  const applyState = useCallback((next) => {
    if (!next) return
    latestWriteAt.current = Date.now()
    setState(next)
    setError(null)
    setLastUpdated(Date.now())
  }, [])

  const refetch = useCallback(async () => {
    if (!enabled) return null
    const startedAt = Date.now()
    try {
      // `background: true` keeps the 30s poll out of the global progress bar.
      // Without it the bar blinks at a crew every half minute all event.
      const { data } = await api.get('/team/state', { background: true })
      if (cancelled.current) return null
      // A submission that landed while this was in flight wins.
      if (startedAt < latestWriteAt.current) return null
      setState(data)
      setError(null)
      setLastUpdated(Date.now())
      return data
    } catch (err) {
      if (cancelled.current) return null
      // Keep the last good state on screen -- a failed background refresh
      // must not blank a clue the team is standing in front of.
      setError(describeError(err, 'state'))
      return null
    }
  }, [enabled])

  useEffect(() => {
    cancelled.current = false
    if (!enabled) return undefined

    // Fetch-on-mount. Every setState inside refetch happens after an await,
    // so this cannot cascade renders; the rule cannot see through the async
    // callback boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch()
    const interval = setInterval(() => refetch(), POLL_MS)

    return () => {
      cancelled.current = true
      clearInterval(interval)
    }
  }, [enabled, refetch])

  // Realtime is a nudge to re-read, never a source of state: the payload is a
  // raw `teams` row with no clue_statement or question, so adopting it
  // directly used to blank the clue until the next poll.
  useEffect(() => {
    if (!enabled || !supabase || !teamId) return undefined

    let timer = null
    const nudge = () => {
      clearTimeout(timer)
      timer = setTimeout(() => refetch(), REALTIME_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel(`team-state-${teamId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` },
        nudge,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        nudge,
      )
      .subscribe()

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [enabled, teamId, refetch])

  // Loading is exactly "we have neither state nor an error yet". Deriving it
  // instead of tracking a flag means no setState in the mount effect, and a
  // background refresh can never flip the screen back to a skeleton once real
  // content has been shown.
  const loading = enabled && state === null && error === null

  return { state, loading, error, lastUpdated, refetch, applyState }
}
