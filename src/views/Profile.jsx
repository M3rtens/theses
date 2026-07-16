import { useEffect, useMemo, useState } from 'react'
import ThesisCard from '../components/ThesisCard.jsx'
import { leaderboardData } from '../data/theses.js'
import { loadProfile, saveProfile } from '../lib/profile.js'
import { makeRetOf, rankedLeaderboard } from '../lib/stats.js'
import { useLiveTheses } from '../lib/useLiveTheses.js'
import { useStoredTheses } from '../lib/useStoredTheses.js'

const THESIS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
]

export default function Profile({ navigate }) {
  const published = useStoredTheses()
  const live = useLiveTheses(published)

  // The profile mirrors this analyst's row on the leaderboard — computed from
  // their real theses and re-ranked by return — so both surfaces agree.
  const board = useMemo(() => rankedLeaderboard(leaderboardData, published, live), [published, live])
  const meIdx = board.findIndex((r) => r.isYou)
  const me = meIdx >= 0 ? board[meIdx] : null
  const myRank = meIdx + 1
  const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`
  const retClass = (n) => (n >= 0 ? 'ret-pos' : 'ret-neg')

  // Editable description, persisted to localStorage. `editing` holds the draft
  // text while the inline editor is open (null when closed).
  const [bio, setBio] = useState('')
  const [editing, setEditing] = useState(null)
  useEffect(() => { setBio(loadProfile().bio) }, [])
  const saveBio = () => {
    const next = saveProfile({ bio: editing.trim() }).bio
    setBio(next)
    setEditing(null)
  }

  // Published-theses list filter (All / Active / Closed).
  const [thesisFilter, setThesisFilter] = useState('all')
  const visibleTheses = published.filter((t) => {
    if (thesisFilter === 'active') return t.status !== 'closed'
    if (thesisFilter === 'closed') return t.status === 'closed'
    return true
  })

  // Sector breakdown computed from the real theses: count and average
  // side-adjusted return per sector, ordered by holding count. Bar width is
  // proportional to the largest sector; colour tracks the sign of the average.
  const sectors = useMemo(() => {
    const retOf = makeRetOf(live)
    const map = new Map()
    for (const t of published) {
      const key = t.sector || 'Uncategorised'
      const e = map.get(key) || { sector: key, count: 0, sum: 0 }
      e.count += 1
      e.sum += retOf(t)
      map.set(key, e)
    }
    return [...map.values()]
      .map((e) => ({ ...e, avg: e.count ? e.sum / e.count : 0 }))
      .sort((a, b) => b.count - a.count || b.avg - a.avg)
  }, [published, live])
  const maxSectorCount = sectors.reduce((m, s) => Math.max(m, s.count), 0)

  return (
    <>
      <header className="px-12 pt-8 pb-8 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center font-mono text-2xl font-semibold shrink-0" style={{ background: 'var(--ink)', color: 'white' }}>{me?.avatar || '—'}</div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-serif text-3xl font-medium tracking-tight">{me?.name || 'You'}</h1>
              <span className="seal"><i className="icon-badge-check text-[11px]"></i> Verified Analyst</span>
            </div>
            <div className="text-sm font-mono" style={{ color: 'var(--muted)' }}>{me?.handle || ''} · Joined Jan 2022 · San Francisco</div>
            {editing === null ? (
              <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--ink-soft)' }}>{bio}</p>
            ) : (
              <div className="mt-2 max-w-xl">
                <textarea
                  value={editing}
                  onChange={(e) => setEditing(e.target.value)}
                  rows={3}
                  maxLength={280}
                  autoFocus
                  className="w-full text-sm p-2 border rounded"
                  style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)', resize: 'vertical' }}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" onClick={saveBio} className="btn-primary text-xs px-3 py-1.5 rounded">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: 'var(--muted)' }}>{editing.length}/280</span>
                </div>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Global Rank</div>
            <div className="font-serif text-4xl font-medium">{me ? `#${myRank}` : '—'}</div>
            <div className="text-xs font-mono" style={{ color: 'var(--ink-soft)' }}>of {board.length} analysts</div>
            {editing === null && (
              <button
                type="button"
                onClick={() => setEditing(bio)}
                className="text-xs px-3 py-1.5 rounded border mt-3 inline-flex items-center gap-1.5"
                style={{ borderColor: 'var(--border)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}
              >
                <i className="icon-pencil text-[11px]"></i> Edit Profile
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-px mt-8" style={{ background: 'var(--border)' }}>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Win Rate</div>
            <div className="font-serif text-3xl font-medium">{me ? `${me.winRate}%` : '—'}</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>Across closed theses</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Avg Return</div>
            <div className={`font-serif text-3xl font-medium ${me ? retClass(me.avgReturn) : ''}`}>{me ? signed(me.avgReturn) : '—'}</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>Per thesis</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Annualized</div>
            <div className={`font-serif text-3xl font-medium ${me ? retClass(me.annualized) : ''}`}>{me ? signed(me.annualized) : '—'}</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>Time-adjusted</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Total Theses</div>
            <div className="font-serif text-3xl font-medium">{me ? me.theses : '—'}</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>Published</div>
          </div>
          <div className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Avg Hold</div>
            <div className="font-serif text-3xl font-medium">{me?.avgHold || '—'}</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>Per thesis</div>
          </div>
        </div>
      </header>

      <div className="px-12 py-8">
        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-serif text-xl font-medium">Published Theses</h2>
              <div className="flex items-center gap-1 p-1 border rounded" style={{ borderColor: 'var(--border)', background: 'white' }}>
                {THESIS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={thesisFilter === f.value}
                    onClick={() => setThesisFilter(f.value)}
                    className="text-xs px-3 py-1 rounded"
                    style={thesisFilter === f.value ? { background: 'var(--ink)', color: 'white' } : { background: 'transparent', color: 'var(--ink)' }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {visibleTheses.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {published.length === 0 ? 'No published theses yet.' : `No ${thesisFilter} theses.`}
                </p>
              )}
              {visibleTheses.map(t => (
                <ThesisCard key={t.id} thesis={t} variant="profile" live={live[t.ticker]} onOpen={() => navigate('thesis', t)} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-serif text-xl font-medium mb-5">By Sector</h2>
            <div className="space-y-3 mb-8">
              {sectors.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No theses to break down yet.</p>
              )}
              {sectors.map((s) => (
                <div key={s.sector}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{s.sector}</span>
                    <span className="font-mono">{s.count} · {signed(s.avg)} avg</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${maxSectorCount ? (s.count / maxSectorCount) * 100 : 0}%`, background: s.avg >= 0 ? 'var(--ink)' : 'var(--bear)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
