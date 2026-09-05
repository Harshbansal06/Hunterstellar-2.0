import { STATION_COUNT, STOP_COUNT } from '../../config/rules'

/**
 * Where the crew is, in one line. Fills the header's left region.
 *
 * This replaces `ui/ProgressBar`, which rendered six nodes, connector rails
 * and a row of 8px labels directly beneath an eyebrow that already said
 * "Chapter 3 of 5" in words. Two channels for one fact, and the bar was the
 * redundant one. Everything the bar actually knew moved into JourneyMapSheet,
 * one tap away and readable.
 *
 * The count deliberately reads "of 4" until the fourth station is cleared.
 * The briefing promises four stations, so the app promises four; an "of 5"
 * before then tells a crew the Null Void exists before they have earned the
 * right to know.
 */

const NUMERALS = ['I', 'II', 'III', 'IV', 'V']

export function StopIndicator({ progress = 0, terminal = false }) {
  const stop = Math.min(Math.max(progress, 0), STOP_COUNT - 1)
  const total = progress >= STATION_COUNT ? STOP_COUNT : STATION_COUNT

  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <h1
        className={`truncate font-display text-[15px] uppercase tracking-[0.18em] ${
          terminal ? 'text-indigo' : 'text-text-primary'
        }`}
      >
        {terminal ? 'The Null Void' : 'Your Journey'}
      </h1>
      {/*
        One aria-label on the span rather than sr-only text interleaved with
        the visible glyphs. Nested sr-only spans read out as "Stop I/IV of 4",
        because a screen reader gets both the spelled-out and the numeral form
        of the same fact.
      */}
      <span
        aria-label={`Stop ${stop + 1} of ${total}`}
        className={`shrink-0 font-mono text-[12px] ${
          terminal ? 'text-indigo/70' : 'text-text-muted'
        }`}
      >
        {NUMERALS[stop]}/{NUMERALS[total - 1]}
      </span>
    </div>
  )
}

export default StopIndicator
