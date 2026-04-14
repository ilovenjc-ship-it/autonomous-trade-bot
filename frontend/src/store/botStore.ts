import { create } from 'zustand'
import { botApi, tradesApi, priceApi, strategiesApi } from '@/api/client'
import type { BotStatus, Trade, TradeStats, PriceData, PricePoint, Strategy } from '@/types'

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

  // Actions
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