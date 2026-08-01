import { useState } from 'react'
import ShareControls from '../components/ShareControls.jsx'
import ThesisCard from '../components/ThesisCard.jsx'
import { useUser } from '../components/UserProvider.jsx'

const FILTERS = ['all', 'active', 'closed']

const formatJoined = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : `Joined ${date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}`
}

const signed = (value) => `${Number(value) >= 0 ? '+' : '−'}${Math.abs(Number(value) || 0).toFixed(1)}%`

export default function AnalystProfile({ analyst, navigate }) {
  const user = useUser()
  const [filter, setFilter] = useState('all')
  const theses = analyst?.theses || []
  const stats = analyst?.stats || {}
  const visible = theses.filter((thesis) => filter === 'all' || (filter === 'closed' ? thesis.status === 'closed' : thesis.status !== 'closed'))

  const sectorCounts = new Map()
  theses.forEach((thesis) => {
    const sector = thesis.sector || 'Uncategorised'
    sectorCounts.set(sector, (sectorCounts.get(sector) || 0) + 1)
  })
  const sectors = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])
  const maximumSector = sectors.reduce((maximum, [, count]) => Math.max(maximum, count), 0)

  if (!analyst) return null

  return (
    <>
      <header className="px-4 pt-6 pb-6 sm:px-6 sm:pt-8 sm:pb-8 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:gap-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center font-mono text-xl sm:text-2xl font-semibold shrink-0" style={{ background: 'var(--ink)', color: 'white' }}>{analyst.avatar || '—'}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
              <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight">{analyst.name}</h1>
              {analyst.verified && <span className="seal"><i className="icon-badge-check text-[11px]"></i> Verified Analyst</span>}
            </div>
            <div className="text-sm font-mono" style={{ color: 'var(--muted)' }}>
              {[analyst.handle, formatJoined(analyst.joinedAt), analyst.location].filter(Boolean).join(' · ')}
            </div>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: analyst.bio ? 'var(--ink-soft)' : 'var(--muted)' }}>
              {analyst.bio || 'This analyst has not added a public bio yet.'}
            </p>
            <div className="mt-4">
              <ShareControls path={`/analysts/${analyst.slug}`} title={`${analyst.name} on Theses`} text="View this analyst’s published investment record." />
            </div>
          </div>
          {user?.id === analyst.userId && (
            <button type="button" onClick={() => navigate('profile')} className="btn-secondary text-xs px-3 py-2 rounded-md inline-flex items-center gap-1.5">
              <i className="icon-pencil text-xs"></i> Edit your profile
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px mt-8" style={{ background: 'var(--border)' }}>
          {[
            ['Win Rate', `${stats.winRate || 0}%`, 'Closed theses'],
            ['Avg Return', signed(stats.avgReturn), 'Per thesis'],
            ['Annualized', signed(stats.annualized), 'Time-adjusted'],
            ['Total Theses', stats.theses || 0, 'Published'],
            ['Avg Hold', stats.avgHold || '0d', 'Per thesis'],
          ].map(([label, value, detail]) => (
            <div key={label} className="p-4" style={{ background: 'var(--bg)' }}>
              <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
              <div className="font-serif text-3xl font-medium">{value}</div>
              <div className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>{detail}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <section className="xl:col-span-2">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
              <h2 className="font-serif text-xl font-medium">Published Theses</h2>
              <div className="flex items-center gap-1 p-1 border rounded" style={{ borderColor: 'var(--border)', background: 'white' }}>
                {FILTERS.map((value) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`lb-filter text-xs px-3 py-1 rounded ${filter === value ? 'active' : ''}`}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {visible.map((thesis) => <ThesisCard key={thesis.id} thesis={thesis} variant="profile" onOpen={() => navigate('thesis', thesis)} />)}
              {!visible.length && <p className="text-sm" style={{ color: 'var(--muted)' }}>No {filter === 'all' ? '' : `${filter} `}theses to show.</p>}
            </div>
          </section>

          <aside>
            <h2 className="font-serif text-xl font-medium mb-5">Coverage by Sector</h2>
            <div className="space-y-3">
              {sectors.map(([sector, count]) => (
                <div key={sector}>
                  <div className="flex justify-between text-xs mb-1"><span>{sector}</span><span className="font-mono">{count}</span></div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${maximumSector ? (count / maximumSector) * 100 : 0}%`, background: 'var(--ink)' }}></div>
                  </div>
                </div>
              ))}
              {!sectors.length && <p className="text-sm" style={{ color: 'var(--muted)' }}>No published sector coverage yet.</p>}
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
