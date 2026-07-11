export default function PriceChart() {
  const days = 237
  const entry = 905.40
  const prices = [entry]
  const benchmark = [entry]
  let seed = 42
  for (let i = 1; i < days; i++) {
    seed = (seed * 9301 + 49297) % 233280
    const rand = (seed / 233280) - 0.5
    const trend = 0.0006
    const vol = 0.012
    prices.push(prices[i - 1] * (1 + trend + rand * vol))
    benchmark.push(benchmark[i - 1] * (1 + 0.00025 + ((seed % 100) / 100 - 0.5) * 0.008))
  }

  const w = 900, h = 320
  const padL = 60, padR = 20, padT = 20, padB = 30
  const cw = w - padL - padR
  const ch = h - padT - padB

  const allPrices = [...prices, ...benchmark]
  const min = Math.min(...allPrices) * 0.98
  const max = Math.max(...allPrices) * 1.02
  const range = max - min

  const x = i => padL + (i / (days - 1)) * cw
  const y = p => padT + (1 - (p - min) / range) * ch

  const pricePath = prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const benchPath = benchmark.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const areaPath = `${pricePath} L ${x(days - 1).toFixed(1)} ${y(min).toFixed(1)} L ${x(0).toFixed(1)} ${y(min).toFixed(1)} Z`

  const ticks = 5
  const yTicks = []
  for (let i = 0; i <= ticks; i++) {
    const val = min + (range * i / ticks)
    yTicks.push({ val, y: y(val) })
  }

  const xLabels = []
  const months = ['Mar 2024', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
  months.forEach((m, i) => {
    const dayIdx = Math.floor((i / (months.length - 1)) * (days - 1))
    xLabels.push({ label: m, x: x(dayIdx) })
  })

  return (
    <div id="price-chart" className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full price-chart" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2D5F3F" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2D5F3F" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <line key={`gl${i}`} className="grid-line" x1={padL} y1={t.y} x2={w - padR} y2={t.y} />
        ))}
        {yTicks.map((t, i) => (
          <text key={`yt${i}`} className="axis-text" x={padL - 8} y={t.y + 3} textAnchor="end">${t.val.toFixed(0)}</text>
        ))}
        {xLabels.map((l, i) => (
          <text key={`xl${i}`} className="axis-text" x={l.x} y={h - padB + 16} textAnchor="middle">{l.label}</text>
        ))}

        <path d={benchPath} fill="none" stroke="#B8B5AC" strokeWidth="1" strokeDasharray="3 3" />
        <path d={areaPath} fill="url(#priceGrad)" />
        <path d={pricePath} stroke="#1A1A17" strokeWidth="1.75" fill="none" />

        <line className="entry-line" x1={x(0)} y1={padT} x2={x(0)} y2={h - padB} />
        <circle cx={x(0)} cy={y(entry)} r="4" fill="#1A1A17" />
        <rect x={x(0) + 8} y={y(entry) - 22} width="78" height="18" fill="#1A1A17" />
        <text x={x(0) + 47} y={y(entry) - 9} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="white">ENTRY $905</text>

        <circle cx={x(days - 1)} cy={y(prices[days - 1])} r="4" fill="#2D5F3F" stroke="white" strokeWidth="2" />
        <rect x={x(days - 1) - 86} y={y(prices[days - 1]) - 22} width="78" height="18" fill="#2D5F3F" />
        <text x={x(days - 1) - 47} y={y(prices[days - 1]) - 9} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="white">NOW ${prices[days - 1].toFixed(0)}</text>
      </svg>
    </div>
  )
}
