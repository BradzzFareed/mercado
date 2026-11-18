import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Planner from './Planner'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))

const commodities = [
  { id: 'rice', name: 'Rice', short: 'Rice', icon: '🌾', unit: 'kg', shelf: 30, basket: 1 },
  { id: 'pork', name: 'Pork', short: 'Pork', icon: '🥩', unit: 'kg', shelf: 3, basket: 1 },
]
const overview = {
  as_of: '2026-11-01',
  basket: { current: 200 },
  items: [
    { commodity: 'rice', price: 60, horizons: { 14: { price: 62, change_pct: 3, signal: 'surge' }, 30: { price: 64, change_pct: 6, signal: 'surge' } } },
    { commodity: 'pork', price: 150, horizons: { 30: { price: 144, change_pct: -4, signal: 'dip' } } },
  ],
}

describe('Planner with a mixed horizon list', () => {
  it('renders at 14 without throwing; dishes and totals that need pork show "—"', () => {
    mocks.app = {
      province: 'ncr', prov: { name: 'NCR' }, horizon: 14, t: (k) => k, dataVersion: 0,
      meta: {
        commodities,
        dishes: [{ id: 'adobo', name: 'Adobo', price: 120, other: 10, items: [{ c: 'rice', amt: 0.2, label: 'Rice' }, { c: 'pork', amt: 0.3, label: 'Pork' }] }],
      },
    }
    mocks.api = { data: overview, error: null, loading: false, reload: () => {} }
    const html = renderToStaticMarkup(<Planner />)
    expect(html).toContain('Adobo')
    expect(html).toContain('—')
  })
})
