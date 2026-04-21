import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// StrictMode removed: it causes effects to fire twice on mount in dev,
// which double-registers polling intervals and can push React past its
// maximum update depth (error #185). The trading bot has many concurrent
// polling intervals — StrictMode interactions are not worth the tradeoff.
// Production fix: route frontend /api calls to backend service  
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').trim()
  
if (API_ORIGIN) {
  const _fetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return _fetch(`${API_ORIGIN}${input}`, init)
    }
    return _fetch(input as any, init)
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
