import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Layers, Radio, Trophy, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { SessionSheet } from './SessionSheet'

/**
 * The app shell: header, content column, nav rail, and the portal target every
 * sheet renders into.
 *
 * RESPONSIVENESS. This used to be a hard 412px box with a fake phone bezel,
 * letterboxed on a navy background at every size above a phone. Three things
 * were wrong with that: it wasted the whole viewport on a laptop, the navy
 * ground was a leftover from a previous palette and matched nothing, and the
 * content lived in an inner `overflow-y-auto` div, which fights mobile browser
 * chrome and breaks scroll restoration.
 *
 * Now it is one fluid column that the PAGE scrolls: full-bleed on a phone,
 * capped at a readable measure above that, with the header and rail pinned via
 * `sticky` rather than a fixed-height flex sandwich. `100dvh` (not `100vh`)
 * means the address bar collapsing does not leave a gap.
 *
 * IA. The rail carries three destinations. Logout used to be a fourth item,
 * which put a session-ending action at Tier 1 beside three navigation targets;
 * it lives in SessionSheet behind a confirm step. The back chevron is gone
 * because all three destinations are root tabs, so "back" either did nothing
 * or duplicated a neighbour.
 */

const NAV_ITEMS = [
  { to: '/fragments', key: 'fragments', label: 'Fragments', Icon: Layers },
  { to: '/journey', key: 'journey', label: 'Journey', Icon: Radio },
  { to: '/leaderboard', key: 'leaderboard', label: 'Standings', Icon: Trophy },
]

export function Layout({
  title = 'Your Journey',
  /** Replaces the header's LEFT region only. The right region is always owned
      by the header, so the crew button never disappears on a screen that
      supplies its own title. */
  titleNode,
  /** Screen-specific header controls, placed before the crew button. */
  actions,
  /** False on terminal screens where the rail would offer a false exit. */
  showNav = true,
  children,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const [sessionOpen, setSessionOpen] = useState(false)

  const activeKey = NAV_ITEMS.reduce(
    (acc, item) => (location.pathname.startsWith(item.to) ? item.key : acc),
    null,
  )

  function handleLogout() {
    setSessionOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="grain-frame relative min-h-[100dvh] bg-bg">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col sm:border-x sm:border-surface-alt/40">
        <header className="sticky top-0 z-20 flex h-[56px] shrink-0 items-center justify-between gap-2 border-b border-surface-alt/40 bg-bg/95 px-4 backdrop-blur-sm sm:px-6">
          {titleNode || (
            <h1 className="truncate font-display text-[15px] uppercase tracking-[0.18em] text-text-primary">
              {title}
            </h1>
          )}
          <div className="flex shrink-0 items-center">
            {actions}
            <CrewButton onClick={() => setSessionOpen(true)} />
          </div>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>

        {showNav && (
          <nav
            aria-label="Sections"
            className="sticky bottom-0 z-20 flex h-16 shrink-0 items-stretch border-t border-surface-alt/40 bg-surface/95 backdrop-blur-sm"
          >
            {NAV_ITEMS.map(({ to, key, label, Icon }) => {
              const active = activeKey === key
              return (
                <Link
                  key={key}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`motion-press flex flex-1 flex-col items-center justify-center gap-1 no-underline focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-1 focus-visible:outline-accent ${
                    active ? 'text-accent' : 'text-text-muted'
                  }`}
                >
                  {/* Active state is carried by colour plus the rule above the
                      icon. Two channels, and both survive colour blindness. */}
                  <span
                    aria-hidden="true"
                    className={`h-[2px] w-7 ${active ? 'bg-accent' : 'bg-transparent'}`}
                  />
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  <span className="text-[12px] font-medium leading-none">{label}</span>
                </Link>
              )
            })}
          </nav>
        )}
      </div>

      {/*
        Sheet portal target, fixed to the VIEWPORT rather than absolute inside
        the column: the page scrolls now, so an absolutely positioned sheet
        would sit at the bottom of the document instead of the screen. Each
        sheet re-centres itself to the column's measure.
        `pointer-events-none` so it never swallows taps while empty.
      */}
      <div id="hs-sheet-root" className="pointer-events-none fixed inset-0 z-50" />

      <SessionSheet
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        user={user}
        onLogout={handleLogout}
      />
    </div>
  )
}

/**
 * Always the rightmost header control, on every screen. Consistent geography
 * is what lets a player learn where something lives once.
 */
export function CrewButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Your crew and session"
      className="motion-press -mr-2 flex h-11 w-11 cursor-pointer items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
    >
      <UserRound className="h-[19px] w-[19px]" strokeWidth={2} />
    </button>
  )
}

export default Layout
