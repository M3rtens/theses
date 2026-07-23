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
  PriceScaleMode,
} from 'lightweight-charts'
import { currencySymbol, isPence } from '../lib/format.js'

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

// Compare a lightweight-charts {year,month,day} to a 'YYYY-MM-DD' string.
const timeToNum = (t) => t.year * 10000 + t.month * 100 + t.day
const isoToNum = (iso) => Number(iso.slice(0, 4)) * 10000 + Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10))

export default function PriceChart({ history, benchmark, entry, currency, publishTime }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Prefer real data passed in; otherwise fall back to the seeded series so
    // the chart still renders standalone or if the fetch failed.
    const fallback = buildSeries()
    const hasReal = Array.isArray(history) && history.length > 0
    // Pence-quoted lines (GBp) are scaled to pounds so the axis, entry line and
    // markers all read in £ — consistent with the price labels elsewhere.
    const scale = hasReal && isPence(currency) ? 0.01 : 1
    const rescale = (pts) => (scale === 1 ? pts : pts.map((p) => ({ ...p, value: p.value * scale })))
    const priceData = rescale(hasReal ? history : fallback.price)
    const benchData = rescale(
      Array.isArray(benchmark) && benchmark.length > 0 ? benchmark : (hasReal ? [] : fallback.bench),
    )
    const entryVal = entry != null ? entry * scale : priceData[0].value

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
      // Logarithmic so the benchmark stays visible over long windows: a stock
      // that compounds far more than the index would otherwise flatten the index
      // line against the axis on a linear scale.
      rightPriceScale: { borderColor: '#E8E6DF', mode: PriceScaleMode.Logarithmic },
      timeScale: { borderColor: '#E8E6DF', timeVisible: false, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#8C8A82', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1A1A17' },
        horzLine: { color: '#8C8A82', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1A1A17' },
      },
    })

    // Benchmark (S&P 500) — dashed, faint, drawn underneath.
    if (benchData.length) {
      const benchSeries = chart.addSeries(LineSeries, {
        color: '#B8B5AC',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      benchSeries.setData(benchData)
    }

    // ASML price — dark line with a subtle green area fill.
    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: '#1A1A17',
      lineWidth: 2,
      topColor: 'rgba(45, 95, 63, 0.28)',
      bottomColor: 'rgba(45, 95, 63, 0)',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    priceSeries.setData(priceData)

    // Locked entry price reference line.
    priceSeries.createPriceLine({
      price: entryVal,
      color: '#1A1A17',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'ENTRY',
    })

    const cur = currencySymbol(currency)
    const last = priceData[priceData.length - 1]

    // Mark where the thesis was published. When a window extends before
    // publication (5Y/All), the marker lands mid-chart rather than at the edge.
    // publishTime is null when publication falls outside the window (the caller
    // guards this), so no marker is drawn in that case.
    const pubNum = publishTime ? isoToNum(publishTime) : null
    const pubIdx = pubNum == null ? -1 : priceData.findIndex((p) => timeToNum(p.time) >= pubNum)
    const pubBar = pubIdx === -1 ? null : priceData[pubIdx]

    // A marker attached directly to priceSeries would sit on the historical
    // daily close, even when the sealed publication entry was intraday or came
    // from an independently locked quote. Anchor publication to a one-point
    // invisible series so both its date and displayed price are exact.
    if (pubBar) {
      const publicationSeries = chart.addSeries(LineSeries, {
        color: 'rgba(0, 0, 0, 0)',
        lineVisible: false,
        pointMarkersVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      publicationSeries.setData([{ time: pubBar.time, value: entryVal }])
      createSeriesMarkers(publicationSeries, [
        {
          time: pubBar.time,
          position: 'belowBar',
          color: '#1A1A17',
          shape: 'arrowUp',
          text: `PUBLISHED ${cur}${entryVal.toFixed(0)}`,
        },
      ])
    }

    const priceMarkers = []
    // Add a NOW marker unless it would sit on the same bar as publication.
    if (!pubBar || last.time !== pubBar.time) {
      priceMarkers.push({ time: last.time, position: 'aboveBar', color: '#2D5F3F', shape: 'circle', text: `NOW ${cur}${last.value.toFixed(0)}` })
    }
    createSeriesMarkers(priceSeries, priceMarkers)

    chart.timeScale().fitContent()

    return () => chart.remove()
  }, [history, benchmark, entry, currency, publishTime])

  return <div ref={containerRef} className="price-chart-container relative" />
}
