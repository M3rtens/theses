'use client'

import { useMemo, useState } from 'react'
import { buildModelChartData, CHART_TYPES, createChartDefinition, normalizeChartRange } from '../lib/charts.js'
import ModelChart from './ModelChart.jsx'

export default function ChartBuilder({ model, charts, selectedRange, onChange, onInsert, showToast }) {
  const sheets = useMemo(() => Array.isArray(model?.sheets)
    ? model.sheets.filter((sheet) => !sheet.hidden)
    : model?.rows ? [{ name: 'Sheet1', model }] : [], [model])
  const [selectedId, setSelectedId] = useState(charts[0]?.id || null)
  const [editing, setEditing] = useState(() => charts[0] || createChartDefinition({ sheet: sheets[0]?.name || '' }))
  const selected = charts.find((chart) => chart.id === selectedId) || null

  const selectChart = (chart) => {
    setSelectedId(chart?.id || null)
    setEditing(chart ? { ...chart } : createChartDefinition({ sheet: sheets[0]?.name || '' }))
  }

  const saveChart = (insert = false) => {
    const range = normalizeChartRange(editing.range)
    if (!editing.title.trim()) return showToast('Give the chart a title.')
    if (!editing.sheet || !range) return showToast('Choose a sheet and enter a range such as A1:E3.')
    const next = { ...editing, title: editing.title.trim(), range }
    const preview = buildModelChartData(model, next)
    if (preview.error) return showToast(preview.error)
    onChange(selected
      ? charts.map((chart) => chart.id === selected.id ? next : chart)
      : [...charts, next])
    setSelectedId(next.id)
    setEditing(next)
    if (insert) onInsert(next)
    else showToast(selected ? 'Chart changes saved.' : 'Chart saved with this model.')
  }

  const removeChart = () => {
    if (!selected) return
    onChange(charts.filter((chart) => chart.id !== selected.id), selected.id)
    selectChart(null)
  }

  if (!sheets.length) {
    return <div className="p-10 border border-dashed rounded-md text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
      <i className="icon-chart-no-axes-column text-xl" style={{ color: 'var(--faint)' }}></i>
      <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>Add data in the Model tab before creating a chart.</p>
    </div>
  }

  return <div className="chart-builder">
    <aside className="chart-builder-list" aria-label="Saved charts">
      <button type="button" className={!selected ? 'active' : ''} onClick={() => selectChart(null)}><i className="icon-plus" />New chart</button>
      {charts.map((chart) => <button type="button" key={chart.id} className={selected?.id === chart.id ? 'active' : ''} onClick={() => selectChart(chart)}>
        <i className="icon-chart-no-axes-column" /><span>{chart.title}</span><small>{chart.sheet} · {chart.range}</small>
      </button>)}
    </aside>

    <section className="chart-builder-main">
      <div className="chart-builder-fields">
        <label>Chart title<input value={editing.title} maxLength={100} onChange={(event) => setEditing((current) => ({ ...current, title: event.target.value }))} /></label>
        <label>Chart type<select value={editing.type} onChange={(event) => setEditing((current) => ({ ...current, type: event.target.value }))}>{CHART_TYPES.map((type) => <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>)}</select></label>
        <label>Sheet<select value={editing.sheet} onChange={(event) => setEditing((current) => ({ ...current, sheet: event.target.value }))}>{sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label>
        <label>Cell range<input value={editing.range} placeholder="A1:E3" onChange={(event) => setEditing((current) => ({ ...current, range: event.target.value.toUpperCase() }))} /></label>
        <label>Y-axis label<input value={editing.yAxisLabel} maxLength={40} placeholder="Optional" onChange={(event) => setEditing((current) => ({ ...current, yAxisLabel: event.target.value }))} /></label>
      </div>
      <div className="chart-builder-options">
        <label><input type="checkbox" checked={editing.firstRowLabels !== false} onChange={(event) => setEditing((current) => ({ ...current, firstRowLabels: event.target.checked }))} /> First row contains category labels</label>
        <label><input type="checkbox" checked={editing.firstColumnSeries !== false} onChange={(event) => setEditing((current) => ({ ...current, firstColumnSeries: event.target.checked }))} /> First column contains series names</label>
        <label><input type="checkbox" checked={editing.showLegend !== false} onChange={(event) => setEditing((current) => ({ ...current, showLegend: event.target.checked }))} /> Show legend</label>
        {selectedRange && <button type="button" className="chart-range-selection" onClick={() => setEditing((current) => ({ ...current, sheet: selectedRange.sheet, range: selectedRange.range }))}>Use model selection: {selectedRange.sheet}!{selectedRange.range}</button>}
      </div>

      <div className="chart-builder-preview"><ModelChart chart={editing} model={model} /></div>

      <div className="chart-builder-actions">
        {selected
          ? <>
              <button type="button" className="danger" onClick={removeChart}>Delete chart</button>
              <button type="button" className="secondary" onClick={() => saveChart(false)}>Save changes</button>
              <button type="button" onClick={() => saveChart(true)}>Save and insert</button>
            </>
          : <button type="button" onClick={() => saveChart(false)}>Save chart</button>}
      </div>
    </section>
  </div>
}
