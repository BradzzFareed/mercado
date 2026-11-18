import { describe, it, expect } from 'vitest'
import { buildAlerts } from './alerts'

const t = (key, vars) => key + (vars?.alt ? `:${vars.alt}` : '')
const commodityBy = {
  rice: { id: 'rice', short: 'Rice', shelf: 30, group: 'Grains' },
  pork: { id: 'pork', short: 'Pork', shelf: 3, group: 'Meat & Poultry' },
  chicken: { id: 'chicken', short: 'Chicken', shelf: 3, group: 'Meat & Poultry' },
}
const hz = (signal, change_pct) => ({ signal, change_pct, price: 100 })

describe('buildAlerts with a missing horizon', () => {
  it('skips an item that has no entry for the selected horizon', () => {
    const items = [
      { commodity: 'rice', horizons: { 14: hz('surge', 5) } },
      { commodity: 'pork', horizons: { 30: hz('surge', 9) } },
    ]
    expect(buildAlerts(items, commodityBy, 14, t).map((a) => a.commodity)).toEqual(['rice'])
  })

  it('does not offer a swap whose alternative lacks the selected horizon', () => {
    const items = [
      { commodity: 'pork', horizons: { 14: hz('surge', 6) } },
      { commodity: 'chicken', horizons: { 30: hz('dip', -4) } },
    ]
    const [alert] = buildAlerts(items, commodityBy, 14, t)
    expect(alert.swap).toBeNull()
  })

  it('offers a swap when the alternative has the selected horizon', () => {
    const items = [
      { commodity: 'pork', horizons: { 14: hz('surge', 6) } },
      { commodity: 'chicken', horizons: { 14: hz('dip', -4) } },
    ]
    const [alert] = buildAlerts(items, commodityBy, 14, t)
    expect(alert.swap).toBe('chicken')
  })
})
