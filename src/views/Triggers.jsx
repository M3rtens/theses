import { useStoredTheses } from '../lib/useStoredTheses.js'

export default function Triggers({ navigate }) {
  // Stored (user-published) theses — loading them recomputes their trigger
  // statuses against the latest filings.
  const stored = useStoredTheses()
  const allTheses = stored

  const breached = []
  const warning = []
  const clear = []

  allTheses.forEach((t) => {
    if (t.status === 'closed') return
    ;(t.triggers || []).forEach((trig) => {
      const item = { ...trig, thesis: t }
      if (trig.s === 'breached') breached.push(item)
      else if (trig.s === 'warning') warning.push(item)
      else clear.push(item)
    })
  })

  const renderGroup = (title, items, colorVar, softVar) => {
    if (items.length === 0) return null
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-serif text-xl font-medium">{title}</h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ background: `var(${softVar})`, color: `var(${colorVar})` }}>{items.length}</span>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="p-4 border rounded-md flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4" style={{ borderColor: `var(${colorVar})`, background: `var(${softVar})` }}>
              <div className="w-full sm:w-24 shrink-0">
                <div className="font-mono text-sm font-semibold">{item.thesis.ticker}</div>
                <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{item.thesis.sector}</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{item.c}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>From: &ldquo;{item.thesis.title}&rdquo;</div>
              </div>
              <div className="sm:text-right">
                <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: `var(${colorVar})` }}>{item.s.toUpperCase()}</div>
              </div>
              <button onClick={() => navigate('thesis', item.thesis)} className="text-xs font-medium px-3 py-1.5 border rounded" style={{ borderColor: `var(${colorVar})`, color: `var(${colorVar})`, background: 'transparent', cursor: 'pointer' }}>Review</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Automated Monitoring</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">Trigger Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Financial triggers are re-evaluated against the latest filings each time this page loads.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px mt-6" style={{ background: 'var(--border)' }}>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--bear)' }}>Breached</div>
            <div className="font-serif text-3xl font-medium" style={{ color: 'var(--bear)' }}>{breached.length}</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>Requires immediate review</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--warn)' }}>Warning</div>
            <div className="font-serif text-3xl font-medium" style={{ color: 'var(--warn)' }}>{warning.length}</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>Approaching threshold</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--bull)' }}>Clear</div>
            <div className="font-serif text-3xl font-medium" style={{ color: 'var(--bull)' }}>{clear.length}</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>Within safe parameters</div>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12 space-y-8">
        {breached.length + warning.length + clear.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No triggers defined across your active theses yet.</p>
        )}
        {renderGroup('Breached', breached, '--bear', '--bear-soft')}
        {renderGroup('Warning', warning, '--warn', '--warn-soft')}
        {renderGroup('Clear', clear, '--bull', '--bull-soft')}
      </div>
    </>
  )
}
