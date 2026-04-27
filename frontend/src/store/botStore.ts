import { create } from 'zustand'
import { botApi, tradesApi, priceApi, strategiesApi } from '@/api/client'
import type { BotStatus, Trade, TradeStats, PriceData, PricePoint, Strategy } from '@/types'

interface MissionStats {
  subnets: number
  events: number
  refresh: () => void
}

interface FleetStats {
  agents: number
  live: number
  approved: number
  paper: number
  rebalancing: boolean
  rebalance: () => void
}

interface AlertStats {
  unread: number
  priority: number
  markAllRead: () => void
}

interface AnalyticsStats {
  totalTrades: number
  activeStrategies: number
  timeRange: string
  handleTimeRange: (r: string) => void
}

interface TradesPageStats {
  total: number
  mode: string
  winRate: string
  refresh: () => void
}

interface TradeLogPageStats {
  total: number
  page: number
  pages: number
  realCount: number | null
  refresh: () => void
}

interface MarketPageStats {
  subnets: number
  upCount: number
  downCount: number
  autoRef: boolean
  toggleAutoRef: () => void
}

interface StrategiesPageStats {
  total: number
  live: number
  approved: number
  paper: number
  refresh: () => void
}

interface ActivityPageStats {
  filtered: number
  total: number
  isLive: boolean
  toggleLive: () => void
}

interface WalletPageStats {
  block: number | null
  isConnected: boolean
  querying: boolean
  queryChain: () => void
}

interface IIAgentPageStats {
  analyzing: boolean
  handleAnalyze: () => void
}

interface BotStore {
  // State
  status: BotStatus | null
  trades: Trade[]
  tradeStats: TradeStats | null
  tradeTotal: number
  price: PriceData | null
  priceHistory: PricePoint[]
  strategies: Strategy[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  missionStats: MissionStats | null
  fleetStats: FleetStats | null
  alertStats:        AlertStats | null
  analyticsStats:    AnalyticsStats | null
  tradesPageStats:   TradesPageStats | null
  tradeLogStats:     TradeLogPageStats | null
  marketPageStats:   MarketPageStats | null
  strategiesStats:   StrategiesPageStats | null
  activityPageStats: ActivityPageStats | null
  walletPageStats:   WalletPageStats | null
  iiAgentStats:      IIAgentPageStats | null

  // Actions
  setMissionStats:      (stats: MissionStats | null) => void
  setFleetStats:        (stats: FleetStats | null) => void
  setAlertStats:        (stats: AlertStats | null) => void
  setAnalyticsStats:    (stats: AnalyticsStats | null) => void
  setTradesPageStats:   (stats: TradesPageStats | null) => void
  setTradeLogStats:     (stats: TradeLogPageStats | null) => void
  setMarketPageStats:   (stats: MarketPageStats | null) => void
  setStrategiesStats:   (stats: StrategiesPageStats | null) => void
  setActivityPageStats: (stats: ActivityPageStats | null) => void
  setWalletPageStats:   (stats: WalletPageStats | null) => void
  setIIAgentStats:      (stats: IIAgentPageStats | null) => void
  fetchStatus: () => Promise<void>
  fetchTrades: (page?: number) => Promise<void>
  fetchTradeStats: () => Promise<void>
  fetchPrice: () => Promise<void>
  fetchPriceHistory: (days?: number) => Promise<void>
  fetchStrategies: () => Promise<void>
  startBot: () => Promise<{ success: boolean; message: string }>
  stopBot: () => Promise<{ success: boolean; message: string }>
  manualTrade: (action: string, amount: number, reason?: string) => Promise<{ success: boolean; message: string }>
  activateStrategy: (name: string) => Promise<void>
  refreshAll: () => Promise<void>
}

export const useBotStore = create<BotStore>((set, get) => ({
  status: null,
  trades: [],
  tradeStats: null,
  tradeTotal: 0,
  price: null,
  priceHistory: [],
  strategies: [],
  loading: false,
  error: null,
  lastUpdated: null,
  missionStats:      null,
  fleetStats:        null,
  alertStats:        null,
  analyticsStats:    null,
  tradesPageStats:   null,
  tradeLogStats:     null,
  marketPageStats:   null,
  strategiesStats:   null,
  activityPageStats: null,
  walletPageStats:   null,
  iiAgentStats:      null,

  setMissionStats:      (stats) => set({ missionStats: stats }),
  setFleetStats:        (stats) => set({ fleetStats: stats }),
  setAlertStats:        (stats) => set({ alertStats: stats }),
  setAnalyticsStats:    (stats) => set({ analyticsStats: stats }),
  setTradesPageStats:   (stats) => set({ tradesPageStats: stats }),
  setTradeLogStats:     (stats) => set({ tradeLogStats: stats }),
  setMarketPageStats:   (stats) => set({ marketPageStats: stats }),
  setStrategiesStats:   (stats) => set({ strategiesStats: stats }),
  setActivityPageStats: (stats) => set({ activityPageStats: stats }),
  setWalletPageStats:   (stats) => set({ walletPageStats: stats }),
  setIIAgentStats:      (stats) => set({ iiAgentStats: stats }),

  fetchStatus: async () => {
    try {
      const data = await botApi.getStatus()
      set({ status: data, lastUpdated: new Date() })
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch status' })
    }
  },

  fetchTrades: async (page = 1) => {
    try {
      const data = await tradesApi.list({ page, page_size: 20 })
      set({ trades: data.trades, tradeTotal: data.total })
    } catch (e: unknown) {
      console.error('fetchTrades error', e)
    }
  },

  fetchTradeStats: async () => {
    try {
      const data = await tradesApi.getStats()
      set({ tradeStats: data })
    } catch (e: unknown) {
      console.error('fetchTradeStats error', e)
    }
  },

  fetchPrice: async () => {
    try {
      const data = await priceApi.getCurrent()
      set({ price: data })
    } catch (e: unknown) {
      console.error('fetchPrice error', e)
    }
  },

  fetchPriceHistory: async (days = 7) => {
    try {
      const data = await priceApi.getHistory(days)
      set({ priceHistory: data.data || [] })
    } catch (e: unknown) {
      console.error('fetchPriceHistory error', e)
    }
  },

  fetchStrategies: async () => {
    try {
      const data = await strategiesApi.list()
      set({ strategies: data })
    } catch (e: unknown) {
      console.error('fetchStrategies error', e)
    }
  },

  startBot: async () => {
    try {
      const result = await botApi.start()
      await get().fetchStatus()
      return result
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start bot'
      return { success: false, message: msg }
    }
  },

  stopBot: async () => {
    try {
      const result = await botApi.stop()
      await get().fetchStatus()
      return result
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to stop bot'
      return { success: false, message: msg }
    }
  },

  manualTrade: async (action, amount, reason) => {
    try {
      const result = await tradesApi.manualTrade({ action, amount, reason })
      await get().fetchTrades()
      await get().fetchTradeStats()
      return result
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Trade failed'
      return { success: false, message: msg }
    }
  },

  activateStrategy: async (name) => {
    try {
      await strategiesApi.activate(name)
      await get().fetchStrategies()
      await get().fetchStatus()
    } catch (e: unknown) {
      console.error('activateStrategy error', e)
    }
  },

  refreshAll: async () => {
    set({ loading: true })
    await Promise.all([
      get().fetchStatus(),
      get().fetchTrades(),
      get().fetchTradeStats(),
      get().fetchPrice(),
      get().fetchStrategies(),
    ])
    set({ loading: false })
  },
}))