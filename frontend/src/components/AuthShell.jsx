import { Logo } from './Icons'
import { Sprout, TrendingUp, Handshake, Sun, Moon } from 'lucide-react'
import { useApp } from '../state'

export default function AuthShell({ children }) {
  const app = useApp()
  const theme = app?.theme
  const setTheme = app?.setTheme

  const dark = theme
    ? theme === 'dark'
    : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

  const toggleTheme = () => setTheme?.(dark ? 'light' : 'dark')

  // Theme tokens matching Layout.jsx
  const bgApp = dark ? '#060e0a' : '#ecfdf5'
  const gridColor = dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(16, 185, 129, 0.06)'
  const heroBg = dark
    ? 'linear-gradient(135deg, rgba(8, 47, 31, 0.3) 0%, rgba(6, 14, 10, 0) 100%)'
    : 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(236, 253, 245, 0.4) 100%)'
  const formSideBg = dark ? 'rgba(6, 14, 10, 0.7)' : 'rgba(255, 255, 255, 0.75)'
  const borderSubtle = dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(16, 185, 129, 0.2)'
  const textMain = dark ? '#ffffff' : '#022c22'
  const textSecondary = dark ? '#cbd5e1' : '#065f46'
  const textMuted = dark ? '#94a3b8' : '#047857'
  const surfaceControl = dark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff'
  const borderControl = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(16, 185, 129, 0.28)'

  return (
    <div className="auth-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: ${bgApp};
          background-image:
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px);
          background-size: 40px 40px;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
          transition: background-color 0.3s ease, color 0.3s ease;
        }

        .auth-container::before {
          content: '';
          position: absolute;
          top: -20%;
          left: -10%;
          width: 50vw;
          height: 50vw;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(6, 14, 10, 0) 70%);
          z-index: 0;
          pointer-events: none;
        }

        .auth-container::after {
          content: '';
          position: absolute;
          bottom: -20%;
          right: -10%;
          width: 50vw;
          height: 50vw;
          background: radial-gradient(circle, rgba(5, 150, 105, 0.08) 0%, rgba(6, 14, 10, 0) 70%);
          z-index: 0;
          pointer-events: none;
        }

        .auth-theme-toggle {
                  position: fixed;
                  top: 1.25rem;
                  right: 1.5rem;
                  z-index: 50;
                  width: 66px;
                  height: 34px;
                  padding: 3px;
                  border-radius: 999px;
                  border: 1px solid ${borderControl};
                  background: ${dark ? 'rgba(11, 26, 20, 0.9)' : '#d1fae5'};
                  backdrop-filter: blur(12px);
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  box-shadow: 0 4px 14px ${dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(2, 44, 34, 0.1)'};
                  transition: background-color 0.3s ease, border-color 0.3s ease, transform 0.2s ease;
                }

                .auth-theme-toggle:hover {
                  border-color: #10b981;
                  transform: translateY(-1px);
                }

                .auth-theme-track-icons {
                  position: relative;
                  z-index: 2;
                  width: 100%;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 0 6px;
                  pointer-events: none;
                }

                .auth-theme-icon-sun {
                  color: ${dark ? '#64748b' : '#ffffff'};
                  transition: color 0.3s ease;
                }

                .auth-theme-icon-moon {
                  color: ${dark ? '#ffffff' : '#047857'};
                  transition: color 0.3s ease;
                }

                .auth-theme-thumb {
                  position: absolute;
                  top: 3px;
                  left: 3px;
                  width: 26px;
                  height: 26px;
                  border-radius: 50%;
                  background: #10b981;
                  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.45);
                  transform: ${dark ? 'translateX(32px)' : 'translateX(0px)'};
                  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.3s ease;
                  z-index: 1;
                }

        .auth-hero {
          flex: 1.1;
          padding: 4rem 5rem;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 2.5rem;
          position: relative;
          z-index: 1;
          border-right: 1px solid ${borderSubtle};
          background: ${heroBg};
          min-height: 100vh;
          transition: background 0.3s ease, border-color 0.3s ease;
        }

        .auth-form-side {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 3rem;
          position: relative;
          z-index: 1;
          background: ${formSideBg};
          backdrop-filter: blur(20px);
          min-height: 100vh;
          transition: background-color 0.3s ease;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: ${textMain};
        }

        .hero-content h1 {
          font-size: 2.75rem;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.03em;
          margin: 0 0 1rem 0;
          color: ${textMain};
        }

        .hero-content p {
          color: ${textMuted};
          font-size: 1.1rem;
          line-height: 1.6;
          max-width: 440px;
          margin: 0;
        }

        .hero-features {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-top: 2rem;
        }

        .hero-feature-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          color: ${textSecondary};
          font-weight: 500;
          font-size: 0.95rem;
        }

        .hero-feature-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(16, 185, 129, 0.25);
          flex-shrink: 0;
        }

        .auth-card {
          width: 100%;
          max-width: 420px;
        }

        .auth-header-text h2 {
          font-size: 1.85rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 0.5rem 0;
          color: ${textMain};
        }

        .auth-header-text p {
          color: ${textMuted};
          font-size: 0.95rem;
          margin: 0 0 1.75rem 0;
        }

        .tab-switcher {
          display: flex;
          background: ${dark ? 'rgba(255, 255, 255, 0.03)' : '#d1fae5'};
          padding: 4px;
          border-radius: 12px;
          border: 1px solid ${borderSubtle};
          margin-bottom: 1.75rem;
        }

        .tab-btn {
          flex: 1;
          padding: 0.75rem;
          border: none;
          background: transparent;
          color: ${textMuted};
          font-weight: 600;
          font-size: 0.9rem;
          border-radius: 9px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tab-btn.active {
          background: #10b981;
          color: #fff;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .avatar-carousel-box {
          background: ${surfaceControl};
          border: 1px solid ${borderControl};
          border-radius: 14px;
          padding: 1rem 0.75rem 0.85rem;
          user-select: none;
        }

        .avatar-carousel-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .carousel-nav-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid ${borderControl};
          background: ${dark ? 'rgba(255, 255, 255, 0.04)' : '#ecfdf5'};
          color: ${textSecondary};
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }

        .carousel-nav-btn:hover {
          background: rgba(16, 185, 129, 0.15);
          border-color: #10b981;
          color: #10b981;
        }

        .avatar-viewport {
          width: 100%;
          overflow: hidden;
          cursor: grab;
          touch-action: pan-y;
        }

        .avatar-viewport:active {
          cursor: grabbing;
        }

        .avatar-track {
          display: flex;
          transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
          width: 100%;
        }

        .avatar-slide {
          min-width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
        }

        .avatar-circle {
          width: 84px;
          height: 84px;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid #10b981;
          box-shadow: 0 0 18px rgba(16, 185, 129, 0.25);
          background: ${dark ? '#0f291e' : '#d1fae5'};
        }

        .avatar-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          pointer-events: none;
        }

        .avatar-slide-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #10b981;
        }

        .avatar-dots {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.7rem;
        }

        .avatar-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          border: none;
          padding: 0;
          background: ${dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(16, 185, 129, 0.28)'};
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .avatar-dot.active {
          width: 20px;
          background: #10b981;
        }

        .input-group {
          margin-bottom: 1.15rem;
        }

        .input-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.45rem;
        }

        .input-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: ${textSecondary};
          margin-bottom: 0.45rem;
        }

        .input-label-row .input-label {
          margin-bottom: 0;
        }

        .swipe-hint {
          font-size: 0.75rem;
          color: ${textMuted};
        }

        .input-field-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          color: ${textMuted};
        }

        .password-toggle-btn {
          position: absolute;
          right: 1rem;
          background: transparent;
          border: none;
          color: ${textMuted};
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
          transition: color 0.2s;
        }

        .password-toggle-btn:hover {
          color: ${textMain};
        }

        .input-control {
          width: 100%;
          padding: 0.8rem 2.75rem 0.8rem 2.75rem;
          background: ${surfaceControl};
          border: 1px solid ${borderControl};
          border-radius: 10px;
          color: ${textMain};
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .input-control::placeholder {
          color: ${dark ? '#64748b' : '#6b7280'};
        }

        .input-control:focus {
          border-color: #10b981;
          background: ${dark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff'};
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          font-size: 0.85rem;
        }

        .form-actions label {
          color: ${textMuted} !important;
        }

        .forgot-link {
          color: #10b981;
          text-decoration: none;
          font-weight: 500;
        }
        .forgot-link:hover {
          text-decoration: underline;
        }

        .submit-btn {
          width: 100%;
          padding: 0.9rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.25);
        }

        .submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
        }

        .oauth-divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 1.25rem 0;
          color: ${textMuted};
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .oauth-divider::before,
        .oauth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: ${borderSubtle};
        }

        .google-btn {
          width: 100%;
          padding: 0.85rem;
          background: ${dark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff'};
          border: 1px solid ${borderControl};
          border-radius: 10px;
          color: ${textMain};
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          transition: all 0.2s ease;
        }

        .google-btn:hover:not(:disabled) {
          background: ${dark ? 'rgba(255, 255, 255, 0.08)' : '#f0fdf4'};
          border-color: #10b981;
          transform: translateY(-1px);
        }

        .google-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 900px) {
          .auth-container {
            flex-direction: column;
          }
          .auth-hero,
          .auth-form-side {
            min-height: auto;
            padding: 2.5rem 1.5rem;
          }
          .auth-hero {
            border-right: none;
            border-bottom: 1px solid ${borderSubtle};
          }
        }
      `}</style>

      <button
              type="button"
              role="switch"
              aria-checked={dark}
              className="auth-theme-toggle"
              onClick={toggleTheme}
              disabled={typeof setTheme !== 'function'}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="auth-theme-thumb" aria-hidden="true" />
              <span className="auth-theme-track-icons" aria-hidden="true">
                <Sun size={14} className="auth-theme-icon-sun" />
                <Moon size={14} className="auth-theme-icon-moon" />
              </span>
            </button>

      <div className="auth-hero">
        <div className="brand-logo">
          <Logo size={75} /> mercado
        </div>

        <div className="hero-content">
          <h1>
            <span style={{ color: '#10b981' }}>Kabisado ni Mercado,</span> ang tamis ng mga presyo
          </h1>
          <p>Tired of pursuing the best prices for your produce? Join Mercado and stay ahead of the game.</p>

          <div className="hero-features">
            <div className="hero-feature-item">
              <div className="hero-feature-icon"><TrendingUp size={18} /></div>
              <span>Real-time price boards for your local palengke</span>
            </div>
            <div className="hero-feature-item">
              <div className="hero-feature-icon"><Sprout size={18} /></div>
              <span>Smart forecasting tailored for local harvest trends</span>
            </div>
            <div className="hero-feature-item">
              <div className="hero-feature-icon"><Handshake size={18} /></div>
              <span>Check prices from regional buyers and producers</span>
            </div>
          </div>
        </div>

        <div style={{ color: textMuted, fontSize: '0.85rem', marginTop: 'auto' }}>
          Developed by the Trinity Build.
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  )
}
