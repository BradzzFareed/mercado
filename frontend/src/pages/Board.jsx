import { useMemo, useState } from 'react'
import { useApp, useApi } from '../state'
import { PageHead, HorizonToggle, Training, ErrorBox, SampleBadge } from '../components/Common'
import { PriceTag, SignalChip } from '../components/PriceTag'
import { Sparkline } from '../components/Charts'
import { buildAlerts } from '../alerts'
import { peso0, pct, fmtDate } from '../util'
import LocationPicker from '../components/LocationPicker'
import { Logo, IconBoard, IconMap, IconPlan, IconWhat, IconLab, IconPipe, IconSun, IconMoon } from '../components/Icons'
import { LogOut, X, Globe } from 'lucide-react'
import { supabase } from '../supabaseClient'

const NAV = [
  ['board', 'nav.board', IconBoard], ['map', 'nav.map', IconMap], ['planner', 'nav.planner', IconPlan],
  ['whatif', 'nav.whatif', IconWhat], ['lab', 'nav.lab', IconLab], ['pipeline', 'nav.pipeline', IconPipe],
]

export default function Board() {
  const { 
    province, prov, horizon, t, commodityBy, nav, dataVersion, 
    route, lang, setLang, theme, setTheme 
  } = useApp()
  
  const { data, error, loading, reload } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const alerts = useMemo(() => (data ? buildAlerts(data.items, commodityBy, horizon, t) : []), [data, commodityBy, horizon, t])
  
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  
  const dark = theme ? theme === 'dark' : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const active = route?.page === 'commodity' ? 'board' : route?.page

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    nav('auth')
  }

  if (error) return <ErrorBox error={error} retry={reload} />
  if (loading || !data) return <Training />

  const key = String(horizon)
  const surges = data.items.filter((i) => i.horizons[key].signal === 'surge')
  const dips = data.items.filter((i) => i.horizons[key].signal === 'dip')
  const bk = data.basket
  const bch = bk[key].change_pct
  const bsig = bch >= 2.5 ? 'surge' : bch <= -2.5 ? 'dip' : 'stable'
  const names = (arr) => arr.map((i) => commodityBy[i.commodity].short).join(', ')

  return (
    <div className="board-page-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .board-page-wrapper {
          min-height: 100vh;
          background: #060e0a;
          color: #f1f5f9;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          position: relative;
        }

        .board-page-wrapper::before {
          content: ''; position: absolute; top: -10%; left: -5%;
          width: 40vw; height: 40vw;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(6, 14, 10, 0) 70%);
          z-index: 0; pointer-events: none;
        }

        /* Sticky Header */
        .board-header-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 3rem; background: rgba(6, 14, 10, 0.85);
          backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          position: sticky; top: 0; z-index: 100;
        }

        .header-left { display: flex; align-items: center; gap: 1rem; }
        .header-actions { display: flex; align-items: center; gap: 1rem; }

        .hamburger-btn {
          background: transparent; border: none; color: #94a3b8; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          padding: 0.5rem; border-radius: 8px; transition: color 0.2s, background 0.2s;
        }
        .hamburger-btn:hover { color: #10b981; background: rgba(16, 185, 129, 0.1); }

        .header-brand {
          display: flex; align-items: center; gap: 0.75rem; font-size: 1.5rem;
          font-weight: 700; color: #fff; letter-spacing: -0.03em; cursor: pointer;
        }

        .icon-btn {
          background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8; width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s ease;
        }
        .icon-btn:hover { background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.2); }

        .logout-btn {
          display: flex; align-items: center; gap: 0.5rem; background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 0.5rem 1rem;
          border-radius: 10px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
        }
        .logout-btn:hover { background: rgba(239, 68, 68, 0.2); }

        /* Drawer & Overlay */
        .menu-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
          z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }
        .menu-overlay.open { opacity: 1; pointer-events: auto; }

        .side-drawer {
          position: fixed; top: 0; left: -360px; width: 340px; height: 100vh;
          background: #060e0a; border-right: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 1000; display: flex; flex-direction: column;
          padding: 2rem 1.5rem; box-sizing: border-box; overflow-y: auto;
          transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 20px 0 50px rgba(0, 0, 0, 0.5);
        }
        .side-drawer.open { left: 0; }

        .drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; padding: 0 0.5rem; }

        /* Location Picker Wrapper */
        .location-wrapper { margin-bottom: 2rem; }

        /* Drawer Navigation */
        .drawer-nav-list { display: flex; flex-direction: column; gap: 0.25rem; list-style: none; padding: 0; margin: 0; }
        .drawer-nav-item {
          display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1rem;
          color: #cbd5e1; background: transparent; border-radius: 8px;
          font-weight: 500; font-size: 0.95rem; cursor: pointer;
          transition: all 0.2s ease; border: none; width: 100%; text-align: left;
        }
        .drawer-nav-item:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
        .drawer-nav-item.active { color: #060e0a; background: #10b981; font-weight: 600; }
        .drawer-nav-item.active svg { color: #060e0a; }
        .drawer-nav-item svg { color: #64748b; transition: color 0.2s; }

        /* Drawer Footer */
        .drawer-footer {
          margin-top: auto; padding-top: 1.5rem; display: flex; align-items: center; 
          justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.06);
        }
        .footer-action {
          display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none;
          color: #94a3b8; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: color 0.2s;
        }
        .footer-action:hover { color: #fff; }

        /* Content Body & Hover Effects */
        .board-body-content {
          padding: 2.5rem 3rem; max-width: 1400px; margin: 0 auto;
          width: 100%; box-sizing: border-box; position: relative; z-index: 1;
        }

        .board-page-wrapper .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem; }
        .board-page-wrapper .kpi {
          background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px; padding: 1.75rem; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease;
        }
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
          background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px; padding: 2rem; margin-top: 2.5rem;
        }
        .board-page-wrapper .asof { color: #64748b; font-size: 0.85rem; margin: 1.5rem 0; }

        @media (max-width: 768px) {
          .board-header-nav { padding: 1rem 1.5rem; }
          .board-body-content { padding: 1.5rem; }
        }
      `}</style>

      {/* Sliding Drawer Menu Background Overlay */}
      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)} />

      {/* Sliding Side Drawer */}
      <nav className={`side-drawer ${isMenuOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="header-brand" onClick={() => { setIsMenuOpen(false); nav('board'); }}>
            <Logo size={32} /> mercado
          </div>
          <button className="hamburger-btn" onClick={() => setIsMenuOpen(false)} aria-label="Close menu">
            <X size={22} />
          </button>
        </div>

        {/* Real Location Picker Component */}
        <div className="location-wrapper">
          <LocationPicker />
        </div>

        {/* Dynamic Navigation Links */}
        <ul className="drawer-nav-list">
          {NAV.map(([id, key, Icon]) => (
            <li key={id}>
              <button 
                className={`drawer-nav-item ${active === id ? 'active' : ''}`} 
                onClick={() => { setIsMenuOpen(false); nav(id); }}
              >
                <Icon size={18} /> {t(key)}
              </button>
            </li>
          ))}
        </ul>

        {/* Footer Actions (Logout, Language, Theme) */}
        <div className="drawer-footer">
          <button className="footer-action" onClick={handleLogout}>
            <LogOut size={16} /> Logout
          </button>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="footer-action" onClick={() => setLang(lang === 'en' ? 'fil' : 'en')}>
              {t('lang')} <Globe size={16} />
            </button>
            <button className="footer-action" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('theme')}>
              {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
          </div>
        </div>
      </nav>
      

      {/* Main Container Content */}
      <div className="board-body-content">
        <PageHead title={t('board.title')} sub={t('board.sub', { place: `${prov.name} · ${prov.market}` })}>
          <SampleBadge />
          <HorizonToggle />
        </PageHead>

        <section className="kpis" aria-label="Summary">
          <div className="kpi kpi-basket">
            <div className="kpi-label">{t('board.basket')}</div>
            <div className="kpi-big">{peso0(bk.current)}</div>
            <div className="kpi-row">
              <SignalChip signal={bsig}>{pct(bch)} → {peso0(bk[key].price)}</SignalChip>
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

        <section className="panel">
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
    </div>
  )
}