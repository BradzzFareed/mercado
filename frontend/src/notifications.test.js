import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const KEY = 'mercado.notifications'

let store

const load = () => {
  vi.resetModules()
  return import('./notifications')
}

const stored = () => JSON.parse(store.get(KEY))

const alert = (commodity, signal, text = `${commodity} ${signal}`, change = 5) => ({ commodity, signal, change, text })

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('categoryOf', () => {
  it.each([
    ['Grains', 'cereals'],
    ['Roots & Tubers', 'cereals'],
    ['Vegetables & Fruit', 'vegetables'],
    ['Meat & Poultry', 'meat'],
    ['Fish', 'meat'],
    ['Seafood', 'meat'],
    ['Pulses & Nuts', 'pulses'],
    ['Oils & Fats', 'oils'],
    ['Sugar & Sweeteners', 'misc'],
  ])('maps the %s group to %s', async (group, category) => {
    const { categoryOf } = await load()
    expect(categoryOf({ group })).toBe(category)
  })

  it('falls back to misc for an unknown group', async () => {
    const { categoryOf } = await load()
    expect(categoryOf({ group: 'Unheard of' })).toBe('misc')
  })

  it('falls back to misc for an undefined or null commodity', async () => {
    const { categoryOf } = await load()
    expect(categoryOf(undefined)).toBe('misc')
    expect(categoryOf(null)).toBe('misc')
  })
})

describe('categoryLabel', () => {
  it('returns the label for a known category id', async () => {
    const { categoryLabel } = await load()
    expect(categoryLabel('cereals')).toBe('cereals and tubers')
    expect(categoryLabel('misc')).toBe('miscellaneous food')
  })

  it('returns the id itself for an unknown category', async () => {
    const { categoryLabel } = await load()
    expect(categoryLabel('nope')).toBe('nope')
  })
})

describe('syncNotifications', () => {
  it('writes new alerts to mercado.notifications with the commodity icon and category', async () => {
    const { syncNotifications } = await load()
    syncNotifications([alert('rice', 'surge')], { rice: { icon: '🌾', group: 'Grains' } })
    const [record] = stored()
    expect(store.has(KEY)).toBe(true)
    expect(record).toMatchObject({ id: 'rice:surge', commodity: 'rice', signal: 'surge', icon: '🌾', category: 'cereals', status: 'new' })
  })

  it('uses the default icon and misc category for an unknown commodity', async () => {
    const { syncNotifications } = await load()
    syncNotifications([alert('mystery', 'dip')], {})
    expect(stored()[0]).toMatchObject({ icon: '🛒', category: 'misc' })
  })

  it('dedupes by commodity and signal, updating the wording in place', async () => {
    const { syncNotifications } = await load()
    syncNotifications([alert('rice', 'surge', 'Rice may rise')], {})
    syncNotifications([alert('rice', 'surge', 'Rice may rise more', 9)], {})
    const records = stored()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ text: 'Rice may rise more', change: 9 })
  })

  it('keeps a separate record for the same commodity with a different signal', async () => {
    const { syncNotifications } = await load()
    syncNotifications([alert('rice', 'surge'), alert('rice', 'dip')], {})
    expect(stored().map((n) => n.id).sort()).toEqual(['rice:dip', 'rice:surge'])
  })
})

describe('setNotificationStatus', () => {
  it('persists a status change for the given ids', async () => {
    const { syncNotifications, setNotificationStatus } = await load()
    syncNotifications([alert('rice', 'surge'), alert('pork', 'dip')], {})
    setNotificationStatus(['rice:surge'], 'done')
    const byId = Object.fromEntries(stored().map((n) => [n.id, n]))
    expect(byId['rice:surge'].status).toBe('done')
    expect(byId['pork:dip'].status).toBe('new')
  })
})

describe('removeNotifications', () => {
  it('removes the given ids from storage', async () => {
    const { syncNotifications, removeNotifications } = await load()
    syncNotifications([alert('rice', 'surge'), alert('pork', 'dip')], {})
    removeNotifications(['rice:surge'])
    expect(stored().map((n) => n.id)).toEqual(['pork:dip'])
  })
})

describe('persistence across imports', () => {
  it('migrates the old deleted status to archived', async () => {
    store.set(KEY, JSON.stringify([
      { id: 'rice:surge', commodity: 'rice', signal: 'surge', status: 'deleted' },
    ]))
    const { syncNotifications, setNotificationStatus } = await load()
    syncNotifications([alert('pork', 'dip')], {})
    setNotificationStatus(['pork:dip'], 'done')
    expect(stored().find((n) => n.id === 'rice:surge').status).toBe('archived')
  })

  it('re-reads persisted records on a fresh import', async () => {
    store.set(KEY, JSON.stringify([
      { id: 'rice:surge', commodity: 'rice', signal: 'surge', status: 'new' },
      { id: 'pork:dip', commodity: 'pork', signal: 'dip', status: 'done' },
    ]))
    const { removeNotifications } = await load()
    removeNotifications(['rice:surge'])
    expect(stored()).toEqual([{ id: 'pork:dip', commodity: 'pork', signal: 'dip', status: 'done' }])
  })

  it('starts empty when the stored value is not an array', async () => {
    store.set(KEY, JSON.stringify({ not: 'a list' }))
    const { removeNotifications, syncNotifications } = await load()
    removeNotifications(['anything'])
    syncNotifications([alert('rice', 'surge')], {})
    expect(stored().map((n) => n.id)).toEqual(['rice:surge'])
  })
})
