import { useEffect, useState } from 'react'
import { RemoteImage } from '../ui/RemoteImage'

/**
 * The station's challenge, and the one thing to do about it.
 *
 * Same shape as ClueCard so the two stages of a stop read as one place with
 * two states rather than two different screens. The display heading changes
 * word and colour; everything below it holds position, so a player's thumb
 * lands in the same spot both times.
 */

const NUMERALS = ['I', 'II', 'III', 'IV', 'V']

export function PuzzleCard({
  question,
  images = [],
  progress = 0,
  onSubmit,
  loading,
  error,
  disabled = false,
  disabledHint,
  onDirtyChange,
}) {
  const [answer, setAnswer] = useState('')
  const stop = Math.min(Math.max(progress, 0), 4)

  // Same contract as ClueCard: an unmounted input is not dirty.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  function update(value) {
    setAnswer(value)
    onDirtyChange?.(value.trim().length > 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!answer.trim() || loading || disabled) return
    const ok = await onSubmit(answer.trim())
    if (ok) {
      setAnswer('')
      onDirtyChange?.(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-7 px-5 pb-10 pt-5 sm:px-6">
      <div className="flex flex-col gap-5">
        <h2 className="display-grunge text-[clamp(2rem,9vw,2.75rem)] leading-none text-teal">
          Challenge {NUMERALS[stop]}
        </h2>

        {question ? (
          <p className="whitespace-pre-line text-[17px] leading-relaxed text-text-secondary">
            {question}
          </p>
        ) : (
          <p className="text-[13px] text-amber">
            This question did not load. Pull to refresh, or show this screen to a marshal.
          </p>
        )}

        {images.length > 0 && (
          <div className="flex flex-col gap-3">
            {images.map((src, i) => (
              <RemoteImage
                key={src || i}
                src={src}
                alt={`Question image ${i + 1}`}
                fallbackNote="Image did not load. The written question is complete on its own."
              />
            ))}
          </div>
        )}

        {/* Wrong codes lock a crew; wrong answers do not. Crews conflate the
            two and stop guessing, so say it before they submit, not after. */}
        <p className="text-[12px] text-text-muted">
          Wrong answers do not lock you. Take your best guess.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <input
          value={answer}
          onChange={(e) => update(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          placeholder="Enter your answer here"
          aria-label="Your answer"
          className="h-[60px] w-full rounded-md border border-surface-alt bg-surface px-5 text-base text-text-primary outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-50"
        />

        {error && (
          <p role="alert" className="shake text-center text-[13px] text-red">
            {error}
          </p>
        )}
        {disabled && disabledHint && (
          <p className="text-center text-[12px] text-text-muted">{disabledHint}</p>
        )}

        <button
          type="submit"
          disabled={loading || disabled || !answer.trim()}
          className="motion-press h-[52px] w-full cursor-pointer rounded-md bg-accent font-display text-lg text-text-inverse disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {loading ? 'Verifying...' : 'Submit Answer'}
        </button>
      </form>
    </div>
  )
}
