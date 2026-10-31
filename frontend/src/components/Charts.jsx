import { useEffect, useMemo, useRef, useState } from 'react'
import { peso, fmtDate, addDays } from '../util'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function niceTicks(min, max, n = 4) {
  const span = max - min || 1
  const raw = span / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10
  const start = Math.ceil(min / step) * step
  const out = []
  for (let v = start; v <= max + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}
const day = (iso) => Math.round(new Date(iso + 'T00:00:00').getTime() / 864e5)

/* ------------------------------------------------------------------ forecast chart */
export function ForecastChart({ history, forecast, horizon, bestBuy, weeks = 52, height = 340, label = 'Price' }) {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState(null)
  const m = { t: 16, r: 18, b: 30, l: 52 }
  const w = W, h = height
  const hist = history.slice(-weeks)
  const last = hist[hist.length - 1]

  const { x, y, yt, xt, pts } = useMemo(() => {
    const all = [
      ...hist.map((d) => ({ date: d.date, v: d.price, kind: 'actual' })),
      ...forecast.map((d) => ({ date: d.date, v: d.price, lo: d.lo, hi: d.hi, kind: 'forecast' })),
    ]
    const d0 = day(all[0].date), d1 = day(all[all.length - 1].date)
    const vals = [...hist.map((d) => d.price), ...forecast.flatMap((d) => [d.lo, d.hi])]
    let lo = Math.min(...vals), hi = Math.max(...vals)
    const pad = (hi - lo) * 0.08 || 1
    lo -= pad; hi += pad
    const x = (iso) => m.l + ((day(iso) - d0) / (d1 - d0)) * (w - m.l - m.r)
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (h - m.t - m.b)
    const yt = niceTicks(lo, hi, 4)
    // x ticks: first of month roughly every 2-3 months
    const xt = []
    const start = new Date(all[0].date + 'T00:00:00'), end = new Date(all[all.length - 1].date + 'T00:00:00')
    const step = weeks > 60 ? 4 : 2
    for (let d = new Date(start.getFullYear(), start.getMonth() + 1, 1); d <= end; d.setMonth(d.getMonth() + step)) {
      xt.push(d.toISOString().slice(0, 10))
    }
    return { x, y, yt, xt, pts: all }
  }, [hist, forecast, w, h, weeks])

  const line = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + x(p.date).toFixed(1) + ',' + y(p.v).toFixed(1)).join('')
  const histPts = pts.filter((p) => p.kind === 'actual')
  const fcPts = [{ date: last.date, v: last.price, lo: last.price, hi: last.price }, ...pts.filter((p) => p.kind === 'forecast')]
  const band =
    fcPts.map((p, i) => (i ? 'L' : 'M') + x(p.date).toFixed(1) + ',' + y(p.hi).toFixed(1)).join('') +
    [...fcPts].reverse().map((p) => 'L' + x(p.date).toFixed(1) + ',' + y(p.lo).toFixed(1)).join('') + 'Z'
  const hx = x(addDays(last.date, horizon))
  const bb = bestBuy && bestBuy.when !== 'now' ? fcPts.find((p) => p.date === bestBuy.when) : null

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    let best = null
    for (const p of pts) {
      const d = Math.abs(x(p.date) - px)
      if (!best || d < best.d) best = { p, d }
    }
    setHover(best.p)
  }

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={w} height={h} role="img" aria-label={`${label} history and forecast`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{peso(v, v < 100 ? 0 : 0)}</text>
          </g>
        ))}
        {xt.map((d) => (
          <text key={d} x={x(d)} y={h - 8} textAnchor="middle" className="axis">
            {fmtDate(d, { month: 'short', year: weeks > 60 ? '2-digit' : undefined })}
          </text>
        ))}
        <rect x={x(last.date)} y={m.t} width={w - m.r - x(last.date)} height={h - m.t - m.b} className="fc-zone" />
        <line x1={hx} x2={hx} y1={m.t} y2={h - m.b} className="hz-line" />
        <text x={hx} y={m.t + 10} textAnchor="middle" className="hz-label">{horizon}d</text>
        <path d={band} className="band" />
        <path d={line(histPts)} className="line-actual" />
        <path d={line(fcPts)} className="line-fc" />
        <circle cx={x(last.date)} cy={y(last.price)} r="4.5" className="dot-now" />
        {bb && <circle cx={x(bb.date)} cy={y(bb.v)} r="7" className="dot-best" />}
        {hover && (
          <g pointerEvents="none">
            <line x1={x(hover.date)} x2={x(hover.date)} y1={m.t} y2={h - m.b} className="cross" />
            <circle cx={x(hover.date)} cy={y(hover.v)} r="5" className={hover.kind === 'actual' ? 'dot-hover' : 'dot-hover fc'} />
          </g>
        )}
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hover.date), 90), w - 90), top: Math.max(y(hover.v) - 12, 4) }}>
          <b>{peso(hover.v)}</b>
          <span>{fmtDate(hover.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {hover.kind === 'forecast' && <span className="tip-band">{peso(hover.lo)} – {peso(hover.hi)}</span>}
          <em>{hover.kind === 'forecast' ? 'forecast' : 'recorded'}</em>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- sparkline */
export function Sparkline({ values, forecast = [], width = 140, height = 36, cls = '' }) {
  const all = [...values, ...forecast]
  const lo = Math.min(...all), hi = Math.max(...all)
  const xs = (i) => 2 + (i / (all.length - 1)) * (width - 4)
  const ys = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6)
  const path = (arr, off) => arr.map((v, i) => (i ? 'L' : 'M') + xs(i + off).toFixed(1) + ',' + ys(v).toFixed(1)).join('')
  const joinF = [values[values.length - 1], ...forecast]
  return (
    <svg className={'spark ' + cls} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path(values, 0)} className="spark-a" />
      {forecast.length > 0 && <path d={path(joinF, values.length - 1)} className="spark-f" />}
      <circle cx={xs(values.length - 1)} cy={ys(values[values.length - 1])} r="2.6" className="spark-dot" />
    </svg>
  )
}

/* ----------------------------------------------------------------- seasonal bars */
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export function SeasonBars({ values, currentMonth, height = 170 }) {
  const [ref, W] = useWidth()
  const [hov, setHov] = useState(null)
  const m = { t: 18, b: 22, l: 6, r: 6 }
  const max = Math.max(...values.map(Math.abs), 5)
  const bw = (W - m.l - m.r) / 12
  const mid = m.t + (height - m.t - m.b) / 2
  const sc = (height - m.t - m.b) / 2 / max
  const cheapest = values.indexOf(Math.min(...values))
  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={W} height={height} role="img" aria-label="Average seasonal price effect by month">
        <line x1={m.l} x2={W - m.r} y1={mid} y2={mid} className="grid zero" />
        {values.map((v, i) => {
          const bh = Math.max(Math.abs(v) * sc, 1.5)
          const bx = m.l + i * bw + bw * 0.16
          return (
            <g key={i} onPointerEnter={() => setHov(i)} onPointerLeave={() => setHov(null)}>
              <rect x={m.l + i * bw} y={m.t - 8} width={bw} height={height - m.t - m.b + 8} fill="transparent" />
              <rect x={bx} y={v >= 0 ? mid - bh : mid} width={bw * 0.68} height={bh} rx="3" className={v >= 0 ? 'bar-up' : 'bar-down'}
                opacity={hov === null || hov === i ? 1 : 0.55} />
              {i === currentMonth && <rect x={m.l + i * bw + 1} y={m.t - 6} width={bw - 2} height={height - m.t - m.b + 10} rx="6" className="cur-month" />}
              <text x={m.l + i * bw + bw / 2} y={height - 6} textAnchor="middle" className="axis">{MONTHS[i]}</text>
              {(hov === i || (hov === null && i === cheapest)) && (
                <text x={m.l + i * bw + bw / 2} y={v >= 0 ? mid - bh - 5 : mid + bh + 12} textAnchor="middle" className="bar-label">
                  {v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v).toFixed(0)}%
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hov !== null && <div className="tip small" style={{ left: m.l + hov * bw + bw / 2, top: 0 }}><b>{MONTH_FULL[hov]}</b></div>}
    </div>
  )
}

/* --------------------------------------------------------------- multi-line chart */
export function MultiLine({ rows, series, height = 230 }) {
  const [ref, W] = useWidth()
  const [hov, setHov] = useState(null)
  const m = { t: 12, r: 12, b: 26, l: 52 }
  const vals = rows.flatMap((r) => series.map((s) => r[s.key]))
  let lo = Math.min(...vals), hi = Math.max(...vals)
  const pad = (hi - lo) * 0.1 || 1
  lo -= pad; hi += pad
  const x = (i) => m.l + (i / (rows.length - 1)) * (W - m.l - m.r)
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (height - m.t - m.b)
  const yt = niceTicks(lo, hi, 3)
  const path = (k) => rows.map((r, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(r[k]).toFixed(1)).join('')
  const move = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    setHov(Math.max(0, Math.min(rows.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (rows.length - 1)))))
  }
  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={W} height={height} onPointerMove={move} onPointerLeave={() => setHov(null)} role="img" aria-label="Backtest: actual versus predicted prices">
        {yt.map((v) => (<g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid" /><text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{peso(v, 0)}</text></g>))}
        {rows.map((r, i) => (i % Math.ceil(rows.length / 5) === 0 ? <text key={i} x={x(i)} y={height - 7} textAnchor="middle" className="axis">{fmtDate(r.date)}</text> : null))}
        {series.map((s) => (<path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={s.w || 2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />))}
        {hov !== null && (
          <g pointerEvents="none">
            <line x1={x(hov)} x2={x(hov)} y1={m.t} y2={height - m.b} className="cross" />
            {series.map((s) => <circle key={s.key} cx={x(hov)} cy={y(rows[hov][s.key])} r="4" fill={s.color} className="ring" />)}
          </g>
        )}
      </svg>
      {hov !== null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hov), 100), W - 100), top: 4 }}>
          <span>{fmtDate(rows[hov].date, { month: 'short', day: 'numeric' })}</span>
          {series.map((s) => (<b key={s.key} className="tip-row"><i style={{ background: s.color }} />{s.label} {peso(rows[hov][s.key])}</b>))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- diverging driver bars */
export function DriverBars({ items }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 2)
  return (
    <div className="drivers">
      {items.map((it) => {
        const w = (Math.abs(it.value) / max) * 50
        return (
          <div className="driver" key={it.label}>
            <span className="driver-label">{it.label}</span>
            <div className="driver-track" role="img" aria-label={`${it.label} ${it.value.toFixed(1)} percent`}>
              <i className="driver-mid" />
              <i className={'driver-fill ' + (it.value >= 0 ? 'up' : 'down')}
                style={{ width: w + '%', left: it.value >= 0 ? '50%' : 50 - w + '%' }} />
            </div>
            <b className="driver-val">{it.value > 0 ? '+' : it.value < 0 ? '−' : ''}{Math.abs(it.value).toFixed(1)}%</b>
          </div>
        )
      })}
    </div>
  )
}
