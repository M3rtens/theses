import ThesisCard from '../components/ThesisCard.jsx'
import { sampleTheses } from '../data/theses.js'
import { useLiveTheses } from '../lib/useLiveTheses.js'

const ACTIVE = sampleTheses.slice(0, 5)

export default function Dashboard({ navigate }) {
  const live = useLiveTheses(ACTIVE)
  return (
    <>
      <header className="px-12 pt-8 pb-6 flex items-end justify-between border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Thursday, March 14 · 16:32 EST</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">Good afternoon, Elena.</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>You have <span style={{ color: 'var(--bear)', fontWeight: 500 }}>2 trigger alerts</span> and <span style={{ fontWeight: 500 }}>1 draft</span> awaiting review.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="seal"><i className="lucide-shield-check text-[11px]"></i> Integrity: Verified</div>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="grid grid-cols-4 gap-px mb-10" style={{ background: 'var(--border)' }}>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Active Theses</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium">7</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>of 12 published</span>
            </div>
          </div>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Avg. Return</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium ret-pos">+11.4%</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>vs S&amp;P +6.2%</span>
            </div>
          </div>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Win Rate</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium">71%</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>5 of 7 closed</span>
            </div>
          </div>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Leaderboard Rank</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium">#14</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>of 2,841</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-serif text-xl font-medium">Active Theses</h2>
              <button onClick={() => navigate('mytheses')} className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>View all →</button>
            </div>
            <div className="space-y-3">
              {ACTIVE.map(t => (
                <ThesisCard key={t.id} thesis={t} variant="dashboard" live={live[t.ticker]} onOpen={() => navigate('thesis')} />
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif text-xl font-medium">Trigger Alerts</h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ background: 'var(--bear-soft)', color: 'var(--bear)' }}>2 ACTIVE</span>
              </div>
              <div className="space-y-3">
                <div className="p-4 border" style={{ borderColor: 'var(--bear)', background: 'var(--bear-soft)' }}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--bear)' }}>SNAP · BEAR</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--bear)' }}>BREACHED</span>
                  </div>
                  <p className="text-sm leading-snug">DAU growth fell below 2% for second consecutive quarter. Invalidation condition met.</p>
                  <button onClick={() => navigate('thesis')} className="text-xs font-medium mt-2 underline" style={{ color: 'var(--bear)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Review thesis →</button>
                </div>
                <div className="p-4 border" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--warn)' }}>ASML · BULL</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--warn)' }}>WARNING</span>
                  </div>
                  <p className="text-sm leading-snug">China revenue approaching 25% threshold. Currently at 21%.</p>
                  <button onClick={() => navigate('thesis')} className="text-xs font-medium mt-2 underline" style={{ color: 'var(--warn)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Review thesis →</button>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif text-xl font-medium">Recent Updates</h2>
              </div>
              <div className="space-y-4 text-sm">
                <div className="border-l-2 pl-3" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>2 days ago · ASML</div>
                  <p className="leading-snug mt-0.5">Update #3: Q4 backlog expanded to €36B. EUV shipments tracking above forecast.</p>
                </div>
                <div className="border-l-2 pl-3" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>5 days ago · CRWD</div>
                  <p className="leading-snug mt-0.5">Update #2: Falcon platform ARR growth reaccelerated to 34%.</p>
                </div>
                <div className="border-l-2 pl-3" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>1 week ago · CVX</div>
                  <p className="leading-snug mt-0.5">Update #1: Hess acquisition closed. Permian synergies materializing ahead of schedule.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
