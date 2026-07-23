import { useEffect, useState } from 'react'
import { deleteDraft, loadDrafts, relativeTime } from '../lib/drafts.js'
import { useUser } from '../components/UserProvider.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'

export default function Drafts({ navigate }) {
  const user = useUser()
  // Saved drafts (localStorage) held in state so deleting one re-renders.
  const [saved, setSaved] = useState([])
  useEffect(() => { setSaved(loadDrafts(user?.id)) }, [user?.id])

  // The draft awaiting delete confirmation (null when the dialog is closed).
  const [pendingDelete, setPendingDelete] = useState(null)
  useEffect(() => {
    document.body.classList.toggle('modal-open', pendingDelete != null)
    return () => document.body.classList.remove('modal-open')
  }, [pendingDelete])

  const requestDelete = (e, draft) => {
    e.stopPropagation() // don't open the editor when deleting
    setPendingDelete(draft)
  }

  const confirmDelete = () => {
    if (pendingDelete) setSaved(deleteDraft(pendingDelete.id, user?.id))
    setPendingDelete(null)
  }

  const drafts = saved.map((d) => ({ ...d, lastEdited: relativeTime(d.savedAt) }))

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Drafts</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Works in progress. Nothing here is tracked or scored yet.</p>
          </div>
          <button onClick={() => navigate('editor')} className="btn-primary text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="icon-plus text-xs"></i> New Draft
          </button>
        </div>

        <div className="mt-6 p-4 border rounded-md flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <i className="icon-info text-sm" style={{ color: 'var(--ink-soft)' }}></i>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Drafts can be edited freely. Once published, the entry price is locked, the timestamp is sealed, and the thesis body cannot be altered.
          </p>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        {drafts.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No drafts yet. Start one with “New Draft”.</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map(d => {
            const sideClass = d.side === 'bull' ? 'side-bull' : 'side-bear'
            const sideLabel = d.side === 'bull' ? 'BULL' : 'BEAR'
            return (
              <div key={d.id} className="thesis-card rounded-md p-5 cursor-pointer" onClick={() => navigate('editor', d.savedAt ? d : null)}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{d.ticker}</span>
                    <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Edited {d.lastEdited}</span>
                </div>
                <h3 className="font-serif text-lg font-medium mb-4 leading-snug">{d.title}</h3>

                <div className="flex items-center gap-4 text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>
                  <span className="flex items-center gap-1.5"><i className="icon-file-text text-xs"></i> {d.wordCount} words</span>
                  <span className="flex items-center gap-1.5"><i className="icon-target text-xs"></i> {d.triggersCount} triggers</span>
                </div>

                <div className="pt-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Draft</span>
                  <div className="flex items-center gap-3">
                    {d.savedAt && (
                      <button
                        onClick={(e) => requestDelete(e, d)}
                        title="Delete draft"
                        className="text-xs font-medium flex items-center gap-1"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--bear)' }}
                      >
                        <i className="icon-trash-2 text-xs"></i> Delete
                      </button>
                    )}
                    <button className="text-xs font-medium flex items-center gap-1" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>Continue <i className="icon-arrow-right text-xs"></i></button>
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
        message={pendingDelete ? `"${pendingDelete.title}" will be permanently removed. This cannot be undone.` : ''}
        confirmLabel="Delete draft"
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  )
}
