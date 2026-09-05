import { WifiOff } from 'lucide-react'
import { useOnline } from '../hooks/useOnline'

/**
 * Sticky, non-blocking. A team that walks into a dead spot mid-station should
 * understand why the button stopped working rather than assume the app broke.
 */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null

  return (
    <div
      role="status"
      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber/15 border-b border-amber/40 shrink-0"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber shrink-0" />
      <span className="text-[11px] text-amber">
        Signal lost — showing your last clue. Submissions resume when you reconnect.
      </span>
    </div>
  )
}
