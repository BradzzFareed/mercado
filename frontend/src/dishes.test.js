import { describe, it, expect } from 'vitest'
import { CATEGORIES, DISHES, INGREDIENTS, dishCart, stepQty, unitPrice } from './dishes'

describe('dishes', () => {
  it('has 19 dishes, each with an emoji icon and only known ingredients', () => {
    expect(DISHES).toHaveLength(19)
    for (const d of DISHES) {
      expect(d.icon.length).toBeGreaterThan(0)
      expect(CATEGORIES[d.cat]).toBeTruthy()
      for (const [id, q] of d.items) { expect(INGREDIENTS[id], `${d.id}:${id}`).toBeTruthy(); expect(q).toBeGreaterThan(0) }
    }
  })
  it('fills the cart from a dish', () => {
    const d = DISHES.find((x) => x.id === 'turon')
    expect(Object.keys(dishCart(d))).toEqual(['bananas-saba', 'sugar-brown', 'oil-cooking'])
  })
  it('prefers the live price and falls back to the estimate', () => {
    expect(unitPrice('pork', { pork: { price: 199 } })).toMatchObject({ price: 199, live: true })
    expect(unitPrice('ginger', {})).toMatchObject({ price: 150, live: false })
  })
  it('steps quantities without going below zero', () => {
    expect(stepQty('kg', 0.05, -1)).toBe(0)
    expect(stepQty('kg', 0.5, 1)).toBe(0.75)
    expect(stepQty('piece', 2, 1)).toBe(3)
  })
})
