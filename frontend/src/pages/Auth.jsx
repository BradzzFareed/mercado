import { useState, useRef } from 'react'
import { useApp } from '../state'
import { Logo } from '../components/Icons'
import {
  Sprout,
  TrendingUp,
  Handshake,
  ArrowRight,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import { AVATARS } from '../avatars'
import { DEFAULT_PROFILE, ROLE, persistProfile, profileMetadata } from '../profile'

// The avatar catalogue is shared with the profile page so sign-up and later edits
// store the same avatar id (e.g. 'avatar-3').
const PREDEFINED_AVATARS = AVATARS.map((a, i) => ({
  id: a.id,
  label: `Avatar ${i + 1}`,
  url: a.src,
}))

const ALLOWED_EMAIL_DOMAINS = ['@gmail.', '@yahoo.', '@proton.']

const isAllowedEmailProvider = (email) => {
  const normalized = email.trim().toLowerCase()
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.includes(domain))
}

export default function Auth({ onLogin }) {
  const { nav } = useApp()
  const [isSignup, setIsSignup] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [googleLoading, setGoogleLoading] = useState(false)
  const dragStartX = useRef(null)

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    avatar: PREDEFINED_AVATARS[0].id,
  })
  const [error, setError] = useState('')
  const finish = () => (onLogin ? onLogin() : nav('board'))

  const signInWithGoogle = async () => {
    setError('')
    setGoogleLoading(true)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (oauthError) {
      setGoogleLoading(false)
      setError(oauthError.message || 'Google login failed.')
    }
  }

  const selectAvatarByIndex = (newIndex) => {
    const total = PREDEFINED_AVATARS.length
    const wrappedIndex = (newIndex + total) % total
    setAvatarIndex(wrappedIndex)
    setFormData((prev) => ({
      ...prev,
      avatar: PREDEFINED_AVATARS[wrappedIndex].id,
    }))
  }

  const handleDragStart = (clientX) => {
    dragStartX.current = clientX
  }

  const handleDragEnd = (clientX) => {
    if (dragStartX.current === null) return
    const deltaX = clientX - dragStartX.current
    const swipeThreshold = 35 // Minimum px distance to register a swipe

    if (deltaX < -swipeThreshold) {
      selectAvatarByIndex(avatarIndex + 1) // Swiped left -> next avatar
    } else if (deltaX > swipeThreshold) {
      selectAvatarByIndex(avatarIndex - 1) // Swiped right -> previous avatar
    }
    dragStartX.current = null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isSignup) {
      if (!isAllowedEmailProvider(formData.email)) {
        return setError('Please use a valid @gmail, @yahoo, or @proton email address.')
      }

      // Seed the full profile record from what the sign-up form collects. The
      // rest of the fields stay empty until the user fills them on Profile.
      const nameParts = formData.name.trim().split(/\s+/).filter(Boolean)
      const seed = {
        ...DEFAULT_PROFILE,
        firstName: nameParts[0] || '',
        middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '',
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
        username: formData.username.trim(),
        email: formData.email.trim(),
        avatar: formData.avatar,
        role: ROLE,
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: seed.email,
        password: formData.password,
        options: {
          // Every profile field goes into user_metadata so it survives the next login.
          data: profileMetadata(seed),
        },
      })

      if (signUpError) return setError(signUpError.message)

      // Cache the profile for this specific user id so the first visit to the
      // app (and any session refresh) paints the right data immediately.
      const newUserId = signUpData?.user?.id
      if (newUserId) persistProfile(seed, newUserId)

      finish()
    } else {
      let loginEmail = formData.email.trim()

      if (loginEmail.includes('@')) {
        if (!isAllowedEmailProvider(loginEmail)) {
          return setError('Only @gmail, @yahoo, or @proton email addresses are supported.')
        }
      } else {
        const { data: fetchedEmail, error: lookupError } = await supabase.rpc('get_email_by_username', {
          user_input: loginEmail,
        })

        if (lookupError || !fetchedEmail) {
          return setError('Username not found. Please check your spelling or sign up.')
        }

        loginEmail = fetchedEmail
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: formData.password,
      })

      if (signInError) {
        return setError(signInError.message)
      }

      finish()
    }
  }

  if (!supabase) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: '#060e0a', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <div style={{ maxWidth: 520, padding: '2rem', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(6, 14, 10, 0.7)' }}>
          <h2 style={{ margin: '0 0 0.75rem', color: '#fff' }}>Sign-in is not configured</h2>
          <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.6 }}>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env</code>, then restart <code>pnpm dev</code>.
          </p>
        </div>
      </div>
    )
  }

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

        /* 1-by-1 Swipeable Avatar Carousel */
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

      {/* Left Inviting Hero Section */}
      <div className="auth-hero">
        <div className="brand-logo">
          <Logo size={75} /> Mercado
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

      {/* Right Form Section */}
      <div className="auth-form-side">
        <div className="auth-card">
          <div className="auth-header-text">
            <h2>{isSignup ? 'Welcome to Mercado!' : 'Whatchu cravin?'}</h2>
            <p>{isSignup ? 'Join Mercado today and explore live market insights.' : 'Jump back into your daily eats.'}</p>
          </div>

          <div className="tab-switcher">
            <button
              type="button"
              className={`tab-btn ${!isSignup ? 'active' : ''}`}
              onClick={() => {
                setIsSignup(false)
                setError('')
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-btn ${isSignup ? 'active' : ''}`}
              onClick={() => {
                setIsSignup(true)
                setError('')
              }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            {/* 1-by-1 Swipeable Profile Picture Carousel (Sign Up Only) */}
            {isSignup && (
              <div className="input-group">
                <div className="input-label-row">
                  <label className="input-label">Choose Your Avatar</label>
                  <span className="swipe-hint">
                    Swipe left/right ({avatarIndex + 1}/{PREDEFINED_AVATARS.length})
                  </span>
                </div>

                <div className="avatar-carousel-box">
                  <div className="avatar-carousel-controls">
                    <button
                      type="button"
                      className="carousel-nav-btn"
                      onClick={() => selectAvatarByIndex(avatarIndex - 1)}
                      aria-label="Previous avatar"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <div
                      className="avatar-viewport"
                      onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
                      onTouchEnd={(e) => handleDragEnd(e.changedTouches[0].clientX)}
                      onMouseDown={(e) => handleDragStart(e.clientX)}
                      onMouseUp={(e) => handleDragEnd(e.clientX)}
                      onMouseLeave={() => {
                        dragStartX.current = null
                      }}
                    >
                      <div
                        className="avatar-track"
                        style={{ transform: `translateX(-${avatarIndex * 100}%)` }}
                      >
                        {PREDEFINED_AVATARS.map((av) => (
                          <div key={av.id} className="avatar-slide">
                            <div className="avatar-circle">
                              <img src={av.url} alt={av.label} draggable="false" />
                            </div>
                            <span className="avatar-slide-name">{av.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="carousel-nav-btn"
                      onClick={() => selectAvatarByIndex(avatarIndex + 1)}
                      aria-label="Next avatar"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {/* Pagination Dots */}
                  <div className="avatar-dots">
                    {PREDEFINED_AVATARS.map((av, idx) => (
                      <button
                        key={av.id}
                        type="button"
                        className={`avatar-dot ${idx === avatarIndex ? 'active' : ''}`}
                        onClick={() => selectAvatarByIndex(idx)}
                        aria-label={`Select ${av.label}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isSignup && (
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <div className="input-field-wrapper">
                  <User className="input-icon" size={18} />
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Juan Dela Cruz"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>
            )}

            {isSignup && (
              <div className="input-group">
                <label className="input-label">Username</label>
                <div className="input-field-wrapper">
                  <User className="input-icon" size={18} />
                  <input
                    type="text"
                    className="input-control"
                    placeholder="juandelacruz99"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="input-group">
              <label className="input-label">{isSignup ? 'Email Address' : 'Email or Username'}</label>
              <div className="input-field-wrapper">
                <Mail className="input-icon" size={18} />
                <input
                  type={isSignup ? 'email' : 'text'}
                  className="input-control"
                  placeholder={isSignup ? 'name@gmail.com' : 'name@gmail.com or username'}
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <div className="input-field-wrapper">
                <Lock className="input-icon" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  placeholder="••••••••"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {!isSignup && (
              <div className="form-actions">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ accentColor: '#10b981' }} /> Remember me
                </label>
                <a href="#" className="forgot-link">Forgot password?</a>
              </div>
            )}

            <button type="submit" className="submit-btn" style={{ marginTop: isSignup ? '1.25rem' : '0' }}>
              {isSignup ? 'Get Started' : 'Enter Dashboard'} <ArrowRight size={18} />
            </button>

            <div className="oauth-divider">or</div>

            <button
              type="button"
              className="google-btn"
              onClick={signInWithGoogle}
              disabled={googleLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}