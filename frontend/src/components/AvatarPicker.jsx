import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, GripHorizontal, X } from 'lucide-react'
import Avatar from './Avatar'
import { AVATARS } from '../avatars'

// Draggable avatar chooser. The panel can be moved anywhere on screen by dragging
// its header (or any empty part of the panel). Avatars grow as the pointer gets
// near them, so the grid feels alive without needing hover targets.
export default function AvatarPicker({ open, value, onPick, onClose }) {
  const [pos, setPos] = useState(null)
  const panelRef = useRef(null)
  const dragRef = useRef(null)
  const cells = useRef([])
  const raf = useRef(0)

  // Start centered, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const w = panel?.offsetWidth || 380
    const h = panel?.offsetHeight || 440
    setPos({
      x: Math.max(12, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(64, Math.round((window.innerHeight - h) / 2 - 20)),
    })
  }, [open])

  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    const onResize = () => {
      const panel = panelRef.current
      if (!panel) return
      setPos((p) => p && ({
        x: Math.min(p.x, Math.max(0, window.innerWidth - panel.offsetWidth)),
        y: Math.min(p.y, Math.max(0, window.innerHeight - panel.offsetHeight)),
      }))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // ---- dragging (pointer capture on whichever node started the drag) ----
  const startDrag = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (e.target.closest('button')) return
    const rect = panelRef.current.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, id: e.pointerId }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* synthetic pointer */ }
    e.preventDefault()
  }
  const moveDrag = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return
    const panel = panelRef.current
    setPos({
      x: Math.min(Math.max(0, e.clientX - dragRef.current.dx), Math.max(0, window.innerWidth - panel.offsetWidth)),
      y: Math.min(Math.max(0, e.clientY - dragRef.current.dy), Math.max(0, window.innerHeight - panel.offsetHeight)),
    })
  }
  const endDrag = (e) => {
    if (!dragRef.current) return
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* already released */ }
  }

  // ---- proximity enlargement ----
  const glow = (e) => {
    const { clientX, clientY } = e
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const RADIUS = 130
      cells.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const d = Math.hypot(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2))
        const k = Math.max(0, 1 - d / RADIUS)
        el.style.transform = `scale(${1 + k * 0.22})`
        el.style.zIndex = k > 0.2 ? String(2 + i) : '1'
      })
    })
  }
  const unglow = () => {
    cancelAnimationFrame(raf.current)
    cells.current.forEach((el) => {
      if (!el) return
      el.style.transform = ''
      el.style.zIndex = ''
    })
  }

  if (!open) return null

  return (
    <div
      className="avatar-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Choose your avatar"
      onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        ref={panelRef}
        className="avatar-panel"
        style={{ left: pos ? pos.x : 0, top: pos ? pos.y : 0, opacity: pos ? 1 : 0 }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="avatar-panel-head">
          <div className="avatar-panel-title">
            <GripHorizontal size={18} aria-hidden="true" />
            <h2>Choose your avatar</h2>
          </div>
          <button type="button" className="avatar-panel-close" onClick={close} aria-label="Close avatar picker">
            <X size={18} />
          </button>
        </div>
        <p className="avatar-panel-sub">Drag this window anywhere. Hover near an avatar to enlarge it.</p>

        <div className="avatar-grid" onPointerMove={glow} onPointerLeave={unglow}>
          {AVATARS.map((a, i) => (
            <button
              key={a.id}
              type="button"
              ref={(el) => { cells.current[i] = el }}
              className={`avatar-cell ${value === a.id ? 'on' : ''}`}
              onClick={() => onPick(a.id)}
              aria-pressed={value === a.id}
              aria-label={a.label}
              title={a.label}
            >
              <Avatar id={a.id} />
              {value === a.id && <span className="avatar-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>}
            </button>
          ))}
        </div>
        <div className="avatar-panel-foot">Your picture updates when you press Save.</div>
      </div>
    </div>
  )
}
