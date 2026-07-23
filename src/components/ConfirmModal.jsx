// A small confirmation dialog styled to match the app's modals (see
// PublishModal). Destructive by default — the confirm button reads as a warning.
// Rendered only when `open`; the caller owns the open/close state.
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div
        className="bg-white border rounded-lg max-w-md w-full"
        style={{ borderColor: 'var(--border-strong)', boxShadow: '0 24px 60px rgba(0,0,0,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <i className="icon-trash-2 text-base" style={{ color: 'var(--bear)' }}></i>
            <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Confirm</span>
          </div>
          <h3 className="font-serif text-2xl font-medium">{title}</h3>
          {message && <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>{message}</p>}
        </div>
        <div className="p-4 sm:p-6 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="text-sm font-medium px-5 py-2 rounded-md flex items-center gap-2"
            style={{ background: 'var(--bear)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            <i className="icon-trash-2 text-xs"></i> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
