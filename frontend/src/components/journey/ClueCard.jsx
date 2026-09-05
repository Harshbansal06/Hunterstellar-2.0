import { useEffect, useState } from 'react'
import { Images } from 'lucide-react'
import { RemoteImage } from '../ui/RemoteImage'
import { LOCKOUT_MINUTES } from '../../config/rules'

/**
 * The clue, and the one thing to do about it.
 *
 * The screen has a single dominant element. The strongest type here used to be
 * a `text-xl` label reading "Station Computer", which is chrome, while the clue
 * itself sat at the same weight as everything around it.
 *
 * Artwork is decoration for finding a place, never a gate. The first image is
 * shown inline; any others are one tap away in a sheet, because stacking them
 * all inline pushed the code input below the fold on a narrow screen. A broken
 * or slow image can never hide or delay the input, which renders regardless.
 */

const NUMERALS = ['I', 'II', 'III', 'IV', 'V']

export function ClueCard({
  clue,
  images = [],
  cue,
  terminal = false,
  progress = 0,
  onSubmit,
  onOpenImages,
  loading,
  error,
  disabled = false,
  disabledHint,
  onDirtyChange,
}) {
  const [code, setCode] = useState('')
  const stop = Math.min(Math.max(progress, 0), 4)
  const extra = Math.max(images.length - 1, 0)

  // The typed value dies with this card (a lockout or a stage change unmounts
  // it), so the dirty flag the parent holds must die with it too. Otherwise the
  // parent keeps "holding for typing" over an input that no longer exists.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  function update(value) {
    setCode(value)
    // Lets the screen know not to swap this view out from under a teammate who
    // is part-way through typing.
    onDirtyChange?.(value.trim().length > 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!code.trim() || loading || disabled) return
    const ok = await onSubmit(code.trim())
    // Only clear on success. Making someone retype a passcode they just got
    // wrong, when a wrong code costs them the full lockout, destroys the very
    // evidence they want to check.
    if (ok) {
      setCode('')
      onDirtyChange?.(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-7 px-5 pb-10 pt-5 sm:px-6">
      <div className="flex flex-col gap-5">
        <h2
          className={`display-grunge text-[clamp(2rem,9vw,2.75rem)] leading-none ${
            terminal ? 'text-indigo' : 'text-accent'
          }`}
        >
          {terminal ? 'The Null Void' : `Clue ${NUMERALS[stop]}`}
        </h2>

        {clue ? (
          <p className="whitespace-pre-line text-[17px] leading-relaxed text-text-secondary">
            {clue}
          </p>
        ) : (
          <p className="text-[13px] text-amber">
            This clue did not load. Pull to refresh, or show this screen to a marshal.
          </p>
        )}

        {images.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onOpenImages}
              aria-label="Open clue image full size"
              className="motion-press block w-full cursor-zoom-in text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            >
              <RemoteImage
                key={images[0]}
                src={images[0]}
                alt="Clue image"
                fallbackNote="Image did not load. The written clue is complete on its own."
              />
            </button>

            {extra > 0 && (
              <button
                type="button"
                onClick={onOpenImages}
                className="motion-press flex min-h-11 cursor-pointer items-center gap-2 self-start text-[13px] text-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
              >
                <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {extra} more {extra === 1 ? 'image' : 'images'}
              </button>
            )}
          </div>
        )}
      </div>

      {terminal && (
        <div className="flex flex-col gap-1 rounded-md border border-indigo/40 bg-indigo/10 px-4 py-3">
          <p className="text-[13px] font-medium text-indigo">
            The final challenge is not in this app.
          </p>
          <p className="text-[12px] text-text-secondary">
            Enter the code from the Null Void here. A wrong code still costs{' '}
            {LOCKOUT_MINUTES} minutes.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <input
          value={code}
          onChange={(e) => update(e.target.value)}
          disabled={disabled}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck="false"
          placeholder={terminal ? 'Enter the Void code' : 'Enter the station code'}
          aria-label={terminal ? 'Void code' : 'Station code'}
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
          disabled={loading || disabled || !code.trim()}
          className="motion-press h-[52px] w-full cursor-pointer rounded-md bg-accent font-display text-lg text-text-inverse disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {loading ? 'Decrypting...' : cue || 'Decrypt Signal'}
        </button>
      </form>
    </div>
  )
}
