import { useEffect, useState } from 'react'
import { useApp } from '../state'
import { get } from '../api'
import { PageHead, ErrorBox } from '../components/Common'

const STEPS = [
  ['Collect', 'Weekly retail prices by market, pulled from open sources on a schedule and cleaned of typos and outliers.'],
  ['Learn', 'Three different models study each price history: a seasonal model (Holt-Winters), a ridge regression on momentum, and gradient-boosted trees.'],
  ['Test', 'Every model is back-tested on recent weeks it never saw. Its average miss decides how much weight it earns.'],
  ['Blend', 'The ensemble is a weighted blend of the three, shown with an 80% range so you can see how sure it is.'],
]

export default function ModelLab() {
  const { meta, province, prov, horizon, t, dataVersion } = useApp()
  const [rows, setRows] = useState({})
  const [error, setError] = useState(null)
  const total = meta.commodities.length

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset rows when the province or data version changes
    setRows({}); setError(null)
    meta.commodities.forEach((c) => {
      get(`/api/v1/forecast?province=${province}&commodity=${c.id}`).then(
        (d) => alive && setRows((r) => ({ ...r, [c.id]: d.model_lab })),
        (e) => alive && setError(e.message),
      )
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province, dataVersion])

  const done = meta.commodities.filter((c) => rows[c.id])
  const miss = (id, m) => rows[id].metrics[m].mape
  const avg = (m) => (done.length ? done.reduce((s, c) => s + miss(c.id, m), 0) / done.length : 0)
  const beats = done.filter((c) => miss(c.id, 'ensemble') < miss(c.id, 'naive')).length
  const dirs = done.map((c) => rows[c.id].metrics.ensemble.direction).filter((x) => x != null)
  const dir = dirs.length ? dirs.reduce((a, b) => a + b, 0) / dirs.length : null
  const maxGain = Math.max(1, ...done.map((c) => 100 * (1 - miss(c.id, 'ensemble') / miss(c.id, 'naive'))))

  return (
    <>
      <PageHead title={t('nav.lab')} sub={t('lab.sub', { place: `${prov.name} · ${prov.market}` })} />
      {error && <ErrorBox error={error} />}

      <section className="kpis lab-kpis" aria-label="Accuracy summary">
        <div className="kpi kpi-basket">
          <div className="kpi-label">{t('lab.avg')}</div>
          <div className="kpi-big">{done.length ? avg('ensemble').toFixed(1) + '%' : '…'}</div>
          <div className="kpi-row"><span className="muted">{t('lab.vs', { n: done.length ? avg('naive').toFixed(1) + '%' : '…' })}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('lab.beats')}</div>
          <div className="kpi-num dip-ink">{done.length ? `${beats} / ${done.length}` : '…'}</div>
          <p className="kpi-note">{t('lab.beats.note')}</p>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('lab.dir.title')}</div>
          <div className="kpi-num">{dir == null ? '…' : Math.round(dir) + '%'}</div>
          <p className="kpi-note">{t('lab.dir.note')}</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-top">
          <div><h2>{t('lab.table')}</h2><p className="muted">{t('lab.table.sub')}</p></div>
          {done.length < total && <span className="badge" role="status">{t('lab.testing', { n: done.length, total })}</span>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('lab.item')}</th><th className="num">{t('lab.err')}</th><th className="num">{t('lab.naive')}</th><th>{t('lab.gain')}</th><th className="num">{t('lab.dir')}</th></tr>
            </thead>
            <tbody>
              {meta.commodities.map((c) => {
                const r = rows[c.id]
                if (!r) return <tr key={c.id}><td><span aria-hidden="true">{c.icon}</span> {c.short}</td><td className="num muted" colSpan={4}>…</td></tr>
                const gain = 100 * (1 - miss(c.id, 'ensemble') / miss(c.id, 'naive'))
                return (
                  <tr key={c.id}>
                    <td><span aria-hidden="true">{c.icon}</span> {c.short}</td>
                    <td className="num">{miss(c.id, 'ensemble').toFixed(1)}%</td>
                    <td className="num">{miss(c.id, 'naive').toFixed(1)}%</td>
                    <td>
                      <div className="gain" title={`${gain.toFixed(0)}%`}>
                        <i className={gain >= 0 ? 'good' : 'bad'} style={{ width: Math.max(2, (Math.abs(gain) / maxGain) * 100) + '%' }} />
                        <b>{gain >= 0 ? '−' : '+'}{Math.abs(gain).toFixed(0)}%</b>
                      </div>
                    </td>
                    <td className="num">{r.metrics.ensemble.direction == null ? '–' : Math.round(r.metrics.ensemble.direction) + '%'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">{t('lab.foot', { h: horizon })}</p>
      </section>

      <section className="panel">
        <h2>{t('lab.how')}</h2>
        <ol className="how">
          {STEPS.map(([h, p]) => (<li key={h}><b>{h}</b><p>{p}</p></li>))}
        </ol>
        <p className="muted small">{t('lab.sample')}</p>
      </section>
    </>
  )
}
