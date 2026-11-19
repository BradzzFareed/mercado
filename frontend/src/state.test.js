import { describe, it, expect } from 'vitest'
import { availableHorizons, resolveHorizon } from './state'

const meta = (commodities) => ({ commodities })
const c = (id, horizons) => ({ id, horizons })

describe('availableHorizons', () => {
  it('is null until meta loads', () => {
    expect(availableHorizons(null, null)).toBeNull()
  })

  it('keeps only the horizons every forecastable commodity has', () => {
    expect(availableHorizons(meta([c('rice', [7, 14, 30]), c('pork', [30])]), null)).toEqual([30])
  })

  it('ignores history-only commodities, which have no horizons', () => {
    expect(availableHorizons(meta([c('rice', []), c('pork', [7, 14, 30])]), null)).toEqual([7, 14, 30])
  })

  it('uses the own list on a commodity page', () => {
    const m = meta([c('rice', [7, 14, 30]), c('pork', [30])])
    expect(availableHorizons(m, 'rice')).toEqual([7, 14, 30])
    expect(availableHorizons(m, 'pork')).toEqual([30])
  })

  it('is empty for a history-only commodity page', () => {
    expect(availableHorizons(meta([c('rice', [])]), 'rice')).toEqual([])
  })
})

describe('resolveHorizon', () => {
  it('keeps the preference when the view offers it', () => {
    expect(resolveHorizon(14, [7, 14, 30])).toBe(14)
  })

  it('falls back to the first offered horizon (real series: 30)', () => {
    expect(resolveHorizon(14, [30])).toBe(30)
  })

  it('keeps the preference when nothing is known yet', () => {
    expect(resolveHorizon(14, null)).toBe(14)
    expect(resolveHorizon(14, [])).toBe(14)
  })
})
