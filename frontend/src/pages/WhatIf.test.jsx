import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WhatIf from './WhatIf'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))

const commodityBy = {
  rice: { id: 'rice', name: 'Rice', short: 'Rice', icon: '🌾', unit: 'kg', basket: 1, typhoon: 1, fuel: 1 },
  pork: { id: 'pork', name: 'Pork', short: 'Pork', icon: '🥩', unit: 'kg', basket: 1, typhoon: 1, fuel: 1 },
}
const hz = (signal, change_pct, price) => ({ signal, change_pct, price })
const overview = {
  as_of: '2026-11-01',
  basket: { current: 200 },
  items: [
    { commodity: 'rice', price: 60, horizons: { 14: hz('surge', 3, 62), 30: hz('surge', 6, 64) } },
    { commodity: 'pork', price: 150, horizons: { 30: hz('dip', -4, 144) } },
  ],
}

describe('WhatIf with a mixed horizon list', () => {
  it('renders at 14 without throwing; pork shows "—" and sorts last', () => {
    mocks.app = { province: 'ncr', horizon: 14, horizonChoices: [14, 30], setHorizon: () => {}, t: (k) => k, commodityBy, dataVersion: 0 }
    mocks.api = { data: overview, error: null, loading: false, reload: () => {} }
    const html = renderToStaticMarkup(<WhatIf />)
    expect(html).toContain('Rice')
    expect(html).toContain('Pork')
    expect(html.indexOf('Pork')).toBeGreaterThan(html.indexOf('Rice'))
    expect(html).toContain('—')
  })
})
