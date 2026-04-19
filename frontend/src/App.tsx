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
import StrategyDetail from './pages/StrategyDetail'
import OpenClaw from './pages/OpenClaw'
import IIAgent from './pages/IIAgent'
import AlertInbox from './pages/AlertInbox'
import PnLSummary from './pages/PnLSummary'
import HumanOverride from './pages/HumanOverride'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        gutter={8}
        containerStyle={{ bottom: 24, right: 20 }}
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
          <Route path="/"                element={<Dashboard />}      />
          <Route path="/mission-control" element={<MissionControl />} />
          <Route path="/override"        element={<HumanOverride />}  />
          <Route path="/fleet"           element={<AgentFleet />}     />
          <Route path="/risk"            element={<RiskConfig />}     />
          <Route path="/analytics"       element={<Analytics />}      />
          <Route path="/pnl"             element={<PnLSummary />}     />
          <Route path="/activity"        element={<ActivityLog />}    />
          <Route path="/trade-log"       element={<TradeLog />}       />
          <Route path="/market"          element={<MarketData />}     />
          <Route path="/strategy/:name"  element={<StrategyDetail />} />
          <Route path="/openclaw"        element={<OpenClaw />}       />
          <Route path="/ii-agent"        element={<IIAgent />}        />
          <Route path="/alerts"          element={<AlertInbox />}     />
          <Route path="/trades"          element={<Trades />}         />
          <Route path="/strategies"      element={<Strategies />}     />
          <Route path="/wallet"          element={<WalletPage />}     />
          <Route path="/settings"        element={<Settings />}       />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}