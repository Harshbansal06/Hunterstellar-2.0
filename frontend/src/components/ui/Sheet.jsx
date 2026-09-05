import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * The one disclosure surface for everything at Tier 2.
 *
 * A sheet, not a centred dialog: this app is a phone held one-handed in a
 * corridor, and a sheet rising from the bottom edge puts its controls under the
 * thumb and respects touch physics. A centred modal does neither.
 *
 * It rises from the bottom and it leaves through the bottom. Reverse retraces
 * the forward axis, because a sheet that arrives from below and exits sideways
 * breaks the spatial model the player just built.
 *
 * Portalled into `#hs-sheet-root`, which Layout pins to the viewport. The page
 * itself scrolls, so the sheet cannot be absolutely positioned inside the
 * content column: it would land at the bottom of the document rather than the
 * bottom of the screen. It is fixed to the viewport and re-centred to the same
 * max-width as the column, so on a phone it is full-bleed and on a desktop it
 * rises inside the column rather than spanning the whole window.
 *
 * A11y contract, all of it load-bearing because this is the only new primitive:
 *   - role="dialog" + aria-modal, labelled by its own title
 *   - focus moves in on open and is restored to the trigger on close
 *   - Tab is trapped inside
 *   - Escape closes
 *   - the scrim closes on click but is aria-hidden
 *   - the page behind cannot scroll while it is open
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Matches --duration-base. Only used to keep the exiting sheet mounted long
// enough to animate out; the animation itself is CSS.
const EXIT_MS = 220

export function Sheet({
  open,
  onClose,
  title,
  /** 'auto' hugs the content. 'full' takes the frame minus a peek of the page. */
  detent = 'auto',
  /** Hides the header row for sheets that are pure media. */
  bare = false,
  children,
}) {
  // Kept mounted through the exit animation, so closing is visible rather than
  // an instant disappearance.
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  const panelRef = useRef(null)
  const returnFocusTo = useRef(null)
  const titleId = useId()

  // Drag-to-dismiss offset, in px. Null when not dragging.
  const [dragY, setDragY] = useState(null)
  const dragStart = useRef(0)

  // Derived during render rather than in an effect. React's documented pattern
  // for reacting to a changed prop: an effect would commit one frame in the
  // wrong state first, which on a sheet means a visible flicker on open.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPresent(true)
      setClosing(false)
    } else if (present) {
      setClosing(true)
    }
  }

  // Unmount once the exit animation has run. setState inside a timeout is not
  // a synchronous effect body, so this does not cascade renders.
  useEffect(() => {
    if (!closing) return undefined
    const t = setTimeout(() => {
      setPresent(false)
      setClosing(false)
      setDragY(null)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [closing])

  // Remember what to give focus back to, before the sheet steals it.
  useEffect(() => {
    if (!open) return
    returnFocusTo.current = document.activeElement
  }, [open])

  // Move focus in. The panel itself is the target rather than the first
  // control: landing on a close button reads as "close this" to a screen
  // reader before the title has been announced.
  useEffect(() => {
    if (!present || closing) return
    const panel = panelRef.current
    if (!panel) return
    const t = requestAnimationFrame(() => panel.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(t)
  }, [present, closing])

  // Restore focus on the way out.
  useEffect(() => {
    if (present) return
    const target = returnFocusTo.current
    if (target && typeof target.focus === 'function' && document.contains(target)) {
      target.focus({ preventScroll: true })
    }
    returnFocusTo.current = null
  }, [present])

  // Lock the page behind. Restores whatever overflow was there before rather
  // than assuming it was the default.
  useEffect(() => {
    if (!present) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [present])

  // Escape to close, and Tab wrapped inside.
  useEffect(() => {
    if (!present || closing) return undefined

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        // Nothing focusable inside: keep focus on the panel rather than
        // letting Tab escape to the page behind the scrim.
        e.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [present, closing, onClose])

  // --- drag to dismiss, on the handle only ------------------------------
  // Scoped to the grab handle so a scrollable body still scrolls. A sheet you
  // cannot swipe down feels broken on a phone, which is reason enough.

  const onHandleDown = useCallback((e) => {
    dragStart.current = e.clientY
    setDragY(0)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const onHandleMove = useCallback(
    (e) => {
      if (dragY === null) return
      // Downward only. Dragging up must not detach the sheet from its edge.
      setDragY(Math.max(0, e.clientY - dragStart.current))
    },
    [dragY],
  )

  const onHandleUp = useCallback(() => {
    if (dragY === null) return
    const travelled = dragY
    setDragY(null)
    // A short drag snaps back; past the threshold it reads as intent to close.
    if (travelled > 88) onClose?.()
  }, [dragY, onClose])

  if (!present) return null

  const root =
    typeof document === 'undefined' ? null : document.getElementById('hs-sheet-root')
  if (!root) return null

  // Against the viewport now, so dvh rather than a percentage of a parent that
  // no longer has a fixed height.
  const heightClass = detent === 'full' ? 'h-[86dvh]' : 'max-h-[86dvh]'
  const dragging = dragY !== null

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`pointer-events-auto fixed inset-0 bg-black/70 ${
          closing ? 'motion-scrim-out' : 'motion-scrim-in'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={bare ? undefined : titleId}
        aria-label={bare ? title : undefined}
        tabIndex={-1}
        style={dragging ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`pointer-events-auto fixed inset-x-0 bottom-0 mx-auto w-full max-w-[560px]
          ${heightClass} flex flex-col border-t border-border bg-surface outline-none
          focus-visible:ring-1 focus-visible:ring-accent
          ${dragging ? '' : closing ? 'motion-sheet-out' : 'motion-sheet-in'}`}
      >
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="shrink-0 pt-3 pb-1 flex items-center justify-center cursor-grab touch-none"
        >
          <span aria-hidden="true" className="w-10 h-1 bg-border rounded-full" />
        </div>

        {!bare && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 pb-3 pt-1">
            <h2
              id={titleId}
              className="font-display text-base tracking-wide text-text-primary truncate"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-center
                text-text-muted hover:text-text-primary motion-press cursor-pointer
                focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          {children}
        </div>
      </div>
    </>,
    root,
  )
}

export default Sheet
