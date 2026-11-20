import { useMemo, useRef, useState, useEffect } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox } from '../components/Common'
import ThankYou from '../components/ThankYou'
import { pct, peso, store, save } from '../util'
import { CATEGORIES, DISHES, INGREDIENTS, UNIT_LABEL, defaultQty, dishCart, stepQty, unitPrice } from '../dishes'

function usePersisted(key, init) {
  const [v, setV] = useState(() => store(key, init))
  useEffect(() => save(key, v), [key, v])
  return [v, setV]
}

const fmtQty = (q) => String(Math.round(q * 100) / 100)

export default function Planner() {
  const { province, prov, horizon, t, dataVersion } = useApp()
  const { data, error, loading, reload } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const [dishId, setDishId] = usePersisted('mercado.cart.dish', null)
  const [cart, setCart] = usePersisted('mercado.cart.items', {})
  const [target, setTarget] = usePersisted('mercado.cart.target', 0)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [thanks, setThanks] = useState(false)
  const rail = useRef(null)

  const byC = useMemo(() => (data ? Object.fromEntries(data.items.map((i) => [i.commodity, i])) : {}), [data])
  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !data) return <Training />
  const key = String(horizon)

  const dish = DISHES.find((d) => d.id === dishId) || null

  // Picking a dish fills the cart with its recommended ingredients and sets the target count.
  const pick = (d) => {
    setDishId(d.id)
    setCart(dishCart(d))
    setTarget(d.items.length)
  }
  const swipe = (dir) => rail.current?.scrollBy({ left: dir * Math.max(240, rail.current.clientWidth * 0.8), behavior: 'smooth' })

  const setQty = (id, q) => setCart((c) => ({ ...c, [id]: Math.max(0, q) }))
  const remove = (id) => setCart((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== id)))
  const add = (id) => { setCart((c) => ({ ...c, [id]: defaultQty(INGREDIENTS[id].unit) })); setAdding(false); setSearch('') }

  const lines = Object.entries(cart).filter(([id]) => INGREDIENTS[id]).map(([id, q]) => {
    const ing = INGREDIENTS[id]
    const u = unitPrice(id, byC)
    const hz = byC[id]?.horizons?.[key]
    return { id, q, ing, ...u, total: q * u.price, change: hz ? hz.change_pct : null }
  })
  const total = lines.reduce((s, l) => s + l.total, 0)
  const hasEst = lines.some((l) => !l.live)
  const available = Object.keys(INGREDIENTS).filter((id) => !(id in cart) && INGREDIENTS[id].name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <>
      <PageHead title={t('plan.title')} sub={t('plan.sub', { place: prov.name })}><HorizonToggle /></PageHead>

      <section className="panel">
        <div className="panel-top">
          <div><h2>Choose your menu</h2><p className="muted">Swipe through the dishes and tap one. Your cart fills with the recommended ingredients.</p></div>
          <div className="rail-nav">
            <button className="cart-icon-btn" onClick={() => swipe(-1)} aria-label="Previous dishes">‹</button>
            <button className="cart-icon-btn" onClick={() => swipe(1)} aria-label="Next dishes">›</button>
          </div>
        </div>
        <div className="menu-rail" ref={rail} tabIndex={0} aria-label="Dishes">
          {DISHES.map((d) => (
            <button key={d.id} className={'menu-card' + (d.id === dishId ? ' on' : '')} aria-pressed={d.id === dishId} onClick={() => pick(d)}>
              <span className="menu-emoji" aria-hidden="true">{d.icon}</span>
              <b>{d.name}</b>
              <small>{CATEGORIES[d.cat]}</small>
              <em>{d.items.length} ingredients</em>
            </button>
          ))}
        </div>
      </section>

      <div className="cart-grid">
        <section className="panel cart-left">
          <div className="panel-top">
            <div><h2>Your cart</h2><p className="muted">{lines.length ? `${lines.length} item${lines.length > 1 ? 's' : ''} to buy` : 'Nothing here yet. Pick a menu or add ingredients.'}</p></div>
            <button className="cart-btn" onClick={() => setAdding(true)}>+ Add ingredient</button>
          </div>
          {lines.length > 0 && (
            <ul className="cart-items">
              {lines.map((l) => (
                <li key={l.id} className="cart-item">
                  <span className="cart-emoji" aria-hidden="true">{l.ing.icon}</span>
                  <div className="cart-name">
                    <b>{l.ing.name}</b>
                    <small>{peso(l.price)} / {UNIT_LABEL[l.ing.unit]}{!l.live && ' (est.)'}{l.change != null && <em className={'chg ' + (l.change > 0 ? 'surge' : l.change < 0 ? 'dip' : 'stable')}> {pct(l.change)} in {horizon}d</em>}</small>
                  </div>
                  <div className="stepper">
                    <button onClick={() => setQty(l.id, stepQty(l.ing.unit, l.q, -1))} aria-label={`Less ${l.ing.name}`}>−</button>
                    <input type="number" min="0" step="0.05" value={fmtQty(l.q)} aria-label={`${l.ing.name} quantity`} onChange={(e) => setQty(l.id, +e.target.value || 0)} />
                    <button onClick={() => setQty(l.id, stepQty(l.ing.unit, l.q, 1))} aria-label={`More ${l.ing.name}`}>+</button>
                  </div>
                  <b className="cart-line">{peso(l.total)}</b>
                  <button className="cart-del" onClick={() => remove(l.id)} aria-label={`Remove ${l.ing.name}`}>🗑</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel cart-summary" aria-label="Summary of ingredients">
          <h2>Summary of ingredients</h2>
          <div className="sum-menu">
            <span className="menu-emoji" aria-hidden="true">{dish ? dish.icon : '🍽️'}</span>
            <div><small className="muted">Menu</small><b>{dish ? dish.name : 'No menu chosen yet'}</b></div>
          </div>
          <label className="field inline sum-target">
            <span>Target no. of ingredients</span>
            <input type="number" min="0" max="50" value={target} onChange={(e) => setTarget(Math.max(0, Math.round(+e.target.value || 0)))} />
          </label>
          <p className={'small ' + (lines.length === target ? 'sum-ok' : 'muted')}>
            In cart: <b>{lines.length}</b> of {target}{lines.length < target && ` (${target - lines.length} more to go)`}{lines.length > target && ` (${lines.length - target} over)`}
          </p>
          <ul className="sum-list" tabIndex={0} aria-label="Ingredient prices">
            {lines.length === 0 && <li className="muted small">No ingredients yet.</li>}
            {lines.map((l) => (
              <li key={l.id}><span>{l.ing.icon} {l.ing.name} <small>× {fmtQty(l.q)} {UNIT_LABEL[l.ing.unit]}</small></span><b>{peso(l.total)}</b></li>
            ))}
          </ul>
          <div className="sum-total"><span>Total</span><b>{peso(total)}</b></div>
          {hasEst && <p className="muted small">“est.” items have no live forecast price yet; their prices are estimates.</p>}
          <button className="cart-btn wide" disabled={!lines.length} onClick={() => setThanks(true)}>Checkout</button>
        </aside>
      </div>

      {adding && (
        <div className="modal-back" onClick={() => { setAdding(false); setSearch('') }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Add ingredient" onClick={(e) => e.stopPropagation()}>
            <div className="panel-top"><h2>Add ingredient</h2><button className="cart-icon-btn" onClick={() => { setAdding(false); setSearch('') }} aria-label="Close">✕</button></div>
            <input className="modal-search" type="search" placeholder="Search ingredients" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <ul className="modal-list">
              {available.length === 0 && <li className="muted small">Nothing left to add.</li>}
              {available.map((id) => {
                const ing = INGREDIENTS[id], u = unitPrice(id, byC)
                return (
                  <li key={id}>
                    <button onClick={() => add(id)}>
                      <span aria-hidden="true">{ing.icon}</span><b>{ing.name}</b>
                      <small>{peso(u.price)} / {UNIT_LABEL[ing.unit]}{!u.live && ' (est.)'}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {thanks && <ThankYou onClose={() => setThanks(false)} />}
    </>
  )
}
