import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MapPage from './MapPage'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))

const row = (province, name, price, lat, lon, horizons) => ({ province, name, region: 'r', market: 'm', price, lat, lon, engine: 'full', unit: 'kg', horizons })

const meta = {
  commodities: [
    { id: 'rice', name: 'Rice', short: 'Rice', icon: '🌾', unit: 'kg', group: 'Grains' },
    { id: 'pork', name: 'Pork', short: 'Pork', icon: '🥩', unit: 'kg', group: 'Meat & Poultry' },
  ],
}

const baseApp = {
  meta,
  province: 'ncr',
  setProvince: () => {},
  setHorizon: () => {},
  t: (k) => k,
  lang: 'en',
  nav: () => {},
  dataVersion: 0,
}

const rowsData = {
  rows: [
    row('ncr', 'NCR', 60, 14.6, 121, { 14: { change_pct: 3, signal: 'surge', price: 62 }, 30: { change_pct: 4, signal: 'surge', price: 64 } }),
    row('cebu', 'Cebu', 150, 10.3, 123.9, { 30: { change_pct: -2, signal: 'dip', price: 147 } }),
  ],
}

describe('MapPage Market Locator (fixed 30-day horizon)', () => {
  it('renders the 30-day view with available markets and ranks by lowest price by default', () => {
    mocks.app = baseApp
    mocks.api = { data: rowsData, error: null, loading: false, reload: () => {} }
    const html = renderToStaticMarkup(<MapPage />)

    // Page title and fixed horizon
    expect(html).toContain('Market Locator')
    expect(html).toContain('30-day forecast')
    expect(html).not.toContain('14-day')

    // Markets from the API render on the map / rankings
    expect(html).toContain('NCR')
    expect(html).toContain('Cebu')

    // Selected market (NCR) shows the 30-day forecast, not 14
    expect(html).toContain('in 30 days')
    expect(html).toContain('+4.00%')

    // Ranking tabs render; "lowest" is the default
    expect(html).toContain('Lowest prices')
    expect(html).toContain('Biggest rises')
    const rankList = html.slice(html.indexOf('aria-label="Lowest prices"'))
    expect(rankList.indexOf('NCR')).toBeGreaterThanOrEqual(0)
    expect(rankList.indexOf('Cebu')).toBeGreaterThan(rankList.indexOf('NCR'))
    expect(html).toContain('₱60.00')
    expect(html).toContain('₱150.00')
  })

  it('shows a loading state while market data is loading', () => {
    mocks.app = baseApp
    mocks.api = { data: null, error: null, loading: true, reload: () => {} }
    const html = renderToStaticMarkup(<MapPage />)
    expect(html).toContain('common.loading')
    expect(html).not.toContain('No market data is available')
  })

  it('shows an empty state when no market data is available', () => {
    mocks.app = baseApp
    mocks.api = { data: { rows: [] }, error: null, loading: false, reload: () => {} }
    const html = renderToStaticMarkup(<MapPage />)
    expect(html).toContain('No market data is available for this commodity.')
    expect(html).not.toContain('Market map')
  })
})
