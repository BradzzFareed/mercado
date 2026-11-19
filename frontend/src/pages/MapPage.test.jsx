import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MapPage from './MapPage'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))

const row = (province, name, price, lat, lon, horizons) => ({ province, name, region: 'r', market: 'm', price, lat, lon, engine: 'full', horizons })

describe('MapPage with a mixed horizon list', () => {
  it('renders at 14 without throwing and ranks only markets that have 14', () => {
    mocks.app = {
      meta: { commodities: [{ id: 'rice', name: 'Rice', short: 'Rice', icon: '🌾', unit: 'kg' }] },
      province: 'ncr', setProvince: () => {}, horizon: 14, t: (k) => k, dataVersion: 0, nav: () => {},
    }
    mocks.api = {
      data: {
        rows: [
          row('ncr', 'NCR', 60, 14.6, 121, { 14: { change_pct: 3, signal: 'surge', price: 62 }, 30: { change_pct: 4, signal: 'surge', price: 64 } }),
          row('cebu', 'Cebu', 150, 10.3, 123.9, { 30: { change_pct: -2, signal: 'dip', price: 147 } }),
        ],
      },
      error: null, loading: false, reload: () => {},
    }
    const html = renderToStaticMarkup(<MapPage />)
    expect(html).toContain('NCR')
    expect(html).toContain('Cebu')
  })
})
