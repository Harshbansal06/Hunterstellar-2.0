import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Wordmark } from '../components/brand/Wordmark'
import { SESSION_NOTICE_KEY } from '../api/client'
import { useOnline } from '../hooks/useOnline'
import { hasSeenPrologue } from '../utils/prologueSeen'
import { describeError, formatCountdown, retryAfterSeconds, RETRY } from '../utils/errorCopy'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const online = useOnline()

  const [teamName, setTeamName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  // Read (and consume) in a lazy initialiser: an effect for this would set
  // state on the very first commit just to show a message we already know.
  const [notice] = useState(() => {
    try {
      const reason = sessionStorage.getItem(SESSION_NOTICE_KEY)
      if (reason) sessionStorage.removeItem(SESSION_NOTICE_KEY)
      if (reason === 'replaced') {
        return 'Your team signed in on another device. Only one device can play at a time — log in again to take over.'
      }
      if (reason === 'expired') {
        return 'Your session expired. Log in again to pick up where you left off.'
      }
    } catch {
      /* ignore */
    }
    return null
  })
  const [blockedUntil, setBlockedUntil] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!blockedUntil) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [blockedUntil])

  const secondsLeft = blockedUntil ? Math.max(0, Math.round((blockedUntil - now) / 1000)) : 0

  const canSubmit =
    teamName.trim() && password.trim() && !loading && online && secondsLeft === 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setError(null)
    setLoading(true)
    try {
      const data = await login(teamName.trim(), password)
      // First sign-in on this device gets the briefing; anyone already mid-hunt
      // goes straight to their clue.
      const seen = hasSeenPrologue(data?.user?.id)
      navigate(seen ? '/dashboard' : '/prologue', { replace: true })
    } catch (err) {
      const described = describeError(err, 'login')
      setError(described)
      if (described.retry === RETRY.COUNTDOWN) {
        const seconds = retryAfterSeconds(err) ?? described.seconds ?? 60
        setBlockedUntil(Date.now() + seconds * 1000)
      }
      // Keep the team name (usually right, tedious to retype); clear only the
      // secret that was wrong.
      if (err.response?.status === 401) setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="relative grain-frame w-full max-w-[412px] h-screen sm:h-[917px] bg-bg flex flex-col overflow-hidden border-x sm:border border-surface-alt shadow-2xl">
        <div className="relative flex-1 flex flex-col items-center bg-bg grain-frame px-6 pt-16 overflow-y-auto">
          <div className="flex flex-col items-center gap-16 w-full max-w-sm">
            <Wordmark width={240} />

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-7" noValidate>
              {/* Wording is copied from the registration form, deliberately.
                  A team under pressure is reading their confirmation email in
                  one hand and this screen in the other; three different names
                  for the same two fields is how a crew decides the app is
                  broken. The form's labels cannot change -- they are live and
                  the Apps Script matches on them -- so everything else moves
                  to match the form. */}
              <p className="text-text-primary text-center text-lg leading-snug">
                Enter your shuttlecraft credentials
              </p>

              {notice && (
                <p className="text-[12px] text-amber text-center border border-amber/40 bg-amber/10 rounded-md px-3 py-2">
                  {notice}
                </p>
              )}

              <div className="flex flex-col gap-6">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={loading}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="Shuttlecraft Callsign"
                  aria-label="Shuttlecraft callsign"
                  className="w-full h-[60px] bg-surface border border-surface-alt rounded-md px-5 text-text-primary text-base placeholder:text-text-muted outline-none focus:border-accent disabled:opacity-60"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="Rust Bucket Access Code"
                  aria-label="Rust Bucket access code"
                  className="w-full h-[60px] bg-surface border border-surface-alt rounded-md px-5 text-text-primary text-base placeholder:text-text-muted outline-none focus:border-accent disabled:opacity-60"
                />
              </div>

              {error && (
                <div role="alert" className="text-center flex flex-col gap-1">
                  <p className="text-sm text-red">{error.title}</p>
                  <p className="text-xs text-text-muted">{error.body}</p>
                  {secondsLeft > 0 && (
                    <p className="text-xs text-amber font-mono tabular-nums">
                      Try again in {formatCountdown(secondsLeft)}
                    </p>
                  )}
                </div>
              )}

              {!online && (
                <p className="text-xs text-amber text-center">
                  You&rsquo;re offline. Reconnect to sign in.
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full h-[52px] bg-[#f6f6f6] text-text-inverse rounded-md font-display text-lg disabled:opacity-60"
              >
                {loading ? 'Decrypting...' : 'Board Shuttlecraft'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
