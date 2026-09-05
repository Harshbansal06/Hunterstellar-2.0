/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

const TOKEN_KEY = 'odyssey_token'
const USER_KEY = 'odyssey_user'
// The old story-machine key. Cleared on logout so a stale copy can never
// resurrect a flow gate that no longer exists.
const LEGACY_FLOW_KEY = 'hunterstellar_flow'
const FLOW_KEY = 'hunterstellar_v2'

function readStored(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStored(USER_KEY))
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  })

  /**
   * This provider deliberately does NOT fetch /team/state.
   *
   * It used to, on every token change, while Dashboard fetched the same
   * endpoint independently -- two round trips per login, and because this
   * fetch replaced the `user` object, Dashboard's effect re-ran and churned
   * its poll interval and realtime channel. `useTeamState` is the single
   * owner now; an invalid token is caught by the 401 interceptor in
   * api/client.js.
   */

  const login = useCallback(async (teamName, password) => {
    const { data } = await api.post('/login', {
      team_name: teamName,
      password,
    })
    setToken(data.token)
    setUser(data.user)
    try {
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    } catch {
      /* private mode, and the session still works for this tab */
    }
    return data
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(FLOW_KEY)
      localStorage.removeItem(LEGACY_FLOW_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const updateUser = useCallback((next) => {
    if (!next) return
    setUser((prev) => {
      // Bail out when nothing changed, so consumers depending on `user`
      // identity do not re-run on every poll.
      if (
        prev &&
        prev.id === next.id &&
        prev.progress === next.progress &&
        prev.status === next.status
      ) {
        return prev
      }
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, token, loading: false, login, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
