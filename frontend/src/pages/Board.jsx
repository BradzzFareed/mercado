import { useEffect, useMemo, useState } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox, SampleBadge } from '../components/Common'
import { PriceTag, SignalChip } from '../components/PriceTag'
import { Sparkline } from '../components/Charts'
import Avatar from '../components/Avatar'
import { displayName } from '../profile'
import { buildAlerts } from '../alerts'
import { peso0, pct, fmtDate } from '../util'
import { supabase } from '../supabaseClient'

export default function Board() {
  const { province, prov, horizon, t, commodityBy, nav, profile } = useApp()
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setUser(data.session?.user ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setUser(s?.user ?? null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const { data, error, loading, reload } = useApi(`/api/v1/overview?province=${province}`)
  const alerts = useMemo(() => (data ? buildAlerts(data.items, commodityBy, horizon, t) : []), [data, commodityBy, horizon, t])

  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !data) return <Training />

  // Resolve user name and avatar from saved profile first, then Supabase metadata
  const meta = user?.user_metadata || {}
  const fallbackName = meta.full_name || meta.username || user?.email?.split('@')[0] || 'Guest'
  const fallbackShort = fallbackName.trim().split(/\s+/).filter(Boolean)
  const userName =
    displayName(profile) ||
    (fallbackShort.length > 1 ? `${fallbackShort[0]} ${fallbackShort[fallbackShort.length - 1]}` : fallbackName)

  const resolvedAvatar = profile?.avatar || meta.avatar_url
  const isImageAvatar = typeof resolvedAvatar === 'string' && (resolvedAvatar.startsWith('/') || resolvedAvatar.startsWith('http'))

  const key = String(horizon)
  const surges = data.items.filter((i) => i.horizons[key]?.signal === 'surge')
  const dips = data.items.filter((i) => i.horizons[key]?.signal === 'dip')
  const bk = data.basket
  const bch = bk[key]?.change_pct
  const bsig = bch >= 2.5 ? 'surge' : bch <= -2.5 ? 'dip' : 'stable'
  const names = (arr) => arr.map((i) => commodityBy[i.commodity].short).join(', ')

  return (
    <div className="board-page-wrapper">
      <style>{`
        .board-welcome-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .board-user-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.45rem 1rem 0.45rem 0.5rem;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 999px;
          cursor: pointer;
          color: inherit;
          font-family: inherit;
          transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .board-user-pill:hover {
          border-color: #10b981;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(16, 185, 129, 0.12);
        }
        .board-user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid #10b981;
          background: rgba(16, 185, 129, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .board-user-avatar img,
        .board-user-avatar .avatar-svg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .board-user-text {
          display: flex;
          flex-direction: column;
          text-align: left;
          line-height: 1.2;
        }
        .board-user-greeting {
          font-size: 0.72rem;
          color: var(--ink-3);
          font-weight: 500;
        }
        .board-user-name {
          font-size: 0.92rem;
          font-weight: 700;
        }

        .board-page-wrapper .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem; }
        #board-alerts { scroll-margin-top: 6rem; }
        .board-page-wrapper .kpi {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: 16px; padding: 1.75rem; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease;
        }
        .board-page-wrapper .kpi-basket { background: var(--basket-bg); color: var(--basket-ink); border-color: transparent; }
        .board-page-wrapper .kpi:hover { transform: translateY(-5px) scale(1.02); box-shadow: 0 15px 30px rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.4); }

        .board-page-wrapper .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        
        .board-page-wrapper .board > * {
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease !important;
          will-change: transform;
        }
        .board-page-wrapper .board > *:hover {
          transform: translateY(-8px) scale(1.03) rotate(1deg) !important;
          box-shadow: 0 20px 40px rgba(16, 185, 129, 0.15) !important;
          z-index: 10;
        }

        .board-page-wrapper .panel {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: 16px; padding: 2rem; margin-top: 2.5rem;
        }
        .board-page-wrapper .asof { color: var(--ink-3); font-size: 0.85rem; margin: 1.5rem 0; }
      `}</style>

      <div className="board-welcome-bar">
        <button
          type="button"
          className="board-user-pill"
          onClick={() => nav('profile')}
          aria-label={`Open profile for ${userName}`}
        >
          <span className="board-user-avatar">
            {isImageAvatar ? (
              <img src={resolvedAvatar} alt={userName} />
            ) : (
              <Avatar id={resolvedAvatar} />
            )}
          </span>
          <span className="board-user-text">
            <span className="board-user-greeting">Welcome back,</span>
            <span className="board-user-name">{userName}</span>
          </span>
        </button>
      </div>

      <PageHead title={t('board.title')} sub={t('board.sub', { place: `${prov.name} · ${prov.market}` })}>
        <SampleBadge />
        <HorizonToggle />
      </PageHead>

      <section className="kpis" aria-label="Summary">
        <div className="kpi kpi-basket">
          <div className="kpi-label">{t('board.basket')}</div>
          <div className="kpi-big">{peso0(bk.current)}</div>
          <div className="kpi-row">
            {bk[key] ? <SignalChip signal={bsig}>{pct(bch)} → {peso0(bk[key].price)}</SignalChip> : <span className="muted">—</span>}
            <span className="muted">{t('board.basket.sub')}</span>
          </div>
          <Sparkline values={bk.spark} forecast={bk.spark_forecast} width={260} height={46} />
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('board.surges')}</div>
          <div className="kpi-num surge-ink">{surges.length}</div>
          <p className="kpi-note">{surges.length ? names(surges) : '—'}</p>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('board.dips')}</div>
          <div className="kpi-num dip-ink">{dips.length}</div>
          <p className="kpi-note">{dips.length ? names(dips) : '—'}</p>
        </div>
      </section>

      <section className="board" aria-label={t('board.title')}>
        {data.items.map((it, i) => (
          <PriceTag key={it.commodity} item={it} index={i} commodity={commodityBy[it.commodity]} horizon={horizon} onOpen={() => nav('commodity', it.commodity)} />
        ))}
      </section>

      <p className="asof">{t('board.asof', { date: fmtDate(data.as_of, { month: 'long', day: 'numeric', year: 'numeric' }) })}</p>

      <section className="panel" id="board-alerts" tabIndex={-1}>
        <h2>{t('alerts.title')}</h2>
        {alerts.length === 0 ? <p className="muted">{t('alerts.none')}</p> : (
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.commodity} className={'alert ' + a.signal}>
                <span className="alert-icon" aria-hidden="true">{commodityBy[a.commodity].icon}</span>
                <div>
                  <SignalChip signal={a.signal}>{t('sig.' + a.signal)} {pct(a.change)}</SignalChip>
                  <p>{a.text}</p>
                </div>
                <button className="btn ghost small" onClick={() => nav('commodity', a.commodity)}>{commodityBy[a.commodity].short}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}