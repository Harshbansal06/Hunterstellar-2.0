import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROLOGUE_EYEBROW, PROLOGUE_PANELS, PROLOGUE_TITLE } from '../content/prologue'

/**
 * The opening briefing, one beat at a time.
 *
 * Two things drive the shape of this screen. It is read standing up, on a
 * phone, in a crowd -- so the whole panel is the advance target and the type
 * is large. And it carries the only statement of the rules a player gets
 * before they start guessing, so SKIP is always available (a crew that is
 * already late must be able to reach their clue) but the briefing is marked
 * seen either way, and stays re-readable at /prologue.
 */
export default function Prologue() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)

  const panel = PROLOGUE_PANELS[index]
  const isLast = index === PROLOGUE_PANELS.length - 1

  // Nothing to mark. The briefing is opt-in: it is reached from the Fragments
  // tab and never auto-shown, so there is no "seen" flag to keep and no reason
  // for a crew to be sent somewhere they did not ask to go. Leaving goes back
  // to wherever they came from, falling back to the clue.
  const leave = useCallback(() => {
    // navigate(-1) is a no-op when this is the first entry in the tab (a shared
    // link, a home-screen launch), which left Skip and "Begin the hunt" dead.
    // React Router stamps its own index on history.state; 0 means no earlier
    // in-app entry to return to.
    const idx = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate('/journey', { replace: true })
  }, [navigate])

  const advance = useCallback(() => {
    if (isLast) leave()
    else setIndex((i) => i + 1)
  }, [isLast, leave])

  function handleKey(e) {
    // Enter/Space advance; the panel is a button, so this only adds the
    // arrow keys for anyone reading on a laptop.
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      advance()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="relative grain-frame w-full max-w-[412px] h-[100dvh] sm:h-[min(917px,92dvh)] bg-bg flex flex-col overflow-hidden border-x sm:border border-surface-alt shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-text-muted">
              {PROLOGUE_EYEBROW}
            </p>
            <h1 className="font-display text-xl leading-tight text-text-primary mt-1">
              {PROLOGUE_TITLE}
            </h1>
          </div>
          <button
            onClick={leave}
            className="text-[11px] uppercase tracking-[0.2em] text-text-muted underline cursor-pointer shrink-0"
          >
            Skip
          </button>
        </header>

        {/* Panel counter as ticks: reads instantly and tells the player how
            much briefing is left, which a scrollbar on a phone does not. */}
        <div className="flex gap-1 px-5 pb-4 shrink-0" aria-hidden="true">
          {PROLOGUE_PANELS.map((p, i) => (
            <span
              key={p.id}
              className={`h-[3px] flex-1 rounded-full ${i <= index ? 'bg-accent' : 'bg-surface-alt'}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={advance}
          onKeyDown={handleKey}
          aria-label={isLast ? 'Finish prologue' : 'Next'}
          className="flex-1 flex flex-col justify-center text-left px-6 pb-4 overflow-y-auto cursor-pointer"
        >
          <div key={panel.id} className="animate-fadeIn flex flex-col gap-4">
            {/* The opening and closing cards are set large; the body beats are
                set for reading. Nothing is uppercased -- the author already
                shouts the names that matter, and all-caps prose kills
                word-shape recognition for someone reading in a noisy crowd. */}
            <p
              className={
                panel.kind === 'crawl'
                  ? 'text-text-primary text-[17px] leading-relaxed'
                  : 'display-grunge text-text-primary text-3xl leading-snug'
              }
            >
              {panel.text}
            </p>

            {panel.subtext && (
              <p className="text-text-secondary text-[15px] leading-snug">
                {panel.subtext}
              </p>
            )}
          </div>
        </button>

        <div className="px-6 pb-8 pt-2 shrink-0">
          <div className="flex items-center gap-3">
            {index > 0 && (
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="h-[52px] px-5 rounded-md border border-surface-alt text-text-muted text-sm cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              onClick={advance}
              className="motion-press h-[52px] flex-1 cursor-pointer rounded-md bg-accent font-display text-lg text-text-inverse focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {isLast ? 'Begin the hunt' : 'Continue'}
            </button>
          </div>
          <p className="text-[11px] text-text-muted text-center mt-3">
            You can re-read this any time from your Fragments tab.
          </p>
        </div>
      </div>
    </div>
  )
}
