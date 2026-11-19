// Saved profile data for the profile page + drawer card.
//
// The profile is kept in two places:
//   1. Supabase user_metadata (source of truth, survives across devices)
//   2. localStorage, one key per user id (instant paint before auth settles)
//
// `profileFromUser()` reads metadata into the profile shape, `profileMetadata()`
// writes the whole shape back into metadata. Every reader uses this module so the
// shape below is the only contract.

import { avatarDef } from './avatars'

export const ROLE = 'Customer'

export const DEFAULT_PROFILE = {
  username: '',
  firstName: '',
  middleName: '',
  lastName: '',
  age: '',
  gender: 'Prefer not to say',
  birthday: '',
  address: '',
  provinceId: '',
  provinceName: '',
  regionName: '',
  email: '',
  about: '',
  avatar: 'avatar-1',
  role: ROLE,
}

const KEY = 'mercado.profile'
const storageKey = (userId) => (userId ? `${KEY}.${userId}` : KEY)

export function loadProfile(userId = '') {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return { ...DEFAULT_PROFILE }
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

export function persistProfile(profile, userId = '') {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(profile)) } catch { /* private mode */ }
  return profile
}

// ---- avatars: metadata may hold an id ('avatar-3') or an old URL ('/avatars/avatar-3.png')
export function normalizeAvatar(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = raw.match(/\/avatars\/(avatar-\d+)\.png$/i)
  return match ? match[1] : raw
}

export function avatarUrl(value) {
  const id = normalizeAvatar(value)
  if (!id) return ''
  if (id.startsWith('/') || /^https?:/i.test(id)) return id
  return avatarDef(id).src
}

const isImageValue = (value) => value.startsWith('/') || /^https?:/i.test(value)

// ---- shape <-> Supabase user_metadata ----

// Turn a Supabase auth user into profile fields. Unknown/blank metadata keys are
// skipped so a merge never blanks out data the user already saved locally.
export function profileFromUser(user) {
  if (!user) return {}
  const meta = user.user_metadata || {}
  const out = {}

  const put = (key, value) => {
    if (value === undefined || value === null) return
    const text = String(value).trim()
    if (text) out[key] = text
  }

  const full = String(meta.full_name || '').trim()
  const parts = full.split(/\s+/).filter(Boolean)

  let firstName = String(meta.first_name || '').trim()
  let middleName = String(meta.middle_name || '').trim()
  let lastName = String(meta.last_name || '').trim()

  // Older accounts only stored `full_name`: split it into the three parts.
  if (!firstName && parts.length) {
    firstName = parts[0]
    if (!lastName) lastName = parts.length > 1 ? parts[parts.length - 1] : ''
    if (!middleName && parts.length > 2) middleName = parts.slice(1, -1).join(' ')
  }

  put('firstName', firstName)
  put('middleName', middleName)
  put('lastName', lastName)
  put('username', meta.username || meta.preferred_username)
  put('age', meta.age)
  put('gender', meta.gender)
  put('birthday', meta.birthday)
  put('address', meta.address)
  put('provinceId', meta.province_id)
  put('provinceName', meta.province_name)
  put('regionName', meta.region_name)
  put('about', meta.about)
  put('email', meta.email || user.email)
  put('role', meta.role)

  const avatar = normalizeAvatar(meta.avatar || meta.avatar_url || meta.picture)
  if (avatar) out.avatar = avatar

  return out
}

// Everything the profile page and drawer know about the user, ready for
// supabase.auth.signUp({ options: { data } }) / updateUser({ data }).
export function profileMetadata(profile = {}) {
  const avatar = normalizeAvatar(profile.avatar)
  const age = profile.age === 0 ? '0' : String(profile.age || '').trim()

  return {
    full_name: fullName(profile),
    first_name: (profile.firstName || '').trim(),
    middle_name: (profile.middleName || '').trim(),
    last_name: (profile.lastName || '').trim(),
    username: (profile.username || '').trim(),
    role: profile.role || ROLE,
    avatar,
    avatar_url: isImageValue(avatar) ? avatar : avatarUrl(avatar),
    about: (profile.about || '').trim(),
    age,
    gender: profile.gender || 'Prefer not to say',
    birthday: profile.birthday || '',
    address: (profile.address || '').trim(),
    province_id: profile.provinceId || '',
    province_name: profile.provinceName || '',
    region_name: profile.regionName || '',
    email: (profile.email || '').trim(),
  }
}

// Metadata wins (it is the cross-device source of truth); local fields fill in
// anything the metadata does not carry yet.
export function mergeProfile(local = {}, remote = {}) {
  const merged = { ...DEFAULT_PROFILE, ...remote }
  const filled = (value) => value !== undefined && value !== null && String(value).trim() !== ''
  for (const key of Object.keys(DEFAULT_PROFILE)) {
    if (!filled(remote[key]) && filled(local[key])) merged[key] = local[key]
  }
  return merged
}

// Name parts are rendered in the drawer as "First Last" (no middle name).
export function displayName(profile) {
  const parts = [profile.firstName, profile.lastName].map((s) => (s || '').trim()).filter(Boolean)
  return parts.join(' ')
}

export function fullName(profile) {
  return [profile.firstName, profile.middleName, profile.lastName]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ')
}

export function addressLine(profile) {
  return [profile.provinceName, profile.regionName].map((s) => (s || '').trim()).filter(Boolean).join(', ')
}

// "CALABARZON" -> "Calabarzon"; leaves already-cased names alone.
export function titleCaseRegion(name) {
  if (!name) return ''
  if (name !== name.toUpperCase()) return name
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

// ---- input sanitizers: used on change so invalid keys never land in state ----
const NAME_ALLOWED = /[^\p{L}\s]/gu

export function sanitizeName(value) {
  const clean = value.replace(NAME_ALLOWED, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '')
  return { value: clean, rejected: clean !== value }
}

export function sanitizeAge(value) {
  // Reject the keystroke instead of cleaning it, so "2.5" never becomes "25".
  if (!/^\d*$/.test(value)) return { value: null, rejected: true }
  return { value: value.slice(0, 3), rejected: value.length > 3 }
}

export function sanitizeAddress(value) {
  const clean = value.replace(/\s{2,}/g, ' ').replace(/^\s+/, '')
  return { value: clean, rejected: clean !== value }
}

// ---- validators: return a message, or '' when the field is fine ----
const LETTERS = /^\p{L}+$/u

export function validateProfile(p) {
  const errors = {}
  if (!p.firstName.trim()) errors.firstName = 'First name is required.'
  else if (!LETTERS.test(p.firstName.trim())) errors.firstName = 'Letters only, no numbers or special characters.'
  if (p.middleName.trim() && !LETTERS.test(p.middleName.trim())) errors.middleName = 'Letters only.'
  if (p.lastName.trim() && !LETTERS.test(p.lastName.trim())) errors.lastName = 'Letters only.'
  if (!p.age) errors.age = 'Age is required.'
  else if (!/^\d+$/.test(String(p.age)) || Number(p.age) < 1 || Number(p.age) > 120) errors.age = 'Whole numbers from 1 to 120 only.'
  if (p.birthday) {
    const b = new Date(p.birthday + 'T00:00:00')
    if (Number.isNaN(b.getTime()) || b > new Date()) errors.birthday = 'Pick a date in the past.'
  }
  if (/\s{2,}/.test(p.address)) errors.address = 'No double spacing.'
  if (!p.email.trim()) errors.email = 'Email is required.'
  else if (!/^[^\s@]+@(gmail|yahoo)\.com$/i.test(p.email.trim()) && !/^[^\s@]+@proton\.(com|me)$/i.test(p.email.trim())) {
    errors.email = 'Use an @gmail.com, @yahoo.com, or @proton address.'
  }
  return errors
}
