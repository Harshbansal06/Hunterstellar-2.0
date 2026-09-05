import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Sheet } from '../ui/Sheet'

/**
 * Crew identity, and the only door to logging out.
 *
 * Logout used to be the fourth item in the bottom nav, sitting at Tier 1 as a
 * peer of three navigation destinations and one thumb-width from them. An
 * action's prominence should track how often it is taken and how reversible it
 * is, and this one is taken once and ends the session, so it belongs behind a
 * deliberate step.
 *
 * The confirmation is inline rather than `window.confirm`. A native confirm on
 * a phone is a jarring OS-level interrupt for a decision that can be made in
 * place, and it cannot be styled or read consistently by assistive tech.
 */

const STOPS_TOTAL = 5

export function SessionSheet({ open, onClose, user, onLogout }) {
  const [confirming, setConfirming] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  // Never leave the sheet armed: reopening always starts from rest. Derived
  // during render so the confirm buttons cannot flash on the way back in.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open && confirming) setConfirming(false)
  }

  const progress = Math.min(Math.max(user?.progress ?? 0, 0), STOPS_TOTAL)
  const members = Array.isArray(user?.members) ? user.members.filter(Boolean) : []

  return (
    <Sheet open={open} onClose={onClose} title="Your crew" detent="auto">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[12px] tracking-[0.2em] uppercase text-text-muted">
            Crew name
          </span>
          <span className="font-display text-[20px] text-text-primary break-words">
            {user?.team_name || 'Unknown crew'}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="border border-border bg-bg px-3 py-2.5 flex flex-col gap-1">
            <dt className="font-mono text-[12px] tracking-[0.14em] uppercase text-text-muted">
              Stops cleared
            </dt>
            <dd className="font-mono text-[17px] tabular-nums text-text-primary">
              {progress}
              <span className="text-text-muted text-[13px]">/{STOPS_TOTAL}</span>
            </dd>
          </div>
          <div className="border border-border bg-bg px-3 py-2.5 flex flex-col gap-1">
            <dt className="font-mono text-[12px] tracking-[0.14em] uppercase text-text-muted">
              Status
            </dt>
            <dd className="text-[14px] text-text-primary capitalize">
              {user?.status || 'active'}
            </dd>
          </div>
        </dl>

        {user?.team_leader && (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[12px] tracking-[0.2em] uppercase text-text-muted">
              Captain
            </span>
            <span className="text-[14px] text-text-secondary">{user.team_leader}</span>
          </div>
        )}

        {members.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] tracking-[0.2em] uppercase text-text-muted">
              Crew
            </span>
            <ul className="flex flex-col gap-1">
              {members.map((m, i) => (
                <li key={`${m}-${i}`} className="text-[14px] text-text-secondary">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border pt-5 flex flex-col gap-3">
          {confirming ? (
            <>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                Your progress is stored on the server, so logging out loses nothing. You
                will need your crew name and access code to get back in.
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex-1 min-h-11 border border-red text-red font-display
                    text-[15px] tracking-wide motion-press cursor-pointer
                    focus-visible:outline focus-visible:outline-1 focus-visible:outline-red"
                >
                  Log out
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 min-h-11 border border-border text-text-secondary
                    font-display text-[15px] tracking-wide motion-press cursor-pointer
                    focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                >
                  Stay
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-11 px-3 flex items-center gap-2.5 self-start
                text-text-muted hover:text-red motion-press cursor-pointer
                focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
              <span className="text-[14px]">Log out</span>
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

export default SessionSheet
