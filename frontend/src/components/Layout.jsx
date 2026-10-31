import { useState } from 'react'
import { useApp } from '../state'
import LocationPicker from './LocationPicker'
import { Logo, IconBoard, IconMap, IconPlan, IconWhat, IconLab, IconPipe, IconSun, IconMoon } from './Icons'
import { LogOut, Bell, Menu, X, Globe } from 'lucide-react'
import { supabase } from '../supabaseClient'

const NAV = [
  ['board', 'nav.board', IconBoard], ['map', 'nav.map', IconMap], ['planner', 'nav.planner', IconPlan],
  ['whatif', 'nav.whatif', IconWhat], ['lab', 'nav.lab', IconLab], ['pipeline', 'nav.pipeline', IconPipe],
]

export default function Layout({ children }) {
  const { nav, route, t, lang, setLang, theme, setTheme } = useApp()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  
  const dark = theme ? theme === 'dark' : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const active = route?.page === 'commodity' ? 'board' : route?.page

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    nav('auth')
  }

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

        .board-header-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 3rem; background: ${bgHeader};
          backdrop-filter: blur(20px); border-bottom: 1px solid ${borderSubtle};
          position: sticky; top: 0; z-index: 100; transition: background 0.3s ease;
        }
        .header-left, .header-actions { display: flex; align-items: center; gap: 1rem; }
        .hamburger-btn { background: transparent; border: none; color: ${textMuted}; cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: all 0.2s; }
        .hamburger-btn:hover { color: #10b981; background: ${hoverBg}; }
        .header-brand { display: flex; align-items: center; gap: 0.75rem; font-size: 1.5rem; font-weight: 700; color: ${textMain}; cursor: pointer; transition: color 0.3s; }
        
        .icon-btn { background: ${hoverBg}; border: 1px solid ${borderSubtle}; color: ${textMuted}; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
        .icon-btn:hover { background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
        
        .menu-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 999; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        .menu-overlay.open { opacity: 1; pointer-events: auto; }
        
        .side-drawer { position: fixed; top: 0; left: -360px; width: 340px; height: 100vh; background: ${bgApp}; border-right: 1px solid ${borderSubtle}; z-index: 1000; display: flex; flex-direction: column; padding: 2rem 1.5rem; overflow-y: auto; transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease; }
        .side-drawer.open { left: 0; }
        .drawer-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
        
        .location-wrapper { margin-bottom: 2rem; }
        
        .drawer-nav-list { display: flex; flex-direction: column; gap: 0.25rem; list-style: none; padding: 0; margin: 0; }
        .drawer-nav-item { display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1rem; color: ${textMuted}; background: transparent; border-radius: 8px; font-weight: 500; font-size: 0.95rem; cursor: pointer; border: none; width: 100%; text-align: left; transition: all 0.2s; }
        .drawer-nav-item:hover { color: ${textMain}; background: ${hoverBg}; }
        .drawer-nav-item.active { color: ${dark ? '#060e0a' : '#ffffff'}; background: #10b981; font-weight: 600; }
        
        .drawer-footer { margin-top: auto; padding-top: 1.5rem; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid ${borderSubtle}; }
        .footer-action { display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none; color: ${textMuted}; font-size: 0.9rem; cursor: pointer; transition: color 0.2s; }
        .footer-action:hover { color: ${textMain}; }
        
        .page-content-wrapper { padding: 2.5rem 3rem; max-width: 1400px; margin: 0 auto; width: 100%; box-sizing: border-box; position: relative; z-index: 1; }
      `}</style>

      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} onClick={() => setIsMenuOpen(false)} />

      <nav className={`side-drawer ${isMenuOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="header-brand" onClick={() => { setIsMenuOpen(false); nav('board'); }}><Logo size={32} /> mercado</div>
          <button className="hamburger-btn" onClick={() => setIsMenuOpen(false)}><X size={22} /></button>
        </div>
        
        <div className="location-wrapper"><LocationPicker /></div>
        
        <ul className="drawer-nav-list">
          {NAV.map(([id, key, Icon]) => (
            <li key={id}>
              <button className={`drawer-nav-item ${active === id ? 'active' : ''}`} onClick={() => { setIsMenuOpen(false); nav(id); }}>
                <Icon size={18} /> {t(key)}
              </button>
            </li>
          ))}
        </ul>
        
        <div className="drawer-footer">
          <button className="footer-action" onClick={handleLogout}><LogOut size={16} /> Logout</button>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="footer-action" onClick={() => setLang(lang === 'en' ? 'fil' : 'en')}>{t('lang')} <Globe size={16} /></button>
          </div>
        </div>
      </nav>

      <header className="board-header-nav">
        <div className="header-left">
          <button className="hamburger-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}><Menu size={22} /></button>
          <div className="header-brand" onClick={() => setIsMenuOpen(!isMenuOpen)}><Logo size={36} /> mercado</div>
        </div>
        <div className="header-actions">
          <button className="icon-btn"><Bell size={18} /></button>
          <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('theme')}>
            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </div>
      </header>

      <main className="page-content-wrapper">
        {children}
      </main>
    </div>
  )
}