import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Planner from './Planner'

const mocks = vi.hoisted(() => ({ app: null, api: null }))
vi.mock('../state', () => ({ useApp: () => mocks.app, useApi: () => mocks.api }))
vi.mock('../components/Common', () => ({
  PageHead: ({ title, children }) => <header>{title}{children}</header>,
  HorizonToggle: () => null, Training: () => <p>loading</p>, ErrorBox: () => <p>error</p>,
}))

const overview = {
  as_of: '2026-11-01',
  basket: { current: 200 },
  items: [
    { commodity: 'rice', price: 60, horizons: { 14: { price: 62, change_pct: 3, signal: 'surge' } } },
    { commodity: 'pork', price: 150, horizons: { 14: { price: 144, change_pct: -4, signal: 'dip' } } },
  ],
}

describe('Planner grocery cart', () => {
  it('shows the swipeable menu, an empty cart and the summary before a dish is chosen', () => {
    mocks.app = { province: 'ncr', prov: { name: 'NCR' }, horizon: 14, t: (k) => k, dataVersion: 0 }
    mocks.api = { data: overview, error: null, loading: false, reload: () => {} }
    const html = renderToStaticMarkup(<Planner />)
    expect(html).toContain('Choose your menu')
    expect(html).toContain('Adobong Baboy / Manok')
    expect(html).toContain('Camote Cue')
    expect(html).toContain('Summary of ingredients')
    expect(html).toContain('No menu chosen yet')
    expect(html).toContain('Add ingredient')
  })
})
