import { useEffect, useState } from 'react'
import { subscribeLoading } from '../../lib/loadingBus'

/**
 * A thin progress bar pinned to the top of the viewport while a foreground
 * request is in flight.
 *
 * A bar and not a spinner or an overlay: the screens underneath stay readable
 * and stay usable, which matters most on the clue screen, where a crew is
 * reading while a submission travels. An overlay would take the clue away at
 * the exact moment they are checking it against the door in front of them.
 *
 * Two delays keep it from being noise:
 *
 *   It waits 180ms before appearing. Most requests at a venue finish inside
 *   that, and a bar that flashes for 90ms reads as a glitch rather than as
 *   feedback.
 *
 *   It holds for 200ms after finishing, so a bar that did appear completes its
 *   travel instead of vanishing mid-stride.
 *
 * Only foreground work counts; see lib/loadingBus.js.
 */
const APPEAR_AFTER_MS = 180
const HOLD_MS = 200

export function GlobalLoader() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let appearTimer = null
    let hideTimer = null

    const unsubscribe = subscribeLoading((busy) => {
      clearTimeout(appearTimer)
      clearTimeout(hideTimer)

      if (busy) {
        appearTimer = setTimeout(() => setVisible(true), APPEAR_AFTER_MS)
      } else {
        hideTimer = setTimeout(() => setVisible(false), HOLD_MS)
      }
    })

    return () => {
      clearTimeout(appearTimer)
      clearTimeout(hideTimer)
      unsubscribe()
    }
  }, [])

  if (!visible) return null

  return (
    <div
      // `polite`, never `assertive`: this is ambient progress, and an
      // assertive region would interrupt a screen reader mid-sentence every
      // time a crew submits a code.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] bg-accent/15"
    >
      <div className="global-loader-bar h-full w-1/3 bg-accent" />
      <span className="sr-only">Working</span>
    </div>
  )
}

export default GlobalLoader
