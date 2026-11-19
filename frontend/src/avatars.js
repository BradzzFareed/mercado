// Avatar catalogue: the illustrated user icons live in /public/avatars (avatar-1.png … avatar-8.png).
const BASE = import.meta.env.BASE_URL || '/'

export const AVATARS = [
  { id: 'avatar-1', label: 'Brown ponytail, black vest', src: `${BASE}avatars/avatar-1.png` },
  { id: 'avatar-2', label: 'Grey hair and beard, blue sweater', src: `${BASE}avatars/avatar-2.png` },
  { id: 'avatar-3', label: 'Dark hair, purple shirt', src: `${BASE}avatars/avatar-3.png` },
  { id: 'avatar-4', label: 'Long black hair, brown blazer', src: `${BASE}avatars/avatar-4.png` },
  { id: 'avatar-5', label: 'Wavy brown hair, yellow blazer', src: `${BASE}avatars/avatar-5.png` },
  { id: 'avatar-6', label: 'Black bob, red top', src: `${BASE}avatars/avatar-6.png` },
  { id: 'avatar-7', label: 'Messy brown hair, grey hoodie', src: `${BASE}avatars/avatar-7.png` },
  { id: 'avatar-8', label: 'Short black hair, dark suit', src: `${BASE}avatars/avatar-8.png` },
]

export const AVATAR_IDS = AVATARS.map((a) => a.id)

// Unknown / retired ids (e.g. the old avatar-9) fall back to the first avatar.
export function avatarDef(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0]
}
