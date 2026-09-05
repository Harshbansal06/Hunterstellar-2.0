import { useId, useState } from 'react'
import { ChevronDown, Lock } from 'lucide-react'
import { FragmentRecord } from './FragmentRecord'
import { FRAGMENT_COUNT, getFragment } from '../../content/fragments'

/**
 * The four recovered logs, as a deck of cards that open in place.
 *
 * Implements Figma RWVG6TMWF7heyZh2xKAZDA node 41:292 (open) / 41:291
 * (closed) / 41:340 (locked).
 *
 * The card title is now the record's only heading, set in Bebas at display
 * size, and it carries state through colour: accent when the card is open,
 * muted when it is closed or locked. That replaces the previous arrangement,
 * where a small mono label sat above a second bracketed header line inside
 * the body, and an amber tone stripe made a third coloured element compete
 * with both.
 *
 * Deliberately NOT `.display-grunge`, which every other display heading in the
 * app uses: that class overlays a noise texture, and at four cards stacked it
 * reads as dirt rather than as texture. The design shows clean type here.
 *
 * Expand rather than drill: each record belongs to exactly one card, each is
 * short, and a crew reads several together when assembling the picture. A
 * route per fragment would be four navigations to read four logs.
 */

/* Shared so the open, closed and locked heads cannot drift apart. Values are
   the design's: Bebas 33.84px / 31.133px leading / 0.6768px tracking, rounded
   to the nearest sensible unit. */
const TITLE = 'font-bebas text-[34px] leading-[0.92] tracking-[0.02em] uppercase'
const HEAD_ROW = 'flex w-full min-h-11 items-center justify-between gap-3 px-4 pb-3 pt-4'

function EarnedCard({ index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const regionId = useId()
  const fragment = getFragment(index)
  const label = fragment?.label || `Fragment ${index}`

  return (
    <li className="w-full bg-surface p-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={regionId}
        className={`${HEAD_ROW} motion-press cursor-pointer text-left focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-1 focus-visible:outline-accent`}
      >
        <span className={`${TITLE} ${open ? 'text-accent' : 'text-text-muted'}`}>
          {label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`ease-standard h-4 w-4 shrink-0 transition-transform duration-(--duration-base) ${
            open ? 'rotate-180 text-accent' : 'text-text-muted'
          }`}
          strokeWidth={1.33}
        />
      </button>

      <div id={regionId} className="motion-disclose" data-open={open ? 'true' : 'false'}>
        <div>
          <div className="px-4 pb-6 pt-2.5">
            <FragmentRecord fragment={fragment} />
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * A locked card is the same object with the lock in place of the chevron, and
 * no body behind it. It is not a button: there is nothing to open yet, and a
 * control that reveals nothing is worse than no control.
 *
 * The redacted placeholder bars the previous version drew are gone, per the
 * design. They made an unearned card taller than an earned one, which put the
 * most visual weight on the thing the crew has least of.
 */
function LockedCard({ index }) {
  const label = getFragment(index)?.label || `Fragment ${index}`

  return (
    <li className="w-full bg-surface p-1">
      <div className={HEAD_ROW}>
        <span className={`${TITLE} text-text-muted/60`}>{label}</span>
        <Lock
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-text-muted/60"
          strokeWidth={2}
        />
        <span className="sr-only">Not yet recovered</span>
      </div>
    </li>
  )
}

export function FragmentDeck({ unlocked = 0 }) {
  const count = Math.min(Math.max(unlocked, 0), FRAGMENT_COUNT)

  if (count === 0) {
    // Empty is a first-run experience, not "nothing to show". It names what
    // this screen will hold rather than apologising for being blank.
    return (
      <div className="flex w-full flex-col gap-3 border border-dashed border-border bg-surface/40 px-5 py-8">
        <h2 className="display-grunge text-[26px] text-text-primary">
          Nothing recovered yet
        </h2>
        <p className="text-[14px] leading-relaxed text-text-secondary">
          Each station holds one fragment of the Ultimate Power. Solve a station&rsquo;s
          challenge and its log lands here, readable for the rest of the hunt.
        </p>
        <p className="text-[13px] text-text-muted">
          Four fragments, four pieces of the same picture.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex w-full flex-col gap-3">
      {Array.from({ length: FRAGMENT_COUNT }, (_, i) => i + 1).map((index) =>
        index <= count ? (
          <EarnedCard
            key={index}
            index={index}
            // The most recently earned card opens by default. A crew arriving
            // here straight from a reveal wants the log they just got.
            defaultOpen={index === count}
          />
        ) : (
          <LockedCard key={index} index={index} />
        ),
      )}
    </ul>
  )
}

export default FragmentDeck
