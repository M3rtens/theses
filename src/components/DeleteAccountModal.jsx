import { useState } from 'react'

// Double-confirm dialog for deleting the user's account. Styled to match
// PublishModal. Requires the user to type DELETE, so it can't be triggered by a
// stray click. The parent owns the actual deletion via onConfirm.
export default function DeleteAccountModal({ open, deleting, error, onClose, onConfirm }) {
  const [typed, setTyped] = useState('')

  const close = () => {
    if (deleting) return
    setTyped('')
    onClose()
  }

  if (!open) return null

  const armed = typed.trim().toUpperCase() === 'DELETE'

  return (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-8">
      <div className="bg-white border rounded-lg max-w-md w-full" style={{ borderColor: 'var(--border-strong)', boxShadow: '0 24px 60px rgba(0,0,0,0.15)' }}>
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <i className="icon-triangle-alert text-base" style={{ color: 'var(--bear)' }}></i>
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold" style={{ color: 'var(--bear)' }}>Delete Account</span>
          </div>
          <h3 className="font-serif text-2xl font-medium">Delete your profile?</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>This permanently removes your account and sign-in. This cannot be undone.</p>
        </div>
        <div className="p-6 text-sm">
          <label className="block text-xs font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
            Type <span style={{ color: 'var(--bear)' }}>DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            placeholder="DELETE"
            className="w-full p-2.5 border rounded"
            style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
          />
          {error && <p className="text-[12px] mt-2" style={{ color: 'var(--bear)' }}>{error}</p>}
        </div>
        <div className="p-6 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <button onClick={close} disabled={deleting} className="text-sm font-medium" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: deleting ? 'default' : 'pointer' }}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!armed || deleting}
            className="text-sm px-5 py-2 rounded-md flex items-center gap-2 font-medium"
            style={{ background: armed && !deleting ? 'var(--bear)' : 'var(--border-strong)', color: 'white', border: 'none', cursor: armed && !deleting ? 'pointer' : 'default' }}
          >
            <i className="icon-trash-2 text-xs"></i> {deleting ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  )
}
