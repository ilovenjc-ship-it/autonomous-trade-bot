import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      'Unknown error'
    return Promise.reject(new Error(msg))
  },
)

export default api

// ── Bot ─────────────────────────────────────────────────────────────────────

export const botApi = {
  getStatus: () => api.get('/bot/status').then((r) => r.data),
  start:     () => api.post('/bot/start').then((r) => r.data),
  stop:      () => api.post('/bot/stop').then((r) => r.data),
  getConfig: () => api.get('/bot/config').then((r) => r.data),
  updateConfig: (data: Record<string, unknown>) =>
    api.put('/bot/config', data).then((r) => r.data),
  connectWallet: (data: Record<string, unknown>) =>
    api.post('/bot/wallet/connect', data).then((r) => r.data),
  disconnectWallet: () => api.post('/bot/wallet/disconnect').then((r) => r.data),
  getBalance: () => api.get('/bot/wallet/balance').then((r) => r.data),
  getNetworkInfo: () => api.get('/bot/network/info').then((r) => r.data),
}

// ── Trades ──────────────────────────────────────────────────────────────────

export const tradesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/trades', { params }).then((r) => r.data),
  getStats: () => api.get('/trades/stats').then((r) => r.data),
  manualTrade: (data: { action: string; amount: number; reason?: string }) =>
    api.post('/trades/manual', data).then((r) => r.data),
  get: (id: number) => api.get(`/trades/${id}`).then((r) => r.data),
}

// ── Price ───────────────────────────────────────────────────────────────────

export const priceApi = {
  getCurrent: () => api.get('/price/current').then((r) => r.data),
  getHistory: (days = 7) =>
    api.get('/price/history', { params: { days } }).then((r) => r.data),
  getIndicators: () => api.get('/price/indicators').then((r) => r.data),
}

// ── Strategies ──────────────────────────────────────────────────────────────

export const strategiesApi = {
  list: () => api.get('/strategies').then((r) => r.data),
  activate: (name: string) =>
    api.post(`/strategies/${name}/activate`).then((r) => r.data),
  update: (name: string, data: Record<string, unknown>) =>
    api.put(`/strategies/${name}`, data).then((r) => r.data),
  getSignal: (name: string) =>
    api.get(`/strategies/${name}/signal`).then((r) => r.data),
}