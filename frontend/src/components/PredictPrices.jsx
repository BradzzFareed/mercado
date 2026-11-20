import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../state'
import { pct, peso } from '../util'
import { basketTotals, factorScale, scenarioRows } from '../predictMath'

const UNITS = [
  ['day', 'predict.days', 'predict.day', 'DD'],
  ['month', 'predict.months', 'predict.month', 'MM'],
  ['year', 'predict.years', 'predict.year', 'YR'],
]

function toDate(parts) {
  const d = new Date(parts.year, parts.month - 1, parts.day)
  return Number.isNaN(d.getTime()) ? null : d
}

function rangeFrom(start, end, units) {
  // Use only the checked parts; unchecked parts keep the current calendar value
  // so a month-only range still resolves to a real date.
  const now = new Date()
  const pick = (parts) => ({
    day: units.day ? Number(parts.day) || now.getDate() : now.getDate(),
    month: units.month ? Number(parts.month) || now.getMonth() + 1 : now.getMonth() + 1,
    year: units.year ? Number(parts.year) || now.getFullYear() : now.getFullYear(),
  })
  const a = toDate(pick(start))
  const b = toDate(pick(end))
  if (!a || !b) return null
  return { start: a, end: b, days: Math.max(1, Math.round((b - a) / 86400000)) }
}

function horizonFor(days, available) {
  const wanted = days <= 10 ? 7 : days <= 21 ? 14 : 30
  if (!available?.length || available.includes(wanted)) return wanted
  return available.reduce((best, h) => (Math.abs(h - wanted) < Math.abs(best - wanted) ? h : best), available[0])
}

function PredictIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#2d6072" strokeLinecap="round">
        <circle cx="50" cy="50" r="43" strokeWidth="7" />
        <path d="M81 19 A43 43 0 0 1 93 50" strokeWidth="7" />
        <circle cx="50" cy="50" r="27" strokeWidth="7" strokeDasharray="128 42" />
        <circle cx="50" cy="50" r="13" strokeWidth="7" />
        <path d="M50 50 L84 16" strokeWidth="7" />
      </g>
      <circle cx="50" cy="50" r="9" fill="#f04444" />
      <circle cx="82" cy="72" r="8" fill="#f04444" />
    </svg>
  )
}

export default function PredictPrices({ items = [] }) {
  const { t, commodityBy, horizon } = useApp()
  const now = new Date()
  const [open, setOpen] = useState(false)
  const [disaster, setDisaster] = useState('')
  const [units, setUnits] = useState({ day: false, month: true, year: false })
  const [range, setRange] = useState(() => ({
    start: { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() },
    end: { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() },
  }))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const activeUnits = UNITS.filter(([key]) => units[key])
  const rangeWindow = useMemo(() => rangeFrom(range.start, range.end, units), [range, units])

  const computed = useMemo(() => {
    if (!rangeWindow || !items.length) return null
    const available = [...new Set([horizon, ...items.flatMap((i) => i.horizons_available || [])])].filter(Boolean)
    const h = horizonFor(rangeWindow.days, available)
    const rows = scenarioRows(items, {
      horizon: h,
      disaster,
      scale: factorScale(rangeWindow.days),
      lookup: (id) => commodityBy[id],
    })

    if (!rows.length) return null
    const totals = basketTotals(rows)
    const display = rows.map((row) => {
      const c = commodityBy[row.commodity]
      return {
        ...row,
        name: c?.short || row.commodity,
        icon: c?.icon || '🛒',
        unit: c?.unit === 'dozen' ? t('common.perdz') : t('common.perkg'),
      }
    })
    return { horizon: h, days: rangeWindow.days, rows: display, ...totals, disaster }
  }, [rangeWindow, items, horizon, disaster, commodityBy, t])

  // Choosing a disaster (or editing the range once one is chosen) re-runs the
  // scenario forecast; the result lands asynchronously so the UI can show a
  // short "recalculating" state.
  useEffect(() => {
    if (!disaster || !computed) return undefined
    const timer = setTimeout(() => {
      setResult(computed)
      setLoading(false)
    }, 380)
    return () => clearTimeout(timer)
  }, [disaster, computed])

  const run = useCallback(() => {
    if (!computed) return
    setLoading(true)
    const timer = setTimeout(() => {
      setResult(computed)
      setLoading(false)
    }, 380)
    return () => clearTimeout(timer)
  }, [computed])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const chooseDisaster = (value) => {
    setResult(null)
    setDisaster(value)
    setLoading(Boolean(value) && Boolean(computed))
  }

  const toggleUnit = (key) => {
    const stillHasUnit = UNITS.some(([k]) => (k === key ? !units[k] : units[k]))
    setResult(null)
    setLoading(Boolean(disaster && computed && stillHasUnit))
    setUnits((u) => ({ ...u, [key]: !u[key] }))
  }

  const setPart = (which, key, value) => {
    setResult(null)
    if (disaster && computed) setLoading(true)
    setRange((r) => ({ ...r, [which]: { ...r[which], [key]: value } }))
  }

  const fields = (which) => activeUnits.map(([key, , , short]) => (
    <label className="pp-field" key={`${which}-${key}`}>
      <span className="pp-field-label">{short}:</span>
      <input
        type="number"
        className="pp-input"
        value={range[which][key]}
        min={key === 'month' ? 1 : key === 'day' ? 1 : 2000}
        max={key === 'month' ? 12 : key === 'day' ? 31 : 2100}
        onChange={(e) => setPart(which, key, e.target.value)}
        aria-label={`${t(UNITS.find((u) => u[0] === key)[2])} ${t(which === 'start' ? 'predict.start' : 'predict.end')}`}
      />
    </label>
  ))

  const stamp = (d) => d ? d.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''

  return (
    <>
      <button
        type="button"
        className="predict-trigger"
        onClick={() => setOpen(true)}
        aria-label={t('predict.open')}
        title={t('predict.open')}
        aria-haspopup="dialog"
      >
        <PredictIcon />
      </button>

      {open && (
        <div className="pp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="pp-panel" role="dialog" aria-modal="true" aria-label={t('predict.title')}>
            <div className="pp-head">
              <h2>{t('predict.title')}</h2>
              <button type="button" className="pp-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="pp-controls">
              <label className="pp-disaster">
                <span className="pp-select-wrap">
                  <select value={disaster} onChange={(e) => chooseDisaster(e.target.value)} aria-label={t('predict.disasters')}>
                    <option value="">{t('predict.disasters')}</option>
                    <option value="storm">{t('predict.storm')}</option>
                    <option value="drought">{t('predict.drought')}</option>
                  </select>
                </span>
              </label>

              <div className="pp-units" role="group" aria-label="Range units">
                {UNITS.map(([key, label]) => (
                  <label className="pp-check" key={key}>
                    <input type="checkbox" checked={units[key]} onChange={() => toggleUnit(key)} />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </div>
            </div>

            {activeUnits.length === 0 ? (
              <p className="pp-hint">{t('predict.pick')}</p>
            ) : activeUnits.length === 1 ? (
              <div className="pp-single-row">
                <span className="pp-row-caption">{t('predict.start')}</span>
                {fields('start')}
                <span className="pp-arrow" aria-hidden="true">→</span>
                <span className="pp-row-caption">{t('predict.end')}</span>
                {fields('end')}
              </div>
            ) : (
              <div className="pp-range">
                <span className="pp-range-label">{t('predict.start')}</span>
                <div className="pp-range-row">{fields('start')}</div>
                <span className="pp-down" aria-hidden="true">↓</span>
                <div className="pp-range-row">{fields('end')}</div>
                <span className="pp-range-label">{t('predict.end')}</span>
              </div>
            )}

            {rangeWindow && (
              <p className="pp-window">{stamp(rangeWindow.start)} — {stamp(rangeWindow.end)} · {rangeWindow.days} {t('predict.days').toLowerCase()}</p>
            )}

            <div className="pp-result-wrap" aria-live="polite">
              {loading && <p className="pp-loading">{t('predict.loading')}</p>}
              {!loading && result && (
                <div className="pp-result">
                  <div className="pp-basket">
                    <div>
                      <span className="pp-result-label">{t('predict.basket')}</span>
                      <strong>{peso(result.scenSum)}</strong>
                      <small>{t('predict.now')} {peso(result.currentSum)} · {pct(result.changePct)}</small>
                    </div>
                    {result.disaster && (
                      <span className={`pp-scenario-tag ${result.disaster}`}>
                        {t('predict.after', { disaster: t('predict.' + result.disaster) })}
                      </span>
                    )}
                  </div>

                  <div className="pp-items">
                    <span className="pp-result-label">{t('predict.items')} · {result.horizon}d</span>
                    <ul>
                      {result.rows.map((row) => (
                        <li key={row.commodity}>
                          <span className="pp-item-icon" aria-hidden="true">{row.icon}</span>
                          <span className="pp-item-name">{row.name}<small>{row.unit}</small></span>
                          <span className="pp-item-base">{peso(row.base)}</span>
                          <span className="pp-item-arrow" aria-hidden="true">→</span>
                          <span className="pp-item-now">{peso(row.scen)}</span>
                          <span className={`pp-item-pct ${row.scenChange >= 0 ? 'up' : 'down'}`}>{pct(row.scenChange)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {!loading && !result && rangeWindow && (
                <p className="pp-hint">{t('predict.baseline')} · {rangeWindow.days}d</p>
              )}
            </div>

            <div className="pp-foot">
              <button type="button" className="pp-forecast" onClick={run} disabled={!activeUnits.length || !computed || loading}>
                {t('predict.forecast')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export { PredictIcon }
