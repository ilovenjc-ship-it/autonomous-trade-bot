import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// StrictMode removed: it causes effects to fire twice on mount in dev,
// which double-registers polling intervals and can push React past its
// maximum update depth (error #185). The trading bot has many concurrent
// polling intervals — StrictMode interactions are not worth the tradeoff.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)