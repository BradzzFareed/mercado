import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Detail from './Detail'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))
vi.mock('../components/Charts', () => ({
  ForecastChart: () => null, SeasonBars: () => null, MultiLine: () => null, DriverBars: () => null, Sparkline: () => null,
}))

const rice = { id: 'rice', name: 'Rice', short: 'Rice', icon: '🌾', unit: 'kg' }
const stats = { min_52w: 40, max_52w: 60, avg_52w: 50, percentile_52w: 50, volatility_pct: 2 }
const base = {
  province: 'ncr', commodity: 'rice', as_of: '2026-10-08', current: 50, stats,
  history: [{ date: '2026-10-01', price: 48 }, { date: '2026-10-08', price: 50 }],
  forecast: [], horizons: {}, horizons_available: [], best_buy: {}, drivers: null, seasonality: null, model_lab: null,
}
const labels = { ensemble: 'Ensemble', gbm: 'GBM', ridge: 'Ridge', holt_winters: 'Holt-Winters', naive: 'Naive' }
const realOnly = {
  ...base,
  forecast: [{ date: '2026-11-07', price: 55, lo: 52, hi: 58 }],
  horizons_available: [30],
  horizons: { 30: { price: 55, lo: 52, hi: 58, change_pct: 10, signal: 'surge', prob_up: 0.7 } },
  best_buy: { 30: { when: 'now', price: 50, saves_pct: 1.5 } },
  drivers: { total_pct: 10, seasonal_pct: 2, trend_pct: 3, momentum_pct: 5, weeks: 4 },
  seasonality: Array(12).fill(0),
  model_lab: {
    series: [], origins: 4, labels,
    metrics: { ensemble: { mape: 3, direction: 60 }, gbm: { mape: 4, direction: 55 }, ridge: { mape: 5, direction: null }, holt_winters: { mape: 6, direction: 50 }, naive: { mape: 7, direction: 50 } },
    weights: { gbm: 0.2, ridge: 0.2, holt_winters: 0.3, naive: 0.3 },
  },
}

function setup(data, horizon) {
  mocks.app = { province: 'ncr', prov: { name: 'NCR', market: 'Manila' }, horizon, t: (k) => k, commodityBy: { rice }, nav: () => {}, dataVersion: 0 }
  mocks.api = { data, error: null, loading: false, reload: () => {} }
}

describe('Detail with a missing horizon', () => {
  it('renders a history-only series (horizons {}) without a forecast', () => {
    setup(base, 14)
    const html = renderToStaticMarkup(<Detail id="rice" />)
    expect(html).toContain('detail.now')
    expect(html).not.toContain('detail.rise')
    expect(html).not.toContain('detail.best')
    expect(html).not.toContain('detail.lab')
  })

  it('renders a 30-day-only series when the selected horizon is 14', () => {
    setup(realOnly, 14)
    const html = renderToStaticMarkup(<Detail id="rice" />)
    expect(html).toContain('detail.in')
    expect(html).toContain('detail.lab')
    expect(html).not.toContain('detail.rise')
  })
})
