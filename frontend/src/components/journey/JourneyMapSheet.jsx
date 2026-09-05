import { Check, Lock } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { STATION_COUNT, STOP_COUNT } from '../../config/rules'

/**
 * The whole route, one tap from the clue.
 *
 * This is where the deleted `ui/ProgressBar` went. The bar rendered six 32px
 * circles with connector rails and a row of 8px labels, squeezed directly
 * above the clue and directly below an eyebrow that already said the same
 * thing in words. Two channels for one fact, and the bar was the redundant
 * one, so the fact stays and the bar went.
 *
 * There are deliberately no station names here. The route is randomised per
 * crew and the content model carries no per-station identity, so a name would
 * either be invented or would give away where a crew is being sent. Position
 * is the honest signal: how many are cleared, which one you are on, and that
 * the last one changes the rules.
 */
const NUMERALS = ['I', 'II', 'III', 'IV', 'V']

export function JourneyMapSheet({ open, onClose, progress = 0 }) {
  const current = Math.min(Math.max(progress, 0), STOP_COUNT - 1)

  /**
   * The fifth row appears only once the fourth station is cleared, matching
   * StopIndicator. Listing a locked "Null Void" from the start would tell a
   * crew the Void exists before they have earned the right to know, which is
   * the one spoiler this screen could leak.
   */
  const visibleStops = progress >= STATION_COUNT ? STOP_COUNT : STATION_COUNT

  return (
    <Sheet open={open} onClose={onClose} title="Your route" detent="auto">
      <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
        {visibleStops === STOP_COUNT
          ? `${STATION_COUNT} stations cleared, and then the Null Void.`
          : `${STATION_COUNT} stations. Every crew is sent through them in a different order, so nobody can follow the crew ahead.`}
      </p>

      {/*
        The campus map shows every station pin without any route order, so it
        gives away nothing about where this crew is being sent. Labels are too
        small at phone width to read inline, so the image opens full-size in a
        new tab where the browser handles pinch-zoom for free.
      */}
      <figure className="mb-5">
        <a
          href="/map.png"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the campus map at full size"
          className="block overflow-hidden rounded-md border border-border/60 bg-surface-alt"
        >
          {/* 39 KB WebP for the inline preview; the 745 KB PNG is only the
              full-size link target. On venue mobile data that is the
              difference between the map appearing with the sheet and 3-6s
              of blank frame while a crew is walking. */}
          <img
            src="/map-preview.webp"
            alt="Campus map with every station pinned"
            width={1000}
            height={665}
            decoding="async"
            className="block aspect-[3/2] w-full object-cover"
          />
        </a>
        <figcaption className="mt-2 text-[12px] text-text-muted">
          Campus map. Tap to open full size and zoom.
        </figcaption>
      </figure>

      <ol className="flex flex-col">
        {Array.from({ length: visibleStops }, (_, i) => i).map((i) => {
          const done = i < current
          const active = i === current
          const locked = i > current
          const terminal = i === STOP_COUNT - 1

          return (
            <li
              key={i}
              aria-current={active ? 'step' : undefined}
              className={`flex items-start gap-3.5 py-3.5 ${
                i > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center border font-mono text-[12px] ${
                  done
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : active
                      ? terminal
                        ? 'border-indigo bg-indigo/15 text-indigo'
                        : 'border-accent bg-accent/15 text-accent'
                      : 'border-dashed border-border text-text-muted/50'
                }`}
              >
                {done ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : locked ? (
                  <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  NUMERALS[i]
                )}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={`truncate text-[14px] ${
                    locked
                      ? 'text-text-muted/60'
                      : active
                        ? terminal
                          ? 'font-medium text-indigo'
                          : 'font-medium text-text-primary'
                        : 'text-text-secondary'
                  }`}
                >
                  {terminal ? 'The Null Void' : `Station ${NUMERALS[i]}`}
                </span>
                <span className="text-[12px] text-text-muted">
                  {done
                    ? 'Fragment recovered'
                    : active
                      ? terminal
                        ? 'You are here. The last challenge is not in this app.'
                        : 'You are here'
                      : terminal
                        ? 'Sealed until all four fragments are recovered'
                        : 'Not yet reached'}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}

export default JourneyMapSheet
