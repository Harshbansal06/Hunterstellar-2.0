import { Link, Navigate } from 'react-router-dom'
import { Layout } from '../components/shell/Layout'
import { Wordmark } from '../components/brand/Wordmark'
import { useAuth } from '../context/AuthContext'
import { FragmentRecord } from '../components/fragments/FragmentRecord'
import {
  ASSEMBLED_MESSAGE,
  FRAGMENTS,
  FRAGMENT_COUNT,
  unlockedFragmentCount,
} from '../content/fragments'

/**
 * The handoff from the app to the physical final challenge.
 *
 * This screen used to be pure story. It has to be both: a team arriving here
 * needs to know, without ambiguity, that the hunt continues offline and what
 * to do next.
 */
export default function Finished() {
  const { user } = useAuth()
  const complete = unlockedFragmentCount(user?.progress) >= FRAGMENT_COUNT

  /**
   * The Null Void does not exist for a player until they have earned it, and
   * this route was reachable by simply typing the URL -- handing a team at
   * stop 1 the name of the ending.
   *
   * On a cold reload straight here, `user` comes from localStorage and can
   * briefly lag, so a genuinely finished team may bounce to the journey
   * screen once; the redirect there sends them straight back as soon as
   * /team/state resolves. One bounce, landing somewhere safe, beats leaking
   * the ending.
   */
  const finished = user?.status === 'finished' || (user?.progress ?? 0) >= 5
  if (!finished) return <Navigate to="/journey" replace />

  return (
    <Layout title="The Null Void">
      <div className="flex-1 flex flex-col items-center px-6 py-8 gap-6 overflow-y-auto">
        <Wordmark width={200} />

        <h1 className="display-grunge text-4xl text-void-gold text-center">
          You are in the Null Void
        </h1>

        {complete && (
          <div className="w-full rounded-md border border-void-gold/50 bg-void-gold/10 px-4 py-5 flex flex-col gap-3">
            <span className="text-[12px] uppercase tracking-[0.3em] text-void-gold">
              Assembled transmission
            </span>
            {ASSEMBLED_MESSAGE ? (
              <p className="text-void-gold text-[17px] leading-relaxed whitespace-pre-line">
                {ASSEMBLED_MESSAGE}
              </p>
            ) : (
              // The case study is argued from these records, so put them in
              // front of the crew rather than making them tab away mid-answer.
              //
              // Each one is labelled here. FragmentRecord no longer prints a
              // header of its own, so four unlabelled runs of mono would read
              // as one twelve-paragraph wall with no way to cite a fragment by
              // name while arguing.
              <div className="flex flex-col gap-5">
                {Object.values(FRAGMENTS).map((fragment) => (
                  <div key={fragment.index} className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-void-gold/80">
                      {fragment.label}
                    </span>
                    <FragmentRecord fragment={fragment} dense />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="w-full rounded-md border border-accent/40 bg-accent/10 px-4 py-4 flex flex-col gap-2">
          <p className="text-accent text-[15px] font-medium">
            The final challenge is physical.
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            Report to the marshals with your assembled transmission. The last problem is a
            case study, solved in person rather than in this app. Nothing further happens
            on this screen.
          </p>
        </div>

        <div className="w-full flex flex-col gap-3 text-text-secondary text-[15px] leading-relaxed">
          <p>
            Four shards, four star systems, one record that was never meant to be read
            back in order. Vilgax never reached them.
          </p>
          <p className="text-text-muted">
            What you do with it is no longer the Omnitrix&rsquo;s decision.
          </p>
        </div>

        <Link
          to="/leaderboard"
          className="motion-press mt-auto flex h-[52px] w-full items-center justify-center rounded-md bg-accent font-display text-lg text-text-inverse no-underline"
        >
          See the standings
        </Link>

        <p className="text-text-muted text-[12px] text-center">
          Presented by{' '}
          <span className="font-semibold">ASTRONOMY &amp; PHYSICS SOCIETY</span>
        </p>
      </div>
    </Layout>
  )
}
