import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Globe, Map, Trophy, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { NotificationBell } from './NotificationBell'

const NAV_ITEMS = [
  { to: '/planet', key: 'planet', label: 'Fragments', Icon: Globe },
  { to: '/dashboard', key: 'journey', label: 'Journey', Icon: Map },
  { to: '/leaderboard', key: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
]

export function Layout({ children, title = 'Your Journey', notifications = [] }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()

  const activeKey = NAV_ITEMS.reduce(
    (acc, item) => (location.pathname.startsWith(item.to) ? item.key : acc),
    'planet',
  )

  function handleBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard')
  }

  function handleLogout() {
    if (!window.confirm('Log out? Your progress stays safe.')) return
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-0 sm:p-4">
      <div className="relative grain-frame w-full max-w-[412px] h-[100dvh] sm:h-[min(917px,92dvh)] bg-bg flex flex-col overflow-hidden border-x sm:border border-surface-alt shadow-2xl sm:rounded-xl">
        <header className="flex items-center justify-between px-4 h-[52px] border-b border-surface-alt/40 shrink-0">
          <button onClick={handleBack} aria-label="Go back" className="flex items-center gap-2 text-text-primary cursor-pointer">
            <ChevronLeft className="w-5 h-5" />
            <span className="font-display text-lg text-text-primary">{title}</span>
          </button>

          <NotificationBell items={notifications} />
        </header>

        <main className="flex-1 flex flex-col overflow-y-auto">{children}</main>

        <nav className="flex items-center justify-around h-16 bg-surface border-t border-surface-alt/40 shrink-0">
          {NAV_ITEMS.map(({ to, key, label, Icon }) => {
            const active = activeKey === key
            return (
              <Link
                key={key}
                to={to}
                className={`flex flex-col items-center justify-center w-16 h-12 gap-0.5 no-underline ${active ? 'text-accent' : 'text-text-muted'}`}
              >
                <span className={`w-11 h-7 rounded-2xl flex items-center justify-center ${active ? 'bg-nav-active' : ''}`}>
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                </span>
                <span className={`text-[11px] font-medium ${active ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
              </Link>
            )
          })}
          <button onClick={handleLogout} title="Log out" aria-label="Log out" className="flex flex-col items-center justify-center w-16 h-12 gap-0.5 text-text-muted hover:text-accent transition-colors cursor-pointer no-underline">
            <span className="w-11 h-7 rounded-2xl flex items-center justify-center">
              <LogOut className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <span className="text-[11px] font-medium">Logout</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
