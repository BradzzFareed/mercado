import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useApp, useApi } from '../state'
import LocationPicker from './LocationPicker'
import { Logo, IconSun, IconMoon } from './Icons'
import Avatar from './Avatar'
import { ROLE, addressLine, displayName, titleCaseRegion } from '../profile'
import { LogOut, Bell, Menu, X, Globe, MapPin, LayoutGrid, BookOpen, ClipboardList, Database } from 'lucide-react'
import { buildAlerts } from '../alerts'
import NotificationsBell from './NotificationsBell'
import { supabase } from '../supabaseClient'

// Drawer menu: Profile is reached through the profile card at the top, not a menu row.
const NAV = [
  ['board', 'drawer.board', LayoutGrid], ['map', 'drawer.map', BookOpen], ['planner', 'drawer.planner', ClipboardList], ['pipeline', 'drawer.pipeline', Database],
]
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Layout({ children }) {
  const { nav, route, t, lang, setLang, theme, setTheme, province, prov, horizon, commodityBy, profile, dataVersion } = useApp()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLocOpen, setIsLocOpen] = useState(false)
  const mainRef = useRef(null)
  const locRef = useRef(null)
  const drawerRef = useRef(null)
  const hamburgerRef = useRef(null)
  const wasOpen = useRef(false)
  const navRefs = useRef({})
  const [pill, setPill] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!supabase) return
    let alive = true

    // The profile itself is hydrated from user_metadata in state.jsx; this only
    // tracks the signed-in user for the drawer's fallback values.
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setUser(data.session?.user ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setUser(s?.user ?? null)
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  // Shared with Board through api.js' per-path promise cache.
  const { data: overview } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])
  const alerts = useMemo(
    () => (overview && Object.keys(commodityBy).length ? buildAlerts(overview.items, commodityBy, horizon, t) : []),
    [overview, commodityBy, horizon, t],
  )

  const dark = theme ? theme === 'dark' : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const active = route?.page === 'commodity' ? 'board' : route?.page

  // Sliding active pill behind the drawer nav items.
  const measurePill = useCallback(() => {
    const el = navRefs.current[active]
    setPill(el ? { top: el.offsetTop, height: el.offsetHeight } : null)
  }, [active])
  useEffect(() => {
    measurePill()
    if (!isMenuOpen) return
    const t = setTimeout(measurePill, 350)
    window.addEventListener('resize', measurePill)
    return () => { clearTimeout(t); window.removeEventListener('resize', measurePill) }
  }, [measurePill, isMenuOpen, lang])

  // Drawer profile card: resolves saved profile first, falling back to Supabase user_metadata.
  const meta = user?.user_metadata || {}
  const fallbackName = meta.full_name || meta.username || user?.email?.split('@')[0] || 'Guest'
  const fallbackShort = fallbackName.trim().split(/\s+/).filter(Boolean)
  const profileName =
    displayName(profile) ||
    (fallbackShort.length > 1 ? `${fallbackShort[0]} ${fallbackShort[fallbackShort.length - 1]}` : fallbackName)

  const profileLocation = addressLine(profile) || (prov ? `${prov.name}, ${titleCaseRegion(prov.region)}` : '—')
  const profileRole = ROLE

  // Resolve avatar: supports both image paths ('/avatars/...' or 'http...') and built-in SVG avatar IDs
  const resolvedAvatar = profile?.avatar || meta.avatar_url
  const isImageAvatar = typeof resolvedAvatar === 'string' && (resolvedAvatar.startsWith('/') || resolvedAvatar.startsWith('http'))

  const closeMenu = () => setIsMenuOpen(false)
  const goBoard = () => { closeMenu(); nav('board') }
  const goAlerts = () => { closeMenu(); nav('notifications') }

  // Escape closes the location popover; clicking outside closes it too.
  useEffect(() => {
    if (!isLocOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setIsLocOpen(false) }
    const onPointerDown = (e) => { if (locRef.current && !locRef.current.contains(e.target)) setIsLocOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointerDown) }
  }, [isLocOpen])

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
  const gridColor = dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(16, 185, 129, 0.06)';

  return (
    <div className="app-global-wrapper">
      <style>{`
        .app-global-wrapper {
          min-height: 100vh; 
          background-color: ${bgApp};
          background-image: 
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px);
          background-size: 40px 40px;
          color: ${textMain};
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif; 
          position: relative;
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        
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

        .app-header {
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
        
        .side-drawer { position: fixed; top: 0; left: -360px; width: 340px; height: 100vh; background: ${dark ? '#0b1a14' : '#e4fff1'}; border-right: 1px solid ${borderSubtle}; z-index: 1000; display: flex; flex-direction: column; padding: 1.75rem 1.5rem; overflow-y: auto; overscroll-behavior: contain; transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease; }
        .side-drawer.open { left: 0; }
        .drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }

        .profile-card {
          border: 1.5px solid ${dark ? 'rgba(255,255,255,0.35)' : '#0a3d2e'}; border-radius: 16px;
          padding: 1.25rem 1rem; text-align: center; margin-bottom: 2.5rem;
          display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
          width: 100%; background: ${dark ? 'rgba(255,255,255,0.03)' : '#f1fff9'};
          font-family: inherit; color: inherit; cursor: pointer;
          transition: border-color 0.2s, background-color 0.2s, transform 0.2s;
        }
        .profile-card:hover { border-color: #10b981; transform: translateY(-2px); }
        .profile-avatar {
          width: 64px; height: 64px; border-radius: 50%; margin-bottom: 0.75rem;
          background: ${dark ? 'rgba(255,255,255,0.12)' : '#dbeafe'};
          color: ${dark ? '#a5f3fc' : '#1d4ed8'};
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 1.25rem; overflow: hidden;
          border: 2px solid #10b981;
        }
        .profile-avatar .avatar-svg,
        .profile-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .profile-name { font-weight: 800; font-size: 1.05rem; color: ${textMain}; text-align: center; overflow-wrap: anywhere; }
        .profile-meta { font-size: 0.8rem; color: ${textMuted}; text-align: center; }

        .drawer-nav-block { position: relative; margin-top: 1.5rem; }
        .drawer-nav-list { display: flex; flex-direction: column; gap: 0.35rem; list-style: none; padding: 0; margin: 0; position: relative; z-index: 1; }
        .nav-pill {
          position: absolute; left: 0; right: 0; z-index: 0;
          background: #10b981; border-radius: 10px;
          transition: top 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .drawer-nav-item { display: flex; align-items: center; gap: 1rem; padding: 0.8rem 1.25rem; color: ${textMain}; background: transparent; border-radius: 10px; font-weight: 700; font-size: 1rem; cursor: pointer; border: none; width: 100%; text-align: left; transition: color 0.2s, background-color 0.2s; }
        .drawer-nav-item:hover { color: #10b981; }
        .drawer-nav-item.active { color: #022c22; }

        .drawer-footer { margin-top: auto; padding-top: 1.75rem; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid ${textMain}; }
        .footer-action { display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none; color: ${textMuted}; font-size: 0.9rem; cursor: pointer; transition: color 0.2s; }
        .footer-action:hover { color: ${textMain}; }
        .loc-anchor { position: relative; display: flex; }
        .icon-btn.loc-open { background: #10b981; color: #022c22; border-color: #10b981; }
        .loc-popover {
          position: absolute; top: calc(100% + 12px); right: -12px; width: 320px; z-index: 500;
          background: ${dark ? 'rgba(6, 14, 10, 0.95)' : '#ecfdf5'};
          border: 1px solid ${borderSubtle}; border-radius: 16px; padding: 1.25rem 1.25rem 1rem;
          box-shadow: 0 12px 32px rgba(2, 44, 34, 0.18);
          animation: loc-pop-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes loc-pop-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

        .page-content-wrapper { padding: 2.5rem 3rem; max-width: 1400px; margin: 0 auto; width: 100%; box-sizing: border-box; position: relative; z-index: 1; }

        @media (prefers-reduced-motion: reduce) {
          .app-global-wrapper, .app-header, .side-drawer, .menu-overlay, .skip-link,
          .hamburger-btn, .header-brand, .icon-btn, .drawer-nav-item, .footer-action, .nav-pill { transition: none; }
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

        {/* Profile card — click opens the profile page. */}
        <button
          type="button"
          className="profile-card"
          onClick={() => { closeMenu(); nav('profile') }}
          aria-label={`Open profile for ${profileName}`}
        >
          <span className="profile-avatar">
            {isImageAvatar ? (
              <img src={resolvedAvatar} alt={profileName} className="profile-avatar-img" />
            ) : (
              <Avatar id={resolvedAvatar} />
            )}
          </span>
          <span className="profile-name" style={{ fontSize: profileName.length > 26 ? '0.95rem' : profileName.length > 20 ? '1.02rem' : '1.08rem' }}>
            {profileName}
          </span>
          <span className="profile-meta">{profileLocation}</span>
          <span className="profile-meta">{profileRole}</span>
        </button>

        <div className="drawer-nav-block">
          <div className="nav-pill" style={{ top: pill?.top ?? 0, height: pill?.height ?? 0, opacity: pill ? 1 : 0 }} aria-hidden="true" />
          <ul className="drawer-nav-list">
            {NAV.map(([id, key, Icon]) => (
              <li key={id}>
                <button
                  ref={(el) => { navRefs.current[id] = el }}
                  className={`drawer-nav-item ${active === id ? 'active' : ''}`}
                  onClick={() => { closeMenu(); nav(id); }}
                  aria-current={active === id ? 'page' : undefined}
                >
                  <Icon size={18} /> {t(key)}
                </button>
              </li>
            ))}
            <li>
              <button
                ref={(el) => { navRefs.current.alerts = el }}
                className="drawer-nav-item"
                onClick={goAlerts}
              >
                <Bell size={18} /> {t('drawer.alerts')}
              </button>
            </li>
          </ul>
        </div>
        
        <div className="drawer-footer">
          <button className="footer-action" onClick={handleLogout}><LogOut size={16} /> {t('logout')}</button>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="footer-action" onClick={() => setLang(lang === 'en' ? 'fil' : 'en')}>{t('lang')} <Globe size={16} /></button>
          </div>
        </div>
      </nav>

      <header className="app-header">
        <div className="header-left">
          <button ref={hamburgerRef} className="hamburger-btn" onClick={() => setIsMenuOpen((open) => !open)} aria-label={t('menu.open')} aria-expanded={isMenuOpen} aria-controls="side-drawer"><Menu size={22} /></button>
          <button className="header-brand" onClick={goBoard}><Logo size={36} /> Mercado</button>
        </div>
        <div className="header-actions">
          <div className="loc-anchor" ref={locRef}>
            <button
              className={`icon-btn ${isLocOpen ? 'loc-open' : ''}`}
              onClick={() => setIsLocOpen((open) => !open)}
              aria-label={t('loc.title')}
              title={t('loc.title')}
              aria-expanded={isLocOpen}
              aria-haspopup="dialog"
            >
              <MapPin size={18} />
            </button>
            {isLocOpen && (
              <div className="loc-popover" role="dialog" aria-label={t('loc.title')}>
                <LocationPicker />
              </div>
            )}
          </div>
          <NotificationsBell alerts={alerts} commodityBy={commodityBy} />
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