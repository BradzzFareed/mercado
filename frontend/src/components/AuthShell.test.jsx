import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AuthShell from './AuthShell'

const app = vi.hoisted(() => ({ value: null }))
vi.mock('../state', () => ({ useApp: () => app.value }))

describe('AuthShell theme toggle', () => {
  it('renders without AppProvider and disables the toggle', () => {
    app.value = null
    const html = renderToStaticMarkup(
      <AuthShell>
        <p>Child content</p>
      </AuthShell>
    )
    expect(html).toContain('Child content')
    expect(html).toContain('auth-theme-toggle')
    expect(html).toContain('disabled=""')
  })

  it('renders light theme when theme is light', () => {
    app.value = { theme: 'light', setTheme: () => {} }
    const html = renderToStaticMarkup(
      <AuthShell>
        <p>Child content</p>
      </AuthShell>
    )
    expect(html).toContain('Child content')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('Switch to dark mode')
    expect(html).toContain('#ecfdf5')
    expect(html).not.toContain('disabled=""')
  })

  it('renders dark theme when theme is dark', () => {
    app.value = { theme: 'dark', setTheme: () => {} }
    const html = renderToStaticMarkup(
      <AuthShell>
        <p>Child content</p>
      </AuthShell>
    )
    expect(html).toContain('Child content')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('Switch to light mode')
    expect(html).toContain('#060e0a')
    expect(html).not.toContain('disabled=""')
  })
})
