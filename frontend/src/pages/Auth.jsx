import { useState } from 'react'
import { useApp } from '../state'
import { Logo } from '../components/Icons'
import { Sprout, TrendingUp, Handshake, ArrowRight, Lock, Mail, User, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const { nav } = useApp()
  const [isSignup, setIsSignup] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({ name: '', username: '', email: '', password: '' })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (isSignup) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { 
            full_name: formData.name,
            username: formData.username // Saves username to Supabase
          }
        }
      })
      
      if (signUpError) return setError(signUpError.message)
      nav('board')
      
    } else {
      let loginEmail = formData.email

      // If the input doesn't have an '@', treat it as a username and look it up
      if (!loginEmail.includes('@')) {
        const { data: fetchedEmail, error: lookupError } = await supabase.rpc('get_email_by_username', { 
          user_input: loginEmail 
        })

        if (lookupError || !fetchedEmail) {
          return setError('Username not found. Please check your spelling or sign up.')
        }
        
        loginEmail = fetchedEmail // Swap the username for the real email
      }

      // Real Login Validation via Supabase
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: formData.password,
      })
      
      if (signInError) {
        return setError(signInError.message)
      }
      
      nav('board')
    }
  }

  return (
    <div className="auth-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .auth-content {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          width: 100%;
          max-width: 1400px; /* Limits width on ultra-wide screens */
          min-height: 100vh;
          margin: 0 auto;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        .brand-section {
          display: flex;
          flex-direction: column;
          justify-content: center !important; 
          align-items: flex-start;
          padding: 4rem 10% !important; /* Pushes text away from the left edge */
          border: none !important;
          background: transparent !important;
        }

        .login-section {
          margin: auto; /* This forces the form to the absolute center of its grid cell */
          width: 100%;
          max-width: 440px; 
          background: rgba(6, 14, 10, 0.4) !important;
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          padding: 3rem;
        }

        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #060e0a;
          /* Modern Grid Background */
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          position: relative;
          overflow: hidden;
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
        }

        .auth-form-side {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          position: relative;
          z-index: 1;
          background: rgba(6, 14, 10, 0.7);
          backdrop-filter: blur(20px);
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
          max-width: 400px;
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
          margin: 0 0 2rem 0;
        }

        .tab-switcher {
          display: flex;
          background: rgba(255, 255, 255, 0.03);
          padding: 4px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 2rem;
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

        .input-group {
          margin-bottom: 1.25rem;
        }

        .input-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #cbd5e1;
          margin-bottom: 0.5rem;
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
          padding: 0.85rem 2.75rem 0.85rem 2.75rem;
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

        @media (max-width: 900px) {
          .auth-content {
            grid-template-columns: 1fr !important;
          }
          .brand-section {
            padding: 4rem 2rem 2rem 2rem !important;
          }
        }
      `}</style>

      {/* Left Inviting Hero Section */}
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

      {/* Right Form Section */}
      <div className="auth-form-side">
        <div className="auth-card">
          
          <div className="auth-header-text">
            <h2>{isSignup ? 'Welcome to Mercado!' : 'Whatchu cravin?'}</h2>
            <p>{isSignup ? 'Join Mercado today and explore live market insights.' : 'Jump back into your daily eats.'}</p>
          </div>

          <div className="tab-switcher">
            <button className={`tab-btn ${!isSignup ? 'active' : ''}`} onClick={() => setIsSignup(false)}>Sign In</button>
            <button className={`tab-btn ${isSignup ? 'active' : ''}`} onClick={() => setIsSignup(true)}>Sign Up</button>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {error}
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
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
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
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                  />
                </div>
              </div>
            )}

            <div className="input-group">
              <label className="input-label">{isSignup ? 'Email Address' : 'Email or Username'}</label>
              <div className="input-field-wrapper">
                <Mail className="input-icon" size={18} />
                <input 
                  type={isSignup ? "email" : "text"} 
                  className="input-control" 
                  placeholder={isSignup ? "name@gmail.com" : "name@gmail.com or username"} 
                  required 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
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
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
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

            <button type="submit" className="submit-btn" style={{ marginTop: isSignup ? '1.5rem' : '0' }}>
              {isSignup ? 'Get Started' : 'Enter Dashboard'} <ArrowRight size={18} />
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}