import { sampleDiscover } from '../data/theses.js'

export default function Discover({ navigate }) {
  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Community Feed</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Discover</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Recent theses published by the community. Performance is tracked from publish time.</p>
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button className="lb-filter active text-xs px-3 py-1 rounded">Trending</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Newest</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Top Performers</button>
          </div>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="grid grid-cols-2 gap-6">
          {sampleDiscover.map((t, i) => {
            const retClass = t.ret >= 0 ? 'ret-pos' : 'ret-neg'
            const sign = t.ret >= 0 ? '+' : '−'
            const sideClass = t.side === 'bull' ? 'side-bull' : 'side-bear'
            const sideLabel = t.side === 'bull' ? 'BULL' : 'BEAR'
            const initials = t.author.split(' ').map(n => n[0]).join('')
            return (
              <div key={i} className="thesis-card rounded-md p-6 cursor-pointer flex flex-col" onClick={() => navigate('thesis')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold" style={{ background: 'var(--bg-warm)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                      {initials}
                    </div>
                    <div>
                      <div className="text-xs font-medium">{t.author}</div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{t.handle} · {t.date}</div>
                    </div>
                  </div>
                  <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-sm font-semibold">{t.ticker}</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>·</span>
                  <span className={`font-mono text-sm font-semibold ${retClass}`}>{sign}{Math.abs(t.ret).toFixed(1)}%</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>since publish</span>
                </div>

                <h3 className="font-serif text-xl font-medium mb-2 leading-snug">{t.title}</h3>
                <p className="text-sm leading-relaxed mb-5 flex-1" style={{ color: 'var(--ink-soft)' }}>{t.snippet}</p>

                <div className="pt-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1"><i className="lucide-eye text-xs"></i> 1.2k</span>
                    <span className="flex items-center gap-1"><i className="lucide-message-square text-xs"></i> 48</span>
                  </div>
                  <span className="font-medium">Read thesis →</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
