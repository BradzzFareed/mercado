/* eslint-disable react-refresh/only-export-components -- this module exports the app context and data hooks */
/* eslint-disable react-hooks/set-state-in-effect -- the fetch hooks intentionally reset state when the path changes */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { clearCache, get, invalidate } from './api'
import { translate } from './i18n'
import { store, save } from './util'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

// Poll cadence for detecting external data changes (scheduler or other clients).
const META_POLL_MS = 60_000

// ---- hash router: #/board, #/commodity/rice, #/map, #/planner, #/whatif, #/pipeline
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
  const [dataVersion, setDataVersion] = useState(0)
  // Latest data_version the app has applied; a ref so polling never re-renders or restarts itself.
  const seenDataVersion = useRef(null)
  const metaLoadInFlight = useRef(false)

  // Stable identity so consumers can safely put bumpData in dependency arrays.
  const bumpData = useCallback(() => {
    clearCache()
    setDataVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const loadMeta = useCallback(() => {
    setMetaError(null)
    metaLoadInFlight.current = true
    get('/api/v1/meta', { fresh: true })
      .then((m) => {
        if (m?.data_version) seenDataVersion.current = m.data_version
        setMeta(m)
      })
      .catch((e) => setMetaError(e.message))
      .finally(() => { metaLoadInFlight.current = false })
  }, [])
  useEffect(loadMeta, [loadMeta, dataVersion])

  // Background poll: bump dataVersion (which flushes the cache) when /meta's data_version
  // changes outside this tab, e.g. a scheduler run or a pipeline run from another client.
  useEffect(() => {
    let timer = null
    let polling = false

    const check = () => {
      if (polling || metaLoadInFlight.current || document.visibilityState === 'hidden') return
      polling = true
      get('/api/v1/meta', { fresh: true })
        .then((m) => {
          const v = m?.data_version
          if (!v || v === seenDataVersion.current) return
          seenDataVersion.current = v
          bumpData()
        }, (e) => console.debug('Mercado: data_version poll failed', e.message))
        .finally(() => { polling = false })
    }

    const start = () => { if (timer === null) timer = window.setInterval(check, META_POLL_MS) }
    const stop = () => { if (timer !== null) { window.clearInterval(timer); timer = null } }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { check(); start() } else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [bumpData])

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

  const prov = useMemo(() => meta && (meta.provinces.find((p) => p.id === province) || meta.provinces[0]), [meta, province])
  const commodityBy = useMemo(() => (meta ? Object.fromEntries(meta.commodities.map((c) => [c.id, c])) : {}), [meta])

  const value = {
    route, nav, meta, metaError, loadMeta, province: prov ? prov.id : province, prov, setProvince, horizon, setHorizon,
    lang, setLang, theme, setTheme, t, commodityBy, bumpData, dataVersion,
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
    get(path).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error: error.message, loading: false }),
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps])
  return { ...state, reload: () => { invalidate(path); setTick((x) => x + 1) } }
}
