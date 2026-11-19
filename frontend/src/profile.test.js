import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROFILE,
  displayName,
  fullName,
  addressLine,
  normalizeAvatar,
  avatarUrl,
  mergeProfile,
  validateProfile,
  sanitizeName,
  sanitizeAge,
  sanitizeAddress,
  profileFromUser,
  profileMetadata,
} from './profile'

const valid = {
  firstName: 'Juan',
  middleName: '',
  lastName: 'Cruz',
  age: '30',
  birthday: '',
  address: 'Quezon City',
  email: 'juan@gmail.com',
}

describe('displayName', () => {
  it('returns an empty string for undefined, null and an empty profile', () => {
    expect(displayName(undefined)).toBe('')
    expect(displayName(null)).toBe('')
    expect(displayName({})).toBe('')
  })

  it('joins first and last name and trims each part', () => {
    expect(displayName({ firstName: ' Juan ', lastName: 'Dela Cruz ' })).toBe('Juan Dela Cruz')
  })

  it('ignores the middle name', () => {
    expect(displayName({ firstName: 'Juan', middleName: 'Santos', lastName: 'Cruz' })).toBe('Juan Cruz')
  })
})

describe('fullName', () => {
  it('includes the middle name when present', () => {
    expect(fullName({ firstName: 'Juan', middleName: 'Santos', lastName: 'Cruz' })).toBe('Juan Santos Cruz')
  })

  it('skips a blank middle name', () => {
    expect(fullName({ firstName: 'Juan', middleName: '  ', lastName: 'Cruz' })).toBe('Juan Cruz')
  })

  it('returns an empty string for null', () => {
    expect(fullName(null)).toBe('')
  })
})

describe('addressLine', () => {
  it('joins province and region', () => {
    expect(addressLine({ provinceName: 'Cebu', regionName: 'Central Visayas' })).toBe('Cebu, Central Visayas')
  })

  it('returns only the part that is present', () => {
    expect(addressLine({ provinceName: 'Cebu' })).toBe('Cebu')
  })

  it('returns an empty string for null', () => {
    expect(addressLine(null)).toBe('')
  })
})

describe('normalizeAvatar', () => {
  it('passes an avatar id through unchanged', () => {
    expect(normalizeAvatar('avatar-3')).toBe('avatar-3')
  })

  it('reduces an old avatar path to its id', () => {
    expect(normalizeAvatar('/avatars/avatar-3.png')).toBe('avatar-3')
  })

  it('returns an empty string for empty or null input', () => {
    expect(normalizeAvatar('')).toBe('')
    expect(normalizeAvatar(null)).toBe('')
  })

  it('keeps a foreign URL as it is', () => {
    expect(normalizeAvatar('https://example.com/me.jpg')).toBe('https://example.com/me.jpg')
  })
})

describe('avatarUrl', () => {
  it('turns an avatar id into a path ending in its image file', () => {
    expect(avatarUrl('avatar-3')).toMatch(/avatars\/avatar-3\.png$/)
  })

  it('returns a URL unchanged', () => {
    expect(avatarUrl('https://example.com/me.jpg')).toBe('https://example.com/me.jpg')
    expect(avatarUrl('/custom/me.png')).toBe('/custom/me.png')
  })

  it('returns an empty string when there is no avatar', () => {
    expect(avatarUrl('')).toBe('')
    expect(avatarUrl(null)).toBe('')
  })
})

describe('mergeProfile', () => {
  it('prefers remote values', () => {
    const merged = mergeProfile({ firstName: 'Local' }, { firstName: 'Remote' })
    expect(merged.firstName).toBe('Remote')
  })

  it('fills blank or missing remote fields from local', () => {
    const merged = mergeProfile(
      { lastName: 'Local', email: 'a@gmail.com' },
      { lastName: '   ' },
    )
    expect(merged.lastName).toBe('Local')
    expect(merged.email).toBe('a@gmail.com')
  })

  it('applies defaults for fields neither side has', () => {
    expect(mergeProfile({}, {})).toEqual(DEFAULT_PROFILE)
    expect(mergeProfile().gender).toBe('Prefer not to say')
  })
})

describe('validateProfile', () => {
  it('accepts a complete valid profile', () => {
    expect(validateProfile(valid)).toEqual({})
  })

  it.each(['juan@gmail.com', 'juan@yahoo.com', 'juan@proton.me', 'juan@proton.com'])('accepts %s', (email) => {
    expect(validateProfile({ ...valid, email })).toEqual({})
  })

  it('rejects other domains', () => {
    expect(validateProfile({ ...valid, email: 'juan@outlook.com' }).email).toBe(
      'Use an @gmail.com, @yahoo.com, or @proton address.',
    )
  })

  it('requires an email', () => {
    expect(validateProfile({ ...valid, email: '' }).email).toBe('Email is required.')
  })

  it('requires a first name and letters only', () => {
    expect(validateProfile({ ...valid, firstName: '' }).firstName).toBe('First name is required.')
    expect(validateProfile({ ...valid, firstName: 'J0hn' }).firstName).toBe(
      'Letters only, no numbers or special characters.',
    )
  })

  it('checks the age bounds', () => {
    expect(validateProfile({ ...valid, age: '' }).age).toBe('Age is required.')
    expect(validateProfile({ ...valid, age: '0' }).age).toBe('Whole numbers from 1 to 120 only.')
    expect(validateProfile({ ...valid, age: '121' }).age).toBe('Whole numbers from 1 to 120 only.')
    expect(validateProfile({ ...valid, age: '120' }).age).toBeUndefined()
  })

  it('rejects double spacing in the address', () => {
    expect(validateProfile({ ...valid, address: 'Quezon  City' }).address).toBe('No double spacing.')
  })

  it('rejects a birthday in the future', () => {
    expect(validateProfile({ ...valid, birthday: '2999-01-01' }).birthday).toBe('Pick a date in the past.')
  })
})

describe('sanitizers', () => {
  it('sanitizeName strips non-letters and collapses spaces', () => {
    expect(sanitizeName('Juan3 Cruz!')).toEqual({ value: 'Juan Cruz', rejected: true })
    expect(sanitizeName('Juan  Cruz')).toEqual({ value: 'Juan Cruz', rejected: true })
    expect(sanitizeName('Juan Cruz')).toEqual({ value: 'Juan Cruz', rejected: false })
  })

  it('sanitizeAge rejects non-digits and caps at three digits', () => {
    expect(sanitizeAge('2.5')).toEqual({ value: null, rejected: true })
    expect(sanitizeAge('25')).toEqual({ value: '25', rejected: false })
    expect(sanitizeAge('1234')).toEqual({ value: '123', rejected: true })
  })

  it('sanitizeAddress collapses double spaces and trims the start', () => {
    expect(sanitizeAddress('Quezon   City')).toEqual({ value: 'Quezon City', rejected: true })
    expect(sanitizeAddress(' Quezon')).toEqual({ value: 'Quezon', rejected: true })
    expect(sanitizeAddress('Quezon City')).toEqual({ value: 'Quezon City', rejected: false })
  })
})

describe('profileFromUser', () => {
  it('returns an empty object for no user', () => {
    expect(profileFromUser(null)).toEqual({})
  })

  it('splits a legacy full_name into first, middle and last', () => {
    const out = profileFromUser({ user_metadata: { full_name: 'Juan Santos Cruz' } })
    expect(out.firstName).toBe('Juan')
    expect(out.middleName).toBe('Santos')
    expect(out.lastName).toBe('Cruz')
  })

  it('prefers explicit name parts over full_name', () => {
    const out = profileFromUser({ user_metadata: { first_name: 'Maria', last_name: 'Reyes', full_name: 'Maria Reyes' } })
    expect(out.firstName).toBe('Maria')
    expect(out.lastName).toBe('Reyes')
  })

  it('falls back to the auth email', () => {
    expect(profileFromUser({ email: 'a@gmail.com', user_metadata: {} }).email).toBe('a@gmail.com')
  })

  it('normalises an avatar path to its id', () => {
    expect(profileFromUser({ user_metadata: { avatar_url: '/avatars/avatar-4.png' } }).avatar).toBe('avatar-4')
  })
})

describe('profileMetadata', () => {
  it('writes name parts, role default and the avatar URL', () => {
    const meta = profileMetadata({ firstName: 'Juan', lastName: 'Cruz', avatar: 'avatar-3', provinceId: 'ncr' })
    expect(meta.full_name).toBe('Juan Cruz')
    expect(meta.first_name).toBe('Juan')
    expect(meta.role).toBe('Customer')
    expect(meta.avatar).toBe('avatar-3')
    expect(meta.avatar_url).toMatch(/avatars\/avatar-3\.png$/)
    expect(meta.province_id).toBe('ncr')
  })

  it('keeps a zero age as "0"', () => {
    expect(profileMetadata({ age: 0 }).age).toBe('0')
  })

  it('uses a custom image URL as the avatar_url', () => {
    expect(profileMetadata({ avatar: '/custom.png' }).avatar_url).toBe('/custom.png')
  })
})
