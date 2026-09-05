import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { Skeleton } from './Skeleton'

/**
 * A remotely-hosted clue or question image.
 *
 * Artwork is decoration; the written text is always sufficient on its own. A
 * broken or slow image must never hide or delay the input below it, so this
 * carries its own loading and error states and collapses to a retry card
 * rather than an empty gap or a browser's broken-image glyph.
 *
 * Shared by the clue and puzzle screens so both behave identically on a bad
 * connection -- which, at an outdoor event on mobile data, is the normal case
 * rather than the edge one.
 */
export function RemoteImage({ src, alt, fallbackNote }) {
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  if (status === 'error') {
    return (
      <div className="w-full rounded-md border border-border bg-surface px-4 py-5 flex flex-col items-center gap-2 text-center">
        <ImageOff className="w-5 h-5 text-text-muted" strokeWidth={1.5} />
        <p className="text-xs text-text-muted">{fallbackNote}</p>
        <button
          type="button"
          onClick={() => {
            setStatus('loading')
            // Remounting the <img> via key is what actually re-requests it;
            // setting the same src again would be a no-op.
            setAttempt((n) => n + 1)
          }}
          className="text-xs text-accent underline cursor-pointer"
        >
          Retry image
        </button>
      </div>
    )
  }

  return (
    <div className="w-full relative rounded-md overflow-hidden border border-border bg-surface">
      {status === 'loading' && <Skeleton className="w-full aspect-[4/3]" />}
      <img
        key={attempt}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
        className={`w-full h-auto block ${status === 'ready' ? '' : 'absolute opacity-0 pointer-events-none'}`}
      />
    </div>
  )
}
