import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useData } from '../components/DataProvider.jsx'
import { useUser } from '../components/UserProvider.jsx'
import PriceChart from '../components/PriceChart.jsx'
import SpreadsheetViewer from '../components/SpreadsheetViewer.jsx'
import ShareControls from '../components/ShareControls.jsx'
import ThesisBody from '../components/ThesisBody.jsx'
import { fmtPrice } from '../lib/format.js'
import { modelHasContent } from '../lib/model.js'
import { evaluateTrigger, latestMetric, formatMetricValue } from '../lib/triggers.js'

// Trigger status → label + CSS class used in the monitor cards.
const TRIGGER_META = {
  clear: { label: '● CLEAR', cls: 'trigger-clear' },
  warning: { label: '▲ WARNING', cls: 'trigger-warning' },
  breached: { label: '✕ BREACHED', cls: 'trigger-breached' },
}

// Chart timeframes. 'pub' (default) shows history since the thesis was published;
// the others show a trailing window / all available history, with the publication
// point still marked on the line.
const RANGES = [
  { key: 'pub', label: 'Since Pub' },
  { key: '1Y', label: '1Y' },
  { key: '5Y', label: '5Y' },
  { key: 'ALL', label: 'All' },
]

// The `from` date to request for a given range. Trailing windows are measured
// from today; 'ALL' reaches back far enough for Yahoo to return full history.
function rangeFrom(range, entryDate) {
  if (range === 'pub') return entryDate
  if (range === 'ALL') return '1970-01-01'
  const now = new Date()
  now.setFullYear(now.getFullYear() - (range === '5Y' ? 5 : 1))
  return now.toISOString().slice(0, 10)
}

export default function ThesisDetail({ navigate, thesis }) {
  // Refresh the app-wide cache after lifecycle mutations so the counts and
  // statuses on other views (My Theses, Triggers, Leaderboard) stay in step.
  const { refresh } = useData()
  const user = useUser()
  // The thesis to show comes from navigation. Guard against a direct load with no
  // selection so the hooks below still run against a defined object.
  const base = thesis || {}
  // Community-feed records carry their joined profile name. Owner-scoped records
  // do not, so fall back to the signed-in profile instead of presentation copy.
  const authorName = base.author || user?.name || 'Analyst'

  // Use the exact listing sealed at publication. Falling back to the display
  // ticker can silently switch a foreign security to an ADR or another venue,
  // making the chart and locked native-currency entry incomparable.
  const symbol = base.resolvedSymbol || base.ticker || 'ASML'
  const entryDate = base.entryDate || '2024-03-14'

  // Thesis stats (entry, current, financials, and the since-publication history)
  // are always anchored at the publication date, independent of the chart range.
  const [data, setData] = useState(null)
  useEffect(() => {
    let cancelled = false
    setData(null)
    fetch(`/api/thesis?symbol=${encodeURIComponent(symbol)}&from=${entryDate}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled && d && !d.error) setData(d) })
      .catch(() => { /* keep sealed/static values */ })
    return () => { cancelled = true }
  }, [symbol, entryDate])

  const d = data || {}

  // Full financial statements for the security, used to evaluate structured
  // triggers live against the latest filings. Only fetched when a trigger is
  // actually tied to a metric (samples use static statuses).
  const hasFinancialTriggers = (base.triggers || []).some((t) => t?.metric)
  const [statements, setStatements] = useState(null)
  useEffect(() => {
    if (!hasFinancialTriggers) { setStatements(null); return }
    let cancelled = false
    setStatements(null)
    fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((res) => { if (!cancelled && res && !res.error) setStatements(res) })
      .catch(() => { /* keep stored statuses */ })
    return () => { cancelled = true }
  }, [symbol, hasFinancialTriggers])

  // Chart timeframe. For non-'pub' ranges we fetch a wider history separately so
  // the stats above stay anchored at publication.
  const [range, setRange] = useState('ALL')
  const [ranged, setRanged] = useState(null)
  useEffect(() => {
    if (range === 'pub') { setRanged(null); return }
    let cancelled = false
    setRanged(null)
    const from = rangeFrom(range, entryDate)
    fetch(`/api/thesis?symbol=${encodeURIComponent(symbol)}&from=${from}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((res) => { if (!cancelled && res && !res.error) setRanged({ history: res.history, benchmark: res.benchmark }) })
      .catch(() => { /* keep the since-publication history */ })
    return () => { cancelled = true }
  }, [range, symbol, entryDate])

  // The series for the selected range. For non-'pub' ranges we wait for that
  // range's own fetch rather than falling back to the since-publication series —
  // otherwise the chart would briefly show "Since Pub" then jump to the range.
  const chartHistory = range === 'pub' ? d.history : ranged?.history
  const chartBench = range === 'pub' ? d.benchmark : ranged?.benchmark
  const chartReady = Array.isArray(chartHistory) && chartHistory.length > 0
  // Only mark publication when it actually falls inside the shown window; a short
  // trailing window (e.g. 1Y) may begin after an older thesis was published.
  const publishInWindow = entryDate >= rangeFrom(range, entryDate)
  const publishTime = publishInWindow ? entryDate : null

  // Lifecycle: status + scheduled/sealed close, tracked locally so the Thesis
  // Controls reflect a close action immediately without a reload.
  const [status, setStatus] = useState(base.status || 'active')
  const [closeDate, setCloseDate] = useState(base.closeDate || null)
  const [closedInfo, setClosedInfo] = useState(
    base.status === 'closed'
      ? { closePrice: base.closePrice ?? base.current, closeReturn: base.closeReturn ?? base.ret, closedAt: base.closedAt }
      : null
  )
  const isClosed = status === 'closed'

  // A user-published thesis stores its entry sealed in native currency; never let
  // the live fetch overwrite it. Samples carry no native entry, so use the live one.
  const sealed = base.currency != null
  const entry = sealed ? base.entry : (d.entry ?? base.entry)
  // A closed thesis shows its sealed final price/return; an open one tracks live.
  const current = isClosed ? (closedInfo?.closePrice ?? base.current) : (d.current ?? base.current)
  const currency = d.currency ?? base.currency ?? 'USD'
  const high = d.high ?? current
  const low = d.low ?? entry
  // Derive return from the displayed entry + current (side-adjusted) so the figures
  // agree; fall back to the stored return before the live price loads.
  const ret = isClosed
    ? (closedInfo?.closeReturn ?? base.ret)
    : (d.current != null && entry)
      ? Number(((base.side === 'bear' ? -1 : 1) * ((current - entry) / entry) * 100).toFixed(1))
      : base.ret
  const spReturn = d.spReturn ?? null
  const alpha = d.alpha ?? null

  const company = d.company ?? base.company ?? base.ticker
  const sector = d.sector ?? base.sector ?? '—'
  const fin = (k) => (d.financials && d.financials[k]) || '—'

  const sideClass = base.side === 'bull' ? 'side-bull' : 'side-bear'
  const sideLabel = base.side === 'bull' ? 'BULL · LONG' : 'BEAR · SHORT'
  const retClass = ret >= 0 ? 'ret-pos' : 'ret-neg'
  const retSign = ret >= 0 ? '+' : '−'

  const fmtStamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const created = base.createdAt ? fmtStamp(base.createdAt) : base.publishDate

  // Ownership comes from the database row, not from presentation fields such as
  // createdAt. This keeps community theses read-only for guests and other users.
  const owned = Boolean(user?.id && base.ownerId === user.id)

  // The update log, seeded from the stored thesis and grown in place as the
  // author appends notes, so newly saved updates appear without a reload.
  const [updateLog, setUpdateLog] = useState(() =>
    Array.isArray(base.updateLog) ? base.updateLog : []
  )
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const openComposer = () => {
    if (!owned) return
    setSaveError('')
    setComposerOpen(true)
  }

  const submitUpdate = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/theses/${base.id}/updates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const saved = await res.json()
      if (!res.ok) throw new Error(saved?.error || `HTTP ${res.status}`)
      setUpdateLog((log) => [...log, saved])
      setDraft('')
      setComposerOpen(false)
      refresh()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const updateCount = updateLog.length
  // Owned theses track their log locally; samples keep their static demo count.
  const displayUpdates = owned ? updateCount : (base.updates || 0)

  // Close-date scheduling + close-now, both hitting PATCH /api/theses/:id.
  const [closeDatePickerOpen, setCloseDatePickerOpen] = useState(false)
  const [closeDateDraft, setCloseDateDraft] = useState('')
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeAck, setCloseAck] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleError, setLifecycleError] = useState('')

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const patchLifecycle = async (body) => {
    const res = await fetch(`/api/theses/${base.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const saved = await res.json()
    if (!res.ok) throw new Error(saved?.error || `HTTP ${res.status}`)
    return saved
  }

  const openCloseDatePicker = () => {
    if (!owned || isClosed || closeDate) return
    setLifecycleError('')
    setCloseDateDraft(tomorrow)
    setCloseDatePickerOpen(true)
  }

  const submitCloseDate = async () => {
    if (!closeDateDraft || lifecycleBusy) return
    setLifecycleBusy(true)
    setLifecycleError('')
    try {
      const saved = await patchLifecycle({ action: 'schedule-close', closeDate: closeDateDraft })
      setCloseDate(saved.closeDate)
      setCloseDatePickerOpen(false)
      refresh()
    } catch (e) {
      setLifecycleError(e.message)
    } finally {
      setLifecycleBusy(false)
    }
  }

  const openCloseModal = () => {
    if (!owned || isClosed || lifecycleBusy) return
    setLifecycleError('')
    setCloseAck(false)
    setCloseDatePickerOpen(false)
    setCloseModalOpen(true)
  }

  const confirmClose = async () => {
    if (lifecycleBusy) return
    setLifecycleBusy(true)
    setLifecycleError('')
    try {
      const saved = await patchLifecycle({ action: 'close' })
      setStatus('closed')
      setClosedInfo({ closePrice: saved.closePrice, closeReturn: saved.closeReturn, closedAt: saved.closedAt })
      setCloseModalOpen(false)
      refresh()
    } catch (e) {
      setLifecycleError(e.message)
    } finally {
      setLifecycleBusy(false)
    }
  }

  const fmtDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <>
      <header className="px-4 pt-5 pb-5 sm:px-6 sm:pt-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3 text-sm overflow-x-auto max-w-full">
            <button onClick={() => navigate(user ? 'dashboard' : 'discover')} className="hover:underline" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: 'pointer' }}>{user ? 'Dashboard' : 'Discover'}</button>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span style={{ color: 'var(--ink-soft)' }}>{base.status === 'closed' ? 'Closed Theses' : 'Active Theses'}</span>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span className="font-mono">{base.ticker}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {base.id && <ShareControls path={`/theses/${base.id}`} title={`${base.ticker}: ${base.title}`} text={`Read ${authorName}'s investment thesis on ${base.ticker}.`} />}
            {isClosed
              ? <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>Closed{closedInfo?.closedAt ? ` ${fmtStamp(closedInfo.closedAt)}` : ''}</span>
              : closeDate
                ? <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>Closes {fmtDate(closeDate)}</span>
                : null}
            <div className="seal"><i className="icon-fingerprint text-[11px]"></i> Locked {base.publishDate}</div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-5 lg:flex-row lg:justify-between lg:gap-8">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <span className="font-mono text-sm font-semibold">{base.ticker}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{company}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{sector}</span>
              <span className={`${sideClass} text-[10px] font-mono font-semibold px-2 py-0.5 rounded`}>{sideLabel}</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight leading-tight">{base.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span>By {base.authorSlug
                ? <Link href={`/analysts/${base.authorSlug}`} className="hover:underline" style={{ color: 'var(--ink)', fontWeight: 500 }}>{authorName}</Link>
                : <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{authorName}</span>}
              </span>
              <span>·</span>
              <span className="font-mono">Published {base.publishDate}</span>
              <span>·</span>
              <span>{displayUpdates} update{displayUpdates === 1 ? '' : 's'}</span>
              <span>·</span>
              <span className="font-mono">{base.daysActive ?? 0} days active</span>
            </div>
          </div>
          <div className="text-left lg:text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Total Return</div>
            <div className={`font-serif text-4xl sm:text-5xl font-medium ${retClass}`}>{retSign}{Math.abs(ret).toFixed(1)}%</div>
            <div className="text-xs font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>
              vs S&amp;P {spReturn == null ? '—' : `${spReturn >= 0 ? '+' : '−'}${Math.abs(spReturn).toFixed(1)}%`} · Alpha {alpha == null ? '—' : `${alpha >= 0 ? '+' : '−'}${Math.abs(alpha).toFixed(1)}pp`}
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 sm:gap-8 mb-8 items-start">
          <div className="xl:col-span-3 p-4 sm:p-6 border rounded-md min-w-0" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-baseline sm:justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-medium">Price History</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Entry marked at publication timestamp · Cannot be retroactively edited</p>
            </div>
            <div className="flex max-w-full items-center gap-1 p-1 border rounded-md overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'white' }}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`lb-filter text-xs px-2.5 py-1 rounded ${range === r.key ? 'active' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs mb-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-px" style={{ background: 'var(--ink)' }}></span>
              <span style={{ color: 'var(--ink-soft)' }}>{base.ticker}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-px" style={{ background: 'var(--muted)', borderTop: '1px dashed var(--muted)' }}></span>
              <span style={{ color: 'var(--ink-soft)' }}>S&amp;P 500</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-px" style={{ background: 'var(--ink)', borderTop: '1px dashed var(--ink)' }}></span>
              <span style={{ color: 'var(--ink-soft)' }}>Entry</span>
            </div>
          </div>
          {chartReady
            ? <PriceChart history={chartHistory} benchmark={chartBench} entry={entry} currency={currency} publishTime={publishTime} />
            : <div className="flex items-center justify-center" style={{ height: 320 }}>
                <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>Loading chart…</span>
              </div>}
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mt-4 pt-4 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
            <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-center sm:gap-6">
              <div>
                <span style={{ color: 'var(--muted)' }}>Entry: </span>
                <span className="font-mono font-semibold">{fmtPrice(entry, currency)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Current: </span>
                <span className="font-mono font-semibold">{fmtPrice(current, currency)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>High: </span>
                <span className="font-mono">{fmtPrice(high, currency)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Low: </span>
                <span className="font-mono">{fmtPrice(low, currency)}</span>
              </div>
            </div>
            {isClosed
              ? <span className="font-mono" style={{ color: 'var(--muted)' }}>● SEALED</span>
              : <span className="font-mono pulse-dot" style={{ color: 'var(--bull)' }}>● LIVE</span>}
          </div>
          </div>

          <div className="xl:col-span-1 space-y-6">
            <div>
              <h4 className="font-serif text-base font-medium mb-3">Thesis Controls</h4>
              <div className="space-y-2">
                {!user && (
                  <button
                    type="button"
                    onClick={() => navigate('editor')}
                    className="w-full text-left p-3 border rounded text-xs hover:bg-gray-50"
                    style={{ borderColor: 'var(--border-strong)', background: 'white', cursor: 'pointer' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Sign in to publish</span>
                      <i className="icon-log-in text-xs"></i>
                    </div>
                    <p style={{ color: 'var(--muted)' }} className="mt-0.5">Create and manage your own theses</p>
                  </button>
                )}
                <button
                  onClick={openComposer}
                  disabled={!owned}
                  className={`w-full text-left p-3 border rounded text-xs ${owned ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                  style={{ borderColor: 'var(--border)', background: 'transparent', cursor: owned ? 'pointer' : 'not-allowed' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Append Update</span>
                    <i className="icon-plus text-xs"></i>
                  </div>
                  <p style={{ color: 'var(--muted)' }} className="mt-0.5">{owned ? 'Add timestamped note' : user ? 'Only on your own theses' : 'Sign in to manage theses'}</p>
                </button>
                {(() => {
                  const scheduleActive = owned && !isClosed && !closeDate
                  return (
                    <button
                      onClick={openCloseDatePicker}
                      disabled={!scheduleActive}
                      className={`w-full text-left p-3 border rounded text-xs ${scheduleActive ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                      style={{ borderColor: 'var(--border)', background: 'transparent', cursor: scheduleActive ? 'pointer' : 'not-allowed' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Set Future Close Date</span>
                        <i className="icon-calendar text-xs"></i>
                      </div>
                      <p style={{ color: 'var(--muted)' }} className="mt-0.5">
                        {isClosed ? 'Thesis already closed' : closeDate ? `Sealed to close ${fmtDate(closeDate)}` : owned ? 'Non-changeable once set' : 'Only on your own theses'}
                      </p>
                    </button>
                  )
                })()}
                {closeDatePickerOpen && (
                  <div className="p-3 border rounded" style={{ borderColor: 'var(--border-strong)', background: 'white' }}>
                    <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>Close date · sealed on save</label>
                    <input
                      type="date"
                      value={closeDateDraft}
                      min={tomorrow}
                      onChange={(e) => setCloseDateDraft(e.target.value)}
                      className="w-full text-xs p-2 border rounded"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--ink)' }}
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button onClick={() => { setCloseDatePickerOpen(false); setLifecycleError('') }} disabled={lifecycleBusy} className="text-xs px-2.5 py-1 border rounded" style={{ borderColor: 'var(--border)', background: 'transparent', cursor: lifecycleBusy ? 'not-allowed' : 'pointer' }}>Cancel</button>
                      <button onClick={submitCloseDate} disabled={lifecycleBusy || !closeDateDraft} className="btn-primary text-xs px-2.5 py-1 rounded" style={{ opacity: lifecycleBusy || !closeDateDraft ? 0.5 : 1, cursor: lifecycleBusy || !closeDateDraft ? 'not-allowed' : 'pointer' }}>{lifecycleBusy ? 'Sealing…' : 'Seal date'}</button>
                    </div>
                  </div>
                )}
                {(() => {
                  const closeActive = owned && !isClosed
                  return (
                    <button
                      onClick={openCloseModal}
                      disabled={!closeActive || lifecycleBusy}
                      className={`w-full text-left p-3 border rounded text-xs ${closeActive && !lifecycleBusy ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                      style={{ borderColor: 'var(--border)', background: 'transparent', cursor: closeActive && !lifecycleBusy ? 'pointer' : 'not-allowed' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Close Thesis Now</span>
                        <i className="icon-check text-xs"></i>
                      </div>
                      <p style={{ color: 'var(--muted)' }} className="mt-0.5">
                        {isClosed ? `Closed at ${fmtPrice(closedInfo?.closePrice ?? current, currency)}` : owned ? 'Lock final performance' : 'Only on your own theses'}
                      </p>
                    </button>
                  )
                })()}
                {lifecycleError && <p className="text-xs ret-neg">{lifecycleError}</p>}
              </div>
            </div>

            <div className="p-4 border rounded" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <div className="flex items-center gap-2 mb-2">
                <i className="icon-shield-check text-sm"></i>
                <span className="text-xs font-mono uppercase tracking-wider font-semibold">Record</span>
              </div>
              <div className="space-y-1.5 text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>
                <div className="flex justify-between"><span>Created:</span><span>{created}</span></div>
                <div className="flex justify-between"><span>Published:</span><span>{base.publishDate}</span></div>
                <div className="flex justify-between"><span>Entry locked:</span><span>{fmtPrice(entry, currency)}</span></div>
                <div className="flex justify-between"><span>Edits to body:</span><span>0 permitted</span></div>
                {isClosed
                  ? <>
                      <div className="flex justify-between"><span>Closed:</span><span>{closedInfo?.closedAt ? fmtStamp(closedInfo.closedAt) : '—'}</span></div>
                      <div className="flex justify-between"><span>Close locked:</span><span>{fmtPrice(closedInfo?.closePrice ?? current, currency)}</span></div>
                    </>
                  : closeDate
                    ? <div className="flex justify-between"><span>Close scheduled:</span><span>{fmtDate(closeDate)}</span></div>
                    : <div className="flex justify-between"><span>Status:</span><span>Active</span></div>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 min-w-0">
            {base.body
              ? <ThesisBody html={base.body} model={base.model} />
              : <article className="font-serif text-[17px] leading-[1.75]" style={{ color: 'var(--ink-soft)' }}>
                  <p>The full thesis text isn’t available for this entry.</p>
                </article>}

            {modelHasContent(base.model) && (
              <div className="mt-12">
                <div className="mb-4">
                  <h3 className="font-serif text-xl font-medium">Financial Model</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Sealed at publication · Read-only · Formulas evaluated live</p>
                </div>
                <SpreadsheetViewer model={base.model} />
              </div>
            )}

            <div className="mt-12">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-baseline sm:justify-between mb-5">
                <h3 className="font-serif text-xl font-medium">Thesis Updates</h3>
                {owned && !composerOpen && (
                  <button onClick={openComposer} className="text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 border rounded-md" style={{ borderColor: 'var(--border-strong)', background: 'transparent', cursor: 'pointer' }}>
                    <i className="icon-plus text-xs"></i> Append Update
                  </button>
                )}
              </div>

              {composerOpen && (
                <div className="mb-6 p-4 border rounded-md" style={{ borderColor: 'var(--border-strong)', background: 'white' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>New Update · timestamp sealed on save</div>
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="What changed in the thesis? Note the development and its implications…"
                    rows={4}
                    className="w-full text-sm p-3 border rounded resize-y"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)', color: 'var(--ink)' }}
                  />
                  {saveError && <p className="text-xs mt-2 ret-neg">{saveError}</p>}
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button
                      onClick={() => { setComposerOpen(false); setSaveError(''); setDraft('') }}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 border rounded-md"
                      style={{ borderColor: 'var(--border)', background: 'transparent', cursor: saving ? 'not-allowed' : 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitUpdate}
                      disabled={saving || !draft.trim()}
                      className="btn-primary text-xs px-3 py-1.5 rounded-md"
                      style={{ opacity: saving || !draft.trim() ? 0.5 : 1, cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer' }}
                    >
                      {saving ? 'Sealing…' : 'Append Update'}
                    </button>
                  </div>
                </div>
              )}

              {updateCount > 0 ? (
                <ol className="space-y-4">
                  {[...updateLog].reverse().map((u) => (
                    <li key={u.id} className="pl-4 border-l-2" style={{ borderColor: 'var(--border-strong)' }}>
                      <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                        <i className="icon-fingerprint text-[10px]"></i> {fmtStamp(u.at)}
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-soft)' }}>{u.text}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                !composerOpen && (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {owned ? 'No updates appended yet.' : `${displayUpdates} update${displayUpdates === 1 ? '' : 's'} recorded on this thesis.`}
                  </p>
                )
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="font-serif text-base font-medium mb-3">Trigger Monitor</h4>
              <div className="space-y-2">
                {(base.triggers || []).length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>No triggers defined.</p>
                )}
                {(base.triggers || []).map((trig, i) => {
                  // Re-evaluate financial triggers against the latest filings; fall
                  // back to the stored status for legacy/sample text triggers.
                  const tracked = Boolean(trig.metric) && Boolean(statements)
                  const evalRes = tracked ? evaluateTrigger(trig, statements) : null
                  const status = evalRes ? evalRes.status : trig.s
                  const meta = TRIGGER_META[status] || TRIGGER_META.clear
                  const warn = status === 'warning' || status === 'breached'
                  const latest = tracked ? latestMetric(statements, trig.statement, trig.period, trig.metric, trig.scale) : null
                  return (
                    <div key={i} className={warn ? 'p-3 border-2 rounded' : 'p-3 border rounded'} style={warn ? { borderColor: status === 'breached' ? 'var(--bear)' : 'var(--warn)', background: status === 'breached' ? 'var(--bear-soft)' : 'var(--warn-soft)' } : { borderColor: 'var(--border)', background: 'white' }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{trig.metric ? (statements ? 'Tracked live' : 'Loading…') : 'Monitored live'}</span>
                      </div>
                      <p className="text-xs leading-snug">{trig.c}</p>
                      {latest && (
                        <p className="text-[10px] font-mono mt-1" style={{ color: 'var(--muted)' }}>
                          Latest: {formatMetricValue(latest.value, latest.kind, trig.currency || statements.currency, trig.scale)}{latest.period ? ` · ${latest.period}` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <h4 className="font-serif text-base font-medium mb-3">Financials</h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Income Statement Highlights</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Revenue (TTM)</span><span className="font-mono">{fin('revenue')}</span></div>
                    <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Gross Profit</span><span className="font-mono">{fin('grossProfit')}</span></div>
                    <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Operating Income</span><span className="font-mono">{fin('operatingIncome')}</span></div>
                    <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Net Income</span><span className="font-mono">{fin('netIncome')}</span></div>
                    <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--ink-soft)' }}>Operating Margin</span><span className="font-mono font-semibold">{fin('operatingMargin')}</span></div>
                  </div>
                </div>
                <div className="p-4 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Balance Sheet Strength</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Cash &amp; Equivalents</span><span className="font-mono">{fin('cash')}</span></div>
                    <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Total Debt</span><span className="font-mono">{fin('totalDebt')}</span></div>
                    <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--ink-soft)' }}>Net Cash Position</span><span className="font-mono ret-pos">{fin('netCash')}</span></div>
                  </div>
                </div>
                <div className="p-4 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Cash Flow Statement</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><span style={{ color: 'var(--ink-soft)' }}>Operating Cash Flow (TTM)</span><span className="font-mono shrink-0">{fin('operatingCashFlow')}</span></div>
                    <div className="flex justify-between gap-3"><span style={{ color: 'var(--ink-soft)' }}>Capital Expenditures</span><span className="font-mono shrink-0">{fin('capitalExpenditure')}</span></div>
                    <div className="flex justify-between gap-3 border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--ink-soft)' }}>Free Cash Flow</span><span className="font-mono font-semibold shrink-0">{fin('freeCashFlow')}</span></div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-mono mt-2" style={{ color: 'var(--faint)' }}>Live via Yahoo Finance · TTM figures in reporting currency</p>
            </div>
          </div>
        </div>
      </div>

      {closeModalOpen && (
        <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4 sm:p-8">
          <div className="bg-white border rounded-lg max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto" style={{ borderColor: 'var(--border-strong)', boxShadow: '0 24px 60px rgba(0,0,0,0.15)' }}>
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <i className="icon-lock text-base"></i>
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Close &amp; Seal</span>
              </div>
              <h3 className="font-serif text-2xl font-medium">Close this thesis now?</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>This is a one-way action. The final performance is sealed from the live feed and the thesis cannot be reopened.</p>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="p-4 border rounded-md" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
                <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>What gets sealed · {base.ticker}</div>
                <div className="space-y-2">
                  <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Entry (locked)</span><span className="font-mono">{fmtPrice(entry, currency)}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'var(--ink-soft)' }}>Closing price (live)</span><span className="font-mono font-semibold">{fmtPrice(current, currency)}</span></div>
                  <div className="flex justify-between border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span style={{ color: 'var(--ink-soft)' }}>Final return</span><span className={`font-mono font-semibold ${retClass}`}>{retSign}{Math.abs(ret).toFixed(1)}%</span></div>
                </div>
                <p className="text-[10px] font-mono mt-3" style={{ color: 'var(--faint)' }}>Sealed at the exchange price the moment you confirm — the figures above may move slightly.</p>
              </div>
              <div className="flex items-start gap-3">
                <i className="icon-x text-base mt-0.5" style={{ color: 'var(--bear)' }}></i>
                <div>
                  <div className="font-medium">Cannot be reopened</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Live tracking stops and the return is frozen on your permanent record.</div>
                </div>
              </div>
              {lifecycleError && <p className="text-xs ret-neg">{lifecycleError}</p>}
            </div>
            <div className="p-4 sm:p-6 border-t flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <button onClick={() => { if (!lifecycleBusy) { setCloseModalOpen(false); setLifecycleError('') } }} className="text-sm font-medium" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: lifecycleBusy ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-2">
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  <input type="checkbox" checked={closeAck} onChange={(e) => setCloseAck(e.target.checked)} /> I understand this is irreversible
                </label>
                <button disabled={!closeAck || lifecycleBusy} onClick={confirmClose} className="btn-primary text-sm px-5 py-2 rounded-md flex items-center gap-2" style={{ opacity: (!closeAck || lifecycleBusy) ? 0.5 : 1, cursor: (!closeAck || lifecycleBusy) ? 'not-allowed' : 'pointer' }}>
                  <i className="icon-check text-xs"></i> {lifecycleBusy ? 'Sealing…' : 'Close & Seal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
