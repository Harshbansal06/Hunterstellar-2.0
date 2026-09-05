import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { Layout } from '../components/shell/Layout'
import { useAuth } from '../context/AuthContext'
import { FragmentDeck } from '../components/fragments/FragmentDeck'
import { Wordmark } from '../components/brand/Wordmark'
import { FRAGMENT_COUNT, unlockedFragmentCount } from '../content/fragments'

/**
 * The crew's own surface: what they have recovered, and the story behind it.
 *
 * Implements Figma RWVG6TMWF7heyZh2xKAZDA node 41:61. The shell (56px header,
 * 64px nav) is Layout's; this file owns everything between them, at the
 * design's 20px inset, 24px block padding and 32px section rhythm.
 *
 * Everything here derives from `user.progress` in context, with no fetch. That
 * is deliberate and it is what makes this the right screen to send a
 * locked-out crew to: it works with no signal, on a freshly cleared phone, and
 * it shows every teammate the same thing regardless of who was looking when a
 * fragment was won.
 *
 * The prologue sits below the deck behind a rule. Fragments are why a crew
 * opens this tab; the briefing is why they might stay. It is a link and never
 * a redirect, because a crew standing at a station in a hurry must never be
 * made to read.
 */
export default function Fragments() {
  const { user } = useAuth()
  const progress = user?.progress ?? 0
  const unlocked = unlockedFragmentCount(progress)
  const complete = unlocked >= FRAGMENT_COUNT

  return (
    <Layout title="Fragments">
      <div className="flex flex-1 flex-col gap-8 px-5 py-6">
        <header className="flex w-full flex-col gap-2">
          <h1 className="display-grunge text-[34px] leading-[0.92] tracking-[0.02em] text-text-primary">
            Data Fragments
          </h1>
          <p className="text-[14px] leading-relaxed text-text-muted">
            {complete
              ? `All ${FRAGMENT_COUNT} recovered. Carry them into the final challenge.`
              : `${unlocked} of ${FRAGMENT_COUNT} recovered. Solve a station's challenge to earn the next.`}
          </p>
        </header>

        <FragmentDeck unlocked={unlocked} />

        {/*
          The heading and its explainer are gone. The button says what it does,
          and a label plus a sentence telling a crew that the next control is
          optional was three lines spent to introduce one.

          The sheen and the dot field are what mark it as the one thing on this
          screen that is worth a look but is not required: it reads as a
          printed card rather than a control, so it invites without competing
          with the fragments above it.
        */}
        <section className="w-full border-t border-border/60 pt-6">
          <Link
            to="/prologue"
            className="motion-press shimmer dot-field flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-accent/30 bg-surface font-display text-[15px] tracking-[0.025em] text-text-primary no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          >
            {/* Above the sheen, which sits at z-index 1. */}
            <BookOpen
              className="relative z-[2] h-4 w-4 text-accent"
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="relative z-[2]">Read the prologue</span>
          </Link>
        </section>

        <footer className="mt-auto flex w-full flex-col items-center gap-2 pt-6">
          <Wordmark width={180} />
          <p className="text-center text-[12px] leading-[18px] text-text-muted">
            Presented by{' '}
            <span className="font-semibold">ASTRONOMY &amp; PHYSICS SOCIETY</span>
          </p>
        </footer>
      </div>
    </Layout>
  )
}
