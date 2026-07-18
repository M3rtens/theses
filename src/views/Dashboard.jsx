import ThesisCard from '../components/ThesisCard.jsx'
import { useUser } from '../components/UserProvider.jsx'
import { useLeaderboard } from '../lib/useLeaderboard.js'
import { relativeTime } from '../lib/drafts.js'
import { useLiveTheses } from '../lib/useLiveTheses.js'
import { useStoredTheses } from '../lib/useStoredTheses.js'

export default function Dashboard({ navigate }) {
  const user = useUser()
  // Published theses from the store, matching My Theses.
  const stored = useStoredTheses()
  const allTheses = stored
  const active = allTheses.filter((t) => t.status !== 'closed')
  const live = useLiveTheses(active)

  // Portfolio stats computed from the theses themselves: live native-currency
  // position return where available, else the sealed static figure. Return is
  // already side-adjusted (a bear thesis gains when the price falls).
  const retOf = (t) => live[t.ticker]?.ret ?? t.ret
  const returns = allTheses.map(retOf).filter((r) => typeof r === 'number')
  const avgReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const avgClass = avgReturn >= 0 ? 'ret-pos' : 'ret-neg'
  const closed = allTheses.filter((t) => t.status === 'closed')
  const wins = closed.filter((t) => retOf(t) > 0).length
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : null
  // Rank comes from the database-computed leaderboard.
  const board = useLeaderboard()
  const me = board.find((r) => r.isYou)

  // Trigger alerts, derived live from the theses themselves. useStoredTheses()
  // loads via POST /api/theses/evaluate, which recomputes and persists each
  // stored thesis's financial-trigger statuses against the latest filings — so a
  // trigger that has breached (or is nearing its threshold) surfaces here without
  // any hand-maintained list. Breached first, then warning; within each, the most
  // recently published thesis leads so fresh triggers rise to the top.
  const STATUS_RANK = { breached: 0, warning: 1 }
  const alertOf = (tr, thesis) => ({ condition: tr.c, status: tr.s, thesis })
  const alerts = active
    .flatMap((t) => (t.triggers || [])
      .filter((tr) => tr.s === 'breached' || tr.s === 'warning')
      .map((tr) => alertOf(tr, t)))
    .sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status]
      if (byStatus !== 0) return byStatus
      return new Date(b.thesis.createdAt || 0) - new Date(a.thesis.createdAt || 0)
    })
  const VISIBLE_ALERTS = 5
  const shownAlerts = alerts.slice(0, VISIBLE_ALERTS)
  const alertColor = (status) => (status === 'breached' ? '--bear' : '--warn')
  const alertLabel = (status) => (status === 'breached' ? 'BREACHED' : 'WARNING')

  // Recent updates, drawn from every thesis's server-sealed update log (appended
  // via POST /api/theses/:id/updates, timestamped server-side). Flattened across
  // theses and shown newest first. u.id is the per-thesis sequence number, so it
  // doubles as the "Update #N" label.
  const recentUpdates = allTheses
    .flatMap((t) => (Array.isArray(t.updateLog) ? t.updateLog : []).map((u) => ({ ...u, thesis: t })))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 5)

  // Greeting keyed to the viewer's local time of day.
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <header className="px-12 pt-8 pb-6 flex items-end justify-between border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">{greeting}{user?.firstName ? `, ${user.firstName}` : ''}.</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>You have <span style={{ color: alerts.length ? 'var(--bear)' : 'var(--ink-soft)', fontWeight: 500 }}>{alerts.length} trigger alert{alerts.length === 1 ? '' : 's'}</span> and <span style={{ fontWeight: 500 }}>1 draft</span> awaiting review.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="seal"><i className="icon-shield-check text-[11px]"></i> Integrity: Verified</div>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="grid grid-cols-4 gap-px mb-10" style={{ background: 'var(--border)' }}>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Active Theses</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium">{active.length}</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>of {allTheses.length} published</span>
            </div>
          </div>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Avg. Return</div>
            <div className="flex items-baseline gap-2">
              <span className={`font-serif text-4xl font-medium ${avgClass}`}>{avgReturn >= 0 ? '+' : '−'}{Math.abs(avgReturn).toFixed(1)}%</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>across {returns.length} theses</span>
            </div>
          </div>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Win Rate</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium">{winRate == null ? '—' : `${winRate}%`}</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>{winRate == null ? 'no closed theses' : `${wins} of ${closed.length} closed`}</span>
            </div>
          </div>
          <div className="p-5" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Leaderboard Rank</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl font-medium">{me ? `#${me.rank}` : '—'}</span>
              <span className="text-xs num-mono" style={{ color: 'var(--ink-soft)' }}>of {board.length}</span>
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
              {active.map(t => (
                <ThesisCard key={`${t.createdAt ? 'u' : 's'}-${t.id}`} thesis={t} variant="dashboard" live={live[t.ticker]} onOpen={() => navigate('thesis', t)} />
              ))}
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif text-xl font-medium">Trigger Alerts</h2>
                {alerts.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ background: 'var(--bear-soft)', color: 'var(--bear)' }}>{alerts.length} ACTIVE</span>
                )}
              </div>
              <div className="space-y-3">
                {alerts.length === 0 && (
                  <div className="p-4 border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                    <p className="text-sm leading-snug" style={{ color: 'var(--ink-soft)' }}>No triggers breached or approaching threshold. All active theses are within safe parameters.</p>
                  </div>
                )}
                {shownAlerts.map((a, i) => {
                  const color = alertColor(a.status)
                  return (
                    <div key={`${a.thesis.ticker}-${i}`} className="p-4 border" style={{ borderColor: `var(${color})`, background: `var(${color}-soft)` }}>
                      <div className="flex items-start justify-between mb-1">
                        <span className="font-mono text-xs font-semibold" style={{ color: `var(${color})` }}>{a.thesis.ticker} · {(a.thesis.side || '').toUpperCase()}</span>
                        <span className="text-[10px] font-mono" style={{ color: `var(${color})` }}>{alertLabel(a.status)}</span>
                      </div>
                      <p className="text-sm leading-snug">{a.condition}</p>
                      <button onClick={() => navigate('thesis', a.thesis)} className="text-xs font-medium mt-2 underline" style={{ color: `var(${color})`, background: 'transparent', border: 'none', cursor: 'pointer' }}>Review thesis →</button>
                    </div>
                  )
                })}
                {alerts.length > shownAlerts.length && (
                  <button onClick={() => navigate('triggers')} className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>+{alerts.length - shownAlerts.length} more →</button>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif text-xl font-medium">Recent Updates</h2>
              </div>
              <div className="space-y-4 text-sm">
                {recentUpdates.length === 0 && (
                  <div className="p-4 border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                    <p className="text-sm leading-snug" style={{ color: 'var(--ink-soft)' }}>No updates appended yet. Updates you append to a thesis will appear here.</p>
                  </div>
                )}
                {recentUpdates.map((u) => (
                  <button
                    key={`${u.thesis.id}-${u.id}`}
                    onClick={() => navigate('thesis', u.thesis)}
                    className="border-l-2 pl-3 block w-full text-left"
                    style={{ borderColor: 'var(--border-strong)', background: 'transparent', cursor: 'pointer' }}
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{relativeTime(new Date(u.at).getTime())} · {u.thesis.ticker}</div>
                    <p className="leading-snug mt-0.5">Update #{u.id}: {u.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
