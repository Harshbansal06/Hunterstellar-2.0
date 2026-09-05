import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'
import { RETRY } from '../../lib/errorCopy'

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
        <p className="text-sm text-text-muted max-w-70">{error.body}</p>

        {error.retry === RETRY.POLL && (
          <p className="text-xs text-text-muted/70 mt-1">Checking every minute…</p>
        )}
        {error.retry === RETRY.AUTO && (
          <p className="text-xs text-text-muted/70 mt-1">Retrying automatically…</p>
        )}

        {canRetry && onRetry && (
          <button
            onClick={onRetry}
            className="motion-press mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-accent px-6 font-display text-sm text-text-inverse"
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

/*
 * `StaleChip` used to live here. Staleness is now one entry in StatusSlot
 * alongside the other four conditions that each used to own a full-width box,
 * so a separate chip component would be a second way to say the same thing in
 * a different place.
 */
