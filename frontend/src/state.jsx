/* eslint-disable react-refresh/only-export-components -- this module exports the app context and data hooks */
/* eslint-disable react-hooks/set-state-in-effect -- the fetch hooks intentionally reset state when the path changes */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { get } from './api'
import { translate } from './i18n'
import { store, save } from './util'
import { DEFAULT_PROFILE, loadProfile, mergeProfile, persistProfile, profileFromUser } from './profile'
import { supabase } from './supabaseClient'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

// ---- hash router: #/board, #/commodity/rice, #/map, #/planner
function parseHash() {
  const h = (window.location.hash || '#/board').replace(/^#\/?/, '')
  const [page, arg] = h.split('/')
  return { page: page || 'board', arg }
}

export function AppProvider({ children }) {
  const [route, setRoute] = useState(parseHash())
  const [meta, setMeta] = useState(null)
  const [metaError, setMetaError] = useState(null)
  const [province, setProvince] = useState(store('mercado.province', 'ncr'))
  const [horizon, setHorizon] = useState(store('mercado.horizon', 14))
  const [lang, setLang] = useState(store('mercado.lang', 'en'))
  const [theme, setTheme] = useState(store('mercado.theme', null))
  const [profile, setProfile] = useState(loadProfile)
  const profileUserId = useRef('')

  // Load the signed-in user's profile: Supabase metadata is the source of truth,
  // the per-user localStorage copy fills any fields metadata does not have yet.
  const applyUser = useCallback((user) => {
    profileUserId.current = user?.id || ''
    if (!user) {
      setProfile({ ...DEFAULT_PROFILE })
      return
    }
    const local = loadProfile(user.id)
    const merged = mergeProfile(local, profileFromUser(user))
    setProfile(merged)
    persistProfile(merged, user.id)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) applyUser(data.session?.user ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) applyUser(session?.user ?? null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [applyUser])

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const loadMeta = useCallback(() => {
    setMetaError(null)
    get('/api/v1/meta', { fresh: true }).then(setMeta).catch((e) => setMetaError(e.message))
  }, [])
  useEffect(loadMeta, [loadMeta])

  useEffect(() => save('mercado.province', province), [province])
  useEffect(() => save('mercado.horizon', horizon), [horizon])
  useEffect(() => { save('mercado.lang', lang); document.documentElement.lang = lang === 'fil' ? 'fil' : 'en' }, [lang])
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme)
    else document.documentElement.removeAttribute('data-theme')
    save('mercado.theme', theme)
  }, [theme])

  const t = useCallback((k, v) => translate(lang, k, v), [lang])
  const nav = useCallback((page, arg) => { window.location.hash = '/' + page + (arg ? '/' + arg : ''); window.scrollTo(0, 0) }, [])
  const updateProfile = useCallback((next) => {
    setProfile((prev) => {
      const merged = { ...prev, ...next }
      return persistProfile(merged, profileUserId.current)
    })
  }, [])

  const prov = useMemo(() => meta && (meta.provinces.find((p) => p.id === province) || meta.provinces[0]), [meta, province])
  const commodityBy = useMemo(() => (meta ? Object.fromEntries(meta.commodities.map((c) => [c.id, c])) : {}), [meta])

  const value = {
    route, nav, meta, metaError, loadMeta, province: prov ? prov.id : province, prov, setProvince, horizon, setHorizon,
    lang, setLang, theme, setTheme, t, commodityBy, profile, updateProfile,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ---- data hook: { data, error, loading, reload }
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    get(path, { fresh: tick > 0 }).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error: error.message, loading: false }),
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps])
  return { ...state, reload: () => setTick((x) => x + 1) }
}
