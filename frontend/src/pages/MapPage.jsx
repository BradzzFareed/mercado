import { useEffect, useId, useRef, useState } from 'react'
import { Search, MapPin, ArrowRight } from 'lucide-react'
import { useApp, useApi } from '../state'
import { PageHead, ErrorBox } from '../components/Common'
import PhilippinesMap from '../components/PhilippinesMap'
import { peso, pct } from '../util'
import './market-locator.css'

const MAP_FORECAST_DAYS = 30
const QUICK = ['rice', 'pork', 'chicken', 'eggs', 'bangus']
const nameOf = (c) => c.short || c.name || c.id
const byPrice = (a, b) => a.price - b.price || a.name.localeCompare(b.name)
const noRows = []

function CommodityPicker({ commodities, selected, onSelect, fil }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const picker = useRef(null)
  const trigger = useRef(null)
  const input = useRef(null)
  const panelId = useId()
  const quick = QUICK.map((id) => commodities.find((c) => c.id === id)).filter(Boolean)
  const term = query.trim().toLocaleLowerCase()
  const groups = new Map()
  for (const c of commodities) {
    const group = c.group || c.category || (fil ? 'Iba pa' : 'Other commodities')
    if (term && ![c.name, c.short, c.fil, c.id, group].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)) continue
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(c)
  }

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    function dismiss(event) {
      if (!picker.current?.contains(event.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }

  return (
    <section ref={picker} className="ml-picker" aria-label={fil ? 'Pumili ng produkto' : 'Choose a commodity'} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); close() }
    }}>
      <div className="ml-picker-bar">
        <div className="ml-quick" role="group" aria-label={fil ? 'Karaniwang produkto' : 'Common commodities'}>
          {quick.map((c) => (
            <button type="button" key={c.id} className={`pill${selected.id === c.id ? ' on' : ''}`} aria-pressed={selected.id === c.id} onClick={() => { onSelect(c.id); setOpen(false); setQuery('') }}>
              {c.icon && <span aria-hidden="true">{c.icon}</span>}{nameOf(c)}
            </button>
          ))}
          {!quick.some((c) => c.id === selected.id) && <span className="ml-current">{nameOf(selected)}</span>}
        </div>
        <button ref={trigger} type="button" className="ml-button ml-search-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => open ? close() : setOpen(true)}>
          <Search size={17} aria-hidden="true" />{fil ? 'Hanapin ang lahat ng produkto' : 'Search all commodities'}
        </button>
      </div>
      <div className="ml-picker-popover" id={panelId} hidden={!open}>
        <input ref={input} type="search" aria-label={fil ? 'Maghanap ng produkto' : 'Search commodities'} placeholder={fil ? 'Pangalan o kategorya…' : 'Name or category…'} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="ml-options">
          {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => (
            <div key={group} className="ml-option-group">
              <h3>{group}</h3>
              <ul>{[...items].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((c) => (
                <li key={c.id}><button type="button" aria-pressed={selected.id === c.id} onClick={() => { onSelect(c.id); close() }}>{nameOf(c)}</button></li>
              ))}</ul>
            </div>
          ))}
          {groups.size === 0 && <p className="ml-status" role="status">{fil ? 'Walang tugma.' : 'No matching commodities.'}</p>}
        </div>
      </div>
    </section>
  )
}

function MarketView({ commodity, ranking, setRanking }) {
  const { province, setProvince, setHorizon, t, nav, dataVersion, lang } = useApp()
  const fil = lang === 'fil'
  const { data, error, loading, reload } = useApi(`/api/v1/map?commodity=${encodeURIComponent(commodity.id)}`, [dataVersion])
  const rows = data?.rows ?? noRows
  const horizon = MAP_FORECAST_DAYS
  const key = String(horizon)
  const selected = rows.find((r) => r.province === province)
  const forecast = selected?.horizons?.[key]
  const fastCount = rows.filter((r) => r.engine === 'quick').length
  const cheapest = [...rows].filter((r) => Number.isFinite(r.price)).sort(byPrice).slice(0, 5)
  const rising = rows.filter((r) => r.horizons?.[key]?.change_pct > 0)
    .sort((a, b) => b.horizons[key].change_pct - a.horizons[key].change_pct || a.name.localeCompare(b.name)).slice(0, 5)
  const ranked = ranking === 'lowest' ? cheapest : rising
  const unit = selected?.unit ?? commodity.unit_label ?? commodity.unit
  const item = nameOf(commodity)
  return (
    <>
      {error && <ErrorBox error={error} retry={reload} />}
      {!error && loading && !rows.length && <p className="panel ml-status" role="status">{t('common.loading')}</p>}
      {!error && !loading && !rows.length && <p className="panel ml-status" role="status">{fil ? 'Walang datos ng pamilihan para sa produktong ito.' : 'No market data is available for this commodity.'}</p>}
      {!!rows.length && (
        <div className="ml-grid" aria-busy={loading}>
          <section className="panel ml-map-panel" aria-label={fil ? 'Mapa ng mga pamilihan' : 'Market map'}>
            <div className="ml-map-heading">
              <h2>{item}</h2>
              <span className="ml-horizon">{fil ? `Taya sa ${horizon} araw` : `${horizon}-day forecast`}</span>
            </div>
            <PhilippinesMap rows={rows} horizon={horizon} selected={province} onSelect={setProvince} />
            <p className="ml-map-note">{fil ? 'Pumili ng pamilihan upang itakda ang iyong lokasyon.' : 'Select a market to set it as your location.'}
              {fastCount > 0 && ` ${fil ? `${fastCount} pamilihan ang gumagamit ng mabilis na modelo.` : `${fastCount} markets use the quick forecast model.`}`}
            </p>
          </section>
          <aside className="panel ml-sidebar" aria-label={fil ? 'Mga detalye at ranggo' : 'Market details and rankings'}>
            <div className="ml-selected" aria-live="polite">
              <p className="ml-eyebrow"><MapPin size={15} aria-hidden="true" />{fil ? 'Napiling pamilihan' : 'Selected market'}</p>
              {selected ? <>
                <h2>{selected.name}</h2>
                {selected.market && selected.market !== selected.name && <p className="muted small">{selected.market}</p>}
                <p className="ml-price">{peso(selected.price)}{unit && <small> / {unit}</small>}</p>
                {forecast && Number.isFinite(forecast.change_pct) ? (
                  <p className="ml-change" data-trend={Math.sign(forecast.change_pct)}><strong>{pct(forecast.change_pct, 2)}</strong> {fil ? `sa ${horizon} araw` : `in ${horizon} days`}</p>
                ) : <p className="muted small">{fil ? 'Walang taya para sa panahong ito.' : 'No 30-day forecast available.'}</p>}
                {selected.source === 'synthetic' && <p className="muted small">{fil ? 'Halimbawang datos' : 'Synthetic demo data'}</p>}
              </> : <p className="muted small">{fil ? 'Pumili ng pamilihan sa mapa o sa listahan.' : 'Choose a market on the map or from the list.'}</p>}
            </div>
            <div className="ml-tabs" role="group" aria-label={fil ? 'Ayusin ang mga pamilihan' : 'Market rankings'}>
              <button type="button" aria-pressed={ranking === 'lowest'} onClick={() => setRanking('lowest')}>{fil ? 'Pinakamura' : 'Lowest prices'}</button>
              <button type="button" aria-pressed={ranking === 'rising'} onClick={() => setRanking('rising')}>{fil ? 'Pinakamalaking pagtaas' : 'Biggest rises'}</button>
            </div>
            {ranked.length ? <ol className="rank ml-rank" aria-label={ranking === 'lowest' ? (fil ? 'Pinakamura' : 'Lowest prices') : (fil ? 'Pinakamalaking pagtaas' : 'Biggest expected rises')}>
              {ranked.map((r) => (
                <li key={r.province}>
                  <button type="button" aria-pressed={r.province === province} onClick={() => setProvince(r.province)}>
                    <span>{r.name}</span><b>{ranking === 'lowest' ? peso(r.price) : pct(r.horizons[key].change_pct, 2)}</b>
                  </button>
                </li>
              ))}
            </ol> : <p className="ml-status">{fil ? 'Walang pamilihan sa listahang ito.' : (ranking === 'lowest' ? 'No prices to rank.' : 'No price increases forecast for this horizon.')}</p>}
            <button type="button" className="btn ml-forecast" disabled={!selected} onClick={() => { if (forecast) setHorizon?.(horizon); nav('commodity', commodity.id) }}>
              {fil ? `Tingnan ang taya para sa ${item}` : `View forecast for ${item}`}<ArrowRight size={17} aria-hidden="true" />
            </button>
          </aside>
        </div>
      )}
    </>
  )
}

export default function MapPage() {
  const { meta, lang } = useApp()
  const [cid, setCid] = useState('rice')
  const [ranking, setRanking] = useState('lowest')
  const commodities = meta?.commodities ?? []
  const selected = commodities.find((c) => c.id === cid) ?? commodities[0]
  if (!selected) return <div className="market-locator"><PageHead title={lang === 'fil' ? 'Hanapan ng Pamilihan' : 'Market Locator'} /><p className="panel ml-status">{lang === 'fil' ? 'Walang produktong magagamit.' : 'No commodities are available.'}</p></div>
  return (
    <div className="market-locator">
      <PageHead title={lang === 'fil' ? 'Hanapan ng Pamilihan' : 'Market Locator'} sub={lang === 'fil' ? 'Ihambing ang mga presyo at taya sa iba’t ibang pamilihan.' : 'Compare current prices and forecasts across Philippine markets.'} />
      <CommodityPicker commodities={commodities} selected={selected} onSelect={setCid} fil={lang === 'fil'} />
      {/* Remount only the data view to avoid flashing the previous commodity's API rows. */}
      <MarketView key={selected.id} commodity={selected} ranking={ranking} setRanking={setRanking} />
    </div>
  )
}
