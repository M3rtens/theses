import { useState } from 'react'
import { useLiveTheses } from '../lib/useLiveTheses.js'
import { useStoredTheses } from '../lib/useStoredTheses.js'
import { fmtPrice } from '../lib/format.js'

export default function MyTheses({ navigate }) {
  const stored = useStoredTheses()
  const allTheses = stored
  const live = useLiveTheses(allTheses)

  // Status: 'all' | 'active' | 'closed'. Side: 'all' | 'bull' | 'bear'.
  const [status, setStatus] = useState('all')
  const [side, setSide] = useState('all')

  const isClosed = (t) => t.status === 'closed'
  const counts = {
    all: allTheses.length,
    active: allTheses.filter((t) => !isClosed(t)).length,
    closed: allTheses.filter(isClosed).length,
  }

  const visible = allTheses.filter((t) => {
    if (status === 'active' && isClosed(t)) return false
    if (status === 'closed' && !isClosed(t)) return false
    if (side !== 'all' && t.side !== side) return false
    return true
  })

  const filterClass = (on) => `lb-filter text-xs px-3 py-1 rounded ${on ? 'active' : ''}`
  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">My Theses</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>All active and closed published theses. Sorted by publication date.</p>
          </div>
          <button onClick={() => navigate('editor')} className="btn-primary text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="icon-plus text-xs"></i> New Thesis
          </button>
        </div>

        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1">
          <div className="flex shrink-0 items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button onClick={() => setStatus('all')} className={filterClass(status === 'all')}>All ({counts.all})</button>
            <button onClick={() => setStatus('active')} className={filterClass(status === 'active')}>Active ({counts.active})</button>
            <button onClick={() => setStatus('closed')} className={filterClass(status === 'closed')}>Closed ({counts.closed})</button>
          </div>
          <div className="flex shrink-0 items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button onClick={() => setSide('all')} className={filterClass(side === 'all')}>All Sides</button>
            <button onClick={() => setSide('bull')} className={filterClass(side === 'bull')}>Long</button>
            <button onClick={() => setSide('bear')} className={filterClass(side === 'bear')}>Short</button>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        <div className="border rounded-md overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <table className="w-full min-w-[980px]">
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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                    No theses match this filter.
                  </td>
                </tr>
              )}
              {visible.map(t => {
                const l = live[t.id]
                // A user-published thesis stores its entry sealed in native currency;
                // never let the live fetch overwrite it (its recomputed entry would
                // flicker the cell). Samples carry no native entry, so use the live one.
                const sealed = t.currency != null
                const entry = sealed ? t.entry : (l?.entry ?? t.entry)
                const current = l?.current ?? t.current
                const currency = l?.currency ?? t.currency ?? 'USD'
                // Derive return from the displayed entry + current so all three cells
                // stay consistent; fall back to the stored value before live loads.
                const ret = l
                  ? Number(((t.side === 'bear' ? -1 : 1) * ((current - entry) / entry) * 100).toFixed(1))
                  : t.ret
                const retClass = ret >= 0 ? 'ret-pos' : 'ret-neg'
                const sign = ret >= 0 ? '+' : '−'
                const sideClass = t.side === 'bull' ? 'side-bull' : 'side-bear'
                const sideLabel = t.side === 'bull' ? 'BULL' : 'BEAR'
                return (
                  <tr key={`${t.createdAt ? 'u' : 's'}-${t.id}`} className="lb-row border-b last:border-b-0 cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => navigate('thesis', t)}>
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
