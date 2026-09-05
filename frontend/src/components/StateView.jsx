import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'
import { RETRY } from '../utils/errorCopy'

/**
 * The one place an async screen turns {loading, error} into something a player
 * can act on. Every branch either recovers by itself or offers a button --
 * a dead end with no affordance is the failure mode this exists to prevent.
 *
 * `stale` content wins over an error: a team standing at a station must keep
 * seeing their clue even when a background refresh fails.
 */
export function StateView({
  loading,
  error,
  empty,
  emptyLabel = 'Nothing here yet.',
  onRetry,
  skeleton,
  hasContent = false,
  children,
}) {
  if (loading && !hasContent) {
    return skeleton || null
  }

  if (error && !hasContent) {
    const offline = error.kind === 'offline' || error.kind === 'network'
    const Icon = offline ? WifiOff : AlertTriangle
    const canRetry = error.retry === RETRY.MANUAL || error.retry === RETRY.AUTO

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3 py-16">
        <Icon className="w-8 h-8 text-text-muted" strokeWidth={1.5} />
        <h2 className="font-display text-lg text-text-primary">{error.title}</h2>
        <p className="text-sm text-text-muted max-w-[280px]">{error.body}</p>

        {error.retry === RETRY.POLL && (
          <p className="text-xs text-text-muted/70 mt-1">Checking every minute…</p>
        )}
        {error.retry === RETRY.AUTO && (
          <p className="text-xs text-text-muted/70 mt-1">Retrying automatically…</p>
        )}

        {canRetry && onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 bg-[#f6f6f6] text-text-inverse px-6 py-2.5 rounded-md font-display text-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        )}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="flex-1 flex items-center justify-center px-8 text-center py-16">
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      </div>
    )
  }

  return children
}

/**
 * Shown alongside content that is known to be out of date -- the team keeps
 * reading while we quietly reconnect.
 */
export function StaleChip({ lastUpdated, now, onRetry }) {
  // `now` is passed in rather than read here: reading the clock during render
  // is impure and makes the output non-deterministic for a given state.
  const seconds = lastUpdated && now ? Math.round((now - lastUpdated) / 1000) : null
  return (
    <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-amber/40 bg-amber/10">
      <span className="text-[11px] text-amber">
        {seconds != null ? `Last updated ${seconds}s ago · ` : ''}Restoring link…
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[11px] text-amber underline cursor-pointer shrink-0"
        >
          Refresh
        </button>
      )}
    </div>
  )
}
