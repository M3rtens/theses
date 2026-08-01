'use client'

import { useMemo } from 'react'
import { buildModelChartData } from '../lib/charts.js'

const WIDTH = 720
const HEIGHT = 330
const PLOT = { left: 62, right: 18, top: 24, bottom: 54 }
const SERIES_COLORS = ['var(--viz-series-1, #315f72)', 'var(--viz-series-2, #9b5f3d)', 'var(--viz-series-3, #6f7542)', 'var(--viz-series-4, #755b82)', 'var(--viz-series-5, #a17624)', 'var(--viz-series-6, #4f7771)']

const formatValue = (value) => {
  const absolute = Math.abs(value)
  if (absolute >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (absolute >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (absolute >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export default function ModelChart({ chart, model, className = '' }) {
  const data = useMemo(() => buildModelChartData(model, chart), [chart, model])
  if (data.error) return <div className={`model-chart-empty ${className}`} role="status">{data.error}</div>

  const values = data.series.flatMap((series) => series.values).filter((value) => value != null)
  let minimum = Math.min(...values)
  let maximum = Math.max(...values)
  if (chart.type === 'bar' || minimum >= 0) minimum = Math.min(0, minimum)
  if (maximum <= 0) maximum = Math.max(0, maximum)
  if (minimum === maximum) maximum = minimum + 1
  const span = maximum - minimum
  const plotWidth = WIDTH - PLOT.left - PLOT.right
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom
  const x = (index) => PLOT.left + (data.categories.length === 1 ? plotWidth / 2 : index * plotWidth / (data.categories.length - 1))
  const y = (value) => PLOT.top + (maximum - value) * plotHeight / span
  const zeroY = y(Math.max(minimum, Math.min(maximum, 0)))
  const ticks = Array.from({ length: 5 }, (_, index) => maximum - (span * index / 4))
  const categoryStep = plotWidth / Math.max(data.categories.length, 1)
  const barWidth = Math.min(42, categoryStep * 0.72 / data.series.length)
  const labelStep = Math.max(1, Math.ceil(data.categories.length / 8))
  const description = `${chart.type} chart with ${data.series.length} series and ${data.categories.length} categories.`

  return (
    <figure className={`model-chart ${className}`}>
      <figcaption>
        <span>{chart.title}</span>
        <small>{chart.sheet} · {chart.range}</small>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${chart.title}. ${description}`}>
        <title>{chart.title}</title>
        <desc>{description}</desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="model-chart-grid" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y(tick)} y2={y(tick)} />
            <text className="model-chart-axis-label" x={PLOT.left - 10} y={y(tick) + 4} textAnchor="end">{formatValue(tick)}</text>
          </g>
        ))}
        <line className="model-chart-axis" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={zeroY} y2={zeroY} />
        {data.categories.map((category, index) => (
          index % labelStep === 0 || index === data.categories.length - 1
            ? <text key={`${category}-${index}`} className="model-chart-axis-label" x={x(index)} y={HEIGHT - 24} textAnchor="middle">{String(category).slice(0, 12)}</text>
            : null
        ))}
        {chart.yAxisLabel && <text className="model-chart-axis-title" transform={`translate(16 ${PLOT.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">{chart.yAxisLabel}</text>}

        {chart.type === 'bar' && data.series.flatMap((series, seriesIndex) => series.values.map((value, index) => value == null ? null : (
          <rect
            key={`${series.name}-${seriesIndex}-${index}`}
            x={x(index) - (data.series.length * barWidth / 2) + seriesIndex * barWidth}
            y={Math.min(y(value), zeroY)}
            width={Math.max(2, barWidth - 2)}
            height={Math.max(1, Math.abs(zeroY - y(value)))}
            fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
          ><title>{series.name}: {formatValue(value)} ({data.categories[index]})</title></rect>
        )))}

        {chart.type !== 'bar' && data.series.map((series, seriesIndex) => {
          const points = series.values.map((value, index) => value == null ? null : { px: x(index), py: y(value), value, category: data.categories[index] }).filter(Boolean)
          const path = points.map(({ px, py }, index) => `${index ? 'L' : 'M'} ${px} ${py}`).join(' ')
          const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]
          return <g key={`${series.name}-${seriesIndex}`}>
            {chart.type === 'area' && points.length > 1 && <path d={`${path} L ${points.at(-1).px} ${zeroY} L ${points[0].px} ${zeroY} Z`} fill={color} opacity="0.14" />}
            <path className="model-chart-line" d={path} stroke={color} />
            {points.map(({ px, py, value, category }) => <circle key={`${category}-${px}`} cx={px} cy={py} r="3.5" fill={color}><title>{series.name}: {formatValue(value)} ({category})</title></circle>)}
          </g>
        })}
      </svg>
      {chart.showLegend !== false && data.series.length > 1 && <div className="model-chart-legend" aria-label="Chart legend">
        {data.series.map((series, index) => <span key={`${series.name}-${index}`}><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{series.name}</span>)}
      </div>}
    </figure>
  )
}
