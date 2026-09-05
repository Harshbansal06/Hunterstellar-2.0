import { useId, useState } from 'react'
import { AlertTriangle, ChevronDown, Info, Megaphone, Timer, Users } from 'lucide-react'

/**
 * One slot for everything that used to be its own full-width box.
 *
 * Before this, the Journey screen could stack five independent status boxes at
 * the same altitude: the stale chip, the rate-limit warning, the
 * teammate-moved-forward notice, an admin message, and a broadcast
 * announcement. Each was defensible alone. Together they buried the clue.
 *
 * So they collapse to a single line carrying the most urgent one, plus a count.
 * Tap to see the rest. The geography never changes, which is what lets a player
 * learn it once: status is always here, always one line, always in the same
 * place.
 *
 * Items are passed in already sorted by the caller's priority, most urgent
 * first. The slot renders, it does not decide.
 */

const TONES = {
  blocking: {
    Icon: Timer,
    line: 'border-amber/50 bg-amber/10',
    text: 'text-amber',
  },
  action: {
    Icon: Users,
    line: 'border-accent/50 bg-accent/10',
    text: 'text-accent',
  },
  warning: {
    Icon: AlertTriangle,
    line: 'border-amber/50 bg-amber/10',
    text: 'text-amber',
  },
  notice: {
    Icon: Info,
    line: 'border-indigo/50 bg-indigo/10',
    text: 'text-indigo',
  },
  broadcast: {
    Icon: Megaphone,
    line: 'border-indigo/50 bg-indigo/10',
    text: 'text-indigo',
  },
}

function toneOf(tone) {
  return TONES[tone] || TONES.notice
}

export function StatusSlot({ items = [] }) {
  const [userOpen, setUserOpen] = useState(false)
  const regionId = useId()

  const count = items.length
  const top = items[0]

  // Two cases open themselves. A blocking item means the crew's input is
  // disabled and they need to know why without hunting for it. An `announce`
  // item is transient and explains something that just changed on screen, so
  // it is useless if it expires while collapsed.
  //
  // Everything else stays shut, which is the whole point of the slot.
  const forcedOpen = top?.tone === 'blocking' || Boolean(top?.announce)

  // Derived, not stored. An empty slot can never be "open", so it cannot come
  // back already expanded the next time something arrives, and there is no
  // effect resetting a flag after the fact.
  const open = count > 0 && (forcedOpen || userOpen)

  if (count === 0) return null

  const { Icon, line, text } = toneOf(top.tone)

  // Expandable when there is more than one item, or when the single item
  // carries detail or an action that will not fit on the summary line.
  const expandable = count > 1 || Boolean(top.detail) || Boolean(top.action)

  return (
    <div className="w-full">
      <div
        role="status"
        aria-live="polite"
        className={`w-full border-l-[3px] ${line} ${open ? '' : 'border-b border-b-transparent'}`}
      >
        {expandable ? (
          <button
            type="button"
            onClick={() => setUserOpen(!open)}
            aria-expanded={open}
            aria-controls={regionId}
            className="w-full min-h-11 px-3 py-2.5 flex items-center gap-2.5 text-left
              motion-press cursor-pointer
              focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          >
            <Icon className={`w-4 h-4 shrink-0 ${text}`} strokeWidth={2} />
            <span
              className={`flex-1 min-w-0 text-[12.5px] leading-snug truncate ${text}`}
            >
              {top.label}
            </span>
            {count > 1 && (
              <span
                className={`shrink-0 text-[12px] font-mono tabular-nums px-1.5 py-0.5
                  border border-current ${text}`}
              >
                +{count - 1}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className={`w-4 h-4 shrink-0 ${text} transition-transform duration-(--duration-base) ease-standard ${
                open ? 'rotate-180' : ''
              }`}
              strokeWidth={2}
            />
          </button>
        ) : (
          <div className="w-full min-h-11 px-3 py-2.5 flex items-center gap-2.5">
            <Icon className={`w-4 h-4 shrink-0 ${text}`} strokeWidth={2} />
            <span className={`flex-1 min-w-0 text-[12.5px] leading-snug ${text}`}>
              {top.label}
            </span>
          </div>
        )}

        {expandable && (
          <div
            id={regionId}
            className="motion-disclose"
            data-open={open ? 'true' : 'false'}
          >
            <div>
              <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
                {items.map((item) => {
                  const t = toneOf(item.tone)
                  return (
                    <li key={item.id} className="px-3 py-3 flex items-start gap-2.5">
                      <t.Icon
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${t.text}`}
                        strokeWidth={2}
                      />
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <p className={`text-[12.5px] leading-snug ${t.text}`}>
                          {item.label}
                        </p>
                        {item.detail && (
                          <p className="text-[12px] leading-snug text-text-secondary">
                            {item.detail}
                          </p>
                        )}
                      </div>
                      {item.action && (
                        <button
                          type="button"
                          onClick={item.action.onClick}
                          className={`shrink-0 min-h-11 -my-1 px-1 text-[12px] underline
                            ${t.text} motion-press cursor-pointer
                            focus-visible:outline focus-visible:outline-1
                            focus-visible:outline-accent`}
                        >
                          {item.action.label}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StatusSlot
