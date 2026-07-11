import { useState } from 'react'

const points = (ticker) => [
  { ok: true, title: 'Entry price will be locked at current market', detail: `${ticker} · recorded live from the exchange feed in its native currency at publication.` },
  { ok: true, title: 'Performance tracking begins immediately', detail: 'Price chart, return %, and trigger monitoring activate on publish.' },
  { ok: false, title: 'Thesis body cannot be edited', detail: 'You may append timestamped updates only. The original text is sealed.' },
  { ok: false, title: 'Thesis cannot be deleted', detail: 'Even if the thesis loses, it remains on your permanent record. This is the point.' },
  { ok: false, title: 'Entry timestamp cannot be backdated', detail: 'Future close dates, once set, are also non-changeable.' },
]

export default function PublishModal({ open, publishing, draft, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false)

  const close = () => {
    if (publishing) return
    setConfirmed(false)
    onClose()
  }

  if (!open) return null

  const POINTS = points(draft?.ticker || 'This position')

  return (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-8">
      <div className="bg-white border rounded-lg max-w-lg w-full" style={{ borderColor: 'var(--border-strong)', boxShadow: '0 24px 60px rgba(0,0,0,0.15)' }}>
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <i className="icon-lock text-base"></i>
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Publication Lock</span>
          </div>
          <h3 className="font-serif text-2xl font-medium">You're about to publish.</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>This is a one-way action. Read carefully.</p>
        </div>
        <div className="p-6 space-y-4 text-sm">
          {POINTS.map((p, i) => (
            <div key={i} className="flex items-start gap-3">
              <i className={`${p.ok ? 'icon-check' : 'icon-x'} text-base mt-0.5`} style={{ color: p.ok ? 'var(--bull)' : 'var(--bear)' }}></i>
              <div>
                <div className="font-medium">{p.title}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <button onClick={close} className="text-sm font-medium" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I understand this is irreversible
            </label>
            <button disabled={!confirmed || publishing} onClick={onConfirm} className="btn-primary text-sm px-5 py-2 rounded-md flex items-center gap-2">
              <i className="icon-lock text-xs"></i> {publishing ? 'Publishing…' : 'Publish & Lock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
