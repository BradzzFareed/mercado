import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ResetPassword from './ResetPassword'

vi.mock('../supabaseClient', () => ({ supabase: {} }))

describe('ResetPassword', () => {
  it('renders the new password form for a valid recovery session', () => {
    const html = renderToStaticMarkup(
      <ResetPassword email="juan@gmail.com" hasSession onComplete={() => {}} onCancel={() => {}} />
    )
    expect(html).toContain('Set a new password')
    expect(html).toContain('juan@gmail.com')
    expect(html).toContain('Update Password')
  })

  it('renders the expired state without a session', () => {
    const html = renderToStaticMarkup(
      <ResetPassword hasSession={false} onComplete={() => {}} onCancel={() => {}} />
    )
    expect(html).toContain('Reset link expired')
    expect(html).not.toContain('Update Password')
  })
})
