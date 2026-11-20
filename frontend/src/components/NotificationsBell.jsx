import { useEffect, useRef, useState } from 'react'
import { Archive, Bell, Check } from 'lucide-react'
import { useApp } from '../state'
import { setNotificationStatus, useNotificationList } from '../notifications'

// Header bell: a compact, scrollable panel of unread buying alerts.
export default function NotificationsBell({ alerts, commodityBy }) {
  const { nav, t } = useApp()
  const list = useNotificationList(alerts, commodityBy)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)

  const unread = list.filter((n) => n.status === 'new')

  // Escape and outside clicks close the popover.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => { if (anchorRef.current && !anchorRef.current.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  const openPage = (id) => {
    setOpen(false)
    nav('notifications', id)
  }

  const markDone = (e, id) => {
    e.stopPropagation()
    setNotificationStatus([id], 'done')
  }

  const discard = (e, id) => {
    e.stopPropagation()
    setNotificationStatus([id], 'archived')
  }

  return (
    <div className="notif-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`icon-btn ${open ? 'notif-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length ? t('alerts.bell', { count: unread.length }) : t('alerts.title')}
        title={unread.length ? t('alerts.bell', { count: unread.length }) : t('alerts.title')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {unread.length > 0 && <span className="alert-badge" aria-hidden="true">{unread.length}</span>}
      </button>

      {open && (
        <div className="notif-pop" role="dialog" aria-label={t('notif.popup')}>
          <div className="notif-pop-head">
            <h2>{t('notif.popup')}</h2>
          </div>

          <div className="notif-pop-list">
            {unread.length === 0 && <p className="notif-pop-empty">{t('notif.popup.empty')}</p>}
            {unread.map((n) => (
              <div
                key={n.id}
                className="notif-pop-row"
                role="button"
                tabIndex={0}
                title={t('notif.popup.open')}
                onClick={() => openPage(n.id)}
                onDoubleClick={() => openPage(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openPage(n.id)
                  }
                }}
              >
                <span className="notif-pop-icon" aria-hidden="true">{n.icon}</span>
                <span className="notif-pop-body">
                  <span className={`notif-kicker ${n.signal}`}>
                    <span className="notif-arrow" aria-hidden="true">{n.signal === 'surge' ? '▲' : '▼'}</span>
                    {t('sig.' + n.signal)} {n.change > 0 ? '+' : ''}{n.change.toFixed(1)}%
                  </span>
                  <span className="notif-pop-text">{n.text}</span>
                </span>
                <span className="notif-pop-actions">
                  <button
                    type="button"
                    className="notif-pop-act done"
                    aria-label={t('notif.done')}
                    title={t('notif.done')}
                    onClick={(e) => markDone(e, n.id)}
                  >
                    <Check size={24} strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    className="notif-pop-act remove"
                    aria-label={t('notif.archive')}
                    title={t('notif.archive')}
                    onClick={(e) => discard(e, n.id)}
                  >
                    <Archive size={22} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          <button type="button" className="notif-pop-all" onClick={() => openPage()}>
            {t('notif.viewall')}
          </button>
        </div>
      )}
    </div>
  )
}
