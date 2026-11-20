import { Logo } from './Icons'
import { Sprout, TrendingUp, Handshake } from 'lucide-react'

export default function AuthShell({ children }) {
  return (
    <div className="auth-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #060e0a;
          background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
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

        .auth-hero {
          flex: 1.1;
          padding: 4rem 5rem;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 2.5rem;
          position: relative;
          z-index: 1;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          background: linear-gradient(135deg, rgba(8, 47, 31, 0.3) 0%, rgba(6, 14, 10, 0) 100%);
          min-height: 100vh;
        }

        .auth-form-side {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 3rem;
          position: relative;
          z-index: 1;
          background: rgba(6, 14, 10, 0.7);
          backdrop-filter: blur(20px);
          min-height: 100vh;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: #fff;
        }

        .hero-content h1 {
          font-size: 2.75rem;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.03em;
          margin: 0 0 1rem 0;
          color: #ffffff;
        }

        .hero-content p {
          color: #94a3b8;
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
          color: #cbd5e1;
          font-weight: 500;
          font-size: 0.95rem;
        }

        .hero-feature-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(16, 185, 129, 0.2);
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
          color: #fff;
        }

        .auth-header-text p {
          color: #94a3b8;
          font-size: 0.95rem;
          margin: 0 0 1.75rem 0;
        }

        .tab-switcher {
          display: flex;
          background: rgba(255, 255, 255, 0.03);
          padding: 4px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 1.75rem;
        }

        .tab-btn {
          flex: 1;
          padding: 0.75rem;
          border: none;
          background: transparent;
          color: #94a3b8;
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
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
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
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
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
          background: #0f291e;
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
          background: rgba(255, 255, 255, 0.18);
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
          color: #cbd5e1;
          margin-bottom: 0.45rem;
        }

        .input-label-row .input-label {
          margin-bottom: 0;
        }

        .swipe-hint {
          font-size: 0.75rem;
          color: #64748b;
        }

        .input-field-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          color: #64748b;
        }

        .password-toggle-btn {
          position: absolute;
          right: 1rem;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
          transition: color 0.2s;
        }

        .password-toggle-btn:hover {
          color: #cbd5e1;
        }

        .input-control {
          width: 100%;
          padding: 0.8rem 2.75rem 0.8rem 2.75rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fff;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .input-control:focus {
          border-color: #10b981;
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          font-size: 0.85rem;
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
          color: #64748b;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .oauth-divider::before,
        .oauth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }

        .google-btn {
          width: 100%;
          padding: 0.85rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #f8fafc;
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
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
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
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          }
        }
      `}</style>

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

        <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 'auto' }}>
          Developed by the Trinity Build.
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">{children}</div>
      </div>
    </div>
  )
}
