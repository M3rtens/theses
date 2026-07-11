import { sampleTheses } from '../data/theses.js'

export default function Triggers({ navigate }) {
  const breached = []
  const warning = []
  const clear = []

  sampleTheses.forEach(t => {
    if (t.status !== 'active') return
    t.triggers.forEach(trig => {
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
            <div key={i} className="p-4 border rounded-md flex items-center gap-4" style={{ borderColor: `var(${colorVar})`, background: `var(${softVar})` }}>
              <div className="w-24 shrink-0">
                <div className="font-mono text-sm font-semibold">{item.thesis.ticker}</div>
                <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{item.thesis.sector}</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{item.c}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>From: "{item.thesis.title}"</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: `var(${colorVar})` }}>{item.s.toUpperCase()}</div>
              </div>
              <button onClick={() => navigate('thesis')} className="text-xs font-medium px-3 py-1.5 border rounded" style={{ borderColor: `var(${colorVar})`, color: `var(${colorVar})`, background: 'transparent', cursor: 'pointer' }}>Review</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Automated Monitoring</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">Trigger Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Real-time monitoring of invalidation conditions across all active theses.</p>
        </div>

        <div className="grid grid-cols-3 gap-px mt-6" style={{ background: 'var(--border)' }}>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--bear)' }}>Breached</div>
            <div className="font-serif text-3xl font-medium" style={{ color: 'var(--bear)' }}>1</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>Requires immediate review</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--warn)' }}>Warning</div>
            <div className="font-serif text-3xl font-medium" style={{ color: 'var(--warn)' }}>1</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>Approaching threshold</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--bull)' }}>Clear</div>
            <div className="font-serif text-3xl font-medium" style={{ color: 'var(--bull)' }}>9</div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>Within safe parameters</div>
          </div>
        </div>
      </header>

      <div className="px-12 py-8 space-y-8">
        {renderGroup('Breached', breached, '--bear', '--bear-soft')}
        {renderGroup('Warning', warning, '--warn', '--warn-soft')}
        {renderGroup('Clear', clear, '--bull', '--bull-soft')}
      </div>
    </>
  )
}
