import Sparkline from './Sparkline.jsx'

export default function ThesisCard({ thesis: t, variant = 'dashboard', onOpen }) {
  const retClass = t.ret >= 0 ? 'ret-pos' : 'ret-neg'
  const sign = t.ret >= 0 ? '+' : '−'
  const sideClass = t.side === 'bull' ? 'side-bull' : 'side-bear'
  const sideLabel = t.side === 'bull' ? 'BULL' : 'BEAR'

  const statusBadge = variant === 'profile'
    ? (t.status === 'closed'
      ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>CLOSED</span>
      : <span className="text-[10px] font-mono px-1.5 py-0.5 rounded pulse-dot" style={{ background: 'var(--bull-soft)', color: 'var(--bull)' }}>● ACTIVE</span>)
    : (t.status === 'closed'
      ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--ink-soft)' }}>CLOSED</span>
      : null)

  return (
    <div className="thesis-card rounded-md p-4 cursor-pointer" onClick={onOpen}>
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-20">
          <div className="font-mono text-sm font-semibold">{t.ticker}</div>
          <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>{t.daysActive}d</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{t.sector}</span>
            {statusBadge}
          </div>
          <div className="text-sm font-medium truncate">{t.title}</div>
          {variant === 'profile' && (
            <div className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>Published {t.publishDate} · {t.updates} updates</div>
          )}
        </div>
        <div className="flex-shrink-0">
          <Sparkline thesis={t} />
        </div>
        <div className="flex-shrink-0 text-right w-24">
          <div className={`font-mono text-lg font-semibold ${retClass}`}>{sign}{Math.abs(t.ret).toFixed(1)}%</div>
          <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>${t.entry} → ${t.current}</div>
        </div>
      </div>
    </div>
  )
}
