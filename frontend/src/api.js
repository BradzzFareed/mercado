// Thin axios layer + tiny in-memory cache. Backend: FastAPI on :8000 (proxied by Vite in dev).
import axios from 'axios'

const BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '')
const cache = new Map()

const url = (path) => BASE + path

function message(e) {
  return e?.response?.data?.error || e?.response?.data?.detail || e?.message || 'Request failed'
}

export async function get(path, { fresh = false } = {}) {
  if (!fresh && cache.has(path)) return cache.get(path)
  const p = axios.get(url(path)).then((r) => r.data, (e) => {
    throw new Error(message(e), { cause: e })
  })
  cache.set(path, p)
  p.catch(() => cache.delete(path))
  return p
}

export async function post(path, body) {
  try {
    const r = await axios.post(url(path), body || {})
    return r.data
  } catch (e) {
    throw new Error(message(e), { cause: e })
  }
}

export const clearCache = () => cache.clear()
