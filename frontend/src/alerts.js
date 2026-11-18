import { pct } from './util'

const PROTEIN = ['Meat & Poultry', 'Fish']
const sameBasket = (a, b) => a === b || (PROTEIN.includes(a) && PROTEIN.includes(b))

// Turn forecasts into plain-language buying alerts.
export function buildAlerts(items, commodityBy, horizon, t) {
  const byId = Object.fromEntries(items.map((i) => [i.commodity, i]))
  const out = []
  for (const it of items) {
    const hz = it.horizons[String(horizon)]
    if (!hz || hz.signal === 'stable') continue
    const c = commodityBy[it.commodity]
    const stockable = c.shelf >= 7
    const vars = { item: c.short, pct: pct(Math.abs(hz.change_pct)).replace(/^[+−]/, ''), days: horizon, shelf: c.shelf, alt: '' }
    let key
    let swap = null
    if (hz.signal === 'surge') {
      if (stockable) key = 'alerts.surge.stock'
      else {
        key = 'alerts.surge.fresh'
        const alts = items
          .filter((o) => o.commodity !== it.commodity && sameBasket(commodityBy[o.commodity].group, c.group) && o.horizons[String(horizon)] && o.horizons[String(horizon)].signal !== 'surge')
          .sort((a, b) => a.horizons[String(horizon)].change_pct - b.horizons[String(horizon)].change_pct)
        if (alts[0]) {
          swap = alts[0].commodity
          vars.alt = t('alerts.alt', { alt: commodityBy[swap].short, pct: pct(byId[swap].horizons[String(horizon)].change_pct) })
        }
      }
    } else key = stockable ? 'alerts.dip.stock' : 'alerts.dip.fresh'
    out.push({ commodity: it.commodity, signal: hz.signal, text: t(key, vars), change: hz.change_pct, mag: Math.abs(hz.change_pct), swap })
  }
  return out.sort((a, b) => b.mag - a.mag)
}

// Shopping advice per item: returns { code, saving } where saving is pesos per week-of-purchase.
export function advise(c, hz) {
  if (hz.signal === 'surge') return { code: c.shelf >= 7 ? 'stock' : 'swap' }
  if (hz.signal === 'dip') return { code: 'wait' }
  return { code: 'asneeded' }
}
