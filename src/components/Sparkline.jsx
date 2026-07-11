function sparklinePath(t) {
  const points = 20
  const start = 16
  const end = 16 - (t.ret / 30) * 12
  const path = []
  let seed = t.id * 7
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 80
    const progress = i / (points - 1)
    const base = start + (end - start) * progress
    seed = (seed * 9301 + 49297) % 233280
    const noise = ((seed / 233280) - 0.5) * 6
    const y = Math.max(2, Math.min(30, base + noise))
    path.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return path.join(' ')
}

export default function Sparkline({ thesis }) {
  const color = thesis.ret >= 0 ? '#2D5F3F' : '#8B2C2C'
  return (
    <svg className="sparkline" width="80" height="32" viewBox="0 0 80 32">
      <path d={sparklinePath(thesis)} stroke={color} />
    </svg>
  )
}
