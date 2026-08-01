import { useEffect, useState } from 'react'

const immediatePoints = (ticker) => [
  { ok: true, title: 'Entry price will be locked at current market', detail: `${ticker} — recorded live from the exchange feed in its native currency at publication.` },
  { ok: true, title: 'Performance tracking begins immediately', detail: 'Price chart, return %, and trigger monitoring activate on publish.' },
  { ok: false, title: 'Thesis body cannot be edited', detail: 'You may append timestamped updates only. The original text is sealed.' },
  { ok: false, title: 'Thesis cannot be deleted', detail: 'Even if the thesis loses, it remains on your permanent record. This is the point.' },
  { ok: false, title: 'Entry timestamp cannot be backdated', detail: 'Future close dates, once set, are also non-changeable.' },
]

const scheduledPoints = (draft) => [
  { ok: true, title: 'No entry price is locked today', detail: `${draft?.ticker || 'The security'} will be priced during its first eligible regular market session on or after ${draft?.scheduledPublicationDate}.` },
  { ok: true, title: 'You can edit or cancel beforehand', detail: 'The scheduled thesis stays private until the lifecycle worker begins processing it.' },
  { ok: true, title: 'Publication happens automatically', detail: 'When a fresh regular-session quote is available, the server seals the entry price and publication timestamp.' },
  { ok: false, title: 'Publication becomes irreversible when executed', detail: 'After publication, only timestamped updates and the normal closing workflow are available.' },
]

export default function PublishModal({ open, publishing, draft, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (open) setConfirmed(false)
  }, [open])

  const close = () => {
    if (publishing) return
    setConfirmed(false)
    onClose()
  }

  if (!open) return null

  const isScheduled = Boolean(draft?.scheduledPublicationDate)
  const points = isScheduled ? scheduledPoints(draft) : immediatePoints(draft?.ticker || 'This position')

  return (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4 sm:p-8">
      <div className="bg-white border rounded-lg max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto" style={{ borderColor: 'var(--border-strong)', boxShadow: '0 24px 60px rgba(0,0,0,0.15)' }}>
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <i className="icon-lock text-base"></i>
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Publication Lock</span>
          </div>
          <h3 className="font-serif text-2xl font-medium">{isScheduled ? 'Schedule this publication.' : "You're about to publish."}</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{isScheduled ? 'It stays private and editable until execution.' : 'This is a one-way action. Read carefully.'}</p>
        </div>
        <div className="p-4 sm:p-6 space-y-4 text-sm">
          {points.map((point, index) => (
            <div key={index} className="flex items-start gap-3">
              <i className={`${point.ok ? 'icon-check' : 'icon-x'} text-base mt-0.5`} style={{ color: point.ok ? 'var(--bull)' : 'var(--bear)' }}></i>
              <div>
                <div className="font-medium">{point.title}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{point.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 sm:p-6 border-t flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <button onClick={close} className="text-sm font-medium" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-2">
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> {isScheduled ? 'I understand it will lock automatically' : 'I understand this is irreversible'}
            </label>
            <button disabled={!confirmed || publishing} onClick={onConfirm} className="btn-primary justify-center text-sm px-5 py-2 rounded-md flex items-center gap-2">
              <i className="icon-lock text-xs"></i> {publishing ? (isScheduled ? 'Scheduling…' : 'Publishing…') : (isScheduled ? 'Schedule Publication' : 'Publish & Lock')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
