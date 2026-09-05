import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCountdown } from '../../hooks/useCountdown'
import { LOCKOUT_MINUTES } from '../../config/rules'
import { Button } from '../ui/Button'

/**
 * Being locked out is the entire state, so it gets the entire screen.
 *
 * A crew that cannot act for several minutes needs to know three things
 * immediately: what happened, how long, and what they can still do. So the
 * screen names the state, gives the clock the largest type on it, and offers
 * the two things that remain possible.
 *
 * ORDER OF THE TWO ACTIONS. Reading the clue is primary because it is the only
 * one that moves the crew forward: they got the code wrong, the clue is the
 * evidence for why, and five minutes is exactly long enough to re-read it and
 * spot what they misread. Fragments are worth re-reading too but they are
 * already earned, so that is passing time rather than making progress.
 *
 * The clue arrives on the locked payload itself (see the locked branch in
 * backend/utils/teamState.js and migration 004). It used to be withheld, which
 * removed the one productive act available during a lockout for no benefit:
 * the crew had just been looking at it.
 *
 * The countdown runs off the server's `lock_until` against the local clock, so
 * it keeps ticking offline. `onExpire` fires once when it reaches zero, which
 * pulls fresh state instead of leaving a dead screen for up to a poll interval.
 */
export function LockoutScreen({ lockUntil, onExpire, onReadClue, hasClue = false }) {
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
  // imply the crew is free, and do not render nothing. Say it is unknown and
  // point at a human.
  const indefinite = !lockUntil

  // Only offer the clue when one actually arrived. A primary button that opens
  // an empty screen is worse than one button, and an older deployment without
  // migration 004 will still send a locked payload with no clue on it.
  const canReadClue = hasClue && typeof onReadClue === 'function'

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-10 text-center">
      <LockGlyph />

      <div className="flex flex-col items-center gap-2">
        {indefinite ? (
          <p className="font-mono text-[28px] leading-none tabular-nums text-red">
            --&nbsp;:&nbsp;--
          </p>
        ) : (
          <p
            role="timer"
            aria-live="polite"
            className="font-mono text-[52px] leading-none tabular-nums text-red"
          >
            {display}
          </p>
        )}
        <h2 className="display-grunge text-[26px] text-text-primary">Signal jammed</h2>
      </div>

      <p className="max-w-[280px] text-[14px] leading-relaxed text-text-secondary">
        {indefinite
          ? 'Your crew is locked out, but the shuttle did not report how long. Show this screen to a marshal.'
          : `A wrong code costs ${LOCKOUT_MINUTES} minutes. Read the clue again while you wait.`}
      </p>

      <div className="flex w-full max-w-[280px] flex-col gap-3">
        {canReadClue && (
          <Button size="lg" onClick={onReadClue}>
            Read clue
          </Button>
        )}
        <Button
          size="lg"
          variant={canReadClue ? 'secondary' : 'primary'}
          onClick={() => navigate('/fragments')}
        >
          Read fragments
        </Button>
      </div>

      {!indefinite && (
        <p className="max-w-[280px] text-[12px] text-text-muted">
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
