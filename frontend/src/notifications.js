// Buying-alert notifications.
//
// Alerts are derived from the forecast (see alerts.js), but their read state
// (new / done / deleted) belongs to the device and must survive reloads and
// navigation. This module keeps a tiny external store persisted to
// localStorage, plus the sound that plays when a new alert arrives.
import { useEffect, useSyncExternalStore } from 'react'

const KEY = 'mercado.notifications'

export const CATEGORIES = [
  { id: 'cereals', label: 'cereals and tubers' },
  { id: 'vegetables', label: 'vegetable and fruits' },
  { id: 'meat', label: 'meat, fish, and eggs' },
  { id: 'pulses', label: 'pulses and nuts' },
  { id: 'oils', label: 'oil and fats' },
  { id: 'misc', label: 'miscellaneous food' },
]

const GROUP_CATEGORY = {
  Grains: 'cereals',
  'Roots & Tubers': 'cereals',
  'Vegetables & Fruit': 'vegetables',
  'Meat & Poultry': 'meat',
  Fish: 'meat',
  Seafood: 'meat',
  'Pulses & Nuts': 'pulses',
  'Oils & Fats': 'oils',
  'Sugar & Sweeteners': 'misc',
}

export function categoryOf(commodity) {
  return GROUP_CATEGORY[commodity?.group] || 'misc'
}

export function categoryLabel(id) {
  const found = CATEGORIES.find((c) => c.id === id)
  return found ? found.label : id
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let cache = read()
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn()
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* private mode */ }
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const snapshot = () => cache

// Keep multiple tabs in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    cache = read()
    emit()
  })
}

// ---- sound -----------------------------------------------------------------
let audioCtx = null

// A short two-note chime, synthesized so there is no audio asset to ship.
export function playChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    audioCtx = audioCtx || new AC()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const now = audioCtx.currentTime
    const notes = [
      { at: 0, freq: 880 },
      { at: 0.14, freq: 1174.66 },
    ]
    for (const { at, freq } of notes) {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + at)
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.28)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.3)
    }
  } catch { /* audio not available or blocked */ }
}

// ---- sync forecasts into the notification list -----------------------------
// One record per commodity + signal. Re-syncing (different horizon, province or
// a refreshed forecast) updates the wording in place instead of duplicating it.
export function syncNotifications(alerts, commodityBy) {
  if (!alerts || !alerts.length) return
  const byId = new Map(cache.map((n) => [n.id, n]))
  let changed = false
  let added = 0

  for (const a of alerts) {
    const id = `${a.commodity}:${a.signal}`
    const c = commodityBy?.[a.commodity]
    const existing = byId.get(id)
    if (!existing) {
      byId.set(id, {
        id,
        commodity: a.commodity,
        signal: a.signal,
        change: a.change,
        text: a.text,
        icon: c?.icon || '🛒',
        category: categoryOf(c),
        createdAt: Date.now(),
        status: 'new',
      })
      changed = true
      added += 1
    } else if (existing.text !== a.text || existing.change !== a.change) {
      byId.set(id, { ...existing, text: a.text, change: a.change })
      changed = true
    }
  }

  if (!changed) return
  cache = [...byId.values()]
  persist()
  emit()
  if (added > 0) playChime()
}

export function setNotificationStatus(ids, status) {
  if (!ids.length) return
  const wanted = new Set(ids)
  cache = cache.map((n) => (wanted.has(n.id) ? { ...n, status } : n))
  persist()
  emit()
}

export function removeNotifications(ids) {
  if (!ids.length) return
  const wanted = new Set(ids)
  cache = cache.filter((n) => !wanted.has(n.id))
  persist()
  emit()
}

// ---- hook ------------------------------------------------------------------
export function useNotificationList(alerts, commodityBy) {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    syncNotifications(alerts, commodityBy)
  }, [alerts, commodityBy])
  return list
}
