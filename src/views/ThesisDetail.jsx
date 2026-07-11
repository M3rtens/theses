import { useEffect, useState } from 'react'
import PriceChart from '../components/PriceChart.jsx'
import { fmtPrice } from '../lib/format.js'

// Shown while the live fetch is in flight or if it fails, so the view is
// never blank. Mirrors the original prototype numbers.
const FALLBACK = {
  company: 'ASML Holding N.V.',
  sector: 'Semiconductors',
  entry: 905.40, current: 1042.18, high: 1108.30, low: 872.10,
  ret: 15.1, spReturn: 6.2, alpha: 8.9,
  financials: {
    revenue: '€27.3B', grossProfit: '€13.8B', operatingIncome: '€8.9B', netIncome: '€7.0B',
    operatingMargin: '32.6%', cash: '€5.4B', totalDebt: '€2.1B', netCash: '+€3.3B',
  },
}

export default function ThesisDetail({ navigate }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/thesis?symbol=ASML&from=2024-03-14')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled && d && !d.error) setData(d) })
      .catch(() => { /* keep fallback values */ })
    return () => { cancelled = true }
  }, [])

  const d = data || {}
  const company = d.company ?? FALLBACK.company
  const sector = d.sector ?? FALLBACK.sector
  const entry = d.entry ?? FALLBACK.entry
  const current = d.current ?? FALLBACK.current
  const high = d.high ?? FALLBACK.high
  const low = d.low ?? FALLBACK.low
  const ret = d.ret ?? FALLBACK.ret
  const spReturn = d.spReturn ?? FALLBACK.spReturn
  const alpha = d.alpha ?? FALLBACK.alpha
  const currency = d.currency ?? 'USD'
  const fin = (k) => (d.financials && d.financials[k]) || FALLBACK.financials[k]

  const retClass = ret >= 0 ? 'ret-pos' : 'ret-neg'
  const retSign = ret >= 0 ? '+' : '−'
  const spSign = spReturn >= 0 ? '+' : '−'
  const alphaSign = alpha >= 0 ? '+' : '−'

  return (
    <>
      <header className="px-12 pt-6 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => navigate('dashboard')} className="hover:underline" style={{ color: 'var(--ink-soft)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Dashboard</button>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span style={{ color: 'var(--ink-soft)' }}>Active Theses</span>
            <span style={{ color: 'var(--faint)' }}>/</span>
            <span className="font-mono">ASML</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="seal"><i className="icon-fingerprint text-[11px]"></i> Locked Mar 14, 2024 · 09:32:14 EST</div>
          </div>
        </div>

        <div className="flex items-start justify-between gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-sm font-semibold">ASML</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{company}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{sector}</span>
              <span className="side-bull text-[10px] font-mono font-semibold px-2 py-0.5 rounded">BULL · LONG</span>
            </div>
            <h1 className="font-serif text-4xl font-medium tracking-tight leading-tight">ASML: The Monopoly Below the Surface</h1>
            <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
              <span>By <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Elena Vance</span></span>
              <span>·</span>
              <span className="font-mono">Published Mar 14, 2024</span>
              <span>·</span>
              <span>3 updates</span>
              <span>·</span>
              <span className="font-mono">237 days active</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Total Return</div>
            <div className={`font-serif text-5xl font-medium ${retClass}`}>{retSign}{Math.abs(ret).toFixed(1)}%</div>
            <div className="text-xs font-mono mt-1" style={{ color: 'var(--ink-soft)' }}>vs S&amp;P {spSign}{Math.abs(spReturn).toFixed(1)}% · Alpha {alphaSign}{Math.abs(alpha).toFixed(1)}pp</div>
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
                <span style={{ color: 'var(--ink-soft)' }}>ASML</span>
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
            <span className="font-mono pulse-dot" style={{ color: 'var(--bull)' }}>● LIVE · 16:32 EST</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <article className="font-serif text-[17px] leading-[1.75]" style={{ color: 'var(--ink)' }}>
              <h1 className="text-3xl font-medium mb-4">The Monopoly Below the Surface</h1>
              <p className="mb-4">ASML is the only company on earth capable of manufacturing extreme ultraviolet (EUV) lithography systems. This isn't a near-monopoly — it's a single-source chokepoint in the most strategic supply chain of the 21st century.</p>
              <h2 className="text-xl font-medium mt-6 mb-3">The Core Argument</h2>
              <p className="mb-4">The market prices ASML as a cyclical semiconductor equipment vendor. It is, in reality, a <strong>structural monopoly</strong> with three reinforcing moats:</p>
              <ul className="list-disc pl-6 mb-4 space-y-1">
                <li><strong>Technical impossibility of competition:</strong> Zeiss is the only optics partner capable of the required precision, and Zeiss is contractually locked to ASML.</li>
                <li><strong>20+ year development cycles:</strong> EUV took 17 years and €6B+ to commercialize. Next-generation High-NA is already shipping.</li>
                <li><strong>Captive customer base:</strong> TSMC, Samsung, and Intel cannot produce leading-edge chips without ASML's machines.</li>
              </ul>
              <h2 className="text-xl font-medium mt-6 mb-3">Why the Market is Wrong</h2>
              <p className="mb-4">Current multiples discount a cyclical downturn in 2025–2026. <em>They miss that the backlog has structurally re-rated.</em> The order book now extends through 2029, with non-cancellable deposits representing 41% of order value — up from 18% in 2021.</p>
              <blockquote className="border-l-2 pl-5 my-5 italic" style={{ borderColor: 'var(--ink)', color: 'var(--ink-soft)' }}>"If you want to bet against the entire semiconductor industry, short ASML. If you want to own the semiconductor industry, own ASML." — Analyst note, Morgan Stanley</blockquote>
              <h2 className="text-xl font-medium mt-6 mb-3">Path to $1,400</h2>
              <p className="mb-4">At 32x forward earnings — a discount to its 5-year average of 38x — ASML reaches $1,400 by 2026 under conservative assumptions:</p>
              <ol className="list-decimal pl-6 mb-4 space-y-1">
                <li>EUV shipment volume grows 18% CAGR through 2028</li>
                <li>Service revenue compounds at 12% (high-margin, recurring)</li>
                <li>High-NA pricing premium of 35% materializes</li>
              </ol>
              <p>The downside is protected by a non-cancellable backlog that exceeds two years of revenue.</p>
            </article>

            <div className="mt-12">
              <div className="flex items-baseline justify-between mb-5">
                <h3 className="font-serif text-xl font-medium">Thesis Updates</h3>
                <button className="text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 border rounded-md" style={{ borderColor: 'var(--border-strong)', background: 'transparent', cursor: 'pointer' }}>
                  <i className="icon-plus text-xs"></i> Append Update
                </button>
              </div>
              <div className="space-y-6">
                <div className="border-l-2 pl-5 pb-2 relative" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full" style={{ background: 'var(--ink)' }}></div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>Update #3</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>2 days ago · Nov 5, 2024</span>
                  </div>
                  <p className="text-sm leading-relaxed">Q4 backlog expanded to €36B, above consensus €32B. EUV shipments tracking at 62 units vs. guidance of 55. Gross margin held at 50.8% despite mix headwinds. Thesis intact; raising target from $1,400 to $1,480.</p>
                </div>
                <div className="border-l-2 pl-5 pb-2 relative" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full" style={{ background: 'var(--ink-soft)' }}></div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>Update #2</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>Jul 18, 2024</span>
                  </div>
                  <p className="text-sm leading-relaxed">Q2 earnings confirmed margin expansion thesis. Service revenue grew 14% YoY, accelerating from 11%. China revenue at 21% — approaching the 25% trigger threshold. Monitoring closely but no action yet.</p>
                </div>
                <div className="border-l-2 pl-5 pb-2 relative" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full" style={{ background: 'var(--ink-soft)' }}></div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>Update #1</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>Apr 22, 2024</span>
                  </div>
                  <p className="text-sm leading-relaxed">Q1 print reinforced the core thesis. Booked orders for 2026 delivery already exceed internal forecast by 18%. High-NA system installed at Intel ahead of schedule. No change to view.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="font-serif text-base font-medium mb-3">Trigger Monitor</h4>
              <div className="space-y-2">
                <div className="p-3 border rounded" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider trigger-clear">● CLEAR</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Monitored live</span>
                  </div>
                  <p className="text-xs leading-snug">Gross margin falls below 45%</p>
                  <div className="flex justify-between mt-1.5 text-[10px] font-mono">
                    <span style={{ color: 'var(--muted)' }}>Current: <span className="trigger-clear font-semibold">50.8%</span></span>
                    <span style={{ color: 'var(--muted)' }}>Trigger: &lt;45%</span>
                  </div>
                </div>
                <div className="p-3 border rounded" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider trigger-clear">● CLEAR</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Annual</span>
                  </div>
                  <p className="text-xs leading-snug">EUV shipments &lt; 40 units annually</p>
                  <div className="flex justify-between mt-1.5 text-[10px] font-mono">
                    <span style={{ color: 'var(--muted)' }}>Current: <span className="trigger-clear font-semibold">62</span></span>
                    <span style={{ color: 'var(--muted)' }}>Trigger: &lt;40</span>
                  </div>
                </div>
                <div className="p-3 border-2 rounded" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider trigger-warning">▲ WARNING</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--warn)' }}>84% to breach</span>
                  </div>
                  <p className="text-xs leading-snug">China revenue exceeds 25% of total</p>
                  <div className="flex justify-between mt-1.5 text-[10px] font-mono">
                    <span style={{ color: 'var(--ink-soft)' }}>Current: <span className="trigger-warning font-semibold">21%</span></span>
                    <span style={{ color: 'var(--ink-soft)' }}>Trigger: &gt;25%</span>
                  </div>
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'white' }}>
                    <div className="h-full" style={{ width: '84%', background: 'var(--warn)' }}></div>
                  </div>
                </div>
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
                <div className="flex justify-between"><span>Created:</span><span>Mar 14, 2024 · 09:31:02</span></div>
                <div className="flex justify-between"><span>Published:</span><span>Mar 14, 2024 · 09:32:14</span></div>
                <div className="flex justify-between"><span>Entry locked:</span><span>{fmtPrice(entry, currency)} @ 09:32:14</span></div>
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
