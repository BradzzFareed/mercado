// Saved profile data for the profile page + drawer card.
//
// Persisted in localStorage for now. To move this to the backend later, swap the
// body of loadProfile()/persistProfile() for a GET/PUT to /api/v1/profile (or
// supabase.auth.updateUser({ data: profile })); every reader uses this module so
// the shape below is the only contract.

export const ROLE = 'Customer'

export const DEFAULT_PROFILE = {
  firstName: '',
  middleName: '',
  lastName: '',
  age: '',
  gender: 'N/A',
  birthday: '',
  address: '',
  provinceId: '',
  provinceName: '',
  regionName: '',
  email: '',
  about: '',
  avatar: 'avatar-1',
}

const KEY = 'mercado.profile'

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_PROFILE }
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

export function persistProfile(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)) } catch { /* private mode */ }
  return profile
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
  else if (!/^[^\s@]+@(gmail|yahoo)\.com$/i.test(p.email.trim())) errors.email = 'Use an @gmail.com or @yahoo.com address.'
  return errors
}
