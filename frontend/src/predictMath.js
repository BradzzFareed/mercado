// Pure scenario math for the Predict Prices panel. No React or DOM imports.

// How strongly each food group reacts to a disaster. These are scenario
// multipliers applied on top of the model's forecast; a storm disrupts fresh
// produce and fish, while a drought bites hardest into grains and vegetables.
export const IMPACT = {
  storm: {
    Grains: 4, 'Roots & Tubers': 5, 'Vegetables & Fruit': 12, 'Meat & Poultry': 3,
    Fish: 6, Seafood: 6, 'Pulses & Nuts': 3, 'Oils & Fats': 2, 'Sugar & Sweeteners': 2,
  },
  drought: {
    Grains: 9, 'Roots & Tubers': 7, 'Vegetables & Fruit': 10, 'Meat & Poultry': 5,
    Fish: 4, Seafood: 2, 'Pulses & Nuts': 6, 'Oils & Fats': 3, 'Sugar & Sweeteners': 4,
  },
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function impactFor(disaster, group) {
  if (!disaster) return 0
  return (IMPACT[disaster] && IMPACT[disaster][group]) || 0
}

// Scales the 30-day impact to the requested window: full strength at 30+ days,
// never below a quarter.
export function factorScale(days) {
  return clamp(days / 30, 0.25, 1)
}

// Horizons that at least one item offers, ascending. Empty when none do.
export function offeredHorizons(items) {
  const offered = new Set()
  for (const item of items) {
    for (const h of item.horizons_available || []) offered.add(Number(h))
  }
  return [...offered].filter(Number.isFinite).sort((a, b) => a - b)
}

// Maps the window to 7/14/30 and snaps to the nearest offered horizon. `preferred`
// only breaks an exact distance tie. With no offered horizons the canonical value is returned.
export function horizonFor(days, available, preferred = null) {
  const wanted = days <= 10 ? 7 : days <= 21 ? 14 : 30
  if (!available?.length || available.includes(wanted)) return wanted
  let best = available[0]
  for (const h of available) {
    const d = Math.abs(h - wanted)
    const bd = Math.abs(best - wanted)
    if (d < bd || (d === bd && h === preferred)) best = h
  }
  return best
}

export function scenarioPrice(basePrice, impact, scale) {
  return basePrice * (1 + impact * scale / 100)
}

// One row per item that offers the chosen horizon. Items without that horizon
// are dropped, so they are excluded from both basket sums.
export function scenarioRows(items, { horizon, disaster, scale, lookup }) {
  return items.map((item) => {
    const hz = item.horizons[String(horizon)]
    if (!hz) return null
    const c = lookup(item.commodity)
    const impact = impactFor(disaster, c?.group)
    const scen = scenarioPrice(hz.price, impact, scale)
    return {
      commodity: item.commodity,
      weight: c?.basket || 1,
      price: item.price,
      base: hz.price,
      scen,
      change: hz.change_pct,
      scenChange: (scen / item.price - 1) * 100,
    }
  }).filter(Boolean)
}

// "Now" = sum of w*price over rows that have the chosen horizon, so it equals
// basket.current only when every series offers that horizon.
export function basketTotals(rows) {
  const currentSum = rows.reduce((s, r) => s + r.weight * r.price, 0)
  const scenSum = rows.reduce((s, r) => s + r.weight * r.scen, 0)
  const changePct = currentSum ? (scenSum / currentSum - 1) * 100 : 0
  return { currentSum, scenSum, changePct }
}
