/**
 * Motion tokens, mirrored from src/App.css.
 *
 * Anime.js takes numbers and its own easing strings, CSS takes ms strings and
 * cubic-bezier(). Rather than let the two drift, both read from this shelf and
 * the CSS custom properties are the source of truth for the values.
 *
 * If you change a number here, change it in App.css too. `assertTokensInSync`
 * below will tell you in the console if they ever diverge in the browser.
 *
 * Naming is by job, not by number. A component that sets its own timing is off
 * the design system, not extending it.
 */

// --- durations (ms) -------------------------------------------------------

/**
 * Under 100ms the eye has not landed, so motion here can only acknowledge
 * input. It cannot narrate. Button press, input focus, checkbox.
 */
export const DURATION_INSTANT = 120

/**
 * Where the product's tempo is legible and where most components live. Sheets,
 * disclosure, toasts, the status slot.
 */
export const DURATION_BASE = 220

/**
 * Reserved for moments a player sees once or twice in the entire event. Past
 * 300ms a motion is a wait, so anything using this must be interruptible.
 */
export const DURATION_EXPRESSIVE = 640

/**
 * Per-item offset for a staggered arrival. Below 30ms the items read as one
 * group; above 80ms the last one feels late. Total sequence must stay under
 * 500ms, which caps a staggered list at roughly ten items.
 */
export const STAGGER_STEP = 50

// --- easings -------------------------------------------------------------

/** Arrival. Starts fast, decelerates. */
export const EASE_ENTER = 'cubic-bezier(0.2, 0, 0, 1)'

/** Departure. Accelerates, ends fast. */
export const EASE_EXIT = 'cubic-bezier(0.4, 0, 1, 1)'

/** Both ends eased. The default for anything that is not strictly enter/exit. */
export const EASE_STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * The same three curves as control points, for Anime.js.
 *
 * v4 removed the string form: passing `ease: 'cubicBezier(0.2, 0, 0, 1)'`
 * logs a deprecation and silently falls back to the default easing, so the
 * animation still plays and the curve is quietly wrong. The caller must import
 * `cubicBezier` from animejs and pass the returned function:
 *
 *   import { cubicBezier } from 'animejs'
 *   import { BEZIER_ENTER } from '../../lib/motion'
 *   const easeEnter = cubicBezier(...BEZIER_ENTER)
 *
 * Kept as arrays rather than pre-built functions so this module stays free of
 * an animejs import: most of the app reads only the CSS-side tokens above.
 */
export const BEZIER_ENTER = [0.2, 0, 0, 1]
export const BEZIER_EXIT = [0.4, 0, 1, 1]
export const BEZIER_STANDARD = [0.4, 0, 0.2, 1]

// --- reduced motion ------------------------------------------------------

/**
 * Read at call time, not at module load: a player can flip the OS setting
 * mid-session and the next animation should respect it.
 *
 * The three Anime.js sites check this and render their end state directly
 * instead of animating toward it.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Collapses a duration to a single frame under reduced motion, so callers do
 * not each need their own branch.
 */
export function duration(ms) {
  return prefersReducedMotion() ? 1 : ms
}

// --- drift guard ---------------------------------------------------------

/**
 * Compares the numbers above against the CSS custom properties actually in the
 * document. Dev-only, and a warning rather than a throw: a token mismatch is a
 * consistency bug worth surfacing, not a reason to white-screen a team standing
 * at a station mid-hunt.
 */
export function assertTokensInSync() {
  if (typeof window === 'undefined' || !import.meta.env?.DEV) return

  const css = getComputedStyle(document.documentElement)
  const pairs = [
    ['--duration-instant', DURATION_INSTANT],
    ['--duration-base', DURATION_BASE],
    ['--duration-expressive', DURATION_EXPRESSIVE],
    ['--stagger-step', STAGGER_STEP],
  ]

  // Reduced motion legitimately rewrites all four to 1ms, so skip the check
  // rather than report a false mismatch.
  if (prefersReducedMotion()) return

  for (const [prop, expected] of pairs) {
    const raw = css.getPropertyValue(prop).trim()
    if (!raw) continue
    const actual = Number.parseFloat(raw)
    if (Number.isFinite(actual) && actual !== expected) {
      console.warn(
        `[motion] ${prop} is ${raw} in CSS but ${expected}ms in lib/motion.js. ` +
          'These are mirrored by hand; update both.',
      )
    }
  }
}
