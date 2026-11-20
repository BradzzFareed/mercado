import { useState, useRef } from 'react'
import { useApp } from '../state'
import AuthShell from '../components/AuthShell'
import {
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
  const [resetMessage, setResetMessage] = useState('')
  const [isResetting, setIsResetting] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    avatar: PREDEFINED_AVATARS[0].id,
  })
  const [error, setError] = useState('')
  const finish = () => (onLogin ? onLogin() : nav('board'))

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setResetMessage('')

    let targetEmail = formData.email.trim()

    if (!targetEmail) {
      return setError('Enter your email address or username first, then click Forgot password?.')
    }

    if (targetEmail.includes('@')) {
      if (!isAllowedEmailProvider(targetEmail)) {
        return setError('Only @gmail, @yahoo, or @proton email addresses are supported.')
      }
    } else {
      const { data: fetchedEmail, error: lookupError } = await supabase.rpc('get_email_by_username', {
        user_input: targetEmail,
      })

      if (lookupError || !fetchedEmail) {
        return setError('Username not found. Please check your spelling or sign up.')
      }

      targetEmail = fetchedEmail
    }

    setIsResetting(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: window.location.origin,
    })
    setIsResetting(false)

    if (resetError) {
      return setError(resetError.message)
    }

    setResetMessage(
      'If an email/password account exists for this account, a password reset link has been sent. If you registered with Google, use "Continue with Google" instead.'
    )
  }

  const signInWithGoogle = async () => {
    setError('')
    setResetMessage('')
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
    setResetMessage('')

    if (isSignup) {
      if (!isAllowedEmailProvider(formData.email)) {
        return setError('Please use a valid @gmail, @yahoo, or @proton email address.')
      }

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
          data: profileMetadata(seed),
        },
      })

      if (signUpError) return setError(signUpError.message)

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
    <AuthShell>
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
            setResetMessage('')
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
            setResetMessage('')
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
          <>
            <div className="form-actions">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: '#10b981' }} /> Remember me
              </label>
              <a
                href="#forgot-password"
                className="forgot-link"
                onClick={handleForgotPassword}
                aria-disabled={isResetting}
              >
                {isResetting ? 'Sending...' : 'Forgot password?'}
              </a>
            </div>

            {resetMessage && (
              <div
                style={{
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                }}
              >
                {resetMessage}
              </div>
            )}
          </>
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
    </AuthShell>
  )
}
