import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createScope, createTimeline, cubicBezier, stagger, svg } from 'animejs'
import { Wordmark } from '../components/brand/Wordmark'
import { BEZIER_ENTER, BEZIER_STANDARD, prefersReducedMotion } from '../lib/motion'

const HOLD_MS = 3400
const FADE_MS = 400

const easeEnter = cubicBezier(...BEZIER_ENTER)
const easeStandard = cubicBezier(...BEZIER_STANDARD)

/**
 * The splash.
 *
 * It advances itself, there is no Continue button, because a title card that
 * asks for a tap is just a slow door. But removing the button must not remove
 * the player's ability to move on, so the whole screen is a skip target: at a
 * live event someone reopens this app twenty times, and the twenty-first time
 * they do not want to sit through it to reach their clue.
 *
 * THE MOTION. This is the one place in the app with a full orchestrated
 * sequence, and it is affordable for the same reason the fragment reveal is:
 * it is seen once, at the start, not dozens of times an hour. Everywhere else
 * the rule holds that motion must carry state rather than decorate.
 *
 * The subject supplies the idea. The Omnitrix is a dial that charges and locks
 * before it does anything, so the sequence is a power-up: the outer ring draws
 * itself, the core blooms, the four quadrant ticks land on a stagger, then the
 * wordmark arrives and a single sheen passes across it. Green glow throughout,
 * because the dial green is the whole identity.
 *
 * `replace: true` keeps the splash out of the history stack. Without it the
 * Android back button from Login lands here, which then bounces forward again,
 * a loop the player cannot leave except by closing the app.
 */
export default function Landing() {
  const navigate = useNavigate()
  const root = useRef(null)
  const scope = useRef(null)
  const [leaving, setLeaving] = useState(false)

  // Under reduced motion the whole sequence is skipped and the end state is
  // painted directly, so nothing has to be undone.
  const [settled, setSettled] = useState(() => prefersReducedMotion())

  const go = useCallback(() => {
    setLeaving(true)
    // Let the fade play out, but never gate navigation on an animation event:
    // if the frame is dropped the player still arrives.
    setTimeout(() => navigate('/login', { replace: true }), FADE_MS)
  }, [navigate])

  useEffect(() => {
    const t = setTimeout(go, settled ? 1200 : HOLD_MS)
    return () => clearTimeout(t)
  }, [go, settled])

  // useLayoutEffect, not useEffect: `svg.createDrawable` sets stroke-dasharray
  // to hide the paths, and after paint that means one frame of the finished
  // dial before it rewinds to draw itself.
  useLayoutEffect(() => {
    if (settled) return undefined

    scope.current = createScope({ root }).add(() => {
      const tl = createTimeline({ defaults: { ease: easeStandard } })

      // The glow blooms first, so the ring draws into light rather than onto
      // a flat ground.
      tl.add(
        '.omni-glow',
        { opacity: [0, 1], scale: [0.6, 1], duration: 620, ease: easeEnter },
        0,
      )

      // One continuous line, so the eye follows it round rather than being
      // handed a finished circle.
      tl.add(
        svg.createDrawable('.omni-ring'),
        { draw: ['0 0', '0 1'], duration: 900, ease: easeEnter },
        120,
      )

      tl.add('.omni-core', { opacity: [0, 1], scale: [0.3, 1], duration: 380 }, 620)

      // The four quadrant ticks land in sequence: the dial locking.
      tl.add(
        '.omni-tick',
        { opacity: [0, 1], scale: [0.4, 1], duration: 260, delay: stagger(70) },
        780,
      )

      tl.add(
        '.splash-mark',
        { opacity: [0, 1], translateY: [14, 0], duration: 520, ease: easeEnter },
        1000,
      )
      tl.add(
        '.splash-line',
        {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 440,
          delay: stagger(90),
          ease: easeEnter,
        },
        1240,
      )
    })

    return () => {
      scope.current?.revert()
      scope.current = null
    }
  }, [settled])

  // Skip. Reverting drops every inline style Anime.js set, which lands on the
  // resting state, which is the finished state.
  const skip = useCallback(() => {
    scope.current?.revert()
    scope.current = null
    setSettled(true)
    go()
  }, [go])

  const hidden = settled ? undefined : { opacity: 0 }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-black">
      <div className="relative flex h-[100dvh] w-full max-w-[412px] flex-col overflow-hidden border-surface-alt bg-bg shadow-2xl sm:h-[917px] sm:border">
        <div
          ref={root}
          className={`grain-frame relative flex flex-1 flex-col items-center justify-between overflow-hidden px-6 py-16 transition-opacity duration-[400ms] ${
            leaving ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-9">
            <OmnitrixDial settled={settled} />

            {/* The sheen only runs after the mark has arrived, so it reads as
                light catching the type rather than as a loading skeleton. */}
            <div className={`splash-mark ${settled ? 'shimmer' : ''}`} style={hidden}>
              <Wordmark width={280} />
            </div>

            <p
              className="splash-line max-w-[339px] text-center text-lg leading-snug text-text-primary"
              style={hidden}
            >
              Find them before he does.
            </p>
          </div>

          <p
            className="splash-line whitespace-nowrap px-3 text-center text-[15px] leading-snug tracking-normal text-text-primary"
            style={hidden}
          >
            Presented by{' '}
            <span className="font-semibold">ASTRONOMY &amp; PHYSICS SOCIETY</span>
          </p>
        </div>

        {/* Full-bleed skip. There is nothing else on this screen to click. */}
        <button
          type="button"
          onClick={skip}
          aria-label="Skip intro"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer"
        />
      </div>
    </div>
  )
}

/**
 * The dial. Stroked paths only, because `svg.createDrawable` walks a stroke
 * and cannot draw a fill.
 *
 * The glow is a blurred radial fill rather than a CSS box-shadow so it can be
 * scaled and faded by the timeline as one object.
 */
function OmnitrixDial({ settled }) {
  const hidden = settled ? undefined : { opacity: 0 }

  return (
    <svg
      width="132"
      height="132"
      viewBox="0 0 132 132"
      fill="none"
      aria-hidden="true"
      className="text-accent"
    >
      <defs>
        <radialGradient id="omniGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6FE04B" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#6FE04B" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#6FE04B" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle
        className="omni-glow"
        cx="66"
        cy="66"
        r="64"
        fill="url(#omniGlow)"
        style={hidden}
      />

      <circle
        className="omni-ring"
        cx="66"
        cy="66"
        r="52"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />

      {/* The hourglass silhouette, the Omnitrix face reduced to two strokes. */}
      <path
        className="omni-core"
        d="M50 48 L82 48 L52 84 L82 84 L50 84 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
        style={hidden}
      />

      {/* Quadrant ticks: the dial locking into place. */}
      <path
        className="omni-tick"
        d="M66 6 V18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        style={hidden}
      />
      <path
        className="omni-tick"
        d="M126 66 H114"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        style={hidden}
      />
      <path
        className="omni-tick"
        d="M66 126 V114"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        style={hidden}
      />
      <path
        className="omni-tick"
        d="M6 66 H18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        style={hidden}
      />
    </svg>
  )
}
