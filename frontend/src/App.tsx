import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Strategies from './pages/Strategies'
import WalletPage from './pages/Wallet'
import Settings from './pages/Settings'
import MissionControl from './pages/MissionControl'
import AgentFleet from './pages/AgentFleet'
import RiskConfig from './pages/RiskConfig'
import Analytics from './pages/Analytics'
import ActivityLog from './pages/ActivityLog'
import TradeLog from './pages/TradeLog'
import MarketData from './pages/MarketData'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0d1424',
            color: '#e2e8f0',
            border: '1px solid #1a2540',
            fontFamily: '"Space Grotesk", system-ui',
            fontSize: 13,
          },
        }}
      />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/"                element={<Dashboard />}      />
          <Route path="/mission-control" element={<MissionControl />} />
          <Route path="/fleet"           element={<AgentFleet />}     />
          <Route path="/risk"            element={<RiskConfig />}     />
          <Route path="/analytics"       element={<Analytics />}      />
          <Route path="/activity"        element={<ActivityLog />}    />
          <Route path="/trade-log"       element={<TradeLog />}       />
          <Route path="/market"          element={<MarketData />}     />
          <Route path="/trades"          element={<Trades />}         />
          <Route path="/strategies"      element={<Strategies />}     />
          <Route path="/wallet"          element={<WalletPage />}     />
          <Route path="/settings"        element={<Settings />}       />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}