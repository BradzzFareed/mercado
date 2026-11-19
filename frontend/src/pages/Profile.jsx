import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, Lock, RefreshCw } from 'lucide-react'
import { useApp } from '../state'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import {
  ROLE, fullName, sanitizeAddress, sanitizeAge, sanitizeName, titleCaseRegion, validateProfile,
} from '../profile'
import { supabase } from '../supabaseClient'

const NAME_PARTS = [
  ['firstName', 'First Name'],
  ['middleName', 'Middle Name'],
  ['lastName', 'Last Name'],
]

// Shrink the typed name as it gets longer so long names still fit their underline.
const nameFont = (v) => (v.length > 16 ? '1rem' : v.length > 11 ? '1.15rem' : '1.4rem')

export default function Profile() {
  const { meta, profile, updateProfile, prov } = useApp()
  const regions = (meta && meta.regions) || []
  const provinces = (meta && meta.provinces) || []
  const byId = Object.fromEntries(provinces.map((p) => [p.id, p]))

  const initial = {
    ...profile,
    provinceId: profile.provinceId || prov?.id || '',
    provinceName: profile.provinceName || prov?.name || '',
    regionName: profile.regionName || titleCaseRegion(prov?.region || ''),
  }

  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})
  const [rejected, setRejected] = useState({})
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingAbout, setEditingAbout] = useState(false)
  const aboutRef = useRef(null)
  const birthdayRef = useRef(null)

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
    setStatus('idle')
  }

  const onName = (key) => (e) => {
    const { value, rejected: bad } = sanitizeName(e.target.value)
    setRejected((r) => ({ ...r, [key]: bad }))
    setField(key, value)
  }

  const onAge = (e) => {
    const { value, rejected: bad } = sanitizeAge(e.target.value)
    setRejected((r) => ({ ...r, age: bad }))
    if (value !== null) setField('age', value)
  }

  const onAddress = (e) => {
    const { value, rejected: bad } = sanitizeAddress(e.target.value)
    setRejected((r) => ({ ...r, address: bad }))
    setField('address', value)
  }

  const selectedRegion = regions.find((r) => r.provinces.includes(draft.provinceId)) || regions[0]
  const onRegion = (code) => {
    const region = regions.find((r) => r.code === code)
    if (!region) return
    const first = byId[region.provinces[0]]
    setDraft((d) => ({
      ...d,
      provinceId: region.provinces[0],
      provinceName: first?.name || '',
      regionName: titleCaseRegion(region.name),
    }))
    setStatus('idle')
  }
  const onProvince = (id) => {
    const p = byId[id]
    const region = regions.find((r) => r.provinces.includes(id))
    setDraft((d) => ({ ...d, provinceId: id, provinceName: p?.name || '', regionName: titleCaseRegion(region?.name || '') }))
    setStatus('idle')
  }

  // Auto font size for About: the largest size (14–34px) that fits the card.
  useLayoutEffect(() => {
    const el = aboutRef.current
    if (!el) return
    let lo = 14
    let hi = 34
    let best = 14
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      el.style.fontSize = `${mid}px`
      if (el.scrollHeight <= el.clientHeight + 1) { best = mid; lo = mid + 1 } else hi = mid - 1
    }
    el.style.fontSize = `${best}px`
  }, [draft.about, editingAbout, pickerOpen])

  const save = async () => {
    const next = { ...draft, email: draft.email.trim(), about: draft.about.trim() }
    const found = validateProfile(next)
    setErrors(found)
    if (Object.keys(found).length) return
    setRejected({})

    setStatus('saving')
    updateProfile(next)
    if (supabase) {
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: fullName(next),
            role: ROLE,
            avatar: next.avatar,
            about: next.about,
            age: next.age,
            gender: next.gender,
            birthday: next.birthday,
            address: [next.address, next.provinceName, next.regionName].filter(Boolean).join(', '),
          },
        })
      } catch { /* offline or no session: localStorage copy already saved */ }
    }
    setStatus('saved')
  }

  const onPick = useCallback((id) => {
    setDraft((d) => ({ ...d, avatar: id }))
    setStatus('idle')
    setPickerOpen(false)
  }, [])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  const nameError = errors.firstName || errors.middleName || errors.lastName
  const nameBad = rejected.firstName || rejected.middleName || rejected.lastName
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="profile-page">
      <div className="profile-side">
        <section className="profile-photo-card">
          <button
            type="button"
            className="profile-photo"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-label="Change profile picture"
          >
            <Avatar id={draft.avatar} />
            <span className="profile-photo-badge" aria-hidden="true"><RefreshCw size={14} strokeWidth={3} /></span>
          </button>
        </section>

        <section className="profile-about">
          <h2>About</h2>
          <span className="profile-about-rule" aria-hidden="true" />
          <textarea
            ref={aboutRef}
            className="profile-about-text"
            value={draft.about}
            placeholder="Something Description...."
            maxLength={400}
            readOnly={!editingAbout}
            aria-label="About you"
            onChange={(e) => setField('about', e.target.value)}
            onClick={() => setEditingAbout(true)}
            onFocus={() => setEditingAbout(true)}
            onBlur={() => setEditingAbout(false)}
          />
        </section>
      </div>

      <section className="profile-form" aria-label="Personal information">
        <div className="pf-row">
          <span className="pf-label" aria-hidden="true">Name:</span>
          <div className="pf-name-fields">
            {NAME_PARTS.map(([key, caption]) => (
              <div className="pf-name-field" key={key}>
                <input
                  className={`pf-input pf-name-input ${errors[key] ? 'invalid' : ''}`}
                  style={{ fontSize: nameFont(draft[key]) }}
                  value={draft[key]}
                  onChange={onName(key)}
                  aria-label={caption}
                  autoComplete={key === 'firstName' ? 'given-name' : key === 'lastName' ? 'family-name' : 'additional-name'}
                  spellCheck="false"
                />
                <span className="pf-caption">{caption}</span>
              </div>
            ))}
          </div>
        </div>
        {(nameError || nameBad) && (
          <p className="pf-error" role="alert">
            {nameError || 'No numbers, special characters, or double spaces in the name.'}
          </p>
        )}

        <div className="pf-row pf-row-inline">
          <div className="pf-inline">
            <label className="pf-label" htmlFor="pf-age">Age:</label>
            <input
              id="pf-age"
              className={`pf-input pf-w-age ${errors.age ? 'invalid' : ''}`}
              value={draft.age}
              onChange={onAge}
              inputMode="numeric"
              autoComplete="off"
              aria-describedby="pf-age-err"
            />
          </div>
          <div className="pf-inline">
            <label className="pf-label" htmlFor="pf-gender">Gender:</label>
            <select
              id="pf-gender"
              className="pf-input pf-select pf-w-gender"
              value={draft.gender}
              onChange={(e) => setField('gender', e.target.value)}
            >
              <option>Male</option>
              <option>Female</option>
              <option>N/A</option>
            </select>
          </div>
          <div className="pf-inline">
            <label className="pf-label" htmlFor="pf-birthday">Birthday:</label>
            <span className="pf-date-wrap">
              <input
                id="pf-birthday"
                ref={birthdayRef}
                type="date"
                className={`pf-input pf-w-date ${errors.birthday ? 'invalid' : ''}`}
                value={draft.birthday}
                max={today}
                onChange={(e) => setField('birthday', e.target.value)}
              />
              <button
                type="button"
                className="pf-cal-btn"
                aria-label="Open calendar"
                onClick={() => {
                  const el = birthdayRef.current
                  if (!el) return
                  try {
                    if (el.showPicker) el.showPicker()
                    else el.focus()
                  } catch { el.focus() }
                }}
              >
                <CalendarDays size={16} />
              </button>
            </span>
          </div>
        </div>
        {(errors.age || errors.birthday || rejected.age) && (
          <p className="pf-error" id="pf-age-err" role="alert">
            {errors.age || errors.birthday || 'Age takes whole numbers only.'}
          </p>
        )}

        <div className="pf-row pf-row-top">
          <label className="pf-label" htmlFor="pf-address">Address:</label>
          <div className="pf-address-fields">
            <input
              id="pf-address"
              className={`pf-input pf-address-line ${errors.address ? 'invalid' : ''}`}
              value={draft.address}
              onChange={onAddress}
              placeholder="House No., Street, Barangay"
              autoComplete="street-address"
            />
            <div className="pf-address-selects">
              <label className="pf-name-field">
                <select className="pf-input pf-select" value={draft.provinceId} onChange={(e) => onProvince(e.target.value)}>
                  {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span className="pf-caption">Province</span>
              </label>
              <label className="pf-name-field">
                <select className="pf-input pf-select" value={selectedRegion?.code || ''} onChange={(e) => onRegion(e.target.value)}>
                  {regions.map((r) => <option key={r.code} value={r.code}>{titleCaseRegion(r.name)}</option>)}
                </select>
                <span className="pf-caption">Region</span>
              </label>
            </div>
          </div>
        </div>
        {(errors.address || rejected.address) && (
          <p className="pf-error" role="alert">{errors.address || 'No double spacing in the address.'}</p>
        )}

        <div className="pf-row">
          <label className="pf-label" htmlFor="pf-email">Email:</label>
          <input
            id="pf-email"
            type="email"
            className={`pf-input pf-wide ${errors.email ? 'invalid' : ''}`}
            value={draft.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="name@gmail.com"
            autoComplete="email"
            spellCheck="false"
          />
        </div>
        {errors.email && <p className="pf-error" role="alert">{errors.email}</p>}

        <div className="pf-row">
          <span className="pf-label">Role:</span>
          <span className="pf-role">
            <Lock size={14} aria-hidden="true" />
            <input className="pf-input pf-w-role" value={ROLE} readOnly tabIndex={-1} aria-label="Role" />
          </span>
        </div>

        <div className="profile-actions">
          <span className="pf-status" role="status" aria-live="polite">
            {status === 'saved' ? 'All changes saved.' : ''}
          </span>
          <button type="button" className="profile-save" onClick={save} disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <AvatarPicker open={pickerOpen} value={draft.avatar} onPick={onPick} onClose={closePicker} />
    </div>
  )
}
