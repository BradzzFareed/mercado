import { describe, it, expect } from 'vitest'
import { IMPACT, basketTotals, factorScale, impactFor, scenarioRows } from './predictMath'

const VEG = 'Vegetables & Fruit'
const meta = {
  veg: { group: VEG, basket: 1 },
  grain: { group: 'Grains', basket: 3 },
}
const lookup = (id) => meta[id]
const item = (commodity, price, horizons) => ({
  commodity,
  price,
  horizons: Object.fromEntries(Object.entries(horizons).map(([h, p]) => [h, { price: p, change_pct: 0 }])),
})

describe('no disaster', () => {
  it('adds no disaster impact: scenario equals the forecast', () => {
    const rows = scenarioRows(
      [item('veg', 100, { 30: 120 }), item('grain', 50, { 30: 60 })],
      { horizon: 30, disaster: '', scale: 1, lookup },
    )
    expect(impactFor('', VEG)).toBe(0)
    for (const r of rows) expect(r.scen).toBe(r.base)
    const totals = basketTotals(rows)
    expect(totals.scenSum).toBe(120 * 1 + 60 * 3)
  })

  it('gives 0% change when the forecast equals the current price', () => {
    const rows = scenarioRows(
      [item('veg', 100, { 30: 100 }), item('grain', 50, { 30: 50 })],
      { horizon: 30, disaster: '', scale: 1, lookup },
    )
    expect(basketTotals(rows).changePct).toBe(0)
  })
})

describe('storm on Vegetables & Fruit', () => {
  it('applies the IMPACT constant at factorScale 1', () => {
    const impact = IMPACT.storm[VEG]
    const rows = scenarioRows([item('veg', 100, { 30: 100 })], { horizon: 30, disaster: 'storm', scale: 1, lookup })
    expect(rows[0].scenChange).toBeCloseTo(impact)
    expect(rows[0].scen).toBeCloseTo(100 * (1 + impact / 100))
  })
})

describe('factorScale', () => {
  it('clamps to 0.25 for days <= 7', () => {
    expect(factorScale(1)).toBe(0.25)
    expect(factorScale(7)).toBe(0.25)
  })

  it('clamps to 1 for days >= 30', () => {
    expect(factorScale(30)).toBe(1)
    expect(factorScale(45)).toBe(1)
  })
})

describe('basketTotals', () => {
  it('weights rows by basket weight', () => {
    // Current: 1*100 + 3*200 = 700. Predicted: 1*110 + 3*180 = 650. 650/700 - 1 = -7.142857%
    const totals = basketTotals([
      { weight: 1, price: 100, scen: 110 },
      { weight: 3, price: 200, scen: 180 },
    ])
    expect(totals.currentSum).toBe(700)
    expect(totals.scenSum).toBe(650)
    expect(totals.changePct).toBeCloseTo(-7.142857, 5)
  })
})

describe('rows missing the chosen horizon', () => {
  it('are excluded from both sums', () => {
    const rows = scenarioRows(
      [item('veg', 100, { 30: 100 }), item('grain', 50, { 14: 60 })],
      { horizon: 30, disaster: 'storm', scale: 1, lookup },
    )
    expect(rows).toHaveLength(1)
    const totals = basketTotals(rows)
    expect(totals.currentSum).toBe(100)
    expect(totals.scenSum).toBeCloseTo(100 * (1 + IMPACT.storm[VEG] / 100))
  })
})
