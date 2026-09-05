import { useState } from 'react'
import { RemoteImage } from './RemoteImage'

export function PuzzleCard({
  question,
  images = [],
  onSubmit,
  loading,
  error,
  disabled = false,
  disabledHint,
  onDirtyChange,
}) {
  const [answer, setAnswer] = useState('')

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
    <div className="w-full flex flex-col gap-7 px-6 pt-2 pb-8">
      <div className="flex flex-col gap-5">
        <h2 className="font-display text-xl text-text-secondary tracking-widest">Station Challenge</h2>
        {question ? (
          <p className="text-text-secondary text-[17px] leading-relaxed whitespace-pre-line">
            {question}
          </p>
        ) : (
          <p className="text-sm text-amber">
            This question didn&rsquo;t load. Pull to refresh, or show this screen to a marshal.
          </p>
        )}

        {images.length > 0 && (
          <div className="flex flex-col gap-3">
            {images.map((src, i) => (
              <RemoteImage
                key={src || i}
                src={src}
                alt={`Question image ${i + 1}`}
                // Deliberately different from the clue wording: a question's
                // image may BE the puzzle, so promising the text is complete
                // would be a lie. Send them to a marshal instead.
                fallbackNote="Image didn't load. If the question needs it, show this to a marshal."
              />
            ))}
          </div>
        )}
      </div>

      {/* Wrong codes lock a team out; wrong answers do not. Teams
          conflate the two and stop guessing, so say it before they submit. */}
      <p className="text-xs text-text-muted -mt-2">
        Wrong answers don&rsquo;t lock you. Take your best guess.
      </p>

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
        <input
          value={answer}
          onChange={(e) => update(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          placeholder="Enter the answer"
          aria-label="Your answer"
          className="w-full h-[60px] bg-surface border border-surface-alt rounded-md px-5 text-text-primary text-base placeholder:text-text-muted outline-none focus:border-accent disabled:opacity-50"
        />

        {error && (
          <p role="alert" className="text-sm text-red text-center">
            {error}
          </p>
        )}
        {disabled && disabledHint && (
          <p className="text-xs text-text-muted text-center">{disabledHint}</p>
        )}

        <button
          type="submit"
          disabled={loading || disabled || !answer.trim()}
          className="w-full h-[52px] bg-[#f6f6f6] text-text-inverse rounded-md font-display text-lg disabled:opacity-60"
        >
          {loading ? 'Verifying...' : 'Transmit Answer'}
        </button>
      </form>
    </div>
  )
}
