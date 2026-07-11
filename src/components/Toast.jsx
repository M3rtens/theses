export default function Toast({ message }) {
  return (
    <div
      className={`${message ? '' : 'hidden'} fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md text-sm`}
      style={{ background: 'var(--ink)', color: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
    >
      {message}
    </div>
  )
}
