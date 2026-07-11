import { sampleDrafts } from '../data/theses.js'

export default function Drafts({ navigate }) {
  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Workspace</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Drafts</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Works in progress. Nothing here is tracked or scored yet.</p>
          </div>
          <button onClick={() => navigate('editor')} className="btn-primary text-sm px-4 py-2 rounded-md flex items-center gap-2">
            <i className="lucide-plus text-xs"></i> New Draft
          </button>
        </div>

        <div className="mt-6 p-4 border rounded-md flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
          <i className="lucide-info text-sm" style={{ color: 'var(--ink-soft)' }}></i>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Drafts can be edited freely. Once published, the entry price is locked, the timestamp is sealed, and the thesis body cannot be altered.
          </p>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="grid grid-cols-2 gap-4">
          {sampleDrafts.map(d => {
            const sideClass = d.side === 'bull' ? 'side-bull' : 'side-bear'
            const sideLabel = d.side === 'bull' ? 'BULL' : 'BEAR'
            return (
              <div key={d.id} className="thesis-card rounded-md p-5 cursor-pointer" onClick={() => navigate('editor')}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{d.ticker}</span>
                    <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Edited {d.lastEdited}</span>
                </div>
                <h3 className="font-serif text-lg font-medium mb-4 leading-snug">{d.title}</h3>

                <div className="flex items-center gap-4 text-xs mb-4" style={{ color: 'var(--ink-soft)' }}>
                  <span className="flex items-center gap-1.5"><i className="lucide-file-text text-xs"></i> {d.wordCount} words</span>
                  <span className="flex items-center gap-1.5"><i className="lucide-target text-xs"></i> {d.triggersCount} triggers</span>
                </div>

                <div className="pt-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Draft</span>
                  <button className="text-xs font-medium flex items-center gap-1" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>Continue <i className="lucide-arrow-right text-xs"></i></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
