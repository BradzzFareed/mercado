import { useMemo } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox, SampleBadge } from '../components/Common'
import { PriceTag, SignalChip } from '../components/PriceTag'
import { Sparkline } from '../components/Charts'
import { buildAlerts } from '../alerts'
import { peso0, pct, fmtDate } from '../util'

export default function Board() {
  const { province, prov, horizon, t, commodityBy, nav, dataVersion } = useApp()

  const { data, error, loading, reload } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const alerts = useMemo(() => (data ? buildAlerts(data.items, commodityBy, horizon, t) : []), [data, commodityBy, horizon, t])

  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !data) return <Training />

  const key = String(horizon)
  const surges = data.items.filter((i) => i.horizons[key].signal === 'surge')
  const dips = data.items.filter((i) => i.horizons[key].signal === 'dip')
  const bk = data.basket
  const bch = bk[key].change_pct
  const bsig = bch >= 2.5 ? 'surge' : bch <= -2.5 ? 'dip' : 'stable'
  const names = (arr) => arr.map((i) => commodityBy[i.commodity].short).join(', ')

  return (
    <div className="board-page-wrapper">
      <style>{`
        .board-page-wrapper .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem; }
        .board-page-wrapper .kpi {
          background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px; padding: 1.75rem; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease;
        }
        .board-page-wrapper .kpi:hover { transform: translateY(-5px) scale(1.02); box-shadow: 0 15px 30px rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.4); }

        .board-page-wrapper .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        
        .board-page-wrapper .board > * {
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease !important;
          will-change: transform;
        }
        .board-page-wrapper .board > *:hover {
          transform: translateY(-8px) scale(1.03) rotate(1deg) !important;
          box-shadow: 0 20px 40px rgba(16, 185, 129, 0.15) !important;
          z-index: 10;
        }

        .board-page-wrapper .panel {
          background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px; padding: 2rem; margin-top: 2.5rem;
        }
        .board-page-wrapper .asof { color: #64748b; font-size: 0.85rem; margin: 1.5rem 0; }
      `}</style>

      <PageHead title={t('board.title')} sub={t('board.sub', { place: `${prov.name} · ${prov.market}` })}>
        <SampleBadge />
        <HorizonToggle />
      </PageHead>

      <section className="kpis" aria-label="Summary">
        <div className="kpi kpi-basket">
          <div className="kpi-label">{t('board.basket')}</div>
          <div className="kpi-big">{peso0(bk.current)}</div>
          <div className="kpi-row">
            <SignalChip signal={bsig}>{pct(bch)} → {peso0(bk[key].price)}</SignalChip>
            <span className="muted">{t('board.basket.sub')}</span>
          </div>
          <Sparkline values={bk.spark} forecast={bk.spark_forecast} width={260} height={46} />
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('board.surges')}</div>
          <div className="kpi-num surge-ink">{surges.length}</div>
          <p className="kpi-note">{surges.length ? names(surges) : '—'}</p>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('board.dips')}</div>
          <div className="kpi-num dip-ink">{dips.length}</div>
          <p className="kpi-note">{dips.length ? names(dips) : '—'}</p>
        </div>
      </section>

      <section className="board" aria-label={t('board.title')}>
        {data.items.map((it, i) => (
          <PriceTag key={it.commodity} item={it} index={i} commodity={commodityBy[it.commodity]} horizon={horizon} onOpen={() => nav('commodity', it.commodity)} />
        ))}
      </section>

      <p className="asof">{t('board.asof', { date: fmtDate(data.as_of, { month: 'long', day: 'numeric', year: 'numeric' }) })}</p>

      <section className="panel">
        <h2>{t('alerts.title')}</h2>
        {alerts.length === 0 ? <p className="muted">{t('alerts.none')}</p> : (
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.commodity} className={'alert ' + a.signal}>
                <span className="alert-icon" aria-hidden="true">{commodityBy[a.commodity].icon}</span>
                <div>
                  <SignalChip signal={a.signal}>{t('sig.' + a.signal)} {pct(a.change)}</SignalChip>
                  <p>{a.text}</p>
                </div>
                <button className="btn ghost small" onClick={() => nav('commodity', a.commodity)}>{commodityBy[a.commodity].short}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
