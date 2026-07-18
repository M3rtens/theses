import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ThesisCard from '../components/ThesisCard.jsx'
import DeleteAccountModal from '../components/DeleteAccountModal.jsx'
import { useUser } from '../components/UserProvider.jsx'
import { loadProfile, saveProfile } from '../lib/profile.js'
import { makeRetOf, selfStats } from '../lib/stats.js'
import { createClient } from '../lib/supabase/client'
import { useLeaderboard } from '../lib/useLeaderboard.js'
import { useLiveTheses } from '../lib/useLiveTheses.js'
import { useStoredTheses } from '../lib/useStoredTheses.js'

const THESIS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
]

export default function Profile({ navigate }) {
  const user = useUser()
  const router = useRouter()
  const published = useStoredTheses()
  const live = useLiveTheses(published)

  // Own stat tiles are computed live from this user's theses; rank and the total
  // analyst count come from the database-wide leaderboard.
  const board = useLeaderboard()
  const stats = useMemo(() => selfStats(published, makeRetOf(live)), [published, live])
  const myRow = board.find((r) => r.isYou)
  const myRank = myRow?.rank ?? null
  const me = { ...stats, name: user?.name || 'You', handle: user?.handle || '', avatar: user?.avatar || '—' }
  const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`
  const retClass = (n) => (n >= 0 ? 'ret-pos' : 'ret-neg')

  // Inline profile editor. `editing` holds the {name, bio} draft while open
  // (null when closed). Bio persists to localStorage; name is written to the
  // Supabase auth account so it flows back through the identity context.
  const [bio, setBio] = useState('')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  useEffect(() => { setBio(loadProfile().bio) }, [])

  const openEditor = () => { setSaveError(''); setEditing({ name: me?.name || '', bio }) }

  const saveEdits = async () => {
    setSaving(true)
    setSaveError('')
    try {
      // Persist the bio locally.
      setBio(saveProfile({ bio: editing.bio.trim() }).bio)
      // Persist a changed name to the auth account, then refresh so the
      // identity context re-derives from the updated metadata.
      const newName = editing.name.trim()
      if (newName && newName !== me?.name) {
        const { error } = await createClient().auth.updateUser({ data: { full_name: newName } })
        if (error) throw error
        router.refresh()
      }
      setEditing(null)
    } catch (e) {
      setSaveError(e.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  // Account deletion (irreversible) — confirmed via DeleteAccountModal.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      router.refresh() // session cleared server-side → lands on login
    } catch (e) {
      setDeleteError(e.message || 'Could not delete account.')
      setDeleting(false)
    }
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
              <div className="mt-3 max-w-xl">
                <label className="block text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Display name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  autoFocus
                  className="w-full text-sm p-2 border rounded mb-3"
                  style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
                />
                <label className="block text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Bio</label>
                <textarea
                  value={editing.bio}
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                  rows={3}
                  maxLength={280}
                  className="w-full text-sm p-2 border rounded"
                  style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)', resize: 'vertical' }}
                />
                {saveError && <p className="text-[12px] mt-1" style={{ color: 'var(--bear)' }}>{saveError}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" onClick={saveEdits} disabled={saving} className="btn-primary text-xs px-3 py-1.5 rounded">{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={() => setEditing(null)} disabled={saving} className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: 'var(--muted)' }}>{editing.bio.length}/280</span>
                </div>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Global Rank</div>
            <div className="font-serif text-4xl font-medium">{myRank ? `#${myRank}` : '—'}</div>
            <div className="text-xs font-mono" style={{ color: 'var(--ink-soft)' }}>of {board.length} analyst{board.length === 1 ? '' : 's'}</div>
            {editing === null && (
              <div className="mt-3 flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={openEditor}
                  className="text-xs px-3 py-1.5 rounded border inline-flex items-center gap-1.5"
                  style={{ borderColor: 'var(--border)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}
                >
                  <i className="icon-pencil text-[11px]"></i> Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(''); setDeleteOpen(true) }}
                  className="text-xs px-3 py-1.5 rounded border inline-flex items-center gap-1.5"
                  style={{ borderColor: 'var(--border)', background: 'transparent', color: 'var(--bear)', cursor: 'pointer' }}
                >
                  <i className="icon-trash-2 text-[11px]"></i> Delete Profile
                </button>
              </div>
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

      <DeleteAccountModal
        open={deleteOpen}
        deleting={deleting}
        error={deleteError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteAccount}
      />
    </>
  )
}
