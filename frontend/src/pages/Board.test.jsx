import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Board from './Board'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))
vi.mock('../components/Charts', () => ({ Sparkline: () => null }))

const commodityBy = {
  rice: { id: 'rice', name: 'Rice', short: 'Rice', fil: 'Bigas', icon: '🌾', unit: 'kg', group: 'Grains', shelf: 30 },
  pork: { id: 'pork', name: 'Pork', short: 'Pork', fil: 'Baboy', icon: '🥩', unit: 'kg', group: 'Meat & Poultry', shelf: 3 },
}
const hz = (signal, change_pct, price) => ({ signal, change_pct, price, lo: price, hi: price, prob_up: 0.5 })
// Mixed view: rice has 14 and 30, pork has only 30. The basket covers 30 only.
const overview = {
  as_of: '2026-11-01',
  basket: { current: 200, spark: [], spark_forecast: [], 30: { price: 210, change_pct: 5 } },
  items: [
    { commodity: 'rice', price: 60, spark: [60], spark_forecast: [60], horizons: { 14: hz('surge', 4, 62), 30: hz('surge', 6, 64) } },
    { commodity: 'pork', price: 150, spark: [150], spark_forecast: [150], horizons: { 30: hz('dip', -4, 144) } },
  ],
}

describe('Board with a mixed horizon list', () => {
  it('renders at 14 without throwing and shows "—" where 14 is missing', () => {
    mocks.app = { province: 'ncr', prov: { name: 'NCR', market: 'Manila' }, horizon: 14, t: (k) => k, lang: 'en', commodityBy, nav: () => {}, dataVersion: 0, meta: { data: { sources: {} } } }
    mocks.api = { data: overview, error: null, loading: false, reload: () => {} }
    const html = renderToStaticMarkup(<Board />)
    expect(html).toContain('Rice')
    expect(html).toContain('Pork')
    expect(html).toContain('—')
  })
})
