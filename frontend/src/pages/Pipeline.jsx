import { useState } from 'react'
import { useApp, useApi } from '../state'
import { post } from '../api'
import { PageHead, ErrorBox } from '../components/Common'
import { IconPlay, IconRefresh } from '../components/Icons'
import { fmtDate } from '../util'

const STATE_LABEL = { implemented: 'Ready', scaffold: 'Scaffold' }

export default function Pipeline() {
  const { t, bumpData } = useApp()
  const { data, error, reload } = useApi('/api/v1/pipeline')
  const [busy, setBusy] = useState(null)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState(null)

  const run = async (mode) => {
    setBusy(mode); setErr(null)
    try {
      const r = await post('/api/v1/pipeline/run', { mode })
      setReport(r)
      bumpData(); reload()
    } catch (e) {
      setErr(e.message)
      // No HTTP response: the run may have completed server-side, so refresh defensively.
      if (e.cause && !e.cause.response) bumpData()
    } finally { setBusy(null) }
  }
  if (error) return <ErrorBox error={error} retry={reload} />
  if (!data) return <p className="muted">{t('common.loading')}</p>
  const ds = data.dataset
  const sched = data.scheduler
  return (
    <>
      <PageHead title={t('pipe.title')} sub={t('pipe.sub')} />
      <div className="pipe-flow" aria-label="Pipeline stages">
        {['Fetch', 'Clean & map', 'Store', 'Retrain', 'Forecast'].map((s, i) => (<span key={s} className="stage"><b>{s}</b>{i < 4 && <i aria-hidden="true" />}</span>))}
      </div>
      <div className="pipe-grid">
        <section className="panel">
          <h2>{t('pipe.dataset')}</h2>
          <dl className="facts">
            <div><dt>{ds.rows.toLocaleString()}</dt><dd>{t('pipe.rows')}</dd></div>
            <div><dt>{ds.provinces.length} × {ds.commodities.length}</dt><dd>markets × commodities</dd></div>
            <div><dt>{fmtDate(ds.end, { month: 'short', day: 'numeric', year: 'numeric' })}</dt><dd>latest week</dd></div>
          </dl>
          <p className="muted small">{t('pipe.span')}: {fmtDate(ds.start, { month: 'short', year: 'numeric' })} to {fmtDate(ds.end, { month: 'short', year: 'numeric' })}. {ds.sources && ds.sources.sample ? t('pipe.sample.note') : ''}</p>
          <div className="btn-row">
            <button className="btn" disabled={!!busy} onClick={() => run('live')}><IconRefresh size={16} />{busy === 'live' ? '…' : t('pipe.run')}</button>
            <button className="btn accent" disabled={!!busy} onClick={() => run('simulate')}><IconPlay size={16} />{busy === 'simulate' ? '…' : t('pipe.sim')}</button>
          </div>
          {err && <p className="error-text" role="alert">{err}</p>}
          {report && (
            <div className={'run-report ' + report.status}>
              <b>{report.status === 'ok' ? 'Updated' : report.status === 'no_update' ? 'No new data' : 'Error'}</b>
              <span>{report.message}</span>
              <pre>{report.log.join('\n')}</pre>
            </div>
          )}
          <p className="muted small">{t('pipe.sched')}: {sched.running ? `every ${sched.interval_hours} h` : 'off'}.
            {sched.next_run_epoch ? ` Next run ${new Date(sched.next_run_epoch * 1000).toLocaleString('en-PH')}.` : ''}</p>
        </section>

        <section className="panel">
          <h2>{t('pipe.sources')}</h2>
          <ul className="sources">
            {data.sources.map((s) => (
              <li key={s.id}>
                <div><b>{s.name}</b><span>{s.via}</span></div>
                <em className={'state ' + s.state}>{STATE_LABEL[s.state] || s.state}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel wide">
          <h2>{t('pipe.runs')}</h2>
          {data.runs.length === 0 ? <p className="muted">No runs yet.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>Mode</th><th>Source</th><th>Status</th><th className="num">New rows</th><th>Message</th></tr></thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.finished).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td>{r.mode}</td><td>{r.source}</td>
                      <td><span className={'state ' + r.status}>{r.status}</span></td>
                      <td className="num">{r.rows_added}</td><td className="msg">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
