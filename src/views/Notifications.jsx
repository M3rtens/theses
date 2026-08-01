import { useMemo, useState } from 'react'
import { useData } from '../components/DataProvider.jsx'
import { relativeTime } from '../lib/drafts.js'

const iconFor = (type) => {
  if (type === 'publication_completed') return 'icon-send'
  if (type === 'close_completed') return 'icon-lock'
  if (type === 'trigger_breached') return 'icon-circle-alert'
  if (type === 'trigger_warning') return 'icon-triangle-alert'
  if (type === 'trigger_clear') return 'icon-circle-check'
  if (type === 'followed_publication') return 'icon-user-round-check'
  if (type === 'thesis_update') return 'icon-message-square-text'
  if (type === 'watched_close') return 'icon-lock'
  if (type === 'watched_trigger') return 'icon-bell-ring'
  if (type === 'discussion_comment') return 'icon-message-circle'
  if (type === 'discussion_reply') return 'icon-reply'
  if (type === 'saved_search_match') return 'icon-search-check'
  return 'icon-wrench'
}

export default function Notifications({ navigate }) {
  const {
    notifications,
    loadNotifications,
    loadScheduled,
    loadStored,
  } = useData()
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState(null)
  const [operationError, setOperationError] = useState('')
  const unread = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  )

  const markRead = async (ids) => {
    if (!ids.length) return
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    await loadNotifications()
  }

  const markAll = async () => {
    if (!unread || busy) return
    setBusy(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      await loadNotifications()
    } finally {
      setBusy(false)
    }
  }

  const openNotification = async (notification) => {
    if (!notification.readAt) await markRead([notification.id])
    if (notification.thesisId) {
      const latest = await loadStored()
      const thesis = latest.find((item) => Number(item.id) === Number(notification.thesisId))
      if (thesis) {
        navigate('thesis', thesis)
        return
      }
      navigate('thesis', { id: notification.thesisId })
      return
    }
    if (notification.lifecycleJobId) navigate('drafts')
  }

  const retryJob = async (notification) => {
    if (retrying) return
    setRetrying(notification.lifecycleJobId)
    setOperationError('')
    try {
      const response = await fetch(`/api/lifecycle-jobs/${notification.lifecycleJobId}/retry`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
      await Promise.all([
        markRead([notification.id]),
        loadScheduled(),
      ])
    } catch (error) {
      setOperationError(error.message)
    } finally {
      setRetrying(null)
    }
  }

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Notifications</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Lifecycle events, followed analysts, and watched-thesis activity.</p>
          </div>
          <button type="button" disabled={!unread || busy} onClick={markAll} className="btn-secondary text-xs px-3 py-2 rounded-md" style={{ opacity: unread ? 1 : 0.5 }}>
            {busy ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
        {operationError && <p className="text-xs mt-3" style={{ color: 'var(--bear)' }}>{operationError}</p>}
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12 max-w-4xl">
        {!notifications.length && <p className="text-sm" style={{ color: 'var(--muted)' }}>No notifications yet.</p>}
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="w-full border rounded-md flex items-stretch"
              style={{
                borderColor: notification.readAt ? 'var(--border)' : 'var(--border-strong)',
                background: notification.readAt ? 'white' : 'var(--bg-warm)',
              }}
            >
              <button
                type="button"
                onClick={() => openNotification(notification)}
                className="flex-1 min-w-0 text-left p-4 flex items-start gap-3 bg-transparent"
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
                  <i className={`${iconFor(notification.type)} text-sm`}></i>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{notification.title}</span>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--muted)' }}>{relativeTime(Date.parse(notification.createdAt))}</span>
                  </span>
                  <span className="block text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>{notification.message}</span>
                </span>
                {!notification.readAt && <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: 'var(--bear)' }} />}
              </button>
              {notification.lifecycleJobStatus === 'action_required' && (
                <button
                  type="button"
                  disabled={retrying != null}
                  onClick={() => retryJob(notification)}
                  className="px-4 text-xs font-medium border-l"
                  style={{ borderColor: 'var(--border)', color: 'var(--bull)', background: 'transparent' }}
                >
                  {retrying === notification.lifecycleJobId ? 'Retrying…' : 'Retry'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
