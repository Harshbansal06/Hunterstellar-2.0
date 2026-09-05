/**
 * Placeholders shaped like the content they stand in for, so the layout does
 * not jump when the real thing arrives. A centred spinner cannot do that.
 */
export function Skeleton({ className = '' }) {
  return (
    <div
      className={`bg-surface-alt/60 rounded animate-pulse-soft ${className}`}
      aria-hidden="true"
    />
  )
}

export function SkeletonText({ lines = 4 }) {
  return (
    <div className="w-full flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** The clue screen: headline, prose, artwork, and the input the team needs. */
export function ClueSkeleton() {
  return (
    <div
      className="w-full px-6 py-6 flex flex-col gap-6"
      role="status"
      aria-label="Loading clue"
    >
      <Skeleton className="h-10 w-40" />
      <SkeletonText lines={5} />
      <Skeleton className="w-full aspect-[4/3] rounded-md" />
      <div className="flex flex-col gap-3 pt-2">
        <Skeleton className="h-[52px] w-full rounded-md" />
        <Skeleton className="h-[52px] w-full rounded-md" />
      </div>
      <span className="sr-only">Loading your clue…</span>
    </div>
  )
}

export function LeaderboardSkeleton({ rows = 6 }) {
  return (
    <div
      className="w-full flex flex-col gap-3 px-6"
      role="status"
      aria-label="Loading leaderboard"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[68px] w-full rounded-md" />
      ))}
      <span className="sr-only">Loading standings…</span>
    </div>
  )
}
