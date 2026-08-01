import { useEffect, useMemo, useState } from 'react'
import { deleteDraft, loadDrafts, relativeTime } from '../lib/drafts.js'
import { useData } from '../components/DataProvider.jsx'
import { useUser } from '../components/UserProvider.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'

const statusLabel = (draft) => {
  if (!draft.scheduledPublicationId) return 'Draft'
  if (draft.scheduleStatus === 'pending') return 'Scheduled'
  if (draft.scheduleStatus === 'processing') return 'Processing'
  if (draft.scheduleStatus === 'action_required') return 'Action needed'
  return 'Cloud draft'
}

export default function Drafts({ navigate }) {
  const user = useUser()
  const { scheduled, loadScheduled } = useData()
  const [saved, setSaved] = useState([])
  const [pendingDelete, setPendingDelete] = useState(null)
  const [operationError, setOperationError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { setSaved(loadDrafts(user?.id)) }, [user?.id])
  useEffect(() => { loadScheduled() }, [loadScheduled])
  useEffect(() => {
    document.body.classList.toggle('modal-open', pendingDelete != null)
    return () => document.body.classList.remove('modal-open')
  }, [pendingDelete])

  const drafts = useMemo(() => [...scheduled, ...saved]
    .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
    .map((draft) => ({ ...draft, lastEdited: relativeTime(draft.savedAt) })), [saved, scheduled])

  const mutateSchedule = async (draft, action) => {
    if (busyId) return
    setBusyId(draft.scheduledPublicationId)
    setOperationError('')
    try {
      const response = await fetch(`/api/scheduled-publications/${draft.scheduledPublicationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
      await loadScheduled()
    } catch (error) {
      setOperationError(error.message)
    } finally {
      setBusyId(null)
    }
  }

  const requestDelete = (event, draft) => {
    event.stopPropagation()
    setPendingDelete(draft)
  }

  const confirmDelete = async () => {
    const draft = pendingDelete
    setPendingDelete(null)
    if (!draft) return
    if (!draft.scheduledPublicationId) {
      setSaved(deleteDraft(draft.id, user?.id))
      return
    }

    setBusyId(draft.scheduledPublicationId)
    setOperationError('')
    try {
      const response = await fetch(`/api/scheduled-publications/${draft.scheduledPublicationId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || `HTTP ${response.status}`)
      }
      await loadScheduled()
    } catch (error) {
      setOperationError(error.message)
    } finally {
      setBusyId(null)
    }
  }

  const openDraft = (draft) => {
    if (draft.scheduleStatus === 'processing') return
    navigate('editor', draft)
  }

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Drafts</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Local works in progress and durable scheduled publications.</p>
          </div>
          <button onClick={() => navigate('editor')} className="btn-primary text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="icon-plus text-xs"></i> New Draft
          </button>
        </div>

        <div className="mt-6 p-4 border rounded-md flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <i className="icon-info text-sm" style={{ color: 'var(--ink-soft)' }}></i>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Scheduled theses remain private and editable until processing starts. Publication seals the entry price, timestamp, and original thesis.
          </p>
        </div>
        {operationError && <p className="text-xs mt-3" style={{ color: 'var(--bear)' }}>{operationError}</p>}
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        {drafts.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No drafts yet. Start one with “New Draft”.</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map((draft) => {
            const sideClass = draft.side === 'bull' ? 'side-bull' : 'side-bear'
            const status = statusLabel(draft)
            const isServerDraft = Boolean(draft.scheduledPublicationId)
            const processing = draft.scheduleStatus === 'processing'
            const busy = busyId === draft.scheduledPublicationId
            return (
              <div
                key={draft.id}
                className={`thesis-card rounded-md p-5 ${processing ? '' : 'cursor-pointer'}`}
                onClick={() => openDraft(draft)}
                style={{ opacity: processing ? 0.72 : 1 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{draft.ticker || '—'}</span>
                    <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{draft.side === 'bear' ? 'BEAR' : 'BULL'}</span>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Edited {draft.lastEdited}</span>
                </div>
                <h3 className="font-serif text-lg font-medium mb-3 leading-snug">{draft.title}</h3>
                {draft.scheduledPublicationDate && (
                  <p className="text-xs mb-3" style={{ color: 'var(--ink-soft)' }}>
                    First regular market session on or after {draft.scheduledPublicationDate} ({draft.exchangeTimezone || 'exchange time'})
                  </p>
                )}
                {draft.scheduleStatus === 'action_required' && (
                  <p className="text-xs mb-3" style={{ color: 'var(--bear)' }}>Market data failed repeatedly. Review the thesis, then retry or cancel the schedule.</p>
                )}
                <div className="flex items-center gap-4 text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>
                  <span className="flex items-center gap-1.5"><i className="icon-file-text text-xs"></i> {draft.wordCount || 0} words</span>
                  <span className="flex items-center gap-1.5"><i className="icon-target text-xs"></i> {draft.triggersCount || 0} triggers</span>
                </div>

                <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: draft.scheduleStatus === 'action_required' ? 'var(--bear)' : 'var(--muted)' }}>{status}</span>
                  <div className="flex items-center gap-3">
                    {isServerDraft && ['pending', 'action_required'].includes(draft.scheduleStatus) && (
                      <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); mutateSchedule(draft, 'cancel') }} className="text-xs font-medium" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>Cancel schedule</button>
                    )}
                    {draft.scheduleStatus === 'action_required' && (
                      <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); mutateSchedule(draft, 'retry') }} className="text-xs font-medium" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--bull)' }}>Retry</button>
                    )}
                    {!processing && (
                      <button type="button" onClick={(event) => requestDelete(event, draft)} title="Delete draft" className="text-xs font-medium flex items-center gap-1" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--bear)' }}>
                        <i className="icon-trash-2 text-xs"></i> Delete
                      </button>
                    )}
                    {!processing && <span className="text-xs font-medium flex items-center gap-1">Continue <i className="icon-arrow-right text-xs"></i></span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmModal
        open={pendingDelete != null}
        title="Delete this draft?"
        message={pendingDelete ? `“${pendingDelete.title}” will be permanently removed. Unpublished drafts are not part of the public record.` : ''}
        confirmLabel="Delete draft"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  )
}
