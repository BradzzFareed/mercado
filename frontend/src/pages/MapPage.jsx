import { useState } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, ErrorBox } from '../components/Common'
import PhilippinesMap from '../components/PhilippinesMap'
import { changeColor } from '../util'
import { peso, pct } from '../util'

export default function MapPage() {
  const { meta, province, setProvince, horizon, t, nav } = useApp()
  const [cid, setCid] = useState('rice')
  const { data, error, loading, reload } = useApi(`/api/v1/map?commodity=${cid}`)
  const c = meta.commodities.find((x) => x.id === cid)
  const key = String(horizon)
  const rows = (data && data.rows) || []
  const cheapest = [...rows].sort((a, b) => a.price - b.price).slice(0, 5)
  const risers = [...rows].sort((a, b) => b.horizons[key].change_pct - a.horizons[key].change_pct).slice(0, 5)
  const fastCount = rows.filter((r) => r.engine === 'quick').length

  return (
    <>
      <PageHead title={t('map.title')} sub={t('map.sub', { item: c.short, days: horizon })}>
        <HorizonToggle />
      </PageHead>
      <div className="chips" role="radiogroup" aria-label="Commodity">
        {meta.commodities.map((x) => (
          <button key={x.id} role="radio" aria-checked={x.id === cid} className={'pill' + (x.id === cid ? ' on' : '')} onClick={() => setCid(x.id)}>
            <span aria-hidden="true">{x.icon}</span>{x.short}
          </button>
        ))}
      </div>
      {error && <ErrorBox error={error} retry={reload} />}
      <div className="map-grid">
        <section className="panel map-panel">
          {loading && !rows.length ? <p className="muted">{t('common.loading')}</p> : (
            <PhilippinesMap rows={rows} horizon={horizon} selected={province} onSelect={setProvince} />
          )}
          <p className="muted small">Stylised map. Tap a market to make it your location. {fastCount > 0 && `${fastCount} markets use the fast model until their full ensemble is trained.`}</p>
        </section>
        <aside className="side-col">
          <section className="panel">
            <h3>{t('map.cheapest')}</h3>
            <ol className="rank">
              {cheapest.map((r) => (
                <li key={r.province}><button onClick={() => setProvince(r.province)}><span>{r.name}</span><b>{peso(r.price)}</b></button></li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h3>{t('map.surging')}</h3>
            <ol className="rank">
              {risers.map((r) => (
                <li key={r.province}>
                  <button onClick={() => setProvince(r.province)}>
                    <span><i className="swatch" style={{ background: changeColor(r.horizons[key].change_pct) }} />{r.name}</span>
                    <b>{pct(r.horizons[key].change_pct)}</b>
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <button className="btn" onClick={() => nav('commodity', cid)}>{c.short}: full forecast</button>
        </aside>
      </div>
    </>
  )
}
