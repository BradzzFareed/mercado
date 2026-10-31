import { useEffect, useState } from 'react'
import { useApp } from '../state'

export function PageHead({ title, sub, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="page-head-side">{children}</div>}
    </header>
  )
}

export function HorizonToggle() {
  const { horizon, setHorizon, t, meta } = useApp()
  const hs = (meta && meta.horizons) || [7, 14, 30]
  return (
    <div className="seg" role="radiogroup" aria-label={t('hz.label')}>
      {hs.map((h) => (
        <button key={h} role="radio" aria-checked={horizon === h} className={horizon === h ? 'on' : ''} onClick={() => setHorizon(h)}>{t('hz.' + h)}</button>
      ))}
    </div>
  )
}

const STEPS = ['Holt-Winters seasonal model', 'Ridge regression on price momentum', 'Gradient-boosted trees', 'Back-testing on past weeks', 'Blending into one forecast']
export function Training({ place }) {
  const { t } = useApp()
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((x) => Math.min(x + 1, STEPS.length - 1)), 1100)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="training" role="status" aria-live="polite">
      <div className="training-orb" aria-hidden="true"><i /><i /><i /></div>
      <h2>{t('train.title', { place })}</h2>
      <ol>
        {STEPS.map((s, i) => (
          <li key={s} className={i < n ? 'done' : i === n ? 'now' : ''}><span aria-hidden="true">{i < n ? '✓' : i === n ? '…' : ''}</span>{s}</li>
        ))}
      </ol>
      <p>The first load of a market takes a few seconds. After that it is instant.</p>
    </div>
  )
}

export function ErrorBox({ error, retry }) {
  const { t } = useApp()
  return (
    <div className="errorbox" role="alert">
      <b>{t('common.error')}</b>
      <p>{error}</p>
      <p className="muted">Is the API running? Start it with <code>uv run uvicorn main:app --reload</code> in the backend folder.</p>
      {retry && <button className="btn" onClick={retry}>{t('common.retry')}</button>}
    </div>
  )
}

export function SampleBadge() {
  const { meta, t } = useApp()
  const src = meta && meta.data.sources
  if (!src || !src.sample) return null
  return <span className="badge" title={t('pipe.sample.note')}>{t('common.sample')}</span>
}
