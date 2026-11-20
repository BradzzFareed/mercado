import { useId, useRef, useState } from 'react'
import { useApp } from '../state'
import { peso, pct } from '../util'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import PinMarker from './Pinmarker'

// Stylised island outlines (lon, lat)
const ISLANDS = [
  [[120.6, 18.5], [121.3, 18.6], [121.9, 18.3], [122.3, 18.5], [122.4, 17.4], [122.2, 16.4], [121.6, 15.8], [121.5, 15.1], [121.6, 14.7], [122.0, 14.3], [121.9, 13.95], [122.5, 14.1], [122.75, 13.8], [122.4, 13.5], [122.7, 13.4], [123.3, 13.9], [123.9, 13.8], [124.1, 13.0], [124.05, 12.55], [123.7, 12.7], [123.3, 13.0], [123.0, 13.2], [122.6, 13.5], [122.0, 13.6], [121.6, 13.65], [121.0, 13.6], [120.6, 13.9], [120.5, 14.4], [120.1, 14.8], [119.95, 15.5], [120.0, 16.1], [120.3, 16.3], [120.45, 16.8], [120.35, 17.7], [120.55, 18.35]],
  [[121.92, 20.33], [122.03, 20.39], [122.02, 20.53], [121.94, 20.47]],
  [[120.35, 13.5], [121.0, 13.55], [121.5, 13.15], [121.55, 12.55], [121.1, 12.2], [120.7, 12.35], [120.4, 12.8]],
  [[117.2, 8.4], [117.7, 9.0], [118.6, 9.9], [119.3, 10.5], [119.55, 11.3], [119.3, 11.4], [118.7, 10.4], [118.0, 9.6], [117.3, 8.8]],
  [[121.9, 11.9], [122.6, 11.7], [123.1, 11.5], [123.15, 10.85], [122.6, 10.4], [122.1, 10.4], [121.9, 10.9]],
  [[122.4, 10.85], [122.95, 10.95], [123.3, 10.5], [123.5, 9.9], [123.2, 9.2], [122.9, 9.0], [122.5, 9.6], [122.4, 10.2]],
  [[123.35, 9.5], [123.75, 10.0], [124.05, 11.2], [123.9, 11.25], [123.55, 10.4], [123.25, 9.7]],
  [[123.75, 9.6], [124.15, 9.6], [124.55, 9.85], [124.3, 10.15], [123.9, 10.15]],
  [[124.3, 11.3], [125.0, 11.35], [125.1, 10.8], [125.0, 10.3], [124.85, 10.0], [124.5, 10.3], [124.3, 10.9]],
  [[124.3, 12.55], [125.3, 12.5], [125.7, 11.6], [125.5, 11.0], [125.0, 11.35], [124.9, 11.75], [124.4, 11.95]],
  [[123.2, 12.6], [123.7, 12.4], [123.5, 12.0], [123.2, 12.1]],
  [[122.05, 7.0], [122.3, 7.9], [123.0, 8.3], [123.4, 8.7], [123.9, 8.55], [124.6, 8.5], [125.2, 9.2], [125.6, 9.8], [126.2, 9.2], [126.4, 8.3], [126.1, 7.4], [126.5, 6.8], [126.2, 6.3], [125.7, 6.0], [125.45, 5.8], [125.1, 6.1], [124.6, 6.1], [124.2, 6.5], [123.9, 7.2], [123.4, 7.8], [122.8, 7.5]],
]
const LON0 = 116.8, LON1 = 126.9, LAT0 = 4.9, LAT1 = 21.15
const W = 420
const H = (W * (LAT1 - LAT0)) / (LON1 - LON0)
const px = (lon) => ((lon - LON0) / (LON1 - LON0)) * W
const py = (lat) => ((LAT1 - lat) / (LAT1 - LAT0)) * H

function inside(pt, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const LAND = []
for (let lat = LAT0; lat < LAT1; lat += 0.12) {
  for (let lon = LON0; lon < LON1; lon += 0.12) {
    if (ISLANDS.some((poly) => inside([lon, lat], poly))) LAND.push([px(lon), py(lat)])
  }
}
const FULL = { z: 1, x: 0, y: 0 }
const MAX_ZOOM = 3
const COLOR = { fall: '#17b680', flat: '#dfa42c', rise: '#e85e52', unknown: '#8b9a92' }
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const box = (z, x, y) => ({ z, x: clamp(x, 0, W - W / z), y: clamp(y, 0, H - H / z) })
const around = (z, x, y) => box(z, x - W / (2 * z), y - H / (2 * z))
const trendFor = (change) => !Number.isFinite(change) ? 'unknown' : change > 0 ? 'rise' : change < 0 ? 'fall' : 'flat'

export default function PhilippinesMap({ rows, horizon, selected, onSelect }) {
  const { lang } = useApp()
  const fil = lang === 'fil'
  const dotsId = useId()
  const drag = useRef(null)
  const [view, setView] = useState(FULL)
  const [hover, setHover] = useState(null)
  const [focus, setFocus] = useState(null)
  const [dragging, setDragging] = useState(false)
  const points = rows.filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat))
  const key = String(horizon)
  const active = points.find((r) => r.province === (hover ?? focus))
  const labels = fil
    ? { fall: 'Bumababa', flat: 'Hindi nagbabago', rise: 'Tumataas', unknown: 'Walang taya' }
    : { fall: 'Falling', flat: 'Steady', rise: 'Rising', unknown: 'No forecast' }
  const legend = ['fall', 'flat', 'rise']
  if (points.some((r) => trendFor(r.horizons?.[key]?.change_pct) === 'unknown')) legend.push('unknown')
  const w = W / view.z
  const h = H / view.z

  function zoom(delta) {
    setView((v) => {
      const z = clamp(v.z + delta, 1, MAX_ZOOM)
      const anchor = v.z === 1 && delta > 0 ? points.find((r) => r.province === selected) : null
      return around(z, anchor ? px(anchor.lon) : v.x + W / (2 * v.z), anchor ? py(anchor.lat) : v.y + H / (2 * v.z))
    })
  }

  function onMapKey(e) {
    if (e.target !== e.currentTarget) return
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(.5); return }
    if (e.key === '-') { e.preventDefault(); zoom(-.5); return }
    if (view.z === 1 || !offsets[e.key]) return
    e.preventDefault()
    const [x, y] = offsets[e.key]
    setView((v) => box(v.z, v.x + x * W / v.z * .20, v.y + y * H / v.z * .20))
  }

  function startPan(e) {
    if (e.button !== 0 || view.z === 1 || e.target.closest('.ml-node')) return
    const rect = e.currentTarget.getBoundingClientRect()
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, view, scale: Math.max(w / rect.width, h / rect.height) }
    e.currentTarget.setPointerCapture(e.pointerId)
    setHover(null)
    setDragging(true)
  }
  function movePan(e) {
    const d = drag.current
    if (d?.id !== e.pointerId) return
    setView(box(d.view.z, d.view.x - (e.clientX - d.x) * d.scale, d.view.y - (e.clientY - d.y) * d.scale))
  }
  function stopPan(e) {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
  }

  const basePoints = points.filter((r) => r.province !== selected)
  const activePoint = points.find((r) => r.province === selected)
  if (activePoint) basePoints.push(activePoint)

  return (
    <div className="ml-map">
      <svg className="ml-canvas" viewBox={`${view.x} ${view.y} ${w} ${h}`} role="group" tabIndex={0}
        aria-label={fil ? 'Mapa ng Pilipinas. Gamitin ang plus at minus para mag-zoom at ang mga arrow para ilipat ang mapa.' : 'Map of the Philippines. Use plus or minus to zoom and arrow keys to pan when zoomed.'}
        data-zoomed={view.z > 1} data-dragging={dragging} onKeyDown={onMapKey}
        onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan} onLostPointerCapture={stopPan}>
        <defs><g id={dotsId}>{LAND.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.16" />)}</g></defs>
        <use href={`#${dotsId}`} className="ml-land" pointerEvents="none" aria-hidden="true" />
        {basePoints.map((r) => {
          const x = px(r.lon), y = py(r.lat)
          const change = r.horizons?.[key]?.change_pct
          const trend = trendFor(change)
          const on = r.province === selected
          const price = Number.isFinite(r.price) ? peso(r.price) : '—'
          const summary = trend === 'unknown' ? labels.unknown : `${labels[trend]} ${pct(change, 2)}`
          return (
            <g key={r.province} className="ml-node" role="button" tabIndex={0} aria-pressed={on} aria-label={`${r.name}: ${price}, ${summary}`}
              onPointerEnter={() => setHover(r.province)} onPointerLeave={() => setHover(null)}
              onFocus={() => {
                setFocus(r.province)
                if (x < view.x || x > view.x + w || y < view.y || y > view.y + h) setView(around(view.z, x, y))
              }} onBlur={() => setFocus(null)}
              onClick={() => onSelect(r.province)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.province) } }}>
              <circle cx={x} cy={y - (on ? 8 / view.z : 0)} r={(on ? 14 : 8) / view.z} fill="transparent" />
              <circle className="ml-dot-ring" cx={x} cy={y} r={10 / view.z} fill="none" />
              {on ? <PinMarker x={x} y={y} fill={COLOR[trend]} size={27 / view.z} />
                : <circle className="ml-dot" cx={x} cy={y} r={4.6 / view.z} fill={COLOR[trend]} />}
            </g>
          )
        })}
      </svg>
      <div className="ml-zoom" role="group" aria-label={fil ? 'Mga kontrol ng mapa' : 'Map controls'}>
        <button type="button" aria-label={fil ? 'Palakihin' : 'Zoom in'} disabled={view.z >= MAX_ZOOM} onClick={() => zoom(.5)}><Plus size={17} aria-hidden="true" /></button>
        <button type="button" aria-label={fil ? 'Paliitin' : 'Zoom out'} disabled={view.z <= 1} onClick={() => zoom(-.5)}><Minus size={17} aria-hidden="true" /></button>
        <button type="button" aria-label={fil ? 'Ibalik ang mapa' : 'Reset map view'} disabled={view.z === 1} onClick={() => setView(FULL)}><RotateCcw size={15} aria-hidden="true" /></button>
      </div>
      {active && <p className="ml-map-tooltip" aria-hidden="true"><strong>{active.name}</strong><span>{Number.isFinite(active.horizons?.[key]?.change_pct) ? pct(active.horizons[key].change_pct, 2) : labels.unknown}</span></p>}
      <div className="ml-legend" aria-label={fil ? 'Palatandaan ng mapa' : 'Map legend'}>
        {legend.map((trend) => <span key={trend}><i style={{ backgroundColor: COLOR[trend] }} aria-hidden="true" />{labels[trend]}</span>)}
      </div>
    </div>
  )
}
