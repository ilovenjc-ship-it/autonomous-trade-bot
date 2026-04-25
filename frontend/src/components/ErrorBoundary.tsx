import { Component, type ReactNode } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Top-level error boundary.
 * Catches any React render error and shows a clean recovery UI
 * instead of the white screen / platform error page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] caught:', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ error: null })
    // Small delay so state clears before child re-mounts
    setTimeout(() => window.location.reload(), 50)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex items-center justify-center h-screen bg-dark-900 text-slate-100">
        <div className="max-w-md w-full mx-4 bg-dark-800 border border-red-500/30 rounded-2xl p-8 space-y-5">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-red-400 flex-shrink-0" />
            <h1 className="text-lg font-bold text-white">Something went wrong</h1>
          </div>

          <p className="text-sm text-slate-400 leading-relaxed">
            A rendering error occurred. The trading bot is still running — 
            this is a display issue only. Reload to recover.
          </p>

          <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
            <p className="text-[14px] font-mono text-red-400 break-all line-clamp-3">
              {this.state.error.message}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent-blue/15 border border-accent-blue/30 
                         text-accent-blue rounded-lg text-sm font-semibold hover:bg-accent-blue/25 
                         transition-colors flex-1 justify-center"
            >
              <RefreshCw size={14} /> Reload App
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2.5 border border-dark-500 text-slate-400 rounded-lg text-sm 
                         hover:text-white hover:border-dark-400 transition-colors"
            >
              Dismiss
            </button>
          </div>

          <p className="text-[13px] text-slate-600 font-mono text-center">
            The bot continues trading in the background regardless of UI errors.
          </p>
        </div>
      </div>
    )
  }
}