import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Map } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { Layout } from '../components/shell/Layout'
import { StopIndicator } from '../components/journey/StopIndicator'
import { StatusSlot } from '../components/feedback/StatusSlot'
import { JourneyMapSheet } from '../components/journey/JourneyMapSheet'
import { ImageSheet } from '../components/journey/ImageSheet'
import { LockoutScreen } from '../components/journey/LockoutScreen'
import { ClueCard } from '../components/journey/ClueCard'
import { PuzzleCard } from '../components/journey/PuzzleCard'
import { FragmentReveal } from '../components/fragments/FragmentReveal'
import { StateView } from '../components/feedback/StateView'
import { ClueSkeleton } from '../components/ui/Skeleton'
import { useTeamState } from '../hooks/useTeamState'
import { useOnline } from '../hooks/useOnline'
import { FRAGMENT_COUNT } from '../content/fragments'
import { STATION_COUNT, VERIFY_ATTEMPTS, VERIFY_WINDOW_MINUTES } from '../config/rules'
import {
  describeError,
  formatCountdown,
  retryAfterSeconds,
  RETRY,
} from '../lib/errorCopy'

const FLOW_KEY = 'hunterstellar_v2'
const TOAST_MS = 6000

/**
 * One task, one screen.
 *
 * What used to render here, above the clue: an eyebrow, a chapter heading, a
 * progress bar, a stale chip, a lockout banner, a rate-limit box, a
 * teammate-moved box, a toast, an admin notice and a broadcast announcement.
 * Three always, seven conditional, none of them mutually exclusive. The clue
 * was block eleven on a 412px frame.
 *
 * Now: the station and stop live in the header, the route lives one tap behind
 * the Map control, all five status conditions share one collapsible slot, and
 * the body renders exactly one thing. Lockout and the fragment reveal are
 * screens rather than inline branches, because each is the whole state when it
 * happens.
 *
 * Nothing about the data layer changed. `useTeamState` is still the single
 * owner of /team/state and still wins over a poll when a POST returns fresher
 * state.
 */

/**
 * Only genuinely-local UI state is persisted. Which fragments a team has earned
 * is NOT stored: it is derived from the server's `progress`, so clearing
 * storage or switching phones loses nothing. That matters because four
 * teammates share one login and only one of them sees any given reveal.
 */
function loadFlow() {
  try {
    const raw = localStorage.getItem(FLOW_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { pendingReveal: parsed.pendingReveal ?? null }
    }
  } catch {
    /* corrupt or unavailable storage is not worth failing over */
  }
  return { pendingReveal: null }
}

export default function Dashboard() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const online = useOnline()

  const { state, loading, error, lastUpdated, refetch, applyState } = useTeamState({
    teamId: user?.id,
  })

  const [flow, setFlow] = useState(loadFlow)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [toast, setToast] = useState(null)
  const [rateLimitedUntil, setRateLimitedUntil] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const [mapOpen, setMapOpen] = useState(false)
  const [imagesOpen, setImagesOpen] = useState(false)

  /**
   * Set when a locked crew taps "Read clue". Purely local and deliberately not
   * persisted: it is a view toggle, not progress, and a crew reopening the app
   * mid-lockout should land on the countdown, which is the thing that answers
   * "can I do anything yet".
   */
  const [readingClueWhileLocked, setReadingClueWhileLocked] = useState(false)

  // Set while a teammate is part-way through typing, so a poll cannot yank the
  // screen out from under them.
  const [inputDirty, setInputDirty] = useState(false)
  const [heldStage, setHeldStage] = useState(null)

  function persistFlow(next) {
    setFlow(next)
    try {
      localStorage.setItem(FLOW_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  // Drives the rate-limit countdown and the stale timestamp. Only runs while
  // one of them is on screen: an unconditional 1Hz tick re-rendered the whole
  // journey tree every second for a three-hour hunt to animate nothing. The
  // first tick is deferred a frame so the effect body itself sets no state.
  useEffect(() => {
    if (!rateLimitedUntil && !error) return undefined
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [rateLimitedUntil, error])

  // Transient messages expire on their own. The slot auto-opens for them, so
  // one that outlived its relevance would sit there holding the screen open.
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  // Purely derived, so it reaches zero on its own as `now` ticks and there is
  // no second copy in state to keep in sync.
  const rateSecondsLeft = rateLimitedUntil
    ? Math.max(0, Math.round((rateLimitedUntil - now) / 1000))
    : 0

  // Rides the same `now` tick as the rate-limit countdown rather than starting
  // a second interval for a second clock.
  const lockSecondsLeft = state?.lock_until
    ? Math.max(0, Math.round((new Date(state.lock_until).getTime() - now) / 1000))
    : 0

  const stage = state?.stage
  const progress = state?.team?.progress || 0

  const locked = stage === 'locked'
  // Declared here rather than beside the render branches because the status
  // slot below needs it: while a crew reads the clue mid-lockout, the slot is
  // the only thing still showing the countdown.
  const lockedReading = locked && readingClueWhileLocked

  // A new lockout, or the end of one, always returns to the countdown. Without
  // this a crew that opened the clue during one lockout would still be looking
  // at the clue when the next one landed, and never see the new timer.
  const lockUntil = state?.lock_until ?? null
  const [prevLockUntil, setPrevLockUntil] = useState(lockUntil)
  if (lockUntil !== prevLockUntil) {
    setPrevLockUntil(lockUntil)
    if (readingClueWhileLocked) setReadingClueWhileLocked(false)
  }

  useEffect(() => {
    if (state?.team) updateUser(state.team)
  }, [state?.team, updateUser])

  useEffect(() => {
    // Only leave once the reveal has been acknowledged, or the last fragment
    // would never be shown.
    if (stage === 'finished' && !flow.pendingReveal) navigate('/finished')
  }, [stage, flow.pendingReveal, navigate])

  /**
   * A teammate advanced the stage while this member was typing. Swapping the
   * view now would destroy their half-entered code, so hold the previous stage
   * and let them choose when to move.
   *
   * Adjusted during render rather than in an effect, which is React's
   * documented pattern for deriving state from changing props: an effect would
   * render the wrong screen for one frame first, which is the exact flicker
   * this prevents.
   */
  const holdingForTyping = Boolean(
    inputDirty && heldStage && stage && heldStage !== stage,
  )
  if (stage && !holdingForTyping && heldStage !== stage) {
    setHeldStage(stage)
  }

  const adoptLatest = useCallback(() => {
    setInputDirty(false)
    setHeldStage(stage)
    setSubmitError('')
  }, [stage])

  function handleFailure(err, ctx) {
    const described = describeError(err, ctx)
    if (described.retry === RETRY.COUNTDOWN) {
      const seconds = retryAfterSeconds(err) ?? described.seconds ?? 60
      setRateLimitedUntil(Date.now() + seconds * 1000)
      setSubmitError('')
      return
    }
    setSubmitError(`${described.title}. ${described.body}`)
  }

  /**
   * Take the state a POST just handed back, and resync `heldStage` with it.
   *
   * The resync is the load-bearing half. `holdingForTyping` exists to stop a
   * poll from swapping the view out from under someone mid-typing, and it
   * fires whenever `heldStage !== stage` while the input is dirty. But a wrong
   * code deliberately leaves the input dirty (retyping a code that just cost
   * you the full lockout is indefensible) while the stage flips to `locked`.
   * Without this, that self-inflicted change looked exactly like a teammate's
   * and the screen claimed "a teammate moved the crew forward" on top of the
   * lockout the player had just earned themselves.
   *
   * Every branch below that adopts a server state goes through here, so the
   * only changes left that can trigger the hold are the ones that genuinely
   * came from somewhere else.
   */
  function adopt(next) {
    if (!next) return
    applyState(next)
    setHeldStage(next.stage ?? null)
  }

  /** Returns true when the submission succeeded, so inputs know to clear. */
  async function submit(path, payload, ctx) {
    if (!online) {
      setSubmitError('You are offline. This will work again once you reconnect.')
      return false
    }
    setSubmitError('')
    setSubmitting(true)
    try {
      const { data } = await api.post(path, payload)

      if (data.success) {
        // Trust the POST over the poll: it already describes the next stop.
        adopt(data.state)
        setInputDirty(false)

        if (typeof data.fragment_index === 'number') {
          persistFlow({ ...flow, pendingReveal: data.fragment_index })
        }
        return true
      }

      if (data.reason === 'locked') {
        // No toast needed any more: the lockout screen replaces the whole body
        // and says so at full size.
        if (data.state) adopt(data.state)
        else refetch()
        return false
      }

      if (data.reason === 'wrong_stage') {
        // Not an error: another member got there first. Both end up in the
        // right place, so say so plainly rather than showing a failure.
        if (data.state) adopt(data.state)
        setInputDirty(false)
        setToast('A teammate already submitted this one. You are both moved on.')
        return true
      }

      if (data.reason === 'finished') {
        if (data.state) adopt(data.state)
        return true
      }

      if (data.reason === 'wrong_code') {
        // The lockout screen replaces the card, so whatever was typed is gone
        // with it; a dirty flag left behind would make the poll that ends the
        // lock read as "a teammate moved the crew". The server sends `state`
        // on this path, so adopt() resyncs heldStage as well.
        setInputDirty(false)
        if (data.state) adopt(data.state)
        else refetch()

        // A crew that has already served this station's lockout gets the wrong
        // code refused for free. Say so: a crew braced for another five
        // minutes will otherwise stop trying, which is the opposite of what
        // the rule is for. `=== false` and not `!data.locked`, so an older
        // backend that sends neither field keeps the old silent behaviour.
        if (data.locked === false) {
          setSubmitError(
            'That code was not accepted. No lockout this time, you have already served one at this station.',
          )
        }
        return false
      }

      // wrong_answer, or anything unrecognised
      setSubmitError(
        ctx === 'question' ? 'Not quite. Try again.' : 'That code was not accepted.',
      )
      return false
    } catch (err) {
      handleFailure(err, ctx)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const submitCode = (code) => submit('/team/verify-code', { enteredCode: code }, 'clue')
  const submitAnswer = (ans) =>
    submit('/team/verify-answer', { enteredAns: ans }, 'question')

  // ------------------------------------------------------------ status slot

  const stageChangedWhileTyping = holdingForTyping
  const hasContent = Boolean(state)
  const showStale = Boolean(error) && hasContent

  // Read off `state` before the memo rather than inside it. Depending on
  // `state?.notice` while the body reads `state` makes the declared deps
  // narrower than the inferred ones, which stops the React Compiler from
  // preserving the memo at all.
  const notice = state?.notice ?? null
  const announcement = state?.announcement ?? null

  /**
   * The five conditions that used to be five stacked boxes, in priority order.
   * The slot renders whatever it is handed; deciding what is most urgent is
   * this screen's job, not the component's.
   */
  const statusItems = useMemo(() => {
    const items = []

    /**
     * First, because while a crew is reading the clue mid-lockout this line is
     * the only thing still telling them they cannot submit and how long is
     * left. The countdown moved off-screen with the timer, so it has to come
     * back somewhere, and the slot already auto-opens for `blocking`.
     */
    if (lockedReading) {
      items.push({
        id: 'locked',
        tone: 'blocking',
        label:
          lockSecondsLeft > 0
            ? `Locked for ${formatCountdown(lockSecondsLeft)}`
            : 'Locked out',
        detail: 'Read the clue again. Entry reopens when the timer runs out.',
        action: { label: 'Show timer', onClick: () => setReadingClueWhileLocked(false) },
      })
    }

    if (rateSecondsLeft > 0) {
      items.push({
        id: 'rate',
        tone: 'blocking',
        label: `Attempts paused for ${formatCountdown(rateSecondsLeft)}`,
        detail: `Your crew shares ${VERIFY_ATTEMPTS} attempts per ${VERIFY_WINDOW_MINUTES} minutes. Entry reopens when this clears.`,
      })
    }

    if (stageChangedWhileTyping) {
      items.push({
        id: 'moved',
        tone: 'action',
        label: 'A teammate moved the crew forward',
        detail: 'Your typing is kept until you switch.',
        action: { label: 'Show me', onClick: adoptLatest },
      })
    }

    if (toast) {
      items.push({ id: 'toast', tone: 'notice', label: toast, announce: true })
    }

    if (showStale) {
      const seconds = lastUpdated ? Math.round((now - lastUpdated) / 1000) : null
      items.push({
        id: 'stale',
        tone: 'warning',
        label: seconds != null ? `Last updated ${seconds}s ago` : 'Reconnecting',
        detail: 'Showing the last clue we received.',
        action: { label: 'Refresh', onClick: refetch },
      })
    }

    if (notice) {
      items.push({
        id: 'notice',
        tone: 'notice',
        label: 'Message from control',
        detail: notice,
      })
    }

    if (announcement) {
      items.push({
        id: `ann-${announcement}`,
        tone: 'broadcast',
        label: 'Announcement',
        detail: announcement,
      })
    }

    return items
  }, [
    rateSecondsLeft,
    stageChangedWhileTyping,
    adoptLatest,
    toast,
    showStale,
    lastUpdated,
    now,
    refetch,
    notice,
    announcement,
    lockedReading,
    lockSecondsLeft,
  ])

  // ---------------------------------------------------------------- render

  /**
   * Keyed on `progress`, deliberately not on `is_terminal` alone: the server
   * only sends `is_terminal` on the awaiting_code payload, so a crew locked
   * out AT the Null Void would fall back to a normal station heading at the
   * one moment the fifth stop is most obviously real.
   */
  const atTerminal = progress >= STATION_COUNT
  const isTerminal = state?.is_terminal ?? atTerminal
  const images = state?.clue_images || []

  // The reveal takes the whole frame, including the nav rail: it is a beat in
  // the story, not a screen to navigate away from.
  if (hasContent && flow.pendingReveal) {
    const index = flow.pendingReveal
    return (
      <Layout title="Fragment secured" showNav={false}>
        <FragmentReveal
          index={index}
          isLast={index >= FRAGMENT_COUNT}
          onContinue={() => persistFlow({ ...flow, pendingReveal: null })}
        />
      </Layout>
    )
  }

  if (!hasContent) {
    return (
      <Layout title="Your Journey">
        <StateView
          loading={loading}
          error={error}
          hasContent={false}
          skeleton={<ClueSkeleton />}
          onRetry={refetch}
        />
      </Layout>
    )
  }

  const inputsDisabled = !online || rateSecondsLeft > 0

  let disabledHint = null
  if (!online) disabledHint = 'Offline. Reconnect to submit.'
  else if (rateSecondsLeft > 0)
    disabledHint = `Attempts reset in ${formatCountdown(rateSecondsLeft)}.`

  // A locked crew can read but not submit. `inputsDisabled` already covers
  // offline and rate-limited; the lock is the third reason and the strongest.
  const submitBlocked = inputsDisabled || locked

  let body
  if (locked && !readingClueWhileLocked) {
    body = (
      <LockoutScreen
        lockUntil={state.lock_until}
        onExpire={refetch}
        hasClue={Boolean(state.clue_statement)}
        onReadClue={() => setReadingClueWhileLocked(true)}
      />
    )
  } else if (lockedReading) {
    // The real clue card, with submission closed off. Reusing ClueCard rather
    // than building a read-only twin means the clue, its artwork and its
    // terminal warning cannot drift between the two states.
    body = (
      <ClueCard
        clue={state.clue_statement}
        images={images}
        progress={progress}
        terminal={isTerminal}
        cue={isTerminal ? 'Cross into the void' : 'Decrypt Signal'}
        onSubmit={submitCode}
        onOpenImages={() => setImagesOpen(true)}
        loading={submitting}
        error={submitError}
        disabled
        disabledHint="Locked out. The timer above has to run down first."
        onDirtyChange={setInputDirty}
      />
    )
  } else if (stage === 'ready') {
    body = (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center py-16 gap-3">
        <h2 className="display-grunge text-[30px] text-text-primary">Standing by</h2>
        <p className="text-text-muted text-[14px] max-w-[260px]">
          The first beacon activates when the hunt begins. Keep this screen open.
        </p>
      </div>
    )
  } else if (stage === 'awaiting_code') {
    body = (
      <ClueCard
        clue={state.clue_statement}
        images={images}
        progress={progress}
        terminal={isTerminal}
        cue={isTerminal ? 'Cross into the void' : 'Decrypt Signal'}
        onSubmit={submitCode}
        onOpenImages={() => setImagesOpen(true)}
        loading={submitting}
        error={submitError}
        disabled={submitBlocked}
        disabledHint={disabledHint}
        onDirtyChange={setInputDirty}
      />
    )
  } else if (stage === 'awaiting_puzzle') {
    body = (
      <PuzzleCard
        question={state.question}
        images={state.question_images || []}
        progress={progress}
        onSubmit={submitAnswer}
        loading={submitting}
        error={submitError}
        disabled={inputsDisabled}
        disabledHint={disabledHint}
        onDirtyChange={setInputDirty}
      />
    )
  } else {
    body = (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center py-16 gap-3">
        <p className="text-text-muted text-[14px]">
          We could not read your current stage.
        </p>
        <button
          onClick={refetch}
          className="min-h-11 px-3 text-[14px] text-accent underline motion-press cursor-pointer
            focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          Refresh
        </button>
      </div>
    )
  }

  return (
    <Layout
      titleNode={<StopIndicator progress={progress} terminal={isTerminal} />}
      actions={
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="h-11 px-2 flex items-center gap-1.5 text-text-muted
            hover:text-text-primary motion-press cursor-pointer
            focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          <Map className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono text-[12px] tracking-[0.1em] uppercase">Map</span>
        </button>
      }
    >
      <div className="flex-1 flex flex-col">
        {statusItems.length > 0 && (
          <div className="px-4 pt-3">
            <StatusSlot items={statusItems} />
          </div>
        )}
        {body}
      </div>

      <JourneyMapSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        progress={progress}
      />
      <ImageSheet
        open={imagesOpen}
        onClose={() => setImagesOpen(false)}
        images={images}
      />
    </Layout>
  )
}
