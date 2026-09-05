import axios from 'axios'
import { startLoading, stopLoading } from '../lib/loadingBus'

export const SESSION_NOTICE_KEY = 'odyssey_session_notice'

/**
 * Where the API lives.
 *
 * The fallback is RELATIVE on purpose. It used to be the absolute string
 * 'http://localhost:5173/api', which Vite baked verbatim into the production
 * bundle -- so every deployed player's browser tried to call a server on their
 * own laptop, over http, from an https page. Two failures at once: wrong host,
 * and blocked as mixed content.
 *
 * '/api' works in development through the Vite proxy (see vite.config.js) at
 * whatever port Vite happens to pick, and in production it resolves against
 * the page's own origin. When the API is on a different host -- as it is now,
 * on Railway -- VITE_API_URL must be set at BUILD time. It is inlined into the
 * bundle, not read at runtime, so changing it means rebuilding.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  // Feeds the global progress bar. `background: true` opts a request out, which
  // the 30s /team/state poll uses: a bar that blinks every half minute for the
  // whole event tells a crew nothing.
  if (!config.background) {
    config.__counted = true
    startLoading()
  }

  try {
    const token = localStorage.getItem('odyssey_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {
    /* storage unavailable, so send the request unauthenticated and let the
       server decide */
  }
  return config
})

/**
 * Paired with the counter above. Both arms decrement, and only when this
 * request incremented: a request rejected before it was sent never counted,
 * and decrementing for it would leave the bar permanently on.
 */
function settle(configLike) {
  if (configLike?.__counted) stopLoading()
}

api.interceptors.response.use(
  (res) => {
    settle(res.config)
    return res
  },
  (err) => {
    settle(err.config)
    const status = err.response?.status

    // 401 is the only status that ends a session. A 403 from the event gate
    // ("not started" / "has ended") is a normal game state, not an auth
    // failure -- logging someone out mid-hunt for standing at a station too
    // early would be indefensible.
    // A 401 from /login itself is a wrong password, not a dead session. There
    // is nothing to log out of, and writing "expired" here made the login
    // screen tell a crew their session expired when they had only mistyped.
    const isLoginRequest = /(^|\/)login$/.test(err.config?.url || '')

    if (status === 401 && !isLoginRequest) {
      try {
        localStorage.removeItem('odyssey_token')
        localStorage.removeItem('odyssey_user')
        // Tell the login screen why it is being shown, instead of bouncing
        // the player there with no explanation. Being evicted by a teammate's
        // login is a very different thing from a session timing out, and a
        // team that reads the wrong one will waste minutes chasing it.
        const replaced = err.response?.data?.reason === 'session_replaced'
        sessionStorage.setItem(SESSION_NOTICE_KEY, replaced ? 'replaced' : 'expired')
      } catch {
        /* ignore */
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    return Promise.reject(err)
  },
)

export default api
