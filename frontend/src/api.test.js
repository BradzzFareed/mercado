// Tests for api.js' in-memory GET promise cache. axios is mocked so the real
// module (and its cache + eviction logic) is exercised for real.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { get, invalidate, clearCache } from './api'

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

beforeEach(() => {
  clearCache()
  axios.get.mockReset()
})

describe('api.get cache', () => {
  it('dedupes repeated reads into one request with shared results', async () => {
    axios.get.mockResolvedValue({ data: { value: 1 } })

    const a = get('/same')
    const b = get('/same')
    const [ra, rb] = await Promise.all([a, b])

    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(ra).toBe(rb)      // same resolved payload: both callers share the cache entry
    expect(a).not.toBe(b)    // get is async, so wrappers differ; identity is not the contract
  })

  it('fresh: true issues a new request and replaces the entry', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { value: 1 } })
      .mockResolvedValueOnce({ data: { value: 2 } })

    expect(await get('/fresh')).toEqual({ value: 1 })
    expect(await get('/fresh')).toEqual({ value: 1 })   // still cached, no second call
    expect(await get('/fresh', { fresh: true })).toEqual({ value: 2 })
    expect(await get('/fresh')).toEqual({ value: 2 })   // fresh result is now cached
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('evicts a rejected request so the next get retries', async () => {
    axios.get
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: { value: 'recovered' } })

    await expect(get('/flaky')).rejects.toThrow('boom')
    expect(await get('/flaky')).toEqual({ value: 'recovered' })
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('a late failure does not evict a newer successful entry', async () => {
    let failStale
    axios.get
      .mockReturnValueOnce(new Promise((_, reject) => { failStale = reject }))
      .mockResolvedValueOnce({ data: { value: 'newest' } })

    const stale = get('/race')
    stale.catch(() => {})                       // the deliberate late rejection must stay handled
    await get('/race', { fresh: true })         // replaces the cached promise with a good one

    failStale(new Error('too late'))
    await Promise.resolve()                     // let the eviction catch handler run

    expect(await get('/race')).toEqual({ value: 'newest' })   // newer entry survived
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('invalidate removes one key; clearCache removes all', async () => {
    axios.get
      .mockResolvedValue({ data: { ok: true } })

    await get('/a')
    await get('/b')
    expect(axios.get).toHaveBeenCalledTimes(2)

    invalidate('/a')
    await get('/a')                             // refetched
    await get('/b')                             // still cached
    expect(axios.get).toHaveBeenCalledTimes(3)

    clearCache()
    await get('/a')
    await get('/b')
    expect(axios.get).toHaveBeenCalledTimes(5)
  })
})
