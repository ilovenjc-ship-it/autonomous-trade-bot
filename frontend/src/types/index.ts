export interface BotStatus {
  is_running: boolean
  status_message: string
  error_message?: string
  wallet_connected: boolean
  network_connected: boolean
  network: string
  netuid: number
  active_strategy: string
  trade_amount: number
  trade_interval: number
  max_daily_trades: number
  daily_trades: number
  total_trades: number
  successful_trades: number
  total_pnl: number
  wallet_balance: number
  coldkey_address?: string
  hotkey_address?: string
  last_trade_at?: string
  current_price?: number
  price_change_24h?: number
  indicators: Indicators
  simulation_mode: boolean
}

export interface Indicators {
  rsi_14?: number
  ema_9?: number
  ema_21?: number
  sma_50?: number
  macd?: number
  macd_signal?: number
  bb_upper?: number
  bb_lower?: number
  bb_mid?: number
}

export interface Trade {
  id: number
  trade_type: 'buy' | 'sell'
  status: 'pending' | 'executed' | 'failed' | 'cancelled'
  amount: number
  price_at_trade: number
  usd_value: number
  pnl: number
  pnl_pct: number
  strategy?: string
  signal_reason?: string
  tx_hash?: string
  created_at?: string
  executed_at?: string
  error_message?: string
}

export interface TradeStats {
  total_trades: number
  executed_trades: number
  failed_trades: number
  buy_trades: number
  sell_trades: number
  total_volume_usd: number
  total_pnl_usd: number
  win_rate: number
}

export interface PriceData {
  symbol: string
  price_usd?: number
  market_cap?: number
  volume_24h?: number
  price_change_24h?: number
  price_change_pct_24h?: number
  timestamp?: string
  indicators?: Indicators
}

export interface PricePoint {
  timestamp: number
  price: number
  volume?: number
}

export interface Strategy {
  id: number
  name: string
  display_name: string
  description?: string
  is_active: boolean
  is_enabled: boolean
  parameters: Record<string, unknown>
  total_trades: number
  win_rate: number
  total_pnl: number
}

export interface BotConfig {
  active_strategy: string
  trade_amount: number
  max_trade_amount: number
  min_trade_amount: number
  trade_interval: number
  max_daily_trades: number
  stop_loss_pct: number
  take_profit_pct: number
  wallet_name: string
  wallet_hotkey: string
  network: string
  netuid: number
}