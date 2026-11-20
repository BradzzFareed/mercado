import { useState } from 'react'
import AuthShell from '../components/AuthShell'
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { supabase } from '../supabaseClient'

export default function ResetPassword({ email, hasSession, onComplete, onCancel }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [error, setError] = useState('')

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      return setError('Password must be at least 6 characters.')
    }
    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match.')
    }

    setUpdatingPassword(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    setUpdatingPassword(false)

    if (updateError) {
      return setError(updateError.message)
    }

    setNewPassword('')
    setConfirmPassword('')
    onComplete?.()
  }

  return (
    <AuthShell>
      {!hasSession ? (
        <>
          <div className="auth-header-text">
            <h2>Reset link expired</h2>
            <p>This password reset link is invalid or has expired. Request a new one from the sign-in page.</p>
          </div>

          <button type="button" className="submit-btn" onClick={onCancel}>
            Back to sign in <ArrowRight size={18} />
          </button>
        </>
      ) : (
        <>
          <div className="auth-header-text">
            <h2>Set a new password</h2>
            <p>
              Enter and confirm your new password{email ? ` for ${email}` : ''} to finish resetting your account.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">New Password</label>
              <div className="input-field-wrapper">
                <Lock className="input-icon" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  placeholder="At least 6 characters"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle new password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Confirm New Password</label>
              <div className="input-field-wrapper">
                <Lock className="input-icon" size={18} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="input-control"
                  placeholder="Re-enter your new password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={updatingPassword}>
              {updatingPassword ? 'Updating Password...' : 'Update Password'} <ArrowRight size={18} />
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                className="forgot-link"
                onClick={onCancel}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  )
}
