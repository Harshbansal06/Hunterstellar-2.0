import { useLayoutEffect, useRef, useState } from 'react'
import { createScope, createTimeline, cubicBezier, stagger, svg } from 'animejs'
import { getFragment } from '../../content/fragments'
import { FragmentRecord } from './FragmentRecord'
import { Button } from '../ui/Button'
import {
  BEZIER_ENTER,
  BEZIER_STANDARD,
  DURATION_EXPRESSIVE,
  STAGGER_STEP,
  prefersReducedMotion,
} from '../../lib/motion'

// v4 takes an easing FUNCTION, not a string. `ease: 'cubicBezier(...)'` logs a
// deprecation and silently falls back to the default curve, so the animation
// still plays and only the feel is wrong. Built once at module scope.
const easeEnter = cubicBezier(...BEZIER_ENTER)
const easeStandard = cubicBezier(...BEZIER_STANDARD)

/**
 * The one screen with full expressive motion, and the reason Anime.js is in
 * this project at all.
 *
 * A player sees this four times in the entire event, once per fragment. That
 * rarity is what pays for the expression: the rule this app follows is that
 * motion triggered dozens of times stays under 150ms and single-channel, while
 * motion seen once a session has room to perform. Submit feedback and the
 * wrong-answer shake are CSS for exactly that reason. This is not.
 *
 * The glyph draws itself with `svg.createDrawable`, the traces follow on a
 * stagger, then the label and the fragment line arrive. The whole phrase fits
 * inside --duration-expressive.
 *
 * Two rules from the motion system are load-bearing here:
 *
 *   Anything past 300ms must be interruptible. Tapping anywhere skips to the
 *   end state, and the button is live from the first frame rather than after
 *   the animation finishes.
 *
 *   Reduced motion gets the end state directly, not the same timeline sped up.
 *   `scope.revert()` is what delivers it: reverting strips every inline style
 *   Anime.js set, and the resting CSS state IS the finished state, so the
 *   fallback and the skip path are the same code.
 */
export function FragmentReveal({ index, onContinue, isLast }) {
  const root = useRef(null)
  const scope = useRef(null)

  // Starts true under reduced motion, so the first paint is already the end
  // state and nothing has to be undone.
  const [settled, setSettled] = useState(() => prefersReducedMotion())

  const fragment = getFragment(index)

  // useLayoutEffect, not useEffect. `createDrawable` sets stroke-dasharray to
  // hide the paths, and under useEffect that happens after the browser has
  // already painted, so the finished shard flashes for one frame before it
  // rewinds to draw itself. Running before paint removes the flash without
  // pre-setting dash attributes by hand.
  useLayoutEffect(() => {
    // Defensive: an index outside 1 to 4 (a replayed response, a future stop
    // count) must not animate a card that renders nothing.
    if (!fragment || settled) return undefined

    scope.current = createScope({ root }).add(() => {
      const tl = createTimeline({ defaults: { ease: easeStandard } })

      // The shard outline draws first: one continuous line, so the eye follows
      // it rather than being handed a finished shape.
      tl.add(
        svg.createDrawable('.reveal-shell'),
        { draw: ['0 0', '0 1'], duration: 380, ease: easeEnter },
        0,
      )

      // Traces follow, staggered top-down so the sequence reads as the shard
      // powering up rather than four things appearing.
      tl.add(
        svg.createDrawable('.reveal-trace'),
        { draw: ['0 0', '0 1'], duration: 260, delay: stagger(60) },
        180,
      )

      tl.add('.reveal-core', { opacity: [0, 1], scale: [0.4, 1], duration: 220 }, 400)

      // Text last, and sized so the phrase ends exactly on
      // --duration-expressive rather than merely near it.
      const TEXT_AT = 400
      tl.add(
        '.reveal-line',
        {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: DURATION_EXPRESSIVE - TEXT_AT,
          delay: stagger(STAGGER_STEP),
          ease: easeEnter,
        },
        TEXT_AT,
      )
    })

    return () => {
      scope.current?.revert()
      scope.current = null
    }
  }, [fragment, settled, index])

  // Skip. Reverting the scope drops every inline style Anime.js applied, which
  // lands on the resting state, which is the finished state.
  function skip() {
    if (settled) return
    scope.current?.revert()
    scope.current = null
    setSettled(true)
  }

  if (!fragment) {
    // The caller skips this screen when the fragment is unreadable, but if it
    // ever renders anyway, never show a player the word "undefined".
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
        <p className="text-[14px] text-text-muted">
          A fragment was recovered, but we could not read it on this device.
        </p>
        <Button size="lg" onClick={onContinue} className="max-w-[280px]">
          Continue
        </Button>
      </div>
    )
  }

  return (
    <div
      ref={root}
      onClick={skip}
      className="flex-1 flex flex-col justify-center gap-7 px-6 py-10"
    >
      <div className="self-center">
        <ShardGlyph settled={settled} />
      </div>

      <div className="flex flex-col gap-4">
        <p
          className="reveal-line font-mono text-[12px] tracking-[0.32em] uppercase text-accent"
          style={settled ? undefined : { opacity: 0 }}
        >
          Data fragment recovered
        </p>
        <h2
          className="reveal-line display-grunge text-[clamp(2.25rem,10vw,2.875rem)] leading-none text-text-primary"
          style={settled ? undefined : { opacity: 0 }}
        >
          {fragment.label}
        </h2>
      </div>

      <div className="reveal-line" style={settled ? undefined : { opacity: 0 }}>
        <FragmentRecord fragment={fragment} />
      </div>

      <p
        className="reveal-line text-[12px] text-text-muted"
        style={settled ? undefined : { opacity: 0 }}
      >
        {isLast
          ? 'That is the last fragment. Open Fragments to read the assembled transmission.'
          : 'Saved to your Fragments tab. You can re-read it any time.'}
      </p>

      {/* Live from the first frame. A button that only works once an animation
          finishes is the thing that makes motion feel like an obstacle. */}
      <Button
        size="lg"
        onClick={(e) => {
          e.stopPropagation()
          onContinue()
        }}
      >
        {isLast ? 'Continue to the Null Void' : 'Continue'}
      </Button>
    </div>
  )
}

/**
 * The shard. Hand-authored because it is six paths, and because every one of
 * them has to be a stroke that `createDrawable` can walk: a filled icon cannot
 * draw itself.
 */
function ShardGlyph({ settled }) {
  return (
    <svg
      width="128"
      height="128"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="text-accent"
    >
      <path
        className="reveal-shell"
        d="M60 8 L104 34 L104 86 L60 112 L16 86 L16 34 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        className="reveal-trace"
        d="M60 26 V56"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        className="reveal-trace"
        d="M34 44 L60 60"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        className="reveal-trace"
        d="M86 44 L60 60"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        className="reveal-trace"
        d="M60 60 V94"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* The only filled shape here, so it cannot draw. It scales in instead,
          and needs an explicit start state or it flashes before the timeline
          reaches it at t=400. */}
      <circle
        className="reveal-core"
        cx="60"
        cy="60"
        r="5"
        fill="currentColor"
        style={settled ? undefined : { opacity: 0 }}
      />
    </svg>
  )
}

export default FragmentReveal
