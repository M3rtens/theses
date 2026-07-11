import { sampleTheses } from '../data/theses.js'
import { useLiveTheses } from '../lib/useLiveTheses.js'
import { useStoredTheses } from '../lib/useStoredTheses.js'
import { fmtPrice } from '../lib/format.js'

export default function MyTheses({ navigate }) {
  const stored = useStoredTheses()
  const allTheses = [...stored, ...sampleTheses]
  const live = useLiveTheses(allTheses)
  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">My Theses</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>All active and closed published theses. Sorted by publication date.</p>
          </div>
          <button onClick={() => navigate('editor')} className="btn-primary text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="icon-plus text-xs"></i> New Thesis
          </button>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button className="lb-filter active text-xs px-3 py-1 rounded">All (12)</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Active (7)</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Closed (5)</button>
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button className="lb-filter text-xs px-3 py-1 rounded">All Sides</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Long</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Short</button>
          </div>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Ticker</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Title</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Side</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Status</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Entry</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Current</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Return</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Triggers</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Published</th>
              </tr>
            </thead>
            <tbody>
              {allTheses.map(t => {
                const l = live[t.ticker]
                const entry = l?.entry ?? t.entry
                const current = l?.current ?? t.current
                const ret = l?.ret ?? t.ret
                const currency = l?.currency ?? 'USD'
                const retClass = ret >= 0 ? 'ret-pos' : 'ret-neg'
                const sign = ret >= 0 ? '+' : '−'
                const sideClass = t.side === 'bull' ? 'side-bull' : 'side-bear'
                const sideLabel = t.side === 'bull' ? 'BULL' : 'BEAR'
                return (
                  <tr key={`${t.createdAt ? 'u' : 's'}-${t.id}`} className="lb-row border-b last:border-b-0 cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => navigate('thesis')}>
                    <td className="px-4 py-4 font-mono text-sm font-semibold">{t.ticker}</td>
                    <td className="px-4 py-4 text-sm font-medium max-w-md truncate">{t.title}</td>
                    <td className="px-4 py-4"><span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span></td>
                    <td className="px-4 py-4">
                      {t.status === 'closed'
                        ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>CLOSED</span>
                        : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bull-soft)', color: 'var(--bull)' }}>ACTIVE</span>}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-sm" style={{ color: 'var(--ink-soft)' }}>{fmtPrice(entry, currency)}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm" style={{ color: 'var(--ink-soft)' }}>{fmtPrice(current, currency)}</td>
                    <td className={`px-4 py-4 text-right font-mono text-sm font-semibold ${retClass}`}>{sign}{Math.abs(ret).toFixed(1)}%</td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5">
                        {t.triggers.map((trig, i) => {
                          const bg = trig.s === 'breached' ? 'var(--bear)' : trig.s === 'warning' ? 'var(--warn)' : 'var(--bull)'
                          const title = trig.s === 'breached' ? 'Breached' : trig.s === 'warning' ? 'Warning' : 'Clear'
                          return <span key={i} className="inline-block w-2 h-2 rounded-full" style={{ background: bg }} title={title}></span>
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono" style={{ color: 'var(--muted)' }}>{t.publishDate}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
