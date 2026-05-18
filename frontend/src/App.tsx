/**
 * App — top-level router.
 *
 * Session XXXVII (perf pass — code-splitting):
 *   • Dashboard remains eagerly imported (it's the landing route — splitting
 *     it adds a chunk-load flash on first paint with no benefit).
 *   • Every other page is wrapped in React.lazy().  Vite emits one chunk per
 *     dynamic import, which drops the initial bundle from ~1.2 MB to a thin
 *     shell + Dashboard slice.  Heavy pages (OpenClaw, Wallet, IIAgent,
 *     ActivityLog) download only when navigated to.
 *   • Suspense fallback uses a tasteful PageLoader (delayed 120ms so cached
 *     chunks don't flash).
 *   • Vendor splitting (react / recharts / lucide-react / etc.) is configured
 *     in vite.config.ts via manualChunks.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import PageLoader from './components/PageLoader'

// Eager — landing route, always rendered first.
import Dashboard from './pages/Dashboard'

// Lazy — every secondary page.  Each becomes its own chunk.
const Trades             = lazy(() => import('./pages/Trades'))
const Strategies         = lazy(() => import('./pages/Strategies'))
const WalletPage         = lazy(() => import('./pages/Wallet'))
const AgentFleet         = lazy(() => import('./pages/AgentFleet'))
const RiskConfig         = lazy(() => import('./pages/RiskConfig'))
const Analytics          = lazy(() => import('./pages/Analytics'))
const ActivityLog        = lazy(() => import('./pages/ActivityLog'))
const TradeLog           = lazy(() => import('./pages/TradeLog'))
const MarketData         = lazy(() => import('./pages/MarketData'))
const SubnetDetail       = lazy(() => import('./pages/SubnetDetail'))
const StrategyDetail     = lazy(() => import('./pages/StrategyDetail'))
const OpenClaw           = lazy(() => import('./pages/OpenClaw'))
const IIAgent            = lazy(() => import('./pages/IIAgent'))
const AlertInbox         = lazy(() => import('./pages/AlertInbox'))
const PnLSummary         = lazy(() => import('./pages/PnLSummary'))
const HumanOverride      = lazy(() => import('./pages/HumanOverride'))
const WalletTransactions = lazy(() => import('./pages/WalletTransactions'))
const Research           = lazy(() => import('./pages/Research'))
const Tools              = lazy(() => import('./pages/Tools'))
const SystemHealth       = lazy(() => import('./pages/SystemHealth'))
const AuditTrail         = lazy(() => import('./pages/AuditTrail'))

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        gutter={8}
        containerStyle={{ bottom: 56, right: 20 }}
        toastOptions={{
          duration: 2500,
          style: {
            background: '#152030',
            color: '#f1f5f9',
            border: '1px solid #243450',
            fontFamily: '"Space Grotesk", system-ui',
            fontSize: 13,
            maxWidth: 340,
          },
        }}
      />
      <Routes>
        <Route element={<Layout />}>
          {/* Eager landing route — no Suspense overhead */}
          <Route path="/" element={<Dashboard />} />

          {/* Lazy routes — wrapped in a single Suspense per route so the
              fallback is rendered inside the Layout shell (sidebar + topbar
              stay visible during chunk fetch). */}
          <Route path="/override"             element={<Suspense fallback={<PageLoader />}><HumanOverride /></Suspense>} />
          <Route path="/fleet"                element={<Suspense fallback={<PageLoader />}><AgentFleet /></Suspense>} />
          <Route path="/risk"                 element={<Suspense fallback={<PageLoader />}><RiskConfig /></Suspense>} />
          <Route path="/analytics"            element={<Suspense fallback={<PageLoader />}><Analytics /></Suspense>} />
          <Route path="/pnl"                  element={<Suspense fallback={<PageLoader />}><PnLSummary /></Suspense>} />
          <Route path="/activity"             element={<Suspense fallback={<PageLoader />}><ActivityLog /></Suspense>} />
          <Route path="/trade-log"            element={<Suspense fallback={<PageLoader />}><TradeLog /></Suspense>} />
          <Route path="/market"               element={<Suspense fallback={<PageLoader />}><MarketData /></Suspense>} />
          <Route path="/market/subnet/:uid"   element={<Suspense fallback={<PageLoader />}><SubnetDetail /></Suspense>} />
          <Route path="/research"             element={<Suspense fallback={<PageLoader />}><Research /></Suspense>} />
          {/* Session XXXV: /tools (Whale Tracker page) deleted — Mav: 'Give
              Whale Tracker its own Section, Not its own Page'. Briefly lived
              as a Dashboard tile, then retired in XXXIX (Day 6) — Whale Flow
              (live Finney RPC) is the canonical whale surface now. The
              /calculator route stays as the TAO Calculator. */}
          <Route path="/calculator"           element={<Suspense fallback={<PageLoader />}><Tools mode="calc" /></Suspense>} />
          <Route path="/system-health"        element={<Suspense fallback={<PageLoader />}><SystemHealth /></Suspense>} />
          <Route path="/audit"                element={<Suspense fallback={<PageLoader />}><AuditTrail /></Suspense>} />
          <Route path="/strategy/:name"       element={<Suspense fallback={<PageLoader />}><StrategyDetail /></Suspense>} />
          <Route path="/openclaw"             element={<Suspense fallback={<PageLoader />}><OpenClaw /></Suspense>} />
          <Route path="/ii-agent"             element={<Suspense fallback={<PageLoader />}><IIAgent /></Suspense>} />
          <Route path="/alerts"               element={<Suspense fallback={<PageLoader />}><AlertInbox /></Suspense>} />
          <Route path="/trades"               element={<Suspense fallback={<PageLoader />}><Trades /></Suspense>} />
          <Route path="/strategies"           element={<Suspense fallback={<PageLoader />}><Strategies /></Suspense>} />
          <Route path="/wallet"               element={<Suspense fallback={<PageLoader />}><WalletPage /></Suspense>} />
          <Route path="/wallet-transactions"  element={<Suspense fallback={<PageLoader />}><WalletTransactions /></Suspense>} />
          {/* Settings route removed — content absorbed into Manual Override + Trades + Wallet (Session XXVI) */}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}