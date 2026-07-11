'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  createSeriesMarkers,
  AreaSeries,
  LineSeries,
  LineStyle,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'

const ENTRY = 905.40
const DAYS = 237

// Deterministic price + benchmark series, seeded so the chart is stable
// across renders (matches the original prototype's generated data).
function buildSeries() {
  const prices = [ENTRY]
  const benchmark = [ENTRY]
  let seed = 42
  for (let i = 1; i < DAYS; i++) {
    seed = (seed * 9301 + 49297) % 233280
    const rand = (seed / 233280) - 0.5
    prices.push(prices[i - 1] * (1 + 0.0006 + rand * 0.012))
    benchmark.push(benchmark[i - 1] * (1 + 0.00025 + ((seed % 100) / 100 - 0.5) * 0.008))
  }

  // Map each index onto a calendar day starting at the publication date.
  const start = Date.UTC(2024, 2, 14) // Mar 14, 2024
  const dayMs = 86400000
  const price = []
  const bench = []
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start + i * dayMs)
    const time = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    price.push({ time, value: Number(prices[i].toFixed(2)) })
    bench.push({ time, value: Number(benchmark[i].toFixed(2)) })
  }
  return { price, bench }
}

export default function PriceChart() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#8C8A82',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#E8E6DF', style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: '#E8E6DF' },
      timeScale: { borderColor: '#E8E6DF', timeVisible: false, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#8C8A82', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1A1A17' },
        horzLine: { color: '#8C8A82', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1A1A17' },
      },
    })

    const { price, bench } = buildSeries()

    // Benchmark (S&P 500) — dashed, faint, drawn underneath.
    const benchSeries = chart.addSeries(LineSeries, {
      color: '#B8B5AC',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    benchSeries.setData(bench)

    // ASML price — dark line with a subtle green area fill.
    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: '#1A1A17',
      lineWidth: 2,
      topColor: 'rgba(45, 95, 63, 0.28)',
      bottomColor: 'rgba(45, 95, 63, 0)',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    priceSeries.setData(price)

    // Locked entry price reference line.
    priceSeries.createPriceLine({
      price: ENTRY,
      color: '#1A1A17',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'ENTRY',
    })

    const last = price[price.length - 1]
    createSeriesMarkers(priceSeries, [
      { time: price[0].time, position: 'belowBar', color: '#1A1A17', shape: 'circle', text: `ENTRY $${ENTRY.toFixed(0)}` },
      { time: last.time, position: 'aboveBar', color: '#2D5F3F', shape: 'circle', text: `NOW $${last.value.toFixed(0)}` },
    ])

    chart.timeScale().fitContent()

    return () => chart.remove()
  }, [])

  return <div ref={containerRef} className="relative" style={{ height: 320, width: '100%' }} />
}
