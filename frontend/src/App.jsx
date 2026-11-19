import { Component, useEffect, useState } from 'react'
import { AppProvider, useApp } from './state'
import { ErrorBox, Training } from './components/Common'
import { supabase } from './supabaseClient'
import Board from './pages/Board'
import Detail from './pages/Detail'
import MapPage from './pages/MapPage'
import Planner from './pages/Planner'
import Profile from './pages/Profile'
import Notifications from './pages/Notifications'
import Auth from './pages/Auth'
import Layout from './components/Layout'

// Dev-only escape hatch for design work without Supabase credentials.
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === '1'

// A render error blanks only the routed page; the Layout shell stays up. The route key remounts it on navigation.
class PageBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <PageFailed /> : this.props.children
  }
}

function PageFailed() {
  const { t } = useApp()
  return <div className="errorbox" role="alert"><b>{t('common.error')}</b></div>
}

function AppRouter() {
  const { route, nav, meta, metaError, loadMeta, t } = useApp()
  const [session, setSession] = useState(DEV_BYPASS_AUTH ? { dev: true } : null)
  const [checking, setChecking] = useState(!!supabase && !DEV_BYPASS_AUTH)

  useEffect(() => {
    if (!supabase || DEV_BYPASS_AUTH) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session)
        setChecking(false)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) {
        setSession(s)
        setChecking(false)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (checking || DEV_BYPASS_AUTH) return
    if (!session && route.page !== 'auth') nav('auth')
    if (session && route.page === 'auth') nav('board')
  }, [checking, session, route.page, nav])

  if (checking) return <Training />
  if (!session) return <Auth onLogin={() => nav('board')} />
  if (route.page === 'auth' && !DEV_BYPASS_AUTH) return <Auth onLogin={() => nav('board')} />

  let page = null
  if (meta) {
    if (route.page === 'commodity') page = <Detail key={route.arg} id={route.arg} />
    else if (route.page === 'map') page = <MapPage />
    else if (route.page === 'planner') page = <Planner />
    else if (route.page === 'profile') page = <Profile />
    else if (route.page === 'notifications') page = <Notifications key={route.arg || 'all'} />
    else page = <Board />
  }

  return (
    <Layout>
      {metaError && <ErrorBox error={metaError} retry={loadMeta} />}
      {!meta && !metaError && <p className="muted">{t('common.loading')}</p>}
      <PageBoundary key={route.page + '/' + (route.arg ?? '')}>{page}</PageBoundary>
    </Layout>
  )
}

export default function App() {
  return <AppProvider><AppRouter /></AppProvider>
}
