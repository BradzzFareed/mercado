import { avatarDef } from '../avatars'

// Renders one of the illustrated avatars. The PNGs are circular with transparent corners,
// so the image is simply scaled to fill whatever box the parent gives it.
export default function Avatar({ id, className = '', title }) {
  const a = avatarDef(id)
  return <img src={a.src} className={`avatar-svg ${className}`.trim()} alt={title || a.label} draggable={false} />
}
