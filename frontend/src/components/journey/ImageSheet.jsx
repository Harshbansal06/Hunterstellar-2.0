import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Skeleton } from '../ui/Skeleton'

/**
 * Clue artwork at full size.
 *
 * The clue screen shows the first image only, boxed at the skeleton's aspect
 * ratio. Any further images used to stack inline, which pushed the code input
 * below the fold on a 412px frame. They live here instead, one tap away.
 *
 * The first image is deliberately NOT hidden behind this sheet. Artwork can be
 * the thing that identifies the physical location, and a team that cannot find
 * the station loses the hunt, so the cost of hiding all of it is far higher
 * than the cost of one boxed image on the clue screen.
 */

/**
 * Keyed on `src` by the caller, so a new image is a new instance with fresh
 * state. Resetting via an effect would show the previous image's resolved
 * state for one frame.
 */
function Frame({ src, index, total }) {
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  if (status === 'error') {
    return (
      <div
        className="w-full border border-border bg-bg px-4 py-10 flex flex-col
          items-center gap-3 text-center"
      >
        <ImageOff className="w-6 h-6 text-text-muted" strokeWidth={1.5} />
        <p className="text-[13px] text-text-muted max-w-[240px]">
          This image did not load. The written clue is complete on its own.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('loading')
            setAttempt((n) => n + 1)
          }}
          className="min-h-11 px-3 text-[13px] text-accent underline motion-press cursor-pointer
            focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="w-full relative border border-border bg-bg">
      {status === 'loading' && <Skeleton className="w-full aspect-[4/3]" />}
      <img
        key={attempt}
        src={src}
        alt={total > 1 ? `Clue image ${index + 1} of ${total}` : 'Clue image'}
        decoding="async"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
        className={`w-full h-auto block ${
          status === 'ready' ? '' : 'absolute opacity-0 pointer-events-none'
        }`}
      />
    </div>
  )
}

export function ImageSheet({ open, onClose, images = [], startIndex = 0 }) {
  const total = images.length
  const [index, setIndex] = useState(startIndex)
  const [prevOpen, setPrevOpen] = useState(open)

  // Re-enter at whichever image was tapped, not wherever the last visit ended.
  // Adjusted during render rather than in an effect: an effect would paint the
  // previously viewed image for one frame before jumping.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setIndex(Math.min(Math.max(startIndex, 0), Math.max(total - 1, 0)))
  }

  // Arrow keys, because this sheet is the one place with a sequence to walk.
  useEffect(() => {
    if (!open || total < 2) return undefined
    function onKey(e) {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, total - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, total])

  if (total === 0) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={total > 1 ? `Transmission images` : 'Transmission image'}
      detent="full"
    >
      <div className="flex flex-col gap-4">
        <Frame key={images[index]} src={images[index]} index={index} total={total} />

        {total > 1 && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              aria-label="Previous image"
              className="w-11 h-11 flex items-center justify-center border border-border
                text-text-secondary disabled:opacity-35 motion-press cursor-pointer
                focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={2} />
            </button>

            <div className="flex items-center gap-2" role="tablist" aria-label="Images">
              {images.map((src, i) => (
                <button
                  key={src || i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Image ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className="w-11 h-11 flex items-center justify-center motion-press cursor-pointer
                    focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                >
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 ${i === index ? 'bg-accent' : 'bg-border'}`}
                  />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
              disabled={index === total - 1}
              aria-label="Next image"
              className="w-11 h-11 flex items-center justify-center border border-border
                text-text-secondary disabled:opacity-35 motion-press cursor-pointer
                focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            >
              <ChevronRight className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

export default ImageSheet
