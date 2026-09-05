import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/feedback/ErrorBoundary'
import { OfflineBanner } from './components/feedback/OfflineBanner'
import { GlobalLoader } from './components/feedback/GlobalLoader'
import { AppRoutes } from './routes'

/**
 * Composition root. Providers only.
 *
 * The route table lives in routes.jsx so this file stays a one-glance answer
 * to "what wraps the app, and in what order". The order matters: ErrorBoundary
 * is outermost so it still catches a throw from the router or a provider, and
 * OfflineBanner sits above the routes so it survives navigation instead of
 * remounting on every screen change.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <GlobalLoader />
          <OfflineBanner />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
