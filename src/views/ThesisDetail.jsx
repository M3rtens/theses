import { useEffect, useState } from 'react'
import PriceChart from '../components/PriceChart.jsx'
import { sampleTheses } from '../data/theses.js'
import { fmtPrice } from '../lib/format.js'

// Trigger status → label + CSS class used in the monitor cards.
const TRIGGER_META = {
  clear: { label: '● CLEAR', cls: 'trigger-clear' },
  warning: { label: '▲ WARNING', cls: 'trigger-warning' },
  breached: { label: '✕ BREACHED', cls: 'trigger-breached' },
}

export default function ThesisDetail({ navigate, thesis }) {
  // The thesis to show comes from navigation; fall back to the first sample so a
  // direct load (no selection) still renders something rather than a blank page.
  const base = thesis || sampleTheses[0]

  const [data, setData] = useState(null)
  useEffect(() => {
    let cancelled = false
    setData(null)
    const symbol = base.ticker || 'ASML'
    const from = base.entryDate || '2024-03-14'
    fetch(`/api/thesis?symbol=${encodeURIComponent(symbol)}&from=${from}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled && d && !d.error) setData(d) })
      .catch(() => { /* keep sealed/static values */ })
    return () => { cancelled = true }
  }, [base.ticker, base.entryDate])

  const d = data || {}

  // A user-published thesis stores its entry sealed in native currency; never let
  // the live fetch overwrite it. Samples carry no native entry, so use the live one.
  const sealed = base.currency != null
  const entry = sealed ? base.entry : (d.entry ?? base.entry)
  const current = d.current ?? base.current
  const currency = d.currency ?? base.currency ?? 'USD'
  const high = d.high ?? current
  const low = d.low ?? entry
  // Derive return from the displayed entry + current (side-adjusted) so the figures
  // agree; fall back to the stored return before the live price loads.
  const ret = (d.current != null && entry)
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

  const created = base.createdAt ? new Date(base.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : base.publishDate

  return (
    <>
      <header className="px-12 pt-6 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => navigate('dashboard')} className="hover:underline" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Dashboard</button>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span style={{ color: 'var(--ink-soft)' }}>{base.status === 'closed' ? 'Closed Theses' : 'Active Theses'}</span>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span className="font-mono">{base.ticker}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="seal"><i className="icon-fingerprint text-[11px]"></i> Locked {base.publishDate}</div>
          </div>
        </div>

        <div className="flex items-start justify-between gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-sm font-semibold">{base.ticker}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{company}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{sector}</span>
              <span className={`${sideClass} text-[10px] font-mono font-semibold px-2 py-0.5 rounded`}>{sideLabel}</span>
            </div>
            <h1 className="font-serif text-4xl font-medium tracking-tight leading-tight">{base.title}</h1>
            <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span>By <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Elena Vance</span></span>
              <span>·</span>
              <span className="font-mono">Published {base.publishDate}</span>
              <span>·</span>
              <span>{base.updates || 0} update{base.updates === 1 ? '' : 's'}</span>
              <span>·</span>
              <span className="font-mono">{base.daysActive ?? 0} days active</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Total Return</div>
            <div className={`font-serif text-5xl font-medium ${retClass}`}>{retSign}{Math.abs(ret).toFixed(1)}%</div>
            <div className="text-xs font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>
              vs S&amp;P {spReturn == null ? '—' : `${spReturn >= 0 ? '+' : '−'}${Math.abs(spReturn).toFixed(1)}%`} · Alpha {alpha == null ? '—' : `${alpha >= 0 ? '+' : '−'}${Math.abs(alpha).toFixed(1)}pp`}
            </div>
          </div>
        </div>
      </header>

      <div className="px-12 py-8 max-w-5xl">
        <div className="mb-8 p-6 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-medium">Price Since Publication</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Entry marked at publication timestamp · Cannot be retroactively edited</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
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
          </div>
          <PriceChart history={d.history} benchmark={d.benchmark} entry={entry} currency={currency} />
          <div className="flex items-center justify-between mt-4 pt-4 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-6">
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
            <span className="font-mono pulse-dot" style={{ color: 'var(--bull)' }}>● LIVE</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            {base.body
              ? <article className="editor-content" style={{ minHeight: 'auto' }} dangerouslySetInnerHTML={{ __html: base.body }} />
              : <article className="font-serif text-[17px] leading-[1.75]" style={{ color: 'var(--ink-soft)' }}>
                  <p>The full thesis text isn’t available for this entry.</p>
                </article>}

            <div className="mt-12">
              <div className="flex items-baseline justify-between mb-5">
                <h3 className="font-serif text-xl font-medium">Thesis Updates</h3>
                <button className="text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 border rounded-md" style={{ borderColor: 'var(--border-strong)', background: 'transparent', cursor: 'pointer' }}>
                  <i className="icon-plus text-xs"></i> Append Update
                </button>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {base.updates > 0
                  ? `${base.updates} update${base.updates === 1 ? '' : 's'} recorded on this thesis.`
                  : 'No updates appended yet.'}
              </p>
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
                  const meta = TRIGGER_META[trig.s] || TRIGGER_META.clear
                  const warn = trig.s === 'warning' || trig.s === 'breached'
                  return (
                    <div key={i} className={warn ? 'p-3 border-2 rounded' : 'p-3 border rounded'} style={warn ? { borderColor: trig.s === 'breached' ? 'var(--bear)' : 'var(--warn)', background: trig.s === 'breached' ? 'var(--bear-soft)' : 'var(--warn-soft)' } : { borderColor: 'var(--border)', background: 'white' }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Monitored live</span>
                      </div>
                      <p className="text-xs leading-snug">{trig.c}</p>
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
              </div>
              <p className="text-[10px] font-mono mt-2" style={{ color: 'var(--faint)' }}>Live via Yahoo Finance · TTM figures in reporting currency</p>
            </div>

            <div>
              <h4 className="font-serif text-base font-medium mb-3">Thesis Controls</h4>
              <div className="space-y-2">
                <button className="w-full text-left p-3 border rounded text-xs hover:bg-gray-50" style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Append Update</span>
                    <i className="icon-plus text-xs"></i>
                  </div>
                  <p style={{ color: 'var(--muted)' }} className="mt-0.5">Add timestamped note</p>
                </button>
                <button className="w-full text-left p-3 border rounded text-xs hover:bg-gray-50" style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Set Future Close Date</span>
                    <i className="icon-calendar text-xs"></i>
                  </div>
                  <p style={{ color: 'var(--muted)' }} className="mt-0.5">Non-changeable once set</p>
                </button>
                <button className="w-full text-left p-3 border rounded text-xs hover:bg-gray-50" style={{ borderColor: 'var(--border)', background: 'transparent', cursor: 'pointer' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Close Thesis Now</span>
                    <i className="icon-check text-xs"></i>
                  </div>
                  <p style={{ color: 'var(--muted)' }} className="mt-0.5">Lock final performance</p>
                </button>
                <button disabled className="w-full text-left p-3 border rounded text-xs opacity-50 cursor-not-allowed" style={{ borderColor: 'var(--border)', background: 'transparent' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Delete Thesis</span>
                    <i className="icon-lock text-xs"></i>
                  </div>
                  <p style={{ color: 'var(--muted)' }} className="mt-0.5">Disabled — integrity protected</p>
                </button>
              </div>
            </div>

            <div className="p-4 border rounded" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
              <div className="flex items-center gap-2 mb-2">
                <i className="icon-shield-check text-sm"></i>
                <span className="text-xs font-mono uppercase tracking-wider font-semibold">Integrity Record</span>
              </div>
              <div className="space-y-1.5 text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>
                <div className="flex justify-between"><span>Created:</span><span>{created}</span></div>
                <div className="flex justify-between"><span>Published:</span><span>{base.publishDate}</span></div>
                <div className="flex justify-between"><span>Entry locked:</span><span>{fmtPrice(entry, currency)}</span></div>
                <div className="flex justify-between"><span>Edits to body:</span><span>0 permitted</span></div>
                <div className="flex justify-between"><span>Deletions:</span><span>0 permitted</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
