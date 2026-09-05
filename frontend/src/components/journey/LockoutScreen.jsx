import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCountdown } from '../../hooks/useCountdown'
import { LOCKOUT_MINUTES } from '../../config/rules'
import { Button } from '../ui/Button'

/**
 * Being locked out is the entire state, so it gets the entire screen.
 *
 * This replaces LockoutBanner. The banner's reasoning was that a full-screen
 * lockout with nothing to do is the worst moment in the hunt, and that a team
 * should keep reading. That reasoning was right about the goal and wrong about
 * the mechanism: as a banner it was one strip in a stack of eleven, sitting
 * above an empty body that said "Entry reopens when the timer runs out."
 *
 * A crew that cannot act for several minutes needs to know three things
 * immediately: what happened, how long, and what they can still do. A strip
 * buried in chrome delivers none of them at a glance. So the screen names the
 * state, gives the clock the largest type on it, and offers the one action
 * still available.
 *
 * The countdown runs off the server's `lock_until` against the local clock, so
 * it keeps ticking offline. `onExpire` fires once when it reaches zero, which
 * pulls fresh state instead of leaving a dead screen for up to a poll interval.
 */
export function LockoutScreen({ lockUntil, onExpire }) {
  const navigate = useNavigate()
  const { display, expired } = useCountdown(lockUntil)
  const fired = useRef(false)

  useEffect(() => {
    fired.current = false
  }, [lockUntil])

  useEffect(() => {
    if (expired && lockUntil && !fired.current) {
      fired.current = true
      onExpire?.()
    }
  }, [expired, lockUntil, onExpire])

  // The server said locked but sent no deadline. Do not render "00 : 00" and
  // imply the team is free, and do not render nothing. Say it is unknown and
  // point at a human.
  const indefinite = !lockUntil

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-10 text-center gap-6">
      <LockGlyph />

      <div className="flex flex-col items-center gap-2">
        {indefinite ? (
          <p className="font-mono text-[28px] text-red tabular-nums leading-none">
            --&nbsp;:&nbsp;--
          </p>
        ) : (
          <p
            role="timer"
            aria-live="polite"
            className="font-mono text-[52px] text-red tabular-nums leading-none"
          >
            {display}
          </p>
        )}
        <h2 className="display-grunge text-[26px] text-text-primary">Signal jammed</h2>
      </div>

      <p className="text-[14px] text-text-secondary leading-relaxed max-w-[280px]">
        {indefinite
          ? 'Your crew is locked out, but the shuttle did not report how long. Show this screen to a marshal.'
          : `A wrong code costs ${LOCKOUT_MINUTES} minutes. Your fragments are still readable while you wait.`}
      </p>

      <Button size="lg" onClick={() => navigate('/fragments')} className="max-w-[280px]">
        Read fragments
      </Button>

      {!indefinite && (
        <p className="text-[12px] text-text-muted max-w-[280px]">
          Find a marshal if you think this lockout is wrong.
        </p>
      )}
    </div>
  )
}

/**
 * Static by design. A looping or pulsing lock would be decorative motion on a
 * screen whose whole job is to communicate a wait, and the countdown beside it
 * is already the live element.
 */
function LockGlyph() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      className="text-red"
    >
      <path
        d="M18 25V19a10 10 0 0 1 20 0v6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="square"
        fill="none"
      />
      <rect
        x="13"
        y="25"
        width="30"
        height="23"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
      />
      <path d="M28 33v7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  )
}

export default LockoutScreen
