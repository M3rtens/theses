import ThesisCard from '../components/ThesisCard.jsx'
import { sampleTheses } from '../data/theses.js'
import { useLiveTheses } from '../lib/useLiveTheses.js'

export default function Profile({ navigate }) {
  const live = useLiveTheses(sampleTheses)
  return (
    <>
      <header className="px-12 pt-8 pb-8 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center font-mono text-2xl font-semibold shrink-0" style={{ background: 'var(--ink)', color: 'white' }}>EV</div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-serif text-3xl font-medium tracking-tight">Elena Vance</h1>
              <span className="seal"><i className="icon-badge-check text-[11px]"></i> Verified Analyst</span>
            </div>
            <div className="text-sm font-mono" style={{ color: 'var(--muted)' }}>@evance · Joined Jan 2022 · San Francisco</div>
            <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--ink-soft)' }}>Long-biased equity analyst focused on capital-intensive monopolies and structural supply constraints. CFA Charterholder. Former sell-side at Bernstein.</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Global Rank</div>
            <div className="font-serif text-4xl font-medium">#14</div>
            <div className="text-xs font-mono" style={{ color: 'var(--ink-soft)' }}>Top 0.5% of 2,841</div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-px mt-8" style={{ background: 'var(--border)' }}>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Win Rate</div>
            <div className="font-serif text-3xl font-medium">71%</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>5W / 2L · 7 closed</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Avg Return</div>
            <div className="font-serif text-3xl font-medium ret-pos">+11.4%</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>Per thesis</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Annualized</div>
            <div className="font-serif text-3xl font-medium ret-pos">+19.8%</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>vs S&amp;P +11.2%</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Total Theses</div>
            <div className="font-serif text-3xl font-medium">12</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>7 active · 5 closed</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Avg Hold</div>
            <div className="font-serif text-3xl font-medium">214d</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>~7 months</div>
          </div>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-serif text-xl font-medium">Published Theses</h2>
              <div className="flex items-center gap-1 p-1 border rounded" style={{ borderColor: 'var(--border)', background: 'white' }}>
                <button className="text-xs px-3 py-1 rounded" style={{ background: 'var(--ink)', color: 'white' }}>All</button>
                <button className="text-xs px-3 py-1 rounded">Active</button>
                <button className="text-xs px-3 py-1 rounded">Closed</button>
              </div>
            </div>
            <div className="space-y-3">
              {sampleTheses.map(t => (
                <ThesisCard key={t.id} thesis={t} variant="profile" live={live[t.ticker]} onOpen={() => navigate('thesis')} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-serif text-xl font-medium mb-5">By Sector</h2>
            <div className="space-y-3 mb-8">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Semiconductors</span>
                  <span className="font-mono">5 · +14.2% avg</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: '82%', background: 'var(--ink)' }}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Energy</span>
                  <span className="font-mono">3 · +8.7% avg</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: '52%', background: 'var(--ink)' }}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Software</span>
                  <span className="font-mono">2 · −2.1% avg</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: '28%', background: 'var(--bear)' }}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Cybersecurity</span>
                  <span className="font-mono">1 · +22.7%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: '18%', background: 'var(--ink)' }}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Consumer</span>
                  <span className="font-mono">1 · +4.3%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: '12%', background: 'var(--ink)' }}></div></div>
              </div>
            </div>

            <h2 className="font-serif text-xl font-medium mb-5">Integrity Record</h2>
            <div className="p-4 border rounded" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <div className="space-y-2 text-xs font-mono" style={{ color: 'var(--ink-soft)' }}>
                <div className="flex justify-between"><span>Theses published:</span><span>12</span></div>
                <div className="flex justify-between"><span>Theses deleted:</span><span style={{ color: 'var(--bull)' }}>0 (not permitted)</span></div>
                <div className="flex justify-between"><span>Backdated entries:</span><span style={{ color: 'var(--bull)' }}>0 (not permitted)</span></div>
                <div className="flex justify-between"><span>Body edits post-publish:</span><span style={{ color: 'var(--bull)' }}>0 (not permitted)</span></div>
                <div className="flex justify-between"><span>Updates appended:</span><span>18</span></div>
                <div className="flex justify-between"><span>Triggers breached:</span><span>2</span></div>
                <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span>Integrity score:</span><span style={{ color: 'var(--bull)', fontWeight: 600 }}>100%</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
