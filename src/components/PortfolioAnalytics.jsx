'use client'

import { useEffect, useMemo, useState } from 'react'

const signed = (value) => value == null ? '—' : `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`

function CurveChart({ portfolio, benchmark }) {
  const geometry = useMemo(() => {
    if (!portfolio.length) return null
    const width = 800
    const height = 250
    const inset = { top: 18, right: 18, bottom: 30, left: 48 }
    const values = [...portfolio, ...benchmark].map((point) => point.value)
    let low = Math.min(...values)
    let high = Math.max(...values)
    const padding = Math.max(2, (high - low) * 0.12)
    low -= padding
    high += padding
    const x = (index) => inset.left + (index / Math.max(1, portfolio.length - 1)) * (width - inset.left - inset.right)
    const y = (value) => inset.top + ((high - value) / Math.max(1, high - low)) * (height - inset.top - inset.bottom)
    const indexByDate = new Map(portfolio.map((point, index) => [point.time, index]))
    const path = (rows) => rows.map((point, index) => `${index ? 'L' : 'M'} ${x(indexByDate.get(point.time) ?? index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ')
    const ticks = [0, 0.5, 1].map((ratio) => ({
      value: high - ((high - low) * ratio),
      y: inset.top + ((height - inset.top - inset.bottom) * ratio),
    }))
    return { width, height, inset, portfolioPath: path(portfolio), benchmarkPath: path(benchmark), ticks }
  }, [portfolio, benchmark])

  if (!geometry) {
    return <div className="h-56 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>Publish a thesis to begin the portfolio history.</div>
  }

  const first = portfolio[0]?.time
  const last = portfolio.at(-1)?.time
  return (
    <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Portfolio and S&P 500 performance index" className="w-full h-auto">
      {geometry.ticks.map((tick) => (
        <g key={tick.y}>
          <line x1={geometry.inset.left} x2={geometry.width - geometry.inset.right} y1={tick.y} y2={tick.y} stroke="#E8E6DF" strokeDasharray="4 4" />
          <text x={geometry.inset.left - 8} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#8C8A82">{tick.value.toFixed(0)}</text>
        </g>
      ))}
      <path d={geometry.benchmarkPath} fill="none" stroke="#B8B5AC" strokeWidth="2" strokeDasharray="6 5" />
      <path d={geometry.portfolioPath} fill="none" stroke="#2D5F3F" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <text x={geometry.inset.left} y={geometry.height - 8} fontSize="10" fill="#8C8A82">{first}</text>
      <text x={geometry.width - geometry.inset.right} y={geometry.height - 8} textAnchor="end" fontSize="10" fill="#8C8A82">{last}</text>
    </svg>
  )
}

function ExposureBars({ title, rows }) {
  return (
    <div>
      <h3 className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>{title}</h3>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No active exposure.</p>}
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-xs mb-1">
              <span>{row.label}</span>
              <span className="font-mono" style={{ color: 'var(--ink-soft)' }}>{row.percentage.toFixed(1)}% · {row.count}</span>
            </div>
            <div className="h-1.5" style={{ background: 'var(--border)' }}>
              <div className="h-full" style={{ width: `${row.percentage}%`, background: 'var(--bull)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PortfolioAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/portfolio-analytics')
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Analytics unavailable')
        if (!cancelled) {
          setAnalytics(data)
          setStatus('ready')
        }
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [])

  const downloadCsv = () => {
    if (!analytics?.equityCurve?.length) return
    const benchmark = new Map(analytics.benchmarkCurve.map((point) => [point.time, point.value]))
    const lines = ['date,portfolio_index,portfolio_return_pct,sp500_index,sp500_return_pct']
    analytics.equityCurve.forEach((point) => {
      const bench = benchmark.get(point.time)
      lines.push([point.time, point.value.toFixed(2), (point.value - 100).toFixed(2), bench?.toFixed(2) || '', bench == null ? '' : (bench - 100).toFixed(2)].join(','))
    })
    const url = URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `theses-portfolio-history-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (status === 'loading') {
    return <section className="mb-10 p-6 border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>Calculating portfolio history…</section>
  }
  if (status === 'error') {
    return <section className="mb-10 p-6 border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>Portfolio history is temporarily unavailable. Your thesis records are unaffected.</section>
  }

  const { summary } = analytics
  const metrics = [
    ['Portfolio return', signed(summary.totalReturn), summary.totalReturn >= 0],
    ['S&P 500', signed(summary.benchmarkReturn), summary.benchmarkReturn != null && summary.benchmarkReturn >= 0],
    ['Alpha', signed(summary.alpha), summary.alpha != null && summary.alpha >= 0],
    ['Max drawdown', signed(summary.maxDrawdown), false],
  ]

  return (
    <section className="mb-10" aria-labelledby="portfolio-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 id="portfolio-analytics-title" className="font-serif text-xl font-medium">Portfolio Analytics</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {analytics.methodology}{analytics.coverage?.truncated ? ` Showing the latest ${analytics.coverage.included} of ${analytics.coverage.total} eligible theses.` : ''}
          </p>
        </div>
        <button type="button" onClick={downloadCsv} disabled={!analytics.equityCurve.length} className="btn-secondary text-xs px-3 py-2 rounded-md inline-flex items-center gap-2">
          <i className="icon-download text-xs" /> Export history
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: 'var(--border)' }}>
        {metrics.map(([label, value, positive]) => (
          <div key={label} className="p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
            <div className={`font-serif text-2xl ${positive ? 'ret-pos' : label === 'Max drawdown' || value.startsWith('-') ? 'ret-neg' : ''}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="border border-t-0 p-4 sm:p-6" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-5 text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
          <span className="inline-flex items-center gap-2"><span className="w-5 h-0.5" style={{ background: 'var(--bull)' }} />Portfolio</span>
          <span className="inline-flex items-center gap-2"><span className="w-5 border-t border-dashed" style={{ borderColor: '#B8B5AC' }} />S&P 500</span>
        </div>
        <CurveChart portfolio={analytics.equityCurve} benchmark={analytics.benchmarkCurve} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px border border-t-0" style={{ borderColor: 'var(--border)', background: 'var(--border)' }}>
        <div className="p-5" style={{ background: 'var(--bg)' }}><ExposureBars title="Sector exposure · active" rows={analytics.sectorExposure} /></div>
        <div className="p-5" style={{ background: 'var(--bg)' }}><ExposureBars title="Side exposure · active" rows={analytics.sideExposure} /></div>
        <div className="p-5" style={{ background: 'var(--bg)' }}>
          <h3 className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Closed-thesis hit rate</h3>
          <div className="space-y-2.5">
            {analytics.hitRates.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between text-xs border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                <span>{row.label}</span>
                <span className="font-mono" style={{ color: row.winRate == null ? 'var(--muted)' : 'var(--ink)' }}>
                  {row.winRate == null ? '—' : `${row.winRate}%`} <span style={{ color: 'var(--muted)' }}>({row.wins}/{row.theses})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
