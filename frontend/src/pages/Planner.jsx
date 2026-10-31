import { useMemo, useState, useEffect } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox } from '../components/Common'
import { advise } from '../alerts'
import { peso, peso0, pct, store, save } from '../util'

const DEFAULT_QTY = { rice: 25, pork: 6, chicken: 8, eggs: 3, bangus: 5, tomato: 4, onion: 3, calamansi: 1, cabbage: 4, eggplant: 4 }

function usePersisted(key, init) {
  const [v, setV] = useState(() => store(key, init))
  useEffect(() => save(key, v), [key, v])
  return [v, setV]
}

export default function Planner() {
  const { province, prov, horizon, t, meta, dataVersion } = useApp()
  const { data, error, loading, reload } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const [sell, setSell] = usePersisted('mercado.sell', {})
  const [qty, setQty] = usePersisted('mercado.qty', DEFAULT_QTY)
  const [target, setTarget] = usePersisted('mercado.target', 40)
  const [servings, setServings] = usePersisted('mercado.servings', 60)

  const byC = useMemo(() => (data ? Object.fromEntries(data.items.map((i) => [i.commodity, i])) : {}), [data])
  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !data) return <Training place={prov ? prov.name : ''} />
  const key = String(horizon)

  const dishes = meta.dishes.map((d) => {
    const cost = (when) => d.other + d.items.reduce((s, it) => s + it.amt * (when === 'now' ? byC[it.c].price : byC[it.c].horizons[key].price), 0)
    const now = cost('now'), then = cost('then')
    const price = sell[d.id] ?? d.price
    const margin = (p, c) => ((p - c) / p) * 100
    return { ...d, now, then, price, mNow: margin(price, now), mThen: margin(price, then), hold: then / (1 - target / 100) }
  })
  const dailyNow = dishes.reduce((s, d) => s + d.now, 0) / dishes.length * servings
  const dailyThen = dishes.reduce((s, d) => s + d.then, 0) / dishes.length * servings

  const shop = meta.commodities.map((c) => {
    const it = byC[c.id], hz = it.horizons[key]
    const q = qty[c.id] ?? 0
    const adv = advise(c, hz)
    const now = q * it.price, then = q * hz.price
    // one purchase cycle: stock-up covers up to 2 weeks of stock; waiting avoids paying the higher price once
    let saving = 0
    if (adv.code === 'stock') saving = q * Math.min(2, c.shelf / 7) * (hz.price - it.price)
    if (adv.code === 'wait') saving = q * (it.price - hz.price)
    return { c, it, hz, q, adv, now, then, saving: Math.max(0, saving) }
  })
  const totalSave = shop.reduce((s, r) => s + r.saving, 0)
  const totNow = shop.reduce((s, r) => s + r.now, 0), totThen = shop.reduce((s, r) => s + r.then, 0)

  return (
    <>
      <PageHead title={t('plan.title')} sub={t('plan.sub', { place: prov.name })}><HorizonToggle /></PageHead>

      <section className="panel">
        <div className="panel-top">
          <div><h2>{t('plan.menu')}</h2><p className="muted">{t('plan.menu.sub', { days: horizon })}</p></div>
          <div className="controls">
            <label className="field inline"><span>{t('plan.target')}</span><input type="number" min="5" max="80" value={target} onChange={(e) => setTarget(+e.target.value || 0)} /><em>%</em></label>
            <label className="field inline"><span>Servings/day</span><input type="number" min="10" max="1000" value={servings} onChange={(e) => setServings(+e.target.value || 0)} /></label>
          </div>
        </div>
        <div className="dishes">
          {dishes.map((d) => {
            const risk = d.mThen < target
            return (
              <article key={d.id} className={'dish' + (risk ? ' risk' : '')}>
                <header><h3>{d.name}</h3><span className={'chip ' + (risk ? 'surge' : 'dip')}>{risk ? '▲ ' + t('plan.risk') : '✓ ' + t('plan.ok')}</span></header>
                <p className="dish-items">{d.items.map((i) => i.label).join(' · ')}</p>
                <div className="dish-nums">
                  <div><span>{t('plan.cost')} now</span><b>{peso(d.now)}</b></div>
                  <div><span>In {horizon}d</span><b>{peso(d.then)}</b><em className={'chg ' + (d.then > d.now ? 'surge' : 'dip')}>{pct((d.then / d.now - 1) * 100)}</em></div>
                </div>
                <label className="field inline"><span>{t('plan.sell')} ₱</span>
                  <input type="number" min="1" value={d.price} onChange={(e) => setSell({ ...sell, [d.id]: +e.target.value || 0 })} />
                </label>
                <div className="margin-bar" aria-label={`Margin ${d.mThen.toFixed(0)} percent`}>
                  <i style={{ width: Math.max(0, Math.min(100, d.mThen)) + '%' }} className={risk ? 'risk' : ''} />
                  <u style={{ left: target + '%' }} title={t('plan.target')} />
                </div>
                <p className="muted small">{t('plan.margin')}: {d.mNow.toFixed(0)}% now → <b>{d.mThen.toFixed(0)}%</b> in {horizon}d.
                  {risk && <> {t('plan.hold', { m: target })}: <b>{peso0(Math.ceil(d.hold))}</b></>}</p>
              </article>
            )
          })}
        </div>
        <p className="muted small">Daily ingredient cost at {servings} servings a day: <b>{peso0(dailyNow)}</b> now, <b>{peso0(dailyThen)}</b> in {horizon} days ({pct((dailyThen / dailyNow - 1) * 100)}).</p>
      </section>

      <section className="panel">
        <h2>{t('plan.shop')}</h2>
        <p className="muted">{t('plan.shop.sub')}</p>
        <div className="table-wrap">
          <table className="table shop">
            <thead><tr><th>{t('plan.item')}</th><th className="num">{t('plan.qty')}</th><th className="num">{t('plan.week.now')}</th><th className="num">{t('plan.week.then', { days: horizon })}</th><th>{t('plan.advice')}</th></tr></thead>
            <tbody>
              {shop.map((r) => (
                <tr key={r.c.id}>
                  <td><span aria-hidden="true">{r.c.icon}</span> {r.c.short}</td>
                  <td className="num"><input className="qty" type="number" min="0" step="0.5" value={r.q} aria-label={`${r.c.short} per week`}
                    onChange={(e) => setQty({ ...qty, [r.c.id]: +e.target.value || 0 })} /> <small>{r.c.unit === 'dozen' ? 'dz' : 'kg'}</small></td>
                  <td className="num">{peso0(r.now)}</td>
                  <td className="num">{peso0(r.then)} <em className={'chg ' + r.hz.signal}>{pct(r.hz.change_pct)}</em></td>
                  <td><span className={'advice ' + r.adv.code}>{t('adv.' + r.adv.code)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td /><td className="num">{peso0(totNow)}</td><td className="num">{peso0(totThen)}</td><td /></tr></tfoot>
          </table>
        </div>
        <div className="savings">
          <span>{t('plan.save')}</span>
          <b>{peso0(totalSave)}</b>
          <small>per purchase cycle, estimated from the {horizon}-day forecast</small>
        </div>
      </section>
    </>
  )
}
