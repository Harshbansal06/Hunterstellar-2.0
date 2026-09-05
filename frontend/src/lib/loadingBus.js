/**
 * A count of in-flight foreground requests, and a way to watch it.
 *
 * Deliberately a module-level counter rather than context: the axios
 * interceptors in api/client.js are not inside the React tree, so they cannot
 * reach a provider, and threading a setter down to them would mean the data
 * layer importing from a component.
 *
 * FOREGROUND is the load-bearing word. `useTeamState` polls /team/state every
 * 30 seconds for the whole event; if that counted, the bar would blink at a
 * crew every half minute forever and mean nothing. Background requests opt out
 * with `{ background: true }` on the axios config, so what remains is work a
 * player actually started: signing in, submitting a code, submitting an
 * answer, an explicit retry.
 */

let pending = 0
const listeners = new Set()

function emit() {
  const busy = pending > 0
  for (const fn of listeners) fn(busy)
}

export function startLoading() {
  pending += 1
  emit()
}

export function stopLoading() {
  // Never below zero: a response interceptor can fire for a request that was
  // started before a hot reload swapped this module, and a negative floor
  // would leave the bar stuck on for the rest of the session.
  pending = Math.max(0, pending - 1)
  emit()
}

/** Returns an unsubscribe. Calls back immediately with the current state. */
export function subscribeLoading(fn) {
  listeners.add(fn)
  fn(pending > 0)
  return () => listeners.delete(fn)
}

/** Test and dev-tool escape hatch. Not used by the app. */
export function __resetLoading() {
  pending = 0
  emit()
}
