import { Link } from 'react-router-dom'
import { Orbit } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="relative grain-frame w-full max-w-[412px] h-screen sm:h-[917px] bg-bg flex flex-col overflow-hidden border-x sm:border border-surface-alt shadow-2xl">
        <div className="flex-1 flex items-center justify-center px-6 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Orbit
              className="w-[400px] h-[400px] text-accent/5 animate-spin-slow"
              strokeWidth={0.5}
            />
          </div>
          <div className="relative flex flex-col items-center text-center">
            <h1 className="text-[110px] leading-none font-bebas text-text-primary mb-2">
              404
            </h1>
            <p className="text-text-secondary text-base mb-2">Signal lost in the void.</p>
            <p className="text-text-muted text-sm mb-6 max-w-sm">
              This coordinate does not exist within the decrypted navigation network.
              Return to Base Station Aegis.
            </p>
            <Link
              to="/"
              className="motion-press inline-flex min-h-11 items-center rounded-md bg-accent px-8 font-display text-base text-text-inverse no-underline"
            >
              Recall to Base
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
