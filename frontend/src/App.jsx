import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state'
import { ErrorBox, Training } from './components/Common'
import { supabase } from './supabaseClient'
import Board from './pages/Board'
import Detail from './pages/Detail'
import MapPage from './pages/MapPage'
import Planner from './pages/Planner'
import WhatIf from './pages/WhatIf'
import ModelLab from './pages/ModelLab'
import Pipeline from './pages/Pipeline'
import Auth from './pages/Auth'
import Layout from './components/Layout'

function AppRouter() {
  const { route, nav, meta, metaError, loadMeta, t } = useApp()
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
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
    if (checking) return
    if (!session && route.page !== 'auth') nav('auth')
    if (session && route.page === 'auth') nav('board')
  }, [checking, session, route.page, nav])

  if (checking) return <Training place="Mercado" />
  if (!session || route.page === 'auth') return <Auth onLogin={() => nav('board')} />

  let page = null
  if (meta) {
    if (route.page === 'commodity') page = <Detail key={route.arg} id={route.arg} />
    else if (route.page === 'map') page = <MapPage />
    else if (route.page === 'planner') page = <Planner />
    else if (route.page === 'whatif') page = <WhatIf />
    else if (route.page === 'lab') page = <ModelLab />
    else if (route.page === 'pipeline') page = <Pipeline />
    else page = <Board />
  }

  return (
    <Layout>
      {metaError && <ErrorBox error={metaError} retry={loadMeta} />}
      {!meta && !metaError && <p className="muted">{t('common.loading')}</p>}
      {page}
    </Layout>
  )
}

export default function App() {
  return <AppProvider><AppRouter /></AppProvider>
}
