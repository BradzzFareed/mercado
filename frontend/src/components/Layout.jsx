import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useApi } from '../state'
import LocationPicker from './LocationPicker'
import { Logo, IconBoard, IconMap, IconPlan, IconWhat, IconLab, IconPipe, IconSun, IconMoon } from './Icons'
import { LogOut, Bell, Menu, X, Globe } from 'lucide-react'
import { buildAlerts } from '../alerts'
import { supabase } from '../supabaseClient'

const NAV = [
  ['board', 'nav.board', IconBoard], ['map', 'nav.map', IconMap], ['planner', 'nav.planner', IconPlan],
  ['whatif', 'nav.whatif', IconWhat], ['lab', 'nav.lab', IconLab], ['pipeline', 'nav.pipeline', IconPipe],
]
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Layout({ children }) {
  const { nav, route, t, lang, setLang, theme, setTheme, province, horizon, commodityBy, dataVersion } = useApp()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [jumpToAlerts, setJumpToAlerts] = useState(false)
  const mainRef = useRef(null)
  const drawerRef = useRef(null)
  const hamburgerRef = useRef(null)
  const wasOpen = useRef(false)

  // Shared with Board through api.js' per-path promise cache.
  const { data: overview } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const alerts = useMemo(
    () => (overview && Object.keys(commodityBy).length ? buildAlerts(overview.items, commodityBy, horizon, t) : []),
    [overview, commodityBy, horizon, t],
  )

  const dark = theme ? theme === 'dark' : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const active = route?.page === 'commodity' ? 'board' : route?.page

  const closeMenu = () => setIsMenuOpen(false)
  const goBoard = () => { closeMenu(); nav('board') }
  const goAlerts = () => { closeMenu(); setJumpToAlerts(true); nav('board') }

  // Jump to the Board alerts panel without putting "#alerts" in the hash route.
  useEffect(() => {
    if (!jumpToAlerts || route.page !== 'board') return
    let frame = 0
    let raf
    const focus = () => {
      const el = document.getElementById('board-alerts')
      if (!el) {
        if (frame++ < 12) raf = requestAnimationFrame(focus)
        return
      }
      setJumpToAlerts(false)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      el.focus({ preventScroll: true })
    }
    raf = requestAnimationFrame(focus)
    return () => cancelAnimationFrame(raf)
  }, [jumpToAlerts, route.page, overview])

  const handleLogout = async () => {
    closeMenu()
    if (supabase) await supabase.auth.signOut()
    nav('auth')
  }

  // Move focus into the drawer while open, then back to the hamburger on close.
  useEffect(() => {
    if (isMenuOpen) {
      wasOpen.current = true
      drawerRef.current?.querySelector('.drawer-header .hamburger-btn')?.focus()
    } else if (wasOpen.current) {
      wasOpen.current = false
      if (hamburgerRef.current?.isConnected) hamburgerRef.current.focus()
    }
  }, [isMenuOpen])

  // Escape closes the drawer; Tab and Shift+Tab stay inside it while open.
  useEffect(() => {
    if (!isMenuOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setIsMenuOpen(false); return }
      if (e.key !== 'Tab') return
      const drawer = drawerRef.current
      if (!drawer) return
      const nodes = drawer.querySelectorAll(FOCUSABLE)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      const inside = drawer.contains(active)
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMenuOpen])

  // Dynamic Theme Colors
  const bgApp = dark ? '#060e0a' : '#ecfdf5';
  const bgHeader = dark ? 'rgba(6, 14, 10, 0.85)' : 'rgba(236, 253, 245, 0.85)';
  const textMain = dark ? '#f1f5f9' : '#022c22';
  const textMuted = dark ? '#94a3b8' : '#047857';
  const borderSubtle = dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(16, 185, 129, 0.2)';
  const hoverBg = dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(16, 185, 129, 0.1)';

  // New: Dynamic Grid Line Colors
  const gridColor = dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(16, 185, 129, 0.06)';

  return (
    <div className="app-global-wrapper">
      <style>{`
        .app-global-wrapper {
          min-height: 100vh; 
          background-color: ${bgApp};
          /* Modern Tailwind-style Grid Background */
          background-image: 
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px);
          background-size: 40px 40px;
          color: ${textMain};
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif; 
          position: relative;
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        
        /* The glowing emerald radial effect floating over the grid */
        .app-global-wrapper::before {
          content: ''; position: absolute; top: -10%; left: -5%; width: 40vw; height: 40vw;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(6, 14, 10, 0) 70%);
          z-index: 0; pointer-events: none;
        }

        .skip-link {
          position: absolute; left: 1rem; top: -100px; z-index: 2000;
          background: #10b981; color: #022c22; padding: 0.75rem 1rem;
          border-radius: 8px; font-weight: 600; text-decoration: none;
          transition: top 0.2s ease;
        }
        .skip-link:focus { top: 1rem; }

        .board-header-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 3rem; background: ${bgHeader};
          backdrop-filter: blur(20px); border-bottom: 1px solid ${borderSubtle};
          position: sticky; top: 0; z-index: 100; transition: background-color 0.3s ease;
        }
        .header-left, .header-actions { display: flex; align-items: center; gap: 1rem; }
        .hamburger-btn { background: transparent; border: none; color: ${textMuted}; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: color 0.2s, background-color 0.2s; }
        .hamburger-btn:hover { color: #10b981; background: ${hoverBg}; }
        .header-brand { display: flex; align-items: center; gap: 0.75rem; font-size: 1.5rem; font-weight: 700; color: ${textMain}; cursor: pointer; background: none; border: 0; padding: 0; font-family: inherit; transition: color 0.2s; }
        .header-brand:hover { color: #10b981; }
        
        .icon-btn { background: ${hoverBg}; border: 1px solid ${borderSubtle}; color: ${textMuted}; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; transition: background-color 0.2s, color 0.2s, border-color 0.2s; }
        .icon-btn:hover { background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
        .alert-badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: #dc2626; color: #fff; font-size: 0.68rem; font-weight: 700; line-height: 18px; text-align: center; box-sizing: border-box; }
        
        .menu-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        .menu-overlay.open { opacity: 1; pointer-events: auto; }
        
        .side-drawer { position: fixed; top: 0; left: -360px; width: 340px; height: 100vh; background: ${bgApp}; border-right: 1px solid ${borderSubtle}; z-index: 1000; display: flex; flex-direction: column; padding: 2rem 1.5rem; overflow-y: auto; overscroll-behavior: contain; transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease; }
        .side-drawer.open { left: 0; }
        .drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
        
        .location-wrapper { margin-bottom: 2rem; }
        
        .drawer-nav-list { display: flex; flex-direction: column; gap: 0.25rem; list-style: none; padding: 0; margin: 0; }
        .drawer-nav-item { display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1rem; color: ${textMuted}; background: transparent; border-radius: 8px; font-weight: 500; font-size: 0.95rem; cursor: pointer; border: none; width: 100%; text-align: left; transition: color 0.2s, background-color 0.2s; }
        .drawer-nav-item:hover { color: ${textMain}; background: ${hoverBg}; }
        .drawer-nav-item.active { color: #022c22; background: #10b981; font-weight: 600; }
        
        .drawer-footer { margin-top: auto; padding-top: 1.5rem; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid ${borderSubtle}; }
        .footer-action { display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none; color: ${textMuted}; font-size: 0.9rem; cursor: pointer; transition: color 0.2s; }
        .footer-action:hover { color: ${textMain}; }
        
        .page-content-wrapper { padding: 2.5rem 3rem; max-width: 1400px; margin: 0 auto; width: 100%; box-sizing: border-box; position: relative; z-index: 1; }

        @media (prefers-reduced-motion: reduce) {
          .app-global-wrapper, .board-header-nav, .side-drawer, .menu-overlay, .skip-link,
          .hamburger-btn, .header-brand, .icon-btn, .drawer-nav-item, .footer-action { transition: none; }
        }
      `}</style>

      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }}
      >{t('skip')}</a>

      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={closeMenu} aria-hidden="true" />

      <nav id="side-drawer" ref={drawerRef} className={`side-drawer ${isMenuOpen ? 'open' : ''}`} aria-label={t('menu.label')} inert={!isMenuOpen}>
        <div className="drawer-header">
          <button className="header-brand" onClick={goBoard}><Logo size={32} /> Mercado</button>
          <button className="hamburger-btn" onClick={closeMenu} aria-label={t('menu.close')}><X size={22} /></button>
        </div>
        
        <div className="location-wrapper"><LocationPicker /></div>
        
        <ul className="drawer-nav-list">
          {NAV.map(([id, key, Icon]) => (
            <li key={id}>
              <button className={`drawer-nav-item ${active === id ? 'active' : ''}`} onClick={() => { closeMenu(); nav(id); }} aria-current={active === id ? 'page' : undefined}>
                <Icon size={18} /> {t(key)}
              </button>
            </li>
          ))}
        </ul>
        
        <div className="drawer-footer">
          <button className="footer-action" onClick={handleLogout}><LogOut size={16} /> {t('logout')}</button>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="footer-action" onClick={() => setLang(lang === 'en' ? 'fil' : 'en')}>{t('lang')} <Globe size={16} /></button>
          </div>
        </div>
      </nav>

      <header className="board-header-nav">
        <div className="header-left">
          <button ref={hamburgerRef} className="hamburger-btn" onClick={() => setIsMenuOpen((open) => !open)} aria-label={t('menu.open')} aria-expanded={isMenuOpen} aria-controls="side-drawer"><Menu size={22} /></button>
          <button className="header-brand" onClick={goBoard}><Logo size={36} /> Mercado</button>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={goAlerts}
            aria-label={alerts.length ? t('alerts.bell', { count: alerts.length }) : t('alerts.title')}
            title={alerts.length ? t('alerts.bell', { count: alerts.length }) : t('alerts.title')}
          >
            <Bell size={18} />
            {alerts.length > 0 && <span className="alert-badge" aria-hidden="true">{alerts.length}</span>}
          </button>
          <button className="icon-btn" onClick={handleLogout} aria-label={t('logout')} title={t('logout')}>
            <LogOut size={18} />
          </button>
          <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('theme')}>
            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </div>
      </header>

      <main id="main-content" ref={mainRef} className="page-content-wrapper" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
