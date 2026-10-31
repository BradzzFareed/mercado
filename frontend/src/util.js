export const peso = (v, d = 2) =>
  '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d })
export const peso0 = (v) => peso(v, 0)
export const pct = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%'
export const fmtDate = (iso, opts) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', opts || { month: 'short', day: 'numeric' })
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export const SIGNALS = {
  surge: { arrow: '▲', cls: 'surge' },
  dip: { arrow: '▼', cls: 'dip' },
  stable: { arrow: '■', cls: 'stable' },
}

// Same thresholds as the backend, used by the What-If lab after adjusting a forecast.
export function classify(changePct) {
  if (changePct >= 2.5) return 'surge'
  if (changePct <= -2.5) return 'dip'
  return 'stable'
}

export function nearestProvince(provinces, lat, lon) {
  const rad = (x) => (x * Math.PI) / 180
  let best = null
  for (const p of provinces) {
    const a = Math.sin(rad(p.lat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(p.lat)) * Math.sin(rad(p.lon - lon) / 2) ** 2
    const d = 6371 * 2 * Math.asin(Math.sqrt(a))
    if (!best || d < best.d) best = { p, d }
  }
  return best
}

export function store(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : JSON.parse(v)
  } catch { return fallback }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

// Diverging map color: green (cheaper) <- grey -> red (pricier); capped at +-5% (most weekly moves are small).
export function changeColor(v) {
  const t = Math.max(-1, Math.min(1, v / 5))
  const g = [217, 223, 218], r = [217, 63, 46], d = [15, 143, 91]
  const to = t >= 0 ? r : d
  const k = Math.abs(t) ** 0.8
  return `rgb(${g.map((c, i) => Math.round(c + (to[i] - c) * k)).join(',')})`
}
