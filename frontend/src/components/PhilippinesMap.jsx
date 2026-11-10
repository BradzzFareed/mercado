import { useMemo, useState } from 'react'
import { useApp } from '../state'
import { peso, pct } from '../util'
import PinMarker from './Pinmarker'

// Stylised island outlines (lon, lat)
const ISLANDS = [
  [[120.6, 18.5], [121.3, 18.6], [121.9, 18.3], [122.3, 18.5], [122.4, 17.4], [122.2, 16.4], [121.6, 15.8], [121.5, 15.1], [121.6, 14.7], [122.0, 14.3], [121.9, 13.95], [122.5, 14.1], [122.75, 13.8], [122.4, 13.5], [122.7, 13.4], [123.3, 13.9], [123.9, 13.8], [124.1, 13.0], [124.05, 12.55], [123.7, 12.7], [123.3, 13.0], [123.0, 13.2], [122.6, 13.5], [122.0, 13.6], [121.6, 13.65], [121.0, 13.6], [120.6, 13.9], [120.5, 14.4], [120.1, 14.8], [119.95, 15.5], [120.0, 16.1], [120.3, 16.3], [120.45, 16.8], [120.35, 17.7], [120.55, 18.35]],
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
const LON0 = 116.8, LON1 = 126.9, LAT0 = 4.9, LAT1 = 19.0
const W = 420
const H = (W * (LAT1 - LAT0)) / (LON1 - LON0)
const px = (lon) => ((lon - LON0) / (LON1 - LON0)) * W
const py = (lat) => ((LAT1 - lat) / (LAT1 - LAT0)) * H

function inside(pt, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const PIN_RISE = '#ef4444'  // Price increase / surge (Vibrant Red)
const PIN_FALL = '#10b981'  // Price decrease / dip (Vibrant Emerald Green)
const PIN_FLAT = '#f59e0b'  // Neutral / flat change (Amber Yellow)

// Map percentage change directly to explicit hex colors
function getPinColor(ch) {
  if (ch > 0.001) return PIN_RISE
  if (ch < -0.001) return PIN_FALL
  return PIN_FLAT
}

export default function PhilippinesMap({ rows, horizon, selected, onSelect }) {
  const { t } = useApp()
  const [hov, setHov] = useState(null)

  const dots = useMemo(() => {
    const out = []
    for (let lat = LAT0; lat < LAT1; lat += 0.1) {
      for (let lon = LON0; lon < LON1; lon += 0.1) {
        if (ISLANDS.some((p) => inside([lon, lat], p))) out.push([px(lon), py(lat)])
      }
    }
    rows.forEach((r) => {
      out.push([px(r.lon), py(r.lat)])
    })
    return out
  }, [rows])

  const cur = hov || rows.find((r) => r.province === selected)

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="map" role="group" aria-label="Map of the Philippines">
        {dots.map((d, i) => (
          <circle key={i} cx={d[0]} cy={d[1]} r="1.15" className="map-dot" />
        ))}

        {rows.map((r) => {
          const ch = r.horizons[String(horizon)].change_pct
          const on = r.province === selected
          const cx = px(r.lon)
          const cy = py(r.lat)

          // Get explicit hex color directly
          const pinColor = getPinColor(ch)

          return (
            <g
              key={r.province}
              className="map-node"
              onPointerEnter={() => setHov(r)}
              onPointerLeave={() => setHov(null)}
              onClick={() => onSelect(r.province)}
              tabIndex={0}
              role="button"
              aria-label={`${r.name}: ${peso(r.price)}, ${pct(ch)}`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(r.province)}
            >
              <circle cx={cx} cy={cy - 12} r="14" fill="transparent" />

              {on && (
                <circle
                  cx={cx}
                  cy={cy - 15}
                  r="14"
                  className="map-sel"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
              )}

              <PinMarker
                x={cx}
                y={cy}
                fill={pinColor}
                size={on ? 26 : 20}
              />
            </g>
          )
        })}
      </svg>

      {cur && (
        <div className="map-card">
          <b>{cur.name}</b>
          <span>{cur.market}</span>
          <div className="map-card-row">
            <strong>{peso(cur.price)}</strong>
            <em style={{ color: 'var(--ink-2)' }}>
              {pct(cur.horizons[String(horizon)].change_pct)} in {horizon}d
            </em>
          </div>
        </div>
      )}

      <div className="map-legend">
        <span><i style={{ background: PIN_FALL }} />{t('map.legend.fall')}</span>
        <span><i style={{ background: PIN_FLAT }} />{t('map.legend.flat')}</span>
        <span><i style={{ background: PIN_RISE }} />{t('map.legend.rise')}</span>
      </div>
    </div>
  )
}