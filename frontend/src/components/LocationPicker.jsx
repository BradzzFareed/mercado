import { useState } from 'react'
import { useApp } from '../state'
import { IconLocate, IconPin } from './Icons'
import { nearestProvince } from '../util'

export default function LocationPicker() {
  const { meta, prov, setProvince, t } = useApp()
  const [msg, setMsg] = useState('')
  if (!meta || !prov) return null
  const region = meta.regions.find((r) => r.provinces.includes(prov.id)) || meta.regions[0]
  const byId = Object.fromEntries(meta.provinces.map((p) => [p.id, p]))
  const locate = () => {
    if (!navigator.geolocation) return setMsg('Location is not available in this browser.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const n = nearestProvince(meta.provinces, pos.coords.latitude, pos.coords.longitude)
        if (n) { setProvince(n.p.id); setMsg(`Nearest market: ${n.p.name} (${Math.round(n.d)} km)`) }
      },
      () => setMsg('Allow location access, or pick your province below.'),
      { timeout: 8000 },
    )
  }
  return (
    <div className="loc">
      <div className="loc-title"><IconPin size={16} />{t('loc.title')}</div>
      <label className="field">
        <span>{t('loc.region')}</span>
        <select value={region.code} onChange={(e) => setProvince(meta.regions.find((r) => r.code === e.target.value).provinces[0])}>
          {meta.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('loc.province')}</span>
        <select value={prov.id} onChange={(e) => setProvince(e.target.value)}>
          {region.provinces.map((id) => <option key={id} value={id}>{byId[id].name}</option>)}
        </select>
      </label>
      <div className="loc-market">{prov.market}</div>
      <button className="btn ghost small" onClick={locate}><IconLocate size={15} />{t('loc.near')}</button>
      {msg && <div className="loc-msg" role="status">{msg}</div>}
    </div>
  )
}
