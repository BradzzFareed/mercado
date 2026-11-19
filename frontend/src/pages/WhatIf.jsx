import { useState, useMemo } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox } from '../components/Common'
import { SignalChip } from '../components/PriceTag'
import { peso, peso0, pct, classify, clamp } from '../util'

// Scenario assumptions: effect (% on price) = severity x typhoon sensitivity x 25% ; fuel % x fuel sensitivity x 0.4.
// Effects ramp in over ~2-3 weeks. These are expert-style assumptions layered on the ML forecast.
function scenarioPct(c, d, typhoon, fuel) {
  const ramp = (days, full) => clamp(days / full, 0, 1)
  return typhoon * 0.25 * c.typhoon * ramp(d, 14) + fuel * c.fuel * 0.4 * ramp(d, 21)
}

export default function WhatIf() {
  const { province, horizon, t, commodityBy, dataVersion } = useApp()
  const { data, error, loading, reload } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const [typhoon, setTyphoon] = useState(0)    // 0..1
  const [fuel, setFuel] = useState(0)          // percent, -20..60
  const rows = useMemo(() => {
    if (!data) return []
    return data.items.map((it) => {
      const c = commodityBy[it.commodity]
      const base = it.horizons[String(horizon)]
      if (!base) return { c, it, base: null, price: null, change: null, extra: null, signal: null }
      const extra = scenarioPct(c, horizon, typhoon, fuel)
      const price = base.price * (1 + extra / 100)
      const change = (price / it.price - 1) * 100
      return { c, it, base, price, change, extra, signal: classify(change) }
    })
  }, [data, commodityBy, horizon, typhoon, fuel])
  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !data) return <Training />

  const complete = rows.every((r) => r.base)
  const w = (id) => commodityBy[id].basket
  const baseBasket = complete ? rows.reduce((s, r) => s + w(r.c.id) * r.base.price, 0) : null
  const scenBasket = complete ? rows.reduce((s, r) => s + w(r.c.id) * r.price, 0) : null
  const delta = complete ? scenBasket - baseBasket : null
  const level = typhoon === 0 ? 0 : typhoon <= 0.34 ? 1 : typhoon <= 0.67 ? 2 : 3
  const max = Math.max(...rows.map((r) => Math.abs(r.change ?? 0)), 10)
  const ranked = [...rows].sort((a, b) => (a.change == null) - (b.change == null) || b.change - a.change)

  return (
    <div className={'whatif' + (typhoon > 0.05 ? ' storm' : '')} style={{ '--storm': typhoon }}>
      <div className="rain" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: (i * 37) % 100 + '%', animationDelay: (i % 7) * 0.23 + 's', animationDuration: 0.7 + (i % 5) * 0.12 + 's' }} />)}</div>
      <PageHead title={t('wi.title')} sub={t('wi.sub')}><HorizonToggle /></PageHead>
      <div className="wi-grid">
        <section className="panel controls-panel">
          <label className="slider">
            <span className="slider-top"><b>{t('wi.typhoon')}</b><em>{t('wi.t' + level)}</em></span>
            <input type="range" min="0" max="1" step="0.01" value={typhoon} onChange={(e) => setTyphoon(+e.target.value)} />
            <span className="slider-scale"><small>{t('wi.t0')}</small><small>{t('wi.t3')}</small></span>
          </label>
          <label className="slider">
            <span className="slider-top"><b>{t('wi.fuel')}</b><em>{fuel > 0 ? '+' : fuel < 0 ? '−' : ''}{Math.abs(fuel)}%</em></span>
            <input type="range" min="-20" max="60" step="1" value={fuel} onChange={(e) => setFuel(+e.target.value)} />
            <span className="slider-scale"><small>−20%</small><small>+60%</small></span>
          </label>
          <button className="btn ghost" onClick={() => { setTyphoon(0); setFuel(0) }}>{t('wi.reset')}</button>
          <div className="wi-basket">
            <span>{t('wi.basket')}</span>
            <b>{complete ? peso0(scenBasket) : '—'}</b>
            {complete && <SignalChip signal={classify((delta / baseBasket) * 100 * 2)}>{delta >= 0 ? '+' : '−'}{peso0(Math.abs(delta))} {t('wi.vs')}</SignalChip>}
          </div>
          <p className="muted small">{t('wi.note')}</p>
        </section>
        <section className="panel">
          <h2>{horizon}-day prices under this scenario</h2>
          <ul className="wi-list">
            {ranked.map((r) => (
              <li key={r.c.id}>
                <span className="wi-name"><span aria-hidden="true">{r.c.icon}</span> {r.c.short}</span>
                <span className="wi-bar" role="img" aria-label={`${r.c.short} ${r.change == null ? '—' : pct(r.change)}`}>
                  <i className="mid" />
                  {r.change != null && <i className={'fill ' + (r.change >= 0 ? 'up' : 'down')} style={{ width: Math.abs(r.change) / max * 50 + '%', left: r.change >= 0 ? '50%' : 50 - Math.abs(r.change) / max * 50 + '%' }} />}
                </span>
                <span className="wi-price">{r.price == null ? '—' : peso(r.price)}</span>
                {r.signal ? <SignalChip signal={r.signal}>{pct(r.change)}</SignalChip> : <span className="muted">—</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
