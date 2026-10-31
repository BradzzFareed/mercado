import { useMemo } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { peso, fmtDate } from '../util'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend)
ChartJS.defaults.font.family = "'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif"
ChartJS.defaults.font.size = 11
ChartJS.defaults.maintainAspectRatio = false
ChartJS.defaults.animation.duration = 250

/* ------------------------------------------------------------------ theme helpers */
function cssVar(name, fallback = '#888') {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function resolveColor(c, fallback) {
  if (typeof c === 'string' && c.startsWith('var(')) {
    const m = c.match(/var\((--[^),]+)/)
    if (m) return cssVar(m[1], fallback)
  }
  return c || fallback
}

function theme() {
  return {
    ink: cssVar('--ink', '#11261d'),
    bg: cssVar('--bg', '#f1f4ec'),
    ink3: cssVar('--ink-3', '#6f7f76'),
    line: cssVar('--line', '#dfe5d7'),
    leaf: cssVar('--leaf-line', '#16543f'),
    amber: cssVar('--amber-line', '#c26a00'),
    band: cssVar('--band', 'rgba(255,181,46,0.28)'),
    up: cssVar('--up', '#d9503f'),
    down: cssVar('--down', '#1e9a68'),
    surface: cssVar('--surface', '#fff'),
  }
}

function tooltipStyle(t) {
  return {
    backgroundColor: t.ink,
    titleColor: t.bg,
    bodyColor: t.bg,
    borderColor: t.line,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 10,
    displayColors: false,
  }
}

const day = (iso) => Math.round(new Date(iso + 'T00:00:00').getTime() / 864e5)

/* ------------------------------------------------------------------ forecast chart */
export function ForecastChart({ history, forecast, horizon, bestBuy, weeks = 52, height = 340, label = 'Price' }) {
  const t = theme()
  const hist = history.slice(-weeks)
  const last = hist[hist.length - 1]
  const hIndex = hist.length - 1
  const fcPts = useMemo(
    () => [{ date: last.date, price: last.price, lo: last.price, hi: last.price }, ...forecast],
    [last, forecast],
  )

  const labels = useMemo(
    () => [...hist.map((d) => d.date), ...forecast.map((d) => d.date)],
    [hist, forecast],
  )

  const tickIdx = useMemo(() => {
    const out = []
    const start = new Date(labels[0] + 'T00:00:00')
    const end = new Date(labels[labels.length - 1] + 'T00:00:00')
    const step = weeks > 60 ? 4 : 2
    for (let d = new Date(start.getFullYear(), start.getMonth() + 1, 1); d <= end; d.setMonth(d.getMonth() + step)) {
      const iso = d.toISOString().slice(0, 10)
      let best = 0
      let bd = Infinity
      labels.forEach((l, i) => {
        const dd = Math.abs(day(l) - day(iso))
        if (dd < bd) { bd = dd; best = i }
      })
      if (!out.includes(best)) out.push(best)
    }
    return out
  }, [labels, weeks])

  const data = useMemo(() => {
    const bandHi = labels.map((_, i) => (i >= hIndex ? (fcPts[i - hIndex] || {}).hi ?? null : null))
    const bandLo = labels.map((_, i) => (i >= hIndex ? (fcPts[i - hIndex] || {}).lo ?? null : null))
    const actual = labels.map((_, i) => (i <= hIndex ? hist[i].price : null))
    const fc = labels.map((_, i) => (i >= hIndex ? (fcPts[i - hIndex] || {}).price ?? null : null))
    return {
      labels,
      datasets: [
        {
          label: '80% range',
          data: bandHi,
          isBand: true,
          borderColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          backgroundColor: t.band,
          fill: '+1',
          tension: 0,
        },
        {
          label: '80% range',
          data: bandLo,
          isBand: true,
          borderColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
        },
        {
          label: 'Recorded',
          data: actual,
          borderColor: t.leaf,
          borderWidth: 2.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: t.leaf,
          pointBorderColor: t.surface,
          pointBorderWidth: 2.5,
          tension: 0,
          spanGaps: false,
        },
        {
          label: 'Forecast',
          data: fc,
          borderColor: t.amber,
          borderWidth: 2.4,
          borderDash: [6, 5],
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: t.amber,
          pointBorderColor: t.surface,
          pointBorderWidth: 2.5,
          tension: 0,
          spanGaps: false,
        },
      ],
    }
  }, [labels, hist, fcPts, hIndex, t.band, t.leaf, t.amber, t.surface])

  const overlay = useMemo(() => ({
    id: 'forecastOverlay',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales: { x, y } } = chart
      const lastX = x.getPixelForValue(hIndex)
      ctx.save()

      // forecast zone
      ctx.fillStyle = t.band
      ctx.globalAlpha = 0.35
      ctx.fillRect(lastX, chartArea.top, chartArea.right - lastX, chartArea.bottom - chartArea.top)
      ctx.globalAlpha = 1

      // horizon marker (fractional week position)
      const fi = hIndex + horizon / 7
      const i0 = Math.max(0, Math.min(labels.length - 1, Math.floor(fi)))
      const i1 = Math.max(0, Math.min(labels.length - 1, Math.ceil(fi)))
      const frac = fi - Math.floor(fi)
      const hx = x.getPixelForValue(i0) + (x.getPixelForValue(i1) - x.getPixelForValue(i0)) * frac
      ctx.strokeStyle = t.amber
      ctx.globalAlpha = 0.8
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(hx, chartArea.top)
      ctx.lineTo(hx, chartArea.bottom)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.fillStyle = t.amber
      ctx.font = '700 11px Figtree, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${horizon}d`, hx, chartArea.top + 10)

      // "now" dot
      ctx.beginPath()
      ctx.arc(lastX, y.getPixelForValue(last.price), 4.5, 0, Math.PI * 2)
      ctx.fillStyle = t.leaf
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = t.surface
      ctx.stroke()

      // best-buy ring
      if (bestBuy && bestBuy.when !== 'now') {
        const bi = labels.indexOf(bestBuy.when)
        if (bi >= 0) {
          ctx.beginPath()
          ctx.arc(x.getPixelForValue(bi), y.getPixelForValue(fcPts[bi - hIndex].price), 7, 0, Math.PI * 2)
          ctx.strokeStyle = cssVar('--dip', '#0b7a4b')
          ctx.lineWidth = 3
          ctx.stroke()
        }
      }
      ctx.restore()
    },
  }), [hIndex, horizon, labels, last, bestBuy, fcPts, t])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 8, right: 8, bottom: 0, left: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle(t),
        filter: (item) => !item.dataset.isBand,
        callbacks: {
          title: (items) => fmtDate(items[0].label, { month: 'short', day: 'numeric', year: 'numeric' }),
          label: (item) => `${item.dataset.label}: ${peso(item.parsed.y)}`,
          afterBody: (items) => {
            const i = items[0].dataIndex
            const lo = data.datasets[1].data[i]
            const hi = data.datasets[0].data[i]
            const out = []
            if (lo != null && hi != null) out.push(`80% range: ${peso(lo, 0)} – ${peso(hi, 0)}`)
            out.push(i > hIndex ? 'forecast' : 'recorded')
            return out
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: t.ink3,
          maxRotation: 0,
          autoSkip: false,
          callback: (_v, index) => (tickIdx.includes(index)
            ? fmtDate(labels[index], { month: 'short', year: weeks > 60 ? '2-digit' : undefined })
            : ''),
        },
      },
      y: {
        grid: { color: t.line },
        ticks: { color: t.ink3, callback: (v) => peso(v, 0) },
      },
    },
  }), [t, tickIdx, labels, weeks, data, hIndex])

  return (
    <div className="chart" style={{ height }} role="img" aria-label={`${label} history and forecast`}>
      <Line data={data} options={options} plugins={[overlay]} />
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
  const t = theme()
  const max = Math.max(...values.map(Math.abs), 5)
  const cheapest = values.indexOf(Math.min(...values))

  const data = useMemo(() => ({
    labels: MONTHS,
    datasets: [{
      data: values,
      backgroundColor: values.map((v) => (v >= 0 ? t.up : t.down)),
      borderRadius: 3,
      borderSkipped: false,
      borderColor: values.map((_, i) => (i === currentMonth ? t.ink3 : 'transparent')),
      borderWidth: values.map((_, i) => (i === currentMonth ? 1 : 0)),
      barPercentage: 0.68,
      categoryPercentage: 1,
    }],
  }), [values, currentMonth, t])

  const cheapestLabel = useMemo(() => ({
    id: 'cheapestLabel',
    afterDatasetsDraw(chart) {
      const el = chart.getDatasetMeta(0).data[cheapest]
      if (!el) return
      const { ctx } = chart
      const v = values[cheapest]
      ctx.save()
      ctx.fillStyle = t.ink
      ctx.font = '700 11px Figtree, system-ui'
      ctx.textAlign = 'center'
      const txt = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(0) + '%'
      ctx.fillText(txt, el.x, v >= 0 ? el.y - 6 : el.base + 14)
      ctx.restore()
    },
  }), [cheapest, values, t])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle(t),
        callbacks: {
          title: (items) => MONTH_FULL[items[0].dataIndex],
          label: (item) => {
            const v = item.parsed.y
            return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}% vs. trend`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: t.ink3 } },
      y: {
        min: -max,
        max,
        grid: { color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? t.ink3 : t.line) },
        ticks: { color: t.ink3, callback: (v) => `${v > 0 ? '+' : ''}${v}%`, stepSize: Math.ceil(max / 2) },
      },
    },
  }), [t, max])

  return (
    <div className="chart" style={{ height }} role="img" aria-label="Average seasonal price effect by month">
      <Bar data={data} options={options} plugins={[cheapestLabel]} />
    </div>
  )
}

/* --------------------------------------------------------------- multi-line chart */
export function MultiLine({ rows, series, height = 230 }) {
  const t = theme()
  const labels = rows.map((r) => r.date)
  const step = Math.max(1, Math.ceil(rows.length / 5))

  const data = useMemo(() => ({
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: rows.map((r) => r[s.key]),
      borderColor: resolveColor(s.color, t.ink),
      borderWidth: s.w || 2,
      borderDash: s.dash ? s.dash.split(/\s+/).map(Number) : undefined,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointBackgroundColor: resolveColor(s.color, t.ink),
      pointBorderColor: t.surface,
      pointBorderWidth: 2,
      tension: 0,
    })),
  }), [labels, rows, series, t])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle(t),
        displayColors: true,
        callbacks: {
          title: (items) => fmtDate(items[0].label, { month: 'short', day: 'numeric' }),
          label: (item) => `${item.dataset.label}: ${peso(item.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: t.ink3, maxRotation: 0, autoSkip: false, callback: (_v, i) => (i % step === 0 ? fmtDate(labels[i]) : '') },
      },
      y: { grid: { color: t.line }, ticks: { color: t.ink3, callback: (v) => peso(v, 0) } },
    },
  }), [t, labels, step])

  return (
    <div className="chart" style={{ height }} role="img" aria-label="Backtest: actual versus predicted prices">
      <Line data={data} options={options} />
    </div>
  )
}

/* -------------------------------------------------------------- diverging driver bars */
export function DriverBars({ items }) {
  const t = theme()
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 2)
  const height = Math.max(120, items.length * 38)

  const data = useMemo(() => ({
    labels: items.map((i) => i.label),
    datasets: [{
      data: items.map((i) => i.value),
      backgroundColor: items.map((i) => (i.value >= 0 ? t.up : t.down)),
      borderRadius: 4,
      borderSkipped: false,
      barPercentage: 0.55,
    }],
  }), [items, t])

  const valueLabels = useMemo(() => ({
    id: 'driverValues',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      const meta = chart.getDatasetMeta(0)
      ctx.save()
      ctx.font = '700 11px Figtree, system-ui'
      ctx.fillStyle = t.ink
      ctx.textBaseline = 'middle'
      meta.data.forEach((el, i) => {
        const v = items[i].value
        const txt = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%'
        ctx.textAlign = v >= 0 ? 'left' : 'right'
        ctx.fillText(txt, el.x + (v >= 0 ? 6 : -6), el.y)
      })
      ctx.restore()
    },
  }), [items, t])

  const options = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { left: 8, right: 44 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle(t),
        callbacks: { label: (item) => `${item.parsed.x > 0 ? '+' : ''}${item.parsed.x.toFixed(1)}%` },
      },
    },
    scales: {
      x: {
        min: -max,
        max,
        grid: { color: (ctx) => (ctx.tick && ctx.tick.value === 0 ? t.ink3 : t.line) },
        ticks: { color: t.ink3, callback: (v) => `${v}%` },
      },
      y: { grid: { display: false }, ticks: { color: t.ink, font: { size: 12 } } },
    },
  }), [t, max])

  return (
    <div className="chart" style={{ height }} role="img" aria-label="Forecast drivers by contribution">
      <Bar data={data} options={options} plugins={[valueLabels]} />
    </div>
  )
}
