/**
 * The single place an error becomes words a player reads.
 *
 * Nothing else in the app should write an error string inline. Two reasons:
 * the copy has to stay consistent across a dozen screens, and several of these
 * cases are easy to get subtly wrong in ways that cost a team the hunt --
 * telling someone "wrong answer" when they were actually rate-limited sends
 * them hunting for a better answer they already had.
 */

import { VERIFY_ATTEMPTS, VERIFY_WINDOW_MINUTES } from '../config/rules'

export const RETRY = {
  AUTO: 'auto', // we retry with backoff, no user action
  MANUAL: 'manual', // show a Retry button
  COUNTDOWN: 'countdown', // blocked until a timer expires
  POLL: 'poll', // poll slowly, will resolve itself
  NONE: 'none', // terminal, nothing to do
}

/** Seconds until a 429 lifts, read from the standard header the API sets. */
export function retryAfterSeconds(err) {
  const headers = err?.response?.headers || {}
  const reset = headers['ratelimit-reset'] ?? headers['retry-after']
  const parsed = Number(reset)
  if (Number.isFinite(parsed) && parsed > 0) return Math.ceil(parsed)
  return null
}

/**
 * @param err   an axios error
 * @param ctx   'login' | 'clue' | 'question' | 'state'. Tunes the wording
 */
export function describeError(err, ctx = 'state') {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      kind: 'offline',
      title: "You're offline",
      body: 'Your progress is safe. This will pick up as soon as you reconnect.',
      retry: RETRY.AUTO,
    }
  }

  const status = err?.response?.status
  const serverMessage = err?.response?.data?.error

  if (!status) {
    return {
      kind: 'network',
      title: 'No signal from the network',
      body: 'Check your signal and try again.',
      retry: RETRY.AUTO,
    }
  }

  if (status === 401) {
    return {
      kind: 'auth',
      title: 'Your session expired',
      body: 'Log in again to pick up where you left off.',
      retry: RETRY.NONE,
    }
  }

  if (status === 403) {
    // Event gating is not an auth failure and must never log anyone out.
    if (/not started/i.test(serverMessage || '')) {
      return {
        kind: 'not_started',
        title: "The hunt hasn't started yet",
        body: 'This screen will open by itself the moment it does.',
        retry: RETRY.POLL,
      }
    }
    if (/ended/i.test(serverMessage || '')) {
      return {
        kind: 'ended',
        title: 'The hunt has ended',
        body: 'Head back to base. Check the leaderboard for the final standings.',
        retry: RETRY.NONE,
      }
    }
    return {
      kind: 'forbidden',
      title: 'Not allowed',
      body: serverMessage || 'You do not have access to this.',
      retry: RETRY.NONE,
    }
  }

  if (status === 404 && ctx === 'login') {
    return {
      kind: 'no_team',
      title: 'No team with that name',
      body: 'Check the spelling against your registration confirmation.',
      retry: RETRY.MANUAL,
    }
  }

  if (status === 429) {
    const seconds = retryAfterSeconds(err)
    if (ctx === 'login') {
      return {
        kind: 'rate_login',
        title: 'Too many sign-in attempts',
        body: 'Wait a moment before trying again.',
        retry: RETRY.COUNTDOWN,
        seconds,
      }
    }
    return {
      kind: 'rate_verify',
      // The verify budget is per TEAM, not per person. Four teammates share
      // it, so "you" would send someone hunting for a bug that isn't theirs.
      title: 'Your team has used all its attempts',
      body: `The limit is ${VERIFY_ATTEMPTS} tries per team every ${VERIFY_WINDOW_MINUTES} minutes.`,
      retry: RETRY.COUNTDOWN,
      seconds,
    }
  }

  if (status >= 500) {
    return {
      kind: 'server',
      title: 'Something broke on our end',
      body: 'Your progress is safe. Try again in a moment.',
      retry: RETRY.MANUAL,
    }
  }

  return {
    kind: 'unknown',
    title: 'Something went wrong',
    body: serverMessage || 'Try again, or show this screen to a marshal.',
    retry: RETRY.MANUAL,
  }
}

/** Formats a second count as M:SS for countdown copy. */
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.ceil(totalSeconds || 0))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
