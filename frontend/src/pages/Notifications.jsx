import { useMemo, useState } from 'react'
import { Archive, Check, CornerUpLeft, History, ListChecks, Search, Trash2 } from 'lucide-react'
import { useApp, useApi } from '../state'
import { buildAlerts } from '../alerts'
import {
  CATEGORIES, categoryLabel, removeNotifications, setNotificationStatus, useNotificationList,
} from '../notifications'

const TABS = [
  { id: 'new', label: 'notif.tab.new' },
  { id: 'archived', label: 'notif.tab.archive' },
  { id: 'done', label: 'notif.tab.done' },
]

const SIGNAL_OPTIONS = [
  { id: 'surge', label: 'notif.signal.surge' },
  { id: 'dip', label: 'notif.signal.dip' },
]

// The notification cell shows when the alert was first seen, e.g. "11/02/2026 - 6:00 PM".
const formatStamp = (value) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} - ${time}`
}

export default function Notifications() {
  const { province, horizon, t, commodityBy, route, dataVersion } = useApp()
  const { data } = useApi(`/api/v1/overview?province=${province}`, [dataVersion])

  const alerts = useMemo(
    () => (data && Object.keys(commodityBy).length ? buildAlerts(data.items, commodityBy, horizon, t) : []),
    [data, commodityBy, horizon, t],
  )
  const list = useNotificationList(alerts, commodityBy)

  const opened = route.arg ? list.find((n) => n.id === route.arg) : null
  const [tab, setTab] = useState(opened ? opened.status : 'new')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [signal, setSignal] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  const resetSelection = () => {
    setSelected(new Set())
    setSelectMode(false)
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list
      .filter((n) => n.status === tab)
      .filter((n) => !category || n.category === category)
      .filter((n) => !signal || n.signal === signal)
      .filter((n) => {
        if (!q) return true
        const c = commodityBy[n.commodity]
        const hay = [n.text, c?.name, c?.short, c?.fil, categoryLabel(n.category)].join(' ').toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [list, tab, category, signal, query, commodityBy])

  const changeTab = (id) => { setTab(id); resetSelection() }
  const changeQuery = (value) => { setQuery(value); resetSelection() }
  const changeCategory = (value) => { setCategory(value); resetSelection() }
  const changeSignal = (value) => { setSignal(value); resetSelection() }

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Clicking a row highlights it and opens the bulk-action mode.
  const selectRow = (id) => {
    if (!selectMode) setSelectMode(true)
    toggle(id)
  }

  const selectAll = () => {
    setSelectMode(true)
    setSelected(new Set(visible.map((n) => n.id)))
  }

  const cancelSelect = () => resetSelection()

  const applyCheck = () => {
    const ids = [...selected]
    if (!ids.length) return
    // New -> done. Done/archived -> back to the notification list.
    setNotificationStatus(ids, tab === 'new' ? 'done' : 'new')
    resetSelection()
  }

  const applyArchive = () => {
    const ids = [...selected]
    if (!ids.length) return
    if (tab === 'archived') removeNotifications(ids)
    else setNotificationStatus(ids, 'archived')
    resetSelection()
  }

  const rowActions = (n) => (
    <span className="notif-row-actions">
      <button
        type="button"
        className="notif-act restore"
        aria-label={tab === 'new' ? t('notif.done') : t('notif.restore')}
        title={tab === 'new' ? t('notif.done') : t('notif.restore')}
        onClick={(e) => {
          e.stopPropagation()
          setNotificationStatus([n.id], tab === 'new' ? 'done' : 'new')
        }}
      >
        {tab === 'new' ? <Check size={30} strokeWidth={3} /> : <History size={26} />}
      </button>
      <button
        type="button"
        className="notif-act remove"
        aria-label={tab === 'archived' ? t('notif.remove') : t('notif.archive')}
        title={tab === 'archived' ? t('notif.remove') : t('notif.archive')}
        onClick={(e) => {
          e.stopPropagation()
          if (tab === 'archived') removeNotifications([n.id])
          else setNotificationStatus([n.id], 'archived')
        }}
      >
        {tab === 'archived' ? <Trash2 size={26} /> : <Archive size={26} />}
      </button>
    </span>
  )

  const fillers = Math.max(0, 7 - visible.length)

  return (
    <div className="notif-page">
      <div className="notif-searchbar">
        <label className="notif-search-field">
          <span className="notif-search-label">{t('notif.search')}</span>
          <span className="notif-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t('notif.search.placeholder')}
              onChange={(e) => changeQuery(e.target.value)}
              aria-label={t('notif.search')}
            />
          </span>
        </label>
        <label className="notif-category-field">
          <span className="notif-search-label">{t('notif.category')}</span>
          <select value={category} onChange={(e) => changeCategory(e.target.value)} aria-label={t('notif.category')}>
            <option value="">{t('notif.category.placeholder')}</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="notif-category-field notif-status-field">
          <span className="notif-search-label">{t('notif.status')}</span>
          <select value={signal} onChange={(e) => changeSignal(e.target.value)} aria-label={t('notif.status')}>
            <option value="">{t('notif.status.placeholder')}</option>
            {SIGNAL_OPTIONS.map((s) => <option key={s.id} value={s.id}>{t(s.label)}</option>)}
          </select>
        </label>
      </div>

      <div className="notif-tab-row">
        <div className="notif-tabs" role="tablist" aria-label={t('notif.title')}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`notif-tab ${tab === item.id ? 'on' : ''}`}
              onClick={() => changeTab(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <div className="notif-tools">
          {selectMode && (
            <button
              type="button"
              className="notif-tool"
              onClick={cancelSelect}
              aria-label={t('notif.cancelall')}
              title={t('notif.cancelall')}
            >
              <CornerUpLeft size={28} />
            </button>
          )}
          <button
            type="button"
            className="notif-tool"
            onClick={selectAll}
            aria-label={t('notif.selectall')}
            title={t('notif.selectall')}
          >
            <ListChecks size={28} />
          </button>
        </div>
      </div>

      <div className="notif-table-wrap">
        <div className="notif-table" role="tabpanel">
          {visible.map((n) => {
            const isSelected = selected.has(n.id)
            return (
              <div
                key={n.id}
                className={`notif-row ${isSelected ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => selectRow(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectRow(n.id)
                  }
                }}
              >
                <span className="notif-row-icon" aria-hidden="true">{n.icon}</span>
                <span className="notif-row-body">
                  <span className="notif-row-head">
                    <span className="notif-row-name">{commodityBy[n.commodity]?.short || n.commodity}</span>
                    <span className={`notif-kicker ${n.signal}`}>
                      <span className="notif-arrow" aria-hidden="true">{n.signal === 'surge' ? '▲' : '▼'}</span>
                      {t('sig.' + n.signal)} {n.change > 0 ? '+' : ''}{Number(n.change).toFixed(1)}%
                    </span>
                    <span className="notif-row-date">{formatStamp(n.createdAt)}</span>
                  </span>
                  <span className="notif-row-text">{n.text}</span>
                </span>
                {selectMode
                  ? <span className={`notif-check ${isSelected ? 'on' : ''}`} aria-hidden="true">{isSelected && <Check size={18} strokeWidth={3} />}</span>
                  : rowActions(n)}
              </div>
            )
          })}

          {Array.from({ length: fillers }, (_, i) => (
            <div className="notif-row empty" key={`empty-${i}`} aria-hidden="true">
              <span className="notif-row-icon" />
              <span className="notif-row-body" />
              {selectMode && <span className="notif-check" />}
            </div>
          ))}

          {visible.length === 0 && (
            <p className="notif-empty">{t('notif.empty')}</p>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="notif-bulk-bar">
          <button type="button" className="notif-bulk check" onClick={applyCheck} disabled={!selected.size}>
            {t('notif.check')}
          </button>
          <button type="button" className="notif-bulk remove" onClick={applyArchive} disabled={!selected.size}>
            {tab === 'archived' ? t('notif.remove') : t('notif.archive')}
          </button>
        </div>
      )}
    </div>
  )
}
