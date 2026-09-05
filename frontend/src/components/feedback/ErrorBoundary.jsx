import { Component } from 'react'

/**
 * A render crash used to leave a white screen everywhere except Dashboard, and
 * even there the fallback offered no way out. Both escape hatches matter: most
 * crashes are transient (a malformed payload that the next poll fixes), and
 * the ones that are not are usually a corrupt stored session.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[Odyssey] render error:', error, info?.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  hardReset = () => {
    try {
      localStorage.removeItem('odyssey_token')
      localStorage.removeItem('odyssey_user')
      localStorage.removeItem('hunterstellar_v2')
      localStorage.removeItem('hunterstellar_flow')
    } catch {
      /* ignore */
    }
    window.location.href = '/login'
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-8">
        <div className="flex flex-col items-center text-center gap-3 max-w-[320px]">
          <h1 className="font-display text-xl text-text-primary">Something went wrong</h1>
          <p className="text-sm text-text-muted">
            Your progress is saved on the network — nothing is lost.
          </p>
          <button
            onClick={this.reset}
            className="motion-press mt-2 h-[48px] w-full cursor-pointer rounded-md bg-accent font-display text-text-inverse"
          >
            Try again
          </button>
          <button
            onClick={this.hardReset}
            className="text-xs text-text-muted underline cursor-pointer"
          >
            Log out and start over
          </button>
        </div>
      </div>
    )
  }
}
