import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'

/**
 * The route table, extracted from App so App does nothing but compose
 * providers. Route guards, code splitting and the URL map all live here.
 *
 * Landing and Login are imported eagerly: they are the first paint for an
 * unauthenticated visitor, so lazy-loading them would add a spinner to the
 * very screen that has nothing to wait for. Everything behind the login is
 * split, which keeps the admin console out of a player's download entirely.
 */

const Journey = lazy(() => import('./pages/Journey'))
const Fragments = lazy(() => import('./pages/Fragments'))
const Prologue = lazy(() => import('./pages/Prologue'))
const Finished = lazy(() => import('./pages/Finished'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const Admin = lazy(() => import('./pages/Admin'))
const NotFound = lazy(() => import('./pages/NotFound'))

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function GuestRoute({ children }) {
  const { token } = useAuth()
  if (token) return <Navigate to="/journey" replace />
  return children
}

/**
 * Shown while a split chunk is in flight. Deliberately quiet: it appears for a
 * few hundred milliseconds on a tab change, so anything more expressive would
 * read as a stutter rather than as feedback.
 *
 * Colours come from the tokens, not from `white/20`, so this matches the app
 * instead of being the one surface that ignores the palette.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[100dvh] items-center justify-center bg-bg"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/"
          element={
            <GuestRoute>
              <Landing />
            </GuestRoute>
          }
        />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />

        <Route
          path="/journey"
          element={
            <ProtectedRoute>
              <Journey />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fragments"
          element={
            <ProtectedRoute>
              <Fragments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prologue"
          element={
            <ProtectedRoute>
              <Prologue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finished"
          element={
            <ProtectedRoute>
              <Finished />
            </ProtectedRoute>
          }
        />

        {/* Public on purpose: spectators and marshals check standings without
            a crew login, and there is nothing on it worth gating. */}
        <Route path="/leaderboard" element={<Leaderboard />} />

        {/* The real gate is the x-admin-secret check on every admin route.
            This only keeps the console out of a player's hands by accident,
            and the chunk is split so players never download it. */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />

        {/*
          Legacy paths. `/dashboard` and `/planet` were the original names and
          may be sitting in a bookmark, a QR code or a printed sheet, so they
          redirect rather than 404. The canonical names now match what the app
          calls these screens everywhere else, which is what stopped the code
          from having a Dashboard that renders a Journey and a Planet that
          renders Fragments.
        */}
        <Route path="/dashboard" element={<Navigate to="/journey" replace />} />
        <Route path="/planet" element={<Navigate to="/fragments" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default AppRoutes
