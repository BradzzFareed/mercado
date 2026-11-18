import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HorizonToggle } from './Common'

const app = vi.hoisted(() => ({ value: null }))
vi.mock('../state', () => ({ useApp: () => app.value }))

const t = (k) => k

describe('HorizonToggle', () => {
  it('offers only the horizons the view has (real series: 30 only)', () => {
    app.value = { horizon: 30, setHorizon: () => {}, t, horizonChoices: [30] }
    const html = renderToStaticMarkup(<HorizonToggle />)
    expect(html).toContain('hz.30')
    expect(html).not.toContain('hz.7')
    expect(html).not.toContain('hz.14')
  })

  it('renders nothing when the view has no forecast horizons', () => {
    app.value = { horizon: 14, setHorizon: () => {}, t, horizonChoices: [] }
    expect(renderToStaticMarkup(<HorizonToggle />)).toBe('')
  })
})
