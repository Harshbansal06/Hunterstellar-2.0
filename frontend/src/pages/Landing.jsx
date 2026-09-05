import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/brand/Wordmark'

const HOLD_MS = 2200
const FADE_MS = 400

/**
 * The splash.
 *
 * It advances itself, there is no Continue button, because a title card that
 * asks for a tap is just a slow door. But removing the button must not remove
 * the player's ability to move on, so the whole screen is a skip target: at a
 * live event someone reopens this app twenty times, and the twenty-first time
 * they do not want to wait 2.2 seconds to reach their clue.
 *
 * `replace: true` keeps the splash out of the history stack. Without it the
 * Android back button from Login lands here, which then bounces forward
 * again, a loop the player cannot leave except by closing the app.
 *
 * GuestRoute already keeps signed-in players away from this route entirely.
 */
export default function Landing() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  const go = useCallback(() => {
    setLeaving(true)
    // Let the fade play out, but never gate navigation on an animation event:
    // if the frame is dropped the player still arrives.
    setTimeout(() => navigate('/login', { replace: true }), FADE_MS)
  }, [navigate])

  useEffect(() => {
    const t = setTimeout(go, HOLD_MS)
    return () => clearTimeout(t)
  }, [go])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="relative w-full max-w-[412px] h-[100dvh] sm:h-[917px] bg-bg flex flex-col overflow-hidden border-x sm:border border-surface-alt shadow-2xl">
        <div
          className={`flex-1 flex flex-col items-center justify-between px-6 py-16 relative grain-frame overflow-hidden transition-opacity duration-[400ms] ${
            leaving ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <Wordmark width={280} />
            <p className="text-text-primary text-center text-lg leading-snug max-w-[339px]">
              Find them before he does.
            </p>
          </div>
          <p className="text-text-primary text-center text-[15px] tracking-normal leading-snug whitespace-nowrap px-3">
            Presented by{' '}
            <span className="font-semibold">ASTRONOMY &amp; PHYSICS SOCIETY</span>
          </p>
        </div>

        {/* Full-bleed skip. Sits above the content but below nothing else --
            there is nothing else on this screen to click. */}
        <button
          type="button"
          onClick={go}
          aria-label="Skip intro"
          className="absolute inset-0 z-10 w-full h-full cursor-pointer"
        />
      </div>
    </div>
  )
}
