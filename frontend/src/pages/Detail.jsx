import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox } from '../components/Common'
import { SignalChip } from '../components/PriceTag'
import { ForecastChart, SeasonBars, DriverBars } from '../components/Charts'
import { IconBack } from '../components/Icons'
import { peso, pct, fmtDate } from '../util'

export default function Detail({ id }) {
  const { province, prov, horizon, t, commodityBy, nav } = useApp()
  const c = commodityBy[id]
  const { data: d, error, loading, reload } = useApi(c ? `/api/v1/forecast?province=${province}&commodity=${id}` : null)
  const cmp = useApi(c ? `/api/v1/compare?province=${province}&commodity=${id}` : null)
  if (!c) return <ErrorBox error={`Unknown commodity "${id}"`} />
  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !d) return <Training />

  const key = String(horizon)
  const hz = d.horizons[key]
  const bb = d.best_buy[key]
  const unit = c.unit === 'dozen' ? t('common.perdz') : t('common.perkg')
  const month = new Date(d.as_of + 'T00:00:00').getMonth()
  const best = cmp.data && cmp.data.best_nearby

  return (
    <>
      <button className="back" onClick={() => nav('board')}><IconBack size={16} />{t('detail.back')}</button>
      <PageHead title={<><span className="title-icon" aria-hidden="true">{c.icon}</span>{c.name}</>} sub={`${prov.name} · ${prov.market}`}>
        <HorizonToggle />
      </PageHead>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel chart-panel">
            <div className="panel-top">
              <h2>{t('detail.chart')}</h2>
              <div className="legend" aria-hidden="true">
                <span><i className="lg lg-actual" />Recorded</span>
                <span><i className="lg lg-fc" />Forecast</span>
                <span><i className="lg lg-band" />{t('detail.range')}</span>
              </div>
            </div>
            <ForecastChart history={d.history} forecast={d.forecast} horizon={horizon} bestBuy={bb} label={c.name} />
            <div className="figures">
              <div className="fig"><span>{t('detail.now')}</span><b>{peso(d.current)}<small>{unit}</small></b></div>
              {[7, 14, 30].map((h) => {
                const x = d.horizons[String(h)]
                return (
                  <div key={h} className={'fig' + (h === horizon ? ' on' : '')}>
                    <span>{t('detail.in', { d: h })}</span>
                    <b>{peso(x.price)}</b>
                    <em className={'chg ' + x.signal}>{pct(x.change_pct)}</em>
                    <small>{peso(x.lo, 0)}–{peso(x.hi, 0)}</small>
                  </div>
                )
              })}
            </div>
          </section>
        <section className="panel">
          <h2>{t('detail.cal')}</h2>
          <p className="muted">{t('detail.cal.sub')}</p>
          <SeasonBars values={d.seasonality} currentMonth={month} />
        </section>
        </div>

        <aside className="side-col">
          <section className={'panel signal-panel ' + hz.signal}>
            <SignalChip signal={hz.signal} />
            <p className="signal-hint">{t('sig.' + hz.signal + '.hint')}</p>
            <div className="meter" aria-label={`${t('detail.rise')} ${Math.round(hz.prob_up * 100)}%`}>
              <div className="meter-top"><span>{t('detail.rise')}</span><b>{Math.round(hz.prob_up * 100)}%</b></div>
              <div className="meter-track"><i style={{ width: hz.prob_up * 100 + '%' }} /></div>
            </div>
            <p className="muted small">{t('detail.pctl', { p: Math.round(100 - d.stats.percentile_52w) })}</p>
          </section>

          <section className="panel">
            <h3>{t('detail.best')}</h3>
            <div className="best">
              <b>{bb.when === 'now' ? t('detail.best.now') : t('detail.best.later', { date: fmtDate(bb.when) })}</b>
              <span>{peso(bb.price)}{unit}</span>
            </div>
            <p className="muted small">{t('detail.best.save', { pct: bb.saves_pct.toFixed(1) + '%' })}</p>
          </section>

          <section className="panel">
            <h3>{t('detail.why')}</h3>
            <DriverBars items={[
              { label: t('detail.season'), value: d.drivers.seasonal_pct },
              { label: t('detail.trend'), value: d.drivers.trend_pct },
              { label: t('detail.momentum'), value: d.drivers.momentum_pct },
            ]} />
            <p className="muted small">Estimated split of the {d.drivers.weeks}-week move ({pct(d.drivers.total_pct)}).</p>
          </section>

          <section className="panel">
            <h3>{t('detail.near')}</h3>
            {cmp.loading ? <p className="muted">{t('common.loading')}</p> : best ? (
              <div className="near">
                <b>{best.name}</b>
                <span>{peso(best.price)} · {pct(best.diff_pct)} · {best.distance_km} km</span>
                <button className="btn ghost small" onClick={() => nav('map')}>{t('nav.map')}</button>
              </div>
            ) : <p className="muted">{t('detail.near.none')}</p>}
          </section>
        </aside>
      </div>
    </>
  )
}
